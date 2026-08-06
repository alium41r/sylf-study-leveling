// ============================================================
// Chat Tool Executor — Runs AI tool calls against the database
// ============================================================
// When Gemini calls a function (e.g., getUserStats), this module
// executes the corresponding Prisma query and returns the result.
// ============================================================

import { prisma } from "@/lib/prisma";
import { questRewards } from "@/lib/game-engine";

/**
 * Execute a tool call from the AI and return the result as a JSON-serializable object.
 */
export async function executeChatTool(
  toolName: string,
  args: Record<string, any>,
  userId: number
): Promise<Record<string, any>> {
  try {
    switch (toolName) {
      case "getUserStats":
        return await executeGetUserStats(userId);
      case "getGoals":
        return await executeGetGoals(userId, args);
      case "createGoal":
        return await executeCreateGoal(userId, args);
      case "updateGoal":
        return await executeUpdateGoal(userId, args);
      case "deleteGoal":
        return await executeDeleteGoal(userId, args);
      case "deleteAllTasks":
        return await executeDeleteAllTasks(userId);
      case "getQuests":
        return await executeGetQuests(userId, args);
      case "getStudySessions":
        return await executeGetStudySessions(userId, args);
      case "updateQuest":
        return await executeUpdateQuest(userId, args);
      case "deleteQuest":
        return await executeDeleteQuest(userId, args);
      case "getWeeklySummary":
        return await executeGetWeeklySummary(userId);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`Tool Execution Error [${toolName}]:`, error);
    return { error: `Internal tool error occurred while executing ${toolName}.`, details: error.message };
  }
}

// ─── Individual Tool Implementations ─────────────────────────

async function executeGetUserStats(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      hunterRank: true,
      level: true,
      currentXP: true,
      xpToNextLevel: true,
      hp: true,
      maxHp: true,
      streakDays: true,
      totalStudyMinutes: true,
      lastActiveDate: true,
      createdAt: true,
    },
  });

  if (!user) return { error: "User not found" };

  return {
    name: user.name || "Unknown",
    rank: user.hunterRank,
    level: user.level,
    currentXP: user.currentXP,
    xpToNextLevel: user.xpToNextLevel,
    hp: `${user.hp}/${user.maxHp}`,
    streakDays: user.streakDays,
    totalStudyHours: Math.round((user.totalStudyMinutes / 60) * 10) / 10,
    lastActiveDate: user.lastActiveDate || "Never",
    memberSince: user.createdAt,
  };
}

async function executeGetGoals(
  userId: number,
  args: Record<string, any>
) {
  const where: Record<string, any> = { userId };
  if (args.status) where.status = args.status;

  const goals = await prisma.goal.findMany({
    where,
    include: {
      quests: {
        select: { id: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    totalGoals: goals.length,
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      targetWeeks: g.targetWeeks,
      effortLevel: g.effortLevel,
      status: g.status,
      totalQuests: g.quests.length,
      completedQuests: g.quests.filter((q) => q.status === "COMPLETED").length,
      createdAt: g.createdAt,
    })),
  };
}

async function executeCreateGoal(
  userId: number,
  args: Record<string, any>
) {
  const title = args.title || "New Goal";
  const description = args.description || null;
  const targetWeeks = Number(args.targetWeeks) || 4;
  const effortLevel = args.effortLevel || "NORMAL";

  const goal = await prisma.goal.create({
    data: {
      userId,
      title,
      description,
      targetWeeks,
      effortLevel,
      status: "ACTIVE",
    },
  });

  return {
    success: true,
    goal: {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      targetWeeks: goal.targetWeeks,
      effortLevel: goal.effortLevel,
    },
  };
}

async function executeUpdateGoal(userId: number, args: Record<string, any>) {
  const goalId = Number(args.goalId);
  if (!goalId) return { error: "Missing goalId" };

  const existing = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!existing) return { error: "Goal not found" };

  const dataToUpdate: any = {};
  if (args.title !== undefined) dataToUpdate.title = args.title;
  if (args.description !== undefined) dataToUpdate.description = args.description;
  if (args.targetWeeks !== undefined) dataToUpdate.targetWeeks = Number(args.targetWeeks);
  if (args.effortLevel !== undefined) dataToUpdate.effortLevel = args.effortLevel;

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: dataToUpdate,
  });
  return { success: true, goal: updated };
}

async function executeDeleteGoal(userId: number, args: Record<string, any>) {
  const goalId = Number(args.goalId);
  if (!goalId) return { error: "Missing goalId" };

  const existing = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!existing) return { error: "Goal not found" };

  // Delete all associated quests since onDelete is SetNull in schema
  await prisma.quest.deleteMany({ where: { goalId } });
  await prisma.goal.delete({ where: { id: goalId } });
  return { success: true, message: `Goal and associated quests deleted.` };
}

async function executeDeleteAllTasks(userId: number) {
  // Delete all quests and goals for the user
  const questCount = await prisma.quest.deleteMany({ where: { userId } });
  const goalCount = await prisma.goal.deleteMany({ where: { userId } });
  return { 
    success: true, 
    message: `Mass deletion complete. Removed ${questCount.count} quests and ${goalCount.count} goals.` 
  };
}

