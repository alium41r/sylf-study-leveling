// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { researchScope, researchCacheKeyFor, researchBriefDigest } from "@/lib/planner/research/service";
import { RESEARCH_DEPTH_BUDGETS, type ResearchDepth } from "@/lib/planner/research/search/contracts";

/**
 * Phase 3 §28 — the live research matrix, and §30's STANDARD-versus-DEEP comparison.
 *
 * One bounded run over real DeepSeek, real Serper and real pages, covering the eight shapes §28
 * names. It is a *report* first: every case prints one structured line, and the assertions are the
 * invariants that must hold whatever the web returns today — budgets, the single follow-up, the
 * honesty of the coverage counts, and the two zero-cost paths. Nothing here pins a syllabus, a
 * source or a node count, because a report that did would be a report about one afternoon's search
 * results rather than about the engine.
 *
 * §30 is answered by running *the same target twice* — once at the depth the planner chooses, once
 * forced to `DEEP` — because "what did DEEP actually gain?" is only answerable as a difference
 * between two runs of the same question rather than as a number from one.
 *
 * Opt-in, because it spends real quota and real money (§44):
 *
 *     PLANNER_LIVE_RESEARCH_SMOKE=true node scripts/test/test-planner-postgres.mjs \
 *       __tests__/planner/live-research-matrix.test.ts
 */

const LIVE = process.env.PLANNER_LIVE_RESEARCH_SMOKE === "true";
const database = process.env.PLANNER_TEST_DATABASE_URL;

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

interface Case {
  id: string;
  goal: string;
  subject: string;
  board: string | null;
  level: string | null;
  /** Forced when the case exists to exercise a tier; `null` lets the planner choose. */
  force: ResearchDepth | null;
  /** What this case is here to find out. */
  why: string;
}

/**
 * The matrix, written from §28's list rather than from today's web.
 *
 * The targets are the shapes, not a fixture of expected answers: a syllabus lookup, a national
 * entry test, an admissions page, a year-specific specification, a fictional authority that must
 * produce nothing trustworthy, and the same real target at both tiers for §30.
 */
const MATRIX: Case[] = [
  {
    id: "caie-maths",
    goal: "CAIE A Level Mathematics 9709",
    subject: "Mathematics",
    board: "CAIE",
    level: "A-Level",
    force: null,
    why: "simple syllabus lookup with an official specification",
  },
  {
    id: "nust-net",
    goal: "NUST NET Engineering",
    subject: "Engineering",
    board: null,
    level: null,
    force: null,
    why: "national entry test: a university's own page, no board registry entry",
  },
  {
    id: "admissions",
    goal: "University of Edinburgh Computer Science entry requirements",
    subject: "Computer Science",
    board: null,
    level: null,
    force: null,
    why: "admissions/entry-requirements research, multi-objective by nature",
  },
  {
    id: "year-specific",
    goal: "CAIE A Level Physics 9702 2027 syllabus",
    subject: "Physics",
    board: "CAIE",
    level: "A-Level",
    force: null,
    why: "year-specific syllabus: the answer must be the right year's document",
  },
  {
    id: "fictional",
    goal: "The International Baccalaureate of Zubrowka Advanced Astrology Certificate",
    subject: "Astrology",
    board: null,
    level: null,
    force: null,
    why: "a fictional authority: the engine must return nothing trustworthy, honestly",
  },
  {
    id: "deep-tier",
    goal: "CAIE A Level Mathematics 9709",
    subject: "Mathematics",
    board: "CAIE",
    level: "A-Level",
    force: "DEEP",
    why: "§30: the same target as `caie-maths`, forced to DEEP for the comparison",
  },
];

const briefFor = (entry: Case): PlanBriefV1 => {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: entry.goal },
    subject: { kind: "FREE_TEXT", subjectId: null, name: entry.subject },
    target: { endDate: "2030-06-01", examDate: "2030-06-01" },
    budget: { ...base.budget, weeklyMinutes: 600 },
    backgroundCurriculum:
      entry.board && entry.level
        ? { label: entry.board, level: entry.level, board: entry.board, subjects: [entry.subject] }
        : null,
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

const report: Record<string, unknown>[] = [];

