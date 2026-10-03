// ============================================================================
// Focus Party — Backend Service & Application Data Layer
// ============================================================================
// Provides type-safe server operations for Focus Parties and Focus Sessions.
// Uses PostgreSQL atomic RPCs to guarantee database invariants, lock order,
// and concurrency safety.
//
// Timer calculation is epoch-anchored:
//   liveSeconds = accumulatedSeconds + floor((now - currentStartedAt) / 1000)
//   (when timerState === 'FOCUSING' and currentStartedAt is set)
// ============================================================================

import { prisma } from "@/lib/prisma";
import type {
  FocusTimerState,
  FocusPartyMemberView,
  MemberTimerView,
  FocusSessionView,
  FocusPartySummaryView,
  FocusPartyStateView,
  FocusPartyInviteView,
  FocusPartyError,
} from "./focus-party-types";
import {
  deriveMemberTimer,
  deriveCollectiveSeconds,
} from "./focus-party-types";

export type {
  FocusTimerState,
  FocusPartyMemberView,
  MemberTimerView,
  FocusSessionView,
  FocusPartySummaryView,
  FocusPartyStateView,
  FocusPartyInviteView,
  FocusPartyError,
};

export { deriveMemberTimer, deriveCollectiveSeconds };

// ============================================================================
// Safe Domain Error Mapping
// ============================================================================

/**
 * Maps raw database and RPC exceptions into safe, actionable domain errors
 * without leaking internal SQL strings or schema details to frontend callers.
 */
export function mapFocusPartyError(err: unknown): FocusPartyError {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (
    raw.includes("PARTY_FULL") ||
    raw.includes("FOCUS_PARTY_FULL") ||
    msg.includes("party is full") ||
    msg.includes("maximum 4 members") ||
    msg.includes("max 4")
  ) {
    return {
      code: "PARTY_FULL",
      message: "This Focus Party has reached its maximum capacity of 4 members.",
      statusCode: 409,
    };
  }

  if (
    raw.includes("INVITE_REQUIRED") ||
    raw.includes("FOCUS_PARTY_INVITE_REQUIRED") ||
    msg.includes("unauthorized: user has no pending invitation") ||
    msg.includes("invite")
  ) {
    return {
      code: "INVITE_REQUIRED",
      message: "You must have a pending invitation to join this Focus Party.",
      statusCode: 403,
    };
  }

  if (
    raw.includes("NOT_PARTY_LEADER") ||
    raw.includes("FOCUS_PARTY_NOT_LEADER") ||
    msg.includes("only the party leader can") ||
    msg.includes("not_leader")
  ) {
    return {
      code: "NOT_PARTY_LEADER",
      message: "Only the party leader can perform this action.",
      statusCode: 403,
    };
  }

  if (
    raw.includes("NOT_PARTY_MEMBER") ||
    raw.includes("FOCUS_PARTY_NOT_MEMBER") ||
    msg.includes("user does not belong to party") ||
    msg.includes("is not a member of party") ||
    msg.includes("user must be a member of the party")
  ) {
    return {
      code: "NOT_PARTY_MEMBER",
      message: "You must be a member of this Focus Party to perform this action.",
      statusCode: 403,
    };
  }

  if (raw.includes("CANNOT_REMOVE_SELF") || msg.includes("leader cannot remove self")) {
    return {
      code: "CANNOT_REMOVE_SELF",
      message: "Party leader cannot remove themselves. Use leave party instead.",
      statusCode: 400,
    };
  }

  if (
    raw.includes("SESSION_ENDED") ||
    raw.includes("FOCUS_SESSION_ENDED") ||
    msg.includes("focus session is not active") ||
    msg.includes("cannot modify timer state for an ended focus session") ||
    msg.includes("cannot join or modify an ended focus session")
  ) {
    return {
      code: "SESSION_ENDED",
      message: "This focus session is no longer active.",
      statusCode: 409,
    };
  }

  if (
    raw.includes("PARTY_DISBANDED") ||
    raw.includes("FOCUS_PARTY_DISBANDED") ||
    msg.includes("cannot enter session of a disbanded party") ||
    msg.includes("is disbanded")
  ) {
    return {
      code: "PARTY_DISBANDED",
      message: "This Focus Party has been disbanded.",
      statusCode: 409,
    };
  }

  if (
    raw.includes("INVALID_TIMER_TRANSITION") ||
    msg.includes("timer is currently paused") ||
    msg.includes("cannot pause a timer that has not been started") ||
    msg.includes("cannot resume a timer that has not been started") ||
    msg.includes("user has left the focus session")
  ) {
    const cleanMsg = raw
      .replace(/^.*check_violation:?\s*/i, "")
      .replace(/error:\s*/i, "")
      .replace(/42501:\s*/i, "")
      .trim();
    return {
      code: "INVALID_TIMER_TRANSITION",
      message: cleanMsg,
      statusCode: 400,
    };
  }

  if (raw.includes("PARTY_NOT_FOUND") || raw.includes("FOCUS_PARTY_NOT_FOUND") || msg.includes("not found")) {
    return {
      code: "PARTY_NOT_FOUND",
      message: "The requested party or session was not found.",
      statusCode: 404,
    };
  }

  if (raw.includes("FRIEND_REQUIRED") || msg.includes("can only invite friends")) {
    return {
      code: "FRIEND_REQUIRED",
      message: "You can only invite mutual friends to a Focus Party.",
      statusCode: 400,
    };
  }

  if (raw.includes("USER_BLOCKED") || msg.includes("cannot invite blocked user")) {
    return {
      code: "USER_BLOCKED",
      message: "Cannot invite this user.",
      statusCode: 400,
    };
  }

  if (
    raw.includes("USER_ALREADY_IN_PARTY") ||
    raw.includes("already belongs to an active Focus Party") ||
    msg.includes("user already belongs to an active focus party") ||
    msg.includes("user is already a member of this party")
  ) {
    return {
      code: "USER_ALREADY_IN_PARTY",
      message: msg.includes("already belongs to an active focus party")
        ? "You already belong to an active Focus Party. Leave your current party first."
        : "This user is already a member of the party.",
      statusCode: 409,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. Please try again.",
    statusCode: 500,
  };
}

// ============================================================================
// Service Operations (Database RPCs & Scoped Prisma Queries)
// ============================================================================

/**
 * Creates a new Focus Party with caller as initial leader.
 */
export async function createParty(
  userId: number,
  name?: string
): Promise<{ success: boolean; partyId: number; leaderId: number; name: string }> {
  const rows = await prisma.$queryRaw<Array<{ result: { success: boolean; partyId: number; leaderId: number; name: string } }>>`
    SELECT public.create_focus_party(${userId}, ${name ?? 'Focus Party'}) AS result
  `;
  return rows[0].result;
}

/**
 * Joins an existing Focus Party (enforces invitation and max 4 capacity).
 */
export async function joinParty(
  partyId: number,
  userId: number
): Promise<{ success: boolean; partyId: number; userId: number; alreadyMember?: boolean }> {
  const rows = await prisma.$queryRaw<Array<{ result: { success: boolean; partyId: number; userId: number; alreadyMember?: boolean } }>>`
    SELECT public.join_focus_party(${partyId}, ${userId}) AS result
  `;
  return rows[0].result;
}

/**
 * Leaves a Focus Party. If leader, transfers leadership to oldest remaining member.
 * If last member, party is marked disbanded.
 */
export async function leaveParty(
  partyId: number,
  userId: number
): Promise<{
  success: boolean;
  partyDisbanded: boolean;
  remainingMembers: number;
  leaderId?: number;
  transferred?: boolean;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    partyDisbanded: boolean;
    remainingMembers: number;
    leaderId?: number;
    transferred?: boolean;
  } }>>`
    SELECT public.leave_focus_party(${partyId}, ${userId}) AS result
  `;
  return rows[0].result;
}

