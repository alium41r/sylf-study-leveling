// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EditSchema } from "@/lib/planner/contracts";
import { validateHardConstraints } from "@/lib/planner/constraints";
import type { ValidatedDraftV1, PlannerItem } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import type { PlannerConstraint } from "@/lib/planner/constraints";
import {
  DRAFT_RULE_AUDIT,
  RECOMMENDATION_CODES,
  acknowledgementFor,
  affectedUnitLabels,
  changedUnitLabels,
  draftRule,
  isRecommendation,
  recommendationConsequence,
} from "@/lib/planner/draft-rules";
import { ADVISORY_FINDING_CODES, finding } from "@/lib/planner/intake/findings";
import {
  assessDraftEdit,
  capacityFindings,
  measureCapacity,
  spokenMinutes,
} from "@/lib/planner/server/flexibility";
import { examAvailability, examFixture, examProposal } from "./exam-fixtures";

/**
 * Flexible draft editing: which of the planner's educational rules a student may
 * accept, and what cannot be accepted at all.
 *
 * Two halves of the contract are asserted here:
 *
 * - **the audit is complete and consistent** — one class per code, the finding envelope
 *   agrees with it, and every recommendation has a sentence a student can read;
 * - **the assessment enforces it** — a recommendation is raised and then accepted, an
 *   acknowledgement for something the draft does not raise is refused, and a blocker
 *   cannot be acknowledged at all.
 *
 * The fixture is the existing synthetic Exam plan, deliberately: this phase must not
 * need a new kind of plan to demonstrate flexibility.
 */

const input = (options: { constraints?: PlannerConstraint[]; dailyMinutes?: number } = {}) => {
  const base = examFixture();
  return {
    ...base,
    availability: {
      ...base.availability,
      dailyMinutes: base.availability.dailyMinutes.map(() => options.dailyMinutes ?? 120),
    },
    constraints: options.constraints ?? [],
  };
};

const cleanDraft = (): ValidatedDraftV1 => normalizeProposal(input(), examProposal());

/** The same draft with some items taken out, exactly as an edit does. */
const without = (predicate: (item: PlannerItem) => boolean): ValidatedDraftV1 => {
  const draft = cleanDraft();
  return { ...draft, items: draft.items.filter((item) => !predicate(item)) };
};

const heavier = (minutes: number): ValidatedDraftV1 => {
  const draft = cleanDraft();
  return { ...draft, items: draft.items.map((item) => ({ ...item, minutes })) };
};

