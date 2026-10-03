// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { briefReadiness } from "@/lib/planner/intake/readiness";
import { mapCommands, DIRECT_EXECUTION_COMMANDS } from "@/lib/planner/copilot/map";
import { COPILOT_LIMITS, CopilotTurnRequestSchema } from "@/lib/planner/copilot/contracts";
import { mintProposal, readProposal } from "@/lib/planner/copilot/proposal";
import {
  DesignerIntentSchema,
  DesignerQuestionCodeSchema,
  DesignerRefusalCodeSchema,
  DESIGNER_GUIDANCE_CODES,
  PlannerDesignerInterpretationV1Schema,
  type DesignerQuestionCode,
} from "@/lib/planner/designer/contracts";
import {
  daysUntil,
  designerGuidance,
  designerGuidanceIsAdvisory,
  designerSummary,
  isBroadGoal,
  missingEssentials,
  modeRecommendation,
  modeSwitchable,
  questionFor,
} from "@/lib/planner/designer/project";
import { looksLikeImportRequest } from "@/lib/planner/designer/run";

/**
 * The Plan Designer's decision layer, tested without a model and without a database.
 *
 * Everything here is a pure function of the Plan Brief, which is the point of the design: the
 * *choices* that matter — which question is material, whether the mode may change, what counts
 * as advice rather than a gate — are made by the server from state, not by a model from prose.
 * A pure function can be asserted exactly, so §43's zero-tolerance claims (never invent a
 * preparedness, never turn a preference into a rule, never ask for an optional field) are held
 * by tests here rather than by prompt wording.
 *
 * The model's own behaviour is measured separately, in the opt-in corpus.
 */

const brief = (over: Partial<PlanBriefV1> = {}): PlanBriefV1 => ({
  ...emptyBrief("EXAM"),
  ...over,
});

const withGoal = (title: string, over: Partial<PlanBriefV1> = {}): PlanBriefV1 =>
  brief({ ...over, goal: { title } });

const readinessOf = (b: PlanBriefV1) => briefReadiness(b, { scheduleWeeklyMinutes: null });

const codesOf = (b: PlanBriefV1): DesignerQuestionCode[] => missingEssentials(readinessOf(b));

describe("the four essentials, and nothing else", () => {
  it("asks for the goal first when the brief is empty", () => {
    expect(codesOf(brief())).toEqual(["GOAL", "SCOPE", "DATE", "WEEKLY_TIME"]);
  });

  it("moves to the next essential as each is answered, in the student's own priority order", () => {
    expect(codesOf(withGoal("Biology mock exam"))).toEqual(["SCOPE", "DATE", "WEEKLY_TIME"]);

    const scoped = withGoal("Biology mock exam", {
      scope: {
        source: "USER_MANUAL",
        confirmedAt: "2030-01-01T00:00:00.000Z",
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Cells", kind: "TOPIC", parentId: null, selected: true }],
      },
    });
    expect(codesOf(scoped)).toEqual(["DATE", "WEEKLY_TIME"]);

    const dated: PlanBriefV1 = { ...scoped, target: { endDate: "2030-06-01", examDate: "2030-06-01" } };
    expect(codesOf(dated)).toEqual(["WEEKLY_TIME"]);

    const timed: PlanBriefV1 = { ...dated, budget: { ...dated.budget, weeklyMinutes: 480 } };
    expect(codesOf(timed)).toEqual([]);
  });

  it("never invents a fifth thing to ask for", () => {
    // The closed vocabulary is the guarantee: there is no code for board, level, background,
    // preparedness, difficulty, priority, session length or preferences, so the Designer cannot
    // interrogate the student about an optional refinement even if it wanted to.
    expect(DesignerQuestionCodeSchema.options).toEqual(["GOAL", "SCOPE", "DATE", "WEEKLY_TIME"]);
  });

  it("asks for the scope when a candidate is waiting rather than pretending nothing exists", () => {
    // `SCOPE_UNCONFIRMED` is not `SCOPE_MISSING`: the student has something to review, and
    // collapsing the two would lose the distinction that decides which control to offer.
    const withCandidate = withGoal("CAIE A Level Mathematics 9709", {
      scopeCandidate: {
        version: 1,
        origin: "RESEARCH",
        status: "OK",
        confidence: "HIGH",
        briefDigest: "d".repeat(32),
        retrievedAt: "2030-01-01T00:00:00.000Z",
        provider: "deepseek-search",
        cacheKey: "k",
        depth: "STANDARD",
        nodes: [{ nodeId: "r-algebra", label: "Algebra", kind: "CHAPTER", parentId: null, selected: true }],
        sources: [],
        openQuestions: [],
        failureCode: null,
        summary: "One unit.",
      },
    });
    expect(codesOf(withCandidate)).toEqual(["SCOPE", "DATE", "WEEKLY_TIME"]);
    expect(designerSummary({ brief: withCandidate, readiness: readinessOf(withCandidate) }).scopeState).toBe(
      "CANDIDATE"
    );
  });
});

