// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief, type PlanBriefV1, type ScopeNode } from "@/lib/planner/intake/brief";
import {
  COMPARISON_PROVIDER_VERSION,
  comparisonCacheKey,
  comparisonIsStale,
  runCurriculumComparison,
  type ComparisonModel,
} from "@/lib/planner/research/comparison";
import { COMPARISON_LIMITS } from "@/lib/planner/comparison/contracts";
import type { SearchProvider, SearchResult } from "@/lib/planner/research/search/contracts";
import type { ComparisonExtraction } from "@/lib/planner/research/search/contracts";
import type { FetchedSource } from "@/lib/planner/research/search/fetch";
import type { ModelUsage } from "@/lib/planner/research/agent";

/**
 * Curriculum comparison, driven end to end with a stubbed search provider, a stubbed
 * fetcher and a stubbed model.
 *
 * The point of these tests is the *shape* of the run, not the quality of an answer: one
 * search plan, one fetch round, one comparison pass — and three refusals that must never
 * become a provider call: research switched off, no search credentials configured, and
 * no background curriculum stated.
 *
 * The scenario is the phase's reference case: an A-Level student preparing for NUST NET
 * Engineering. Nothing about it is hardcoded in the planner; the target is a goal title
 * and a confirmed scope, and the background is three subjects the student typed.
 */

const USAGE: ModelUsage = { inputTokens: 100, outputTokens: 50, calls: 1 };

const node = (
  nodeId: string,
  label: string,
  kind: ScopeNode["kind"],
  parentId: string | null = null
): ScopeNode => ({ nodeId, label, kind, parentId, selected: true });

function netBrief(over: Partial<PlanBriefV1> = {}): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  base.goal.title = "NUST NET Engineering";
  base.target = { endDate: "2030-06-01", examDate: "2030-06-01" };
  base.backgroundCurriculum = {
    label: "CAIE A-Level",
    level: "A-Level",
    board: "CAIE",
    subjects: ["Mathematics", "Physics", "Computer Science"],
  };
  base.scope = {
    source: "RESEARCH_CONFIRMED",
    confirmedAt: "2030-01-02T00:00:00.000Z",
    provenanceRefs: [],
    provenanceSources: [],
    removedLabels: [],
    nodes: [
      node("c1", "Mathematics", "CHAPTER"),
      node("t1", "Matrices", "TOPIC", "c1"),
      node("t2", "Sequences and series", "TOPIC", "c1"),
      node("t3", "Rotational dynamics", "TOPIC", "c1"),
    ],
  };
  return { ...base, ...over };
}

const results = (urls: string[]): SearchResult[] =>
  urls.map((url, index) => ({
    url,
    title: `Page ${index + 1}`,
    snippet: null,
    rank: index + 1,
    provider: "brave" as const,
  }));

const search = (urls: string[]): SearchProvider => ({
  id: "brave",
  search: vi.fn(async () => results(urls)),
});

const fetchText = (text: string) =>
  vi.fn(async (url: string): Promise<FetchedSource> => ({
    finalUrl: url,
    text,
    bytes: text.length,
    contentType: "text/html",
    partial: false,
    partialReason: null,
  requests: 1,
  }));

/**
 * A model stub that answers with the fixed extraction, citing whatever source ids the
 * server actually issued.
 *
 * The stub cannot hardcode them: an id is derived from the fetched URL, which is the
 * provenance rule the real pipeline relies on — and a citation that does not name an
 * issued id is discarded, which is exactly what would happen to a stub that guessed.
 */
function model(
  build: (sourceIds: string[]) => ComparisonExtraction,
  onCompare?: (input: unknown) => void
): ComparisonModel & { compareCalls: number; planCalls: number } {
  const built = {
    planCalls: 0,
    compareCalls: 0,
    async planQueries() {
      built.planCalls += 1;
      return {
        plan: {
          queries: [
            { query: "CAIE A-Level Mathematics syllabus 9709", purpose: "OFFICIAL_SYLLABUS" as const },
          ],
        },
        usage: USAGE,
      };
    },
    async compare(input: { sources: { sourceId: string }[] } & Record<string, unknown>) {
      built.compareCalls += 1;
      onCompare?.(input);
      return {
        comparison: build(input.sources.map((source) => source.sourceId)),
        usage: USAGE,
      };
    },
  };
  return built as ComparisonModel & { compareCalls: number; planCalls: number };
}

