"use client";

import { useAuth } from "../AuthProvider";
import { useEffect, useState, useMemo } from "react";

/* ─── Types ────────────────────────────────────────────────── */

interface DayData {
  date: string;
  minutes: number;
  sessions: number;
  quests: number;
  questsCompleted: number;
}

interface CalendarData {
  days: DayData[];
  monthStats: {
    totalMinutes: number;
    totalSessions: number;
    activeDays: number;
    totalDays: number;
  };
}

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
  dayData: DayData | null;
  isToday: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}) {
  const minutes = dayData?.minutes || 0;

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
          : getIntensityColor(minutes),
        border: isToday
          ? "1px solid var(--accent-primary-mid)"
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
          color: isToday ? "var(--accent-text-light)" : (minutes > 0 || (dayData?.quests ?? 0) > 0) ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {day}
      </span>
      {minutes > 0 && (
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.55rem",
            color: isToday ? "var(--accent-text-light)" : "var(--accent-text-light)",
            fontWeight: 600,
          }}
        >
          {minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`}
        </span>
      )}
      {(dayData?.quests ?? 0) > 0 && minutes === 0 && (
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.55rem",
            color: "var(--accent-green)",
            fontWeight: 600,
          }}
        >
          {dayData!.questsCompleted}/{dayData!.quests} Q
        </span>
      )}
      {/* Streak indicator dot */}
      {(minutes > 0 || (dayData?.quests ?? 0) > 0) && (
        <div
          style={{
            position: "absolute",
            top: "3px",
            right: "3px",
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: minutes >= 60 ? "var(--accent-gold)" : (dayData?.quests ?? 0) > 0 ? "var(--accent-green)" : "var(--accent-primary)",
            boxShadow: minutes >= 60 ? "0 0 4px var(--accent-gold)" : "none",
          }}
        />
      )}
    </button>
  );
}

/* ─── Day Detail Panel ──────────────────────────────────────── */

function DayDetailPanel({
  dayData,
  onClose,
}: {
  dayData: DayData;
  onClose: () => void;
}) {
  const dateObj = new Date(dayData.date + "T12:00:00");
  const formatted = dateObj.toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const hours = Math.floor(dayData.minutes / 60);
  const mins = dayData.minutes % 60;

  return (
    <div
      className="system-card"
      style={{
        padding: "20px",
        marginTop: "16px",
        animation: "slideDown 0.3s ease forwards",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
            {formatted}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px",
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "16px" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.3rem", color: "var(--text-primary)" }}>
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
          </p>
          <p className="stat-label">Study Time</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.3rem", color: "var(--text-primary)" }}>
            {dayData.sessions}
          </p>
          <p className="stat-label">Sessions</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.3rem", color: "var(--text-primary)" }}>
            {dayData.questsCompleted}/{dayData.quests}
          </p>
          <p className="stat-label">Quests Done</p>
        </div>
      </div>

      {dayData.minutes === 0 && (
        <p style={{ textAlign: "center", marginTop: "12px", fontFamily: "'Rajdhani', sans-serif", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          No study activity on this day
        </p>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */

export default function StudyCalendar() {
  const { token, user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

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

  // Fetch calendar data from sessions and quests
  useEffect(() => {
    if (!token) return;
    setIsLoading(true);

    const startDate = new Date(year, month, 1).toISOString().split("T")[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

    // Fetch sessions for the month
    Promise.all([
      fetch("/api/user/detailed-stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (r) => (r.ok ? r.json().catch(() => null) : null))
        .catch(() => null),
      fetch(`/api/quests?all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
        .catch(() => []),
    ])
      .then(([statsData, allQuests]) => {
        if (!statsData) {
          setIsLoading(false);
          return;
        }
        // Build day map from sessions data
        const daysInMonth = getDaysInMonth(year, month);
        const dayMap: Record<string, DayData> = {};

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          dayMap[dateStr] = { date: dateStr, minutes: 0, sessions: 0, quests: 0, questsCompleted: 0 };
        }

        // Fill from dailyStudy (covers last 30 days)
        if (statsData.dailyStudy) {
          for (const ds of statsData.dailyStudy as { date: string; minutes: number }[]) {
            if (dayMap[ds.date]) {
              dayMap[ds.date].minutes = ds.minutes;
              dayMap[ds.date].sessions = ds.minutes > 0 ? 1 : 0; // Approximation
            }
          }
        }

        // Map Quests to days
        if (Array.isArray(allQuests)) {
          for (const quest of allQuests) {
            if (quest.scheduledFor && dayMap[quest.scheduledFor]) {
              dayMap[quest.scheduledFor].quests += 1;
              if (quest.status === "COMPLETED") {
                dayMap[quest.scheduledFor].questsCompleted += 1;
              }
            }
          }
        }

        const days = Object.values(dayMap);
        const activeDays = days.filter((d) => d.minutes > 0 || d.quests > 0).length;
        const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
        const totalSessions = days.reduce((sum, d) => sum + d.sessions, 0);

        setCalendarData({
          days,
          monthStats: {
            totalMinutes,
            totalSessions,
            activeDays,
            totalDays: daysInMonth,
          },
        });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [token, year, month]);

  const navigateMonth = (direction: -1 | 1) => {
    setSelectedDay(null);
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
    setSelectedDay(null);
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  };

  // Build the calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const dayDataMap: Record<string, DayData> = {};
  if (calendarData) {
    for (const d of calendarData.days) {
      dayDataMap[d.date] = d;
    }
  }

  // Build grid cells: padding from previous month + current month
  const gridCells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    gridCells.push({ day: prevMonthDays - i, dateStr: "", isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    gridCells.push({ day: d, dateStr, isCurrentMonth: true });
  }

  // Next month padding (fill to complete the last row)
  const remainder = gridCells.length % 7;
  if (remainder > 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      gridCells.push({ day: d, dateStr: "", isCurrentMonth: false });
    }
  }

  return (
    <div className="w-full">
      {/* ─── Month Navigation ────────────────────────── */}
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
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div style={{ textAlign: "center" }}>
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
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ─── Month Stats ─────────────────────────────── */}
      {calendarData && (
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
                day={cell.day}
                dayData={cell.dateStr ? dayDataMap[cell.dateStr] || null : null}
                isToday={cell.dateStr === todayStr}
                isCurrentMonth={cell.isCurrentMonth}
                onClick={() => {
                  if (cell.isCurrentMonth && cell.dateStr) {
                    const dd = dayDataMap[cell.dateStr] || {
                      date: cell.dateStr,
                      minutes: 0,
                      sessions: 0,
                      quests: 0,
                      questsCompleted: 0,
                    };
                    setSelectedDay(selectedDay?.date === cell.dateStr ? null : dd);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Selected Day Detail ──────────────────────── */}
      {selectedDay && <DayDetailPanel dayData={selectedDay} onClose={() => setSelectedDay(null)} />}

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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
