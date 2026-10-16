import type { LLMUsage } from "./types";

type WireUsage = Record<string, unknown>;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
export function openAIUsage(raw?: WireUsage): LLMUsage | undefined {
  if (!raw || number(raw.prompt_tokens) === undefined || number(raw.completion_tokens) === undefined) return undefined;
  const input = number(raw.prompt_tokens)!; const output = number(raw.completion_tokens)!;
  const prompt = raw.prompt_tokens_details as WireUsage | undefined;
  const completion = raw.completion_tokens_details as WireUsage | undefined;
  return { promptTokens: input, completionTokens: output, totalTokens: number(raw.total_tokens) ?? input + output,
    cacheHitTokens: number(raw.prompt_cache_hit_tokens) ?? number(prompt?.cached_tokens),
    reasoningTokens: number(completion?.reasoning_tokens) };
}
export function geminiUsage(raw?: WireUsage): LLMUsage | undefined {
  if (!raw || number(raw.promptTokenCount) === undefined) return undefined;
  const input = number(raw.promptTokenCount)!;
  const reasoning = number(raw.thoughtsTokenCount);
  if (number(raw.candidatesTokenCount) === undefined && reasoning === undefined) return undefined;
  const output = (number(raw.candidatesTokenCount) ?? 0) + (reasoning ?? 0);
  return { promptTokens: input, completionTokens: output, totalTokens: number(raw.totalTokenCount) ?? input + output,
    reasoningTokens: reasoning, cacheHitTokens: number(raw.cachedContentTokenCount) };
}
