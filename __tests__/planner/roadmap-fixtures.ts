import type { ModelProposalV1 } from "@/lib/planner/contracts";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import {
  roadmapInput,
  scopeTokens,
  periodSpecsFor,
  scopeMinutes,
  type RoadmapInput,
} from "@/lib/planner/roadmap-policy";
import type { AvailabilitySnapshot } from "@/lib/planner/capacity";

export function roadmapAvailability(): AvailabilitySnapshot {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    restDays: [],
    floatingDates: [],
    existingWork: [],
    lineageFingerprint: "",
  };
}

/** A representative course: 6 units over 6 calendar months. */
export function roadmapFixture(): RoadmapInput {
  const labels = [
    "Measurements and kinematics",
    "Dynamics and forces",
    "Work energy and power",
    "Materials",
    "Waves and superposition",
    "Electricity",
  ];
  return roadmapInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: "A-Level Physics",
      outcome: "A-Level Physics",
      scope: labels.join("\n"),
      startDate: "2030-01-07",
      endDate: "2030-06-30",
      availability: {
        dailyMinutes: [0, 60, 60, 60, 60, 90, 90],
        recoveryPercent: 15,
        blockedDates: [],
      },
      roadmap: {
        subjectName: "Physics",
        subjectId: null,
        qualification: "A-Level · Year 13",
        topics: [
          { label: labels[0], covered: false, confidence: 2, difficult: false },
          { label: labels[1], covered: false, confidence: 1, difficult: true },
          { label: labels[2], covered: false, confidence: 2, difficult: false },
          { label: labels[3], covered: true, confidence: 4, difficult: false },
          { label: labels[4], covered: true, confidence: 3, difficult: false },
          {
            label: labels[5],
            covered: false,
            confidence: 2,
            difficult: false,
            priority: "HIGH",
            prioritySource: "USER_MUST_COVER",
          },
        ],
        granularity: "MONTH",
        acceptReducedReserve: false,
      },
    })
  );
}

/** A 12-month horizon with more units, still month granularity. */
export function longRoadmapFixture(): RoadmapInput {
  const labels = Array.from({ length: 12 }, (_, index) => `Unit ${index + 1}: block`);
  return roadmapInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: "Full syllabus",
      outcome: "Full syllabus",
      scope: labels.join("\n"),
      startDate: "2030-01-07",
      endDate: "2031-01-06",
      availability: {
        dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
        recoveryPercent: 15,
        blockedDates: [],
      },
      roadmap: {
        subjectName: "Physics",
        subjectId: null,
        qualification: null,
        topics: labels.map((label) => ({
          label,
          covered: false,
          confidence: 2,
          difficult: false,
        })),
        granularity: "MONTH",
        acceptReducedReserve: false,
      },
    })
  );
}

/** A short horizon that uses weekly periods instead of months. */
export function weekRoadmapFixture(): RoadmapInput {
  const labels = ["Algebra basics", "Quadratics", "Graphs"];
  return roadmapInput(
    UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: "Maths catch-up",
      outcome: "Maths catch-up",
      scope: labels.join("\n"),
      startDate: "2030-01-07",
      endDate: "2030-02-24",
      availability: {
        dailyMinutes: [0, 45, 45, 45, 45, 45, 45],
        recoveryPercent: 15,
        blockedDates: [],
      },
      roadmap: {
        subjectName: "Maths",
        subjectId: null,
        qualification: null,
        topics: labels.map((label) => ({
          label,
          covered: false,
          confidence: 2,
          difficult: false,
        })),
        granularity: "WEEK",
        acceptReducedReserve: false,
      },
    })
  );
}

/** One milestone per period, each carrying at least its units' effort floor. */
export function roadmapProposal(input: RoadmapInput): ModelProposalV1 {
  const specs = periodSpecsFor(input);
  // HIGH-priority units are sequenced first, which is what the deterministic
  // priority window requires of a valid roadmap.
  const tokens = [...scopeTokens(input)].sort((a, b) => {
    const rank = (topic: { priority?: string }) =>
      (topic.priority ?? "NEUTRAL") === "HIGH" ? 0 : 1;
    return rank(a) - rank(b);
  });
  // Every period with capacity must be planned, and every unit must be covered:
  // units are laid out one per period first, then any remainder is distributed.
  const assignment: (typeof tokens)[] = specs.map((_, index) => [
    tokens[index % tokens.length],
  ]);
  for (let index = specs.length; index < tokens.length; index += 1)
    assignment[index % specs.length].push(tokens[index]);
  const milestones = specs.map((spec, index) => {
    const units = assignment[index];
    if (!units.length) return null;
    return {
      ref: `m${index + 1}`,
      title: `${spec.title} block`,
      date: spec.endDate,
      periodRef: spec.ref,
      outcome: `Complete the planned topics for ${spec.title} and note what remains.`,
      topicRefs: units.map((unit) => unit.ref),
      effortMinutes: units.reduce(
        (total, unit) => total + scopeMinutes([unit]),
        0
      ),
      checkpoint: `${spec.title} check`,
      dependsOn: index === 0 ? [] : [`m${index}`],
    };
  });
  return {
    schemaVersion: 1,
    mode: "ROADMAP",
    outcome: input.outcome,
    assumptions: ["Synthetic syllabus; dates are coarse planning estimates."],
    warnings: [],
    // The proposed scope mirrors the confirmed order exactly; only the milestone
    // grouping is re-ordered so HIGH-priority units are sequenced first.
    topics: scopeTokens(input).map((token) => ({
      ref: token.ref,
      title: token.label,
      parentRef: null,
    })),
    milestones: milestones.filter(
      (milestone): milestone is NonNullable<typeof milestone> => milestone !== null
    ),
    items: [],
  } as ModelProposalV1;
}
