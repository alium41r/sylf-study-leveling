import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getRelationship, enforcePrivacy, isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  try {
    const params = await props.params;
    const { username } = params;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Optional Authentication (viewer might be a guest or logged-in user)
    let viewerId: number | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const payload = await verifyToken(token);
      if (payload) {
        viewerId = payload.userId as number;
      }
    }

    // Fetch target user with privacy, cosmetics, and achievements
    const targetUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        privacy: true,
        achievements: {
          take: 6,
          orderBy: { claimedAt: "desc" },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Scholar not found in the system registry." }, { status: 404 });
    }

    // Determine Base Privacy Relationship (SELF, FRIEND, GROUP, PUBLIC)
    const baseRelationship = await getRelationship(viewerId, targetUser.id);
    const isSelf = viewerId === targetUser.id;

    // Determine Extended Relationship Status for UI (FRIEND, PENDING_SENT, PENDING_RECEIVED, PUBLIC)
    let relationshipStatus: string = baseRelationship;
    if (!isSelf && baseRelationship === Relationship.PUBLIC && viewerId) {
      const pendingSent = await prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: viewerId,
            receiverId: targetUser.id,
          },
        },
      });
      if (pendingSent && pendingSent.status === "PENDING") {
        relationshipStatus = "PENDING_SENT";
      } else {
        const pendingReceived = await prisma.friendRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: targetUser.id,
              receiverId: viewerId,
            },
          },
        });
        if (pendingReceived && pendingReceived.status === "PENDING") {
          relationshipStatus = "PENDING_RECEIVED";
        }
      }
    }

    // If privacy record doesn't exist, use public defaults
    const privacy = targetUser.privacy || {
      profileVisibility: "PUBLIC",
      showOnlineStatus: "PUBLIC",
      showCurrentSession: "PUBLIC",
      showStudyHours: "PUBLIC",
      showRank: "PUBLIC",
      showAchievements: "PUBLIC",
      allowFriendRequests: "PUBLIC",
      allowDirectMessages: "FRIENDS",
    };

    // Calculate completed quests count
    const completedQuestsCount = await prisma.quest.count({
      where: { userId: targetUser.id, status: "COMPLETED" },
    });

    // Construct raw profile data
    const rawProfileData = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      avatarUrl: targetUser.avatarUrl,
      bannerUrl: targetUser.bannerUrl,
      bio: targetUser.bio,
      hunterRank: targetUser.hunterRank,
      level: targetUser.level,
      currentXP: targetUser.currentXP,
      xpToNextLevel: targetUser.xpToNextLevel,
      hp: targetUser.hp,
      maxHp: targetUser.maxHp,
      streakDays: targetUser.streakDays,
      totalStudyMinutes: targetUser.totalStudyMinutes,
      activeAvatar: targetUser.activeAvatar,
      activeFrame: targetUser.activeFrame,
      activeTitle: targetUser.activeTitle,
      activeAura: targetUser.activeAura,
      activeNameColor: targetUser.activeNameColor,
      characterConfig: targetUser.characterConfig || null,
      socialLinks: targetUser.socialLinks || {},
      stats: {
        endurance: targetUser.statEndurance ?? 10,
        tenacity: targetUser.statTenacity ?? 10,
        velocity: targetUser.statVelocity ?? 10,
        synthesis: targetUser.statSynthesis ?? 10,
        discipline: targetUser.statDiscipline ?? 10,
      },
      completedQuestsCount,
      achievementsCount: targetUser.achievements.length,
      recentAchievements: targetUser.achievements.map((a) => ({
        achievementId: a.achievementId,
        claimedAt: a.claimedAt,
      })),
      lastActiveDate: targetUser.lastActiveDate,
      createdAt: targetUser.createdAt,
    };

    // Compute individual section visibilities
    const isProfileVisible = isVisible(privacy.profileVisibility, baseRelationship);
    const isRankVisible = isVisible(privacy.showRank, baseRelationship);
    const isStudyHoursVisible = isVisible(privacy.showStudyHours, baseRelationship);
    const isAchievementsVisible = isVisible(privacy.showAchievements, baseRelationship);
    const isOnlineStatusVisible = isVisible(privacy.showOnlineStatus, baseRelationship);

    // Privacy field map
    const privacyMap: Partial<Record<keyof typeof rawProfileData, string>> = {
      name: privacy.profileVisibility,
      bio: privacy.profileVisibility,
      activeTitle: privacy.profileVisibility,
      activeAvatar: privacy.profileVisibility,
      activeFrame: privacy.profileVisibility,
      activeAura: privacy.profileVisibility,
      characterConfig: privacy.profileVisibility,
      socialLinks: privacy.profileVisibility,

      hunterRank: privacy.showRank,
      level: privacy.showRank,
      currentXP: privacy.showRank,
      xpToNextLevel: privacy.showRank,
      hp: privacy.showRank,
      maxHp: privacy.showRank,

      streakDays: privacy.showStudyHours,
      totalStudyMinutes: privacy.showStudyHours,
      stats: privacy.showStudyHours,

      recentAchievements: privacy.showAchievements,
      achievementsCount: privacy.showAchievements,
      lastActiveDate: privacy.showOnlineStatus,
    };

    const filteredProfile = enforcePrivacy(rawProfileData, privacyMap, baseRelationship);
    (filteredProfile as any).isRestricted = !isProfileVisible;

    return NextResponse.json({
      profile: filteredProfile,
      isSelf,
      relationship: relationshipStatus,
      privacySettings: {
        isProfileVisible,
        isRankVisible,
        isStudyHoursVisible,
        isAchievementsVisible,
        isOnlineStatusVisible,
      },
      permissions: {
        canSendFriendRequest:
          !isSelf &&
          isVisible(privacy.allowFriendRequests, baseRelationship) &&
          relationshipStatus !== "FRIEND" &&
          relationshipStatus !== "PENDING_SENT",
        canSendMessage: !isSelf && isVisible(privacy.allowDirectMessages, baseRelationship),
      },
    });
  } catch (error: any) {
    console.error("Profile Fetch Error:", error);
    return NextResponse.json({ error: "Failed to fetch profile dossier." }, { status: 500 });
  }
}
