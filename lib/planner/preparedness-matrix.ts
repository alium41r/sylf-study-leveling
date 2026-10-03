import {
  isConfidenceStated,
  isPreparednessStated,
  type PreparednessFields,
} from "./preparedness";

/**
 * The fast preparedness matrix, expressed as a mapping onto the contract that already
 * exists rather than as a second vocabulary.
 *
 * The Phase 1 preparedness contract is three nullable fields, and `null` means
 * *unstated* — never weak, never secure (see `lib/planner/preparedness.ts`, which is
 * the only place any rule reads them). A matrix of one-click states is a *view* of that
 * contract: every state below maps to real values of those three fields, and the
 * reverse mapping renders whatever the brief actually holds, including values the
 * matrix cannot produce.
 *
 * Two properties are load-bearing:
 *
 * - **No confidence is invented.** "Studied, not rated" is `covered: true,
 *   confidence: null` and is a first-class state, because a student who knows a topic
 *   was taught but does not want to rate it must not be forced to pick a number.
 * - **No state is unreachable.** Coverage can be stated without a confidence and a
 *   confidence can be stated without coverage (Advanced setup allows both). The reverse
 *   mapping returns `null` for those, and the surface says so instead of snapping the
 *   student's answer to the nearest button.
 */

export const PREPAREDNESS_MATRIX_STATES = [
  "UNKNOWN",
  "NOT_STUDIED",
  "STUDIED_UNRATED",
  "WEAK",
  "OKAY",
  "STRONG",
] as const;
export type PreparednessMatrixState = (typeof PREPAREDNESS_MATRIX_STATES)[number];

/**
 * The values each one-click state writes.
 *
 * `difficult` and `priority` are deliberately absent: they are separate, deliberate
 * answers (see the matrix's own `difficult` column and the existing `setPriority`
 * action), so choosing a preparedness state never changes them.
 *
 * The confidence numbers are the existing 1–5 scale, chosen so the established policy
 * reads them the way it already does: `isWeak` is `<= 2` and `isSecure` is `>= 4`, so
 * WEAK is weak, STRONG is secure, and OKAY is neither. 4 remains reachable through
 * Advanced setup and is rendered as STRONG here rather than being flattened away.
 */
export const MATRIX_STATE_VALUES: Record<
  PreparednessMatrixState,
  { covered: boolean | null; confidence: number | null }
> = {
  UNKNOWN: { covered: null, confidence: null },
  NOT_STUDIED: { covered: false, confidence: null },
  STUDIED_UNRATED: { covered: true, confidence: null },
  WEAK: { covered: true, confidence: 2 },
  OKAY: { covered: true, confidence: 3 },
  STRONG: { covered: true, confidence: 5 },
};

export const MATRIX_STATE_LABEL: Record<PreparednessMatrixState, string> = {
  UNKNOWN: "Not rated",
  NOT_STUDIED: "Not studied",
  STUDIED_UNRATED: "Studied, not rated",
  WEAK: "Weak",
  OKAY: "Okay",
  STRONG: "Strong",
};

/** The sentence each state's one-click answer implies, in the student's own terms. */
export const MATRIX_STATE_MEANING: Record<PreparednessMatrixState, string> = {
  UNKNOWN: "Sylf plans as if it does not know: it teaches the unit and assumes nothing.",
  NOT_STUDIED: "Nothing has been studied here yet, so the plan owes this unit its learning step.",
  STUDIED_UNRATED: "You have covered this, but you have not rated how confident you feel.",
  WEAK: "Covered, and it feels shaky — the plan gives this unit more room and a mistake review.",
  OKAY: "Covered, and it feels reasonable.",
  STRONG: "Covered and confident, so the plan spends less time re-teaching it.",
};

/** One row's rendered state: a matrix state, or `null` when the brief holds something else. */
export function matrixStateOf(entry: PreparednessFields | undefined): PreparednessMatrixState | null {
  if (!entry || !isPreparednessStated(entry)) return "UNKNOWN";
  const confidence = isConfidenceStated(entry) ? (entry.confidence as number) : null;
  if (entry.covered === false) return "NOT_STUDIED";
  if (entry.covered === true) {
    if (confidence === null) return "STUDIED_UNRATED";
    return confidence <= 2 ? "WEAK" : confidence === 3 ? "OKAY" : "STRONG";
  }
  // A confidence with no coverage statement. Reachable through Advanced setup, and
  // snapping it to a button here would silently change the student's answer.
  return null;
}

