import { describe, expect, it } from "vitest";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import { masteryInput } from "@/lib/planner/mastery-policy";
import {
  applySmartAnswers,
  masterySetupSignals,
  smartQuestions,
} from "@/lib/planner/smart-setup";
import { roadmapInput } from "@/lib/planner/roadmap-policy";
import { failureCodeOf } from "./mastery-helpers";
import { masteryAvailability, masteryFixture } from "./mastery-fixtures";
import { roadmapFixture } from "./roadmap-fixtures";

/**
 * A chapter that cannot be planned without asking: equal-confidence units that only
 * coverage separates, and one label too broad to size.
 */
function undecidedFixture() {
  const labels = [
    "Whole chapter",
    "Momentum",
    "Impulse",
    "Collisions",
    "Elastic collisions",
  ];
  return masteryInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: "Momentum",
      focus: "Chapter 6 · Momentum",
      scope: labels.join("\n"),
      startDate: "2030-01-07",
      endDate: "2030-01-17",
      availability: {
        dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
        recoveryPercent: 15,
        blockedDates: [],
      },
      mastery: {
        subjectName: "Physics",
        subjectId: null,
        unitTitle: "Chapter 6 · Momentum",
        topics: labels.map((label, index) => ({
          label,
          covered: index % 2 === 0,
          confidence: 2,
          difficult: false,
        })),
        desiredDepth: "SOLID",
        priorExposure: "SOME",
        checkPreference: "MIXED_PRACTICE",
        targetDate: "2030-01-17",
        acceptReducedReserve: false,
      },
    })
  );
}

