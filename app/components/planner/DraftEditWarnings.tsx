"use client";
import { useState } from "react";
import {
  acknowledgementsFor,
  submitDraftEdit,
  type DraftEditFindings,
} from "@/lib/planner/edit-client";
import s from "./ExamPlanner.module.css";

/**
 * Warn → explain → accept, for an edit the planner would have refused outright.
 *
 * This is the whole of the flexible-editing interaction:
 *
 * - the warning names the consequence in one sentence ("This removes the mistake
 *   review for Matrices. That may reduce how well errors get corrected before the
 *   exam."), never "you cannot save this plan";
 * - **[Keep my change]** re-sends the *same* edit with the acknowledgements attached, so
 *   what is accepted is precisely what was shown;
 * - **[Undo]** throws the local edit away and reloads the stored draft, which is the
 *   only honest way to "not make this change" — nothing was written yet;
 * - a structural finding has no accept button at all, because there is nothing to
 *   accept: it is shown with what to do instead.
 */
export default function DraftEditWarnings({
  planId,
  body,
  findings,
  onSealed,
  onUndone,
  onError,
}: {
  planId: string;
  /** The exact request that was refused, so accepting re-sends it unchanged. */
  body: Record<string, unknown>;
  findings: DraftEditFindings;
  /** Called after the accepted edit is sealed, so the caller reloads the plan. */
  onSealed: () => void;
  /** Called after the student undoes, so the caller reloads the stored draft. */
  onUndone: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const warnings = findings.warnings.filter(
    (warning) => !findings.accepted.includes(warning.acknowledgementCode)
  );
  const blockers = findings.blockers;

  const keep = async () => {
    setBusy(true);
    try {
      const outcome = await submitDraftEdit(planId, body, acknowledgementsFor(findings));
      if (outcome.sealed) {
        onSealed();
        return;
      }
      // Still refused — a warning the student had not seen, or a blocker found behind
      // it. The banner is replaced by the caller's next render of this component.
      onError("Some of this still needs an answer before it can be saved.");
    } catch (error) {
      onError(
        error instanceof Error && error.message === "STALE_REVISION"
          ? "This draft changed elsewhere. Reload it and make the change again."
          : "The change could not be saved. Nothing was written; the stored draft is unchanged."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.banner} role="alert" aria-live="assertive" aria-label="Editing warning">
      <h3>
        {blockers.length
          ? "This change cannot be saved"
          : warnings.length === 1
            ? "This change gives something up"
            : `This change gives up ${warnings.length} things`}
      </h3>
      {warnings.length > 0 && (
        <ul>
          {warnings.map((warning) => (
            <li key={warning.acknowledgementCode}>
              <p>{warning.consequence}</p>
              <p className={s.muted}>{warning.code.replaceAll("_", " ").toLowerCase()}</p>
            </li>
          ))}
        </ul>
      )}
      {blockers.length > 0 && (
        <ul>
          {blockers.map((blocker) => (
            <li key={blocker.acknowledgementCode}>
              <p>{blocker.consequence}</p>
            </li>
          ))}
        </ul>
      )}
      <div className={s.row}>
        {warnings.length > 0 && (
          <button type="button" disabled={busy} onClick={() => void keep()}>
            {busy ? "Saving…" : "Keep my change"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={onUndone}>
          Undo
        </button>
      </div>
      <p className={s.muted}>
        Nothing has been saved yet. Accepting applies to this change only — it never becomes a
        setting.
      </p>
    </div>
  );
}
