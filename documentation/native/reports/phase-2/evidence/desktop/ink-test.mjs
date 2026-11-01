import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PROFILE = path.resolve("chrome-profile-ink");
const proc = spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--remote-debugging-port=9335", "--no-first-run", "--window-size=1366,900", "--app=http://localhost:8765/#screen=ink-js"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 80 && !t; i++) { await sleep(100); try { t = (await (await fetch("http://127.0.0.1:9335/json/list")).json()).find((x) => x.type === "page"); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0; const p = new Map(); const logs = []; const exceptions = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) p.get(d.id)?.(d); if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description?.slice(0, 400)); if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.args.map((a) => a.value ?? a.description).join(" ")); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await sleep(3000);
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
const pen = (type, x, y, f) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "pen", force: f, tiltX: 10, tiltY: 5 });
await pen("mousePressed", 300, 300, 0.4); for (let i = 1; i <= 40; i++) { await pen("mouseMoved", 300 + i * 8, 300 + i * 2, 0.5); await sleep(10); } await pen("mouseReleased", 620, 380, 0.5); await sleep(800);
const info = null, pe = null, after = null;
console.log(JSON.stringify({ info, pointerEvents: pe, after, logs: logs.filter((l) => /INK_|rror|xception/.test(l)).slice(-6), exceptions }, null, 1));
ws.close(); proc.kill(); await sleep(300); fs.rmSync(PROFILE, { recursive: true, force: true }); process.exit(0);
