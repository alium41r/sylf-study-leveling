"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IntakeView } from "@/lib/planner/intake/actions";
import { useIntakeSession } from "./useIntake";
import ScopeEditor from "./ScopeEditor";
import ScopeReview from "./ScopeReview";
import SourcePanel from "./SourcePanel";
import WeeklyBudgetControl from "./WeeklyBudgetControl";
import AvailabilityControl from "./AvailabilityControl";
import PlanBriefPanel, { type BriefField } from "./PlanBriefPanel";
import BackgroundCurriculumControl from "./BackgroundCurriculumControl";
import PlannerCopilot from "../copilot/PlannerCopilot";
import OverlapReview from "./OverlapReview";
import PreparednessMatrix from "./PreparednessMatrix";
import GenerationPanel from "./GenerationPanel";
import type { ScopeSync } from "@/lib/planner/intake/scope-sync";
import { ACADEMIC_LEVELS, EXAM_BOARDS } from "@/lib/study-systems";
import { Sparkles, Edit3, ChevronDown, ChevronUp, X } from "lucide-react";
import base from "../ExamPlanner.module.css";
import copilotStyles from "../copilot/copilot.module.css";
import s from "./quick-plan.module.css";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

/**
 * Quick Plan — Guided 3-Step Flow with Unified Sylf Assistant.
 *
 * Reorganized into:
 * 1. What are you planning? (Goal, Date, optional Subject)
 * 2. What should Sylf cover? (Primary syllabus action, Upload/Paste/Enter, Board & Level, Scope review or recovery)
 * 3. How much time do you have? (Weekly presets, custom, normal schedule, weekday preview, Customize days)
 *
 * Followed by:
 * - Make it sharper (optional): Background curriculum & Preparedness
 * - Compact "Your plan" summary (PlanBriefPanel)
 * - Warning acknowledgements & Sticky Generate (GenerationPanel)
 *
 * Dual Entry UX:
 * - [ Design it with Sylf ]: opens/focuses conversational assistant
 * - [ Set it up yourself ]: focuses guided form
 * Both edit the single canonical server-held PlanBrief.
 */

const COPY = {
  EXAM: {
    heading: "What are you preparing for?",
    goalLabel: "Exam or goal",
    goalPlaceholder: "Biology mock exam",
    goalHint: "The exam or assessment itself — \u201cCAIE A-Level Physics 9702\u201d or \u201cBiology mock exam\u201d.",
    dateLabel: "Exam date",
    lede: "Give Sylf the essentials and it can draft your exam plan now. Everything else can be refined later.",
  },
  ROADMAP: {
    heading: "What are you planning?",
    goalLabel: "Course or goal",
    goalPlaceholder: "A-level Chemistry, full syllabus",
    goalHint: "The whole course or qualification you want to get through.",
    dateLabel: "Finish by",
    lede: "Give Sylf the essentials and it can draft a roadmap now. Milestones and pacing come from what you tell it here.",
  },
  MASTERY: {
    heading: "What do you want to master?",
    goalLabel: "Unit or chapter",
    goalPlaceholder: "Photosynthesis",
    goalHint:
      "ONE chapter or topic — not a range. Put the chapters themselves in step 2 and Sylf will expand them.",
    dateLabel: "Finish by",
    lede: "Give Sylf the essentials and it can draft the progression now — understand, recall, practise, review, then one check.",
  },
} as const;

const MISSING_LABEL: Record<string, string> = {
  GOAL_MISSING: "What you are preparing for",
  SCOPE_MISSING: "What you need to cover",
  SCOPE_UNCONFIRMED: "Confirm the scope",
  TARGET_DATE_MISSING: "The date it has to be done by",
  CAPACITY_MISSING: "How much time you can give each week",
};

