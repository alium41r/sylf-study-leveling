import { prisma } from "@/lib/prisma";
import { TimezoneService } from "@/lib/timezone-service";
import { StudyScheduleService } from "@/lib/study-schedule-service";
import { getActiveSkillModifiers } from "@/lib/skill-tree";
import { getCognitiveEffects } from "@/lib/cognitive-stats";

export interface PenaltyReconciliationResult {
  penaltiesApplied: number;
  totalHpDeducted: number;
  newHp: number;
  evaluatedDays: string[];
  mitigatedByItem?: string | null;
  /** Days skipped due to floating (ad-hoc) rest day designations. */
  restExemptDays?: string[];
}

export class HpPenaltyService {
  /**
   * Checks and consumes a streak protection item (e.g. Streak Shield or Streak Freeze).
   * Atomically decrements quantity or deletes the record if quantity reaches 0.
   */
  static async interceptStreakPenalty(
    userId: number,
    txParam?: any
  ): Promise<{ shielded: boolean; itemUsed?: string }> {
    const runner = async (tx: any) => {
      // 1. Check UserInventory for mythic-streak-shield
      const streakShield = await tx.userInventory.findFirst({
        where: {
          userId,
          item: { sku: "mythic-streak-shield" },
          quantity: { gt: 0 },
        },
        include: { item: true },
      });

      if (streakShield) {
        if (streakShield.quantity <= 1) {
          await tx.userInventory.delete({ where: { id: streakShield.id } });
        } else {
          await tx.userInventory.update({
            where: { id: streakShield.id },
            data: { quantity: { decrement: 1 } },
          });
        }

        await tx.systemMessage.create({
          data: {
            userId,
            type: "INFO",
            content: `**Streak Shield Activated**\n\nYour **Streak Shield** was automatically consumed to protect your daily study streak!`,
          },
        });

        return { shielded: true, itemUsed: "mythic-streak-shield" };
      }

      // 2. Check legacy InventoryItem for STREAK_FREEZE
      const legacyFreeze = await tx.inventoryItem.findFirst({
        where: {
          userId,
          itemKey: "STREAK_FREEZE",
          quantity: { gt: 0 },
        },
      });

      if (legacyFreeze) {
        if (legacyFreeze.quantity <= 1) {
          await tx.inventoryItem.delete({ where: { id: legacyFreeze.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: legacyFreeze.id },
            data: { quantity: { decrement: 1 } },
          });
        }

        return { shielded: true, itemUsed: "STREAK_FREEZE" };
      }

      return { shielded: false };
    };

    if (txParam) {
      return runner(txParam);
    }
    return prisma.$transaction(runner);
  }