/**
 * Leader removes a party member.
 */
export async function removeMember(
  partyId: number,
  leaderId: number,
  targetUserId: number
): Promise<{ success: boolean; removedUserId: number; partyId: number }> {
  const rows = await prisma.$queryRaw<Array<{ result: { success: boolean; removedUserId: number; partyId: number } }>>`
    SELECT public.remove_focus_party_member(${partyId}, ${leaderId}, ${targetUserId}) AS result
  `;
  return rows[0].result;
}

export const removePartyMember = removeMember;

/**
 * Enters the party's Focus Session.
 * Creates an active session atomically if none exists.
 * Preserves previous cumulative time and resets leftAt if rejoining.
 */
export async function enterFocus(
  partyId: number,
  userId: number
): Promise<{
  success: boolean;
  sessionId: number;
  partyId: number;
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt: string | null;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    sessionId: number;
    partyId: number;
    userId: number;
    timerState: FocusTimerState;
    accumulatedSeconds: number;
    currentStartedAt: string | null;
  } }>>`
    SELECT public.enter_focus_session(${partyId}, ${userId}) AS result
  `;
  return rows[0].result;
}

export const enterFocusSession = enterFocus;

/**
 * Starts the user's individual focus timer.
 * Idempotent: returns current state if already FOCUSING.
 */
