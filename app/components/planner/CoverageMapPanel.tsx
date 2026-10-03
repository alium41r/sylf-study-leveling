"use client";
import { useMemo } from "react";
import {
  COVERAGE_PURPOSE_LABEL,
  COVERAGE_STATE_COPY,
  COVERAGE_STATE_LABEL,
  type CoverageUnitView,
} from "@/lib/planner/coverage";
import {
  deriveCoverageMap,
  type CoverageExecution,
  type CoverageHistoryItem,
  type CoverageLink,
} from "@/lib/planner/coverage-client";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import s from "./ExamPlanner.module.css";

const SOURCE_LABEL = {
  PLAN: "planned",
  HISTORY: "done",
  SUPERSEDED: "superseded",
} as const;

/**
 * The compact Coverage Map: a secondary, collapsed surface that answers only
 * "where is this unit covered?". Traceability, never an assessment — nothing here
 * can produce a mastery claim, and the copy mirrors the coverage module's own.
 */
export default function CoverageMapPanel({
  draft,
  links,
  execution,
  historyItems,
}: {
  draft: ValidatedDraftV1;
  links?: readonly CoverageLink[];
  execution?: readonly CoverageExecution[];
  historyItems?: readonly CoverageHistoryItem[];
}) {
  const map = useMemo(
    () => deriveCoverageMap({ draft, links, execution, historyItems }),
    [draft, links, execution, historyItems]
  );

  const chapters = useMemo(() => {
    const topOf = (key: string): string => {
      const topic = draft.topics.find((entry) => entry.key === key);
      return topic?.parentKey ? topOf(topic.parentKey) : key;
    };
    const grouped = new Map<
      string,
      { key: string; title: string; units: CoverageUnitView[] }
    >();
    for (const unit of map.units) {
      const topKey = topOf(unit.key);
      const existing = grouped.get(topKey);
      if (existing) {
        existing.units.push(unit);
      } else {
        const top = draft.topics.find((entry) => entry.key === topKey);
        grouped.set(topKey, {
          key: topKey,
          title: top?.title ?? unit.title,
          units: [unit],
        });
      }
    }
    return [...grouped.values()];
  }, [draft, map]);

  const titleOf = (key: string) =>
    draft.topics.find((entry) => entry.key === key)?.title ?? key;

  return (
    <details className={s.item}>
      <summary>
        Coverage map
        <span className={s.muted}>
          {" "}
          · {map.units.length} unit{map.units.length === 1 ? "" : "s"} ·{" "}
          {map.totals.UNSCHEDULED} not planned yet
        </span>
      </summary>
      <p className={s.muted}>
        Where each confirmed unit is covered — planned, revisited or practised.
        This is a schedule check, not a judgement.
      </p>
      {map.unscheduled.length > 0 && (
        <p className={s.callout}>
          Not planned yet:{" "}
          {map.unscheduled.map((key) => titleOf(key)).join(", ")}.
        </p>
      )}
      {chapters.map((chapter) => (
        <div key={chapter.key} className={s.coverageChapter}>
          {chapter.units.length > 1 && <h4>{chapter.title}</h4>}
          {chapter.units.map((unit) => (
            <details key={unit.key} className={s.item}>
              <summary>
                <span className={s.badge}>{COVERAGE_STATE_LABEL[unit.state]}</span>{" "}
                {unit.title}
              </summary>
              <p className={s.muted}>{COVERAGE_STATE_COPY[unit.state]}</p>
              {unit.touches.length === 0 ? (
                <p className={s.muted}>Nothing in this plan covers it yet.</p>
              ) : (
                <ul>
                  {unit.touches.map((touch) => (
                    <li key={`${unit.key}-${touch.itemKey}-${touch.date}-${touch.purpose}`}>
                      {touch.date} · {COVERAGE_PURPOSE_LABEL[touch.purpose]}
                      {touch.stage
                        ? ` · ${touch.stage.replaceAll("_", " ")}`
                        : ""}{" "}
                      · {SOURCE_LABEL[touch.source]}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      ))}
    </details>
  );
}
