// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent, type ResearchModel } from "@/lib/planner/research/agent";
import { reusableCandidate, researchBriefDigest, researchCacheKeyFor } from "@/lib/planner/research/service";
import { RESEARCH_DEPTH_BUDGETS } from "@/lib/planner/research/search/contracts";
import type { ScopeCandidate } from "@/lib/planner/research/contracts";
import type { FetchedSource } from "@/lib/planner/research/search/fetch";

/**
 * The DEEP tier, the one bounded follow-up round, and what a cache hit is allowed to claim.
 *
 * Three properties are under test, and each is a place where a plausible implementation would
 * quietly do the wrong thing:
 *
 * - `DEEP` must *differ* from `STANDARD`, in reads and in behaviour, not just in its label.
 * - The follow-up must be an `if` and never a `while` — one round, aimed at what is open, and no
 *   second attempt however unsatisfying the result.
 * - A reused answer must not be more confident than the run that produced it.
 */

const PAGE = "The official specification lists Algebra, Sequences and Series, Calculus and Statistics in that order.";

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering 2027" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
});

const target = { goal: "NUST NET Engineering 2027", subject: "Engineering", board: null, level: null };
const usage = { inputTokens: 10, outputTokens: 10, calls: 1 };

const fetchOk = async (url: string): Promise<FetchedSource> => ({
  finalUrl: url,
  contentType: "text/html",
  text: PAGE,
  partial: false,
  partialReason: null,
  bytes: PAGE.length,
  requests: 1,
});

const results = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://nust.edu.pk/${prefix}/${index}`,
    title: `What subjects are tested in the paper ${prefix} ${index}`,
    snippet: null,
    rank: index + 1,
    provider: "brave" as const,
  }));

const plan = (depth: "LOOKUP" | "STANDARD" | "DEEP", objectives: { id: string; priority: "PRIMARY" | "SUPPORTING" }[]) => ({
  depth,
  objectives: objectives.map((objective) => ({
    id: objective.id,
    question: `What does ${objective.id} require?`,
    priority: objective.priority,
  })),
  queries: objectives.map((objective) => ({
    query: `query for ${objective.id}`,
    purpose: "OFFICIAL_SYLLABUS" as const,
    objectiveId: objective.id,
  })),
});

/**
 * A model that returns evidence for exactly the objectives it is told to.
 *
 * Quoting the page it was handed is what makes the claim survive verification, so a double that
 * wants a covered objective has to reproduce real fetched text.
 */
function modelFor(input: {
  depth: "LOOKUP" | "STANDARD" | "DEEP";
  objectives: { id: string; priority: "PRIMARY" | "SUPPORTING" }[];
  /** Objectives the extraction resolves. Everything else comes back unanswered. */
  resolved: string[];
  /** Objective ids the follow-up planner is asked about, recorded for assertions. */
  followUpSeen?: string[][];
  followUpQueries?: { query: string; purpose: "OFFICIAL_SYLLABUS"; objectiveIds: string[] }[];
  onExtract?: (sourceIds: string[]) => void;
}): ResearchModel {
  return {
    planResearch: vi.fn(async () => ({ plan: plan(input.depth, input.objectives), usage })),
    planQueries: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
    planFollowUp: vi.fn(async ({ unresolved }: { unresolved: { id: string }[] }) => {
      input.followUpSeen?.push(unresolved.map((entry) => entry.id));
      return { plan: { queries: input.followUpQueries ?? [] }, usage };
    }) as never,
    extract: vi.fn(async ({ sources }: { sources: { sourceId: string; text: string }[] }) => {
      input.onExtract?.(sources.map((source) => source.sourceId));
      const primary = sources[0];
      return {
        extraction: {
          targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
          scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
          sourceMappings: [],
          unresolved: [],
          extractionConfidence: "HIGH" as const,
          conflicts: [],
        },
        claims: input.resolved.map((objectiveId) => ({
          objectiveId,
          sourceId: primary.sourceId,
          statement: `The specification covers ${objectiveId}.`,
          excerpt: PAGE,
          evidenceKind: "DIRECT" as const,
          support: "SUPPORTS" as const,
          documentDate: null,
        })),
        usage,
      };
    }) as never,
  };
}

