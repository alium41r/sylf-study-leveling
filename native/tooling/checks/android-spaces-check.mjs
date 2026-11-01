// Drives the Spaces shell on a connected Android device with real input (adb taps, swipes, hardware Back), then reads the
// result from the accessibility tree, which is also what TalkBack reads. Covers what the web run cannot: touch, the Back
// stack, restoration across a process kill and a recreated window. Captures every theme in both modes.
// Usage: node android-spaces-check.mjs [--out=dir] [--skip-themes]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-spaces-check");
const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screenshot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
const link = async (query, wait = 1200) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };
const launch = async () => { adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "1"); await sleep(1500); };
const kill = async () => { adb("shell", "am", "force-stop", PACKAGE); await sleep(700); };
const back = async (wait = 700) => { adb("shell", "input", "keyevent", "4"); await sleep(wait); };
const alive = () => adb("shell", "pidof", PACKAGE).trim().length > 0;
const logs = () => adb("logcat", "-d", "-v", "raw", "-s", "ReactNativeJS:V");

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const node = m[0];
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(node)?.[1] ?? "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0];
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), id: attr("resource-id"), selected: attr("selected") === "true", clickable: attr("clickable") === "true", x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2), w: x2 - x1, h: y2 - y1 };
  });
}
const find = (nodes, test) => nodes.find(test);
const tap = (node) => adb("shell", "input", "tap", String(node.cx), String(node.cy));
const isIcon = (n) => n.desc.startsWith("Spaces.");
const isTab = (name) => (n) => n.desc === name && n.clickable;
const showing = (nodes, text) => nodes.some((n) => n.text === text);
const tabCount = (nodes) => ["Home", "Workspace", "World"].filter((name) => nodes.some(isTab(name))).length;
const openBar = async () => { tap(find(dump(), isIcon)); await sleep(900); return dump(); };

const results = {};
const check = (name, ok, detail) => { results[name] = detail === undefined ? Boolean(ok) : { ok: Boolean(ok), detail }; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };

fs.mkdirSync(out, { recursive: true });
adb("logcat", "-c");
adb("logcat", "-c", "-b", "crash");
// A clean first launch needs no saved state. Only this test app's data is cleared.
adb("shell", "pm", "clear", PACKAGE);
await sleep(600);
await launch();

// 1. First launch.
let nodes = dump();
check("opensInHome", showing(nodes, "Today") && !showing(nodes, "Workspace"));
check("startsCollapsed", tabCount(nodes) === 0);
const icon = find(nodes, isIcon);
check("iconHasName", Boolean(icon), icon?.desc);
const density = Number(/(\d+)\s*$/.exec(adb("shell", "wm", "density").trim())?.[1] ?? 280) / 160;
check("iconTouchTargetAtLeast44", icon && icon.w / density >= 44 && icon.h / density >= 44, icon && { w: +(icon.w / density).toFixed(1), h: +(icon.h / density).toFixed(1) });
check("iconClearOfStatusBar", icon && icon.y1 / density >= 24, icon && { top: +(icon.y1 / density).toFixed(1) });
screenshot("device-first-launch");

// 2. Touch opens the bar; an outside tap and hardware Back both close it, and neither switches or leaves the app.
nodes = await openBar();
check("touchOpens", tabCount(nodes) === 3);
check("currentSpaceSelected", find(nodes, isTab("Home"))?.selected === true);
["Home", "Workspace", "World"].forEach((name) => { const tab = find(nodes, isTab(name)); check(`tab${name}TouchTarget`, tab && tab.h / density >= 44, tab && { w: +(tab.w / density).toFixed(1), h: +(tab.h / density).toFixed(1) }); });
screenshot("device-bar-open");
const [width, height] = [Math.max(...nodes.map((n) => n.x2)), Math.max(...nodes.map((n) => n.y2))];
adb("shell", "input", "tap", String(Math.round(width / 2)), String(Math.round(height / 2)));
await sleep(900);
nodes = dump();
check("outsideTapCloses", tabCount(nodes) === 0 && showing(nodes, "Today"));
await openBar();
await back();
nodes = dump();
check("backClosesBarOnly", tabCount(nodes) === 0 && showing(nodes, "Today") && alive());

// 3. Choosing a Space: the bar closes, the Space changes, and the old Space leaves the tree.
nodes = await openBar();
tap(find(nodes, isTab("Workspace")));
await sleep(1100);
nodes = dump();
check("tapSwitchesSpace", showing(nodes, "Workspace") && tabCount(nodes) === 0);
check("activeIndicatorInIconName", find(nodes, isIcon)?.desc.includes("Workspace"));
check("leftSpaceUnmounted", logs().includes("SYLF_SPACE_UNMOUNT home"));
screenshot("device-workspace");

