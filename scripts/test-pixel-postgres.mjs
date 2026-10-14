/** Disposable PostgreSQL only. Applies the additive Pixel migration unchanged. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'sylf-pixel-db-'));
const container = `sylf-pixel-${randomBytes(6).toString('hex')}`, password = randomBytes(18).toString('hex');
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...options });
let pool, started = false;
try {
 run('docker', ['run', '--detach', '--name', container, '--publish', '127.0.0.1::5432', '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=sylf_pixel_test', 'postgres:17']); started = true;
 const port = run('docker', ['port', container, '5432/tcp']).trim().split(':').at(-1);
 const url = `postgresql://postgres:${password}@127.0.0.1:${port}/sylf_pixel_test`;
 run('docker', ['exec', container, 'sh', '-c', 'for i in $(seq 1 30); do pg_isready -U postgres -d sylf_pixel_test >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1']);
 const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').replace(/  revision  Int      @default\(1\)\n/, '');
 writeFileSync(join(temp, 'before.prisma'), schema);
 const baseline = run(join(root, 'node_modules/.bin/prisma'), ['migrate', 'diff', '--from-empty', '--to-schema', join(temp, 'before.prisma'), '--script']);
 pool = new pg.Pool({ connectionString: url });
 await pool.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`);
 await pool.query(baseline);
 await pool.query(readFileSync(join(root, 'prisma/migrations/20261007000000_pixel_companion_consolidation/migration.sql'), 'utf8'));
 run(join(root, 'node_modules/.bin/vitest'), ['run', '--no-file-parallelism', '__tests__/pixel-display/database-consolidation.test.ts'], { stdio: 'inherit', env: { ...process.env, PIXEL_TEST_DATABASE_URL: url, DATABASE_URL: url, DATABASE_POOL_URL: url, DIRECT_URL: url } });
 console.log('Pixel revision, ownership, quota, deletion and RLS passed on disposable PostgreSQL.');
} finally { await pool?.end(); if (started) run('docker', ['rm', '--force', '--volumes', container]); rmSync(temp, { recursive: true, force: true }); }