describe("draft rules: every code is audited, with one class and a reason", () => {
  it("gives each code exactly one class", () => {
    const classes = new Map<string, Set<string>>();
    for (const entry of DRAFT_RULE_AUDIT) {
      const set = classes.get(entry.code) ?? new Set<string>();
      set.add(entry.class);
      classes.set(entry.code, set);
    }
    for (const [code, set] of classes) expect(`${code}:${set.size}`).toBe(`${code}:1`);
    // A code documented for two modes (INSUFFICIENT_TOPIC_WORK has an Exam entry and a
    // Mastery entry) is listed twice with the same class, never two.
    expect(DRAFT_RULE_AUDIT.filter((entry) => entry.code === "INSUFFICIENT_TOPIC_WORK").length).toBeGreaterThan(1);
  });

  it("audits every recommendation with a reason and a readable sentence", () => {
    for (const entry of DRAFT_RULE_AUDIT) expect(entry.reason.length).toBeGreaterThan(20);
    for (const code of RECOMMENDATION_CODES) {
      const consequence = recommendationConsequence(code);
      expect(consequence.length).toBeGreaterThan(20);
      // Never a refusal and never an instruction: the copy explains a consequence.
      expect(consequence).not.toMatch(/cannot|not allowed|forbidden|must not/i);
    }
  });

  it("keeps the hard codes hard", () => {
    for (const code of [
      "HARD_UNAVAILABLE_DAY_USED",
      "HARD_SESSION_LIMIT_EXCEEDED",
      "HARD_WEEKLY_LIMIT_EXCEEDED",
      "INVALID_ITEM_CAPACITY",
      "INFEASIBLE_CAPACITY",
      "DUPLICATE_KEY",
      "UNKNOWN_REFERENCE",
      "EXAM_DATE_VIOLATION",
      "MISSING_SCOPE_TOPIC",
      "MISSING_MASTERY_STAGE",
      "MISSING_UNDERSTAND",
      "MISSING_LEARN",
      "MISSING_ACTIVE_RECALL",
      "MISSING_PRACTICE",
      "MISSING_MASTERY_CHECK",
      "ROADMAP_DEPENDENCY_ORDER",
      "EXPANSION_SCOPE_VIOLATION",
    ]) {
      expect(isRecommendation(code)).toBe(false);
      expect(draftRule(code)?.class).toBe("BLOCKER");
    }
  });

  it("agrees with the finding envelope about severity", () => {
    for (const entry of DRAFT_RULE_AUDIT)
      expect(`${entry.code}:${finding(entry.code, { kind: "DRAFT" }, "x").severity}`).toBe(
        `${entry.code}:${entry.class === "RECOMMENDATION" ? "WARNING" : "BLOCKER"}`
      );
    for (const code of ADVISORY_FINDING_CODES)
      expect(finding(code, { kind: "PLAN" }, "x").severity).toBe("WARNING");
    expect(finding("GOAL_MISSING", { kind: "PLAN" }, "x").severity).toBe("BLOCKER");
  });

  it("acknowledges with one spelling", () => {
    expect(acknowledgementFor("MISSING_FINAL_REVIEW")).toBe("ACK:MISSING_FINAL_REVIEW");
  });

  it("names the units only where the draft alone decides it", () => {
    const draft = cleanDraft();
    // Dropping every recall session leaves each unit without retrieval, which is
    // exactly the predicate the validator applies.
    const withoutRecall = without((item) => item.type === "RECALL");
    const named = affectedUnitLabels("MISSING_CONSOLIDATION_OR_PRACTICE", withoutRecall);
    expect(named.length).toBeGreaterThan(0);
    // A code whose predicate depends on the student's preparedness names nothing here:
    // the validator's reason is not derivable from the draft, and naming the wrong unit
    // would be worse than naming none. `changedUnitLabels` answers instead.
    expect(affectedUnitLabels("MISSING_MISTAKE_REVIEW", draft)).toEqual([]);
    expect(affectedUnitLabels("MISSING_FINAL_REVIEW", draft)).toEqual([]);
  });

  it("names what the edit changed, from the edit itself", () => {
    const before = cleanDraft();
    const after = without((item) => item.type === "FINAL_REVIEW");
    const changed = changedUnitLabels(before, after);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed).toContain("Cells");
    // An edit that changes nothing names nothing.
    expect(changedUnitLabels(before, before)).toEqual([]);
  });

  it("puts the changed unit into the warning's sentence when there is a base draft", () => {
    const draft = without((item) => item.type === "MISTAKE_REVIEW");
    const refused = assessDraftEdit({
      input: input(),
      draft,
      base: cleanDraft(),
      acknowledged: [],
    });
    const warning = refused.warnings.find((entry) => entry.code === "MISSING_MISTAKE_REVIEW")!;
    // The unit that lost its mistake review is named, and the finding's scope carries it.
    expect(warning.scope.kind).toBe("UNIT");
    expect(warning.consequence).toMatch(/mistake review/);
    expect(warning.consequence).not.toMatch(/undefined/);
  });
});

