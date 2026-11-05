/** RLS, grants and RPC audit on a disposable PostgreSQL built from all of prisma/migrations. Never accepts a database URL.
 * node scripts/test/test-rls-audit-postgres.mjs [--out documentation/native/reports/phase-11/evidence]
 * The hosted database is not touched and is not described by this result: it shows what the migration history produces.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { buildSchemaFromMigrations, root, startDisposablePostgres } from "./lib/disposable-backend.mjs";

const flag = process.argv.indexOf("--out");
const out = resolve(root, flag > 0 ? process.argv[flag + 1] : "documentation/native/reports/phase-11/evidence");
mkdirSync(out, { recursive: true });

const INVENTORY = {
  tables: `SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select, has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') AS anon_write,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select, has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') AS auth_write,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`,
  policies: `SELECT tablename AS "table", policyname AS name, permissive, roles::text[] AS roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`,
  definers: `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS definer,
      p.proconfig AS config, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY 1, 2`,
  publication: `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 2`,
  triggers: `SELECT c.relname AS "table", t.tgname AS name, p.proname AS fn FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1, 2`,
};

/** Runs as a Supabase role with claims, exactly as PostgREST and Realtime do, and always rolls back. */
async function asRole(client, role, sub, work) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub: String(sub), role } : { role })]);
    await client.query(`SET LOCAL ROLE ${role}`);
    return await work();
  } finally { await client.query("ROLLBACK").catch(() => {}); }
}

