// ============================================================
// Session Duration & Reward Math — SINGLE SOURCE OF TRUTH
// ============================================================
// Mirrors the SQL in public.complete_study_session (migration
// 20260823020000_fix_session_duration_inflation) so client
// clamping, delta accounting, and canonical reward parity are
// verifiable in unit tests.
//
// Invariants:
//  - N seconds of active focus record as exactly N seconds.
//  - Lifetime totals advance only by DELTA since last credit.
//  - XP    = FLOOR(5 × minutes × sessionMultiplier)
//  - Sylph = MAX(5, FLOOR(0.5 × minutes × streakMultiplier))
// ============================================================

/** Server-side grace window added on top of wall-clock elapsed time. */
export const SESSION_GRACE_SECONDS = 60;

/**
 * Server-side timestamp clamping: the claimed duration can never exceed
 * (now - startedAt) plus a small grace window. Prevents client spoofing
 * and unit-mismatch inflation (seconds passed as minutes, etc.).
 */
export function clampSessionSeconds(
  claimedSeconds: number,
  startedAtMs: number,
  serverNowMs: number = Date.now()
): number {
  if (!Number.isFinite(claimedSeconds)) return 0;
  if (!Number.isFinite(startedAtMs)) return Math.max(0, Math.floor(claimedSeconds));
  const claimed = Math.max(0, Math.floor(claimedSeconds));
  const elapsed = Math.max(0, Math.floor((serverNowMs - startedAtMs) / 1000));
  return Math.min(claimed, elapsed + SESSION_GRACE_SECONDS);
}

/**
 * Exact delta of newly-credited seconds since the previous credit.
 * Repeated cumulative flushes (180, 360, 540, ... 10800) therefore
 * credit exactly 10800 seconds in total.
 */
export function sessionDeltaSeconds(previousSeconds: number, newSeconds: number): number {
  return Math.max(0, Math.floor(newSeconds || 0) - Math.floor(previousSeconds || 0));
}

/** Long-session xpMultiplier (canonical ladder). */
export function sessionMultiplierForSeconds(seconds: number): number {
  const minutes = seconds / 60;
  if (minutes >= 120) return 1.3;
  if (minutes >= 60) return 1.2;
  if (minutes >= 30) return 1.1;
  return 1.0;
}

/** Weekly-streak sylphMultiplier (canonical ladder, capped at 1.5x). */
export function streakMultiplierForWeeks(streakWeeks: number): number {
  if (streakWeeks >= 8) return 1.5;
  if (streakWeeks >= 4) return 1.3;
  if (streakWeeks >= 2) return 1.15;
  if (streakWeeks >= 1) return 1.05;
  return 1.0;
}

export interface SessionReward {
  xp: number;
  sylph: number;
  minutes: number;
  sessionMultiplier: number;
  streakMultiplier: number;
}

/**
 * Canonical session payout for a FULL session duration:
 *   XP    = FLOOR(5 × minutes × sessionMultiplier)
 *   Sylph = MAX(5, FLOOR(0.5 × minutes × streakMultiplier))
 * Sessions under 60 seconds award nothing.
 */
export function canonicalSessionRewards(seconds: number, streakWeeks: number = 0): SessionReward {
  const sec = Math.max(0, Math.floor(seconds));
  const minutes = sec / 60;
  const sessionMultiplier = sessionMultiplierForSeconds(sec);
  const streakMultiplier = streakMultiplierForWeeks(streakWeeks);

  if (sec < 60) {
    return { xp: 0, sylph: 0, minutes, sessionMultiplier, streakMultiplier };
  }

  const xp = Math.floor(5 * minutes * sessionMultiplier);
  const sylph = Math.max(5, Math.floor(0.5 * minutes * streakMultiplier));

  return { xp, sylph, minutes, sessionMultiplier, streakMultiplier };
}
