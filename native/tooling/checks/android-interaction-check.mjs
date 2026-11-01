// Drives the design system with real input events on a connected Android device (adb taps, long presses, swipes, Back)
// and reads results from the accessibility tree. Covers what the web run cannot: touch gestures, the hardware Back stack,
// and preference persistence through SharedPreferences across a process kill. Usage: node android-interaction-check.mjs [--out=file]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const out = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = async (query) => { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://showcase?${query}"`, PACKAGE); await sleep(1300); };

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const node = m[0];
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(node)?.[1] ?? "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0];
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), checked: attr("checked") === "true", x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2), w: x2 - x1, h: y2 - y1 };
  });
}
const find = (nodes, test) => nodes.find((n) => test(n));
const has = (test) => Boolean(find(dump(), test));
const tap = (n) => adb("shell", "input", "tap", String(n.cx), String(n.cy));
const alive = () => adb("shell", "pidof", PACKAGE).trim().length > 0;
const results = {};
const check = (name, ok, detail) => { results[name] = detail === undefined ? ok : { ok, detail }; };

adb("logcat", "-c", "-b", "crash");
adb("shell", "am", "force-stop", PACKAGE);
await sleep(600);

// 1. Touch opens a dialog; hardware Back closes it and leaves the app running (the dismiss stack).
await link("chapter=overlays&theme=signature&mode=dark");
tap(find(dump(), (n) => n.desc === "Dialog"));
await sleep(900);
check("touchOpensDialog", has((n) => n.desc === "End this session?"));
adb("shell", "input", "keyevent", "4");
await sleep(700);
check("backClosesDialogOnly", !has((n) => n.desc === "End this session?") && alive());

// 2. A sheet opens on touch and is dismissed by dragging it away.
tap(find(dump(), (n) => n.desc === "Sheet"));
await sleep(1000);
const header = find(dump(), (n) => n.text === "Session details");
check("touchOpensSheet", Boolean(header));
if (header) {
  adb("shell", "input", "swipe", String(header.cx), String(header.cy), String(header.cx + 600), String(header.cy), "220");
  await sleep(900);
}
check("dragDismissesSheet", !has((n) => n.text === "Session details"));

// 3. Long press opens the context menu.
await link("chapter=overlays&theme=signature&mode=dark");
const area = find(dump(), (n) => n.desc === "Example item");
if (area) adb("shell", "input", "swipe", String(area.cx), String(area.cy), String(area.cx), String(area.cy), "700");
await sleep(900);
check("longPressOpensMenu", has((n) => n.text === "Duplicate"));
adb("shell", "input", "keyevent", "4");

// 4. Dragging a slider by touch moves its value (gesture handler on the UI thread).
await link("chapter=controls&theme=signature&mode=dark");
const percent = (nodes) => find(nodes, (n) => /^\d+%$/.test(n.text) && n.cy > 800)?.text;
const before = dump();
const slider = find(before, (n) => n.desc.startsWith("Volume") && n.w > 200);
check("sliderIsInAccessibilityTree", Boolean(slider));
const valueBefore = percent(before);
if (slider) {
  adb("shell", "input", "swipe", String(slider.x1 + Math.round(slider.w * 0.2)), String(slider.cy), String(slider.x1 + Math.round(slider.w * 0.85)), String(slider.cy), "450");
  await sleep(700);
}
const valueAfter = percent(dump());
check("touchDragMovesSlider", Boolean(slider) && Number.parseInt(valueAfter) >= 70 && valueAfter !== valueBefore, { before: valueBefore, after: valueAfter });

// 5. A chosen theme survives a process kill (SharedPreferences), restored before the first frame.
await link("chapter=studio&theme=signature&mode=dark");
tap(find(dump(), (n) => n.desc.startsWith("Voxel.")));
await sleep(900);
adb("shell", "am", "force-stop", PACKAGE);
await sleep(800);
await link("chapter=studio");
const tile = find(dump(), (n) => n.desc.startsWith("Voxel."));
check("themePersistsAcrossProcessKill", Boolean(tile?.checked));
await link("chapter=studio&theme=signature");

check("noCrashes", !adb("logcat", "-d", "-b", "crash").includes(PACKAGE));
adb("shell", "rm", "/sdcard/sylf-ui.xml");
const passed = Object.values(results).every((r) => (typeof r === "object" ? r.ok : r));
const report = { passed, results, device: adb("shell", "getprop", "ro.product.model").trim() };
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(passed ? 0 : 1);
