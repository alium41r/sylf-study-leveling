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

const updateGoalSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").optional(),
  description: z.string().optional(),
  targetWeeks: z.number().int().min(1).max(52).optional(),
  effortLevel: z.enum(["RELAXED", "NORMAL", "INTENSE", "EXTREME"]).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "FAILED"]).optional(),
  targetDate: z.string().nullable().optional(),
  color: z.enum(GOAL_COLOR_TOKENS).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/goals/[id]
 * Get a single goal with all its quests.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goal = await prisma.goal.findFirst({
      where: {
        id: parseInt(id),
        userId: session.userId,
      },
      include: {
        quests: {
          orderBy: { scheduledFor: "asc" },
        },
      },
    });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json(goal, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/goals/[id]
 * Update a goal's fields (title, effort, status, etc.)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = updateGoalSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await prisma.goal.findFirst({
      where: { id: parseInt(id), userId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const dataToUpdate: Record<string, unknown> = { ...validation.data };
    delete dataToUpdate.targetDate;

    // Exact deadline editing: store representational UTC midnight of the
    // chosen date and keep the legacy week count in sync.
    if (validation.data.targetDate !== undefined) {
      if (validation.data.targetDate === null) {
        dataToUpdate.targetDate = null;
      } else {
        try {
          const parsed = targetDateToUtc(validation.data.targetDate);
          dataToUpdate.targetDate = parsed;
          dataToUpdate.targetWeeks = validation.data.targetWeeks ?? targetDateToWeeks(parsed);
        } catch (e) {
          return NextResponse.json(
            { error: "Invalid targetDate. Expected YYYY-MM-DD." },
            { status: 400 }
          );
        }
      }
    }

    if (dataToUpdate.color !== undefined && !isGoalColorToken(dataToUpdate.color)) {
      return NextResponse.json({ error: "Invalid color token." }, { status: 400 });
    }

    const updated = await prisma.goal.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/goals/[id]
 * Abandon/delete a goal and all its quests (cascade).
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const existing = await prisma.goal.findFirst({
      where: { id: parseInt(id), userId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    await prisma.goal.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({ message: "Goal abandoned" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
