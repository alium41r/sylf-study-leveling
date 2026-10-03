// ============================================================
// AI Usage Logger — request-level cost telemetry
// ============================================================
// Every successful LLM generation is recorded to AiUsageLog with
// token counts and an estimated USD cost so the owner can see where
// the DeepSeek balance actually goes (chat vs planner vs research).
//
// DeepSeek's automatic context cache bills cache-hit input tokens at
// ~10% of the normal input price, so telemetry splits input into
// cached vs fresh and prices each at its real rate. (DeepSeek caches
// the stable prompt prefix automatically — keeping the system prompt
// stable across requests is what makes the cache hit.)
//
// Logging is best-effort and NEVER throws into the chat flow: if the
// table or client is unavailable, the request still succeeds.
// ============================================================

import { prisma } from "@/lib/prisma";
import { AI_COST_USD_PER_1M, HISTORICAL_MODEL_COST_USD_PER_1M } from "./config";

export interface AiUsageEntry {
  userId: number;
  feature: "chat" | "planner" | "syllabus" | "other";
  workload?: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens?: number;
}

/** Rough USD estimate; returns 0 for providers without a configured rate. */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cacheHitTokens = 0
): number {
  // Active rates first; the historical table only prices usage recorded before
  // the V4.1 Flash migration, so old rows still report what they cost.
  const rate = AI_COST_USD_PER_1M[model] ?? HISTORICAL_MODEL_COST_USD_PER_1M[model];
  if (!rate) return 0;

  const totalInput = Math.max(0, promptTokens);
  const hit = Math.min(Math.max(0, cacheHitTokens), totalInput);
  const miss = totalInput - hit;
  const cachedRate = rate.inputCached ?? rate.input * 0.1;

  const cost =
    (miss / 1_000_000) * rate.input +
    (hit / 1_000_000) * cachedRate +
    (Math.max(0, completionTokens) / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

export async function logAiUsage(entry: AiUsageEntry, quiet = false): Promise<void> {
  try {
    // Guard: if the AiUsageLog table isn't available (older DB, test mocks),
    // skip silently — telemetry must never affect the chat flow.
    if (!(prisma as any).aiUsageLog) return;

    await prisma.aiUsageLog.create({
      data: {
        userId: entry.userId,
        feature: entry.feature,
        workload: entry.workload ?? null,
        provider: entry.provider,
        model: entry.model,
        promptTokens: Math.max(0, Math.round(entry.promptTokens || 0)),
        completionTokens: Math.max(0, Math.round(entry.completionTokens || 0)),
        cacheHitTokens: Math.max(0, Math.round(entry.cacheHitTokens || 0)),
        estimatedCostUsd: estimateCostUsd(
          entry.model,
          entry.promptTokens,
          entry.completionTokens,
          entry.cacheHitTokens
        ),
      },
    });
  } catch (e) {
    // Telemetry must never break the conversation.
    if (!quiet) console.error("[AI Usage Logger] Failed to record usage:", e);
  }
}