describe("one question at a time, and only when it is material", () => {
  it("takes the model's wording when it names the essential the server agrees is missing", () => {
    const question = questionFor({
      missing: ["DATE"],
      modelCode: "DATE",
      modelQuestion: "What's the exact test date?",
      modelOptions: null,
    });
    expect(question).toEqual({ code: "DATE", question: "What's the exact test date?", options: [] });
  });

  it("corrects a model that asks about the wrong thing rather than obeying it", () => {
    // The model wanted to ask about the date while the goal is still empty. The server asks
    // about the goal. This is the whole of §15 in one assertion.
    const question = questionFor({
      missing: ["GOAL", "SCOPE", "DATE", "WEEKLY_TIME"],
      modelCode: "DATE",
      modelQuestion: "What's the exact test date?",
      modelOptions: null,
    });
    expect(question?.code).toBe("GOAL");
    expect(question?.question).toBe("What are you preparing for?");
  });

  it("asks anyway when the model offers no question at all", () => {
    const question = questionFor({
      missing: ["WEEKLY_TIME"],
      modelCode: null,
      modelQuestion: null,
      modelOptions: null,
    });
    expect(question?.code).toBe("WEEKLY_TIME");
    expect(question?.question).toMatch(/how much time/i);
  });

  it("asks nothing once the four essentials are present", () => {
    // `missing` empty is the *only* condition under which no question is asked, and it is read
    // from readiness — so a model that keeps interrogating about optional detail is overruled
    // by the brief itself.
    const done = brief({
      goal: { title: "Biology mock exam" },
      target: { endDate: "2030-06-01", examDate: "2030-06-01" },
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 300 },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: "2030-01-01T00:00:00.000Z",
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Cells", kind: "TOPIC", parentId: null, selected: true }],
      },
    });
    expect(
      questionFor({
        missing: missingEssentials(readinessOf(done)),
        modelCode: "DATE",
        modelQuestion: "When is your exam?",
        modelOptions: null,
      })
    ).toBeNull();
  });

  it("caps the options it will offer for one question", () => {
    const question = questionFor({
      missing: ["DATE"],
      modelCode: "DATE",
      modelQuestion: "When is it?",
      modelOptions: ["a", "b", "c", "d", "e", "f"],
    });
    expect(question?.options).toHaveLength(COPILOT_LIMITS.clarificationOptions);
  });
});

