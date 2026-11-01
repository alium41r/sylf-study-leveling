// Phase 12, findings G-2, P-2, P-3: small reads for a native client, on real SQL. The web's unbounded reads must not change.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createUser, db, request, tokenFor } from "./support";
import { GET as sessions } from "@/app/api/sessions/route";
import { GET as detailed } from "@/app/api/user/detailed-stats/route";
import { GET as quests } from "@/app/api/quests/route";
import { GET as chats } from "@/app/api/chats/route";
import { GET as messages } from "@/app/api/conversations/[id]/messages/route";
import { GET as earnedThisWeek } from "@/app/api/user/earned-this-week/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as friendRequests } from "@/app/api/friends/requests/route";
import { GET as stats } from "@/app/api/user/stats/route";
import { GET as achievements } from "@/app/api/achievements/route";
import { GET as cosmetics } from "@/app/api/cosmetics/route";
import { PATCH as security } from "@/app/api/user/security/route";
import bcrypt from "bcryptjs";
import { achievementsSchema, cosmeticsSchema, friendRequestsSchema, friendsSchema, questDaySchema, recentSessionsSchema, userStatsSchema } from "../../../native/packages/backend/src/contracts";

let pool: pg.Pool;
beforeAll(() => { pool = db(); });
afterAll(async () => { await pool.end(); });

async function studentWith(sessionCount: number) {
  const user = await createUser(pool);
  await pool.query(`INSERT INTO "StudySession" ("userId", "startedAt", "endedAt", "durationMinutes", "durationSeconds", "breakSeconds")
    SELECT $1, now() - (g || ' hours')::interval, now() - (g || ' hours')::interval + interval '30 minutes', 30, 1800, 60 FROM generate_series(1, $2) g`, [user.id, sessionCount]);
  return { user, token: await tokenFor(user) };
}