async function executeGetQuests(
  userId: number,
  args: Record<string, any>
) {
  const where: Record<string, any> = { userId };

  if (args.date) {
    where.scheduledFor = args.date;
  } else if (!args.status && !args.goalId) {
    // Default to today
    where.scheduledFor = new Date().toISOString().split("T")[0];
  }

  if (args.status) where.status = args.status;
  if (args.goalId) where.goalId = Number(args.goalId);

  const quests = await prisma.quest.findMany({
    where,
    include: {
      goal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    totalQuests: quests.length,
    quests: quests.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      status: q.status,
      requiredMinutes: q.requiredMinutes,
      xpReward: q.xpReward,
      sylphReward: q.sylphReward,
      scheduledFor: q.scheduledFor,
      goalTitle: q.goal?.title || null,
      completedAt: q.completedAt,
    })),
  };
}

async function executeGetStudySessions(
  userId: number,
  args: Record<string, any>
) {
  const limit = args.limit || 10;

  const sessions = await prisma.studySession.findMany({
    where: { userId },
    include: {
      quest: { select: { id: true, title: true } },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return {
    totalSessions: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      durationMinutes: s.durationMinutes,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      questTitle: s.quest?.title || "Free Study",
    })),
  };
}

async function executeCreateQuest(
  userId: number,
  args: Record<string, any>
) {
  const title = args.title || "New Quest";
  const description = args.description || null;
  const requiredMinutes = Number(args.requiredMinutes) || 30;
  const scheduledFor =
    args.scheduledFor || new Date().toISOString().split("T")[0];
  let goalId = args.goalId ? Number(args.goalId) : null;

  if (goalId) {
    const goalExists = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goalExists) goalId = null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const userLevel = user?.level || 1;

  // Calculate rewards using the game engine
  const rewards = questRewards(requiredMinutes, "NORMAL", userLevel);

  const quest = await prisma.quest.create({
    data: {
      userId,
      goalId,
      title,
      description,
      requiredMinutes,
      xpReward: rewards.xp,
      sylphReward: rewards.sylph,
      scheduledFor,
      status: "PENDING",
    },
  });

  return {
    success: true,
    quest: {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      requiredMinutes: quest.requiredMinutes,
      xpReward: quest.xpReward,
      sylphReward: quest.sylphReward,
      scheduledFor: quest.scheduledFor,
    },
  };
}

async function executeCreateMultipleQuests(userId: number, args: Record<string, any>) {
  const questsArg = args.quests;
  if (!questsArg || !Array.isArray(questsArg)) return { error: "Missing quests array" };

  const createdQuests = [];
  for (const q of questsArg) {
    const res = await executeCreateQuest(userId, q);
    if (!(res as any).error) createdQuests.push(res.quest);
  }
  return { success: true, count: createdQuests.length, quests: createdQuests };
}

async function executeUpdateQuest(userId: number, args: Record<string, any>) {
  const questId = Number(args.questId);
  if (!questId) return { error: "Missing questId" };

  const existing = await prisma.quest.findFirst({ where: { id: questId, userId } });
  if (!existing) return { error: "Quest not found" };

  const dataToUpdate: any = {};
  if (args.title !== undefined) dataToUpdate.title = args.title;
  if (args.description !== undefined) dataToUpdate.description = args.description;
  if (args.requiredMinutes !== undefined) {
    dataToUpdate.requiredMinutes = Number(args.requiredMinutes);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userLevel = user?.level || 1;
    const rewards = questRewards(dataToUpdate.requiredMinutes, "NORMAL", userLevel);
    dataToUpdate.xpReward = rewards.xp;
    dataToUpdate.sylphReward = rewards.sylph;
  }
  if (args.scheduledFor !== undefined) dataToUpdate.scheduledFor = args.scheduledFor;

  const updated = await prisma.quest.update({
    where: { id: questId },
    data: dataToUpdate,
  });
  return { success: true, quest: updated };
}

async function executeDeleteQuest(userId: number, args: Record<string, any>) {
  const questId = Number(args.questId);
  if (!questId) return { error: "Missing questId" };

  const existing = await prisma.quest.findFirst({ where: { id: questId, userId } });
  if (!existing) return { error: "Quest not found" };

  await prisma.quest.delete({ where: { id: questId } });
  return { success: true, message: "Quest deleted." };
}

async function executeCompleteQuest(
  userId: number,
  args: Record<string, any>
) {
  const questId = args.questId;

  // Verify ownership
  const quest = await prisma.quest.findFirst({
    where: { id: questId, userId },
  });

  if (!quest) return { error: "Quest not found or doesn't belong to you." };
  if (quest.status === "COMPLETED")
    return { message: "This quest is already completed." };

  const updated = await prisma.quest.update({
    where: { id: questId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return {
    success: true,
    message: `Quest "${updated.title}" marked as completed!`,
    xpReward: updated.xpReward,
    sylphReward: updated.sylphReward,
  };
}

async function executeGetWeeklySummary(userId: number) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const quests = await prisma.quest.findMany({
    where: {
      userId,
      createdAt: { gte: oneWeekAgo },
    },
  });

  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      startedAt: { gte: oneWeekAgo },
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streakDays: true, level: true, hunterRank: true },
  });

  const completed = quests.filter((q) => q.status === "COMPLETED").length;
  const failed = quests.filter((q) => q.status === "FAILED").length;
  const pending = quests.filter(
    (q) => q.status === "PENDING" || q.status === "IN_PROGRESS"
  ).length;
  const totalMinutes = sessions.reduce(
    (sum, s) => sum + s.durationMinutes,
    0
  );

  return {
    period: "Last 7 days",
    questsCompleted: completed,
    questsFailed: failed,
    questsPending: pending,
    totalQuests: quests.length,
    totalStudyMinutes: totalMinutes,
    totalStudyHours: Math.round((totalMinutes / 60) * 10) / 10,
    currentStreak: user?.streakDays || 0,
    currentLevel: user?.level || 1,
    currentRank: user?.hunterRank || "E",
  };
}
