import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { compileSyllabus } from "@/lib/ai/syllabus-compiler";
import { checkQuota, consumeQuota } from "@/lib/ai/usage-limiter";
import { revalidateTag } from "next/cache";

async function getUserId(req: NextRequest): Promise<number | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    if (payload && payload.userId) {
      return payload.userId as number;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> | { id: string } }
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

    // 2. 30-day recompilation cooldown (prevents unlimited recompiles
    //    burning deepseek-v4-pro tokens).
    const COMPILE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
    if (subject.lastCompiledAt) {
      const lastCompiled = new Date(subject.lastCompiledAt).getTime();
      const nextAvailableAt = new Date(lastCompiled + COMPILE_COOLDOWN_MS);
      if (Date.now() < nextAvailableAt.getTime()) {
        return NextResponse.json(
          {
            error: "COMPILE_COOLDOWN_ACTIVE",
            message: `This subject's syllabus was compiled recently and can be recompiled on ${nextAvailableAt.toISOString()}.`,
            lastCompiledAt: subject.lastCompiledAt,
            nextAvailableAt: nextAvailableAt.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    // 3. Daily rate limit for syllabus compilations (5/day per user).
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

    // 4. Call AI Syllabus Compiler to decompose the curriculum into 48 nodes
    const compilationResult = await compileSyllabus(
      {
        name: subject.name,
        code: subject.code,
        examBoard: subject.examBoard,
        level: subject.level,
      },
      req.signal
    );

    // 5. Batch-update all 48 nodes inside a transaction without touching progress/isMastered
    await prisma.$transaction(
      compilationResult.nodes.map((nodeData) =>
        prisma.subjectNode.updateMany({
          where: {
            subjectId: subject.id,
            nodeId: nodeData.nodeId,
          },
          data: {
            title: nodeData.title,
            description: nodeData.description,
            difficulty: nodeData.difficulty,
            updatedAt: new Date(),
          },
        })
      ),
      {
        timeout: 30000,
        maxWait: 10000,
      }
    );

    // 5. Stamp the cooldown timestamp — the commit is the claim anchor,
    //    so the 30-day window starts only after nodes are persisted.
    await prisma.subject.update({
      where: { id: subject.id },
      data: { lastCompiledAt: new Date() },
    });

    // 6. Charge quota atomically ONLY after successful compilation.
    await consumeQuota(userId, "compile");

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
    console.error("POST /api/subjects/[id]/compile error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
