/** Phase 12's two migrations against an older database, on a disposable PostgreSQL built from all of prisma/migrations. Never accepts a database URL.
 * node scripts/test/test-native-migrations-postgres.mjs [--out <evidence dir>]
 * Rolls the database back to how it looked before them, with a live browser session in it, then applies each migration twice, and checks that:
 * the older row is untouched, the columns are nullable, the constraint holds, refresh hashes stay out of reach of client roles, the partial index
 * is used, and the documented rollback runs. This shows what the SQL does. It says nothing about the hosted database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { buildSchemaFromMigrations, root, startDisposablePostgres } from "./lib/disposable-backend.mjs";

const flag = process.argv.indexOf("--out");
const out = resolve(root, flag > 0 ? process.argv[flag + 1] : "documentation/native/reports/phase-12/evidence");
mkdirSync(out, { recursive: true });
const migration = name => readFileSync(join(root, "prisma/migrations", name, "migration.sql"), "utf8");
const AUTH = "20261101100000_native_auth_sessions"; const INDEX = "20261101110000_open_session_index";
const COLUMNS = ["kind", "refreshHash", "previousRefreshHash", "rotatedAt", "clientName", "tokenVersion"];

const backend = await startDisposablePostgres({ log: message => console.error(message) });
const report = { schemaVersion: 1, steps: [] }; let exit = 0;
const step = (name, ok, detail) => { report.steps.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) exit = 1; };
try {
  const build = await buildSchemaFromMigrations(backend.url);
  step("every migration applied, or recovered with nothing left over", build.migrations.flatMap(entry => entry.remaining ?? []).length === 0, { migrations: build.migrations.length, recovered: build.migrations.filter(entry => entry.recovered).map(entry => entry.name) });
  step("neither Phase 12 migration needed recovery", [AUTH, INDEX].every(name => build.migrations.find(entry => entry.name === name)?.applied === true));
  const client = new pg.Client({ connectionString: backend.url }); await client.connect();
  try {
    // Back to how a database looks before them.
    await client.query(`ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_kind_check"; DROP INDEX "AuthSession_refreshHash_key"; DROP INDEX "StudySession_userId_open_idx"`);
    await client.query(`ALTER TABLE "AuthSession" ${COLUMNS.map(name => `DROP COLUMN "${name}"`).join(", ")}`);
    const user = (await client.query(`INSERT INTO "User" (email, username, password, "scholarId") VALUES ('old@local.test', 'old_user', 'x', '#old') RETURNING id`)).rows[0].id;
    await client.query(`INSERT INTO "AuthSession" (id, "userId", "tokenHash", "expiresAt") VALUES ('older-browser', $1, 'older-hash', now() + interval '10 days')`, [user]);
    const before = (await client.query(`SELECT to_jsonb(s) AS row FROM "AuthSession" s WHERE id = 'older-browser'`)).rows[0].row;

    await client.query(migration(AUTH)); await client.query(migration(INDEX));
    await client.query(migration(AUTH)); await client.query(migration(INDEX));
    step("both apply twice with no error", true);

    const after = (await client.query(`SELECT to_jsonb(s) AS row FROM "AuthSession" s WHERE id = 'older-browser'`)).rows[0].row;
    step("an existing browser session is untouched, and its new columns are null", Object.entries(before).every(([key, value]) => JSON.stringify(after[key]) === JSON.stringify(value)) && COLUMNS.every(name => after[name] === null));
    const nullable = (await client.query(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'AuthSession' AND column_name = ANY($1)`, [COLUMNS])).rows;
    step("every new column is nullable", nullable.length === COLUMNS.length && nullable.every(row => row.is_nullable === "YES"));
    await client.query(`UPDATE "AuthSession" SET kind = 'NATIVE', "refreshHash" = 'one' WHERE id = 'older-browser'`);
    const refused = async (sql, values) => { try { await client.query(sql, values); return false; } catch { return true; } };
    step("the constraint refuses an unknown kind", await refused(`UPDATE "AuthSession" SET kind = 'ROBOT' WHERE id = 'older-browser'`));
    await client.query(`INSERT INTO "AuthSession" (id, "userId") VALUES ('second', $1)`, [user]);
    step("two rows cannot share a refresh hash", await refused(`UPDATE "AuthSession" SET "refreshHash" = 'one' WHERE id = 'second'`));

    const privilege = (await client.query(`SELECT r AS role, has_column_privilege(r, '"AuthSession"', 'refreshHash', 'SELECT') AS can FROM unnest(ARRAY['anon', 'authenticated']) r`)).rows;
    step("client roles cannot read a refresh hash", privilege.every(row => row.can === false), privilege);
    step("AuthSession stays out of Realtime", (await client.query(`SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'AuthSession'`)).rowCount === 0);
    step("row level security stays on", (await client.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'AuthSession'`)).rows[0].relrowsecurity === true);

    await client.query(`INSERT INTO "StudySession" ("userId", "startedAt", "endedAt", "durationMinutes") SELECT $1, now() - (g || ' minutes')::interval, now(), 1 FROM generate_series(1, 5000) g`, [user]);
    await client.query(`INSERT INTO "StudySession" ("userId", "startedAt", "durationMinutes") VALUES ($1, now(), 0)`, [user]);
    await client.query(`ANALYZE "StudySession"`);
    const plan = (await client.query(`EXPLAIN SELECT id FROM "StudySession" WHERE "userId" = ${user} AND "endedAt" IS NULL`)).rows.map(row => row["QUERY PLAN"]).join("\n");
    step("the open-session lookup uses the partial index", plan.includes("StudySession_userId_open_idx"), plan);

    const header = text => text.split("\n").filter(line => line.startsWith("--")).map(line => line.replace(/^--\s?/, "")).join("\n");
    const rollback = sql => sql.slice(sql.indexOf("Rollback")).replace(/^Rollback[^:]*:\s*/, "").trim();
    await client.query(rollback(header(migration(INDEX))));
    await client.query(rollback(header(migration(AUTH))));
    const left = (await client.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'AuthSession' AND column_name = ANY($1)`, [COLUMNS])).rows[0].n;
    step("the documented rollback runs, and the older row survives it", left === 0 && (await client.query(`SELECT 1 FROM "AuthSession" WHERE id = 'older-browser'`)).rowCount === 1);
    await client.query(migration(AUTH)); await client.query(migration(INDEX));
    step("they apply again after a rollback", true);
  } finally { await client.end(); }
} catch (error) { step("the run finished", false, backend.redact(error.stack ?? error.message).slice(0, 600)); }
finally {
  backend.stop();
  writeFileSync(join(out, "native-migrations.json"), JSON.stringify({ ...report, scope: "Disposable PostgreSQL 17. Not the hosted database.", finishedAt: new Date().toISOString() }, null, 1) + "\n");
  process.exitCode = exit;
}
