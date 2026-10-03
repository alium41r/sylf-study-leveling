import { randomUUID } from "node:crypto";
import {
  PlanChangeSetV2Schema, ExecutionTaskSpecV2Schema, validateChangeSetCorrespondenceV2, validateSealedDiffCorrespondenceV2,
  validateProtectedExecutionChange, type ApplyReceiptV2, type ExecutionTaskSpecV2,
} from "../contracts";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "../../../difficulty-engine";
import { PlannerDatabase, rows, clock, reject, type Sql } from "./database";
import { loadAttempt, persistAttempt, assertAttemptCurrent } from "./attempts";
import { ownedPlan, loadIntent } from "./intents";
import { loadRevision } from "./revisions";
import { loadExecutionContext, liveExecution, verifyPlacement, verifyContextCorrespondence, specDigest, contentDigest } from "./context";
import { verifyExecutionGraph } from "./execution-validation";

export type ApplyBoundary = "goal" | "quest" | "link" | "pointer" | "receipt";
export const descriptionForSpec = (spec: ExecutionTaskSpecV2): string => `${spec.content.instructions}\n\nDone when: ${spec.content.completionCriterion}`;
const pointer = (spec: ExecutionTaskSpecV2 | null) => spec ? { spec, specDigest: specDigest(spec), contentDigest: contentDigest(spec) } : null;
interface LinkRow { id: string; planId: string; itemKey: string; questId: number | null; disposition: string; baseline: unknown; baselineSpecDigest: string | null }
interface SpecWrite { spec: ExecutionTaskSpecV2; subjectId: number | null; questId: number | null; started: boolean; description?: string | null }
export class ApplyService {
  constructor(readonly db: PlannerDatabase, private readonly boundary?: (boundary: ApplyBoundary, sql: Sql) => Promise<void>) {}
  async apply(ownerId: number, request: { attemptId: string; changeSetId: string; acknowledgements: string[] }): Promise<ApplyReceiptV2> {
    return this.db.coordinated(ownerId, async sql => {
      const { attempt, payload } = await loadAttempt(sql, ownerId, request.attemptId);
      const changeSet = PlanChangeSetV2Schema.parse(payload.changeSet);
      if (changeSet.changeSetId !== request.changeSetId) reject("IDEMPOTENCY_MISMATCH", "This confirmation belongs to a different proposal.", "APPLY");
      if (attempt.applyReceipt) return attempt.applyReceipt;
      await assertAttemptCurrent(sql, attempt);
      const revisions = [];
      for (const target of changeSet.targets) revisions.push(await loadRevision(sql, ownerId, target.revisionId));
      const errors = validateChangeSetCorrespondenceV2(changeSet, attempt, revisions);
      if (errors.length) reject("INVALID_OUTPUT", errors.join("; "), "APPLY");
      const required = new Set([...changeSet.quality.requiredAcknowledgements, ...revisions.flatMap(revision => revision.quality.requiredAcknowledgements)]);
      if ([...required].some(id => !request.acknowledgements.includes(id))) reject("QUALITY_BLOCKED", "A consequential warning still needs acknowledgment.", "APPLY");
      const plans = [];
      for (const target of [...changeSet.targets].sort((a, b) => a.planId.localeCompare(b.planId))) {
        const plan = await ownedPlan(sql, ownerId, target.planId);
        if (plan.latestDraftRevisionId !== target.revisionId) reject("STALE_CONTEXT", "A newer reviewed candidate replaced this proposal.", "APPLY");
        plans.push(plan);
      }
      const targets = [];
      for (const plan of plans) targets.push({ plan, intent: (await loadIntent(sql, ownerId, plan.workingIntentVersionId!)).intent, specs: revisions.find(revision => revision.planId === plan.id)!.executable });
      // Execution locks follow Plan/Attempt; a simultaneous Focus start must serialize here.
      await sql.query('SELECT id FROM "StudySession" WHERE "userId"=$1 ORDER BY id FOR UPDATE', [ownerId]);
      await sql.query('SELECT id FROM "Quest" WHERE "userId"=$1 ORDER BY id FOR UPDATE', [ownerId]);
      const context = await loadExecutionContext(sql, ownerId, plans, targets[0].intent);
      for (const revision of revisions) {
        const ownContext = await loadExecutionContext(sql, ownerId, plans, targets.find(target => target.plan.id === revision.planId)!.intent);
        verifyContextCorrespondence(revision.context, ownContext.dependencies, ownContext.quests);
      }
      const links = await rows<LinkRow>(sql, 'SELECT * FROM "PlannerQuestLink" WHERE "planId"=ANY($1::uuid[]) ORDER BY "planId","itemKey" FOR UPDATE', [plans.map(plan => plan.id)]);
      const before = new Map<string, ExecutionTaskSpecV2>();
      for (const plan of plans) {
        if (plan.activeRevisionId) {
          const row = (await rows<{ v2Artifact: unknown }>(sql, 'SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=$1', [plan.activeRevisionId]))[0];
          if (row.v2Artifact) for (const spec of (await loadRevision(sql, ownerId, plan.activeRevisionId)).executable) before.set(spec.activityKey, spec);
          else {
            // Reviewed legacy adoption records the actual live specification, never a fabricated quality pass.
            const migration = plan.migrationEvidence as { baselineSpecs?: unknown[] } | null;
            for (const raw of migration?.baselineSpecs ?? []) { const spec = ExecutionTaskSpecV2Schema.parse(raw); before.set(spec.activityKey, spec); }
          }
        }
      }
      const after = new Map(revisions.flatMap(revision => revision.executable.map(spec => [spec.activityKey, spec] as const)));
      const keys = new Set([...before.keys(), ...after.keys()]);
      if (keys.size !== changeSet.entries.length || changeSet.entries.some(entry => !keys.has(entry.activityKey))) reject("INVALID_OUTPUT", "The diff must cover the exact whole proposal.", "APPLY");
      for (const entry of changeSet.entries) {
        const old = before.get(entry.activityKey) ?? null; const next = after.get(entry.activityKey) ?? null;
        const mismatch = validateSealedDiffCorrespondenceV2(entry, pointer(old), pointer(next));
        if (mismatch.length) reject("INVALID_OUTPUT", mismatch.join("; "), "APPLY");
        const link = links.find(link => link.itemKey === entry.activityKey);
        if (!old && link) reject("PROTECTED_EXECUTION", "A removed activity identity cannot be reused.", "APPLY");
        if (old) {
          const quest = context.quests.find(quest => quest.id === link?.questId);
          if (!quest || link?.disposition !== "LIVE") reject("STALE_CONTEXT", "A proposed activity no longer has live lineage.", "APPLY");
          const live = ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
          const migration = plans.find(plan => plan.id === old.planId)!.migrationEvidence as { legacyDescriptions?: Record<string, string | null>; baselineSpecs?: unknown[] } | null;
          const execution = liveExecution(quest, context.sessions);
          const imported = migration?.baselineSpecs?.map(spec => ExecutionTaskSpecV2Schema.parse(spec)).find(spec => spec.activityKey === old.activityKey);
          const importedDescription = imported && contentDigest(imported) === contentDigest(old) ? migration?.legacyDescriptions?.[old.activityKey] : undefined;
          const descriptionMatches = quest.description === descriptionForSpec(old) || importedDescription !== undefined && quest.description === importedDescription;
          if (specDigest(live) !== specDigest(old) || quest.plannerSpecDigest !== specDigest(old) || quest.title !== old.content.title ||
            !descriptionMatches || quest.scheduledFor !== old.placement.date ||
            quest.goalId !== old.goalId || quest.plannedMinutes !== old.effort.plannedMinutes || quest.requiredMinutes !== old.effort.plannedMinutes || quest.targetMinutes !== old.effort.plannedMinutes ||
            quest.remainingEstimateBasisActualSeconds !== old.effort.remainingEstimateBasisActualSeconds) reject("STALE_CONTEXT", "The reviewed baseline differs from live execution.", "APPLY");
          if (!entry.changes.includes("KEPT")) {
            const blocked = validateProtectedExecutionChange(old, next, execution, next ? "UPDATE" : execution.state === "UNSTARTED" ? "REMOVE" : "WITHDRAW");
            if (blocked.length) reject("PROTECTED_EXECUTION", blocked.join("; "), "APPLY");
          }
          const pinned = revisions.find(revision => revision.planId === old.planId)!.context.quests.find(item => item.questId === quest.id);
          if (!entry.changes.includes("KEPT") && pinned?.executionVersion !== quest.executionVersion) reject("PROTECTED_EXECUTION", "Execution changed since this proposal was reviewed.", "APPLY");
        }
      }
      verifyPlacement(context, targets);
      verifyExecutionGraph(context, revisions);
      await sql.query("SELECT set_config('sylf.planner_v2_apply_owner',$1,true)", [String(ownerId)]);
      for (const { plan, intent } of targets) if (!plan.goalId) {
        await sql.query('INSERT INTO "Goal" (id,"userId",title,description,"targetWeeks","targetDate") VALUES ($1,$2,$3,$4,1,$5)',
          [plan.reservedGoalId, ownerId, intent.title, intent.outcome, intent.deadline.kind === "NONE" ? null : intent.deadline.date + "T00:00:00Z"]);
        await sql.query('UPDATE "PlannerPlan" SET "goalId"=$2 WHERE id=$1', [plan.id, plan.reservedGoalId]);
      } else {
        const updated = await sql.query('UPDATE "Goal" SET title=$3,description=$4,"targetDate"=$5 WHERE id=$1 AND "userId"=$2 RETURNING id',
          [plan.goalId, ownerId, intent.title, intent.outcome, intent.deadline.kind === "NONE" ? null : intent.deadline.date + "T00:00:00Z"]);
        if (updated.rowCount !== 1) reject("REFERENCE_NOT_OWNED", "The execution goal disappeared.", "APPLY");
      }
      await this.boundary?.("goal", sql);
      const writes: SpecWrite[] = [];
      const additions: { spec: ExecutionTaskSpecV2; revisionId: string }[] = [];
      for (const entry of changeSet.entries) {
        if (entry.changes.includes("KEPT")) continue;
        const old = before.get(entry.activityKey); const next = after.get(entry.activityKey); const link = links.find(link => link.itemKey === entry.activityKey);
        const revision = revisions.find(revision => revision.planId === entry.planId)!;
        if (!next && old) {
          const quest = context.quests.find(quest => quest.id === link!.questId)!;
          if (liveExecution(quest, context.sessions).state === "UNSTARTED") {
            await sql.query('UPDATE "PlannerQuestLink" SET "questId"=NULL,disposition=\'DELETED\',"removedAt"=clock_timestamp(),"removalReason"=\'REVIEWED_REMOVE\',"updatedAt"=clock_timestamp() WHERE id=$1', [link!.id]);
            const deleted = await sql.query('DELETE FROM "Quest" WHERE id=$1 AND "userId"=$2 RETURNING id', [quest.id, ownerId]);
            if (deleted.rowCount !== 1) reject("STALE_CONTEXT", "The removed activity changed.", "APPLY");
          } else {
            const withdrawn = await sql.query('UPDATE "Quest" SET "remainingDisposition"=\'WITHDRAWN\',"remainingMinutesEstimate"=0,"executionVersion"="executionVersion"+1 WHERE id=$1 AND "userId"=$2 RETURNING id', [quest.id, ownerId]);
            if (withdrawn.rowCount !== 1) reject("STALE_CONTEXT", "The withdrawn activity changed.", "APPLY");
          }
        } else if (next) {
          const plan = plans.find(plan => plan.id === next.planId)!;
          const existing = context.quests.find(quest => quest.id === link?.questId);
          const started = existing ? liveExecution(existing, context.sessions).state !== "UNSTARTED" : false;
          // A started row retains its actual accepted description, including a
          // description rewritten while it was still unstarted after adoption.
          writes.push({ spec: next, subjectId: existing ? existing.subjectId : plan.subjectId, questId: link?.questId ?? null, started, description: started ? existing!.description : undefined });
          if (!old) {
            additions.push({ spec: next, revisionId: revision.revisionId });
          }
        }
      }
      const materialized = await this.writeSpecs(sql, ownerId, writes);
      if (additions.length) {
        const records = additions.map(({ spec, revisionId }) => ({ id: randomUUID(), planId: spec.planId, itemKey: spec.activityKey,
          questId: materialized.get(spec.activityKey)!, revisionId, baseline: spec, baselineSpecDigest: specDigest(spec) }));
        const inserted = await sql.query(`INSERT INTO "PlannerQuestLink" (id,"planId","itemKey","questId","createdRevisionId","appliedRevisionId",baseline,"baselineSpecDigest","updatedAt")
          SELECT r.id,r."planId",r."itemKey",r."questId",r."revisionId",r."revisionId",r.baseline,r."baselineSpecDigest",clock_timestamp()
          FROM jsonb_to_recordset($1::jsonb) AS r(id uuid,"planId" uuid,"itemKey" uuid,"questId" int,"revisionId" uuid,baseline jsonb,"baselineSpecDigest" text) RETURNING id`, [JSON.stringify(records)]);
        if (inserted.rowCount !== additions.length) reject("INVALID_OUTPUT", "The new lineage set was not materialized exactly.", "APPLY");
      }
      await this.boundary?.("quest", sql);
      for (const revision of revisions) await sql.query('UPDATE "PlannerQuestLink" SET "appliedRevisionId"=$2,"updatedAt"=clock_timestamp() WHERE "planId"=$1 AND disposition=\'LIVE\'', [revision.planId, revision.revisionId]);
      await this.boundary?.("link", sql);
      for (const revision of revisions) await sql.query('UPDATE "PlannerPlan" SET "activeRevisionId"=$2,"latestDraftRevisionId"=NULL,state=\'ACTIVE\',version=version+1,"updatedAt"=clock_timestamp() WHERE id=$1', [revision.planId, revision.revisionId]);
      await this.boundary?.("pointer", sql);
      const receipt: ApplyReceiptV2 = { receiptId: randomUUID(), changeSetId: changeSet.changeSetId, confirmedAt: (await clock(sql)).toISOString(),
        targets: revisions.map(revision => ({ planId: revision.planId, revisionId: revision.revisionId, revisionDigest: revision.digest })) };
      for (const revision of revisions) await sql.query('UPDATE "PlannerRevision" SET "confirmationKey"=$2,"confirmationHash"=$3,"confirmationReceipt"=$4,"confirmedAt"=$5,"updatedAt"=clock_timestamp() WHERE id=$1',
        [revision.revisionId, changeSet.changeSetId, attempt.requestHash, receipt, receipt.confirmedAt]);
      await persistAttempt(sql, attempt, { ...attempt, applyReceipt: receipt }, { ...payload, changeSet: { ...changeSet, applyReceipt: receipt } });
      await this.boundary?.("receipt", sql);
      return receipt;
    });
  }
  private async writeSpecs(sql: Sql, ownerId: number, writes: readonly SpecWrite[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const records = writes.map(write => {
      const spec = write.spec; const difficulty = calculateRecommendedDifficulty(spec.effort.plannedMinutes);
      const rewards = calculateQuestRewards(spec.effort.plannedMinutes, difficulty);
      return { id: write.questId, subjectId: write.subjectId, goalId: spec.goalId, title: spec.content.title,
        description: write.description !== undefined ? write.description : descriptionForSpec(spec), date: spec.placement.date,
        planned: spec.effort.plannedMinutes, remaining: spec.effort.remainingMinutesEstimate, basis: spec.effort.remainingEstimateBasisActualSeconds,
        spec, digest: specDigest(spec), difficulty, xp: rewards.xp, sylph: rewards.sylph, started: write.started };
    });
    const definition = 'id int,"subjectId" int,"goalId" int,title text,description text,date text,planned int,remaining int,basis int,spec jsonb,digest text,difficulty text,xp int,sylph int,started boolean';
    for (const existing of [false, true]) {
      const selected = records.filter(record => (record.id !== null) === existing); if (!selected.length) continue;
      const query = existing ? `UPDATE "Quest" q SET title=r.title,description=r.description,"scheduledFor"=r.date,
        "plannedMinutes"=r.planned,"targetMinutes"=r.planned,"requiredMinutes"=r.planned,"remainingMinutesEstimate"=r.remaining,
        "remainingEstimateBasisActualSeconds"=r.basis,"plannerSpec"=r.spec,"plannerSpecDigest"=r.digest,
        difficulty=CASE WHEN r.started THEN q.difficulty ELSE r.difficulty::"QuestDifficulty" END,
        "xpReward"=CASE WHEN r.started THEN q."xpReward" ELSE r.xp END,"sylphReward"=CASE WHEN r.started THEN q."sylphReward" ELSE r.sylph END,
        "executionVersion"=q."executionVersion"+1 FROM jsonb_to_recordset($1::jsonb) AS r(${definition})
        WHERE q.id=r.id AND q."userId"=$2 AND q."goalId"=r."goalId" AND q."subjectId" IS NOT DISTINCT FROM r."subjectId" RETURNING q.*` :
        `INSERT INTO "Quest" ("userId","goalId","subjectId",title,description,"scheduledFor","plannedMinutes","targetMinutes","requiredMinutes",
        "remainingMinutesEstimate","remainingEstimateBasisActualSeconds","plannerSpec","plannerSpecDigest",difficulty,"xpReward","sylphReward","createdByAi",status)
        SELECT $2,r."goalId",r."subjectId",r.title,r.description,r.date,r.planned,r.planned,r.planned,r.remaining,r.basis,r.spec,r.digest,r.difficulty::"QuestDifficulty",r.xp,r.sylph,true,'PENDING'
        FROM jsonb_to_recordset($1::jsonb) AS r(${definition}) RETURNING *`;
      const written = await rows<import("./context").QuestRow>(sql, query, [JSON.stringify(selected), ownerId]);
      if (written.length !== selected.length) reject("STALE_CONTEXT", "The activity set could not be materialized exactly once.", "APPLY");
      for (const quest of written) {
        const spec = ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
        const record = selected.find(record => record.spec.activityKey === spec.activityKey);
        if (!record || result.has(spec.activityKey) || specDigest(spec) !== record.digest || quest.plannerSpecDigest !== record.digest || quest.description !== record.description ||
          quest.title !== record.title || quest.scheduledFor !== record.date || quest.plannedMinutes !== record.planned || quest.targetMinutes !== record.planned || quest.requiredMinutes !== record.planned ||
          quest.remainingMinutesEstimate !== record.remaining || quest.remainingEstimateBasisActualSeconds !== record.basis) reject("INVALID_OUTPUT", "Materialized execution diverged from the reviewed specification.", "APPLY");
        result.set(spec.activityKey, quest.id);
      }
    }
    return result;
  }
}
