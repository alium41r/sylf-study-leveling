"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserInputV1Schema,
  type ValidatedDraftV1,
  type CommitReceipt,
} from "@/lib/planner/contracts";
import {
  defaultRoadmapGranularity,
  roadmapGranularity,
  roadmapInput,
  roadmapPriorityTradeoffNotes,
  roadmapSoftViolations,
  scopeMinutes,
  type RoadmapFeasibility,
  type RoadmapInput,
} from "@/lib/planner/roadmap-policy";
import { ROADMAP_LIMITS } from "@/lib/planner/roadmap-fields";
import { excludedRoadmapTopics } from "@/lib/planner/roadmap-policy";
import { resolveMilestoneOutcome } from "@/lib/planner/done";
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
  cancelExpansion,
  requestExpansion,
  requestRoadmap,
  RoadmapClientError,
} from "@/lib/planner/roadmap-client";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import {
  intakeAbandoned,
  intakeCompleted,
  intakeFirstDraftRequested,
  intakeFirstInput,
  intakeReadinessChanged,
  intakeStarted,
} from "@/lib/planner/intake-telemetry";
import { MILESTONE_STATES, type MilestoneState } from "@/lib/planner/roadmap-progress";
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
  inputSnapshot: RoadmapInput;
  outputSnapshot: ValidatedDraftV1;
  confirmationReceipt: CommitReceipt | null;
};
type MilestoneProgress = {
  milestoneKey: string;
  periodKey: string | null;
  state: MilestoneState;
  itemCount: number;
  liveCount: number;
};
type Detail = {
  plan: { id: string; title: string; version: number; state: string };
  latestDraft: Revision | null;
  activeRevision: Revision | null;
  links: CoverageLink[];
  execution?: CoverageExecution[];
  historyItems?: CoverageHistoryItem[];
  expansions: {
    revisionId: string;
    milestoneKey: string | null;
    confirmed: boolean;
    itemCount: number;
    isLatestDraft: boolean;
  }[];
  milestoneStates: MilestoneProgress[];
  rebalanceState?: {
    eligible: number;
    frozen: number;
    overdue: number;
    locked?: number;
  } | null;
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
  "Your roadmaps",
  "What are you studying?",
  "What is included?",
  "When should it be finished?",
  "When can you study?",
  "How far along are you?",
  "Review your roadmap",
];
const messages: Record<string, string> = {
  ROADMAP_INFEASIBLE:
    "This syllabus does not fit the current dates and weekly availability. Review the capacity and choices below.",
  ROADMAP_SCOPE_TOO_LARGE: `Split the confirmed syllabus into smaller roadmap segments (up to ${ROADMAP_LIMITS.topics} units each).`,
  EXPANSION_INFEASIBLE:
    "This period no longer has enough capacity for its milestone. Adjust availability or the roadmap before expanding it.",
  CONFIRM_ROADMAP_EDIT_FIRST:
    "Confirm (or discard) your roadmap changes before planning a period from it.",
  PENDING_EXPANSION_DRAFT:
    "You already have an unconfirmed period plan. Review or discard it before planning another period.",
  MILESTONE_ALREADY_EXPANDED:
    "This period has already been expanded. Its Quests — including any you edited or deleted — are not recreated.",
  MILESTONE_LOCKED: "Unlock this milestone before editing it.",
  QUOTA_EXHAUSTED:
    "Your allowance for this operation is used. Existing drafts remain available to review and confirm.",
  INVALID_DRAFT:
    "These edits break the roadmap’s period, coverage, capacity, priority or outcome requirements. Restore the affected work.",
  INVALID_REQUEST:
    "Check the form: a real target date, 1–60 unique units, weekly minutes 0–720 and a horizon of at most 365 days are required.",
  EXCLUSIONS_REQUIRE_ACCEPTANCE:
    "Accept the explicitly excluded units before confirming.",
};

