/** A disposable local Sylf backend: PostgreSQL 17 in Docker, built from the repository's own migrations.
 *
 * Why this exists. The Planner and timer harnesses bootstrap from a Prisma diff plus a curated list of migrations, which is right for
 * their suites and wrong for an RLS audit: a policy in a migration outside the list would simply be missing. The history cannot replay
 * from empty on its own either, because seven tables and four enums were only ever created by `db push`, along with some columns and
 * many indexes. So this bootstraps exactly those objects, replays all of `prisma/migrations/` in order, repairs what is still missing
 * with additive DDL, and retries what failed. Every step is returned, so a run shows what the history could not do by itself.
 *
 * Safety. It accepts no database URL, reads no `.env`, publishes only on 127.0.0.1, and `backendEnvironment` blanks every variable the
 * source names, so a child process cannot pick up a hosted value. Next.js does not override a variable that already exists, blank included.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

export const root = resolve(import.meta.dirname, "../../..");

const BASE_ENV = ["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "SystemRoot"];
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, encoding: "utf8", stdio: "pipe", timeout: 120_000, ...options });
const hostedLooking = /supabase\.co|supabase\.com|upstash\.io|vercel\.app|amazonaws\.com/i;

function assertLoopback(url) {
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") throw new Error("Refusing a database that is not on this machine.");
  if (hostedLooking.test(url)) throw new Error("Refusing a hosted database address.");
}

/** Supabase objects the migrations rely on. `auth.jwt()` reads the same setting PostgREST and Realtime set. */
const PLATFORM = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT COALESCE(auth.jwt()->>'role', 'anon') $f$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

function prismaDiff(args, temporary) {
  const config = join(temporary, "prisma.config.ts");
  writeFileSync(config, `export default ${JSON.stringify({ schema: join(root, "prisma/schema.prisma"), datasource: { url: args.url ?? "postgresql://postgres:none@127.0.0.1:1/none" } })};\n`, { mode: 0o600 });
  return run(join(root, "node_modules/.bin/prisma"), ["migrate", "diff", ...args.flags, "--script", "--config", config], { env: minimalEnvironment() });
}

function minimalEnvironment() {
  return Object.fromEntries(BASE_ENV.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
}

function migrationDirectories() {
  const directory = join(root, "prisma/migrations");
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    .map(name => ({ name, file: join(directory, name, "migration.sql") })).filter(entry => existsSync(entry.file));
}

/** Statements of the final schema for tables and enums that no migration creates. */
function historyGaps(finalSchema, migrations) {
  const history = migrations.map(entry => readFileSync(entry.file, "utf8")).join("\n");
  const madeTables = new Set([...history.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?(\w+)"?/gi)].map(match => match[1]));
  const madeTypes = new Set([...history.matchAll(/CREATE TYPE\s+(?:public\.)?"?(\w+)"?/gi)].map(match => match[1]));
  const statements = finalSchema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  const types = statements.filter(text => /^CREATE TYPE "(\w+)"/.test(text) && !madeTypes.has(text.match(/^CREATE TYPE "(\w+)"/)[1]));
  const tables = statements.filter(text => /^CREATE TABLE "(\w+)"/.test(text) && !madeTables.has(text.match(/^CREATE TABLE "(\w+)"/)[1]));
  return { types, tables,
    typeNames: types.map(text => text.match(/^CREATE TYPE "(\w+)"/)[1]),
    tableNames: tables.map(text => text.match(/^CREATE TABLE "(\w+)"/)[1]) };
}

/** Starts the container. Stop it with `backend.stop()` in a finally block. */
export async function startDisposablePostgres({ log = () => {}, plannerSuites = false } = {}) {
  try { run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 8000 }); }
  catch { throw new Error("RUNTIME_UNAVAILABLE: start Docker first (open -ga Docker). Hosted databases are not a substitute."); }
  const nonce = randomBytes(6).toString("hex");
  // The Planner suites accept only a database with their harness's name, which is a guard worth keeping.
  const database = plannerSuites ? `sylf_planner_phase1_${randomBytes(8).toString("hex")}` : `sylf_backend_${nonce}`;
  const container = `sylf-backend-${nonce}`;
  const password = randomBytes(24).toString("hex");
  run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", `POSTGRES_PASSWORD=${password}`, "--env", `POSTGRES_DB=${database}`, "postgres:17",
    "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"]);
  const stop = () => { try { run("docker", ["rm", "--force", "--volumes", container]); } catch (error) { log(`Could not remove ${container}: ${error.message}`); } };
  try {
    const port = Number(run("docker", ["port", container, "5432/tcp"]).trim().split(":").at(-1));
    const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
    assertLoopback(url);
    let client;
    for (let attempt = 0; attempt < 80; attempt++) {
      client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
      try { await client.connect(); await client.query("SELECT 1"); await client.end(); client = null; break; }
      catch { await client.end().catch(() => {}); client = undefined; await new Promise(done => setTimeout(done, 300)); }
    }
    if (client !== null) throw new Error("Disposable PostgreSQL did not become ready.");
    return { url, database, container, stop, redact: value => String(value).replaceAll(password, "[redacted]").replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[disposable database URL]") };
  } catch (error) { stop(); throw error; }
}

