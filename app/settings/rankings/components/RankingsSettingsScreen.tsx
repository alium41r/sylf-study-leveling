"use client";

import BackToSettings from "@/app/components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { useEffect, useState } from "react";
import { Globe, Users, Trophy, Flame, Target, Clock, Shield, Sparkles, CircleAlert } from "lucide-react";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import styles from "../../components/SystemHubPage.module.css";

/* ─── Types ────────────────────────────────────────────────── */

interface RankedUser {
  id: number;
  username: string;
  name: string | null;
  hunterRank: string;
  level: number;
  totalStudyMinutes: number;
  studyHours: number;
  streakDays: number;
  questsCompleted: number;
  isCurrentUser: boolean;
  rank: number;
  friendRank?: number;
}

interface RankingsData {
  global: RankedUser[];
  friends: RankedUser[];
  currentUserRank: number;
  totalPlayers: number;
}

type SortOption = "level" | "studyHours" | "streak" | "quests";
type TabOption = "global" | "friends";

/* ─── Rank Insignia Style ───────────────────────────────────── */

function getRankBadgeStyles(rank: string) {
  switch (rank?.toUpperCase()) {
    case "S":
      return "border-2 border-[var(--accent-strong)] text-[var(--accent-text)] bg-[var(--accent-dim)] shadow-[0_0_12px_var(--accent-dim)]";
    case "A":
      return "border border-[var(--accent-mid)] text-[var(--accent-text)] bg-[var(--accent-dim)]/50";
    case "B":
      return "border border-[var(--subtle-line)] text-[var(--text-primary)] bg-[var(--sub-surface)]";
    case "C":
      return "border border-[var(--sub-border)] text-[var(--text-secondary)] bg-[var(--sub-surface)]";
    case "D":
      return "border border-[var(--sub-border)] text-[var(--text-secondary)] bg-[var(--sub-surface)]";
    case "E":
    default:
      return "border border-[var(--sub-border)]/60 text-[var(--text-muted)] bg-[var(--chip-bg)]";
  }
}

/* ─── Rank Position Medal ───────────────────────────────────── */

function RankMedal({ position }: { position: number }) {
  if (position === 1) {
    return (
      <div className={styles.medal1} title="Rank 1 — Champion">
        <Trophy className="w-4 h-4 text-white shrink-0" />
      </div>
    );
  }
  if (position === 2) {
    return (
      <div className={styles.medal2} title="Rank 2 — Contender">
        <span>2</span>
      </div>
    );
  }
  if (position === 3) {
    return (
      <div className={styles.medal3} title="Rank 3 — Vanguard">
        <span>3</span>
      </div>
    );
  }
  return (
    <div className={styles.medalNormal}>
      <span>{position}</span>
    </div>
  );
}

/* ─── Leaderboard Row ───────────────────────────────────────── */

function LeaderboardRow({
  entry,
  sortBy,
  delay,
}: {
  entry: RankedUser;
  sortBy: SortOption;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), Math.min(delay, 400));
    return () => clearTimeout(timer);
  }, [delay]);

  const renderSortMetric = () => {
    switch (sortBy) {
      case "studyHours":
        return (
          <span className="inline-flex items-center gap-1.5 font-['Rajdhani'] font-extrabold text-sm sm:text-base text-[var(--accent-text)]">
            <Clock className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span>{entry.studyHours}h</span>
          </span>
        );
      case "streak":
        return (
          <span className="inline-flex items-center gap-1.5 font-['Rajdhani'] font-extrabold text-sm sm:text-base text-[var(--accent-text)]">
            <Flame className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span>{entry.streakDays} wks</span>
          </span>
        );
      case "quests":
        return (
          <span className="inline-flex items-center gap-1.5 font-['Rajdhani'] font-extrabold text-sm sm:text-base text-[var(--accent-text)]">
            <Target className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span>{entry.questsCompleted} done</span>
          </span>
        );
      case "level":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 font-['Rajdhani'] font-extrabold text-sm sm:text-base text-[var(--accent-text)]">
            <Shield className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span>Lv. {entry.level}</span>
          </span>
        );
    }
  };

  const pos = entry.friendRank ?? entry.rank;

  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 px-3.5 sm:px-5 py-3 rounded-2xl border transition-all duration-300 ${
        entry.isCurrentUser
          ? "bg-[var(--accent-dim)] border-[var(--accent-mid)] shadow-[0_0_20px_var(--accent-dim)] scale-[1.008]"
          : styles.subRow
      }`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
      }}
    >
      {/* Position Badge */}
      <RankMedal position={pos} />

      {/* Hunter Rank Insignia */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center font-['Rajdhani'] font-extrabold text-xs sm:text-sm shrink-0 transition-colors ${getRankBadgeStyles(
          entry.hunterRank
        )}`}
      >
        {entry.hunterRank}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`font-['Rajdhani'] font-bold text-sm sm:text-base truncate leading-tight ${
              entry.isCurrentUser ? "text-[var(--accent-text)]" : "text-[var(--text-primary)]"
            }`}
          >
            {entry.name || entry.username}
          </p>
          {entry.isCurrentUser && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-['Rajdhani'] font-extrabold uppercase tracking-widest bg-[var(--accent-strong)] text-white shadow-sm">
              YOU
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] font-['Rajdhani'] font-medium truncate mt-0.5">
          @{entry.username}
        </p>
      </div>

      {/* Primary Value Readout */}
      <div className="text-right shrink-0 min-w-[70px]">
        {renderSortMetric()}
      </div>
    </div>
  );
}

