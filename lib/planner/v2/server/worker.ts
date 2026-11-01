import { randomUUID } from "node:crypto";
import { AttemptService, type LeaseToken } from "./attempts";
import { DurablePlannerError, rows } from "./database";
import type { PlannerAttemptV2 } from "../contracts";

export type WorkerHandler = (context: { token: LeaseToken; signal: AbortSignal; attempts: AttemptService }) => Promise<void>;
export interface WorkerHealth {
  compilerVersions: number[]; ready: boolean; compatible: boolean; claiming: boolean; running: number;
  lastClaimAt: string | null; lastSweepAt: string | null; oldestQueueSeconds: number;
}
/** Supervision/dispatch only. Educational handlers are introduced in Phase 2. */
export class PlannerWorker {
  readonly workerId = `planner_${randomUUID()}`;
  private stopping = false;
  private compatible = false;
  private lastClaimAt: string | null = null;
  private lastSweepAt: string | null = null;
  private running = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  constructor(readonly attempts: AttemptService, private readonly handlers: Partial<Record<PlannerAttemptV2["kind"], WorkerHandler>>,
    private readonly log: (event: { event: string; attemptId?: string; fence?: number; code?: string;
      causeCode?: string; causeName?: string; causeFrames?: string[] }) => void = event => process.stdout.write(JSON.stringify(event) + "\n")) {}
  async readiness(): Promise<WorkerHealth> {
    const compatibility = await rows<{ compatible: boolean }>(this.attempts.db.pool, `SELECT
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
        (table_name,column_name) IN (('StudySession','executionContext'),('StudySession','executionState'),('StudySession','runningSince'),
          ('StudySession','acceptedFocusAtResume'),('StudySession','acceptedBreakAtResume'),('Quest','plannerSpec'),('Quest','remainingDisposition'),
          ('PlannerPlan','contractVersion'),('PlannerPlan','conversation'),('PlannerPlan','researchDocuments'),('PlannerIntentVersion','artifact'),('PlannerAttempt','artifact'),('PlannerAttempt','payload'),
          ('AiUsageLog','requestId'),('AiUsageLog','attemptId'),('AiUsageLog','accountingState'),('AiUsageLog','rootRequestId'),('AiUsageLog','reservation'),
          ('PlannerAttempt','intelligenceArtifacts'),('PlannerRevision','intelligenceBundle'),('PlannerAttempt','compilerVersion'))) = 21
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND tgname IN
        ('planner_v2_intent_guard','planner_v2_attempt_guard','planner_v2_revision_guard','planner_v2_core_plan','planner_v2_core_link','planner_v2_core_revision',
        'planner_v2_execution_quest','planner_v2_execution_session','planner_v2_goal_guard','planner_v2_user_source','planner_v2_subject_source','planner_v2_node_source',
        'planner_v2_rest_source','planner_v2_stats_source','planner_v2_inventory_source','planner_v2_owned_inventory_source','planner_v2_conversation_guard',
        'planner_intelligence_attempt','planner_intelligence_revision','planner_compiler_version_guard','planner_revision_compiler_guard','planner_role_attempt_guard','planner_role_receipt_guard',
        'planner_understanding_guard','planner_research_tool_guard','planner_calendar_capacity_guard','planner_natural_learning_guard','planner_reviewed_journey_guard','planner_reviewed_research_handoff_guard',
        'planner_reviewed_claim_guard','planner_reviewed_publication_guard')) = 31
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND tgname IN ('calendar_planning_lock','calendar_planning_user_lock')) = 11
      AND (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indisvalid AND c.relname IN
        ('PlannerAttempt_rootRequestId_key','planner_role_root_unique','planner_role_child_unique','planner_role_call_key_unique')) = 4
      AND (SELECT count(*) FROM pg_constraint WHERE convalidated AND conname IN ('planner_working_intent_membership','planner_intent_parent_membership',
        'planner_requested_intent_membership','planner_resolved_intent_membership','planner_v2_duration_bounds','planner_v2_session_bounds','planner_v2_conversation_envelope','planner_v2_documents_envelope',
        'planner_intelligence_archive_shape','planner_intelligence_bundle_shape','planner_compiler_version')) = 11
      AND (SELECT count(*) FROM pg_class WHERE relname IN ('PlannerPlan','PlannerRevision','PlannerQuestLink','PlannerIntentVersion','PlannerAttempt') AND relrowsecurity) = 5 AS compatible`);
    this.compatible = compatibility[0].compatible;
    const age = this.compatible ? (await rows<{ seconds: number | null }>(this.attempts.db.pool,
      'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-(MIN("createdAt") AT TIME ZONE \'UTC\')))::int AS seconds FROM "PlannerAttempt" WHERE state=\'QUEUED\''))[0].seconds ?? 0 : 0;
    const recent = [this.lastClaimAt, this.lastSweepAt].every(value => value && Date.now() - Date.parse(value) < 30_000);
    return { compilerVersions: [1, 2], ready: this.compatible && Object.keys(this.handlers).length > 0 && !this.stopping && recent && age < 600, compatible: this.compatible, claiming: this.compatible && !this.stopping && Object.keys(this.handlers).length > 0,
      running: this.running.size, lastClaimAt: this.lastClaimAt, lastSweepAt: this.lastSweepAt, oldestQueueSeconds: age };
  }
  async tick(): Promise<void> {
    if (this.stopping) return;
    if (!this.compatible) {
      const health = await this.readiness();
      if (!health.compatible) throw new DurablePlannerError("WORKER_UNAVAILABLE", "The worker and database schema are incompatible.", "RECOVERY");
    }
    if (!this.lastSweepAt || Date.now() - Date.parse(this.lastSweepAt) >= 10_000) {
      await this.attempts.sweep(); this.lastSweepAt = new Date().toISOString();
    }
    while (!this.stopping && this.running.size < 2) {
      const token = await this.attempts.claim(this.workerId, Object.keys(this.handlers) as PlannerAttemptV2["kind"][]);
      this.lastClaimAt = new Date().toISOString();
      if (!token) break;
      const controller = new AbortController();
      const promise = this.run(token, controller).finally(() => this.running.delete(token.attemptId));
      this.running.set(token.attemptId, { controller, promise });
    }
  }
  private async run(token: LeaseToken, controller: AbortController): Promise<void> {
    let stage: PlannerAttemptV2["stage"] = "RECOVERY";
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const attempt = await this.attempts.read(token.ownerId, token.attemptId);
      stage = attempt.stage;
      const handler = this.handlers[attempt.kind];
      const checkDeadline = async () => {
        try {
          const current = await this.attempts.read(token.ownerId, token.attemptId);
          if (current.state !== "RUNNING" || current.fence !== token.fence || current.lease?.owner !== token.workerId) {
            controller.abort(new DurablePlannerError("LEASE_EXPIRED", "This worker no longer owns the operation.", current.stage)); return;
          }
          const remaining = Date.parse(current.budget.executionDeadlineAt!) - Date.now();
          // An explicit profile escalation retains the start/counters and can
          // extend this same root's deadline. Takeover never resets it.
          if (remaining > 0) timeout = setTimeout(() => { void checkDeadline(); }, remaining);
          else controller.abort(new DurablePlannerError("BUDGET_EXHAUSTED", "The root processing deadline expired.", current.stage));
        } catch (error) { controller.abort(error); }
      };
      timeout = setTimeout(() => { void checkDeadline(); }, Math.max(1, Date.parse(attempt.budget.executionDeadlineAt!) - Date.now()));
      let renewing = false;
      renewal = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.attempts.renew(token).catch(async error => {
          // A long checkpoint may temporarily own the account writer lock.
          // A failed lock attempt is not proof that our lease was lost. Read
          // its actual committed state; never extend or assume a lease here.
          if (error && typeof error === "object" && "code" in error && error.code === "55P03") {
            try {
              await this.attempts.providerWindow(token, "BLUEPRINT");
              this.log({ event: "renewal_contended", attemptId: token.attemptId, fence: token.fence });
              return;
            } catch (current) { controller.abort(current); return; }
          }
          controller.abort(error);
        }).finally(() => { renewing = false; });
      }, 10_000);
      this.log({ event: "claimed", attemptId: token.attemptId, fence: token.fence });
      if (!handler) throw new DurablePlannerError("WORKER_UNAVAILABLE", "Educational generation is not enabled in this durable-core deployment.", stage);
      const aborted = new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(controller.signal.reason);
        if (controller.signal.aborted) abortListener();
        else controller.signal.addEventListener("abort", abortListener, { once: true });
      });
      // Retire the lease even if an SDK ignores AbortSignal. Its late result
      // still reaches the same fenced repositories and cannot advance state.
      const work = Promise.resolve().then(() => handler({ token, signal: controller.signal, attempts: this.attempts }));
      await Promise.race([work, aborted]);
      const current = await this.attempts.read(token.ownerId, token.attemptId);
      if (current.state === "RUNNING") throw new DurablePlannerError("SAVE_FAILED", "The handler returned without a durable result.", current.stage);
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      if (!(reason instanceof DurablePlannerError) || reason.cause) {
        const underlying = reason instanceof DurablePlannerError ? reason.cause : reason;
        const cause = underlying instanceof Error ? underlying : null;
        const causeCode = cause && "code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]{1,80}$/.test(cause.code) ? cause.code : undefined;
        // Messages, SQL details, input values and provider bodies may contain
        // private data. Retain only a safe type/code and bundled code locations.
        const causeFrames = cause?.stack?.split("\n").slice(1).flatMap(line => {
          const frame = line.match(/\/dist\/planner-worker\/([A-Za-z0-9_./-]+\.[cm]?js:\d+:\d+)/);
          return frame ? [frame[1]] : [];
        }).slice(0, 8);
        this.log({ event: "unexpected_failure", attemptId: token.attemptId, fence: token.fence,
          causeName: cause && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(cause.name) ? cause.name : "UnknownError", causeCode, causeFrames });
      }
      if (reason instanceof DurablePlannerError && reason.detail.code === "WORKER_UNAVAILABLE") {
        await this.attempts.release(token).catch(() => {});
        return;
      }
      // A handler can advance through many durable stages after claim. Report
      // its saved stage, not the initial PREFLIGHT snapshot, for unexpected
      // failures. Failure/cancellation writes remain guarded by the same fence.
      const failedStage = reason instanceof DurablePlannerError ? reason.detail.stage : await this.attempts.read(token.ownerId, token.attemptId).then(a=>a.stage).catch(()=>stage);
      const failure = reason instanceof DurablePlannerError ? reason : new DurablePlannerError("SAVE_FAILED", "This stage could not finish; its checkpoint is retained.", failedStage);
      try { await this.attempts.fail(token, failure); }
      catch (fenced) {
        this.log({ event: "late_result_rejected", attemptId: token.attemptId, fence: token.fence,
          code: fenced instanceof DurablePlannerError ? fenced.detail.code : "SAVE_FAILED" });
      }
      this.log({ event: "stopped", attemptId: token.attemptId, fence: token.fence, code: failure.detail.code });
    } finally {
      clearTimeout(timeout); clearInterval(renewal);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
    }
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const job of this.running.values()) job.controller.abort(new DurablePlannerError("WORKER_UNAVAILABLE", "Worker shutdown; fenced recovery will resume the checkpoint.", "RECOVERY"));
    let grace: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([Promise.allSettled([...this.running.values()].map(job => job.promise)), new Promise(resolve => { grace = setTimeout(resolve, 30_000); })]); }
    finally { clearTimeout(grace); }
  }
}