const search = (perQuery: number) => ({
  id: "brave" as const,
  search: vi.fn(async ({ query }: { query: string }) => results(query.replace(/\s+/g, "-"), perQuery)),
});

describe("DEEP is a tier that behaves differently, not a label", () => {
  it("reads more pages than STANDARD from the same pool", async () => {
    const run = async (depth: "STANDARD" | "DEEP") => {
      const fetcher = vi.fn(async (url: string) => fetchOk(url));
      const outcome = await runResearchAgent({
        brief: brief(),
        target,
        search: search(10),
        model: modelFor({ depth, objectives: [{ id: "o1", priority: "PRIMARY" }], resolved: ["o1"] }),
        fetchImpl: fetcher,
      });
      return outcome.metrics.sourcesFetched;
    };
    const standard = await run("STANDARD");
    const deep = await run("DEEP");
    // The whole-run budgets differ, and so does what each actually spends.
    expect(standard).toBe(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
    expect(deep).toBeGreaterThan(standard);
    // With nothing left unanswered there is no follow-up, so the run stops at its first-round
    // share — the reserve exists for the round that did not happen, and is not spent anyway.
    expect(deep).toBe(RESEARCH_DEPTH_BUDGETS.DEEP.initialFetchedSources);
    expect(deep).toBeLessThan(RESEARCH_DEPTH_BUDGETS.DEEP.maxFetchedSources);
  });

  it("cannot be escalated past the server's ceiling", async () => {
    /**
     * The model chooses the tier; the server decides the budget. A plan asking for `DEEP` under a
     * `STANDARD` ceiling reads like a `STANDARD` run, which is the intersection rule Phase 1
     * established and Phase 2 must not weaken.
     */
    const fetcher = vi.fn(async (url: string) => fetchOk(url));
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(10),
      model: modelFor({ depth: "DEEP", objectives: [{ id: "o1", priority: "PRIMARY" }], resolved: ["o1"] }),
      fetchImpl: fetcher,
      // The caller's requirement, not the plan's request, is the authority.
      requiredDepth: "STANDARD",
    });
    expect(outcome.metrics.depth).toBe("STANDARD");
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
  });

  it("performs no follow-up round when every objective was answered first time", async () => {
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "SUPPORTING" },
      ],
      resolved: ["o1", "o2"],
    });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(4),
      model,
      fetchImpl: fetchOk,
    });
    expect(outcome.metrics.followUpUsed).toBe(false);
    expect(outcome.metrics.followupQueries).toBe(0);
    expect(model.planFollowUp).not.toHaveBeenCalled();
    expect(outcome.candidate.coverage?.summary.unanswered).toBe(0);
  });

  it("runs exactly one follow-up round aimed at the objective that is still open", async () => {
    const seen: string[][] = [];
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "SUPPORTING" },
      ],
      resolved: ["o1"],
      followUpSeen: seen,
      followUpQueries: [{ query: "NUST NET o2 requirement", purpose: "OFFICIAL_SYLLABUS", objectiveIds: ["o2"] }],
    });
    const searcher = search(4);
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model,
      fetchImpl: fetchOk,
    });
    // The planner was told only about the objective that came back unanswered.
    expect(seen).toEqual([["o2"]]);
    expect(model.planFollowUp).toHaveBeenCalledTimes(1);
    expect(outcome.metrics.followUpUsed).toBe(true);
    expect(outcome.metrics.followupQueries).toBe(1);
    // Two rounds of queries, and the second round is the follow-up's single query.
    expect(searcher.search).toHaveBeenCalledTimes(3);
    // Four model passes at most: plan, extract, follow-up plan, incremental extract.
    expect(outcome.metrics.modelPasses).toBeLessThanOrEqual(4);
  });

  it("stops after one follow-up even when the objective is still unanswered", async () => {
    // Nothing resolves o2, in either round. The run ends and says so; it does not search again.
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "PRIMARY" },
      ],
      resolved: ["o1"],
      followUpQueries: [{ query: "NUST NET o2 requirement", purpose: "OFFICIAL_SYLLABUS", objectiveIds: ["o2"] }],
    });
    const searcher = search(4);
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model,
      fetchImpl: fetchOk,
    });
    expect(model.planFollowUp).toHaveBeenCalledTimes(1);
    expect(outcome.metrics.followupQueries).toBe(1);
    // The gap is reported rather than papered over.
    expect(outcome.candidate.coverage?.summary.unanswered).toBe(1);
    expect(outcome.candidate.coverage?.objectives.find((entry) => entry.objectiveId === "o2")?.state).toBe(
      "UNANSWERED"
    );
    expect(outcome.candidate.openQuestions.join(" ")).toMatch(/still unclear/i);
  });

  it("does not run a follow-up at STANDARD, even with an objective open", async () => {
    const model = modelFor({
      depth: "STANDARD",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "PRIMARY" },
      ],
      resolved: ["o1"],
      followUpQueries: [{ query: "unused", purpose: "OFFICIAL_SYLLABUS", objectiveIds: ["o2"] }],
    });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(4),
      model,
      fetchImpl: fetchOk,
    });
    expect(model.planFollowUp).not.toHaveBeenCalled();
    expect(outcome.metrics.followUpUsed).toBe(false);
  });
});

