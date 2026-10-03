// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import {
  applyIntakeAction,
  createIntake,
  patchIntake,
  readIntake,
} from "@/lib/planner/server/intake";
import { emptyBrief } from "@/lib/planner/intake/brief";

/**
 * The intake service end to end, against real PostgreSQL.
 *
 * This is the layer that turns a student's brief into engine input, so the tests
 * assert the two things that matter: the brief's readiness and distribution are
 * computed by the server (never by the client or the model), and the engine is
 * reached only through the existing generation contract, with unstated preparedness
 * arriving as `null` rather than a fabricated rating.
 */
const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.includes("planner")
    )
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
import { prisma } from "@/lib/prisma";

/** The same compact path the Quick Plan surface takes, for any mode. */
function readyBriefFor(mode: "ROADMAP" | "MASTERY", endDate: string) {
  const base = emptyBrief(mode);
  return {
    ...base,
    goal: {
      title:
        mode === "ROADMAP"
          ? "A-level Chemistry, full syllabus"
          : "Photosynthesis and limiting factors",
    },
    subject: { kind: "FREE_TEXT" as const, subjectId: null, name: "Chemistry" },
    target: { endDate, examDate: null },
    budget: {
      ...base.budget,
      weeklyMinutes: 480,
    },
    scope: {
      ...base.scope,
      nodes: [
        { nodeId: "n1", label: "Core concepts", kind: "TOPIC" as const, parentId: null, selected: true },
        { nodeId: "n2", label: "Applied problems", kind: "TOPIC" as const, parentId: null, selected: true },
      ],
    },
    // Preparedness deliberately absent: the compact path never requires it.
  };
}

/** A minimal EXAM brief that is ready to draft, with one unit left unstated. */
function readyBrief(endDate: string) {
  const brief = emptyBrief("EXAM");
  return {
    ...brief,
    goal: { title: "Biology mock" },
    subject: { kind: "FREE_TEXT" as const, subjectId: null, name: "Biology" },
    target: { endDate, examDate: endDate },
    budget: {
      ...brief.budget,
      weeklyMinutes: 600,
      recoveryPercent: null,
      acceptReducedReserve: false,
      blockedDates: [],
      dailyOverrides: null,
      distribution: null,
    },
    scope: {
      ...brief.scope,
      source: "USER_MANUAL" as const,
      confirmedAt: null,
      nodes: [
        { nodeId: "n1", label: "Cells", kind: "TOPIC" as const, parentId: null, selected: true },
        { nodeId: "n2", label: "Enzymes", kind: "TOPIC" as const, parentId: null, selected: true },
      ],
    },
    preparedness: [
      { nodeId: "n1", covered: true, confidence: 4, difficult: false },
      // n2 deliberately absent: the student said nothing about it.
    ],
  };
}

