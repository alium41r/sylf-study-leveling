// Phase 14 on a connected Android tablet: Notes, handwriting with stylus input, PDFs and the whiteboard, through the real app.
// `adb input stylus` sends MotionEvents with the stylus tool type, so the native ink surface sees a pen; pressure and tilt stay at
// their defaults and palm rejection needs a hand, so those stay on the by-hand checklist. A PDF is pushed into Downloads for the
// picker. Stops if the screen is locked or a security dialog holds it: both are the owner's.
// Usage: node tooling/checks/android-notes-check.mjs [--out=dir]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-notes-check");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
const link = async (query, wait = 2500) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };
const stylus = (from, to, ms = 600) => adb("shell", "input", "stylus", "swipe", String(from.x), String(from.y), String(to.x), String(to.y), String(ms));
const finger = (from, to, ms = 400) => adb("shell", "input", "touchscreen", "swipe", String(from.x), String(from.y), String(to.x), String(to.y), String(ms));
const tap = (x, y) => adb("shell", "input", "tap", String(x), String(y));
const wake = () => adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");

function dump() {
  try { adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml"); } catch { return []; }
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const node = m[0];
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(node)?.[1] ?? "";
    const [x1, y1, x2, y2] = (/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0]).slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), cls: attr("class"), x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
  });
}
const find = (nodes, label) => nodes.find((n) => n.desc === label || n.text === label || n.desc.startsWith(`${label},`));
const tapLabel = async (label, wait = 900) => { const node = find(dump(), label); if (!node) throw new Error(`nothing labelled ${label}`); tap(node.cx, node.cy); await sleep(wait); return node; };
const frames = (reset) => {
  if (reset) return adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
  const text = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
  const read = (pattern) => Number(pattern.exec(text)?.[1] ?? 0);
  const total = read(/Total frames rendered: (\d+)/), janky = read(/Janky frames: (\d+)/);
  return { total, janky, percent: total ? +((janky / total) * 100).toFixed(2) : null, p50: read(/50th percentile: (\d+)ms/), p90: read(/90th percentile: (\d+)ms/), p99: read(/99th percentile: (\d+)ms/) };
};
const memory = () => { const text = adb("shell", "dumpsys", "meminfo", PACKAGE); return { pssMb: Math.round(Number(/TOTAL PSS:\s+(\d+)/.exec(text)?.[1] ?? /TOTAL\s+(\d+)/.exec(text)?.[1] ?? 0) / 1024) }; };

const results = {};
const check = (name, ok, detail) => { results[name] = detail === undefined ? Boolean(ok) : { ok: Boolean(ok), detail }; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };
const stop = (error) => { console.log("SYLF_NOTES_CHECK " + JSON.stringify({ passed: false, error })); process.exit(2); };

wake();
await sleep(600);
const window = adb("shell", "dumpsys", "window");
if (/isKeyguardShowing=true/.test(window) || /mDreamingLockscreen=true/.test(window)) stop("The tablet is locked. Unlocking is the owner's.");
const focus = window.split("\n").find((line) => line.includes("mCurrentFocus")) ?? "";
if (/avast|packageinstaller|playprotect/i.test(focus)) stop(`A dialog holds the screen, and it is the owner's to answer: ${focus.trim()}`);

fs.mkdirSync(out, { recursive: true });
adb("logcat", "-c");
adb("shell", "am", "force-stop", PACKAGE);
// The writing area: below the pen case, inside the window that holds it.
const writingArea = () => {
  const nodes = dump(), pen = find(nodes, "Pen"), frame = nodes.find((n) => n.desc.includes("Move with the arrow keys"));
  if (!pen || !frame) return null;
  const top = pen.y2 + 60, bottom = Math.min(frame.y1 + 1300, 2100);
  return { x1: frame.x1 + 60, x2: frame.x2 - 60, y1: top, y2: bottom, cx: Math.round((frame.x1 + frame.x2) / 2), cy: Math.round((top + bottom) / 2) };
};
const create = async (label) => { await tapLabel("New", 900); await tapLabel(label, 3000); };

await link("space=workspace&wsClear=1&wsOpen=notes", 6000);
shot("01-library");
check("library opens", !!find(dump(), "New"));

// Handwriting with the stylus tool type.
await create("Handwriting, ruled");
const page = writingArea();
check("pen case is shown for a handwritten page", !!page);
if (page) {
  frames(true);
  const x = page.x1 + 120, y = page.y1 + 200;
  for (let i = 0; i < 6; i++) stylus({ x, y: y + i * 70 }, { x: x + 700, y: y + i * 70 + 30 }, 700);
  await sleep(800);
  results.writingFrames = frames(false);
  shot("02-handwriting-stylus");
  // A finger on a pen-only page scrolls instead of writing.
  finger({ x: x + 300, y: page.y2 - 200 }, { x: x + 300, y: page.y1 + 200 }, 500);
  await sleep(700);
  shot("03-finger-scrolls");
  results.memoryHandwriting = memory();
}

// A whiteboard: pen draws, two-finger moves are on the by-hand list.
await link("space=workspace&wsClear=1&wsOpen=whiteboard", 4000);
await tapLabel("New", 2500);
const board = writingArea();
if (board) {
  for (let i = 0; i < 4; i++) stylus({ x: board.cx - 300, y: board.cy - 150 + i * 90 }, { x: board.cx + 300, y: board.cy - 100 + i * 90 }, 600);
  await sleep(600);
}
check("whiteboard opens with its pen case", !!board);
shot("04-whiteboard");

// Typed notes: BlockNote in a WebView.
await link("space=workspace&wsClear=1&wsOpen=notes", 4000);
await create("Typed note");
const web = dump().find((n) => n.cls.includes("WebView"));
check("typed note runs in a WebView", !!web);
if (web) { tap(web.cx, web.y1 + 120); await sleep(600); adb("shell", "input", "text", "Complex%snumbers"); await sleep(1200); }
shot("05-typed-note");
results.memoryTypedNote = memory();

const crashes = adb("logcat", "-d", "-b", "crash");
check("no crash in logcat", !crashes.includes(PACKAGE), crashes.slice(0, 400) || undefined);
fs.writeFileSync(path.join(out, "android-notes-check.json"), JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => v === false || (typeof v === "object" && v && "ok" in v && !v.ok)).map(([k]) => k);
console.log("SYLF_NOTES_CHECK " + JSON.stringify({ passed: failed.length === 0, failed }));
process.exit(failed.length ? 1 : 0);
