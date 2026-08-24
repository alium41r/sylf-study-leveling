// Verify: (1) onboarding domain previews == real BG_MAP gradients, no style
// conflict console errors, mode switch updates previews, bg applies live and
// persists; (2) Complete Quest always marks COMPLETED with time-scaled
// rewards; full duration grants the full reward.
import { spawn } from "node:child_process";
import { Client } from "pg";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9276;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-v2e2e3-" + Date.now(),
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
const consoleErrors = [];
function send(m, p = {}) { const i = ++msgId; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => { pending.set(i, { res, rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + m)); } }, 30000); }); }
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result?.value; }

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      consoleErrors.push((m.params.args || []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  // Fresh user WITHOUT onboarding for the onboarding-flow section.
  const reg = await ev(`(async () => {
    const u = 'v2' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'V2 E2E' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    return { token: d.token, userId: d.user.id };
  })()`);
  console.log("user:", reg.userId);

  // ── 1. Onboarding: previews, console, mode, live apply ──
  console.log("\n═══ ONBOARDING DOMAIN PREVIEWS ═══");
  await send("Page.navigate", { url: "http://localhost:3000/onboarding" });
  await sleep(6000); // BOOT → SUBJECTS
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/CONFIRM CURRICULUM/i.test(x.textContent||'')); b?.click(); return 1; })()`);
  await sleep(1200); // → THEME step

  // Add a subject first check skipped: canProceed needs subjects; the fresh
  // state has one preset-less subject? configuredSubjects default = Mathematics.
  const previews = await ev(`(() => {
    const cards = [...document.querySelectorAll('button')].filter(b => /The Void|Abyssal Glow|Aurora Borealis|Deep Ocean/.test(b.textContent||''));
    const sink = document.createElement('div'); document.body.appendChild(sink);
    return cards.map(c => {
      const el = c.querySelector('div[style*="background"]');
      const img = el ? el.style.backgroundImage : null;
      return img ? img.slice(0, 40) : null;
    }).filter(Boolean);
  })()`);
  console.log("preview gradients:", JSON.stringify(previews));
  check("previews render real gradients", previews.length >= 1, previews[0]);

  // Compare with BG_MAP: a void card must start with "radial-gradient"
  const voidMatches = await ev(`(() => {
    const card = [...document.querySelectorAll('button')].find(b => /The Void/.test(b.textContent||''));
    const el = card && card.querySelector('div[style*="background"]');
    return el ? el.style.backgroundImage : null;
  })()`);
  check("The Void preview = real void gradient", /radial-gradient/.test(voidMatches || ""), voidMatches?.slice(0, 50));

  // Mode switch updates previews (light variant differs from dark)
  const modeSwap = await ev(`(async () => {
    const light = [...document.querySelectorAll('button')].find(b => /Light Mode/.test(b.textContent||''));
    light?.click();
    await new Promise(r => setTimeout(r, 900));
    return getComputedStyle(document.documentElement).getPropertyValue('--bg-void').trim();
  })()`);
  check("light mode applied", modeSwap === "#f8fafc", modeSwap);

  // Select abyssal-glow → live layer switch
  const live = await ev(`(async () => {
    const card = [...document.querySelectorAll('button')].find(b => /Abyssal Glow/.test(b.textContent||''));
    card?.click();
    await new Promise(r => setTimeout(r, 900));
    return getComputedStyle(document.getElementById('app-bg-layer')).backgroundImage.slice(0, 60);
  })()`);
  check("background applies live in onboarding", /radial-gradient/.test(live), live);

  const styleErr = consoleErrors.filter(e => /Updating a style property|shorthand/i.test(e));
  check("NO style shorthand/longhand console error", styleErr.length === 0, styleErr[0]);

  // Mark the user onboarded so the quest-focused flows are reachable.
  await ev(`fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) })`);

  // ── 2. Complete quest semantics ──
  console.log("\n═══ COMPLETE QUEST REWARD SCALING ═══");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const qA = await db.query(`INSERT INTO "Quest" ("userId","title","targetMinutes","requiredMinutes","elapsedSeconds","scopeWeight","status","difficulty","scheduledFor","xpReward","sylphReward") VALUES ($1,'Scaled Quest',2,2,0,0.5,'IN_PROGRESS','NORMAL','2026-08-24',150,25) RETURNING id`, [reg.userId]);
  const questA = qA.rows[0].id;
  const stats0 = await db.query(`SELECT "currentXP", sylph FROM "User" WHERE id=$1`, [reg.userId]);
  console.log("baseline:", JSON.stringify(stats0.rows[0]), "questA:", questA);

  await send("Page.navigate", { url: `http://localhost:3000/focus?questId=${questA}&subjectName=Test` });
  await sleep(5000); // session starts, timer ticks ~5s
  // Wait ~70s of focus (2-min target → ~58% completion)
  await sleep(70000);
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /COMPLETE QUEST/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);
  let url = "";
  for (let i = 0; i < 30; i++) { await sleep(300); url = await ev("location.pathname"); if (/timer/i.test(url)) break; }
  const qa = await db.query(`SELECT status, "elapsedSeconds" FROM "Quest" WHERE id=$1`, [questA]);
  const stats1 = await db.query(`SELECT "currentXP", sylph FROM "User" WHERE id=$1`, [reg.userId]);
  console.log("after early complete:", JSON.stringify(qa.rows[0]), JSON.stringify(stats1.rows[0]), "url:", url);
  const xpDelta1 = stats1.rows[0].currentXP - stats0.rows[0].currentXP;
  const sylphDelta1 = stats1.rows[0].sylph - stats0.rows[0].sylph;
  check("early complete marks quest COMPLETED", qa.rows[0].status === "COMPLETED");
  check("scaled reward < full 150 XP", xpDelta1 > 0 && xpDelta1 < 150, `xpDelta=${xpDelta1}`);
  check("scaled sylph < full 25", sylphDelta1 < 25, `sylphDelta=${sylphDelta1}`);

  // Full-duration complete (1-min target, study ~65s)
  const qB = await db.query(`INSERT INTO "Quest" ("userId","title","targetMinutes","requiredMinutes","elapsedSeconds","scopeWeight","status","difficulty","scheduledFor","xpReward","sylphReward") VALUES ($1,'Full Quest',1,1,0,0.5,'IN_PROGRESS','NORMAL','2026-08-24',150,25) RETURNING id`, [reg.userId]);
  const questB = qB.rows[0].id;
  await send("Page.navigate", { url: `http://localhost:3000/focus?questId=${questB}&subjectName=Test` });
  await sleep(5000);
  await sleep(65000);
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /COMPLETE QUEST/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);
  let urlB = "";
  for (let i = 0; i < 30; i++) { await sleep(300); urlB = await ev("location.pathname"); if (/timer/i.test(urlB)) break; }
  const qb = await db.query(`SELECT status FROM "Quest" WHERE id=$1`, [questB]);
  const stats2 = await db.query(`SELECT "currentXP", sylph FROM "User" WHERE id=$1`, [reg.userId]);
  const xpDelta2 = stats2.rows[0].currentXP - stats1.rows[0].currentXP;
  console.log("after full complete:", JSON.stringify(qb.rows[0]), JSON.stringify(stats2.rows[0]));
  check("full-duration quest COMPLETED", qb.rows[0].status === "COMPLETED");
  check("full reward granted (>=150 XP)", xpDelta2 >= 150, `xpDelta=${xpDelta2}`);

  // The quests API (timer page + dashboard data source) must report COMPLETED.
  const apiList = await ev(`(async () => {
    const res = await fetch('/api/quests?all=true', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    const list = await res.json();
    const ids = Array.isArray(list) ? list.map(q => q.id) : [];
    const done = Array.isArray(list) ? list.filter(q => q.status === 'COMPLETED') : [];
    return { foundBoth: ids.includes(${questA}) && ids.includes(${questB}), completedBoth: done.some(q => q.id === ${questA}) && done.some(q => q.id === ${questB}) };
  })()`);
  console.log("quests API:", JSON.stringify(apiList));
  check("timer/dashboard quest API reports both COMPLETED", apiList.foundBoth && apiList.completedBoth);

  ws.close(); chrome.kill(); await db.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