describe("the mode recommendation is reported, never taken", () => {
  it("names the mode and says whether it could be switched to", () => {
    // A Roadmap session being told Exam fits — the only case where a recommendation is news.
    const recommendation = modeRecommendation({
      brief: brief({ mode: "ROADMAP" }),
      mode: "EXAM",
      reason: "you named one exam and a date",
    });
    expect(recommendation?.mode).toBe("EXAM");
    expect(recommendation?.text).toContain("Exam Planner");
    expect(recommendation?.text).toContain("you named one exam and a date");
    expect(recommendation?.switchable).toBe(true);
  });

  it("reports that the switch is unavailable once the brief has started", () => {
    // `setMode` replaces the whole brief with an empty one and refuses with MODE_LOCKED once a
    // goal, a scope or any preparedness exists. Reporting that is what stops the frontend
    // offering a button that would reset the student's work.
    const started = withGoal("Biology mock exam");
    expect(modeSwitchable(started)).toBe(false);
    const recommendation = modeRecommendation({ brief: started, mode: "ROADMAP", reason: null });
    expect(recommendation?.switchable).toBe(false);
  });

  it("says nothing when the recommended mode is the one already in use", () => {
    expect(modeRecommendation({ brief: brief(), mode: "EXAM", reason: "x" })).toBeNull();
    expect(modeRecommendation({ brief: brief({ mode: "ROADMAP" }), mode: null, reason: null })).toBeNull();
  });

  it("carries no mode-switching command at all", () => {
    // There is no SET_MODE in the command vocabulary, and there must not be: mode switching
    // destroys the brief, so folding it into a setup proposal would wipe the very fields the
    // proposal was setting. The recommendation is typed state the frontend renders as a choice.
    const mapped = mapCommands({
      brief: brief(),
      today: "2030-01-01",
      commands: [],
    });
    expect(mapped.commands).toEqual([]);
    const interpretation = PlannerDesignerInterpretationV1Schema.safeParse({
      schemaVersion: 1,
      intent: "MODE",
      confidence: "HIGH",
      summary: "x",
      questionCode: null,
      question: null,
      questionOptions: null,
      recommendedMode: "ROADMAP",
      modeReason: null,
      commands: [{ command: "SET_MODE", mode: "ROADMAP" }],
      clarification: { required: false },
      explanationRefs: [],
    });
    // An invented mode-switching command is not merely ignored: the turn fails its schema.
    expect(interpretation.success).toBe(false);
  });
});

