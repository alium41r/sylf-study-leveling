import type { ModelProposalV1, UserInputV1 } from "@/lib/planner/contracts";
export const fixtureInput = (): UserInputV1 => ({ schemaVersion: 1, mode: "EXAM", title: "Algebra preparation", scope: "Linear equations and quadratics", startDate: "2030-01-07", endDate: "2030-01-11", examDate: "2030-01-11", availability: { dailyMinutes: [120,120,120,120,120,120,120], recoveryPercent: 10, blockedDates: [] } });
export const fixtureProposal = (): ModelProposalV1 => ({ schemaVersion: 1, mode: "EXAM", examDate: "2030-01-11", topics: [{ ref: "algebra", title: "Algebra", parentRef: null }], milestones: [{ ref: "ready", title: "Ready", date: "2030-01-11" }], items: [
  { ref: "learn", topicRef: "algebra", milestoneRef: "ready", dependsOn: [], type: "LEARN", title: "Linear equations", description: "Study and solve linear equations", date: "2030-01-07", minutes: 45 },
  { ref: "practice", topicRef: "algebra", milestoneRef: "ready", dependsOn: ["learn"], type: "PRACTICE", title: "Equation practice", description: "Practice independently", date: "2030-01-08", minutes: 90 },
], assumptions: [], warnings: [] });
