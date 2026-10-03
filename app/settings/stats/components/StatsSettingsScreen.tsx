"use client";

import BackToSettings from "@/app/components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { useEffect, useState } from "react";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  BarChart3,
  Clock,
  Flame,
  Zap,
  CheckCircle2,
  TrendingUp,
  Brain,
  Target,
  BookOpen,
  ChevronDown,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Sparkles,
  Layers,
  Award,
  CircleAlert,
} from "lucide-react";
import styles from "../../components/SystemHubPage.module.css";

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

/* ─── Formatting Helpers ───────────────────────────────────── */

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

/** Period of day info (label + icon) */
function getPeriodInfo(iso: string): { label: string; icon: React.ReactNode } {
  const h = new Date(iso).getHours();
  if (h < 5) return { label: "Night", icon: <Moon className="w-3 h-3 text-indigo-400" /> };
  if (h < 12) return { label: "Morning", icon: <Sunrise className="w-3 h-3 text-amber-400" /> };
  if (h < 17) return { label: "Afternoon", icon: <Sun className="w-3 h-3 text-amber-500" /> };
  if (h < 21) return { label: "Evening", icon: <Sunset className="w-3 h-3 text-orange-400" /> };
  return { label: "Night", icon: <Moon className="w-3 h-3 text-indigo-400" /> };
}

/* ─── Hunter Rank Color Palettes ────────────────────────────── */

function getRankBadgeStyles(rank: string) {
  switch (rank?.toUpperCase()) {
    case "S":
      return styles.rankBadgeS;
    case "A":
      return styles.rankBadgeA;
    case "B":
      return styles.rankBadgeB;
    case "C":
      return styles.rankBadgeC;
    case "D":
      return styles.rankBadgeD;
    default:
      return styles.rankBadgeE;
  }
}

/* ─── 30-Day Activity Chart ─────────────────────────────────── */

