import { prisma } from "@/lib/prisma";

/**
 * Checks if userId has blocked targetUserId.
 */
export async function isUserBlocked(userId: number, targetUserId: number): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "BlockedUser"
      WHERE "userId" = ${userId} AND "blockedId" = ${targetUserId}
      LIMIT 1
    `;
    return Boolean(rows && rows.length > 0);
  } catch (err) {
    console.error("isUserBlocked query error:", err);
    return false;
  }
}

/**
 * Checks if a block exists in either direction between two users.
 */
export async function areUsersBlocked(userA: number, userB: number): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "BlockedUser"
      WHERE ("userId" = ${userA} AND "blockedId" = ${userB})
         OR ("userId" = ${userB} AND "blockedId" = ${userA})
      LIMIT 1
    `;
    return Boolean(rows && rows.length > 0);
  } catch (err) {
    console.error("areUsersBlocked query error:", err);
    return false;
  }
}

/**
 * Batched check: returns true if a block exists in either direction between
 * `userId` and ANY user in `otherUserIds` in a single database query.
 */
export async function areAnyUsersBlocked(
  userId: number,
  otherUserIds: number[]
): Promise<boolean> {
  if (otherUserIds.length === 0) return false;
  if (otherUserIds.length === 1) return areUsersBlocked(userId, otherUserIds[0]);
  try {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "BlockedUser"
      WHERE ("userId" = ${userId} AND "blockedId" = ANY(${otherUserIds}::int[]))
         OR ("userId" = ANY(${otherUserIds}::int[]) AND "blockedId" = ${userId})
      LIMIT 1
    `;
    return Boolean(rows && rows.length > 0);
  } catch (err) {
    console.error("areAnyUsersBlocked query error:", err);
    return false;
  }
}

/**
 * Whether `actorId` may put `targetId` into a conversation. A group is a way of reaching someone,
 * so it answers to the same rules as a direct message: no block in either direction, the person's
 * allowDirectMessages setting, and friendship unless they accept messages from everyone. Fails
 * closed, because the block helpers above report a failed query as "not blocked".
 */
export async function mayAddToConversation(actorId: number, targetId: number): Promise<boolean> {
  if (actorId === targetId) return true;
  const [blocks, privacy, friendship] = await Promise.all([
    prisma.blockedUser.findFirst({
      where: { OR: [{ userId: actorId, blockedId: targetId }, { userId: targetId, blockedId: actorId }] },
      select: { id: true },
    }),
    prisma.userPrivacy.findUnique({ where: { userId: targetId }, select: { allowDirectMessages: true } }),
    prisma.friendship.findFirst({
      where: { OR: [{ userId: actorId, friendId: targetId }, { userId: targetId, friendId: actorId }] },
      select: { id: true },
    }),
  ]);
  if (blocks) return false;
  const policy = privacy?.allowDirectMessages ?? "FRIENDS";
  if (policy === "PRIVATE") return false;
  return policy === "PUBLIC" || Boolean(friendship);
}

/**
 * Removes a friendship and cleans up any related friend requests.
 */
export async function removeFriendship(userA: number, userB: number): Promise<boolean> {
  try {
    // 1. Delete friendship in both directions
    await prisma.$executeRaw`
      DELETE FROM "Friendship"
      WHERE ("userId" = ${userA} AND "friendId" = ${userB})
         OR ("userId" = ${userB} AND "friendId" = ${userA})
    `;

    // 2. Delete any friend requests between them
    await prisma.$executeRaw`
      DELETE FROM "FriendRequest"
      WHERE ("senderId" = ${userA} AND "receiverId" = ${userB})
         OR ("senderId" = ${userB} AND "receiverId" = ${userA})
    `;

    return true;
  } catch (err) {
    console.error("removeFriendship error:", err);
    return false;
  }
}

/**
 * Blocks a target user: deletes any existing friendship/requests, inserts a
 * block record, and severs both users' membership in their shared 1:1
 * conversations (S3) so a stale participant row cannot bypass the block.
 */
export async function blockUser(userId: number, targetUserId: number): Promise<boolean> {
  try {
    // Remove any existing friendship & friend requests
    await removeFriendship(userId, targetUserId);

    // Insert block record
    await prisma.$executeRaw`
      INSERT INTO "BlockedUser" ("userId", "blockedId", "createdAt")
      VALUES (${userId}, ${targetUserId}, NOW())
      ON CONFLICT ("userId", "blockedId") DO NOTHING
    `;

    // S3: remove both memberships from every shared NON-GROUP conversation.
    // Groups are left intact (members can still be in the same group), but the
    // message-send path re-checks blocks so neither party can message there.
    await prisma.$executeRaw`
      DELETE FROM "ConversationParticipant" cp
      USING "Conversation" c
      WHERE cp."conversationId" = c.id
        AND c."isGroup" = false
        AND cp."conversationId" IN (
          SELECT cpA."conversationId"
          FROM "ConversationParticipant" cpA
          JOIN "ConversationParticipant" cpB
            ON cpB."conversationId" = cpA."conversationId"
          WHERE cpA."userId" = ${userId}
            AND cpB."userId" = ${targetUserId}
        )
    `;

    return true;
  } catch (err) {
    console.error("blockUser error:", err);
    return false;
  }
}

/**
 * Unblocks a target user.
 */
export async function unblockUser(userId: number, targetUserId: number): Promise<boolean> {
  try {
    await prisma.$executeRaw`
      DELETE FROM "BlockedUser"
      WHERE "userId" = ${userId} AND "blockedId" = ${targetUserId}
    `;

    return true;
  } catch (err) {
    console.error("unblockUser error:", err);
    return false;
  }
}
