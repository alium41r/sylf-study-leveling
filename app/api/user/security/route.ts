import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { signToken, AUTH_COOKIE_OPTIONS, type AuthTokenPayload } from "@/lib/auth";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "New password and confirmation do not match.",
  path: ["confirmPassword"],
}).refine(data => data.currentPassword !== data.newPassword, {
  message: "New password must be different from your current password.",
  path: ["newPassword"],
});

export async function PATCH(req: NextRequest) {
  try {
    // S3: cookie-only session (no Bearer fallback).
    const payload = await getSession(req);
    if (!payload) {
      return NextResponse.json({ error: "Invalid session. Please log in again." }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "password") {
      const validation = passwordSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: validation.error.issues[0].message },
          { status: 400 }
        );
      }

      const { currentPassword, newPassword } = validation.data;

      // Note: We avoid logging passwords anywhere on the server.

      const user = await prisma.user.findUnique({
        where: { id: payload.userId as number },
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (!user.password) {
        return NextResponse.json(
          { error: "This account was registered using OAuth. Password cannot be changed this way." },
          { status: 400 }
        );
      }

      // Verify current password
      const passwordMatches = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatches) {
        // Generic response for incorrect current password to avoid leaking specifics
        return NextResponse.json({ error: "Incorrect current password." }, { status: 401 });
      }

      // Hash the new password securely
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // S3 session revocation: bump tokenVersion so every previously issued
      // token (other devices) is rejected by getSession.
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, tokenVersion: { increment: 1 } },
      });

      // Issue a fresh cookie-only token with the new version for THIS device.
      const tokenPayload: AuthTokenPayload = {
        userId: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        username: updatedUser.username,
        scholarId: updatedUser.scholarId,
        verificationStatus: updatedUser.verificationStatus,
        hunterRank: updatedUser.hunterRank,
        level: updatedUser.level,
        hasCompletedOnboarding: updatedUser.hasCompletedOnboarding,
        tokenVersion: updatedUser.tokenVersion,
        timezone: updatedUser.timezone || "UTC",
      };
      const newToken = await signToken(tokenPayload);

      const response = NextResponse.json(
        { message: "Password changed successfully." },
        { status: 200 }
      );

      response.cookies.set({
        ...AUTH_COOKIE_OPTIONS,
        value: newToken,
      });

      return response;

    } else if (action === "2fa") {
      // Placeholder architecture for future Two-Factor Authentication implementation
      // e.g., generating OTP secrets, sending verification emails/SMS, etc.
      return NextResponse.json(
        { error: "Two-Factor Authentication is not yet implemented." },
        { status: 501 }
      );
    } else {
      return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
    }

  } catch (err) {
    console.error("Error in security update:", err);
    return NextResponse.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}
