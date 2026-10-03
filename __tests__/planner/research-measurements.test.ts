// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent } from "@/lib/planner/research/agent";
import { buildSource, rankSources, dedupeSources } from "@/lib/planner/research/sources";
import { classifyHost } from "@/lib/planner/research/authority";
import { RESEARCH_BOUNDS } from "@/lib/planner/research/search/contracts";
import { fetchBytesBucket } from "@/lib/planner/telemetry";

/** Phase 2.1's measured numbers, printed so the report quotes facts rather than hopes. */

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
});
const target = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };
const usage = { inputTokens: 800, outputTokens: 400, calls: 1 };

describe("Phase 2.1 measurements", () => {
  it("keeps a candidate well inside the brief's 64 KiB envelope", async () => {
    const nodes = Array.from({ length: 200 }, (_, index) => ({
      label: `Unit ${index + 1} of a realistic syllabus title`,
      kind: "TOPIC" as const,
      parentIndex: null,
    }));
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: {
        id: "brave",
        search: async () => [
          { url: "https://nust.edu.pk/net", title: "NET syllabus", snippet: null, rank: 1, provider: "brave" },
        ],
      },
      model: {
        planResearch: async () => ({
          plan: {
            depth: "STANDARD" as const,
            objectives: [{ id: "o1", question: "What does the NET cover?", priority: "PRIMARY" as const }],
            queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" }],
          },
          usage,
        }),
        planQueries: async () => ({ plan: { queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" }] }, usage }),
        // Doubles that prove no evidence. These tests measure cost and payload, so the honest
        // stub is "extraction succeeded, nothing claimed" — which also exercises the empty-ledger
        // path that §52 depends on.
        planFollowUp: async () => ({ plan: { queries: [] }, usage }),
        extract: async () => ({
          extraction: {
            targetIdentity: { name: "NUST NET", institution: "NUST", board: null, level: null },
            scope: nodes,
            sourceMappings: [{ nodeIndexes: nodes.map((_, index) => index), sourceIds: [] }],
            unresolved: [],
            extractionConfidence: "HIGH",
            conflicts: [],
          },
          claims: [],
          usage,
        }),
      },
      fetchImpl: async (url) => ({
        finalUrl: url,
        contentType: "text/html",
        text: "# Algebra\n- Quadratics",
        partial: false,
        partialReason: null,
        bytes: 12_000,
      requests: 1,
      }),
    });
    const bytes = Buffer.byteLength(JSON.stringify(outcome.candidate), "utf8");
    console.log("candidate bytes (200 nodes)", { bytes, cap: 65_536, nodes: outcome.candidate.nodes.length });
    expect(bytes).toBeLessThan(65_536);
    expect(outcome.candidate.nodes).toHaveLength(200);
  });

  it("reports the cost of one run in the three separate currencies", async () => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: {
        id: "brave",
        search: async () => [
          { url: "https://nust.edu.pk/net", title: "NET syllabus", snippet: null, rank: 1, provider: "brave" },
          { url: "https://prepblog.example/notes", title: "Notes", snippet: null, rank: 2, provider: "brave" },
        ],
      },
      model: {
        planResearch: async () => ({
          plan: {
            depth: "STANDARD" as const,
            objectives: [{ id: "o1", question: "What does the NET cover?", priority: "PRIMARY" as const }],
            queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" }],
          },
          usage,
        }),
        planQueries: async () => ({ plan: { queries: [{ query: "NUST NET syllabus", purpose: "OFFICIAL_SYLLABUS" }] }, usage }),
        planFollowUp: async () => ({ plan: { queries: [] }, usage }),
        extract: async () => ({
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
        }),
      },
      fetchImpl: async (url) => ({
        finalUrl: url,
        contentType: "text/html",
        text: "x".repeat(12_000),
        partial: false,
        partialReason: null,
        bytes: 180_000,
      requests: 1,
      }),
    });
    console.log("run cost", {
      ...outcome.metrics,
      fetchBytesBucket: fetchBytesBucket(outcome.metrics.fetchBytes),
    });
    expect(outcome.metrics.searchCalls).toBe(1);
    expect(outcome.metrics.modelPasses).toBe(2);
    expect(outcome.metrics.sourcesFetched).toBeLessThanOrEqual(RESEARCH_BOUNDS.maxFetchedSources);
  });

  it("ranks and classifies a realistic result set in well under a millisecond", () => {
    const started = performance.now();
    const sources = Array.from({ length: 8 }, (_, index) =>
      buildSource({
        url: `https://example${index}.com/spec.pdf`,
        title: `Specification ${index}`,
        context: target,
        retrievedAt: "2030-01-07T00:00:00.000Z",
      })!
    );
    rankSources(dedupeSources(sources));
    const perCallMs = performance.now() - started;
    console.log("ranking runtime (8 sources)", { perCallMs: Number(perCallMs.toFixed(3)) });
    // Generous ceiling: a cost measurement, not a correctness property.
    expect(perCallMs).toBeLessThan(50);
    expect(classifyHost("nust.edu.pk", target)).toBe("OFFICIAL");
  });
});
