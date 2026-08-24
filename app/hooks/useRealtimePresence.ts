"use client";

// ============================================================================
// useRealtimePresence — Supabase Realtime presence for online/offline status.
// ============================================================================
// Joins the shared `presence:global` channel and tracks { id: <userId> }.
// Every connected client appears in onlineUserIds within ~1s of opening the
// app and disappears on close/refresh — no DB writes, no 60s heartbeat lag.
//
// Graceful degradation: when Supabase env keys are missing or the minted-JWT
// route reports disabled, this hook is a no-op and callers keep using the
// API's lastSeenAt-based isOnline flag.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/app/components/AuthProvider";
import {
  attachRealtimeAuth,
  isRealtimeConfigured,
} from "@/lib/supabase-browser";
import { setRealtimeStatus } from "@/lib/realtime-status";

const PRESENCE_CHANNEL = "presence:global";

export interface RealtimePresence {
  /** Supabase env configured and JWT minted — channel was attempted. */
  enabled: boolean;
  /** Channel currently SUBSCRIBED (live presence sync). */
  connected: boolean;
  /** User ids currently connected to the presence channel. */
  onlineUserIds: Set<number>;
}

export function useRealtimePresence(): RealtimePresence {
  const { user, token } = useAuth();
  const userId = user?.id;

  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

  const enabledRef = useRef(false);

  useEffect(() => {
    if (!token || !userId || !isRealtimeConfigured()) {
      setRealtimeStatus({ enabled: false, connected: false });
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const collectPresence = (ch: RealtimeChannel | null) => {
      if (!ch) return;
      const ids = new Set<number>();
      for (const [, states] of Object.entries(
        ch.presenceState<{ id?: number; ts?: number }>()
      )) {
        for (const state of states) {
          if (typeof state?.id === "number") ids.add(state.id);
        }
      }
      if (!cancelled) setOnlineUserIds(ids);
    };

    (async () => {
      const sb = await attachRealtimeAuth(token);
      if (!sb || cancelled) return;
      if (!enabledRef.current) {
        enabledRef.current = true;
        setEnabled(true);
      }

      channel = sb.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: String(userId) } },
      });

      channel.on("presence", { event: "sync" }, () => collectPresence(channel));
      channel.on("presence", { event: "join" }, () => collectPresence(channel));
      channel.on("presence", { event: "leave" }, () => collectPresence(channel));

      channel.subscribe(async (status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          setRealtimeStatus({ enabled: true, connected: true });
          await channel?.track({ id: userId, ts: Date.now() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
          setRealtimeStatus({ enabled: true, connected: false });
        }
      });
    })().catch((err) => {
      console.warn("[realtime] presence join failed — falling back to heartbeat:", err);
    });

    return () => {
      cancelled = true;
      try {
        if (channel) {
          channel.untrack().catch(() => {});
          channel.unsubscribe();
        }
      } catch {
        // Channel already torn down.
      }
      setConnected(false);
      setRealtimeStatus({ enabled: false, connected: false });
    };
  }, [token, userId]);

  return { enabled, connected, onlineUserIds };
}
