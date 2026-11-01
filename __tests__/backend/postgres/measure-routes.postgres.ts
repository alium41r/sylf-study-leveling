import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { createUser, db, request, tokenFor, type TestUser } from "./support";

// Measures what a route does to the database: wall time in process, and SQL statements counted at the driver. Only runs with --measure.
vi.mock("next/cache", () => ({ unstable_cache: (work: () => unknown) => work, revalidateTag: () => undefined, revalidatePath: () => undefined }));
vi.mock("@/lib/redis", async original => ({ ...(await original<typeof import("@/lib/redis")>()), cachedWithRedis: async (_key: string, _ttl: number, work: () => unknown) => work() }));

import { getSession } from "@/lib/auth-server";
import { GET as stats } from "@/app/api/user/stats/route";
import { GET as detailed } from "@/app/api/user/detailed-stats/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as rankings } from "@/app/api/user/rankings/route";
import { GET as quests } from "@/app/api/quests/route";
import { GET as weekly } from "@/app/api/quests/weekly/route";
import { GET as goals } from "@/app/api/goals/route";
import { GET as subjects } from "@/app/api/subjects/route";
import { GET as achievements } from "@/app/api/achievements/route";
import { GET as notifications } from "@/app/api/notifications/route";
import { GET as conversations } from "@/app/api/conversations/route";
import { GET as party } from "@/app/api/focus-party/route";
import { GET as month } from "@/app/api/calendar/month/route";
import { GET as cosmetics } from "@/app/api/cosmetics/route";
import { GET as inventory } from "@/app/api/inventory/route";
import { GET as currency } from "@/app/api/currency/stats/route";
import { GET as search } from "@/app/api/users/search/route";
import { GET as chats } from "@/app/api/chats/route";
import { GET as earnedThisWeek } from "@/app/api/user/earned-this-week/route";
import { GET as recentSessions } from "@/app/api/sessions/route";
import { GET as systemMessages } from "@/app/api/system-messages/route";

const measuring = process.env.BACKEND_MEASURE_OUT;
let statements = 0;
const original = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) { statements++; return (original as (...input: unknown[]) => unknown).apply(this, args); } as typeof original;

let pool: pg.Pool; let student: TestUser; let token: string;
const SCALE = { users: 2000, friends: 40, sessions: 3000, quests: 1500, goals: 40, subjects: 12, messages: 4000, peerQuests: 60000 };

