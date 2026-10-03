"use client";
import type { CommitRequest, CommitReceipt, ValidatedDraftV1 } from "./contracts";
import { resolveApiUrl } from "../api-transport";
import { invalidateClientCaches } from "../client-data-cache";

export type PlannerReviewState =
  | { phase: "EMPTY" }
  | { phase: "DRAFT" | "DIRTY" | "SAVING" | "CONFIRMING" | "CONFLICT" | "RECOVERING"; draft: ValidatedDraftV1; revisionId: string; version: number; digest: string }
  | { phase: "COMMITTED"; receipt: CommitReceipt }
  | { phase: "ARCHIVED"; planId: string };

const invalidations = ["quests", "goals", "calendar", "dashboard", "study-schedule", "planner", "/api/user/stats"] as const;
export function invalidatePlannerCommit() { invalidateClientCaches(invalidations); }
// No storage, bearer header, optimistic success, or background polling.
export async function commitPlanner(planId: string, request: CommitRequest): Promise<CommitReceipt> {
  const response = await fetch(resolveApiUrl(`/api/planner/${encodeURIComponent(planId)}/commit`), {
    method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(response.status === 409 ? "PLANNER_CONFLICT" : "PLANNER_COMMIT_FAILED");
  const receipt = await response.json() as CommitReceipt;
  invalidatePlannerCommit();
  return receipt;
}
export async function recoverPlannerCommit(planId: string, key: string): Promise<CommitReceipt | null> {
  const response = await fetch(resolveApiUrl(`/api/planner/${encodeURIComponent(planId)}/operations/${encodeURIComponent(key)}?kind=confirmation`), { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("PLANNER_RECOVERY_FAILED");
  const result = await response.json() as { confirmationReceipt: CommitReceipt | null };
  if (result.confirmationReceipt) invalidatePlannerCommit();
  return result.confirmationReceipt;
}
