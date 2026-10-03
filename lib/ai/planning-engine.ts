import { prisma } from "@/lib/prisma";
import { EFFORT_CONFIG, EffortLevel } from "@/lib/game-engine";
import { QuestDifficulty, type Prisma } from "@prisma/client";
import { TimezoneService } from "../timezone-service";
import { getUserTimezone } from "../timezone-server";

export async function getHighestEffortLevel(userId: number, client: Prisma.TransactionClient = prisma): Promise<EffortLevel> {
  const goal = await client.goal.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" }
  });
  if (!goal || !goal.effortLevel) return "NORMAL";
  return goal.effortLevel as EffortLevel;
}

export async function getSituationalFlags(userId: number, client: Prisma.TransactionClient = prisma): Promise<{
  isBurnoutRisk: boolean;
  isOverloaded: boolean;
  isStruggling: boolean;
}> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { hp: true, streakDays: true }
  });
  if (!user) return { isBurnoutRisk: false, isOverloaded: false, isStruggling: false };

  // 1. Burnout Risk: HP is very low (<30) OR (HP < 50 AND taking more damage than healing)
  let isBurnoutRisk = user.hp < 30;
  if (!isBurnoutRisk && user.hp < 50) {
    const recentHp = await client.hpLedger.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { amount: true }
    });
    const recentDamage = Math.abs(recentHp.filter(h => h.amount < 0).reduce((s, h) => s + h.amount, 0));
    const recentHealing = recentHp.filter(h => h.amount > 0).reduce((s, h) => s + h.amount, 0);
    if (recentDamage > recentHealing) isBurnoutRisk = true;
  }

  // 2. Overloaded: Next 7 days scheduled minutes > 90% of total weekly capacity
  const effortLevel = await getHighestEffortLevel(userId, client);
  const dailyBudget = EFFORT_CONFIG[effortLevel].dailyMinutes;
  
  const timezone = await getUserTimezone(userId, client);
  const next7Dates = TimezoneService.getDateRangeInUserTimezone(timezone, 1, 7);
  
  const upcomingQuests = await client.quest.aggregate({
    where: { userId, scheduledFor: { in: next7Dates } },
    _sum: { requiredMinutes: true }
  });
  const totalScheduled = upcomingQuests._sum.requiredMinutes || 0;
  const isOverloaded = totalScheduled > (dailyBudget * 7) * 0.9;

  // 3. Struggling: 0 streak AND recent completion rate is poor (<50% over last 14 days)
  let isStruggling = false;
  if (user.streakDays === 0) {
    const recentQuests = await client.quest.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      select: { status: true }
    });
    if (recentQuests.length > 0) {
      const completed = recentQuests.filter(q => q.status === "COMPLETED").length;
      if (completed / recentQuests.length < 0.5) isStruggling = true;
    } else {
      isStruggling = true; // 0 streak and no quests = struggling to start
    }
  }

  return { isBurnoutRisk, isOverloaded, isStruggling };
}

export interface CapacityMatrix {
  [dateStr: string]: number; // YYYY-MM-DD -> available minutes
}

export interface ProposedQuest {
  title: string;
  description: string;
  requiredMinutes: number;
  xpReward: number;
  sylphReward: number;
  proposedDate: string; // YYYY-MM-DD
}

/**
 * 1. Calculate Daily Capacity
 * Evaluates the user's effort level to determine their daily budget,
 * then queries the database for already-scheduled quests in the given date range.
 * Subtracts scheduled minutes from the daily budget.
 */
