// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent, nodesFromExtraction, type ResearchModel } from "@/lib/planner/research/agent";
import { RESEARCH_BOUNDS } from "@/lib/planner/research/search/contracts";
import { researchCacheKeyFor, reusableCandidate } from "@/lib/planner/research/service";
import { FetchError, type FetchedSource } from "@/lib/planner/research/search/fetch";

/**
 * The agent's bounds, and the provenance rule that makes it trustworthy.
 *
 * Everything is injected — search, model, fetcher — so these tests are about the loop's
 * discipline rather than about any provider: a hostile or merely over-eager model must
 * hit a ceiling, and a URL it invents must have nowhere to land.
 */

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
});

const result = (url: string, title = "Page", rank = 1) => ({
  url,
  title,
  snippet: null,
  rank,
  provider: "brave" as const,
});

const fetched = (finalUrl: string, text = "# Algebra\n- Quadratics"): FetchedSource => ({
  finalUrl,
  contentType: "text/html",
  text,
  partial: false,
  partialReason: null,
  bytes: text.length,
requests: 1,
});

const usage = { inputTokens: 10, outputTokens: 10, calls: 1 };

/**
 * A plan with one objective and one query, which is what most of these tests want.
 *
 * Phase 1's shape is objectives-then-queries, so a double that returns only queries no longer
 * describes a valid plan — and that is the point of the change: the agent now refuses a query
 * it cannot trace to a question it was asked to answer.
 */
