// Drives Workspace on a connected Android device with real input (adb taps, long presses, swipes, hardware Back), then reads the
// result from the accessibility tree. Covers what the web run cannot: touch, UI-thread gestures, restoration across a process
// kill, and frames while the canvas and a window move. A pinch needs two fingers, which `adb input` cannot send, so pinching,
// the S Pen and a palm are on the morning checklist instead. Stops and says so if a security dialog holds the screen.
// Usage: node tooling/checks/android-workspace-check.mjs [--out=dir] [--skip-themes]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-workspace-check");
const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const TOOLS = ["Notes", "PDFs", "Whiteboard", "Planner", "Calendar", "Sylvie", "Timer", "Calculator", "Audio", "Resources"];
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screenshot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
const link = async (query, wait = 1400) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };
const launch = async () => { adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "1"); await sleep(1800); };
const kill = async () => { adb("shell", "am", "force-stop", PACKAGE); await sleep(700); };

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const node = m[0];
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(node)?.[1] ?? "";
    const [x1, y1, x2, y2] = (/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0]).slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), clickable: attr("clickable") === "true", x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2), w: x2 - x1, h: y2 - y1 };
  });
}
const tap = (node) => adb("shell", "input", "tap", String(node.cx), String(node.cy));
const swipe = (from, to, ms = 700) => adb("shell", "input", "swipe", String(from.x), String(from.y), String(to.x), String(to.y), String(ms));
const longPress = (node) => swipe({ x: node.cx, y: node.cy }, { x: node.cx, y: node.cy }, 700);
const dockItem = (nodes, label) => nodes.find((n) => n.clickable && (n.desc === label || n.desc.startsWith(`${label}, `)));
const titleBars = (nodes, title) => nodes.filter((n) => n.desc.startsWith(`${title}.`) && n.desc.includes("Move with"));
const anyBar = (nodes) => nodes.filter((n) => n.desc.includes("Move with the arrow keys"));
const has = (nodes, text) => nodes.some((n) => n.text === text || n.desc === text);
const frames = (reset) => {
  if (reset) return adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
  const text = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
  const read = (pattern) => Number(pattern.exec(text)?.[1] ?? 0);
  const total = read(/Total frames rendered: (\d+)/);
  const janky = read(/Janky frames: (\d+)/);
  return { total, janky, percent: total ? +((janky / total) * 100).toFixed(2) : null, p50: read(/50th percentile: (\d+)ms/), p90: read(/90th percentile: (\d+)ms/), p99: read(/99th percentile: (\d+)ms/) };
};

const results = {};
const check = (name, ok, detail) => { results[name] = detail === undefined ? Boolean(ok) : { ok: Boolean(ok), detail }; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };

const focus = adb("shell", "dumpsys", "window").split("\n").find((line) => line.includes("mCurrentFocus")) ?? "";
if (/avast|packageinstaller|playprotect/i.test(focus)) {
  console.log("SYLF_WORKSPACE_CHECK " + JSON.stringify({ passed: false, error: `A dialog holds the screen, and it is the owner's to answer: ${focus.trim()}` }));
  process.exit(2);
}

fs.mkdirSync(out, { recursive: true });
adb("logcat", "-c");
adb("logcat", "-c", "-b", "crash");
adb("shell", "pm", "clear", PACKAGE);
await sleep(600);
await launch();
await link("space=workspace&theme=signature&mode=dark");

// 1. An empty canvas and a full Command Center, with targets large enough for a finger.
let nodes = dump();
const density = Number(/(\d+)\s*$/.exec(adb("shell", "wm", "density").trim())?.[1] ?? 280) / 160;
check("emptyCanvasInvites", has(nodes, "Workspace"));
check("tenToolsNamed", TOOLS.every((label) => dockItem(nodes, label)));
check("dockTargetsAtLeast44", TOOLS.every((label) => { const item = dockItem(nodes, label); return item.w / density >= 44 && item.h / density >= 44; }));
screenshot("device-empty");

// 2. Tools open by touch, and one tool can open twice.
tap(dockItem(nodes, "Notes"));
await sleep(900);
nodes = dump();
check("tapOpensTool", anyBar(nodes).length === 1);
longPress(dockItem(nodes, "Notes"));
await sleep(700);
nodes = dump();
const fresh = nodes.find((n) => n.desc === "New window");
check("longPressOpensMenu", Boolean(fresh));
if (fresh) tap(fresh);
await sleep(900);
nodes = dump();
check("secondInstanceOpens", anyBar(nodes).length === 2, anyBar(nodes).map((n) => n.desc.split(".")[0]));
tap(dockItem(nodes, "Calculator"));
await sleep(900);
nodes = dump();
// In portrait a third window lands out of view and the camera follows it, so the first one leaves the tree. Count by name, not by total.
check("thirdToolOpens", titleBars(nodes, "Calculator").length === 1);
screenshot("device-three-tools");

