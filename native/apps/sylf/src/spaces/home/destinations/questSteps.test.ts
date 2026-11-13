import { describe, expect, it, vi } from "vitest";
import type { Quest } from "@sylf/backend";
import type { Objective } from "../data/contracts";
import { buildTodayQuestSteps, buildUpcomingQuestSteps } from "./questSteps";

const sampleObjective = (overrides: Partial<Objective> = {}): Objective => ({
  id: "q-1",
  questId: 101,
  title: "Oscillations derivation block",
  detail: "1 hr 30 min",
  done: false,
  subject: "Physics",
  subjectId: 7,
  completion: { id: 101 },
  ...overrides,
});

describe("Today quest path mapping", () => {
  it("marks the first incomplete quest active and preserves study action only when ready", () => {
    const onTick = vi.fn();
    const onStudy = vi.fn();
    const steps = buildTodayQuestSteps({
      objectives: [
        sampleObjective({ id: "q-1", questId: 101, done: true }),
        sampleObjective({ id: "q-2", questId: 102, title: "Wavefront notes", detail: "Physics · 45 min", done: false }),
        sampleObjective({ id: "q-3", questId: undefined, title: "Quick drill", completion: undefined, done: false }),
      ],
      colourOf: () => "#5B4CE6",
      sending: false,
      busy: false,
      onTick,
      onStudy,
    });

    expect(steps.map((step) => ({ id: step.id, done: step.done, active: step.active }))).toEqual([
      { id: "q-1", done: true, active: false },
      { id: "q-2", done: false, active: true },
      { id: "q-3", done: false, active: false },
    ]);
    expect(steps[0]!.meta).toBe("Physics · 1 hr 30 min");
    expect(steps[1]!.meta).toBe("Physics · 45 min");
    expect(steps[0]!.actionLabel).toBeUndefined();
    expect(steps[1]!.actionLabel).toBe("Study this");
    expect(steps[2]!.disabled).toBe(true);
    expect(steps[2]!.actionLabel).toBeUndefined();
  });

  it("hides study actions when a focus session is already active", () => {
    const steps = buildTodayQuestSteps({
      objectives: [sampleObjective()],
      colourOf: () => null,
      sending: false,
      busy: true,
      onTick: vi.fn(),
      onStudy: vi.fn(),
    });
    expect(steps[0]!.actionLabel).toBeUndefined();
  });

  it("maps upcoming quests chronologically with dot-separated metadata", () => {
    const now = new Date(2026, 10, 13, 9, 0, 0);
    const tomorrow = new Date(2026, 10, 14, 12, 0, 0).toISOString();
    const upcoming: Quest[] = [
      {
        id: 201,
        title: "Ideal gases derivation",
        status: "SCHEDULED",
        scheduledFor: tomorrow,
        subjectId: 7,
        targetMinutes: 90,
      } as Quest,
    ];
    const steps = buildUpcomingQuestSteps({
      upcoming,
      subjectNames: new Map([[7, "Physics"]]),
      colourOf: () => "#5B4CE6",
      now,
      onOpen: vi.fn(),
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.upcoming).toBe(true);
    expect(steps[0]!.done).toBe(false);
    expect(steps[0]!.testID).toBe("today-upcoming-201");
    expect(steps[0]!.meta).toBe("Tomorrow · Physics · 90 min");
  });
});
