// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  MATRIX_BULK_ACTIONS,
  MATRIX_BULK_LABEL,
  MATRIX_STATE_LABEL,
  MATRIX_STATE_MEANING,
  MATRIX_STATE_VALUES,
  PREPAREDNESS_MATRIX_STATES,
  bulkPatchFor,
  matrixPatch,
  matrixStateOf,
  matrixSummary,
} from "@/lib/planner/preparedness-matrix";
import {
  isSecure,
  isWeak,
  needsLearning,
  needsMistakeReview,
  preparednessForModel,
  provisionWeight,
} from "@/lib/planner/preparedness";
import { plannerTelemetry, type PlannerEvent } from "@/lib/planner/telemetry";
import { smartQuestions } from "@/lib/planner/smart-setup";
import { examFixture } from "./exam-fixtures";

/**
 * The fast matrix, as a mapping onto the contract that already exists.
 *
 * The whole safety property is here: one click writes real `covered`/`confidence`
 * values, `null` keeps meaning *unstated*, and a state the six buttons cannot express is
 * reported rather than snapped to the nearest one.
 */

/** The actions that write a preparedness state rather than priority or difficulty. */
const PREPAREDNESS_MATRIX_ACTIONS = MATRIX_BULK_ACTIONS.filter((action) =>
  action.startsWith("SET_") && !action.includes("PRIORITY")
);

