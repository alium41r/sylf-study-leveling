"use client";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  Sliders,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import ExamPlanner from "./ExamPlanner";
import MasteryPlanner from "./MasteryPlanner";
import RoadmapPlanner from "./RoadmapPlanner";
import QuickPlan from "./quick-plan/QuickPlan";
import type { PlannerCapabilities } from "@/lib/planner/transport";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import s from "./ExamPlanner.module.css";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

type Mode = "EXAM" | "ROADMAP" | "MASTERY";

const MODE_META: Record<
  Mode,
  {
    title: string;
    badge: string;
    icon: typeof Target;
    accentColor: string;
    iconBg: string;
    iconBorder: string;
  }
> = {
  EXAM: {
    title: "Exam Planner",
    badge: "Day-by-Day Sprint",
    icon: Target,
    accentColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    iconBorder: "border-violet-500/30",
  },
  ROADMAP: {
    title: "Course / Syllabus Roadmap",
    badge: "",
    icon: BookOpen,
    accentColor: "text-sky-400",
    iconBg: "bg-sky-500/10",
    iconBorder: "border-sky-500/30",
  },
  MASTERY: {
    title: "Chapter / Unit Mastery",
    badge: "Deep Progression",
    icon: GraduationCap,
    accentColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    iconBorder: "border-emerald-500/30",
  },
};

/**
 * The single Planner Modes entry point.
 *
 * It owns the outcome-based mode choice (PRD FR-01). After that the default is Quick
 * Plan — give Sylf the essentials, read the brief, generate. The original detailed
 * wizard still exists, unchanged, as **Advanced setup**: it is an equal way in for a
 * student who wants to specify everything, never a toll gate on the quick path.
 *
 * Classic Planner coexists with this component rather than being displaced by it: the
 * System tab shows Classic first and opens Planner Modes deliberately, passing the
 * chosen mode in through `initialMode`. When no mode is given — as in the component's
 * own tests — the outcome-based chooser below is still the entry.
 */
interface PrefillData {
  goal?: string;
  subject?: string;
  targetDate?: string;
  weeklyHours?: number;
}

interface ModeRecommendation {
  mode: Mode;
  explanation: string;
  facts?: string;
  prefill?: PrefillData;
}

function analyzeIntent(query: string): ModeRecommendation {
  const text = query.toLowerCase();

  const hoursMatch = text.match(/(\d{1,2})\s*(?:hours|hrs|h)\b/i);
  const weeklyHours = hoursMatch ? parseInt(hoursMatch[1], 10) : undefined;

  const monthMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|next month|next week|tomorrow)\b/i
  );
  const targetDateStr = monthMatch ? monthMatch[0] : undefined;

  const subjectTerms = [
    "math", "maths", "mathematics", "physics", "chemistry", "biology",
    "computer science", "history", "english", "economics", "calculus",
    "algebra", "mechanics", "literature", "french", "german", "spanish"
  ];
  const foundSubjects = subjectTerms.filter((term) => text.includes(term));
  const detectedSubject =
    foundSubjects.length > 0
      ? foundSubjects.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")
      : undefined;

  const goalTitle = query.length > 50 ? query.slice(0, 48) + "…" : query;

  if (
    /\b(chapter|unit|master|mastery|single topic|concept|deep dive|one topic)\b/i.test(text) &&
    !/\b(exam|syllabus|course|all of|full|qualification)\b/i.test(text)
  ) {
    return {
      mode: "MASTERY",
      explanation: "This sounds like Chapter / Unit Mastery because you are targeting deep mastery of a single bounded unit.",
      facts: detectedSubject ? `Focus: ${detectedSubject}${weeklyHours ? ` · ${weeklyHours}h/week` : ""}` : undefined,
      prefill: {
        goal: detectedSubject ?? goalTitle,
        subject: detectedSubject,
        weeklyHours,
      },
    };
  }

  if (
    /\b(course|roadmap|syllabus|qualification|semester|year-long|months|full|curriculum|a-level syllabus|entire)\b/i.test(text) &&
    !/\b(mock|final exam|test tomorrow|exam next week)\b/i.test(text)
  ) {
    return {
      mode: "ROADMAP",
      explanation: "This sounds like a Course / Syllabus Roadmap because you are pacing a full course or syllabus over weeks or months with milestones.",
      facts: detectedSubject ? `Course: ${detectedSubject}${targetDateStr ? ` · Target: ${targetDateStr}` : ""}${weeklyHours ? ` · ${weeklyHours}h/week` : ""}` : undefined,
      prefill: {
        goal: detectedSubject ? `${detectedSubject} Syllabus` : goalTitle,
        subject: detectedSubject,
        weeklyHours,
      },
    };
  }

  return {
    mode: "EXAM",
    explanation: "This sounds like an Exam Plan because you have a fixed exam deadline and multiple topics to prepare.",
    facts: detectedSubject ? `Exam: ${detectedSubject}${targetDateStr ? ` · Target: ${targetDateStr}` : ""}${weeklyHours ? ` · ${weeklyHours}h/week` : ""}` : undefined,
    prefill: {
      goal: detectedSubject ? `${detectedSubject} Exam` : goalTitle,
      subject: detectedSubject,
      weeklyHours,
    },
  };
}