describe("natural language becomes the planner's existing structures", () => {
  const today = "2030-01-01";

  /**
   * A brief that already has a scope.
   *
   * Units are what a label resolves *against*, and resolving to nothing is a refusal rather than
   * a guess — so a preparedness or priority command can only be tested on a brief that has
   * something to point at. The empty-brief case is asserted separately below, because "it
   * refuses rather than inventing a unit" is itself the property worth holding.
   */
  const scopedBrief = (): PlanBriefV1 =>
    brief({
      goal: { title: "CAIE A Level Mathematics 9709" },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: "2030-01-01T00:00:00.000Z",
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [
          { nodeId: "u1", label: "Mechanics", kind: "TOPIC", parentId: null, selected: true },
          { nodeId: "u2", label: "Calculus", kind: "TOPIC", parentId: null, selected: true },
        ],
      },
    });

  const map = (command: unknown) =>
    mapCommands({ brief: scopedBrief(), today, commands: [command] as never });

  it("turns hours into the weekly target, not a cap", () => {
    const mapped = map({ command: "SET_WEEKLY_HOURS", hours: 8, hard: false });
    expect(mapped.commands[0]).toMatchObject({ kind: "ACTION", action: { action: "setWeeklyBudget", weeklyMinutes: 480 } });
    expect(mapped.preview[0].consequence).toMatch(/8/);
    // A target is directly applicable: one reversible change the student could have made by hand.
    expect(DIRECT_EXECUTION_COMMANDS).toContain("SET_WEEKLY_HOURS");
  });

  it("turns stated weakness into preparedness — and only because the student said it", () => {
    const mapped = map({ command: "SET_PREPAREDNESS", labels: ["Mechanics"], state: "WEAK" });
    expect(mapped.commands[0]).toMatchObject({
      kind: "ACTION",
      action: { action: "bulkSetPreparedness", nodeIds: ["u1"], state: "WEAK" },
    });
  });

  it("keeps background curriculum and preparedness on different actions", () => {
    // §23/§24: "I did A-Level Physics" is what they covered; "I'm weak at physics" is how well
    // they know it. The two must never collapse into one action, and they do not.
    const background = map({
      command: "SET_BACKGROUND_CURRICULUM",
      label: "IGCSE Mathematics",
      level: "IGCSE",
      board: "CAIE",
      subjects: ["Mathematics"],
    });
    const preparedness = map({ command: "SET_PREPAREDNESS", labels: ["Mechanics"], state: "WEAK" });
    const backgroundAction = background.commands[0];
    const preparednessAction = preparedness.commands[0];
    expect(backgroundAction).toMatchObject({
      kind: "ACTION",
      action: { action: "setBackgroundCurriculum", label: "IGCSE Mathematics" },
    });
    expect(preparednessAction).toMatchObject({
      kind: "ACTION",
      action: { action: "bulkSetPreparedness", state: "WEAK" },
    });
    expect(backgroundAction).not.toEqual(preparednessAction);
  });

  it("turns a stated priority into priority, and never infers one", () => {
    const mapped = map({ command: "SET_PRIORITY", labels: ["Calculus"], priority: "HIGH" });
    expect(mapped.commands[0]).toMatchObject({ kind: "ACTION", action: { action: "setPriority" } });
  });

  it("turns manual topics into scope units", () => {
    const mapped = map({ command: "UPDATE_SCOPE", add: [{ label: "Integration" }], remove: [], rename: [] });
    expect(mapped.commands[0]).toMatchObject({ kind: "ACTION", action: { action: "updateScopeUnits" } });
  });

  it("demands a confirmation for a hard constraint, and asks which one it is when ambiguous", () => {
    const hard = map({
      command: "SET_CONSTRAINT",
      kind: "UNAVAILABLE_WEEKDAY",
      strength: "HARD",
      value: 0,
      preferenceWeight: null,
    });
    // A hard rule is never applied silently — this is the code the frontend shows as the reason.
    expect(hard.requires).toContain("HARD_CONSTRAINT");
    expect(DIRECT_EXECUTION_COMMANDS).not.toContain("SET_CONSTRAINT");

    const soft = map({
      command: "SET_CONSTRAINT",
      kind: "EVEN_SPREAD_PREFERENCE",
      strength: "SOFT",
      value: 1,
      preferenceWeight: null,
    });
    expect(soft.requires).not.toContain("HARD_CONSTRAINT");
  });

  it("refuses to invent a unit it cannot resolve, rather than guessing", () => {
    const mapped = map({ command: "SET_PREPAREDNESS", labels: ["Astrophysics"], state: "WEAK" });
    expect(mapped.commands[0].kind).toBe("REFUSED");
    // …and the same on a brief with no scope at all: there is nothing to resolve against, so
    // every label-bearing command is refused rather than applied to a unit that does not exist.
    const onEmpty = mapCommands({
      brief: brief(),
      today,
      commands: [{ command: "SET_PREPAREDNESS", labels: ["Mechanics"], state: "WEAK" }] as never,
    });
    expect(onEmpty.commands[0].kind).toBe("REFUSED");
  });
});

describe("research is requested, never performed", () => {
  it("maps a research request to a routed capability rather than an action", () => {
    // The Designer may *ask* for research; the Phase 3 engine owns everything that happens
    // next. A CAPABILITY here — never an ACTION — is what keeps the two apart.
    const mapped = mapCommands({
      brief: brief(),
      today: "2030-01-01",
      commands: [{ command: "REQUEST_SCOPE_RESEARCH" }] as never,
    });
    expect(mapped.commands[0]).toMatchObject({ kind: "CAPABILITY", capability: "RESEARCH" });
  });

  it("has no command that could generate a plan", () => {
    // §8: the Designer designs. Generation is the existing engine's job, and there is no
    // vocabulary here for invoking it.
    const names = PlannerDesignerInterpretationV1Schema.shape.commands.element.options.map(
      (option) => option.shape.command.value
    );
    for (const forbidden of ["GENERATE", "REQUEST_GENERATION", "GENERATE_PLAN", "CONFIRM_PLAN"])
      expect(names).not.toContain(forbidden);
  });
});

