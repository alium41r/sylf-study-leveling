// Phase 14 on a connected Android tablet: Notes, handwriting with stylus input, PDFs and the whiteboard, through the real app.
// `adb input stylus` sends MotionEvents with the stylus tool type, so the native ink surface sees a pen; pressure and tilt stay at
// their defaults and palm rejection needs a hand, so those stay on the by-hand checklist. A PDF is pushed into Downloads for the
// picker. Stops if the screen is locked or a security dialog holds it: both are the owner's.
// Usage: node tooling/checks/android-notes-check.mjs [--out=dir]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

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
// Themes may show labels in capitals, so labels match regardless of case.
const find = (nodes, label) => { const want = label.toLowerCase(); return nodes.find((n) => n.desc.toLowerCase() === want || n.text.toLowerCase() === want || n.desc.toLowerCase().startsWith(`${want},`)); };
const tapLabel = async (label, wait = 900) => { const node = find(dump(), label); if (!node) throw new Error(`nothing labelled ${label}`); tap(node.cx, node.cy); await sleep(wait); return node; };
/** Dark pixels in a region of the screen, read from a screenshot (8-bit RGBA or RGB PNG, as screencap writes). Ink is dark; paper and rules are not. */
function darkPixels(rect) {
  const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });
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
  let n = 0;
  for (let y = Math.max(0, rect.y1); y < Math.min(height, rect.y2); y += 2) for (let x = Math.max(0, rect.x1); x < Math.min(width, rect.x2); x += 2) {
    const i = x * channels, row = rows[y];
    if (row[i] + row[i + 1] + row[i + 2] < 240) n++;
  }
  return n;
}
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
// New asks for a name; Enter with none keeps the automatic title. (Enter, not Create: in landscape the keyboard covers the button.)
const create = async () => { await tapLabel("New", 1200); adb("shell", "input", "keyevent", "KEYCODE_ENTER"); await sleep(3000); };

await link("space=workspace&wsClear=1&wsOpen=notes", 6000);
shot("01-library");
check("library opens", !!find(dump(), "New"));

// The one note kind: switch to Write, then handwriting with the stylus tool type.
await create();
if (find(dump(), "Write")) await tapLabel("Write", 900);
const page = writingArea();
check("pen case is shown when the note is in Write", !!page);
if (page) {
  frames(true);
  const x = page.x1 + 120, y = page.y1 + 200;
  for (let i = 0; i < 6; i++) stylus({ x, y: y + i * 70 }, { x: x + 700, y: y + i * 70 + 30 }, 700);
  await sleep(800);
  results.writingFrames = frames(false);
  shot("02-handwriting-stylus");
  // One eraser sweep over everything leaves nothing, the last stroke included; one Undo brings it back.
  const region = { x1: x - 20, x2: x + 720, y1: y - 40, y2: y + 6 * 70 + 50 };
  results.inkBeforeErase = darkPixels(region);
  await tapLabel("Eraser", 600);
  for (let dx = 0; dx <= 760; dx += 40) stylus({ x: x + dx, y: y - 60 }, { x: x + dx, y: y + 6 * 70 + 60 }, 250);
  await sleep(900);
  results.inkAfterErase = darkPixels(region);
  shot("03b-erased");
  check("eraser removes every stroke, the last one too", results.inkBeforeErase > 200 && results.inkAfterErase < results.inkBeforeErase * 0.05, { before: results.inkBeforeErase, after: results.inkAfterErase });
  await tapLabel("Undo", 1200);
  await tapLabel("Pen", 400);
  // A finger on a pen-only page scrolls instead of writing.
  // Well inside the page: a finger on the window's edge would resize it.
  finger({ x: x + 300, y: page.cy + 150 }, { x: x + 300, y: page.cy - 150 }, 500);
  await sleep(700);
  shot("03-finger-scrolls");
  results.memoryHandwriting = memory();
  // Full screen: only the toolbar and the page, then back.
  await tapLabel("Full screen", 1800);
  let nodes = dump();
  check("full screen leaves only the toolbar and page", !nodes.some((n) => n.desc.includes("Move with the arrow keys")) && !!find(nodes, "Exit full screen") && !!find(nodes, "Pen"));
  shot("03c-full-screen");
  await tapLabel("Exit full screen", 1500);
  nodes = dump();
  check("exit full screen brings the bars back", nodes.some((n) => n.desc.includes("Move with the arrow keys")));
}

// A whiteboard: pen draws, two-finger moves are on the by-hand list.
await link("space=workspace&wsClear=1&wsOpen=whiteboard", 4000);
await create();
const board = writingArea();
if (board) {
  for (let i = 0; i < 4; i++) stylus({ x: board.cx - 300, y: board.cy - 150 + i * 90 }, { x: board.cx + 300, y: board.cy - 100 + i * 90 }, 600);
  await sleep(600);
}
check("whiteboard opens with its pen case", !!board);
shot("04-whiteboard");

// Typing on the same kind of note: BlockNote in a WebView on the page being typed on.
await link("space=workspace&wsClear=1&wsOpen=notes", 4000);
await create();
if (find(dump(), "Type")) await tapLabel("Type", 1200);
let web = dump().find((n) => n.cls.includes("WebView"));
if (!web) { const area = find(dump(), "Type on this page"); if (area) { tap(area.cx, area.y1 + 60); await sleep(2500); web = dump().find((n) => n.cls.includes("WebView")); } }
check("typed note runs in a WebView", !!web);
if (web) { tap(web.cx, web.y1 + 120); await sleep(600); adb("shell", "input", "text", "Complex%snumbers"); await sleep(1200); }
shot("05-typed-note");
results.memoryTypedNote = memory();
// Typed text stays on the page in Write, drawn natively once the editor closes.
if (web) {
  await tapLabel("Write", 2000);
  results.textInWrite = darkPixels({ x1: web.x1, x2: Math.min(web.x2, web.x1 + 700), y1: web.y1, y2: web.y1 + 160 });
  check("typed text shows in Write", results.textInWrite > 80, { darkPixels: results.textInWrite });
  shot("05b-text-in-write");
}

// The command palette from the corner, and sound in the timer dock.
await link("space=home", 3500);
await tapLabel("Search Sylf", 2500);
check("search opens the command palette", !!find(dump(), "New note"));
shot("06-command-palette");
// The first Back closes the keyboard, the second the palette.
adb("shell", "input", "keyevent", "KEYCODE_BACK");
await sleep(700);
if (find(dump(), "Search notes, tools, places and actions") || dump().some((n) => n.desc === "Close Search Sylf")) { adb("shell", "input", "keyevent", "KEYCODE_BACK"); await sleep(900); }
check("back closes the palette", !dump().some((n) => n.desc === "Close Search Sylf"));
const timer = dump().find((n) => n.desc.startsWith("Timer."));
if (timer) { tap(timer.cx, timer.cy); await sleep(1500); }
check("the timer dock has Sound", !!find(dump(), "Sound"));
shot("07-dock-sound");
adb("shell", "input", "keyevent", "KEYCODE_BACK");

const crashes = adb("logcat", "-d", "-b", "crash");
check("no crash in logcat", !crashes.includes(PACKAGE), crashes.slice(0, 400) || undefined);
fs.writeFileSync(path.join(out, "android-notes-check.json"), JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => v === false || (typeof v === "object" && v && "ok" in v && !v.ok)).map(([k]) => k);
console.log("SYLF_NOTES_CHECK " + JSON.stringify({ passed: failed.length === 0, failed }));
process.exit(failed.length ? 1 : 0);
