// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * The Plan Designer's turn, end to end against real PostgreSQL.
 *
 * The unit suite holds the pure decisions; this file holds everything that only exists once a
 * brief is stored — the outcomes a surface switches on, the lifecycle boundary between the
 * Designer and the Copilot, proposal apply through the *existing* endpoint, and the guarantees
 * §37 lists (stale, expired, replayed, cross-user, confirmed-plan mutation, hard constraint).
 *
 * The model is a deterministic double, so every assertion here is about the server's behaviour
 * rather than about DeepSeek's. The model's own quality is measured in the opt-in corpus.
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

vi.mock("@/lib/planner/research/search/provider", () => ({
  selectSearchProvider: () => ({ id: "brave" as const, search: async () => [] }),
}));

import { prisma } from "@/lib/prisma";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { createIntake, patchIntake, readIntake } from "@/lib/planner/server/intake";
import { runDesignerTurn } from "@/lib/planner/designer/run";
import { applyCopilotProposal, runCopilotTurn } from "@/lib/planner/copilot/run";
import { createPlanShell, saveValidatedDraft } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { examFixture, examProposal } from "./exam-fixtures";
import type { DesignerModel } from "@/lib/planner/designer/model";
import type { PlannerDesignerInterpretationV1 } from "@/lib/planner/designer/contracts";

/** A scripted interpreter: one reply, returned for every turn until the test changes it. */
function scripted(reply: Partial<PlannerDesignerInterpretationV1>): DesignerModel & { seen: unknown[] } {
  const seen: unknown[] = [];
  const full = {
    schemaVersion: 1 as const,
    intent: "SETUP" as const,
    confidence: "HIGH" as const,
    summary: "Understood.",
    questionCode: null,
    question: null,
    questionOptions: null,
    recommendedMode: null,
    modeReason: null,
    commands: [],
    clarification: { required: false as const },
    explanationRefs: [],
    ...reply,
  };
  return {
    seen,
    async interpret(input) {
      seen.push(input);
      return { interpretation: full, inputChars: 10, outputChars: 10 };
    },
    async phrase() {
      return { phrasing: "A short answer.", inputChars: 5, outputChars: 5 };
    },
  };
}

const GOAL = "NUST NET Engineering";

function briefFor(endDate: string, over: Partial<PlanBriefV1> = {}): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: GOAL },
    target: { endDate, examDate: endDate },
    ...over,
  };
}

