"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserInputV1Schema,
  type ValidatedDraftV1,
  type CommitReceipt,
} from "@/lib/planner/contracts";
import {
  deriveMasteryHorizon,
  masteryInput,
  masteryPriorityTradeoffNotes,
  masteryScopeMinutes,
  type MasteryFeasibility,
  type MasteryInput,
} from "@/lib/planner/mastery-policy";
import { softConstraintViolations } from "@/lib/planner/constraints";
import {
  MASTERY_CHECK_PREFERENCE_LABEL,
  MASTERY_DEPTH_LABEL,
  MASTERY_LIMITS,
  MASTERY_PRIOR_EXPOSURE_LABEL,
  MASTERY_STAGE_LABEL,
  type MasteryCheckPreference,
  type MasteryDepth,
  type MasteryPriorExposure,
  type MasteryStage,
} from "@/lib/planner/mastery-fields";
import { excludedMasteryTopics } from "@/lib/planner/mastery-policy";
import { PRIORITY_LABEL, type TopicPriority } from "@/lib/planner/priority";
import {
  applySmartAnswers,
  smartQuestions,
  type SmartQuestion,
} from "@/lib/planner/smart-setup";
import { commitPlanner, recoverPlannerCommit } from "@/lib/planner/client";
import {
  PlannerClientError,
  plannerFetch,
  postJson,
  type GenerationEvent,
  type PlannerCapabilities,
} from "@/lib/planner/transport";
import {
  MasteryClientError,
  requestMastery,
} from "@/lib/planner/mastery-client";
import {
  MASTERY_CHECK_STATE_LABEL,
  MASTERY_PLAN_STATE_LABEL,
  MASTERY_STAGE_RANK,
  MASTERY_UNIT_STATE_LABEL,
  masteryCheckSummary,
  masteryProgress,
  type MasteryProgress,
} from "@/lib/planner/mastery-progress";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import {
  intakeAbandoned,
  intakeCompleted,
  intakeFirstDraftRequested,
  intakeFirstInput,
  intakeReadinessChanged,
  intakeStarted,
} from "@/lib/planner/intake-telemetry";
import type {
  RebalanceDiff,
  RebalanceReason,
} from "@/lib/planner/rebalance-fields";
import PlanItemEditor from "./PlanItemEditor";
import DraftEditWarnings from "./DraftEditWarnings";
import { submitDraftEdit, type DraftEditFindings } from "@/lib/planner/edit-client";
import RebalancePanel from "./RebalancePanel";
import CoverageMapPanel from "./CoverageMapPanel";
import PreferencePanel from "./PreferencePanel";
import IntensityNote from "./IntensityNote";
import type { CoverageHistoryItem } from "@/lib/planner/coverage-client";
import s from "./ExamPlanner.module.css";

type Revision = {
  id: string;
  digest: string;
  source?: string;
  operationKey?: string;
  inputSnapshot: MasteryInput;
  outputSnapshot: ValidatedDraftV1 & {
    rebalance?: {
      reasonCode: RebalanceReason;
      counts: Record<string, number>;
      frozen: number;
      affectedHistory: number;
      entries: RebalanceDiff["entries"];
    };
  };
  confirmationReceipt: CommitReceipt | null;
};
type Detail = {
  plan: { id: string; title: string; version: number; state: string };
  latestDraft: Revision | null;
  activeRevision: Revision | null;
  links: { itemKey: string; disposition: string; questId: number | null }[];
  execution: { itemKey: string; status: string; completedAt: string | null }[];
  historyItems?: CoverageHistoryItem[];
  rebalance?: { revisionId: string; confirmed: boolean } | null;
  rebalanceState?: {
    eligible: number;
    frozen: number;
    overdue: number;
    locked?: number;
  } | null;
  checkResults?: { itemKey: string; revisionId: string; result: string }[];
};
type Summary = {
  id: string;
  title: string;
  mode: string;
  state: string;
  latestDraftRevisionId: string | null;
  activeRevisionId: string | null;
};

/**
 * Plans whose completed check has already been reported in this page session. The
 * planner records workflow state only, and reporting it once per plan revision keeps
 * re-opening a plan from inflating the count.
 */
const reportedMasteryChecks = new Set<string>();

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const steps = [
  "Your mastery plans",
  "What are you mastering?",
  "What is included?",
  "How deep, and by when?",
  "When can you study?",
  "How far along are you?",
  "Review your mastery plan",
];
const depths: MasteryDepth[] = ["ORIENTATION", "SOLID", "DEEP"];
const exposures: MasteryPriorExposure[] = ["NEW", "SOME", "MOSTLY"];
const checkPreferences: MasteryCheckPreference[] = [
  "MIXED_PRACTICE",
  "RECALL_AND_APPLY",
  "SHORT_SELF_TEST",
  "EXPLAIN_AND_SOLVE",
];
/** Deterministic feasibility reasons, in the user's own terms. */
const REASON_LABEL: Record<string, string> = {
  NO_STUDY_DATES: "Every date in this horizon is blocked or closed.",
  INSUFFICIENT_CAPACITY:
    "The confirmed unit needs more planned minutes than your availability allows in this horizon.",
  SCOPE_TOO_LARGE: `More than ${MASTERY_LIMITS.topics} units were confirmed.`,
  HORIZON_TOO_LONG: `The horizon is longer than ${MASTERY_LIMITS.horizonDays} days.`,
  SCOPE_BYTES_TOO_LARGE: "The confirmed unit list is too large to plan in one go.",
  ITEM_LIMIT_REQUIRES_SEGMENTS:
    "This unit needs more planned items than one mastery plan holds.",
};
const messages: Record<string, string> = {
  MASTERY_INFEASIBLE:
    "This unit does not fit the derived dates and your confirmed availability. The choices below say what can change.",
  MASTERY_SCOPE_TOO_LARGE: `Mastery covers one chapter or unit: up to ${MASTERY_LIMITS.topics} units and ${MASTERY_LIMITS.horizonDays} days. Select a smaller unit, or use Course / Syllabus Roadmap for a whole course.`,
  MASTERY_DETAILS_REQUIRED:
    "The unit details are incomplete. Check the unit name, its units list, the depth and the check preference.",
  MASTERY_HORIZON_MISMATCH:
    "The planned horizon changed while you were editing. Reopen the target-date step and continue.",
  MASTERY_RESERVE_ACCEPTANCE_REQUIRED:
    "Confirm your availability and explicitly accept a recovery reserve below 15%.",
  RESERVE_ACCEPTANCE_REQUIRED:
    "Confirm your availability and explicitly accept a recovery reserve below 15%.",
  CONSTRAINT_NOT_APPLICABLE:
    "One of your stated limits does not apply to mastery planning. Remove it and try again.",
  QUOTA_EXHAUSTED:
    "Your allowance for this operation is used. Existing drafts remain available to review and confirm.",
  MASTERY_SELECTION_REQUIRES_EDIT:
    "A mastery plan is confirmed as a whole. Use Edit this draft to remove or change items, then confirm.",
  EXCLUSIONS_REQUIRE_ACCEPTANCE:
    "Accept the units you removed before confirming this plan.",
  INVALID_DRAFT:
    "These edits break the plan’s required progression: every unit needs orientation where it is not already secure, its learning work, active recall and practice, mistake review where it applies, and the plan must end with its mastery check. Restore the affected work.",
  INVALID_REQUEST:
    "Check the form: a unit name, 1–12 unique units, a depth, and an availability week within 0–720 minutes are required.",
};

