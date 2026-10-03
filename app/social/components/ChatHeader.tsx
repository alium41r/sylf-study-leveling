"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Search, Info, X, Users, Shield, Circle } from "lucide-react";

export interface ParticipantProfile {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level: number;
  avatarUrl?: string | null;
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string | null;
  characterConfig?: any | null;
  bio?: string | null;
  bannerUrl?: string | null;
  createdAt?: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
}

export interface ConversationDetail {
  id: number;
  name: string | null;
  avatarUrl?: string | null;
  isGroup: boolean;
  createdBy?: number | null;
  createdAt?: string;
  participants: ParticipantProfile[];
}

interface ChatHeaderProps {
  conversation: ConversationDetail;
  currentUserId: number;
  onOpenDetails: () => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const getRankColorStyles = (rank: string) => {
  switch (rank?.toUpperCase()) {
    case "S":
      return "border-rose-500/50 text-rose-700 dark:text-rose-400 bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.25)]";
    case "A":
      return "border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
    case "B":
      return "border-purple-500/50 text-purple-700 dark:text-purple-300 bg-purple-500/10";
    case "C":
      return "border-sky-500/50 text-sky-700 dark:text-sky-300 bg-sky-500/10";
    case "D":
      return "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10";
    default:
      return "border-slate-500/40 text-slate-700 dark:text-slate-300 bg-slate-500/10";
  }
};

export function ChatHeader({
  conversation,
  currentUserId,
  onOpenDetails,
  isSearchOpen,
  onToggleSearch,
  searchQuery,
  onSearchChange,
}: ChatHeaderProps) {
  const otherParticipant = !conversation.isGroup
    ? conversation.participants.find((p) => p.id !== currentUserId)
    : null;

  const displayName = conversation.isGroup
    ? conversation.name || "Group Chat"
    : otherParticipant?.name || otherParticipant?.username || "Scholar";

  const onlineCount = conversation.participants.filter((p) => p.isOnline).length;
  const isOtherOnline = otherParticipant?.isOnline ?? false;
  const rankStyle = getRankColorStyles(otherParticipant?.hunterRank || "E");

  return (
    <div className="px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-bg-panel/85 border border-border-subtle shadow-xl backdrop-blur-2xl flex flex-col gap-2 relative z-30 shrink-0">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Back Link & Identity Info */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link
            href={conversation.isGroup ? "/social?tab=groups" : "/social?tab=messages"}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/5 dark:hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all border border-border-subtle shrink-0 flex items-center justify-center cursor-pointer shadow-sm"
            title="Back to Social Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Clickable Header Identity Area (Opens Details) */}
          <button
            type="button"
            onClick={onOpenDetails}
            className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0 p-1 rounded-xl hover:bg-slate-900/5 dark:hover:bg-white/5 transition-all group cursor-pointer"
          >
            {/* Avatar with Online Presence Dot */}
            <div className="relative shrink-0">
              {conversation.isGroup ? (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-primary/30 to-accent-primary/10 border border-accent-primary/40 flex items-center justify-center text-accent-text-light font-bold shadow-inner overflow-hidden">
                  {conversation.avatarUrl ? (
                    <img
                      src={conversation.avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users className="w-5 h-5 text-accent-primary-light" />
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-bg-abyss border border-border-subtle shrink-0">
                    {otherParticipant?.avatarUrl ? (
                      <img
                        src={otherParticipant.avatarUrl}
                        alt={displayName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span className="text-sm font-bold font-['Rajdhani'] text-accent-primary-light">
                        {(otherParticipant?.name || otherParticipant?.username || "S").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {/* Presence indicator */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-abyss ${
                      isOtherOnline
                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                        : "bg-zinc-500"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Name and Presence text */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-sm sm:text-base font-['Rajdhani'] text-text-primary truncate group-hover:text-accent-text-light transition-colors">
                  {displayName}
                </h1>
                {!conversation.isGroup && otherParticipant?.hunterRank && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border uppercase tracking-wider ${rankStyle}`}>
                    Rank {otherParticipant.hunterRank}
                  </span>
                )}
                {!conversation.isGroup && otherParticipant?.level && (
                  <span className="text-[10px] font-mono text-text-muted hidden sm:inline">
                    Lv. {otherParticipant.level}
                  </span>
                )}
              </div>

              <div className="text-[11px] font-['Rajdhani'] text-text-muted truncate flex items-center gap-1.5 mt-0.5">
                {conversation.isGroup ? (
                  <span>
                    {conversation.participants.length} members ·{" "}
                    <span className="text-emerald-400 font-semibold">{onlineCount} online</span>
                  </span>
                ) : isOtherOnline ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    Active now
                  </span>
                ) : (
                  <span>Offline</span>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Right Tools: Search & Details Drawer Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleSearch}
            className={`p-2 sm:p-2.5 rounded-xl transition-all border cursor-pointer ${
              isSearchOpen
                ? "bg-accent-primary-dim text-accent-text-light border-accent-primary/50 shadow-[0_0_12px_var(--accent-primary-dim)]"
                : "bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary border-border-subtle"
            }`}
            title="Search in conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenDetails}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary transition-all border border-border-subtle cursor-pointer"
            title="Chat Details & Settings"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable In-Chat Search Bar */}
      {isSearchOpen && (
        <div className="pt-2 border-t border-border-subtle flex items-center gap-2 animate-fade-in-down">
          <Search className="w-3.5 h-3.5 text-text-muted ml-1.5 shrink-0" />
          <input
            type="text"
            placeholder="Search messages in this conversation..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-field py-1 px-2 text-xs flex-1 bg-bg-abyss/90 border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:border-accent-primary/60"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="p-1 rounded text-text-muted hover:text-text-primary text-xs hover:bg-slate-900/5 dark:hover:bg-white/5 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
