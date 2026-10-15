"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PlannerClientError,
  plannerFetch,
  postJson,
  requestGeneration,
  type Recovery,
} from "@/lib/planner/transport";
import { invalidatePlannerCommit } from "@/lib/planner/client";
import type { CommitReceipt, PlannerItem, ValidatedDraftV1 } from "@/lib/planner/contracts";
import type { IntakeView } from "@/lib/planner/intake/actions";
import {
  createOrResumeIntake,
  uploadIntakeSyllabus,
  type ImportSummary as ImportReport,
  intakeErrorCode,
  readIntake,
  readMirror,
  sendIntakeAction,
  writeMirror,
  type IntakeActionRequest,
} from "@/lib/planner/intake/client";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import {
  intakeAbandoned,
  intakeCompleted,
  intakeFirstDraftRequested,
  intakeFirstInput,
  intakeReadinessChanged,
  intakeStarted,
  type IntakeCounts,
} from "@/lib/planner/intake-telemetry";

/**
 * The Quick Plan session: one brief, one server, one generation.
 *
 * The hook owns four things the surface should not have to think about.
 *
 * 1. **Restoration.** A refresh restores from the session mirror instantly and then
 *    re-reads the session from the server, which always wins. The mirror is a cache
 *    for the eye, never a source of truth.
 * 2. **Serialized mutation.** Every action carries the version it was written against,
 *    and mutations are queued, so two fast keystrokes cannot race each other into
 *    `INTAKE_STALE`.
 * 3. **Surfaced staleness.** If a second tab writes first, the server's state is shown
 *    and the student is told their last change was not applied — with the option to
 *    apply it again. Two tabs are never silently merged.
 * 4. **One generation path.** Generation goes through the same endpoint, operation and
 *    recovery the wizard uses; this hook only supplies the input the adapter built.
 */

export interface PlannerDetail {
  plan: { id: string; version: number; status: string };
  latestDraft: PlannerRevision | null;
  activeRevision: PlannerRevision | null;
}

export interface PlannerRevision {
  id: string;
  digest: string;
  inputSnapshot: { mode: string };
  outputSnapshot: ValidatedDraftV1;
  confirmationReceipt: CommitReceipt | null;
}

export type GenerationState =
  | { phase: "IDLE" }
  | { phase: "RUNNING"; stage: string }
  | { phase: "REVIEW"; planId: string; revision: PlannerRevision; draft: ValidatedDraftV1 }
  | { phase: "COMMITTED"; receipt: CommitReceipt }
  | { phase: "FAILED"; code: string; message: string; canRecover: boolean };

const STAGE_COPY: Record<string, string> = {
  calculating_capacity: "Checking your available time…",
  generating: "Drafting your plan…",
  validating_proposal: "Checking scope, dates, practice and capacity…",
  reviewing_plan: "Reviewing the plan for quality…",
  repairing_plan: "Improving the flagged items…",
  saving_draft: "Saving the draft…",
  ready: "Draft ready.",
  failed: "Generation failed. Checking what was saved…",
  cancelled: "Checking the cancellation…",
};

