import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { getSubjectDependencySummary } from "@/lib/subject-service";
import { revalidateTag } from "next/cache";

type RouteParams = { params: Promise<{ id: string }> };

async function getUserId(req: NextRequest): Promise<number | null> {
  const session = await getSession(req);
  if (session && session.userId) {
    return session.userId as number;
  }
  return null;
}

const updateSubjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name cannot be empty").max(100).optional(),
  code: z.string().trim().min(1, "Syllabus code cannot be empty").max(50).optional(),
  examBoard: z.string().trim().min(1).max(50).optional(),
  level: z.string().trim().min(1).max(50).optional(),
  color: z.string().trim().max(30).optional(),
  syllabusNote: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/subjects/[id]
 * Returns subject metadata and cross-app dependency inspection.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await props.params;
    const subjectId = parseInt(params.id, 10);
    if (isNaN(subjectId)) {
      return NextResponse.json({ error: "Invalid subject ID" }, { status: 400 });
    }

    const summary = await getSubjectDependencySummary(userId, subjectId);
    if (!summary.subject) {
      return NextResponse.json(
        { error: "Subject not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...summary.subject,
      hasActiveSession: summary.hasActiveSession,
      activeSessionId: summary.activeSessionId,
      activeQuestsCount: summary.activeQuestsCount,
      activePlansCount: summary.activePlansCount,
      totalSessionsCount: summary.totalSessionsCount,
    });
  } catch (error) {
    console.error("GET /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/subjects/[id]
 * Updates canonical active Subject metadata (name, code, examBoard, level, color, syllabusNote).
 */
export async function PATCH(req: NextRequest, props: RouteParams) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await props.params;
    const subjectId = parseInt(params.id, 10);
    if (isNaN(subjectId)) {
      return NextResponse.json({ error: "Invalid subject ID" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    return await executionTransaction(userId, async tx => {
    const existing = await tx.subject.findFirst({
      where: { id: subjectId, userId },
      include: {
        user: { select: { username: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Subject not found or unauthorized" },
        { status: 404 }
      );
    }

    if (existing.archivedAt !== null) {
      return NextResponse.json(
        { error: "Cannot edit an archived subject. Restore it before editing." },
        { status: 400 }
      );
    }

    const updateData: {
      name?: string;
      code?: string;
      examBoard?: string;
      level?: string;
      color?: string;
      syllabusNote?: string | null;
    } = {};

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }

    if (parsed.data.code !== undefined) {
      const cleanCode = parsed.data.code.toUpperCase();
      if (cleanCode !== existing.code) {
        // Enforce uniqueness against other subjects owned by this user
        const conflict = await tx.subject.findFirst({
          where: {
            userId,
            code: cleanCode,
            NOT: { id: subjectId },
          },
          select: { id: true, archivedAt: true },
        });

        if (conflict) {
          return NextResponse.json(
            {
              error: "DUPLICATE_CODE",
              message: conflict.archivedAt
                ? `A previous subject with code "${cleanCode}" already exists in your archives.`
                : `A subject with syllabus code "${cleanCode}" already exists.`,
            },
            { status: 409 }
          );
        }
        updateData.code = cleanCode;
      }
    }

    if (parsed.data.examBoard !== undefined) {
      updateData.examBoard = parsed.data.examBoard.toUpperCase();
    }
    if (parsed.data.level !== undefined) {
      updateData.level = parsed.data.level;
    }
    if (parsed.data.color !== undefined) {
      updateData.color = parsed.data.color;
    }
    if (parsed.data.syllabusNote !== undefined) {
      updateData.syllabusNote = parsed.data.syllabusNote;
    }

    const updated = await tx.subject.update({
      where: { id: subjectId },
      data: updateData,
    });

    if (existing.user?.username) {
      try {
        revalidateTag(`user-${existing.user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${existing.user.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json(updated);
    });
  } catch (error) {
    console.error("PATCH /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/subjects/[id]
 * Safely soft-deletes (archives) a Subject.
 * Preserves all study session history, XP records, quests, and planner lineages.
 * BLOCKS deletion if the subject is currently in an active running Focus session.
 */
export async function DELETE(req: NextRequest, props: RouteParams) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await props.params;
    const subjectId = parseInt(params.id, 10);
    if (isNaN(subjectId)) {
      return NextResponse.json({ error: "Invalid subject ID" }, { status: 400 });
    }

    return await executionTransaction(userId, async tx => {
    const existing = await tx.subject.findFirst({
      where: { id: subjectId, userId },
      include: {
        user: { select: { username: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Subject not found or unauthorized" },
        { status: 404 }
      );
    }

    // Idempotency: if already archived, return clean success
    if (existing.archivedAt !== null) {
      return NextResponse.json({
        success: true,
        message: `Subject "${existing.name}" is already archived.`,
        subject: existing,
      });
    }

    // REQUIREMENT 10: RUNNING FOCUS SESSION GUARD
    // If the subject is currently being used in an active/running Focus session,
    // DELETE MUST BE BLOCKED.
    const activeSession = await tx.studySession.findFirst({
      where: {
        userId,
        subjectId,
        endedAt: null,
      },
      select: { id: true, startedAt: true },
    });

    if (activeSession) {
      return NextResponse.json(
        {
          error: "ACTIVE_SESSION_RUNNING",
          message: `${existing.name} is being used in your current Focus session. End the session before deleting this subject.`,
        },
        { status: 409 }
      );
    }

    // Safe soft delete — sets archivedAt timestamp without dropping any relations
    const archived = await tx.subject.update({
      where: { id: subjectId },
      data: { archivedAt: new Date() },
    });

    if (existing.user?.username) {
      try {
        revalidateTag(`user-${existing.user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${existing.user.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Subject "${existing.name}" removed from active subjects. Historical progress preserved.`,
      subject: archived,
    });
    });
  } catch (error) {
    console.error("DELETE /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
