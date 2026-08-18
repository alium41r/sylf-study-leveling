import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { previewEffortAdjustment, EFFORT_CONFIG, type EffortLevel } from "@/lib/game-engine";

const adjustSchema = z.object({
  targetWeeks: z.number().int().min(1).max(52),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/goals/[id]/adjust
 *
 * The mentor-requested "Effort Adjustment" feature.
 *
 * Given a new target timeline (e.g., 4 weeks instead of 8), this endpoint
 * calculates and returns a preview of the required daily effort. The user
 * can review the tradeoff before confirming.
 *
 * In Week 6, this will also call the AI agent to regenerate the quest plan.
 * For now, it returns the math-based preview from the game engine.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const validation = adjustSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    // Get the existing goal
    const goal = await prisma.goal.findFirst({
      where: { id: parseInt(id), userId: payload.userId as number },
      include: { quests: true },
    });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const { targetWeeks: newWeeks } = validation.data;

    // Estimate total study hours based on current effort level and timeline
    const currentConfig = EFFORT_CONFIG[goal.effortLevel as EffortLevel] || EFFORT_CONFIG.NORMAL;
    const totalStudyHours = (currentConfig.dailyMinutes * goal.targetWeeks * 7) / 60;

    // Calculate the effort preview
    const preview = previewEffortAdjustment(
      totalStudyHours,
      goal.targetWeeks,
      newWeeks
    );

    // FETCH MEMORY: Get past 7 days of StudySessions
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // We update the timeline, but we let the chat system handle quest regeneration.
    const newEffortLevelStr = preview.suggestedEffortLevel; 

    // Update the goal timeline and effort in DB
    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        targetWeeks: newWeeks,
        effortLevel: newEffortLevelStr,
      },
    });

    // Replace old pending quests with new ones
    // Delete existing pending quests
    await prisma.quest.deleteMany({
      where: { goalId: goal.id, status: "PENDING" },
    });

    // Add system message
    await prisma.systemMessage.create({
      data: {
        userId: payload.userId as number,
        content: `[TIMELINE COMPRESSED]\n\nGoal: "${goal.title}"\nNew Timeline: ${newWeeks} weeks\nNew Effort Level: ${newEffortLevelStr}\n\nThe System has re-evaluated your timeline. Please talk to The System in the chat to regenerate your quests.`,
        type: "WARNING",
      },
    });

    return NextResponse.json(
      {
        goalId: goal.id,
        goalTitle: goal.title,
        preview,
        newEffortLevel: newEffortLevelStr,
        message: `Adjusting "${goal.title}" from ${goal.targetWeeks} weeks to ${newWeeks} weeks.`,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