const oneQueryPlan = (query = "NUST NET syllabus", depth: "LOOKUP" | "STANDARD" = "STANDARD") => ({
  depth,
  objectives: [{ id: "o1", question: "What does the NET syllabus cover?", priority: "PRIMARY" as const }],
  queries: [{ query, purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" }],
});

/** A model whose behaviour each test overrides. */
function model(over: Partial<ResearchModel> = {}): ResearchModel {
  return {
    planResearch: vi.fn(async () => ({ plan: oneQueryPlan(), usage })),
    // Present because the interface still carries it for the comparison path, which reuses
    // this model verbatim; the research agent no longer calls it.
    planQueries: vi.fn(async () => ({ plan: { queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" as const }] }, usage })),
    // No follow-up queries: a double that reports "nothing better to ask" leaves the run to end
    // after its first round, which is what every bound test in this file is about.
    planFollowUp: vi.fn(async () => ({ plan: { queries: [] }, usage })),
    extract: vi.fn(async () => ({ extraction: extractionFixture(), claims: [], usage })),
    ...over,
  };
}

/** The scope every double extracts, so the two model helpers cannot drift apart. */
const extractionFixture = () => ({
  targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
  scope: [
    { label: "Algebra", kind: "CHAPTER" as const, parentIndex: null },
    { label: "Quadratics", kind: "TOPIC" as const, parentIndex: 0 },
  ],
  sourceMappings: [],
  unresolved: [],
  extractionConfidence: "HIGH" as const,
  conflicts: [],
});

/**
 * A model whose extraction is backed by real evidence.
 *
 * Phase 2 tightened `OK`: it now requires a *verified* claim, not merely an official page having
 * been read, because a hierarchy the model composed is a hypothesis and the ledger is the proof.
 * So a double that wants to earn `OK` has to quote the page it was given — and it quotes it by
 * returning the fetched text itself, which is exactly what the server verifies against.
 */
function evidenced(over: Partial<ResearchModel> = {}): ResearchModel {
  return model({
    extract: vi.fn(async ({ sources }: { sources: { sourceId: string; text: string }[] }) => ({
      extraction: extractionFixture(),
      claims: sources.slice(0, 1).map((source) => ({
        objectiveId: "o1",
        sourceId: source.sourceId,
        statement: "The unit list is Algebra and Quadratics.",
        excerpt: source.text,
        evidenceKind: "DIRECT" as const,
        support: "SUPPORTS" as const,
        documentDate: null,
      })),
      usage,
    })) as never,
    ...over,
  });
}

const search = (results: ReturnType<typeof result>[]) => ({
  id: "brave" as const,
  search: vi.fn(async () => results),
});

const authorityTarget = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };

describe("the agent cannot exceed its bounds", () => {
  it("runs no more queries than the plan's depth allows, however many it asked for", async () => {
    const searcher = search([result("https://nust.edu.pk/net")]);
    const planning = model({
      planResearch: vi.fn(async () => ({
        // The schema caps this at the *depth's* ceiling and then at the global bound; a model
        // that ignores both still cannot cause more searching than the bound allows.
        plan: {
          depth: "STANDARD" as const,
          objectives: [{ id: "o1", question: "What is the scope?", priority: "PRIMARY" as const }],
          queries: Array.from({ length: 12 }, (_, index) => ({
            query: `query ${index + 1}`,
            purpose: "OFFICIAL_SYLLABUS" as const,
            objectiveId: "o1",
          })),
        },
        usage,
      })),
    });
    await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: searcher,
      model: planning,
      fetchImpl: async (url) => fetched(url),
    });
    expect(searcher.search.mock.calls.length).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxSearchQueries);
  });

  it("fetches only the highest-ranked sources, never the whole result list", async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      result(index === 7 ? "https://nust.edu.pk/net" : `https://prepblog.example/${index}`, `Page ${index}`, index + 1)
    );
    const fetcher = vi.fn(async (url: string) => fetched(url));
    await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search(many),
      model: model(),
      fetchImpl: fetcher,
    });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxFetchedSources);
    // The verified authority is ranked first, so it is among the fetched few.
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://nust.edu.pk/net");
  });

  /**
   * §26–§28 of the final phase: trying and keeping are two different budgets.
   *
   * A live run is what showed the need. The agent ranks the verified authority first — which
   * is right — and then read the top four. When that authority's own host refused to serve us,
   * all four candidates failed and the run returned nothing while readable pages sat just
   * below the cut. These tests pin the corrected behaviour and, just as importantly, pin that
   * an ordinary run is unchanged.
   */
  it("falls through failed candidates, up to a bounded number of attempts", async () => {
    const list = [
      result("https://nust.edu.pk/one", "Official 1", 1),
      result("https://nust.edu.pk/two", "Official 2", 2),
      result("https://nust.edu.pk/three", "Official 3", 3),
      result("https://ugadmissions.nust.edu.pk/four", "Official 4", 4),
      result("https://nust.edu.pk/five", "Official 5", 5),
      result("https://readable.example/syllabus", "A page we can read", 6),
    ];
    const attempted: string[] = [];
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search(list),
      model: model(),
      fetchImpl: async (url) => {
        attempted.push(url);
        // Every official host refuses, exactly as NUST does in production; the sixth is fine.
        if (url.includes("nust.edu.pk")) throw new FetchError("FETCH_FAILED", 2);
        return fetched(url);
      },
    });

    /**
     * Every official candidate was tried before the secondary one, and the fallthrough
     * reached the page that could actually be read.
     *
     * The assertion is about the *order between tiers*, not within one: the ranking is what
     * decides which official source is best, and pinning the exact sequence of five
     * equal-tier siblings would test the sort's tie-breaking rather than the behaviour.
     */
    expect(attempted).toHaveLength(6);
    expect(attempted.slice(0, 5).every((url) => url.includes("nust.edu.pk"))).toBe(true);
    expect(attempted[5]).toBe("https://readable.example/syllabus");
    expect(outcome.candidate.sources.map((source) => source.publisherOrDomain)).toEqual(["readable.example"]);
    expect(outcome.candidate.nodes.length).toBeGreaterThan(0);

    // Three counts, and they are genuinely different numbers.
    expect(outcome.metrics.sourceCandidates).toBe(6);
    expect(outcome.metrics.sourcesFetched).toBe(1);
    // Five failures × 2 requests each, plus the one successful read's single request.
    expect(outcome.metrics.httpRequests).toBe(11);

    // The preference is untouched: a fallthrough source keeps its own honest label.
    expect(outcome.candidate.sources[0].sourceType).toBe("SECONDARY");
    // …and a run that can only read secondary pages is WEAK, never OK.
    expect(outcome.candidate.status).toBe("WEAK");
  });

  it("never tries more candidates than the attempt budget allows", async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      result(`https://unreadable.example/${index}`, `Page ${index}`, index + 1)
    );
    const fetcher = vi.fn(async () => {
      throw new FetchError("FETCH_FAILED", 1);
    });
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search(many),
      model: model(),
      fetchImpl: fetcher,
    });
    expect(fetcher.mock.calls.length).toBe(RESEARCH_BOUNDS.maxSourceCandidateAttempts);
    expect(outcome.metrics.sourceCandidates).toBe(RESEARCH_BOUNDS.maxSourceCandidateAttempts);
    expect(outcome.metrics.sourcesFetched).toBe(0);
    expect(outcome.metrics.httpRequests).toBe(RESEARCH_BOUNDS.maxSourceCandidateAttempts);
    // Nothing readable is still reported honestly, not dressed up as a result.
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.failureCode).toBe("FETCH_FAILED");
  });

  it("uses at most two model passes — plan, then extract", async () => {
    // Both passes are counted at the source, so the assertion cannot be satisfied by a
    // default the helper happened to supply.
    const calls: string[] = [];
    const agentModel: ResearchModel = {
      planResearch: async () => {
        calls.push("plan");
        return { plan: oneQueryPlan(), usage };
      },
      planQueries: async () => {
        calls.push("planQueries");
        return { plan: { queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" }] }, usage };
      },
      planFollowUp: async () => {
        calls.push("followUp");
        return { plan: { queries: [] }, usage };
      },
      extract: async () => {
        calls.push("extract");
        return {
          extraction: {
            targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
            scope: [{ label: "Algebra", kind: "CHAPTER", parentIndex: null }],
            sourceMappings: [],
            unresolved: [],
            extractionConfidence: "HIGH",
            conflicts: [],
          },
          claims: [],
          usage,
        };
      },
    };
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: agentModel,
      fetchImpl: async (url) => fetched(url),
    });
    // Plan, then extract: two passes and never a third.
    expect(calls).toEqual(["plan", "extract"]);
    // STANDARD has no follow-up round, so a run that planned and extracted is complete.
    expect(outcome.metrics.modelPasses).toBe(2);
  });

  it("refuses a plan that breaks the plan contract rather than searching with it", async () => {
    // A one-character query is not a query; the schema says so, and the run must stop
    // rather than spend a search call on nonsense the model emitted.
    const searcher = search([result("https://nust.edu.pk/net")]);
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: searcher,
      model: model({
        planResearch: vi.fn(async () => ({
          plan: { ...oneQueryPlan("q") },
          usage,
        })) as never,
      }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(searcher.search).not.toHaveBeenCalled();
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.failureCode).toBe("RESEARCH_UNAVAILABLE");
  });

  it("refuses a query that names no objective the plan stated", async () => {
    /**
     * A query whose objective does not exist cannot be traced to a question, and an
     * untraceable query is one whose results no later phase can attribute — Phase 2's
     * coverage check reads exactly this link. Refusing is better than searching for
     * something nobody asked.
     */
    const searcher = search([result("https://nust.edu.pk/net")]);
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: searcher,
      model: model({
        planResearch: vi.fn(async () => ({
          plan: {
            depth: "STANDARD" as const,
            objectives: [{ id: "o1", question: "What is the scope?", priority: "PRIMARY" as const }],
            queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o9" }],
          },
          usage,
        })),
      }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(searcher.search).not.toHaveBeenCalled();
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
  });

  it("runs every query the plan asked for, instead of stopping at the first official hit", async () => {
    /**
     * This replaced an early exit that abandoned the remaining queries as soon as two
     * official-looking results were in hand.
     *
     * That rule made sense when the plan was fixed at two queries: the second was a spare, and
     * a spare is not worth spending once the first has answered. It stopped making sense the
     * moment the plan became adaptive, because the whole point of asking for breadth is that
     * different objectives need different documents — and two hits for the syllabus objective
     * say nothing about whether the entry-requirements objective was ever answered. The breadth
     * is now the plan's decision, bounded by the depth tier, and the retrieval runs it.
     */
    const searcher = search([result("https://nust.edu.pk/a"), result("https://nust.edu.pk/b")]);
    await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: searcher,
      model: model({
        planResearch: vi.fn(async () => ({
          plan: {
            depth: "STANDARD" as const,
            objectives: [
              { id: "o1", question: "What is the scope?", priority: "PRIMARY" as const },
              { id: "o2", question: "What are the entry requirements?", priority: "SUPPORTING" as const },
            ],
            queries: [
              { query: "one", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" },
              { query: "two", purpose: "ENTRY_REQUIREMENTS" as const, objectiveId: "o2" },
            ],
          },
          usage,
        })),
      }),
      fetchImpl: async (url) => fetched(url),
    });
    // Both queries ran: one objective each, so neither is redundant.
    expect(searcher.search).toHaveBeenCalledTimes(2);
  });

  it("does not proceed when one query fails and the other finds nothing", async () => {
    const searcher = {
      id: "brave" as const,
      search: vi.fn(async () => {
        throw new Error("SEARCH_RATE_LIMITED");
      }),
    };
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: searcher,
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    // A failed search never becomes a scope from the model's memory.
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.nodes).toEqual([]);
    expect(outcome.candidate.sources).toEqual([]);
  });

  it("does not call any model when no search provider is configured", async () => {
    const planning = vi.fn();
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: null,
      model: model({ planResearch: planning as never }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(planning).not.toHaveBeenCalled();
    expect(outcome.candidate.failureCode).toBe("RESEARCH_UNAVAILABLE");
    expect(outcome.candidate.summary).toMatch(/not configured/i);
  });

  it("reports each failure stage distinctly, so the student gets a next action", async () => {
    const noResults = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: { id: "brave", search: vi.fn(async () => []) },
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(noResults.candidate.failureCode).toBe("SEARCH_ZERO_RESULTS");

    const noFetch = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model(),
      fetchImpl: async () => {
        throw new Error("FETCH_UNSUPPORTED_TYPE");
      },
    });
    expect(noFetch.candidate.failureCode).toBe("FETCH_FAILED");

    const badExtraction = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model({
        extract: vi.fn(async () => {
          throw new Error("RESEARCH_MODEL_BAD_OUTPUT");
        }) as never,
      }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(badExtraction.candidate.failureCode).toBe("RESEARCH_MODEL_BAD_OUTPUT");
    expect(badExtraction.candidate.nodes).toEqual([]);
  });
});

