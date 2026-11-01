"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Plus,
  RefreshCw,
  Search,
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
} from "@/lib/planner/v2/client/transport";
import type { PlannerCapabilities } from "@/lib/planner/transport";
import { invalidatePlannerCommit } from "@/lib/planner/client";
import {
  DailyQuotaIcon,
  DeadlineIcon,
  FocusClockIcon,
  ObjectiveTargetIcon,
  QuestEmblemIcon,
  ReviewSealIcon,
  SubjectGrimoireIcon,
  SylvieIcon,
  SystemInsightsIcon,
  SystemWarningIcon,
} from "@/app/components/icons";
import AcceptedDetailsEditor from "./AcceptedDetailsEditor";
import PlanningActivity from "./PlanningActivity";
import PlanSchedule from "./PlanSchedule";
import StageRail from "./StageRail";
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
const planState = (state: string) =>
  state === "ACTIVE"
    ? "Active plan"
    : state === "ARCHIVED"
      ? "Archived"
      : "Draft";
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
function stageIndex(view: StudentWorkspace) {
  if (
    view.workspace.candidate?.attemptId === view.attempt?.attemptId ||
    (view.draft?.stage === "READY" && !view.draft.retainedFromEarlierAttempt)
  )
    return 5;
  if (view.draft?.retainedFromEarlierAttempt) return 0;
  const stage = view.draft?.stage;
  return stage === "STRATEGY"
    ? 1
    : stage === "TRANSLATION"
      ? 2
      : stage === "ALLOCATION"
        ? 3
        : stage === "REVIEW" || stage === "REFINEMENT"
          ? 4
          : 0;
}
const live = (view: StudentWorkspace | null) =>
  !!view?.attempt && ["QUEUED", "RUNNING"].includes(view.attempt.state);
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
  const [tab, setTab] = useState("Plan"),
    [spendingLimitUsd, setSpendingLimitUsd] = useState(
      STUDENT_SPENDING_LIMIT_USD
    ),
    [authorize, setAuthorize] = useState(false),
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
  const [start, setStart] = useState("17:00"),
    [end, setEnd] = useState("19:00"),
    [ceiling, setCeiling] = useState(90),
    [rest, setRest] = useState(() => plannerRestDays(capabilities.restDays)),
    [research, setResearch] = useState(false),
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
    }, 4000);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [selected, view, refresh]);
  function choosePlan(id: string | null) {
    if (id !== null && selection.current === id) return;
    selection.current = id;
    setSelected(id);
    onPlanSelected?.(id);
    setView(null);
    setDocuments([]);
    setAnswers({});
    setAuthorize(false);
    setConfirm(null);
    setAck([]);
    setHistory(null);
    setSelectedStrategy(null);
    setHistorical(null);
    setEditing(false);
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
        recoveryPercent: 10,
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
        preferredTimeboxMinutes: 25,
        maximumTimeboxMinutes: 60,
      },
      assumptions: [],
      unresolvedQuestions: [],
    });
  }
  async function create() {
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
    choosePlan(result.planId);
    setNotes("");
    setNotice(
      "Goal saved. Add any materials, then review the AI authorization to begin."
    );
    await refresh(null);
  }
  async function generate() {
    if (!view || !consent) return;
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
  const stageIdx = view ? stageIndex(view) : 0;
  const settled = !!view && !live(view);
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
        ? ({ text: "Active plan", tone: "good" } as const)
        : ({
            text: "Draft update · Active plan unchanged",
            tone: "accent",
          } as const)
      : ({ text: "Unconfirmed draft", tone: "neutral" } as const);
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
    !(journeyExpired && view.attempt?.state === "NEEDS_DECISION") &&
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
            <span className={s.badge}>Preview</span>
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
            <span>{view?.plan.title ?? "Your plans"}</span>
            <ChevronDown size={14} />
          </button>
          {view && (
            <button
              type="button"
              className={s.ghost}
              onClick={() => setInspector(true)}
            >
              <SystemInsightsIcon size={16} /> Details
            </button>
          )}
          {selected && (
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={resetIntake}
            >
              <Plus size={16} /> New plan
            </button>
          )}
        </header>
        {switcher && (
          <>
            <button
              type="button"
              className={s.popScrim}
              aria-label="Close plan switcher"
              onClick={() => setSwitcher(false)}
            />
            <div className={s.pop} role="dialog" aria-label="Your plans">
              <input
                autoFocus
                className={s.popSearch}
                aria-label="Search plans"
                placeholder="Search plans…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <nav className={s.popList}>
                {loading ? (
                  <p className={s.popEmpty} role="status">
                    Loading saved plans…
                  </p>
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
                  Load older plans
                </button>
              )}
              <button
                type="button"
                className={s.popNew}
                disabled={busy}
                onClick={resetIntake}
              >
                <Plus size={15} /> New plan
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
                <RefreshCw size={14} /> Refresh saved work
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
                      setNotice("The original action was acknowledged.");
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
            <SylvieIcon size={16} /> {notice}
          </p>
        )}
        <div className={s.scroll}>
          {!selected ? (
            <section className={s.intake}>
              <div className={s.intakeInner}>
                <span className={s.emblem}>
                  <SylvieIcon size={30} />
                </span>
                <h2 className={s.hello}>What would you like to learn?</h2>
                <p className={s.lede}>
                  Describe your goal. Sylf researches, schedules and drafts a
                  plan you review before it’s added.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(create);
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
                      placeholder="Chemistry mock exam"
                    />
                    <textarea
                      className={s.composerGoal}
                      aria-label="Your goal"
                      required
                      rows={3}
                      maxLength={1000}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="What are you preparing for? What would success look like?"
                    />
                    <div className={s.composerBar}>
                      <label className={`${s.chip} ${s.dateChip}`}>
                        <DeadlineIcon size={14} />
                        <span>{date ? date : "Deadline"}</span>
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
                        <DailyQuotaIcon size={14} />
                        <select
                          aria-label="Daily study limit"
                          value={ceiling}
                          onChange={(e) => setCeiling(Number(e.target.value))}
                        >
                          {[30, 60, 90, 120, 180, 240, 360].map((n) => (
                            <option key={n} value={n}>
                              {n} min / day
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
                        <FocusClockIcon size={14} /> Availability
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
                        <SubjectGrimoireIcon size={14} /> Context
                      </button>
                      <button
                        className={`${s.primary} ${s.send}`}
                        disabled={busy || !title.trim() || !goal.trim()}
                        type="submit"
                        aria-label="Save goal & continue"
                      >
                        <span>{busy ? "Saving…" : "Save goal"}</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  <div className={s.fold} data-open={fold === "availability"}>
                    <div>
                      <div className={s.foldBody}>
                        <div className={s.pair}>
                          <label className={s.field}>
                            Study window starts
                            <input
                              type="time"
                              required
                              value={start}
                              onChange={(e) => setStart(e.target.value)}
                            />
                          </label>
                          <label className={s.field}>
                            Ends
                            <input
                              type="time"
                              required
                              value={end}
                              onChange={(e) => setEnd(e.target.value)}
                            />
                          </label>
                        </div>
                        <fieldset className={s.days}>
                          <legend>Rest days</legend>
                          {WEEKDAYS.map((day, i) => (
                            <label key={day} className={s.day}>
                              <input
                                type="checkbox"
                                checked={rest.includes(i)}
                                onChange={() =>
                                  setRest((old) =>
                                    old.includes(i)
                                      ? old.filter((d) => d !== i)
                                      : [...old, i]
                                  )
                                }
                              />
                              <span>{day.slice(0, 3)}</span>
                            </label>
                          ))}
                        </fieldset>
                        <p className={s.muted}>
                          {capabilities.timezone} · Applies on non-rest days.
                          Calendar commitments and a 10% recovery margin also
                          reduce availability.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className={s.fold} data-open={fold === "context"}>
                    <div>
                      <div className={s.foldBody}>
                        <label className={s.field}>
                          <span>
                            Topics{" "}
                            <span className={s.muted}>
                              (one per line; optional)
                            </span>
                          </span>
                          <textarea
                            rows={3}
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                            placeholder={"Stoichiometry\nEquilibrium"}
                          />
                        </label>
                        <label className={s.field}>
                          Student context &amp; instructions
                          <textarea
                            maxLength={2800}
                            rows={4}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Your weaknesses, prior knowledge, resource access, exclusions or other constraints."
                          />
                        </label>
                        <p className={s.muted}>
                          Starts as a general learning goal. You can accept a
                          formal exam identity in plan details.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className={s.fine}>Saving your goal makes no AI calls.</p>
                </form>
                {plans.length > 0 && (
                  <section className={s.recent} aria-label="Saved plans">
                    <h3>Recent plans</h3>
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
                          <div className={s.recentCardTop}>
                            <SubjectGrimoireIcon
                              size={13}
                              className={s.recentCardIcon}
                            />
                            <small>{planState(p.state)}</small>
                          </div>
                          <strong>{p.title}</strong>
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
              <span className={s.loadingEmblem}>
                <SylvieIcon size={34} />
              </span>
              <strong className={s.loadingTitle}>
                Opening your saved plan
              </strong>
              <p className={s.loadingSub}>
                Loading research, strategy and calendar schedule…
              </p>
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
                      {planBadge.tone === "good" && <CheckCircle2 size={12} />}
                      {planBadge.text}
                    </span>
                  )}
                  {view.workspace.active && displayingActive && (
                    <Link href="/quests" className={s.textButton}>
                      Open study quests <ArrowRight size={14} />
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
                    {outcomeOpen ? "Show less" : "Show more"}
                  </button>
                )}
                <div className={s.meta}>
                  <span className={s.metaItem}>
                    <DeadlineIcon size={14} />
                    {view.intent.intent.deadline.kind === "NONE"
                      ? "No fixed deadline"
                      : `Deadline ${day(view.intent.intent.deadline.date)}`}
                  </span>
                  <span className={s.metaItem}>
                    <FocusClockIcon size={14} />
                    {view.intent.intent.availability?.timezone ??
                      capabilities.timezone}
                  </span>
                  <span className={s.metaItem}>
                    <ObjectiveTargetIcon size={14} />
                    {label(view.intent.intent.policy)} goal
                  </span>
                  {minutesTotal !== null && blueprint && (
                    <span className={s.metaItem}>
                      <QuestEmblemIcon size={14} />
                      {minutesTotal} min · {blueprint.activities.length}{" "}
                      activities
                    </span>
                  )}
                </div>
              </div>
              {view.draft?.retainedFromEarlierAttempt && (
                <p className={s.notice} data-tone="accent">
                  Retained draft from the earlier linked attempt. Its research
                  and calendar evidence are historical; the current continuation
                  must revalidate and review any reused work.
                </p>
              )}
              {view.attempt && (
                <section
                  className={s.agent}
                  data-live={live(view)}
                  data-tone={tone}
                  aria-label="Planning progress"
                >
                  <div className={s.agentHead}>
                    <span className={s.agentOrb}>
                      {tone === "bad" ? (
                        <SystemWarningIcon size={18} />
                      ) : tone === "good" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <SylvieIcon size={20} />
                      )}
                    </span>
                    <div className={s.agentTitle}>
                      {live(view) ? (
                        <>
                          <strong role="status">
                            {view.attempt.state === "QUEUED"
                              ? "Waiting for the Planner worker"
                              : `Working on ${label(view.draft?.stage ?? view.attempt.stage)}`}
                          </strong>
                          <span>
                            Progress is saved. You can leave and come back.
                          </span>
                        </>
                      ) : view.attempt.state === "FAILED" ? (
                        <>
                          <strong>
                            Planning stopped at {label(view.attempt.stage)}
                          </strong>
                          <span>{view.attempt.error?.message}</span>
                        </>
                      ) : view.attempt.state === "CANCELLED" ? (
                        <>
                          <strong>Planning stopped</strong>
                          <span>
                            Planning was stopped. Saved artifacts and any
                            reported usage are retained.
                          </span>
                        </>
                      ) : view.attempt.state === "NEEDS_DECISION" ? (
                        <>
                          <strong>Waiting for you</strong>
                          <span>Saved progress is retained.</span>
                        </>
                      ) : (
                        <>
                          <strong>Planning complete</strong>
                          <span>
                            Every stage below was recorded as it happened.
                          </span>
                        </>
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
                        <Square size={12} /> Stop
                      </button>
                    )}
                  </div>
                  <StageRail index={stageIdx} live={live(view)} tone={tone} />
                  {view.attempt.state === "FAILED" && (
                    <p className={s.stageNote}>
                      Drafts are retained. Nothing was added to your plan.
                    </p>
                  )}
                  <PlanningActivity
                    key={view.attempt.attemptId}
                    planId={view.plan.planId}
                    attemptId={view.attempt.attemptId}
                    running={live(view)}
                  />
                </section>
              )}
              {journeyExpired && !live(view) && (
                <div className={s.notice} data-tone="accent">
                  <p>
                    This planning request has expired. Your saved work and usage
                    are retained. Start a new authorized request to plan again.
                  </p>
                  {view.attempt?.state === "NEEDS_DECISION" && (
                    <button
                      type="button"
                      className={s.button}
                      disabled={busy}
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
                      Close expired request
                    </button>
                  )}
                </div>
              )}
              {!journeyExpired &&
              view.research?.questions.length &&
              view.attempt?.state === "NEEDS_DECISION" ? (
                <section className={s.ask}>
                  <span className={s.askGlyph}>
                    <SylvieIcon size={18} />
                  </span>
                  <div>
                    <h3>A few details before we continue</h3>
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
                      <p className={s.muted}>
                        Answers stay linked to this request and its original
                        resource limits and deadline. Use Plan details below to
                        accept any changed hard facts before starting a new
                        request.
                      </p>
                      <button
                        type="submit"
                        className={s.primary}
                        style={{ justifySelf: "start" }}
                        disabled={busy}
                      >
                        Send answers &amp; continue
                        <ArrowRight size={16} />
                      </button>
                    </form>
                  </div>
                </section>
              ) : null}
              {view.attempt?.state === "NEEDS_DECISION" &&
                !view.research?.questions.length && (
                  <div className={s.notice} data-tone="accent">
                    <strong>Your decision is needed</strong>
                    <p>{view.attempt.question}</p>
                    <p>
                      Inspect the draft and Plan details. Accept any changed
                      goal or availability there, then continue the saved
                      journey under its original limits.
                    </p>
                  </div>
                )}
              {!readiness?.ready && (
                <p className={s.notice}>
                  {readiness?.reason ?? "Checking the Planner worker…"}{" "}
                  <button
                    type="button"
                    className={s.textButton}
                    onClick={() => void run(() => refresh(selected))}
                  >
                    Check again
                  </button>
                </p>
              )}
              <div
                className={s.tabs}
                role="tablist"
                aria-label="Plan inspection"
              >
                {["Plan", "Strategy", "Research", "Review", "Conversation"].map(
                  (t) => (
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
                          const all = [
                              "Plan",
                              "Strategy",
                              "Research",
                              "Review",
                              "Conversation",
                            ],
                            target =
                              all[
                                (all.indexOf(t) +
                                  (e.key === "ArrowRight" ? 1 : 4)) %
                                  5
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
                  )
                )}
              </div>
              <section
                id="planner-panel"
                role="tabpanel"
                aria-labelledby={`planner-tab-${tab}`}
                className={s.panel}
                key={tab}
              >
                {tab === "Plan" && (
                  <>
                    {!blueprint ? (
                      <div className={s.empty}>
                        <SubjectGrimoireIcon size={28} />
                        <h3>
                          {live(view)
                            ? "Your learning plan is taking shape"
                            : "Ready when you are"}
                        </h3>
                        <p>
                          {view.attempt
                            ? "Any strategy or partial work is available in the other tabs. The activities have not been translated yet."
                            : "Review your accepted details, then start planning. Sylf will ask before it uses any sources."}
                        </p>
                      </div>
                    ) : (
                      <>
                        {view.draft?.activitiesStrategyId !==
                          view.draft?.strategies.at(-1)?.id && (
                          <p className={s.notice} data-tone="accent">
                            These activities retain strategy version{" "}
                            {view.draft?.activitiesStrategyVersion ?? "pending"}
                            . The newest natural strategy is still awaiting
                            faithful translation and revalidation.
                          </p>
                        )}
                        {!canConfirm && !displayingActive && (
                          <p className={s.notice}>
                            Draft for inspection. {view.draft?.reason} Approval
                            and currentness are required before these activities
                            can become executable.
                          </p>
                        )}
                        <PlanSchedule view={view} blueprint={blueprint} />
                      </>
                    )}
                  </>
                )}
                {tab === "Strategy" &&
                  (view.draft?.strategies.length ? (
                    <>
                      <label className={s.version}>
                        Strategy version
                        <select
                          onChange={(e) =>
                            void run(async () => {
                              const selected = await workspaceRequest<{
                                artifact: {
                                  id: string;
                                  value: { version: number; text: string };
                                };
                              }>(
                                `/workspace?planId=${view.plan.planId}&attemptId=${view.draft!.attemptId}&artifactId=${e.target.value}`
                              );
                              setSelectedStrategy({
                                id: selected.artifact.id,
                                version: selected.artifact.value.version,
                                text: selected.artifact.value.text,
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
                                .map((h) => ({ id: h.id, label: h.label }))
                            : view.draft.strategies.map((v) => ({
                                id: v.id,
                                label: `Strategy ${v.version}`,
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
                      ).map((v, i) => (
                        <details
                          key={v.id}
                          id={`strategy-${v.id}`}
                          className={s.details}
                          open={i === 0}
                        >
                          <summary>
                            Natural strategy · version {v.version}
                          </summary>
                          <article className={s.article}>{v.text}</article>
                        </details>
                      ))}
                    </>
                  ) : (
                    <div className={s.empty}>
                      <FileText size={28} />
                      <h3>No strategy yet</h3>
                      <p>
                        The strategist receives the verified research and real
                        calendar capacity before writing.
                      </p>
                    </div>
                  ))}
                {tab === "Research" &&
                  (view.research?.summary ? (
                    <>
                      {Object.entries(view.research.summary).map(([k, v]) => (
                        <section key={k} className={s.card}>
                          <h3>{label(k)}</h3>
                          <p className={s.prose}>{v}</p>
                        </section>
                      ))}
                      <p className={s.muted}>
                        Research summaries distinguish reported knowledge,
                        demonstrated evidence and uncertainty. Full source,
                        verification and capacity artifacts are available in
                        History.
                      </p>
                    </>
                  ) : (
                    <div className={s.empty}>
                      <Search size={28} />
                      <p>Research context will appear here as it is saved.</p>
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
                          <summary>Reviewer evidence &amp; explanation</summary>
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
                          <ReviewSealIcon size={28} />
                          <h3>Independent review comes next</h3>
                          <p>
                            Drafts stay visible even if review requests changes
                            or cannot finish. A review pass is not a guarantee
                            of educational correctness.
                          </p>
                        </div>
                      )}
                  </>
                )}
                {tab === "Conversation" && (
                  <>
                    <p className={s.muted}>
                      Your notes and feedback are saved here. Research asks
                      consequential questions above. Saving a note makes no AI
                      call and changes no accepted hard facts.
                    </p>
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
                        placeholder="What should Sylf understand or change?"
                      />
                      <div className={s.replyBar}>
                        <details>
                          <summary className={s.textButton}>
                            Ask Sylf about this goal
                          </summary>
                          <p className={s.muted} style={{ margin: "8px 0" }}>
                            This uses a paid AI advice turn through your
                            existing account allowance. Advice cannot start
                            planning, change accepted facts or add activities.
                            Use Save feedback for a free note.
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
                            Authorize AI advice &amp; send
                          </button>
                        </details>
                        <button
                          type="submit"
                          className={s.button}
                          disabled={busy || !feedback.trim()}
                        >
                          Save feedback
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
        {view && selected && !live(view) && (
          <footer className={s.dock} data-ready={canConfirm}>
            {canConfirm ? (
              <>
                <div className={s.dockText}>
                  <strong>Ready for your confirmation</strong>
                  <p>
                    Review the activities and changes before adding them to
                    Sylf.
                  </p>
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
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={s.dockText}>
                  <strong>
                    {view.workspace.active
                      ? "Your active plan is protected"
                      : "Your draft stays separate"}
                  </strong>
                  <p>
                    {view.attempt
                      ? "Inspect the saved work, or start a new authorized request."
                      : "You choose when AI planning starts."}
                  </p>
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
                    onClick={() => {
                      setAuthorize(!authorize);
                      if (feedback.trim()) setNotes(feedback);
                      setConsent(false);
                    }}
                  >
                    <SylvieIcon size={16} />
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
                  <h3>Plan details</h3>
                  <p>
                    {view.intent.intent.availability?.timezone ??
                      capabilities.timezone}{" "}
                    ·{" "}
                    {view.intent.intent.deadline.kind === "NONE"
                      ? "No fixed deadline"
                      : `Deadline ${view.intent.intent.deadline.date}`}{" "}
                    · {label(view.intent.intent.policy)} goal
                  </p>
                </div>
                <button
                  type="button"
                  className={s.icon}
                  aria-label="Close details"
                  onClick={() => setInspector(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className={s.sheetBody}>
                <div className={s.box}>
                  <p>
                    Rest days:{" "}
                    {view.intent.intent.availability?.restWeekdays
                      .map((i) => WEEKDAYS[i])
                      .join(", ") || "None accepted"}
                    . Account rest days and Calendar commitments also apply.
                  </p>
                  <details>
                    <summary className={s.boxTitle}>
                      Edit accepted details
                    </summary>
                    <p className={s.muted} style={{ margin: "8px 0" }}>
                      Accept changes to your goal, deadline or study windows
                      explicitly. During clarification these details travel with
                      your answers; otherwise a new intent invalidates affected
                      drafts.
                    </p>
                    <button
                      type="button"
                      className={s.button}
                      disabled={busy || live(view)}
                      onClick={() => setEditing(!editing)}
                    >
                      Edit details
                    </button>
                    {editing && (
                      <AcceptedDetailsEditor
                        intent={clarifiedIntent ?? view.intent.intent}
                        busy={busy}
                        onCancel={() => setEditing(false)}
                        onSave={async (intent) => {
                          if (view.attempt?.state === "NEEDS_DECISION") {
                            setClarifiedIntent(intent);
                            setEditing(false);
                            setNotice(
                              "Updated details are ready to accept together with your answers."
                            );
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
                  </details>
                </div>
                <h3>History &amp; usage</h3>
                <p className={s.muted}>
                  Saved immutable artifacts are read-only. Currentness and
                  permission are checked again at confirmation.
                </p>
                {view.usage && (
                  <>
                    <div className={s.usage}>
                      <div>
                        <strong>{view.usage.calls}</strong>
                        <span>recorded calls</span>
                      </div>
                      <div>
                        <strong>
                          ${view.usage.estimatedCostUsd.toFixed(6)}
                        </strong>
                        <span>known estimated cost</span>
                      </div>
                      <div>
                        <strong>
                          {view.usage.inputTokens.toLocaleString()}
                        </strong>
                        <span>input</span>
                      </div>
                      <div>
                        <strong>
                          {view.usage.outputTokens.toLocaleString()}
                        </strong>
                        <span>completion tokens (reasoning included)</span>
                      </div>
                    </div>
                    <p className={s.muted}>
                      {view.usage.reasoningTokens !== null
                        ? `${view.usage.reasoningTokens.toLocaleString()} reasoning`
                        : "Reasoning breakdown unavailable"}
                      {view.usage.unknownCosts
                        ? ` · ${view.usage.unknownCosts} records with unknown costs`
                        : ""}
                      .
                      {view.usage.uncertain &&
                        " Spending may be unsettled. Do not repeat provider requests."}
                    </p>
                  </>
                )}
                {view.attemptHistory.length > 0 && (
                  <label className={s.field}>
                    Previous planning requests
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
                          {new Date(a.at).toLocaleString()} · {label(a.state)}
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
                  <details open>
                    <summary className={s.boxTitle}>Selected artifact</summary>
                    <pre className={s.raw}>
                      {JSON.stringify(history, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className={s.sheetFoot} />
            </aside>
          </div>
        )}
        {view && authorize && (
          <div
            className={s.overlay}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAuthorize(false);
            }}
          >
            <section
              className={s.sheet}
              role="dialog"
              aria-modal="true"
              aria-label="AI planning authorization"
            >
              <div className={s.sheetHead}>
                <div>
                  <h3>Start this AI planning request?</h3>
                  <p>
                    Research, strategy, translation and independent review may
                    make multiple paid provider calls, including substantive
                    refinements. This preview uses DeepSeek Flash with High
                    reasoning for strategy and review, Low for research and
                    translation; up to 65,536 completion tokens per role call.
                    This request has a ${spendingLimitUsd.toFixed(2)} spending
                    ceiling.
                  </p>
                </div>
                <button
                  type="button"
                  className={s.icon}
                  aria-label="Close"
                  onClick={() => setAuthorize(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className={s.sheetBody}>
                <div className={s.box}>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={research}
                      onChange={(e) => setResearch(e.target.checked)}
                      disabled={live(view)}
                    />
                    <span>
                      Allow web research and reading the materials I select for
                      the next request
                    </span>
                  </label>
                  {research && (
                    <>
                      <label className={s.upload}>
                        <Upload size={16} /> Add PDF or text (up to 3 MB)
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
                            <FileText size={14} /> {d.title}
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
                <label className={s.field}>
                  Instructions for this request
                  <textarea
                    rows={3}
                    value={notes}
                    maxLength={2800}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <details className={s.box}>
                  <summary className={s.boxTitle}>Resource safeguards</summary>
                  <label className={s.field}>
                    Maximum AI spend (USD)
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
                  <p>
                    One financial root: up to 48 model calls, 3,000,000 input
                    units and 700,000 completion tokens within four hours, with
                    resources reserved for translation and review. External
                    research has its own finite limits. These are operational
                    ceilings, not expected usage. The dollar ceiling includes
                    reserved model calls and research, and follows linked
                    continuations. Account entitlements and provider billing
                    still apply. Uncertain spending blocks further paid
                    requests.
                  </p>
                </details>
                <label className={`${s.check} ${s.consent}`}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I authorize this new AI request with the accepted goal,
                    selected materials, research permission and resource
                    safeguards shown here.
                  </span>
                </label>
              </div>
              <div className={s.sheetFoot}>
                <button
                  type="button"
                  className={s.ghost}
                  onClick={() => setAuthorize(false)}
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
                  <ArrowRight size={16} />
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
                className={s.sheet}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm plan changes"
              >
                <div className={s.sheetHead}>
                  <div>
                    <h3>Add this reviewed plan to Sylf?</h3>
                    <p>
                      {view.changeSet.aggregate.committedTargetMinutes} study
                      minutes. {view.changeSet.entries.length} changes. This can
                      replace eligible unstarted work; running and protected
                      work retain their execution guarantees.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={s.icon}
                    aria-label="Close"
                    onClick={() => setConfirm(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className={s.sheetBody}>
                  <details className={s.box} open>
                    <summary className={s.boxTitle}>Exact changes</summary>
                    <div className={s.changes}>
                      {view.changeSet.entries.map((e) => (
                        <article className={s.change} key={e.activityKey}>
                          <strong>{e.changes.map(label).join(", ")}</strong>
                          <p>{e.reason}</p>
                          {e.before && (
                            <p className={s.muted}>
                              Before: {e.before.date} ·{" "}
                              {e.before.remainingMinutesEstimate} minutes
                              remaining
                            </p>
                          )}
                          {e.after && (
                            <p className={s.muted}>
                              After: {e.after.date} ·{" "}
                              {e.after.remainingMinutesEstimate} minutes
                              remaining ({e.after.timezone})
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
                        className={`${s.check} ${s.consent}`}
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
                    Not yet
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
                        setNotice(
                          "Your plan is active. Its quests are ready in Sylf."
                        );
                      })
                    }
                  >
                    Confirm &amp; add plan
                    <CheckCircle2 size={16} />
                  </button>
                </div>
              </section>
            </div>
          )}
      </div>
    </div>
  );
}
