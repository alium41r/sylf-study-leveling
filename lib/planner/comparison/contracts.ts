import { z } from "zod";
import { ResearchSourceSchema } from "../research/contracts";

/**
 * The curriculum-comparison contract: what Sylf may say about the overlap between
 * a student's background curriculum and the target they have confirmed.
 *
 * Three rules shape every type here, and they are the reason this module exists
 * separately from the service that produces it:
 *
 * 1. **Overlap is not ability.** `LIKELY_COVERED_BY_CURRICULUM` means "this topic
 *    appears in the curriculum you told me you studied" — never "you know it". The
 *    schema therefore has *no* preparedness field at all: there is nowhere to put a
 *    `covered`, a `confidence`, a `difficult` or a `mastery` value, so no later writer
 *    can quietly promote a curriculum fact into a claim about a person. Preparedness
 *    lives in the brief, is written only by an explicit user action, and outranks
 *    everything here.
 * 2. **A source is never invented.** `sources` is built from the URLs a search
 *    provider returned and the fetcher actually reached (see the Phase 2.1 provenance
 *    rule); a unit cites one by `sourceId` only. The model's output schema has no URL
 *    field and no prose field, so neither can reach the student.
 * 3. **A result is bounded and knows when it is stale.** Units, sources, unresolved
 *    notes and every string are capped, and the result carries the two digests it was
 *    computed against, so a changed scope or a changed background curriculum makes it
 *    stale rather than silently applicable.
 */

export const OVERLAP_STATES = [
  "LIKELY_COVERED_BY_CURRICULUM",
  "PARTIAL_OVERLAP",
  "LIKELY_NEW_TO_CURRICULUM",
  "UNCLEAR",
] as const;
export const OverlapStateSchema = z.enum(OVERLAP_STATES);
export type OverlapState = (typeof OVERLAP_STATES)[number];

export const OVERLAP_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export const OverlapConfidenceSchema = z.enum(OVERLAP_CONFIDENCES);
export type OverlapConfidence = (typeof OVERLAP_CONFIDENCES)[number];

/**
 * Why a unit was classified as it was, as a closed code rather than a sentence.
 *
 * The student reads a sentence assembled from *their own* data — the unit label they
 * confirmed and the background curriculum name they typed — plus one of these codes.
 * Model prose never reaches the surface, which is what keeps a confident paragraph
 * about "the official syllabus" from becoming an authority.
 */
export const OVERLAP_EXPLANATION_CODES = [
  /** The topic, or something clearly the same thing, appears in the background curriculum. */
  "BACKGROUND_TOPIC_MATCH",
  /** Part of the topic appears in the background curriculum; part does not. */
  "BACKGROUND_PARTIAL_MATCH",
  /** The topic is not in the background curriculum at all. */
  "NOT_IN_BACKGROUND_CURRICULUM",
  /** The background material was found and read, but does not settle this unit. */
  "EVIDENCE_INCONCLUSIVE",
  /** Nothing could be read about the background curriculum for this subject. */
  "NO_BACKGROUND_EVIDENCE",
  /** The student said the comparison is wrong; their answer replaced Sylf's. */
  "STUDENT_CORRECTION",
] as const;
export const OverlapExplanationCodeSchema = z.enum(OVERLAP_EXPLANATION_CODES);
export type OverlapExplanationCode = (typeof OVERLAP_EXPLANATION_CODES)[number];

/**
 * Where a comparison run ended.
 *
 * `UNAVAILABLE` is the honest answer when there is no search provider configured, no
 * background curriculum stated, or nothing readable could be fetched. It is *not* a
 * failure of the student's setup: Quick Plan stays fully usable, and this is the state
 * whose copy says so.
 */
export const COMPARISON_STATUSES = ["OK", "WEAK", "UNAVAILABLE"] as const;
export const ComparisonStatusSchema = z.enum(COMPARISON_STATUSES);
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

