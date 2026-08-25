import { prisma } from "@/lib/prisma";
import { getRelationship, isVisible } from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";
import { isUserBlocked } from "@/lib/block-service";
import { TimezoneService } from "@/lib/timezone-service";
import { unstable_cache } from "next/cache";
import { getLevelProgress, calculateRequiredXp } from "@/lib/game-engine";
import { cachedWithRedis } from "@/lib/redis";

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

async function fetchTargetUserData(normalized: string) {
  // Redis (or in-process fallback) absorbs repeated profile reads across
  // serverless instances — a 60s TTL keeps dossiers fresh without hammering
  // Postgres on every profile view.
  return cachedWithRedis(`user-data:${normalized}`, 60, () =>
    prisma.user.findUnique({
      where: { username: normalized },
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
      lastSeenAt: true,
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
      stats: {
        select: {
          level: true,
          xp: true,
          rank: true,
          currency: true,
          skillPoints: true,
          endurance: true,
          tenacity: true,
          velocity: true,
          discipline: true,
          synthesis: true,
        },
      },
      inventory: {
        where: { isEquipped: true },
        select: {
          id: true,
          itemId: true,
          isEquipped: true,
          item: {
            select: {
              sku: true,
              name: true,
              slot: true,
              rarity: true,
              spriteLayer: true,
              setKey: true,
            },
          },
        },
      },
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
  })
  );
}

/**
 * Cached loader for target user profile base data
 */
export async function getCachedUserData(username: string) {
  const normalized = username.toLowerCase();
  try {
    const cachedFn = unstable_cache(
      async () => fetchTargetUserData(normalized),
      [`user-${normalized}`, `profile-stats-${normalized}`],
      {
        revalidate: 3600,
        tags: [`user-${normalized}`, `profile-stats-${normalized}`],
      }
    );
    return await cachedFn();
  } catch {
    // Graceful fallback for non-static / test environments where incrementalCache is not initialized
    return await fetchTargetUserData(normalized);
  }
}

/**
 * Server-side profile dossier data loader with strict column projections
 * and ISO string date serialization across Server/Client boundary.
 */
