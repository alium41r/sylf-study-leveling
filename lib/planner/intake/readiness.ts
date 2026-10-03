import {
  flattenScope,
  type CoreRequirementCode,
  type PlanBriefV1,
  type ReadinessState,
} from "./brief";

/**
 * Deterministic readiness: can this brief produce a first draft, and what is
 * still genuinely missing?
 *
 * Three rules make this trustworthy:
 *
 * 1. **The server owns it.** The brief carries a readiness field for display, but
 *    this function is the only thing that computes it, and the generate action
 *    re-derives it server-side rather than trusting what the client sent.
 * 2. **The model never decides.** Readiness is a function of the brief and the
 *    account's schedule, not of anything a provider returned.
 * 3. **Optional refinement is not a deficiency.** A brief that can generate is
 *    reported as `ADVANCED_REFINEMENT_AVAILABLE` when optional detail exists, with
 *    `canGenerate: true` — the UI offers "Fine-tune first", never a warning.
 */

export const REFINEMENT_CODES = [
  /** No per-weekday detail; the weekly pattern is the whole answer. */
  "DAILY_AVAILABILITY",
  /** Some units have no stated preparedness. */
  "PREPAREDNESS",
  /** No priorities or scope-size signals were given. */
  "PRIORITY",
  /** No hard or soft constraints were set. */
  "CONSTRAINTS",
  /** The recovery reserve is still at the mode default. */
  "RESERVE",
  /** No background curriculum was recorded. */
  "BACKGROUND_CURRICULUM",
  /** Mode-specific detail is still at its defaults (mock, check, depth). */
  "MODE_DETAILS",
] as const;
export type RefinementCode = (typeof REFINEMENT_CODES)[number];

export interface ReadinessContext {
  /**
   * The weekly figure implied by the student's own Sylf schedule, when the account
   * can produce one. Used only to satisfy the capacity requirement for
   * "use my normal schedule" — it is never written into the brief as a statement.
   */
  scheduleWeeklyMinutes?: number | null;
  /** Phase 2+: a candidate scope exists from research but is not confirmed. */
  scopeCandidateAwaitingConfirmation?: boolean;
  /** Phase 2+: scope research could be attempted for this goal. */
  researchAvailable?: boolean;
}

export interface ReadinessResult {
  state: ReadinessState;
  /** Empty when the brief is ready. Closed codes, in a stable order. */
  missing: CoreRequirementCode[];
  /** True in READY_FOR_DRAFT and ADVANCED_REFINEMENT_AVAILABLE. */
  canGenerate: boolean;
  /** Optional detail that exists to offer, never a requirement. */
  refinements: RefinementCode[];
  /** One short sentence for a live region; no academic content beyond counts. */
  summary: string;
}

/** Does the brief carry a capacity statement of any kind? */
function hasCapacity(brief: PlanBriefV1, context: ReadinessContext): boolean {
  if (brief.budget.weeklyMinutes !== null && brief.budget.weeklyMinutes > 0) return true;
  if (brief.budget.dailyOverrides?.some((value) => value !== null && value > 0)) return true;
  return Boolean(context.scheduleWeeklyMinutes && context.scheduleWeeklyMinutes > 0);
}

/** Is the scope confirmed rather than a candidate awaiting review? */
function scopeConfirmed(brief: PlanBriefV1): boolean {
  if (brief.scope.source === "USER_MANUAL" || brief.scope.source === "SYLF_SUBJECT") return true;
  // Researched and imported scopes only count once the student confirmed them.
  return brief.scope.confirmedAt !== null;
}

const MODE_MINIMUM = {
  EXAM: ["goal", "scope", "targetDate", "capacity"],
  ROADMAP: ["goal", "scope", "targetDate", "capacity"],
  MASTERY: ["goal", "scope", "targetDate", "capacity"],
} as const;

