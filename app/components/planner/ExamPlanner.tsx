"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserInputV1Schema,
  type ValidatedDraftV1,
  type CommitReceipt,
  type CommitRequest,
} from "@/lib/planner/contracts";
import {
  constraintCapacityInput,
  examInput,
  excludedExamTopics,
  priorityTradeoffNotes,
  type ExamInput,
  type ExamFeasibility,
} from "@/lib/planner/exam-policy";
import {
  validateCapacity,
  type AvailabilitySnapshot,
} from "@/lib/planner/capacity";
import {
  CONSTRAINT_STRENGTH_LABEL,
  softConstraintStatus,
  tradeoffExplanations,
} from "@/lib/planner/constraints";
import { resolveCompletionCriteria, defaultCompletionCriteria } from "@/lib/planner/done";
import { PRIORITY_LABEL, type TopicPriority } from "@/lib/planner/priority";
import {
  applySmartAnswers,
  smartQuestions,
  type SmartQuestion,
} from "@/lib/planner/smart-setup";
import { commitPlanner, recoverPlannerCommit } from "@/lib/planner/client";
import {
  ExamClientError,
  plannerFetch,
  postJson,
  requestExam,
  type ExamCapabilities,
  type Recovery,
} from "@/lib/planner/exam-client";
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
  CoverageExecution,
  CoverageHistoryItem,
  CoverageLink,
} from "@/lib/planner/coverage-client";
import PlanItemEditor from "./PlanItemEditor";
import DraftEditWarnings from "./DraftEditWarnings";
import { submitDraftEdit, type DraftEditFindings } from "@/lib/planner/edit-client";
import RebalancePanel, { sealedProposal } from "./RebalancePanel";
import CoverageMapPanel from "./CoverageMapPanel";
import PreferencePanel from "./PreferencePanel";
import IntensityNote from "./IntensityNote";
import s from "./ExamPlanner.module.css";

