"use client";
import { useState } from "react";
import {
  MASTERY_CHECK_RESULTS,
  MASTERY_CHECK_RESULT_COPY,
  MASTERY_CHECK_RESULT_LABEL,
  REBALANCE_CHANGE_LABEL,
  REBALANCE_REASON_LABEL,
  type RebalanceDiff,
  type RebalanceReason,
} from "@/lib/planner/rebalance-fields";
import type { CommitReceipt } from "@/lib/planner/contracts";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import type { GenerationEvent } from "@/lib/planner/transport";
import {
  RebalanceClientError,
  confirmRebalance,
  discardRebalance,
  requestRebalance,
  resetCheckResult,
  setCheckResult as saveCheckResult,
} from "@/lib/planner/rebalance-client";
import s from "./ExamPlanner.module.css";

/** The proposal shape a plan detail exposes, derived in one place for all modes. */
export interface SealedProposal {
  revisionId: string;
  requestKey: string;
  revisionDigest: string;
  diff: RebalanceDiff;
  version: number;
  reasonCode: RebalanceReason;
}

/**
 * Reads a sealed, unconfirmed replan out of a plan detail. The diff is stored inside
 * the revision, so the review shows exactly what was validated — never a re-derivation.
 */
export function sealedProposal(
  detail: {
    plan?: { version: number };
    latestDraft?: {
      id: string;
      digest: string;
      source?: string;
      operationKey?: string;
      confirmationReceipt?: unknown;
      outputSnapshot?: { rebalance?: RebalanceDiff & { reasonCode: RebalanceReason } };
    } | null;
  } | null,
  _revision?: unknown
): SealedProposal | null {
  const draft = detail?.latestDraft;
  if (!draft || draft.source !== "REBALANCE" || draft.confirmationReceipt) return null;
  const sealed = draft.outputSnapshot?.rebalance;
  if (!sealed) return null;
  return {
    revisionId: draft.id,
    requestKey: draft.operationKey ?? "",
    revisionDigest: draft.digest,
    diff: sealed,
    version: detail?.plan?.version ?? 0,
    reasonCode: sealed.reasonCode,
  };
}

export interface RebalancePanelProps {
  planId: string;
  /** The confirmed revision a replan would build on. */
  baseRevisionId: string;
  version: number;
  /** Current per-weekday availability, so a change can be stated explicitly. */
  dailyMinutes: number[];
  /** Why review may be useful right now, from the server's detection. */
  detectedReasons: readonly RebalanceReason[];
  eligible: number;
  frozen: number;
  overdue: number;
  /** Items the student locked: held back from every replan until unlocked. */
  locked?: number;
  /** A sealed but unconfirmed proposal, when one exists. */
  proposal: SealedProposal | null;
  /** Mode-specific wording. */
  labels: {
    review: string;
    discard: string;
    description: string;
  };
  /** Set for a Roadmap period revision. */
  milestoneKey?: string | null;
  /** Mastery: the check item and its current self-reported value. */
  check?: {
    itemKey: string;
    revisionId: string;
    result: string | null;
    completed: boolean;
  } | null;
  onReload: () => void;
}

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const stages: Record<string, string> = {
  calculating_capacity: "Reading your current plan…",
  generating: "Adjusting the remaining work…",
  validating_proposal: "Checking the adjusted plan…",
  reviewing_plan: "Reviewing the adjustment…",
  repairing_plan: "Repairing the flagged work…",
  saving_draft: "Saving the proposal…",
  ready: "Proposal ready to review.",
  failed: "The proposal could not be generated.",
  cancelled: "Cancelled.",
};

const conflictCopy: Record<string, string> = {
  REPLAN_STALE_BASE: "This plan changed since the proposal was made. Review it again.",
  REPLAN_STALE_EXECUTION:
    "Something in your plan changed since the proposal was made — a Quest was started, completed or edited. Review it again.",
  REPLAN_STALE_AVAILABILITY:
    "Your availability changed since the proposal was made. Review it again.",
  REPLAN_EXECUTION_CHANGED:
    "One of the Quests this proposal would replace has since been started or changed, so nothing was applied.",
  PLANNER_EXECUTION_PROTECTED:
    "Completed or active work cannot be replaced. Nothing was applied.",
  REBALANCE_TOUCHES_HISTORY:
    "This proposal would affect completed work, so it was refused. Nothing was applied.",
  QUOTA_EXHAUSTED:
    "Your allowance for replanning this week is used. Your plan is unchanged.",
  NOTHING_TO_REBALANCE:
    "Every remaining item has already been started, so there is nothing safe to rebalance.",
  // A plan may hold more items than one replan response can carry, so this is a size fact
  // rather than a fault: the copy says what happened and names the way that does work.
  REBALANCE_SCOPE_TOO_LARGE:
    "This plan holds more items than one replan can cover, so nothing was changed. Replanning a single period works at this size.",
};

function messageFor(error: unknown): string {
  if (error instanceof RebalanceClientError)
    return (
      conflictCopy[error.code] ??
      "The request could not finish. Your plan is unchanged."
    );
  return "The request could not finish. Your plan is unchanged.";
}

