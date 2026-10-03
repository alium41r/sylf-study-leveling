import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import PreparednessMatrix from "@/app/components/planner/quick-plan/PreparednessMatrix";
import OverlapReview from "@/app/components/planner/quick-plan/OverlapReview";
import BackgroundCurriculumControl, {
  parseSubjects,
} from "@/app/components/planner/quick-plan/BackgroundCurriculumControl";
import { emptyComparisonView, type IntakeComparisonView } from "@/lib/planner/intake/actions";
import type { BriefPreparedness, ScopeNode } from "@/lib/planner/intake/brief";
import type { ComparisonUnit } from "@/lib/planner/comparison/contracts";

/**
 * The Phase 3 surfaces, as a student meets them.
 *
 * These are contract tests, not pixel tests: one-click states with real names, a bulk
 * action that reaches a whole chapter, a matrix that can be skipped entirely, the
 * uncertainty-first order of the overlap map, and the one explanation shown once.
 */

afterEach(cleanup);

const axeOptions = {
  rules: {
    // jsdom has no layout, so region/landmark and colour rules cannot be evaluated.
    region: { enabled: false },
    "color-contrast": { enabled: false },
  },
} as const;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const topic = (nodeId: string, label: string, parentId: string | null): ScopeNode => ({
  nodeId,
  label,
  kind: "TOPIC",
  parentId,
  selected: true,
});

const chapter = (nodeId: string, label: string): ScopeNode => ({
  nodeId,
  label,
  kind: "CHAPTER",
  parentId: null,
  selected: true,
});

/** Two chapters, four topics: enough for grouping and bulk behaviour. */
const nodes: ScopeNode[] = [
  chapter("c1", "Algebra"),
  topic("t1", "Matrices", "c1"),
  topic("t2", "Sequences and series", "c1"),
  chapter("c2", "Calculus"),
  topic("t3", "Differentiation", "c2"),
  topic("t4", "Integration", "c2"),
];

const prep = (nodeId: string, over: Partial<BriefPreparedness> = {}): BriefPreparedness => ({
  nodeId,
  covered: null,
  confidence: null,
  difficult: null,
  ...over,
});

const unit = (unitRef: string, overlap: ComparisonUnit["overlap"]): ComparisonUnit => ({
  unitRef,
  overlap,
  confidence: overlap === "UNCLEAR" ? "LOW" : "MEDIUM",
  sourceIds: overlap === "UNCLEAR" ? [] : ["src-1"],
  explanationCode:
    overlap === "UNCLEAR"
      ? "EVIDENCE_INCONCLUSIVE"
      : overlap === "LIKELY_NEW_TO_CURRICULUM"
        ? "NOT_IN_BACKGROUND_CURRICULUM"
        : "BACKGROUND_TOPIC_MATCH",
});

const comparison = (over: Partial<IntakeComparisonView> = {}): IntakeComparisonView =>
  emptyComparisonView({
    available: true,
    state: "READY",
    status: "OK",
    backgroundLabel: "CAIE A-Level",
    summary: "Compared with your CAIE A-Level background.",
    providerVersion: "deepseek-search-comparison-v1",
    createdAt: "2030-01-05T00:00:00.000Z",
    units: [
      unit("t1", "LIKELY_COVERED_BY_CURRICULUM"),
      unit("t2", "PARTIAL_OVERLAP"),
      unit("t3", "LIKELY_NEW_TO_CURRICULUM"),
      unit("t4", "UNCLEAR"),
    ],
    counts: { covered: 1, partial: 1, isNew: 1, unclear: 1, total: 4 },
    suggestionRefs: ["t1"],
    sources: [
      {
        sourceId: "src-1",
        url: "https://www.cambridgeinternational.org/spec-9709.pdf",
        title: "Cambridge 9709",
        publisherOrDomain: "cambridgeinternational.org",
        sourceType: "OFFICIAL_PDF",
        retrievedAt: "2030-01-05T00:00:00.000Z",
        documentDate: "2026",
        nodeIds: [],
        mappingConfidence: "MEDIUM",
      },
    ],
    ...over,
  });