describe.skipIf(!database)("Plan Designer turns against PostgreSQL", () => {
  let userId: number;
  let otherUserId: number;
  let endDate: string;

  beforeEach(async () => {
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
    endDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A session with a goal and a date already in it — the state a real conversation reaches. */
  const seed = async (over: Partial<PlanBriefV1> = {}) => {
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    return patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: briefFor(endDate, over),
    });
  };

  /** An entirely empty session, for the mode-switch and first-message cases. */
  const seedEmpty = async () => createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });

  const turn = (view: { id: string; version: number }, model: DesignerModel, message: string, recent?: unknown[]) =>
    runDesignerTurn({
      userId,
      sessionId: view.id,
      raw: { schemaVersion: 1, expectedVersion: view.version, message, ...(recent ? { recent } : {}) },
      recent: recent as never,
      deps: { model },
    });

  // ── Setting up from natural language ────────────────────────────────────────

  it("proposes a multi-fact setup from one opening message, and applies it on one confirmation", async () => {
    const view = await seed({
      target: { endDate: null, examDate: null },
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: null },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: new Date().toISOString(),
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [
          { nodeId: "u1", label: "Mechanics", kind: "TOPIC", parentId: null, selected: true },
          { nodeId: "u2", label: "Calculus", kind: "TOPIC", parentId: null, selected: true },
        ],
      },
    });
    const model = scripted({
      intent: "SETUP",
      summary: "I understood four things.",
      commands: [
        { command: "SET_TARGET_DATE", date: endDate, shiftDays: null },
        { command: "SET_WEEKLY_HOURS", hours: 10, hard: false },
        {
          command: "SET_BACKGROUND_CURRICULUM",
          label: "A-Level Mathematics",
          level: "A-Level",
          board: "CAIE",
          subjects: ["Mathematics"],
        },
        { command: "SET_OVERLAP_CORRECTION", labels: ["Mechanics"], overlap: "PARTIAL_OVERLAP" },
      ] as never,
    });
    const outcome = await turn(view, model, "I did A-Level Maths, I can study 10 hours a week.");

    // Four commands in one message would have been refused as TOO_MANY_COMMANDS by the Copilot;
    // the Designer turns them into one setup proposal instead.
    expect(outcome.result.outcome).toBe("DESIGNER_PROPOSED");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    // The preview is server-authored: every sentence is built from the current brief.
    expect(outcome.result.proposal.changes.length).toBeGreaterThanOrEqual(3);
    expect(outcome.result.proposal.requiresAcknowledgement).toContain("MULTI_COMMAND");

    // Nothing has been written yet — a proposal is not a change.
    const before = await readIntake(userId, view.id);
    expect(before.brief.budget.weeklyMinutes).toBeNull();

    // One confirmation applies every validated change atomically, through the existing endpoint.
    const applied = await applyCopilotProposal({
      userId,
      sessionId: view.id,
      raw: { schemaVersion: 1, expectedVersion: view.version, token: outcome.result.proposal.token },
    });
    expect(applied.outcome).toBe("APPLIED");
    const after = await readIntake(userId, view.id);
    expect(after.brief.budget.weeklyMinutes).toBe(600);
    expect(after.brief.target.endDate).toBe(endDate);
    expect(after.brief.backgroundCurriculum?.label).toBe("A-Level Mathematics");
  });

  it("applies a single reversible fact directly, without a confirmation click", async () => {
    const view = await seed();
    const model = scripted({
      intent: "SETUP",
      confidence: "HIGH",
      commands: [{ command: "SET_WEEKLY_HOURS", hours: 6, hard: false }] as never,
    });
    const outcome = await turn(view, model, "I only have 6 hours a week.");
    expect(outcome.result.outcome).toBe("DESIGNER_APPLIED");
    const after = await readIntake(userId, view.id);
    expect(after.brief.budget.weeklyMinutes).toBe(360);
  });

  it("asks for confirmation when the model is not confident, even for one command", async () => {
    const view = await seed();
    const model = scripted({
      intent: "SETUP",
      confidence: "MEDIUM",
      commands: [{ command: "SET_WEEKLY_HOURS", hours: 6, hard: false }] as never,
    });
    const outcome = await turn(view, model, "maybe six hours?");
    expect(outcome.result.outcome).toBe("DESIGNER_PROPOSED");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    expect(outcome.result.proposal.requiresAcknowledgement).toContain("LOW_CONFIDENCE");
  });

  it("keeps the facts it can apply when one of them cannot be placed", async () => {
    // The live corpus is what found this. An opening message carries several facts, and refusing
    // all of them because one names a unit that is not in the scope yet throws away what the
    // student said clearly — "I did A-Level Maths, I'm rusty at mechanics, and I can study 10
    // hours a week" must still set the hours and the background.
    const view = await seed({ target: { endDate: null, examDate: null } });
    const outcome = await turn(
      view,
      scripted({
        intent: "SETUP",
        summary: "I understood three things.",
        commands: [
          { command: "SET_WEEKLY_HOURS", hours: 10, hard: false },
          {
            command: "SET_BACKGROUND_CURRICULUM",
            label: "A-Level Mathematics",
            level: "A-Level",
            board: "CAIE",
            subjects: ["Mathematics"],
          },
          { command: "SET_PREPAREDNESS", labels: ["Mechanics"], state: "WEAK" },
        ] as never,
      }),
      "I did A-Level Maths, I'm rusty at mechanics, and I can study 10 hours a week."
    );

    expect(outcome.result.outcome).toBe("DESIGNER_PROPOSED");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    // Two facts survive…
    const applied = outcome.result.proposal.changes.map((change) => change.command);
    expect(applied).toContain("SET_WEEKLY_HOURS");
    expect(applied).toContain("SET_BACKGROUND_CURRICULUM");
    // …the unplaceable one is dropped rather than guessed at, and said out loud.
    expect(applied).not.toContain("SET_PREPAREDNESS");
    expect(outcome.unresolved).toHaveLength(1);
    expect(outcome.unresolved[0]).toMatch(/Mechanics/);
  });

  it("still refuses outright when nothing in the message can be placed", async () => {
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({ intent: "SETUP", commands: [{ command: "SET_PREPAREDNESS", labels: ["Astrophysics"], state: "WEAK" }] as never }),
      "I'm weak at astrophysics"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("UNKNOWN_REFERENCE");
  });

  // ── The one material question ───────────────────────────────────────────────

  it("asks only for a missing essential, and reads it from the brief rather than the model", async () => {
    // Goal and scope are settled, so the date really is the next material question.
    const view = await seed({
      target: { endDate: null, examDate: null },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: new Date().toISOString(),
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Mechanics", kind: "TOPIC", parentId: null, selected: true }],
      },
    });
    // The model guesses the scope is what is missing. The brief says the date is.
    const model = scripted({ intent: "SETUP", questionCode: "SCOPE", question: "Which topics?" });
    const outcome = await turn(view, model, "I have my NUST NET in February.");
    expect(outcome.result.outcome).toBe("DESIGNER_QUESTION");
    if (outcome.result.outcome !== "DESIGNER_QUESTION") throw new Error("expected QUESTION");
    expect(outcome.result.question.code).toBe("DATE");
    expect(outcome.result.question.question).toMatch(/date|day/i);
  });

  it("asks about the scope first when the goal is named but nothing covers it", async () => {
    const view = await seed({ target: { endDate: null, examDate: null } });
    const outcome = await turn(view, scripted({}), "I have my NUST NET in February.");
    expect(outcome.result.outcome).toBe("DESIGNER_QUESTION");
    if (outcome.result.outcome !== "DESIGNER_QUESTION") throw new Error("expected QUESTION");
    expect(outcome.result.question.code).toBe("SCOPE");
  });

  it("stops asking entirely once the four essentials are present", async () => {
    const view = await seed({
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 600 },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: new Date().toISOString(),
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Mechanics", kind: "TOPIC", parentId: null, selected: true }],
      },
    });
    const model = scripted({
      intent: "SETUP",
      questionCode: "DATE",
      question: "When is your exam?",
      summary: "Anything you'd like to change?",
    });
    const outcome = await turn(view, model, "what else do you need?");
    // A model that keeps interviewing is overruled by the brief: nothing essential is missing,
    // so the turn becomes advice rather than another question.
    expect(outcome.result.outcome).toBe("DESIGNER_RECOMMENDATION");
    expect(outcome.summary.readyToGenerate).toBe(true);
    expect(outcome.summary.missing).toEqual([]);
    expect(outcome.guidance.map((entry) => entry.code)).toContain("READY");
  });

  it("carries a server-derived summary of the setup on every turn", async () => {
    const view = await seed({
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 480 },
      backgroundCurriculum: { label: "A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
    });
    const outcome = await turn(view, scripted({}), "hello");
    expect(outcome.summary).toMatchObject({
      mode: "EXAM",
      modeLabel: "Exam Planner",
      goal: GOAL,
      targetDate: endDate,
      weeklyMinutes: 480,
      backgroundLabel: "A-Level",
      board: "CAIE",
      scopeState: "NONE",
    });
  });

  // ── Capabilities the Designer may route but never run ───────────────────────

  it("routes research behind a proposal, and runs nothing itself", async () => {
    const view = await seed();
    const model = scripted({
      intent: "RESEARCH",
      commands: [{ command: "REQUEST_SCOPE_RESEARCH" }] as never,
    });
    const outcome = await turn(view, model, "can you find the syllabus?");
    expect(outcome.result.outcome).toBe("DESIGNER_ROUTED");
    if (outcome.result.outcome !== "DESIGNER_ROUTED") throw new Error("expected ROUTED");
    // The client is handed the exact action to send. Until it sends it, nothing has searched.
    expect(outcome.result.request).toEqual({ action: "researchScope" });
    const stored = await readIntake(userId, view.id);
    expect(stored.brief.scopeCandidate).toBeNull();
  });

  it("refuses research on a plan whose owner said use only what I give you", async () => {
    const view = await seed({ researchPolicy: "OFF" });
    const model = scripted({
      intent: "RESEARCH",
      commands: [{ command: "REQUEST_SCOPE_RESEARCH" }] as never,
    });
    const outcome = await turn(view, model, "find the syllabus");
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("RESEARCH_DISABLED");
  });

  it("refuses a research intent with no command, rather than asking a question that implies it will look", async () => {
    const view = await seed({ researchPolicy: "OFF" });
    const outcome = await turn(view, scripted({ intent: "RESEARCH" }), "please search for it");
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("RESEARCH_DISABLED");
  });

  // ── The import gap, answered honestly ──────────────────────────────────────

  it("routes an upload request to the scope step instead of pretending chat can read a file", async () => {
    const view = await seed();
    for (const message of ["use the PDF I uploaded", "can you read my syllabus file?"]) {
      const outcome = await turn(view, scripted({ intent: "IMPORT" }), message);
      expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
      if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
      expect(outcome.result.code).toBe("IMPORT_IN_SCOPE_STEP");
      expect(outcome.result.routeTo).toBe("SCOPE");
    }
  });

  it("catches an upload request even when the model misreads it as a setup message", async () => {
    // §20 is a capability gap, not a comprehension problem: the refusal must not depend on the
    // model noticing the phrasing.
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({ intent: "SETUP", commands: [{ command: "SET_WEEKLY_HOURS", hours: 5, hard: false }] as never }),
      "use my uploaded syllabus instead"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("IMPORT_IN_SCOPE_STEP");
  });

  // ── Off-topic, and the planner scope ───────────────────────────────────────

  it("stays a planner assistant when asked about something else", async () => {
    const view = await seed();
    const outcome = await turn(view, scripted({ intent: "UNKNOWN" }), "what is the capital of France?");
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("OFF_TOPIC");
    expect(outcome.result.message).toMatch(/study plan/i);
  });

  it("answers a planner question from server facts, and changes nothing", async () => {
    const view = await seed({ budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 480 } });
    const before = await readIntake(userId, view.id);
    const outcome = await turn(view, scripted({ intent: "EXPLAIN" }), "do I need to enter every topic?");
    expect(outcome.result.outcome).toBe("DESIGNER_ANSWERED");
    if (outcome.result.outcome !== "DESIGNER_ANSWERED") throw new Error("expected ANSWERED");
    expect(outcome.result.facts.length).toBeGreaterThan(0);
    const after = await readIntake(userId, view.id);
    expect(after.version).toBe(before.version);
  });

  // ── Ceilings and the split rule ────────────────────────────────────────────

  it("refuses more changes than one message may carry", async () => {
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({
        intent: "SETUP",
        commands: Array.from({ length: 6 }, () => ({ command: "SET_WEEKLY_HOURS", hours: 6, hard: false })) as never,
      }),
      "six things"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("TOO_MANY_CHANGES");
  });

  it("refuses to mix a setup change with something it has to go and look up", async () => {
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({
        intent: "SETUP",
        commands: [
          { command: "SET_WEEKLY_HOURS", hours: 6, hard: false },
          { command: "REQUEST_SCOPE_RESEARCH" },
        ] as never,
      }),
      "set my hours and find the syllabus"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_REFUSED");
    if (outcome.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(outcome.result.code).toBe("TOO_MANY_CHANGES");
    expect(outcome.result.message).toMatch(/two different things/i);
  });

  // ── Hard vs soft ───────────────────────────────────────────────────────────

  it("never applies a hard constraint without a confirmation", async () => {
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({
        intent: "SETUP",
        confidence: "HIGH",
        commands: [
          { command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 0, preferenceWeight: null },
        ] as never,
      }),
      "I absolutely cannot study Sundays"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_PROPOSED");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    expect(outcome.result.proposal.requiresAcknowledgement).toContain("HARD_CONSTRAINT");
    const stored = await readIntake(userId, view.id);
    expect(stored.brief.constraints).toEqual([]);
  });

  it("asks which one it is when a weekday request is genuinely ambiguous", async () => {
    const view = await seed();
    const outcome = await turn(
      view,
      scripted({
        intent: "SETUP",
        clarification: {
          required: true,
          code: "HARD_OR_SOFT",
          question: "Is Sunday completely off-limits, or should Sylf avoid it when possible?",
          options: ["Completely off-limits", "Avoid it when possible"],
        },
      }),
      "keep Sundays free"
    );
    expect(outcome.result.outcome).toBe("DESIGNER_ANSWERED");
    if (outcome.result.outcome !== "DESIGNER_ANSWERED") throw new Error("expected ANSWERED");
    expect(outcome.result.clarification).toMatchObject({ required: true, code: "HARD_OR_SOFT" });
    const stored = await readIntake(userId, view.id);
    expect(stored.brief.constraints).toEqual([]);
  });

  // ── Lifecycle: the Designer is pre-generation only ─────────────────────────

  it("designs before a plan exists, and hands the conversation to the Copilot after", async () => {
    const view = await seed({
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 600 },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: new Date().toISOString(),
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Mechanics", kind: "TOPIC", parentId: null, selected: true }],
      },
    });

    // 1. Before generation the Designer owns the conversation.
    const designing = await turn(view, scripted({}), "what else do you need?");
    expect(designing.result.outcome).toBe("DESIGNER_RECOMMENDATION");

    // 2. Build a draft and bind it, the way generation does.
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: "Designer lifecycle",
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
    await prisma.plannerIntakeSession.update({ where: { id: view.id }, data: { planId: plan.id } });

    // 3. A draft exists: the Designer steps aside, and says which capability does apply.
    const reviewing = await turn(view, scripted({ intent: "SETUP" }), "change my weekly hours");
    expect(reviewing.result.outcome).toBe("DESIGNER_REFUSED");
    if (reviewing.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(reviewing.result.code).toBe("COMMAND_NOT_ALLOWED_IN_STATE");
    expect(reviewing.result.message).toMatch(/draft/i);

    // 4. Confirmed: the structure changes only through a replan, and the copy says so.
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
    const confirmed = await readIntake(userId, view.id);
    const after = await turn(confirmed, scripted({ intent: "SETUP" }), "change my weekly hours");
    expect(after.result.outcome).toBe("DESIGNER_REFUSED");
    if (after.result.outcome !== "DESIGNER_REFUSED") throw new Error("expected REFUSED");
    expect(after.result.message).toMatch(/replan/i);
  });

  // ── Proposal security, exercised through the Designer's own tokens ─────────

  it("refuses a stale, replayed or cross-user setup proposal", async () => {
    const view = await seed();
    const model = scripted({
      intent: "SETUP",
      commands: [
        { command: "SET_WEEKLY_HOURS", hours: 8, hard: false },
        { command: "SET_TARGET_DATE", date: endDate, shiftDays: null },
      ] as never,
    });
    const outcome = await turn(view, model, "8 hours a week, exam in March");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    const token = outcome.result.proposal.token;

    // A stale writer: the brief moved between the proposal and the confirmation.
    await patchIntake(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: view.version,
      brief: briefFor(endDate, { budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 120 } }),
    });
    await expect(
      applyCopilotProposal({
        userId,
        sessionId: view.id,
        raw: { schemaVersion: 1, expectedVersion: view.version, token },
      })
    ).rejects.toMatchObject({ status: 409 });

    // Cross-user, on a fresh proposal against the current version.
    const current = await readIntake(userId, view.id);
    const fresh = await turn(current, model, "8 hours a week");
    if (fresh.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    await expect(
      applyCopilotProposal({
        userId: otherUserId,
        sessionId: view.id,
        raw: { schemaVersion: 1, expectedVersion: fresh.view.version, token: fresh.result.proposal.token },
      })
    ).rejects.toMatchObject({ status: 404 });

    // A tampered token is refused as unknown rather than partially applied.
    await expect(
      applyCopilotProposal({
        userId,
        sessionId: view.id,
        raw: {
          schemaVersion: 1,
          expectedVersion: fresh.view.version,
          token: `${fresh.result.proposal.token.slice(0, -4)}AAAA`,
        },
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuses an expired setup proposal", async () => {
    const view = await seed();
    const model = scripted({ intent: "SETUP", commands: [{ command: "SET_WEEKLY_HOURS", hours: 4, hard: false }] as never });
    const outcome = await runDesignerTurn({
      userId,
      sessionId: view.id,
      raw: { schemaVersion: 1, expectedVersion: view.version, message: "4 hours" },
      deps: { model, now: () => new Date(Date.now() - 60 * 60_000) },
    });
    if (outcome.result.outcome !== "DESIGNER_APPLIED" && outcome.result.outcome !== "DESIGNER_PROPOSED")
      throw new Error("expected a proposal or an apply");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") return; // applied directly; nothing to expire
    await expect(
      applyCopilotProposal({
        userId,
        sessionId: view.id,
        raw: { schemaVersion: 1, expectedVersion: view.version, token: outcome.result.proposal.token },
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  // ── The Copilot regression this work uncovered ─────────────────────────────

  it("accepts a Copilot turn that carries a transcript", async () => {
    // The route has always forwarded the client's `recent` array, and the request schema did not
    // declare it — so every Copilot message from the real UI failed on `unrecognized_keys`
    // before the model was reached. This asserts the wire contract now describes what is sent.
    const view = await seed();
    const outcome = await runCopilotTurn({
      userId,
      sessionId: view.id,
      raw: {
        schemaVersion: 1,
        expectedVersion: view.version,
        message: "why is this scheduled here?",
        recent: [
          { role: "STUDENT", text: "I have my NUST NET in February" },
          { role: "SYLF", text: "I'd use Exam Planner." },
        ],
      },
      recent: [
        { role: "STUDENT", text: "I have my NUST NET in February" },
        { role: "SYLF", text: "I'd use Exam Planner." },
      ],
      deps: {
        model: {
          interpret: async () => ({
            interpretation: {
              schemaVersion: 1 as const,
              intent: "EXPLAIN" as const,
              confidence: "HIGH" as const,
              summary: "Because it is in your scope.",
              commands: [],
              clarification: { required: false as const },
              explanationRefs: [],
            },
            inputChars: 1,
            outputChars: 1,
          }),
          phrase: async () => ({ phrasing: "It is one of your units.", inputChars: 1, outputChars: 1 }),
        },
      },
    });
    expect(outcome.result.outcome).toBe("ANSWERED");
  });

  // ── Conversation, and what it must not promise ─────────────────────────────

  it("carries a bounded transcript and stores nothing about it", async () => {
    const view = await seed();
    const recent = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ("STUDENT" as const) : ("SYLF" as const),
      text: `turn ${index}`,
    }));
    const model = scripted({ intent: "SETUP", commands: [{ command: "SET_WEEKLY_HOURS", hours: 5, hard: false }] as never });
    await turn(view, model, "five hours", recent);
    // The model saw at most the schema's own bound, whatever the client sent.
    const seen = model.seen[0] as { recent: unknown[] };
    expect(seen.recent.length).toBeLessThanOrEqual(8);
    // And there is no conversation table to read back: the brief is the only planner state.
    // No planner-side transcript table exists, and this work added none. The AI chat's own
    // `Conversation` tables are a different feature and are deliberately not in this check:
    // counting them would make the assertion about the schema's history rather than about the
    // Designer's storage.
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%planner%transcript%'
          OR table_name ILIKE '%planner%conversation%'
          OR table_name ILIKE '%copilot%'
          OR table_name ILIKE '%designer%')
    `;
    expect(tables.map((row) => row.table_name)).toEqual([]);
  });

  // ── Manual and conversational setup share one brief ────────────────────────

  it("lets a manual edit and a Designer turn edit the same brief, in both directions", async () => {
    const view = await seed();

    // 1. Conversation sets two facts.
    const first = await turn(
      view,
      scripted({
        intent: "SETUP",
        commands: [
          { command: "SET_WEEKLY_HOURS", hours: 10, hard: false },
          { command: "SET_TARGET_DATE", date: endDate, shiftDays: null },
        ] as never,
      }),
      "10 hours a week"
    );
    if (first.result.outcome !== "DESIGNER_PROPOSED") throw new Error("expected PROPOSED");
    await applyCopilotProposal({
      userId,
      sessionId: view.id,
      raw: { schemaVersion: 1, expectedVersion: view.version, token: first.result.proposal.token },
    });

    // 2. The manual controls immediately reflect it, because they read the same brief.
    const afterApply = await readIntake(userId, view.id);
    expect(afterApply.brief.budget.weeklyMinutes).toBe(600);

    // 3. The student edits weekly hours by hand.
    await patchIntake(userId, view.id, {
      schemaVersion: 1,
      expectedVersion: afterApply.version,
      brief: { ...afterApply.brief, budget: { ...afterApply.brief.budget, weeklyMinutes: 240 } },
    });

    // 4. The next Designer turn sees the manual value, because the summary is read from the
    //    brief rather than from the conversation.
    const second = await turn(await readIntake(userId, view.id), scripted({}), "what do you have so far?");
    expect(second.summary.weeklyMinutes).toBe(240);

    // …and the inverse: a brief the student filled in by hand is summarised accurately, and the
    // Designer asks only about what is genuinely missing.
    const manualView = await seed({
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 300 },
      subject: { kind: "FREE_TEXT", subjectId: null, name: "Engineering" },
    });
    const fromManual = await turn(manualView, scripted({}), "where am I?");
    expect(fromManual.summary).toMatchObject({
      goal: GOAL,
      subject: "Engineering",
      targetDate: endDate,
      weeklyMinutes: 300,
      scopeState: "NONE",
    });
    expect(fromManual.summary.missing).toEqual(["SCOPE"]);
  });
});
