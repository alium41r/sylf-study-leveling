"use client";
import type { CommitReceipt } from "@/lib/planner/contracts";
import type { PlannerFinding } from "@/lib/planner/intake/findings";
import type { GenerationState } from "./useIntake";
import { activeItems } from "./useIntake";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * Readiness, generation, review and confirmation — the "generate sooner" half.
 *
 * Two product rules are load-bearing here:
 *
 * 1. **Optional refinement is an affordance, not a warning.** When the essentials are
 *    in place the panel says so plainly and offers the primary action; "Fine-tune
 *    first" sits beside it as an equal way forward, never as a scold for not filling
 *    in more. Nothing about a missing optional field is styled as a problem.
 * 2. **The student sees what will be created before it is.** The review lists the
 *    draft's own items, and a warning that needs accepting is shown with the choice to
 *    accept it or change the brief instead of being silently applied.
 */
export default function GenerationPanel({
  readiness,
  canGenerate,
  missingLabels,
  generation,
  busy,
  onGenerate,
  onCancel,
  onConfirm,
  onFineTune,
  advancedAvailable,
  warnings,
  acceptedWarnings,
  onAcceptWarning,
}: {
  readiness: string;
  canGenerate: boolean;
  /** Student-facing names of what is still missing. Empty when ready. */
  missingLabels: readonly string[];
  generation: GenerationState;
  busy: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  onConfirm: (options?: { acknowledgeExclusions?: boolean }) => void;
  onFineTune: () => void;
  advancedAvailable: boolean;
  /** Advisory findings for the current brief. Warnings only — blockers are errors. */
  warnings: readonly PlannerFinding[];
  acceptedWarnings: readonly string[];
  onAcceptWarning: (acknowledgementCode: string, accepted: boolean) => void;
}) {
  const items = generation.phase === "REVIEW" ? activeItems(generation.draft) : [];
  const milestones = generation.phase === "REVIEW" ? generation.draft.milestones : [];
  const needsAcceptance =
    generation.phase === "FAILED" &&
    (generation.code === "EXCLUSIONS_REQUIRE_ACCEPTANCE" || generation.code === "RESERVE_ACCEPTANCE_REQUIRED");

  return (
    <section className={s.generation} aria-labelledby="quick-plan-generate">
      <div className={s.generationBar}>
        <div className={s.generationStatus}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 id="quick-plan-generate" className={s.generationTitle}>
              {canGenerate ? "I have enough to make a first draft." : "A little more is needed"}
            </h3>
            <span className={canGenerate ? s.readyPill : s.missingPill}>
              {canGenerate
                ? "Ready to generate"
                : `${missingLabels.length} detail${missingLabels.length === 1 ? "" : "s"} remaining`}
            </span>
          </div>
          <p className={s.readiness} aria-live="polite" data-readiness={readiness}>
            {readiness}
          </p>
          {!canGenerate && missingLabels.length > 0 && (
            <ul className={s.inlineMissingList}>
              {missingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
        </div>

        {generation.phase === "IDLE" && (
          <div className={s.generationActions}>
            <button
              className={`${base.primary} ${s.generateBtn}`}
              type="button"
              disabled={busy || !canGenerate}
              onClick={onGenerate}
            >
              Generate my plan
            </button>
            {advancedAvailable && (
              <button
                type="button"
                disabled={busy}
                onClick={onFineTune}
                className={s.fineTuneBtn}
              >
                Fine-tune first
              </button>
            )}
          </div>
        )}
      </div>

      {warnings.length > 0 && generation.phase !== "COMMITTED" && (
        <fieldset className={s.banner}>
          <legend>
            <strong>
              {warnings.length} thing{warnings.length === 1 ? "" : "s"} worth knowing
            </strong>
          </legend>
          <p className={s.hint}>
            These do not stop you. Read them, and change the brief instead if you would
            rather avoid them.
          </p>
          {warnings.map((warning) => (
            <label className={base.check} key={warning.acknowledgementCode}>
              <input
                type="checkbox"
                checked={acceptedWarnings.includes(warning.acknowledgementCode)}
                onChange={(event) =>
                  onAcceptWarning(warning.acknowledgementCode, event.target.checked)
                }
              />
              <span>
                {warning.consequence}
                {acceptedWarnings.includes(warning.acknowledgementCode) ? " Understood." : ""}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {generation.phase === "RUNNING" && (
        <div className={base.actions}>
          <p role="status" aria-live="polite">
            {generation.stage}
          </p>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {generation.phase === "FAILED" && (
        <div className={`${s.banner} ${s.bannerWarn}`} role="alert">
          <p>{generation.message}</p>
          <div className={base.actions}>
            {needsAcceptance && (
              <button
                className={base.primary}
                type="button"
                disabled={busy}
                onClick={() => onConfirm({ acknowledgeExclusions: true })}
              >
                Accept this and continue
              </button>
            )}
            {generation.canRecover && (
              <button type="button" disabled={busy} onClick={onGenerate}>
                Recover the last attempt
              </button>
            )}
            <button type="button" disabled={busy} onClick={onFineTune}>
              Change the brief
            </button>
          </div>
        </div>
      )}

      {generation.phase === "REVIEW" && (
        <>
          <p className={base.muted} role="status">
            {items.length} planned session{items.length === 1 ? "" : "s"}
            {milestones.length > 0 ? ` · ${milestones.length} milestone${milestones.length === 1 ? "" : "s"}` : ""}
            {generation.draft.topics.length > 0 ? ` · ${generation.draft.topics.length} topics` : ""}
          </p>
          <ul className={s.reviewItems}>
            {items.slice(0, 8).map((item) => (
              <li key={item.key}>
                <div>{item.title}</div>
                <div className={s.reviewMeta}>
                  {item.date} · {item.minutes} min
                </div>
              </li>
            ))}
            {items.length > 8 && (
              <li className={s.reviewMeta}>
                and {items.length - 8} more, all editable in the full planner
              </li>
            )}
          </ul>
          <div className={base.actions}>
            <button className={base.primary} type="button" disabled={busy} onClick={() => onConfirm()}>
              Confirm this plan
            </button>
            {advancedAvailable && (
              <button type="button" disabled={busy} onClick={onFineTune}>
                Edit it in the full planner
              </button>
            )}
          </div>
          <p className={base.muted}>
            Confirming creates the plan and its Quests. Nothing is created until you do.
          </p>
        </>
      )}

      {generation.phase === "COMMITTED" && (
        <div role="status">
          <p>
            Plan created with {generation.receipt.items.length} session
            {generation.receipt.items.length === 1 ? "" : "s"}. Your Quests are on your
            calendar.
          </p>
          <div className={base.actions}>
            <a className={base.primary} href="/planner">
              Open the plan
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

export type { CommitReceipt };
