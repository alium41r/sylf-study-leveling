import { z } from "zod";

/** Versioned technical limits, never pedagogical workload targets. */
export const PLANNER_V2_VERSION = 2 as const;
export const PLANNER_V2_ENVELOPE = Object.freeze({
  serializedBytes: 4 * 1024 * 1024,
  blueprintBytes: 1024 * 1024,
  intentBytes: 3 * 1024 * 1024,
  researchEvidenceBytes: 1024 * 1024,
  executionOverheadBytes: 1024 * 1024,
  revisionMetadataBytes: 1024 * 1024,
  targets: 2,
  newlyDetailedActivities: 60,
  outstandingActivitiesPerPlan: 200,
  scopeNodes: 500,
  milestones: 100,
  timeboxMinMinutes: 5,
  timeboxMaxMinutes: 240,
  dailyCapacityMinutes: 1440,
  weeklyCapacityMinutes: 10080,
  referencesPerActivity: 24,
  evidenceRecords: 200,
  sources: 9,
  claims: 200,
  qualityIssues: 60,
  titleCharacters: 200,
  proseCharacters: 4000,
  criterionCharacters: 1000,
  summaryCharacters: 1000,
  sourceExcerptCharacters: 2000,
  researchQueries: 8,
  fetchAttempts: 16,
  sourceCharacters: 72000,
  extractedPages: 40,
  ocrPages: 6,
  followUps: 1,
  queueExpirySeconds: 600,
  leaseSeconds: 45,
  heartbeatSeconds: 10,
} as const);

export const PLANNER_V2_BUDGETS = Object.freeze({
  ADVICE: { modelCalls: 2, executionSeconds: 30, inputTokens: 16000, outputTokens: 4000 },
  CALENDAR_ONLY: { modelCalls: 2, executionSeconds: 30, inputTokens: 16000, outputTokens: 4000 },
  EDUCATIONAL: { modelCalls: 6, executionSeconds: 180, inputTokens: 80000, outputTokens: 24000 },
  RESEARCH: { modelCalls: 8, executionSeconds: 300, inputTokens: 160000, outputTokens: 32000 },
} as const);

/** The same transport bound applies to creation, reads, edits, review and apply. */
export function plannerSerializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function withPlannerEnvelope<T extends z.ZodType>(schema: T, byteLimit: number = PLANNER_V2_ENVELOPE.serializedBytes) {
  return schema.superRefine((value, ctx) => {
    if (plannerSerializedBytes(value) > byteLimit) {
      ctx.addIssue({ code: "custom", message: "PAYLOAD_TOO_LARGE" });
    }
  });
}