/** The reference extraction, citing the ids the server issued. */
const citedExtraction = (sourceIds: string[]): ComparisonExtraction => extractedWithCitations(sourceIds);

const EXTRACTION: ComparisonExtraction = {
  backgroundUnits: [
    { label: "Pure Mathematics 1" },
    { label: "Mechanics" },
  ],
  units: [
    {
      unitRef: "t1",
      overlap: "LIKELY_COVERED_BY_CURRICULUM",
      confidence: "HIGH",
      // Replaced with the real id inside the model stub below, which is the only place
      // that can know it: the id is derived from the fetched URL.
      sourceIds: [],
      explanationCode: "BACKGROUND_TOPIC_MATCH",
    },
    {
      unitRef: "t2",
      overlap: "PARTIAL_OVERLAP",
      confidence: "MEDIUM",
      sourceIds: [],
      explanationCode: "BACKGROUND_PARTIAL_MATCH",
    },
    {
      unitRef: "t3",
      overlap: "LIKELY_NEW_TO_CURRICULUM",
      confidence: "MEDIUM",
      sourceIds: [],
      explanationCode: "NOT_IN_BACKGROUND_CURRICULUM",
    },
  ],
  unresolved: ["The 2027 syllabus was not available."],
  comparisonConfidence: "MEDIUM",
};

/** The same extraction, with each row citing the source id the server issued. */
function extractedWithCitations(sourceIds: string[]): ComparisonExtraction {
  return {
    ...EXTRACTION,
    units: EXTRACTION.units.map((unit) => ({ ...unit, sourceIds })),
  };
}