describe("a model cannot put a URL into provenance", () => {
  it("keeps only URLs the search returned or the fetcher reached", async () => {
    const invented = "https://evil.example/fake-syllabus.pdf";
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model({
        extract: vi.fn(async () => ({
          extraction: {
            targetIdentity: { name: `NUST NET ${invented}`, institution: "NUST", board: null, level: null },
            scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
            sourceMappings: [],
            // A URL in the free-text fields is the only place a model *could* smuggle one.
            unresolved: [`see ${invented}`, `${invented}`],
            extractionConfidence: "HIGH" as const,
            conflicts: [{ description: `differs at ${invented}`, sourceIds: ["src-a", "src-b"] }],
          },
          usage,
        })) as never,
      }),
      fetchImpl: async (url) => fetched(url),
    });
    // No canonical source carries the invented URL: provenance comes from search and
    // fetch only, and the model's schema has nowhere to declare a URL at all.
    for (const source of outcome.candidate.sources)
      expect(source.url).not.toContain("evil.example");
    expect(outcome.candidate.sources.map((source) => source.url)).toEqual(["https://nust.edu.pk/net"]);
  });

  it("drops a citation the server never issued", () => {
    const extraction = {
      targetIdentity: { name: "X", institution: null, board: null, level: null },
      scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
      sourceMappings: [{ nodeIndexes: [0], sourceIds: ["src-real", "src-invented"] }],
      unresolved: [],
      extractionConfidence: "HIGH" as const,
      conflicts: [],
    };
    const { nodes, droppedCitations } = nodesFromExtraction(extraction, new Set(["src-real"]));
    expect(nodes[0].sourceIds).toEqual(["src-real"]);
    expect(droppedCitations).toBe(1);
  });

  it("refuses a parent index that is out of range or forward-pointing, without inventing one", () => {
    const extraction = {
      targetIdentity: { name: "X", institution: null, board: null, level: null },
      scope: [
        { label: "Algebra", kind: "CHAPTER" as const, parentIndex: 5 },
        { label: "Quadratics", kind: "TOPIC" as const, parentIndex: 0 },
      ],
      sourceMappings: [],
      unresolved: [],
      extractionConfidence: "HIGH" as const,
      conflicts: [],
    };
    const { nodes } = nodesFromExtraction(extraction, new Set());
    expect(nodes[0].parentId).toBeNull();
    expect(nodes[1].parentId).toBe(nodes[0].nodeId);
  });
});