export default function RoadmapPlanner({
  capabilities: cap,
  onQuotaRefresh,
}: {
  capabilities: PlannerCapabilities;
  onQuotaRefresh?: () => void;
}) {
  const [step, setStep] = useState(0),
    [course, setCourse] = useState(""),
    [subjectId, setSubjectId] = useState<number | null>(null),
    [qualification, setQualification] = useState("");
  const [scope, setScope] = useState(""),
    [date, setDate] = useState(""),
    [granularity, setGranularity] = useState<"MONTH" | "WEEK">("MONTH");
  const [daily, setDaily] = useState<number[]>(
    weekdays.map((_, index) => (cap.restDays.includes(index) ? 0 : 60))
  );
  const [confirmedAvailability, setConfirmedAvailability] = useState(false),
    [reserve, setReserve] = useState(15),
    [reserveAccepted, setReserveAccepted] = useState(false),
    [blocked, setBlocked] = useState("");
  const [topics, setTopics] = useState<RoadmapInput["roadmap"]["topics"]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [feasibility, setFeasibility] = useState<RoadmapFeasibility | null>(null);
  /** An edit that only needs the student's acknowledgement before it can be saved. */
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
    [requestKey, setRequestKey] = useState<string | null>(null);
  const [reviseMilestone, setReviseMilestone] = useState<string | null>(null),
    [expanding, setExpanding] = useState<string | null>(null),
    [expansionKey, setExpansionKey] = useState<string | null>(null),
    [expansionStage, setExpansionStage] = useState(""),
    [expansionError, setExpansionError] = useState("");
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
    intakeStarted(id, "ROADMAP");
  };
  const touch = (field: string) => {
    touchedFields.current.add(field);
    if (intakeId.current)
      intakeFirstInput(intakeId.current, "ROADMAP", {
        fieldsTouched: touchedFields.current.size,
      });
  };
  const readinessFor = (step: number): { ready: boolean; missingRequired: number } => {
    if (step === 1) {
      const missing = course.trim() ? 0 : 1;
      return { ready: missing === 0, missingRequired: missing };
    }
    if (step === 2) {
      const labels = scope
        .split("\n")
        .map((label) => label.trim())
        .filter(Boolean);
      const valid =
        labels.length >= 1 &&
        labels.length <= ROADMAP_LIMITS.topics &&
        labels.every((label) => label.length <= 200) &&
        new Set(labels.map((label) => label.toLowerCase())).size === labels.length;
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
    if (step === 1) return "Enter a course or subject name.";
    if (step === 2)
      return `Enter 1–${ROADMAP_LIMITS.topics} unique units, one per line, no more than 200 characters each.`;
    if (step === 3) return "Choose a future target date within 365 days.";
    if (step === 4)
      return "Confirm your weekly availability and explicitly accept any reserve below 15%.";
    return "";
  };
  const { ready: readinessReady, missingRequired: readinessMissing } =
    readinessFor(step);
  useEffect(() => {
    heading.current?.focus();
  }, [step, detail?.plan.id, receipt, expanding]);
  useEffect(() => {
    void plannerFetch<Summary[]>("")
      .then((data) => {
        setSaved(data);
        const roadmaps = data.filter((plan) => plan.mode === "ROADMAP");
        if (roadmaps.length === 0 && step === 0) {
          plannerTelemetry("planner_mode_selected", { mode: "ROADMAP" });
          beginIntake();
          setStep(1);
        }
      })
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
      "ROADMAP",
      readinessReady,
      readinessMissing
    );
  }, [readinessReady, readinessMissing]);
  useEffect(
    () => () => {
      if (intakeId.current)
        intakeAbandoned(intakeId.current, "ROADMAP", "LEFT", {
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

  const report = (source: unknown, target: "plan" | "expansion" = "plan") => {
    const code =
      source instanceof PlannerClientError
        ? source.code
        : source instanceof Error
          ? source.message
          : "";
    const message =
      messages[code] ??
      "The request could not finish. Your form and saved roadmap are retained.";
    if (target === "expansion") setExpansionError(message);
    else setError(message);
    if (source instanceof RoadmapClientError) setFeasibility(source.feasibility ?? null);
  };

  const buildInput = (): RoadmapInput => {
    const parsed = UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: course.trim(),
      outcome: course.trim(),
      scope: topics.map((topic) => topic.label).join("\n"),
      startDate: cap.today,
      endDate: date,
      availability: {
        dailyMinutes: daily,
        recoveryPercent: reserve,
        blockedDates: blocked.split(/[\s,]+/).filter(Boolean),
      },
      roadmap: {
        subjectName: course,
        subjectId,
        qualification: qualification.trim() || null,
        topics,
        granularity,
        acceptReducedReserve: reserveAccepted,
      },
    });
    const supported = new Set<string>(
      smartQuestions(parsed as RoadmapInput).map((question) => question.reasonCode)
    );
    const usable = Object.entries(answers)
      .filter(([reasonCode]) => supported.has(reasonCode))
      .map(([reasonCode, value]) => ({ reasonCode, value }));
    const withAnswers = usable.length
      ? applySmartAnswers(parsed as RoadmapInput, usable)
      : (parsed as RoadmapInput);
    return roadmapInput(withAnswers);
  };
  const draftInput = (() => {
    try {
      return buildInput();
    } catch {
      return null;
    }
  })();
  const questions: SmartQuestion[] = draftInput ? smartQuestions(draftInput) : [];

  const loadPlan = async (id: string) => {
    const result = await plannerFetch<Detail>(`/${id}`);
    const rev = result.latestDraft ?? result.activeRevision;
    if (!rev || rev.inputSnapshot.mode !== "ROADMAP" || !rev.inputSnapshot.roadmap)
      throw new PlannerClientError("NO_ROADMAP_DRAFT");
    setDetail(result);
    setDraft(rev.outputSnapshot);
    setDirty(false);
    setReceipt(rev.confirmationReceipt);
    confirmation.current = null;
    setError("");
    setExpansionError("");
    setFeasibility(null);
  };
  const recover = async (key: string) => {
    const result = await plannerFetch<{ planId: string; operation: { state: string } }>(
      `/recover/${key}`
    );
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
    let input: RoadmapInput;
    try {
      input = buildInput();
    } catch {
      setError(messages.INVALID_REQUEST);
      return;
    }
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    setBusy(true);
    setStage("Validating inputs and calculating capacity…");
    if (questions.length)
      plannerTelemetry("smart_question_asked", { questions: questions.length, mode: "ROADMAP" });
    else plannerTelemetry("smart_question_skipped", { mode: "ROADMAP" });
    abort.current = new AbortController();
    if (intakeId.current)
      intakeFirstDraftRequested(intakeId.current, "ROADMAP", intakeCounts());
    try {
      await requestRoadmap(input, key, abort.current.signal, (event: GenerationEvent) =>
        setStage(
          {
            calculating_capacity: "Capacity checked per period",
            generating: "Sequencing your syllabus into periods…",
            validating_proposal: "Checking periods, coverage and capacity…",
            reviewing_plan: "Reviewing the roadmap for quality…",
            repairing_plan: "Improving the flagged milestones…",
            saving_draft: "Saving the validated roadmap…",
            ready: "Roadmap saved. Retrieving review…",
            failed: "Generation failed. Checking saved state…",
            cancelled: "Checking cancellation…",
          }[event.stage]
        )
      );
      await recover(key);
    } catch (caught) {
      try {
        await recover(key);
      } catch {
        report(caught);
      }
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
        edits: [],
        ...(draft.mode === "ROADMAP"
          ? {
              milestoneEdits: draft.milestones.map(
                ({ key, title, outcome, periodKey, topicKeys, effortMinutes, checkpoint, locked, removed }) => ({
                  key,
                  title,
                  outcome,
                  periodKey,
                  topicKeys,
                  effortMinutes,
                  ...(checkpoint ? { checkpoint } : {}),
                  ...(locked !== undefined ? { locked } : {}),
                  ...(removed !== undefined ? { removed } : {}),
                })
              ),
              milestoneOrder: draft.milestones.map((milestone) => milestone.key),
            }
          : {}),
      };
      // Posted through this mode's own client, so its mocks and error types apply.
      const outcome = await submitDraftEdit(detail.plan.id, editBody, [], { fetchImpl: plannerFetch });
      if (!outcome.sealed) {
        // A period holding more than its target, or one left deliberately free, is the
        // student's tradeoff to accept. Nothing has been written yet.
        setPendingEdit({ body: editBody, findings: outcome.findings });
        return;
      }
      plannerTelemetry("roadmap_edit_saved", { planId: detail.plan.id, mode: "ROADMAP" });
      await loadPlan(detail.plan.id);
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirmRoadmap = async () => {
    if (!detail || !draft || !revision || dirty) return;
    setBusy(true);
    setError("");
    const body = confirmation.current ?? {
      schemaVersion: 1 as const,
      revisionId: revision.id,
      digest: revision.digest,
      expectedVersion: detail.plan.version,
      idempotencyKey: crypto.randomUUID(),
      // A strategic roadmap creates no Quests; an expansion confirms its segment.
      selectedItemKeys: draft.items.filter((item) => !item.removed).map((item) => item.key),
      createGoal: false,
      acknowledgeExclusions: exclusionsAccepted,
    };
    confirmation.current = body;
    try {
      const result = await commitPlanner(detail.plan.id, body);
      setReceipt(result);
      plannerTelemetry(
        draft.mode === "ROADMAP" && draft.expansion
          ? "roadmap_milestone_expansion_completed"
          : "roadmap_confirmed",
        { planId: result.planId, mode: "ROADMAP", items: result.items.length }
      );
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

  const expand = async (milestoneKey: string) => {
    if (!detail) return;
    setExpanding(milestoneKey);
    setExpansionError("");
    setExpansionStage("Calculating this period's capacity…");
    const key = expansionKey ?? crypto.randomUUID();
    setExpansionKey(key);
    abort.current = new AbortController();
    try {
      await requestExpansion(
        detail.plan.id,
        milestoneKey,
        { schemaVersion: 1, requestKey: key, expectedVersion: detail.plan.version },
        abort.current.signal,
        (event) =>
          setExpansionStage(
            {
              calculating_capacity: "Capacity checked for this period",
              generating: "Planning this period's study tasks…",
              validating_proposal: "Checking dates, scope and capacity…",
              reviewing_plan: "Reviewing the plan for quality…",
              repairing_plan: "Improving the flagged items…",
              saving_draft: "Saving the period plan…",
              ready: "Period plan saved.",
              failed: "Expansion failed. Checking saved state…",
              cancelled: "Checking cancellation…",
            }[event.stage]
          )
      );
      await loadPlan(detail.plan.id);
      setExpansionKey(null);
    } catch (caught) {
      report(caught, "expansion");
    } finally {
      setExpanding(null);
      abort.current = null;
      onQuotaRefresh?.();
    }
  };

  const cancelExpansionRun = async () => {
    abort.current?.abort();
    if (detail && expansionKey)
      try {
        await cancelExpansion(detail.plan.id, expansionKey);
      } catch {
        setExpansionError(
          "Cancellation could not be confirmed. Recover this operation before starting again."
        );
      }
  };

  const updateMilestone = (
    key: string,
    patch: Partial<Extract<ValidatedDraftV1, { mode: "ROADMAP" }>["milestones"][number]>
  ) => {
    setDraft((current) => {
      if (!current || current.mode !== "ROADMAP") return current;
      return {
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.key === key ? { ...milestone, ...patch } : milestone
        ),
      };
    });
    setDirty(true);
    setExclusionsAccepted(false);
    confirmation.current = null;
  };
  const updateItem = (key: string, patch: Partial<ValidatedDraftV1["items"][number]>) => {
    setDraft(
      (current) =>
        current && {
          ...current,
          items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        }
    );
    setDirty(true);
    confirmation.current = null;
  };
  const moveItem = (index: number, delta: number) => {
    if (!draft) return;
    const items = [...draft.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    setDraft({ ...draft, items });
    setDirty(true);
  };
  const moveMilestone = (index: number, delta: number) => {
    if (!draft || draft.mode !== "ROADMAP") return;
    const milestones = [...draft.milestones];
    [milestones[index], milestones[index + delta]] = [
      milestones[index + delta],
      milestones[index],
    ];
    setDraft({ ...draft, milestones });
    setDirty(true);
  };

  const activeMilestones =
    draft?.mode === "ROADMAP"
      ? draft.milestones.filter((milestone) => !milestone.removed)
      : [];
  const expansionMilestone =
    draft?.mode === "ROADMAP" && draft.expansion
      ? draft.milestones.find((milestone) => milestone.key === draft.expansion!.milestoneKey)
      : undefined;
  const periods = draft?.mode === "ROADMAP" ? draft.periods ?? [] : [];
  const exclusions = draft?.mode === "ROADMAP" ? excludedRoadmapTopics(draft) : [];
  const costs =
    revision?.inputSnapshot.mode === "ROADMAP"
      ? revision.inputSnapshot.roadmap.topics.reduce(
          (total, topic) => total + scopeMinutes([topic]),
          0
        )
      : 0;
  const tradeoffs =
    revision?.inputSnapshot.mode === "ROADMAP" && draft?.mode === "ROADMAP"
      ? [
          ...roadmapSoftViolations(
            revision.inputSnapshot,
            periods.map((period) => ({
              ref: period.key,
              title: period.title,
              granularity: period.granularity,
              startDate: period.startDate,
              endDate: period.endDate,
              order: period.order,
              days:
                (Date.parse(period.endDate) - Date.parse(period.startDate)) / 86400000 + 1,
            })),
            activeMilestones.map((milestone) => ({
              periodRef: milestone.periodKey,
              effortMinutes: milestone.effortMinutes,
              topicRefs: milestone.topicKeys,
            }))
          ).map((violation) => violation.explanation),
          ...roadmapPriorityTradeoffNotes(revision.inputSnapshot),
        ]
      : [];
  const rebalanceProposal = sealedProposal(detail, revision);
  const stateOf = (milestoneKey: string) =>
    detail?.milestoneStates.find((entry) => entry.milestoneKey === milestoneKey)?.state;

  const promotable =
    detail?.activeRevision && detail?.latestDraft == null
      ? {
          planId: detail.plan.id,
          revisionId: detail.activeRevision.id,
          version: detail.plan.version,
        }
      : null;

  return (
    <section className={s.root} aria-label="Course Roadmap" aria-busy={busy || Boolean(expanding)}>
      <h2 tabIndex={-1} ref={heading}>
        {receipt && draft?.mode === "ROADMAP" && draft.expansion
          ? "Your period is ready"
          : receipt
            ? "Your roadmap is ready"
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
        {stage || expansionStage}
      </div>
      {error && (
        <div id="roadmap-error" className={s.error} role="alert">
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
      {expansionError && (
        <div id="expansion-error" className={s.error} role="alert">
          {expansionError}
        </div>
      )}
      {feasibility && (
        <div className={s.card}>
          <h3>
            {feasibility.status === "SEGMENT_REQUIRED"
              ? "Split this syllabus into segments"
              : "This roadmap needs adjustment"}
          </h3>
          <p>
            {feasibility.periods} {feasibility.granularity === "MONTH" ? "periods" : "weeks"} ·{" "}
            {feasibility.availableMinutes} available minutes · at least{" "}
            {feasibility.scopeMinutes} estimated minutes
          </p>
          <p className={s.muted}>
            Estimates are coarse planning heuristics, not a promise that a valid
            schedule exists.
          </p>
          <ul>
            {feasibility.choices.map((choice) => (
              <li key={choice}>{choice}</li>
            ))}
          </ul>
        </div>
      )}
      {receipt && (
        <div className={s.card}>
          {receipt.items.length ? (
            <>
              <p>
                {receipt.items.length} ordinary Quests created for this period.
                They use your existing Focus, XP, rewards and completion flow.
              </p>
              <div className={s.actions}>
                {receipt.items[0] && (
                  <Link className={s.primary} href={`/focus?questId=${receipt.items[0].questId}`}>
                    Start next Quest
                  </Link>
                )}
                <Link href="/quests">View Quests</Link>
                <button onClick={() => setReceipt(null)}>Back to roadmap</button>
              </div>
            </>
          ) : (
            <>
              <p>
                Roadmap confirmed. No Quests were created: a roadmap is a plan, not
                daily work. Choose a period below (or later) and plan it into Quests
                when you are ready.
              </p>
              <div className={s.actions}>
                <button className={s.primary} onClick={() => setReceipt(null)}>
                  View periods
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {detail && draft?.mode === "ROADMAP" ? (
        <>
          <p className={s.muted}>
            {revision?.inputSnapshot.mode === "ROADMAP" &&
            revision.inputSnapshot.roadmap.qualification
              ? `${revision.inputSnapshot.roadmap.qualification} · `
              : ""}
            Target {revision?.inputSnapshot.endDate} ·{" "}
            {revision?.inputSnapshot.mode === "ROADMAP"
              ? roadmapGranularity(revision.inputSnapshot)
              : "MONTH"}{" "}
            periods · {periods.length} periods · {activeMilestones.length} milestones ·{" "}
            {(costs / 60).toFixed(1)} h estimated
          </p>
          <p className={s.muted}>
            Coverage, progress and time on task do not establish academic mastery.
          </p>
          {tradeoffs.length > 0 && (
            <div className={s.card}>
              <h3>Tradeoffs in this roadmap</h3>
              {tradeoffs.map((note) => (
                <p key={note} className={s.muted}>
                  {note}
                </p>
              ))}
            </div>
          )}
          <CoverageMapPanel
            draft={draft}
            links={detail.links}
            execution={detail.execution}
            historyItems={detail.historyItems}
          />
          <PreferencePanel planId={detail.plan.id} />
          {receipt || detail.links.length ? null : (
            <p className={s.muted}>
              Nothing is created until you confirm. A confirmed roadmap creates no
              Quests — you expand one period when you want to start studying.
            </p>
          )}
          {draft.expansion && expansionMilestone ? (
            <div className={s.card}>
              <h3>
                Period plan · {expansionMilestone.title}
              </h3>
              <p className={s.muted}>
                {expansionMilestone.outcome ??
                  resolveMilestoneOutcome(expansionMilestone.outcome)}{" "}
                · only this period is planned; neighbouring periods are unchanged.
              </p>
              <IntensityNote items={draft.items.filter((item) => !item.removed)} />
              {draft.items.map((item, index) => {
                const link = detail.links.find((entry) => entry.itemKey === item.key);
                return (
                  <PlanItemEditor
                    key={item.key}
                    item={item}
                    index={index}
                    total={draft.items.length}
                    topicTitle={draft.topics.find((topic) => topic.key === item.topicKey)?.title}
                    disposition={link?.disposition}
                    disabled={busy || Boolean(link) || Boolean(receipt)}
                    minDate={
                      periods.find((period) => period.key === expansionMilestone.periodKey)
                        ?.startDate ?? revision!.inputSnapshot.startDate
                    }
                    maxDate={
                      periods.find((period) => period.key === expansionMilestone.periodKey)
                        ?.endDate ?? revision!.inputSnapshot.endDate
                    }
                    errorId={error ? "roadmap-error" : undefined}
                    onUpdate={updateItem}
                    onMove={moveItem}
                    stretch={
                      promotable
                        ? {
                            ...promotable,
                            stale: false,
                            promoted: Boolean(
                              detail.links.find((entry) => entry.itemKey === item.key)
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
              <div className={s.actions}>
                {!detail.links.length && (
                  <>
                    <button disabled={busy || !dirty} onClick={save}>
                      Save revised period
                    </button>
                    <button
                      className={s.primary}
                      disabled={busy || dirty || !draft.items.some((item) => !item.removed)}
                      onClick={confirmRoadmap}
                    >
                      Create {draft.items.filter((item) => !item.removed).length} Quests
                    </button>
                  </>
                )}
                <button disabled={busy} onClick={() => void loadPlan(detail.plan.id).catch(report)}>
                  Reload saved plan
                </button>
              </div>
            </div>
          ) : (
            <div className={s.card}>
              <h3>Periods</h3>
              {periods.map((period) => {
                const milestones = activeMilestones.filter(
                  (milestone) => milestone.periodKey === period.key
                );
                return (
                  <details key={period.key} className={s.period} open>
                    <summary>
                      <span className={s.periodTitle}>{period.title}</span>{" "}
                      {milestones.map((milestone) => milestone.title).join(" · ") ||
                        "No milestone yet"}
                      <br />
                      <span className={s.muted}>
                        {period.startDate} → {period.endDate} ·{" "}
                        {milestones.reduce(
                          (total, milestone) => total + (milestone.effortMinutes ?? 0),
                          0
                        )}{" "}
                        min planned
                        {milestones.length
                          ? ` · ${
                              stateOf(milestones[0].key) === "EXPANDED"
                                ? "expanded"
                                : stateOf(milestones[0].key) === "EXPANSION_DRAFT"
                                  ? "draft expansion"
                                  : stateOf(milestones[0].key) === "PARTIALLY_REMOVED"
                                    ? "partly removed"
                                    : stateOf(milestones[0].key) === "EXECUTION_CHANGED"
                                      ? "execution changed"
                                      : "not expanded"
                            }`
                          : ""}
                      </span>
                    </summary>
                    {milestones.map((milestone) => {
                      const milestoneIndex = draft.milestones.findIndex(
                        (entry) => entry.key === milestone.key
                      );
                      const state = stateOf(milestone.key);
                      return (
                        <div key={milestone.key}>
                          <fieldset
                            disabled={busy || Boolean(receipt)}
                            aria-describedby={error ? "roadmap-error" : undefined}
                          >
                            <label>
                              Milestone
                              <input
                                value={milestone.title}
                                maxLength={200}
                                disabled={milestone.locked}
                                onChange={(event) =>
                                  updateMilestone(milestone.key, { title: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Outcome (what finishing looks like)
                              <input
                                value={
                                  milestone.outcome ??
                                  resolveMilestoneOutcome(milestone.outcome)
                                }
                                minLength={12}
                                maxLength={240}
                                disabled={milestone.locked}
                                onChange={(event) =>
                                  updateMilestone(milestone.key, { outcome: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Planned minutes
                              <input
                                type="number"
                                min={0}
                                max={ROADMAP_LIMITS.maxEffortMinutes}
                                value={milestone.effortMinutes ?? 0}
                                disabled={milestone.locked}
                                onChange={(event) =>
                                  updateMilestone(milestone.key, {
                                    effortMinutes: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                            <p className={s.muted}>
                              Covers:{" "}
                              {(milestone.topicKeys ?? [])
                                .map(
                                  (key) =>
                                    draft.topics.find((topic) => topic.key === key)?.title ?? ""
                                )
                                .join(", ")}
                            </p>
                            <label className={s.check}>
                              <input
                                type="checkbox"
                                checked={milestone.locked ?? false}
                                onChange={(event) =>
                                  updateMilestone(milestone.key, { locked: event.target.checked })
                                }
                              />
                              Lock this milestone
                            </label>
                            <label className={s.check}>
                              <input
                                type="checkbox"
                                disabled={milestone.locked}
                                checked={milestone.removed ?? false}
                                onChange={(event) =>
                                  updateMilestone(milestone.key, { removed: event.target.checked })
                                }
                              />
                              Remove this milestone
                            </label>
                            <div className={s.row}>
                              <button
                                type="button"
                                disabled={milestoneIndex <= 0 || milestone.locked}
                                onClick={() => moveMilestone(milestoneIndex, -1)}
                              >
                                Move earlier
                              </button>
                              <button
                                type="button"
                                disabled={
                                  milestoneIndex < 0 ||
                                  milestoneIndex >= draft.milestones.length - 1 ||
                                  milestone.locked
                                }
                                onClick={() => moveMilestone(milestoneIndex, 1)}
                              >
                                Move later
                              </button>
                            </div>
                          </fieldset>
                          <div className={s.row}>
                            <button
                              type="button"
                              className={s.primary}
                              disabled={
                                busy ||
                                Boolean(expanding) ||
                                dirty ||
                                Boolean(receipt) ||
                                state === "EXPANDED" ||
                                state === "EXPANSION_DRAFT" ||
                                state === "PARTIALLY_REMOVED"
                              }
                              onClick={() => void expand(milestone.key)}
                            >
                              {state === "EXPANDED"
                                ? "Already expanded"
                                : state === "EXPANSION_DRAFT"
                                  ? "Review pending period plan"
                                  : state === "PARTIALLY_REMOVED"
                                    ? "Review existing Quests"
                                    : `Plan ${period.title}`}
                            </button>
                            {state === "EXPANDED" && (
                              <button
                                type="button"
                                disabled={busy || Boolean(expanding) || dirty}
                                onClick={() => setReviseMilestone(milestone.key)}
                              >
                                Revise this period
                              </button>
                            )}
                          </div>
                          {MILESTONE_STATES.includes(state ?? "NOT_EXPANDED") &&
                            state &&
                            state !== "NOT_EXPANDED" && (
                              <p className={s.muted}>
                                This period already has Quests. Deleted or edited work
                                is never recreated automatically.
                              </p>
                            )}
                        </div>
                      );
                    })}
                  </details>
                );
              })}
              {exclusions.length > 0 && (
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={exclusionsAccepted}
                    onChange={(event) => {
                      setExclusionsAccepted(event.target.checked);
                      confirmation.current = null;
                    }}
                  />
                  I accept the listed unit exclusions (
                  {exclusions.map((topic) => topic.title).join(", ")}).
                </label>
              )}
              <div className={s.actions}>
                {!draft.expansion && (
                  <>
                    <button disabled={busy || !dirty} onClick={save}>
                      Save roadmap changes
                    </button>
                    <button
                      className={s.primary}
                      disabled={
                        busy ||
                        dirty ||
                        !activeMilestones.length ||
                        (exclusions.length > 0 && !exclusionsAccepted)
                      }
                      onClick={confirmRoadmap}
                    >
                      Confirm roadmap · 0 Quests
                    </button>
                  </>
                )}
                <button disabled={busy} onClick={() => void loadPlan(detail.plan.id).catch(report)}>
                  Reload saved roadmap
                </button>
              </div>
              {dirty && (
                <p className={s.muted}>
                  Save your changes before confirming. Periods, coverage, capacity and
                  priority are checked again.
                </p>
              )}
            </div>
          )}
          {detail?.activeRevision && (
            <div className={s.card}>
              <RebalancePanel
                planId={detail.plan.id}
                baseRevisionId={detail.activeRevision.id}
                version={detail.plan.version}
                dailyMinutes={
                  detail.activeRevision.inputSnapshot.availability.dailyMinutes
                }
                detectedReasons={[
                  ...((detail.rebalanceState?.overdue ?? 0) > 0
                    ? (["OVERDUE_WORK"] as const)
                    : []),
                  ...(detail.milestoneStates.some(
                    (entry) => entry.state === "EXECUTION_CHANGED"
                  )
                    ? (["EXECUTION_CHANGED"] as const)
                    : []),
                ]}
                eligible={detail.rebalanceState?.eligible ?? 0}
                frozen={detail.rebalanceState?.frozen ?? 0}
                overdue={detail.rebalanceState?.overdue ?? 0}
                locked={detail.rebalanceState?.locked ?? 0}
                proposal={rebalanceProposal}
                labels={{
                  review: "Rebalance roadmap",
                  discard: "Discard this proposal",
                  description:
                    "Your roadmap can be rebalanced over the periods you have not planned yet. A period that already has Quests is an anchor: it is never rewritten, and you see every change before anything is applied.",
                }}
                onReload={() => void loadPlan(detail.plan.id).catch(report)}
              />
            </div>
          )}
          {detail?.activeRevision && reviseMilestone && (
            <div className={s.card}>
              <RebalancePanel
                planId={detail.plan.id}
                // A period revision is based on that period's confirmed expansion:
                // that is where its items live, and its lineage stays historical.
                baseRevisionId={
                  detail.expansions.find(
                    (expansion) =>
                      expansion.milestoneKey === reviseMilestone && expansion.confirmed
                  )?.revisionId ?? detail.activeRevision.id
                }
                version={detail.plan.version}
                milestoneKey={reviseMilestone}
                dailyMinutes={
                  detail.activeRevision.inputSnapshot.availability.dailyMinutes
                }
                detectedReasons={["USER_REQUESTED"]}
                eligible={detail.rebalanceState?.eligible ?? 0}
                frozen={detail.rebalanceState?.frozen ?? 0}
                overdue={detail.rebalanceState?.overdue ?? 0}
                locked={detail.rebalanceState?.locked ?? 0}
                proposal={rebalanceProposal}
                labels={{
                  review: "Revise this period",
                  discard: "Discard this proposal",
                  description:
                    "Already planned periods are history: the original plan for this period stays on record, and this proposes how to finish what is left inside it. Completed work in the period is never changed.",
                }}
                onReload={() => void loadPlan(detail.plan.id).catch(report)}
              />
              <div className={s.actions}>
                <button type="button" onClick={() => setReviseMilestone(null)}>
                  Close period revision
                </button>
              </div>
            </div>
          )}
          {busy && <button onClick={() => void cancelExpansionRun()}>Cancel</button>}
        </>
      ) : (
        <>
          {step === 0 ? (
            <>
              {saved.filter((plan) => plan.mode === "ROADMAP").length > 0 ? (
                <div className={s.card}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="m-0">Your saved roadmaps</h3>
                    <button
                      className={s.primary}
                      type="button"
                      onClick={() => {
                        plannerTelemetry("planner_mode_selected", { mode: "ROADMAP" });
                        beginIntake();
                        setStep(1);
                      }}
                    >
                      Plan a course
                    </button>
                  </div>
                  {saved
                    .filter((plan) => plan.mode === "ROADMAP")
                    .map((plan) => (
                      <p key={plan.id}>
                        <button onClick={() => void loadPlan(plan.id).catch(report)}>
                          {plan.title} · {plan.state}
                        </button>
                      </p>
                    ))}
                </div>
              ) : (
                <div className="py-4 flex flex-col items-start gap-3">
                  <p className="text-sm text-text-secondary">
                    Turn a whole course or syllabus into a compact, period-by-period roadmap with milestones and covered units.
                  </p>
                  <button
                    className={s.primary}
                    type="button"
                    onClick={() => {
                      plannerTelemetry("planner_mode_selected", { mode: "ROADMAP" });
                      beginIntake();
                      setStep(1);
                    }}
                  >
                    Plan a course
                  </button>
                </div>
              )}
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (step < 6) next();
                else void generate();
              }}
              aria-describedby={error ? "roadmap-error" : undefined}
            >
              <fieldset disabled={busy}>
                <div className={step <= 5 ? s.card : undefined}>
                {step === 1 && (
                  <>
                    <label>
                      Existing subject
                      <select
                        value={subjectId ?? ""}
                        onChange={(event) => {
                          touch("subject");
                          const id = Number(event.target.value) || null;
                          setSubjectId(id);
                          if (id)
                            setCourse(
                              cap.subjects.find((subject) => subject.id === id)!.name
                            );
                        }}
                      >
                        <option value="">Enter a course name</option>
                        {cap.subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Course or subject name
                      <input
                        required
                        maxLength={200}
                        value={course}
                        onChange={(event) => {
                          touch("subject");
                          setCourse(event.target.value);
                          setSubjectId(null);
                        }}
                      />
                    </label>
                    <label>
                      Qualification, grade or year (optional)
                      <input
                        maxLength={200}
                        placeholder="For example, A-Level · Year 13"
                        value={qualification}
                        onChange={(event) => {
                          touch("qualification");
                          setQualification(event.target.value);
                        }}
                      />
                    </label>
                  </>
                )}
                {step === 2 && (
                  <>
                    <label>
                      Syllabus units or topics — one per line
                      <textarea
                        required
                        value={scope}
                        maxLength={20000}
                        onChange={(event) => {
                          touch("topics");
                          setScope(event.target.value);
                        }}
                        placeholder={"Measurements and kinematics\nDynamics\nWaves"}
                      />
                    </label>
                    <p className={s.muted}>
                      Your syllabus is authoritative. Sylf will not research or
                      replace it. Up to {ROADMAP_LIMITS.topics} units per roadmap.
                    </p>
                  </>
                )}
                {step === 3 && (
                  <>
                    <label>
                      Target completion date
                      <input
                        type="date"
                        required
                        min={cap.today}
                        value={date}
                        onChange={(event) => {
                          touch("date");
                          setDate(event.target.value);
                          if (event.target.value)
                            setGranularity(
                              defaultRoadmapGranularity(cap.today, event.target.value)
                            );
                        }}
                      />
                    </label>
                    <label>
                      Roadmap granularity
                      <select
                        value={granularity}
                        onChange={(event) =>
                          setGranularity(event.target.value as "MONTH" | "WEEK")
                        }
                      >
                        <option value="MONTH">Monthly periods</option>
                        <option value="WEEK">Weekly periods</option>
                      </select>
                    </label>
                    <p className={s.muted}>
                      {date
                        ? `${defaultRoadmapGranularity(cap.today, date) === granularity ? "Recommended for this horizon" : "You chose this explicitly"}; periods use fixed ${granularity === "MONTH" ? "calendar months" : "seven-day blocks"}.`
                        : "Periods are fixed by Sylf; the plan never invents its own date buckets."}
                    </p>
                  </>
                )}
                {step === 4 && (
                  <>
                    <p>
                      Confirm the minutes you can study in a normal week. Your rest
                      days are prefilled and stay blocked, and existing Quests are
                      subtracted on the server.
                    </p>
                    <div className={s.grid}>
                      {weekdays.map((day, index) => (
                        <label key={day}>
                          {day}
                          {cap.restDays.includes(index) ? " · Rest day" : " · Minutes"}
                          <input
                            type="number"
                            min={0}
                            max={720}
                            required
                            disabled={cap.restDays.includes(index)}
                            value={daily[index]}
                            onChange={(event) => {
                              touch("daily");
                              setDaily(
                                daily.map((value, position) =>
                                  position === index ? Number(event.target.value) : value
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
                        onChange={(event) => {
                          touch("availability");
                          setConfirmedAvailability(event.target.checked);
                        }}
                      />
                      These weekly minutes reflect my actual availability.
                    </label>
                    <label>
                      Recovery reserve (%)
                      <input
                        type="number"
                        min={0}
                        max={50}
                        required
                        value={reserve}
                        onChange={(event) => {
                          touch("reserve");
                          setReserve(Number(event.target.value));
                          setReserveAccepted(false);
                        }}
                      />
                    </label>
                    {reserve < 15 && (
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={reserveAccepted}
                          onChange={(event) => setReserveAccepted(event.target.checked)}
                        />
                        I explicitly accept reducing the reserve below 15%.
                      </label>
                    )}
                    <details>
                      <summary>Holidays or unavailable dates</summary>
                      <label>
                        Dates separated by commas (YYYY-MM-DD)
                        <textarea
                          value={blocked}
                          onChange={(event) => setBlocked(event.target.value)}
                        />
                      </label>
                      <p className={s.muted}>
                        Saved floating rest days are respected automatically.
                      </p>
                    </details>
                  </>
                )}
                {step === 5 && (
                  <>
                    <p>
                      Covered means you have studied it before. Confidence is your own
                      estimate. Priority is separate from both — Sylf never invents an
                      official weighting.
                    </p>
                    {topics.map((topic, index) => (
                      <div className={s.card} key={topic.label}>
                        <h3>{topic.label}</h3>
                        <label className={s.check}>
                          <input
                            type="checkbox"
                            checked={topic.covered ?? false}
                            onChange={(event) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((entry, position) =>
                                  position === index
                                    ? { ...entry, covered: event.target.checked }
                                    : entry
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
                            onChange={(event) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((entry, position) =>
                                  position === index
                                    ? { ...entry, confidence: Number(event.target.value) }
                                    : entry
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
                            ].map((label, value) => (
                              <option key={label} value={value + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          How much does this unit matter?
                          <select
                            value={topic.priority ?? "NEUTRAL"}
                            onChange={(event) => {
                              touch("preparedness");
                              preparednessEdits.current++;
                              setTopics(
                                topics.map((entry, position) =>
                                  position === index
                                    ? event.target.value === "NEUTRAL"
                                      ? { ...entry, priority: "NEUTRAL", prioritySource: undefined }
                                      : {
                                          ...entry,
                                          priority: event.target.value as TopicPriority,
                                          prioritySource: "USER_EXPLICIT",
                                        }
                                    : entry
                                )
                              );
                            }}
                          >
                            {(["NEUTRAL", "HIGH", "LOW"] as TopicPriority[]).map((level) => (
                              <option key={level} value={level}>
                                {PRIORITY_LABEL[level]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </>
                )}
                </div>
                {step === 6 && (
                  <>
                    <div className={s.card}>
                      <h3>{course} roadmap</h3>
                      <p>
                        {topics.length} confirmed units · Target {date} ·{" "}
                        {granularity === "MONTH" ? "monthly" : "weekly"} periods ·{" "}
                        {reserve}% recovery reserve
                      </p>
                      <p className={s.muted}>
                        Generation uses one weekly planner allowance only when a
                        validated roadmap is saved. Reviewing and editing are free.
                      </p>
                    </div>
                    {questions.length > 0 && (
                      <div className={s.card}>
                        <h3>A few details that change this roadmap</h3>
                        <p className={s.muted}>
                          Answer only what applies. Skipping leaves Sylf&apos;s default
                          behavior unchanged.
                        </p>
                        {questions.map((question) => (
                          <fieldset key={question.reasonCode}>
                            <legend>{question.prompt}</legend>
                            {question.options.map((option) => (
                              <label className={s.check} key={option.value}>
                                <input
                                  type="radio"
                                  name={`roadmap-${question.reasonCode}`}
                                  value={option.value}
                                  checked={answers[question.reasonCode] === option.value}
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
                      </div>
                    )}
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
                    {step === 6 ? "Generate roadmap" : "Continue"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {busy && (
            <button
              onClick={() => {
                if (intakeId.current)
                  intakeAbandoned(intakeId.current, "ROADMAP", "CANCELLED", intakeCounts());
                void cancelExpansionRun();
              }}
            >
              Cancel generation
            </button>
          )}
          {requestKey && !busy && (
            <div className={s.actions}>
              <button onClick={() => void recover(requestKey).catch(report)}>
                Recover last operation
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