describe.skipIf(!database)("planner intake service", () => {
  let userId: number;
  let endDate: string;

  beforeEach(async () => {
    userId = (
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@planner.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [0],
        },
      })
    ).id;
    endDate = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a session and reports what is missing, not a fabricated readiness", async () => {
    const view = await createIntake(userId, {
      schemaVersion: 1,
      clientKey: randomUUID(),
      mode: "EXAM",
    });
    expect(view.readiness.canGenerate).toBe(false);
    expect(view.readiness.state).toBe("NEEDS_CORE_INFO");
    expect(view.readiness.missing).toContain("GOAL_MISSING");
    expect(view.brief.goal.title).toBe("");
    expect(view.summary.units).toBe(0);
  });

  it("computes the weekly distribution server-side and reaches readiness", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const patched = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: readyBrief(endDate),
    });
    expect(patched.readiness.canGenerate).toBe(true);
    expect(["READY_FOR_DRAFT", "ADVANCED_REFINEMENT_AVAILABLE"]).toContain(patched.readiness.state);
    const distribution = patched.brief.budget.distribution;
    expect(distribution).not.toBeNull();
    // Sunday is a rest day for this account, so it receives nothing.
    expect(distribution!.dailyMinutes[0]).toBe(0);
    // The budget is placed across the usable days and explained in one sentence.
    expect(distribution!.dailyMinutes.reduce((total, value) => total + value, 0)).toBeGreaterThan(0);
    expect(distribution!.note.length).toBeGreaterThan(10);
    // Unstated preparedness produces no assumption of weakness.
    expect(patched.summary.preparednessStated).toBe(1);
  });

  it("refuses a stale writer with INTAKE_STALE and leaves the brief untouched", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const first = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: readyBrief(endDate),
    });
    await expect(
      patchIntake(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: created.version,
        brief: { ...readyBrief(endDate), goal: { title: "Different" } },
      })
    ).rejects.toMatchObject({ code: "INTAKE_STALE" });
    const after = await readIntake(userId, created.id);
    expect(after.version).toBe(first.version);
    expect(after.brief.goal.title).toBe("Biology mock");
  });

  it("applies a typed action once, then replays it without changing anything", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const ready = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: readyBrief(endDate),
    });
    const actionKey = randomUUID();
    const applied = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: ready.version,
      actionKey,
      action: "setWeeklyBudget",
      weeklyMinutes: 300,
    });
    expect(applied.brief.budget.weeklyMinutes).toBe(300);
    expect(applied.version).toBe(ready.version + 1);

    // Same key again: the receipt ring means nothing is applied a second time.
    const replay = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: applied.version,
      actionKey,
      action: "setWeeklyBudget",
      weeklyMinutes: 900,
    });
    expect(replay.brief.budget.weeklyMinutes).toBe(300);
  });

  it("marks an unavailable day as a weekday constraint or a blocked date", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const withWeekday = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      actionKey: randomUUID(),
      action: "markUnavailableDay",
      weekday: 3,
      unavailable: true,
    });
    expect(withWeekday.brief.constraints).toContainEqual(
      expect.objectContaining({ kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 3 })
    );
    const withDate = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: withWeekday.version,
      actionKey: randomUUID(),
      action: "markUnavailableDay",
      date: endDate,
      unavailable: true,
    });
    expect(withDate.brief.budget.blockedDates).toContain(endDate);
  });

  it("edits the scope tree, and editing it invalidates a previous confirmation", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const added = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      actionKey: randomUUID(),
      action: "updateScopeUnits",
      add: [
        { nodeId: "a1", label: "Cells", kind: "TOPIC", parentId: null, selected: true },
        { nodeId: "a2", label: "Enzymes", kind: "TOPIC", parentId: null, selected: true },
      ],
    });
    const confirmed = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: added.version,
      actionKey: randomUUID(),
      action: "confirmScope",
    });
    expect(confirmed.brief.scope.confirmedAt).not.toBeNull();
    const renamed = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: confirmed.version,
      actionKey: randomUUID(),
      action: "updateScopeUnits",
      rename: [{ nodeId: "a1", label: "Cell biology" }],
    });
    expect(renamed.brief.scope.confirmedAt).toBeNull();
    expect(renamed.brief.scope.nodes.find((node) => node.nodeId === "a1")!.label).toBe("Cell biology");
  });

  it("hands generation the real engine contract, with unstated preparedness as null", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const ready = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: readyBrief(endDate),
    });
    const result = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: ready.version,
      actionKey: randomUUID(),
      action: "requestGeneration",
    });
    expect(result.generation).toBeDefined();
    const input = UserInputV1Schema.parse(result.generation!.input);
    if (input.mode !== "EXAM") throw new Error("expected an exam input");
    expect(input.scope).toBe("Cells\nEnzymes");
    // The unit the student never rated carries nulls, never false/1.
    const unstated = input.exam!.topics.find((topic) => topic.label === "Enzymes")!;
    expect(unstated.covered).toBeNull();
    expect(unstated.confidence).toBeNull();
    expect(unstated.difficult).toBeNull();
    // The unit they did rate keeps exactly what they said.
    const stated = input.exam!.topics.find((topic) => topic.label === "Cells")!;
    expect(stated.covered).toBe(true);
    expect(stated.confidence).toBe(4);
  });

  it("carries the same compact path for ROADMAP and MASTERY into the engine contract", async () => {
    for (const mode of ["ROADMAP", "MASTERY"] as const) {
      const userId = (
        await prisma.user.create({
          data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
        })
      ).id;
      const created = await createIntake(userId, {
        schemaVersion: 1,
        clientKey: randomUUID(),
        mode,
      });
      const ready = await patchIntake(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: created.version,
        brief: readyBriefFor(mode, endDate),
      });
      // Goal + scope + date + weekly hours is the whole required set in every mode.
      expect(ready.readiness.canGenerate, `${mode}: ${ready.readiness.missing.join(",")}`).toBe(true);
      const result = await applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: ready.version,
        actionKey: randomUUID(),
        action: "requestGeneration",
      });
      const input = UserInputV1Schema.parse(result.generation!.input);
      expect(input.mode).toBe(mode);
      expect(input.scope).toBe("Core concepts\nApplied problems");
      // The mode-specific block the engine's own validators demand is present, and the
      // availability vector is the distributor's, not a guess.
      expect(input.availability.dailyMinutes).toHaveLength(7);
      expect(input.availability.dailyMinutes.reduce((total, value) => total + value, 0)).toBe(480);
      // Nothing was asked about preparedness, and nothing was invented for it.
      const topics =
        input.mode === "ROADMAP"
          ? input.roadmap?.topics
          : input.mode === "MASTERY"
            ? input.mastery?.topics
            : undefined;
      expect(topics).toHaveLength(2);
      expect(topics!.every((topic) => topic.covered === null && topic.confidence === null)).toBe(true);
      expect(result.generation!.requestKey).toBe(`intake-${created.id}`);
    }
  });

  it("refuses generation on an incomplete brief and names what is missing", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    await expect(
      applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: created.version,
        actionKey: randomUUID(),
        action: "requestGeneration",
      })
    ).rejects.toMatchObject({ code: "BRIEF_NOT_READY" });
  });

  it("implements every action it advertises, and refuses comparison honestly rather than with NOT_AVAILABLE", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    /**
     * Comparison became real in UX Phase 3, so nothing in `IMPLEMENTED_ACTIONS` answers
     * `NOT_AVAILABLE` any more. This suite runs without a search credential — the state
     * a deployment with no Brave/Serper key is in — and the honest answer in that state
     * is an unavailable comparison with a named reason, not a refusal to try and not a
     * model call with imagined web context.
     */
    // An empty brief has nothing to compare against yet, and says so.
    const nothing = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    expect(nothing.comparison.state).toBe("UNAVAILABLE");
    expect(nothing.brief.comparison?.failureCode).toBe("COMPARISON_NOT_APPLICABLE");

    // With a background curriculum stated, the next refusal is the deployment's absent
    // search credential — never a model call with imagined web context (§11).
    const seeded = await createIntake(userId, {
      schemaVersion: 1,
      clientKey: randomUUID(),
      mode: "EXAM",
    });
    const ready = await patchIntake(userId, seeded.id, {
      schemaVersion: 1,
      expectedVersion: seeded.version,
      brief: {
        ...readyBrief(endDate),
        backgroundCurriculum: {
          label: "CAIE A-Level",
          level: "A-Level",
          board: "CAIE",
          subjects: ["Biology"],
        },
      },
    });
    const view = await applyIntakeAction(userId, ready.id, {
      schemaVersion: 1,
      expectedVersion: ready.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    expect(view.comparison.state).toBe("UNAVAILABLE");
    expect(view.comparison.status).toBe("UNAVAILABLE");
    expect(view.comparison.units).toEqual([]);
    expect(view.comparison.unavailableReason).toMatch(/web search/);
    // The attempt wrote nothing about the student: the readiness brief's own stated
    // preparedness is exactly what it was, and no unit gained an overlap-derived answer.
    expect(view.brief.comparison?.failureCode).toBe("COMPARISON_SEARCH_UNAVAILABLE");
    expect(view.brief.preparedness).toEqual(readyBrief(endDate).preparedness);
    expect(view.comparison.suggestionRefs).toEqual([]);
  });

  it("keeps one student's intake invisible to another", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const stranger = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
      })
    ).id;
    await expect(readIntake(stranger, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      patchIntake(stranger, created.id, {
        schemaVersion: 1,
        expectedVersion: 0,
        brief: readyBrief(endDate),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
