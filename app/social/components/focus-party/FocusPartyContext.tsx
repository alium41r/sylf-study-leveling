"use client";

// ============================================================================
// FocusPartyContext — Central State & Controller for Focus Party Frontend
// ============================================================================
// Provides a single, coherent source of truth for Focus Party state across
// Social, Lobby, and Focus Room views. Wires up useFocusPartyRealtime,
// tracks pending invitations, and exposes safe action dispatchers.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { fetchWithTimeout } from "@/lib/api-transport";
import { useAuth } from "@/app/components/AuthProvider";
import { getTimerSync, TIMER_SYNC_EVENT } from "@/lib/timer-sync";
import { normalizeFocusTimestamp } from "@/lib/focus-party-types";
import {
  useFocusPartyRealtime,
  type RealtimeConnectionState,
} from "@/app/hooks/useFocusPartyRealtime";
import type {
  FocusPartySummaryView,
  FocusPartyStateView,
  FocusSessionView,
  MemberTimerView,
  FocusPartyInviteView,
  FocusTimerState,
} from "@/lib/focus-party-types";

export type FocusPartyViewMode = "lobby" | "room";

export interface FocusPartyContextValue {
  // Party State
  partySummary: FocusPartySummaryView | null;
  party: FocusPartyStateView | null;
  session: FocusSessionView | null;
  timerViews: Record<number, MemberTimerView>;
  collectiveSeconds: number;
  connectionState: RealtimeConnectionState;
  pendingInvites: FocusPartyInviteView[];

  // Navigation / View State
  viewMode: FocusPartyViewMode;
  setViewMode: (mode: FocusPartyViewMode) => void;

  // Status flags
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;
  hasActiveParty: boolean;
  isLeader: boolean;
  isInFocus: boolean;
  myParticipant: MemberTimerView | null;
  myTimerView: MemberTimerView | null;
  myTimerState: FocusTimerState;
  myLiveSeconds: number;

  // Actions
  refresh: () => Promise<void>;
  createParty: (name?: string) => Promise<{ success: boolean; error?: string; partyId?: number }>;
  joinParty: (partyId: number) => Promise<{ success: boolean; error?: string }>;
  leaveParty: () => Promise<{ success: boolean; error?: string }>;
  kickMember: (memberId: number) => Promise<{ success: boolean; error?: string }>;
  inviteFriend: (friendId: number) => Promise<{ success: boolean; error?: string; inviteId?: number }>;
  respondToInvite: (inviteId: number, action: "ACCEPTED" | "DECLINED") => Promise<{ success: boolean; error?: string }>;
  enterFocus: (durationGoalMinutes?: number, title?: string) => Promise<{ success: boolean; error?: string }>;
  startTimer: () => Promise<{ success: boolean; error?: string }>;
  pauseTimer: () => Promise<{ success: boolean; error?: string }>;
  resumeTimer: () => Promise<{ success: boolean; error?: string }>;
  leaveFocus: () => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

const FocusPartyContext = createContext<FocusPartyContextValue | null>(null);

interface PartyResponse { error?: string; activeParty?: FocusPartySummaryView | null; pendingInvites?: FocusPartyInviteView[]; success?: boolean; partyId?: number; leaderId?: number; name?: string }

async function parseSafeJson<T = PartyResponse>(
  res: Response,
  fallbackError: string
): Promise<{ data: T | null; error: string | null }> {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      const data = (await res.json()) as T;
      return { data, error: null };
    } catch {
      return { data: null, error: fallbackError };
    }
  }
  return { data: null, error: `${fallbackError} (${res.status})` };
}

