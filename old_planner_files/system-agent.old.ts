// ============================================================
// The System Agent — AI Quest Master
// ============================================================
// Uses Gemini 2.5 Flash with function calling to generate quests,
// adjust effort, and evaluate performance. This is the core
// agentic AI feature of the application.
//
// Week 5: Scaffold with basic quest generation
// Week 6: Full implementation with memory + reflection
// Week 7: Multi-model routing (Gemini + Claude)
// ============================================================

import { GoogleGenAI } from "@google/genai";
import {
  generateQuestPlanTool,
  adjustQuestPlanTool,
  evaluatePerformanceTool,
} from "./tools.old";
import {
  SYSTEM_PERSONA,
  questGenerationPrompt,
  effortAdjustmentPrompt,
  performanceEvaluationPrompt,
} from "./prompts.old";
import { EFFORT_CONFIG, type EffortLevel } from "@/lib/game-engine";
import { calculateQuestRewards } from "@/lib/difficulty-engine";

function questRewards(requiredMinutes: number, effort: EffortLevel, userLevel: number = 1) {
  const rewards = calculateQuestRewards(requiredMinutes, "NORMAL", userLevel);
  return { xp: rewards.xp, sylph: rewards.sylph };
}

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "gemini-3.7-flash";

// ─── Types ───────────────────────────────────────────────────

export interface GeneratedQuest {
  title: string;
  description: string;
  requiredMinutes: number;
  scheduledDay: number; // day offset from today
  xpReward: number;
  sylphReward: number;
}

export interface AdjustedPlan {
  quests: GeneratedQuest[];
  newEffortLevel: EffortLevel;
  warningMessage: string | null;
}

export interface PerformanceReview {
  summary: string;
  shouldAdjustDifficulty: boolean;
  suggestedDailyMinutes: number | null;
  motivationalMessage: string;
}

// ─── Quest Generation ────────────────────────────────────────

/**
 * Generate a 7-day quest plan for a goal using the AI agent.
 */
export async function generateQuests(
  goalTitle: string,
  goalDescription: string | null,
  targetWeeks: number,
  effortLevel: EffortLevel,
  userLevel: number = 1
): Promise<GeneratedQuest[]> {
  const config = EFFORT_CONFIG[effortLevel];
  const prompt = questGenerationPrompt(
    goalTitle,
    goalDescription,
    targetWeeks,
    effortLevel,
    config.dailyMinutes
  );

  try {
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        tools: [generateQuestPlanTool],
        systemInstruction: SYSTEM_PERSONA,
      },
    });

    const response = await chat.sendMessage({ message: prompt });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "generateQuestPlan" && call.args?.quests) {
        const rawQuests = call.args.quests as Array<{
          title: string;
          description: string;
          requiredMinutes: number;
          scheduledDay: number;
        }>;

        return rawQuests.map((q) => {
          const rewards = questRewards(q.requiredMinutes, effortLevel, userLevel);
          return {
            title: q.title,
            description: q.description,
            requiredMinutes: q.requiredMinutes,
            scheduledDay: q.scheduledDay,
            xpReward: rewards.xp,
            sylphReward: rewards.sylph,
          };
        });
      }
    }
  } catch (error) {
    console.warn("[System Agent] Gemini API failed, falling back to Groq.", error);
    try {
      const groqRes = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PERSONA + "\nYou must output a JSON object with a single key 'quests' containing an array of objects. Each object must have 'title' (string), 'description' (string), 'requiredMinutes' (number), 'scheduledDay' (number)." },
          { role: "user", content: prompt }
        ],
        model: "llama3-70b-8192",
        response_format: { type: "json_object" }
      });
      const data = JSON.parse(groqRes.choices[0]?.message?.content || '{"quests":[]}');
      return (data.quests || []).map((q: any) => {
        const rewards = questRewards(q.requiredMinutes || 30, effortLevel, userLevel);
        return {
          title: q.title,
          description: q.description,
          requiredMinutes: q.requiredMinutes || 30,
          scheduledDay: q.scheduledDay || 1,
          xpReward: rewards.xp,
          sylphReward: rewards.sylph,
        };
      });
    } catch (e) {
      console.error("[System Agent] Groq fallback also failed.", e);
    }
  }

  // Fallback: return empty if AI didn't use the tool
  console.warn("[System Agent] AI did not use the generateQuestPlan tool.");
  return [];
}

// ─── Effort Adjustment ──────────────────────────────────────

/**
 * Adjust a quest plan for a new timeline using the AI agent.
 */
