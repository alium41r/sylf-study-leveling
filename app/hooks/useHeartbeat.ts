"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../components/AuthProvider";

/**
 * Sends a heartbeat to the server every 60 seconds to track online presence.
 * Call this hook once in a top-level layout component.
 */
export function useHeartbeat() {
  const { token } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!token) return;

    const sendHeartbeat = () => {
      fetch("/api/user/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // Silently fail
    };

    // Send immediately on mount
    sendHeartbeat();

    // Then every 60 seconds
    intervalRef.current = setInterval(sendHeartbeat, 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);
}
