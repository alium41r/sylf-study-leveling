// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyIntakeAction,
  createIntake,
  patchIntake,
  readIntake,
} from "@/lib/planner/server/intake";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { matrixPatch } from "@/lib/planner/preparedness-matrix";
import { PlannerError } from "@/lib/planner/errors";

/**
 * UX Phase 3 end to end, against real PostgreSQL.
 *
 * The whole arc is exercised once, in the order a student meets it: confirm a scope,
 * state a background curriculum, compare the two, correct what Sylf got wrong, answer a
 * few units in the matrix, and generate — with the checks that matter afterwards: the
 * correction persisted, overlap never became mastery, the units nobody answered are
 * still unstated, and another account cannot see any of it.
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
      adapter: new PrismaPg({
        connectionString: url ?? "postgresql://localhost/unused_planner_tests",
      }),
    }),
  };
});

/** A search provider and a model, so the comparison runs without a network. */
const stub = vi.hoisted(() => ({
  searchCalls: 0,
  modelCalls: 0,
  results: [] as { url: string; title: string; snippet: string | null; rank: number; provider: "brave" }[],
  extraction: null as unknown,
}));

vi.mock("@/lib/planner/research/search/provider", () => ({
  selectSearchProvider: () => ({
    id: "brave" as const,
    async search() {
      stub.searchCalls += 1;
      return stub.results;
    },
  }),
}));

