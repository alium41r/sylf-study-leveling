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
 * Blocks a target user: deletes any existing friendship/requests and inserts a block record.
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
