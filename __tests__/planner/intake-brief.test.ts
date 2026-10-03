// @vitest-environment node
import { describe, expect, it } from "vitest";
import { duplicateScopeLabels } from "@/lib/planner/scope-topic";
import {
  BRIEF_AUTHORITIES,
  BRIEF_LIMITS,
  emptyBrief,
  flattenScope,
  mayApplyAuthority,
  PlanBriefV1Schema,
  preparednessFor,
  scopeStructureIssue,
  type PlanBriefV1,
  type ScopeNode,
} from "@/lib/planner/intake/brief";

/** A scope node; parentId null means a root node. */
const node = (
  nodeId: string,
  label: string,
  kind: ScopeNode["kind"],
  parentId: string | null,
  selected = true
): ScopeNode => ({ nodeId, label, kind, parentId, selected });

const topic = (nodeId: string, label: string, parentId: string | null = null): ScopeNode =>
  node(nodeId, label, "TOPIC", parentId);

/** A minimal, fully parseable EXAM brief. */
function valid(mode: PlanBriefV1["mode"] = "EXAM"): PlanBriefV1 {
  const brief = emptyBrief(mode);
  brief.goal.title = "Pass the chemistry exam";
  brief.subject = { kind: "FREE_TEXT", subjectId: null, name: "Chemistry" };
  brief.target.endDate = "2030-01-25";
  if (mode === "EXAM") brief.target.examDate = "2030-01-25";
  brief.budget.weeklyMinutes = 180;
  brief.scope.nodes = [topic("t1", "Cells"), topic("t2", "Enzymes")];
  return brief;
}

describe("PlanBriefV1Schema", () => {
  it("is strict and versioned", () => {
    expect(PlanBriefV1Schema.safeParse(valid()).success).toBe(true);
    // An unknown key is rejected rather than silently dropped.
    expect(PlanBriefV1Schema.safeParse({ ...valid(), extra: true }).success).toBe(false);
    // The version is a literal: only version 1 parses.
    expect(
      PlanBriefV1Schema.safeParse({ ...valid(), schemaVersion: 2 } as unknown).success
    ).toBe(false);
  });

  it("bounds the node count", () => {
    expect(BRIEF_LIMITS.scopeNodes).toBe(200);
    const tooMany = Array.from({ length: 201 }, (_, index) =>
      topic(`n${index}`, `Topic ${index}`)
    );
    const brief = valid();
    expect(
      PlanBriefV1Schema.safeParse({ ...brief, scope: { ...brief.scope, nodes: tooMany } })
        .success
    ).toBe(false);
  });

  it("rejects a hierarchy deeper than the section→chapter→topic limit", () => {
    expect(BRIEF_LIMITS.scopeDepth).toBe(3);
    const nodes = [
      node("s", "Section", "SECTION", null, false),
      node("c", "Chapter", "CHAPTER", "s", false),
      node("t1", "Topic 1", "TOPIC", "c", false),
      node("t2", "Too deep", "TOPIC", "t1", false),
    ];
    expect(scopeStructureIssue(nodes)).toBe("SCOPE_TOO_DEEP");
  });

  it("rejects duplicate node ids", () => {
    expect(scopeStructureIssue([topic("t1", "Cells"), topic("t1", "Enzymes")])).toBe(
      "DUPLICATE_SCOPE_NODE"
    );
  });

  it("rejects an unknown parent", () => {
    expect(scopeStructureIssue([topic("t1", "Cells", "missing-parent")])).toBe(
      "UNKNOWN_SCOPE_PARENT"
    );
  });

  it("rejects a parent cycle", () => {
    expect(scopeStructureIssue([topic("a", "A", "b"), topic("b", "B", "a")])).toBe(
      "SCOPE_CYCLE"
    );
  });

  it("rejects an EXAM brief whose horizon does not end on the exam date", () => {
    const brief = valid("EXAM");
    brief.target.endDate = "2030-01-20";
    expect(PlanBriefV1Schema.safeParse(brief).success).toBe(false);
  });

  it("rejects a Sylf subject without its id", () => {
    const brief = valid();
    brief.subject = { kind: "SYLF_SUBJECT", subjectId: null, name: "Chemistry" };
    expect(PlanBriefV1Schema.safeParse(brief).success).toBe(false);
  });

  it("rejects a free-text subject without a name", () => {
    const brief = valid();
    brief.subject = { kind: "FREE_TEXT", subjectId: null, name: null };
    expect(PlanBriefV1Schema.safeParse(brief).success).toBe(false);
  });
});

describe("sparse preparedness", () => {
  it("parses with entries for only some nodes and returns undefined for the rest", () => {
    const brief = valid();
    brief.preparedness = [{ nodeId: "t1", covered: true, confidence: 4, difficult: false }];
    const parsed = PlanBriefV1Schema.parse(brief);
    expect(parsed.preparedness).toHaveLength(1);
    expect(preparednessFor(parsed, "t1")).toMatchObject({ nodeId: "t1", covered: true });
    expect(preparednessFor(parsed, "t2")).toBeUndefined();
  });

  it("keeps unstated answers null rather than coercing to false or 1", () => {
    const brief = valid();
    brief.scope.nodes = [topic("t1", "Cells")];
    brief.preparedness = [{ nodeId: "t1", covered: null, confidence: null, difficult: null }];
    const parsed = PlanBriefV1Schema.parse(brief);
    expect(parsed.preparedness[0]).toEqual({
      nodeId: "t1",
      covered: null,
      confidence: null,
      difficult: null,
    });
    expect(parsed.preparedness[0].covered).toBeNull();
    expect(parsed.preparedness[0].confidence).toBeNull();
    expect(parsed.preparedness[0].difficult).toBeNull();
  });
});