describe("advice is never a gate", () => {
  const guide = (b: PlanBriefV1, researchConfigured = true) =>
    designerGuidance({
      brief: b,
      summary: designerSummary({ brief: b, readiness: readinessOf(b) }),
      researchConfigured,
      today: "2030-01-01",
    });

  it("says every code is advisory", () => {
    expect(designerGuidanceIsAdvisory()).toBe(true);
    expect(DESIGNER_GUIDANCE_CODES.length).toBeGreaterThan(0);
  });

  it("offers research when nothing covers the scope yet", () => {
    const codes = guide(withGoal("CAIE A Level Mathematics 9709")).map((entry) => entry.code);
    expect(codes).toContain("RESEARCH_AVAILABLE");
  });

  it("suggests typing instead of searching for a single unit", () => {
    const mastery = brief({ mode: "MASTERY", goal: { title: "Master Integration" } });
    const codes = guide(mastery).map((entry) => entry.code);
    expect(codes).toContain("MANUAL_SCOPE_FASTER");
    expect(codes).not.toContain("RESEARCH_AVAILABLE");
  });

  it("raises board and level as a recommendation, never a requirement", () => {
    // The audit's finding: board and level are the highest-value optional fields because they
    // are what let Sylf call a source official. High value is not the same as required.
    const codes = guide(withGoal("CAIE A Level Mathematics 9709")).map((entry) => entry.code);
    expect(codes).toContain("BOARD_HELPS");
    const readiness = readinessOf(withGoal("CAIE A Level Mathematics 9709"));
    expect(readiness.canGenerate).toBe(false); // still missing scope/date/time, but…
    expect(readiness.missing).not.toContain("BACKGROUND_CURRICULUM" as never); // …never for this
  });

  it("warns about a dense schedule instead of refusing it", () => {
    const soon = brief({
      goal: { title: "Biology mock exam" },
      target: { endDate: "2030-01-11", examDate: "2030-01-11" },
    });
    const entries = guide(soon);
    const dense = entries.find((entry) => entry.code === "DENSE_SCHEDULE");
    expect(dense?.text).toMatch(/dense/i);
    // And the brief is still generatable once the other essentials are in: advice does not block.
    const complete: PlanBriefV1 = {
      ...soon,
      budget: { ...soon.budget, weeklyMinutes: 600 },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: "2030-01-01T00:00:00.000Z",
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Cells", kind: "TOPIC", parentId: null, selected: true }],
      },
    };
    expect(readinessOf(complete).canGenerate).toBe(true);
    expect(guide(complete).map((entry) => entry.code)).toContain("DENSE_SCHEDULE");
  });

  it("says nothing about looking things up when research is switched off", () => {
    const off = { ...withGoal("CAIE A Level Mathematics 9709"), researchPolicy: "OFF" as const };
    const codes = guide(off).map((entry) => entry.code);
    expect(codes).toContain("RESEARCH_OFF");
    expect(codes).not.toContain("RESEARCH_AVAILABLE");
    expect(codes).not.toContain("BOARD_HELPS");
  });

  it("confirms readiness rather than inventing something left to do", () => {
    const complete = brief({
      goal: { title: "Biology mock exam" },
      target: { endDate: "2030-06-01", examDate: "2030-06-01" },
      budget: { ...emptyBrief("EXAM").budget, weeklyMinutes: 300 },
      scope: {
        source: "USER_MANUAL",
        confirmedAt: "2030-01-01T00:00:00.000Z",
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [{ nodeId: "u1", label: "Cells", kind: "TOPIC", parentId: null, selected: true }],
      },
    });
    expect(guide(complete).map((entry) => entry.code)).toContain("READY");
  });
});

describe("a broad goal is offered guidance, not a refusal", () => {
  it.each([
    ["Maths", true],
    ["Physics", true],
    ["study maths", true],
    ["CAIE A Level Mathematics 9709", false],
    ["Biology mock exam", false],
    ["Chapter 7", false],
    ["Master Integration", true],
    ["University Calculus I", false],
  ])("reads %j as broad: %s", (goal, broad) => {
    expect(isBroadGoal(goal)).toBe(broad);
  });
});

