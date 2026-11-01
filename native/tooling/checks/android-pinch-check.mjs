// A real two-finger pinch on a connected tablet, sent through a virtual touchscreen from adb, which `adb input` cannot do.
// The check is the promise a pinch makes: whatever was between the fingers stays between them, so a window's title bar ends where
// the zoom says it must. Two fingers on a tool that zooms its own content must move nothing at all. Usage: node tooling/checks/android-pinch-check.mjs [--out=<file>]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const out = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const link = async (query, wait = 1300) => { adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };

// The touchscreen reports its own coordinates, so a tablet held the other way up needs them turned.
const ROTATION = Number(/mCurrentRotation=ROTATION_(\d+)/.exec(adb("shell", "dumpsys", "window", "displays"))?.[1] ?? 0);
const [WIDTH, HEIGHT] = /cur=(\d+)x(\d+)/.exec(adb("shell", "dumpsys", "window", "displays")).slice(1).map(Number);
if (ROTATION !== 0 && ROTATION !== 180) { console.log("SYLF_PINCH_CHECK " + JSON.stringify({ passed: false, error: `Hold the tablet in portrait: rotation ${ROTATION}` })); process.exit(2); }
const raw = (x, y) => (ROTATION === 180 ? [WIDTH - 1 - Math.round(x), HEIGHT - 1 - Math.round(y)] : [Math.round(x), Math.round(y)]);

// A virtual touchscreen, which Android's own `uinput` tool registers and removes with its process. Nothing stays on the tablet.
const axis = (code, maximum) => ({ code, info: { value: 0, minimum: 0, maximum, fuzz: 0, flat: 0, resolution: 0 } });
const REGISTER = { id: 1, command: "register", name: "Sylf Pinch Check", vid: 0x18d1, pid: 0x5359, bus: "usb", configuration: [
  { type: "UI_SET_EVBIT", data: ["EV_KEY", "EV_ABS"] }, { type: "UI_SET_KEYBIT", data: ["BTN_TOUCH"] },
  { type: "UI_SET_ABSBIT", data: ["ABS_MT_SLOT", "ABS_MT_TOUCH_MAJOR", "ABS_MT_POSITION_X", "ABS_MT_POSITION_Y", "ABS_MT_TRACKING_ID"] },
  { type: "UI_SET_PROPBIT", data: ["INPUT_PROP_DIRECT"] },
], abs_info: [axis("ABS_MT_SLOT", 9), axis("ABS_MT_TOUCH_MAJOR", 255), axis("ABS_MT_POSITION_X", WIDTH - 1), axis("ABS_MT_POSITION_Y", HEIGHT - 1), axis("ABS_MT_TRACKING_ID", 65535)] };
const abs = (code, value) => ["EV_ABS", code, value];
const finger = (slot, x, y) => { const [rawX, rawY] = raw(x, y); return [...abs("ABS_MT_SLOT", slot), ...abs("ABS_MT_POSITION_X", rawX), ...abs("ABS_MT_POSITION_Y", rawY)]; };
const inject = (events) => JSON.stringify({ id: 1, command: "inject", events: [...events, "EV_SYN", "SYN_REPORT", 0] });
const wait = (duration) => JSON.stringify({ id: 1, command: "delay", duration });

/** Fingers open or close about a point. `lift` takes one finger away first, as a hand does, so the other ends the gesture alone. */
function pinchScript({ cx, cy, from, to, steps = 40, angle = 0.6, lift = false }) {
  const at = (span) => [[cx - (Math.cos(angle) * span) / 2, cy - (Math.sin(angle) * span) / 2], [cx + (Math.cos(angle) * span) / 2, cy + (Math.sin(angle) * span) / 2]];
  const [a, b] = at(from);
  const lines = [JSON.stringify(REGISTER), wait(900)];
  lines.push(inject([...abs("ABS_MT_SLOT", 0), ...abs("ABS_MT_TRACKING_ID", 9001), ...abs("ABS_MT_TOUCH_MAJOR", 6), ...finger(0, a[0], a[1]).slice(3), ...abs("ABS_MT_SLOT", 1), ...abs("ABS_MT_TRACKING_ID", 9002), ...abs("ABS_MT_TOUCH_MAJOR", 6), ...finger(1, b[0], b[1]).slice(3), "EV_KEY", "BTN_TOUCH", 1]), wait(40));
  for (let step = 1; step <= steps; step++) {
    const [p, q] = at(from + ((to - from) * step) / steps);
    lines.push(inject([...finger(0, p[0], p[1]), ...finger(1, q[0], q[1])]), wait(12));
  }
  const [end] = at(to);
  if (lift) {
    lines.push(inject([...abs("ABS_MT_SLOT", 1), ...abs("ABS_MT_TRACKING_ID", -1)]), wait(30));
    lines.push(inject(finger(0, end[0] + 3, end[1] + 3)), wait(30));
    lines.push(inject([...abs("ABS_MT_SLOT", 0), ...abs("ABS_MT_TRACKING_ID", -1), "EV_KEY", "BTN_TOUCH", 0]));
  } else lines.push(inject([...abs("ABS_MT_SLOT", 0), ...abs("ABS_MT_TRACKING_ID", -1), ...abs("ABS_MT_SLOT", 1), ...abs("ABS_MT_TRACKING_ID", -1), "EV_KEY", "BTN_TOUCH", 0]));
  lines.push(wait(300));
  return lines.join("\n");
}
function pinch(options) {
  fs.writeFileSync("/tmp/sylf-pinch.json", pinchScript(options) + "\n");
  adb("push", "/tmp/sylf-pinch.json", "/data/local/tmp/sylf-pinch.json");
  adb("shell", "uinput", "/data/local/tmp/sylf-pinch.json");
}

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(m[0])?.[1] ?? "";
    const [x1, y1, x2, y2] = (/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0]).slice(1).map(Number);
    return { desc: attr("content-desc"), x1, y1, x2, y2 };
  });
}
const read = () => {
  const nodes = dump();
  const bar = nodes.find((n) => n.desc.includes("Move with the arrow keys"));
  const zoom = Number(/Zoom (\d+)%/.exec(nodes.find((n) => n.desc.startsWith("Zoom "))?.desc ?? "")?.[1]);
  const close = nodes.find((n) => n.desc.startsWith("Close "));
  return { left: bar?.x1, top: bar?.y1, right: bar?.x2, edge: close?.x2, zoom };
};

