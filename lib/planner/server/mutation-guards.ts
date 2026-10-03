import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "@/lib/difficulty-engine";
import { DateKeySchema } from "../contracts";
import { weekday } from "../dates";
import { PlannerError } from "../errors";
import { transaction } from "./core";

// Preflights provide useful responses. SQL triggers are the authoritative race backstop.
export async function assertNoLinkedQuests(userId: number, where: Prisma.QuestWhereInput = {}, tx: Prisma.TransactionClient = prisma) {
  if (await tx.plannerQuestLink.findFirst({ where: { quest: { ...where, userId } }, select: { id: true } })) throw new PlannerError(409, "PLANNER_REVIEW_REQUIRED");
}
export async function assertNoPlannerGoals(userId: number, ids?: number[], tx: Prisma.TransactionClient = prisma) {
  if (await tx.plannerPlan.findFirst({ where: { userId, goalId: ids ? { in: ids } : { not: null } }, select: { id: true } })) throw new PlannerError(409, "PLANNER_REVIEW_REQUIRED");
  await assertNoLinkedQuests(userId, ids ? { goalId: { in: ids } } : { goalId: { not: null } }, tx);
}
export async function deleteUnlinkedGoals(userId: number, ids?: number[], allQuests = false, client?: Prisma.TransactionClient) {
  const run = async (tx: Prisma.TransactionClient) => {
    await assertNoPlannerGoals(userId, ids, tx);
    const where = { userId, ...(allQuests ? {} : { goalId: ids ? { in: ids } : { not: null } }) };
    await assertNoLinkedQuests(userId, where, tx);
    const quests = await tx.quest.deleteMany({ where });
    const goals = await tx.goal.deleteMany({ where: { userId, ...(ids ? { id: { in: ids } } : {}) } });
    return { quests: quests.count, goals: goals.count };
  };
  return client ? run(client) : transaction(userId, run);
}
export function isPlannerConflict(error: unknown) {
  return error instanceof PlannerError || (error instanceof Error && /PLANNER_(V2_(REVIEW_REQUIRED|PATH_REQUIRED)|REVIEW_REQUIRED|EXECUTION_PROTECTED|APPLY_REQUIRED|EXECUTION_PROTOCOL_REQUIRED|COORDINATION_REQUIRED|STARTED_HISTORY_PROTECTED|STARTED_CONTENT_PROTECTED)/.test(error.message));
}
export async function manualPlannerGoal(userId: number, goalId: number, data: Prisma.GoalUpdateInput) {
  return transaction(userId, async tx => {
    const linked = await tx.goal.findFirst({ where: { id: goalId, userId, OR: [{ plannerPlans: { some: {} } }, { quests: { some: { plannerLink: { isNot: null } } } }] }, select: { id: true } });
    if (!linked) return null;
    if (await tx.plannerPlan.findFirst({ where: { userId, goalId, contractVersion: 2 }, select: { id: true } })) throw new PlannerError(409, "PLANNER_V2_REVIEW_REQUIRED");
    await tx.$queryRaw`SELECT id FROM "Goal" WHERE id = ${goalId} AND "userId" = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT set_config('sylf.planner_manual_goal', ${String(goalId)}, true)`;
    return tx.goal.update({ where: { id: goalId, userId }, data });
  });
}
const ManualSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(), description: z.string().max(2000).nullable().optional(),
  requiredMinutes: z.number().int().min(15).max(240).optional(), scheduledFor: DateKeySchema.optional(),
  goalId: z.number().int().positive().nullable().optional(), difficulty: z.enum(["EASY", "NORMAL", "HARD", "EXPERT"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(), elapsedSeconds: z.number().int().nonnegative().optional(),
});
export async function manualLinkedQuest(userId: number, questId: number, raw: unknown, remove = false) {
  const linked = await prisma.plannerQuestLink.findFirst({ where: { questId, plan: { userId } }, select: { id: true, plan: { select: { contractVersion: true } } } });
  if (!linked) return null;
  const parsed = ManualSchema.safeParse(raw);
  if (!parsed.success) throw new PlannerError(400, "INVALID_LINKED_QUEST_EDIT");
  const body = parsed.data;
  const { status, elapsedSeconds, ...fields } = body;
  const structural = Object.keys(fields).length > 0;
  if (linked.plan?.contractVersion === 2 && (remove || structural)) throw new PlannerError(409, "PLANNER_V2_REVIEW_REQUIRED");
  // Execution remains in the canonical reward/session paths. Mixed commands are
  // rejected before awarding anything, so a later field failure cannot partially succeed.
  if (!remove && !structural) return null;
  if (status !== undefined || elapsedSeconds !== undefined) throw new PlannerError(409, "SEPARATE_EXECUTION_AND_EDIT");
  return transaction(userId, async tx => {
    const current = await tx.plannerQuestLink.findFirst({ where: { questId, plan: { userId } }, select: { id: true, plan: { select: { contractVersion: true } } } });
    if (current?.plan.contractVersion === 2) throw new PlannerError(409, "PLANNER_V2_REVIEW_REQUIRED");
    await tx.$queryRaw`SELECT id FROM "Quest" WHERE id = ${questId} AND "userId" = ${userId} FOR UPDATE`;
    const quest = await tx.quest.findFirst({ where: { id: questId, userId }, include: { sessions: { select: { id: true } } } });
    if (!quest) throw new PlannerError(404, "NOT_FOUND");
    const unsafe = remove || body.requiredMinutes !== undefined || body.scheduledFor !== undefined || body.goalId !== undefined || body.difficulty !== undefined;
    if (["COMPLETED", "FAILED"].includes(quest.status) || (unsafe && (quest.elapsedSeconds > 0 || quest.status === "IN_PROGRESS" || quest.sessions.length))) throw new PlannerError(409, "PLANNER_EXECUTION_PROTECTED");
    if (body.goalId && !await tx.goal.findFirst({ where: { id: body.goalId, userId }, select: { id: true } })) throw new PlannerError(404, "NOT_FOUND");
    if (body.scheduledFor) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { restDays: true } });
      const floating = await tx.floatingRestDay.findUnique({ where: { userId_dateKey: { userId, dateKey: body.scheduledFor } } });
      if (user.restDays.includes(weekday(body.scheduledFor)) || floating) throw new PlannerError(422, "BLOCKED_DATE");
    }
    await tx.$queryRaw`SELECT set_config('sylf.planner_manual_quest', ${String(questId)}, true)`;
    if (remove) { await tx.quest.delete({ where: { id: questId } }); return { deleted: true as const }; }
    const minutes = body.requiredMinutes ?? quest.requiredMinutes;
    const difficulty = body.difficulty ?? (body.requiredMinutes ? calculateRecommendedDifficulty(minutes) : quest.difficulty);
    const rewards = calculateQuestRewards(minutes, difficulty);
    return { quest: await tx.quest.update({ where: { id: questId }, data: { ...fields, ...(body.requiredMinutes !== undefined || body.difficulty !== undefined ? { requiredMinutes: minutes, targetMinutes: minutes, difficulty, xpReward: rewards.xp, sylphReward: rewards.sylph } : {}) } }) };
  });
}
