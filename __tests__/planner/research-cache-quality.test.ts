// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import type { ScopeCandidate } from "@/lib/planner/research/contracts";

/**
 * The cache re-audit, run against `researchScope` itself rather than against the gate alone.
 *
 * The gate (`reusableCandidate`) is a pure predicate and has its own tests; what those cannot
 * show is the thing the student actually experiences — that a valid reuse reaches *no* provider,
 * *no* fetcher and *no* model, and that an invalid one really does search again. A counter on the
 * stubs is the only honest evidence for "zero external calls", because a metric object claiming
 * zero is a self-report, not a measurement.
 *
 * The six conditions are the ones Phase 3 §24 asks to be re-verified under final behaviour, plus
 * the two §25 properties about repeat DEEP runs.
 */

const counter = vi.hoisted(() => ({
  searchCalls: 0,
  fetchCalls: 0,
  planCalls: 0,
  extractCalls: 0,
  followUpCalls: 0,
}));

const resetCounter = () => {
  counter.searchCalls = 0;
  counter.fetchCalls = 0;
  counter.planCalls = 0;
  counter.extractCalls = 0;
  counter.followUpCalls = 0;
};

const PAGE =
  "The official specification lists Algebra, Sequences and Series, Calculus and Statistics as the assessed content.";

vi.mock("@/lib/planner/research/search/provider", () => ({
  selectSearchProvider: () => ({
    id: "brave" as const,
    async search() {
      counter.searchCalls += 1;
      return [0, 1, 2].map((index) => ({
        url: `https://nust.edu.pk/spec/${index}`,
        title: `NUST NET specification section ${index}`,
        snippet: null,
        rank: index + 1,
        provider: "brave" as const,
      }));
    },
  }),
}));

vi.mock("@/lib/planner/research/search/fetch", () => ({
  fetchSource: async (url: string) => {
    counter.fetchCalls += 1;
    return {
      finalUrl: url,
      text: PAGE,
      bytes: PAGE.length,
      contentType: "text/html",
      partial: false,
      partialReason: null,
      requests: 1,
    };
  },
}));

