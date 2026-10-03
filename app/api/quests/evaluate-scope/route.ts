import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
import { reserveQuota, releaseQuota } from "@/lib/ai/usage-limiter";
import { rateLimit, getClientIp, ipKey } from "@/lib/rate-limit";
import { evaluateSyllabusScopeWithAI } from "@/lib/ai/scope-evaluator";

export const dynamic = "force-dynamic";

const scopeSchema = z.object({
  nodeTitle: z.string().max(200).optional(),
  nodeDescription: z.string().max(1000).optional(),
  nodeTier: z.number().int().min(1).max(10).optional(),
  questTitle: z.string().max(200).optional(),
  planDescription: z.string().max(2000).optional(),
  targetMinutes: z.number().int().min(5).max(600).optional(),
});

/**
 * POST /api/quests/evaluate-scope
 * Evaluates what percentage of a chapter syllabus is covered by a student's
 * study plan. S4: quota-reserved (atomic), IP rate-limited, input-bounded.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // S4: per-IP sliding-window limit (paired with the per-user quota below).
    const ipLimit = await rateLimit(`scope:ip:${ipKey(getClientIp(req))}`, {
      limit: 20,
      windowMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = scopeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid scope-evaluation input.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // S4: atomic reservation BEFORE the (up to 3-generation) AI evaluation.
    // A configured owner account bypasses the reservation (charged === false)
    // and is permitted via `unlimited`.
    const quota = await reserveQuota(session.userId, "scope");
    if (!quota.charged && !quota.unlimited) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          feature: "scope",
          remaining: 0,
          limit: quota.limit,
          resetsAt: quota.resetsAt,
        },
        { status: 429 }
      );
    }

    const {
      nodeTitle,
      nodeDescription,
      nodeTier,
      questTitle,
      planDescription,
      targetMinutes,
    } = parsed.data;

    try {
      const evaluation = await evaluateSyllabusScopeWithAI({
        nodeTitle: String(nodeTitle || ""),
        nodeDescription: String(nodeDescription || ""),
        nodeTier: Number(nodeTier) || 1,
        questTitle: String(questTitle || ""),
        planDescription: String(planDescription || ""),
        targetMinutes: Number(targetMinutes) || 45,
      });

      return NextResponse.json(evaluation, { status: 200 });
    } catch (err) {
      console.error("Scope evaluation failed:", err);
      await releaseQuota(session.userId, "scope").catch(() => {});
      return NextResponse.json(
        { error: "Scope evaluation failed. Please try again." },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("POST /api/quests/evaluate-scope error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
