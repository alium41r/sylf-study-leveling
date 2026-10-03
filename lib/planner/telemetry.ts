import { CRITIC_STATES, type CriticState } from "./semantic";
import { PlannerQuestionReasonSchema, type PlannerQuestionReason } from "./constraints";
import { REBALANCE_REASONS, type RebalanceReason } from "./rebalance-fields";
import { COPILOT_CLARIFICATION_CODES, COPILOT_ERROR_CODES, COPILOT_INTENTS } from "./copilot/contracts";
import { COPILOT_CONFIRMATION_CODES } from "./copilot/outcomes";

/** Only fixed events, bounded counts and application-issued UUIDs cross this boundary. */
export type PlannerEvent =
  | "planner_mode_selected"
  | "exam_generation_started"
  | "exam_generation_completed"
  | "exam_generation_failed"
  | "proposal_edited"
  | "proposal_confirmed"
  | "feasibility_warning"
  | "generation_cancelled"
  | "operation_recovered"
  // A1 planning intelligence. Length counts and closed enum values only.
  | "smart_question_asked"
  | "smart_question_skipped"
  | "smart_setup_applied"
  | "smart_setup_skipped"
  | "soft_constraint_evaluated"
  | "semantic_review_completed"
  // Course / Syllabus Roadmap and selected-period expansion.
  | "roadmap_generation_started"
  | "roadmap_generation_completed"
  | "roadmap_generation_failed"
  | "roadmap_confirmed"
  | "roadmap_edit_saved"
  | "roadmap_milestone_expansion_started"
  | "roadmap_milestone_expansion_completed"
  | "roadmap_milestone_expansion_failed"
  | "roadmap_milestone_expansion_refused"
  // Chapter / Unit Mastery.
  | "mastery_generation_started"
  | "mastery_generation_completed"
  | "mastery_generation_failed"
  | "mastery_confirmed"
  // The check's own workflow state. Observed when a confirmed mastery plan is
  // viewed, never derived from anything the student did not already see.
  | "mastery_check_completed"
  // User-approved adaptive replanning. Counts, codes and state only.
  | "replan_review_offered"
  | "replan_generation_started"
  | "replan_generation_completed"
  | "replan_generation_failed"
  | "replan_discarded"
  | "replan_confirmed"
  | "replan_conflict"
  | "mastery_check_result_set"
  | "mastery_check_result_reset"
  // UX Phase 1a — baseline intake telemetry. Counts, closed enums and durations
  // only; nothing here carries plan content, field names or user text.
  | "intake_started"
  | "intake_first_input"
  | "intake_readiness_changed"
  | "intake_first_draft_requested"
  | "intake_abandoned"
  // Classic / Planner Modes coexistence: which planner surface the student opened,
  // and whether they went back to Classic. Closed enums only.
  | "planner_surface_opened"
  | "planner_returned_to_classic"
  // UX Phase 2 — scope research and import. Counts, closed enums and durations only:
  // no topic text, no URL, no syllabus text, no file name.
  | "research_started"
  | "research_completed"
  | "research_failed"
  | "research_cancelled"
  | "scope_candidate_shown"
  | "scope_confirmed"
  | "scope_research_rejected"
  | "scope_import_started"
  | "scope_import_completed"
  | "scope_import_failed"
  // UX Phase 3 — curriculum comparison, the preparedness matrix and flexible draft
  // editing. Counts, closed enums and durations only: no topic text, no curriculum
  // name, no URL, no source title, no warning sentence.
  | "comparison_started"
  | "comparison_completed"
  | "comparison_failed"
  | "comparison_skipped"
  | "comparison_cached"
  | "overlap_corrected"
  | "coverage_suggestion_applied"
  | "preparedness_opened"
  | "preparedness_bulk_applied"
  | "preparedness_skipped"
  | "draft_warning_presented"
  | "draft_warning_accepted"
  // UX Phase 4 — the Planner Copilot and the release of generated work. Intents,
  // counts, closed codes and outcomes only: never a message, a summary, a unit label,
  // a source title, a prompt or a model response.
  | "copilot_opened"
  | "copilot_message_sent"
  | "copilot_interpreted"
  | "copilot_clarification_requested"
  | "copilot_proposal_created"
  | "copilot_proposal_applied"
  | "copilot_proposal_cancelled"
  | "copilot_bad_output"
  | "copilot_explanation_requested"
  | "copilot_research_requested"
  | "copilot_replan_requested"
  | "copilot_refused"
  /**
   * The Plan Designer: the same assistant, in its pre-generation role.
   *
   * A separate vocabulary rather than reusing the Copilot's, because the useful question about
   * this surface is different — not "did the student change something" but "did the Designer ask
   * for something it should not have, or fail to ask for something it should". These events carry
   * counts, closed codes, enums and latency buckets only: never a message, a unit label, a date,
   * or anything the student typed.
   */
  | "designer_message_sent"
  | "designer_interpreted"
  | "designer_question_asked"
  | "designer_recommendation_given"
  | "designer_proposal_created"
  | "designer_proposal_applied"
  | "designer_import_refused"
  | "designer_bad_output"
  | "designer_clarification_requested"
  | "designer_explanation_requested"
  | "generated_item_release_requested"
  | "generated_item_released"
  /** The explicit half of a release: an offer Sylf is allowed to make, and its answer. */
  | "released_item_reoffer_offered"
  | "released_item_reoffer_accepted"
  | "released_item_reoffer_declined"
  | "generated_item_release_blocked";

