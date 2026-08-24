"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../components/AuthProvider";
import {
  getRealtimeStatus,
  subscribeRealtimeStatus,
} from "../../lib/realtime-status";

/**
 * Sends a heartbeat to the server to track online presence.
 *
 * Fast path: when a Supabase Realtime presence channel is live (see
 * useRealtimePresence), online/offline state comes from the presence channel
 * and the DB heartbeat only runs every 5 minutes to keep `lastSeenAt` fresh
 * as a durable fallback. Without Realtime configured it stays on the classic
 * 60-second cadence.
 */
export function useHeartbeat() {
  const { token } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;

    const sendHeartbeat = () => {
      fetch("/api/user/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // Silently fail
    };

    // Send immediately on mount — durable anchor for lastSeenAt.
    sendHeartbeat();

    const schedule = () => {
      const { connected } = getRealtimeStatus();
      return setInterval(sendHeartbeat, connected ? 5 * 60_000 : 60_000);
    };

    intervalRef.current = schedule();

    // Re-schedule when presence connectivity changes (joined/left the channel).
    const unsubscribe = subscribeRealtimeStatus(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = schedule();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      unsubscribe();
    };
  }, [token]);
}
