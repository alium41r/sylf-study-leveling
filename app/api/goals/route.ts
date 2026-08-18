import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const createGoalSchema = z.object({
  title: z.string().min(1, "Goal title is required"),
  description: z.string().optional(),
  targetWeeks: z.number().int().min(1).max(52),
  effortLevel: z.enum(["RELAXED", "NORMAL", "INTENSE", "EXTREME"]).default("NORMAL"),
});

/**
 * GET /api/goals
 * List all goals for the authenticated user.
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

    const goals = await prisma.goal.findMany({
      where: { userId: payload.userId as number },
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const validation = createGoalSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, description, targetWeeks, effortLevel } = validation.data;

    const goal = await prisma.goal.create({
      data: {
        userId: payload.userId as number,
        title,
        description: description || null,
        targetWeeks,
        effortLevel,
      },
    });

    // Create a system message confirming the goal
    await prisma.systemMessage.create({
      data: {
        userId: payload.userId as number,
        content: `**New Goal Detected**\n\nObjective: "${title}"\nTimeline: ${targetWeeks} weeks\nEffort Level: ${effortLevel}\n\nThe System has registered your objective. Talk to The System in the chat to generate and schedule quests for this goal!`,
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

    // Since onDelete: Cascade is NOT fully reliable across all database wrappers, 
    // it's a good practice to delete quests associated with the goals first (if needed).
    // Let's delete the quests first to be safe, then the goals.
    await prisma.quest.deleteMany({
      where: {
        userId: payload.userId as number,
        goalId: { in: ids },
      },
    });

    const result = await prisma.goal.deleteMany({
      where: {
        userId: payload.userId as number,
        id: { in: ids },
      },
    });

    return NextResponse.json({ success: true, count: result.count }, { status: 200 });
  } catch (error) {
    console.error("Failed to bulk delete goals:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
