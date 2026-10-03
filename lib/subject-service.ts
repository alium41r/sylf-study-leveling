import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Canonical Prisma where-clause predicate for active (non-archived) subjects.
 * Used across the application to consistently exclude soft-deleted subjects
 * from active creation surfaces, pickers, and live timer lists.
 */
export function activeSubjectWhere(userId?: number): Prisma.SubjectWhereInput {
  return {
    ...(userId !== undefined ? { userId } : {}),
    archivedAt: null,
  };
}

/**
 * Gathers pre-flight dependency telemetry for a subject before editing or deletion.
 * Protects referential integrity without silent cascading destruction.
 */
export async function getSubjectDependencySummary(userId: number, subjectId: number) {
  const [subject, activeSession, activeQuestsCount, activePlansCount, totalSessionsCount] =
    await Promise.all([
      prisma.subject.findFirst({
        where: { id: subjectId, userId },
        select: {
          id: true,
          name: true,
          code: true,
          examBoard: true,
          level: true,
          color: true,
          syllabusNote: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Active / running focus session check (Requirement 10)
      prisma.studySession.findFirst({
        where: {
          userId,
          subjectId,
          endedAt: null,
        },
        select: { id: true, startedAt: true },
      }),
      // Active / pending quests (Requirement 8)
      prisma.quest.count({
        where: {
          userId,
          subjectId,
          status: { in: ["PENDING", "IN_PROGRESS", "ACTIVE"] },
        },
      }),
      // Active planner plans (Requirement 9)
      prisma.plannerPlan.count({
        where: {
          userId,
          subjectId,
          state: { not: "ARCHIVED" },
        },
      }),
      // Historical session count
      prisma.studySession.count({
        where: {
          userId,
          subjectId,
        },
      }),
    ]);

  return {
    subject,
    hasActiveSession: !!activeSession,
    activeSessionId: activeSession?.id ?? null,
    activeQuestsCount,
    activePlansCount,
    totalSessionsCount,
  };
}
