"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useAuth } from "../components/AuthProvider";
import { useProfileModal } from "../components/ProfileModalContext";
import { useRealtimePresence } from "../hooks/useRealtimePresence";
import { usePostgresChanges } from "../hooks/usePostgresChanges";
import { AddFriendModal } from "../components/AddFriendModal";
import { CharacterRenderer } from "../components/character/CharacterRenderer";
import { getDefaultCharacterConfig } from "@/lib/character-traits";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Upload,
  Camera,
  Link2,
  Trash2,
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
  completedTodaySeconds?: number;
  isOnline: boolean;
  isStudying: boolean;
  activeSessionStartedAt: string | null;
  avatarUrl: string | null;
  activeAvatar: string;
  activeFrame: string;
  activeAura?: string;
  activeTitle: string | null;
  characterConfig?: any | null;
  bio: string | null;
  streakDays: number;
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
  avatarUrl?: string | null;
  isGroup: boolean;
  hasUnread: boolean;
  participants: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
    level?: number;
    avatarUrl?: string | null;
    activeAvatar?: string;
    activeFrame?: string;
    characterConfig?: any | null;
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

function SocialContent() {
  const { user, token, isLoading } = useAuth();
  const { openProfile } = useProfileModal();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam && ["friends", "requests", "messages", "groups"].includes(tabParam)
      ? tabParam
      : "friends"
  );

  useEffect(() => {
    if (tabParam && ["friends", "requests", "messages", "groups"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
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
  const [groupAvatarUrl, setGroupAvatarUrl] = useState("");
  const [groupAvatarMode, setGroupAvatarMode] = useState<"UPLOAD" | "URL">("UPLOAD");
  const createGroupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Client-side image compression for group avatar creation
  const processImageFile = (file: File, callback: (dataUrl: string) => void, maxDim: number = 400) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl) return;

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/webp", 0.85);
          callback(compressed);
        } else {
          callback(rawUrl);
        }
      };
      img.onerror = () => callback(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  // ─── Data Loaders (stale-while-revalidate + storage-backed) ──
  // Repeat visits paint instantly; background refresh keeps data current.
  const loadFriends = useCallback(async () => {
    const data = await fetchCachedJSON<Friend[]>("/api/friends",
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 10_000, staleMs: 120_000, storageKey: `social:friends:${user?.id ?? 0}` });
    if (data) setFriends(Array.isArray(data) ? data : []);
  }, [token, user?.id]);

  const loadRequests = useCallback(async () => {
    const data = await fetchCachedJSON<FriendRequest[]>("/api/friends/requests",
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 20_000, staleMs: 120_000, storageKey: `social:requests:${user?.id ?? 0}` });
    if (data) setRequests(Array.isArray(data) ? data : []);
  }, [token, user?.id]);

  const loadConversations = useCallback(async () => {
    const data = await fetchCachedJSON<Conversation[]>("/api/conversations",
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 10_000, staleMs: 120_000, storageKey: `social:convos:${user?.id ?? 0}` });
    if (data) setConversations(Array.isArray(data) ? data : []);
  }, [token, user?.id]);

  // ─── Supabase Realtime: presence + postgres_changes push ────
  // Presence replaces the lastSeenAt window for online dots (instant on/off);
  // postgres_changes replaces the fast polling for roster/thread updates.
  // Both no-op (and polling continues) when Realtime isn't configured.
  const presence = useRealtimePresence();

  const loadersRef = useRef({ loadFriends, loadRequests, loadConversations });
  loadersRef.current = { loadFriends, loadRequests, loadConversations };

  const { connected: pushConnected } = usePostgresChanges([
    { event: "INSERT", table: "Friendship" },
    { event: "DELETE", table: "Friendship" },
    { event: "INSERT", table: "FriendRequest" },
    { event: "UPDATE", table: "FriendRequest" },
    { event: "DELETE", table: "FriendRequest" },
    { event: "INSERT", table: "Message" },
    { event: "INSERT", table: "Conversation" },
    { event: "UPDATE", table: "Conversation" },
    { event: "DELETE", table: "Conversation" },
    { event: "INSERT", table: "ConversationParticipant" },
    { event: "DELETE", table: "ConversationParticipant" },
  ], (payload) => {
    switch (payload.table) {
      case "Message":
      case "Conversation":
      case "ConversationParticipant":
        loadersRef.current.loadConversations();
        break;
      case "Friendship":
        loadersRef.current.loadFriends();
        loadersRef.current.loadConversations();
        break;
      case "FriendRequest":
        loadersRef.current.loadRequests();
        break;
    }
  });

  // ─── Data Fetching & Polling ─────────────────────────────
  // With Realtime push connected the intervals become slow safety nets;
  // without it they carry the live updates as before.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const initial = async () => {
      try {
        await Promise.all([loadFriends(), loadRequests(), loadConversations()]);
      } catch (err) {
        console.error("Failed to fetch social data", err);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };
    initial();

    const realtimeActive = pushConnected || presence.connected;
    const rosterMs = realtimeActive ? 60_000 : 15_000;
    const requestsMs = realtimeActive ? 120_000 : 30_000;

    const friendsInterval = setInterval(loadFriends, rosterMs);
    const requestsInterval = setInterval(loadRequests, requestsMs);
    const convosInterval = setInterval(loadConversations, rosterMs);
    return () => {
      cancelled = true;
      clearInterval(friendsInterval);
      clearInterval(requestsInterval);
      clearInterval(convosInterval);
    };
  }, [token, user?.id, pushConnected, presence.connected, loadFriends, loadRequests, loadConversations]);

  // ─── Presence overlay for online dots ─────────────────────
  // When the presence channel is live, a friend is online if EITHER the
  // server says so (lastSeenAt) OR they are currently on the channel.
  const friendsLive = useMemo(() => {
    if (!presence.enabled) return friends;
    return friends.map((f) => ({
      ...f,
      isOnline: f.isOnline || presence.onlineUserIds.has(f.id),
    }));
  }, [friends, presence.enabled, presence.onlineUserIds]);

  const conversationsLive = useMemo(() => {
    if (!presence.enabled) return conversations;
    return conversations.map((c) => ({
      ...c,
      participants: c.participants.map((p) => ({
        ...p,
        isOnline: p.isOnline || presence.onlineUserIds.has(p.id),
      })),
    }));
  }, [conversations, presence.enabled, presence.onlineUserIds]);

  // ─── Live Second Clock Ticker ─────────────────────────────
  // Only ticks while the current user has an active study session —
  // previously this re-rendered the entire page every second for everyone.
  const isUserStudying = Boolean(user?.activeSessionStartedAt);
  useEffect(() => {
    if (!isUserStudying) return;
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 1000000);
    }, 1000);
    return () => clearInterval(timer);
  }, [isUserStudying]);

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
          avatarUrl: groupAvatarUrl.trim() || null,
          isGroup: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateGroup(false);
        setGroupName("");
        setGroupAvatarUrl("");
        setSelectedFriends([]);
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to create group", err);
    }
  };

  // ─── Filtered & Sorted Friends Roster ────────────────────
  const studyingFriendsCount = useMemo(
    () => friendsLive.filter((f) => f.isStudying).length,
    [friendsLive]
  );
  const onlineFriendsCount = useMemo(
    () => friendsLive.filter((f) => f.isOnline).length,
    [friendsLive]
  );

  const filteredFriends = useMemo(() => {
    let list = [...friendsLive];

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
  }, [friendsLive, statusFilter, searchQuery, sortBy]);

  // Current user's daily study time (accurate for today + live ticking if studying)
  const userTodaySeconds = useMemo(() => {
    if (user?.activeSessionStartedAt) {
      const started = new Date(user.activeSessionStartedAt).getTime();
      const activeElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      return (user.completedTodaySeconds ?? user.todayStudySeconds ?? 0) + activeElapsed;
    }
    return user?.todayStudySeconds ?? (user?.completedTodaySeconds ?? 0);
  }, [user, tick]);

  const shouldShowUserCard = useMemo(() => {
    if (!user) return false;
    if (statusFilter === "STUDYING" && !isUserStudying) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = user.name && user.name.toLowerCase().includes(q);
      const matchUsername = user.username && user.username.toLowerCase().includes(q);
      if (!matchName && !matchUsername) return false;
    }
    return true;
  }, [user, statusFilter, isUserStudying, searchQuery]);

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

  const dms = conversationsLive.filter((c) => !c.isGroup);
  const groups = conversationsLive.filter((c) => c.isGroup);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 min-h-screen min-w-0 flex flex-col gap-6">
      {/* ─── Top Header & Title ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest mb-1 text-accent-text-light font-['Rajdhani'] font-bold uppercase">
            SCHOLAR NETWORK
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold uppercase tracking-wider text-text-primary drop-shadow-sm"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Social
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowAddFriend(true)}
          className="btn-primary text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-wider py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-md transition-all"
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
                  All ({friendsLive.length})
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
          {isLoadingData && friendsLive.length === 0 ? (
            <div className="py-24 text-center text-text-muted font-['Rajdhani'] font-bold animate-pulse">
              Loading Friends...
            </div>
          ) : !shouldShowUserCard && filteredFriends.length === 0 ? (
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
              {/* ─── Self / User Card (Always Appears First) ─── */}
              {shouldShowUserCard && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`relative rounded-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden group shadow-lg p-5 ${
                    isUserStudying
                      ? "bg-bg-panel border-cyan-500/40 shadow-[0_0_24px_rgba(6,182,212,0.15)] hover:border-cyan-400"
                      : "bg-bg-panel/90 border-accent-primary/40 hover:border-accent-primary shadow-[0_0_16px_var(--accent-primary-dim)]"
                  }`}
                >
                  {/* Atmospheric Glow */}
                  {isUserStudying ? (
                    <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-accent-primary-dim/15 via-transparent to-transparent pointer-events-none" />
                  )}

                  {/* Top Status Header */}
                  <div className="flex items-center justify-between z-10 mb-2">
                    <div className="flex items-center gap-2">
                      {isUserStudying ? (
                        <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          <span>● Studying</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Online</span>
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-accent-primary/20 border border-accent-primary/40 text-[10px] font-bold font-['Rajdhani'] text-accent-text-light uppercase tracking-wider">
                        YOU
                      </span>
                    </div>

                    {/* Rank & Level Badges */}
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-accent-primary-dim/30 border border-accent-primary-mid/40 text-[10px] font-bold font-mono text-accent-text-light">
                        Rank {user?.hunterRank || "E"}
                      </span>
                      <span className="text-xs font-mono font-bold text-text-muted">
                        Lv. {user?.level || 1}
                      </span>
                    </div>
                  </div>

                  {/* Character Stage (Large 135px Showcase) */}
                  <div
                    onClick={() => user?.username && openProfile(user.username)}
                    className="relative min-h-[170px] flex flex-col items-center justify-center cursor-pointer group-hover:scale-105 transition-transform duration-300 py-3 z-10"
                    title="View My Profile"
                  >
                    <CharacterRenderer
                      config={user?.characterConfig || getDefaultCharacterConfig(user?.username || "scholar")}
                      seed={user?.username || "scholar"}
                      size={135}
                      showPedestal={true}
                      showAura={isUserStudying}
                    />

                    {/* Name & Handle */}
                    <div className="text-center mt-3 w-full px-2">
                      <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary truncate hover:text-accent-text-light transition-colors">
                        {user?.name || user?.username || "Scholar"}
                      </h3>
                      <p className="text-xs font-mono text-text-muted truncate">
                        @{user?.username}
                      </p>
                    </div>
                  </div>

                  {/* Digital Study Timer Box */}
                  <div className="z-10 flex flex-col gap-3 mt-2">
                    <div
                      className={`p-3.5 rounded-xl text-center border transition-all ${
                        isUserStudying
                          ? "bg-bg-abyss/95 border-cyan-500/40 shadow-[inset_0_0_15px_rgba(6,182,212,0.12)]"
                          : "bg-bg-abyss/70 border-border-subtle"
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold font-['Rajdhani'] tracking-widest text-text-muted block">
                        Today&apos;s Study Time
                      </span>
                      <span
                        className={`text-2xl font-mono font-bold tracking-tight block mt-0.5 ${
                          isUserStudying
                            ? "text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                            : userTodaySeconds > 0
                            ? "text-text-primary"
                            : "text-text-muted"
                        }`}
                      >
                        {formatHHMMSS(userTodaySeconds)}
                      </span>
                    </div>

                    {/* Action Buttons: View Profile & Start Timer */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => user?.username && openProfile(user.username)}
                        className="px-3 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-accent-primary" />
                        <span>My Profile</span>
                      </button>

                      <Link
                        href="/timer"
                        className="px-3 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary-light border border-accent-primary-light/40 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Start Timer</span>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── Friends Cards ─── */}
              {filteredFriends.map((friend) => {
                // Calculate live dynamic seconds if studying
                let liveSeconds = friend.todaySeconds;
                if (friend.isStudying && friend.activeSessionStartedAt) {
                  const started = new Date(friend.activeSessionStartedAt).getTime();
                  const activeElapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
                  liveSeconds = (friend.completedTodaySeconds ?? friend.todaySeconds) + activeElapsed;
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
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Sender Avatar / Character */}
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-center overflow-hidden">
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
                          <span className="text-xl font-bold font-['Rajdhani'] text-emerald-400 select-none">
                            {(req.sender.name || req.sender.username || "S").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

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
                        onClick={() => openProfile(req.sender.username)}
                        className="text-base font-bold font-['Rajdhani'] text-text-primary hover:text-accent-text-light transition-colors text-left block truncate w-full"
                      >
                        {req.sender.name || req.sender.username}
                      </button>
                      <p className="text-xs text-text-muted font-mono truncate w-full">
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
              {dms.map((dm) => {
                const other = dm.participants.find((p) => p.id !== user?.id) || dm.participants[0];
                return (
                  <Link
                    href={`/social/chat/${dm.id}`}
                    key={dm.id}
                    className="block group"
                    onMouseEnter={() => router.prefetch(`/social/chat/${dm.id}`)}
                  >
                    <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl hover:bg-white/[0.04] transition-all bg-bg-panel border border-border-subtle group-hover:border-accent-primary/50 shadow-sm gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Dynamic Participant Profile Picture */}
                        <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl shrink-0 overflow-hidden bg-bg-abyss border border-border-subtle flex items-center justify-center shadow-sm">
                          <div className={`rank-badge rank-${other?.hunterRank || "E"} w-full h-full text-sm font-mono font-bold flex items-center justify-center overflow-hidden`}>
                            {other?.avatarUrl ? (
                              <img
                                src={other.avatarUrl}
                                alt={other.username}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{other?.hunterRank || "E"}</span>
                            )}
                          </div>
                          {other?.isOnline && (
                            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-bg-panel" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={`font-bold font-['Rajdhani'] text-base truncate ${
                                dm.hasUnread
                                  ? "text-text-primary"
                                  : "text-text-secondary"
                              }`}
                            >
                              {dm.name}
                            </p>
                            {other && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-accent-primary-dim/30 border border-accent-primary-mid/40 text-accent-text-light shrink-0">
                                Rank {other.hunterRank || "E"}
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-xs truncate w-full ${
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
                      <div className="text-right shrink-0">
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
                );
              })}
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
                  onMouseEnter={() => router.prefetch(`/social/chat/${group.id}`)}
                >
                  <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl hover:bg-white/[0.04] transition-all bg-bg-panel border border-border-subtle group-hover:border-accent-primary/50 shadow-sm gap-3">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold uppercase font-['Rajdhani'] text-lg shrink-0 shadow-sm overflow-hidden">
                        {group.avatarUrl ? (
                          <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-5 h-5 text-indigo-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`font-bold font-['Rajdhani'] text-base truncate ${
                              group.hasUnread
                                ? "text-text-primary"
                                : "text-text-secondary"
                            }`}
                          >
                            {group.name}
                          </p>
                          <span className="text-xs text-text-muted font-normal font-mono shrink-0">
                            {group.participants.length} Members
                          </span>
                        </div>
                        <p
                          className={`text-xs truncate w-full ${
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
                    <div className="text-right shrink-0">
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
            className="system-card relative w-full max-w-md p-6 z-10 flex flex-col max-h-[85vh] shadow-2xl border border-border-subtle"
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
              className="input-field mb-3 w-full text-xs font-['Rajdhani']"
            />

            {/* Group Image Section */}
            <div className="mb-4 p-3 rounded-xl bg-bg-abyss/60 border border-border-subtle flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
                  Group Image (Optional)
                </span>
                <div className="flex items-center bg-bg-panel p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => setGroupAvatarMode("UPLOAD")}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-['Rajdhani'] uppercase transition-all flex items-center gap-1 ${
                      groupAvatarMode === "UPLOAD"
                        ? "bg-accent-primary text-white shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <Upload className="w-2.5 h-2.5" />
                    <span>Upload</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupAvatarMode("URL")}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-['Rajdhani'] uppercase transition-all flex items-center gap-1 ${
                      groupAvatarMode === "URL"
                        ? "bg-accent-primary text-white shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <Link2 className="w-2.5 h-2.5" />
                    <span>URL</span>
                  </button>
                </div>
              </div>

              {/* Hidden file input for create group */}
              <input
                ref={createGroupFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    processImageFile(file, (compressed) => setGroupAvatarUrl(compressed), 400);
                  }
                  e.target.value = "";
                }}
              />

              {groupAvatarMode === "UPLOAD" ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-panel border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                    {groupAvatarUrl ? (
                      <img src={groupAvatarUrl} alt="Group Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => createGroupFileInputRef.current?.click()}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-bg-panel hover:bg-bg-shadow border border-white/10 hover:border-accent-primary/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    >
                      <Upload className="w-3 h-3 text-accent-primary" />
                      <span>{groupAvatarUrl ? "Replace Group Image" : "Upload Group Image"}</span>
                    </button>
                    {groupAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setGroupAvatarUrl("")}
                        className="p-1.5 rounded-lg bg-bg-panel hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                        title="Clear chosen file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={groupAvatarUrl}
                    onChange={(e) => setGroupAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="flex-1 rounded-lg px-3 py-1.5 bg-bg-panel border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-all shadow-inner"
                  />
                  {groupAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setGroupAvatarUrl("")}
                      className="p-1.5 rounded-lg bg-bg-panel hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                      title="Clear URL"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-text-muted mb-2 uppercase font-bold font-['Rajdhani'] tracking-wider">
              Select Friends
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 border border-border-subtle p-2 rounded-xl max-h-48 custom-scrollbar bg-bg-abyss/40">
              {friendsLive.map((friend) => (
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
              {friendsLive.length === 0 && (
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

export default function SocialPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-void text-text-muted">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SocialContent />
    </Suspense>
  );
}
