// ============================================================
// Chat Tool Schemas — Gemini Function Calling for Chat
// ============================================================
// These tools let the AI assistant read and write app data
// directly from the chat interface.
// ============================================================

import { NormalizedTool } from "./providers/types";

/**
 * Tool: createGoal
 * Create a new study goal for the user.
 */
export const createGoalTool: NormalizedTool = {
  name: "createGoal",
  description:
    "Create a new study goal for the user. Call this when the user asks you to add a goal, start a new subject goal, etc. Always confirm what you created.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the goal (e.g., 'Learn React')",
      },
      description: {
        type: "string",
        description: "Brief description of the goal",
      },
      targetWeeks: {
        type: "number",
        description: "Number of weeks to achieve the goal (e.g. 4, 8, 12). Default to 4 if not specified.",
      },
      effortLevel: {
        type: "string",
        description: "Effort level: RELAXED, NORMAL, INTENSE, or EXTREME. Defaults to NORMAL.",
      },
      color: {
        type: "string",
        description: "Optional accent preset: EMERALD, CYAN, BLUE, VIOLET, ROSE, or AMBER. Defaults to EMERALD.",
      },
      targetDate: {
        type: "string",
        description: "Optional exact deadline date in YYYY-MM-DD format.",
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
    type: "object",
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
    type: "object",
    properties: {
      status: {
        type: "string",
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
    type: "object",
    properties: {
      date: {
        type: "string",
        description:
          "Optional date filter in YYYY-MM-DD format. Defaults to today if not specified.",
      },
      status: {
        type: "string",
        description:
          "Optional status filter: PENDING, IN_PROGRESS, COMPLETED, or FAILED.",
      },
      goalId: {
        type: "number",
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
    type: "object",
    properties: {
      limit: {
        type: "number",
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
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the quest (e.g., 'Study React Hooks')",
      },
      description: {
        type: "string",
        description:
          "Brief description of what to do (1-2 sentences)",
      },
      requiredMinutes: {
        type: "number",
        description: "Required study time in minutes",
      },
      scheduledFor: {
        type: "string",
        description:
          "Date to schedule the quest for, in YYYY-MM-DD format. Defaults to today if not specified.",
      },
      goalId: {
        type: "number",
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
    type: "object",
    properties: {
      quests: {
        type: "array",
        description: "List of quests to create",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short title for the quest (e.g., 'Study React Hooks')" },
            description: { type: "string", description: "Brief description of what to do (1-2 sentences)" },
            requiredMinutes: { type: "number", description: "Required study time in minutes" },
            scheduledFor: { type: "string", description: "Date to schedule the quest for, in YYYY-MM-DD format" },
            goalId: { type: "number", description: "Optional goal ID to link this quest to an existing goal." },
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
  description: "Update an existing quest. You must provide EITHER questId OR searchTitle to identify the quest.",
  parameters: {
    type: "object",
    properties: {
      questId: { type: "number", description: "ID of the quest to update (if known)" },
      searchTitle: { type: "string", description: "The current title of the quest to update (if ID is unknown)" },
      title: { type: "string", description: "The new title" },
      description: { type: "string" },
      requiredMinutes: { type: "number" },
      scheduledFor: { type: "string" },
    },
    required: [],
  },
};

/**
 * Tool: deleteQuest
 * Delete a quest (bulk deletions require user confirmation).
 */
export const deleteQuestTool = {
  name: "deleteQuest",
  description: "Delete one or more quests. Use questId or searchTitle for single quests. Use searchTitles array to delete multiple quests by name. Bulk deletions require the user's explicit confirmation: if the tool returns a REQUIRES_CONFIRMATION response, show the message to the user and ask them to confirm — do NOT retry the deletion until they say yes, then include the confirmationToken from the confirmation response.",
  parameters: {
    type: "object",
    properties: {
      questId: { type: "number", description: "ID of a specific quest to delete" },
      searchTitle: { type: "string", description: "Title of a specific quest to delete" },
      searchTitles: { type: "array", items: { type: "string" }, description: "List of quest titles to delete multiple quests at once" },
      confirmationToken: { type: "string", description: "Signed confirmation token returned by a REQUIRES_CONFIRMATION response. Only include this when the user has explicitly confirmed the deletion." },
    },
    required: [],
  },
};

/**
 * Tool: updateGoal
 * Update an existing goal's details.
 */
export const updateGoalTool = {
  name: "updateGoal",
  description: "Update an existing goal's title, description, effort level, accent color, or deadline. You must provide EITHER goalId OR searchTitle to identify the goal.",
  parameters: {
    type: "object",
    properties: {
      goalId: { type: "number", description: "ID of the goal to update (if known)" },
      searchTitle: { type: "string", description: "The current title of the goal to update (if ID is unknown)" },
      title: { type: "string" },
      description: { type: "string" },
      effortLevel: { type: "string" },
      targetWeeks: { type: "number" },
      color: { type: "string", description: "Accent preset: EMERALD, CYAN, BLUE, VIOLET, ROSE, or AMBER." },
      targetDate: { type: "string", description: "Exact deadline date in YYYY-MM-DD format." },
    },
    required: [],
  },
};

/**
 * Tool: deleteGoal
 * Delete a goal (bulk deletions require user confirmation).
 */
export const deleteGoalTool = {
  name: "deleteGoal",
  description: "Delete a goal and all its associated quests. Use goalId or searchTitle for single goals. Use searchTitles array to delete multiple goals by name. Bulk deletions require the user's explicit confirmation: if the tool returns a REQUIRES_CONFIRMATION response, show the message to the user and ask them to confirm — do NOT retry the deletion until they say yes, then include the confirmationToken from the confirmation response.",
  parameters: {
    type: "object",
    properties: {
      goalId: { type: "number", description: "ID of the goal to delete" },
      searchTitle: { type: "string", description: "Title of a specific goal to delete" },
      searchTitles: { type: "array", items: { type: "string" }, description: "List of goal titles to delete multiple goals at once" },
      confirmationToken: { type: "string", description: "Signed confirmation token returned by a REQUIRES_CONFIRMATION response. Only include this when the user has explicitly confirmed the deletion." },
    },
    required: [],
  },
};

/**
 * Tool: deleteAllTasks
 * Delete all quests and goals (ALWAYS requires user confirmation).
 */
export const deleteAllTasksTool = {
  name: "deleteAllTasks",
  description: "Delete ALL quests and goals for the user. This ALWAYS requires explicit user confirmation: if the tool returns a REQUIRES_CONFIRMATION response, show the message to the user and ask them to confirm — do NOT retry the deletion until they say yes, then include the confirmationToken from the confirmation response.",
  parameters: {
    type: "object",
    properties: {
      confirmationToken: { type: "string", description: "Signed confirmation token returned by the REQUIRES_CONFIRMATION response. Only include this when the user has explicitly confirmed the full wipe." },
    },
    required: [],
  },
};

/**
 * Tool: completeQuest
 * Mark a quest as completed through the authoritative reward RPC.
 */
export const completeQuestTool = {
  name: "completeQuest",
  description:
    "Mark a specific quest as completed. The system atomically awards the quest's XP and Sylph rewards, updates the streak/level, and writes audit ledgers — never claim rewards manually or mention amounts not returned by this tool. Call this only when the user says they finished a task or quest. You need the quest ID.",
  parameters: {
    type: "object",
    properties: {
      questId: {
        type: "number",
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
    type: "object",
    properties: {},
  },
};

/**
 * Tool: moveQuest
 * Move a specific quest to a new date.
 */
export const moveQuestTool = {
  name: "moveQuest",
  description: "Move a specific quest to a new date. Uses the Planning Engine to validate capacity constraints.",
  parameters: {
    type: "object",
    properties: {
      questId: { type: "number", description: "ID of the quest to move." },
      targetDate: { type: "string", description: "The new date to move to (YYYY-MM-DD)." }
    },
    required: ["questId", "targetDate"],
  }
};

/**
 * Tool: swapQuests
 * Swap dates between two user-owned quests.
 */
export const swapQuestsTool = {
  name: "swapQuests",
  description: "Swap dates between two existing quests.",
  parameters: {
    type: "object",
    properties: {
      questIdA: { type: "number", description: "ID of the first quest." },
      questIdB: { type: "number", description: "ID of the second quest." }
    },
    required: ["questIdA", "questIdB"],
  }
};

/**
 * Tool: clearDay
 * Attempt to remove all scheduled quests from a specific date.
 */
export const clearDayTool = {
  name: "clearDay",
  description: "Attempt to clear a day by pushing all scheduled quests to future valid dates based on capacity constraints. This might fail if the user's workload is too high.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "The date to clear (YYYY-MM-DD)." }
    },
    required: ["date"],
  }
};

/**
 * Tool: getSubjectAnalytics
 * Retrieve analytics for subjects/topics.
 */
export const getSubjectAnalyticsTool = {
  name: "getSubjectAnalytics",
  description: "Get detailed performance metrics (focus rate, completion rate, strength, trend) for all subjects. Use this to analyze what the user is good or bad at.",
  parameters: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool: getPerformanceTrends
 * Retrieve weekly trends and trajectories.
 */
export const getPerformanceTrendsTool = {
  name: "getPerformanceTrends",
  description: "Get weekly performance trends (improving, stable, declining) for study time and completion rates over the last 4 weeks. Use this to provide coaching.",
  parameters: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool: getDailyPattern
 * Retrieve daily productivity patterns.
 */
export const getDailyPatternTool = {
  name: "getDailyPattern",
  description: "Analyze the user's best days to study, their average daily minutes, and streak data.",
  parameters: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool: saveMemory
 * Save a fact about the user.
 */
export const saveMemoryTool = {
  name: "saveMemory",
  description: "Save an important fact, preference, or constraint about the user. Only save explicitly stated preferences or high-confidence long-term facts. Do NOT save transient thoughts or uncertain assumptions.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "A unique, short identifier for this memory (e.g., 'preferred_study_time')." },
      value: { type: "string", description: "The fact to remember." },
      source: { type: "string", description: "Must be 'user_stated' or 'inferred'." },
      confidence: { type: "number", description: "Confidence score from 0.1 to 1.0. Use 1.0 for user_stated facts." }
    },
    required: ["key", "value", "source", "confidence"],
  },
};

/**
 * Tool: getMemory
 * Retrieve a specific memory by key.
 */
export const getMemoryTool = {
  name: "getMemory",
  description: "Look up a specific memory by key. Note: 15 recent memories are already provided in your context automatically, so only use this for specific deep lookups.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "The exact key to look up." },
    },
    required: ["key"],
  },
};

/**
 * Tool: forgetMemory
 * Delete a memory by key.
 */
export const forgetMemoryTool = {
  name: "forgetMemory",
  description: "Delete a memory about the user. Use this if the user corrects you or tells you to forget something.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "The exact key of the memory to delete." },
    },
    required: ["key"],
  },
};

/**
 * Tool: generateInsight
 * Save a coaching tip or informational insight to the user's dashboard.
 */
export const generateInsightTool = {
  name: "generateInsight",
  description: "Save a personalized coaching tip, trend observation, or recommendation to the user's dashboard. Do this sparingly and only for high-value insights.",
  parameters: {
    type: "object",
    properties: {
      category: { type: "string", description: "Must be 'coaching', 'trend', 'recommendation', or 'warning'." },
      content: { type: "string", description: "The insight text. Keep it under 200 characters." },
    },
    required: ["category", "content"],
  },
};

/**
 * Tool: getAppState
 * Retrieve current user's core state.
 */
export const getAppStateTool = {
  name: "getAppState",
  description: "Get the current real-time state of the user's progress (Level, Rank, XP, Sylph balance, streak, HP, active goals).",
  parameters: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool: getShopInventory
 * Look up items available in the shop.
 */
export const getShopInventoryTool = {
  name: "getShopInventory",
  description: "Retrieve a list of items available in the shop, including their prices and effects. Use this to suggest rewards the user can buy with their Sylph.",
  parameters: {
    type: "object",
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
    createQuestTool,
    createMultipleQuestsTool,
    getStudySessionsTool,
    updateQuestTool,
    deleteQuestTool,
    updateGoalTool,
    deleteGoalTool,
    deleteAllTasksTool,
    getWeeklySummaryTool,
    moveQuestTool,
    swapQuestsTool,
    clearDayTool,
    getSubjectAnalyticsTool,
    getPerformanceTrendsTool,
    getDailyPatternTool,
    saveMemoryTool,
    getMemoryTool,
    forgetMemoryTool,
    generateInsightTool,
    getAppStateTool,
  ],
};

export type AgentType = "general" | "planner" | "calendar" | "coach" | "analyst";

export const ALLOWED_HANDOFFS: Record<AgentType, AgentType[]> = {
  general: ["planner", "calendar", "coach", "analyst"],
  coach: ["planner"],
  analyst: ["planner", "coach"],
  planner: ["calendar", "coach"],
  calendar: ["planner"]
};

function getHandoffTool(agent: AgentType): NormalizedTool | null {
  const allowed = ALLOWED_HANDOFFS[agent];
  if (!allowed || allowed.length === 0) return null;

  return {
    name: "handoff",
    description: "Hand off the conversation to a specialized agent if the user's intent requires capabilities you don't possess. Choose from the available target agents based on what needs to be done.",
    parameters: {
      type: "object",
      properties: {
        target_agent: {
          type: "string",
          description: "The agent to hand off to.",
          enum: allowed
        },
        reason: {
          type: "string",
          description: "A brief reason why this handoff is necessary."
        }
      },
      required: ["target_agent", "reason"]
    }
  };
}

/**
 * Tool: googleSearch
 * Search the live web for academic curricula, syllabus breakdowns, qualification specs, and exam board outlines.
 */
export const googleSearchTool: NormalizedTool = {
  name: "googleSearch",
  description:
    "Search the live web for official academic curricula, syllabus codes (e.g. Cambridge CAIE 9702/9709, Edexcel, AQA, AP, IB, GCSE), chapter breakdowns, and exam specifications. Always cite specific findings.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g. 'Cambridge AS Level Physics 9702 syllabus chapter list')",
      },
      qualification: {
        type: "string",
        description: "Optional exam board or qualification context (e.g. 'CAIE', 'Edexcel', 'AP', 'IB')",
      },
    },
    required: ["query"],
  },
};

const GENERAL_TOOLS = [getUserStatsTool, getGoalsTool, getQuestsTool, getStudySessionsTool, getWeeklySummaryTool, completeQuestTool, getAppStateTool, getShopInventoryTool];
const PLANNER_TOOLS = [createGoalTool, createQuestTool, createMultipleQuestsTool, updateQuestTool, deleteQuestTool, updateGoalTool, deleteGoalTool, deleteAllTasksTool, googleSearchTool];
const CALENDAR_TOOLS = [moveQuestTool, swapQuestsTool, clearDayTool];
const ANALYTICS_TOOLS = [getSubjectAnalyticsTool, getPerformanceTrendsTool, getDailyPatternTool, generateInsightTool];
const MEMORY_TOOLS = [saveMemoryTool, getMemoryTool, forgetMemoryTool];

export function getToolsForAgent(agent: AgentType): NormalizedTool[] {
  let tools: any[] = [];
  switch (agent) {
    case "general":
      tools = [...GENERAL_TOOLS, ...MEMORY_TOOLS];
      break;
    case "planner":
      tools = [...GENERAL_TOOLS, ...PLANNER_TOOLS, ...CALENDAR_TOOLS, ...MEMORY_TOOLS];
      break;
    case "calendar":
      tools = [...GENERAL_TOOLS, ...CALENDAR_TOOLS];
      break;
    case "coach":
      tools = [...GENERAL_TOOLS, ...ANALYTICS_TOOLS, ...MEMORY_TOOLS];
      break;
    case "analyst":
      tools = [...GENERAL_TOOLS, ...ANALYTICS_TOOLS];
      break;
    default:
      tools = [...GENERAL_TOOLS];
  }

  const handoffTool = getHandoffTool(agent);
  if (handoffTool) {
    tools.push(handoffTool);
  }

  return tools;
}

