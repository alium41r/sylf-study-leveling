// Drives Home on a connected Android device with real input (adb taps, swipes, hardware Back), then reads the result from the
// accessibility tree, which is also what TalkBack reads. Covers what the web run cannot: touch, restoration across a process
// kill, native scrolling frames and real resizable windows. Captures every destination in every theme in both modes.
// Usage: node android-home-check.mjs [--out=dir] [--skip-themes] [--skip-windows]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-home-check");
const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const DESTINATIONS = ["today", "plan", "focus", "circle", "progress"];
const LABELS = { today: "Today", plan: "Plan", focus: "Focus", circle: "Circle", progress: "Progress" };
// A heading found on one destination only, so seeing it proves which page is in the accessibility tree.
const MARKS = { today: "Quests", plan: "Quests and goals", focus: "Recent sessions", circle: "People", progress: "Thirty days" };
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screenshot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
const link = async (query, wait = 1200) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };
const launch = async () => { adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "1"); await sleep(1500); };
const kill = async () => { adb("shell", "am", "force-stop", PACKAGE); await sleep(700); };
const logs = () => adb("logcat", "-d", "-v", "raw", "-s", "ReactNativeJS:V");

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const node = m[0];
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(node)?.[1] ?? "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0];
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), selected: attr("selected") === "true", clickable: attr("clickable") === "true", enabled: attr("enabled") === "true", x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2), w: x2 - x1, h: y2 - y1 };
  });
}
const tap = (node) => adb("shell", "input", "tap", String(node.cx), String(node.cy));
const railItem = (nodes, id) => nodes.find((n) => n.desc === LABELS[id] && n.clickable);
const selectedItem = (nodes) => Object.values(LABELS).find((label) => nodes.some((n) => n.desc === label && n.clickable && n.selected));
const shows = (nodes, text) => nodes.some((n) => n.text === text);
const go = async (id) => { tap(railItem(dump(), id)); await sleep(650); };

const results = {};
const check = (name, ok, detail) => { results[name] = detail === undefined ? Boolean(ok) : { ok: Boolean(ok), detail }; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };

fs.mkdirSync(out, { recursive: true });
adb("logcat", "-c");
adb("logcat", "-c", "-b", "crash");
adb("shell", "pm", "clear", PACKAGE);
await sleep(600);
await launch();

// 1. First launch: Today, four named destinations, targets large enough, and the rail lined up under the Spaces icon.
let nodes = dump();
const density = Number(/(\d+)\s*$/.exec(adb("shell", "wm", "density").trim())?.[1] ?? 280) / 160;
check("opensOnToday", selectedItem(nodes) === "Today" && shows(nodes, MARKS.today));
check("fiveNamedDestinations", DESTINATIONS.every((id) => railItem(nodes, id)));
check("sampleDataLabelled", shows(nodes, "Sample data"));
const icon = nodes.find((n) => n.desc.startsWith("Spaces."));
const today = railItem(nodes, "today");
check("railTargetsAtLeast44", DESTINATIONS.every((id) => { const item = railItem(nodes, id); return item.w / density >= 44 && item.h / density >= 44; }), { w: +(today.w / density).toFixed(1), h: +(today.h / density).toFixed(1) });
check("railCenteredUnderSpacesIcon", icon && Math.abs(icon.cx - today.cx) <= 3, icon && { icon: icon.cx, rail: today.cx });
const [width, height] = [Math.max(...nodes.map((n) => n.x2)), Math.max(...nodes.map((n) => n.y2))];
screenshot("device-first-launch");

// 2. Touch reaches each destination, the hidden pages leave the accessibility tree, and each first visit mounts once.
for (const id of DESTINATIONS) {
  await go(id);
  nodes = dump();
  const others = DESTINATIONS.filter((other) => other !== id);
  check(`touchOpens-${id}`, selectedItem(nodes) === LABELS[id] && shows(nodes, MARKS[id]));
  check(`hiddenPagesLeaveTree-${id}`, others.every((other) => !shows(nodes, MARKS[other])));
  check(`sampleLabel-${id}`, shows(nodes, "Sample data"));
  check(`noUnnamedControls-${id}`, nodes.filter((n) => n.clickable && !n.desc && !n.text).length === 0);
  screenshot(`device-${id}`);
}
const mounts = () => logs().split("\n").filter((line) => line.startsWith("SYLF_HOME_MOUNT"));
const firstMounts = mounts();
check("eachDestinationMountsOnce", firstMounts.length === 4, firstMounts);
for (const id of ["today", "progress", "focus", "circle"]) await go(id);
check("returningMountsNothing", mounts().length === firstMounts.length);