export const COMPARISON_FAILURE_CODES = [
  "COMPARISON_UNAVAILABLE",
  "COMPARISON_NOT_APPLICABLE",
  "COMPARISON_SEARCH_UNAVAILABLE",
  "COMPARISON_SEARCH_ZERO_RESULTS",
  "COMPARISON_FETCH_FAILED",
  "COMPARISON_MODEL_BAD_OUTPUT",
  /**
   * The model answered correctly and the evidence was still not enough to assert anything.
   *
   * Added in the final phase, because a live run showed the two being confused: with the
   * pages read and the extraction schema-valid, a comparison in which *every* unit came
   * back `UNCLEAR` was recorded as `COMPARISON_MODEL_BAD_OUTPUT` — which says the model
   * misbehaved, when in fact it declined to assert an overlap the pages did not support.
   * That is the honest outcome, and a quality review reading the old code would have
   * chased a model bug that did not exist. The three codes now mean three different things:
   * the pages could not be read, the model's answer was unusable, or nothing could
   * responsibly be asserted from what was read.
   */
  "COMPARISON_NOT_ASSERTED",
  "COMPARISON_RESEARCH_OFF",
  "COMPARISON_STALE",
] as const;
export const ComparisonFailureCodeSchema = z.enum(COMPARISON_FAILURE_CODES);
export type ComparisonFailureCode = (typeof COMPARISON_FAILURE_CODES)[number];

/**
 * Explicit ceilings for one comparison run.
 *
 * The target may hold 50 engine units and the confirmed hierarchy 200 nodes, so the
 * requirement is that the *cost* of comparing them does not grow the way their count
 * does: one search plan, one fetch round, and one model pass over a bounded payload —
 * never one call per topic. The numbers below are the enforcement points, and
 * `ComparisonMetrics` reports what was actually used so the claim is measurable.
 */
export const COMPARISON_LIMITS = {
  /** Target units compared. Matches the engine's own unit ceiling. */
  units: 50,
  /** Ancestor labels carried per unit as hierarchy context. */
  pathDepth: 3,
  /** Background units the model may return. More than a syllabus needs. */
  backgroundUnits: 120,
  /** Sources kept, matching the research ceiling so one classification path serves both. */
  sources: 8,
  /** Unresolved notes kept. */
  unresolved: 8,
  /** Characters of one unresolved note. */
  unresolvedChars: 240,
  /** Sources one unit may cite. */
  sourcesPerUnit: 4,
  /** One sentence summarising the run. */
  summaryChars: 400,
  /** Search queries planned for the background curriculum. */
  searchQueries: 2,
  /** Results considered per query. */
  resultsPerQuery: 8,
  /** Pages kept and read for the comparison. */
  fetchedSources: 4,
  /**
   * Ranked candidates the comparison may *try*, as distinct from pages it keeps.
   *
   * The same correction the scope-research agent earned from a live run: official pages that
   * refuse to be read (a 403, a TLS refusal) were consuming the whole fetch budget, so a
   * comparison could end with nothing read while readable pages sat just below the cut. The
   * preference order is unchanged — an official specification PDF is still tried first — and
   * the extra attempts are bounded by the results already in hand.
   */
  sourceCandidateAttempts: 8,
  /** Model passes: extract the background and classify the target in the same pass. */
  modelPasses: 1,
  /** Characters of the target list sent to the model. */
  targetChars: 6_000,
  /** Characters of fetched source text sent to the model. */
  sourceChars: 6_000,
  /** Total characters sent in the single model pass. */
  inputChars: 30_000,
  /** Characters accepted from the model's answer. */
  outputChars: 8_000,
  /** Wall-clock ceiling for the one model pass, matching the research bounds. */
  modelTimeoutMs: 45_000,
} as const;

const DigestSchema = z.string().regex(/^[a-f0-9]{16,64}$/);

/** One target unit's overlap classification. Preparedness fields are absent by design. */
export const ComparisonUnitSchema = z.strictObject({
  /** The confirmed scope node this row is about. */
  unitRef: z.string().min(1).max(60),
  overlap: OverlapStateSchema,
  confidence: OverlapConfidenceSchema,
  /**
   * Which sources support the assertion. Empty is normal and correct: a unit may be
   * classified from the background curriculum's structure alone, and `UNCLEAR` cites
   * nothing because there is nothing to cite.
   */
  sourceIds: z.array(z.string().min(1).max(60)).max(COMPARISON_LIMITS.sourcesPerUnit),
  explanationCode: OverlapExplanationCodeSchema,
  /** True when the student overrode Sylf's classification for this unit. */
  corrected: z.boolean().optional(),
  /** What Sylf said before the correction, kept so the record is not rewritten. */
  originalOverlap: OverlapStateSchema.optional(),
});
export type ComparisonUnit = z.infer<typeof ComparisonUnitSchema>;

