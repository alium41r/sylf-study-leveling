import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { CATALOG_ITEMS } from "@/lib/shop-items";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let userId: number | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const payload = await verifyToken(authHeader.split(" ")[1]);
      if (payload) {
        userId = payload.userId as number;
      }
    }

    // Strict projection: filter out quarantined legacy equipment and set bundles
    const dbItems = await prisma.item.findMany({
      where: {
        category: {
          notIn: ["EQUIPMENT", "SET_BUNDLE"],
        },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        category: true,
        slot: true,
        rarity: true,
        rankRequirement: true,
        costSylph: true,
        effectPayload: true,
        spriteLayer: true,
        setKey: true,
      },
      orderBy: { id: "asc" },
    });

    let userInventory: Array<{ itemId: number; quantity: number; isEquipped: boolean }> = [];
    let stats = null;

    if (userId) {
      const [inventory, userStats] = await Promise.all([
        prisma.userInventory.findMany({
          where: { userId },
          select: {
            itemId: true,
            quantity: true,
            isEquipped: true,
          },
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
      userInventory = inventory;
      stats = userStats;
    }

    return NextResponse.json(
      {
        catalog: CATALOG_ITEMS,
        inventory: userInventory,
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
  } catch (error: any) {
    console.error("GET /api/shop error:", error);
    return NextResponse.json({ error: "Failed to fetch shop catalog" }, { status: 500 });
  }
}
