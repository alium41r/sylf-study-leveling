// ============================================================================
// Focus Party — Type Definitions & State Contracts
// ============================================================================
// Authoritative TypeScript interfaces and normalized state representations for
// Focus Party multiplayer study sessions. Reuses Prisma enums and database
// models while providing clean presentation views for frontend consumers.
// ============================================================================

export type FocusTimerState = "NOT_STARTED" | "FOCUSING" | "PAUSED" | "LEFT";

export type FocusPartyErrorCode =
  | "PARTY_NOT_FOUND"
  | "PARTY_FULL"
  | "PARTY_DISBANDED"
  | "INVITE_REQUIRED"
  | "NOT_PARTY_MEMBER"
  | "NOT_PARTY_LEADER"
  | "SESSION_NOT_FOUND"
  | "SESSION_ENDED"
  | "NOT_SESSION_PARTICIPANT"
  | "INVALID_TIMER_TRANSITION"
  | "CANNOT_REMOVE_SELF"
  | "USER_ALREADY_IN_PARTY"
  | "FRIEND_REQUIRED"
  | "USER_BLOCKED"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export interface FocusPartyError {
  code: FocusPartyErrorCode;
  message: string;
  statusCode: number;
}

export type FocusPartyResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; error: FocusPartyError; data?: never };

// ─── Entity Contracts ─────────────────────────────────────────

export interface FocusPartyEntity {
  id: number;
  name: string;
  leaderId: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  disbandedAt?: Date | string | null;
}

export interface FocusPartyMemberEntity {
  id: number;
  partyId: number;
  userId: number;
  joinedAt: Date | string;
}

export interface FocusSessionEntity {
  id: number;
  partyId: number;
  startedAt: Date | string;
  endedAt?: Date | string | null;
}

export interface FocusSessionMemberEntity {
  id: number;
  sessionId: number;
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt?: Date | string | null;
  joinedAt: Date | string;
  leftAt?: Date | string | null;
  lastHeartbeatAt?: Date | string | null;
}

// ─── Normalized View Contracts ────────────────────────────────

export interface FocusPartyMemberView {
  userId: number;
  username: string;
  name: string | null;
  hunterRank: string;
  avatarUrl: string | null;
  characterConfig: unknown;
  joinedAt: string;
  isLeader: boolean;
}

export interface MemberTimerView {
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt: string | null;
  joinedAt?: string;
  leftAt?: string | null;
  liveSeconds: number;
  isFocusing: boolean;
}

export interface FocusSessionView {
  id: number;
  startedAt: string;
  collectiveSeconds: number;
  members: MemberTimerView[];
}

export interface FocusPartySummaryView {
  id: number;
  name: string;
  leaderId: number;
  createdAt: string;
  updatedAt: string;
  disbandedAt: string | null;
  isCurrentUserLeader: boolean;
  memberCount: number;
}

export interface FocusPartyStateView {
  party: FocusPartySummaryView;
  members: FocusPartyMemberView[];
  activeSession: FocusSessionView | null;
}

export interface FocusPartyInviteView {
  id: number;
  partyId: number;
  partyName: string;
  senderId: number;
  senderName: string | null;
  senderUsername: string;
  senderAvatarUrl: string | null;
  createdAt: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
}

// ─── Realtime Event Contracts ─────────────────────────────────

export type FocusPartyRealtimeEventType =
  | "MEMBER_JOINED"
  | "MEMBER_LEFT"
  | "MEMBER_REMOVED"
  | "LEADER_CHANGED"
  | "PARTY_DISBANDED"
  | "SESSION_STARTED"
  | "PARTICIPANT_ENTERED"
  | "PARTICIPANT_LEFT"
  | "SESSION_ENDED"
  | "TIMER_STARTED"
  | "TIMER_PAUSED"
  | "TIMER_RESUMED";

export interface FocusPartyRealtimeEvent {
  type: FocusPartyRealtimeEventType;
  partyId: number;
  sessionId?: number;
  userId?: number;
  timestamp: string;
  payload?: Record<string, unknown>;
}

// ─── Pure Timer Derivation Helpers (Client & Server Safe) ─────

/**
 * Derives current live focus duration from authoritative timestamps.
 * Formula:
 *   accumulatedSeconds + (now - currentStartedAt) when FOCUSING
 */
export function deriveMemberTimer(
  accumulatedSeconds: number,
  currentStartedAt: Date | string | null,
  timerState: FocusTimerState,
  nowMs: number = Date.now()
): { liveSeconds: number; isFocusing: boolean } {
  const isFocusing = timerState === "FOCUSING" && currentStartedAt !== null;
  let elapsed = 0;

  if (isFocusing && currentStartedAt) {
    const startedMs = new Date(currentStartedAt).getTime();
    elapsed = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  }

  return {
    liveSeconds: Math.max(0, (accumulatedSeconds || 0) + elapsed),
    isFocusing,
  };
}

/**
 * Calculates collective focus seconds for all participants in a session.
 */
export function deriveCollectiveSeconds(
  members: Array<{
    accumulatedSeconds: number;
    currentStartedAt: Date | string | null;
    timerState: FocusTimerState;
  }>,
  nowMs: number = Date.now()
): number {
  return members.reduce((sum, m) => {
    const { liveSeconds } = deriveMemberTimer(
      m.accumulatedSeconds,
      m.currentStartedAt,
      m.timerState,
      nowMs
    );
    return sum + liveSeconds;
  }, 0);
}