/**
 * The replan affordance, the diff review and the confirmation, shared by all three
 * modes. It reports what changes and, always, that completed or active history is
 * untouched — a non-zero count cannot be confirmed.
 */
export default function RebalancePanel({
  planId,
  baseRevisionId,
  version,
  dailyMinutes,
  detectedReasons,
  eligible,
  frozen,
  overdue,
  locked = 0,
  proposal,
  labels,
  milestoneKey = null,
  check = null,
  onReload,
}: RebalancePanelProps) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CommitReceipt | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [minutes, setMinutes] = useState<number[]>(dailyMinutes);
  const [checkResult, setCheckResult] = useState<string | null>(
    check?.result ?? null
  );
  const [checkBusy, setCheckBusy] = useState(false);

  const availabilityChanged = minutes.some(
    (value, index) => value !== dailyMinutes[index]
  );

  const start = async () => {
    setBusy(true);
    setError("");
    setStage("Starting…");
    const requestKey = crypto.randomUUID();
    try {
      await requestRebalance(
        planId,
        {
          schemaVersion: 1,
          requestKey,
          expectedVersion: version,
          baseRevisionId,
          reasonCode:
            detectedReasons.find((reason) => reason !== "MASTERY_CHECK_NEEDS_WORK") ??
            "USER_REQUESTED",
          inputChanges: availabilityChanged ? ["AVAILABILITY"] : [],
          scope: { milestoneKey },
          ...(availabilityChanged
            ? {
                proposedInput: {
                  // The user's own weekly grid, stated explicitly. Everything else
                  // stays exactly as confirmed.
                  availability: {
                    dailyMinutes: minutes,
                    recoveryPercent: 15,
                    blockedDates: [],
                  },
                } as never,
              }
            : {}),
        },
        new AbortController().signal,
        (event: GenerationEvent) => setStage(stages[event.stage] ?? "Working…")
      );
      plannerTelemetry("replan_generation_started", {
        planId,
        mode: undefined,
        reasonCode: "USER_REQUESTED",
      });
      setStage("Proposal ready to review.");
      onReload();
    } catch (caught) {
      setError(messageFor(caught));
      plannerTelemetry("replan_conflict", {
        planId,
        conflictCode:
          caught instanceof RebalanceClientError ? caught.code : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmRebalance(planId, {
        schemaVersion: 1,
        revisionId: proposal.revisionId,
        digest: proposal.revisionDigest,
        expectedVersion: proposal.version,
        idempotencyKey: crypto.randomUUID(),
      });
      setReceipt(result);
      plannerTelemetry("replan_confirmed", {
        planId,
        reasonCode: proposal.reasonCode,
        retained: proposal.diff.counts.RETAIN,
        moved: proposal.diff.counts.MOVE,
        replaced: proposal.diff.counts.REPLACE,
        removed: proposal.diff.counts.REMOVE,
        added: proposal.diff.counts.ADD,
        frozen: proposal.diff.frozen,
      });
      onReload();
    } catch (caught) {
      setError(messageFor(caught));
      if (caught instanceof RebalanceClientError)
        plannerTelemetry("replan_conflict", {
          planId,
          conflictCode: caught.code,
        });
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      // Discarding only releases the sealed proposal; live execution is untouched.
      await discardRebalance(planId, proposal.requestKey);
      plannerTelemetry("replan_discarded", { planId });
      onReload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const recordCheckResult = async (result: string | null) => {
    if (!check) return;
    setCheckBusy(true);
    setError("");
    try {
      if (result === null) {
        await resetCheckResult(planId, check.itemKey);
        setCheckResult(null);
        plannerTelemetry("mastery_check_result_reset", { planId });
      } else {
        await saveCheckResult(planId, {
          itemKey: check.itemKey,
          revisionId: check.revisionId,
          result,
        });
        setCheckResult(result);
        plannerTelemetry("mastery_check_result_set", { planId });
      }
      onReload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setCheckBusy(false);
    }
  };

  const sections = proposal
    ? (
        [
          ["RETAIN", "Unchanged"],
          ["MOVE", "Rescheduled"],
          ["REPLACE", "Replaced"],
          ["REMOVE", "Removed"],
          ["ADD", "New"],
        ] as const
      )
        .map(([change, heading]) => ({
          change,
          heading,
          entries: proposal.diff.entries.filter(
            (entry) => entry.change === change
          ),
        }))
        .filter((section) => section.entries.length > 0)
    : [];

  return (
    <div className={s.card}>
      <h3>{labels.review}</h3>
      <p className={s.muted}>{labels.description}</p>
      {eligible > 0 && !proposal && (
        <>
          <p className={s.muted}>
            {eligible} item{eligible === 1 ? "" : "s"} can still change
            {overdue > 0 ? `, ${overdue} of them overdue` : ""}; {frozen} are
            already completed or in progress and will not be touched.
          </p>
          {detectedReasons.length > 0 && (
            <ul>
              {detectedReasons.map((reason) => (
                <li key={reason} className={s.muted}>
                  {REBALANCE_REASON_LABEL[reason]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {locked > 0 && !proposal && (
        <p className={s.muted}>
          {locked} item{locked === 1 ? "" : "s"} you locked will stay exactly as
          {locked === 1 ? " it is" : " they are"}. Unlock an item to include it in a
          replan.
        </p>
      )}
      {eligible === 0 && !proposal && (
        <p className={s.muted}>
          Nothing is safe to rebalance: every remaining item has already been
          started or finished.
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {stage && (
        <p className={s.muted} aria-live="polite">
          {stage}
        </p>
      )}

      {proposal && (
        <>
          <p className={s.muted}>
            {REBALANCE_REASON_LABEL[proposal.reasonCode]}. Reviewing changes only:
            nothing below has been applied yet.
          </p>
          {sections.map((section) => (
            <details key={section.change} className={s.item} open>
              <summary>
                <span className={s.badge}>{REBALANCE_CHANGE_LABEL[section.change]}</span>{" "}
                {section.entries.length} item
                {section.entries.length === 1 ? "" : "s"}
              </summary>
              <ul>
                {section.entries.map((entry, index) => (
                  <li key={`${section.change}-${entry.key ?? index}`}>
                    {entry.title}
                    {entry.topicTitle ? (
                      <span className={s.muted}> · {entry.topicTitle}</span>
                    ) : null}
                    <br />
                    <span className={s.muted}>
                      {entry.fromDate === entry.toDate || !entry.toDate
                        ? entry.toDate ?? entry.fromDate ?? ""
                        : `${entry.fromDate} → ${entry.toDate}`}
                      {entry.fromMinutes !== null && entry.toMinutes !== null &&
                      entry.fromMinutes !== entry.toMinutes
                        ? ` · ${entry.fromMinutes} → ${entry.toMinutes} min`
                        : entry.toMinutes !== null
                          ? ` · ${entry.toMinutes} min`
                          : ""}
                      {entry.stage ? ` · ${entry.stage.replaceAll("_", " ")}` : ""}
                    </span>
                    <br />
                    <span className={s.muted}>{entry.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <p className={s.done}>
            {proposal.diff.counts.RETAIN} unchanged ·{" "}
            {proposal.diff.counts.MOVE} rescheduled ·{" "}
            {proposal.diff.counts.REPLACE} replaced ·{" "}
            {proposal.diff.counts.ADD} new · {proposal.diff.counts.REMOVE} removed
            <br />
            Completed or active history affected: {proposal.diff.affectedHistory}
          </p>
          <div className={s.actions}>
            <button
              className={s.primary}
              type="button"
              disabled={busy || proposal.diff.affectedHistory !== 0}
              onClick={confirm}
            >
              Confirm these changes
            </button>
            <button type="button" disabled={busy} onClick={discard}>
              {labels.discard}
            </button>
          </div>
          <p className={s.muted}>
            Confirming applies exactly these changes, once. Work that is
            completed or in progress is never moved, replaced or deleted.
          </p>
        </>
      )}

      {!proposal && eligible > 0 && (
        <>
          <details
            className={s.item}
            open={availabilityOpen}
            onToggle={(event) =>
              setAvailabilityOpen((event.target as HTMLDetailsElement).open)
            }
          >
            <summary>My availability changed</summary>
            <div className={s.grid}>
              {weekdays.map((day, index) => (
                <label key={day}>
                  {day}
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={minutes[index]}
                    onChange={(event) =>
                      setMinutes(
                        minutes.map((value, position) =>
                          position === index
                            ? Number(event.target.value)
                            : value
                        )
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p className={s.muted}>
              These minutes are used for this replan only. Your confirmed plan is
              rewritten only if you confirm the proposed changes.
            </p>
          </details>
          <div className={s.actions}>
            <button
              className={s.primary}
              type="button"
              disabled={busy}
              onClick={start}
            >
              {labels.review}
            </button>
          </div>
        </>
      )}

      {receipt && (
        <p className={s.done} role="status">
          Applied: {receipt.items.length} item
          {receipt.items.length === 1 ? "" : "s"} now planned. Nothing completed
          was changed.
        </p>
      )}

      {check?.completed && (
        <div className={s.card}>
          <h4>How did that check go?</h4>
          <p className={s.muted}>{MASTERY_CHECK_RESULT_COPY}</p>
          <div className={s.actions}>
            {MASTERY_CHECK_RESULTS.map((result) => (
              <button
                key={result}
                type="button"
                disabled={checkBusy}
                aria-pressed={checkResult === result}
                onClick={() => void recordCheckResult(result)}
              >
                {MASTERY_CHECK_RESULT_LABEL[result]}
              </button>
            ))}
            {checkResult && (
              <button
                type="button"
                disabled={checkBusy}
                onClick={() => void recordCheckResult(null)}
              >
                Clear my answer
              </button>
            )}
          </div>
          {checkResult === "NEEDS_MORE_WORK" && (
            <p className={s.muted} role="status">
              You reported that this needs more work. That is a note for you:
              Sylf will not create, move or delete anything until you start a
              review yourself.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
