// Expansion Part 2, step 0. Each repair was reproduced here first, on real SQL, before its route changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createUser, db, nativeRequest, request, tokenFor, type TestUser } from "./support";

const mail = vi.hoisted(() => ({ notices: [] as { to: string }[] }));
vi.mock("next/cache", () => ({ unstable_cache: (work: () => unknown) => work, revalidateTag: () => undefined, revalidatePath: () => undefined }));
vi.mock("@/lib/email", () => ({
  sendSecurityOtpEmail: async () => ({ sent: true, provider: "test" }),
  sendVerificationEmail: async () => ({ sent: true, provider: "test" }),
  sendEmailChangedNotice: async (params: { to: string }) => { mail.notices.push(params); return { sent: true, provider: "test" }; },
  sendPasswordResetEmail: async () => ({ sent: true, provider: "test" }),
}));

import { POST as setCosmetic } from "@/app/api/cosmetics/route";
import { PATCH as customize } from "@/app/api/profile/customization/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import { PATCH as updateConversation } from "@/app/api/conversations/[id]/route";
import { POST as sendMessage } from "@/app/api/conversations/[id]/messages/route";
import { PATCH as editMessage } from "@/app/api/conversations/[id]/messages/[messageId]/route";
import { PATCH as updateAccount } from "@/app/api/user/account/route";
import { POST as sendCode } from "@/app/api/user/security/send-code/route";
import { POST as heartbeat } from "@/app/api/user/heartbeat/route";
import { GET as calendarMonth } from "@/app/api/calendar/month/route";
import { GET as checkDeadlines } from "@/app/api/quests/check-deadlines/route";
import { PATCH as updateQuest } from "@/app/api/quests/[id]/route";
import { POST as nativeRegister } from "@/app/api/auth/native/register/route";
import { POST as sendFriendRequest } from "@/app/api/friends/requests/route";
import { HpPenaltyService } from "@/lib/hp-penalty-service";
import { openNativeSession } from "@/lib/auth-session-service";

let pool: pg.Pool;
beforeAll(() => { pool = db(); });
afterAll(async () => { await pool.end(); });
beforeEach(() => { mail.notices.length = 0; });

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const read = async (user: TestUser, column: string) => (await pool.query(`SELECT "${column}" AS value FROM "User" WHERE id=$1`, [user.id])).rows[0].value;
const befriend = (a: TestUser, b: TestUser) => pool.query('INSERT INTO "Friendship" ("userId","friendId") VALUES ($1,$2)', [a.id, b.id]);
const conversationBetween = async (a: TestUser, b: TestUser) => {
  await befriend(a, b);
  const response = await createConversation(request("/api/conversations", { token: await tokenFor(a), method: "POST", body: { participantIds: [b.id], isGroup: false } }));
  return (await response.json()).id as number;
};

