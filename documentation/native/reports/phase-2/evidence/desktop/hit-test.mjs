import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PROFILE = path.resolve("chrome-profile-ht");
const proc = spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--remote-debugging-port=9334", "--no-first-run", "--window-size=1366,900", "--app=http://localhost:8765/#screen=panels"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 80 && !t; i++) { await sleep(100); try { t = (await (await fetch("http://127.0.0.1:9334/json/list")).json()).find((x) => x.type === "page"); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0; const p = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) p.get(d.id)?.(d); if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.args.map((a) => a.value ?? a.description).join(" ")); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await sleep(3000);
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
const info = await ev(`(() => { const panel = [...document.querySelectorAll("div")].filter(d => d.style.transform && d.style.width)[0]; const hdr = panel.firstElementChild; const r = hdr.getBoundingClientRect(); const x = r.left + 40, y = r.top + 18; const hit = document.elementFromPoint(x, y); return { x, y, hdrText: hdr.innerText, hitIsHeaderOrChild: hdr.contains(hit), hitTag: hit?.tagName, hitText: hit?.innerText?.slice(0,30), hdrTouchAction: getComputedStyle(hdr).touchAction, hdrUserSelect: getComputedStyle(hdr).userSelect }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
await ev(`window.__pe = []; ["pointerdown","pointermove","pointerup"].forEach(t => document.addEventListener(t, e => window.__pe.push(t + ":" + e.target.innerText?.slice(0,12)), true)); true`);
await mouse("mousePressed", info.x, info.y); for (let i = 1; i <= 30; i++) { await mouse("mouseMoved", info.x + i * 5, info.y + i * 3); await sleep(10); } await mouse("mouseReleased", info.x + 150, info.y + 90); await sleep(300);
const pe = await ev(`window.__pe.slice(0, 4).concat(window.__pe.slice(-2))`);
const after = await ev(`[...document.querySelectorAll("div")].filter(d => d.style.transform && d.style.width)[0].style.transform`);
console.log(JSON.stringify({ info, pointerEvents: pe, after, logs: logs.filter((l) => /BEGIN|rror|arn/.test(l)).slice(0, 8) }, null, 1));
ws.close(); proc.kill(); await sleep(300); fs.rmSync(PROFILE, { recursive: true, force: true }); process.exit(0);
