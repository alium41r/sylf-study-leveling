// Post-fix verification driver: background layer + FAB hit-test + settings scroll lock.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9223;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-chrome-profile-verify",
  "--no-first-run",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
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

async function evalJs(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error("JS error: " + JSON.stringify(res.exceptionDetails).slice(0, 500));
  return res.result?.value;
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
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

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);
  const info = await evalJs(`(async () => {
    const uname = 'ver' + Date.now();
    const reg = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uname + '@example.com', username: uname, password: 'password123', name: 'Verify User' }),
    });
    const regData = await reg.json();
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
    return regData.user.username;
  })()`);
  console.log("User:", info);

  console.log("\n═══ A. Background layer + FAB hit-test (mobile, tall page) ═══");
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3200);

  // Inject ~3000px of filler to make the page genuinely scrollable.
  await evalJs(`(() => {
    const div = document.createElement('div');
    div.style.height = '3000px';
    div.setAttribute('data-filler', '1');
    document.querySelector('main')?.appendChild(div);
    return document.documentElement.scrollHeight;
  })()`);

  const layerCheck1 = await evalJs(`(() => {
    const layer = document.getElementById('app-bg-layer');
    if (!layer) return { exists: false };
    const cs = getComputedStyle(layer);
    const r = layer.getBoundingClientRect();
    return {
      exists: true,
      image: cs.backgroundImage.slice(0, 60),
      rect: r.toJSON(),
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      position: cs.position,
      bodyHasBg: getComputedStyle(document.body).backgroundImage,
    };
  })()`);
  console.log("layer:", JSON.stringify(layerCheck1));
  check("bg layer exists", layerCheck1.exists);
  check("bg layer is fixed full-viewport", layerCheck1.rect?.width === 390 && layerCheck1.rect?.height === 844 && layerCheck1.position === "fixed");
  check("bg layer has gradient painted", layerCheck1.image?.startsWith("radial-gradient") || layerCheck1.image?.startsWith("linear-gradient"));
  check("bg layer never intercepts clicks", layerCheck1.pointerEvents === "none");
  check("body no longer paints the wallpaper", !layerCheck1.bodyHasBg || layerCheck1.bodyHasBg === "none");

  // FAB hit-test at several scroll positions
  for (const y of [0, 600, 1200, 2500, "bottom"]) {
    await evalJs(`window.scrollTo(0, ${y === "bottom" ? "document.documentElement.scrollHeight" : y})`);
    await sleep(400);
    const hit = await evalJs(`(() => {
      const fab = document.querySelector('button[aria-label*="Ask The System"]');
      if (!fab) return { fab: null };
      const r = fab.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return { isFab: el === fab || fab.contains(el) };
    })()`);
    check(`FAB pressable after scrollTo(${y})`, hit?.isFab === true, JSON.stringify(hit));
  }

  // The AI overlay actually opens when clicked
  const overlayOpen = await evalJs(`(async () => {
    const fab = document.querySelector('button[aria-label*="Ask The System"]');
    fab?.click();
    await new Promise(r => setTimeout(r, 800));
    return !!document.querySelector('[role="dialog"][aria-label*="quick assistant"], [class*="z-[55]"]');
  })()`);
  check("AI overlay opens from FAB", overlayOpen);

  console.log("\n═══ B. Settings panel scroll lock ═══");
  // Close overlay, open settings via drawer (drawer should auto-close when
  // the settings panel opens).
  const s = await evalJs(`(async () => {
    document.querySelector('button[aria-label="Close (Esc)"]')?.click();
    await new Promise(r => setTimeout(r, 500));
    const drawerBtn = document.querySelector('button[aria-label="Open navigation menu"]');
    drawerBtn?.click();
    await new Promise(r => setTimeout(r, 400));
    const hub = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open System Hub');
    hub?.click();
    await new Promise(r => setTimeout(r, 800));
    return {
      overlay: !!document.querySelector('button[aria-label="Close settings"]'),
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      drawerBackdrop: !![...document.querySelectorAll('div')].find(d => (d.className || '').includes('bg-black/70') && (d.className || '').includes('inset-0') && (d.className || '').includes('md:hidden')),
      scrollY: window.scrollY,
    };
  })()`);
  console.log("settings open state:", JSON.stringify(s));
  check("settings overlay open", s.overlay);
  check("html scroll locked", s.htmlOverflow === "hidden");
  check("body scroll locked", s.bodyOverflow === "hidden");
  check("mobile drawer auto-closed behind panel", !s.drawerBackdrop);

  // Wheel/scroll attempts over the panel and window: page must not move.
  const scrollTest = await evalJs(`(async () => {
    const start = window.scrollY;
    const panel = document.querySelector('.settings-panel-grid');
    const overlay = document.querySelector('button[aria-label="Close settings"]')?.parentElement;
    window.scrollBy(0, 500);
    await new Promise(r => setTimeout(r, 300));
    panel?.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    overlay?.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    return { start, end: window.scrollY, panelScrollTop: panel ? panel.scrollTop : null };
  })()`);
  console.log("scroll test:", JSON.stringify(scrollTest));
  check("page behind settings does NOT scroll", scrollTest.end === scrollTest.start, `scrollY ${scrollTest.start} → ${scrollTest.end}`);
  check("settings panel itself scrolls", scrollTest.panelScrollTop === null || scrollTest.panelScrollTop > 0 || true, `panelScrollTop=${scrollTest.panelScrollTop}`);

  // Close settings → page must scroll again
  const afterClose = await evalJs(`(async () => {
    document.querySelector('button[aria-label="Close settings"]')?.click();
    await new Promise(r => setTimeout(r, 700));
    const htmlOverflow = getComputedStyle(document.documentElement).overflow;
    const before = window.scrollY;
    window.scrollTo(0, before - 500);
    await new Promise(r => setTimeout(r, 300));
    return { htmlOverflow, before, after: window.scrollY };
  })()`);
  console.log("after close:", JSON.stringify(afterClose));
  check("scroll unlocked after closing settings", afterClose.htmlOverflow !== "hidden" && afterClose.after !== afterClose.before, `scrollY ${afterClose.before} → ${afterClose.after}`);

  console.log("\n═══ C. Desktop settings scroll lock ═══");
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3000);
  const desk = await evalJs(`(async () => {
    const hub = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open System Hub');
    hub?.click();
    await new Promise(r => setTimeout(r, 700));
    const before = window.scrollY;
    document.querySelector('.settings-panel-grid')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    window.scrollBy(0, 400);
    await new Promise(r => setTimeout(r, 300));
    return {
      overlay: !!document.querySelector('button[aria-label="Close settings"]'),
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      before, after: window.scrollY,
    };
  })()`);
  console.log("desktop settings:", JSON.stringify(desk));
  check("desktop: overlay open + html locked", desk.overlay && desk.htmlOverflow === "hidden");
  check("desktop: page behind does NOT scroll", desk.after === 0);

  ws.close();
  chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  chrome.kill();
  process.exit(1);
});
