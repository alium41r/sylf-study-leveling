import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { signToken, AUTH_COOKIE_OPTIONS, type AuthTokenPayload } from "@/lib/auth";
import { formatScholarId } from "@/lib/scholar-id";
import { xpForNextLevel } from "@/lib/game-engine";
import { TimezoneService } from "@/lib/timezone-service";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const body = await req.json();
    let { username, name, email, timezone } = body;

    // Sanitize inputs
    username = username?.trim().toLowerCase();
    name = name?.trim();
    email = email?.trim().toLowerCase();
    timezone = timezone?.trim();

    // Validate Username
    if (username !== undefined) {
      if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
        return NextResponse.json(
          { error: "Username must be 3-20 characters long and can only contain letters, numbers, and underscores." },
          { status: 400 }
        );
      }
    }

    // Validate Display Name
    if (name !== undefined) {
      if (!name || name.length > 30 || !/^[\w\s\-']+$/.test(name)) {
        return NextResponse.json(
          { error: "Display name must be 1-30 characters and can only contain letters, numbers, spaces, hyphens, and apostrophes." },
          { status: 400 }
        );
      }
    }

    // Validate Email
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Please provide a valid email address." },
          { status: 400 }
        );
      }
    }

    // Validate Timezone
    if (timezone !== undefined) {
      if (!timezone || !TimezoneService.validateTimezone(timezone)) {
        return NextResponse.json(
          { error: "Invalid timezone identifier. Please select a valid IANA timezone." },
          { status: 400 }
        );
      }
    }

    // Get current user to compare
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: any = {};

    if (username !== undefined && username !== currentUser.username) {
      // Check duplicate
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser) {
        return NextResponse.json({ error: "This username is already taken." }, { status: 409 });
      }
      updates.username = username;
    }

    if (email !== undefined && email !== currentUser.email) {
      // Check duplicate
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ error: "This email address is already registered." }, { status: 409 });
      }
      updates.email = email;
      // Requirement 3: Reset verificationStatus to UNVERIFIED if email changes
      updates.verificationStatus = "UNVERIFIED";
    }

    if (name !== undefined && name !== currentUser.name) {
      updates.name = name;
    }

    if (timezone !== undefined && timezone !== currentUser.timezone) {
      updates.timezone = timezone;
    }

    // If nothing changed, return current user
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "No changes detected." }, { status: 200 });
    }

    // Apply updates and fetch updated user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    const scholarId = updatedUser.scholarId || formatScholarId(updatedUser.id);

    // Requirement 1: Generate a fresh signed token containing updated profile data
    const tokenPayload: AuthTokenPayload = {
      userId: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      name: updatedUser.name,
      scholarId,
      verificationStatus: updatedUser.verificationStatus,
      hunterRank: updatedUser.hunterRank,
      level: updatedUser.level,
      hasCompletedOnboarding: updatedUser.hasCompletedOnboarding,
      tokenVersion: updatedUser.tokenVersion,
      timezone: updatedUser.timezone || "UTC",
    };

    const newToken = await signToken(tokenPayload);

    const response = NextResponse.json(
      {
        message: "Account information updated successfully.",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          name: updatedUser.name,
          scholarId,
          verificationStatus: updatedUser.verificationStatus,
          hunterRank: updatedUser.hunterRank,
          level: updatedUser.level,
          currentXP: updatedUser.currentXP,
          xpToNextLevel: xpForNextLevel(updatedUser.level),
          hp: updatedUser.hp,
          maxHp: updatedUser.maxHp,
          streakDays: updatedUser.streakDays,
          totalStudyMinutes: updatedUser.totalStudyMinutes,
          hasCompletedOnboarding: updatedUser.hasCompletedOnboarding,
          createdAt: updatedUser.createdAt,
          avatarUrl: updatedUser.avatarUrl,
          timezone: updatedUser.timezone || "UTC",
        },
      },
      { status: 200 }
    );

    // Set updated session cookie
    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: newToken,
    });

    return response;
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while updating your account." },
      { status: 500 }
    );
  }
}
