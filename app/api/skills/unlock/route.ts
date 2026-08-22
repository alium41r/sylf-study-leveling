import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import {
  SKELETON_NODES,
  getPrerequisites,
  makeNodeKey,
  ALL_SKILL_BRANCHES,
} from "@/lib/skill-tree-skeleton";
import type { SkillBranch } from "@/lib/skill-tree";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const body = await req.json().catch(() => ({}));

    // Support both { classType, nodeId } and legacy { skillNodeId }
    const classType: SkillBranch = (body.classType ? String(body.classType).toUpperCase() : "SCHOLAR") as SkillBranch;
    const nodeId: string = body.nodeId ? String(body.nodeId).toUpperCase() : "";

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!nodeId) {
      return NextResponse.json({ error: "Valid nodeId is required" }, { status: 400 });
    }

    if (!ALL_SKILL_BRANCHES.includes(classType)) {
      return NextResponse.json({ error: "Invalid classType" }, { status: 400 });
    }

    // Resolve skeleton node
    const skeletonNode = SKELETON_NODES.find((n) => n.id === nodeId);
    if (!skeletonNode) {
      return NextResponse.json({ error: `Node ${nodeId} not found in skeleton catalog` }, { status: 404 });
    }

    // Fully-qualified node key persists per class: e.g. "SCHOLAR_N2_1".
    const fullNodeKey = makeNodeKey(classType, nodeId);

    // The skeleton DAG uses ANY-parent availability semantics. We enforce
    // that here, then pass ONLY the parents that are actually unlocked as
    // the RPC's required-prereqs so its stricter ALL-of-them check is
    // satisfied by construction (keeps the RPC generic and reusable).
    const parentIds = getPrerequisites(nodeId);
    const parentKeys = parentIds.map((pid) => makeNodeKey(classType, pid));

    const unlockedParentRows = await prisma.userSkillNode.findMany({
      where: { userId, nodeKey: { in: parentKeys } },
      select: { nodeKey: true },
    });
    const anyParentUnlocked = parentKeys.length === 0 || unlockedParentRows.length > 0;
    if (!anyParentUnlocked) {
      return NextResponse.json(
        { error: `Prerequisite nodes required: ${parentIds.join(" or ")}` },
        { status: 400 }
      );
    }
    const satisfiedPrereqKeys = unlockedParentRows.map((r) => r.nodeKey);

    // Atomic, durable unlock via SECURITY DEFINER RPC (row-locked,
    // idempotent, prerequisite + SP validated inside Postgres).
    const rows = await prisma.$queryRawUnsafe<
      Array<{ success: boolean; remaining_sp: number; unlocked_node_key: string }>
    >(
      `SELECT * FROM public.unlock_skill_node_atomic($1::text, $2::text, $3::int, $4::text[])`,
      String(userId),
      fullNodeKey,
      skeletonNode.costSP,
      satisfiedPrereqKeys
    );

    const rpcResult = rows[0];
    if (!rpcResult || !rpcResult.success) {
      throw new Error("unlock_skill_node_atomic returned no result");
    }

    const remainingSp = rpcResult.remaining_sp;
    const isMastered = nodeId === "N10_1";

    const result = {
      success: true,
      nodeKey: fullNodeKey,
      nodeId: skeletonNode.id,
      classType,
      remainingSp,
      isMastered,
    };

    // Invalidate edge cache
    if (user.username) {
      try {
        revalidateTag(`user-${user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${user.username.toLowerCase()}`, "max");
      } catch {
        // Invariant: ignore cache tag error in non-static contexts
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("POST /api/skills/unlock error:", error);

    // Map atomic-RPC error codes to precise client responses.
    if (error?.code === "A0003" || /ALREADY_UNLOCKED/.test(error?.message || "")) {
      return NextResponse.json(
        { error: "Skill node already unlocked", alreadyUnlocked: true },
        { status: 409 }
      );
    }
    if (error?.code === "A0004" || /PREREQUISITES_UNMET/.test(error?.message || "")) {
      return NextResponse.json(
        { error: "Prerequisite skill nodes not unlocked" },
        { status: 400 }
      );
    }
    if (error?.code === "A0005" || /INSUFFICIENT_SKILL_POINTS/.test(error?.message || "")) {
      return NextResponse.json(
        { error: "Insufficient Skill Points" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error?.message || "Failed to unlock skill node" },
      { status: 500 }
    );
  }
}
