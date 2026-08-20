import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";

/**
 * GET /api/quests
 * List quests for the authenticated user.
 * Query params:
 *   - date: ISO date string to filter by scheduledFor (default: today)
 *   - goalId: optional filter by goal
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

    const { searchParams } = new URL(req.url);
    const isAll = searchParams.get("all") === "true";
    
    const tz = await getUserTimezone(payload.userId as number);
    let date = searchParams.get("date");
    if (!date) {
      date = TimezoneService.getUserLocalDate(tz);
    }
    const todayStart = TimezoneService.getStartOfDayUTC(tz);
    const goalId = searchParams.get("goalId");

    const where: Record<string, unknown> = {
      userId: payload.userId as number,
    };

    if (!isAll) {
      where.scheduledFor = date;
    }

    if (goalId) {
      where.goalId = parseInt(goalId);
    }

    const quests = await prisma.quest.findMany({
      where,
      select: {
        id: true,
        userId: true,
        goalId: true,
        title: true,
        description: true,
        difficulty: true,
        status: true,
        xpReward: true,
        sylphReward: true,
        requiredMinutes: true,
        elapsedSeconds: true,
        scheduledFor: true,
        isGateKeyApplied: true,
        isKamishWardActive: true,
        completedAt: true,
        createdAt: true,
        goal: { select: { id: true, title: true } },
        sessions: {
          where: { startedAt: { gte: todayStart } },
          select: {
            durationMinutes: true,
            durationSeconds: true,
            startedAt: true,
            endedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const enriched = quests.map((q) => {
      const sessionSeconds = (q.sessions || []).reduce((acc: number, s: any) => {
        if (!s.endedAt) {
          const started = new Date(s.startedAt);
          const elapsed = Math.floor((now.getTime() - started.getTime()) / 1000);
          return acc + (elapsed >= 0 && elapsed <= 180 ? elapsed : 0);
        }
        return acc + (s.durationSeconds || (s.durationMinutes * 60) || 0);
      }, 0);

      const todaySeconds = sessionSeconds;

      const { sessions: _, ...rest } = q;
      return {
        ...rest,
        todaySeconds,
      };
    });

    return NextResponse.json(enriched, { status: 200 });
  } catch (error) {
    console.error("GET /api/quests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/quests
 * Bulk delete quests for the authenticated user.
 * Expects { ids: number[] } in the body.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    const result = await prisma.quest.deleteMany({
      where: {
        userId: payload.userId as number,
        id: { in: ids },
      },
    });

    return NextResponse.json({ success: true, count: result.count }, { status: 200 });
  } catch (error) {
    console.error("Failed to bulk delete quests:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
