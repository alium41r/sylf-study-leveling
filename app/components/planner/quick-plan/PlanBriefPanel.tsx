"use client";
import type { ReactNode } from "react";
import type { IntakeView } from "@/lib/planner/intake/actions";
import { READINESS_STATES } from "@/lib/planner/intake/brief";
import { sourceTypeIsOfficial } from "@/lib/planner/research/sources";
import { formatMinutes, WEEKDAY_NAMES } from "./WeeklyBudgetControl";
import { Sparkles, Edit3, ChevronRight } from "lucide-react";
import s from "./quick-plan.module.css";

/**
 * Compact Plan Summary — "Your Plan"
 *
 * Answers four questions immediately:
 * 1. WHAT — goal title and qualification/board
 * 2. WHEN — target deadline and relative time away
 * 3. WHAT IT COVERS — unit count and authority provenance
 * 4. HOW MUCH TIME — weekly target and weekday distribution
 *
 * Optional details only appear when the student explicitly made choices for them.
 * Technical and audit details are neatly housed in "Review details".
 */

const READINESS_LABEL: Record<(typeof READINESS_STATES)[number], string> = {
  NEEDS_CORE_INFO: "Still needs the essentials",
  RESEARCH_AVAILABLE: "Scope could be researched",
  NEEDS_SCOPE_CONFIRMATION: "Scope needs confirming",
  READY_FOR_DRAFT: "Enough to make a first draft",
  ADVANCED_REFINEMENT_AVAILABLE: "Enough to make a first draft",
};

const MODE_LABEL: Record<IntakeView["mode"], string> = {
  EXAM: "Exam preparation",
  ROADMAP: "Course or syllabus",
  MASTERY: "Mastering one unit",
};

export type BriefField = "goal" | "subject" | "target" | "scope" | "budget" | "days" | "preparedness";

function formatTargetDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function getRelativeTime(targetDateStr?: string | null): string | null {
  if (!targetDateStr) return null;
  const parts = targetDateStr.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const target = new Date(year, month, day);
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "in the past";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  const weeks = Math.round(diffDays / 7);
  if (weeks <= 1) return `${diffDays} days away`;
  return `${weeks} weeks away`;
}

