"use client";

import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "../../components/AuthProvider";
import { useEffect, useState } from "react";
import { fetchCachedJSON } from "@/lib/client-data-cache";

/* ─── Types ────────────────────────────────────────────────── */

interface DailyStudy {
  date: string;
  minutes: number;
}

interface SubjectBreakdown {
  name: string;
  color: string;
  minutes: number;
  sessions: number;
}

interface QuestStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  totalXPEarned: number;
}

interface GoalStats {
  total: number;
  active: number;
  completed: number;
}

interface Summary {
  totalSessions: number;
  avgSessionMinutes: number;
  avgSessionSeconds: number;
  activeDaysLast30: number;
  longestSession: number;
  longestSessionSeconds: number;
  accountAgeDays: number;
  completionRate: number;
}

interface SessionLogEntry {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  durationSeconds: number;
  breakSeconds: number;
  focusRate: number;
  subjectName: string | null;
  subjectColor: string | null;
  questTitle: string | null;
}

interface DetailedStats {
  user: {
    username: string;
    name: string | null;
    hunterRank: string;
    level: number;
    currentXP: number;
    xpToNextLevel: number;
    hp: number;
    maxHp: number;
    streakDays: number;
    totalStudyMinutes: number;
    totalStudySeconds?: number;
    createdAt: string;
  };
  dailyStudy: DailyStudy[];
  subjectBreakdown: SubjectBreakdown[];
  sessionLog: SessionLogEntry[];
  questStats: QuestStats;
  goalStats: GoalStats;
  todayDate?: string;
  summary: Summary;
}

/** "30m", "50m 12s", "1h 20m", "3s" — human duration for a single session. */
function formatSessionDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m${s > 0 ? ` ${s}s` : ""}`;
  return `${s}s`;
}

/** "0h 17m" / "1h 02m" — lifetime study total (never a bare rounded hour). */
function formatStudyHours(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** "4m", "2.4m", "1h 05m" — 1-decimal-safe minute labels for breakdowns. */
function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes * 10) / 10);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = Math.round(m % 60);
    return `${h}h ${rem}m`;
  }
  return `${m % 1 === 0 ? Math.round(m) : m.toFixed(1)}m`;
}

/** "Today · 09:15" or "Aug 26 · 21:40" for a session timestamp. */
function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} · ${time}`;
}

/** "Morning", "Afternoon", "Evening" or "Night" from the local hour. */
function periodOfDay(iso: string): string {
  const h = new Date(iso).getHours();
  if (h < 5) return "Night";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 21) return "Evening";
  return "Night";
}

/* ─── 30-Day Activity Chart (overview) + Last-7-Days breakdown ── */

/**
 * 30-day bar overview. Design rules for readability:
 *  - ONE bar per day, evenly spaced, no per-day label noise.
 *  - X-axis anchors ONLY at meaningful dates: first day of the window,
 *    1st of a month, mid-month (15th), and Today.
 *  - Value chips above nonzero bars (desktop); tooltip on tap (mobile).
 *  - Empty days render a faint 3px stub so the baseline is continuous.
 */
