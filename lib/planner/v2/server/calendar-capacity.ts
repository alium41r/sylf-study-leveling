import { readPlanningCalendar, CalendarPlanningIncomplete } from "../../../calendar/planning";
import { addDays, eventsOnDate, localTimeToISO } from "../../../calendar/dates";
import { TimezoneService } from "../../../timezone-service";
import { ExecutionTaskSpecV2Schema, type PlannerAttemptV2 } from "../contracts";
import { loadPlannerInterviewContext } from "../intelligence/context";
import { allocateCalendarReservations, existingCapacityProof } from "../intelligence/allocator";
import { CalendarCapacitySchema, usableStudyWindows, type CalendarReservation } from "../intelligence/foundation/calendar";
import { CapacityResultSchema, type CapacityResult, type FoundationArtifact } from "../intelligence/foundation/contracts";
import { artifactRef, archiveDigest } from "../intelligence/foundation/validation";
import { SchedulingEnvelopeSchema } from "../intelligence/schemas/scheduling";
import { AllocationFactsSchema } from "../intelligence/schemas/planning";
import { AttemptService, loadAttempt, type LeaseToken } from "./attempts";
import { PlannerFoundationService, loadAttemptArtifacts } from "./foundation";
import { contextInputDigest, liveExecution, contentDigest, externalActivityAlias, mondayIndex, hasOpenRemainingWork } from "./context";
import { ownedDocumentMetadata } from "./documents";
import { hash, reject, clock, rows, type Sql } from "./database";

type Research = Extract<FoundationArtifact, { kind: "DOSSIER" }> & { value: { schemaVersion: 2 } };
type RealCapacity=Extract<FoundationArtifact,{kind:"CAPACITY"}>&{value:CapacityResult};
const minuteISO = (date: string, minute: number, zone: string) => minute === 1440
  ? TimezoneService.getStartOfLocalDateUTC(zone, addDays(date, 1)).toISOString()
  : localTimeToISO(date, `${Math.floor(minute / 60)}`.padStart(2, "0") + ":" + `${minute % 60}`.padStart(2, "0"), zone);

/** Clock movement is not a newly granted permission or changed source. Only
 * these unchanged owned inputs permit recapture after an initial capture races
 * its own live check; a real Calendar mutation still requires explicit refresh. */
function sameCapacitySources(before:CapacityResult,after:CapacityResult){
  const sources=(v:CapacityResult)=>v.calendar?.sources.map(({ref,versionDigest,includedInPlanning,complete})=>({ref,versionDigest,includedInPlanning,complete}));
  return before.status==="READY"&&after.status==="READY"&&before.research.digest===after.research.digest&&
    hash("capacity-clock-input",{window:before.window,context:before.contextDigests,sources:sources(before)})===hash("capacity-clock-input",{window:after.window,context:after.contextDigests,sources:sources(after)});
}

/** Step 4 is a deterministic stage of the existing leased compiler. Capacity
 * evidence authorizes no exact appointments, Quest edits or publication. */