vi.mock("@/lib/planner/research/deepseek", () => ({
  deepseekModel: () => ({
    async planResearch() {
      counter.planCalls += 1;
      return {
        plan: {
          depth: "DEEP" as const,
          objectives: [
            { id: "o1", question: "Which subjects are tested?", priority: "PRIMARY" as const },
            { id: "o2", question: "What is the exam format?", priority: "SUPPORTING" as const },
          ],
          queries: [
            { query: "NUST NET subjects tested", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" },
            { query: "NUST NET exam format", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o2" },
          ],
        },
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
    async planFollowUp() {
      counter.followUpCalls += 1;
      return { plan: { queries: [] }, usage: { inputTokens: 10, outputTokens: 5, calls: 1 } };
    },
    async extract(input: { sources: { sourceId: string }[] }) {
      counter.extractCalls += 1;
      const primary = input.sources[0];
      return {
        extraction: {
          targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
          scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
          sourceMappings: primary ? [{ nodeIndexes: [0], sourceIds: [primary.sourceId] }] : [],
          unresolved: [],
          extractionConfidence: "HIGH" as const,
          conflicts: [],
        },
        claims: [
          {
            objectiveId: "o1",
            sourceId: primary.sourceId,
            statement: "The specification covers Algebra.",
            excerpt: PAGE,
            evidenceKind: "DIRECT" as const,
            support: "SUPPORTS" as const,
            documentDate: null,
          },
        ],
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
  }),
}));

import {
  researchBriefDigest,
  researchCacheKeyFor,
  researchScope,
} from "@/lib/planner/research/service";

const brief = (over: Partial<PlanBriefV1> = {}): PlanBriefV1 => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering 2027" },
  subject: { kind: "FREE_TEXT", subjectId: null, name: "Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
  ...over,
});

/**
 * A candidate shaped like one this repository would have written at each point in its history.
 *
 * `over` is applied last so a test can delete a field outright — which is the whole point of the
 * schema-tolerance case: a stored answer from before a field existed is not a malformed answer.
 */
function storedCandidate(
  over: Partial<ScopeCandidate> = {},
  base: PlanBriefV1 = brief()
): PlanBriefV1 {
  const candidate = {
    version: 1,
    origin: "RESEARCH" as const,
    status: "OK" as const,
    failureCode: null,
    confidence: "HIGH" as const,
    briefDigest: researchBriefDigest(base),
    retrievedAt: "2030-01-01T00:00:00.000Z",
    provider: "deepseek-search",
    cacheKey: researchCacheKeyFor(base),
    depth: "DEEP" as const,
    nodes: [
      { nodeId: "r-algebra", label: "Algebra", kind: "CHAPTER" as const, parentId: null, selected: true },
    ],
    sources: [
      {
        sourceId: "s1",
        url: "https://nust.edu.pk/spec",
        title: "NUST NET specification",
        domain: "nust.edu.pk",
        sourceType: "OFFICIAL" as const,
        retrievedAt: "2030-01-01T00:00:00.000Z",
        documentDate: null,
      },
    ],
    openQuestions: [],
    summary: "I found 1 unit from 1 official source.",
    ...over,
  } as ScopeCandidate;
  return { ...base, scopeCandidate: candidate };
}

describe("cache quality under final Phase 3 behaviour", () => {
  beforeEach(resetCounter);

  it("reuses a STANDARD answer for a STANDARD request without touching the network", async () => {
    const b = storedCandidate({ depth: "STANDARD" });
    const outcome = await researchScope({ brief: b, requestedDepth: "STANDARD" });

    expect(outcome.metrics.cacheHit).toBe(true);
    expect(outcome.candidate).toBe(b.scopeCandidate);
    // The measurement that matters: nothing was called.
    expect(counter).toEqual({
      searchCalls: 0,
      fetchCalls: 0,
      planCalls: 0,
      extractCalls: 0,
      followUpCalls: 0,
    });
  });

  it("reuses a completed DEEP answer for a STANDARD request, and reports it as DEEP", async () => {
    // More evidence than was asked for is still an answer; the metrics describe the work being
    // reused rather than the work this request would have done.
    const b = storedCandidate({ depth: "DEEP" });
    const outcome = await researchScope({ brief: b, requestedDepth: "STANDARD" });

    expect(outcome.metrics.cacheHit).toBe(true);
    expect(outcome.metrics.depth).toBe("DEEP");
    expect(counter.searchCalls).toBe(0);
    expect(counter.planCalls).toBe(0);
  });

  it("refuses to pass a STANDARD answer off as explicit DEEP, and really researches instead", async () => {
    const b = storedCandidate({ depth: "STANDARD" });
    const outcome = await researchScope({ brief: b, requestedDepth: "DEEP" });

    expect(outcome.metrics.cacheHit).toBe(false);
    // Refusing the reuse must not become a refusal to work: the run happened.
    expect(counter.planCalls).toBe(1);
    expect(counter.searchCalls).toBeGreaterThan(0);
    expect(outcome.metrics.depth).toBe("DEEP");
  });

  it("treats a candidate written before depth existed as STANDARD", async () => {
    const b = storedCandidate({ depth: undefined });
    const reusable = await researchScope({ brief: b, requestedDepth: "STANDARD" });
    expect(reusable.metrics.cacheHit).toBe(true);
    expect(reusable.metrics.depth).toBe("STANDARD");

    resetCounter();
    const notDeep = await researchScope({ brief: b, requestedDepth: "DEEP" });
    expect(notDeep.metrics.cacheHit).toBe(false);
    expect(counter.planCalls).toBe(1);
  });

  it("retries a failed lookup rather than caching the outage", async () => {
    // `UNAVAILABLE` with no units is a record that the lookup failed, not an answer. Reusing it
    // would turn a transient provider outage into a permanent one for as long as the brief stands.
    const b = storedCandidate({ status: "UNAVAILABLE", nodes: [], failureCode: "RESEARCH_UNAVAILABLE" });
    const outcome = await researchScope({ brief: b });

    expect(outcome.metrics.cacheHit).toBe(false);
    expect(counter.planCalls).toBe(1);
    expect(counter.searchCalls).toBeGreaterThan(0);
  });

  it("retries when a WEAK result still parsed no units", async () => {
    const b = storedCandidate({ status: "WEAK", nodes: [], confidence: "LOW" });
    const outcome = await researchScope({ brief: b });
    expect(outcome.metrics.cacheHit).toBe(false);
    expect(counter.planCalls).toBe(1);
  });

  it("invalidates when the goal changes even though the rest of the brief is identical", async () => {
    const original = brief();
    const b = { ...storedCandidate({}, original), goal: { title: "NUST NET Business 2027" } };
    const outcome = await researchScope({ brief: b });

    expect(outcome.metrics.cacheHit).toBe(false);
    expect(counter.planCalls).toBe(1);
  });

  it("invalidates when the brief digest has moved on since the answer was computed", async () => {
    // Same question, same key — but the student edited something the answer was computed against.
    const b = storedCandidate({ briefDigest: "stale".padEnd(32, "0") });
    const outcome = await researchScope({ brief: b });

    expect(outcome.metrics.cacheHit).toBe(false);
    expect(counter.planCalls).toBe(1);
  });

  it("handles a candidate stored before evidence and coverage existed", async () => {
    // A research/evidence schema addition must not make old stored answers unreadable or, worse,
    // crash the path that serves them. The honest report is zeroes, not invented counts.
    const b = storedCandidate({ evidence: undefined, coverage: undefined });
    const outcome = await researchScope({ brief: b });

    expect(outcome.metrics.cacheHit).toBe(true);
    expect(outcome.metrics.evidenceAccepted).toBe(0);
    expect(outcome.metrics.evidenceRejected).toBe(0);
    expect(outcome.metrics.coverage).toEqual({
      totalObjectives: 0,
      covered: 0,
      partial: 0,
      unanswered: 0,
      conflicted: 0,
      highPriorityUnanswered: 0,
    });
    expect(outcome.metrics.followUpUsed).toBe(false);
    expect(counter).toEqual({
      searchCalls: 0,
      fetchCalls: 0,
      planCalls: 0,
      extractCalls: 0,
      followUpCalls: 0,
    });
  });

  it("reports a reused answer's own evidence and coverage, not a blank slate", async () => {
    const b = storedCandidate({
      evidence: {
        claims: [
          {
            claimId: "c1",
            objectiveId: "o1",
            sourceId: "s1",
            statement: "The specification covers Algebra.",
            excerpt: PAGE.slice(0, 80),
            evidenceKind: "DIRECT",
            support: "SUPPORTS",
            documentDate: null,
          },
        ],
        rejected: 2,
      },
      coverage: {
        summary: {
          totalObjectives: 2,
          covered: 1,
          partial: 0,
          unanswered: 1,
          conflicted: 0,
          highPriorityUnanswered: 0,
        },
        objectives: [],
        followUpUsed: true,
      },
    } as Partial<ScopeCandidate>);
    const outcome = await researchScope({ brief: b });

    expect(outcome.metrics.cacheHit).toBe(true);
    expect(outcome.metrics.evidenceAccepted).toBe(1);
    expect(outcome.metrics.evidenceRejected).toBe(2);
    expect(outcome.metrics.coverage.covered).toBe(1);
    expect(outcome.metrics.coverage.unanswered).toBe(1);
  });

  it("does not repeat a DEEP run's follow-up round on a cache hit", async () => {
    // §25: the follow-up already happened and its result is inside the stored answer. A repeat
    // must not spend a second round of queries chasing objectives the stored answer closed.
    const first = await researchScope({ brief: brief(), requestedDepth: "DEEP" });
    expect(first.metrics.followUpUsed).toBe(false);
    expect(counter.followUpCalls).toBeGreaterThan(0);

    // The run's own answer, stored back onto the brief exactly as intake does.
    const stored: PlanBriefV1 = { ...brief(), scopeCandidate: first.candidate };
    resetCounter();
    const second = await researchScope({ brief: stored, requestedDepth: "DEEP" });

    expect(second.metrics.cacheHit).toBe(true);
    expect(counter.followUpCalls).toBe(0);
    expect(counter).toEqual({
      searchCalls: 0,
      fetchCalls: 0,
      planCalls: 0,
      extractCalls: 0,
      followUpCalls: 0,
    });
  });

  it("reports a cache hit's retrieval counts as zero rather than replaying the old run", async () => {
    const first = await researchScope({ brief: brief(), requestedDepth: "DEEP" });
    expect(first.metrics.searchCalls).toBeGreaterThan(0);

    const stored: PlanBriefV1 = { ...brief(), scopeCandidate: first.candidate };
    const second = await researchScope({ brief: stored, requestedDepth: "DEEP" });

    // The run that produced the answer searched; this request did not, and must not say it did.
    expect(second.metrics.searchCalls).toBe(0);
    expect(second.metrics.queriesGenerated).toBe(0);
    expect(second.metrics.modelCalls).toBe(0);
    expect(second.metrics.httpRequests).toBe(0);
    expect(second.metrics.sourcesFetched).toBe(0);
    expect(second.metrics.calls).toBe(0);
    // What it *can* honestly report is the shape of the answer it is reusing.
    expect(second.metrics.sourceCount).toBe(first.candidate.sources.length);
    expect(second.metrics.candidateNodeCount).toBe(first.candidate.nodes.length);
  });

  it("makes zero external calls for every depth when research is switched off", async () => {
    const outcome = await researchScope({ brief: brief(), disabled: true });
    expect(outcome.metrics.cacheHit).toBe(false);
    expect(counter).toEqual({
      searchCalls: 0,
      fetchCalls: 0,
      planCalls: 0,
      extractCalls: 0,
      followUpCalls: 0,
    });
  });
});
