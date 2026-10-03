import { deriveRemainingWorkV2 } from "./contracts";

/** Transport projection only. Sealed/planned fields remain the approved total;
 * the visible remaining forecast is derived from its accepted actual-time basis.
 * No GET writes execution state or infers completion from elapsed time. */
export function projectQuestDuration<T extends {
  plannedMinutes?: number | null; remainingMinutesEstimate?: number | null;
  remainingEstimateBasisActualSeconds?: number | null; elapsedSeconds: number;
  remainingDisposition?: string; status: string;
}>(quest: T): T & { requiresReestimate?: boolean } {
  if (quest.plannedMinutes == null) return quest;
  if (quest.remainingMinutesEstimate == null || quest.remainingEstimateBasisActualSeconds == null) throw new Error("PLANNER_DURATION_CORRESPONDENCE_REQUIRED");
  const disposition = quest.status === "COMPLETED" ? "COMPLETED" : quest.remainingDisposition === "WITHDRAWN" ? "WITHDRAWN" : "OPEN";
  return { ...quest, ...deriveRemainingWorkV2({ plannedMinutes: quest.plannedMinutes,
    remainingMinutesEstimate: quest.remainingMinutesEstimate,
    remainingEstimateBasisActualSeconds: quest.remainingEstimateBasisActualSeconds }, quest.elapsedSeconds, disposition) };
}
