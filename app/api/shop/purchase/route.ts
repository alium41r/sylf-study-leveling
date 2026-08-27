import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { revalidateTag } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body.itemId);

    if (!itemId || isNaN(itemId)) {
      return NextResponse.json({ error: "Valid itemId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Atomic Transactional Wrapper: execute set_config and purchase_shop_item on same connection
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('request.jwt.claim.userId', $1, true)`,
        String(userId)
      );

      return tx.$queryRawUnsafe<
        Array<{
          success: boolean;
          remaining_currency: number;
          inventory_id: number;
          new_quantity: number;
        }>
      >(`SELECT * FROM public.purchase_shop_item($1::integer)`, itemId);
    });

    if (!result || result.length === 0 || !result[0].success) {
      return NextResponse.json({ error: "Purchase transaction failed" }, { status: 400 });
    }

    const res = result[0];

    // Trigger edge cache invalidation
    try {
      (revalidateTag as any)(`user-${user.username.toLowerCase()}`);
      (revalidateTag as any)(`profile-stats-${user.username.toLowerCase()}`);
    } catch {
      // Invariant: ignore cache tag error in non-static contexts
    }

    return NextResponse.json(
      {
        success: true,
        remainingCurrency: res.remaining_currency,
        inventoryId: res.inventory_id,
        newQuantity: res.new_quantity,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("POST /api/shop/purchase error:", error);
    const message = error?.message || "Purchase failed";
    
    if (message.includes("Insufficient Sylph")) {
      return NextResponse.json({ error: "Insufficient Sylph" }, { status: 400 });
    }
    if (message.includes("Insufficient rank")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("Item already owned")) {
      return NextResponse.json({ error: "Item already owned" }, { status: 400 });
    }
    if (message.includes("Item not found")) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
