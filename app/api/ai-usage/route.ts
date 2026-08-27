import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getUsageReport } from "@/lib/ai/usage-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-usage
 * Returns the current user's daily AI usage report.
 * Response: { chat: QuotaCheckResult, planner: QuotaCheckResult }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const report = await getUsageReport(session.userId);
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error("GET /api/ai-usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
