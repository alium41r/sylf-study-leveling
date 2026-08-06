import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getRelationship, enforcePrivacy, isVisible } from "@/lib/privacy";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  try {
    const params = await props.params;
    const { username } = params;

    // Optional Authentication (viewer might be a guest)
    let viewerId: number | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const payload = await verifyToken(token);
      if (payload) {
        viewerId = payload.userId as number;
      }
    }

    // Fetch target user with privacy settings
    const targetUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        privacy: true, // Crucial for evaluating permissions
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Determine Relationship (SELF, FRIEND, GROUP, PUBLIC)
    const relationship = await getRelationship(viewerId, targetUser.id);

    // If privacy record doesn't exist (legacy user), create default in memory for enforcement
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

    // Construct the Raw Profile Data
    // Security: Do NOT include sensitive internal fields like password, email, etc.
    const rawProfileData = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      hunterRank: targetUser.hunterRank,
      level: targetUser.level,
      currentXP: targetUser.currentXP,
      streakDays: targetUser.streakDays,
      totalStudyMinutes: targetUser.totalStudyMinutes,
      activeAvatar: targetUser.activeAvatar,
      activeTitle: targetUser.activeTitle,
      lastActiveDate: targetUser.lastActiveDate,
      createdAt: targetUser.createdAt,
    };

    // ─── Privacy Mapping ──────────────────────────────────────────────────────────
    // Map profile fields to their corresponding privacy settings string.
    // If a field isn't mapped, it passes through the enforcer unharmed (e.g. username).
    // ──────────────────────────────────────────────────────────────────────────────
    const privacyMap: Partial<Record<keyof typeof rawProfileData, string>> = {
      // Baseline profile visibility.
      name: privacy.profileVisibility,
      activeTitle: privacy.profileVisibility,
      activeAvatar: privacy.profileVisibility,
      
      // Granular permissions
      hunterRank: privacy.showRank,
      level: privacy.showRank,
      currentXP: privacy.showRank,
      
      streakDays: privacy.showStudyHours,
      totalStudyMinutes: privacy.showStudyHours,
      
      lastActiveDate: privacy.showOnlineStatus,
    };

    // Run the privacy enforcer! Any unauthorized fields are instantly stripped.
    const filteredProfile = enforcePrivacy(rawProfileData, privacyMap, relationship);

    return NextResponse.json(
      {
        profile: filteredProfile,
        // Provide relationship context so UI knows what actions are available (e.g., Add Friend vs Message)
        relationship: relationship, 
        permissions: {
          // Securely derive action permissions server-side rather than letting client guess
          canSendFriendRequest: isVisible(privacy.allowFriendRequests, relationship),
          canSendMessage: isVisible(privacy.allowDirectMessages, relationship),
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
