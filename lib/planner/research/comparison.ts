import "server-only";
import { createHash } from "node:crypto";
import type { PlanBriefV1 } from "../intake/brief";
import { unitRows } from "../comparison/units";
import {
  COMPARISON_LIMITS,
  COMPARISON_WEAK_CAVEAT,
  CurriculumComparisonSchema,
  comparisonSummarySentence,
  overlapCounts,
  type ComparisonFailureCode,
  type ComparisonStatus,
  type ComparisonUnit,
  type CurriculumComparison,
  type OverlapCorrection,
} from "../comparison/contracts";
import { rankSources, buildSource, sourceTypeIsOfficial } from "./sources";
import { resolveAuthorities, type AuthorityTarget } from "./authority";
import { FetchError } from "./search/fetch";
import {
  RESEARCH_BOUNDS,
  ComparisonExtractionSchema,
  ResearchQueryPlanSchema,
  type ComparisonExtraction,
  type ResearchQueryPlan,
  type SearchProvider,
} from "./search/contracts";
import type { ModelUsage } from "./agent";
import type { FetchedSource } from "./search/fetch";
import type { ResearchSource } from "./contracts";

/**
 * Curriculum comparison: the student's background curriculum against the scope they
 * confirmed, using the Phase 2.1 research pipeline and nothing else.
 *
 * What this module is careful about, in order of importance:
 *
 * 1. **It cannot say anything about a person.** The result type has no preparedness
 *    field (see `lib/planner/comparison/contracts.ts`), so a curriculum overlap can
 *    never become "you know this". Preparedness is written only by an explicit user
 *    action and outranks everything computed here.
 * 2. **It is bounded, whatever the size of the scope.** One search plan, one fetch
 *    round, and one comparison pass — not one call per topic. The ceilings are in
 *    `COMPARISON_LIMITS` and the metrics report what was actually spent, so the claim
 *    is measurable rather than asserted.
 * 3. **A source is never invented.** `sources` comes from search results and validated
 *    fetch redirects; the model cites `sourceId`s only, and an assertion that cites
 *    nothing the server issued is downgraded to `UNCLEAR` instead of being believed.
 * 4. **It fails honestly.** No search provider, no background curriculum, no confirmed
 *    scope, or research switched off are all `UNAVAILABLE` with a reason the surface
 *    can explain — never a model call with imagined web context.
 */

/**
 * The pipeline's version, part of every cache decision.
 *
 * Bump this when the comparison prompt, the extraction schema or the classification
 * rules change: a stored comparison made under different rules must not be reused, and
 * this is the cheapest honest way to say so.
 */
export const COMPARISON_PROVIDER_VERSION = "deepseek-search-comparison-v1";

export interface ComparisonModel {
  /** Reused verbatim from the research agent: the same planner decides what to look up. */
  planQueries(input: {
    target: AuthorityTarget;
    removedLabels: string[];
    authorityHosts: string[];
    signal?: AbortSignal;
  }): Promise<{ plan: ResearchQueryPlan; usage: ModelUsage }>;
  compare(input: {
    target: AuthorityTarget;
    background: AuthorityTarget;
    /** The confirmed units, with their hierarchy path, as the model sees them. */
    targetUnits: { unitRef: string; label: string; path: string[] }[];
    /** Bounded excerpts, keyed by the sourceIds the server assigned. */
    sources: { sourceId: string; title: string; url: string; text: string }[];
    signal?: AbortSignal;
  }): Promise<{ comparison: ComparisonExtraction; usage: ModelUsage }>;
}

export interface ComparisonMetrics {
  latencyMs: number;
  cacheHit: boolean;
  searchCalls: number;
  searchResults: number;
  /** Candidates tried, candidates read, and raw HTTP requests — three different counts. */
  sourceCandidates: number;
  sourcesFetched: number;
  httpRequests: number;
  fetchBytes: number;
  modelCalls: number;
  /** Search planning plus the comparison itself. */
  modelPasses: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Measured payload sizes for the report: characters sent to and received from the model. */
  inputChars: number;
  outputChars: number;
  targetUnits: number;
  backgroundUnits: number;
  sourceCount: number;
  officialSourceCount: number;
  institutionalSourceCount: number;
  secondarySourceCount: number;
  status: ComparisonStatus;
}

export interface ComparisonOutcome {
  comparison: CurriculumComparison;
  metrics: ComparisonMetrics;
}

const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

