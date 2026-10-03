// Phase 0 only: bounded, read-only diagnostics. No authentication material is written.
// Run from the repository root: node documentation/performance/phase-0/measure-server.mjs
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), true);
const out = 'documentation/performance/phase-0/artifacts';
fs.mkdirSync(out, { recursive: true });
const base = process.env.SYLF_AUDIT_BASE || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Local server only');
const http = [];
for (const path of (process.env.SYLF_AUDIT_SKIP_HTTP === '1' ? [] : ['/', '/dashboard', '/api/user/stats', '/api/acoustics'])) {
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    try {
      const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
      const headersAt = performance.now();
      const bytes = (await res.arrayBuffer()).byteLength;
      http.push({ path, sample: i + 1, status: res.status, headersMs: headersAt - start, totalMs: performance.now() - start, decodedBytes: bytes });
    } catch (e) { http.push({ path, sample: i + 1, error: e.name }); }
  }
}
if (http.length) fs.writeFileSync(`${out}/http-${new URL(base).port}.json`, JSON.stringify({ at: new Date().toISOString(), base, authentication: 'none; redirects are not authenticated-page timings', samples: http }, null, 2));
if (process.env.SYLF_AUDIT_SKIP_DB === '1') process.exit(0);
const connectionString = process.env.DATABASE_POOL_URL || process.env.DATABASE_URL;
const result = { at: new Date().toISOString(), connection: { pooledVariable: Boolean(process.env.DATABASE_POOL_URL), port: connectionString ? new URL(connectionString).port : null, maxConnectionsUsed: 1 }, queries: [] };
const db = new Client({ connectionString, connectionTimeoutMillis: 8000, application_name: 'sylf_phase0_readonly', options: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000' });
try {
  const started = performance.now();
  await db.connect();
  result.connectMs = performance.now() - started;
  result.startupDefaults = { readOnly:(await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, statementTimeout:(await db.query('SHOW statement_timeout')).rows[0].statement_timeout };
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout='5s'");
  await db.query("SET LOCAL lock_timeout='1s'");
  result.readOnly = (await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  result.version = (await db.query('SHOW server_version')).rows[0].server_version;
  result.tables = (await db.query(`SELECT relname, n_live_tup, seq_scan, idx_scan FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname`)).rows;
  result.indexes = (await db.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('Message','StudySession','SystemMessage','BlockedUser','ConversationParticipant') ORDER BY tablename,indexname`)).rows;
  result.connections = (await db.query('SELECT state, count(*)::int AS count FROM pg_stat_activity GROUP BY state')).rows;
  result.maxConnections = (await db.query('SHOW max_connections')).rows[0].max_connections;
  result.publication = (await db.query("SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename")).rows;
  result.statementsExtension = (await db.query("SELECT extname FROM pg_extension WHERE extname='pg_stat_statements'")).rows.length > 0;
  const uid = (await db.query('SELECT MIN(id) AS id FROM "User"')).rows[0].id;
  const cid = (await db.query('SELECT MIN(id) AS id FROM "Conversation"')).rows[0].id;
  const specs = [
    ['network_roundtrip', 'SELECT 1', []],
    ['auth_revocation', 'SELECT "tokenVersion" FROM "User" WHERE id=$1', [uid]],
    ['today_sessions', 'SELECT "durationMinutes", "durationSeconds", "startedAt", "endedAt" FROM "StudySession" WHERE "userId"=$1 AND "startedAt">=$2', [uid, new Date(new Date().toISOString().slice(0,10))]],
    ['recent_messages', 'SELECT id, "createdAt", "senderId" FROM "Message" WHERE "conversationId"=$1 ORDER BY "createdAt" DESC LIMIT 50', [cid]],
    ['incremental_messages', 'SELECT id, "createdAt", "senderId" FROM "Message" WHERE "conversationId"=$1 AND id>$2 ORDER BY id ASC', [cid, 0]],
    ['notification_window', 'SELECT id, type, read, "createdAt" FROM "SystemMessage" WHERE "userId"=$1 AND "sessionId" IS NULL ORDER BY "createdAt" DESC LIMIT 50', [uid]],
    ['block_lookup', 'SELECT id FROM "BlockedUser" WHERE "userId"=$1 OR "blockedId"=$1', [uid]],
  ];
  function compactPlan(p) { return { node:p['Node Type'], relation:p['Relation Name'], index:p['Index Name'], planRows:p['Plan Rows'], actualRows:p['Actual Rows'], actualTotalMs:p['Actual Total Time'], sharedHitBlocks:p['Shared Hit Blocks'], sharedReadBlocks:p['Shared Read Blocks'], children:(p.Plans || []).map(compactPlan) }; }
  for (const [name, sql, params] of specs) {
    const samplesMs = [];
    for (let i=0;i<7;i++) { const t=performance.now(); await db.query(sql, params); samplesMs.push(performance.now()-t); }
    const plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql, params)).rows[0]['QUERY PLAN'][0];
    result.queries.push({ name, samplesMs, planningMs:plan['Planning Time'], executionMs:plan['Execution Time'], plan:compactPlan(plan.Plan) });
  }
} catch (e) { result.error = { name:e.name, code:e.code || null }; }
finally { await db.query('ROLLBACK').catch(()=>{}); await db.end().catch(()=>{}); fs.writeFileSync(`${out}/database.json`, JSON.stringify(result,null,2)); }
console.log(JSON.stringify({httpSamples:http.length, databaseQueries:result.queries.length, databaseError:result.error || null}));
