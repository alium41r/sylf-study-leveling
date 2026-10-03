import { z } from "zod";
import {
  DateKeySchema,
  ModeSchema,
  OperationKeySchema,
  UserInputV1Schema,
  type UserInputV1,
} from "../contracts";
import {
  PlannerConstraintKindSchema,
  PlannerQuestionReasonSchema,
  type PlannerQuestionReason,
} from "../constraints";
import {
  BRIEF_LIMITS,
  ScopeNodeSchema,
  type PlanBriefV1,
  type ReadinessState,
} from "./brief";
import { RESEARCH_LIMITS } from "../research/contracts";
import type {
  ComparisonStatus,
  ComparisonUnit,
  OverlapCounts,
} from "../comparison/contracts";
import type { ResearchSource } from "../research/contracts";
import type { PlannerFinding } from "./findings";
import type { ReadinessResult } from "./readiness";

/**
 * The intake wire contract: what a client may ask the intake service to do, and what
 * it gets back.
 *
 * This lives beside the brief rather than inside the server module for one reason:
 * the Quick Plan UI and the server have to agree on these shapes, and they cannot
 * agree through a module that is `server-only`. Everything here is pure data, so the
 * browser can import the types — and, where it helps, the schemas — without pulling
 * any server code with them. The service in `lib/planner/server/intake.ts` enforces
 * them; the client only describes them.
 *
 * Every action carries `schemaVersion`, `expectedVersion` and `actionKey`:
 *
 * - `expectedVersion` is the optimistic-concurrency guard, so two tabs cannot both
 *   win a write;
 * - `actionKey` is idempotency, so a retry after a lost response cannot apply an
 *   additive change (adding scope units) twice.
 */

export const IntakePatchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  brief: z.unknown(),
});
export type IntakePatch = z.infer<typeof IntakePatchSchema>;

const ActionBase = {
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  actionKey: OperationKeySchema,
};

