"use client";

import { SylviePlannerHandoffSchema, type SylviePlannerHandoff } from "./planner-bridge";

export const PLANNER_HANDOFF_EVENT = "sylf:planner-handoff";
const HANDOFF_TTL_MS = 5 * 60_000;
let pending: { handoff: SylviePlannerHandoff; userId: number; expiresAt: number } | null = null;
const submitted = new Set<string>();

/** Prevent a remount or two responsive panels from submitting the same handoff twice. */
export function claimPlannerHandoff(id: string): boolean {
  if (submitted.has(id)) return false;
  if (submitted.size >= 64) submitted.delete(submitted.values().next().value!);
  submitted.add(id);
  return true;
}

/** A failed transfer may be explicitly retried; successful ones stay deduplicated. */
export function releasePlannerHandoff(id: string): void { submitted.delete(id); }

export function discardPlannerHandoff(): void { pending = null; }

/** Called by an explicit Review in Planner click, using the app's navigation adapter. */
export function openPlannerHandoff(
  payload: SylviePlannerHandoff,
  navigate: (href: string) => void,
  userId: number,
): void {
  const parsed = SylviePlannerHandoffSchema.safeParse(payload);
  if (!parsed.success || !Number.isSafeInteger(userId) || userId <= 0) return;
  pending = { handoff: parsed.data, userId, expiresAt: Date.now() + HANDOFF_TTL_MS };
  const detail = { userId };
  window.dispatchEvent(new CustomEvent(PLANNER_HANDOFF_EVENT, { detail }));
  // The mobile navigation adapter uses a hash route; never bypass it with location.assign.
  const inWorkspace = window.location.pathname === "/system" || window.location.hash.split("?")[0] === "#/system";
  if (!inWorkspace) navigate("/system?tab=planner");
}

/** Private request context is held only until the destination consumes it. */
export function consumePlannerHandoff(userId: number): SylviePlannerHandoff | null {
  const current = pending;
  pending = null;
  if (!current || current.userId !== userId || current.expiresAt <= Date.now()) return null;
  return current.handoff;
}
