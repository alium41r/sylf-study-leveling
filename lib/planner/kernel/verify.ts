// Verifiers and critics. Hard verifiers gate every result: a plan that fails one never reaches the student. Critics score quality; a low score can
// trigger at most one revision. Both read the solver's output and the inputs it was given, never the model's account of what it did.
import { addDays, dayLabel, diffDays } from "./dates";
import { calibratedEstimate } from "./calibration";
import { applyWhatIf, capGroups, expandPractices, freeIntervals, isDayOff, isFixed, type SolveInput, type SolveResult } from "./solver";
import { SPACED_METHODS, SPACING_DAYS } from "./strategy";
import { blockMinutes, type Block, type PlanningSnapshot, type WorkModel } from "./contracts";

export type HardCode = "REFERENCE" | "OVERLAP_COMMITMENT" | "OVERLAP_BLOCK" | "OUTSIDE_AVAILABILITY" | "REST_DAY" | "DEPENDENCY_ORDER" | "DAILY_CAP" | "DEADLINE" | "TOTALS";
export interface HardFailure { code: HardCode; block: string | null; item: string | null; detail: string }
export type CriticCode = "realism" | "exam_prep" | "front_loading" | "interleaving" | "fragmentation" | "neglect";
export interface CriticScore { code: CriticCode; score: number; note: string }
export interface Verification { pass: boolean; failures: HardFailure[]; critics: CriticScore[]; quality: number; checks: number }

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export function verify(input: SolveInput, result: SolveResult): Verification {
  const { snapshot, model } = applyWhatIf(input.snapshot, input.model, input.whatIf);
  const failures: HardFailure[] = [];
  const items = new Map([...model.items, ...expandPractices(model, snapshot)].map((i) => [i.key, i]));
  const days = new Map(snapshot.days.map((d) => [d.date, d]));
  const fixedIds = new Set([...input.blocks.filter((b) => isFixed(b, snapshot)).map((b) => b.id), ...(result.kept ?? [])]);
  const live = result.blocks.filter((b) => b.state !== "missed" && b.state !== "skipped");
  const moving = live.filter((b) => !fixedIds.has(b.id));
  let checks = 0;

  // Reference integrity.
  for (const block of result.blocks) { checks++; if (!items.has(block.item)) failures.push({ code: "REFERENCE", block: block.id, item: block.item, detail: `Block ${block.id} names an unknown item.` }); }
  const ids = new Set<string>();
  for (const block of result.blocks) { if (ids.has(block.id)) failures.push({ code: "REFERENCE", block: block.id, item: block.item, detail: `Duplicate block id ${block.id}.` }); ids.add(block.id); }

  for (const block of moving) {
    const day = days.get(block.date);
    const item = items.get(block.item);
    checks += 5;
    if (!day) { failures.push({ code: "OUTSIDE_AVAILABILITY", block: block.id, item: block.item, detail: `${block.date} is outside the planning horizon.` }); continue; }
    if (block.end <= block.start || block.start % 5 || block.end % 5) failures.push({ code: "OUTSIDE_AVAILABILITY", block: block.id, item: block.item, detail: "Block times are not on the 5-minute grid." });
    if (isDayOff({ constraints: model.constraints }, day)) failures.push({ code: "REST_DAY", block: block.id, item: block.item, detail: `${dayLabel(block.date)} is a rest day.` });
    for (const busy of day.busy) if (overlaps(block, busy)) failures.push({ code: "OVERLAP_COMMITMENT", block: block.id, item: block.item, detail: `Overlaps ${busy.title} on ${dayLabel(block.date)}.` });
    const free = freeIntervals({ snapshot, constraints: model.constraints }, day, result.blocks.filter((b) => fixedIds.has(b.id)));
    if (!free.some(([a, b]) => block.start >= a && block.end <= b)) failures.push({ code: "OUTSIDE_AVAILABILITY", block: block.id, item: block.item, detail: `Outside free time on ${dayLabel(block.date)}.` });
    const due = item?.due ?? (item?.goal ? model.goals.find((g) => g.key === item.goal)?.due ?? null : null);
    if (due && due >= snapshot.today && block.date > due) failures.push({ code: "DEADLINE", block: block.id, item: block.item, detail: `Placed after its deadline ${dayLabel(due)}.` });
    if (item?.earliest && block.date < item.earliest && item.earliest > snapshot.today) failures.push({ code: "DEPENDENCY_ORDER", block: block.id, item: block.item, detail: `Placed before its earliest start ${dayLabel(item.earliest)}.` });
  }
  // No two blocks overlap.
  const byDate = new Map<string, Block[]>();
  for (const block of live) byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) { checks++; if (sorted[i].start < sorted[i - 1].end && !(fixedIds.has(sorted[i].id) && fixedIds.has(sorted[i - 1].id))) failures.push({ code: "OVERLAP_BLOCK", block: sorted[i].id, item: sorted[i].item, detail: `Two sessions overlap on ${dayLabel(date)}.` }); }
    // Daily caps, counting only what the solver placed on top of what the student fixed.
    const day = days.get(date);
    if (!day) continue;
    let cap = snapshot.settings.dailyCap;
    for (const c of model.constraints) if (c.kind === "daily_cap" && (!c.days?.length || c.days.includes(day.weekday))) cap = Math.min(cap, c.minutes);
    const placed = list.filter((b) => !fixedIds.has(b.id)).reduce((s, b) => s + blockMinutes(b), 0);
    const fixedMinutes = list.filter((b) => fixedIds.has(b.id)).reduce((s, b) => s + blockMinutes(b), 0) + (date === snapshot.today ? snapshot.studiedToday : 0) + (day.otherWork ?? 0);
    checks++;
    if (placed > 0 && placed + fixedMinutes > Math.max(cap, fixedMinutes)) failures.push({ code: "DAILY_CAP", block: null, item: null, detail: `${dayLabel(date)} plans ${placed + fixedMinutes} min against a cap of ${cap}.` });
    // Cap groups (a goal's or a subject's daily limit) count only what the solver placed.
    const { caps: groupCaps, groupOf, soloOf } = capGroups(model.constraints);
    for (const [group, minutes] of groupCaps) {
      const c = { minutes };
      checks++;
      const ofSubject = list.filter((b) => { const item = items.get(b.item); return item && groupOf(item) === group && b.state !== "done"; });
      // A sitting longer than the limit (a full paper) may take a day, alone.
      const solo = ofSubject.filter((b) => soloOf(items.get(b.item)!));
      if (solo.length) {
        // Work the student placed beside a full paper themselves stays where they put it; only the plan's own placements are held to this.
        const beside = ofSubject.filter((b) => b.item !== solo[0].item);
        if (beside.length && [...beside, ...solo].some((b) => !fixedIds.has(b.id))) failures.push({ code: "DAILY_CAP", block: null, item: solo[0].item, detail: `${dayLabel(date)} puts other work of one ${group.startsWith("g:") ? "plan" : "subject"} beside a sitting longer than its cap of ${c.minutes}.` });
        continue;
      }
      const placedSubject = ofSubject.filter((b) => !fixedIds.has(b.id)).reduce((s, b) => s + blockMinutes(b), 0);
      const fixedSubject = ofSubject.filter((b) => fixedIds.has(b.id)).reduce((s, b) => s + blockMinutes(b), 0);
      const subjectMinutes = placedSubject + fixedSubject;
      if (placedSubject > 0 && subjectMinutes > Math.max(c.minutes, fixedSubject)) failures.push({ code: "DAILY_CAP", block: null, item: null, detail: `${dayLabel(date)} plans ${subjectMinutes} min of one ${group.startsWith("g:") ? "plan" : "subject"} against its cap of ${c.minutes}.` });
    }
  }
  // Dependencies in order.
  const firstOf = new Map<string, Block>(); const lastOf = new Map<string, Block>();
  for (const block of [...live].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)) { if (!firstOf.has(block.item)) firstOf.set(block.item, block); lastOf.set(block.item, block); }
  for (const item of items.values()) {
    const first = firstOf.get(item.key);
    if (!first || fixedIds.has(first.id)) continue;
    for (const pred of item.after) {
      checks++;
      const last = lastOf.get(pred);
      const predItem = items.get(pred);
      if (!last || !predItem) continue;
      const spaced = SPACED_METHODS.includes(item.method) && predItem.topics.some((t) => item.topics.includes(t));
      const ok = spaced ? diffDays(first.date, last.date) >= SPACING_DAYS : first.date > last.date || (first.date === last.date && first.start >= last.end);
      if (!ok) failures.push({ code: "DEPENDENCY_ORDER", block: first.id, item: item.key, detail: `“${item.title}” starts before “${predItem.title}” is finished${spaced ? " and spaced" : ""}.` });
    }
  }
  // Totals: every demanded minute is placed, budgeted or reported unplaced.
  for (const demand of result.demand) {
    checks++;
    const placed = moving.filter((b) => b.item === demand.item).reduce((s, b) => s + blockMinutes(b), 0);
    const budget = result.weekBudgets.filter((w) => w.item === demand.item).reduce((s, w) => s + w.minutes, 0);
    const unplaced = result.unplaced.filter((u) => u.item === demand.item).reduce((s, u) => s + u.minutes, 0);
    if (Math.abs(placed + budget + unplaced - demand.minutes) > 5) failures.push({ code: "TOTALS", block: null, item: demand.item, detail: `“${demand.title}” accounts for ${placed + budget + unplaced} of ${demand.minutes} min.` });
  }
  // Deadlines: every unplaced minute with a deadline is reported as a shortage with numbers.
  for (const u of result.unplaced) {
    const item = items.get(u.item);
    if (!item || item.key.includes("@")) continue;
    const due = item.due ?? (item.goal ? model.goals.find((g) => g.key === item.goal)?.due ?? null : null);
    checks++;
    if (due && !result.shortages.some((s) => s.due >= (due < snapshot.today ? snapshot.today : due) || s.items.includes(u.item))) failures.push({ code: "DEADLINE", block: null, item: u.item, detail: `${u.minutes} min of “${item.title}” do not fit and are not reported.` });
  }

  const critics = critique(input, result);
  const quality = Math.round(critics.reduce((s, c) => s + c.score * WEIGHTS[c.code], 0) / critics.reduce((s, c) => s + WEIGHTS[c.code], 0));
  return { pass: failures.length === 0, failures, critics, quality, checks };
}

