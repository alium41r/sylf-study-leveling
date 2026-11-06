// Pen pressure on a connected tablet, through the real app: a virtual stylus (Android's own `uinput` tool, which `adb input stylus`
// cannot replace because it sends no pressure) writes a line lightly for its first half and hard for its second, once with Pen
// pressure on and once off. The line's thickness is read from the screen while the pen is still down (the native live stroke) and
// after it lifts (the finished outline). Pressure on: the hard half is wider. Pressure off: both halves are as wide, live and
// finished. The virtual device goes with the `uinput` process; nothing stays on the tablet. Stops if the screen is locked or a
// security dialog holds it: both are the owner's. Usage: node tooling/checks/android-pen-check.mjs [--out=dir]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-pen-check");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = async (query, wait = 2500) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };
const tap = (x, y) => adb("shell", "input", "tap", String(x), String(y));
const screencap = () => execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });

function dump() {
  try { adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml"); } catch { return []; }
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(m[0])?.[1] ?? "";
    const [x1, y1, x2, y2] = (/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0]).slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), checked: attr("checked") === "true", x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
  });
}
const find = (nodes, label) => { const want = label.toLowerCase(); return nodes.find((n) => n.desc.toLowerCase() === want || n.text.toLowerCase() === want || n.desc.toLowerCase().startsWith(`${want},`)); };
const tapLabel = async (label, wait = 900) => { const node = find(dump(), label); if (!node) throw new Error(`nothing labelled ${label}`); tap(node.cx, node.cy); await sleep(wait); return node; };

/** A screenshot as rows of pixels (8-bit RGBA or RGB PNG, as screencap writes). */
function decode(png) {
  let at = 8, width = 0, height = 0, channels = 4;
  const parts = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 2 ? 3 : 4; }
    if (type === "IDAT") parts.push(data);
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts)), stride = width * channels, rows = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
    rows.push(line);
    previous = line;
  }
  return { width, height, channels, rows };
}
/** The ink's thickness in pixels across a horizontal line at x: dark pixels in the column near y, the median of nine columns. */
function thickness(image, x, y, reach = 60) {
  const counts = [];
  for (let dx = -8; dx <= 8; dx += 2) {
    let n = 0;
    for (let yy = y - reach; yy <= y + reach; yy++) {
      const row = image.rows[yy], i = (x + dx) * image.channels;
      if (row && row[i] + row[i + 1] + row[i + 2] < 300) n++;
    }
    counts.push(n);
  }
  return counts.sort((a, b) => a - b)[4];
}

// The stylus reports in the screen's natural orientation; the line is placed in the orientation the tablet is held in.
const displays = adb("shell", "dumpsys", "window", "displays");
const ROTATION = Number(/mCurrentRotation=ROTATION_(\d+)/.exec(displays)?.[1] ?? 0);
const [CUR_W, CUR_H] = /cur=(\d+)x(\d+)/.exec(displays).slice(1).map(Number);
const [NAT_W, NAT_H] = ROTATION % 180 === 0 ? [CUR_W, CUR_H] : [CUR_H, CUR_W];
const raw = (x, y) => {
  x = Math.round(x); y = Math.round(y);
  if (ROTATION === 90) return [NAT_W - 1 - y, x];
  if (ROTATION === 180) return [NAT_W - 1 - x, NAT_H - 1 - y];
  if (ROTATION === 270) return [y, NAT_H - 1 - x];
  return [x, y];
};
const PRESSURE_MAX = 4095;
const axis = (code, maximum) => ({ code, info: { value: 0, minimum: 0, maximum, fuzz: 0, flat: 0, resolution: 0 } });
const REGISTER = { id: 1, command: "register", name: "Sylf Pen Check", vid: 0x18d1, pid: 0x535a, bus: "usb", configuration: [
  { type: "UI_SET_EVBIT", data: ["EV_KEY", "EV_ABS"] }, { type: "UI_SET_KEYBIT", data: ["BTN_TOUCH", "BTN_TOOL_PEN"] },
  { type: "UI_SET_ABSBIT", data: ["ABS_X", "ABS_Y", "ABS_PRESSURE"] }, { type: "UI_SET_PROPBIT", data: ["INPUT_PROP_DIRECT"] },
], abs_info: [axis("ABS_X", NAT_W - 1), axis("ABS_Y", NAT_H - 1), axis("ABS_PRESSURE", PRESSURE_MAX)] };
const inject = (events) => JSON.stringify({ id: 1, command: "inject", events: [...events, "EV_SYN", "SYN_REPORT", 0] });
const wait = (duration) => JSON.stringify({ id: 1, command: "delay", duration });
const at = (x, y, pressure) => { const [rx, ry] = raw(x, y); return ["EV_ABS", "ABS_X", rx, "EV_ABS", "ABS_Y", ry, "EV_ABS", "ABS_PRESSURE", Math.round(pressure * PRESSURE_MAX)]; };

