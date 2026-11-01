import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { type AuthTokenPayload } from "@/lib/auth";
import { attachReissuedSession } from "@/lib/auth-session-service";
import { formatScholarId } from "@/lib/scholar-id";
import { xpForNextLevel } from "@/lib/game-engine";
import { TimezoneService } from "@/lib/timezone-service";
import bcrypt from "bcryptjs";
import { sendEmailChangedNotice } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { checkSecurityCode } from "@/lib/security-code";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const body = await req.json();
    let { username, name, email, timezone } = body;
    const { currentPassword, code } = body;
    let usedEmailCode: number | null = null;

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
      // A session alone is not enough, because the address is where security codes and resets go. A password if there is one, otherwise a code
      // sent to the address being replaced.
      const attempts = await rateLimit(`email-change:${userId}`, { limit: 5, windowMs: 10 * 60_000 });
      if (!attempts.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(attempts.retryAfterSeconds) } });
      if (currentUser.password) {
        if (typeof currentPassword !== "string" || !currentPassword) return NextResponse.json({ error: "Enter your password to change your email.", code: "password_required" }, { status: 403 });
        if (!(await bcrypt.compare(currentPassword, currentUser.password))) return NextResponse.json({ error: "That password isn't right.", code: "password_incorrect" }, { status: 401 });
      } else {
        const check = typeof code === "string" && code.trim().length === 6 ? await checkSecurityCode(userId, "CHANGE_EMAIL", code.trim()) : { valid: false as const };
        if (!check.valid) return NextResponse.json({ error: "Enter the code sent to your current email.", code: "code_required" }, { status: 403 });
        usedEmailCode = check.tokenId;
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
    const updatedUser = await executionTransaction(userId, tx => tx.user.update({
      where: { id: userId },
      data: updates,
    }));

    if (updates.email) {
      if (usedEmailCode !== null) await prisma.verificationToken.deleteMany({ where: { id: usedEmailCode } });
      await sendEmailChangedNotice({ to: currentUser.email, name: currentUser.name, newEmail: updatedUser.email }).catch(() => undefined);
    }

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
    await attachReissuedSession(response, session, tokenPayload);

    return response;
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while updating your account." },
      { status: 500 }
    );
  }
}