/**
 * The confirmed target, as comparison units.
 *
 * Uses the same `flattenScope` the engine uses, so a unit in the overlap map is the
 * unit the plan will schedule — not a parallel vocabulary that could drift. Each unit
 * carries its ancestor labels as `path`, which is how the *hierarchy* is compared and
 * not only the flat list: a coarsened chapter arrives with its section, and a topic
 * arrives with its chapter.
 */
export function comparisonTargets(
  brief: PlanBriefV1
): { unitRef: string; label: string; path: string[] }[] {
  // One implementation of "what are the compared units", shared with the browser (see
  // `lib/planner/comparison/units.ts`): the overlap map and the preparedness matrix must
  // label the same row the same way, or a student would correct one row and see another.
  return unitRows(brief.scope.nodes).slice(0, COMPARISON_LIMITS.units);
}

/** A digest of the confirmed scope *as compared*: units, their wording and their paths. */
export function targetScopeDigest(brief: PlanBriefV1): string {
  const targets = comparisonTargets(brief);
  return digest({
    kind: "TARGET_SCOPE",
    units: targets.map((unit) => [unit.unitRef, unit.label, unit.path.join(" › ")]),
  });
}

/**
 * A digest of the background curriculum the student stated.
 *
 * Only what the student said, in a normalised form: reordering subjects or changing the
 * board's spelling is a different question, and the comparison must be re-run rather
 * than reused. Corrections are deliberately *not* part of this digest — see
 * `applyOverlapCorrections` for why.
 */
export function backgroundDigest(brief: PlanBriefV1): string {
  const background = brief.backgroundCurriculum;
  return digest({
    kind: "BACKGROUND_CURRICULUM",
    label: background?.label.trim().toLowerCase() ?? null,
    level: background?.level?.trim().toLowerCase() ?? null,
    board: background?.board?.trim().toLowerCase() ?? null,
    subjects: [...(background?.subjects ?? [])]
      .map((subject) => subject.trim().toLowerCase())
      .sort(),
    providerVersion: COMPARISON_PROVIDER_VERSION,
  });
}

/**
 * Is the stored comparison still about the brief in front of the student?
 *
 * Both digests and the pipeline version must match. A renamed unit, an edited scope, a
 * changed board or an upgraded comparison pipeline all make it stale, and a stale
 * comparison is never applied: the surface says so and offers to run it again.
 */
export function comparisonIsStale(
  comparison: CurriculumComparison,
  brief: PlanBriefV1
): boolean {
  if (comparison.providerVersion !== COMPARISON_PROVIDER_VERSION) return true;
  if (comparison.targetScopeDigest !== targetScopeDigest(brief)) return true;
  return comparison.backgroundDigest !== backgroundDigest(brief);
}

/** The stored comparison, when it still answers the current question. */
export function reusableComparison(brief: PlanBriefV1): CurriculumComparison | null {
  const stored = brief.comparison;
  if (!stored) return null;
  if (stored.status !== "OK" && stored.status !== "WEAK") return null;
  return comparisonIsStale(stored, brief) ? null : stored;
}

/** Corrections whose target no longer exists in this scope, reported rather than applied. */
export function retiredCorrections(
  corrections: readonly OverlapCorrection[],
  brief: PlanBriefV1
): OverlapCorrection[] {
  const current = targetScopeDigest(brief);
  return corrections.filter((entry) => entry.targetScopeDigest !== current);
}

/**
 * Turn a comparison extraction into a bounded result.
 *
 * Every server-side rule that protects the student from an over-confident model lives
 * here:
 *
 * - a unit the model invented is dropped;
 * - a unit it omitted arrives as `UNCLEAR`, so uncertainty is never rendered as a
 *   negative finding;
 * - a citation the server did not issue is dropped;
 * - an assertion other than `UNCLEAR` that cites nothing is downgraded to `UNCLEAR`,
 *   because "the pages I read support this" and "I believe this" must not look the same.
 */
