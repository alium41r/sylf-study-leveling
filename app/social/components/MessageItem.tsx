"use client";

import React, { useState } from "react";
import { Edit2, Trash2, Check, X, Clock, Shield } from "lucide-react";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";

export interface MessageSender {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level?: number;
  avatarUrl?: string | null;
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string | null;
}

export interface ChatMessage {
  id: number;
  content: string;
  createdAt: string;
  senderId: number;
  sender: MessageSender;
  isOptimistic?: boolean;
}

interface MessageItemProps {
  message: ChatMessage;
  isMe: boolean;
  showHeader: boolean;
  isGroup: boolean;
  isFirstInCluster?: boolean;
  isLastInCluster?: boolean;
  onEdit: (messageId: number, newContent: string) => Promise<void>;
  onDelete: (messageId: number) => Promise<void>;
  onOpenProfile: (username: string) => void;
}

const QUICK_REACTIONS = ["❤️", "👍", "🔥", "⚔️", "⚡", "🎯"];

const getRankColorStyles = (rank: string) => {
  switch (rank?.toUpperCase()) {
    case "S":
      return "border-rose-500/50 text-rose-400 bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.25)]";
    case "A":
      return "border-amber-500/50 text-amber-400 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
    case "B":
      return "border-purple-500/50 text-purple-300 bg-purple-500/10";
    case "C":
      return "border-sky-500/50 text-sky-300 bg-sky-500/10";
    case "D":
      return "border-emerald-500/50 text-emerald-300 bg-emerald-500/10";
    default:
      return "border-slate-500/40 text-slate-300 bg-slate-500/10";
  }
};

