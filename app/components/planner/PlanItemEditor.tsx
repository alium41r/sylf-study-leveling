"use client";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import { resolveCompletionCriteria } from "@/lib/planner/done";
import { isStretch, PLANNER_ROLE_LABEL } from "@/lib/planner/planner-role";
import { retrievalHint } from "@/lib/planner/retrieval-client";
import StretchPromotion from "./StretchPromotion";
import FrictionFeedback from "./FrictionFeedback";
import s from "./ExamPlanner.module.css";

export type PlanItem = ValidatedDraftV1["items"][number];

/** Promotion context for a STRETCH item, present only on a confirmed plan. */
export interface StretchActionProps {
  planId: string;
  revisionId: string;
  version: number;
  stale: boolean;
  promoted: boolean;
  onPromoted: () => void;
}

/**
 * One reviewable plan item, shared by the Exam timeline, a Roadmap period
 * expansion and Mastery's stage groups. STRETCH work gets a calm marker plus the
 * explicit promotion action; friction feedback is optional and never blocking.
 */
export default function PlanItemEditor({
  item,
  index,
  total,
  topicTitle,
  disposition,
  disabled,
  minDate,
  maxDate,
  errorId,
  onUpdate,
  onMove,
  stretch = null,
  friction = null,
}: {
  item: PlanItem;
  index: number;
  total: number;
  topicTitle: string | undefined;
  disposition?: string;
  disabled: boolean;
  minDate: string;
  maxDate: string;
  errorId?: string;
  onUpdate: (key: string, patch: Partial<PlanItem>) => void;
  onMove: (index: number, delta: number) => void;
  stretch?: StretchActionProps | null;
  friction?: { planId: string; revisionId: string | null } | null;
}) {
  const hint = retrievalHint(item);
  return (
    <details className={s.item}>
      <summary>
        <span className={s.badge}>
          {item.removed
            ? "REMOVED"
            : (item.masteryStage ?? item.stage)?.replaceAll("_", " ") ?? "STUDY"}
        </span>{" "}
        {item.title}
        {isStretch(item) && !item.removed && (
          <span className={s.stretchMark}>{PLANNER_ROLE_LABEL.STRETCH}</span>
        )}
        <br />
        <span className={s.muted}>
          {item.date} · {item.minutes} min · {item.type.replaceAll("_", " ")}
          {hint ? ` · ${hint}` : ""}
          {disposition ? ` · ${disposition}` : ""}
        </span>
        <br />
        <span className={s.done}>
          Done when: {resolveCompletionCriteria(item).text}
        </span>
      </summary>
      {topicTitle && <p>{topicTitle}</p>}
      {item.rationale && <p>{item.rationale}</p>}
      <p className={s.muted}>{item.description}</p>
      {stretch && isStretch(item) && !item.removed && (
        <StretchPromotion
          planId={stretch.planId}
          revisionId={stretch.revisionId}
          version={stretch.version}
          itemKey={item.key}
          stale={stretch.stale}
          promoted={stretch.promoted}
          onPromoted={stretch.onPromoted}
        />
      )}
      <fieldset disabled={disabled} aria-describedby={errorId}>
        <label>
          Quest title
          <input
            value={item.title}
            maxLength={200}
            disabled={item.locked}
            onChange={(event) => onUpdate(item.key, { title: event.target.value })}
          />
        </label>
        <label>
          Done when (completion condition)
          <input
            value={item.completionCriteria ?? resolveCompletionCriteria(item).text}
            minLength={12}
            maxLength={240}
            disabled={item.locked}
            onChange={(event) =>
              onUpdate(item.key, { completionCriteria: event.target.value })
            }
          />
        </label>
        <p className={s.muted}>
          One observable action or output. Claiming mastery is not a completion
          condition.
        </p>
        <div className={s.grid}>
          <label>
            Date
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={item.date}
              disabled={item.locked}
              onChange={(event) => onUpdate(item.key, { date: event.target.value })}
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              min={15}
              max={240}
              value={item.minutes}
              disabled={item.locked}
              onChange={(event) =>
                onUpdate(item.key, { minutes: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={item.locked ?? false}
            onChange={(event) => onUpdate(item.key, { locked: event.target.checked })}
          />
          Lock this item
        </label>
        <label className={s.check}>
          <input
            type="checkbox"
            disabled={item.locked}
            checked={item.removed ?? false}
            onChange={(event) => onUpdate(item.key, { removed: event.target.checked })}
          />
          Remove from this draft
        </label>
        <div className={s.row}>
          <button
            type="button"
            disabled={index === 0 || item.locked || disabled}
            onClick={() => onMove(index, -1)}
          >
            Move earlier
          </button>
          <button
            type="button"
            disabled={index === total - 1 || item.locked || disabled}
            onClick={() => onMove(index, 1)}
          >
            Move later
          </button>
        </div>
      </fieldset>
      {friction && (
        <FrictionFeedback
          planId={friction.planId}
          revisionId={friction.revisionId}
          itemKey={item.key}
        />
      )}
    </details>
  );
}
