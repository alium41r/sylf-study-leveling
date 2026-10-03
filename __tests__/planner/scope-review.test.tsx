import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import ScopeReview, {
  type ScopeConfirmResult,
  type ScopeReviewProps,
} from "@/app/components/planner/quick-plan/ScopeReview";
import SourcePanel from "@/app/components/planner/quick-plan/SourcePanel";
import type { ScopeNode } from "@/lib/planner/intake/scope-node";
import type { ResearchSource } from "@/lib/planner/research/contracts";

/**
 * Scope review and provenance, as contract behaviour.
 *
 * These tests assert what the student is told — the words, the checked ids, the
 * renames — never pixels. The two honesty rules they pin down are that a change
 * is *said* (a parent's checkbox names its descendants before unchecking them)
 * and that provenance is *text* ("Official"/"Secondary"), never a colour.
 */

const nodes: ScopeNode[] = [
  { nodeId: "s-bio", label: "Biology", kind: "SECTION", parentId: null, selected: true, sourceIds: ["src-official"] },
  { nodeId: "c-cells", label: "Cell biology", kind: "CHAPTER", parentId: "s-bio", selected: true },
  { nodeId: "t-cells", label: "Cell structure", kind: "TOPIC", parentId: "c-cells", selected: true },
  { nodeId: "t-div", label: "Cell division", kind: "TOPIC", parentId: "c-cells", selected: true },
  { nodeId: "c-gen", label: "Genetics", kind: "CHAPTER", parentId: "s-bio", selected: true },
  { nodeId: "t-inh", label: "Inheritance", kind: "TOPIC", parentId: "c-gen", selected: true },
];

const sources: ResearchSource[] = [
  {
    sourceId: "src-official",
    url: "https://www.cambridgeinternational.org/spec-2026",
    title: "Biology Specification 2026",
    publisherOrDomain: "cambridgeinternational.org",
    sourceType: "OFFICIAL",
    retrievedAt: "2030-01-05T10:00:00.000Z",
    documentDate: "2026",
    nodeIds: ["s-bio"],
    mappingConfidence: "HIGH",
  },
  {
    sourceId: "src-secondary",
    url: "https://prepblog.com/biology",
    title: "Biology revision notes",
    publisherOrDomain: "prepblog.com",
    sourceType: "SECONDARY",
    retrievedAt: "2030-01-06T10:00:00.000Z",
    documentDate: null,
    nodeIds: ["c-cells"],
    mappingConfidence: "LOW",
  },
];

/** Over 20 nodes, so the filter input appears. */
const manyNodes: ScopeNode[] = [
  { nodeId: "s-bio", label: "Biology", kind: "SECTION", parentId: null, selected: true },
  { nodeId: "c-plants", label: "Plant biology", kind: "CHAPTER", parentId: "s-bio", selected: true },
  { nodeId: "t-photo", label: "Photosynthesis", kind: "TOPIC", parentId: "c-plants", selected: true },
  ...Array.from({ length: 9 }, (_, i) => ({
    nodeId: `c-${i}`,
    label: `Chapter ${i}`,
    kind: "CHAPTER" as const,
    parentId: "s-bio",
    selected: true,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    nodeId: `t-${i}`,
    label: `Topic ${i}`,
    kind: "TOPIC" as const,
    parentId: `c-${i}`,
    selected: true,
  })),
];

const makeProps = (over: Partial<ScopeReviewProps> = {}): ScopeReviewProps => ({
  nodes,
  sources,
  summary: "Biology syllabus, 3 topics across 2 chapters.",
  openQuestions: ["Is the specification for the 2026 sitting?"],
  status: "OK",
  onConfirm: vi.fn(),
  onDiscard: vi.fn(),
  ...over,
});

