"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, UserPlus, Inbox, Loader2 } from "lucide-react";
import { CharacterRenderer } from "./character/CharacterRenderer";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";

export interface FriendRequestItem {
  id: number;
  sender: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
    level: number;
    avatarUrl?: string | null;
    activeAvatar?: string;
    activeFrame?: string;
    activeTitle?: string;
    characterConfig?: any | null;
    createdAt?: string;
  };
  createdAt?: string;
}

interface FriendRequestsModalProps {
  requests: FriendRequestItem[];
  actionLoadingId: number | null;
  onAction: (requestId: number, action: "ACCEPT" | "REJECT") => Promise<void> | void;
  onOpenProfile: (username: string) => void;
  onOpenAddFriend?: () => void;
  onClose: () => void;
}

export function FriendRequestsModal({
  requests,
  actionLoadingId,
  onAction,
  onOpenProfile,
  onOpenAddFriend,
  onClose,
}: FriendRequestsModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      key="friend-requests-modal-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        variants={backdropVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Card */}
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="system-card relative w-full max-w-xl p-5 sm:p-6 z-10 flex flex-col max-h-[85vh] shadow-2xl border border-border-subtle bg-bg-panel/95 backdrop-blur-xl rounded-2xl"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle pr-8">
          <div>
            <h2 className="text-xl font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light">
              Friend Requests
            </h2>
            <p className="text-xs text-text-muted font-['Rajdhani']">
              Manage incoming invitations to connect.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid text-xs font-mono font-bold">
            {requests.length} Pending
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[60vh] pr-1 space-y-3 custom-scrollbar">
          {requests.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-3 text-2xl shadow-inner text-text-muted">
                <Inbox className="w-7 h-7 text-text-muted" />
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider mb-1">
                No Pending Requests
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani'] max-w-xs leading-relaxed">
                You&apos;re all caught up! When someone sends you a friend request, it will appear here.
              </p>
              {onOpenAddFriend && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAddFriend();
                  }}
                  className="mt-5 px-4 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-accent-text-light bg-accent-primary-dim/30 hover:bg-accent-primary-dim/60 border border-accent-primary-mid transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Find Friends to Add</span>
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {requests.map((req) => (
                <motion.div
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
                  className="system-card p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 border border-border-subtle bg-bg-panel/90 hover:border-accent-primary/40 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Sender Avatar / Character */}
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-center overflow-hidden">
                        {req.sender.characterConfig ? (
                          <CharacterRenderer
                            config={req.sender.characterConfig}
                            seed={req.sender.username}
                            size={48}
                            showPedestal={false}
                            showAura={false}
                          />
                        ) : req.sender.avatarUrl ? (
                          <img
                            src={req.sender.avatarUrl}
                            alt={req.sender.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold font-['Rajdhani'] text-emerald-400 select-none">
                            {(req.sender.name || req.sender.username || "S").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sender Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-accent-primary-dim/30 text-[9px] font-mono font-bold text-accent-text-light border border-accent-primary-mid/30 shrink-0">
                          Rank {req.sender.hunterRank}
                        </span>
                        <span className="text-xs font-mono text-text-muted shrink-0">
                          Lv. {req.sender.level}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(req.sender.username)}
                        className="text-sm font-bold font-['Rajdhani'] text-text-primary hover:text-accent-text-light transition-colors text-left block truncate w-full"
                      >
                        {req.sender.name || req.sender.username}
                      </button>
                      <p className="text-xs text-text-muted font-mono truncate w-full">
                        @{req.sender.username}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(req.sender.username)}
                      className="px-3 py-1.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle transition-all"
                    >
                      Profile
                    </button>

                    <button
                      type="button"
                      disabled={actionLoadingId === req.id}
                      onClick={() => onAction(req.id, "ACCEPT")}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      {actionLoadingId === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Accept</span>
                    </button>

                    <button
                      type="button"
                      disabled={actionLoadingId === req.id}
                      onClick={() => onAction(req.id, "REJECT")}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {actionLoadingId === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      <span>Reject</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
