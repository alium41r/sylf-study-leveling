// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  COPILOT_CLARIFICATION_CODES,
  COPILOT_LIMITS,
  PlannerCopilotInterpretationV1Schema,
  type CopilotCommand,
} from "@/lib/planner/copilot/contracts";
import { COPILOT_INTENT_LIFECYCLE } from "@/lib/planner/copilot/outcomes";
import { DIRECT_EXECUTION_COMMANDS, mapCommands, resolveUnitLabels } from "@/lib/planner/copilot/map";
import { explanationFacts } from "@/lib/planner/copilot/explain";
import { buildCopilotContext } from "@/lib/planner/copilot/context";
import { mintProposal, readProposal } from "@/lib/planner/copilot/proposal";
import { emptyBrief, PlanBriefV1Schema, type PlanBriefV1, type ScopeNode } from "@/lib/planner/intake/brief";

/**
 * The Copilot's contract, asserted where it can be asserted deterministically.
 *
 * These are **model-stub tests**: for each sentence a student might say, the stub returns the
 * interpretation a correct model would return, and what is checked is what the *server* then
 * does with it — the action it builds, the bounds it enforces, the refusal it gives, the
 * proposal it mints. Nothing here claims the real model's language skill, which is exactly
 * the part that must never be trusted anyway.
 */

const node = (nodeId: string, label: string, kind: ScopeNode["kind"] = "TOPIC"): ScopeNode => ({
  nodeId,
  label,
  kind,
  parentId: null,
  selected: true,
});

function brief(over: Partial<PlanBriefV1> = {}): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: "NUST NET Engineering" },
    target: { endDate: "2030-06-01", examDate: "2030-06-01" },
    budget: { ...base.budget, weeklyMinutes: 600 },
    scope: {
      source: "USER_MANUAL",
      confirmedAt: "2030-01-02T00:00:00.000Z",
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: [
        node("u1", "Matrices"),
        node("u2", "Sequences and series"),
        node("u3", "Rotational dynamics"),
      ],
    },
    ...over,
  };
}

/** One interpretation, exactly as the model must produce it. */
const interpretation = (commands: CopilotCommand[], over: Record<string, unknown> = {}) =>
  PlannerCopilotInterpretationV1Schema.parse({
    schemaVersion: 1,
    intent: "INTAKE_UPDATE",
    confidence: "HIGH",
    summary: "Understood.",
    commands,
    clarification: { required: false },
    explanationRefs: [],
    ...over,
  });

const map = (commands: CopilotCommand[], input = brief()) =>
  mapCommands({ brief: input, today: "2030-01-07", commands });

/**
 * F2, reproduced from the real corpus and fixed here.
 *
 * Forty-one synthetic messages against the production model showed roughly one answer in six
 * refused by `PlannerCopilotInterpretationV1Schema` — and the captured shapes said why. Both
 * causes were in the *model-output envelope*, neither in the command authority, and both made
 * the student read "I could not read that request" for a message Sylf had understood:
 *
 * 1. `SET_CONSTRAINT.preferenceWeight` was required, so an answer that simply left out a field
 *    only meaningful for a SOFT preference was refused whole — while the planner action it maps
 *    onto has always taken it as optional.
 * 2. The clarification envelope was a union of two strict objects, so a `{required: true,
 *    question}` without a code, or a `{required: false, question}` left over from a changed
 *    mind, matched neither branch.
 *
 * The command union below is deliberately still strict to the field: these tests assert the
 * tolerance *and* the boundary, because the second is what makes the first safe.
 */