describe("the follow-up contract is enforced before anything is searched", () => {
  it("refuses a follow-up aimed at an objective that is not open", async () => {
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "SUPPORTING" },
      ],
      resolved: ["o1"],
      // o9 was never in the plan; o1 is already answered. Both are outside the round's remit.
      followUpQueries: [{ query: "somewhere else entirely", purpose: "OFFICIAL_SYLLABUS", objectiveIds: ["o9"] }],
    });
    const searcher = search(4);
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model,
      fetchImpl: fetchOk,
    });
    // One round of queries only: the malformed follow-up was rejected whole, not partly run.
    expect(searcher.search).toHaveBeenCalledTimes(2);
    expect(outcome.metrics.followUpUsed).toBe(false);
    // And the first round's evidence survives the rejected follow-up.
    expect(outcome.candidate.status).toBe("OK");
  });

  it("refuses a follow-up plan that breaks its own schema", async () => {
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "SUPPORTING" },
      ],
      resolved: ["o1"],
    });
    // A query with no objective at all: the schema requires at least one.
    (model.planFollowUp as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      plan: { queries: [{ query: "a query with no objective", purpose: "OFFICIAL_SYLLABUS", objectiveIds: [] }] },
      usage,
    });
    const searcher = search(4);
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model,
      fetchImpl: fetchOk,
    });
    expect(searcher.search).toHaveBeenCalledTimes(2);
    expect(outcome.metrics.followUpUsed).toBe(false);
  });
});

describe("a follow-up merges into the same pool", () => {
  it("keeps the first round's pages, adds new ones, and never re-fetches", async () => {
    /**
     * The initial pool holds six candidates and the follow-up returns the same six plus four new
     * ones — which is what a real second round looks like, because better queries for the same
     * subject overlap heavily with the first round's.
     *
     * The assertions are the three that matter: the pool grows rather than being replaced, the
     * pages already read are not fetched a second time, and only the *new* pages are sent to the
     * model for extraction.
     */
    const firstRound = results("initial", 6);
    const secondRound = [...results("initial", 6), ...results("followup", 4)];
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async ({ query }: { query: string }) =>
        query.includes("o2") ? secondRound : firstRound
      ),
    };
    const attempted: string[] = [];
    const extractedBatches: number[] = [];
    const model = modelFor({
      depth: "DEEP",
      objectives: [
        { id: "o1", priority: "PRIMARY" },
        { id: "o2", priority: "SUPPORTING" },
      ],
      resolved: ["o1"],
      followUpQueries: [{ query: "query for o2", purpose: "OFFICIAL_SYLLABUS", objectiveIds: ["o2"] }],
      onExtract: (sourceIds) => extractedBatches.push(sourceIds.length),
    });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model,
      fetchImpl: async (url) => {
        attempted.push(url);
        return fetchOk(url);
      },
    });

    // No URL was fetched twice, across both rounds.
    expect(new Set(attempted).size).toBe(attempted.length);
    // The second extraction saw only the pages the follow-up added, not the whole run again.
    expect(extractedBatches).toHaveLength(2);
    expect(extractedBatches[1]).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFetchedSources);
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFetchedSources);
    // The duplicate URLs the follow-up returned were deduplicated, not re-read.
    expect(outcome.metrics.duplicatesRemoved).toBeGreaterThan(0);
  });
});

