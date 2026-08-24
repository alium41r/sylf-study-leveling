// ============================================================
// Deterministic Intent Registry
// ============================================================
// The canonical list of what Sylf can answer WITHOUT an LLM. Each
// intent declares the signal groups that must / must not be present,
// which time scopes its executor accepts, and defaults.
//
// Adding a new capability = one intent definition + one executor
// function. No phrase lists. Wording variations collapse into the
// same signals via normalizeMessage + tokenization.
// ============================================================

export type TimeScope =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "total";

export interface IntentParams {
  stat?: string;
  timeScope: TimeScope | null;
}

export interface IntentDef {
  id: string;
  description: string;
  requires: string[];
  /** Any of these present → intent must NOT be selected (ambiguity guard). */
  excludes: string[];
  /** Time scopes this intent understands. Missing → scope must be null. */
  allowedScopes: TimeScope[];
  /** Scopes treated as "no scope" (e.g. "my level right now" ≈ current). */
  neutralScopes?: TimeScope[];
  defaultScope: TimeScope | null;
  /** Representative phrasings used for semantic similarity ranking. */
  examples: string[];
}

const STAT_EXCLUDES = [
  "LEVEL", "HP", "SYLPH", "STREAK", "RANK", "NAME", "STUDY", "QUESTS",
  "GOALS", "SUBJECTS", "TIMEZONE", "JOIN", "LAST_STUDY", "SESSIONS",
  "WEEKLY_TARGET", "DATE", "TIME", "WHO_AM_I",
];

function statIntent(
  id: string,
  description: string,
  signal: string,
  extraExcludes: string[] = [],
  examples: string[] = []
): IntentDef {
  return {
    id,
    description,
    requires: [signal],
    excludes: STAT_EXCLUDES.filter((s) => s !== signal).concat(extraExcludes),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples,
  };
}

export const INTENTS: IntentDef[] = [
  {
    id: "get_user_xp",
    description: "Current or scoped XP (total / earned in a window)",
    requires: ["XP"],
    excludes: STAT_EXCLUDES,
    allowedScopes: ["today", "yesterday", "this_week", "this_month", "total"],
    defaultScope: null, // null → lifetime total (currentXP)
    examples: [
      "whats my xp",
      "how much xp do i have",
      "how much experience have i earned",
      "xp this week",
      "how much xp did i get yesterday",
    ],
  },
  {
    id: "get_xp_to_next_level",
    description: "XP remaining until the next level",
    requires: ["XP_NEED"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "XP"),
    allowedScopes: [],
    defaultScope: null,
    examples: [
      "how much xp do i need",
      "how much more xp until i level up",
      "what xp do i need for the next level",
      "how far am i from the next level",
      "how much xp left to level up",
    ],
  },
  statIntent("get_user_level", "Current level and XP-to-next", "LEVEL", [], [
    "whats my level",
    "what level am i",
    "which level am i on",
    "what is my current level",
    "my level",
  ]),
  statIntent("get_user_hp", "Current HP and max HP", "HP", [], [
    "my hp",
    "how is my health",
    "how much hp do i have",
  ]),
  statIntent("get_user_sylph", "Sylph balance", "SYLPH", [], [
    "how much sylph do i have",
    "sylph balance",
  ]),
  statIntent("get_streak", "Weekly streak length", "STREAK", [], [
    "my streak",
    "whats my weekly streak",
  ]),
  statIntent("get_user_rank", "Hunter rank", "RANK", [], [
    "whats my rank",
    "what rank am i",
  ]),
  statIntent("get_user_name", "Display name / username", "NAME", [], [
    "whats my name",
    "what is my username",
  ]),
  {
    id: "who_am_i",
    description: "Identity summary (name, rank, level)",
    requires: ["WHO_AM_I"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "WHO_AM_I"),
    allowedScopes: [],
    defaultScope: null,
    examples: ["who am i"],
  },
  {
    id: "get_study_time",
    description: "Study time in a scope (today default; yesterday/week/month/total)",
    requires: ["STUDY"],
    // "time" is allowed here ("how much time have i spent studying") but a
    // bare "time" query belongs to get_current_time, which excludes STUDY.
    excludes: STAT_EXCLUDES.filter((s) => s !== "STUDY" && s !== "TIME"),
    allowedScopes: ["today", "yesterday", "this_week", "this_month", "total"],
    defaultScope: "today",
    examples: [
      "how long have i studied today",
      "how much have i studied today",
      "whats my study time today",
      "how many hours have i studied",
      "how much time have i spent studying today",
      "study time this week",
    ],
  },
  {
    id: "get_quests",
    description: "Quest list for a scope (today default; yesterday/tomorrow/week/month)",
    requires: ["QUESTS"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "QUESTS"),
    allowedScopes: ["today", "yesterday", "tomorrow", "this_week", "this_month"],
    defaultScope: "today",
    examples: [
      "what quests do i have",
      "what do i have today",
      "my quests today",
      "any quests due",
      "whats on my schedule today",
    ],
  },
  {
    id: "get_goals",
    description: "Active goals with progress",
    requires: ["GOALS"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "GOALS"),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: ["my goals", "how many goals do i have", "whats my goal progress"],
  },
  {
    id: "get_subjects",
    description: "Enrolled subjects",
    requires: ["SUBJECTS"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "SUBJECTS"),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: ["what subjects do i have", "what am i studying"],
  },
  {
    id: "get_timezone",
    description: "User timezone",
    requires: ["TIMEZONE"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "TIMEZONE"),
    allowedScopes: [],
    defaultScope: null,
    examples: ["what timezone am i in", "my timezone"],
  },
  {
    id: "get_account_age",
    description: "When the account was created",
    requires: ["JOIN"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "JOIN"),
    allowedScopes: [],
    defaultScope: null,
    examples: ["when did i sign up", "when did i join"],
  },
  {
    id: "get_last_session",
    description: "Most recent study session",
    requires: ["LAST_STUDY"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "LAST_STUDY"),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: ["when did i last study", "my last study session"],
  },
  {
    id: "get_session_summary",
    description: "Study-session summary (count, totals, top subject)",
    requires: ["SESSIONS"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "SESSIONS"),
    allowedScopes: ["today", "yesterday", "this_week", "this_month", "total"],
    defaultScope: "total",
    examples: ["tell me about my study sessions", "my study history"],
  },
  {
    id: "get_weekly_target",
    description: "Weekly 3h focus-quest progress",
    requires: ["WEEKLY_TARGET"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "WEEKLY_TARGET"),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: ["weekly quest progress", "hows my weekly target"],
  },
  {
    id: "get_current_time",
    description: "Current local time (user timezone)",
    requires: ["TIME"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "TIME"),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: [
      "what time is it",
      "whats the time",
      "current time",
      "what time is it right now",
      "what does the clock say",
    ],
  },
  {
    id: "get_current_date",
    description: "Today's date and weekday (user timezone)",
    requires: ["DATE"],
    excludes: STAT_EXCLUDES.filter((s) => s !== "DATE").concat(["TIME"]),
    allowedScopes: [],
    neutralScopes: ["today"],
    defaultScope: null,
    examples: ["whats the date", "what day is it today"],
  },
];