describe("comparison: the reference A-Level → NET flow", () => {
  it("classifies the confirmed units and never claims anything about the student", async () => {
    const url = "https://www.cambridgeinternational.org/programmes/spec-9709.pdf";
    let issued: string[] = [];
    const outcome = await runCurriculumComparison({
      brief: netBrief(),
      search: search([url]),
      model: model(citedExtraction, (input) => {
        issued = (input as { sources: { sourceId: string }[] }).sources.map((source) => source.sourceId);
      }),
      fetchImpl: fetchText("Pure Mathematics 1: quadratics, matrices, sequences and series."),
      now: () => "2030-01-05T00:00:00.000Z",
    });

    const unit = (ref: string) => outcome.comparison.units.find((entry) => entry.unitRef === ref)!;
    expect(unit("t1").overlap).toBe("LIKELY_COVERED_BY_CURRICULUM");
    expect(unit("t2").overlap).toBe("PARTIAL_OVERLAP");
    expect(unit("t3").overlap).toBe("LIKELY_NEW_TO_CURRICULUM");
    expect(unit("t1").sourceIds).toEqual(issued);
    expect(outcome.comparison.status).toBe("OK");

    /**
     * The absolute rule: no row may carry, imply or even have room for a preparedness
     * answer. Serialized, the whole result mentions no coverage, no confidence in the
     * person, no difficulty and no mastery.
     */
    const serialized = JSON.stringify(outcome.comparison);
    expect(serialized).not.toMatch(/"covered"|"mastery"|"difficult"|"priority"/);
    expect(serialized).not.toMatch(/student|confident in|knows/i);
  });

  it("costs one search plan, one fetch round and one comparison pass — not one per topic", async () => {
    const url = "https://www.cambridgeinternational.org/programmes/spec-9709.pdf";
    const planCalls = { value: 0 };
    const compareCalls = { value: 0 };
    const provider = search([url, `${url}?page=2`, `${url}?page=3`, `${url}?page=4`, `${url}?page=5`]);
    const fetcher = fetchText("A".repeat(2_000));
    const outcome = await runCurriculumComparison({
      brief: netBrief(),
      search: provider,
      model: {
        async planQueries() {
          planCalls.value += 1;
          return {
            plan: {
              queries: [
                { query: "CAIE A-Level Mathematics 9709 syllabus", purpose: "OFFICIAL_SYLLABUS" },
                { query: "CAIE A-Level Physics 9702 syllabus", purpose: "FOLLOW_UP" },
              ],
            },
            usage: USAGE,
          };
        },
        async compare(input) {
          compareCalls.value += 1;
          return {
            comparison: extractedWithCitations(input.sources.map((source) => source.sourceId)),
            usage: USAGE,
          };
        },
      },
      fetchImpl: fetcher,
      now: () => "2030-01-05T00:00:00.000Z",
    });

    // Two planned queries is the ceiling; two model calls is plan + compare, and the
    // number of compared units never appears in either count.
    expect(planCalls.value).toBe(1);
    expect(compareCalls.value).toBe(1);
    expect(outcome.metrics.modelPasses).toBe(2);
    expect(outcome.metrics.modelCalls).toBe(2);
    expect(outcome.metrics.searchCalls).toBeLessThanOrEqual(COMPARISON_LIMITS.searchQueries);
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(COMPARISON_LIMITS.fetchedSources);
    expect(fetcher).toHaveBeenCalledTimes(outcome.metrics.sourcesFetched);
    expect(outcome.metrics.targetUnits).toBe(3);
    expect(outcome.metrics.inputChars).toBeGreaterThan(0);
    expect(outcome.metrics.outputChars).toBeGreaterThan(0);
  });

  it("reuses a stored result for the same question without touching the network", async () => {
    const brief = netBrief();
    const first = await runCurriculumComparison({
      brief,
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: model(citedExtraction),
      fetchImpl: fetchText("syllabus text"),
      now: () => "2030-01-05T00:00:00.000Z",
    });
    // A status of WEAK still counts as an answer worth reusing; the cached path is what
    // is under test here.
    const stored = { ...brief, comparison: first.comparison };
    const provider = search(["https://www.cambridgeinternational.org/spec.pdf"]);
    const second = await runCurriculumComparison({
      brief: stored,
      search: provider,
      model: model(citedExtraction),
      fetchImpl: fetchText("syllabus text"),
      now: () => "2030-01-06T00:00:00.000Z",
    });
    expect(second.metrics.cacheHit).toBe(true);
    expect(second.metrics.searchCalls).toBe(0);
    expect(second.metrics.modelCalls).toBe(0);
    expect(provider.search).not.toHaveBeenCalled();
    expect(second.comparison.createdAt).toBe(first.comparison.createdAt);
    expect(comparisonCacheKey(stored)).toBe(comparisonCacheKey(brief));
  });

  it("re-runs when the student forces it, and when the background changed", async () => {
    const brief = netBrief();
    const first = await runCurriculumComparison({
      brief,
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: model(citedExtraction),
      fetchImpl: fetchText("syllabus text"),
      now: () => "2030-01-05T00:00:00.000Z",
    });
    const forced = await runCurriculumComparison({
      brief: { ...brief, comparison: first.comparison },
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: model(citedExtraction),
      fetchImpl: fetchText("syllabus text"),
      force: true,
      now: () => "2030-01-06T00:00:00.000Z",
    });
    expect(forced.metrics.cacheHit).toBe(false);
    expect(forced.comparison.createdAt).toBe("2030-01-06T00:00:00.000Z");

    const changed = netBrief({
      backgroundCurriculum: { label: "FSc Pre-Engineering", level: "Intermediate", board: "FBISE", subjects: ["Mathematics"] },
    });
    expect(comparisonIsStale(first.comparison, changed)).toBe(true);
  });
});

