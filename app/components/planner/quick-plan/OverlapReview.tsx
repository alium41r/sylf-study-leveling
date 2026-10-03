"use client";
import { useMemo, useState } from "react";
import type { IntakeComparisonView } from "@/lib/planner/intake/actions";
import type { OverlapState } from "@/lib/planner/comparison/contracts";
import {
  COMPARISON_DISCLAIMER,
  OVERLAP_LABEL,
  OVERLAP_MEANING,
} from "@/lib/planner/comparison/contracts";
import { unitRows, unitRowMap } from "@/lib/planner/comparison/units";
import type { ScopeNode } from "@/lib/planner/intake/scope-node";
import type { ResearchSource } from "@/lib/planner/research/contracts";
import SourcePanel from "./SourcePanel";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * The overlap map: what Sylf read about the background curriculum, shown against the
 * confirmed target, uncertainty first.
 *
 * Three properties this surface must not lose:
 *
 * 1. **It is about curricula, not people.** The one explanation is shown once, above the
 *    rows. The rows never say "you know this", and the state names are worded as facts
 *    about the curriculum ("In your curriculum", "Not in your curriculum").
 * 2. **Uncertainty comes first.** Rows are grouped `Not sure` → `Not in your curriculum`
 *    → `Partly in your curriculum`, and `In your curriculum` is collapsed, because
 *    agreeing with the rows Sylf is already confident about costs a click each and
 *    changes nothing.
 * 3. **The student's answer wins.** Every row carries its own correction control, and a
 *    correction is sent to the server as the student's statement, kept beside Sylf's
 *    rather than replacing it.
 */

const FAILURE_COPY: Record<string, string> = {
  COMPARISON_RESEARCH_OFF: "You asked Sylf to use only what you give it, so nothing was looked up.",
  COMPARISON_SEARCH_UNAVAILABLE:
    "Curriculum comparison needs a web search, which is not configured in this deployment.",
  COMPARISON_SEARCH_ZERO_RESULTS: "I searched for your background curriculum but found nothing I could read.",
  COMPARISON_FETCH_FAILED: "I found pages about your background curriculum but could not open any of them.",
  COMPARISON_MODEL_BAD_OUTPUT: "I read the pages but could not compare the two curricula from them.",
  COMPARISON_NOT_ASSERTED:
    "I read the pages, but none of them says enough about your background curriculum to mark any topic as covered.",
  COMPARISON_NOT_APPLICABLE: "Add the curriculum you studied and confirm your scope first.",
  COMPARISON_UNAVAILABLE: "Comparison could not run.",
  COMPARISON_STALE: "Your scope or background changed, so this comparison no longer applies.",
};

export interface OverlapReviewProps {
  comparison: IntakeComparisonView;
  /** The confirmed scope, for unit labels and chapter grouping. */
  nodes: ScopeNode[];
  busy: boolean;
  onCorrect: (unitRef: string, overlap: OverlapState, clear?: boolean) => void;
  onApplySuggestion: (nodeIds: string[]) => void;
  onCompare: (options?: { force?: boolean }) => void;
  onShowSources?: (sourceIds: string[]) => void;
}

/** The four-state order the rows are grouped in — uncertainty first. */
const GROUPS: { state: OverlapState; title: string; open: boolean; note: string }[] = [
  {
    state: "UNCLEAR",
    title: "Not sure",
    open: true,
    note: "Sylf could not tell. Your answer here changes the most.",
  },
  {
    state: "LIKELY_NEW_TO_CURRICULUM",
    title: "Not in your curriculum",
    open: true,
    note: "If you have studied any of these outside that curriculum, say so here.",
  },
  {
    state: "PARTIAL_OVERLAP",
    title: "Partly in your curriculum",
    open: true,
    note: "Part of each of these is in your background curriculum.",
  },
  {
    state: "LIKELY_COVERED_BY_CURRICULUM",
    title: "In your curriculum",
    open: false,
    note: "These appear in the curriculum you listed. Sylf still assumes nothing about how well you know them.",
  },
];

