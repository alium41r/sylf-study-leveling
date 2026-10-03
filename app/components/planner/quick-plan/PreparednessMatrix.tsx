"use client";
import { useMemo, useState } from "react";
import type { BriefPreparedness, PlanBriefV1 } from "@/lib/planner/intake/brief";
import type { ScopeNode } from "@/lib/planner/intake/scope-node";
import {
  MATRIX_BULK_LABEL,
  MATRIX_STATE_LABEL,
  MATRIX_STATE_MEANING,
  PREPAREDNESS_MATRIX_STATES,
  matrixStateOf,
  type MatrixBulkAction,
  type PreparednessMatrixState,
} from "@/lib/planner/preparedness-matrix";
import { groupUnitRows, unitRows, type UnitGroup } from "@/lib/planner/comparison/units";
import { priorityLevel, type TopicPriority } from "@/lib/planner/priority";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * The fast preparedness matrix.
 *
 * This replaces "one card per topic", which is the experience the phase exists to fix:
 * forty units, forty forms, forty chances to give up. Here each unit is one row — a
 * label and six one-click states plus a difficult flag — grouped by chapter so a whole
 * subject area can be answered with one bulk action.
 *
 * Everything about it is optional. There is no "finish rating your topics" state, no
 * completeness warning for an unanswered matrix, and the surface says so in words: the
 * disclosure is closed by default and skipping it changes nothing about generating.
 *
 * The five (six with "studied, not rated") states are the ones the contract already
 * supports — see `lib/planner/preparedness-matrix.ts`, which maps each one onto
 * `covered`/`confidence` and never invents a number for a student who does not want to
 * rate one.
 */

export interface PreparednessMatrixProps {
  nodes: ScopeNode[];
  preparedness: BriefPreparedness[];
  /** True once the confirmed scope exists; before that there is nothing to rate. */
  ready: boolean;
  busy: boolean;
  onSetState: (nodeIds: string[], state: PreparednessMatrixState) => void;
  onSetDifficult: (nodeIds: string[], difficult: boolean) => void;
  onClear: (nodeIds: string[]) => void;
  /**
   * Priority, which the goal lists beside difficulty as the matrix's optional extras.
   *
   * It is a *separate, deliberate* answer — "how much does this matter?", not "how well
   * do I know it?" — so it has its own control and its own bulk actions, and choosing a
   * preparedness state never changes it. Nothing but an explicit click writes it.
   */
  onSetPriority: (nodeIds: string[], priority: TopicPriority) => void;
  /** Reported when the student opens or closes the matrix, for the phase's telemetry. */
  onOpened?: () => void;
}

