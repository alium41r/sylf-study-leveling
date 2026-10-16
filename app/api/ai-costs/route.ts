import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-costs
 * Diagnostic token/cost telemetry for the authenticated user's AI usage
 * (today + last 7 days), grouped by model and feature. Costs are estimates
 * derived from the AI_COST_USD_PER_1M rate table — approximate only.
 * Used by the Sylvie workspace's Dev Mode usage panel.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const rows = await prisma.aiUsageLog.findMany({
      where: { userId, createdAt: { gte: weekStart } },
      select: {
        feature: true,
        workload: true,
        model: true,
        provider: true,
        promptTokens: true,
        completionTokens: true,
        cacheHitTokens: true,
        estimatedCostUsd: true,
        requestId: true, rootRequestId: true, reasoningTokens: true, latencyMs: true, outcome: true, usageKnown: true, cacheUsageKnown: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const aggregate = (since: Date) => {
      const slice = rows.filter((r) => r.createdAt >= since);
      const byModel: Record<
        string,
        {
          requests: number;
          promptTokens: number;
          completionTokens: number;
          cacheHitTokens: number;
          costUsd: number;
          unknownCostRequests: number;
        }
      > = {};
      const byFeature: Record<
        string,
        {
          requests: number;
          promptTokens: number;
          completionTokens: number;
          cacheHitTokens: number;
          costUsd: number;
          unknownCostRequests: number;
        }
      > = {};

      let totalRequests = 0;
      let totalPrompt = 0;
      let totalCompletion = 0;
      let totalCacheHit = 0;
      let totalCost = 0;
      let unknownCostRequests = 0;
      let reasoningTokens = 0, latencyTotalMs = 0, timedDispatches = 0, failedDispatches = 0, unknownUsageRequests = 0, unknownCacheRequests = 0;
      const roots = new Set<string>();

      for (const r of slice) {
        // Old logs used zero for missing prices. Retain their stored value,
        // but do not certify it as a priced durable-dispatch receipt.
        const costUnknown = r.estimatedCostUsd === null || r.requestId === null && r.estimatedCostUsd === 0;
        roots.add(r.rootRequestId ?? `legacy-${totalRequests}`);
        if (r.reasoningTokens != null) reasoningTokens += r.reasoningTokens;
        if (r.latencyMs != null) { latencyTotalMs += r.latencyMs; timedDispatches++; }
        if (r.outcome === "FAILED" || r.outcome === "CANCELLED") failedDispatches++;
        if (r.usageKnown !== true) unknownUsageRequests++;
        if (r.cacheUsageKnown !== true) unknownCacheRequests++;
        totalRequests += 1;
        totalPrompt += r.promptTokens;
        totalCompletion += r.completionTokens;
        totalCacheHit += r.cacheHitTokens || 0;
        totalCost += r.estimatedCostUsd ?? 0;
        if (costUnknown) unknownCostRequests++;

        const m = (byModel[r.model] ??= {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cacheHitTokens: 0,
          costUsd: 0,
          unknownCostRequests: 0,
        });
        m.requests += 1;
        m.promptTokens += r.promptTokens;
        m.completionTokens += r.completionTokens;
        m.cacheHitTokens += r.cacheHitTokens || 0;
        m.costUsd += r.estimatedCostUsd ?? 0;
        if (costUnknown) m.unknownCostRequests++;

        const f = (byFeature[r.feature] ??= {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cacheHitTokens: 0,
          costUsd: 0,
          unknownCostRequests: 0,
        });
        f.requests += 1;
        f.promptTokens += r.promptTokens;
        f.completionTokens += r.completionTokens;
        f.cacheHitTokens += r.cacheHitTokens || 0;
        f.costUsd += r.estimatedCostUsd ?? 0;
        if (costUnknown) f.unknownCostRequests++;
      }

      const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
      return {
        totalRequests, logicalRequests: roots.size, reasoningTokens, failedDispatches, unknownUsageRequests, unknownCacheRequests,
        averageDispatchLatencyMs: timedDispatches ? Math.round(latencyTotalMs / timedDispatches) : null, timedDispatches,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        cacheHitTokens: totalCacheHit,
        costUsd: unknownCostRequests ? null : round(totalCost), knownCostUsd: round(totalCost),
        unknownCostRequests,
        costComplete: unknownCostRequests === 0,
        byModel: Object.entries(byModel)
          .map(([model, v]) => ({ model, ...v, knownCostUsd: round(v.costUsd), costUsd: v.unknownCostRequests ? null : round(v.costUsd) }))
          .sort((a, b) => b.knownCostUsd - a.knownCostUsd),
        byFeature: Object.entries(byFeature)
          .map(([feature, v]) => ({ feature, ...v, knownCostUsd: round(v.costUsd), costUsd: v.unknownCostRequests ? null : round(v.costUsd) }))
          .sort((a, b) => b.knownCostUsd - a.knownCostUsd),
      };
    };

    return NextResponse.json(
      {
        note: "Per-dispatch estimates at versioned paid list prices; DeepSeek peak upper bound. Unknown usage, prices and grounding charges remain unknown. Known subtotal excludes unknown charges. Historical rows can be logical aggregates. Deterministic replies make no model call.",
        today: aggregate(dayStart),
        last7Days: aggregate(weekStart),
      },
      { status: 200 }
    );
  } catch {
    console.error("GET /api/ai-costs unavailable");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