const OVERLAP_OPTIONS: OverlapState[] = [
  "LIKELY_COVERED_BY_CURRICULUM",
  "PARTIAL_OVERLAP",
  "LIKELY_NEW_TO_CURRICULUM",
  "UNCLEAR",
];

export default function OverlapReview({
  comparison,
  nodes,
  busy,
  onCorrect,
  onApplySuggestion,
  onCompare,
  onShowSources,
}: OverlapReviewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => unitRowMap(unitRows(nodes)), [nodes]);
  const corrected = useMemo(() => new Set(comparison.correctedRefs), [comparison.correctedRefs]);
  const suggestions = useMemo(() => new Set(comparison.suggestionRefs), [comparison.suggestionRefs]);

  const labelOf = (unitRef: string): string =>
    rows.get(unitRef)?.label ?? comparison.units.find((unit) => unit.unitRef === unitRef)?.unitRef ?? "this unit";
  const pathOf = (unitRef: string): string => (rows.get(unitRef)?.path ?? []).join(" › ");

  const sourcesFor = (unitRef: string): ResearchSource[] => {
    const unit = comparison.units.find((entry) => entry.unitRef === unitRef);
    if (!unit?.sourceIds.length) return [];
    return unit.sourceIds
      .map((id) => comparison.sources.find((source) => source.sourceId === id))
      .filter((source): source is ResearchSource => Boolean(source));
  };

  const toggle = (unitRef: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(unitRef)) next.delete(unitRef);
      else next.add(unitRef);
      return next;
    });

  // ── States that are not a result at all ─────────────────────────────────────
  if (comparison.state === "NOT_RUN" || comparison.state === "UNAVAILABLE") {
    return (
      <section className={base.card} aria-label="Curriculum comparison">
        <h3>Curriculum comparison</h3>
        <p className={s.hint}>
          {comparison.unavailableReason ??
            FAILURE_COPY[comparison.status === "UNAVAILABLE" ? "COMPARISON_UNAVAILABLE" : ""] ??
            "No comparison has been run yet."}
        </p>
        <p className={s.hint}>
          {comparison.summary || "You can rate your own topics below, or skip straight to generating."}
        </p>
      </section>
    );
  }

  if (comparison.state === "STALE") {
    return (
      <section className={base.card} aria-label="Curriculum comparison">
        <h3>Curriculum comparison</h3>
        <div className={`${s.banner} ${s.bannerWarn}`}>
          <p>{comparison.summary}</p>
        </div>
        <div className={base.actions}>
          <button type="button" className={base.primary} disabled={busy} onClick={() => onCompare({ force: true })}>
            Compare again
          </button>
        </div>
      </section>
    );
  }

  const counts = comparison.counts;
  const suggestionList = [...suggestions];

  return (
    <section className={base.card} aria-label="Curriculum comparison">
      <h3>Curriculum comparison</h3>
      <p>
        Based on the curricula: <strong>{counts.covered}</strong> likely familiar,{" "}
        <strong>{counts.partial}</strong> partly overlapping, <strong>{counts.isNew}</strong> likely
        new, <strong>{counts.unclear}</strong> unclear.
      </p>
      {/* One explanation, once. Not a disclaimer on every row. */}
      <p className={s.hint}>{COMPARISON_DISCLAIMER}</p>
      {comparison.retiredCorrections > 0 && (
        <p className={s.hint}>
          {comparison.retiredCorrections === 1
            ? "One earlier correction no longer applies, because the scope changed under it."
            : `${comparison.retiredCorrections} earlier corrections no longer apply, because the scope changed under them.`}
        </p>
      )}

      {suggestionList.length > 0 && (
        <div className={base.actions}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApplySuggestion(suggestionList)}
          >
            {suggestionList.length} topics appear in your background curriculum — apply “studied,
            confidence not rated”?
          </button>
        </div>
      )}

      {GROUPS.map((group) => {
        const units = comparison.units.filter((unit) => unit.overlap === group.state);
        if (!units.length) return null;
        return (
          <details key={group.state} open={group.open} className={s.overlapGroup}>
            <summary>
              <strong>
                {group.title} ({units.length})
              </strong>
            </summary>
            <p className={s.hint}>{group.note}</p>
            {group.state === "LIKELY_COVERED_BY_CURRICULUM" && (
              <div className={base.actions}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onApplySuggestion(
                      units
                        .map((unit) => unit.unitRef)
                        .filter((unitRef) => suggestions.has(unitRef))
                    )
                  }
                >
                  Mark all of these as studied, confidence not rated
                </button>
              </div>
            )}
            <ul className={s.overlapRows} aria-label={group.title}>
              {units.map((unit) => {
                const label = labelOf(unit.unitRef);
                const path = pathOf(unit.unitRef);
                const srcs = sourcesFor(unit.unitRef);
                const isCorrected = corrected.has(unit.unitRef);
                return (
                  <li key={unit.unitRef} className={s.overlapRow}>
                    <div className={s.overlapRowMain}>
                      <span className={s.nodeLabel}>
                        {path ? <span className={s.overlapPath}>{path} › </span> : null}
                        {label}
                      </span>
                      <span className={s.overlapState}>
                        {isCorrected ? "You said: " : ""}
                        {OVERLAP_LABEL[unit.overlap]}
                        {unit.confidence === "LOW" && !isCorrected ? " (low confidence)" : ""}
                      </span>
                    </div>
                    <div className={s.overlapRowActions}>
                      <label>
                        <span className={s.visuallyHidden}>Correct the overlap for {label}</span>
                        <select
                          value={unit.overlap}
                          disabled={busy}
                          aria-label={`Overlap for ${label}`}
                          onChange={(event) => onCorrect(unit.unitRef, event.target.value as OverlapState)}
                        >
                          {OVERLAP_OPTIONS.map((state) => (
                            <option key={state} value={state}>
                              {OVERLAP_LABEL[state]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {isCorrected && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onCorrect(unit.unitRef, unit.overlap, true)}
                        >
                          Undo my correction for {label}
                        </button>
                      )}
                      {/* A suggestion, never an automatic write. */}
                      {unit.overlap === "LIKELY_COVERED_BY_CURRICULUM" && suggestions.has(unit.unitRef) && !isCorrected && (
                        <button type="button" disabled={busy} onClick={() => onApplySuggestion([unit.unitRef])}>
                          Mark {label} as studied
                        </button>
                      )}
                      {srcs.length > 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-expanded={expanded.has(unit.unitRef)}
                          onClick={() =>
                            onShowSources
                              ? onShowSources(unit.sourceIds)
                              : toggle(unit.unitRef)
                          }
                        >
                          {srcs.length === 1 ? "1 source" : `${srcs.length} sources`} for {label}
                        </button>
                      )}
                    </div>
                    <p className={s.hint}>{OVERLAP_MEANING[unit.overlap]}</p>
                    {expanded.has(unit.unitRef) && srcs.length > 0 && (
                      <ul className={s.inlineSources} aria-label={`Sources for ${label}`}>
                        {srcs.map((source) => (
                          <li key={source.sourceId} className={s.inlineSource}>
                            {source.title ?? source.publisherOrDomain ?? source.url}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}

      {comparison.unresolved.length > 0 && (
        <>
          <p className={s.hint}>A few things stayed open:</p>
          <ul className={s.openQuestions} aria-label="Open questions about the comparison">
            {comparison.unresolved.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      )}

      <SourcePanel
        sources={comparison.sources}
        heading="Compared against"
        emptyMessage="No public source was used for this comparison."
        highlighted={comparison.units.flatMap((unit) => unit.sourceIds)}
      />

      <p className={s.hint}>
        {comparison.summary} {comparison.backgroundLabel ? `Background: ${comparison.backgroundLabel}.` : ""}
      </p>
    </section>
  );
}