const WEIGHTS: Record<CriticCode, number> = { realism: 3, exam_prep: 3, front_loading: 2, interleaving: 1, fragmentation: 1, neglect: 2 };

export function critique(input: SolveInput, result: SolveResult): CriticScore[] {
  const { snapshot, model } = applyWhatIf(input.snapshot, input.model, input.whatIf);
  const items = new Map([...model.items, ...expandPractices(model, snapshot)].map((i) => [i.key, i]));
  const live = result.blocks.filter((b) => b.state !== "missed" && b.state !== "skipped" && b.state !== "done");
  const out: CriticScore[] = [];

  // Realism: planned minutes a day against sustainable capacity.
  // The solver may fill a day up to sustainable × 1.15 + 15 minutes; only days beyond that are unrealistic.
  const heavy = result.days.filter((d) => !d.rest && d.planned > Math.round((d.sustainable * 1.15 + 15) / 5) * 5);
  out.push({ code: "realism", score: Math.max(0, 100 - heavy.length * 18), note: heavy.length ? `${heavy.length} day${heavy.length === 1 ? "" : "s"} above what you usually sustain.` : "Every day is within what you usually sustain." });

  // Exam preparation: two retrievals per topic at least two days apart, light review the day before, no new topics in the final day.
  const exams = model.goals.filter((g) => g.status === "active" && g.type === "exam" && g.due && g.due >= snapshot.today);
  if (exams.length) {
    let score = 100; const notes: string[] = [];
    for (const exam of exams) {
      const own = [...items.values()].filter((i) => i.goal === exam.key);
      // The share of the exam's topics that get two retrieval sessions at least two days apart. A broad session covers every topic it names.
      const topics = [...new Set(own.flatMap((i) => i.topics))];
      const retrievals = own.filter((i) => SPACED_METHODS.includes(i.method) || i.method === "timed_paper");
      if (diffDays(exam.due!, snapshot.today) >= 4) {
        if (!topics.length) {
          const dates = live.filter((b) => retrievals.some((i) => i.key === b.item)).map((b) => b.date).sort();
          if (dates.length < 2 || diffDays(dates[dates.length - 1], dates[0]) < SPACING_DAYS) { score -= 40; notes.push("fewer than two spaced retrieval sessions"); }
        } else {
          let short = 0;
          for (const topic of topics) {
            const dates = live.filter((b) => { const i = items.get(b.item); return i && i.goal === exam.key && (i.topics.includes(topic) || (i.method === "timed_paper" && !i.topics.length)) && (SPACED_METHODS.includes(i.method) || i.method === "timed_paper"); }).map((b) => b.date).sort();
            const done = own.filter((i) => i.topics.includes(topic) && SPACED_METHODS.includes(i.method) && i.status === "done").length;
            if (!(dates.length + done >= 2 && (done > 0 || diffDays(dates[dates.length - 1], dates[0]) >= SPACING_DAYS))) short++;
          }
          if (short) { score -= Math.round((50 * short) / topics.length); notes.push(`${short} of ${topics.length} topics have fewer than two spaced retrievals`); }
        }
      }
      const before = addDays(exam.due!, -1);
      if (before >= snapshot.today && !live.some((b) => b.date === before && items.get(b.item)?.goal === exam.key)) { score -= 10; notes.push(`no light review on ${dayLabel(before)}`); }
      if (live.some((b) => { const i = items.get(b.item); return i?.goal === exam.key && (i.kind === "learn") && b.date >= before; })) { score -= 25; notes.push("new learning in the final day"); }
    }
    out.push({ code: "exam_prep", score: Math.max(0, score), note: notes.length ? [...new Set(notes)].join("; ") : "Spaced retrieval and a light review before each exam." });
  } else out.push({ code: "exam_prep", score: 100, note: "No exams in view." });

  // Front-loading: with p80 estimates, deadline work should finish with a day to spare.
  let late = 0; let deadlines = 0;
  for (const item of items.values()) {
    if (item.status !== "open" || item.key.includes("@")) continue;
    const due = item.due ?? (item.goal ? model.goals.find((g) => g.key === item.goal)?.due ?? null : null);
    if (!due || due < snapshot.today) continue;
    const last = live.filter((b) => b.item === item.key).map((b) => b.date).sort().at(-1);
    if (!last) continue;
    deadlines++;
    const [p50, p80] = calibratedEstimate(item, snapshot.calibration);
    if (last >= due && p80 > p50) late++;
  }
  out.push({ code: "front_loading", score: deadlines ? Math.round(100 - (late / deadlines) * 60) : 100, note: late ? `${late} item${late === 1 ? "" : "s"} finish on the due date with no room to run long.` : "Deadline work finishes with room to spare." });

  // Interleaving: back-to-back practice on the same subject.
  let repeats = 0; let pairs = 0;
  const byDate = new Map<string, Block[]>();
  for (const block of live) byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const a = items.get(sorted[i - 1].item); const b = items.get(sorted[i].item);
      if (!a || !b || a.kind !== "practice" || b.kind !== "practice") continue;
      pairs++; if (a.subject === b.subject && a.subject != null) repeats++;
    }
  }
  out.push({ code: "interleaving", score: pairs ? Math.round(100 - (repeats / pairs) * 50) : 100, note: repeats ? "Some practice sits back to back on one subject." : "Practice is mixed across subjects." });

  // Fragmentation: sittings well below their ideal length.
  const short = live.filter((b) => { const i = items.get(b.item); return i && blockMinutes(b) < i.chunk[1] * 0.6; }).length;
  out.push({ code: "fragmentation", score: live.length ? Math.round(100 - (short / live.length) * 70) : 100, note: short ? `${short} session${short === 1 ? " is" : "s are"} much shorter than ideal.` : "Sessions are a workable length." });

  // Neglect: active goals with work but nothing scheduled.
  const neglected = result.risks.filter((r) => r.kind === "neglected").length;
  out.push({ code: "neglect", score: Math.max(0, 100 - neglected * 30), note: neglected ? `${neglected} goal${neglected === 1 ? " has" : "s have"} nothing scheduled.` : "Every active goal has time." });
  return out;
}