describe("cosmetics are checked against what a person may use", () => {
  it("refuses a frame nobody owns, on either route, and leaves the old value", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    const direct = await setCosmetic(request("/api/cosmetics", { token, method: "POST", body: { category: "FRAME", itemKey: "frame_gold" } }));
    expect(direct.status).toBe(403);
    const profile = await customize(request("/api/profile/customization", { token, method: "PATCH", body: { activeFrame: "frame_gold" } }));
    expect(profile.status).toBe(403);
    expect(await read(user, "activeFrame")).toBe("none");
  });

  it("refuses a title that is free text, which could read as a staff role", async () => {
    const user = await createUser(pool);
    const response = await customize(request("/api/profile/customization", { token: await tokenFor(user), method: "PATCH", body: { activeTitle: "Sylf Staff" } }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("COSMETIC_NOT_OWNED");
    expect(await read(user, "activeTitle")).toBe("Novice");
  });

  it("allows what is owned, what is unlocked and what is free", async () => {
    const user = await createUser(pool, { level: 5 }); const token = await tokenFor(user);
    await pool.query(`INSERT INTO "UserCosmetic" ("userId",category,"itemKey") VALUES ($1,'FRAME','frame_gold')`, [user.id]);
    expect((await setCosmetic(request("/api/cosmetics", { token, method: "POST", body: { category: "FRAME", itemKey: "frame_gold" } }))).status).toBe(200);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { activeTitle: "title_scholar" } }))).status).toBe(200);
    expect((await setCosmetic(request("/api/cosmetics", { token, method: "POST", body: { category: "CLASS", itemKey: "class_analyst" } }))).status).toBe(200);
    expect(await read(user, "activeFrame")).toBe("frame_gold");
    expect(await read(user, "activeTitle")).toBe("title_scholar");
  });

  it("keeps a level gate", async () => {
    const user = await createUser(pool, { level: 2 });
    expect((await customize(request("/api/profile/customization", { token: await tokenFor(user), method: "PATCH", body: { activeNameColor: "color_cyan" } }))).status).toBe(403);
  });

  it("lets a person save what they already wear, so nobody loses a value from before this check", async () => {
    const user = await createUser(pool, { activeTitle: "An old unusual title", activeAura: "aura_old" });
    const response = await customize(request("/api/profile/customization", { token: await tokenFor(user), method: "PATCH", body: { activeTitle: "An old unusual title", activeAura: "aura_old", activeFrame: "none", activeNameColor: "default", bio: "Hello" } }));
    expect(response.status).toBe(200);
    expect(await read(user, "bio")).toBe("Hello");
  });

  it("leaves appearance alone, because web stores a person's own colors there", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    expect((await setCosmetic(request("/api/cosmetics", { token, method: "POST", body: { category: "THEME", itemKey: "#7c5cff" } }))).status).toBe(200);
    expect(await read(user, "activeTheme")).toBe("#7c5cff");
  });
});

describe("social writes have limits", () => {
  it("refuses an oversized message and an oversized edit", async () => {
    const a = await createUser(pool); const b = await createUser(pool); const id = await conversationBetween(a, b); const token = await tokenFor(a);
    const big = await sendMessage(request(`/api/conversations/${id}/messages`, { token, method: "POST", body: { content: "x".repeat(4001) } }), params({ id: String(id) }));
    expect(big.status).toBe(400);
    const sent = await sendMessage(request(`/api/conversations/${id}/messages`, { token, method: "POST", body: { content: "fine" } }), params({ id: String(id) }));
    const message = await sent.json();
    const edit = await editMessage(request(`/api/conversations/${id}/messages/${message.id}`, { token, method: "PATCH", body: { content: "x".repeat(4001) } }), params({ id: String(id), messageId: String(message.id) }));
    expect(edit.status).toBe(400);
    expect((await pool.query('SELECT count(*)::int AS n FROM "Message" WHERE "conversationId"=$1', [id])).rows[0].n).toBe(1);
  });

  it("slows a burst of messages from one account", async () => {
    const a = await createUser(pool); const b = await createUser(pool); const id = await conversationBetween(a, b); const token = await tokenFor(a);
    const statuses: number[] = [];
    for (let index = 0; index < 35; index++) statuses.push((await sendMessage(request(`/api/conversations/${id}/messages`, { token, method: "POST", body: { content: `m${index}` } }), params({ id: String(id) }))).status);
    expect(statuses.slice(0, 30).every((status) => status === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("slows a burst of friend requests", async () => {
    const a = await createUser(pool); const token = await tokenFor(a); const statuses: number[] = [];
    for (let index = 0; index < 25; index++) statuses.push((await sendFriendRequest(request("/api/friends/requests", { token, method: "POST", body: { username: `missing_${index}` } }))).status);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("stored image addresses", () => {
  it("refuses a script address and a plain http address", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { bannerUrl: "javascript:alert(1)" } }))).status).toBe(400);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { avatarUrl: "http://attacker.invalid/track.png" } }))).status).toBe(400);
    expect(await read(user, "bannerUrl")).toBeNull();
  });

  it("keeps what web's editor produces: https, an uploaded image, and clearing it", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { bannerUrl: "https://images.example.test/banner.png" } }))).status).toBe(200);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { avatarUrl: "data:image/png;base64,iVBORw0KGgo=" } }))).status).toBe(200);
    expect((await customize(request("/api/profile/customization", { token, method: "PATCH", body: { bannerUrl: null } }))).status).toBe(200);
  });

  it("refuses a hostile group image, at creation and later", async () => {
    const a = await createUser(pool); const b = await createUser(pool); const c = await createUser(pool); await befriend(a, b); await befriend(a, c); const token = await tokenFor(a);
    expect((await createConversation(request("/api/conversations", { token, method: "POST", body: { participantIds: [b.id, c.id], isGroup: true, name: "G", avatarUrl: "javascript:alert(2)" } }))).status).toBe(400);
    const made = await (await createConversation(request("/api/conversations", { token, method: "POST", body: { participantIds: [b.id, c.id], isGroup: true, name: "G" } }))).json();
    expect((await updateConversation(request(`/api/conversations/${made.id}`, { token, method: "PATCH", body: { avatarUrl: "javascript:alert(3)" } }), params({ id: String(made.id) }))).status).toBe(400);
  });
});

