// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent, type ResearchModel } from "@/lib/planner/research/agent";
import {
  RESEARCH_BOUNDS,
  RESEARCH_DEPTH_BUDGETS,
} from "@/lib/planner/research/search/contracts";
import { FetchError, type FetchedSource } from "@/lib/planner/research/search/fetch";

/**
 * Bounded fetch concurrency.
 *
 * Phase 2 read pages one at a time and measured a DEEP run at ~192 seconds. Reading them in small
 * concurrent waves is most of the available latency win, and it is also the change most able to
 * quietly corrupt a run: parallelism is how a system starts reading more pages than its tier
 * allows, spending its follow-up reserve early, fetching the same URL twice, or producing a
 * different source set depending on which host answered first.
 *
 * These tests are about the *invariants* of that concurrency rather than its speed. The speed is
 * measured live; what has to be proven here is that concurrency changes only the wall clock.
 */

const PAGE = "The official specification lists Algebra, Sequences and Series, Calculus and Statistics in that order.";
const usage = { inputTokens: 10, outputTokens: 10, calls: 1 };

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
});

const target = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };

const results = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://nust.edu.pk/net/${String(index).padStart(3, "0")}`,
    title: `What subjects are tested in the paper ${index}`,
    snippet: null,
    rank: index + 1,
    provider: "brave" as const,
  }));

const plan = (depth: "LOOKUP" | "STANDARD" | "DEEP", objectiveCount = 1) => ({
  depth,
  objectives: Array.from({ length: objectiveCount }, (_, index) => ({
    id: `o${index + 1}`,
    question: `What does objective ${index + 1} require?`,
    priority: (index === 0 ? "PRIMARY" : "SUPPORTING") as "PRIMARY" | "SUPPORTING",
  })),
  queries: Array.from({ length: objectiveCount }, (_, index) => ({
    query: `query for objective ${index + 1}`,
    purpose: "OFFICIAL_SYLLABUS" as const,
    objectiveId: `o${index + 1}`,
  })),
});

/** A model that resolves every objective from the first page it is handed. */
function model(depth: "LOOKUP" | "STANDARD" | "DEEP", objectiveCount = 1): ResearchModel {
  return {
    planResearch: vi.fn(async () => ({ plan: plan(depth, objectiveCount), usage })),
    planQueries: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
    planFollowUp: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
    extract: vi.fn(async ({ sources }: { sources: { sourceId: string; text: string }[] }) => ({
      extraction: {
        targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
        scope: [{ label: "Algebra", kind: "CHAPTER" as const, parentIndex: null }],
        sourceMappings: [],
        unresolved: [],
        extractionConfidence: "HIGH" as const,
        conflicts: [],
      },
      claims: sources.slice(0, 1).map((source) => ({
        objectiveId: "o1",
        sourceId: source.sourceId,
        statement: "The specification covers Algebra.",
        excerpt: source.text,
        evidenceKind: "DIRECT" as const,
        support: "SUPPORTS" as const,
        documentDate: null,
      })),
      usage,
    })) as never,
  };
}

const search = (count: number) => ({
  id: "brave" as const,
  search: vi.fn(async () => results(count)),
});

/** A fetcher that records in-flight peaks, per-URL delays and the exact call sequence. */
function trackingFetcher(options: {
  fail?: (url: string) => boolean;
  delayMs?: (url: string) => number;
}) {
  const inFlight = { current: 0, peak: 0 };
  const calls: string[] = [];
  const fetchImpl = async (url: string): Promise<FetchedSource> => {
    calls.push(url);
    inFlight.current += 1;
    inFlight.peak = Math.max(inFlight.peak, inFlight.current);
    try {
      const delay = options.delayMs?.(url) ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (options.fail?.(url)) throw new FetchError("FETCH_FAILED", 2);
      return {
        finalUrl: url,
        contentType: "text/html",
        text: PAGE,
        partial: false,
        partialReason: null,
        bytes: PAGE.length,
        requests: 1,
      };
    } finally {
      inFlight.current -= 1;
    }
  };
  return { fetchImpl, inFlight, calls };
}

describe("fetch concurrency is bounded", () => {
  it("never has more than maxConcurrentFetches in flight", async () => {
    const tracker = trackingFetcher({ delayMs: () => 15 });
    await runResearchAgent({
      brief: brief(),
      target,
      search: search(40),
      model: model("DEEP", 3),
      fetchImpl: tracker.fetchImpl,
    });
    expect(tracker.inFlight.peak).toBeGreaterThan(1);
    expect(tracker.inFlight.peak).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxConcurrentFetches);
  });

  it("keeps the concurrency bound at STANDARD as well as DEEP", async () => {
    const tracker = trackingFetcher({ delayMs: () => 10 });
    await runResearchAgent({
      brief: brief(),
      target,
      search: search(20),
      model: model("STANDARD", 2),
      fetchImpl: tracker.fetchImpl,
    });
    expect(tracker.inFlight.peak).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxConcurrentFetches);
  });
});

