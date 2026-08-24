"use client";

import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "../../components/AuthProvider";
import { useEffect, useState } from "react";
import { fetchCachedJSON } from "@/lib/client-data-cache";

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

/* ─── Rank Medal ────────────────────────────────────────────── */

function RankMedal({ position }: { position: number }) {
  if (position === 1) {
    return (
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          boxShadow: "0 0 16px rgba(245, 158, 11, 0.4)",
          fontSize: "0.85rem",
          fontWeight: 700,
          color: "#000",
          animation: "pulse-gold 2s ease-in-out infinite",
        }}
      >
        1
      </div>
    );
  }
  if (position === 2) {
    return (
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #d1d5db, #9ca3af)",
          boxShadow: "0 0 10px rgba(156, 163, 175, 0.3)",
          fontSize: "0.85rem",
          fontWeight: 700,
          color: "#000",
        }}
      >
        2
      </div>
    );
  }
  if (position === 3) {
    return (
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #d97706, #b45309)",
          boxShadow: "0 0 10px rgba(180, 83, 9, 0.3)",
          fontSize: "0.85rem",
          fontWeight: 700,
          color: "#fff",
        }}
      >
        3
      </div>
    );
  }
  return (
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.05)",
        fontSize: "0.75rem",
        fontWeight: 600,
        color: "var(--text-muted)",
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      {position}
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
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const sortValue = () => {
    switch (sortBy) {
      case "studyHours":
        return `${entry.studyHours}h`;
      case "streak":
        return `🔥 ${entry.streakDays} wks`;
      case "quests":
        return `${entry.questsCompleted} done`;
      case "level":
      default:
        return `Lv. ${entry.level}`;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "6px",
        background: entry.isCurrentUser ? "rgba(6, 182, 212, 0.08)" : "rgba(255,255,255,0.02)",
        border: entry.isCurrentUser
          ? "1px solid rgba(6, 182, 212, 0.2)"
          : "1px solid transparent",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-16px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
        marginBottom: "4px",
      }}
    >
      <RankMedal position={entry.friendRank ?? entry.rank} />

      <div className={`rank-badge rank-${entry.hunterRank}`} style={{ width: "32px", height: "32px", fontSize: "0.8rem" }}>
        {entry.hunterRank}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
            fontSize: "0.9rem",
            color: entry.isCurrentUser ? "var(--accent-cyan)" : "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name || entry.username}
          {entry.isCurrentUser && (
            <span
              style={{
                fontSize: "0.65rem",
                marginLeft: "8px",
                padding: "1px 6px",
                borderRadius: "3px",
                background: "rgba(6, 182, 212, 0.15)",
                color: "var(--accent-cyan)",
                verticalAlign: "middle",
              }}
            >
              YOU
            </span>
          )}
        </p>
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
          }}
        >
          @{entry.username}
        </p>
      </div>

      <div
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: "0.95rem",
          color: "var(--text-primary)",
          textAlign: "right",
          minWidth: "60px",
        }}
      >
        {sortValue()}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

export default function RankingsSettingsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<RankingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("level");
  const [tab, setTab] = useState<TabOption>("global");

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);

    // Stale-while-revalidate: reopening rankings paints instantly from the
    // previous leaderboard and refreshes in the background.
    fetchCachedJSON<RankingsData>(
      `/api/user/rankings?sortBy=${sortBy}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 30_000, staleMs: 120_000, storageKey: `rankings:${sortBy}` }
    )
      .then((d) => { if (d) setData(d); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [token, sortBy]);

  const entries = data ? (tab === "friends" ? data.friends : data.global) : [];

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: "level", label: "Level" },
    { key: "studyHours", label: "Study Hours" },
    { key: "streak", label: "Streak" },
    { key: "quests", label: "Quests" },
  ];

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Main → Rankings</p>
      <h1 className="settings-page-header">Leaderboard</h1>

      {/* ─── Current User Position Banner ─────────────── */}
      {data && (
        <div
          className="system-card"
          style={{
            padding: "20px 24px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderColor: "rgba(6, 182, 212, 0.2)",
          }}
        >
          <div>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.7rem", color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "4px" }}>
              Your Global Rank
            </p>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "2rem", color: "var(--text-primary)" }}>
              #{data.currentUserRank}
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "8px" }}>
                of {data.totalPlayers}
              </span>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "4px" }}>
              Top Percentile
            </p>
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "var(--accent-gold)" }}>
              {data.totalPlayers > 0 ? Math.max(1, Math.round((data.currentUserRank / data.totalPlayers) * 100)) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* ─── Tab Switcher ────────────────────────────── */}
      <div style={{ display: "flex", gap: "0", marginBottom: "16px" }}>
        {(["global", "friends"] as TabOption[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "10px",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              background: tab === t ? "rgba(6, 182, 212, 0.1)" : "rgba(255,255,255,0.02)",
              border: tab === t ? "1px solid rgba(6, 182, 212, 0.3)" : "1px solid var(--border-subtle)",
              color: tab === t ? "var(--accent-cyan)" : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              borderRadius: t === "global" ? "6px 0 0 6px" : "0 6px 6px 0",
            }}
          >
            {t === "global" ? "🌍 Global" : "👥 Friends"}
          </button>
        ))}
      </div>

      {/* ─── Sort Options ────────────────────────────── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", alignSelf: "center" }}>
          Sort by:
        </span>
        {sortOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: sortBy === opt.key ? "var(--accent-primary-dim)" : "transparent",
              border: sortBy === opt.key ? "1px solid var(--accent-primary-mid)" : "1px solid var(--border-subtle)",
              color: sortBy === opt.key ? "var(--accent-text-light)" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ─── Leaderboard List ─────────────────────────── */}
      <div className="system-card" style={{ padding: "16px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "3px solid var(--border-subtle)",
                borderTopColor: "var(--accent-cyan)",
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif", fontSize: "0.8rem" }}>
              Loading rankings...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif" }}>
              {tab === "friends" ? "No friends added yet. Add friends to see friend rankings!" : "No players found."}
            </p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <LeaderboardRow key={entry.id} entry={entry} sortBy={sortBy} delay={i * 50} />
          ))
        )}
      </div>

      <style>{`
        @keyframes pulse-gold {
          0%, 100% { box-shadow: 0 0 16px rgba(245, 158, 11, 0.4); }
          50% { box-shadow: 0 0 24px rgba(245, 158, 11, 0.6), 0 0 48px rgba(245, 158, 11, 0.2); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