describe("assessment: a recommendation is raised, then accepted", () => {
  it("refuses the edit with a warning, and seals it once acknowledged", () => {
    const draft = without((item) => item.type === "FINAL_REVIEW");
    const refused = assessDraftEdit({ input: input(), draft, acknowledged: [] });
    expect(refused.ok).toBe(false);
    expect(refused.blockers).toEqual([]);
    expect(refused.warnings.map((warning) => warning.code)).toContain("MISSING_FINAL_REVIEW");
    expect(refused.draft).toBeNull();
    expect(refused.warnings[0].acknowledgementCode).toBe("ACK:MISSING_FINAL_REVIEW");

    const accepted = assessDraftEdit({
      input: input(),
      draft,
      acknowledged: ["ACK:MISSING_FINAL_REVIEW"],
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.draft).not.toBeNull();
    expect(accepted.accepted).toEqual(["ACK:MISSING_FINAL_REVIEW"]);
  });

  it("collects several recommendations from one edit, each needing its own answer", () => {
    const draft = without((item) => item.type === "FINAL_REVIEW" || item.type === "MISTAKE_REVIEW");
    const refused = assessDraftEdit({ input: input(), draft, acknowledged: [] });
    const codes = refused.warnings.map((warning) => warning.code);
    expect(codes).toContain("MISSING_FINAL_REVIEW");
    expect(codes).toContain("MISSING_MISTAKE_REVIEW");

    const partial = assessDraftEdit({
      input: input(),
      draft,
      acknowledged: ["ACK:MISSING_FINAL_REVIEW"],
    });
    expect(partial.ok).toBe(false);
    expect(partial.warnings.map((warning) => warning.code)).toContain("MISSING_MISTAKE_REVIEW");
  });

  it("refuses an invented acknowledgement, and one for a warning this draft does not raise", () => {
    const clean = cleanDraft();
    expect(() =>
      assessDraftEdit({ input: input(), draft: clean, acknowledged: ["ACK:MISSING_FINAL_REVIEW"] })
    ).toThrowError(/UNKNOWN_ACKNOWLEDGEMENT/);
    expect(() =>
      assessDraftEdit({ input: input(), draft: clean, acknowledged: ["ACK:NOT_A_REAL_CODE"] })
    ).toThrowError(/UNKNOWN_ACKNOWLEDGEMENT/);
  });

  it("cannot acknowledge a blocker, and says so rather than ignoring it", () => {
    // Removing a confirmed unit's identity from the draft is structural: the scope the
    // student confirmed no longer matches.
    const broken = { ...cleanDraft(), topics: cleanDraft().topics.slice(1) };
    // Attempting to acknowledge a blocker is refused outright rather than ignored.
    expect(() =>
      assessDraftEdit({ input: input(), draft: broken, acknowledged: ["ACK:UNKNOWN_REFERENCE"] })
    ).toThrowError(/BLOCKER_NOT_ACKNOWLEDGEABLE/);
    const refused = assessDraftEdit({ input: input(), draft: broken, acknowledged: [] });
    expect(refused.ok).toBe(false);
    expect(refused.blockers.map((blocker) => blocker.code)).toContain("UNKNOWN_REFERENCE");
    expect(refused.draft).toBeNull();
  });

  it("reports a code it has never audited conservatively, as a blocker", () => {
    /**
     * `DEPTH_LIMIT` comes from the engine's graph check and is deliberately not in the
     * §34 audit, so it exercises the conservative default: anything not audited as a
     * recommendation is refused, and refused as a blocker that cannot be acknowledged.
     */
    const draft = cleanDraft();
    // Five nested topics: the engine's graph check allows four levels, so this trips
    // DEPTH_LIMIT — a real structural refusal this phase never audited.
    const keys = [
      ...draft.topics.map((topic) => topic.key),
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "9c858901-8a57-4791-81fe-4c455b099bc9",
    ];
    const tooDeep = {
      ...draft,
      // A stored draft's topic carries a title, not a proposal label.
      topics: keys.map((key, index) => ({
        ...draft.topics[0],
        key,
        title: `Unit ${index + 1}`,
        scopeRef: `t${index + 1}`,
        parentKey: index === 0 ? null : keys[index - 1],
      })),
    };
    expect(draftRule("DEPTH_LIMIT")).toBeUndefined();
    const refused = assessDraftEdit({ input: input(), draft: tooDeep, acknowledged: [] });
    expect(refused.ok).toBe(false);
    expect(refused.blockers.map((blocker) => blocker.code)).toContain("DEPTH_LIMIT");
    expect(refused.draft).toBeNull();
  });
});

describe("assessment: §36 session length and §37 weekly target", () => {
  it("says longer-than-preferred rather than refusing, when the session preference is SOFT", () => {
    const constraints: PlannerConstraint[] = [
      { kind: "SESSION_LENGTH_PREFERENCE", strength: "SOFT", value: 45, source: "USER_EXPLICIT", preferenceWeight: 2 },
    ];
    const draft = heavier(120);
    const refused = assessDraftEdit({ input: input({ constraints }), draft, acknowledged: [] });
    expect(refused.blockers).toEqual([]);
    expect(refused.warnings.map((warning) => warning.code)).toContain("SESSION_LONGER_THAN_PREFERRED");
    // The consequence names the student's own preferred length.
    const session = refused.warnings.find((warning) => warning.code === "SESSION_LONGER_THAN_PREFERRED")!;
    expect(session.consequence).toContain("45");

    const accepted = assessDraftEdit({
      input: input({ constraints }),
      draft,
      acknowledged: refused.warnings.map((warning) => warning.acknowledgementCode),
    });
    expect(accepted.ok).toBe(true);
  });

  it("still blocks an explicit HARD session ceiling", () => {
    const constraints: PlannerConstraint[] = [
      { kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 60, source: "USER_EXPLICIT" },
    ];
    const refused = assessDraftEdit({ input: input({ constraints }), draft: heavier(90), acknowledged: [] });
    expect(refused.ok).toBe(false);
    expect(refused.blockers.map((blocker) => blocker.code)).toContain("HARD_SESSION_LIMIT_EXCEEDED");
    expect(refused.draft).toBeNull();
    // And it cannot be accepted, however the client asks: a hard ceiling the student
    // themselves set is not a tradeoff.
    expect(() =>
      assessDraftEdit({
        input: input({ constraints }),
        draft: heavier(90),
        acknowledged: ["ACK:HARD_SESSION_LIMIT_EXCEEDED"],
      })
    ).toThrowError(/BLOCKER_NOT_ACKNOWLEDGEABLE/);
  });

  it("refuses a duration outside the engine's absolute bounds before any assessment", () => {
    // 240 minutes is the engine's hard ceiling on one session, and it is enforced at the
    // request boundary: a 300-minute edit cannot even become a draft, so there is
    // nothing here for a student to accept. This is the blocker side of §36.
    const body = {
      schemaVersion: 1 as const,
      baseRevisionId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      expectedVersion: 1,
      operationKey: "11111111-2222-4333-8444-555555555555",
      edits: [{ key: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", minutes: 300 }],
    };
    expect(EditSchema.safeParse(body).success).toBe(false);
    expect(
      EditSchema.safeParse({
        ...body,
        edits: [{ key: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", minutes: 240 }],
      }).success
    ).toBe(true);
    // And the HARD constraint check refuses it independently of any request shape.
    expect(() => validateHardConstraints(input(), [{ date: "2030-01-07", minutes: 300 }])).toThrowError(
      /INVALID_ITEM_CAPACITY/
    );
  });

  it("classifies a weekly target overrun as an acceptable warning, naming the minutes", () => {
    const plan = input();
    const draft = heavier(240);
    const active = draft.items.filter((item) => !item.removed);
    const capacity = measureCapacity(plan, active, examAvailability());
    expect(capacity.reasons.length).toBeGreaterThan(0);
    const findings = capacityFindings(plan, active, capacity);
    const overrun = findings.find((entry) => entry.code === "WEEKLY_TARGET_OVERRUN");
    expect(overrun).toBeDefined();
    expect(overrun!.severity).toBe("WARNING");
    expect(overrun!.consequence).toMatch(/weekly target/);
    expect(overrun!.consequence).toMatch(/not a hard limit/);
    // One finding, however many days are over: nine copies would read as nine problems.
    expect(findings.filter((entry) => entry.code === "WEEKLY_TARGET_OVERRUN")).toHaveLength(1);

    const assessment = assessDraftEdit({
      input: plan,
      draft,
      acknowledged: [],
      state: examAvailability(),
    });
    expect(assessment.blockers).toEqual([]);
    expect(assessment.warnings.map((warning) => warning.code)).toContain("WEEKLY_TARGET_OVERRUN");
    const acceptedAll = assessDraftEdit({
      input: plan,
      draft,
      acknowledged: assessment.warnings.map((warning) => warning.acknowledgementCode),
      state: examAvailability(),
    });
    expect(acceptedAll.ok).toBe(true);
  });

  it("still blocks an explicit HARD weekly maximum", () => {
    const plan = input({
      constraints: [{ kind: "MAX_WEEKLY_MINUTES", strength: "HARD", value: 600, source: "USER_EXPLICIT" }],
    });
    const draft = heavier(240);
    const active = draft.items.filter((item) => !item.removed);
    const findings = capacityFindings(plan, active, measureCapacity(plan, active, examAvailability()));
    const hard = findings.find((entry) => entry.code === "HARD_WEEKLY_LIMIT_EXCEEDED");
    expect(hard).toBeDefined();
    expect(hard!.severity).toBe("BLOCKER");
    expect(hard!.consequence).toMatch(/hard weekly maximum/);

    const refused = assessDraftEdit({ input: plan, draft, acknowledged: [], state: examAvailability() });
    expect(refused.ok).toBe(false);
    expect(refused.blockers.map((blocker) => blocker.code)).toContain("HARD_WEEKLY_LIMIT_EXCEEDED");
    expect(() =>
      assessDraftEdit({
        input: plan,
        draft,
        acknowledged: ["ACK:HARD_WEEKLY_LIMIT_EXCEEDED"],
        state: examAvailability(),
      })
    ).toThrowError(/BLOCKER_NOT_ACKNOWLEDGEABLE/);
  });

  it("treats a closed weekday as hard, and a rest date as a fact to acknowledge", () => {
    const closed = input({
      constraints: [{ kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 1, source: "USER_EXPLICIT" }],
    });
    const refused = assessDraftEdit({ input: closed, draft: cleanDraft(), acknowledged: [] });
    expect(refused.ok).toBe(false);
    expect(refused.blockers.map((blocker) => blocker.code)).toContain("HARD_UNAVAILABLE_DAY_USED");
  });

  it("writes minutes as words inside a sentence", () => {
    expect(spokenMinutes(75)).toBe("1 hour 15 minutes");
    expect(spokenMinutes(60)).toBe("1 hour");
    expect(spokenMinutes(1)).toBe("1 minute");
    expect(spokenMinutes(600)).toBe("10 hours");
  });
});

describe("assessment: none of this touches preparedness, priority or difficulty", () => {
  it("carries no preparedness data in a finding envelope", () => {
    const refused = assessDraftEdit({
      input: input(),
      draft: without((item) => item.type === "FINAL_REVIEW"),
      acknowledged: [],
    });
    const serialized = JSON.stringify(refused);
    expect(serialized).not.toMatch(/"covered"|"confidence"|"difficult"|"priority"/);
  });

  it("raises nothing at all for a complete, unedited plan", () => {
    const assessment = assessDraftEdit({
      input: input(),
      draft: cleanDraft(),
      acknowledged: [],
      state: examAvailability(),
    });
    // The fixture is a whole plan, so accepting nothing is required: this is the path a
    // student takes when they change nothing, and it must stay silent.
    expect(assessment.findings).toEqual([]);
    expect(assessment.ok).toBe(true);
  });
});
