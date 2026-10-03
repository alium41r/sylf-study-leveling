/**
 * Quest Definition of Done (Addendum §9).
 *
 * Every actionable planner item carries a concise, observable completion
 * condition. The rules are deliberately mechanical so the same check can run on a
 * generated proposal, on a user edit and at confirmation:
 *
 * - bounded length (12–240 characters, at most 40 words);
 * - an observable action or output, not a subjective claim;
 * - no mastery language ("fully understand", "mastered");
 * - no invented official requirements (question counts, mark schemes, grades);
 * - any stated duration must fit the item's own planned minutes.
 *
 * Model text is never trusted for this: `resolveCompletionCriteria` keeps a
 * criterion only when it passes every rule and otherwise substitutes the bounded
 * default for the intent, so a mastery claim can never reach a user or a Quest.
 */
export const COMPLETION_CRITERIA_MIN = 12;
export const COMPLETION_CRITERIA_MAX = 240;
export const COMPLETION_CRITERIA_MAX_WORDS = 40;

export type CompletionCriteriaSource = "MODEL" | "DEFAULT";

export const DEFAULT_COMPLETION_CRITERIA: Record<string, string> = {
  LEARN: "Work through the key ideas, then write a short summary in your own words.",
  REVIEW: "Review your notes, then list the points you could not recall.",
  RECALL: "Recall the core points from memory, then check and correct the gaps.",
  PRACTICE: "Complete one bounded practice set, then review every incorrect step.",
  TIMED_PRACTICE:
    "Complete one timed set within the planned minutes, then review the incorrect steps.",
  MISTAKE_REVIEW: "Re-attempt your recorded errors and confirm each corrected step.",
  MOCK_EXAM:
    "Complete the paper under the planned time limit, then record the main error categories.",
  FINAL_REVIEW: "Recall the main methods from memory, then correct the gaps you find.",
  ASSESS: "Complete the check and record what was correct and what was not.",
  UNDERSTAND: "Explain the main idea in your own words, then note what is still unclear.",
  MASTERY_CHECK:
    "Complete the check unaided, then record what was correct and what was not.",
};
export const FALLBACK_COMPLETION_CRITERIA =
  "Complete the planned work, then record what was finished and what remains.";

/** An observable action or output the student can recognise as finished. */
const OBSERVABLE_ACTIONS = [
  "complete",
  "recall",
  "write",
  "list",
  "review",
  "check",
  "correct",
  "solve",
  "attempt",
  "derive",
  "explain",
  "summarise",
  "summarize",
  "reproduce",
  "compare",
  "mark",
  "record",
  "log",
  "practise",
  "practice",
  "work through",
  "sketch",
  "define",
  "restate",
  "self-test",
  "test",
  "answer",
  "note",
  "identify",
  "confirm",
];

const SUBJECTIVE_MASTERY =
  /\b(fully understand|understand fully|understand completely|master(?:ed|ing)?|be confident|feel confident|know everything|perfect(?:ly)?|guarantee)\b/i;
const INVENTED_REQUIREMENT =
  /\b(marks?|mark scheme|grade [a-e]\b|official|exam board|past papers?|specification requires)\b/i;
const INVENTED_COUNT =
  /\b\d{1,3}\s*(?:questions?|marks?|papers?|problems?|items?|exercises?)\b/i;
const STATED_MINUTES = /\b(\d{1,3})\s*(?:minutes|mins?|min\b)/i;