describe("the interpretation envelope tolerates what the model actually sends", () => {
  const parse = (over: Record<string, unknown>) =>
    PlannerCopilotInterpretationV1Schema.safeParse({
      schemaVersion: 1,
      intent: "CONSTRAINT_UPDATE",
      confidence: "HIGH",
      summary: "Understood.",
      commands: [],
      clarification: { required: false },
      explanationRefs: [],
      ...over,
    });

  it("accepts a constraint that omits the soft preference weight", () => {
    const parsed = parse({
      commands: [{ command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 5 }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.commands[0]).toMatchObject({ command: "SET_CONSTRAINT", strength: "HARD", value: 5 });
    // An explicit null and an absent field are the same statement, as they should be.
    expect(
      parse({
        commands: [
          { command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 5, preferenceWeight: null },
        ],
      }).success
    ).toBe(true);
  });

  it.each([
    ["a question with no code", { required: true, question: "Do you mean Friday is completely unavailable?" }],
    ["a question with a code and no options", { required: true, code: "HARD_OR_SOFT", question: "Hard or soft?" }],
    ["a question with empty options", { required: true, code: "HARD_OR_SOFT", question: "Hard or soft?", options: [] }],
    ["a declined question with a leftover question string", { required: false, question: "unused" }],
    ["an empty core with extra keys", { required: false, code: null, question: null, options: [] }],
  ])("accepts %s", (_label, clarification) => {
    const parsed = parse({ clarification });
    expect(parsed.success).toBe(true);
  });

  it("normalises a usable question into a real clarification", () => {
    const parsed = parse({ clarification: { required: true, question: "Hard or soft?" } });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const clarification = parsed.data.clarification;
    expect(clarification.required).toBe(true);
    if (!clarification.required) return;
    expect(clarification.question).toBe("Hard or soft?");
    // The code falls back to a closed value rather than being invented.
    expect(COPILOT_CLARIFICATION_CODES as readonly string[]).toContain(clarification.code);
    expect(clarification.options).toEqual([]);
  });

  it("normalises anything unusable into 'no clarification'", () => {
    for (const clarification of [
      { required: false },
      { required: false, question: "unused" },
      { required: true },
      { required: true, question: null },
    ]) {
      const parsed = parse({ clarification });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.clarification).toEqual({ required: false });
    }
  });

  it("still refuses a clarification that is not an object, or that is unbounded", () => {
    expect(parse({ clarification: "ask the student" }).success).toBe(false);
    expect(parse({ clarification: { required: true, question: "x".repeat(400) } }).success).toBe(false);
    // An invented code is refused rather than silently replaced: the vocabulary is closed.
    expect(parse({ clarification: { required: true, code: "SOMETHING_NEW", question: "?" } }).success).toBe(false);
    expect(parse({ clarification: { required: "yes", question: "?" } }).success).toBe(false);
  });

  it("keeps the command union strict to the field", () => {
    // The tolerance above is scoped to the clarification. A command carrying an invented field
    // is still refused, which is what stops the envelope fix from becoming a hole.
    expect(parse({ commands: [{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false, sql: "DELETE" }] }).success).toBe(false);
    expect(parse({ commands: [{ command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "MAYBE", value: 5 }] }).success).toBe(false);
    expect(parse({ commands: [{ command: "SET_CONSTRAINT", kind: "NOT_A_KIND", strength: "HARD", value: 5 }] }).success).toBe(false);
  });
});

describe("the command contract cannot express anything but a planner action", () => {
  it("has no shape for SQL, a patch, a path or a raw Quest update", () => {
    const shapes = JSON.stringify(PlannerCopilotInterpretationV1Schema.shape);
    for (const forbidden of ["sql", "prisma", "patch", "query", "route", "questId", "userId", "sessionId"])
      expect(shapes.toLowerCase()).not.toContain(forbidden);
  });

  it("refuses more than five commands and unknown fields", () => {
    const tooMany = Array.from({ length: 6 }, () => ({ command: "SET_WEEKLY_HOURS", hours: 8, hard: false }));
    expect(
      PlannerCopilotInterpretationV1Schema.safeParse({
        schemaVersion: 1,
        intent: "INTAKE_UPDATE",
        confidence: "HIGH",
        summary: "x",
        commands: tooMany,
        clarification: { required: false },
        explanationRefs: [],
      }).success
    ).toBe(false);
    expect(COPILOT_LIMITS.maxCommandsPerTurn).toBe(5);
    expect(
      PlannerCopilotInterpretationV1Schema.safeParse({
        schemaVersion: 1,
        intent: "INTAKE_UPDATE",
        confidence: "HIGH",
        summary: "x",
        commands: [{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false, userId: 7 }],
        clarification: { required: false },
        explanationRefs: [],
      }).success
    ).toBe(false);
  });

  it("keeps GENERAL_CHAT out of the vocabulary entirely", () => {
    expect(() => interpretation([], { intent: "GENERAL_CHAT" })).toThrow();
  });
});

describe("interpretation maps onto actions that already exist", () => {
  it("turns stated hours into a target, and a stated limit into a hard maximum", () => {
    const target = map([{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false }]);
    expect(target.commands[0]).toMatchObject({
      kind: "ACTION",
      action: { action: "setWeeklyBudget", weeklyMinutes: 480 },
    });
    expect(target.requires).toEqual([]);

    const limit = map([{ command: "SET_WEEKLY_HOURS", hours: 8, hard: true }]);
    expect(limit.commands[0]).toMatchObject({
      kind: "ACTION",
      action: { action: "setConstraint", kind: "MAX_WEEKLY_MINUTES", strength: "HARD", value: 480 },
    });
    // A hard rule is never applied silently.
    expect(limit.requires).toContain("HARD_CONSTRAINT");
  });

  it("keeps a weekday preference soft and a weekday prohibition hard", () => {
    const avoid = map([
      { command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "SOFT", value: 5, preferenceWeight: null },
    ]);
    expect(avoid.commands[0]).toMatchObject({ kind: "ACTION", action: { strength: "SOFT" } });
    const cannot = map([
      { command: "SET_CONSTRAINT", kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 5, preferenceWeight: null },
    ]);
    expect(cannot.requires).toContain("HARD_CONSTRAINT");
    expect(cannot.preview[0].consequence).toMatch(/Friday/);
  });

  it("maps session length the same way, at both strengths", () => {
    const prefers = map([
      { command: "SET_CONSTRAINT", kind: "SESSION_LENGTH_PREFERENCE", strength: "SOFT", value: 45, preferenceWeight: 2 },
    ]);
    expect(prefers.commands[0]).toMatchObject({ action: { kind: "SESSION_LENGTH_PREFERENCE", value: 45 } });
    const never = map([
      { command: "SET_CONSTRAINT", kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 90, preferenceWeight: null },
    ]);
    expect(never.preview[0].consequence).toMatch(/hard rule/);
    expect(never.requires).toContain("HARD_CONSTRAINT");
  });

  it("carries preparedness, and the studied-but-unrated nuance, without inventing a confidence", () => {
    const never = map([{ command: "SET_PREPAREDNESS", labels: ["Matrices"], state: "NOT_STUDIED" }]);
    expect(never.commands[0]).toMatchObject({
      kind: "ACTION",
      action: { action: "bulkSetPreparedness", nodeIds: ["u1"], state: "NOT_STUDIED" },
    });
    const unrated = map([{ command: "SET_PREPAREDNESS", labels: ["sequences and series"], state: "STUDIED_UNRATED" }]);
    expect(unrated.commands[0]).toMatchObject({ action: { nodeIds: ["u2"], state: "STUDIED_UNRATED" } });
  });

  it("routes research and comparison as capabilities rather than doing them", () => {
    const research = map([{ command: "REQUEST_SCOPE_RESEARCH" }]);
    expect(research.commands[0]).toMatchObject({ kind: "CAPABILITY", capability: "RESEARCH" });
    expect(research.requires).toContain("RESEARCH");
    const comparison = map([{ command: "REQUEST_CURRICULUM_COMPARISON", refresh: false }]);
    expect(comparison.commands[0]).toMatchObject({ kind: "CAPABILITY", capability: "COMPARISON" });
  });

  it("keeps a curriculum fact and a personal one apart", () => {
    const overlap = map([
      { command: "SET_OVERLAP_CORRECTION", labels: ["Matrices"], overlap: "LIKELY_NEW_TO_CURRICULUM" },
    ]);
    expect(overlap.commands[0]).toMatchObject({
      action: { action: "setOverlapCorrection", unitRef: "u1", overlap: "LIKELY_NEW_TO_CURRICULUM" },
    });
    const prepared = map([{ command: "SET_PREPAREDNESS", labels: ["Matrices"], state: "WEAK" }]);
    // Two different actions, two different fields: overlap never becomes preparedness.
    expect(prepared.commands[0]).toMatchObject({
      action: { action: "bulkSetPreparedness", nodeIds: ["u1"], state: "WEAK" },
    });
  });

  it("refuses a unit it cannot find rather than guessing one", () => {
    const refused = map([{ command: "SET_PREPAREDNESS", labels: ["Thermodynamics"], state: "WEAK" }]);
    expect(refused.commands[0]).toMatchObject({ kind: "REFUSED", code: "UNKNOWN_REFERENCE" });
  });

  it("asks which unit when the wording could mean two", () => {
    const two = brief({
      scope: {
        source: "USER_MANUAL",
        confirmedAt: null,
        provenanceRefs: [],
        provenanceSources: [],
        removedLabels: [],
        nodes: [node("a", "Integration by parts"), node("b", "Integration by substitution")],
      },
    });
    const outcome = resolveUnitLabels(two, ["integration"]);
    expect(outcome.ambiguous).toEqual(["integration"]);
    expect(outcome.resolved).toEqual([]);
  });

  it("resolves a relative date against the current intake, never from a guess", () => {
    const shifted = map([{ command: "SET_TARGET_DATE", date: null, shiftDays: 7 }]);
    expect(shifted.commands[0]).toMatchObject({
      action: { action: "setTargetDate", endDate: "2030-06-08", examDate: "2030-06-08" },
    });
    const nothing = map([{ command: "SET_TARGET_DATE", date: null, shiftDays: null }]);
    expect(nothing.commands[0]).toMatchObject({ kind: "REFUSED" });
  });

  it("builds a three-command batch, previews each change, and asks for confirmation", () => {
    const mapped = map([
      { command: "SET_WEEKLY_HOURS", hours: 8, hard: false },
      { command: "SET_CONSTRAINT", kind: "EVEN_SPREAD_PREFERENCE", strength: "SOFT", value: 120, preferenceWeight: 1 },
      { command: "SET_PREPAREDNESS", labels: ["Sequences and series"], state: "WEAK" },
    ]);
    expect(mapped.commands).toHaveLength(3);
    expect(mapped.commands.every((entry) => entry.kind === "ACTION")).toBe(true);
    expect(mapped.preview.map((entry) => entry.consequence)).toHaveLength(3);
    // Every one of them is an existing intake action.
    const actions = mapped.commands.map((entry) => (entry.kind === "ACTION" ? entry.action.action : null));
    expect(actions).toEqual(["setWeeklyBudget", "setConstraint", "bulkSetPreparedness"]);
  });

  it("allows direct execution only for one high-confidence reversible brief change", () => {
    const single = interpretation([{ command: "SET_WEEKLY_HOURS", hours: 8, hard: false }]);
    expect(single.commands).toHaveLength(1);
    expect((DIRECT_EXECUTION_COMMANDS as readonly string[]).includes(single.commands[0].command)).toBe(true);
    // Removing scope and creating hard rules are never on that list.
    expect((DIRECT_EXECUTION_COMMANDS as readonly string[]).includes("UPDATE_SCOPE")).toBe(false);
    expect((DIRECT_EXECUTION_COMMANDS as readonly string[]).includes("SET_CONSTRAINT")).toBe(false);
    expect((DIRECT_EXECUTION_COMMANDS as readonly string[]).includes("RELEASE_GENERATED_ITEM")).toBe(false);
  });
});

describe("proposals are signed, bound and short-lived", () => {
  const command: CopilotCommand = { command: "SET_WEEKLY_HOURS", hours: 8, hard: false };
  const mint = (over: Partial<Parameters<typeof mintProposal>[0]> = {}) =>
    mintProposal({
      sessionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      expectedVersion: 4,
      intent: "INTAKE_UPDATE",
      summary: "Set weekly hours to 8.",
      commands: [command],
      ...over,
    });

  it("round-trips, and carries the commands the server will re-derive", () => {
    const token = mint();
    const read = readProposal({
      token: token.token,
      sessionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      expectedVersion: 4,
    });
    expect(read.commands).toEqual([command]);
    expect(read.summary).toBe("Set weekly hours to 8.");
  });

  it("refuses a rewritten proposal rather than a client-chosen command list", () => {
    const token = mint();
    const [body, signature] = token.token.split(".");
    const rewritten = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
        commands: [{ command: "UPDATE_SCOPE", add: [], remove: ["Matrices"], rename: [] }],
      }),
      "utf8"
    ).toString("base64url");
    expect(() =>
      readProposal({
        token: `${rewritten}.${signature}`,
        sessionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        expectedVersion: 4,
      })
    ).toThrowError(/COPILOT_PROPOSAL_UNKNOWN/);
  });

  it("refuses a stale version, another session, and an expired proposal", () => {
    const token = mint();
    const withSession = (sessionId: string, expectedVersion: number) =>
      readProposal({ token: token.token, sessionId, expectedVersion });
    expect(() => withSession("3f2504e0-4f89-41d3-9a0c-0305e82c3301", 5)).toThrowError(
      /COPILOT_PROPOSAL_STALE/
    );
    expect(() => withSession("9c858901-8a57-4791-81fe-4c455b099bc9", 4)).toThrowError(
      /COPILOT_PROPOSAL_STALE/
    );
    const expired = mint({ now: new Date(Date.now() - (COPILOT_LIMITS.proposalTtlMinutes + 1) * 60_000) });
    expect(() =>
      readProposal({
        token: expired.token,
        sessionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        expectedVersion: 4,
      })
    ).toThrowError(/COPILOT_PROPOSAL_EXPIRED/);
  });
});

