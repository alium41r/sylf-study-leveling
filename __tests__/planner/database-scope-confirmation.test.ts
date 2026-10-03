// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import { applyIntakeAction, createIntake, patchIntake, readIntake } from "@/lib/planner/server/intake";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import {
  candidateFromResearch,
  researchBriefDigest,
  respectStudentRemovals,
} from "@/lib/planner/research/service";

/**
 * Confirmation, against real PostgreSQL.
 *
 * This is the boundary the whole phase turns on: research and import propose, a person
 * decides, and only `confirmScope` may make a candidate authoritative. These tests pin
 * that boundary from both sides — that an unconfirmed candidate cannot be planned, and
 * that a confirmed one is exactly what the student chose, with its provenance intact
 * and their own edits winning.
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
import { prisma } from "@/lib/prisma";

const endDate = () => new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);

/** A brief that is ready to draft except for its scope, with a candidate waiting. */
function briefWithCandidate(end: string): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  const withGoal: PlanBriefV1 = {
    ...base,
    goal: { title: "A-Level Mathematics" },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Mathematics" },
    target: { endDate: end, examDate: end },
    backgroundCurriculum: { label: "A-Level Mathematics", level: "A-Level", board: "CAIE" },
    budget: {
      weeklyMinutes: 480,
      dailyOverrides: null,
      blockedDates: [],
      recoveryPercent: null,
      acceptReducedReserve: false,
      distribution: null,
    },
  };
  return {
    ...withGoal,
    scopeCandidate: candidateFromResearch({
      request: {
        briefDigest: researchBriefDigest(withGoal),
        goal: "A-Level Mathematics",
        subject: "Mathematics",
        board: "CAIE",
        level: "A-Level",
        mode: "EXAM",
      },
      findings:
        "# Pure Mathematics\n## Algebra\n- Quadratics\n- Sequences\n## Geometry\n- Circles\n# Statistics\n- Probability",
      sources: [
        { url: "https://www.cambridgeinternational.org/programmes/spec.pdf", title: "Syllabus 2026" },
        { url: "https://prepblog.example/notes", title: "Revision notes" },
      ],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "cache-key-1",
    }),
  };
}

