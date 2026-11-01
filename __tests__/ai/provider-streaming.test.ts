// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const wire = vi.hoisted(() => ({ gemini: vi.fn(), groq: vi.fn(), upsert: vi.fn(async () => ({})) }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiUsageLog: { upsert: wire.upsert } } }));
vi.mock("groq-sdk", () => ({ default: class { chat = { completions: { create: wire.groq } }; } }));
vi.mock("@google/genai", async () => ({ ...await vi.importActual<typeof import("@google/genai")>("@google/genai"), GoogleGenAI: class { models = { generateContentStream: wire.gemini }; } }));
import { GenerateContentResponse, FinishReason } from "@google/genai";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import { GroqAdapter } from "@/lib/ai/providers/groq";
import { GeminiAdapter } from "@/lib/ai/providers/gemini";
import { withAiRequest } from "@/lib/ai/telemetry";
const message = [{ role: "user" as const, content: "Explain briefly" }];
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function* chunks(values: unknown[]) { for (const value of values) yield value; }

describe("provider text streaming preserves dispatch accounting", () => {
  it("opt-ins to DeepSeek reasoning deltas while buffering structured JSON separately",async()=>{
    const raw=[{model:"deepseek-flash",choices:[{delta:{reasoning_content:"Compare the accepted constraints. "}}]},{choices:[{delta:{reasoning_content:"Then check the dependencies."}}]},{choices:[{delta:{content:'{"ok":true}'},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:20,reasoning_tokens:15,prompt_cache_hit_tokens:0}}].map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")+"data: [DONE]\n\n";
    const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{expect(String(input)).toBe("https://api.deepseek.com/chat/completions");expect(init?.method).toBe("POST");return new Response(raw);});vi.stubGlobal("fetch",fetch);const reasoning:string[]=[];
    const result=await new DeepSeekAdapter("synthetic").generateResponse(message,"Fixture",[],{onReasoningDelta:text=>reasoning.push(text),responseFormat:"json_object",singleAttempt:true,telemetry:false});
    expect(reasoning).toEqual(["Compare the accepted constraints. ","Then check the dependencies."]);expect(result.reasoningText).toBe(reasoning.join(""));expect(result.text).toBe('{"ok":true}');expect(result.usage).toMatchObject({completionTokens:20,reasoningTokens:15});
    expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({stream:true,response_format:{type:"json_object"},stream_options:{include_usage:true}});
  });
  it("streams DeepSeek visible text and settles one receipt using final usage", async () => {
    const raw = [
      { model: "deepseek-flash", system_fingerprint:"synthetic-fingerprint", choices: [{ delta: { reasoning_content: "PRIVATE" } }] },
      { model: "deepseek-flash", choices: [{ delta: { content: "Hello " } }] },
      { model: "deepseek-flash", choices: [{ delta: { content: "world" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, prompt_cache_hit_tokens: 5, completion_tokens_details: { reasoning_tokens: 3 } } },
    ].map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + 'data: [DONE]\n\n';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(raw)));
    const text: string[] = [];
    const result = await withAiRequest({ userId: 7, feature: "chat", workload: "test" }, () => new DeepSeekAdapter("synthetic").generateResponse(message, "Instructions", [], { onTextDelta: value => text.push(value), singleAttempt: true }));
    expect(text).toEqual(["Hello ", "world"]); expect(result.text).toBe("Hello world");
    expect(result.fingerprint).toBe("synthetic-fingerprint");
    expect(result.usage).toMatchObject({ promptTokens: 10, completionTokens: 8, reasoningTokens: 3, cacheHitTokens: 5 });
    expect(wire.upsert).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(wire.upsert.mock.calls)).not.toContain("PRIVATE");
  });
  it("streams Groq GPT-OSS and reads final x_groq usage", async () => {
    wire.groq.mockResolvedValue(chunks([
      { model: "openai/gpt-oss-120b", choices: [{ delta: { content: "Answer" } }] },
      { model: "openai/gpt-oss-120b", choices: [{ delta: {}, finish_reason: "stop" }], x_groq: { usage: { prompt_tokens: 10, completion_tokens: 4 } } },
    ]));
    const text = vi.fn();
    const result = await new GroqAdapter("synthetic").generateResponse(message, "Instructions", [], { onTextDelta: text, singleAttempt: true });
    expect(text).toHaveBeenCalledWith("Answer"); expect(result.text).toBe("Answer"); expect(result.usage?.completionTokens).toBe(4);
  });
  it("streams Gemini visible parts, excludes thoughts and retains total output usage", async () => {
    const first = new GenerateContentResponse(); first.modelVersion = "gemini-2.5-flash";
    first.candidates = [{ content: { role: "model", parts: [{ text: "PRIVATE", thought: true }, { text: "Visible " }] } }];
    const last = new GenerateContentResponse(); last.candidates = [{ content: { role: "model", parts: [{ text: "answer" }] }, finishReason: FinishReason.STOP }];
    last.usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 5 };
    wire.gemini.mockResolvedValue(chunks([first, last]));
    const text: string[] = [];
    const result = await new GeminiAdapter("synthetic").generateResponse(message, "Instructions", [], { onTextDelta: value => text.push(value), singleAttempt: true });
    expect(text).toEqual(["Visible ", "answer"]); expect(result.text).toBe("Visible answer");
    expect(result.usage).toMatchObject({ completionTokens: 9, reasoningTokens: 5 });
  });
  it("marks truncated provider streams as failures with unknown spend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')));
    await expect(withAiRequest({ userId: 7, feature: "chat", workload: "test" }, () => new DeepSeekAdapter("synthetic").generateResponse(message, "Instructions", [], { onTextDelta: () => {} }))).rejects.toThrow();
    expect(wire.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: expect.objectContaining({ usageKnown: false, estimatedCostUsd: null, outcome: "FAILED" }) }));
  });
});