export const IntakeActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...ActionBase, action: z.literal("setGoal"), title: z.string().trim().min(1).max(200), objective: z.string().trim().max(500).optional() }),
  z.strictObject({ ...ActionBase, action: z.literal("setMode"), mode: ModeSchema }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setSubject"),
    subjectId: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(200).nullable(),
  }),
  z.strictObject({ ...ActionBase, action: z.literal("setTargetDate"), endDate: DateKeySchema, examDate: DateKeySchema.optional() }),
  /**
   * The board and level the student is studying under.
   *
   * Not decoration: official-domain discovery is driven by the registry in
   * `lib/study-systems.ts`, so without a board no host can be recognised as official and
   * research can only ever report something weak. `null` clears it.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("setBackground"),
    label: z.string().trim().max(200).nullable(),
    level: z.string().trim().max(60).nullable(),
    board: z.string().trim().max(60).nullable(),
    /** Absent keeps whatever subjects the student already named. */
    subjects: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  }),
  /**
   * The background curriculum, as one statement.
   *
   * Separate from `setBackground` because the two answer different questions: that one
   * is the board/level filter the *target* research uses, and this one is "what did you
   * study before", which is what a comparison is run against. `label: null` clears it.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("setBackgroundCurriculum"),
    label: z.string().trim().max(200).nullable(),
    level: z.string().trim().max(60).nullable(),
    board: z.string().trim().max(60).nullable(),
    subjects: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  }),
  z.strictObject({ ...ActionBase, action: z.literal("setWeeklyBudget"), weeklyMinutes: z.number().int().min(0).max(10080).nullable() }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setDailyOverrides"),
    dailyOverrides: z.array(z.number().int().min(0).max(720).nullable()).length(7).nullable(),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("markUnavailableDay"),
    date: DateKeySchema.optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    unavailable: z.boolean(),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setRecoveryReserve"),
    recoveryPercent: z.number().int().min(0).max(50),
    acceptReducedReserve: z.boolean().optional(),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("updateScopeUnits"),
    add: z.array(ScopeNodeSchema).max(BRIEF_LIMITS.scopeNodes).optional(),
    remove: z.array(z.string().min(1).max(60)).max(BRIEF_LIMITS.scopeNodes).optional(),
    rename: z.array(z.strictObject({ nodeId: z.string().max(60), label: z.string().trim().min(1).max(200) })).max(BRIEF_LIMITS.scopeNodes).optional(),
    select: z.array(z.strictObject({ nodeId: z.string().max(60), selected: z.boolean() })).max(BRIEF_LIMITS.scopeNodes).optional(),
    move: z.array(z.strictObject({ nodeId: z.string().max(60), parentId: z.string().max(60).nullable() })).max(BRIEF_LIMITS.scopeNodes).optional(),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setPreparedness"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes),
    covered: z.boolean().nullable().optional(),
    confidence: z.number().int().min(1).max(5).nullable().optional(),
    difficult: z.boolean().nullable().optional(),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setPriority"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes),
    priority: z.enum(["NEUTRAL", "LOW", "HIGH"]),
    prioritySource: z.enum(["USER_EXPLICIT", "USER_ASSESSMENT_WEIGHTING", "USER_TEACHER_EMPHASIS", "USER_MUST_COVER"]),
  }),
  z.strictObject({
    ...ActionBase,
    action: z.literal("setConstraint"),
    /** `null` removes every constraint of that kind. */
    kind: PlannerConstraintKindSchema,
    strength: z.enum(["HARD", "SOFT"]),
    value: z.number().finite(),
    preferenceWeight: z.number().int().min(0).max(5).optional(),
    remove: z.boolean().optional(),
  }),
  z.strictObject({ ...ActionBase, action: z.literal("answerSmartQuestion"), reasonCode: PlannerQuestionReasonSchema, value: z.string().max(120) }),
  /**
   * Confirm a scope candidate.
   *
   * `nodeIds` is the student's decision, not a suggestion: whatever they send becomes
   * the confirmed scope. Omitting it confirms the candidate as it stands; sending a
   * subset removes the rest, which is how "Remove selected" works without a second
   * action or a second round trip.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("confirmScope"),
    /** Absent means "all of the candidate, in order". */
    nodeIds: z.array(z.string().min(1).max(60)).max(BRIEF_LIMITS.scopeNodes).optional(),
    /** The candidate this decision is about, so a stale decision cannot be replayed. */
    candidateRetrievedAt: z.string().max(40).optional(),
    /** Labels the student corrected while reviewing; their wording wins over the source. */
    renames: z
      .array(z.strictObject({ nodeId: z.string().min(1).max(60), label: z.string().trim().min(1).max(200) }))
      .max(BRIEF_LIMITS.scopeNodes)
      .optional(),
    /** Units the student added because the source did not list them. */
    additions: z.array(ScopeNodeSchema).max(BRIEF_LIMITS.scopeNodes).optional(),
  }),
  z.strictObject({ ...ActionBase, action: z.literal("discardScopeCandidate") }),
  /** "Use only what I give you" — persists, so nothing searches on a later mount. */
  z.strictObject({
    ...ActionBase,
    action: z.literal("setScopeResearchPolicy"),
    policy: z.enum(["ALLOW", "OFF"]),
  }),
  z.strictObject({ ...ActionBase, action: z.literal("requestGeneration") }),
  z.strictObject({ ...ActionBase, action: z.literal("bindPlan"), requestKey: OperationKeySchema }),
  /**
   * Run grounded research for the current brief. Research is never automatic: this
   * action exists so the only way it happens is a deliberate request.
   */
  z.strictObject({ ...ActionBase, action: z.literal("researchScope") }),
  /**
   * Import a scope from text the student already has: a pasted outline, or text
   * extracted from a document by the import route. The route produces the candidate;
   * this action records text-only imports.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("importScope"),
    text: z.string().trim().min(1).max(RESEARCH_LIMITS.pastedChars),
    /** Where the text came from, for provenance and for honest copy. */
    origin: z.enum(["PASTE", "DOCUMENT"]),
    sourceTitle: z.string().trim().max(300).nullable().optional(),
  }),
  /**
   * Compare the confirmed target with the student's background curriculum.
   *
   * Produces a *comparison*, never a preparedness value: overlap is display-only data
   * that cannot reach the engine. `force` re-runs even when a reusable result is stored.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("compareCurricula"),
    force: z.boolean().optional(),
  }),
  /**
   * The student's own answer about one unit's overlap.
   *
   * Their correction outranks Sylf's comparison for planning purposes and is preserved
   * across re-runs: the stored comparison keeps what Sylf said, and the correction is
   * layered on top. `overlap` is the same closed four-state vocabulary.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("setOverlapCorrection"),
    unitRef: z.string().min(1).max(60),
    overlap: z.enum([
      "LIKELY_COVERED_BY_CURRICULUM",
      "PARTIAL_OVERLAP",
      "LIKELY_NEW_TO_CURRICULUM",
      "UNCLEAR",
    ]),
    /** Clears the correction, returning the unit to Sylf's own classification. */
    clear: z.boolean().optional(),
  }),
  /**
   * Bulk preparedness, for a chapter, a multi-selection, or everything.
   *
   * One action rather than one per row: the matrix's whole point is that forty units
   * are answered in a few clicks, and forty round trips would defeat it. The state
   * vocabulary is the matrix's, mapped onto the existing nullable contract — no new
   * preparedness semantics exist on the server.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("bulkSetPreparedness"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes),
    state: z.enum(["UNKNOWN", "NOT_STUDIED", "STUDIED_UNRATED", "WEAK", "OKAY", "STRONG"]),
    /** Keep priority and the difficult flag while replacing coverage and confidence. */
    keepDifficult: z.boolean().optional(),
  }),
  /** Mark or clear "difficult" for a set of units, independently of preparedness. */
  z.strictObject({
    ...ActionBase,
    action: z.literal("setDifficulty"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes),
    difficult: z.boolean(),
  }),
  /** Clear everything Sylf knows about a set of units, back to "not rated". */
  z.strictObject({
    ...ActionBase,
    action: z.literal("clearPreparedness"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes),
  }),
  /**
   * Accept "studied, confidence not rated" for units the comparison actually placed in
   * the background curriculum.
   *
   * The server re-derives the eligible set from the stored comparison and refuses any
   * unit outside it, so accepting a suggestion can never become a blanket rating and
   * can never write a confidence the student did not give.
   */
  z.strictObject({
    ...ActionBase,
    action: z.literal("applyCoverageSuggestion"),
    nodeIds: z.array(z.string().min(1).max(60)).min(1).max(BRIEF_LIMITS.scopeNodes).optional(),
  }),
]);
export type IntakeAction = z.infer<typeof IntakeActionSchema>;

