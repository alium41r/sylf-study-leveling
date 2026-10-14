import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { assertNoPlannerGoals, isPlannerConflict } from "@/lib/planner/server/mutation-guards";
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return await executionTransaction(session.userId, async tx => {
    const goal = await tx.goal.findFirst({
      where: { id: parseInt(id), userId: session.userId },
      include: { quests: true },
    });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const { targetWeeks: newWeeks } = validation.data;
    await assertNoPlannerGoals(session.userId, [goal.id], tx);

    // Estimate total study hours based on current effort level and timeline
    const currentConfig = EFFORT_CONFIG[goal.effortLevel as EffortLevel] || EFFORT_CONFIG.NORMAL;
    const totalStudyHours = (currentConfig.dailyMinutes * goal.targetWeeks * 7) / 60;

    // Calculate the effort preview
    const preview = previewEffortAdjustment(
      totalStudyHours,
      goal.targetWeeks,
      newWeeks
    );

    // We update the timeline, but we let the chat system handle quest regeneration.
    const newEffortLevelStr = preview.suggestedEffortLevel; 

    // Update the goal timeline and effort in DB
    await tx.goal.update({
      where: { id: goal.id },
      data: {
        targetWeeks: newWeeks,
        effortLevel: newEffortLevelStr,
      },
    });

    // Replace old pending quests with new ones
    // Delete existing pending quests
    await tx.quest.deleteMany({
      where: { userId: session.userId, goalId: goal.id, status: "PENDING", elapsedSeconds: 0, sessions: { none: {} } },
    });

    // Add system message
    await tx.systemMessage.create({
      data: {
        userId: session.userId,
        content: `[TIMELINE COMPRESSED]\n\nGoal: "${goal.title}"\nNew Timeline: ${newWeeks} weeks\nNew Effort Level: ${newEffortLevelStr}\n\nSylvie has re-evaluated your timeline. Please talk to Sylvie in the chat to regenerate your quests.`,
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
    });
  } catch (error) {
    if (isPlannerConflict(error)) return NextResponse.json({ error: "PLANNER_REVIEW_REQUIRED" }, { status: 409 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
