"use client";

import React, { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Search,
  CheckSquare,
  Square,
  Trash2,
  Edit3,
  Check,
  X,
  History,
  MessageSquare,
  MessageSquareDashed,
  PanelRightClose,
} from "lucide-react";
import styles from "../System.module.css";

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

function groupSessionsByDate(sessions: SystemChatSession[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const lastWeekStart = todayStart - 7 * 86400000;

  const groups: { label: string; sessions: SystemChatSession[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 Days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  sessions.forEach((s) => {
    const time = new Date(s.updatedAt).getTime();
    if (time >= todayStart) {
      groups[0].sessions.push(s);
    } else if (time >= yesterdayStart) {
      groups[1].sessions.push(s);
    } else if (time >= lastWeekStart) {
      groups[2].sessions.push(s);
    } else {
      groups[3].sessions.push(s);
    }
  });

  return groups.filter((g) => g.sessions.length > 0);
}

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
  const [searchQuery, setSearchQuery] = useState("");

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  // Group filtered sessions chronologically
  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(filteredSessions);
  }, [filteredSessions]);

  const deleteSelected = () => {
    if (selectedChats.length === 0) return;
    if (!confirm(`Delete ${selectedChats.length} selected chat session(s)?`)) return;
    for (const id of selectedChats) {
      onDelete(id);
    }
    setIsSelectMode(false);
    setSelectedChats([]);
  };

  const handleStartRename = (session: SystemChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = (id: number, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  const toggleSelectChat = (id: number) => {
    setSelectedChats((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ── Shared Content Component ──────────────────────────────────────────
  const renderSidebarBody = () => (
    <div className="w-full h-full flex flex-col min-h-0 select-none">
      {/* ── Header ── */}
      <div className={styles.sidebarHeader}>
        {/* Row 1: Title, Count, + New Action, Close Button */}
        <div className="flex items-center justify-between gap-2">
          <div className={styles.sidebarHeading}>
            <History className="w-4 h-4 text-accent-text-light shrink-0" />
            <span>Archives</span>
            <span className={styles.countPill}>
              {sessions.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                onCreateNew();
                setIsSelectMode(false);
                setSelectedChats([]);
                setEditingSessionId(null);
              }}
              className={styles.btnNewChatCompact}
              title="New Chat Session"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New</span>
            </button>

            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-primary border border-white/10 flex items-center justify-center transition-colors cursor-pointer hover:border-accent-primary/30"
              title="Close Archives"
              aria-label="Close Archives"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Utility Bar (Search & Select mode) - Only if sessions exist */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className={`flex-1 ${styles.searchBox}`}>
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search archives..."
                className={styles.searchBoxInput}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedChats([]);
                setEditingSessionId(null);
              }}
              className={`${styles.btnSelectMode} ${isSelectMode ? styles.btnSelectModeActive : ""}`}
              title={isSelectMode ? "Exit selection mode" : "Select multiple chats"}
            >
              {isSelectMode ? (
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Done</span>
                </span>
              ) : (
                <span>Select</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Sessions List Area ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-3 min-h-0">
        {sessions.length === 0 ? (
          /* Sleek Informational Empty State (Single source of truth for New Chat in header) */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto select-none">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-text-light mb-3 shadow-inner">
              <MessageSquareDashed className="w-5 h-5 stroke-[1.5] text-accent-primary" />
            </div>
            <p className="text-xs font-['Rajdhani'] font-bold text-text-primary uppercase tracking-wider mb-1">
              No Archives Yet
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed max-w-[200px]">
              Your study discussions and intelligence quests will be preserved here.
            </p>
          </div>
        ) : filteredSessions.length === 0 ? (
          /* Search Zero Results */
          <div className="py-8 text-center text-text-muted text-xs font-['Rajdhani']">
            <p>No conversations matching &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          /* Grouped Chronological Session Cards */
          groupedSessions.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-2 py-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest font-['Rajdhani'] text-text-muted/70">
                  {group.label}
                </span>
                <span className="text-[9px] font-mono text-text-muted/50">
                  {group.sessions.length}
                </span>
              </div>

              {group.sessions.map((session) => {
                const isActive = activeSessionId === session.id && !isSelectMode;
                const isSelected = selectedChats.includes(session.id);
                const isEditing = editingSessionId === session.id;

                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      if (isSelectMode) {
                        toggleSelectChat(session.id);
                      } else {
                        onSelect(session.id);
                      }
                    }}
                    className={`group relative flex items-center min-h-[38px] px-2.5 py-2 rounded-xl transition-all cursor-pointer text-xs ${
                      isSelectMode && isSelected
                        ? "bg-rose-500/15 border border-rose-500/40 text-rose-200"
                        : isActive
                        ? styles.sessionItemActive
                        : styles.sessionItem
                    }`}
                  >
                    {/* Active Accent Indicator Bar */}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className={styles.sessionActiveBar}
                      />
                    )}

                    {/* Select Mode Checkbox */}
                    {isSelectMode ? (
                      <div className="w-6 h-6 flex items-center justify-center mr-1.5 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Square className="w-4 h-4 text-text-muted" />
                        )}
                      </div>
                    ) : (
                      <MessageSquare
                        className={`w-3.5 h-3.5 mr-2 shrink-0 transition-colors ${
                          isActive
                            ? "text-accent-primary-light"
                            : "text-text-muted group-hover:text-accent-text-light"
                        }`}
                      />
                    )}

                    {/* Title or Inline Rename Input */}
                    {isEditing ? (
                      <form
                        onSubmit={(e) => handleSaveRename(session.id, e)}
                        className="flex-1 min-w-0 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          autoFocus
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingSessionId(null);
                          }}
                          className="flex-1 min-w-0 bg-bg-void border border-accent-primary text-xs px-2 py-1 rounded-lg text-text-primary outline-none font-['Rajdhani'] font-medium"
                        />
                        <button
                          type="submit"
                          className="w-7 h-7 flex items-center justify-center text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-500/20 shrink-0"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSessionId(null)}
                          className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary rounded hover:bg-white/10 shrink-0"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <span
                          className="truncate font-['Rajdhani'] font-medium text-xs tracking-wide select-none"
                          title={session.title}
                        >
                          {session.title}
                        </span>

                        {/* Direct Hover Action Buttons (Rename & Delete) with accessible hitboxes */}
                        {!isSelectMode && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(session, e)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-accent-primary-light hover:bg-white/10 transition-colors"
                              title="Rename chat"
                              aria-label={`Rename ${session.title}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(session.id);
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                              title="Delete chat"
                              aria-label={`Delete ${session.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Select Mode Bulk Delete Footer */}
      {isSelectMode && selectedChats.length > 0 && (
        <div className="p-3 border-t border-border-subtle bg-bg-panel/70 shrink-0">
          <button
            onClick={deleteSelected}
            className="w-full py-2 px-3 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected ({selectedChats.length})</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ── Mobile Overlay Drawer ───────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className={`absolute right-0 top-0 bottom-0 w-[85%] max-w-[280px] shadow-2xl flex flex-col ${styles.sidebarContainer}`}
            >
              <div className="flex-1 min-h-0 flex flex-col">{renderSidebarBody()}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Desktop History Rail ───────────────────────────────────────── */}
      <div
        className={`relative flex flex-col shrink-0 z-20 hidden md:flex transition-all duration-300 ${
          isOpen ? "w-[280px]" : "w-0"
        }`}
      >
        {/* Inner container filling vertical height */}
        <div
          className={`w-full flex-1 flex flex-col overflow-hidden transition-all duration-300 ${styles.sidebarContainer} ${
            isOpen ? "opacity-100 border-l" : "opacity-0 border-l-0 pointer-events-none"
          }`}
        >
          <div className="w-[280px] flex-1 flex flex-col min-h-0">{renderSidebarBody()}</div>
        </div>
      </div>
    </>
  );
}
