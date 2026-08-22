import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";
import { QuestDifficulty } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { StudyScheduleService } from "@/lib/study-schedule-service";

import { calculateSemanticScopeWeight, evaluateSyllabusScopeWithAI } from "@/lib/ai/scope-evaluator";
import { calculateQuestRewards } from "@/lib/difficulty-engine";

/**
 * Calculates deterministic AI scope completion weight W_scope in [0.10, 1.00]
 */
export function calculateScopeWeight(
  node: { title: string; description: string; tier: number },
  quest: { title: string; description?: string | null; targetMinutes: number }
): number {
  const result = calculateSemanticScopeWeight({
    nodeTitle: node.title,
    nodeDescription: node.description,
    nodeTier: node.tier,
    questTitle: quest.title,
    planDescription: quest.description || "",
    targetMinutes: quest.targetMinutes,
  });
  return result.scopeWeight;
}

/**
 * GET /api/quests
 * List quests for the authenticated user.
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
        subjectId: true,
        subjectNodeId: true,
        title: true,
        description: true,
        difficulty: true,
        status: true,
        xpReward: true,
        sylphReward: true,
        targetMinutes: true,
        requiredMinutes: true,
        elapsedSeconds: true,
        scopeWeight: true,
        scheduledFor: true,
        isGateKeyApplied: true,
        isKamishWardActive: true,
        completedAt: true,
        createdAt: true,
        goal: { select: { id: true, title: true, color: true } },
        subject: { select: { id: true, name: true, code: true, color: true } },
        subjectNode: {
          select: {
            id: true,
            nodeId: true,
            title: true,
            tier: true,
            progress: true,
            isMastered: true,
            spAward: true,
          },
        },
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
 * POST /api/quests
 * Create a new Quest. Supports syllabus node binding and AI scope evaluation.
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
      subjectId: rawSubjectId,
      subjectNodeId: rawSubjectNodeId,
      goalId: rawGoalId,
      title,
      description,
      targetMinutes: rawTargetMinutes,
      difficulty: rawDifficulty,
      scheduledFor: rawScheduledFor,
    } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Quest title is required" }, { status: 400 });
    }

    const userId = payload.userId as number;
    // Manual creation clamp: 15-240 minutes (kept in sync with the modal).
    const parsedMinutes = Number(rawTargetMinutes);
    const targetMinutes = Number.isFinite(parsedMinutes)
      ? Math.min(240, Math.max(15, Math.round(parsedMinutes)))
      : 45;

    const tz = await getUserTimezone(userId);
    const scheduledFor =
      typeof rawScheduledFor === "string" && rawScheduledFor.trim().length > 0
        ? rawScheduledFor.trim()
        : TimezoneService.getUserLocalDate(tz);

    // ─── STRICT REST-DAY ALLOCATION GUARDRAIL ─────────────────
    // Manual creation must never place quests on fixed or floating rest days.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
      return NextResponse.json(
        { error: "Invalid scheduledFor. Expected YYYY-MM-DD." },
        { status: 400 }
      );
    }
    const isRestDay = await StudyScheduleService.isUserRestDay(userId, scheduledFor);
    if (isRestDay) {
      return NextResponse.json(
        {
          error: "REST_DAY_ALLOCATION_PROHIBITED",
          message: "Quests cannot be scheduled on designated rest days.",
        },
        { status: 400 }
      );
    }

    // 0. Validate goal link ownership when provided (color inheritance source)
    let linkedGoalId: number | null = null;
    if (rawGoalId !== undefined && rawGoalId !== null && rawGoalId !== "") {
      const parsedGoalId = Number(rawGoalId);
      if (!Number.isInteger(parsedGoalId) || parsedGoalId <= 0) {
        return NextResponse.json({ error: "Invalid goalId" }, { status: 400 });
      }
      const goal = await prisma.goal.findFirst({
        where: { id: parsedGoalId, userId },
        select: { id: true },
      });
      if (!goal) {
        return NextResponse.json(
          { error: "Goal not found or unauthorized" },
          { status: 404 }
        );
      }
      linkedGoalId = parsedGoalId;
    }

    let subjectNodeId: number | undefined = undefined;
    let subjectId: number | undefined = rawSubjectId ? Number(rawSubjectId) : undefined;
    let scopeWeight = 0.25;

    // 1. Evaluate Subject Node Binding & Scope Weight
    if (rawSubjectNodeId) {
      const parsedNodeId = Number(rawSubjectNodeId);
      const node = await prisma.subjectNode.findFirst({
        where: {
          id: parsedNodeId,
          subject: {
            userId,
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          tier: true,
          difficulty: true,
          subjectId: true,
        },
      });

      if (!node) {
        return NextResponse.json(
          { error: "Subject node not found or unauthorized" },
          { status: 404 }
        );
      }

      subjectNodeId = node.id;
      subjectId = node.subjectId;
      const evalResult = await evaluateSyllabusScopeWithAI({
        nodeTitle: node.title,
        nodeDescription: node.description,
        nodeTier: node.tier,
        questTitle: title.trim(),
        planDescription: description && typeof description === "string" ? description.trim() : "",
        targetMinutes,
      });
      scopeWeight = evalResult.scopeWeight;
    }

    // 2. Map difficulty and compute rewards (canonical unified standard)
    let difficulty: QuestDifficulty = QuestDifficulty.NORMAL;
    if (rawDifficulty && Object.values(QuestDifficulty).includes(rawDifficulty)) {
      difficulty = rawDifficulty as QuestDifficulty;
    }

    const rewards = calculateQuestRewards(targetMinutes, difficulty);
    const xpReward = rewards.xp;
    const sylphReward = rewards.sylph;

    // 3. Create Quest record
    const quest = await prisma.quest.create({
      data: {
        userId,
        subjectId: subjectId ?? null,
        subjectNodeId: subjectNodeId ?? null,
        goalId: linkedGoalId,
        title: title.trim(),
        description: description && typeof description === "string" ? description.trim() : null,
        targetMinutes,
        requiredMinutes: targetMinutes,
        scopeWeight,
        status: "ACTIVE",
        difficulty,
        scheduledFor,
        xpReward,
        sylphReward,
      },
      include: {
        subjectNode: {
          select: {
            id: true,
            nodeId: true,
            title: true,
            tier: true,
            progress: true,
            isMastered: true,
            spAward: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        goal: {
          select: {
            id: true,
            title: true,
            color: true,
          },
        },
      },
    });

    // Invalidate user cache tags
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (user?.username) {
        revalidateTag(`user-${user.username.toLowerCase()}`, "max");
      }
    } catch {}

    return NextResponse.json(quest, { status: 201 });
  } catch (error) {
    console.error("POST /api/quests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/quests
 * Bulk delete quests for the authenticated user.
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
