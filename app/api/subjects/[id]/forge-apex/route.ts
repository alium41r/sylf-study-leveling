import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { revalidateTag } from "next/cache";

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

    // 2. Query all 48 nodes for this subject
    const nodes = await prisma.subjectNode.findMany({
      where: { subjectId: subject.id },
      select: {
        id: true,
        nodeId: true,
        isMastered: true,
        spAward: true,
        progress: true,
      },
    });

    // 3. Calculate cumulative Subject SP (excluding N10_1 itself)
    const totalMintedSP = nodes
      .filter((n) => n.nodeId !== "N10_1" && (n.isMastered || n.progress >= 100))
      .reduce((sum, n) => sum + n.spAward, 0);

    if (totalMintedSP < 115) {
      return NextResponse.json(
        {
          error: `Cannot forge Apex Keystone: 115 Subject SP required (current: ${totalMintedSP} / 115 SP)`,
          totalMintedSP,
          requiredSP: 115,
        },
        { status: 400 }
      );
    }

    // 4. Atomic, idempotent forge via SECURITY DEFINER RPC.
    //    Row-locked inside Postgres: repeat calls raise ALREADY_FORGED
    //    instead of re-granting +5,000 XP / +500 Sylph / +1 SP.
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        success: boolean;
        already_forged: boolean;
        xp_awarded: number;
        sylph_awarded: number;
        sp_awarded: number;
        new_level: number;
        new_xp_within_level: number;
        new_rank: string;
        new_total_xp: number;
        minted_sp: number;
      }>
    >(
      `SELECT * FROM public.forge_apex_node_atomic($1::text, $2::text, $3::text)`,
      String(userId),
      String(subject.id),
      "N10_1"
    );

    const forgeResult = rows[0];
    if (!forgeResult || !forgeResult.success) {
      throw new Error("forge_apex_node_atomic returned no result");
    }

    // 5. Milestone announcement (created only after the atomic claim succeeded)
    await prisma.systemMessage.create({
      data: {
        userId,
        type: "REWARD",
        content: `**👑 APEX KEYSTONE FORGED: ${subject.name} (${subject.code})**\n\nYou have achieved 100% mastery across all 48 syllabus constellation nodes and minted 115 Subject SP.\n\nRewards Awarded: +5,000 XP • +500 Sylph • +${forgeResult.sp_awarded} SP.`,
      },
    });

    // 6. Invalidate edge cache tags
    if (subject.user?.username) {
      try {
        revalidateTag(`user-${subject.user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${subject.user.username.toLowerCase()}`, "max");
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Apex Keystone successfully forged for ${subject.name}!`,
      totalMintedSP,
      mintedSp: forgeResult.minted_sp,
      xpAwarded: forgeResult.xp_awarded,
      sylphAwarded: forgeResult.sylph_awarded,
      spAwarded: forgeResult.sp_awarded,
      newLevel: forgeResult.new_level,
      newCurrentXP: forgeResult.new_xp_within_level,
      newRank: forgeResult.new_rank,
      newTotalXP: forgeResult.new_total_xp,
    });
  } catch (error: any) {
    console.error("POST /api/subjects/[id]/forge-apex error:", error);

    // Map atomic-RPC error codes to precise client responses.
    if (error?.code === "A0001" || /ALREADY_FORGED/.test(error?.message || "")) {
      return NextResponse.json(
        { error: "Apex Keystone already forged for this subject", alreadyForged: true },
        { status: 409 }
      );
    }
    if (error?.code === "A0002" || /INSUFFICIENT_SP/.test(error?.message || "")) {
      return NextResponse.json(
        { error: "Cannot forge Apex Keystone: 115 Subject SP required", requiredSP: 115 },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
