import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DailyBriefingService } from "@/lib/ai/daily-briefing-service";
import crypto from "crypto";

// Ensure the endpoint is dynamically executed and not statically generated
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Cron Authentication
    const authHeader = req.headers.get("authorization");
    // S4: fail closed — no fallback cron secret.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 }
      );
    }
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providedSecret = authHeader.split(" ")[1];
    if (providedSecret.length !== cronSecret.length || !crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(cronSecret))) {
      return NextResponse.json({ error: "Invalid cron secret" }, { status: 401 });
    }

    const tzGroups = await prisma.user.groupBy({
      by: ["timezone"],
      where: { hasCompletedOnboarding: true },
    });

    const activeTimezones = tzGroups.map((g) => g.timezone).filter((tz) => {
      let safeTz = tz;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: safeTz });
      } catch (e) {
        safeTz = "UTC"; // Safely fallback if user timezone is invalid
      }

      try {
        const formatter = new Intl.DateTimeFormat("en-US", { timeZone: safeTz, hour: "numeric", hour12: false });
        const hour = parseInt(formatter.format(new Date()));
        return hour === 6;
      } catch (e) {
        return false;
      }
    });

    if (activeTimezones.length === 0) {
      return NextResponse.json({ message: "No active timezones in the 06:00 window." });
    }

    // 3. Fetch a bounded batch of eligible users
    // We only process users seen in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const BATCH_SIZE = parseInt(process.env.BRIEFING_BATCH_SIZE || "50");
    const CONCURRENCY_LIMIT = parseInt(process.env.BRIEFING_CONCURRENCY || "5");
    
    const eligibleUsers = await prisma.user.findMany({
      where: {
        timezone: { in: activeTimezones },
        hasCompletedOnboarding: true,
        lastSeenAt: { gte: sevenDaysAgo },
      },
      select: { id: true, timezone: true },
      take: BATCH_SIZE, // Configurable bounded batch
    });

    if (eligibleUsers.length === 0) {
      return NextResponse.json({ message: "No eligible users require a briefing right now." });
    }

    let processedCount = 0;
    const promises = [];

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    for (const user of eligibleUsers) {
      let safeTz = user.timezone;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: safeTz });
      } catch (e) {
        safeTz = "UTC";
      }

      // Compute local dateKey
      let dateKey: string;
      try {
        const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz, year: "numeric", month: "2-digit", day: "2-digit" });
        dateKey = formatter.format(new Date());
      } catch (e) {
        console.error(`Unexpected date formatting error for timezone ${safeTz} on user ${user.id}`);
        continue;
      }

      // Try to claim the slot atomically
      let claimed = false;

      // First, try to update a FAILED or stale PENDING claim
      const updateResult = await prisma.dailyBriefingLog.updateMany({
        where: {
          userId: user.id,
          dateKey,
          OR: [
            { status: "FAILED" },
            { status: "PENDING", updatedAt: { lt: tenMinutesAgo } }
          ],
        },
        data: {
          status: "PENDING",
        },
      });

      if (updateResult.count > 0) {
        claimed = true;
      } else {
        // Try to create a new PENDING claim
        try {
          await prisma.dailyBriefingLog.create({
            data: {
              userId: user.id,
              dateKey,
              status: "PENDING",
            },
          });
          claimed = true;
        } catch (e) {
          // Unique constraint violation means it's already PENDING or COMPLETED
          claimed = false;
        }
      }

      if (!claimed) continue; // Skip if we didn't claim the slot

      // Process the generation in the background pool
      const task = async () => {
        const result = await DailyBriefingService.generateDailyBriefing(user.id, dateKey, safeTz);

        // Update the claim status
        await prisma.dailyBriefingLog.update({
          where: {
            userId_dateKey: { userId: user.id, dateKey },
          },
          data: {
            status: result.success ? "COMPLETED" : "FAILED",
          },
        });
      };

      promises.push(task());

      // Respect concurrency limit
      if (promises.length >= CONCURRENCY_LIMIT) {
        await Promise.all(promises);
        processedCount += promises.length;
        promises.length = 0;
      }
    }

    // Wait for remaining promises
    if (promises.length > 0) {
      await Promise.all(promises);
      processedCount += promises.length;
    }

    return NextResponse.json({ message: `Processed ${processedCount} briefings.` });
  } catch (error: any) {
    console.error("[DailyBriefing Cron] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
