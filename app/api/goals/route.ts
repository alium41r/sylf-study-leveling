import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  GOAL_COLOR_TOKENS,
  isGoalColorToken,
  targetDateToUtc,
  targetDateToWeeks,
} from "@/lib/goal-theme";

const createGoalSchema = z.object({
  title: z.string().min(1, "Goal title is required"),
  description: z.string().optional(),
  targetWeeks: z.number().int().min(1).max(52).optional(),
  effortLevel: z.enum(["RELAXED", "NORMAL", "INTENSE", "EXTREME"]).default("NORMAL"),
  targetDate: z.string().optional(),
  color: z.enum(GOAL_COLOR_TOKENS).optional(),
});

/**
 * GET /api/goals
 * List all goals for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await prisma.goal.findMany({
      where: { userId: session.userId },
      include: {
        quests: {
          select: {
            id: true,
            title: true,
            status: true,
            xpReward: true,
            requiredMinutes: true,
            scheduledFor: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(goals, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/goals
 * Create a new study goal. In the future, this will trigger the AI agent
 * to generate quests. For now, it creates the goal and returns it.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = createGoalSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, description, targetWeeks, effortLevel, targetDate, color } = validation.data;

    let effectiveTargetWeeks = targetWeeks;
    let effectiveTargetDate: Date | null = null;

    // Exact deadline support: store the representational UTC midnight of the
    // chosen YYYY-MM-DD and derive the legacy week count from it.
    if (targetDate) {
      try {
        effectiveTargetDate = targetDateToUtc(targetDate);
        effectiveTargetWeeks = targetDateToWeeks(effectiveTargetDate);
      } catch (e) {
        return NextResponse.json(
          { error: "Invalid targetDate. Expected YYYY-MM-DD." },
          { status: 400 }
        );
      }
    }

    const goal = await prisma.goal.create({
      data: {
        userId: session.userId,
        title,
        description: description || null,
        targetWeeks: effectiveTargetWeeks ?? 4,
        effortLevel,
        targetDate: effectiveTargetDate,
        color: isGoalColorToken(color) ? color : "EMERALD",
      },
    });

    // Create a system message confirming the goal
    await prisma.systemMessage.create({
      data: {
        userId: session.userId,
        content: `**New Goal Detected**\n\nObjective: "${title}"\nTimeline: ${effectiveTargetWeeks ?? 4} weeks${effectiveTargetDate ? `\nDeadline: ${effectiveTargetDate.toISOString().slice(0, 10)}` : ""}\nEffort Level: ${effortLevel}\n\nThe System has registered your objective. Talk to The System in the chat to generate and schedule quests for this goal!`,
        type: "SYSTEM",
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/goals
 * Bulk delete goals for the authenticated user.
 * Expects { ids: number[] } in the body.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    // Since onDelete: Cascade is NOT fully reliable across all database wrappers, 
    // it's a good practice to delete quests associated with the goals first (if needed).
    // Let's delete the quests first to be safe, then the goals.
    await prisma.quest.deleteMany({
      where: {
        userId: session.userId,
        goalId: { in: ids },
      },
    });

    const result = await prisma.goal.deleteMany({
      where: {
        userId: session.userId,
        id: { in: ids },
      },
    });

    return NextResponse.json({ success: true, count: result.count }, { status: 200 });
  } catch (error) {
    console.error("Failed to bulk delete goals:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
