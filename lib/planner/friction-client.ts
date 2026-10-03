"use client";
import type { FrictionReason } from "./friction-fields";
import { PlannerClientError, plannerFetch, postJson } from "./transport";

/**
 * Transport for the optional, side-effect-free friction feedback write. Recording
 * never calls a provider, never spends quota and never creates/moves a Quest.
 */
export class FrictionClientError extends PlannerClientError<unknown> {}

export interface RecordFrictionRequest {
  schemaVersion: 1;
  /** The revision that carries the item, when known; absent for an orphaned item. */
  revisionId?: string | null;
  itemKey: string;
  reasonCode: FrictionReason;
}

export async function recordFriction(
  planId: string,
  request: RecordFrictionRequest
): Promise<unknown> {
  try {
    return await plannerFetch(
      `/${encodeURIComponent(planId)}/friction`,
      postJson(request)
    );
  } catch (error) {
    throw error instanceof PlannerClientError
      ? new FrictionClientError(error.code, error.feasibility)
      : error;
  }
}
