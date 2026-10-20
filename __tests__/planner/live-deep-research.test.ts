// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { researchScope } from "@/lib/planner/research/service";
import { RESEARCH_DEPTH_BUDGETS } from "@/lib/planner/research/search/contracts";

/**
 * The live DEEP run: real DeepSeek, real Serper, real pages.
 *
 * Phase 2's central claim is that the deeper tier *buys evidence* rather than merely costing more.
 * That claim cannot be checked against a stubbed model, because the follow-up round only happens
 * when a real extraction genuinely fails to answer a real question — a fixture that decides in
 * advance which objectives come back empty is testing the branch, not the behaviour.
 *
 * So this asks a real, multi-part question whose answers genuinely live on different documents,
 * forces the deepest tier, and reports what happened: whether the follow-up ran, which objectives
 * it aimed at, whether coverage improved, and what the whole run cost. It asserts only the
 * invariants that must hold whatever the web returns — never a node count, and never that the
 * research succeeded, because a target whose official pages refuse us must still finish honestly.
 *
 * Opt-in, because it spends real quota and real money:
 *
 *     PLANNER_LIVE_RESEARCH_SMOKE=true node scripts/test/test-planner-postgres.mjs \
 *       __tests__/planner/live-deep-research.test.ts
 */

const LIVE = process.env.PLANNER_LIVE_RESEARCH_SMOKE === "true";
const database = process.env.PLANNER_TEST_DATABASE_URL;

/**
 * vitest does not read `.env` — Next.js does that at runtime — so a live suite has to load it
 * itself. Without this the keys are undefined and the run would fail on configuration rather than
 * on anything it was written to check.
 */
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const briefFor = (goal: string, subject: string): PlanBriefV1 => {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: goal },
    subject: { kind: "FREE_TEXT", subjectId: null, name: subject },
    target: { endDate: "2030-06-01", examDate: "2030-06-01" },
    budget: { ...base.budget, weeklyMinutes: 600 },
    backgroundCurriculum: null,
    researchPolicy: "ALLOW",
    scope: {
      source: "USER_MANUAL",
      confirmedAt: null,
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: [],
    },
  };
};

describe.skipIf(!database || !LIVE)("Phase 2 live DEEP research", () => {
  it("runs a forced DEEP research and reports what the follow-up round bought", async () => {
    expect(process.env.SERPER_API_KEY).toBeTruthy();
    expect(process.env.SEARCH_PROVIDER).toBe("serper");

    const started = Date.now();
    const outcome = await researchScope({
      brief: briefFor("CAIE A Level Mathematics 9709", "Mathematics"),
      // Forced, because the tier is usually the model's choice and this scenario exists to
      // exercise the deepest path. It is also the only way to prove the ceiling accepts it.
      requestedDepth: "DEEP",
    });
    const elapsedMs = Date.now() - started;
    const m = outcome.metrics;
    const coverage = outcome.candidate.coverage;

    // eslint-disable-next-line no-console
    console.log(
      `LIVE_DEEP ${JSON.stringify({
        status: outcome.candidate.status,
        failureCode: outcome.candidate.failureCode,
        modelFailure: m.modelFailure,
        coverageBeforeFollowUp: m.coverageBefore,
        coverageAfterFollowUp: m.coverage,
        summary: outcome.candidate.summary,
        depthRequested: "DEEP",
        depthUsed: m.depth,
        objectives: m.objectives,
        queries: m.queriesGenerated,
        followupRoundUsed: m.followUpUsed,
        followupQueries: m.followupQueries,
        searchCalls: m.searchCalls,
        resultsReturned: m.resultsReturned,
        uniqueCandidates: m.searchResults,
        duplicatesRemoved: m.duplicatesRemoved,
        uniqueDomains: m.uniqueDomains,
        crossConfirmed: m.crossConfirmed,
        selectedSources: m.selectedSources,
        sourceCandidates: m.sourceCandidates,
        sourcesFetched: m.sourcesFetched,
        fetchFailures: m.fetchFailures,
        httpRequests: m.httpRequests,
        evidenceAccepted: m.evidenceAccepted,
        evidenceRejected: m.evidenceRejected,
        coverage: coverage?.summary ?? null,
        coverageStates: (coverage?.objectives ?? []).map((entry) => `${entry.objectiveId}:${entry.state}`),
        modelPasses: m.modelPasses,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        elapsedMs,
        nodeCount: outcome.candidate.nodes.length,
        officialSources: m.officialSourceCount,
        institutionalSources: m.institutionalSourceCount,
        secondarySources: m.secondarySourceCount,
      })}`
    );

    /**
     * The invariants, and only the invariants.
     *
     * The depth was asked for and must be the depth that ran; the run must stay inside its own
     * budget; a follow-up round may appear at most once; and the result must be a self-consistent
     * research outcome. What the web returned is not asserted, because that is the web's business
     * and a report that pinned it would be a report about one afternoon's search results.
     */
    expect(m.depth).toBe("DEEP");
    expect(m.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFetchedSources);
    expect(m.queriesGenerated).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxQueries);
    expect(m.followupQueries).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFollowUpQueries);
    expect(m.modelPasses).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxModelPasses);
    // A run may not claim a follow-up it did not perform, nor perform one it does not report.
    expect(m.followUpUsed === m.followupQueries > 0).toBe(true);
    expect(["OK", "WEAK", "UNAVAILABLE"]).toContain(outcome.candidate.status);
    // Coverage is reported for every objective the plan stated, and never claims an objective it
    // has no verified evidence for.
    if (coverage) {
      expect(coverage.objectives).toHaveLength(m.objectives);
      expect(coverage.summary.totalObjectives).toBe(m.objectives);
      expect(coverage.summary.covered).toBeLessThanOrEqual(m.objectives);
      for (const entry of coverage.objectives)
        if (entry.claimCount === 0) expect(entry.state).toBe("UNANSWERED");
    }
    // No page text is stored: an excerpt is a sentence, and the ledger is bounded.
    for (const claim of outcome.candidate.evidence?.claims ?? []) {
      expect(claim.excerpt.length).toBeLessThanOrEqual(240);
      expect(claim.claimId.startsWith("ev-")).toBe(true);
    }
  }, 600_000);
});
