"use client";

// ============================================================================
// useFocusPartyRealtime — Supabase Realtime Foundation for Focus Party
// ============================================================================
// Manages real-time synchronization, state derivations, and authoritative
// action dispatching for Focus Party multiplayer sessions.
//
// Key architectural guarantees:
// 1. Zero polling for timers: local ticking is computed via pure epoch math
//    (deriveMemberTimer) and ticks locally only when a member is FOCUSING.
// 2. Dual-resync strategy: authoritative state is refetched on reconnect,
//    network 'online' events, and document visibility changes.
// 3. Clean teardown: unsubscribes from Supabase channels on unmount.
// 4. Decoupled from visuals: returns clean state and action dispatchers.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { attachRealtimeAuth, isRealtimeConfigured } from "@/lib/supabase-browser";
import {
  deriveMemberTimer,
  deriveCollectiveSeconds,
  type FocusPartyStateView,
  type FocusSessionView,
  type MemberTimerView,
  type FocusPartyRealtimeEvent,
} from "@/lib/focus-party-types";

export type RealtimeConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting";

export interface UseFocusPartyRealtimeOptions {
  enabled?: boolean;
  onEvent?: (event: FocusPartyRealtimeEvent) => void;
}

export interface UseFocusPartyRealtimeReturn {
  // Authoritative State
  party: FocusPartyStateView | null;
  session: FocusSessionView | null;
  timerViews: Record<number, MemberTimerView>;
  collectiveSeconds: number;
  connectionState: RealtimeConnectionState;
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: Date | null;

  // Action Dispatchers
  refresh: () => Promise<void>;
  startTimer: () => Promise<{ success: boolean; error?: string }>;
  pauseTimer: () => Promise<{ success: boolean; error?: string }>;
  resumeTimer: () => Promise<{ success: boolean; error?: string }>;
  leaveFocus: () => Promise<{ success: boolean; error?: string }>;
  enterFocus: (durationGoalMinutes?: number, title?: string) => Promise<{ success: boolean; error?: string }>;
  leaveParty: () => Promise<{ success: boolean; error?: string }>;
  kickMember: (memberId: number) => Promise<{ success: boolean; error?: string }>;
  inviteFriend: (friendId: number) => Promise<{ success: boolean; error?: string }>;
}

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