describe("changing an email needs proof, and tells the old address", () => {
  const passwordUser = async () => { const password = `P-${randomBytes(6).toString("hex")}`; const user = await createUser(pool, { password: await bcrypt.hash(password, 4) }); return { user, password }; };
  const fresh = () => `moved${randomBytes(5).toString("hex")}@local.test`;

  it("refuses a change with no password, and with a wrong one", async () => {
    const { user } = await passwordUser(); const token = await tokenFor(user);
    expect((await updateAccount(request("/api/user/account", { token, method: "PATCH", body: { email: fresh() } }))).status).toBe(403);
    const wrong = await updateAccount(request("/api/user/account", { token, method: "PATCH", body: { email: fresh(), currentPassword: "wrong" } }));
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).code).toBe("password_incorrect");
    expect(await read(user, "email")).toBe(user.email);
    expect(mail.notices).toEqual([]);
  });

  it("changes it with the password, and notifies the old address", async () => {
    const { user, password } = await passwordUser(); const next = fresh();
    expect((await updateAccount(request("/api/user/account", { token: await tokenFor(user), method: "PATCH", body: { email: next, currentPassword: password } }))).status).toBe(200);
    expect(await read(user, "email")).toBe(next);
    expect(mail.notices.map((notice) => notice.to)).toEqual([user.email]);
  });

  it("asks an account with no password for a code sent to the current address", async () => {
    const user = await createUser(pool, { password: null }); const token = await tokenFor(user); const next = fresh();
    expect((await updateAccount(request("/api/user/account", { token, method: "PATCH", body: { email: next } }))).status).toBe(403);
    expect((await sendCode(request("/api/user/security/send-code", { token, method: "POST", body: { action: "CHANGE_EMAIL" } }))).status).toBe(200);
    const stored = (await pool.query(`SELECT token FROM "VerificationToken" WHERE "userId"=$1 AND token LIKE 'CHANGE_EMAIL:%'`, [user.id])).rows[0].token as string;
    expect((await updateAccount(request("/api/user/account", { token, method: "PATCH", body: { email: next, code: stored.split(":").at(-1) } }))).status).toBe(200);
    expect(await read(user, "email")).toBe(next);
    expect((await pool.query(`SELECT count(*)::int AS n FROM "VerificationToken" WHERE "userId"=$1 AND token LIKE 'CHANGE_EMAIL:%'`, [user.id])).rows[0].n).toBe(0);
  });

  it("asks for nothing when the email did not change", async () => {
    const { user } = await passwordUser();
    expect((await updateAccount(request("/api/user/account", { token: await tokenFor(user), method: "PATCH", body: { email: user.email, name: "Renamed" } }))).status).toBe(200);
  });
});