/* ─── Main Screen Component ─────────────────────────────────── */

export function RankingsSettingsScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<RankingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("level");
  const [tab, setTab] = useState<TabOption>("global");

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    fetchCachedJSON<RankingsData>(
      `/api/user/rankings?sortBy=${sortBy}`,
      {},
      { ttlMs: 30_000, staleMs: 120_000, storageKey: `rankings:${sortBy}` }
    )
      .then((d) => {
        if (d) setData(d);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [user?.id, sortBy]);

  const entries = data ? (tab === "friends" ? data.friends : data.global) : [];

  const sortOptions: { key: SortOption; label: string; icon: React.ReactNode }[] = [
    { key: "level", label: "Level", icon: <Shield className="w-3 h-3" /> },
    { key: "studyHours", label: "Hours", icon: <Clock className="w-3 h-3" /> },
    { key: "streak", label: "Streak", icon: <Flame className="w-3 h-3" /> },
    { key: "quests", label: "Quests", icon: <Target className="w-3 h-3" /> },
  ];

  const percentile =
    data && data.totalPlayers > 0
      ? Math.max(1, Math.round((data.currentUserRank / data.totalPlayers) * 100))
      : 0;

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
                <Trophy className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span>System Hub &rarr; Rankings</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
                Leaderboard & Standing
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xl">
                Competitive ladder across the entire global Scholar network and your personal friends circle.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Current User Hero Standing Banner ─────────────────── */}
        {data && (
          <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6 relative overflow-hidden`}>
            {/* Radiant Corner Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--accent-strong)]/15 via-[var(--accent-dim)] to-transparent pointer-events-none rounded-full blur-3xl -mr-16 -mt-16" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 bg-[var(--accent-dim)] border border-[var(--accent-mid)] text-[var(--accent-text)] shadow-[0_0_20px_var(--accent-dim)]">
                  <Trophy className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>

                <div>
                  <p className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--accent-text)] mb-0.5">
                    Your Global Standing
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-['Rajdhani'] font-extrabold text-3xl sm:text-4xl text-[var(--text-primary)] leading-none">
                      #{data.currentUserRank}
                    </span>
                    <span className="text-xs sm:text-sm font-['Rajdhani'] font-bold text-[var(--text-muted)]">
                      of {data.totalPlayers} Scholars
                    </span>
                  </div>
                </div>
              </div>

              {/* Percentile Pill */}
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--subtle-line)]">
                <span className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Top Bracket
                </span>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs sm:text-sm font-['Rajdhani'] font-extrabold uppercase tracking-wider shadow-sm bg-[var(--accent-dim)] border border-[var(--accent-mid)] text-[var(--accent-text)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Top {percentile}% Overall</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── Filter & Scope Toolbar ────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          {/* Global vs Friends Segmented Control */}
          <div className={styles.segmentedControl}>
            <button
              type="button"
              onClick={() => setTab("global")}
              className={`${styles.segmentedItem} ${tab === "global" ? styles.segmentedItemActive : ""}`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Global Ladder</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("friends")}
              className={`${styles.segmentedItem} ${tab === "friends" ? styles.segmentedItemActive : ""}`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Friends Circle</span>
            </button>
          </div>

          {/* Sort Selector Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--text-muted)] mr-1">
              Order By:
            </span>
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortBy(opt.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  sortBy === opt.key
                    ? "bg-[var(--accent-strong)] text-white shadow-[0_0_12px_var(--accent-dim)] scale-105"
                    : `${styles.subRow} text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-mid)]`
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── Leaderboard Roster Card ───────────────────────────── */}
        <div className={`${styles.glassCard} p-4 sm:p-6 lg:p-7 mt-6`}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-strong)] border-t-transparent animate-spin" />
              <p className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Recalculating Ladder Standings…
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CircleAlert className="w-8 h-8 text-[var(--text-muted)]" />
              <p className="text-sm font-['Rajdhani'] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                {tab === "friends"
                  ? "No friends recorded in your circle yet."
                  : "No Scholars found on this leaderboard."}
              </p>
              {tab === "friends" && (
                <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                  Add friends from the Social hub to compare daily focus hours and climb the private circle ladder together.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <LeaderboardRow
                  key={entry.id}
                  entry={entry}
                  sortBy={sortBy}
                  delay={i * 35}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RankingsSettingsScreen;
