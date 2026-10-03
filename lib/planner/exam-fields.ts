import { z } from "zod";
import { ScopeTopicSchema } from "./scope-topic";

export const ExamIntentSchema = z.enum([
  "LEARN",
  "REVIEW",
  "RECALL",
  "PRACTICE",
  "TIMED_PRACTICE",
  "MISTAKE_REVIEW",
  "MOCK_EXAM",
  "FINAL_REVIEW",
]);
export const ExamStageSchema = z.enum([
  "COVERAGE",
  "CONSOLIDATION",
  "PRACTICE",
  "EXAM_READINESS",
]);
/** Confirmed Exam scope, sharing exactly one field set with Course Roadmap. */
export const ExamTopicSchema = ScopeTopicSchema;
export type ExamTopic = z.infer<typeof ExamTopicSchema>;
export const ExamDetailsSchema = z.strictObject({
  subjectName: z.string().trim().min(1).max(200),
  subjectId: z.number().int().positive().nullable(),
  topics: z.array(ExamTopicSchema).min(1).max(50),
  format: z.enum([
    "UNSPECIFIED",
    "MCQ",
    "STRUCTURED",
    "ESSAY",
    "PRACTICAL",
    "ORAL",
    "MIXED",
  ]),
  preferredMinutes: z.number().int().min(15).max(120),
  mockMinutes: z.number().int().min(15).max(240).nullable(),
  allowExamDayStudy: z.boolean(),
  approach: z.enum(["STANDARD", "TRIAGE"]),
  acceptReducedReserve: z.boolean(),
});
export type ExamDetails = z.infer<typeof ExamDetailsSchema>;
export const examMetadata = {
  stage: ExamStageSchema.optional(),
  rationale: z.string().min(1).max(500).optional(),
  relearnReason: z.string().min(20).max(300).optional(),
};