describe("HP penalties and Native", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const longAgo = () => new Date(Date.now() - 30 * 86_400_000);
  const missedDays = async (overrides: Record<string, unknown> = {}) => createUser(pool, { hp: 100, maxHp: 100, createdAt: longAgo(), lastDailyPenaltyEvaluatedDate: daysAgo(4), restDays: [], ...overrides });
  const nativeToken = async (user: TestUser) => (await openNativeSession(user as never, request("/x"), "Test tablet")).accessToken;
  const ledger = async (user: TestUser) => (await pool.query('SELECT count(*)::int AS n FROM "HpLedger" WHERE "userId"=$1 AND amount < 0', [user.id])).rows[0].n;
  const overdueQuest = async (user: TestUser) => (await pool.query(`INSERT INTO "Quest" ("userId",title,status,"scheduledFor",difficulty) VALUES ($1,'Late','ACTIVE',$2,'HARD') RETURNING id`, [user.id, daysAgo(3)])).rows[0].id as number;

  it("deducts for a missed day when the penalty is on, as web has always done", async () => {
    const user = await missedDays();
    await HpPenaltyService.reconcileDailyHpPenalty(user.id);
    expect(await read(user, "hp")).toBeLessThan(100);
  });

  it("honors the setting: a person who turned it off loses nothing", async () => {
    const user = await missedDays({ enableHpPenalty: false });
    await HpPenaltyService.reconcileDailyHpPenalty(user.id);
    expect(await read(user, "hp")).toBe(100);
    expect(await ledger(user)).toBe(0);
  });

  it("a heartbeat from a native session never reconciles, even on an account with the penalty on", async () => {
    const user = await missedDays();
    expect((await heartbeat(nativeRequest("/api/user/heartbeat", await nativeToken(user), { method: "POST" }))).status).toBe(200);
    expect(await read(user, "hp")).toBe(100);
    expect(await read(user, "lastSeenAt")).not.toBeNull();
  });

  it("a month read from a native session never reconciles", async () => {
    const user = await missedDays();
    expect((await calendarMonth(nativeRequest("/api/calendar/month", await nativeToken(user)))).status).toBe(200);
    expect(await read(user, "hp")).toBe(100);
  });

  it("web's own heartbeat still reconciles", async () => {
    const user = await missedDays();
    expect((await heartbeat(request("/api/user/heartbeat", { token: await tokenFor(user), method: "POST" }))).status).toBe(200);
    expect(await read(user, "hp")).toBeLessThan(100);
  });

  it("an account created on Native starts with the penalty off", async () => {
    const tag = randomBytes(4).toString("hex");
    const response = await nativeRegister(nativeRequest("/api/auth/native/register", undefined, { method: "POST", headers: { "x-forwarded-for": `10.9.${randomBytes(1)[0]}.${randomBytes(1)[0]}` }, body: { email: `n${tag}@local.test`, password: "Native-password-1", name: "Native", username: `n${tag}`, clientName: "Test tablet" } }));
    expect(response.status).toBe(201);
    expect((await pool.query('SELECT "enableHpPenalty" AS value FROM "User" WHERE email=$1', [`n${tag}@local.test`])).rows[0].value).toBe(false);
  });

  it("the overdue-quest job still fails the quest, and takes no HP with the penalty off", async () => {
    process.env.CRON_SECRET = "expansion-test-secret";
    const off = await createUser(pool, { hp: 100, enableHpPenalty: false }); const on = await createUser(pool, { hp: 100 });
    const offQuest = await overdueQuest(off); await overdueQuest(on);
    expect((await checkDeadlines(request("/api/quests/check-deadlines", { headers: { authorization: "Bearer expansion-test-secret" } }))).status).toBe(200);
    expect(await read(off, "hp")).toBe(100);
    expect(await ledger(off)).toBe(0);
    expect((await pool.query('SELECT status FROM "Quest" WHERE id=$1', [offQuest])).rows[0].status).toBe("FAILED");
    expect(await read(on, "hp")).toBeLessThan(100);
  });

  it("ticking a late quest takes no HP with the penalty off", async () => {
    const user = await createUser(pool, { hp: 100, enableHpPenalty: false }); const id = await overdueQuest(user);
    const response = await updateQuest(nativeRequest(`/api/quests/${id}`, await nativeToken(user), { method: "PATCH", body: { status: "COMPLETED" } }), params({ id: String(id) }));
    expect(response.status).toBe(200);
    expect(await read(user, "hp")).toBe(100);
    expect(await ledger(user)).toBe(0);
  });
});
