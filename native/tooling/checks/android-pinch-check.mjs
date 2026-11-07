// A real two-finger pinch on a connected tablet, sent through a virtual touchscreen from adb, which `adb input` cannot do.
// The check is the promise a pinch makes: whatever was between the fingers stays between them, so a window's title bar ends where
// the zoom says it must. Two fingers on a tool that zooms its own content must move nothing at all. A note's own pinch promises that
// what it shows while the fingers move is what stays when they lift (nothing jumps), and that zooming out draws the page beyond what
// was on screen. Usage: node tooling/checks/android-pinch-check.mjs [--out=<file>] [--only=<name prefix>]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { centroid, decodePng, difference } from "./screen-png.mjs";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const out = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
// --shots=<dir> keeps each note pinch's screenshots: while the fingers are down, and once they have lifted.
const shots = process.argv.find((a) => a.startsWith("--shots="))?.split("=")[1];
const keep = (name, image) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, `${name}.png`), image.png); };
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const link = async (query, wait = 1300) => { adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?${query}"`, PACKAGE); await sleep(wait); };

// The touchscreen reports its own coordinates, in the tablet's natural (portrait) orientation, so a tablet held another way needs them turned.
const displays = adb("shell", "dumpsys", "window", "displays");
const ROTATION = Number(/mCurrentRotation=ROTATION_(\d+)/.exec(displays)?.[1] ?? 0);
const [WIDTH, HEIGHT] = /cur=(\d+)x(\d+)/.exec(displays).slice(1).map(Number);
const PORTRAIT = ROTATION === 0 || ROTATION === 180;
const [NATURAL_WIDTH, NATURAL_HEIGHT] = PORTRAIT ? [WIDTH, HEIGHT] : [HEIGHT, WIDTH];
const raw = (x, y) => {
  x = Math.round(x); y = Math.round(y);
  return ROTATION === 90 ? [NATURAL_WIDTH - 1 - y, x] : ROTATION === 180 ? [WIDTH - 1 - x, HEIGHT - 1 - y] : ROTATION === 270 ? [y, NATURAL_HEIGHT - 1 - x] : [x, y];
};

// A virtual touchscreen, which Android's own `uinput` tool registers and removes with its process. Nothing stays on the tablet.
const axis = (code, maximum) => ({ code, info: { value: 0, minimum: 0, maximum, fuzz: 0, flat: 0, resolution: 0 } });
const REGISTER = { id: 1, command: "register", name: "Sylf Pinch Check", vid: 0x18d1, pid: 0x5359, bus: "usb", configuration: [
  { type: "UI_SET_EVBIT", data: ["EV_KEY", "EV_ABS"] }, { type: "UI_SET_KEYBIT", data: ["BTN_TOUCH"] },
  { type: "UI_SET_ABSBIT", data: ["ABS_MT_SLOT", "ABS_MT_TOUCH_MAJOR", "ABS_MT_POSITION_X", "ABS_MT_POSITION_Y", "ABS_MT_TRACKING_ID"] },
  { type: "UI_SET_PROPBIT", data: ["INPUT_PROP_DIRECT"] },
], abs_info: [axis("ABS_MT_SLOT", 9), axis("ABS_MT_TOUCH_MAJOR", 255), axis("ABS_MT_POSITION_X", NATURAL_WIDTH - 1), axis("ABS_MT_POSITION_Y", NATURAL_HEIGHT - 1), axis("ABS_MT_TRACKING_ID", 65535)] };
const abs = (code, value) => ["EV_ABS", code, value];
const finger = (slot, x, y) => { const [rawX, rawY] = raw(x, y); return [...abs("ABS_MT_SLOT", slot), ...abs("ABS_MT_POSITION_X", rawX), ...abs("ABS_MT_POSITION_Y", rawY)]; };
const inject = (events) => JSON.stringify({ id: 1, command: "inject", events: [...events, "EV_SYN", "SYN_REPORT", 0] });
const wait = (duration) => JSON.stringify({ id: 1, command: "delay", duration });

/** Fingers open or close about a point. `lift` takes one finger away first, as a hand does, so the other ends the gesture alone. `hold` keeps both down at the end. */
function pinchScript({ cx, cy, from, to, steps = 40, angle = 0.6, lift = false, hold = 0 }) {
  const at = (span) => [[cx - (Math.cos(angle) * span) / 2, cy - (Math.sin(angle) * span) / 2], [cx + (Math.cos(angle) * span) / 2, cy + (Math.sin(angle) * span) / 2]];
  const [a, b] = at(from);
  const lines = [JSON.stringify(REGISTER), wait(900)];
  lines.push(inject([...abs("ABS_MT_SLOT", 0), ...abs("ABS_MT_TRACKING_ID", 9001), ...abs("ABS_MT_TOUCH_MAJOR", 6), ...finger(0, a[0], a[1]).slice(3), ...abs("ABS_MT_SLOT", 1), ...abs("ABS_MT_TRACKING_ID", 9002), ...abs("ABS_MT_TOUCH_MAJOR", 6), ...finger(1, b[0], b[1]).slice(3), "EV_KEY", "BTN_TOUCH", 1]), wait(40));
  for (let step = 1; step <= steps; step++) {
    const [p, q] = at(from + ((to - from) * step) / steps);
    lines.push(inject([...finger(0, p[0], p[1]), ...finger(1, q[0], q[1])]), wait(12));
  }
  const [end] = at(to);
  if (hold) lines.push(wait(hold));
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
/** A pinch whose fingers stay down for `hold` ms at the end, with a screenshot taken while they are down. Resolves with that screenshot once they lift. */
async function pinchHeld(options, hold = 2500) {
  fs.writeFileSync("/tmp/sylf-pinch.json", pinchScript({ ...options, hold }) + "\n");
  adb("push", "/tmp/sylf-pinch.json", "/data/local/tmp/sylf-pinch.json");
  const fingers = spawn(ADB, ["shell", "uinput", "/data/local/tmp/sylf-pinch.json"], { stdio: "ignore" });
  const done = new Promise((resolve) => fingers.on("exit", resolve));
  // Registering the touchscreen takes 900 ms and the fingers about a second to travel; the screenshot falls inside the hold.
  await sleep(1900 + hold / 2);
  const held = screen();
  await done;
  return held;
}
const screen = () => { const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }); return Object.assign(decodePng(png), { png }); };

