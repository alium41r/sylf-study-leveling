"use client";
import type { PreferenceType } from "./preference-fields";
import { plannerFetch, postJson } from "./transport";

/**
 * Transport for the compact "Planning preferences" management surface: read the
 * active learned preferences for a plan, ignore one for that plan, or reset it.
 * Reads and writes are plan-scoped and side-effect free — nothing here starts a
 * provider call or a replan.
 */
export interface ActivePreference {
  preferenceType: PreferenceType;
  value: string;
  confidence: number;
  source: "CONFIRMED" | "OBSERVED";
}

export async function activePreferences(
  planId: string
): Promise<ActivePreference[]> {
  return plannerFetch<ActivePreference[]>(
    `/${encodeURIComponent(planId)}/preferences`
  );
}

export async function ignorePreferenceForPlan(
  planId: string,
  preferenceType: PreferenceType
): Promise<unknown> {
  return plannerFetch(
    `/${encodeURIComponent(planId)}/preferences`,
    postJson({ schemaVersion: 1, action: "IGNORE", preferenceType })
  );
}

export async function resetPreferenceForPlan(
  planId: string,
  preferenceType: PreferenceType
): Promise<unknown> {
  return plannerFetch(
    `/${encodeURIComponent(planId)}/preferences`,
    postJson({ schemaVersion: 1, action: "RESET", preferenceType })
  );
}
