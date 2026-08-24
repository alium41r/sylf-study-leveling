// Verify: (1) keep-screen-awake toggle works (fake WakeLock API), desktop +
// mobile sheet, pill stays compact on mobile; (2) dock clamps fully on-screen
// when expanded near the border and after restore/resize.
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9258;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-wake2-" + Date.now(),
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
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; }

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");

  // Deterministic fake WakeLock API, installed before any page script runs.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__wake = { request: 0, release: 0 };
      function makeSentinel() {
        const listeners = {};
        const s = {
          released: false,
          release: async () => {
            if (s.released) return;
            s.released = true;
            window.__wake.release++;
            (listeners['release'] || []).forEach(cb => { try { cb(); } catch(e){} });
          },
          addEventListener: (t, cb) => { (listeners[t] = listeners[t] || []).push(cb); },
          removeEventListener: (t, cb) => { listeners[t] = (listeners[t] || []).filter(x => x !== cb); },
        };
        return s;
      }
      const fake = { __fake: true, request: async (type) => { window.__wake.request++; return makeSentinel(); } };
      try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: fake }); } catch (e) {}
      try { Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => fake }); } catch (e) {}
      window.__wake.override = !!(navigator.wakeLock && navigator.wakeLock.__fake);
    `,
  });

  // ─── Desktop tests ───
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  await ev(`(async () => {
    const u = 'wk' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Wake Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    // Park the dock near the right border (collapsed width ~220) to test clamp on expand.
    localStorage.setItem('focus_dock_pos', JSON.stringify({ x: 1440 - 240, y: 300 }));
    return 1;
  })()`);

  console.log("═══ DESKTOP: keep-awake + dock clamp ═══");
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Math" });
  await sleep(8000);

  const initial = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    if (!dock) return { dock: false };
    const r = dock.getBoundingClientRect();
    const keep = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('Keep screen'));
    return {
      dock: true,
      rect: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) },
      keepFound: !!keep,
      keepPressed: keep ? keep.getAttribute('aria-pressed') : null,
      wakeCalls: window.__wake,
    };
  })()`);
  console.log("initial:", JSON.stringify(initial));
  check("dock restored near right border", initial.dock && initial.rect.r <= 1440 && initial.rect.r >= 1200, `${JSON.stringify(initial.rect)}`);
  check("KEEP control present on desktop", initial.keepFound);
  check("fake wakeLock overridden for test", await ev("window.__wake.override === true"));
  check("wake lock NOT requested yet", initial.wakeCalls.request === 0);

  // Toggle ON
  const on = await ev(`(async () => {
    const keep = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('Keep screen'));
    keep.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 600));
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('Keep screen'));
    return { pressed: b ? b.getAttribute('aria-pressed') : null, calls: window.__wake, label: b ? b.textContent.trim() : null };
  })()`);
  console.log("after ON:", JSON.stringify(on));
  check("wake lock requested on toggle", on.calls.request === 1);
  check("KEEP button shows ACTIVE state", on.pressed === "true" && /KEEP: ON/i.test(on.label));

  // Toggle OFF
  const off = await ev(`(async () => {
    const keep = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('Keep screen'));
    keep.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 600));
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('Keep screen'));
    return { pressed: b ? b.getAttribute('aria-pressed') : null, calls: window.__wake };
  })()`);
  console.log("after OFF:", JSON.stringify(off));
  check("wake lock released on second toggle", off.calls.release === 1 && off.pressed === "false");

  // Expand the dock near the right border → must stay fully on-screen
  await ev(`(() => {
    const tools = [...document.querySelectorAll('button')].find(b => ((b.textContent||'').trim().toUpperCase()).startsWith('TOOLS'));
    tools?.click();
    return 1;
  })()`);
  await sleep(1100);
  const expanded = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const r = dock.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), iw: window.innerWidth };
  })()`);
  console.log("expanded dock:", JSON.stringify(expanded));
  check("expanded dock stays fully on-screen", expanded.r <= expanded.iw - 5 && expanded.l >= 5, `left=${expanded.l} right=${expanded.r} width=${expanded.w}`);

  // ─── Mobile tests ───
  console.log("\n═══ MOBILE: compact pill + sheet row ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Math" });
  await sleep(7000);

  const mob = await ev(`(() => {
    const pillText = [...document.querySelectorAll('div')].filter(d => (d.className||'').includes('z-45')).map(d => d.textContent).join(' ');
    const keepInPill = /KEEP/i.test(pillText);
    const pillW = (() => { const d = [...document.querySelectorAll('div')].find(x => (x.className||'').includes('z-45')); return d ? Math.round(d.getBoundingClientRect().width) : 0; })();
    return { keepInPill, pillW };
  })()`);
  console.log("mobile pill:", JSON.stringify(mob));
  check("mobile pill does NOT include KEEP (stays compact)", !mob.keepInPill, `pillWidth=${mob.pillW}`);

  const sheet = await ev(`(async () => {
    const tools = [...document.querySelectorAll('button')].find(b => ((b.textContent||'').trim().toUpperCase()).startsWith('TOOLS'));
    tools?.click();
    await new Promise(r => setTimeout(r, 800));
    const row = [...document.querySelectorAll('span')].find(s => ((s.textContent||'').toUpperCase().includes('KEEP SCREEN AWAKE')));
    const btn = row && [...row.closest('div').parentElement.querySelectorAll('button')].find(b => { const t=(b.textContent||'').toUpperCase(); return t.includes('TURN ON')||t.includes('ACTIVE')||t.includes('N/A'); });
    const before = btn ? btn.textContent.trim() : null;
    btn?.click();
    await new Promise(r => setTimeout(r, 600));
    const btn2 = row && [...row.closest('div').parentElement.querySelectorAll('button')].find(b => { const t=(b.textContent||'').toUpperCase(); return t.includes('TURN ON')||t.includes('ACTIVE')||t.includes('N/A'); });
    return { rowFound: !!row, before, after: btn2 ? btn2.textContent.trim() : null, calls: window.__wake };
  })()`);
  console.log("mobile sheet:", JSON.stringify(sheet));
  check("Keep Screen Awake row in mobile sheet", sheet.rowFound);
  check("mobile toggle requests wake lock", sheet.after === "ACTIVE" && sheet.calls.request === 1);

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
