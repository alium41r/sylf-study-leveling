// Verify new themes render on the themes page and re-tint the whole app.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9238;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-theme2-" + Date.now(),
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

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2200);
  await ev(`(async () => {
    const u = 'thm' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Theme Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'dark');
    localStorage.setItem('app_theme', 'cyberpunk');
    return 1;
  })()`);

  await send("Page.navigate", { url: "http://localhost:3000/settings/themes" });
  await sleep(3800);

  const cards = await ev(`[...document.querySelectorAll('h3')].map(h => h.textContent.trim().toUpperCase()).filter(t => ['VOLT','PLASMA','GLACIER','SOLAR'].includes(t))`);
  console.log("new theme cards:", JSON.stringify(cards));
  check("all 4 new theme cards render", cards.length === 4);

  // Apply VOLT by clicking its card
  const applied = await ev(`(async () => {
    const h3 = [...document.querySelectorAll('h3')].find(h => h.textContent.trim().toUpperCase() === 'VOLT');
    const card = h3 && h3.closest('div[style*="border-radius"]');
    card?.click();
    await new Promise(r => setTimeout(r, 1200));
    const root = getComputedStyle(document.documentElement);
    return {
      accent: root.getPropertyValue('--accent-primary').trim(),
      accentLight: root.getPropertyValue('--accent-primary-light').trim(),
      stored: localStorage.getItem('app_theme'),
      appliedMarker: !!card?.querySelector('svg path[d*="M5 13l4 4L19 7"]'),
    };
  })()`);
  console.log("after applying VOLT:", JSON.stringify(applied));
  check("accent-primary switched to volt lime", applied.accent === "#84cc16" || applied.accent === "rgb(132, 204, 22)", applied.accent);
  check("theme persisted to localStorage", applied.stored === "volt");
  check("VOLT card shows applied marker", applied.appliedMarker);
  await shot("themes-page-volt");

  // Navigate to dashboard — accent must survive (wrapper effect re-applies)
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3800);
  const dash = await ev(`(() => {
    const root = getComputedStyle(document.documentElement);
    // find a button/accent element and check its computed color
    const accentBtn = [...document.querySelectorAll('button')].find(b => (b.className || '').includes('accent-primary'));
    return {
      accent: root.getPropertyValue('--accent-primary').trim(),
      storedUser: JSON.parse(localStorage.getItem('user_data') || '{}').activeTheme,
      btnColor: accentBtn ? getComputedStyle(accentBtn).backgroundColor : null,
    };
  })()`);
  console.log("dashboard after reload:", JSON.stringify(dash));
  check("accent persists on dashboard", dash.accent === "#84cc16" || dash.accent === "rgb(132, 204, 22)", dash.accent);
  await shot("dashboard-volt");

  // Sanity: all 10 themes exist in THEME_MAP semantics via the picker (onboarding uses catalog)
  const onb = await ev(`(() => {
    return { themeKeys: Object.keys(localStorage).length }; // placeholder
  })()`);

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
