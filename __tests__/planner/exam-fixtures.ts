import type { ExamInput } from "@/lib/planner/exam-policy";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import type { AvailabilitySnapshot } from "@/lib/planner/capacity";
export function examFixture(): ExamInput {
  return {
    schemaVersion: 1,
    mode: "EXAM",
    title: "Synthetic science exam",
    scope: "Cells\nEnzymes\nTransport",
    startDate: "2030-01-07",
    endDate: "2030-01-25",
    examDate: "2030-01-25",
    availability: {
      dailyMinutes: [120, 120, 120, 120, 120, 120, 120],
      recoveryPercent: 15,
      blockedDates: [],
    },
    exam: {
      subjectName: "Synthetic Science",
      subjectId: null,
      topics: [
        { label: "Cells", covered: false, confidence: 2, difficult: false },
        { label: "Enzymes", covered: true, confidence: 2, difficult: false },
        { label: "Transport", covered: true, confidence: 5, difficult: false },
      ],
      format: "MIXED",
      preferredMinutes: 45,
      mockMinutes: 60,
      allowExamDayStudy: false,
      approach: "STANDARD",
      acceptReducedReserve: false,
    },
  };
}
export function examAvailability(): AvailabilitySnapshot {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    restDays: [],
    floatingDates: [],
    existingWork: [],
    lineageFingerprint: "",
  };
}
/** Readable intent phrasing for the synthetic plan's item titles. */
const INTENT_PHRASE: Record<string, string> = {
  LEARN: "First pass",
  REVIEW: "Review",
  RECALL: "Recall check",
  PRACTICE: "Practice set",
  TIMED_PRACTICE: "Timed set",
  MISTAKE_REVIEW: "Error review",
  MOCK_EXAM: "Mock paper",
  FINAL_REVIEW: "Final review",
};

export function examProposal(): ModelProposalV1 {
  const input = examFixture();
  const entries: [string, string, string, string, number, string[]?][] = [
    ["t1", "LEARN", "COVERAGE", "2030-01-07", 45],
    ["t2", "PRACTICE", "PRACTICE", "2030-01-08", 30],
    ["t3", "PRACTICE", "PRACTICE", "2030-01-08", 30],
    ["t1", "RECALL", "CONSOLIDATION", "2030-01-09", 15],
    ["t2", "RECALL", "CONSOLIDATION", "2030-01-10", 30],
    ["t3", "RECALL", "CONSOLIDATION", "2030-01-10", 15],
    ["t1", "PRACTICE", "PRACTICE", "2030-01-11", 30],
    ["t1", "MISTAKE_REVIEW", "PRACTICE", "2030-01-12", 15],
    ["t2", "MISTAKE_REVIEW", "PRACTICE", "2030-01-12", 15],
    ["t1", "TIMED_PRACTICE", "PRACTICE", "2030-01-18", 30, ["t2", "t3"]],
    ["t1", "MOCK_EXAM", "EXAM_READINESS", "2030-01-22", 60, ["t2", "t3"]],
    ["t1", "FINAL_REVIEW", "EXAM_READINESS", "2030-01-24", 30, ["t2", "t3"]],
  ];
  return {
    schemaVersion: 1,
    mode: "EXAM",
    examDate: input.examDate,
    assumptions: ["Synthetic scope; estimates are approximate."],
    warnings: [],
    topics: input.exam.topics.map((t, i) => ({
      ref: `t${i + 1}`,
      title: t.label,
      parentRef: null,
    })),
    milestones: [],
    items: entries.map(
      ([topicRef, type, stage, date, minutes, relatedTopicRefs], i) => ({
        ref: `i${i + 1}`,
        topicRef,
        type,
        stage,
        date,
        minutes,
        relatedTopicRefs: relatedTopicRefs ?? [],
        milestoneRef: null,
        dependsOn: i === 3 ? ["i1"] : [],
        // Realistic, per-item titles. A template like "PRACTICE t2" made a legitimate
        // new item indistinguishable from one already in history, so the duplicate-history
        // guard rejected a proposal for imitating the payload's own naming style.
        title: `${INTENT_PHRASE[type] ?? type}: unit ${topicRef} on ${date}`,
        description: "Synthetic exercise",
        rationale: "Reinforce the confirmed topic with appropriate practice.",
      })
    ),
  } as ModelProposalV1;
}
