"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import Link from "next/link";

interface ProfileData {
  id: number;
  username: string;
  name?: string | null;
  hunterRank?: string;
  level?: number;
  currentXP?: number;
  streakDays?: number;
  totalStudyMinutes?: number;
  activeAvatar?: string;
  activeTitle?: string;
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

  useEffect(() => {
    // Redirect if viewing own profile
    if (currentUser && currentUser.username.toLowerCase() === (username as string).toLowerCase()) {
      router.replace("/dashboard");
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

        const res = await fetch(`/api/user/${username}`, { headers });
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
    if (!profile || !token) return;
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
    }
  };

  const handleAddFriend = async () => {
    if (!profile || !token) return;
    try {
      await fetch("/api/friends/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: profile.id })
      });
      alert("Friend request sent!");
    } catch (err) {
      console.error("Failed to send request", err);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10"></div>
          <div className="w-48 h-6 bg-white/5 rounded"></div>
          <div className="w-32 h-4 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-8">
        <h1 className="text-4xl font-bold font-rajdhani text-accent-red mb-4">ACCESS DENIED</h1>
        <p className="text-gray-400 mb-8">{error}</p>
        <button onClick={() => router.back()} className="btn-secondary">Return</button>
      </div>
    );
  }

  if (!profile) return null;

  // Determine if the profile is heavily restricted (missing baseline public fields)
  const isHeavilyPrivate = profile.name === undefined && profile.hunterRank === undefined;

  return (
    <div className="p-8 max-w-4xl mx-auto min-h-[calc(100vh-2rem)] flex flex-col">
      <button 
        onClick={() => router.back()} 
        className="text-xs uppercase tracking-widest text-muted hover:text-white transition-colors mb-6 flex items-center gap-2 self-start"
      >
        ← Back
      </button>

      <div className="system-card p-8 md:p-12 relative overflow-hidden">
        {/* Background glow based on rank if available */}
        {profile.hunterRank && (
          <div className={`absolute top-0 right-0 w-64 h-64 opacity-10 rounded-full blur-3xl pointer-events-none rank-${profile.hunterRank}-bg`} style={{ transform: "translate(30%, -30%)" }}></div>
        )}

        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">
          
          {/* Avatar Area */}
          <div className="flex flex-col items-center gap-4">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold ${profile.hunterRank ? `rank-badge rank-${profile.hunterRank}` : 'bg-black/50 border border-white/10 text-white'}`}>
              {profile.activeAvatar && profile.activeAvatar !== 'default' 
                ? <img src={profile.activeAvatar} alt={profile.username} className="w-full h-full rounded-full object-cover" />
                : (profile.name || profile.username).charAt(0).toUpperCase()}
            </div>
            
            {profile.hunterRank && (
              <div className={`px-4 py-1 rounded text-xs font-bold tracking-widest uppercase rank-${profile.hunterRank}`}>
                {profile.hunterRank} RANK
              </div>
            )}
          </div>

          {/* Info Area */}
          <div className="flex-1 text-center md:text-left">
            <div className="mb-6">
              <h1 className="text-3xl font-bold font-rajdhani text-white mb-1">
                {profile.name || `@${profile.username}`}
              </h1>
              <p className="text-muted tracking-wide flex items-center justify-center md:justify-start gap-2">
                @{profile.username}
                {profile.activeTitle && (
                  <>
                    <span>•</span>
                    <span className="text-accent-cyan">{profile.activeTitle}</span>
                  </>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-8">
              {permissions?.canSendMessage && (
                <button onClick={handleMessage} className="btn-primary" style={{ padding: "8px 24px", fontSize: "0.85rem" }}>
                  Message
                </button>
              )}
              {permissions?.canSendFriendRequest && relationship !== "FRIEND" && (
                <button onClick={handleAddFriend} className="btn-secondary" style={{ padding: "8px 24px", fontSize: "0.85rem" }}>
                  Add Friend
                </button>
              )}
              {relationship === "FRIEND" && (
                <span className="px-4 py-2 border border-accent-green/30 text-accent-green bg-accent-green/10 rounded font-rajdhani uppercase tracking-widest text-sm flex items-center gap-2">
                  ✓ Friends
                </span>
              )}
            </div>

            {isHeavilyPrivate ? (
              <div className="p-4 border border-white/10 bg-black/40 rounded text-center md:text-left">
                <p className="text-sm text-gray-400 italic">
                  This scholar has chosen to keep their profile data private.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {profile.level !== undefined && (
                  <div className="bg-black/30 border border-white/5 p-4 rounded text-center">
                    <p className="stat-label">Level</p>
                    <p className="stat-value text-accent-purple">{profile.level}</p>
                  </div>
                )}
                {profile.totalStudyMinutes !== undefined && (
                  <div className="bg-black/30 border border-white/5 p-4 rounded text-center">
                    <p className="stat-label">Study Hrs</p>
                    <p className="stat-value text-accent-cyan">{Math.floor(profile.totalStudyMinutes / 60)}</p>
                  </div>
                )}
                {profile.streakDays !== undefined && (
                  <div className="bg-black/30 border border-white/5 p-4 rounded text-center">
                    <p className="stat-label">Streak</p>
                    <p className="stat-value text-accent-green">{profile.streakDays}</p>
                  </div>
                )}
                {profile.createdAt !== undefined && (
                  <div className="bg-black/30 border border-white/5 p-4 rounded text-center">
                    <p className="stat-label">Joined</p>
                    <p className="stat-value text-white/80 text-lg mt-1">
                      {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