export type PlannerMode = "EXAM" | "ROADMAP" | "MASTERY";
export type TelemetryGranularity = "MONTH" | "WEEK";
/** Closed codes only: a depth is a choice, never plan content. */
export type TelemetryMasteryDepth = "ORIENTATION" | "SOLID" | "DEEP";
export type TelemetryCheckPreference =
  | "MIXED_PRACTICE"
  | "RECALL_AND_APPLY"
  | "SHORT_SELF_TEST"
  | "EXPLAIN_AND_SOLVE";

/**
 * How the student entered the intake. Only `LEGACY_WIZARD` exists this phase;
 * the other two exist now so the redesign's Quick Plan and Advanced paths are
 * measurable against the same closed vocabulary.
 */
export type IntakeEntryPath = "LEGACY_WIZARD" | "QUICK_PLAN" | "ADVANCED";
/**
 * Why the intake ended before a draft was requested. Bounded and closed so an
 * abandonment can never carry free-form text.
 */
export type IntakeAbandonReason = "LEFT" | "CANCELLED" | "SWITCHED_MODE";
/**
 * The two planner surfaces, which coexist permanently.
 *
 * `CLASSIC` is the default Planner experience; `MODES` is the Exam / Roadmap /
 * Mastery family reached deliberately from it. Bounded so a surface report can
 * never carry a route or a label.
 */
export type PlannerSurface = "CLASSIC" | "MODES";
/**
 * Where a candidate scope came from, and where a confirmed scope came from.
 *
 * A closed enum because the alternative — a URL or a file name — is exactly the
 * content-free telemetry rule this vocabulary exists to enforce.
 */
/** The one research backend this phase ships. A closed enum for the same reason as the rest. */
export type ResearchBackend = "DEEPSEEK_SEARCH";
export type SearchProviderTelemetry = "brave" | "serper" | "searxng" | "none";
export type ResearchStatusTelemetry = "OK" | "WEAK" | "UNAVAILABLE";
/**
 * How hard a research run decided to look.
 *
 * A closed enum for the same reason as the rest: the tier is a label, and a free string would
 * be a place for the model's own prose to reach telemetry. `DEEP` is deliberately not listed —
 * it belongs to the follow-up rounds Phase 2 adds, and a tier that cannot yet behave
 * differently must not appear as though it did.
 */
export type ResearchDepthTelemetry = "LOOKUP" | "STANDARD" | "DEEP";
/**
 * Fetched bytes in buckets rather than exact values.
 *
 * An exact byte count of a fetched page is a weak fingerprint of which page it was, and
 * the question cost accounting actually needs answered is "was this cheap or expensive".
 */
export type FetchBytesBucket = "NONE" | "UNDER_64K" | "UNDER_512K" | "UNDER_2M" | "OVER_2M";
export type ScopeOrigin =
  | "RESEARCH"
  | "IMPORT"
  | "PASTE"
  | "MANUAL"
  | "RESEARCH_CONFIRMED"
  | "IMPORT_CONFIRMED";