export interface IntakeSession {
  view: IntakeView | null;
  /** True while the session is being restored and no authoritative state exists yet. */
  restoring: boolean;
  /** A message the surface should show; already written for a student to read. */
  notice: string;
  /** Set when another tab wrote first: the server's state is shown, not merged. */
  staleAction: IntakeActionRequest | null;
  expired: boolean;
  busy: boolean;
  generation: GenerationState;
  act: (action: IntakeActionRequest) => Promise<IntakeView | null>;
  reload: () => Promise<void>;
  startFresh: () => Promise<void>;
  reapplyStale: () => Promise<void>;
  generate: () => Promise<void>;
  confirm: (options?: { acknowledgeExclusions?: boolean }) => Promise<void>;
  cancelGeneration: () => void;
  /**
   * Record that the student read and accepted the advisories shown to them.
   *
   * Advisory findings never block generation — they describe a consequence, and the
   * count is what the intake telemetry reports so the cost of those warnings is
   * measurable rather than assumed.
   */
  noteWarningsAccepted: (count: number) => void;
  /** Scope discovery and import. Each ends in a candidate awaiting the student's decision. */
  findSyllabus: () => Promise<IntakeView | null>;
  pasteScope: (text: string, origin: "PASTE" | "DOCUMENT", sourceTitle?: string | null) => Promise<IntakeView | null>;
  uploadSyllabus: (file: File) => Promise<(IntakeView & { import: ImportReport }) | null>;
  confirmCandidate: (decision: {
    nodeIds: string[];
    renames?: { nodeId: string; label: string }[];
    additions?: import("@/lib/planner/intake/scope-node").ScopeNode[];
  }) => Promise<IntakeView | null>;
  discardCandidate: () => Promise<IntakeView | null>;
  setResearchPolicy: (policy: "ALLOW" | "OFF") => Promise<IntakeView | null>;
  /** True while a search or an extraction is running. */
  researching: boolean;
  /** The import route's own report: which pages were read, and whether anything was missed. */
  importReport: ImportReport | null;
  /** Phase 3: the background curriculum, the comparison and the fast matrix. */
  saveBackground: (input: {
    label: string | null;
    level: string | null;
    board: string | null;
    subjects: string[];
  }) => Promise<IntakeView | null>;
  compareCurricula: (options?: { force?: boolean }) => Promise<IntakeView | null>;
  correctOverlap: (
    unitRef: string,
    overlap: import("@/lib/planner/comparison/contracts").OverlapState,
    clear?: boolean
  ) => Promise<IntakeView | null>;
  applyCoverageSuggestion: (nodeIds: string[]) => Promise<IntakeView | null>;
  setPreparednessState: (
    nodeIds: string[],
    state: import("@/lib/planner/preparedness-matrix").PreparednessMatrixState
  ) => Promise<IntakeView | null>;
  setDifficult: (nodeIds: string[], difficult: boolean) => Promise<IntakeView | null>;
  /**
   * Priority, from the matrix's own controls.
   *
   * The existing `setPriority` action already carries the provenance enum, and
   * `USER_EXPLICIT` is the only honest value here: the student clicked it.
   */
  setPriority: (
    nodeIds: string[],
    priority: import("@/lib/planner/priority").TopicPriority
  ) => Promise<IntakeView | null>;
  clearPreparedness: (nodeIds: string[]) => Promise<IntakeView | null>;
  notePreparednessOpened: () => void;
  /** True while a comparison is running, so the surface can say so. */
  comparing: boolean;
}

