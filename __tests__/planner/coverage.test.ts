// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  COVERAGE_STATES,
  coverageMap,
  coverageSummary,
  type CoverageTouchInput,
} from "@/lib/planner/coverage";

/**
 * The Coverage Map is traceability. These tests pin what it may and may not claim:
 * it can make an orphaned unit obvious, it can show history and superseded work, and
 * it can never turn Quest completion into mastery.
 */
const units = [
  { key: "u1", title: "Kinematics" },
  { key: "u2", title: "Forces" },
  { key: "u3", title: "Waves" },
];

const item = (over: Partial<CoverageTouchInput> & { key: string; topicKey: string }): CoverageTouchInput => ({
  type: "LEARN",
  date: "2030-01-07",
  ...over,
});

describe("coverage map", () => {
  it("has no MASTERED state at all", () => {
    expect(COVERAGE_STATES).not.toContain("MASTERED");
  });

  it("makes orphaned scope obvious", () => {
    const map = coverageMap({
      units,
      items: [item({ key: "i1", topicKey: "u1" })],
    });
    expect(map.unscheduled).toEqual(["u2", "u3"]);
    expect(coverageSummary(map)).toEqual({
      units: 3,
      states: { UNSCHEDULED: 2, SCHEDULED: 1, REINFORCED: 0, PRACTICED: 0 },
      unscheduled: 2,
    });
  });

  it("moves a unit from planned to revisited to practised only on real touches", () => {
    const planned = coverageMap({ units, items: [item({ key: "i1", topicKey: "u1" })] });
    expect(planned.units[0].state).toBe("SCHEDULED");
    const revisited = coverageMap({
      units,
      items: [
        item({ key: "i1", topicKey: "u1" }),
        item({ key: "i2", topicKey: "u1", type: "RECALL", date: "2030-01-09" }),
      ],
    });
    expect(revisited.units[0].state).toBe("REINFORCED");
    const practised = coverageMap({
      units,
      items: [
        item({ key: "i1", topicKey: "u1" }),
        item({ key: "i2", topicKey: "u1", type: "PRACTICE", date: "2030-01-09" }),
      ],
    });
    expect(practised.units[0].state).toBe("PRACTICED");
  });

  it("does not accept retrieval that happens before the learning it revisits", () => {
    const map = coverageMap({
      units,
      items: [
        item({ key: "i1", topicKey: "u1", type: "RECALL", date: "2030-01-05" }),
        item({ key: "i2", topicKey: "u1", date: "2030-01-09" }),
      ],
    });
    expect(map.units[0].state).toBe("SCHEDULED");
  });

  it("counts completed history as coverage without claiming mastery", () => {
    const map = coverageMap({
      units,
      items: [
        item({
          key: "i1",
          topicKey: "u1",
          type: "PRACTICE",
          execution: { linked: true, status: "COMPLETED", completed: true },
        }),
      ],
    });
    expect(map.units[0].state).toBe("PRACTICED");
    expect(map.units[0].counts.history).toBe(1);
    expect(map.units[0].touches[0]).toMatchObject({
      source: "HISTORY",
      executed: true,
      current: false,
    });
    expect(Object.values(map.totals)).toHaveLength(4);
  });

  it("does not double-count superseded work as current scheduled coverage", () => {
    const map = coverageMap({
      units,
      items: [
        item({ key: "old", topicKey: "u1", type: "PRACTICE", superseded: true }),
      ],
    });
    // The unit is not "covered" by work the plan replaced...
    expect(map.units[0].state).toBe("UNSCHEDULED");
    expect(map.unscheduled).toEqual(["u1", "u2", "u3"]);
    // ...but the replacement history is still visible.
    expect(map.units[0].counts.superseded).toBe(1);
    expect(map.units[0].touches[0].source).toBe("SUPERSEDED");
  });

  it("lets a strategic milestone schedule a unit without pretending it was practised", () => {
    const map = coverageMap({
      units,
      items: [],
      milestones: [{ key: "m1", date: "2030-02-01", topicKeys: ["u1"] }],
    });
    expect(map.units[0].state).toBe("SCHEDULED");
    expect(map.units[0].touches[0]).toMatchObject({
      purpose: "STRATEGIC",
      source: "PLAN",
    });
    expect(map.units[0].state).not.toBe("PRACTICED");
  });

  it("treats optional stretch work as traceability, not as agreed practice", () => {
    const map = coverageMap({
      units,
      items: [
        item({ key: "i1", topicKey: "u1", type: "PRACTICE", role: "STRETCH" }),
      ],
    });
    // The unit is visibly planned (not orphaned) but its state is not inflated by work
    // the student has not agreed to run.
    expect(map.units[0].state).toBe("SCHEDULED");
    expect(map.units[0].counts.planned).toBe(1);
    expect(map.units[0].touches[0].role).toBe("STRETCH");
  });

  it("reads a Mastery stage as the purpose it carries", () => {
    const map = coverageMap({
      units: [{ key: "u1", title: "Kinematics" }],
      items: [
        item({ key: "i1", topicKey: "u1", type: "LEARN", masteryStage: "LEARN" }),
        item({
          key: "i2",
          topicKey: "u1",
          type: "RECALL",
          masteryStage: "ACTIVE_RECALL",
          date: "2030-01-09",
        }),
        item({
          key: "i3",
          topicKey: "u1",
          type: "ASSESS",
          masteryStage: "MASTERY_CHECK",
          date: "2030-01-11",
        }),
      ],
    });
    expect(map.units[0].state).toBe("PRACTICED");
    expect(map.units[0].touches.map((touch) => touch.purpose)).toEqual([
      "LEARN",
      "RECALL",
      "ASSESS",
    ]);
  });
});
