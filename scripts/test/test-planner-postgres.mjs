/** Disposable PostgreSQL verification. Never reads a hosted database URL.
 * Usage: node scripts/test/test-planner-postgres.mjs [path-filter] (Docker Desktop required).
 * The optional filter narrows which suites run against the disposable database
 * (e.g. `__tests__/planner/database-intake-service.test.ts`); the database itself
 * is always built identically from the staged migration chain.
 * The historical migration chain has an existing missing-enum bootstrap gap.
 * Build its audited schema via Prisma diff, install existing security/RPC SQL
 * via staged Prisma migrations, then apply the actual new migration unchanged.
 * This is a test fixture only; it does not replace production migration history.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
const root = resolve(import.meta.dirname, "../..");
const temp = mkdtempSync(join(tmpdir(), "sylf-planner-test-"));
const container = `sylf-planner-test-${randomBytes(6).toString("hex")}`;
const password = randomBytes(18).toString("hex");
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, encoding: "utf8", stdio: "pipe", ...options });
const prisma = join(root, "node_modules/.bin/prisma");
let started = false;
try {
  run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=sylf_planner_test", "postgres:17"]); started = true;
  const port = run("docker", ["port", container, "5432/tcp"]).trim().split(":").at(-1);
  const connection = new URL("postgresql://127.0.0.1/sylf_planner_test");
  connection.username = "postgres"; connection.password = password; connection.port = port;
  const url = connection.toString();
  // Docker exec waits only for pg_isready, bounded to 30 seconds.
  run("docker", ["exec", container, "sh", "-c", "for i in $(seq 1 30); do pg_isready -U postgres -d sylf_planner_test >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]);
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8")
    .replace(/\nmodel Planner(?:Plan|Revision|QuestLink|CheckResult|Preference|FrictionEvent|IntakeSession) \{[\s\S]*?\n\}\n/g, "\n")
    .replace(/^\s*plannerPlans\s+PlannerPlan\[\].*\n/gm, "")
    .replace(/^\s*plannerLink\s+PlannerQuestLink\?.*\n/gm, "")
    .replace(/^\s*plannerCheckResults\s+PlannerCheckResult\[\].*\n/gm, "")
    .replace(/^\s*plannerPreferences\s+PlannerPreference\[\].*\n/gm, "")
    .replace(/^\s*plannerFrictionEvents\s+PlannerFrictionEvent\[\].*\n/gm, "")
    .replace(/^\s*plannerIntakeSessions\s+PlannerIntakeSession\[\].*\n/gm, "");
  writeFileSync(join(temp, "before.prisma"), schema);
  const migrations = join(temp, "migrations"); mkdirSync(migrations);
  const stage = (name, sql) => { const dir = join(migrations, name); mkdirSync(dir); writeFileSync(join(dir, "migration.sql"), sql); };
  const bootstrap = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE PUBLICATION supabase_realtime;
`;
  const baseline = run(prisma, ["migrate", "diff", "--from-empty", "--to-schema", join(temp, "before.prisma"), "--script"]);
  stage("00000000000000_audited_schema", bootstrap + baseline);
  for (const name of ["20260822000000_atomic_apex_forge_and_skill_unlock_rpcs", "20260827000000_s2_security_hardening", "20260827010000_s2_policy_jwt_semantics", "20260827020000_s2_policy_recursion_fix", "20260827050000_sp_stipend_level_rank_ups", "20260924010000_planner_foundation", "20260925152657_planner_check_result", "20260926010000_planner_preference_friction", "20260926020000_planner_intake_session", "20260926030000_subject_archived_at", "20260927090000_planner_user_released_disposition", "20260927100000_planner_reoffer_state"]) {
    const sql = readFileSync(join(root, "prisma/migrations", name, "migration.sql"), "utf8"); stage(name, sql);
  }
  copyFileSync(join(root, "prisma/migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
  const config = join(temp, "prisma.config.ts");
  writeFileSync(config, `export default ${JSON.stringify({ schema: join(root, "prisma/schema.prisma"), migrations: { path: migrations }, datasource: { url } })};`);
  run(prisma, ["migrate", "deploy", "--config", config], { stdio: "inherit" });
  // A real database is serialized here on purpose: the planner's operations run at
  // SERIALIZABLE with per-user advisory locks, so two suites writing at once turn
  // into retryable 40001 conflicts that say nothing about the code under test.
  const filter = process.argv[2] ?? "__tests__/planner";
  run(join(root, "node_modules/.bin/vitest"), ["run", "--no-file-parallelism", filter], { stdio: "inherit", env: { ...process.env, PLANNER_TEST_DATABASE_URL: url } });
  console.log(`Planner migration, security, transaction, contract and client tests passed on disposable PostgreSQL (${filter}).`);
} finally {
  if (started) run("docker", ["rm", "--force", "--volumes", container]);
  rmSync(temp, { recursive: true, force: true });
}