// 3. A title bar drags the window, on the UI thread, and the window lands on the grid.
let bar = anyBar(nodes).at(-1);
frames(true);
swipe({ x: bar.cx, y: bar.cy }, { x: bar.cx - 180, y: bar.cy + 140 }, 900);
await sleep(600);
results.dragFrames = frames();
nodes = dump();
let moved = anyBar(nodes).find((n) => n.desc === bar.desc);
check("touchDragMovesWindow", moved && Math.abs(moved.cx - bar.cx + 180) < 70 && Math.abs(moved.cy - bar.cy - 140) < 70, moved && { from: [bar.cx, bar.cy], to: [moved.cx, moved.cy] });
screenshot("device-window-moved");

// 4. A drag on empty canvas pans, and a window moves with the world by exactly as much.
const empty = { x: Math.round(Math.max(...nodes.map((n) => n.x2)) * 0.5), y: Math.round(dockItem(nodes, "Notes").y1 - 40) };
bar = anyBar(nodes)[0];
frames(true);
swipe({ x: empty.x, y: empty.y }, { x: empty.x - 240, y: empty.y - 120 }, 500);
await sleep(1500);
results.panFrames = frames();
nodes = dump();
moved = anyBar(nodes).find((n) => n.desc === bar.desc);
check("dragOnCanvasPans", moved && moved.cx < bar.cx - 60, moved && { from: bar.cx, to: moved.cx });

// 5. Minimize and restore, from the tree.
const minimize = nodes.find((n) => n.desc.startsWith("Minimize "));
const minimized = minimize.desc.slice("Minimize ".length);
tap(minimize);
await sleep(800);
nodes = dump();
const chip = nodes.find((n) => n.desc.startsWith("Restore "));
check("minimizeShowsChip", Boolean(chip));
check("minimizedLeavesTree", titleBars(nodes, minimized).length === 0);
if (chip) tap(chip);
await sleep(900);
nodes = dump();
check("chipRestores", titleBars(nodes, minimized).length === 1);

// 6. Presets, through the layout menu.
for (const [label, count] of [["Focus", 1], ["Split", 2], ["Assistant", 2]]) {
  nodes = dump();
  const reveal = nodes.find((n) => n.desc === "Show the Command Center");
  if (reveal) { tap(reveal); await sleep(600); nodes = dump(); }
  tap(nodes.find((n) => n.desc.startsWith("Layout:")));
  await sleep(600);
  nodes = dump();
  tap(nodes.find((n) => n.desc === label));
  await sleep(1100);
  nodes = dump();
  check(`preset-${label}`, anyBar(nodes).length === count, anyBar(nodes).map((n) => n.desc.split(".")[0]));
  screenshot(`device-layout-${label.toLowerCase()}`);
}
check("assistantShowsSylvie", titleBars(nodes, "Sylvie").length === 1);

// 7. Back does nothing destructive here, and the layout survives a process kill.
const before = anyBar(dump()).map((n) => [n.desc, n.cx, n.cy]);
await sleep(600);
await kill();
await launch();
await sleep(1500);
nodes = dump();
check("layoutSurvivesProcessKill", JSON.stringify(anyBar(nodes).map((n) => [n.desc, n.cx, n.cy])) === JSON.stringify(before), { before, after: anyBar(nodes).map((n) => [n.desc, n.cx, n.cy]) });
adb("shell", "input", "keyevent", "KEYCODE_BACK");
await sleep(800);
check("backKeepsAppAlive", adb("shell", "pidof", PACKAGE).trim().length > 0);

// 8. Every theme, in both modes.
if (!process.argv.includes("--skip-themes")) {
  await launch();
  for (const theme of THEMES) for (const mode of ["light", "dark"]) {
    await link(`space=workspace&wsClear=1&wsOpen=notes,calculator,timer&theme=${theme}&mode=${mode}`, 1500);
    screenshot(`device-theme-${theme}-${mode}`);
  }
}

const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
check("noCrash", !crashed);
const failed = Object.entries(results).filter(([key, value]) => !["dragFrames", "panFrames"].includes(key) && value !== true && value?.ok !== true).map(([key]) => key);
fs.writeFileSync(path.join(out, "android-workspace-check.json"), JSON.stringify({ passed: failed.length === 0, failed, results }, null, 2));
console.log("SYLF_WORKSPACE_CHECK " + JSON.stringify({ passed: failed.length === 0, failed, total: Object.keys(results).length, drag: results.dragFrames, pan: results.panFrames }));
process.exit(failed.length ? 1 : 0);
