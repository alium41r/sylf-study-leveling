import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    
    // Fetch the most recent insights for this user, ordered by creation date
    const insights = await prisma.aiInsight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json(insights, { status: 200 });
  } catch (error: any) {
    console.error("Insights API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
