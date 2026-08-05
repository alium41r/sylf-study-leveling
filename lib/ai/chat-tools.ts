// ============================================================
// Chat Tool Schemas — Gemini Function Calling for Chat
// ============================================================
// These tools let the AI assistant read and write app data
// directly from the chat interface.
// ============================================================

import { Type } from "@google/genai";

/**
 * Tool: createGoal
 * Create a new study goal for the user.
 */
export const createGoalTool = {
  name: "createGoal",
  description:
    "Create a new study goal for the user. Call this when the user asks you to add a goal, start a new subject goal, etc. Always confirm what you created.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Short title for the goal (e.g., 'Learn React')",
      },
      description: {
        type: Type.STRING,
        description: "Brief description of the goal",
      },
      targetWeeks: {
        type: Type.NUMBER,
        description: "Number of weeks to achieve the goal (e.g. 4, 8, 12). Default to 4 if not specified.",
      },
      effortLevel: {
        type: Type.STRING,
        description: "Effort level: RELAXED, NORMAL, INTENSE, or EXTREME. Defaults to NORMAL.",
      },
    },
    required: ["title"],
  },
};

/**
 * Tool: getUserStats
 * Read the user's profile and RPG stats.
 */
export const getUserStatsTool = {
  name: "getUserStats",
  description:
    "Get the current user's profile and stats: level, rank, XP, HP, streak days, total study minutes. Call this when the user asks about their progress or stats.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

/**
 * Tool: getGoals
 * List the user's study goals.
 */
export const getGoalsTool = {
  name: "getGoals",
  description:
    "Get all of the user's study goals, including their status (ACTIVE, COMPLETED, ABANDONED), effort level, and target weeks. Call this when the user asks about their goals.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      status: {
        type: Type.STRING,
        description:
          "Optional filter: ACTIVE, COMPLETED, or ABANDONED. Leave empty for all goals.",
      },
    },
  },
};

/**
 * Tool: getQuests
 * List the user's quests with optional filters.
 */
export const getQuestsTool = {
  name: "getQuests",
  description:
    "Get the user's quests (tasks). Can filter by date, status, or goal. Call this when the user asks about their quests, tasks, or what they need to do.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: {
        type: Type.STRING,
        description:
          "Optional date filter in YYYY-MM-DD format. Defaults to today if not specified.",
      },
      status: {
        type: Type.STRING,
        description:
          "Optional status filter: PENDING, IN_PROGRESS, COMPLETED, or FAILED.",
      },
      goalId: {
        type: Type.NUMBER,
        description: "Optional goal ID to filter quests by a specific goal.",
      },
    },
  },
};

/**
 * Tool: getStudySessions
 * Get recent study sessions.
 */
export const getStudySessionsTool = {
  name: "getStudySessions",
  description:
    "Get the user's recent study sessions with duration and linked quest info. Call this when the user asks about their study history or recent sessions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: {
        type: Type.NUMBER,
        description: "Number of sessions to return. Defaults to 10.",
      },
    },
  },
};

/**
 * Tool: createQuest
 * Create a new custom quest for the user.
 */
export const createQuestTool = {
  name: "createQuest",
  description:
    "Create a SINGLE new quest (study task) for the user. CRITICAL RULE: If the user asks for multiple quests, a study schedule, or a batch of tasks, you MUST use the 'createMultipleQuests' tool instead. Do NOT call this tool multiple times in a row.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Short title for the quest (e.g., 'Study React Hooks')",
      },
      description: {
        type: Type.STRING,
        description:
          "Brief description of what to do (1-2 sentences)",
      },
      requiredMinutes: {
        type: Type.NUMBER,
        description: "Required study time in minutes",
      },
      scheduledFor: {
        type: Type.STRING,
        description:
          "Date to schedule the quest for, in YYYY-MM-DD format. Defaults to today if not specified.",
      },
      goalId: {
        type: Type.NUMBER,
        description:
          "Optional goal ID to link this quest to an existing goal.",
      },
    },
    required: ["title", "requiredMinutes"],
  },
};

/**
 * Tool: createMultipleQuests
 * Create multiple quests at once, usually for a new goal.
 */
