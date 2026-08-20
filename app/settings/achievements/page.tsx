"use client";

import { useState, useEffect } from "react";
import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { ACHIEVEMENTS_CATALOG, RARITY_COLORS, AchievementDef } from "@/lib/achievements-catalog";

type EnrichedAchievement = AchievementDef & {
  currentProgress: number;
  isClaimed: boolean;
};

export default function AchievementsPage() {
  const { user, token, mutateUser } = useAuth();
  const [achievements, setAchievements] = useState<EnrichedAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchAchievements = () => {
    if (!token) return;
    fetch("/api/achievements", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => (res.ok ? res.json().catch(() => ({})) : {}))
      .then(data => {
        if (data?.achievements) {
          setAchievements(data.achievements);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAchievements();
  }, [token]);

  const handleClaim = async (id: string) => {
    if (claiming || !token) return;
    setClaiming(id);
    setError("");
    try {
      const res = await fetch("/api/achievements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ achievementId: id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to claim reward");
      }
      if (data.user) {
        mutateUser(data.user);
      }
      fetchAchievements(); // Refresh list to update claimed state
    } catch (err: any) {
      setError(err.message || "Failed to claim reward");
      setTimeout(() => setError(""), 3500);
    } finally {
      setClaiming(null);
    }
  };

  if (!user || loading) {
    return (
      <div className="settings-page-container">
        <BackToSettings />
        <p className="settings-page-breadcrumb">System → Achievements</p>
        <div className="p-12 text-center text-text-muted font-['Rajdhani'] animate-pulse">
          Accessing System Achievements Database...
        </div>
      </div>
    );
  }

  // Calculate overall stats
  const totalAchievements = achievements.length;
  const claimedCount = achievements.filter(a => a.isClaimed).length;
  const completionPercent = totalAchievements > 0 ? Math.round((claimedCount / totalAchievements) * 100) : 0;

  // Group by category
  const categories = ["Study", "Streaks", "Rank", "Social", "Quests", "Exploration"];
  const grouped: Record<string, EnrichedAchievement[]> = {};
  categories.forEach(c => {
    grouped[c] = achievements.filter(a => a.category === c);
  });

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">System → Achievements</p>
      
      {/* Overall Header Card */}
      <div
        className="system-card relative overflow-hidden p-8 rounded-2xl mb-10"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--card-shadow, 0 4px 20px rgba(0,0,0,0.05))"
        }}
      >
        {/* Glow backdrop */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            background: "var(--accent-primary)",
            filter: "blur(110px)",
            opacity: 0.12,
            borderRadius: "50%",
            pointerEvents: "none"
          }}
        />

        <h1 className="settings-page-header mb-2 font-['Rajdhani'] text-2xl md:text-3xl font-bold text-text-primary">
          Achievement Completion
        </h1>
        
        <div className="flex items-baseline gap-4 mb-4">
          <span className="text-4xl md:text-5xl font-extrabold font-['Rajdhani'] text-text-primary tracking-tight">
            {claimedCount} / {totalAchievements}
          </span>
          <span className="text-xl font-bold font-['Rajdhani'] text-accent-text-light">
            {completionPercent}%
          </span>
        </div>

        {/* Global Progress Bar */}
        <div
          className="w-full h-2.5 rounded-full overflow-hidden"
          style={{
            background: "var(--bg-abyss)",
            border: "1px solid var(--border-subtle)"
          }}
        >
          <div
            style={{
              width: `${completionPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, var(--accent-primary), #3b82f6)",
              boxShadow: "0 0 10px var(--accent-primary)",
              transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
            }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 px-4 py-3 rounded-xl mb-6 flex justify-between items-center animate-fade-in font-['Rajdhani'] font-semibold">
          <p>{error}</p>
        </div>
      )}

      {/* Categories */}
      {categories.map(cat => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;

        return (
          <div key={cat} className="mb-12">
            <h2
              className="font-['Rajdhani'] font-bold text-lg uppercase tracking-widest text-text-primary pb-2 mb-5 flex items-center gap-2"
              style={{
                borderBottom: "1px solid var(--border-subtle)"
              }}
            >
              <span>{cat}</span>
              <span className="text-xs font-normal text-text-muted">
                ({items.filter(a => a.isClaimed).length}/{items.length})
              </span>
            </h2>

            <div className="grid grid-cols-1 gap-4">
              {items.map((ach) => {
                const colors = RARITY_COLORS[ach.rarity] || RARITY_COLORS.Common;
                const pct = Math.min(100, Math.round((ach.currentProgress / ach.target) * 100));
                const canClaim = ach.currentProgress >= ach.target && !ach.isClaimed;

                return (
                  <div
                    key={ach.id}
                    className="relative rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 overflow-hidden"
                    style={{
                      background: "var(--bg-panel)",
                      border: `1px solid ${ach.isClaimed ? "var(--border-subtle)" : canClaim ? colors.main : "var(--border-subtle)"}`,
                      boxShadow: canClaim ? `0 0 20px ${colors.glow}` : "var(--card-shadow, 0 2px 8px rgba(0,0,0,0.03))",
                      opacity: ach.isClaimed ? 0.75 : 1,
                      filter: ach.isClaimed ? "grayscale(30%)" : "none"
                    }}
                  >
                    {/* Left Accent Bar */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: "4px",
                        background: colors.main,
                        boxShadow: `0 0 10px ${colors.main}`
                      }}
                    />

                    {/* Left: Info & Progress */}
                    <div className="pl-3 flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <h3 className="font-['Rajdhani'] font-bold text-lg text-text-primary tracking-wide">
                          {ach.title}
                        </h3>
                        <span
                          className="font-['Rajdhani'] font-bold text-[11px] uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                          style={{
                            background: colors.glow,
                            color: colors.main,
                            border: `1px solid ${colors.main}50`
                          }}
                        >
                          {ach.rarity}
                        </span>
                      </div>
                      
                      <p className="font-['Rajdhani'] text-sm text-text-secondary mb-3">
                        {ach.description}
                      </p>

                      {/* Progress Bar Area */}
                      {!ach.isClaimed && (
                        <div className="max-w-md">
                          <div className="flex justify-between mb-1 font-['Rajdhani'] text-xs text-text-secondary font-medium">
                            <span>{ach.currentProgress} / {ach.target}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="flex gap-1 h-2">
                            {[...Array(10)].map((_, i) => {
                              const blockPct = i * 10;
                              const isFilled = pct > blockPct;
                              return (
                                <div
                                  key={i}
                                  className="flex-1 rounded-sm transition-all duration-300"
                                  style={{
                                    background: isFilled ? colors.main : "var(--bg-abyss)",
                                    border: isFilled ? "none" : "1px solid var(--border-subtle)",
                                    boxShadow: isFilled ? `0 0 4px ${colors.main}60` : "none"
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Reward & Claim */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 sm:min-w-[160px] pt-2 sm:pt-0 border-t sm:border-t-0 border-border-subtle">
                      {/* Reward Badge */}
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{
                          background: "var(--bg-abyss)",
                          border: "1px solid var(--border-subtle)"
                        }}
                      >
                        {ach.reward.type === "SYLPH" && (
                          <>
                            <img src="/sylph-logo.jpg" alt="Sylph" className="w-4 h-4 rounded-full" />
                            <span className="font-['Rajdhani'] font-bold text-sm text-accent-text-light">
                              {ach.reward.amount} SYLPH
                            </span>
                          </>
                        )}
                        {ach.reward.type === "XP" && (
                          <span className="font-['Rajdhani'] font-bold text-sm text-amber-500 dark:text-amber-400">
                            +{ach.reward.amount} XP
                          </span>
                        )}
                        {ach.reward.type === "ITEM" && (
                          <span className="font-['Rajdhani'] font-bold text-sm text-purple-600 dark:text-purple-400">
                            {ach.reward.amount}x {ach.reward.itemKey?.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>

                      {/* Claim Button / Status */}
                      {ach.isClaimed ? (
                        <div
                          className="px-5 py-2 font-['Rajdhani'] font-bold text-xs tracking-widest uppercase rounded-lg text-text-muted flex items-center gap-1.5"
                          style={{
                            background: "var(--bg-abyss)",
                            border: "1px solid var(--border-subtle)"
                          }}
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Claimed
                        </div>
                      ) : canClaim ? (
                        <button
                          onClick={() => handleClaim(ach.id)}
                          disabled={claiming === ach.id}
                          className="px-5 py-2 font-['Rajdhani'] font-bold text-xs tracking-widest uppercase text-white rounded-lg transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-70 cursor-pointer"
                          style={{
                            background: colors.main,
                            boxShadow: `0 0 15px ${colors.glow}`
                          }}
                        >
                          {claiming === ach.id ? "Claiming..." : "Claim Reward"}
                        </button>
                      ) : (
                        <div className="px-4 py-2 font-['Rajdhani'] font-bold text-xs tracking-widest uppercase text-text-muted flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Locked
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
