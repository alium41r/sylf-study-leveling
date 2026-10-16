import { aiSignal } from "./telemetry";
import { generateGeminiContent } from "@/lib/ai/providers/gemini-dispatch";
import { executionTransaction } from "@/lib/execution-coordination";
// ============================================================
// Chat Tool Executor — Runs AI tool calls against the database
// ============================================================
// When Gemini calls a function (e.g., getUserStats), this module
// executes the corresponding Prisma query and returns the result.
// ============================================================

import { prisma } from "@/lib/prisma";
import { assertNoLinkedQuests, assertNoPlannerGoals, deleteUnlinkedGoals, isPlannerConflict } from "@/lib/planner/server/mutation-guards";
import { calculateQuestRewards, calculateRecommendedDifficulty, QuestDifficulty } from "@/lib/difficulty-engine";
import {
  calculateDailyCapacity,
  getHighestEffortLevel,
  normalizeDifficulty,
  scheduleQuestsDeterministically,
} from "@/lib/ai/planning-engine";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";
import { EffortLevel } from "@/lib/game-engine";
import { isGoalColorToken, targetDateToUtc } from "@/lib/goal-theme";
import { StudyScheduleService } from "@/lib/study-schedule-service";
import { buildRelevantContext } from "@/lib/ai/context-engine";
import { GEMINI_MODELS } from "@/lib/ai/config";
import { SHOP_ITEMS } from "@/lib/shop-items";
import { signConfirmationToken, verifyConfirmationToken } from "@/lib/ai/tool-confirmation";

// ─── Destructive Mutation Handshake ───────────────────────────

interface ConfirmationStaging {
  status: "REQUIRES_CONFIRMATION";
  action: string;
  targetCount: number;
  message: string;
  confirmationToken: string;
}

function buildConfirmationRequest(
  action: string,
  targetCount: number,
  message: string,
  userId: number
): ConfirmationStaging {
  return {
    status: "REQUIRES_CONFIRMATION",
    action,
    targetCount,
    message,
    confirmationToken: signConfirmationToken(action, userId),
  };
}

/**
 * True when the caller supplied a valid signed confirmation token for
 * the given destructive action. Invalid/expired/mismatched tokens are
 * treated as unconfirmed — no deletion is ever executed on them.
 */
function isConfirmed(args: Record<string, any>, action: string, userId: number): boolean {
  return (
    typeof args?.confirmationToken === "string" &&
    verifyConfirmationToken(args.confirmationToken, action, userId)
  );
}

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
        return await executeDeleteAllTasks(userId, args);
      case "getQuests":
        return await executeGetQuests(userId, args);
      case "createQuest":
        return await executeCreateQuest(userId, args);
      case "createMultipleQuests":
        return await executeCreateMultipleQuests(userId, args);
      case "getStudySessions":
        return await executeGetStudySessions(userId, args);
      case "updateQuest":
        return await executeUpdateQuest(userId, args);
      case "deleteQuest":
        return await executeDeleteQuest(userId, args);
      case "getWeeklySummary":
        return await executeGetWeeklySummary(userId);
      case "moveQuest":
        return await executeMoveQuest(userId, args);
      case "swapQuests":
        return await executeSwapQuests(userId, args);
      case "clearDay":
        return await executeClearDay(userId, args);
      case "getSubjectAnalytics":
        return await executeGetSubjectAnalytics(userId);
      case "getPerformanceTrends":
        return await executeGetPerformanceTrends(userId);
      case "getDailyPattern":
        return await executeGetDailyPattern(userId);
      case "saveMemory":
        return await executeSaveMemory(userId, args);
      case "getMemory":
        return await executeGetMemory(userId, args);
      case "forgetMemory":
        return await executeForgetMemory(userId, args);
      case "generateInsight":
        return await executeGenerateInsight(userId, args);
      case "completeQuest":
        return await executeCompleteQuest(userId, args);
      case "getAppState":
        return await executeGetAppState(userId);
      case "getShopInventory":
        return await executeGetShopInventory();
      case "googleSearch":
        return await executeGoogleSearch(args);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    if (isPlannerConflict(error)) return { error: "PLANNER_REVIEW_REQUIRED", requiresPlannerReview: true };
    console.error("[AI] operation unavailable");
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
      targetDate: g.targetDate,
      color: g.color,
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
  const color = isGoalColorToken(args.color) ? args.color : "EMERALD";

  let targetDate: Date | null = null;
  if (typeof args.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.targetDate)) {
    targetDate = targetDateToUtc(args.targetDate);
  }

  const goal = await executionTransaction(userId, tx => tx.goal.create({
    data: {
      userId,
      title,
      description,
      targetWeeks,
      effortLevel,
      status: "ACTIVE",
      color,
      targetDate,
    },
  }));

  return {
    success: true,
    goal: {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      targetWeeks: goal.targetWeeks,
      targetDate: goal.targetDate,
      effortLevel: goal.effortLevel,
      color: goal.color,
    },
  };
}

