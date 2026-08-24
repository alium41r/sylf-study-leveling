import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-costs
 * Diagnostic token/cost telemetry for the authenticated user's AI usage
 * (today + last 7 days), grouped by model and feature. Costs are estimates
 * derived from the AI_COST_USD_PER_1M rate table — approximate only.
 * Used by the System workspace's Dev Mode usage panel.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;

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
        }
      > = {};

      let totalRequests = 0;
      let totalPrompt = 0;
      let totalCompletion = 0;
      let totalCacheHit = 0;
      let totalCost = 0;

      for (const r of slice) {
        totalRequests += 1;
        totalPrompt += r.promptTokens;
        totalCompletion += r.completionTokens;
        totalCacheHit += r.cacheHitTokens || 0;
        totalCost += r.estimatedCostUsd;

        const m = (byModel[r.model] ??= {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cacheHitTokens: 0,
          costUsd: 0,
        });
        m.requests += 1;
        m.promptTokens += r.promptTokens;
        m.completionTokens += r.completionTokens;
        m.cacheHitTokens += r.cacheHitTokens || 0;
        m.costUsd += r.estimatedCostUsd;

        const f = (byFeature[r.feature] ??= {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cacheHitTokens: 0,
          costUsd: 0,
        });
        f.requests += 1;
        f.promptTokens += r.promptTokens;
        f.completionTokens += r.completionTokens;
        f.cacheHitTokens += r.cacheHitTokens || 0;
        f.costUsd += r.estimatedCostUsd;
      }

      const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
      return {
        totalRequests,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        cacheHitTokens: totalCacheHit,
        costUsd: round(totalCost),
        byModel: Object.entries(byModel)
          .map(([model, v]) => ({ model, ...v, costUsd: round(v.costUsd) }))
          .sort((a, b) => b.costUsd - a.costUsd),
        byFeature: Object.entries(byFeature)
          .map(([feature, v]) => ({ feature, ...v, costUsd: round(v.costUsd) }))
          .sort((a, b) => b.costUsd - a.costUsd),
      };
    };

    return NextResponse.json(
      {
        note: "Estimated costs (AI_COST_USD_PER_1M rate table, cache-aware). Deterministic replies are not LLM calls and are not logged here.",
        today: aggregate(dayStart),
        last7Days: aggregate(weekStart),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/ai-costs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
