"use client";

import { useAuth } from "../components/AuthProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { CharacterRenderer } from "../components/character/CharacterRenderer";
import { getDefaultCharacterConfig } from "@/lib/character-traits";

interface Quest {
  id: number;
  title: string;
  status: string;
  difficulty: string;
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
  const [weeklyQuest, setWeeklyQuest] = useState<any>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [briefings, setBriefings] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);

  const dismissBriefing = async (id: number) => {
    setBriefings([]);
    try {
      await fetch("/api/system-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds: [id] })
      });
    } catch (e) {
      console.error("Failed to dismiss briefing:", e);
    }
  };

  useEffect(() => {
    if (!token) return;

    const safeJson = (r: Response) => (r.ok ? r.json().catch(() => null) : null);

    Promise.all([
      fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } }).then(safeJson),
      fetch("/api/quests/weekly", { headers: { Authorization: `Bearer ${token}` } }).then(safeJson),
      fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } }).then(safeJson),
      fetch("/api/system-messages?global=true&limit=1&unreadOnly=true", { headers: { Authorization: `Bearer ${token}` } }).then(safeJson),
      fetch("/api/insights", { headers: { Authorization: `Bearer ${token}` } }).then(safeJson)
    ])
      .then(([questsData, weeklyData, friendsData, briefingsData, insightsData]) => {
        setQuests(Array.isArray(questsData) ? questsData : []);
        setWeeklyQuest(weeklyData && !weeklyData.error ? weeklyData : null);
        setFriends(Array.isArray(friendsData) ? friendsData : []);
        setBriefings(briefingsData?.messages || []);
        setInsights(Array.isArray(insightsData) ? insightsData : []);
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!isLoading && !user) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user_data");
        document.cookie = "hunter_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        window.location.href = "/login?force=true";
      }
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ color: "var(--text-muted)" }}
      >
        <p className="animate-pulse text-lg" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          Loading System Data...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-text-muted font-['Rajdhani']">Redirecting to login...</p>
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              localStorage.removeItem("token");
              localStorage.removeItem("user_data");
              document.cookie = "system_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              window.location.href = "/login?force=true";
            }
          }}
          className="btn-primary text-xs uppercase px-4 py-2 cursor-pointer"
        >
          Proceed to Login
        </button>
      </div>
    );
  }

  const completedToday = quests.filter((q) => q.status === "COMPLETED").length;
  const totalToday = quests.length;
  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  const currentXP = Number(user.currentXP) || 0;
  const xpToNextLevel = Number(user.xpToNextLevel) > 0 ? Number(user.xpToNextLevel) : 1000;
  const expPercent = Math.min(100, Math.max(0, Math.round((currentXP / xpToNextLevel) * 100)));

  const hp = Number(user.hp) || 0;
  const maxHp = Number(user.maxHp) > 0 ? Number(user.maxHp) : 100;
  const hpPercent = Math.min(100, Math.max(0, Math.round((hp / maxHp) * 100)));

  let characterCfg = user.characterConfig;
  if (typeof characterCfg === "string") {
    try {
      characterCfg = JSON.parse(characterCfg);
    } catch {
      characterCfg = null;
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* ─── Header ──────────────────────────────────── */}
      <div className="mb-8">
        <p
          className="text-xs tracking-widest mb-1 text-accent-text-light font-['Rajdhani'] font-bold uppercase"
        >
          SCHOLAR DASHBOARD
        </p>
        <h1
          className="text-3xl md:text-4xl font-bold text-text-primary mb-5"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          Welcome back, {user.name || user.username || "Scholar"}
        </h1>

        {/* ─── Character Build & Stacked Progress Bars Row ─── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6">
          {/* Character Avatar Build */}
          <div 
            onClick={() => router.push("/locker?tab=identity")}
            className="system-card group cursor-pointer relative overflow-hidden p-3 bg-bg-panel border border-border-subtle hover:border-accent-primary-mid hover:shadow-[0_0_25px_var(--accent-primary-dim)] transition-all duration-300 rounded-2xl flex items-center gap-3.5 shrink-0 select-none"
            title="Customize Character Avatar in Locker"
          >
            <div className="relative flex items-center justify-center w-[84px] h-[84px] bg-bg-abyss/80 rounded-xl border border-border-subtle overflow-hidden">
              <CharacterRenderer
                config={characterCfg || getDefaultCharacterConfig(user.username || "scholar")}
                seed={user.username || "scholar"}
                size={84}
                showPedestal={true}
                showAura={true}
              />
            </div>
            <div className="flex flex-col justify-center pr-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-accent-text-light font-['Rajdhani']">
                  CHARACTER
                </span>
                <span className="text-[10px] text-text-muted group-hover:text-accent-primary transition-colors">↗</span>
              </div>
              <span className="font-bold text-text-primary text-base font-['Rajdhani'] group-hover:text-accent-primary transition-colors truncate max-w-[130px]">
                {user.name || user.username || "Scholar"}
              </span>
              <span className="text-xs text-text-muted font-['Rajdhani'] font-medium">
                {user.hunterRank || "E"}-Rank • Level {user.level || 1}
              </span>
            </div>
          </div>

          {/* Stacked EXP and HP Progress Bars (Beside to the right) */}
          <div className="flex-1 flex flex-col justify-center gap-3 max-w-xl">
            {/* EXP Bar */}
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1.5 font-['Rajdhani'] font-bold tracking-wider">
                <span>EXP</span>
                <span>{currentXP} / {xpToNextLevel}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden border border-border-subtle relative">
                <div 
                  className="h-full bg-gradient-to-r from-accent-primary-light to-accent-primary transition-all duration-1000 ease-out animate-exp-glow relative overflow-hidden rounded-full"
                  style={{ width: `${expPercent}%` }}
                >
                  <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[-20deg] animate-exp-shimmer"></div>
                </div>
              </div>
            </div>

            {/* HP Bar */}
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1.5 font-['Rajdhani'] font-bold tracking-wider">
                <span>HP</span>
                <span>{hp} / {maxHp}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden border border-border-subtle relative">
                <div 
                  className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light transition-all duration-1000 ease-out relative overflow-hidden rounded-full"
                  style={{ width: `${hpPercent}%` }}
                >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats Grid (3 columns, no Gold) ──────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="system-card p-4 text-center">
          <p className="stat-label">Level</p>
          <p className="stat-value text-text-primary">
            {user.level || 1}
          </p>
        </div>
        <div className="system-card p-4 text-center">
          <p className="stat-label">Study Hours</p>
          <p className="stat-value text-text-primary">
            {Math.floor((Number(user.totalStudyMinutes) || 0) / 60)}
          </p>
        </div>
        <div className="system-card p-4 text-center">
          <p className="stat-label">Today&apos;s Quests</p>
          <p className="stat-value text-text-primary">
            {completedToday}/{totalToday}
          </p>
        </div>
      </div>

      {/* ─── Daily Briefing ────────────────────────────── */}
      <AnimatePresence>
        {briefings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="system-card p-6 mb-8 border border-accent-primary-mid bg-bg-void relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary-dim)]"></div>
            <div className="flex justify-between items-start mb-3">
              <h2
                className="text-xl font-bold text-accent-text-light font-['Rajdhani']"
              >
                DAILY BRIEFING
              </h2>
              <button 
                onClick={() => dismissBriefing(briefings[0].id)}
                className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-full hover:bg-bg-panel"
                title="Dismiss Briefing"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="text-sm leading-relaxed prose dark:prose-invert max-w-none text-text-primary">
              <ReactMarkdown>
                {(briefings[0]?.content || "")
                  .replace(/^\[SYSTEM NOTIFICATION\]\s*/i, "")
                  .replace(/^\[SYSTEM\]\s*/i, "")}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── System Insights ───────────────────────────── */}
      {insights.length > 0 && (
        <div className="system-card p-6 mb-8 border border-accent-primary-mid bg-bg-abyss relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary-dim blur-[50px] rounded-full pointer-events-none"></div>
          <h2
            className="text-xl font-bold mb-4 flex items-center gap-2 relative z-10 text-accent-text-light font-['Rajdhani']"
          >
            <span className="text-2xl opacity-80">👁️</span> SYSTEM INSIGHTS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
            {insights.map((insight) => (
              <div key={insight.id} className="p-4 rounded-lg bg-bg-void/60 border border-border-subtle hover:border-border-active transition-colors shadow-inner flex flex-col justify-between">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mb-3 inline-block ${
                    insight.category === "warning" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    insight.category === "coaching" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                    insight.category === "trend" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                    "bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid"
                  }`}>
                    {insight.category}
                  </span>
                  <p className="text-sm text-text-primary leading-relaxed mb-3">{insight.content}</p>
                </div>
                <span className="text-[10px] text-text-muted font-medium">
                  {new Date(insight.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Recurring Weekly Quest (3-Hour Target) ───── */}
      {weeklyQuest && (
        <div className="system-card p-6 mb-8 border border-accent-primary/30 bg-bg-panel/70 relative overflow-hidden group">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid tracking-wider uppercase font-['Rajdhani']">
                  Streak Quest
                </span>
                <span className="text-xs text-text-muted font-['Rajdhani'] font-medium">
                  Resets in {weeklyQuest.daysRemaining}d (Sunday 23:59)
                </span>
              </div>
              <h2 className="text-xl font-bold text-text-primary font-['Rajdhani']">
                Cumulative Focus
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs text-text-muted font-['Rajdhani'] block uppercase tracking-wider">Level-Scaled Payout</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-accent-text-light font-['Rajdhani']">+{weeklyQuest.xpReward} XP</span>
                  <span className="text-sm font-bold text-accent-text-light/80 font-['Rajdhani']">+{weeklyQuest.sylphReward} Sylph</span>
                </div>
              </div>
              <span className={`px-3 py-1 text-xs font-bold rounded-full font-['Rajdhani'] uppercase tracking-wider ${
                weeklyQuest.isCompleted 
                  ? "bg-green-500/20 text-green-400 border border-green-500/40" 
                  : "bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid"
              }`}>
                {weeklyQuest.isCompleted ? "Milestone Achieved" : "In Progress"}
              </span>
            </div>
          </div>

          {/* Progress Bar & Stats */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-['Rajdhani'] font-bold text-text-secondary">
              <span>{Math.floor(weeklyQuest.progressMinutes / 60)}h {weeklyQuest.progressMinutes % 60}m / 3h 00m</span>
              <span>{weeklyQuest.percentComplete}%</span>
            </div>
            <div className="h-2.5 bg-bg-void/80 rounded-full overflow-hidden border border-border-subtle relative">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${weeklyQuest.percentComplete}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ─── Today's Quests ──────────────────────────── */}
        <div className="system-card p-6">
          <h2
            className="text-xl font-bold mb-5 text-accent-text-light font-['Rajdhani']"
          >
            Today's Quests
          </h2>
          {quests.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border-subtle rounded-lg">
              <p className="text-sm text-text-secondary">
                No quests assigned. Create a Goal to receive quests from The System.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-bg-panel border border-border-subtle hover:border-border-active shadow-[var(--card-shadow)] transition-colors gap-4 relative hover:z-50"
                  style={{
                    borderLeft: `3px solid ${
                      quest.status === "COMPLETED"
                        ? "var(--accent-green)"
                        : quest.status === "FAILED"
                        ? "var(--accent-red)"
                        : "var(--accent-purple)"
                    }`,
                  }}
                >
                  <div className="min-w-0 pr-2 flex-1">
                    <div className="flex items-center gap-3 mb-1.5 min-w-0">
                      <div className="relative group/title cursor-default min-w-0">
                        <p className="text-base font-medium truncate transition-colors">{quest.title}</p>
                        {/* Glassmorphism Tooltip */}
                        <div className="absolute left-0 top-full mt-2 hidden group-hover/title:block z-[100] bg-bg-abyss/95 backdrop-blur-xl text-text-primary text-sm p-3 rounded-lg shadow-2xl border border-border-subtle whitespace-normal min-w-[200px] w-max max-w-[300px]">
                          {quest.title}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-wider shrink-0 ${
                        quest.difficulty === "EASY" ? "bg-green-500/20 text-green-400" :
                        quest.difficulty === "HARD" ? "bg-orange-500/20 text-orange-400" :
                        quest.difficulty === "EXPERT" ? "bg-red-500/20 text-red-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>
                        {quest.difficulty ? quest.difficulty.charAt(0) + quest.difficulty.slice(1).toLowerCase() : "Normal"}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted truncate">
                      Target: {quest.requiredMinutes} min • +{quest.xpReward} XP
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
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
                      {quest.status === "IN_PROGRESS" ? "In Progress" : quest.status.charAt(0) + quest.status.slice(1).toLowerCase()}
                    </span>
                    {quest.status === "PENDING" && (
                      <button
                        onClick={() => router.push(`/focus?questId=${quest.id}&subjectName=${encodeURIComponent(quest.title)}`)}
                        className="px-4 py-2 text-sm font-bold rounded bg-accent-dim text-accent-light hover:bg-accent-mid hover:text-white transition-colors"
                        style={{ fontFamily: "'Rajdhani', sans-serif" }}
                      >
                        Start
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
              className="text-xl font-bold text-accent-text-light font-['Rajdhani']"
            >
              Friends
            </h2>
            <Link
              href="/social"
              className="text-xs tracking-wider uppercase hover:text-text-primary transition-colors text-accent-text-light font-['Rajdhani']"
            >
              View All →
            </Link>
          </div>

          {friends.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border-subtle rounded-lg">
              <p className="text-sm text-text-secondary mb-4">
                Add friends to study together
              </p>
              <Link
                href="/social"
                className="text-sm px-5 py-2 rounded transition-all inline-block font-bold tracking-wide hover:-translate-y-0.5"
                style={{
                  background: "var(--accent-primary-dim)",
                  border: "1px solid var(--accent-primary-mid)",
                  color: "var(--accent-text-light)",
                  boxShadow: "var(--card-shadow)"
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
                  className="flex items-center justify-between p-2 rounded bg-bg-panel"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`rank-badge rank-${friend.hunterRank} w-8 h-8 text-xs`}>
                        {friend.hunterRank}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-bg-panel" />
                    </div>
                    <div>
                      <Link href={`/profile/${friend.username}`} className="text-sm font-medium hover:underline hover:text-text-primary transition-colors block">
                        {friend.name || friend.username}
                      </Link>
                      <p className="text-xs text-text-muted">
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
                  className="flex items-center justify-between p-2 rounded opacity-60 bg-bg-panel"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`rank-badge rank-${friend.hunterRank} w-8 h-8 text-xs`}>
                        {friend.hunterRank}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gray-600 border-2 border-bg-panel" />
                    </div>
                    <div>
                      <Link href={`/profile/${friend.username}`} className="text-sm font-medium hover:underline hover:text-text-primary transition-colors block">
                        {friend.name || friend.username}
                      </Link>
                      <p className="text-xs text-text-muted">
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
