import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getUsageReport } from "@/lib/ai/usage-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-usage
 * Returns the current user's daily AI usage report.
 * Response: { chat: QuotaCheckResult, planner: QuotaCheckResult }
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

    const report = await getUsageReport(payload.userId as number);
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error("GET /api/ai-usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
