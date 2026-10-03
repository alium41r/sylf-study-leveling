"use client";
import { PlannerClientError, plannerFetch, postJson } from "./transport";

/**
 * Transport for promoting optional STRETCH work into the schedule.
 *
 * No provider call and no plan change: it materializes an item the reviewed plan
 * already describes, so the only failure modes are freshness and capacity. The
 * component refreshes from the server response rather than optimistically
 * re-labelling the item.
 */
export class StretchClientError extends PlannerClientError<unknown> {}

export interface PromoteStretchRequest {
  schemaVersion: 1;
  revisionId: string;
  itemKeys: string[];
  expectedVersion: number;
  idempotencyKey?: string;
}

export interface StretchPromotion {
  schemaVersion: 1;
  planId: string;
  revisionId: string;
  version: number;
  items: { itemKey: string; questId: number; created: boolean }[];
  promotedAt: string;
}

export async function promoteStretchItems(
  planId: string,
  request: PromoteStretchRequest
): Promise<StretchPromotion> {
  try {
    return await plannerFetch<StretchPromotion>(
      `/${encodeURIComponent(planId)}/stretch`,
      postJson(request)
    );
  } catch (error) {
    throw error instanceof PlannerClientError
      ? new StretchClientError(error.code, error.feasibility)
      : error;
  }
}