describe("recent sessions", () => {
  it("lists a page, newest first, with a cursor that walks to the end", async () => {
    const { token } = await studentWith(7);
    const first = await (await sessions(request("/api/sessions?limit=3", { token }))).json();
    expect(first.sessions).toHaveLength(3);
    const starts = first.sessions.map((row: { startedAt: string }) => Date.parse(row.startedAt));
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);
    expect(first.sessions[0]).toMatchObject({ durationSeconds: 1800, breakSeconds: 60, subjectName: null, questTitle: null });
    const second = await (await sessions(request(`/api/sessions?limit=3&cursor=${first.nextCursor}`, { token }))).json();
    const third = await (await sessions(request(`/api/sessions?limit=3&cursor=${second.nextCursor}`, { token }))).json();
    expect(third.sessions).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.sessions, ...second.sessions, ...third.sessions].map((row: { id: number }) => row.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("leaves out a running session, and anyone else's", async () => {
    const { user, token } = await studentWith(1); const other = await studentWith(4);
    await pool.query(`INSERT INTO "StudySession" ("userId", "startedAt", "durationMinutes") VALUES ($1, now(), 0)`, [user.id]);
    const body = await (await sessions(request("/api/sessions?limit=50", { token }))).json();
    expect(body.sessions).toHaveLength(1);
    const foreign = (await pool.query('SELECT id FROM "StudySession" WHERE "userId"=$1 ORDER BY id LIMIT 1', [other.user.id])).rows[0].id;
    const crossing = await (await sessions(request(`/api/sessions?limit=50&cursor=${foreign}`, { token }))).json().catch(() => null);
    expect(JSON.stringify(crossing)).not.toContain(`"id":${foreign},`);
  });

  it.each([["0"], ["-1"], ["abc"], ["1e3"]])("refuses limit=%s", async value => {
    const { token } = await studentWith(1);
    expect((await sessions(request(`/api/sessions?limit=${value}`, { token }))).status).toBe(400);
  });

  it("caps a page rather than obeying a large limit", async () => {
    const { token } = await studentWith(60);
    expect((await (await sessions(request("/api/sessions?limit=5000", { token }))).json()).sessions).toHaveLength(50);
  });

  it("still restores one session by id, and still refuses a call with neither", async () => {
    const { token } = await studentWith(1);
    expect((await sessions(request("/api/sessions", { token }))).status).toBe(400);
    expect((await sessions(request("/api/sessions?id=abc", { token }))).status).toBe(400);
  });
});

describe("detailed stats summary", () => {
  it("keeps the chart and drops the log", async () => {
    const { user, token } = await studentWith(5);
    await pool.query(`INSERT INTO "Quest" ("userId", title, status, "xpReward") SELECT $1, 'Quest ' || g, CASE WHEN g % 3 = 0 THEN 'COMPLETED' WHEN g % 3 = 1 THEN 'PENDING' ELSE 'FAILED' END::"QuestStatus", g FROM generate_series(1, 12) g`, [user.id]);
    const full = await (await detailed(request("/api/user/detailed-stats", { token }))).json();
    const summary = await (await detailed(request("/api/user/detailed-stats?summary=true", { token }))).json();
    expect(full.sessionLog).toHaveLength(5);
    expect(summary.sessionLog).toBeUndefined();
    expect(summary.dailyStudy).toEqual(full.dailyStudy);
    expect(summary.subjectBreakdown).toEqual(full.subjectBreakdown);
    expect(summary.summary).toEqual(full.summary);
    expect(summary.questStats).toEqual(full.questStats);
    expect(summary.questStats.total).toBe(12);
  });
});

describe("quests", () => {
  const seedQuests = async (userId: number, count: number) => { await pool.query(`INSERT INTO "Quest" ("userId", title) SELECT $1, 'Quest ' || g FROM generate_series(1, $2) g`, [userId, count]); };

  it("pages through every quest once", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    await seedQuests(user.id, 25);
    const seen: number[] = []; let cursor: number | null = null;
    do {
      const page: { quests: { id: number }[]; nextCursor: number | null } = await (await quests(request(`/api/quests?all=true&limit=10${cursor ? `&cursor=${cursor}` : ""}`, { token }))).json();
      expect(page.quests.length).toBeLessThanOrEqual(10);
      seen.push(...page.quests.map(quest => quest.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(25);
  });

  it("returns the web's plain array when no limit is asked for", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    await seedQuests(user.id, 3);
    const body = await (await quests(request("/api/quests?all=true", { token }))).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });

  it("refuses a malformed cursor", async () => {
    const token = await tokenFor(await createUser(pool));
    expect((await quests(request("/api/quests?all=true&limit=10&cursor=x", { token }))).status).toBe(400);
  });
});

describe("chats and messages", () => {
  it("pages chats, and keeps the web's shape without a limit", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    await pool.query(`INSERT INTO "ChatSession" ("userId", title, "updatedAt") SELECT $1, 'Chat ' || g, now() - (g || ' minutes')::interval FROM generate_series(1, 5) g`, [user.id]);
    const page = await (await chats(request("/api/chats?limit=2", { token }))).json();
    expect(page.sessions).toHaveLength(2);
    const rest = await (await chats(request(`/api/chats?limit=50&cursor=${page.nextCursor}`, { token }))).json();
    expect(rest.sessions).toHaveLength(3);
    expect(rest.nextCursor).toBeNull();
    expect((await (await chats(request("/api/chats", { token }))).json()).sessions).toHaveLength(5);
  });

  it("caps an incremental message read, and a poller reaches the rest by asking again", async () => {
    const user = await createUser(pool); const token = await tokenFor(user);
    const conversation = (await pool.query(`INSERT INTO "Conversation" ("updatedAt") VALUES (now()) RETURNING id`)).rows[0].id;
    await pool.query(`INSERT INTO "ConversationParticipant" ("userId", "conversationId") VALUES ($1, $2)`, [user.id, conversation]);
    await pool.query(`INSERT INTO "Message" ("conversationId", "senderId", content) SELECT $1, $2, 'm' || g FROM generate_series(1, 230) g`, [conversation, user.id]);
    const call = (after: number) => messages(request(`/api/conversations/${conversation}/messages?after=${after}`, { token }), { params: Promise.resolve({ id: String(conversation) }) }).then(response => response.json());
    const first = await call(0);
    expect(first.messages).toHaveLength(200);
    const second = await call(first.messages[199].id);
    expect(second.messages).toHaveLength(30);
  });
});

describe("what the ledgers credited this week (Phase 13, G-5)", () => {
  it("sums income since the student's Monday, for them alone, and ignores spending", async () => {
    const { user, token } = await studentWith(0); const other = await studentWith(0);
    await pool.query(`INSERT INTO "XpLedger" ("userId", amount, "createdAt") VALUES ($1, 120, now()), ($1, 30, now()), ($1, -50, now()), ($1, 999, now() - interval '9 days'), ($2, 700, now())`, [user.id, other.user.id]);
    await pool.query(`INSERT INTO "SylphLedger" ("userId", amount, "createdAt") VALUES ($1, 40, now()), ($1, -10, now()), ($2, 80, now())`, [user.id, other.user.id]);
    const answer = await (await earnedThisWeek(request("/api/user/earned-this-week", { token }))).json();
    expect(answer).toMatchObject({ xp: 150, sylph: 40 });
    expect(Date.parse(answer.weekStart)).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - Date.parse(answer.weekStart)).toBeLessThanOrEqual(8 * 86_400_000);
  });

  it("answers an empty account with zero, and nobody without a session", async () => {
    const { token } = await studentWith(0);
    expect(await (await earnedThisWeek(request("/api/user/earned-this-week", { token }))).json()).toMatchObject({ xp: 0, sylph: 0 });
    expect((await earnedThisWeek(request("/api/user/earned-this-week"))).status).toBe(401);
  });
});

