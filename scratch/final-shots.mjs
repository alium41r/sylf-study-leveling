// Final visual snapshots after fixes.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9224;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/sylf-chrome-profile-' + Date.now(),
  "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("no cdp");
}

let msgId = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => pending.delete(id) && reject(new Error("timeout")), 30000);
  });
}
async function evalJs(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 300));
  return res.result?.value;
}
async function shot(name) {
  console.log("shooting", name);
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64"));
  console.log(`📸 ${OUT}/${name}.png`);
}

async function main() {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);
  console.log("step: login+register");
  await evalJs(`(async () => {
    const uname = 'snap' + Date.now();
    const reg = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: uname + '@example.com', username: uname, password: 'password123', name: 'Snap User' }) });
    const d = await reg.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'aurora-borealis', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'light');
    localStorage.setItem('app_background', 'aurora-borealis');
    localStorage.setItem('app_theme', 'cyberpunk');
    return d.user.username;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3300);
  await evalJs(`(() => {
    const div = document.createElement('div'); div.style.height = '2200px'; div.setAttribute('data-filler','1');
    document.querySelector('main')?.appendChild(div);
    window.scrollTo(0, 1400);
    return true;
  })()`);
  await sleep(700);
  await shot("final-mobile-scrolled-aurora");

  // Settings open on a scrolled page
  await evalJs(`(async () => {
    const hub = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open System Hub');
    hub?.click();
    await new Promise(r => setTimeout(r, 900));
    return window.scrollY;
  })()`);
  await shot("final-mobile-settings-open");
  console.log("scrollY while settings open (should be 1400):", await evalJs("window.scrollY"));
  ws.close(); chrome.kill(); console.log("done");
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