/** Actions the service implements; anything else answers `NOT_AVAILABLE`. */
export const IMPLEMENTED_ACTIONS = [
  "setGoal",
  "setMode",
  "setSubject",
  "setTargetDate",
  "setBackground",
  "setWeeklyBudget",
  "setDailyOverrides",
  "markUnavailableDay",
  "setRecoveryReserve",
  "updateScopeUnits",
  "setPreparedness",
  "setPriority",
  "setConstraint",
  "answerSmartQuestion",
  "confirmScope",
  "discardScopeCandidate",
  "setScopeResearchPolicy",
  "requestGeneration",
  "bindPlan",
  // Phase 2: research and import produce candidates; confirmation applies them.
  "researchScope",
  "importScope",
  // Phase 3: curriculum comparison, fast preparedness and bulk editing.
  "setBackgroundCurriculum",
  "compareCurricula",
  "setOverlapCorrection",
  "bulkSetPreparedness",
  "setDifficulty",
  "clearPreparedness",
  "applyCoverageSuggestion",
] as const;

/** Kept as an alias so Phase 1 callers and tests keep compiling unchanged. */
export const PHASE_ONE_ACTIONS = IMPLEMENTED_ACTIONS;

/** What a generation request hands to the existing generate route. */
export interface IntakeGeneration {
  /** Stable key derived from the session, so a retry is idempotent downstream too. */
  requestKey: string;
  input: UserInputV1;
}

export const IntakeGenerationSchema = z.strictObject({
  requestKey: OperationKeySchema,
  input: UserInputV1Schema,
});

