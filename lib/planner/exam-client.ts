"use client";
import type { ExamFeasibility, ExamInput } from "./exam-policy";
import {
  PlannerClientError,
  asModeError,
  plannerFetch,
  postJson,
  requestGeneration,
  type PlannerCapabilities,
  type Recovery,
} from "./transport";

// Re-exported so every existing Exam import path keeps working; the
// implementation lives in one shared transport module.
export {
  GenerationEventSchema,
  plannerFetch,
  postJson,
  consumeGeneration,
  requestGeneration,
  PlannerClientError,
} from "./transport";
export type { GenerationEvent, PlannerCapabilities, Recovery } from "./transport";

export type ExamCapabilities = PlannerCapabilities;
export type { Recovery as ExamRecovery };

/** Mode-specific error type, so the Exam UI can read a generation feasibility payload. */
export class ExamClientError extends PlannerClientError<ExamFeasibility> {}

export async function requestExam(
  input: ExamInput,
  requestKey: string,
  signal: AbortSignal,
  onEvent: Parameters<typeof requestGeneration>[3]
) {
  try {
    await requestGeneration(
      "/api/planner/generate",
      { schemaVersion: 1, requestKey, input },
      signal,
      onEvent
    );
  } catch (error) {
    throw asModeError<ExamFeasibility, ExamClientError>(
      error,
      (code, feasibility) => new ExamClientError(code, feasibility)
    );
  }
  try {
    return await plannerFetch<Recovery>(
      `/recover/${encodeURIComponent(requestKey)}`
    );
  } catch (error) {
    throw asModeError<ExamFeasibility, ExamClientError>(
      error,
      (code, feasibility) => new ExamClientError(code, feasibility)
    );
  }
}