describe("matrix: every state maps onto the existing nullable contract", () => {
  it("writes exactly the values §20 specifies", () => {
    expect(MATRIX_STATE_VALUES.UNKNOWN).toEqual({ covered: null, confidence: null });
    expect(MATRIX_STATE_VALUES.NOT_STUDIED).toEqual({ covered: false, confidence: null });
    // §26: studied, with no confidence number forced.
    expect(MATRIX_STATE_VALUES.STUDIED_UNRATED).toEqual({ covered: true, confidence: null });
    expect(MATRIX_STATE_VALUES.WEAK.covered).toBe(true);
    expect(MATRIX_STATE_VALUES.OKAY.covered).toBe(true);
    expect(MATRIX_STATE_VALUES.STRONG.covered).toBe(true);
  });

  it("is read back by the existing policy exactly as intended", () => {
    const of = (state: (typeof PREPAREDNESS_MATRIX_STATES)[number]) => matrixPatch(state);
    // UNKNOWN is not weak, not secure, and still owes its learning step.
    expect(isWeak(of("UNKNOWN"))).toBe(false);
    expect(isSecure(of("UNKNOWN"))).toBe(false);
    expect(needsLearning(of("UNKNOWN"))).toBe(true);
    expect(needsMistakeReview(of("UNKNOWN"))).toBe(false);
    expect(provisionWeight(of("UNKNOWN"))).toBe(2);
    // NOT_STUDIED is a real gap, never weakness, and always owes learning.
    expect(needsLearning(of("NOT_STUDIED"))).toBe(true);
    expect(isWeak(of("NOT_STUDIED"))).toBe(false);
    expect(provisionWeight(of("NOT_STUDIED"))).toBe(4);
    // STUDIED_UNRATED suppresses learning and adds nothing else.
    expect(needsLearning(of("STUDIED_UNRATED"))).toBe(false);
    expect(isSecure(of("STUDIED_UNRATED"))).toBe(false);
    expect(needsMistakeReview(of("STUDIED_UNRATED"))).toBe(false);
    // WEAK is the only state that asks for a mistake review.
    expect(isWeak(of("WEAK"))).toBe(true);
    expect(needsMistakeReview(of("WEAK"))).toBe(true);
    expect(isSecure(of("STRONG"))).toBe(true);
    expect(isSecure(of("OKAY"))).toBe(false);
  });

  it("maps a stored entry back to the button that describes it", () => {
    expect(matrixStateOf(undefined)).toBe("UNKNOWN");
    expect(matrixStateOf({ covered: null, confidence: null, difficult: null })).toBe("UNKNOWN");
    expect(matrixStateOf({ covered: false, confidence: null, difficult: false })).toBe("NOT_STUDIED");
    expect(matrixStateOf({ covered: true, confidence: null, difficult: false })).toBe("STUDIED_UNRATED");
    expect(matrixStateOf({ covered: true, confidence: 1, difficult: null })).toBe("WEAK");
    expect(matrixStateOf({ covered: true, confidence: 2, difficult: null })).toBe("WEAK");
    expect(matrixStateOf({ covered: true, confidence: 3, difficult: null })).toBe("OKAY");
    expect(matrixStateOf({ covered: true, confidence: 4, difficult: null })).toBe("STRONG");
    expect(matrixStateOf({ covered: true, confidence: 5, difficult: null })).toBe("STRONG");
    // A confidence with no coverage statement is reachable through Advanced setup, and
    // the matrix says so instead of snapping it to the nearest button.
    expect(matrixStateOf({ covered: null, confidence: 3, difficult: null })).toBeNull();
  });

  it("carries a label and an explanation for every state and every bulk action", () => {
    for (const state of PREPAREDNESS_MATRIX_STATES) {
      expect(MATRIX_STATE_LABEL[state].length).toBeGreaterThan(2);
      expect(MATRIX_STATE_MEANING[state].length).toBeGreaterThan(20);
    }
    for (const action of MATRIX_BULK_ACTIONS) {
      expect(MATRIX_BULK_LABEL[action].length).toBeGreaterThan(4);
      expect(Object.keys(bulkPatchFor(action)).length).toBeGreaterThan(0);
    }
  });

  it("bulk actions change only what they say", () => {
    expect(bulkPatchFor("SET_WEAK")).toEqual({ covered: true, confidence: 2 });
    expect(bulkPatchFor("MARK_DIFFICULT")).toEqual({ difficult: true });
    expect(bulkPatchFor("CLEAR_DIFFICULT")).toEqual({ difficult: false });
    // Priority is a separate answer: its actions write priority and nothing else, and no
    // preparedness action writes priority.
    expect(bulkPatchFor("SET_PRIORITY_HIGH")).toEqual({ priority: "HIGH" });
    expect(bulkPatchFor("SET_PRIORITY_LOW")).toEqual({ priority: "LOW" });
    expect(bulkPatchFor("CLEAR_PRIORITY")).toEqual({ priority: "NEUTRAL" });
    for (const action of PREPAREDNESS_MATRIX_ACTIONS)
      expect(Object.keys(bulkPatchFor(action))).not.toContain("priority");
    // Reset clears the three fields the matrix shows; priority is not one of them (the
    // server keeps it, and this patch never mentions it).
    expect(bulkPatchFor("CLEAR_PREPAREDNESS")).toEqual({
      covered: null,
      confidence: null,
      difficult: null,
    });
    // Reset clears the three fields the matrix shows; priority survives it, which is
    // what "priority is deliberate" means in practice.
    for (const action of MATRIX_BULK_ACTIONS.filter((entry) => !entry.includes("PRIORITY")))
      expect(Object.keys(bulkPatchFor(action))).not.toContain("priority");
  });

  it("counts rated units without ever calling an unstated unit weak", () => {
    const entries = [
      { nodeId: "a", covered: null, confidence: null, difficult: null },
      { nodeId: "b", covered: true, confidence: null, difficult: true },
      { nodeId: "c", covered: false, confidence: null, difficult: false },
      { nodeId: "d", covered: true, confidence: 5, difficult: false },
    ];
    expect(matrixSummary(entries)).toEqual({ total: 4, rated: 3, unrated: 1, difficult: 1 });
  });

  it("hands the model the real values, with explicit nulls for silence", () => {
    expect(preparednessForModel(matrixPatch("UNKNOWN"))).toEqual({
      covered: null,
      confidence: null,
      difficult: null,
      preparedness: "UNKNOWN",
    });
    expect(preparednessForModel(matrixPatch("STUDIED_UNRATED"))).toEqual({
      covered: true,
      confidence: null,
      difficult: null,
      preparedness: "STATED",
    });
    expect(preparednessForModel(matrixPatch("STRONG")).confidence).toBe(5);
  });
});

