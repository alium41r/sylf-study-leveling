import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const SHOP_ITEMS = {
  MONARCHS_DECREE: { name: "Monarch's Decree", cost: 150 },
  SHADOW_EXTRACTION: { name: "Shadow Extraction", cost: 350 },
  GATE_KEY: { name: "Gate Key (Red)", cost: 450 },
  KAMISH_WARD: { name: "Kamish's Ward", cost: 600 },
  ELIXIR_OF_INSIGHT: { name: "Elixir of Insight", cost: 900 },
} as const;

export type ShopItemKey = keyof typeof SHOP_ITEMS;

const purchaseSchema = z.object({
  itemKey: z.enum(["MONARCHS_DECREE", "SHADOW_EXTRACTION", "GATE_KEY", "KAMISH_WARD", "ELIXIR_OF_INSIGHT"]),
  quantity: z.number().int().min(1).default(1),
});

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

    const body = await req.json();
    const validation = purchaseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { itemKey, quantity } = validation.data;
    const itemDefinition = SHOP_ITEMS[itemKey as ShopItemKey];
    const totalCost = itemDefinition.cost * quantity;
    const userId = payload.userId as number;

    // Use a transaction for atomic purchase
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch user to check balance (lock conceptually by decrementing safely)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, sylph: true },
      });

      if (!user || user.sylph < totalCost) {
        throw new Error("Insufficient Sylph");
      }

      // 2. Decrement sylph safely using atomic decrement
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          sylph: { decrement: totalCost },
        },
      });

      // 3. Prevent negative balance (double check after atomic decrement)
      if (updatedUser.sylph < 0) {
        throw new Error("Insufficient Sylph"); // Triggers transaction rollback
      }

      // 4. Add item to inventory
      const existingItem = await tx.inventoryItem.findFirst({
        where: { userId, itemKey },
      });

      if (existingItem) {
        await tx.inventoryItem.update({
          where: { id: existingItem.id },
          data: { quantity: { increment: quantity } },
        });
      } else {
        await tx.inventoryItem.create({
          data: {
            userId,
            itemKey,
            quantity,
          },
        });
      }

      // 5. Add ledger entry
      await tx.sylphLedger.create({
        data: {
          userId,
          amount: -totalCost, // Negative for expense
          source: "SHOP",
        },
      });
      
      // 6. System Message
      await tx.systemMessage.create({
        data: {
          userId,
          content: `**Purchase Complete**\n\nYou acquired ${quantity}x ${itemDefinition.name} for ${totalCost} Sylph.`,
          type: "INFO"
        }
      });

      return updatedUser;
    });

    return NextResponse.json(
      { message: "Purchase successful", newBalance: result.sylph },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "Insufficient Sylph") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
