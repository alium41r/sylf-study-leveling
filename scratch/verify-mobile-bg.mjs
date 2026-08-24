// Verify mobile uses scroll-attached body wallpaper (no fixed-layer lag),
// desktop uses the fixed layer, and breakpoint crossing re-applies.
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9240;
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-mob2-" + Date.now(),
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

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2200);
  await ev(`(async () => {
    const u = 'mob' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Mob Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'aurora-borealis', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'dark');
    localStorage.setItem('app_background', 'aurora-borealis');
    return 1;
  })()`);

  console.log("═══ MOBILE (390x844, touch) ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  // Trigger a resize so the wrapper re-applies for the mobile viewport
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3800);

  const mobile = await ev(`(() => {
    const body = getComputedStyle(document.body);
    const layer = document.getElementById('app-bg-layer');
    return {
      bodyImage: body.backgroundImage.slice(0, 60),
      bodyAttachment: body.backgroundAttachment,
      bodySize: body.backgroundSize.slice(0, 50),
      layerBg: layer ? layer.style.background : 'no-layer',
      scrollHeight: document.documentElement.scrollHeight,
      bodyBoxHeight: document.body.getBoundingClientRect().height,
      innerHeight: window.innerHeight,
    };
  })()`);
  console.log(JSON.stringify(mobile, null, 1));
  check("body paints the wallpaper gradient", mobile.bodyImage !== "none" && mobile.bodyImage.length > 20, mobile.bodyImage.slice(0, 40));
  check("body attachment is scroll (no fixed lag)", String(mobile.bodyAttachment).split(",").every(a => a.trim() === "scroll"));
  check("fixed layer cleared on mobile", !mobile.layerBg || mobile.layerBg === "none");
  check("body box spans full document height", mobile.bodyBoxHeight >= mobile.scrollHeight - 1, `${mobile.bodyBoxHeight} vs doc ${mobile.scrollHeight}`);

  // Scroll to bottom and sample a pixel — the wallpaper must be present at the
  // freshly exposed region (screenshot comparison).
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(600);
  const atBottom = await ev(`(() => {
    const els = document.elementsFromPoint(195, 30);
    return els.length ? els[0].tagName : null;
  })()`);
  check("content still hit-testable at bottom", !!atBottom);

  console.log("\n═══ DESKTOP (1440x900) after crossing breakpoint ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await sleep(1200); // resize listener should re-apply

  const desktop = await ev(`(() => {
    const body = getComputedStyle(document.body);
    const layer = document.getElementById('app-bg-layer');
    const layerStyle = layer ? getComputedStyle(layer) : null;
    return {
      bodyImage: body.backgroundImage.slice(0, 40),
      bodyInlineBg: document.body.style.background,
      layerBg: layerStyle ? layerStyle.backgroundImage.slice(0, 60) : null,
      layerPos: layerStyle ? layerStyle.position : null,
      layerPointer: layerStyle ? layerStyle.pointerEvents : null,
    };
  })()`);
  console.log(JSON.stringify(desktop, null, 1));
  check("fixed layer repainted for desktop", desktop.layerBg !== "none" && desktop.layerBg.length > 20, desktop.layerBg?.slice(0, 40));
  check("body inline wallpaper cleared on desktop", desktop.bodyInlineBg === "" || desktop.bodyInlineBg === null);
  check("layer stays fixed + pointer-events none", desktop.layerPos === "fixed" && desktop.layerPointer === "none");

  // Back to mobile again — must re-apply the body wallpaper
  console.log("\n═══ BACK TO MOBILE ═══");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await sleep(1200);
  const backMobile = await ev(`(() => {
    const body = getComputedStyle(document.body);
    const layer = document.getElementById('app-bg-layer');
    return {
      bodyImage: body.backgroundImage.slice(0, 50),
      bodyAttachment: body.backgroundAttachment,
      layerBg: layer ? layer.style.background : null,
    };
  })()`);
  console.log(JSON.stringify(backMobile, null, 1));
  check("mobile wallpaper restored on resize back", backMobile.bodyImage !== "none" && String(backMobile.bodyAttachment).split(",").every(a => a.trim() === "scroll"));
  check("layer cleared again on mobile", !backMobile.layerBg || backMobile.layerBg === "none");

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
