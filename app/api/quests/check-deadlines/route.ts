import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { DIFFICULTY_CONFIG } from "@/lib/difficulty-engine";
import { TimezoneService } from "@/lib/timezone-service";

export async function GET(req: NextRequest) {
  try {
    // S4: fail closed + constant-time comparison.
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const provided = authHeader.split(" ")[1] || "";
    const a = Buffer.from(provided);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all quests that are still PENDING or IN_PROGRESS
    const pendingQuests = await prisma.quest.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      include: { user: true }
    });

    // Filter quests that are overdue in the user's specific local timezone
    const overdueQuests = pendingQuests.filter((quest) => {
      const userTimezone = quest.user.timezone || "UTC";
      const userLocalDate = TimezoneService.getUserLocalDate(userTimezone);
      return quest.scheduledFor < userLocalDate;
    });

    let processed = 0;
    for (const snapshot of overdueQuests) {
      const changed = await executionTransaction(snapshot.userId, async tx => {
        // Re-read execution and HP after the shared user lock; snapshots above
        // select candidates, never determine a penalty or overwrite fresh HP.
        await tx.$queryRaw`SELECT id FROM "StudySession" WHERE "userId"=${snapshot.userId} ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Quest" WHERE id=${snapshot.id} AND "userId"=${snapshot.userId} FOR UPDATE`;
        const quest = await tx.quest.findFirst({ where: { id: snapshot.id, userId: snapshot.userId }, include: { user: true } });
        if (!quest || !["PENDING", "IN_PROGRESS"].includes(quest.status) ||
          quest.scheduledFor >= TimezoneService.getUserLocalDate(quest.user.timezone || "UTC")) return false;
        if (quest.plannedMinutes !== null) {
          const running = await tx.studySession.findFirst({ where: { questId: quest.id, endedAt: null,
            OR: [{ executionState: "RUNNING" }, { executionState: null }] }, select: { id: true } });
          if (running || quest.remainingDisposition !== "OPEN") return false;
          await tx.$queryRaw`SELECT set_config('sylf.planner_v2_execution_quest',${String(quest.id)},true)`;
        }
        const user = quest.user;
        let penalty: number = DIFFICULTY_CONFIG[quest.difficulty].hpPenalty;
        if (quest.isGateKeyApplied) penalty *= 3;
        if (quest.isKamishWardActive) penalty = 0;
        const newHp = Math.max(0, user.hp - penalty);
        await tx.quest.update({ where: { id: quest.id }, data: { status: "FAILED",
          ...(quest.plannedMinutes !== null ? { executionVersion: { increment: 1 } } : {}) } });
        await tx.user.update({ where: { id: user.id }, data: { hp: newHp } });
        if (penalty > 0) await tx.hpLedger.create({ data: { userId: user.id, amount: -penalty, source: "QUEST_FAILED_LATE" } });
        const shieldText = quest.isKamishWardActive ? `\n\nKamish's Ward intercepted all damage.` : `\n\nPenalty: -${penalty} HP`;
        await tx.systemMessage.create({ data: { userId: user.id,
          content: `**Quest Failed (Overdue)**\n\n"${quest.title}" was not completed by its deadline of ${quest.scheduledFor}.${shieldText}`, type: "WARNING" } });
        return true;
      });
      processed += Number(changed);
    }

    return NextResponse.json({ processed }, { status: 200 });
  } catch (error) {
    console.error("Cron check-deadlines error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
