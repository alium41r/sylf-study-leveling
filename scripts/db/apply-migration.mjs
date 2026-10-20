// Migration applier for SQL migration files (used when applying outside
// `prisma migrate deploy`). Usage:
//   node scripts/db/apply-migration.mjs <path-to-migration.sql>
// Uses DIRECT_URL (session pooling) so BEGIN/COMMIT is honored.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, "../..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/db/apply-migration.mjs <path-to-migration.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, "utf8");
const url = env.DIRECT_URL || env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL/DIRECT_URL found in .env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1, idleTimeoutMillis: 30000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("✅ Migration applied successfully:", path.basename(sqlFile));
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("❌ Migration FAILED (rolled back):", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
