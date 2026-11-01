// expo-sqlite model of the Notes local mutation contract; driven by adb kill/relaunch cycles.
import * as SQLite from "expo-sqlite";

const SCHEMA = `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS journal(op_id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, seq INTEGER NOT NULL, digest TEXT NOT NULL, bytes BLOB NOT NULL, UNIQUE(stream_id, seq));
CREATE TABLE IF NOT EXISTS outbox(op_id TEXT PRIMARY KEY REFERENCES journal(op_id), state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stream_head(stream_id TEXT PRIMARY KEY, local_revision INTEGER NOT NULL);`;

function fnvBytes(b: Uint8Array) { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
let seed = (Date.now() ^ 0x5bd1e995) >>> 0;
function randomBytes(n: number) { const b = new Uint8Array(n); for (let i = 0; i < n; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; b[i] = seed & 0xff; } return b; }

export function startWriter(onTick: (s: string) => void) {
  const db = SQLite.openDatabaseSync("durability.db"); db.execSync(SCHEMA);
  let seq = (db.getFirstSync<{ local_revision: number }>("SELECT local_revision FROM stream_head WHERE stream_id='s1'")?.local_revision) ?? 0;
  const lat: number[] = []; let stopped = false;
  const step = () => {
    if (stopped) return;
    for (let k = 0; k < 20; k++) {
      seq++; const bytes = randomBytes(1024 + ((seq * 7919) % 48) * 1024); const op = `op-${Date.now()}-${seq}`; const t0 = performance.now();
      db.withTransactionSync(() => {
        db.runSync("INSERT INTO journal VALUES(?,?,?,?,?)", [op, "s1", seq, fnvBytes(bytes), bytes]);
        db.runSync("INSERT INTO outbox VALUES(?, 'pending')", [op]);
        db.runSync("INSERT INTO stream_head VALUES('s1', ?) ON CONFLICT(stream_id) DO UPDATE SET local_revision=excluded.local_revision", [seq]);
      });
      lat.push(performance.now() - t0);
      console.log(`SQLACK ${seq} ${op}`); // emitted only after COMMIT returned
    }
    if (lat.length >= 200) { lat.sort((a, b) => a - b); const s = `SQLLAT p50=${lat[100].toFixed(3)} p95=${lat[190].toFixed(3)} max=${lat[lat.length - 1].toFixed(3)} seq=${seq}`; console.log(s); onTick(s); lat.length = 0; }
    setTimeout(step, 0);
  };
  step();
  return () => { stopped = true; };
}

export function verify() {
  const t0 = performance.now();
  const db = SQLite.openDatabaseSync("durability.db"); db.execSync(SCHEMA);
  const integrity = db.getFirstSync<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check;
  const agg = db.getFirstSync<{ n: number; mn: number; mx: number; partial: number }>("SELECT COUNT(*) AS n, MIN(seq) AS mn, MAX(seq) AS mx, SUM(CASE WHEN o.op_id IS NULL THEN 1 ELSE 0 END) AS partial FROM journal j LEFT JOIN outbox o USING(op_id) WHERE j.stream_id='s1'")!;
  const head = db.getFirstSync<{ local_revision: number }>("SELECT local_revision FROM stream_head WHERE stream_id='s1'")?.local_revision ?? 0;
  const recent = db.getAllSync<{ digest: string; bytes: Uint8Array }>("SELECT digest, bytes FROM journal WHERE stream_id='s1' ORDER BY seq DESC LIMIT 100");
  let digest = 0; for (const r of recent) if (fnvBytes(new Uint8Array(r.bytes)) !== r.digest) digest++;
  const result = { integrity, rows: agg.n, maxSeq: agg.mx ?? 0, head, partial: agg.partial ?? 0, digestMismatch: digest, digestChecked: recent.length, contiguous: agg.n === 0 || (agg.mn === 1 && agg.mx === agg.n), verifyMs: Math.round(performance.now() - t0) };
  console.log("SQLVERIFY " + JSON.stringify(result));
  return result;
}

export function reset() { const db = SQLite.openDatabaseSync("durability.db"); db.execSync("DROP TABLE IF EXISTS outbox; DROP TABLE IF EXISTS journal; DROP TABLE IF EXISTS stream_head;"); db.execSync("VACUUM"); console.log("SQLRESET ok"); }