// 3. Nothing pretends to work.
await go("focus");
nodes = dump();
const begin = nodes.find((n) => n.desc === "Begin session");
check("beginEnabled", begin && begin.enabled);
await sleep(400);
check("localTimeLabelled", shows(dump(), "Tracked on this device. Not saved to your study record yet."));
await go("circle");
check("inviteDisabled", dump().find((n) => n.desc === "Invite a friend")?.enabled === false);

// 4. The Spaces bar sits above the rail, and an outside tap closes it without reaching what is underneath.
nodes = dump();
tap(nodes.find((n) => n.desc.startsWith("Spaces.")));
await sleep(900);
nodes = dump();
check("barOpensOverHome", nodes.some((n) => n.desc === "Workspace" && n.clickable));
const behindBar = railItem(nodes, "progress") ?? railItem(dump(), "progress");
screenshot("device-bar-over-home");
adb("shell", "input", "tap", String(behindBar?.cx ?? 60), String(behindBar?.cy ?? Math.round(height * 0.6)));
await sleep(900);
nodes = dump();
check("outsideTapDoesNotReachRail", selectedItem(nodes) === "Circle" && !nodes.some((n) => n.desc === "Workspace" && n.clickable));

// 5. Quick actions are real.
await go("today");
const prepare = dump().find((n) => n.desc === "Prepare in Focus");
if (prepare) tap(prepare);
await sleep(800);
check("prepareGoesToFocus", selectedItem(dump()) === "Focus");

// 6. Restoration: each destination keeps its own scroll position across a Space change and a process kill.
const mid = Math.round(width / 2);
// Below the fold in both orientations, so a swipe moves it.
const mark = { today: "Quests", plan: "Quests and goals", focus: "Recent sessions", circle: "Study parties", progress: "Thirty days" };
const swipeUp = () => adb("shell", "input", "swipe", String(mid), String(Math.round(height * 0.72)), String(mid), String(Math.round(height * 0.6)), "700");
const positions = async () => { const found = {}; for (const id of DESTINATIONS) { await go(id); found[id] = dump().find((n) => n.text === mark[id])?.y1; } return found; };
for (const id of DESTINATIONS) { await go(id); swipeUp(); await sleep(900); }
const scrolled = await positions();
await go("circle");
await sleep(400);
nodes = dump();
tap(nodes.find((n) => n.desc.startsWith("Spaces.")));
await sleep(900);
tap(dump().find((n) => n.desc === "Workspace" && n.clickable));
await sleep(1100);
check("homeUnmountsWhenLeft", logs().includes("SYLF_SPACE_UNMOUNT home"));
nodes = dump();
tap(nodes.find((n) => n.desc.startsWith("Spaces.")));
await sleep(900);
tap(dump().find((n) => n.desc === "Home" && n.clickable));
await sleep(1200);
check("destinationSurvivesSpaceChange", selectedItem(dump()) === "Circle");
const afterSwitch = await positions();
check("scrollSurvivesSpaceChange", DESTINATIONS.every((id) => scrolled[id] !== undefined && scrolled[id] === afterSwitch[id]), { scrolled, afterSwitch });
await go("progress");
await kill();
await launch();
check("destinationSurvivesProcessKill", selectedItem(dump()) === "Progress");
const afterKill = await positions();
check("scrollSurvivesProcessKill", DESTINATIONS.every((id) => scrolled[id] === afterKill[id]), afterKill);

// 7. Back with nothing open keeps the system's behavior, and coming back restores the same place.
await go("circle");
adb("shell", "input", "keyevent", "4");
await sleep(900);
await launch();
check("backThenReturnRestores", selectedItem(dump()) === "Circle");

// 8. Every destination in every theme and both modes.
if (!process.argv.includes("--skip-themes")) {
  for (const theme of THEMES) for (const mode of ["light", "dark"]) for (const id of DESTINATIONS) {
    await link(`space=home&home=${id}&theme=${theme}&mode=${mode}`, 1000);
    screenshot(`theme-${theme}-${mode}-${id}`);
  }
  await link("space=home&home=today&theme=signature&mode=light&accent=e5ff00&day=7f8088");
  screenshot("custom-midtone-today");
  await link("space=home&home=progress");
  screenshot("custom-midtone-progress");
  await link("space=home&home=today&theme=signature&mode=dark&homeData=empty");
  screenshot("empty-today");
  await link("space=home&home=circle&homeData=empty");
  screenshot("empty-circle");
  await link("space=home&home=today&homeData=sample");
}