/**
 * Re-checks a reviewed plan's placements against a newer snapshot before it is committed: still in the future, inside free time, off rest days,
 * clear of commitments and of each other, and within daily caps. An empty list means the plan can be applied exactly as the student saw it.
 */
export function checkPlacement(snapshot: PlanningSnapshot, model: WorkModel, blocks: readonly Block[], current: readonly Block[]): HardFailure[] {
  const failures: HardFailure[] = [];
  const fixed = current.filter((b) => isFixed(b, snapshot));
  const fixedIds = new Set(fixed.map((b) => b.id));
  const days = new Map(snapshot.days.map((d) => [d.date, d]));
  const movable = blocks.filter((b) => !fixedIds.has(b.id) && (b.state === "proposed" || b.state === "committed"));
  for (const block of movable) {
    if (block.date < snapshot.today || (block.date === snapshot.today && block.start < snapshot.nowMinute)) {
      // A block that has slipped into the past while under review: committing it would plan in the past.
      if (block.date >= snapshot.today || blocks.some((b) => b.id === block.id && b.state === "proposed")) failures.push({ code: "OUTSIDE_AVAILABILITY", block: block.id, item: block.item, detail: "This session's time has passed." });
      continue;
    }
    const day = days.get(block.date);
    if (!day) { failures.push({ code: "OUTSIDE_AVAILABILITY", block: block.id, item: block.item, detail: "Outside the planning horizon." }); continue; }
    if (isDayOff({ constraints: model.constraints }, day)) failures.push({ code: "REST_DAY", block: block.id, item: block.item, detail: `${dayLabel(block.date)} is now a rest day.` });
    const free = freeIntervals({ snapshot, constraints: model.constraints }, day, fixed);
    if (!free.some(([a, b]) => block.start >= a && block.end <= b)) failures.push({ code: "OVERLAP_COMMITMENT", block: block.id, item: block.item, detail: `No longer free on ${dayLabel(block.date)}.` });
  }
  const byDate = new Map<string, Block[]>();
  for (const block of movable) byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) failures.push({ code: "OVERLAP_BLOCK", block: sorted[i].id, item: sorted[i].item, detail: `Two sessions overlap on ${dayLabel(date)}.` });
  }
  return failures;
}