export async function startTimer(
  sessionId: number,
  userId: number
): Promise<{
  success: boolean;
  sessionId: number;
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt: string | null;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    sessionId: number;
    userId: number;
    timerState: FocusTimerState;
    accumulatedSeconds: number;
    currentStartedAt: string | null;
  } }>>`
    SELECT public.start_focus_timer(${sessionId}, ${userId}) AS result
  `;
  return rows[0].result;
}

export const startFocusTimer = startTimer;

/**
 * Pauses the user's individual focus timer, banking elapsed interval.
 * Idempotent: returns current state if already PAUSED.
 */
export async function pauseTimer(
  sessionId: number,
  userId: number
): Promise<{
  success: boolean;
  sessionId: number;
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt: string | null;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    sessionId: number;
    userId: number;
    timerState: FocusTimerState;
    accumulatedSeconds: number;
    currentStartedAt: string | null;
  } }>>`
    SELECT public.pause_focus_timer(${sessionId}, ${userId}) AS result
  `;
  return rows[0].result;
}

export const pauseFocusTimer = pauseTimer;

/**
 * Resumes the user's individual focus timer.
 * Idempotent: returns current state if already FOCUSING.
 */
export async function resumeTimer(
  sessionId: number,
  userId: number
): Promise<{
  success: boolean;
  sessionId: number;
  userId: number;
  timerState: FocusTimerState;
  accumulatedSeconds: number;
  currentStartedAt: string | null;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    sessionId: number;
    userId: number;
    timerState: FocusTimerState;
    accumulatedSeconds: number;
    currentStartedAt: string | null;
  } }>>`
    SELECT public.resume_focus_timer(${sessionId}, ${userId}) AS result
  `;
  return rows[0].result;
}

export const resumeFocusTimer = resumeTimer;

/**
 * Leaves the active Focus Session (does NOT leave the party).
 * Preserves cumulative focus duration. If 0 participants remain, ends the session.
 */
export async function leaveFocus(
  sessionId: number,
  userId: number
): Promise<{
  success: boolean;
  sessionId: number;
  userId: number;
  accumulatedSeconds: number;
  remainingParticipants: number;
  sessionEnded: boolean;
}> {
  const rows = await prisma.$queryRaw<Array<{ result: {
    success: boolean;
    sessionId: number;
    userId: number;
    accumulatedSeconds: number;
    remainingParticipants: number;
    sessionEnded: boolean;
  } }>>`
    SELECT public.leave_focus_session(${sessionId}, ${userId}) AS result
  `;
  return rows[0].result;
}

export const leaveFocusSession = leaveFocus;

/**
 * Fetches the complete aggregated state of a party and its active session.
 */
export async function getPartyState(
  partyId: number,
  userId: number
): Promise<FocusPartyStateView> {
  const rows = await prisma.$queryRaw<Array<{ result: FocusPartyStateView }>>`
    SELECT public.get_focus_party_state(${partyId}, ${userId}) AS result
  `;
  const raw = rows[0].result;

  return {
    ...raw,
    party: {
      ...raw.party,
      isCurrentUserLeader: raw.party.leaderId === userId,
      memberCount: raw.members.length,
    },
  };
}

export const getFocusPartyState = getPartyState;

/**
 * Resolves the user's current active Focus Party summary if they belong to one.
 */
export async function getUserActiveParty(
  userId: number
): Promise<FocusPartySummaryView | null> {
  const membership = await prisma.focusPartyMember.findFirst({
    where: {
      userId,
      party: {
        disbandedAt: null,
      },
    },
    include: {
      party: {
        include: {
          _count: {
            select: { members: true },
          },
        },
      },
    },
  });

  if (!membership || !membership.party) return null;

  return {
    id: membership.party.id,
    name: membership.party.name,
    leaderId: membership.party.leaderId,
    createdAt: membership.party.createdAt.toISOString(),
    updatedAt: membership.party.updatedAt.toISOString(),
    disbandedAt: membership.party.disbandedAt
      ? membership.party.disbandedAt.toISOString()
      : null,
    isCurrentUserLeader: membership.party.leaderId === userId,
    memberCount: membership.party._count.members,
  };
}

/**
 * Resolves active focus session for a given party, if any.
 */