type Revision = {
  id: string;
  digest: string;
  inputSnapshot: ExamInput;
  outputSnapshot: ValidatedDraftV1;
  availabilitySnapshot: AvailabilitySnapshot;
  confirmationReceipt: CommitReceipt | null;
};
type Detail = {
  plan: { id: string; title: string; version: number; state: string };
  latestDraft: Revision | null;
  activeRevision: Revision | null;
  rebalanceState?: {
    eligible: number;
    frozen: number;
    overdue: number;
    locked?: number;
  } | null;
  links: CoverageLink[];
  execution?: CoverageExecution[];
  historyItems?: CoverageHistoryItem[];
};
type Summary = {
  id: string;
  title: string;
  mode: string;
  state: string;
  latestDraftRevisionId: string | null;
  activeRevisionId: string | null;
};
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
  "Your Exam plans",
  "What are you preparing for?",
  "What is included?",
  "When is the exam?",
  "When can you study?",
  "How prepared are you?",
  "Review your assumptions",
];
const messages: Record<string, string> = {
  EXAM_INFEASIBLE:
    "This scope does not fit the current constraints. Review the capacity and choices below.",
  HARD_SESSION_LIMIT_EXCEEDED:
    "A session exceeds the maximum length you marked as required. Change the limit or reduce the session length.",
  HARD_UNAVAILABLE_DAY_USED:
    "Work was placed on a day you marked as unavailable. Change the day or update that required limit.",
  INVALID_COMPLETION_CRITERIA:
    "Each item needs a bounded, observable completion condition of 12–240 characters that names an action or output. Mastery claims and invented question counts or mark schemes are not accepted.",
  PLANNER_CONFLICT:
    "Your schedule or linked execution changed. Reload the saved plan before confirming. Completed, deleted or detached work cannot be replaced here.",
  SCHEDULE_CHANGED:
    "Your schedule changed. Reload the plan and save a reviewed revision before confirming.",
  STALE_PLAN:
    "A newer revision exists. Reload the saved plan before continuing.",
  STALE_REVISION:
    "A newer revision exists. Reload the saved plan before continuing.",
  ITEM_LOCKED: "Unlock the item before editing or moving it.",
  QUOTA_EXHAUSTED:
    "Your weekly planner allowance is used. Existing drafts remain available to review and confirm.",
  INVALID_DRAFT:
    "These edits break the plan’s scope, practice, spacing, dependency, completion-condition or capacity requirements. Restore the affected work or adjust the dates and durations.",
  INVALID_REQUEST:
    "Check the form: real dates, 1–50 unique topics, daily minutes 0–720, and a horizon of at most 365 days are required.",
  EXCLUSIONS_REQUIRE_ACCEPTANCE:
    "Accept the explicitly excluded topics before confirming.",
};
export default function ExamPlanner({
  capabilities: cap,
  onQuotaRefresh,
}: {
  capabilities: ExamCapabilities;
  onQuotaRefresh?: () => void;
}) {
  const [step, setStep] = useState(0),
    [title, setTitle] = useState(""),
    [subject, setSubject] = useState(""),
    [subjectId, setSubjectId] = useState<number | null>(null);
  const [scope, setScope] = useState(""),
    [date, setDate] = useState(""),
    [daily, setDaily] = useState<number[]>(
      weekdays.map((_, d) => (cap.restDays.includes(d) ? 0 : 60))
    );
  const [confirmedAvailability, setConfirmedAvailability] = useState(false),
    [reserve, setReserve] = useState(15),
    [reserveAccepted, setReserveAccepted] = useState(false),
    [blocked, setBlocked] = useState("");
  const [topics, setTopics] = useState<ExamInput["exam"]["topics"]>([]),
    [format, setFormat] = useState<ExamInput["exam"]["format"]>("UNSPECIFIED"),
    [preferred, setPreferred] = useState(45),
    [mock, setMock] = useState(0),
    [examDay, setExamDay] = useState(false),
    [triage, setTriage] = useState(false);
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [feasibility, setFeasibility] = useState<ExamFeasibility | null>(null);
  /**
   * An edit the planner would only let through with the student's acknowledgement
   * (UX Phase 3). Nothing is written until they answer, so "Undo" is free.
   */
  const [pendingEdit, setPendingEdit] = useState<{
    body: Record<string, unknown>;
    findings: DraftEditFindings;
  } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null),
    [draft, setDraft] = useState<ValidatedDraftV1 | null>(null),
    [dirty, setDirty] = useState(false),
    [receipt, setReceipt] = useState<CommitReceipt | null>(null),
    [exclusionsAccepted, setExclusionsAccepted] = useState(false);
  const [saved, setSaved] = useState<Summary[]>([]),
    [requestKey, setRequestKey] = useState<string | null>(null),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null),
    abort = useRef<AbortController | null>(null),
    confirmation = useRef<CommitRequest | null>(null),
    intakeId = useRef<string | null>(null),
    touchedFields = useRef<Set<string>>(new Set()),
    preparednessEdits = useRef(0),
    topicsCount = useRef(0);
  const revision = detail?.latestDraft ?? detail?.activeRevision;
  const rebalanceProposal = sealedProposal(detail, revision);
  /** Content-free intake tally: counts only, never field values or labels. */
  const intakeCounts = () => ({
    fieldsTouched: touchedFields.current.size,
    topicsManual: topicsCount.current,
    topicsResearched: 0,
    topicsImported: 0,
    preparednessEdited: preparednessEdits.current,
    copilotTurns: 0,
    warningsAccepted: 0,
  });
  /** Mints a fresh intake identity and emits `intake_started` exactly once. */
  const beginIntake = () => {
    const id = crypto.randomUUID();
    intakeId.current = id;
    intakeStarted(id, "EXAM");
  };
  /** Records a distinct touched field and the once-only first input. */
  const touch = (field: string) => {
    touchedFields.current.add(field);
    if (intakeId.current)
      intakeFirstInput(intakeId.current, "EXAM", {
        fieldsTouched: touchedFields.current.size,
      });
  };
  /**
   * The wizard's own "can I advance / generate" determination. This is the same
   * gate the Continue button enforces in `next`, extracted so the readiness
   * telemetry reuses it instead of inventing a second notion.
   */
  const readinessFor = (step: number): { ready: boolean; missingRequired: number } => {
    if (step === 1) {
      const missing = subject.trim() ? 0 : 1;
      return { ready: missing === 0, missingRequired: missing };
    }
    if (step === 2) {
      const labels = scope
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      const valid =
        labels.length >= 1 &&
        labels.length <= 50 &&
        labels.every((t) => t.length <= 200) &&
        new Set(labels.map((t) => t.toLowerCase())).size === labels.length;
      return { ready: valid, missingRequired: valid ? 0 : 1 };
    }
    if (step === 3) {
      const valid =
        Boolean(date) &&
        date > cap.today &&
        (Date.parse(date) - Date.parse(cap.today)) / 86400000 <= 365;
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
    if (step === 1) return "Enter a subject or choose one of your subjects.";
    if (step === 2)
      return "Enter 1–50 unique topics, one per line, with no more than 200 characters each.";
    if (step === 3) return "Choose a future exam date within 365 days.";
    if (step === 4)
      return "Confirm your actual study availability and explicitly accept any reserve below 15%.";
    return "";
  };
  const { ready: readinessReady, missingRequired: readinessMissing } =
    readinessFor(step);
  useEffect(() => {
    heading.current?.focus();
  }, [step, detail?.plan.id, receipt]);
  useEffect(() => {
    void plannerFetch<Summary[]>("")
      .then((plans) => {
        setSaved(plans);
        // Recovering an unfinished generation is discovered after mount, so the first
        // client render is identical to the server's: a stored key changes what this
        // component offers, and reading it during render would hydrate differently.
        try {
          const key = sessionStorage.getItem("sylf-exam-operation");
          if (key && /^[a-zA-Z0-9_-]{8,100}$/.test(key)) setRequestKey(key);
        } catch {}
      })
      .catch(() => {});
    return () => abort.current?.abort();
  }, []);
  // Mirror topics into a ref so the once-only abandon cleanup below never reads
  // a stale render closure (it must keep empty deps to run only on real unmount).
  useEffect(() => {
    topicsCount.current = topics.length;
  }, [topics.length]);
  // Emit readiness transitions while an intake is open, and mark the intake
  // abandoned when the wizard unmounts before a draft was requested.
  useEffect(() => {
    if (!intakeId.current) return;
    intakeReadinessChanged(
      intakeId.current,
      "EXAM",
      readinessReady,
      readinessMissing
    );
  }, [readinessReady, readinessMissing]);
  useEffect(
    () => () => {
      if (intakeId.current)
        intakeAbandoned(intakeId.current, "EXAM", "LEFT", {
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
  const report = (e: unknown) => {
    const code =
      e instanceof ExamClientError
        ? e.code
        : e instanceof Error
          ? e.message
          : "";
    setError(
      messages[code] ??
        "The request could not finish. Your form and saved draft are retained. Recover the last operation or review and retry."
    );
    if (e instanceof ExamClientError) setFeasibility(e.feasibility ?? null);
  };
  const loadPlan = async (id: string) => {
    const result = await plannerFetch<Detail>(`/${id}`);
    const rev = result.latestDraft ?? result.activeRevision;
    if (!rev || rev.inputSnapshot.mode !== "EXAM" || !rev.inputSnapshot.exam)
      throw new ExamClientError("NO_EXAM_DRAFT");
    setDetail(result);
    setDraft(rev.outputSnapshot);
    setDirty(false);
    setReceipt(rev.confirmationReceipt);
    confirmation.current = null;
    setError("");
    setFeasibility(null);
    setStage("");
  };
  const recover = async (
    key: string,
    action?: "CANCEL" | "RECOVER_EXPIRED"
  ) => {
    const result = await plannerFetch<Recovery>(
      `/recover/${key}`,
      action ? postJson({ schemaVersion: 1, action }) : undefined
    );
    if (result.operation.state === "SEALED") {
      await loadPlan(result.planId);
      if (intakeId.current) intakeCompleted(intakeId.current);
      onQuotaRefresh?.();
      return;
    }
    if (result.operation.state === "PREPARING")
      setStage(
        "Generation is still preparing. Recover again shortly; retrying does not start another provider request."
      );
    else {
      setStage(
        result.operation.state === "CANCELLED"
          ? "Generation cancelled. Your inputs are retained."
          : "Generation failed or expired. Your allowance was released. Review your inputs and generate again."
      );
      setRequestKey(null);
      try {
        sessionStorage.removeItem("sylf-exam-operation");
      } catch {}
      onQuotaRefresh?.();
    }
  };
  const buildInput = (): ExamInput => {
    const parsed = UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "EXAM",
      title: title.trim() || subject.trim(),
      scope: topics.map((t) => t.label).join("\n"),
      startDate: cap.today,
      endDate: date,
      examDate: date,
      availability: {
        dailyMinutes: daily,
        recoveryPercent: reserve,
        blockedDates: blocked.split(/[\s,]+/).filter(Boolean),
      },
      exam: {
        subjectName: subject,
        subjectId,
        topics,
        format,
        preferredMinutes: preferred,
        mockMinutes: mock || null,
        allowExamDayStudy: examDay,
        approach: triage ? "TRIAGE" : "STANDARD",
        acceptReducedReserve: reserveAccepted,
      },
    });
    examInput(parsed);
    // Only answers whose question is still justified are merged; a stale answer
    // can never add data the planner did not ask for.
    const supported = new Set<string>(
      smartQuestions(parsed).map((question) => question.reasonCode)
    );
    const usable = Object.entries(answers)
      .filter(([reasonCode]) => supported.has(reasonCode))
      .map(([reasonCode, value]) => ({ reasonCode, value }));
    return usable.length ? applySmartAnswers(parsed, usable) : parsed;
  };
  /** Never throws during render: the wizard is only partly filled in for most steps. */
  const draftInput = (() => {
    try {
      return buildInput();
    } catch {
      return null;
    }
  })();
  const questions: SmartQuestion[] = draftInput
    ? draftInput.exam.topics.length
      ? smartQuestions(draftInput)
      : []
    : [];
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
        .map((t) => t.trim())
        .filter(Boolean);
      setTopics(
        labels.map(
          (label) =>
            topics.find((t) => t.label === label) ?? {
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
    let input: ExamInput;
    try {
      input = buildInput();
    } catch {
      setError(messages.INVALID_REQUEST);
      return;
    }
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    try {
      sessionStorage.setItem("sylf-exam-operation", key);
    } catch {}
    setBusy(true);
    setStage("Validating inputs and calculating capacity…");
    if (questions.length)
      plannerTelemetry("smart_question_asked", { questions: questions.length });
    else plannerTelemetry("smart_question_skipped");
    abort.current = new AbortController();
    if (intakeId.current)
      intakeFirstDraftRequested(intakeId.current, "EXAM", intakeCounts());
    try {
      await requestExam(input, key, abort.current.signal, (event) =>
        setStage(
          {
            calculating_capacity: "Capacity checked",
            generating: "Generating an Exam proposal…",
            validating_proposal:
              "Checking scope, dates, practice and capacity…",
            reviewing_plan: "Reviewing the plan for quality…",
            repairing_plan: "Improving the flagged items…",
            saving_draft: "Saving the validated draft…",
            ready: "Draft saved. Retrieving review…",
            failed: "Generation failed. Checking saved state…",
            cancelled: "Checking cancellation…",
          }[event.stage]
        )
      );
      await recover(key);
    } catch (e) {
      if (e instanceof ExamClientError && e.feasibility) {
        report(e);
        setRequestKey(null);
        setStage("");
      } else {
        try {
          await recover(key);
        } catch {
          report(e);
        }
      }
    } finally {
      setBusy(false);
      abort.current = null;
      onQuotaRefresh?.();
    }
  };
  const cancel = async () => {
    if (intakeId.current)
      intakeAbandoned(intakeId.current, "EXAM", "CANCELLED", intakeCounts());
    abort.current?.abort();
    if (requestKey)
      try {
        await recover(requestKey, "CANCEL");
      } catch {
        setError(
          "Cancellation could not be confirmed. Recover this operation before starting again; expired reservations can be released."
        );
      }
  };
  const save = async () => {
    if (!detail || !draft || !revision) return;
    setBusy(true);
    setError("");
    setPendingEdit(null);
    try {
      const changed = draft.items.filter((item) => {
        const original = revision.outputSnapshot.items.find((i) => i.key === item.key);
        return (
          !original ||
          resolveCompletionCriteria(item).text !==
            resolveCompletionCriteria(original).text ||
          original.title !== item.title ||
          original.date !== item.date ||
          original.minutes !== item.minutes
        );
      });
      const editBody = {
        schemaVersion: 1,
        baseRevisionId: revision.id,
        expectedVersion: detail.plan.version,
        operationKey: crypto.randomUUID(),
        itemOrder: draft.items.map((i) => i.key),
        edits: draft.items.map(
          ({ key, title, description, completionCriteria, date, minutes, locked, removed }) => ({
            key,
            title,
            description,
            completionCriteria:
              completionCriteria ?? defaultCompletionCriteria(draft.items.find((i) => i.key === key)!.type),
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
        // Not refused for good: this edit gives something up, and the student decides
        // whether that is worth it. Nothing has been written yet, so "Undo" is simply
        // discarding the local changes.
        setPendingEdit({ body: editBody, findings: outcome.findings });
        return;
      }
      plannerTelemetry("proposal_edited", {
        planId: detail.plan.id,
        itemsEdited: changed.length,
        criteriaEdited: changed.filter(
          (item) =>
            !revision.outputSnapshot.items.some(
              (i) =>
                i.key === item.key &&
                resolveCompletionCriteria(i).text ===
                  resolveCompletionCriteria(item).text
            )
        ).length,
      });
      await loadPlan(detail.plan.id);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!detail || !draft || !revision || dirty) return;
    setBusy(true);
    setError("");
    const body = confirmation.current ?? {
      schemaVersion: 1 as const,
      revisionId: revision.id,
      digest: revision.digest,
      expectedVersion: detail.plan.version,
      idempotencyKey: crypto.randomUUID(),
      selectedItemKeys: draft.items.filter((i) => !i.removed).map((i) => i.key),
      createGoal: false,
      acknowledgeExclusions: exclusionsAccepted,
    };
    confirmation.current = body;
    try {
      const result = await commitPlanner(detail.plan.id, body);
      setReceipt(result);
      plannerTelemetry("proposal_confirmed", {
        planId: result.planId,
        items: result.items.length,
      });
    } catch (e) {
      try {
        const result = await recoverPlannerCommit(
          detail.plan.id,
          body.idempotencyKey
        );
        if (result) setReceipt(result);
        else report(e);
      } catch {
        report(e);
      }
    } finally {
      setBusy(false);
    }
  };
  const updateItem = (
    key: string,
    patch: Partial<ValidatedDraftV1["items"][number]>
  ) => {
    setDraft(
      (d) =>
        d && {
          ...d,
          items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
        }
    );
    setDirty(true);
    setExclusionsAccepted(false);
    confirmation.current = null;
  };
  const move = (index: number, delta: number) => {
    if (!draft) return;
    const items = [...draft.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    setDraft({ ...draft, items });
    setDirty(true);
  };
  const active = draft?.items.filter((i) => !i.removed) ?? [];
  const capacity = (() => {
    try {
      return revision && draft
        ? validateCapacity(
            constraintCapacityInput(revision.inputSnapshot),
            revision.availabilitySnapshot,
            active
          )
        : null;
    } catch {
      return null;
    }
  })();
  const exclusions = draft ? excludedExamTopics(draft) : [];
  // Deterministic, user-facing tradeoffs only. Critic internals are never shown.
  const tradeoffs = revision
    ? [
        ...tradeoffExplanations(revision.inputSnapshot, active),
        ...priorityTradeoffNotes(revision.inputSnapshot),
      ]
    : [];
  const softStatus = revision
    ? softConstraintStatus(revision.inputSnapshot, active)
    : null;
  // Stretch promotion is offered only while reviewing the confirmed plan: a draft
  // or a newer pending revision has nothing to promote from yet.
  const promotable =
    detail?.activeRevision && detail?.latestDraft == null
      ? {
          planId: detail.plan.id,
          revisionId: detail.activeRevision.id,
          version: detail.plan.version,
        }
      : null;
  return (
    <section className={s.root} aria-label="Exam Planner" aria-busy={busy}>
      <h2 tabIndex={-1} ref={heading}>
        {receipt
          ? "Your Exam plan is ready"
          : detail
            ? detail.plan.title
            : steps[step]}
      </h2>
      {!detail && step > 0 && step <= 6 && (
        <div className="my-4">
          <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-muted mb-2">
            <span className="text-accent-text-light">
              Step {step} of 6 · {steps[step]}
            </span>
            <span>{Math.round((step / 6) * 100)}% Complete</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5 h-1.5 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`h-full rounded-full transition-all duration-300 ${
                  i <= step
                    ? "bg-gradient-to-r from-accent-primary to-accent-primary-light shadow-[0_0_8px_var(--accent-primary-dim)]"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        {stage}
      </div>
      {error && (
        <div id="exam-error" className={s.error} role="alert">
          {error}
        </div>
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
      {feasibility && (
        <div className={s.card}>
          <h3>
            {feasibility.status === "SEGMENT_REQUIRED"
              ? "Select a smaller Exam segment"
              : "This plan needs adjustment"}
          </h3>
          <p>
            {feasibility.availableMinutes} available minutes · at least{" "}
            {feasibility.estimatedMinutes} estimated minutes ·{" "}
            {feasibility.minimumItems} minimum items
          </p>
          <p className={s.muted}>
            Estimates are coarse. Only a fully validated proposal can be
            confirmed.
          </p>
          <ul>
            {feasibility.choices.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {detail?.activeRevision && (
        <RebalancePanel
          planId={detail.plan.id}
          baseRevisionId={detail.activeRevision.id}
          version={detail.plan.version}
          dailyMinutes={
            detail.activeRevision.inputSnapshot.availability.dailyMinutes
          }
          detectedReasons={
            (detail.rebalanceState?.overdue ?? 0) > 0 ? ["OVERDUE_WORK"] : []
          }
          eligible={detail.rebalanceState?.eligible ?? 0}
          frozen={detail.rebalanceState?.frozen ?? 0}
          overdue={detail.rebalanceState?.overdue ?? 0}
          proposal={rebalanceProposal}
          labels={{
            review: "Review plan",
            discard: "Discard this proposal",
            description:
              "Your exam plan can be rebalanced over the work that is left. Completed and in-progress work stays exactly as it is, and you see every change before anything is applied.",
          }}
          onReload={() => void loadPlan(detail.plan.id).catch(report)}
        />
      )}
      {receipt && (
        <div className={s.card}>
          <p>
            {receipt.items.length} ordinary Quests created. They use your
            existing Focus, XP, rewards and completion flow.
          </p>
          <div className={s.actions}>
            {receipt.items[0] && (
              <Link
                className={s.primary}
                href={`/focus?questId=${receipt.items[0].questId}`}
              >
                Start next Quest
              </Link>
            )}
            <Link href="/quests">View Quests</Link>
            <button onClick={() => setReceipt(null)}>View Plan</button>
          </div>
        </div>
      )}
      {detail && draft && revision ? (
        <>
          <p className={s.muted}>
            Exam: {revision.inputSnapshot.examDate} ·{" "}
            {revision.availabilitySnapshot.timezone} ·{" "}
            {revision.inputSnapshot.exam.approach === "TRIAGE"
              ? "Compressed triage plan"
              : "Standard preparation"}
          </p>
          <div className={s.stats}>
            <div>
              <strong>{active.length}</strong>planned Quests
            </div>
            <div>
              <strong>
                {(active.reduce((n, i) => n + i.minutes, 0) / 60).toFixed(1)} h
              </strong>
              planned work
            </div>
            <div>
              <strong>{new Set(active.map((i) => i.date)).size}</strong>study
              days
            </div>
            <div>
              <strong>
                {
                  capacity?.days.filter(
                    (d) => d.budget - d.reserve - d.existing >= 15
                  ).length
                }
              </strong>
              available days
            </div>
            <div>
              <strong>
                {revision.inputSnapshot.availability.recoveryPercent}%
              </strong>
              recovery reserve
            </div>
            <div>
              <strong>
                {capacity?.days.reduce((n, d) => n + d.reserve, 0)} min
              </strong>
              protected reserve
            </div>
          </div>
          <p className={s.muted}>
            Capacity reflects the saved schedule snapshot and is checked again
            at confirmation. Completion and study time do not establish academic
            mastery.
          </p>
          {softStatus && softStatus.total > 0 && (
            <p className={s.muted}>
              {softStatus.satisfied} of {softStatus.total}{" "}
              {softStatus.total === 1 ? "preference is" : "preferences are"}{" "}
              honored.
            </p>
          )}
          <IntensityNote items={active} />
          {tradeoffs.length > 0 && (
            <div className={s.card}>
              <h3>Tradeoffs in this draft</h3>
              {tradeoffs.map((note) => (
                <p key={note} className={s.muted}>
                  {note}
                </p>
              ))}
            </div>
          )}
          <div className={s.card}>
            <h3>Scope & assumptions</h3>
            <ul>
              {draft.topics.map((t) => (
                <li key={t.key}>
                  {t.title} —{" "}
                  {exclusions.some((e) => e.key === t.key)
                    ? "explicitly excluded"
                    : `${active.filter((i) => i.topicKey === t.key).length} planned items`}
                </li>
              ))}
            </ul>
            {[...draft.assumptions, ...draft.warnings].map((w, n) => (
              <p key={n}>{w}</p>
            ))}
            {exclusions.length > 0 && (
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={exclusionsAccepted}
                  onChange={(e) => {
                    setExclusionsAccepted(e.target.checked);
                    confirmation.current = null;
                  }}
                />
                I accept the listed scope exclusions.
              </label>
            )}
          </div>
          <CoverageMapPanel
            draft={draft}
            links={detail.links}
            execution={detail.execution}
            historyItems={detail.historyItems}
          />
          <PreferencePanel planId={detail.plan.id} />
          {detail.links.length > 0 && (
            <div className={s.error}>
              This plan has materialized execution. Review the linked states
              below. Changes to existing execution require a future
              reconciliation flow.
            </div>
          )}
          <div className={s.card}>
            <h3>Staged timeline</h3>
            {draft.items.map((item, index) => {
              const link = detail.links.find((l) => l.itemKey === item.key);
              return (
                <PlanItemEditor
                  key={item.key}
                  item={item}
                  index={index}
                  total={draft.items.length}
                  topicTitle={draft.topics.find((t) => t.key === item.topicKey)?.title}
                  disposition={link?.disposition}
                  disabled={busy || Boolean(link) || Boolean(receipt)}
                  minDate={revision.inputSnapshot.startDate}
                  maxDate={revision.inputSnapshot.examDate}
                  errorId={error ? "exam-error" : undefined}
                  onUpdate={updateItem}
                  onMove={move}
                  stretch={
                    promotable
                      ? {
                          ...promotable,
                          stale: false,
                          promoted: Boolean(
                            detail.links.find((l) => l.itemKey === item.key)
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
              );
            })}
          </div>
          <div className={s.actions}>
            {!detail.links.length && (
              <>
                <button disabled={busy || !dirty} onClick={save}>
                  Save revised draft
                </button>
                <button
                  className={s.primary}
                  disabled={
                    busy ||
                    dirty ||
                    !active.length ||
                    (exclusions.length > 0 && !exclusionsAccepted)
                  }
                  onClick={confirm}
                >
                  Create plan · {active.length} Quests
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() => void loadPlan(detail.plan.id).catch(report)}
            >
              Reload saved plan
            </button>
          </div>
          {dirty && (
            <p className={s.muted}>
              Save your edits before confirming. Dates, practice, dependencies
              and reserve are checked again.
            </p>
          )}
        </>
      ) : (
        <>
          {step === 0 ? (
            <>
              <p>
                Turn your confirmed exam scope into a study draft you can review
                before creating Quests.
              </p>
              <div className="relative p-6 sm:p-8 rounded-2xl border border-white/10 bg-white/[0.02] shadow-[0_12px_36px_rgba(0,0,0,0.3)] my-4 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-bold font-['Rajdhani'] uppercase tracking-wider mb-3">
                  <span>Day-by-Day Sprint</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase mb-2">
                  Prepare for an Exam
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed max-w-xl mb-6">
                  Balance coverage, recall and practice around your exam date. A deadline-driven,
                  day-level plan with coverage, recall, practice and exam-readiness stages.
                </p>
                <button
                  className={s.primary}
                  onClick={() => {
                    plannerTelemetry("planner_mode_selected", { mode: "EXAM" });
                    beginIntake();
                    setStep(1);
                  }}
                >
                  Prepare for an Exam
                </button>
              </div>
              {saved.filter(
                (p) =>
                  p.mode === "EXAM" &&
                  (p.latestDraftRevisionId || p.activeRevisionId)
              ).length > 0 && (
                <div className={s.card}>
                  <h3>Your saved plans</h3>
                  {saved
                    .filter(
                      (p) =>
                        p.mode === "EXAM" &&
                        (p.latestDraftRevisionId || p.activeRevisionId)
                    )
                    .map((p) => (
                      <p key={p.id}>
                        <button
                          onClick={() => void loadPlan(p.id).catch(report)}
                        >
                          {p.title} · {p.state}
                        </button>
                      </p>
                    ))}
                </div>
              )}
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step < 6) next();
                else void generate();
              }}
              aria-describedby={error ? "exam-error" : undefined}
            >
              <fieldset disabled={busy}>
                <div className={step <= 5 ? s.card : undefined}>
                {step === 1 && (
                  <>
                    <label>
                      Existing subject
                      <select
                        value={subjectId ?? ""}
                        onChange={(e) => {
                          touch("subject");
                          const id = Number(e.target.value) || null;
                          setSubjectId(id);
                          if (id)
                            setSubject(
                              cap.subjects.find((s) => s.id === id)!.name
                            );
                        }}
                      >
                        <option value="">Enter a subject name</option>
                        {cap.subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Subject or course name
                      <input
                        required
                        maxLength={200}
                        value={subject}
                        onChange={(e) => {
                          touch("subject");
                          setSubject(e.target.value);
                          setSubjectId(null);
                        }}
                      />
                    </label>
                    <label>
                      Exam title (optional)
                      <input
                        maxLength={200}
                        placeholder="For example, Biology final"
                        value={title}
                        onChange={(e) => {
                          touch("title");
                          setTitle(e.target.value);
                        }}
                      />
                    </label>
                  </>
                )}
                {step === 2 && (
                  <>
                    <label>
                      Included topics — one per line
                      <textarea
                        required
                        value={scope}
                        maxLength={20000}
                        onChange={(e) => {
                          touch("topics");
                          setScope(e.target.value);
                        }}
                        placeholder={
                          "Cell structure\nTransport across membranes\nEnzymes"
                        }
                      />
                    </label>
                    <p className={s.muted}>
                      Your scope is authoritative. Sylf will preserve these
                      topics and will not research or add an external syllabus.
                    </p>
                  </>
                )}
                {step === 3 && (
                  <>
                    <label>
                      Exam date
                      <input
                        type="date"
                        required
                        min={cap.today}
                        value={date}
                        onChange={(e) => {
                          touch("date");
                          setDate(e.target.value);
                        }}
                      />
                    </label>
                    <p className={s.muted}>
                      Study starts {cap.today}, in {cap.timezone}. Exam-day
                      study is excluded by default because the exam time is
                      unknown.
                    </p>
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={examDay}
                        onChange={(e) => setExamDay(e.target.checked)}
                      />
                      Allow study on the exam date
                    </label>
                  </>
                )}
                {step === 4 && (
                  <>
                    <p>
                      Confirm the minutes you can actually study. Your rest days
                      are prefilled and remain blocked by your global schedule.
                      Existing Quests are subtracted on the server.
                    </p>
                    <div className={s.grid}>
                      {weekdays.map((day, i) => (
                        <label key={day}>
                          {day}
                          {cap.restDays.includes(i)
                            ? " · Rest day"
                            : " · Minutes"}
                          <input
                            type="number"
                            min={0}
                            max={720}
                            required
                            disabled={cap.restDays.includes(i)}
                            value={daily[i]}
                            onChange={(e) => {
                              touch("daily");
                              setDaily(
                                daily.map((v, n) =>
                                  n === i ? Number(e.target.value) : v
                                )
                              );
                              setConfirmedAvailability(false);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={confirmedAvailability}
                        onChange={(e) => {
                          touch("availability");
                          setConfirmedAvailability(e.target.checked);
                        }}
                      />
                      These minutes reflect my actual availability.
                    </label>
                    <label>
                      Recovery reserve (%)
                      <input
                        type="number"
                        min={0}
                        max={50}
                        required
                        value={reserve}
                        onChange={(e) => {
                          touch("reserve");
                          setReserve(Number(e.target.value));
                          setReserveAccepted(false);
                        }}
                      />
                    </label>
                    <p className={s.muted}>
                      15% is the default buffer. These minutes stay unallocated.
                    </p>
                    {reserve < 15 && (
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={reserveAccepted}
                          onChange={(e) => setReserveAccepted(e.target.checked)}
                        />
                        I explicitly accept reducing the reserve below 15%.
                      </label>
                    )}
                    <details>
                      <summary>Additional blocked dates</summary>
                      <label>
                        Dates separated by commas (YYYY-MM-DD)
                        <textarea
                          value={blocked}
                          onChange={(e) => setBlocked(e.target.value)}
                        />
                      </label>
                      <p className={s.muted}>
                        Saved floating rest days are also respected
                        automatically.
                      </p>
                    </details>
                  </>
                )}
                {step === 5 && (
                  <>
                    <p>
                      Covered means you have studied it before. Confidence is
                      your own estimate; neither is a claim of mastery.
                    </p>
                    {topics.map((topic, i) => (
                      <div className={s.card} key={topic.label}>
                        <h3>{topic.label}</h3>
                        <label className={s.check}>
                          <input
                            type="checkbox"
                            checked={topic.covered ?? false}
                            onChange={(e) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((t, n) =>
                                  n === i
                                    ? { ...t, covered: e.target.checked }
                                    : t
                                )
                              );
                            }}
                          />
                          Already covered
                        </label>
                        <label>
                          Confidence
                          <select
                            value={topic.confidence ?? 2}
                            onChange={(e) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((t, n) =>
                                  n === i
                                    ? {
                                        ...t,
                                        confidence: Number(e.target.value),
                                      }
                                    : t
                                )
                              );
                            }}
                          >
                            {[
                              "1 — Very low",
                              "2 — Weak",
                              "3 — Developing",
                              "4 — Confident",
                              "5 — Very confident",
                            ].map((label, n) => (
                              <option key={n} value={n + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={s.check}>
                          <input
                            type="checkbox"
                            checked={topic.difficult ?? false}
                            onChange={(e) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((t, n) =>
                                  n === i
                                    ? { ...t, difficult: e.target.checked }
                                    : t
                                )
                              );
                            }}
                          />
                          This topic is difficult for me
                        </label>
                        <label>
                          How much does this topic matter for this exam?
                          <select
                            value={topic.priority ?? "NEUTRAL"}
                            onChange={(e) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((t, n) =>
                                  n === i
                                    ? e.target.value === "NEUTRAL"
                                      ? {
                                          ...t,
                                          priority: "NEUTRAL",
                                          prioritySource: undefined,
                                        }
                                      : {
                                          ...t,
                                          priority: e.target
                                            .value as TopicPriority,
                                          prioritySource: "USER_EXPLICIT",
                                        }
                                    : t
                                )
                              );
                            }}
                          >
                            {(
                              ["NEUTRAL", "HIGH", "LOW"] as TopicPriority[]
                            ).map((level) => (
                              <option key={level} value={level}>
                                {PRIORITY_LABEL[level]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className={s.muted}>
                          Priority is separate from confidence. Sylf never
                          invents an official weighting.
                        </p>
                      </div>
                    ))}
                  </>
                )}
                </div>
                {step === 6 && (
                  <>
                    <div className={s.card}>
                      <h3>{title || `${subject} exam`}</h3>
                      <p>
                        {topics.length} confirmed topics · Exam {date} ·{" "}
                        {reserve}% recovery reserve
                      </p>
                      <p className={s.muted}>
                        Generation uses one weekly planner allowance only when a
                        validated draft is saved. Reviewing and editing do not
                        create Quests.
                      </p>
                    </div>
                    {questions.length > 0 && (
                      <div className={s.card}>
                        <h3>A few details that change this plan</h3>
                        <p className={s.muted}>
                          Answer only what applies. Skipping leaves Sylf&apos;s
                          default behavior unchanged.
                        </p>
                        {questions.map((question) => (
                          <fieldset key={question.reasonCode}>
                            <legend>{question.prompt}</legend>
                            {question.options.map((option) => (
                              <label className={s.check} key={option.value}>
                                <input
                                  type="radio"
                                  name={`q-${question.reasonCode}`}
                                  value={option.value}
                                  checked={
                                    answers[question.reasonCode] === option.value
                                  }
                                  onChange={() =>
                                    setAnswers((current) => ({
                                      ...current,
                                      [question.reasonCode]: option.value,
                                    }))
                                  }
                                />
                                {option.label}
                              </label>
                            ))}
                            <p className={s.muted}>
                              Why this matters: {question.whyItMatters}
                            </p>
                          </fieldset>
                        ))}
                        {Object.keys(answers).length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnswers({});
                              setError("");
                            }}
                          >
                            Clear these answers
                          </button>
                        )}
                      </div>
                    )}
                    <details>
                      <summary>Optional exam details</summary>
                      <label>
                        Exam format
                        <select
                          value={format}
                          onChange={(e) =>
                            setFormat(e.target.value as typeof format)
                          }
                        >
                          {[
                            "UNSPECIFIED",
                            "MCQ",
                            "STRUCTURED",
                            "ESSAY",
                            "PRACTICAL",
                            "ORAL",
                            "MIXED",
                          ].map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Preferred session minutes
                        <input
                          type="number"
                          min={15}
                          max={120}
                          value={preferred}
                          onChange={(e) => setPreferred(Number(e.target.value))}
                        />
                      </label>
                      <p className={s.muted}>
                        Treated as:{" "}
                        {answers.CONSTRAINT_STRENGTH_UNCLEAR === "REQUIRED"
                          ? CONSTRAINT_STRENGTH_LABEL.HARD
                          : CONSTRAINT_STRENGTH_LABEL.SOFT}{" "}
                        {answers.CONSTRAINT_STRENGTH_UNCLEAR === "REQUIRED"
                          ? "— no session will exceed it."
                          : "— Sylf may exceed it when necessary and will say why."}
                      </p>
                      <label>
                        Mock exam minutes (0 to omit)
                        <input
                          type="number"
                          min={0}
                          max={240}
                          value={mock}
                          onChange={(e) => setMock(Number(e.target.value))}
                        />
                      </label>
                    </details>
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={triage}
                        onChange={(e) => setTriage(e.target.checked)}
                      />
                      Use an explicitly compressed triage plan
                    </label>
                    <p className={s.muted}>
                      Triage reduces estimated depth. It still requires all
                      confirmed topics, recall, practice and available capacity.
                      Long scopes may need smaller, explicitly chosen segments.
                    </p>
                  </>
                )}
                <div className={s.actions}>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(step - 1);
                      setError("");
                      setRequestKey(null);
                    }}
                  >
                    Back
                  </button>
                  <button className={s.primary} type="submit">
                    {step === 6 ? "Generate draft" : "Continue"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {busy && (
            <button onClick={() => void cancel()}>Cancel generation</button>
          )}
          {requestKey && !busy && (
            <div className={s.actions}>
              <button onClick={() => void recover(requestKey).catch(report)}>
                Recover last operation
              </button>
              <button
                onClick={() =>
                  void recover(requestKey, "RECOVER_EXPIRED").catch(report)
                }
              >
                Release expired operation
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
