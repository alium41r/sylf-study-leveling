"use client";

import { motion } from "framer-motion";
import { DayStudySummary, GoalMilestone, FloatingRestDayStatus } from "@/lib/study-schedule-types";
import { resolveGoalColor, formatGoalDeadline } from "@/lib/goal-theme";
import { QuestEmblemIcon } from "@/app/components/icons";
import { X } from "lucide-react";
import styles from "../Calendar.module.css";

interface DayInspectionPanelProps {
  dayData: DayStudySummary | null;
  milestones?: GoalMilestone[];
  floatingRestStatus?: FloatingRestDayStatus | null;
  onToggleFloatingRest?: () => void;
  isTogglingFloatingRest?: boolean;
  onClose: () => void;
}

function formatDuration(totalSeconds: number, totalMinutes: number): string {
  const mins = totalMinutes > 0 ? totalMinutes : Math.floor(totalSeconds / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

export default function DayInspectionPanel({
  dayData,
  milestones = [],
  floatingRestStatus = null,
  onToggleFloatingRest,
  isTogglingFloatingRest = false,
  onClose,
}: DayInspectionPanelProps) {
  if (!dayData) return null;

  const dateObj = new Date(`${dayData.date}T12:00:00Z`);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const formattedStudyTime = formatDuration(dayData.totalSeconds, dayData.totalMinutes);
  const formattedGoalTime = formatDuration(0, dayData.dailyGoalMinutes);

  const hasActivity =
    dayData.totalMinutes > 0 ||
    dayData.sessionsCount > 0 ||
    dayData.questsCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`${styles.card} p-4 sm:p-6 md:p-8 mt-6 relative overflow-y-auto border border-border-subtle shadow-2xl z-50 fixed inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] md:static md:inset-x-auto md:bottom-auto md:max-h-none md:rounded-2xl md:overflow-hidden md:pb-8`}
    >
      {/* Mobile grab handle */}
      <div className="md:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-border-subtle shrink-0" />
      {/* Top Accent Line */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: dayData.goalMet
            ? "linear-gradient(90deg, var(--accent-gold), var(--accent-primary))"
            : dayData.isRestDay
            ? "linear-gradient(90deg, var(--accent-green), var(--accent-primary-dim))"
            : "linear-gradient(90deg, var(--accent-primary-dim), var(--accent-primary-mid))",
        }}
      />

      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-xl sm:text-2xl font-bold text-text-primary font-['Rajdhani']">
              {formattedDate}
            </h3>

            {/* Status Badges */}
            {dayData.isRestDay && (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold font-['Rajdhani'] uppercase tracking-wider bg-accent-green-dim text-accent-green border border-accent-green/30">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Rest Day (Protected)
              </span>
            )}

            {floatingRestStatus?.isFloatingRest && !dayData.isRestDay && (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold font-['Rajdhani'] uppercase tracking-wider bg-[var(--goal-amber-dim)] text-[var(--goal-amber-light)] border border-[var(--goal-amber-mid)]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4-.95-4-2s1.79-2 4-2 4 .95 4 2-1.79 2-4 2zm0 0v6m0 0a4 4 0 11-8 0 4 4 0 018 0zm8-6a4 4 0 11-8 0 4 4 0 018 0z" opacity="0.9" />
                </svg>
                Floating Rest (Protected)
              </span>
            )}

            {dayData.goalMet && (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold font-['Rajdhani'] uppercase tracking-wider bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid/40">
                <svg className="w-3.5 h-3.5 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth={2} />
                  <circle cx="12" cy="12" r="6" strokeWidth={2} />
                  <circle cx="12" cy="12" r="2" strokeWidth={2} />
                </svg>
                Goal Achieved ({dayData.completionPercentage}%)
              </span>
            )}

            {!dayData.isRestDay && !dayData.goalMet && dayData.totalMinutes > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold font-['Rajdhani'] uppercase tracking-wider bg-bg-shadow text-text-secondary border border-border-subtle">
                <svg className="w-3.5 h-3.5 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth={2} />
                  <polyline points="12 6 12 12 16 14" strokeWidth={2} />
                </svg>
                {dayData.completionPercentage}% of Target
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted font-mono mt-1">
            Day inspection retrospective and academic focus logs
          </p>
        </div>

        <button
          onClick={onClose}
          className="self-start sm:self-center w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors cursor-pointer text-text-muted hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Objective Milestone Banner (deadline landing on this day) */}
      {milestones.length > 0 && (
        <div className="mt-6 space-y-2.5">
          {milestones.map((m) => {
            const theme = resolveGoalColor(m.color);
            return (
              <div
                key={m.id}
                className="p-4 rounded-xl border flex items-center justify-between gap-3"
                style={{
                  background: theme.dim,
                  borderColor: theme.mid,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white"
                    style={{ background: theme.base }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9a3 3 0 116 0" opacity="0.5" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold font-['Rajdhani'] truncate" style={{ color: theme.light }}>
                      Milestone — {m.title}
                    </p>
                    <p className="text-xs text-text-muted font-['Rajdhani']">
                      Objective deadline lands today · {formatGoalDeadline(m.targetDate)}
                    </p>
                  </div>
                </div>
                <span
                  className="text-[0.65rem] font-mono font-bold px-2.5 py-1 rounded-full border shrink-0 bg-slate-900/5 dark:bg-black/30"
                  style={{
                    color: theme.base,
                    borderColor: theme.mid,
                  }}
                >
                  {theme.name.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Rest Day Control (ad-hoc rest designation) */}
      {floatingRestStatus && (
        <FloatingRestDayControl
          status={floatingRestStatus}
          onToggle={onToggleFloatingRest}
          isToggling={isTogglingFloatingRest}
        />
      )}

      {/* Metric Strip (4 Key Stats) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {/* Total Study Time */}
        <div className="p-4 rounded-xl bg-bg-abyss border border-border-subtle/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs uppercase font-bold tracking-wider font-['Rajdhani']">
            <span>Study Time</span>
            <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <polyline points="12 6 12 12 16 14" strokeWidth={2} />
            </svg>
          </div>
          <div className="mt-2">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-text-primary">
              {formattedStudyTime}
            </span>
            <span className="text-xs text-text-muted ml-2 font-mono">
              / {formattedGoalTime}
            </span>
          </div>
        </div>

        {/* Sessions Logged */}
        <div className="p-4 rounded-xl bg-bg-abyss border border-border-subtle/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs uppercase font-bold tracking-wider font-['Rajdhani']">
            <span>Sessions</span>
            <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2} />
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} />
              <line x1="8" y1="2" x2="8" y2="6" strokeWidth={2} />
            </svg>
          </div>
          <div className="mt-2">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-text-primary">
              {dayData.sessionsCount}
            </span>
            <span className="text-xs text-text-muted ml-2 font-['Rajdhani']">
              logged
            </span>
          </div>
        </div>

        {/* XP Gained */}
        <div className="p-4 rounded-xl bg-bg-abyss border border-border-subtle/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs uppercase font-bold tracking-wider font-['Rajdhani']">
            <span>XP Gained</span>
            <svg className="w-4 h-4 text-accent-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="mt-2">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-accent-gold">
              +{dayData.xpGained}
            </span>
            <span className="text-xs text-text-muted ml-2 font-['Rajdhani']">
              XP
            </span>
          </div>
        </div>

        {/* Quests Cleared */}
        <div className="p-4 rounded-xl bg-bg-abyss border border-border-subtle/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs uppercase font-bold tracking-wider font-['Rajdhani']">
            <span>Quests Cleared</span>
            <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="mt-2">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-text-primary">
              {dayData.questsCompleted}
            </span>
            <span className="text-xs text-text-muted ml-2 font-mono">
              / {dayData.questsCount} (
              {dayData.questsCount > 0
                ? Math.round((dayData.questsCompleted / dayData.questsCount) * 100)
                : 0}
              %)
            </span>
          </div>
        </div>
      </div>

      {/* Subject Distribution Bar (if sessions exist) */}
      {dayData.subjectBreakdown.length > 0 && (
        <div className="mt-6 p-5 rounded-xl bg-bg-abyss border border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-text-primary font-['Rajdhani'] flex items-center gap-2">
              <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={2} />
                <line x1="8" y1="21" x2="16" y2="21" strokeWidth={2} />
                <line x1="12" y1="17" x2="12" y2="21" strokeWidth={2} />
              </svg>
              Subject Distribution
            </h4>
            <span className="text-xs font-mono text-text-muted">
              {dayData.subjectBreakdown.length}{" "}
              {dayData.subjectBreakdown.length === 1 ? "subject" : "subjects"}
            </span>
          </div>

          {/* Proportional Stacked Progress Bar */}
          <div className="w-full h-3 rounded-full bg-bg-shadow overflow-hidden flex shadow-inner">
            {dayData.subjectBreakdown.map((sub, idx) => (
              <div
                key={idx}
                style={{
                  width: `${sub.percentage}%`,
                  backgroundColor: sub.subjectColor,
                }}
                className="h-full transition-all hover:brightness-110"
                title={`${sub.subjectName}: ${sub.percentage}% (${formatDuration(sub.seconds, sub.minutes)})`}
              />
            ))}
          </div>

          {/* Subject Legend Strip */}
          <div className="flex flex-wrap gap-4 mt-4 pt-2 border-t border-border-subtle/50">
            {dayData.subjectBreakdown.map((sub, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: sub.subjectColor }}
                />
                <span className="font-bold text-text-primary font-['Rajdhani']">
                  {sub.subjectName}
                </span>
                <span className="font-mono text-text-muted">
                  {formatDuration(sub.seconds, sub.minutes)} ({sub.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Topics & Scheduled Quests List */}
      <div className="mt-6">
        <h4 className="text-sm font-bold uppercase tracking-wider text-text-primary font-['Rajdhani'] mb-3 flex items-center gap-2">
          <QuestEmblemIcon size={16} className="text-accent-primary-light" />
          Assigned Quests & Completed Topics
        </h4>

        {dayData.quests.length === 0 ? (
          <div className="p-6 rounded-xl bg-bg-abyss/50 border border-border-subtle/60 text-center">
            {dayData.isRestDay ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-accent-green-dim flex items-center justify-center text-accent-green">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-text-primary font-['Rajdhani']">
                  Designated Rest Day
                </p>
                <p className="text-xs text-text-muted max-w-sm">
                  No quests or milestones were assigned. Your weekly streak and HP are fully protected.
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-muted italic">
                {floatingRestStatus?.isFloatingRest
                  ? "This is a floating rest day — scheduled quests were automatically shifted to the next active study day."
                  : milestones.length > 0
                  ? "No quests were scheduled on this calendar date — but an objective deadline lands today."
                  : "No quests were scheduled on this calendar date."}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayData.quests.map((q) => {
              const isDone = q.status === "COMPLETED";
              const goalTheme = q.goal ? resolveGoalColor(q.goal.color) : null;
              return (
                <div
                  key={q.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isDone
                      ? "bg-accent-green-dim/20 border-accent-green/30"
                      : "bg-bg-abyss border-border-subtle"
                  }`}
                  style={{
                    ...(goalTheme ? { borderLeft: `4px solid ${goalTheme.base}` } : {}),
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                        isDone
                          ? "bg-accent-green text-white"
                          : goalTheme
                          ? "text-white"
                          : "bg-bg-shadow text-text-muted"
                      }`}
                      style={!isDone && goalTheme ? { background: goalTheme.base } : undefined}
                    >
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-sm font-bold font-['Rajdhani'] truncate ${
                          isDone
                            ? "text-text-primary line-through opacity-80"
                            : "text-text-primary"
                        }`}
                      >
                        {q.title}
                      </p>
                      <p className="text-xs text-text-muted">
                        {q.goal && (
                          <span
                            className="inline-flex items-center gap-1.5 mr-2 px-2 py-0.5 rounded-full text-[0.6rem] font-['Rajdhani'] font-bold uppercase tracking-wider border"
                            style={{
                              color: goalTheme?.light,
                              background: goalTheme?.dim,
                              borderColor: goalTheme?.mid,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block"
                              style={{ background: goalTheme?.base }}
                            />
                            {q.goal.title}
                          </span>
                        )}
                        Target: {q.requiredMinutes}m • Difficulty: {q.difficulty}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: goalTheme ? goalTheme.light : "var(--accent-gold)" }}
                    >
                      +{q.xpReward} XP
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-['Rajdhani'] font-bold uppercase ${
                        isDone
                          ? "bg-accent-green text-white"
                          : q.status === "IN_PROGRESS"
                          ? "bg-accent-primary text-white"
                          : goalTheme
                          ? ""
                          : "bg-bg-shadow text-text-muted border border-border-subtle"
                      }`}
                      style={
                        !isDone && q.status !== "IN_PROGRESS" && goalTheme
                          ? { background: goalTheme.dim, color: goalTheme.light, border: `1px solid ${goalTheme.mid}` }
                          : undefined
                      }
                    >
                      {q.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Global Empty State (If zero activity and not a rest day) */}
      {!hasActivity && !dayData.isRestDay && !floatingRestStatus?.isFloatingRest && (
        <div className="mt-4 p-4 rounded-xl bg-bg-abyss/40 border border-border-subtle/50 text-center">
          <p className="text-xs text-text-muted">
            No study sessions or quests were recorded on this date.
          </p>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Floating Rest Day designation control.
 *
 *  - Active floating rest day  -> "Cancel Rest Day" (toggle off)
 *  - Addable                   -> "Designate Floating Rest Day"
 *  - Fixed rest day            -> disabled (already in weekly schedule)
 *  - Weekly quota exhausted    -> disabled with "1/1 floating rest days
 *                                 used this week" tooltip
 */
function FloatingRestDayControl({
  status,
  onToggle,
  isToggling,
}: {
  status: FloatingRestDayStatus;
  onToggle?: () => void;
  isToggling: boolean;
}) {
  const quotaLabel = `${status.weekUsage}/${status.weekQuota} floating rest days used this week`;
  const isQuotaExhausted = status.weekUsage >= status.weekQuota;
  const isActive = status.isFloatingRest;

  let buttonLabel = "Designate Floating Rest Day";
  let disabled = false;
  let tooltip: string | null = null;
  let tone: "add" | "cancel" | "disabled" = "add";

  if (isActive) {
    buttonLabel = "Cancel Rest Day";
    tone = "cancel";
  } else if (status.isFixedRest) {
    buttonLabel = "Fixed Rest Day (weekly schedule)";
    disabled = true;
    tone = "disabled";
    tooltip = "This date is already a fixed weekly rest day.";
  } else if (isQuotaExhausted) {
    buttonLabel = "Weekly Rest Day Limit Reached";
    disabled = true;
    tone = "disabled";
    tooltip = quotaLabel;
  }

  return (
    <div
      className={`mt-6 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
        isActive
          ? "bg-amber-500/10 border-amber-500/30 dark:border-amber-500/40"
          : "bg-slate-900/[0.03] dark:bg-[rgba(5,5,15,0.35)] border-border-subtle"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4-.95-4-2s1.79-2 4-2 4 .95 4 2-1.79 2-4 2zm0 0v6m0 0a4 4 0 11-8 0 4 4 0 018 0zm8-6a4 4 0 11-8 0 4 4 0 018 0z" opacity="0.9" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold font-['Rajdhani'] truncate text-amber-700 dark:text-amber-300">
            {isActive ? "Floating Rest Day Active" : "Ad-hoc Rest Day Designation"}
          </p>
          <p className="text-xs text-text-muted">
            {isActive
              ? `Rescued by the auto-cascade: quests shifted off ${status.dateKey}.`
              : isQuotaExhausted && !status.isFixedRest
              ? quotaLabel
              : "Unplanned events, family dinners, or sickness — exempt from HP penalties and daily targets."}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled || isToggling}
        title={tooltip || undefined}
        onClick={onToggle}
        className={`px-4 py-2 rounded-lg text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 ${
          isToggling ? "opacity-60 cursor-wait" : ""
        } ${
          tone === "cancel"
            ? "bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white border border-amber-600 dark:border-amber-400 shadow-sm"
            : tone === "add"
            ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-dashed border-amber-500/40 hover:border-amber-500/70"
            : "bg-bg-shadow text-text-muted border border-border-subtle cursor-not-allowed"
        }`}
      >
        {isToggling ? "Updating..." : buttonLabel}
      </button>
    </div>
  );
}