/**
 * One comparison result.
 *
 * `units` covers *every* confirmed unit: a unit the model did not classify arrives as
 * `UNCLEAR` rather than being missing, because a missing row would read as "no
 * overlap" and uncertainty must never be silently rendered as a negative finding.
 */
export const CurriculumComparisonSchema = z.strictObject({
  version: z.literal(1),
  status: ComparisonStatusSchema,
  failureCode: ComparisonFailureCodeSchema.nullable(),
  /** Digest of the confirmed target scope this was computed against. */
  targetScopeDigest: DigestSchema,
  /** Digest of the stated background curriculum and the student's corrections. */
  backgroundDigest: DigestSchema,
  /**
   * Which pipeline produced it, so a change of backend invalidates a cached result
   * rather than reusing an answer computed under different rules.
   */
  providerVersion: z.string().min(1).max(60),
  /** The specific search provider that answered, as a closed enum — never a key. */
  searchProvider: z.enum(["brave", "serper", "searxng", "none"]),
  createdAt: z.string().max(40),
  units: z.array(ComparisonUnitSchema).max(COMPARISON_LIMITS.units),
  sources: z.array(ResearchSourceSchema).max(COMPARISON_LIMITS.sources),
  unresolved: z.array(z.string().trim().max(COMPARISON_LIMITS.unresolvedChars)).max(COMPARISON_LIMITS.unresolved),
  summary: z.string().trim().max(COMPARISON_LIMITS.summaryChars),
});
export type CurriculumComparison = z.infer<typeof CurriculumComparisonSchema>;

/** A student's correction of one unit's overlap, recorded in the brief. */
export const OverlapCorrectionSchema = z.strictObject({
  unitRef: z.string().min(1).max(60),
  /** What the student says is true. Their answer outranks Sylf's. */
  overlap: OverlapStateSchema,
  /**
   * Which target digest the correction was made against.
   *
   * A correction is about a unit that existed when it was made. When the confirmed
   * scope changes materially the unit may no longer mean the same thing, so the digest
   * travels with the correction and a mismatch retires it rather than misapplying it.
   */
  targetScopeDigest: DigestSchema,
  correctedAt: z.string().max(40),
});
export type OverlapCorrection = z.infer<typeof OverlapCorrectionSchema>;

/** The student-facing words for each state. Sentence case, no jargon, no mastery verbs. */
export const OVERLAP_LABEL: Record<OverlapState, string> = {
  LIKELY_COVERED_BY_CURRICULUM: "In your curriculum",
  PARTIAL_OVERLAP: "Partly in your curriculum",
  LIKELY_NEW_TO_CURRICULUM: "Not in your curriculum",
  UNCLEAR: "Not sure",
};

export const OVERLAP_MEANING: Record<OverlapState, string> = {
  LIKELY_COVERED_BY_CURRICULUM:
    "This topic appears in the background curriculum you told Sylf about. It says nothing about how well you know it.",
  PARTIAL_OVERLAP:
    "Part of this topic appears in your background curriculum, and part does not.",
  LIKELY_NEW_TO_CURRICULUM:
    "Sylf did not find this topic in the background curriculum you listed.",
  UNCLEAR:
    "Sylf could not tell whether this topic is in your background curriculum.",
};

/**
 * The order the review surface offers rows in.
 *
 * Uncertainty first, because that is where the student's answer changes something; the
 * likely-covered rows are collapsed because agreeing with them costs a click each and
 * changes nothing.
 */
export const OVERLAP_REVIEW_ORDER: readonly OverlapState[] = [
  "UNCLEAR",
  "LIKELY_NEW_TO_CURRICULUM",
  "PARTIAL_OVERLAP",
  "LIKELY_COVERED_BY_CURRICULUM",
];

export interface OverlapCounts {
  covered: number;
  partial: number;
  isNew: number;
  unclear: number;
  total: number;
}

/** Counts for the summary line and for telemetry — never labels. */
export function overlapCounts(units: readonly ComparisonUnit[]): OverlapCounts {
  const count = (state: OverlapState) => units.filter((unit) => unit.overlap === state).length;
  return {
    covered: count("LIKELY_COVERED_BY_CURRICULUM"),
    partial: count("PARTIAL_OVERLAP"),
    isNew: count("LIKELY_NEW_TO_CURRICULUM"),
    unclear: count("UNCLEAR"),
    total: units.length,
  };
}

