// Endpoint-only check: image prompt routes to the vision pipeline and the
// cascade reports which model served it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9279;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-vis3-" + Date.now(),
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

const u = await getWsUrl(); ws = new WebSocket(u);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/login" });
await sleep(2400);
const tok = await ev(`(async () => {
  const u = 'vis3' + Date.now();
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Vis3' }) });
  const d = await r.json();
  localStorage.setItem('token', d.token);
  localStorage.setItem('user_data', JSON.stringify(d.user));
  await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
  return d.token;
})()`);

const imgBytes = readFileSync("public/sylph-logo.jpg");
const fd = new FormData();
fd.append("message", "What do you see in this image? Describe it briefly.");
fd.append("file", new Blob([imgBytes], { type: "image/png" }), "test.png");
const t0 = Date.now();
const res = await fetch("http://localhost:3000/api/system-messages/chat", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}` },
  body: fd,
});
const data = await res.json();
console.log(`status=${res.status} in ${Date.now() - t0}ms | modelUsed=${data.modelUsed} | display=${data.modelDisplayName}`);
console.log("reply:", JSON.stringify(String(data.reply || data.error || "").slice(0, 160)));
ws.close(); chrome.kill(); console.log("done");
