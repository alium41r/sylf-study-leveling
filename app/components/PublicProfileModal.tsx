"use client";
import { TargetPixelCompanion } from "@/app/components/companion/TargetPixelCompanion";
import type { SelectedPixelCompanion } from "@/lib/pixel-companion-contract";


import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants, topToastVariants } from "@/lib/motion";
import { useAuth } from "./AuthProvider";
import { useProfileModal } from "./ProfileModalContext";
import { getClassInfo, COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { ConfirmationModal } from "./ConfirmationModal";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  getStatCap,
  COGNITIVE_STATS,
  type CognitiveStatKey,
} from "@/lib/cognitive-stats";
import { RANK_LADDER, getNextRank } from "@/lib/game-engine";
import { ACHIEVEMENTS_CATALOG, RARITY_COLORS } from "@/lib/achievements-catalog";
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
  Award,
  Sparkles,
  ExternalLink,
  Briefcase,
  MessageCircle,
  Globe,
  Code2,
  Lock,
} from "lucide-react";
import { StreakFlameIcon, QuestEmblemIcon, SylvieIcon } from "@/app/components/icons";

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
  isOnline?: boolean;
  activeSessionStartedAt?: string | null;
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string;
  activeAura?: string;
  activeNameColor?: string;
  characterConfig?: any | null;
  companion?: SelectedPixelCompanion;
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

/* ─── Pentagonal Attribute Radar (profile sheet design) ───────── */

