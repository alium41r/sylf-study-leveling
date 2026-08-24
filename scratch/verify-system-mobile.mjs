// Verify mobile System workspace: composer fits, history drawer works,
// planner copy says weekly; desktop rail still fine.
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9282;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-sys2-" + Date.now(),
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
async function shot(name) { const res = await send("Page.captureScreenshot", { format: "png" }); const { writeFileSync, mkdirSync } = await import("node:fs"); mkdirSync("/tmp/sylf-shots", { recursive: true }); writeFileSync(`/tmp/sylf-shots/${name}.png`, Buffer.from(res.data, "base64")); console.log("shot:", name); }

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
  await sleep(2400);
  await ev(`(async () => {
    const u = 'sys' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Sys Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    return 1;
  })()`);

  console.log("═══ MOBILE SYSTEM WORKSPACE ═══");
  await send("Page.navigate", { url: "http://localhost:3000/system" });
  await sleep(6000);

  const layout = await ev(`(() => {
    const iw = window.innerWidth;
    const send = [...document.querySelectorAll('button')].find(b => /SEND/i.test(b.textContent||''));
    const ring = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('w-12 h-12') && (d.className||'').includes('flex-shrink-0'));
    const historyBtn = [...document.querySelectorAll('button')].find(b => /HISTORY/i.test(b.textContent||''));
    const rects = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      iw,
      sendRect: rects(send),
      ringRect: rects(ring),
      historyBtnFound: !!historyBtn,
      historyBtnRect: rects(historyBtn),
      sidebarOpenOnLoad: !![...document.querySelectorAll('div')].some(d => (d.className||'').includes('z-[70]')),
    };
  })()`);
  console.log("layout:", JSON.stringify(layout));
  check("SEND button fully on-screen", layout.sendRect && layout.sendRect.right <= layout.iw + 1, `right=${layout.sendRect?.right} iw=${layout.iw}`);
  check("quota ring fully on-screen", layout.ringRect && layout.ringRect.right <= layout.iw + 1, `right=${layout.ringRect?.right} iw=${layout.iw}`);
  check("mobile History trigger visible", layout.historyBtnFound && layout.historyBtnRect && layout.historyBtnRect.right <= layout.iw + 1);
  check("history drawer NOT auto-open on load", layout.sidebarOpenOnLoad === false);
  await shot("system-mobile");

  // Open the history drawer
  const drawer = await ev(`(async () => {
    const b = [...document.querySelectorAll('button')].find(x => /HISTORY/i.test(x.textContent||''));
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 600));
    const panel = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-[70]'));
    const panelText = panel ? panel.textContent : '';
    return {
      drawerOpen: !!panel,
      hasNewChat: /NEW CHAT/i.test(panelText || ''),
      hasHistoryTitle: /CHAT HISTORY/i.test(panelText || ''),
    };
  })()`);
  console.log("drawer:", JSON.stringify(drawer));
  check("history drawer opens", drawer.drawerOpen && drawer.hasNewChat && drawer.hasHistoryTitle);
  await shot("system-mobile-history");

  // Close via backdrop
  const closed = await ev(`(async () => {
    const backdrop = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('bg-black/60') && (d.className||'').includes('backdrop-blur-sm'));
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 600));
    return ![...document.querySelectorAll('div')].some(d => (d.className||'').includes('z-[70]'));
  })()`);
  check("backdrop closes drawer", closed);

  // Planner copy
  const copy = await ev(`(async () => {
    const plannerTab = [...document.querySelectorAll('button')].find(b => /PLANNER/i.test(b.textContent||''));
    plannerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 800));
    const text = document.body.innerText;
    return {
      weekly: /Free Weekly Plan|Weekly Plan/i.test(text),
      weeklyDesc: /per week on the free tier/i.test(text),
      dailyGone: !/Free Daily Plan|per day on the free tier/i.test(text),
    };
  })()`);
  console.log("planner copy:", JSON.stringify(copy));
  check("planner badge says weekly", copy.weekly);
  check("planner description says per week", copy.weeklyDesc);
  check("no daily-copy left", copy.dailyGone);
  await shot("system-mobile-planner");

  console.log("\n═══ DESKTOP SYSTEM WORKSPACE (rail regression) ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Page.navigate", { url: "http://localhost:3000/system?tab=conversation" });
  await sleep(6000);
  const desk = await ev(`(() => {
    const rail = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('hidden md:flex') && (d.className||'').includes('w-64'));
    const historyBtn = [...document.querySelectorAll('button')].find(b => /HISTORY/i.test(b.textContent||''));
    return { railFound: !!rail, railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0, mobileHiddenBtn: !!historyBtn };
  })()`);
  console.log("desktop:", JSON.stringify(desk));
  check("desktop history rail renders", desk.railFound && desk.railWidth === 256, `w=${desk.railWidth}`);
  check("mobile History button hidden on desktop", !desk.mobileHiddenBtn);
  await shot("system-desktop");

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
