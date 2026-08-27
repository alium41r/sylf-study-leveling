"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Camera,
  Upload,
  Link2,
  Image as ImageIcon,
  Loader2,
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
  onUpdateGroupAvatar?: (avatarUrl: string | null) => Promise<void>;
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
  onUpdateGroupAvatar,
}: ChatDetailsDrawerProps) {
  const { openProfile } = useProfileModal();
  const [isMuted, setIsMuted] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(conversation.name || "");
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [avatarMode, setAvatarMode] = useState<"UPLOAD" | "URL">("UPLOAD");
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string>(conversation.avatarUrl || "");
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; name: string | null; hunterRank: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingId, setIsAddingId] = useState<number | null>(null);

  const isGroupAdmin = conversation.isGroup && (conversation.createdBy === currentUserId || !conversation.createdBy);
  const otherParticipant = !conversation.isGroup
    ? conversation.participants.find((p) => p.id !== currentUserId)
    : null;

  useEffect(() => {
    setGroupNameInput(conversation.name || "");
    setPreviewAvatarUrl(conversation.avatarUrl || "");
  }, [conversation.name, conversation.avatarUrl]);

  // Client-side Image Compression & Resizing (Max 400px for group avatar)
  const processImageFile = (file: File, callback: (dataUrl: string) => void, maxDim: number = 400) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl) return;

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/webp", 0.85);
          callback(compressed);
        } else {
          callback(rawUrl);
        }
      };
      img.onerror = () => callback(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!onUpdateGroupAvatar) return;
    setIsSavingAvatar(true);
    try {
      await onUpdateGroupAvatar(previewAvatarUrl.trim() || null);
      setIsEditingAvatar(false);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!onUpdateGroupAvatar) return;
    setIsSavingAvatar(true);
    try {
      await onUpdateGroupAvatar(null);
      setPreviewAvatarUrl("");
      setIsEditingAvatar(false);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Search scholars for group invite
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !conversation.isGroup) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
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
  }, [searchQuery, conversation.participants, conversation.isGroup]);

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
                        className="w-20 h-20 text-2xl rounded-2xl overflow-hidden shadow-xl flex items-center justify-center bg-bg-panel border border-border-subtle shrink-0"
                      >
                        {otherParticipant.avatarUrl ? (
                          <img
                            src={otherParticipant.avatarUrl}
                            alt={otherParticipant.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-bold font-['Rajdhani'] text-emerald-400">
                            {(otherParticipant.name || otherParticipant.username || "S").charAt(0).toUpperCase()}
                          </span>
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
                  <div className="p-5 rounded-2xl bg-bg-abyss/80 border border-white/10 flex flex-col gap-4 shadow-inner">
                    <div className="flex items-center gap-3.5">
                      {/* Group Avatar Thumbnail with Edit Overlay */}
                      <div className="relative group/avatar shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-accent-primary-dim border border-accent-primary-mid/60 flex items-center justify-center text-accent-text-light font-bold overflow-hidden shadow-md">
                          {conversation.avatarUrl ? (
                            <img
                              src={conversation.avatarUrl}
                              alt={conversation.name || "Group"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Users className="w-6 h-6 text-accent-text-light" />
                          )}
                        </div>

                        {/* Camera Overlay Button */}
                        {isGroupAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingAvatar((prev) => !prev);
                              setPreviewAvatarUrl(conversation.avatarUrl || "");
                            }}
                            className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white"
                            title="Change group image"
                          >
                            <Camera className="w-5 h-5 drop-shadow" />
                          </button>
                        )}

                        {/* Bottom-right Camera Badge (Mobile/Quick Click) */}
                        {isGroupAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingAvatar((prev) => !prev);
                              setPreviewAvatarUrl(conversation.avatarUrl || "");
                            }}
                            className="absolute -bottom-1 -right-1 p-1 rounded-full bg-accent-primary text-white border-2 border-bg-abyss shadow hover:scale-110 transition-transform"
                            title="Change group image"
                          >
                            <Camera className="w-3 h-3" />
                          </button>
                        )}
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

                        {isGroupAdmin && !isEditingAvatar && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingAvatar(true);
                              setPreviewAvatarUrl(conversation.avatarUrl || "");
                            }}
                            className="mt-1.5 text-[11px] font-['Rajdhani'] font-bold text-accent-text-light hover:underline flex items-center gap-1"
                          >
                            <Camera className="w-3 h-3 text-accent-primary" />
                            <span>{conversation.avatarUrl ? "Change Group Image" : "Add Group Image"}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Group Avatar Editor */}
                    <AnimatePresence>
                      {isEditingAvatar && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-3 border-t border-white/10 flex flex-col gap-3 overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
                              Group Image
                            </span>
                            {/* Mode Switcher Tabs */}
                            <div className="flex items-center bg-bg-panel p-0.5 rounded-lg border border-white/10">
                              <button
                                type="button"
                                onClick={() => setAvatarMode("UPLOAD")}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-['Rajdhani'] uppercase transition-all flex items-center gap-1 ${
                                  avatarMode === "UPLOAD"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-muted hover:text-text-primary"
                                }`}
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAvatarMode("URL")}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-['Rajdhani'] uppercase transition-all flex items-center gap-1 ${
                                  avatarMode === "URL"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-muted hover:text-text-primary"
                                }`}
                              >
                                <Link2 className="w-3 h-3" />
                                <span>URL</span>
                              </button>
                            </div>
                          </div>

                          {/* Hidden File Input */}
                          <input
                            ref={avatarFileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                processImageFile(file, (compressedUrl) => setPreviewAvatarUrl(compressedUrl), 400);
                              }
                              e.target.value = "";
                            }}
                          />

                          {/* Mode: File Upload */}
                          {avatarMode === "UPLOAD" ? (
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-bg-panel border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                                {previewAvatarUrl ? (
                                  <img src={previewAvatarUrl} alt="Group Preview" className="w-full h-full object-cover" />
                                ) : (
                                  <Users className="w-5 h-5 text-text-muted" />
                                )}
                              </div>

                              <div className="flex-1 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => avatarFileInputRef.current?.click()}
                                  className="flex-1 py-2 px-3 rounded-xl bg-bg-panel hover:bg-bg-shadow border border-white/10 hover:border-accent-primary/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center justify-center gap-1.5 transition-all shadow-sm"
                                >
                                  <Upload className="w-3.5 h-3.5 text-accent-primary" />
                                  <span>{previewAvatarUrl ? "Replace Group Image" : "Upload from Computer"}</span>
                                </button>
                                {previewAvatarUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAvatarUrl("")}
                                    className="p-2 rounded-xl bg-bg-panel hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                                    title="Clear chosen file"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            /* Mode: URL */
                            <div className="flex items-center gap-2">
                              <input
                                type="url"
                                value={previewAvatarUrl}
                                onChange={(e) => setPreviewAvatarUrl(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && previewAvatarUrl !== (conversation.avatarUrl || "")) {
                                    handleSaveAvatar();
                                  }
                                }}
                                placeholder="https://example.com/avatar.jpg"
                                className="flex-1 rounded-xl px-3 py-2 bg-bg-panel border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-all shadow-inner"
                              />
                              {previewAvatarUrl && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewAvatarUrl("")}
                                  className="p-2 rounded-xl bg-bg-panel hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                                  title="Clear URL"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Action Buttons: Save / Remove / Cancel */}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            {conversation.avatarUrl ? (
                              <button
                                type="button"
                                disabled={isSavingAvatar}
                                onClick={handleRemoveAvatar}
                                className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Remove Image</span>
                              </button>
                            ) : <div />}

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isSavingAvatar}
                                onClick={() => {
                                  setIsEditingAvatar(false);
                                  setPreviewAvatarUrl(conversation.avatarUrl || "");
                                }}
                                className="px-3 py-1.5 rounded-lg bg-bg-panel hover:bg-white/10 text-text-muted hover:text-text-primary text-xs font-['Rajdhani'] font-bold uppercase transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSavingAvatar || previewAvatarUrl === (conversation.avatarUrl || "")}
                                onClick={handleSaveAvatar}
                                className="btn-primary px-3.5 py-1.5 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isSavingAvatar ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Save Image</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-border-subtle bg-bg-panel flex items-center justify-center">
                                  {p.avatarUrl ? (
                                    <img src={p.avatarUrl} alt={p.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs font-bold font-['Rajdhani'] text-emerald-400">
                                      {(p.name || p.username || "S").charAt(0).toUpperCase()}
                                    </span>
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
