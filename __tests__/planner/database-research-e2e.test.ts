// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Phase 3 §43 — the whole research arc, end to end, against real PostgreSQL.
 *
 * Every piece of this is covered somewhere already: the agent's bounds in `research-agent`, the
 * ledger in `research-evidence`, the follow-up in `research-followup`, confirmation in
 * `database-scope-confirmation`. What none of those can show is the arc *as a student walks it*,
 * through the real service, the real schema and the real write path — and the arc is where the
 * interesting failures live, because each step's precondition is the previous step's stored output.
 *
 * So this file drives the service the way the surface does, twice:
 *
 * - `STANDARD`: intake → research → coverage and sources stored → confirm → provenance still
 *   resolvable → candidate cleared → plan generated.
 * - `DEEP`: the same, with an objective the first round cannot answer, so the one permitted
 *   follow-up round runs and the coverage it is *for* is measurably better than the coverage
 *   before it. §29 allows a follow-up that changes nothing; it is not allowed to be untested.
 *
 * Plus the two regressions §43 names: a stale version is refused, and another account cannot see
 * any of it.
 */

const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("planner"))
      throw new Error("Disposable localhost planner database required");
  }
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }),
    }),
  };
});

/**
 * A search provider, a fetcher and a model that together produce a *verifiable* result.
 *
 * The excerpt the model returns is the fetched page's own text, which is the only thing that makes
 * a claim survive server-side verification — so a double that wants `OK` status and a covered
 * objective has to reproduce real page text rather than assert a fact.
 */
const PAGE =
  "The official specification states that Paper 1 covers quadratics, sequences and series, and calculus, and that Paper 2 covers statistics.";

const stub = vi.hoisted(() => ({
  searchCalls: 0,
  fetchCalls: 0,
  followUpCalls: 0,
  /** The plan the model states. Set per test. */
  depth: "STANDARD" as "LOOKUP" | "STANDARD" | "DEEP",
  /** Objectives the first extraction resolves. Everything else stays unanswered. */
  resolvedFirstRound: ["o1"] as string[],
  /** Objectives the follow-up extraction resolves on top of those. */
  resolvedAfterFollowUp: [] as string[],
  /** Whether the follow-up planner is given anything to aim at. */
  followUpQueries: true,
  extractPass: 0,
  results: [] as { url: string; title: string; snippet: string | null; rank: number; provider: "brave" }[],
  /** What the provider returns once the first round's URLs are exhausted. */
  followUpResults: [] as { url: string; title: string; snippet: string | null; rank: number; provider: "brave" }[],
}));

vi.mock("@/lib/planner/research/search/provider", () => ({
  selectSearchProvider: () => ({
    id: "brave" as const,
    async search({ query }: { query: string }) {
      stub.searchCalls += 1;
      // The follow-up round must be given a page round one did not already return, or it is
      // deduplicated against the pool and the round has nothing to read. Which page a query gets
      // is therefore tied to the *query*, not to the call count: round one asks two questions, so
      // a call-count rule would hand the follow-up's page out during round one.
      return query.includes("format") ? stub.followUpResults : stub.results;
    },
  }),
}));