const backend = await startDisposablePostgres({ log: message => console.error(message) });
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), scope: "The migration history replayed on disposable PostgreSQL 17. Hosted state was not inspected." };
let client; let exit = 0;
try {
  const build = await buildSchemaFromMigrations(backend.url);
  report.build = { migrations: build.migrations.length, appliedWhole: build.migrations.filter(m => m.applied).length,
    recovered: build.migrations.filter(m => m.recovered).map(m => ({ name: m.name, statementsApplied: m.statementsApplied, alreadyPresent: m.alreadyPresent, remaining: m.remaining })),
    historyGaps: build.gaps, repairedByPrismaDiff: build.repair.applied, declined: build.secondRepair.declined };
  client = new pg.Client({ connectionString: backend.url }); await client.connect();
  report.inventory = {};
  for (const [key, sql] of Object.entries(INVENTORY)) report.inventory[key] = (await client.query(sql)).rows;

  const tables = report.inventory.tables;
  report.summary = {
    tables: tables.length,
    rlsEnabled: tables.filter(t => t.rls).length,
    noRls: tables.filter(t => !t.rls).map(t => t.name),
    noRlsReachableByAnonOrAuthenticated: tables.filter(t => !t.rls && (t.anon_select || t.auth_select)).map(t => t.name),
    rlsWithNoPolicy: tables.filter(t => t.rls && t.policies === 0).map(t => t.name),
    permissivePoliciesWithTrueQual: report.inventory.policies.filter(p => /^\s*\(?true\)?\s*$/i.test(p.qual ?? "") || /^\s*\(?true\)?\s*$/i.test(p.with_check ?? "")).map(p => `${p.table}.${p.name} (${p.cmd})`),
    policiesForAnonOrPublic: report.inventory.policies.filter(p => p.roles.some(role => role === "anon" || role === "public")).map(p => `${p.table}.${p.name} (${p.cmd}, ${p.roles})`),
    definersExecutableByAnon: report.inventory.definers.filter(f => f.definer && f.anon).map(f => `${f.name}(${f.args})`),
    definersExecutableByAuthenticated: report.inventory.definers.filter(f => f.definer && f.authenticated).map(f => `${f.name}(${f.args})`),
    definersWithoutSearchPath: report.inventory.definers.filter(f => f.definer && !(f.config ?? []).some(entry => entry.startsWith("search_path="))).map(f => f.name),
    allFunctionsExecutableByAnon: report.inventory.definers.filter(f => f.anon).map(f => f.name),
    published: report.inventory.publication.map(p => p.tablename),
  };

  // Two people, so a cross-user read or write has something to find. The application role owns these rows; the probes do not.
  await client.query(`INSERT INTO "User" (id, email, username, password, "scholarId") VALUES (9001,'a@local.test','audit_a','x','#9001'),(9002,'b@local.test','audit_b','x','#9002')`);
  const probes = [];
  for (const table of tables) {
    const quoted = `"${table.name}"`;
    for (const [role, sub] of [["anon", null], ["authenticated", 9001]]) {
      const result = await asRole(client, role, sub, async () => {
        const entry = { table: table.name, role };
        try { entry.read = (await client.query(`SELECT count(*)::int AS n FROM ${quoted}`)).rows[0].n; } catch (error) { entry.read = `denied: ${error.code}`; }
        return entry;
      });
      probes.push(result);
    }
  }
  report.anonymousReads = probes.filter(p => p.role === "anon" && typeof p.read === "number").map(p => `${p.table}: ${p.read}`);
  report.authenticatedSeesOtherRows = probes.filter(p => p.role === "authenticated" && typeof p.read === "number" && p.read > 0).map(p => `${p.table}: ${p.read}`);

  // Direct economy writes through the Data API, which is what a stolen Realtime token could reach.
  const writes = {
    "User: raise own XP": `UPDATE "User" SET "currentXP" = 999999, sylph = 999999 WHERE id = 9001`,
    "User: read another person's password": `SELECT password FROM "User" WHERE id = 9002`,
    "User: bump own tokenVersion": `UPDATE "User" SET "tokenVersion" = 99 WHERE id = 9001`,
  };
  report.directWrites = {};
  for (const [label, sql] of Object.entries(writes)) {
    report.directWrites[label] = await asRole(client, "authenticated", 9001, async () => {
      try { const result = await client.query(sql); return { rowCount: result.rowCount, rows: result.rows.length }; }
      catch (error) { return { denied: error.code, message: String(error.message).slice(0, 100) }; }
    });
  }
  // Grants are the outer wall and RLS the inner one. So the inner wall is tested with the outer one removed, inside a rolled-back
  // transaction: grant SELECT, then ask what person A can read of a row each belongs to person A and person B.
  const seeds = {
    Goal: `INSERT INTO "Goal" ("userId", title, "targetWeeks") VALUES (9001,'mine',1),(9002,'theirs',1)`,
    StudySession: `INSERT INTO "StudySession" ("userId", "durationMinutes") VALUES (9001,0),(9002,0)`,
    ChatSession: `INSERT INTO "ChatSession" ("userId", title, "updatedAt") VALUES (9001,'mine',now()),(9002,'theirs',now())`,
    AuthSession: `INSERT INTO "AuthSession" (id, "userId") VALUES ('sa',9001),('sb',9002)`,
    VerificationToken: `INSERT INTO "VerificationToken" ("userId", token, "expiresAt") VALUES (9001,'ta',now()),(9002,'tb',now())`,
    SystemMessage: `INSERT INTO "SystemMessage" ("userId", content, type) VALUES (9001,'mine','INFO'),(9002,'theirs','INFO')`,
    Quest: `INSERT INTO "Quest" ("userId", title, "xpReward", "sylphReward") VALUES (9001,'mine',1,1),(9002,'theirs',1,1)`,
  };
  report.policiesWithGrantForced = {};
  for (const [table, seed] of Object.entries(seeds)) {
    await client.query("BEGIN");
    try {
      await client.query(seed);
      await client.query(`GRANT SELECT ON "${table}" TO authenticated`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: "9001", role: "authenticated" })]);
      await client.query("SET LOCAL ROLE authenticated");
      const rows = (await client.query(`SELECT "userId" FROM "${table}"`)).rows;
      report.policiesWithGrantForced[table] = { visible: rows.length, others: rows.filter(row => row.userId !== 9001).length };
    } catch (error) { report.policiesWithGrantForced[table] = { error: String(error.message).slice(0, 120) }; }
    finally { await client.query("ROLLBACK").catch(() => {}); }
  }

  // The tables Realtime reads really are granted, so these are tested as they stand.
  await client.query(`INSERT INTO "FocusParty" (id, name, "leaderId") VALUES (7001,'theirs',9002) ON CONFLICT DO NOTHING`);
  await client.query(`INSERT INTO "FocusPartyMember" ("partyId","userId") VALUES (7001,9002) ON CONFLICT DO NOTHING`);
  report.realtimeTables = {};
  for (const table of ["FocusParty", "FocusPartyMember", "FocusSession", "FocusSessionMember", "SessionInvite"]) {
    report.realtimeTables[table] = await asRole(client, "authenticated", 9001, async () => {
      try { return { rowsVisibleToOutsider: (await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n }; }
      catch (error) { return { denied: error.code }; }
    });
  }
  report.realtimeGrantedRoleWrites = await asRole(client, "authenticated", 9002, async () => {
    try { const result = await client.query(`UPDATE "FocusParty" SET name='x' WHERE id=7001`); return { rowCount: result.rowCount }; }
    catch (error) { return { denied: error.code }; }
  });
  // Message Realtime (Expansion Part 3, slice C): a token for someone outside a conversation hears nothing from it, and a participant hears it. The grant is
  // forced inside a rolled-back transaction, because Realtime reads with the role's own rights and the inner wall (RLS) is what is being tested.
  await client.query(`INSERT INTO "User" (id, email, username, password, "scholarId") VALUES (9003,'c@local.test','audit_c','x','#9003') ON CONFLICT DO NOTHING`);
  report.messageRealtime = {};
  for (const [label, sub] of [["outsider", 9001], ["participant", 9002], ["other participant", 9003]]) {
    await client.query("BEGIN");
    try {
      await client.query(`INSERT INTO "Conversation" (id, "isGroup", "updatedAt") VALUES (8001, false, now())`);
      await client.query(`INSERT INTO "ConversationParticipant" ("userId","conversationId") VALUES (9002,8001),(9003,8001)`);
      await client.query(`INSERT INTO "Message" ("conversationId","senderId",content) VALUES (8001,9002,'private')`);
      // The policy reads ConversationParticipant as the caller, so Realtime needs both grants. Neither is held on a database built from the history (the
      // defense-in-depth migration removed them), which means Realtime would deliver nothing there and the polling fallback carries on.
      await client.query(`GRANT SELECT ON "Message", "ConversationParticipant" TO authenticated`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: String(sub), role: "authenticated" })]);
      await client.query("SET LOCAL ROLE authenticated");
      report.messageRealtime[label] = { rowsVisible: (await client.query(`SELECT count(*)::int AS n FROM "Message"`)).rows[0].n };
    } catch (error) { report.messageRealtime[label] = { error: String(error.message).slice(0, 120) }; }
    finally { await client.query("ROLLBACK").catch(() => {}); }
  }
  report.messageRealtime.publishedOnThisDatabase = report.summary.published.includes("Message");
  report.messageRealtime.grantsHeldByAuthenticated = (await client.query(`SELECT has_table_privilege('authenticated','"Message"','SELECT') AS message, has_table_privilege('authenticated','"ConversationParticipant"','SELECT') AS participant`)).rows[0];
  const heard = report.messageRealtime;
  if (heard.outsider?.rowsVisible !== 0 || heard.participant?.rowsVisible !== 1 || heard["other participant"]?.rowsVisible !== 1) throw new Error(`Message RLS is wrong for Realtime: ${JSON.stringify(heard)}`);
  report.status = "PASSED";
} catch (error) {
  report.status = "FAILED"; report.error = backend.redact(error.stack ?? error.message); exit = 1;
  console.error(report.error);
} finally {
  await client?.end().catch(() => {});
  backend.stop();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "rls-audit.json"), JSON.stringify(report, null, 1) + "\n");
  process.exitCode = exit;
}
console.log(`RLS audit ${report.status}. Evidence: ${join(out, "rls-audit.json")}`);