/** The session as the client sees it: brief, readiness and the computed schedule. */
export interface IntakeView {
  id: string;
  mode: PlanBriefV1["mode"];
  version: number;
  expiresAt: string;
  planId: string | null;
  brief: PlanBriefV1;
  readiness: ReadinessResult;
  summary: {
    units: number;
    leaves: number;
    strategy: "TOPIC_UNITS" | "CHAPTER_UNITS" | "SEGMENTED";
    segments: number;
    preparednessStated: number;
    coverageStated: number;
    confidenceStated: number;
    constraints: number;
    unresolved: number;
  };
  /** Smart Setup questions the brief currently justifies — 0 to 3, never invented. */
  questions: {
    reasonCode: PlannerQuestionReason;
    prompt: string;
    whyItMatters: string;
    /** `value` is what the answer action sends; `label` is what the student reads. */
    options: readonly { value: string; label: string }[];
  }[];
  /** The account's rest weekdays, as the server reads them. */
  restWeekdays: number[];
  /**
   * The weekly figure the account's own Sylf schedule implies, or null when the
   * account has no daily goal. Used to satisfy "use my normal schedule" without
   * writing a number the student never stated.
   */
  scheduleWeeklyMinutes: number | null;
  /**
   * The hard limits the engine will enforce, read from the same helpers it uses.
   * `null` means the student has not stated one, not that it is zero.
   */
  limits: {
    sessionLimitMinutes: number | null;
    weeklyLimitMinutes: number | null;
    unavailableWeekdays: number[];
  };
  /**
   * The finding envelope: `warnings` may be acknowledged by the student and carried
   * into the next step, `blockers` may not be acknowledged at all. Empty lists mean
   * nothing to report, never "not checked".
   */
  ok: boolean;
  findings: PlannerFinding[];
  warnings: PlannerFinding[];
  blockers: PlannerFinding[];
  accepted: string[];
  /** Present only on a `requestGeneration` action. */
  generation?: IntakeGeneration;
  /**
   * The curriculum comparison, already resolved for display.
   *
   * The server computes staleness, applies the student's corrections and picks out the
   * units a coverage suggestion could apply to, so the surface never re-derives a rule
   * and two clients cannot disagree about one. `units` are in uncertainty-first review
   * order; `sources` are the comparison's own provenance, classified by the same code
   * the scope panel uses.
   */
  comparison: IntakeComparisonView;
}

/** The comparison, as the surface sees it. */
export interface IntakeComparisonView {
  /** Whether comparison can run at all now — never a gate on anything else. */
  available: boolean;
  unavailableReason: string | null;
  state: "NOT_RUN" | "READY" | "STALE" | "UNAVAILABLE";
  status: ComparisonStatus;
  /** True when a stored result no longer matches the scope or the background. */
  stale: boolean;
  units: ComparisonUnit[];
  sources: ResearchSource[];
  unresolved: string[];
  summary: string;
  counts: OverlapCounts;
  /** Units the student corrected, so the surface can say so per row. */
  correctedRefs: string[];
  /** Corrections retired because the scope changed materially under them. */
  retiredCorrections: number;
  /** Units "studied, confidence not rated" may be applied to, by explicit action. */
  suggestionRefs: string[];
  backgroundLabel: string | null;
  createdAt: string | null;
  providerVersion: string;
}

/**
 * The comparison view for a brief that has none.
 *
 * Exported because "no comparison yet" is a legitimate state of the contract rather
 * than an absence of one: the server builds every response from this shape, and a
 * fixture that omits it would be describing an intake view this version cannot send.
 */
export function emptyComparisonView(
  over: Partial<IntakeComparisonView> = {}
): IntakeComparisonView {
  return {
    available: false,
    unavailableReason: null,
    state: "NOT_RUN",
    status: "UNAVAILABLE",
    stale: false,
    units: [],
    sources: [],
    unresolved: [],
    summary: "",
    counts: { covered: 0, partial: 0, isNew: 0, unclear: 0, total: 0 },
    correctedRefs: [],
    retiredCorrections: 0,
    suggestionRefs: [],
    backgroundLabel: null,
    createdAt: null,
    providerVersion: "",
    ...over,
  };
}

/** Bounded mirror of the brief the client keeps for fast restoration after refresh. */
export interface IntakeMirror {
  id: string;
  mode: PlanBriefV1["mode"];
  version: number;
  readiness: ReadinessState;
  expiresAt: string;
}
