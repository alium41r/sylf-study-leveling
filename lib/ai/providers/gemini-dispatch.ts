import type { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { aiSignal, observeAiDispatch } from "../telemetry";
import { geminiUsage } from "./usage";

type Params = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
/** Native grounding/OCR and adapter calls share one measured, cancellable dispatch. */
export function generateGeminiContent(ai: GoogleGenAI, params: Params, telemetry = true, attempt: { stage?: string; retryIndex?: number } = {}, onTextDelta?: (text: string) => void) {
  const config = params.config ?? {};
  const request = { ...params, config: {
    ...config, maxOutputTokens: config.maxOutputTokens ?? 16384, abortSignal: aiSignal(config.abortSignal),
    httpOptions: { ...config.httpOptions, retryOptions: { attempts: 1 } },
  } };
  return observeAiDispatch("gemini", params.model, async () => {
    if (!onTextDelta || config.tools?.length || config.responseMimeType === "application/json") return ai.models.generateContent(request);
    let last: GenerateContentResponse | undefined, text = "", model: string | undefined;
    let usage: GenerateContentResponse["usageMetadata"];
    let finish: NonNullable<GenerateContentResponse["candidates"]>[number]["finishReason"];
    for await (const chunk of await ai.models.generateContentStream(request)) {
      last = chunk; model = chunk.modelVersion || model; usage = chunk.usageMetadata || usage;
      finish = chunk.candidates?.[0]?.finishReason || finish;
      for (const part of chunk.candidates?.[0]?.content?.parts || []) {
        if (part.text && !part.thought) { text += part.text; onTextDelta(part.text); }
      }
    }
    if (!last || !finish) throw new Error("Provider stream interrupted");
    last.modelVersion = model; last.usageMetadata = usage;
    last.candidates = [{ ...last.candidates?.[0], finishReason: finish, content: { role: "model", parts: [{ text }] } }];
    return last;
  }, response => ({ model: response.modelVersion, usage: geminiUsage(response.usageMetadata as unknown as Record<string, unknown>),
    finishReason: response.candidates?.[0]?.finishReason, grounding: Boolean(config.tools?.some(tool => "googleSearch" in tool && Boolean(tool.googleSearch)) || response.candidates?.some(c => c.groundingMetadata)) }), telemetry, attempt);
}
