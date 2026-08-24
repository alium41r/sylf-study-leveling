// ============================================================================
// Module-level realtime connectivity status (client-safe).
// ============================================================================
// Lets non-React code (e.g. useHeartbeat) react to presence connectivity:
// when a Realtime presence channel is live, DB heartbeat writes can slow way
// down (presence is the fast path; lastSeenAt becomes the durable fallback).
// ============================================================================

export interface RealtimeStatus {
  /** Configuration present (env keys) — feature can attempt to connect. */
  enabled: boolean;
  /** A Realtime channel is currently SUBSCRIBED. */
  connected: boolean;
}

let status: RealtimeStatus = { enabled: false, connected: false };
const listeners = new Set<() => void>();

export function getRealtimeStatus(): RealtimeStatus {
  return status;
}

export function setRealtimeStatus(next: Partial<RealtimeStatus>) {
  const updated = { ...status, ...next };
  if (updated.enabled === status.enabled && updated.connected === status.connected) return;
  status = updated;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A throwing subscriber must not break the notifier.
    }
  }
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
