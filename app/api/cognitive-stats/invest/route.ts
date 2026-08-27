import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  COGNITIVE_STAT_KEYS,
  type CognitiveStatKey,
  type InvestCurrency,
  INVEST_STEP,
  canInvest,
  getInvestCost,
  getStatCap,
  getCognitiveEffects,
  getAbilitySummary,
  normalizeCognitiveStats,
  COGNITIVE_STATS,
} from "@/lib/cognitive-stats";
import { calculateRequiredXp } from "@/lib/game-engine";

/**
 * GET /api/cognitive-stats/invest
 * Current cognitive stats, balances, per-stat invest costs and ability
 * summaries — everything the invest UI needs in one payload.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const [user, stats] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { sylph: true, level: true, currentXP: true },
      }),
      prisma.userStats.findUnique({
        where: { userId },
        select: {
          skillPoints: true,
          endurance: true,
          tenacity: true,
          velocity: true,
          discipline: true,
          synthesis: true,
        },
      }),
    ]);

    const snapshot = normalizeCognitiveStats(stats ?? undefined);
    const effects = getCognitiveEffects(snapshot);
    const cap = getStatCap(user?.level ?? 1);

    const abilities = COGNITIVE_STAT_KEYS.map((key) => {
      const summary = getAbilitySummary(key, snapshot[key]);
      return {
        ...summary,
        cap,
        investable: canInvest(snapshot[key], cap),
        costSp: getInvestCost(snapshot[key], "sp"),
        costSylph: getInvestCost(snapshot[key], "sylph"),
      };
    });

    return NextResponse.json(
      {
        stats: snapshot,
        skillPoints: stats?.skillPoints ?? 0,
        sylph: user?.sylph ?? 0,
        cap,
        effects,
        abilities,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/cognitive-stats/invest error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/cognitive-stats/invest
 * Body: { stat: "endurance"|"tenacity"|"velocity"|"discipline"|"synthesis",
 *         currency: "sp" | "sylph" }
 * Atomically spends SP (UserStats.skillPoints) or Sylph (User.sylph) to raise
 * one stat by +5 (cost scales with the stat band), audits the spend in
 * StatInvestLedger, and returns the fresh snapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const body = await req.json().catch(() => ({}));
    const stat = String(body?.stat ?? "") as CognitiveStatKey;
    const currency = String(body?.currency ?? "") as InvestCurrency;

    if (!COGNITIVE_STAT_KEYS.includes(stat)) {
      return NextResponse.json(
        { error: "Invalid stat", allowed: COGNITIVE_STAT_KEYS },
        { status: 400 }
      );
    }
    if (currency !== "sp" && currency !== "sylph") {
      return NextResponse.json(
        { error: "Invalid currency", allowed: ["sp", "sylph"] },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Ensure UserStats exists (init mirrors the canonical RPC convention).
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, level: true, currentXP: true, sylph: true },
      });
      if (!user) {
        throw new InvestError("User not found", 404);
      }

      const existing = await tx.userStats.findUnique({ where: { userId } });
      let stats = existing;
      if (!stats) {
        stats = await tx.userStats.create({
          data: {
            userId,
            level: user.level,
            xp: calculateRequiredXp(user.level) + (user.currentXP || 0),
          },
        });
      }

      const currentValue = (stats as any)[stat] ?? 10;
      const cap = getStatCap(user.level || 1);
      if (!canInvest(currentValue, cap)) {
        throw new InvestError(
          currentValue >= cap
            ? `${COGNITIVE_STATS[stat].label} has reached its level cap (${cap} — Level ${user.level}).`
            : `${COGNITIVE_STATS[stat].label} is already at its maximum.`,
          400
        );
      }

      const cost = getInvestCost(currentValue, currency);
      const newValue = Math.min(100, currentValue + INVEST_STEP);

      if (currency === "sp") {
        if ((stats.skillPoints ?? 0) < cost) {
          throw new InvestError(
            `Not enough SP — need ${cost}, have ${stats.skillPoints ?? 0}.`,
            400
          );
        }
        await tx.userStats.update({
          where: { userId },
          data: {
            skillPoints: { decrement: cost },
            [stat]: newValue,
          },
        });
      } else {
        if ((user.sylph ?? 0) < cost) {
          throw new InvestError(
            `Not enough Sylph — need ${cost}, have ${user.sylph ?? 0}.`,
            400
          );
        }
        await tx.user.update({
          where: { id: userId },
          data: { sylph: { decrement: cost } },
        });
        await tx.userStats.update({
          where: { userId },
          data: { [stat]: newValue },
        });
        await tx.sylphLedger.create({
          data: {
            userId,
            amount: -cost,
            delta: -cost,
            balanceAfter: user.sylph - cost,
            reason: "COGNITIVE_INVEST",
            source: "SYSTEM",
            metadata: { stat },
          },
        });
      }

      await tx.statInvestLedger.create({
        data: {
          userId,
          statKey: stat,
          amount: INVEST_STEP,
          currencyUsed: currency,
          cost,
          statValueAfter: newValue,
        },
      });

      const fresh = await tx.userStats.findUnique({
        where: { userId },
        select: {
          skillPoints: true,
          endurance: true,
          tenacity: true,
          velocity: true,
          discipline: true,
          synthesis: true,
        },
      });
      const freshUser = currency === "sp" ? user : { ...user, sylph: user.sylph - cost };

      return {
        stats: normalizeCognitiveStats(fresh ?? undefined),
        skillPoints: fresh?.skillPoints ?? 0,
        sylph: freshUser?.sylph ?? 0,
        investedStat: stat,
        amount: INVEST_STEP,
        cost,
        currency,
      };
    });

    const snapshot = normalizeCognitiveStats(result.stats);
    return NextResponse.json(
      {
        success: true,
        ...result,
        effects: getCognitiveEffects(snapshot),
        ability: getAbilitySummary(result.investedStat, snapshot[result.investedStat]),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof InvestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/cognitive-stats/invest error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

class InvestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
