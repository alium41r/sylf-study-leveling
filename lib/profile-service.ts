import { prisma } from "@/lib/prisma";
import { getRelationship, isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";
import { isUserBlocked } from "@/lib/block-service";
import { TimezoneService } from "@/lib/timezone-service";

export interface ProfileDossierResult {
  profile: any | null;
  relationship: string;
  permissions: {
    canSendFriendRequest: boolean;
    canSendMessage: boolean;
    canRemoveFriend?: boolean;
    canBlock?: boolean;
    canUnblock?: boolean;
  } | null;
  privacySettings?: {
    isProfileVisible: boolean;
    showRank: boolean;
    showStudyHours: boolean;
    showAchievements: boolean;
  };
  error?: string | null;
  status: number;
}

/**
 * Server-side profile dossier data loader with strict column projections
 * and ISO string date serialization across Server/Client boundary.
 */
export async function getProfileDossier(
  username: string,
  viewerId: number | null
): Promise<ProfileDossierResult> {
  const targetUser = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      name: true,
      scholarId: true,
      verificationStatus: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      hunterRank: true,
      level: true,
      currentXP: true,
      xpToNextLevel: true,
      hp: true,
      maxHp: true,
      streakDays: true,
      totalStudyMinutes: true,
      totalStudySeconds: true,
      timezone: true,
      lastActiveDate: true,
      activeAvatar: true,
      activeFrame: true,
      activeTitle: true,
      activeAura: true,
      activeNameColor: true,
      characterConfig: true,
      statEndurance: true,
      statTenacity: true,
      statVelocity: true,
      statSynthesis: true,
      statDiscipline: true,
      createdAt: true,
      privacy: {
        select: {
          profileVisibility: true,
          showOnlineStatus: true,
          showCurrentSession: true,
          showStudyHours: true,
          showRank: true,
          showAchievements: true,
          allowFriendRequests: true,
          allowDirectMessages: true,
        },
      },
      connectedAccounts: {
        select: {
          provider: true,
          providerUsername: true,
        },
      },
      achievements: {
        take: 6,
        orderBy: { claimedAt: "desc" },
        select: {
          achievementId: true,
          claimedAt: true,
        },
      },
    },
  });

  if (!targetUser) {
    return {
      profile: null,
      relationship: "PUBLIC",
      permissions: null,
      error: "Scholar not found in the system registry.",
      status: 404,
    };
  }

  const baseRelationship = await getRelationship(viewerId, targetUser.id);
  const isSelf = viewerId === targetUser.id;

  const isBlockedByViewer = viewerId && !isSelf ? await isUserBlocked(viewerId, targetUser.id) : false;
  const isBlockedByTarget = viewerId && !isSelf ? await isUserBlocked(targetUser.id, viewerId) : false;

  let relationshipStatus: string = baseRelationship;
  if (isBlockedByViewer) {
    relationshipStatus = "BLOCKED";
  } else if (!isSelf && baseRelationship === Relationship.PUBLIC && viewerId) {
    const pendingSent = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId: viewerId,
          receiverId: targetUser.id,
        },
      },
    }).catch(() => null);
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
      }).catch(() => null);
      if (pendingReceived && pendingReceived.status === "PENDING") {
        relationshipStatus = "PENDING_RECEIVED";
      }
    }
  }

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

  const completedQuestsCount = await prisma.quest.count({
    where: { userId: targetUser.id, status: "COMPLETED" },
  }).catch(() => 0);

  const targetTimezone = targetUser.timezone || "UTC";
  const todayStart = TimezoneService.getStartOfDayUTC(targetTimezone);

  const todaySessions = prisma.studySession?.findMany
    ? await prisma.studySession.findMany({
        where: {
          userId: targetUser.id,
          startedAt: { gte: todayStart },
        },
        select: {
          durationMinutes: true,
          durationSeconds: true,
          startedAt: true,
          endedAt: true,
        },
      }).catch(() => [])
    : [];

  let completedTodaySeconds = 0;
  let todayStudySeconds = 0;
  let activeSessionStartedAt: string | null = null;
  const now = new Date();

  for (const s of todaySessions) {
    if (!s.endedAt) {
      const started = new Date(s.startedAt);
      const elapsed = Math.floor((now.getTime() - started.getTime()) / 1000);
      if (elapsed >= 0 && elapsed <= 180) {
        activeSessionStartedAt = s.startedAt ? new Date(s.startedAt).toISOString() : null;
        todayStudySeconds += elapsed;
      }
    } else {
      const sec = (s.durationSeconds || (s.durationMinutes * 60) || 0);
      completedTodaySeconds += sec;
      todayStudySeconds += sec;
    }
  }
  const todayStudyMinutes = Math.floor(todayStudySeconds / 60);
  const isStudying = Boolean(activeSessionStartedAt);

  const ghAcc = targetUser.connectedAccounts?.find((c) => c.provider === "GITHUB");
  const discordAcc = targetUser.connectedAccounts?.find((c) => c.provider === "DISCORD");
  const igAcc = targetUser.connectedAccounts?.find((c) => c.provider === "INSTAGRAM");

  const connectedSocials: Record<string, string> = {};
  if (ghAcc?.providerUsername) connectedSocials.github = ghAcc.providerUsername;
  if (discordAcc?.providerUsername) connectedSocials.discord = discordAcc.providerUsername;
  if (igAcc?.providerUsername) connectedSocials.instagram = igAcc.providerUsername;

  const rawProfileData = {
    id: targetUser.id,
    name: targetUser.name,
    username: targetUser.username,
    scholarId: (targetUser as any).scholarId,
    verificationStatus: (targetUser as any).verificationStatus,
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
    totalStudySeconds: targetUser.totalStudySeconds || (targetUser.totalStudyMinutes * 60),
    todayStudyMinutes,
    todayStudySeconds,
    completedTodaySeconds,
    isStudying,
    activeSessionStartedAt,
    activeAvatar: targetUser.activeAvatar,
    activeFrame: targetUser.activeFrame,
    activeTitle: targetUser.activeTitle,
    activeAura: targetUser.activeAura,
    activeNameColor: targetUser.activeNameColor,
    characterConfig: targetUser.characterConfig || null,
    socialLinks: connectedSocials,
    connectedAccounts: {
      github: ghAcc?.providerUsername || null,
      discord: discordAcc?.providerUsername || null,
      instagram: igAcc?.providerUsername || null,
    },
    stats: {
      endurance: targetUser.statEndurance ?? 10,
      tenacity: targetUser.statTenacity ?? 10,
      velocity: targetUser.statVelocity ?? 10,
      synthesis: targetUser.statSynthesis ?? 10,
      discipline: targetUser.statDiscipline ?? 10,
    },
    completedQuestsCount,
    achievementsCount: targetUser.achievements?.length || 0,
    recentAchievements: (targetUser.achievements || []).map((a: any) => ({
      achievementId: a.achievementId,
      claimedAt: a.claimedAt ? (typeof a.claimedAt === "string" ? a.claimedAt : new Date(a.claimedAt).toISOString()) : new Date().toISOString(),
    })),
    lastActiveDate: targetUser.lastActiveDate,
    createdAt: targetUser.createdAt ? (typeof targetUser.createdAt === "string" ? targetUser.createdAt : new Date(targetUser.createdAt).toISOString()) : new Date().toISOString(),
  };

  const isRestrictedByBlock = isBlockedByViewer || isBlockedByTarget;
  const isProfilePublic = isVisible(privacy.profileVisibility, baseRelationship);

  let finalProfile: any = null;
  if (isRestrictedByBlock || (!isSelf && !isProfilePublic)) {
    finalProfile = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      avatarUrl: targetUser.avatarUrl,
      activeAvatar: targetUser.activeAvatar,
      activeFrame: targetUser.activeFrame,
      activeTitle: targetUser.activeTitle,
      characterConfig: undefined,
      isRestricted: true,
      bio: undefined,
      stats: undefined,
      socialLinks: undefined,
      connectedAccounts: undefined,
      recentAchievements: [],
    };
  } else {
    const showStudy = isSelf || isVisible(privacy.showStudyHours, baseRelationship);
    const showRank = isSelf || isVisible(privacy.showRank, baseRelationship);
    const showAchievements = isSelf || isVisible(privacy.showAchievements, baseRelationship);
    const showOnline = isSelf || isVisible(privacy.showOnlineStatus, baseRelationship);

    finalProfile = {
      ...rawProfileData,
      hunterRank: showRank ? rawProfileData.hunterRank : undefined,
      level: showRank ? rawProfileData.level : undefined,
      currentXP: showRank ? rawProfileData.currentXP : undefined,
      xpToNextLevel: showRank ? rawProfileData.xpToNextLevel : undefined,
      totalStudyMinutes: showStudy ? rawProfileData.totalStudyMinutes : undefined,
      totalStudySeconds: showStudy ? rawProfileData.totalStudySeconds : undefined,
      todayStudyMinutes: showStudy ? rawProfileData.todayStudyMinutes : undefined,
      todayStudySeconds: showStudy ? rawProfileData.todayStudySeconds : undefined,
      completedTodaySeconds: showStudy ? rawProfileData.completedTodaySeconds : undefined,
      streakDays: showStudy ? rawProfileData.streakDays : undefined,
      stats: showStudy ? rawProfileData.stats : undefined,
      recentAchievements: showAchievements ? rawProfileData.recentAchievements : undefined,
      achievementsCount: showAchievements ? rawProfileData.achievementsCount : undefined,
      lastActiveDate: showOnline ? rawProfileData.lastActiveDate : undefined,
    };
  }

  const permissions = {
    canSendFriendRequest: !isSelf && !isRestrictedByBlock && isVisible(privacy.allowFriendRequests, baseRelationship) && relationshipStatus === Relationship.PUBLIC,
    canSendMessage: !isSelf && !isRestrictedByBlock && isVisible(privacy.allowDirectMessages, baseRelationship),
    canRemoveFriend: baseRelationship === Relationship.FRIEND,
    canBlock: !isSelf && !isBlockedByViewer,
    canUnblock: !isSelf && isBlockedByViewer,
  };

  const privacySettings = {
    isProfileVisible: isProfilePublic,
    showRank: isVisible(privacy.showRank, baseRelationship),
    showStudyHours: isVisible(privacy.showStudyHours, baseRelationship),
    showAchievements: isVisible(privacy.showAchievements, baseRelationship),
  };

  return {
    profile: finalProfile,
    relationship: relationshipStatus,
    permissions,
    privacySettings,
    error: null,
    status: 200,
  };
}
