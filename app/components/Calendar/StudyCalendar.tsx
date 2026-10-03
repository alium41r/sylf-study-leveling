"use client";

import { useAuth } from "../AuthProvider";
import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import StudyScheduleModal from "../../calendar/components/StudyScheduleModal";
import DayInspectionPanel from "../../calendar/components/DayInspectionPanel";
import { backdropVariants } from "@/lib/motion";
import {
  MonthCalendarData,
  DayStudySummary,
  GoalMilestone,
  FloatingRestDayStatus,
} from "@/lib/study-schedule-types";
import { resolveGoalColor } from "@/lib/goal-theme";
import { ChevronLeft, ChevronRight, Sliders, BarChart3, RotateCcw } from "lucide-react";
import styles from "../../calendar/Calendar.module.css";

/* ─── Helpers ──────────────────────────────────────────────── */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ─── Intensity color based on study minutes ────────────────── */

function getIntensityColor(minutes: number): string {
  if (minutes === 0) return "transparent";
  if (minutes < 15) return "var(--accent-primary-dim)";
  if (minutes < 30) return "var(--accent-primary-mid)";
  if (minutes < 60) return "var(--accent-primary-mid)";
  if (minutes < 120) return "var(--accent-primary)";
  return "var(--accent-primary)";
}

function getIntensityBorder(minutes: number): string {
  if (minutes === 0) return "var(--border-subtle)";
  if (minutes < 30) return "var(--accent-primary-dim)";
  if (minutes < 60) return "var(--accent-primary-mid)";
  return "var(--accent-primary-mid)";
}

/* ─── Day Cell Component ────────────────────────────────────── */

