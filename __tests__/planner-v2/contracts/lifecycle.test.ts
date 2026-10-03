import { describe, expect, it } from "vitest";
import { PlannerAttemptV2Schema, PlannerWorkspaceV2Schema, RuntimeBudgetV2Schema, validateAttemptTransition } from "@/lib/planner/v2/contracts";
import { attemptFixture, budgetFixture, digest, id, successfulAttemptFixture, workspaceFixture } from "./fixtures";

function running() {
  const attempt = attemptFixture();
  return PlannerAttemptV2Schema.parse({ ...attempt, state: "RUNNING", stage: "RESEARCH", fence: 1,
    lease: { owner: "worker-a", fence: 1, expiresAt: "2026-10-02T10:01:00Z" } });
}

describe("Planner V2 attempt, intent and workspace lifecycle", () => {
  it("keeps read-only research recoverable without Plan publication authority", () => {
    const attempt = attemptFixture();
    const research = { ...attempt, kind: "RESEARCH_ADVICE", targets: [], budget: { ...attempt.budget, profile: "RESEARCH" },
      acceptedRequest: { ...attempt.acceptedRequest, authorization: "RESEARCH_ONLY", researchRequested: true } };
    expect(PlannerAttemptV2Schema.safeParse(research).success).toBe(true);
    expect(PlannerAttemptV2Schema.safeParse({ ...research, targets: attempt.targets }).success).toBe(false);
    expect(PlannerAttemptV2Schema.safeParse({ ...research, stage: "BLUEPRINT" }).success).toBe(false);
    expect(PlannerAttemptV2Schema.safeParse({ ...research, result: successfulAttemptFixture().result, state: "SUCCEEDED" }).success).toBe(false);
  });
  it("pins requested intent and binds resolved research intent/version once", () => {
    const before = running();
    const after = PlannerAttemptV2Schema.parse({ ...before, stage: "BLUEPRINT", targets: before.targets.map(target => ({ ...target,
      resolvedIntentVersionId: id(8), resolution: "RESEARCH_ADOPTION", resolvedPlanningVersion: 1, contextDigest: digest() })) });
    expect(validateAttemptTransition(before, after)).toEqual([]);
    expect(validateAttemptTransition(after, { ...after, targets: after.targets.map(target => ({ ...target, resolvedIntentVersionId: id(9) })) })).toContain("RESOLVED_INTENT_ALREADY_BOUND");
    expect(PlannerAttemptV2Schema.safeParse({ ...after, targets: after.targets.map(target => ({ ...target, resolvedPlanningVersion: 0 })) }).success).toBe(false);
    expect(validateAttemptTransition(before, { ...before, targets: before.targets.map(target => ({ ...target, requestedIntentVersionId: id(9) })) })).toContain("IMMUTABLE_TARGET_FIELD:requestedIntentVersionId");
  });
  it("cannot start educational work with an unresolved intent/context", () => {
    expect(PlannerAttemptV2Schema.safeParse({ ...running(), stage: "BLUEPRINT" }).success).toBe(false);
    expect(PlannerAttemptV2Schema.safeParse({ ...attemptFixture(), state: "SUCCEEDED", result: successfulAttemptFixture().result }).success).toBe(false);
  });
  it("preserves durable fencing across requeue and requires a new fence for another owner", () => {
    const before = running();
    const queued = PlannerAttemptV2Schema.parse({ ...before, state: "QUEUED", lease: null });
    expect(validateAttemptTransition(before, queued)).toEqual([]);
    expect(validateAttemptTransition(queued, before)).toContain("CLAIM_REQUIRES_NEW_FENCE");
    expect(validateAttemptTransition(before, { ...before, lease: { ...before.lease!, owner: "worker-b" } })).toContain("TAKEOVER_REQUIRES_NEW_FENCE");
    const acquired = PlannerAttemptV2Schema.parse({ ...before, fence: 2, lease: { ...before.lease!, owner: "worker-b", fence: 2 } });
    expect(validateAttemptTransition(queued, acquired)).toEqual([]);
  });
  it("does not rebind terminal results or resume material questions with new intent", () => {
    const done = successfulAttemptFixture();
    expect(validateAttemptTransition(done, { ...done, requestHash: digest("b") })).toContain("IMMUTABLE_ATTEMPT_FIELD:requestHash");
    expect(validateAttemptTransition(done, { ...done, budget: { ...done.budget, foregroundProcessingMs: 1 } })).toContain("SUCCESSFUL_ATTEMPT_IMMUTABLE_EXCEPT_RECEIPT");
    const paused = PlannerAttemptV2Schema.parse({ ...attemptFixture(), state: "NEEDS_DECISION", question: "Which exam cycle are you sitting?" });
    const cancelled = PlannerAttemptV2Schema.parse({ ...paused, state: "CANCELLED", question: null });
    expect(validateAttemptTransition(paused, cancelled)).toEqual([]);
    expect(validateAttemptTransition(paused, running())).toContain("INVALID_ATTEMPT_STATE_TRANSITION");
  });
  it("deducts foreground time and rejects call-budget reset on recovery", () => {
    const budget = { ...budgetFixture(), foregroundProcessingMs: 10_000, processingStartedAt: "2026-10-02T10:00:00Z", executionDeadlineAt: "2026-10-02T10:02:50Z" };
    expect(RuntimeBudgetV2Schema.safeParse(budget).success).toBe(true);
    expect(RuntimeBudgetV2Schema.safeParse({ ...budget, executionDeadlineAt: "2026-10-02T10:03:00Z" }).success).toBe(false);
    expect(RuntimeBudgetV2Schema.safeParse({ ...budget, consumed: { ...budget.consumed, modelCalls: 6 }, reserved: { ...budget.reserved, modelCalls: 1 } }).success).toBe(false);
    const before = { ...running(), budget: { ...budget, consumed: { ...budget.consumed, modelCalls: 2 } } };
    expect(validateAttemptTransition(before, { ...before, budget: { ...budget, consumed: { ...budget.consumed, modelCalls: 1 } } })).toContain("ROOT_COUNTER_CANNOT_RESET:modelCalls");
    expect(validateAttemptTransition(before, { ...before, budget: { ...before.budget, executionDeadlineAt: "2026-10-02T10:02:49Z" } })).toContain("TAKEOVER_CANNOT_RESET_DEADLINE");
  });
  it("requires current accepted intent/version and disables confirmation while locally dirty", () => {
    const workspace = workspaceFixture();
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, workingIntentVersionId: id(9) }).success).toBe(false);
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, planningVersion: 1 }).success).toBe(false);
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, locallyDirty: true }).success).toBe(false);
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, conversationVersion: 10 }).success).toBe(true);
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, phase: "UPDATE_REQUIRED", candidate: { ...workspace.candidate!, freshness: "STALE", staleReasons: ["Your deadline changed"] } }).success).toBe(false);
  });
  it("retains honest actual token overrun in failure while denying publication or new reservations", () => {
    const attempt = attemptFixture();
    const budget = { ...attempt.budget, consumed: { ...attempt.budget.consumed, modelCalls: 1, outputTokens: 40287 } };
    const error = { schemaVersion: 2, code: "BUDGET_EXHAUSTED", stage: "INTERPRETATION", message: "Actual provider usage exceeded the request allowance", retryable: false, resumable: false,
      fieldRefs: [], activityRefs: [], dates: [], recoveryAction: "NONE", traceId: id(95) };
    expect(PlannerAttemptV2Schema.safeParse({ ...attempt, state: "FAILED", stage: "INTERPRETATION", budget, error }).success).toBe(true);
    expect(PlannerAttemptV2Schema.safeParse({ ...attempt, budget }).success).toBe(false);
    expect(RuntimeBudgetV2Schema.safeParse({ ...budget, reserved: { ...budget.reserved, modelCalls: 1 } }).success).toBe(false);
  });
  it("never calls exhausted remaining work healthy or confirmable", () => {
    const workspace = workspaceFixture();
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, requiresReestimate: true }).success).toBe(false);
    expect(PlannerWorkspaceV2Schema.safeParse({ ...workspace, requiresReestimate: true, scheduleHealth: "HEALTHY", nextAction: "UPDATE", allowedActions: ["UPDATE"], phase: "UPDATE_REQUIRED" }).success).toBe(false);
  });
});
