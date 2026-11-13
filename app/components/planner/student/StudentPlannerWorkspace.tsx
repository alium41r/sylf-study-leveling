"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  ListTree,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Square,
  Upload,
  X,
} from "lucide-react";
import {
  CanonicalIntentV2Schema,
  type CanonicalIntentV2,
} from "@/lib/planner/v2/contracts";
import {
  STUDENT_RESOURCE_PROFILE,
  STUDENT_SPENDING_LIMIT_USD,
  WEEKDAYS,
  plannerRestDays,
  type StudentPlan,
  type StudentReadiness,
  type StudentWorkspace,
} from "@/lib/planner/v2/client/workspace";
import {
  workspaceRequest,
  WorkspaceRequestError,
  reschedulePlannerCommitment,
} from "@/lib/planner/v2/client/transport";
import type { PlannerCapabilities } from "@/lib/planner/transport";
import { invalidatePlannerCommit } from "@/lib/planner/client";
import { ImmersiveModeButton } from "@/app/components/ImmersiveModeButton";
import AcceptedDetailsEditor from "./AcceptedDetailsEditor";
import PlanningActivity from "./PlanningActivity";
import PlanSchedule from "./PlanSchedule";
import StageRail, { PLANNER_STAGES } from "./StageRail";
import s from "./StudentPlannerWorkspace.module.css";

const key = () => crypto.randomUUID();
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const planState = (state: string) =>
  state === "ACTIVE"
    ? "Active"
    : state === "ARCHIVED"
      ? "Archived"
      : "Draft";
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const TABS = ["Schedule", "Strategy", "Research", "Review", "Notes"] as const;
type TabName = (typeof TABS)[number];

function stageIndex(view: StudentWorkspace) {
  if (
    view.workspace.candidate?.attemptId === view.attempt?.attemptId ||
    (view.draft?.stage === "READY" && !view.draft.retainedFromEarlierAttempt)
  )
    return 5;
  if (view.draft?.retainedFromEarlierAttempt) return 0;
  const stage =
    view.draft?.stage === "INCOMPLETE"
      ? view.attempt?.stage
      : (view.draft?.stage ?? view.attempt?.stage);
  return stage === "STRATEGY"
    ? 1
    : stage === "TRANSLATION" || stage === "BLUEPRINT"
      ? 2
      : stage === "ALLOCATION" || stage === "ALLOCATE"
        ? 3
        : stage === "REVIEW" || stage === "REFINEMENT"
          ? 4
          : 0;
}

const live = (view: StudentWorkspace | null) =>
  !!view?.attempt && ["QUEUED", "RUNNING"].includes(view.attempt.state);

const OPEN_AUTHORIZE_STORAGE_KEY = "sylf:planner:open-authorize";

function readOpenAuthorize(planId: string | null | undefined): boolean {
  if (!planId || typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(OPEN_AUTHORIZE_STORAGE_KEY) === planId;
  } catch {
    return false;
  }
}

function markOpenAuthorize(planId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OPEN_AUTHORIZE_STORAGE_KEY, planId);
  } catch {
    /* Ignore restricted storage environments. */
  }
}

function clearOpenAuthorize() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OPEN_AUTHORIZE_STORAGE_KEY);
  } catch {
    /* Ignore restricted storage environments. */
  }
}