/** A straight line from x0 to x1: light (0.08) for the first half, hard (1) for the second, held down for `hold` ms at its end. */
function lineScript(x0, x1, y, hold) {
  const steps = 70, lines = [JSON.stringify(REGISTER), wait(900)];
  lines.push(inject([...at(x0, y, 0), "EV_KEY", "BTN_TOOL_PEN", 1]), wait(60));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    lines.push(inject([...at(x0 + (x1 - x0) * t, y, t < 0.45 ? 0.08 : t > 0.55 ? 1 : 0.08 + (t - 0.45) * 9.2), ...(i === 0 ? ["EV_KEY", "BTN_TOUCH", 1] : [])]), wait(14));
  }
  lines.push(wait(hold));
  lines.push(inject([...at(x1, y, 0), "EV_KEY", "BTN_TOUCH", 0]), wait(40), inject(["EV_KEY", "BTN_TOOL_PEN", 0]), wait(300));
  return lines.join("\n");
}
/** Writes the line, takes a screenshot while the pen is still down, and another once the finished stroke has replaced it. */
async function writeLine(x0, x1, y) {
  fs.writeFileSync("/tmp/sylf-pen.json", lineScript(x0, x1, y, 3200) + "\n");
  adb("push", "/tmp/sylf-pen.json", "/data/local/tmp/sylf-pen.json");
  const run = spawn(ADB, ["shell", "uinput", "/data/local/tmp/sylf-pen.json"], { stdio: "ignore" });
  const done = new Promise((resolve) => run.on("exit", resolve));
  await sleep(900 + 60 + 71 * 14 + 1300);
  const live = screencap();
  await done;
  await sleep(900);
  return { live, finished: screencap() };
}

const results = {};
const check = (name, ok, detail) => { results[name] = { ok: Boolean(ok), detail }; console.log(`${ok ? "ok  " : "FAIL"} ${name} ${JSON.stringify(detail)}`); };
const stop = (error) => { console.log("SYLF_PEN_CHECK " + JSON.stringify({ passed: false, error })); process.exit(2); };

adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
await sleep(600);
const window = adb("shell", "dumpsys", "window");
if (/isKeyguardShowing=true/.test(window) || /mDreamingLockscreen=true/.test(window)) stop("The tablet is locked. Unlocking is the owner's.");
const focus = window.split("\n").find((line) => line.includes("mCurrentFocus")) ?? "";
if (/avast|packageinstaller|playprotect/i.test(focus)) stop(`A dialog holds the screen, and it is the owner's to answer: ${focus.trim()}`);
fs.mkdirSync(out, { recursive: true });
adb("logcat", "-c");

// A fresh whiteboard, the pen in hand.
await link("space=workspace&wsClear=1&wsOpen=whiteboard&theme=signature&mode=light", 5000);
await tapLabel("New", 1200);
await tapLabel("Create", 3000);
let nodes = dump();
const pen = find(nodes, "Pen"), frame = nodes.find((n) => n.desc.includes("Move with the arrow keys"));
if (!pen || !frame) stop("No whiteboard with a pen case");
const area = { x1: frame.x1 + 80, x2: frame.x2 - 80, y1: pen.y2 + 120, y2: Math.min(frame.y2 - 80, pen.y2 + 1000) };