describe("authority ladder", () => {
  it("never lets a lower authority overwrite a higher one", () => {
    expect(BRIEF_AUTHORITIES).toHaveLength(6);
    // An unset field accepts anything.
    expect(mayApplyAuthority(undefined, "MODEL_SUGGESTION")).toBe(true);
    // A higher authority always wins.
    expect(mayApplyAuthority("MODEL_SUGGESTION", "USER_CURRENT")).toBe(true);
    // A lower authority cannot overwrite a higher one.
    expect(mayApplyAuthority("USER_CURRENT", "MODEL_SUGGESTION")).toBe(false);
    // The same authority may re-state.
    expect(mayApplyAuthority("USER_CONFIRMED_BRIEF", "USER_CONFIRMED_BRIEF")).toBe(true);
    expect(mayApplyAuthority("RESEARCH_CONFIRMED", "SYLF_DATA")).toBe(false);
    expect(mayApplyAuthority("SYLF_DATA", "RESEARCH_CONFIRMED")).toBe(true);
  });
});

describe("flattenScope", () => {
  it("disambiguates duplicate labels without touching what the student sees", () => {
    const nodes = [
      node("c1", "Chapter 1", "CHAPTER", null),
      topic("a1", "Algebra", "c1"),
      node("c2", "Chapter 2", "CHAPTER", null),
      topic("a2", "Algebra", "c2"),
    ];
    // The raw topics are duplicates the engine would reject ...
    expect(duplicateScopeLabels(nodes.filter((entry) => entry.kind === "TOPIC"))).toBe(true);

    const flat = flattenScope(nodes);
    const labels = flat.units.map((unit) => unit.label);
    // ... but the flattened engine labels are unique case-insensitively.
    expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(labels.length);
    // displayLabel keeps the original wording for the UI.
    expect(flat.units.map((unit) => unit.displayLabel)).toEqual(["Algebra", "Algebra"]);
    // The engine-facing scope string is exactly the joined labels.
    expect(flat.scope).toBe(labels.join("\n"));
  });

  it("flattens a small selected tree to topic units in one segment", () => {
    const nodes = [
      node("c1", "Chapter 1", "CHAPTER", null),
      topic("a1", "Algebra", "c1"),
      topic("a2", "Geometry", "c1"),
    ];
    const flat = flattenScope(nodes, { unitCap: 10 });
    expect(flat.strategy).toBe("TOPIC_UNITS");
    expect(flat.units.map((unit) => unit.nodeId)).toEqual(["a1", "a2"]);
    expect(flat.segments).toHaveLength(1);
    expect(flat.scope).toBe("Algebra\nGeometry");
    expect(flat.leafCount).toBe(2);
  });

  it("coarsens to chapter units when the selected topics exceed the cap", () => {
    const nodes = [
      node("c1", "Chapter 1", "CHAPTER", null),
      topic("a1", "A1", "c1"),
      topic("a2", "A2", "c1"),
      node("c2", "Chapter 2", "CHAPTER", null),
      topic("b1", "B1", "c2"),
    ];
    const flat = flattenScope(nodes, { unitCap: 2 });
    expect(flat.strategy).toBe("CHAPTER_UNITS");
    expect(flat.units.map((unit) => unit.nodeId)).toEqual(["c1", "c2"]);
    expect(flat.units.every((unit) => unit.coarsened)).toBe(true);
    expect(flat.segments).toHaveLength(1);
    // The original fine-grained count is preserved even though units were coarsened.
    expect(flat.leafCount).toBe(3);
    // The detailed children stay in the brief for review and traceability.
    expect(nodes.filter((entry) => entry.kind === "TOPIC")).toHaveLength(3);
  });

  it("segments contiguously, covering every unit and dropping nothing", () => {
    const nodes = [
      node("c1", "Ch1", "CHAPTER", null),
      topic("a1", "A1", "c1"),
      node("c2", "Ch2", "CHAPTER", null),
      topic("b1", "B1", "c2"),
      node("c3", "Ch3", "CHAPTER", null),
      topic("d1", "D1", "c3"),
    ];
    const flat = flattenScope(nodes, { unitCap: 2 });
    expect(flat.strategy).toBe("SEGMENTED");
    expect(flat.segments).toEqual([
      { labels: ["Ch1", "Ch2"], nodeIds: ["c1", "c2"] },
      { labels: ["Ch3"], nodeIds: ["c3"] },
    ]);
    // Every unit appears exactly once across contiguous segments; nothing is dropped.
    expect(flat.segments.flatMap((segment) => segment.labels)).toEqual(["Ch1", "Ch2", "Ch3"]);
    expect(flat.leafCount).toBe(3);
  });
});