describe.skipIf(!database)("scope candidate confirmation", () => {
  let userId: number;
  let end: string;

  beforeEach(async () => {
    end = endDate();
    userId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function intakeWithCandidate() {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const patched = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: briefWithCandidate(end),
    });
    return { created, patched };
  }

  it("does not let an unconfirmed candidate be planned, and says what to do instead", async () => {
    const { created, patched } = await intakeWithCandidate();
    // The candidate is stored beside the scope, never inside it.
    expect(patched.brief.scopeCandidate).not.toBeNull();
    expect(patched.brief.scope.nodes).toEqual([]);
    expect(patched.readiness.canGenerate).toBe(false);
    expect(patched.readiness.state).toBe("NEEDS_SCOPE_CONFIRMATION");
    await expect(
      applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: patched.version,
        actionKey: randomUUID(),
        action: "requestGeneration",
      })
    ).rejects.toMatchObject({ code: "BRIEF_NOT_READY" });
  });

  it("confirms exactly what the student chose, with the source kept", async () => {
    const { created, patched } = await intakeWithCandidate();
    const candidate = patched.brief.scopeCandidate!;
    const keep = candidate.nodes.filter((node) => node.label !== "Circles").map((node) => node.nodeId);
    const confirmed = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: patched.version,
      actionKey: randomUUID(),
      action: "confirmScope",
      nodeIds: keep,
      renames: [{ nodeId: candidate.nodes.find((node) => node.label === "Sequences")!.nodeId, label: "Sequences and series" }],
      additions: [
        { nodeId: "local-vectors", label: "Vectors", kind: "TOPIC", parentId: null, selected: true },
      ],
    });

    expect(confirmed.version).toBe(patched.version + 1);
    expect(confirmed.brief.scope.source).toBe("RESEARCH_CONFIRMED");
    expect(confirmed.brief.scope.confirmedAt).not.toBeNull();
    // The candidate is spent, and the confirmed scope is the student's version of it.
    expect(confirmed.brief.scopeCandidate).toBeNull();
    expect(confirmed.brief.scope.nodes.some((node) => node.label === "Circles")).toBe(false);
    expect(confirmed.brief.scope.nodes.some((node) => node.label === "Sequences and series")).toBe(true);
    // Their own addition is present and claims no source, because it is their wording.
    const added = confirmed.brief.scope.nodes.find((node) => node.nodeId === "local-vectors")!;
    expect(added.sourceIds).toBeUndefined();
    // Provenance survives confirmation, as source ids on the scope.
    expect(confirmed.brief.scope.provenanceRefs).toEqual(
      candidate.sources.map((source) => source.sourceId)
    );
    // …and readiness is recomputed from the confirmed scope.
    expect(confirmed.readiness.canGenerate).toBe(true);
  });

  it("refuses a decision about a unit that does not exist", async () => {
    const { created, patched } = await intakeWithCandidate();
    await expect(
      applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: patched.version,
        actionKey: randomUUID(),
        action: "confirmScope",
        nodeIds: ["not-a-real-node"],
      })
    ).rejects.toMatchObject({ code: "UNKNOWN_SCOPE_NODE" });
    const after = await readIntake(userId, created.id);
    expect(after.brief.scope.nodes).toEqual([]);
    expect(after.brief.scopeCandidate).not.toBeNull();
  });

  it("applies a replayed decision once", async () => {
    const { created, patched } = await intakeWithCandidate();
    const actionKey = randomUUID();
    const first = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: patched.version,
      actionKey,
      action: "confirmScope",
    });
    const replay = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: first.version,
      actionKey,
      action: "confirmScope",
    });
    expect(replay.version).toBe(first.version);
    expect(replay.brief.scope.nodes).toEqual(first.brief.scope.nodes);
  });

  it("refuses a stale decision and leaves the brief alone", async () => {
    const { created, patched } = await intakeWithCandidate();
    await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: patched.version,
      actionKey: randomUUID(),
      action: "setGoal",
      title: "A-Level Further Mathematics",
    });
    await expect(
      applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: patched.version,
        actionKey: randomUUID(),
        action: "confirmScope",
      })
    ).rejects.toMatchObject({ code: "INTAKE_STALE" });
    const after = await readIntake(userId, created.id);
    expect(after.brief.scope.nodes).toEqual([]);
  });

  it("keeps one student's candidate out of another student's reach", async () => {
    const { created } = await intakeWithCandidate();
    const stranger = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
      })
    ).id;
    await expect(readIntake(stranger, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      applyIntakeAction(stranger, created.id, {
        schemaVersion: 1,
        expectedVersion: 0,
        actionKey: randomUUID(),
        action: "confirmScope",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets a later edit win, and never restores a removed unit from research", async () => {
    const { created, patched } = await intakeWithCandidate();
    const candidate = patched.brief.scopeCandidate!;
    const circles = candidate.nodes.find((node) => node.label === "Circles")!;
    const confirmed = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: patched.version,
      actionKey: randomUUID(),
      action: "confirmScope",
      nodeIds: candidate.nodes.map((node) => node.nodeId),
    });
    // The student then removes a chapter for good. Editing a confirmed scope withdraws
    // the confirmation: they must confirm what is actually there, not what was there
    // before the edit — which is exactly what stops an edit being quietly undone.
    const edited = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: confirmed.version,
      actionKey: randomUUID(),
      action: "updateScopeUnits",
      remove: [circles.nodeId],
    });
    expect(edited.brief.scope.nodes.some((node) => node.nodeId === circles.nodeId)).toBe(false);
    expect(edited.brief.scope.confirmedAt).toBeNull();
    expect(edited.readiness.canGenerate).toBe(false);
    expect(edited.readiness.state).toBe("NEEDS_SCOPE_CONFIRMATION");
    await expect(
      applyIntakeAction(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: edited.version,
        actionKey: randomUUID(),
        action: "requestGeneration",
      })
    ).rejects.toMatchObject({ code: "BRIEF_NOT_READY" });

    // Research runs again and proposes the same scope. Two things must hold: the
    // candidate never overwrites the confirmed scope, and the unit the student removed
    // comes back *unticked* with a sentence saying so — a suggestion, not an undo.
    const refreshed = respectStudentRemovals(candidate, edited.brief.scope.removedLabels);
    expect(edited.brief.scope.removedLabels).toContain("Circles");
    expect(refreshed.nodes.find((node) => node.label === "Circles")!.selected).toBe(false);
    expect(refreshed.openQuestions.join(" ")).toMatch(/you removed earlier/i);
    const reResearched = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: edited.version,
      brief: { ...edited.brief, scopeCandidate: refreshed },
    });
    expect(reResearched.brief.scope.nodes.some((node) => node.nodeId === circles.nodeId)).toBe(false);
    expect(reResearched.brief.scopeCandidate).not.toBeNull();

    const reConfirmed = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: reResearched.version,
      actionKey: randomUUID(),
      action: "confirmScope",
    });
    // Confirming without re-ticking keeps their removal: the default is what they left
    // selected, so a fresh candidate cannot restore a deleted unit by arriving.
    expect(reConfirmed.brief.scope.nodes.some((node) => node.nodeId === circles.nodeId)).toBe(false);
    expect(reConfirmed.brief.scope.removedLabels).toContain("Circles");
    expect(reConfirmed.brief.scope.confirmedAt).not.toBeNull();
    const input = UserInputV1Schema.parse(
      (
        await applyIntakeAction(userId, created.id, {
          schemaVersion: 1,
          expectedVersion: reConfirmed.version,
          actionKey: randomUUID(),
          action: "requestGeneration",
        })
      ).generation!.input
    );
    expect(input.mode).toBe("EXAM");
    expect(input.scope).not.toContain("Circles");
  });

  it("withdraws a candidate when the student turns external lookup off", async () => {
    const { created, patched } = await intakeWithCandidate();
    const off = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: patched.version,
      actionKey: randomUUID(),
      action: "setScopeResearchPolicy",
      policy: "OFF",
    });
    expect(off.brief.researchPolicy).toBe("OFF");
    expect(off.brief.scopeCandidate).toBeNull();
    // With nothing searched and nothing confirmed, the honest answer is that a scope is
    // still needed — the student supplies it themselves. What must NOT happen is Sylf
    // offering to search for someone who has declined: the state is never
    // RESEARCH_AVAILABLE, and the summary tells them what to do instead.
    expect(off.readiness.state).toBe("NEEDS_CORE_INFO");
    expect(off.readiness.missing).toContain("SCOPE_MISSING");
    expect(off.readiness.summary).not.toMatch(/search|look for|find the/i);
  });

  it("keeps the board the student chose, because it is what makes a source official", async () => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const withBoard = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      actionKey: randomUUID(),
      action: "setBackground",
      label: "A-Level Mathematics",
      level: "A-Level",
      board: "CAIE",
    });
    expect(withBoard.brief.backgroundCurriculum).toEqual({
      label: "A-Level Mathematics",
      level: "A-Level",
      board: "CAIE",
    });
    const cleared = await applyIntakeAction(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: withBoard.version,
      actionKey: randomUUID(),
      action: "setBackground",
      label: null,
      level: null,
      board: null,
    });
    expect(cleared.brief.backgroundCurriculum).toBeNull();
  });
});