describe("the planner projection is bounded and says nothing private", () => {
  const context = buildCopilotContext({
    brief: brief({
      backgroundCurriculum: { label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
      preparedness: [{ nodeId: "u1", covered: true, confidence: null, difficult: true }],
    }),
    readiness: { state: "READY_FOR_DRAFT", missing: [] },
    today: "2030-01-07",
    researchConfigured: false,
    hardLimits: { weekly: 600, session: 90, unavailableWeekdays: [5] },
    comparisonState: "NOT_RUN",
    plan: null,
  });

  it("states limits, states units and stays small", () => {
    expect(context.hardWeeklyMinutes).toBe(600);
    expect(context.hardSessionMinutes).toBe(90);
    expect(context.unavailableWeekdays).toEqual([5]);
    expect(context.scopeUnits.map((unit) => unit.label)).toEqual([
      "Matrices",
      "Sequences and series",
      "Rotational dynamics",
    ]);
    // "Studied, not rated" survives the projection as its own state.
    expect(context.scopeUnits[0]).toMatchObject({ preparedness: "STUDIED_UNRATED", difficult: true });
    expect(JSON.stringify(context).length).toBeLessThan(COPILOT_LIMITS.contextBytes);
  });

  it("carries no identifier, credential or url", () => {
    const serialized = JSON.stringify(context);
    for (const forbidden of ["userId", "sessionId", "http://", "https://", "token", "secret"])
      expect(serialized).not.toContain(forbidden);
  });

  it("reports the lifecycle from the plan binding, not from the model", () => {
    expect(context.lifecycle).toBe("PRE_GENERATION");
    expect(
      buildCopilotContext({
        brief: brief(),
        readiness: { state: "READY_FOR_DRAFT", missing: [] },
        today: "2030-01-07",
        researchConfigured: true,
        hardLimits: null,
        plan: { id: "p", version: 3, latestDraftRevisionId: "r1", activeRevisionId: null },
      }).lifecycle
    ).toBe("DRAFT_REVIEW");
    expect(
      buildCopilotContext({
        brief: brief(),
        readiness: { state: "READY_FOR_DRAFT", missing: [] },
        today: "2030-01-07",
        researchConfigured: true,
        hardLimits: null,
        plan: { id: "p", version: 3, latestDraftRevisionId: null, activeRevisionId: "r0" },
      }).lifecycle
    ).toBe("CONFIRMED");
  });

  it("keeps the lifecycle table closed, so a command cannot run where it does not apply", () => {
    expect(COPILOT_INTENT_LIFECYCLE.SCOPE_UPDATE).toEqual(["PRE_GENERATION"]);
    expect(COPILOT_INTENT_LIFECYCLE.REPLAN_REQUEST).toEqual(["CONFIRMED"]);
    expect(COPILOT_INTENT_LIFECYCLE.DRAFT_EDIT).toEqual(["DRAFT_REVIEW"]);
    expect(COPILOT_INTENT_LIFECYCLE.EXPLAIN).toContain("CONFIRMED");
  });
});

describe("explanations are grounded in retained state", () => {
  const base = (over: Parameters<typeof buildCopilotContext>[0]) => buildCopilotContext(over);

  it("explains a unit from what is actually recorded about it", () => {
    const context = base({
      brief: brief({
        preparedness: [{ nodeId: "u1", covered: true, confidence: 2, difficult: false }],
        comparison: {
          version: 1,
          status: "OK",
          failureCode: null,
          targetScopeDigest: "a".repeat(32),
          backgroundDigest: "b".repeat(32),
          providerVersion: "v",
          searchProvider: "brave",
          createdAt: "2030-01-05T00:00:00.000Z",
          units: [
            {
              unitRef: "u1",
              overlap: "LIKELY_COVERED_BY_CURRICULUM",
              confidence: "HIGH",
              sourceIds: [],
              explanationCode: "BACKGROUND_TOPIC_MATCH",
            },
          ],
          sources: [],
          unresolved: [],
          summary: "Compared.",
        },
        overlapCorrections: [],
      }),
      readiness: { state: "READY_FOR_DRAFT", missing: [] },
      today: "2030-01-07",
      researchConfigured: true,
      hardLimits: null,
      comparisonState: "READY",
    });
    const facts = explanationFacts({ context, question: "why is matrices here?", matchedUnits: ["Matrices"] });
    const unit = facts.find((fact) => fact.id === "unit:Matrices")!;
    expect(unit.text).toMatch(/you confirmed/);
    expect(unit.text).toMatch(/in your curriculum/);
    expect(unit.text).toMatch(/weak/);
  });

  it("uses a retained confirmed source, and says plainly when none was retained", () => {
    const withSource = base({
      brief: brief({
        scope: {
          ...brief().scope,
          provenanceRefs: ["src-1"],
          provenanceSources: [
            {
              sourceId: "src-1",
              url: "https://www.cambridgeinternational.org/spec.pdf",
              title: "Cambridge 9709",
              publisherOrDomain: "cambridgeinternational.org",
              sourceType: "OFFICIAL_PDF",
              retrievedAt: "2030-01-05T00:00:00.000Z",
              documentDate: "2026",
            },
          ],
        },
      }),
      readiness: { state: "READY_FOR_DRAFT", missing: [] },
      today: "2030-01-07",
      researchConfigured: true,
      hardLimits: null,
    });
    const fact = explanationFacts({ context: withSource, question: "what source did you use?" }).find((entry) =>
      entry.id.startsWith("provenance")
    )!;
    expect(fact.id).toBe("provenance:confirmed");
    expect(fact.text).toMatch(/cambridgeinternational\.org/);
    expect(fact.text).toMatch(/verified authority/);

    // A scope confirmed before Phase 3.1 retained nothing, and the answer says so.
    const legacy = base({
      brief: brief({
        scope: { ...brief().scope, provenanceRefs: ["src-old"], provenanceSources: [] },
      }),
      readiness: { state: "READY_FOR_DRAFT", missing: [] },
      today: "2030-01-07",
      researchConfigured: true,
      hardLimits: null,
    });
    const absent = explanationFacts({ context: legacy, question: "where did this come from?" }).find((entry) =>
      entry.id.startsWith("provenance")
    )!;
    expect(absent.id).toBe("provenance:absent");
    expect(absent.text).not.toMatch(/http|source:|official/i);
  });

  it("explains a closed weekday from the confirmed availability", () => {
    const context = base({
      brief: brief(),
      readiness: { state: "READY_FOR_DRAFT", missing: [] },
      today: "2030-01-07",
      researchConfigured: true,
      hardLimits: { weekly: null, session: null, unavailableWeekdays: [5] },
    });
    const fact = explanationFacts({ context, question: "why is Friday empty?" }).find(
      (entry) => entry.id === "availability:closed"
    )!;
    expect(fact.text).toMatch(/Friday/);
    expect(fact.text).toMatch(/unavailable/);
  });

  it("says it has nothing grounded rather than inventing a reason", () => {
    const context = base({
      brief: brief({ scope: { ...brief().scope, confirmedAt: null, nodes: [] } }),
      readiness: { state: "NEEDS_CORE_INFO", missing: ["SCOPE_MISSING"] },
      today: "2030-01-07",
      researchConfigured: true,
      hardLimits: null,
    });
    const facts = explanationFacts({ context, question: "why is this task 60 minutes?" });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((fact) => !/60 minutes/i.test(fact.text))).toBe(true);
  });

  it("stays a schema-valid brief contract throughout", () => {
    expect(PlanBriefV1Schema.safeParse(brief()).success).toBe(true);
  });
});
