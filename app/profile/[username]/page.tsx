"use client";

import { getClassInfo, COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import Link from "next/link";
import { Lock } from "lucide-react";

interface ProfileData {
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

interface Permissions {
  canSendFriendRequest: boolean;
  canSendMessage: boolean;
}

export default function PublicProfilePage() {
  const { username } = useParams();
  const { user: currentUser, token, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [relationship, setRelationship] = useState<string>("");
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Redirect if viewing own profile
    if (currentUser && currentUser.username.toLowerCase() === (username as string).toLowerCase()) {
      router.replace("/locker?tab=identity");
      return;
    }

    if (authLoading) return; // Wait for auth to settle

    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/profile/${username}`, { headers });
        if (!res.ok) {
          if (res.status === 404) setError("Scholar not found in the system.");
          else setError("An error occurred while accessing system records.");
          return;
        }

        const data = await res.json();
        setProfile(data.profile);
        setRelationship(data.relationship);
        setPermissions(data.permissions);
      } catch (err) {
        setError("Network error. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [username, currentUser, token, authLoading, router]);

  const handleMessage = async () => {
    if (!profile || !token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ participantIds: [profile.id] })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to start conversation", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!profile || !token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: profile.id })
      });
      if (res.ok) {
        setRelationship("PENDING_SENT");
        setPermissions(prev => prev ? { ...prev, canSendFriendRequest: false } : null);
      }
    } catch (err) {
      console.error("Failed to send friend request", err);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted font-['Rajdhani']">Accessing Scholar Dossier...</p>
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
  const currentTitle = COSMETICS_CATALOG.TITLE?.find(t => t.id === (profile.activeTitle || "title_novice"))?.value || profile.activeTitle || "Novice";
  const totalStudyHours = profile.totalStudyMinutes !== undefined ? Math.floor(profile.totalStudyMinutes / 60) : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      {/* Back button */}
      <div className="mb-4">
        <button 
          onClick={() => router.back()}
          className="text-xs uppercase tracking-widest font-bold text-text-muted hover:text-text-primary transition-colors flex items-center gap-1 font-['Rajdhani']"
        >
          ← Back
        </button>
      </div>

      <div className="system-card overflow-hidden bg-bg-panel/90 border border-border-subtle shadow-2xl rounded-2xl">
        {/* Banner */}
        <div 
          className="h-36 sm:h-48 w-full bg-cover bg-center relative"
          style={{
            background: profile.bannerUrl
              ? `url(${profile.bannerUrl}) center/cover no-repeat`
              : "linear-gradient(135deg, rgba(124, 58, 237, 0.45) 0%, rgba(20, 10, 40, 0.9) 100%)",
          }}
        >
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
                  <span className="text-4xl select-none">{classInfo?.fallbackIcon || "📖"}</span>
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
            <div className="flex items-center gap-3">
              {permissions?.canSendMessage && (
                <button
                  onClick={handleMessage}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle hover:border-accent-primary transition-all"
                >
                  Message
                </button>
              )}

              {relationship === "FRIEND" ? (
                <span className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider">
                  ✓ Friends
                </span>
              ) : relationship === "PENDING_SENT" ? (
                <span className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider">
                  ⏳ Request Sent
                </span>
              ) : permissions?.canSendFriendRequest ? (
                <button
                  onClick={handleAddFriend}
                  disabled={actionLoading}
                  className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                    color: "var(--text-primary)",
                    border: "none",
                  }}
                >
                  + Add Friend
                </button>
              ) : null}
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
              <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed">
                This scholar has restricted public access to their study metrics, cognitive diagnostics, and activity logs.
              </p>
            </div>
          ) : (
            /* Bio & Stats Grid */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <div className="md:col-span-2 space-y-4">
                <div className="p-4 rounded-xl bg-bg-abyss/60 border border-border-subtle">
                  <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted mb-2">
                    Scholar Bio
                  </h3>
                  <p className="text-sm text-text-primary font-['Rajdhani'] whitespace-pre-line leading-relaxed">
                    {profile.bio || "No statement recorded."}
                  </p>
                </div>

                {/* Cognitive Stats */}
                {profile.stats ? (
                  <div className="p-4 rounded-xl bg-bg-abyss/60 border border-border-subtle space-y-3">
                    <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                      Academic Cognitive Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs font-['Rajdhani']">
                      <div className="flex justify-between border-b border-border-subtle/50 pb-1">
                        <span className="text-text-muted">Endurance (END)</span>
                        <span className="font-bold text-text-primary">{profile.stats.endurance}/100</span>
                      </div>
                      <div className="flex justify-between border-b border-border-subtle/50 pb-1">
                        <span className="text-text-muted">Tenacity (TEN)</span>
                        <span className="font-bold text-text-primary">{profile.stats.tenacity}/100</span>
                      </div>
                      <div className="flex justify-between border-b border-border-subtle/50 pb-1">
                        <span className="text-text-muted">Velocity (VEL)</span>
                        <span className="font-bold text-text-primary">{profile.stats.velocity}/100</span>
                      </div>
                      <div className="flex justify-between border-b border-border-subtle/50 pb-1">
                        <span className="text-text-muted">Synthesis (SYN)</span>
                        <span className="font-bold text-text-primary">{profile.stats.synthesis}/100</span>
                      </div>
                      <div className="flex justify-between border-b border-border-subtle/50 pb-1">
                        <span className="text-text-muted">Discipline (DIS)</span>
                        <span className="font-bold text-text-primary">{profile.stats.discipline}/100</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-bg-abyss/60 border border-border-subtle text-center flex flex-col items-center">
                    <Lock className="w-5 h-5 text-text-muted mb-1" />
                    <span className="text-xs font-bold font-['Rajdhani'] text-text-muted uppercase">Cognitive Stats Classified</span>
                  </div>
                )}
              </div>

              {/* Quick Metrics */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-bg-abyss/60 border border-border-subtle">
                  <span className="text-[10px] uppercase font-['Rajdhani'] text-text-muted block">Level & XP</span>
                  <span className="text-lg font-bold font-['Rajdhani'] text-text-primary block">
                    {profile.level !== undefined ? `Level ${profile.level}` : "Classified"}
                  </span>
                  <span className="text-xs text-text-secondary font-['Rajdhani']">
                    {profile.currentXP !== undefined ? `${profile.currentXP} XP` : "—"}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-bg-abyss/60 border border-border-subtle">
                  <span className="text-[10px] uppercase font-['Rajdhani'] text-text-muted block">Study Hours</span>
                  <span className="text-lg font-bold font-['Rajdhani'] text-text-primary block">
                    {profile.totalStudyMinutes !== undefined ? `${totalStudyHours}h` : "—"}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-bg-abyss/60 border border-border-subtle">
                  <span className="text-[10px] uppercase font-['Rajdhani'] text-text-muted block">Streak</span>
                  <span className="text-lg font-bold font-['Rajdhani'] text-amber-400 block">
                    🔥 {profile.streakDays !== undefined ? `${profile.streakDays} Days` : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
