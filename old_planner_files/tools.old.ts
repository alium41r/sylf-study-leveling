// ============================================================
// AI Tool Schemas — Gemini Function Calling Definitions
// ============================================================
// These define the "tools" that The System agent can invoke.
// Uses the @google/genai Type enum for schema definitions.
// ============================================================

import { Type } from "@google/genai";

/**
 * Tool: generateQuestPlan
 * The AI generates a structured array of daily quests from a goal.
 */
export const generateQuestPlanTool = {
  functionDeclarations: [
    {
      name: "generateQuestPlan",
      description:
        "Generate a structured daily quest plan for a study goal. Each quest has a title, description, required study minutes, and scheduled date. Adjust intensity based on the effort level.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          quests: {
            type: Type.ARRAY,
            description: "Array of quest objects to create",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "Short quest title, e.g., 'Study React Hooks'",
                },
                description: {
                  type: Type.STRING,
                  description:
                    "Detailed instructions for the quest, 1-2 sentences",
                },
                requiredMinutes: {
                  type: Type.NUMBER,
                  description: "Required study time in minutes",
                },
                scheduledDay: {
                  type: Type.NUMBER,
                  description:
                    "Day number relative to today (1 = tomorrow, 2 = day after, etc.)",
                },
              },
              required: [
                "title",
                "description",
                "requiredMinutes",
                "scheduledDay",
              ],
            },
          },
        },
        required: ["quests"],
      },
    },
  ],
};

/**
 * Tool: adjustQuestPlan
 * The AI recalculates quest intensity for a new timeline.
 */
export const adjustQuestPlanTool = {
  functionDeclarations: [
    {
      name: "adjustQuestPlan",
      description:
        "Recalculate a quest plan for a different timeline. Given the original goal and the new target weeks, generate an updated quest plan with adjusted daily study minutes and intensity.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          adjustedQuests: {
            type: Type.ARRAY,
            description: "Array of adjusted quest objects",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                requiredMinutes: { type: Type.NUMBER },
                scheduledDay: { type: Type.NUMBER },
              },
              required: [
                "title",
                "description",
                "requiredMinutes",
                "scheduledDay",
              ],
            },
          },
          newEffortLevel: {
            type: Type.STRING,
            description:
              "The recommended effort level: RELAXED, NORMAL, INTENSE, or EXTREME",
          },
          warningMessage: {
            type: Type.STRING,
            description:
              "A warning message if the new pace is very intense. null if not needed.",
          },
        },
        required: ["adjustedQuests", "newEffortLevel"],
      },
    },
  ],
};

/**
 * Tool: evaluatePerformance
 * The AI evaluates the user's recent study performance and generates feedback.
 */
export const evaluatePerformanceTool = {
  functionDeclarations: [
    {
      name: "evaluatePerformance",
      description:
        "Evaluate a student's study performance over the past week and generate feedback. Suggest quest difficulty adjustments if needed.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description:
              "A 2-3 sentence performance summary in The System's voice",
          },
          shouldAdjustDifficulty: {
            type: Type.BOOLEAN,
            description:
              "Whether the quest difficulty should be adjusted based on performance",
          },
          suggestedDailyMinutes: {
            type: Type.NUMBER,
            description:
              "New suggested daily study minutes, if adjustment is needed",
          },
          motivationalMessage: {
            type: Type.STRING,
            description:
              "An ominous but motivating message from The System",
          },
        },
        required: ["summary", "shouldAdjustDifficulty", "motivationalMessage"],
      },
    },
  ],
};