describe("status is earned from the sources, not from the model's confidence", () => {
  it("is OK when a verified authority was read and its wording proves the claim", async () => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: evidenced(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.status).toBe("OK");
    expect(outcome.candidate.sources[0].sourceType).toMatch(/^OFFICIAL/);
    expect(outcome.candidate.evidence?.claims).toHaveLength(1);
  });

  it("is only WEAK when an official page was read but nothing in it could be verified", async () => {
    /**
     * Phase 2's tightening, and the reason the evidence ledger exists.
     *
     * Phase 1 would have called this `OK`: an official page was fetched and the model returned a
     * confident hierarchy. But nothing in that hierarchy was tied to the page's own wording, so
     * the scope is a fluent guess about a document rather than a reading of it. `WEAK` is the
     * honest word for that, and the student is told nothing is evidenced yet.
     */
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.status).toBe("WEAK");
    expect(outcome.candidate.evidence?.claims).toEqual([]);
    expect(outcome.candidate.openQuestions.join(" ")).toMatch(/nothing here is evidenced yet/i);
  });

  it("is WEAK when only an unrelated institution was read, however confident the model is", async () => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://mit.edu/course/6")]),
      model: model({
        extract: vi.fn(async () => ({
          extraction: {
            targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
            scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
            sourceMappings: [],
            unresolved: [],
            // The model is certain; the sources are not the authority.
            extractionConfidence: "HIGH" as const,
            conflicts: [],
          },
          usage,
        })) as never,
      }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.status).toBe("WEAK");
    expect(outcome.candidate.sources[0].sourceType).toBe("INSTITUTIONAL");
    expect(outcome.candidate.openQuestions.join(" ")).toMatch(/authority/i);
  });

  it("reports a conflict rather than picking a side", async () => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model({
        extract: vi.fn(async () => ({
          extraction: {
            targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
            scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
            sourceMappings: [],
            unresolved: [],
            extractionConfidence: "MEDIUM" as const,
            conflicts: [{ description: "one lists Calculus in year one, the other in year two", sourceIds: ["src-a", "src-b"] }],
          },
          usage,
        })) as never,
      }),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.openQuestions.join(" ")).toMatch(/two different scope versions/i);
  });

  it("still respects a unit the student removed earlier", async () => {
    const withRemoval = { ...brief(), scope: { ...emptyBrief("EXAM").scope, removedLabels: ["Quadratics"] } };
    const outcome = await runResearchAgent({
      brief: withRemoval,
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    const quadratics = outcome.candidate.nodes.find((node) => node.label === "Quadratics");
    expect(quadratics?.selected).toBe(false);
    expect(outcome.candidate.openQuestions.join(" ")).toMatch(/you removed earlier/i);
  });
});

