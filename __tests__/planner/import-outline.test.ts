// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseOutline } from "@/lib/planner/import/outline";
import { BRIEF_LIMITS, scopeStructureIssue } from "@/lib/planner/intake/brief";

describe("parseOutline", () => {
  it("nests indentation into section → chapter → topic", () => {
    const { nodes, issue } = parseOutline(
      "Algebra\n  Linear equations\n    Slope\n    Intercepts\n  Quadratics\nGeometry\n  Triangles"
    );
    expect(issue).toBeNull();
    expect(nodes.map((n) => [n.label, n.kind])).toEqual([
      ["Algebra", "SECTION"],
      ["Linear equations", "CHAPTER"],
      ["Slope", "TOPIC"],
      ["Intercepts", "TOPIC"],
      ["Quadratics", "CHAPTER"],
      ["Geometry", "SECTION"],
      ["Triangles", "CHAPTER"],
    ]);
    const algebra = nodes[0];
    const linear = nodes[1];
    const slope = nodes[2];
    expect(linear.parentId).toBe(algebra.nodeId);
    expect(slope.parentId).toBe(linear.nodeId);
    expect(nodes[3].parentId).toBe(linear.nodeId);
  });

  it("treats tabs as a nesting step just like spaces", () => {
    const { nodes } = parseOutline("Algebra\n\tLinear equations\n\t\tSlope\nGeometry\n\tTriangles");
    expect(nodes.map((n) => [n.label, n.kind])).toEqual([
      ["Algebra", "SECTION"],
      ["Linear equations", "CHAPTER"],
      ["Slope", "TOPIC"],
      ["Geometry", "SECTION"],
      ["Triangles", "CHAPTER"],
    ]);
  });

  it("strips bullet and numbered markers", () => {
    const { nodes } = parseOutline(
      "- Cell biology\n  1. Cells\n  1.2 Cell division\n  (a) Mitosis\n  i. Meiosis"
    );
    expect(nodes.map((n) => n.label)).toEqual([
      "Cell biology",
      "Cells",
      "Cell division",
      "Mitosis",
      "Meiosis",
    ]);
    expect(nodes[0].kind).toBe("SECTION");
    expect(nodes.slice(1).every((n) => n.kind === "CHAPTER")).toBe(true);

    // A bare numbered list is still a flat list of topics.
    const flat = parseOutline("1. Cells\n1.2 Organelles\n1.3 Tissues");
    expect(flat.nodes.map((n) => n.label)).toEqual(["Cells", "Organelles", "Tissues"]);
    expect(flat.nodes.every((n) => n.kind === "TOPIC" && n.parentId === null)).toBe(true);
  });

  it("maps markdown headings to SECTION → CHAPTER → TOPIC", () => {
    const { nodes, issue } = parseOutline(
      "# Biology\n## Cell biology\n### Cells\n### Cell division\n## Genetics\n### DNA"
    );
    expect(issue).toBeNull();
    expect(nodes.map((n) => [n.label, n.kind])).toEqual([
      ["Biology", "SECTION"],
      ["Cell biology", "CHAPTER"],
      ["Cells", "TOPIC"],
      ["Cell division", "TOPIC"],
      ["Genetics", "CHAPTER"],
      ["DNA", "TOPIC"],
    ]);
    expect(nodes[1].parentId).toBe(nodes[0].nodeId);
    expect(nodes[2].parentId).toBe(nodes[1].nodeId);
    expect(nodes[5].parentId).toBe(nodes[4].nodeId);
  });

  it("turns a bare flat list into topics with no parent", () => {
    const { nodes, issue } = parseOutline("Cells\nEnzymes\nPhotosynthesis");
    expect(issue).toBeNull();
    expect(nodes).toEqual([
      { nodeId: "u-cells", label: "Cells", kind: "TOPIC", parentId: null, selected: true },
      { nodeId: "u-enzymes", label: "Enzymes", kind: "TOPIC", parentId: null, selected: true },
      { nodeId: "u-photosynthesis", label: "Photosynthesis", kind: "TOPIC", parentId: null, selected: true },
    ]);
  });

  it("strips a trailing colon but preserves one inside the wording", () => {
    const { nodes } = parseOutline("Cell biology:\n  Cells\n  Cell division");
    expect(nodes.map((n) => n.label)).toEqual(["Cell biology", "Cells", "Cell division"]);

    const ratio = parseOutline("Ratio: proportion");
    expect(ratio.nodes[0].label).toBe("Ratio: proportion");
  });

  it("handles CRLF, blank lines and whitespace-only lines", () => {
    const { nodes, issue } = parseOutline("Cells\r\n\r\n  Cell division\r\nEnzymes\r\n  \r\n");
    expect(issue).toBeNull();
    expect(nodes.map((n) => n.label)).toEqual(["Cells", "Cell division", "Enzymes"]);
  });

  it("preserves the student's wording, only collapsing internal whitespace", () => {
    const { nodes } = parseOutline("  Cell   division\n  weIrD-CasING\n  The  quick   brown");
    expect(nodes.map((n) => n.label)).toEqual([
      "Cell division",
      "weIrD-CasING",
      "The quick brown",
    ]);
  });

  it("clamps indentation deeper than three levels to TOPIC under its chapter", () => {
    const { nodes, issue } = parseOutline("A\n  B\n    C\n      D\n        E");
    expect(issue).toBeNull();
    const [a, b, c, d, e] = nodes;
    expect([a.kind, b.kind, c.kind, d.kind, e.kind]).toEqual([
      "SECTION",
      "CHAPTER",
      "TOPIC",
      "TOPIC",
      "TOPIC",
    ]);
    // The clamped nodes attach to the chapter, not to each other, so depth stays at 3.
    expect(c.parentId).toBe(b.nodeId);
    expect(d.parentId).toBe(b.nodeId);
    expect(e.parentId).toBe(b.nodeId);
    expect(scopeStructureIssue(nodes)).toBeNull();
  });

  it("derives deterministic ids and is idempotent", () => {
    const text = "Cell biology\n  Cells\n  Cell division\nBiochemistry\n  Enzymes";
    expect(parseOutline(text)).toEqual(parseOutline(text));
    // Two labels that slug identically stay distinct, exactly like scope-sync.
    const { nodes } = parseOutline("Cell biology\nCell biology!");
    expect(nodes.map((n) => n.nodeId)).toEqual(["u-cell-biology", "u-cell-biology-2"]);
  });

  it("reports OUTLINE_TOO_LARGE rather than silently truncating", () => {
    const { nodes, issue } = parseOutline("1\n2\n3\n4\n5", { maxNodes: 3 });
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.label)).toEqual(["1", "2", "3"]);
    expect(issue).toBe("OUTLINE_TOO_LARGE");

    // The default ceiling is the brief's own node cap.
    const many = Array.from({ length: BRIEF_LIMITS.scopeNodes + 1 }, (_, i) => `Topic ${i}`).join("\n");
    const capped = parseOutline(many);
    expect(capped.nodes).toHaveLength(BRIEF_LIMITS.scopeNodes);
    expect(capped.issue).toBe("OUTLINE_TOO_LARGE");
  });

  it("self-checks the tree and never hands back a structurally malformed result", () => {
    for (const text of [
      "A\n  B\n    C\n      D\n        E", // deep indentation is clamped, not orphaned
      "# A\n### C\n## B", // heading level jump
      "Cell biology\nCell biology!", // slug collision
    ]) {
      const { nodes, issue } = parseOutline(text);
      expect(scopeStructureIssue(nodes)).toBeNull();
      expect(issue).toBeNull();
    }
  });
});
