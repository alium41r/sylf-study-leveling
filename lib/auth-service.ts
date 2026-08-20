import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma";
import { xpForNextLevel } from "./game-engine";
import { formatScholarId, generateRandomScholarId } from "./scholar-id";
import { signToken, type AuthTokenPayload } from "./auth";
import type { NormalizedOAuthUser } from "./oauth";
import { TimezoneService } from "./timezone-service";

export interface RegisterParams {
  email: string;
  username: string;
  name?: string | null;
  password?: string | null;
  avatarUrl?: string | null;
  isOAuth?: boolean;
  provider?: string;
  providerAccountId?: string;
  timezone?: string;
}

export function validateUsername(username: string): { valid: boolean; error?: string; sanitized: string } {
  const sanitized = username.trim().toLowerCase();
  if (sanitized.length < 3 || sanitized.length > 20) {
    return { valid: false, error: "Username must be between 3 and 20 characters.", sanitized };
  }
  if (!/^[a-z0-9_]+$/.test(sanitized)) {
    return { valid: false, error: "Username can only contain letters, numbers, and underscores.", sanitized };
  }
  return { valid: true, sanitized };
}

/**
 * Ensures a username is unique by appending sequential numbers if needed (for OAuth).
 */
export async function generateUniqueUsername(baseUsername: string): Promise<string> {
  const sanitized = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 16) || "hunter";
  let candidate = sanitized;
  let counter = 1;

  while (true) {
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing) {
      return candidate;
    }
    candidate = `${sanitized}_${counter}`;
    counter++;
  }
}

/**
 * Initializes a new user profile with Solo Leveling baseline RPG metrics.
 */
export async function initializeUserProfile(params: RegisterParams) {
  const { email, name, password, avatarUrl, isOAuth, provider, providerAccountId, timezone } = params;

  // 0. Validate & sanitize timezone
  const safeTimezone = timezone && TimezoneService.validateTimezone(timezone) ? timezone : "UTC";

  // 1. Sanitize & validate username
  const userValidation = validateUsername(params.username);
  if (!userValidation.valid) {
    throw new Error(userValidation.error);
  }
  const username = userValidation.sanitized;

  // 2. Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error("A valid email address is required.");
  }

  // 3. Check uniqueness of email and username
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new Error("A scholar with this email address already exists.");
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    throw new Error("This username is already taken.");
  }

  // 4. Hash password if present
  let hashedPassword: string | null = null;
  if (password) {
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }
    hashedPassword = await bcrypt.hash(password, 10);
  } else if (!isOAuth) {
    throw new Error("Password is required for credentials registration.");
  }

  // 5. Determine verification status
  const verificationStatus = isOAuth ? "VERIFIED" : "UNVERIFIED";

  // 6. Pre-generate candidate Scholar ID or let DB transaction assign formatted ID
  const tempScholarId = generateRandomScholarId();

  // 7. Atomic user creation
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        username,
        name: name || null,
        password: hashedPassword,
        avatarUrl: avatarUrl || null,
        scholarId: tempScholarId,
        verificationStatus: verificationStatus as "VERIFIED" | "UNVERIFIED",
        hunterRank: "E",
        level: 1,
        currentXP: 0,
        xpToNextLevel: xpForNextLevel(1),
        hp: 100,
        maxHp: 100,
        streakDays: 0,
        totalStudyMinutes: 0,
        totalStudySeconds: 0,
        sylph: 0,
        activeTheme: "default",
        activeBackground: "none",
        activeAvatar: "class_scholar",
        activeFrame: "none",
        activeTitle: "Novice",
        activeNameColor: "default",
        timezone: safeTimezone,
        hasCompletedOnboarding: false,
        privacy: {
          create: {},
        },
      },
    });

    // Update with formatted deterministic scholar ID (#000001 based on user.id)
    const formattedId = formatScholarId(user.id);
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { scholarId: formattedId },
    });

    // Link Connected Account if OAuth
    if (isOAuth && provider && providerAccountId) {
      await tx.connectedAccount.create({
        data: {
          userId: user.id,
          provider: provider.toUpperCase(),
          providerAccountId,
          providerEmail: email,
          providerUsername: (params as any).providerUsername || null,
        },
      });
    }

    // System Welcome Notification
    await tx.systemMessage.create({
      data: {
        userId: user.id,
        content:
          "You have been granted the qualifications of a Player.\nWelcome, E-Rank Scholar. Your journey begins now.\n\nSet your first Goal and start tracking your Weekly Focus Quest.",
        type: "INFO",
      },
    });

    return updatedUser;
  });

  const tokenPayload: AuthTokenPayload = {
    userId: result.id,
    email: result.email,
    username: result.username,
    name: result.name,
    scholarId: result.scholarId || formatScholarId(result.id),
    verificationStatus: result.verificationStatus,
    hunterRank: result.hunterRank,
    level: result.level,
    hasCompletedOnboarding: result.hasCompletedOnboarding,
    hasPassword: !!result.password,
    timezone: result.timezone || "UTC",
  };

  const token = await signToken(tokenPayload);
  return { user: result, token };
}

/**
 * Links a third-party OAuth account to an already logged-in user.
 */
