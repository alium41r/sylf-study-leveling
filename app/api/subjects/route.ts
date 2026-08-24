import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";
import { SKELETON_NODES } from "@/lib/skill-tree-skeleton";
import { revalidateTag } from "next/cache";

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

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    // Fetch subjects with strict projections and today's session duration
    const subjects = await prisma.subject.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        code: true,
        examBoard: true,
        level: true,
        color: true,
        createdAt: true,
        lastCompiledAt: true,
        _count: {
          select: { nodes: true },
        },
        sessions: {
          where: {
            startedAt: {
              gte: todayStart,
            },
          },
          select: {
            durationMinutes: true,
            durationSeconds: true,
            endedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const enriched = subjects.map((sub: any) => {
      const todaySeconds = sub.sessions.reduce((acc: number, session: any) => {
        if (!session.endedAt) return acc;
        return acc + (session.durationSeconds || (session.durationMinutes * 60) || 0);
      }, 0);

      return {
        id: sub.id,
        name: sub.name,
        code: sub.code,
        examBoard: sub.examBoard,
        level: sub.level,
        color: sub.color,
        createdAt: sub.createdAt,
        lastCompiledAt: sub.lastCompiledAt,
        nodesCount: sub._count?.nodes || 0,
        todaySeconds,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET subjects error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.name || !body.code) {
      return NextResponse.json(
        { error: "Subject name and code are required" },
        { status: 400 }
      );
    }

    const cleanCode = String(body.code).trim().toUpperCase();
    const cleanName = String(body.name).trim();
    const cleanExamBoard = String(body.examBoard || "CAIE").trim().toUpperCase();
    const cleanLevel = String(body.level || "A-Level").trim();
    const cleanColor = String(body.color || "#8B5CF6").trim();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });

      const subject = await tx.subject.upsert({
        where: {
          userId_code: { userId, code: cleanCode },
        },
        create: {
          userId,
          name: cleanName,
          code: cleanCode,
          examBoard: cleanExamBoard,
          level: cleanLevel,
          color: cleanColor,
        },
        update: {
          name: cleanName,
          examBoard: cleanExamBoard,
          level: cleanLevel,
          color: cleanColor,
        },
      });

      // Synchronously provision all 48 constellation skeleton nodes
      const nodePayloads = SKELETON_NODES.map((node) => ({
        subjectId: subject.id,
        nodeId: node.id,
        tier: node.tier,
        title: `${cleanName} - ${node.label}`,
        description: node.description,
        difficulty: Math.min(5, Math.max(1, Math.ceil(node.tier / 2))),
        spAward: node.tier <= 3 ? 1 : node.tier <= 5 ? 2 : node.tier <= 7 ? 3 : node.tier <= 9 ? 4 : 0,
        progress: 0.0,
        isMastered: false,
      }));

      await tx.subjectNode.createMany({
        data: nodePayloads,
        skipDuplicates: true,
      });

      return { subject, username: user?.username };
    });

    if (result.username) {
      try {
        revalidateTag(`user-${result.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${result.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json(
      {
        ...result.subject,
        nodesCount: SKELETON_NODES.length,
        todaySeconds: 0,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST subject error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
