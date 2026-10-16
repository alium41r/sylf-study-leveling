import { withAiRequest } from "@/lib/ai/telemetry";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "./providers/factory";
import { getSituationalFlags } from "./planning-engine";

export interface GenerateBriefingResult {
  success: boolean;
  message?: string;
}

export class DailyBriefingService {
  /**
   * Generates a daily briefing for the specified user and dateKey.
   * This is a STRICTLY READ-ONLY LLM execution with tools: [].
   */
  public static async generateDailyBriefing(
    userId: number,
    dateKey: string,
    timezone: string
  ): Promise<GenerateBriefingResult> {
  return withAiRequest({ userId, feature: "other", workload: "daily_briefing" }, async () => {
    try {
      // 1. Fetch user data
      const user = await prisma.user.findUnique({
        where: { id: userId }, select: { id: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // 2. Compute Yesterday's DateKey
      // We parse dateKey "YYYY-MM-DD" as UTC noon to safely subtract 24 hours without DST issues
      const todayDate = new Date(`${dateKey}T12:00:00Z`);
      const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayDateKey = yesterdayDate.toISOString().split("T")[0];

      // 3. Build Deterministic DB Context
      const [yesterdayQuests, todayQuests, flags] = await Promise.all([prisma.quest.findMany({
        where: {
          userId,
          scheduledFor: yesterdayDateKey,
        }, select: { status: true },
      }), prisma.quest.findMany({
        where: {
          userId,
          scheduledFor: dateKey,
        }, select: { requiredMinutes: true },
      }), getSituationalFlags(userId)]);

      const completedYesterday = yesterdayQuests.filter((q) => q.status === "COMPLETED").length;
      const failedYesterday = yesterdayQuests.filter((q) => q.status === "FAILED").length;
      const totalYesterday = yesterdayQuests.length;

      const totalToday = todayQuests.length;
      const todayMinutes = todayQuests.reduce((acc, q) => acc + q.requiredMinutes, 0);

      // 4. Construct the prompt
      const systemInstruction = `
You are Sylvie, the calm, friendly study assistant in Sylf. Write a brief morning notification in natural study language.
This is a Daily Briefing.
Your output MUST be strictly under 800 characters. Be extremely concise.
Do not invent statistics or tasks. Do not use titles such as Scholar or Hunter, fantasy terminology, flattery or filler.
Use the provided data to give a realistic summary of yesterday and what is expected today.

[Situational Context]
Burnout Risk: ${flags.isBurnoutRisk}
Struggling: ${flags.isStruggling}
Overloaded: ${flags.isOverloaded}

[Yesterday (${yesterdayDateKey})]
Total Quests: ${totalYesterday}
Completed: ${completedYesterday}
Failed/Skipped: ${failedYesterday}

[Today (${dateKey})]
Scheduled Quests: ${totalToday}
Total Estimated Minutes: ${todayMinutes}

Treat these app workload flags as study hints, never a medical diagnosis. Summarize yesterday and today with one useful suggestion if warranted. Do not use markdown headers.
      `.trim();

      // 5. LLM Execution (Read-Only)
      const adapter = LLMFactory.getAdapter("gemini"); // Defaulting to Gemini

      const response = await adapter.generateResponse(
        [{ role: "user", content: "Generate my daily briefing." }],
        systemInstruction,
        [], // STRICT ENFORCEMENT: No tools
        { maxTokens: 512, thinking: "disabled", singleAttempt: true, signal: AbortSignal.timeout(30_000) }
      );

      let generatedText = response.text || "";

      // We can also fallback to searching parts if Groq sends something differently, but usually text is populated.
      if (!generatedText && response.toolCalls) {
        throw new Error("Agent attempted to use tools despite empty tool list.");
      }

      // 6. Hard backend output bounds
      if (generatedText.length > 800) {
        // Enforce max bounds rigorously. Alternatively, we could truncate, but failing ensures model obeys.
        throw new Error("Generated briefing exceeded maximum allowed length of 800 characters.");
      }

      if (generatedText.trim().length === 0) {
        throw new Error("Generated briefing was empty.");
      }

      // 7. Save to DB (SessionId = null enforces chat history isolation)
      await prisma.systemMessage.create({
        data: {
          userId,
          content: generatedText,
          type: "DAILY_BRIEFING",
          read: false,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error("[AI] operation unavailable");
      return { success: false, message: error.message };
    }

  });
}

  /**
   * Asynchronously creates an in-universe Hunter Protocol diagnostic briefing
   * upon milestone events (RANK_PROMOTION, FORGE_MASTERY) without blocking session completion.
   */
  public static async generateHunterDiagnosticMessage(
    userId: number,
    event: "RANK_PROMOTION" | "FORGE_MASTERY",
    details: any = {}
  ): Promise<GenerateBriefingResult> {
    try {
      const stats = await prisma.userStats.findUnique({
        where: { userId },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true },
      });

      if (!user) throw new Error("User not found");

      const endurance = stats?.endurance ?? 10;
      const tenacity = stats?.tenacity ?? 10;
      const velocity = stats?.velocity ?? 10;
      const discipline = stats?.discipline ?? 10;
      const synthesis = stats?.synthesis ?? 10;

      let eventTitle = "[HUNTER PROTOCOL UPDATE]";
      let eventSummary = "";

      if (event === "RANK_PROMOTION") {
        eventTitle = `[HUNTER PROMOTION: ${details.rank || stats?.rank || "RANK UP"}]`;
        eventSummary = `Sylvie has recognized your academic output threshold. New Hunter Classification: ${details.rank || stats?.rank}.`;
      } else if (event === "FORGE_MASTERY") {
        eventTitle = `[FORGE CORE MASTERED: ${details.coreName || details.coreKey || "DISCIPLINE REACTOR"}]`;
        eventSummary = `All foundational topics under the ${details.coreName || details.coreKey} matrix have reached 100% resonance.`;
      }

      const diagnosticText = `
${eventTitle}
Scholar: ${user.name || user.username}
${eventSummary}

[COGNITIVE VECTOR DIAGNOSTIC]
• Endurance: ${endurance}
• Tenacity: ${tenacity}
• Velocity: ${velocity}
• Discipline: ${discipline}
• Synthesis: ${synthesis}

System Evaluation: Vector balance calibrated. Continue deliberate study loops to maintain operational resonance.
`.trim();

      await prisma.systemMessage.create({
        data: {
          userId,
          content: diagnosticText,
          type: "SYSTEM",
          read: false,
        },
      });

      return { success: true, message: diagnosticText };
    } catch (error: any) {
      console.error("[AI] operation unavailable");
      return { success: false, message: error.message };
    }
  }
}

export const generateHunterDiagnosticMessage = DailyBriefingService.generateHunterDiagnosticMessage;
