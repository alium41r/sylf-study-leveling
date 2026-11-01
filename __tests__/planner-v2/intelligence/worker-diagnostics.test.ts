import { describe, expect, it, vi } from "vitest";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import type { AttemptService, LeaseToken } from "@/lib/planner/v2/server/attempts";
import { successfulAttemptFixture } from "../contracts/fixtures";
import { roleSpendingExposure } from "@/lib/planner/v2/server/role-accounting";
import { DurablePlannerError } from "@/lib/planner/v2/server/database";

describe("worker failure diagnostics", () => {
  it("counts settled model and search costs, ignores cancelled holds, and rejects uncertainty", () => {
    const row = { accountingState: "SETTLED", estimatedCostUsd: 0.25, reservation: {}, model: "deepseek-flash" };
    expect(roleSpendingExposure([row, { ...row, model: "search", estimatedCostUsd: 0.00075 }, { ...row, accountingState: "CANCELLED_BEFORE_DISPATCH", estimatedCostUsd: null }])).toBe(250750);
    for (const state of ["DISPATCHED", "UNKNOWN_SPEND"]) expect(() => roleSpendingExposure([{ ...row, accountingState: state }])).toThrow();
    expect(() => roleSpendingExposure([{ ...row, estimatedCostUsd: null }])).toThrow();
  });
  it("retains a safe database cause without logging private error messages", async () => {
    const attempt = successfulAttemptFixture();
    attempt.budget.executionDeadlineAt = new Date(Date.now() + 60000).toISOString();
    const attempts = { read: vi.fn().mockResolvedValue(attempt), fail: vi.fn().mockResolvedValue(undefined) };
    const log = vi.fn();
    const secret = "private credential and student evidence";
    const failure = Object.assign(new Error(secret), { code: "55P03" });
    const worker = new PlannerWorker(attempts as unknown as AttemptService, { PLAN: async () => { throw failure; } }, log);
    const token = { ownerId: attempt.ownerId, attemptId: attempt.attemptId, workerId: worker.workerId, fence: 1 };
    await (worker as unknown as { run(token: LeaseToken, controller: AbortController): Promise<void> }).run(token, new AbortController());
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "unexpected_failure", causeCode: "55P03", causeName: "Error" }));
    expect(attempts.fail).toHaveBeenCalledWith(token, expect.objectContaining({ detail: expect.objectContaining({ code: "SAVE_FAILED" }) }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it("reports the saved stage reached after claim when an unexpected error stops the handler",async()=>{
    const attempt=successfulAttemptFixture();attempt.stage="PREFLIGHT";attempt.budget.executionDeadlineAt=new Date(Date.now()+60000).toISOString();
    const attempts={read:vi.fn(async()=>({...attempt})),fail:vi.fn().mockResolvedValue(undefined)},worker=new PlannerWorker(attempts as unknown as AttemptService,{PLAN:async()=>{attempt.stage="RESEARCH";throw new Error("private failure");}},vi.fn());
    await (worker as unknown as {run(token:LeaseToken,controller:AbortController):Promise<void>}).run({ownerId:attempt.ownerId,attemptId:attempt.attemptId,workerId:worker.workerId,fence:1},new AbortController());
    expect(attempts.fail).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({detail:expect.objectContaining({code:"SAVE_FAILED",stage:"RESEARCH"})}));
  });
  it.each(["VALID", "LEASE_EXPIRED", "BUDGET_EXHAUSTED", "READ_FAILED"] as const)("rechecks actual control state after heartbeat contention: %s", async state => {
    vi.useFakeTimers();
    try {
      const finished = successfulAttemptFixture();
      finished.budget.executionDeadlineAt = new Date(Date.now() + 60000).toISOString();
      const active = { ...finished, state: "RUNNING" as const, fence: 1 };
      let done = false, finish!: () => void;
      const controlFailure = state === "READ_FAILED" ? new Error("private database error") : new DurablePlannerError(state === "BUDGET_EXHAUSTED" ? state : "LEASE_EXPIRED", "Stopped");
      const attempts = { read: vi.fn(async () => done ? finished : active), fail: vi.fn().mockResolvedValue(undefined),
        renew: vi.fn().mockRejectedValue(Object.assign(new Error("private lock details"), { code: "55P03" })),
        providerWindow: state === "VALID" ? vi.fn().mockResolvedValue({ now: Date.now(), deadline: Date.now() + 60000 }) : vi.fn().mockRejectedValue(controlFailure) };
      const log = vi.fn(), controller = new AbortController();
      const worker = new PlannerWorker(attempts as unknown as AttemptService, { PLAN: () => new Promise<void>(resolve => { finish = resolve; }) }, log);
      const token = { ownerId: active.ownerId, attemptId: active.attemptId, workerId: worker.workerId, fence: 1 };
      const running = (worker as unknown as { run(token: LeaseToken, controller: AbortController): Promise<void> }).run(token, controller);
      await vi.advanceTimersByTimeAsync(10000);
      expect(attempts.providerWindow).toHaveBeenCalledWith(token, "BLUEPRINT");
      if (state === "VALID") {
        expect(controller.signal.aborted).toBe(false);
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "renewal_contended" }));
        expect(attempts.fail).not.toHaveBeenCalled();
        done = true; finish();
      } else expect(controller.signal.aborted).toBe(true);
      await running;
      if (state !== "VALID") expect(attempts.fail).toHaveBeenCalledWith(token, expect.objectContaining({ detail: expect.objectContaining({ code: state === "READ_FAILED" ? "SAVE_FAILED" : state }) }));
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    } finally { vi.useRealTimers(); }
  });
});
