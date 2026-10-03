// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { DeepSeekResearchError } from "@/lib/planner/research/deepseek";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent, type ResearchModel } from "@/lib/planner/research/agent";
import {
  RESEARCH_BOUNDS,
  RESEARCH_DEPTH_BUDGETS,
  RESEARCH_DEPTHS,
  ResearchPlanSchema,
} from "@/lib/planner/research/search/contracts";
import { buildCandidatePool, hostOf, type PoolContribution } from "@/lib/planner/research/search/pool";
import type { FetchedSource } from "@/lib/planner/research/search/fetch";
import type { SearchResult } from "@/lib/planner/research/search/contracts";

/**
 * Phase 1: adaptive research planning, and the broader pool it produces.
 *
 * Two claims are under test, and they are separate. The first is that the *plan* is now
 * derived from stated objectives rather than from a fixed count, and that its depth decides
 * how far retrieval goes. The second is that what comes back is a deduplicated pool which
 * still remembers, for every candidate, which queries and objectives produced it — because
 * that trace is what Phase 2 needs to rank on and what telemetry needs to explain a thin run.
 *
 * The pool is tested directly as a pure function, then through the agent, so a failure says
 * which half broke rather than only that the whole run misbehaved.
 */

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
});

const target = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };

const hit = (url: string, title = "Page", rank = 1, provider: SearchResult["provider"] = "brave"): SearchResult => ({
  url,
  title,
  snippet: null,
  rank,
  provider,
});

const fetched = (finalUrl: string): FetchedSource => ({
  finalUrl,
  contentType: "text/html",
  text: "# Algebra\n- Quadratics",
  partial: false,
  partialReason: null,
  bytes: 21,
  requests: 1,
});

const usage = { inputTokens: 10, outputTokens: 10, calls: 1 };

/** A model whose plan each test supplies. */
const modelWith = (plan: unknown, over: Partial<ResearchModel> = {}): ResearchModel => ({
  planResearch: vi.fn(async () => ({ plan: plan as never, usage })),
  planQueries: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
  // No follow-up queries by default: most tests here are about retrieval, and a run that reports
  // "nothing better to ask" is the honest double for them.
  planFollowUp: vi.fn(async () => ({ plan: { queries: [] }, usage })),
  extract: vi.fn(async ({ sources }: { sources: { sourceId: string; text: string }[] }) => ({
    extraction: {
      targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
      scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
      sourceMappings: [],
      unresolved: [],
      extractionConfidence: "HIGH" as const,
      conflicts: [],
    },
    // A claim quoting the page it was given, so runs in this file can earn `OK`: Phase 2 made
    // status evidence-bound, and a double offering none would leave every run WEAK.
    claims: sources.slice(0, 1).map((source) => ({
      objectiveId: "o1",
      sourceId: source.sourceId,
      statement: "The unit list is Algebra.",
      excerpt: source.text,
      evidenceKind: "DIRECT" as const,
      support: "SUPPORTS" as const,
      documentDate: null,
    })),
    usage,
  })),
  ...over,
});

