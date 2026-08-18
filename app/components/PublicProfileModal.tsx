"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthProvider";
import { useProfileModal } from "./ProfileModalContext";
import { getClassInfo, COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { CharacterRenderer } from "./character/CharacterRenderer";
import {
  Edit3,
  MessageSquare,
  Check,
  Clock,
  UserPlus,
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
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string;
  activeAura?: string;
  activeNameColor?: string;
  characterConfig?: any | null;
  socialLinks?: {
    github?: string;
    linkedin?: string;
    discord?: string;
    twitter?: string;
    website?: string;
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
  }>({ canSendFriendRequest: false, canSendMessage: false });
  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ─── Fetch Target Profile Data ─────────────────────────────
  useEffect(() => {
    if (!isOpen || !username) {
      setDossier(null);
      setError(null);
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
      if (e.key === "Escape" && isOpen) {
        closeProfile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeProfile]);

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
      }
    } catch (err) {
      console.error("Failed to initiate conversation", err);
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
      }
    } catch (err) {
      console.error("Failed to send friend request", err);
    } finally {
      setActionLoading(false);
    }
  };

  const classInfo = dossier ? getClassInfo(dossier.activeAvatar) : null;
  const currentTitle =
    COSMETICS_CATALOG.TITLE?.find(
      (t) => t.id === (dossier?.activeTitle || "title_novice")
    )?.value || dossier?.activeTitle || "Novice";

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
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={closeProfile}
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
          />

          {/* Modal Container (Discord x Habitica Hybrid Card - Smooth Bottom-Up Spring) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 70 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 45 }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 340,
              mass: 0.8,
            }}
            className="relative w-full max-w-4xl bg-bg-panel/95 border border-border-subtle shadow-[0_24px_80px_rgba(0,0,0,0.85)] rounded-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
          {/* ─── Expanded Hero Banner & Header Zone (Discord-Style Seamless Bleed) ─── */}
          <div className="relative w-full overflow-hidden border-b border-border-subtle shrink-0">
            {/* Background Banner Image covering full hero region */}
            <div
              className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-700"
              style={{
                backgroundImage: dossier?.bannerUrl
                  ? `url(${dossier.bannerUrl})`
                  : "linear-gradient(135deg, rgba(124, 58, 237, 0.45) 0%, rgba(20, 10, 40, 0.9) 100%)",
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            />

            {/* Atmospheric Dimming Gradient Overlay:
                - Top Zone: Subtle dark tint (rgba(0,0,0,0.15)) for high artwork visibility
                - Middle to Bottom Zone: Progressive dark dimming (via-bg-panel/60 to-bg-panel/95) for maximum contrast behind PFP & Info */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-bg-panel/65 to-bg-panel pointer-events-none" />

            {/* Close Button (top-right) */}
            <button
              type="button"
              onClick={closeProfile}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-text-muted hover:text-text-primary flex items-center justify-center transition-all border border-white/10 backdrop-blur-sm z-30 shadow-lg"
              title="Close (ESC)"
            >
              ✕
            </button>

            {/* Hero Header Content (Avatar, Identity Metadata, Action Buttons) */}
            <div className="relative z-10 px-6 sm:px-8 pt-20 sm:pt-24 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                {/* Left: Avatar & Identity Metadata */}
                <div className="flex items-end gap-4">
                  {/* Elevated Circular PFP with Equipped Aura/Frame */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-bg-panel bg-bg-abyss flex items-center justify-center overflow-hidden shadow-2xl relative ${
                        dossier?.activeAura && dossier.activeAura !== "none"
                          ? "shadow-[0_0_25px_var(--accent-primary)] ring-2 ring-accent-primary"
                          : "ring-1 ring-border-subtle"
                      }`}
                    >
                      {dossier?.avatarUrl ? (
                        <img
                          src={dossier.avatarUrl}
                          alt={dossier.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl select-none">
                          {classInfo?.fallbackIcon || "📖"}
                        </span>
                      )}
                    </div>

                    {/* Online Beacon */}
                    <span className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-bg-panel shadow-sm" />
                  </div>

                  {/* Name, Handle, Class & Rank Badges */}
                  <div className="mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] text-text-primary drop-shadow-md">
                        {dossier?.name || dossier?.username || "Scholar"}
                      </h2>
                      <span className="text-xs text-text-muted font-mono font-medium">
                        @{dossier?.username}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid shadow-sm">
                        {classInfo?.name || "Scholar"}
                      </span>
                      <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm">
                        Rank {dossier?.hunterRank || "E"}
                      </span>
                      <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded bg-bg-abyss/80 text-text-secondary border border-border-subtle shadow-sm">
                        {currentTitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Primary Action Buttons */}
                <div className="flex items-center gap-2.5 pb-1">
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
                          className="px-4 py-2 rounded-xl bg-bg-abyss/90 hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle hover:border-accent-primary transition-all flex items-center gap-2 shadow-sm"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Message</span>
                        </button>
                      )}

                      {relationship === "FRIEND" ? (
                        <span className="px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Friends</span>
                        </span>
                      ) : relationship === "PENDING_SENT" ? (
                        <span className="px-3.5 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Request Sent</span>
                        </span>
                      ) : permissions.canSendFriendRequest ? (
                        <button
                          type="button"
                          onClick={handleAddFriend}
                          disabled={actionLoading}
                          className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
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
                      ) : null}
                    </>
                  )}
                </div>
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
                    This scholar has set their profile visibility to private. Full stats, custom builds, and records are restricted to confirmed connections.
                  </p>
                  {permissions.canSendFriendRequest && (
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
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`px-4 py-1.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 ${
                            activeTab === tab.id
                              ? "bg-accent-primary text-white shadow-sm"
                              : "bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* ─── TAB 1: OVERVIEW ──────────────────────────────── */}
                    {activeTab === "OVERVIEW" && (
                      <motion.div
                        key="overview"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-5"
                      >
                        {/* Bio / Scholar Statement */}
                        <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle">
                          <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted mb-2">
                            Scholar Thesis & Bio
                          </h4>
                          <p className="text-sm text-text-primary font-['Rajdhani'] leading-relaxed whitespace-pre-line">
                            {dossier.bio ||
                              "No scholar statement recorded. This hunter lets their study discipline speak for itself."}
                          </p>
                        </div>

                        {/* Connected Social Networks */}
                        <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle">
                          <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted mb-3">
                            Connected Networks & Guilds
                          </h4>

                          {dossier.socialLinks &&
                          Object.values(dossier.socialLinks).some((v) => Boolean(v)) ? (
                            <div className="flex flex-wrap gap-2.5">
                              {dossier.socialLinks.github && (
                                <a
                                  href={
                                    dossier.socialLinks.github.startsWith("http")
                                      ? dossier.socialLinks.github
                                      : `https://github.com/${dossier.socialLinks.github}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 transition-all"
                                >
                                  <Code2 className="w-3.5 h-3.5 text-accent-primary" /> GitHub
                                </a>
                              )}
                              {dossier.socialLinks.linkedin && (
                                <a
                                  href={
                                    dossier.socialLinks.linkedin.startsWith("http")
                                      ? dossier.socialLinks.linkedin
                                      : `https://linkedin.com/in/${dossier.socialLinks.linkedin}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 transition-all"
                                >
                                  <Briefcase className="w-3.5 h-3.5 text-accent-primary" /> LinkedIn
                                </a>
                              )}
                              {dossier.socialLinks.discord && (
                                <span className="px-3 py-1.5 rounded-xl bg-bg-abyss border border-border-subtle text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5">
                                  <MessageCircle className="w-3.5 h-3.5 text-accent-primary" /> {dossier.socialLinks.discord}
                                </span>
                              )}
                              {dossier.socialLinks.twitter && (
                                <a
                                  href={
                                    dossier.socialLinks.twitter.startsWith("http")
                                      ? dossier.socialLinks.twitter
                                      : `https://twitter.com/${dossier.socialLinks.twitter}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 transition-all"
                                >
                                  <Globe className="w-3.5 h-3.5 text-accent-primary" /> X / Twitter
                                </a>
                              )}
                              {dossier.socialLinks.website && (
                                <a
                                  href={dossier.socialLinks.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 transition-all"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-accent-primary" /> Portfolio
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-text-muted font-['Rajdhani'] italic">
                              No external scholar networks linked.
                            </p>
                          )}
                        </div>

                        {/* Hunter Metadata */}
                        <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-['Rajdhani']">
                          <div>
                            <span className="text-text-muted block text-[10px] uppercase">
                              Registry Date
                            </span>
                            <span className="text-text-primary font-bold">
                              {dossier.createdAt
                                ? new Date(dossier.createdAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "Classified"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block text-[10px] uppercase">
                              Quests Cleared
                            </span>
                            <span className="text-text-primary font-bold">
                              {dossier.completedQuestsCount !== undefined
                                ? `${dossier.completedQuestsCount} Quests`
                                : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block text-[10px] uppercase">
                              Last Active
                            </span>
                            <span className="text-text-primary font-bold">
                              {dossier.lastActiveDate || "Classified"}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ─── TAB 2: COGNITIVE STATS MATRIX ────────────────── */}
                    {activeTab === "STATS" && (
                      dossier.stats ? (
                        <motion.div
                          key="stats"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle flex flex-col gap-4">
                            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                              <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                                Academic Cognitive Matrix
                              </h4>
                              <span className="text-[10px] font-['Rajdhani'] text-text-muted">
                                Baseline: 100 Max
                              </span>
                            </div>

                            {/* 5-Attribute Matrix */}
                            <div className="flex flex-col gap-3.5">
                              {/* Endurance */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-bold mb-1">
                                  <span className="text-text-primary flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5 text-cyan-400" /> Endurance (END)
                                  </span>
                                  <span className="text-accent-text-light">
                                    {dossier.stats.endurance} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    style={{ width: `${Math.min(100, dossier.stats.endurance)}%` }}
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted font-['Rajdhani'] block mt-0.5">
                                  Unbroken focus block duration (&gt;60m deep sessions)
                                </span>
                              </div>

                              {/* Tenacity */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-bold mb-1">
                                  <span className="text-text-primary flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5 text-emerald-400" /> Tenacity (TEN)
                                  </span>
                                  <span className="text-accent-text-light">
                                    {dossier.stats.tenacity} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    style={{ width: `${Math.min(100, dossier.stats.tenacity)}%` }}
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted font-['Rajdhani'] block mt-0.5">
                                  Weekly streak stability and long-term retention
                                </span>
                              </div>

                              {/* Velocity */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-bold mb-1">
                                  <span className="text-text-primary flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-amber-400" /> Velocity (VEL)
                                  </span>
                                  <span className="text-accent-text-light">
                                    {dossier.stats.velocity} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    style={{ width: `${Math.min(100, dossier.stats.velocity)}%` }}
                                    className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted font-['Rajdhani'] block mt-0.5">
                                  Daily quest and milestone completion throughput
                                </span>
                              </div>

                              {/* Synthesis */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-bold mb-1">
                                  <span className="text-text-primary flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5 text-purple-400" /> Synthesis (SYN)
                                  </span>
                                  <span className="text-accent-text-light">
                                    {dossier.stats.synthesis} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    style={{ width: `${Math.min(100, dossier.stats.synthesis)}%` }}
                                    className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted font-['Rajdhani'] block mt-0.5">
                                  Analytical, problem sets, and STEM deep work
                                </span>
                              </div>

                              {/* Discipline */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-['Rajdhani'] font-bold mb-1">
                                  <span className="text-text-primary flex items-center gap-1.5">
                                    <Target className="w-3.5 h-3.5 text-rose-400" /> Discipline (DIS)
                                  </span>
                                  <span className="text-accent-text-light">
                                    {dossier.stats.discipline} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-bg-abyss rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    style={{ width: `${Math.min(100, dossier.stats.discipline)}%` }}
                                    className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted font-['Rajdhani'] block mt-0.5">
                                  Punctuality, early start habits, and low pause frequencies
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="stats-restricted"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center"
                        >
                          <Lock className="w-8 h-8 text-text-muted mb-2" />
                          <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                            Cognitive Diagnostics Classified
                          </h4>
                          <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                            This scholar has restricted access to their cognitive performance matrix.
                          </p>
                        </motion.div>
                      )
                    )}

                    {/* ─── TAB 3: ACHIEVEMENTS ──────────────────────────── */}
                    {activeTab === "ACHIEVEMENTS" && (
                      dossier.recentAchievements ? (
                        <motion.div
                          key="achievements"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-4"
                        >
                          <div className="system-card p-5 rounded-xl bg-bg-panel/80 border border-border-subtle">
                            <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted mb-3">
                              Earned Scholar Badges & Milestones
                            </h4>

                            {dossier.recentAchievements.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {dossier.recentAchievements.map((ach, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-xl bg-bg-abyss/80 border border-border-subtle flex items-center gap-3"
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center shrink-0">
                                      <Award className="w-5 h-5 text-accent-text-light" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                                        {ach.achievementId.replace(/_/g, " ").toUpperCase()}
                                      </h5>
                                      <span className="text-[10px] text-text-muted font-['Rajdhani']">
                                        Claimed on{" "}
                                        {new Date(ach.claimedAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-text-muted font-['Rajdhani']">
                                No public achievements recorded yet.
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="achievements-restricted"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 text-center bg-bg-panel/80 border border-border-subtle rounded-xl flex flex-col items-center justify-center"
                        >
                          <Lock className="w-8 h-8 text-text-muted mb-2" />
                          <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                            Achievement Archives Restricted
                          </h4>
                          <p className="text-xs text-text-muted font-['Rajdhani'] mt-1 max-w-sm">
                            This scholar has chosen to keep their earned milestones and titles private.
                          </p>
                        </motion.div>
                      )
                    )}
                  </div>
                </div>
              )
            ) : null}
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
