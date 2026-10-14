import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { revalidateTag } from "next/cache";

type RouteParams = { params: Promise<{ id: string }> };

async function getUserId(req: NextRequest): Promise<number | null> {
  const session = await getSession(req);
  if (session && session.userId) {
    return session.userId as number;
  }
  return null;
}

/**
 * POST /api/subjects/[id]/restore
 * Restores a previously archived subject back to active status.
 */
export async function POST(req: NextRequest, props: RouteParams) {
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

    if (existing.archivedAt === null) {
      return NextResponse.json({
        success: true,
        message: `Subject "${existing.name}" is already active.`,
        subject: existing,
      });
    }

    const restored = await tx.subject.update({
      where: { id: subjectId },
      data: { archivedAt: null },
    });

    if (existing.user?.username) {
      try {
        revalidateTag(`user-${existing.user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${existing.user.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Subject "${existing.name}" restored successfully.`,
      subject: restored,
    });
    });
  } catch (error) {
    console.error("POST /api/subjects/[id]/restore error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
