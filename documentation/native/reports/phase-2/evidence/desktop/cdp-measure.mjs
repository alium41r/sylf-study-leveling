// Desktop-runtime measurements: isolated Chrome (same Chromium M156 as Electron 45) in a visible app window,
// driven over the DevTools protocol. Measures startup, memory, panel drag frame pacing, pen ink input and rich text.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = path.resolve("chrome-profile"); fs.rmSync(PROFILE, { recursive: true, force: true });
const PORT = 9333, URL0 = "http://localhost:8765/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { chrome: execSync(`"${CHROME}" --version`).toString().trim(), display: null, runs: {} };

const tLaunch = Date.now();
const proc = spawn(CHROME, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--window-size=1366,900", "--window-position=40,40", `--app=${URL0}#screen=engine`], { stdio: "ignore" });
let target;
for (let i = 0; i < 100 && !target; i++) { await sleep(100); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page" && t.url.startsWith(URL0)); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const consoleLines = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === "Runtime.consoleAPICalled") consoleLines.push({ t: Date.now(), text: d.params.args.map((a) => a.value ?? a.description).join(" ") }); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable");
const waitFor = async (re, ms = 15000) => { const s = Date.now(); while (Date.now() - s < ms) { const l = consoleLines.find((x) => re.test(x.text)); if (l) return l; await sleep(25); } return null; };

// 1. Cold start (fresh profile, local server): navigation timing + time to SPIKE_READY.
await send("Page.reload", { ignoreCache: true }); const tReload = Date.now(); consoleLines.length = 0;
const ready = await waitFor(/SPIKE_READY/);
await sleep(1500);
out.runs.startup = await evalJs(`(() => { const n = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd), fcpMs: fcp && Math.round(fcp.startTime), canvaskitInitMs: Math.round(globalThis.__canvaskitMs || -1), heapUsedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), window: [innerWidth, innerHeight, devicePixelRatio] }; })()`);
out.runs.startup.reloadToReadyMs = ready ? ready.t - tReload : null; out.runs.startup.launchToTargetMs = tReload - tLaunch;
out.runs.engineText = (await evalJs(`document.body.innerText`)).split("\n").filter((l) => /^(OK|ERR)/.test(l)).slice(0, 30);

// Frame recorder: rAF timestamps while a scenario runs.
const startFrames = () => evalJs(`window.__f = []; (function loop(t){ window.__f.push(t); if (window.__f.length < 20000) requestAnimationFrame(loop); })(performance.now()); true`);
const stopFrames = async () => { const f = await evalJs(`(() => { const f = window.__f; window.__f = [Infinity]; return f; })()`); const d = []; for (let i = 2; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((a, b) => a - b); const vsync = d[d.length >> 1]; return { frames: d.length, medianMs: +vsync.toFixed(2), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(2), p99Ms: +d[Math.floor(d.length * 0.99)].toFixed(2), maxMs: +d.at(-1).toFixed(2), longFramesOver1_5x: d.filter((x) => x > vsync * 1.5).length }; };
const go = async (screen) => { await evalJs(`location.hash = "screen=${screen}"; location.reload(); true`); await sleep(2500); };
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
const panelState = () => evalJs(`[...document.querySelectorAll("div")].filter(d => d.style.transform && d.style.width).map(p => p.style.transform + " " + p.style.width + "x" + p.style.height)`);

// 2. Workspace panels: drag a panel header 120 steps at ~8 ms, then resize via the grip.
await go("panels");
const hdr = await evalJs(`(() => { const p = [...document.querySelectorAll("div")].filter(d => d.style.transform && d.style.width)[0]; const vis = [...p.querySelectorAll("div")].map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0); const h = vis.find(([e, r]) => e.innerText === "Notes" && r.height >= 30)[1]; const pr = p.getBoundingClientRect(); return { x: h.left + 40, y: h.top + 18, gx: pr.right - 12, gy: pr.bottom - 12 }; })()`);
consoleLines.length = 0; const before = await panelState(); await startFrames();
await mouse("mousePressed", hdr.x, hdr.y);
for (let i = 1; i <= 120; i++) { await mouse("mouseMoved", hdr.x + i * 4, hdr.y + i * 2); await sleep(8); }
await mouse("mouseReleased", hdr.x + 480, hdr.y + 240);
const afterDrag = await panelState(); const dragFrames = await stopFrames();
const g2 = await evalJs(`(() => { const r = [...document.querySelectorAll("div")].filter(d => d.style.transform && d.style.width)[0].getBoundingClientRect(); return { gx: r.right - 12, gy: r.bottom - 12 }; })()`); hdr.gx = g2.gx; hdr.gy = g2.gy;
await mouse("mousePressed", hdr.gx, hdr.gy); for (let i = 1; i <= 40; i++) { await mouse("mouseMoved", hdr.gx + i * 4, hdr.gy + i * 3); await sleep(8); } await mouse("mouseReleased", hdr.gx + 160, hdr.gy + 120);
const afterResize = await panelState();
out.runs.panelDrag = { log: consoleLines.filter(l => /BEGIN/.test(l.text)).map(l => l.text).slice(0,6), afterResize: afterResize[0], moved: JSON.stringify(before) !== JSON.stringify(afterDrag), before: before[0], after: afterDrag[0], frames: dragFrames };
// 3. Panels under continuous animation (3 panels moving/resizing) for 5 s.
await go("panels-stress"); await sleep(500); await startFrames(); await sleep(5000); out.runs.panelStress = await stopFrames();
out.runs.panelStress.heapUsedMB = await evalJs(`+(performance.memory.usedJSHeapSize / 1048576).toFixed(1)`);

// 4. Pen ink on desktop: synthetic pen events with pressure and tilt (Chromium supports pointerType "pen" via CDP).
await go("ink-js"); consoleLines.length = 0; await startFrames();
for (let s = 0; s < 6; s++) {
  const y0 = 180 + s * 70; await mouse("mousePressed", 200, y0, { pointerType: "pen", force: 0.3, tiltX: 20, tiltY: -10 });
  for (let i = 1; i <= 90; i++) { await mouse("mouseMoved", 200 + i * 7, y0 + 20 * Math.sin(i / 8), { pointerType: "pen", force: 0.2 + 0.6 * Math.sin((i / 90) * Math.PI), tiltX: 20, tiltY: -10 }); await sleep(8); }
  await mouse("mouseReleased", 830, y0, { pointerType: "pen" });
}
await sleep(1200); out.runs.inkPen = { finishes: consoleLines.filter((l) => l.text.startsWith("INKFINISH")).map((l) => l.text), frames: await stopFrames(), stats: consoleLines.filter((l) => l.text.startsWith("INKJS")).map((l) => l.text.slice(6)).slice(-3) };

// 5. Rich text (DOM component renders inline on web): BlockNote mount + scripted typing + bridge.
consoleLines.length = 0; await go("richtext"); await sleep(2500);
out.runs.richtext = consoleLines.filter((l) => /RICHTEXT/.test(l.text)).map((l) => l.text).slice(0, 4);

// 6. Process memory for this isolated Chrome profile (all helper processes).
const ps = execSync(`ps -axo rss=,command=`).toString().split("\n").filter((l) => l.includes(PROFILE));
out.runs.processMemory = { processes: ps.length, totalRssMB: Math.round(ps.reduce((n, l) => n + Number(l.trim().split(/\s+/)[0]), 0) / 1024) };
out.display = execSync("system_profiler SPDisplaysDataType | grep -iE 'Resolution|Refresh|Type' | head -4").toString().trim();
fs.writeFileSync("desktop-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill("SIGTERM"); await sleep(500); fs.rmSync(PROFILE, { recursive: true, force: true });
process.exit(0);