// 4. World: the game's flow holds Back and replaces the switcher.
nodes = await openBar();
tap(find(nodes, isTab("World")));
await sleep(1100);
nodes = dump();
check("worldEntryHasSwitcher", Boolean(find(nodes, isIcon)) && showing(nodes, "Sylf World"));
screenshot("device-world-entry");
tap(find(nodes, (n) => n.desc === "Enter the world" || n.text === "Enter the world"));
await sleep(300);
await back(300);
check("backIgnoredWhileEntering", alive() && !find(dump(), isIcon));
await sleep(1100);
nodes = dump();
check("gameMenuReplacesIcon", Boolean(find(nodes, (n) => n.desc === "Game menu")) && !find(nodes, isIcon));
screenshot("device-world-playing");
await back(800);
nodes = dump();
check("backOpensGameMenu", showing(nodes, "Paused") && alive());
screenshot("device-world-paused");
await back(800);
nodes = dump();
check("backResumes", !showing(nodes, "Paused") && Boolean(find(nodes, (n) => n.desc === "Game menu")));
tap(find(nodes, (n) => n.desc === "Game menu"));
await sleep(800);
tap(find(dump(), (n) => n.desc === "Save and leave" || n.text === "Save and leave"));
await sleep(350);
screenshot("device-world-saving");
await sleep(2300);
nodes = dump();
check("leavingReturnsToPreviousSpace", showing(nodes, "Workspace") && Boolean(find(nodes, isIcon)));

// 5. Restoration: a killed process comes back in the same Space, and a killed game comes back at World's entry.
await kill();
await launch();
check("spaceSurvivesProcessKill", showing(dump(), "Workspace"));
nodes = await openBar();
tap(find(nodes, isTab("World")));
await sleep(1000);
tap(find(dump(), (n) => n.desc === "Enter the world" || n.text === "Enter the world"));
await sleep(1500);
await kill();
await launch();
nodes = dump();
check("killMidGameRestoresEntry", Boolean(find(nodes, (n) => n.desc === "Enter the world" || n.text === "Enter the world")) && Boolean(find(nodes, isIcon)));

// 6. Home's scroll position survives a Space change and a process kill.
await link("space=home&home=today");
adb("shell", "input", "swipe", String(Math.round(width / 2)), String(Math.round(height * 0.7)), String(Math.round(width / 2)), String(Math.round(height * 0.62)), "600");
await sleep(1200);
const scrolledY = find(dump(), (n) => n.text === "Quests")?.y1;
await kill();
await launch();
const restoredY = find(dump(), (n) => n.text === "Quests")?.y1;
check("homeScrollRestored", scrolledY !== undefined && restoredY === scrolledY, { scrolledY, restoredY });

// 7. The Showcase is reachable through the development entry and hands the Spaces back.
await link("space=workspace");
tap(find(dump(), (n) => n.desc.startsWith("Design System")));
await sleep(1500);
// The Showcase's breathing Markers keep the accessibility service from going idle, so this reads the log instead of the tree.
check("showcaseReplacesSpaces", logs().includes("SYLF_SPACE_UNMOUNT workspace"));
await back(1000);
check("backLeavesShowcase", showing(dump(), "Workspace") && alive());

// 8. Accessibility tree in each Space.
for (const space of ["home", "workspace", "world"]) {
  await link(`space=${space}`);
  nodes = dump();
  const unnamed = nodes.filter((n) => n.clickable && !n.desc && !n.text);
  check(`noUnnamedControls-${space}`, unnamed.length === 0, unnamed.length || undefined);
}

// 9. Every theme in both modes, by real taps.
if (!process.argv.includes("--skip-themes")) {
  for (const theme of THEMES) {
    for (const mode of ["light", "dark"]) {
      await link(`space=home&theme=${theme}&mode=${mode}`);
      screenshot(`theme-${theme}-${mode}-home-collapsed`);
      nodes = await openBar();
      screenshot(`theme-${theme}-${mode}-home-expanded`);
      tap(find(nodes, isTab("Workspace")));
      await sleep(900);
      screenshot(`theme-${theme}-${mode}-workspace`);
      nodes = await openBar();
      tap(find(nodes, isTab("World")));
      await sleep(1000);
      screenshot(`theme-${theme}-${mode}-world`);
    }
  }
}