export async function getProfileDossier(
  username: string,
  viewerId: number | null
): Promise<ProfileDossierResult> {
  const targetUser = await getCachedUserData(username);

  if (!targetUser) {
    return {
      profile: null,
      relationship: "PUBLIC",
      permissions: null,
      error: "Scholar not found in the system registry.",
      status: 404,
    };
  }

  const isSelf = viewerId === targetUser.id;

  // ── Relationship + block state resolved in ONE parallel hop ──
  const [baseRelationship, isBlockedByViewer, isBlockedByTarget] = await Promise.all([
    getRelationship(viewerId, targetUser.id),
    viewerId && !isSelf ? isUserBlocked(viewerId, targetUser.id) : Promise.resolve(false),
    viewerId && !isSelf ? isUserBlocked(targetUser.id, viewerId) : Promise.resolve(false),
  ]);

  let relationshipStatus: string = baseRelationship;
  if (isBlockedByViewer) {
    relationshipStatus = "BLOCKED";
  } else if (!isSelf && baseRelationship === Relationship.PUBLIC && viewerId) {
    // Pending request checks only matter for PUBLIC relationships — one parallel hop.
    const [pendingSent, pendingReceived] = await Promise.all([
      prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: viewerId,
            receiverId: targetUser.id,
          },
        },
      }).catch(() => null),
      prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: targetUser.id,
            receiverId: viewerId,
          },
        },
      }).catch(() => null),
    ]);
    if (pendingSent && pendingSent.status === "PENDING") {
      relationshipStatus = "PENDING_SENT";
    } else if (pendingReceived && pendingReceived.status === "PENDING") {
      relationshipStatus = "PENDING_RECEIVED";
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

  // ── Aggregate stats in one parallel hop ──
  const targetTimezone = targetUser.timezone || "UTC";
  const todayStart = TimezoneService.getStartOfDayUTC(targetTimezone);

  const [completedQuestsCount, todaySessions] = await Promise.all([
    prisma.quest.count({
      where: { userId: targetUser.id, status: "COMPLETED" },
    }).catch(() => 0),
    prisma.studySession?.findMany
      ? prisma.studySession.findMany({
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
      : Promise.resolve([]),
  ]);

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

    const userStats = targetUser.stats || {
      level: targetUser.level || 1,
      xp: targetUser.currentXP || 0,
      rank: targetUser.hunterRank || "RANK E",
      currency: 0,
      skillPoints: 0,
      endurance: targetUser.statEndurance ?? 10,
      tenacity: targetUser.statTenacity ?? 10,
      velocity: targetUser.statVelocity ?? 10,
      discipline: targetUser.statDiscipline ?? 10,
      synthesis: targetUser.statSynthesis ?? 10,
    };

    // XP PROGRESSION (canonical, level-correct):
    // `getLevelProgress` needs the LIFETIME cumulative XP. If the canonical
    // UserStats row exists, it holds the lifetime total; otherwise we rebuilt
    // `userStats.xp` from `User.currentXP` (which is XP INTO the current
    // level) — so reconstruct the lifetime total before computing progress.
    //
    // The dashboard reads `User.currentXP` / `User.xpToNextLevel` directly,
    // and both are into-level / per-level-bucket values maintained by the
    // canonical progression RPC. We used to override `currentXP` with the
    // LIFETIME cumulative number while leaving the per-level bucket, which
    // produced "7412 / 627 XP" on a friend's level-17 card — the lifetime
    // total divided by a single level's bucket. Now the numerator is the
    // exact XP INTO the friend's current level and the denominator is the
    // total XP required to clear THAT level (either matches perfectly).
    const statLevel = userStats.level || targetUser.level || 1;
    const lifetimeXp = targetUser.stats
      ? userStats.xp
      : calculateRequiredXp(statLevel) + (targetUser.currentXP || 0);

    const levelProgress = getLevelProgress(lifetimeXp, statLevel);

    // Online status — mirrors the friends roster: online only if this user's
    // heartbeat (`lastSeenAt`, refreshed ~every 60s while the app is open) is
    // fresh within 2 minutes. Older than that → offline (the card must never
    // show a green dot for someone who walked away).
    const isOnline =
      !!targetUser.lastSeenAt &&
      Date.now() - new Date(targetUser.lastSeenAt).getTime() <= 2 * 60 * 1000;

    const rawProfileData = {
      id: targetUser.id,
      name: targetUser.name,
      username: targetUser.username,
      scholarId: (targetUser as any).scholarId,
      verificationStatus: (targetUser as any).verificationStatus,
      avatarUrl: targetUser.avatarUrl,
      bannerUrl: targetUser.bannerUrl,
      bio: targetUser.bio,
      hunterRank: userStats.rank || targetUser.hunterRank,
      level: statLevel,
      currentXP: levelProgress.xpIntoCurrentLevel,
      xpToNextLevel: levelProgress.xpForCurrentBracket,
      levelProgress: levelProgress.progressPercentage,
      hp: targetUser.hp,
      maxHp: targetUser.maxHp,
      streakDays: targetUser.streakDays,
      totalStudyMinutes: targetUser.totalStudyMinutes,
      totalStudySeconds: targetUser.totalStudySeconds || (targetUser.totalStudyMinutes * 60),
      todayStudyMinutes,
      todayStudySeconds,
      completedTodaySeconds,
      isStudying,
      isOnline,
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
        endurance: userStats.endurance ?? targetUser.statEndurance ?? 10,
        tenacity: userStats.tenacity ?? targetUser.statTenacity ?? 10,
        velocity: userStats.velocity ?? targetUser.statVelocity ?? 10,
        discipline: userStats.discipline ?? targetUser.statDiscipline ?? 10,
        synthesis: userStats.synthesis ?? targetUser.statSynthesis ?? 10,
      },
      userStats,
      inventory: (targetUser.inventory || []).map((inv: any) => ({
        id: inv.id,
        itemId: inv.itemId,
        isEquipped: inv.isEquipped,
        item: inv.item,
      })),
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
        inventory: undefined,
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
        levelProgress: showRank ? rawProfileData.levelProgress : undefined,
        totalStudyMinutes: showStudy ? rawProfileData.totalStudyMinutes : undefined,
        totalStudySeconds: showStudy ? rawProfileData.totalStudySeconds : undefined,
        todayStudyMinutes: showStudy ? rawProfileData.todayStudyMinutes : undefined,
        todayStudySeconds: showStudy ? rawProfileData.todayStudySeconds : undefined,
        completedTodaySeconds: showStudy ? rawProfileData.completedTodaySeconds : undefined,
        streakDays: showStudy ? rawProfileData.streakDays : undefined,
        stats: showStudy ? rawProfileData.stats : undefined,
        inventory: rawProfileData.inventory,
        recentAchievements: showAchievements ? rawProfileData.recentAchievements : undefined,
        achievementsCount: showAchievements ? rawProfileData.achievementsCount : undefined,
        lastActiveDate: showOnline ? rawProfileData.lastActiveDate : undefined,
        isOnline: showOnline ? rawProfileData.isOnline : undefined,
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
