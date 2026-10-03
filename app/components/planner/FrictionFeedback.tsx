"use client";
import { useState } from "react";
import {
  FRICTION_REASONS,
  FRICTION_REASON_LABEL,
  type FrictionReason,
} from "@/lib/planner/friction-fields";
import { recordFriction } from "@/lib/planner/friction-client";
import s from "./ExamPlanner.module.css";

/**
 * Optional, one-tap friction feedback for a planner item. Dismissible and never
 * required: recording writes one closed reason and triggers no generation, no
 * quota and no Quest or revision change.
 */
export default function FrictionFeedback({
  planId,
  revisionId,
  itemKey,
}: {
  planId: string;
  revisionId: string | null;
  itemKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  const record = async (reason: FrictionReason) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone(null);
    try {
      await recordFriction(planId, {
        schemaVersion: 1,
        revisionId,
        itemKey,
        reasonCode: reason,
      });
      setDone(FRICTION_REASON_LABEL[reason]);
    } catch {
      setError("Your note could not be saved. Your plan is unchanged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.friction}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide feedback" : "Why does this need changing?"}
      </button>
      {open && (
        <div>
          <p className={s.muted}>
            Optional. Your note will not change this plan or start anything.
          </p>
          <div className={s.frictionGrid} role="group" aria-label="Why it needs changing">
            {FRICTION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                aria-pressed={done === FRICTION_REASON_LABEL[reason]}
                onClick={() => void record(reason)}
              >
                {FRICTION_REASON_LABEL[reason]}
              </button>
            ))}
          </div>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className={s.done} role="status" aria-live="polite">
              Noted: “{done}”. This will not change this plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
