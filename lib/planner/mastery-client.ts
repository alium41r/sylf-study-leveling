"use client";
import {
  PlannerClientError,
  asModeError,
  plannerFetch,
  postJson,
  requestGeneration,
  type GenerationEvent,
  type PlannerCapabilities,
  type Recovery,
} from "./transport";
import type { MasteryFeasibility, MasteryInput } from "./mastery-policy";

export type MasteryCapabilities = PlannerCapabilities;
export class MasteryClientError extends PlannerClientError<MasteryFeasibility> {}

const asMasteryError = (error: unknown) =>
  asModeError<MasteryFeasibility, MasteryClientError>(
    error,
    (code, feasibility) => new MasteryClientError(code, feasibility)
  );

/**
 * Chapter / Unit Mastery generation: one bounded operation on the shared transport,
 * with the mastery feasibility payload carried on the error so the wizard can show
 * the deterministic choices instead of a generic failure.
 */
export async function requestMastery(
  input: MasteryInput,
  requestKey: string,
  signal: AbortSignal,
  onEvent: (event: GenerationEvent) => void
): Promise<Recovery> {
  try {
    await requestGeneration(
      "/api/planner/generate",
      { schemaVersion: 1, requestKey, input },
      signal,
      onEvent
    );
  } catch (error) {
    throw asMasteryError(error);
  }
  try {
    return await plannerFetch<Recovery>(
      `/recover/${encodeURIComponent(requestKey)}`
    );
  } catch (error) {
    throw asMasteryError(error);
  }
}

export { plannerFetch, postJson, PlannerClientError };
