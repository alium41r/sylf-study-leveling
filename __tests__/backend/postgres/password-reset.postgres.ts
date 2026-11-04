// Expansion Part 2, slice E. Password reset on real SQL: a neutral request, a single-use 30 minute link, and a new password that signs everything out.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createUser, db, request } from "./support";

const mail = vi.hoisted(() => ({ links: [] as { to: string; url: string }[], changed: [] as { to: string }[], later: [] as (() => unknown)[] }));
vi.mock("next/cache", () => ({ unstable_cache: (work: () => unknown) => work, revalidateTag: () => undefined, revalidatePath: () => undefined }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (work: () => unknown) => { mail.later.push(work); } }));
vi.mock("@/lib/email", () => ({
  sendSecurityOtpEmail: async () => ({ sent: true, provider: "test" }),
  sendVerificationEmail: async () => ({ sent: true, provider: "test" }),
  sendEmailChangedNotice: async () => ({ sent: true, provider: "test" }),
  sendPasswordResetEmail: async (params: { to: string; url: string }) => { mail.links.push(params); return { sent: true, provider: "test" }; },
  sendPasswordChangedNotice: async (params: { to: string }) => { mail.changed.push(params); return { sent: true, provider: "test" }; },
}));

import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";

let pool: pg.Pool;
beforeAll(() => { pool = db(); process.env.APP_PUBLIC_URL = "https://sylf.example"; });
afterAll(async () => { await pool.end(); });
beforeEach(() => { mail.links.length = 0; mail.changed.length = 0; mail.later.length = 0; });

const address = () => ({ "x-real-ip": `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}` });
const ask = async (email: string, headers: Record<string, string> = address()) => {
  const response = await forgot(request("/api/auth/forgot-password", { method: "POST", body: { email }, headers }));
  await Promise.all(mail.later.splice(0).map((work) => work()));
  return response;
};
const tokenOf = (url: string) => new URLSearchParams(url.split("#")[1]).get("token")!;
const use = (token: string, password: string) => reset(request("/api/auth/reset-password", { method: "POST", body: { token, password }, headers: address() }));
const column = async (id: number, name: string) => (await pool.query(`SELECT "${name}" AS value FROM "User" WHERE id=$1`, [id])).rows[0].value;

describe("asking for a link", () => {
  it("answers the same for an account and for no account", async () => {
    const user = await createUser(pool);
    const known = await ask(user.email);
    const unknown = await ask(`nobody${randomBytes(4).toString("hex")}@local.test`);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(mail.links).toHaveLength(1);
    expect(mail.links[0].to).toBe(user.email);
  });

  it("sends nothing to an account with no password", async () => {
    const user = await createUser(pool, { password: null });
    expect((await ask(user.email)).status).toBe(200);
    expect(mail.links).toHaveLength(0);
  });

  it("matches the address whatever its case", async () => {
    const user = await createUser(pool);
    await ask(user.email.toUpperCase());
    expect(mail.links).toHaveLength(1);
  });

  it("links to the configured address, never to the one the request claims", async () => {
    const user = await createUser(pool);
    await ask(user.email, { ...address(), host: "evil.example", "x-forwarded-host": "evil.example" });
    expect(mail.links[0].url.startsWith("https://sylf.example/reset-password#token=")).toBe(true);
  });

  it("keeps the token in the fragment and stores only its hash", async () => {
    const user = await createUser(pool);
    await ask(user.email);
    const token = tokenOf(mail.links[0].url);
    const rows = (await pool.query('SELECT token, action FROM "VerificationToken" WHERE "userId"=$1', [user.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("RESET_PASSWORD");
    expect(rows[0].token).not.toBe(token);
    expect(mail.links[0].url.split("#")[0]).not.toContain(token);
  });

  it("replaces an earlier link with the newest", async () => {
    const user = await createUser(pool);
    await ask(user.email);
    await ask(user.email);
    const [first, second] = mail.links.map((link) => tokenOf(link.url));
    expect((await use(first, "another-password")).status).toBe(400);
    expect((await use(second, "another-password")).status).toBe(200);
  });

  it("stops quietly after three a half hour for one address", async () => {
    const user = await createUser(pool);
    for (let count = 0; count < 5; count++) expect((await ask(user.email)).status).toBe(200);
    expect(mail.links).toHaveLength(3);
  });

  it("limits one address and refuses a malformed email", async () => {
    const headers = address();
    for (let count = 0; count < 5; count++) expect((await ask(`x${count}@local.test`, headers)).status).toBe(200);
    expect((await ask("y@local.test", headers)).status).toBe(429);
    expect((await ask("not-an-email")).status).toBe(400);
  });
});

describe("using a link", () => {
  const issue = async () => {
    const user = await createUser(pool, { password: await bcrypt.hash("old-password", 4) });
    await ask(user.email);
    return { user, token: tokenOf(mail.links[0].url) };
  };

  it("changes the password, revokes every device, and tells the owner", async () => {
    const { user, token } = await issue();
    await pool.query(`INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,now() + interval '1 day')`, [randomBytes(8).toString("hex"), user.id]).catch(() => undefined);
    const response = await use(token, "a-new-password");
    expect(response.status).toBe(200);
    expect(await bcrypt.compare("a-new-password", await column(user.id, "password"))).toBe(true);
    expect(await column(user.id, "tokenVersion")).toBe(user.tokenVersion + 1);
    expect((await pool.query('SELECT count(*)::int AS n FROM "AuthSession" WHERE "userId"=$1', [user.id])).rows[0].n).toBe(0);
    expect(mail.changed).toHaveLength(1);
  });

  it("works once", async () => {
    const { token } = await issue();
    expect((await use(token, "a-new-password")).status).toBe(200);
    const again = await use(token, "yet-another-one");
    expect(again.status).toBe(400);
  });

  it("works once even when two requests arrive together", async () => {
    const { token, user } = await issue();
    const results = await Promise.all([use(token, "first-password"), use(token, "second-password")]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    expect(await column(user.id, "tokenVersion")).toBe(user.tokenVersion + 1);
  });

  it("refuses an expired link and leaves the password alone", async () => {
    const { token, user } = await issue();
    await pool.query(`UPDATE "VerificationToken" SET "expiresAt" = now() - interval '1 minute' WHERE "userId"=$1`, [user.id]);
    const before = await column(user.id, "password");
    expect((await use(token, "a-new-password")).status).toBe(400);
    expect(await column(user.id, "password")).toBe(before);
  });

  it("refuses a made-up token, a short password, and another kind of token", async () => {
    const { token, user } = await issue();
    expect((await use(randomBytes(32).toString("base64url"), "a-new-password")).status).toBe(400);
    expect((await use(token, "abc")).status).toBe(400);
    await pool.query(`UPDATE "VerificationToken" SET action='VERIFY_EMAIL' WHERE "userId"=$1`, [user.id]);
    expect((await use(token, "a-new-password")).status).toBe(400);
  });
});
