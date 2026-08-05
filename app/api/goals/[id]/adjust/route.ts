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
    
    const recentSessions = await prisma.studySession.findMany({
      where: {
        userId: payload.userId as number,
        startedAt: { gte: sevenDaysAgo },
      },
      include: { quest: true },
      orderBy: { startedAt: 'desc' },
    });

    let pastSessionsContext = "No sessions logged in the last 7 days.";
    if (recentSessions.length > 0) {
      const totalMins = recentSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
      pastSessionsContext = `User completed ${recentSessions.length} sessions totaling ${totalMins} minutes in the last week.`;
    }

    // Call the AI agent's adjustQuestPlan tool
    const { adjustQuests } = await import("@/lib/ai/system-agent");
    const adjustedPlan = await adjustQuests(
      goal.title,
      goal.description,
      goal.targetWeeks,
      newWeeks,
      currentConfig.dailyMinutes,
      preview.newDailyMinutes,
      goal.effortLevel as EffortLevel,
      pastSessionsContext
    );

    // Update the goal timeline and effort in DB
    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        targetWeeks: newWeeks,
        effortLevel: adjustedPlan.newEffortLevel,
      },
    });

    // Replace old pending quests with new ones
    // Delete existing pending quests
    await prisma.quest.deleteMany({
      where: { goalId: goal.id, status: "PENDING" },
    });

    // Save new quests to the database
    if (adjustedPlan.quests.length > 0) {
      const today = new Date();
      await prisma.quest.createMany({
        data: adjustedPlan.quests.map((q: any) => {
          const scheduledDate = new Date(today);
          scheduledDate.setDate(today.getDate() + q.scheduledDay);
          return {
            userId: payload.userId as number,
            goalId: goal.id,
            title: q.title,
            description: q.description,
            requiredMinutes: q.requiredMinutes,
            xpReward: q.xpReward,
            goldReward: q.goldReward,
            scheduledFor: scheduledDate.toISOString().split("T")[0],
          };
        }),
      });
    }

    // Add system message
    await prisma.systemMessage.create({
      data: {
        userId: payload.userId as number,
        content: `[TIMELINE COMPRESSED]\n\nGoal: "${goal.title}"\nNew Timeline: ${newWeeks} weeks\nNew Effort Level: ${adjustedPlan.newEffortLevel}\n\nThe System has re-evaluated your tasks. Your daily burden has increased. Do not fail.`,
        type: "WARNING",
      },
    });

    return NextResponse.json(
      {
        goalId: goal.id,
        goalTitle: goal.title,
        preview,
        newEffortLevel: adjustedPlan.newEffortLevel,
        message: `Adjusting "${goal.title}" from ${goal.targetWeeks} weeks to ${newWeeks} weeks.`,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