export interface PlannerTelemetryMetadata {
  planId?: string;
  operationId?: string;
  mode?: PlannerMode;
  granularity?: TelemetryGranularity;
  items?: number;
  topics?: number;
  latencyMs?: number;
  questions?: number;
  priorityTopics?: number;
  sizedTopics?: number;
  constraints?: number;
  issues?: number;
  repaired?: number;
  deterministicIssues?: number;
  softViolations?: number;
  softSatisfied?: number;
  itemsEdited?: number;
  criteriaEdited?: number;
  milestonesEdited?: number;
  providerCalls?: number;
  periods?: number;
  milestones?: number;
  horizonDays?: number;
  excludedTopics?: number;
  expandedMilestones?: number;
  plannedItems?: number;
  scopeBytes?: number;
  critic?: CriticState;
  reasonCodes?: PlannerQuestionReason[];
  /** Mastery mode: closed codes for the chosen depth and check shape. */
  masteryDepth?: TelemetryMasteryDepth;
  checkPreference?: TelemetryCheckPreference;
  /** Units whose item set was removed before confirmation. */
  excludedUnits?: number;
  /** Replanning: the closed reason vocabulary and the diff's own counts. */
  reasonCode?: RebalanceReason;
  retained?: number;
  moved?: number;
  replaced?: number;
  removed?: number;
  added?: number;
  frozen?: number;
  conflictCode?: string;
  /** Intake entry and exit vocabulary (UX Phase 1a). */
  entryPath?: IntakeEntryPath;
  abandonReason?: IntakeAbandonReason;
  /** Which planner surface was opened: the Classic Planner or Planner Modes. */
  surface?: PlannerSurface;
  /** Scope provenance, as a closed enum — never a URL. */
  scopeOrigin?: ScopeOrigin;
  /** Which backend answered a research run: the DeepSeek + external-search pipeline. */
  researchBackend?: ResearchBackend;
  /** The configured search provider, as a closed enum — never a key or a URL. */
  searchProvider?: SearchProviderTelemetry;
  /** Where a research run ended, as a closed enum. */
  researchStatus?: ResearchStatusTelemetry;
  searchQueries?: number;
  searchResults?: number;
  /**
   * Fetch cost as three counts, never collapsed into one.
   *
   * Phase 4.1's report could not answer "how many sources did that read?" because a redirect
   * hop and a source document were counted together. They are separate numbers here: what
   * was tried, what was read, and what the network actually saw.
   */
  sourceCandidates?: number;
  sourcesFetched?: number;
  httpRequests?: number;
  /** Bytes fetched, bucketed so the number cannot be a fingerprint of one page. */
  fetchBytesBucket?: FetchBytesBucket;
  deepseekCalls?: number;
  researchPasses?: number;
  researchLatencyMs?: number;
  /**
   * The shape of retrieval, added in Phase 1.
   *
   * The feature document's observability list asks for these so that a bad plan can be
   * attributed to poor retrieval, poor source selection, or planner reasoning. Counts only:
   * how many questions the planner set itself, how many queries served them, how many of those
   * returned anything, how many distinct domains the pool reached, how many candidates two
   * queries independently agreed on, and how many reads failed. No query text, no URL, no
   * domain name — the same rule as every other field here.
   */
  researchObjectives?: number;
  researchQueriesWithResults?: number;
  /** Queries removed as duplicates before dispatch. A count, never a query. */
  duplicateQueriesRemoved?: number;
  /**
   * Phase 2: evidence, coverage and the follow-up round.
   *
   * Counts and closed states only. The feature document's observability list asks for the
   * distinction between "the search was thin" and "the pages did not answer the question", and
   * that distinction lives here: how many claims the evidence contract accepted against how many
   * it rejected, how many objectives each coverage state holds, and whether the bounded
   * follow-up round ran at all.
   */
  evidenceClaimsAccepted?: number;
  evidenceClaimsRejected?: number;
  objectivesCovered?: number;
  objectivesPartial?: number;
  objectivesUnanswered?: number;
  objectivesConflicted?: number;
  highPriorityUnanswered?: number;
  followupQueries?: number;
  followupRoundUsed?: number;
  selectedSources?: number;
  /** Raw results returned, before deduplication — the pair with `searchResults`. */
  resultsReturned?: number;
  uniqueSourceDomains?: number;
  crossConfirmedSources?: number;
  duplicateResultsRemoved?: number;
  fetchFailures?: number;
  researchDepth?: ResearchDepthTelemetry;
  institutionalSourceCount?: number;
  /** Research/import counts. Content-free by construction: counts, never text. */
  sourceCount?: number;
  officialSourceCount?: number;
  secondarySourceCount?: number;
  candidateNodes?: number;
  confirmedNodes?: number;
  editedNodes?: number;
  importedTopics?: number;
  researchedTopics?: number;
  retries?: number;
  cacheHit?: number;
  partialImport?: number;
  /**
   * Intake counts: how much of the form the student touched, and where the
   * topics came from. Content-free by construction — a count, never a label.
   */
  fieldsTouched?: number;
  topicsManual?: number;
  topicsResearched?: number;
  topicsImported?: number;
  preparednessEdited?: number;
  copilotTurns?: number;
  warningsAccepted?: number;
  /** intake_readiness_changed: required fields still missing on this step. */
  missingRequired?: number;
  /** Phase 3: overlap counts, comparison cost, matrix edits, accepted warnings. */
  overlapCoveredCount?: number;
  overlapPartialCount?: number;
  overlapNewCount?: number;
  overlapUnclearCount?: number;
  overlapCorrectedCount?: number;
  preparednessBulkEdits?: number;
  preparednessSuggested?: number;
  backgroundSourceCount?: number;
  backgroundUnitCount?: number;
  comparisonCacheHit?: number;
  comparisonBytesIn?: number;
  comparisonBytesOut?: number;
  comparisonUnits?: number;
  modelPasses?: number;
  blockers?: number;
  /** Phase 4: closed Copilot outcomes, counts and codes. */
  intent?: string;
  commandCount?: number;
  clarificationCode?: string;
  proposalOutcome?: string;
  planLifecycleState?: string;
  latencyBucket?: string;
  releaseBlockReason?: string;
  replanRouted?: number;
  researchRouted?: number;
  released?: number;
  /** Re-offers a plan currently justifies. A count, never the items. */
  offers?: number;
  candidacyCount?: number;
  findings?: number;
}