describe("a friend's hidden fields (Phase 13)", () => {
  it("tells a client which values are hidden, because hidden numbers read as zero", async () => {
    const { user, token } = await studentWith(0); const friend = await studentWith(1);
    await pool.query(`INSERT INTO "Friendship" ("userId", "friendId") VALUES ($1, $2)`, [user.id, friend.user.id]);
    await pool.query(`INSERT INTO "UserPrivacy" ("userId", "showRank", "showStudyHours", "showOnlineStatus", "showCurrentSession") VALUES ($1, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'FRIENDS')
      ON CONFLICT ("userId") DO UPDATE SET "showRank" = 'PRIVATE', "showStudyHours" = 'PRIVATE', "showOnlineStatus" = 'PRIVATE', "showCurrentSession" = 'FRIENDS'`, [friend.user.id]);
    const listed = await (await friends(request("/api/friends", { token }))).json();
    expect(listed[0]).toMatchObject({ level: null, hunterRank: null, todaySeconds: 0, visible: { rank: false, hours: false, online: false, session: true } });
  });
});

describe("Sylf Native's contracts against the routes (Phase 13)", () => {
  it("parses every read a screen uses, from the real handlers", async () => {
    const { user, token } = await studentWith(1); const friend = await studentWith(0);
    await pool.query(`INSERT INTO "Friendship" ("userId", "friendId") VALUES ($1, $2)`, [user.id, friend.user.id]);
    await pool.query(`INSERT INTO "UserCosmetic" ("userId", category, "itemKey") VALUES ($1, 'TITLE', 'title_novice')`, [user.id]);
    const read = async (handler: (req: never) => Promise<Response>, path: string) => { const answer = await handler(request(path, { token }) as never); expect(answer.status).toBe(200); return answer.json(); };
    expect(userStatsSchema.safeParse(await read(stats as never, "/api/user/stats")).success).toBe(true);
    expect(achievementsSchema.safeParse(await read(achievements as never, "/api/achievements")).success).toBe(true);
    expect(cosmeticsSchema.safeParse(await read(cosmetics as never, "/api/cosmetics")).success).toBe(true);
    expect(friendsSchema.safeParse(await read(friends as never, "/api/friends")).success).toBe(true);
    expect(friendRequestsSchema.safeParse(await read(friendRequests as never, "/api/friends/requests")).success).toBe(true);
    expect(questDaySchema.safeParse(await read(quests as never, "/api/quests")).success).toBe(true);
    expect(recentSessionsSchema.safeParse(await read(sessions as never, "/api/sessions?limit=5")).success).toBe(true);
  });
});

describe("a refused password (Phase 13)", () => {
  it("is marked, so a native client never refreshes and replays it", async () => {
    const { user, token } = await studentWith(0);
    await pool.query(`UPDATE "User" SET password = $2 WHERE id = $1`, [user.id, await bcrypt.hash("the-real-password", 4)]);
    const answer = await security(request("/api/user/security", { token, method: "PATCH", body: { action: "password", currentPassword: "not the password", newPassword: "another-long-password", confirmPassword: "another-long-password" } }));
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ error: "Incorrect current password.", code: "password_incorrect" });
  });
});