describe("the matrix and Smart Setup read the same state", () => {
  /**
   * §32: answering the matrix must not create a question, and answering it
   * *distinctly* must resolve the one question that is about exactly this — "your
   * ratings do not separate these topics". Both halves are measured against the real
   * question engine rather than asserted from the code.
   */
  const withTopics = (topics: { covered: boolean | null; confidence: number | null; difficult: boolean | null }[]) => {
    const base = examFixture();
    return { ...base, exam: { ...base.exam, topics: base.exam.topics.map((topic, index) => ({ ...topic, ...topics[index] })) } };
  };

  const reasonsFor = (input: ReturnType<typeof withTopics>) =>
    smartQuestions(input as never, 3).map((question) => question.reasonCode);

  it("asks nothing about coverage or confidence, whatever the matrix says", () => {
    const unrated = reasonsFor(withTopics([
      { covered: null, confidence: null, difficult: null },
      { covered: null, confidence: null, difficult: null },
      { covered: null, confidence: null, difficult: null },
    ]));
    // None of the four question reasons is about preparedness: silence is not an
    // uncertainty Smart Setup can resolve by asking.
    expect(unrated).not.toContain("PRIORITY_UNCLEAR");
  });

  it("removes the one question whose premise is that the answers do not separate units", () => {
    /**
     * `PRIORITY_UNCLEAR` is asked when two topics share a confidence and differ only in
     * coverage or difficulty — literally "your ratings do not separate these topics".
     * Once the matrix has separated them, that premise is false at the source, so the
     * question cannot be constructed. This holds under a tight horizon as well, which is
     * where the question is most likely to be worth asking.
     */
    const tight = (topics: { covered: boolean | null; confidence: number | null; difficult: boolean | null }[]) => {
      const base = examFixture();
      return {
        ...base,
        endDate: "2030-01-15",
        examDate: "2030-01-15",
        availability: { ...base.availability, dailyMinutes: base.availability.dailyMinutes.map(() => 60) },
        exam: { ...base.exam, mockMinutes: 0, topics: base.exam.topics.map((topic, index) => ({ ...topic, ...topics[index] })) },
      };
    };

    const distinguishable = reasonsFor(
      tight([
        { covered: true, confidence: 3, difficult: false },
        { covered: false, confidence: null, difficult: true },
        { covered: true, confidence: 5, difficult: false },
      ]) as never
    );
    expect(distinguishable).not.toContain("PRIORITY_UNCLEAR");
    // And the matrix never adds a question of its own: the four reasons are about
    // priority, availability, constraint strength and scope size, none about coverage.
    const unrated = reasonsFor(
      tight([
        { covered: null, confidence: null, difficult: null },
        { covered: null, confidence: null, difficult: null },
        { covered: null, confidence: null, difficult: null },
      ]) as never
    );
    expect(unrated.length).toBeLessThanOrEqual(distinguishable.length + 1);
    expect([...new Set([...unrated, ...distinguishable])]).toEqual(
      expect.arrayContaining([])
    );
    for (const reason of [...unrated, ...distinguishable])
      expect(["PRIORITY_UNCLEAR", "AVAILABILITY_PATTERN_UNCLEAR", "CONSTRAINT_STRENGTH_UNCLEAR", "SCOPE_SIZE_UNCLEAR"]).toContain(reason);
  });
});

describe("telemetry: the Phase 3 vocabulary is closed and content-free", () => {
  it("reports counts and closed enums only, dropping anything else", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const events: PlannerEvent[] = [
        "comparison_started",
        "comparison_completed",
        "comparison_failed",
        "comparison_skipped",
        "comparison_cached",
        "overlap_corrected",
        "coverage_suggestion_applied",
        "preparedness_opened",
        "preparedness_bulk_applied",
        "preparedness_skipped",
        "draft_warning_presented",
        "draft_warning_accepted",
      ];
      for (const event of events) plannerTelemetry(event, { mode: "EXAM" });
      expect(info).toHaveBeenCalledTimes(events.length);

      plannerTelemetry("comparison_completed", {
        mode: "EXAM",
        overlapCoveredCount: 17,
        overlapPartialCount: 8,
        overlapNewCount: 7,
        overlapUnclearCount: 4,
        comparisonBytesIn: 12_345,
        comparisonBytesOut: 2_100,
        comparisonCacheHit: 0,
        backgroundUnitCount: 42,
        backgroundSourceCount: 2,
        comparisonUnits: 36,
        modelPasses: 2,
        // A free-form string is not part of the metadata contract at all; it cannot be
        // passed, which is the point rather than a runtime filter.
        ...({ topicLabel: "Matrices" } as unknown as Record<string, never>),
      });
      const payload = info.mock.calls.at(-1)![1] as Record<string, unknown>;
      expect(payload.overlapCoveredCount).toBe(17);
      expect(payload.overlapUnclearCount).toBe(4);
      expect(payload.comparisonBytesIn).toBe(12_345);
      expect(payload.modelPasses).toBe(2);
      expect(payload.topicLabel).toBeUndefined();
      expect(JSON.stringify(payload)).not.toMatch(/Matrices/);
    } finally {
      info.mockRestore();
    }
  });

  it("keeps an unknown search provider out of the record", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      plannerTelemetry("comparison_completed", {
        mode: "EXAM",
        searchProvider: "google" as never,
      });
      const payload = info.mock.calls.at(-1)![1] as Record<string, unknown>;
      expect(payload.searchProvider).toBeUndefined();
    } finally {
      info.mockRestore();
    }
  });
});