async function executeUpdateGoal(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  let existing;
  if (args.goalId) {
    existing = await tx.goal.findFirst({ where: { id: Number(args.goalId), userId } });
  } else if (args.searchTitle) {
    existing = await tx.goal.findFirst({
      where: { userId, title: { contains: args.searchTitle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!existing) return { error: "Goal not found. Please verify the ID or title." };

  const goalId = existing.id;
  await assertNoPlannerGoals(userId, [goalId], tx);
  const dataToUpdate: any = {};
  if (args.title !== undefined) dataToUpdate.title = args.title;
  if (args.description !== undefined) dataToUpdate.description = args.description;
  if (args.targetWeeks !== undefined) dataToUpdate.targetWeeks = Number(args.targetWeeks);
  if (args.effortLevel !== undefined) dataToUpdate.effortLevel = args.effortLevel;
  if (args.color !== undefined) {
    if (!isGoalColorToken(args.color)) {
      return { error: "Invalid color token. Expected EMERALD, CYAN, BLUE, VIOLET, ROSE, or AMBER." };
    }
    dataToUpdate.color = args.color;
  }
  if (typeof args.targetDate === "string" && args.targetDate !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.targetDate)) {
      return { error: "Invalid targetDate format. Must be YYYY-MM-DD." };
    }
    dataToUpdate.targetDate = targetDateToUtc(args.targetDate);
  }

  const updated = await tx.goal.update({
    where: { id: goalId },
    data: dataToUpdate,
  });
  return { success: true, goal: updated };
  });
}

