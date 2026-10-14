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
import { fetchWithTimeout } from "@/lib/api-transport";
import {
  deriveMemberTimer,
  deriveCollectiveSeconds,
  normalizeFocusTimestamp,
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

interface PartyResponse { error?: string; session?: FocusSessionView | null }

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
  const generationRef = useRef(0);
  const syncingGenerationRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Authoritative State Fetcher (REST)
  // ──────────────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    if (!partyId || !enabled || !currentUserId || !isMountedRef.current || syncingGenerationRef.current === generation) return;
    syncingGenerationRef.current = generation;

    try {
      const [partyRes, sessionRes] = await Promise.all([
        fetchWithTimeout(fetch, `/api/focus-party/${partyId}`, { credentials: "include", cache: "no-store" }),
        fetchWithTimeout(fetch, `/api/focus-party/${partyId}/session`, { credentials: "include", cache: "no-store" }),
      ]);

      if (!isMountedRef.current || generation !== generationRef.current) return;

      if (!partyRes.ok) {
        const { data: errData, error: parseErr } = await parseSafeJson(partyRes, "Failed to load party state");
        setError(errData?.error || parseErr || "Failed to load party state");
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
        setSession(sessionData?.session || null);
      } else {
        // A transient session read must not erase an accepted running timer.
        setError("Couldn't refresh the focus room. Reconnecting automatically.");
      }

      setLastSyncedAt(new Date());
    } catch (err) {
      if (isMountedRef.current && generation === generationRef.current) {
        setError(err instanceof Error ? err.message : "Network error loading party state");
      }
    } finally {
      if (syncingGenerationRef.current === generation) syncingGenerationRef.current = null;
      if (isMountedRef.current && generation === generationRef.current) {
        setIsLoading(false);
      }
    }
  }, [partyId, currentUserId, enabled]);

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
    const generation = ++generationRef.current;
    queueMicrotask(() => {
      if (generation !== generationRef.current) return;
      setParty(null);
      setSession(null);
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
      });
    return () => {
      isMountedRef.current = false;
      generationRef.current = generation + 1;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [partyId, currentUserId, enabled, refresh]);

  // Keep REST recovery available when Realtime is absent, disconnected, or the
  // initial read failed. Epoch interpolation still owns the one-second ticks.
  useEffect(() => {
    if (!partyId || !enabled || !currentUserId) return;
    const online = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && (connectionState !== "connected" || error)) void refresh();
    }, 15_000);
    window.addEventListener("online", online);
    window.addEventListener("pageshow", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("pageshow", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [partyId, currentUserId, enabled, connectionState, error, refresh]);

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
          currentStartedAt: normalizeFocusTimestamp(p.currentStartedAt),
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
  const isAuthorizedMember = Boolean(party && party.party.id === partyId && currentUserId && party.members.some((m) => m.userId === currentUserId));
  useEffect(() => {

    let isCancelled = false;
    if (!partyId || !enabled || !isRealtimeConfigured() || !isAuthorizedMember) {
      queueMicrotask(() => { if (!isCancelled) setConnectionState("disconnected"); });
      return () => { isCancelled = true; };
    }

    queueMicrotask(() => { if (!isCancelled) setConnectionState("connecting"); });

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
        "broadcast",
        { event: "party_event" },
        (msg) => {
          const event = msg.payload as FocusPartyRealtimeEvent | undefined;
          if (isCancelled || !event) return;
          // Validate payload matches current room
          if (event.partyId !== partyId) return;
          onEventRef.current?.(event);
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

    return () => {
      isCancelled = true;

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
  }, [partyId, enabled, isAuthorizedMember, refresh, debouncedRefresh]);

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Action Dispatchers
  // ──────────────────────────────────────────────────────────────────────────
  const sessionId = session?.id;
  const dispatchTimerAction = useCallback(async (action: "start" | "pause" | "resume" | "leave") => {
    if (!partyId) return { success: false, error: "No active party" };
    try {
      const res = await fetchWithTimeout(fetch, `/api/focus-party/${partyId}/session/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, sessionId, expectedOwnerId: currentUserId }),
      });
      const { data, error: parseError } = await parseSafeJson(res, "Timer action failed");
      if (!res.ok) {
        return { success: false, error: data?.error || parseError || "Timer action failed" };
      }
      await refresh();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }, [partyId, currentUserId, sessionId, refresh]);

  const startTimer = useCallback(() => dispatchTimerAction("start"), [dispatchTimerAction]);
  const pauseTimer = useCallback(() => dispatchTimerAction("pause"), [dispatchTimerAction]);
  const resumeTimer = useCallback(() => dispatchTimerAction("resume"), [dispatchTimerAction]);
  const leaveFocus = useCallback(() => dispatchTimerAction("leave"), [dispatchTimerAction]);

  const enterFocus = useCallback(
    async (durationGoalMinutes?: number, title?: string) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetchWithTimeout(fetch, `/api/focus-party/${partyId}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ durationGoalMinutes, title }),
        });
        const { data, error: parseError } = await parseSafeJson(res, "Enter focus failed");
        if (!res.ok) {
          return { success: false, error: data?.error || parseError || "Enter focus failed" };
        }
        await refresh();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Network error" };
      }
    },
    [partyId, refresh]
  );

  const leaveParty = useCallback(async () => {
    if (!partyId) return { success: false, error: "No active party" };
    try {
      const res = await fetchWithTimeout(fetch, `/api/focus-party/${partyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const { data, error: parseError } = await parseSafeJson(res, "Failed to leave party");
      if (!res.ok) {
        return { success: false, error: data?.error || parseError || "Failed to leave party" };
      }
      setParty(null);
      setSession(null);
      setTimerViews({});
      setCollectiveSeconds(0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }, [partyId]);

  const kickMember = useCallback(
    async (memberId: number) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetchWithTimeout(fetch, `/api/focus-party/${partyId}/members/${memberId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const { data, error: parseError } = await parseSafeJson(res, "Failed to remove member");
        if (!res.ok) {
          return { success: false, error: data?.error || parseError || "Failed to remove member" };
        }
        await refresh();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Network error" };
      }
    },
    [partyId, refresh]
  );

  const inviteFriend = useCallback(
    async (friendId: number) => {
      if (!partyId) return { success: false, error: "No active party" };
      try {
        const res = await fetchWithTimeout(fetch, `/api/focus-party/${partyId}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ friendId }),
        });
        const { data, error: parseError } = await parseSafeJson(res, "Failed to send invite");
        if (!res.ok) {
          return { success: false, error: data?.error || parseError || "Failed to send invite" };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Network error" };
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
