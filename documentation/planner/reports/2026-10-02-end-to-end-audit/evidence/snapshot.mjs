// Audit evidence only. Read-only queries restricted to the synthetic audit account.
import { readFileSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
const account = JSON.parse(readFileSync('/private/tmp/sylf-planner-audit-account.json', 'utf8'));
const userId = account.id ?? account.userId;
if (userId !== 1133) throw new Error('Unexpected audit account');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const data = { capturedAt: new Date().toISOString(), userId };
for (const table of ['Goal','Quest','PlannerPlan','PlannerIntakeSession','ChatSession','AiUsageLog']) {
  data[table] = (await pool.query(`SELECT to_jsonb(t) AS data FROM "${table}" t WHERE "userId" = $1 ORDER BY "createdAt"`, [userId])).rows.map(row=>row.data);
}
data.PlannerRevision = (await pool.query('SELECT to_jsonb(r) AS data FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id = r."planId" WHERE p."userId" = $1 ORDER BY r."createdAt"', [userId])).rows.map(row=>row.data);
data.PlannerQuestLink = (await pool.query('SELECT to_jsonb(l) AS data FROM "PlannerQuestLink" l JOIN "PlannerPlan" p ON p.id = l."planId" WHERE p."userId" = $1 ORDER BY l."createdAt"', [userId])).rows.map(row=>row.data);
data.StudySession = (await pool.query('SELECT to_jsonb(s) AS data FROM "StudySession" s WHERE s."userId" = $1 ORDER BY s."startedAt"', [userId])).rows.map(row=>row.data);
await pool.end();
const name = process.argv[2] ?? 'state';
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid evidence filename');
writeFileSync(new URL(name + '.json', import.meta.url), JSON.stringify(data, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(data).map(([key,value])=>[key,Array.isArray(value)?value.length:value]))));