export function useIntakeSession(
  mode: IntakeView["mode"],
  options: { enabled?: boolean; onQuotaRefresh?: () => void; clientKey?: string } = {}
): IntakeSession {
  const enabled = options.enabled ?? true;
  const isolatedKey = options.clientKey;
  const [view, setView] = useState<IntakeView | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState("");
  const [staleAction, setStaleAction] = useState<IntakeActionRequest | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState<GenerationState>({ phase: "IDLE" });
  const [researching, setResearching] = useState(false);
  /** A comparison is research-backed, so it shares the "working" state and says so. */
  const [comparing, setComparing] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  // The authoritative view for callbacks that must not read a stale closure.
  const viewRef = useRef<IntakeView | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);
  const counts = useRef<IntakeCounts>({ fieldsTouched: 0, topicsManual: 0, topicsResearched: 0, topicsImported: 0, preparednessEdited: 0, copilotTurns: 0, warningsAccepted: 0 });

  const apply = useCallback((next: IntakeView) => {
    viewRef.current = next;
    setView(next);
    // A chat handoff is its own draft. Keep the normal unfinished brief available.
    if (!isolatedKey) writeMirror(next);
    if (next.id && started.current)
      intakeReadinessChanged(next.id, next.mode, next.readiness.canGenerate, next.readiness.missing.length);
  }, [isolatedKey]);

  /** Turn a server error into one sentence a student can act on. */
  const describe = useCallback((error: unknown): string => {
    switch (intakeErrorCode(error)) {
      case "INTAKE_EXPIRED":
        setExpired(true);
        return "This intake expired. Nothing was lost from any plan you already created; start a new brief to continue.";
      case "PAYLOAD_TOO_LARGE":
        return "This brief is too large to save. Reduce the number of units or shorten the longest entries.";
      case "BRIEF_NOT_READY":
        return "The plan still needs the essentials before it can be generated.";
      case "NOT_AVAILABLE":
        return "That is not available yet in this version.";
      case "NOT_FOUND":
        return "This intake could not be found. It may have been deleted.";
      case "INVALID_RESPONSE":
        return "Sylf could not read this brief. Nothing was changed; reload and try again.";
      default:
        return "Sylf could not reach the planner just now. Your brief is kept; try again.";
    }
  }, []);

  const restore = useCallback(async () => {
    setRestoring(true);
    setNotice("");
    const mirror = isolatedKey ? null : readMirror(mode);
    try {
      let next: IntakeView;
      if (mirror?.id) {
        try {
          next = await readIntake(mirror.id);
        } catch (error) {
          // A mirror pointing at a deleted or expired session is not a failure to
          // restore: it is a reason to create the session the student expects.
          if (intakeErrorCode(error) === "INTAKE_EXPIRED") setExpired(true);
          next = await createOrResumeIntake(mode, isolatedKey ? { clientKey: isolatedKey } : undefined);
        }
      } else {
        next = await createOrResumeIntake(mode, isolatedKey ? { clientKey: isolatedKey } : undefined);
      }
      apply(next);
      if (!started.current) {
        started.current = true;
        intakeStarted(next.id, next.mode, "QUICK_PLAN");
      }
      setExpired(false);
    } catch (error) {
      setNotice(describe(error));
    } finally {
      setRestoring(false);
    }
  }, [apply, describe, isolatedKey, mode]);

  useEffect(() => {
    if (!enabled) return;
    void restore();
  }, [enabled, restore]);

  // Leaving an intake that never produced a draft counts as abandonment — the one
  // signal that says the surface asked for more than the student was willing to give.
  useEffect(
    () => () => {
      const current = viewRef.current;
      if (current && started.current)
        intakeAbandoned(current.id, current.mode, "LEFT", counts.current);
    },
    []
  );

  const act = useCallback(
    (action: IntakeActionRequest): Promise<IntakeView | null> => {
      const run = async (): Promise<IntakeView | null> => {
        const current = viewRef.current;
        if (!current) return null;
        counts.current.fieldsTouched = (counts.current.fieldsTouched ?? 0) + 1;
        if (started.current)
          intakeFirstInput(current.id, current.mode, counts.current);
        setBusy(true);
        setNotice("");
        try {
          const next = await sendIntakeAction(current.id, action, current.version);
          setStaleAction(null);
          apply(next);
          return next;
        } catch (error) {
          if (intakeErrorCode(error) === "INTAKE_STALE") {
            // Another writer won. Show the server's state and keep the student's
            // intent available rather than replaying it behind their back.
            const fresh = await readIntake(current.id).catch(() => null);
            if (fresh) apply(fresh);
            setStaleAction(action);
            setNotice("This brief was changed in another tab, so the newest version is shown. Your last change was not applied.");
            return fresh;
          }
          setNotice(describe(error));
          return null;
        } finally {
          setBusy(false);
        }
      };
      // Serialize: the next action reads the version the previous one produced.
      const chained = queue.current.then(run, run);
      queue.current = chained.catch(() => undefined);
      return chained;
    },
    [apply, describe]
  );

  const reapplyStale = useCallback(async () => {
    const action = staleAction;
    if (!action) return;
    setStaleAction(null);
    await act(action);
  }, [act, staleAction]);

  const startFresh = useCallback(async () => {
    setRestoring(true);
    setExpired(false);
    setStaleAction(null);
    setGeneration({ phase: "IDLE" });
    try {
      apply(await createOrResumeIntake(mode, { fresh: true }));
      setNotice("A new brief was started.");
    } catch (error) {
      setNotice(describe(error));
    } finally {
      setRestoring(false);
    }
  }, [apply, describe, mode]);

  const noteWarningsAccepted = useCallback((count: number) => {
    counts.current.warningsAccepted = Math.max(0, Math.round(count));
  }, []);

  const cancelGeneration = useCallback(() => {
    const current = viewRef.current;
    if (current && started.current)
      intakeAbandoned(current.id, current.mode, "CANCELLED", counts.current);
    abort.current?.abort();
    setGeneration({ phase: "IDLE" });
  }, []);

  const generate = useCallback(async () => {
    const current = viewRef.current;
    if (!current) return;
    setNotice("");
    setBusy(true);
    setGeneration({ phase: "RUNNING", stage: "Checking your available time…" });
    if (started.current)
      intakeFirstDraftRequested(current.id, current.mode, counts.current);
    try {
      // The server builds the engine input; the client never assembles one.
      const requested = await act({ action: "requestGeneration" });
      const generationInput = requested?.generation;
      if (!requested || !generationInput) {
        setGeneration({ phase: "IDLE" });
        return;
      }
      const { requestKey, input } = generationInput;
      abort.current = new AbortController();
      await requestGeneration(
        "/api/planner/generate",
        { schemaVersion: 1, requestKey, input },
        abort.current.signal,
        (event) =>
          setGeneration({
            phase: "RUNNING",
            stage: STAGE_COPY[event.stage] ?? "Working…",
          })
      );
      await settle(requestKey);
    } catch (error) {
      if (error instanceof PlannerClientError && error.code === "PLANNER_CANCELLED") {
        setGeneration({ phase: "IDLE" });
        return;
      }
      // A failure after the request was accepted is recovered, never re-requested.
      try {
        const requested = viewRef.current ? await act({ action: "requestGeneration" }) : null;
        const key = requested?.generation?.requestKey;
        if (key) {
          await settle(key);
          return;
        }
      } catch {
        /* fall through to the reported failure */
      }
      setGeneration({
        phase: "FAILED",
        code: intakeErrorCode(error),
        message: describe(error),
        canRecover: true,
      });
    } finally {
      abort.current = null;
      setBusy(false);
      options.onQuotaRefresh?.();
    }

    /** Read what the operation produced: a draft to review, or a state to explain. */
    async function settle(requestKey: string) {
      const recovery = await plannerFetch<Recovery>(`/recover/${requestKey}`);
      const planId = recovery.planId;
      if (!planId) {
        setGeneration({
          phase: "FAILED",
          code: "PLANNER_OPERATION_INCOMPLETE",
          message:
            recovery.operation.state === "PREPARING"
              ? "Generation is still preparing. Recover shortly; trying again does not start another request."
              : "Generation did not finish. Your allowance was released and your brief is unchanged.",
          canRecover: recovery.operation.state === "PREPARING",
        });
        return;
      }
      const detail = await plannerFetch<PlannerDetail>(`/${planId}`);
      const revision = detail.latestDraft ?? detail.activeRevision;
      if (!revision) {
        setGeneration({
          phase: "FAILED",
          code: "NO_DRAFT",
          message: "The plan was created without a reviewable draft. Open the full planner to inspect it.",
          canRecover: false,
        });
        return;
      }
      // Record the link from this intake to the plan it produced, so the session can
      // be resumed later and a deleted intake never takes the plan with it.
      const bound = await act({ action: "bindPlan", requestKey }).catch(() => null);
      if (bound) intakeCompleted(bound.id);
      setGeneration({ phase: "REVIEW", planId, revision, draft: revision.outputSnapshot });
    }
  }, [act, describe, options]);

  const confirm = useCallback(
    async (confirmOptions: { acknowledgeExclusions?: boolean } = {}) => {
      if (generation.phase !== "REVIEW") return;
      const { planId, revision } = generation;
      const draft = generation.draft;
      setBusy(true);
      setNotice("");
      const body = {
        schemaVersion: 1 as const,
        revisionId: revision.id,
        digest: revision.digest,
        expectedVersion: 0,
        idempotencyKey: crypto.randomUUID(),
        selectedItemKeys: activeItems(draft).map((item) => item.key),
        createGoal: false,
        ...(confirmOptions.acknowledgeExclusions ? { acknowledgeExclusions: true } : {}),
      };
      try {
        const detail = await plannerFetch<PlannerDetail>(`/${planId}`);
        const receipt = await plannerFetch<CommitReceipt>(
          `/${planId}/commit`,
          postJson({ ...body, expectedVersion: detail.plan.version })
        );
        invalidatePlannerCommit();
        setGeneration({ phase: "COMMITTED", receipt });
        options.onQuotaRefresh?.();
      } catch (error) {
        const code = intakeErrorCode(error);
        // A lost response is recovered by the operation key, never by committing twice.
        try {
          const recovered = await plannerFetch<{ confirmationReceipt: CommitReceipt | null }>(
            `/${planId}/operations/${body.idempotencyKey}?kind=confirmation`
          );
          if (recovered.confirmationReceipt) {
            invalidatePlannerCommit();
            setGeneration({ phase: "COMMITTED", receipt: recovered.confirmationReceipt });
            return;
          }
        } catch {
          /* the reported failure below is the honest answer */
        }
        setGeneration({
          phase: "FAILED",
          code,
          message:
            code === "EXCLUSIONS_REQUIRE_ACCEPTANCE"
              ? "Some scope could not be covered in the time available. Accept that to continue, or extend the target date."
              : code === "PLANNER_CONFLICT"
                ? "This draft changed elsewhere. Reload the draft and review it again."
                : "The plan could not be confirmed. Nothing was created; the draft is saved.",
          canRecover: false,
        });
      } finally {
        setBusy(false);
      }
    },
    [generation, options]
  );

  /**
   * Scope discovery and import.
   *
   * All four paths converge on the same thing: a candidate stored on the server,
   * awaiting the student's decision. None of them can touch the confirmed scope — only
   * `confirmCandidate` can, and it is a separate, explicit act.
   */
  const runScopeWork = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      setResearching(true);
      setImportReport(null);
      try {
        return await work();
      } finally {
        setResearching(false);
      }
    },
    []
  );

  const findSyllabus = useCallback(
    () => runScopeWork(() => act({ action: "researchScope" })),
    [act, runScopeWork]
  );

  const pasteScope = useCallback(
    (text: string, origin: "PASTE" | "DOCUMENT", sourceTitle: string | null = null) =>
      runScopeWork(() =>
        act({
          action: "importScope",
          text: text.slice(0, 24_000),
          origin,
          sourceTitle,
        })
      ),
    [act, runScopeWork]
  );

  const uploadSyllabus = useCallback(
    (file: File) =>
      runScopeWork(async () => {
        const current = viewRef.current;
        if (!current) return null;
        try {
          const next = await uploadIntakeSyllabus(current.id, { file, expectedVersion: current.version });
          setImportReport(next.import ?? null);
          apply(next);
          return next;
        } catch (error) {
          // The route's own sentence is the useful one: it distinguishes an oversized
          // file from a scan with no text layer.
          setNotice(
            error instanceof PlannerClientError && error.serverMessage
              ? error.serverMessage
              : describe(error)
          );
          return null;
        }
      }),
    [apply, describe, runScopeWork]
  );

  const confirmCandidate = useCallback(
    (decision: {
      nodeIds: string[];
      renames?: { nodeId: string; label: string }[];
      additions?: import("@/lib/planner/intake/scope-node").ScopeNode[];
    }) =>
      runScopeWork(() =>
        act({
          action: "confirmScope",
          nodeIds: decision.nodeIds,
          ...(decision.renames?.length ? { renames: decision.renames } : {}),
          ...(decision.additions?.length ? { additions: decision.additions } : {}),
        })
      ),
    [act, runScopeWork]
  );

  const discardCandidate = useCallback(
    () => runScopeWork(() => act({ action: "discardScopeCandidate" })),
    [act, runScopeWork]
  );

  const setResearchPolicy = useCallback(
    (policy: "ALLOW" | "OFF") => runScopeWork(() => act({ action: "setScopeResearchPolicy", policy })),
    [act, runScopeWork]
  );

  /**
   * Phase 3 work, in the same shape as scope discovery: each is an explicit act, each
   * runs through the serialized action queue so two fast clicks cannot race, and the
   * server's answer is what the surface renders.
   */
  const saveBackground = useCallback(
    (input: {
      label: string | null;
      level: string | null;
      board: string | null;
      subjects: string[];
    }) => act({ action: "setBackgroundCurriculum", ...input }),
    [act]
  );

  const compareCurricula = useCallback(
    (options: { force?: boolean } = {}) =>
      runScopeWork(async () => {
        const current = viewRef.current;
        if (current && started.current)
          plannerTelemetry("comparison_started", { mode: current.mode });
        setComparing(true);
        try {
          return await act({ action: "compareCurricula", ...(options.force ? { force: true } : {}) });
        } finally {
          setComparing(false);
        }
      }),
    [act, runScopeWork]
  );

  const correctOverlap = useCallback(
    (
      unitRef: string,
      overlap: import("@/lib/planner/comparison/contracts").OverlapState,
      clear = false
    ) =>
      act({
        action: "setOverlapCorrection",
        unitRef,
        overlap,
        ...(clear ? { clear: true } : {}),
      }).then((next) => {
        counts.current.overlapCorrections = (counts.current.overlapCorrections ?? 0) + (clear ? 0 : 1);
        return next;
      }),
    [act]
  );

  const applyCoverageSuggestion = useCallback(
    (nodeIds: string[]) =>
      act({ action: "applyCoverageSuggestion", ...(nodeIds.length ? { nodeIds } : {}) }).then(
        (next) => {
          counts.current.preparednessSuggested =
            (counts.current.preparednessSuggested ?? 0) + nodeIds.length;
          counts.current.preparednessEdited = (counts.current.preparednessEdited ?? 0) + nodeIds.length;
          return next;
        }
      ),
    [act]
  );

  const setPreparednessState = useCallback(
    (
      nodeIds: string[],
      state: import("@/lib/planner/preparedness-matrix").PreparednessMatrixState
    ) =>
      act({ action: "bulkSetPreparedness", nodeIds, state }).then((next) => {
        counts.current.preparednessEdited = (counts.current.preparednessEdited ?? 0) + nodeIds.length;
        if (nodeIds.length > 1)
          counts.current.preparednessBulkEdits = (counts.current.preparednessBulkEdits ?? 0) + 1;
        return next;
      }),
    [act]
  );

  const setDifficult = useCallback(
    (nodeIds: string[], difficult: boolean) =>
      act({ action: "setDifficulty", nodeIds, difficult }).then((next) => {
        counts.current.preparednessEdited = (counts.current.preparednessEdited ?? 0) + nodeIds.length;
        return next;
      }),
    [act]
  );

  const setPriority = useCallback(
    (nodeIds: string[], priority: import("@/lib/planner/priority").TopicPriority) =>
      act({
        action: "setPriority",
        nodeIds,
        priority,
        prioritySource: "USER_EXPLICIT",
      }).then((next) => {
        counts.current.fieldsTouched = (counts.current.fieldsTouched ?? 0) + 1;
        if (nodeIds.length > 1)
          counts.current.preparednessBulkEdits = (counts.current.preparednessBulkEdits ?? 0) + 1;
        return next;
      }),
    [act]
  );

  const clearPreparedness = useCallback(
    (nodeIds: string[]) =>
      act({ action: "clearPreparedness", nodeIds }).then((next) => {
        counts.current.preparednessBulkEdits = (counts.current.preparednessBulkEdits ?? 0) + 1;
        return next;
      }),
    [act]
  );

  /** Opening the matrix is worth knowing about; skipping it is the absence of this. */
  const notePreparednessOpened = useCallback(() => {
    const current = viewRef.current;
    if (!current) return;
    plannerTelemetry("preparedness_opened", {
      mode: current.mode,
      preparednessEdited: current.summary.preparednessStated,
      topics: current.summary.units,
    });
  }, []);

  return {
    view,
    restoring,
    notice,
    staleAction,
    expired,
    busy,
    generation,
    act,
    reload: restore,
    startFresh,
    reapplyStale,
    generate,
    confirm,
    cancelGeneration,
    noteWarningsAccepted,
    findSyllabus,
    pasteScope,
    uploadSyllabus,
    confirmCandidate,
    discardCandidate,
    setResearchPolicy,
    researching,
    importReport,
    saveBackground,
    compareCurricula,
    correctOverlap,
    applyCoverageSuggestion,
    setPreparednessState,
    setDifficult,
    setPriority,
    clearPreparedness,
    notePreparednessOpened,
    comparing,
  };
}

/** Items a revision still expects to be executed: removal is the only exclusion. */
export const activeItems = (draft: ValidatedDraftV1): PlannerItem[] =>
  draft.items.filter((item) => !item.removed);
