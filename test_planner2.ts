import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "./lib/prisma";
import { AiStudyOrchestrator } from "./lib/ai/orchestrator";

async function testPlanner() {
  const userId = 1; // Assuming user 1 exists
  const topic = "AS Level Mathematics, Cambridge 9709, first 5 chapters";
  const effortHours = 15;
  
  const today = new Date();
  const targetDate = new Date();
  targetDate.setDate(today.getDate() + 10);

  const pastSessions = await prisma.studySession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { subject: true }
  });

  const formattedSessions = pastSessions.map(s => ({
    durationMinutes: s.durationMinutes,
    focusRate: s.focusRate,
    startedAt: s.startedAt,
    subject: s.subject?.name
  }));

  console.log("Running orchestrator...");
  const onProgress = (msg: string) => console.log(msg);

  const planResult = await AiStudyOrchestrator.generatePlan(
    topic, 
    "", 
    effortHours, 
    targetDate.toISOString().split("T")[0],
    formattedSessions,
    onProgress
  );

  console.log("--- FINAL PLAN ---");
  console.log(JSON.stringify(planResult, null, 2));

  let totalMinutes = 0;
  planResult.quests.forEach(q => totalMinutes += q.requiredMinutes);
  console.log(`Total workload: ${totalMinutes / 60} hours (target: ${effortHours} hours)`);
}

testPlanner().catch(console.error).finally(() => process.exit(0));
