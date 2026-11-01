import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createUser, db, request, tokenFor, type TestUser } from "./support";

vi.mock("next/cache", () => ({ unstable_cache: (work: () => unknown) => work, revalidateTag: () => undefined, revalidatePath: () => undefined }));
vi.mock("@/lib/redis", async original => ({ ...(await original<typeof import("@/lib/redis")>()), cachedWithRedis: async (_key: string, _ttl: number, work: () => unknown) => work() }));

import { GET as rankings } from "@/app/api/user/rankings/route";
import { GET as friends } from "@/app/api/friends/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import { PATCH as updateConversation } from "@/app/api/conversations/[id]/route";
import { GET as readProfile } from "@/app/api/user/[username]/route";
import { POST as startSession, PATCH as settleSession } from "@/app/api/sessions/route";

let pool: pg.Pool;
beforeAll(() => { pool = db(); });
afterAll(async () => { await pool.end(); });

const befriend = (a: TestUser, b: TestUser) => pool.query('INSERT INTO "Friendship" ("userId","friendId") VALUES ($1,$2)', [a.id, b.id]);
const block = (a: TestUser, b: TestUser) => pool.query('INSERT INTO "BlockedUser" ("userId","blockedId") VALUES ($1,$2)', [a.id, b.id]);
const privacy = (user: TestUser, fields: Record<string, string>) => pool.query(`UPDATE "UserPrivacy" SET ${Object.keys(fields).map((name, index) => `"${name}"=$${index + 2}`).join(",")} WHERE "userId"=$1`, [user.id, ...Object.values(fields)]);
const online = (user: TestUser) => pool.query(`UPDATE "User" SET "lastSeenAt"=(now() AT TIME ZONE 'utc') WHERE id=$1`, [user.id]);
const members = async (conversationId: number) => (await pool.query('SELECT "userId" FROM "ConversationParticipant" WHERE "conversationId"=$1', [conversationId])).rows.map(row => row.userId);

describe("leaderboard privacy", () => {
  it("leaves out a person who keeps their profile private, and shows it to nobody but them", async () => {
    const hidden = await createUser(pool, { level: 90 }); const viewer = await createUser(pool);
    await privacy(hidden, { profileVisibility: "PRIVATE" });
    const body = await (await rankings(request("/api/user/rankings", { token: await tokenFor(viewer) }))).json();
    expect(body.global.map((entry: { id: number }) => entry.id)).not.toContain(hidden.id);
    const own = await (await rankings(request("/api/user/rankings", { token: await tokenFor(hidden) }))).json();
    expect(own.currentUserRank).toBeGreaterThan(0);
  });

  it("leaves out a person who hides their rank from the public, but keeps them for friends", async () => {
    const hidden = await createUser(pool, { level: 80 }); const stranger = await createUser(pool); const friend = await createUser(pool);
    await privacy(hidden, { showRank: "FRIENDS" }); await befriend(hidden, friend);
    const seenByStranger = await (await rankings(request("/api/user/rankings", { token: await tokenFor(stranger) }))).json();
    expect(seenByStranger.global.map((entry: { id: number }) => entry.id)).not.toContain(hidden.id);
    const seenByFriend = await (await rankings(request("/api/user/rankings", { token: await tokenFor(friend) }))).json();
    expect(seenByFriend.friends.map((entry: { id: number }) => entry.id)).toContain(hidden.id);
  });
});

describe("friends privacy", () => {
  it("withholds what a friend has set to private", async () => {
    const quiet = await createUser(pool, { totalStudyMinutes: 500, level: 42 }); const viewer = await createUser(pool);
    await befriend(quiet, viewer); await online(quiet);
    await privacy(quiet, { showOnlineStatus: "PRIVATE", showCurrentSession: "PRIVATE", showStudyHours: "PRIVATE", showRank: "PRIVATE" });
    await pool.query(`INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt") VALUES ($1,3,180,now())`, [quiet.id]);
    const [entry] = await (await friends(request("/api/friends", { token: await tokenFor(viewer) }))).json();
    expect(entry).toMatchObject({ id: quiet.id, isOnline: false, isStudying: false, activeSessionStartedAt: null, lastSeenAt: null, todaySeconds: 0, totalStudyMinutes: 0 });
    expect(entry.level).toBeNull();
  });

  it("shows everything to a friend when nothing is hidden", async () => {
    const open = await createUser(pool, { level: 7 }); const viewer = await createUser(pool);
    await befriend(open, viewer); await online(open);
    await pool.query(`INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt") VALUES ($1,3,180,now())`, [open.id]);
    const [entry] = await (await friends(request("/api/friends", { token: await tokenFor(viewer) }))).json();
    expect(entry).toMatchObject({ id: open.id, isOnline: true, isStudying: true, level: 7, todaySeconds: 180 });
  });
});

