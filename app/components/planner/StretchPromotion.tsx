"use client";
import { useState } from "react";
import { PLANNER_ROLE_COPY } from "@/lib/planner/planner-role";
import {
  promoteStretchItems,
  StretchClientError,
} from "@/lib/planner/stretch-client";
import s from "./ExamPlanner.module.css";

/** Human copy for the closed promotion failure codes — never a raw code. */
const errorCopy: Record<string, string> = {
  INFEASIBLE_CAPACITY:
    "This stretch work does not fit the capacity left in your confirmed schedule, so it was not added.",
  PAST_DATE: "This work is in the past, so it cannot be added now.",
  STRETCH_REQUIRED:
    "This item is not optional stretch work, so it cannot be added this way.",
  NOT_FOUND:
    "This plan is no longer available to add work to. Reload it and try again.",
  STALE_PLAN: "This plan changed since you opened it. Reload it before adding work.",
  STALE_REVISION:
    "This plan changed since you opened it. Reload it before adding work.",
  VERSION_CONFLICT:
    "This plan changed since you opened it. Reload it before adding work.",
};

function messageFor(error: unknown): string {
  if (error instanceof StretchClientError)
    return (
      errorCopy[error.code] ??
      "This stretch work could not be added. Your plan is unchanged."
    );
  return "This stretch work could not be added. Your plan is unchanged.";
}

/**
 * The promotion action for one STRETCH item, plus its promise copy. The calm
 * marker itself lives in the item summary; this block holds the explanation and
 * the explicit "Add this stretch work" button so the action is keyboard reachable
 * without being able to fire on render.
 */
export default function StretchPromotion({
  planId,
  revisionId,
  version,
  itemKey,
  stale,
  promoted,
  onPromoted,
}: {
  planId: string;
  revisionId: string;
  version: number;
  itemKey: string;
  /** True when the reviewed revision is no longer the confirmed plan. */
  stale: boolean;
  /** True when this item already owns a Quest from an earlier promotion. */
  promoted: boolean;
  onPromoted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const promote = async () => {
    if (busy || stale || promoted) return;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await promoteStretchItems(planId, {
        schemaVersion: 1,
        revisionId,
        itemKeys: [itemKey],
        expectedVersion: version,
        idempotencyKey: crypto.randomUUID(),
      });
      setDone(true);
      onPromoted();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.stretch}>
      <p className={s.muted}>{PLANNER_ROLE_COPY.STRETCH}</p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className={s.muted} role="status" aria-live="polite">
          Adding this stretch work…
        </p>
      )}
      {promoted || done ? (
        <p className={s.done} role="status">
          {PLANNER_ROLE_COPY.PROMOTED}
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || stale}
          onClick={() => void promote()}
        >
          {busy ? "Adding…" : PLANNER_ROLE_COPY.PROMOTE}
        </button>
      )}
    </div>
  );
}
