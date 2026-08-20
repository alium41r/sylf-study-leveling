import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
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

    const ledgers = await prisma.sylphLedger.findMany({
      where: { userId },
      select: { amount: true },
    });

    let totalEarned = 0;
    let totalSpent = 0;

    for (const entry of ledgers) {
      if (entry.amount > 0) {
        totalEarned += entry.amount;
      } else if (entry.amount < 0) {
        // Amount is negative, so subtracting it from spent makes it positive,
        // or Math.abs works too
        totalSpent += Math.abs(entry.amount);
      }
    }

    const hpLedgers = await prisma.hpLedger.findMany({
      where: { userId },
      select: { amount: true },
    });

    let totalHpLost = 0;
    for (const entry of hpLedgers) {
      if (entry.amount < 0) {
        totalHpLost += Math.abs(entry.amount);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sylph: true, hp: true, maxHp: true }
    });

    return NextResponse.json({
      currentBalance: user?.sylph || 0,
      totalEarned,
      totalSpent,
      totalHpLost,
      currentHp: user?.hp || 0,
      maxHp: user?.maxHp || 100,
    }, { status: 200 });

  } catch (error) {
    console.error("GET /api/currency/stats error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
