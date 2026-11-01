// ============================================================================
// What the native sign-in routes share (ADR 0009). The session row itself belongs to lib/auth-session-service.
// ============================================================================
// Every route here accepts a password, a one-time code with its PKCE verifier, or a refresh token. None reads the session cookie and none
// sets one, so a cookie can never buy a bearer token: script in the web app can use its cookie, but it cannot turn it into something that
// outlives the tab.
//
// OAuth needs no state cookie. `state` is signed by this server and names the app's PKCE challenge, and only the instance holding the
// verifier can redeem the code, so a code that lands on the wrong device is useless. Provider configuration does not change: the provider
// still redirects to the web callback, which recognizes the signed state and sends a one-time code back to the app.
// ============================================================================
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSecret, getJwtIssuer, isBrowserRequest } from "@/lib/auth";
import { handleOAuthSignInOrRegister } from "@/lib/auth-service";
import { hashToken } from "@/lib/session-service";
import { exchangeOAuthCode, type OAuthProvider } from "@/lib/oauth";
import { formatScholarId } from "@/lib/scholar-id";
import { NATIVE_OAUTH_CODE_SECONDS, isNativeOAuthRedirect, nativeUserSchema, type NativeAuthErrorCode, type NativeUser } from "@/lib/native-auth-contract";

const OAUTH_STATE_AUDIENCE = "sylf-native-oauth";
const OAUTH_CODE_PREFIX = "NATIVE_OAUTH:";

/** Native auth responses carry credentials, so nothing may store them. */
const NO_STORE = { "Cache-Control": "no-store" };
export const nativeJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const nativeError = (status: number, code: NativeAuthErrorCode, error: string, retryAfterSeconds?: number) =>
  NextResponse.json({ error, code }, { status, headers: { ...NO_STORE, ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) } });

/** Browsers have no business on these routes (ADR 0009 decision 6). Script in the web app cannot read a native token out of one. */
export const refuseBrowser = (req: Request) => (isBrowserRequest(req) ? nativeError(403, "browser_refused", "This endpoint is for Sylf Native.") : null);

export function nativeUser(user: { id: number; email: string; username: string; name: string | null; scholarId: string | null; verificationStatus: string; hunterRank: string; level: number; hasCompletedOnboarding: boolean; avatarUrl: string | null }): NativeUser {
  return nativeUserSchema.parse({ id: user.id, email: user.email, username: user.username, name: user.name, scholarId: user.scholarId || formatScholarId(user.id), verificationStatus: user.verificationStatus, hunterRank: user.hunterRank, level: user.level, hasCompletedOnboarding: user.hasCompletedOnboarding, avatarUrl: user.avatarUrl });
}

export interface NativeOAuthFlow { provider: OAuthProvider; challenge: string; redirect: string }

export async function signNativeOAuthState(flow: NativeOAuthFlow): Promise<string> {
  return new SignJWT({ ...flow, nonce: randomBytes(16).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(getJwtIssuer())
    .setAudience(OAUTH_STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getAuthSecret());
}

/** The flow a callback belongs to, when `state` is one this server signed for this provider. Null for every web flow. */
export async function readNativeOAuthState(state: string | null, provider: OAuthProvider): Promise<NativeOAuthFlow | null> {
  if (!state || !state.includes(".")) return null;
  try {
    const { payload } = await jwtVerify(state, getAuthSecret(), { issuer: getJwtIssuer(), audience: OAUTH_STATE_AUDIENCE });
    if (payload.provider !== provider || typeof payload.challenge !== "string" || typeof payload.redirect !== "string" || !isNativeOAuthRedirect(payload.redirect)) return null;
    return { provider, challenge: payload.challenge, redirect: payload.redirect };
  } catch {
    return null;
  }
}

const codeToken = (code: string, challenge: string) => `${OAUTH_CODE_PREFIX}${hashToken(code)}:${challenge}`;

/** Single use, 60 seconds, bound to the challenge by being part of its key. The prefix contains ":", which the public email route refuses. */
async function issueNativeOAuthCode(userId: number, challenge: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await prisma.verificationToken.deleteMany({ where: { userId, action: "NATIVE_OAUTH", expiresAt: { lt: new Date() } } });
  await prisma.verificationToken.create({ data: { userId, token: codeToken(code, challenge), action: "NATIVE_OAUTH", expiresAt: new Date(Date.now() + NATIVE_OAUTH_CODE_SECONDS * 1000) } });
  return code;
}

/** Redeems a code with its verifier, or returns null. Deleting first is what makes it single use, even for two racing requests. */
export async function redeemNativeOAuthCode(code: string, verifier: string): Promise<number | null> {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  try {
    const row = await prisma.verificationToken.delete({ where: { token: codeToken(code, challenge) }, select: { userId: true, expiresAt: true } });
    return row.expiresAt > new Date() ? row.userId : null;
  } catch (error) {
    // By code, not instanceof: lib/prisma.ts can reload the client in development, and the error class goes with it.
    if ((error as { code?: string } | null)?.code === "P2025") return null;
    throw error;
  }
}

/** The web callback's native branch. Identity comes from the provider alone: a cookie in this browser is never consulted, so nothing is linked. */
export async function completeNativeOAuth(flow: NativeOAuthFlow, origin: string, code: string | null, providerError: string | null): Promise<NextResponse> {
  const back = (params: Record<string, string>) => NextResponse.redirect(`${flow.redirect}?${new URLSearchParams(params)}`);
  if (providerError || !code) return back({ error: "cancelled" });
  try {
    const profile = await exchangeOAuthCode(flow.provider, code, `${origin}/api/auth/callback/${flow.provider}`);
    const { user } = await handleOAuthSignInOrRegister(profile);
    return back({ code: await issueNativeOAuthCode(user.id, flow.challenge) });
  } catch (error) {
    console.error("[auth-native] OAuth sign-in failed:", error instanceof Error ? error.message : "unknown");
    return back({ error: "failed" });
  }
}
