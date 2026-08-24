// Verify dragging the tools dock works without React setState-in-render errors
// and persists a clamped position.
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9259;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-drag-" + Date.now(),
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
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; }

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

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
    // Collect console errors / exceptions for the drag test.
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      consoleErrors.push(m.params.args?.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push("EXCEPTION: " + JSON.stringify(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text).slice(0, 300));
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2400);
  await ev(`(async () => {
    const u = 'drg' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Drag Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/focus?subjectName=Math" });
  await sleep(8000);

  const grip = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    if (!dock) return null;
    const r = dock.getBoundingClientRect();
    // grip area = left ~28px of the dock pill
    return { x: r.left + 16, y: r.top + r.height / 2, rect: { l: r.left, t: r.top, w: r.width, h: r.height } };
  })()`);
  console.log("dock:", JSON.stringify(grip));
  check("dock found", !!grip);

  // Drag: press on the grip, move to (200, 150), release.
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: grip.x, y: grip.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x + 40, y: grip.y + 20, button: "left" });
  for (let i = 0; i < 6; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x + 40 + (i + 1) * 30, y: grip.y + 10 + (i + 1) * 15, button: "left" });
    await sleep(30);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: grip.x + 40 + 180, y: grip.y + 100, button: "left", clickCount: 1 });
  await sleep(900);

  const after = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const r = dock ? dock.getBoundingClientRect() : null;
    return {
      rect: r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null,
      savedPos: localStorage.getItem('focus_dock_pos'),
      iw: window.innerWidth,
    };
  })()`);
  console.log("after drag:", JSON.stringify(after));
  const saved = after.savedPos ? JSON.parse(after.savedPos) : null;
  check("position persisted after drag", !!saved, after.savedPos);
  check("dock moved from its original spot", saved ? (saved.x !== grip.rect.l || saved.y !== grip.rect.t) : false, `${saved?.x},${saved?.y}`);
  check("dock fully on-screen after drag", !!after.rect && after.rect.l >= 5 && after.rect.r <= after.iw - 5, JSON.stringify(after.rect));

  // Drag hard toward the bottom-right corner to force clamping.
  await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    return dock.getBoundingClientRect().toJSON();
  })()`);
  const g2 = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const r = dock.getBoundingClientRect();
    return { x: r.left + 16, y: r.top + r.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: g2.x, y: g2.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1430, y: 890, button: "left" });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1435, y: 915, button: "left" });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 1435, y: 915, button: "left", clickCount: 1 });
  await sleep(900);

  const clamped = await ev(`(() => {
    const dock = [...document.querySelectorAll('div')].find(d => (d.className||'').includes('z-45'));
    const r = dock.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), iw: window.innerWidth, ih: window.innerHeight };
  })()`);
  console.log("corner drag:", JSON.stringify(clamped));
  check("corner drag clamps dock on-screen", clamped.r <= clamped.iw - 8 && clamped.b <= clamped.ih - 8, JSON.stringify(clamped));

  const relevant = consoleErrors.filter(e => /Cannot update a component|setState|FocusTools/i.test(e));
  console.log("console errors:", JSON.stringify(consoleErrors, null, 1));
  check("NO React setState-in-render error during drag", relevant.length === 0, relevant[0]);

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
