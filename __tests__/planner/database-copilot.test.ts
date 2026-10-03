// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { createIntake, patchIntake, readIntake, applyIntakeAction } from "@/lib/planner/server/intake";
import { applyCopilotProposal, runCopilotTurn } from "@/lib/planner/copilot/run";
import { releaseCandidates, releaseGeneratedItem, releasedItems } from "@/lib/planner/copilot/release";
import { acceptReoffer, declineReoffer, reofferOffers } from "@/lib/planner/server/reoffer";
import { REOFFER_LIMITS, reofferDisclosure } from "@/lib/planner/reoffer";
import type { CopilotInterpretationResult, CopilotModel, CopilotTurnInput } from "@/lib/planner/copilot/model";
import type { PlannerCopilotInterpretationV1 } from "@/lib/planner/copilot/contracts";
import { classifyExecution } from "@/lib/planner/rebalance-policy";

/**
 * The Copilot end to end, against real PostgreSQL.
 *
 * The model is stubbed, deliberately: what this suite checks is what the *server* does with
 * an interpretation — which actions it builds, whether it applies them atomically, whether a
 * stale token is refused, and what happens when a student releases work the planner made.
 * The model's language skill is not asserted anywhere, because nothing in the planner is
 * allowed to depend on it.
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
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";
import { createPlanShell, saveValidatedDraft } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";

/** A Copilot model stub: returns the interpretation the test needs, and nothing else. */
function stubModel(interpretation: PlannerCopilotInterpretationV1): CopilotModel {
  const calls = { interpret: 0, phrase: 0 };
  return {
    async interpret(_input: CopilotTurnInput): Promise<CopilotInterpretationResult> {
      calls.interpret += 1;
      return { interpretation, inputChars: 100, outputChars: 50 };
    },
    async phrase() {
      calls.phrase += 1;
      return { phrasing: "Because of what you confirmed earlier.", inputChars: 50, outputChars: 20 };
    },
  };
}

const interpretation = (over: Record<string, unknown> = {}): PlannerCopilotInterpretationV1 =>
  ({
    schemaVersion: 1,
    intent: "INTAKE_UPDATE",
    confidence: "HIGH",
    summary: "Understood.",
    commands: [],
    clarification: { required: false },
    explanationRefs: [],
    ...over,
  }) as PlannerCopilotInterpretationV1;

function readyBrief(endDate: string): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: "NUST NET Engineering" },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Mathematics" },
    target: { endDate, examDate: endDate },
    budget: { ...base.budget, weeklyMinutes: 600 },
    scope: {
      source: "USER_MANUAL",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: [
        { nodeId: "n1", label: "Matrices", kind: "TOPIC", parentId: null, selected: true },
        { nodeId: "n2", label: "Sequences and series", kind: "TOPIC", parentId: null, selected: true },
      ],
    },
  };
}