/** Builds the schema from the real history. Returns what applied, what failed, and what the repair added. */
export async function buildSchemaFromMigrations(url, { log = () => {} } = {}) {
  assertLoopback(url);
  const temporary = mkdtempSync(join(tmpdir(), "sylf-backend-"));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(PLATFORM);
    const migrations = migrationDirectories();
    const finalSchema = prismaDiff({ flags: ["--from-empty", "--to-schema", join(root, "prisma/schema.prisma")] }, temporary);
    const gaps = historyGaps(finalSchema, migrations);
    for (const statement of [...gaps.types, ...gaps.tables]) await client.query(statement);
    const results = [];
    for (const { name, file } of migrations) {
      const sql = readFileSync(file, "utf8");
      // A migration is one script, so a failure leaves it wholly unapplied. Nothing later is skipped because of it.
      try { await client.query(`BEGIN;\n${sql}\n;COMMIT;`); results.push({ name, applied: true, sha256: createHash("sha256").update(sql).digest("hex") }); }
      catch (error) { await client.query("ROLLBACK").catch(() => {}); results.push({ name, applied: false, error: String(error.message).slice(0, 240) }); log(`migration failed: ${name}: ${error.message}`); }
    }
    const repair = await repairDrift(url, client, temporary);
    // Eleven migrations need columns that only `db push` ever made. With those in place, each is retried one statement at a time, so its
    // RLS, functions and triggers still land. Only "already exists" is tolerated, and anything else stays visible in the result.
    for (const result of results.filter(entry => !entry.applied)) {
      const sql = readFileSync(join(root, "prisma/migrations", result.name, "migration.sql"), "utf8");
      const remaining = []; let already = 0; let applied = 0;
      for (const statement of splitStatements(sql)) {
        if (/^(BEGIN|COMMIT|START TRANSACTION)$/i.test(statement)) continue;
        try { await client.query(statement); applied++; }
        catch (error) { if (["42701", "42P07", "42710", "42P06", "23505"].includes(error.code)) already++; else remaining.push({ statement: statement.split("\n")[0].slice(0, 120), error: String(error.message).slice(0, 180) }); }
      }
      Object.assign(result, { recovered: true, statementsApplied: applied, alreadyPresent: already, remaining });
    }
    const secondRepair = await repairDrift(url, client, temporary);
    return { migrations: results, gaps: { tables: gaps.tableNames, types: gaps.typeNames }, repair, secondRepair };
  } finally {
    await client.end().catch(() => {});
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Splits a script on top-level semicolons, keeping dollar-quoted bodies, strings and comments whole. */
export function splitStatements(sql) {
  const statements = []; let current = ""; let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const dollar = rest.match(/^\$[A-Za-z_]*\$/);
    if (rest.startsWith("--")) { const end = rest.indexOf("\n"); index += end < 0 ? rest.length : end + 1; continue; }
    if (rest.startsWith("/*")) { const end = rest.indexOf("*/"); index += end < 0 ? rest.length : end + 2; continue; }
    if (dollar) { const end = rest.indexOf(dollar[0], dollar[0].length); const stop = end < 0 ? rest.length : end + dollar[0].length; current += rest.slice(0, stop); index += stop; continue; }
    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index]; let cursor = index + 1;
      while (cursor < sql.length) { if (sql[cursor] === quote) { if (sql[cursor + 1] === quote) cursor += 2; else break; } else cursor++; }
      current += sql.slice(index, cursor + 1); index = cursor + 1; continue;
    }
    if (sql[index] === ";") { if (current.trim()) statements.push(current.trim()); current = ""; index++; continue; }
    current += sql[index]; index++;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Additive only: whatever the schema has and the history did not produce. Drops and type changes are reported and never applied. */
