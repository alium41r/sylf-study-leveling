import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import { openAIUsage } from "@/lib/ai/providers/usage";
import { offlineResourcePolicy, RoleCallSchema } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import { ResourcePolicySchema, admitRoleCall } from "@/lib/planner/v2/intelligence/foundation/resources";
import { hash } from "@/lib/planner/v2/server/database";
import { newBudget } from "@/lib/planner/v2/server/attempts";
import { RuntimeBudgetV2Schema } from "@/lib/planner/v2/contracts";

afterEach(() => vi.unstubAllGlobals());
describe("versioned role policy and usage", () => {
  it("provides explicit generous finite reasoning capacity and downstream verification funding", () => {
    const p = ResourcePolicySchema.parse(offlineResourcePolicy("a".repeat(64), randomUUID()));
    expect(p.root.calls).toBeGreaterThan(6); expect(p.processingMs).toBeGreaterThan(300000);
    expect(p.roles.STRATEGIST).toMatchObject({ format: "TEXT", effort: "HIGH", call: { completionTokens: 65536 } });
    expect(p.roles.REVIEWER.holdback.calls).toBe(3); expect(p.roles.TRANSLATOR.format).toBe("JSON");
    const snapshot = { schemaVersion: 1 as const, rootRequestId: randomUUID(), policyDigest: hash("resource-policy-v1", p), lineage: [randomUUID()], deadlineAt: "2026-10-27T12:00:00Z", consumed: { calls: 0, inputUnits: 0, completionTokens: 0 }, reserved: { calls: 0, inputUnits: 0, completionTokens: 0 }, uncertainDispatch: false, accountingDigest: "a".repeat(64) };
    expect(() => admitRoleCall(p, snapshot, "STRATEGIST", { calls: 1, inputUnits: 1000000, completionTokens: 65536 }, Date.parse("2026-10-26"))).not.toThrow();
    expect(() => admitRoleCall(p, { ...snapshot, uncertainDispatch: true }, "STRATEGIST", { calls: 1, inputUnits: 1, completionTokens: 1 }, Date.parse("2026-10-26"))).toThrow("BOUNDARY");
  });
  it("retains the old specialized-call bound unless the new budget interpretation is explicit", () => {
    const budget = newBudget("EDUCATIONAL"); budget.consumed = { ...budget.consumed, modelCalls: 8, planningCalls: 8 };
    expect(RuntimeBudgetV2Schema.safeParse(budget).success).toBe(false);
    const p = offlineResourcePolicy("a".repeat(64), randomUUID());
    budget.aiFirst = { schemaVersion: 1, policyDigest: hash("resource-policy-v1", p), limits: p.root, processingMs: p.processingMs };
    expect(RuntimeBudgetV2Schema.safeParse(budget).success).toBe(true);
    budget.processingStartedAt = "2026-10-26T10:00:00Z"; budget.executionDeadlineAt = "2026-10-26T14:00:01Z";
    expect(RuntimeBudgetV2Schema.safeParse(budget).success).toBe(false);
  });
  it("keeps reasoning inside completion totals and preserves unreported subsets as unknown", () => {
    expect(openAIUsage({ prompt_tokens: 40, completion_tokens: 100, reasoning_tokens: 80 })).toMatchObject({ totalTokens: 140, completionTokens: 100, reasoningTokens: 80 });
    expect(openAIUsage({ prompt_tokens: 40, completion_tokens: 100 })?.reasoningTokens).toBeUndefined();
  });
  it("retains exact natural text and reported model/fingerprint through the shared adapter", async () => {
    const text = "  Full natural study strategy. 🧠\n\nStop after success.\n";
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ model: "deepseek-flash", system_fingerprint: "fp_offline", choices: [{ finish_reason: "stop", message: { content: text } }], usage: { prompt_tokens: 40, completion_tokens: 100 } }) }));
    vi.stubGlobal("fetch", fetch);
    const response = await new DeepSeekAdapter("offline-test", "deepseek-flash").generateResponse([{ role: "user", content: "Plan" }], "Strategize", [], { preserveText: true, responseFormat: "text", thinking: "enabled", reasoningEffort: "high", maxTokens: 65536, telemetry: false, singleAttempt: true });
    expect(response).toMatchObject({ text, model: "deepseek-flash", fingerprint: "fp_offline" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects role/purpose confusion rather than changing review accounting", () => {
    expect(RoleCallSchema.safeParse({ schemaVersion: 1, key: randomUUID(), role: "REVIEWER", purpose: "REPAIR", policyDigest: "a".repeat(64), inputDigest: "a".repeat(64), promptDigest: "a".repeat(64), format: "JSON", effort: "HIGH" }).success).toBe(false);
  });
});
