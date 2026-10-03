import { executionTransaction } from "@/lib/execution-coordination";
import { NextRequest, NextResponse } from "next/server";
import { assertNoLinkedQuests, assertNoPlannerGoals, isPlannerConflict } from "@/lib/planner/server/mutation-guards";
import { getSession } from "@/lib/auth-server";
import { signToken, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { invalidateRankingsCache } from "@/lib/cache-service";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, password: true, verificationStatus: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await assertNoLinkedQuests(session.userId);
    await assertNoPlannerGoals(session.userId);
    const body = await req.json().catch(() => ({}));
    const { code, password } = body;
    let verifiedTokenId: number | null = null;

    // Unverified accounts can authenticate directly via password
    if (user.verificationStatus === "UNVERIFIED" && password) {
      if (!user.password) {
        return NextResponse.json({ error: "No password configured for this account." }, { status: 400 });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "Incorrect password. Progress reset cancelled." }, { status: 400 });
      }
    } else {
      // Verified accounts (or OTP path) require valid 6-digit OTP
      if (!code || typeof code !== "string" || code.trim().length !== 6) {
        return NextResponse.json(
          { error: "A valid 6-digit security code or password is required." },
          { status: 400 }
        );
      }

      const tokenKey = `RESET_PROGRESS:${code.trim()}`;
      const validToken = await prisma.verificationToken.findFirst({
        where: {
          userId: session.userId,
          token: tokenKey,
          expiresAt: { gt: new Date() },
        },
      });

      if (!validToken) {
        return NextResponse.json(
          { error: "Invalid or expired security code. Please request a new one." },
          { status: 400 }
        );
      }

      verifiedTokenId = validToken.id;
    }

    // Execute atomic reset
    const updatedUser = await executionTransaction(session.userId, async tx => {
      await assertNoLinkedQuests(session.userId, {}, tx);
      await assertNoPlannerGoals(session.userId, undefined, tx);
      if (await tx.studySession.findFirst({ where: { userId: session.userId, endedAt: null }, select: { id: true } })) {
        throw new Error("PLANNER_EXECUTION_PROTECTED: end the active study session before resetting progress");
      }
      if (verifiedTokenId !== null) {
        const consumed = await tx.verificationToken.deleteMany({ where: { id: verifiedTokenId, userId: session.userId,
          token: `RESET_PROGRESS:${code.trim()}`, expiresAt: { gt: new Date() } } });
        if (consumed.count !== 1) throw new Error("SECURITY_CODE_EXPIRED_OR_USED");
      }
      // 1. Reset user progress fields
      const u = await tx.user.update({
        where: { id: session.userId },
        data: {
          level: 1,
          currentXP: 0,
          hunterRank: "E",
          hp: 100,
          maxHp: 100,
          streakDays: 0,
          totalStudyMinutes: 0,
          totalStudySeconds: 0,
        },
      });
      // User and UserStats are mirrors of the same progression authority.
      // Preserve purchases/investments while resetting the requested XP history.
      await tx.userStats.updateMany({ where: { userId: session.userId }, data: { level: 1, xp: 0, rank: "RANK E" } });
      await tx.xpLedger.deleteMany({ where: { userId: session.userId } });

      // 2. Wipe user quest logs and active quests
      await tx.quest.deleteMany({ where: { userId: session.userId } });

      // 3. Wipe study sessions
      await tx.studySession.deleteMany({ where: { userId: session.userId } });

      // 4. Wipe currency and HP transaction histories
      await tx.sylphLedger.deleteMany({ where: { userId: session.userId } });
      await tx.hpLedger.deleteMany({ where: { userId: session.userId } });

      return u;
    });

    invalidateRankingsCache();

    // Sign fresh token with updated stats
    const newToken = await signToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      name: updatedUser.name,
      scholarId: updatedUser.scholarId,
      verificationStatus: updatedUser.verificationStatus,
      hunterRank: updatedUser.hunterRank,
      level: updatedUser.level,
      hasCompletedOnboarding: updatedUser.hasCompletedOnboarding,
      hasPassword: updatedUser.password !== null,
      tokenVersion: updatedUser.tokenVersion,
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Your hunter progression has been reset to Level 1.",
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          level: updatedUser.level,
          currentXP: updatedUser.currentXP,
          hunterRank: updatedUser.hunterRank,
          hp: updatedUser.hp,
          maxHp: updatedUser.maxHp,
          streakDays: updatedUser.streakDays,
          totalStudyMinutes: updatedUser.totalStudyMinutes,
        },
      },
      { status: 200 }
    );

    response.cookies.set(AUTH_COOKIE_NAME, newToken, AUTH_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "SECURITY_CODE_EXPIRED_OR_USED") return NextResponse.json({ error: "Invalid or expired security code. Please request a new one." }, { status: 400 });
    if (isPlannerConflict(error)) return NextResponse.json({ error: "PLANNER_REVIEW_REQUIRED" }, { status: 409 });
    console.error("Reset progress error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