export class PlannerCalendarCapacity {
  constructor(readonly attempts: AttemptService) {}
  private async capture(sql: Sql, attempt: PlannerAttemptV2, research: Research, now: Date, lockPlans = true, windowAsOf: Date = now): Promise<CapacityResult> {
    const run = research.value.understanding;
    const requested = attempt.targets.map((t, i) => ({ planId: t.planId, planRef: `plan_${i + 1}`, intentId: t.resolvedIntentVersionId! }));
    // The context owner chooses account-wide availability. A selected Plan may
    // retain an older local preference; it cannot override that civil clock.
    const zone = (run.input.context as { timezone?: string; envelope?: { timezone?: string } }).envelope?.timezone ??
      (run.input.context as { timezone?: string }).timezone;
    if (!zone) reject("INVALID_OUTPUT", "Research timezone correspondence is unavailable.", "PREFLIGHT");
    const today = TimezoneService.getUserLocalDate(zone, now), window = { start: today, end: addDays(today, 27) };
    const projection = await loadPlannerInterviewContext(sql, attempt.ownerId, requested, window, { maxBytes: 4 * 1024 * 1024, historyExamples: 0 }, lockPlans);
    const context = projection.contexts[0].context, contextDigests = projection.contexts.map(c => contextInputDigest(c.context.dependencies));
    if (hash("capacity-contexts", contextDigests) !== hash("capacity-contexts", run.input.contextDigests)) reject("STALE_CONTEXT", "Learning, accepted availability or protected execution changed after research. Continue explicitly with refreshed research.", "PREFLIGHT");
    for (const source of run.sources) if (source.source.location.kind === "OWNED_DOCUMENT") {
      const current = await ownedDocumentMetadata(sql, attempt.ownerId, source.source.location.documentId);
      if (current.contentHash !== source.source.contentHash) reject("STALE_CONTEXT", "Research material changed before capacity capture.", "PREFLIGHT");
    }
    const reasons: string[] = [], availability = context.globalAvailability, studyWindows = availability?.studyWindows;
    if (!availability || !studyWindows) reasons.push("Accept study windows in your study timezone before relying on available study time. Calendar display hours are not accepted study windows.");
    if (context.legacyExceptions.length || context.requiresReestimate || projection.view.runningSessions.some(s => s.state === "UNKNOWN_LEGACY_TIMER")) reasons.push("Resolve unknown task durations, reviewed remaining estimates or an older running timer before allocating study time.");
    const selected = new Map(attempt.targets.map((t, i) => [t.planId, `plan_${i + 1}`]));
    const specs = new Map(context.quests.filter(q => q.plannerSpec).map(q => [q.id, ExecutionTaskSpecV2Schema.parse(q.plannerSpec)]));
    const taskKey = (questId: number) => { const spec = specs.get(questId); return spec && selected.has(spec.planId) ? `${selected.get(spec.planId)}/${spec.blueprintActivityId}` : `quest_${questId}`; };
    const reservations: CalendarReservation[] = [];
    for (const quest of context.quests) {
      if (!hasOpenRemainingWork(quest)) continue;
      const spec = specs.get(quest.id), live = spec ? liveExecution(quest, context.sessions) : null;
      if (spec && selected.has(spec.planId) && live?.state === "UNSTARTED") continue;
      const minutes = live?.remainingMinutesEstimate ?? Math.max(1, Math.ceil(quest.requiredMinutes - quest.elapsedSeconds / 60));
      if (quest.scheduledFor < window.start) { reasons.push(`Reschedule unfinished work before planning: “${quest.title.slice(0, 200)}” (${minutes} min, due ${quest.scheduledFor}). Its remaining time still needs a place in your calendar.`); continue; }
      if (quest.scheduledFor > window.end) continue;
      const targetIntent = spec && selected.has(spec.planId) ? run.input.plans.find(p => p.planRef === selected.get(spec.planId))?.intent : null;
      if (targetIntent?.deadline.kind === "FIXED" && (quest.scheduledFor > targetIntent.deadline.date || quest.scheduledFor === targetIntent.deadline.date && !targetIntent.deadline.examDayStudyAllowed)) reasons.push("Protected work conflicts with the accepted hard deadline. An explicit constraint decision is required.");
      if (Number.isSafeInteger(minutes) && minutes > 0) reservations.push({ key: taskKey(quest.id), date: quest.scheduledFor, minutes, after: [] });
    }
    for (const quest of context.quests) {
      const reservation = reservations.find(t => t.key === taskKey(quest.id)), spec = specs.get(quest.id);
      if (!reservation || !spec) continue;
      for (const ref of spec.content.hardDependencies) {
        const before = context.quests.find(q => specs.get(q.id)?.activityKey === ref);
        if (before?.status === "COMPLETED") continue;
        const prerequisite = before && reservations.find(t => t.key === taskKey(before.id));
        if (!prerequisite || prerequisite.date > reservation.date) reasons.push("An existing commitment depends on unfinished work without an available earlier placement. Preserve that dependency for an explicit allocation decision.");
        else reservation.after.push(prerequisite.key);
      }
    }
    let calendar: CapacityResult["calendar"] = null, incomplete = false;
    try {
      const read = await readPlanningCalendar(sql, attempt.ownerId, window.start, addDays(window.end, 1), context.timezone, now);
      if (read.sources.some(s => !s.complete)) { incomplete = true; reasons.push("An included external calendar is disconnected, has pending changes, or lacks fresh complete cached coverage. Sync it in Calendar before relying on capacity."); }
      const nextMinute = Math.ceil(windowAsOf.getTime() / 60000) * 60000;
      const days = projection.view.actuals.map(day => {
        const override = studyWindows?.overrides.find(o => o.date === day.date);
        const accepted = override?.windows ?? studyWindows?.weekly.filter(w => w.weekday === mondayIndex(day.date)) ?? [];
        const approved = accepted.flatMap(w => {
          const rawStart = Date.parse(minuteISO(day.date, w.startMinute, context.timezone));
          const start = day.date === today ? Math.max(rawStart, nextMinute) : rawStart;
          const end = Date.parse(minuteISO(day.date, w.endMinute, context.timezone));
          return start < end ? [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }] : [];
        });
        const events = eventsOnDate(read.events, day.date, context.timezone).filter(e => e.external?.busy !== false);
        const start = TimezoneService.getStartOfLocalDateUTC(context.timezone, day.date).getTime(), end = TimezoneService.getStartOfLocalDateUTC(context.timezone, addDays(day.date, 1)).getTime();
        return { date: day.date, approved, busy: events.filter(e => !e.allDay).map(e => ({ start: new Date(Math.max(start, Date.parse(e.startsAt!))).toISOString(), end: new Date(Math.min(end, Date.parse(e.endsAt!))).toISOString() })),
          allDayBlocked: events.some(e => e.allDay), excluded: context.restDays.includes((mondayIndex(day.date) + 1) % 7) || context.floatingDates.includes(day.date) || !!availability?.restWeekdays.includes(mondayIndex(day.date)) || !!availability?.blockedDates.includes(day.date) };
      });
      if (days.some(d => d.busy.length > 1000)) throw new CalendarPlanningIncomplete("The complete Calendar range exceeds the retained interval envelope; choose a smaller range before relying on capacity.");
      const endOfToday = TimezoneService.getStartOfLocalDateUTC(context.timezone, addDays(today, 1)).getTime();
      const sourceFresh = read.sources.filter(s => s.complete).map(s => Date.parse(s.freshUntil));
      calendar = CalendarCapacitySchema.parse({ schemaVersion: 1, timezone: context.timezone, intentDigest: hash("capacity-accepted-availability-v1", { availability, version: context.availabilityIntentVersionId }),
        acceptedWindowsDigest: studyWindows ? hash("accepted-study-windows-v1", studyWindows) : null, capturedAt: windowAsOf.toISOString(),
        validUntil: new Date(Math.min(endOfToday, windowAsOf.getTime() + 2 * 3600000, ...sourceFresh)).toISOString(),
        policy: { tentative: "BLOCK", allDay: "BLOCK_DATE", transparent: "IGNORE", unavailable: "NEEDS_DECISION" },
        sources: read.sources.map(s => ({ ref: s.ref, versionDigest: hash("calendar-planning-source-v1", s.version), includedInPlanning: true, complete: s.complete, freshUntil: s.freshUntil })), days });
    } catch (error) {
      if (!(error instanceof CalendarPlanningIncomplete) && !(error instanceof Error && error.message.includes("clocks change"))) throw error;
      reasons.push(error.message); incomplete = error instanceof CalendarPlanningIncomplete;
    }
    const currentnessDigest = hash("calendar-capacity-input-v1", { window, contextDigests, sources: calendar?.sources.map(({ ref, versionDigest, complete }) => ({ ref, versionDigest, complete })), days: calendar?.days, reservations, reasons });
    const base = { schemaVersion: 2 as const, research: artifactRef(research), previous: null, version: 1, window, currentnessDigest, contextDigests, calendar };
    if (reasons.length || !calendar || !projection.view.envelope) return CapacityResultSchema.parse({ ...base, status: incomplete ? "INCOMPLETE" : "NEEDS_DECISION", constraints: null, facts: null, allocation: null, workloadProof: null, reasons: [...new Set(reasons)] });
    const free = usableStudyWindows(calendar, windowAsOf.getTime());
    if (free.status !== "KNOWN") reject("STALE_CONTEXT", "Calendar capacity is not current.", "PREFLIGHT");
    const protectedExecution = projection.view.envelope.protectedExecution.map(p => {
      const quest = projection.registry.find(r => r.ref === p.activityRef), spec = quest && specs.get(quest.questId);
      if (!spec) reject("PROTECTED_EXECUTION", "Protected Calendar correspondence is unavailable.", "PREFLIGHT");
      return { ...p, activityRef: spec.blueprintActivityId };
    });
    const allocation = allocateCalendarReservations(calendar, reservations);
    const constraints = SchedulingEnvelopeSchema.parse({ ...projection.view.envelope, capacityDigest: currentnessDigest, protectedExecution,
      calendar: { schemaVersion: 1, snapshot: calendar, reservations }, days: projection.view.envelope.days.map(d => {
        const physical = Math.floor((free.days.find(day => day.date === d.date)?.windows ?? []).reduce((n, w) => n + (w.end - w.start) / 60000, 0));
        const calendarAvailableMinutes = Math.max(0, physical - reservations.filter(t => t.date === d.date).reduce((n, t) => n + t.minutes, 0) - d.recoveryMinutes);
        return { ...d, calendarAvailableMinutes, availableMinutes: Math.min(d.availableMinutes, calendarAvailableMinutes) };
      }) });
    const facts = AllocationFactsSchema.parse({ weeks: projection.view.weeks, pins: protectedExecution.map(p => ({ ...p, alreadyReserved: true })),
      externalActivities: [...specs].map(([id, spec]) => { const q = context.quests.find(q => q.id === id)!; return { ref: externalActivityAlias(spec.activityKey), date: q.scheduledFor, available: q.status === "COMPLETED" || q.remainingDisposition === "OPEN", contentDigest: contentDigest(spec), ...(reservations.some(t => t.key === taskKey(id)) ? { reservationKey: taskKey(id) } : {}) }; }),
      preferences: run.input.plans.map(p => ({ planRef: p.planRef, pacing: p.intent.preferences.pacing, ...(p.intent.preferences.maximumTimeboxMinutes ? { maximumTimeboxMinutes: p.intent.preferences.maximumTimeboxMinutes } : {}) })) });
    const workloadProof = existingCapacityProof(constraints, facts);
    return CapacityResultSchema.parse({ ...base, constraints, facts, allocation, workloadProof, status: workloadProof ? "CAPACITY_SHORTFALL" : allocation.status === "FEASIBLE" ? "READY" : allocation.status,
      reasons: workloadProof ? [workloadProof.explanation] : allocation.status === "FEASIBLE" ? [] : [allocation.proof?.explanation ?? "The bounded joint interval search did not establish a feasible allocation. This is not a proven capacity shortage."] });
  }
  async run(token: LeaseToken, signal: AbortSignal) {
    return this.retain(token, signal);
  }
  /** Explicit deterministic refresh after Calendar/time changes. It spends
   * nothing, keeps the research/intent and appends both new versions atomically.
   * Authored strategy must first enter later role-routed full revalidation;
   * Step 4 never rebinds an existing role response to a new capacity result. */
  async refresh(token: LeaseToken, expected: { id: string; digest: string }, signal: AbortSignal) {
    return this.retain(token, signal, expected);
  }
  /** Step 5 only: keep the completed author's original input binding and require
   * a new translation/allocation checkpoint with complete graph revalidation.
   * Public refresh and any uncertain/reserved response stay fenced. */
  async revalidateLearning(token: LeaseToken, expected: { id: string; digest: string }, causedBy: { id: string; digest: string }, signal: AbortSignal) {
    return this.retain(token, signal, expected, causedBy);
  }
  /** Complete-journey revalidation preserves the historical assessment. The
   * caller must reallocate and obtain a new full review before READY. */
  async revalidateReviewed(token:LeaseToken,expected:{id:string;digest:string},assessment:{id:string;digest:string},signal:AbortSignal){
    return this.retain(token,signal,expected,undefined,assessment);
  }
  private async retain(token: LeaseToken, signal: AbortSignal, refresh?: { id: string; digest: string }, causedBy?: { id: string; digest: string }, assessment?:{id:string;digest:string}):Promise<RealCapacity> {
    signal.throwIfAborted();
    // A serializable retry cannot silently replace this operation's original
    // as-of evidence. Retain it, then let the separate live check report change.
    let frozenCapture:CapacityResult|undefined;
    const result = await this.attempts.mutate(token, async (sql, attempt, payload, now) => {
      const retained = await loadAttemptArtifacts(sql, attempt.ownerId, attempt.attemptId);
      if (retained.compilerVersion !== 2 || !attempt.budget.aiFirst) reject("INTENT_CONFLICT", "Calendar capacity requires admitted compiler v2 research.", "PREFLIGHT");
      const research = Object.values(retained.archive.entries).find(a => a.kind === "DOSSIER" && a.value.schemaVersion === 2) as Research | undefined;
      if (!research) reject("QUALITY_INCOMPLETE", "Complete verified research before capturing capacity.", "PREFLIGHT");
      const capacities = Object.values(retained.archive.entries).filter(a => a.kind === "CAPACITY" && a.value.schemaVersion === 2);
      const prior = capacities.find(a => !capacities.some(next => next.kind === "CAPACITY" && next.value.schemaVersion === 2 && next.value.previous?.id === a.id));
      if (refresh && (!prior || prior.digest !== refresh.digest || prior.id !== refresh.id)) reject("STALE_CONTEXT", "Refresh must extend the exact current capacity version.", "PREFLIGHT");
      const replayWindowAsOf = !refresh && prior?.kind === "CAPACITY" && prior.value.schemaVersion === 2 && prior.value.calendar ? new Date(prior.value.calendar.capturedAt) : now;
      const value = structuredClone(frozenCapture??=await this.capture(sql, attempt, research, now, true, replayWindowAsOf));
      if (prior?.kind === "CAPACITY" && prior.value.schemaVersion === 2) {
        const changed = prior.value.currentnessDigest !== value.currentnessDigest || prior.value.calendar && (Date.parse(prior.value.calendar.validUntil) <= now.getTime() || usableStudyWindows(prior.value.calendar, now.getTime()).status !== "KNOWN");
        if (!changed) return prior;
        if (!refresh) reject("STALE_CONTEXT", "Retained capacity changed or expired. Explicitly refresh it; historical capacity cannot be rebound.", "PREFLIGHT");
        const pendingEducation = await rows(sql, `SELECT id FROM "AiUsageLog" WHERE "userId"=$1 AND "attemptId"=$2 AND
          reservation->'roleCall'->>'role' IN ('STRATEGIST','TRANSLATOR','REVIEWER') AND "accountingState"<>'CANCELLED_BEFORE_DISPATCH' LIMIT 1`, [attempt.ownerId, attempt.attemptId]);
        if(assessment){
          const review=retained.archive.entries[assessment.id],checkpoints=Object.values(retained.archive.entries).filter(a=>a.kind==="CHECKPOINT"),head=checkpoints.find(a=>!checkpoints.some(n=>n.value.previous?.id===a.id));
          let bound=false;let cursor:FoundationArtifact|undefined=prior;
          while(cursor?.kind==="CAPACITY"&&cursor.value.schemaVersion===2){
            if(head?.value.schemaVersion===3&&cursor.digest===head.value.learning.capacity.digest){bound=true;break;}
            cursor=cursor.value.previous?retained.archive.entries[cursor.value.previous.id]:undefined;
          }
          const pending=head?.value.schemaVersion===3?head.value.learning.call:null;
          const retainedPending=pending&&(await rows(sql,'SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->\'roleCall\'->>\'key\'=$2 LIMIT 1',[attempt.attemptId,pending.key])).length>0;
          if(payload.resourcePolicy?.journeyVersion!==1||review?.kind!=="REVIEW"||review.digest!==assessment.digest||review.value.schemaVersion!==2||head?.value.schemaVersion!==3||
            retainedPending||head.value.workflow.assessment?.digest!==review.digest||!bound)
            reject("QUALITY_INCOMPLETE","Reviewed Calendar revalidation requires the exact settled full assessment and current checkpoint.","PREFLIGHT");
          if((await rows(sql,`SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1 AND "accountingState" IN ('RESERVED','DISPATCHED','UNKNOWN_SPEND') LIMIT 1`,[attempt.attemptId])).length)
            reject("QUALITY_INCOMPLETE","Reconcile pending or uncertain roles before invalidating their Calendar inputs.","PREFLIGHT");
        } else if (causedBy) {
          const author = retained.archive.entries[causedBy.id];
          if (!author || author.digest !== causedBy.digest || !["STRATEGY", "TRANSLATION"].includes(author.kind) || author.value.schemaVersion !== 2 ||
            !Object.values(retained.archive.entries).some(a => a.kind === "CHECKPOINT" && a.value.schemaVersion !== 1 && (a.value.learning.strategy?.id === author.id || a.value.learning.translation?.id === author.id))) reject("REFERENCE_NOT_OWNED", "Calendar revalidation needs its exact complete retained author response.", "PREFLIGHT");
          if ((await rows(sql, `SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->'roleCall'->>'role' IN ('STRATEGIST','TRANSLATOR','REVIEWER') AND
            ("accountingState" IN ('RESERVED','DISPATCHED','UNKNOWN_SPEND') OR reservation->'roleCall'->>'role'='REVIEWER') LIMIT 1`, [attempt.attemptId])).length || Object.values(retained.archive.entries).some(a => a.kind === "REVIEW")) reject("QUALITY_INCOMPLETE", "Uncertain authorship or independent review requires its later explicit revalidation boundary.", "PREFLIGHT");
        } else if (pendingEducation.length || Object.values(retained.archive.entries).some(a => ["STRATEGY", "TRANSLATION", "REVIEW"].includes(a.kind))) reject("QUALITY_INCOMPLETE", "Reserved or authored education requires complete role-routed revalidation before using refreshed capacity.", "PREFLIGHT");
        value.previous = artifactRef(prior); value.version = prior.value.version + 1;
      }
      signal.throwIfAborted();
      const foundation = new PlannerFoundationService(this.attempts);
      const saved = await foundation.appendAccepted(sql, attempt, payload, now, token, archiveDigest(retained.archive), "CAPACITY", value);
      if (value.status === "READY") {
        const { understanding: _understanding, ...original } = research.value; void _understanding;
        await foundation.appendAccepted(sql, attempt, payload, now, token, saved.digest, "DOSSIER", { ...original, schemaVersion: 3, research: artifactRef(research), capacity: artifactRef(saved.artifact),
          calendarDigest: hash("ai-first-calendar-v1", value.calendar), constraintsDigest: hash("ai-first-constraints-v1", value.constraints) });
      }
      return saved.artifact;
    });
    if (result.kind !== "CAPACITY" || result.value.schemaVersion !== 2) throw new Error("CAPACITY_VERSION_REQUIRED");
    const captured=result.value;
    if (result.value.status === "READY")try{await this.assertCurrent(token.ownerId, token.attemptId, artifactRef(result));}catch(error){
      if(!(error instanceof Error)||!("detail" in error)||(error as {detail:{code:string}}).detail.code!=="STALE_CONTEXT")throw error;
      const current=await this.attempts.observe(token,async(sql,attempt,_payload,now)=>{
        const read=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);if(read.compilerVersion!==2)throw new Error("CAPACITY_VERSION_REQUIRED");
        const research=read.archive.entries[captured.research.id] as Research;return this.capture(sql,attempt,research,now,false);
      });
      if(!sameCapacitySources(result.value,current))throw error;
      // Preserve both historical versions. The same author/review barriers and
      // original lease/deadline apply to this deterministic recapture too.
      return this.retain(token,signal,artifactRef(result),causedBy,assessment);
    }
    if (result.value.status === "NEEDS_DECISION" || result.value.status === "CAPACITY_SHORTFALL") await this.attempts.needsDecision(token, result.value.reasons[0]);
    return result as RealCapacity;
  }
  /** Live check is deliberately distinct from immutable historical reading.
   * Future strategy dispatch/publication/apply must call it at their boundary. */
  async assertCurrent(ownerId: number, attemptId: string, ref: { id: string; digest: string }, asOf?: Date) {
    return this.attempts.db.observed(ownerId,sql=>this.assertCurrentAccepted(sql,ownerId,attemptId,ref,false,asOf));
  }
  async assertCurrentAccepted(sql:Sql,ownerId:number,attemptId:string,ref:{id:string;digest:string},lockPlans=true,asOf?:Date){
      const retained = await loadAttemptArtifacts(sql, ownerId, attemptId), { attempt } = await loadAttempt(sql, ownerId, attemptId,lockPlans);
      if (retained.compilerVersion !== 2) reject("INVALID_OUTPUT", "Compiler v2 capacity required.", "PREFLIGHT");
      const capacity = retained.archive.entries[ref.id];
      if (capacity?.kind !== "CAPACITY" || capacity.digest !== ref.digest || capacity.value.schemaVersion !== 2) reject("REFERENCE_NOT_OWNED", "Retained capacity is unavailable.");
      const now = asOf ?? await clock(sql), value = capacity.value, research = retained.archive.entries[value.research.id] as Research;
      const capturedAt = value.calendar ? new Date(value.calendar.capturedAt) : now;
      if (!value.calendar || value.status !== "READY" || Date.parse(value.calendar.validUntil) <= now.getTime() || usableStudyWindows(value.calendar, now.getTime()).status !== "KNOWN" || (await this.capture(sql, attempt, research, now, lockPlans, capturedAt)).currentnessDigest !== value.currentnessDigest) reject("STALE_CONTEXT", "Calendar, learning, permissions or protected execution changed; capture a new explicitly linked operation.", "PREFLIGHT");
      return capacity;
  }
}