export async function calculateDailyCapacity(
  userId: number,
  effortLevel: EffortLevel,
  startDateStr: string,
  endDateStr: string,
  client: Prisma.TransactionClient = prisma
): Promise<CapacityMatrix> {
  let dailyBudget: number = EFFORT_CONFIG[effortLevel].dailyMinutes;
  
  // Apply deterministic workload reductions if user is burning out or overloaded
  const flags = await getSituationalFlags(userId, client);
  if (flags.isBurnoutRisk) {
    dailyBudget = Math.floor(dailyBudget * 0.5); // cut capacity in half to force rest
  } else if (flags.isOverloaded) {
    dailyBudget = Math.floor(dailyBudget * 0.75); // slight reduction to prevent further overload
  }
  
  // Get user rest days if any
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { restDays: true }
  });
  const restDays = user?.restDays || [];

  // Floating (ad-hoc) rest days are hard-blocked exactly like fixed ones —
  // every ingestion vector that plans through the capacity matrix must
  // never allocate quests onto these dates.
  const floating = await client.floatingRestDay.findMany({
      where: { userId, dateKey: { gte: startDateStr, lte: endDateStr } },
      select: { dateKey: true },
    });
  const floatingRestDays = floating.map((r) => r.dateKey);
  const floatingRestSet = new Set(floatingRestDays);

  // Find all quests the user has scheduled between startDate and endDate
  const existingQuests = await client.quest.findMany({
    where: {
      userId,
      scheduledFor: {
        gte: startDateStr,
        lte: endDateStr,
      }
    },
    select: { scheduledFor: true, requiredMinutes: true }
  });

  const matrix: CapacityMatrix = {};
  
  // Create an array of valid date strings ordered chronologically for fast fallback lookup
  let curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  while (curr <= end) {
    const dateStr = curr.toISOString().split("T")[0];
    const parts = dateStr.split("-").map((n) => parseInt(n, 10));
    const dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    const isRest = restDays.includes(dayOfWeek);

    // Rest days (fixed OR floating) have a massive negative budget to prevent
    // the fallback logic from overflowing quests onto them when normal days
    // are full.
    matrix[dateStr] = isRest || floatingRestSet.has(dateStr) ? -999999 : dailyBudget;
    curr.setDate(curr.getDate() + 1);
  }

  // Subtract minutes for already scheduled quests
  for (const q of existingQuests) {
    if (matrix[q.scheduledFor] !== undefined) {
      matrix[q.scheduledFor] -= q.requiredMinutes;
      if (matrix[q.scheduledFor] < 0) {
        matrix[q.scheduledFor] = 0;
      }
    }
  }

  return matrix;
}

/**
 * 2. Normalize Difficulty
 * Ensures a quest's difficulty isn't just set blindly by the LLM. 
 * E.g., 60 mins might be HARD for someone who averages 30 mins, but NORMAL for someone who averages 90.
 */
export function normalizeDifficulty(
  questMinutes: number, 
  userAverageMinutes: number = 45 // fallback average
): QuestDifficulty {
  const ratio = questMinutes / userAverageMinutes;
  
  if (ratio <= 0.6) return "EASY";
  if (ratio <= 1.2) return "NORMAL";
  if (ratio <= 2.0) return "HARD";
  return "EXPERT";
}

/**
 * 3. Schedule Quests Deterministically (Backend-Authoritative)
 * Iterates through the LLM's proposed quests. If the proposed date is valid
 * and has capacity, it keeps it. If not, it deterministically pushes it to the 
 * next available day that has capacity.
 */
export function scheduleQuestsDeterministically(
  quests: ProposedQuest[],
  capacityMatrix: CapacityMatrix,
  startDateStr: string,
  endDateStr: string
): (ProposedQuest & { finalDate: string })[] {
  
  const finalQuests: (ProposedQuest & { finalDate: string })[] = [];
  
  // Create a mutable copy of the capacity matrix so we can deduct as we schedule
  const currentCapacity = { ...capacityMatrix };
  
  // Create an array of valid date strings ordered chronologically for fast fallback lookup
  let curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  const validDates: string[] = [];
  while (curr <= end) {
    validDates.push(curr.toISOString().split("T")[0]);
    curr.setDate(curr.getDate() + 1);
  }

  for (const q of quests) {
    let targetDate = q.proposedDate;
    let scheduled = false;

    // 1. Try the LLM's proposed date first
    if (validDates.includes(targetDate) && currentCapacity[targetDate] >= q.requiredMinutes) {
      currentCapacity[targetDate] -= q.requiredMinutes;
      finalQuests.push({ ...q, finalDate: targetDate });
      scheduled = true;
      continue;
    }

    // 2. If the proposed date fails, search forward for the next available day
    let startIndex = validDates.indexOf(targetDate);
    if (startIndex === -1) {
      // The LLM hallucinated a date outside the valid range. Start from the beginning.
      startIndex = 0;
    }

    for (let i = startIndex; i < validDates.length; i++) {
      const fallbackDate = validDates[i];
      if (currentCapacity[fallbackDate] >= q.requiredMinutes) {
        currentCapacity[fallbackDate] -= q.requiredMinutes;
        finalQuests.push({ ...q, finalDate: fallbackDate });
        scheduled = true;
        break;
      }
    }

    // 3. What if NO day has enough capacity? (e.g. user asked for too much work in too short a time)
    // We must schedule it anyway to fulfill the goal, but we put it on the day with the MOST remaining capacity
    // to minimize overload.
    if (!scheduled) {
      let maxCap = -Infinity;
      let bestDay = validDates[0];
      
      for (const d of validDates) {
        if (currentCapacity[d] > maxCap) {
          maxCap = currentCapacity[d];
          bestDay = d;
        }
      }
      
      currentCapacity[bestDay] -= q.requiredMinutes; // will go negative, but that's ok as a fallback
      finalQuests.push({ ...q, finalDate: bestDay });
    }
  }

  return finalQuests;
}
