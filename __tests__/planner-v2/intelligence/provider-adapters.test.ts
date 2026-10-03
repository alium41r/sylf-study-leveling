// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import { GroqAdapter } from "@/lib/ai/providers/groq";
import { GeminiAdapter } from "@/lib/ai/providers/gemini";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("normalized single-attempt adapter boundary", () => {
  it.each([["stop", "STOP"], ["tool_calls", "STOP"], ["length", "MAX_TOKENS"], ["content_filter", "OTHER"], [undefined, "OTHER"]])("normalizes DeepSeek finish %s to %s", async (reason, expected) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: reason, message: { content: "{}", reasoning_content: "Private chain" } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })));
    vi.stubGlobal("fetch", fetch); vi.stubEnv("DEEPSEEK_MODEL", "resolved-model"); const controller = new AbortController();
    const adapter = new DeepSeekAdapter("fixture-key", "requested-model");
    const response = await adapter.generateResponse([{ role: "user", content: "JSON" }], "System", [], { singleAttempt: true, signal: controller.signal });
    expect(response.finishReason).toBe(expected); expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe(adapter.resolveModelName("requested-model"));
  });
  it("does not invisibly retry DeepSeek's rejected thinking parameter in single-attempt mode", async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"unknown thinking parameter"}}', { status: 400 })); vi.stubGlobal("fetch", fetch);
    await expect(new DeepSeekAdapter("fixture-key").generateResponse([], "System", [], { thinking: "disabled", singleAttempt: true })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([["stop", "STOP"], ["length", "MAX_TOKENS"], ["content_filter", "OTHER"]])("normalizes Groq finish %s without SDK retries", async (reason, expected) => {
    const create = vi.fn(async () => ({ choices: [{ finish_reason: reason, message: { content: "{}" } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }));
    const adapter = new GroqAdapter("fixture-key", "fixture-model"); Object.assign(adapter, { groq: { chat: { completions: { create } } } });
    const controller = new AbortController(); const response = await adapter.generateResponse([], "System", [], { singleAttempt: true, signal: controller.signal });
    expect(response.finishReason).toBe(expected); expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0] as unknown as [unknown, { maxRetries: number; signal: AbortSignal }])[1]).toMatchObject({ maxRetries: 0, signal: controller.signal });
  });
  it("does not accept unmetered Groq error-XML recovery as a successful single attempt", async () => {
    const create = vi.fn(async () => { throw { error: { error: { code: "tool_use_failed", failed_generation: '<function=plan>{"ok":true}</function>' } } }; });
    const adapter = new GroqAdapter("fixture-key", "fixture-model"); Object.assign(adapter, { groq: { chat: { completions: { create } } } });
    await expect(adapter.generateResponse([], "System", [], { singleAttempt: true })).rejects.toThrow(); expect(create).toHaveBeenCalledTimes(1);
  });
  it("retains Gemini's normalized finish and single SDK attempt/abort configuration", async () => {
    const generateContent = vi.fn(async () => ({ text: "{}", candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } }));
    const adapter = new GeminiAdapter("fixture-key", "gemini-2.5-flash"); Object.assign(adapter, { ai: { models: { generateContent } } });
    const controller = new AbortController(); const response = await adapter.generateResponse([], "System", [], { singleAttempt: true, signal: controller.signal });
    expect(response.finishReason).toBe("MAX_TOKENS"); expect(generateContent).toHaveBeenCalledTimes(1);
    expect((generateContent.mock.calls[0] as unknown as [{ config: { abortSignal: AbortSignal; httpOptions: { retryOptions: { attempts: number } } } }])[0].config).toMatchObject({ abortSignal: controller.signal, httpOptions: { retryOptions: { attempts: 1 } } });
  });
});