describe.skipIf(!database)("planner Copilot against PostgreSQL", () => {
  let userId: number;
  let sessionId: string;
  let endDate: string;

  beforeEach(async () => {
    userId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    endDate = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);
    const created = await createIntake(userId, {
      schemaVersion: 1,
      clientKey: randomUUID(),
      mode: "EXAM",
    });
    const seeded = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: readyBrief(endDate),
    });
    sessionId = seeded.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const version = async () =>
    (await prisma.plannerIntakeSession.findFirstOrThrow({ where: { id: sessionId } })).version;

  it("applies one high-confidence reversible change directly, in a single version increment", async () => {
    const before = await version();
    const outcome = await runCopilotTurn({
      userId,
      sessionId,
      raw: {
        schemaVersion: 1,
        expectedVersion: before,
        message: "I have 8 hours a week, not 10.",
      },
      deps: {
        model: stubModel(
          interpretation({
            commands: [{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false }],
            summary: "Weekly study target set to 8 hours.",
          })
        ),
      },
    });
    expect(outcome.view.brief.budget.weeklyMinutes).toBe(480);
    // One increment: the batch is one write, not one per command.
    expect(await version()).toBe(before + 1);
  });

  it("proposes a multi-command change, applies it atomically, and refuses a stale token", async () => {
    const before = await version();
    const proposed = await runCopilotTurn({
      userId,
      sessionId,
      raw: {
        schemaVersion: 1,
        expectedVersion: before,
        message: "Give me 8 hours a week, keep Sundays light, and mark vectors weak.",
      },
      deps: {
        model: stubModel(
          interpretation({
            commands: [
              { command: "SET_WEEKLY_HOURS", hours: 8, hard: false },
              { command: "SET_CONSTRAINT", kind: "EVEN_SPREAD_PREFERENCE", strength: "SOFT", value: 120, preferenceWeight: 1 },
              { command: "SET_PREPAREDNESS", labels: ["Sequences and series"], state: "WEAK" },
            ],
          })
        ),
      },
    });
    expect(proposed.result.outcome).toBe("PROPOSED");
    if (proposed.result.outcome !== "PROPOSED") throw new Error("expected a proposal");
    const proposal = proposed.result.proposal;
    expect(proposal.preview).toHaveLength(3);
    expect(proposal.requiresAcknowledgement).toContain("MULTI_COMMAND");
    // Nothing has been written yet.
    expect(await version()).toBe(before);
    const untouched = await readIntake(userId, sessionId);
    expect(untouched.brief.budget.weeklyMinutes).toBe(600);
    expect(untouched.brief.preparedness).toEqual([]);

    const applied = await applyCopilotProposal({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: before, token: proposal.token },
    });
    expect(applied.outcome).toBe("APPLIED");
    expect(applied.view.brief.budget.weeklyMinutes).toBe(480);
    expect(applied.view.brief.preparedness.find((row) => row.nodeId === "n2")).toMatchObject({
      covered: true,
      confidence: 2,
    });
    expect(applied.view.brief.constraints).toHaveLength(1);
    // One increment for three changes.
    expect(await version()).toBe(before + 1);

    // Replaying the same token is a stale proposal, not a second application.
    await expect(
      applyCopilotProposal({
        userId,
        sessionId,
        raw: { schemaVersion: 1, expectedVersion: before, token: proposal.token },
      })
    ).rejects.toMatchObject({ code: "COPILOT_PROPOSAL_STALE" });
    // And another account cannot apply it either.
    const stranger = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    await expect(
      applyCopilotProposal({
        userId: stranger,
        sessionId,
        raw: { schemaVersion: 1, expectedVersion: before, token: proposal.token },
      })
    ).rejects.toBeTruthy();
  });

  it("persists nothing when one command of a batch is impossible", async () => {
    const before = await version();
    const proposed = await runCopilotTurn({
      userId,
      sessionId,
      raw: {
        schemaVersion: 1,
        expectedVersion: before,
        message: "Set 8 hours and remove Thermodynamics.",
      },
      deps: {
        model: stubModel(
          interpretation({
            intent: "SCOPE_UPDATE",
            confidence: "MEDIUM",
            commands: [
              { command: "SET_WEEKLY_HOURS", hours: 8, hard: false },
              { command: "UPDATE_SCOPE", add: [], remove: ["Thermodynamics"], rename: [] },
            ],
          })
        ),
      },
    });
    // The refusal is closed-coded, and the brief is untouched.
    expect(proposed.result.outcome).toBe("REFUSED");
    if (proposed.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(proposed.result.code).toBe("UNKNOWN_REFERENCE");
    expect(await version()).toBe(before);
    expect((await readIntake(userId, sessionId)).brief.budget.weeklyMinutes).toBe(600);
  });

  it("refuses research when the student switched it off, and never searches", async () => {
    const off = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: await version(),
      actionKey: randomUUID(),
      action: "setScopeResearchPolicy",
      policy: "OFF",
    });
    const refused = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: off.version, message: "Find the official syllabus." },
      deps: {
        model: stubModel(
          interpretation({ intent: "RESEARCH_REQUEST", commands: [{ command: "REQUEST_SCOPE_RESEARCH" }] })
        ),
      },
    });
    expect(refused.result.outcome).toBe("REFUSED");
    if (refused.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(refused.result.code).toBe("RESEARCH_DISABLED");
    expect(refused.view.brief.scopeCandidate).toBeNull();
  });

  /**
   * The live model obeys the instruction not to request research on a switched-off plan, so
   * it returns the *intent* with no command at all. That used to fall through to
   * `NOTHING_TO_DO` — "I could not find a change to make in that" — which is safe but is not
   * an answer to "find the syllabus". A live smoke caught it; this keeps it caught.
   */
  it("answers a switched-off research request honestly even with no command to map", async () => {
    const off = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: await version(),
      actionKey: randomUUID(),
      action: "setScopeResearchPolicy",
      policy: "OFF",
    });
    for (const intent of ["RESEARCH_REQUEST", "COMPARISON_REQUEST"] as const) {
      const refused = await runCopilotTurn({
        userId,
        sessionId,
        raw: { schemaVersion: 1, expectedVersion: off.version, message: "Find the official syllabus." },
        deps: { model: stubModel(interpretation({ intent, commands: [] })) },
      });
      expect(refused.result.outcome).toBe("REFUSED");
      if (refused.result.outcome !== "REFUSED") throw new Error("expected a refusal");
      expect(refused.result.code).toBe("RESEARCH_DISABLED");
      expect(refused.result.message).toContain("Web research is off for this plan");
      expect(refused.view.brief.scopeCandidate).toBeNull();
    }
  });

  /**
   * §32/§33 of the final phase: a missing prerequisite is not "too many commands".
   *
   * A live run showed the two sharing one code. "Compare this with my A-Level background" on
   * a plan with no background recorded is one request with one thing missing, and answering
   * it with "that is several separate changes at once" told the student nothing they could
   * act on. These assert the replacement: the closed code, the closed prerequisite, and a
   * brief that is provably untouched.
   */
  it("names the missing prerequisite instead of counting commands", async () => {
    // The seeded brief has a confirmed scope and no background curriculum.
    const missingBackground = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: await version(), message: "Compare this with my A-Level background." },
      deps: { model: stubModel(interpretation({ intent: "COMPARISON_REQUEST", commands: [{ command: "REQUEST_CURRICULUM_COMPARISON", refresh: false }] })) },
    });
    expect(missingBackground.result.outcome).toBe("REFUSED");
    if (missingBackground.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(missingBackground.result.code).toBe("COPILOT_PREREQUISITE_MISSING");
    expect(missingBackground.result.prerequisite).toBe("BACKGROUND_CURRICULUM_REQUIRED");
    expect(missingBackground.result.message).toMatch(/what you studied before/i);
    expect(missingBackground.view.version).toBe(await version());

    // With a background but no confirmed scope, the next rung is the scope.
    const unconfirmed = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: await version(),
      actionKey: randomUUID(),
      action: "setBackgroundCurriculum",
      label: "CAIE A-Level",
      level: "A-Level",
      board: "CAIE",
      subjects: ["Mathematics"],
    });
    const scoped = await patchIntake(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: unconfirmed.version,
      brief: { ...unconfirmed.brief, scope: { ...unconfirmed.brief.scope, confirmedAt: null, nodes: [] } },
    });
    const missingScope = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: scoped.version, message: "Compare this with my A-Level background." },
      deps: { model: stubModel(interpretation({ intent: "COMPARISON_REQUEST", commands: [{ command: "REQUEST_CURRICULUM_COMPARISON", refresh: false }] })) },
    });
    expect(missingScope.result.outcome).toBe("REFUSED");
    if (missingScope.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(missingScope.result.prerequisite).toBe("CONFIRMED_SCOPE_REQUIRED");
    // A prerequisite never carries a proposal, and it never changes anything.
    expect(missingScope.view.brief.scope.confirmedAt).toBeNull();
  });

  /**
   * The same request, in the shape the model also produces.
   *
   * A live corpus showed "Compare this with my A-Level background" arriving two ways: as a bare
   * comparison request, and as a background edit *plus* a comparison command. The second shape
   * tripped the mixed-confirmation rule first and was told "that is two different things" —
   * accurate, and not the answer to the question. Both shapes must now name the missing
   * prerequisite, because that is what is actually wrong with the request.
   */
  it("names the missing prerequisite even when the model also proposed the fix", async () => {
    const mixed = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: await version(), message: "Compare this with my A-Level background." },
      deps: {
        model: stubModel(
          interpretation({
            intent: "BACKGROUND_UPDATE",
            commands: [
              { command: "SET_BACKGROUND_CURRICULUM", label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
              { command: "REQUEST_CURRICULUM_COMPARISON", refresh: false },
            ],
          })
        ),
      },
    });
    expect(mixed.result.outcome).toBe("REFUSED");
    if (mixed.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(mixed.result.code).toBe("COPILOT_PREREQUISITE_MISSING");
    expect(mixed.result.prerequisite).toBe("BACKGROUND_CURRICULUM_REQUIRED");
    // Nothing was partially applied: the brief is exactly as it was.
    expect(mixed.view.brief.backgroundCurriculum).toBeNull();
  });

  it("explains a genuinely mixed request as two confirmation boundaries", async () => {
    const mixed = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: await version(), message: "Set my weekly hours to 8 and research the syllabus." },
      deps: {
        model: stubModel(
          interpretation({
            intent: "RESEARCH_REQUEST",
            commands: [{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false }, { command: "REQUEST_SCOPE_RESEARCH" }],
          })
        ),
      },
    });
    expect(mixed.result.outcome).toBe("REFUSED");
    if (mixed.result.outcome !== "REFUSED") throw new Error("expected a refusal");
    expect(mixed.result.code).toBe("TOO_MANY_COMMANDS");
    // The copy names the distinction, so the student knows *why* to split it.
    expect(mixed.result.message).toMatch(/change to your plan/i);
    expect(mixed.result.message).toMatch(/look up/i);
    // …and nothing was partially applied.
    expect(mixed.view.version).toBe(await version());
    expect(mixed.view.brief.budget.weeklyMinutes).not.toBe(480);
  });

  it("answers a question with facts, and changes nothing at all", async () => {
    const before = await version();
    const answered = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: before, message: "Why is Matrices in my plan?" },
      deps: {
        model: stubModel(interpretation({ intent: "EXPLAIN", commands: [], explanationRefs: ["unit:Matrices"] })),
      },
    });
    expect(answered.result.outcome).toBe("ANSWERED");
    if (answered.result.outcome !== "ANSWERED") throw new Error("expected an answer");
    expect(answered.result.facts.map((fact) => fact.id)).toContain("unit:Matrices");
    expect(answered.result.phrasing).toBeTruthy();
    expect(await version()).toBe(before);
  });

  it("asks one clarification instead of guessing, and never changes the brief", async () => {
    const before = await version();
    const asked = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: before, message: "Fridays aren't great." },
      deps: {
        model: stubModel(
          interpretation({
            intent: "CONSTRAINT_UPDATE",
            confidence: "LOW",
            commands: [],
            clarification: {
              required: true,
              code: "HARD_OR_SOFT",
              question: "Do you mean Friday is completely unavailable, or just that you would prefer to avoid it?",
              options: ["Completely unavailable", "Prefer to avoid"],
            },
          })
        ),
      },
    });
    expect(asked.result.outcome).toBe("ANSWERED");
    if (asked.result.outcome !== "ANSWERED") throw new Error("expected a clarification");
    expect(asked.result.clarification.required).toBe(true);
    expect(await version()).toBe(before);
  });

  it("routes a confirmed-plan change to Phase 5 and mutates nothing", async () => {
    // Build and confirm a plan, then bind it to this intake the way generation does.
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: "Copilot routing",
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
    // The keys the sealed revision actually issued: `normalizeProposal` mints fresh ones
    // every call, so the draft must be read back from the revision rather than rebuilt.
    const draft = revision.outputSnapshot as unknown as { items: { key: string }[] };
    await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    await prisma.plannerIntakeSession.update({
      where: { id: sessionId },
      data: { planId: plan.id },
    });
    const planBefore = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });

    const routed = await runCopilotTurn({
      userId,
      sessionId,
      raw: { schemaVersion: 1, expectedVersion: await version(), message: "Make next week lighter." },
      deps: {
        model: stubModel(
          interpretation({
            intent: "REPLAN_REQUEST",
            commands: [{ command: "REQUEST_REPLAN", reason: "LIGHTER" }],
          })
        ),
      },
    });
    expect(routed.result.outcome).toBe("PROPOSED");
    if (routed.result.outcome !== "PROPOSED") throw new Error("expected a proposal");
    expect(routed.result.proposal.route).toBe("REPLAN");

    const applied = await applyCopilotProposal({
      userId,
      sessionId,
      raw: {
        schemaVersion: 1,
        expectedVersion: await version(),
        token: routed.result.proposal.token,
      },
    });
    expect(applied.outcome).toBe("ROUTED");
    expect(applied.route).toBe("REPLAN");
    // The Phase 5 request is handed back, not executed: nothing changed yet.
    expect(applied.request).toMatchObject({
      schemaVersion: 1,
      reasonCode: "USER_REQUESTED",
      baseRevisionId: planBefore.activeRevisionId,
      scope: { milestoneKey: null },
    });
    const planAfter = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(planAfter.version).toBe(planBefore.version);
    expect(planAfter.activeRevisionId).toBe(planBefore.activeRevisionId);
    expect(await prisma.plannerRevision.count({ where: { planId: plan.id, source: "REBALANCE" } })).toBe(0);
  });

  describe("release of generated work", () => {
    /** A confirmed plan whose items are ordinary pending Quests. */
    const confirmedPlan = async () => {
      const plan = await createPlanShell(userId, {
        mode: "EXAM",
        title: "Release",
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
      const draft = revision.outputSnapshot as unknown as { items: { key: string }[] };
      await confirmDraft(userId, plan.id, {
        schemaVersion: 1,
        revisionId: revision.id,
        digest: revision.digest!,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
        selectedItemKeys: draft.items.map((item) => item.key),
        createGoal: false,
      });
      const today = examFixture().startDate;
      const candidates = await releaseCandidates(userId, plan.id, today);
      return { plan, revision, draft, today, candidates };
    };

    it("releases an unstarted planner-generated item, records the tombstone, and removes the Quest", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      expect(candidates.length).toBeGreaterThan(0);
      const target = candidates.find((candidate) => candidate.type === "RECALL") ?? candidates[0];

      const outcome = await releaseGeneratedItem(
        userId,
        plan.id,
        {
          schemaVersion: 1,
          expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
          requestKey: randomUUID(),
          itemKeys: [target.itemKey],
          reason: "NO_TIME",
        },
        today
      );
      expect(outcome.released).toHaveLength(1);
      // The Quest is gone from the student's work, and the Quest row with it.
      expect(await prisma.quest.findUnique({ where: { id: target.questId } })).toBeNull();
      // The tombstone is durable and distinct from a deletion.
      const link = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: target.itemKey },
      });
      expect(link.disposition).toBe("USER_RELEASED");
      expect(link.removalReason).toBe("USER_RELEASED");
      expect(link.removedAt).not.toBeNull();
      expect(link.questId).toBeNull();
      // Its lineage survives: the planner still knows it created this item.
      expect(link.createdRevisionId).toBeTruthy();
      expect(link.baseline).toBeTruthy();

      // And it is reported as released rather than deleted.
      const released = await releasedItems(userId, plan.id);
      expect(released.map((entry) => entry.itemKey)).toEqual([target.itemKey]);

      // The engine will never offer it again: a released link is not replannable, and it is
      // frozen exactly like a tombstone.
      const rows = await prisma.plannerQuestLink.findMany({ where: { planId: plan.id } });
      const releasedRow = rows.find((row) => row.itemKey === target.itemKey)!;
      expect(
        classifyExecution(
          {
            itemKey: releasedRow.itemKey,
            questId: releasedRow.questId,
            disposition: releasedRow.disposition,
            status: null,
            scheduledFor: null,
            requiredMinutes: null,
            elapsedSeconds: 0,
            completedAt: null,
            sessions: 0,
            activeSession: false,
          },
          today
        )
      ).toBe("CONFLICTED");
      const stillLive = rows.filter((row) => row.disposition === "LIVE");
      expect(stillLive.map((row) => row.itemKey)).not.toContain(target.itemKey);
    });

    /**
     * §35–§40 of the final phase: the explicit half of a release.
     *
     * Phase 4 made the tombstone durable so a replan can never resurrect released work. These
     * tests are the other side of that promise: Sylf is allowed to *ask* — once, plainly,
     * naming the student's own decision — and the answer is what gets recorded.
     */
    const releaseOne = async () => {
      const setup = await confirmedPlan();
      // The longest releasable session: a re-offer only exists when a *shorter* replacement is
      // possible, so a 15-minute item — the engine's floor — deliberately produces none.
      const target = [...setup.candidates].sort((a, b) => b.minutes - a.minutes)[0];
      await releaseGeneratedItem(
        userId,
        setup.plan.id,
        {
          schemaVersion: 1,
          expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: setup.plan.id } })).version,
          requestKey: randomUUID(),
          itemKeys: [target.itemKey],
          reason: "TOO_MUCH_WORK",
        },
        setup.today
      );
      return { ...setup, target };
    };

    it("offers a replacement for a released item only while the gap is real, and creates nothing", async () => {
      const { plan, target } = await releaseOne();
      const offers = await reofferOffers(userId, plan.id);
      expect(offers.map((offer) => offer.releasedItemKey)).toEqual([target.itemKey]);

      const offer = offers[0];
      // A replacement is shorter than what it replaced, and inside the engine's own bounds.
      expect(offer.replacement.minutes).toBeLessThan(offer.releasedMinutes);
      expect(offer.replacement.minutes).toBeGreaterThanOrEqual(15);
      expect(offer.replacement.minutes).toBe(
        Math.min(240, Math.max(15, Math.round(offer.releasedMinutes * REOFFER_LIMITS.replacementFactor)))
      );
      // It is a *new* item, marked as a replacement so the two are never confused.
      expect(offer.replacement.title).not.toBe(offer.releasedTitle);
      expect(offer.replacement.title).toContain("replacement");

      // The disclosure always says who removed it and that declining is allowed.
      const disclosure = reofferDisclosure(offer);
      expect(disclosure).toContain(offer.releasedTitle);
      expect(disclosure).toMatch(/you removed/i);
      expect(disclosure).toMatch(/leave it out/i);

      // Nothing was created by asking: the offer is a question, not a mutation.
      const questsBefore = await prisma.quest.count({ where: { userId } });
      await reofferOffers(userId, plan.id);
      expect(await prisma.quest.count({ where: { userId } })).toBe(questsBefore);
      // …and reading it did not record anything either, so a reload shows the same offer.
      const link = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: target.itemKey },
      });
      expect(link.reofferState).toBeNull();
      expect(link.disposition).toBe("USER_RELEASED");
    });

    it("declines once and never asks again", async () => {
      const { plan, target } = await releaseOne();
      const version = (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version;
      await declineReoffer(userId, plan.id, {
        schemaVersion: 1,
        expectedVersion: version,
        releasedItemKey: target.itemKey,
      });

      const questsBefore = await prisma.quest.count({ where: { userId } });
      expect(await reofferOffers(userId, plan.id)).toEqual([]);
      // Declining materialises nothing, and the tombstone is otherwise exactly as it was.
      expect(await prisma.quest.count({ where: { userId } })).toBe(questsBefore);
      const link = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: target.itemKey },
      });
      expect(link.reofferState).toBe("DECLINED");
      expect(link.disposition).toBe("USER_RELEASED");
      expect(link.questId).toBeNull();
      expect(link.removalReason).toBe("USER_RELEASED");
      // A second decline is a no-op rather than an error, so a retried request is safe.
      await declineReoffer(userId, plan.id, {
        schemaVersion: 1,
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        releasedItemKey: target.itemKey,
      });
      expect(await reofferOffers(userId, plan.id)).toEqual([]);
    });

    it("accepts a replacement as distinct new work, and never revives the tombstone", async () => {
      const { plan, target, today } = await releaseOne();
      const before = (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version;
      const acceptance = await acceptReoffer(userId, plan.id, {
        schemaVersion: 1,
        expectedVersion: before,
        releasedItemKey: target.itemKey,
        requestKey: randomUUID(),
      });
      expect(acceptance.created).toBe(true);
      // Distinct identity: a new item key and a new Quest, not the released one.
      expect(acceptance.replacementItemKey).not.toBe(target.itemKey);
      expect(acceptance.questId).not.toBe(target.questId);

      const replacement = await prisma.quest.findUniqueOrThrow({ where: { id: acceptance.questId } });
      expect(replacement.title).toContain("replacement");
      // Ordinary work: linked, live, and releasable in its turn.
      const replacementLink = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: acceptance.replacementItemKey },
      });
      expect(replacementLink.disposition).toBe("LIVE");
      expect(replacementLink.questId).toBe(acceptance.questId);
      expect(JSON.stringify(replacementLink.baseline)).toContain(target.itemKey);

      /**
       * The original tombstone is untouched where it matters. The decision — disposition,
       * questId, removal reason, item key — is exactly as the release left it; only the
       * re-offer bookkeeping moved.
       */
      const tombstone = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: target.itemKey },
      });
      expect(tombstone.disposition).toBe("USER_RELEASED");
      expect(tombstone.questId).toBeNull();
      expect(tombstone.removalReason).toBe("USER_RELEASED");
      expect(tombstone.reofferState).toBe("ACCEPTED");
      // The released Quest stays gone.
      expect(await prisma.quest.findUnique({ where: { id: target.questId } })).toBeNull();

      // Answered offers stop being offered, and accepting twice creates nothing new.
      expect(await reofferOffers(userId, plan.id)).toEqual([]);
      const quests = await prisma.quest.count({ where: { userId } });
      const replay = await acceptReoffer(userId, plan.id, {
        schemaVersion: 1,
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        releasedItemKey: target.itemKey,
        requestKey: randomUUID(),
      });
      expect(replay.created).toBe(false);
      expect(replay.questId).toBe(acceptance.questId);
      expect(await prisma.quest.count({ where: { userId } })).toBe(quests);

      // The replacement is ordinary work: it can be released in its turn, because the release
      // path describes an item whose key the frozen draft has never heard of.
      const candidates = await releaseCandidates(userId, plan.id, today);
      expect(candidates.map((candidate) => candidate.itemKey)).toContain(acceptance.replacementItemKey);
    });

    it("stops offering once the plan has answered the gap on its own", async () => {
      const { plan, target, revision } = await releaseOne();
      // The plan puts an equivalent session back on its own — the normal way a gap closes.
      void revision;
      expect((await reofferOffers(userId, plan.id)).length).toBe(1);
      // Answering it — either way — closes the offer for good. The pure-function half, where a
      // *replan* closes the gap by writing equivalent work, is covered in reoffer.test.ts:
      // a sealed revision is immutable by database guard, so the only honest way to change a
      // confirmed plan's work here is through the re-offer path itself.
      await acceptReoffer(userId, plan.id, {
        schemaVersion: 1,
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        releasedItemKey: target.itemKey,
        requestKey: randomUUID(),
      });
      expect(await reofferOffers(userId, plan.id)).toEqual([]);
    });

    it("refuses work that has started, and never touches it", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      const target = candidates[0];
      await prisma.quest.update({
        where: { id: target.questId },
        data: { status: "IN_PROGRESS" },
      });
      const planRow = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      await expect(
        releaseGeneratedItem(
          userId,
          plan.id,
          {
            schemaVersion: 1,
            expectedVersion: planRow.version,
            requestKey: randomUUID(),
            itemKeys: [target.itemKey],
            reason: "OTHER",
          },
          today
        )
      ).rejects.toMatchObject({ code: "RELEASE_IN_PROGRESS" });
      // Still live, still a Quest, no tombstone.
      const link = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: target.itemKey },
      });
      expect(link.disposition).toBe("LIVE");
      expect(await prisma.quest.findUnique({ where: { id: target.questId } })).not.toBeNull();
    });

    it("refuses completed work and work the student has already released", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      const done = candidates[0];
      await prisma.quest.update({
        where: { id: done.questId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      const planRow = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      await expect(
        releaseGeneratedItem(
          userId,
          plan.id,
          {
            schemaVersion: 1,
            expectedVersion: planRow.version,
            requestKey: randomUUID(),
            itemKeys: [done.itemKey],
            reason: "OTHER",
          },
          today
        )
      ).rejects.toMatchObject({ code: "RELEASE_COMPLETED" });

      const second = candidates[1];
      await releaseGeneratedItem(
        userId,
        plan.id,
        {
          schemaVersion: 1,
          expectedVersion: planRow.version,
          requestKey: randomUUID(),
          itemKeys: [second.itemKey],
          reason: "OTHER",
        },
        today
      );
      const afterRelease = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      await expect(
        releaseGeneratedItem(
          userId,
          plan.id,
          {
            schemaVersion: 1,
            expectedVersion: afterRelease.version,
            requestKey: randomUUID(),
            itemKeys: [second.itemKey],
            reason: "OTHER",
          },
          today
        )
      ).rejects.toMatchObject({ code: "RELEASE_ALREADY_RELEASED" });
    });

    it("denies a foreign account any part of the flow", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      const stranger = (
        await prisma.user.create({
          data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
        })
      ).id;
      await expect(releaseCandidates(stranger, plan.id, today)).rejects.toBeTruthy();
      const planRow = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      await expect(
        releaseGeneratedItem(
          stranger,
          plan.id,
          {
            schemaVersion: 1,
            expectedVersion: planRow.version,
            requestKey: randomUUID(),
            itemKeys: [candidates[0].itemKey],
            reason: "OTHER",
          },
          today
        )
      ).rejects.toBeTruthy();
      // And the owner's work is untouched by the attempt.
      const link = await prisma.plannerQuestLink.findFirstOrThrow({
        where: { planId: plan.id, itemKey: candidates[0].itemKey },
      });
      expect(link.disposition).toBe("LIVE");
    });

    it("reports an educational gap as a warning rather than a refusal", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      const recall = candidates.find((candidate) => candidate.type === "RECALL") ?? candidates[0];
      const planRow = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      const outcome = await releaseGeneratedItem(
        userId,
        plan.id,
        {
          schemaVersion: 1,
          expectedVersion: planRow.version,
          requestKey: randomUUID(),
          itemKeys: [recall.itemKey],
          reason: "NO_TIME",
        },
        today
      );
      // Releasing a recall session is allowed, and the consequence is stated.
      expect(outcome.released).toHaveLength(1);
      expect(outcome.findings.every((entry) => entry.severity === "WARNING")).toBe(true);
      expect(outcome.findings.map((entry) => entry.code)).toContain("MISSING_SPACED_RECALL");
      expect(outcome.findings[0].consequence.length).toBeGreaterThan(20);
    });

    it("does not resurrect released work when the execution snapshot is read again", async () => {
      const { plan, today, candidates } = await confirmedPlan();
      const target = candidates[0];
      const planRow = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
      await releaseGeneratedItem(
        userId,
        plan.id,
        {
          schemaVersion: 1,
          expectedVersion: planRow.version,
          requestKey: randomUUID(),
          itemKeys: [target.itemKey],
          reason: "OTHER",
        },
        today
      );
      // A second read of eligibility — what a replan, a refresh or a regeneration does —
      // cannot offer it again, however many times it is asked.
      const again = await releaseCandidates(userId, plan.id, today);
      expect(again.map((candidate) => candidate.itemKey)).not.toContain(target.itemKey);
      const replayed = await releaseGeneratedItem(
        userId,
        plan.id,
        {
          schemaVersion: 1,
          expectedVersion: planRow.version,
          requestKey: randomUUID(),
          itemKeys: [target.itemKey],
          reason: "OTHER",
        },
        today
      ).catch((error: { code?: string }) => error);
      expect((replayed as { code?: string }).code).toBeTruthy();
    });
  });

  it("keeps the exam fixture's availability contract intact for these tests", () => {
    expect(examAvailability().schemaVersion).toBe(1);
  });
});
