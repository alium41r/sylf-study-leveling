import "server-only";
import type { PlanBriefV1, ScopeNode } from "../intake/brief";
import type { AuthorityTarget } from "./authority";
import { rankSources, buildSource, sourceTypeIsOfficial } from "./sources";
import {
  RESEARCH_BOUNDS,
  RESEARCH_DEPTH_BUDGETS,
  RESEARCH_DEPTH_ORDER,
  ResearchExtractionSchema,
  EVIDENCE_LIMITS,
  ResearchFollowupPlanSchema,
  ResearchPlanSchema,
  type ResearchDepth,
  type ResearchExtraction,
  type ResearchFollowupPlan,
  type ResearchPlan,
  type ResearchQueryPlan,
  type SearchProvider,
  type SearchResult,
} from "./search/contracts";
import { buildCandidatePool, type CandidatePool, type PoolContribution } from "./search/pool";
import { DeepSeekResearchError } from "./deepseek";
import { buildLedger, rejectedCount, type EvidenceLedger, type VerifiedEvidenceClaim } from "./evidence";
import { computeCoverage, followUpTargets, summariseCoverage } from "./coverage";
import { dedupeQueries } from "./plan-quality";
import { redactAddresses } from "./redact";
import { SearchProviderError } from "./search/provider";
import type { SearchErrorCode } from "./search/contracts";
import { selectSources } from "./selection";
import type { ResearchSource, ScopeCandidate } from "./contracts";
import type { FetchedSource } from "./search/fetch";
import { respectStudentRemovals, researchBriefDigest, researchCacheKeyFor } from "./service";

/**
 * The bounded research loop.
 *
 * DeepSeek plans the queries and reads the pages; it never supplies a URL and never
 * decides that a source is official. Everything between those two facts is this file's
 * job, and it enforces four ceilings rather than trusting the model's restraint:
 * at most `maxSearchQueries` searches, at most `maxFetchedSources` fetches of the
 * *highest-ranked* results, at most `maxModelPasses` model calls (plan, then extract),
 * and no third round of anything. If the answers do not arrive inside those bounds the
 * outcome is WEAK or UNAVAILABLE — not another attempt.
 *
 * The provenance rule is structural here: `sources` is built only from
 * `SearchResult.url` values and the `finalUrl` the fetcher actually reached, and the
 * model's output schema has no URL field at all, so a model-composed URL has nowhere to
 * land even if one were produced.
 */

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number;
}