/** Units in review order: uncertain first, likely-covered last and collapsed. */
export function unitsInReviewOrder(units: readonly ComparisonUnit[]): ComparisonUnit[] {
  const rank = new Map(OVERLAP_REVIEW_ORDER.map((state, index) => [state, index]));
  return [...units].sort(
    (a, b) => (rank.get(a.overlap) ?? 99) - (rank.get(b.overlap) ?? 99)
  );
}

/**
 * Apply the student's corrections to a comparison, for display.
 *
 * The stored comparison keeps what Sylf said (`originalOverlap`) and the correction is
 * layered on top on every read, so re-running the comparison cannot erase a person's
 * answer and the historical record is never rewritten. A correction made against a
 * different target digest is ignored: the unit it was about may not be the unit in
 * front of the student any more.
 */
export function applyOverlapCorrections(
  comparison: CurriculumComparison,
  corrections: readonly OverlapCorrection[]
): CurriculumComparison {
  if (!corrections.length) return comparison;
  const byRef = new Map(
    corrections
      .filter((entry) => entry.targetScopeDigest === comparison.targetScopeDigest)
      .map((entry) => [entry.unitRef, entry] as const)
  );
  if (!byRef.size) return comparison;
  let changed = false;
  const units = comparison.units.map((unit) => {
    const correction = byRef.get(unit.unitRef);
    if (!correction || unit.overlap === correction.overlap) return unit;
    changed = true;
    return {
      unitRef: unit.unitRef,
      overlap: correction.overlap,
      // A correction is a person's statement, so it carries no research confidence and
      // cites nothing: attributing Sylf's sources to the student's answer would be a lie.
      confidence: "HIGH" as const,
      sourceIds: [],
      explanationCode: "STUDENT_CORRECTION" as const,
      corrected: true,
      originalOverlap: unit.corrected ? unit.originalOverlap ?? unit.overlap : unit.overlap,
    };
  });
  return changed ? { ...comparison, units } : comparison;
}

/** The corrections that still belong to this comparison's target. */
export function liveCorrections(
  corrections: readonly OverlapCorrection[],
  targetScopeDigest: string | null
): OverlapCorrection[] {
  if (!targetScopeDigest) return [];
  return corrections.filter((entry) => entry.targetScopeDigest === targetScopeDigest);
}

/**
 * Which units the student may be offered "studied, confidence not rated" for.
 *
 * Only units Sylf classified as likely covered by the *curriculum* — never the ones it
 * could not read, and never the ones it thinks are new. The suggestion is still a
 * suggestion: the server refuses `applyCoverageSuggestion` for anything not in this
 * list, so acceptance can never be turned into a blanket rating.
 */
export function coverageSuggestionRefs(
  comparison: CurriculumComparison | null
): string[] {
  if (!comparison) return [];
  return comparison.units
    .filter((unit) => unit.overlap === "LIKELY_COVERED_BY_CURRICULUM")
    .map((unit) => unit.unitRef);
}

/** One sentence the surface shows above the rows. Counts only — never a topic label. */
export function comparisonSummarySentence(counts: OverlapCounts, background: string | null): string {
  if (!counts.total) return "There was nothing to compare.";
  const where = background ? `your ${background} background` : "your background curriculum";
  const parts = [
    `${counts.covered} likely familiar`,
    `${counts.partial} partly overlapping`,
    `${counts.isNew} likely new`,
    `${counts.unclear} unclear`,
  ];
  return `Compared with ${where}: ${parts.join(", ")}.`;
}

/** The one explanation shown with the summary — not repeated on every row. */
export const COMPARISON_DISCLAIMER =
  "This compares curriculum content, not how well you personally know it.";

/**
 * What a `WEAK` comparison says about its own evidence.
 *
 * A comparison can be perfectly usable and still not rest on the examination authority's
 * own material — a university page, a ministry handbook, a well-informed third party. The
 * rows are then still worth reading, but the status must not imply an authority Sylf did
 * not find, so the caveat is stated once, with the counts.
 */
export const COMPARISON_WEAK_CAVEAT =
  "None of this could be checked against the examination authority's own material, so treat it as a starting point.";
