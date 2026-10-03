// ============================================================================
// Admin Authorization Guard (Server-Only)
// ============================================================================
// Protects official background catalog management and background studio APIs.
// Uses User.isAdmin in PostgreSQL as the authoritative source of truth.
// ADMIN_EMAILS is used strictly as a controlled bootstrap mechanism:
// if a user is in ADMIN_EMAILS, their DB record is updated to isAdmin=true
// so User.isAdmin remains the single authoritative permission going forward.
// ============================================================================
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { type AuthTokenPayload } from "@/lib/auth";

export interface AdminAuthResult {
  authorized: boolean;
  user?: {
    id: number;
    email: string;
    username: string;
    isAdmin: boolean;
  };
  payload?: AuthTokenPayload;
  status: number;
  error?: string;
}

/**
 * Checks whether an email is listed in the ADMIN_EMAILS environment variable.
 */
export function isEmailInAdminBootstrap(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  if (!adminEmailsEnv) return false;

  const normalized = email.trim().toLowerCase();
  const allowed = adminEmailsEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(normalized);
}

/**
 * Validates that the requesting client has active session and admin authorization.
 * Single authoritative source: User.isAdmin in database.
 * If user.isAdmin is false but user.email is in ADMIN_EMAILS bootstrap env,
 * promotes User.isAdmin=true in DB so DB remains authoritative.
 */
export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const payload = await getSession(req);
  if (!payload || !payload.userId) {
    return { authorized: false, status: 401, error: "Unauthorized. Please log in." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return { authorized: false, status: 401, error: "User not found." };
    }

    // 1. Authoritative check: User.isAdmin in database
    if (user.isAdmin) {
      return { authorized: true, user, payload, status: 200 };
    }

    // 2. Controlled bootstrap fallback via ADMIN_EMAILS
    if (isEmailInAdminBootstrap(user.email)) {
      // Promote the user in database so User.isAdmin becomes authoritative
      await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true },
      });
      console.log(`[auth-admin] Promoted user ${user.email} (id: ${user.id}) to isAdmin=true via bootstrap.`);
      return {
        authorized: true,
        user: { ...user, isAdmin: true },
        payload,
        status: 200,
      };
    }

    // Otherwise strictly deny access
    return {
      authorized: false,
      status: 403,
      error: "Forbidden. Sylf administrator access is required.",
    };
  } catch (err: any) {
    console.error("[auth-admin] Authorization verification failed:", err);
    return { authorized: false, status: 500, error: "Internal authorization error." };
  }
}
