"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Search, Info, X, Users, Shield } from "lucide-react";

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

  return (
    <div className="system-card p-3 sm:p-4 rounded-2xl bg-bg-panel/90 border border-white/10 shadow-xl backdrop-blur-md flex flex-col gap-3 relative z-30 shrink-0">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Back Link & Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={conversation.isGroup ? "/social?tab=groups" : "/social?tab=messages"}
            className="p-2 rounded-xl bg-bg-abyss/80 hover:bg-white/10 text-text-muted hover:text-text-primary transition-all border border-white/5 shrink-0"
            title="Back to Social Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Clickable Header Identity Area (Opens Details) */}
          <button
            type="button"
            onClick={onOpenDetails}
            className="flex items-center gap-3 text-left min-w-0 p-1.5 rounded-xl hover:bg-white/5 transition-all group"
          >
            {/* Avatar with Online Presence Dot */}
            <div className="relative shrink-0">
              {conversation.isGroup ? (
                <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light font-bold shadow-inner overflow-hidden">
                  {conversation.avatarUrl ? (
                    <img
                      src={conversation.avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users className="w-5 h-5" />
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div
                    className={`rank-badge rank-${otherParticipant?.hunterRank || "E"} w-10 h-10 text-xs rounded-xl overflow-hidden shadow-md flex items-center justify-center`}
                  >
                    {otherParticipant?.avatarUrl ? (
                      <img
                        src={otherParticipant.avatarUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold">{otherParticipant?.hunterRank || "E"}</span>
                    )}
                  </div>
                  {/* Presence indicator */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-abyss ${
                      isOtherOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Name and Presence text */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base font-['Rajdhani'] text-text-primary truncate group-hover:text-accent-text-light transition-colors">
                  {displayName}
                </h1>
                {!conversation.isGroup && otherParticipant?.hunterRank && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-['Rajdhani'] bg-bg-abyss border border-white/10 text-text-muted">
                    Rank {otherParticipant.hunterRank}
                  </span>
                )}
              </div>

              <p className="text-[11px] font-['Rajdhani'] text-text-muted truncate">
                {conversation.isGroup
                  ? `${conversation.participants.length} members • ${onlineCount} online`
                  : isOtherOnline
                  ? "Active now"
                  : "Offline"}
              </p>
            </div>
          </button>
        </div>

        {/* Right Tools: Search & Details Drawer Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleSearch}
            className={`p-2 rounded-xl transition-all border ${
              isSearchOpen
                ? "bg-accent-primary-dim text-accent-text-light border-accent-primary-mid"
                : "bg-bg-abyss/80 text-text-muted hover:text-text-primary border-white/5 hover:border-white/15"
            }`}
            title="Search in conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenDetails}
            className="p-2 rounded-xl bg-bg-abyss/80 hover:bg-white/10 text-text-muted hover:text-text-primary transition-all border border-white/5 hover:border-white/15"
            title="Chat Details & Settings"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable In-Chat Search Bar */}
      {isSearchOpen && (
        <div className="pt-2 border-t border-white/10 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-text-muted ml-2 shrink-0" />
          <input
            type="text"
            placeholder="Search messages in this conversation..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-field py-1.5 text-xs flex-1 bg-bg-abyss"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="p-1 text-text-muted hover:text-text-primary text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
