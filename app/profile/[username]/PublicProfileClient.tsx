"use client";

import { getClassInfo, COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import {
  Lock,
  MessageSquare,
  Check,
  Clock,
  UserPlus,
  UserMinus,
  Ban,
  ShieldCheck,
  ChevronDown,
  MoreVertical,
} from "lucide-react";
import { StreakFlameIcon, QuestEmblemIcon, SylvieIcon } from "@/app/components/icons";

export interface ProfileData {
  id: number;
  username: string;
  isRestricted?: boolean;
  name?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  hunterRank?: string;
  level?: number;
  currentXP?: number;
  xpToNextLevel?: number;
  hp?: number;
  maxHp?: number;
  streakDays?: number;
  totalStudyMinutes?: number;
  totalStudySeconds?: number;
  todayStudyMinutes?: number;
  todayStudySeconds?: number;
  completedTodaySeconds?: number;
  isStudying?: boolean;
  activeSessionStartedAt?: string | null;
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string;
  activeAura?: string;
  activeNameColor?: string;
  characterConfig?: any | null;
  socialLinks?: Record<string, string>;
  connectedAccounts?: {
    github?: string | null;
    discord?: string | null;
    instagram?: string | null;
  };
  stats?: {
    endurance: number;
    tenacity: number;
    velocity: number;
    synthesis: number;
    discipline: number;
  };
  completedQuestsCount?: number;
  achievementsCount?: number;
  recentAchievements?: { achievementId: string; claimedAt: string }[];
  levelProgress?: number;
  inventory?: Array<{
    id: number;
    itemId: number;
    isEquipped: boolean;
    item: {
      sku: string;
      name: string;
      slot: string;
      rarity: string;
      spriteLayer: string;
      setKey?: string | null;
    };
  }>;
  forgeMasteries?: Array<{
    forgeCoreId: number;
    prestigeTier: number;
    completedAt: string;
    forgeCore: {
      coreKey: string;
      name: string;
      discipline: string;
      rewardPedestalKey?: string | null;
      rewardBadgeKey?: string | null;
    };
  }>;
  lastActiveDate?: string;
  createdAt?: string;
}

export interface Permissions {
  canSendFriendRequest: boolean;
  canSendMessage: boolean;
  canRemoveFriend?: boolean;
  canBlock?: boolean;
  canUnblock?: boolean;
}

export interface PublicProfileClientProps {
  username: string;
  initialProfile?: ProfileData | null;
  initialRelationship?: string;
  initialPermissions?: Permissions | null;
  initialError?: string | null;
}

export function PublicProfileClient({
  username,
  initialProfile = null,
  initialRelationship = "PUBLIC",
  initialPermissions = null,
  initialError = null,
}: PublicProfileClientProps) {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(initialProfile);
  const [relationship, setRelationship] = useState<string>(initialRelationship);
  const [permissions, setPermissions] = useState<Permissions | null>(initialPermissions);
  const [error, setError] = useState<string | null>(initialError);
  const [isLoading, setIsLoading] = useState(!initialProfile && !initialError);
  const [actionLoading, setActionLoading] = useState(false);

  // Actions menu & confirmation modal states
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: "REMOVE_FRIEND" | "BLOCK_USER" | "UNBLOCK_USER";
    title: string;
    message: string;
    danger: boolean;
    confirmText: string;
  }>({
    isOpen: false,
    type: "REMOVE_FRIEND",
    title: "",
    message: "",
    danger: false,
    confirmText: "",
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Redirect if viewing own profile
    if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
      router.replace("/locker?tab=identity");
      return;
    }

    if (authLoading) return; // Wait for auth to settle

    // If initialProfile was provided on server, we only re-fetch if the logged-in user changes relationship
    if (initialProfile && !currentUser) return;

    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/profile/${username}`);
        if (!res.ok) {
          if (res.status === 404) setError("Scholar not found in the system.");
          else setError("An error occurred while accessing system records.");
          return;
        }

        const data = await res.json();
        setProfile(data.profile);
        setRelationship(data.relationship);
        setPermissions(data.permissions);
      } catch {
        if (!initialProfile) setError("Network error. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [username, currentUser, authLoading, router, initialProfile]);

  const handleMessage = async () => {
    if (!profile || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ participantIds: [profile.id] }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/social/chat/${data.id}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Failed to start conversation");
      }
    } catch (err) {
      console.error("Failed to start conversation", err);
      showToast("Network error starting conversation");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!profile || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ receiverId: profile.id }),
      });
      if (res.ok) {
        setRelationship("PENDING_SENT");
        setPermissions((prev) => (prev ? { ...prev, canSendFriendRequest: false } : null));
        showToast("Friend request dispatched");
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Failed to send request");
      }
    } catch (err) {
      console.error("Failed to send friend request", err);
      showToast("Network error sending request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!profile || actionLoading) return;
    setActionLoading(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (confirmModal.type === "REMOVE_FRIEND") {
        const res = await fetch("/api/friends/remove", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: profile.id }),
        });
        if (res.ok) {
          setRelationship("PUBLIC");
          setPermissions((prev) =>
            prev ? { ...prev, canSendFriendRequest: true, canSendMessage: false } : null
          );
          window.dispatchEvent(new CustomEvent("friend-removed", { detail: { userId: profile.id } }));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${profile.username} removed from friends`);
        } else {
          showToast("Failed to remove friend");
        }
      } else if (confirmModal.type === "BLOCK_USER") {
        const res = await fetch("/api/friends/block", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: profile.id }),
        });
        if (res.ok) {
          setRelationship("BLOCKED");
          setPermissions((prev) =>
            prev ? { ...prev, canSendFriendRequest: false, canSendMessage: false } : null
          );
          window.dispatchEvent(new CustomEvent("friend-removed", { detail: { userId: profile.id } }));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${profile.username} blocked`);
        } else {
          showToast("Failed to block scholar");
        }
      } else if (confirmModal.type === "UNBLOCK_USER") {
        const res = await fetch("/api/friends/unblock", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: profile.id }),
        });
        if (res.ok) {
          setRelationship("PUBLIC");
          setPermissions((prev) => (prev ? { ...prev, canSendFriendRequest: true } : null));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${profile.username} unblocked`);
        } else {
          showToast("Failed to unblock scholar");
        }
      }
    } catch (err) {
      console.error("Action error:", err);
      showToast("Network error executing action");
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted font-['Rajdhani'] animate-pulse">Accessing Scholar Dossier...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 system-card text-center">
        <h2 className="text-xl font-bold font-['Rajdhani'] mb-2 text-text-primary">Record Unavailable</h2>
        <p className="text-sm text-text-secondary mb-6 font-['Rajdhani']">{error || "Could not retrieve user details."}</p>
        <Link href="/dashboard" className="btn-secondary px-6 py-2">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const classInfo = getClassInfo(profile.activeAvatar);
  const currentTitle =
    COSMETICS_CATALOG.TITLE?.find((t) => t.id === (profile.activeTitle || "title_novice"))?.value ||
    profile.activeTitle ||
    "Novice";
  const totalStudyHours = profile.totalStudyMinutes !== undefined ? Math.floor(profile.totalStudyMinutes / 60) : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 relative">
      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-6 left-1/2 z-50 px-4 py-2 rounded-xl bg-bg-abyss/95 border border-accent-primary/50 text-text-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider shadow-2xl flex items-center gap-2 backdrop-blur-md pointer-events-none"
          >
            <SylvieIcon size={14} className="text-accent-primary animate-spin" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back button */}
      <div className="mb-4">
        <Link
          href="/social"
          className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary flex items-center gap-1.5 transition-colors"
        >
          ← Back to Social Guild
        </Link>
      </div>

      <div className="system-card overflow-hidden">
        {/* Banner Area */}
        <div className="h-44 sm:h-56 bg-bg-abyss relative overflow-hidden">
          {profile.bannerUrl ? (
            <img src={profile.bannerUrl} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: "linear-gradient(135deg, rgba(30, 27, 75, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-panel via-transparent to-black/30" />
        </div>

        {/* Profile Details */}
        <div className="px-6 sm:px-8 pb-8 relative -mt-16 sm:-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border-subtle">
            <div className="flex items-end gap-4">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-bg-panel bg-bg-abyss flex items-center justify-center overflow-hidden shadow-2xl relative">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl select-none font-bold font-['Rajdhani'] text-emerald-400">
                    {(profile.name || profile.username || "S").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="mb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold font-['Rajdhani'] text-text-primary">
                    {profile.name || profile.username}
                  </h1>
                  <span className="text-xs text-text-muted font-mono">@{profile.username}</span>
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                    {classInfo?.name || "Scholar"}
                  </span>
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {profile.hunterRank ? `Rank ${profile.hunterRank}` : "Rank Classified"}
                  </span>
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-bg-abyss text-text-secondary border border-border-subtle">
                    {currentTitle}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5" ref={menuRef}>
              {permissions?.canSendMessage && (
                <button
                  onClick={handleMessage}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle hover:border-accent-primary transition-all flex items-center gap-2 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Message</span>
                </button>
              )}

              {relationship === "FRIEND" ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen((prev) => !prev)}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm group cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Friends</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-emerald-400/80 transition-transform duration-200 ${
                        actionsMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {actionsMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-48 py-1.5 rounded-xl bg-bg-panel/95 backdrop-blur-xl border border-border-subtle shadow-2xl z-30 flex flex-col overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuOpen(false);
                            setConfirmModal({
                              isOpen: true,
                              type: "REMOVE_FRIEND",
                              title: "Remove Friend",
                              message: `Are you sure you want to remove @${profile.username} from your friend list?`,
                              danger: true,
                              confirmText: "Remove Friend",
                            });
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4 text-rose-400" />
                          <span>Remove Friend</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuOpen(false);
                            setConfirmModal({
                              isOpen: true,
                              type: "BLOCK_USER",
                              title: "Block Scholar",
                              message: `Are you sure you want to block @${profile.username}?`,
                              danger: true,
                              confirmText: "Block Scholar",
                            });
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 hover:bg-rose-500/15 flex items-center gap-2 transition-colors border-t border-border-subtle/50 cursor-pointer"
                        >
                          <Ban className="w-4 h-4 text-rose-500" />
                          <span>Block Scholar</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : relationship === "BLOCKED" ? (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-rose-400" />
                    <span>Blocked</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        type: "UNBLOCK_USER",
                        title: "Unblock Scholar",
                        message: `Are you sure you want to unblock @${profile.username}?`,
                        danger: false,
                        confirmText: "Unblock Scholar",
                      });
                    }}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl bg-bg-abyss/90 hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unblock</span>
                  </button>
                </div>
              ) : relationship === "PENDING_SENT" ? (
                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Request Sent</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        type: "BLOCK_USER",
                        title: "Block Scholar",
                        message: `Are you sure you want to block @${profile.username}?`,
                        danger: true,
                        confirmText: "Block Scholar",
                      });
                    }}
                    className="p-2 rounded-xl bg-bg-abyss/80 hover:bg-rose-500/10 text-text-muted hover:text-rose-400 border border-border-subtle transition-all cursor-pointer"
                    title="Block Scholar"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : permissions?.canSendFriendRequest ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddFriend}
                    disabled={actionLoading}
                    className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    style={{
                      background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                      color: "var(--accent-foreground)",
                      border: "none",
                    }}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Friend</span>
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActionsMenuOpen((prev) => !prev)}
                      className="p-2 rounded-xl bg-bg-abyss/80 hover:bg-bg-shadow text-text-muted hover:text-text-primary border border-border-subtle transition-all cursor-pointer"
                      title="More Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    <AnimatePresence>
                      {actionsMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 5 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-44 py-1.5 rounded-xl bg-bg-panel/95 backdrop-blur-xl border border-border-subtle shadow-2xl z-30 flex flex-col"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActionsMenuOpen(false);
                              setConfirmModal({
                                isOpen: true,
                                type: "BLOCK_USER",
                                title: "Block Scholar",
                                message: `Are you sure you want to block @${profile.username}?`,
                                danger: true,
                                confirmText: "Block Scholar",
                              });
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-400" />
                            <span>Block Scholar</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen((prev) => !prev)}
                    className="p-2 rounded-xl bg-bg-abyss/80 hover:bg-bg-shadow text-text-muted hover:text-text-primary border border-border-subtle transition-all cursor-pointer"
                    title="More Options"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  <AnimatePresence>
                    {actionsMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-44 py-1.5 rounded-xl bg-bg-panel/95 backdrop-blur-xl border border-border-subtle shadow-2xl z-30 flex flex-col"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuOpen(false);
                            setConfirmModal({
                              isOpen: true,
                              type: "BLOCK_USER",
                              title: "Block Scholar",
                              message: `Are you sure you want to block @${profile.username}?`,
                              danger: true,
                              confirmText: "Block Scholar",
                            });
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-400" />
                          <span>Block Scholar</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {profile.isRestricted ? (
            <div className="py-16 text-center max-w-md mx-auto flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-3">
                <Lock className="w-7 h-7 text-text-muted" />
              </div>
              <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider mb-1">
                Classified Scholar Dossier
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani'] mb-4">
                {relationship === "BLOCKED"
                  ? "You have blocked this scholar. Unblock them to restore profile access and interaction."
                  : "This scholar has restricted their profile details to confirmed connections."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              {/* Bio & Connected Accounts */}
              <div className="md:col-span-2 space-y-4">
                <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle">
                  <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted mb-2">
                    Scholar Bio
                  </h3>
                  <p className="text-sm text-text-secondary font-['Rajdhani'] leading-relaxed">
                    {profile.bio || "No bio established in the system."}
                  </p>
                </div>

                {/* Connected Accounts */}
                {(profile.connectedAccounts?.github ||
                  profile.connectedAccounts?.discord ||
                  profile.connectedAccounts?.instagram) && (
                  <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle">
                    <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted mb-3">
                      Connected Accounts & Socials
                    </h3>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* GitHub */}
                      {profile.connectedAccounts?.github && (
                        <a
                          href={`https://github.com/${profile.connectedAccounts.github.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs text-text-primary flex items-center gap-2 transition-all font-mono shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 fill-current text-text-primary" viewBox="0 0 24 24">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.304 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                          <span>{profile.connectedAccounts.github}</span>
                        </a>
                      )}

                      {/* Discord */}
                      {profile.connectedAccounts?.discord && (
                        <span className="px-3 py-1.5 rounded-lg bg-bg-panel border border-border-subtle text-xs text-text-primary flex items-center gap-2 font-mono shadow-sm">
                          <svg className="w-3.5 h-3.5 fill-[#5865F2]" viewBox="0 0 24 24">
                            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                          </svg>
                          <span>{profile.connectedAccounts.discord}</span>
                        </span>
                      )}

                      {/* Instagram */}
                      {profile.connectedAccounts?.instagram && (
                        <a
                          href={`https://instagram.com/${profile.connectedAccounts.instagram.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs text-text-primary flex items-center gap-2 transition-all font-mono shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 fill-[#E4405F]" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                          </svg>
                          <span>{profile.connectedAccounts.instagram}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Study Stats */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle flex justify-between items-center">
                  <span className="text-xs text-text-muted font-['Rajdhani'] uppercase">Today&apos;s Focus</span>
                  <span className="text-sm font-bold font-mono text-accent-text-light">
                    {profile.todayStudySeconds !== undefined
                      ? `${Math.floor(profile.todayStudySeconds / 3600).toString().padStart(2, "0")}:${Math.floor((profile.todayStudySeconds % 3600) / 60).toString().padStart(2, "0")}:${(profile.todayStudySeconds % 60).toString().padStart(2, "0")}`
                      : "00:00:00"}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle flex justify-between items-center">
                  <span className="text-xs text-text-muted font-['Rajdhani'] uppercase">Total Study Time</span>
                  <span className="text-sm font-bold font-['Rajdhani'] text-text-primary">{totalStudyHours}h</span>
                </div>
                <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle flex justify-between items-center">
                  <span className="text-xs text-text-muted font-['Rajdhani'] uppercase">Current Streak</span>
                  <span className="text-sm font-bold font-['Rajdhani'] text-amber-400 flex items-center gap-1.5">
                    <StreakFlameIcon size={14} className="text-amber-400" />
                    <span>{profile.streakDays || 0} {profile.streakDays === 1 ? "Week" : "Weeks"}</span>
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-bg-abyss/50 border border-border-subtle flex justify-between items-center">
                  <span className="text-xs text-text-muted font-['Rajdhani'] uppercase flex items-center gap-1.5">
                    <QuestEmblemIcon size={12} className="text-accent-primary" />
                    Quests Completed
                  </span>
                  <span className="text-sm font-bold font-['Rajdhani'] text-text-primary">
                    {profile.completedQuestsCount || 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmAction}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
}
