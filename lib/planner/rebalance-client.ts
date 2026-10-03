"use client";
import {
  PlannerClientError,
  plannerFetch,
  postJson,
  requestGeneration,
  type GenerationEvent,
  type Recovery,
} from "./transport";
import type { CommitReceipt, UserInputV1 } from "./contracts";
import type {
  RebalanceInputChange,
  RebalanceReason,
} from "./rebalance-fields";

/**
 * Transport for user-approved replanning.
 *
 * One explicit request per replan, one durable operation key, recovery through the
 * owned operation endpoint and a separate atomic confirmation call. Nothing here
 * mutates live execution: the sealed proposal is a diff the student must confirm.
 */
export class RebalanceClientError extends PlannerClientError<unknown> {}

export interface RebalanceRequest {
  schemaVersion: 1;
  requestKey: string;
  expectedVersion: number;
  baseRevisionId: string;
  reasonCode: RebalanceReason;
  inputChanges: RebalanceInputChange[];
  scope: { milestoneKey: string | null };
  /** Only when the user explicitly changed something. */
  proposedInput?: UserInputV1;
}

export async function requestRebalance(
  planId: string,
  request: RebalanceRequest,
  signal: AbortSignal,
  onEvent: (event: GenerationEvent) => void
): Promise<Recovery | { planId: string; operation: unknown }> {
  try {
    await requestGeneration(
      `/api/planner/${encodeURIComponent(planId)}/rebalance`,
      request,
      signal,
      onEvent
    );
  } catch (error) {
    throw error instanceof PlannerClientError
      ? new RebalanceClientError(error.code, error.feasibility)
      : error;
  }
  try {
    return await plannerFetch<Recovery>(
      `/${encodeURIComponent(planId)}/operations/${encodeURIComponent(request.requestKey)}`
    );
  } catch (error) {
    throw error instanceof PlannerClientError
      ? new RebalanceClientError(error.code, error.feasibility)
      : error;
  }
}

/** The atomic reconciliation: all of it, or nothing. */
export async function confirmRebalance(
  planId: string,
  body: {
    schemaVersion: 1;
    revisionId: string;
    digest: string;
    expectedVersion: number;
    idempotencyKey: string;
    acknowledgeExclusions?: boolean;
  }
): Promise<CommitReceipt> {
  try {
    return await plannerFetch<CommitReceipt>(
      `/${encodeURIComponent(planId)}/rebalance/confirm`,
      postJson(body)
    );
  } catch (error) {
    throw error instanceof PlannerClientError
      ? new RebalanceClientError(error.code, error.feasibility)
      : error;
  }
}

/** Discarding a proposal changes nothing about live execution. */
export async function discardRebalance(planId: string, requestKey: string) {
  return plannerFetch(
    `/${encodeURIComponent(planId)}/operations/${encodeURIComponent(requestKey)}`,
    postJson({ schemaVersion: 1, action: "CANCEL" })
  );
}

/** The user-reported Mastery Check reflection. Never an objective score. */
export async function setCheckResult(
  planId: string,
  body: { itemKey: string; revisionId: string; result: string }
) {
  return plannerFetch(`/${encodeURIComponent(planId)}/check-result`, {
    ...postJson({ schemaVersion: 1, action: "SET", ...body }),
  });
}

export async function resetCheckResult(planId: string, itemKey: string) {
  return plannerFetch(`/${encodeURIComponent(planId)}/check-result`, {
    ...postJson({ schemaVersion: 1, action: "RESET", itemKey }),
  });
}

export { plannerFetch, postJson };
