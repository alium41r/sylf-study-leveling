// Investigate the session-end / complete-quest API: timing + behavior + errors.
// Drives real DB + API: register user, seed quest, start session, flush, complete.
import { spawn } from "node:child_process";
import { Client } from "pg";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9267;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-se2-" + Date.now(),
  "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); const t = await r.json(); const p = t.find(x => x.type === "page"); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(500);
  }
  throw new Error("no cdp");
}
let msgId = 0; const pending = new Map(); let ws;
function send(m, p = {}) { const i = ++msgId; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => { pending.set(i, { res, rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + m)); } }, 30000); }); }
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result?.value; }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  const reg = await ev(`(async () => {
    const u = 'se' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'SE Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    return { token: d.token, userId: d.user.id };
  })()`);
  console.log("user:", reg.userId);

  // Seed a quest directly in the DB
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const questRes = await db.query(
    `INSERT INTO "Quest" ("userId", "title", "targetMinutes", "requiredMinutes", "elapsedSeconds", "scopeWeight", "status", "difficulty", "scheduledFor", "xpReward", "sylphReward")
     VALUES ($1, 'Reproduction Quest — Physics', 1, 1, 0, 0.5, 'ACTIVE', 'NORMAL', '2026-08-01', 150, 25) RETURNING id`,
    [reg.userId]
  );
  const questId = questRes.rows[0].id;
  console.log("quest id:", questId);
  await db.end();

  const api = async (path, opts) => {
    const t0 = Date.now();
    const res = await fetch(`http://localhost:3000${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${reg.token}`, ...(opts?.headers || {}) },
    });
    const text = await res.text();
    return { status: res.status, ms: Date.now() - t0, body: text.slice(0, 400) };
  };

  // 1. Start session (quest-linked)
  const start = await api("/api/sessions", { method: "POST", body: JSON.stringify({ questId }) });
  console.log("START:", JSON.stringify(start));
  const sessionId = JSON.parse(start.body)?.id || JSON.parse(start.body)?.sessionId;
  console.log("session id:", sessionId);

  // 2. Periodic flush (non-final)
  const flush = await api("/api/sessions", { method: "PATCH", body: JSON.stringify({ id: sessionId, durationMinutes: 0, durationSeconds: 42, questId, final: false }) });
  console.log("FLUSH:", JSON.stringify(flush));

  // 3. COMPLETE QUEST (final + completeQuest)
  const complete = await api("/api/sessions", { method: "PATCH", body: JSON.stringify({ id: sessionId, durationMinutes: 1, durationSeconds: 70, questId, completeQuest: true, final: true }) });
  console.log("COMPLETE:", JSON.stringify(complete));

  // 4. Verify quest state
  const db2 = new Client({ connectionString: process.env.DATABASE_URL });
  await db2.connect();
  const q = await db2.query(`SELECT id, status, "elapsedSeconds", "completedAt" FROM "Quest" WHERE id=$1`, [questId]);
  console.log("QUEST AFTER:", JSON.stringify(q.rows[0]));
  const s = await db2.query(`SELECT id, "durationSeconds", "endedAt" FROM "StudySession" WHERE id=$1`, [sessionId]);
  console.log("SESSION AFTER:", JSON.stringify(s.rows[0]));
  await db2.end();

  ws.close(); chrome.kill(); console.log("done");
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
