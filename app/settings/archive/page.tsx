"use client";

import { useState, useEffect, useMemo } from "react";
import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { ARCHIVE_ENTRIES, ArchiveEntry, ArchiveCategory } from "@/lib/archive-catalog";

const CATEGORIES: ArchiveCategory[] = [
  "The System",
  "Focus & Study",
  "Quests & AI",
  "Economy & Shop",
  "Customization",
  "Social & Network",
  "Achievements",
];

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
        const next = [activeId, ...prev.filter(x => x !== activeId)].slice(0, 5);
        localStorage.setItem("archive_recents", JSON.stringify(next));
        return next;
      });
    }
  }, [activeId]);

  const activeEntry = ARCHIVE_ENTRIES.find(e => e.id === activeId) || ARCHIVE_ENTRIES[0];

  // Search logic (all entries are unlocked)
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return ARCHIVE_ENTRIES;
    const q = searchQuery.toLowerCase();
    return ARCHIVE_ENTRIES.filter(e => {
      return (
        e.title.toLowerCase().includes(q) ||
        e.categoryId.toLowerCase().includes(q) ||
        e.content.some(c => "text" in c && c.text.toLowerCase().includes(q)) ||
        e.content.some(c => "items" in c && c.items.some(item => item.toLowerCase().includes(q)))
      );
    });
  }, [searchQuery]);

  const totalRecords = ARCHIVE_ENTRIES.length;

  if (!user) {
    return (
      <div className="settings-page-container">
        <BackToSettings />
        <p className="settings-page-breadcrumb">System → Archive (Codex)</p>
        <div className="p-12 text-center text-text-muted font-['Rajdhani'] animate-pulse">
          Accessing System Codex Archive...
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page-container flex flex-col h-[calc(100vh-2rem)] max-h-screen overflow-hidden">
      <div className="shrink-0 mb-2">
        <BackToSettings />
        <p className="settings-page-breadcrumb">System → Archive (Codex)</p>
      </div>

      <div className="flex flex-1 gap-6 min-h-0 pb-4">
        {/* ─── LEFT PANE: NAVIGATION ─────────────────────────── */}
        <div
          className="w-full md:w-1/3 max-w-[360px] flex flex-col rounded-2xl overflow-hidden shadow-lg border shrink-0"
          style={{
            background: "var(--bg-panel)",
            borderColor: "var(--border-subtle)"
          }}
        >
          {/* Header & Stats */}
          <div
            className="p-5 border-b relative overflow-hidden shrink-0"
            style={{
              background: "var(--bg-shadow)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -30,
                right: -30,
                width: 140,
                height: 140,
                background: "var(--accent-primary)",
                opacity: 0.12,
                filter: "blur(40px)",
                borderRadius: "50%",
                pointerEvents: "none"
              }}
            />
            <h2 className="font-['Rajdhani'] font-bold text-xl tracking-widest uppercase text-text-primary mb-1.5">
              The Archive
            </h2>
            <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-semibold text-text-secondary tracking-wider">
              <span>Records Unlocked</span>
              <span className="text-accent-text-light font-bold">
                {totalRecords} / {totalRecords} (100%)
              </span>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 w-full mt-2.5 rounded-full overflow-hidden"
              style={{
                background: "var(--bg-abyss)",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: "100%",
                  background: "linear-gradient(90deg, var(--accent-primary), #3b82f6)",
                  boxShadow: "0 0 8px var(--accent-primary)"
                }}
              />
            </div>
          </div>

          {/* Search Box */}
          <div
            className="p-3 border-b shrink-0"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <div className="relative">
              <input
                type="text"
                placeholder="Search system records..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-all font-['Rajdhani']"
                style={{
                  background: "var(--bg-shadow)",
                  border: "1px solid var(--border-subtle)"
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Records List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
            {searchQuery ? (
              <div>
                <h3 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-text-muted font-bold mb-3 px-2">
                  Search Results ({filteredEntries.length})
                </h3>
                <div className="space-y-1">
                  {filteredEntries.map(entry => (
                    <NavItem
                      key={entry.id}
                      entry={entry}
                      active={activeId === entry.id}
                      isFavorite={favorites.includes(entry.id)}
                      onClick={() => setActiveId(entry.id)}
                    />
                  ))}
                  {filteredEntries.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-text-muted italic font-['Rajdhani']">
                      No records found matching &quot;{searchQuery}&quot;.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              CATEGORIES.map(cat => {
                const catEntries = ARCHIVE_ENTRIES.filter(e => e.categoryId === cat);
                if (catEntries.length === 0) return null;
                return (
                  <div key={cat}>
                    <h3 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-accent-text-light font-bold mb-2.5 px-2 flex items-center gap-2">
                      <span className="w-2.5 h-[2px] bg-accent-text-light rounded-full opacity-60" />
                      <span>{cat}</span>
                    </h3>
                    <div className="space-y-1">
                      {catEntries.map(entry => (
                        <NavItem
                          key={entry.id}
                          entry={entry}
                          active={activeId === entry.id}
                          isFavorite={favorites.includes(entry.id)}
                          onClick={() => setActiveId(entry.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── RIGHT PANE: CONTENT ───────────────────────────── */}
        <div
          className="flex-1 flex flex-col rounded-2xl border shadow-lg relative overflow-hidden"
          style={{
            background: "var(--bg-panel)",
            borderColor: "var(--border-subtle)"
          }}
        >
          {/* Header */}
          <div
            className="shrink-0 p-6 md:p-8 pb-5 border-b relative z-10 flex justify-between items-start"
            style={{
              borderColor: "var(--border-subtle)",
              background: "var(--bg-shadow)"
            }}
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="text-xs font-['Rajdhani'] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md"
                  style={{
                    background: "var(--bg-abyss)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)"
                  }}
                >
                  {activeEntry.categoryId}
                </span>
                <span
                  className="text-xs font-['Rajdhani'] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md text-emerald-500 flex items-center gap-1.5"
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.25)"
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  SYSTEM RECORD
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold font-['Rajdhani'] tracking-wide text-text-primary">
                {activeEntry.title}
              </h1>
            </div>

            {/* Favorite Button */}
            <button
              onClick={() => toggleFavorite(activeEntry.id)}
              className="p-2.5 rounded-xl border transition-all duration-200 cursor-pointer"
              title={favorites.includes(activeEntry.id) ? "Remove from favorites" : "Add to favorites"}
              style={{
                background: favorites.includes(activeEntry.id)
                  ? "rgba(234, 179, 8, 0.15)"
                  : "var(--bg-abyss)",
                borderColor: favorites.includes(activeEntry.id)
                  ? "rgba(234, 179, 8, 0.4)"
                  : "var(--border-subtle)",
                color: favorites.includes(activeEntry.id) ? "#eab308" : "var(--text-muted)"
              }}
            >
              <svg
                className="w-5 h-5"
                fill={favorites.includes(activeEntry.id) ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar p-6 md:p-8">
            <div className="space-y-6 max-w-3xl animate-fade-in-up">
              {activeEntry.content.map((block, i) => {
                if (block.type === "p") {
                  return (
                    <p
                      key={i}
                      className="text-text-secondary text-[0.95rem] leading-relaxed font-sans"
                    >
                      {block.text}
                    </p>
                  );
                }
                if (block.type === "h3") {
                  return (
                    <h3
                      key={i}
                      className="text-text-primary font-['Rajdhani'] text-xl font-bold tracking-wider mt-7 mb-2 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-4 bg-accent-text-light rounded-full" />
                      <span>{block.text}</span>
                    </h3>
                  );
                }
                if (block.type === "list") {
                  return (
                    <ul key={i} className="space-y-2.5 ml-2">
                      {block.items?.map((item, j) => (
                        <li
                          key={j}
                          className="text-text-secondary text-[0.95rem] flex items-start gap-3"
                        >
                          <span className="text-accent-text-light mt-1 text-xs">◆</span>
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }
                return null;
              })}

              {/* Related Entries Footer */}
              {activeEntry.related.length > 0 && (
                <div
                  className="mt-12 pt-6 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <h4 className="text-xs font-['Rajdhani'] uppercase tracking-widest text-text-muted font-bold mb-3.5">
                    Related Records
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {activeEntry.related.map(rId => {
                      const rEntry = ARCHIVE_ENTRIES.find(e => e.id === rId);
                      if (!rEntry) return null;
                      return (
                        <button
                          key={rId}
                          onClick={() => setActiveId(rId)}
                          className="px-4 py-2 rounded-xl transition-all duration-200 text-sm font-['Rajdhani'] font-semibold text-text-primary flex items-center gap-2 group cursor-pointer hover:border-accent-primary"
                          style={{
                            background: "var(--bg-shadow)",
                            border: "1px solid var(--border-subtle)"
                          }}
                        >
                          <span>{rEntry.title}</span>
                          <span className="text-accent-text-light opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                            →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subtle Background Glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.03] blur-[120px] rounded-full pointer-events-none z-0"
            style={{ background: "var(--accent-primary)" }}
          />
        </div>
      </div>

      {/* Scrollbar and animation styling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        
        .animate-fade-in-up {
          animation: archiveFadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes archiveFadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `
        }}
      />
    </div>
  );
}

// Subcomponent for Navigation Item
function NavItem({
  entry,
  active,
  isFavorite,
  onClick
}: {
  entry: ArchiveEntry;
  active: boolean;
  isFavorite: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between group transition-all duration-200 cursor-pointer"
      style={{
        background: active ? "var(--accent-primary-dim, rgba(6,182,212,0.12))" : "transparent",
        border: active
          ? "1px solid var(--accent-primary-mid, rgba(6,182,212,0.35))"
          : "1px solid transparent"
      }}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div
          className="w-2 h-2 rounded-full shrink-0 transition-all duration-200"
          style={{
            background: active ? "var(--accent-primary, #06b6d4)" : "var(--border-subtle)",
            boxShadow: active ? "0 0 6px var(--accent-primary, #06b6d4)" : "none"
          }}
        />
        <span
          className={`text-[0.9rem] truncate font-['Rajdhani'] tracking-wide ${
            active
              ? "text-accent-text-light font-bold"
              : "text-text-secondary group-hover:text-text-primary font-medium"
          }`}
        >
          {entry.title}
        </span>
      </div>
      {isFavorite && (
        <svg
          className="w-3.5 h-3.5 text-yellow-500 shrink-0 ml-1.5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      )}
    </button>
  );
}