function DayCell({
  day,
  dayData,
  milestones,
  isFloatingRest,
  isToday,
  isCurrentMonth,
  onClick,
}: {
  day: number;
  dayData: DayStudySummary | null;
  milestones: GoalMilestone[];
  isFloatingRest: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}) {
  const minutes = dayData?.totalMinutes || 0;
  const questsCount = dayData?.questsCount || 0;
  const questsCompleted = dayData?.questsCompleted || 0;
  const isRest = dayData?.isRestDay;

  // Goal-linked quest chips (max 2 + overflow count)
  const dayQuests = dayData?.quests || [];
  const linkedQuests = dayQuests.slice(0, 2);
  const overflowQuests = dayQuests.length - linkedQuests.length;

  // Milestone accent (first milestone wins for the daydot/border tint)
  const milestoneTheme = milestones.length > 0 ? resolveGoalColor(milestones[0].color) : null;
  const floatingTheme = resolveGoalColor("AMBER");

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        borderRadius: "10px",
        overflow: "hidden",
        touchAction: "manipulation",
        background: isFloatingRest
          ? "rgba(245, 158, 11, 0.08)"
          : isToday
          ? "var(--accent-primary)"
          : isRest && minutes === 0
          ? "rgba(34, 197, 94, 0.04)"
          : getIntensityColor(minutes),
        border: isFloatingRest
          ? "1px dashed rgba(245, 158, 11, 0.55)"
          : isToday
          ? "1px solid var(--accent-primary-light, #67e8f9)"
          : isRest
          ? "1px dashed rgba(34, 197, 94, 0.45)"
          : milestoneTheme
          ? `1px solid ${milestoneTheme.mid}`
          : `1px solid ${getIntensityBorder(minutes)}`,
        cursor: "pointer",
        position: "relative",
        opacity: isCurrentMonth ? 1 : 0.28,
        boxShadow: isToday ? "0 0 16px var(--accent-dim)" : undefined,
      }}
      className={`${styles.dayCell} min-h-[64px] sm:min-h-[112px]`}
    >
      <span
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: isToday ? 700 : 600,
          fontSize: "0.9rem",
          color: isToday
            ? "#080d17"
            : minutes > 0 || questsCount > 0 || isFloatingRest
            ? "var(--text-primary)"
            : "var(--text-muted)",
        }}
      >
        {day}
      </span>

      {minutes > 0 && (
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.6rem",
            color: isToday ? "#080d17" : "var(--accent-text-light)",
            fontWeight: 700,
          }}
        >
          {minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`}
        </span>
      )}

      {questsCount > 0 && (
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.55rem",
            color: "var(--accent-green)",
            fontWeight: 600,
          }}
        >
          {questsCompleted}/{questsCount} Q
        </span>
      )}

      {/* Objective milestone banner (deadline renders in goal color) */}
      {milestones.length > 0 && milestoneTheme && (
        <div
          title={milestones.map((m) => `Deadline: ${m.title}`).join("\n")}
          style={{
            maxWidth: "92%",
            padding: "1px 6px",
            borderRadius: "4px",
            background: milestoneTheme.dim,
            border: `1px solid ${milestoneTheme.mid}`,
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.5rem",
            fontWeight: 700,
            lineHeight: "1.15",
            color: milestoneTheme.light,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          ◎ {milestones.map((m) => m.title).join(" · ")}
        </div>
      )}

      {/* Floating Rest badge (ad-hoc rest day) */}
      {isFloatingRest && (
        <div
          title="Floating Rest Day — exempt from study targets and HP penalties"
          style={{
            maxWidth: "92%",
            padding: "1px 6px",
            borderRadius: "4px",
            background: floatingTheme.dim,
            border: `1px solid ${floatingTheme.mid}`,
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.5rem",
            fontWeight: 700,
            lineHeight: "1.15",
            color: floatingTheme.light,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          ◌ Floating Rest
        </div>
      )}

      {/* Goal-colored quest chips — desktop: full chips, mobile: micro pip dots */}
      <div className="hidden md:flex flex-col items-center gap-[2px] w-full">
        {linkedQuests.map((q) => {
          const theme = q.goal ? resolveGoalColor(q.goal.color) : null;
          return (
            <div
              key={q.id}
              title={`${q.title}${q.goal ? ` — ${q.goal.title}` : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                maxWidth: "92%",
              }}
            >
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "1px",
                  flexShrink: 0,
                  background: theme ? theme.base : "var(--accent-primary-mid)",
                }}
              />
              <span
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: "0.5rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {q.title}
              </span>
            </div>
          );
        })}
        {overflowQuests > 0 && (
          <span
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "0.5rem",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            +{overflowQuests} more
          </span>
        )}
      </div>

      {/* Mobile: compact colored indicator pip cluster */}
      {dayQuests.length > 0 && (
        <div
          className="flex md:hidden gap-1 mt-0.5 justify-center flex-wrap px-1"
          title={dayQuests.map((q) => q.title).join(" • ")}
        >
          {dayQuests.slice(0, 4).map((q) => {
            const theme = q.goal ? resolveGoalColor(q.goal.color) : null;
            return (
              <span
                key={q.id}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: theme ? theme.base : "var(--accent-primary-mid)" }}
              />
            );
          })}
          {dayQuests.length > 4 && (
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
          )}
        </div>
      )}

      {/* Streak / status indicator dot */}
      {(minutes > 0 || questsCount > 0 || isRest || milestones.length > 0 || isFloatingRest) && (
        <div
          style={{
            position: "absolute",
            top: "3px",
            right: "3px",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: isFloatingRest
              ? floatingTheme.base
              : milestoneTheme
              ? milestoneTheme.base
              : minutes >= 60
              ? "var(--accent-gold)"
              : questsCount > 0
              ? "var(--accent-green)"
              : isRest
              ? "var(--accent-green)"
              : "var(--accent-primary)",
            boxShadow: isFloatingRest
              ? `0 0 5px ${floatingTheme.mid}`
              : milestoneTheme
              ? `0 0 5px ${milestoneTheme.mid}`
              : minutes >= 60
              ? "0 0 4px var(--accent-gold)"
              : "none",
          }}
        />
      )}
    </button>
  );
}