export interface CompletionCriteriaItem {
  type: string;
  minutes: number;
  completionCriteria?: string;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Returns a stable issue code when the text is not an acceptable completion
 * condition, or null when it is acceptable for this item.
 */
export function completionCriteriaIssue(
  text: string,
  item: { type: string; minutes: number }
): string | null {
  const value = text.trim();
  if (value.length < COMPLETION_CRITERIA_MIN || value.length > COMPLETION_CRITERIA_MAX)
    return "COMPLETION_CRITERIA_LENGTH";
  if (wordCount(value) > COMPLETION_CRITERIA_MAX_WORDS)
    return "COMPLETION_CRITERIA_TOO_LONG";
  if (SUBJECTIVE_MASTERY.test(value)) return "COMPLETION_CRITERIA_SUBJECTIVE";
  if (INVENTED_REQUIREMENT.test(value)) return "COMPLETION_CRITERIA_OFFICIAL_CLAIM";
  if (INVENTED_COUNT.test(value)) return "COMPLETION_CRITERIA_INVENTED_COUNT";
  const minutes = STATED_MINUTES.exec(value);
  if (minutes && Number(minutes[1]) > item.minutes)
    return "COMPLETION_CRITERIA_EXCEEDS_DURATION";
  const lower = value.toLowerCase();
  if (!OBSERVABLE_ACTIONS.some((action) => lower.includes(action)))
    return "COMPLETION_CRITERIA_NOT_OBSERVABLE";
  return null;
}

/**
 * Roadmap milestone outcome (Addendum §10).
 *
 * A milestone is strategic planning metadata, not an executable Quest, so it does
 * NOT get a Quest-style completion condition. It reuses the same quality
 * vocabulary — bounded length, an observable target, no mastery claim and no
 * invented official requirement — minus the item-duration rule, which does not
 * apply to a period.
 */
export const MILESTONE_OUTCOME_MIN = 12;
export const MILESTONE_OUTCOME_MAX = 240;

export function milestoneOutcomeIssue(text: string): string | null {
  const value = text.trim();
  if (value.length < MILESTONE_OUTCOME_MIN || value.length > MILESTONE_OUTCOME_MAX)
    return "MILESTONE_OUTCOME_LENGTH";
  if (wordCount(value) > COMPLETION_CRITERIA_MAX_WORDS)
    return "MILESTONE_OUTCOME_TOO_LONG";
  if (SUBJECTIVE_MASTERY.test(value)) return "MILESTONE_OUTCOME_SUBJECTIVE";
  if (INVENTED_REQUIREMENT.test(value)) return "MILESTONE_OUTCOME_OFFICIAL_CLAIM";
  if (INVENTED_COUNT.test(value)) return "MILESTONE_OUTCOME_INVENTED_COUNT";
  const lower = value.toLowerCase();
  if (!OBSERVABLE_ACTIONS.some((action) => lower.includes(action)))
    return "MILESTONE_OUTCOME_NOT_OBSERVABLE";
  return null;
}

/** Bounded fallback so a milestone always states what finishing it looks like. */
export const MILESTONE_OUTCOME_DEFAULT =
  "Complete the planned topics for this period and note what remains.";

/** Idempotent: a valid outcome re-resolves to itself, anything else is replaced. */
export function resolveMilestoneOutcome(text?: string): string {
  if (text && milestoneOutcomeIssue(text) === null) return text.trim();
  return MILESTONE_OUTCOME_DEFAULT;
}

export function defaultCompletionCriteria(type: string): string {
  return DEFAULT_COMPLETION_CRITERIA[type] ?? FALLBACK_COMPLETION_CRITERIA;
}

export function isValidCompletionCriteria(
  text: string | undefined,
  item: { type: string; minutes: number }
): text is string {
  return Boolean(text) && completionCriteriaIssue(text!, item) === null;
}

/**
 * The single source of truth for the criterion shown to the user and written onto
 * a materialized Quest. Idempotent: a resolved criterion always re-resolves to
 * itself.
 */
export function resolveCompletionCriteria(item: CompletionCriteriaItem): {
  text: string;
  source: CompletionCriteriaSource;
} {
  if (isValidCompletionCriteria(item.completionCriteria, item))
    return { text: item.completionCriteria!.trim(), source: "MODEL" };
  return { text: defaultCompletionCriteria(item.type), source: "DEFAULT" };
}