/** Splits plain strategy prose into headed sections and bullet rows. */
function StrategyText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.split("\n").filter(Boolean));
  return (
    <>
      {blocks.map((lines, i) => {
        const [first, ...rest] = lines;
        const heading = first && /^[A-Z0-9][A-Z0-9 &,'’/()\-–:]{3,}$/.test(first.trim());
        const body = heading ? rest : lines;
        const bullets = body.filter((l) => /^\s*[-•]\s/.test(l));
        const prose = body.filter((l) => !/^\s*[-•]\s/.test(l));
        return (
          <section key={i} className={s.strategyBlock}>
            {heading && <h3 className={s.strategyHeading}>{first.trim()}</h3>}
            {prose.length > 0 && <p>{prose.join(" ")}</p>}
            {bullets.length > 0 && (
              <ul>
                {bullets.map((b, j) => (
                  <li key={j}>{b.replace(/^\s*[-•]\s/, "")}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

export default function StudentPlannerWorkspace({
  capabilities,
  onExit,
  onApplied,
  initialPlanId,
  onPlanSelected,
}: {
  capabilities: PlannerCapabilities;
  onExit: () => void;
  onApplied: () => void;
  initialPlanId?: string;
  onPlanSelected?: (id: string | null) => void;
}) {
  const [plans, setPlans] = useState<StudentPlan[]>([]),
    [next, setNext] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(initialPlanId ?? null),
    [view, setView] = useState<StudentWorkspace | null>(null);
  const [plannerClock, setPlannerClock] = useState(() => Date.now());
  useEffect(() => {
    const deadline = view?.attempt?.budget.executionDeadlineAt;
    if (!deadline) return;
    const timer = setTimeout(
      () => setPlannerClock(Date.now()),
      Math.max(1, Date.parse(deadline) - Date.now() + 25)
    );
    return () => clearTimeout(timer);
  }, [view?.attempt?.budget.executionDeadlineAt]);

  const [readiness, setReadiness] = useState<StudentReadiness | null>(null),
    [loading, setLoading] = useState(true),
    [hasPending, setHasPending] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabName>("Schedule"),
    [spendingLimitUsd, setSpendingLimitUsd] = useState(
      STUDENT_SPENDING_LIMIT_USD
    ),
    [authorize, setAuthorize] = useState(() =>
      readOpenAuthorize(initialPlanId)
    ),
    [consent, setConsent] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null),
    [ack, setAck] = useState<string[]>([]),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(""),
    [goal, setGoal] = useState(""),
    [scope, setScope] = useState(""),
    [date, setDate] = useState(""),
    [notes, setNotes] = useState(""),
    [feedback, setFeedback] = useState("");
  const [start, setStart] = useState("08:00"),
    [end, setEnd] = useState("22:00"),
    [ceiling, setCeiling] = useState(90),
    [rest, setRest] = useState(() => plannerRestDays(capabilities.restDays)),
    [research, setResearch] = useState(true),
    [documents, setDocuments] = useState<
      { documentId: string; title: string }[]
    >([]);
  const [history, setHistory] = useState<unknown>(null),
    [selectedStrategy, setSelectedStrategy] = useState<{
      id: string;
      version: number;
      text: string;
    } | null>(null),
    [historical, setHistorical] = useState<{
      attemptId: string;
      history: { id: string; kind: string; label: string }[];
    } | null>(null),
    [editing, setEditing] = useState(false),
    [clarifiedIntent, setClarifiedIntent] = useState<CanonicalIntentV2 | null>(
      null
    );
  const pending = useRef<{ path: string; body: unknown } | null>(null),
    requesting = useRef(false),
    mounted = useRef(true),
    selection = useRef(selected);

  const refresh = useCallback(async (id?: string | null) => {
    const data = await workspaceRequest<{
      plans: StudentPlan[];
      next: string | null;
      readiness: StudentReadiness;
    }>("/workspace");
    if (!mounted.current) return;
    setPlans(data.plans);
    setNext(data.next);
    setReadiness(data.readiness);
    const planId = id === undefined ? selection.current : id;
    if (planId) {
      const current = await workspaceRequest<StudentWorkspace>(
        `/workspace?planId=${encodeURIComponent(planId)}`
      );
      if (mounted.current && selection.current === planId) setView(current);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh(null)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void workspaceRequest<StudentWorkspace>(
      `/workspace?planId=${encodeURIComponent(selected)}`
    )
      .then((v) => {
        if (active) setView(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!selected || !live(view)) return;
    let cancelled = false;
    let polling = false;
    const visible = async () => {
      if (cancelled || polling || requesting.current || document.hidden) return;
      polling = true;
      try {
        await refresh(selected);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        polling = false;
      }
    };
    const timer = setInterval(() => {
      void visible();
    }, 3000);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [selected, view, refresh]);

  function closeAuthorize() {
    clearOpenAuthorize();
    setAuthorize(false);
  }

  function choosePlan(id: string | null, openAuthorize = false) {
    if (openAuthorize && id) markOpenAuthorize(id);
    else clearOpenAuthorize();
    if (id !== null && selection.current === id) {
      if (openAuthorize) {
        setAuthorize(true);
        setConsent(false);
      }
      return;
    }
    selection.current = id;
    setSelected(id);
    onPlanSelected?.(id);
    setView(null);
    setDocuments([]);
    setAnswers({});
    setAuthorize(openAuthorize);
    setConsent(false);
    setConfirm(null);
    setAck([]);
    setHistory(null);
    setSelectedStrategy(null);
    setHistorical(null);
    setEditing(false);
    setLiveStageHint(null);
    setClarifiedIntent(null);
  }

  async function run(action: () => Promise<void>) {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Planner could not finish this action."
        );
    } finally {
      requesting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function mutate<T>(path: string, body: unknown): Promise<T> {
    if (pending.current)
      throw new Error(
        "Resolve the unacknowledged action first using Retry same action or Refresh saved work."
      );
    pending.current = { path, body };
    setHasPending(true);
    try {
      const result = await workspaceRequest<T>(path, body);
      pending.current = null;
      setHasPending(false);
      return result;
    } catch (e) {
      if (!(e instanceof WorkspaceRequestError) || !e.uncertain) {
        pending.current = null;
        setHasPending(false);
      }
      throw e;
    }
  }

  function acceptedIntent(): CanonicalIntentV2 {
    if (minutes(end) <= minutes(start))
      throw new Error("The study window must end after it starts.");
    if (date && date < capabilities.today)
      throw new Error("Choose a deadline today or later.");
    const topics = scope
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    const maxBox = Math.min(180, Math.max(30, ceiling));
    const prefBox = Math.min(
      60,
      Math.max(25, Math.min(maxBox, Math.round(ceiling / 2)))
    );
    return CanonicalIntentV2Schema.parse({
      schemaVersion: 2,
      title: title.trim(),
      outcome: goal.trim(),
      policy: "GENERAL",
      policySelection: "USER_OVERRIDE",
      deadline: date
        ? { kind: "FIXED", date, examDayStudyAllowed: false }
        : { kind: "NONE" },
      scope: topics.map((t, i) => ({
        scopeKey: key(),
        modelRef: `scope_${i + 1}`,
        title: t,
        parentKey: null,
        inclusion: "REQUESTED",
        sourceClaimIds: [],
      })),
      evidence: [],
      availability: {
        timezone: capabilities.timezone,
        dailyCeilingMinutes: WEEKDAYS.map((_, day) =>
          rest.includes(day) ? 0 : ceiling
        ),
        restWeekdays: rest,
        blockedDates: [],
        recoveryPercent: 0,
        basis: "CONFIRMED_AVAILABILITY",
        studyWindows: {
          schemaVersion: 1,
          weekly: WEEKDAYS.flatMap((_, weekday) =>
            rest.includes(weekday)
              ? []
              : [
                  {
                    weekday,
                    startMinute: minutes(start),
                    endMinute: minutes(end),
                  },
                ]
          ),
          overrides: [],
        },
      },
      preferences: {
        pacing: "SPREAD",
        desiredIntensity: "MODERATE",
        preferredTimeboxMinutes: prefBox,
        maximumTimeboxMinutes: maxBox,
      },
      assumptions: [],
      unresolvedQuestions: [],
    });
  }

  async function create(openAuthorize: boolean) {
    const intent = acceptedIntent(),
      result = await mutate<{ planId: string }>("/workspace", {
        action: "CREATE",
        key: key(),
        intent,
      });
    if (notes.trim())
      await mutate("/workspace", {
        action: "NOTE",
        planId: result.planId,
        key: key(),
        text: notes,
        expectedConversationVersion: 0,
      });
    choosePlan(result.planId, openAuthorize);
    setNotes("");
    await refresh(result.planId);
  }

  async function generate() {
    if (!view || !consent) return;
    clearOpenAuthorize();
    const text = [
      view.intent.intent.outcome,
      notes ? `Student instructions: ${notes}` : "",
      "",
    ]
      .filter(Boolean)
      .join("\n");
    await mutate("/workspace", {
      action: "GENERATE",
      profile: STUDENT_RESOURCE_PROFILE,
      consent: true,
      spendingLimitUsd,
      request: {
        schemaVersion: 2,
        requestKey: key(),
        text,
        targets: [
          {
            kind: "EXISTING",
            planId: view.plan.planId,
            expectedIntentVersionId: view.intent.intentVersionId,
            expectedPlanningVersion: view.workspace.planningVersion,
            baseActiveRevisionId: view.workspace.active?.revisionId ?? null,
          },
        ],
        researchRequested: research,
        documentIds: research ? documents.map((d) => d.documentId) : [],
      },
    });
    setAuthorize(false);
    setConsent(false);
    setFeedback("");
    await refresh(selected);
  }

  async function resume() {
    if (!view?.attempt || !view.research) return;
    await mutate("/workspace", {
      action: "CONTINUE",
      request: {
        key: key(),
        parentAttemptId: view.attempt.attemptId,
        expectedResearchDigest: view.research.digest,
        ...(view.research.foundationDigest
          ? { expectedFoundationDigest: view.research.foundationDigest }
          : {}),
        answers: view.research.questions.map((q) => ({
          ref: q.ref,
          text: answers[q.ref] ?? "",
        })),
        intents: view.attempt.targets.map((t) => ({
          planId: t.planId,
          expectedIntentId: view.intent.intentVersionId,
          expectedPlanningVersion: view.workspace.planningVersion,
          baseRevisionId: t.baseActiveRevisionId,
          ...(clarifiedIntent ? { intent: clarifiedIntent } : {}),
        })),
      },
    });
    setAnswers({});
    setClarifiedIntent(null);
    await refresh(selected);
  }

  const canConfirm =
    !!view?.workspace.allowedActions.includes("CONFIRM") &&
    view.workspace.candidate?.attemptId === view.attempt?.attemptId &&
    view.changeSet?.changeSetId === view.workspace.candidate?.changeSetId &&
    !view.usage?.uncertain;
  const journeyExpired =
    !!view?.attempt &&
    ["FAILED", "CANCELLED", "NEEDS_DECISION"].includes(view.attempt.state) &&
    !!view.attempt.budget.executionDeadlineAt &&
    Date.parse(view.attempt.budget.executionDeadlineAt) <= plannerClock;
  const displayingActive =
    !!view?.workspace.active && !!view.attempt?.applyReceipt;
  const currentIssues =
    view?.draft?.issues.filter((i) =>
      ["OPEN", "ADDRESSED"].includes(i.disposition)
    ) ?? [];
  const blueprint = view?.draft?.blueprints[0]?.blueprint;
  const [switcher, setSwitcher] = useState(false),
    [query, setQuery] = useState(""),
    [fold, setFold] = useState<"availability" | "context" | null>(null),
    [inspector, setInspector] = useState(false),
    [outcomeOpen, setOutcomeOpen] = useState(false);
  const [placementDates, setPlacementDates] = useState<Record<number, string>>(
    {}
  );
  const [liveStageHint, setLiveStageHint] = useState<number | null>(null);

  const handleActivityStep = useCallback(() => {
    if (!selection.current || requesting.current) return;
    void refresh(selection.current).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcher((o) => !o);
        setQuery("");
        return;
      }
      if (e.key !== "Escape") return;
      if (confirm) setConfirm(null);
      else if (authorize) setAuthorize(false);
      else if (inspector) setInspector(false);
      else setSwitcher(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authorize, confirm, inspector]);

  const attemptState = view?.attempt?.state;
  const rawStageIdx = view ? stageIndex(view) : 0;
  const stageIdx =
    live(view) && liveStageHint !== null
      ? Math.max(rawStageIdx, liveStageHint)
      : rawStageIdx;
  const settled = !!view && !live(view);
  const showContentTabs =
    !live(view) || !!blueprint || !!view?.draft?.strategies.length;
  const tone: "neutral" | "bad" | "good" =
    attemptState === "FAILED"
      ? "bad"
      : settled && stageIdx === 5 && attemptState === "SUCCEEDED"
        ? "good"
        : "neutral";
  const planBadge = !view
    ? null
    : view.workspace.active
      ? displayingActive
        ? ({ text: "Active", tone: "good" } as const)
        : ({
            text: "Draft update",
            tone: "accent",
          } as const)
      : ({ text: "Draft", tone: "neutral" } as const);
  const minutesTotal = blueprint
    ? (view?.draft?.allocation?.committedMinutes ??
      blueprint.activities.reduce((n, a) => n + a.timeboxMinutes, 0))
    : null;
  const resetIntake = () => {
    choosePlan(null);
    setView(null);
    setTitle("");
    setGoal("");
    setScope("");
    setNotes("");
    setFeedback("");
    setFold(null);
    setOutcomeOpen(false);
    setSwitcher(false);
  };
  const canStart =
    !!view &&
    !busy &&
    !!readiness?.ready &&
    !view.usage?.uncertain &&
    !["ARCHIVED", "COMPLETED"].includes(view.plan.state);
  const allDocuments = view
    ? [
        ...view.documents,
        ...documents.filter(
          (d) => !view.documents.some((v) => v.documentId === d.documentId)
        ),
      ]
    : [];

  return (
    <div className={s.root}>
      <div className={s.stage}>
        <header className={s.top}>
          <button
            type="button"
            className={s.icon}
            onClick={onExit}
            aria-label="Back to Classic Planner"
          >
            <ArrowLeft size={16} />
          </button>
          <div className={s.brand}>
            <h1>Planner</h1>
          </div>
          <button
            type="button"
            className={s.switcher}
            aria-haspopup="dialog"
            aria-expanded={switcher}
            onClick={() => {
              setSwitcher(!switcher);
              setQuery("");
            }}
          >
            <span>{view?.plan.title ?? "Plans"}</span>
            <ChevronDown size={13} />
          </button>
          {view && (
            <button
              type="button"
              className={s.ghost}
              onClick={() => setInspector(true)}
            >
              <SlidersHorizontal size={14} />
              <span className={s.topBtnLabel}>Details</span>
            </button>
          )}
          {selected && (
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={resetIntake}
            >
              <Plus size={14} />
              <span className={s.topBtnLabel}>New</span>
            </button>
          )}
          <ImmersiveModeButton
            variant="header-pill"
            className="hidden md:inline-flex"
          />
        </header>

        {switcher && (
          <>
            <button
              type="button"
              className={s.popScrim}
              aria-label="Close plan switcher"
              onClick={() => setSwitcher(false)}
            />
            <div className={s.pop} role="dialog" aria-label="Plans">
              <input
                autoFocus
                className={s.popSearch}
                aria-label="Search plans"
                placeholder="Filter plans…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <nav className={s.popList}>
                {loading ? (
                  <p className={s.popEmpty} role="status">
                    Loading…
                  </p>
                ) : plans.length === 0 ? (
                  <p className={s.popEmpty}>No saved plans</p>
                ) : (
                  plans
                    .filter((p) =>
                      p.title.toLowerCase().includes(query.trim().toLowerCase())
                    )
                    .map((p) => (
                      <button
                        type="button"
                        key={`pop-${p.planId}`}
                        className={s.popItem}
                        aria-current={
                          selected === p.planId ? "page" : undefined
                        }
                        onClick={() => {
                          setSwitcher(false);
                          if (!busy) choosePlan(p.planId);
                        }}
                      >
                        <strong>{p.title}</strong>
                        <small>{planState(p.state)}</small>
                      </button>
                    ))
                )}
              </nav>
              {next && (
                <button
                  type="button"
                  className={s.textButton}
                  onClick={() =>
                    void run(async () => {
                      const page = await workspaceRequest<{
                        plans: StudentPlan[];
                        next: string | null;
                      }>(`/workspace?before=${next}`);
                      setPlans((old) => [...old, ...page.plans]);
                      setNext(page.next);
                    })
                  }
                >
                  Load more
                </button>
              )}
              <button
                type="button"
                className={s.popNew}
                disabled={busy}
                onClick={resetIntake}
              >
                <Plus size={14} /> New plan
              </button>
            </div>
          </>
        )}

        {error && (
          <div className={s.banner} data-tone="bad" role="alert">
            <p>{error}</p>
            <div className={s.bannerActions}>
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await refresh(selected);
                    setError(null);
                  })
                }
              >
                <RefreshCw size={13} /> Refresh
              </button>
              {hasPending && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const p = pending.current!;
                      const result = await workspaceRequest<{
                        planId?: string;
                      }>(p.path, p.body);
                      if (p.path.endsWith("/commit")) {
                        invalidatePlannerCommit();
                        onApplied();
                      }
                      pending.current = null;
                      setHasPending(false);
                      if (result.planId) choosePlan(result.planId);
                      await refresh(selected);
                      setNotice("Action acknowledged.");
                    })
                  }
                >
                  Retry same action
                </button>
              )}
            </div>
          </div>
        )}
        {notice && (
          <p role="status" className={s.banner} data-tone="accent">
            {notice}
          </p>
        )}

        <div className={s.scroll}>
          {!selected ? (
            <section className={s.intake}>
              <div className={s.intakeInner}>
                <h2 className={s.hello}>Study plan</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() => create(true));
                  }}
                  onInvalidCapture={() => {
                    if (start === "" || end === "") setFold("availability");
                  }}
                >
                  <div className={s.composer}>
                    <input
                      className={s.composerTitle}
                      aria-label="Plan name"
                      required
                      value={title}
                      maxLength={120}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Subject or exam (e.g. A-Level Physics Paper 2)"
                    />
                    <textarea
                      className={s.composerGoal}
                      aria-label="Your goal"
                      required
                      rows={3}
                      maxLength={1000}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="Syllabus topics, paper format, weak areas, or target grade…"
                    />
                    <div className={s.composerBar}>
                      <label className={`${s.chip} ${s.dateChip}`}>
                        <Calendar size={13} />
                        <span>{date ? shortDay(date) : "Deadline"}</span>
                        <input
                          type="date"
                          className={s.dateInputHidden}
                          aria-label="Deadline (optional)"
                          min={capabilities.today}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </label>
                      <label className={s.chip}>
                        <Clock size={13} />
                        <select
                          aria-label="Daily study limit"
                          value={ceiling}
                          onChange={(e) => setCeiling(Number(e.target.value))}
                        >
                          {[30, 60, 90, 120, 180, 240, 360].map((n) => (
                            <option key={n} value={n}>
                              {n}m / day
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className={s.chip}
                        data-active={fold === "availability"}
                        aria-expanded={fold === "availability"}
                        onClick={() =>
                          setFold(
                            fold === "availability" ? null : "availability"
                          )
                        }
                      >
                        Hours
                      </button>
                      <button
                        type="button"
                        className={s.chip}
                        data-active={fold === "context"}
                        aria-expanded={fold === "context"}
                        onClick={() =>
                          setFold(fold === "context" ? null : "context")
                        }
                      >
                        <ListTree size={13} /> Topics
                      </button>
                      <div className={s.composerActions}>
                        <button
                          type="button"
                          className={s.ghost}
                          disabled={busy || !title.trim() || !goal.trim()}
                          onClick={() => void run(() => create(false))}
                        >
                          Save goal
                        </button>
                        <button
                          className={`${s.primary} ${s.send}`}
                          disabled={busy || !title.trim() || !goal.trim()}
                          type="submit"
                        >
                          <span>{busy ? "Saving…" : "Continue"}</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className={s.fold} data-open={fold === "availability"}>
                    <div>
                      <div className={s.foldBody}>
                        <div className={s.pair}>
                          <label className={s.field}>
                            From
                            <input
                              type="time"
                              required
                              value={start}
                              onChange={(e) => setStart(e.target.value)}
                            />
                          </label>
                          <label className={s.field}>
                            Until
                            <input
                              type="time"
                              required
                              value={end}
                              onChange={(e) => setEnd(e.target.value)}
                            />
                          </label>
                        </div>
                        <fieldset className={s.days}>
                          <legend>Rest days · {capabilities.timezone}</legend>
                          {WEEKDAYS.map((d, i) => (
                            <label key={d} className={s.day}>
                              <input
                                type="checkbox"
                                checked={rest.includes(i)}
                                onChange={() =>
                                  setRest((old) =>
                                    old.includes(i)
                                      ? old.filter((v) => v !== i)
                                      : [...old, i]
                                  )
                                }
                              />
                              <span>{d.slice(0, 3)}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>
                    </div>
                  </div>
                  <div className={s.fold} data-open={fold === "context"}>
                    <div>
                      <div className={s.foldBody}>
                        <label className={s.field}>
                          Topics (one per line)
                          <textarea
                            rows={3}
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                            placeholder={"Kinematics\nDynamics\nSuperposition"}
                          />
                        </label>
                        <label className={s.field}>
                          Notes
                          <textarea
                            maxLength={2800}
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Weak topics, resources, or exclusions…"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </form>
                {plans.length > 0 && (
                  <section className={s.recent} aria-label="Saved plans">
                    <h3>Plans</h3>
                    <div className={s.recentRow}>
                      {plans.slice(0, 6).map((p) => (
                        <button
                          type="button"
                          key={p.planId}
                          className={s.recentCard}
                          onClick={() => {
                            if (!busy) choosePlan(p.planId);
                          }}
                        >
                          <strong>{p.title}</strong>
                          <small>{planState(p.state)}</small>
                        </button>
                      ))}
                    </div>
                    {next && (
                      <button
                        type="button"
                        className={s.textButton}
                        onClick={() => setSwitcher(true)}
                      >
                        All plans
                      </button>
                    )}
                  </section>
                )}
              </div>
            </section>
          ) : !view ? (
            <div className={s.loadingStage} role="status">
              <strong className={s.loadingTitle}>Loading…</strong>
              <div className={s.loadingTrack} aria-hidden="true">
                <div className={s.loadingBar} />
              </div>
            </div>
          ) : (
            <div className={s.column} key={view.plan.planId}>
              <div className={s.hero}>
                <div className={s.heroTop}>
                  {planBadge && (
                    <span className={s.badge} data-tone={planBadge.tone}>
                      {planBadge.tone === "good" && <Check size={11} />}
                      {planBadge.text}
                    </span>
                  )}
                  <span className={s.metaInline}>
                    {view.intent.intent.deadline.kind === "NONE"
                      ? "No deadline"
                      : `Due ${day(view.intent.intent.deadline.date)}`}
                    {minutesTotal !== null &&
                      blueprint &&
                      ` · ${minutesTotal}m · ${blueprint.activities.length} sessions`}
                  </span>
                  {view.workspace.active && displayingActive && (
                    <Link href="/quests" className={s.textButton}>
                      Quests <ArrowRight size={13} />
                    </Link>
                  )}
                </div>
                <h2>{view.plan.title}</h2>
                <p className={s.outcome} data-open={outcomeOpen}>
                  {view.intent.intent.outcome}
                </p>
                {view.intent.intent.outcome.length > 200 && (
                  <button
                    type="button"
                    className={s.textButton}
                    style={{ justifySelf: "start" }}
                    onClick={() => setOutcomeOpen(!outcomeOpen)}
                  >
                    {outcomeOpen ? "Less" : "More"}
                  </button>
                )}
              </div>

              {view.draft?.retainedFromEarlierAttempt && (
                <p className={s.notice} data-tone="accent">
                  Earlier draft retained while current run completes.
                </p>
              )}

              {view.attempt && (
                <section
                  className={
                    settled && (canConfirm || displayingActive) && attemptState === "SUCCEEDED"
                      ? s.agentCompact
                      : s.agent
                  }
                  data-live={live(view)}
                  data-tone={tone}
                  aria-label="Planning progress"
                >
                  {!(
                    settled &&
                    (canConfirm || displayingActive) &&
                    attemptState === "SUCCEEDED"
                  ) && (
                    <>
                      <div className={s.agentHead}>
                        <span className={s.agentOrb} aria-hidden="true">
                          {tone === "bad" ? (
                            <AlertCircle size={15} />
                          ) : tone === "good" ? (
                            <Check size={15} strokeWidth={2.5} />
                          ) : (
                            <i className={s.liveDot} />
                          )}
                        </span>
                        <div className={s.agentTitle}>
                          {live(view) ? (
                            <strong role="status">
                              {view.attempt.state === "QUEUED"
                                ? "Starting…"
                                : `${PLANNER_STAGES[stageIdx]}…`}
                            </strong>
                          ) : view.attempt.state === "FAILED" ? (
                            <>
                              <strong>
                                Stopped at{" "}
                                {PLANNER_STAGES[stageIdx].toLowerCase()}
                              </strong>
                              {view.attempt.error?.message && (
                                <span>{view.attempt.error.message}</span>
                              )}
                            </>
                          ) : view.attempt.state === "CANCELLED" ? (
                            <strong>Stopped</strong>
                          ) : view.attempt.state === "NEEDS_DECISION" ? (
                            <strong>
                              {journeyExpired
                                ? "Request expired"
                                : "Input needed"}
                            </strong>
                          ) : (
                            <strong>Complete</strong>
                          )}
                        </div>
                        {live(view) && (
                          <button
                            className={s.stop}
                            disabled={busy}
                            type="button"
                            onClick={() =>
                              void run(async () => {
                                await mutate(
                                  `/${selected}/operations/${view.attempt!.attemptId}`,
                                  { schemaVersion: 2, action: "CANCEL" }
                                );
                                await refresh(selected);
                              })
                            }
                          >
                            <Square size={11} /> Stop
                          </button>
                        )}
                      </div>
                      <StageRail
                        index={stageIdx}
                        live={live(view)}
                        tone={tone}
                      />
                    </>
                  )}
                  <PlanningActivity
                    key={view.attempt.attemptId}
                    planId={view.plan.planId}
                    attemptId={view.attempt.attemptId}
                    running={live(view)}
                    onStageHint={setLiveStageHint}
                    onActivityStep={handleActivityStep}
                  />
                </section>
              )}

              {journeyExpired && !live(view) && (
                <div className={s.notice} data-tone="accent">
                  <p>This request expired. Start a new planning request.</p>
                </div>
              )}

              {!journeyExpired &&
              view.research?.questions.length &&
              view.attempt?.state === "NEEDS_DECISION" ? (
                <section className={s.ask}>
                  <div>
                    <h3>Clarification needed</h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(resume);
                      }}
                    >
                      {view.research.questions.map((q) => (
                        <label key={q.ref}>
                          {q.question}
                          <small>{q.consequence}</small>
                          <textarea
                            required
                            rows={2}
                            maxLength={16000}
                            value={answers[q.ref] ?? ""}
                            onChange={(e) =>
                              setAnswers((old) => ({
                                ...old,
                                [q.ref]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="submit"
                        className={s.primary}
                        style={{ justifySelf: "start" }}
                        disabled={busy}
                      >
                        Send answers &amp; continue
                        <ArrowRight size={14} />
                      </button>
                    </form>
                  </div>
                </section>
              ) : null}

              {view.attempt?.state === "NEEDS_DECISION" &&
                !view.research?.questions.length && (
                  <div className={s.notice} data-tone="accent">
                    <strong>
                      {view.capacityDecision?.overdue.length
                        ? "Reschedule overdue tasks"
                        : view.capacityDecision?.overdueResolved
                          ? "Tasks updated"
                          : "Decision needed"}
                    </strong>
                    {view.capacityDecision?.overdueResolved ? (
                      <p>
                        {journeyExpired
                          ? "Start a new planning request."
                          : "Continue saved journey."}
                      </p>
                    ) : view.capacityDecision?.overdue.length ? (
                      <>
                        {view.capacityDecision.overdue.map((task) => (
                          <form
                            key={task.questId}
                            className={s.field}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const nextDate = placementDates[task.questId];
                              if (nextDate)
                                void run(async () => {
                                  await reschedulePlannerCommitment(
                                    task.questId,
                                    nextDate
                                  );
                                  await refresh(selected);
                                  setNotice("Task date updated.");
                                });
                            }}
                          >
                            <span>
                              {task.title} · {task.remainingMinutes}m · due{" "}
                              {day(task.date)}
                            </span>
                            {task.canReschedule ? (
                              <>
                                <label>
                                  New date for {task.title}
                                  <input
                                    type="date"
                                    min={view.capacityDecision!.today}
                                    required
                                    disabled={busy}
                                    value={placementDates[task.questId] ?? ""}
                                    onChange={(event) =>
                                      setPlacementDates((dates) => ({
                                        ...dates,
                                        [task.questId]: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <button
                                  className={s.button}
                                  type="submit"
                                  disabled={busy || !placementDates[task.questId]}
                                >
                                  Save task date
                                </button>
                              </>
                            ) : (
                              <Link
                                className={s.textButton}
                                href={
                                  task.planId
                                    ? `/planner/${task.planId}`
                                    : "/goals?tab=quests"
                                }
                              >
                                Review this work
                              </Link>
                            )}
                          </form>
                        ))}
                      </>
                    ) : (
                      <p>{view.attempt.question}</p>
                    )}
                  </div>
                )}

              {!readiness?.ready && (
                <p className={s.notice}>
                  {readiness?.reason ?? "Checking worker…"}{" "}
                  <button
                    type="button"
                    className={s.textButton}
                    onClick={() => void run(() => refresh(selected))}
                  >
                    Check again
                  </button>
                </p>
              )}

              {showContentTabs && (
                <>
                  <div
                    className={s.tabs}
                    role="tablist"
                    aria-label="Plan inspection"
                  >
                    {TABS.map((t) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        id={`planner-tab-${t}`}
                        aria-controls="planner-panel"
                        tabIndex={tab === t ? 0 : -1}
                        key={t}
                        onKeyDown={(e) => {
                          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                            e.preventDefault();
                            const target =
                              TABS[
                                (TABS.indexOf(t) +
                                  (e.key === "ArrowRight" ? 1 : TABS.length - 1)) %
                                  TABS.length
                              ];
                            setTab(target);
                            document
                              .getElementById(`planner-tab-${target}`)
                              ?.focus();
                          }
                        }}
                        onClick={() => setTab(t)}
                      >
                        {t}
                        {t === "Review" && currentIssues.length > 0 && (
                          <span>{currentIssues.length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <section
                    id="planner-panel"
                    role="tabpanel"
                    aria-labelledby={`planner-tab-${tab}`}
                    className={s.panel}
                    key={tab}
                  >
                    {tab === "Schedule" && (
                      <>
                        {!blueprint ? (
                          <div className={s.empty}>
                            <p>
                              {live(view)
                                ? "Building schedule…"
                                : "No schedule yet."}
                            </p>
                          </div>
                        ) : (
                          <>
                            {view.draft?.activitiesStrategyId !==
                              view.draft?.strategies.at(-1)?.id && (
                              <p className={s.notice} data-tone="accent">
                                These activities retain strategy version{" "}
                                {view.draft?.activitiesStrategyVersion ?? "pending"}
                                .
                              </p>
                            )}
                            {!canConfirm &&
                              !displayingActive &&
                              attemptState !== "SUCCEEDED" &&
                              view.draft?.reason && (
                                <p className={s.notice}>{view.draft.reason}</p>
                              )}
                            <PlanSchedule view={view} blueprint={blueprint} />
                          </>
                        )}
                      </>
                    )}

                    {tab === "Strategy" &&
                      (view.draft?.strategies.length ? (
                        <>
                          {view.draft.strategies.length > 1 ? (
                            <>
                              <label className={s.version}>
                                Version
                                <select
                                  onChange={(e) =>
                                    void run(async () => {
                                      const res = await workspaceRequest<{
                                        artifact: {
                                          id: string;
                                          value: {
                                            version: number;
                                            text: string;
                                          };
                                        };
                                      }>(
                                        `/workspace?planId=${view.plan.planId}&attemptId=${view.draft!.attemptId}&artifactId=${e.target.value}`
                                      );
                                      setSelectedStrategy({
                                        id: res.artifact.id,
                                        version: res.artifact.value.version,
                                        text: res.artifact.value.text,
                                      });
                                    })
                                  }
                                  value={
                                    selectedStrategy?.id ??
                                    view.draft.strategies.at(-1)!.id
                                  }
                                >
                                  {(view.draft.history.some(
                                    (h) => h.kind === "STRATEGY"
                                  )
                                    ? view.draft.history
                                        .filter((h) => h.kind === "STRATEGY")
                                        .map((h) => ({
                                          id: h.id,
                                          label: h.label,
                                        }))
                                    : view.draft.strategies.map((v) => ({
                                        id: v.id,
                                        label: `v${v.version}`,
                                      }))
                                  ).map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {(selectedStrategy
                                ? [selectedStrategy]
                                : [...view.draft.strategies].reverse()
                              ).map((v) => (
                                <article
                                  key={v.id}
                                  id={`strategy-${v.id}`}
                                  className={s.strategySurface}
                                >
                                  <StrategyText text={v.text} />
                                </article>
                              ))}
                            </>
                          ) : (
                            <article
                              id={`strategy-${view.draft.strategies[0].id}`}
                              className={s.strategySurface}
                            >
                              <StrategyText text={view.draft.strategies[0].text} />
                            </article>
                          )}
                        </>
                      ) : (
                        <div className={s.empty}>
                          <p>No strategy yet.</p>
                        </div>
                      ))}

                    {tab === "Research" &&
                      (view.research?.summary ? (
                        <div className={s.card}>
                          {Object.entries(view.research.summary)
                            .filter(([, v]) => Boolean(v && String(v).trim()))
                            .map(([k, v]) => (
                              <div key={k} className={s.summaryItem}>
                                <h3>{label(k)}</h3>
                                <p className={s.prose}>{v}</p>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className={s.empty}>
                          <p>No research summary yet.</p>
                        </div>
                      ))}

                    {tab === "Review" && (
                      <>
                        {view.draft?.reviews.map((r) => (
                          <div key={r.id} className={s.verdict}>
                            <span className={s.badge} data-tone="accent">
                              {label(r.verdict)}
                            </span>
                            <p className={s.prose}>{r.explanation}</p>
                          </div>
                        ))}
                        {view.draft?.issues.map((i) => (
                          <article
                            className={s.issue}
                            data-severity={i.severity.toLowerCase()}
                            key={i.issueId}
                          >
                            <div className={s.heroTop}>
                              <span
                                className={s.badge}
                                data-tone={
                                  ["BLOCKER", "MAJOR"].includes(i.severity)
                                    ? "bad"
                                    : "warn"
                                }
                              >
                                {label(i.severity)}
                              </span>
                              <span className={s.muted}>
                                {label(i.disposition)} · {label(i.route)}
                              </span>
                            </div>
                            <h3>{i.requirement}</h3>
                            <p>{i.offendingContent}</p>
                            <p className={s.muted}>{i.consequence}</p>
                            <details>
                              <summary>Evidence</summary>
                              <p>{i.explanation}</p>
                              {i.grounds.map((g, n) => (
                                <blockquote key={n}>{g.excerpt}</blockquote>
                              ))}
                            </details>
                          </article>
                        ))}
                        {!view.draft?.reviews.length &&
                          !view.draft?.issues.length && (
                            <div className={s.empty}>
                              <p>No review yet.</p>
                            </div>
                          )}
                      </>
                    )}

                    {tab === "Notes" && (
                      <>
                        <div className={s.messages}>
                          {view.conversation.events.map((e) => (
                            <article key={e.key} className={s.bubble}>
                              <p className={s.prose}>{e.text}</p>
                              <small>{e.response.message}</small>
                            </article>
                          ))}
                        </div>
                        <form
                          className={s.reply}
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(async () => {
                              await mutate("/workspace", {
                                action: "NOTE",
                                planId: selected,
                                key: key(),
                                text: feedback,
                                expectedConversationVersion:
                                  view.workspace.conversationVersion,
                              });
                              setFeedback("");
                              await refresh(selected);
                            });
                          }}
                        >
                          <textarea
                            aria-label="Message or feedback"
                            rows={3}
                            value={feedback}
                            maxLength={2800}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Add a note or revision instruction…"
                          />
                          <div className={s.replyBar}>
                            <details>
                              <summary className={s.textButton}>Ask AI</summary>
                              <p className={s.muted} style={{ margin: "6px 0" }}>
                                1 advice turn · leaves plan unchanged.
                              </p>
                              <button
                                type="button"
                                className={s.button}
                                disabled={
                                  busy ||
                                  !feedback.trim() ||
                                  !readiness?.ready ||
                                  live(view)
                                }
                                onClick={() =>
                                  void run(async () => {
                                    await mutate(`/${selected}/assistant`, {
                                      action: "TURN",
                                      turn: {
                                        key: key(),
                                        text: feedback,
                                        expectedConversationVersion:
                                          view.workspace.conversationVersion,
                                        readPlanIds: [selected],
                                        mode: "ADVICE",
                                        researchRequested: false,
                                      },
                                    });
                                    setFeedback("");
                                    await refresh(selected);
                                  })
                                }
                              >
                                Send question
                              </button>
                            </details>
                            <button
                              type="submit"
                              className={s.button}
                              disabled={busy || !feedback.trim()}
                            >
                              Save note
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          )}
        </div>

        {view && selected && !live(view) && (
          <footer className={s.dock} data-ready={canConfirm}>
            {canConfirm ? (
              <>
                <div className={s.dockText}>
                  <strong>Ready to add</strong>
                </div>
                <div className={s.dockActions}>
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => {
                      setConfirm(view.changeSet?.changeSetId ?? null);
                      setAck([]);
                    }}
                  >
                    Review &amp; add plan
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={s.dockText}>
                  <strong>
                    {view.workspace.active
                      ? "In Quests"
                      : "Draft saved"}
                  </strong>
                </div>
                <div className={s.dockActions}>
                  {view.attempt &&
                  view.research &&
                  !journeyExpired &&
                  ["FAILED", "CANCELLED", "NEEDS_DECISION"].includes(
                    view.attempt.state
                  ) &&
                  !view.research.questions.length ? (
                    <button
                      className={s.button}
                      type="button"
                      disabled={busy || !!view.usage?.uncertain}
                      onClick={() => void run(resume)}
                    >
                      Continue saved journey
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={s.primary}
                    disabled={!canStart}
                    onClick={() =>
                      void run(async () => {
                        if (view.attempt?.state === "NEEDS_DECISION") {
                          await mutate(
                            `/${selected}/operations/${view.attempt.attemptId}`,
                            { schemaVersion: 2, action: "CANCEL" }
                          );
                          await refresh(selected);
                        }
                        setAuthorize(!authorize);
                        if (feedback.trim()) setNotes(feedback);
                        setConsent(false);
                      })
                    }
                  >
                    {view.attempt ? "New planning request" : "Start planning"}
                  </button>
                </div>
              </>
            )}
          </footer>
        )}

        {view && inspector && (
          <div
            className={`${s.overlay} ${s.drawerWrap}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setInspector(false);
            }}
          >
            <aside
              className={`${s.sheet} ${s.drawer}`}
              role="dialog"
              aria-modal="true"
              aria-label="Plan details and history"
            >
              <div className={s.sheetHead}>
                <div>
                  <h3>Details</h3>
                  <p>
                    {view.intent.intent.availability?.timezone ??
                      capabilities.timezone}{" "}
                    ·{" "}
                    {view.intent.intent.deadline.kind === "NONE"
                      ? "No deadline"
                      : day(view.intent.intent.deadline.date)}
                  </p>
                </div>
                <button
                  type="button"
                  className={s.icon}
                  aria-label="Close details"
                  onClick={() => setInspector(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className={s.sheetBody}>
                <div className={s.modalRow}>
                  <div className={s.modalRowInline}>
                    <span className={s.muted}>
                      Rest:{" "}
                      {view.intent.intent.availability?.restWeekdays
                        .map((i) => WEEKDAYS[i].slice(0, 3))
                        .join(", ") || "None"}
                    </span>
                    <button
                      type="button"
                      className={s.button}
                      disabled={busy || live(view)}
                      onClick={() => setEditing(!editing)}
                    >
                      {editing ? "Close editor" : "Edit goal & schedule"}
                    </button>
                  </div>
                  {editing && (
                    <AcceptedDetailsEditor
                      intent={clarifiedIntent ?? view.intent.intent}
                      busy={busy}
                      onCancel={() => setEditing(false)}
                      onSave={async (intent) => {
                        if (
                          view.attempt?.state === "NEEDS_DECISION" &&
                          !journeyExpired
                        ) {
                          setClarifiedIntent(intent);
                          setEditing(false);
                          setNotice("Details queued with your answers.");
                          return;
                        }
                        await workspaceRequest(
                          `/${selected}`,
                          {
                            schemaVersion: 2,
                            expectedPlanningVersion:
                              view.workspace.planningVersion,
                            expectedIntentVersionId:
                              view.intent.intentVersionId,
                            intent,
                          },
                          undefined,
                          "PATCH"
                        );
                        setEditing(false);
                        await refresh(selected);
                      }}
                    />
                  )}
                </div>

                {view.usage && (
                  <div className={s.modalRow}>
                    <div className={s.usageCompact}>
                      <span>
                        <strong>
                          ${view.usage.estimatedCostUsd.toFixed(3)}
                        </strong>{" "}
                        spent
                      </span>
                      <span>·</span>
                      <span>{view.usage.calls} calls</span>
                      <span>·</span>
                      <span>
                        {(
                          view.usage.inputTokens + view.usage.outputTokens
                        ).toLocaleString()}{" "}
                        tokens
                      </span>
                    </div>
                    {view.usage.uncertain && (
                      <p className={s.muted}>
                        Spending unsettled. Wait before starting another run.
                      </p>
                    )}
                  </div>
                )}

                {(view.attemptHistory.length > 0 ||
                  (historical?.history ?? view.draft?.history)?.length) && (
                  <details className={s.limitsDisclosure}>
                    <summary>Technical log</summary>
                    <div className={s.techStack}>
                      {view.attemptHistory.length > 0 && (
                        <label className={s.field}>
                          Run
                          <select
                            value={
                              historical?.attemptId ??
                              view.draft?.attemptId ??
                              view.attempt?.attemptId
                            }
                            onChange={(e) =>
                              void run(async () => {
                                const attemptId = e.target.value;
                                const response = await workspaceRequest<{
                                  history: {
                                    id: string;
                                    kind: string;
                                    label: string;
                                  }[];
                                }>(
                                  `/workspace?planId=${selected}&attemptId=${attemptId}&history=true`
                                );
                                setHistorical({
                                  attemptId,
                                  history: response.history,
                                });
                                setHistory(null);
                              })
                            }
                          >
                            {view.attemptHistory.map((a) => (
                              <option key={a.attemptId} value={a.attemptId}>
                                {new Date(a.at).toLocaleString()} ·{" "}
                                {label(a.state)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {(historical?.history ?? view.draft?.history)?.map((h) => (
                        <button
                          type="button"
                          key={h.id}
                          className={s.history}
                          onClick={() =>
                            void run(async () =>
                              setHistory(
                                await workspaceRequest(
                                  `/workspace?planId=${selected}&attemptId=${historical?.attemptId ?? view.draft?.attemptId ?? view.attempt!.attemptId}&artifactId=${h.id}`
                                )
                              )
                            )
                          }
                        >
                          {h.label}
                          <ArrowRight size={13} />
                        </button>
                      ))}
                      {history !== null && (
                        <pre className={s.raw}>
                          {JSON.stringify(history, null, 2)}
                        </pre>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </aside>
          </div>
        )}

        {view && authorize && (
          <div
            className={s.overlay}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAuthorize();
            }}
          >
            <section
              className={`${s.sheet} ${s.sheetCompact}`}
              role="dialog"
              aria-modal="true"
              aria-label="Generate plan"
            >
              <div className={s.sheetHead}>
                <div>
                  <h3>Generate plan</h3>
                </div>
                <button
                  type="button"
                  className={s.icon}
                  aria-label="Close"
                  onClick={closeAuthorize}
                >
                  <X size={16} />
                </button>
              </div>
              <div className={s.sheetBody}>
                <div className={s.modalRow}>
                  <div className={s.modalRowInline}>
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={research}
                        onChange={(e) => setResearch(e.target.checked)}
                        disabled={live(view)}
                      />
                      <span>Web search</span>
                    </label>
                    {research && (
                      <label className={s.uploadPill}>
                        <Upload size={13} /> Attach PDF / TXT
                        <input
                          type="file"
                          accept="application/pdf,text/plain,.pdf,.txt"
                          disabled={busy || live(view)}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void run(async () => {
                              if (file.size > 3 * 1024 * 1024)
                                throw new Error(
                                  "Choose a document smaller than 3 MB."
                                );
                              const form = new FormData();
                              form.set("key", key());
                              form.set("title", file.name);
                              form.set("file", file);
                              const saved = await mutate<{
                                documentId: string;
                                title: string;
                              }>(`/${selected}/documents`, form);
                              setDocuments((old) => [...old, saved]);
                            });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {research && allDocuments.length > 0 && (
                    <div className={s.docList}>
                      {allDocuments.map((d) => (
                        <label className={s.check} key={d.documentId}>
                          <input
                            type="checkbox"
                            checked={documents.some(
                              (v) => v.documentId === d.documentId
                            )}
                            onChange={() =>
                              setDocuments((old) =>
                                old.some((v) => v.documentId === d.documentId)
                                  ? old.filter(
                                      (v) => v.documentId !== d.documentId
                                    )
                                  : [...old, d]
                              )
                            }
                          />
                          <span>
                            <FileText size={12} /> {d.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {view.attempt !== null && (
                  <label className={`${s.field} ${s.modalRow}`}>
                    Changes or focus (optional)
                    <textarea
                      rows={2}
                      value={notes}
                      maxLength={2800}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What to adjust…"
                    />
                  </label>
                )}

                <div className={s.modalRow}>
                  <label className={s.spendRow}>
                    <span>Maximum AI spend (USD)</span>
                    <input
                      type="number"
                      min="0.01"
                      max={STUDENT_SPENDING_LIMIT_USD}
                      step="0.01"
                      value={spendingLimitUsd}
                      onChange={(e) => {
                        setSpendingLimitUsd(Number(e.target.value));
                        setConsent(false);
                      }}
                      disabled={busy}
                    />
                  </label>
                  <details className={s.limitsDisclosure}>
                    <summary>AI settings &amp; limits</summary>
                    <p>DeepSeek · max 48 calls · 4h window.</p>
                  </details>
                </div>

                <label className={`${s.check} ${s.consentFlat}`}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I authorize DeepSeek within this spend limit.
                  </span>
                </label>
              </div>
              <div className={s.sheetFoot}>
                <button
                  type="button"
                  className={s.ghost}
                  onClick={closeAuthorize}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={s.primary}
                  disabled={
                    busy ||
                    !consent ||
                    spendingLimitUsd <= 0 ||
                    spendingLimitUsd > STUDENT_SPENDING_LIMIT_USD
                  }
                  onClick={() => void run(generate)}
                >
                  Authorize &amp; begin
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          </div>
        )}

        {view &&
          confirm === view.changeSet?.changeSetId &&
          canConfirm &&
          view.changeSet && (
            <div
              className={s.overlay}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setConfirm(null);
              }}
            >
              <section
                className={`${s.sheet} ${s.sheetCompact}`}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm plan changes"
              >
                <div className={s.sheetHead}>
                  <div>
                    <h3>Add to Quests?</h3>
                    <p>
                      {view.changeSet.entries.length}{" "}
                      {view.changeSet.entries.length === 1
                        ? "session"
                        : "sessions"}{" "}
                      · {view.changeSet.aggregate.committedTargetMinutes}m total
                    </p>
                  </div>
                  <button
                    type="button"
                    className={s.icon}
                    aria-label="Close"
                    onClick={() => setConfirm(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className={s.sheetBody}>
                  <details className={s.limitsDisclosure}>
                    <summary>Preview sessions</summary>
                    <div className={s.changes}>
                      {view.changeSet.entries.map((e) => (
                        <article className={s.change} key={e.activityKey}>
                          <strong>{e.reason || e.changes.map(label).join(", ")}</strong>
                          {e.after && (
                            <p className={s.muted}>
                              {day(e.after.date)} ·{" "}
                              {e.after.remainingMinutesEstimate}m
                            </p>
                          )}
                          {!e.after && e.before && (
                            <p className={s.muted}>
                              Removed ({day(e.before.date)})
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </details>
                  {view.changeSet.quality.issues
                    .filter((i) =>
                      view.changeSet!.quality.requiredAcknowledgements.includes(
                        i.issueId
                      )
                    )
                    .map((i) => (
                      <label
                        className={`${s.check} ${s.consentFlat}`}
                        key={i.issueId}
                      >
                        <input
                          type="checkbox"
                          checked={ack.includes(i.issueId)}
                          onChange={() =>
                            setAck((old) =>
                              old.includes(i.issueId)
                                ? old.filter((a) => a !== i.issueId)
                                : [...old, i.issueId]
                            )
                          }
                        />
                        <span>
                          {i.evidence} {i.consequence}
                        </span>
                      </label>
                    ))}
                </div>
                <div className={s.sheetFoot}>
                  <button
                    type="button"
                    className={s.ghost}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={s.primary}
                    disabled={
                      busy ||
                      view.changeSet.quality.issues.some(
                        (i) =>
                          view.changeSet!.quality.requiredAcknowledgements.includes(
                            i.issueId
                          ) && !ack.includes(i.issueId)
                      )
                    }
                    onClick={() =>
                      void run(async () => {
                        await mutate(`/${selected}/commit`, {
                          schemaVersion: 2,
                          attemptId: view.attempt!.attemptId,
                          changeSetId: view.changeSet!.changeSetId,
                          acknowledgements: ack,
                        });
                        invalidatePlannerCommit();
                        setConfirm(null);
                        await refresh(selected);
                        onApplied();
                        setNotice("Plan added to Quests.");
                      })
                    }
                  >
                    Confirm &amp; add plan
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </section>
            </div>
          )}
      </div>
    </div>
  );
}