/**
 * The stamp on a candidate, and the lookup that has to find it.
 *
 * These two are written by different modules — the agent stamps, the service looks up — and
 * a live run showed what happens when they disagree: every real research run was stamped
 * with the *brief* digest instead of the *question* key, so the same request against the
 * same brief searched, fetched and called the model again every single time. Nothing
 * deterministic covered the seam, because the fixtures built their candidates by hand.
 */
describe("a candidate carries the key the service looks it up with", () => {
  it("is reusable for the same question about the same brief", async () => {
    const question = brief();
    const outcome = await runResearchAgent({
      brief: question,
      target: authorityTarget,
      search: search([result("https://nust.edu.pk/net")]),
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.nodes.length).toBeGreaterThan(0);
    expect(outcome.candidate.cacheKey).toBe(researchCacheKeyFor(question));
    const stored = { ...question, scopeCandidate: outcome.candidate };
    expect(reusableCandidate(stored, researchCacheKeyFor(question))).not.toBeNull();
    // …and a different question is still a different question.
    const other = { ...question, goal: { title: "CAIE A-Level Mathematics" } };
    expect(reusableCandidate({ ...other, scopeCandidate: outcome.candidate }, researchCacheKeyFor(other))).toBeNull();
  });

  it("is not reused when the lookup answered nothing, so a retry really retries", async () => {
    const question = brief();
    const outcome = await runResearchAgent({
      brief: question,
      target: authorityTarget,
      search: search([]),
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.nodes).toHaveLength(0);
    // The key matches — the guard is the absence of an answer, not a key mismatch.
    expect(outcome.candidate.cacheKey).toBe(researchCacheKeyFor(question));
    expect(reusableCandidate({ ...question, scopeCandidate: outcome.candidate }, researchCacheKeyFor(question))).toBeNull();
  });
});
