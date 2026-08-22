"use client";

import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "../../components/AuthProvider";
import { useEffect, useState } from "react";

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
  activeDaysLast30: number;
  longestSession: number;
  accountAgeDays: number;
  completionRate: number;
}

interface SessionLogEntry {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  durationSeconds: number;
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
    createdAt: string;
  };
  dailyStudy: DailyStudy[];
  subjectBreakdown: SubjectBreakdown[];
  sessionLog: SessionLogEntry[];
  questStats: QuestStats;
  goalStats: GoalStats;
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

/* ─── Mini Bar Chart Component ──────────────────────────────── */

function StudyChart({ data }: { data: DailyStudy[] }) {
  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "140px", width: "100%" }}>
      {data.map((d, i) => {
        const pct = (d.minutes / maxMinutes) * 100;
        const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en", { weekday: "narrow" });
        const isToday = d.date === new Date().toISOString().split("T")[0];

        return (
          <div
            key={d.date}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              height: "100%",
              justifyContent: "flex-end",
            }}
            title={`${d.date}: ${d.minutes} min`}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "18px",
                height: animated ? `${Math.max(pct, d.minutes > 0 ? 4 : 0)}%` : "0%",
                background: isToday
                  ? "linear-gradient(180deg, var(--accent-cyan), rgba(6, 182, 212, 0.4))"
                  : d.minutes > 0
                  ? "linear-gradient(180deg, var(--accent-primary), var(--accent-primary-mid))"
                  : "rgba(255, 255, 255, 0.03)",
                borderRadius: "3px 3px 0 0",
                transition: `height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                transitionDelay: `${i * 25}ms`,
                boxShadow: d.minutes > 0
                  ? isToday
                    ? "0 0 8px rgba(6, 182, 212, 0.3)"
                    : "0 0 4px var(--accent-primary-dim)"
                  : "none",
                minHeight: d.minutes > 0 ? "4px" : "0px",
              }}
            />
            {/* Show day labels only every 5th bar to avoid crowding */}
            {(i % 5 === 0 || isToday) && (
              <span
                style={{
                  fontSize: "0.55rem",
                  color: isToday ? "var(--accent-cyan)" : "var(--text-muted)",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {isToday ? "Today" : dayLabel}
              </span>
            )}
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
  delay,
}: {
  subject: SubjectBreakdown;
  maxMinutes: number;
  delay: number;
}) {
  const pct = maxMinutes > 0 ? (subject.minutes / maxMinutes) * 100 : 0;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const hours = Math.floor(subject.minutes / 60);
  const mins = subject.minutes % 60;

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
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
          }}
        >
          {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} • {subject.sessions} sessions
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

  useEffect(() => {
    if (!token) return;

    fetch("/api/user/detailed-stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then((d) => setData(d))
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
  const totalHours = Math.floor(user.totalStudyMinutes / 60);
  const maxSubjectMinutes = subjectBreakdown.length > 0 ? subjectBreakdown[0].minutes : 0;

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
          label="Total Hours"
          value={totalHours}
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
          value={`${summary.avgSessionMinutes}m`}
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
          value={`${summary.longestSession}m`}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
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
            {summary.activeDaysLast30} active days
          </span>
        </div>
        <StudyChart data={dailyStudy} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
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
              <SubjectBar key={subject.name} subject={subject} maxMinutes={maxSubjectMinutes} delay={200 + i * 100} />
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
          </span>
        </div>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "16px" }}>
          Every focus block is logged separately — morning, night, or in between.
        </p>

        {sessionLog.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "24px 0" }}>
            No study sessions recorded yet. Start a focus session and end it to log your first entry.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sessionLog.slice(0, 25).map((s) => {
              const accent = s.subjectColor || "var(--accent-primary)";
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
