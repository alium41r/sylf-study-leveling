/** Disposable PostgreSQL verification for the Planning Studio. Never reads a hosted database URL.
 * Usage: node scripts/test/test-planning-studio-postgres.mjs [path-filter] (Docker Desktop required).
 * Builds today's schema without the Studio's four tables from the Prisma schema, installs the Supabase roles the migrations grant against, then
 * applies prisma/migrations/20261113100000_planning_kernel unchanged, so its constraints, partial index, ownership triggers and RLS are the ones
 * under test. Existing planner guard migrations are not replayed here; the Studio writes only quests that no other planner links.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";

const root = resolve(import.meta.dirname, "../..");
const temp = mkdtempSync(join(tmpdir(), "sylf-studio-test-"));
const container = `sylf-studio-test-${randomBytes(6).toString("hex")}`;
const password = randomBytes(18).toString("hex");
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, encoding: "utf8", stdio: "pipe", ...options });
const prisma = join(root, "node_modules/.bin/prisma");
let started = false;
try {
  run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=sylf_planner_studio_test", "postgres:17"]); started = true;
  const port = run("docker", ["port", container, "5432/tcp"]).trim().split(":").at(-1);
  const connection = new URL("postgresql://127.0.0.1/sylf_planner_studio_test");
  connection.username = "postgres"; connection.password = password; connection.port = port;
  const url = connection.toString();
  run("docker", ["exec", container, "sh", "-c", "for i in $(seq 1 30); do pg_isready -U postgres -d sylf_planner_studio_test >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]);
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8")
    .replace(/\n(?:\/\/[^\n]*\n)*model (?:PlanningSpace|PlanVersion|PlanBlock|PlanItemQuest) \{[\s\S]*?\n\}\n/g, "\n")
    .replace(/^\s*(?:planningSpace|planVersions|planBlocks|planItemQuests|planItem)\s+Plan[A-Za-z]*(?:\[\]|\?)?.*\n/gm, "");
  writeFileSync(join(temp, "before.prisma"), schema);
  const migrations = join(temp, "migrations"); mkdirSync(migrations);
  const stage = (name, sql) => { const dir = join(migrations, name); mkdirSync(dir); writeFileSync(join(dir, "migration.sql"), sql); };
  const bootstrap = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE PUBLICATION supabase_realtime;
`;
  // Prisma renders CalendarNote's three generated columns (20261018030000_calendar_completion) as DEFAULTs Postgres rejects. They are left out of the
  // baseline and added back with the migration's own definitions.
  const generated = readFileSync(join(root, "prisma/migrations/20261018030000_calendar_completion/migration.sql"), "utf8").split("\n").filter((line) => /GENERATED ALWAYS AS/.test(line)).join("\n");
  writeFileSync(join(temp, "before.prisma"), schema.replace(/^\s*(?:previewText|hasInk|documentMode)\s+.*dbgenerated.*\n/gm, ""));
  const baseline = run(prisma, ["migrate", "diff", "--from-empty", "--to-schema", join(temp, "before.prisma"), "--script"]) + "\n" + generated + "\n";
  stage("00000000000000_audited_schema", bootstrap + baseline);
  stage("20261113100000_planning_kernel", readFileSync(join(root, "prisma/migrations/20261113100000_planning_kernel/migration.sql"), "utf8"));
  copyFileSync(join(root, "prisma/migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
  const config = join(temp, "prisma.config.ts");
  writeFileSync(config, `export default ${JSON.stringify({ schema: join(root, "prisma/schema.prisma"), migrations: { path: migrations }, datasource: { url } })};`);
  run(prisma, ["migrate", "deploy", "--config", config], { stdio: "inherit" });
  // The applied migration must leave exactly the schema Prisma expects.
  const drift = run(prisma, ["migrate", "diff", "--from-config-datasource", "--to-schema", join(root, "prisma/schema.prisma"), "--config", config, "--script"]);
  const meaningful = drift.split("\n").filter((line) => line.trim() && !line.startsWith("--") && !/PlanBlock_live_key|previewText/.test(line));
  if (meaningful.length) { console.error(drift); throw new Error("The planning kernel migration does not match prisma/schema.prisma."); }
  const filter = process.argv[2] ?? "__tests__/planner/database-studio.test.ts";
  run(join(root, "node_modules/.bin/vitest"), ["run", "--no-file-parallelism", filter], { stdio: "inherit", env: { ...process.env, PLANNER_TEST_DATABASE_URL: url, SYLF_PLANNING_STUDIO: "on", SYLF_PLANNING_STUDIO_AI: "off" } });
  console.log(`Planning Studio migration, store and projection tests passed on disposable PostgreSQL (${filter}).`);
} finally {
  if (started) run("docker", ["rm", "--force", "--volumes", container]);
  rmSync(temp, { recursive: true, force: true });
}
