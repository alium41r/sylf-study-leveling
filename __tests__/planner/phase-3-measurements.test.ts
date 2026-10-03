// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  emptyBrief,
  flattenScope,
  serializedBriefBytes,
  type PlanBriefV1,
  type ScopeNode,
} from "@/lib/planner/intake/brief";
import {
  COMPARISON_LIMITS,
  comparisonSummarySentence,
  overlapCounts,
  type ComparisonUnit,
} from "@/lib/planner/comparison/contracts";
import {
  comparisonFromExtraction,
  comparisonTargets,
  runCurriculumComparison,
  type ComparisonModel,
} from "@/lib/planner/research/comparison";
import { buildSource } from "@/lib/planner/research/sources";
import type { COMPARISON_STATUSES } from "@/lib/planner/comparison/contracts";

/**
 * Phase 3's measured numbers, printed so the report quotes facts rather than hopes.
 *
 * Everything here is a ceiling being checked, not a benchmark: the numbers that matter
 * are payload sizes against the brief's 64 KiB envelope, the model's input and output
 * characters against `COMPARISON_LIMITS`, and the count of network calls against the
 * phase's promise that a forty-topic scope does not cost forty calls.
 */

/** A confirmed scope of `count` topics under `chapters` chapters. */
function scopeOf(count: number, chapters = 4): ScopeNode[] {
  const nodes: ScopeNode[] = [];
  for (let chapter = 0; chapter < chapters; chapter += 1)
    nodes.push({
      nodeId: `c${chapter}`,
      label: `Chapter ${chapter + 1}: a realistically worded section heading`,
      kind: "CHAPTER",
      parentId: null,
      selected: true,
    });
  for (let index = 0; index < count; index += 1)
    nodes.push({
      nodeId: `u${index}`,
      label: `Unit ${index + 1}: a realistically worded syllabus topic`,
      kind: "TOPIC",
      parentId: `c${index % chapters}`,
      selected: true,
    });
  return nodes;
}

function briefOf(nodes: ScopeNode[]): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: "NUST NET Engineering" },
    target: { endDate: "2030-06-01", examDate: "2030-06-01" },
    budget: { ...base.budget, weeklyMinutes: 600 },
    backgroundCurriculum: {
      label: "CAIE A-Level",
      level: "A-Level",
      board: "CAIE",
      subjects: ["Mathematics", "Physics", "Computer Science"],
    },
    scope: {
      source: "RESEARCH_CONFIRMED",
      confirmedAt: "2030-01-02T00:00:00.000Z",
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes,
    },
  };
}

const USAGE = { inputTokens: 1_000, outputTokens: 500, calls: 1 };

function model(): ComparisonModel {
  return {
    async planQueries() {
      return {
        plan: {
          queries: [
            { query: "CAIE A-Level Mathematics 9709 syllabus", purpose: "OFFICIAL_SYLLABUS" },
            { query: "CAIE A-Level Physics 9702 specification", purpose: "FOLLOW_UP" },
          ],
        },
        usage: USAGE,
      };
    },
    async compare(input) {
      return {
        comparison: {
          backgroundUnits: Array.from({ length: 40 }, (_, index) => ({ label: `Background unit ${index + 1}` })),
          units: input.targetUnits.map((unit, index) => ({
            unitRef: unit.unitRef,
            overlap: (["LIKELY_COVERED_BY_CURRICULUM", "PARTIAL_OVERLAP", "LIKELY_NEW_TO_CURRICULUM", "UNCLEAR"] as const)[index % 4],
            confidence: "MEDIUM" as const,
            sourceIds: input.sources.slice(0, 1).map((source) => source.sourceId),
            explanationCode: "BACKGROUND_TOPIC_MATCH" as const,
          })),
          unresolved: ["The 2027 syllabus was not published yet."],
          comparisonConfidence: "MEDIUM" as const,
        },
        usage: USAGE,
      };
    },
  };
}

