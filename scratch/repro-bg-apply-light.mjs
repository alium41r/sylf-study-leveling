// Reproduce: wallpaper apply from /settings/backgrounds does not take effect.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9233;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-bglight-" + Date.now(),
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
let msgId = 0; const pending = new Map(); let ws;
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 30000);
  });
}
async function ev(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result?.value;
}
async function shot(name) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64"));
  console.log("shot:", name);
}

async function main() {
  const u = await getWsUrl();
  ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);
  await ev(`(async () => {
    const u = 'bg' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Bg Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'light');
    localStorage.setItem('app_background', 'void');
    document.documentElement.setAttribute('data-mode', 'light');
    localStorage.setItem('app_theme', 'cyberpunk');
    return 1;
  })()`);

  await send("Page.navigate", { url: "http://localhost:3000/settings/backgrounds" });
  await sleep(4000);

  const before = await ev(`(() => {
    const layer = document.getElementById('app-bg-layer');
    return {
      layerExists: !!layer,
      layerBg: layer ? layer.style.background.slice(0, 60) : null,
      layerComputed: layer ? getComputedStyle(layer).backgroundImage.slice(0, 60) : null,
      storedBg: localStorage.getItem('app_background'),
      cards: [...document.querySelectorAll('h3')].map(h => h.textContent.trim()).filter(t => t).length,
      applyButtons: [...document.querySelectorAll('button')].filter(b => (b.textContent || '').includes('Apply Wallpaper')).length,
    };
  })()`);
  console.log("BEFORE:", JSON.stringify(before, null, 1));
  await shot("bg-page-before");

  // Click "Apply Wallpaper" on the Abyssal Glow card.
  const clicked = await ev(`(async () => {
    const cards = [...document.querySelectorAll('div')].filter(d => {
      const h3 = d.querySelector('h3');
      return h3 && h3.textContent.trim() === 'Neon Sunrise';
    });
    const card = cards.find(c => c.querySelector('button'));
    const btn = card && [...card.querySelectorAll('button')].find(b => (b.textContent || '').includes('Apply Wallpaper'));
    if (!btn) return 'button not found';
    btn.click();
    await new Promise(r => setTimeout(r, 1500));
    return 'clicked';
  })()`);
  console.log("clicked:", clicked);

  const after = await ev(`(() => {
    const layer = document.getElementById('app-bg-layer');
    return {
      layerInlineBg: layer ? layer.style.background.slice(0, 80) : null,
      layerComputed: layer ? getComputedStyle(layer).backgroundImage.slice(0, 80) : null,
      storedBg: localStorage.getItem('app_background'),
      toast: [...document.querySelectorAll('p')].some(p => p.textContent.includes('Wallpaper Applied')),
    };
  })()`);
  console.log("AFTER APPLY:", JSON.stringify(after, null, 1));
  await shot("bg-page-after");

  // Navigate to the dashboard and check whether the wallpaper survived.
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(4000);
  const onDash = await ev(`(() => {
    const layer = document.getElementById('app-bg-layer');
    return {
      layerComputed: layer ? getComputedStyle(layer).backgroundImage.slice(0, 80) : null,
      storedBg: localStorage.getItem('app_background'),
    };
  })()`);
  console.log("ON DASHBOARD:", JSON.stringify(onDash, null, 1));
  await shot("dashboard-after-apply");

  ws.close(); chrome.kill(); console.log("done");
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
