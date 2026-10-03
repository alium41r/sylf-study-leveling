"use client";

import {
  plannerTelemetry,
  type IntakeAbandonReason,
  type IntakeEntryPath,
  type PlannerMode,
} from "./telemetry";

/**
 * Baseline intake telemetry (UX Phase 1a).
 *
 * Each logical event is emitted at most once per intake. The module keeps a
 * registry keyed by intake identity — the UUID minted when the wizard starts,
 * which is the identity of the in-flight plan/revision being created — so a
 * re-mount that reuses the same identity cannot re-emit, while duplicate
 * renders and React strict-mode double-invocation are also absorbed.
 *
 * Nothing here carries plan content: only the identity (a UUID), counts and
 * closed enum values cross into `plannerTelemetry`, which re-validates every
 * field against its own allowlist.
 */

export interface IntakeCounts {
  fieldsTouched?: number;
  topicsManual?: number;
  topicsResearched?: number;
  topicsImported?: number;
  preparednessEdited?: number;
  copilotTurns?: number;
  warningsAccepted?: number;
  /**
   * UX Phase 3 counts: how much of the matrix was answered, how many bulk actions that
   * took, how many units a coverage suggestion covered, and how many overlap rows the
   * student corrected. Counts only — a state, a label or a curriculum name would all be
   * content, and none of them crosses this boundary.
   */
  preparednessBulkEdits?: number;
  preparednessSuggested?: number;
  overlapCorrections?: number;
}

type IntakeState = {
  started: boolean;
  firstInput: boolean;
  draftRequested: boolean;
  /** Set once generation succeeded: an intake that produced a draft is never abandoned. */
  completed: boolean;
  abandoned: boolean;
  startedAt: number;
  lastReady: boolean | null;
  lastMissing: number | null;
};

const registry = new Map<string, IntakeState>();
/** Bounded: an abandoned intake is a finite record, never an unbounded growth. */
const MAX_REGISTRY_ENTRIES = 256;

function stateFor(id: string): IntakeState {
  let state = registry.get(id);
  if (!state) {
    state = {
      started: false,
      firstInput: false,
      draftRequested: false,
      completed: false,
      abandoned: false,
      startedAt: 0,
      lastReady: null,
      lastMissing: null,
    };
    registry.set(id, state);
    while (registry.size > MAX_REGISTRY_ENTRIES) {
      const oldest = registry.keys().next().value;
      if (typeof oldest !== "string") break;
      registry.delete(oldest);
    }
  }
  return state;
}

/**
 * The first event of any intake.
 *
 * `entryPath` distinguishes the quick surface from the legacy wizard and from
 * advanced setup, which is what lets the two flows be compared at all. It defaults
 * to `LEGACY_WIZARD` because that is what the instrumented wizard is.
 */
export function intakeStarted(
  id: string,
  mode: PlannerMode,
  entryPath: IntakeEntryPath = "LEGACY_WIZARD"
): void {
  const state = stateFor(id);
  if (state.started) return;
  state.started = true;
  state.startedAt = Date.now();
  plannerTelemetry("intake_started", { mode, entryPath });
}

export function intakeFirstInput(
  id: string,
  mode: PlannerMode,
  counts: IntakeCounts = {}
): void {
  const state = stateFor(id);
  if (state.firstInput) return;
  state.firstInput = true;
  plannerTelemetry("intake_first_input", { mode, ...counts });
}

export function intakeReadinessChanged(
  id: string,
  mode: PlannerMode,
  ready: boolean,
  missingRequired: number
): void {
  const state = stateFor(id);
  if (state.lastReady === ready && state.lastMissing === missingRequired) return;
  state.lastReady = ready;
  state.lastMissing = missingRequired;
  plannerTelemetry("intake_readiness_changed", { mode, missingRequired });
}

export function intakeFirstDraftRequested(
  id: string,
  mode: PlannerMode,
  counts: IntakeCounts = {}
): void {
  const state = stateFor(id);
  if (state.draftRequested) return;
  state.draftRequested = true;
  plannerTelemetry("intake_first_draft_requested", {
    mode,
    latencyMs: Math.max(0, Date.now() - state.startedAt),
    ...counts,
  });
}

export function intakeCompleted(id: string): void {
  const state = stateFor(id);
  if (state.completed) return;
  state.completed = true;
}

export function intakeAbandoned(
  id: string,
  mode: PlannerMode,
  reason: IntakeAbandonReason,
  counts: IntakeCounts = {}
): void {
  const state = stateFor(id);
  // Only an intake that never produced a draft is abandoned. Explicit cancel
  // happens during generation (after the request), so the suppression signal is
  // successful completion, never the request itself.
  if (!state.started || state.abandoned || state.completed) return;
  state.abandoned = true;
  plannerTelemetry("intake_abandoned", {
    mode,
    abandonReason: reason,
    ...counts,
  });
}

/** Clears the registry. Test-only; a page session never needs to forget an intake. */
export function resetIntakeTelemetry(): void {
  registry.clear();
}