const UUID = /^[a-f0-9-]{36}$/;
const REBALANCE_REASON_CODES: readonly string[] = REBALANCE_REASONS;
/** Content-free failure codes only: a translated message never reaches telemetry. */
const CONFLICT_CODES = new Set([
  "REPLAN_STALE_BASE",
  "REPLAN_STALE_EXECUTION",
  "REPLAN_STALE_AVAILABILITY",
  "REPLAN_CONFLICTED_EXECUTION",
  "REPLAN_EXECUTION_CHANGED",
  "PLANNER_EXECUTION_PROTECTED",
  "REBALANCE_TOUCHES_HISTORY",
  "SCHEDULE_CHANGED",
  "STALE_REVISION",
  "QUOTA_EXHAUSTED",
  "NOTHING_TO_REBALANCE",
  "REBALANCE_SCOPE_TOO_LARGE",
  "CONCURRENT_CHANGE",
]);
const MODES: PlannerMode[] = ["EXAM", "ROADMAP", "MASTERY"];
const GRANULARITIES: TelemetryGranularity[] = ["MONTH", "WEEK"];
const MASTERY_DEPTHS: TelemetryMasteryDepth[] = ["ORIENTATION", "SOLID", "DEEP"];
const ENTRY_PATHS: IntakeEntryPath[] = ["LEGACY_WIZARD", "QUICK_PLAN", "ADVANCED"];
const ABANDON_REASONS: IntakeAbandonReason[] = ["LEFT", "CANCELLED", "SWITCHED_MODE"];
const SURFACES: PlannerSurface[] = ["CLASSIC", "MODES"];
const RESEARCH_BACKENDS: ResearchBackend[] = ["DEEPSEEK_SEARCH"];
const SEARCH_PROVIDERS: SearchProviderTelemetry[] = ["brave", "serper", "searxng", "none"];
const RESEARCH_STATUSES_TELEMETRY: ResearchStatusTelemetry[] = ["OK", "WEAK", "UNAVAILABLE"];
const RESEARCH_DEPTHS_TELEMETRY: ResearchDepthTelemetry[] = ["LOOKUP", "STANDARD", "DEEP"];
const FETCH_BYTES_BUCKETS: FetchBytesBucket[] = ["NONE", "UNDER_64K", "UNDER_512K", "UNDER_2M", "OVER_2M"];

