// Verify wallpaper APPLY is actually VISIBLE (pixel-level) in dark + light modes.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9235;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-pix2-" + Date.now(),
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
}

// Read pixel colors via macOS `sips`? sips can't sample. Use Python-less PNG decode:
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
function px(path, x, y) {
  const data = readFileSync(path);
  let pos = 8; let idat = Buffer.alloc(0); let w = 0, h = 0, ch = 3;
  while (pos < data.length) {
    const ln = data.readUInt32BE(pos);
    const typ = data.toString("ascii", pos + 4, pos + 8);
    const chunk = data.subarray(pos + 8, pos + 8 + ln);
    if (typ === "IHDR") { w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4); ch = chunk[9] === 6 ? 4 : 3; }
    else if (typ === "IDAT") idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  const raw = inflateSync(idat);
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let yy = 0; yy < h; yy++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    if (f === 1) for (let i = ch; i < stride; i++) line[i] = (line[i] + line[i - ch]) & 255;
    else if (f === 2) for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < stride; i++) { const a = i >= ch ? line[i - ch] : 0; line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[i] = (line[i] + pr) & 255;
    }
    line.copy(out, yy * stride);
    line.copy(prev);
  }
  const off = (y * w + x) * ch;
  return { r: out[off], g: out[off + 1], b: out[off + 2] };
}

async function runMode(mode, wallpaper, sampleExpect) {
  console.log(`\n──── ${mode.toUpperCase()} MODE: apply "${wallpaper}" ────`);
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2200);
  await ev(`(async () => {
    const u = 'pix' + Date.now() + '${mode}';
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Pix Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', '${mode}');
    localStorage.setItem('app_background', 'void');
    document.documentElement.setAttribute('data-mode', '${mode}');
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/settings/backgrounds" });
  await sleep(3800);

  await shot(`pix-${mode}-before`);
  const before = { tl: px(`${OUT}/pix-${mode}-before.png`, 12, 12), c: px(`${OUT}/pix-${mode}-before.png`, 640, 400), b: px(`${OUT}/pix-${mode}-before.png`, 12, 788) };
  console.log("before apply px (tl/center/bottom-left):", JSON.stringify(before));

  await ev(`(async () => {
    const cards = [...document.querySelectorAll('div')].filter(d => {
      const h3 = d.querySelector('h3');
      return h3 && h3.textContent.trim() === '${wallpaper}';
    });
    const card = cards.find(c => c.querySelector('button'));
    const btn = card && [...card.querySelectorAll('button')].find(b => (b.textContent || '').includes('Apply Wallpaper'));
    if (!btn) throw new Error('apply button not found');
    btn.click();
    await new Promise(r => setTimeout(r, 1500));
    return 1;
  })()`);

  const diag = await ev(`(() => {
    const layer = document.getElementById('app-bg-layer');
    const b = document.body;
    return {
      layerInline: layer ? layer.style.background.slice(0, 90) : null,
      layerComputed: layer ? getComputedStyle(layer).backgroundImage.slice(0, 90) : null,
      bodyComputed: getComputedStyle(b).backgroundImage.slice(0, 60),
      bodyComputedColor: getComputedStyle(b).backgroundColor,
      htmlComputedColor: getComputedStyle(document.documentElement).backgroundColor,
      layerZ: layer ? getComputedStyle(layer).zIndex : null,
      layerRect: layer ? layer.getBoundingClientRect().toJSON() : null,
      at12: document.elementsFromPoint(12, 12).slice(0, 4).map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 40)),
    };
  })()`);
  console.log("settings page DOM diag:", JSON.stringify(diag, null, 1));
  await shot(`pix-${mode}-after`);
  const after = { tl: px(`${OUT}/pix-${mode}-after.png`, 12, 12), c: px(`${OUT}/pix-${mode}-after.png`, 640, 400), b: px(`${OUT}/pix-${mode}-after.png`, 12, 788) };
  console.log("after apply px (tl/center/bottom-left):", JSON.stringify(after));

  // Navigate to dashboard and confirm it persists visually there too.
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3800);
  await shot(`pix-${mode}-dashboard`);
  const dash = px(`${OUT}/pix-${mode}-dashboard.png`, 12, 12);
  console.log("dashboard, top-left px:", JSON.stringify(dash));

  const changed = JSON.stringify(before) !== JSON.stringify(after);
  console.log(changed ? "✅ VISIBLE CHANGE on settings page" : "❌ NO VISIBLE CHANGE on settings page");
  return { before, after, dash, changed };
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

  const dark = await runMode("dark", "Abyssal Glow");
  const light = await runMode("light", "Neon Sunrise");

  ws.close(); chrome.kill();
  console.log("\nSUMMARY:", dark.changed && light.changed ? "PASS — wallpapers visibly apply in both modes" : "FAIL");
  process.exit(dark.changed && light.changed ? 0 : 1);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
