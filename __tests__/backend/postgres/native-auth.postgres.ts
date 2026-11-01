// ADR 0009's required tests, on real SQL through the real getSession and route handlers. Provider exchange is mocked, as in auth-defects: no
// real provider was contacted. Each test uses its own users and its own address, so nothing depends on another test's rate limit.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import pg from "pg";
import { createUser, db, nativeRequest, request, tokenFor, type TestUser } from "./support";

const oauth = vi.hoisted(() => ({ profile: null as null | Record<string, unknown> }));
vi.mock("@/lib/oauth", async original => ({ ...(await original<typeof import("@/lib/oauth")>()), exchangeOAuthCode: async () => oauth.profile,
  getOAuthAuthorizationUrl: (provider: string, state: string, redirect: string) => `https://provider.invalid/${provider}?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirect)}` }));
vi.mock("@/lib/email", () => ({ sendSecurityOtpEmail: async () => ({ provider: "test" }), sendVerificationEmail: async () => ({ provider: "test" }) }));

import { getSession } from "@/lib/auth-server";
import { signNativeToken } from "@/lib/auth";
import { POST as nativeLogin } from "@/app/api/auth/native/login/route";
import { POST as nativeRegister } from "@/app/api/auth/native/register/route";
import { POST as nativeToken } from "@/app/api/auth/native/token/route";
import { POST as nativeLogout } from "@/app/api/auth/native/logout/route";
import { GET as oauthStart } from "@/app/api/auth/native/oauth/start/route";
import { GET as oauthCallback } from "@/app/api/auth/callback/[provider]/route";
import { POST as webLogin } from "@/app/api/auth/login/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";
import { GET as listSessions, DELETE as revokeSession } from "@/app/api/user/sessions/route";
import { PATCH as changeSecurity } from "@/app/api/user/security/route";
import { GET as userStats } from "@/app/api/user/stats/route";
import { PATCH as updateAccount } from "@/app/api/user/account/route";
import { POST as onboarding } from "@/app/api/user/onboarding/route";
import { POST as resetProgress } from "@/app/api/user/reset-progress/route";
import { POST as deleteAccount } from "@/app/api/user/account/delete/route";
import { POST as sendCode } from "@/app/api/user/security/send-code/route";
import { POST as confirmEmail } from "@/app/api/auth/verify-email/confirm/route";
import { GET as readSession, POST as startSession } from "@/app/api/sessions/route";
import { GET as listGoals } from "@/app/api/goals/route";
import { GET as readQuest, PATCH as patchQuest } from "@/app/api/quests/[id]/route";
import { GET as readMessages } from "@/app/api/conversations/[id]/messages/route";

let pool: pg.Pool;
beforeAll(() => { pool = db(); });
afterAll(async () => { await pool.end(); });

const PASSWORD = "correct horse battery";
let addresses = 0;
const address = () => { addresses++; return { "x-real-ip": `10.20.${Math.floor(addresses / 250)}.${addresses % 250 + 1}` }; };
const passwordUser = async (overrides: Record<string, unknown> = {}) => createUser(pool, { password: await bcrypt.hash(PASSWORD, 4), ...overrides });

interface Issued { accessToken: string; refreshToken: string; sessionId: string; userId: number; accessExpiresAt: number }
async function signIn(user: TestUser, clientName = "Sylf for Mac"): Promise<Issued> {
  const response = await nativeLogin(nativeRequest("/api/auth/native/login", undefined, { method: "POST", body: { identifier: user.email, password: PASSWORD, clientName }, headers: address() }));
  expect(response.status).toBe(200);
  return (await response.json()).session;
}
async function refresh(refreshToken: string) {
  const response = await nativeToken(nativeRequest("/api/auth/native/token", undefined, { method: "POST", body: { grant: "refresh", refreshToken }, headers: address() }));
  const body = await response.json();
  return { status: response.status, code: body.code as string | undefined, session: body.session as Issued | undefined };
}
async function browserSignIn(user: TestUser) {
  const response = await webLogin(request("/api/auth/login", { method: "POST", body: { identifier: user.email, password: PASSWORD }, headers: { ...address(), "user-agent": "Mozilla/5.0 (Macintosh)" } }));
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().find(line => line.startsWith("hunter_token="))!.split(";")[0].split("=")[1];
}
const asNative = (accessToken: string) => getSession(nativeRequest("/api/user/stats", accessToken));
const asBrowser = (token: string) => getSession(request("/api/user/stats", { token }));
const expectSignedOut = async (session: Issued) => { expect(await asNative(session.accessToken)).toBeNull(); expect((await refresh(session.refreshToken)).status).toBe(401); };
const setCookies = (response: Response) => response.headers.getSetCookie();
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

