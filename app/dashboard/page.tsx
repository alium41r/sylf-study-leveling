"use client";

import { useAuth } from "../components/AuthProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Quest {
  id: number;
  title: string;
  status: string;
  xpReward: number;
  requiredMinutes: number;
  goal: { id: number; title: string };
}

interface Friend {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level: number;
  todayMinutes: number;
  isOnline: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (!token) return;

    // Fetch today's quests
    fetch("/api/quests", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setQuests(Array.isArray(data) ? data : []))
      .catch(console.error);

    // Fetch friends
    fetch("/api/friends", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setFriends(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [token]);

  if (isLoading || !user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ color: "var(--text-muted)" }}
      >
        <p style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          Loading System Data...
        </p>
      </div>
    );
  }

  const completedToday = quests.filter((q) => q.status === "COMPLETED").length;
  const totalToday = quests.length;
  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* ─── Header ──────────────────────────────────── */}
      <div className="mb-8">
        <p
          className="text-xs tracking-widest mb-1"
          style={{ color: "var(--accent-purple)", fontFamily: "'Rajdhani', sans-serif" }}
        >
          SCHOLAR DASHBOARD
        </p>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          Welcome back, {user.name || "Scholar"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          {user.hunterRank}-Rank • Level {user.level}
        </p>
        
        {/* ─── EXP Progress Bar ──────────────────────── */}
        <div className="mt-4 max-w-sm">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5 font-['Rajdhani'] font-bold tracking-wider">
            <span>EXP</span>
            <span>{user.currentXP} / {user.xpToNextLevel}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
            <div 
              className="h-full bg-gradient-to-r from-[#a78bfa] via-[#60a5fa] to-[#22d3ee] transition-all duration-1000 ease-out animate-exp-glow relative overflow-hidden rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, (user.currentXP / user.xpToNextLevel) * 100))}%` }}
            >
              <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[-20deg] animate-exp-shimmer"></div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats Grid (3 columns, no Gold) ──────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="system-card p-4 text-center">
          <p className="stat-label">Level</p>
          <p className="stat-value" style={{ color: "var(--accent-purple)" }}>
            {user.level}
          </p>
        </div>
        <div className="system-card p-4 text-center">
          <p className="stat-label">Study Hours</p>
          <p className="stat-value" style={{ color: "var(--accent-cyan)" }}>
            {Math.floor(user.totalStudyMinutes / 60)}
          </p>
        </div>
        <div className="system-card p-4 text-center">
          <p className="stat-label">Today&apos;s Quests</p>
          <p className="stat-value text-accent-light">
            {completedToday}/{totalToday}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Today's Quests ──────────────────────────── */}
        <div className="system-card p-6">
          <h2
            className="text-lg font-bold mb-4"
            style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-blue)" }}
          >
            TODAY&apos;S QUESTS
          </h2>
          {quests.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No quests assigned. Create a Goal to receive quests from The System.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  className="flex items-center justify-between p-3 rounded"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    borderLeft: `3px solid ${
                      quest.status === "COMPLETED"
                        ? "var(--accent-green)"
                        : quest.status === "FAILED"
                        ? "var(--accent-red)"
                        : "var(--accent-purple)"
                    }`,
                  }}
                >
                  <div>
                    <p className="text-sm font-medium">{quest.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {quest.requiredMinutes} min • +{quest.xpReward} XP
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`quest-status quest-${
                        quest.status === "COMPLETED"
                          ? "completed"
                          : quest.status === "FAILED"
                          ? "failed"
                          : quest.status === "IN_PROGRESS"
                          ? "progress"
                          : "pending"
                      }`}
                    >
                      {quest.status}
                    </span>
                    {quest.status === "PENDING" && (
                      <button
                        onClick={() => router.push(`/focus?questId=${quest.id}&subjectName=${encodeURIComponent(quest.title)}`)}
                        className="px-3 py-1 text-xs font-bold rounded bg-[var(--accent-purple)] text-white hover:opacity-90 transition-opacity"
                        style={{ fontFamily: "'Rajdhani', sans-serif" }}
                      >
                        START
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Friends Widget ──────────────────────────── */}
        <div className="system-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-cyan)" }}
            >
              FRIENDS
            </h2>
            <Link
              href="/social"
              className="text-xs tracking-wider uppercase hover:text-white transition-colors"
              style={{ color: "var(--accent-purple)", fontFamily: "'Rajdhani', sans-serif" }}
            >
              View All →
            </Link>
          </div>

          {friends.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                Add friends to study together
              </p>
              <Link
                href="/social"
                className="text-sm px-4 py-2 rounded transition-colors inline-block"
                style={{
                  background: "var(--accent-primary-dim)",
                  border: "1px solid var(--accent-primary-mid)",
                  color: "var(--accent-primary)",
                }}
              >
                Find Friends
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Online friends */}
              {onlineFriends.length > 0 && (
                <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--accent-green)", fontFamily: "'Rajdhani', sans-serif" }}>
                  ONLINE — {onlineFriends.length}
                </p>
              )}
              {onlineFriends.slice(0, 3).map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-2 rounded"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`rank-badge rank-${friend.hunterRank} w-8 h-8 text-xs`}>
                        {friend.hunterRank}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-black" />
                    </div>
                    <div>
                      <Link href={`/profile/${friend.username}`} className="text-sm font-medium hover:underline hover:text-white transition-colors block">
                        {friend.name || friend.username}
                      </Link>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Lv. {friend.level} • {friend.todayMinutes}m today
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Offline friends */}
              {offlineFriends.length > 0 && (
                <p className="text-xs tracking-widest uppercase mt-2 mb-1" style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif" }}>
                  OFFLINE — {offlineFriends.length}
                </p>
              )}
              {offlineFriends.slice(0, 2).map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-2 rounded opacity-60"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`rank-badge rank-${friend.hunterRank} w-8 h-8 text-xs`}>
                        {friend.hunterRank}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gray-600 border-2 border-black" />
                    </div>
                    <div>
                      <Link href={`/profile/${friend.username}`} className="text-sm font-medium hover:underline hover:text-white transition-colors block">
                        {friend.name || friend.username}
                      </Link>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Lv. {friend.level}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