export default function PreparednessMatrix({
  nodes,
  preparedness,
  ready,
  busy,
  onSetState,
  onSetDifficult,
  onClear,
  onSetPriority,
  onOpened,
}: PreparednessMatrixProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(() => unitRows(nodes), [nodes]);
  const groups: UnitGroup[] = useMemo(() => groupUnitRows(rows, nodes), [rows, nodes]);
  const entryFor = useMemo(
    () => new Map(preparedness.map((entry) => [entry.nodeId, entry])),
    [preparedness]
  );

  const stateOf = (nodeId: string): PreparednessMatrixState | null =>
    matrixStateOf(entryFor.get(nodeId));
  const rated = rows.filter((unit) => stateOf(unit.unitRef) !== "UNKNOWN").length;
  const selection = [...selected].filter((nodeId) => rows.some((row) => row.unitRef === nodeId));
  /** What a bulk action applies to: the selection when there is one, otherwise the scope. */
  const targets = selection.length ? selection : rows.map((row) => row.unitRef);

  const toggleSelected = (nodeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const bulk = (action: MatrixBulkAction) => {
    if (action === "MARK_DIFFICULT") return onSetDifficult(targets, true);
    if (action === "CLEAR_DIFFICULT") return onSetDifficult(targets, false);
    if (action === "CLEAR_PREPAREDNESS") return onClear(targets);
    if (action === "SET_PRIORITY_HIGH") return onSetPriority(targets, "HIGH");
    if (action === "SET_PRIORITY_LOW") return onSetPriority(targets, "LOW");
    if (action === "CLEAR_PRIORITY") return onSetPriority(targets, "NEUTRAL");
    const state = action.replace("SET_", "") as PreparednessMatrixState;
    return onSetState(targets, state);
  };

  /** Select or clear every row in one chapter, so a bulk action can reach exactly it. */
  const toggleGroupSelection = (group: UnitGroup, select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of group.rows) {
        if (select) next.add(row.unitRef);
        else next.delete(row.unitRef);
      }
      return next;
    });

  return (
    <details
      className={`${base.card} ${s.matrixCard}`}
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) onOpened?.();
      }}
    >
      <summary>
        <strong>Rate what you already know</strong>{" "}
        <span className={s.optional}>(optional)</span>
      </summary>

      <p className={s.hint}>
        {ready
          ? `${rated} of ${rows.length} units rated. Every unit left unrated is planned as work to learn — Sylf assumes nothing either way. Skipping this changes nothing about generating your plan.`
          : "Confirm what you need to cover first, then you can rate it here."}
      </p>

      {!ready ? null : (
        <>
          <div className={s.matrixToolbar} role="group" aria-label="Bulk preparedness actions">
            <p className={s.matrixSelection} role="status" aria-live="polite">
              {selection.length
                ? `${selection.length} selected`
                : `No selection — actions apply to all ${rows.length} units`}
            </p>
            <div className={s.matrixButtons}>
              {(["SET_UNKNOWN", "SET_NOT_STUDIED", "SET_STUDIED_UNRATED", "SET_WEAK", "SET_OKAY", "SET_STRONG", "MARK_DIFFICULT", "CLEAR_DIFFICULT", "SET_PRIORITY_HIGH", "SET_PRIORITY_LOW", "CLEAR_PRIORITY", "CLEAR_PREPAREDNESS"] as MatrixBulkAction[]).map(
                (action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy || !targets.length}
                    onClick={() => bulk(action)}
                  >
                    {MATRIX_BULK_LABEL[action]}
                  </button>
                )
              )}
              {selection.length > 0 && (
                <button type="button" disabled={busy} onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              )}
            </div>
          </div>

          <div className={s.matrix} role="group" aria-label="Preparedness by unit">
            {/* The column headings are a visual aid; every control carries its own name. */}
            <div className={s.matrixHead} aria-hidden="true">
              <span />
              <span>Unit</span>
              {PREPAREDNESS_MATRIX_STATES.map((state) => (
                <span key={state}>{MATRIX_STATE_LABEL[state]}</span>
              ))}
              <span>Difficult</span>
            </div>
            {groups.map((group) => {
              const isOpen = group.rows.length <= 8 || openGroup.has(group.key);
              const groupSelected =
                group.rows.length > 0 && group.rows.every((row) => selected.has(row.unitRef));
              return (
                <details
                  key={group.key || "loose"}
                  className={s.matrixGroup}
                  open={isOpen}
                  onToggle={(event) => {
                    const isNowOpen = (event.currentTarget as HTMLDetailsElement).open;
                    setOpenGroup((prev) => {
                      const next = new Set(prev);
                      if (isNowOpen) next.add(group.key);
                      else next.delete(group.key);
                      return next;
                    });
                  }}
                >
                  <summary>
                    <strong>{group.label}</strong> ({group.rows.length})
                  </summary>
                  <div className={base.actions}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleGroupSelection(group, !groupSelected)}
                    >
                      {groupSelected ? `Deselect all of “${group.label}”` : `Select all of “${group.label}”`}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onClear(group.rows.map((row) => row.unitRef))}
                    >
                      Reset “{group.label}” to not rated
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSetState(group.rows.map((row) => row.unitRef), "STUDIED_UNRATED")}
                    >
                      Mark “{group.label}” as studied, not rated
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSetPriority(group.rows.map((row) => row.unitRef), "HIGH")}
                    >
                      Mark “{group.label}” high priority
                    </button>
                  </div>
                  <ul className={s.matrixRows}>
                    {group.rows.map((row) => {
                      const state = stateOf(row.unitRef);
                      const entry = entryFor.get(row.unitRef);
                      const label = row.label;
                      return (
                        <li key={row.unitRef} className={s.matrixRow}>
                          <label className={s.matrixSelect}>
                            <input
                              type="checkbox"
                              checked={selected.has(row.unitRef)}
                              disabled={busy}
                              aria-label={`Select ${label}`}
                              onChange={() => toggleSelected(row.unitRef)}
                            />
                          </label>
                          <span className={s.matrixLabel} id={`matrix-label-${row.unitRef}`}>
                            {label}
                          </span>
                          <div
                            className={s.matrixStates}
                            role="radiogroup"
                            aria-labelledby={`matrix-label-${row.unitRef}`}
                          >
                            {PREPAREDNESS_MATRIX_STATES.map((option) => (
                              <label key={option} className={s.matrixState}>
                                <input
                                  type="radio"
                                  name={`prep-${row.unitRef}`}
                                  value={option}
                                  checked={state === option}
                                  disabled={busy}
                                  aria-label={`${MATRIX_STATE_LABEL[option]} for ${label}`}
                                  title={MATRIX_STATE_MEANING[option]}
                                  onChange={() => onSetState([row.unitRef], option)}
                                />
                                <span>{MATRIX_STATE_LABEL[option]}</span>
                              </label>
                            ))}
                          </div>
                          <label className={s.matrixDifficult}>
                            <input
                              type="checkbox"
                              checked={entry?.difficult === true}
                              disabled={busy}
                              aria-label={`Mark ${label} as difficult`}
                              onChange={(event) => onSetDifficult([row.unitRef], event.target.checked)}
                            />
                            <span>Difficult</span>
                          </label>
                          <label className={s.matrixPriority}>
                            <span className={s.visuallyHidden}>Priority for {label}</span>
                            <select
                              value={priorityLevel(entry ?? {})}
                              disabled={busy}
                              aria-label={`Priority for ${label}`}
                              onChange={(event) =>
                                onSetPriority([row.unitRef], event.target.value as TopicPriority)
                              }
                            >
                              <option value="NEUTRAL">No priority</option>
                              <option value="LOW">Low priority</option>
                              <option value="HIGH">High priority</option>
                            </select>
                          </label>
                          {state === null && (
                            // A state the six buttons cannot express (a confidence with no
                            // coverage statement, reachable through Advanced setup). Said out
                            // loud rather than snapped to the nearest button.
                            <p className={s.hint}>
                              Advanced setup has a rating here that the matrix does not show: confidence{" "}
                              {entry?.confidence ?? "—"} with coverage unstated. Choosing a state above
                              replaces it.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
          <p className={s.hint}>
            Unrated units are planned as work to learn. Nothing here is required, and nothing
            here is sent anywhere: it stays in your brief until you generate a plan.
          </p>
        </>
      )}
    </details>
  );
}

/** The subset of the brief the matrix reads, for callers that pass the whole brief. */
export type MatrixBrief = Pick<PlanBriefV1, "preparedness" | "scope">;
