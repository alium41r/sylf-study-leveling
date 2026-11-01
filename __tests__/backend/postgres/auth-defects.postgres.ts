import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createUser, db, request, tokenFor, type TestUser } from "./support";

const oauth = vi.hoisted(() => ({ profile: null as null | Record<string, unknown> }));
vi.mock("@/lib/oauth", async original => ({ ...(await original<typeof import("@/lib/oauth")>()), exchangeOAuthCode: async () => oauth.profile }));
vi.mock("@/lib/email", () => ({ sendSecurityOtpEmail: async () => ({ provider: "test" }), sendVerificationEmail: async () => ({ provider: "test" }) }));

import { getSession } from "@/lib/auth-server";
import { GET as callback } from "@/app/api/auth/callback/[provider]/route";
import { GET as listSessions, DELETE as revokeSession } from "@/app/api/user/sessions/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as sendCode } from "@/app/api/user/security/send-code/route";
import { POST as deleteAccount } from "@/app/api/user/account/delete/route";
import { POST as confirmEmail } from "@/app/api/auth/verify-email/confirm/route";
import { PATCH as updateAccount } from "@/app/api/user/account/route";
import { GET as userStats } from "@/app/api/user/stats/route";
import { GET as adminBackgrounds } from "@/app/api/admin/focus-backgrounds/route";
import bcrypt from "bcryptjs";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

let pool: pg.Pool;
beforeAll(() => { pool = db(); });
afterAll(async () => { await pool.end(); });
const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
const cookieValue = (response: Response) => response.headers.getSetCookie().find(line => line.startsWith(`${AUTH_COOKIE_NAME}=`))?.split(";")[0].split("=")[1];

describe("OAuth account linking", () => {
  const callbackRequest = (cookies: Record<string, string>) => request("/api/auth/callback/google?code=attacker-code&state=s1", { cookies: { oauth_state_google: "s1", ...cookies } });
  const accountsOf = async (user: TestUser) => (await pool.query('SELECT "providerAccountId" FROM "ConnectedAccount" WHERE "userId"=$1', [user.id])).rows;

  it("never links a provider to a user named only by the forgeable oauth_link_user cookie", async () => {
    const victim = await createUser(pool);
    oauth.profile = { provider: "google", providerAccountId: `attacker-${victim.id}`, email: `attacker-${victim.id}@local.test`, emailVerified: true, username: "attacker", name: "Attacker" };
    await callback(callbackRequest({ oauth_link_user_google: String(victim.id) }), params("google"));
    expect(await accountsOf(victim)).toEqual([]);
  });

  it("refuses a link cookie that names a different user from the signed-in session", async () => {
    const victim = await createUser(pool); const attacker = await createUser(pool);
    oauth.profile = { provider: "google", providerAccountId: `attacker2-${victim.id}`, email: `attacker2-${victim.id}@local.test`, emailVerified: true, username: "attacker2", name: "Attacker" };
    await callback(callbackRequest({ hunter_token: await tokenFor(attacker), oauth_link_user_google: String(victim.id) }), params("google"));
    expect(await accountsOf(victim)).toEqual([]);
    expect(await accountsOf(attacker)).toEqual([]);
  });

  it("still links for the signed-in person who started the flow", async () => {
    const owner = await createUser(pool);
    oauth.profile = { provider: "google", providerAccountId: `owner-${owner.id}`, email: `owner-${owner.id}@local.test`, emailVerified: true, username: "owner", name: "Owner" };
    await callback(callbackRequest({ hunter_token: await tokenFor(owner), oauth_link_user_google: String(owner.id) }), params("google"));
    expect((await accountsOf(owner)).map(row => row.providerAccountId)).toEqual([`owner-${owner.id}`]);
  });
});