describe("Phase 3 measurements", () => {
  it("keeps a 40-topic brief well inside the 64 KiB envelope", () => {
    const brief = briefOf(scopeOf(40));
    const bytes = serializedBriefBytes(brief);
    console.log("brief bytes at 40 topics", bytes, "ceiling", 65536);
    expect(bytes).toBeLessThan(65536 / 4);
  });

  it("keeps a 200-node brief inside the envelope, with a comparison attached", () => {
    const brief = briefOf(scopeOf(150, 8));
    expect(brief.scope.nodes.length).toBeGreaterThanOrEqual(158);
    const units = comparisonTargets(brief);
    const built = comparisonFromExtraction({
      brief,
      extraction: {
        backgroundUnits: Array.from({ length: 40 }, (_, index) => ({ label: `Background unit ${index + 1}` })),
        units: [],
        unresolved: [],
        comparisonConfidence: "MEDIUM",
      },
      sources: [
        buildSource({
          url: "https://www.cambridgeinternational.org/spec-9709.pdf",
          title: "Cambridge 9709",
          context: { goal: "CAIE A-Level", board: "CAIE", level: "A-Level" },
          retrievedAt: "2030-01-05T00:00:00.000Z",
        })!,
      ],
      retrievedAt: "2030-01-05T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    const withComparison = { ...brief, comparison: built.comparison };
    const bytes = serializedBriefBytes(withComparison);
    console.log(
      "brief bytes at 158 nodes + comparison",
      bytes,
      "comparison units",
      built.comparison.units.length,
      "target units",
      units.length,
      "engine units",
      flattenScope(brief.scope.nodes).units.length,
      "strategy",
      flattenScope(brief.scope.nodes).strategy
    );
    expect(bytes).toBeLessThan(65536);
    // The comparison is capped at the engine's own unit ceiling, whatever the tree size.
    expect(units.length).toBeLessThanOrEqual(COMPARISON_LIMITS.units);
    /**
     * And it compares *exactly* the units the engine will plan. A 150-topic syllabus
     * flattens at chapter level (the engine's own large-scope rule), so the overlap map
     * has eight rows rather than a hundred and fifty — the same eight the plan will hold.
     */
    expect(units.length).toBe(flattenScope(brief.scope.nodes).units.length);
    expect(built.comparison.units).toHaveLength(units.length);
  });

  it("measures a full comparison run: calls, payload characters, payload bytes", async () => {
    const brief = briefOf(scopeOf(40));
    const fetcherCalls: string[] = [];
    let inputChars = 0;
    let outputChars = 0;
    const outcome = await runCurriculumComparison({
      brief,
      search: {
        id: "brave",
        async search() {
          return Array.from({ length: 8 }, (_, index) => ({
            url: `https://www.cambridgeinternational.org/spec-9709-${index}.pdf`,
            title: `Cambridge 9709 part ${index + 1}`,
            snippet: null,
            rank: index + 1,
            provider: "brave" as const,
          }));
        },
      },
      model: model(),
      fetchImpl: async (url) => {
        fetcherCalls.push(url);
        return {
          finalUrl: url,
          text: "x".repeat(COMPARISON_LIMITS.sourceChars),
          bytes: COMPARISON_LIMITS.sourceChars,
          contentType: "text/html",
          partial: false,
          partialReason: null,
        requests: 1,
        };
      },
      now: () => "2030-01-05T00:00:00.000Z",
    });
    inputChars = outcome.metrics.inputChars;
    outputChars = outcome.metrics.outputChars;
    console.log("comparison metrics", JSON.stringify(outcome.metrics));
    // Two planned queries is the ceiling, and both were searched: the bound is what
    // matters, and it does not scale with the number of units.
    expect(outcome.metrics.searchCalls).toBeLessThanOrEqual(COMPARISON_LIMITS.searchQueries);
    expect(fetcherCalls.length).toBeLessThanOrEqual(COMPARISON_LIMITS.fetchedSources);
    expect(outcome.metrics.modelPasses).toBe(2);
    expect(inputChars).toBeLessThanOrEqual(COMPARISON_LIMITS.inputChars);
    expect(outputChars).toBeLessThanOrEqual(COMPARISON_LIMITS.outputChars);
    expect(outcome.comparison.units).toHaveLength(40);
  });

  it("measures the Phase 3.1 worst case: confirmed provenance at its bound", () => {
    /**
     * Eight confirmed sources is the ceiling this patch allows, and the question the goal
     * asks is whether keeping them threatens the brief's 64 KiB envelope. It does not:
     * a confirmed record is a fraction of a research record, because the node mapping
     * stays on the nodes and no content is copied.
     */
    const record = (index: number) => ({
      sourceId: `src-confirmed-${index}`,
      url: `https://www.cambridgeinternational.org/programmes/specification-${index}.pdf`,
      title: `Cambridge International specification ${index} for a realistically titled qualification`,
      publisherOrDomain: "cambridgeinternational.org",
      sourceType: "OFFICIAL_PDF" as const,
      retrievedAt: "2030-01-05T00:00:00.000Z",
      documentDate: "2026",
    });
    const brief = briefOf(scopeOf(40));
    brief.scope = {
      ...brief.scope,
      provenanceRefs: Array.from({ length: 8 }, (_, index) => `src-confirmed-${index}`),
      provenanceSources: Array.from({ length: 8 }, (_, index) => record(index)),
    };
    const bytes = serializedBriefBytes(brief);
    console.log("brief bytes at 40 topics + 8 confirmed sources", bytes, "ceiling", 65536);
    expect(bytes).toBeLessThan(65536 / 4);

    // The largest realistic case: a big hierarchy, a comparison, and a full snapshot.
    const large = briefOf(scopeOf(150, 8));
    const comparisonRows: ComparisonUnit[] = Array.from({ length: COMPARISON_LIMITS.units }, (_, index) => ({
      unitRef: `u${index}`,
      overlap: (["LIKELY_COVERED_BY_CURRICULUM", "PARTIAL_OVERLAP", "LIKELY_NEW_TO_CURRICULUM", "UNCLEAR"] as const)[index % 4],
      confidence: "MEDIUM",
      sourceIds: [`src-confirmed-${index % 8}`],
      explanationCode: "BACKGROUND_TOPIC_MATCH",
    }));
    const withComparisonAndProvenance = {
      ...large,
      scope: {
        ...large.scope,
        provenanceRefs: Array.from({ length: 8 }, (_, index) => `src-confirmed-${index}`),
        provenanceSources: Array.from({ length: 8 }, (_, index) => record(index)),
      },
      comparison: {
        version: 1 as const,
        status: "OK" as const,
        failureCode: null,
        targetScopeDigest: "a".repeat(32),
        backgroundDigest: "b".repeat(32),
        providerVersion: "deepseek-search-comparison-v1",
        searchProvider: "brave" as const,
        createdAt: "2030-01-05T00:00:00.000Z",
        units: comparisonRows,
        sources: [
          buildSource({
            url: "https://www.cambridgeinternational.org/spec-9709.pdf",
            title: "Cambridge 9709",
            context: { goal: "CAIE A-Level", board: "CAIE", level: "A-Level" },
            retrievedAt: "2030-01-05T00:00:00.000Z",
          })!,
        ],
        unresolved: ["The 2027 syllabus was not published yet."],
        summary: comparisonSummarySentence(overlapCounts(comparisonRows), "CAIE A-Level"),
      },
    };
    const worst = serializedBriefBytes(withComparisonAndProvenance);
    console.log(
      "brief bytes at 158 nodes + comparison + 8 confirmed sources",
      worst,
      "confirmed source bytes",
      JSON.stringify(withComparisonAndProvenance.scope.provenanceSources).length
    );
    expect(worst).toBeLessThan(65536);
    // The snapshot itself is a small fraction of the envelope, not a rival to it.
    expect(JSON.stringify(withComparisonAndProvenance.scope.provenanceSources).length).toBeLessThan(
      65536 / 8
    );
  });

  it("measures the cache-hit path: no search, no fetch, no model call", async () => {
    const brief = briefOf(scopeOf(40));
    const first = await runCurriculumComparison({
      brief,
      search: {
        id: "brave",
        async search() {
          return [
            {
              url: "https://www.cambridgeinternational.org/spec-9709.pdf",
              title: "Cambridge 9709",
              snippet: null,
              rank: 1,
              provider: "brave" as const,
            },
          ];
        },
      },
      model: model(),
      fetchImpl: async (url) => ({
        finalUrl: url,
        text: "syllabus text",
        bytes: 13,
        contentType: "text/html",
        partial: false,
        partialReason: null,
      requests: 1,
      }),
      now: () => "2030-01-05T00:00:00.000Z",
    });
    const started = performance.now();
    const cached = await runCurriculumComparison({
      brief: { ...brief, comparison: first.comparison },
      search: {
        id: "brave",
        async search() {
          throw new Error("a cache hit must not search");
        },
      },
      model: {
        async planQueries() {
          throw new Error("a cache hit must not plan");
        },
        async compare() {
          throw new Error("a cache hit must not call the model");
        },
      },
    });
    const elapsed = performance.now() - started;
    console.log("cache hit ms", Number(elapsed.toFixed(2)), "cacheHit", cached.metrics.cacheHit);
    expect(cached.metrics.cacheHit).toBe(true);
    expect(cached.metrics.modelCalls).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });

  it("measures the contract itself at the ceiling: 50 units", () => {
    const units: ComparisonUnit[] = Array.from({ length: COMPARISON_LIMITS.units }, (_, index) => ({
      unitRef: `u${index}`,
      overlap: (["LIKELY_COVERED_BY_CURRICULUM", "PARTIAL_OVERLAP", "LIKELY_NEW_TO_CURRICULUM", "UNCLEAR"] as const)[index % 4],
      confidence: "MEDIUM",
      sourceIds: ["src-1", "src-2", "src-3", "src-4"],
      explanationCode: "BACKGROUND_TOPIC_MATCH",
    }));
    const counts = overlapCounts(units);
    const sentence = comparisonSummarySentence(counts, "CAIE A-Level");
    const bytes = new TextEncoder().encode(JSON.stringify(units)).byteLength;
    console.log("50 comparison rows bytes", bytes, "summary", sentence);
    expect(bytes).toBeLessThan(16 * 1024);
    expect(counts.total).toBe(50);
  });

  it("prints the ceilings the phase enforces, for the report", () => {
    const statuses: (typeof COMPARISON_STATUSES)[number][] = ["OK", "WEAK", "UNAVAILABLE"];
    console.log("comparison limits", JSON.stringify(COMPARISON_LIMITS), "statuses", statuses.join(","));
    expect(COMPARISON_LIMITS.modelPasses).toBe(1);
  });
});