// ── The matrix ───────────────────────────────────────────────────────────────

describe("preparedness matrix: fast, optional, and no card per topic", () => {
  it("offers one click per state, each named for its unit", () => {
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[]}
        ready
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    // Six one-click states per unit, in the vocabulary the contract supports.
    for (const label of [
      "Not rated",
      "Not studied",
      "Studied, not rated",
      "Weak",
      "Okay",
      "Strong",
    ]) {
      expect(screen.getByRole("radio", { name: `${label} for Matrices` })).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "Mark Matrices as difficult" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Matrices" })).toBeInTheDocument();
    // Four units, four radio groups — not four cards with their own forms.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(4);
  });

  it("says in words that it is optional and that skipping changes nothing", () => {
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[]}
        ready
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    expect(screen.getByText(/0 of 4 units rated/)).toBeInTheDocument();
    expect(screen.getByText(/Skipping this changes nothing about generating your plan/)).toBeInTheDocument();
    expect(screen.getByText(/every unit left unrated is planned as work to learn/i)).toBeInTheDocument();
    // Nothing here says "finish rating your topics".
    expect(screen.queryByText(/finish rat/i)).toBeNull();
  });

  it("writes one unit from one click, and a whole chapter from a bulk action", () => {
    const onSetState = vi.fn();
    const onClear = vi.fn();
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[]}
        ready
        busy={false}
        onSetState={onSetState}
        onSetDifficult={() => undefined}
        onClear={onClear}
        onSetPriority={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "Weak for Matrices" }));
    expect(onSetState).toHaveBeenCalledWith(["t1"], "WEAK");

    // A chapter action reaches exactly that chapter's units.
    fireEvent.click(screen.getByRole("button", { name: 'Reset “Algebra” to not rated' }));
    expect(onClear).toHaveBeenCalledWith(["t1", "t2"]);
    fireEvent.click(screen.getByRole("button", { name: 'Mark “Calculus” as studied, not rated' }));
    expect(onSetState).toHaveBeenLastCalledWith(["t3", "t4"], "STUDIED_UNRATED");
  });

  it("applies a bulk action to the selection when there is one, and says how many", () => {
    const onSetState = vi.fn();
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[]}
        ready
        busy={false}
        onSetState={onSetState}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    expect(screen.getByText(/No selection — actions apply to all 4 units/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Matrices" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Integration" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set to strong" }));
    expect(onSetState).toHaveBeenCalledWith(["t1", "t4"], "STRONG");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText(/No selection/)).toBeInTheDocument();
  });

  it("renders the difficult flag from the stored answer, independently of state", () => {
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[prep("t1", { covered: true, confidence: null, difficult: true })]}
        ready
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    // "Studied, not rated" is a real, selected state — never a forced confidence.
    expect(screen.getByRole("radio", { name: "Studied, not rated for Matrices" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mark Matrices as difficult" })).toBeChecked();
    expect(screen.getByText(/1 of 4 units rated/)).toBeInTheDocument();
  });

  it("says out loud when Advanced setup holds a state the matrix cannot show", () => {
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[prep("t1", { covered: null, confidence: 3 })]}
        ready
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    expect(screen.getByText(/confidence 3 with coverage unstated/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Okay for Matrices" })).not.toBeChecked();
  });

  it("keeps a forty-unit scope practical: grouped, collapsible, and one row each", () => {
    const many: ScopeNode[] = [chapter("root", "Whole syllabus")];
    for (let index = 0; index < 40; index += 1)
      many.push(topic(`u${index}`, `Unit ${index + 1}`, "root"));
    const { container } = render(
      <PreparednessMatrix
        nodes={many}
        preparedness={[]}
        ready
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    // One group, collapsed while it is long: none of its forty controls is reachable
    // until the student opens it, which is the whole point of grouping.
    // The component's own disclosure is one `<details>`; the chapter group is the other.
    const groups = [...container.querySelectorAll("details")].filter((node) =>
      /Whole syllabus/.test(node.querySelector("summary")?.textContent ?? "")
    );
    expect(groups).toHaveLength(1);
    // One group of forty, collapsed while it is long: the student opens what they need
    // instead of scrolling forty sets of controls.
    expect(groups[0]).not.toHaveAttribute("open");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(40);
    expect(screen.getByText(/0 of 40 units rated/)).toBeInTheDocument();
    // The bulk toolbar is always reachable, so a whole scope can be answered without
    // opening every group.
    expect(screen.getByRole("button", { name: "Set to studied, not rated" })).toBeInTheDocument();
  });

  it("is reachable and usable by keyboard, and passes axe", async () => {
    const onSetState = vi.fn();
    const { container } = render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[]}
        ready
        busy={false}
        onSetState={onSetState}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    // Native radios: arrow keys move within the group, exactly as a browser provides.
    const weak = screen.getByRole("radio", { name: "Weak for Matrices" });
    weak.focus();
    expect(weak).toHaveFocus();
    fireEvent.click(weak);
    expect(onSetState).toHaveBeenCalledWith(["t1"], "WEAK");
    const results = await axe.run(container, axeOptions);
    expect(results.violations).toEqual([]);
  });

  it("carries priority as its own deliberate control, and never derives it", () => {
    const onSetPriority = vi.fn();
    const onSetState = vi.fn();
    render(
      <PreparednessMatrix
        nodes={nodes}
        // Two units state coverage and confidence; neither states priority.
        preparedness={[
          prep("t1", { covered: true, confidence: 5 }),
          prep("t2", { covered: false, confidence: null }),
        ]}
        ready
        busy={false}
        onSetState={onSetState}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={onSetPriority}
      />
    );
    // Its own labelled select per unit, defaulting to "no priority" — a state and a
    // priority are separate answers, and nothing infers one from the other.
    const matrices = screen.getByLabelText("Priority for Matrices");
    expect(matrices).toHaveValue("NEUTRAL");
    fireEvent.change(matrices, { target: { value: "HIGH" } });
    expect(onSetPriority).toHaveBeenCalledWith(["t1"], "HIGH");

    // Choosing a preparedness state never writes priority.
    fireEvent.click(screen.getByRole("radio", { name: "Weak for Matrices" }));
    expect(onSetState).toHaveBeenCalledWith(["t1"], "WEAK");
    expect(onSetPriority).toHaveBeenCalledTimes(1);

    // And bulk priority is a chapter action and a toolbar action, both explicit.
    fireEvent.click(screen.getByRole("button", { name: 'Mark “Algebra” high priority' }));
    expect(onSetPriority).toHaveBeenLastCalledWith(["t1", "t2"], "HIGH");
    fireEvent.click(screen.getByRole("button", { name: "Set low priority" }));
    expect(onSetPriority).toHaveBeenLastCalledWith(["t1", "t2", "t3", "t4"], "LOW");
    fireEvent.click(screen.getByRole("button", { name: "Clear priority" }));
    expect(onSetPriority).toHaveBeenLastCalledWith(["t1", "t2", "t3", "t4"], "NEUTRAL");
  });

  it("shows the stored priority, and lets a chapter be selected for any bulk action", () => {
    const onSetState = vi.fn();
    render(
      <PreparednessMatrix
        nodes={nodes}
        preparedness={[prep("t1", { priority: "HIGH", prioritySource: "USER_EXPLICIT" })]}
        ready
        busy={false}
        onSetState={onSetState}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    expect(screen.getByLabelText("Priority for Matrices")).toHaveValue("HIGH");
    expect(screen.getByLabelText("Priority for Sequences and series")).toHaveValue("NEUTRAL");

    /**
     * §24's "set whole chapter to …": one control selects the chapter, and the existing
     * toolbar then applies *any* state to exactly those rows. Without it a chapter-wide
     * answer would need one button per state per chapter.
     */
    fireEvent.click(screen.getByRole("button", { name: 'Select all of “Algebra”' }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Matrices" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Sequences and series" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Differentiation" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Set to not studied" }));
    expect(onSetState).toHaveBeenCalledWith(["t1", "t2"], "NOT_STUDIED");

    // The chapter control becomes a deselect once the chapter is fully selected.
    fireEvent.click(screen.getByRole("button", { name: 'Deselect all of “Algebra”' }));
    expect(screen.getByText(/No selection/)).toBeInTheDocument();
  });

  it("asks for nothing at all before a scope is confirmed", () => {
    render(
      <PreparednessMatrix
        nodes={[]}
        preparedness={[]}
        ready={false}
        busy={false}
        onSetState={() => undefined}
        onSetDifficult={() => undefined}
        onClear={() => undefined}
        onSetPriority={() => undefined}
      />
    );
    expect(screen.getByText(/Confirm what you need to cover first/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

// ── The overlap map ──────────────────────────────────────────────────────────

describe("overlap map: uncertainty first, and one explanation", () => {
  const handlers = {
    onCorrect: () => undefined,
    onApplySuggestion: () => undefined,
    onCompare: () => undefined,
  };

  it("summarises the four counts and explains once that it is about curricula", () => {
    render(
      <OverlapReview comparison={comparison()} nodes={nodes} busy={false} {...handlers} />
    );
    // The counts are one sentence with four emphasised numbers, so it is asserted as
    // the sentence rather than as four separate fragments.
    expect(screen.getByText(/Based on the curricula/).textContent).toMatch(
      /1 likely familiar.*1 partly overlapping.*1 likely new.*1 unclear/
    );
    // One explanation, once — never repeated per row.
    expect(
      screen.getAllByText(/This compares curriculum content, not how well you personally know it/).length
    ).toBe(1);
  });

  it("orders the groups uncertainty-first and keeps the likely-covered rows collapsed", () => {
    const { container } = render(
      <OverlapReview comparison={comparison()} nodes={nodes} busy={false} {...handlers} />
    );
    const summaries = [...container.querySelectorAll("details > summary")].map(
      (node) => node.textContent ?? ""
    );
    expect(summaries[0]).toMatch(/Not sure/);
    expect(summaries[1]).toMatch(/Not in your curriculum/);
    expect(summaries[2]).toMatch(/Partly in your curriculum/);
    expect(summaries[3]).toMatch(/In your curriculum/);
    const groups = [...container.querySelectorAll("details")];
    expect(groups[0]).toHaveAttribute("open");
    expect(groups[1]).toHaveAttribute("open");
    expect(groups[3]).not.toHaveAttribute("open");
  });

  it("lets the student correct any row, and offers the studied suggestion only where it applies", () => {
    const onCorrect = vi.fn();
    const onApplySuggestion = vi.fn();
    render(
      <OverlapReview
        comparison={comparison()}
        nodes={nodes}
        busy={false}
        {...handlers}
        onCorrect={onCorrect}
        onApplySuggestion={onApplySuggestion}
      />
    );
    fireEvent.change(screen.getByLabelText("Overlap for Matrices"), {
      target: { value: "LIKELY_NEW_TO_CURRICULUM" },
    });
    expect(onCorrect).toHaveBeenCalledWith("t1", "LIKELY_NEW_TO_CURRICULUM");

    // The suggestion exists for the one likely-covered unit, and asks before applying.
    fireEvent.click(screen.getByRole("button", { name: "Mark Matrices as studied" }));
    expect(onApplySuggestion).toHaveBeenCalledWith(["t1"]);
    // A "likely new" row has no such button: the comparison may never rate a unit.
    expect(screen.queryByRole("button", { name: /Mark Differentiation as studied/ })).toBeNull();
  });

  it("shows the bulk suggestion with a count, and never applies it by itself", () => {
    const onApplySuggestion = vi.fn();
    render(
      <OverlapReview
        comparison={comparison()}
        nodes={nodes}
        busy={false}
        {...handlers}
        onApplySuggestion={onApplySuggestion}
      />
    );
    const bulk = screen.getByRole("button", {
      name: /1 topics appear in your background curriculum/,
    });
    expect(bulk).toBeInTheDocument();
    expect(onApplySuggestion).not.toHaveBeenCalled();
    fireEvent.click(bulk);
    expect(onApplySuggestion).toHaveBeenCalledWith(["t1"]);
  });

  it("withholds every row when the result no longer applies, and offers a re-run", () => {
    const onCompare = vi.fn();
    render(
      <OverlapReview
        comparison={comparison({
          state: "STALE",
          stale: true,
          summary: "Your scope or your background curriculum changed, so this comparison no longer applies.",
        })}
        nodes={nodes}
        busy={false}
        {...handlers}
        onCompare={onCompare}
      />
    );
    expect(screen.getByText(/no longer applies/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByLabelText("Overlap for Matrices")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compare again" }));
    expect(onCompare).toHaveBeenCalledWith({ force: true });
  });

  it("explains an unavailable comparison without offering a dead end", () => {
    render(
      <OverlapReview
        comparison={emptyComparisonView({
          available: false,
          unavailableReason:
            "Curriculum comparison needs a web search, which is not configured here.",
        })}
        nodes={nodes}
        busy={false}
        {...handlers}
      />
    );
    expect(screen.getByText(/needs a web search/)).toBeInTheDocument();
    // The student is pointed at what still works rather than at a blocker.
    expect(screen.getByText(/rate your own topics below, or skip straight to generating/)).toBeInTheDocument();
  });

  it("passes axe with a comparison in hand", async () => {
    const { container } = render(
      <OverlapReview comparison={comparison()} nodes={nodes} busy={false} {...handlers} />
    );
    const results = await axe.run(container, axeOptions);
    expect(results.violations).toEqual([]);
  });
});

// ── Background curriculum ────────────────────────────────────────────────────

describe("background curriculum: optional, free text, and explicit research", () => {
  it("parses subjects the way a student types them", () => {
    expect(parseSubjects("Mathematics, Physics; Computer Science\nChemistry")).toEqual([
      "Mathematics",
      "Physics",
      "Computer Science",
      "Chemistry",
    ]);
    // Duplicates collapse, whitespace normalises, and the list stays bounded.
    expect(parseSubjects("  Maths , maths , Further   Maths ")).toEqual(["Maths", "Further Maths"]);
    expect(parseSubjects(Array.from({ length: 40 }, (_, index) => `S${index}`).join(","))).toHaveLength(20);
  });

  it("asks for a name before a comparison can run, and never on a keystroke", () => {
    const onCompare = vi.fn();
    const onSave = vi.fn();
    render(
      <BackgroundCurriculumControl
        background={null}
        comparisonAvailable
        comparisonReason={null}
        hasComparison={false}
        comparisonStale={false}
        busy={false}
        onSave={onSave}
        onCompare={onCompare}
      />
    );
    // The disclosure is closed until the student opens it: nothing here is a step.
    expect(screen.getByText("Add your background curriculum")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Qualification or programme"), {
      target: { value: "CAIE A-Level" },
    });
    // Typing commits nothing to the server and starts no research.
    expect(onSave).not.toHaveBeenCalled();
    expect(onCompare).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText("Qualification or programme"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ label: "CAIE A-Level" })
    );
    expect(onCompare).not.toHaveBeenCalled();
  });

  it("explains why comparison is unavailable instead of hiding the field", () => {
    render(
      <BackgroundCurriculumControl
        background={{ label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] }}
        comparisonAvailable={false}
        comparisonReason="Curriculum comparison needs a web search, which is not configured here."
        hasComparison={false}
        comparisonStale={false}
        busy={false}
        onSave={() => undefined}
        onCompare={() => undefined}
      />
    );
    expect(
      screen.getByRole("button", { name: "Compare with my syllabus" })
    ).toBeDisabled();
    expect(screen.getByText(/needs a web search/)).toBeInTheDocument();
    // The subjects the student already named are still shown and editable.
    expect(screen.getByLabelText("Subjects")).toHaveValue("Mathematics");
  });

  it("starts comparison only when the student asks for it", () => {
    const onCompare = vi.fn();
    render(
      <BackgroundCurriculumControl
        background={{ label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] }}
        comparisonAvailable
        comparisonReason={null}
        hasComparison={false}
        comparisonStale={false}
        busy={false}
        onSave={() => undefined}
        onCompare={onCompare}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare with my syllabus" }));
    expect(onCompare).toHaveBeenCalledWith({ force: false });
  });
});