const plan = (depth: "LOOKUP" | "STANDARD", queries: { query: string; objectiveId?: string }[]) => ({
  depth,
  objectives: [
    { id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" as const },
    { id: "o2", question: "What are the entry requirements?", priority: "SUPPORTING" as const },
  ],
  queries: queries.map((entry, index) => ({
    query: entry.query,
    purpose: (index % 2 === 0 ? "OFFICIAL_SYLLABUS" : "ENTRY_REQUIREMENTS") as "OFFICIAL_SYLLABUS",
    objectiveId: entry.objectiveId ?? "o1",
  })),
});

describe("the candidate pool deduplicates without losing the trace", () => {
  it("keeps which queries and objectives surfaced a candidate, and how many agreed", () => {
    const contributions: PoolContribution[] = [
      { query: "nust net syllabus", objectiveId: "o1", results: [hit("https://nust.edu.pk/net", "NET", 3)] },
      { query: "net engineering scope", objectiveId: "o1", results: [hit("https://nust.edu.pk/net", "NET", 1)] },
      { query: "net entry requirements", objectiveId: "o2", results: [hit("https://nust.edu.pk/net", "NET", 5)] },
    ];
    const pool = buildCandidatePool({ contributions });
    expect(pool.uniqueUrls).toBe(1);
    const only = pool.entries[0];
    // Three queries, two objectives, one candidate — and all of it retained.
    expect(only.confirmations).toBe(3);
    expect(only.objectiveIds).toEqual(["o1", "o2"]);
    expect(only.queries).toEqual(["nust net syllabus", "net engineering scope", "net entry requirements"]);
    // The strongest ordering evidence wins, not the first or the last.
    expect(only.rank).toBe(1);
    expect(pool.crossConfirmed).toBe(1);
    expect(pool.duplicatesRemoved).toBe(2);
    expect(pool.rawResults).toBe(3);
  });

  it("counts a repeat from the same query as a duplicate, not as a confirmation", () => {
    const pool = buildCandidatePool({
      contributions: [{ query: "one", objectiveId: "o1", results: [hit("https://a.example/x"), hit("https://a.example/x")] }],
    });
    expect(pool.entries[0].confirmations).toBe(1);
    expect(pool.crossConfirmed).toBe(0);
    expect(pool.duplicatesRemoved).toBe(1);
  });

  it("merges the same document returned by two providers and names both", () => {
    const pool = buildCandidatePool({
      contributions: [
        { query: "one", objectiveId: "o1", results: [hit("https://www.nust.edu.pk/net", "NET", 2, "brave")] },
        { query: "two", objectiveId: "o1", results: [hit("https://nust.edu.pk/net", "NET", 4, "searxng")] },
      ],
    });
    // `www.` is the same document, so one candidate — found by both providers.
    expect(pool.uniqueUrls).toBe(1);
    expect(pool.entries[0].providers).toEqual(["brave", "searxng"]);
  });

  it("counts distinct domains, so a single-site pool is visible", () => {
    const pool = buildCandidatePool({
      contributions: [
        {
          query: "one",
          objectiveId: "o1",
          results: [
            hit("https://nust.edu.pk/a"),
            hit("https://nust.edu.pk/b"),
            hit("https://www.nust.edu.pk/c"),
            hit("https://prepblog.example/d"),
          ],
        },
      ],
    });
    expect(pool.uniqueUrls).toBe(4);
    expect(pool.uniqueDomains).toBe(2);
  });

  it("is deterministic in plan order, not in the order results arrived", () => {
    // The same contributions in the same order must give the same pool in the same order —
    // the fetch loop walks this list and stops when it holds enough, so the order *is* the
    // budget. A pool that depended on which provider answered first would spend differently
    // on the same question twice.
    const contributions: PoolContribution[] = [
      { query: "one", objectiveId: "o1", results: [hit("https://a.example/1")] },
      { query: "two", objectiveId: "o2", results: [hit("https://b.example/2")] },
    ];
    const first = buildCandidatePool({ contributions });
    const second = buildCandidatePool({ contributions });
    expect(first.entries.map((entry) => entry.url)).toEqual(["https://a.example/1", "https://b.example/2"]);
    expect(second.entries).toEqual(first.entries);
  });

  it("refuses a candidate with no host, and says so rather than shrinking quietly", () => {
    const pool = buildCandidatePool({
      contributions: [{ query: "one", objectiveId: "o1", results: [hit("not-a-url"), hit("https://a.example/x")] }],
    });
    expect(pool.uniqueUrls).toBe(1);
    expect(pool.droppedInvalid).toBe(1);
    expect(hostOf("not-a-url")).toBe("");
  });

  it("stops at the pool ceiling and reports what it dropped", () => {
    const many = Array.from({ length: 10 }, (_, index) => hit(`https://a.example/${index}`));
    const pool = buildCandidatePool({
      contributions: [{ query: "one", objectiveId: "o1", results: many }],
      maxEntries: 4,
    });
    expect(pool.uniqueUrls).toBe(4);
    expect(pool.droppedOverCap).toBe(6);
  });

  it("counts how many queries came back with nothing", () => {
    const pool = buildCandidatePool({
      contributions: [
        { query: "one", objectiveId: "o1", results: [hit("https://a.example/1")] },
        { query: "two", objectiveId: "o2", results: [] },
      ],
    });
    expect(pool.queriesWithResults).toBe(1);
  });
});

describe("research depth decides how far retrieval goes", () => {
  it("runs one query and reads at most three pages for a lookup", async () => {
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async () =>
        Array.from({ length: 10 }, (_, index) => hit(`https://nust.edu.pk/${index}`, `Page ${index}`, index + 1))
      ),
    };
    const fetcher = vi.fn(async (url: string) => fetched(url));
    // The plan asks for three queries; the LOOKUP budget allows one.
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(plan("LOOKUP", [{ query: "nust net syllabus" }, { query: "net scope" }, { query: "net subjects" }])),
      fetchImpl: fetcher,
    });
    expect(searcher.search.mock.calls.length).toBe(RESEARCH_DEPTH_BUDGETS.LOOKUP.maxQueries);
    expect(fetcher.mock.calls.length).toBe(RESEARCH_DEPTH_BUDGETS.LOOKUP.maxFetchedSources);
    expect(outcome.metrics.depth).toBe("LOOKUP");
  });

  it("builds a broad pool at standard depth while still reading only a few pages", async () => {
    /**
     * The feature document's trade in one test: "search broadly but only deeply read the
     * sources that are most useful". Eight queries × ten results produces eighty candidates,
     * and the read budget is still four pages — the pool grew, the expensive half did not.
     */
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async ({ query }: { query: string }) =>
        // Eight distinct hosts — the host varies by query, not by a length they all share.
        Array.from({ length: 10 }, (_, index) =>
          hit(`https://host${query.slice(-1)}.example/${index}`, `P${index}`, index + 1)
        )
      ),
    };
    const fetcher = vi.fn(async (url: string) => fetched(url));
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(
        plan(
          "STANDARD",
          Array.from({ length: 8 }, (_, index) => ({ query: `query number ${index}`, objectiveId: index % 2 ? "o2" : "o1" }))
        )
      ),
      fetchImpl: fetcher,
    });
    expect(searcher.search.mock.calls.length).toBe(RESEARCH_BOUNDS.maxSearchQueries);
    // Eight distinct hosts, ten results each — the pool is the whole retrieval, deduplicated.
    expect(outcome.metrics.searchResults).toBe(RESEARCH_BOUNDS.maxSearchQueries * RESEARCH_BOUNDS.maxResultsPerQuery);
    expect(outcome.metrics.uniqueDomains).toBe(8);
    // And the reading stayed where it was: the tier's own budget, not the outermost ceiling.
    // Phase 2 raised the global bound to admit `DEEP`; `STANDARD` still reads four.
    expect(outcome.metrics.sourcesFetched).toBe(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
    expect(outcome.metrics.sourceCandidates).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxSourceCandidateAttempts);
  });

  it("never searches more queries than the global ceiling, whatever the depth claims", async () => {
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async () => [hit("https://nust.edu.pk/net")]),
    };
    await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      // The schema caps this list at the global bound before the agent ever sees it.
      model: modelWith(
        plan("STANDARD", Array.from({ length: 40 }, (_, index) => ({ query: `q${index}`, objectiveId: "o1" })))
      ),
      fetchImpl: async (url) => fetched(url),
    });
    expect(searcher.search.mock.calls.length).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxSearchQueries);
  });
});

