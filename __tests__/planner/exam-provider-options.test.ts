import { describe, expect, it, vi, afterEach } from "vitest";
import { GeminiAdapter } from "@/lib/ai/providers/gemini";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
describe("Exam provider attempt controls", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses one Gemini SDK attempt, disabled 2.5 Flash thinking, abort and bounded output metadata", async () => {
    const adapter = new GeminiAdapter("synthetic-key", "gemini-2.5-flash");
    const generateContent = vi.fn().mockResolvedValue({ text: "{}", candidates: [{ finishReason: "MAX_TOKENS" }] });
    Object.assign(adapter, { ai: { models: { generateContent } } });
    const signal = new AbortController().signal;
    expect(await adapter.generateResponse([],"JSON",[],{ singleAttempt: true,thinking:"disabled",signal,maxTokens:14000,responseFormat:"json_object" })).toMatchObject({ finishReason:"MAX_TOKENS" });
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ httpOptions:{ retryOptions:{ attempts:1 } }, thinkingConfig:{ thinkingBudget:0 },abortSignal:signal,maxOutputTokens:14000,responseMimeType:"application/json" });
    generateContent.mockRejectedValue({ status:503 });
    await expect(adapter.generateResponse([],"JSON",[],{ singleAttempt:true })).rejects.toThrow(); expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it("does not add the Exam thinking or retry settings to legacy Gemini calls", async () => {
    const adapter = new GeminiAdapter("synthetic-key", "gemini-2.5-flash"); const generateContent = vi.fn().mockResolvedValue({ text:"{}" });
    Object.assign(adapter,{ ai:{ models:{ generateContent } } });
    await adapter.generateResponse([],"JSON",[],{ thinking:"disabled" });
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty("thinkingConfig"); expect(generateContent.mock.calls[0][0].config).not.toHaveProperty("httpOptions");
  });
  it("suppresses the DeepSeek thinking-parameter retry for a single-attempt caller", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("thinking not supported",{ status:400 })); vi.stubGlobal("fetch",fetcher);
    const adapter = new DeepSeekAdapter("synthetic-key","synthetic-model");
    await expect(adapter.generateResponse([],"JSON",[],{ thinking:"disabled",singleAttempt:true })).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