function StudyChart({ data, todayDate }: { data: DailyStudy[]; todayDate?: string }) {
  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);
  const [animated, setAnimated] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<DailyStudy | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Tooltip / Status Readout */}
      <div className="h-5 flex items-center justify-between text-xs font-['Rajdhani'] font-semibold tracking-wider">
        {hoveredDay ? (
          <span className="text-[var(--accent-text)] animate-fadeIn">
            {hoveredDay.date}:{" "}
            <strong className="text-[var(--text-primary)]">
              {hoveredDay.minutes > 0 ? formatMinutes(hoveredDay.minutes) : "No study logged"}
            </strong>
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Hover or tap any day to inspect</span>
        )}
        <span className="text-[var(--text-muted)] text-[11px]">30-Day Trajectory</span>
      </div>

      <div className="flex items-end gap-[3px] sm:gap-1.5 h-36 sm:h-44 w-full pt-4 pb-1">
        {data.map((d, i) => {
          const pct = (d.minutes / maxMinutes) * 100;
          const dateObj = new Date(d.date + "T12:00:00");
          const isToday = todayDate ? d.date === todayDate : i === data.length - 1;
          const isMonthStart = dateObj.getDate() === 1;
          const isMidMonth = dateObj.getDate() === 15;

          const showLabel = i === 0 || isMonthStart || isMidMonth || isToday;
          const labelText = isToday
            ? "Today"
            : isMonthStart
            ? dateObj.toLocaleDateString("en", { month: "short" })
            : i === 0
            ? dateObj.toLocaleDateString("en", { month: "short", day: "numeric" })
            : String(dateObj.getDate());

          const hasStudy = d.minutes > 0;

          return (
            <div
              key={d.date}
              onMouseEnter={() => setHoveredDay(d)}
              onMouseLeave={() => setHoveredDay(null)}
              onClick={() => setHoveredDay(d)}
              className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer"
            >
              {/* Desktop value chip */}
              {hasStudy && (
                <span
                  className={`hidden md:block text-[9px] font-['Rajdhani'] font-bold leading-none transition-transform group-hover:scale-110 whitespace-nowrap ${
                    isToday ? "text-[var(--cyan,#06b6d4)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  {formatMinutes(d.minutes)}
                </span>
              )}

              {/* Bar element */}
              <div
                className={`w-full rounded-md transition-all duration-500 ease-out group-hover:opacity-90 relative ${
                  hasStudy
                    ? isToday
                      ? "bg-gradient-to-t from-[var(--cyan,#06b6d4)]/60 to-[var(--cyan,#06b6d4)] shadow-[0_0_12px_rgba(6,182,212,0.5)]"
                      : "bg-gradient-to-t from-[var(--accent-strong,#7c3aed)]/40 to-[var(--accent-strong,#7c3aed)] shadow-[0_0_8px_var(--accent-dim)]"
                    : ""
                }`}
                style={{
                  height: animated ? `${Math.max(pct, hasStudy ? 6 : 3)}%` : "0%",
                  minHeight: "3px",
                  backgroundColor: hasStudy ? undefined : "var(--empty-bar-bg)",
                  transitionDelay: `${Math.min(i * 12, 350)}ms`,
                }}
              />

              {/* Baseline Anchor Label */}
              <span
                className={`text-[9px] font-['Rajdhani'] tracking-wider select-none ${
                  showLabel ? "opacity-100" : "opacity-0"
                } ${isToday ? "font-bold text-[var(--cyan,#06b6d4)]" : "text-[var(--text-muted)]"}`}
              >
                {labelText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Last 7 Days Table ─────────────────────────────────────── */

function Last7DaysTable({ data, todayDate }: { data: DailyStudy[]; todayDate?: string }) {
  const last7 = data.slice(-7).reverse(); // newest first
  const best = Math.max(...last7.map((d) => d.minutes), 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {last7.map((d, i) => {
        const dateObj = new Date(d.date + "T12:00:00");
        const isToday = todayDate ? d.date === todayDate : i === 0;
        const dayName = isToday
          ? "Today"
          : i === 1
          ? "Yesterday"
          : dateObj.toLocaleDateString("en", { weekday: "long" });
        const dateLabel = dateObj.toLocaleDateString("en", { month: "short", day: "numeric" });
        const pct = d.minutes > 0 ? Math.max((d.minutes / best) * 100, 4) : 0;
        const hasStudy = d.minutes > 0;

        return (
          <div
            key={d.date}
            className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 rounded-xl border transition-colors ${
              isToday
                ? "bg-[var(--accent-dim)] border-[var(--accent-mid)] shadow-sm"
                : styles.subRow
            }`}
          >
            <div className="w-24 sm:w-28 shrink-0 min-w-0">
              <p
                className={`font-['Rajdhani'] font-bold text-xs sm:text-sm truncate leading-tight ${
                  isToday ? "text-[var(--accent-text)]" : "text-[var(--text-primary)]"
                }`}
              >
                {dayName}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] font-['Rajdhani'] font-medium">
                {dateLabel}
              </p>
            </div>

            {/* Relative Progress Bar */}
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--track-bg)" }}>
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isToday
                    ? "bg-gradient-to-r from-[var(--cyan,#06b6d4)] to-[var(--accent-strong)] shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                    : "bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-mid)]"
                }`}
                style={{
                  width: animated ? `${pct}%` : "0%",
                }}
              />
            </div>

            {/* Exact Duration Badge */}
            <span
              className={`font-['Rajdhani'] font-bold text-xs sm:text-sm text-right shrink-0 min-w-[56px] ${
                hasStudy
                  ? isToday
                    ? "text-[var(--cyan,#06b6d4)]"
                    : "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {hasStudy ? formatMinutes(d.minutes) : "—"}
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
  size = 86,
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
    const timer = setTimeout(() => setAnimPct(pct), 150);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--track-bg)"
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
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${color}55)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-['Rajdhani'] font-extrabold text-base sm:text-lg text-[var(--text-primary)] leading-none">
            {label}
          </span>
        </div>
      </div>
      <span className="font-['Rajdhani'] font-bold text-[11px] uppercase tracking-wider text-[var(--text-muted)] text-center">
        {sublabel}
      </span>
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
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: subject.color }}
          />
          <span className="font-['Rajdhani'] font-bold text-sm text-[var(--text-primary)] truncate">
            {subject.name}
          </span>
        </div>
        <div className="font-['Rajdhani'] font-semibold text-xs text-[var(--text-secondary)] shrink-0 flex items-center gap-1.5">
          <span>{formatMinutes(subject.minutes)}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span>{subject.sessions} {subject.sessions === 1 ? "session" : "sessions"}</span>
          {totalMinutes > 0 && (
            <span className="text-[var(--accent-text)] font-bold">({sharePct}%)</span>
          )}
        </div>
      </div>

      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--track-bg)" }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: animated ? `${Math.max(pct, 2)}%` : "0%",
            background: `linear-gradient(90deg, ${subject.color}, ${subject.color}99)`,
            boxShadow: `0 0 10px ${subject.color}40`,
          }}
        />
      </div>
    </div>
  );
}