export function briefReadiness(
  brief: PlanBriefV1,
  context: ReadinessContext = {}
): ReadinessResult {
  const units = flattenScope(brief.scope.nodes).units;
  const missing: CoreRequirementCode[] = [];
  const required = MODE_MINIMUM[brief.mode];

  if (required.includes("goal") && !brief.goal.title.trim()) missing.push("GOAL_MISSING");
  /**
   * A researched or imported candidate outranks "nothing here yet".
   *
   * If Sylf has found a scope and the student has not confirmed it, the useful next
   * action is to review it — reporting `SCOPE_MISSING` would send them back to typing
   * what is already sitting in front of them. A candidate beside an *already confirmed*
   * scope is a different case: it is an offer, so it does not block or nag.
   */
  const candidateAwaitingDecision =
    brief.scopeCandidate !== null && brief.scopeCandidate.nodes.length > 0 && units.length === 0;
  if (required.includes("scope") && candidateAwaitingDecision) missing.push("SCOPE_UNCONFIRMED");
  else if (required.includes("scope") && units.length === 0) missing.push("SCOPE_MISSING");
  else if (required.includes("scope") && !scopeConfirmed(brief))
    missing.push("SCOPE_UNCONFIRMED");
  if (required.includes("targetDate") && !brief.target.endDate) missing.push("TARGET_DATE_MISSING");
  if (brief.mode === "EXAM" && brief.target.endDate && !brief.target.examDate)
    missing.push("TARGET_DATE_MISSING");
  if (required.includes("capacity") && !hasCapacity(brief, context)) missing.push("CAPACITY_MISSING");

  const refinements = refinementCodes(brief, units.length);
  const canGenerate = missing.length === 0;

  // A candidate scope awaiting review outranks the generic "needs info" state: the
  // student has something to look at, and that is the action to offer.
  let state: ReadinessState;
  if (missing.includes("SCOPE_UNCONFIRMED")) state = "NEEDS_SCOPE_CONFIRMATION";
  else if (missing.length) {
    state =
      context.researchAvailable && missing.includes("SCOPE_MISSING")
        ? "RESEARCH_AVAILABLE"
        : "NEEDS_CORE_INFO";
  } else {
    state = refinements.length ? "ADVANCED_REFINEMENT_AVAILABLE" : "READY_FOR_DRAFT";
  }

  return { state, missing, canGenerate, refinements, summary: summarise(state, missing, units.length) };
}

/**
 * What optional detail could still be offered.
 *
 * Deliberately generous: any of these makes the state
 * `ADVANCED_REFINEMENT_AVAILABLE` while leaving `canGenerate` true, because the
 * affordance is an offer, not a deficiency.
 */
function refinementCodes(brief: PlanBriefV1, unitCount: number): RefinementCode[] {
  const codes: RefinementCode[] = [];
  if (!brief.budget.dailyOverrides) codes.push("DAILY_AVAILABILITY");
  if (brief.preparedness.length < unitCount) codes.push("PREPAREDNESS");
  if (!brief.preparedness.some((entry) => entry.priority && entry.priority !== "NEUTRAL"))
    codes.push("PRIORITY");
  if (!brief.constraints.length) codes.push("CONSTRAINTS");
  if (brief.budget.recoveryPercent === null) codes.push("RESERVE");
  if (!brief.backgroundCurriculum) codes.push("BACKGROUND_CURRICULUM");
  return codes;
}

function summarise(
  state: ReadinessState,
  missing: readonly CoreRequirementCode[],
  unitCount: number
): string {
  switch (state) {
    case "READY_FOR_DRAFT":
      return `Ready to draft, with ${unitCount} unit${unitCount === 1 ? "" : "s"}.`;
    case "ADVANCED_REFINEMENT_AVAILABLE":
      return `Enough for a first draft, with ${unitCount} unit${unitCount === 1 ? "" : "s"}. Optional detail is available if you want it.`;
    case "NEEDS_SCOPE_CONFIRMATION":
      return "A scope is waiting for your review.";
    case "RESEARCH_AVAILABLE":
      return "Nothing is missing that Sylf cannot look up — you can enter the scope yourself or have Sylf find it.";
    default:
      return missing.length === 1
        ? "One essential is still missing."
        : `${missing.length} essentials are still missing.`;
  }
}

/**
 * The server-side gate for generation.
 *
 * Returns the codes rather than throwing so the route can answer with a structured
 * 422 the UI can act on, and so the same function serves both the client's live
 * display and the server's authoritative check.
 */
export function assertCanGenerate(
  brief: PlanBriefV1,
  context: ReadinessContext = {}
): ReadinessResult {
  return briefReadiness(brief, context);
}
