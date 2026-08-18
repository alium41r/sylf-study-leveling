import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { AiStudyOrchestrator, StudySessionData } from "@/lib/ai/orchestrator";
import { checkQuota, recordUsage } from "@/lib/ai/usage-limiter";
import { AI_LIMITS } from "@/lib/ai/config";

import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Extended execution window on Vercel for multi-agent reasoning

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

    const userId = payload.userId as number;

    // ── Quota enforcement ─────────────────────────────────
    const quota = await checkQuota(userId, "planner");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "quota_exceeded", feature: "planner", remaining: 0, limit: quota.limit, resetsAt: quota.resetsAt },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { topic, syllabus, effortHours, targetDate } = body;

    if (!topic || !effortHours) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        };

        try {
          sendEvent("thought", { text: "[System] Fetching your past study sessions..." });
          const rawSessions = await prisma.studySession.findMany({
            where: { userId },
            orderBy: { startedAt: "desc" },
            take: 20,
            include: { subject: true }
          });

          const pastSessions: StudySessionData[] = rawSessions.map(s => ({
            durationMinutes: s.durationMinutes,
            focusRate: s.focusRate,
            startedAt: s.startedAt,
            subject: s.subject?.name
          }));

          const onProgress = (msg: string) => {
            sendEvent("thought", { text: msg });
          };

          // Generate Plan using Multi-Agent Orchestrator (with timeout)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_LIMITS.plannerTimeoutMs);
          });

          const planResult = await Promise.race([
            AiStudyOrchestrator.generatePlan(
              topic, 
              syllabus || "", 
              effortHours, 
              targetDate || null,
              pastSessions,
              onProgress
            ),
            timeoutPromise,
          ]);

          sendEvent("thought", { text: "[System] Plan finalized. Saving to database..." });

          let mappedEffortLevel = "NORMAL";
          if (effortHours >= 30) mappedEffortLevel = "EXTREME";
          else if (effortHours >= 15) mappedEffortLevel = "INTENSE";
          else if (effortHours <= 5) mappedEffortLevel = "RELAXED";

          // Save the Goal and Quests to the Database directly to maintain control
          const goal = await prisma.goal.create({
            data: {
              userId,
              title: planResult.goalTitle,
              description: planResult.goalDescription,
              targetWeeks: targetDate ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) || 1 : 1,
              effortLevel: mappedEffortLevel as any,
              status: "ACTIVE"
            }
          });

          // Create the Quests in user's timezone
          const tz = await getUserTimezone(userId);
          const today = new Date();
          let daysToDeadline = 7;
          if (targetDate) {
             const diff = new Date(targetDate).getTime() - today.getTime();
             daysToDeadline = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          }

          const questsToCreate = planResult.quests.map((q, index) => {
            // Distribute quests across the timeline evenly
            const offsetDays = Math.floor((index / planResult.quests.length) * daysToDeadline);
            const scheduledFor = TimezoneService.getUserLocalDateOffset(tz, offsetDays);
            
            return {
              userId,
              goalId: goal.id,
              title: q.title,
              description: q.description,
              requiredMinutes: q.requiredMinutes,
              xpReward: q.xpReward,
              sylphReward: q.sylphReward,
              scheduledFor,
              status: "PENDING" as any,
              createdByAi: true
            };
          });

          await prisma.quest.createMany({
            data: questsToCreate
          });

          // Calculate actual generated time
          let actualTotalMinutes = 0;
          questsToCreate.forEach(q => actualTotalMinutes += q.requiredMinutes);

          // Create a system message in the AI chat
          await prisma.systemMessage.create({
            data: {
              userId,
              content: `**Study Plan Generated!**\n\nI have successfully researched **"${topic}"** and generated a structured plan.\n\n- **Goal**: ${planResult.goalTitle}\n- **Workload**: ${questsToCreate.length} quests totaling ~${Math.round(actualTotalMinutes / 60)} hours\n- **Effort Level**: ${mappedEffortLevel}\n\nYour quests have been scheduled! You can ask me to edit, reschedule, or delete any of these quests at any time.`,
              type: "SYSTEM",
            },
          });

          // Final response
          sendEvent("result", { goal });

          // Record quota usage after successful generation
          await recordUsage(userId, "planner");

          controller.close();
        } catch (err: any) {
          console.error("Planner API Error:", err);
          const errorMsg =
            err.message === "AI_TIMEOUT"
              ? "The AI took longer than expected to research your topics. Please try again with a slightly more concise topic or syllabus."
              : err.message || "Failed to generate plan.";
          sendEvent("error", { message: errorMsg });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Planner API wrapper error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
