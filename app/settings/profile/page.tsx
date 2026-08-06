"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { COSMETICS_CATALOG, CosmeticCategory, CosmeticItem } from "@/lib/cosmetics-catalog";
import BackToSettings from "@/app/components/BackToSettings";

const RARITY_COLORS = {
  Common: { text: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/10", glow: "rgba(34,197,94,0.4)" },
  Rare: { text: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/10", glow: "rgba(59,130,246,0.4)" },
  Epic: { text: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-500/10", glow: "rgba(168,85,247,0.4)" },
  Legendary: { text: "text-orange-400", border: "border-orange-500/30", bg: "bg-orange-500/10", glow: "rgba(249,115,22,0.4)" },
  Mythic: { text: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/10", glow: "rgba(234,179,8,0.4)" },
};

export default function ScholarProfilePage() {
  const { user, token, mutateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<CosmeticCategory>("AVATAR");
  const [cosmetics, setCosmetics] = useState<any[]>([]);
  const [activeCosmetics, setActiveCosmetics] = useState<any>({});
  const [stats, setStats] = useState<any>(null);
  
  // Loading states
  const [initialLoad, setInitialLoad] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    
    // Fetch cosmetics
    fetch("/api/cosmetics", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setCosmetics(data.cosmetics || []);
        setActiveCosmetics(data.active || {});
      })
      .catch(console.error);

    // Fetch stats
    fetch("/api/profile/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.stats) setStats(data);
      })
      .catch(console.error)
      .finally(() => setInitialLoad(false));

  }, [token]);

  if (!user || initialLoad) return <div className="p-8 text-center text-gray-400 font-['Rajdhani']">Loading Scholar Data...</div>;

  const hasCosmetic = (category: string, item: CosmeticItem) => {
    if (item.unlockCondition === "Default") return true;
    return cosmetics.some(c => c.category === category && c.itemKey === item.id);
  };

  const handleEquip = async (category: string, itemKey: string) => {
    if (saving) return; // Prevent spam
    setSaving(itemKey);
    
    const key = `active${category.charAt(0) + category.slice(1).toLowerCase().replace(/_./g, m => m[1].toUpperCase())}`;
    const previousState = { ...activeCosmetics };
    
    // Optimistic Update
    setActiveCosmetics((prev: any) => ({ ...prev, [key]: itemKey }));

    try {
      const res = await fetch("/api/cosmetics", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, itemKey })
      });
      const data = await res.json();
      if (res.ok) {
        mutateUser(data.user);
      } else {
        // Rollback on failure
        setActiveCosmetics(previousState);
      }
    } catch (err) {
      console.error(err);
      setActiveCosmetics(previousState);
    } finally {
      setSaving(null);
    }
  };

  // Current selections based on optimistic state
  const currentAvatar = COSMETICS_CATALOG.AVATAR.find(a => a.id === (activeCosmetics.activeAvatar || "avatar_default"))?.value || "👤";
  const currentTitle = COSMETICS_CATALOG.TITLE.find(t => t.id === (activeCosmetics.activeTitle || "title_novice"))?.value || "Novice";
  const currentFrameClass = COSMETICS_CATALOG.FRAME.find(f => f.id === (activeCosmetics.activeFrame || "frame_default"))?.value || "none";
  const currentNameColorClass = COSMETICS_CATALOG.NAME_COLOR.find(c => c.id === (activeCosmetics.activeNameColor || "color_default"))?.value || "text-gray-300";

  // XP Progress Calculation
  const currentXP = user.currentXP || 0;
  const requiredXP = stats?.nextUnlock?.requiredXP || 1000;
  const xpPercent = Math.min(100, Math.round((currentXP / requiredXP) * 100));

  return (
    <div className="settings-page-container flex flex-col h-screen max-h-screen overflow-hidden max-w-[1400px] w-full">
      <div className="shrink-0">
        <BackToSettings />
        <p className="settings-page-breadcrumb">Identity → Scholar Profile</p>
      </div>

      <div className="flex flex-1 gap-8 mt-4 min-h-0">
        
        {/* LEFT PANE: SCHOLAR IDENTITY CARD */}
        <div className="w-[340px] lg:w-[380px] shrink-0 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-8">
          
          {/* Main Hero Card */}
          <div className="shrink-0 bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 relative overflow-hidden shadow-2xl flex flex-col items-center text-center">
            {/* Background ambient glow */}
            <div className="absolute -top-20 -left-20 w-48 h-48 bg-[var(--accent-cyan)] opacity-10 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-purple-500 opacity-10 blur-3xl rounded-full pointer-events-none" />

            <div className={`relative flex items-center justify-center mb-6 w-32 h-32 shrink-0 text-6xl rounded-2xl bg-black/60 shadow-inner overflow-hidden ${currentFrameClass !== "none" ? currentFrameClass : "border border-white/5"}`}>
              {currentAvatar.startsWith("/") || currentAvatar.startsWith("http") ? (
                <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="drop-shadow-lg">{currentAvatar}</span>
              )}
            </div>

            <h2 className={`${currentNameColorClass} text-3xl font-bold font-['Rajdhani'] tracking-wide mb-2 transition-all duration-300`}>
              {user.username}
            </h2>

            <div className="border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] px-4 py-1 rounded-full text-xs font-bold font-['Rajdhani'] tracking-widest uppercase mb-6 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              {currentTitle}
            </div>

            {/* Level & XP */}
            <div className="w-full bg-black/40 rounded-xl p-4 border border-white/5 relative z-10">
              <div className="flex justify-between items-end mb-2 font-['Rajdhani']">
                <div>
                  <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Level</span>
                  <span className="text-2xl font-bold text-white ml-2">{user.level}</span>
                </div>
                <div>
                  <span className="text-[var(--accent-cyan)] text-sm font-bold tracking-wider">{user.hunterRank}-RANK</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-1 relative">
                <div 
                  className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 shadow-[0_0_10px_var(--accent-cyan)] transition-all duration-1000"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[0.65rem] font-['Rajdhani'] text-gray-500 tracking-wider">
                <span>{currentXP} XP</span>
                <span>{requiredXP} XP</span>
              </div>
            </div>
          </div>

          {/* Statistics Grid */}
          {stats && (
            <div className="shrink-0 grid grid-cols-2 gap-3">
              <StatBlock label="Joined" value={new Date(stats.stats.joinedDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} icon="🗓️" />
              <StatBlock label="Study Time" value={`${stats.stats.totalStudyHours} hrs`} icon="⏳" />
              <StatBlock label="Quests" value={stats.stats.questsCompleted} icon="📜" />
              <StatBlock label="Streak" value={`${stats.stats.streakDays} days`} icon="🔥" highlight />
            </div>
          )}

          {/* Next Unlock Preview */}
          <div className="shrink-0 bg-gradient-to-r from-purple-900/20 to-black/40 border border-purple-500/20 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500 opacity-20 blur-2xl rounded-full pointer-events-none" />
            <h3 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-purple-400 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              Next Unlock
            </h3>
            <p className="text-sm font-['Rajdhani'] text-gray-300">
              Reach <span className="text-white font-bold">Level {stats?.nextUnlock?.nextLevel || user.level + 1}</span> to decrypt new cosmetic records.
            </p>
          </div>
        </div>

        {/* RIGHT PANE: CUSTOMIZATION ARSENAL */}
        <div className="flex-1 flex flex-col bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          
          {/* Header Tabs */}
          <div className="flex border-b border-white/10 bg-black/40 shrink-0">
            {["AVATAR", "FRAME", "TITLE", "NAME_COLOR"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as CosmeticCategory)}
                className={`flex-1 py-4 font-['Rajdhani'] font-bold text-sm tracking-widest transition-all relative ${
                  activeTab === tab ? "text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                {tab.replace("_", " ")}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)]" />
                )}
              </button>
            ))}
          </div>

          {/* Scrollable Inventory Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-black/20">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
              {COSMETICS_CATALOG[activeTab].map((item) => {
                const unlocked = hasCosmetic(activeTab, item);
                const isEquipped = 
                  (activeTab === "AVATAR" && activeCosmetics.activeAvatar === item.id) ||
                  (activeTab === "FRAME" && activeCosmetics.activeFrame === item.id) ||
                  (activeTab === "TITLE" && activeCosmetics.activeTitle === item.id) ||
                  (activeTab === "NAME_COLOR" && activeCosmetics.activeNameColor === item.id);
                
                const rStyle = RARITY_COLORS[item.rarity as keyof typeof RARITY_COLORS] || RARITY_COLORS.Common;
                
                return (
                  <div 
                    key={item.id}
                    className={`relative p-5 rounded-xl border flex flex-col transition-all duration-300 ${
                      isEquipped ? `bg-white/5 ${rStyle.border} shadow-[0_0_20px_${rStyle.glow}]` :
                      unlocked ? `bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/[0.02]` :
                      `bg-black/60 border-white/5 opacity-60 grayscale`
                    }`}
                  >
                    {/* Visual Preview */}
                    <div className="flex gap-4 mb-4">
                      <div className={`w-14 h-14 shrink-0 flex items-center justify-center text-3xl bg-black/60 rounded-lg border border-white/5 relative overflow-hidden`}>
                        {activeTab === "AVATAR" && <span className={unlocked ? "" : "opacity-50"}>{item.value}</span>}
                        {activeTab === "FRAME" && <div className={`w-full h-full rounded ${item.value}`}></div>}
                        {activeTab === "TITLE" && <span className="text-[0.5rem] font-bold border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 px-1 py-1 rounded-full uppercase tracking-widest leading-none truncate w-full text-center">{item.value}</span>}
                        {activeTab === "NAME_COLOR" && <span className={`text-sm ${item.value}`}>Hunter</span>}
                        
                        {!unlocked && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                            <svg className="w-6 h-6" fill="none" stroke="#ef4444" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h3 className={`font-['Rajdhani'] font-bold text-lg tracking-wide leading-tight break-words ${unlocked ? "text-white" : "text-gray-400"}`}>
                            {item.name}
                          </h3>
                          <span className={`shrink-0 text-[0.6rem] font-['Rajdhani'] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${rStyle.text} ${rStyle.border} ${rStyle.bg}`}>
                            {item.rarity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-sans leading-relaxed line-clamp-2 pr-2">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center gap-3 flex-wrap">
                      <span className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest text-gray-600 leading-tight flex-1 pr-2 min-w-[120px]">
                        {unlocked ? `Source: ${item.source}` : `Req: ${item.unlockCondition}`}
                      </span>

                      <div className="shrink-0">
                        {isEquipped ? (
                          <div className="text-[0.7rem] font-['Rajdhani'] font-bold uppercase tracking-widest text-white px-4 py-1.5 rounded-lg border border-white/20 bg-white/10 text-center">
                            Equipped
                          </div>
                        ) : unlocked ? (
                          <button
                            onClick={() => handleEquip(activeTab, item.id)}
                            disabled={saving === item.id}
                            className="text-[0.7rem] font-['Rajdhani'] font-bold uppercase tracking-widest text-white px-4 py-1.5 rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/40 hover:shadow-[0_0_10px_var(--accent-cyan)] transition-all w-full"
                          >
                            {saving === item.id ? "..." : "Equip"}
                          </button>
                        ) : (
                          <div className="text-[0.7rem] font-['Rajdhani'] font-bold uppercase tracking-widest text-gray-600 flex items-center justify-center w-full">
                            Locked
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  );
}

// Subcomponent for simple stat blocks
function StatBlock({ label, value, icon, highlight }: { label: string, value: string | number, icon: string, highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border flex flex-col bg-black/40 ${highlight ? "border-[var(--accent-cyan)]/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]" : "border-white/5"}`}>
      <span className="text-xl mb-2">{icon}</span>
      <span className={`text-lg font-bold font-['Rajdhani'] ${highlight ? "text-[var(--accent-cyan)]" : "text-white"}`}>{value}</span>
      <span className="text-[0.65rem] font-['Rajdhani'] font-bold uppercase tracking-widest text-gray-500">{label}</span>
    </div>
  );
}
