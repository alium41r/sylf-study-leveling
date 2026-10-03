import { PlannerWorkspaceV2Schema, PlanChangeSetV2Schema, PlannerAttemptV2Schema,
  type PlannerWorkspaceV2, type PlannerRevisionV2 } from "../contracts";
import { PlannerDatabase, DurablePlannerError, rows, reject } from "./database";
import { ownedPlan, loadIntent, type PlanRow } from "./intents";
import { loadAttempt, assertAttemptCurrent } from "./attempts";
import { loadRevision } from "./revisions";
import { loadExecutionContext, liveExecution, verifyContextCorrespondence, verifyPlacement, type ExecutionContext } from "./context";
import { verifyExecutionGraph } from "./execution-validation";

const summary = (revision: PlannerRevisionV2, version: number): NonNullable<PlannerWorkspaceV2["active"]> => ({
  revisionId: revision.revisionId, resolvedIntentVersionId: revision.resolvedIntentVersionId, resolvedPlanningVersion: version,
  digest: revision.digest, title: revision.blueprint.strategy.outcome, policy: revision.blueprint.strategy.policy,
  recommendedEffort: revision.blueprint.strategy.recommendedEffort,
  committedMinutes: revision.executable.reduce((sum, spec) => sum + spec.effort.remainingMinutesEstimate, 0),
  primaryFinishDate: revision.executable.length ? revision.executable.map(spec => spec.placement.date).sort().at(-1)! : null,
});

function liveSummary(active: NonNullable<PlannerWorkspaceV2["active"]>, planId: string, context: ExecutionContext | null): void {
  if (!context) return;
  const open = context.quests.filter(quest => quest.plannerSpec &&
    (quest.plannerSpec as { planId: string }).planId === planId && quest.status !== "COMPLETED" && quest.remainingDisposition === "OPEN");
  active.committedMinutes = open.reduce((sum, quest) => sum + liveExecution(quest, context.sessions).remainingMinutesEstimate, 0);
  active.primaryFinishDate = open.length ? open.map(quest => quest.scheduledFor).sort().at(-1)! : null;
}

/** One owned derived projection; neither this view nor its allowedActions grant
 * mutation authority. Apply and execution always recheck live facts. */
