// ============================================================
// Page Presence — where Sylvie's quick AI entry appears
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
  /** Canonical page reference sent with a question; it contains no user data. */
  path: string;
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
    path: "/dashboard",
    label: "Dashboard",
    eyebrow: "OVERVIEW",
    greeting: "What can I help you with?",
    suggestions: [
      "Today's briefing",
      "Next priority",
      "Weekly progress",
      "Bottlenecks",
    ],
    plannerHint: "Generate a study plan from your progress",
    icon: "command",
  },
  calendar: {
    id: "calendar",
    path: "/calendar",
    label: "Calendar",
    eyebrow: "SCHEDULE",
    greeting: "How can I help with your schedule?",
    suggestions: [
      "What’s planned for this day?",
      "How busy is this week?",
      "Find two free hours this weekend",
      "What are my upcoming deadlines?",
    ],
    plannerHint: "Build a study plan around your calendar",
    icon: "calendar",
  },
  objectives: {
    id: "objectives",
    path: "/goals",
    label: "Objectives",
    eyebrow: "GOALS",
    greeting: "How can I help with your goals?",
    suggestions: [
      "Goal progress",
      "Create new goal",
      "Top priority",
      "Today's quests",
    ],
    plannerHint: "Turn a subject into a full study plan",
    icon: "target",
  },
  quests: {
    id: "quests",
    path: "/goals?tab=quests",
    label: "Quests",
    eyebrow: "QUESTS",
    greeting: "How can I help with your tasks?",
    suggestions: [
      "Due today",
      "Create quest",
      "Overdue tasks",
      "Weekly target",
    ],
    plannerHint: "Generate quests from a study plan",
    icon: "scroll",
  },
};

/**
 * Resolve whether the quick AI entry appears for a given route.
 * Returns null where the experience stays focused (settings, social,
 * focus, visual pages, and the Sylvie workspace itself).
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
      return PRESENCE.objectives;
    }
    case "/quests":
      return PRESENCE.quests; // briefly rendered while redirecting to /goals?tab=quests
    default:
      return null;
  }
}