export default function PlanBriefPanel({
  view,
  onEdit,
  scheduleWeeklyMinutes,
}: {
  view: IntakeView;
  onEdit: (field: BriefField) => void;
  scheduleWeeklyMinutes: number | null;
}) {
  const { brief, summary } = view;
  const distribution = brief.budget.distribution?.dailyMinutes ?? null;
  const studyDays = distribution
    ? distribution.map((minutes, day) => ({ minutes, day })).filter((entry) => entry.minutes > 0)
    : [];
  const stated = summary.preparednessStated;
  const target = brief.target.examDate ?? brief.target.endDate;
  const reserved = brief.budget.recoveryPercent;

  // What / Goal
  const goalTitle = brief.goal.title.trim();
  const board = brief.backgroundCurriculum?.board;
  const level = brief.backgroundCurriculum?.level;
  const qualification = [level, board].filter(Boolean).join(" · ");

  // When / Date
  const formattedDate = target ? formatTargetDate(target) : null;
  const relativeTime = target ? getRelativeTime(target) : null;

  // What it covers / Scope
  //
  // Compile fix only: a confirmed scope carries its provenance on `provenanceSources` (the
  // frozen snapshot written when the student confirmed), not on a `sources` field, which the
  // brief has never had. The shape Gemini wanted is exactly this one — a confirmed source
  // record with a `sourceType` — so the check reads as intended with the right property name.
  const hasOfficialSource = brief.scope.provenanceSources.some((s) => sourceTypeIsOfficial(s.sourceType));
  let scopeDescription = "";
  if (summary.units > 0) {
    if (brief.scope.source === "RESEARCH_CONFIRMED") {
      scopeDescription = hasOfficialSource
        ? `official ${board ? `${board} ` : ""}specification`
        : "researched specification";
    } else if (brief.scope.source === "IMPORT_CONFIRMED") {
      scopeDescription = "imported syllabus";
    } else {
      scopeDescription = "entered topics";
    }
  }

  // How much time
  const timeDescription =
    brief.budget.weeklyMinutes !== null
      ? `${formatMinutes(brief.budget.weeklyMinutes)}/week`
      : scheduleWeeklyMinutes
        ? `${formatMinutes(scheduleWeeklyMinutes)}/week (normal schedule)`
        : null;

  const weekdayDistributionLine =
    studyDays.length > 0
      ? studyDays.map((entry) => `${WEEKDAY_NAMES[entry.day].slice(0, 3)} ${formatMinutes(entry.minutes)}`).join(" · ")
      : null;

  // Contextual optional items that only show if explicitly set
  const showSubject =
    Boolean(brief.subject.name?.trim()) && brief.subject.name?.trim() !== brief.goal.title.trim();
  const showBackground = Boolean(brief.backgroundCurriculum?.label);
  const showPreparedness = stated > 0;
  const showExclusions = brief.constraints.length + brief.budget.blockedDates.length > 0;
  const showReserve = reserved !== null;

  // Full audit trail rows for the expandable "Review details"
  const auditRows: { field: BriefField | null; label: string; value: ReactNode }[] = [
    { field: null, label: "Mode", value: MODE_LABEL[brief.mode] },
    {
      field: "goal",
      label: "Goal",
      value: goalTitle || <em>Not stated yet</em>,
    },
    {
      field: "subject",
      label: "Subject",
      value: brief.subject.name?.trim() || <em>Not stated</em>,
    },
    {
      field: "target",
      label: brief.mode === "EXAM" ? "Exam date" : "Finish by",
      value: target ? target : <em>Not stated yet</em>,
    },
    {
      field: "scope",
      label: "Scope",
      value:
        summary.units > 0 ? (
          <>
            {summary.units} planned unit{summary.units === 1 ? "" : "s"}
            {summary.leaves > summary.units ? ` from ${summary.leaves} listed` : ""}
            {summary.strategy === "SEGMENTED" ? ` · planned in ${summary.segments} segments` : ""}
          </>
        ) : (
          <em>Nothing listed yet</em>
        ),
    },
    {
      field: "budget",
      label: "Weekly time",
      value:
        brief.budget.weeklyMinutes !== null ? (
          formatMinutes(brief.budget.weeklyMinutes)
        ) : scheduleWeeklyMinutes ? (
          <>{formatMinutes(scheduleWeeklyMinutes)} (your usual Sylf schedule)</>
        ) : (
          <em>Not stated yet</em>
        ),
    },
    {
      field: "days",
      label: "Availability",
      value:
        studyDays.length > 0 ? (
          <>
            {studyDays
              .map((entry) => `${WEEKDAY_NAMES[entry.day].slice(0, 3)} ${formatMinutes(entry.minutes)}`)
              .join(" · ")}
          </>
        ) : (
          <em>No day holds time yet</em>
        ),
    },
    {
      field: "preparedness",
      label: "Preparedness",
      value:
        stated > 0 ? (
          <>
            Stated for {stated} of {summary.units || 0} unit{summary.units === 1 ? "" : "s"}
          </>
        ) : (
          <em>Not stated — Sylf will plan as work that may need learning</em>
        ),
    },
    {
      field: "days",
      label: "Exclusions",
      value:
        showExclusions ? (
          <>
            {brief.constraints.length} limit{brief.constraints.length === 1 ? "" : "s"},{" "}
            {brief.budget.blockedDates.length} excluded date
            {brief.budget.blockedDates.length === 1 ? "" : "s"}
          </>
        ) : (
          <em>None</em>
        ),
    },
    {
      field: null,
      label: "Recovery reserve",
      value: reserved === null ? <em>Mode default</em> : `${reserved}%`,
    },
    {
      field: null,
      label: "Readiness",
      value: READINESS_LABEL[brief.readiness],
    },
    {
      field: null,
      label: "Open questions",
      value:
        view.questions.length > 0 ? (
          <>{view.questions.length} optional question{view.questions.length === 1 ? "" : "s"}</>
        ) : (
          <em>None</em>
        ),
    },
  ];

  return (
    <div className={s.planSummaryWrapper} aria-label="Plan summary">
      {/* Primary Compact Card */}
      <section className={s.compactPlanCard}>
        <div className={s.compactPlanHeader}>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                Your plan
              </h3>
              <p className="text-[11px] text-text-muted">
                This is everything Sylf will work from. Anything left unstated is decided conservatively.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Essential Decision Cards */}
        <div className={s.compactGrid}>
          {/* 1. WHAT */}
          <div className={s.compactCard}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className={s.compactCardLabel}>What</span>
              <button
                type="button"
                className={s.compactEditBtn}
                aria-label="Edit Goal"
                onClick={() => onEdit("goal")}
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
            <div className={s.compactCardValue}>
              {goalTitle || <em className="text-text-muted font-normal">Not stated yet</em>}
            </div>
            {qualification ? (
              <span className="inline-block mt-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-violet-300">
                {qualification}
              </span>
            ) : null}
          </div>

          {/* 2. WHEN */}
          <div className={s.compactCard}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className={s.compactCardLabel}>When</span>
              <button
                type="button"
                className={s.compactEditBtn}
                aria-label="Edit Date"
                onClick={() => onEdit("target")}
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
            <div className={s.compactCardValue}>
              {formattedDate ? (
                <>
                  <span>{formattedDate}</span>
                  {relativeTime && (
                    <span className="block text-xs font-normal text-sky-400 mt-0.5">
                      · {relativeTime}
                    </span>
                  )}
                </>
              ) : (
                <em className="text-text-muted font-normal">Not set yet</em>
              )}
            </div>
          </div>

          {/* 3. COVER */}
          <div className={s.compactCard}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className={s.compactCardLabel}>What it covers</span>
              <button
                type="button"
                className={s.compactEditBtn}
                aria-label="Edit Scope"
                onClick={() => onEdit("scope")}
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
            <div className={s.compactCardValue}>
              {summary.units > 0 ? (
                <>
                  {/* "1 units" is the kind of thing a student reads as "this thing is
                      broken". A scope of one unit is completely normal — a single chapter, a
                      single paper — so the sentence has to agree with it. */}
                  <span>
                    {summary.units} unit{summary.units === 1 ? "" : "s"}
                  </span>
                  {scopeDescription && (
                    <span className="block text-xs font-normal text-text-secondary mt-0.5">
                      · {scopeDescription}
                    </span>
                  )}
                  {summary.strategy === "SEGMENTED" && (
                    <span className="block text-[11px] text-amber-400 mt-0.5 font-normal">
                      · planned in {summary.segments} segments
                    </span>
                  )}
                </>
              ) : (
                <em className="text-text-muted font-normal">Nothing listed yet</em>
              )}
            </div>
          </div>

          {/* 4. TIME */}
          <div className={s.compactCard}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className={s.compactCardLabel}>How much time</span>
              <button
                type="button"
                className={s.compactEditBtn}
                aria-label="Edit Weekly time"
                onClick={() => onEdit("budget")}
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
            <div className={s.compactCardValue}>
              {timeDescription ? (
                <>
                  <span>{timeDescription}</span>
                  {weekdayDistributionLine && (
                    <span className="block text-xs font-normal text-text-secondary mt-0.5">
                      → {weekdayDistributionLine}
                    </span>
                  )}
                </>
              ) : (
                <em className="text-text-muted font-normal">No study time placed yet</em>
              )}
            </div>
          </div>
        </div>

        {/* Optional stated attributes (only when user made meaningful choices) */}
        {(showSubject || showBackground || showPreparedness || showExclusions || showReserve) && (
          <div className={s.compactContextualRows}>
            {showSubject && (
              <div className={s.compactPill}>
                <span className={s.compactPillKey}>Subject:</span>
                <span className={s.compactPillValue}>{brief.subject.name}</span>
              </div>
            )}
            {showBackground && (
              <div className={s.compactPill}>
                <span className={s.compactPillKey}>Background:</span>
                <span className={s.compactPillValue}>{brief.backgroundCurriculum?.label}</span>
              </div>
            )}
            {showPreparedness && (
              <div className={s.compactPill}>
                <span className={s.compactPillKey}>What you know:</span>
                <span className={s.compactPillValue}>
                  Rated {stated} of {summary.units} unit{summary.units === 1 ? "" : "s"}
                </span>
              </div>
            )}
            {showExclusions && (
              <div className={s.compactPill}>
                <span className={s.compactPillKey}>Exclusions:</span>
                <span className={s.compactPillValue}>
                  {brief.constraints.length} limits, {brief.budget.blockedDates.length} blocked
                </span>
              </div>
            )}
            {showReserve && (
              <div className={s.compactPill}>
                <span className={s.compactPillKey}>Reserve:</span>
                <span className={s.compactPillValue}>{reserved}%</span>
              </div>
            )}
          </div>
        )}

        {/* Expandable audit details */}
        <details className={s.reviewDetails}>
          <summary className={s.reviewDetailsSummary}>
            <span className="inline-flex items-center gap-1.5 font-bold font-['Rajdhani'] text-xs tracking-wider uppercase text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
              <ChevronRight className={s.reviewChevron} />
              Review details
            </span>
            <span className="sr-only">Your plan brief</span>
          </summary>

          <div className={s.briefRows}>
            {auditRows.map((row) => (
              <div className={s.briefRow} key={row.label}>
                <span className={s.briefLabel}>{row.label}</span>
                <span className={s.briefValue}>{row.value}</span>
                {row.field ? (
                  <button
                    type="button"
                    className={s.briefEdit}
                    aria-label={`Edit ${row.label}`}
                    onClick={() => onEdit(row.field as BriefField)}
                  >
                    Edit
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
