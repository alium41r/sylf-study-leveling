import { NextRequest, NextResponse } from "next/server";
import { executionTransaction } from "@/lib/execution-coordination";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { AiStudyOrchestrator, StudySessionData } from "@/lib/ai/orchestrator";
import { reserveQuota, releaseQuota } from "@/lib/ai/usage-limiter";
import { AI_LIMITS } from "@/lib/ai/config";
import { calculateRecommendedDifficulty } from "@/lib/difficulty-engine";

import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";
import { logAiUsage } from "@/lib/ai/usage-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Extended execution window on Vercel for multi-agent reasoning

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    if (await prisma.plannerPlan.findFirst({ where: { userId, contractVersion: 2 }, select: { id: true } })) {
      return NextResponse.json({ error: "PLANNER_V2_REQUIRED", message: "Continue planning through your current Planner workspace." }, { status: 409 });
    }

    // ── Quota enforcement ─────────────────────────────────
    // S4: RESERVE before the (expensive, multi-agent) generation begins;
    // failures/aborts refund the unit.
    // A configured owner account is entitled to unlimited generations: the
    // reservation is bypassed (charged === false) and `unlimited` carries the
    // permission, so the gate must accept either signal.
    const quota = await reserveQuota(userId, "planner");
    if (!quota.charged && !quota.unlimited) {
      return NextResponse.json(
        { error: "quota_exceeded", feature: "planner", remaining: 0, limit: quota.limit, resetsAt: quota.resetsAt },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { topic, syllabus, effortHours, targetDate, sessionId } = body;

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
          // Resolve or create ChatSession for this study plan
          let targetSessionId = typeof sessionId === "number" ? sessionId : undefined;
          if (targetSessionId) {
            const existing = await prisma.chatSession.findFirst({
              where: { id: targetSessionId, userId }
            });
            if (!existing) {
              targetSessionId = undefined;
            }
          }

          if (!targetSessionId) {
            const newSession = await prisma.chatSession.create({
              data: {
                userId,
                title: `Study Plan: ${topic.slice(0, 30)}`,
              }
            });
            targetSessionId = newSession.id;
          }

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
            try {
              sendEvent("thought", { text: msg });
            } catch {
              // Stream already closed (client disconnected) — ignore.
            }
          };

          // ── Unified abort chain: client disconnect OR hard timeout
          //    aborts the upstream LLM requests immediately. ──
          const abortController = new AbortController();
          let timedOut = false;
          const onClientAbort = () => abortController.abort();
          if (req.signal) {
            req.signal.addEventListener("abort", onClientAbort);
            if (req.signal.aborted) abortController.abort();
          }
          const timeoutId = setTimeout(() => {
            timedOut = true;
            abortController.abort();
          }, AI_LIMITS.plannerTimeoutMs);

          let planResult;
          try {
            planResult = await AiStudyOrchestrator.generatePlan(
              topic, 
              syllabus || "", 
              effortHours, 
              targetDate || null,
              pastSessions,
              onProgress,
              abortController.signal
            );
          } finally {
            clearTimeout(timeoutId);
            if (req.signal) req.signal.removeEventListener("abort", onClientAbort);
          }

          if (!planResult) {
            throw new Error(timedOut ? "AI_TIMEOUT" : "AI_ABORTED");
          }

          sendEvent("thought", { text: "[System] Plan finalized. Saving to database..." });

          let mappedEffortLevel = "NORMAL";
          if (effortHours >= 30) mappedEffortLevel = "EXTREME";
          else if (effortHours >= 15) mappedEffortLevel = "INTENSE";
          else if (effortHours <= 5) mappedEffortLevel = "RELAXED";

          // Save the Goal and Quests to the Database directly to maintain control
          let targetWeeks = 1;
          if (targetDate) {
            const weekDiff = (new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7);
            if (Number.isFinite(weekDiff)) {
              targetWeeks = Math.max(1, Math.ceil(weekDiff));
            }
          }

          const { goal, plannerModelName } = await executionTransaction(userId, async tx => {
            if (await tx.plannerPlan.findFirst({ where: { userId, contractVersion: 2 }, select: { id: true } })) throw new Error("PLANNER_V2_REQUIRED");
          const goal = await tx.goal.create({
            data: {
              userId,
              title: planResult.goalTitle,
              description: planResult.goalDescription,
              targetWeeks,
              effortLevel: mappedEffortLevel as any,
              status: "ACTIVE",
              // Exact deadline (UTC representational midnight) when provided
              targetDate:
                targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
                  ? new Date(`${targetDate}T00:00:00.000Z`)
                  : null,
            }
          });

          // Create the Quests in user's timezone
          const userWithSchedule = await tx.user.findUnique({
            where: { id: userId },
            select: { restDays: true, timezone: true },
          });
          const tz = userWithSchedule?.timezone || (await getUserTimezone(userId, tx));
          const restDays = userWithSchedule?.restDays || [0];

          const today = new Date();
          let daysToDeadline = 7;
          if (targetDate) {
             const diff = new Date(targetDate).getTime() - today.getTime();
             if (Number.isFinite(diff)) {
               daysToDeadline = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
             }
          }

          // Floating (ad-hoc) rest days are hard-blocked here too: no quest may
          // be generated on a date the user exempted from study.
          let floatingRestSet = new Set<string>();
            const floatingStart = TimezoneService.getUserLocalDate(tz);
            const floatingEnd = TimezoneService.getUserLocalDateOffset(tz, daysToDeadline + 14);
            const floating = await tx.floatingRestDay.findMany({
              where: { userId, dateKey: { gte: floatingStart, lte: floatingEnd } },
              select: { dateKey: true },
            });
            floatingRestSet = new Set(floating.map((f) => f.dateKey));


          const questsToCreate = planResult.quests.map((q, index) => {
            // Distribute quests across the timeline evenly
            let offsetDays = Math.floor((index / Math.max(1, planResult.quests.length)) * daysToDeadline);
            let scheduledFor = TimezoneService.getUserLocalDateOffset(tz, offsetDays);
            
            // Skip fixed AND floating rest days by rolling forward to the nearest
            // active study day.
            let attempts = 0;
            while (attempts < 30) {
              const parts = scheduledFor.split("-").map((n) => parseInt(n, 10));
              const dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
              if (restDays.includes(dayOfWeek) || floatingRestSet.has(scheduledFor)) {
                offsetDays += 1;
                scheduledFor = TimezoneService.getUserLocalDateOffset(tz, offsetDays);
                attempts += 1;
              } else {
                break;
              }
            }

            if (attempts >= 30) throw new Error("REST_DAY_ALLOCATION_PROHIBITED");

            // Canonical difficulty tier derived deterministically from duration;
            // rewards were already canonicalized by the orchestrator.
            const difficulty = calculateRecommendedDifficulty(q.requiredMinutes);

            return {
              userId,
              goalId: goal.id,
              title: q.title,
              description: q.description,
              requiredMinutes: q.requiredMinutes,
              targetMinutes: q.requiredMinutes,
              xpReward: q.xpReward,
              sylphReward: q.sylphReward,
              difficulty,
              scheduledFor,
              status: "PENDING" as any,
              createdByAi: true
            };
          });

          await tx.quest.createMany({
            data: questsToCreate
          });

          // Calculate actual generated time
          let actualTotalMinutes = 0;
          questsToCreate.forEach(q => actualTotalMinutes += q.requiredMinutes);

          // Create the User Prompt message in the chat session
          await tx.systemMessage.create({
            data: {
              userId,
              sessionId: targetSessionId,
              content: `Generate an adaptive AI Study Plan for **"${topic}"**${syllabus ? `\n\n**Syllabus:**\n${syllabus}` : ""}${targetDate ? `\n**Deadline:** ${targetDate}` : ""}\n**Target Effort:** ${effortHours} hrs/week`,
              type: "USER",
              read: true,
            },
          });

          // Create formatted Assistant System Message in the AI chat
          // (No-yap: facts only — no intro, no filler, one closing line.)
          const questsPreview = questsToCreate
            .slice(0, 5)
            .map((q, i) => `${i + 1}. **${q.title}** (${q.requiredMinutes}m)`)
            .join("\n");
          const moreQuestsNote = questsToCreate.length > 5 ? `\n*...and ${questsToCreate.length - 5} more quests scheduled.*` : "";

          const plannerModelName = planResult.modelUsed || "Gemini 3.7 Flash";
          const assistantContent = `### 🎓 Study Plan Generated: **${planResult.goalTitle}**\n\n- **Workload**: ${questsToCreate.length} quests · ~${Math.round(actualTotalMinutes / 60)} hours total\n- **Effort**: ${mappedEffortLevel} (${effortHours} hrs/week)${targetDate ? `\n- **Deadline**: ${targetDate}` : ""}\n\n#### Scheduled Quest Preview:\n${questsPreview}${moreQuestsNote}\n\nQuests are live on your calendar — ask me to modify, reschedule, or split any of them.`;

          await tx.systemMessage.create({
            data: {
              userId,
              sessionId: targetSessionId,
              content: assistantContent,
              type: "SYSTEM",
              read: true,
              modelUsed: plannerModelName,
            },
          });

            return { goal, plannerModelName };
          });

          // Final response with targetSessionId, modelUsed, and current quota
          sendEvent("result", {
            goal,
            sessionId: targetSessionId,
            modelUsed: plannerModelName,
            quota: {
              allowed: quota.unlimited || quota.allowed,
              used: quota.used,
              limit: quota.limit,
              remaining: quota.remaining,
              resetsAt: quota.resetsAt,
              unlimited: quota.unlimited,
            },
          });

          // Request-level cost telemetry (best-effort — never blocks the result).
          await logAiUsage({
            userId,
            feature: "planner",
            workload: "planner",
            provider: "deepseek",
            model: planResult.modelUsed || "unknown",
            promptTokens: planResult.usage?.promptTokens || 0,
            completionTokens: planResult.usage?.completionTokens || 0,
          });

          controller.close();
        } catch (err: any) {
          console.error("Planner API Error:", err);
          // S4: refund the reservation — the plan was never delivered.
          await releaseQuota(userId, "planner").catch(() => {});
          const errorMsg =
            err.message === "AI_TIMEOUT"
              ? "The AI took longer than expected to research your topics. Please try again with a slightly more concise topic or syllabus."
              : err.message === "AI_ABORTED" || err.name === "AbortError"
                ? "Generation was cancelled."
                : err.message || "Failed to generate plan.";
          try {
            sendEvent("error", { message: errorMsg });
          } catch {}
          try {
            controller.close();
          } catch {}
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
