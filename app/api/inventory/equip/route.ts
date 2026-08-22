import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidateTag } from "next/cache";

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

    const userId = Number(payload.userId);
    const body = await req.json().catch(() => ({}));
    const inventoryId = Number(body.inventoryId);

    if (!inventoryId || isNaN(inventoryId)) {
      return NextResponse.json({ error: "Valid inventoryId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.userInventory.findFirst({
        where: { id: inventoryId, userId },
        include: { item: true },
      });

      if (!target) {
        throw new Error("Item not found in inventory");
      }

      const nextEquipState = !target.isEquipped;

      // If equipping, unequip existing item in the same slot/category
      if (nextEquipState) {
        if (target.item.category === "CONSUMABLE") {
          await tx.userInventory.updateMany({
            where: {
              userId,
              isEquipped: true,
              item: { category: "CONSUMABLE" },
            },
            data: { isEquipped: false },
          });
        } else {
          await tx.userInventory.updateMany({
            where: {
              userId,
              isEquipped: true,
              OR: [
                ...(target.item.slot !== "NONE" ? [{ item: { slot: target.item.slot } }] : []),
                { item: { category: target.item.category } },
              ],
            },
            data: { isEquipped: false },
          });
        }
      }

      return await tx.userInventory.update({
        where: { id: target.id },
        data: { isEquipped: nextEquipState },
        include: { item: true },
      });
    });

    // Invalidate edge caches for real-time profile/inventory reflection
    if (user.username) {
      try {
        revalidateTag(`user-${user.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${user.username.toLowerCase()}`, "max");
      } catch {
        // Invariant: ignore cache tag error in non-static contexts
      }
    }

    return NextResponse.json(
      {
        success: true,
        isEquipped: result.isEquipped,
        itemSlot: result.item.slot,
        item: result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("POST /api/inventory/equip error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to toggle equipment state" },
      { status: 500 }
    );
  }
}
