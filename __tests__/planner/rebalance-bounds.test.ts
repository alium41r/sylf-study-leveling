// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/planner/contracts";
import { REBALANCE_LIMITS, RebalanceMetadataSchema } from "@/lib/planner/rebalance-fields";
import { replanFitsOneResponse } from "@/lib/planner/rebalance-policy";

/**
 * The two item bounds describe the same plan and must not drift apart.
 *
 * They did. `LIMITS.items` was raised from 60 to 200 so a ninety-day plan could exist, and
 * `REBALANCE_LIMITS.items` — which bounds the *same* set of items, seen from the replan side —
 * stayed at 60. Nothing compared them, and the failure was invisible to every local test:
 *
 * - `beginRebalance` derives the eligible set from live execution and stores it **without**
 *   validating it against `RebalanceMetadataSchema`, so an 85-item plan began a replan happily;
 * - `finishRebalance` re-parses that stored snapshot through `UserInputV1Schema`, which *does*
 *   apply this bound, and threw `too_big` at `rebalance.eligible`.
 *
 * So a large plan could be created and confirmed but never replanned. The asymmetry is the point:
 * a bound that is only enforced on read-back is a bound that fails after the student has already
 * committed to the operation.
 */
describe("the rebalance item bound tracks the plan item bound", () => {
  it("allows a replan to see every item a plan may hold", () => {
    expect(REBALANCE_LIMITS.items).toBe(LIMITS.items);
  });

  it("accepts a metadata snapshot for a plan at the item bound", () => {
    const full = {
      reasonCode: "USER_REQUESTED" as const,
      inputChanges: [],
      baseRevisionId: "00000000-0000-4000-8000-000000000000",
      scope: { milestoneKey: null },
      snapshotDigest: "a".repeat(64),
      // One token per item, which is what a plan at the bound produces.
      frozenItemKeys: Array.from({ length: LIMITS.items }, (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
      ),
      eligible: Array.from({ length: LIMITS.items }, (_, index) => ({
        ref: `r${index + 1}`,
        itemKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        questId: index + 1,
      })),
    };
    expect(() => RebalanceMetadataSchema.parse(full)).not.toThrow();
  });

  it("still refuses a snapshot larger than a plan can be", () => {
    // The bound still does its job: it is a bound on the plan, not an absence of one.
    const over = {
      reasonCode: "USER_REQUESTED" as const,
      inputChanges: [],
      baseRevisionId: "00000000-0000-4000-8000-000000000000",
      scope: { milestoneKey: null },
      snapshotDigest: "a".repeat(64),
      frozenItemKeys: [],
      eligible: Array.from({ length: LIMITS.items + 1 }, (_, index) => ({
        ref: `r${index + 1}`,
        itemKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        questId: null,
      })),
    };
    expect(() => RebalanceMetadataSchema.parse(over)).toThrow();
  });

  /**
   * The byte envelope is a separate bound from the item count, and raising one can breach the
   * other. `assertRebalanceEnvelope` rejects a metadata blob over `metadataBytes`, so this
   * measures the largest snapshot a plan at the bound can now produce rather than assuming the
   * number still holds.
   *
   * The worst case is not a split between frozen and eligible work: an eligible entry carries a
   * `ref`, a `questId` and a uuid where a frozen key carries only the uuid, so the maximum is
   * every item eligible.
   */
  it("keeps the largest possible snapshot inside the byte envelope", () => {
    const widest = {
      reasonCode: "USER_REQUESTED" as const,
      inputChanges: [],
      baseRevisionId: "00000000-0000-4000-8000-000000000000",
      scope: { milestoneKey: null },
      snapshotDigest: "a".repeat(64),
      frozenItemKeys: [],
      eligible: Array.from({ length: LIMITS.items }, (_, index) => ({
        ref: `r${index + 1}`,
        itemKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        questId: 2_147_483_647,
      })),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(widest)).byteLength;
    // eslint-disable-next-line no-console
    console.log(
      `MEASURED rebalance metadata: items=${LIMITS.items} bytes=${bytes} envelope=${REBALANCE_LIMITS.metadataBytes}`
    );
    expect(bytes).toBeLessThanOrEqual(REBALANCE_LIMITS.metadataBytes);

    /**
     * And the envelope has to leave room for the input it is stored beside.
     *
     * The metadata is not a standalone document: `beginRebalance` writes
     * `{ ...nextInput, rebalance }` into one `inputSnapshot`, and `finishRebalance` re-parses the
     * whole thing against `LIMITS.inputBytes`. So a metadata bound that fits its own measurement
     * but leaves no room for the base input would simply move the rejection one field over. This
     * measures the widest legitimate base input — every topic and a blocked date on every day of
     * the horizon — and asserts the pair fits.
     */
    const blockedDates = Array.from({ length: LIMITS.horizonDays }, (_, index) => {
      const day = new Date(Date.UTC(2030, 0, 7) + index * 86_400_000).toISOString().slice(0, 10);
      return day;
    });
    const widestInput = {
      schemaVersion: 1,
      mode: "EXAM",
      title: "Widest legitimate exam input",
      scope: Array.from({ length: LIMITS.topics }, (_, index) => `Unit ${index + 1}`).join("\n"),
      startDate: "2030-01-07",
      endDate: "2031-01-06",
      examDate: "2031-01-06",
      availability: {
        dailyMinutes: [1440, 1440, 1440, 1440, 1440, 1440, 1440],
        recoveryPercent: 100,
        blockedDates,
      },
      exam: {
        subjectName: "Widest legitimate exam input",
        subjectId: null,
        topics: Array.from({ length: LIMITS.topics }, (_, index) => ({
          label: `Unit ${index + 1} with a realistic length of label`,
          covered: false,
          confidence: 2,
          difficult: false,
        })),
        format: "MIXED",
        preferredMinutes: 90,
        mockMinutes: 240,
        allowExamDayStudy: false,
        approach: "STANDARD",
        acceptReducedReserve: true,
      },
    };
    const inputBytes = new TextEncoder().encode(JSON.stringify(widestInput)).byteLength;
    const combined = bytes + inputBytes;
    // eslint-disable-next-line no-console
    console.log(
      `MEASURED widest rebalance snapshot: metadata=${bytes} input=${inputBytes} ` +
        `combined=${combined} inputBytes=${LIMITS.inputBytes}`
    );
    expect(combined).toBeLessThanOrEqual(LIMITS.inputBytes);
  });
});

/**
 * The second rule that the same drift produced.
 *
 * Raising `items` made plans of 61–200 items replan-*attemptable* for the first time, which
 * exposed a different ceiling: a replan proposal is the whole new plan for its scope, carried in
 * one model response, so it can never hold more than `proposedItems`. The two bounds are
 * deliberately different numbers — a plan grows by editing as well as by generation — so a plan
 * larger than one response can legitimately exist, and a single replan of it cannot. That is a
 * size fact, and it is refused up front rather than after a wasted model call.
 */
describe("a replan refuses a scope one response cannot carry", () => {
  it("accepts a scope at the proposal bound and refuses one past it", () => {
    expect(replanFitsOneResponse(LIMITS.proposedItems)).toBe(true);
    expect(replanFitsOneResponse(LIMITS.proposedItems + 1)).toBe(false);
    expect(replanFitsOneResponse(0)).toBe(true);
  });

  it("covers the plans this repository actually generates", () => {
    // The ninety-day acceptance plan in `flexibility.test.ts` is 87 items — inside the bound, so
    // the large plan the Phase 5 report claims is supported stays replannable.
    expect(replanFitsOneResponse(87)).toBe(true);
    // And the bound is genuinely below the plan bound, which is why the check has to exist.
    expect(LIMITS.proposedItems).toBeLessThan(LIMITS.items);
  });
});
