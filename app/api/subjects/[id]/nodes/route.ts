import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function getUserId(req: NextRequest): Promise<number | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    if (payload && payload.userId) {
      return payload.userId as number;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await props.params;
    const subjectId = parseInt(params.id, 10);

    if (isNaN(subjectId)) {
      return NextResponse.json({ error: "Invalid subject ID" }, { status: 400 });
    }

    // Verify the subject belongs to the authenticated user
    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        userId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        examBoard: true,
        level: true,
        color: true,
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    // Fetch strictly projected subject nodes
    const nodes = await prisma.subjectNode.findMany({
      where: {
        subjectId,
      },
      select: {
        id: true,
        nodeId: true,
        tier: true,
        title: true,
        description: true,
        difficulty: true,
        spAward: true,
        progress: true,
        isMastered: true,
        masteredAt: true,
      },
      orderBy: { id: "asc" },
    });

    // Calculate minted SP from mastered nodes (O(N) in memory where N=48)
    const mintedSP = nodes
      .filter((n) => n.isMastered)
      .reduce((sum, n) => sum + (n.spAward || 0), 0);

    const isApexReady = mintedSP >= 115;

    return NextResponse.json({
      success: true,
      subject,
      nodes,
      mintedSP,
      totalSP: 115,
      isApexReady,
    });
  } catch (error) {
    console.error("GET /api/subjects/[id]/nodes error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