const axeOptions = {
  rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("ScopeReview", () => {
  it("renders the SECTION → CHAPTER → TOPIC hierarchy with the student's own labels", () => {
    render(<ScopeReview {...makeProps()} />);
    expect(screen.getByRole("checkbox", { name: /Deselect Biology/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "2 chapters under Biology" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Deselect Cell biology/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "2 topics under Cell biology" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "1 topic under Genetics" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Deselect Cell structure" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Deselect Cell division" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Deselect Inheritance" })).toBeInTheDocument();
  });

  it("confirms only the checked node ids and reports the renames the student typed", () => {
    const onConfirm = vi.fn();
    render(<ScopeReview {...makeProps({ onConfirm })} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Deselect Cell division" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Inheritance" }));
    fireEvent.change(screen.getByLabelText("Rename Inheritance"), {
      target: { value: "Mendelian inheritance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use these units" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const result = onConfirm.mock.calls[0][0] as ScopeConfirmResult;
    expect(result.nodeIds).toContain("s-bio");
    expect(result.nodeIds).toContain("c-cells");
    expect(result.nodeIds).toContain("c-gen");
    expect(result.nodeIds).toContain("t-cells");
    expect(result.nodeIds).toContain("t-inh");
    expect(result.nodeIds).not.toContain("t-div");
    expect(result.renames).toEqual([{ nodeId: "t-inh", label: "Mendelian inheritance" }]);
  });

  it("unchecking a parent unchecks its descendants, and the name says so beforehand", () => {
    render(<ScopeReview {...makeProps()} />);
    // The accessible name warns about the cascade *before* the click.
    expect(
      screen.getByRole("checkbox", { name: "Deselect Biology and its 3 selected child topics" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Deselect Biology and its 3/ }));

    expect(screen.getByRole("checkbox", { name: "Select Biology" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Cell structure" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Cell division" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Inheritance" })).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toContain("0 of 3 topics selected");
  });

  it("search filters rows and keeps a matching topic's ancestors visible", () => {
    render(<ScopeReview {...makeProps({ nodes: manyNodes, sources: [] })} />);
    fireEvent.change(screen.getByLabelText("Filter scope"), {
      target: { value: "Photosynthesis" },
    });

    expect(screen.getByRole("checkbox", { name: "Deselect Photosynthesis" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Deselect Plant biology/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Deselect Biology/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Topic 0/ })).toBeNull();
  });

  it("reports the selected count in a live region and updates it on toggle", () => {
    render(<ScopeReview {...makeProps()} />);
    expect(screen.getByRole("status").textContent).toContain("3 of 3 topics selected");
    expect(screen.getByRole("status").textContent).toContain("1 of 1 section");

    fireEvent.click(screen.getByRole("checkbox", { name: "Deselect Cell structure" }));
    expect(screen.getByRole("status").textContent).toContain("2 of 3 topics selected");
  });

  it("shows the not-official note for WEAK and no tree for UNAVAILABLE", () => {
    const { unmount } = render(<ScopeReview {...makeProps({ status: "WEAK" })} />);
    expect(screen.getByText(/not found on an official source/)).toBeInTheDocument();
    // A weak candidate still has a reviewable tree.
    expect(screen.getByRole("checkbox", { name: /Deselect Biology/ })).toBeInTheDocument();
    unmount();

    render(<ScopeReview {...makeProps({ status: "UNAVAILABLE" })} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Use these units" })).toBeNull();
    expect(screen.getByText(/Biology syllabus, 3 topics/)).toBeInTheDocument();
    expect(screen.getByText("Is the specification for the 2026 sitting?")).toBeInTheDocument();
  });

  it("states the pages read for a partial import and never claims completeness", () => {
    render(
      <ScopeReview
        {...makeProps({
          partial: true,
          partialReason: "NO_TEXT_LAYER",
          pages: [{ from: 1, to: 3 }],
        })}
      />
    );
    expect(screen.getByText(/Pages read: 1–3/)).toBeInTheDocument();
    expect(screen.getByText(/no readable text layer/)).toBeInTheDocument();
    expect(screen.getByText(/Some content may be missing/)).toBeInTheDocument();
    expect(screen.queryByText(/complete/i)).toBeNull();
  });

  it("gives every checkbox and disclosure an accessible name", () => {
    render(<ScopeReview {...makeProps()} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    for (const box of boxes) expect(box).toHaveAccessibleName();
    const disclosures = screen.getAllByRole("group");
    expect(disclosures).toHaveLength(3);
    for (const disclosure of disclosures) expect(disclosure).toHaveAccessibleName();
  });

  it("appends an added topic to the confirm payload under a local id", () => {
    const onConfirm = vi.fn();
    render(<ScopeReview {...makeProps({ onConfirm })} />);

    fireEvent.change(screen.getByLabelText("Add a topic"), { target: { value: "Plant transport" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("checkbox", { name: "Deselect Plant transport" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use these units" }));
    const result = onConfirm.mock.calls[0][0] as ScopeConfirmResult;
    // A unit the student typed is reported as an *addition*, not as a candidate node:
    // the server refuses an id the candidate never contained, and an added unit must
    // never inherit the source's provenance.
    expect(result.nodeIds).not.toContain("local-plant-transport");
    expect(result.additions.map((node) => node.nodeId)).toContain("local-plant-transport");
    expect(result.additions.every((node) => node.sourceIds === undefined)).toBe(true);
  });

  it("passes axe on the default OK state", async () => {
    const { container } = render(<ScopeReview {...makeProps()} />);
    const results = await axe.run(container, axeOptions);
    expect(results.violations).toEqual([]);
  });
});

describe("SourcePanel", () => {
  it("communicates the source type as text, never class names", () => {
    const { container } = render(<SourcePanel sources={sources} />);
    const rows = container.querySelectorAll("li");
    /**
     * The label appears on the row *and* in the legend that explains what the type
     * means (UX Phase 3 §4), so the assertion is scoped to the rows: what must never be
     * a colour or a class is the marker a student reads next to the source itself.
     */
    expect([...rows].map((row) => row.querySelector("span")?.textContent)).toEqual([
      "Official",
      "Secondary",
    ]);
    const link = screen.getByRole("link", {
      name: "Official source: Biology Specification 2026 — cambridgeinternational.org",
    });
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("explains what each type present actually means, once", () => {
    render(<SourcePanel sources={sources} />);
    // One definition per type present, in words: "Official" is the verified authority
    // for this target, and "Secondary" is explicitly not an authority.
    expect(screen.getByText(/Verified as an authority for this exam or curriculum/)).toBeInTheDocument();
    expect(screen.getByText(/not an authority/)).toBeInTheDocument();
  });

  it("renders a user upload as text with no link", () => {
    const upload: ResearchSource = {
      sourceId: "src-upload",
      url: "https://upload.sylf.local/syllabus",
      title: "My syllabus.pdf",
      publisherOrDomain: null,
      sourceType: "USER_UPLOAD",
      retrievedAt: "2030-01-04T10:00:00.000Z",
      documentDate: null,
      nodeIds: [],
      mappingConfidence: "HIGH",
    };
    const { container } = render(<SourcePanel sources={[upload]} />);
    expect(container.querySelector("li span")?.textContent).toBe("Your upload");
    expect(screen.getByText("My syllabus.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says nothing to cite when there are no sources", () => {
    render(<SourcePanel sources={[]} />);
    expect(screen.getByText("No public source was used for this scope.")).toBeInTheDocument();
  });
});
