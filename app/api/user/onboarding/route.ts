import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { signToken, AUTH_COOKIE_OPTIONS, type AuthTokenPayload } from "@/lib/auth";
import { xpForNextLevel } from "@/lib/game-engine";
import { formatScholarId } from "@/lib/scholar-id";
import { TimezoneService } from "@/lib/timezone-service";
import { hash } from "bcryptjs";
import { revalidateTag } from "next/cache";
import { SKELETON_NODES } from "@/lib/skill-tree-skeleton";
import { normalizeAppBackgroundId } from "@/lib/cosmetics-catalog";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    // 1. Fetch user from database
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const scholarId = currentUser.scholarId || formatScholarId(currentUser.id);

    // If user has already completed onboarding, smoothly refresh token and cookie
    if (currentUser.hasCompletedOnboarding) {
      const tokenPayload: AuthTokenPayload = {
        userId: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        name: currentUser.name,
        scholarId,
        verificationStatus: currentUser.verificationStatus,
        hunterRank: currentUser.hunterRank,
        level: currentUser.level,
        hasCompletedOnboarding: true,
        tokenVersion: currentUser.tokenVersion,
        timezone: currentUser.timezone || "UTC",
      };

      const freshToken = await signToken(tokenPayload);
      const response = NextResponse.json(
        {
          success: true,
          message: "Onboarding already completed.",
          user: {
            id: currentUser.id,
            email: currentUser.email,
            username: currentUser.username,
            name: currentUser.name,
            scholarId,
            verificationStatus: currentUser.verificationStatus,
            hunterRank: currentUser.hunterRank,
            level: currentUser.level,
            currentXP: currentUser.currentXP,
            xpToNextLevel: xpForNextLevel(currentUser.level),
            hp: currentUser.hp,
            maxHp: currentUser.maxHp,
            streakDays: currentUser.streakDays,
            totalStudyMinutes: currentUser.totalStudyMinutes,
            hasCompletedOnboarding: true,
            createdAt: currentUser.createdAt,
            avatarUrl: currentUser.avatarUrl,
            timezone: currentUser.timezone || "UTC",
          },
        },
        { status: 200 }
      );

      response.cookies.set({
        ...AUTH_COOKIE_OPTIONS,
        value: freshToken,
      });

      return response;
    }

    // Parse the payload
    const body = await req.json();
    const { themeId, backgroundId, avatarId, classId, username, name, password, timezone, subjects } = body;

    const safeThemeId = themeId || "cyberpunk";
    const safeBackgroundId = normalizeAppBackgroundId(backgroundId) || "simple";
    const safeClassId = classId || avatarId || "class_scholar";

    const userUpdates: any = {
      activeTheme: safeThemeId,
      activeBackground: safeBackgroundId,
      activeAvatar: safeClassId,
      hasCompletedOnboarding: true,
    };

    // Optional timezone detection / configuration
    if (timezone && typeof timezone === "string" && TimezoneService.validateTimezone(timezone)) {
      userUpdates.timezone = timezone;
    }

    // Optional customized username during onboarding
    if (username) {
      const cleanUsername = String(username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        return NextResponse.json(
          { error: "Username must be 3-20 characters long and contain only lowercase letters, numbers, and underscores." },
          { status: 400 }
        );
      }
      if (cleanUsername !== currentUser.username) {
        const existing = await prisma.user.findUnique({ where: { username: cleanUsername } });
        if (existing) {
          return NextResponse.json(
            { error: "This username is already taken. Please choose another." },
            { status: 409 }
          );
        }
        userUpdates.username = cleanUsername;
      }
    }

    // Optional customized display name
    if (name && typeof name === "string" && name.trim().length > 0) {
      userUpdates.name = name.trim().slice(0, 30);
    }

    // Optional password configuration for OAuth users
    if (password && typeof password === "string" && password.length >= 6) {
      userUpdates.password = await hash(password, 10);
    }

    // 2. Perform update in a transaction
    const updatedUser = await executionTransaction(userId, async (tx) => {
      // Unlock selected cosmetics permanently
      const cosmeticsToUnlock = [
        { category: "THEME" as const, itemKey: safeThemeId },
        { category: "BACKGROUND" as const, itemKey: safeBackgroundId },
        { category: "AVATAR" as const, itemKey: safeClassId },
      ];

      for (const cosmetic of cosmeticsToUnlock) {
        await tx.userCosmetic.upsert({
          where: {
            userId_category_itemKey: {
              userId,
              category: cosmetic.category,
              itemKey: cosmetic.itemKey,
            },
          },
          update: {},
          create: {
            userId,
            category: cosmetic.category,
            itemKey: cosmetic.itemKey,
          },
        });
      }

      // Provision subjects and 48-node constellation skeletons if provided
      if (Array.isArray(subjects) && subjects.length > 0) {
        // Track used codes to ensure unique constraint (userId_code) is satisfied
        const existingSubjects =
          typeof tx.subject?.findMany === "function"
            ? (await tx.subject.findMany({
                where: { userId },
                select: { code: true },
              })) || []
            : [];
        const usedCodes = new Set<string>(
          Array.isArray(existingSubjects) ? existingSubjects.map((s) => s.code.toUpperCase()) : []
        );

        for (const sub of subjects) {
          if (!sub.name || !String(sub.name).trim()) continue;
          const cleanName = String(sub.name).trim();

          // Syllabus code is optional: if omitted, generate a clean unique alphanumeric code
          const rawCode = sub.code ? String(sub.code).trim().toUpperCase() : "";
          let cleanCode = rawCode;
          if (!cleanCode) {
            const slug = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "SUB";
            cleanCode = slug;
            let counter = 1;
            while (usedCodes.has(cleanCode)) {
              cleanCode = `${slug.slice(0, 6)}-${counter++}`;
            }
          }
          usedCodes.add(cleanCode);

          const cleanExamBoard = String(sub.examBoard || "CAIE").trim().toUpperCase();
          const cleanLevel = String(sub.level || "A-Level").trim();
          const cleanColor = String(sub.color || "#8B5CF6").trim();
          const cleanSyllabusNote = sub.syllabusNote ? String(sub.syllabusNote).trim().slice(0, 2000) : null;

          const createdSubject = await tx.subject.upsert({
            where: {
              userId_code: { userId, code: cleanCode },
            },
            create: {
              userId,
              name: cleanName,
              code: cleanCode,
              examBoard: cleanExamBoard,
              level: cleanLevel,
              color: cleanColor,
              syllabusNote: cleanSyllabusNote,
            },
            update: {
              name: cleanName,
              examBoard: cleanExamBoard,
              level: cleanLevel,
              color: cleanColor,
              syllabusNote: cleanSyllabusNote,
            },
          });

          // Batch insert 48 constellation skeleton nodes for this subject
          const nodePayloads = SKELETON_NODES.map((node) => ({
            subjectId: createdSubject.id,
            nodeId: node.id,
            tier: node.tier,
            title: `${cleanName} - ${node.label}`,
            description: node.description,
            difficulty: Math.min(5, Math.max(1, Math.ceil(node.tier / 2))),
            spAward: node.tier <= 3 ? 1 : node.tier <= 5 ? 2 : node.tier <= 7 ? 3 : node.tier <= 9 ? 4 : 0,
            progress: 0.0,
            isMastered: false,
          }));

          await tx.subjectNode.createMany({
            data: nodePayloads,
            skipDuplicates: true,
          });
        }
      }

      // Update user record
      return tx.user.update({
        where: { id: userId },
        data: userUpdates,
      });
    });

    if (updatedUser.username) {
      try {
        revalidateTag(`user-${updatedUser.username.toLowerCase()}`, "max");
        revalidateTag(`profile-stats-${updatedUser.username.toLowerCase()}`, "max");
      } catch {}
    }

    const updatedScholarId = updatedUser.scholarId || formatScholarId(updatedUser.id);

    // 3. Issue fresh signed JWT with hasCompletedOnboarding: true and updated timezone
    const tokenPayload: AuthTokenPayload = {
      userId: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      name: updatedUser.name,
      scholarId: updatedScholarId,
      verificationStatus: updatedUser.verificationStatus,
      hunterRank: updatedUser.hunterRank,
      level: updatedUser.level,
      hasCompletedOnboarding: true,
      tokenVersion: updatedUser.tokenVersion,
      timezone: updatedUser.timezone || "UTC",
    };

    const newToken = await signToken(tokenPayload);

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          name: updatedUser.name,
          scholarId: updatedScholarId,
          verificationStatus: updatedUser.verificationStatus,
          hunterRank: updatedUser.hunterRank,
          level: updatedUser.level,
          currentXP: updatedUser.currentXP,
          xpToNextLevel: xpForNextLevel(updatedUser.level),
          hp: updatedUser.hp,
          maxHp: updatedUser.maxHp,
          streakDays: updatedUser.streakDays,
          totalStudyMinutes: updatedUser.totalStudyMinutes,
          hasCompletedOnboarding: true,
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
    console.error("POST /api/user/onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
