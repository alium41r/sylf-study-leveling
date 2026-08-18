import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DIFFICULTY_CONFIG } from "@/lib/difficulty-engine";
import { TimezoneService } from "@/lib/timezone-service";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    for (const quest of overdueQuests) {
      const user = quest.user;
      
      let penalty: number = DIFFICULTY_CONFIG[quest.difficulty as keyof typeof DIFFICULTY_CONFIG]?.hpPenalty || 10;
      if (quest.isGateKeyApplied) penalty *= 3;
      if (quest.isKamishWardActive) penalty = 0;

      const newHp = Math.max(0, user.hp - penalty);

      await prisma.$transaction(async (tx) => {
        await tx.quest.update({
          where: { id: quest.id },
          data: { status: "FAILED" }
        });

        await tx.user.update({
          where: { id: user.id },
          data: { hp: newHp }
        });

        if (penalty > 0) {
          await tx.hpLedger.create({
            data: { userId: user.id, amount: -penalty, source: "QUEST_FAILED_LATE" },
          });
        }

        const shieldText = quest.isKamishWardActive 
          ? `\n\nKamish's Ward intercepted all damage.` 
          : `\n\nPenalty: -${penalty} HP`;

        await tx.systemMessage.create({
          data: {
            userId: user.id,
            content: `**Quest Failed (Overdue)**\n\n"${quest.title}" was not completed by its deadline of ${quest.scheduledFor}.${shieldText}`,
            type: "WARNING",
          },
        });
      });
    }

    return NextResponse.json({ processed: overdueQuests.length }, { status: 200 });
  } catch (error) {
    console.error("Cron check-deadlines error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