vi.mock("@/lib/planner/research/search/fetch", () => ({
  fetchSource: async (url: string) => {
    stub.fetchCalls += 1;
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

vi.mock("@/lib/planner/research/deepseek", () => {
  const objectives = [
    { id: "o1", question: "Which subjects are tested?", priority: "PRIMARY" as const },
    { id: "o2", question: "What is the exam format?", priority: "PRIMARY" as const },
  ];
  return {
    deepseekModel: () => ({
      async planResearch() {
        return {
          plan: {
            depth: stub.depth,
            objectives,
            queries: objectives.map((objective) => ({
              query: `query for ${objective.id}`,
              purpose: "OFFICIAL_SYLLABUS" as const,
              objectiveId: objective.id,
            })),
          },
          usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
        };
      },
      async planFollowUp() {
        stub.followUpCalls += 1;
        return {
          plan: stub.followUpQueries
            ? {
                queries: [
                  {
                    query: "query for o2 format",
                    purpose: "OFFICIAL_SYLLABUS" as const,
                    objectiveIds: ["o2"],
                  },
                ],
              }
            : { queries: [] },
          usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
        };
      },
      async extract(input: { sources: { sourceId: string; text: string }[] }) {
        stub.extractPass += 1;
        const primary = input.sources[0];
        // The first call is the first round's extraction; every later call is the follow-up's.
        const resolved = stub.extractPass === 1 ? stub.resolvedFirstRound : stub.resolvedAfterFollowUp;
        return {
          extraction: {
            targetIdentity: { name: "CAIE A-Level Mathematics", institution: "CAIE", board: "CAIE", level: "A-Level" },
            /**
             * Leaves, deliberately. `flattenScope` turns *leaves* into engine units, so a scope of
             * two childless CHAPTERS — which are containers — confirms to zero units and the brief
             * can never generate. That is a real property of the flattening contract, and a fixture
             * that ignored it would fail for a reason that has nothing to do with research.
             */
            scope: [
              { label: "Sequences and series", kind: "TOPIC" as const, parentIndex: null },
              { label: "Calculus", kind: "TOPIC" as const, parentIndex: null },
            ],
            sourceMappings: primary ? [{ nodeIndexes: [0, 1], sourceIds: [primary.sourceId] }] : [],
            unresolved: [],
            extractionConfidence: "HIGH" as const,
            conflicts: [],
          },
          claims: resolved.map((objectiveId, index) => ({
            objectiveId,
            sourceId: input.sources[index % input.sources.length].sourceId,
            statement: `The specification covers ${objectiveId}.`,
            excerpt: PAGE,
            evidenceKind: "DIRECT" as const,
            support: "SUPPORTS" as const,
            documentDate: null,
          })),
          usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
        };
      },
    }),
  };
});

import { prisma } from "@/lib/prisma";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import {
  applyIntakeAction,
  createIntake,
  patchIntake,
  readIntake,
} from "@/lib/planner/server/intake";
import { researchCacheKeyFor } from "@/lib/planner/research/service";

const GOAL = "CAIE A-Level Mathematics 9709";

function briefFor(endDate: string): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: GOAL },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Mathematics" },
    target: { endDate, examDate: endDate },
    budget: { ...base.budget, weeklyMinutes: 600 },
    /**
     * The board and level matter to more than the plan: they are what the authority registry
     * reads to decide whether `cambridgeinternational.org` is CAIE's *own* host. Without them the
     * same page is a secondary source, no claim can cover an objective, and the run is honestly
     * `WEAK` — which is the behaviour under test elsewhere, not what this arc is about.
     */
    backgroundCurriculum: {
      label: "CAIE A-Level",
      level: "A-Level",
      board: "CAIE",
      subjects: ["Mathematics"],
    },
  };
}

describe.skipIf(!database)("Phase 3 §43 — the research arc against PostgreSQL", () => {
  let userId: number;
  let otherUserId: number;
  let endDate: string;

  beforeEach(async () => {
    stub.searchCalls = 0;
    stub.fetchCalls = 0;
    stub.followUpCalls = 0;
    stub.depth = "STANDARD";
    stub.resolvedFirstRound = ["o1"];
    stub.resolvedAfterFollowUp = [];
    stub.followUpQueries = true;
    stub.extractPass = 0;
    stub.results = [
      {
        url: "https://www.cambridgeinternational.org/programmes/spec-9709.pdf",
        title: "Cambridge 9709 specification",
        snippet: null,
        rank: 1,
        provider: "brave",
      },
    ];
    stub.followUpResults = [
      {
        url: "https://www.cambridgeinternational.org/programmes/spec-9709-paper-2.pdf",
        title: "Cambridge 9709 paper 2 format",
        snippet: null,
        rank: 1,
        provider: "brave",
      },
    ];
    userId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    otherUserId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    endDate = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seed = async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    return patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: briefFor(endDate),
    });
  };

  /** The research action, as the surface sends it. */
  const research = (view: { id: string; version: number }) =>
    applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      action: "researchScope",
      actionKey: randomUUID(),
    });

  const confirm = (view: { id: string; version: number }, nodeIds: string[]) =>
    applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      action: "confirmScope",
      actionKey: randomUUID(),
      nodeIds,
    });

  const generate = (view: { id: string; version: number }) =>
    applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      action: "requestGeneration",
      actionKey: randomUUID(),
    });

  it("walks intake → research → coverage → confirm → provenance → generate", async () => {
    const seeded = await seed();
    expect(seeded.brief.goal.title).toBe(GOAL);
    expect(seeded.brief.scopeCandidate).toBeNull();

    // ── research ──────────────────────────────────────────────────────────────────────────────
    const researched = await research(seeded);
    const candidate = researched.brief.scopeCandidate;
    expect(candidate).not.toBeNull();
    expect(stub.searchCalls).toBeGreaterThan(0);
    expect(stub.fetchCalls).toBeGreaterThan(0);

    // ── coverage shown ────────────────────────────────────────────────────────────────────────
    expect(candidate!.coverage).toBeDefined();
    const coverage = candidate!.coverage!;
    expect(coverage.summary.totalObjectives).toBe(2);
    // One objective was answered by a verified excerpt and one was not, which is the distinction
    // the coverage panel exists to show. It is computed from the ledger, not from the model.
    expect(coverage.summary.covered).toBe(1);
    expect(coverage.summary.unanswered + coverage.summary.partial).toBe(1);
    expect(coverage.objectives.map((entry) => entry.objectiveId).sort()).toEqual(["o1", "o2"]);
    // The cache key is the stored question, so a repeat is recognisable as the same question.
    expect(candidate!.cacheKey).toBe(researchCacheKeyFor(researched.brief));

    // ── evidence and source summary ───────────────────────────────────────────────────────────
    expect(candidate!.evidence?.claims.length).toBe(1);
    // The excerpt is the *page's* text, verbatim — that is what makes it evidence.
    expect(candidate!.evidence!.claims[0].excerpt).toContain("Paper 1 covers quadratics");
    expect(candidate!.sources.length).toBeGreaterThan(0);
    expect(candidate!.sources[0].url).toContain("cambridgeinternational.org");
    expect(candidate!.sources[0].sourceType).toMatch(/^OFFICIAL/);
    // …and the status was earned by that verified official claim, not asserted by the model.
    expect(candidate!.status).toBe("OK");
    expect(candidate!.depth).toBe("STANDARD");

    // ── confirm scope ─────────────────────────────────────────────────────────────────────────
    const nodeIds = candidate!.nodes.map((node) => node.nodeId);
    expect(nodeIds.length).toBeGreaterThan(0);
    const confirmed = await confirm(researched, nodeIds);

    // ── provenance retained ───────────────────────────────────────────────────────────────────
    expect(confirmed.brief.scope.source).toBe("RESEARCH_CONFIRMED");
    expect(confirmed.brief.scope.nodes.map((node) => node.label)).toEqual(["Sequences and series", "Calculus"]);
    // The candidate is cleared, so every ref the confirmed scope holds must resolve against the
    // frozen snapshot written in the same transaction — with no dependence on the run.
    expect(confirmed.brief.scope.provenanceSources.length).toBeGreaterThan(0);
    const refIds = new Set(confirmed.brief.scope.nodes.flatMap((node) => node.sourceIds ?? []));
    expect(refIds.size).toBeGreaterThan(0);
    for (const ref of refIds)
      expect(confirmed.brief.scope.provenanceSources.some((source) => source.sourceId === ref)).toBe(true);
    // …and the snapshot is content-free: provenance, not an archive.
    for (const source of confirmed.brief.scope.provenanceSources) {
      expect(source.url).toContain("cambridgeinternational.org");
      expect(JSON.stringify(source)).not.toContain("Paper 1 covers");
    }

    // ── research working candidate cleared ────────────────────────────────────────────────────
    expect(confirmed.brief.scopeCandidate).toBeNull();

    // ── generate plan ─────────────────────────────────────────────────────────────────────────
    const generated = await generate(confirmed);
    // The engine input is built from the confirmed scope, so the units the student accepted are
    // the units the plan is generated from — and the candidate that proposed them is gone.
    expect(generated.generation).toBeDefined();
    expect(generated.generation!.input.scope.split("\n")).toEqual(["Sequences and series", "Calculus"]);

    // Reloading from the database gives the same brief: nothing above was an in-memory illusion.
    const reloaded = await readIntake(userId, seeded.id);
    expect(reloaded.brief.scope.source).toBe("RESEARCH_CONFIRMED");
    expect(reloaded.brief.scopeCandidate).toBeNull();
    expect(reloaded.brief.scope.provenanceSources.length).toBe(confirmed.brief.scope.provenanceSources.length);
  });

  it("runs one DEEP follow-up round, and the round measurably improves coverage", async () => {
    // The comparison a follow-up has to justify: the *same* plan and the *same* pages, run once
    // with the round disabled and once with it enabled. §29 allows a follow-up that gains nothing
    // and asks for that to be reported honestly — which is only checkable against this baseline.
    const withoutRound = await seed();
    stub.depth = "DEEP";
    stub.resolvedFirstRound = ["o1"];
    stub.followUpQueries = false;
    const baselineView = await research(withoutRound);
    const baseline = baselineView.brief.scopeCandidate!;

    expect(baseline.depth).toBe("DEEP");
    expect(baseline.coverage?.summary.covered).toBe(1);
    expect(baseline.coverage?.summary.unanswered).toBe(1);

    // The same run, with the round allowed to ask for what is open.
    const withRound = await seed();
    stub.followUpQueries = true;
    stub.resolvedAfterFollowUp = ["o2"];
    stub.extractPass = 0;
    stub.followUpCalls = 0;
    const improvedView = await research(withRound);
    const improved = improvedView.brief.scopeCandidate!;

    // Exactly one round — an `if`, never a `while` — aimed at the objective that was open.
    expect(stub.followUpCalls).toBe(1);
    expect(improved.coverage?.followUpUsed).toBe(true);

    // The gain, measured: the objective the first round could not answer is now covered.
    expect(baseline.coverage!.summary.covered).toBe(1);
    expect(improved.coverage!.summary.covered).toBe(2);
    expect(improved.coverage!.summary.unanswered).toBe(0);
    const o2 = improved.coverage!.objectives.find((entry) => entry.objectiveId === "o2")!;
    expect(o2.state).toBe("COVERED");
    expect(o2.conflict).toBe("NONE");
    // …and it is covered by *verified* evidence, not by the follow-up's mere execution.
    expect(improved.evidence!.claims.some((claim) => claim.objectiveId === "o2")).toBe(true);

    const nodeIds = improved.nodes.map((node) => node.nodeId);
    const confirmed = await confirm(improvedView, nodeIds);
    expect(confirmed.brief.scopeCandidate).toBeNull();
    expect(confirmed.brief.scope.nodes.length).toBe(nodeIds.length);

    const generated = await generate(confirmed);
    expect(generated.generation).toBeDefined();
    expect(generated.generation!.input.scope.split("\n").length).toBe(nodeIds.length);
  });

  it("performs no follow-up at STANDARD, and does not spend one on a DEEP run with nothing open", async () => {
    const seeded = await seed();
    // STANDARD: the first round answers what little it was asked.
    stub.resolvedFirstRound = ["o1", "o2"];
    const standard = await research(seeded);
    expect(stub.followUpCalls).toBe(0);
    expect(standard.brief.scopeCandidate!.coverage?.followUpUsed).toBe(false);

    // DEEP with everything already answered: the round is permitted but pointless, so it is not
    // run. A *fresh* session on purpose — re-researching the same one would be a cache hit, which
    // is a different behaviour and is covered in `research-cache-quality`.
    const deepSeeded = await seed();
    stub.depth = "DEEP";
    stub.extractPass = 0;
    stub.followUpCalls = 0;
    const deep = await research(deepSeeded);
    expect(stub.followUpCalls).toBe(0);
    expect(deep.brief.scopeCandidate!.depth).toBe("DEEP");
  });

  it("clears the candidate when asked to, without touching the confirmed scope", async () => {
    const seeded = await seed();
    const researched = await research(seeded);
    expect(researched.brief.scopeCandidate).not.toBeNull();

    const cleared = await applyIntakeAction(userId, researched.id, {
      schemaVersion: 1,
      expectedVersion: researched.version,
      action: "discardScopeCandidate",
      actionKey: randomUUID(),
    });
    expect(cleared.brief.scopeCandidate).toBeNull();
    // The student's own scope is untouched: clearing a proposal is not a scope edit.
    expect(cleared.brief.scope.nodes).toEqual(researched.brief.scope.nodes);
    expect(cleared.brief.scope.confirmedAt).toBe(researched.brief.scope.confirmedAt);
  });

  it("refuses a stale writer rather than letting two devices interleave", async () => {
    const seeded = await seed();
    const researched = await research(seeded);

    // The second writer still holds the version from before the research landed.
    await expect(
      applyIntakeAction(userId, researched.id, {
        schemaVersion: 1,
        expectedVersion: seeded.version,
        action: "discardScopeCandidate",
      actionKey: randomUUID(),
      })
    ).rejects.toMatchObject({ status: 409 });

    // …and the stored brief is exactly what the first writer left.
    const reloaded = await readIntake(userId, seeded.id);
    expect(reloaded.brief.scopeCandidate).not.toBeNull();
  });

  it("keeps one account's research invisible to another, as a refusal and not an empty view", async () => {
    const seeded = await seed();
    await research(seeded);

    await expect(readIntake(otherUserId, seeded.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      applyIntakeAction(otherUserId, seeded.id, {
        schemaVersion: 1,
        expectedVersion: seeded.version,
        action: "discardScopeCandidate",
      actionKey: randomUUID(),
      })
    ).rejects.toMatchObject({ status: 404 });
  });

});
