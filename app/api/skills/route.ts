import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  SKELETON_NODES,
  avatarToClassBranch,
  ALL_SKILL_BRANCHES,
  parseNodeKey,
} from "@/lib/skill-tree-skeleton";
import type { SkillBranch } from "@/lib/skill-tree";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    const [user, stats, unlockedNodes] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { activeAvatar: true, username: true },
      }),
      prisma.userStats.findUnique({
        where: { userId },
        select: {
          level: true,
          xp: true,
          rank: true,
          currency: true,
          skillPoints: true,
          endurance: true,
          tenacity: true,
          velocity: true,
          discipline: true,
          synthesis: true,
        },
      }),
      prisma.userSkillNode.findMany({
        where: { userId },
        select: { nodeKey: true, unlockedAt: true },
        orderBy: { unlockedAt: "asc" },
      }),
    ]);

    const activeClass: SkillBranch = avatarToClassBranch(user?.activeAvatar);

    // Durable unlock state (persisted by unlock_skill_node_atomic).
    const formattedUnlocked = unlockedNodes.map((row) => {
      const parsed = parseNodeKey(row.nodeKey);
      return {
        nodeKey: row.nodeKey,
        branch: parsed?.branch ?? null,
        nodeId: parsed?.nodeId ?? null,
        unlockedAt: row.unlockedAt,
      };
    });

    // A class counts as mastered when its N10_1 apex is unlocked.
    const masteredClasses: SkillBranch[] = ALL_SKILL_BRANCHES.filter((branch) =>
      unlockedNodes.some((row) => row.nodeKey === `${branch}_N10_1`)
    );

    return NextResponse.json(
      {
        catalog: SKELETON_NODES,
        unlockedSkills: formattedUnlocked,
        activeClass,
        masteredClasses,
        stats: stats || {
          level: 1,
          xp: 0,
          rank: "RANK E",
          currency: 0,
          skillPoints: 0,
          endurance: 10,
          tenacity: 10,
          velocity: 10,
          discipline: 10,
          synthesis: 10,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/skills error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
