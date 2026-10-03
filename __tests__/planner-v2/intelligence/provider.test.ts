// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { dispatchMeteredProvider, type ProviderMeter, type MeteredProviderRequest } from "@/lib/planner/v2/intelligence/provider";
import { reserveProviderCapacity, providerCategory } from "@/lib/planner/v2/intelligence/provider-policy";
import { pricedProviderUsage } from "@/lib/ai/usage-pricing";
import { DurablePlannerError } from "@/lib/planner/v2/server/database";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { budgetFixture } from "../contracts/fixtures";

const response = (): LLMResponse => ({ text: '{"ok":true}', finishReason: "STOP", usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } });
const request = (): MeteredProviderRequest<{ ok: boolean }> => ({ messages: [{ role: "user", content: "Plan my practice" }], systemInstruction: "Return JSON", outputTokens: 100,
  policy: { purpose: "BLUEPRINT", reviewReserve: { inputTokens: 1000, outputTokens: 1000 } }, validate: r => JSON.parse(r.text!) });
function fakeMeter() {
  const events: string[] = []; const settled: unknown[] = []; const closed: unknown[] = []; const late: unknown[] = [];
  let n = 0; let stopped = false;
  const meter: ProviderMeter = {
    window: async () => { if (stopped) throw new DurablePlannerError("LEASE_EXPIRED", "Stopped", "RECOVERY"); return { now: Date.now(), deadline: Date.now() + 10000 }; },
    reserve: async route => { const id = `call_${++n}`; events.push(`dispatch:${id}:${route.model}`); return id; },
    settle: async (id, usage) => { settled.push({ id, usage }); events.push(`settle:${id}`); },
    close: async (id, result) => { closed.push({ id, result }); events.push(`close:${id}`); },
    lateUsage: async (id, usage) => { late.push({ id, usage }); },
  };
  return { meter, events, settled, closed, late, stop: () => { stopped = true; } };
}
describe("shared metered provider dispatch", () => {
  it("commits each dispatch before exactly one upstream attempt and charges fallback independently", async () => {
    const m = fakeMeter(); let n = 0;
    const generate = vi.fn(async (_messages, _system, _tools, options) => {
      expect(m.events.at(-1)).toContain("dispatch:"); expect(options).toMatchObject({ singleAttempt: true, maxTokens: 100, responseFormat: "json_object" });
      if (++n === 1) throw new Error("Private provider key/message"); return response();
    });
    const result = await dispatchMeteredProvider(m.meter, request(), { adapter: () => ({ generateResponse: generate }) });
    expect(result.value).toEqual({ ok: true }); expect(result.attempts).toHaveLength(2); expect(generate).toHaveBeenCalledTimes(2);
    expect(m.closed[0]).toMatchObject({ result: { errorCode: "PROVIDER_FAILURE" } }); expect(JSON.stringify(result)).not.toContain("Private");
    expect(m.settled).toHaveLength(1); expect(m.settled[0]).toMatchObject({ usage: { costUsd: null } });
  });
  it("settles truncation/malformed output before fallback and never accepts an unknown finish reason", async () => {
    const m = fakeMeter(); let n = 0;
    const result = await dispatchMeteredProvider(m.meter, { ...request(), workload: "general_chat" }, { adapter: () => ({ generateResponse: async () => {
      n++; return n === 1 ? { ...response(), finishReason: "MAX_TOKENS" } : n === 2 ? { ...response(), text: "{bad" } : response();
    } }) });
    expect(m.settled).toHaveLength(3); expect(result.attempts.map(a => a.code)).toEqual(["OUTPUT_TRUNCATED", "INVALID_OUTPUT", undefined]);
    expect(m.closed[0]).toMatchObject({ result: { finishReason: "MAX_TOKENS" } });
    await expect(dispatchMeteredProvider(fakeMeter().meter, request(), { adapter: () => ({ generateResponse: async () => ({ ...response(), finishReason: undefined }) }) })).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
  });
  it("retains unknown usage and does not fabricate a settlement", async () => {
    const m = fakeMeter(); await expect(dispatchMeteredProvider(m.meter, request(), { adapter: () => ({ generateResponse: async () => ({ ...response(), usage: undefined }) }) })).rejects.toMatchObject({ detail: { code: "PROVIDER_FAILURE" } });
    expect(m.settled).toHaveLength(0); expect(m.closed).toHaveLength(2);
  });
  it("meters the effective DeepSeek model after alias/override resolution", async () => {
    const m = fakeMeter(); const adapter = { resolveModelName: () => "custom-deepseek", generateResponse: async () => response() };
    const result = await dispatchMeteredProvider(m.meter, request(), { adapter: () => adapter }); expect(result.model).toBe("custom-deepseek");
    expect(m.events[0]).toContain("custom-deepseek"); expect(m.settled[0]).toMatchObject({ usage: { costUsd: null } });
  });
  it("does not dispatch after cancellation or expired root time", async () => {
    const m = fakeMeter(); const controller = new AbortController(); controller.abort(); const adapter = vi.fn();
    await expect(dispatchMeteredProvider(m.meter, { ...request(), signal: controller.signal }, { adapter })).rejects.toMatchObject({ detail: { code: "CANCELLED" } });
    expect(adapter).not.toHaveBeenCalled(); expect(m.events).toEqual([]);
    await expect(dispatchMeteredProvider({ ...m.meter, window: async () => ({ now: 20, deadline: 10 }) }, request(), { adapter: () => ({ generateResponse: async () => response() }) })).rejects.toMatchObject({ detail: { code: "BUDGET_EXHAUSTED" } });
    expect(m.events).toEqual([]);
  });
  it("aborts promptly on durable cancellation/lease loss, prevents fallback, and reconciles late usage only", async () => {
    const m = fakeMeter(); let deliver!: (r: LLMResponse) => void; let signal: AbortSignal | undefined;
    const generate = vi.fn(async (_m, _s, _t, options) => { signal = options.signal; m.stop(); return new Promise<LLMResponse>(resolve => { deliver = resolve; }); });
    await expect(dispatchMeteredProvider(m.meter, request(), { pollMs: 10, adapter: () => ({ generateResponse: generate }) })).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    expect(signal!.aborted).toBe(true); expect(generate).toHaveBeenCalledTimes(1); expect(m.settled).toHaveLength(0);
    deliver(response()); await new Promise(resolve => setTimeout(resolve, 0)); expect(m.late).toHaveLength(1); expect(m.settled).toHaveLength(0);
  });
  it("bounds an adapter that ignores abort and meters timeout fallback", async () => {
    const m = fakeMeter(); let deliver!: (r: LLMResponse) => void; let n = 0;
    const result = await dispatchMeteredProvider(m.meter, { ...request(), callTimeoutMs: 15 }, { adapter: () => ({ generateResponse: async () => {
      if (++n === 1) return new Promise(resolve => { deliver = resolve; }); return response();
    } }) });
    expect(result.attempts[0].code).toBe("PROVIDER_TIMEOUT"); deliver(response()); await new Promise(resolve => setTimeout(resolve, 0)); expect(m.late).toHaveLength(1);
  });
  it("keeps invalid/missing model pricing unknown and applies shared cached-input pricing", () => {
    expect(pricedProviderUsage("unknown", response().usage!).costUsd).toBeNull();
    const usage = { promptTokens: 1000000, completionTokens: 0, totalTokens: 1000000, cacheHitTokens: 500000 };
    expect(pricedProviderUsage("deepseek-v4-flash", usage).costUsd).toBeCloseTo(0.1485);
    expect(() => pricedProviderUsage("unknown", { ...usage, promptTokens: NaN })).toThrow(/INVALID_PROVIDER_USAGE/);
  });
});
describe("durable review/research capacity policy", () => {
  it("requires initial review capacity and cannot reduce it across fallback/takeover", () => {
    const b = budgetFixture(); expect(() => reserveProviderCapacity(b, {}, { purpose: "BLUEPRINT" }, new Date(), true)).toThrow(/mandatory review/);
    const guard = reserveProviderCapacity(b, {}, request().policy, new Date(), true);
    expect(() => reserveProviderCapacity(b, guard, { purpose: "BLUEPRINT", reviewReserve: { inputTokens: 1, outputTokens: 1 } }, new Date(), true)).toThrow(/cannot be reduced/);
    b.consumed.modelCalls = 6; expect(() => reserveProviderCapacity(b, guard, { purpose: "BLUEPRINT" }, new Date(), true)).toThrow(/reserved for review/);
  });
  it("holds input/output and specialized planning capacity, then releases only the review slot for review", () => {
    const b = budgetFixture(); const guard = { reviewReserve: { inputTokens: 1000, outputTokens: 1000 } };
    b.consumed.inputTokens = 79500; expect(() => reserveProviderCapacity(b, guard, { purpose: "BLUEPRINT" }, new Date(), true)).toThrow(/reserved for review/);
    b.consumed.inputTokens = 0; b.consumed.planningCalls = 4; expect(() => reserveProviderCapacity(b, guard, { purpose: "BLUEPRINT" }, new Date(), true, 1)).toThrow(/reserved for review/);
    expect(() => reserveProviderCapacity(b, guard, { purpose: "REVIEW" }, new Date(), true, 1)).not.toThrow();
  });
  it("allows repair only when both repair and verification fit; verification is a separate metered call", () => {
    const b = budgetFixture(); const guard = { reviewCompleted: true, reviewReserve: { inputTokens: 1000, outputTokens: 1000 } };
    expect(() => reserveProviderCapacity(b, guard, { purpose: "REPAIR" }, new Date(), true)).toThrow(/verification/);
    const g = reserveProviderCapacity(b, guard, { purpose: "REPAIR", verificationReserve: { inputTokens: 500, outputTokens: 500 } }, new Date(), true);
    b.consumed.modelCalls = 6; expect(() => reserveProviderCapacity(b, g, { purpose: "REPAIR" }, new Date(), true)).toThrow(/reserved/);
    expect(() => reserveProviderCapacity(b, g, { purpose: "BLUEPRINT" }, new Date(), true)).toThrow(/verification/);
  });
  it("never renews the 120-second research window on OCR, fallback or takeover", () => {
    const b = budgetFixture(); b.profile = "RESEARCH"; b.processingStartedAt = "2026-10-03T10:00:00Z"; b.executionDeadlineAt = "2026-10-03T10:05:00Z";
    const g = reserveProviderCapacity(b, {}, { purpose: "RESEARCH" }, new Date(b.processingStartedAt), false);
    expect(g.researchDeadlineAt).toBe("2026-10-03T10:02:00.000Z");
    expect(reserveProviderCapacity(b, g, { purpose: "OCR" }, new Date("2026-10-03T10:01:00Z"), false).researchDeadlineAt).toBe(g.researchDeadlineAt);
    expect(providerCategory("OCR")).toBe("OTHER"); expect(() => reserveProviderCapacity(b, g, { purpose: "RESEARCH" }, new Date("2026-10-03T10:02:01Z"), false)).toThrow(/expired/);
  });
});