async function seed() {
  student = await createUser(pool, { totalStudyMinutes: 12000, level: 30 });
  token = await tokenFor(student);
  await pool.query(`INSERT INTO "User" (email, username, password, "scholarId", level, "currentXP", "totalStudyMinutes", "verificationStatus", "hasCompletedOnboarding")
    SELECT 'peer'||g||'@local.test', 'peer'||g, 'x', '#p'||g, (g%100)+1, g%1000, g%5000, 'VERIFIED', true FROM generate_series(1,$1) g`, [SCALE.users]);
  await pool.query(`INSERT INTO "UserPrivacy" ("userId") SELECT id FROM "User" WHERE username LIKE 'peer%'`);
  await pool.query(`INSERT INTO "Friendship" ("userId","friendId") SELECT $1, id FROM "User" WHERE username LIKE 'peer%' ORDER BY id LIMIT $2`, [student.id, SCALE.friends]);
  await pool.query(`INSERT INTO "Subject" ("userId", name, code) SELECT $1, 'Subject '||g, 'S'||g FROM generate_series(1,$2) g`, [student.id, SCALE.subjects]);
  await pool.query(`INSERT INTO "Goal" ("userId", title, "targetWeeks") SELECT $1, 'Goal '||g, 4 FROM generate_series(1,$2) g`, [student.id, SCALE.goals]);
  await pool.query(`INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt","endedAt","rewardsClaimed")
    SELECT $1, 30, 1800, (now() AT TIME ZONE 'utc') - (g||' hours')::interval, (now() AT TIME ZONE 'utc') - (g||' hours')::interval + interval '30 minutes', true FROM generate_series(1,$2) g`, [student.id, SCALE.sessions]);
  await pool.query(`INSERT INTO "StudySession" ("userId","durationMinutes","durationSeconds","startedAt","endedAt","rewardsClaimed")
    SELECT u.id, 30, 1800, (now() AT TIME ZONE 'utc') - (g||' hours')::interval, (now() AT TIME ZONE 'utc') - (g||' hours')::interval + interval '30 minutes', true
    FROM (SELECT id FROM "User" WHERE username LIKE 'peer%' ORDER BY id LIMIT $1) u CROSS JOIN generate_series(1,100) g`, [SCALE.friends]);
  await pool.query(`INSERT INTO "Quest" ("userId", title, "xpReward", "sylphReward", status) SELECT $1, 'Quest '||g, 10, 10, CASE WHEN g%2=0 THEN 'COMPLETED' ELSE 'PENDING' END::"QuestStatus" FROM generate_series(1,$2) g`, [student.id, SCALE.quests]);
  await pool.query(`INSERT INTO "Quest" ("userId", title, "xpReward", "sylphReward", status) SELECT u.id, 'Q', 10, 10, 'COMPLETED' FROM (SELECT id FROM "User" WHERE username LIKE 'peer%') u CROSS JOIN generate_series(1,$1) g`, [Math.round(SCALE.peerQuests / SCALE.users)]);
  await pool.query(`INSERT INTO "SystemMessage" ("userId", content, type) SELECT $1, 'Message '||g, 'INFO' FROM generate_series(1,$2) g`, [student.id, SCALE.messages]);
  await pool.query(`ANALYZE`);
}

const ROUTES: Array<[string, () => Promise<Response>]> = [
  ["getSession only", async () => { await getSession(request("/x", { token })); return new Response("{}"); }],
  ["/api/user/stats", () => stats(request("/api/user/stats", { token }))],
  ["/api/user/detailed-stats", () => detailed(request("/api/user/detailed-stats", { token }))],
  ["/api/friends", () => friends(request("/api/friends", { token }))],
  ["/api/user/detailed-stats?summary=true", () => detailed(request("/api/user/detailed-stats?summary=true", { token }))],
  ["/api/sessions?limit=20", () => recentSessions(request("/api/sessions?limit=20", { token }))],
  ["/api/user/rankings", () => rankings(request("/api/user/rankings", { token }))],
  ["/api/quests?all=true", () => quests(request("/api/quests?all=true", { token }))],
  ["/api/quests?all=true&limit=50", () => quests(request("/api/quests?all=true&limit=50", { token }))],
  ["/api/quests (today)", () => quests(request("/api/quests", { token }))],
  ["/api/quests/weekly", () => weekly(request("/api/quests/weekly", { token }))],
  ["/api/goals", () => goals(request("/api/goals", { token }))],
  ["/api/subjects", () => subjects(request("/api/subjects", { token }))],
  ["/api/achievements", () => achievements(request("/api/achievements", { token }))],
  ["/api/notifications", () => notifications(request("/api/notifications", { token }))],
  ["/api/system-messages", () => systemMessages(request("/api/system-messages", { token }))],
  ["/api/conversations", () => conversations(request("/api/conversations", { token }))],
  ["/api/chats", () => chats(request("/api/chats", { token }))],
  ["/api/chats?limit=20", () => chats(request("/api/chats?limit=20", { token }))],
  ["/api/user/earned-this-week", () => earnedThisWeek(request("/api/user/earned-this-week", { token }))],
  ["/api/focus-party", () => party(request("/api/focus-party", { token }))],
  ["/api/calendar/month", () => month(request("/api/calendar/month", { token }))],
  ["/api/cosmetics", () => cosmetics(request("/api/cosmetics", { token }))],
  ["/api/inventory", () => inventory(request("/api/inventory", { token }))],
  ["/api/currency/stats", () => currency(request("/api/currency/stats", { token }))],
  ["/api/users/search?q=peer1", () => search(request("/api/users/search?q=peer1", { token }))],
];