export function FocusPartyProvider({
  children,
  partyIdOverride,
}: {
  children: ReactNode;
  partyIdOverride?: number;
}) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [partySummary, setPartySummary] = useState<FocusPartySummaryView | null>(null);
  const [pendingInvites, setPendingInvites] = useState<FocusPartyInviteView[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<FocusPartyViewMode>(partyIdOverride ? "room" : "lobby");
  const [exitRevision, setExitRevision] = useState(0);
  const overviewGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++overviewGenerationRef.current;
    return () => { overviewGenerationRef.current = generation + 1; };
  }, [currentUserId]);

  const partyId = partyIdOverride ?? partySummary?.id ?? null;

  // ─── 1. Load User's Active Party & Pending Invites ───────────────────────
  const fetchActivePartyOverview = useCallback(async () => {
    const generation = overviewGenerationRef.current;
    if (!currentUserId) {
      setPartySummary(null);
      setPendingInvites([]);
      setIsInitialLoading(false);
      return;
    }

    try {
      const res = await fetchWithTimeout(fetch, "/api/focus-party", { credentials: "include", cache: "no-store" });
      const { data, error: parseErr } = await parseSafeJson(res, "Failed to load focus party");
      if (generation !== overviewGenerationRef.current) return;
      if (res.ok && data) {
        setPartySummary(data.activeParty || null);
        setPendingInvites(Array.isArray(data.pendingInvites) ? data.pendingInvites : []);
        setActionError(null);
      } else {
        setActionError(data?.error || parseErr || "Failed to load focus party");
      }
    } catch (err) {
      if (generation === overviewGenerationRef.current) setActionError(err instanceof Error ? err.message : "Network error loading focus party");
    } finally {
      if (generation === overviewGenerationRef.current) setIsInitialLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void fetchActivePartyOverview(); });
    return () => { cancelled = true; };
  }, [fetchActivePartyOverview]);

  // ─── 2. Supabase Realtime Hook for Party ─────────────────────────────────
  const rt = useFocusPartyRealtime(partyId, currentUserId, {
    enabled: Boolean(partyId && currentUserId),
    onEvent: (event) => {
      // If party was disbanded or current user was removed, refresh overview
      if (event.type === "PARTY_DISBANDED" || (event.type === "MEMBER_REMOVED" && event.payload?.memberId === currentUserId)) {
        setPartySummary(null);
        setViewMode("lobby");
        fetchActivePartyOverview();
      }
    },
  });

  // Keep partySummary synchronized if Realtime detects leader change or disband
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (rt.party?.party) {
        setPartySummary(rt.party.party);
      } else if (partyId && !rt.isLoading && rt.error && rt.error.includes("disbanded")) {
        setPartySummary(null);
        setViewMode("lobby");
      }
    });
    return () => { cancelled = true; };
  }, [rt.party, rt.isLoading, rt.error, partyId]);

  // Keep viewMode synced with party existence
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!rt.party && !rt.isLoading && !rt.error && !partyId) {
        setViewMode("lobby");
      }
    });
    return () => { cancelled = true; };
  }, [rt.party, rt.isLoading, rt.error, partyId]);

  // ─── 3. Derived State Helpers ───────────────────────────────────────────
  const party = rt.party;
  const session = rt.session;
  const rawTimerViews = rt.timerViews;
  const connectionState = rt.connectionState;

  const hasActiveParty = Boolean(
    (partySummary || party?.party) && !party?.party?.disbandedAt
  );
  const isLeader = Boolean(
    hasActiveParty && ((party?.party?.leaderId ?? partySummary?.leaderId) === currentUserId)
  );

  // Participant view for current user in active session
  const myParticipant = useMemo<MemberTimerView | null>(() => {
    if (!session || !currentUserId) return null;
    return session.members.find((p) => p.userId === currentUserId) || null;
  }, [session, currentUserId]);

  const joinedAt = normalizeFocusTimestamp(myParticipant?.joinedAt);
  const exitKey = session && currentUserId && joinedAt ? `party-exit-${session.id}-${Date.parse(joinedAt)}` : null;
  const savedExit = useMemo(() => {
    if (!currentUserId || !exitKey) return null;
    try { return getTimerSync(currentUserId).journal(exitKey); } catch { return null; }
    // Journal notifications trigger this account/participation-scoped read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, exitKey, exitRevision]);
  const isInFocus = Boolean(myParticipant && myParticipant.timerState !== "LEFT" && !savedExit?.endedAt);
  const own = currentUserId ? rawTimerViews[currentUserId] : null;
  const timerViews = useMemo(() => savedExit?.endedAt && currentUserId && own ? { ...rawTimerViews, [currentUserId]: {
    ...own, timerState: "LEFT" as const, isFocusing: false, currentStartedAt: null, leftAt: savedExit.endedAt,
    liveSeconds: savedExit.endedFocusSeconds ?? own.liveSeconds,
  } } : rawTimerViews, [savedExit, currentUserId, own, rawTimerViews]);
  const collectiveSeconds = Math.max(0, rt.collectiveSeconds - Math.max(0, (own?.liveSeconds ?? 0) - (savedExit?.endedFocusSeconds ?? own?.liveSeconds ?? 0)));
  useEffect(() => {
    if (!currentUserId) return;
    return getTimerSync(currentUserId).subscribe(() => setExitRevision(value => value + 1));
  }, [currentUserId]);
  const refreshPartyRef = useRef(rt.refresh);
  useEffect(() => { refreshPartyRef.current = rt.refresh; }, [rt.refresh]);
  useEffect(() => {
    const onSync = (event: Event) => {
      if ((event as CustomEvent<{ ownerId: number }>).detail?.ownerId === currentUserId) void refreshPartyRef.current();
    };
    window.addEventListener(TIMER_SYNC_EVENT, onSync);
    return () => window.removeEventListener(TIMER_SYNC_EVENT, onSync);
  }, [currentUserId]);

  const myTimerView = useMemo<MemberTimerView | null>(() => {
    if (!currentUserId || !timerViews[currentUserId]) return null;
    return timerViews[currentUserId];
  }, [currentUserId, timerViews]);

  const myTimerState: FocusTimerState = savedExit?.endedAt ? "LEFT" : myParticipant?.timerState ?? "NOT_STARTED";
  const myLiveSeconds: number = savedExit?.endedFocusSeconds ?? myTimerView?.liveSeconds ?? myParticipant?.accumulatedSeconds ?? 0;

  const combinedError = actionError || rt.error;
  const isLoading = isInitialLoading || (Boolean(partyId) && rt.isLoading && !party);

  // ─── 4. Safe Action Dispatchers (Concurrency & Double-Submit Guarded) ────
  const isSubmittingRef = useRef(false);

  const executeAction = useCallback(async <T,>(
    actionFn: () => Promise<T>,
    onSuccess?: (res: T) => void
  ): Promise<{ success: boolean; error?: string; data?: T }> => {
    if (isSubmittingRef.current) {
      return { success: false, error: "Action already in progress" };
    }
    isSubmittingRef.current = true;
    setIsActionLoading(true);
    setActionError(null);

    try {
      const result = await actionFn();
      onSuccess?.(result);
      return { success: true, data: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setActionError(msg);
      return { success: false, error: msg };
    } finally {
      isSubmittingRef.current = false;
      setIsActionLoading(false);
    }
  }, []);

  const createParty = useCallback(
    async (name?: string) => {
      const res = await executeAction(async () => {
        const response = await fetchWithTimeout(fetch, "/api/focus-party", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name || "Focus Party" }),
        });
        const { data, error: parseErr } = await parseSafeJson(response, "Failed to create Focus Party");
        if (!response.ok || !data) {
          throw new Error(data?.error || parseErr || "Failed to create Focus Party");
        }
        return data as { success: boolean; partyId: number; leaderId: number; name: string };
      });

      if (res.success && res.data) {
        await fetchActivePartyOverview();
        setViewMode("lobby");
        return { success: true, partyId: res.data.partyId };
      }
      return { success: false, error: res.error };
    },
    [executeAction, fetchActivePartyOverview]
  );

  const joinParty = useCallback(
    async (targetPartyId: number) => {
      const res = await executeAction(async () => {
        const response = await fetchWithTimeout(fetch, `/api/focus-party/${targetPartyId}/join`, {
          method: "POST",
          credentials: "include",
        });
        const { data, error: parseErr } = await parseSafeJson(response, "Failed to join Focus Party");
        if (!response.ok || !data) {
          throw new Error(data?.error || parseErr || "Failed to join Focus Party");
        }
        return data;
      });

      if (res.success) {
        await fetchActivePartyOverview();
        setViewMode("lobby");
        return { success: true };
      }
      return { success: false, error: res.error };
    },
    [executeAction, fetchActivePartyOverview]
  );

  const leaveParty = useCallback(async () => {
    if (!partyId) return { success: false, error: "No active party" };

    const res = await executeAction(async () => {
      const result = await rt.leaveParty();
      if (!result.success) {
        throw new Error(result.error || "Failed to leave party");
      }
      return result;
    });

    if (res.success) {
      setPartySummary(null);
      setViewMode("lobby");
      await fetchActivePartyOverview();
      return { success: true };
    }
    return { success: false, error: res.error };
  }, [executeAction, partyId, rt, fetchActivePartyOverview]);

  const kickMember = useCallback(
    async (memberId: number) => {
      const res = await executeAction(async () => {
        const result = await rt.kickMember(memberId);
        if (!result.success) {
          throw new Error(result.error || "Failed to remove member");
        }
        return result;
      });
      return { success: res.success, error: res.error };
    },
    [executeAction, rt]
  );

  const inviteFriend = useCallback(
    async (friendId: number) => {
      const res = await executeAction(async () => {
        const result = await rt.inviteFriend(friendId);
        if (!result.success) {
          throw new Error(result.error || "Failed to send invitation");
        }
        return result;
      });
      return { success: res.success, error: res.error };
    },
    [executeAction, rt]
  );

  const respondToInvite = useCallback(
    async (inviteId: number, action: "ACCEPTED" | "DECLINED") => {
      const res = await executeAction(async () => {
        const response = await fetchWithTimeout(fetch, `/api/focus-party/invites/${inviteId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        });
        const { data, error: parseErr } = await parseSafeJson(response, `Failed to ${action.toLowerCase()} invite`);
        if (!response.ok || !data) {
          throw new Error(data?.error || parseErr || `Failed to ${action.toLowerCase()} invite`);
        }
        return data;
      });

      if (res.success) {
        await fetchActivePartyOverview();
        if (action === "ACCEPTED") {
          setViewMode("lobby");
        }
        return { success: true };
      }
      return { success: false, error: res.error };
    },
    [executeAction, fetchActivePartyOverview]
  );

  const enterFocus = useCallback(
    async (durationGoalMinutes?: number, title?: string) => {
      if (savedExit?.endedAt && !savedExit.settled) return { success: false, error: "Your previous focus room exit is still syncing. Rejoin when it finishes." };
      const res = await executeAction(async () => {
        const result = await rt.enterFocus(durationGoalMinutes, title);
        if (!result.success) {
          throw new Error(result.error || "Failed to enter Focus");
        }
        return result;
      });

      if (res.success) {
        setViewMode("room");
        return { success: true };
      }
      return { success: false, error: res.error };
    },
    [executeAction, rt, savedExit]
  );

  const startTimer = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.startTimer();
      if (!result.success) {
        throw new Error(result.error || "Failed to start timer");
      }
      return result;
    });
    return { success: res.success, error: res.error };
  }, [executeAction, rt]);

  const pauseTimer = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.pauseTimer();
      if (!result.success) {
        throw new Error(result.error || "Failed to pause timer");
      }
      return result;
    });
    return { success: res.success, error: res.error };
  }, [executeAction, rt]);

  const resumeTimer = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.resumeTimer();
      if (!result.success) {
        throw new Error(result.error || "Failed to resume timer");
      }
      return result;
    });
    return { success: res.success, error: res.error };
  }, [executeAction, rt]);

  const leaveFocus = useCallback(async () => {
    if (!currentUserId || !partyId || !session || !joinedAt || !exitKey) return { success: false, error: "Couldn't identify this focus room. Refresh its accepted state and retry." };
    try {
      const sync = getTimerSync(currentUserId);
      sync.create({ ownerId: currentUserId, clientKey: exitKey, kind: "party", partyId, sessionId: session.id,
        startedAt: normalizeFocusTimestamp(session.startedAt)!, participationJoinedAt: joinedAt });
      sync.finish(exitKey, myLiveSeconds, 0);
      setViewMode("lobby");
      return { success: true };
    } catch {
      const error = "Couldn't save the focus room exit on this device. Free some device storage and retry.";
      setActionError(error); return { success: false, error };
    }
  }, [currentUserId, partyId, session, joinedAt, exitKey, myLiveSeconds]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchActivePartyOverview(), rt.refresh()]);
  }, [fetchActivePartyOverview, rt]);

  const clearError = useCallback(() => {
    setActionError(null);
  }, []);

  const shownSession = useMemo(() => savedExit?.endedAt && session && currentUserId ? { ...session, collectiveSeconds,
    members: session.members.map(member => member.userId === currentUserId ? { ...member, timerState: "LEFT" as const,
      isFocusing: false, currentStartedAt: null, liveSeconds: myLiveSeconds, leftAt: savedExit.endedAt } : member) } : session,
    [savedExit, session, currentUserId, collectiveSeconds, myLiveSeconds]);

  const value = useMemo<FocusPartyContextValue>(
    () => ({
      partySummary,
      party,
      session: shownSession,
      timerViews,
      collectiveSeconds,
      connectionState,
      pendingInvites,
      viewMode,
      setViewMode,
      isLoading,
      isActionLoading,
      error: combinedError,
      hasActiveParty,
      isLeader,
      isInFocus,
      myParticipant,
      myTimerView,
      myTimerState,
      myLiveSeconds,
      refresh,
      createParty,
      joinParty,
      leaveParty,
      kickMember,
      inviteFriend,
      respondToInvite,
      enterFocus,
      startTimer,
      pauseTimer,
      resumeTimer,
      leaveFocus,
      clearError,
    }),
    [
      partySummary,
      party,
      shownSession,
      timerViews,
      collectiveSeconds,
      connectionState,
      pendingInvites,
      viewMode,
      isLoading,
      isActionLoading,
      combinedError,
      hasActiveParty,
      isLeader,
      isInFocus,
      myParticipant,
      myTimerView,
      myTimerState,
      myLiveSeconds,
      refresh,
      createParty,
      joinParty,
      leaveParty,
      kickMember,
      inviteFriend,
      respondToInvite,
      enterFocus,
      startTimer,
      pauseTimer,
      resumeTimer,
      leaveFocus,
      clearError,
    ]
  );

  return (
    <FocusPartyContext.Provider value={value}>
      {children}
    </FocusPartyContext.Provider>
  );
}

export function useFocusParty(): FocusPartyContextValue {
  const context = useContext(FocusPartyContext);
  if (!context) {
    throw new Error("useFocusParty must be used within a FocusPartyProvider");
  }
  return context;
}
