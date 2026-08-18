"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfileModal } from "@/app/components/ProfileModalContext";
import {
  X,
  Users,
  UserPlus,
  UserCheck,
  Shield,
  Bell,
  BellOff,
  LogOut,
  ExternalLink,
  Search,
  Check,
  Edit2,
  Trash2,
  Calendar,
} from "lucide-react";
import { ParticipantProfile, ConversationDetail } from "./ChatHeader";

interface ChatDetailsDrawerProps {
  conversation: ConversationDetail;
  currentUserId: number;
  isOpen: boolean;
  onClose: () => void;
  onAddMember: (userId: number) => Promise<void>;
  onRemoveMember: (userId: number) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
  onUpdateGroupName: (name: string) => Promise<void>;
  token: string | null;
}

export function ChatDetailsDrawer({
  conversation,
  currentUserId,
  isOpen,
  onClose,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
  onUpdateGroupName,
  token,
}: ChatDetailsDrawerProps) {
  const { openProfile } = useProfileModal();
  const [isMuted, setIsMuted] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(conversation.name || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; name: string | null; hunterRank: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingId, setIsAddingId] = useState<number | null>(null);

  const isGroupAdmin = conversation.isGroup && conversation.createdBy === currentUserId;
  const otherParticipant = !conversation.isGroup
    ? conversation.participants.find((p) => p.id !== currentUserId)
    : null;

  // Search scholars for group invite
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !token || !conversation.isGroup) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const currentMemberIds = conversation.participants.map((p) => p.id);
          setSearchResults(data.filter((u: any) => !currentMemberIds.includes(u.id)));
        }
      } catch (err) {
        console.error("Search user error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, token, conversation.participants, conversation.isGroup]);

  const handleSaveGroupName = async () => {
    if (!groupNameInput.trim() || groupNameInput.trim() === conversation.name) {
      setIsEditingName(false);
      return;
    }
    await onUpdateGroupName(groupNameInput.trim());
    setIsEditingName(false);
  };

  const handleAddMemberClick = async (userId: number) => {
    setIsAddingId(userId);
    try {
      await onAddMember(userId);
      setSearchQuery("");
      setSearchResults([]);
    } finally {
      setIsAddingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Slide-over Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full max-w-md bg-bg-panel/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl h-full flex flex-col z-10 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-bg-abyss/60">
              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                {conversation.isGroup ? "Group Details & Roster" : "Direct Message Dossier"}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">
              {/* ─── Case 1: Direct Message Dossier ────────────────── */}
              {!conversation.isGroup && otherParticipant && (
                <div className="flex flex-col gap-6">
                  {/* Avatar & Profile Card Preview */}
                  <div className="p-5 rounded-2xl bg-bg-abyss/80 border border-white/10 flex flex-col items-center text-center gap-3 relative overflow-hidden shadow-inner">
                    <div className="relative">
                      <div
                        className={`rank-badge rank-${otherParticipant.hunterRank || "E"} w-20 h-20 text-lg rounded-2xl overflow-hidden shadow-xl flex items-center justify-center`}
                      >
                        {otherParticipant.avatarUrl ? (
                          <img
                            src={otherParticipant.avatarUrl}
                            alt={otherParticipant.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-bold">{otherParticipant.hunterRank || "E"}</span>
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-bg-abyss ${
                          otherParticipant.isOnline ? "bg-emerald-500" : "bg-zinc-500"
                        }`}
                      />
                    </div>

                    <div>
                      <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
                        {otherParticipant.name || otherParticipant.username}
                      </h3>
                      <p className="text-xs text-text-muted font-mono">@{otherParticipant.username}</p>
                    </div>

                    {/* Rank & Level Badges */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light text-xs font-['Rajdhani'] font-bold uppercase tracking-wider">
                        Rank {otherParticipant.hunterRank}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-bg-panel border border-white/10 text-text-secondary text-xs font-['Rajdhani'] font-bold">
                        Level {otherParticipant.level}
                      </span>
                    </div>

                    {otherParticipant.bio && (
                      <p className="text-xs text-text-secondary font-['Rajdhani'] italic mt-1 max-w-xs">
                        &ldquo;{otherParticipant.bio}&rdquo;
                      </p>
                    )}

                    {/* View Full Public Profile Modal Button */}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        openProfile(otherParticipant.username);
                      }}
                      className="btn-primary w-full mt-3 py-2.5 text-xs flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>VIEW PUBLIC PROFILE</span>
                    </button>
                  </div>

                  {/* Settings & Options */}
                  <div className="p-4 rounded-2xl bg-bg-abyss/60 border border-white/10 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-text-primary text-xs font-bold font-['Rajdhani']">
                        {isMuted ? <BellOff className="w-4 h-4 text-rose-400" /> : <Bell className="w-4 h-4 text-accent-text-light" />}
                        <span>Mute Notifications</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMuted((prev) => !prev)}
                        className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
                          isMuted ? "bg-accent-primary" : "bg-bg-void border border-white/10"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            isMuted ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Case 2: Group Chat Dossier & Member Roster ────── */}
              {conversation.isGroup && (
                <div className="flex flex-col gap-6">
                  {/* Group Info Card */}
                  <div className="p-5 rounded-2xl bg-bg-abyss/80 border border-white/10 flex flex-col gap-3 shadow-inner">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light font-bold shrink-0">
                        <Users className="w-6 h-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {isEditingName ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={groupNameInput}
                              onChange={(e) => setGroupNameInput(e.target.value)}
                              className="input-field py-1 text-sm bg-bg-abyss"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={handleSaveGroupName}
                              className="p-1 text-green-400 hover:text-green-300"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary truncate">
                              {conversation.name || "Study Group"}
                            </h3>
                            {isGroupAdmin && (
                              <button
                                type="button"
                                onClick={() => setIsEditingName(true)}
                                className="p-1 text-text-muted hover:text-text-primary text-xs"
                                title="Edit group name"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-text-muted font-['Rajdhani']">
                          {conversation.participants.length} total members
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Member Roster */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
                        Member Roster ({conversation.participants.length})
                      </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                      {conversation.participants.map((p) => {
                        const isUserAdmin = conversation.createdBy === p.id;
                        const isMe = p.id === currentUserId;

                        return (
                          <div
                            key={p.id}
                            className="p-2.5 rounded-xl bg-bg-abyss/60 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between group"
                          >
                            <div
                              onClick={() => {
                                onClose();
                                openProfile(p.username);
                              }}
                              className="flex items-center gap-3 cursor-pointer min-w-0"
                            >
                              <div className="relative shrink-0">
                                <div className={`rank-badge rank-${p.hunterRank || "E"} w-8 h-8 text-[10px] rounded-lg`}>
                                  {p.avatarUrl ? (
                                    <img src={p.avatarUrl} alt={p.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <span>{p.hunterRank || "E"}</span>
                                  )}
                                </div>
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-bg-abyss ${
                                    p.isOnline ? "bg-emerald-500" : "bg-zinc-500"
                                  }`}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate hover:text-accent-text-light">
                                    {p.name || p.username} {isMe && "(You)"}
                                  </span>
                                  {isUserAdmin && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-['Rajdhani'] bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-text-muted font-mono">@{p.username}</span>
                              </div>
                            </div>

                            {/* Remove action for group admin */}
                            {!isMe && isGroupAdmin && (
                              <button
                                type="button"
                                onClick={() => onRemoveMember(p.id)}
                                className="p-1.5 rounded text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 transition-all text-xs"
                                title="Remove member from group"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Member Search Deck */}
                  <div className="p-4 rounded-2xl bg-bg-abyss/80 border border-white/10 flex flex-col gap-2">
                    <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite Scholars</span>
                    </span>

                    <input
                      type="text"
                      placeholder="Search username or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input-field py-1.5 text-xs bg-bg-abyss"
                    />

                    {/* Search Results */}
                    {isSearching ? (
                      <p className="text-xs text-text-muted font-['Rajdhani']">Searching scholars...</p>
                    ) : searchResults.length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar mt-1">
                        {searchResults.map((res) => (
                          <div
                            key={res.id}
                            className="p-2 rounded-xl bg-bg-panel/80 border border-white/10 flex items-center justify-between text-xs"
                          >
                            <span className="font-['Rajdhani'] font-semibold truncate pr-2">
                              {res.name || res.username} (@{res.username})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddMemberClick(res.id)}
                              disabled={isAddingId === res.id}
                              className="px-2.5 py-1 rounded-lg bg-accent-primary text-white font-['Rajdhani'] font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0"
                            >
                              {isAddingId === res.id ? "Adding..." : "+ Add"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : searchQuery.length >= 2 ? (
                      <p className="text-xs text-text-muted font-['Rajdhani']">No matching scholars found.</p>
                    ) : null}
                  </div>

                  {/* Leave Group Action */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onLeaveGroup}
                      className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-['Rajdhani'] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>LEAVE GROUP</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