describe("independent queries run concurrently without changing the result", () => {
  it("keeps at most maxConcurrentSearches in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async ({ query }: { query: string }) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return [hit(`https://host${query.length}.example/x`)];
      }),
    };
    await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(
        plan("STANDARD", Array.from({ length: 8 }, (_, index) => ({ query: `query number ${index}`, objectiveId: "o1" })))
      ),
      fetchImpl: async (url) => fetched(url),
    });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxConcurrentSearches);
  });

  it("merges results in plan order even when a later query answers first", async () => {
    // The first query is the slow one; if the pool were built in completion order, its
    // candidate would land last and the ranking below would see a different list.
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async ({ query }: { query: string }) => {
        if (query === "slow") await new Promise((resolve) => setTimeout(resolve, 20));
        return [hit(`https://nust.edu.pk/${query}`)];
      }),
    };
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(plan("STANDARD", [{ query: "slow", objectiveId: "o1" }, { query: "quick", objectiveId: "o2" }])),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.results.map((entry) => entry.url)).toEqual([
      "https://nust.edu.pk/slow",
      "https://nust.edu.pk/quick",
    ]);
  });
});

describe("the plan contract refuses what it cannot serve", () => {
  const valid = {
    depth: "STANDARD",
    objectives: [{ id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" }],
    queries: [{ query: "nust net syllabus", purpose: "OFFICIAL_SYLLABUS", objectiveId: "o1" }],
  };

  it("accepts a plan that states objectives and links queries to them", () => {
    expect(ResearchPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts every tier that exists and refuses one that does not", () => {
    // Phase 1 refused `DEEP` because nothing implemented it. Phase 2 implements it — a larger
    // read budget, a coverage check and one bounded follow-up round — so it is accepted now, and
    // the schema still refuses a tier no code path honours.
    for (const depth of RESEARCH_DEPTHS) {
      expect(ResearchPlanSchema.safeParse({ ...valid, depth }).success).toBe(true);
    }
    expect(ResearchPlanSchema.safeParse({ ...valid, depth: "EXHAUSTIVE" }).success).toBe(false);
  });

  it("refuses more objectives than the bound, and a malformed objective id", () => {
    const many = Array.from({ length: RESEARCH_BOUNDS.maxResearchObjectives + 1 }, (_, index) => ({
      id: `o${index + 1}`,
      question: "Why?",
      priority: "PRIMARY",
    }));
    expect(ResearchPlanSchema.safeParse({ ...valid, objectives: many }).success).toBe(false);
    expect(
      ResearchPlanSchema.safeParse({ ...valid, objectives: [{ id: "objective one", question: "Why?", priority: "PRIMARY" }] })
        .success
    ).toBe(false);
  });

  it("refuses more queries than the global ceiling, and an empty plan", () => {
    const many = Array.from({ length: RESEARCH_BOUNDS.maxSearchQueries + 1 }, () => valid.queries[0]);
    expect(ResearchPlanSchema.safeParse({ ...valid, queries: many }).success).toBe(false);
    expect(ResearchPlanSchema.safeParse({ ...valid, queries: [] }).success).toBe(false);
    expect(ResearchPlanSchema.safeParse({ ...valid, objectives: [] }).success).toBe(false);
  });
});

describe("the DeepSeek planning pass asks for objectives before it asks for queries", () => {
  it("parses a real answer and derives its stated ceilings from the depth budgets", async () => {
    // The spy is on `getAdapter`, so the prompt is read back from the adapter's own mock.
    const generateResponse = vi.fn(async (_messages: unknown, _system: string) => ({
      text: JSON.stringify({
        depth: "STANDARD",
        objectives: [
          { id: "o1", question: "What does the NET syllabus cover?", priority: "PRIMARY" },
          { id: "o2", question: "What are the entry requirements?", priority: "SUPPORTING" },
        ],
        queries: [
          { query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS", objectiveId: "o1" },
          { query: "NUST NET entry requirements", purpose: "ENTRY_REQUIREMENTS", objectiveId: "o2" },
        ],
      }),
    }));
    const spy = vi.spyOn(LLMFactory, "getAdapter").mockReturnValue({ generateResponse } as never);
    try {
      const deepseek = await import("@/lib/planner/research/deepseek");
      const planned = await deepseek.deepseekModel().planResearch({
        target,
        removedLabels: [],
        authorityHosts: ["nust.edu.pk"],
      });
      expect(planned.plan.depth).toBe("STANDARD");
      expect(planned.plan.objectives.map((objective) => objective.id)).toEqual(["o1", "o2"]);
      expect(planned.plan.queries[1].objectiveId).toBe("o2");

      /**
       * The prompt states the tier ceilings, and they are interpolated from
       * `RESEARCH_DEPTH_BUDGETS` rather than typed twice. This assertion is what stops the
       * prompt from promising a budget the server does not enforce: change the constant and
       * the sentence changes with it, so the two cannot drift apart unnoticed.
       */
      const system = String(generateResponse.mock.calls[0][1]);
      expect(system).toContain(`At most ${RESEARCH_DEPTH_BUDGETS.LOOKUP.maxQueries} query.`);
      expect(system).toContain(`Up to ${RESEARCH_DEPTH_BUDGETS.STANDARD.maxQueries} queries.`);
      // And it still forbids the things the model must never decide.
      expect(system).toContain("You do NOT search the web yourself");
      expect(system).toContain("Never include a URL anywhere in your answer.");
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses an answer that is not a usable plan rather than searching anyway", async () => {
    const spy = vi.spyOn(LLMFactory, "getAdapter").mockReturnValue({
      // A plan with no objectives: the queries cannot be traced to anything.
      generateResponse: vi.fn(async () => ({
        text: JSON.stringify({ depth: "STANDARD", objectives: [], queries: [{ query: "nust net", purpose: "OFFICIAL_SYLLABUS", objectiveId: "o1" }] }),
      })),
    } as never);
    try {
      const deepseek = await import("@/lib/planner/research/deepseek");
      await expect(
        deepseek.deepseekModel().planResearch({ target, removedLabels: [], authorityHosts: [] })
      ).rejects.toThrow(DeepSeekResearchError);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("retrieval is observable enough to explain a thin run", () => {
  it("reports the intent, the breadth and the failures as separate counts", async () => {
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async ({ query }: { query: string }) => {
        if (query === "fails") throw new Error("SEARCH_RATE_LIMITED");
        if (query === "empty") return [];
        // Two successful queries sharing one URL: one candidate, two confirmations. The
        // per-query host is derived from the words, so the two queries cannot collide.
        return [hit("https://nust.edu.pk/net"), hit(`https://${query.replace(/\s+/g, "-")}.example/x`)];
      }),
    };
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(
        plan("STANDARD", [
          { query: "finds one", objectiveId: "o1" },
          { query: "fails", objectiveId: "o1" },
          { query: "empty", objectiveId: "o2" },
          { query: "finds two", objectiveId: "o2" },
        ])
      ),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.metrics.objectives).toBe(2);
    expect(outcome.metrics.queriesGenerated).toBe(4);
    // Two of four queries returned something; one returned nothing, one threw.
    expect(outcome.metrics.queriesWithResults).toBe(2);
    // The raw count and the surviving count are different numbers, and both are reported:
    // four results returned, one duplicate removed, three candidates carried forward.
    expect(outcome.metrics.resultsReturned).toBe(4);
    expect(outcome.metrics.duplicatesRemoved).toBe(1);
    // The shared URL was confirmed by both successful queries.
    expect(outcome.metrics.crossConfirmed).toBe(1);
    expect(outcome.metrics.depth).toBe("STANDARD");
    // Three distinct candidates: the shared one, plus one unique per successful query.
    expect(outcome.metrics.searchResults).toBe(3);
  });

  it("counts a page that could not be read, instead of only counting successes", async () => {
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async () => [hit("https://nust.edu.pk/a", "A", 1), hit("https://nust.edu.pk/b", "B", 2)]),
    };
    let calls = 0;
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: searcher,
      model: modelWith(plan("STANDARD", [{ query: "nust net syllabus", objectiveId: "o1" }])),
      fetchImpl: async (url) => {
        calls += 1;
        if (calls === 1) throw new Error("FETCH_FAILED");
        return fetched(url);
      },
    });
    expect(outcome.metrics.fetchFailures).toBe(1);
    expect(outcome.metrics.sourcesFetched).toBe(1);
    // The failed page did not end the run: the next candidate was tried and read.
    expect(outcome.candidate.status).toBe("OK");
  });
});
