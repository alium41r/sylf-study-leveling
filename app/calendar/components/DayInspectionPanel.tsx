"use client";

import { motion } from "framer-motion";
import { DayStudySummary } from "@/lib/study-schedule-service";

interface DayInspectionPanelProps {
  dayData: DayStudySummary | null;
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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="system-card p-6 sm:p-8 mt-6 relative overflow-hidden border border-border-subtle shadow-xl"
    >
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
          className="self-start sm:self-center p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-shadow border border-transparent hover:border-border-subtle transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

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
          <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
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
                No quests were scheduled on this calendar date.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayData.quests.map((q) => {
              const isDone = q.status === "COMPLETED";
              return (
                <div
                  key={q.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isDone
                      ? "bg-accent-green-dim/20 border-accent-green/30"
                      : "bg-bg-abyss border-border-subtle"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                        isDone
                          ? "bg-accent-green text-white"
                          : "bg-bg-shadow text-text-muted"
                      }`}
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
                        Target: {q.requiredMinutes}m • Difficulty: {q.difficulty}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono font-bold text-accent-gold">
                      +{q.xpReward} XP
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-['Rajdhani'] font-bold uppercase ${
                        isDone
                          ? "bg-accent-green text-white"
                          : q.status === "IN_PROGRESS"
                          ? "bg-accent-primary text-white"
                          : "bg-bg-shadow text-text-muted border border-border-subtle"
                      }`}
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
      {!hasActivity && !dayData.isRestDay && (
        <div className="mt-4 p-4 rounded-xl bg-bg-abyss/40 border border-border-subtle/50 text-center">
          <p className="text-xs text-text-muted">
            No study sessions or quests were recorded on this date.
          </p>
        </div>
      )}
    </motion.div>
  );
}
