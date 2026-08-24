// Reproduce the mobile scroll seam: sample the wallpaper at many document
// offsets on a tall page and look for a color jump / flat-color band.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9242;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-seam2-" + Date.now(),
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
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; }

function px(path, x, y) {
  const data = readFileSync(path);
  let pos = 8; let idat = Buffer.alloc(0); let w = 0, h = 0, ch = 3;
  while (pos < data.length) {
    const ln = data.readUInt32BE(pos); const typ = data.toString("ascii", pos + 4, pos + 8); const chunk = data.subarray(pos + 8, pos + 8 + ln);
    if (typ === "IHDR") { w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4); ch = chunk[9] === 6 ? 4 : 3; } else if (typ === "IDAT") idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  const raw = inflateSync(idat); const stride = w * ch; const out = Buffer.alloc(h * stride); const prev = Buffer.alloc(stride);
  let p = 0;
  for (let yy = 0; yy < h; yy++) {
    const f = raw[p++]; const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    if (f === 1) for (let i = ch; i < stride; i++) line[i] = (line[i] + line[i - ch]) & 255;
    else if (f === 2) for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < stride; i++) { const a = i >= ch ? line[i - ch] : 0; line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) for (let i = 0; i < stride; i++) { const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; line[i] = (line[i] + pr) & 255; }
    line.copy(out, yy * stride); line.copy(prev);
  }
  const off = (y * w + x) * ch;
  return [out[off], out[off + 1], out[off + 2]];
}

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2200);
  await ev(`(async () => {
    const u = 'seam' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@x.com', username: u, password: 'password123', name: 'Seam Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    await fetch('/api/user/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ themeId: 'cyberpunk', backgroundId: 'void', classId: 'class_scholar' }) });
    localStorage.setItem('app_mode', 'dark');
    localStorage.setItem('app_background', 'void');
    return 1;
  })()`);
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3800);
  // Make the document very tall (4000px) so multiple viewports are involved.
  const docH = await ev(`(() => {
    const f = document.createElement('div'); f.style.height = '4000px'; f.setAttribute('data-filler','1');
    document.querySelector('main')?.appendChild(f);
    return document.documentElement.scrollHeight;
  })()`);
  console.log("doc height:", docH);
  const geometry = await ev(`(() => {
    const layer = document.getElementById('app-bg-layer');
    const body = getComputedStyle(document.body);
    return {
      layerRect: layer ? layer.getBoundingClientRect().toJSON() : null,
      layerPosition: layer ? getComputedStyle(layer).position : null,
      layerZ: layer ? getComputedStyle(layer).zIndex : null,
      layerPointer: layer ? getComputedStyle(layer).pointerEvents : null,
      bodyInlineBg: document.body.style.background,
      bodyImage: body.backgroundImage.slice(0, 30),
    };
  })()`);
  console.log("geometry:", JSON.stringify(geometry, null, 1));

  // Scroll in steps; at each step, sample the pixel at viewport y=100 (which
  // corresponds to document offset scrollY+100) and look for discontinuity.
  const samples = [];
  for (const sy of [0, 700, 1400, 2100, 2800, 3500, docH - 844]) {
    await ev(`window.scrollTo(0, ${sy})`);
    await sleep(500);
    const f = `seam-${sy}.png`;
    const res = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${f}`, Buffer.from(res.data, "base64"));
    const p = px(`${OUT}/${f}`, 195, 100); // x center, y=100 => docY = sy+100
    samples.push({ docY: sy + 100, color: p });
    console.log(`docY=${sy + 100}  color=${JSON.stringify(p)}`);
  }
  // Detect a jump: consecutive samples should change smoothly (void is a
  // smooth vertical gradient). A seam shows as a large delta or a repeat.
  let maxDelta = 0, seams = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].color.reduce((s, v, k) => s + Math.abs(v - samples[i - 1].color[k]), 0);
    if (d > maxDelta) maxDelta = d;
    if (d > 16) seams.push([samples[i - 1].docY, samples[i].docY, d]);
  }
  console.log("max sample-to-sample delta:", maxDelta, "seams:", JSON.stringify(seams));
  const first = samples[0].color, last = samples[samples.length - 1].color;
  const darker = last[0] < first[0] || last[1] < first[1] || last[2] < first[2] - 1;
  console.log("first:", JSON.stringify(first), "last:", JSON.stringify(last));
  console.log("gradient runs to bottom (no repeat):", samples[0].color[2] - samples[samples.length-1].color[2] > 4 ? "PASS" : "FAIL");
  console.log("layer geometry check:", geometry.layerPosition === "absolute" && geometry.layerRect.height >= docH - 2 && geometry.bodyInlineBg === "" ? "PASS" : "FAIL");
  ws.close(); chrome.kill(); console.log("done");
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
