"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/purity, react-hooks/refs */

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { useProfileModal } from "@/app/components/ProfileModalContext";
import { useRealtimePresence } from "@/app/hooks/useRealtimePresence";
import { usePostgresChanges } from "@/app/hooks/usePostgresChanges";
import { AddFriendModal } from "@/app/components/AddFriendModal";
import { FriendRequestsModal } from "@/app/components/FriendRequestsModal";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import { getDefaultCharacterConfig } from "@/lib/character-traits";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants, tabContentVariants } from "@/lib/motion";
import { FocusPartyProvider, FocusPartySection, useFocusParty } from "./focus-party";
import styles from "../Social.module.css";
import {
  Users,
  MessageSquare,
  UserPlus,
  UserCheck,
  Search,
  X,
  User,
  Play,
  ArrowUpDown,
  Shield,
  MessageCircle,
  Upload,
  Link2,
  Trash2,
  ChevronRight,
  Plus,
} from "lucide-react";
import { StreakFlameIcon } from "@/app/components/icons";

const getRankColorStyles = (rank: string) => {
  switch (rank?.toUpperCase()) {
    case "S":
      return "border-rose-500/50 text-rose-700 dark:text-rose-400 bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.25)]";
    case "A":
      return "border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
    case "B":
      return "border-purple-500/50 text-purple-700 dark:text-purple-300 bg-purple-500/10";
    case "C":
      return "border-sky-500/50 text-sky-700 dark:text-sky-300 bg-sky-500/10";
    case "D":
      return "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10";
    default:
      return "border-slate-500/40 text-slate-700 dark:text-slate-300 bg-slate-500/10";
  }
};

type Tab = "friends" | "messages" | "groups" | "party";

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

/**
 * Self-ticking timer for a friend card. Only THIS component re-renders every
 * second while the friend is studying — the rest of the page stays still.
 * The anchor (completedTodaySeconds + activeSessionStartedAt) comes from the
 * last /api/friends response; elapsed time is computed locally so the clock
 * runs smoothly between server refreshes.
 */
function FriendStudyTimer({ friend }: { friend: Friend }) {
  const isStudying = friend.isStudying;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStudying) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isStudying]);

  let liveSeconds = friend.todaySeconds;
  if (isStudying && friend.activeSessionStartedAt) {
    const started = new Date(friend.activeSessionStartedAt).getTime();
    const activeElapsed = Math.max(0, Math.floor((now - started) / 1000));
    liveSeconds = (friend.completedTodaySeconds ?? friend.todaySeconds) + activeElapsed;
  }

  return (
    <span
      className={`${styles.studyTimerClock} ${
        isStudying
          ? styles.studyTimerClockActive
          : liveSeconds > 0
          ? ""
          : "opacity-40"
      }`}
    >
      {formatHHMMSS(liveSeconds)}
    </span>
  );
}