describe("concurrency changes the timing and nothing else", () => {
  it("keeps the same sources in the same order when completion order is reversed", async () => {
    /**
     * The heart of it. Two runs see identical plans, results and selection; only the *order the
     * pages answer in* differs — the first run makes the lowest-ranked URL fastest, the second makes
     * the highest-ranked URL fastest. A result that depended on completion order would differ here.
     */
    const forward = trackingFetcher({
      delayMs: (url) => 40 - Number(url.slice(-3)) * 5,
    });
    const reversed = trackingFetcher({
      delayMs: (url) => 5 + Number(url.slice(-3)) * 5,
    });

    const run = async (tracker: ReturnType<typeof trackingFetcher>) => {
      const outcome = await runResearchAgent({
        brief: brief(),
        target,
        search: search(30),
        model: model("DEEP", 3),
        fetchImpl: tracker.fetchImpl,
      });
      return {
        sources: outcome.candidate.sources.map((source) => source.url),
        metrics: {
          sourcesFetched: outcome.metrics.sourcesFetched,
          sourceCandidates: outcome.metrics.sourceCandidates,
          httpRequests: outcome.metrics.httpRequests,
          fetchFailures: outcome.metrics.fetchFailures,
        },
      };
    };

    const first = await run(forward);
    const second = await run(reversed);
    expect(second.sources).toEqual(first.sources);
    expect(second.metrics).toEqual(first.metrics);
  });

  it("records the same httpRequests whatever order the pages settle in", async () => {
    const tracker = trackingFetcher({ delayMs: (url) => (Number(url.slice(-3)) % 2 ? 25 : 1) });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(20),
      model: model("STANDARD", 2),
      fetchImpl: tracker.fetchImpl,
    });
    // One request per successful read, and none of them counted twice.
    expect(outcome.metrics.httpRequests).toBe(outcome.metrics.sourcesFetched);
  });
});

describe("concurrency preserves every budget", () => {
  it("never reads more pages than the tier allows", async () => {
    const tracker = trackingFetcher({});
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(60),
      model: model("STANDARD", 2),
      fetchImpl: tracker.fetchImpl,
    });
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
  });

  it("keeps DEEP's first-round reserve for the follow-up round", async () => {
    /**
     * DEEP may read nine pages across the run but only six in the first round. A wave that filled
     * every remaining slot would spend the reserve before the follow-up round could use it, making
     * the extra round a search with nothing left to read.
     */
    const tracker = trackingFetcher({});
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(60),
      model: model("DEEP", 1),
      fetchImpl: tracker.fetchImpl,
    });
    // One objective, fully covered by the first page, so no follow-up runs and the first round's
    // share is the whole spend.
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.initialFetchedSources);
  });

  it("never exceeds the candidate-attempt budget", async () => {
    const tracker = trackingFetcher({ fail: () => true });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(60),
      model: model("DEEP", 2),
      fetchImpl: tracker.fetchImpl,
    });
    expect(outcome.metrics.sourceCandidates).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxSourceCandidateAttempts);
    expect(outcome.metrics.sourcesFetched).toBe(0);
    expect(outcome.candidate.failureCode).toBe("FETCH_FAILED");
  });

  it("falls through failures to fill the read budget from later candidates", async () => {
    // The first eight candidates refuse; the rest are readable. A concurrent wave must still
    // fall through to them rather than ending the round on the first failures.
    const tracker = trackingFetcher({ fail: (url) => Number(url.slice(-3)) < 8 });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(40),
      model: model("STANDARD", 2),
      fetchImpl: tracker.fetchImpl,
    });
    expect(outcome.metrics.sourcesFetched).toBe(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
    expect(outcome.metrics.fetchFailures).toBeGreaterThanOrEqual(8);
    expect(outcome.candidate.status).toBe("OK");
  });

  it("never fetches the same URL twice", async () => {
    const tracker = trackingFetcher({ fail: (url) => Number(url.slice(-3)) % 4 === 0 });
    await runResearchAgent({
      brief: brief(),
      target,
      search: search(40),
      model: model("DEEP", 3),
      fetchImpl: tracker.fetchImpl,
    });
    expect(new Set(tracker.calls).size).toBe(tracker.calls.length);
  });

  it("counts a failed attempt's redirect hops in httpRequests", async () => {
    const tracker = trackingFetcher({ fail: () => true });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: search(20),
      model: model("STANDARD", 2),
      fetchImpl: tracker.fetchImpl,
    });
    // Each FetchError reports 2 requests, so the HTTP cost of failure is visible rather than free.
    expect(outcome.metrics.httpRequests).toBe(outcome.metrics.sourceCandidates * 2);
  });
});