describe("dates and imports", () => {
  it("measures whole days, and says nothing without a date", () => {
    expect(daysUntil("2030-01-01", "2030-01-11")).toBe(10);
    expect(daysUntil("2030-01-01", "2030-01-01")).toBe(0);
    expect(daysUntil("2030-01-01", null)).toBeNull();
  });

  it.each([
    "Use the PDF I uploaded",
    "can you read my syllabus file",
    "I attached the scan",
    "use my uploaded document instead",
    "please paste it for me",
  ])("recognises a document request: %j", (message) => {
    expect(looksLikeImportRequest(message)).toBe(true);
  });

  it.each([
    "I have my exam in May",
    "I can study 8 hours a week",
    "which planner should I use?",
    "I'm weak at mechanics",
    // The word "file" in a sentence about something else must not trigger the refusal.
    "I want to file this under revision",
  ])("does not mistake ordinary setup for a document request: %j", (message) => {
    expect(looksLikeImportRequest(message)).toBe(false);
  });
});

describe("the wire contract the frontend will code against", () => {
  it("accepts a bounded transcript, which is what the client has always sent", () => {
    // This was the live bug the Designer's work uncovered: the Copilot route forwarded the
    // client's `recent` array into a strict schema that did not declare it, so every request
    // carrying a transcript was refused with unrecognized_keys before the model was reached.
    const parsed = CopilotTurnRequestSchema.safeParse({
      schemaVersion: 1,
      expectedVersion: 3,
      message: "I have my NUST NET in February",
      recent: [
        { role: "STUDENT", text: "hi" },
        { role: "SYLF", text: "hello" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a longer transcript than the model window, and refuses an abusive one", () => {
    // A slightly-over transcript is truncated rather than rejected: the model's window is a
    // server-side guarantee, not a client-visible failure.
    const longer = CopilotTurnRequestSchema.safeParse({
      schemaVersion: 1,
      expectedVersion: 0,
      message: "x",
      recent: Array.from({ length: COPILOT_LIMITS.maxRecentTurns + 4 }, () => ({ role: "STUDENT", text: "x" })),
    });
    expect(longer.success).toBe(true);

    const abusive = CopilotTurnRequestSchema.safeParse({
      schemaVersion: 1,
      expectedVersion: 0,
      message: "x",
      recent: Array.from({ length: COPILOT_LIMITS.maxRecentTurns * 3 + 1 }, () => ({ role: "STUDENT", text: "x" })),
    });
    expect(abusive.success).toBe(false);
  });

  it("keeps the closed vocabularies closed", () => {
    expect(DesignerIntentSchema.safeParse("SETUP").success).toBe(true);
    expect(DesignerIntentSchema.safeParse("GENERATE").success).toBe(false);
    expect(DesignerRefusalCodeSchema.safeParse("IMPORT_IN_SCOPE_STEP").success).toBe(true);
    expect(DesignerRefusalCodeSchema.safeParse("WHATEVER").success).toBe(false);
  });
});

describe("a setup proposal is an ordinary signed proposal", () => {
  it("carries five validated changes in one token, and refuses a stale or foreign one", () => {
    const commands = [
      { command: "SET_TARGET_DATE", date: "2030-02-18", shiftDays: null },
      { command: "SET_WEEKLY_HOURS", hours: 10, hard: false },
      {
        command: "SET_BACKGROUND_CURRICULUM",
        label: "A-Level Mathematics",
        level: "A-Level",
        board: "CAIE",
        subjects: ["Mathematics"],
      },
      { command: "SET_PREPAREDNESS", labels: ["Mechanics"], state: "WEAK" },
      { command: "REQUEST_SCOPE_RESEARCH" },
    ] as never;
    const minted = mintProposal({
      sessionId: "session-1",
      expectedVersion: 7,
      intent: "SETUP",
      summary: "I understood five things.",
      commands,
    });

    // The commands travel inside the signed payload, so a client cannot rewrite them.
    const readBack = readProposal({ token: minted.token, sessionId: "session-1", expectedVersion: 7 });
    expect(readBack.commands).toHaveLength(5);

    // Stale, foreign and expired all fail, each with its own code.
    expect(() => readProposal({ token: minted.token, sessionId: "session-1", expectedVersion: 8 })).toThrow();
    expect(() => readProposal({ token: minted.token, sessionId: "session-2", expectedVersion: 7 })).toThrow();
    expect(() =>
      readProposal({
        token: minted.token,
        sessionId: "session-1",
        expectedVersion: 7,
        now: new Date(Date.parse(minted.expiresAt) + 1_000),
      })
    ).toThrow();
  });
});