export default function PlannerWorkspace({
  capabilities,
  initialMode,
  onExitToClassic,
  onQuotaRefresh,
  handoff,
}: {
  handoff?: SylviePlannerHandoff;
  capabilities: PlannerCapabilities;
  /** The mode the caller already chose, so this component does not ask again. */
  initialMode?: Mode;
  /** Return to the Classic Planner, offered alongside the mode switcher. */
  onExitToClassic?: () => void;
  onQuotaRefresh?: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(initialMode ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [prefill, setPrefill] = useState<PrefillData | undefined>(undefined);
  const [copyNotice, setCopyNotice] = useState("");

  // Setup Designer entry state
  const [entryQuery, setEntryQuery] = useState("");
  const [entryRecommendation, setEntryRecommendation] = useState<ModeRecommendation | null>(null);

  const choose = (next: Mode) => {
    plannerTelemetry("planner_mode_selected", { mode: next });
    setMode(next);
    setAdvanced(false);
    setPrefill(undefined);
  };

  const chooseWithPrefill = (next: Mode, data?: PrefillData) => {
    plannerTelemetry("planner_mode_selected", { mode: next });
    setPrefill(data);
    setMode(next);
    setAdvanced(false);
    setEntryRecommendation(null);
  };

  const handleAskSylf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryQuery.trim()) return;
    const rec = analyzeIntent(entryQuery.trim());
    setEntryRecommendation(rec);
  };

  if (mode) {
    const meta = MODE_META[mode];
    const ModeIcon = meta.icon;
    const planner =
      mode === "EXAM" ? (
        <ExamPlanner capabilities={capabilities} onQuotaRefresh={onQuotaRefresh} />
      ) : mode === "ROADMAP" ? (
        <RoadmapPlanner capabilities={capabilities} onQuotaRefresh={onQuotaRefresh} />
      ) : (
        <MasteryPlanner capabilities={capabilities} onQuotaRefresh={onQuotaRefresh} />
      );

    return (
      <div className="w-full">
        {/* Compact Single Planner Toolbar */}
        <nav
          aria-label="Planner setup"
          className="sticky top-0 z-30 w-full border-b border-white/[0.08] bg-[#090d16]/90 backdrop-blur-xl transition-all"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
            {/* Left: Switch mode action + Single Strong Mode Identity */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMode(null)}
                aria-label="Choose a different plan"
                className="min-h-9 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-semibold font-['Rajdhani'] text-text-secondary hover:text-text-primary transition-all active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Plans</span>
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <span className={`p-1 rounded-md ${meta.iconBg} ${meta.accentColor}`}>
                  <ModeIcon className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary truncate">
                  {meta.title}
                </span>
              </div>
            </div>

            {/* Right: Quick Plan / Advanced Setup Segmented Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center rounded-xl p-0.5 bg-white/[0.04] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setAdvanced(false)}
                  aria-label={advanced ? "Back to Quick Plan" : "Quick Plan"}
                  className={`px-3 py-1 rounded-lg text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all ${
                    !advanced
                      ? "bg-accent-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {advanced ? "Back to Quick Plan" : "Quick Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => setAdvanced(true)}
                  aria-label="Advanced setup"
                  className={`px-3 py-1 rounded-lg text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all ${
                    advanced
                      ? "bg-accent-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Advanced setup
                </button>
              </div>

              {onExitToClassic && (
                <button
                  type="button"
                  onClick={onExitToClassic}
                  aria-label="Classic Planner"
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold font-['Rajdhani'] text-text-muted hover:text-text-secondary"
                >
                  Classic Planner
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* Active planner body */}
        <div className="relative">
          {advanced && handoff && (
            <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-border-subtle bg-surface-2 p-4 text-text-primary">
              <p className="text-text-primary whitespace-pre-wrap">{handoff.request}</p>
              <p className="text-text-secondary">Choose your saved plan and use its review controls. This setup cannot read the prepared request automatically; no plan has been changed.</p>
              <button type="button" className="text-accent-text-light underline" onClick={() => {
                const text = [...handoff.recent.map((turn) => turn.text), handoff.request].join("\n\n");
                if (!navigator.clipboard?.writeText) { setCopyNotice("Select the request text to copy it."); return; }
                void navigator.clipboard.writeText(text).then(() => setCopyNotice("Request copied."), () => setCopyNotice("Select the request text to copy it."));
              }}>Copy prepared request</button>
              {copyNotice && <p role="status" className="text-text-secondary">{copyNotice}</p>}
            </div>
          )}
          {advanced ? (
            planner
          ) : (
            <QuickPlan
              key={`${mode}:${handoff?.id ?? "normal"}`}
              handoff={handoff}
              mode={mode}
              onAdvanced={() => setAdvanced(true)}
              onQuotaRefresh={onQuotaRefresh}
              onSwitchMode={choose}
              prefill={prefill}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <section className={s.root} aria-label="Planner Modes">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase">
          What are you planning?
        </h2>
      </div>

      {/* Ask Sylf / Setup Designer at Entry */}
      <div className="p-4 sm:p-5 rounded-2xl border border-accent-primary/25 bg-accent-primary/[0.04] mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-4 h-4 text-accent-text-light" />
          <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light">
            Ask Sylf · Plan Recommendation
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          Tell Sylf what you&apos;re trying to accomplish and it will help choose and configure the right planner.
        </p>

        <form onSubmit={handleAskSylf} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={entryQuery}
            onChange={(e) => setEntryQuery(e.target.value)}
            placeholder="e.g. I have A-level exams in May, Math and Physics, and 12 hours a week…"
            className="flex-1 min-w-0 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={!entryQuery.trim()}
            className="min-h-10 px-4 py-2 rounded-xl bg-accent-primary text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Ask Sylf
          </button>
        </form>

        {entryRecommendation && (
          <div className="mt-4 p-4 rounded-xl border border-accent-primary/30 bg-[#0c101b] shadow-md animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent-primary/15 text-accent-text-light shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary font-medium mb-1">
                  {entryRecommendation.explanation}
                </p>
                {entryRecommendation.facts && (
                  <p className="text-xs text-text-muted mb-3 font-mono">
                    {entryRecommendation.facts}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      chooseWithPrefill(
                        entryRecommendation.mode,
                        entryRecommendation.prefill
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-accent-primary text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-sm"
                  >
                    Use {MODE_META[entryRecommendation.mode].title}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryRecommendation(null)}
                    className="px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
                  >
                    See other options
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Mode Chooser */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
            Or choose a planner manually
          </h3>
          {onExitToClassic && (
            <button
              type="button"
              onClick={onExitToClassic}
              className="text-xs text-text-muted hover:text-text-primary transition-colors font-medium"
            >
              Classic Planner →
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Exam Planner Card */}
          <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-violet-500/50 hover:bg-white/[0.04] transition-all duration-200">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400 group-hover:scale-105 transition-transform duration-200">
                  <Target className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">
                  Sprint
                </span>
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase mb-1.5">
                Prepare for an Exam
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Deadline-driven day-level sprint with coverage, recall, practice and exam readiness.
              </p>
            </div>
            <button
              className={`${s.primary} w-full`}
              onClick={() => choose("EXAM")}
            >
              Prepare for an Exam
            </button>
          </div>

          {/* Course Roadmap Card (Notice: Long-Horizon Pacing badge removed as requested) */}
          <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-sky-500/50 hover:bg-white/[0.04] transition-all duration-200">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 group-hover:scale-105 transition-transform duration-200">
                  <BookOpen className="w-5 h-5" />
                </span>
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase mb-1.5">
                Map a Course or Syllabus
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Long-horizon roadmap of months or weeks with milestones and covered units.
              </p>
            </div>
            <button
              className={`${s.primary} w-full`}
              onClick={() => choose("ROADMAP")}
            >
              Plan a Course
            </button>
          </div>

          {/* Chapter Mastery Card */}
          <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-emerald-500/50 hover:bg-white/[0.04] transition-all duration-200">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:scale-105 transition-transform duration-200">
                  <GraduationCap className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  Progression
                </span>
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase mb-1.5">
                Master a Chapter or Unit
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Deep progression for one bounded unit: understand, recall, practice, and mastery check.
              </p>
            </div>
            <button
              className={`${s.primary} w-full`}
              onClick={() => choose("MASTERY")}
            >
              Master a Unit
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