export interface ResearchModel {
  /**
   * The adaptive pass: what must be established, then the queries that establish it.
   *
   * Phase 1 replaced the fixed query list with this. The older `planQueries` is still on the
   * interface because the comparison path reuses it verbatim — a background curriculum is one
   * document to locate, and making it state objectives would add a step without adding a
   * decision — but scope research no longer calls it.
   */
  planResearch(input: {
    target: AuthorityTarget;
    removedLabels: string[];
    /** Verified authority hosts the plan may constrain a query to. */
    authorityHosts: string[];
    signal?: AbortSignal;
  }): Promise<{ plan: ResearchPlan; usage: ModelUsage }>;
  planQueries(input: {
    target: AuthorityTarget;
    removedLabels: string[];
    authorityHosts: string[];
    signal?: AbortSignal;
  }): Promise<{ plan: ResearchQueryPlan; usage: ModelUsage }>;
  extract(input: {
    target: AuthorityTarget;
    /** Bounded excerpts, keyed by the sourceIds the server assigned. */
    sources: { sourceId: string; title: string; url: string; text: string }[];
    removedLabels: string[];
    /**
     * The objectives the extraction should ground evidence against.
     *
     * Passed so a claim can be attributed to a question rather than to the document as a whole:
     * coverage is computed per objective, and an unattributed claim cannot settle one.
     */
    objectives: { id: string; question: string; priority: string }[];
    signal?: AbortSignal;
    /** Ceiling for this call, from the depth budget. */
    timeoutMs?: number;
  }): Promise<{
    extraction: ResearchExtraction;
    /**
     * Proposed evidence, unverified.
     *
     * Typed `unknown[]` deliberately: these are the model's raw claims, and they must pass
     * through `buildLedger` before anything treats them as evidence. Giving this a verified type
     * here would be the one shortcut that turns an unverified quotation into a citation.
     */
    claims: unknown[];
    usage: ModelUsage;
  }>;
  /**
   * The follow-up planning pass, which only a DEEP run with open objectives reaches.
   *
   * Separate from `planResearch` rather than reusing it: a follow-up may not restate objectives,
   * change the depth, or ask for another round, and a method that *could* express those things
   * would eventually be used to.
   */
  planFollowUp(input: {
    target: AuthorityTarget;
    /** The original plan's objectives, and which of them are still open. */
    objectives: { id: string; question: string; priority: string }[];
    unresolved: { id: string; question: string; priority: string; state: string }[];
    /** Queries already run, so the follow-up does not repeat them. */
    askedQueries: string[];
    removedLabels: string[];
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<{ plan: ResearchFollowupPlan; usage: ModelUsage }>;
}

export interface ResearchAgentMetrics {
  searchCalls: number;
  searchResults: number;
  /**
   * Retrieval observability, added in Phase 1.
   *
   * The feature document's list, minus the parts that belong to later phases: how many
   * objectives and queries the plan produced, how many distinct URLs and domains came back,
   * how many queries returned nothing, and how many candidates were confirmed by more than one
   * query. Together these are what make "was this a bad plan, bad retrieval, or bad reading?"
   * answerable from telemetry rather than guesswork — a question the fixed two-query plan could
   * not answer at all, because it never recorded an intent to fall short of.
   */
  objectives: number;
  queriesGenerated: number;
  queriesWithResults: number;
  /**
   * Queries discarded as equivalent to an earlier one, before any provider call.
   *
   * Reported rather than silently applied: a model that routinely plans near-duplicate searches is
   * a fact about the planner worth seeing, and the corpus measures the rate across many goals.
   */
  queriesDeduplicated: number;
  /**
   * Results the providers returned, before deduplication.
   *
   * Kept separate from `searchResults` because the feature document asks for both, and
   * because the pair is diagnostic in a way either number alone is not: forty results
   * collapsing to six unique URLs is a pool of six, while forty results staying forty is
   * eight queries that disagreed about everything — two very different runs that a single
   * count would render identical.
   */
  resultsReturned: number;
  /** Distinct domains among the candidates. A single-site pool is a provenance risk. */
  uniqueDomains: number;
  /** Candidates more than one query independently returned. */
  crossConfirmed: number;
  depth: ResearchDepth;
  /** Query results that were duplicates of a URL already in the pool. */
  duplicatesRemoved: number;
  /**
   * Ranked candidates the fetch loop tried — bounded by `maxSourceCandidateAttempts`.
   *
   * `sourceCandidates` counts attempts; `uniqueUrls` counts what retrieval produced before any
   * attempt. Keeping both is what separates "the search was thin" from "the search was fine and
   * the pages would not load".
   */
  sourceCandidates: number;
  /** Candidates read successfully — bounded by the depth's fetch budget. */
  sourcesFetched: number;
  /**
   * Pages the *selection* chose to attempt, which is not the same as pages read.
   *
   * A candidate the selector picked and the network refused still spent a slot, and the
   * difference between "chose four" and "read two of them" is where a run's real cost hides.
   */
  selectedSources: number;
  /** Claims the evidence contract accepted after proving their excerpts. */
  evidenceAccepted: number;
  /** Claims it dropped, for any reason. See `EVIDENCE_REJECTIONS` for the breakdown. */
  evidenceRejected: number;
  /** Per-objective outcome, as counts. The numbers the coverage surface reads. */
  coverage: {
    totalObjectives: number;
    covered: number;
    partial: number;
    unanswered: number;
    conflicted: number;
    highPriorityUnanswered: number;
  };
  /** Whether the bounded follow-up round ran at all. */
  followUpUsed: boolean;
  /** Follow-up queries issued. Zero whenever `followUpUsed` is false. */
  followupQueries: number;
  /** Which schema field the model's answer failed on, when it failed. Null when it parsed. */
  modelFailure: string | null;
  /** Objective coverage before the follow-up round, for comparison with the final state. */
  coverageBefore: {
    totalObjectives: number;
    covered: number;
    partial: number;
    unanswered: number;
    conflicted: number;
    highPriorityUnanswered: number;
  };
  /** Attempts that failed, by cause. Fetch failures were previously invisible. */
  fetchFailures: number;
  /** HTTP requests issued, redirect hops included. Never a source count. */
  httpRequests: number;
  fetchBytes: number;
  modelCalls: number;
  modelPasses: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface ResearchAgentOutcome {
  candidate: ScopeCandidate;
  metrics: ResearchAgentMetrics;
  /** The ranked results, for telemetry counts and for the report's measurements. */
  results: SearchResult[];
}

const NO_USAGE: ModelUsage = { inputTokens: null, outputTokens: null, calls: 0 };

/** Deterministic ids: the same extraction always yields the same candidate. */
function nodeIdFor(label: string, claimed: Set<string>): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = `r-${slug || "unit"}`;
  let candidate = base;
  for (let bump = 2; claimed.has(candidate); bump += 1) candidate = `${base}-${bump}`.slice(0, 60);
  claimed.add(candidate);
  return candidate;
}

/**
 * Turn a validated extraction into candidate nodes.
 *
 * `parentIndex` is an index into the same array, so a cycle is possible in principle;
 * the walk below refuses one rather than looping, and an unknown sourceId is dropped
 * rather than trusted — the server knows which ids it issued, and a model that invents
 * one has not earned a citation.
 */
export function nodesFromExtraction(
  extraction: ResearchExtraction,
  issuedSourceIds: ReadonlySet<string>
): { nodes: ScopeNode[]; droppedCitations: number } {
  const claimed = new Set<string>();
  const ids: string[] = [];
  let droppedCitations = 0;

  const citedFor = (index: number): string[] => {
    const mapping = extraction.sourceMappings.find((entry) => entry.nodeIndexes.includes(index));
    if (!mapping) return [];
    const valid = mapping.sourceIds.filter((id) => issuedSourceIds.has(id));
    droppedCitations += mapping.sourceIds.length - valid.length;
    return [...new Set(valid)];
  };

  extraction.scope.slice(0, RESEARCH_BOUNDS.maxFetchedSources * 50).forEach((unit, index) => {
    // Redacted before the id is derived, so the id and the label the student sees are built from
    // the same string. See `redact.ts` for why a label is a place an address can arrive.
    const label = redactAddresses(unit.label.trim()).slice(0, 200);
    if (!label) {
      ids.push("");
      return;
    }
    // A parent that is itself, or that points forward/out of range, is treated as
    // top-level: the tree is repaired by *dropping* the bad edge, never by inventing one.
    const parentIndex = unit.parentIndex;
    const parentValid =
      parentIndex !== null && parentIndex >= 0 && parentIndex < index && ids[parentIndex] !== "";
    ids.push(nodeIdFor(label, claimed));
    void parentValid;
  });

  const nodes: ScopeNode[] = [];
  extraction.scope.forEach((unit, index) => {
    const label = redactAddresses(unit.label.trim()).slice(0, 200);
    if (!label || !ids[index]) return;
    const parentIndex = unit.parentIndex;
    const parentValid =
      parentIndex !== null && parentIndex >= 0 && parentIndex < index && Boolean(ids[parentIndex]);
    const sources = citedFor(index);
    nodes.push({
      nodeId: ids[index],
      label,
      kind: unit.kind,
      parentId: parentValid ? ids[parentIndex!] : null,
      selected: true,
      ...(sources.length ? { sourceIds: sources.slice(0, 4) } : {}),
    });
  });

  return { nodes, droppedCitations };
}

export async function runResearchAgent(input: {
  brief: PlanBriefV1;
  target: AuthorityTarget;
  search: SearchProvider | null;
  model: ResearchModel;
  signal?: AbortSignal;
  /** Injected so tests can drive the loop without network. */
  fetchImpl?: (url: string, options: { signal?: AbortSignal }) => Promise<FetchedSource>;
  authorityHosts?: string[];
  now?: () => string;
  /**
   * The tier this run must use, when something above the agent requires one.
   *
   * Unset — the usual case — leaves the choice to the model, which is the only thing that knows
   * how hard the question looks. Set, it is the depth, in both directions: a caller requiring
   * `STANDARD` caps a plan that wanted `DEEP`, and a caller requiring `DEEP` gets a deep run even
   * if the model judged the question easy.
   *
   * The second direction is what makes an explicit request mean anything. A pure ceiling would let
   * `requestedDepth: DEEP` quietly produce `STANDARD` research, which is precisely the
   * substitution the cache-quality rule exists to prevent — it would be strange to refuse a
   * *cached* shallow answer while allowing a freshly computed one.
   */
  requiredDepth?: ResearchDepth;
}): Promise<ResearchAgentOutcome> {
  const started = Date.now();
  const retrievedAt = (input.now ?? (() => new Date().toISOString()))();
  /**
   * Resolve the page fetcher **once**, before any wave runs.
   *
   * This was a `await import("./search/fetch")` inside the per-candidate closure, which was harmless
   * while reads were sequential and is not once they are concurrent: several dynamic imports of the
   * same module resolve at the same moment, and in the test environment that raced past a module
   * mock to the real fetcher — a live network call inside a suite that must never make one. Resolving
   * it here is also simply cheaper, and makes the injected fetcher a single explicit decision rather
   * than a per-candidate one.
   */
  const fetchPage =
    input.fetchImpl ?? (await import("./search/fetch")).fetchSource;
  const digest = researchBriefDigest(input.brief);
  /**
   * The *question* key, not the brief digest.
   *
   * These are different facts and the distinction matters: `briefDigest` says "which brief
   * was this computed against" (staleness), while `cacheKey` says "which question does this
   * answer" (reuse). Stamping the brief digest here instead made every real research run
   * un-reusable — the lookup compares against the question key — so the same request against
   * the same brief searched, fetched and called the model again every time.
   */
  const cacheKey = researchCacheKeyFor(input.brief);
  let modelCalls = 0;
  let modelPasses = 0;
  let searchCalls = 0;
  /** Distinct source candidates the loop tried. A redirect hop inside one is not another. */
  let sourceCandidates = 0;
  /** Candidates that were read successfully. The set the model sees. */
  let sourcesFetched = 0;
  /** Raw HTTP requests, redirects included — the network cost, measured separately. */
  let httpRequests = 0;
  let fetchBytes = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  /**
   * Retrieval state, declared here rather than beside its assignment.
   *
   * `unavailable()` can be returned from six places — before the plan exists, after it, and
   * after retrieval — and every one of them should report what was actually spent reaching
   * that point. A counter declared next to its use would report zero in the failures that
   * matter most, which is exactly when the numbers are being read.
   */
  let depth: ResearchDepth = "STANDARD";
  let objectivesGenerated = 0;
  let queriesGenerated = 0;
  /** Queries dropped as equivalent to an earlier one, before any provider call. */
  let queriesDeduplicated = 0;
  let queriesWithResults = 0;
  let uniqueDomains = 0;
  let crossConfirmed = 0;
  let duplicatesRemoved = 0;
  let fetchFailures = 0;
  /** Why the model's answer was unusable, when it was. A schema path, never page content. */
  let modelFailure: string | null = null;
  let resultsReturned = 0;

  const unavailable = (summary: string, failureCode: ScopeCandidate["failureCode"]): ResearchAgentOutcome => ({
    candidate: {
      version: 1,
      origin: "RESEARCH",
      status: "UNAVAILABLE",
      confidence: "LOW",
      failureCode,
      briefDigest: digest,
      retrievedAt,
      provider: "deepseek-search",
      cacheKey,
      nodes: [],
      sources: [],
      openQuestions: [],
      summary,
    },
    metrics: {
      searchCalls,
      searchResults: 0,
      objectives: objectivesGenerated,
      queriesGenerated: queriesGenerated,
      queriesDeduplicated,
      queriesWithResults: 0,
      resultsReturned: 0,
      uniqueDomains: 0,
      crossConfirmed: 0,
      depth,
      duplicatesRemoved: 0,
      sourceCandidates,
      sourcesFetched,
      fetchFailures: 0,
      httpRequests,
      fetchBytes,
      selectedSources: 0,
      evidenceAccepted: 0,
      evidenceRejected: 0,
      coverage: {
        totalObjectives: objectivesGenerated,
        covered: 0,
        partial: 0,
        unanswered: objectivesGenerated,
        conflicted: 0,
        highPriorityUnanswered: 0,
      },
      followUpUsed: false,
      followupQueries: 0,
      modelFailure,
      // Nothing has been researched when a run ends before its first extraction, so the "before"
      // picture and the reported one are the same: no objective covered, all of them open.
      coverageBefore: {
        totalObjectives: objectivesGenerated,
        covered: 0,
        partial: 0,
        unanswered: objectivesGenerated,
        conflicted: 0,
        highPriorityUnanswered: 0,
      },
      modelCalls,
      modelPasses,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
    },
    results: [],
  });

  // A missing provider is a deployment fact, not a failure of the search: there is no
  // model fallback to memory here, and there deliberately never will be.
  if (!input.search)
    return unavailable(
      "Search is not configured, so I could not look for a syllabus. You can upload one, paste an outline, or enter the scope yourself.",
      "RESEARCH_UNAVAILABLE"
    );
  if (!input.brief.goal.title.trim())
    return unavailable("Tell Sylf what you are preparing for first.", "RESEARCH_NOT_APPLICABLE");

  let plan: ResearchPlan;
  try {
    modelPasses += 1;
    const planned = await input.model.planResearch({
      target: input.target,
      removedLabels: input.brief.scope.removedLabels,
      authorityHosts: input.authorityHosts ?? [],
      signal: input.signal,
    });
    modelCalls += planned.usage.calls || 1;
    inputTokens = planned.usage.inputTokens;
    outputTokens = planned.usage.outputTokens;
    // The plan is validated rather than trusted: a model that returns twelve queries, or an
    // objective id no query references, is corrected by the schema and then by the slice below.
    plan = ResearchPlanSchema.parse(planned.plan);
  } catch {
    return unavailable(
      "I could not plan a search for this. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      "RESEARCH_UNAVAILABLE"
    );
  }

  /**
   * The depth the plan chose, bounded twice.
   *
   * The model picks the tier, and the tier's ceiling is intersected with the global one, so a
   * tier can only ever narrow a run. An unrecognised depth falls back to `STANDARD` rather
   * than throwing: the schema already rejects one, and a run whose only problem is a depth
   * label should not lose the research that was planned around it.
   */
  /**
   * A required tier wins; otherwise the model's choice stands.
   *
   * A plan asking for `DEEP` under a required `STANDARD` runs as `STANDARD`, for the same reason a
   * tier can only narrow the global bounds: the requirement is the authority, and a model that
   * could escalate past it would make it advisory.
   */
  depth =
    input.requiredDepth && RESEARCH_DEPTH_ORDER[plan.depth] > RESEARCH_DEPTH_ORDER[input.requiredDepth]
      ? input.requiredDepth
      : (input.requiredDepth ?? plan.depth);
  const budget = RESEARCH_DEPTH_BUDGETS[depth] ?? RESEARCH_DEPTH_BUDGETS.STANDARD;
  const maxQueries = Math.min(budget.maxQueries, RESEARCH_BOUNDS.maxSearchQueries);
  const perQuery = Math.min(budget.maxResultsPerQuery, RESEARCH_BOUNDS.maxResultsPerQuery);
  objectivesGenerated = plan.objectives.length;
  queriesGenerated = plan.queries.length;

  /**
   * Queries are executed for the objectives they serve, and an objective nothing serves is
   * dropped rather than searched for: a query naming an unknown objective id cannot be traced
   * to a question, and an untraceable query is one whose results no later phase can attribute.
   * The plan's own order is preserved so the same plan always searches the same way.
   */
  const objectiveIds = new Set(plan.objectives.map((objective) => objective.id));
  const missingObjective = plan.queries.some((entry) => !objectiveIds.has(entry.objectiveId));
  if (missingObjective) {
    return unavailable(
      "I could not plan a search for this. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      "RESEARCH_UNAVAILABLE"
    );
  }
  /**
   * Duplicate queries are removed **before** any provider call.
   *
   * A redundant query is not breadth: it costs a provider call, a share of the candidate pool, and a
   * slot in the pool's confirmation counts, while returning the pages the query it duplicates already
   * returned. Removing it costs nothing and cannot lose coverage, because the retained query is the
   * same search — and the objectives of the queries it replaced are folded into it, so the candidates
   * it finds are still attributed to every question that asked for them.
   */
  const deduped = dedupeQueries(plan.queries.slice(0, maxQueries));
  queriesDeduplicated = deduped.dropped;
  const queries = deduped.kept.map((entry) => ({
    query: entry.query,
    purpose: plan.queries.find((candidate) => candidate.query === entry.query)?.purpose ?? "OFFICIAL_SYLLABUS",
    objectiveId: entry.objectiveId,
    objectiveIds: entry.droppedObjectives,
  }));

  /**
   * Independent queries run concurrently, bounded by `maxConcurrentSearches`.
   *
   * The wait here is dominated by the slowest provider call rather than by how many are made,
   * so eight sequential searches cost eight round trips of latency for a pool two concurrent
   * batches would fetch in the time of one. Determinism is preserved by *collecting* in plan
   * order after awaiting: results are merged into the pool in the order the plan listed them,
   * never in the order the network happened to answer, so the same plan yields the same pool,
   * the same ranking and the same fetch budget on a slow afternoon as on a fast one.
   *
   * One failed query still does not end the run — the others may find the document, and if
   * none does the outcome says so honestly — but the failure is now *counted*, because
   * "three of your eight queries were rejected by the provider" is the difference between a
   * thin search and a broken one.
   */
  /**
   * Retrieval contributions, in plan order, accumulating across the initial round and the
   * follow-up round. One list, so the pool that results is a merge rather than two pools.
   */
  const contributions: PoolContribution[] = [];
  /**
   * Why each failed query failed, kept rather than discarded.
   *
   * The bare `catch` this replaces threw the reason away, and the cost of that was measured
   * rather than imagined: with a search key the provider rejects, every query fails, the pool
   * comes back empty, and the run reported **`SEARCH_ZERO_RESULTS`** — *"I searched but found
   * nothing I could use. You can upload a syllabus, paste an outline, or enter the scope
   * yourself."* That sentence blames the student's wording and sends them off to type their
   * syllabus by hand, when the truth is that nothing was searched at all. The failure codes
   * already existed (`SEARCH_UNAUTHORIZED`, `SEARCH_RATE_LIMITED`, and the rest); they were
   * simply being dropped on the floor between the provider and the report.
   */
  const providerFailures: SearchErrorCode[] = [];
  for (let start = 0; start < queries.length; start += RESEARCH_BOUNDS.maxConcurrentSearches) {
    const batch = queries.slice(start, start + RESEARCH_BOUNDS.maxConcurrentSearches);
    const answers = await Promise.all(
      batch.map(async (entry) => {
        searchCalls += 1;
        try {
          const results = await input.search!.search({
            query: entry.query,
            limit: perQuery,
            signal: input.signal,
          });
          return { query: entry.query, objectiveId: entry.objectiveId, results };
        } catch (error) {
          if (error instanceof SearchProviderError) providerFailures.push(error.code);
          return { query: entry.query, objectiveId: entry.objectiveId, results: null };
        }
      })
    );
    for (const answer of answers) {
      if (answer.results === null) continue;
      contributions.push({ query: answer.query, objectiveId: answer.objectiveId, results: answer.results });
    }
  }

  /**
   * The candidate pool: everything retrieval produced, deduplicated once, with the trace kept.
   *
   * Deduplication moved here from an inline `Set` in the old loop for one reason — the old one
   * kept the URL and discarded the evidence. A document returned by four of the eight queries
   * is a far stronger candidate than one returned by a single query, and that fact was being
   * thrown away before anything could rank on it.
   */
  const pool: CandidatePool = buildCandidatePool({ contributions });
  const collected: SearchResult[] = pool.entries;
  queriesWithResults = pool.queriesWithResults;
  uniqueDomains = pool.uniqueDomains;
  crossConfirmed = pool.crossConfirmed;
  duplicatesRemoved = pool.duplicatesRemoved;
  resultsReturned = pool.rawResults;

  /**
   * An empty pool has two very different causes, and they must not share one sentence.
   *
   * If *every* query failed at the provider, nothing was searched: the student's wording is not
   * the problem and telling them to rephrase, upload or type it out is a lie that costs them the
   * work of doing research by hand. `RESEARCH_UNAVAILABLE` is the honest code for it, and the
   * copy says so and says which fault it was.
   *
   * If at least one query was answered and produced nothing, the search genuinely came back
   * empty and `SEARCH_ZERO_RESULTS` is exactly right — that is the case the old copy was
   * written for.
   */
  if (!collected.length) {
    const allFailed = providerFailures.length > 0 && providerFailures.length >= searchCalls;
    if (allFailed)
      return unavailable(
        SEARCH_FAILURE_COPY[providerFailures[0]] ?? SEARCH_FAILURE_COPY.DEFAULT,
        "RESEARCH_UNAVAILABLE"
      );
    return unavailable(
      "I searched but found nothing I could use. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      "SEARCH_ZERO_RESULTS"
    );
  }

  /**
   * Reading is now a *selection* problem rather than a sort.
   *
   * Phase 1 sorted the pool by authority-then-relevance and read the top four. That is what this
   * replaces: `selectSources` assigns each read slot to the candidate with the best marginal
   * value, which is how four slots can end up answering four different questions instead of four
   * copies of the syllabus objective. Authority semantics are not weakened — authority becomes one
   * weighted term among several instead of the only ordering, and the reranking matrix pins both
   * directions of that trade.
   */
  const excerpts: { sourceId: string; title: string; url: string; text: string }[] = [];
  const fetchedSources: ResearchSource[] = [];
  const readUrls = new Set<string>();
  const failedUrls = new Set<string>();
  const chosenDomains = new Map<string, number>();
  /** The pool grows across rounds; `rebuildPool` re-derives it from every contribution so far. */
  let pooled: CandidatePool = pool;
  let selectedSources = 0;
  let totalChars = 0;
  let followupQueries = 0;
  let followUpUsed = false;

  /**
   * The year the request itself names, when it names one.
   *
   * Taken from the goal the student wrote and from the exam date, and from nowhere else: a year
   * inferred from a *result* would let a stale document define what "current" means. When this is
   * null no version preference is applied at all, so a timeless topic is not ranked by recency.
   */
  const targetYear = (() => {
    const goalYears = (input.target.goal.match(/\b(20\d{2})\b/g) ?? []).map(Number);
    if (goalYears.length) return Math.max(...goalYears);
    const examDate = input.brief.target.examDate ?? input.brief.target.endDate ?? null;
    const examYear = examDate ? Number(String(examDate).slice(0, 4)) : Number.NaN;
    return Number.isFinite(examYear) ? examYear : null;
  })();

  const maxFetch = Math.min(budget.maxFetchedSources, RESEARCH_BOUNDS.maxFetchedSources);
  const maxChars = Math.min(budget.maxTotalSourceChars, RESEARCH_BOUNDS.maxTotalSourceChars);
  /**
   * What the first round may spend, leaving the rest for the follow-up.
   *
   * The character budget is shared proportionally rather than first-come: a first round that
   * consumed all the text allowance would leave a follow-up able to fetch pages and unable to have
   * them read, which is a worse failure than not searching at all because it costs the searches.
   */
  const firstRoundSources = Math.min(budget.initialFetchedSources, maxFetch);
  const firstRoundChars = Math.floor((maxChars * firstRoundSources) / maxFetch);
  const objectiveList = plan.objectives.map((objective) => ({
    id: objective.id,
    question: objective.question,
    priority: objective.priority,
  }));

  /** Rebuild the pool from every contribution so far. Dedupe is idempotent, so this is safe. */
  const rebuildPool = () => {
    pooled = buildCandidatePool({ contributions });
    queriesWithResults = pooled.queriesWithResults;
    uniqueDomains = pooled.uniqueDomains;
    crossConfirmed = pooled.crossConfirmed;
    duplicatesRemoved = pooled.duplicatesRemoved;
    resultsReturned = pooled.rawResults;
  };
  rebuildPool();

  /**
   * Run a batch of queries, bounded and concurrent, returning contributions in plan order.
   *
   * Shared by the initial round and the follow-up round so both use the same provider chain, the
   * same concurrency ceiling and the same deterministic merge. A follow-up is another round of
   * retrieval, not a second research system.
   */
  const runQueryBatch = async (
    batch: { query: string; objectiveId: string; objectiveIds?: string[] }[],
    limit: number
  ): Promise<void> => {
    for (let start = 0; start < batch.length; start += RESEARCH_BOUNDS.maxConcurrentSearches) {
      const slice = batch.slice(start, start + RESEARCH_BOUNDS.maxConcurrentSearches);
      const answers = await Promise.all(
        slice.map(async (entry) => {
          searchCalls += 1;
          try {
            const results = await input.search!.search({ query: entry.query, limit, signal: input.signal });
            return { entry, results };
          } catch {
            return { entry, results: null };
          }
        })
      );
      for (const answer of answers) {
        if (answer.results === null) continue;
        contributions.push({
          query: answer.entry.query,
          objectiveId: answer.entry.objectiveId,
          ...(answer.entry.objectiveIds?.length ? { objectiveIds: answer.entry.objectiveIds } : {}),
          results: answer.results,
        });
      }
    }
  };

  /**
   * Fetch the pages this round selected, up to the run's remaining read budget.
   *
   * The open-objective set is a parameter rather than something this reads from coverage, because
   * the first round runs before any evidence exists — at that point every objective is open, and
   * deriving that from an empty ledger would mean reading coverage before it can be computed.
   * Later rounds pass what the ledger actually left unanswered.
   */
  const readRound = async (
    openObjectiveIds: ReadonlySet<string>,
    cap: { sources: number; chars: number }
  ): Promise<string[]> => {
    const readNow: string[] = [];
    const ceilingSources = Math.min(cap.sources, maxFetch);
    const ceilingChars = Math.min(cap.chars, maxChars);

    /**
     * Read in bounded concurrent waves, accepting each wave in selection order.
     *
     * Two behaviours have to hold at once and they pull in opposite directions. *Within* a wave the
     * selection spreads across objectives, which is what stops four slots going to four pages that
     * answer the same question. *Across* waves it falls through failures, which is what stops four
     * unreadable official pages ending the run while readable ones sit just below the cut — the
     * defect the Phase 2 report's §26–§28 fixed, and not one to reintroduce.
     *
     * Concurrency is bounded in *both* dimensions, and neither bound is a guess:
     *
     * - a wave never exceeds the read slots still available, so parallelism cannot read more pages
     *   than the tier allows;
     * - a wave is also sized by the remaining character budget divided by the largest page we would
     *   keep, so dispatching a wave cannot blow past the text ceiling before the pages' real sizes
     *   are known. Pages smaller than the maximum simply make the wave smaller and the loop longer,
     *   which is the safe direction to be wrong in.
     *
     * What concurrency is *not* allowed to change is which pages are kept. Every fetch in a wave is
     * dispatched at once but the results are consumed in selection order — the order `selectSources`
     * chose them — so a page that answers in 50ms and one that answers in 5s produce the same
     * excerpts, the same source ids and the same counters. Only the wall clock differs.
     */
    for (;;) {
      const slots = ceilingSources - excerpts.length;
      const attemptsLeft = RESEARCH_BOUNDS.maxSourceCandidateAttempts - sourceCandidates;
      const charsLeft = ceilingChars - totalChars;
      if (slots <= 0 || attemptsLeft <= 0 || charsLeft <= 0) break;

      // Worst case, this many pages could fit in the remaining text budget. At least one is always
      // attempted so a tight budget cannot stall the round.
      const byChars = Math.max(1, Math.floor(charsLeft / RESEARCH_BOUNDS.maxSourceChars));
      const waveSize = Math.min(RESEARCH_BOUNDS.maxConcurrentFetches, slots, attemptsLeft, byChars);

      const wave = selectSources({
        pool: pooled.entries,
        context: {
          target: input.target,
          objectives: objectiveList,
          openObjectiveIds,
          chosenDomains,
          failedUrls,
          readUrls,
          targetYear,
        },
        slots: waveSize,
      });
      if (!wave.length) break;

      // Dispatch the whole wave, then consume it in selection order. `attempt` is counted here, at
      // dispatch, so the attempt budget is spent by the wave rather than by whichever fetch happens
      // to settle first.
      sourceCandidates += wave.length;
      selectedSources += wave.length;
      const settled = await Promise.all(
        wave.map(async (scored) => {
          try {
            const fetched = await fetchPage(scored.entry.url, { signal: input.signal });
            return { scored, fetched, error: null as unknown };
          } catch (error) {
            return { scored, fetched: null, error };
          }
        })
      );

      let progressed = false;
      let accepted = 0;
      for (const { scored, fetched, error } of settled) {
        const url = scored.entry.url;
        if (error !== null) {
          // A failed attempt is counted so the cost is visible, then skipped rather than fatal: the
          // next candidate may well be readable, and if none is, the status rules below say so
          // honestly instead of inventing a scope. The URL is remembered so a later wave does not
          // spend another attempt rediscovering that it is unreadable, and so no page is fetched
          // twice in one run.
          fetchFailures += 1;
          failedUrls.add(url);
          /**
           * The redirect hops a failed fetch spent, read structurally.
           *
           * `error instanceof FetchError` would be the obvious form and couples this line to the
           * fetch module being fully present — which, in a suite that mocks that module with only
           * `fetchSource`, turns a handled fetch failure into a thrown one. Asking the error whether
           * it carries a request count cannot fail, and it is the only fact this line needs.
           */
          const spent = (error as { requests?: unknown })?.requests;
          if (typeof spent === "number") httpRequests += spent;
          continue;
        }
        if (!fetched) continue;
        httpRequests += fetched.requests;
        fetchBytes += fetched.bytes;
        readUrls.add(url);
        const text = fetched.text.slice(0, RESEARCH_BOUNDS.maxSourceChars);
        totalChars += text.length;
        if (!text.trim()) {
          // An empty body is a failed read for the model's purposes even though the request
          // succeeded, so it is counted as a failure rather than as a source.
          fetchFailures += 1;
          failedUrls.add(url);
          continue;
        }
        // The URL kept is the one the fetcher *reached*, after validating every redirect.
        const source = buildSource({
          url: fetched.finalUrl,
          title: scored.entry.title,
          context: input.target,
          retrievedAt,
        });
        if (!source) {
          // The redirect landed somewhere that cannot carry provenance. The page was read, so it
          // counts as a read and a failure, but it cannot become a source the model cites.
          fetchFailures += 1;
          failedUrls.add(url);
          continue;
        }
        /**
         * A wave can settle with more readable pages than there are slots left, because the wave was
         * sized before the pages' real sizes were known. Acceptance stops at the ceiling in selection
         * order, so the surplus is a page we asked for and did not keep — counted as a read and not
         * as a source, which is what it is.
         */
        if (excerpts.length >= ceilingSources) {
          sourcesFetched += 1;
          fetchFailures += 1;
          continue;
        }
        sourcesFetched += 1;
        accepted += 1;
        fetchedSources.push({ ...source, nodeIds: [], mappingConfidence: "MEDIUM" });
        excerpts.push({ sourceId: source.sourceId, title: scored.entry.title, url: fetched.finalUrl, text });
        /**
         * Diversity counts what was *read*, never what was attempted.
         *
         * The distinction is not cosmetic. Counting attempts made a host that refuses us look like a
         * host already represented in the evidence, so its own later pages were penalised and a
         * weaker page from an unrepresented domain overtook them — the exact inversion of the
         * authority order this selection exists to respect. Five unreadable NUST pages are not
         * evidence that nust.edu.pk is covered.
         */
        const host = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
          } catch {
            return "";
          }
        })();
        chosenDomains.set(host, (chosenDomains.get(host) ?? 0) + 1);
        readNow.push(source.sourceId);
        progressed = true;
      }
      /**
       * No guard is needed here, and adding one caused a real bug worth recording.
       *
       * A "did anything progress?" check looks obviously right and is wrong in both directions. A
       * wave whose pages all fail makes no progress, and stopping there abandons exactly the
       * fall-through this loop exists to provide: three unreadable official pages would end the round
       * while readable ones sat below the cut. A guard that instead looks at `failedUrls` cannot tell
       * "these had already failed" from "these just failed" without snapshotting the set first, and
       * Phase 2's original form only escaped the problem by being nearly unreachable.
       *
       * Termination does not depend on a guard. Every wave dispatches at least one candidate — the
       * loop breaks first if the budget or the selection is empty — so `sourceCandidates` rises by at
       * least one per iteration and `maxSourceCandidateAttempts` bounds the round. Read and failed
       * URLs are excluded from selection, so the pool shrinks too. Both give a hard stop; neither
       * can stop the run early.
       */
      void progressed;
      void accepted;
    }
    return readNow;
  };

  await readRound(new Set(plan.objectives.map((objective) => objective.id)), {
    sources: firstRoundSources,
    chars: firstRoundChars,
  });

  if (!excerpts.length)
    return unavailable(
      "I found pages but could not read any of them. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      "FETCH_FAILED"
    );

  /**
   * One extraction pass over a batch of pages, returning both the scope and the proposed claims.
   *
   * Called once per round rather than once per run: a follow-up round extracts only the pages it
   * added, so the model is never handed the same nine pages twice. That is the incremental
   * extraction the phase specification asks for, and it keeps the second pass's token cost
   * proportional to the *new* evidence rather than to the whole run.
   */
  const extractionPass = async (batch: typeof excerpts) => {
    modelPasses += 1;
    const extracted = await input.model.extract({
      target: input.target,
      sources: batch,
      removedLabels: input.brief.scope.removedLabels,
      objectives: objectiveList,
      signal: input.signal,
      timeoutMs: budget.modelTimeoutMs,
    });
    modelCalls += extracted.usage.calls || 1;
    inputTokens = (inputTokens ?? 0) + (extracted.usage.inputTokens ?? 0);
    outputTokens = (outputTokens ?? 0) + (extracted.usage.outputTokens ?? 0);
    return {
      extraction: ResearchExtractionSchema.parse(extracted.extraction),
      claims: Array.isArray(extracted.claims) ? extracted.claims : [],
    };
  };

  let pass: { extraction: ResearchExtraction; claims: unknown[] };
  try {
    pass = await extractionPass(excerpts);
  } catch (error) {
    // Recorded, not logged: the reason the model's answer was unusable is the difference between
    // "the pages held no scope" and "our schema and the model disagree", and only one of those is
    // worth acting on. It is a schema path, so nothing from the page travels with it.
    modelFailure = error instanceof DeepSeekResearchError ? (error.detail ?? error.code) : "unknown";
    return unavailable(
      "I read the pages but could not turn them into a scope. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      "RESEARCH_MODEL_BAD_OUTPUT"
    );
  }

  /**
   * The ledger, built from claims the server can prove.
   *
   * `buildLedger` drops anything whose excerpt is not found in the fetched text, so by the time a
   * claim reaches coverage it is backed by a verbatim span of a page this run actually read.
   */
  const ledgerFor = (proposed: unknown[], carried?: VerifiedEvidenceClaim[]) =>
    buildLedger({
      proposed,
      fetched: excerpts.map((entry) => ({ sourceId: entry.sourceId, text: entry.text })),
      knownObjectiveIds: new Set(plan.objectives.map((objective) => objective.id)),
      ...(carried ? { carried } : {}),
    });

  let ledger = ledgerFor(pass.claims);
  const coverageFor = () => computeCoverage({ objectives: plan.objectives, ledger, sources: fetchedSources, targetYear });
  let coverage = coverageFor();
  /**
   * Coverage as it stood before the follow-up round.
   *
   * Kept because the only way to answer "did the deeper tier buy anything?" is to compare the two,
   * and a run that spent an extra round and a search quota to move no objective is a fact worth
   * being able to see rather than assume.
   */
  const coverageBeforeFollowUp = summariseCoverage(coverage);
  let extraction = pass.extraction;
  let merged = nodesFromExtraction(extraction, new Set(fetchedSources.map((source) => source.sourceId)));

  /**
   * Exactly one follow-up round, and only when the tier permits it and something important is
   * still open.
   *
   * The stopping rule is the whole design. The phase specification forbids the unbounded
   * plan → search → inspect → search loop, so this is an `if` and not a `while`: a DEEP run whose
   * evidence answers every objective stops here, a DEEP run with a gap gets one more round, and a
   * run that still has a gap after that reports the gap honestly instead of searching again.
   * Coverage recomputed after the round is the final answer either way.
   */
  const targets = followUpTargets(coverage);
  if (budget.followUpRounds > 0 && targets.length) {
    try {
      modelPasses += 1;
      const plannedFollowUp = await input.model.planFollowUp({
        target: input.target,
        objectives: objectiveList,
        unresolved: targets.map((entry) => ({
          id: entry.objectiveId,
          question: entry.question,
          priority: entry.priority,
          state: entry.state,
        })),
        askedQueries: contributions.map((contribution) => contribution.query),
        removedLabels: input.brief.scope.removedLabels,
        signal: input.signal,
        timeoutMs: budget.modelTimeoutMs,
      });
      modelCalls += plannedFollowUp.usage.calls || 1;
      inputTokens = (inputTokens ?? 0) + (plannedFollowUp.usage.inputTokens ?? 0);
      outputTokens = (outputTokens ?? 0) + (plannedFollowUp.usage.outputTokens ?? 0);

      const followUpPlan = ResearchFollowupPlanSchema.parse(plannedFollowUp.plan);
      const openIds = new Set(targets.map((entry) => entry.objectiveId));
      /**
       * Every follow-up query must aim at an objective that is genuinely open.
       *
       * A query citing an objective outside the original plan, or one that is already answered,
       * means the follow-up is not doing the bounded job it was asked to do. The whole plan is
       * rejected before any search runs — partial execution of a malformed follow-up would spend
       * the one round this run gets on whatever the model happened to get right.
       */
      if (!followUpPlan.queries.every((entry) => entry.objectiveIds.every((id) => openIds.has(id))))
        throw new Error("FOLLOWUP_OBJECTIVE_NOT_OPEN");

      const followUpQueries = followUpPlan.queries.slice(
        0,
        Math.min(budget.maxFollowUpQueries, RESEARCH_BOUNDS.maxFollowUpQueries)
      );
      if (followUpQueries.length) {
        followupQueries = followUpQueries.length;
        await runQueryBatch(
          followUpQueries.map((entry) => ({ query: entry.query, objectiveId: entry.objectiveIds[0] })),
          perQuery
        );
        rebuildPool();

        const before = excerpts.length;
        await readRound(openIds, { sources: maxFetch, chars: maxChars });
        const added = excerpts.slice(before);
        if (added.length) {
          // Incremental extraction: only the pages this round added, merged into the ledger that
          // already exists. The first round's verified claims are carried rather than replaced, so
          // a follow-up can add evidence but can never lose it.
          const incremental = await extractionPass(added);
          ledger = ledgerFor(incremental.claims, ledger.claims);
          /**
           * The scope is refined by the second pass when that pass produced a usable tree, and the
           * first pass's nodes stand when it did not. A follow-up round adds evidence; it does not
           * get to discard a scope the first round already established, and a second pass that
           * extracted only claims must leave the tree alone.
           */
          const refined = nodesFromExtraction(incremental.extraction, new Set(fetchedSources.map((s) => s.sourceId)));
          if (refined.nodes.length) {
            extraction = incremental.extraction;
            merged = refined;
          }
        }
        coverage = coverageFor();
        followUpUsed = true;
      }
    } catch {
      // A follow-up that cannot be planned, validated or read is not a failed run: the evidence
      // from the first round is intact, and the objectives it could not close are reported as
      // open. Reporting the gap is the honest outcome; failing the research would not be.
      followUpUsed = false;
      followupQueries = 0;
    }
  }

  const { nodes, droppedCitations } = merged;
  const officialCount = fetchedSources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length;
  const institutionalCount = fetchedSources.filter((source) => source.sourceType === "INSTITUTIONAL").length;
  const secondaryCount = fetchedSources.length - officialCount - institutionalCount;

  const coverageSummary = summariseCoverage(coverage);
  const acceptedEvidence = ledger.claims.length;

  /**
   * Status is earned from sources *and* from verified evidence.
   *
   * The second half is Phase 2's tightening. Phase 1 could report `OK` on the strength of an
   * official page having been read, even when the extraction's own text was the only thing
   * claiming what that page said. A hierarchy the model composed is a hypothesis; the evidence
   * ledger is the proof. So `OK` now requires at least one *verified* claim — an excerpt the
   * server found in a page it fetched — and a run with an official source but no provable
   * evidence is `WEAK`, which is exactly what it is.
   */
  const status: ScopeCandidate["status"] =
    !nodes.length ? "UNAVAILABLE" : officialCount === 0 || acceptedEvidence === 0 ? "WEAK" : "OK";

  const openQuestions: string[] = extraction.unresolved.map(redactAddresses);
  /**
   * Both reasons can be true at once, and when they are, both are said.
   *
   * An institutional-only read with no verifiable evidence is weak for two independent reasons,
   * and the student's next action differs for each: "nothing here is official" and "nothing here
   * is even evidenced". Collapsing them into one sentence would hide whichever was reported
   * second, which is how a run ends up looking better or worse than it was.
   */
  if (status === "WEAK" && officialCount === 0)
    openQuestions.push(
      institutionalCount > 0
        ? "I read these pages, but none of them is the examination authority's own document, so treat the list below as a starting point."
        : "I could not confirm this against an official source. Treat the list below as a starting point."
    );
  if (status === "WEAK" && acceptedEvidence === 0)
    openQuestions.push(
      "I could not confirm any of this against the pages' own wording, so nothing here is evidenced yet."
    );

  /**
   * What is still open, named by objective.
   *
   * The feature document asks the research output to say "which questions are answered and which
   * are not", and this is where that becomes student-visible copy. Primary objectives are named
   * first because they are the ones that decide whether the scope can be trusted; supporting ones
   * only appear when nothing primary is open, so five unanswered details cannot bury the one gap
   * that matters.
   */
  const openByName = coverage.filter((entry) => entry.state !== "COVERED");
  const named = [...openByName.filter((entry) => entry.priority === "PRIMARY"), ...openByName.filter((entry) => entry.priority !== "PRIMARY")];
  if (named.length)
    openQuestions.push(
      coverageSummary.covered === 0
        ? `None of the ${coverageSummary.totalObjectives} things I needed to establish was confirmed by these pages.`
        : `Still unclear: ${named.slice(0, 2).map((entry) => entry.question).join(" ")}`
    );
  if (coverageSummary.conflicted > 0)
    openQuestions.push(
      `${coverageSummary.conflicted} of my questions had credible sources disagreeing, so I have not chosen between them. — see the evidence`
    );
  for (const conflict of extraction.conflicts)
    openQuestions.push(`I found two different scope versions: ${redactAddresses(conflict.description)}`);
  if (droppedCitations > 0)
    openQuestions.push("Some citations did not match the pages I read, so they were left out.");
  if (rejectedCount(ledger) > 0 && acceptedEvidence === 0)
    openQuestions.push("Some quotations could not be found in the pages they were attributed to, so they were left out.");

  const candidate = respectStudentRemovals(
    {
      version: 1,
      origin: "RESEARCH",
      status,
      confidence:
        status === "OK" && officialCount >= 2 && coverageSummary.highPriorityUnanswered === 0
          ? "HIGH"
          : status === "OK" || institutionalCount > 0
            ? "MEDIUM"
            : "LOW",
      failureCode: status === "UNAVAILABLE" ? "RESEARCH_WEAK" : null,
      briefDigest: digest,
      retrievedAt,
      provider: "deepseek-search",
      cacheKey,
      // Phase 2: the depth this run actually used, so a later request can tell whether this
      // answer is as thorough as the one being asked for. Cache quality depends on it.
      depth,
      nodes,
      sources: fetchedSources.slice(0, RESEARCH_BOUNDS.maxFetchedSources),
      /**
       * The last three places model prose reaches the interface, redacted on the way out.
       *
       * `openQuestions` is the array the Phase 3 coverage panel reads ("What Sylf could not
       * settle"), so a URL here is the most exposed of the three; an objective's `question` and a
       * claim's `statement` are the model's own wording too, and both are shown. `statement` is
       * redacted even though a claim only survives on a *verified excerpt*: the excerpt is the
       * page's words and the statement is the model's, and the check that makes the claim evidence
       * says nothing about the statement being address-free.
       *
       * Rejected after redaction rather than before: a bullet that was nothing but an address
       * becomes empty, and an empty bullet is worse than no bullet.
       */
      openQuestions: openQuestions
        .map(redactAddresses)
        .filter((question) => question.length > 0)
        .slice(0, 5),
      summary: summarise(status, nodes.length, officialCount, institutionalCount, secondaryCount),
      coverage: {
        summary: coverageSummary,
        objectives: coverage.slice(0, RESEARCH_BOUNDS.maxResearchObjectives).map((entry) => ({
          ...entry,
          question: redactAddresses(entry.question),
        })),
        followUpUsed,
      },
      evidence: {
        claims: ledger.claims
          .slice(0, EVIDENCE_LIMITS.claims)
          .map((claim) => ({ ...claim, statement: redactAddresses(claim.statement) })),
        rejected: rejectedCount(ledger),
      },
    },
    input.brief.scope.removedLabels
  );

  return {
    candidate,
    metrics: {
      searchCalls,
      searchResults: collected.length,
      objectives: objectivesGenerated,
      queriesGenerated,
      queriesDeduplicated,
      queriesWithResults,
      resultsReturned,
      uniqueDomains,
      crossConfirmed,
      depth,
      duplicatesRemoved,
      sourceCandidates,
      sourcesFetched,
      fetchFailures,
      httpRequests,
      fetchBytes,
      // Phase 2: what the selection was worth, and what the evidence contract kept or threw away.
      selectedSources,
      evidenceAccepted: acceptedEvidence,
      evidenceRejected: rejectedCount(ledger),
      coverage: coverageSummary,
      followUpUsed,
      followupQueries,
      modelFailure,
      coverageBefore: coverageBeforeFollowUp,
      modelCalls,
      modelPasses,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
    },
    results: collected,
  };
}

