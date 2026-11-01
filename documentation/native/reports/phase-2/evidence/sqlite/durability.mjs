// SQLite crash-durability model of the Notes local mutation contract (SIGKILL = app/process crash, not power loss).
import { DatabaseSync } from "node:sqlite"; import { spawn } from "node:child_process"; import fs from "node:fs"; import crypto from "node:crypto";
const [role, dbPath, sync] = process.argv.slice(2);
const SCHEMA = `
CREATE TABLE IF NOT EXISTS journal(op_id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, seq INTEGER NOT NULL, digest TEXT NOT NULL, bytes BLOB NOT NULL, UNIQUE(stream_id, seq));
CREATE TABLE IF NOT EXISTS outbox(op_id TEXT PRIMARY KEY REFERENCES journal(op_id), state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stream_head(stream_id TEXT PRIMARY KEY, local_revision INTEGER NOT NULL);`;
function open(p) { const db = new DatabaseSync(p); db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=${sync}; PRAGMA foreign_keys=ON;`); db.exec(SCHEMA); return db; }
if (role === "writer") {
  const db = open(dbPath);
  const head = db.prepare("SELECT local_revision FROM stream_head WHERE stream_id='s1'").get();
  let seq = head ? head.local_revision : 0;
  const ins = db.prepare("INSERT INTO journal VALUES(?,?,?,?,?)"), ob = db.prepare("INSERT INTO outbox VALUES(?, 'pending')"), hd = db.prepare("INSERT INTO stream_head VALUES('s1', ?) ON CONFLICT(stream_id) DO UPDATE SET local_revision=excluded.local_revision");
  const lat = [];
  for (;;) {
    seq++; const size = 1024 + Math.floor(Math.random() * 64 * 1024); const bytes = crypto.randomBytes(size);
    const digest = crypto.createHash("sha256").update(bytes).digest("hex"); const op = crypto.randomUUID();
    const t0 = process.hrtime.bigint();
    db.exec("BEGIN IMMEDIATE"); ins.run(op, "s1", seq, digest, bytes); ob.run(op); hd.run(seq); db.exec("COMMIT");
    const ms = Number(process.hrtime.bigint() - t0) / 1e6; lat.push(ms);
    // Acknowledge only after COMMIT returned (this is the "saved on device" signal).
    fs.writeSync(1, `ACK ${seq} ${op}\n`);
    if (lat.length === 200) { lat.sort((a,b)=>a-b); fs.writeSync(2, `LAT p50=${lat[100].toFixed(3)} p95=${lat[190].toFixed(3)} max=${lat[199].toFixed(3)}\n`); lat.length = 0; }
  }
} else {
  const rounds = Number(process.argv[5] || 40); const report = { sync, rounds, killed: 0, ackedTotal: 0, lostAcked: 0, partial: 0, digestMismatch: 0, integrityFailures: 0, gaps: 0, latency: [] };
  fs.rmSync(dbPath, { force: true }); fs.rmSync(dbPath + "-wal", { force: true }); fs.rmSync(dbPath + "-shm", { force: true });
  for (let r = 0; r < rounds; r++) {
    const acked = new Map();
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [process.argv[1], "writer", dbPath, sync], { stdio: ["ignore", "pipe", "pipe"] });
      let buf = ""; child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const [, s, op] = buf.slice(0, i).split(" "); acked.set(Number(s), op); buf = buf.slice(i + 1); } });
      child.stderr.on("data", (d) => { const m = /LAT p50=([\d.]+) p95=([\d.]+)/.exec(String(d)); if (m) report.latency.push([+m[1], +m[2]]); });
      setTimeout(() => { child.kill("SIGKILL"); report.killed++; }, 150 + Math.random() * 700);
      child.on("exit", resolve);
    });
    const db = open(dbPath);
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") report.integrityFailures++;
    const rows = db.prepare("SELECT j.seq, j.op_id, j.digest, j.bytes, o.op_id AS ob FROM journal j LEFT JOIN outbox o USING(op_id) WHERE j.stream_id='s1' ORDER BY j.seq").all();
    const head = db.prepare("SELECT local_revision FROM stream_head WHERE stream_id='s1'").get()?.local_revision ?? 0;
    const bySeq = new Map(rows.map((x) => [x.seq, x]));
    for (const x of rows) { if (!x.ob) report.partial++; if (crypto.createHash("sha256").update(x.bytes).digest("hex") !== x.digest) report.digestMismatch++; }
    if (rows.length && (rows.at(-1).seq !== head || rows.length !== head)) report.gaps++;
    for (const [s, op] of acked) { report.ackedTotal++; if (bySeq.get(s)?.op_id !== op) report.lostAcked++; }
    db.close();
  }
  const l = report.latency; report.latency = l.length ? { batches: l.length, medianP50ms: l.map(x=>x[0]).sort((a,b)=>a-b)[l.length>>1], medianP95ms: l.map(x=>x[1]).sort((a,b)=>a-b)[l.length>>1] } : null;
  console.log(JSON.stringify(report));
}