function StudyChart({ data, todayDate }: { data: DailyStudy[]; todayDate?: string }) {
  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "150px", width: "100%" }}>
      {data.map((d, i) => {
        const pct = (d.minutes / maxMinutes) * 100;
        const dateObj = new Date(d.date + "T12:00:00");
        const isToday = todayDate ? d.date === todayDate : i === data.length - 1;
        const isMonthStart = dateObj.getDate() === 1;
        const isMidMonth = dateObj.getDate() === 15;

        // Only meaningful anchors on the X axis.
        const showLabel = i === 0 || isMonthStart || isMidMonth || isToday;
        const labelText = isToday
          ? "Today"
          : isMonthStart
          ? dateObj.toLocaleDateString("en", { month: "short" })
          : i === 0
          ? dateObj.toLocaleDateString("en", { month: "short", day: "numeric" })
          : String(dateObj.getDate());

        return (
          <div
            key={d.date}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              height: "100%",
              justifyContent: "flex-end",
            }}
            title={`${d.date} — ${d.minutes > 0 ? formatMinutes(d.minutes) : "no study"}`}
          >
            {/* Value chip above the bar (desktop only; mobile uses the tooltip) */}
            {d.minutes > 0 && (
              <span
                className="hidden md:block"
                style={{
                  fontSize: "0.5rem",
                  color: isToday ? "var(--accent-cyan)" : "var(--text-secondary)",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  lineHeight: 1,
                  marginBottom: "2px",
                  whiteSpace: "nowrap",
                }}
              >
                {formatMinutes(d.minutes)}
              </span>
            )}
            {/* The bar — a faint stub keeps the baseline continuous on quiet days */}
            <div
              style={{
                width: "100%",
                height: animated ? `${Math.max(pct, d.minutes > 0 ? 4 : 2)}%` : "0%",
                minHeight: "2px",
                background: isToday
                  ? "linear-gradient(180deg, var(--accent-cyan), rgba(6, 182, 212, 0.35))"
                  : d.minutes > 0
                  ? "linear-gradient(180deg, var(--accent-primary), var(--accent-primary-mid))"
                  : "rgba(255, 255, 255, 0.04)",
                borderRadius: "3px",
                transition: `height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                transitionDelay: `${i * 20}ms`,
                boxShadow: d.minutes > 0
                  ? isToday
                    ? "0 0 10px rgba(6, 182, 212, 0.35)"
                    : "0 0 4px var(--accent-primary-dim)"
                  : "none",
              }}
            />
            {/* Anchor label only at meaningful dates — no random day letters */}
            {showLabel && (
              <span
                style={{
                  fontSize: "0.55rem",
                  color: isToday ? "var(--accent-cyan)" : "var(--text-muted)",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: isToday ? 700 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {labelText}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Last 7 days" day-by-day breakdown — the analyzable companion to the
 * 30-day overview. One row per day (newest first) with an exact-minute
 * bar scaled against the best day.
 */
function Last7DaysTable({ data, todayDate }: { data: DailyStudy[]; todayDate?: string }) {
  const last7 = data.slice(-7).reverse(); // newest first
  const best = Math.max(...last7.map((d) => d.minutes), 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {last7.map((d, i) => {
        const dateObj = new Date(d.date + "T12:00:00");
        const isToday = todayDate ? d.date === todayDate : i === 0;
        const dayName = isToday
          ? "Today"
          : i === 1
          ? "Yesterday"
          : dateObj.toLocaleDateString("en", { weekday: "long" });
        const dateLabel = dateObj.toLocaleDateString("en", { month: "short", day: "numeric" });
        const pct = d.minutes > 0 ? Math.max((d.minutes / best) * 100, 3) : 0;

        return (
          <div
            key={d.date}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px 12px",
              borderRadius: "10px",
              background: isToday ? "var(--accent-primary-dim)" : "rgba(255,255,255,0.02)",
              border: isToday ? "1px solid var(--accent-primary-mid)" : "1px solid transparent",
            }}
          >
            <div style={{ width: "92px", flexShrink: 0, minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  color: isToday ? "var(--accent-cyan)" : "var(--text-primary)",
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {dayName}
              </p>
              <p style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.2 }}>
                {dateLabel}
              </p>
            </div>

            {/* Exact-total bar scaled against the best day */}
            <div
              style={{
                flex: 1,
                height: "8px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.04)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: animated ? `${pct}%` : "0%",
                  height: "100%",
                  borderRadius: "4px",
                  background: isToday
                    ? "linear-gradient(90deg, var(--accent-cyan), rgba(6, 182, 212, 0.4))"
                    : "linear-gradient(90deg, var(--accent-primary), var(--accent-primary-mid))",
                  boxShadow: isToday ? "0 0 8px rgba(6, 182, 212, 0.35)" : "none",
                  transition: "width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            </div>

            <span
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "0.8rem",
                color: d.minutes > 0 ? (isToday ? "var(--accent-cyan)" : "var(--text-primary)") : "var(--text-muted)",
                minWidth: "52px",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {d.minutes > 0 ? formatMinutes(d.minutes) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Circular Progress Ring ────────────────────────────────── */

function ProgressRing({
  value,
  max,
  size = 90,
  strokeWidth = 6,
  color,
  label,
  sublabel,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  sublabel: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const [animPct, setAnimPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimPct(pct), 200);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - animPct)}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1)",
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
      </svg>
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--text-primary)",
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.65rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {sublabel}
        </p>
      </div>
    </div>
  );
}

/* ─── Subject Breakdown Bar ─────────────────────────────────── */

function SubjectBar({
  subject,
  maxMinutes,
  totalMinutes,
  delay,
}: {
  subject: SubjectBreakdown;
  maxMinutes: number;
  totalMinutes: number;
  delay: number;
}) {
  const pct = maxMinutes > 0 ? (subject.minutes / maxMinutes) * 100 : 0;
  const sharePct = totalMinutes > 0 ? Math.round((subject.minutes / totalMinutes) * 100) : 0;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
            fontSize: "0.85rem",
            color: "var(--text-primary)",
          }}
        >
          {subject.name}
        </span>
        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            textAlign: "right",
          }}
        >
          {formatMinutes(subject.minutes)} • {subject.sessions} session{subject.sessions === 1 ? "" : "s"}
          {totalMinutes > 0 && ` • ${sharePct}% of study time`}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "6px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            // When a subject IS the largest, its bar reads as a full bar by
            // design — the % of study time label above explains that clearly.
            width: animated ? `${Math.max(pct, 2)}%` : "0%",
            height: "100%",
            background: `linear-gradient(90deg, ${subject.color}, ${subject.color}88)`,
            borderRadius: "3px",
            transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: `0 0 8px ${subject.color}30`,
          }}
        />
      </div>
    </div>
  );
}

/* ─── Stat Card ─────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="system-card"
      style={{
        padding: "16px",
        textAlign: "center",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <div style={{ color, marginBottom: "8px", display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <p
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: "1.4rem",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </p>
      <p className="stat-label" style={{ marginTop: "2px" }}>
        {label}
      </p>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

export default function StatsSettingsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<DetailedStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Session log pagination: newest 6 at a time, "Load More" reveals the rest.
  const [visibleSessionCount, setVisibleSessionCount] = useState(6);

  // Reset pagination whenever fresh stats arrive.
  useEffect(() => {
    setVisibleSessionCount(6);
  }, [data]);

  useEffect(() => {
    if (!token) return;

    // Stale-while-revalidate: revisiting the stats page paints the previous
    // snapshot instantly, then refreshes in the background.
    fetchCachedJSON<DetailedStats>(
      "/api/user/detailed-stats",
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 30_000, staleMs: 300_000 }
    )
      .then((d) => {
        if (d) setData(d);
        else setError("Failed to load stats");
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [token]);

  if (isLoading) {
    return (
      <div className="settings-page-container">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div style={{ textAlign: "center" }}>
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
            <p style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif" }}>
              Loading system analytics...
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="settings-page-container">
      <BackToSettings />
        <div className="settings-page-placeholder">
          <p className="settings-page-placeholder-text">Failed to load stats: {error}</p>
        </div>
      </div>
    );
  }

  const { user, dailyStudy, subjectBreakdown, sessionLog, questStats, goalStats, summary } = data;
  // Exact-sum of the last-30-days chart (1-decimal minutes from exact seconds).
  const totalMinutes30 = dailyStudy.reduce((sum, d) => sum + (d.minutes || 0), 0);
  const maxDayMinutes = dailyStudy.reduce((max, d) => Math.max(max, d.minutes || 0), 0);
  const maxSubjectMinutes = subjectBreakdown.length > 0 ? subjectBreakdown[0].minutes : 0;
  const totalSubjectMinutes = subjectBreakdown.reduce((sum, s) => sum + (s.minutes || 0), 0);
  // Session log: newest N first, "Load More" reveals older entries.
  const shownSessions = sessionLog.slice(0, visibleSessionCount);

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Main → Stats</p>
      <h1 className="settings-page-header">Player Statistics</h1>

      {/* ─── Player Profile Card ──────────────────────────── */}
      <div
        className="system-card"
        style={{
          padding: "24px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div className={`rank-badge rank-${user.hunterRank}`} style={{ width: "56px", height: "56px", fontSize: "1.5rem" }}>
          {user.hunterRank}
        </div>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <h2
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "1.3rem",
              color: "var(--text-primary)",
              marginBottom: "2px",
            }}
          >
            {user.name || user.username}
          </h2>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {user.hunterRank}-Rank Scholar • Level {user.level} • Account age: {summary.accountAgeDays} days
          </p>
        </div>

        {/* XP progress */}
        <div style={{ width: "200px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span className="stat-label">XP Progress</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.7rem", color: "var(--accent-primary)" }}>
              {user.currentXP}/{user.xpToNextLevel}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill xp-fill" style={{ width: `${(user.currentXP / user.xpToNextLevel) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* ─── Quick Stat Cards ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <StatCard
          label="Total Study Time"
          value={formatStudyHours(user.totalStudySeconds ?? user.totalStudyMinutes * 60)}
          color="var(--accent-cyan)"
          delay={100}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Weekly Streak"
          value={`🔥 ${user.streakDays} wks`}
          color="var(--accent-gold)"
          delay={200}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            </svg>
          }
        />
        <StatCard
          label="Total Sessions"
          value={summary.totalSessions}
          color="var(--accent-primary)"
          delay={300}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Session"
          value={summary.avgSessionSeconds > 0 ? formatSessionDuration(summary.avgSessionSeconds) : "0s"}
          color="var(--accent-blue)"
          delay={400}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Completion Rate"
          value={`${summary.completionRate}%`}
          color="var(--accent-green)"
          delay={500}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Longest Session"
          value={summary.longestSessionSeconds > 0 ? formatSessionDuration(summary.longestSessionSeconds) : "—"}
          color="var(--accent-red)"
          delay={600}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* ─── 30-Day Activity Chart ────────────────────────── */}
      <div className="system-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "18px", flexWrap: "wrap" }}>
          <h3
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--accent-cyan)",
            }}
          >
            Study Activity — Last 30 Days
          </h3>
          <span
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "0.7rem",
              color: "var(--text-muted)",
            }}
          >
            {summary.activeDaysLast30} active day{summary.activeDaysLast30 === 1 ? "" : "s"}
            {totalMinutes30 > 0 && ` • ${formatMinutes(totalMinutes30)} total`}
            {maxDayMinutes > 0 && ` • Best: ${formatMinutes(maxDayMinutes)}`}
          </span>
        </div>

        <StudyChart data={dailyStudy} todayDate={data.todayDate} />

        {/* Day-by-day breakdown — the analyzable companion to the overview */}
        <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
            <span
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-secondary)",
              }}
            >
              Day by Day — Last 7 Days
            </span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)" }}>
              scaled against your best day
            </span>
          </div>
          <Last7DaysTable data={dailyStudy} todayDate={data.todayDate} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {/* ─── Quest Progress Rings ──────────────────────── */}
        <div className="system-card" style={{ padding: "24px" }}>
          <h3
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--accent-primary)",
              marginBottom: "20px",
            }}
          >
            Quest Overview
          </h3>
          <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "16px" }}>
            <ProgressRing
              value={questStats.completed}
              max={questStats.total || 1}
              color="var(--accent-green)"
              label={`${questStats.completed}`}
              sublabel="Completed"
            />
            <ProgressRing
              value={questStats.failed}
              max={questStats.total || 1}
              color="var(--accent-red)"
              label={`${questStats.failed}`}
              sublabel="Failed"
            />
            <ProgressRing
              value={questStats.inProgress + questStats.pending}
              max={questStats.total || 1}
              color="var(--accent-blue)"
              label={`${questStats.inProgress + questStats.pending}`}
              sublabel="Active"
            />
          </div>
          <p
            style={{
              textAlign: "center",
              marginTop: "16px",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            {questStats.totalXPEarned} XP earned from quests
          </p>
        </div>

        {/* ─── Subject Breakdown ─────────────────────────── */}
        <div className="system-card" style={{ padding: "24px" }}>
          <h3
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--accent-gold)",
              marginBottom: "20px",
            }}
          >
            Subject Breakdown
          </h3>
          {subjectBreakdown.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "20px 0" }}>
              No study sessions recorded yet
            </p>
          ) : (
            subjectBreakdown.map((subject, i) => (
              <SubjectBar
                key={subject.name}
                subject={subject}
                maxMinutes={maxSubjectMinutes}
                totalMinutes={totalSubjectMinutes}
                delay={200 + i * 100}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Individual Session Log ──────────────────────── */}
      <div className="system-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <h3
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--accent-cyan)",
            }}
          >
            Individual Session Log
          </h3>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {sessionLog.length} session{sessionLog.length === 1 ? "" : "s"} recorded
            {sessionLog.length > 0 && ` • showing ${Math.min(visibleSessionCount, sessionLog.length)}`}
          </span>
        </div>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "16px" }}>
          Every focus block is logged separately — morning, night, or in between. Newest first.
        </p>

        {sessionLog.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "24px 0" }}>
            No study sessions recorded yet. Start a focus session and end it to log your first entry.
          </p>
        ) : (
          <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {shownSessions.map((s) => {
              const accent = s.subjectColor || "var(--accent-primary)";
              const breakSecs = s.breakSeconds || 0;
              const sessionTotal = (s.durationSeconds || 0) + breakSecs;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: "var(--bg-abyss)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {/* Duration badge */}
                  <span
                    style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      minWidth: "72px",
                      textAlign: "center",
                      padding: "4px 8px",
                      borderRadius: "8px",
                      color: accent,
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${accent}44`,
                      flexShrink: 0,
                    }}
                  >
                    {formatSessionDuration(s.durationSeconds)}
                  </span>

                  {/* Period chip */}
                  <span
                    style={{
                      fontSize: "0.6rem",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-secondary)",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    {periodOfDay(s.startedAt)}
                  </span>

                  {/* Subject / Quest */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.subjectName || "General Focus"}
                      {s.questTitle ? ` · ${s.questTitle}` : ""}
                    </p>
                    <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif" }}>
                      {formatSessionTime(s.startedAt)}
                      {/* Total active session time (focus + break) and how much
                          of it was break — break NEVER counts as study time. */}
                      {breakSecs > 0 && (
                        <>
                          {" • "}Session {formatSessionDuration(sessionTotal)}
                          {" • "}
                          <span style={{ color: "var(--accent-green)" }}>
                            {formatSessionDuration(breakSecs)} break
                          </span>
                        </>
                      )}
                      {s.focusRate ? ` • ${s.focusRate}% focus` : ""}
                    </p>
                  </div>

                  {/* Subject color dot */}
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: accent,
                      boxShadow: `0 0 8px ${accent}66`,
                      flexShrink: 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {visibleSessionCount < sessionLog.length && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginTop: "14px" }}>
              <button
                onClick={() => setVisibleSessionCount((prev) => Math.min(prev + 10, sessionLog.length))}
                className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: "var(--accent-text-light)",
                  background: "var(--accent-primary-dim)",
                  border: "1px solid var(--accent-primary-mid)",
                }}
              >
                Load More Sessions ({sessionLog.length - visibleSessionCount} remaining)
              </button>
              <button
                onClick={() => setVisibleSessionCount(sessionLog.length)}
                className="text-[0.65rem] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                Show all {sessionLog.length}
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* ─── Goals Overview ──────────────────────────────── */}
      <div className="system-card" style={{ padding: "24px" }}>
        <h3
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: "0.85rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--accent-blue)",
            marginBottom: "16px",
          }}
        >
          Goals Progress
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: "var(--text-primary)" }}>
              {goalStats.total}
            </p>
            <p className="stat-label">Total Goals</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: "var(--accent-blue)" }}>
              {goalStats.active}
            </p>
            <p className="stat-label">Active</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: "var(--accent-green)" }}>
              {goalStats.completed}
            </p>
            <p className="stat-label">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