const PLANS: Record<string, string> = {
  "stats: today's sessions": `SELECT id FROM "StudySession" WHERE "userId"=$1 AND "startedAt" >= (now() AT TIME ZONE 'utc') - interval '1 day'`,
  "friendships both directions": `SELECT id FROM "Friendship" WHERE "userId"=$1 OR "friendId"=$1`,
  "friends: today's aggregate": `SELECT "userId", SUM("durationSeconds") FROM "StudySession" AS s WHERE "userId" IN (SELECT "friendId" FROM "Friendship" WHERE "userId"=$1) AND "startedAt" >= (now() AT TIME ZONE 'utc') - interval '1 day' GROUP BY "userId"`,
  "open session per user": `SELECT id FROM "StudySession" WHERE "userId"=$1 AND "endedAt" IS NULL`,
  "user search contains": `SELECT id FROM "User" WHERE username LIKE '%peer1%' LIMIT 10`,
  "session end flood guard": `SELECT count(*) FROM "StudySession" WHERE "userId"=$1 AND "endedAt" >= (now() AT TIME ZONE 'utc') - interval '1 minute'`,
};

describe.runIf(measuring)("route cost", () => {
  beforeAll(async () => { pool = db(); await seed(); }, 120_000);
  afterAll(async () => { await pool.end(); });
  it("measures", async () => {
    const results: unknown[] = [];
    for (const [name, call] of ROUTES) {
      const times: number[] = []; let status = 0; let bytes = 0; let count = 0;
      for (let run = 0; run < 14; run++) {
        const before = statements; const started = performance.now();
        const response = await call();
        const text = await response.text();
        const elapsed = performance.now() - started;
        if (run >= 2) { times.push(elapsed); count = statements - before; }
        status = response.status; bytes = text.length;
      }
      times.sort((a, b) => a - b);
      results.push({ route: name, status, bytes, sqlStatements: count, p50ms: +times[Math.floor(times.length / 2)].toFixed(1), p95ms: +times[times.length - 1].toFixed(1) });
    }
    // The leaderboard reads every person. Before Phase 11 it also loaded the id of every completed quest to count them.
    const { prisma } = await import("@/lib/prisma");
    const timed = async (work: () => Promise<unknown>) => { const times: number[] = []; let bytes = 0; for (let run = 0; run < 7; run++) { const started = performance.now(); bytes = JSON.stringify(await work()).length; if (run) times.push(performance.now() - started); } times.sort((x, y) => x - y); return { p50ms: +times[3].toFixed(1), bytes }; };
    const leaderboard = {
      loadingEveryQuestId: await timed(() => prisma.user.findMany({ select: { id: true, username: true, level: true, quests: { where: { status: "COMPLETED" }, select: { id: true } } } })),
      countingInTheDatabase: await timed(() => prisma.user.findMany({ select: { id: true, username: true, level: true, _count: { select: { quests: { where: { status: "COMPLETED" } } } } } })),
    };
    const plans: Record<string, string[]> = {};
    for (const [name, sql] of Object.entries(PLANS)) {
      const rows = (await pool.query(`EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, COSTS OFF, SUMMARY ON) ${sql}`, sql.includes("$1") ? [student.id] : [])).rows;
      plans[name] = rows.map(row => row["QUERY PLAN"] as string).filter(line => /Scan|Execution Time|Rows Removed/.test(line)).map(line => line.trim());
    }
    const sizes = (await pool.query(`SELECT relname, n_live_tup::int AS rows FROM pg_stat_user_tables WHERE n_live_tup > 100 ORDER BY 2 DESC`)).rows;
    writeFileSync(measuring!, JSON.stringify({ note: "In process, on a disposable PostgreSQL 17 container on an 8 GB M1. No network between app and database, so a hosted round trip adds to each statement. Relative figures, not production latency.", scale: SCALE, sizes, results, leaderboard, plans }, null, 1) + "\n");
  }, 240_000);
});