export function comparisonFromExtraction(input: {
  brief: PlanBriefV1;
  extraction: ComparisonExtraction;
  sources: ResearchSource[];
  retrievedAt: string;
  searchProvider: CurriculumComparison["searchProvider"];
  outputChars: number;
}): { comparison: CurriculumComparison; backgroundUnits: number; downgraded: number; droppedCitations: number } {
  const targets = comparisonTargets(input.brief);
  const known = new Set(targets.map((unit) => unit.unitRef));
  const issued = new Set(input.sources.map((source) => source.sourceId));
  const ranked = rankSources(input.sources).slice(0, COMPARISON_LIMITS.sources);
  const issuedAfterRanking = new Set(ranked.map((source) => source.sourceId));

  let downgraded = 0;
  let droppedCitations = 0;
  const seen = new Set<string>();
  const classified = new Map<string, ComparisonUnit>();
  for (const row of input.extraction.units) {
    if (!known.has(row.unitRef) || seen.has(row.unitRef)) continue;
    seen.add(row.unitRef);
    const valid = row.sourceIds.filter((id) => issued.has(id) && issuedAfterRanking.has(id));
    droppedCitations += row.sourceIds.length - valid.length;
    const cited = [...new Set(valid)].slice(0, COMPARISON_LIMITS.sourcesPerUnit);
    // An assertion needs evidence. With sources in hand and none cited, the honest
    // answer is that this was not established from the pages.
    const unsupported = row.overlap !== "UNCLEAR" && cited.length === 0;
    if (unsupported) downgraded += 1;
    classified.set(row.unitRef, {
      unitRef: row.unitRef,
      overlap: unsupported ? "UNCLEAR" : row.overlap,
      confidence: unsupported ? "LOW" : row.confidence,
      sourceIds: cited,
      explanationCode: unsupported ? "EVIDENCE_INCONCLUSIVE" : row.explanationCode,
    });
  }

  const units: ComparisonUnit[] = targets.map(
    (unit) =>
      classified.get(unit.unitRef) ?? {
        unitRef: unit.unitRef,
        overlap: "UNCLEAR" as const,
        confidence: "LOW" as const,
        sourceIds: [],
        explanationCode: "NO_BACKGROUND_EVIDENCE" as const,
      }
  );

  const asserted = units.filter((unit) => unit.overlap !== "UNCLEAR").length;

  /**
   * Which sources can actually back an assertion.
   *
   * `sourceTypeIsOfficial` is the single authority for this meaning (Phase 2.1), and it is
   * true only for `OFFICIAL`/`OFFICIAL_PDF`. `INSTITUTIONAL` is deliberately excluded: a
   * university page about someone else's exam is credible material, but it is not the
   * examination authority's own word, and the comparison's overall status must not claim
   * more than the evidence behind it.
   */
  const officialIds = new Set(
    ranked
      .filter((source) => sourceTypeIsOfficial(source.sourceType))
      .map((source) => source.sourceId)
  );

  /**
   * `OK` needs both halves **and** the right kind of evidence:
   *
   * 1. something was read (`ranked` is non-empty);
   * 2. at least one unit was actually classified rather than left `UNCLEAR`;
   * 3. at least one of those asserted units cites an official source.
   *
   * The third condition is the Phase 3.1 correction. An INSTITUTIONAL- or SECONDARY-only
   * comparison is a real, usable answer — every row keeps its classification and its
   * citation — but its status is `WEAK`, because the honest summary of it is "usable, but
   * not backed by a verified target authority". The model's own confidence is never
   * consulted here: it is advisory, and it can neither upgrade this status nor create
   * authority where the server found none.
   */
  const assertedWithOfficial = units.some(
    (unit) => unit.overlap !== "UNCLEAR" && unit.sourceIds.some((id) => officialIds.has(id))
  );
  const status: ComparisonStatus =
    !ranked.length || !asserted ? "UNAVAILABLE" : assertedWithOfficial ? "OK" : "WEAK";
  /**
   * Three different failures, three different codes.
   *
   * `ranked.length` says pages were read; `asserted` says any of them settled a unit. When
   * pages were read and nothing could be asserted, the model did its job — it declined to
   * claim an overlap the evidence did not support — so `COMPARISON_NOT_ASSERTED` is the
   * truthful record. Only a genuinely unusable answer is `COMPARISON_MODEL_BAD_OUTPUT`, and
   * only an unreadable source set is `COMPARISON_FETCH_FAILED`.
   */
  const failureCode: ComparisonFailureCode | null =
    status === "UNAVAILABLE"
      ? !ranked.length
        ? "COMPARISON_FETCH_FAILED"
        : asserted === 0
          ? "COMPARISON_NOT_ASSERTED"
          : "COMPARISON_MODEL_BAD_OUTPUT"
      : null;

  const counts = overlapCounts(units);
  const background = input.brief.backgroundCurriculum
    ? [input.brief.backgroundCurriculum.label, input.brief.backgroundCurriculum.level]
        .filter(Boolean)
        .join(" · ")
    : null;

  /**
   * The summary says which kind of answer this is, in words.
   *
   * A `WEAK` comparison is still useful — every row is classified and cited — so it is
   * never hidden or discarded. What it must not do is read like an authoritative one, so
   * the caveat travels in the same sentence the counts do.
   */
  const summary =
    status === "UNAVAILABLE"
      ? failureCode === "COMPARISON_NOT_ASSERTED"
        ? "I read the pages, but none of them settles any topic in this scope, so I have not marked anything as covered."
        : "I could not compare the two curricula from what I could read."
      : status === "WEAK"
        ? `${comparisonSummarySentence(counts, background)} ${COMPARISON_WEAK_CAVEAT}`
        : comparisonSummarySentence(counts, background);

  return {
    comparison: CurriculumComparisonSchema.parse({
      version: 1,
      status,
      failureCode,
      targetScopeDigest: targetScopeDigest(input.brief),
      backgroundDigest: backgroundDigest(input.brief),
      providerVersion: COMPARISON_PROVIDER_VERSION,
      searchProvider: input.searchProvider,
      createdAt: input.retrievedAt,
      units,
      sources: ranked,
      unresolved: input.extraction.unresolved.slice(0, COMPARISON_LIMITS.unresolved),
      summary,
    }),
    backgroundUnits: input.extraction.backgroundUnits.length,
    downgraded,
    droppedCitations,
  };
}