  /**
   * Reconciles daily study targets against study logs for past unevaluated days.
   * Runs lazily on user heartbeat, login, or calendar views.
   * Intercepts HP penalties with inventory consumables (Phoenix Tear, Recovery Flask, etc.).
   */
  static async reconcileDailyHpPenalty(
    userId: number,
    timezoneOverride?: string
  ): Promise<PenaltyReconciliationResult> {
    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          hp: true,
          maxHp: true,
          timezone: true,
          dailyGoalMinutes: true,
          restDays: true,
          enableHpPenalty: true,
          lastDailyPenaltyEvaluatedDate: true,
          createdAt: true,
          stats: {
            select: { endurance: true },
          },
        },
      });
    } catch (userErr) {
      console.warn("HpPenaltyService user query error:", userErr);
      return { penaltiesApplied: 0, totalHpDeducted: 0, newHp: 100, evaluatedDays: [], restExemptDays: [] };
    }

    if (!user) {
      return { penaltiesApplied: 0, totalHpDeducted: 0, newHp: 100, evaluatedDays: [], restExemptDays: [] };
    }

    const timezone = timezoneOverride || user.timezone || "UTC";
    const todayStr = TimezoneService.getUserLocalDate(timezone);

    // Calculate yesterday's date string in user's timezone
    const todayDateObj = new Date(`${todayStr}T12:00:00Z`);
    const yesterdayDateObj = new Date(todayDateObj.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterdayDateObj.toISOString().split("T")[0];

    // If already evaluated through yesterday, nothing to do
    if (user.lastDailyPenaltyEvaluatedDate === yesterdayStr) {
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
        restExemptDays: [],
      };
    }

    // Determine start evaluation date
    let evalStartDateStr: string;
    if (user.lastDailyPenaltyEvaluatedDate) {
      const lastEvalObj = new Date(`${user.lastDailyPenaltyEvaluatedDate}T12:00:00Z`);
      const nextDayObj = new Date(lastEvalObj.getTime() + 24 * 60 * 60 * 1000);
      evalStartDateStr = nextDayObj.toISOString().split("T")[0];
    } else {
      // First time initialization: start from yesterday (or at most user createdAt)
      const userCreatedDateStr = TimezoneService.getUserLocalDate(timezone, user.createdAt);
      evalStartDateStr = userCreatedDateStr < yesterdayStr ? yesterdayStr : userCreatedDateStr;
    }

    // Guard against running ahead of yesterday or evaluating future dates
    if (evalStartDateStr > yesterdayStr) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastDailyPenaltyEvaluatedDate: yesterdayStr },
      });
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
        restExemptDays: [],
      };
    }

    // Cap evaluation range to maximum 7 days back to prevent catastrophic drain
    const maxBacktrackObj = new Date(todayDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const maxBacktrackStr = maxBacktrackObj.toISOString().split("T")[0];
    if (evalStartDateStr < maxBacktrackStr) {
      evalStartDateStr = maxBacktrackStr;
    }

    // Generate list of days to evaluate
    const daysToEvaluate: string[] = [];
    let curr = new Date(`${evalStartDateStr}T12:00:00Z`);
    const end = new Date(`${yesterdayStr}T12:00:00Z`);

    while (curr <= end) {
      daysToEvaluate.push(curr.toISOString().split("T")[0]);
      curr = new Date(curr.getTime() + 24 * 60 * 60 * 1000);
    }

    if (daysToEvaluate.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastDailyPenaltyEvaluatedDate: yesterdayStr },
      });
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: user.hp,
        evaluatedDays: [],
        restExemptDays: [],
      };
    }

    // Fetch all sessions in the evaluation window
    const firstDayUtc = new Date(`${daysToEvaluate[0]}T00:00:00Z`);
    firstDayUtc.setUTCDate(firstDayUtc.getUTCDate() - 2);
    const lastDayUtc = new Date(`${daysToEvaluate[daysToEvaluate.length - 1]}T23:59:59Z`);
    lastDayUtc.setUTCDate(lastDayUtc.getUTCDate() + 2);

    const sessions = await prisma.studySession.findMany({
      where: {
        userId,
        startedAt: {
          gte: firstDayUtc,
          lte: lastDayUtc,
        },
      },
      select: {
        durationMinutes: true,
        durationSeconds: true,
        startedAt: true,
      },
    });

    // Map sessions to local days
    const dailyMinutesMap: Record<string, number> = {};
    for (const d of daysToEvaluate) {
      dailyMinutesMap[d] = 0;
    }

    for (const s of sessions) {
      const localDate = TimezoneService.getUserLocalDate(timezone, s.startedAt);
      if (dailyMinutesMap[localDate] !== undefined) {
        const mins = s.durationMinutes > 0 ? s.durationMinutes : Math.floor(s.durationSeconds / 60);
        dailyMinutesMap[localDate] += mins;
      }
    }

    // Evaluate each day
    let currentHp = user.hp;
    let totalDeducted = 0;
    let penaltiesCount = 0;
    const penaltyEvents: Array<{ day: string; minutes: number; target: number; damage: number }> = [];

    const dailyGoal = Math.max(10, user.dailyGoalMinutes);
    const restDays = user.restDays || [0];

    // Endurance (Aegis): each ability tier shaves 5% off the missed-day
    // damage (15 HP base), down to −30% at tier 6.
    const enduranceEffects = getCognitiveEffects({ endurance: user.stats?.endurance ?? undefined });
    const aegisDamage = Math.round(15 * enduranceEffects.hpPenaltyMultiplier);
    const aegisActive = aegisDamage < 15;

    // Floating (ad-hoc) rest days inside the evaluation window are exempt
    // exactly like fixed rest days — 0 HP, 0 streak impact.
    let floatingRestSet = new Set<string>();
    try {
      const floating = await prisma.floatingRestDay.findMany({
        where: { userId, dateKey: { in: daysToEvaluate } },
        select: { dateKey: true },
      });
      floatingRestSet = new Set(floating.map((f) => f.dateKey));
    } catch {
      // best-effort: unavailable schema never blocks reconciliation
    }

    const restExemptDays: string[] = [];

    for (const dayStr of daysToEvaluate) {
      const isFixedRest = StudyScheduleService.isRestDay(dayStr, restDays);
      const isFloatingRest = floatingRestSet.has(dayStr);
      if (isFixedRest || isFloatingRest) {
        // Rest days (fixed or floating) are 100% exempt from penalties
        if (isFloatingRest) restExemptDays.push(dayStr);
        continue;
      }

      const loggedMinutes = dailyMinutesMap[dayStr] || 0;
      if (loggedMinutes < dailyGoal) {
        const damage = aegisDamage;
        penaltyEvents.push({
          day: dayStr,
          minutes: loggedMinutes,
          target: dailyGoal,
          damage,
        });
      }
    }

    if (penaltyEvents.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastDailyPenaltyEvaluatedDate: yesterdayStr },
      });
      return {
        penaltiesApplied: 0,
        totalHpDeducted: 0,
        newHp: currentHp,
        evaluatedDays: daysToEvaluate,
        restExemptDays,
      };
    }

    let itemMitigatedName: string | null = null;

    // Execute atomic update, consumable interception, & ledger entries
    await prisma.$transaction(async (tx) => {
      // 1. Check for consumable HP protection items (Phoenix Tear, Greater Recovery Flask, etc.)
      const recoveryItem = tx.userInventory?.findFirst
        ? await tx.userInventory.findFirst({
            where: {
              userId,
              item: {
                sku: {
                  in: [
                    "legendary-phoenix-tear",
                    "epic-recovery-flask",
                    "rare-vitality-brew",
                    "common-hp-draught",
                  ],
                },
              },
              quantity: { gt: 0 },
            },
            include: { item: true },
            orderBy: { item: { costSylph: "desc" } }, // Use highest tier recovery item first
          })
        : null;

      if (recoveryItem) {
        const sku = recoveryItem.item.sku;
        itemMitigatedName = recoveryItem.item.name;

        // Decrement consumable or delete if quantity reaches 0
        if (recoveryItem.quantity <= 1) {
          if (tx.userInventory?.delete) {
            await tx.userInventory.delete({ where: { id: recoveryItem.id } });
          }
        } else {
          if (tx.userInventory?.update) {
            await tx.userInventory.update({
              where: { id: recoveryItem.id },
              data: { quantity: { decrement: 1 } },
            });
          }
        }

        // Phoenix Tear restores HP to 100% and completely negates all damage
        if (sku === "legendary-phoenix-tear") {
          currentHp = user.maxHp;
        } else if (sku === "epic-recovery-flask") {
          currentHp = Math.min(user.maxHp, currentHp + 50);
        } else if (sku === "rare-vitality-brew") {
          currentHp = Math.min(user.maxHp, currentHp + 25);
        } else if (sku === "common-hp-draught") {
          currentHp = Math.min(user.maxHp, currentHp + 10);
        }

        if (tx.hpLedger?.create) {
          await tx.hpLedger.create({
            data: {
              userId,
              amount: 0,
              source: `INTERCEPT_${sku.toUpperCase()}`,
            },
          });
        }

        if (tx.systemMessage?.create) {
          await tx.systemMessage.create({
            data: {
              userId,
              type: "INFO",
              content: `**HP Penalty Intercepted**\n\nYour **${recoveryItem.item.name}** was automatically consumed to mitigate penalty damage! Current HP: **${currentHp}/${user.maxHp}**.`,
            },
          });
        }
      } else {
        // Check for active skill modifiers (supports optional mock in legacy tests)
        const userSkills = (tx as any).userSkill?.findMany
          ? await (tx as any).userSkill.findMany({
              where: { userId },
              include: { skillNode: true },
            })
          : [];
        const unlockedKeys = userSkills.map((s: any) => s.skillNode?.nodeKey || s.nodeKey).filter(Boolean);
        const skillMods = getActiveSkillModifiers(unlockedKeys);

        let firstMissAbsorbed = false;

        // Apply penalties with active skill modifiers
        for (const event of penaltyEvents) {
          let eventDamage = event.damage;

          if (skillMods.weeklyFirstMissZeroDamage && !firstMissAbsorbed) {
            eventDamage = 0;
            firstMissAbsorbed = true;
            itemMitigatedName = "Monarch's Absolute Resilience";
          } else if (skillMods.damageReductionPercent > 0) {
            eventDamage = Math.round(eventDamage * (1 - skillMods.damageReductionPercent / 100));
            if (!itemMitigatedName) itemMitigatedName = "Cognitive Mental Shield";
          } else if (aegisActive && eventDamage < 15) {
            if (!itemMitigatedName) itemMitigatedName = "Aegis (Endurance)";
          }

          const actualDeduction = Math.min(currentHp, eventDamage);
          currentHp = Math.max(0, currentHp - eventDamage);
          totalDeducted += actualDeduction;
          penaltiesCount += 1;

          if (tx.hpLedger?.create) {
            await tx.hpLedger.create({
              data: {
                userId,
                amount: -eventDamage,
                source: eventDamage === 0 ? "SHIELD_WEEKLY_FIRST_MISS" : "MISSED_DAILY_GOAL",
              },
            });
          }

          if (tx.systemMessage?.create) {
            await tx.systemMessage.create({
              data: {
                userId,
                type: eventDamage === 0 ? "INFO" : "WARNING",
                content: eventDamage === 0
                  ? `**Missed Goal Shielded**\n\nYour **Monarch's Absolute Resilience** skill negated the HP penalty for **${event.day}**!`
                  : `**Daily Focus Goal Missed**\n\nYou logged **${event.minutes}m** of study time on **${event.day}** (Daily Target: **${event.target}m**).\n\nPenalty Applied: **-${eventDamage} HP** (Current HP: ${currentHp}/${user.maxHp}).\n\n*Designate off-days as Rest Days in your Study Calendar to protect your HP and streaks.*`,
              },
            });
          }
        }
      }

      // Update user HP & evaluation pointer
      await tx.user.update({
        where: { id: userId },
        data: {
          hp: currentHp,
          lastDailyPenaltyEvaluatedDate: yesterdayStr,
        },
      });
    });

    return {
      penaltiesApplied: penaltiesCount,
      totalHpDeducted: totalDeducted,
      newHp: currentHp,
      evaluatedDays: daysToEvaluate,
      mitigatedByItem: itemMitigatedName,
      restExemptDays,
    };
  }
}