/* ─── Cognitive Attributes Card ─────────────────────────────── */

interface CognitiveAbility {
  key: string;
  label: string;
  description: string;
  perkName: string;
  perkLadder: string;
  value: number;
  tier: number;
  maxTier: number;
  nextTierAt: number | null;
  investable: boolean;
  costSp: number;
  costSylph: number;
}

interface CognitiveState {
  stats: Record<string, number>;
  skillPoints: number;
  sylph: number;
  cap: number;
  abilities: CognitiveAbility[];
}

const COGNITIVE_STAT_COLORS: Record<string, string> = {
  endurance: "#ef4444",
  tenacity: "#f59e0b",
  velocity: "#06b6d4",
  discipline: "#3b82f6",
  synthesis: "#a855f7",
};

function CognitiveAttributesCard() {
  const [state, setState] = useState<CognitiveState | null>(null);
  const [currency, setCurrency] = useState<"sp" | "sylph">("sylph");
  const [busyStat, setBusyStat] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/cognitive-stats/invest", { credentials: "include" });
      if (res.ok) {
        setState(await res.json());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invest = async (key: string) => {
    if (!state || busyStat) return;
    setBusyStat(key);
    setFeedback(null);
    try {
      const res = await fetch("/api/cognitive-stats/invest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stat: key, currency }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(
          `${data.ability?.label ?? "Stat"} increased to ${data.ability?.value} (+${data.amount} pts · −${data.cost} ${
            currency === "sp" ? "SP" : "Sylph"
          })`
        );
        await load();
      } else {
        setFeedback(data.error || "Invest failed");
      }
    } catch {
      setFeedback("Network error — try again");
    } finally {
      setBusyStat(null);
    }
  };

  if (loadError) {
    return (
      <div className={`${styles.glassCard} p-6`}>
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-['Rajdhani']">
          <CircleAlert className="w-4 h-4 text-amber-500" />
          <span>Cognitive Attributes synchronization currently unavailable.</span>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={`${styles.glassCard} p-6`}>
        <p className="text-xs text-[var(--text-muted)] font-['Rajdhani'] font-bold tracking-widest uppercase animate-pulse">
          Calibrating Cognitive Vectors…
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 flex flex-col gap-5`}>
      {/* Header & Wallet */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
              Cognitive Vectors & Perks
            </h3>
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-xl">
            Channel Skill Points or Sylph into mental attributes to unlock passive study bonuses and perk tiers.
          </p>
        </div>

        {/* Currency Switcher & Balances */}
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-['Rajdhani'] font-bold ${styles.chip}`}>
            <span className="text-[var(--gold)]">{state.skillPoints} SP</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--cyan)]">{state.sylph} Sylph</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-secondary)]">Cap {state.cap}</span>
          </div>

          <div className={styles.segmentedControl}>
            {(["sp", "sylph"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`${styles.segmentedItem} ${currency === c ? styles.segmentedItemActive : ""}`}
              >
                {c === "sp" ? "SP" : "Sylph"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-['Rajdhani'] font-bold tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Vectors List */}
      <div className="flex flex-col gap-3">
        {state.abilities.map((a) => {
          const accentColor = COGNITIVE_STAT_COLORS[a.key] || "var(--accent-strong)";
          const pct = Math.min((a.value / 100) * 100, 100);

          return (
            <div
              key={a.key}
              className={`p-3.5 sm:p-4 rounded-xl flex flex-col gap-2.5 ${styles.subRow}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}88` }}
                  />
                  <span className="font-['Rajdhani'] font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
                    {a.label}
                  </span>
                  <span
                    className="text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border"
                    style={{
                      color: accentColor,
                      borderColor: `${accentColor}44`,
                      backgroundColor: `${accentColor}12`,
                    }}
                  >
                    {a.perkName} · Tier {a.tier}/{a.maxTier}
                  </span>
                </div>

                <span
                  className="font-['Rajdhani'] font-extrabold text-sm sm:text-base"
                  style={{ color: accentColor }}
                >
                  {a.value}/100
                </span>
              </div>

              <p className="text-xs text-[var(--text-muted)] font-['Inter'] leading-relaxed">
                {a.perkLadder}
              </p>

              <div className="flex items-center gap-3 pt-0.5">
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--track-bg)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
                      boxShadow: `0 0 10px ${accentColor}40`,
                    }}
                  />
                </div>

                {a.investable ? (
                  <button
                    disabled={busyStat !== null}
                    onClick={() => invest(a.key)}
                    className="shrink-0 px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all duration-150 active:scale-95 disabled:opacity-50 cursor-pointer"
                    style={{
                      background: `${accentColor}18`,
                      borderColor: `${accentColor}55`,
                      borderWidth: "1px",
                      color: accentColor,
                    }}
                    title={a.nextTierAt ? `Next tier at ${a.nextTierAt}` : "Max tier"}
                  >
                    {busyStat === a.key
                      ? "Investing…"
                      : `+5 · ${currency === "sp" ? `${a.costSp} SP` : `${a.costSylph} Sylph`}`}
                  </button>
                ) : (
                  <span className="shrink-0 px-3 py-1 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider border border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                    {a.value >= 100 ? "Maxed" : `Cap ${state.cap}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Screen Component ─────────────────────────────────── */

export function StatsSettingsScreen() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState<DetailedStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleSessionCount, setVisibleSessionCount] = useState(6);

  useEffect(() => {
    setVisibleSessionCount(6);
  }, [data]);

  useEffect(() => {
    if (!currentUser) return;

    fetchCachedJSON<DetailedStats>(
      "/api/user/detailed-stats",
      {},
      { ttlMs: 30_000, staleMs: 300_000 }
    )
      .then((d) => {
        if (d) setData(d);
        else setError("Failed to load player stats");
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [currentUser?.id]);

  if (isLoading) {
    return (
      <div className={styles.hubContainer}>
        <div className={styles.topGlow} aria-hidden="true" />
        <div className={`${styles.contentWrapper} flex flex-col items-center justify-center min-h-[60vh] gap-3`}>
          <div className="w-9 h-9 rounded-full border-2 border-[var(--accent-strong)] border-t-transparent animate-spin" />
          <p className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Synchronizing Scholar Analytics…
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.hubContainer}>
        <div className={styles.topGlow} aria-hidden="true" />
        <div className={styles.contentWrapper}>
          <BackToSettings />
          <div className={`${styles.glassCard} p-8 text-center flex flex-col items-center gap-3 mt-6`}>
            <CircleAlert className="w-8 h-8 text-red-400" />
            <p className="text-sm font-['Rajdhani'] font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Failed to load stats: {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { user, dailyStudy, subjectBreakdown, sessionLog, questStats, goalStats, summary } = data;
  const totalMinutes30 = dailyStudy.reduce((sum, d) => sum + (d.minutes || 0), 0);
  const maxDayMinutes = dailyStudy.reduce((max, d) => Math.max(max, d.minutes || 0), 0);
  const maxSubjectMinutes = subjectBreakdown.length > 0 ? subjectBreakdown[0].minutes : 0;
  const totalSubjectMinutes = subjectBreakdown.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const shownSessions = sessionLog.slice(0, visibleSessionCount);

  const xpPercent = Math.min(
    Math.round((user.currentXP / Math.max(user.xpToNextLevel, 1)) * 100),
    100
  );

  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {/* Navigation & Header */}
        <div>
          <BackToSettings />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-['Rajdhani'] font-bold tracking-widest text-[var(--accent-text)] uppercase mb-2 ${styles.chip}`}>
                <BarChart3 className="w-3.5 h-3.5" />
                <span>System Hub &rarr; Stats</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
                Player Statistics
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xl">
                Comprehensive telemetry of your study stamina, cognitive attributes, quest milestones, and daily activity.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Scholar Identity Dossier Card ─────────────────────── */}
        <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* Rank Insignia */}
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-['Rajdhani'] font-extrabold text-2xl sm:text-3xl border-2 shrink-0 ${getRankBadgeStyles(
                  user.hunterRank
                )}`}
              >
                {user.hunterRank}
              </div>

              {/* Scholar Details */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-['Rajdhani'] font-extrabold text-[var(--text-primary)] truncate">
                    {user.name || user.username}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider bg-[var(--accent-dim)] border border-[var(--accent-mid)] text-[var(--accent-text)]">
                    Level {user.level}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-['Rajdhani'] font-medium tracking-wide mt-0.5">
                  {user.hunterRank}-Rank Scholar · Account Age: {summary.accountAgeDays} days
                </p>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="w-full md:w-72 flex flex-col gap-1.5 self-center">
              <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold">
                <span className="text-[var(--text-muted)] uppercase tracking-wider">Level Experience</span>
                <span className="text-[var(--accent-text)]">
                  {user.currentXP} / {user.xpToNextLevel} XP ({xpPercent}%)
                </span>
              </div>
              <div className={`w-full h-2.5 rounded-full overflow-hidden p-0.5 ${styles.track}`}>
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--cyan,#06b6d4)] ${styles.shimmerBar}`}
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Metric Cards Grid ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-6">
          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconCyan}`}>
              <Clock className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)]">
              {formatStudyHours(user.totalStudySeconds ?? user.totalStudyMinutes * 60)}
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Total Study Time
            </p>
          </div>

          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconAmber}`}>
              <Flame className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)]">
              {user.streakDays} wks
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Weekly Streak
            </p>
          </div>

          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconPurple}`}>
              <Zap className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)]">
              {summary.totalSessions}
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Total Sessions
            </p>
          </div>

          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconBlue}`}>
              <BarChart3 className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)] truncate max-w-full">
              {summary.avgSessionSeconds > 0 ? formatSessionDuration(summary.avgSessionSeconds) : "0s"}
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Avg Session
            </p>
          </div>

          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconGreen}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)]">
              {summary.completionRate}%
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Completion
            </p>
          </div>

          <div className={styles.metricCard}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${styles.iconRed}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)] truncate max-w-full">
              {summary.longestSessionSeconds > 0 ? formatSessionDuration(summary.longestSessionSeconds) : "—"}
            </p>
            <p className="text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Longest Session
            </p>
          </div>
        </div>

        {/* ─── Cognitive Attributes Card ─────────────────────────── */}
        <div className="mt-6">
          <CognitiveAttributesCard />
        </div>

        {/* ─── 30-Day Activity Chart Card ────────────────────────── */}
        <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6 flex flex-col gap-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
                  Study Activity — Last 30 Days
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Daily stamina and focus intensity mapped across the last four weeks.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-['Rajdhani'] font-bold text-[var(--text-secondary)] self-start sm:self-auto flex-wrap">
              <span className={`px-2.5 py-1 rounded-lg ${styles.chip}`}>
                {summary.activeDaysLast30} Active Days
              </span>
              {totalMinutes30 > 0 && (
                <span className={`px-2.5 py-1 rounded-lg ${styles.chip}`}>
                  {formatMinutes(totalMinutes30)} Total
                </span>
              )}
              {maxDayMinutes > 0 && (
                <span className={`px-2.5 py-1 rounded-lg ${styles.iconCyan}`}>
                  Peak: {formatMinutes(maxDayMinutes)}
                </span>
              )}
            </div>
          </div>

          <StudyChart data={dailyStudy} todayDate={data.todayDate} />

          {/* Last 7 Days Breakdown */}
          <div className="pt-4 border-t border-[var(--subtle-line)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-['Rajdhani'] font-bold text-xs uppercase tracking-widest text-[var(--text-primary)]">
                Day by Day Momentum (Last 7 Days)
              </span>
              <span className="text-[11px] font-['Rajdhani'] text-[var(--text-muted)]">
                Scaled against best performance
              </span>
            </div>
            <Last7DaysTable data={dailyStudy} todayDate={data.todayDate} />
          </div>
        </div>

        {/* ─── Two-Column Stats: Quest Rings & Subject Breakdown ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Quests Overview */}
          <div className={`${styles.glassCard} p-5 sm:p-6 flex flex-col justify-between gap-5`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
                  Quest Directives
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Progress fulfillment across daily and special directives.
              </p>
            </div>

            <div className="flex items-center justify-around py-3">
              <ProgressRing
                value={questStats.completed}
                max={questStats.total || 1}
                color="#22c55e"
                label={`${questStats.completed}`}
                sublabel="Completed"
              />
              <ProgressRing
                value={questStats.inProgress + questStats.pending}
                max={questStats.total || 1}
                color="#06b6d4"
                label={`${questStats.inProgress + questStats.pending}`}
                sublabel="Active"
              />
              <ProgressRing
                value={questStats.failed}
                max={questStats.total || 1}
                color="#ef4444"
                label={`${questStats.failed}`}
                sublabel="Failed"
              />
            </div>

            <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-['Rajdhani'] font-bold ${styles.subRow}`}>
              <span className="text-[var(--text-muted)] uppercase tracking-wider">Rewards Extracted</span>
              <span className="text-[var(--gold)] font-extrabold flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                {questStats.totalXPEarned} Total XP Earned
              </span>
            </div>
          </div>

          {/* Subject Breakdown */}
          <div className={`${styles.glassCard} p-5 sm:p-6 flex flex-col justify-between gap-5`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-4 h-4 text-amber-500" />
                <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
                  Subject Breakdown
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Distribution of attention across active knowledge domains.
              </p>
            </div>

            {subjectBreakdown.length === 0 ? (
              <div className="py-10 text-center text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                No subject focus recorded yet
              </div>
            ) : (
              <div className="flex flex-col gap-2 py-1">
                {subjectBreakdown.map((subject, i) => (
                  <SubjectBar
                    key={subject.name}
                    subject={subject}
                    maxMinutes={maxSubjectMinutes}
                    totalMinutes={totalSubjectMinutes}
                    delay={100 + i * 80}
                  />
                ))}
              </div>
            )}

            <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-['Rajdhani'] font-bold ${styles.subRow}`}>
              <span className="text-[var(--text-muted)] uppercase tracking-wider">Total Recorded Focus</span>
              <span className="text-[var(--text-primary)] font-extrabold">
                {formatMinutes(totalSubjectMinutes)}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Individual Session Log ────────────────────────────── */}
        <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6 flex flex-col gap-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
                  Focus Session Chronicle
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Chronological ledger of every individual study block and break taken.
              </p>
            </div>

            <span className="text-xs font-['Rajdhani'] font-bold text-[var(--text-muted)] self-start sm:self-auto">
              {sessionLog.length} {sessionLog.length === 1 ? "Session" : "Sessions"} Total · Showing{" "}
              {Math.min(visibleSessionCount, sessionLog.length)}
            </span>
          </div>

          {sessionLog.length === 0 ? (
            <div className="py-12 text-center text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              No focus blocks logged yet. Launch a timer session to record your first entry.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 mt-2">
              {shownSessions.map((s) => {
                const accent = s.subjectColor || "var(--accent-strong)";
                const breakSecs = s.breakSeconds || 0;
                const sessionTotal = (s.durationSeconds || 0) + breakSecs;
                const period = getPeriodInfo(s.startedAt);

                return (
                  <div
                    key={s.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl ${styles.subRow} transition-all`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Duration Chip */}
                      <span
                        className="font-['Rajdhani'] font-extrabold text-sm sm:text-base min-w-[72px] text-center py-1 px-2.5 rounded-lg border shrink-0"
                        style={{
                          color: accent,
                          borderColor: `${accent}44`,
                          backgroundColor: `${accent}14`,
                        }}
                      >
                        {formatSessionDuration(s.durationSeconds)}
                      </span>

                      {/* Period Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider ${styles.chip} shrink-0`}>
                        {period.icon}
                        <span>{period.label}</span>
                      </span>

                      {/* Subject & Quest */}
                      <div className="min-w-0">
                        <p className="font-['Rajdhani'] font-bold text-sm text-[var(--text-primary)] truncate">
                          {s.subjectName || "General Focus"}
                          {s.questTitle && (
                            <span className="text-[var(--text-muted)] font-medium"> · {s.questTitle}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] font-['Inter'] flex items-center gap-1.5 flex-wrap">
                          <span>{formatSessionTime(s.startedAt)}</span>
                          {breakSecs > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                                {formatSessionDuration(breakSecs)} break
                              </span>
                            </>
                          )}
                          {s.focusRate > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--accent-text)] font-medium">
                                {s.focusRate}% focus rate
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Color Beacon */}
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: accent,
                          boxShadow: `0 0 8px ${accent}88`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {visibleSessionCount < sessionLog.length && (
                <div className="flex flex-col items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setVisibleSessionCount((prev) => Math.min(prev + 10, sessionLog.length))}
                    className="px-6 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider bg-[var(--accent-dim)] border border-[var(--accent-mid)] text-[var(--accent-text)] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Load More Sessions</span>
                    <span className="text-[10px] opacity-75">
                      ({sessionLog.length - visibleSessionCount} remaining)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibleSessionCount(sessionLog.length)}
                    className="text-[11px] font-['Rajdhani'] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    Reveal All {sessionLog.length} Sessions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Goals Progress Card ───────────────────────────────── */}
        <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6`}>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-500" />
            <h3 className="font-['Rajdhani'] font-extrabold text-sm sm:text-base uppercase tracking-widest text-[var(--text-primary)]">
              Long-Term Goal Directives
            </h3>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-5">
            High-level macro targets guiding your seasonal curriculum.
          </p>

          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            <div className={`flex flex-col items-center p-3 rounded-xl ${styles.subRow}`}>
              <p className="font-['Rajdhani'] font-extrabold text-2xl sm:text-3xl text-[var(--text-primary)]">
                {goalStats.total}
              </p>
              <p className="text-[10px] sm:text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">
                Total Goals
              </p>
            </div>

            <div className={`flex flex-col items-center p-3 rounded-xl ${styles.iconBlue}`}>
              <p className="font-['Rajdhani'] font-extrabold text-2xl sm:text-3xl text-[var(--blue)]">
                {goalStats.active}
              </p>
              <p className="text-[10px] sm:text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--blue)] mt-1">
                Active
              </p>
            </div>

            <div className={`flex flex-col items-center p-3 rounded-xl ${styles.iconGreen}`}>
              <p className="font-['Rajdhani'] font-extrabold text-2xl sm:text-3xl text-[var(--green)]">
                {goalStats.completed}
              </p>
              <p className="text-[10px] sm:text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--green)] mt-1">
                Completed
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsSettingsScreen;