// 10. Frames while the bar opens and Spaces change.
await link("space=home&theme=signature&mode=dark");
adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
const iconNode = find(dump(), isIcon);
for (let i = 0; i < 6; i++) {
  tap(iconNode);
  await sleep(650);
  nodes = dump();
  tap(find(nodes, isTab(i % 2 ? "Home" : "Workspace")));
  await sleep(900);
}
const gfx = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
const stat = (label) => new RegExp(`${label}:\\s*([\\d.]+)`).exec(gfx)?.[1];
const frames = { total: stat("Total frames rendered"), janky: /Janky frames: (\d+) \(([\d.]+)%\)/.exec(gfx)?.slice(1), p50: stat("50th percentile"), p90: stat("90th percentile"), p95: stat("95th percentile"), p99: stat("99th percentile") };
const pss = /TOTAL PSS:\s+(\d+)/.exec(adb("shell", "dumpsys", "meminfo", PACKAGE))?.[1];

// 11. The switcher must cost nothing to use. Each open and close is a real animation, so memory must not climb with them:
// a shadow on the growing plate once cost 137 MB of GPU render targets in 30 opens.
const memory = () => {
  const text = adb("shell", "dumpsys", "meminfo", PACKAGE);
  const mb = (name) => Math.round(Number(new RegExp(`${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0) / 1024);
  return { pss: mb("TOTAL PSS"), graphics: mb("Graphics"), native: mb("Native Heap") };
};
await kill();
await launch();
await link("space=home&theme=signature&mode=dark");
const barIcon = find(dump(), isIcon);
const barRuns = [memory()];
for (let round = 0; round < 3; round++) {
  for (let i = 0; i < 10; i++) { tap(barIcon); await sleep(750); tap(barIcon); await sleep(650); }
  barRuns.push(memory());
}
check("switcherUseDoesNotClimb", barRuns[3].pss - barRuns[1].pss < 15 && barRuns[3].graphics - barRuns[0].graphics < 12, barRuns);

// 12. A real pop-up window, resized live. Nothing here touches a device setting. Each size must keep the bar inside the
// window, and resizing must not remount the Space.
await kill();
adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "5");
await sleep(1800);
const task = /#(\d+) type=standard A=\d+:app\.sylf\.client/.exec(adb("shell", "dumpsys", "activity", "activities"))?.[1];
const horizontal = width > height;
const landscapeRects = { wide: [150, 90, 1950, 1300], medium: [150, 90, 1450, 1300], compact: [150, 90, 1000, 1300], narrow: [150, 90, 760, 1300] };
const portraitRects = { wide: [40, 150, 1400, 1300], medium: [40, 150, 1200, 1500], compact: [40, 150, 860, 1600], narrow: [40, 150, 620, 1400] };
const windows = {};
const mountsBefore = logs().split("SYLF_SPACE_MOUNT").length;
for (const [name, rect] of Object.entries(horizontal ? landscapeRects : portraitRects)) {
  adb("shell", "cmd", "activity", "task", "resize", task, ...rect.map(String));
  await sleep(1100);
  nodes = await openBar();
  const tabs = ["Home", "Workspace", "World"].map((label) => find(nodes, isTab(label)));
  const reported = logs().split("\n").filter((line) => line.startsWith("SYLF_WINDOW ")).at(-1);
  windows[name] = { rect, reported, tabs: tabs.filter(Boolean).length, right: Math.max(...tabs.filter(Boolean).map((tab) => tab.x2)), labelled: tabs.every((tab) => tab?.w / density > 60) };
  screenshot(`window-${name}`);
  await back();
}
check("popUpWindowResized", new Set(Object.values(windows).map((w) => w.reported)).size === 4, windows);
check("barInsideEveryWindow", Object.values(windows).every((w) => w.tabs === 3 && w.right <= w.rect[2]));
check("resizeDoesNotRemountSpace", logs().split("SYLF_SPACE_MOUNT").length === mountsBefore);
await kill();
await launch();

check("noCrashes", !adb("logcat", "-d", "-b", "crash").includes(PACKAGE));
adb("shell", "rm", "/sdcard/sylf-ui.xml");
const passed = Object.values(results).every((r) => (typeof r === "object" ? r.ok : r));
const report = { passed, results, windows, switcherMemory: barRuns, frames, totalPssMb: pss ? Math.round(Number(pss) / 1024) : null, device: adb("shell", "getprop", "ro.product.model").trim(), wm: adb("shell", "wm", "size").trim(), fontScale: adb("shell", "settings", "get", "system", "font_scale").trim() };
fs.writeFileSync(path.join(out, "android-spaces-check.json"), JSON.stringify(report, null, 2));
console.log("SYLF_SPACES_CHECK " + JSON.stringify({ passed, failed: Object.entries(results).filter(([, r]) => !(typeof r === "object" ? r.ok : r)).map(([name]) => name), total: Object.keys(results).length, frames, totalPssMb: report.totalPssMb }));
process.exit(passed ? 0 : 1);
