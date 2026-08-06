import { prisma } from "./prisma";
import { PrivacyLevel, Relationship } from "./privacy-types";

const visibilityLevels = {
  [PrivacyLevel.PRIVATE]: 0,
  [PrivacyLevel.FRIENDS]: 1,
  [PrivacyLevel.GROUPS]: 2,
  [PrivacyLevel.PUBLIC]: 3,
};

const relationshipLevels = {
  [Relationship.SELF]: 0,
  [Relationship.FRIEND]: 1,
  [Relationship.GROUP]: 2,
  [Relationship.PUBLIC]: 3,
};

/**
 * Dynamically resolves the relationship between a viewer and a target user.
 */
export async function getRelationship(viewerId: number | null, targetUserId: number): Promise<Relationship> {
  // 1. No auth -> Public
  if (!viewerId) return Relationship.PUBLIC;
  
  // 2. Same user -> Self
  if (viewerId === targetUserId) return Relationship.SELF;

  // 3. Check Friendship
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: viewerId, friendId: targetUserId },
        { userId: targetUserId, friendId: viewerId },
      ],
    },
    select: { id: true }, // Lightweight query
  });
  if (friendship) return Relationship.FRIEND;

  // 4. Check Shared Group
  const sharedGroup = await prisma.conversationParticipant.findFirst({
    where: {
      userId: viewerId,
      conversation: {
        isGroup: true,
        participants: {
          some: { userId: targetUserId },
        },
      },
    },
    select: { id: true },
  });
  if (sharedGroup) return Relationship.GROUP;

  // 5. Default -> Public
  return Relationship.PUBLIC;
}

/**
 * Checks if a specific privacy setting allows the given relationship.
 */
export function isVisible(setting: string, relationship: Relationship): boolean {
  // Fallback to PUBLIC if the setting string doesn't match an enum
  const settingLevel = visibilityLevels[setting as PrivacyLevel] ?? visibilityLevels[PrivacyLevel.PUBLIC];
  const viewerLevel = relationshipLevels[relationship];
  
  // The viewer's restriction level must be <= the setting's visibility level.
  // e.g. FRIEND (1) <= FRIENDS (1) -> true
  // e.g. GROUP (2) <= FRIENDS (1) -> false
  return viewerLevel <= settingLevel;
}

/**
 * Generically filters any data object based on a mapping of its fields to privacy settings.
 * Fields not defined in the mapping are always passed through (assumed safe).
 */
export function enforcePrivacy<T extends Record<string, any>>(
  data: T,
  privacyMap: Partial<Record<keyof T, string>>,
  relationship: Relationship
): Partial<T> {
  const result: Partial<T> = {};

  for (const key in data) {
    const requiredVisibility = privacyMap[key];
    
    if (!requiredVisibility) {
      // If the field isn't mapped to a privacy setting, it passes through untouched.
      // E.g., username, id, avatar (if avatar is always public)
      result[key] = data[key];
    } else if (isVisible(requiredVisibility, relationship)) {
      result[key] = data[key];
    }
  }

  return result;
}
