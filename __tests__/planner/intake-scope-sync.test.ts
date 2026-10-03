// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseScopeLines, scopeText, syncScopeNodes } from "@/lib/planner/intake/scope-sync";

const node = (nodeId: string, label: string) => ({
  nodeId,
  label,
  kind: "TOPIC" as const,
  parentId: null,
  selected: true,
});

/**
 * Manual scope entry is a text list over a stored tree. The property that matters most
 * is identity: a unit the student did not rename must keep its `nodeId`, because that
 * is what their stated preparedness is keyed by. If an edit re-created nodes, every
 * rating they had given would vanish without a word.
 */
describe("scope text list ↔ scope tree", () => {
  it("reads one unit per line, normalising whitespace and dropping blanks", () => {
    expect(parseScopeLines("  Cells \n\n  Cell   division\nEnzymes\n")).toEqual([
      "Cells",
      "Cell division",
      "Enzymes",
    ]);
  });

  it("treats a repeated line as the same unit, since the engine requires unique labels", () => {
    expect(parseScopeLines("Cells\ncells\nCELLS")).toEqual(["Cells"]);
    expect(parseScopeLines("Cells\nEnzymes\ncells ")).toEqual(["Cells", "Enzymes"]);
  });

  it("keeps the identity of every unit that was not renamed", () => {
    const existing = [node("u-cells", "Cells"), node("u-enzymes", "Enzymes")];
    const sync = syncScopeNodes(existing, ["Cells", "Enzymes", "Photosynthesis"]);
    expect(sync.nodes.map((entry) => entry.nodeId)).toEqual([
      "u-cells",
      "u-enzymes",
      "u-photosynthesis",
    ]);
    // Nothing renamed, nothing removed: only the new unit is sent.
    expect(sync.rename).toEqual([]);
    expect(sync.remove).toEqual([]);
    expect(sync.add).toEqual([node("u-photosynthesis", "Photosynthesis")]);
  });

  it("renames in place rather than replacing the unit", () => {
    const existing = [node("u-cells", "Cells"), node("u-enzymes", "Enzymes")];
    const sync = syncScopeNodes(existing, ["Cell structure", "Enzymes"]);
    expect(sync.rename).toEqual([{ nodeId: "u-cells", label: "Cell structure" }]);
    expect(sync.remove).toEqual([]);
    expect(sync.add).toEqual([]);
    // The unit keeps its id, so its stated preparedness survives the rename.
    expect(sync.nodes[0]).toMatchObject({ nodeId: "u-cells", label: "Cell structure" });
  });

  it("removes what the student deleted from the list", () => {
    const existing = [node("u-cells", "Cells"), node("u-enzymes", "Enzymes")];
    const sync = syncScopeNodes(existing, ["Enzymes"]);
    expect(sync.remove).toEqual(["u-cells"]);
    expect(sync.nodes.map((entry) => entry.nodeId)).toEqual(["u-enzymes"]);
  });

  it("is idempotent: saving the same text twice changes nothing", () => {
    const first = syncScopeNodes([], parseScopeLines("Cells\nEnzymes"));
    const second = syncScopeNodes(first.nodes, parseScopeLines(scopeText(first.nodes)));
    expect(second.add).toEqual([]);
    expect(second.rename).toEqual([]);
    expect(second.remove).toEqual([]);
    expect(second.nodes).toEqual(first.nodes);
  });

  it("matches a renamed unit's identity case-insensitively", () => {
    const existing = [node("u-cells", "Cells")];
    const sync = syncScopeNodes(existing, ["cells"]);
    // Only the casing changed, and the unit keeps its id and its ratings.
    expect(sync.rename).toEqual([{ nodeId: "u-cells", label: "cells" }]);
    expect(sync.nodes[0].nodeId).toBe("u-cells");
  });

  it("derives deterministic ids, including for a label that repeats across kinds", () => {
    const sync = syncScopeNodes([], ["Cell biology", "Cell biology!"]);
    expect(sync.nodes.map((entry) => entry.nodeId)).toEqual(["u-cell-biology", "u-cell-biology-2"]);
  });

  it("sends only what changed, while still describing the whole list", () => {
    const existing = [node("u-cells", "Cells")];
    const sync = syncScopeNodes(existing, ["Cells", "Enzymes"]);
    // Only the new unit travels: re-sending the unchanged one would be noise, and a
    // retried action must not be able to duplicate it.
    expect(sync.add.map((entry) => entry.label)).toEqual(["Enzymes"]);
    expect(sync.changed).toBe(true);
    expect(scopeText(sync.nodes)).toBe("Cells\nEnzymes");
  });

  it("reports no change when the text already matches the tree", () => {
    const existing = [node("u-cells", "Cells")];
    const sync = syncScopeNodes(existing, ["Cells"]);
    expect(sync.changed).toBe(false);
    expect(sync.nodes).toEqual(existing);
  });
});

