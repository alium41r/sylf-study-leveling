// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import { validateDraft } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import {
  coreItems,
  isCoreSufficiencyFailure,
  isStretch,
  stretchItems,
} from "@/lib/planner/planner-role";
import {
  dayIntensity,
  intensityAdvisories,
  intensityFromIntent,
  intensityOf,
} from "@/lib/planner/load";
import { deterministicAdvisories } from "@/lib/planner/semantic";
import { examFixture, examProposal } from "./exam-fixtures";

/**
 * Core + Stretch is the A2 layer's most dangerous idea: an "optional" label on
 * required work would let a plan look complete while being incomplete. These tests
 * pin the two rules that make it safe — CORE must satisfy the mode's own standards on
 * its own, and STRETCH stays planner-owned optional work.
 */
const examDraft = () => normalizeProposal(examFixture(), examProposal());

const withRoles = (
  draft: ValidatedDraftV1,
  roleOf: (key: string, index: number) => "CORE" | "STRETCH" | undefined
): ValidatedDraftV1 =>
  ({
    ...draft,
    items: draft.items.map((item, index) => {
      const role = roleOf(item.key, index);
      return role ? { ...item, role } : { ...item };
    }),
  }) as ValidatedDraftV1;

describe("planner roles", () => {
  it("treats an absent role as CORE, which is every draft written before roles existed", () => {
    const draft = examDraft();
    expect(draft.items.every((item) => isStretch(item) === false)).toBe(true);
    expect(coreItems(draft.items)).toHaveLength(draft.items.length);
    expect(stretchItems(draft.items)).toEqual([]);
  });

  it("partitions core from stretch", () => {
    const draft = withRoles(examDraft(), (_key, index) =>
      index === 0 ? "STRETCH" : "CORE"
    );
    expect(stretchItems(draft.items)).toHaveLength(1);
    expect(coreItems(draft.items)).toHaveLength(draft.items.length - 1);
  });

  it("rejects a role outside the closed vocabulary", () => {
    const draft = examDraft();
    const broken = {
      ...draft,
      items: [{ ...draft.items[0], role: "OPTIONAL" }, ...draft.items.slice(1)],
    };
    expect(() => validateDraft(examFixture(), broken)).toThrow();
  });

  it("refuses a plan whose CORE subset cannot stand alone", () => {
    // Every item optional is the degenerate case: the plan a student may skip would
    // be empty, so the label is illegitimate and the draft must not be storable.
    const allStretch = withRoles(examDraft(), () => "STRETCH");
    try {
      validateDraft(examFixture(), allStretch);
      throw new Error("expected the draft to be refused");
    } catch (error) {
      expect((error as Error).message).toBe("STRETCH_NOT_OPTIONAL");
      expect(isCoreSufficiencyFailure((error as Error).message)).toBe(true);
    }
  });

  it("accepts Stretch work only when CORE alone already satisfies the mode", () => {
    const draft = examDraft();
    // A surplus item on a spare date, explicitly optional: Core still holds the whole
    // validated plan, so this draft is legitimate.
    const surplus = {
      ...draft.items[draft.items.length - 1],
      key: randomUUID(),
      type: "RECALL" as const,
      stage: "CONSOLIDATION" as const,
      title: "Optional extra recall",
      description: "Skim the earlier chapter's summary and write down what you remember.",
      role: "STRETCH" as const,
      date: "2030-01-10",
      dependsOn: [] as string[],
    };
    const withSurplus = {
      ...draft,
      items: [...draft.items, surplus],
    } as ValidatedDraftV1;
    const validated = validateDraft(examFixture(), withSurplus);
    expect(stretchItems(validated.items)).toHaveLength(1);
    expect(coreItems(validated.items)).toHaveLength(draft.items.length);
  });
});

describe("cognitive intensity", () => {
  it("classifies deterministically from the intent", () => {
    expect(intensityFromIntent("RECALL")).toBe("LOW");
    expect(intensityFromIntent("MISTAKE_REVIEW")).toBe("LOW");
    expect(intensityFromIntent("LEARN")).toBe("MEDIUM");
    expect(intensityFromIntent("PRACTICE")).toBe("MEDIUM");
    expect(intensityFromIntent("TIMED_PRACTICE")).toBe("HIGH");
    expect(intensityFromIntent("MOCK_EXAM")).toBe("HIGH");
    expect(intensityFromIntent("FINAL_REVIEW")).toBe("HIGH");
  });

  it("lets a Mastery stage refine the intent it pairs with", () => {
    expect(intensityOf({ type: "RECALL", masteryStage: "ACTIVE_RECALL" })).toBe("LOW");
    expect(intensityOf({ type: "ASSESS", masteryStage: "MASTERY_CHECK" })).toBe("HIGH");
    expect(intensityOf({ type: "REVIEW", stage: "UNDERSTAND" })).toBe("MEDIUM");
    // No stage: the intent answers, so every mode gets a value.
    expect(intensityOf({ type: "TIMED_PRACTICE" })).toBe("HIGH");
  });

  it("never infers anything beyond the academic workload label", () => {
    // A wider object than the classifier accepts: the point is that the extra fields
    // are ignored entirely, because minutes are not a proxy for anything about the
    // student and are not an input to this label.
    const heavy = { key: "i1", type: "MOCK_EXAM", date: "2030-01-10", minutes: 240 };
    const light = { ...heavy, minutes: 15 };
    expect(intensityOf(heavy)).toBe("HIGH");
    expect(intensityOf(light)).toBe("HIGH");
  });

  it("prefers a mixed rhythm and flags a demanding day", () => {
    const mixed = intensityAdvisories([
      { type: "TIMED_PRACTICE", date: "2030-01-08" },
      { type: "RECALL", date: "2030-01-08" },
    ]);
    expect(mixed).toEqual([]);
    const highMedium = intensityAdvisories([
      { type: "MOCK_EXAM", date: "2030-01-09" },
      { type: "PRACTICE", date: "2030-01-09" },
    ]);
    expect(highMedium).toEqual([]);
    const stack = intensityAdvisories([
      { type: "MOCK_EXAM", date: "2030-01-10" },
      { type: "TIMED_PRACTICE", date: "2030-01-10" },
      { type: "FINAL_REVIEW", date: "2030-01-10" },
    ]);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ severity: "MEDIUM", high: 3 });
    const allHigh = intensityAdvisories([
      { type: "MOCK_EXAM", date: "2030-01-11" },
      { type: "TIMED_PRACTICE", date: "2030-01-11" },
    ]);
    expect(allHigh[0]).toMatchObject({ severity: "LOW", high: 2 });
    expect(dayIntensity([
      { type: "MOCK_EXAM", date: "2030-01-11" },
      { type: "RECALL", date: "2030-01-11" },
    ])).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 1 });
  });

  it("surfaces as a non-fatal advisory, never as a critic defect", () => {
    const draft = examDraft();
    const loaded = {
      ...draft,
      items: [
        ...draft.items.map((item) => ({ ...item, type: "MOCK_EXAM" as const })),
      ],
    } as ValidatedDraftV1;
    const advisories = deterministicAdvisories(loaded);
    expect(advisories.length).toBeGreaterThan(0);
    for (const advisory of advisories) {
      expect(advisory.issueCode).toBe("INTENSITY_SPIKE");
      // Minutes stay authoritative: an advisory can never be HIGH severity, so it can
      // never fail the deterministic gate the way a real semantic defect does.
      expect(advisory.severity).not.toBe("HIGH");
    }
  });
});
