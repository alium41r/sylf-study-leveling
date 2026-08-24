// Verify each wallpaper is visibly vibrant: apply each id, screenshot the
// settings page (card-free left/right margins), sample the background strip.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9236;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-vib-" + Date.now(),
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
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
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
  return [out[off], out[off + 1], out[off + 2]];
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
  await sleep(2200);
  await ev(`(async () => {
    const u = 'vib' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Vib Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'dark');
    localStorage.setItem('app_background', 'void');
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/settings/backgrounds" });
  await sleep(3800);

  const ids = ["void", "cyber-grid", "sakura-fall", "abyssal-glow", "neon-sunrise", "matrix-rain", "aurora-borealis", "deep-ocean"];

  console.log("Dark mode samples — left margin strip (y=60 / 400 / 740):");
  for (const id of ids) {
    await ev(`(async () => {
      localStorage.setItem('app_background', '${id}');
      window.dispatchEvent(new Event('background-updated'));
      await new Promise(r => setTimeout(r, 500));
      return 1;
    })()`);
    const f = `vib-dark-${id}.png`;
    const res = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${f}`, Buffer.from(res.data, "base64"));
    const pts = [px(`${OUT}/${f}`, 12, 60), px(`${OUT}/${f}`, 12, 400), px(`${OUT}/${f}`, 12, 740), px(`${OUT}/${f}`, 1266, 400)];
    console.log(`${id.padEnd(14)} ${JSON.stringify(pts[0])}  ${JSON.stringify(pts[1])}  ${JSON.stringify(pts[2])}  right:${JSON.stringify(pts[3])}`);
  }

  // Light mode spot-check
  await ev(`(async () => {
    localStorage.setItem('app_mode', 'light');
    document.documentElement.setAttribute('data-mode', 'light');
    window.dispatchEvent(new Event('background-updated'));
    await new Promise(r => setTimeout(r, 600));
    return 1;
  })()`);
  console.log("\nLight mode samples:");
  for (const id of ["void", "abyssal-glow", "aurora-borealis", "deep-ocean"]) {
    await ev(`(async () => {
      localStorage.setItem('app_background', '${id}');
      window.dispatchEvent(new Event('background-updated'));
      await new Promise(r => setTimeout(r, 500));
      return 1;
    })()`);
    const f = `vib-light-${id}.png`;
    const res = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${f}`, Buffer.from(res.data, "base64"));
    const pts = [px(`${OUT}/${f}`, 12, 60), px(`${OUT}/${f}`, 12, 400), px(`${OUT}/${f}`, 12, 740)];
    console.log(`${id.padEnd(14)} ${JSON.stringify(pts[0])}  ${JSON.stringify(pts[1])}  ${JSON.stringify(pts[2])}`);
  }

  ws.close(); chrome.kill(); console.log("done");
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