/** Bucket a byte count, so telemetry reports cost without fingering a document. */
export function fetchBytesBucket(bytes: number): FetchBytesBucket {
  if (!Number.isFinite(bytes) || bytes <= 0) return "NONE";
  if (bytes < 64 * 1024) return "UNDER_64K";
  if (bytes < 512 * 1024) return "UNDER_512K";
  if (bytes < 2 * 1024 * 1024) return "UNDER_2M";
  return "OVER_2M";
}
const SCOPE_ORIGINS: ScopeOrigin[] = [
  "RESEARCH",
  "IMPORT",
  "PASTE",
  "MANUAL",
  "RESEARCH_CONFIRMED",
  "IMPORT_CONFIRMED",
];
const CHECK_PREFERENCES: TelemetryCheckPreference[] = [
  "MIXED_PRACTICE",
  "RECALL_AND_APPLY",
  "SHORT_SELF_TEST",
  "EXPLAIN_AND_SOLVE",
];
/**
 * The values the Phase 4 telemetry fields may carry.
 *
 * One set for every Copilot field, because they are all closed vocabularies of the same
 * kind: an intent, a clarification code, a proposal outcome, a lifecycle state, a latency
 * bucket or a release block code. A value that is not here is dropped rather than logged.
 */
const CLOSED_COPILOT_VALUES = new Set([
  ...COPILOT_INTENTS,
  ...COPILOT_CLARIFICATION_CODES,
  ...COPILOT_ERROR_CODES,
  ...COPILOT_CONFIRMATION_CODES,
  "PRE_GENERATION",
  "DRAFT_REVIEW",
  "CONFIRMED",
  "FAST",
  "NORMAL",
  "SLOW",
  "ANSWERED",
  "PROPOSED",
  "APPLIED",
  "CANCELLED",
  "ROUTED",
  "REFUSED",
]);

const COUNTS = [
  "items",
  "topics",
  "latencyMs",
  "questions",
  "priorityTopics",
  "sizedTopics",
  "constraints",
  "issues",
  "repaired",
  "deterministicIssues",
  "softViolations",
  "softSatisfied",
  "itemsEdited",
  "criteriaEdited",
  "milestonesEdited",
  "providerCalls",
  "periods",
  "milestones",
  "horizonDays",
  "excludedTopics",
  "expandedMilestones",
  "plannedItems",
  "scopeBytes",
  "excludedUnits",
  "retained",
  "moved",
  "replaced",
  "removed",
  "added",
  "frozen",
  "fieldsTouched",
  "topicsManual",
  "topicsResearched",
  "topicsImported",
  "copilotTurns",
  "warningsAccepted",
  "missingRequired",
  "sourceCount",
  "officialSourceCount",
  "secondarySourceCount",
  "candidateNodes",
  "confirmedNodes",
  "editedNodes",
  "importedTopics",
  "researchedTopics",
  "retries",
  "cacheHit",
  "partialImport",
  "searchQueries",
  "searchResults",
  "researchObjectives",
  "researchQueriesWithResults",
  "duplicateQueriesRemoved",
  "evidenceClaimsAccepted",
  "evidenceClaimsRejected",
  "objectivesCovered",
  "objectivesPartial",
  "objectivesUnanswered",
  "objectivesConflicted",
  "highPriorityUnanswered",
  "followupQueries",
  "followupRoundUsed",
  "selectedSources",
  "resultsReturned",
  "uniqueSourceDomains",
  "crossConfirmedSources",
  "duplicateResultsRemoved",
  "fetchFailures",
  "sourceCandidates",
  "offers",
  "sourcesFetched",
  "httpRequests",
  "deepseekCalls",
  "researchPasses",
  "researchLatencyMs",
  "institutionalSourceCount",
  "overlapCoveredCount",
  "overlapPartialCount",
  "overlapNewCount",
  "overlapUnclearCount",
  "overlapCorrectedCount",
  "preparednessEdited",
  "preparednessBulkEdits",
  "preparednessSuggested",
  "backgroundSourceCount",
  "backgroundUnitCount",
  "comparisonCacheHit",
  "comparisonBytesIn",
  "comparisonBytesOut",
  "comparisonUnits",
  "modelPasses",
  "blockers",
  "commandCount",
  "replanRouted",
  "researchRouted",
  "released",
  "candidacyCount",
  "findings",
] as const;