/** The Pen pressure switch: the control labelled so (its text beside it has no label of its own). */
const switchOf = (list) => list.find((n) => n.desc === "Pen pressure");
/** Opens the pen's panel (tap the pen in hand), makes it a solid ballpoint with pressure as asked, and closes it. */
async function setPen(pressure) {
  await tapLabel("Pen", 700);
  if (!find(dump(), "Pen pressure")) await tapLabel("Pen", 900);
  nodes = dump();
  if (!find(nodes, "Pen pressure")) throw new Error("the pen's panel did not open");
  await tapLabel("Ballpoint pen", 400);
  await tapLabel("Solid", 400);
  const toggle = switchOf(dump());
  if (toggle.checked !== pressure) { tap(toggle.cx, toggle.cy); await sleep(500); }
  results[`panelPressure${pressure ? "On" : "Off"}`] = switchOf(dump())?.checked;
  fs.writeFileSync(path.join(out, `pen-panel-pressure-${pressure ? "on" : "off"}.png`), screencap());
  await tapLabel("Close", 800);
}

const x0 = area.x1 + 60, x1 = area.x2 - 60, light = Math.round(x0 + (x1 - x0) * 0.22), hard = Math.round(x0 + (x1 - x0) * 0.8);
const measure = async (pressure, y) => {
  await setPen(pressure);
  const shots = await writeLine(x0, x1, y);
  const name = pressure ? "on" : "off";
  fs.writeFileSync(path.join(out, `pressure-${name}-live.png`), shots.live);
  fs.writeFileSync(path.join(out, `pressure-${name}-finished.png`), shots.finished);
  const live = decode(shots.live), finished = decode(shots.finished);
  return { live: { light: thickness(live, light, y), hard: thickness(live, hard, y) }, finished: { light: thickness(finished, light, y), hard: thickness(finished, hard, y) } };
};
const on = await measure(true, area.y1 + 120);
const off = await measure(false, area.y1 + 420);
results.on = on;
results.off = off;

check("pressure on: a hard press writes wider", on.finished.light > 0 && on.finished.hard >= on.finished.light * 1.5, on.finished);
check("pressure on: the live line is the finished line", Math.abs(on.live.light - on.finished.light) <= 2 && Math.abs(on.live.hard - on.finished.hard) <= 2, on);
check("pressure off: light and hard are the same width", off.finished.light > 0 && Math.abs(off.finished.hard - off.finished.light) <= 2, off.finished);
check("pressure off: the live line is the finished line", Math.abs(off.live.light - off.finished.light) <= 2 && Math.abs(off.live.hard - off.finished.hard) <= 2, off);
check("the panel shows the switch as set", results.panelPressureOn === true && results.panelPressureOff === false, { on: results.panelPressureOn, off: results.panelPressureOff });

// Kept: after the app is stopped and opened again, the pen still has pressure off.
adb("shell", "am", "force-stop", PACKAGE);
await sleep(800);
await link("space=workspace&wsClear=1&wsOpen=whiteboard&theme=signature&mode=dark", 6000);
await tapLabel("Whiteboard", 3000).catch(() => undefined);
nodes = dump();
if (find(nodes, "Pen")) {
  await tapLabel("Pen", 700);
  if (!find(dump(), "Pen pressure")) await tapLabel("Pen", 900);
  const toggle = switchOf(dump());
  fs.writeFileSync(path.join(out, "pen-panel-after-restart-dark.png"), screencap());
  check("pressure off is kept after a restart", toggle && toggle.checked === false, { checked: toggle?.checked });
  await tapLabel("Close", 600).catch(() => undefined);
} else check("pressure off is kept after a restart", false, { error: "no pen case after reopening" });

const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
const failed = Object.entries(results).filter(([, v]) => v && typeof v === "object" && "ok" in v && !v.ok).map(([k]) => k);
const report = { passed: failed.length === 0 && !crashed, failed, crashed, rotation: ROTATION, results };
fs.writeFileSync(path.join(out, "android-pen-check.json"), JSON.stringify(report, null, 2));
console.log("SYLF_PEN_CHECK " + JSON.stringify({ passed: report.passed, failed, crashed }));
process.exit(report.passed ? 0 : 1);
