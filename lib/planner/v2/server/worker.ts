import { randomUUID } from "node:crypto";
import { AttemptService, type LeaseToken } from "./attempts";
import { DurablePlannerError, rows } from "./database";
import type { PlannerAttemptV2 } from "../contracts";

export type WorkerHandler = (context: { token: LeaseToken; signal: AbortSignal; attempts: AttemptService }) => Promise<void>;
export interface WorkerHealth {
  ready: boolean; compatible: boolean; claiming: boolean; running: number;
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
    private readonly log: (event: { event: string; attemptId?: string; fence?: number; code?: string }) => void = event => process.stdout.write(JSON.stringify(event) + "\n")) {}
  async readiness(): Promise<WorkerHealth> {
    const compatibility = await rows<{ compatible: boolean }>(this.attempts.db.pool, `SELECT
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
        (table_name,column_name) IN (('StudySession','executionContext'),('StudySession','executionState'),('StudySession','runningSince'),
          ('StudySession','acceptedFocusAtResume'),('StudySession','acceptedBreakAtResume'),('Quest','plannerSpec'),('Quest','remainingDisposition'),
          ('PlannerPlan','contractVersion'),('PlannerIntentVersion','artifact'),('PlannerAttempt','artifact'),('PlannerAttempt','payload'),
          ('AiUsageLog','requestId'),('AiUsageLog','attemptId'),('AiUsageLog','accountingState'),('AiUsageLog','rootRequestId'),('AiUsageLog','reservation'))) = 16
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND tgname IN
        ('planner_v2_intent_guard','planner_v2_attempt_guard','planner_v2_revision_guard','planner_v2_core_plan','planner_v2_core_link','planner_v2_core_revision',
        'planner_v2_execution_quest','planner_v2_execution_session','planner_v2_goal_guard','planner_v2_user_source','planner_v2_subject_source','planner_v2_node_source',
        'planner_v2_rest_source','planner_v2_stats_source','planner_v2_inventory_source','planner_v2_owned_inventory_source')) = 16
      AND (SELECT count(*) FROM pg_constraint WHERE convalidated AND conname IN ('planner_working_intent_membership','planner_intent_parent_membership',
        'planner_requested_intent_membership','planner_resolved_intent_membership','planner_v2_duration_bounds','planner_v2_session_bounds')) = 6
      AND (SELECT count(*) FROM pg_class WHERE relname IN ('PlannerPlan','PlannerRevision','PlannerQuestLink','PlannerIntentVersion','PlannerAttempt') AND relrowsecurity) = 5 AS compatible`);
    this.compatible = compatibility[0].compatible;
    const age = this.compatible ? (await rows<{ seconds: number | null }>(this.attempts.db.pool,
      'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-(MIN("createdAt") AT TIME ZONE \'UTC\')))::int AS seconds FROM "PlannerAttempt" WHERE state=\'QUEUED\''))[0].seconds ?? 0 : 0;
    const recent = [this.lastClaimAt, this.lastSweepAt].every(value => value && Date.now() - Date.parse(value) < 30_000);
    return { ready: this.compatible && Object.keys(this.handlers).length > 0 && !this.stopping && recent && age < 600, compatible: this.compatible, claiming: this.compatible && !this.stopping && Object.keys(this.handlers).length > 0,
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
        void this.attempts.renew(token).catch(error => controller.abort(error)).finally(() => { renewing = false; });
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
      if (reason instanceof DurablePlannerError && reason.detail.code === "WORKER_UNAVAILABLE") {
        await this.attempts.release(token).catch(() => {});
        return;
      }
      const failure = reason instanceof DurablePlannerError ? reason : new DurablePlannerError("SAVE_FAILED", "This stage could not finish; its checkpoint is retained.", stage);
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