/** A stated background curriculum, as a research target for the *existing* pipeline. */
export function backgroundTarget(brief: PlanBriefV1): AuthorityTarget | null {
  const background = brief.backgroundCurriculum;
  if (!background?.label.trim()) return null;
  return {
    goal: background.label.trim(),
    subject: background.subjects?.length ? background.subjects.join(", ") : brief.subject.name,
    board: background.board,
    level: background.level,
    country: null,
  };
}

/** The digest-based identity of one comparison question. */
export function comparisonCacheKey(brief: PlanBriefV1): string {
  return digest({
    kind: "COMPARISON",
    targetScopeDigest: targetScopeDigest(brief),
    backgroundDigest: backgroundDigest(brief),
    providerVersion: COMPARISON_PROVIDER_VERSION,
  });
}

const emptyMetrics = (started: number, status: ComparisonStatus): ComparisonMetrics => ({
  latencyMs: Date.now() - started,
  cacheHit: false,
  searchCalls: 0,
  searchResults: 0,
  sourceCandidates: 0,
  sourcesFetched: 0,
  httpRequests: 0,
  fetchBytes: 0,
  modelCalls: 0,
  modelPasses: 0,
  inputTokens: null,
  outputTokens: null,
  inputChars: 0,
  outputChars: 0,
  targetUnits: 0,
  backgroundUnits: 0,
  sourceCount: 0,
  officialSourceCount: 0,
  institutionalSourceCount: 0,
  secondarySourceCount: 0,
  status,
});

/**
 * Run one bounded comparison.
 *
 * The order of the guards is the order of the student's experience: research switched
 * off is answered before anything else and never reaches a provider; a missing search
 * credential is a deployment fact reported honestly; and a missing background
 * curriculum or unconfirmed scope is "not applicable" rather than a failure.
 */
