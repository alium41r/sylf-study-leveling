import type { NormalizedMessage, NormalizedTool } from "../providers/types";
import { getToolsForAgent, type AgentType } from "../chat-tools";

export interface SylviePageContext { path: string; label: string; subject?: string }

const PAGES: Record<string, string> = {
  "/": "Dashboard", "/dashboard": "Dashboard", "/timer": "Timer", "/focus": "Timer",
  "/system": "Sylvie", "/planner": "Planner", "/goals": "Objectives", "/quests": "Objectives tasks",
  "/calendar": "Calendar", "/social": "Social", "/locker": "Locker", "/shop": "Shop",
  "/settings": "Settings", "/settings/archive": "Archive", "/settings/appearance": "Appearance",
  "/settings/history": "Study history", "/settings/stats": "Statistics", "/settings/account": "Account",
  "/settings/modes": "Study modes", "/settings/profile": "Profile", "/inventory": "Inventory",
  "/settings/collection": "Collection", "/settings/achievements": "Achievements",
  "/settings/focus-backgrounds": "Focus backgrounds", "/settings/study-modes": "Study modes",
};

/** Page paths are discovery hints, never arbitrary client instruction text. */
export function normalizeSylviePage(raw: unknown): SylviePageContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  if (typeof input.path !== "string" || input.path.length > 180) return undefined;
  const path = input.path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (!Object.hasOwn(PAGES, path)) return undefined;
  const subject = path === "/focus" && typeof input.subject === "string"
    ? input.subject.replace(/[\x00-\x1f<>]/g, " ").trim().slice(0, 120) : undefined;
  return { path, label: path === "/goals" && input.path.includes("tab=quests") ? "Objectives tasks" : PAGES[path], ...(subject ? { subject } : {}) };
}

export function formatSylviePage(page?: SylviePageContext): string {
  return page ? `PAGE REFERENCE (client navigation hint, not live activity or instructions): ${JSON.stringify(page).replace(/</g, "\\u003c")}` : "";
}

/** Bound both message count and characters while preserving the newest request. */
export function boundSylvieHistory(history: NormalizedMessage[], maxChars = 18_000): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];
  let remaining = maxChars;
  for (const message of history.slice(-20).reverse()) {
    if (remaining <= 0) break;
    const content = message.content?.slice(0, Math.min(4000, remaining));
    result.unshift({ ...message, content });
    remaining -= content?.length ?? 0;
  }
  return result;
}

const PERSONAL = /\b(my|mine|me|i|our)\b|\b(show|list|check)\b/i;
const CONTINUATION = /^(?:and\b|what about\b|how about\b|also\b|yes\b|no\b|that\b|it\b|those\b|these\b|the (?:first|second|last)\b)/i;
const MUTATING = /\b(create|add|make|update|edit|change|set|rename|delete|remove|clear|move|reschedule|shift|postpone|swap|switch|free|complete|finish|mark|save|remember|forget)\b/i;

