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
        if (data.achievements) {
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
        throw new Error(data.error || "Failed to claim");
      }
      mutateUser(data.user);
      fetchAchievements(); // Refresh list to mark as claimed
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(""), 3000);
    } finally {
      setClaiming(null);
    }
  };

  if (!user || loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  // Calculate overall stats
  const totalAchievements = achievements.length;
  const claimedCount = achievements.filter(a => a.isClaimed).length;
  const completionPercent = totalAchievements > 0 ? Math.round((claimedCount / totalAchievements) * 100) : 0;

  // Group by category
  const categories = ["Study", "Subjects", "Streaks", "Rank", "Social", "Quests", "Exploration"];
  const grouped: Record<string, EnrichedAchievement[]> = {};
  categories.forEach(c => {
    grouped[c] = achievements.filter(a => a.category === c);
  });

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">System → Achievements</p>
      
      {/* Overall Header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(20,20,30,0.8) 0%, rgba(10,10,15,0.9) 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "16px",
        padding: "32px",
        marginBottom: "40px",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Glow backdrop */}
        <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: "var(--accent-cyan)", filter: "blur(100px)", opacity: 0.15, borderRadius: "50%" }} />

        <h1 className="settings-page-header" style={{ marginBottom: "8px" }}>Achievement Completion</h1>
        
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "16px" }}>
          <span style={{ fontSize: "2.5rem", fontWeight: 800, fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}>
            {claimedCount} / {totalAchievements}
          </span>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-cyan)" }}>
            {completionPercent}%
          </span>
        </div>

        {/* Global Progress Bar */}
        <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{
            width: `${completionPercent}%`,
            height: "100%",
            background: "linear-gradient(90deg, var(--accent-cyan), #3b82f6)",
            boxShadow: "0 0 10px var(--accent-cyan)",
            transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)"
          }} />
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 flex justify-between items-center animate-fade-in">
          <p className="font-['Rajdhani']">{error}</p>
        </div>
      )}

      {/* Categories */}
      {categories.map(cat => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;

        return (
          <div key={cat} style={{ marginBottom: "48px" }}>
            <h2 style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "1.2rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--text-primary)",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              paddingBottom: "8px",
              marginBottom: "20px"
            }}>
              {cat}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
              {items.map((ach) => {
                const colors = RARITY_COLORS[ach.rarity];
                const pct = Math.min(100, Math.round((ach.currentProgress / ach.target) * 100));
                const canClaim = ach.currentProgress >= ach.target && !ach.isClaimed;

                return (
                  <div
                    key={ach.id}
                    style={{
                      background: "rgba(10,10,18,0.6)",
                      border: `1px solid ${ach.isClaimed ? "rgba(255,255,255,0.05)" : canClaim ? colors.main : "rgba(255,255,255,0.05)"}`,
                      borderRadius: "12px",
                      padding: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      boxShadow: canClaim ? `0 0 20px ${colors.glow}` : "none",
                      position: "relative",
                      overflow: "hidden",
                      transition: "all 0.3s ease",
                      opacity: ach.isClaimed ? 0.6 : 1,
                      filter: ach.isClaimed ? "grayscale(50%)" : "none"
                    }}
                  >
                    {/* Background Rarity Glow (subtle) */}
                    <div style={{
                      position: "absolute",
                      top: 0, left: 0, bottom: 0, width: "4px",
                      background: colors.main,
                      boxShadow: `0 0 15px ${colors.main}`
                    }} />

                    {/* Left: Info */}
                    <div style={{ paddingLeft: "16px", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                        <h3 style={{
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                          fontSize: "1.2rem",
                          color: "var(--text-primary)",
                          letterSpacing: "0.05em"
                        }}>
                          {ach.title}
                        </h3>
                        <span style={{
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                          fontSize: "0.65rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: colors.glow,
                          color: colors.main,
                          border: `1px solid ${colors.main}40`
                        }}>
                          {ach.rarity}
                        </span>
                      </div>
                      
                      <p style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        marginBottom: "16px"
                      }}>
                        {ach.description}
                      </p>

                      {/* Progress Bar Area */}
                      {!ach.isClaimed && (
                        <div style={{ maxWidth: "400px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontFamily: "'Rajdhani', sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            <span>{ach.currentProgress} / {ach.target}</span>
                            <span>{pct}%</span>
                          </div>
                          <div style={{ display: "flex", gap: "2px", height: "8px" }}>
                            {/* Render blocky progress bar */}
                            {[...Array(10)].map((_, i) => {
                              const blockPct = i * 10;
                              const isFilled = pct > blockPct;
                              return (
                                <div
                                  key={i}
                                  style={{
                                    flex: 1,
                                    background: isFilled ? colors.main : "rgba(255,255,255,0.05)",
                                    borderRadius: "1px",
                                    boxShadow: isFilled ? `0 0 5px ${colors.main}50` : "none"
                                  }}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Reward & Claim */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px", minWidth: "160px" }}>
                      
                      {/* Reward Badge */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "rgba(0,0,0,0.4)",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.05)"
                      }}>
                        {ach.reward.type === "SYLPH" && (
                           <>
                             <img src="/sylph-logo.jpg" alt="Sylph" className="w-4 h-4 rounded-full" />
                             <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--accent-cyan)" }}>
                               {ach.reward.amount} SYLPH
                             </span>
                           </>
                        )}
                        {ach.reward.type === "XP" && (
                           <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "#f59e0b" }}>
                             +{ach.reward.amount} XP
                           </span>
                        )}
                        {ach.reward.type === "ITEM" && (
                           <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--accent-text-light)" }}>
                             1x {ach.reward.itemKey?.replace(/_/g, " ")}
                           </span>
                        )}
                      </div>

                      {/* Claim Button */}
                      {ach.isClaimed ? (
                        <div style={{
                          padding: "8px 20px",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.3)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "6px",
                          background: "transparent"
                        }}>
                          Claimed
                        </div>
                      ) : canClaim ? (
                        <button
                          onClick={() => handleClaim(ach.id)}
                          disabled={claiming === ach.id}
                          style={{
                            padding: "8px 20px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "#fff",
                            background: colors.main,
                            border: "none",
                            borderRadius: "6px",
                            boxShadow: `0 0 15px ${colors.glow}`,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            opacity: claiming === ach.id ? 0.7 : 1
                          }}
                        >
                          {claiming === ach.id ? "Claiming..." : "Claim Reward"}
                        </button>
                      ) : (
                        <div style={{
                          padding: "8px 20px",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.15)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        )
      })}
    </div>
  );
}