describe("device sessions", () => {
  async function signIn(user: TestUser, password: string) {
    const response = await login(request("/api/auth/login", { method: "POST", body: { identifier: user.email, password }, headers: { "x-real-ip": `10.0.${user.id % 250}.1`, "user-agent": "Mozilla/5.0 (Macintosh)" } }));
    expect(response.status).toBe(200);
    return cookieValue(response)!;
  }
  const passwordUser = async () => { const password = "correct horse"; const user = await createUser(pool, { password: await bcrypt.hash(password, 4) }); return { user, password }; };

  it("lists a device from the moment it signs in", async () => {
    const { user, password } = await passwordUser();
    await signIn(user, password);
    expect((await pool.query('SELECT count(*)::int AS n FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0].n).toBe(1);
  });

  it("ends a revoked device at once", async () => {
    const { user, password } = await passwordUser();
    const phone = await signIn(user, password); const laptop = await signIn(user, password);
    const listed = await (await listSessions(request("/api/user/sessions", { token: laptop }))).json();
    expect(listed.sessions).toHaveLength(2);
    const other = listed.sessions.find((session: { isCurrent: boolean }) => !session.isCurrent);
    expect((await revokeSession(request("/api/user/sessions", { token: laptop, method: "DELETE", body: { sessionId: other.id } }))).status).toBe(200);
    expect(await getSession(request("/api/user/stats", { token: phone }))).toBeNull();
    expect(await getSession(request("/api/user/stats", { token: laptop }))).not.toBeNull();
  });

  it("keeps a revoked device out after its token was reissued", async () => {
    const { user, password } = await passwordUser();
    const phone = await signIn(user, password); const laptop = await signIn(user, password);
    const renamed = await updateAccount(request("/api/user/account", { token: phone, method: "PATCH", body: { name: "Renamed" } }));
    const reissued = cookieValue(renamed) ?? phone;
    const listed = await (await listSessions(request("/api/user/sessions", { token: laptop }))).json();
    const other = listed.sessions.find((session: { isCurrent: boolean }) => !session.isCurrent);
    await revokeSession(request("/api/user/sessions", { token: laptop, method: "DELETE", body: { sessionId: other.id } }));
    expect(await getSession(request("/api/user/stats", { token: reissued }))).toBeNull();
  });

  it("ends a token for good when it logs out", async () => {
    const { user, password } = await passwordUser();
    const copied = await signIn(user, password);
    await logout(request("/api/auth/logout", { token: copied, method: "POST" }));
    expect(await getSession(request("/api/user/stats", { token: copied }))).toBeNull();
  });

  it("cannot revoke another person's device", async () => {
    const { user, password } = await passwordUser(); const stranger = await createUser(pool);
    const token = await signIn(user, password);
    const row = (await pool.query('SELECT id FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0];
    expect((await revokeSession(request("/api/user/sessions", { token: await tokenFor(stranger), method: "DELETE", body: { sessionId: row.id } }))).status).toBe(404);
    expect(await getSession(request("/api/user/stats", { token }))).not.toBeNull();
  });

  it("keeps accepting tokens issued before sessions were recorded", async () => {
    const user = await createUser(pool);
    expect(await getSession(request("/api/user/stats", { token: await tokenFor(user) }))).not.toBeNull();
  });

  it("still revokes everything through tokenVersion", async () => {
    const { user, password } = await passwordUser();
    const token = await signIn(user, password);
    await pool.query('UPDATE "User" SET "tokenVersion"="tokenVersion"+1 WHERE id=$1', [user.id]);
    expect(await getSession(request("/api/user/stats", { token }))).toBeNull();
  });
});

describe("security codes", () => {
  it("refuses a second guess after too many wrong codes", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    await sendCode(request("/api/user/security/send-code", { token, method: "POST", body: { action: "DELETE_ACCOUNT" } }));
    const stored = (await pool.query('SELECT token FROM "VerificationToken" WHERE "userId"=$1', [user.id])).rows[0].token as string;
    const real = stored.split(":").at(-1)!;
    const wrong = real === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 8; attempt++) await deleteAccount(request("/api/user/account/delete", { token, method: "POST", body: { code: wrong } }));
    await deleteAccount(request("/api/user/account/delete", { token, method: "POST", body: { code: real } }));
    expect((await pool.query('SELECT count(*)::int AS n FROM "User" WHERE id=$1', [user.id])).rows[0].n).toBe(1);
  });

  it("gives two people the same code without a collision", async () => {
    const first = await createUser(pool); const second = await createUser(pool);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const crypto = await import("node:crypto");
    const draw = vi.spyOn(crypto.default, "randomInt").mockImplementationOnce((() => 550000) as never).mockImplementationOnce((() => 550000) as never);
    try {
      expect((await sendCode(request("/api/user/security/send-code", { token: await tokenFor(first), method: "POST", body: { action: "RESET_PROGRESS" } }))).status).toBe(200);
      expect((await sendCode(request("/api/user/security/send-code", { token: await tokenFor(second), method: "POST", body: { action: "RESET_PROGRESS" } }))).status).toBe(200);
    } finally { random.mockRestore(); draw.mockRestore(); }
  });

  it("does not let the public email endpoint consume a security code or disclose its owner", async () => {
    const user = await createUser(pool, { verificationStatus: "UNVERIFIED" });
    await sendCode(request("/api/user/security/send-code", { token: await tokenFor(user), method: "POST", body: { action: "DELETE_ACCOUNT" } }));
    const stored = (await pool.query('SELECT token FROM "VerificationToken" WHERE "userId"=$1', [user.id])).rows[0].token as string;
    const response = await confirmEmail(request("/api/auth/verify-email/confirm", { method: "POST", body: { token: stored } }));
    expect(response.status).toBe(400);
    expect((await pool.query('SELECT "verificationStatus" FROM "User" WHERE id=$1', [user.id])).rows[0].verificationStatus).toBe("UNVERIFIED");
  });
});

describe("account identity", () => {
  it("does not make an administrator out of an unverified email address", async () => {
    process.env.ADMIN_EMAILS = "future-admin@local.test";
    try {
      const user = await createUser(pool, { verificationStatus: "UNVERIFIED", email: "future-admin@local.test" });
      const token = await tokenFor(user);
      await userStats(request("/api/user/stats", { token }));
      expect((await adminBackgrounds(request("/api/admin/focus-backgrounds", { token }))).status).toBe(403);
      expect((await pool.query('SELECT "isAdmin" FROM "User" WHERE id=$1', [user.id])).rows[0].isAdmin).toBe(false);
    } finally { delete process.env.ADMIN_EMAILS; await pool.query(`DELETE FROM "User" WHERE email='future-admin@local.test'`); }
  });

  it("promotes a verified bootstrap address as before", async () => {
    process.env.ADMIN_EMAILS = "real-admin@local.test";
    try {
      const user = await createUser(pool, { email: "real-admin@local.test" });
      expect((await adminBackgrounds(request("/api/admin/focus-backgrounds", { token: await tokenFor(user) }))).status).toBe(200);
    } finally { delete process.env.ADMIN_EMAILS; await pool.query(`DELETE FROM "User" WHERE email='real-admin@local.test'`); }
  });

  it("refuses an email that differs from an existing one only by case", async () => {
    const owner = await createUser(pool); const other = await createUser(pool);
    const response = await updateAccount(request("/api/user/account", { token: await tokenFor(other), method: "PATCH", body: { email: owner.email.toUpperCase() } }));
    expect(response.status).toBe(409);
  });
});

describe("pre-hijacking through an unverified sign-up", () => {
  it("removes a password nobody proved, and its sessions, when a verified provider claims the address", async () => {
    const { handleOAuthSignInOrRegister } = await import("@/lib/auth-service");
    const squatter = await createUser(pool, { verificationStatus: "UNVERIFIED" });
    const squatterToken = await tokenFor(squatter);
    await handleOAuthSignInOrRegister({ provider: "google", providerAccountId: `real-${squatter.id}`, email: squatter.email, name: "Real owner", username: "owner", avatarUrl: null, emailVerified: true });
    const row = (await pool.query('SELECT password, "verificationStatus" FROM "User" WHERE id=$1', [squatter.id])).rows[0];
    expect(row).toEqual({ password: null, verificationStatus: "VERIFIED" });
    expect(await getSession(request("/api/user/stats", { token: squatterToken }))).toBeNull();
  });

  it("keeps the password of an account that already proved its address", async () => {
    const { handleOAuthSignInOrRegister } = await import("@/lib/auth-service");
    const owner = await createUser(pool);
    const token = await tokenFor(owner);
    await handleOAuthSignInOrRegister({ provider: "google", providerAccountId: `verified-${owner.id}`, email: owner.email, name: "Owner", username: "owner", avatarUrl: null, emailVerified: true });
    expect((await pool.query('SELECT password FROM "User" WHERE id=$1', [owner.id])).rows[0].password).not.toBeNull();
    expect(await getSession(request("/api/user/stats", { token }))).not.toBeNull();
  });

  it("does not call an address verified when the provider did not", async () => {
    const { handleOAuthSignInOrRegister } = await import("@/lib/auth-service");
    const email = `unchecked-${Date.now()}@local.test`;
    const { user } = await handleOAuthSignInOrRegister({ provider: "discord", providerAccountId: email, email, name: "New", username: "newperson", avatarUrl: null, emailVerified: false });
    expect(user.verificationStatus).toBe("UNVERIFIED");
  });
});