// 9. Frames. Rail changes and scrolling are measured with no accessibility dumps running, so these figures are clean.
await link("space=home&home=today&theme=signature&mode=dark");
const gfx = (label) => {
  const text = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
  const stat = (name) => new RegExp(`${name}:\\s*([\\d.]+)`).exec(text)?.[1];
  return { label, total: stat("Total frames rendered"), janky: /Janky frames: (\d+) \(([\d.]+)%\)/.exec(text)?.slice(1), p50: stat("50th percentile"), p90: stat("90th percentile"), p95: stat("95th percentile"), p99: stat("99th percentile") };
};
nodes = dump();
const taps = Object.fromEntries(DESTINATIONS.map((id) => [id, railItem(nodes, id)]));
for (const id of DESTINATIONS) { tap(taps[id]); await sleep(500); }
adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
for (let i = 0; i < 24; i++) { tap(taps[DESTINATIONS[(i + 1) % 4]]); await sleep(450); }
const railFrames = gfx("rail");
const pss = /TOTAL PSS:\s+(\d+)/.exec(adb("shell", "dumpsys", "meminfo", PACKAGE))?.[1];

// 10. A real pop-up window, resized live: the rail turns into the bottom bar below 600 pt, and nothing remounts.
const windows = {};
let scrollFrames = null;
if (!process.argv.includes("--skip-windows")) {
  await kill();
  adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "5");
  await sleep(1800);
  const task = /#(\d+) type=standard A=\d+:app\.sylf\.client/.exec(adb("shell", "dumpsys", "activity", "activities"))?.[1];
  const horizontal = (() => { const [w, h] = /cur=(\d+)x(\d+)/.exec(adb("shell", "dumpsys", "window", "displays")).slice(1).map(Number); return w > h; })();
  const rects = horizontal ? { wide: [150, 90, 1950, 1300], medium: [150, 90, 1450, 1300], compact: [150, 90, 1000, 1300], narrow: [150, 90, 760, 1300] } : { wide: [40, 150, 1400, 1300], medium: [40, 150, 1200, 1500], compact: [40, 150, 860, 1600], narrow: [40, 150, 620, 1400] };
  const before = logs().split("SYLF_SPACE_MOUNT").length;
  const homeBefore = mounts().length;
  for (const [name, rect] of Object.entries(rects)) {
    adb("shell", "cmd", "activity", "task", "resize", task, ...rect.map(String));
    await sleep(1100);
    nodes = dump();
    const items = DESTINATIONS.map((id) => railItem(nodes, id)).filter(Boolean);
    windows[name] = { rect, reported: logs().split("\n").filter((line) => line.startsWith("SYLF_WINDOW ")).at(-1), items: items.length, inside: items.every((n) => n.x1 >= rect[0] - 2 && n.x2 <= rect[2] + 2 && n.y2 <= rect[3] + 2), axis: items.length === 4 && items[0].cy === items[3].cy ? "horizontal" : "vertical" };
    screenshot(`window-${name}`);
  }
  check("popUpWindowResized", new Set(Object.values(windows).map((w) => w.reported)).size === 4, windows);
  check("railInsideEveryWindow", Object.values(windows).every((w) => w.items === 4 && w.inside));
  check("bottomBarOnlyWhenCompact", windows.wide.axis === "vertical" && windows.narrow.axis === "horizontal");
  check("resizeRemountsNothing", logs().split("SYLF_SPACE_MOUNT").length === before && mounts().length === homeBefore);
  // Scrolling is measured here because this window is tall and narrow. A full landscape page has almost nothing to scroll.
  const [left, top, right, bottom] = rects.medium;
  adb("shell", "cmd", "activity", "task", "resize", task, ...rects.medium.map(String));
  await sleep(1100);
  await link("space=home&home=today");
  const x = String(Math.round((left + right) / 2) + 60);
  const [low, high] = [String(Math.round(top + (bottom - top) * 0.85)), String(Math.round(top + (bottom - top) * 0.3))];
  adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
  for (let i = 0; i < 12; i++) { adb("shell", "input", "swipe", x, i % 2 ? high : low, x, i % 2 ? low : high, "350"); await sleep(250); }
  scrollFrames = gfx("scroll");
  await kill();
  await launch();
}

check("noCrashes", !adb("logcat", "-d", "-b", "crash").includes(PACKAGE));
adb("shell", "rm", "/sdcard/sylf-ui.xml");
const passed = Object.values(results).every((r) => (typeof r === "object" ? r.ok : r));
const report = { passed, results, windows, railFrames, scrollFrames, totalPssMb: pss ? Math.round(Number(pss) / 1024) : null, firstMounts, device: adb("shell", "getprop", "ro.product.model").trim(), wm: adb("shell", "wm", "size").trim(), fontScale: adb("shell", "settings", "get", "system", "font_scale").trim() };
fs.writeFileSync(path.join(out, "android-home-check.json"), JSON.stringify(report, null, 2));
console.log("SYLF_HOME_CHECK " + JSON.stringify({ passed, failed: Object.entries(results).filter(([, r]) => !(typeof r === "object" ? r.ok : r)).map(([name]) => name), total: Object.keys(results).length, railFrames, scrollFrames, totalPssMb: report.totalPssMb }));
process.exit(passed ? 0 : 1);
