// ============================================================
// Intent Signals — synonym groups + glue vocabulary
// ============================================================
// Each deterministic capability is defined by SIGNAL groups, not
// hardcoded sentences. The matcher tokenizes the normalized message
// (longest phrase first) and an intent matches when ALL its required
// groups are present, none of its excluded groups are present, and
// every remaining token is glue, a number, or a parameter.
// ============================================================

export interface SignalGroup {
  id: string;
  /** Multi-word terms must come first within a group for phrase tokenization. */
  terms: string[];
}

export const SIGNAL_GROUPS: SignalGroup[] = [
  {
    id: "XP",
    terms: [
      "experience points",
      "experience",
      "exp",
      "xp",
      "earned",
      "gained",
      "earn",
      "gain",
      "received",
      "accumulated",
      "accumulate",
    ],
  },
  {
    id: "XP_NEED",
    terms: [
      "next level",
      "level up",
      "to level up",
      "until i level up",
      "before i level up",
      "how far",
      "how much more",
      "needed",
      "remaining",
      "need",
      "left",
    ],
  },
  { id: "LEVEL", terms: ["level", "levels", "tier"] },
  { id: "HP", terms: ["health points", "hit points", "health", "hp"] },
  { id: "SYLPH", terms: ["sylph balance", "sylph", "sylphs", "currency", "coins"] },
  { id: "STREAK", terms: ["weekly streak", "week streak", "streak"] },
  { id: "RANK", terms: ["hunter rank", "rank", "grade"] },
  { id: "NAME", terms: ["user name", "username", "name", "handle"] },
  {
    id: "STUDY",
    terms: [
      "study minutes",
      "study hours",
      "study time",
      "focus time",
      "focus session",
      "time spent",
      "spent studying",
      "been studying",
      "time studying",
      "study duration",
      "studied for",
      "studied",
      "studying",
      "study",
      "studies",
      "focused",
      "hours",
      "minutes",
      "duration",
    ],
  },
  {
    id: "QUESTS",
    terms: [
      "quest board",
      "quests",
      "quest",
      "tasks",
      "task",
      "missions",
      "mission",
      "schedule",
      "plate",
      "to do",
      "due",
      "pending",
    ],
  },
  { id: "GOALS", terms: ["goal progress", "goals", "goal", "objectives", "objective", "targets", "target"] },
  { id: "SUBJECTS", terms: ["subjects", "subject", "classes", "class", "courses", "course", "am i studying", "i am studying", "am i taking"] },
  { id: "TIMEZONE", terms: ["time zone", "timezone", "zone"] },
  {
    id: "SESSIONS",
    terms: ["study sessions", "session history", "study history", "session summary", "study session"],
  },
  {
    id: "WEEKLY_TARGET",
    terms: ["weekly quest", "weekly target", "weekly goal", "weekly progress", "3 hour target", "180 min target", "progress"],
  },
  {
    id: "TIME_TODAY",
    terms: ["so far today", "so far", "right now", "since midnight", "today", "currently", "now", "this day"],
  },
  { id: "TIME_YESTERDAY", terms: ["yesterday"] },
  { id: "TIME_TOMORROW", terms: ["tomorrow"] },
  { id: "TIME_WEEK", terms: ["this week so far", "this week", "last 7 days"] },
  { id: "TIME_MONTH", terms: ["this month so far", "this month"] },
  { id: "TOTAL", terms: ["all time", "in total", "altogether", "overall", "total"] },
  { id: "JOIN", terms: ["sign up", "signed up", "joined", "join", "account age", "member for", "created my account"] },
  {
    id: "LAST_STUDY",
    terms: ["last study session", "last session", "last studied", "last time i studied", "last study"],
  },
  { id: "DATE", terms: ["day of the week", "date", "day"] },
  { id: "TIME", terms: ["current time", "clock", "hour", "time"] },
  { id: "WHO_AM_I", terms: ["who am i"] },
];

/** Single-word signal lookups derived from the groups above. */
export const WORD_SIGNALS: Record<string, string> = {};
export const PHRASES: Array<{ phrase: string; group: string }> = [];
{
  for (const group of SIGNAL_GROUPS) {
    for (const term of group.terms) {
      if (term.includes(" ")) {
        PHRASES.push({ phrase: term, group: group.id });
      } else {
        WORD_SIGNALS[term] = group.id;
      }
    }
  }
  PHRASES.sort((a, b) => b.phrase.split(" ").length - a.phrase.split(" ").length);
}

/**
 * Tokens that never carry intent on their own and are safe to ignore
 * once signals have matched. Deliberately ABSENT: "doing", "why",
 * "how am i", "change", "mean" — those keep ambiguous queries out of
 * the deterministic engine.
 */
export const GLUE_WORDS = new Set([
  "what", "whats", "is", "are", "was", "were", "be",
  "my", "mine", "me", "i", "am",
  "do", "did", "does", "have", "has", "had", "got", "get", "been",
  "how", "much", "many", "long", "which", "where", "when", "who", "whose",
  "on", "in", "at", "of", "for", "to", "from", "with", "the", "a", "an",
  "it", "its", "up", "any", "some", "this", "that", "your", "you",
  "tell", "show", "give", "know", "knows", "can", "could", "would", "will",
  "please", "going", "go", "current", "terms", "as", "if", "all",
  "spent", "spend", "let", "us", "see", "check", "checking", "look", "looking",
  "out", "about", "into", "far", "there", "here", "still", "already",
  "per", "every", "each", "day", "week", "month", "since", "ago", "until",
]);
