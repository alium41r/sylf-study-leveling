// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn(async (...input: unknown[]) => { void input; return {}; }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiUsageLog: { upsert } } }));
import { observeAiDispatch, withAiRequest } from "@/lib/ai/telemetry";
import { estimateCostUsd } from "@/lib/ai/usage-logger";
import { geminiUsage, openAIUsage } from "@/lib/ai/providers/usage";
afterEach(() => { vi.clearAllMocks(); });
describe("per-dispatch accounting", () => {
  it("records failed attempts and actual mixed models under one root without raw data", async () => {
    await withAiRequest({ userId: 7, feature: "planner", workload: "test" }, async () => {
      await expect(observeAiDispatch("gemini", "requested", async () => { throw Error("private prompt"); }, () => ({}))).rejects.toThrow();
      await observeAiDispatch("deepseek", "alias", async () => ({ model: "deepseek-flash", usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28, reasoningTokens: 5, cacheHitTokens: 10 } }), value => value);
    });
    const pending = (upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;
    expect(pending).toMatchObject({ accountingState: "DISPATCHED", usageKnown: false, latencyMs: null });
    const [failed, success] = upsert.mock.calls.filter(call => Object.keys((call[0] as { update: object }).update).length).map(call => (call[0] as { update: Record<string, unknown> }).update);
    expect(failed).toMatchObject({ outcome: "FAILED", usageKnown: false, estimatedCostUsd: null });
    expect(success).toMatchObject({ model: "deepseek-flash", requestedModel: "alias", reasoningTokens: 5, promptTokens: 20, completionTokens: 8, cacheHitTokens: 10, usageKnown: true, dispatchIndex: 1 });
    expect(success.rootRequestId).toBe(failed.rootRequestId); expect(success.requestId).not.toBe(failed.requestId);
    expect(JSON.stringify(upsert.mock.calls)).not.toContain("private prompt");
  });
  it("does not double-record external durable accounting and survives logging failure", async () => {
    upsert.mockRejectedValueOnce(Error("db secret"));
    await expect(withAiRequest({ userId: 7, feature: "chat", workload: "test" }, async () => {
      await observeAiDispatch("deepseek", "deepseek-flash", async () => "ok", () => ({}), false);
      return observeAiDispatch("deepseek", "custom", async () => "ok", () => ({}));
    })).resolves.toBe("ok");
    expect(upsert).toHaveBeenCalledTimes(2);
  });
  it("keeps unknown pricing null and counts cached/reasoning subsets once", () => {
    expect(estimateCostUsd("custom-model", 100, 50)).toBeNull();
    expect(estimateCostUsd("deepseek-flash", 1000, 1000, 1000)).toBeCloseTo(0.001206, 9);
    expect(openAIUsage({ prompt_tokens: 20, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 5 }, prompt_tokens_details: { cached_tokens: 10 } })).toMatchObject({ completionTokens: 8, reasoningTokens: 5, cacheHitTokens: 10 });
    expect(geminiUsage({ promptTokenCount: 20, candidatesTokenCount: 3, thoughtsTokenCount: 5, cachedContentTokenCount: 10 })).toMatchObject({ completionTokens: 8, reasoningTokens: 5, cacheHitTokens: 10 });
  });
});
