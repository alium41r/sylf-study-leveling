// ============================================================
// Timer Tab Leadership — single-writer coordination helpers
// ============================================================
// Pure, unit-testable lease logic used by useTimerLeadership().
//
// Multi-tab model:
//  • PRIMARY tab (Web Locks winner / lease holder) owns session creation
//    and all PATCH flushes.
//  • MIRROR tabs derive and display the same epoch-anchored state but
//    never write to the server; an explicit user action (pause/end/
//    complete) takes over leadership first.
//  • The server remains the final authority: settle_study_session_atomic
//    row-locks, delta-accounts, and keeps stored durations monotonic, so
//    even a buggy double-writer can never double-credit time.
// ============================================================

export interface TimerLease {
  id: string;
  ts: number;
}

/** A lease is stale after this long without a heartbeat. */
export const LEASE_TTL_MS = 4000;

export function readLease(raw: string | null): TimerLease | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (typeof p?.id === "string" && typeof p?.ts === "number") {
      return { id: p.id, ts: p.ts };
    }
  } catch { /* corrupt lease — treat as absent */ }
  return null;
}

export function serializeLease(id: string, ts: number): string {
  return JSON.stringify({ id, ts });
}

/** True when the lease is held by `myId` and is still fresh. */
export function leaseIsHeldBy(lease: TimerLease | null, nowMs: number, myId: string): boolean {
  if (!lease) return false;
  return lease.id === myId && nowMs - lease.ts <= LEASE_TTL_MS;
}

/** True when nobody holds a fresh lease (expired or absent). */
export function leaseExpired(lease: TimerLease | null, nowMs: number): boolean {
  return !lease || nowMs - lease.ts > LEASE_TTL_MS;
}

/** True when a fresh lease is held by some OTHER tab. */
export function leaseHeldByOther(lease: TimerLease | null, nowMs: number, myId: string): boolean {
  return !leaseExpired(lease, nowMs) && !leaseIsHeldBy(lease, nowMs, myId);
}
