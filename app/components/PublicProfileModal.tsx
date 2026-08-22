"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthProvider";
import { useProfileModal } from "./ProfileModalContext";
import { getClassInfo, COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { CharacterRenderer } from "./character/CharacterRenderer";
import { ConfirmationModal } from "./ConfirmationModal";
import {
  Edit3,
  MessageSquare,
  Check,
  Clock,
  UserPlus,
  UserMinus,
  Ban,
  ShieldCheck,
  ChevronDown,
  MoreVertical,
  Flame,
  Shield,
  Award,
  Sparkles,
  ExternalLink,
  Briefcase,
  MessageCircle,
  Activity,
  Cpu,
  Target,
  Zap,
  Globe,
  Code2,
  Lock,
} from "lucide-react";

interface ProfileDossier {
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
  lastActiveDate?: string;
  createdAt?: string;
}

type TabType = "OVERVIEW" | "STATS" | "ACHIEVEMENTS";

export function PublicProfileModal() {
  const { isOpen, username, closeProfile } = useProfileModal();
  const { user: currentUser, token } = useAuth();
  const router = useRouter();

  const [dossier, setDossier] = useState<ProfileDossier | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [relationship, setRelationship] = useState<string>("PUBLIC");
  const [permissions, setPermissions] = useState<{
    canSendFriendRequest: boolean;
    canSendMessage: boolean;
    canRemoveFriend?: boolean;
    canBlock?: boolean;
    canUnblock?: boolean;
  }>({ canSendFriendRequest: false, canSendMessage: false });
  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Actions Dropdown Menu & Confirmation Modal States
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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Fetch Target Profile Data ─────────────────────────────
  useEffect(() => {
    if (!isOpen || !username) {
      setDossier(null);
      setError(null);
      setActionsMenuOpen(false);
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/profile/${username}`, { headers });
        if (!res.ok) {
          if (res.status === 404) {
            setError("Scholar not found in the system registry.");
          } else {
            setError("Failed to load scholar dossier.");
          }
          return;
        }

        const data = await res.json();
        setDossier(data.profile);
        setIsSelf(data.isSelf);
        setRelationship(data.relationship);
        setPermissions(data.permissions);
      } catch (err) {
        setError("Network error while connecting to system registry.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [isOpen, username, token]);

  // ─── Keyboard Shortcut to Close (ESC) ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !confirmModal.isOpen) {
        closeProfile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeProfile, confirmModal.isOpen]);

  // ─── Action Handlers ───────────────────────────────────────
  const handleEditProfile = () => {
    closeProfile();
    router.push("/locker?tab=identity");
  };

  const handleSendMessage = async () => {
    if (!dossier || !token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantIds: [dossier.id] }),
      });
      if (res.ok) {
        const data = await res.json();
        closeProfile();
        router.push(`/social/chat/${data.id}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Failed to start conversation");
      }
    } catch (err) {
      console.error("Failed to initiate conversation", err);
      showToast("Network error starting conversation");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!dossier || !token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ receiverId: dossier.id }),
      });
      if (res.ok) {
        setRelationship("PENDING_SENT");
        setPermissions((prev) => ({ ...prev, canSendFriendRequest: false }));
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
    if (!dossier || actionLoading) return;
    setActionLoading(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      if (confirmModal.type === "REMOVE_FRIEND") {
        const res = await fetch("/api/friends/remove", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: dossier.id }),
        });
        if (res.ok) {
          setRelationship("PUBLIC");
          setPermissions((prev) => ({
            ...prev,
            canSendFriendRequest: true,
            canSendMessage: false,
          }));
          window.dispatchEvent(new CustomEvent("friend-removed", { detail: { userId: dossier.id } }));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${dossier.username} removed from friends`);
        } else {
          showToast("Failed to remove friend");
        }
      } else if (confirmModal.type === "BLOCK_USER") {
        const res = await fetch("/api/friends/block", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: dossier.id }),
        });
        if (res.ok) {
          setRelationship("BLOCKED");
          setPermissions((prev) => ({
            ...prev,
            canSendFriendRequest: false,
            canSendMessage: false,
          }));
          window.dispatchEvent(new CustomEvent("friend-removed", { detail: { userId: dossier.id } }));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${dossier.username} blocked`);
        } else {
          showToast("Failed to block scholar");
        }
      } else if (confirmModal.type === "UNBLOCK_USER") {
        const res = await fetch("/api/friends/unblock", {
          method: "POST",
          headers,
          body: JSON.stringify({ targetUserId: dossier.id }),
        });
        if (res.ok) {
          setRelationship("PUBLIC");
          setPermissions((prev) => ({
            ...prev,
            canSendFriendRequest: true,
          }));
          window.dispatchEvent(new CustomEvent("friends-updated"));
          showToast(`@${dossier.username} unblocked`);
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

  const classInfo = dossier ? getClassInfo(dossier.activeAvatar) : null;
  const currentTitle =
    COSMETICS_CATALOG.TITLE?.find(
      (t) => t.id === (dossier?.activeTitle || "title_novice")
    )?.value || dossier?.activeTitle || "Novice";

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalStudyHours = dossier?.totalStudyMinutes !== undefined
    ? Math.floor(dossier.totalStudyMinutes / 60)
    : 0;

  const xpPercent =
    dossier && dossier.xpToNextLevel && dossier.xpToNextLevel > 0
      ? Math.min(100, Math.round(((dossier.currentXP || 0) / dossier.xpToNextLevel) * 100))
      : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeProfile}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            className="relative w-full max-w-4xl bg-bg-panel border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          >
            {/* ─── Toast Feedback Overlay ───────────────────────── */}
            <AnimatePresence>
              {toastMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -20, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: -20, x: "-50%" }}
                  className="absolute top-4 left-1/2 z-50 px-4 py-2 rounded-xl bg-bg-abyss/95 border border-accent-primary/50 text-text-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider shadow-2xl flex items-center gap-2 backdrop-blur-md pointer-events-none"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent-primary animate-spin" />
                  <span>{toastMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Header: Panoramic Banner + Identity Bar ──────── */}
            <div className="relative flex-shrink-0">
              {/* Banner Area */}
              <div className="h-44 sm:h-52 w-full bg-bg-abyss relative overflow-hidden">
                {dossier?.bannerUrl ? (
                  <img
                    src={dossier.bannerUrl}
                    alt={`${dossier.username}'s banner`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(30, 27, 75, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)",
                    }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),transparent)]" />
                  </div>
                )}
                {/* Cyberpunk Grid/Gradient Shading Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-bg-panel via-bg-panel/40 to-transparent" />

                {/* Close Button */}
                <button
                  onClick={closeProfile}
                  className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-bg-abyss/80 hover:bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle hover:border-accent-primary transition-all shadow-lg"
                  aria-label="Close Profile"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Profile Identity Bar */}
              <div className="px-6 sm:px-8 pb-4 relative -mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-subtle">
                {/* Left: Avatar & Identity Labels */}
                <div className="flex items-end gap-4">
                  {/* Avatar Frame with Aura */}
                  <div className="relative group">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-bg-panel bg-bg-abyss flex items-center justify-center overflow-hidden shadow-2xl relative">
                      {dossier?.avatarUrl ? (
                        <img
                          src={dossier.avatarUrl}
                          alt={dossier.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl select-none font-bold font-['Rajdhani'] text-emerald-400">
                          {(dossier?.name || dossier?.username || "S").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Status Dot */}
                    {dossier && !dossier.isRestricted && (
                      <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-bg-panel shadow-sm" />
                    )}
                  </div>

                  {/* Name & Badges */}
                  <div className="mb-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                        {dossier?.name || dossier?.username || "Scholar"}
                      </h2>
                      {dossier && (
                        <span className="text-xs text-text-muted font-mono">
                          @{dossier.username}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2.5 py-0.5 rounded shadow-sm"
                        style={{
                          background: "var(--accent-primary-dim)",
                          color: "var(--accent-text-light)",
                          border: "1px solid var(--accent-primary-mid)",
                        }}
                      >
                        {classInfo?.name || "Scholar"}
                      </span>
                      <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm">
                        {dossier?.hunterRank ? `Rank ${dossier.hunterRank}` : "Rank Classified"}
                      </span>
                      <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-bg-abyss/80 text-text-secondary border border-border-subtle shadow-sm">
                        {currentTitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Primary Action Buttons */}
                <div className="flex items-center gap-2.5 pb-1" ref={menuRef}>
                  {isSelf ? (
                    <button
                      type="button"
                      onClick={handleEditProfile}
                      className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-md"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                        color: "var(--text-primary)",
                        border: "none",
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Profile</span>
                    </button>
                  ) : (
                    <>
                      {permissions.canSendMessage && (
                        <button
                          type="button"
                          onClick={handleSendMessage}
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-xl bg-bg-abyss/90 hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle hover:border-accent-primary transition-all flex items-center gap-2 shadow-sm cursor-pointer"
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

                          {/* Dropdown Menu for Friends */}
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
                                      message: `Are you sure you want to remove @${dossier?.username} from your friend list? You will no longer share live study sessions or streaks.`,
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
                                      message: `Are you sure you want to block @${dossier?.username}? They will be removed from your friends and won't be able to message you or send friend requests.`,
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
                                message: `Are you sure you want to unblock @${dossier?.username}?`,
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
                                message: `Are you sure you want to block @${dossier?.username}?`,
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
                      ) : permissions.canSendFriendRequest ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleAddFriend}
                            disabled={actionLoading}
                            className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                              color: "var(--text-primary)",
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
                                        message: `Are you sure you want to block @${dossier?.username}?`,
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
                                      message: `Are you sure you want to block @${dossier?.username}?`,
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
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Content Body (Split Layout) ───────────────────────── */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {isLoading ? (
                <div className="py-20 text-center text-text-muted font-['Rajdhani'] font-medium animate-pulse">
                  Accessing System Records...
                </div>
              ) : error ? (
                <div className="py-20 text-center text-rose-400 font-['Rajdhani'] font-bold">
                  {error}
                </div>
              ) : dossier ? (
                dossier.isRestricted ? (
                  <div className="py-16 px-6 text-center flex flex-col items-center justify-center max-w-md mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-4 shadow-lg">
                      <Lock className="w-8 h-8 text-text-muted" />
                    </div>
                    <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider mb-2">
                      Classified Scholar Dossier
                    </h3>
                    <p className="text-sm text-text-muted font-['Rajdhani'] leading-relaxed mb-6">
                      {relationship === "BLOCKED"
                        ? "You have blocked this scholar. Unblock them to restore profile access and interaction."
                        : "This scholar has set their profile visibility to private. Full stats, custom builds, and records are restricted to confirmed connections."}
                    </p>
                    {permissions.canSendFriendRequest && relationship !== "BLOCKED" && (
                      <button
                        type="button"
                        onClick={handleAddFriend}
                        disabled={actionLoading}
                        className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                          color: "var(--text-primary)",
                          border: "none",
                        }}
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Send Friend Request</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* ─── Left Column: Character Stage (4 Cols) ────────── */}
                    <div className="lg:col-span-4 flex flex-col gap-4">
                      {/* Holographic Character Pedestal */}
                      <div className="relative rounded-2xl bg-bg-abyss/80 border border-border-subtle p-6 flex flex-col items-center justify-center min-h-[350px] overflow-hidden group">
                        {/* Radial Ambient Glow */}
                        <div className="absolute inset-0 bg-gradient-to-b from-accent-primary-dim/30 via-transparent to-accent-primary-dim/10 pointer-events-none" />

                        {/* Vector Character Sprite on Stage */}
                        <div className="relative z-10 flex flex-col items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
                          <CharacterRenderer
                            config={dossier.characterConfig}
                            seed={dossier.username}
                            size={180}
                            showPedestal={true}
                            showAura={true}
                          />
                          <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mt-2">
                            {classInfo?.name || "Scholar"} Stage
                          </span>
                        </div>
                      </div>

                      {/* Level & XP Progression */}
                      <div className="system-card p-4 rounded-xl bg-bg-panel/90 border border-border-subtle flex flex-col gap-2">
                        {dossier.level !== undefined ? (
                          <>
                            <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold">
                              <span className="text-text-primary">
                                Level {dossier.level}
                              </span>
                              <span className="text-accent-text-light">
                                {dossier.currentXP || 0} / {dossier.xpToNextLevel || 1000} XP ({xpPercent}%)
                              </span>
                            </div>

                            <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${xpPercent}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light rounded-full"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold py-1">
                            <span className="text-text-muted flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5" /> Hunter Rank & Level
                            </span>
                            <span className="text-text-muted">Classified</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border-subtle/50 text-center">
                          <div className="p-2 rounded-lg bg-bg-abyss/60 border border-border-subtle">
                            <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase block">
                              Study Hours
                            </span>
                            <span className="text-sm font-bold font-['Rajdhani'] text-text-primary">
                              {dossier.totalStudyMinutes !== undefined ? `${totalStudyHours}h` : "—"}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-bg-abyss/60 border border-border-subtle">
                            <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase block">
                              Streak
                            </span>
                            <span className="text-sm font-bold font-['Rajdhani'] text-amber-400 flex items-center justify-center gap-1">
                              <Flame className="w-3.5 h-3.5 text-amber-400" />
                              <span>{dossier.streakDays !== undefined ? dossier.streakDays : "—"}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ─── Right Column: Tabbed Dossier (8 Cols) ────────── */}
                    <div className="lg:col-span-8 flex flex-col gap-5">
                      {/* Tab Navigation */}
                      <div className="flex items-center gap-2 border-b border-border-subtle pb-2 overflow-x-auto">
                        {(
                          [
                            { id: "OVERVIEW", label: "Overview" },
                            { id: "STATS", label: "Cognitive Stats" },
                            { id: "ACHIEVEMENTS", label: "Achievements" },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              activeTab === tab.id
                                ? "bg-accent-primary text-text-primary shadow-md"
                                : "text-text-muted hover:text-text-primary hover:bg-bg-abyss/60"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab Content Panels */}
                      {activeTab === "OVERVIEW" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          {/* Bio / Thesis */}
                          <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle">
                            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light block mb-2">
                              Scholar Thesis & Bio
                            </span>
                            <p className="text-sm text-text-secondary leading-relaxed font-['Rajdhani']">
                              {dossier.bio || "No thesis established in the system."}
                            </p>
                          </div>

                          {/* Social Networks & Connected Accounts */}
                          <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle">
                            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light block mb-3">
                              Connected Accounts & Socials
                            </span>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {/* GitHub */}
                              {dossier.connectedAccounts?.github && (
                                <a
                                  href={`https://github.com/${dossier.connectedAccounts.github.replace("@", "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-bg-abyss/80 hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs text-text-primary flex items-center gap-2 transition-all font-mono shadow-sm"
                                >
                                  <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.304 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                  </svg>
                                  <span>{dossier.connectedAccounts.github}</span>
                                  <ExternalLink className="w-3 h-3 text-text-muted" />
                                </a>
                              )}

                              {/* Discord */}
                              {dossier.connectedAccounts?.discord && (
                                <span className="px-3 py-1.5 rounded-lg bg-bg-abyss/80 border border-border-subtle text-xs text-text-primary flex items-center gap-2 font-mono shadow-sm">
                                  <svg className="w-3.5 h-3.5 fill-[#5865F2]" viewBox="0 0 24 24">
                                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                  </svg>
                                  <span>{dossier.connectedAccounts.discord}</span>
                                </span>
                              )}

                              {/* Instagram */}
                              {dossier.connectedAccounts?.instagram && (
                                <a
                                  href={`https://instagram.com/${dossier.connectedAccounts.instagram.replace("@", "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-bg-abyss/80 hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs text-text-primary flex items-center gap-2 transition-all font-mono shadow-sm"
                                >
                                  <svg className="w-3.5 h-3.5 fill-[#E4405F]" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                                  </svg>
                                  <span>{dossier.connectedAccounts.instagram}</span>
                                  <ExternalLink className="w-3 h-3 text-text-muted" />
                                </a>
                              )}

                              {!dossier.connectedAccounts?.github &&
                                !dossier.connectedAccounts?.discord &&
                                !dossier.connectedAccounts?.instagram && (
                                  <span className="text-xs text-text-muted font-['Rajdhani']">
                                    No public connected accounts linked.
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col">
                              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">
                                Registry Date
                              </span>
                              <span className="text-sm font-bold font-['Rajdhani'] text-text-primary mt-0.5 truncate">
                                {dossier.createdAt
                                  ? new Date(dossier.createdAt).toLocaleDateString(undefined, {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "Classified"}
                              </span>
                            </div>
                            <div className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col">
                              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">
                                Quests Cleared
                              </span>
                              <span className="text-sm font-bold font-['Rajdhani'] text-text-primary mt-0.5">
                                {dossier.completedQuestsCount !== undefined
                                  ? `${dossier.completedQuestsCount} Quests`
                                  : "Classified"}
                              </span>
                            </div>
                            <div className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col">
                              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">
                                Today&apos;s Focus
                              </span>
                              <span className="text-sm font-bold font-mono text-accent-text-light mt-0.5">
                                {dossier.todayStudySeconds !== undefined
                                  ? formatTime(dossier.todayStudySeconds)
                                  : "—"}
                              </span>
                            </div>
                            <div className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col">
                              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">
                                Last Active
                              </span>
                              <span className="text-sm font-bold font-['Rajdhani'] text-text-primary mt-0.5 truncate">
                                {dossier.lastActiveDate
                                  ? new Date(dossier.lastActiveDate).toLocaleDateString(undefined, {
                                      day: "numeric",
                                      month: "short",
                                    })
                                  : "Classified"}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {activeTab === "STATS" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          {dossier.stats ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              {[
                                {
                                  label: "Endurance (Focus Stamina)",
                                  val: dossier.stats.endurance,
                                  icon: Activity,
                                  color: "text-emerald-400",
                                },
                                {
                                  label: "Tenacity (Streak Resilience)",
                                  val: dossier.stats.tenacity,
                                  icon: Shield,
                                  color: "text-blue-400",
                                },
                                {
                                  label: "Velocity (Pacing Speed)",
                                  val: dossier.stats.velocity,
                                  icon: Zap,
                                  color: "text-amber-400",
                                },
                                {
                                  label: "Synthesis (Complex Output)",
                                  val: dossier.stats.synthesis,
                                  icon: Cpu,
                                  color: "text-purple-400",
                                },
                                {
                                  label: "Discipline (Daily Consistency)",
                                  val: dossier.stats.discipline,
                                  icon: Target,
                                  color: "text-rose-400",
                                },
                              ].map((stat, idx) => {
                                const IconComponent = stat.icon;
                                return (
                                  <div
                                    key={idx}
                                    className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col gap-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-text-secondary font-['Rajdhani'] font-medium flex items-center gap-1.5">
                                        <IconComponent className={`w-3.5 h-3.5 ${stat.color}`} />
                                        <span>{stat.label}</span>
                                      </span>
                                      <span className="text-sm font-bold font-mono text-text-primary">
                                        {stat.val}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-bg-abyss rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-accent-primary rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.min(100, (stat.val / 50) * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center">
                              <Lock className="w-8 h-8 text-text-muted mb-2" />
                              <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                                Cognitive Stats Classified
                              </h4>
                              <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                                This scholar has restricted their stat records to confirmed connections.
                              </p>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {activeTab === "ACHIEVEMENTS" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          {dossier.recentAchievements && dossier.recentAchievements.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {dossier.recentAchievements.map((ach, idx) => (
                                <div
                                  key={idx}
                                  className="system-card p-4 rounded-xl bg-bg-panel/80 border border-border-subtle flex items-center gap-3.5"
                                >
                                  <div className="w-10 h-10 rounded-xl bg-accent-primary-dim/30 border border-accent-primary-mid flex items-center justify-center flex-shrink-0">
                                    <Award className="w-5 h-5 text-accent-text-light" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                                      {ach.achievementId.replace(/_/g, " ").toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-text-muted font-mono">
                                      {new Date(ach.claimedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center">
                              <Lock className="w-8 h-8 text-text-muted mb-2" />
                              <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                                Achievement Archives Restricted
                              </h4>
                              <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                                This scholar has chosen to keep their earned milestones and titles private.
                              </p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </div>
                )
              ) : null}
            </div>

            {/* ─── Confirmation Modal for Remove & Block ───────────── */}
            <ConfirmationModal
              isOpen={confirmModal.isOpen}
              onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
              onConfirm={handleConfirmAction}
              title={confirmModal.title}
              message={confirmModal.message}
              danger={confirmModal.danger}
              confirmText={confirmModal.confirmText}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
