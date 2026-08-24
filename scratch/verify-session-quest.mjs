// UI E2E: complete-quest button works & redirects fast; end-session failure
// shows feedback; mobile wake-lock toggle shows ACTIVE + pill dot + errors.
import { spawn } from "node:child_process";
import { Client } from "pg";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9273;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-ue2e5-" + Date.now(),
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

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  const reg = await ev(`(async () => {
    const u = 'ue' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'UI E2E' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.removeItem('mine_');
    return { token: d.token, userId: d.user.id };
  })()`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = await db.query(
    `INSERT INTO "Quest" ("userId","title","targetMinutes","requiredMinutes","elapsedSeconds","scopeWeight","status","difficulty","scheduledFor","xpReward","sylphReward") VALUES ($1,'UI Complete Quest',2,2,0,0.5,'ACTIVE','NORMAL','2026-08-24',150,25) RETURNING id`,
    [reg.userId]
  );
  const questId = q.rows[0].id;
  console.log("quest:", questId);

  // ── 1. Focus on the quest → COMPLETE QUEST button works ──
  console.log("\n═══ COMPLETE QUEST BUTTON (desktop) ═══");
  await send("Page.navigate", { url: `http://localhost:3000/focus?questId=${questId}&subjectName=Test` });
  await sleep(7000);
  const hasBtn = await ev(`(() => [...document.querySelectorAll('button')].some(b => /COMPLETE QUEST/i.test(b.textContent||'')))()`);
  check("Complete Quest button rendered", hasBtn);

  const t0 = Date.now();
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /COMPLETE QUEST/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);
  // wait for redirect
  let url = "";
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    url = await ev("location.pathname");
    if (/timer/i.test(url)) break;
  }
  const elapsedMs = Date.now() - t0;
  const st = await db.query(`SELECT status, "completedAt" FROM "Quest" WHERE id=$1`, [questId]);
  console.log(`redirect after ${elapsedMs}ms, url=${url}, quest=${JSON.stringify(st.rows[0])}`);
  check("Complete Quest navigates to /timer", /timer/i.test(url), url);
  check("quest COMPLETED in DB", st.rows[0]?.status === "COMPLETED");
  check("complete flow under 2.5s", elapsedMs < 2500, `${elapsedMs}ms`);

  // ── 2. END SESSION failure feedback ═══
  console.log("\n═══ END SESSION ERROR FEEDBACK ═══");
  await send("Network.enable");
  // Navigate first so the session START succeeds, THEN block the PATCH route.
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Test" });
  await sleep(8000);
  await send("Network.setBlockedURLs", { urls: ["*localhost:3000/api/sessions*"] });
  const endBtnInfo = await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /END SESSION/i.test(x.textContent||''));
    return { found: !!btn, disabled: btn ? btn.disabled : null };
  })()`);
  console.log("end button:", JSON.stringify(endBtnInfo));
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /END SESSION/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);
  await sleep(2500);
  const fb = await ev(`(() => ({
    url: location.pathname,
    toast: [...document.querySelectorAll('p')].some(p => /Couldn't finish the session|check your connection/i.test(p.textContent||'')),
    stillOnPage: /focus/.test(location.pathname),
  }))()`);
  console.log("failure feedback:", JSON.stringify(fb));
  check("error toast shown on failed end", fb.toast);
  check("stays on focus page after failure", fb.stillOnPage);

  // Unblock → END works
  await send("Network.setBlockedURLs", { urls: [] });
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /END SESSION/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);
  let url2 = "";
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    url2 = await ev("location.pathname");
    if (/timer/i.test(url2)) break;
  }
  check("End Session redirects after unblock", /timer/i.test(url2), url2);

  // ── 3. Mobile wake lock UI (fake API) ──
  console.log("\n═══ MOBILE WAKE-LOCK UI ═══");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__wake = { request: 0, release: 0, fail: true };
      function makeSentinel() {
        const L = {};
        const s = { released: false,
          release: async () => { if (s.released) return; s.released = true; window.__wake.release++; (L['release']||[]).forEach(cb => { try { cb(); } catch(e){} }); },
          addEventListener: (t, cb) => { (L[t] = L[t]||[]).push(cb); },
          removeEventListener: () => {},
        };
        return s;
      }
      const fake = { __fake: true, request: async (type) => {
        window.__wake.request++;
        if (window.__wake.fail) throw new Error('blocked');
        return makeSentinel();
      } };
      try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: fake }); } catch(e){}
      try { Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => fake }); } catch(e){}
    `,
  });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Math" });
  await sleep(7000);

  await ev(`(async () => {
    window.__wake.fail = false; // success mode
    const tools = [...document.querySelectorAll('button')].find(b => ((b.textContent||'').trim().toUpperCase()).startsWith('TOOLS'));
    tools?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 800));
    return 1;
  })()`);
  const sheet = await ev(`(async () => {
    const row = [...document.querySelectorAll('span')].find(s => ((s.textContent||'').toUpperCase()).includes('KEEP SCREEN AWAKE'));
    const btn = row && [...row.closest('div').parentElement.querySelectorAll('button')].find(b => ((b.textContent||'').toUpperCase()).includes('TURN ON'));
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 600));
    const state = [...document.querySelectorAll('span')].find(s => ((s.textContent||'').toUpperCase()).includes('KEEP SCREEN AWAKE'));
    const btn2 = state && [...state.closest('div').parentElement.querySelectorAll('button')].find(b => {
      const t = (b.textContent||'').toUpperCase(); return t.includes('TURN ON') || t.includes('ACTIVE');
    });
    return { after: btn2 ? btn2.textContent.trim() : null, calls: window.__wake };
  })()`);
  console.log("sheet toggle:", JSON.stringify(sheet));
  check("mobile toggle → ACTIVE", sheet.after === "ACTIVE" && sheet.calls.request >= 1);

  // close sheet, check pill dot
  const pillDot = await ev(`(async () => {
    document.querySelector('.fixed.inset-0.z-50')?.click?.();
    await new Promise(r => setTimeout(r, 400));
    const icon = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const dots = icon ? [...icon.querySelectorAll('span')].filter(s => (s.className||'').includes('bg-emerald-400')) : [];
    return dots.length;
  })()`);
  check("pill shows green active dot", pillDot >= 1, `dots=${pillDot}`);

  // failure mode → error feedback (desktop pill title surfaces the reason)
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await ev("window.__wake.fail = true");
  const pillTitle = await ev(`(async () => {
    const click = async () => {
      const keep = [...document.querySelectorAll('button')].find(b => ((b.getAttribute('aria-label')||'').includes('Keep screen')));
      keep?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await new Promise(r => setTimeout(r, 600));
    };
    await click(); // OFF (was active from the mobile test)
    await click(); // ON with fail=true -> request rejects
    const b = [...document.querySelectorAll('button')].find(x => ((x.getAttribute('aria-label')||'').includes('Keep screen')));
    return { title: b ? b.title : null, pressed: b ? b.getAttribute('aria-pressed') : null };
  })()`);
  console.log("desktop blocked toggle:", JSON.stringify(pillTitle));
  check("blocked request shows error in tooltip", /blocked by the browser/i.test(pillTitle.title || ""));
  check("state reverts after blocked request", pillTitle.pressed === "false");

  ws.close(); chrome.kill(); await db.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
