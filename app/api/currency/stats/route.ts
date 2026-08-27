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