/** The values a state writes, as a partial preparedness patch. */
export function matrixPatch(
  state: PreparednessMatrixState
): { covered: boolean | null; confidence: number | null } {
  return { ...MATRIX_STATE_VALUES[state] };
}

/**
 * Bulk actions, as a closed vocabulary.
 *
 * Each one maps onto the same patch a single click would write, applied to a chosen
 * set of rows — a chapter, a multi-selection, or everything. Nothing here is a new
 * server semantic: the action that carries them is `bulkSetPreparedness`, and the
 * server merges each patch with exactly the same code path as `setPreparedness`.
 * Readiness is untouched by all of them (preparedness is optional), so a bulk action
 * is never a step towards being allowed to generate.
 */
export const MATRIX_BULK_ACTIONS = [
  "SET_UNKNOWN",
  "SET_NOT_STUDIED",
  "SET_STUDIED_UNRATED",
  "SET_WEAK",
  "SET_OKAY",
  "SET_STRONG",
  "MARK_DIFFICULT",
  "CLEAR_DIFFICULT",
  "SET_PRIORITY_HIGH",
  "SET_PRIORITY_LOW",
  "CLEAR_PRIORITY",
  "CLEAR_PREPAREDNESS",
] as const;
export type MatrixBulkAction = (typeof MATRIX_BULK_ACTIONS)[number];

export const MATRIX_BULK_LABEL: Record<MatrixBulkAction, string> = {
  SET_UNKNOWN: "Set to not rated",
  SET_NOT_STUDIED: "Set to not studied",
  SET_STUDIED_UNRATED: "Set to studied, not rated",
  SET_WEAK: "Set to weak",
  SET_OKAY: "Set to okay",
  SET_STRONG: "Set to strong",
  MARK_DIFFICULT: "Mark difficult",
  CLEAR_DIFFICULT: "Clear difficult",
  SET_PRIORITY_HIGH: "Set high priority",
  SET_PRIORITY_LOW: "Set low priority",
  CLEAR_PRIORITY: "Clear priority",
  CLEAR_PREPAREDNESS: "Clear everything (back to not rated)",
};

/**
 * What a bulk action writes.
 *
 * `CLEAR_PREPAREDNESS` is the "reset to Unknown" of the goal: coverage, confidence and
 * the difficult flag all return to unstated, while *priority* is deliberately kept —
 * priority is a separate, deliberate answer that a reset of preparedness has no
 * business discarding (the server enforces the same rule). The `*_PRIORITY` actions are
 * the one way the matrix writes it, and they never touch the other fields.
 */
const BULK_STATE: Partial<Record<MatrixBulkAction, PreparednessMatrixState>> = {
  SET_UNKNOWN: "UNKNOWN",
  SET_NOT_STUDIED: "NOT_STUDIED",
  SET_STUDIED_UNRATED: "STUDIED_UNRATED",
  SET_WEAK: "WEAK",
  SET_OKAY: "OKAY",
  SET_STRONG: "STRONG",
};

export function bulkPatchFor(
  action: MatrixBulkAction
): {
  covered?: boolean | null;
  confidence?: number | null;
  difficult?: boolean | null;
  priority?: "NEUTRAL" | "LOW" | "HIGH";
} {
  if (action === "MARK_DIFFICULT") return { difficult: true };
  if (action === "CLEAR_DIFFICULT") return { difficult: false };
  if (action === "SET_PRIORITY_HIGH") return { priority: "HIGH" };
  if (action === "SET_PRIORITY_LOW") return { priority: "LOW" };
  if (action === "CLEAR_PRIORITY") return { priority: "NEUTRAL" };
  if (action === "CLEAR_PREPAREDNESS")
    return { covered: null, confidence: null, difficult: null };
  const state = BULK_STATE[action];
  return state ? { ...matrixPatch(state) } : {};
}

/** Counts for the matrix header and for telemetry — never labels. */
export function matrixSummary(
  entries: readonly (PreparednessFields & { nodeId: string })[]
): { total: number; rated: number; unrated: number; difficult: number } {
  const rated = entries.filter((entry) => matrixStateOf(entry) !== "UNKNOWN").length;
  return {
    total: entries.length,
    rated,
    unrated: entries.length - rated,
    difficult: entries.filter((entry) => entry.difficult === true).length,
  };
}