describe("Mastery reuses Smart Plan Setup", () => {
  it("asks a decided chapter nothing at all", () => {
    const input = masteryFixture();
    // Every unit already has its own priority or a distinguishing signal, the
    // labels are specific, and the week is far from full.
    const asked = smartQuestions(input).map((question) => question.reasonCode);
    expect(asked).not.toContain("PRIORITY_UNCLEAR");
    expect(asked).not.toContain("SCOPE_SIZE_UNCLEAR");
    for (const question of smartQuestions(input)) {
      expect(question.kind).toBe("SINGLE_CHOICE");
      expect(question.allowSkip).toBe(true);
      expect(question.options.length).toBeGreaterThan(1);
      expect(question.options.length).toBeLessThanOrEqual(12);
      expect(question.whyItMatters.length).toBeGreaterThan(20);
    }
  });

  it("asks about priority and scope size only when the answers would change the plan", () => {
    const input = undecidedFixture();
    const asked = smartQuestions(input);
    expect(asked.map((question) => question.reasonCode)).toContain(
      "PRIORITY_UNCLEAR"
    );
    expect(asked.map((question) => question.reasonCode)).toContain(
      "SCOPE_SIZE_UNCLEAR"
    );
    expect(asked.length).toBeLessThanOrEqual(3);
    const priority = asked.find(
      (question) => question.reasonCode === "PRIORITY_UNCLEAR"
    )!;
    // One option per confirmed unit plus an explicit "no preference".
    expect(priority.options.map((option) => option.value)).toContain("NONE");
    expect(priority.options.length).toBe(input.mastery.topics.length + 1);
  });

  it("asks about the session limit and the weekly pattern, in mastery's own terms", () => {
    const asked = smartQuestions(masteryFixture());
    const strength = asked.find(
      (question) => question.reasonCode === "CONSTRAINT_STRENGTH_UNCLEAR"
    );
    expect(strength?.prompt).toContain("longest available day");
    const pattern = asked.find(
      (question) => question.reasonCode === "AVAILABILITY_PATTERN_UNCLEAR"
    );
    expect(pattern?.prompt).toContain("mastery work");
    // Signals come from the mode's own scope estimate, not a re-derived one.
    const signals = masterySetupSignals(masteryFixture());
    expect(signals.usableDates).toBeGreaterThan(0);
    expect(signals.requiredMinutes).toBeGreaterThan(0);
  });

  it("merges every answer into mastery vocabulary the mode can actually evaluate", () => {
    const input = undecidedFixture();
    // Two bounded rounds of at most three answers, exactly as the wizard asks.
    const merged = applySmartAnswers(
      applySmartAnswers(input, [
        { reasonCode: "PRIORITY_UNCLEAR", value: "t2" },
        { reasonCode: "SCOPE_SIZE_UNCLEAR", value: "FULL_SECTION" },
      ]),
      [
        { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "REQUIRED" },
        { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "FEWER_LONGER" },
      ]
    );
    const normalized = masteryInput(merged);
    expect(normalized.mastery.topics[1].priority).toBe("HIGH");
    expect(normalized.mastery.topics[1].prioritySource).toBe("USER_EXPLICIT");
    expect(
      normalized.mastery.topics.find((topic) => topic.label === "Whole chapter")
        ?.sizeSignal
    ).toBe("FULL_SECTION");
    const kinds = (normalized.constraints ?? []).map(
      (constraint) => `${constraint.kind}:${constraint.strength}`
    );
    // A mastery answer never produces a Roadmap-only weekly limit.
    expect(kinds).toContain("MAX_SESSION_MINUTES:HARD");
    expect(kinds).toContain("PREFER_FEWER_DATES:SOFT");
    expect(kinds.some((kind) => kind.startsWith("MAX_WEEKLY_MINUTES"))).toBe(false);
    expect(kinds.some((kind) => kind.startsWith("WEEKLY_WORKLOAD"))).toBe(false);
  });

  it("treats a preference answer as a preference and stays idempotent", () => {
    const input = undecidedFixture();
    const once = applySmartAnswers(input, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "PREFERENCE" },
      { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "EVEN" },
    ]);
    const twice = applySmartAnswers(once, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "PREFERENCE" },
      { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "EVEN" },
    ]);
    const constraints = twice.constraints ?? [];
    expect(constraints).toHaveLength(2);
    expect(
      constraints.find(
        (constraint) => constraint.kind === "SESSION_LENGTH_PREFERENCE"
      )?.strength
    ).toBe("SOFT");
    expect(
      constraints.find(
        (constraint) => constraint.kind === "EVEN_SPREAD_PREFERENCE"
      )?.preferenceWeight
    ).toBe(2);
    // Re-answering replaces the constraint it owns rather than stacking another.
    const replaced = applySmartAnswers(once, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "REQUIRED" },
    ]);
    expect(
      (replaced.constraints ?? []).filter((constraint) =>
        constraint.kind === "MAX_SESSION_MINUTES"
      )
    ).toHaveLength(1);
    expect(
      (replaced.constraints ?? []).some(
        (constraint) => constraint.kind === "SESSION_LENGTH_PREFERENCE"
      )
    ).toBe(false);
  });

  it("rejects an answer the closed catalog does not allow", () => {
    const input = undecidedFixture();
    expect(
      failureCodeOf(() =>
        applySmartAnswers(input, [{ reasonCode: "PRIORITY_UNCLEAR", value: "t9" }])
      )
    ).toBe("UNSUPPORTED_SMART_ANSWER");
    expect(
      failureCodeOf(() =>
        applySmartAnswers(input, [
          { reasonCode: "SCOPE_SIZE_UNCLEAR", value: "ENORMOUS" },
        ])
      )
    ).toBe("UNSUPPORTED_SMART_ANSWER");
  });

  it("leaves the Roadmap question set exactly as it was", () => {
    const tight = roadmapFixture();
    const needsPriority = roadmapInput(
      UserInputV1Schema.parse({
        ...tight,
        endDate: "2030-02-15",
        roadmap: {
          ...tight.roadmap,
          granularity: "WEEK",
          topics: tight.roadmap.topics.map((topic, index) => ({
            ...topic,
            priority: undefined,
            prioritySource: undefined,
            covered: index % 2 === 0,
          })),
        },
        availability: {
          ...tight.availability,
          dailyMinutes: [0, 30, 30, 30, 30, 30, 30],
        },
      })
    );
    // The shared unit-shaped detectors were factored out for Mastery; Roadmap's own
    // questions and wording must be untouched by that refactor.
    expect(smartQuestions(roadmapFixture())).toEqual([]);
    expect(
      smartQuestions(needsPriority).map((question) => question.reasonCode)
    ).toContain("PRIORITY_UNCLEAR");
    expect(
      smartQuestions(needsPriority).find(
        (question) => question.reasonCode === "PRIORITY_UNCLEAR"
      )?.prompt
    ).toBe("Which syllabus unit matters most for this course?");
    expect(
      smartQuestions(needsPriority).find(
        (question) => question.reasonCode === "SCOPE_SIZE_UNCLEAR"
      )
    ).toBeUndefined();
    expect(masteryAvailability().timezone).toBe("UTC");
  });
});