describe("audiences do not cross", () => {
  it("refuses a web token as a bearer, and a native token as a cookie", async () => {
    const user = await passwordUser(); const native = await signIn(user); const web = await browserSignIn(user);
    expect(await asNative(web)).toBeNull();
    expect(await asBrowser(native.accessToken)).toBeNull();
    expect(await asNative(native.accessToken)).toMatchObject({ userId: user.id, sid: native.sessionId });
  });

  it("carries only what revocation needs", async () => {
    const native = await signIn(await passwordUser());
    const claims = JSON.parse(Buffer.from(native.accessToken.split(".")[1], "base64url").toString());
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "sid", "tokenVersion", "userId"]);
    expect(claims.aud).toBe("sylf-native");
    expect(claims.exp - claims.iat).toBe(900);
  });

  it("refuses forged, expired and incomplete native tokens", async () => {
    const user = await passwordUser(); const native = await signIn(user);
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    const sign = (claims: Record<string, unknown>, expiry: string | number = "15m", secret = key) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuer("sylf").setAudience("sylf-native").setIssuedAt().setExpirationTime(expiry).sign(secret);
    const good = { userId: user.id, sid: native.sessionId, tokenVersion: user.tokenVersion };
    expect(await asNative(await sign(good))).not.toBeNull();
    expect(await asNative(await sign(good, "15m", new TextEncoder().encode("another secret")))).toBeNull();
    expect(await asNative(await sign(good, Math.floor(Date.now() / 1000) - 5))).toBeNull();
    expect(await asNative(await sign({ userId: user.id, tokenVersion: user.tokenVersion }))).toBeNull();
    expect(await asNative(await sign({ userId: user.id, sid: native.sessionId }))).toBeNull();
    expect(await asNative(await sign({ ...good, userId: (await passwordUser()).id }))).toBeNull();
    expect(await asNative(`${native.accessToken.slice(0, -4)}AAAA`)).toBeNull();
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${native.accessToken.split(".")[1]}.`;
    expect(await asNative(none)).toBeNull();
  });

  it("refuses a native token pointing at a browser session row", async () => {
    const user = await passwordUser(); const web = await browserSignIn(user);
    const sid = JSON.parse(Buffer.from(web.split(".")[1], "base64url").toString()).sid;
    expect(await asNative(await signNativeToken({ userId: user.id, sid, tokenVersion: user.tokenVersion }))).toBeNull();
  });

  it("lets a cookie win, and never falls through from a bad cookie to a bearer token", async () => {
    const first = await passwordUser(); const second = await passwordUser();
    const cookie = await browserSignIn(first); const native = await signIn(second);
    expect((await getSession(request("/api/user/stats", { token: cookie, headers: { authorization: `Bearer ${native.accessToken}` } })))?.userId).toBe(first.id);
    expect(await getSession(request("/api/user/stats", { token: "not-a-token", headers: { authorization: `Bearer ${native.accessToken}` } }))).toBeNull();
  });
});

describe("a cookie can never buy a bearer token", () => {
  it("is refused by every native endpoint when a cookie is all it has", async () => {
    const user = await passwordUser(); const cookie = await browserSignIn(user);
    const calls = [
      await nativeLogin(request("/api/auth/native/login", { token: cookie, method: "POST", body: {} })),
      await nativeRegister(request("/api/auth/native/register", { token: cookie, method: "POST", body: {}, headers: address() })),
      await nativeToken(request("/api/auth/native/token", { token: cookie, method: "POST", body: {}, headers: address() })),
      await nativeToken(request("/api/auth/native/token", { token: cookie, method: "POST", body: { grant: "refresh", refreshToken: cookie.slice(0, 200) }, headers: address() })),
      await nativeLogout(request("/api/auth/native/logout", { token: cookie, method: "POST", body: {} })),
    ];
    for (const response of calls) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(setCookies(response)).toEqual([]);
      expect(JSON.stringify(await response.json())).not.toContain("accessToken");
    }
    expect((await pool.query(`SELECT count(*)::int AS n FROM "AuthSession" WHERE "userId"=$1 AND kind='NATIVE'`, [user.id])).rows[0].n).toBe(0);
  });

  it("has no route that mints a native session while reading the session cookie", () => {
    const minting: string[] = [];
    const walk = (directory: string) => { for (const entry of readdirSync(directory)) { const path = join(directory, entry); if (statSync(path).isDirectory()) walk(path); else if (entry === "route.ts" && /openNativeSession\(|rotateNativeSession\(|signNativeToken\(/.test(readFileSync(path, "utf8"))) minting.push(path); } };
    walk(join(process.cwd(), "app"));
    expect(minting.map(path => path.replace(`${process.cwd()}/`, "")).sort()).toEqual(["app/api/auth/native/login/route.ts", "app/api/auth/native/register/route.ts", "app/api/auth/native/token/route.ts"]);
    for (const path of minting) expect(readFileSync(path, "utf8")).not.toMatch(/getSession|getCookie|cookies/);
  });

  it("keeps browsers out of the native endpoints altogether", async () => {
    const user = await passwordUser();
    const response = await nativeLogin(request("/api/auth/native/login", { method: "POST", body: { identifier: user.email, password: PASSWORD, clientName: "Page" }, headers: { "sec-fetch-site": "same-origin", ...address() } }));
    expect(response.status).toBe(403);
    expect(setCookies(response)).toEqual([]);
  });
});

describe("a browser cannot present a bearer token", () => {
  it.each(["same-origin", "same-site", "cross-site", "none"])("refuses Sec-Fetch-Site: %s", async value => {
    const native = await signIn(await passwordUser());
    expect(await getSession(nativeRequest("/api/user/stats", native.accessToken, { headers: { "sec-fetch-site": value } }))).toBeNull();
  });
});

describe("revocation parity", () => {
  it("signs every device out when one signs out everywhere", async () => {
    const user = await passwordUser(); const bystander = await passwordUser();
    const phone = await signIn(user, "Phone"); const tablet = await signIn(user, "Tablet"); const browser = await browserSignIn(user); const other = await signIn(bystander);
    const response = await logoutAll(nativeRequest("/api/auth/logout-all", phone.accessToken, { method: "POST", body: { password: PASSWORD } }));
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    await expectSignedOut(phone); await expectSignedOut(tablet);
    expect(await asBrowser(browser)).toBeNull();
    expect(await asNative(other.accessToken)).not.toBeNull();
  });

  it("ends native devices when a browser signs out everywhere", async () => {
    const user = await passwordUser(); const phone = await signIn(user); const browser = await browserSignIn(user);
    expect((await logoutAll(request("/api/auth/logout-all", { token: browser, method: "POST", body: { password: PASSWORD } }))).status).toBe(200);
    await expectSignedOut(phone);
    expect(await asBrowser(browser)).toBeNull();
  });

  it("keeps the native device that changes a password, and ends the others", async () => {
    const user = await passwordUser(); const phone = await signIn(user, "Phone"); const tablet = await signIn(user, "Tablet"); const browser = await browserSignIn(user);
    const response = await changeSecurity(nativeRequest("/api/user/security", phone.accessToken, { method: "PATCH", body: { action: "password", currentPassword: PASSWORD, newPassword: `${PASSWORD} two`, confirmPassword: `${PASSWORD} two` } }));
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    await expectSignedOut(tablet);
    expect(await asBrowser(browser)).toBeNull();
    // Its access token carries the old version, so the next request refreshes, and that is allowed, on the same device row.
    expect(await asNative(phone.accessToken)).toBeNull();
    const renewed = await refresh(phone.refreshToken);
    expect(renewed.status).toBe(200);
    expect(renewed.session?.sessionId).toBe(phone.sessionId);
    expect(await asNative(renewed.session!.accessToken)).toMatchObject({ userId: user.id, sid: phone.sessionId });
  });

  it("keeps the browser that changes a password, and ends native devices", async () => {
    const user = await passwordUser(); const phone = await signIn(user); const browser = await browserSignIn(user);
    const response = await changeSecurity(request("/api/user/security", { token: browser, method: "PATCH", body: { action: "password", currentPassword: PASSWORD, newPassword: `${PASSWORD} two`, confirmPassword: `${PASSWORD} two` } }));
    expect(response.status).toBe(200);
    await expectSignedOut(phone);
    const reissued = setCookies(response).find(line => line.startsWith("hunter_token="))!.split(";")[0].split("=")[1];
    expect(await asBrowser(reissued)).not.toBeNull();
  });

  it("ends one device from Settings, in both directions", async () => {
    const user = await passwordUser(); const phone = await signIn(user, "Phone"); const tablet = await signIn(user, "Tablet"); const browser = await browserSignIn(user);
    const response = await revokeSession(request("/api/user/sessions", { token: browser, method: "DELETE", body: { sessionId: phone.sessionId } }));
    expect(response.status).toBe(200);
    await expectSignedOut(phone);
    expect(await asNative(tablet.accessToken)).not.toBeNull();
    const browserRow = (await pool.query(`SELECT id FROM "AuthSession" WHERE "userId"=$1 AND kind='BROWSER'`, [user.id])).rows[0].id;
    const fromNative = await revokeSession(nativeRequest("/api/user/sessions", tablet.accessToken, { method: "DELETE", body: { sessionId: browserRow } }));
    expect(fromNative.status).toBe(200);
    expect(setCookies(fromNative)).toEqual([]);
    expect(await asBrowser(browser)).toBeNull();
  });

  it("ends only this device on sign-out, so a copied token is dead", async () => {
    const user = await passwordUser(); const phone = await signIn(user, "Phone"); const tablet = await signIn(user, "Tablet");
    const response = await nativeLogout(nativeRequest("/api/auth/native/logout", undefined, { method: "POST", body: { refreshToken: phone.refreshToken } }));
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    await expectSignedOut(phone);
    expect(await asNative(tablet.accessToken)).not.toBeNull();
  });

  it("changes nothing when sign-out presents a wrong token", async () => {
    const phone = await signIn(await passwordUser());
    const response = await nativeLogout(nativeRequest("/api/auth/native/logout", undefined, { method: "POST", body: { refreshToken: `${phone.sessionId}.${randomBytes(32).toString("base64url")}` } }));
    expect(response.status).toBe(200);
    expect(await asNative(phone.accessToken)).not.toBeNull();
  });

  it("ends native sessions when a verified provider claims an unverified address", async () => {
    const user = await passwordUser({ verificationStatus: "UNVERIFIED" }); const phone = await signIn(user);
    oauth.profile = { provider: "google", providerAccountId: `claim-${user.id}`, email: user.email, emailVerified: true, username: "claim", name: "Claim" };
    const { handleOAuthSignInOrRegister } = await import("@/lib/auth-service");
    await handleOAuthSignInOrRegister(oauth.profile as never);
    await expectSignedOut(phone);
  });

  it("ends a native session when the account is deleted", async () => {
    const user = await passwordUser(); const phone = await signIn(user);
    expect((await sendCode(nativeRequest("/api/user/security/send-code", phone.accessToken, { method: "POST", body: { action: "DELETE_ACCOUNT" } }))).status).toBe(200);
    const stored = (await pool.query('SELECT token FROM "VerificationToken" WHERE "userId"=$1', [user.id])).rows[0].token as string;
    const response = await deleteAccount(nativeRequest("/api/user/account/delete", phone.accessToken, { method: "POST", body: { code: stored.split(":").at(-1) } }));
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    await expectSignedOut(phone);
    expect((await pool.query('SELECT count(*)::int AS n FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0].n).toBe(0);
  });

  it("ends a session whose row reached its expiry, whatever the tokens say", async () => {
    const phone = await signIn(await passwordUser());
    await pool.query(`UPDATE "AuthSession" SET "expiresAt"=now() - interval '1 second' WHERE id=$1`, [phone.sessionId]);
    await expectSignedOut(phone);
  });
});

describe("refresh rotation", () => {
  it("stores only hashes, and extends the session 30 days from use", async () => {
    const phone = await signIn(await passwordUser());
    await pool.query(`UPDATE "AuthSession" SET "expiresAt"=now() + interval '1 day' WHERE id=$1`, [phone.sessionId]);
    const row = (await pool.query('SELECT "refreshHash", "tokenHash" FROM "AuthSession" WHERE id=$1', [phone.sessionId])).rows[0];
    expect(row.refreshHash).toBe(createHash("sha256").update(phone.refreshToken).digest("hex"));
    expect(row.refreshHash).not.toContain(phone.refreshToken.split(".")[1]);
    expect(row.tokenHash).toBeNull();
    await refresh(phone.refreshToken);
    const days = (await pool.query(`SELECT EXTRACT(EPOCH FROM ("expiresAt" - now())) / 86400 AS days FROM "AuthSession" WHERE id=$1`, [phone.sessionId])).rows[0].days;
    expect(Number(days)).toBeGreaterThan(29.9);
  });

  it("rotates on every use, and the new pair works", async () => {
    const phone = await signIn(await passwordUser());
    const next = await refresh(phone.refreshToken);
    expect(next.status).toBe(200);
    expect(next.session!.refreshToken).not.toBe(phone.refreshToken);
    expect(next.session!.sessionId).toBe(phone.sessionId);
    expect(await asNative(next.session!.accessToken)).not.toBeNull();
    expect((await refresh(next.session!.refreshToken)).status).toBe(200);
  });

  it("lets the old token work once in the grace window, and a second time ends the session", async () => {
    const phone = await signIn(await passwordUser());
    const lost = await refresh(phone.refreshToken);
    const retried = await refresh(phone.refreshToken);
    expect(retried.status).toBe(200);
    expect(retried.session!.refreshToken).not.toBe(lost.session!.refreshToken);
    const third = await refresh(phone.refreshToken);
    expect(third.status).toBe(401);
    expect(third.code).toBe("session_ended");
    expect((await refresh(retried.session!.refreshToken)).status).toBe(401);
    expect(await asNative(retried.session!.accessToken)).toBeNull();
  });

  it("ends the session on reuse after the grace window", async () => {
    const phone = await signIn(await passwordUser());
    const next = await refresh(phone.refreshToken);
    await pool.query(`UPDATE "AuthSession" SET "rotatedAt"=now() - interval '61 seconds' WHERE id=$1`, [phone.sessionId]);
    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(next.session!.refreshToken)).status).toBe(401);
    expect(await asNative(next.session!.accessToken)).toBeNull();
  });

  it("detects a token two generations old, which is what a thief who rotated twice leaves behind", async () => {
    const phone = await signIn(await passwordUser());
    const second = await refresh(phone.refreshToken); const third = await refresh(second.session!.refreshToken);
    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(third.session!.refreshToken)).status).toBe(401);
  });

  it("refuses a refresh token whose secret was never issued, and ends that session", async () => {
    const phone = await signIn(await passwordUser());
    expect((await refresh(`${phone.sessionId}.${randomBytes(32).toString("base64url")}`)).status).toBe(401);
    await expectSignedOut(phone);
  });

  it("refuses when tokenVersion moved, even if nothing ended the row", async () => {
    const user = await passwordUser(); const phone = await signIn(user);
    await pool.query('UPDATE "User" SET "tokenVersion"="tokenVersion" + 1 WHERE id=$1', [user.id]);
    await expectSignedOut(phone);
  });

  it("leaves one usable chain when two refreshes race", async () => {
    const phone = await signIn(await passwordUser());
    const [first, second] = await Promise.all([refresh(phone.refreshToken), refresh(phone.refreshToken)]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    const current = (await pool.query('SELECT "refreshHash" FROM "AuthSession" WHERE id=$1', [phone.sessionId])).rows[0].refreshHash;
    const hashes = [first, second].map(result => createHash("sha256").update(result.session!.refreshToken).digest("hex"));
    expect(hashes.filter(hash => hash === current)).toHaveLength(1);
  });
});

describe("no cookie for a bearer request", () => {
  const onboardingBody = { name: "Onboarded", displayName: "Onboarded", username: undefined };

  it("sets none on the routes that reissue a session", async () => {
    const user = await passwordUser(); let phone = await signIn(user);
    const account = await updateAccount(nativeRequest("/api/user/account", phone.accessToken, { method: "PATCH", body: { name: "Renamed" } }));
    expect(account.status).toBe(200); expect(setCookies(account)).toEqual([]);
    const already = await onboarding(nativeRequest("/api/user/onboarding", phone.accessToken, { method: "POST", body: onboardingBody }));
    expect(already.status).toBe(200); expect(setCookies(already)).toEqual([]);
    expect((await sendCode(nativeRequest("/api/user/security/send-code", phone.accessToken, { method: "POST", body: { action: "RESET_PROGRESS" } }))).status).toBe(200);
    const stored = (await pool.query(`SELECT token FROM "VerificationToken" WHERE "userId"=$1 AND token LIKE 'RESET_PROGRESS:%'`, [user.id])).rows[0].token as string;
    const reset = await resetProgress(nativeRequest("/api/user/reset-progress", phone.accessToken, { method: "POST", body: { code: stored.split(":").at(-1) } }));
    expect(reset.status).toBe(200); expect(setCookies(reset)).toEqual([]);
    const password = await changeSecurity(nativeRequest("/api/user/security", phone.accessToken, { method: "PATCH", body: { action: "password", currentPassword: PASSWORD, newPassword: `${PASSWORD} two`, confirmPassword: `${PASSWORD} two` } }));
    expect(password.status).toBe(200); expect(setCookies(password)).toEqual([]);
    phone = (await refresh(phone.refreshToken)).session!;
    expect(await asNative(phone.accessToken)).not.toBeNull();
  });

  it("sets none on first onboarding", async () => {
    const user = await passwordUser({ hasCompletedOnboarding: false }); const phone = await signIn(user);
    const response = await onboarding(nativeRequest("/api/user/onboarding", phone.accessToken, { method: "POST", body: { name: "New", timezone: "UTC" } }));
    expect(setCookies(response)).toEqual([]);
    expect(response.status).toBeLessThan(500);
  });

  it("sets none on a refused stats read, and still clears a browser's cookie there", async () => {
    const refused = await userStats(nativeRequest("/api/user/stats", "not.a.token"));
    expect(refused.status).toBe(401); expect(setCookies(refused)).toEqual([]);
    const browser = await userStats(request("/api/user/stats", { token: "not-a-token" }));
    expect(browser.status).toBe(401); expect(setCookies(browser).join()).toContain("hunter_token=;");
  });

  it("still reissues a browser's cookie", async () => {
    const user = await passwordUser(); const browser = await browserSignIn(user);
    const response = await updateAccount(request("/api/user/account", { token: browser, method: "PATCH", body: { name: "Renamed" } }));
    expect(setCookies(response).join()).toContain("hunter_token=");
  });
});

describe("ownership with a native token", () => {
  it("refuses another person's rows on owned routes", async () => {
    const owner = await passwordUser(); const stranger = await passwordUser(); const native = await signIn(stranger);
    const ownerCookie = await tokenFor(owner);
    const started = await (await startSession(request("/api/sessions", { token: ownerCookie, method: "POST", body: {} }))).json();
    expect((await readSession(nativeRequest(`/api/sessions?id=${started.id}`, native.accessToken))).status).toBe(404);
    expect((await readSession(nativeRequest(`/api/sessions?id=${started.id}&expectedOwnerId=${owner.id}`, native.accessToken))).status).toBe(409);
    const goal = (await pool.query(`INSERT INTO "Goal" ("userId", title, "targetWeeks") VALUES ($1, 'Private goal', 4) RETURNING id`, [owner.id])).rows[0].id;
    const quest = (await pool.query(`INSERT INTO "Quest" ("userId", title, "scheduledFor") VALUES ($1, 'Private quest', '2026-11-01') RETURNING id`, [owner.id])).rows[0].id;
    const goals = await (await listGoals(nativeRequest("/api/goals", native.accessToken))).json();
    expect(JSON.stringify(goals)).not.toContain("Private goal");
    expect(goal).toBeGreaterThan(0);
    expect((await readQuest(nativeRequest(`/api/quests/${quest}`, native.accessToken), params({ id: String(quest) }))).status).toBeGreaterThanOrEqual(403);
    expect((await patchQuest(nativeRequest(`/api/quests/${quest}`, native.accessToken, { method: "PATCH", body: { title: "Taken" } }), params({ id: String(quest) }))).status).toBeGreaterThanOrEqual(403);
    expect((await pool.query('SELECT title FROM "Quest" WHERE id=$1', [quest])).rows[0].title).toBe("Private quest");
    const conversation = (await pool.query(`INSERT INTO "Conversation" ("updatedAt") VALUES (now()) RETURNING id`)).rows[0].id;
    await pool.query(`INSERT INTO "ConversationParticipant" ("userId", "conversationId") VALUES ($1, $2)`, [owner.id, conversation]);
    expect((await readMessages(nativeRequest(`/api/conversations/${conversation}/messages?after=0`, native.accessToken), params({ id: String(conversation) }))).status).toBe(403);
  });

  it("refuses expectedOwnerId naming someone else when starting a session", async () => {
    const owner = await passwordUser(); const stranger = await passwordUser(); const native = await signIn(stranger);
    const response = await startSession(nativeRequest("/api/sessions", native.accessToken, { method: "POST", body: { executionProtocol: 2, clientSessionKey: crypto.randomUUID(), startedAt: new Date().toISOString(), expectedOwnerId: owner.id } }));
    expect(response.status).toBe(409);
  });

  it("lists a native device beside browsers, with the current one marked and no token material", async () => {
    const user = await passwordUser(); const phone = await signIn(user, "Sylf for Android"); await browserSignIn(user);
    const response = await listSessions(nativeRequest("/api/user/sessions", phone.accessToken));
    const body = await response.json();
    expect(body.sessions).toHaveLength(2);
    const own = body.sessions.find((session: { isCurrent: boolean }) => session.isCurrent);
    expect(own).toMatchObject({ id: phone.sessionId, device: "Sylf for Android", platform: "Sylf app" });
    expect(JSON.stringify(body)).not.toMatch(/refreshHash|previousRefreshHash/);
    expect(setCookies(response)).toEqual([]);
  });
});

describe("password sign-in and registration", () => {
  it("shares the web's account limit, across both routes", async () => {
    const user = await passwordUser();
    for (let attempt = 0; attempt < 10; attempt++) await nativeLogin(nativeRequest("/api/auth/native/login", undefined, { method: "POST", body: { identifier: user.email, password: "wrong password", clientName: "Mac" }, headers: address() }));
    const limited = await nativeLogin(nativeRequest("/api/auth/native/login", undefined, { method: "POST", body: { identifier: user.email, password: PASSWORD, clientName: "Mac" }, headers: address() }));
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    const web = await webLogin(request("/api/auth/login", { method: "POST", body: { identifier: user.email, password: PASSWORD }, headers: address() }));
    expect(web.status).toBe(429);
  });

  it("refuses a wrong password and opens no session", async () => {
    const user = await passwordUser();
    const response = await nativeLogin(nativeRequest("/api/auth/native/login", undefined, { method: "POST", body: { identifier: user.email, password: "wrong password", clientName: "Mac" }, headers: address() }));
    expect(response.status).toBe(401);
    expect((await pool.query('SELECT count(*)::int AS n FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0].n).toBe(0);
  });

  it.each([
    ["control characters in a client name", { clientName: "Mac\u0000" }],
    ["a missing client name", { clientName: undefined }],
    ["an oversized client name", { clientName: "x".repeat(65) }],
  ])("refuses %s", async (_label, change) => {
    const user = await passwordUser();
    const response = await nativeLogin(nativeRequest("/api/auth/native/login", undefined, { method: "POST", body: { identifier: user.email, password: PASSWORD, ...(change as Record<string, unknown>) }, headers: address() }));
    expect(response.status).toBe(400);
  });

  it("registers through the web's own profile code, with a session and no cookie", async () => {
    const tag = randomBytes(4).toString("hex");
    const response = await nativeRegister(nativeRequest("/api/auth/native/register", undefined, { method: "POST", body: { email: `n${tag}@local.test`, password: PASSWORD, name: "New", username: `n${tag}`, timezone: "Asia/Karachi", clientName: "Sylf for Mac" }, headers: address() }));
    expect(response.status).toBe(201);
    expect(setCookies(response)).toEqual([]);
    const body = await response.json();
    expect(body.user).toMatchObject({ username: `n${tag}`, hunterRank: "E", level: 1, hasCompletedOnboarding: false, verificationStatus: "UNVERIFIED" });
    expect(await asNative(body.session.accessToken)).toMatchObject({ userId: body.user.id });
    expect((await pool.query('SELECT count(*)::int AS n FROM "UserPrivacy" WHERE "userId"=$1', [body.user.id])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT kind FROM "AuthSession" WHERE "userId"=$1', [body.user.id])).rows.map(row => row.kind)).toEqual(["NATIVE"]);
  });

  it("refuses a taken address, and registration closes in prelaunch", async () => {
    const user = await passwordUser();
    const taken = await nativeRegister(nativeRequest("/api/auth/native/register", undefined, { method: "POST", body: { email: user.email, password: PASSWORD, name: "Copy", username: `c${randomBytes(4).toString("hex")}`, clientName: "Mac" }, headers: address() }));
    expect(taken.status).toBe(409);
    process.env.PRELAUNCH_MODE = "true";
    try {
      const closed = await nativeRegister(nativeRequest("/api/auth/native/register", undefined, { method: "POST", body: {}, headers: address() }));
      expect(closed.status).toBe(403);
      expect((await closed.json()).code).toBe("closed");
    } finally { process.env.PRELAUNCH_MODE = ""; }
  });

  it("stamps a browser row as a browser", async () => {
    const user = await passwordUser(); await browserSignIn(user);
    expect((await pool.query('SELECT kind FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0].kind).toBe("BROWSER");
  });
});

describe("OAuth with PKCE", () => {
  const verifier = () => randomBytes(32).toString("base64url");
  const challengeOf = (value: string) => createHash("sha256").update(value).digest("base64url");
  const start = async (challenge: string, redirect = "sylf-native://auth", provider = "google") => oauthStart(request(`/api/auth/native/oauth/start?provider=${provider}&challenge=${challenge}&redirect=${encodeURIComponent(redirect)}`, { headers: { "sec-fetch-site": "none" } }));
  const stateOf = async (challenge: string, redirect?: string) => new URL((await start(challenge, redirect)).headers.get("location")!).searchParams.get("state")!;
  const callback = (state: string, extra: { token?: string; cookies?: Record<string, string> } = {}) => oauthCallback(request(`/api/auth/callback/google?code=provider-code&state=${encodeURIComponent(state)}`, extra), params({ provider: "google" }));
  const redeem = (code: string, secret: string, clientName = "Sylf for Mac") => nativeToken(nativeRequest("/api/auth/native/token", undefined, { method: "POST", body: { grant: "oauth_code", code, verifier: secret, clientName }, headers: address() }));
  const flow = async (user: TestUser, secret = verifier()) => {
    oauth.profile = { provider: "google", providerAccountId: `pkce-${user.id}`, email: user.email, emailVerified: true, username: "pkce", name: "PKCE" };
    const location = (await callback(await stateOf(challengeOf(secret)))).headers.get("location")!;
    return { secret, location, code: new URL(location).searchParams.get("code")! };
  };

  it("hands a code to the app, which redeems it once with its verifier", async () => {
    const user = await passwordUser();
    const { secret, code, location } = await flow(user);
    expect(location.startsWith("sylf-native://auth?code=")).toBe(true);
    const response = await redeem(code, secret);
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    const body = await response.json();
    expect(body.user.id).toBe(user.id);
    expect(await asNative(body.session.accessToken)).toMatchObject({ userId: user.id });
    expect((await redeem(code, secret)).status).toBe(401);
  });

  it("makes a stolen code useless without the verifier", async () => {
    const { code, secret } = await flow(await passwordUser());
    expect((await redeem(code, verifier())).status).toBe(401);
    expect((await redeem(code, secret)).status).toBe(200);
  });

  it("refuses a code past its 60 seconds", async () => {
    const user = await passwordUser(); const { code, secret } = await flow(user);
    await pool.query(`UPDATE "VerificationToken" SET "expiresAt"=now() - interval '1 second' WHERE "userId"=$1 AND action='NATIVE_OAUTH'`, [user.id]);
    expect((await redeem(code, secret)).status).toBe(401);
  });

  it("stores only a hash of the code, under a prefix the public email route refuses", async () => {
    const user = await passwordUser(); const { code } = await flow(user);
    const stored = (await pool.query(`SELECT token FROM "VerificationToken" WHERE "userId"=$1 AND action='NATIVE_OAUTH'`, [user.id])).rows[0].token as string;
    expect(stored.startsWith("NATIVE_OAUTH:")).toBe(true);
    expect(stored).not.toContain(code);
    expect((await confirmEmail(request("/api/auth/verify-email/confirm", { method: "POST", body: { token: stored } }))).status).toBe(400);
  });

  it("ignores a cookie in the system browser, and links nothing to that person", async () => {
    const browserUser = await passwordUser(); const appUser = await passwordUser();
    const cookie = await browserSignIn(browserUser);
    const secret = verifier();
    oauth.profile = { provider: "google", providerAccountId: `other-${appUser.id}`, email: appUser.email, emailVerified: true, username: "other", name: "Other" };
    const location = (await callback(await stateOf(challengeOf(secret)), { token: cookie, cookies: { oauth_link_user_google: String(browserUser.id) } })).headers.get("location")!;
    expect((await pool.query('SELECT count(*)::int AS n FROM "ConnectedAccount" WHERE "userId"=$1', [browserUser.id])).rows[0].n).toBe(0);
    const body = await (await redeem(new URL(location).searchParams.get("code")!, secret)).json();
    expect(body.user.id).toBe(appUser.id);
  });

  it("sets no cookie, on start or callback", async () => {
    const user = await passwordUser(); const challenge = challengeOf(verifier());
    const started = await start(challenge);
    expect(setCookies(started)).toEqual([]);
    oauth.profile = { provider: "google", providerAccountId: `quiet-${user.id}`, email: user.email, emailVerified: true, username: "quiet", name: "Quiet" };
    const finished = await callback(new URL(started.headers.get("location")!).searchParams.get("state")!);
    expect(setCookies(finished)).toEqual([]);
  });

  it.each(["https://evil.invalid/auth", "sylf-native://evil", "http://localhost:4000/auth", "http://127.0.0.1:4000/other", "http://127.0.0.1:1/auth"])("refuses the redirect %s", async redirect => {
    expect((await start(challengeOf(verifier()), redirect)).status).toBe(400);
  });

  it("accepts Electron's loopback port", async () => {
    const started = await start(challengeOf(verifier()), "http://127.0.0.1:48213/auth");
    expect(started.status).toBe(307);
  });

  it("refuses a malformed challenge", async () => {
    expect((await start("short")).status).toBe(400);
  });

  it("treats a forged state as a web flow, which its missing cookie refuses", async () => {
    const forged = await new SignJWT({ provider: "google", challenge: challengeOf(verifier()), redirect: "sylf-native://auth" }).setProtectedHeader({ alg: "HS256" }).setIssuer("sylf").setAudience("sylf-native-oauth").setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode("another secret"));
    const location = (await callback(forged)).headers.get("location")!;
    expect(location).toContain("/login?error=");
  });

  it("refuses a state signed for another provider, and any redirect a signed state did not come with", async () => {
    const state = await stateOf(challengeOf(verifier()));
    const other = await oauthCallback(request(`/api/auth/callback/github?code=c&state=${encodeURIComponent(state)}`), params({ provider: "github" }));
    expect(other.headers.get("location")).toContain("/login?error=");
    const evil = await new SignJWT({ provider: "google", challenge: challengeOf(verifier()), redirect: "https://evil.invalid/auth" }).setProtectedHeader({ alg: "HS256" }).setIssuer("sylf").setAudience("sylf-native-oauth").setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect((await callback(evil)).headers.get("location")).toContain("/login?error=");
  });

  it("is refused as a bearer token: the state is not a credential", async () => {
    expect(await asNative(await stateOf(challengeOf(verifier())))).toBeNull();
  });

  it("reports a provider refusal to the app without a code", async () => {
    const response = await oauthCallback(request(`/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(await stateOf(challengeOf(verifier())))}`), params({ provider: "google" }));
    expect(response.headers.get("location")).toBe("sylf-native://auth?error=cancelled");
  });

  it("refuses an unverified provider address that matches an account, as the web does", async () => {
    const user = await passwordUser(); const secret = verifier();
    oauth.profile = { provider: "google", providerAccountId: `unverified-${user.id}`, email: user.email, emailVerified: false, username: "unverified", name: "Unverified" };
    const response = await callback(await stateOf(challengeOf(secret)));
    expect(response.headers.get("location")).toBe("sylf-native://auth?error=failed");
  });
});
