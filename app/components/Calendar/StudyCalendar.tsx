"use client";

import { useAuth } from "../AuthProvider";
import { useEffect, useState, useMemo, useCallback } from "react";
import StudyScheduleModal from "../../calendar/components/StudyScheduleModal";
import DayInspectionPanel from "../../calendar/components/DayInspectionPanel";
import { MonthCalendarData, DayStudySummary } from "@/lib/study-schedule-service";

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
  isToday,
  isCurrentMonth,
  onClick,
}: {
  day: number;
  dayData: DayStudySummary | null;
  isToday: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}) {
  const minutes = dayData?.totalMinutes || 0;
  const questsCount = dayData?.questsCount || 0;
  const questsCompleted = dayData?.questsCompleted || 0;
  const isRest = dayData?.isRestDay;

  return (
    <button
      onClick={onClick}
      style={{
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        borderRadius: "6px",
        background: isToday
          ? "var(--accent-primary-dim)"
          : isRest && minutes === 0
          ? "rgba(34, 197, 94, 0.04)"
          : getIntensityColor(minutes),
        border: isToday
          ? "1px solid var(--accent-primary-mid)"
          : isRest
          ? "1px dashed rgba(34, 197, 94, 0.35)"
          : `1px solid ${getIntensityBorder(minutes)}`,
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
        opacity: isCurrentMonth ? 1 : 0.3,
      }}
      className="hover:scale-[1.02] hover:shadow-lg hover:z-10"
    >
      <span
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: isToday ? 700 : 500,
          fontSize: "0.85rem",
          color: isToday
            ? "var(--accent-text-light)"
            : minutes > 0 || questsCount > 0
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
            fontSize: "0.55rem",
            color: "var(--accent-text-light)",
            fontWeight: 600,
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

      {/* Streak / status indicator dot */}
      {(minutes > 0 || questsCount > 0 || isRest) && (
        <div
          style={{
            position: "absolute",
            top: "3px",
            right: "3px",
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background:
              minutes >= 60
                ? "var(--accent-gold)"
                : questsCount > 0
                ? "var(--accent-green)"
                : isRest
                ? "var(--accent-green)"
                : "var(--accent-primary)",
            boxShadow: minutes >= 60 ? "0 0 4px var(--accent-gold)" : "none",
          }}
        />
      )}
    </button>
  );
}

export default function StudyCalendar() {
  const { token, user } = useAuth();
  const now = useMemo(() => new Date(), []);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [calendarData, setCalendarData] = useState<MonthCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayStudySummary | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

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
    if (!token) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/calendar/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
  }, [token, year, month]);

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
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* ─── Top Control Bar: Month Navigation & Goals Trigger ────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() => navigateMonth(-1)}
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          className="hover:bg-bg-panel hover:text-text-primary"
          title="Previous Month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <h2
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "var(--text-primary)",
                letterSpacing: "0.05em",
              }}
            >
              {MONTH_NAMES[month]} {year}
            </h2>

            {/* Toggle Month Stats Button */}
            <button
              onClick={() => setShowMonthStats(!showMonthStats)}
              style={{
                background: showMonthStats ? "var(--accent-dim)" : "var(--bg-panel)",
                border: `1px solid ${showMonthStats ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                borderRadius: "6px",
                padding: "4px 8px",
                color: showMonthStats ? "var(--accent-text-light)" : "var(--text-muted)",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              className="hover:text-text-primary"
              title={showMonthStats ? "Hide Month Stats" : "Show Month Stats"}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {showMonthStats ? "Hide Stats" : "Show Month Stats"}
            </button>
          </div>

          {(month !== now.getMonth() || year !== now.getFullYear()) && (
            <button
              onClick={goToToday}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: "0.75rem",
                color: "var(--accent-text-light)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginTop: "2px",
              }}
              className="hover:text-text-primary transition-colors"
            >
              ← Back to Today
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            className="hover:bg-bg-panel hover:text-text-primary"
            title="Configure Daily Target & Rest Days"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            Schedule
          </button>

          <button
            onClick={() => navigateMonth(1)}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            className="hover:bg-bg-panel hover:text-text-primary"
            title="Next Month"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Month Stats Cards (Revealed when showMonthStats is true) ── */}
      {showMonthStats && calendarData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
          <div className="system-card" style={{ padding: "16px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "var(--accent-text-light)" }}>
              {Math.floor(calendarData.monthStats.totalMinutes / 60)}h {calendarData.monthStats.totalMinutes % 60}m
            </p>
            <p className="stat-label">Total Study</p>
          </div>
          <div className="system-card" style={{ padding: "16px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "var(--accent-primary)" }}>
              {calendarData.monthStats.activeDays}
            </p>
            <p className="stat-label">Active Days</p>
          </div>
          <div className="system-card" style={{ padding: "16px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "var(--accent-primary)" }}>
              {calendarData.monthStats.totalDays > 0
                ? Math.round((calendarData.monthStats.activeDays / calendarData.monthStats.totalDays) * 100)
                : 0}%
            </p>
            <p className="stat-label">Consistency</p>
          </div>
        </div>
      )}

      {/* ─── Calendar Grid ───────────────────────────── */}
      <div className="system-card" style={{ padding: "24px" }}>
        {/* Day labels */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              style={{
                textAlign: "center",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "8px 0",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid var(--border-subtle)",
                borderTopColor: "var(--accent-cyan)",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif", fontSize: "0.9rem" }}>
              Loading calendar...
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "6px",
            }}
          >
            {gridCells.map((cell, i) => (
              <DayCell
                key={i}
                day={cell.dayNumber}
                dayData={cell.dateStr ? dayDataMap[cell.dateStr] || null : null}
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
      {selectedDay && (
        <DayInspectionPanel
          dayData={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* ─── Intensity Legend ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginTop: "24px",
        }}
      >
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Less</span>
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
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>More</span>
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
        token={token}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
