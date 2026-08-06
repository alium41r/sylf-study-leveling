"use client";

import { useState, useEffect, useMemo } from "react";
import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { ARCHIVE_ENTRIES, ArchiveEntry, ArchiveCategory } from "@/lib/archive-catalog";

const CATEGORIES: ArchiveCategory[] = [
  "The System",
  "Economy",
  "Quests",
  "Inventory & Collections",
  "Social & Guilds",
  "Lore",
  "Updates"
];

// Helper to determine if an entry is unlocked
function isUnlocked(entry: ArchiveEntry, user: any): boolean {
  if (!user) return false;
  if (entry.requirement.type === "NONE") return true;
  if (entry.requirement.type === "LEVEL") return user.level >= entry.requirement.value;
  if (entry.requirement.type === "RANK") {
    const ranks = { "E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6 };
    const userRankVal = ranks[user.hunterRank as keyof typeof ranks] || 1;
    const reqRankVal = ranks[entry.requirement.value as keyof typeof ranks] || 99;
    return userRankVal >= reqRankVal;
  }
  return false;
}

export default function ArchivePage() {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string>("sys_leveling");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  // Load local storage
  useEffect(() => {
    try {
      const favs = localStorage.getItem("archive_favorites");
      if (favs) setFavorites(JSON.parse(favs));
      const rec = localStorage.getItem("archive_recents");
      if (rec) setRecents(JSON.parse(rec));
    } catch (e) {}
  }, []);

  // Save favorites
  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem("archive_favorites", JSON.stringify(next));
      return next;
    });
  };

  // Add to recents when active changes
  useEffect(() => {
    if (activeId) {
      setRecents(prev => {
        const next = [activeId, ...prev.filter(x => x !== activeId)].slice(0, 5); // keep last 5
        localStorage.setItem("archive_recents", JSON.stringify(next));
        return next;
      });
    }
  }, [activeId]);

  const activeEntry = ARCHIVE_ENTRIES.find(e => e.id === activeId) || ARCHIVE_ENTRIES[0];
  const isActiveUnlocked = isUnlocked(activeEntry, user);

  // Search logic
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return ARCHIVE_ENTRIES;
    const q = searchQuery.toLowerCase();
    return ARCHIVE_ENTRIES.filter(e => {
      // If locked, hide content from search, but title might match if we allow it? Let's hide title too.
      if (!isUnlocked(e, user)) return false; 
      return e.title.toLowerCase().includes(q) || 
             e.content.some(c => 'text' in c && c.text.toLowerCase().includes(q));
    });
  }, [searchQuery, user]);

  const stats = useMemo(() => {
    if (!user) return { unlocked: 0, total: ARCHIVE_ENTRIES.length, pct: 0 };
    const unlocked = ARCHIVE_ENTRIES.filter(e => isUnlocked(e, user)).length;
    const total = ARCHIVE_ENTRIES.length;
    return { unlocked, total, pct: Math.round((unlocked / total) * 100) };
  }, [user]);

  if (!user) return <div className="p-8 text-center text-gray-400">Loading Codex...</div>;

  return (
    <div className="settings-page-container flex flex-col h-screen max-h-screen overflow-hidden">
      <div className="shrink-0">
        <BackToSettings />
        <p className="settings-page-breadcrumb">System → Archive (Codex)</p>
      </div>

      <div className="flex flex-1 gap-6 mt-4 min-h-0">
        {/* LEFT PANE: NAVIGATION */}
        <div className="w-1/3 max-w-[350px] flex flex-col bg-[#0a0a0f] border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
          
          {/* Header & Stats */}
          <div className="p-5 border-b border-white/10 bg-black/40 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent-cyan)] opacity-10 blur-3xl rounded-full" />
            <h2 className="font-['Rajdhani'] font-bold text-xl tracking-widest uppercase text-white mb-2">The Archive</h2>
            <div className="flex justify-between items-center text-xs font-['Rajdhani'] text-gray-400 tracking-wider">
              <span>Records Unlocked</span>
              <span className="text-[var(--accent-cyan)]">{stats.unlocked} / {stats.total} ({stats.pct}%)</span>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-white/10 w-full mt-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)] transition-all duration-1000"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-white/5 shrink-0 bg-black/20">
            <input 
              type="text" 
              placeholder="Search records..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)]/50 transition-all font-['Rajdhani']"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
            {searchQuery ? (
              <div>
                <h3 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-gray-500 mb-3 px-2">Search Results</h3>
                <div className="space-y-1">
                  {filteredEntries.map(entry => (
                    <NavItem 
                      key={entry.id} 
                      entry={entry} 
                      active={activeId === entry.id}
                      unlocked={true}
                      isFavorite={favorites.includes(entry.id)}
                      onClick={() => setActiveId(entry.id)} 
                    />
                  ))}
                  {filteredEntries.length === 0 && (
                    <div className="px-2 text-sm text-gray-500 italic font-['Rajdhani']">No records found.</div>
                  )}
                </div>
              </div>
            ) : (
              CATEGORIES.map(cat => {
                const catEntries = ARCHIVE_ENTRIES.filter(e => e.categoryId === cat);
                if (catEntries.length === 0) return null;
                return (
                  <div key={cat}>
                    <h3 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-[var(--accent-cyan)] mb-3 px-2 flex items-center gap-2">
                      <span className="w-2 h-[1px] bg-[var(--accent-cyan)] opacity-50" />
                      {cat}
                    </h3>
                    <div className="space-y-1">
                      {catEntries.map(entry => {
                        const unlocked = isUnlocked(entry, user);
                        return (
                          <NavItem 
                            key={entry.id} 
                            entry={entry} 
                            active={activeId === entry.id}
                            unlocked={unlocked}
                            isFavorite={favorites.includes(entry.id)}
                            onClick={() => setActiveId(entry.id)} 
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: CONTENT */}
        <div className="flex-1 flex flex-col bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl relative overflow-hidden">
          
          {/* Header */}
          <div className="shrink-0 p-8 pb-6 border-b border-white/5 relative z-10 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-['Rajdhani'] uppercase tracking-widest text-gray-500 px-2 py-1 rounded bg-white/5 border border-white/10">
                  {activeEntry.categoryId}
                </span>
                {!isActiveUnlocked && (
                  <span className="text-xs font-['Rajdhani'] uppercase tracking-widest text-red-500 px-2 py-1 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    RESTRICTED RECORD
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold font-['Rajdhani'] tracking-wider text-white">
                {isActiveUnlocked ? activeEntry.title : "[ DATA REDACTED ]"}
              </h1>
            </div>

            {/* Favorite Button */}
            {isActiveUnlocked && (
              <button 
                onClick={() => toggleFavorite(activeEntry.id)}
                className={`p-2 rounded-lg border transition-all ${
                  favorites.includes(activeEntry.id) 
                    ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]" 
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <svg className="w-5 h-5" fill={favorites.includes(activeEntry.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar p-8">
            {isActiveUnlocked ? (
              <div className="space-y-6 max-w-3xl animate-fade-in-up">
                {activeEntry.content.map((block, i) => {
                  if (block.type === "p") {
                    return <p key={i} className="text-gray-300 text-[0.95rem] leading-relaxed font-sans">{block.text}</p>
                  }
                  if (block.type === "h3") {
                    return <h3 key={i} className="text-[var(--accent-cyan)] font-['Rajdhani'] text-xl font-semibold tracking-wider mt-8">{block.text}</h3>
                  }
                  if (block.type === "list") {
                    return (
                      <ul key={i} className="space-y-2 ml-4">
                        {block.items?.map((item, j) => (
                          <li key={j} className="text-gray-300 text-[0.95rem] flex items-start gap-3">
                            <span className="text-[var(--accent-cyan)] mt-1.5 text-[0.5rem]">◆</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )
                  }
                  if (block.type === "lore") {
                    return (
                      <div key={i} className="my-8 p-6 bg-purple-900/10 border-l-2 border-purple-500/50 rounded-r-xl italic text-purple-200/80 font-['Rajdhani'] text-lg tracking-wide relative overflow-hidden shadow-[inset_10px_0_20px_rgba(168,85,247,0.05)]">
                        "{block.text}"
                      </div>
                    )
                  }
                  return null;
                })}

                {/* Related Entries Footer */}
                {activeEntry.related.length > 0 && (
                  <div className="mt-16 pt-8 border-t border-white/5">
                    <h4 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-gray-500 mb-4">Related Records</h4>
                    <div className="flex flex-wrap gap-3">
                      {activeEntry.related.map(rId => {
                        const rEntry = ARCHIVE_ENTRIES.find(e => e.id === rId);
                        if (!rEntry) return null;
                        const rUnlocked = isUnlocked(rEntry, user);
                        return (
                          <button
                            key={rId}
                            onClick={() => setActiveId(rId)}
                            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-[var(--accent-cyan)]/50 transition-colors text-sm font-['Rajdhani'] text-gray-300 flex items-center gap-2 group"
                          >
                            {!rUnlocked && <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                            {rUnlocked ? rEntry.title : "[ REDACTED ]"}
                            <span className="text-[var(--accent-cyan)] opacity-0 group-hover:opacity-100 transition-opacity ml-1">→</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* LOCKED GLITCH SCREEN */
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-pulse opacity-80">
                <div className="w-24 h-24 rounded-full border-2 border-red-500/30 flex items-center justify-center bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-['Rajdhani'] font-bold text-red-500 tracking-[0.2em] mb-2 glitch-text">RESTRICTED RECORD</h2>
                  <p className="text-red-400/60 text-sm tracking-widest uppercase">
                    Clearance Level Insufficient
                  </p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 px-6 py-3 rounded-lg inline-block">
                  <span className="text-xs font-['Rajdhani'] uppercase tracking-widest text-red-300">
                    Requirement: {activeEntry.requirement.type === "LEVEL" ? `Reach Level ${activeEntry.requirement.value}` : activeEntry.requirement.type === "RANK" ? `Achieve ${activeEntry.requirement.value}-Rank` : "Unknown"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Background decoration */}
          {isActiveUnlocked && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[var(--accent-cyan)] opacity-[0.02] blur-[100px] rounded-full pointer-events-none z-0" />
          )}
        </div>
      </div>
      
      {/* Required tailwind animations setup */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        .animate-fade-in-up {
          animation: fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .glitch-text {
          position: relative;
        }
        .glitch-text::before, .glitch-text::after {
          content: "RESTRICTED RECORD";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.5;
        }
        .glitch-text::before {
          color: #0ff;
          z-index: -1;
          transform: translate(-2px, 2px);
        }
        .glitch-text::after {
          color: #f0f;
          z-index: -2;
          transform: translate(2px, -2px);
        }
      `}} />
    </div>
  );
}

// Subcomponent for Navigation Item
function NavItem({ entry, active, unlocked, isFavorite, onClick }: { entry: ArchiveEntry, active: boolean, unlocked: boolean, isFavorite: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between group transition-all duration-200 ${
        active 
          ? "bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30" 
          : "hover:bg-white/5 border border-transparent"
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        {unlocked ? (
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${active ? "bg-[var(--accent-cyan)] shadow-[0_0_5px_var(--accent-cyan)]" : "bg-gray-600 group-hover:bg-gray-400"}`} />
        ) : (
          <svg className="w-3 h-3 text-red-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        )}
        <span className={`text-[0.9rem] truncate font-sans tracking-wide ${
          !unlocked ? "text-gray-600 italic" : active ? "text-white font-medium" : "text-gray-400 group-hover:text-gray-200"
        }`}>
          {unlocked ? entry.title : "[ REDACTED ]"}
        </span>
      </div>
      {isFavorite && (
        <svg className="w-3 h-3 text-yellow-500 opacity-70" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      )}
    </button>
  );
}