export async function runCurriculumComparison(input: {
  brief: PlanBriefV1;
  search: SearchProvider | null;
  model: ComparisonModel;
  signal?: AbortSignal;
  fetchImpl?: (url: string, options: { signal?: AbortSignal }) => Promise<FetchedSource>;
  now?: () => string;
  /** Re-run even when a reusable comparison is stored. */
  force?: boolean;
}): Promise<ComparisonOutcome> {
  const started = Date.now();
  const retrievedAt = (input.now ?? (() => new Date().toISOString()))();
  const brief = input.brief;
  const targets = comparisonTargets(brief);
  const provider = input.search?.id ?? "none";

  const unavailable = (
    failureCode: ComparisonFailureCode,
    summary: string
  ): ComparisonOutcome => ({
    comparison: CurriculumComparisonSchema.parse({
      version: 1,
      status: "UNAVAILABLE",
      failureCode,
      targetScopeDigest: targetScopeDigest(brief),
      backgroundDigest: backgroundDigest(brief),
      providerVersion: COMPARISON_PROVIDER_VERSION,
      searchProvider: provider,
      createdAt: retrievedAt,
      units: [],
      sources: [],
      unresolved: [],
      summary,
    }),
    metrics: emptyMetrics(started, "UNAVAILABLE"),
  });

  // Research is opt-in and stays opt-in: with the policy off there is no search, no
  // fetch and no model call, exactly as Phase 2.1 requires.
  if (brief.researchPolicy === "OFF")
    return unavailable(
      "COMPARISON_RESEARCH_OFF",
      "You asked Sylf to use only what you give it, so the curricula were not compared."
    );
  const background = backgroundTarget(brief);
  if (!background)
    return unavailable(
      "COMPARISON_NOT_APPLICABLE",
      "Add the curriculum you studied before so Sylf has something to compare against."
    );
  if (!targets.length)
    return unavailable(
      "COMPARISON_NOT_APPLICABLE",
      "Confirm what you need to cover first, so there is something to compare."
    );
  if (!input.search)
    return unavailable(
      "COMPARISON_SEARCH_UNAVAILABLE",
      "Curriculum comparison needs a web search, which is not configured in this deployment. You can still rate your own topics, and the plan will generate either way."
    );

  if (!input.force) {
    const cached = reusableComparison(brief);
    if (cached)
      return {
        comparison: cached,
        metrics: { ...emptyMetrics(started, cached.status), cacheHit: true, sourceCount: cached.sources.length, targetUnits: targets.length },
      };
  }

  let modelPasses = 0;
  let modelCalls = 0;
  let searchCalls = 0;
  let sourceCandidates = 0;
  let sourcesFetched = 0;
  let httpRequests = 0;
  let fetchBytes = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const authorityHosts = resolveAuthorities(background).hosts;

  // ── 1. Plan the searches, with the same planner the scope research uses. ──────
  let plan: ResearchQueryPlan;
  try {
    modelPasses += 1;
    const planned = await input.model.planQueries({
      target: background,
      removedLabels: [],
      authorityHosts,
      signal: input.signal,
    });
    modelCalls += planned.usage.calls || 1;
    inputTokens = planned.usage.inputTokens;
    outputTokens = planned.usage.outputTokens;
    plan = ResearchQueryPlanSchema.parse(planned.plan);
  } catch {
    return unavailable(
      "COMPARISON_MODEL_BAD_OUTPUT",
      "I could not plan a search for your background curriculum. You can rate your own topics instead."
    );
  }

  // ── 2. Search, then fetch the highest-ranked results only. ────────────────────
  const collected: { url: string; title: string; snippet: string | null }[] = [];
  const seenUrls = new Set<string>();
  for (const entry of plan.queries.slice(0, COMPARISON_LIMITS.searchQueries)) {
    searchCalls += 1;
    try {
      const results = await input.search.search({
        query: entry.query,
        limit: COMPARISON_LIMITS.resultsPerQuery,
        signal: input.signal,
      });
      for (const result of results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        collected.push({ url: result.url, title: result.title, snippet: result.snippet });
      }
    } catch {
      continue;
    }
  }
  if (!collected.length)
    return unavailable(
      "COMPARISON_SEARCH_ZERO_RESULTS",
      "I searched for your background curriculum but found nothing I could read."
    );

  const ranked = collected
    .map((result) => ({
      result,
      source: buildSource({ url: result.url, title: result.title, context: background, retrievedAt }),
    }))
    .filter((entry): entry is { result: typeof collected[number]; source: ResearchSource } => entry.source !== null)
    .sort((a, b) => (rankSources([a.source, b.source])[0] === a.source ? -1 : 1));

  const excerpts: { sourceId: string; title: string; url: string; text: string }[] = [];
  const fetchedSources: ResearchSource[] = [];
  let totalChars = 0;
  // Same bounded fallthrough as scope research: keep the top four readable pages, try up to
  // eight candidates to find them. An ordinary run still reads exactly its top four.
  for (const entry of ranked) {
    if (excerpts.length >= COMPARISON_LIMITS.fetchedSources) break;
    if (sourceCandidates >= COMPARISON_LIMITS.sourceCandidateAttempts) break;
    if (totalChars >= COMPARISON_LIMITS.sourceChars * COMPARISON_LIMITS.fetchedSources) break;
    sourceCandidates += 1;
    try {
      const fetched = await (input.fetchImpl ?? (await import("./search/fetch")).fetchSource)(
        entry.result.url,
        { signal: input.signal }
      );
      httpRequests += fetched.requests;
      sourcesFetched += 1;
      fetchBytes += fetched.bytes;
      const text = fetched.text.slice(0, COMPARISON_LIMITS.sourceChars);
      totalChars += text.length;
      if (!text.trim()) continue;
      // The URL kept is the one the fetcher reached, after validating every redirect.
      const source =
        buildSource({ url: fetched.finalUrl, title: entry.result.title, context: background, retrievedAt }) ??
        entry.source;
      fetchedSources.push({ ...source, nodeIds: [], mappingConfidence: "MEDIUM" });
      excerpts.push({ sourceId: source.sourceId, title: entry.result.title, url: fetched.finalUrl, text });
    } catch (error) {
      if (error instanceof FetchError) httpRequests += error.requests;
      continue;
    }
  }
  if (!excerpts.length)
    return unavailable(
      "COMPARISON_FETCH_FAILED",
      "I found pages about your background curriculum but could not read any of them."
    );

  // ── 3. One comparison pass over a bounded payload. ───────────────────────────
  const listedTargets = targets
    .map((unit, index) =>
      `${index + 1}. ref=${unit.unitRef} | ${unit.path.length ? `${unit.path.join(" › ")} › ` : ""}${unit.label}`
    )
    .join("\n")
    .slice(0, COMPARISON_LIMITS.targetChars);
  const inputChars = listedTargets.length + totalChars;
  if (inputChars > COMPARISON_LIMITS.inputChars)
    return unavailable(
      "COMPARISON_MODEL_BAD_OUTPUT",
      "There was too much to compare in one pass. Narrow the scope and try again."
    );

  let extraction: ComparisonExtraction;
  let outputChars = 0;
  try {
    modelPasses += 1;
    const compared = await input.model.compare({
      target: input.brief.goal.title ? { goal: input.brief.goal.title, subject: input.brief.subject.name, board: null, level: null, country: null } : background,
      background,
      targetUnits: targets,
      sources: excerpts,
      signal: input.signal,
    });
    modelCalls += compared.usage.calls || 1;
    inputTokens = (inputTokens ?? 0) + (compared.usage.inputTokens ?? 0) || null;
    outputTokens = (outputTokens ?? 0) + (compared.usage.outputTokens ?? 0) || null;
    extraction = ComparisonExtractionSchema.parse(compared.comparison);
    outputChars = JSON.stringify(extraction).length;
  } catch {
    return unavailable(
      "COMPARISON_MODEL_BAD_OUTPUT",
      "I read the pages but could not compare the two curricula from them."
    );
  }

  const built = comparisonFromExtraction({
    brief,
    extraction,
    sources: fetchedSources,
    retrievedAt,
    searchProvider: provider,
    outputChars,
  });

  const official = built.comparison.sources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length;
  const institutional = built.comparison.sources.filter((source) => source.sourceType === "INSTITUTIONAL").length;
  return {
    comparison: built.comparison,
    metrics: {
      latencyMs: Date.now() - started,
      cacheHit: false,
      searchCalls,
      searchResults: collected.length,
      sourceCandidates,
      sourcesFetched,
      httpRequests,
      fetchBytes,
      modelCalls,
      modelPasses,
      inputTokens,
      outputTokens,
      inputChars,
      outputChars,
      targetUnits: targets.length,
      backgroundUnits: built.backgroundUnits,
      sourceCount: built.comparison.sources.length,
      officialSourceCount: official,
      institutionalSourceCount: institutional,
      secondarySourceCount: built.comparison.sources.length - official - institutional,
      status: built.comparison.status,
    },
  };
}

/** The one-line honest reason a comparison cannot run, for the surface. */
export function comparisonAvailability(brief: PlanBriefV1, searchConfigured: boolean): {
  available: boolean;
  reason: string | null;
} {
  if (brief.researchPolicy === "OFF")
    return { available: false, reason: "You asked Sylf to use only what you give it." };
  if (!brief.backgroundCurriculum?.label.trim())
    return { available: false, reason: "Add the curriculum you studied to compare the two." };
  if (!comparisonTargets(brief).length)
    return { available: false, reason: "Confirm what you need to cover first." };
  if (!searchConfigured)
    return {
      available: false,
      reason: "Curriculum comparison needs a web search, which is not configured here.",
    };
  return { available: true, reason: null };
}

export { RESEARCH_BOUNDS };