export function plannerTelemetry(
  event: PlannerEvent,
  metadata: PlannerTelemetryMetadata = {}
) {
  const safe: Record<string, string | number | string[]> = {
    event,
    mode: metadata.mode && MODES.includes(metadata.mode) ? metadata.mode : "EXAM",
    schemaVersion: 1,
  };
  for (const key of ["operationId", "planId"] as const)
    if (metadata[key] && UUID.test(metadata[key]!)) safe[key] = metadata[key]!;
  for (const key of COUNTS)
    if (Number.isFinite(metadata[key]) && metadata[key]! >= 0)
      safe[key] = Math.round(metadata[key]!);
  if (metadata.critic && CRITIC_STATES.includes(metadata.critic))
    safe.critic = metadata.critic;
  if (metadata.granularity && GRANULARITIES.includes(metadata.granularity))
    safe.granularity = metadata.granularity;
  if (metadata.reasonCode && REBALANCE_REASON_CODES.includes(metadata.reasonCode))
    safe.reasonCode = metadata.reasonCode;
  if (metadata.conflictCode && CONFLICT_CODES.has(metadata.conflictCode))
    safe.conflictCode = metadata.conflictCode;
  if (metadata.masteryDepth && MASTERY_DEPTHS.includes(metadata.masteryDepth))
    safe.masteryDepth = metadata.masteryDepth;
  if (
    metadata.checkPreference &&
    CHECK_PREFERENCES.includes(metadata.checkPreference)
  )
    safe.checkPreference = metadata.checkPreference;
  if (metadata.entryPath && ENTRY_PATHS.includes(metadata.entryPath))
    safe.entryPath = metadata.entryPath;
  if (metadata.abandonReason && ABANDON_REASONS.includes(metadata.abandonReason))
    safe.abandonReason = metadata.abandonReason;
  if (metadata.surface && SURFACES.includes(metadata.surface))
    safe.surface = metadata.surface;
  if (metadata.scopeOrigin && SCOPE_ORIGINS.includes(metadata.scopeOrigin))
    safe.scopeOrigin = metadata.scopeOrigin;
  if (metadata.researchBackend && RESEARCH_BACKENDS.includes(metadata.researchBackend))
    safe.researchBackend = metadata.researchBackend;
  if (metadata.searchProvider && SEARCH_PROVIDERS.includes(metadata.searchProvider))
    safe.searchProvider = metadata.searchProvider;
  if (metadata.researchStatus && RESEARCH_STATUSES_TELEMETRY.includes(metadata.researchStatus))
    safe.researchStatus = metadata.researchStatus;
  if (metadata.researchDepth && RESEARCH_DEPTHS_TELEMETRY.includes(metadata.researchDepth))
    safe.researchDepth = metadata.researchDepth;
  if (metadata.fetchBytesBucket && FETCH_BYTES_BUCKETS.includes(metadata.fetchBytesBucket))
    safe.fetchBytesBucket = metadata.fetchBytesBucket;
  // Phase 4's closed Copilot vocabulary. Each value is checked against a fixed list, so a
  // free-form string cannot travel even if a caller passes one by mistake.
  for (const key of ["intent", "clarificationCode", "proposalOutcome", "planLifecycleState", "latencyBucket", "releaseBlockReason"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && CLOSED_COPILOT_VALUES.has(value)) safe[key] = value;
  }
  if (metadata.reasonCodes?.length) {
    const codes = metadata.reasonCodes.filter((code) =>
      PlannerQuestionReasonSchema.safeParse(code).success
    );
    if (codes.length) safe.reasonCodes = [...new Set(codes)];
  }
  console.info("[planner]", safe);
}