describe("group conversations", () => {
  it("cannot pull a stranger into a group", async () => {
    const stranger = await createUser(pool); const actor = await createUser(pool);
    const response = await createConversation(request("/api/conversations", { token: await tokenFor(actor), method: "POST", body: { participantIds: [stranger.id], isGroup: true, name: "Spam" } }));
    expect(response.status).toBe(403);
  });

  it("cannot make a shared-group relationship with a stranger", async () => {
    const target = await createUser(pool); const actor = await createUser(pool);
    await privacy(target, { allowDirectMessages: "PRIVATE" });
    await createConversation(request("/api/conversations", { token: await tokenFor(actor), method: "POST", body: { participantIds: [target.id], isGroup: true } }));
    const body = await (await readProfile(request(`/api/user/${target.username}`, { token: await tokenFor(actor) }), { params: Promise.resolve({ username: target.username }) })).json();
    expect(body.relationship).not.toBe("GROUP");
  });

  it("cannot add someone who blocked the group's creator", async () => {
    const creator = await createUser(pool); const friend = await createUser(pool); const blocker = await createUser(pool);
    await befriend(creator, friend); await befriend(creator, blocker); await block(blocker, creator);
    const created = await (await createConversation(request("/api/conversations", { token: await tokenFor(creator), method: "POST", body: { participantIds: [friend.id], isGroup: true } }))).json();
    const response = await updateConversation(request(`/api/conversations/${created.id}`, { token: await tokenFor(creator), method: "PATCH", body: { addMemberIds: [blocker.id] } }), { params: Promise.resolve({ id: String(created.id) }) });
    expect(response.status).toBe(403);
    expect(await members(created.id)).not.toContain(blocker.id);
  });

  it("still lets friends make a group", async () => {
    const creator = await createUser(pool); const one = await createUser(pool); const two = await createUser(pool);
    await befriend(creator, one); await befriend(two, creator);
    const response = await createConversation(request("/api/conversations", { token: await tokenFor(creator), method: "POST", body: { participantIds: [one.id, two.id], isGroup: true, name: "Study" } }));
    expect(response.status).toBe(201);
    expect((await members((await response.json()).id)).sort()).toEqual([creator.id, one.id, two.id].sort());
  });

  it("rejects a participant list that is not user ids", async () => {
    const actor = await createUser(pool);
    expect((await createConversation(request("/api/conversations", { token: await tokenFor(actor), method: "POST", body: { participantIds: ["1 OR 1=1"], isGroup: true } }))).status).toBe(400);
  });
});

describe("timer trust boundary", () => {
  const start = (token: string, startedAt: string, key = randomUUID()) => startSession(request("/api/sessions", { token, method: "POST", body: { executionProtocol: 2, clientSessionKey: key, startedAt } }));

  it("credits a claimed 20-day session no more than one sitting", async () => {
    const created = new Date(Date.now() - 30 * 86_400_000);
    const user = await createUser(pool, { createdAt: created }); const token = await tokenFor(user);
    const claimed = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const session = await (await start(token, claimed)).json();
    await settleSession(request("/api/sessions", { token, method: "PATCH", body: { executionTransition: { schemaVersion: 2, sessionId: session.id, action: "END", expectedExecutionVersion: session.execution.executionVersion, idempotencyKey: randomUUID(), cumulativeFocusSeconds: 20 * 86_400, cumulativeBreakSeconds: 0 } } }));
    const row = (await pool.query('SELECT "durationSeconds" FROM "StudySession" WHERE id=$1', [session.id])).rows[0];
    expect(row.durationSeconds).toBe(43_200);
  });
});

describe("rls and rpc", () => {
  it("refuses the leader-only RPC to a token with someone else's id, whichever layer stops it", async () => {
    const leader = await createUser(pool); const member = await createUser(pool); const attacker = await createUser(pool);
    const party = (await pool.query("SELECT public.create_focus_party($1,'Probe') AS result", [leader.id])).rows[0].result;
    const partyId = party.id ?? party.partyId;
    await pool.query('INSERT INTO "FocusPartyMember" ("partyId","userId") VALUES ($1,$2)', [partyId, member.id]);
    const client = await pool.connect();
    let outcome: string;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: String(attacker.id), role: "authenticated" })]);
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT public.remove_focus_party_member($1::int,$2::int,$3::int)", [partyId, leader.id, member.id]);
      outcome = "ran";
    } catch (error) { outcome = (error as { code?: string }).code ?? "error"; }
    finally { await client.query("ROLLBACK"); client.release(); }
    expect(outcome).toBe("42501");
  });
});
