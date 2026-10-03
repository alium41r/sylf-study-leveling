// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  REOFFER_LIMITS,
  reofferDisclosure,
  reoffersFor,
  replacementMinutes,
  replacementTitle,
  type ReleasedBaseline,
} from "@/lib/planner/reoffer";
import type { PlannerItem, ValidatedDraftV1 } from "@/lib/planner/contracts";

/**
 * The released-work re-offer, as pure logic.
 *
 * The database suite proves the flow end to end; these tests prove the *decision* — whether a
 * gap still exists, and therefore whether Sylf has anything to say. They are separate because
 * the sharpest case cannot be produced through the API at all: a sealed revision is immutable
 * by database guard, so "a replan closed the gap on its own" is only expressible as a draft.
 */

const UUID = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const item = (over: Partial<PlannerItem> & { key: string; topicKey: string }): PlannerItem =>
  ({
    title: "Recall — Matrices",
    type: "RECALL",
    minutes: 45,
    date: "2030-01-10",
    dependsOn: [],
    milestoneKey: null,
    ...over,
  }) as PlannerItem;

const draft = (items: PlannerItem[]): ValidatedDraftV1 =>
  ({
    schemaVersion: 1,
    mode: "EXAM",
    examDate: "2030-03-01",
    assumptions: [],
    warnings: [],
    topics: [
      { key: UUID("1"), title: "Matrices", parentKey: null },
      { key: UUID("2"), title: "Vectors", parentKey: null },
    ],
    milestones: [],
    items,
  }) as unknown as ValidatedDraftV1;

const tombstone = (over: Partial<ReleasedBaseline> = {}): ReleasedBaseline => ({
  itemKey: UUID("9"),
  removedAt: "2030-01-05T00:00:00.000Z",
  item: item({ key: UUID("9"), topicKey: UUID("1") }),
  reofferState: null,
  ...over,
});

describe("a re-offer exists only while the gap does", () => {
  it("offers when the unit has no session of that kind left", () => {
    const released = tombstone();
    const current = draft([
      // A different kind of work for the same unit: it does not fill a retrieval gap.
      item({ key: UUID("10"), topicKey: UUID("1"), type: "PRACTICE", title: "Practice — Matrices" }),
    ]);
    const offers = reoffersFor(current, [released]);
    expect(offers).toHaveLength(1);
    expect(offers[0].releasedItemKey).toBe(released.itemKey);
    expect(offers[0].unitLabel).toBe("Matrices");
  });

  it("says nothing when the plan answered the gap itself", () => {
    const released = tombstone();
    // A replan wrote an equivalent retrieval session. The student removed one session; the
    // plan has one again, so there is nothing to offer back.
    const current = draft([
      item({ key: UUID("11"), topicKey: UUID("1"), title: "Review — Matrices", type: "REVIEW" }),
    ]);
    expect(reoffersFor(current, [released])).toEqual([]);
  });

  it("treats a survey and a recall as the same retrieval job", () => {
    const released = tombstone({ item: item({ key: UUID("9"), topicKey: UUID("1"), type: "REVIEW" }) });
    const current = draft([item({ key: UUID("12"), topicKey: UUID("1"), type: "RECALL" })]);
    expect(reoffersFor(current, [released])).toEqual([]);
  });

  it("notices a unit with no work at all, not just a missing session", () => {
    const released = tombstone();
    const current = draft([item({ key: UUID("13"), topicKey: UUID("2"), title: "Practice — Vectors" })]);
    expect(reoffersFor(current, [released])).toHaveLength(1);
  });

  it("does not let the released item fill its own gap", () => {
    const released = tombstone();
    // The frozen revision still contains the released item — a release deletes the Quest, it
    // does not rewrite the reviewed plan — so the comparison has to be against the plan as
    // *executed*, or every release would look like the work that closes its own gap.
    const current = draft([item({ key: UUID("9"), topicKey: UUID("1") })]);
    expect(reoffersFor(current, [released])).toHaveLength(1);
  });
});

describe("an answered offer is not repeated", () => {
  it("skips a declined offer for good", () => {
    expect(reoffersFor(draft([]), [tombstone({ reofferState: "DECLINED" })])).toEqual([]);
  });

  it("skips an accepted offer", () => {
    expect(reoffersFor(draft([]), [tombstone({ reofferState: "ACCEPTED" })])).toEqual([]);
  });

  it("skips an offer whose replacement is already in the plan", () => {
    const released = tombstone();
    const current = draft([
      item({
        key: UUID("14"),
        topicKey: UUID("1"),
        replacementForReleasedItemKey: released.itemKey,
      }),
    ]);
    expect(reoffersFor(current, [released])).toEqual([]);
  });

  it("is bounded, oldest release first", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      tombstone({
        itemKey: UUID(String(20 + index)),
        removedAt: `2030-01-0${index + 1}T00:00:00.000Z`,
        item: item({ key: UUID(String(20 + index)), topicKey: UUID("1") }),
      })
    );
    const offers = reoffersFor(draft([]), many);
    expect(offers).toHaveLength(REOFFER_LIMITS.offers);
    expect(offers[0].releasedItemKey).toBe(UUID("20"));
  });
});

describe("a replacement is a new, shorter item", () => {
  it("is shorter than what it replaces, and never below the engine's floor", () => {
    expect(replacementMinutes(60)).toBe(36);
    expect(replacementMinutes(240)).toBe(144);
    // 20 × 0.6 = 12, which the engine cannot represent, so the floor applies…
    expect(replacementMinutes(20)).toBe(15);
    // …which means a session already at the floor has no shorter version at all.
    expect(replacementMinutes(15)).toBe(15);
    expect(reoffersFor(draft([]), [tombstone({ item: item({ key: UUID("9"), topicKey: UUID("1"), minutes: 15 }) })])).toEqual([]);
  });

  it("never exceeds the engine's ceiling", () => {
    expect(replacementMinutes(240)).toBeLessThanOrEqual(240);
    expect(replacementMinutes(1000)).toBeLessThanOrEqual(240);
  });

  it("is labelled so the two are never confused", () => {
    expect(replacementTitle("Recall — Matrices")).toBe("Recall — Matrices (shorter replacement)");
    expect(replacementTitle("   ")).toBe("Shorter replacement");
  });

  it("discloses who removed it, why it is back, and that declining is allowed", () => {
    const offers = reoffersFor(draft([]), [tombstone()]);
    const copy = reofferDisclosure(offers[0]);
    expect(copy).toContain("Recall — Matrices");
    expect(copy).toMatch(/you removed/i);
    expect(copy).toMatch(/matrices still has no session/i);
    expect(copy).toMatch(/leave it out/i);
    // The two lengths are both stated, so the trade is legible.
    expect(copy).toContain(`${offers[0].replacement.minutes} minutes`);
    expect(copy).toContain(`${offers[0].releasedMinutes} minutes`);
  });
});
