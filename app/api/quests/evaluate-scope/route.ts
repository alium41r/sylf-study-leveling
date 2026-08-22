import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { evaluateSyllabusScopeWithAI } from "@/lib/ai/scope-evaluator";

export const dynamic = "force-dynamic";

/**
 * POST /api/quests/evaluate-scope
 * Evaluates what percentage of a chapter syllabus is covered by a student's study plan.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const {
      nodeTitle,
      nodeDescription,
      nodeTier,
      questTitle,
      planDescription,
      targetMinutes,
    } = body;

    const evaluation = await evaluateSyllabusScopeWithAI({
      nodeTitle: String(nodeTitle || ""),
      nodeDescription: String(nodeDescription || ""),
      nodeTier: Number(nodeTier) || 1,
      questTitle: String(questTitle || ""),
      planDescription: String(planDescription || ""),
      targetMinutes: Number(targetMinutes) || 45,
    });

    return NextResponse.json(evaluation, { status: 200 });
  } catch (error) {
    console.error("POST /api/quests/evaluate-scope error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