vi.mock("@/lib/planner/research/deepseek", () => ({
  deepseekComparisonModel: () => ({
    async planQueries() {
      stub.modelCalls += 1;
      return {
        plan: { queries: [{ query: "CAIE A-Level Mathematics 9709 syllabus", purpose: "OFFICIAL_SYLLABUS" }] },
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
    async compare(input: { sources: { sourceId: string }[] }) {
      stub.modelCalls += 1;
      const build = stub.extraction as (ids: string[]) => unknown;
      return { comparison: build(input.sources.map((source) => source.sourceId)), usage: { inputTokens: 10, outputTokens: 5, calls: 1 } };
    },
  }),
  /**
   * The scope-research model, for the provenance tests below.
   *
   * It answers with three units and cites only the first two pages it was given, which is
   * the shape a real extraction takes: a page can be read without supporting any kept
   * unit, and the confirmation must be able to tell those apart.
   */
  deepseekModel: () => ({
    /**
     * The adaptive planning pass, which is what scope research now calls.
     *
     * A `vi.mock` factory is not type-checked against the interface it stands in for, so a
     * method missing here fails at runtime as "research returned nothing" rather than as a
     * compile error — which is exactly how this stub was left behind when Phase 1 renamed the
     * planning method. It states one objective and one query, which is the shape these
     * provenance tests are about; the planning behaviour itself is covered in
     * `research-plan.test.ts`.
     */
    async planResearch() {
      stub.modelCalls += 1;
      return {
        plan: {
          depth: "STANDARD" as const,
          objectives: [{ id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" as const }],
          queries: [
            {
              query: "NUST NET engineering syllabus",
              purpose: "OFFICIAL_SYLLABUS" as const,
              objectiveId: "o1",
            },
          ],
        },
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
    async planQueries() {
      stub.modelCalls += 1;
      return {
        plan: { queries: [{ query: "NUST NET engineering syllabus", purpose: "OFFICIAL_SYLLABUS" }] },
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
    async extract(input: { sources: { sourceId: string }[] }) {
      stub.modelCalls += 1;
      const cited = input.sources.map((source) => source.sourceId);
      return {
        extraction: {
          targetIdentity: { name: "NUST NET Engineering", institution: "NUST", board: null, level: null },
          scope: [
            { label: "Matrices", kind: "TOPIC", parentIndex: null },
            { label: "Sequences and series", kind: "TOPIC", parentIndex: null },
            { label: "Rotational dynamics", kind: "TOPIC", parentIndex: null },
          ],
          sourceMappings: [
            ...(cited[0] ? [{ nodeIndexes: [0], sourceIds: [cited[0]] }] : []),
            ...(cited[1] ? [{ nodeIndexes: [1], sourceIds: [cited[1]] }] : []),
          ],
          unresolved: [],
          extractionConfidence: "HIGH",
          conflicts: [],
        },
        usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
      };
    },
  }),
}));

vi.mock("@/lib/planner/research/search/fetch", () => ({
  fetchSource: async (url: string) => ({
    finalUrl: url,
    text: "Pure Mathematics 1: quadratics, matrices, sequences and series.",
    bytes: 64,
    contentType: "text/html",
    partial: false,
    partialReason: null,
  }),
}));

import { examFixture, examProposal } from "./exam-fixtures";
import { prisma } from "@/lib/prisma";
import { storeScopeCandidate } from "@/lib/planner/server/intake";
import { patchSession } from "@/lib/planner/server/intake-session";
import {
  appendEdit,
  createPlanShell,
  saveValidatedDraft,
} from "@/lib/planner/server/revisions";
import { validateDraft } from "@/lib/planner/contracts";

const NET_SCOPE = [
  { nodeId: "m1", label: "Mathematics", kind: "CHAPTER" as const, parentId: null, selected: true },
  { nodeId: "n1", label: "Matrices", kind: "TOPIC" as const, parentId: "m1", selected: true },
  { nodeId: "n2", label: "Sequences and series", kind: "TOPIC" as const, parentId: "m1", selected: true },
  { nodeId: "n3", label: "Rotational dynamics", kind: "TOPIC" as const, parentId: "m1", selected: true },
];

function briefFor(endDate: string): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: "NUST NET Engineering" },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Mathematics" },
    target: { endDate, examDate: endDate },
    budget: { ...base.budget, weeklyMinutes: 600 },
    scope: {
      source: "USER_MANUAL",
      confirmedAt: new Date().toISOString(),
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: NET_SCOPE,
    },
    backgroundCurriculum: {
      label: "CAIE A-Level",
      level: "A-Level",
      board: "CAIE",
      subjects: ["Mathematics", "Physics", "Computer Science"],
    },
  };
}

describe.skipIf(!database)("planner UX Phase 3 against PostgreSQL", () => {
  let userId: number;
  let endDate: string;

  beforeEach(async () => {
    stub.searchCalls = 0;
    stub.modelCalls = 0;
    stub.results = [
      {
        url: "https://www.cambridgeinternational.org/programmes/spec-9709.pdf",
        title: "Cambridge 9709",
        snippet: null,
        rank: 1,
        provider: "brave",
      },
    ];
    stub.extraction = (sourceIds: string[]) => ({
      backgroundUnits: [{ label: "Pure Mathematics 1" }],
      units: [
        {
          unitRef: "n1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "HIGH",
          sourceIds,
          explanationCode: "BACKGROUND_TOPIC_MATCH",
        },
        {
          unitRef: "n2",
          overlap: "PARTIAL_OVERLAP",
          confidence: "MEDIUM",
          sourceIds,
          explanationCode: "BACKGROUND_PARTIAL_MATCH",
        },
        {
          unitRef: "n3",
          overlap: "LIKELY_NEW_TO_CURRICULUM",
          confidence: "MEDIUM",
          sourceIds,
          explanationCode: "NOT_IN_BACKGROUND_CURRICULUM",
        },
      ],
      unresolved: [],
      comparisonConfidence: "MEDIUM",
    });
    userId = (
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
    const created = await createIntake(userId, {
      schemaVersion: 1,
      clientKey: randomUUID(),
      mode: "EXAM",
    });
    return patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: briefFor(endDate),
    });
  };

  it("compares the background curriculum with the confirmed scope, and stores only overlap", async () => {
    const view = await seed();
    expect(view.comparison.state).toBe("NOT_RUN");
    expect(view.comparison.available).toBe(true);

    const compared = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });

    expect(compared.comparison.state).toBe("READY");
    expect(compared.comparison.status).toBe("OK");
    expect(compared.comparison.counts).toEqual({ covered: 1, partial: 1, isNew: 1, unclear: 0, total: 3 });
    // Rows are in review order: the uncertain and new ones before the covered one.
    expect(compared.comparison.units.map((unit) => unit.unitRef)[0]).not.toBe("n1");
    expect(compared.comparison.sources).toHaveLength(1);
    expect(compared.comparison.sources[0].sourceType).toBe("OFFICIAL_PDF");
    // Only the likely-covered unit is offered as a coverage suggestion.
    expect(compared.comparison.suggestionRefs).toEqual(["n1"]);
    // Overlap is display-only: nothing has been written to preparedness.
    expect(compared.brief.preparedness).toEqual([]);
    // And the search + model ran once each, not once per unit.
    expect(stub.searchCalls).toBe(1);
    expect(stub.modelCalls).toBe(2);
  });

  it("reuses the stored comparison instead of paying for it twice", async () => {
    const view = await seed();
    const first = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const searchesAfterFirst = stub.searchCalls;
    const again = await applyIntakeAction(userId, first.id, {
      schemaVersion: 1,
      expectedVersion: first.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    expect(stub.searchCalls).toBe(searchesAfterFirst);
    expect(again.comparison.createdAt).toBe(first.comparison.createdAt);
  });

  it("lets the student correct a unit, keeps Sylf's own record, and outranks it afterwards", async () => {
    const view = await seed();
    const compared = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const corrected = await applyIntakeAction(userId, compared.id, {
      schemaVersion: 1,
      expectedVersion: compared.version,
      actionKey: randomUUID(),
      action: "setOverlapCorrection",
      unitRef: "n1",
      overlap: "LIKELY_NEW_TO_CURRICULUM",
    });
    expect(corrected.comparison.correctedRefs).toEqual(["n1"]);
    const matrices = corrected.comparison.units.find((unit) => unit.unitRef === "n1")!;
    expect(matrices.overlap).toBe("LIKELY_NEW_TO_CURRICULUM");
    expect(matrices.explanationCode).toBe("STUDENT_CORRECTION");
    // The stored comparison still carries what Sylf read.
    expect(corrected.brief.comparison!.units.find((unit) => unit.unitRef === "n1")!.overlap).toBe(
      "LIKELY_COVERED_BY_CURRICULUM"
    );
    // A corrected unit is no longer offered as "studied".
    expect(corrected.comparison.suggestionRefs).toEqual([]);

    // Re-running the comparison preserves the correction: a person's answer is not
    // rewritten by a fresh result.
    const rerun = await applyIntakeAction(userId, corrected.id, {
      schemaVersion: 1,
      expectedVersion: corrected.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
      force: true,
    });
    expect(rerun.comparison.correctedRefs).toEqual(["n1"]);
    expect(rerun.comparison.units.find((unit) => unit.unitRef === "n1")!.overlap).toBe(
      "LIKELY_NEW_TO_CURRICULUM"
    );
  });

  it("treats a changed background as making the comparison stale rather than applying it", async () => {
    const view = await seed();
    const compared = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const changed = await applyIntakeAction(userId, compared.id, {
      schemaVersion: 1,
      expectedVersion: compared.version,
      actionKey: randomUUID(),
      action: "setBackgroundCurriculum",
      label: "FSc Pre-Engineering",
      level: "Intermediate",
      board: "FBISE",
      subjects: ["Mathematics"],
    });
    expect(changed.comparison.stale).toBe(true);
    expect(changed.comparison.state).toBe("STALE");
    // Withheld, not shown as if it still described this brief.
    expect(changed.comparison.units).toEqual([]);
    expect(changed.comparison.suggestionRefs).toEqual([]);
    expect(changed.comparison.summary).toMatch(/no longer applies/);
  });

  it("answers a whole chapter in one action and keeps the untouched units unstated", async () => {
    const view = await seed();
    const patch = matrixPatch("STUDIED_UNRATED");
    const bulk = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "bulkSetPreparedness",
      nodeIds: ["n1", "n2"],
      state: "STUDIED_UNRATED",
    });
    const entry = (id: string) => bulk.brief.preparedness.find((row) => row.nodeId === id);
    expect(entry("n1")).toMatchObject(patch);
    expect(entry("n2")).toMatchObject(patch);
    // The unit nobody answered is absent from the brief, which is what "unstated" means.
    expect(entry("n3")).toBeUndefined();
    expect(bulk.summary.preparednessStated).toBe(2);
    expect(bulk.readiness.canGenerate).toBe(true);

    // One unit, one click, still independent of the others.
    const weak = await applyIntakeAction(userId, bulk.id, {
      schemaVersion: 1,
      expectedVersion: bulk.version,
      actionKey: randomUUID(),
      action: "bulkSetPreparedness",
      nodeIds: ["n3"],
      state: "WEAK",
    });
    expect(weak.brief.preparedness.find((row) => row.nodeId === "n3")).toMatchObject(matrixPatch("WEAK"));
    /**
     * Priority is the matrix's other deliberate answer, written by the existing
     * `setPriority` action. It survives every preparedness action — a bulk state, a
     * reset, and a coverage suggestion — because "how much does this matter?" is not
     * something a coverage answer is entitled to overwrite (§27).
     */
    const prioritised = await applyIntakeAction(userId, weak.id, {
      schemaVersion: 1,
      expectedVersion: weak.version,
      actionKey: randomUUID(),
      action: "setPriority",
      nodeIds: ["n3"],
      priority: "HIGH",
      prioritySource: "USER_EXPLICIT",
    });
    expect(prioritised.brief.preparedness.find((row) => row.nodeId === "n3")).toMatchObject({
      priority: "HIGH",
      prioritySource: "USER_EXPLICIT",
      covered: true,
      confidence: 2,
    });

    const cleared = await applyIntakeAction(userId, prioritised.id, {
      schemaVersion: 1,
      expectedVersion: prioritised.version,
      actionKey: randomUUID(),
      action: "clearPreparedness",
      nodeIds: ["n3"],
    });
    // Coverage and confidence are gone; the priority the student set is still there.
    expect(cleared.brief.preparedness.find((row) => row.nodeId === "n3")).toMatchObject({
      covered: null,
      confidence: null,
      difficult: null,
      priority: "HIGH",
    });
    expect(cleared.brief.preparedness.find((row) => row.nodeId === "n1")).toBeDefined();
  });

  it("applies 'studied, confidence not rated' only where the comparison supports it", async () => {
    const view = await seed();
    const compared = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const accepted = await applyIntakeAction(userId, compared.id, {
      schemaVersion: 1,
      expectedVersion: compared.version,
      actionKey: randomUUID(),
      action: "applyCoverageSuggestion",
      nodeIds: ["n1"],
    });
    // Covered, with no confidence number invented.
    expect(accepted.brief.preparedness.find((row) => row.nodeId === "n1")).toMatchObject({
      covered: true,
      confidence: null,
    });

    // A unit the comparison did not place in the background curriculum cannot be rated
    // through this action at all.
    await expect(
      applyIntakeAction(userId, accepted.id, {
        schemaVersion: 1,
        expectedVersion: accepted.version,
        actionKey: randomUUID(),
        action: "applyCoverageSuggestion",
        nodeIds: ["n3"],
      })
    ).rejects.toMatchObject({ status: 422 });
    // ... and a unit that does not exist is refused too.
    await expect(
      applyIntakeAction(userId, accepted.id, {
        schemaVersion: 1,
        expectedVersion: accepted.version,
        actionKey: randomUUID(),
        action: "setOverlapCorrection",
        unitRef: "nope",
        overlap: "UNCLEAR",
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("generates from a brief whose preparedness is entirely unstated, and carries only stated facts", async () => {
    const view = await seed();
    expect(view.brief.preparedness).toEqual([]);
    const requested = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "requestGeneration",
    });
    const generated = requested.generation!.input;
    const topics = "exam" in generated && generated.exam ? generated.exam.topics : [];
    expect(topics).toHaveLength(3);
    for (const topic of topics) {
      // Silence stays silence: never `false`, never a fabricated confidence.
      expect(topic.covered ?? null).toBeNull();
      expect(topic.confidence ?? null).toBeNull();
    }

    // With one unit answered, only that unit carries a fact.
    const answered = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "bulkSetPreparedness",
      nodeIds: ["n2"],
      state: "STUDIED_UNRATED",
    });
    const second = await applyIntakeAction(userId, answered.id, {
      schemaVersion: 1,
      expectedVersion: answered.version,
      actionKey: randomUUID(),
      action: "requestGeneration",
    });
    const generated2 = second.generation!.input;
    const topics2 = "exam" in generated2 && generated2.exam ? generated2.exam.topics : [];
    const enzymes = topics2.find((topic) => topic.label === "Sequences and series")!;
    expect(enzymes.covered).toBe(true);
    expect(enzymes.confidence ?? null).toBeNull();
    expect(topics2.find((topic) => topic.label === "Matrices")!.covered ?? null).toBeNull();
  });

  it("never lets overlap reach the engine", async () => {
    const view = await seed();
    const compared = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const requested = await applyIntakeAction(userId, compared.id, {
      schemaVersion: 1,
      expectedVersion: compared.version,
      actionKey: randomUUID(),
      action: "requestGeneration",
    });
    // The engine input carries no overlap vocabulary anywhere: not a state, not a
    // confidence, not a source id.
    const serialized = JSON.stringify(requested.generation!.input);
    expect(serialized).not.toMatch(/LIKELY_COVERED_BY_CURRICULUM|PARTIAL_OVERLAP|UNCLEAR/);
    expect(serialized).not.toMatch(/sourceIds|overlapCorrections|comparison/);
  });

  it("refuses a stale writer, and keeps one account's brief invisible to another", async () => {
    const view = await seed();
    await expect(
      applyIntakeAction(userId, view.id, {
        schemaVersion: 1,
        expectedVersion: view.version + 5,
        actionKey: randomUUID(),
        action: "bulkSetPreparedness",
        nodeIds: ["n1"],
        state: "OKAY",
      })
    ).rejects.toMatchObject({ status: 409 });

    const stranger = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    await expect(readIntake(stranger, view.id)).rejects.toBeInstanceOf(PlannerError);
  });

  /**
   * The other half of flexible editing: the endpoint exchange itself.
   *
   * `acknowledgements` is what switches an edit into assessing mode. Its absence leaves
   * every existing caller's behaviour untouched; its presence turns a refusal into a
   * conversation with the findings attached, and only a code the *current* draft
   * actually raises can seal the revision.
   */
  describe("flexible draft edits, end to end", () => {
    const planWithDraft = async () => {
      const plan = await createPlanShell(userId, {
        mode: "EXAM",
        title: "Flexible editing",
        creationKey: randomUUID(),
        subjectId: null,
        goalId: null,
      });
      const revision = await saveValidatedDraft(userId, plan.id, {
        input: examFixture(),
        proposal: examProposal(),
        expectedVersion: 0,
        operationKey: randomUUID(),
      });
      return { plan, revision };
    };

    it("refuses with the findings, then seals exactly what the student accepted", async () => {
      const { plan, revision } = await planWithDraft();
      const draft = revision.outputSnapshot as unknown as {
        items: { key: string; type: string }[];
      };
      const body = {
        schemaVersion: 1 as const,
        baseRevisionId: revision.id,
        expectedVersion: 1,
        operationKey: randomUUID(),
        edits: draft.items.map((item) => ({ key: item.key })),
      };
      // A legacy edit (no `acknowledgements`) is validated exactly as before: this one
      // changes nothing, so it seals.
      const plain = await appendEdit(userId, plan.id, body);
      expect(plain.id).toBeTruthy();

      // The same shape with `acknowledgements: []` asks for an assessment. Dropping the
      // final review is a recommendation, so the answer is findings, not a refusal.
      const dropped = await appendEdit(userId, plan.id, {
        ...body,
        baseRevisionId: plain.id,
        expectedVersion: 2,
        operationKey: randomUUID(),
        edits: draft.items.map((item) => ({
          key: item.key,
          ...(item.type === "FINAL_REVIEW" ? { removed: true } : {}),
        })),
        acknowledgements: [],
      }).catch((error: unknown) => error as PlannerError);
      expect(dropped).toBeInstanceOf(PlannerError);
      const refusal = dropped as PlannerError;
      expect(refusal.status).toBe(409);
      expect(refusal.code).toBe("DRAFT_WARNINGS_REQUIRE_ACCEPTANCE");
      const findings = refusal.details as {
        warnings: { code: string; acknowledgementCode: string; consequence: string }[];
        blockers: unknown[];
      };
      expect(findings.blockers).toEqual([]);
      expect(findings.warnings.map((warning) => warning.code)).toContain("MISSING_FINAL_REVIEW");
      expect(findings.warnings[0].consequence.length).toBeGreaterThan(20);

      // Nothing was written while the student was deciding.
      const stillDraft = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      expect(stillDraft.latestDraftRevisionId).toBe(plain.id);

      // Accepting seals a revision, and that revision is what the student asked for.
      const sealed = await appendEdit(userId, plan.id, {
        ...body,
        baseRevisionId: plain.id,
        expectedVersion: 2,
        operationKey: randomUUID(),
        edits: draft.items.map((item) => ({
          key: item.key,
          ...(item.type === "FINAL_REVIEW" ? { removed: true } : {}),
        })),
        acknowledgements: findings.warnings.map((warning) => warning.acknowledgementCode),
      });
      const accepted = sealed.outputSnapshot as unknown as {
        items: { type: string; removed?: boolean }[];
      };
      expect(accepted.items.filter((item) => item.type === "FINAL_REVIEW" && !item.removed)).toHaveLength(0);
      // The sealed draft would not validate without the acknowledgement, which is the
      // whole point: the acceptance is recorded in the revision, not in a preference.
      expect(() => validateDraft(examFixture(), accepted)).toThrowError(/MISSING_FINAL_REVIEW/);
      const after = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      expect(after.latestDraftRevisionId).toBe(sealed.id);
    });

    it("refuses an invented acknowledgement, a blocker, and a stale base", async () => {
      const { plan, revision } = await planWithDraft();
      const draft = revision.outputSnapshot as unknown as {
        items: { key: string; type: string }[];
      };
      const base = {
        schemaVersion: 1 as const,
        baseRevisionId: revision.id,
        expectedVersion: 1,
        operationKey: randomUUID(),
        edits: draft.items.map((item) => ({ key: item.key })),
      };
      // A code nobody raised is not a blank cheque.
      await expect(
        appendEdit(userId, plan.id, {
          ...base,
          edits: draft.items.map((item) => ({
            key: item.key,
            ...(item.type === "FINAL_REVIEW" ? { removed: true } : {}),
          })),
          acknowledgements: ["ACK:SOMETHING_ELSE"],
        })
      ).rejects.toMatchObject({ status: 422, code: "UNKNOWN_ACKNOWLEDGEMENT" });

      // A duration outside the engine's absolute bounds is refused at the request
      // boundary: it cannot even become a draft, so there is nothing to accept.
      await expect(
        appendEdit(userId, plan.id, {
          ...base,
          edits: [{ key: draft.items[0].key, minutes: 300 }],
          acknowledgements: ["ACK:INVALID_ITEM_CAPACITY"],
        })
      ).rejects.toThrow(/minutes|Too big/);

      /**
       * A structural blocker reaches the assessment and is reported as a blocker with no
       * accept button, while an attempt to acknowledge it is refused outright. Moving a
       * dependency after the work that depends on it is exactly that kind of edit.
       */
      const dependency = draft.items[0];
      const dependent = draft.items.find((item) => item.key !== dependency.key)!;
      const structurallyBroken = { ...base, edits: [{ key: dependency.key, date: "2030-01-20" }] };
      const blocked = await appendEdit(userId, plan.id, {
        ...structurallyBroken,
        acknowledgements: [],
      }).catch((error: unknown) => error as PlannerError);
      expect(blocked).toBeInstanceOf(PlannerError);
      const blockerRefusal = blocked as PlannerError;
      expect(blockerRefusal.status).toBe(409);
      const blockedFindings = blockerRefusal.details as {
        blockers: { code: string }[];
        warnings: unknown[];
      };
      expect(blockedFindings.blockers.map((blocker) => blocker.code)).toContain("DEPENDENCY_DATE");
      await expect(
        appendEdit(userId, plan.id, {
          ...structurallyBroken,
          acknowledgements: ["ACK:DEPENDENCY_DATE"],
        })
      ).rejects.toMatchObject({ status: 422, code: "BLOCKER_NOT_ACKNOWLEDGEABLE" });
      expect(dependent.key).not.toBe(dependency.key);

      /**
       * A stale acceptance: the base revision moved under it, so the acknowledgement is
       * for a draft that no longer exists. The plan version is *current* here, which
       * isolates the base check from the version check.
       */
      const moved = await appendEdit(userId, plan.id, { ...base, operationKey: randomUUID() });
      await expect(
        appendEdit(userId, plan.id, {
          ...base,
          expectedVersion: 2,
          edits: draft.items.map((item) => ({
            key: item.key,
            ...(item.type === "FINAL_REVIEW" ? { removed: true } : {}),
          })),
          acknowledgements: ["ACK:MISSING_FINAL_REVIEW"],
        })
      ).rejects.toMatchObject({ status: 409, code: "STALE_REVISION" });
      expect(moved.id).not.toBe(revision.id);
    });
  });

  /**
   * UX Phase 3.1, issue two: the confirmed scope keeps resolvable provenance.
   *
   * Confirming clears the candidate, so the source records behind the confirmation have
   * to travel with it. These tests exercise the real lifecycle against PostgreSQL: build
   * a candidate, confirm part of it, check what survived, then edit and reconfirm.
   */
  describe("confirmed scope provenance survives the candidate", () => {
    /** Three pages of different authority: official, institutional, then secondary. */
    const THREE_SOURCES = [
      "https://www.cambridgeinternational.org/programmes/spec-9709.pdf",
      "https://www.ox.ac.uk/study/mathematics",
      "https://prep-blog.example/net-guide",
    ];

    const researched = async () => {
      stub.results = THREE_SOURCES.map((url, index) => ({
        url,
        title: `Page ${index + 1}`,
        snippet: null,
        rank: index + 1,
        provider: "brave" as const,
      }));
      const view = await seed();
      const produced = await applyIntakeAction(userId, view.id, {
        schemaVersion: 1,
        expectedVersion: view.version,
        actionKey: randomUUID(),
        action: "researchScope",
      });
      const candidate = produced.brief.scopeCandidate!;
      expect(candidate.sources).toHaveLength(3);
      return { view: produced, candidate };
    };

    it("resolves every confirmed ref after the candidate is cleared, and keeps only what is referenced", async () => {
      const { candidate } = await researched();
      const [official, institutional, secondary] = candidate.sources;
      // Classifications are the registry's, not this test's: assert rather than assume.
      expect(official.sourceType).toBe("OFFICIAL_PDF");
      expect(institutional.sourceType).toBe("INSTITUTIONAL");
      expect(secondary.sourceType).toBe("SECONDARY");

      /**
       * Confirm the two units the extraction mapped to a page, leaving the third out: the
       * extraction cited a page for `Matrices` and `Sequences and series`, and cited
       * nothing for `Rotational dynamics`.
       */
      const session = await prisma.plannerIntakeSession.findFirstOrThrow({ where: { userId } });
      const current = await applyIntakeAction(userId, session.id, {
        schemaVersion: 1,
        expectedVersion: session.version,
        actionKey: randomUUID(),
        action: "confirmScope",
        nodeIds: candidate.nodes.filter((node) => node.nodeId !== "r-rotational-dynamics").map((node) => node.nodeId),
      });

      expect(current.brief.scopeCandidate).toBeNull();
      expect(current.brief.scope.source).toBe("RESEARCH_CONFIRMED");
      expect(current.brief.scope.confirmedAt).not.toBeNull();
      // Every ref resolves to a preserved record — the invariant this patch exists for.
      const snapshot = current.brief.scope.provenanceSources;
      expect(current.brief.scope.provenanceRefs.length).toBeGreaterThan(0);
      for (const ref of current.brief.scope.provenanceRefs)
        expect(snapshot.some((source) => source.sourceId === ref)).toBe(true);
      // The page nothing in the confirmed scope points at is not kept.
      expect(snapshot.map((source) => source.sourceId)).not.toContain(secondary.sourceId);
      // And what is kept is copied exactly from the candidate's own records.
      const kept = snapshot.find((source) => source.sourceId === official.sourceId)!;
      expect(kept).toEqual({
        sourceId: official.sourceId,
        url: official.url,
        title: official.title,
        publisherOrDomain: official.publisherOrDomain,
        sourceType: official.sourceType,
        retrievedAt: official.retrievedAt,
        documentDate: official.documentDate,
      });
      // No web content and no model text travelled with it.
      expect(JSON.stringify(snapshot)).not.toMatch(/<html|snippet|rationale|prompt/i);
    });

    it("keeps a user upload as the student's own material, with no public claim", async () => {
      const created = await createIntake(userId, {
        schemaVersion: 1,
        clientKey: randomUUID(),
        mode: "EXAM",
      });
      const seeded = await patchIntake(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: created.version,
        brief: briefFor(endDate),
      });
      const uploaded = await storeScopeCandidate(userId, seeded.id, {
        schemaVersion: 1,
        expectedVersion: seeded.version,
        actionKey: randomUUID(),
        extraction: {
          text: "Matrices\nSequences and series",
          pages: [{ from: 1, to: 1 }],
          partial: false,
          partialReason: null,
          method: "TEXT",
        },
        sourceTitle: "my-syllabus.pdf",
      });
      expect(uploaded.brief.scopeCandidate!.sources[0].sourceType).toBe("USER_UPLOAD");

      const confirmed = await applyIntakeAction(userId, uploaded.id, {
        schemaVersion: 1,
        expectedVersion: uploaded.version,
        actionKey: randomUUID(),
        action: "confirmScope",
      });
      expect(confirmed.brief.scopeCandidate).toBeNull();
      expect(confirmed.brief.scope.source).toBe("IMPORT_CONFIRMED");
      const snapshot = confirmed.brief.scope.provenanceSources;
      expect(snapshot).toHaveLength(confirmed.brief.scope.provenanceRefs.length);
      expect(snapshot[0].sourceType).toBe("USER_UPLOAD");
      // The student's file is never presented as a public page, and never as an author.
      expect(snapshot[0].publisherOrDomain).toBeNull();
      expect(snapshot[0].url).toBe("https://upload.sylf.local/syllabus");
      // The confirmed scope is still perfectly usable.
      const requested = await applyIntakeAction(userId, confirmed.id, {
        schemaVersion: 1,
        expectedVersion: confirmed.version,
        actionKey: randomUUID(),
        action: "requestGeneration",
      });
      expect(requested.generation?.input).toBeTruthy();
    });

    it("withdraws provenance with the confirmation, and replaces it on reconfirmation", async () => {
      /**
       * The full §16 lifecycle. A confirmation's provenance is evidence for *that*
       * confirmation: editing the scope withdraws it, and confirming a later research
       * result replaces it wholesale rather than merging the two.
       */
      const { candidate } = await researched();
      const session = await prisma.plannerIntakeSession.findFirstOrThrow({ where: { userId } });
      const first = await applyIntakeAction(userId, session.id, {
        schemaVersion: 1,
        expectedVersion: session.version,
        actionKey: randomUUID(),
        action: "confirmScope",
      });
      const firstRefs = [...first.brief.scope.provenanceRefs];
      expect(firstRefs.length).toBeGreaterThan(0);
      // The first confirmation's evidence is the official Cambridge page.
      expect(firstRefs).toContain(candidate.sources[0].sourceId);

      // Editing the confirmed scope withdraws the confirmation — and its provenance with
      // it, so historical evidence is never presented as supporting an edited scope.
      const edited = await applyIntakeAction(userId, first.id, {
        schemaVersion: 1,
        expectedVersion: first.version,
        actionKey: randomUUID(),
        action: "updateScopeUnits",
        rename: [{ nodeId: first.brief.scope.nodes[0].nodeId, label: "Matrices and transformations" }],
      });
      expect(edited.brief.scope.confirmedAt).toBeNull();
      expect(edited.brief.scope.provenanceRefs).toEqual([]);
      expect(edited.brief.scope.provenanceSources).toEqual([]);

      /**
       * Research again and confirm the new result. The candidate the first confirmation
       * consumed is gone (that is the quarantine working), so the only way back to a
       * researched scope is a fresh look — which is exactly the flow §16 describes.
       */
      stub.results = [
        {
          url: "https://www.cie.org.uk/programmes-and-qualifications/spec.pdf",
          title: "Cambridge International specification",
          snippet: null,
          rank: 1,
          provider: "brave" as const,
        },
      ];
      const researched2 = await applyIntakeAction(userId, edited.id, {
        schemaVersion: 1,
        expectedVersion: edited.version,
        actionKey: randomUUID(),
        action: "researchScope",
      });
      const candidateB = researched2.brief.scopeCandidate!;
      expect(candidateB.sources[0].sourceId).not.toBe(firstRefs[0]);

      const second = await applyIntakeAction(userId, researched2.id, {
        schemaVersion: 1,
        expectedVersion: researched2.version,
        actionKey: randomUUID(),
        action: "confirmScope",
      });
      // Only the second confirmation's evidence is retained: no merging by id or title.
      expect(second.brief.scope.provenanceRefs).toEqual([candidateB.sources[0].sourceId]);
      expect(second.brief.scope.provenanceSources.map((source) => source.sourceId)).toEqual([
        candidateB.sources[0].sourceId,
      ]);
      for (const sourceId of firstRefs)
        expect(second.brief.scope.provenanceSources.map((source) => source.sourceId)).not.toContain(sourceId);
      expect(second.brief.scope.provenanceSources[0].url).toBe(candidateB.sources[0].url);
    });

    it("reads a brief stored before this field existed, without inventing sources", async () => {
      const created = await createIntake(userId, {
        schemaVersion: 1,
        clientKey: randomUUID(),
        mode: "EXAM",
      });
      const seeded = await patchIntake(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: created.version,
        brief: briefFor(endDate),
      });
      // Write a legacy brief the way Phase 2 would have: refs, no snapshot. The session
      // layer stores the brief as opaque bounded JSON, so this is the real old shape.
      const legacy = JSON.parse(JSON.stringify(seeded.brief)) as Record<string, unknown>;
      const scope = legacy.scope as Record<string, unknown>;
      delete scope.provenanceSources;
      scope.source = "RESEARCH_CONFIRMED";
      scope.confirmedAt = "2030-01-01T00:00:00.000Z";
      scope.provenanceRefs = ["src-legacy-a", "src-legacy-b"];
      await patchSession(userId, seeded.id, {
        schemaVersion: 1,
        expectedVersion: seeded.version,
        brief: legacy,
      });

      const read = await readIntake(userId, seeded.id);
      // It parses, the refs are still there, and nothing was invented for them.
      expect(read.brief.scope.provenanceRefs).toEqual(["src-legacy-a", "src-legacy-b"]);
      expect(read.brief.scope.provenanceSources).toEqual([]);
      expect(read.readiness.canGenerate).toBe(true);
    });
  });

  it("replays a repeated action key instead of applying the bulk edit twice", async () => {
    const view = await seed();
    const actionKey = randomUUID();
    const first = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey,
      action: "bulkSetPreparedness",
      nodeIds: ["n1", "n2"],
      state: "OKAY",
    });
    const replay = await applyIntakeAction(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      actionKey,
      action: "bulkSetPreparedness",
      nodeIds: ["n1", "n2"],
      state: "OKAY",
    });
    // A retry after a lost response returns the same state rather than a second write.
    expect(replay.version).toBe(first.version);
    expect(replay.brief.preparedness).toHaveLength(2);
  });
});
