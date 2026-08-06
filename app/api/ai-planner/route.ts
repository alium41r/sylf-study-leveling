import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { AiStudyOrchestrator, StudySessionData } from "@/lib/ai/orchestrator";

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
    const { topic, syllabus, effortHours, targetDate } = await req.json();

    if (!topic || !effortHours) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Prepare a ReadableStream for Server-Sent Events (SSE)
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

          // Generate Plan using Multi-Agent Orchestrator
          const planResult = await AiStudyOrchestrator.generatePlan(
            topic, 
            syllabus || "", 
            effortHours, 
            targetDate || null,
            pastSessions,
            onProgress
          );

          sendEvent("thought", { text: "[System] Plan finalized. Saving to database..." });

          // Save the Goal and Quests to the Database
          const goal = await prisma.goal.create({
            data: {
              userId,
              title: planResult.goalTitle,
              description: planResult.goalDescription,
              targetWeeks: targetDate ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) || 1 : 1,
              effortLevel: effortHours > 20 ? "HARD" : "NORMAL",
              status: "ACTIVE"
            }
          });

          // Create the Quests
          const today = new Date();
          let daysToDeadline = 7;
          if (targetDate) {
             const diff = new Date(targetDate).getTime() - today.getTime();
             daysToDeadline = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          }

          const questsToCreate = planResult.quests.map((q, index) => {
            // Distribute quests across the timeline evenly
            const scheduledDate = new Date(today);
            const offsetDays = Math.floor((index / planResult.quests.length) * daysToDeadline);
            scheduledDate.setDate(today.getDate() + offsetDays);
            
            return {
              userId,
              goalId: goal.id,
              title: q.title,
              description: q.description,
              requiredMinutes: q.requiredMinutes,
              xpReward: q.xpReward,
              sylphReward: q.sylphReward,
              scheduledFor: targetDate ? scheduledDate.toISOString().split("T")[0] : "", // Empty if no target date
              status: "PENDING"
            };
          });

          await prisma.quest.createMany({
            data: questsToCreate
          });

          sendEvent("result", { goal: { ...goal, quests: questsToCreate } });
          controller.close();
        } catch (error: any) {
          sendEvent("error", { message: error.message || "Failed to generate plan." });
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("POST /api/ai-planner error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
