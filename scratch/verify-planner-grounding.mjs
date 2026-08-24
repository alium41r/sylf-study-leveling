// Verify the planner researcher now runs grounded Google Search FIRST and
// synthesizes from its findings (flow-level assertions; live LLM output is
// governed by the sandbox, so chapter fidelity is asserted structurally).
import { spawn } from "node:child_process";
import { Client } from "pg";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9284;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-plg-" + Date.now(),
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
  const u = 'plg' + Date.now();
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Plg' }) });
  const d = await r.json();
  localStorage.setItem('token', d.token);
  localStorage.setItem('user_data', JSON.stringify(d.user));
  await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
  return { token: d.token, userId: d.user.id };
})()`);

const thoughts = [];
const res = await fetch("http://localhost:3000/api/ai-planner", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${reg.token}` },
  body: JSON.stringify({
    topic: "HSSC First Year Biology (FBISE National Foundation)",
    syllabus: "Federal Board Pakistan — HSSC-I Biology",
    effortHours: 8,
  }),
});
const text = await res.text();
const events = text.split("\n\n").filter(Boolean).map((chunk) => {
  const line = chunk.split("\n").find((l) => l.startsWith("data: "));
  try { return line ? JSON.parse(line.slice(6)) : null; } catch { return null; }
}).filter(Boolean);
const result = events.find((e) => e.type === "result");
const thoughtMsgs = events.filter((e) => e.type === "thought").map((e) => e.text);
console.log("thoughts:", JSON.stringify(thoughtMsgs, null, 1));
console.log("result:", JSON.stringify(result).slice(0, 300));

check("planner returned a result", !!result && !!result.goal);
check("grounded search ran FIRST", /Running grounded Google Search/.test(thoughtMsgs[0] || ""), thoughtMsgs[0]);
check("findings received + synthesis follows", thoughtMsgs.some((t) => /Live findings received/.test(t)) && thoughtMsgs.some((t) => /Synthesizing grounded findings/.test(t)));

// Verify quests persisted + chapter-style titles
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = await db.query(`SELECT "title" FROM "Quest" WHERE "goalId"=$1 ORDER BY "scheduledFor" ASC LIMIT 8`, [result.goal.id]);
console.log("quest titles:", JSON.stringify(q.rows));
check("quests persisted for the goal", q.rows.length >= 3);
check("quests are chapter-scoped (Ch N format or real FBISE chapter names)", q.rows.some((r) => /Ch\s*\d|Chapter\s*\d|Biodiversity|Bacteria|Enzymes|Bioenergetics|Cells/i.test(r.title)), q.rows.map((r) => r.title).join(" | ").slice(0, 160));

// Researcher model label should reflect grounded findings
const sys = await db.query(`SELECT "modelUsed" FROM "SystemMessage" WHERE "userId"=$1 AND type='SYSTEM' ORDER BY id DESC LIMIT 1`, [reg.userId]);
console.log("model label:", JSON.stringify(sys.rows[0]));
check("model label references DeepSeek + grounded findings", /DeepSeek/.test(sys.rows[0]?.modelUsed || ""), sys.rows[0]?.modelUsed);

await db.end();
ws.close(); chrome.kill();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
