// ============================================================================
// The native sign-in contract (ADR 0009). One definition, read by the server's /api/auth/native/* routes and by Sylf Native's client.
// ============================================================================
// Portable by rule: zod only. No server module, no browser global. It reaches native through @sylf/shared, so the boundary audit reads it.
// ============================================================================
import { z } from "zod";

export { NATIVE_ACCESS_SECONDS, NATIVE_AUDIENCE } from "./native-auth-constants";

/** How long a rotated refresh token still works, once, because a response can be lost in transit. */
export const NATIVE_REFRESH_GRACE_SECONDS = 60;
export const NATIVE_OAUTH_CODE_SECONDS = 60;
export const NATIVE_APP_REDIRECT = "sylf-native://auth";
export const NATIVE_OAUTH_PROVIDERS = ["google", "github", "discord", "instagram"] as const;

/** Sylf Native's own label for this install, shown in Settings beside browsers. */
const clientName = z.string().trim().min(1).max(64).regex(/^[^\p{Cc}]+$/u);
/** RFC 7636: 43 to 128 unreserved characters, and S256 output is always exactly 43. */
const pkceChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const pkceVerifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);

export const nativeLoginRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  clientName,
});

export const nativeRegisterRequestSchema = z.object({
  email: z.string().email("Enter a valid email address").max(320),
  password: z.string().min(6, "Password must be at least 6 characters").max(1024),
  name: z.string().trim().min(1, "Enter your name").max(120),
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username must be at most 20 characters").regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers and underscores in your username"),
  timezone: z.string().max(64).optional(),
  clientName,
});

export const nativeTokenRequestSchema = z.discriminatedUnion("grant", [
  z.object({ grant: z.literal("refresh"), refreshToken: z.string().min(16).max(256) }),
  z.object({ grant: z.literal("oauth_code"), code: z.string().min(16).max(256), verifier: pkceVerifier, clientName }),
]);

export const nativeLogoutRequestSchema = z.object({ refreshToken: z.string().min(16).max(256) });

export const nativeOAuthStartSchema = z.object({
  provider: z.enum(NATIVE_OAUTH_PROVIDERS),
  challenge: pkceChallenge,
  redirect: z.string().max(128),
});

/** Only these can receive a one-time code: the app's own scheme, or a loopback port on Electron. */
export function isNativeOAuthRedirect(value: string): boolean {
  return value === NATIVE_APP_REDIRECT || /^http:\/\/127\.0\.0\.1:\d{4,5}\/auth$/.test(value);
}

/** What every successful sign-in or refresh returns. Electron's main process keeps this and never hands it to the renderer. */
export const nativeSessionSchema = z.object({
  accessToken: z.string().min(1),
  /** Epoch milliseconds. */
  accessExpiresAt: z.number().int().positive(),
  refreshToken: z.string().min(1),
  sessionId: z.string().min(1),
  userId: z.number().int().positive(),
});
export type NativeSession = z.infer<typeof nativeSessionSchema>;

export const nativeUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  scholarId: z.string().nullable(),
  verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]),
  hunterRank: z.string(),
  level: z.number().int(),
  hasCompletedOnboarding: z.boolean(),
  avatarUrl: z.string().nullable(),
});
export type NativeUser = z.infer<typeof nativeUserSchema>;

export const nativeSignInResponseSchema = z.object({ session: nativeSessionSchema, user: nativeUserSchema });
export const nativeRefreshResponseSchema = z.object({ session: nativeSessionSchema });

/** Why a native auth request was refused. `session_ended` is the one that signs a client out. */
export const nativeAuthErrorSchema = z.object({
  error: z.string(),
  code: z.enum(["invalid_request", "invalid_credentials", "rate_limited", "closed", "conflict", "session_ended", "browser_refused"]).optional(),
});
export type NativeAuthErrorCode = NonNullable<z.infer<typeof nativeAuthErrorSchema>["code"]>;
