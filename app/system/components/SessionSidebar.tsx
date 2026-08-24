"use client";

import { useEffect, useState } from "react";

export interface SystemChatSession {
  id: number;
  title: string;
  updatedAt: string;
}

interface SessionSidebarProps {
  sessions: SystemChatSession[];
  activeSessionId: number | null;
  isOpen: boolean;
  onToggle: () => void;
  onCreateNew: () => void;
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

/**
 * Session history rail for the System workspace. Select-mode supports
 * bulk deletion; per-row menus support rename/delete.
 */
export default function SessionSidebar({
  sessions,
  activeSessionId,
  isOpen,
  onToggle,
  onCreateNew,
  onSelect,
  onRename,
  onDelete,
}: SessionSidebarProps) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<number[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // Close the per-row dropdown on outside click
  useEffect(() => {
    if (openMenuId === null) return;
    const handleClick = () => setOpenMenuId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [openMenuId]);

  const deleteSelected = async () => {
    if (selectedChats.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedChats.length} chat(s)?`)) return;
    for (const id of selectedChats) {
      onDelete(id);
    }
    setIsSelectMode(false);
    setSelectedChats([]);
  };

  return (
    <div
      className={`relative flex flex-col shrink-0 z-10 hidden md:flex transition-all duration-300 ${
        isOpen ? "w-64" : "w-0"
      }`}
    >
      {/* Toggle Button outside the border */}
      <button
        onClick={onToggle}
        className={`absolute top-4 -left-10 w-10 h-11 text-accent-text-light rounded-l-lg hover:bg-bg-panel transition-colors flex items-center justify-center shrink-0 z-50 bg-bg-abyss border-border-subtle border-y border-l ${
          !isOpen ? "border-r" : "border-r-0"
        }`}
        title="Toggle History"
      >
        <svg
          className={`w-5 h-5 transition-transform duration-300 ${!isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>

      {/* Inner wrapper that fills the vertical space */}
      <div
        className={`w-full flex-1 border-border-subtle bg-bg-abyss flex flex-col overflow-hidden transition-all duration-300 ${
          isOpen ? "opacity-100 border-l" : "opacity-0 border-l-0"
        }`}
      >
        <div className="w-64 flex-1 flex flex-col">
          <div className="p-4 border-b border-border-subtle flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onCreateNew();
                  setIsSelectMode(false);
                  setSelectedChats([]);
                }}
                className="flex-1 py-2.5 px-4 bg-accent-primary hover:brightness-110 border border-transparent rounded-lg text-white font-bold tracking-wide transition-all shadow-[var(--card-shadow)] hover:shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                <span className="text-xl leading-none">+</span> NEW CHAT
              </button>
              <button
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedChats([]);
                  setOpenMenuId(null);
                }}
                className="py-2.5 px-3 bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-gray-500 rounded-lg text-text-secondary font-bold transition-all flex items-center justify-center shrink-0"
                title={isSelectMode ? "Cancel Selection" : "Select Chats"}
              >
                {isSelectMode ? "Done" : "Select"}
              </button>
            </div>

            {isSelectMode && selectedChats.length > 0 && (
              <button
                onClick={deleteSelected}
                className="w-full py-1.5 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-400 rounded-lg text-red-400 text-sm font-bold tracking-wide transition-all"
              >
                DELETE SELECTED ({selectedChats.length})
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 custom-scrollbar">
            {sessions.length === 0 ? (
              <p className="text-xs text-text-secondary text-center mt-6 uppercase tracking-widest font-['Rajdhani']">
                No previous chats
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative flex items-center p-3 rounded-lg cursor-pointer transition-all ${
                    isSelectMode && selectedChats.includes(session.id)
                      ? "bg-red-900/20 border border-red-500/50 text-red-300"
                      : activeSessionId === session.id && !isSelectMode
                      ? "bg-blue-900/20 border border-blue-500/30 text-blue-300"
                      : "hover:bg-text-primary/5 text-text-secondary border border-transparent"
                  }`}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedChats((prev) =>
                        prev.includes(session.id)
                          ? prev.filter((id) => id !== session.id)
                          : [...prev, session.id]
                      );
                    } else {
                      onSelect(session.id);
                    }
                  }}
                >
                  {isSelectMode && (
                    <div
                      className={`w-4 h-4 rounded border mr-3 flex items-center justify-center shrink-0 transition-colors ${
                        selectedChats.includes(session.id) ? "bg-red-500 border-red-500" : "border-gray-500"
                      }`}
                    >
                      {selectedChats.includes(session.id) && (
                        <svg className="w-3 h-3 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex items-center justify-between">
                    {editingSessionId === session.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        autoFocus
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => onRename(session.id, editTitle)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onRename(session.id, editTitle);
                          if (e.key === "Escape") setEditingSessionId(null);
                        }}
                        className="w-full bg-bg-void border border-border-subtle text-sm px-2 py-1 rounded outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate text-sm pr-6 font-medium">{session.title}</span>
                    )}
                    {/* Actions Menu Trigger */}
                    {!isSelectMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === session.id ? null : session.id);
                        }}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors rounded ${
                          openMenuId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        ⋮
                      </button>
                    )}
                  </div>

                  {/* Dropdown Menu */}
                  {openMenuId === session.id && !isSelectMode && (
                    <div className="absolute right-2 top-10 bg-bg-panel border border-border-subtle rounded-lg shadow-xl z-50 py-1 w-28 overflow-hidden">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(session.title);
                          setEditingSessionId(session.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-text-primary/5 hover:text-text-primary transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          onDelete(session.id);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