/**
 * What to tell the student when the search provider itself refused every query.
 *
 * Each one names the *fault* rather than the symptom, because the student's next action differs
 * and none of them is "rephrase your goal". They are deliberately short and free of provider
 * detail: which service and which status code belong in telemetry, not in front of a student.
 */
const SEARCH_FAILURE_COPY: Record<SearchErrorCode | "DEFAULT", string> = {
  SEARCH_UNAUTHORIZED:
    "I could not search at all — the search service is not accepting Sylf's credentials right now. Nothing is wrong with what you typed. You can add the scope yourself, or try again once it is fixed.",
  SEARCH_RATE_LIMITED:
    "I could not search just now — the search service is rate-limiting Sylf. Nothing is wrong with what you typed. You can add the scope yourself, or try again in a few minutes.",
  SEARCH_UNAVAILABLE:
    "I could not reach the search service just now. Nothing is wrong with what you typed. You can add the scope yourself, or try again shortly.",
  SEARCH_TIMEOUT:
    "The search took too long to answer, so I stopped it. You can try again, or add the scope yourself.",
  SEARCH_BAD_RESPONSE:
    "The search service answered with something I could not read. Nothing is wrong with what you typed. You can add the scope yourself, or try again shortly.",
  SEARCH_ZERO_RESULTS:
    "I searched but found nothing I could use. You can upload a syllabus, paste an outline, or enter the scope yourself.",
  DEFAULT:
    "I could not search just now. Nothing is wrong with what you typed. You can add the scope yourself, or try again shortly.",
};

function summarise(
  status: ScopeCandidate["status"],
  nodeCount: number,
  official: number,
  institutional: number,
  secondary: number
): string {
  const where = `${nodeCount} unit${nodeCount === 1 ? "" : "s"}`;
  if (status === "UNAVAILABLE") return "I could not read a usable scope from the pages I found.";
  if (status === "WEAK")
    return institutional > 0
      ? `I found ${where}, but only from ${institutional} institutional source${institutional === 1 ? "" : "s"} rather than the examination authority.`
      : `I found ${where}, but only from ${secondary} source${secondary === 1 ? "" : "s"} I cannot call official.`;
  return `I found ${where} from ${official} official source${official === 1 ? "" : "s"}.`;
}

export { NO_USAGE };