/**
 * Chapter / Unit Mastery wizard.
 *
 * One bounded unit or chapter, taken through the fixed progression
 * UNDERSTAND → LEARN → ACTIVE_RECALL → PRACTICE → REVIEW_MISTAKES → MASTERY_CHECK.
 * Smart Plan Setup, the availability grid, the review editor and the commit path
 * are the same components every other mode uses; what differs is the mastery
 * vocabulary and the fact that the plan is confirmed as a whole.
 */
export default function MasteryPlanner({
  capabilities: cap,
  onQuotaRefresh,
}: {
  capabilities: PlannerCapabilities;
  onQuotaRefresh?: () => void;
}) {
  const [step, setStep] = useState(0),
    [subject, setSubject] = useState(""),
    [subjectId, setSubjectId] = useState<number | null>(null),
    [unit, setUnit] = useState("");
  const [scope, setScope] = useState("");
  const [depth, setDepth] = useState<MasteryDepth>("SOLID"),
    [exposure, setExposure] = useState<MasteryPriorExposure>("SOME"),
    [checkPreference, setCheckPreference] =
      useState<MasteryCheckPreference>("MIXED_PRACTICE");
  const [targetDate, setTargetDate] = useState("");
  const [daily, setDaily] = useState<number[]>(
    weekdays.map((_, index) => (cap.restDays.includes(index) ? 0 : 45))
  );
  const [confirmedAvailability, setConfirmedAvailability] = useState(false),
    [reserve, setReserve] = useState(15),
    [reserveAccepted, setReserveAccepted] = useState(false),
    [blocked, setBlocked] = useState("");
  const [topics, setTopics] = useState<MasteryInput["mastery"]["topics"]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [feasibility, setFeasibility] = useState<MasteryFeasibility | null>(null);
  /** An edit that only needs the student's acknowledgement before it can be saved. */
  const [pendingEdit, setPendingEdit] = useState<{
    body: Record<string, unknown>;
    findings: DraftEditFindings;
  } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null),
    [draft, setDraft] = useState<ValidatedDraftV1 | null>(null),
    [dirty, setDirty] = useState(false),
    [editing, setEditing] = useState(false),
    [receipt, setReceipt] = useState<CommitReceipt | null>(null),
    [exclusionsAccepted, setExclusionsAccepted] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null),
    [saved, setSaved] = useState<Summary[]>([]),
    [requestKey, setRequestKey] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    abort = useRef<AbortController | null>(null),
    confirmation = useRef<Parameters<typeof commitPlanner>[1] | null>(null),
    intakeId = useRef<string | null>(null),
    touchedFields = useRef<Set<string>>(new Set()),
    preparednessEdits = useRef(0),
    topicsCount = useRef(0);

  const revision = detail?.latestDraft ?? detail?.activeRevision;
  const intakeCounts = () => ({
    fieldsTouched: touchedFields.current.size,
    topicsManual: topicsCount.current,
    topicsResearched: 0,
    topicsImported: 0,
    preparednessEdited: preparednessEdits.current,
    copilotTurns: 0,
    warningsAccepted: 0,
  });
  const beginIntake = () => {
    const id = crypto.randomUUID();
    intakeId.current = id;
    intakeStarted(id, "MASTERY");
  };
  const touch = (field: string) => {
    touchedFields.current.add(field);
    if (intakeId.current)
      intakeFirstInput(intakeId.current, "MASTERY", {
        fieldsTouched: touchedFields.current.size,
      });
  };
  const readinessFor = (step: number): { ready: boolean; missingRequired: number } => {
    if (step === 1) {
      const missing = unit.trim() ? 0 : 1;
      return { ready: missing === 0, missingRequired: missing };
    }
    if (step === 2) {
      const labels = scope
        .split("\n")
        .map((label) => label.trim())
        .filter(Boolean);
      const valid =
        labels.length >= 1 &&
        labels.length <= MASTERY_LIMITS.topics &&
        labels.every((label) => label.length <= 200) &&
        new Set(labels.map((label) => label.toLowerCase())).size === labels.length;
      return { ready: valid, missingRequired: valid ? 0 : 1 };
    }
    if (step === 3) {
      const valid =
        !targetDate ||
        (targetDate > cap.today &&
          (Date.parse(targetDate) - Date.parse(cap.today)) / 86400000 <=
            MASTERY_LIMITS.horizonDays);
      return { ready: valid, missingRequired: valid ? 0 : 1 };
    }
    if (step === 4) {
      const missing =
        (confirmedAvailability ? 0 : 1) +
        (reserve < 15 && !reserveAccepted ? 1 : 0);
      return { ready: missing === 0, missingRequired: missing };
    }
    return { ready: true, missingRequired: 0 };
  };
  const stepError = (step: number): string => {
    if (step === 1) return "Enter the chapter, unit or concept you are mastering.";
    if (step === 2)
      return `Enter 1–${MASTERY_LIMITS.topics} unique units, one per line, no more than 200 characters each.`;
    if (step === 3)
      return `Choose a target date inside ${MASTERY_LIMITS.horizonDays} days, or leave it empty to let Sylf derive the horizon.`;
    if (step === 4)
      return "Confirm your weekly availability and explicitly accept any reserve below 15%.";
    return "";
  };
  const { ready: readinessReady, missingRequired: readinessMissing } =
    readinessFor(step);
  useEffect(() => {
    heading.current?.focus();
  }, [step, detail?.plan.id, receipt]);
  useEffect(() => {
    void plannerFetch<Summary[]>("")
      .then((plans) => setSaved(plans.filter((plan) => plan.mode === "MASTERY")))
      .catch(() => {});
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    topicsCount.current = topics.length;
  }, [topics.length]);
  useEffect(() => {
    if (!intakeId.current) return;
    intakeReadinessChanged(
      intakeId.current,
      "MASTERY",
      readinessReady,
      readinessMissing
    );
  }, [readinessReady, readinessMissing]);
  useEffect(
    () => () => {
      if (intakeId.current)
        intakeAbandoned(intakeId.current, "MASTERY", "LEFT", {
          fieldsTouched: touchedFields.current.size,
          topicsManual: topicsCount.current,
          topicsResearched: 0,
          topicsImported: 0,
          preparednessEdited: preparednessEdits.current,
          copilotTurns: 0,
          warningsAccepted: 0,
        });
    },
    []
  );

  const report = (source: unknown) => {
    const code =
      source instanceof PlannerClientError
        ? source.code
        : source instanceof Error
          ? source.message
          : "";
    setError(
      messages[code] ??
        "The request could not finish. Your form and saved plan are retained."
    );
    if (source instanceof MasteryClientError)
      setFeasibility(source.feasibility ?? null);
  };

  /** The horizon is derived unless the student supplied a target date. */
  const derivedHorizon = (() => {
    try {
      const base = {
        startDate: cap.today,
        availability: {
          dailyMinutes: daily,
          recoveryPercent: reserve,
          blockedDates: blocked.split(/[\s,]+/).filter(Boolean),
        },
        mastery: { topics, desiredDepth: depth },
      };
      return deriveMasteryHorizon(base as never);
    } catch {
      return null;
    }
  })();
  const endDate = targetDate || derivedHorizon || "";

  const buildInput = (): MasteryInput => {
    const parsed = UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      title: unit.trim(),
      focus: unit.trim(),
      scope: topics.map((topic) => topic.label).join("\n"),
      startDate: cap.today,
      endDate,
      availability: {
        dailyMinutes: daily,
        recoveryPercent: reserve,
        blockedDates: blocked.split(/[\s,]+/).filter(Boolean),
      },
      mastery: {
        subjectName: subject.trim() || unit.trim(),
        subjectId,
        unitTitle: unit.trim(),
        topics,
        desiredDepth: depth,
        priorExposure: exposure,
        checkPreference,
        targetDate: targetDate || null,
        acceptReducedReserve: reserveAccepted,
      },
    });
    const supported = new Set<string>(
      smartQuestions(parsed as MasteryInput).map(
        (question) => question.reasonCode
      )
    );
    const usable = Object.entries(answers)
      .filter(([reasonCode]) => supported.has(reasonCode))
      .map(([reasonCode, value]) => ({ reasonCode, value }));
    const withAnswers = usable.length
      ? applySmartAnswers(parsed as MasteryInput, usable)
      : (parsed as MasteryInput);
    return masteryInput(withAnswers);
  };
  const draftInput = (() => {
    try {
      return buildInput();
    } catch {
      return null;
    }
  })();
  const questions: SmartQuestion[] = draftInput ? smartQuestions(draftInput) : [];
  const estimatedMinutes = topics.length
    ? masteryScopeMinutes(topics, depth)
    : 0;
  const tradeoffs = draftInput ? masteryPriorityTradeoffNotes(draftInput) : [];

  const loadPlan = async (id: string) => {
    const result = await plannerFetch<Detail>(`/${id}`);
    const rev = result.latestDraft ?? result.activeRevision;
    if (!rev || rev.inputSnapshot.mode !== "MASTERY" || !rev.inputSnapshot.mastery)
      throw new PlannerClientError("NO_MASTERY_DRAFT");
    const saved = rev.inputSnapshot.mastery;
    setDetail(result);
    setDraft(rev.outputSnapshot);
    setDirty(false);
    setEditing(false);
    setReceipt(rev.confirmationReceipt);
    setExclusionsAccepted(false);
    confirmation.current = null;
    setSubject(saved.subjectName);
    setSubjectId(saved.subjectId);
    setUnit(saved.unitTitle);
    setTopics(saved.topics);
    setDepth(saved.desiredDepth);
    setExposure(saved.priorExposure);
    setCheckPreference(saved.checkPreference);
    setTargetDate(saved.targetDate ?? "");
    setDaily(rev.inputSnapshot.availability.dailyMinutes);
    setReserve(rev.inputSnapshot.availability.recoveryPercent);
    setBlocked(rev.inputSnapshot.availability.blockedDates.join(", "));
    // A stored self-report is the student's own note, so it is read back verbatim.
    const storedKey =
      rev.outputSnapshot.mode === "MASTERY"
        ? (rev.outputSnapshot.items.find(
            (item) => !item.removed && item.masteryStage === "MASTERY_CHECK"
          )?.key ?? null)
        : null;
    setCheckResult(
      storedKey
        ? (result.checkResults?.find((entry) => entry.itemKey === storedKey)
            ?.result ?? null)
        : null
    );
    setError("");
    setFeasibility(null);
  };
  const recover = async (key: string) => {
    const result = await plannerFetch<{
      planId: string;
      operation: { state: string };
    }>(`/recover/${key}`);
    if (result.operation.state === "SEALED") {
      await loadPlan(result.planId);
      if (intakeId.current) intakeCompleted(intakeId.current);
      onQuotaRefresh?.();
      return;
    }
    setStage(
      result.operation.state === "PREPARING"
        ? "Generation is still preparing. Recover again shortly."
        : "Generation failed or expired. Your allowance was released."
    );
    if (result.operation.state !== "PREPARING") setRequestKey(null);
  };

  const next = () => {
    setError("");
    const gate = readinessFor(step);
    if (!gate.ready) {
      setError(stepError(step));
      return;
    }
    if (step === 2) {
      const labels = scope
        .split("\n")
        .map((label) => label.trim())
        .filter(Boolean);
      setTopics(
        labels.map(
          (label) =>
            topics.find((topic) => topic.label === label) ?? {
              label,
              covered: false,
              confidence: 2,
              difficult: false,
            }
        )
      );
    }
    setStep(step + 1);
  };

  const generate = async () => {
    setError("");
    setFeasibility(null);
    let input: MasteryInput;
    try {
      input = buildInput();
    } catch {
      setError(messages.INVALID_REQUEST);
      return;
    }
    setBusy(true);
    setReceipt(null);
    setStage("Calculating your study capacity…");
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    abort.current = new AbortController();
    if (intakeId.current)
      intakeFirstDraftRequested(intakeId.current, "MASTERY", intakeCounts());
    try {
      await requestMastery(input, key, abort.current.signal, (event: GenerationEvent) =>
        setStage(
          {
            calculating_capacity: "Calculating your study capacity…",
            generating: "Planning the learning progression…",
            validating_proposal: "Checking the plan against your unit…",
            reviewing_plan: "Reviewing the plan’s quality…",
            repairing_plan: "Repairing the flagged work…",
            saving_draft: "Saving your draft…",
            ready: "Draft ready to review.",
            failed: "Generation failed.",
            cancelled: "Generation cancelled.",
          }[event.stage] ?? "Working…"
        )
      );
      await recover(key);
      setStage("Draft ready to review.");
      setStep(6);
    } catch (caught) {
      report(caught);
      abort.current?.abort();
    } finally {
      setBusy(false);
      abort.current = null;
      onQuotaRefresh?.();
    }
  };

  const save = async () => {
    if (!detail || !draft || !revision) return;
    setBusy(true);
    setError("");
    setPendingEdit(null);
    try {
      const editBody = {
        schemaVersion: 1,
        baseRevisionId: revision.id,
        expectedVersion: detail.plan.version,
        operationKey: crypto.randomUUID(),
        itemOrder: draft.items.map((item) => item.key),
        edits: draft.items.map(
          ({ key, title, description, completionCriteria, date, minutes, locked, removed }) => ({
            key,
            title,
            description,
            completionCriteria,
            date,
            minutes,
            ...(locked !== undefined ? { locked } : {}),
            ...(removed !== undefined ? { removed } : {}),
          })
        ),
      };
      // Posted through this mode's own client, so its mocks and error types apply.
      const outcome = await submitDraftEdit(detail.plan.id, editBody, [], { fetchImpl: plannerFetch });
      if (!outcome.sealed) {
        // The progression's *stages* are the mode's architecture and stay blocked; what
        // can be accepted here is order, depth and spacing. Nothing has been written.
        setPendingEdit({ body: editBody, findings: outcome.findings });
        return;
      }
      plannerTelemetry("proposal_edited", {
        planId: detail.plan.id,
        mode: "MASTERY",
        itemsEdited: draft.items.length,
        criteriaEdited: draft.items.filter((item) => item.completionCriteria)
          .length,
      });
      await loadPlan(detail.plan.id);
      setEditing(false);
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  };

  /** A mastery plan is confirmed whole: every active item, or an explicit edit. */
  const confirm = async () => {
    if (!detail || !draft || !revision || dirty || editing) return;
    setBusy(true);
    setError("");
    const body = confirmation.current ?? {
      schemaVersion: 1 as const,
      revisionId: revision.id,
      digest: revision.digest,
      expectedVersion: detail.plan.version,
      idempotencyKey: crypto.randomUUID(),
      selectedItemKeys: draft.items
        .filter((item) => !item.removed)
        .map((item) => item.key),
      createGoal: false,
      acknowledgeExclusions: exclusionsAccepted,
    };
    confirmation.current = body;
    try {
      const result = await commitPlanner(detail.plan.id, body);
      setReceipt(result);
      plannerTelemetry("mastery_confirmed", {
        planId: result.planId,
        mode: "MASTERY",
        items: result.items.length,
        ...(draft.mode === "MASTERY"
          ? { excludedUnits: excludedMasteryTopics(draft).length }
          : {}),
      });
    } catch (caught) {
      try {
        const recovered = await recoverPlannerCommit(
          detail.plan.id,
          body.idempotencyKey
        );
        if (recovered) setReceipt(recovered);
        else report(caught);
      } catch {
        report(caught);
      }
    } finally {
      setBusy(false);
      onQuotaRefresh?.();
    }
  };

  const updateTopic = (
    label: string,
    patch: Partial<MasteryInput["mastery"]["topics"][number]>
  ) => setTopics((current) =>
    current.map((topic) => (topic.label === label ? { ...topic, ...patch } : topic))
  );
  const updateItem = (key: string, patch: Partial<ValidatedDraftV1["items"][number]>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) =>
        item.key === key ? { ...item, ...patch } : item
      ),
    } as ValidatedDraftV1);
    setDirty(true);
  };
  const moveItem = (index: number, delta: number) => {
    if (!draft) return;
    const items = [...draft.items];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setDraft({ ...draft, items } as ValidatedDraftV1);
    setDirty(true);
  };

  const checkItemKey =
    draft?.mode === "MASTERY"
      ? (draft.items.find(
          (item) => !item.removed && item.masteryStage === "MASTERY_CHECK"
        )?.key ?? null)
      : null;
  const progress: MasteryProgress | null =
    detail && draft && draft.mode === "MASTERY"
      ? masteryProgress({
          confirmed: Boolean(detail.activeRevision?.confirmationReceipt),
          today: cap.today,
          units: draft.topics.map((topic) => ({
            key: topic.key,
            title: topic.title,
          })),
          items: draft.items.map((item) => ({
            key: item.key,
            topicKey: item.topicKey,
            masteryStage: item.masteryStage,
            type: item.type,
            title: item.title,
            date: item.date,
            minutes: item.minutes,
            relatedTopicKeys: item.relatedTopicKeys,
            removed: item.removed,
          })),
          execution: detail.execution,
        })
      : null;
  const reviewNotes =
    revision?.inputSnapshot.mode === "MASTERY" && draft?.mode === "MASTERY"
      ? [
          ...softConstraintViolations(
            revision.inputSnapshot,
            draft.items.filter((item) => !item.removed)
          ).map((violation) => violation.explanation),
          ...masteryPriorityTradeoffNotes(revision.inputSnapshot),
        ]
      : [];
  const draftExclusions = draft?.mode === "MASTERY" ? excludedMasteryTopics(draft) : [];
  const activeItems = draft?.items.filter((item) => !item.removed) ?? [];
  /**
   * A completed Mastery Check is ordinary Quest execution that the student can
   * already see. The event reports that workflow state — never a result, never a
   * verdict, and never anything the student did not just look at.
   */
  useEffect(() => {
    if (!detail || !revision || progress?.check?.state !== "COMPLETED") return;
    const key = `${detail.plan.id}:${revision.id}`;
    if (reportedMasteryChecks.has(key)) return;
    reportedMasteryChecks.add(key);
    plannerTelemetry("mastery_check_completed", {
      planId: detail.plan.id,
      mode: "MASTERY",
      items: progress.plannedItems,
    });
  }, [detail, revision, progress?.check?.state, progress?.plannedItems]);
  /** Review is stage-oriented: the progression is what the user is checking. */
  const byStage = (Object.keys(MASTERY_STAGE_LABEL) as MasteryStage[])
    .slice()
    .sort((a, b) => MASTERY_STAGE_RANK[a] - MASTERY_STAGE_RANK[b])
    .map((stageName) => ({
      stage: stageName,
      items: activeItems.filter((item) => item.masteryStage === stageName),
    }))
    .filter((group) => group.items.length);

  const promotable =
    detail?.activeRevision && detail?.latestDraft == null
      ? {
          planId: detail.plan.id,
          revisionId: detail.activeRevision.id,
          version: detail.plan.version,
        }
      : null;

  return (
    <section className={s.root} aria-label="Chapter or Unit Mastery">
      <h2 ref={heading} tabIndex={-1}>
        {steps[step]}
      </h2>
      {!detail && step > 0 && step <= 6 && (
        <div className="my-3">
          <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-muted mb-2">
            <span className="text-emerald-400">
              Step {step} of 6 · {steps[step]}
            </span>
            <span>{Math.round((step / 6) * 100)}% Complete</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5 h-1.5 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`h-full rounded-full transition-all duration-300 ${
                  i < step
                    ? "bg-emerald-500"
                    : i === step
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                      : "bg-surface-elevated/40"
                }`}
              />
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {pendingEdit && detail && (
        <DraftEditWarnings
          planId={detail.plan.id}
          body={pendingEdit.body}
          findings={pendingEdit.findings}
          onSealed={() => {
            setPendingEdit(null);
            void loadPlan(detail.plan.id).catch(report);
          }}
          onUndone={() => {
            setPendingEdit(null);
            void loadPlan(detail.plan.id).catch(report);
          }}
          onError={setError}
        />
      )}
      {stage && (
        <p className={s.muted} aria-live="polite">
          {stage}
        </p>
      )}
      {feasibility && feasibility.status !== "POTENTIAL_FIT" && (
        <div className={s.card} role="status">
          <h3>
            {feasibility.status === "SEGMENT_REQUIRED"
              ? "This scope is too large for one mastery plan"
              : "This unit does not fit your current dates and availability"}
          </h3>
          <p className={s.muted}>
            Coarse estimate {feasibility.scopeMinutes} minutes of planned work
            against {feasibility.availableMinutes} available minutes over{" "}
            {feasibility.horizonDays} days. Nothing was dropped or shortened to
            make it fit.
          </p>
          {feasibility.reasons.length > 0 && (
            <ul>
              {feasibility.reasons.map((reason) => (
                <li key={reason} className={s.muted}>
                  {REASON_LABEL[reason] ?? reason}
                </li>
              ))}
            </ul>
          )}
          <p>
            <strong>What you can do</strong>
          </p>
          <ul>
            {feasibility.choices.map((choice) => (
              <li key={choice}>{choice}</li>
            ))}
          </ul>
        </div>
      )}

      {step === 0 && (
        <div className={s.card}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-emerald-300/80">
              Deep Progression Mode
            </span>
          </div>
          <h3>Saved mastery plans</h3>
          {saved.length === 0 ? (
            <p className={s.muted}>
              No mastery plan yet. Start one below whenever you are ready.
            </p>
          ) : (
            <ul>
              {saved.map((plan) => (
                <li key={plan.id} className={s.row}>
                  <button
                    type="button"
                    onClick={() =>
                      void loadPlan(plan.id)
                        .then(() => setStep(6))
                        .catch(report)
                    }
                  >
                    {plan.title} ·{" "}
                    {plan.latestDraftRevisionId
                      ? "draft waiting for review"
                      : plan.activeRevisionId
                        ? "confirmed"
                        : "empty"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={s.actions}>
            <button
              className={s.primary}
              type="button"
              onClick={() => {
                beginIntake();
                setStep(1);
              }}
            >
              Start a mastery plan
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className={s.card}>
          <h3>What are you mastering?</h3>
          <label>
            Chapter, unit or concept
            <input
              value={unit}
              maxLength={200}
              onChange={(event) => {
                touch("unit");
                setUnit(event.target.value);
              }}
              aria-describedby="mastery-unit-hint"
            />
          </label>
          <p className={s.muted} id="mastery-unit-hint">
            One bounded piece of work — a chapter, a unit, or a concept cluster.
            A whole course belongs in Course / Syllabus Roadmap.
          </p>
          <label>
            Subject (optional)
            <input
              value={subject}
              maxLength={200}
              onChange={(event) => {
                touch("subject");
                setSubject(event.target.value);
              }}
            />
          </label>
          {cap.subjects?.length ? (
            <label>
              Link to an existing subject
              <select
                value={subjectId ?? ""}
                onChange={(event) => {
                  touch("subject");
                  setSubjectId(event.target.value ? Number(event.target.value) : null);
                }}
              >
                <option value="">No subject</option>
                {cap.subjects.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}

      {step === 2 && (
        <div className={s.card}>
          <h3>What is included?</h3>
          <label>
            Units in this chapter, one per line
            <textarea
              rows={6}
              value={scope}
              onChange={(event) => {
                touch("topics");
                setScope(event.target.value);
              }}
              aria-describedby="mastery-scope-hint"
            />
          </label>
          <p className={s.muted} id="mastery-scope-hint">
            Up to {MASTERY_LIMITS.topics} units. Nothing on this list is renamed,
            split, researched or replaced by Sylf.
          </p>
          {topics.length > 0 && (
            <fieldset>
              <legend>How far along are you in each unit?</legend>
              {topics.map((topic) => (
                <div key={topic.label} className={s.item}>
                  <strong>{topic.label}</strong>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={topic.covered ?? false}
                      onChange={(event) => {
                        touch("preparedness");
                        preparednessEdits.current++;
                        updateTopic(topic.label, { covered: event.target.checked });
                      }}
                    />
                    I have covered this
                  </label>
                  <label>
                    Confidence (1–5)
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={topic.confidence ?? 2}
                      onChange={(event) => {
                        touch("preparedness");
                        preparednessEdits.current++;
                        updateTopic(topic.label, {
                          confidence: Number(event.target.value),
                        });
                      }}
                    />
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={topic.difficult ?? false}
                      onChange={(event) => {
                        touch("preparedness");
                        preparednessEdits.current++;
                        updateTopic(topic.label, { difficult: event.target.checked });
                      }}
                    />
                    I find this difficult
                  </label>
                  <label>
                    Priority
                    <select
                      value={topic.priority ?? "NEUTRAL"}
                      onChange={(event) => {
                        touch("preparedness");
                        preparednessEdits.current++;
                        updateTopic(topic.label, {
                          priority: event.target.value as TopicPriority,
                          prioritySource:
                            event.target.value === "NEUTRAL"
                              ? undefined
                              : ("USER_EXPLICIT" as const),
                        });
                      }}
                    >
                      {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {step === 3 && (
        <div className={s.card}>
          <h3>How deep, and by when?</h3>
          <label>
            Depth
            <select
              value={depth}
              onChange={(event) => {
                touch("depth");
                setDepth(event.target.value as MasteryDepth);
              }}
            >
              {depths.map((value) => (
                <option key={value} value={value}>
                  {MASTERY_DEPTH_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            How much have you seen before?
            <select
              value={exposure}
              onChange={(event) => {
                touch("exposure");
                setExposure(event.target.value as MasteryPriorExposure);
              }}
            >
              {exposures.map((value) => (
                <option key={value} value={value}>
                  {MASTERY_PRIOR_EXPOSURE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Final check
            <select
              value={checkPreference}
              onChange={(event) => {
                touch("checkPreference");
                setCheckPreference(event.target.value as MasteryCheckPreference);
              }}
            >
              {checkPreferences.map((value) => (
                <option key={value} value={value}>
                  {MASTERY_CHECK_PREFERENCE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <p className={s.muted}>
            The check records what was correct and what was not. It never decides
            whether the unit is mastered.
          </p>
          <label>
            Target date (optional)
            <input
              type="date"
              min={cap.today}
              value={targetDate}
              onChange={(event) => {
                touch("date");
                setTargetDate(event.target.value);
              }}
            />
          </label>
          <p className={s.muted}>
            {targetDate
              ? `Your plan ends on ${targetDate}.`
              : derivedHorizon
                ? `No deadline given, so Sylf derives a ${MASTERY_LIMITS.horizonDays}-day-bounded horizon from your unit size, depth and availability: it ends on ${derivedHorizon}.`
                : "Fill in the units and your availability to see the derived horizon."}
          </p>
          {estimatedMinutes > 0 && (
            <p className={s.muted}>
              Coarse estimate from your unit size and depth: about{" "}
              {estimatedMinutes} minutes of planned work, plus one check. It is a
              planning estimate, not a promise about learning.
            </p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className={s.card}>
          <h3>When can you study?</h3>
          <div className={s.grid}>
            {weekdays.map((day, index) => (
              <label key={day}>
                {day}
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={daily[index]}
                  onChange={(event) => {
                    touch("daily");
                    setDaily(
                      daily.map((minutes, position) =>
                        position === index ? Number(event.target.value) : minutes
                      )
                    );
                  }}
                />
              </label>
            ))}
          </div>
          <label>
            Recovery reserve (%)
            <input
              type="number"
              min={0}
              max={50}
              value={reserve}
              onChange={(event) => {
                touch("reserve");
                setReserve(Number(event.target.value));
              }}
            />
          </label>
          {reserve < 15 && (
            <label className={s.check}>
              <input
                type="checkbox"
                checked={reserveAccepted}
                onChange={(event) => {
                  touch("reserve");
                  setReserveAccepted(event.target.checked);
                }}
              />
              I accept a recovery reserve below 15%
            </label>
          )}
          <label>
            Days you cannot study (comma separated)
            <input
              value={blocked}
              onChange={(event) => {
                touch("blocked");
                setBlocked(event.target.value);
              }}
            />
          </label>
          <p className={s.muted}>
            Your rest days are prefilled and stay blocked, and Quests you already
            have are counted before anything new is planned.
          </p>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={confirmedAvailability}
              onChange={(event) => {
                touch("availability");
                setConfirmedAvailability(event.target.checked);
              }}
            />
            This is my real weekly availability
          </label>
        </div>
      )}

      {step === 5 && (
        <div className={s.card}>
          <h3>How far along are you?</h3>
          {questions.length === 0 ? (
            <p className={s.muted}>
              Nothing else is needed. Your answers already decide the plan.
            </p>
          ) : (
            questions.map((question) => (
              <fieldset key={question.reasonCode}>
                <legend>{question.prompt}</legend>
                <p className={s.muted}>{question.whyItMatters}</p>
                {question.options.map((option) => (
                  <label key={option.value} className={s.check}>
                    <input
                      type="radio"
                      name={question.reasonCode}
                      checked={answers[question.reasonCode] === option.value}
                      onChange={() =>
                        setAnswers({
                          ...answers,
                          [question.reasonCode]: option.value,
                        })
                      }
                    />
                    {option.label}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const without = { ...answers };
                    delete without[question.reasonCode];
                    setAnswers(without);
                  }}
                >
                  Skip this question
                </button>
              </fieldset>
            ))
          )}
          {tradeoffs.length > 0 && (
            <ul>
              {tradeoffs.map((note) => (
                <li key={note} className={s.muted}>
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 6 && (
        <div className={s.card}>
          <h3>Your draft plan</h3>
          {!detail && (
            <>
              <p className={s.muted}>
                {activeItems.length
                  ? `${activeItems.length} planned items, ending with one mastery check.`
                  : "Fill in the previous steps, then generate your plan."}
              </p>
              <div className={s.actions}>
                <button className={s.primary} type="button" disabled={busy} onClick={generate}>
                  {busy ? "Working…" : "Generate my mastery plan"}
                </button>
                <button type="button" disabled={busy} onClick={() => setStep(5)}>
                  Back
                </button>
              </div>
            </>
          )}
          {detail && progress && (
            <>
              <div className={s.stats}>
                <p>
                  <strong>{MASTERY_PLAN_STATE_LABEL[progress.state]}</strong>
                  <br />
                  <span className={s.muted}>Plan status</span>
                </p>
                <p>
                  <strong>
                    {progress.completedItems}/{progress.plannedItems}
                  </strong>
                  <br />
                  <span className={s.muted}>Items completed</span>
                </p>
                <p>
                  <strong>{progress.plannedMinutes} min</strong>
                  <br />
                  <span className={s.muted}>Planned work</span>
                </p>
                <p>
                  <strong>{progress.units.length}</strong>
                  <br />
                  <span className={s.muted}>Units</span>
                </p>
              </div>
              <p className={s.muted}>{progress.note}</p>
              <h4>Progression</h4>
              <ul>
                {progress.units.map((entry) => (
                  <li key={entry.unitKey}>
                    <strong>{entry.title}</strong> —{" "}
                    <span className={s.muted}>
                      {MASTERY_UNIT_STATE_LABEL[entry.state]} ({entry.completed}/
                      {entry.planned} items)
                    </span>
                    <br />
                    <span className={s.muted}>
                      {entry.stages
                        .map(
                          (group) =>
                            `${MASTERY_STAGE_LABEL[group.stage]} ${group.completed}/${group.planned}`
                        )
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              {progress.check && (
                <div className={s.card}>
                  <h4>Mastery check</h4>
                  <p>
                    <span className={s.badge}>
                      {MASTERY_CHECK_STATE_LABEL[progress.check.state]}
                    </span>{" "}
                    {progress.check.title}
                    <br />
                    <span className={s.muted}>
                      {progress.check.date} · {progress.check.minutes} min · covers{" "}
                      {progress.check.coversUnitKeys.length} unit
                      {progress.check.coversUnitKeys.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className={s.muted}>
                    {masteryCheckSummary(progress.check)}
                  </p>
                </div>
              )}
              {draft && draft.mode === "MASTERY" && draft.semanticReview && (
                <p className={s.muted}>
                  Quality review: {draft.semanticReview.critic.toLowerCase()},{" "}
                  {draft.semanticReview.issues} issue
                  {draft.semanticReview.issues === 1 ? "" : "s"}
                  {draft.semanticReview.repaired
                    ? `, ${draft.semanticReview.repaired} repaired`
                    : ""}
                  .
                </p>
              )}
              <h4>Planned work by stage</h4>
              <IntensityNote items={activeItems} />
              {byStage.map((group) => (
                <details key={group.stage} className={s.item} open={editing}>
                  <summary>
                    <span className={s.badge}>
                      {MASTERY_STAGE_LABEL[group.stage]}
                    </span>{" "}
                    {group.items.length} item
                    {group.items.length === 1 ? "" : "s"}
                  </summary>
                  {group.items.map((item) => (
                    <PlanItemEditor
                      key={item.key}
                      item={item}
                      index={activeItems.findIndex((entry) => entry.key === item.key)}
                      total={activeItems.length}
                      topicTitle={
                        draft?.topics.find((topic) => topic.key === item.topicKey)
                          ?.title
                      }
                      disposition={
                        detail.links.find((link) => link.itemKey === item.key)
                          ?.disposition
                      }
                      disabled={!editing || busy}
                      minDate={cap.today}
                      maxDate={revision?.inputSnapshot.endDate ?? cap.today}
                      onUpdate={updateItem}
                      onMove={moveItem}
                      stretch={
                        promotable
                          ? {
                              ...promotable,
                              stale: false,
                              promoted: Boolean(
                                detail.links.find((link) => link.itemKey === item.key)
                                  ?.questId
                              ),
                              onPromoted: () =>
                                void loadPlan(detail.plan.id).catch(report),
                            }
                          : null
                      }
                      friction={{
                        planId: detail.plan.id,
                        revisionId: revision?.id ?? null,
                      }}
                    />
                  ))}
                </details>
              ))}
              {draft && (
                <CoverageMapPanel
                  draft={draft}
                  links={detail.links}
                  execution={detail.execution}
                  historyItems={detail.historyItems}
                />
              )}
              <PreferencePanel planId={detail.plan.id} />
              {reviewNotes.length > 0 && (
                <div className={s.card}>
                  <h4>What Sylf could not honor exactly</h4>
                  <ul>
                    {reviewNotes.map((note) => (
                      <li key={note} className={s.muted}>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {draftExclusions.length > 0 && (
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={exclusionsAccepted}
                    onChange={(event) => setExclusionsAccepted(event.target.checked)}
                  />
                  I am leaving out {draftExclusions.length} unit
                  {draftExclusions.length === 1 ? "" : "s"} on purpose
                </label>
              )}
              <div className={s.actions}>
                <button
                  className={s.primary}
                  type="button"
                  disabled={busy || dirty || editing || Boolean(receipt)}
                  onClick={confirm}
                >
                  {receipt ? "Confirmed" : "Confirm this mastery plan"}
                </button>
                {!editing && !receipt && (
                  <button type="button" disabled={busy} onClick={() => setEditing(true)}>
                    Edit this draft
                  </button>
                )}
                {editing && (
                  <button type="button" disabled={busy || !dirty} onClick={save}>
                    Save edits
                  </button>
                )}
                {editing && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setDirty(false);
                      void loadPlan(detail.plan.id).catch(report);
                    }}
                  >
                    Discard edits
                  </button>
                )}
              </div>
              {receipt && (
                <p className={s.done}>
                  {receipt.items.length} Quest
                  {receipt.items.length === 1 ? "" : "s"} created.{" "}
                  <Link href="/quests">Open your Quests</Link>
                </p>
              )}
              <p className={s.muted}>
                A mastery plan is confirmed as a whole, because a subset would drop
                the recall, practice or check the plan was validated to contain.
              </p>
              {detail.activeRevision && draft?.mode === "MASTERY" && (
                <RebalancePanel
                  planId={detail.plan.id}
                  baseRevisionId={detail.activeRevision.id}
                  version={detail.plan.version}
                  dailyMinutes={
                    detail.activeRevision.inputSnapshot.availability.dailyMinutes
                  }
                  detectedReasons={[
                    ...(progress?.check?.state === "COMPLETED" &&
                    checkResult === "NEEDS_MORE_WORK"
                      ? (["MASTERY_CHECK_NEEDS_WORK"] as const)
                      : []),
                    ...((detail.rebalanceState?.overdue ?? 0) > 0
                      ? (["OVERDUE_WORK"] as const)
                      : []),
                  ]}
                  eligible={detail.rebalanceState?.eligible ?? 0}
                  frozen={detail.rebalanceState?.frozen ?? 0}
                  overdue={detail.rebalanceState?.overdue ?? 0}
                  locked={detail.rebalanceState?.locked ?? 0}
                  proposal={
                    detail.latestDraft?.source === "REBALANCE" &&
                    !detail.latestDraft.confirmationReceipt &&
                    detail.latestDraft.outputSnapshot.rebalance
                      ? {
                          revisionId: detail.latestDraft.id,
                          requestKey: detail.latestDraft.operationKey ?? "",
                          revisionDigest: detail.latestDraft.digest,
                          diff: {
                            entries:
                              detail.latestDraft.outputSnapshot.rebalance.entries,
                            // The sealed counts are authoritative; the cast only
                            // restores the five-key record type the panel expects.
                            counts: detail.latestDraft.outputSnapshot.rebalance
                              .counts as RebalanceDiff["counts"],
                            frozen: detail.latestDraft.outputSnapshot.rebalance.frozen,
                            affectedHistory:
                              detail.latestDraft.outputSnapshot.rebalance
                                .affectedHistory,
                          } satisfies RebalanceDiff,
                          version: detail.plan.version,
                          reasonCode:
                            detail.latestDraft.outputSnapshot.rebalance
                              .reasonCode,
                        }
                      : null
                  }
                  labels={{
                    review: "Review remaining plan",
                    discard: "Discard this proposal",
                    description:
                      "Reality changes: if your availability moved, work went overdue, or you reported that the check needs more work, Sylf can propose how to finish what is left. It shows you the changes first and applies nothing until you confirm.",
                  }}
                  check={
                    checkItemKey && detail.activeRevision
                      ? {
                          itemKey: checkItemKey,
                          revisionId: detail.activeRevision.id,
                          result: checkResult,
                          completed: progress?.check?.state === "COMPLETED",
                        }
                      : null
                  }
                  onReload={() => void loadPlan(detail.plan.id).catch(report)}
                />
              )}
            </>
          )}
        </div>
      )}

      {step > 0 && (
        <div className={s.actions}>
          <button
            type="button"
            disabled={busy || step === 0}
            onClick={() => {
              setError("");
              setStep(Math.max(0, step - 1));
            }}
          >
            Back
          </button>
          {step < 6 && (
            <button className={s.primary} type="button" disabled={busy} onClick={next}>
              Continue
            </button>
          )}
        </div>
      )}
    </section>
  );
}