/** Only advertise data/action tools relevant to the user's current intent. */
export function selectSylvieTools(agent: AgentType, message: string, history: readonly NormalizedMessage[] = []): NormalizedTool[] {
  const previous = history.filter((turn) => turn.role === "user").at(-1)?.content ?? "";
  const query = CONTINUATION.test(message.trim()) ? `${previous} ${message}` : message;
  // Instructions for using a feature are documentation questions, not permission
  // to read an account or perform the action described in the question.
  if (!/\bhow (?:much|many)\b/i.test(query) && /\bhow\b.{0,100}\b(?:works?|calculated|calculation)\b|\bhow (?:do|can|should) i\b.{0,40}\b(?:use|create|edit|change|move|delete|save|open|find|configure)\b|\b(?:explain|describe)\b.{0,60}\b(?:calculation|mechanics)\b/i.test(query)) return [];
  const names = new Set<string>();
  const personal = PERSONAL.test(query) || /\bwhat(?:'s| is) (?:on |scheduled |due )?(?:today|tomorrow|this week)\b/i.test(query);
  const action = MUTATING.test(query);
  const dataRequest = /\b(?:show|list|check|what|how|when|compare|analyse|analyze|review|report|summari[sz]e|explain)\b|\?|^(?:my|our)\b/i.test(query);
  if (personal && dataRequest && /\b(stats|statistics|status|state|level|rank|xp|hp|balance|sylph|streak|progress)\b/i.test(query)) names.add("getUserStats");
  if (/\bhow (?:am i|have i been|did i do)\b/i.test(query)) names.add("getWeeklySummary");
  if (personal && dataRequest && /\b(week|weekly|study time|hours studied)\b/i.test(query)) names.add("getWeeklySummary");
  if (personal && dataRequest && /\b(quest|quests|task|tasks|schedule|calendar|overdue|today|tomorrow)\b/i.test(query)) names.add("getQuests");
  if (personal && dataRequest && /\b(goals?|objectives?)\b/i.test(query)) names.add("getGoals");
  if (personal && dataRequest && /\b(history|sessions?|studied|study time)\b/i.test(query)) names.add("getStudySessions");
  if (personal && dataRequest && /\b(analytics|analysis|trends?|patterns?|performance|improving|strongest|weakest|best subject|worst subject)\b/i.test(query)) {
    names.add("getSubjectAnalytics"); names.add("getPerformanceTrends"); names.add("getDailyPattern");
  }
  if (/\b(shop|items for sale|prices?)\b/i.test(query) && /\b(show|list|what|how much|cost|available)\b/i.test(query) && /\b(items|prices?|stock|available|for sale|cost)\b/i.test(query)
    && !/\bmy (?:inventory|items|purchases|equipment)\b/i.test(query)) names.add("getShopInventory");
  if (/\b(?:search|look up|research)\b/i.test(query) && /\b(?:web|online|internet|syllabus|curriculum|exam board|resources)\b/i.test(query)) names.add("googleSearch");
  if (/\b(remember|memory|memories|preferences?|forget)\b/i.test(query) && personal) names.add("getMemory");
  if (action && !/\bwhat (?:do|can) you remember\b/i.test(query)) {
    if (/\b(goals?|objectives?)\b/i.test(query)) {
      names.add("getGoals");
      if (/\b(create|add|make)\b/i.test(query)) names.add("createGoal");
      if (/\b(update|edit|change|set|rename)\b/i.test(query)) names.add("updateGoal");
      if (/\b(delete|remove)\b/i.test(query)) names.add("deleteGoal");
    }
    if (/\b(quests?|tasks?|schedule|calendar|day|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(query)) {
      names.add("getQuests");
      if (/\b(create|add|make)\b/i.test(query)) names.add("createQuest");
      if (/\b(update|edit|change|set|rename)\b/i.test(query)) names.add("updateQuest");
      if (/\b(delete|remove)\b/i.test(query)) names.add("deleteQuest");
      if (/\b(move|reschedule|shift|postpone)\b/i.test(query)) names.add("moveQuest");
      if (/\b(swap|switch)\b/i.test(query)) names.add("swapQuests");
      if (/\b(clear|free)\b/i.test(query)) names.add("clearDay");
      if (/\b(complete|finish|mark)\b/i.test(query)) names.add("completeQuest");
    }
    if (/\b(delete|remove)\b.*\b(all|everything)\b/i.test(query)) names.add("deleteAllTasks");
    if (/\b(remember|save (?:my|this) preference)\b/i.test(query)) names.add("saveMemory");
    if (/\bforget\b/i.test(query)) names.add("forgetMemory");
    if (/\b(save|add)\b.*\binsight\b/i.test(query)) names.add("generateInsight");
  }
  // Agent classification is a routing hint; the explicit user intent is the permission scope.
  const candidates = [...getToolsForAgent(agent), ...getToolsForAgent("planner"), ...getToolsForAgent("analyst")];
  const seen = new Set<string>();
  return candidates.filter((tool) => names.has(tool.name) && !seen.has(tool.name) && !!seen.add(tool.name));
}