export async function linkOAuthAccountToUser(userId: number, oauthUser: NormalizedOAuthUser) {
  const providerUpper = oauthUser.provider.toUpperCase();

  // Ensure no other user is linked to this specific provider account
  const conflict = await prisma.connectedAccount.findFirst({
    where: {
      provider: providerUpper,
      providerAccountId: oauthUser.providerAccountId,
      userId: { not: userId },
    },
  });

  if (conflict) {
    throw new Error(`This ${oauthUser.provider.toUpperCase()} account is already connected to another user.`);
  }

  const linked = await prisma.connectedAccount.upsert({
    where: {
      userId_provider: {
        userId,
        provider: providerUpper,
      },
    },
    create: {
      userId,
      provider: providerUpper,
      providerAccountId: oauthUser.providerAccountId,
      providerEmail: oauthUser.email || null,
      providerUsername: oauthUser.providerUsername || oauthUser.username || null,
    },
    update: {
      providerAccountId: oauthUser.providerAccountId,
      providerEmail: oauthUser.email || null,
      providerUsername: oauthUser.providerUsername || oauthUser.username || null,
    },
  });

  return linked;
}

/**
 * Handles OAuth Sign-In or Registration:
 * 1. If ConnectedAccount exists -> Login.
 * 2. If User with email exists -> Link ConnectedAccount & Login.
 * 3. Otherwise -> Initialize new user profile & Login.
 */
export async function handleOAuthSignInOrRegister(oauthUser: NormalizedOAuthUser) {
  const providerUpper = oauthUser.provider.toUpperCase();

  // 1. Check existing connected account
  const existingConnection = await prisma.connectedAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: providerUpper,
        providerAccountId: oauthUser.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingConnection?.user) {
    // Refresh handle if available
    if (oauthUser.providerUsername && (existingConnection as any).providerUsername !== oauthUser.providerUsername) {
      await prisma.connectedAccount.update({
        where: { id: existingConnection.id },
        data: { providerUsername: oauthUser.providerUsername },
      }).catch(() => {});
    }

    const user = existingConnection.user;
    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      scholarId: user.scholarId || formatScholarId(user.id),
      verificationStatus: user.verificationStatus,
      hunterRank: user.hunterRank,
      level: user.level,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      hasPassword: !!user.password,
    };
    const token = await signToken(tokenPayload);
    return { user, token, isNewUser: false };
  }

  // 2. Check if a user with this email already exists
  if (oauthUser.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: oauthUser.email.toLowerCase() },
    });

    if (existingUser) {
      // Link the provider to this existing user
      await prisma.connectedAccount.upsert({
        where: {
          userId_provider: {
            userId: existingUser.id,
            provider: providerUpper,
          },
        },
        update: {
          providerAccountId: oauthUser.providerAccountId,
          providerEmail: oauthUser.email,
          providerUsername: oauthUser.providerUsername || null,
        },
        create: {
          userId: existingUser.id,
          provider: providerUpper,
          providerAccountId: oauthUser.providerAccountId,
          providerEmail: oauthUser.email,
          providerUsername: oauthUser.providerUsername || null,
        },
      });

      // If OAuth is verified, upgrade user status to VERIFIED
      let updatedUser = existingUser;
      if (oauthUser.emailVerified && existingUser.verificationStatus !== "VERIFIED") {
        updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: { verificationStatus: "VERIFIED" },
        });
      }

      const tokenPayload: AuthTokenPayload = {
        userId: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        name: updatedUser.name,
        scholarId: updatedUser.scholarId || formatScholarId(updatedUser.id),
        verificationStatus: updatedUser.verificationStatus,
        hunterRank: updatedUser.hunterRank,
        level: updatedUser.level,
        hasCompletedOnboarding: updatedUser.hasCompletedOnboarding,
        hasPassword: !!updatedUser.password,
        timezone: updatedUser.timezone || "UTC",
      };
      const token = await signToken(tokenPayload);
      return { user: updatedUser, token, isNewUser: false };
    }
  }

  // 3. Create fresh user
  const emailFallback = oauthUser.email || `${oauthUser.provider}_${oauthUser.providerAccountId}@sylf.app`;
  const uniqueUsername = await generateUniqueUsername(oauthUser.username);
  const result = await initializeUserProfile({
    email: emailFallback,
    username: uniqueUsername,
    name: oauthUser.name,
    avatarUrl: oauthUser.avatarUrl,
    isOAuth: true,
    provider: providerUpper,
    providerAccountId: oauthUser.providerAccountId,
    providerUsername: oauthUser.providerUsername || null,
  } as any);

  return { user: result.user, token: result.token, isNewUser: true };
}

/**
 * Creates or refreshes an email verification token for a user.
 */
export async function generateEmailVerificationToken(userId: number): Promise<string> {
  // Clear any existing verification tokens for this user
  await prisma.verificationToken.deleteMany({
    where: { userId },
  });

  // Generate cryptographic token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.verificationToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Confirms an email verification token.
 */
export async function confirmEmailVerificationToken(token: string): Promise<{ success: boolean; error?: string; email?: string }> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record) {
    return { success: false, error: "Invalid or expired verification token." };
  }

  if (new Date() > record.expiresAt) {
    await prisma.verificationToken.delete({ where: { id: record.id } });
    return { success: false, error: "Verification token has expired. Please request a new one." };
  }

  // Mark user verified
  await prisma.user.update({
    where: { id: record.userId },
    data: { verificationStatus: "VERIFIED" },
  });

  // Clean up token
  await prisma.verificationToken.delete({ where: { id: record.id } });

  return { success: true, email: record.user.email };
}