export async function getActiveSession(
  partyId: number,
  userId: number
): Promise<FocusSessionView | null> {
  // Ensure user is an authorized member
  const member = await prisma.focusPartyMember.findUnique({
    where: { partyId_userId: { partyId, userId } },
  });
  if (!member) {
    throw new Error("User does not belong to party");
  }

  const session = await prisma.focusSession.findFirst({
    where: { partyId, endedAt: null },
    include: {
      members: true,
    },
  });

  if (!session) return null;

  const nowMs = Date.now();
  const membersView: MemberTimerView[] = session.members.map((m) => {
    const { liveSeconds, isFocusing } = deriveMemberTimer(
      m.accumulatedSeconds,
      m.currentStartedAt,
      m.timerState,
      nowMs
    );
    return {
      userId: m.userId,
      timerState: m.timerState,
      accumulatedSeconds: m.accumulatedSeconds,
      currentStartedAt: m.currentStartedAt ? m.currentStartedAt.toISOString() : null,
      joinedAt: m.joinedAt.toISOString(),
      leftAt: m.leftAt ? m.leftAt.toISOString() : null,
      liveSeconds,
      isFocusing,
    };
  });

  const collectiveSeconds = deriveCollectiveSeconds(
    session.members.map((m) => ({
      accumulatedSeconds: m.accumulatedSeconds,
      currentStartedAt: m.currentStartedAt,
      timerState: m.timerState,
    })),
    nowMs
  );

  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    collectiveSeconds,
    members: membersView,
  };
}

/**
 * Invites an eligible friend to a Focus Party.
 * Verifies that sender is a member, receiver is a friend, party is not full, and receiver is not already in party.
 */
export async function inviteFriend(
  partyId: number,
  senderId: number,
  friendId: number
): Promise<{ success: boolean; inviteId: number }> {
  // 1. Verify sender is a party member
  const member = await prisma.focusPartyMember.findUnique({
    where: { partyId_userId: { partyId, userId: senderId } },
  });
  if (!member) {
    throw new Error("Only party members can send party invites");
  }

  // 2. Verify receiver is a friend
  const isFriend = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: senderId, friendId },
        { userId: friendId, friendId: senderId },
      ],
    },
  });
  if (!isFriend) {
    throw new Error("Can only invite friends to party");
  }

  // 3. Verify receiver is not blocked
  const isBlocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: senderId, blockedId: friendId },
        { userId: friendId, blockedId: senderId },
      ],
    },
  });
  if (isBlocked) {
    throw new Error("Cannot invite blocked user");
  }

  // 4. Verify receiver is not already in the party
  const alreadyInParty = await prisma.focusPartyMember.findUnique({
    where: { partyId_userId: { partyId, userId: friendId } },
  });
  if (alreadyInParty) {
    throw new Error("User is already a member of this party");
  }

  // 5. Verify party is not full
  const memberCount = await prisma.focusPartyMember.count({
    where: { partyId },
  });
  if (memberCount >= 4) {
    throw new Error("Party is full (maximum 4 members)");
  }

  // 6. Check for duplicate pending invite
  const existingInvite = await prisma.sessionInvite.findFirst({
    where: {
      partyId,
      receiverId: friendId,
      status: "PENDING",
    },
  });
  if (existingInvite) {
    return { success: true, inviteId: existingInvite.id };
  }

  // 7. Create invite
  const invite = await prisma.sessionInvite.create({
    data: {
      senderId,
      receiverId: friendId,
      partyId,
      status: "PENDING",
    },
  });

  return { success: true, inviteId: invite.id };
}

export const inviteFriendToParty = inviteFriend;

/**
 * Responds to a party invite (accepts or declines).
 */
export async function respondToInvite(
  inviteId: number,
  userId: number,
  action: "ACCEPTED" | "DECLINED"
): Promise<{ success: boolean; partyId?: number }> {
  const invite = await prisma.sessionInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.receiverId !== userId) {
    throw new Error("Invite not found or unauthorized");
  }

  if (invite.status !== "PENDING") {
    throw new Error(`Invite is already ${invite.status}`);
  }

  if (action === "DECLINED") {
    await prisma.sessionInvite.update({
      where: { id: inviteId },
      data: { status: "DECLINED" },
    });
    return { success: true };
  }

  if (!invite.partyId) {
    throw new Error("Invite does not have an associated partyId");
  }

  // Join party (enforces max 4 capacity and sets status to ACCEPTED)
  await joinParty(invite.partyId, userId);

  return { success: true, partyId: invite.partyId };
}

export const respondToPartyInvite = respondToInvite;

/**
 * Retrieves all pending incoming party invitations for a user.
 */
export async function getUserPendingPartyInvites(
  userId: number
): Promise<FocusPartyInviteView[]> {
  const invites = await prisma.sessionInvite.findMany({
    where: {
      receiverId: userId,
      status: "PENDING",
      partyId: { not: null },
      party: {
        disbandedAt: null,
      },
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
      party: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return invites.map((inv) => ({
    id: inv.id,
    partyId: inv.partyId!,
    partyName: inv.party?.name ?? "Focus Party",
    senderId: inv.senderId,
    senderName: inv.sender.name,
    senderUsername: inv.sender.username,
    senderAvatarUrl: inv.sender.avatarUrl,
    createdAt: inv.createdAt.toISOString(),
    status: inv.status as FocusPartyInviteView["status"],
  }));
}
