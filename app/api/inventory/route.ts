import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    const [userInventory, stats] = await Promise.all([
      prisma.userInventory.findMany({
        where: { userId },
        include: {
          item: true,
        },
        orderBy: [{ isEquipped: "desc" }, { acquiredAt: "desc" }],
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
    ]);

    const formattedInventory = userInventory.map((inv) => ({
      id: inv.id,
      userId: inv.userId,
      itemId: inv.itemId,
      quantity: inv.quantity,
      isEquipped: inv.isEquipped,
      acquiredAt: inv.acquiredAt.toISOString(),
      item: {
        id: inv.item.id,
        sku: inv.item.sku,
        name: inv.item.name,
        description: inv.item.description,
        category: inv.item.category,
        slot: inv.item.slot,
        rarity: inv.item.rarity,
        costSylph: inv.item.costSylph,
        rankRequirement: inv.item.rankRequirement,
        effectPayload: inv.item.effectPayload,
        spriteLayer: inv.item.spriteLayer,
        setKey: inv.item.setKey,
      },
    }));

    return NextResponse.json(
      {
        inventory: formattedInventory,
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
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