function AttributeRadar({ values }: { values: Record<CognitiveStatKey, number> }) {
  const ORDER: { key: CognitiveStatKey; label: string }[] = [
    { key: "endurance", label: "ENDURANCE" },
    { key: "tenacity", label: "TENACITY" },
    { key: "velocity", label: "VELOCITY" },
    { key: "discipline", label: "DISCIPLINE" },
    { key: "synthesis", label: "SYNTHESIS" },
  ];
  const CX = 150;
  const CY = 138;
  const R = 82;

  const pt = (i: number, r: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / ORDER.length - Math.PI / 2;
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
  };

  const rings = [1, 2, 3].map((k) =>
    ORDER.map((_, i) => pt(i, (R * k) / 3).join(",")).join(" ")
  );
  const axes = ORDER.map((_, i) => {
    const [x, y] = pt(i, R);
    return { x1: CX, y1: CY, x2: x, y2: y };
  });
  const valuePts = ORDER.map((o, i) => pt(i, (R * Math.min(100, values[o.key] ?? 0)) / 100));

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[340px] mx-auto select-none">
      {/* Center marker */}
      <circle cx={CX} cy={CY} r={3.5} fill="var(--accent-primary)" opacity={0.9} />
      {/* Grid rings */}
      {rings.map((pts, k) => (
        <polygon key={k} points={pts} fill="none" stroke="var(--border-subtle)" strokeWidth={1} />
      ))}
      {/* Axis spokes */}
      {axes.map((l, i) => (
        <line key={i} {...l} stroke="var(--border-subtle)" strokeWidth={1} />
      ))}
      {/* Value polygon */}
      <polygon
        points={valuePts.map((p) => p.join(",")).join(" ")}
        fill="var(--accent-primary-dim)"
        stroke="var(--accent-primary)"
        strokeWidth={1.6}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 6px var(--accent-primary-dim))" }}
      />
      {/* Vertex dots + axis labels */}
      {ORDER.map((o, i) => {
        const [vx, vy] = valuePts[i];
        const [lx, ly] = pt(i, R + 26);
        const value = Math.min(100, values[o.key] ?? 0);
        return (
          <g key={o.key}>
            <circle cx={vx} cy={vy} r={3} fill="var(--accent-primary-light)" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize="10"
              fontWeight={700}
              style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.12em" }}
            >
              {o.label}
            </text>
            <text
              x={lx}
              y={ly + 13}
              textAnchor="middle"
              fill="var(--accent-text-light)"
              fontSize="10"
              fontWeight={700}
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PublicProfileModal() {
  const { isOpen, username, closeProfile } = useProfileModal();
  const { user: currentUser } = useAuth();
  const router = useRouter();

  const [dossier, setDossier] = useState<ProfileDossier | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<{
    isProfileVisible?: boolean;
    showRank?: boolean;
    showStudyHours?: boolean;
    showAchievements?: boolean;
  } | null>(null);
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

  // ─── Cognitive training (self only) ─────────────────────────
  const [selfCog, setSelfCog] = useState<{
    stats: Record<string, number>;
    skillPoints: number;
    sylph: number;
    cap: number;
    abilities: Array<{
      key: string;
      label: string;
      perkName: string;
      perkLadder: string;
      value: number;
      tier: number;
      maxTier: number;
      nextTierAt: number | null;
      investable: boolean;
      costSp: number;
      costSylph: number;
    }>;
  } | null>(null);
  const [cogCurrency, setCogCurrency] = useState<"sp" | "sylph">("sylph");
  const [cogBusy, setCogBusy] = useState<string | null>(null);
  const [cogFeedback, setCogFeedback] = useState<string | null>(null);
  const [showTrain, setShowTrain] = useState(false);

  const loadSelfCognitive = useRef(() => {});
  loadSelfCognitive.current = async () => {
    try {
      const res = await fetch("/api/cognitive-stats/invest", { credentials: "include" });
      if (res.ok) setSelfCog(await res.json());
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    const isSelfViewer = Boolean(
      isSelf ||
      (currentUser?.username && username && currentUser.username.toLowerCase() === username.toLowerCase())
    );
    if (isSelfViewer && dossier) {
      loadSelfCognitive.current();
    } else {
      setSelfCog(null);
    }
  }, [isSelf, dossier?.id, currentUser?.username, username]);

  const handleCogInvest = async (key: string) => {
    if (cogBusy) return;
    setCogBusy(key);
    setCogFeedback(null);
    try {
      const res = await fetch("/api/cognitive-stats/invest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stat: key, currency: cogCurrency }),
      });
      const data = await res.json();
      if (res.ok) {
        setCogFeedback(
          `${data.ability?.label ?? "Stat"} → ${data.ability?.value} (+${data.amount} · −${data.cost} ${cogCurrency === "sp" ? "SP" : "Sylph"})`
        );
        await loadSelfCognitive.current();
      } else {
        setCogFeedback(data.error || "Invest failed");
      }
    } catch {
      setCogFeedback("Network error — try again");
    } finally {
      setCogBusy(null);
    }
  };

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
        // Stale-while-revalidate: re-opening a recently viewed profile paints
        // the cached dossier instantly and refreshes in the background.
        const data = await fetchCachedJSON<{
          profile: any;
          isSelf?: boolean;
          relationship: string;
          permissions: any;
          privacySettings?: any;
        }>(
          `/api/profile/${username}`,
          { credentials: "include" },
          { ttlMs: 15_000, staleMs: 300_000, storageKey: `profile:${username.toLowerCase()}:${currentUser?.id ?? "guest"}` }
        );

        if (!data || !data.profile) {
          setError("Scholar not found in the system registry.");
          return;
        }

        setDossier(data.profile);
        const resolvedSelf = Boolean(
          data.isSelf ||
          data.relationship === "SELF" ||
          (currentUser?.username && username && currentUser.username.toLowerCase() === username.toLowerCase()) ||
          (currentUser?.id && data.profile?.id && currentUser.id === data.profile.id)
        );
        setIsSelf(resolvedSelf);
        setRelationship(data.relationship);
        setPermissions(data.permissions);
        setPrivacySettings(data.privacySettings || null);
      } catch (err) {
        setError("Network error while connecting to system registry.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [isOpen, username, currentUser?.id, currentUser?.username]);

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
    if (!dossier || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    if (!dossier || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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


  const xpPercent =
    dossier && dossier.xpToNextLevel && dossier.xpToNextLevel > 0
      ? Math.min(100, Math.round(((dossier.currentXP || 0) / dossier.xpToNextLevel) * 100))
      : 0;

  // Level-gated attribute cap + next-rank rung (profile sheet design).
  const statCap = getStatCap(dossier?.level ?? 1);
  const nextRank = getNextRank(dossier?.level ?? 1);

  const isEffectiveSelf = Boolean(
    isSelf ||
    (currentUser?.username && username && currentUser.username.toLowerCase() === username.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="public-profile-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          {/* Backdrop Overlay */}
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={closeProfile}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-4xl bg-bg-panel border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          >
            {/* ─── Toast Feedback Overlay ───────────────────────── */}
            <AnimatePresence>
              {toastMsg && (
                <motion.div
                  variants={topToastVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute top-4 left-1/2 z-50 px-4 py-2 rounded-xl bg-bg-abyss/95 border border-accent-primary/50 text-text-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider shadow-2xl flex items-center gap-2 backdrop-blur-md pointer-events-none"
                >
                  <SylvieIcon size={14} className="text-accent-primary animate-spin" />
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
                    {/* Status Dot — reflects the REAL online state (heartbeat
                        within 2 min). Green = online now; grey = offline;
                        emerald ring + label when currently studying. */}
                    {dossier && !dossier.isRestricted && (
                      <>
                        <span
                          title={dossier.isOnline
                            ? dossier.isStudying
                              ? "Online · Studying"
                              : "Online"
                            : "Offline"}
                          className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-bg-panel shadow-sm ${
                            dossier.isOnline
                              ? dossier.isStudying
                                ? "bg-cyan-400 ring-2 ring-cyan-400/40 animate-pulse"
                                : "bg-emerald-500"
                              : "bg-slate-500/70"
                          }`}
                        />
                        {(dossier.isOnline || dossier.isStudying) && (
                          <span
                            className="absolute -bottom-1.5 -right-0.5 text-[0.55rem] font-['Rajdhani'] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-bg-abyss/90 border border-border-subtle"
                            style={{
                              color: dossier.isStudying ? "var(--accent-cyan)" : "#10b981",
                            }}
                          >
                            {dossier.isStudying ? "Focusing" : "Online"}
                          </span>
                        )}
                      </>
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
                  {isEffectiveSelf ? (
                    <button
                      type="button"
                      onClick={handleEditProfile}
                      className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-md"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                        color: "var(--accent-foreground)",
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
                          color: "var(--accent-foreground)",
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
                      <div className="relative rounded-2xl bg-bg-abyss/80 border border-border-subtle p-6 flex flex-col items-center justify-center min-h-[380px] lg:min-h-[460px] overflow-hidden group">
                        {/* Radial Ambient Glow */}
                        <div className="absolute inset-0 bg-gradient-to-b from-accent-primary-dim/30 via-transparent to-accent-primary-dim/10 pointer-events-none" />

                        {/* Vector Character Sprite on Stage */}
                        <div className="relative z-10 flex flex-col items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
                          <TargetPixelCompanion companion={dossier.companion} size={260} label={`${dossier.username} companion`} autoplay />
                          <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mt-2">
                            {classInfo?.name || "Scholar"} Stage
                          </span>
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
                                ? "bg-accent-primary text-accent-foreground shadow-md"
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
                                  <svg className="w-3.5 h-3.5 fill-current text-text-primary" viewBox="0 0 24 24">
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
                              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase flex items-center gap-1.5">
                                <QuestEmblemIcon size={12} className="text-accent-primary" />
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
                              <span
                                className={`text-sm font-bold font-['Rajdhani'] mt-0.5 truncate ${
                                  dossier.isOnline ? "text-emerald-400" : "text-text-primary"
                                }`}
                              >
                                {dossier.isOnline
                                  ? "Online now"
                                  : dossier.lastActiveDate
                                  ? `Last ${new Date(dossier.lastActiveDate).toLocaleDateString(undefined, {
                                      day: "numeric",
                                      month: "short",
                                    })}`
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
                            <div className="system-card p-6 sm:p-7 rounded-2xl border border-accent-primary-mid/50 bg-gradient-to-b from-bg-void/80 to-bg-abyss/90 relative overflow-hidden">
                              {/* Decorative diamond ornament header */}
                              <div className="flex items-center justify-center gap-2">
                                <div className="h-px w-16 bg-gradient-to-r from-transparent to-accent-primary/60" />
                                <div className="w-1.5 h-1.5 rotate-45 bg-accent-primary shadow-[0_0_8px_var(--accent-primary)]" />
                                <div className="h-px w-16 bg-gradient-to-l from-transparent to-accent-primary/60" />
                              </div>
                              <h3 className="text-center text-lg font-black font-['Rajdhani'] tracking-[0.3em] uppercase text-text-primary mt-1">
                                Solo Player
                              </h3>
                              <div className="flex items-center justify-center gap-2 mt-1">
                                <div className="h-px w-16 bg-gradient-to-r from-transparent to-accent-primary/60" />
                                <div className="w-1.5 h-1.5 rotate-45 bg-accent-primary shadow-[0_0_8px_var(--accent-primary)]" />
                                <div className="h-px w-16 bg-gradient-to-l from-transparent to-accent-primary/60" />
                              </div>

                              {/* Badges: Hunter Rank & Weekly Streak */}
                              <div className="flex items-center justify-center gap-2.5 mt-5 flex-wrap">
                                {dossier.hunterRank && (
                                  <span className="px-4 py-1 rounded-full border border-emerald-400/40 text-emerald-300 text-[11px] font-bold font-['Rajdhani'] uppercase tracking-[0.2em] bg-emerald-400/5">
                                    {dossier.hunterRank} Rank
                                  </span>
                                )}
                                {dossier.streakDays !== undefined && (
                                  <span
                                    className="px-4 py-1 rounded-full border border-amber-400/40 text-amber-300 text-[11px] font-bold font-['Rajdhani'] uppercase tracking-[0.2em] bg-amber-400/5 flex items-center gap-1.5 shadow-[0_0_12px_rgba(251,191,36,0.08)]"
                                    title={`Weekly Streak: ${dossier.streakDays} consecutive week${dossier.streakDays === 1 ? "" : "s"}`}
                                  >
                                    <StreakFlameIcon size={14} className="text-amber-400" />
                                    <span>{dossier.streakDays} {dossier.streakDays === 1 ? "Week" : "Weeks"} Streak</span>
                                  </span>
                                )}
                              </div>

                              {dossier.level !== undefined && (
                                <div className="text-center mt-4">
                                  <p className="text-[10px] uppercase tracking-[0.35em] text-text-muted font-['Rajdhani'] font-bold">
                                    Level
                                  </p>
                                  <p className="text-5xl font-black font-['Rajdhani'] text-text-primary leading-none mt-1">
                                    {dossier.level}
                                  </p>
                                  <div className="h-0.5 w-10 mx-auto mt-2 bg-gradient-to-r from-transparent via-accent-primary to-transparent" />
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-6 mb-1">
                                <p className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                                  Attributes
                                </p>
                                <p className="text-[10px] font-['Rajdhani'] text-text-muted">
                                  MAX: {statCap} (Level {dossier.level ?? 1})
                                </p>
                                {isSelf ? (
                                  <button
                                    onClick={() => setShowTrain(!showTrain)}
                                    title={showTrain ? "Close training" : "Train attributes"}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg leading-none transition-all duration-200 hover:scale-110 active:scale-95 ${
                                      showTrain ? "bg-bg-panel border border-border-subtle text-text-primary" : "bg-accent-primary text-accent-foreground shadow-[0_0_16px_var(--accent-primary-dim)]"
                                    }`}
                                  >
                                    {showTrain ? "−" : "+"}
                                  </button>
                                ) : (
                                  <div className="w-8" />
                                )}
                              </div>

                              <AttributeRadar values={dossier.stats} />

                              {/* ─── XP / Next Rank (mirrors the profile sheet) ─── */}
                              {dossier.currentXP !== undefined &&
                                typeof dossier.xpToNextLevel === "number" &&
                                dossier.xpToNextLevel > 0 && (
                                  <div className="mt-6 pt-5 border-t border-border-subtle">
                                    <div className="flex justify-between items-baseline">
                                      <span className="text-[10px] uppercase tracking-[0.25em] text-text-muted font-['Rajdhani'] font-bold">
                                        Experience Points
                                      </span>
                                      <span className="text-xs font-bold font-['Rajdhani'] text-accent-text-light">
                                        {Math.min(100, Math.round((dossier.currentXP / dossier.xpToNextLevel) * 100))}%
                                      </span>
                                    </div>
                                    <p className="text-center text-3xl font-bold font-['Rajdhani'] text-text-primary mt-2">
                                      {dossier.currentXP.toLocaleString()}
                                    </p>
                                    <div className="h-2 rounded-full bg-bg-void/80 border border-border-subtle overflow-hidden mt-2">
                                      <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                          width: `${xpPercent}%`,
                                          background: "linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))",
                                          boxShadow: "0 0 12px var(--accent-primary-dim)",
                                        }}
                                      />
                                    </div>
                                    <div className="flex justify-between items-center mt-4">
                                      <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-['Rajdhani'] font-bold">
                                        Weekly Streak
                                      </span>
                                      <span className="text-xs font-bold font-['Rajdhani'] text-amber-400 flex items-center gap-1.5">
                                        <StreakFlameIcon size={14} className="text-amber-400" />
                                        <span>{dossier.streakDays ?? 0} {(dossier.streakDays ?? 0) === 1 ? "Week" : "Weeks"}</span>
                                      </span>
                                    </div>
                                    {nextRank ? (
                                      <>
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-border-subtle/50">
                                          <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-['Rajdhani'] font-bold">
                                            Next Rank
                                          </span>
                                          <span className="text-xs font-bold font-['Rajdhani'] text-accent-cyan">
                                            {nextRank.display} Rank
                                          </span>
                                        </div>
                                        <p className="text-right text-[10px] text-text-muted font-['Rajdhani'] mt-0.5">
                                          Level {nextRank.level} needed
                                        </p>
                                      </>
                                    ) : (
                                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-border-subtle/50">
                                        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-['Rajdhani'] font-bold">
                                          Rank Status
                                        </span>
                                        <span className="text-xs font-bold font-['Rajdhani'] text-amber-400">
                                          Apex Tier (Max)
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
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

                          {/* ─── Train Attributes (self only, via "+") ────── */}
                          {isEffectiveSelf && selfCog && showTrain && (
                            <div className="system-card p-5 rounded-xl border border-accent-primary-mid bg-bg-void/60">
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                                <h4 className="text-sm font-bold font-['Rajdhani'] text-accent-text-light uppercase tracking-wider">
                                  Train Attributes
                                </h4>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold font-['Rajdhani'] text-text-secondary">
                                    <span className="text-amber-400">{selfCog.skillPoints} SP</span> ·{" "}
                                    <span className="text-cyan-400">{selfCog.sylph} Sylph</span>
                                  </span>
                                  <div className="flex rounded-full border border-border-subtle overflow-hidden">
                                    {(["sp", "sylph"] as const).map((c) => (
                                      <button
                                        key={c}
                                        onClick={() => setCogCurrency(c)}
                                        className={`px-3 py-1 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider transition-colors ${
                                          cogCurrency === c
                                            ? "bg-accent-primary text-accent-foreground"
                                            : "text-text-muted hover:text-text-primary"
                                        }`}
                                      >
                                        {c === "sp" ? "SP" : "Sylph"}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-text-muted font-['Rajdhani'] mb-3">
                                +5 per train. Costs scale with each stat band — SP is the premium path.
                              </p>
                              {cogFeedback && (
                                <p className="text-[11px] font-['Rajdhani'] font-semibold text-accent-green mb-2">
                                  {cogFeedback}
                                </p>
                              )}
                              <div className="flex flex-col gap-2">
                                {selfCog.abilities.map((a) => (
                                  <div
                                    key={a.key}
                                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-bg-abyss/70 border border-border-subtle"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold font-['Rajdhani'] text-text-primary">
                                        {COGNITIVE_STATS[a.key as CognitiveStatKey].label}
                                      </span>
                                      <span className="text-[10px] text-text-muted font-['Rajdhani'] ml-2">
                                        {a.value}/100 · {a.perkName} T{a.tier}
                                      </span>
                                    </div>
                                    {a.investable ? (
                                      <button
                                        disabled={cogBusy !== null}
                                        onClick={() => handleCogInvest(a.key)}
                                        className="shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                                        style={{
                                          background: "var(--accent-primary-dim)",
                                          border: "1px solid var(--accent-primary-mid)",
                                          color: "var(--accent-text-light)",
                                        }}
                                      >
                                        {cogBusy === a.key
                                          ? "Training…"
                                          : `+5 · ${cogCurrency === "sp" ? `${a.costSp} SP` : `${a.costSylph} Sylph`}`}
                                      </button>
                                    ) : (
                                      <span className="shrink-0 px-3 py-1 rounded-full text-[10px] font-bold font-['Rajdhani'] uppercase text-accent-green border border-accent-green/40 bg-accent-green/10">
                                        {a.value >= 100 ? "Maxed" : `Cap ${selfCog.cap}`}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {activeTab === "ACHIEVEMENTS" && (() => {
                        const isAchievementsRestricted =
                          !isEffectiveSelf &&
                          (dossier.recentAchievements === undefined ||
                           privacySettings?.showAchievements === false);

                        const hasAchievements =
                          Array.isArray(dossier.recentAchievements) &&
                          dossier.recentAchievements.length > 0;

                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col gap-4"
                          >
                            {isAchievementsRestricted ? (
                              <div className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-2xl bg-bg-abyss/80 border border-border-subtle flex items-center justify-center mb-3 text-text-muted">
                                  <Lock className="w-6 h-6" />
                                </div>
                                <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                                  Achievement Archives Restricted
                                </h4>
                                <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                                  This scholar has chosen to keep their earned milestones and titles private.
                                </p>
                              </div>
                            ) : !hasAchievements ? (
                              <div className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center">
                                <div
                                  className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-3 ${
                                    isEffectiveSelf
                                      ? "bg-accent-primary-dim/25 border-accent-primary-mid/40"
                                      : "bg-bg-abyss/80 border-border-subtle text-text-muted"
                                  }`}
                                >
                                  <Award
                                    className={`w-6 h-6 ${
                                      isEffectiveSelf ? "text-accent-text-light" : "text-text-muted"
                                    }`}
                                  />
                                </div>
                                <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                                  No Achievements Unlocked Yet
                                </h4>
                                <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                                  {isEffectiveSelf
                                    ? "Complete focus sessions, level up your hunter rank, and hit study milestones to unlock and claim rewards in your Codex."
                                    : "This scholar hasn't claimed any milestones from the Codex yet."}
                                </p>
                                {isEffectiveSelf && (
                                  <a
                                    href="/settings/achievements"
                                    className="mt-4 px-4 py-2 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider transition-all duration-200 hover:scale-105 inline-flex items-center gap-1.5"
                                    style={{
                                      background: "var(--accent-primary-dim)",
                                      border: "1px solid var(--accent-primary-mid)",
                                      color: "var(--accent-text-light)",
                                    }}
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Browse Achievements Codex</span>
                                  </a>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
                                    Claimed Milestones ({dossier.recentAchievements?.length || 0})
                                  </span>
                                  {isEffectiveSelf && (
                                    <a
                                      href="/settings/achievements"
                                      className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-cyan hover:underline inline-flex items-center gap-1"
                                    >
                                      <span>Open Codex</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {dossier.recentAchievements?.map((ach, idx) => {
                                    const def = ACHIEVEMENTS_CATALOG.find((a) => a.id === ach.achievementId);
                                    const title = def?.title || ach.achievementId.replace(/_/g, " ").toUpperCase();
                                    const category = def?.category || "Milestone";
                                    const rarity = def?.rarity || "Common";
                                    const colors = RARITY_COLORS[rarity] || RARITY_COLORS.Common;

                                    return (
                                      <div
                                        key={idx}
                                        className="system-card p-3.5 rounded-xl bg-bg-panel/80 border border-border-subtle hover:border-border-default transition-all flex items-center gap-3.5"
                                      >
                                        <div
                                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                          style={{
                                            background: `${colors.glow}`,
                                            border: `1px solid color-mix(in srgb, ${colors.main} 25%, transparent)`,
                                          }}
                                        >
                                          <Award className="w-5 h-5" style={{ color: colors.main }} />
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                                              {title}
                                            </span>
                                            <span
                                              className="text-[9px] font-bold font-['Rajdhani'] uppercase tracking-wider px-1.5 py-0.5 rounded"
                                              style={{
                                                color: colors.main,
                                                background: colors.glow,
                                                border: `1px solid color-mix(in srgb, ${colors.main} 19%, transparent)`,
                                              }}
                                            >
                                              {rarity}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[10px] text-text-muted mt-0.5 font-['Rajdhani']">
                                            <span className="truncate">{category}</span>
                                            <span className="font-mono text-[9px]">
                                              {new Date(ach.claimedAt).toLocaleDateString()}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })()}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
