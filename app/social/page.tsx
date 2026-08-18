"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../components/AuthProvider";
import { useProfileModal } from "../components/ProfileModalContext";
import { AddFriendModal } from "../components/AddFriendModal";
import { CharacterRenderer } from "../components/character/CharacterRenderer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Flame,
  MessageSquare,
  UserPlus,
  Search,
  Check,
  X,
  Sparkles,
  Play,
  ArrowUpDown,
  Shield,
  MessageCircle,
} from "lucide-react";

type Tab = "friends" | "requests" | "messages" | "groups";

interface Friend {
  friendshipId: number;
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level: number;
  totalStudyMinutes: number;
  totalStudySeconds: number;
  todayMinutes: number;
  todaySeconds: number;
  isOnline: boolean;
  isStudying: boolean;
  activeSessionStartedAt: string | null;
  avatarUrl: string | null;
  activeAvatar: string;
  activeFrame: string;
  activeTitle: string;
  activeAura: string;
  characterConfig: any | null;
  lastSeenAt: string | null;
}

interface FriendRequest {
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

interface Conversation {
  id: number;
  name: string;
  isGroup: boolean;
  hasUnread: boolean;
  participants: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
    isOnline: boolean;
  }[];
  lastMessage: {
    content: string;
    senderName: string;
    senderId: number;
    createdAt: string;
  } | null;
  updatedAt: string;
}