/**
 * A typed range becomes the units it names.
 *
 * Nobody types ten chapter names from memory. They type the range they were told to
 * cover — this is what a student actually writes into the scope box — and before this
 * that line became ONE unit called "chapters 1-10", so the plan had one item on it and
 * the only way to get ten was to look all ten up and type them out.
 *
 * The expansion is deterministic and local on purpose: it never guesses what a chapter is
 * *called*. Research does that, against the real specification. This makes the manual path
 * usable on its own, which is the common case for a single paper.
 */
describe("a typed range expands into the units it names", () => {
  it("expands the line a student would actually type, keeping what says which paper it is", () => {
    // The whole point: "A-Level Physics P2" is not a chapter, and dropping it would lose
    // the only part of the line that says which chapters these are.
    expect(parseScopeLines("A-Level Physics P2 chapters 1-10")).toEqual([
      "A-Level Physics P2 Chapter 1",
      "A-Level Physics P2 Chapter 2",
      "A-Level Physics P2 Chapter 3",
      "A-Level Physics P2 Chapter 4",
      "A-Level Physics P2 Chapter 5",
      "A-Level Physics P2 Chapter 6",
      "A-Level Physics P2 Chapter 7",
      "A-Level Physics P2 Chapter 8",
      "A-Level Physics P2 Chapter 9",
      "A-Level Physics P2 Chapter 10",
    ]);
  });

  it("agrees with the noun the student used", () => {
    expect(parseScopeLines("Chapters 1-3")).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
    expect(parseScopeLines("chapter 1-3")).toEqual(["chapter 1", "chapter 2", "chapter 3"]);
    expect(parseScopeLines("Units 1-2")).toEqual(["Unit 1", "Unit 2"]);
    expect(parseScopeLines("Topics 5-7")).toEqual(["Topic 5", "Topic 6", "Topic 7"]);
  });

  it("accepts the ways people write a range", () => {
    expect(parseScopeLines("Chapters 1 to 3")).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
    expect(parseScopeLines("Chapters 1 through 3")).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
    expect(parseScopeLines("Chapters 1–3")).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
    expect(parseScopeLines("Chapters 1 - 3")).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
    expect(parseScopeLines("Topics 3-6")[0]).toBe("Topic 3");
  });

  it("expands a bare range as the numbers themselves", () => {
    expect(parseScopeLines("1-4")).toEqual(["1", "2", "3", "4"]);
  });

  it("leaves alone anything that only looks like a range", () => {
    // Every one of these is a real thing a student types, and expanding any of them would
    // invent units they never asked for.
    const untouched = [
      "Paper 4, first 5 chapters", // a goal fragment, and the exact text from the bug report
      "CAIE A-Level Physics 9702", // a qualification with a code in it
      "9709",
      "A-Level",
      "2020-2024", // a year range: three digits maximum is what keeps this out
      "Chapters 1-10 review", // a unit *called* that, not ten units
      "Unit 3.2",
      "Chapters 10-10", // a range of one is just the one
      "Chapters 10-1", // backwards
    ];
    for (const line of untouched) expect(parseScopeLines(line)).toEqual([line]);
  });

  it("will not materialise a scope nobody looked at", () => {
    // A 150-chapter range is a typo or a different intent. Passing the line through means
    // the student sees exactly what they wrote and can split it themselves.
    expect(parseScopeLines("Chapters 1-150")).toEqual(["Chapters 1-150"]);
    // …while a real range is nowhere near the ceiling.
    expect(parseScopeLines("Chapters 1-60")).toHaveLength(60);
  });

  it("mixes expanded and typed lines, and deduplicates across them", () => {
    expect(parseScopeLines("Mechanics\nChapters 1-3\nchapter 2")).toEqual([
      "Mechanics",
      "Chapter 1",
      "Chapter 2",
      "Chapter 3",
    ]);
  });

  it("keeps the property the rest of this file is about: a re-save changes nothing", () => {
    // Expansion happens on the way in, so the stored list is ten ordinary labels. Re-saving
    // the text the editor shows must therefore be a no-op — no renames, no re-adds, and
    // above all no loss of the preparedness keyed to those ids.
    const first = parseScopeLines("Chapters 1-3");
    const nodes = syncScopeNodes([], first).nodes;
    const second = parseScopeLines(scopeText(nodes));
    expect(second).toEqual(first);
    const resync = syncScopeNodes(nodes, second);
    expect(resync.changed).toBe(false);
    expect(resync.nodes.map((node) => node.nodeId)).toEqual(nodes.map((node) => node.nodeId));
  });
});