export function MessageItem({
  message,
  isMe,
  showHeader,
  isGroup,
  isFirstInCluster = true,
  isLastInCluster = true,
  onEdit,
  onDelete,
  onOpenProfile,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reactions, setReactions] = useState<{ [emoji: string]: number }>({});

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(message.id, editContent.trim());
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleReaction = (emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + 1,
    }));
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // Compute adaptive corner radiuses based on message cluster position
  const getCornerRadiusClass = () => {
    if (isMe) {
      if (isFirstInCluster && isLastInCluster) return "rounded-[18px] rounded-br-sm";
      if (isFirstInCluster) return "rounded-[18px] rounded-tr-md rounded-br-md";
      if (isLastInCluster) return "rounded-[18px] rounded-r-md rounded-br-sm";
      return "rounded-[18px] rounded-r-md";
    } else {
      if (isFirstInCluster && isLastInCluster) return "rounded-[18px] rounded-bl-sm";
      if (isFirstInCluster) return "rounded-[18px] rounded-tl-md rounded-bl-md";
      if (isLastInCluster) return "rounded-[18px] rounded-l-md rounded-bl-sm";
      return "rounded-[18px] rounded-l-md";
    }
  };

  const senderRank = message.sender?.hunterRank || "E";
  const rankStyle = getRankColorStyles(senderRank);

  return (
    <div
      className={`group relative flex flex-col ${
        isMe ? "items-end" : "items-start"
      } transition-all px-1 sm:px-2 ${isFirstInCluster ? "mt-2.5" : "mt-0.5"}`}
    >
      {/* Group Sender Header: Shown only in group chats on first message of cluster */}
      {showHeader && isGroup && !isMe && (
        <div className="flex items-center gap-2 mb-1.5 pl-10">
          <button
            type="button"
            onClick={() => onOpenProfile(message.sender.username)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer text-left"
          >
            <span className="text-xs font-bold font-['Rajdhani'] text-text-primary">
              {message.sender.name || message.sender.username}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border uppercase tracking-wider ${rankStyle}`}>
              Rank {senderRank}
            </span>
          </button>
        </div>
      )}

      <div
        className={`flex items-end gap-2 max-w-[88%] sm:max-w-[75%] min-w-0 ${
          isMe ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar for Incoming Messages (Only on the last message of the cluster) */}
        {!isMe && (
          <div className="w-8 h-8 shrink-0 relative select-none self-end mb-0.5">
            {isLastInCluster ? (
              <button
                type="button"
                onClick={() => onOpenProfile(message.sender.username)}
                className="w-8 h-8 rounded-xl overflow-hidden relative flex items-center justify-center bg-bg-abyss border border-border-subtle shadow-sm hover:border-accent-primary/60 transition-colors cursor-pointer group/avatar"
                title={`${message.sender.name || message.sender.username} (Rank ${senderRank})`}
              >
                {message.sender.avatarUrl ? (
                  <img
                    src={message.sender.avatarUrl}
                    alt={message.sender.username}
                    className="w-full h-full object-cover group-hover/avatar:scale-105 transition-transform"
                  />
                ) : (
                  <span className="text-xs font-bold font-['Rajdhani'] text-accent-primary-light">
                    {(message.sender.name || message.sender.username || "S").charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
            ) : (
              <div className="w-8 h-8" />
            )}
          </div>
        )}

        {/* Message Bubble with Hover Action Toolbar */}
        <div className="relative group/bubble min-w-0 max-w-full">
          {isEditing ? (
            /* Inline Edit Input */
            <div className="p-3 rounded-2xl bg-bg-panel/95 border border-accent-primary shadow-2xl backdrop-blur-xl flex flex-col gap-2 min-w-[240px] max-w-full">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="input-field text-sm p-2.5 bg-bg-abyss/90 border-border-subtle rounded-xl resize-none focus:outline-none focus:border-accent-primary/60 font-sans"
                rows={2}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 text-xs font-['Rajdhani']">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-bg-abyss/80 hover:bg-slate-900/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editContent.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-accent-primary hover:brightness-110 text-white font-bold transition-all shadow-md disabled:opacity-40 cursor-pointer"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            /* Standard Message Bubble */
            <div
              className={`px-3.5 py-2.5 min-w-0 max-w-full [overflow-wrap:anywhere] break-words text-sm relative transition-all duration-200 ${getCornerRadiusClass()} ${
                isMe
                  ? "bg-gradient-to-br from-accent-primary via-accent-primary to-accent-primary-dark text-white border-t border-white/20 border-x border-b border-accent-primary-mid/30 shadow-[0_4px_16px_var(--accent-primary-dim)]"
                  : "bg-bg-panel/90 text-text-primary rounded-bl-md border border-border-subtle shadow-md backdrop-blur-md hover:border-accent-primary/40"
              }`}
            >
              <MarkdownRenderer
                content={message.content}
                className={`[&_*]:[overflow-wrap:anywhere] ${
                  isMe ? "[&_*]:text-white prose-p:my-0.5" : "prose-p:my-0.5 text-text-primary"
                }`}
              />

              {/* Single Precise Timestamp & Delivery State inside bubble */}
              <div
                className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] font-mono select-none leading-none ${
                  isMe ? "text-white/70" : "text-text-muted"
                }`}
              >
                <span>{formatTime(message.createdAt)}</span>
                {isMe &&
                  (message.isOptimistic ? (
                    <Clock className="w-2.5 h-2.5 animate-pulse text-white/60" />
                  ) : (
                    <Check className="w-2.5 h-2.5 stroke-[2.5] text-white/80" />
                  ))}
              </div>
            </div>
          )}

          {/* Quick Reactions Bar attached below bubble if any */}
          {Object.keys(reactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
              {Object.entries(reactions).map(([emoji, count]) => (
                <span
                  key={emoji}
                  className="px-2 py-0.5 rounded-full bg-bg-abyss/90 border border-border-subtle text-xs shadow-sm flex items-center gap-1 backdrop-blur-sm"
                >
                  <span>{emoji}</span>
                  <span className="text-[10px] text-text-muted font-bold font-mono">{count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Hover Floating Action Bar (Reactions / Edit / Delete) Docked Safely Above */}
          {!isEditing && (
            <div
              className={`absolute -top-8.5 opacity-0 pointer-events-none group-hover/bubble:opacity-100 group-hover/bubble:pointer-events-auto transition-all duration-150 z-20 flex items-center gap-0.5 px-2 py-1 rounded-full bg-bg-panel border border-border-subtle shadow-xl backdrop-blur-xl ${
                isMe ? "right-1" : "left-1"
              }`}
            >
              {/* Quick Reactions */}
              <div className="flex items-center gap-0.5">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleToggleReaction(emoji)}
                    className="p-1 hover:scale-125 transition-transform text-xs cursor-pointer select-none"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {isMe && (
                <>
                  <div className="w-[1px] h-3 bg-white/20 mx-1" />
                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="p-1 rounded text-text-muted hover:text-accent-primary-light hover:bg-white/10 transition-colors cursor-pointer"
                    title="Edit message"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete button with confirmation */}
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-1 ml-0.5">
                      <button
                        type="button"
                        onClick={() => onDelete(message.id)}
                        className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                        title="Confirm Delete"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-white/10 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