describe("a reused answer does not claim more than it is", () => {
  const candidate = (over: Partial<ScopeCandidate> = {}): ScopeCandidate =>
    ({
      version: 1,
      origin: "RESEARCH",
      status: "OK",
      confidence: "HIGH",
      briefDigest: "x".repeat(32),
      retrievedAt: "2030-01-01T00:00:00.000Z",
      provider: "deepseek-search",
      cacheKey: "placeholder",
      depth: "STANDARD",
      nodes: [{ nodeId: "r-algebra", label: "Algebra", kind: "CHAPTER", parentId: null, selected: true }],
      sources: [],
      openQuestions: [],
      summary: "I found 1 unit from 1 official source.",
      failureCode: null,
      ...over,
    }) as ScopeCandidate;

  const withCandidate = (over: Partial<ScopeCandidate>) => {
    const base = brief();
    // Both keys are computed from the brief rather than invented: a fixture with a fake digest
    // would be stale by construction and would test nothing but the staleness check.
    const key = researchCacheKeyFor(base);
    return { ...base, scopeCandidate: candidate({ cacheKey: key, briefDigest: researchBriefDigest(base), ...over }) };
  };

  it("reuses a successful answer for the same question", () => {
    const b = withCandidate({});
    expect(reusableCandidate(b, researchCacheKeyFor(b))).not.toBeNull();
  });

  it("lets a DEEP answer satisfy a STANDARD request", () => {
    const b = withCandidate({ depth: "DEEP" });
    expect(reusableCandidate(b, researchCacheKeyFor(b), "STANDARD")).not.toBeNull();
  });

  it("refuses to pass a STANDARD answer off as explicit DEEP research", () => {
    // The student asked for the extra reading and the coverage check. Serving the cheap answer
    // without saying so is the one thing this gate exists to prevent.
    const b = withCandidate({ depth: "STANDARD" });
    expect(reusableCandidate(b, researchCacheKeyFor(b), "DEEP")).toBeNull();
  });

  it("treats a candidate written before Phase 2 as STANDARD", () => {
    // Older candidates have no depth field. They were produced by a two-tier system, so the
    // honest reading is the cheaper of the two that existed.
    const b = withCandidate({ depth: undefined });
    expect(reusableCandidate(b, researchCacheKeyFor(b), "STANDARD")).not.toBeNull();
    expect(reusableCandidate(b, researchCacheKeyFor(b), "DEEP")).toBeNull();
  });

  it("never reuses a result that answered nothing, whatever depth it claims", () => {
    // A failed lookup is a record of failure, not an answer. Reusing it would make a transient
    // outage permanent for as long as the brief is unchanged.
    const b = withCandidate({ depth: "DEEP", nodes: [] });
    expect(reusableCandidate(b, researchCacheKeyFor(b))).toBeNull();
  });

  it("invalidates when the question changes", () => {
    const b = withCandidate({});
    const other = { ...b, goal: { title: "A completely different examination" } };
    expect(reusableCandidate(other, researchCacheKeyFor(b))).toBeNull();
  });

  it("invalidates when the brief has moved on since the answer was computed", () => {
    const b = withCandidate({ briefDigest: "stale".padEnd(32, "0") });
    expect(reusableCandidate(b, researchCacheKeyFor(b))).toBeNull();
  });
});