async function executeDeleteGoal(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const ACTION_ALL = "DELETE_ALL_GOALS";
  const ACTION_BATCH = "DELETE_GOALS_BATCH";

  // Legacy/undocumented deleteAll flag and multi-title batches are
  // destructive bulk operations — they ALWAYS require a valid signed
  // confirmation token.
  const titles = Array.isArray(args.searchTitles)
    ? args.searchTitles.filter((t: any) => typeof t === "string")
    : [];
  const isDeleteAll = args.deleteAll === true;
  const isBulk = isDeleteAll || titles.length > 1;

  if (isBulk) {
    const action = isDeleteAll ? ACTION_ALL : ACTION_BATCH;
    if (!isConfirmed(args, action, userId)) {
      const targetCount = isDeleteAll
        ? await tx.goal.count({ where: { userId } })
        : await tx.goal.count({ where: { userId, title: { in: titles } } });
      return buildConfirmationRequest(
        action,
        targetCount,
        `This will permanently delete ${targetCount} goal(s) and their associated quests. Please confirm to proceed.`,
        userId
      );
    }
  }

  if (isDeleteAll) {
    // Confirmed full wipe: goals + their associated quests.
    const guarded = await deleteUnlinkedGoals(userId, undefined, true, tx);
    return { success: true, message: `Successfully deleted all ${guarded.goals} goals and their associated quests.` };
  }

  const idsToDelete: number[] = [];

  if (args.goalId) {
    const existing = await tx.goal.findFirst({ where: { id: Number(args.goalId), userId } });
    if (existing) idsToDelete.push(existing.id);
  }

  if (args.searchTitle) {
    const existing = await tx.goal.findFirst({
      where: { userId, title: { contains: args.searchTitle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) idsToDelete.push(existing.id);
  }

  for (const title of titles) {
    const existing = await tx.goal.findFirst({
      where: { userId, title: { contains: title, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) idsToDelete.push(existing.id);
  }

  if (idsToDelete.length === 0) {
    return { error: "No matching goals found to delete. Please verify the IDs or titles." };
  }

  // Delete associated quests first since they are tied to these goals
  const guarded = await deleteUnlinkedGoals(userId, idsToDelete, false, tx);
  return { success: true, message: `Successfully deleted ${guarded.goals} goal(s) and their associated quests.` };
  });
}

async function executeDeleteAllTasks(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const ACTION = "DELETE_ALL_TASKS";

  // The full wipe is ALWAYS destructive — require a valid signed token.
  if (!isConfirmed(args, ACTION, userId)) {
    const [questCount, goalCount] = await Promise.all([
      tx.quest.count({ where: { userId } }),
      tx.goal.count({ where: { userId } }),
    ]);
    const targetCount = questCount + goalCount;
    return buildConfirmationRequest(
      ACTION,
      targetCount,
      `This will permanently delete ALL ${questCount} quest(s) and ${goalCount} goal(s). Please confirm to proceed.`,
      userId
    );
  }

  // Confirmed full wipe.
  const guarded = await deleteUnlinkedGoals(userId, undefined, true, tx);
  return { success: true, message: `Mass deletion complete. Removed ${guarded.quests} quests and ${guarded.goals} goals.` };
  });
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
    const tz = await getUserTimezone(userId);
    where.scheduledFor = TimezoneService.getUserLocalDate(tz);
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
  return executionTransaction(userId, async tx => {
  const title = args.title || "New Quest";
  const description = args.description || null;
  // S4: reward-driving values are clamped server-side — the LLM (or a
  // crafted tool call) can never inflate XP/Sylph through huge minutes.
  const MIN_QUEST_MINUTES = 15;
  const MAX_QUEST_MINUTES = 240;
  let requiredMinutes = Number(args.requiredMinutes);
  if (!Number.isFinite(requiredMinutes) || requiredMinutes <= 0) requiredMinutes = 30;
  requiredMinutes = Math.min(MAX_QUEST_MINUTES, Math.max(MIN_QUEST_MINUTES, Math.round(requiredMinutes)));
  const tz = await getUserTimezone(userId, tx);
  const scheduledFor =
    args.scheduledFor || TimezoneService.getUserLocalDate(tz);
  let goalId = args.goalId ? Number(args.goalId) : null;

  // ─── REST-DAY ALLOCATION GUARDRAIL ─────────────────────────
  // AI-created quests must never land on fixed or floating rest days.
  if (await StudyScheduleService.isUserRestDay(userId, scheduledFor, tx)) {
    return {
      error: `REST_DAY_BLOCKED: ${scheduledFor} is a designated rest day (fixed or floating) and cannot receive quests. Repath this quest to the next active study day.`,
    };
  }

  // ─── ANTI-EXPLOIT & LIMITS ──────────────────────────────────
  const MAX_AI_QUESTS_PER_DAY = 3;

  // 1. Check for duplicates
  const existingDuplicate = await tx.quest.findFirst({
    where: { userId, title, scheduledFor }
  });
  if (existingDuplicate) {
    return { error: `Duplicate quest detected: A quest titled "${title}" is already scheduled for ${scheduledFor}. Please suggest editing it instead.` };
  }

  // 2. Check rate limit
  // Use timezone-correct start of day for accurate daily counting
  const startOfDayUtc = TimezoneService.getStartOfDayUTC(tz);

  const aiQuestsToday = await tx.quest.count({
    where: {
      userId,
      // @ts-ignore
      createdByAi: true,
      createdAt: { gte: startOfDayUtc }
    }
  });

  if (aiQuestsToday >= MAX_AI_QUESTS_PER_DAY) {
    return { error: `The daily limit of ${MAX_AI_QUESTS_PER_DAY} AI-created quests has been reached. Please politely explain this to the user and suggest editing their existing quests instead.` };
  }
  // ────────────────────────────────────────────────────────────

  if (goalId) {
    const goalExists = await tx.goal.findFirst({ where: { id: goalId, userId } });
    if (!goalExists) goalId = null;
    else await assertNoPlannerGoals(userId, [goalId], tx);
  }

  const user = await tx.user.findUnique({ where: { id: userId } });
  const userLevel = user?.level || 1;

  // Calculate rewards using the game engine
  const diff = calculateRecommendedDifficulty(requiredMinutes);
  const rewards = calculateQuestRewards(requiredMinutes, diff, userLevel);

  const quest = await tx.quest.create({
    data: {
      userId,
      goalId,
      title,
      description,
      requiredMinutes,
      targetMinutes: requiredMinutes,
      difficulty: diff,
      xpReward: rewards.xp,
      sylphReward: rewards.sylph,
      scheduledFor,
      status: "PENDING",
      // @ts-ignore
      createdByAi: true,
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
  });
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
  return executionTransaction(userId, async tx => {
  let existing;
  if (args.questId) {
    const questId = Number(args.questId);
    existing = await tx.quest.findFirst({ where: { id: questId, userId } });
  } else if (args.searchTitle) {
    existing = await tx.quest.findFirst({
      where: { userId, title: { contains: args.searchTitle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
  } else if (args.title) {
    // If the model passed `title` to identify the quest rather than `searchTitle`
    existing = await tx.quest.findFirst({
      where: { userId, title: { contains: args.title, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
  }

  // Fallback: If still not found and user has a pending quest created recently
  let usedFallback = false;
  if (!existing && (args.requiredMinutes !== undefined || args.scheduledFor !== undefined || args.description !== undefined)) {
    existing = await tx.quest.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) usedFallback = true;
  }

  if (!existing) return { error: "Quest not found. Please verify the ID or title." };

  const questId = existing.id;
  const dataToUpdate: any = {};
  if (args.title !== undefined) dataToUpdate.title = args.title;
  if (args.description !== undefined) dataToUpdate.description = args.description;
  if (args.requiredMinutes !== undefined) {
    // S4: clamp reward-driving minutes on updates too (15–240).
    let reqMins = Number(args.requiredMinutes);
    if (!Number.isFinite(reqMins) || reqMins <= 0) reqMins = 30;
    reqMins = Math.min(240, Math.max(15, Math.round(reqMins)));
    dataToUpdate.requiredMinutes = reqMins;
    dataToUpdate.targetMinutes = reqMins;
    const user = await tx.user.findUnique({ where: { id: userId } });
    const userLevel = user?.level || 1;
    const diff = calculateRecommendedDifficulty(reqMins);
    const rewards = calculateQuestRewards(reqMins, diff, userLevel);
    dataToUpdate.difficulty = diff;
    dataToUpdate.xpReward = rewards.xp;
    dataToUpdate.sylphReward = rewards.sylph;
  }
  if (args.scheduledFor !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.scheduledFor))) {
      return { error: "Invalid scheduledFor format. Must be YYYY-MM-DD." };
    }
    if (await StudyScheduleService.isUserRestDay(userId, String(args.scheduledFor), tx)) {
      return {
        error: `REST_DAY_BLOCKED: ${args.scheduledFor} is a designated rest day (fixed or floating) and cannot receive quests. Repath this quest to the next active study day.`,
      };
    }
    dataToUpdate.scheduledFor = args.scheduledFor;
  }

  await assertNoLinkedQuests(userId, { id: questId }, tx);
  const updated = await tx.quest.update({
    where: { id: questId },
    data: dataToUpdate,
  });
  const result: any = { success: true, quest: updated };
  if (usedFallback) {
    result.warning = `No exact match found. Updated the most recent pending quest: "${existing.title}" (ID: ${existing.id}). Confirm this was the intended quest.`;
  }
  return result;
  });
}

async function executeDeleteQuest(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const ACTION_ALL = "DELETE_ALL_QUESTS";
  const ACTION_BATCH = "DELETE_QUESTS_BATCH";

  // Legacy/undocumented deleteAll flag and multi-title batches are
  // destructive bulk operations — they ALWAYS require a valid signed
  // confirmation token.
  const titles = Array.isArray(args.searchTitles)
    ? args.searchTitles.filter((t: any) => typeof t === "string")
    : [];
  const isDeleteAll = args.deleteAll === true;
  const isBulk = isDeleteAll || titles.length > 1;

  if (isBulk) {
    const action = isDeleteAll ? ACTION_ALL : ACTION_BATCH;
    if (!isConfirmed(args, action, userId)) {
      const targetCount = isDeleteAll
        ? await tx.quest.count({ where: { userId } })
        : await tx.quest.count({ where: { userId, title: { in: titles } } });
      return buildConfirmationRequest(
        action,
        targetCount,
        `This will permanently delete ${targetCount} quest(s). Please confirm to proceed.`,
        userId
      );
    }
  }

  if (isDeleteAll) {
    // Confirmed full wipe.
    await assertNoLinkedQuests(userId, {}, tx);
    const deleted = await tx.quest.deleteMany({ where: { userId } });
    return { success: true, message: `Successfully deleted all ${deleted.count} quests.` };
  }

  const idsToDelete: number[] = [];

  if (args.questId) {
    const existing = await tx.quest.findFirst({ where: { id: Number(args.questId), userId } });
    if (existing) idsToDelete.push(existing.id);
  }

  if (args.searchTitle) {
    const existing = await tx.quest.findFirst({
      where: { userId, title: { contains: args.searchTitle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) idsToDelete.push(existing.id);
  }

  for (const title of titles) {
    const existing = await tx.quest.findFirst({
      where: { userId, title: { contains: title, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) idsToDelete.push(existing.id);
  }

  if (idsToDelete.length === 0) {
    return { error: "No matching quests found to delete. Please verify the IDs or titles." };
  }

  await assertNoLinkedQuests(userId, { id: { in: idsToDelete } }, tx);
  const deleted = await tx.quest.deleteMany({
    where: { id: { in: idsToDelete } }
  });

  return { success: true, message: `Successfully deleted ${deleted.count} quest(s).` };
  });
}

async function executeCompleteQuest(
  userId: number,
  args: Record<string, any>
) {
  const questIdNum = Number(args.questId);
  if (!Number.isInteger(questIdNum) || questIdNum <= 0) {
    return { error: "A valid numeric questId is required." };
  }

  // Completion MUST flow through the authoritative claim_quest_reward RPC:
  // XP + Sylph + streak multipliers + level/rank recompute + HP restore +
  // audit ledgers happen atomically inside one row-locked transaction.
  // Direct Quest.status updates are forbidden here — they would mark the
  // quest COMPLETED while permanently voiding its rewards.
  const tz = await getUserTimezone(userId);
  const today = TimezoneService.getUserLocalDate(tz);

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        claim_quest_reward: {
          success: boolean;
          questId: number;
          status: string;
          xpGained?: number;
          sylphGained?: number;
          totalSylphEarned?: number;
          hpHealed?: number;
          currentHp?: number;
          level?: number;
          currentXP?: number;
          xpToNextLevel?: number;
          hunterRank?: string;
          levelsGained?: number;
          didRankUp?: boolean;
          penalty?: { hpLost: number; currentHp: number };
        };
      }>
    >(
      `SELECT public.claim_quest_reward($1::int, $2::int, $3::text) AS claim_quest_reward`,
      userId,
      questIdNum,
      today
    );

    const result = rows[0]?.claim_quest_reward;
    if (!result) return { error: "Quest completion returned no result." };

    if (result.status === "FAILED") {
      return {
        success: false,
        status: "FAILED",
        message: `Quest #${questIdNum} was completed past its deadline and recorded as FAILED.`,
        penalty: result.penalty,
      };
    }

    return {
      success: true,
      status: "COMPLETED",
      message: `Quest #${questIdNum} marked as completed! Rewards were credited atomically.`,
      xpGained: result.xpGained ?? 0,
      sylphGained: result.totalSylphEarned ?? result.sylphGained ?? 0,
      level: result.level,
      currentXP: result.currentXP,
      xpToNextLevel: result.xpToNextLevel,
      hunterRank: result.hunterRank,
      levelsGained: result.levelsGained ?? 0,
      didRankUp: result.didRankUp ?? false,
      hpHealed: result.hpHealed ?? 0,
    };
  } catch (err: any) {
    const message = err?.message || "";
    if (/already completed/i.test(message)) {
      return { message: "This quest is already completed — no rewards were issued twice." };
    }
    if (/not found/i.test(message)) {
      return { error: "Quest not found or doesn't belong to you." };
    }
    throw err;
  }
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

// --- Phase 3A: Calendar Tools ---

async function executeMoveQuest(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const questId = Number(args.questId);
  const targetDate = String(args.targetDate);
  if (!questId || !targetDate) return { error: "Missing questId or targetDate" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { error: "Invalid targetDate format. Must be YYYY-MM-DD" };

  const quest = await tx.quest.findUnique({ where: { id: questId, userId } });
  if (!quest) return { error: "Quest not found or unauthorized." };
  if (quest.status !== "PENDING" && quest.status !== "IN_PROGRESS") return { error: "Only PENDING or IN_PROGRESS quests can be moved." };

  // ─── REST-DAY ALLOCATION GUARDRAIL ─────────────────────────
  if (await StudyScheduleService.isUserRestDay(userId, targetDate, tx)) {
    return {
      error: `REST_DAY_BLOCKED: ${targetDate} is a designated rest day (fixed or floating) and cannot receive quests. Repath this quest to the next active study day.`,
    };
  }

  const effortLevel = await getHighestEffortLevel(userId, tx);
  const matrix = await calculateDailyCapacity(userId, effortLevel, targetDate, targetDate, tx);

  if (matrix[targetDate] < quest.requiredMinutes) {
    return {
      error: "Target date is overloaded.",
      capacityRemaining: matrix[targetDate],
      required: quest.requiredMinutes
    };
  }

  await assertNoLinkedQuests(userId, { id: questId }, tx);
  await tx.quest.update({
    where: { id: questId },
    data: { scheduledFor: targetDate }
  });

  return { success: true, message: `Moved quest to ${targetDate}` };
  });
}

async function executeSwapQuests(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const questIdA = Number(args.questIdA);
  const questIdB = Number(args.questIdB);
  if (!questIdA || !questIdB) return { error: "Missing quest IDs" };
  if (questIdA === questIdB) return { error: "Cannot swap a quest with itself." };

  const questA = await tx.quest.findUnique({ where: { id: questIdA, userId } });
  const questB = await tx.quest.findUnique({ where: { id: questIdB, userId } });

  if (!questA || !questB) return { error: "One or both quests not found or unauthorized." };
  if (
    (questA.status !== "PENDING" && questA.status !== "IN_PROGRESS") ||
    (questB.status !== "PENDING" && questB.status !== "IN_PROGRESS")
  ) {
    return { error: "Only PENDING or IN_PROGRESS quests can be swapped." };
  }

  const dateA = questA.scheduledFor;
  const dateB = questB.scheduledFor;

  if (dateA === dateB) return { error: "Quests are already on the same date." };

  // ─── REST-DAY ALLOCATION GUARDRAIL ─────────────────────────
  // A swap moves each quest onto the other quest's date; neither endpoint
  // may be a designated rest day.
  if (await StudyScheduleService.isUserRestDay(userId, dateA, tx)) {
    return { error: `REST_DAY_BLOCKED: ${dateA} is a designated rest day. Swap target must be an active study day.` };
  }
  if (await StudyScheduleService.isUserRestDay(userId, dateB, tx)) {
    return { error: `REST_DAY_BLOCKED: ${dateB} is a designated rest day. Swap target must be an active study day.` };
  }

  const effortLevel = await getHighestEffortLevel(userId, tx);

  // Calculate capacity for both dates
  const matrixA = await calculateDailyCapacity(userId, effortLevel, dateA, dateA, tx);
  const matrixB = await calculateDailyCapacity(userId, effortLevel, dateB, dateB, tx);

  // When A moves to B's date, B's old date regains B's minutes, but loses A's minutes
  const newBudgetA = matrixA[dateA] + questA.requiredMinutes - questB.requiredMinutes;
  const newBudgetB = matrixB[dateB] + questB.requiredMinutes - questA.requiredMinutes;

  if (newBudgetA < 0) return { error: `Cannot swap: ${dateA} would be overloaded.` };
  if (newBudgetB < 0) return { error: `Cannot swap: ${dateB} would be overloaded.` };

  await assertNoLinkedQuests(userId, { id: { in: [questIdA, questIdB] } }, tx);
  await Promise.all([
    tx.quest.update({ where: { id: questIdA }, data: { scheduledFor: dateB } }),
    tx.quest.update({ where: { id: questIdB }, data: { scheduledFor: dateA } })
  ]);

  return { success: true, message: `Swapped dates between ${questA.title} and ${questB.title}` };
  });
}

async function executeClearDay(userId: number, args: Record<string, any>) {
  return executionTransaction(userId, async tx => {
  const dateStr = String(args.date);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Invalid date format. Must be YYYY-MM-DD" };

  const pendingQuests = await tx.quest.findMany({
    where: {
      userId,
      scheduledFor: dateStr,
      status: { in: ["PENDING", "IN_PROGRESS"] }
    }
  });

  if (pendingQuests.length === 0) return { success: true, message: "Day is already clear." };

  const targetDate = new Date(`${dateStr}T00:00:00Z`);
  const nextDay = new Date(targetDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().split("T")[0];

  // Look ahead up to 14 days for capacity
  const searchEnd = new Date(targetDate);
  searchEnd.setUTCDate(searchEnd.getUTCDate() + 14);
  const searchEndStr = searchEnd.toISOString().split("T")[0];

  const effortLevel = await getHighestEffortLevel(userId, tx);
  const matrix = await calculateDailyCapacity(userId, effortLevel, nextDayStr, searchEndStr, tx);

  const updates: { id: number; newDate: string }[] = [];
  const unplaced = [];

  for (const q of pendingQuests) {
    let placed = false;
    for (const [day, cap] of Object.entries(matrix)) {
      if (cap >= q.requiredMinutes) {
        updates.push({ id: q.id, newDate: day });
        matrix[day] -= q.requiredMinutes; // Deduct capacity
        placed = true;
        break;
      }
    }
    if (!placed) unplaced.push(q.title);
  }

  if (unplaced.length > 0) {
    return {
      error: "Cannot clear day: Not enough capacity in the next 14 days to reschedule quests.",
      unplacedQuests: unplaced
    };
  }

  await assertNoLinkedQuests(userId, { id: { in: updates.map(u => u.id) } }, tx);
  await Promise.all(updates.map(u => tx.quest.update({ where: { id: u.id }, data: { scheduledFor: u.newDate } })));

  return {
    success: true,
    message: `Cleared ${dateStr}. Pushed ${updates.length} quests forward safely.`
  };
  });
}

// --- Phase 3B: Analytics Tools ---

async function executeGetSubjectAnalytics(userId: number) {
  // Use "calendar" agent base as it's lightweight, then explicitly ask for subjects
  const context = await buildRelevantContext(userId, "calendar" as any, ["subjects"]);
  return context.subjects || { error: "No subject data available." };
}

async function executeGetPerformanceTrends(userId: number) {
  const context = await buildRelevantContext(userId, "calendar" as any, ["trends"]);
  return context.trends || { error: "No trends data available." };
}

async function executeGetDailyPattern(userId: number) {
  const context = await buildRelevantContext(userId, "calendar" as any, ["trends"]);
  const trends = context.trends;
  if (!trends) return { error: "No pattern data available." };

  return {
    bestDayOfWeek: trends.bestDayOfWeek || "Unknown",
    avgDailyMinutes: trends.avgDailyMinutes,
    currentStreakDays: trends.currentStreakDays,
    longestRecentStreak: trends.longestRecentStreak,
  };
}

// --- Phase 3C: Memory Tools ---

async function executeSaveMemory(userId: number, args: Record<string, any>) {
  const { key, value, source, confidence } = args;
  if (!key || !value) return { error: "Missing key or value." };

  let conf = Number(confidence) || 1.0;
  conf = Math.max(0, Math.min(1, conf)); // Clamp between 0 and 1
  const src = source === "user_stated" ? "user_stated" : "inferred";

  // Prevent storing excessively large memories
  if (value.length > 500) return { error: "Memory value too long (max 500 chars)." };
  if (key.length > 100) return { error: "Memory key too long (max 100 chars)." };

  const existing = await prisma.aiMemory.findUnique({
    where: { userId_key: { userId, key } }
  });

  if (existing && existing.source === "user_stated" && src === "inferred") {
    return { error: "Cannot overwrite a user_stated memory with an inferred assumption. The user's explicit statement takes precedence." };
  }

  await prisma.aiMemory.upsert({
    where: { userId_key: { userId, key } },
    update: { value: String(value), source: src, confidence: conf },
    create: { userId, key: String(key), value: String(value), source: src, confidence: conf }
  });

  return { success: true, message: `I'll remember this: "${key}" -> "${value}"` };
}

async function executeGetMemory(userId: number, args: Record<string, any>) {
  const { key } = args;
  if (!key) return { error: "Missing key." };

  const mem = await prisma.aiMemory.findUnique({
    where: { userId_key: { userId, key } }
  });

  if (!mem) return { error: "Memory not found." };
  return { key: mem.key, value: mem.value, source: mem.source, confidence: mem.confidence };
}

async function executeForgetMemory(userId: number, args: Record<string, any>) {
  const { key } = args;
  if (!key) return { error: "Missing key." };

  const mem = await prisma.aiMemory.findUnique({
    where: { userId_key: { userId, key } }
  });

  if (!mem) return { error: "Memory not found." };

  await prisma.aiMemory.delete({
    where: { userId_key: { userId, key } }
  });

  return { success: true, message: `I have forgotten: "${key}"` };
}

// --- Phase 3D: App-State & Recommendations ---

const INSIGHT_SIMILARITY_THRESHOLD = 0.5;
const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "you", "your", "to", "and", "should", "for", "in", "of", "on", "with", "have", "has", "been", "this", "that", "it", "at", "by", "from", "be", "do", "not", "we", "can", "will"]);
const OPPOSING_PAIRS = [
  new Set(["improving", "declining"]),
  new Set(["improving", "worsening"]),
  new Set(["increasing", "decreasing"]),
  new Set(["increasing", "dropping"]),
  new Set(["falling", "recovering"]),
  new Set(["falling", "rising"]),
  new Set(["better", "worse"]),
  new Set(["up", "down"]),
  new Set(["higher", "lower"]),
  new Set(["dropped", "recovered"]),
  new Set(["dropped", "rose"]),
];

export function calculateSemanticSimilarity(text1: string, text2: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  for (const pair of OPPOSING_PAIRS) {
    const arr = Array.from(pair);
    if ((words1.has(arr[0]) && words2.has(arr[1])) || (words1.has(arr[1]) && words2.has(arr[0]))) {
      return 0; // Materially different meaning
    }
  }

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;

  const jaccard = intersection.size / union.size;
  if (union.size < 4 && jaccard <= 0.66) return 0; // Safe-guard short strings

  return jaccard;
}

async function executeGenerateInsight(userId: number, args: Record<string, any>) {
  const { category, content } = args;
  if (!category || !content) return { error: "Missing category or content." };

  if (content.length > 200) return { error: "Content too long (max 200 chars)." };

  const validCategories = ["coaching", "trend", "recommendation", "warning"];
  if (!validCategories.includes(category)) {
    return { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` };
  }

  const now = new Date();

  // 1. Cooldown check (60 minutes)
  const cooldownThreshold = new Date(now.getTime() - 60 * 60 * 1000);
  const recentInsight = await prisma.aiInsight.findFirst({
    where: { userId, createdAt: { gte: cooldownThreshold } },
    select: { id: true }
  });
  if (recentInsight) {
    return { error: "Cooldown active. An insight was already generated in the last 60 minutes." };
  }

  // 2. Daily limit check (3 per day)
  const tz = await getUserTimezone(userId);
  const todayStartUtc = TimezoneService.getStartOfDayUTC(tz, now);
  const todaysInsightsCount = await prisma.aiInsight.count({
    where: { userId, createdAt: { gte: todayStartUtc } }
  });
  if (todaysInsightsCount >= 3) {
    return { error: "Daily insight limit reached." };
  }

  // 3. Exact Duplicate check
  const strictExactDuplicate = await prisma.aiInsight.findFirst({
    where: { userId, content }
  });
  if (strictExactDuplicate) {
    return { error: "An identical insight has already been saved previously." };
  }

  // 4. Bounded Semantic Deduplication
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentHistory = await prisma.aiInsight.findMany({
    where: { userId, createdAt: { gte: sevenDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { content: true }
  });

  const normalizedNew = content.trim().toLowerCase().replace(/[^\w\s]/g, "");
  for (const past of recentHistory) {
    // Check normalized exact duplicate first
    if (past.content.trim().toLowerCase().replace(/[^\w\s]/g, "") === normalizedNew) {
      return { error: "An identical insight has already been saved previously." };
    }

    // Check Jaccard similarity
    const similarity = calculateSemanticSimilarity(content, past.content);
    if (similarity > INSIGHT_SIMILARITY_THRESHOLD) {
      return { error: "A semantically similar insight was recently generated." };
    }
  }

  await prisma.aiInsight.create({
    data: { userId, category, content }
  });

  return { success: true, message: "Insight successfully saved to user dashboard." };
}

async function executeGetAppState(userId: number) {
  const [user, goals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        level: true,
        hunterRank: true,
        currentXP: true,
        xpToNextLevel: true,
        sylph: true,
        hp: true,
        maxHp: true,
        streakDays: true,
      }
    }),
    prisma.goal.findMany({
      where: { userId, status: "ACTIVE" },
      select: { title: true, effortLevel: true }
    })
  ]);

  if (!user) return { error: "User not found." };
  return {
    ...user,
    activeGoals: goals
  };
}

async function executeGetShopInventory() {
  return {
    items: SHOP_ITEMS.map((item) => ({
      key: item.itemKey,
      name: item.name,
      cost: item.price,
      effect: item.description,
    })),
  };
}

/**
 * Execute Google Search Grounding to retrieve live syllabus, exam specs, or curriculum data.
 */
export async function executeGoogleSearch(args: {
  query?: string;
  qualification?: string;
}, signal?: AbortSignal): Promise<Record<string, any>> {
  const query = (args.query || "").trim();
  if (!query) {
    return { error: "Query parameter is required for googleSearch." };
  }

  const qualification = (args.qualification || "").trim();
  const searchPrompt = qualification
    ? `Search official curriculum & exam specifications for ${qualification}: ${query}`
    : `Search official academic curriculum & syllabus specifications for: ${query}`;

  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await generateGeminiContent(ai, {
        // Model comes from the shared registry so a rename here never desyncs
        // from every other Gemini workload.
        model: GEMINI_MODELS.research,
        contents: searchPrompt,
        config: {
          systemInstruction:
            "You are an Academic Curriculum & Syllabus Search specialist. Return concise, structured curriculum findings including exact chapter titles, subtopics, exam board codes (CAIE, Edexcel, AP, IB), and difficulty ratings.",
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 8192, abortSignal: aiSignal(signal, 30_000),
        },
      });

      const text = response.text || "";
      if (text.trim().length > 0) {
        return {
          query,
          qualification: qualification || undefined,
          source: "Google Search Grounding",
          summary: text,
        };
      }
    } catch {
      console.warn("[chat-tool-executor] Gemini search grounding fallback:");
    }
  }

  // An unavailable search is not evidence. Never fabricate findings for callers.
  return {
    query,
    qualification: qualification || undefined,
    error: "Live web search is unavailable. No search results were retrieved.",
  };
}
