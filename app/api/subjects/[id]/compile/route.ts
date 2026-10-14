import { executionTransaction } from "@/lib/execution-coordination";
import { PlannerError } from "@/lib/planner/errors";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { compileSyllabus } from "@/lib/ai/syllabus-compiler";
import { checkQuota, reserveQuota, releaseQuota } from "@/lib/ai/usage-limiter";
import { revalidateTag } from "next/cache";

// The compile runs a grounded research call + one large LLM generation;
// give the serverless function a generous window (Vercel Pro allows 300s).
export const maxDuration = 300;

async function getUserId(req: NextRequest): Promise<number | null> {
  const session = await getSession(req);
  if (session && session.userId) {
    return session.userId as number;
  }
  return null;
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
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

    // 1. Verify user ownership of the Subject
    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        userId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        examBoard: true,
        level: true,
        syllabusNote: true,
        lastCompiledAt: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    // 2. ONE-COMPILE-PER-SUBJECT (forever): once a subject's syllabus has
    //    been compiled, it can never be compiled again. This protects
    //    DeepSeek tokens — the compile is a single, one-time AI generation.
    if (subject.lastCompiledAt) {
      return NextResponse.json(
        {
          error: "SUBJECT_ALREADY_COMPILED",
          message: "This subject's syllabus has already been compiled and cannot be compiled again.",
          lastCompiledAt: subject.lastCompiledAt,
        },
        { status: 409 }
      );
    }

    // 3. Daily rate limit for syllabus compilations (1/day per user). Combined
    //    with the one-compile-per-subject rule above, a user can compile at
    //    most ONE subject per day, and never the same subject twice.
    // S4: this check is informational — the atomic reserve happens in step 4.
    const quota = await checkQuota(userId, "compile");
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          feature: "compile",
          remaining: 0,
          limit: quota.limit,
          resetsAt: quota.resetsAt,
        },
        { status: 429 }
      );
    }

    // 4. RESERVE the quota unit atomically BEFORE the expensive compile (the
    //    authoritative concurrency guard — `charged` means the reservation
    //    actually succeeded; a parallel request would get charged=false).
    //    A configured owner account bypasses the reservation entirely, so
    //    `unlimited` is accepted as permission alongside `charged`.
    const reserved = await reserveQuota(userId, "compile");
    if (!reserved.charged && !reserved.unlimited) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          feature: "compile",
          remaining: 0,
          limit: reserved.limit,
          resetsAt: reserved.resetsAt,
        },
        { status: 429 }
      );
    }

    // 5. Call AI Syllabus Compiler to decompose the curriculum into 48 nodes.
    //    The compile is grounded on Gemini's Google Search and uses the
    //    subject's exact book/syllabus/class details (syllabusNote) that the
    //    user entered when adding the subject.
    const compilationResult = await compileSyllabus(
      {
        name: subject.name,
        code: subject.code,
        examBoard: subject.examBoard,
        level: subject.level,
        syllabusNote: subject.syllabusNote || undefined,
        userId,
      },
      req.signal
    );

    // Provider work stays outside the lock. Persist only if the owned source
    // still matches exactly; node content and the claim stamp commit together.
    await executionTransaction(userId, async tx => {
      const current = await tx.subject.findFirst({ where: { id: subject.id, userId, archivedAt: null } });
      if (!current || ["name", "code", "examBoard", "level", "syllabusNote", "lastCompiledAt"].some(key =>
        Reflect.get(current, key) !== Reflect.get(subject, key))) throw new PlannerError(409, "SUBJECT_CONTEXT_CHANGED");
      await Promise.all(compilationResult.nodes.map(nodeData => tx.subjectNode.updateMany({
        where: { subjectId: subject.id, nodeId: nodeData.nodeId },
        data: { title: nodeData.title, description: nodeData.description, difficulty: nodeData.difficulty, updatedAt: new Date() },
      })));
      await tx.subject.update({ where: { id: subject.id }, data: { lastCompiledAt: new Date() } });
    });

    // 7. Invalidate edge cache tags
    if (subject.user?.username) {
      try {
        revalidateTag(`user-${subject.user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${subject.user.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json({
      success: true,
      updatedCount: compilationResult.nodes.length,
      nodes: compilationResult.nodes,
      lastCompiledAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof PlannerError) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("POST /api/subjects/[id]/compile error:", error);
    // S4: refund the reservation on any failure after it was made.
    try {
      if (typeof userId !== "undefined") await releaseQuota(userId, "compile");
    } catch {}
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
