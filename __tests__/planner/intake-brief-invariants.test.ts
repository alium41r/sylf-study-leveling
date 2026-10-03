// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BRIEF_LIMITS,
  PlanBriefV1Schema,
  emptyBrief,
  flattenScope,
  serializedBriefBytes,
  type PlanBriefV1,
} from "@/lib/planner/intake/brief";

/**
 * The brief's round-trip invariant: anything the service is willing to store must
 * parse back to exactly what was stored, for every mode and every state along the
 * way from "nothing entered" to "ready to generate".
 *
 * This exists because it was violated. The empty brief was not valid against its own
 * schema (a blank goal title and an unstated subject were both unrepresentable), and
 * the read path papered over it by falling back to a fresh empty brief — so a student
 * could set a constraint, reload, and find it gone with no error. A stored brief that
 * cannot be read back is data loss, so the schema has to admit every state the intake
 * can legitimately be in, including "not stated yet".
 */
const MODES = ["EXAM", "ROADMAP", "MASTERY"] as const;

function roundTrip(brief: PlanBriefV1): PlanBriefV1 {
  const json = JSON.parse(JSON.stringify(brief)) as unknown;
  const parsed = PlanBriefV1Schema.safeParse(json);
  expect(
    parsed.success,
    parsed.success
      ? ""
      : parsed.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ")
  ).toBe(true);
  return parsed.data!;
}

describe("a stored brief always reads back as itself", () => {
  it("accepts the empty brief in every mode", () => {
    for (const mode of MODES) {
      const brief = roundTrip(emptyBrief(mode));
      expect(brief.mode).toBe(mode);
      expect(brief.goal.title).toBe("");
      expect(brief.subject.kind).toBeNull();
      expect(brief.target.endDate).toBeNull();
      expect(brief.budget.weeklyMinutes).toBeNull();
      expect(brief.scope.nodes).toEqual([]);
      expect(brief.preparedness).toEqual([]);
      expect(serializedBriefBytes(brief)).toBeLessThan(BRIEF_LIMITS.briefBytes);
    }
  });

  it("keeps what a half-filled intake has said so far", () => {
    const brief = emptyBrief("EXAM");
    const half: PlanBriefV1 = {
      ...brief,
      goal: { title: "Biology mock" },
      scope: {
        ...brief.scope,
        nodes: [
          { nodeId: "n1", label: "Cells", kind: "TOPIC", parentId: null, selected: true },
          { nodeId: "n2", label: "Enzymes", kind: "TOPIC", parentId: null, selected: true },
        ],
      },
      preparedness: [{ nodeId: "n1", covered: null, confidence: null, difficult: null }],
      // Everything else still unstated: no date, no budget, no subject.
    };
    const back = roundTrip(half);
    expect(back.goal.title).toBe("Biology mock");
    expect(back.scope.nodes).toHaveLength(2);
    // A preparedness row of all nulls is a stated "I have not said anything about
    // this unit" and must survive as nulls, never as false/1.
    expect(back.preparedness[0]).toMatchObject({ covered: null, confidence: null, difficult: null });
    expect(back.target.endDate).toBeNull();
  });

  it("keeps a constraint added while the goal is still blank", () => {
    // The exact regression: a hard weekday exclusion written onto a brief whose goal
    // title was still empty used to make the stored brief unreadable.
    const brief = emptyBrief("EXAM");
    const withConstraint: PlanBriefV1 = {
      ...brief,
      constraints: [
        { kind: "UNAVAILABLE_WEEKDAY", strength: "HARD", value: 3, source: "USER_EXPLICIT" },
      ],
    };
    const back = roundTrip(withConstraint);
    expect(back.constraints).toEqual(withConstraint.constraints);
  });

  it("accepts each of the three subject states and rejects a contradictory one", () => {
    const brief = emptyBrief("EXAM");
    for (const subject of [
      { kind: null, subjectId: null, name: null },
      { kind: "FREE_TEXT" as const, subjectId: null, name: "Biology" },
      { kind: "SYLF_SUBJECT" as const, subjectId: 7, name: null },
    ])
      expect(PlanBriefV1Schema.safeParse({ ...brief, subject }).success).toBe(true);

    // "Unstated" carrying a value, a free-text subject with no name, and a Sylf
    // subject with no id are all contradictions rather than extra states.
    for (const subject of [
      { kind: null, subjectId: null, name: "Biology" },
      { kind: "FREE_TEXT" as const, subjectId: null, name: null },
      { kind: "SYLF_SUBJECT" as const, subjectId: null, name: null },
    ])
      expect(PlanBriefV1Schema.safeParse({ ...brief, subject }).success).toBe(false);
  });

  it("rejects the storage layer's unwritten placeholder, which is not a brief", () => {
    // `{}` is what the session table holds before the intake service seeds the real
    // empty brief; it must not silently pass as a brief, or a schema change could
    // start reading real sessions as empty without anyone noticing.
    expect(PlanBriefV1Schema.safeParse({}).success).toBe(false);
    expect(PlanBriefV1Schema.safeParse(null).success).toBe(false);
  });
});

describe("scope flattening keeps the student's labels while satisfying the engine", () => {
  const node = (
    nodeId: string,
    label: string,
    parentId: string | null,
    kind: "CHAPTER" | "TOPIC" = "TOPIC"
  ) => ({ nodeId, label, kind, parentId, selected: true });

  it("qualifies a duplicate label with its chapter rather than numbering it", () => {
    // Two chapters each begin with "Introduction". Numbering them would be unique but
    // meaningless; naming the chapter keeps the plan readable.
    const flat = flattenScope([
      node("c1", "Cell biology", null, "CHAPTER"),
      node("c2", "Genetics", null, "CHAPTER"),
      node("t1", "Introduction", "c1"),
      node("t2", "Introduction", "c2"),
    ]);
    const labels = flat.units.map((unit) => unit.label);
    // Only the *colliding* unit is qualified. The first "Introduction" was never
    // ambiguous, and rewriting a label the student already had would churn labels
    // that revisions and coverage history refer to.
    expect(labels).toEqual(["Introduction", "Genetics · Introduction"]);
    expect(flat.scope).toBe(labels.join("\n"));
    // The student's own wording is preserved for display and review.
    expect(flat.units.map((unit) => unit.displayLabel)).toEqual(["Introduction", "Introduction"]);
    expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(labels.length);
  });

  it("falls back to a numeric suffix only when the ancestor chain cannot separate units", () => {
    const flat = flattenScope([node("t1", "Cells", null), node("t2", "Cells", null)]);
    expect(flat.units.map((unit) => unit.label)).toEqual(["Cells", "Cells (2)"]);
    expect(flat.units.map((unit) => unit.displayLabel)).toEqual(["Cells", "Cells"]);
    expect(flat.scope).toBe("Cells\nCells (2)");
  });
});