export async function adjustQuests(
  goalTitle: string,
  goalDescription: string | null,
  originalWeeks: number,
  newWeeks: number,
  originalDailyMinutes: number,
  newDailyMinutes: number,
  effortLevel: EffortLevel,
  pastSessionsContext: string = ""
): Promise<AdjustedPlan> {
  const prompt = effortAdjustmentPrompt(
    goalTitle,
    goalDescription,
    originalWeeks,
    newWeeks,
    originalDailyMinutes,
    newDailyMinutes,
    pastSessionsContext
  );

  try {
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        tools: [adjustQuestPlanTool],
        systemInstruction: SYSTEM_PERSONA,
      },
    });

    const response = await chat.sendMessage({ message: prompt });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "adjustQuestPlan" && call.args) {
        const rawQuests = (call.args.adjustedQuests || []) as Array<{
          title: string;
          description: string;
          requiredMinutes: number;
          scheduledDay: number;
        }>;

        const newEffort = (call.args.newEffortLevel as EffortLevel) || effortLevel;

        return {
          quests: rawQuests.map((q) => {
            const rewards = questRewards(q.requiredMinutes, newEffort, 1);
            return {
              title: q.title,
              description: q.description,
              requiredMinutes: q.requiredMinutes,
              scheduledDay: q.scheduledDay,
              xpReward: rewards.xp,
              sylphReward: rewards.sylph,
            };
          }),
          newEffortLevel: newEffort,
          warningMessage: (call.args.warningMessage as string) || null,
        };
      }
    }
  } catch (error) {
    console.warn("[System Agent] Gemini API failed in adjustQuests, falling back to Groq.", error);
    try {
      const groqRes = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PERSONA + "\nYou must output a JSON object with keys: 'adjustedQuests' (array of {title, description, requiredMinutes, scheduledDay}), 'newEffortLevel' (string: RELAXED, NORMAL, INTENSE, EXTREME), 'warningMessage' (string or null)." },
          { role: "user", content: prompt }
        ],
        model: "llama3-70b-8192",
        response_format: { type: "json_object" }
      });
      const data = JSON.parse(groqRes.choices[0]?.message?.content || '{}');
      const newEffort = (data.newEffortLevel as EffortLevel) || effortLevel;
      return {
        quests: (data.adjustedQuests || []).map((q: any) => {
          const rewards = questRewards(q.requiredMinutes || 30, newEffort, 1);
          return {
            title: q.title,
            description: q.description,
            requiredMinutes: q.requiredMinutes || 30,
            scheduledDay: q.scheduledDay || 1,
            xpReward: rewards.xp,
            sylphReward: rewards.sylph,
          };
        }),
        newEffortLevel: newEffort,
        warningMessage: data.warningMessage || null,
      };
    } catch (e) {
      console.error("[System Agent] Groq fallback failed.", e);
    }
  }

  return { quests: [], newEffortLevel: effortLevel, warningMessage: null };
}

// ─── Performance Evaluation ─────────────────────────────────

/**
 * Evaluate a user's weekly performance using the AI agent.
 */
export async function evaluatePerformance(
  hunterName: string,
  level: number,
  rank: string,
  completedQuests: number,
  failedQuests: number,
  totalMinutesThisWeek: number,
  streakDays: number
): Promise<PerformanceReview> {
  const prompt = performanceEvaluationPrompt(
    hunterName,
    level,
    rank,
    completedQuests,
    failedQuests,
    totalMinutesThisWeek,
    streakDays
  );

  try {
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        tools: [evaluatePerformanceTool],
        systemInstruction: SYSTEM_PERSONA,
      },
    });

    const response = await chat.sendMessage({ message: prompt });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "evaluatePerformance" && call.args) {
        return {
          summary: (call.args.summary as string) || "",
          shouldAdjustDifficulty: (call.args.shouldAdjustDifficulty as boolean) || false,
          suggestedDailyMinutes: (call.args.suggestedDailyMinutes as number) || null,
          motivationalMessage: (call.args.motivationalMessage as string) || "",
        };
      }
    }
  } catch (error) {
    console.warn("[System Agent] Gemini API failed in evaluatePerformance, falling back to Groq.", error);
    try {
      const groqRes = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PERSONA + "\nYou must output a JSON object with keys: 'summary' (string), 'shouldAdjustDifficulty' (boolean), 'suggestedDailyMinutes' (number or null), 'motivationalMessage' (string)." },
          { role: "user", content: prompt }
        ],
        model: "llama3-70b-8192",
        response_format: { type: "json_object" }
      });
      const data = JSON.parse(groqRes.choices[0]?.message?.content || '{}');
      return {
        summary: data.summary || "",
        shouldAdjustDifficulty: data.shouldAdjustDifficulty || false,
        suggestedDailyMinutes: data.suggestedDailyMinutes || null,
        motivationalMessage: data.motivationalMessage || "",
      };
    } catch (e) {
      console.error("[System Agent] Groq fallback failed.", e);
    }
  }

  return {
    summary: "The System was unable to evaluate your performance.",
    shouldAdjustDifficulty: false,
    suggestedDailyMinutes: null,
    motivationalMessage: "Continue your training. The System is watching.",
  };
}