function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/sylf-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/sylf-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const attr = (name) => new RegExp(` ${name}="([^"]*)"`).exec(m[0])?.[1] ?? "";
    const [x1, y1, x2, y2] = (/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds")) ?? [0, 0, 0, 0, 0]).slice(1).map(Number);
    return { desc: attr("content-desc"), text: attr("text"), x1, y1, x2, y2 };
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

const results = [], skipped = [];
const wanted = (name) => !only || name.startsWith(only);
/** `at` chooses the middle of the pinch from where the window is. `still` means the pinch is the tool's: nothing may move. */
const scenario = async (name, tool, at, { from, to, lift = false, still = false }) => {
  if (!wanted(name)) return;
  // The window positions below are portrait ones.
  if (!PORTRAIT) { skipped.push(name); return; }
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

// A note's pinch, on a note of its own, in any orientation. The fingers stay down while a screenshot is taken, then lift; the page as
// it was previewed and as it was laid out must match, and the blue cross drawn on it must not move.
const tap = (node) => adb("shell", "input", "tap", String(Math.round((node.x1 + node.x2) / 2)), String(Math.round((node.y1 + node.y2) / 2)));
const labelled = (label) => dump().find((n) => n.desc.toLowerCase() === label.toLowerCase() || n.text.toLowerCase() === label.toLowerCase());
const tapLabel = async (label, wait = 900) => { const node = labelled(label); if (!node) throw new Error(`nothing labelled ${label}`); tap(node); await sleep(wait); };
const blue = ([r, g, b]) => b > 150 && b - r > 50 && b - g > 30;
const light = ([r, g, b]) => r + g + b > 600;
/** Rows of paper in one column of the page area: a page cut off where the screen ended has fewer. */
const paperRows = (image, x, area) => { let n = 0; for (let y = area.y1; y < area.y2; y++) if (light(image.pixel(x, y))) n++; return n; };
/** The note's zoom, read beside its Zoom out button. */
const noteZoom = () => { const nodes = dump(), out = nodes.find((n) => n.desc === "Zoom out"); return Number(/^(\d+)%$/.exec(nodes.find((n) => out && /^\d+%$/.test(n.text) && n.y1 >= out.y1 - 10 && n.y2 <= out.y2 + 10)?.text ?? "")?.[1]); };

async function notePage() {
  const names = ["note-page-out-top", "note-page-in-aside", "note-page-out-scrolled", "note-page-margin-in", "note-page-two-pages"].filter(wanted);
  if (!names.length) return;
  // No theme here: ink and paper are told apart by colour on any theme, and the owner's own theme stays as it is.
  await link("space=workspace&wsClear=1&wsOpen=notes", 4000);
  await tapLabel("New", 1200);
  adb("shell", "input", "text", "Pinch%scheck");
  // Enter creates it: in landscape the keyboard can cover the Create button.
  adb("shell", "input", "keyevent", "KEYCODE_ENTER");
  await sleep(3000);
  if (labelled("Write")) await tapLabel("Write", 900);
  // Full screen gives the toolbar room for every pen control, in either orientation.
  if (labelled("Full screen")) await tapLabel("Full screen", 3000);
  if (labelled("Bold line")) await tapLabel("Bold line", 400);
  // The page, found on the screen: the accessibility tree can lag a switch to Full screen by seconds, so its positions are not used.
  const findPage = () => {
    const page = screen(), middle = Math.round(WIDTH / 2);
    // Below the toolbar, whose icons are light too.
    let top = Math.round(HEIGHT * 0.06);
    while (top < HEIGHT && !light(page.pixel(middle, top))) top++;
    let left = 0, right = WIDTH - 1, bottom = top + 60;
    while (left < middle && !light(page.pixel(left, top + 60))) left++;
    while (right > middle && !light(page.pixel(right, top + 60))) right--;
    while (bottom < HEIGHT - 1 && light(page.pixel(left + 30, bottom))) bottom++;
    return top < HEIGHT * 0.5 && right - left > WIDTH * 0.3 ? { x1: left + 4, x2: right - 4, y1: top + 4, y2: bottom - 4 } : null;
  };
  // A blue cross to follow, drawn in the middle of the page. A tap can miss while the note is still settling, so the colour is checked
  // on the page and chosen again if missed, and the page is found again afterwards.
  let area = findPage();
  for (let attempt = 0; attempt < 3 && area && !centroid(screen(), area, blue).n; attempt++) {
    await tapLabel("Colour #345bc6", 1500);
    area = findPage();
    if (!area) break;
    const x = Math.round((area.x1 + area.x2) / 2), y = Math.round(area.y1 + (area.y2 - area.y1) * 0.45);
    adb("shell", "input", "stylus", "swipe", String(x - 90), String(y), String(x + 90), String(y), "300");
    adb("shell", "input", "stylus", "swipe", String(x), String(y - 90), String(x), String(y + 90), "300");
    await sleep(900);
  }
  area = findPage();
  const start = area && centroid(screen(), area, blue);
  if (!area || !start.n) { results.push({ name: "note-page", ok: false, error: "no page with the cross on the screen" }); return; }
  const w = area.x2 - area.x1, h = area.y2 - area.y1, cx = start.x, cy = start.y;
  // Each pinch is placed from where the cross is, so it stays on the screen: out about it at the top of the note, in beside it, then
  // out again from a scrolled, zoomed-in page to one narrower than the view.
  const steps = [
    { name: "note-page-out-top", at: () => ({ cx, cy }), from: 0.3 * w, to: 0.15 * w, zoomed: (r) => r < 0.7 },
    { name: "note-page-in-aside", at: (cross) => ({ cx: cross.x + 0.04 * w, cy: cross.y + 0.04 * h }), from: 0.1 * w, to: 0.3 * w, zoomed: (r) => r > 1.5 },
    { name: "note-page-out-scrolled", at: (cross) => ({ cx: cross.x - 0.1 * w, cy: cross.y }), from: 0.3 * w, to: 0.18 * w, zoomed: (r) => r < 0.75 },
  ];
  let cross = { x: cx, y: cy };
  for (const step of steps) {
    const zoomBefore = noteZoom(), before = screen();
    adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
    const held = await pinchHeld({ ...step.at(cross), from: step.from, to: step.to });
    await sleep(1200);
    const pinchFrames = frames(), landed = screen(), zoomAfter = noteZoom();
    keep(`${step.name}-0-before`, before); keep(`${step.name}-1-held`, held); keep(`${step.name}-2-landed`, landed);
    const a = centroid(held, area, blue), b = centroid(landed, area, blue);
    if (b.n) cross = b;
    const jumpPx = a.n && b.n ? Math.round(Math.hypot(a.x - b.x, a.y - b.y)) : null;
    const changed = +(difference(held, landed, area, 60, 3) * 100).toFixed(2);
    // A column beside the cross: while zooming out it must hold as much paper as the laid-out page does.
    const column = Math.min(area.x2 - 1, Math.round(b.n ? b.x + 120 : cx + 120));
    const paper = { held: paperRows(held, column, area), landed: paperRows(landed, column, area) };
    const ratio = zoomAfter / zoomBefore, moved = +(difference(before, landed, area) * 100).toFixed(2);
    // The zoom label is read where the toolbar shows it (in portrait it can be off the edge); otherwise the page must visibly change.
    const zoomed = Number.isFinite(ratio) ? step.zoomed(ratio) : moved > 10;
    const entry = { name: step.name, zoomBefore, zoomAfter, zoomRatio: +ratio.toFixed(3), movedPercent: moved, cross: { held: a, landed: b }, jumpPx, changedPercent: changed, paper, frames: pinchFrames,
      ok: zoomed && jumpPx !== null && jumpPx <= 6 && changed <= 1 && paper.held >= paper.landed - 8 };
    if (wanted(step.name)) { results.push(entry); console.log(JSON.stringify(entry)); }
  }

  // Two fingers zoom wherever they land, not only on a page: first in the margin beside a page narrower than the view.
  const record = (entry) => { if (wanted(entry.name)) { results.push(entry); console.log(JSON.stringify(entry)); } };
  const measured = async (name, at, from, to) => {
    const zoomBefore = noteZoom(), before = screen();
    adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
    const held = await pinchHeld({ ...at, from, to });
    await sleep(1200);
    const landed = screen(), zoomAfter = noteZoom();
    keep(`${name}-0-before`, before); keep(`${name}-1-held`, held); keep(`${name}-2-landed`, landed);
    const zoomRatio = zoomAfter / zoomBefore, movedPercent = +(difference(before, landed, area) * 100).toFixed(2);
    return { name, zoomBefore, zoomAfter, zoomRatio: +zoomRatio.toFixed(3), movedPercent, zoomedIn: Number.isFinite(zoomRatio) ? zoomRatio > 1.4 : movedPercent > 10, changedPercent: +(difference(held, landed, area, 60, 3) * 100).toFixed(2), frames: frames(), held, landed };
  };
  // The screenshots stay out of the report.
  const report = (entry, ok) => { const rest = { ...entry }; delete rest.held; delete rest.landed; record({ ...rest, ok }); };
  pinch({ cx, cy, from: 0.3 * w, to: 0.08 * w });
  await sleep(1500);
  const margin = await measured("note-page-margin-in", { cx: area.x1 + 0.12 * w, cy: area.y1 + 0.5 * h }, 0.06 * w, 0.18 * w);
  report(margin, margin.zoomedIn && margin.changedPercent <= 1);

  // Then one finger on each of two pages, across the gap between them. Both pages' ink must still show once the pinch lands (a page
  // whose surface had just appeared used to stay blank until its ink next changed).
  if (!wanted("note-page-two-pages")) return;
  // A second page comes from Insert, which a portrait toolbar can leave off the edge of the screen.
  try {
    await tapLabel("Insert a picture, PDF or page", 900);
    await tapLabel("Blank page", 1500);
  } catch { skipped.push("note-page-two-pages"); adb("shell", "input", "keyevent", "KEYCODE_BACK"); return; }
  pinch({ cx, cy: area.y1 + 0.3 * h, from: 0.3 * w, to: 0.08 * w });
  await sleep(1500);
  // The gap: a band of the backdrop between paper above and below, down the middle of the page.
  const gapIn = (image) => {
    let paperAbove = false, run = 0;
    for (let y = area.y1; y < area.y2; y++) {
      if (light(image.pixel(cx, y))) { if (paperAbove && run >= 4) return y - Math.round(run / 2); paperAbove = true; run = 0; } else if (paperAbove) run++;
    }
    return null;
  };
  let gap = gapIn(screen());
  for (let tries = 0; tries < 6 && (gap === null || gap < area.y1 + 0.25 * h || gap > area.y2 - 0.25 * h); tries++) {
    const toward = gap !== null && gap < area.y1 + 0.25 * h ? 1 : -1;
    adb("shell", "input", "touchscreen", "swipe", String(cx), String(Math.round(area.y1 + 0.5 * h)), String(cx), String(Math.round(area.y1 + 0.5 * h + toward * 0.25 * h)), "500");
    await sleep(1200);
    gap = gapIn(screen());
  }
  if (gap === null) { record({ name: "note-page-two-pages", ok: false, error: "no gap between pages on screen" }); return; }
  for (const dy of [-70, 70]) adb("shell", "input", "stylus", "swipe", String(cx - 120), String(gap + dy), String(cx + 120), String(gap + dy), "300");
  await sleep(900);
  const two = await measured("note-page-two-pages", { cx, cy: gap }, 0.12 * w, 0.3 * w);
  const landedGap = gapIn(two.landed);
  const inkAbove = landedGap === null ? 0 : centroid(two.landed, { ...area, y2: landedGap }, blue).n;
  const inkBelow = landedGap === null ? 0 : centroid(two.landed, { ...area, y1: landedGap }, blue).n;
  report({ ...two, gap, landedGap, inkAbove, inkBelow }, two.zoomedIn && two.changedPercent <= 1 && inkAbove > 20 && inkBelow > 20);
}
await notePage();

const failed = results.filter((entry) => !entry.ok).map((entry) => entry.name);
const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
const report = { passed: failed.length === 0 && !crashed, rotation: ROTATION, failed, skipped, crashed, results };
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); }
console.log("SYLF_PINCH_CHECK " + JSON.stringify({ passed: report.passed, failed, skipped }));
process.exit(report.passed ? 0 : 1);