describe("comparison: three refusals that must never reach a provider", () => {
  it("does nothing at all when the student switched research off", async () => {
    const provider = search(["https://www.cambridgeinternational.org/spec.pdf"]);
    const modelStub = model(citedExtraction);
    const outcome = await runCurriculumComparison({
      brief: netBrief({ researchPolicy: "OFF" }),
      search: provider,
      model: modelStub,
    });
    expect(outcome.comparison.status).toBe("UNAVAILABLE");
    expect(outcome.comparison.failureCode).toBe("COMPARISON_RESEARCH_OFF");
    expect(provider.search).not.toHaveBeenCalled();
    expect(modelStub.planCalls).toBe(0);
    expect(modelStub.compareCalls).toBe(0);
    expect(outcome.metrics.modelCalls).toBe(0);
  });

  it("says comparison is unavailable when no search credential is configured, and still asks nothing of the model", async () => {
    const modelStub = model(citedExtraction);
    const outcome = await runCurriculumComparison({
      brief: netBrief(),
      search: null,
      model: modelStub,
    });
    expect(outcome.comparison.status).toBe("UNAVAILABLE");
    expect(outcome.comparison.failureCode).toBe("COMPARISON_SEARCH_UNAVAILABLE");
    expect(outcome.comparison.searchProvider).toBe("none");
    // The one thing that must never happen: a model call with imagined web context.
    expect(modelStub.planCalls).toBe(0);
    expect(modelStub.compareCalls).toBe(0);
    expect(outcome.comparison.summary).toMatch(/not configured/);
  });

  it("is not applicable without a background curriculum or without a confirmed scope", async () => {
    const modelStub = model(citedExtraction);
    const noBackground = await runCurriculumComparison({
      brief: netBrief({ backgroundCurriculum: null }),
      search: search([]),
      model: modelStub,
    });
    expect(noBackground.comparison.failureCode).toBe("COMPARISON_NOT_APPLICABLE");
    expect(modelStub.compareCalls).toBe(0);

    const emptyScope = netBrief();
    emptyScope.scope = { ...emptyScope.scope, nodes: [] };
    const noScope = await runCurriculumComparison({
      brief: emptyScope,
      search: search([]),
      model: modelStub,
    });
    expect(noScope.comparison.failureCode).toBe("COMPARISON_NOT_APPLICABLE");
    expect(modelStub.compareCalls).toBe(0);
  });

  it("reports zero results and unreadable pages distinctly", async () => {
    const zero = await runCurriculumComparison({
      brief: netBrief(),
      search: search([]),
      model: model(citedExtraction),
    });
    expect(zero.comparison.failureCode).toBe("COMPARISON_SEARCH_ZERO_RESULTS");

    const unreadable = await runCurriculumComparison({
      brief: netBrief(),
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: model(citedExtraction),
      fetchImpl: vi.fn(async () => {
        throw new Error("FETCH_TIMEOUT");
      }),
    });
    expect(unreadable.comparison.failureCode).toBe("COMPARISON_FETCH_FAILED");
  });

  it("reports a model that cannot answer as a failure, not as an empty result", async () => {
    const outcome = await runCurriculumComparison({
      brief: netBrief(),
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: {
        async planQueries() {
          return {
            plan: { queries: [{ query: "CAIE A-Level Mathematics 9709 syllabus", purpose: "OFFICIAL_SYLLABUS" }] },
            usage: USAGE,
          };
        },
        async compare() {
          // A hostile or malformed answer: a URL where a ref belongs.
          return {
            comparison: { not: "a comparison" } as never,
            usage: USAGE,
          };
        },
      },
      fetchImpl: fetchText("syllabus text"),
    });
    expect(outcome.comparison.status).toBe("UNAVAILABLE");
    expect(outcome.comparison.failureCode).toBe("COMPARISON_MODEL_BAD_OUTPUT");
    expect(outcome.comparison.units).toEqual([]);
  });
});

describe("comparison: provider versioning", () => {
  it("carries the pipeline version, so a rule change invalidates a cached answer", async () => {
    const outcome = await runCurriculumComparison({
      brief: netBrief(),
      search: search(["https://www.cambridgeinternational.org/spec.pdf"]),
      model: model(citedExtraction),
      fetchImpl: fetchText("syllabus text"),
    });
    expect(outcome.comparison.providerVersion).toBe(COMPARISON_PROVIDER_VERSION);
    expect(outcome.comparison.searchProvider).toBe("brave");
  });
});