export function useFocusPartyRealtime(
  partyId: number | null,
  currentUserId: number | null,
  options: UseFocusPartyRealtimeOptions = {}
): UseFocusPartyRealtimeReturn {
  const { enabled = true, onEvent } = options;

  const [party, setParty] = useState<FocusPartyStateView | null>(null);
  const [session, setSession] = useState<FocusSessionView | null>(null);
  const [timerViews, setTimerViews] = useState<Record<number, MemberTimerView>>({});
  const [collectiveSeconds, setCollectiveSeconds] = useState(0);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("disconnected");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);
  const isSyncingRef = useRef(false);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Authoritative State Fetcher (REST)
  // ──────────────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!partyId || !isMountedRef.current || isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const [partyRes, sessionRes] = await Promise.all([
        fetch(`/api/focus-party/${partyId}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/focus-party/${partyId}/session`, { credentials: "include", cache: "no-store" }),
      ]);

      if (!isMountedRef.current) return;

      if (!partyRes.ok) {
        const { data: errData, error: parseErr } = await parseSafeJson(partyRes, "Failed to load party state");
        setError((errData as any)?.error || parseErr || "Failed to load party state");
        return;
      }

      const { data: partyData, error: partyErr } = await parseSafeJson<FocusPartyStateView>(partyRes, "Invalid party state format");
      if (!partyData) {
        setError(partyErr || "Failed to load party state");
        return;
      }
      setParty(partyData);
      setError(null);

      if (sessionRes.ok) {
        const { data: sessionData } = await parseSafeJson(sessionRes, "Invalid session format");
        setSession((sessionData as any)?.session || null);
      } else {
        setSession(null);
      }

      setLastSyncedAt(new Date());
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || "Network error loading party state");
      }
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [partyId]);

  const lastRefreshMsRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshMsRef.current > 300) {
      lastRefreshMsRef.current = now;
      refresh();
    } else {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        lastRefreshMsRef.current = Date.now();
        refresh();
      }, 300);
    }
  }, [refresh]);

  // Initial fetch on mount or partyId change
  useEffect(() => {
    isMountedRef.current = true;
    if (partyId && enabled) {
      setIsLoading(true);
      refresh();
    } else {
      setParty(null);
      setSession(null);
      setTimerViews({});
      setCollectiveSeconds(0);
      setError(null);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [partyId, enabled, refresh]);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Pure Local Timer Interpolation (Zero Polling)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const participants: MemberTimerView[] = session?.members || [];
    const hasFocusingMember = participants.some((p) => p.timerState === "FOCUSING");

    // Compute initial view synchronously
    const computeTimers = () => {
      const nowMs = Date.now();
      const views: Record<number, MemberTimerView> = {};

      for (const p of participants) {
        const derived = deriveMemberTimer(
          p.accumulatedSeconds,
          p.currentStartedAt,
          p.timerState,
          nowMs
        );
        views[p.userId] = {
          userId: p.userId,
          timerState: p.timerState,
          accumulatedSeconds: p.accumulatedSeconds,
          currentStartedAt: p.currentStartedAt ? new Date(p.currentStartedAt).toISOString() : null,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          liveSeconds: derived.liveSeconds,
          isFocusing: derived.isFocusing,
        };
      }

      const collective = deriveCollectiveSeconds(
        participants.map((p) => ({
          accumulatedSeconds: p.accumulatedSeconds,
          currentStartedAt: p.currentStartedAt,
          timerState: p.timerState,
        })),
        nowMs
      );

      setTimerViews(views);
      setCollectiveSeconds(collective);
    };

    computeTimers();

    // If nobody is currently FOCUSING, don't run any interval at all!
    if (!hasFocusingMember) return;

    const intervalId = setInterval(computeTimers, 1000);
    return () => clearInterval(intervalId);
  }, [session]);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Supabase Realtime Subscription & Resilience Strategy
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // SECURITY GATE: Only subscribe if the caller is confirmed to be an active member
    const isAuthorizedMember =
      party &&
      party.party.id === partyId &&
      (!currentUserId || party.members.some((m) => m.userId === currentUserId));

    if (!partyId || !enabled || !isRealtimeConfigured() || !isAuthorizedMember || error) {
      setConnectionState("disconnected");
      return;
    }

    let isCancelled = false;
    setConnectionState("connecting");

    (async () => {
      const sb = await attachRealtimeAuth();
      if (!sb || isCancelled) {
        if (!isCancelled) setConnectionState("disconnected");
        return;
      }

      // Unique channel identifier for this party room
      const channelName = `focus-party:${partyId}`;
      const channel = sb.channel(channelName);
      channelRef.current = channel;

      // Listen for database changes on FocusParty
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "FocusParty",
          filter: `id=eq.${partyId}`,
        },
        () => {
          if (!isCancelled) debouncedRefresh();
        }
      );

      // Listen for membership changes (joins, leaves, kicks)
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "FocusPartyMember",
          filter: `partyId=eq.${partyId}`,
        },
        () => {
          if (!isCancelled) debouncedRefresh();
        }
      );

      // Listen for session changes
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "FocusSession",
          filter: `partyId=eq.${partyId}`,
        },
        () => {
          if (!isCancelled) debouncedRefresh();
        }
      );

      // Listen for participant timer state changes
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "FocusSessionMember",
        },
        () => {
          if (!isCancelled) debouncedRefresh();
        }
      );

      // Listen for ephemeral broadcast events (instant room notifications)
      channel.on(
        "broadcast" as any,
        { event: "party_event" },
        (msg: { payload?: FocusPartyRealtimeEvent }) => {
          if (isCancelled || !msg.payload) return;
          // Validate payload matches current room
          if (msg.payload.partyId !== partyId) return;
          if (onEvent) onEvent(msg.payload);
          debouncedRefresh();
        }
      );

      // Subscribe and track connection lifecycle
      channel.subscribe((status) => {
        if (isCancelled) return;
        if (status === "SUBSCRIBED") {
          setConnectionState("connected");
          // Always re-sync on fresh subscription
          refresh();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setConnectionState("reconnecting");
        } else if (status === "TIMED_OUT") {
          setConnectionState("disconnected");
        }
      });
    })().catch(() => {
      if (!isCancelled) setConnectionState("disconnected");
    });

    // ────────────────────────────────────────────────────────────────────────
    // Resync Strategy: Network 'online' & Document 'visibilitychange'
    // ────────────────────────────────────────────────────────────────────────
    const handleOnline = () => {
      if (!isCancelled) {
        setConnectionState("reconnecting");
        refresh();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !isCancelled) {
        // Tab brought to foreground: reconcile authoritative timestamps
        refresh();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isCancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);

      if (channelRef.current) {
        try {
          channelRef.current.unsubscribe();
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
      setConnectionState("disconnected");
    };
  }, [partyId, enabled, refresh, onEvent]);

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Action Dispatchers
  // ──────────────────────────────────────────────────────────────────────────
  const dispatchTimerAction = async (action: "start" | "pause" | "resume" | "leave") => {
    if (!partyId) return { success: false, error: "No active party" };
    try {
      const res = await fetch(`/api/focus-party/${partyId}/session/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const { data, error: parseError } = await parseSafeJson(res, "Timer action failed");
      if (!res.ok) {
        return { success: false, error: (data as any)?.error || parseError || "Timer action failed" };
      }
      await refresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const startTimer = useCallback(() => dispatchTimerAction("start"), [partyId, refresh]);
  const pauseTimer = useCallback(() => dispatchTimerAction("pause"), [partyId, refresh]);
  const resumeTimer = useCallback(() => dispatchTimerAction("resume"), [partyId, refresh]);
  const leaveFocus = useCallback(() => dispatchTimerAction("leave"), [partyId, refresh]);

  const enterFocus = useCallback(
    async (durationGoalMinutes?: number, title?: string) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetch(`/api/focus-party/${partyId}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ durationGoalMinutes, title }),
        });
        const { data, error: parseError } = await parseSafeJson(res, "Enter focus failed");
        if (!res.ok) {
          return { success: false, error: (data as any)?.error || parseError || "Enter focus failed" };
        }
        await refresh();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || "Network error" };
      }
    },
    [partyId, refresh]
  );

  const leaveParty = useCallback(async () => {
    if (!partyId) return { success: false, error: "No active party" };
    try {
      const res = await fetch(`/api/focus-party/${partyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const { data, error: parseError } = await parseSafeJson(res, "Failed to leave party");
      if (!res.ok) {
        return { success: false, error: (data as any)?.error || parseError || "Failed to leave party" };
      }
      setParty(null);
      setSession(null);
      setTimerViews({});
      setCollectiveSeconds(0);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  }, [partyId]);

  const kickMember = useCallback(
    async (memberId: number) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetch(`/api/focus-party/${partyId}/members/${memberId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const { data, error: parseError } = await parseSafeJson(res, "Failed to remove member");
        if (!res.ok) {
          return { success: false, error: (data as any)?.error || parseError || "Failed to remove member" };
        }
        await refresh();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || "Network error" };
      }
    },
    [partyId, refresh]
  );

  const inviteFriend = useCallback(
    async (friendId: number) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetch(`/api/focus-party/${partyId}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ friendId }),
        });
        const { data, error: parseError } = await parseSafeJson(res, "Failed to send invite");
        if (!res.ok) {
          return { success: false, error: (data as any)?.error || parseError || "Failed to send invite" };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || "Network error" };
      }
    },
    [partyId]
  );

  return {
    party,
    session,
    timerViews,
    collectiveSeconds,
    connectionState,
    isLoading,
    error,
    lastSyncedAt,
    refresh,
    startTimer,
    pauseTimer,
    resumeTimer,
    leaveFocus,
    enterFocus,
    leaveParty,
    kickMember,
    inviteFriend,
  };
}