async function repairDrift(url, client, temporary) {
  const script = prismaDiff({ url, flags: ["--from-config-datasource", "--to-schema", join(root, "prisma/schema.prisma")] }, temporary);
  const statements = script.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  const applied = []; const declined = []; const failed = [];
  for (const statement of statements) {
    const additive = /^(CREATE (TYPE|TABLE|INDEX|UNIQUE INDEX)|ALTER TABLE "\w+" ADD (COLUMN|CONSTRAINT)|ALTER TABLE "\w+" ADD +"|ALTER TYPE .* ADD VALUE)/i.test(statement);
    if (!additive) { declined.push(statement.split("\n")[0].slice(0, 140)); continue; }
    try { await client.query(statement); applied.push(statement.split("\n")[0].slice(0, 140)); }
    catch (error) { failed.push({ statement: statement.split("\n")[0].slice(0, 140), error: String(error.message).slice(0, 160) }); }
  }
  return { applied, declined, failed };
}

/** Every environment variable the application names, for blanking. Scanning beats a list that goes stale, and it never opens `.env`. */
export function sourceEnvironmentNames() {
  const names = new Set();
  const visit = directory => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
      const path = join(directory, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry)) for (const match of readFileSync(path, "utf8").matchAll(/process\.env(?:\.|\[["'])([A-Z][A-Z0-9_]+)/g)) names.add(match[1]);
    }
  };
  for (const directory of ["app", "lib"]) visit(join(root, directory));
  for (const file of ["proxy.ts", "next.config.ts"]) if (existsSync(join(root, file))) for (const match of readFileSync(join(root, file), "utf8").matchAll(/process\.env(?:\.|\[["'])([A-Z][A-Z0-9_]+)/g)) names.add(match[1]);
  return [...names].sort();
}

/** The environment for the repository's own suites, as their original harnesses built it: nothing inherited, and absent rather than blank, because
 * those suites read optional settings with `??`. No dotenv runs under Vitest, so there is nothing hosted for a blank to shadow. */
export function suiteEnvironment(url, extra = {}) {
  assertLoopback(url);
  return { ...minimalEnvironment(), NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: url, DIRECT_URL: url, DATABASE_WORKER_URL: url, JWT_SECRET: "disposable-backend-jwt-secret", ...extra };
}

/** The environment for anything that runs the application against this database. */
export function backendEnvironment(url, extra = {}) {
  assertLoopback(url);
  const blanks = Object.fromEntries(sourceEnvironmentNames().map(name => [name, ""]));
  return { ...minimalEnvironment(), ...blanks, NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: url, DIRECT_URL: url, DATABASE_WORKER_URL: url,
    JWT_SECRET: "disposable-backend-jwt-secret", JWT_ISSUER: "sylf", JWT_AUDIENCE: "sylf-app", CRON_SECRET: "disposable-backend-cron-secret",
    TOOL_CONFIRMATION_SECRET: "disposable-backend-tool-secret", ...extra };
}
