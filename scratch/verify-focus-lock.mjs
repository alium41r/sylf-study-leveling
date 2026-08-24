// Verify /focus is a fixed page: no document scroll on mobile or desktop,
// tools dock still present and clickable.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9252;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-focuslock4-" + Date.now(),
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
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; }
async function shot(name) { const res = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64")); console.log("shot:", name); }

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2200);
  await ev(`(async () => {
    const u = 'lock' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Lock Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Physics" });
  await sleep(7000);

  const m1 = await ev(`(() => {
    const root = document.querySelector('main > div, main .select-none') || [...document.querySelectorAll('div')].find(d => (d.className||'').includes('select-none') && (d.className||'').includes('justify-between'));
    const toolsDock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('FocusToolsDock') || (d.className||'').includes('focus-tools-dock'));
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      rootFound: !!root,
      rootHeight: root ? root.getBoundingClientRect().height : null,
      rootOverflow: root ? getComputedStyle(root).overflow : null,
      startTimerBtn: [...document.querySelectorAll('button')].some(b => (b.textContent||'').includes('START TIMER') || (b.textContent||'').includes('START SESSION')),
      toolsBar: [...document.querySelectorAll('button,span,p,div')].some(s => ((s.textContent||'').trim().toUpperCase()) === 'TOOLS'),
    };
  })()`);
  console.log("mobile focus:", JSON.stringify(m1, null, 1));
  console.log("URL:", await ev("location.pathname"));
  console.log("TEXT:", (await ev("document.body.innerText.slice(0,300)")).replace(/\n+/g, " | "));
  check("document does NOT overflow viewport (mobile)", m1.scrollHeight <= m1.innerHeight + 2, `scrollH=${m1.scrollHeight} innerH=${m1.innerHeight}`);
  check("focus root height locks to viewport", m1.rootHeight <= m1.innerHeight + 2, `rootH=${m1.rootHeight}`);
  check("focus root overflow hidden", m1.rootOverflow === "hidden");
  check("tools bar present", m1.toolsBar);
  await shot("focus-mobile-locked");

  // Try to scroll — window must not move.
  const scrollTest = await ev(`(async () => {
    window.scrollTo(0, 500);
    await new Promise(r => setTimeout(r, 300));
    const a = window.scrollY;
    window.scrollBy(0, -200);
    await new Promise(r => setTimeout(r, 300));
    const b = window.scrollY;
    return { first: a, second: b, maxScroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  console.log("scroll test:", JSON.stringify(scrollTest));
  check("page cannot be scrolled (mobile)", scrollTest.first === 0 && scrollTest.second === 0);

  console.log("\n═══ DESKTOP ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Physics" });
  await sleep(7000);
  const d1 = await ev(`(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    toolsBar: [...document.querySelectorAll('button,span,p,div')].some(s => ((s.textContent||'').trim().toUpperCase()) === 'TOOLS'),
  }))()`);
  console.log("desktop focus:", JSON.stringify(d1));
  check("document does NOT overflow viewport (desktop)", d1.scrollHeight <= d1.innerHeight + 2, `scrollH=${d1.scrollHeight} innerH=${d1.innerHeight}`);
  await shot("focus-desktop-locked");

  // Open the tools bar to ensure tools still work (window opens, has content)
  const toolsOpen = await ev(`(async () => {
    const toolsBtn = [...document.querySelectorAll('button,span,p,div')].find(s => ((s.textContent||'').trim().toUpperCase()) === 'TOOLS');
    const btn = toolsBtn && toolsBtn.closest('button');
    if (!btn) return 'no tools button';
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    const win = [...document.querySelectorAll('div')].filter(d => (d.className||'').includes('rounded-2xl') && (d.className||'').includes('z-')).length;
    return { clicked: true, windows: win };
  })()`);
  console.log("tools open:", JSON.stringify(toolsOpen));
  check("tools can be opened", toolsOpen.clicked === true);

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
