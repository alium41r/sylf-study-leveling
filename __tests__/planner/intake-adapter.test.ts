// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  boundedParse,
  LIMITS,
  UserInputV1Schema,
  type UserInputV1,
} from "@/lib/planner/contracts";
import { emptyBrief, type PlanBriefV1, type ScopeNode } from "@/lib/planner/intake/brief";
import {
  ADAPTER_DEFAULTS,
  assertBriefGeneratable,
  examInputFromBrief,
  inputBytesFor,
  inputFromBrief,
  masteryInputFromBrief,
  roadmapInputFromBrief,
  type AdapterContext,
} from "@/lib/planner/intake/to-input";

const node = (
  nodeId: string,
  label: string,
  kind: ScopeNode["kind"],
  parentId: string | null,
  selected = true
): ScopeNode => ({ nodeId, label, kind, parentId, selected });

const topic = (nodeId: string, label: string, parentId: string | null = null): ScopeNode =>
  node(nodeId, label, "TOPIC", parentId);

/** A minimal, fully stated brief for the given mode. */
function brief(mode: PlanBriefV1["mode"] = "EXAM"): PlanBriefV1 {
  const b = emptyBrief(mode);
  b.goal.title = "Pass the chemistry exam";
  b.subject = { kind: "FREE_TEXT", subjectId: null, name: "Chemistry" };
  b.target.endDate = "2030-01-25";
  if (mode === "EXAM") b.target.examDate = "2030-01-25";
  b.budget.weeklyMinutes = 180;
  b.scope.nodes = [topic("t1", "Cells"), topic("t2", "Enzymes")];
  return b;
}

const context: AdapterContext = { today: "2030-01-07", restWeekdays: [] };

/** Narrow the adapter's union return to its EXAM member. */
const asExam = (input: UserInputV1): Extract<UserInputV1, { mode: "EXAM" }> => {
  if (input.mode !== "EXAM") throw new Error("expected an EXAM input");
  return input;
};

describe("adapter translation", () => {
  it("produces EXAM input that parses with the real contract", () => {
    const input = asExam(examInputFromBrief(brief("EXAM"), context));
    expect(UserInputV1Schema.safeParse(input).success).toBe(true);
    expect(input.mode).toBe("EXAM");
    expect(input.examDate).toBe("2030-01-25");
  });

  it("produces ROADMAP input that parses with the real contract", () => {
    const input = roadmapInputFromBrief(brief("ROADMAP"), context);
    expect(boundedParse(UserInputV1Schema, input).mode).toBe("ROADMAP");
  });

  it("produces MASTERY input that parses with the real contract", () => {
    const input = masteryInputFromBrief(brief("MASTERY"), context);
    expect(UserInputV1Schema.safeParse(input).success).toBe(true);
    expect(input.mode).toBe("MASTERY");
  });

  it("sets scope to the flattened labels joined with newlines, uniquely", () => {
    const b = brief("EXAM");
    b.scope.nodes = [
      node("c1", "Chapter 1", "CHAPTER", null),
      topic("a1", "Algebra", "c1"),
      node("c2", "Chapter 2", "CHAPTER", null),
      topic("a2", "Algebra", "c2"),
    ];
    const input = asExam(examInputFromBrief(b, context));
    const labels = input.scope.split("\n");
    // Two topics named "Algebra" in different chapters: the second is qualified by
    // its own chapter, which tells a student which Algebra this is.
    expect(labels).toEqual(["Algebra", "Chapter 2 · Algebra"]);
    expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(labels.length);
    // The topic list carries exactly the same labels, in the same order.
    expect(input.exam?.topics.map((entry) => entry.label).join("\n")).toBe(input.scope);
  });

  it("leaves unstated preparedness as null rather than false or 1", () => {
    const input = asExam(examInputFromBrief(brief("EXAM"), context));
    const topics = input.exam?.topics ?? [];
    expect(topics).toHaveLength(2);
    for (const entry of topics) {
      expect(entry.covered).toBeNull();
      expect(entry.confidence).toBeNull();
      expect(entry.difficult).toBeNull();
    }
  });

  it("enforces readiness before translation", () => {
    const incomplete = emptyBrief("EXAM");
    expect(() => assertBriefGeneratable(incomplete, context)).toThrow("BRIEF_NOT_READY");
    expect(() => assertBriefGeneratable(brief("EXAM"), context)).not.toThrow();
  });

  it("rejects a horizon beyond the limit or ending in the past", () => {
    const past = brief("EXAM");
    past.target.endDate = "2030-01-01";
    past.target.examDate = "2030-01-01";
    expect(() => examInputFromBrief(past, context)).toThrow("INVALID_HORIZON");

    const tooFar = brief("EXAM");
    tooFar.target.endDate = "2031-03-01";
    tooFar.target.examDate = "2031-03-01";
    expect(() => examInputFromBrief(tooFar, context)).toThrow("INVALID_HORIZON");
    expect(LIMITS.horizonDays).toBe(365);
  });

  it("measures a minimal EXAM input well under the byte bound", () => {
    const bytes = inputBytesFor(brief("EXAM"), context);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(LIMITS.inputBytes);
  });

  it("throws MODE_MISMATCH when a mode-specific adapter meets another mode's brief", () => {
    expect(() => examInputFromBrief(brief("ROADMAP"), context)).toThrow("MODE_MISMATCH");
  });

  it("routes through inputFromBrief by the brief's own mode", () => {
    expect(inputFromBrief(brief("ROADMAP"), context).mode).toBe("ROADMAP");
    expect(inputFromBrief(brief("MASTERY"), context).mode).toBe("MASTERY");
  });

  it("documents the defaults Quick Plan does not ask for", () => {
    expect(ADAPTER_DEFAULTS.preferredSessionMinutes).toBe(45);
    expect(ADAPTER_DEFAULTS.examFormat).toBe("UNSPECIFIED");
    expect(ADAPTER_DEFAULTS.examApproach).toBe("STANDARD");
    expect(ADAPTER_DEFAULTS.masteryDepth).toBe("SOLID");
    expect(ADAPTER_DEFAULTS.masteryPriorExposure).toBe("NEW");
    expect(ADAPTER_DEFAULTS.masteryCheckPreference).toBe("MIXED_PRACTICE");
    expect(ADAPTER_DEFAULTS.monthGranularityAfterDays).toBe(70);
  });
});
