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
import { useAuth } from "@/app/components/AuthProvider";
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

async function parseSafeJson<T = any>(
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

  const partyId = partyIdOverride ?? partySummary?.id ?? null;

  // ─── 1. Load User's Active Party & Pending Invites ───────────────────────
  const fetchActivePartyOverview = useCallback(async () => {
    if (!currentUserId) {
      setPartySummary(null);
      setPendingInvites([]);
      setIsInitialLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/focus-party", { credentials: "include", cache: "no-store" });
      const { data, error: parseErr } = await parseSafeJson(res, "Failed to load focus party");
      if (res.ok && data) {
        setPartySummary(data.activeParty || null);
        setPendingInvites(Array.isArray(data.pendingInvites) ? data.pendingInvites : []);
        setActionError(null);
      } else {
        setActionError(data?.error || parseErr || "Failed to load focus party");
      }
    } catch (err: any) {
      setActionError(err.message || "Network error loading focus party");
    } finally {
      setIsInitialLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchActivePartyOverview();
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
    if (rt.party?.party) {
      setPartySummary(rt.party.party);
    } else if (partyId && !rt.isLoading && rt.error && rt.error.includes("disbanded")) {
      setPartySummary(null);
      setViewMode("lobby");
    }
  }, [rt.party, rt.isLoading, rt.error, partyId]);

  // Keep viewMode synced with party existence
  useEffect(() => {
    if (!rt.party && !rt.isLoading && !rt.error && !partyId) {
      setViewMode("lobby");
    }
  }, [rt.party, rt.isLoading, rt.error, partyId]);

  // ─── 3. Derived State Helpers ───────────────────────────────────────────
  const party = rt.party;
  const session = rt.session;
  const timerViews = rt.timerViews;
  const collectiveSeconds = rt.collectiveSeconds;
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

  const isInFocus = Boolean(myParticipant && myParticipant.timerState !== "LEFT");

  const myTimerView = useMemo<MemberTimerView | null>(() => {
    if (!currentUserId || !timerViews[currentUserId]) return null;
    return timerViews[currentUserId];
  }, [currentUserId, timerViews]);

  const myTimerState: FocusTimerState = myParticipant?.timerState ?? "NOT_STARTED";
  const myLiveSeconds: number = myTimerView?.liveSeconds ?? myParticipant?.accumulatedSeconds ?? 0;

  const combinedError = actionError || rt.error;
  const isLoading = isInitialLoading || (Boolean(partyId) && rt.isLoading && !party);

  // ─── 4. Safe Action Dispatchers (Concurrency & Double-Submit Guarded) ────
  const isSubmittingRef = useRef(false);

  const executeAction = async <T,>(
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
    } catch (err: any) {
      const msg = err.message || "An error occurred";
      setActionError(msg);
      return { success: false, error: msg };
    } finally {
      isSubmittingRef.current = false;
      setIsActionLoading(false);
    }
  };

  const createParty = useCallback(
    async (name?: string) => {
      const res = await executeAction(async () => {
        const response = await fetch("/api/focus-party", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name || "Focus Party" }),
        });
        const { data, error: parseErr } = await parseSafeJson(response, "Failed to create Focus Party");
        if (!response.ok || !data) {
          throw new Error((data as any)?.error || parseErr || "Failed to create Focus Party");
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
    [fetchActivePartyOverview]
  );

  const joinParty = useCallback(
    async (targetPartyId: number) => {
      const res = await executeAction(async () => {
        const response = await fetch(`/api/focus-party/${targetPartyId}/join`, {
          method: "POST",
          credentials: "include",
        });
        const { data, error: parseErr } = await parseSafeJson(response, "Failed to join Focus Party");
        if (!response.ok || !data) {
          throw new Error((data as any)?.error || parseErr || "Failed to join Focus Party");
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
    [fetchActivePartyOverview]
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
  }, [partyId, rt, fetchActivePartyOverview]);

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
    [rt]
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
    [rt]
  );

  const respondToInvite = useCallback(
    async (inviteId: number, action: "ACCEPTED" | "DECLINED") => {
      const res = await executeAction(async () => {
        const response = await fetch(`/api/focus-party/invites/${inviteId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        });
        const { data, error: parseErr } = await parseSafeJson(response, `Failed to ${action.toLowerCase()} invite`);
        if (!response.ok || !data) {
          throw new Error((data as any)?.error || parseErr || `Failed to ${action.toLowerCase()} invite`);
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
    [fetchActivePartyOverview]
  );

  const enterFocus = useCallback(
    async (durationGoalMinutes?: number, title?: string) => {
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
    [rt]
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
  }, [rt]);

  const pauseTimer = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.pauseTimer();
      if (!result.success) {
        throw new Error(result.error || "Failed to pause timer");
      }
      return result;
    });
    return { success: res.success, error: res.error };
  }, [rt]);

  const resumeTimer = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.resumeTimer();
      if (!result.success) {
        throw new Error(result.error || "Failed to resume timer");
      }
      return result;
    });
    return { success: res.success, error: res.error };
  }, [rt]);

  const leaveFocus = useCallback(async () => {
    const res = await executeAction(async () => {
      const result = await rt.leaveFocus();
      if (!result.success) {
        throw new Error(result.error || "Failed to leave focus");
      }
      return result;
    });

    if (res.success) {
      setViewMode("lobby");
      return { success: true };
    }
    return { success: false, error: res.error };
  }, [rt]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchActivePartyOverview(), rt.refresh()]);
  }, [fetchActivePartyOverview, rt]);

  const clearError = useCallback(() => {
    setActionError(null);
  }, []);

  const value = useMemo<FocusPartyContextValue>(
    () => ({
      partySummary,
      party,
      session,
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
      session,
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
