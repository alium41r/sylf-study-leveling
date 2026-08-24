// Stress test: drag the dock to the edge + expand/collapse repeatedly.
// Asserts: no "Maximum update depth" / setState loop errors, dock on-screen.
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9261;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-stress-" + Date.now(),
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
const errors = [];
function send(m, p = {}) { const i = ++msgId; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => { pending.set(i, { res, rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + m)); } }, 30000); }); }
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      errors.push((m.params.args || []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 220));
    }
    if (m.method === "Runtime.exceptionThrown") {
      errors.push("EXC: " + String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text).slice(0, 220));
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  await ev(`(async () => {
    const u = 'str' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Stress' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Math" });
  await sleep(8000);

  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } };

  const getGrip = async () => ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    if (!dock) return null;
    const r = dock.getBoundingClientRect();
    return { x: r.left + 16, y: r.top + r.height / 2 };
  })()`);
  const getRect = async () => ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const r = dock.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) };
  })()`);
  const expand = async () => ev(`(() => {
    const tools = [...document.querySelectorAll('button')].find(b => ((b.textContent||'').trim().toUpperCase()).startsWith('TOOLS'));
    tools?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 1;
  })()`);

  console.log("═══ STRESS: drag to edge + expand/collapse x4 ═══");
  for (let i = 0; i < 4; i++) {
    const grip = await getGrip();
    if (!grip) { check(`iter ${i}: dock found`, false); break; }
    // Drag to the right edge (past it — forces clamp during drag)
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: grip.x, y: grip.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x + 360, y: grip.y + 40, button: "left" });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x + 390, y: grip.y + 60, button: "left" });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: grip.x + 390, y: grip.y + 60, button: "left", clickCount: 1 });
    await sleep(500);
    await expand();          // near the right edge — the reported repro
    await sleep(1100);
    const rectExpanded = await getRect();
    check(`iter ${i}: expanded dock on-screen`, rectExpanded.r <= 1432 && rectExpanded.l >= 5, JSON.stringify(rectExpanded));
    await expand();          // collapse again
    await sleep(600);
    const rectCollapsed = await getRect();
    check(`iter ${i}: collapsed dock on-screen`, rectCollapsed.r <= 1432 && rectCollapsed.l >= 5, JSON.stringify(rectCollapsed));
  }

  const loopErrors = errors.filter(e => /Maximum update depth|Cannot update a component|setState in render|Maximum/i.test(e));
  console.log("captured console errors:", JSON.stringify(errors, null, 1));
  check("NO update-depth / setState errors during stress", loopErrors.length === 0, loopErrors[0]);
  check("no exceptions thrown", errors.filter(e => e.startsWith("EXC:")).length === 0);

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
