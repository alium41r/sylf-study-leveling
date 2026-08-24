// CDP-based reproduction driver for the Sylf mobile bugs.
// Usage: node scratch/repro.mjs [--no-settings]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-chrome-profile3",
  "--no-first-run",
  "--no-default-browser-check",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-features=Translate",
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
  throw new Error("Chrome CDP not ready");
}

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 30000);
  });
}

async function evalJs(expression, returnByValue = true) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error("JS error: " + JSON.stringify(res.exceptionDetails).slice(0, 500));
  }
  return res.result?.value;
}

async function shot(name) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64"));
  console.log(`  📸 ${OUT}/${name}.png`);
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
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setVisibleSize", { width: 390, height: 844 });

  // ── Login via API, then hydrate localStorage with the token +
  //    user_data exactly like AuthProvider.login() does.
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);
  const loginRes = await evalJs(`(async () => {
    const uname = 'repro' + Date.now();
    const reg = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uname + '@example.com', username: uname, password: 'password123', name: 'Repro User' }),
    });
    const regData = await reg.json();
    if (regData.token) {
      localStorage.setItem('token', regData.token);
      localStorage.setItem('user_data', JSON.stringify(regData.user));
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + regData.token },
        body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'abyssal-glow', classId: 'class_scholar' }),
      });
      localStorage.setItem('app_mode', 'light');
      localStorage.setItem('app_background', 'abyssal-glow');
      localStorage.setItem('app_theme', 'cyberpunk');
      return { user: regData.user.username, level: regData.user.level };
    }
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });
    const data = await res.json();
    if (!data.token) throw new Error('login failed: ' + JSON.stringify(data).slice(0, 300));
    localStorage.setItem('token', data.token);
    localStorage.setItem('user_data', JSON.stringify(data.user));
    localStorage.setItem('app_mode', 'light');
    localStorage.setItem('app_background', 'abyssal-glow');
    localStorage.setItem('app_theme', 'cyberpunk');
    return { user: data.user.username, level: data.user.level };
  })()`);
  console.log("Logged in as", JSON.stringify(loginRes));

  for (const path of ["/dashboard", "/goals", "/calendar"]) {
    console.log(`\n═══ ${path} ═══`);
    await send("Page.navigate", { url: `http://localhost:3000${path}` });
    await sleep(3200);

    const info = await evalJs(`(() => {
      const fab = document.querySelector('button[aria-label*="Ask The System"]');
      const bg = getComputedStyle(document.body);
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        fabFound: !!fab,
        fabPos: fab ? fab.getBoundingClientRect().toJSON() : null,
        bodyBgAttachment: bg.backgroundAttachment,
        bodyBgImage: bg.backgroundImage.slice(0, 80),
        bodyBackgroundColor: bg.backgroundColor,
      };
    })()`);
    console.log("loaded:", JSON.stringify(info));

    // Scroll to bottom
    await evalJs(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await sleep(800);

    const hit = await evalJs(`(() => {
      const fab = document.querySelector('button[aria-label*="Ask The System"]');
      if (!fab) return { fab: null };
      const r = fab.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const el = document.elementFromPoint(cx, cy);
      const chain = [];
      let n = el;
      while (n && chain.length < 8) {
        chain.push(n.tagName + '.' + (n.className && typeof n.className === 'string' ? n.className.split(' ').slice(0,2).join('.') : ''));
        n = n.parentElement;
      }
      return { fabRect: r.toJSON(), topElement: el?.tagName + '.' + el?.className?.toString?.().slice(0, 60), isFab: el === fab || fab.contains(el), chain };
    })()`);
    console.log("FAB hit-test after scroll:", JSON.stringify(hit));
    await shot(`mobile-${path.replace(/\//g, "")}-bottom`);

    // Scroll back to top, check FAB again
    await evalJs(`window.scrollTo(0, 0)`);
    await sleep(600);
    const hitTop = await evalJs(`(() => {
      const fab = document.querySelector('button[aria-label*="Ask The System"]');
      if (!fab) return null;
      const r = fab.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return { isFab: el === fab || fab.contains(el) };
    })()`);
    console.log("FAB hit-test at top:", JSON.stringify(hitTop));
  }

  // ── Settings panel scroll-through check ──
  console.log("\n═══ SETTINGS PANEL SCROLL ═══");
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3000);
  const settingsOpen = await evalJs(`(async () => {
    // Find a settings trigger: the System Hub button in sidebar (desktop) or
    // open the mobile drawer then click System Hub.
    const drawerBtn = document.querySelector('button[aria-label="Open navigation menu"]');
    if (drawerBtn) drawerBtn.click();
    await new Promise(r => setTimeout(r, 400));
    const hub = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open System Hub');
    if (!hub) return 'no hub button';
    hub.click();
    await new Promise(r => setTimeout(r, 700));
    const overlay = document.querySelector('button[aria-label="Close settings"]');
    return { overlayFound: !!overlay, bodyOverflow: getComputedStyle(document.body).overflow, scrollYBefore: window.scrollY };
  })()`);
  console.log("opened settings:", JSON.stringify(settingsOpen));

  const scrollTest = await evalJs(`(async () => {
    const before = window.scrollY;
    // Try to scroll the settings overlay
    const overlay = document.querySelector('.settings-overlay, [class*="backdrop-blur-xl"]');
    const top1 = window.scrollY;
    window.scrollBy(0, 300);
    await new Promise(r => setTimeout(r, 300));
    const afterScroll = window.scrollY;
    // Simulate wheel on the panel
    const panel = document.querySelector('.settings-panel-grid');
    const wheel = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
    panel?.dispatchEvent(wheel);
    await new Promise(r => setTimeout(r, 300));
    return { before, top1, afterScroll, afterWheel: window.scrollY, panelScrollHeight: panel?.scrollHeight, panelClientHeight: panel?.clientHeight };
  })()`);
  console.log("scroll test:", JSON.stringify(scrollTest));
  await shot("mobile-settings-open");

  ws.close();
  chrome.kill();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  chrome.kill();
  process.exit(1);
});
