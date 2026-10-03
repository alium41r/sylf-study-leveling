import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { type AchievementFacts } from "./achievement-progress";

// GET and redemption use the same facts and predicates. Database errors must fail
// the request rather than silently presenting earned milestones as zero progress.
export async function readAchievementFacts(
  userId: number, client: Prisma.TransactionClient = prisma
): Promise<AchievementFacts | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      totalStudyMinutes: true,
      totalStudySeconds: true,
      streakDays: true,
      level: true,
    },
  });
  if (!user) return null;
  const [
    quests,
    friends,
    sessions,
    subjects,
    plans,
    partySessions,
    backgrounds,
    items,
    ledger,
  ] = await Promise.all([
    client.quest.count({ where: { userId, status: "COMPLETED" } }),
    client.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      select: { userId: true, friendId: true },
    }),
    client.studySession.count({
      where: {
        userId,
        endedAt: { not: null },
        OR: [{ durationSeconds: { gte: 60 } }, { durationMinutes: { gte: 1 } }],
      },
    }),
    client.subject.count({ where: { userId } }),
    client.plannerPlan.count({
      where: { userId, activeRevisionId: { not: null } },
    }),
    client.focusSessionMember.count({
      where: {
        userId,
        accumulatedSeconds: { gte: 60 },
        OR: [
          { leftAt: { not: null } },
          { session: { endedAt: { not: null } } },
        ],
      },
    }),
    client.userFocusBackground.count({ where: { userId } }),
    client.userInventory.count({ where: { userId, quantity: { gt: 0 } } }),
    client.sylphLedger.aggregate({
      where: { userId, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ]);
  return {
    studyMinutes: Math.max(
      user.totalStudyMinutes || 0,
      Math.floor((user.totalStudySeconds || 0) / 60)
    ),
    streakWeeks: user.streakDays || 0,
    level: Math.max(1, user.level || 1),
    friends: new Set(
      friends
        .map((friend) =>
          friend.userId === userId ? friend.friendId : friend.userId
        )
        .filter((id) => id !== userId)
    ).size,
    quests,
    sessions,
    subjects,
    plans,
    partySessions,
    backgrounds,
    items,
    sylphSpent: Math.abs(ledger._sum.amount || 0),
  };
}