const frames = () => {
  const text = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
  const number = (pattern) => Number(pattern.exec(text)?.[1] ?? 0);
  return { total: number(/Total frames rendered: (\d+)/), janky: number(/Janky frames: (\d+)/), p50: number(/50th percentile: (\d+)ms/), p90: number(/90th percentile: (\d+)ms/), p99: number(/99th percentile: (\d+)ms/) };
};

const results = [];
/** `at` chooses the middle of the pinch from where the window is. `still` means the pinch is the tool's: nothing may move. */
const scenario = async (name, tool, at, { from, to, lift = false, still = false }) => {
  await link("space=workspace&wsClear=1&wsZoom=1&theme=signature&mode=dark");
  await link(`space=workspace&wsOpen=${tool}`);
  const before = read();
  const { cx, cy } = at(before);
  adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
  pinch({ cx, cy, from, to, lift });
  await sleep(1400);
  const pinchFrames = frames();
  const after = read();
  // The zoom comes from the dock, and the check uses the window's top and its close button, because either end of a window can
  // leave the screen as it grows.
  const ratio = after.zoom / before.zoom;
  const expected = { edge: cx + (before.edge - cx) * ratio, top: cy + (before.top - cy) * ratio };
  const errorPx = Math.round(Math.hypot(after.edge - expected.edge, after.top - expected.top));
  const zoomed = Math.abs(ratio - 1) > 0.05;
  const entry = { name, still, before, after, zoomRatio: +ratio.toFixed(3), fingerRatio: +(to / from).toFixed(3), errorPx, frames: pinchFrames, ok: still ? !zoomed && errorPx <= 3 : zoomed && errorPx <= 24 };
  results.push(entry);
  console.log(JSON.stringify(entry));
};

const below = () => ({ cx: 720, cy: 1800 });
const middle = (bar) => ({ cx: (bar.left + bar.right) / 2, cy: bar.top + 340 });
const edge = (bar) => ({ cx: bar.edge + 16, cy: bar.top + 340 });
const IN = { from: 300, to: 460 };
const OUT = { from: 460, to: 240 };
// One finger on the window and one beside it, both on the screen.
const STRADDLE_IN = { from: 240, to: 360 };
const STRADDLE_OUT = { from: 340, to: 200 };
await scenario("calculator-canvas-in", "calculator", below, IN);
await scenario("calculator-canvas-out", "calculator", below, OUT);
await scenario("calculator-canvas-lifted", "calculator", below, { ...IN, lift: true });
await scenario("calculator-inside-in", "calculator", middle, { from: 200, to: 340 });
await scenario("calculator-inside-out", "calculator", middle, { from: 340, to: 180 });
await scenario("calculator-edge-in", "calculator", edge, STRADDLE_IN);
await scenario("calculator-edge-out", "calculator", edge, STRADDLE_OUT);
await scenario("timer-inside-out", "timer", middle, { from: 280, to: 160 });
await scenario("notes-inside-in", "notes", middle, { from: 200, to: 340, still: true });
await scenario("notes-inside-out", "notes", middle, { from: 340, to: 180, still: true });
await scenario("pdfs-inside-out", "pdfs", middle, { from: 340, to: 180, still: true });
await scenario("notes-edge-in", "notes", edge, STRADDLE_IN);
await scenario("notes-edge-out", "notes", edge, STRADDLE_OUT);

const failed = results.filter((entry) => !entry.ok).map((entry) => entry.name);
const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
const report = { passed: failed.length === 0 && !crashed, failed, crashed, results };
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); }
console.log("SYLF_PINCH_CHECK " + JSON.stringify({ passed: report.passed, failed }));
process.exit(report.passed ? 0 : 1);
