import { randomUUID } from "node:crypto";
import pg, { type Client } from "pg";

const connection = process.env.PLANNER_TEST_DATABASE_URL;
const marker = process.env.PLANNER_PHASE0_DATABASE_MARKER;
if (!connection || !marker || process.env.PLANNER_PHASE0_REQUIRED !== "true") {
  throw new Error("Required genuine PostgreSQL suite: use scripts/test/test-planner-v2-phase0-postgres.mjs; missing disposable harness identity.");
}
const parsed = new URL(connection);
if (parsed.hostname !== "127.0.0.1" || !/^\/sylf_planner_phase[01]_[a-f0-9]{16}$/.test(parsed.pathname)
  || parsed.search || parsed.username !== "postgres") {
  throw new Error("Only the harness-created loopback PostgreSQL database is permitted.");
}

export async function connect(): Promise<Client> {
  const client = new pg.Client({ connectionString: connection, connectionTimeoutMillis: 3000,
    application_name: "planner-phase0-required", statement_timeout: 5000 });
  await client.connect();
  try {
    const identity = await client.query("SELECT token FROM public.__planner_phase0_identity");
    if (identity.rows.length !== 1 || identity.rows[0].token !== marker) throw new Error("Disposable database marker mismatch.");
    return client;
  } catch (error) { await client.end(); throw error; }
}

export async function user(client: Client): Promise<number> {
  const unique = randomUUID();
  return (await client.query('INSERT INTO "User" (email, username) VALUES ($1,$2) RETURNING id',
    [`${unique}@planner-phase0.invalid`, unique])).rows[0].id;
}
export async function plan(client: Client, userId: number, subjectId: number | null = null, goalId: number | null = null, mode = "EXAM"): Promise<string> {
  const id = randomUUID();
  await client.query('INSERT INTO "PlannerPlan" (id,"userId",mode,title,"creationKey","creationHash","updatedAt","subjectId","goalId") VALUES ($1,$2,$7,\'Phase 0 SQL fixture\',$3,$4,now(),$5,$6)',
    [id, userId, randomUUID(), "a".repeat(64), subjectId, goalId, mode]);
  return id;
}
export async function revision(client: Client, planId: string): Promise<string> {
  const id = randomUUID();
  await client.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseVersion","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,1,\'GENERATE\',0,\'{}\',\'{}\',\'{"fixture":"current SQL"}\',$3,$4,$5,\'SEALED\',now(),now())',
    [id, planId, "b".repeat(64), randomUUID(), "c".repeat(64)]);
  return id;
}
export async function linked(client: Client, mode = "EXAM") {
  const userId = await user(client); const planId = await plan(client, userId, null, null, mode); const revisionId = await revision(client, planId);
  const questId = (await client.query('INSERT INTO "Quest" ("userId",title,description,status,"scheduledFor","targetMinutes","requiredMinutes") VALUES ($1,\'Review methods\',\'Explain a method and solve two problems\',\'PENDING\',\'2026-10-05\',30,30) RETURNING id', [userId])).rows[0].id;
  const linkId = randomUUID();
  await client.query('INSERT INTO "PlannerQuestLink" (id,"planId","itemKey","questId","createdRevisionId","appliedRevisionId",baseline,"updatedAt") VALUES ($1,$2,$3,$4,$5,$5,\'{}\',now())',
    [linkId, planId, randomUUID(), questId, revisionId]);
  return { userId, planId, revisionId, questId, linkId };
}
export async function rollback(client: Client) { await client.query("ROLLBACK"); }

export async function waitForLock(observer: Client, backendPid: number) {
  const end = Date.now() + 2500;
  while (Date.now() < end) {
    const result = await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [backendPid]);
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error("Expected independent PostgreSQL backend never entered lock wait.");
}
