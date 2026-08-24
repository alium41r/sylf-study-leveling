"use client";

import React, { useState } from "react";
import { Edit2, Trash2, Smile, Check, X, Clock } from "lucide-react";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";

export interface MessageSender {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level?: number;
  avatarUrl?: string | null;
  activeAvatar?: string;
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
  onEdit: (messageId: number, newContent: string) => Promise<void>;
  onDelete: (messageId: number) => Promise<void>;
  onOpenProfile: (username: string) => void;
}

const QUICK_REACTIONS = ["❤️", "👍", "🔥", "😂", "⚔️", "⚡"];

export function MessageItem({
  message,
  isMe,
  showHeader,
  isGroup,
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

  return (
    <div
      className={`group relative flex flex-col ${
        isMe ? "items-end" : "items-start"
      } transition-all px-2`}
    >
      {/* Sender Header for Group or First Message in cluster */}
      {showHeader && !isMe && (
        <div className="flex items-center gap-2 mb-1 pl-10">
          <span className="text-xs font-bold font-['Rajdhani'] text-text-muted select-none">
            {message.sender.name || message.sender.username}
          </span>
          <span className="text-[10px] font-mono text-text-secondary opacity-60">
            {formatTime(message.createdAt)}
          </span>
        </div>
      )}

      <div className={`flex items-end gap-2.5 max-w-[92%] sm:max-w-[75%] min-w-0 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar for Incoming Messages */}
        {!isMe && (
          <div
            className="w-8 h-8 rounded-xl shrink-0 overflow-hidden relative flex items-center justify-center bg-bg-abyss border border-border-subtle shadow-sm select-none self-end mb-0.5"
            title={message.sender.name || message.sender.username}
          >
            {message.sender.avatarUrl ? (
              <img
                src={message.sender.avatarUrl}
                alt={message.sender.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold font-['Rajdhani'] text-emerald-400">
                {(message.sender.name || message.sender.username || "S").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Message Bubble with Hover Action Toolbar */}
        <div className="relative group/bubble min-w-0 max-w-full">
          {isEditing ? (
            /* Inline Edit Input */
            <div className="p-3 rounded-2xl bg-bg-panel border border-accent-primary shadow-xl flex flex-col gap-2 min-w-[220px] max-w-full">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="input-field text-sm p-2 bg-bg-abyss resize-none"
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
                  className="px-2.5 py-1 rounded bg-bg-abyss text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editContent.trim()}
                  className="btn-primary px-3 py-1 text-xs"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            /* Standard Message Bubble — wraps anywhere so long unbroken
               text/URLs never overflow the bubble on narrow screens */
            <div
              className={`px-3.5 py-2 rounded-[18px] min-w-0 max-w-full [overflow-wrap:anywhere] break-words text-sm relative transition-all ${
                isMe
                  ? "bg-accent-primary text-white rounded-br-md shadow-[0_2px_12px_rgba(124,58,237,0.3)]"
                  : "bg-bg-panel/90 text-text-primary rounded-bl-md border border-white/10 shadow-sm"
              }`}
            >
              <MarkdownRenderer
                content={message.content}
                className={`[&_*]:[overflow-wrap:anywhere] ${isMe ? "[&_*]:text-white prose-p:my-0.5" : "prose-p:my-0.5"}`}
              />

              {/* Timestamp & Delivery State inside bubble */}
              <div
                className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono select-none ${
                  isMe ? "text-white/70" : "text-text-muted"
                }`}
              >
                <span>{formatTime(message.createdAt)}</span>
                {isMe && (
                  message.isOptimistic ? (
                    <Clock className="w-2.5 h-2.5 animate-pulse" />
                  ) : (
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  )
                )}
              </div>
            </div>
          )}

          {/* Quick Reactions Bar attached below bubble if any */}
          {Object.keys(reactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
              {Object.entries(reactions).map(([emoji, count]) => (
                <span
                  key={emoji}
                  className="px-1.5 py-0.5 rounded-full bg-bg-abyss/80 border border-white/10 text-xs shadow-sm flex items-center gap-1"
                >
                  <span>{emoji}</span>
                  <span className="text-[10px] text-text-muted font-bold">{count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Hover Floating Action Bar (Edit / Delete / React) */}
          {!isEditing && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-opacity z-20 flex items-center gap-1 p-1 rounded-xl bg-bg-abyss/95 border border-white/15 shadow-xl backdrop-blur-md ${
                isMe ? "-left-28" : "-right-28"
              }`}
            >
              {/* Quick Reactions dropdown/picker */}
              <div className="flex items-center gap-0.5">
                {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleToggleReaction(emoji)}
                    className="p-1 hover:scale-125 transition-transform text-xs"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {isMe && (
                <>
                  <div className="w-[1px] h-3 bg-white/15 mx-0.5" />
                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors"
                    title="Edit message"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete button with confirmation */}
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDelete(message.id)}
                        className="p-1 text-rose-400 hover:text-rose-300 text-[10px] font-bold"
                        title="Confirm Delete"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="p-1 text-text-muted hover:text-text-primary text-[10px]"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-1 text-text-muted hover:text-rose-400 transition-colors"
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