export default function QuickPlan({
  mode,
  onAdvanced,
  onQuotaRefresh,
  onSwitchMode,
  prefill,
  handoff,
}: {
  handoff?: SylviePlannerHandoff;
  mode: IntakeView["mode"];
  /** Switch to the existing detailed setup ("Fine-tune first"). */
  onAdvanced: () => void;
  onQuotaRefresh?: () => void;
  onSwitchMode?: (mode: "EXAM" | "ROADMAP" | "MASTERY") => void;
  prefill?: {
    goal?: string;
    subject?: string;
    targetDate?: string;
    weeklyHours?: number;
  };
}) {
  const copy = COPY[mode];
  const session = useIntakeSession(mode, {
    onQuotaRefresh,
    ...(handoff?.kind === "NEW_PLAN" ? { clientKey: `sylvie_${handoff.id}` } : {}),
  });
  const view = session.view;

  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [showSubject, setShowSubject] = useState(false);
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  const [acceptedWarnings, setAcceptedWarnings] = useState<string[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [manualScopeOpen, setManualScopeOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);
  const [copilotNotice, setCopilotNotice] = useState("");
  const [isAssistantOpen, setIsAssistantOpen] = useState(Boolean(handoff));
  const [desktopAssistant, setDesktopAssistant] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const closeAssistant = () => { if (!assistantBusy) setIsAssistantOpen(false); };

  useEffect(() => {
    const resize = () => setDesktopAssistant(window.innerWidth >= 1024);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Replanning must name an existing plan; a new empty brief cannot stand in for it.
  const handoffRequest = handoff && (handoff.kind === "NEW_PLAN" || view?.planId) ? handoff : undefined;

  const sylfInputRef = useRef<HTMLInputElement | null>(null);
  const hydrated = useRef(false);
  const prefillApplied = useRef(false);

  // Restore fields from brief on hydrate or prefill
  useEffect(() => {
    if (!view || hydrated.current) return;
    hydrated.current = true;
    const initialGoal = view.brief.goal.title || prefill?.goal || "";
    setGoal(initialGoal);
    const sub = view.brief.subject.name ?? prefill?.subject ?? "";
    setSubject(sub);
    if (sub.trim().length > 0) setShowSubject(true);
    const initialDate = view.brief.target.examDate ?? view.brief.target.endDate ?? prefill?.targetDate ?? "";
    setDate(initialDate);

    // Apply prefill if server brief is empty
    if (prefill && !prefillApplied.current) {
      prefillApplied.current = true;
      if (!view.brief.goal.title && prefill.goal) {
        void session.act({ action: "setGoal", title: prefill.goal });
      }
      if (!view.brief.subject.name && prefill.subject) {
        void session.act({ action: "setSubject", subjectId: null, name: prefill.subject });
      }
      if (!(view.brief.target.examDate ?? view.brief.target.endDate) && prefill.targetDate) {
        void session.act({
          action: "setTargetDate",
          endDate: prefill.targetDate,
          ...(mode === "EXAM" ? { examDate: prefill.targetDate } : {}),
        });
      }
      if (prefill.weeklyHours && !view.brief.budget.weeklyMinutes) {
        void session.act({
          action: "setWeeklyBudget",
          weeklyMinutes: prefill.weeklyHours * 60,
        });
      }
    }
  }, [view, prefill, session, mode]);

  // Handle escape key to close assistant drawer / sheet
  useEffect(() => {
    if (!isAssistantOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAssistantOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAssistantOpen]);

  const act = session.act;
  const commitGoal = () => {
    const title = goal.trim();
    if (!view || !title || title === view.brief.goal.title) return;
    void act({ action: "setGoal", title });
  };
  const commitSubject = () => {
    const name = subject.trim();
    if (!view || name === (view.brief.subject.name ?? "")) return;
    void act({ action: "setSubject", subjectId: null, name: name || null });
  };
  const commitDate = () => {
    if (!view || !date || date === (view.brief.target.examDate ?? view.brief.target.endDate)) return;
    void act({
      action: "setTargetDate",
      endDate: date,
      ...(mode === "EXAM" ? { examDate: date } : {}),
    });
  };
  const commitScope = (sync: ScopeSync) => {
    void act({
      action: "updateScopeUnits",
      ...(sync.add.length ? { add: sync.add } : {}),
      ...(sync.remove.length ? { remove: sync.remove } : {}),
      ...(sync.rename.length ? { rename: sync.rename } : {}),
    });
  };

  const focusField = useCallback(
    (field: BriefField) => {
      if (field === "days") setCustomDaysOpen(true);
      if (field === "subject") setShowSubject(true);
      if (field === "preparedness") {
        const panel = document.getElementById("quick-plan-preparedness");
        const details = panel?.closest("details");
        if (details) details.open = true;
        panel?.scrollIntoView({ block: "center" });
        panel?.focus();
        return;
      }
      const id = {
        goal: "quick-plan-goal",
        subject: "quick-plan-subject",
        target: "quick-plan-date",
        scope: "quick-plan-scope",
        budget: "quick-plan-budget",
      }[field as Exclude<BriefField, "days" | "preparedness">];
      const element = document.getElementById(id);
      element?.scrollIntoView({ block: "center" });
      element?.focus();
    },
    []
  );

  const scopeCandidate = view?.brief.scopeCandidate ?? null;
  const reviewableCandidate = scopeCandidate !== null && scopeCandidate.nodes.length > 0;

  const missingLabels = useMemo(
    () => (view?.readiness.missing ?? []).map((code) => MISSING_LABEL[code] ?? code),
    [view]
  );
  const question = view?.questions[0];
  const distribution = view?.brief.budget.distribution?.dailyMinutes ?? null;

  const handleCopilotRoute = (
    route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE",
    _request: unknown,
    summary: string
  ) => {
    if (route === "RESEARCH") void session.findSyllabus();
    else if (route === "COMPARISON") void session.compareCurricula({ force: true });
    else setCopilotNotice(summary);
  };

  const handleCopilotPrerequisite = (prerequisite: string) => {
    if (prerequisite === "GOAL_REQUIRED") focusField("goal");
    else if (prerequisite === "CONFIRMED_SCOPE_REQUIRED") focusField("scope");
    else if (prerequisite === "BACKGROUND_CURRICULUM_REQUIRED") {
      const element = document.getElementById("quick-plan-background-label");
      element?.scrollIntoView({ block: "center" });
      element?.focus();
    } else {
      const element = document.getElementById("quick-plan-generate");
      element?.scrollIntoView({ block: "center" });
      element?.focus();
    }
  };

  return (
    <section className={`${base.root} ${s.surface}`} aria-label="Quick Plan">
      {handoff && (
        <details className="my-3 rounded-2xl border border-border-subtle bg-surface-2 p-4 text-text-primary">
          <summary className="text-text-secondary cursor-pointer">Request from your conversation</summary>
          <p className="text-text-primary whitespace-pre-wrap">{handoff.request}</p>
        </details>
      )}
      {handoff?.kind === "REPLAN" && view && !view.planId && (
        <div className="my-3 rounded-2xl border border-border-subtle bg-surface-2 p-4 text-text-primary" role="status">
          <p className="text-text-primary">Your request: {handoff.request}</p>
          <p className="text-text-secondary">Choose the saved plan to adjust. Its review controls will show a proposal before you apply changes.</p>
          <button type="button" onClick={onAdvanced} className="text-accent-text-light underline">Open saved plans</button>
        </div>
      )}
      {/* Compact Header with On-Demand Assistant trigger */}
      <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-white/[0.08]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
            {copy.heading}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            if (assistantBusy) return;
            setIsAssistantOpen((open) => !open);
            setTimeout(() => sylfInputRef.current?.focus(), 150);
          }}
          aria-label={isAssistantOpen ? "Close Sylf Assistant" : "Ask Sylf Assistant"}
          aria-expanded={isAssistantOpen}
          disabled={assistantBusy}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-['Rajdhani'] uppercase tracking-wider transition-all active:scale-95 ${
            isAssistantOpen
              ? "border-accent-primary bg-accent-primary/20 text-accent-text-light shadow-[0_0_12px_rgba(124,58,237,0.3)]"
              : "border-white/10 bg-white/[0.03] text-text-secondary hover:text-text-primary hover:bg-white/[0.08]"
          }`}
        >
          <Sparkles className="w-4 h-4 text-violet-300" />
          <span>{isAssistantOpen ? "Close Sylf" : "Ask Sylf"}</span>
        </button>
      </div>

      {!view ? (
        <div className="py-12 text-center">
          <p role="status" aria-live="polite" className="text-sm text-text-secondary">
            {session.restoring ? "Restoring your brief…" : session.notice || "Preparing your brief…"}
          </p>
          {!session.restoring && (
            <button
              type="button"
              onClick={() => void session.reload()}
              className="mt-4 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary hover:bg-white/[0.08]"
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <>
          {copilotNotice && (
            <div className={s.banner} role="status">
              <p>{copilotNotice}</p>
            </div>
          )}

          {session.notice && (
            <div className={`${s.banner} ${session.expired || session.staleAction ? s.bannerWarn : ""}`} role="status">
              <p>{session.notice}</p>
              <div className={base.actions}>
                {session.staleAction && (
                  <button type="button" onClick={() => void session.reapplyStale()}>
                    Apply my last change again
                  </button>
                )}
                {session.expired && (
                  <button type="button" onClick={() => void session.startFresh()}>
                    Start a new brief
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Full-width Workspace Container */}
          <div className="w-full max-w-4xl mx-auto">
            {/* STEP 1: Goal & target date */}
            <div className={s.stepCard}>
              <div className={s.stepHeader}>
                <span className={s.stepNumber}>1</span>
                <h3 className={s.stepTitle}>Goal &amp; timeline</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={s.field}>
                  <div className="flex items-center justify-between">
                    <label htmlFor="quick-plan-goal">{copy.goalLabel}</label>
                    {!goal.trim() && <span className={s.requiredBadge}>Required</span>}
                  </div>
                  <input
                    id="quick-plan-goal"
                    type="text"
                    value={goal}
                    maxLength={200}
                    placeholder={copy.goalPlaceholder}
                    disabled={session.busy}
                    onChange={(event) => setGoal(event.target.value)}
                    onBlur={commitGoal}
                  />
                  <small>{copy.goalHint}</small>
                </div>

                <div className={s.field}>
                  <label htmlFor="quick-plan-subject">
                    Subject <span className={s.optional}>(optional)</span>
                  </label>
                  <input
                    id="quick-plan-subject"
                    type="text"
                    value={subject}
                    maxLength={200}
                    placeholder="e.g. Biology, Chemistry"
                    disabled={session.busy}
                    onChange={(event) => setSubject(event.target.value)}
                    onBlur={commitSubject}
                  />
                </div>

                <div className={s.field}>
                  <div className="flex items-center justify-between">
                    <label htmlFor="quick-plan-date">{copy.dateLabel}</label>
                    {!date && <span className={s.requiredBadge}>Required</span>}
                  </div>
                  <input
                    id="quick-plan-date"
                    type="date"
                    value={date}
                    disabled={session.busy}
                    onChange={(event) => setDate(event.target.value)}
                    onBlur={commitDate}
                  />
                </div>
              </div>
            </div>

          {/* STEP 2: What should Sylf cover? */}
          <div id="quick-plan-scope-step" className={s.stepCard}>
            <div className={s.stepHeader}>
              <span className={s.stepNumber}>2</span>
              <h3 className={s.stepTitle}>What should Sylf cover?</h3>
            </div>

            {/* Candidate Review card (when units exist to review) */}
            {scopeCandidate && reviewableCandidate ? (
              <section className={base.card} aria-label="Scope Sylf found">
                <ScopeReview
                  nodes={scopeCandidate.nodes}
                  sources={scopeCandidate.sources}
                  summary={scopeCandidate.summary}
                  openQuestions={scopeCandidate.openQuestions}
                  partial={session.importReport?.partial}
                  partialReason={session.importReport?.partialReason ?? null}
                  pages={session.importReport?.pages}
                  status={scopeCandidate.status}
                  coverage={scopeCandidate.coverage}
                  evidence={scopeCandidate.evidence}
                  busy={session.busy || session.researching}
                  onConfirm={(result) =>
                    void session.confirmCandidate({
                      nodeIds: result.nodeIds,
                      renames: result.renames,
                      additions: result.additions,
                    })
                  }
                  onDiscard={() => void session.discardCandidate()}
                  onShowSources={(sourceIds) => setHighlightedSources(sourceIds)}
                />
                <SourcePanel
                  sources={scopeCandidate.sources}
                  highlighted={highlightedSources}
                  emptyMessage={
                    scopeCandidate.origin === "PASTE"
                      ? "You pasted this scope yourself, so there is no public source to cite."
                      : "No public source was used for this scope."
                  }
                />
              </section>
            ) : (
              <>
                {/* Search result explanation if search was empty/failed (preserves recovery path!) */}
                {scopeCandidate && (
                  <section className={`${base.card} mb-4`} aria-label="What Sylf found">
                    <p className={s.hint} role="status" aria-live="polite">
                      {scopeCandidate.summary}
                    </p>
                    {scopeCandidate.openQuestions.length > 0 && (
                      <ul className={s.openQuestions} aria-label="Open questions">
                        {scopeCandidate.openQuestions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    )}
                    <SourcePanel
                      sources={scopeCandidate.sources}
                      highlighted={highlightedSources}
                      emptyMessage="No public source was used for this scope."
                    />
                  </section>
                )}

                {/* The four ways in, each named and explained.
                    Four bare verbs in a row is not a question a student can answer. Three of
                    them are alternative *sources*; the fourth is a *permission* that switches
                    searching off; and the manual editor that used to sit far below the list was
                    the fourth source that nobody could tell was one. So each way in gets a row,
                    a number, and one sentence saying what will happen if you pick it. */}
                <p className={s.hint}>
                  Pick one way in. Nothing is searched, read or used until you confirm it.
                </p>

                {/* ── 1 · Look it up ───────────────────────────────────────────── */}
                <div className={s.pathRow}>
                  <div className={s.pathHead}>
                    <div className={s.pathBody}>
                      <p className={s.pathName}>1 · Look it up</p>
                      <p className={s.hint}>
                        Sylf searches for the official syllabus, reads it, and shows you what it
                        found — with its sources — before any of it is used.
                      </p>
                    </div>
                    <button
                      className={`${s.choice} ${base.primary}`}
                      type="button"
                      disabled={session.busy || session.researching || view.brief.researchPolicy === "OFF"}
                      onClick={() => void session.findSyllabus()}
                    >
                      {session.researching ? "Looking…" : "Find syllabus"}
                    </button>
                  </div>

                  {/**
                   * Board and level live *inside* this way in, because this is the only one they
                   * affect: they are how Sylf decides a page belongs to the exam board rather
                   * than merely mentioning it. Moved away from the row of source buttons they
                   * looked like a fifth source; moved to Advanced setup they were invisible to
                   * the one path that needs them.
                   */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div className={s.field}>
                      <label htmlFor="quick-plan-board">Exam board or system (optional)</label>
                      <select
                        id="quick-plan-board"
                        value={view.brief.backgroundCurriculum?.board ?? ""}
                        disabled={session.busy}
                        onChange={(event) =>
                          void act({
                            action: "setBackground",
                            label: view.brief.backgroundCurriculum?.label ?? (view.brief.goal.title.trim() || null),
                            board: event.target.value || null,
                            level: view.brief.backgroundCurriculum?.level ?? null,
                          })
                        }
                      >
                        <option value="">Not sure / other</option>
                        {EXAM_BOARDS.map((board) => (
                          <option key={board.value} value={board.value}>
                            {board.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={s.field}>
                      <label htmlFor="quick-plan-level">Academic level</label>
                      <select
                        id="quick-plan-level"
                        value={view.brief.backgroundCurriculum?.level ?? ""}
                        disabled={session.busy}
                        onChange={(event) =>
                          void act({
                            action: "setBackground",
                            label: view.brief.backgroundCurriculum?.label ?? (view.brief.goal.title.trim() || null),
                            board: view.brief.backgroundCurriculum?.board ?? null,
                            level: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Level not set</option>
                        {ACADEMIC_LEVELS.map((level) => (
                          <option key={level.value} value={level.value}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <small>
                    Both are optional and both are worth setting. This is how Sylf tells which
                    sources are actually the exam board&rsquo;s own rather than merely plausible
                    ones — without it a search still runs, it just will not call anything official.
                  </small>
                  <p className={s.hint} role="status" aria-live="polite">
                    {session.researching
                      ? "Looking for an official syllabus…"
                      : "Nothing is looked up until you press Find syllabus."}
                  </p>
                </div>

                {/* ── 2 · Upload it ────────────────────────────────────────────── */}
                <div className={s.pathRow}>
                  <div className={s.pathHead}>
                    <div className={s.pathBody}>
                      <p className={s.pathName}>2 · Upload it</p>
                      <p className={s.hint}>
                        Have the syllabus already? A PDF, or a photo of the contents page — Sylf
                        reads it and lists the units.
                      </p>
                    </div>
                    <label className={s.choice} htmlFor="quick-plan-upload">
                      Upload a syllabus
                      <input
                        id="quick-plan-upload"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        disabled={session.busy || session.researching}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          // Clearing the input lets the same file be chosen again after a
                          // failure, which is the common case for a rejected upload.
                          event.target.value = "";
                          if (file) void session.uploadSyllabus(file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* ── 3 · Paste it ─────────────────────────────────────────────── */}
                <div className={s.pathRow}>
                  <div className={s.pathHead}>
                    <div className={s.pathBody}>
                      <p className={s.pathName}>3 · Paste it</p>
                      <p className={s.hint}>
                        Copy a contents list from anywhere — a school website, a PDF, a
                        teacher&rsquo;s sheet — and paste it in. One unit per line.
                      </p>
                    </div>
                    <button
                      className={s.choice}
                      type="button"
                      aria-expanded={pasteOpen}
                      disabled={session.busy || session.researching}
                      onClick={() => setPasteOpen((open) => !open)}
                    >
                      Paste an outline
                    </button>
                  </div>

                  {pasteOpen && (
                    <div className={`${s.field} mt-3`}>
                      <label htmlFor="quick-plan-paste">
                        <span>Paste your syllabus or contents page</span>
                      </label>
                      <textarea
                        id="quick-plan-paste"
                        rows={6}
                        value={pastedText}
                        disabled={session.busy || session.researching}
                        onChange={(event) => setPastedText(event.target.value)}
                      />
                      <div className={base.actions}>
                        <button
                          className={base.primary}
                          type="button"
                          disabled={session.busy || session.researching || pastedText.trim().length === 0}
                          onClick={() => {
                            void session.pasteScope(pastedText, "PASTE");
                            setPastedText("");
                            setPasteOpen(false);
                          }}
                        >
                          Read this outline
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 4 · Type it ─────────────────────────────────────────────── */}
                <div className={s.pathRow}>
                  <p className={s.pathName}>4 · Type it yourself</p>
                  <p className={s.hint}>
                    Don&rsquo;t type ten chapter names from memory — type the range and Sylf will
                    expand it into one unit per chapter.
                  </p>
                  <ScopeEditor
                    nodes={view.brief.scope.nodes}
                    units={view.summary.units}
                    leaves={view.summary.leaves}
                    strategy={view.summary.strategy}
                    disabled={session.busy}
                    onSave={commitScope}
                  />
                </div>

                {/**
                 * Not a source: a permission.
                 *
                 * Kept out of the numbered list on purpose. It was the fourth button in a row
                 * of four, so it read as a way of supplying a scope rather than as the switch
                 * that stops Sylf looking one up — and a student who pressed it to "use only
                 * what I give you" would then wonder why the search box had stopped working.
                 */}
                <div className={s.pathPermission}>
                  {view.brief.researchPolicy === "OFF" ? (
                    <p className={s.hint}>
                      You asked Sylf to use only what you give it, so nothing is looked up.{" "}
                      <button
                        type="button"
                        disabled={session.busy}
                        onClick={() => void session.setResearchPolicy("ALLOW")}
                      >
                        Allow a search again
                      </button>
                    </p>
                  ) : (
                    <>
                      <button
                        className={s.choice}
                        type="button"
                        disabled={session.busy || session.researching}
                        onClick={() => void session.setResearchPolicy("OFF")}
                      >
                        Use only what I give you
                      </button>
                      <p className={s.hint}>
                        Stops Sylf searching anything. Pick this if you would rather supply
                        everything yourself.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* STEP 3: How much time do you have? */}
          <div className={s.stepCard}>
            <div className={s.stepHeader}>
              <span className={s.stepNumber}>3</span>
              <h3 className={s.stepTitle}>How much time do you have?</h3>
            </div>

            <WeeklyBudgetControl
              weeklyMinutes={view.brief.budget.weeklyMinutes}
              distribution={distribution}
              distributionNote={view.brief.budget.distribution?.note ?? null}
              hardWeeklyLimitMinutes={view.limits.weeklyLimitMinutes}
              scheduleWeeklyMinutes={view.scheduleWeeklyMinutes}
              disabled={session.busy}
              onSetWeekly={(weeklyMinutes) => void act({ action: "setWeeklyBudget", weeklyMinutes })}
            />

            {/* Customize Days (Secondary disclosure) */}
            <details
              className={`${base.card} mt-4`}
              open={customDaysOpen}
              onToggle={(event) => setCustomDaysOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <strong>Customize days</strong>
              </summary>
              <AvailabilityControl
                dailyOverrides={view.brief.budget.dailyOverrides}
                restWeekdays={view.restWeekdays}
                hardUnavailableWeekdays={view.brief.constraints
                  .filter((constraint) => constraint.kind === "UNAVAILABLE_WEEKDAY")
                  .map((constraint) => constraint.value)}
                blockedDates={view.brief.budget.blockedDates}
                distribution={distribution}
                disabled={session.busy}
                onSetDailyOverrides={(dailyOverrides) =>
                  void act({ action: "setDailyOverrides", dailyOverrides })
                }
                onMarkWeekday={(weekday, unavailable) =>
                  void act({ action: "markUnavailableDay", weekday, unavailable })
                }
                onMarkDate={(blockedDate, unavailable) =>
                  void act({ action: "markUnavailableDay", date: blockedDate, unavailable })
                }
              />
            </details>
          </div>

          {/* MAKE IT SHARPER (optional disclosure) */}
          <details className={s.makeSharperSection}>
            <summary className={s.makeSharperSummary}>
              <div className="flex items-center gap-2">
                <span className="font-bold font-['Rajdhani'] uppercase tracking-wider text-sm text-text-primary">
                  Make it sharper (optional)
                </span>
                <span className="text-xs text-text-muted">— Background curriculum & prior knowledge</span>
              </div>
              <ChevronDown className="w-4 h-4 text-text-muted" />
            </summary>

            <div className={s.makeSharperContent}>
              <BackgroundCurriculumControl
                background={view.brief.backgroundCurriculum}
                comparisonAvailable={view.comparison.available}
                comparisonReason={view.comparison.unavailableReason}
                hasComparison={view.comparison.state === "READY"}
                comparisonStale={view.comparison.stale}
                busy={session.busy || session.comparing}
                onSave={(input) => void session.saveBackground(input)}
                onCompare={(options) => void session.compareCurricula(options)}
              />

              {view.brief.backgroundCurriculum && view.comparison.state !== "NOT_RUN" && (
                <OverlapReview
                  comparison={view.comparison}
                  nodes={view.brief.scope.nodes}
                  busy={session.busy || session.comparing}
                  onCorrect={(unitRef, overlap, clear) =>
                    void session.correctOverlap(unitRef, overlap, clear)
                  }
                  onApplySuggestion={(nodeIds) => void session.applyCoverageSuggestion(nodeIds)}
                  onCompare={(options) => void session.compareCurricula(options)}
                  onShowSources={(sourceIds) => setHighlightedSources(sourceIds)}
                />
              )}

              <div id="quick-plan-preparedness" tabIndex={-1} aria-label="Preparedness">
                <PreparednessMatrix
                  nodes={view.brief.scope.nodes}
                  preparedness={view.brief.preparedness}
                  ready={view.brief.scope.confirmedAt !== null && view.summary.units > 0}
                  busy={session.busy}
                  onSetState={(nodeIds, st) => void session.setPreparednessState(nodeIds, st)}
                  onSetDifficult={(nodeIds, diff) => void session.setDifficult(nodeIds, diff)}
                  onSetPriority={(nodeIds, prio) => void session.setPriority(nodeIds, prio)}
                  onClear={(nodeIds) => void session.clearPreparedness(nodeIds)}
                  onOpened={session.notePreparednessOpened}
                />
              </div>

              {question && (
                <fieldset className={base.card}>
                  <legend>{question.prompt}</legend>
                  <p className={base.muted}>{question.whyItMatters}</p>
                  {question.options.map((option) => (
                    <label className={base.check} key={option.value}>
                      <input
                        type="radio"
                        name={`quick-plan-${question.reasonCode}`}
                        value={option.value}
                        disabled={session.busy}
                        checked={false}
                        onChange={() =>
                          void act({
                            action: "answerSmartQuestion",
                            reasonCode: question.reasonCode as never,
                            value: option.value,
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                  <p className={base.muted}>
                    Skipping changes nothing: Sylf keeps its own default for this.
                  </p>
                </fieldset>
              )}
            </div>
          </details>

          {/* Compact Plan Summary (PlanBriefPanel) */}
          <PlanBriefPanel
            view={view}
            onEdit={focusField}
            scheduleWeeklyMinutes={view.scheduleWeeklyMinutes}
          />

          {/* Warnings & Sticky Generation Panel */}
          <div className={s.stickyGenerateArea}>
            <GenerationPanel
              readiness={view.readiness.summary}
              canGenerate={view.readiness.canGenerate}
              missingLabels={missingLabels}
              generation={session.generation}
              busy={session.busy}
              onGenerate={() => void session.generate()}
              onCancel={() => session.cancelGeneration()}
              onConfirm={(options) => void session.confirm(options)}
              onFineTune={onAdvanced}
              advancedAvailable
              warnings={view.warnings}
              acceptedWarnings={acceptedWarnings}
              onAcceptWarning={(code, accepted) => {
                const next = accepted
                  ? [...new Set([...acceptedWarnings, code])]
                  : acceptedWarnings.filter((entry) => entry !== code);
                setAcceptedWarnings(next);
                session.noteWarningsAccepted(next.length);
              }}
            />
          </div>

          <p className={`${base.muted} text-center mt-3`}>
            Prefer the detailed setup?{" "}
            <button type="button" onClick={onAdvanced} className="underline text-violet-400">
              Open Advanced setup
            </button>{" "}
            — it asks for everything, and nothing is created until you confirm a draft.
          </p>
        </div>

        {/* One assistant instance preserves its request and reply across viewport changes. */}
        {isAssistantOpen && (
          <>
            <div
              className={desktopAssistant ? "fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity" : copilotStyles.mobileBackdrop}
              onClick={closeAssistant}
              aria-hidden="true"
            />
            <aside
              className={desktopAssistant
                ? "fixed top-0 right-0 h-full w-[420px] max-w-[90vw] z-50 bg-bg-card border-l border-border-subtle shadow-[-12px_0_36px_rgba(0,0,0,0.5)] flex flex-col"
                : copilotStyles.mobileSheet}
              role="dialog"
              aria-modal="true"
              aria-label="Sylf Assistant"
            >
              {desktopAssistant ? (
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent-primary" />
                    <span className="font-['Rajdhani'] font-bold text-sm uppercase tracking-wider text-text-primary">Sylf Assistant</span>
                  </div>
                  <button
                    type="button"
                    onClick={closeAssistant}
                    disabled={assistantBusy}
                    aria-label="Close assistant"
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-shadow transition-colors"
                  ><X className="w-4 h-4" /></button>
                </div>
              ) : <div className={copilotStyles.sheetHandleBar} />}
              <div className="flex-1 min-h-0">
                <PlannerCopilot
                  initialRequest={handoffRequest}
                  onBusyChange={setAssistantBusy}
                  view={view}
                  lifecycle={view.planId ? view.readiness.canGenerate ? "DRAFT_REVIEW" : "PRE_GENERATION" : "PRE_GENERATION"}
                  onView={(next) => {
                    setGoal(next.brief.goal.title);
                    setSubject(next.brief.subject.name ?? "");
                    setDate(next.brief.target.examDate ?? next.brief.target.endDate ?? "");
                    void session.reload();
                  }}
                  onRoute={handleCopilotRoute}
                  onPrerequisite={handleCopilotPrerequisite}
                  onViewRefresh={() => void session.reload()}
                  onSwitchMode={onSwitchMode}
                  isMobileSheet={!desktopAssistant}
                  onCloseMobile={closeAssistant}
                  inputRef={sylfInputRef}
                />
              </div>
            </aside>
          </>
        )}
        <div className="lg:hidden">
          <button
            type="button"
            className={copilotStyles.mobileFab}
            onClick={() => { setIsAssistantOpen(true); setTimeout(() => sylfInputRef.current?.focus(), 150); }}
            aria-label="Open Sylf Assistant"
          >
            <Sparkles className="w-4 h-4 text-accent-primary" />
            <span>Sylf</span>
          </button>
        </div>
        </>
      )}
    </section>
  );
}