function SocialContent() {
  const { user, isLoading } = useAuth();
  const { openProfile } = useProfileModal();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: Tab =
    tabParam && ["friends", "messages", "groups", "party"].includes(tabParam)
      ? (tabParam as Tab)
      : "friends";

  const { hasActiveParty, pendingInvites, session: activePartySession } = useFocusParty();

  const handleTabChange = (newTab: Tab) => {
    if (newTab === activeTab) return;
    if (newTab === "friends") {
      router.replace("/social", { scroll: false });
    } else {
      router.replace(`/social?tab=${newTab}`, { scroll: false });
    }
  };
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  useEffect(() => {
    if (tabParam === "requests") {
      setShowRequestsModal(true);
    }
  }, [tabParam]);

  const handleCloseRequests = () => {
    setShowRequestsModal(false);
    if (searchParams.get("tab") === "requests") {
      router.replace("/social", { scroll: false });
    }
  };

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
  const [messagesSearchQuery, setMessagesSearchQuery] = useState("");
  const [groupsSearchQuery, setGroupsSearchQuery] = useState("");
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
      {},
      { ttlMs: 10_000, staleMs: 120_000, storageKey: `social:friends:${user?.id ?? 0}` });
    if (data) setFriends(Array.isArray(data) ? data : []);
  }, [user?.id]);

  const loadRequests = useCallback(async () => {
    const data = await fetchCachedJSON<FriendRequest[]>("/api/friends/requests",
      {},
      { ttlMs: 20_000, staleMs: 120_000, storageKey: `social:requests:${user?.id ?? 0}` });
    if (data) setRequests(Array.isArray(data) ? data : []);
  }, [user?.id]);

  const loadConversations = useCallback(async () => {
    const data = await fetchCachedJSON<Conversation[]>("/api/conversations",
      {},
      { ttlMs: 10_000, staleMs: 120_000, storageKey: `social:convos:${user?.id ?? 0}` });
    if (data) setConversations(Array.isArray(data) ? data : []);
  }, [user?.id]);

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
    // Study sessions drive the "Studying" badges + timer snapshots — refresh
    // the roster the instant one starts/ends instead of waiting for a poll.
    { event: "INSERT", table: "StudySession" },
    { event: "UPDATE", table: "StudySession" },
    { event: "DELETE", table: "StudySession" },
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
      case "StudySession":
        loadersRef.current.loadFriends();
        break;
    }
  });

  // ─── Data Fetching & Polling ─────────────────────────────
  // With Realtime push connected the intervals become slow safety nets;
  // without it they carry the live updates as before.
  useEffect(() => {
    if (!user) return;

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
  }, [user?.id, pushConnected, presence.connected, loadFriends, loadRequests, loadConversations]);

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
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((req) => req.id !== requestId));
        if (action === "ACCEPT") {
          const friendsRes = await fetch("/api/friends");
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

  const dms = conversationsLive.filter((c) => !c.isGroup);
  const groups = conversationsLive.filter((c) => c.isGroup);

  const filteredDms = useMemo(() => {
    if (!messagesSearchQuery.trim()) return dms;
    const q = messagesSearchQuery.toLowerCase();
    return dms.filter((dm) => {
      const other = dm.participants.find((p) => p.id !== user?.id) || dm.participants[0];
      const nameMatch = (dm.name || other?.name || other?.username || "").toLowerCase().includes(q);
      const lastMsgMatch = (dm.lastMessage?.content || "").toLowerCase().includes(q);
      return nameMatch || lastMsgMatch;
    });
  }, [dms, messagesSearchQuery, user?.id]);

  const filteredGroups = useMemo(() => {
    if (!groupsSearchQuery.trim()) return groups;
    const q = groupsSearchQuery.toLowerCase();
    return groups.filter((g) => {
      const nameMatch = (g.name || "").toLowerCase().includes(q);
      const lastMsgMatch = (g.lastMessage?.content || "").toLowerCase().includes(q);
      return nameMatch || lastMsgMatch;
    });
  }, [groups, groupsSearchQuery]);

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

  return (
    <div className={styles.socialContainer}>
      <div className={styles.topGlow} aria-hidden="true" />
      <div className={styles.contentWrapper}>
        {/* ─── Top Header & Title ──────────────────────────────── */}
        <div className={styles.headerArea}>
          <div className={styles.headerTextGroup}>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Scholar Network
            </span>
            <h1 className={styles.title}>
              Social <em>Network</em>
            </h1>
            <p className={styles.subtitle}>
              Connect with fellow scholars, track focus sync, and coordinate parties.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => setShowRequestsModal(true)}
              className={styles.btnRequests}
            >
              <UserCheck className="w-4 h-4 text-accent-text-light" />
              <span>Requests</span>
              {requests.length > 0 && (
                <span className={styles.btnRequestsBadge}>
                  {requests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAddFriend(true)}
              className={styles.btnAddFriend}
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Friend</span>
            </button>
          </div>
        </div>

        {/* ─── Main Tabs Navigation ─────────────────────────────── */}
        <div className={styles.tabsContainer}>
          <div className={styles.tabsList}>
            <button
              type="button"
              onClick={() => handleTabChange("friends")}
              className={`${styles.tabBtn} ${activeTab === "friends" ? styles.tabBtnActive : ""}`}
            >
              <Users className="w-4 h-4" />
              <span>Friends</span>
              {studyingFriendsCount > 0 && (
                <span className={`${styles.tabBadge} ${styles.tabBadgeLive}`}>
                  {studyingFriendsCount} Studying
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="focus-party-tab"
              onClick={() => handleTabChange("party")}
              className={`${styles.tabBtn} ${activeTab === "party" ? styles.tabBtnActive : ""}`}
            >
              <StreakFlameIcon size={16} className="text-accent-text-light" />
              <span>Focus Party</span>
              {pendingInvites.length > 0 && (
                <span className={styles.tabBadge}>
                  {pendingInvites.length}
                </span>
              )}
              {hasActiveParty && Boolean(activePartySession) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("messages")}
              className={`${styles.tabBtn} ${activeTab === "messages" ? styles.tabBtnActive : ""}`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Messages</span>
              {dms.some((c) => c.hasUnread) && (
                <span className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("groups")}
              className={`${styles.tabBtn} ${activeTab === "groups" ? styles.tabBtnActive : ""}`}
            >
              <Shield className="w-4 h-4" />
              <span>Groups</span>
              {groups.some((c) => c.hasUnread) && (
                <span className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
              )}
            </button>
          </div>
        </div>

      {/* ─── Active Tab Content Container ───────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabContentVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="w-full"
        >
          {/* ─── TAB 1: FRIENDS (YPT 2-3 COLUMN GRID) ─────────────── */}
          {activeTab === "friends" && (
            <div className="flex flex-col gap-6">
                {/* Controls: Search, Quick Chips & Sorting */}
                <div className={styles.controlsBar}>
                  {/* Search Input */}
                  <div className={styles.searchWrap}>
                    <Search className={`w-4 h-4 ${styles.searchIcon}`} />
                    <input
                      type="text"
                      placeholder="Search friends..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={styles.searchInput}
                    />
                  </div>

                  <div className={styles.filtersGroup}>
                    {/* Quick Filter Chips */}
                    <div className={styles.chipGroup}>
                      <button
                        type="button"
                        onClick={() => setStatusFilter("ALL")}
                        className={`${styles.filterChip} ${
                          statusFilter === "ALL" ? styles.filterChipActive : ""
                        }`}
                      >
                        All ({friendsLive.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter("STUDYING")}
                        className={`${styles.filterChip} ${
                          statusFilter === "STUDYING" ? styles.filterChipStudyingActive : ""
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Studying ({studyingFriendsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter("ONLINE")}
                        className={`${styles.filterChip} ${
                          statusFilter === "ONLINE" ? styles.filterChipOnlineActive : ""
                        }`}
                      >
                        Online ({onlineFriendsCount})
                      </button>
                    </div>

                    {/* Sort Selector */}
                    <div className={styles.sortSelectWrap}>
                      <ArrowUpDown className="w-3.5 h-3.5 text-accent-primary" />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className={styles.sortSelect}
                      >
                        <option value="STUDY_TIME">Study Time</option>
                        <option value="ACTIVE">Active Status</option>
                        <option value="LEVEL">Level</option>
                        <option value="NAME">Name (A-Z)</option>
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
              <div className="w-16 h-16 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center mb-4 text-text-muted">
                <Users className="w-8 h-8" />
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
                    className={styles.btnAddFriend}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Friend</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6">
              {/* ─── Self / User Card (Always Appears First) ─── */}
              {shouldShowUserCard && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`${styles.friendCard} ${isUserStudying ? styles.friendCardStudying : ""}`}
                >
                  {/* Top Status Header */}
                  <div className={styles.cardHeaderRow}>
                    <div className="flex items-center gap-1.5">
                      {isUserStudying ? (
                        <span className={`${styles.statusPill} ${styles.statusStudying}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          <span>Studying</span>
                        </span>
                      ) : (
                        <span className={`${styles.statusPill} ${styles.statusOnline}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Online</span>
                        </span>
                      )}
                      <span className={styles.youBadge}>
                        YOU
                      </span>
                    </div>

                    {/* Rank & Level Badges */}
                    <div className={styles.rankBadgesGroup}>
                      <span className={styles.rankChip}>
                        Rank {user?.hunterRank || "E"}
                      </span>
                      <span className={styles.levelText}>
                        Lv. {user?.level || 1}
                      </span>
                    </div>
                  </div>

                  {/* Character Stage */}
                  <div
                    onClick={() => user?.username && openProfile(user.username)}
                    className={styles.characterStage}
                    title="View My Profile"
                  >
                    <CharacterRenderer
                      config={user?.characterConfig || getDefaultCharacterConfig(user?.username || "scholar")}
                      seed={user?.username || "scholar"}
                      size={135}
                      showPedestal={true}
                      showAura={isUserStudying}
                      className="[--character-size:92px] sm:[--character-size:135px]"
                    />

                    {/* Name & Handle */}
                    <div className={styles.characterInfo}>
                      <h3 className={styles.characterName}>
                        {user?.name || user?.username || "Scholar"}
                      </h3>
                      <p className={styles.characterHandle}>
                        @{user?.username}
                      </p>
                    </div>
                  </div>

                  {/* Digital Study Timer Box */}
                  <div className="z-10 flex flex-col gap-2 mt-1">
                    <div
                      className={`${styles.studyTimerBox} ${
                        isUserStudying ? styles.studyTimerBoxStudying : ""
                      }`}
                    >
                      <span className={styles.studyTimerLabel}>
                        Today&apos;s Study Time
                      </span>
                      <span
                        className={`${styles.studyTimerClock} ${
                          isUserStudying
                            ? styles.studyTimerClockActive
                            : userTodaySeconds > 0
                            ? ""
                            : "opacity-40"
                        }`}
                      >
                        {formatHHMMSS(userTodaySeconds)}
                      </span>
                    </div>

                    {/* Action Buttons: View Profile & Start Timer */}
                    <div className={styles.cardActionsRow}>
                      <button
                        type="button"
                        onClick={() => user?.username && openProfile(user.username)}
                        className={styles.btnActionSecondary}
                      >
                        <User className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                        <span>My Profile</span>
                      </button>

                      <Link
                        href="/timer"
                        className={styles.btnActionPrimary}
                      >
                        <Play className="w-3.5 h-3.5 fill-white shrink-0" />
                        <span>Start Timer</span>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── Friends Cards ─── */}
              {filteredFriends.map((friend) => {
                return (
                  <motion.div
                    key={friend.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`${styles.friendCard} ${friend.isStudying ? styles.friendCardStudying : ""}`}
                  >
                    {/* Top Status Header */}
                    <div className={styles.cardHeaderRow}>
                      <div className="flex items-center gap-1.5">
                        {friend.isStudying ? (
                          <span className={`${styles.statusPill} ${styles.statusStudying}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                            <span>Studying</span>
                          </span>
                        ) : friend.isOnline ? (
                          <span className={`${styles.statusPill} ${styles.statusOnline}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Online</span>
                          </span>
                        ) : (
                          <span className={styles.statusOffline}>
                            Offline
                          </span>
                        )}
                      </div>

                      {/* Rank & Level Badges */}
                      <div className={styles.rankBadgesGroup}>
                        <span className={styles.rankChip}>
                          Rank {friend.hunterRank}
                        </span>
                        <span className={styles.levelText}>
                          Lv. {friend.level}
                        </span>
                      </div>
                    </div>

                    {/* Character Stage */}
                    <div
                      onClick={() => openProfile(friend.username)}
                      className={styles.characterStage}
                    >
                      <CharacterRenderer
                        config={friend.characterConfig}
                        seed={friend.username}
                        size={135}
                        showPedestal={true}
                        showAura={friend.isStudying || friend.activeAura !== "none"}
                        className="[--character-size:92px] sm:[--character-size:135px]"
                      />

                      {/* Name & Handle */}
                      <div className={styles.characterInfo}>
                        <h3 className={styles.characterName}>
                          {friend.name || friend.username}
                        </h3>
                        <p className={styles.characterHandle}>
                          @{friend.username}
                        </p>
                      </div>
                    </div>

                    {/* YPT-Inspired Digital Study Timer Box */}
                    <div className="z-10 flex flex-col gap-2 mt-1">
                      <div
                        className={`${styles.studyTimerBox} ${
                          friend.isStudying ? styles.studyTimerBoxStudying : ""
                        }`}
                      >
                        <span className={styles.studyTimerLabel}>
                          Today&apos;s Study Time
                        </span>
                        <FriendStudyTimer friend={friend} />
                      </div>

                      {/* Card Action Buttons */}
                      <div className={styles.cardActionsRow}>
                        <button
                          type="button"
                          onClick={() => openProfile(friend.username)}
                          className={styles.btnActionSecondary}
                        >
                          <User className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                          <span>Profile</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMessageFriend(friend.id)}
                          className={styles.btnActionMessage}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-accent-primary shrink-0" />
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



      {/* ─── TAB 3: DIRECT MESSAGES ──────────────────────────── */}
      {activeTab === "messages" && (
        <div className="rounded-2xl bg-bg-panel/75 border border-border-subtle shadow-2xl backdrop-blur-2xl p-4 sm:p-6 relative overflow-hidden flex flex-col gap-5">
          {/* Ambient soft glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header Bar & Search Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border-subtle pb-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-primary-dim border border-accent-primary-mid/40 flex items-center justify-center text-accent-primary-light shadow-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                  Direct Messages
                </h2>
                <p className="text-[11px] font-['Rajdhani'] text-text-muted">
                  {dms.length} {dms.length === 1 ? "Conversation" : "Conversations"}
                </p>
              </div>
            </div>

            {/* In-tab real-time search */}
            {dms.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={messagesSearchQuery}
                  onChange={(e) => setMessagesSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-bg-abyss/80 border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/60 transition-all"
                />
                {messagesSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMessagesSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Direct Messages List */}
          {dms.length === 0 ? (
            <div className="text-center py-14 px-4 flex flex-col items-center select-none relative z-10">
              <div className="relative mb-3">
                <div className="absolute -inset-3 rounded-full bg-accent-primary/20 blur-xl opacity-70 pointer-events-none" />
                <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary-light shadow-md relative z-10">
                  <MessageCircle className="w-7 h-7" />
                </div>
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary mb-1">
                No Direct Messages Yet
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani'] max-w-sm mb-4">
                Open a scholar&apos;s profile from your friends list to establish an encrypted frequency.
              </p>
              <button
                type="button"
                onClick={() => handleTabChange("friends")}
                className="px-4 py-2 rounded-xl bg-accent-primary hover:brightness-110 active:scale-95 text-white font-['Rajdhani'] font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
              >
                Browse Friends
              </button>
            </div>
          ) : filteredDms.length === 0 ? (
            <div className="text-center py-12 text-xs font-['Rajdhani'] text-text-muted relative z-10">
              No conversations found matching &ldquo;{messagesSearchQuery}&rdquo;.
            </div>
          ) : (
            <div className="space-y-2.5 relative z-10">
              {filteredDms.map((dm) => {
                const other = dm.participants.find((p) => p.id !== user?.id) || dm.participants[0];
                return (
                  <Link
                    href={`/social/chat/${dm.id}`}
                    key={dm.id}
                    className="block group"
                    onMouseEnter={() => router.prefetch(`/social/chat/${dm.id}`)}
                  >
                    <div
                      className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl transition-all duration-200 border group relative gap-3 sm:gap-4 overflow-hidden ${
                        dm.hasUnread
                          ? "bg-accent-primary-dim/20 border-accent-primary/40 hover:border-accent-primary/70 shadow-[0_4px_20px_var(--accent-primary-dim)]"
                          : "bg-bg-abyss/60 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] border-border-subtle hover:border-accent-primary/40 shadow-sm hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                      }`}
                    >
                      {/* Unread Left Glow Accent */}
                      {dm.hasUnread && (
                        <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-accent-primary shadow-[0_0_10px_var(--accent-primary)]" />
                      )}

                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Dynamic Participant Profile Picture */}
                        <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl shrink-0 overflow-hidden bg-bg-abyss border border-border-subtle flex items-center justify-center shadow-md">
                          {other?.avatarUrl ? (
                            <img
                              src={other.avatarUrl}
                              alt={other.username}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <span className="text-base font-bold font-['Rajdhani'] text-accent-primary-light">
                              {(other?.name || other?.username || "S").charAt(0).toUpperCase()}
                            </span>
                          )}
                          {other?.isOnline && (
                            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-bg-abyss shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="font-bold font-['Rajdhani'] text-sm sm:text-base text-text-primary group-hover:text-accent-text-light transition-colors truncate">
                              {other?.name || other?.username || dm.name}
                            </p>
                            {other?.hunterRank && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border uppercase tracking-wider ${getRankColorStyles(
                                  other.hunterRank
                                )}`}
                              >
                                Rank {other.hunterRank}
                              </span>
                            )}
                            {other?.level && (
                              <span className="text-[10px] font-mono text-text-muted hidden sm:inline">
                                Lv. {other.level}
                              </span>
                            )}
                          </div>

                          <p
                            className={`text-xs truncate w-full flex items-center gap-1 ${
                              dm.hasUnread
                                ? "text-accent-text-light font-semibold"
                                : "text-text-muted group-hover:text-text-secondary transition-colors"
                            }`}
                          >
                            {dm.lastMessage ? (
                              <>
                                {dm.lastMessage.senderId === user?.id && (
                                  <span className="text-text-muted font-medium shrink-0">You:</span>
                                )}
                                <span className="truncate">{dm.lastMessage.content}</span>
                              </>
                            ) : (
                              <span className="italic text-text-muted/70">No messages yet</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          {dm.lastMessage && (
                            <p className="text-[10px] text-text-muted font-mono mb-1">
                              {new Date(dm.lastMessage.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                          {dm.hasUnread && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-accent-primary text-white shadow-sm animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary-light group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100 hidden sm:block" />
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
        <div className="rounded-2xl bg-bg-panel/75 border border-border-subtle shadow-2xl backdrop-blur-2xl p-4 sm:p-6 relative overflow-hidden flex flex-col gap-5">
          {/* Ambient soft glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header Bar & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border-subtle pb-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-primary-dim border border-accent-primary-mid/40 flex items-center justify-center text-accent-primary-light shadow-sm">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                  Study Groups
                </h2>
                <p className="text-[11px] font-['Rajdhani'] text-text-muted">
                  {groups.length} {groups.length === 1 ? "Squad Joined" : "Squads Joined"}
                </p>
              </div>
            </div>

            {/* In-tab search & Create Group Button */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {groups.length > 0 && (
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search groups..."
                    value={groupsSearchQuery}
                    onChange={(e) => setGroupsSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-bg-abyss/80 border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/60 transition-all"
                  />
                  {groupsSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGroupsSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-primary-dark hover:brightness-110 active:scale-95 text-white font-['Rajdhani'] font-bold text-xs uppercase tracking-wider shadow-md transition-all shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Group</span>
              </button>
            </div>
          </div>

          {/* Study Groups List */}
          {groups.length === 0 ? (
            <div className="text-center py-14 px-4 flex flex-col items-center select-none relative z-10">
              <div className="relative mb-3">
                <div className="absolute -inset-3 rounded-full bg-accent-primary/20 blur-xl opacity-70 pointer-events-none" />
                <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary-light shadow-md relative z-10">
                  <Shield className="w-7 h-7" />
                </div>
              </div>
              <h3 className="text-base font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary mb-1">
                No Study Groups Joined Yet
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani'] max-w-sm mb-4">
                Form a study squad with your fellow scholars to coordinate focus sessions and conquer quests together.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-primary-dark hover:brightness-110 active:scale-95 text-white font-['Rajdhani'] font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Form Study Group</span>
              </button>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-xs font-['Rajdhani'] text-text-muted relative z-10">
              No study groups found matching &ldquo;{groupsSearchQuery}&rdquo;.
            </div>
          ) : (
            <div className="space-y-2.5 relative z-10">
              {filteredGroups.map((group) => {
                const onlineCount = group.participants.filter((p) => p.isOnline).length;
                return (
                  <Link
                    href={`/social/chat/${group.id}`}
                    key={group.id}
                    className="block group"
                    onMouseEnter={() => router.prefetch(`/social/chat/${group.id}`)}
                  >
                    <div
                      className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl transition-all duration-200 border group relative gap-3 sm:gap-4 overflow-hidden ${
                        group.hasUnread
                          ? "bg-accent-primary-dim/20 border-accent-primary/40 hover:border-accent-primary/70 shadow-[0_4px_20px_var(--accent-primary-dim)]"
                          : "bg-bg-abyss/60 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] border-border-subtle hover:border-accent-primary/40 shadow-sm hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                      }`}
                    >
                      {group.hasUnread && (
                        <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-accent-primary shadow-[0_0_10px_var(--accent-primary)]" />
                      )}

                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Squad Emblem */}
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-accent-primary/25 via-accent-primary/10 to-transparent border border-accent-primary/30 flex items-center justify-center text-accent-primary-light shrink-0 shadow-inner overflow-hidden">
                          {group.avatarUrl ? (
                            <img
                              src={group.avatarUrl}
                              alt={group.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <Shield className="w-5 h-5 text-accent-primary-light group-hover:scale-110 transition-transform" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="font-bold font-['Rajdhani'] text-sm sm:text-base text-text-primary group-hover:text-accent-text-light transition-colors truncate">
                              {group.name}
                            </p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-900/5 dark:bg-white/5 border border-border-subtle text-text-muted flex items-center gap-1 shrink-0">
                              <Users className="w-2.5 h-2.5 text-accent-primary-light" />
                              {group.participants.length} Hunters
                            </span>
                            {onlineCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {onlineCount} Online
                              </span>
                            )}
                          </div>

                          <p
                            className={`text-xs truncate w-full flex items-center gap-1 ${
                              group.hasUnread
                                ? "text-accent-text-light font-semibold"
                                : "text-text-muted group-hover:text-text-secondary transition-colors"
                            }`}
                          >
                            {group.lastMessage ? (
                              <>
                                <span className="text-text-muted font-medium shrink-0">
                                  {group.lastMessage.senderId === user?.id
                                    ? "You"
                                    : group.lastMessage.senderName}
                                  :
                                </span>
                                <span className="truncate">{group.lastMessage.content}</span>
                              </>
                            ) : (
                              <span className="italic text-text-muted/70">No group messages yet</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          {group.lastMessage && (
                            <p className="text-[10px] text-text-muted font-mono mb-1">
                              {new Date(group.lastMessage.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                          {group.hasUnread && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-accent-primary text-white shadow-sm animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary-light group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100 hidden sm:block" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: FOCUS PARTY ──────────────────────────────── */}
      {activeTab === "party" && (
        <FocusPartySection friends={friends} />
      )}
        </motion.div>
      </AnimatePresence>

      {/* ─── Modals ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddFriend && (
          <AddFriendModal onClose={() => setShowAddFriend(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRequestsModal && (
          <FriendRequestsModal
            requests={requests}
            actionLoadingId={actionLoadingId}
            onAction={handleRequestAction}
            onOpenProfile={openProfile}
            onOpenAddFriend={() => setShowAddFriend(true)}
            onClose={handleCloseRequests}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateGroup && (
          <motion.div
            key="create-group-modal-backdrop"
            variants={backdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setShowCreateGroup(false)}
            />
            <motion.div
              key="create-group-modal-content"
              variants={modalDialogVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="relative w-full max-w-md p-6 z-10 flex flex-col max-h-[85vh] shadow-2xl rounded-2xl bg-bg-panel border border-border-subtle backdrop-blur-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowCreateGroup(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
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
                  <div className="flex items-center bg-bg-panel p-0.5 rounded-lg border border-border-subtle">
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
                  <div className="w-10 h-10 rounded-xl bg-bg-panel border border-border-subtle flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
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
                      className="flex-1 py-1.5 px-3 rounded-lg bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    >
                      <Upload className="w-3 h-3 text-accent-primary" />
                      <span>{groupAvatarUrl ? "Replace Group Image" : "Upload Group Image"}</span>
                    </button>
                    {groupAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setGroupAvatarUrl("")}
                        className="p-1.5 rounded-lg bg-bg-panel hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
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
                    className="flex-1 rounded-lg px-3 py-1.5 bg-bg-panel border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-all shadow-inner"
                  />
                  {groupAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setGroupAvatarUrl("")}
                      className="p-1.5 rounded-lg bg-bg-panel hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
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
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-primary-dark hover:brightness-110 active:scale-95 text-white disabled:opacity-40 font-['Rajdhani'] font-bold uppercase tracking-wider text-xs shadow-md transition-all cursor-pointer"
            >
              Create Group
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
      </div>
    </div>
  );
}

export function SocialScreen() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-void text-text-muted">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <FocusPartyProvider>
        <SocialContent />
      </FocusPartyProvider>
    </Suspense>
  );
}

export default SocialScreen;
