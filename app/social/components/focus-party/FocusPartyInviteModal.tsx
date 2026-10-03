"use client";

// ============================================================================
// FocusPartyInviteModal — Invite Mutual Friends to Focus Party
// ============================================================================
// Allows any party member to invite eligible mutual friends. Shows current
// membership status, pending invite flags, and capacity restrictions.
// ============================================================================

import React, { useState, useMemo } from "react";
import { Search, UserPlus, Check, X, Users, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useFocusParty } from "./FocusPartyContext";
import { getRankBadgeStyles } from "./focus-party-utils";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import { getDefaultCharacterConfig } from "@/lib/character-traits";

interface FriendItem {
  id: number;
  name: string | null;
  username: string;
  hunterRank?: string;
  level?: number;
  characterConfig?: any;
  avatarUrl?: string | null;
}

interface FocusPartyInviteModalProps {
  friends: FriendItem[];
  onClose: () => void;
}

export function FocusPartyInviteModal({ friends, onClose }: FocusPartyInviteModalProps) {
  const { party, inviteFriend, isActionLoading, error, clearError } = useFocusParty();

  const [query, setQuery] = useState("");
  const [invitedIds, setInvitedIds] = useState<Set<number>>(new Set());
  const [invitingId, setInvitingId] = useState<number | null>(null);

  const members = party?.members || [];
  const currentMemberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );
  const isPartyFull = members.length >= 4;

  const filteredFriends = useMemo(() => {
    let list = friends;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (f) =>
          f.username.toLowerCase().includes(q) ||
          (f.name && f.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [friends, query]);

  const handleSendInvite = async (friendId: number) => {
    if (isPartyFull || currentMemberUserIds.has(friendId) || invitedIds.has(friendId)) return;
    setInvitingId(friendId);
    try {
      const res = await inviteFriend(friendId);
      if (res.success) {
        setInvitedIds((prev) => new Set(prev).add(friendId));
      }
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-['Rajdhani'] select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-lg"
        onClick={onClose}
      />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ type: "spring", damping: 28, stiffness: 380 }}
        className="relative w-full max-w-lg p-6 z-10 flex flex-col max-h-[85vh] shadow-card dark:shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-border-subtle rounded-3xl bg-white dark:bg-bg-panel backdrop-blur-2xl overflow-hidden"
      >
        {/* Top specular edge highlight */}
        <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center text-accent-text-light">
              <UserPlus className="w-5 h-5 text-accent-primary-light" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-widest text-accent-text-light uppercase block">
                MULTIPLAYER STUDY
              </span>
              <h2 className="text-xl font-bold uppercase tracking-wider text-text-primary">
                Invite Friends to Party
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-slate-900/5 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Capacity status notice */}
        {isPartyFull && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-mono flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500 dark:text-amber-400" />
            <span>This Focus Party is at maximum capacity (4/4 members).</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 system-message msg-warning py-2.5 px-3 text-xs font-mono flex items-center justify-between rounded-xl">
            <span>{error}</span>
            <button onClick={clearError} className="text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer transition-colors" aria-label="Dismiss error">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search Field */}
        <div className="relative my-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search mutual friends..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-xs font-['Rajdhani'] pl-10 pr-4 py-2.5 rounded-xl border border-border-subtle focus:border-accent-primary/60 bg-slate-900/[0.03] dark:bg-white/[0.03] focus:bg-slate-900/[0.06] dark:focus:bg-white/[0.06] text-text-primary placeholder:text-text-muted outline-none transition-all shadow-inner"
            autoFocus
          />
        </div>

        {/* Friends Roster */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 max-h-[360px]">
          {filteredFriends.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs font-mono">
              {friends.length === 0
                ? "You have no added mutual friends yet. Add friends on the Social page first!"
                : "No matching friends found."}
            </div>
          ) : (
            filteredFriends.map((friend) => {
              const isInThisParty = currentMemberUserIds.has(friend.id);
              const isInvited = invitedIds.has(friend.id);
              const isBusy = invitingId === friend.id || isActionLoading;

              return (
                <div
                  key={friend.id}
                  data-testid={`invite-friend-row-${friend.id}`}
                  className="p-3 rounded-2xl border border-border-subtle bg-slate-900/[0.02] dark:bg-white/[0.02] hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.04] flex items-center justify-between gap-3 hover:border-accent-primary/40 transition-all duration-200 shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.04] border border-border-subtle flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                      <CharacterRenderer
                        config={friend.characterConfig || getDefaultCharacterConfig(friend.username)}
                        seed={friend.username}
                        size={40}
                        showPedestal={false}
                        showAura={false}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">
                        {friend.name || friend.username}
                      </p>
                      <p className="text-[11px] text-text-muted font-mono truncate">
                        @{friend.username} • Lv.{friend.level || 1}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div>
                    {isInThisParty ? (
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 font-bold">
                        In Party
                      </span>
                    ) : isInvited ? (
                      <span className="text-[11px] font-mono text-text-muted px-3 py-1 rounded-xl bg-slate-100 dark:bg-white/[0.02] border border-border-subtle flex items-center gap-1.5 font-medium">
                        <Check className="w-3 h-3 text-accent-primary-light" />
                        <span>Invited</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`send-invite-btn-${friend.id}`}
                        onClick={() => handleSendInvite(friend.id)}
                        disabled={isBusy || isPartyFull}
                        className="py-1.5 px-3.5 rounded-xl bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-text-light border border-accent-primary/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>Invite</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-border-subtle dark:border-white/[0.08] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl border border-border-subtle dark:border-white/[0.1] hover:border-text-secondary/40 bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06] text-text-muted hover:text-text-primary text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