function formatHHMMSS(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function SocialPage() {
  const { user, token, isLoading } = useAuth();
  const { openProfile } = useProfileModal();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Data states
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Live second ticker for active sessions
  const [tick, setTick] = useState(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "STUDYING" | "ONLINE">("ALL");
  const [sortBy, setSortBy] = useState<"STUDY_TIME" | "ACTIVE" | "LEVEL" | "NAME">("STUDY_TIME");

  // Group creation states
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<number[]>([]);

  // ─── Data Fetching & Polling ─────────────────────────────
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const [friendsRes, requestsRes, convosRes] = await Promise.all([
          fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/friends/requests", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (friendsRes.ok) {
          const data = await friendsRes.json();
          setFriends(Array.isArray(data) ? data : []);
        }
        if (requestsRes.ok) {
          const data = await requestsRes.json();
          setRequests(Array.isArray(data) ? data : []);
        }
        if (convosRes.ok) {
          const data = await convosRes.json();
          setConversations(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch social data", err);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();

    // Polling every 12 seconds
    const interval = setInterval(fetchData, 12000);
    return () => clearInterval(interval);
  }, [token]);

  // ─── Live Second Clock Ticker ─────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 1000000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Action Handlers ─────────────────────────────────────
  const handleRequestAction = async (requestId: number, action: "ACCEPT" | "REJECT") => {
    setActionLoadingId(requestId);
    try {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((req) => req.id !== requestId));
        if (action === "ACCEPT") {
          const friendsRes = await fetch("/api/friends", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (friendsRes.ok) setFriends(await friendsRes.json());
        }
      }
    } catch (err) {
      console.error("Action failed", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMessageFriend = async (friendId: number) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantIds: [friendId] }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to start conversation", err);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedFriends.length === 0) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantIds: selectedFriends,
          name: groupName.trim(),
          isGroup: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateGroup(false);
        setGroupName("");
        setSelectedFriends([]);
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to create group", err);
    }
  };

  // ─── Filtered & Sorted Friends Roster ────────────────────
  const studyingFriendsCount = useMemo(
    () => friends.filter((f) => f.isStudying).length,
    [friends]
  );
  const onlineFriendsCount = useMemo(
    () => friends.filter((f) => f.isOnline).length,
    [friends]
  );

  const filteredFriends = useMemo(() => {
    let list = [...friends];

    // Status filter
    if (statusFilter === "STUDYING") {
      list = list.filter((f) => f.isStudying);
    } else if (statusFilter === "ONLINE") {
      list = list.filter((f) => f.isOnline);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.username.toLowerCase().includes(q) ||
          (f.name && f.name.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "STUDY_TIME") {
        if (a.isStudying && !b.isStudying) return -1;
        if (!a.isStudying && b.isStudying) return 1;
        return b.todaySeconds - a.todaySeconds;
      }
      if (sortBy === "ACTIVE") {
        if (a.isStudying && !b.isStudying) return -1;
        if (!a.isStudying && b.isStudying) return 1;
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return (a.name || a.username).localeCompare(b.name || b.username);
      }
      if (sortBy === "LEVEL") {
        return b.level - a.level;
      }
      if (sortBy === "NAME") {
        return (a.name || a.username).localeCompare(b.name || b.username);
      }
      return 0;
    });

    return list;
  }, [friends, statusFilter, searchQuery, sortBy]);

  // Current user's daily study estimate
  const userTodaySeconds = useMemo(() => {
    return (user?.totalStudyMinutes || 0) * 60;
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center font-['Rajdhani']">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm uppercase tracking-widest text-text-muted">
            Loading Social...
          </p>
        </div>
      </div>
    );
  }

  const dms = conversations.filter((c) => !c.isGroup);
  const groups = conversations.filter((c) => c.isGroup);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-6">
      {/* ─── Top Header & Title ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1
          className="text-3xl sm:text-4xl font-bold uppercase tracking-wider text-text-primary drop-shadow-sm"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          Social
        </h1>

        <button
          type="button"
          onClick={() => setShowAddFriend(true)}
          className="btn-primary text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-wider py-2 px-4 rounded-xl flex items-center gap-2 shadow-md transition-all"
          style={{
            background:
              "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
            border: "none",
            color: "var(--text-primary)",
          }}
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Friend</span>
        </button>
      </div>

      {/* ─── User Profile & Today's Focus Banner (Clean & Non-overlapping) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-bg-panel/90 border border-border-subtle p-5 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-primary-dim/20 via-transparent to-cyan-500/10 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: User Character & Identity */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl border border-border-subtle bg-bg-abyss flex items-center justify-center overflow-hidden shadow-md">
                {user?.characterConfig ? (
                  <CharacterRenderer
                    config={user.characterConfig}
                    seed={user.username}
                    size={72}
                    showPedestal={false}
                    showAura={false}
                  />
                ) : user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl">📖</span>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-bg-panel shadow-sm" />
            </div>

            <div className="flex flex-col">
              {/* Badges row with zero collision */}
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-accent-primary-dim/30 border border-accent-primary-mid/40 text-[10px] font-bold font-mono text-accent-text-light">
                  Rank {user?.hunterRank || "E"}
                </span>
                <span className="text-xs font-mono font-bold text-text-muted">
                  Lv. {user?.level || 1}
                </span>
              </div>

              {/* User display name & handle */}
              <h2 className="text-xl font-bold font-['Rajdhani'] text-text-primary leading-tight">
                {user?.name || user?.username || "User"}
              </h2>
              <span className="text-xs font-mono text-text-muted">
                @{user?.username}
              </span>
            </div>
          </div>

          {/* Center: Live Today Focus Time */}
          <div className="flex items-center justify-center bg-bg-abyss/80 border border-border-subtle px-8 py-3.5 rounded-xl">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold font-['Rajdhani'] tracking-widest text-text-muted block">
                Today&apos;s Study Time
              </span>
              <div className="flex items-baseline justify-center gap-3 mt-0.5">
                <span className="text-3xl sm:text-4xl font-mono font-bold text-accent-text-light drop-shadow-[0_0_12px_var(--accent-primary)]">
                  {formatHHMMSS(userTodaySeconds)}
                </span>
                <span className="text-xs font-bold font-['Rajdhani'] text-emerald-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  {user?.streakDays || 0}d Streak
                </span>
              </div>
            </div>
          </div>

          {/* Right: Roster Statistics & Quick Timer Launch */}
          <div className="flex items-center justify-between md:justify-end gap-5">
            <div className="text-left md:text-right">
              <span className="text-[10px] uppercase font-bold font-['Rajdhani'] tracking-wider text-text-muted block">
                Friends Status
              </span>
              <div className="flex items-center md:justify-end gap-3 mt-1 text-xs font-['Rajdhani'] font-bold">
                <span className="text-text-primary flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-accent-primary" />
                  {friends.length} Friends
                </span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {studyingFriendsCount} Studying
                </span>
              </div>
            </div>

            <Link
              href="/timer"
              className="px-4 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Timer</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Main Tabs Navigation ─────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-1">
        <div className="flex gap-2 sm:gap-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("friends")}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm uppercase tracking-wider font-['Rajdhani'] font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "friends"
                ? "text-text-primary border-accent-primary"
                : "text-text-muted hover:text-text-primary border-transparent"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Friends</span>
            {studyingFriendsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                {studyingFriendsCount} Studying
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm uppercase tracking-wider font-['Rajdhani'] font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "requests"
                ? "text-text-primary border-accent-primary"
                : "text-text-muted hover:text-text-primary border-transparent"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Requests</span>
            {requests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-mono font-bold animate-pulse">
                {requests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("messages")}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm uppercase tracking-wider font-['Rajdhani'] font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "messages"
                ? "text-text-primary border-accent-primary"
                : "text-text-muted hover:text-text-primary border-transparent"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Messages</span>
            {dms.some((c) => c.hasUnread) && (
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm uppercase tracking-wider font-['Rajdhani'] font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "groups"
                ? "text-text-primary border-accent-primary"
                : "text-text-muted hover:text-text-primary border-transparent"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Groups</span>
            {groups.some((c) => c.hasUnread) && (
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
            )}
          </button>
        </div>

        {activeTab === "groups" && (
          <button
            type="button"
            onClick={() => setShowCreateGroup(true)}
            className="btn-primary text-xs py-1.5 px-3 rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
              border: "none",
              color: "var(--text-primary)",
            }}
          >
            + Create Group
          </button>
        )}
      </div>

      {/* ─── TAB 1: FRIENDS (YPT 2-3 COLUMN GRID) ─────────────── */}
      {activeTab === "friends" && (
        <div className="flex flex-col gap-6">
          {/* Controls: Search, Quick Chips & Sorting */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-bg-panel/60 p-4 rounded-xl border border-border-subtle">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field w-full text-xs font-['Rajdhani']"
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Quick Filter Chips */}
              <div className="flex items-center gap-1.5 bg-bg-abyss/80 p-1 rounded-xl border border-border-subtle text-xs font-['Rajdhani'] font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    statusFilter === "ALL"
                      ? "bg-accent-primary text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  All ({friends.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("STUDYING")}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    statusFilter === "STUDYING"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-300"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Studying ({studyingFriendsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("ONLINE")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    statusFilter === "ONLINE"
                      ? "bg-cyan-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Online ({onlineFriendsCount})
                </button>
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 bg-bg-abyss/80 px-3 py-1.5 rounded-xl border border-border-subtle text-xs font-['Rajdhani'] font-bold text-text-muted">
                <ArrowUpDown className="w-3.5 h-3.5 text-accent-primary" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-text-primary font-bold focus:outline-none cursor-pointer"
                >
                  <option value="STUDY_TIME" className="bg-bg-panel text-text-primary">
                    Study Time
                  </option>
                  <option value="ACTIVE" className="bg-bg-panel text-text-primary">
                    Active Status
                  </option>
                  <option value="LEVEL" className="bg-bg-panel text-text-primary">
                    Level
                  </option>
                  <option value="NAME" className="bg-bg-panel text-text-primary">
                    Name (A-Z)
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Friends Spacious YPT Card Grid (2-3 Columns) */}
          {isLoadingData && friends.length === 0 ? (
            <div className="py-24 text-center text-text-muted font-['Rajdhani'] font-bold animate-pulse">
              Loading Friends...
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="system-card p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-4 text-3xl">
                👥
              </div>
              <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider">
                {searchQuery || statusFilter !== "ALL"
                  ? "No Matching Friends Found"
                  : "No friends added yet"}
              </h3>
              {!(searchQuery || statusFilter !== "ALL") && (
                <>
                  <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed my-4">
                    Add friends to view their daily study time and character builds.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddFriend(true)}
                    className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                      border: "none",
                      color: "var(--text-primary)",
                    }}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Friend</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFriends.map((friend) => {
                // Calculate live dynamic seconds if studying
                let liveSeconds = friend.todaySeconds;
                if (friend.isStudying && friend.activeSessionStartedAt) {
                  const started = new Date(friend.activeSessionStartedAt).getTime();
                  const elapsed = Math.floor((Date.now() - started) / 1000);
                  if (elapsed > 0) {
                    liveSeconds = friend.todaySeconds + (elapsed % 60);
                  }
                }

                return (
                  <motion.div
                    key={friend.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`relative rounded-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden group shadow-lg p-5 ${
                      friend.isStudying
                        ? "bg-bg-panel border-cyan-500/40 shadow-[0_0_24px_rgba(6,182,212,0.15)] hover:border-cyan-400"
                        : friend.isOnline
                        ? "bg-bg-panel/90 border-border-subtle hover:border-accent-primary/60"
                        : "bg-bg-panel/60 border-border-subtle/60 opacity-90 hover:opacity-100"
                    }`}
                  >
                    {/* Atmospheric Ambient Glow when Studying */}
                    {friend.isStudying && (
                      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
                    )}

                    {/* Top Status Header */}
                    <div className="flex items-center justify-between z-10 mb-2">
                      {friend.isStudying ? (
                        <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          <span>● Studying</span>
                        </span>
                      ) : friend.isOnline ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Online</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-['Rajdhani'] uppercase font-bold text-text-muted">
                          Offline
                        </span>
                      )}

                      {/* Rank & Level Badges */}
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-accent-primary-dim/30 border border-accent-primary-mid/40 text-[10px] font-bold font-mono text-accent-text-light">
                          Rank {friend.hunterRank}
                        </span>
                        <span className="text-xs font-mono font-bold text-text-muted">
                          Lv. {friend.level}
                        </span>
                      </div>
                    </div>

                    {/* Character Stage (Large 135px Showcase) */}
                    <div
                      onClick={() => openProfile(friend.username)}
                      className="relative min-h-[170px] flex flex-col items-center justify-center cursor-pointer group-hover:scale-105 transition-transform duration-300 py-3 z-10"
                    >
                      <CharacterRenderer
                        config={friend.characterConfig}
                        seed={friend.username}
                        size={135}
                        showPedestal={true}
                        showAura={friend.isStudying || friend.activeAura !== "none"}
                      />

                      {/* Name & Handle */}
                      <div className="text-center mt-3 w-full px-2">
                        <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary truncate hover:text-accent-text-light transition-colors">
                          {friend.name || friend.username}
                        </h3>
                        <p className="text-xs font-mono text-text-muted truncate">
                          @{friend.username}
                        </p>
                      </div>
                    </div>

                    {/* YPT-Inspired Digital Study Timer Box */}
                    <div className="z-10 flex flex-col gap-3 mt-2">
                      <div
                        className={`p-3.5 rounded-xl text-center border transition-all ${
                          friend.isStudying
                            ? "bg-bg-abyss/95 border-cyan-500/40 shadow-[inset_0_0_15px_rgba(6,182,212,0.12)]"
                            : "bg-bg-abyss/70 border-border-subtle"
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold font-['Rajdhani'] tracking-widest text-text-muted block">
                          Today&apos;s Study Time
                        </span>
                        <span
                          className={`text-2xl font-mono font-bold tracking-tight block mt-0.5 ${
                            friend.isStudying
                              ? "text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                              : liveSeconds > 0
                              ? "text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          {formatHHMMSS(liveSeconds)}
                        </span>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => openProfile(friend.username)}
                          className="px-3 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-accent-primary" />
                          <span>View Profile</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMessageFriend(friend.id)}
                          className="px-3 py-2 rounded-xl bg-accent-primary-dim/30 hover:bg-accent-primary-dim border border-accent-primary-mid/40 hover:border-accent-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-accent-text-light transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-accent-primary" />
                          <span>Message</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: DEDICATED FRIEND REQUESTS HUB ─────────────── */}
      {activeTab === "requests" && (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div>
              <h2 className="text-xl font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                Friend Requests
              </h2>
              <p className="text-xs text-text-muted font-['Rajdhani']">
                Manage incoming invitations to connect.
              </p>
            </div>

            <span className="px-3 py-1 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid text-xs font-mono font-bold">
              {requests.length} Pending
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="system-card p-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-4 text-3xl">
                ✉️
              </div>
              <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider mb-1">
                No Pending Requests
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani']">
                You&apos;re all caught up!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <motion.div
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="system-card p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-border-subtle bg-bg-panel hover:border-accent-primary/50 transition-all shadow-md"
                >
                  <div className="flex items-center gap-4">
                    {/* Sender Avatar / Character */}
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-center overflow-hidden">
                        {req.sender.characterConfig ? (
                          <CharacterRenderer
                            config={req.sender.characterConfig}
                            seed={req.sender.username}
                            size={52}
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
                          <span className="text-xl">📖</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-accent-primary-dim/30 text-[9px] font-mono font-bold text-accent-text-light border border-accent-primary-mid/30">
                          Rank {req.sender.hunterRank}
                        </span>
                        <span className="text-xs font-mono text-text-muted">
                          Lv. {req.sender.level}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openProfile(req.sender.username)}
                        className="text-base font-bold font-['Rajdhani'] text-text-primary hover:text-accent-text-light transition-colors text-left block"
                      >
                        {req.sender.name || req.sender.username}
                      </button>
                      <p className="text-xs text-text-muted font-mono">
                        @{req.sender.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => openProfile(req.sender.username)}
                      className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary border border-border-subtle transition-all"
                    >
                      View Profile
                    </button>

                    <button
                      type="button"
                      disabled={actionLoadingId === req.id}
                      onClick={() => handleRequestAction(req.id, "ACCEPT")}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>

                    <button
                      type="button"
                      disabled={actionLoadingId === req.id}
                      onClick={() => handleRequestAction(req.id, "REJECT")}
                      className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: DIRECT MESSAGES ──────────────────────────── */}
      {activeTab === "messages" && (
        <div className="system-card p-6 min-h-[450px]">
          <div className="flex items-center justify-between mb-4 border-b border-border-subtle pb-3">
            <h2 className="text-lg font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
              Messages
            </h2>
            <span className="text-xs text-text-muted font-mono">
              {dms.length} Conversations
            </span>
          </div>

          {dms.length === 0 ? (
            <div className="text-center py-16">
              <MessageCircle className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm font-['Rajdhani'] text-text-muted mb-2">
                No messages yet.
              </p>
              <p className="text-xs text-text-muted">
                Open a friend&apos;s card and click Message to start a conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dms.map((dm) => (
                <Link
                  href={`/social/chat/${dm.id}`}
                  key={dm.id}
                  className="block group"
                >
                  <div className="flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.04] transition-all bg-bg-panel border border-border-subtle group-hover:border-accent-primary/50 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light font-bold uppercase font-['Rajdhani'] text-lg">
                        {dm.name.charAt(0)}
                      </div>
                      <div>
                        <p
                          className={`font-bold font-['Rajdhani'] text-base ${
                            dm.hasUnread
                              ? "text-text-primary"
                              : "text-text-secondary"
                          }`}
                        >
                          {dm.name}
                        </p>
                        <p
                          className={`text-xs max-w-md truncate ${
                            dm.hasUnread
                              ? "text-accent-primary font-bold"
                              : "text-text-muted"
                          }`}
                        >
                          {dm.lastMessage
                            ? `${dm.lastMessage.senderName}: ${dm.lastMessage.content}`
                            : "No messages yet"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {dm.lastMessage && (
                        <p className="text-[10px] text-text-muted font-mono mb-1">
                          {new Date(dm.lastMessage.createdAt).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                        </p>
                      )}
                      {dm.hasUnread && (
                        <span className="inline-block w-2.5 h-2.5 bg-accent-primary rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: STUDY GROUPS ─────────────────────────────── */}
      {activeTab === "groups" && (
        <div className="system-card p-6 min-h-[450px]">
          <div className="flex items-center justify-between mb-4 border-b border-border-subtle pb-3">
            <h2 className="text-lg font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
              Study Groups
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateGroup(true)}
              className="btn-secondary text-xs px-3 py-1.5 rounded-lg"
            >
              + Create Group
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-16">
              <Shield className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm font-['Rajdhani'] text-text-muted mb-4">
                No study groups joined yet.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="btn-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-4 py-2 rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                  border: "none",
                  color: "var(--text-primary)",
                }}
              >
                Create Study Group
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {groups.map((group) => (
                <Link
                  href={`/social/chat/${group.id}`}
                  key={group.id}
                  className="block group"
                >
                  <div className="flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.04] transition-all bg-bg-panel border border-border-subtle group-hover:border-accent-primary/50 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold uppercase font-['Rajdhani'] text-lg">
                        {group.name.charAt(0)}
                      </div>
                      <div>
                        <p
                          className={`font-bold font-['Rajdhani'] text-base ${
                            group.hasUnread
                              ? "text-text-primary"
                              : "text-text-secondary"
                          }`}
                        >
                          {group.name}{" "}
                          <span className="text-xs text-text-muted font-normal ml-2 font-mono">
                            {group.participants.length} Members
                          </span>
                        </p>
                        <p
                          className={`text-xs max-w-md truncate ${
                            group.hasUnread
                              ? "text-accent-primary font-bold"
                              : "text-text-muted"
                          }`}
                        >
                          {group.lastMessage
                            ? `${group.lastMessage.senderName}: ${group.lastMessage.content}`
                            : "No group messages yet"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {group.lastMessage && (
                        <p className="text-[10px] text-text-muted font-mono mb-1">
                          {new Date(group.lastMessage.createdAt).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                        </p>
                      )}
                      {group.hasUnread && (
                        <span className="inline-block w-2.5 h-2.5 bg-accent-primary rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────── */}
      {showAddFriend && (
        <AddFriendModal onClose={() => setShowAddFriend(false)} />
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setShowCreateGroup(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="system-card relative w-full max-w-md p-6 z-10 flex flex-col max-h-[80vh] shadow-2xl border border-border-subtle"
          >
            <button
              type="button"
              onClick={() => setShowCreateGroup(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4 text-accent-text-light font-['Rajdhani'] uppercase tracking-wider">
              Create Study Group
            </h2>

            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="input-field mb-4 w-full text-xs font-['Rajdhani']"
            />

            <p className="text-xs text-text-muted mb-2 uppercase font-bold font-['Rajdhani'] tracking-wider">
              Select Friends
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 border border-border-subtle p-2 rounded-xl max-h-60 custom-scrollbar bg-bg-abyss/40">
              {friends.map((friend) => (
                <label
                  key={friend.id}
                  className="flex items-center gap-3 p-2 hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedFriends.includes(friend.id)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedFriends((prev) => [...prev, friend.id]);
                      else
                        setSelectedFriends((prev) =>
                          prev.filter((id) => id !== friend.id)
                        );
                    }}
                    className="accent-primary w-4 h-4"
                  />
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded bg-accent-primary-dim/30 text-[9px] font-mono font-bold text-accent-text-light border border-accent-primary-mid/30">
                      Rank {friend.hunterRank}
                    </span>
                    <span className="text-xs font-medium font-['Rajdhani'] text-text-primary">
                      {friend.name || friend.username}
                    </span>
                  </div>
                </label>
              ))}
              {friends.length === 0 && (
                <p className="text-xs text-text-muted text-center py-6 font-['Rajdhani']">
                  No friends added yet.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={!groupName || selectedFriends.length === 0}
              className="btn-primary w-full disabled:opacity-50 py-2.5 rounded-xl font-['Rajdhani'] font-bold uppercase tracking-wider text-xs shadow-md"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                border: "none",
                color: "var(--text-primary)",
              }}
            >
              Create Group
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