export class WorkspaceService {
  constructor(readonly db: PlannerDatabase) {}
  async read(ownerId: number, planId: string): Promise<PlannerWorkspaceV2> {
    return this.db.coordinated(ownerId, async sql => {
      const plan = await ownedPlan(sql, ownerId, planId);
      if (plan.contractVersion !== 2 || !plan.workingIntentVersionId) reject("INTENT_CONFLICT", "This legacy plan needs reviewed adoption before opening its V2 workspace.");
      const intent = await loadIntent(sql, ownerId, plan.workingIntentVersionId);
      let context: ExecutionContext | null = null;
      let scheduleHealth: PlannerWorkspaceV2["scheduleHealth"] = plan.activeRevisionId ? "HEALTHY" : "NOT_SCHEDULED";
      let requiresReestimate = false;
      try {
        context = await loadExecutionContext(sql, ownerId, [plan], intent.intent);
        requiresReestimate = context.requiresReestimate;
        if (context.legacyExceptions.length || requiresReestimate) scheduleHealth = "UPDATE_SUGGESTED";
      } catch (error) {
        if (!(error instanceof DurablePlannerError)) throw error;
        scheduleHealth = "CONFLICT";
      }
      let active: PlannerWorkspaceV2["active"] = null;
      if (plan.activeRevisionId) {
        const row = (await rows<{ v2Artifact: unknown; baseVersion: number }>(sql, 'SELECT "v2Artifact","baseVersion" FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2 AND "confirmedAt" IS NOT NULL', [plan.activeRevisionId, planId]))[0];
        if (!row) reject("INVALID_OUTPUT", "The active pointer has no confirmed owned revision.");
        if (row.v2Artifact) {
          const revision = await loadRevision(sql, ownerId, plan.activeRevisionId);
          active = summary(revision, row.baseVersion);
          if (context) try { verifyPlacement(context, [{ plan, intent: (await loadIntent(sql, ownerId, revision.resolvedIntentVersionId)).intent, specs: revision.executable }]); }
          catch (error) { if (!(error instanceof DurablePlannerError)) throw error; scheduleHealth = "UPDATE_SUGGESTED"; }
        } else {
          // Imported live baselines are explicitly legacy/unreviewed. No V2
          // quality report or fabricated educational blueprint is created.
          const migration = plan.migrationEvidence as { baselineDigest?: string; baselineSpecs?: { effort: { remainingMinutesEstimate: number }; placement: { date: string } }[]; receipt?: { intentVersionId: string } } | null;
          if (!migration?.baselineDigest || !migration.baselineSpecs) reject("INVALID_OUTPUT", "The imported active baseline is unavailable.");
          const minutes = migration.baselineSpecs.reduce((sum, spec) => sum + spec.effort.remainingMinutesEstimate, 0);
          const importedIntent = await loadIntent(sql, ownerId, migration.receipt?.intentVersionId ?? intent.intentVersionId);
          active = { revisionId: plan.activeRevisionId, resolvedIntentVersionId: importedIntent.intentVersionId, resolvedPlanningVersion: row.baseVersion,
            digest: migration.baselineDigest, title: importedIntent.intent.title, policy: importedIntent.intent.policy,
            recommendedEffort: { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes }, committedMinutes: minutes,
            primaryFinishDate: migration.baselineSpecs.length ? migration.baselineSpecs.map(spec => spec.placement.date).sort().at(-1)! : null };
        }
        liveSummary(active, planId, context);
      }
      const latest = (await rows<{ artifact: unknown }>(sql, `SELECT artifact FROM "PlannerAttempt" WHERE "userId"=$1
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(artifact->'targets') t WHERE t->>'planId'=$2)
        ORDER BY "createdAt" DESC,id DESC LIMIT 1`, [ownerId, planId]))[0];
      const operation = latest ? PlannerAttemptV2Schema.parse(latest.artifact) : null;
      const attempt = operation && operation.kind !== "RESEARCH_ADVICE" ? { attemptId: operation.attemptId, kind: operation.kind, state: operation.state, stage: operation.stage,
        error: operation.error, question: operation.question, requestedAt: operation.requestedAt } : null;
      let candidate: PlannerWorkspaceV2["candidate"] = null;
      if (plan.latestDraftRevisionId) {
        const revision = await loadRevision(sql, ownerId, plan.latestDraftRevisionId);
        const result = await loadAttempt(sql, ownerId, revision.attemptId);
        const changeSet = PlanChangeSetV2Schema.parse(result.payload.changeSet);
        const target = changeSet.targets.find(target => target.planId === planId)!;
        const reasons: string[] = [];
        try {
          if (result.attempt.applyReceipt) reject("STALE_CONTEXT", "This proposal has already been confirmed.");
          await assertAttemptCurrent(sql, result.attempt);
          const plans: PlanRow[] = []; const revisions: PlannerRevisionV2[] = []; const targets = [];
          for (const selected of [...changeSet.targets].sort((a, b) => a.planId.localeCompare(b.planId))) {
            const selectedPlan = await ownedPlan(sql, ownerId, selected.planId);
            if (selectedPlan.latestDraftRevisionId !== selected.revisionId) reject("STALE_CONTEXT", "Another selected plan has a newer candidate.");
            plans.push(selectedPlan); revisions.push(await loadRevision(sql, ownerId, selected.revisionId));
          }
          for (const sealed of revisions) {
            const accepted = await loadIntent(sql, ownerId, sealed.resolvedIntentVersionId);
            const fresh = await loadExecutionContext(sql, ownerId, plans, accepted.intent);
            verifyContextCorrespondence(sealed.context, fresh.dependencies, fresh.quests);
            targets.push({ plan: plans.find(plan => plan.id === sealed.planId)!, intent: accepted.intent, specs: sealed.executable });
          }
          const fresh = await loadExecutionContext(sql, ownerId, plans, targets[0].intent);
          verifyPlacement(fresh, targets); verifyExecutionGraph(fresh, revisions);
        } catch (error) {
          if (!(error instanceof DurablePlannerError)) throw error;
          reasons.push(error.detail.message); if (error.detail.code === "SCHEDULE_CONFLICT") scheduleHealth = "CONFLICT";
        }
        candidate = { ...summary(revision, target.resolvedPlanningVersion), attemptId: revision.attemptId, changeSetId: changeSet.changeSetId,
          confirmed: false, freshness: reasons.length ? "STALE" : "CURRENT", staleReasons: reasons, qualityStatus: "PASSED" };
      }
      let phase: PlannerWorkspaceV2["phase"] = "READY";
      let nextAction: PlannerWorkspaceV2["nextAction"] = "GENERATE";
      let allowedActions: PlannerWorkspaceV2["allowedActions"] = ["GENERATE", "ADVICE", "ARCHIVE"];
      if (active) { phase = "IDLE"; nextAction = "STUDY"; allowedActions = ["STUDY", "UPDATE", "ADVICE", "ARCHIVE"]; }
      if (intent.intent.unresolvedQuestions.length && !active) { phase = "INTAKE"; nextAction = "ANSWER"; allowedActions = ["ANSWER", "ADVICE", "ARCHIVE"]; }
      if (attempt && ["QUEUED", "RUNNING"].includes(attempt.state)) { phase = "PLANNING"; nextAction = "WAIT"; allowedActions = ["CANCEL", "ADVICE", "ARCHIVE"]; }
      else if (attempt?.state === "NEEDS_DECISION") { phase = "NEEDS_DECISION"; nextAction = "ANSWER"; allowedActions = ["ANSWER", "CANCEL", "ADVICE", "ARCHIVE"]; }
      else if (candidate) {
        if (candidate.freshness === "CURRENT" && !requiresReestimate) { phase = "REVIEW"; nextAction = "REVIEW"; allowedActions = ["REVIEW", "CONFIRM", "GENERATE", "ADVICE", "ARCHIVE"]; }
        else { phase = "UPDATE_REQUIRED"; nextAction = "UPDATE"; allowedActions = ["UPDATE", "ADVICE", "ARCHIVE"]; }
      } else if (attempt?.state === "FAILED") { phase = "RECOVERY"; nextAction = "RETRY"; allowedActions = ["RETRY", "ADVICE", "ARCHIVE"]; }
      else if (active && scheduleHealth !== "HEALTHY") { phase = "UPDATE_REQUIRED"; nextAction = "UPDATE"; }
      if (["ARCHIVED", "COMPLETED"].includes(plan.state)) { phase = "IDLE"; nextAction = "NONE"; allowedActions = ["ADVICE"]; candidate = null; }
      return PlannerWorkspaceV2Schema.parse({ schemaVersion: 2, planId, ownerId, planState: plan.state, planningVersion: plan.version, conversationVersion: plan.conversationVersion,
        workingIntentVersionId: plan.workingIntentVersionId, phase, active, candidate, attempt, scheduleHealth, requiresReestimate, locallyDirty: false, nextAction, allowedActions });
    });
  }
}
