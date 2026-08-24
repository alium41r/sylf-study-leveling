// ============================================================
// Page Presence — where The System's quick AI entry appears
// ============================================================
// The lightweight AI access point is NOT rendered on every page.
// Each entry here is a deliberate decision: these pages contain
// data the AI can genuinely act on (schedules, goals, quests,
// progress). Visual, social and configuration pages stay focused
// and uncluttered — the dedicated /system workspace is always
// one click away in the sidebar.
// ============================================================

export type PresenceIcon = "command" | "calendar" | "target" | "scroll";

export interface PagePresence {
  /** Stable id — used to detect context changes. */
  id: string;
  /** Short label shown on the floating trigger and overlay header. */
  label: string;
  /** Longer eyebrow describing what the AI can do here. */
  eyebrow: string;
  /** One-line greeting shown when the overlay opens with no history. */
  greeting: string;
  /** Contextual quick prompts surfaced above the composer. */
  suggestions: string[];
  /** When set, the Planner quick action is offered in this context. */
  plannerHint?: string;
  icon: PresenceIcon;
}

const PRESENCE: Record<string, PagePresence> = {
  command: {
    id: "command",
    label: "Command Center",
    eyebrow: "PROGRESS & BRIEFING ASSIST",
    greeting:
      "Greetings, Scholar. I can see the full picture of your progress — ask me for today's briefing, what to focus on next, or anything about your rank, quests and weekly target.",
    suggestions: [
      "Give me today's briefing",
      "What should I focus on next?",
      "How is my weekly quest going?",
      "Where am I struggling lately?",
    ],
    plannerHint: "Generate a study plan from your progress",
    icon: "command",
  },
  calendar: {
    id: "calendar",
    label: "Calendar",
    eyebrow: "SCHEDULING ASSIST",
    greeting:
      "I have your schedule in view. Ask me about your week, overloaded days, or where a new study block could fit — or have me help you plan ahead.",
    suggestions: [
      "What does my week look like?",
      "Am I overloaded this week?",
      "Help me reschedule my overdue quests",
      "Where can I fit a 90-minute study block?",
    ],
    plannerHint: "Build a study plan around your calendar",
    icon: "calendar",
  },
  objectives: {
    id: "objectives",
    label: "Objectives",
    eyebrow: "GOALS & PLANNING ASSIST",
    greeting:
      "I can see your goals and their progress. Ask me for a progress summary, to create a new goal, or which objective needs your attention first.",
    suggestions: [
      "Summarize my goal progress",
      "Create a new study goal for Calculus",
      "Which goal needs attention?",
      "What quests do I have today?",
    ],
    plannerHint: "Turn a subject into a full study plan",
    icon: "target",
  },
  quests: {
    id: "quests",
    label: "Quests",
    eyebrow: "QUEST & TASK ASSIST",
    greeting:
      "I have your quest log in view. Ask me what's due, to create a quest for you, or which tasks you're falling behind on.",
    suggestions: [
      "What quests are due today?",
      "Create a quest to review flashcards tomorrow",
      "Which quests am I behind on?",
      "Reschedule my overdue quests",
    ],
    plannerHint: "Generate quests from a study plan",
    icon: "scroll",
  },
};

/**
 * Resolve whether the quick AI entry appears for a given route.
 * Returns null where the experience stays focused (settings, social,
 * focus, visual pages, and the System workspace itself).
 */
export function resolvePresence(pathname: string, search: string): PagePresence | null {
  if (!pathname) return null;

  switch (pathname) {
    case "/dashboard":
      return PRESENCE.command;
    case "/calendar":
      return PRESENCE.calendar;
    case "/goals": {
      const params = new URLSearchParams(search);
      const tab = params.get("tab");
      if (tab === "quests") return PRESENCE.quests;
      if (tab === "skill-tree") return null; // visual page — stay focused
      return PRESENCE.objectives;
    }
    case "/quests":
      return PRESENCE.quests; // briefly rendered while redirecting to /goals?tab=quests
    default:
      return null;
  }
}
