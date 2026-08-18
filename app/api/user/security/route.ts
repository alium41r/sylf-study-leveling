import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || "hunter-system-secret-key-change-in-production"
);

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
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
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
        where: { id: payload.userId as number } 
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
      
      // Update user in DB. Fully transactional in Prisma by default for a single update.
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      // Issue new token with 30-day expiration to refresh the session
      const newToken = await new SignJWT({
        userId: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        hunterRank: user.hunterRank,
        level: user.level,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(secretKey);

      const response = NextResponse.json({ 
        message: "Password changed successfully.",
        token: newToken 
      }, { status: 200 });

      response.cookies.set({
        name: 'hunter_token',
        value: newToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
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
