import { prisma } from "@/lib/prisma";
import { AI_COST_USD_PER_1M, AI_PRICING_VERSION } from "./config";

import { hasAiRequest } from "./telemetry";
import type { LLMUsage } from "./providers/types";

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

/** Versioned list-price estimate. Unknown models stay unknown. */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cacheHitTokens = 0
): number | null {
  // New dispatches use current rates only. Historical rows retain stored estimates.
  const canonical = model.startsWith("gemini-2.5-flash-") && !model.includes("lite") ? "gemini-2.5-flash" : model;
  const rate = AI_COST_USD_PER_1M[canonical];
  if (!rate || !Object.values(rate).every(value => Number.isFinite(value) && value >= 0)) return null;

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
  if (hasAiRequest()) return; // Per-dispatch receipts replace legacy aggregate writes.
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
  } catch {
    // Telemetry must never break the conversation.
    if (!quiet) console.warn("[AI telemetry] receipt unavailable");
  }
}

export interface AiDispatchEntry {
  userId: number; feature: "chat" | "planner" | "syllabus" | "other"; workload: string;
  provider: string; model: string; requestedModel: string; requestId: string; rootRequestId: string;
  dispatchIndex: number; latencyMs: number; outcome: string; modelVerified: boolean;
  retryIndex?: number; stage?: string;
  usage?: LLMUsage; finishReason?: string; grounding: boolean;
}
export async function logAiDispatch(entry: AiDispatchEntry, phase: "start" | "settle" = "settle"): Promise<void> {
  try {
    const { usage, ...metadata } = entry;
    const known = Boolean(usage);
    const data = {
      ...metadata, finishReason: entry.finishReason?.slice(0, 32),
      latencyMs: phase === "start" ? null : entry.latencyMs,
      promptTokens: usage?.promptTokens ?? 0, completionTokens: usage?.completionTokens ?? 0,
      cacheHitTokens: usage?.cacheHitTokens ?? 0, reasoningTokens: usage?.reasoningTokens ?? null,
      usageKnown: known, cacheUsageKnown: usage?.cacheHitTokens !== undefined,
      accountingState: phase === "start" ? "DISPATCHED" : known ? "SETTLED" : "UNKNOWN_SPEND",
      // Grounding fees/account credits are not inferable from token receipts.
      estimatedCostUsd: usage && !entry.grounding ? estimateCostUsd(entry.model, usage.promptTokens, usage.completionTokens, usage.cacheHitTokens) : null,
      pricingVersion: AI_PRICING_VERSION,
    };
    await prisma.aiUsageLog.upsert({ where: { requestId: entry.requestId }, create: data, update: phase === "start" ? {} : data });
  } catch { console.warn("[AI telemetry] receipt unavailable"); }
}