export const createMultipleQuestsTool = {
  name: "createMultipleQuests",
  description:
    "CRITICAL TOOL FOR SCHEDULES: You MUST use this tool to create multiple quests at once instead of calling createQuest repeatedly. Use this whenever the user asks for a study plan, a schedule, or multiple tasks.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      quests: {
        type: Type.ARRAY,
        description: "List of quests to create",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Short title for the quest (e.g., 'Study React Hooks')" },
            description: { type: Type.STRING, description: "Brief description of what to do (1-2 sentences)" },
            requiredMinutes: { type: Type.NUMBER, description: "Required study time in minutes" },
            scheduledFor: { type: Type.STRING, description: "Date to schedule the quest for, in YYYY-MM-DD format" },
            goalId: { type: Type.NUMBER, description: "Optional goal ID to link this quest to an existing goal." },
          },
          required: ["title", "requiredMinutes"],
        },
      },
    },
    required: ["quests"],
  },
};

/**
 * Tool: updateQuest
 * Update an existing quest's details.
 */
export const updateQuestTool = {
  name: "updateQuest",
  description: "Update an existing quest's title, description, time, or date.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      questId: { type: Type.NUMBER, description: "ID of the quest to update" },
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      requiredMinutes: { type: Type.NUMBER },
      scheduledFor: { type: Type.STRING },
    },
    required: ["questId"],
  },
};

/**
 * Tool: deleteQuest
 * Delete a quest.
 */
export const deleteQuestTool = {
  name: "deleteQuest",
  description: "Delete a quest. Call this when the user asks to remove or delete a task.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      questId: { type: Type.NUMBER, description: "ID of the quest to delete" },
    },
    required: ["questId"],
  },
};

/**
 * Tool: updateGoal
 * Update an existing goal's details.
 */
export const updateGoalTool = {
  name: "updateGoal",
  description: "Update an existing goal's title, description, or effort level.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      goalId: { type: Type.NUMBER, description: "ID of the goal to update" },
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      effortLevel: { type: Type.STRING },
      targetWeeks: { type: Type.NUMBER },
    },
    required: ["goalId"],
  },
};

/**
 * Tool: deleteGoal
 * Delete a goal.
 */
export const deleteGoalTool = {
  name: "deleteGoal",
  description: "Delete a goal and all its associated quests. Call this when the user asks to remove, abandon, or delete a goal.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      goalId: { type: Type.NUMBER, description: "ID of the goal to delete" },
    },
    required: ["goalId"],
  },
};

/**
 * Tool: completeQuest
 * Mark a quest as completed.
 */
export const completeQuestTool = {
  name: "completeQuest",
  description:
    "Mark a specific quest as completed. Call this when the user says they finished a task or quest. You need the quest ID.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      questId: {
        type: Type.NUMBER,
        description: "The ID of the quest to mark as completed.",
      },
    },
    required: ["questId"],
  },
};

/**
 * Tool: getWeeklySummary
 * Get an aggregated weekly performance summary.
 */
export const getWeeklySummaryTool = {
  name: "getWeeklySummary",
  description:
    "Get a summary of the user's performance over the past 7 days: quests completed, quests failed, total study minutes, and streak info. Call this when the user asks about their weekly progress or how they did this week.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

/**
 * All chat tools bundled for Gemini function calling.
 */
export const chatToolsDeclaration = {
  functionDeclarations: [
    getUserStatsTool,
    getGoalsTool,
    createGoalTool,
    getQuestsTool,
    getStudySessionsTool,
    createQuestTool,
    createMultipleQuestsTool,
    updateQuestTool,
    deleteQuestTool,
    completeQuestTool,
    updateGoalTool,
    deleteGoalTool,
    getWeeklySummaryTool,
  ],
};

/**
 * Helper to translate Gemini tool format to OpenAI/Groq function format
 */
export function mapGeminiToolToOpenAI(geminiTool: any) {
  const mapType = (type: any): string => {
    if (!type) return "string";
    const typeStr = String(type).toLowerCase();
    return typeStr;
  };

  const convertSchema = (schema: any): any => {
    if (!schema) return schema;
    const result: any = { type: mapType(schema.type) };
    if (schema.description) result.description = schema.description;
    if (schema.properties) {
      result.properties = {};
      for (const key in schema.properties) {
        result.properties[key] = convertSchema(schema.properties[key]);
      }
    }
    if (schema.items) {
      result.items = convertSchema(schema.items);
    }
    if (schema.required) {
      result.required = schema.required;
    }
    return result;
  };

  return {
    type: "function",
    function: {
      name: geminiTool.name,
      description: geminiTool.description,
      parameters: convertSchema(geminiTool.parameters) || { type: "object", properties: {} },
    },
  };
}

export const groqToolsDeclaration = chatToolsDeclaration.functionDeclarations.map(mapGeminiToolToOpenAI);