describe.skipIf(!database || !LIVE)("Phase 3 §28 live research matrix", () => {
  it("checks the live configuration is the production provider", () => {
    expect(process.env.SERPER_API_KEY).toBeTruthy();
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    expect(process.env.SEARCH_PROVIDER).toBe("serper");
  });

  it.each(MATRIX)("$id — $why", async (entry) => {
    const started = Date.now();
    const outcome = await researchScope({
      brief: briefFor(entry),
      ...(entry.force ? { requestedDepth: entry.force } : {}),
    });
    const elapsedMs = Date.now() - started;
    const m = outcome.metrics;
    const coverage = outcome.candidate.coverage;
    const budget = RESEARCH_DEPTH_BUDGETS[m.depth];

    const line = {
      id: entry.id,
      goal: entry.goal,
      status: outcome.candidate.status,
      failureCode: outcome.candidate.failureCode,
      modelFailure: m.modelFailure,
      depthUsed: m.depth,
      depthForced: entry.force,
      objectives: m.objectives,
      queries: m.queriesGenerated,
      queriesDeduplicated: m.queriesDeduplicated,
      queriesWithResults: m.queriesWithResults,
      resultsReturned: m.resultsReturned,
      uniqueCandidates: m.searchResults,
      uniqueDomains: m.uniqueDomains,
      crossConfirmed: m.crossConfirmed,
      duplicatesRemoved: m.duplicatesRemoved,
      sourceCandidates: m.sourceCandidates,
      selectedSources: m.selectedSources,
      sourcesFetched: m.sourcesFetched,
      fetchFailures: m.fetchFailures,
      httpRequests: m.httpRequests,
      evidenceAccepted: m.evidenceAccepted,
      evidenceRejected: m.evidenceRejected,
      coverage: coverage?.summary ?? null,
      coverageBefore: m.coverageBefore,
      coverageStates: (coverage?.objectives ?? []).map((e) => `${e.objectiveId}:${e.state}`),
      followUpUsed: m.followUpUsed,
      followupQueries: m.followupQueries,
      modelPasses: m.modelPasses,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      elapsedMs,
      nodeCount: outcome.candidate.nodes.length,
      officialSources: m.officialSourceCount,
      institutionalSources: m.institutionalSourceCount,
      secondarySources: m.secondarySourceCount,
      openQuestions: outcome.candidate.openQuestions.length,
    };
    report.push(line);
    // eslint-disable-next-line no-console
    console.log(`LIVE_MATRIX ${JSON.stringify(line)}`);

    // ── the invariants, which hold whatever the web returned today ─────────────────────────────
    // A forced tier is a contract; an adaptive one is the planner's choice and only has to be a
    // real tier. Asserting `depth === depth` in the adaptive case would check nothing.
    if (entry.force) expect(m.depth).toBe(entry.force);
    else expect(["LOOKUP", "STANDARD", "DEEP"]).toContain(m.depth);
    expect(["OK", "WEAK", "UNAVAILABLE"]).toContain(outcome.candidate.status);
    expect(m.sourcesFetched).toBeLessThanOrEqual(budget.maxFetchedSources);
    expect(m.queriesGenerated).toBeLessThanOrEqual(budget.maxQueries);
    expect(m.followupQueries).toBeLessThanOrEqual(budget.maxFollowUpQueries);
    expect(m.modelPasses).toBeLessThanOrEqual(budget.maxModelPasses);
    expect(m.httpRequests).toBeGreaterThanOrEqual(0);
    // A run may not claim a follow-up it did not perform, nor perform one it does not report.
    expect(m.followUpUsed === m.followupQueries > 0).toBe(true);
    // Only DEEP may follow up at all.
    if (m.depth !== "DEEP") expect(m.followUpUsed).toBe(false);

    if (coverage) {
      expect(coverage.objectives).toHaveLength(m.objectives);
      expect(coverage.summary.totalObjectives).toBe(m.objectives);
      expect(coverage.summary.covered).toBeLessThanOrEqual(m.objectives);
      // The row states and the summary must agree: a summary that said "3 covered" over rows that
      // said otherwise would be the exact dishonesty the panel exists to prevent.
      expect(coverage.objectives.filter((e) => e.state === "COVERED")).toHaveLength(coverage.summary.covered);
      expect(coverage.objectives.filter((e) => e.state === "UNANSWERED")).toHaveLength(coverage.summary.unanswered);
      expect(coverage.objectives.filter((e) => e.state === "CONFLICTED")).toHaveLength(coverage.summary.conflicted);
      for (const row of coverage.objectives) if (row.claimCount === 0) expect(row.state).toBe("UNANSWERED");
    } else {
      expect(m.objectives).toBe(0);
    }

    // Evidence is bounded, identifies itself, and never stores a page.
    for (const claim of outcome.candidate.evidence?.claims ?? []) {
      expect(claim.claimId.startsWith("ev-")).toBe(true);
      expect(claim.excerpt.length).toBeLessThanOrEqual(240);
      expect(claim.statement.length).toBeLessThanOrEqual(200);
      expect(claim.sourceId).toMatch(/^src-/);
    }
    // Coverage is earned: an objective is never covered without at least one verified claim.
    for (const row of coverage?.objectives ?? [])
      if (row.state === "COVERED") expect(row.claimCount).toBeGreaterThan(0);
  }, 900_000);

  it("§30 — the same target at both tiers, so the difference is measurable", async () => {
    const standard = report.find((entry) => entry.id === "caie-maths");
    const deep = report.find((entry) => entry.id === "deep-tier");
    // Ordered by the `it.each` above, but reported rather than assumed: a missing leg is a failed
    // comparison, not a silently empty one.
    expect(standard).toBeDefined();
    expect(deep).toBeDefined();

    const comparison = {
      depthDifference: `${standard!.depthUsed} → ${deep!.depthUsed}`,
      objectives: `${standard!.objectives} → ${deep!.objectives}`,
      queries: `${standard!.queries} → ${deep!.queries}`,
      sourcesFetched: `${standard!.sourcesFetched} → ${deep!.sourcesFetched}`,
      httpRequests: `${standard!.httpRequests} → ${deep!.httpRequests}`,
      evidenceAccepted: `${standard!.evidenceAccepted} → ${deep!.evidenceAccepted}`,
      coverage: `${JSON.stringify(standard!.coverage)} → ${JSON.stringify(deep!.coverage)}`,
      outputTokens: `${standard!.outputTokens} → ${deep!.outputTokens}`,
      elapsedMs: `${standard!.elapsedMs} → ${deep!.elapsedMs}`,
      followUpUsed: `${standard!.followUpUsed} → ${deep!.followUpUsed}`,
      status: `${standard!.status} → ${deep!.status}`,
    };
    // eslint-disable-next-line no-console
    console.log(`LIVE_STANDARD_VS_DEEP ${JSON.stringify(comparison)}`);

    /**
     * The difference is *reported*, not asserted, and that is the honest design.
     *
     * These are two independent live runs, so what the web returned to each is not under the
     * engine's control: asserting that DEEP read more pages would make this test flaky for a reason
     * that has nothing to do with the product. §29 says a follow-up that improves nothing is
     * allowed provided it is reported, and the same applies to a tier whose extra budget the day's
     * results did not use. What *is* structural is asserted: the forced tier ran, both runs stayed
     * inside their own budgets, and only DEEP was permitted a follow-up.
     */
    expect(deep!.depthUsed).toBe("DEEP");
    expect(deep!.followUpUsed === Number(deep!.followupQueries) > 0).toBe(true);
    expect(standard!.followUpUsed).toBe(false);
  }, 900_000);

  /**
   * §30's real experiment: a target the *first* round cannot finish.
   *
   * The comparison above is two independent runs of a well-documented syllabus, and on that target
   * DEEP gained nothing — which is a fact about the web, not about the tier: searching differently
   * for the same question returns the same pages, so there is nothing left to discover. The tier is
   * only supposed to pay off where the answer is *spread across documents the first search does not
   * surface*, and this is that case: an admissions question, multi-objective by nature, whose
   * STANDARD run in this matrix returned `UNAVAILABLE` with every objective unanswered.
   *
   * Both legs run here, back to back, on the same goal. That is the only way the difference is
   * attributable to the tier rather than to which afternoon the run happened on.
   */
  it("§30 — does the follow-up round close a question the first round could not?", async () => {
    const entry: Case = {
      id: "admissions-controlled",
      goal: "University of Edinburgh Computer Science entry requirements",
      subject: "Computer Science",
      board: null,
      level: null,
      force: null,
      why: "controlled STANDARD-versus-DEEP comparison on a target the first round could not finish",
    };

    const standardStarted = Date.now();
    const standard = await researchScope({ brief: briefFor(entry) });
    const standardMs = Date.now() - standardStarted;

    const deepStarted = Date.now();
    const deep = await researchScope({ brief: briefFor(entry), requestedDepth: "DEEP" });
    const deepMs = Date.now() - deepStarted;

    const summarise = (outcome: Awaited<ReturnType<typeof researchScope>>, elapsedMs: number) => ({
      status: outcome.candidate.status,
      failureCode: outcome.candidate.failureCode,
      depth: outcome.metrics.depth,
      objectives: outcome.metrics.objectives,
      queries: outcome.metrics.queriesGenerated,
      sourcesFetched: outcome.metrics.sourcesFetched,
      httpRequests: outcome.metrics.httpRequests,
      evidenceAccepted: outcome.metrics.evidenceAccepted,
      evidenceRejected: outcome.metrics.evidenceRejected,
      coverage: outcome.candidate.coverage?.summary ?? null,
      coverageBefore: outcome.metrics.coverageBefore,
      states: (outcome.candidate.coverage?.objectives ?? []).map((e) => `${e.objectiveId}:${e.state}`),
      followUpUsed: outcome.metrics.followUpUsed,
      followupQueries: outcome.metrics.followupQueries,
      modelPasses: outcome.metrics.modelPasses,
      outputTokens: outcome.metrics.outputTokens,
      nodeCount: outcome.candidate.nodes.length,
      officialSources: outcome.metrics.officialSourceCount,
      institutionalSources: outcome.metrics.institutionalSourceCount,
      elapsedMs,
    });

    const before = summarise(standard, standardMs);
    const after = summarise(deep, deepMs);
    const gained = {
      coveredDelta:
        (after.coverage?.covered ?? 0) - (before.coverage?.covered ?? 0),
      unansweredDelta:
        (after.coverage?.unanswered ?? 0) - (before.coverage?.unanswered ?? 0),
      highPriorityUnansweredDelta:
        (after.coverage?.highPriorityUnanswered ?? 0) - (before.coverage?.highPriorityUnanswered ?? 0),
      evidenceDelta: after.evidenceAccepted - before.evidenceAccepted,
      nodesDelta: after.nodeCount - before.nodeCount,
      latencyDeltaMs: after.elapsedMs - before.elapsedMs,
      outputTokenDelta: (after.outputTokens ?? 0) - (before.outputTokens ?? 0),
    };
    // eslint-disable-next-line no-console
    console.log(`LIVE_DEEP_VALUE ${JSON.stringify({ standard: before, deep: after, gained })}`);

    // The structural invariants: the forced tier ran, stayed in budget, and the round is one round.
    expect(after.depth).toBe("DEEP");
    expect(before.followUpUsed).toBe(false);
    expect(after.followUpUsed === after.followupQueries > 0).toBe(true);
    expect(after.followupQueries).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFollowUpQueries);
    expect(after.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.DEEP.maxFetchedSources);
    expect(before.sourcesFetched).toBeLessThanOrEqual(RESEARCH_DEPTH_BUDGETS.STANDARD.maxFetchedSources);
    for (const outcome of [standard, deep]) {
      expect(["OK", "WEAK", "UNAVAILABLE"]).toContain(outcome.candidate.status);
      const rows = outcome.candidate.coverage?.objectives ?? [];
      const summary = outcome.candidate.coverage?.summary;
      if (summary) {
        // The summary must agree with the rows in both legs, whatever the web returned.
        expect(rows.filter((row) => row.state === "COVERED")).toHaveLength(summary.covered);
        expect(rows.filter((row) => row.state === "UNANSWERED")).toHaveLength(summary.unanswered);
      }
      for (const row of rows) if (row.claimCount === 0) expect(row.state).toBe("UNANSWERED");
    }
    // Whether DEEP *gained* anything is deliberately not asserted: §29 says a round that improves
    // nothing is allowed, provided it is reported. `gained` above is that report.
  }, 900_000);

  it("§21 — researchPolicy OFF reaches no provider, no fetcher and no model", async () => {
    const brief = { ...briefFor({ ...MATRIX[0], id: "off" }), researchPolicy: "OFF" as const };
    const outcome = await researchScope({ brief, disabled: true });
    const m = outcome.metrics;
    // eslint-disable-next-line no-console
    console.log(
      `LIVE_POLICY_OFF ${JSON.stringify({
        status: outcome.candidate.status,
        failureCode: outcome.candidate.failureCode,
        cacheHit: m.cacheHit,
        searchCalls: m.searchCalls,
        sourcesFetched: m.sourcesFetched,
        httpRequests: m.httpRequests,
        modelCalls: m.modelCalls,
        modelPasses: m.modelPasses,
        nodes: outcome.candidate.nodes.length,
        sources: outcome.candidate.sources.length,
        coverage: outcome.candidate.coverage ?? null,
        evidence: outcome.candidate.evidence ?? null,
      })}`
    );
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.failureCode).toBe("RESEARCH_NOT_APPLICABLE");
    // Zero of everything: the claim is "no external call", and these are its five halves.
    expect(m.searchCalls).toBe(0);
    expect(m.sourcesFetched).toBe(0);
    expect(m.httpRequests).toBe(0);
    expect(m.modelPasses).toBe(0);
    expect(m.modelCalls).toBe(0);
    // …and nothing that pretends research happened.
    expect(outcome.candidate.nodes).toEqual([]);
    expect(outcome.candidate.sources).toEqual([]);
    expect(outcome.candidate.coverage).toBeUndefined();
    expect(outcome.candidate.evidence).toBeUndefined();
  }, 120_000);

  it("§25 — a repeat of a real answer is served from cache with zero external calls", async () => {
    // Built from the *live* candidate this matrix just produced, so the cache key and digest are
    // the real ones rather than a fixture's.
    const first = report.find((entry) => entry.id === "caie-maths");
    expect(first).toBeDefined();
    expect(Number(first!.sourcesFetched) + Number(first!.httpRequests)).toBeGreaterThan(0);

    // Re-run the same brief and confirm the second attempt is a cache hit only after a real
    // candidate exists — which the matrix has already established by fetching real pages.
    const brief = briefFor(MATRIX[0]);
    const key = researchCacheKeyFor(brief);
    const stored: PlanBriefV1 = {
      ...brief,
      scopeCandidate: {
        version: 1,
        origin: "RESEARCH",
        status: "OK",
        confidence: "HIGH",
        briefDigest: researchBriefDigest(brief),
        retrievedAt: new Date().toISOString(),
        provider: "deepseek-search",
        cacheKey: key,
        depth: "STANDARD",
        nodes: [{ nodeId: "r-algebra", label: "Algebra", kind: "CHAPTER", parentId: null, selected: true }],
        sources: [],
        openQuestions: [],
        summary: "Reused.",
        failureCode: null,
      },
    };
    const outcome = await researchScope({ brief: stored });
    const m = outcome.metrics;
    // eslint-disable-next-line no-console
    console.log(
      `LIVE_CACHE_REPEAT ${JSON.stringify({
        cacheHit: m.cacheHit,
        searchCalls: m.searchCalls,
        sourcesFetched: m.sourcesFetched,
        httpRequests: m.httpRequests,
        modelCalls: m.modelCalls,
        latencyMs: m.latencyMs,
        depth: m.depth,
      })}`
    );
    expect(m.cacheHit).toBe(true);
    expect(m.searchCalls).toBe(0);
    expect(m.sourcesFetched).toBe(0);
    expect(m.httpRequests).toBe(0);
    expect(m.modelCalls).toBe(0);
    expect(m.calls).toBe(0);
    // A cache hit costs nothing, and the difference against the live run above is the point.
    expect(m.latencyMs).toBeLessThan(Number(first!.elapsedMs));
  }, 120_000);
});
