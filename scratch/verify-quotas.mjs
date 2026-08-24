// Live verification: /api/ai-usage windows + UserQuota enforcement.
import { spawn } from "node:child_process";
import { Client } from "pg";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9280;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-q-" + Date.now(),
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
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; }

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log(`  ✅ ${n}${d ? " — " + d : ""}`); } else { fail++; console.log(`  ❌ ${n}${d ? " — " + d : ""}`); } };

const u = await getWsUrl(); ws = new WebSocket(u);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/login" });
await sleep(2400);
const reg = await ev(`(async () => {
  const u = 'qt' + Date.now();
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Quota' }) });
  const d = await r.json();
  localStorage.setItem('token', d.token);
  localStorage.setItem('user_data', JSON.stringify(d.user));
  return { token: d.token, userId: d.user.id };
})()`);
console.log("user:", reg.userId);

const usage = await ev(`(async () => {
  const res = await fetch('/api/ai-usage', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
  return res.json();
})()`);
console.log("initial usage:", JSON.stringify(usage));
check("planner limit 1, remaining 1", usage.planner?.limit === 1 && usage.planner?.remaining === 1);
check("planner resets next Monday (2026-08-31T00:00:00Z for UTC)", usage.planner?.resetsAt === "2026-08-31T00:00:00.000Z", usage.planner?.resetsAt);
check("compile limit 1, remaining 1", usage.compile?.limit === 1 && usage.compile?.remaining === 1);
check("compile resets at next midnight", !!usage.compile?.resetsAt);

// Simulate consumed quotas: planner week row (this week's Monday) + compile row from YESTERDAY.
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query(
  `INSERT INTO "UserQuota" ("userId","feature","dateKey","used","createdAt","updatedAt") VALUES
   ($1,'planner','2026-08-24',1,NOW(),NOW()),
   ($1,'compile','2026-08-23',1,NOW(),NOW())
   ON CONFLICT ("userId","feature","dateKey") DO UPDATE SET used=1`,
  [reg.userId]
);
const usage2 = await ev(`(async () => {
  const res = await fetch('/api/ai-usage', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
  return res.json();
})()`);
console.log("after simulated usage:", JSON.stringify(usage2));
check("planner exhausted by this week's usage", usage2.planner?.allowed === false && usage2.planner?.remaining === 0);
check("compile unaffected by yesterday's usage (day window)", usage2.compile?.allowed === true && usage2.compile?.remaining === 1);

await db.query(`DELETE FROM "UserQuota" WHERE "userId"=$1`, [reg.userId]);
await db.end();
ws.close(); chrome.kill();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