export default function StudyCalendar() {
  const { user } = useAuth();
  const now = useMemo(() => new Date(), []);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [calendarData, setCalendarData] = useState<MonthCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayStudySummary | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Floating rest day toggle state (per selected day)
  const [floatingRestStatus, setFloatingRestStatus] = useState<FloatingRestDayStatus | null>(null);
  const [isTogglingFloatingRest, setIsTogglingFloatingRest] = useState(false);

  // User local today string (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    try {
      const tz = user?.timezone || "UTC";
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  }, [user?.timezone]);

  // Fetch month data
  const fetchMonthData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/calendar/month?year=${year}&month=${month}`);

      if (res.ok) {
        const data = await res.json();
        setCalendarData(data);

        // Keep selected day synchronized if one is already open
        if (selectedDay) {
          const matchingDay = data.days?.find((d: DayStudySummary) => d.date === selectedDay.date);
          if (matchingDay) {
            setSelectedDay(matchingDay);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load month calendar data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, year, month]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  const navigateMonth = (direction: -1 | 1) => {
    const newMonth = month + direction;
    if (newMonth < 0) {
      setMonth(11);
      setYear(year - 1);
    } else if (newMonth > 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(newMonth);
    }
  };

  // Live floating-rest-day status for the currently selected day
  const loadFloatingRestStatus = useCallback(
    async (dateKey: string) => {
      if (!user) return;
      try {
        const res = await fetch(
          `/api/user/study-schedule/floating-rest-day?dateKey=${dateKey}`
        );
        if (res.ok) {
          const status = await res.json();
          setFloatingRestStatus(status);
        }
      } catch (err) {
        console.error("Failed to load floating rest day status:", err);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (selectedDay) {
      loadFloatingRestStatus(selectedDay.date);
    } else {
      setFloatingRestStatus(null);
    }
  }, [selectedDay?.date, loadFloatingRestStatus]);

  /** Toggle the selected day as a floating (ad-hoc) rest day. */
  const handleToggleFloatingRest = async () => {
    if (!selectedDay) return;
    setIsTogglingFloatingRest(true);
    try {
      const res = await fetch("/api/user/study-schedule/floating-rest-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey: selectedDay.date, enabled: !floatingRestStatus?.isFloatingRest }),
      });
      if (res.ok) {
        // Cascade may have shifted quests — refresh the whole month grid.
        await fetchMonthData();
        await loadFloatingRestStatus(selectedDay.date);
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Could not update rest day designation.");
      }
    } catch (err) {
      console.error("Failed to toggle floating rest day:", err);
    } finally {
      setIsTogglingFloatingRest(false);
    }
  };

  const goToToday = () => {
    setMonth(now.getMonth());
    setYear(now.getFullYear());
    if (calendarData) {
      const todayData = calendarData.days.find((d) => d.date === todayStr);
      if (todayData) setSelectedDay(todayData);
    }
  };

  // Build grid padding for days
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfMonth(year, month);

  // Map days by date
  const dayDataMap = useMemo(() => {
    const map: Record<string, DayStudySummary> = {};
    if (calendarData?.days) {
      for (const d of calendarData.days) {
        map[d.date] = d;
      }
    }
    return map;
  }, [calendarData]);

  // Map objective milestones (deadlines) by local date
  const milestonesByDate = useMemo(() => {
    const map: Record<string, GoalMilestone[]> = {};
    if (calendarData?.milestones) {
      for (const m of calendarData.milestones) {
        (map[m.date] = map[m.date] || []).push(m);
      }
    }
    return map;
  }, [calendarData]);

  // Floating rest day set for the displayed month
  const floatingRestSet = useMemo(() => {
    return new Set(calendarData?.floatingRestDays || []);
  }, [calendarData]);

  // Previous month filler days
  const prevMonthIndex = month === 0 ? 11 : month - 1;
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonthDaysCount = getDaysInMonth(prevMonthYear, prevMonthIndex);

  const gridCells: Array<{
    dayNumber: number;
    dateStr: string;
    isCurrentMonth: boolean;
    data: DayStudySummary | null;
  }> = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dNum = prevMonthDaysCount - i;
    gridCells.push({
      dayNumber: dNum,
      dateStr: "",
      isCurrentMonth: false,
      data: null,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    gridCells.push({
      dayNumber: d,
      dateStr,
      isCurrentMonth: true,
      data: dayDataMap[dateStr] || null,
    });
  }

  // Trailing filler days
  const remainder = gridCells.length % 7;
  if (remainder > 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      gridCells.push({
        dayNumber: d,
        dateStr: "",
        isCurrentMonth: false,
        data: null,
      });
    }
  }

  const [showMonthStats, setShowMonthStats] = useState(false);

  return (
    <div style={{ maxWidth: "min(980px, 100%)", margin: "0 auto" }}>
      {/* ─── Top Control Bar: Month Navigation & Goals Trigger ────── */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigateMonth(-1)}
          className={styles.navBtn}
          title="Previous Month"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center flex flex-col items-center">
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <h2
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "1.7rem",
                color: "var(--ink)",
                letterSpacing: "0.04em",
              }}
            >
              {MONTH_NAMES[month]} {year}
            </h2>

            {/* Toggle Month Stats Button */}
            <button
              onClick={() => setShowMonthStats(!showMonthStats)}
              className={`${styles.ghostBtn} ${showMonthStats ? styles.activeGhostBtn : ""}`}
              title={showMonthStats ? "Hide Month Stats" : "Show Month Stats"}
            >
              <BarChart3 size={14} />
              <span>{showMonthStats ? "Hide Stats" : "Show Month Stats"}</span>
            </button>
          </div>

          {(month !== now.getMonth() || year !== now.getFullYear()) && (
            <button
              onClick={goToToday}
              className="mt-1 flex items-center gap-1.5 text-xs font-['Rajdhani'] font-bold text-accent-text-light hover:text-text-primary transition-colors cursor-pointer uppercase tracking-wider"
            >
              <RotateCcw size={12} />
              <span>Back to Today</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className={styles.ghostBtn}
            title="Configure Daily Target & Rest Days"
          >
            <Sliders size={14} />
            <span>Schedule</span>
          </button>

          <button
            onClick={() => navigateMonth(1)}
            className={styles.navBtn}
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ─── Month Stats Cards (Revealed when showMonthStats is true) ── */}
      {showMonthStats && calendarData && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
        >
          <div className={styles.statCard}>
            <div className={styles.topHighlight} />
            <p className={`${styles.statValue} ${styles.statValueHighlight}`}>
              {Math.floor(calendarData.monthStats.totalMinutes / 60)}h {calendarData.monthStats.totalMinutes % 60}m
            </p>
            <p className={styles.statLabel}>Total Study</p>
          </div>
          <div className={styles.statCard}>
            <div className={styles.topHighlight} />
            <p className={`${styles.statValue} ${styles.statValueHighlight}`}>
              {calendarData.monthStats.activeDays}
            </p>
            <p className={styles.statLabel}>Active Days</p>
          </div>
          <div className={styles.statCard}>
            <div className={styles.topHighlight} />
            <p className={`${styles.statValue} ${styles.statValueHighlight}`}>
              {calendarData.monthStats.totalDays > 0
                ? Math.round((calendarData.monthStats.activeDays / calendarData.monthStats.totalDays) * 100)
                : 0}%
            </p>
            <p className={styles.statLabel}>Consistency</p>
          </div>
        </motion.div>
      )}

      {/* ─── Calendar Grid ───────────────────────────── */}
      <div className={`${styles.card} p-4 sm:p-6 md:p-7`}>
        <div className={styles.topHighlight} />
        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-3">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center font-['Rajdhani'] font-bold text-xs uppercase tracking-wider py-1.5"
              style={{ color: "var(--muted)" }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {isLoading ? (
          <div className="text-center py-20">
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid var(--border-subtle)",
                borderTopColor: "var(--accent-primary)",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p className="font-['Rajdhani'] text-sm tracking-wider uppercase font-bold" style={{ color: "var(--muted)" }}>
              Loading calendar...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {gridCells.map((cell, i) => (
              <DayCell
                key={i}
                day={cell.dayNumber}
                dayData={cell.dateStr ? dayDataMap[cell.dateStr] || null : null}
                milestones={cell.dateStr ? milestonesByDate[cell.dateStr] || [] : []}
                isFloatingRest={cell.dateStr ? floatingRestSet.has(cell.dateStr) : false}
                isToday={cell.dateStr === todayStr}
                isCurrentMonth={cell.isCurrentMonth}
                onClick={() => {
                  if (cell.isCurrentMonth && cell.dateStr) {
                    const dd = dayDataMap[cell.dateStr] || {
                      date: cell.dateStr,
                      dayOfWeek: new Date(cell.dateStr + "T12:00:00").getDay(),
                      isRestDay: false,
                      totalMinutes: 0,
                      totalSeconds: 0,
                      sessionsCount: 0,
                      dailyGoalMinutes: calendarData?.dailyGoalMinutes || 120,
                      goalMet: false,
                      completionPercentage: 0,
                      questsCount: 0,
                      questsCompleted: 0,
                      xpGained: 0,
                      subjectBreakdown: [],
                      quests: [],
                    };
                    setSelectedDay(selectedDay?.date === cell.dateStr ? null : dd);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Selected Day Detail Panel ────────────────── */}
      <AnimatePresence>
        {selectedDay && (
          <div key="selected-day-inspection-wrapper">
            {/* Mobile bottom-sheet backdrop (tap outside to close) */}
            <motion.div
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              aria-hidden="true"
              onClick={() => setSelectedDay(null)}
            />
            <DayInspectionPanel
              dayData={selectedDay}
              milestones={selectedDay.date ? milestonesByDate[selectedDay.date] || [] : []}
              floatingRestStatus={floatingRestStatus}
              onToggleFloatingRest={handleToggleFloatingRest}
              isTogglingFloatingRest={isTogglingFloatingRest}
              onClose={() => setSelectedDay(null)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ─── Intensity Legend ─────────────────────────── */}
      <div className="flex justify-center mt-6">
        <div className={styles.legendCapsule}>
          <span className="font-['Rajdhani'] font-bold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Less
          </span>
          <div className="flex items-center gap-1.5">
            {[0, 15, 30, 60, 120].map((mins) => (
              <div
                key={mins}
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  background: getIntensityColor(mins),
                  border: `1px solid ${getIntensityBorder(mins)}`,
                }}
                title={`${mins}+ minutes`}
              />
            ))}
          </div>
          <span className="font-['Rajdhani'] font-bold text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            More
          </span>
        </div>
      </div>

      {/* ─── Schedule & Goals Configuration Modal ────── */}
      <StudyScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialGoalMinutes={calendarData?.dailyGoalMinutes ?? 120}
        initialRestDays={calendarData?.restDays ?? [0]}
        initialEnableHpPenalty={true}
        onSaveSuccess={() => {
          fetchMonthData();
        }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
