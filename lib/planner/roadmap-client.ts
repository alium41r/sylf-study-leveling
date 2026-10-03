"use client";
import { resolveApiUrl } from "../api-transport";
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
import type { RoadmapFeasibility, RoadmapInput } from "./roadmap-policy";

export type RoadmapCapabilities = PlannerCapabilities;

/** Expansion feasibility reuses the roadmap feasibility shape and states. */
export type ExpansionFeasibility = RoadmapFeasibility;

export class RoadmapClientError extends PlannerClientError<RoadmapFeasibility> {}

const asRoadmapError = (error: unknown) =>
  asModeError<RoadmapFeasibility, RoadmapClientError>(
    error,
    (code, feasibility) => new RoadmapClientError(code, feasibility)
  );

export async function requestRoadmap(
  input: RoadmapInput,
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
    return await plannerFetch<Recovery>(
      `/recover/${encodeURIComponent(requestKey)}`
    );
  } catch (error) {
    throw asRoadmapError(error);
  }
}

export interface ExpansionRequest {
  schemaVersion: 1;
  requestKey: string;
  expectedVersion: number;
}

/**
 * Expansion is its own explicit user-visible operation: one bounded planner
 * expansion reservation, one durable operation key, and recovery through the owned
 * operation endpoint (never a second provider call).
 */
export async function requestExpansion(
  planId: string,
  milestoneKey: string,
  request: ExpansionRequest,
  signal: AbortSignal,
  onEvent: (event: GenerationEvent) => void
) {
  const path = `/api/planner/${encodeURIComponent(planId)}/milestones/${encodeURIComponent(milestoneKey)}/expand`;
  try {
    await requestGeneration(path, request, signal, onEvent);
    return await plannerFetch<{
      id: string;
      state: string;
      leaseExpiresAt: string | null;
      confirmationReceipt: unknown;
    }>(
      `/${encodeURIComponent(planId)}/operations/${encodeURIComponent(request.requestKey)}`
    );
  } catch (error) {
    throw asRoadmapError(error);
  }
}

/** Explicit owned cancellation of an in-flight expansion. */
export async function cancelExpansion(planId: string, requestKey: string) {
  try {
    return await plannerFetch(
      `/${encodeURIComponent(planId)}/operations/${encodeURIComponent(requestKey)}`,
      postJson({ schemaVersion: 1, action: "CANCEL" })
    );
  } catch (error) {
    throw asRoadmapError(error);
  }
}

export { plannerFetch, postJson, resolveApiUrl };
