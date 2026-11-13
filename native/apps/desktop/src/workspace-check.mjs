// @ts-check
// Automated verification of Workspace in the real Electron window (run with --sylf-workspace-check). Drives the canvas, the
// Command Center and the windows with real mouse, wheel, keyboard and two-finger touch events, checks restoration, walks window
// sizes and themes, and measures frames and retention. Prints one SYLF_WORKSPACE_CHECK line and exits non-zero on any failure. Evidence goes to
// SYLF_WORKSPACE_CHECK_OUT. SYLF_WORKSPACE_CHECK_ONLY=<group,group> runs part of it.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const TOOL_IDS = ["notes", "pdfs", "whiteboard", "sylvie", "timer", "calculator", "audio", "resources"];
// Audio plays from the timer dock, so Workspace's shelf no longer offers it; a saved Audio window still opens.
const SHELF_TOOLS = TOOL_IDS.filter((tool) => tool !== "audio");
const WINDOWS = [{ name: "wide", width: 1680, height: 1000 }, { name: "expanded", width: 1280, height: 820 }, { name: "medium", width: 820, height: 900 }, { name: "short", width: 900, height: 480 }, { name: "compact", width: 480, height: 800 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
const GROUPS = (process.env.SYLF_WORKSPACE_CHECK_ONLY ?? "").split(",").filter(Boolean);
const runs = (/** @type {string} */ group) => !GROUPS.length || GROUPS.includes(group);

/** @param {Electron.BrowserWindow} window */
export async function runWorkspaceCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_WORKSPACE_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
    app.exit(1);
  }
}

/** @param {Electron.BrowserWindow} window */
async function runChecks(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_WORKSPACE_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-workspace-check");
  fs.mkdirSync(out, { recursive: true });
  window.setMinimumSize(320, 400);
  /** @type {string[]} */
  const consoleErrors = [];
  contents.on("console-message", (/** @type {any} */ event) => { if (event?.level === "error" || event?.level === 3) consoleErrors.push(String(event?.message).slice(0, 300)); });

  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  const capture = async (/** @type {string} */ name, /** @type {Electron.Rectangle | undefined} */ area = undefined) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const image = await contents.capturePage(area);
        if (!image.isEmpty()) return fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG()), image;
      } catch { /* retry */ }
      contents.invalidate();
      await sleep(400);
    }
    throw new Error(`capturePage failed for ${name}`);
  };
  const shot = async (/** @type {string} */ name) => { await capture(name); };
  const key = async (/** @type {string} */ keyCode, /** @type {any[]} */ modifiers = []) => {
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    const char = keyCode === "Return" ? "\r" : keyCode === "Space" ? " " : keyCode.length === 1 ? keyCode : null;
    if (char) contents.sendInputEvent({ type: "char", keyCode: char, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(90);
  };
  const open = async (/** @type {string} */ query) => {
    const ready = new Promise((resolve) => {
      const listener = (/** @type {any} */ event) => { if (String(event?.message).startsWith("SYLF_FOUNDATION ")) { contents.off("console-message", listener); resolve(true); } };
      contents.on("console-message", listener);
    });
    await contents.loadURL(`${APP_ORIGIN}/${query ? `?${query}` : ""}`).catch(async (/** @type {any} */ error) => {
      // A load that lands while the last page is still unloading is aborted by Chromium, and says nothing about the app.
      if (error?.errno !== -3) throw error;
      await sleep(500);
      await contents.loadURL(`${APP_ORIGIN}/${query ? `?${query}` : ""}`);
    });
    await Promise.race([ready, sleep(8000)]);
    await sleep(700);
    await js("document.fonts.ready.then(() => true)");
  };
  const click = async (/** @type {{ x: number, y: number }} */ point, /** @type {"left" | "right"} */ button = "left") => {
    contents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    contents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button, clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button, clickCount: 1 });
    await sleep(120);
  };
  const center = (/** @type {string} */ selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const rect = (/** @type {string} */ selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const clickOn = async (/** @type {string} */ selector, /** @type {"left" | "right"} */ button = "left") => {
    let point = await center(selector);
    for (let wait = 0; wait < 40 && !point; wait++) { await sleep(100); point = await center(selector); }
    if (!point) throw new Error(`nothing at ${selector}`);
    await click(point, button);
  };
  const drag = async (/** @type {{ x: number, y: number }} */ from, /** @type {{ x: number, y: number }} */ to, steps = 14, stepMs = 16) => {
    contents.sendInputEvent({ type: "mouseMove", x: from.x, y: from.y });
    contents.sendInputEvent({ type: "mouseDown", x: from.x, y: from.y, button: "left", clickCount: 1 });
    await sleep(40);
    for (let step = 1; step <= steps; step++) {
      contents.sendInputEvent({ type: "mouseMove", x: Math.round(from.x + ((to.x - from.x) * step) / steps), y: Math.round(from.y + ((to.y - from.y) * step) / steps), modifiers: ["leftbuttondown"] });
      await sleep(stepMs);
    }
    await sleep(120);
    contents.sendInputEvent({ type: "mouseUp", x: to.x, y: to.y, button: "left", clickCount: 1 });
    await sleep(200);
  };
  const wheel = async (/** @type {{ x: number, y: number }} */ point, /** @type {number} */ deltaX, /** @type {number} */ deltaY, /** @type {any[]} */ modifiers = []) => {
    contents.sendInputEvent({ type: "mouseWheel", x: point.x, y: point.y, deltaX: -deltaX, deltaY: -deltaY, canScroll: true, modifiers });
    await sleep(40);
  };
  const stored = () => js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1') ?? 'null')`);
  const workspace = async () => (await stored())?.snapshots?.workspace ?? null;
  // A flung canvas coasts before it commits, so this waits for the saved camera to stop changing.
  const settled = async (ms = 320) => {
    await sleep(ms);
    let last = JSON.stringify((await workspace())?.camera ?? null);
    for (let wait = 0; wait < 40; wait++) {
      await sleep(150);
      const next = JSON.stringify((await workspace())?.camera ?? null);
      if (next === last && next !== "null") break;
      last = next;
    }
    return workspace();
  };
  const has = (/** @type {string} */ selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);
  const count = (/** @type {string} */ selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1 || document.documentElement.scrollHeight > window.innerHeight + 1`);
  const plant = async (/** @type {string | null} */ record) => {
    await contents.loadURL(`${APP_ORIGIN}/metadata.json`);
    await js(`${record === null ? "localStorage.removeItem('sylf.native.spaces.v1')" : `localStorage.setItem('sylf.native.spaces.v1', ${JSON.stringify(record)})`}; true`);
  };
  const fresh = async (/** @type {string} */ query) => { await plant(null); await open(`space=workspace&${query}`); };
  const resize = async (/** @type {number} */ width, /** @type {number} */ height) => { window.setContentSize(width, height); await sleep(420); };
  const dock = (/** @type {string} */ tool) => `[data-testid=dock-${tool}]`;
  const windowSel = (/** @type {string} */ id) => `[data-testid=workspace-window-${id}]`;
  const openIds = async () => (await workspace())?.windows?.filter((/** @type {any} */ w) => !w.minimized).map((/** @type {any} */ w) => w.id) ?? [];

  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, boolean>} */
  const checks = {};
  const env = { contents, js, shot, capture, key, open, click, center, rect, clickOn, drag, wheel, stored, workspace, settled, has, count, overflow, plant, fresh, resize, dock, windowSel, openIds, results, checks, sleep, out, consoleErrors };

  await resize(1280, 820);
  if (runs("canvas")) await canvasGroup(env);
  if (runs("dots")) await dotsGroup(env);
  if (runs("pinch")) await pinchGroup(env);
  if (runs("dock")) await dockGroup(env);
  if (runs("tools")) await toolsGroup(env);
  if (runs("windows")) await windowsGroup(env);
  if (runs("layouts")) await layoutsGroup(env);
  if (runs("restore")) await restoreGroup(env);
  if (runs("lifecycle")) await lifecycleGroup(env);
  if (runs("keys")) await keysGroup(env);
  if (runs("compact")) await compactGroup(env);
  if (runs("a11y")) await accessibilityGroup(env);
  if (runs("contrast")) await contrastGroup(env);
  if (runs("frames")) await framesGroup(env);
  if (runs("sizes")) await sizesGroup(env);
  if (runs("themes")) await themesGroup(env);
  if (runs("retention")) await retentionGroup(env);
  if (runs("probe")) await probeGroup(env);
  if (runs("homescroll")) await homeScrollGroup(env);
  if (runs("notes")) await notesGroup(env);
  if (runs("gallery")) await galleryGroup(env);
  if (GROUPS.includes("visual")) await visualGroup(env);
  else if (GROUPS.includes("visual-scroll")) await visualGroup(env, true);

  checks.noConsoleErrors = consoleErrors.length === 0;
  results.consoleErrors = consoleErrors.slice(0, 10);
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
  const summary = { passed: failed.length === 0, total: Object.keys(checks).length, failed };
  fs.writeFileSync(path.join(out, "electron-workspace-check.json"), JSON.stringify({ summary, checks, results }, null, 2));
  console.log("SYLF_WORKSPACE_CHECK " + JSON.stringify(summary));
  app.exit(summary.passed ? 0 : 1);
}

/** @param {any} t */
async function canvasGroup(t) {
  const { checks, results } = t;
  await t.fresh("");
  await t.shot("canvas-empty");
  checks.opensWithEmptyCanvas = (await t.has("[data-testid=workspace-canvas]")) && !(await t.has("[data-testid^=workspace-window-]"));
  checks.noPageOverflow = !(await t.overflow());
  const mid = { x: 640, y: 300 };
  const view = await t.js(`({ width: innerWidth, height: innerHeight })`);
  const under = (/** @type {any} */ camera) => ({ x: camera.x + (mid.x - view.width / 2) / camera.zoom, y: camera.y + (mid.y - view.height / 2) / camera.zoom });
  // Dragging empty canvas pans, by exactly what the pointer moved.
  await t.drag(mid, { x: 440, y: 200 });
  let state = await t.settled(900);
  results.afterPan = state?.camera;
  checks.dragPansCanvas = state?.camera.x > 2800 + 150 && state?.camera.y > 1820 + 60;
  // Wheel with two fingers pans, and the page itself does not scroll.
  const before = state.camera;
  for (let i = 0; i < 8; i++) await t.wheel(mid, 40, 20);
  state = await t.settled(400);
  checks.wheelPans = Math.abs(state.camera.x - before.x - 320) < 8 && Math.abs(state.camera.y - before.y - 160) < 8;
  // A pinch arrives as a control wheel, and the point under the pointer stays still.
  const anchorWorld = under(state.camera);
  for (let i = 0; i < 10; i++) await t.wheel(mid, 0, -6, ["control"]);
  state = await t.settled(400);
  results.afterPinch = state.camera;
  const anchorAfter = under(state.camera);
  checks.pinchZooms = state.camera.zoom > 1.1;
  checks.pinchHoldsPoint = Math.hypot(anchorAfter.x - anchorWorld.x, anchorAfter.y - anchorWorld.y) < 2;
  // Bounds: as far as anyone can drag, the camera stops at the world's edge.
  await t.clickOn("[data-testid=canvas-reset]");
  await t.sleep(1400);
  for (let i = 0; i < 40; i++) await t.wheel(mid, -400, -300);
  state = await t.settled(400);
  results.atCorner = state.camera;
  checks.panStopsAtWorldEdge = state.camera.x === view.width / 2 - 120 && state.camera.y === view.height / 2 - 120;
  await t.shot("canvas-world-corner");
  for (let i = 0; i < 40; i++) await t.wheel(mid, 0, 200, ["control"]);
  state = await t.settled(400);
  checks.zoomStopsAtMinimum = state.camera.zoom === 0.2;
  await t.shot("canvas-zoomed-out");
  for (let i = 0; i < 60; i++) await t.wheel(mid, 0, -200, ["control"]);
  state = await t.settled(400);
  checks.zoomStopsAtMaximum = state.camera.zoom === 2;
  await t.shot("canvas-zoomed-in");
  // Controls.
  await t.clickOn("[data-testid=canvas-reset]");
  state = await t.settled(800);
  checks.resetViewReturnsHome = state.camera.x === 2800 && state.camera.y === 1820 && state.camera.zoom === 1;
  await t.clickOn("[data-testid=canvas-fit]");
  state = await t.settled(800);
  checks.fitShowsWholeWorldWhenEmpty = state.camera.zoom < 0.3;
  // The camera survives a reload and a Space change.
  await t.clickOn("[data-testid=canvas-reset]");
  await t.sleep(600);
  await t.drag(mid, { x: 500, y: 240 });
  const saved = (await t.settled(900)).camera;
  await t.open("");
  const restored = await t.workspace();
  checks.cameraSurvivesReload = Math.abs(restored.camera.x - saved.x) < 1 && Math.abs(restored.camera.y - saved.y) < 1;
  await t.shot("canvas-restored");
}

/**
 * Every dot in a square of the screen: how many there are, how much light the median one gives, and the median gap between
 * neighbours. Dots are found by how far a pixel is from the square's corner, which is bare canvas. Light is the fair measure of
 * size: a dot between two pixels covers more of them, more faintly, and gives the same light.
 * @param {Electron.NativeImage} image @param {number} scale
 */
function measureDots(image, scale) {
  const { width, height } = image.getSize();
  const pixels = image.toBitmap();
  const at = (/** @type {number} */ x, /** @type {number} */ y) => (y * width + x) * 4;
  const distance = (/** @type {number} */ index) => Math.abs(pixels[index] - pixels[0]) + Math.abs(pixels[index + 1] - pixels[1]) + Math.abs(pixels[index + 2] - pixels[2]);
  const seen = new Uint8Array(width * height);
  /** @type {{ light: number, x: number, y: number }[]} */
  const dots = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (seen[y * width + x] || distance(at(x, y)) < 6) continue;
    const stack = [[x, y]];
    seen[y * width + x] = 1;
    let area = 0, light = 0, sumX = 0, sumY = 0, clipped = false;
    while (stack.length) {
      const [px, py] = /** @type {number[]} */ (stack.pop());
      area++; light += distance(at(px, py)); sumX += px; sumY += py;
      if (px === 0 || py === 0 || px === width - 1 || py === height - 1) clipped = true;
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[ny * width + nx] || distance(at(nx, ny)) < 6) continue;
        seen[ny * width + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    if (!clipped) dots.push({ light, x: sumX / area, y: sumY / area });
  }
  const median = (/** @type {number[]} */ list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
  const gaps = dots.flatMap((dot) => dots.filter((other) => other !== dot && Math.abs(other.y - dot.y) < 2 && other.x > dot.x).map((other) => other.x - dot.x).sort((a, b) => a - b).slice(0, 1));
  return { count: dots.length, light: median(dots.map((dot) => dot.light)), spacing: Math.round((median(gaps) / scale) * 10) / 10 };
}

/** @param {any} t */
async function dotsGroup(t) {
  const { checks, results } = t;
  /** @type {Record<string, any>} */
  const sizes = {};
  const scale = await t.js("devicePixelRatio");
  for (const zoom of [0.2, 0.35, 0.5, 0.71, 1, 1.4, 2]) {
    await t.fresh(`wsZoom=${zoom}`);
    await t.sleep(500);
    sizes[zoom] = measureDots(await t.capture(`dots-zoom-${Math.round(zoom * 100)}`, { x: 60, y: 90, width: 240, height: 240 }), scale);
  }
  results.dots = sizes;
  const all = Object.values(sizes);
  const light = all.map((item) => item.light);
  checks.dotsAtEveryZoom = all.every((item) => item.count >= 4);
  // One size at every zoom. Spacing that is not a whole number of pixels shifts the anti-aliasing a little, hence the tolerance.
  checks.dotsKeepOneSize = Math.max(...light) / Math.min(...light) <= 1.12;
  // Spacing follows the zoom (owner, Phase 14): a 28 pt cell times the zoom, doubled only when dots would be closer than 8 pt.
  const expected = (/** @type {number} */ zoom) => { let spacing = 28 * zoom; while (spacing < 8) spacing *= 2; return spacing; };
  results.dotSpacingExpected = Object.fromEntries(Object.keys(sizes).map((zoom) => [zoom, Math.round(expected(Number(zoom)) * 10) / 10]));
  checks.dotSpacingFollowsZoom = Object.entries(sizes).every(([zoom, item]) => Math.abs(item.spacing - expected(Number(zoom))) <= expected(Number(zoom)) * 0.05);
  checks.dotsSpreadWhenZoomingIn = sizes[0.5].spacing < sizes[0.71].spacing && sizes[0.71].spacing < sizes[1].spacing && sizes[1].spacing < sizes[1.4].spacing && sizes[1.4].spacing < sizes[2].spacing;
}

/** @param {any} t */
async function pinchGroup(t) {
  const { checks, results, contents } = t;
  contents.debugger.attach("1.3");
  await contents.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const touches = (/** @type {string} */ type, /** @type {{ x: number, y: number }[]} */ points) => contents.debugger.sendCommand("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id })) });
  const mid = (/** @type {any} */ a, /** @type {any} */ b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  /** Two fingers, one landing just after the other, moving over a few frames. The debugger can only lift them together. */
  const pinch = async (/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ toA, /** @type {any} */ toB) => {
    await touches("touchStart", [a]);
    await t.sleep(30);
    await touches("touchStart", [a, b]);
    await t.sleep(30);
    const steps = 16;
    for (let step = 1; step <= steps; step++) {
      const part = step / steps;
      await touches("touchMove", [{ x: a.x + (toA.x - a.x) * part, y: a.y + (toA.y - a.y) * part }, { x: b.x + (toB.x - b.x) * part, y: b.y + (toB.y - b.y) * part }]);
      await t.sleep(16);
    }
    await t.sleep(60);
    await touches("touchEnd", []);
    return t.settled(420);
  };
  const view = await t.js(`({ width: innerWidth, height: innerHeight })`);
  const under = (/** @type {any} */ camera, /** @type {any} */ point) => ({ x: camera.x + (point.x - view.width / 2) / camera.zoom, y: camera.y + (point.y - view.height / 2) / camera.zoom });
  const held = (/** @type {any} */ before, /** @type {any} */ after, /** @type {any} */ from, /** @type {any} */ to) => { const a = under(before, from), b = under(after, to); return Math.hypot(a.x - b.x, a.y - b.y) * after.zoom; };
  const first = async () => t.rect("[data-testid^=workspace-window-]");

  /** @type {Record<string, any>} */
  const runs = {};
  const scenario = async (/** @type {string} */ name, /** @type {string} */ query, /** @type {(box: any) => any[]} */ fingers) => {
    await t.fresh(query);
    await t.sleep(400);
    const box = await first();
    const before = (await t.workspace())?.camera ?? { x: 2800, y: 1820, zoom: 1 };
    const opened = (await t.workspace())?.windows?.[0];
    const [a, b, toA, toB] = fingers(box);
    const after = (await pinch(a, b, toA, toB))?.camera ?? before;
    const moved = (await t.workspace())?.windows?.[0];
    runs[name] = { ratio: Math.round((after.zoom / before.zoom) * 1000) / 1000, error: Math.round(held(before, after, mid(a, b), mid(toA, toB)) * 10) / 10, windowMoved: !!opened && (moved?.x !== opened.x || moved?.y !== opened.y), before, after };
    return runs[name];
  };
  const apart = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ from, /** @type {number} */ to) => [{ x: x - from, y }, { x: x + from, y }, { x: x - to, y }, { x: x + to, y }];

  let run = await scenario("emptyIn", "", () => apart(640, 340, 90, 150));
  checks.touchPinchZoomsIn = run.ratio > 1.3 && run.ratio < 1.9;
  checks.touchPinchHoldsPoint = run.error <= 3;
  run = await scenario("emptyOut", "", () => apart(640, 340, 180, 90));
  checks.touchPinchZoomsOut = run.ratio < 0.7;
  checks.touchPinchOutHoldsPoint = run.error <= 3;
  await t.shot("pinch-on-canvas");
  run = await scenario("fingersLift", "", () => [{ x: 540, y: 340 }, { x: 740, y: 340 }, { x: 440, y: 300 }, { x: 840, y: 380 }]);
  checks.pinchEndsWithoutASnap = run.error <= 3;
  run = await scenario("calculatorInside", "wsOpen=calculator", (box) => apart(box.x + box.width / 2, box.y + box.height / 2, 90, 150));
  checks.pinchOverOrdinaryToolZoomsCanvas = run.ratio > 1.3 && run.error <= 3;
  run = await scenario("calculatorEdge", "wsOpen=calculator", (box) => apart(box.x + box.width, box.y + box.height / 2, 90, 150));
  checks.pinchAcrossWindowEdgeZoomsCanvas = run.ratio > 1.3 && run.error <= 3;
  for (const tool of ["notes", "pdfs", "whiteboard"]) {
    run = await scenario(`${tool}Inside`, `wsOpen=${tool}`, (box) => apart(box.x + box.width / 2, box.y + box.height / 2, 60, 120));
    checks[`pinchOn_${tool}_LeavesCanvasStill`] = run.ratio === 1 && run.before.x === run.after.x && run.before.y === run.after.y;
  }
  run = await scenario("notesEdge", "wsOpen=notes", (box) => apart(box.x + box.width, box.y + box.height / 2, 90, 150));
  checks.pinchAcrossNotesEdgeZoomsCanvas = run.ratio > 1.3 && run.error <= 3;
  // A second finger stops a window being dragged, and the window stays where the pinch found it.
  run = await scenario("fromTitleBar", "wsOpen=calculator", (box) => [{ x: box.x + 60, y: box.y + 18 }, { x: box.x + box.width + 160, y: box.y + 18 }, { x: box.x - 40, y: box.y + 18 }, { x: box.x + box.width + 260, y: box.y + 18 }]);
  checks.pinchFromTitleBarZoomsCanvas = run.ratio > 1.2;
  checks.pinchFromTitleBarLeavesWindow = !run.windowMoved;
  results.pinch = runs;
  await contents.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
  contents.debugger.detach();
}

/** @param {any} t */
async function dockGroup(t) {
  const { checks, results } = t;
  await t.fresh("");
  for (const tool of SHELF_TOOLS) checks[`dockHas_${tool}`] = await t.has(t.dock(tool));
  checks.dockLeavesAudioToTimer = !(await t.has(t.dock("audio")));
  const box = await t.rect("[data-testid=workspace-dock]");
  results.dock = box;
  checks.dockCentered = Math.abs(box.x + box.width / 2 - (await t.js("innerWidth")) / 2) <= 1;
  // Every button in the Command Center shares one centre line.
  results.dockButtonCentres = await t.js(`[...document.querySelectorAll('[data-testid=workspace-dock] [role=button], [data-testid=workspace-dock] button')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })`);
  checks.dockButtonsAligned = Math.max(...results.dockButtonCentres) - Math.min(...results.dockButtonCentres) <= 1;
  await t.clickOn(t.dock("notes"));
  await t.sleep(500);
  let state = await t.workspace();
  checks.dockOpensTool = state.windows.length === 1 && state.windows[0].tool === "notes";
  checks.toolInView = await t.js(`(() => { const r = document.querySelector('[data-testid^=workspace-window-]').getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= document.querySelector('[data-testid=workspace-dock]').getBoundingClientRect().top; })()`);
  await t.clickOn(t.dock("timer"));
  await t.sleep(500);
  await t.clickOn(t.dock("timer"));
  await t.sleep(300);
  state = await t.workspace();
  checks.singleToolNotDoubled = state.windows.filter((/** @type {any} */ w) => w.tool === "timer").length === 1;
  await t.shot("dock-two-tools");
  // Right-click opens the same menu long press does, and a second instance is one choice away.
  await t.clickOn(t.dock("notes"), "right");
  await t.sleep(320);
  checks.dockMenuOpens = await t.js(`!!document.querySelector('[role=menu]')`);
  await t.shot("dock-menu");
  await t.clickOn(`[role=menu] [aria-label="New window"]`);
  await t.sleep(600);
  state = await t.workspace();
  checks.dockMenuOpensNewWindow = state.windows.filter((/** @type {any} */ w) => w.tool === "notes").length === 2;
  // Several instances: a press asks which.
  await t.clickOn(t.dock("notes"));
  await t.sleep(320);
  checks.dockListsInstances = (await t.count("[role=menu] [role=menuitem]")) === 4;
  await t.key("Escape");
  await t.sleep(240);
  await t.clickOn("[data-testid=canvas-zoom]");
  await t.sleep(320);
  checks.zoomMenuOpens = (await t.count("[role=menu] [role=menuitem]")) === 5;
  await t.shot("dock-zoom-menu");
  await t.key("Escape");
  await t.sleep(240);
  checks.closeButtonCloses = await (async () => {
    const before = (await t.workspace()).windows;
    await t.clickOn(`[data-testid=window-close-${before[0].id}]`);
    await t.sleep(400);
    return (await t.workspace()).windows.length === before.length - 1;
  })();
}

/** @param {any} t */
async function toolsGroup(t) {
  const { checks, results } = t;
  for (const tool of TOOL_IDS) {
    await t.fresh(`wsOpen=${tool}`);
    await t.sleep(500);
    const state = await t.workspace();
    const id = state.windows[0]?.id;
    checks[`opens_${tool}`] = !!id && (await t.has(`[data-testid=tool-${id}]`));
    await t.shot(`tool-${tool}`);
  }
  // The Calculator is real: it uses Sylf's own engine.
  await t.fresh("wsOpen=calculator");
  await t.sleep(400);
  for (const label of ["Square root", "2", "5", "Close bracket", "Plus", "3"]) await t.clickOn(`[aria-label="${label}"]`);
  const id = (await t.workspace()).windows[0].id;
  results.calculatorPreview = await t.js(`document.querySelector('[data-testid=calculator-result-${id}]').textContent`);
  checks.calculatorUsesRealEngine = results.calculatorPreview === "8";
  await t.clickOn(`[aria-label="Equals"]`);
  await t.sleep(120);
  checks.calculatorKeepsState = (await t.js(`document.querySelector('[data-testid=calculator-expression-${id}]').textContent`)) === "8";
  // The shelf (Phase 14: over the Notes library) is checked in the notes group, with documents it made itself.
}

/** @param {any} t */
async function framesGroup(t) {
  const { checks, results, js } = t;
  await t.fresh("wsOpen=notes,pdfs,calculator,audio");
  await t.sleep(900);
  const frames = (/** @type {number} */ n) => `window.__frames = new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < ${n}) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), p99: +s[Math.floor(s.length * 0.99)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); }); true`;
  const mid = { x: 640, y: 90 };
  await js(frames(150));
  for (let i = 0; i < 60; i++) await t.wheel(mid, i % 20 < 10 ? 30 : -30, i % 14 < 7 ? 14 : -14);
  results.panFrames = await js("window.__frames");
  await js(frames(150));
  for (let i = 0; i < 60; i++) await t.wheel(mid, 0, i % 30 < 15 ? 12 : -12, ["control"]);
  results.zoomFrames = await js("window.__frames");
  checks.panHolds60 = results.panFrames.p95 < 25;
  checks.zoomHolds60 = results.zoomFrames.p95 < 25;
  // A window dragged and resized with real input.
  const ids = await t.openIds();
  const bar = await t.center(`[data-testid=window-bar-${ids[0]}]`);
  await js(frames(100));
  await t.drag(bar, { x: bar.x + 260, y: bar.y + 120 }, 80, 16);
  results.dragFrames = await js("window.__frames");
  checks.dragHolds60 = results.dragFrames.p95 < 25;
  await t.sleep(500);
  const se = await t.center("[data-testid=resize-se]");
  await js(frames(100));
  await t.drag(se, { x: se.x + 180, y: se.y + 120 }, 80, 16);
  results.resizeFrames = await js("window.__frames");
  checks.resizeHolds60 = results.resizeFrames.p95 < 25;
  // The most a Workspace can hold, in view and with everything open.
  await t.fresh(`wsOpen=${Array(16).fill("calculator").join(",")}&wsZoom=0.5`);
  await t.sleep(1600);
  results.fullWorkspace = { nodes: await js("document.querySelectorAll('*').length"), mounted: await t.count("[data-testid^=tool-]") };
  await js(frames(150));
  for (let i = 0; i < 60; i++) await t.wheel(mid, i % 20 < 10 ? 30 : -30, 0);
  results.fullPanFrames = await js("window.__frames");
  checks.fullWorkspacePanHolds60 = results.fullPanFrames.p95 < 25;
  checks.mountedContentStaysInBudget = results.fullWorkspace.mounted <= 11;
  // Entering a busy Workspace, from a click to the first window on screen.
  await t.fresh("space=workspace&wsOpen=notes,pdfs,calculator,sylvie,audio,timer");
  await t.sleep(900);
  /** @type {number[]} */
  const entry = [];
  for (let i = 0; i < 5; i++) {
    await js(`document.querySelector('[data-testid=spaces-icon]').click(); true`);
    await t.sleep(200);
    await js(`document.querySelector('[data-testid=spaces-tabs] [role=tab][aria-label=Home]').click(); true`);
    await t.sleep(600);
    await js(`document.querySelector('[data-testid=spaces-icon]').click(); true`);
    await t.sleep(200);
    await js(`window.__entered = new Promise((resolve) => { const started = performance.now(); document.querySelector('[data-testid=spaces-tabs] [role=tab][aria-label=Workspace]').click(); const look = () => { if (document.querySelector('[data-testid^=workspace-window-]')) resolve(performance.now() - started); else requestAnimationFrame(look); }; look(); }); true`);
    entry.push(+Number(await js("window.__entered")).toFixed(1));
    await t.sleep(700);
  }
  results.enterMs = entry;
  checks.entersUnder300ms = [...entry].sort((a, b) => a - b)[2] < 300;
  const metrics = app.getAppMetrics();
  results.memory = { processes: metrics.length, workingSetMb: Math.round(metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024), rendererMb: Math.round((metrics.find((metric) => metric.type === "Tab")?.memory.workingSetSize ?? 0) / 1024) };
}

/** @param {any} t */
async function sizesGroup(t) {
  const { checks } = t;
  for (const size of WINDOWS) {
    await t.resize(size.width, size.height);
    await t.fresh("wsOpen=notes,calculator");
    await t.sleep(700);
    await t.shot(`size-${size.name}`);
    checks[`noOverflow_${size.name}`] = !(await t.overflow());
    const dock = await t.rect("[data-testid=workspace-dock]");
    checks[`dockFits_${size.name}`] = dock.x >= 0 && dock.x + dock.width <= size.width + 1 && dock.y + dock.height <= size.height;
  }
  await t.resize(1280, 820);
}

/** @param {any} t */
async function themesGroup(t) {
  const { checks } = t;
  for (const theme of THEMES) for (const mode of ["light", "dark"]) {
    await t.fresh(`wsOpen=notes,calculator,timer&theme=${theme}&mode=${mode}`);
    await t.sleep(600);
    await t.shot(`theme-${theme}-${mode}`);
    checks[`renders_${theme}_${mode}`] = (await t.count("[data-testid^=workspace-window-]")) === 3;
  }
  await t.fresh("wsOpen=notes,timer&theme=signature&mode=dark&accent=e5ff00&day=7f8088&night=101010");
  await t.sleep(600);
  await t.shot("theme-custom-colors-dark");
  await t.fresh("wsOpen=notes,timer&theme=cozy&mode=light&accent=ff2d55&day=7f8088&night=101010");
  await t.sleep(600);
  await t.shot("theme-custom-colors-light");
}

/** @param {any} t */
async function retentionGroup(t) {
  const { checks, contents, results, sleep } = t;
  contents.debugger.attach("1.3");
  const measure = async () => {
    await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
    await sleep(300);
    await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
    const counters = await contents.debugger.sendCommand("Memory.getDOMCounters");
    const heap = await contents.debugger.sendCommand("Runtime.getHeapUsage");
    return { nodes: counters.nodes, listeners: counters.jsEventListeners, heapMb: +(heap.usedSize / 1048576).toFixed(2) };
  };
  // Opening and closing windows must give everything back.
  await t.fresh("");
  const windowRound = async () => {
    for (const tool of ["notes", "pdfs", "calculator", "resources"]) { await t.js(`document.querySelector('[data-testid=dock-${tool}]').click(); true`); await sleep(220); }
    for (let left = await t.count("[data-testid^=window-close-]"); left > 0; left--) { await t.js(`document.querySelector('[data-testid^=window-close-]').click(); true`); await sleep(160); }
    await sleep(200);
    return measure();
  };
  const windowSamples = [await measure()];
  for (let i = 0; i < 7; i++) windowSamples.push(await windowRound());
  results.windowRetention = windowSamples;
  // The last thing unmounted can stay referenced until the next change, so samples move between two levels. A higher level
  // later on, or a heap that keeps climbing, is what this looks for.
  const peak = (/** @type {any[]} */ samples) => Math.max(...samples.map((sample) => sample.nodes));
  checks.windowsRetainNoNodes = peak(windowSamples.slice(-3)) <= peak(windowSamples.slice(1, 4)) + 40;
  checks.windowsRetainNoHeap = windowSamples.at(-1).heapMb <= windowSamples[3].heapMb + 1.2;
  // Leaving Workspace and coming back must not add up, with four tools open.
  await t.fresh("wsOpen=notes,pdfs,calculator,audio");
  await sleep(900);
  const spaceRound = async () => {
    for (const label of ["Home", "Workspace"]) {
      await t.js(`document.querySelector('[data-testid=spaces-icon]').click(); true`);
      await sleep(180);
      await t.js(`document.querySelector('[data-testid=spaces-tabs] [role=tab][aria-label=' + ${JSON.stringify(label)} + ']').click(); true`);
      await sleep(620);
    }
    return measure();
  };
  const spaceSamples = [await measure()];
  for (let i = 0; i < 6; i++) spaceSamples.push(await spaceRound());
  results.spaceRetention = spaceSamples;
  checks.spaceRetainsNoNodes = spaceSamples.at(-1).nodes <= spaceSamples[2].nodes + 40;
  checks.spaceRetainsNoHeap = spaceSamples.at(-1).heapMb <= spaceSamples[2].heapMb + 1.2;
  contents.debugger.detach();
}

/** @param {any} t */
async function windowsGroup(t) {
  const { checks, results } = t;
  // Two Notes, one PDF and a Calculator, as the brief describes.
  await t.fresh("wsOpen=notes,notes,pdfs,calculator&wsZoom=0.6");
  await t.sleep(900);
  await t.shot("windows-four-tools");
  let state = await t.workspace();
  const [first, second] = state.windows;
  checks.twoInstancesOfOneTool = state.windows.filter((/** @type {any} */ w) => w.tool === "notes").length === 2 && first.id !== second.id;
  const zoom = state.camera.zoom;
  // Moving follows the pointer at any zoom, lands on the grid, and leaves everything else alone.
  await t.clickOn(`[data-testid=window-bar-${first.id}]`);
  await t.sleep(200);
  const bar = await t.center(`[data-testid=window-bar-${first.id}]`);
  await t.drag(bar, { x: bar.x + 140, y: bar.y + 84 });
  await t.sleep(500);
  state = await t.workspace();
  const moved = state.windows.find((/** @type {any} */ w) => w.id === first.id);
  results.moved = { from: [first.x, first.y], to: [moved.x, moved.y], zoom };
  checks.dragMovesWindow = Math.abs(moved.x - first.x - 140 / zoom) <= 28 && Math.abs(moved.y - first.y - 84 / zoom) <= 28;
  checks.dragLandsOnGrid = moved.x % 28 === 0 && moved.y % 28 === 0;
  checks.dragLeavesOthersAlone = state.windows.find((/** @type {any} */ w) => w.id === second.id).x === second.x;
  // Focus raises.
  await t.clickOn(`[data-testid=window-bar-${second.id}]`);
  await t.sleep(240);
  state = await t.workspace();
  checks.pressFocuses = state.focused === second.id;
  checks.focusRaises = state.windows.find((/** @type {any} */ w) => w.id === second.id).z === Math.max(...state.windows.map((/** @type {any} */ w) => w.z));
  // Pressing inside a tool focuses too, and the press still reaches the tool.
  const calculator = state.windows.find((/** @type {any} */ w) => w.tool === "calculator");
  await t.clickOn(`[data-testid=workspace-window-${calculator.id}] [aria-label="7"]`);
  await t.sleep(240);
  state = await t.workspace();
  checks.pressInsideFocusesAndActs = state.focused === calculator.id && state.windows.find((/** @type {any} */ w) => w.id === calculator.id).state.expression === "7";
  // Resizing from a corner, and limits hold.
  const before = state.windows.find((/** @type {any} */ w) => w.id === calculator.id);
  const se = await t.center("[data-testid=resize-se]");
  await t.drag(se, { x: se.x + 84, y: se.y + 56 });
  await t.sleep(700);
  state = await t.workspace();
  const grown = state.windows.find((/** @type {any} */ w) => w.id === calculator.id);
  results.resized = { from: [before.width, before.height], to: [grown.width, grown.height] };
  checks.cornerResizes = grown.width > before.width && grown.height > before.height && grown.x === before.x;
  const nw = await t.center("[data-testid=resize-nw]");
  await t.drag(nw, { x: nw.x + 400, y: nw.y + 400 });
  await t.sleep(700);
  state = await t.workspace();
  const shrunk = state.windows.find((/** @type {any} */ w) => w.id === calculator.id);
  checks.resizeStopsAtToolMinimum = shrunk.width === 280 && shrunk.height === 420;
  checks.leadingEdgeResizeHoldsFarEdge = Math.abs(shrunk.x + shrunk.width - (grown.x + grown.width)) <= 28;
  await t.shot("windows-after-resize");
  // A camera move does not touch a window.
  const positions = JSON.stringify(state.windows.map((/** @type {any} */ w) => [w.x, w.y, w.width, w.height]));
  for (let i = 0; i < 10; i++) await t.wheel({ x: 640, y: 80 }, 30, 10);
  await t.wheel({ x: 640, y: 80 }, 0, -40, ["control"]);
  state = await t.settled(300);
  checks.cameraLeavesWindowsAlone = JSON.stringify(state.windows.map((/** @type {any} */ w) => [w.x, w.y, w.width, w.height])) === positions;
  // Minimize, and restore in the same place.
  const target = state.windows.find((/** @type {any} */ w) => w.tool === "pdfs");
  await t.clickOn(`[data-testid=window-minimize-${target.id}]`);
  await t.sleep(500);
  state = await t.workspace();
  checks.minimizeKeepsWindow = state.windows.find((/** @type {any} */ w) => w.id === target.id).minimized === true;
  checks.minimizedShowsChip = await t.has(`[data-testid=minimized-${target.id}]`);
  checks.minimizedLeavesTabOrder = await t.js(`getComputedStyle(document.querySelector('[data-testid=workspace-window-${target.id}]')).visibility === 'hidden'`);
  await t.shot("windows-minimized-chip");
  await t.clickOn(`[data-testid=minimized-${target.id}]`);
  await t.sleep(700);
  state = await t.workspace();
  const back = state.windows.find((/** @type {any} */ w) => w.id === target.id);
  checks.restoreKeepsPlace = !back.minimized && back.x === target.x && back.y === target.y && state.focused === target.id;
  // Instances keep their own state.
  await t.fresh("wsOpen=calculator,calculator");
  await t.sleep(600);
  const [a, b] = (await t.workspace()).windows;
  await t.clickOn(`[data-testid=workspace-window-${a.id}] [aria-label="4"]`);
  await t.clickOn(`[data-testid=workspace-window-${b.id}] [aria-label="9"]`);
  await t.sleep(240);
  state = await t.workspace();
  checks.instancesAreIndependent = state.windows[0].state.expression === "4" && state.windows[1].state.expression === "9";
  // A wheel over a scrolling tool belongs to the tool.
  await t.fresh("wsOpen=notes");
  await t.sleep(500);
  const notes = (await t.workspace()).windows[0];
  const inside = await t.center(`[data-testid=tool-${notes.id}]`);
  const scrollerY = () => t.js(`(() => { const nodes = [...document.querySelectorAll('[data-testid=tool-${notes.id}] *')].filter((n) => getComputedStyle(n).overflowY === 'auto' || getComputedStyle(n).overflowY === 'scroll'); return nodes.map((n) => n.scrollHeight > n.clientHeight + 1); })()`);
  results.scrollers = await scrollerY();
  await t.wheel(inside, 0, 30);
  await t.sleep(300);
  checks.stageNeverScrolls = await t.js(`(() => { const s = document.querySelector('[data-testid=workspace-canvas]'); return s.scrollLeft === 0 && s.scrollTop === 0; })()`);
  // Moving to the world's edge stops there.
  const edgeBar = await t.center(`[data-testid=window-bar-${notes.id}]`);
  await t.drag(edgeBar, { x: 8, y: 8 });
  await t.sleep(400);
  checks.dragStaysInWorld = (await t.workspace()).windows[0].x >= 0;
}

/** @param {any} t */
async function layoutsGroup(t) {
  const { checks, results } = t;
  await t.fresh("wsOpen=notes,pdfs,calculator");
  await t.sleep(700);
  const start = await t.workspace();
  const choose = async (/** @type {string} */ label) => {
    if (await t.has("[data-testid=dock-reveal]")) { await t.clickOn("[data-testid=dock-reveal]"); await t.sleep(420); }
    await t.clickOn("[data-testid=dock-layout]");
    await t.sleep(320);
    await t.clickOn(`[role=menu] [aria-label="${label}"]`);
    await t.sleep(900);
  };
  await t.clickOn("[data-testid=dock-layout]");
  await t.sleep(320);
  await t.shot("layouts-menu");
  await t.key("Escape");
  await t.sleep(240);
  await choose("Single window");
  let state = await t.workspace();
  checks.focusFillsWithOneTool = state.layout === "focus" && state.windows.filter((/** @type {any} */ w) => !w.minimized).length === 1;
  checks.focusClosesNothing = state.windows.length === 3;
  checks.focusIsAt100Percent = state.camera.zoom === 1;
  checks.focusTucksCommandCenter = await t.has("[data-testid=dock-reveal]");
  await t.shot("layouts-focus");
  await t.clickOn("[data-testid=dock-reveal]");
  await t.sleep(500);
  checks.handleBringsCommandCenterBack = !(await t.has("[data-testid=dock-reveal]"));
  await t.shot("layouts-focus-revealed");
  await t.sleep(200);
  await choose("Split screen");
  state = await t.workspace();
  const split = state.windows.filter((/** @type {any} */ w) => !w.minimized).sort((/** @type {any} */ a, /** @type {any} */ b) => a.x - b.x);
  checks.splitPlacesTwoSideBySide = state.layout === "split" && split.length === 2 && split[0].x + split[0].width + 28 === split[1].x && split[0].y === split[1].y;
  const shown = () => t.js(`[...document.querySelectorAll('[data-testid^=workspace-window-]:not([aria-hidden=true])')].map((e) => e.getBoundingClientRect().toJSON())`);
  const [left, right] = (await shown()).sort((/** @type {DOMRect} */ a, /** @type {DOMRect} */ b) => a.left - b.left);
  checks.splitUsesLandscapeWidth = Math.abs(left.left) <= 1 && Math.abs(left.right - right.left) <= 1 && Math.abs(right.right - await t.js("innerWidth")) <= 1;
  await t.shot("layouts-split");
  await t.resize(744, 870);
  await t.sleep(450);
  const [top, bottom] = (await shown()).sort((/** @type {DOMRect} */ a, /** @type {DOMRect} */ b) => a.top - b.top);
  checks.splitUsesPortraitWidth = Math.abs(top.bottom - bottom.top) <= 1 && Math.abs(top.width - 744) <= 1 && Math.abs(bottom.width - 744) <= 1;
  await t.shot("layouts-split-portrait");
  await t.resize(1280, 820);
  await choose("Assistant");
  state = await t.workspace();
  const pair = state.windows.filter((/** @type {any} */ w) => !w.minimized).sort((/** @type {any} */ a, /** @type {any} */ b) => a.x - b.x);
  results.assistant = pair.map((/** @type {any} */ w) => [w.tool, w.width]);
  checks.assistantPutsSylvieBeside = state.layout === "assistant" && pair[1].tool === "sylvie" && pair[0].width > pair[1].width;
  await t.shot("layouts-assistant");
  await choose("Canvas");
  state = await t.workspace();
  const before = start.windows.map((/** @type {any} */ w) => [w.id, w.x, w.y, w.width, w.height, w.minimized]);
  checks.backRestoresArrangement = before.every((/** @type {any} */ item) => state.windows.some((/** @type {any} */ w) => JSON.stringify([w.id, w.x, w.y, w.width, w.height, w.minimized]) === JSON.stringify(item)));
  checks.backReturnsCamera = Math.abs(state.camera.x - start.camera.x) < 1;
  // A hand adjustment makes the arrangement the person's own.
  await choose("Split screen");
  const id = (await t.openIds())[0];
  const bar = await t.center(`[data-testid=window-bar-${id}]`);
  await t.drag(bar, { x: bar.x + 56, y: bar.y + 28 });
  await t.sleep(500);
  state = await t.workspace();
  checks.adjustmentBecomesFree = state.layout === "free" && state.saved === null;
}

/** @param {any} t */
async function restoreGroup(t) {
  const { checks } = t;
  await t.fresh("wsOpen=notes,pdfs,calculator,timer");
  await t.sleep(800);
  let state = await t.workspace();
  const pdf = state.windows.find((/** @type {any} */ w) => w.tool === "pdfs");
  const calculator = state.windows.find((/** @type {any} */ w) => w.tool === "calculator");
  await t.clickOn(`[data-testid=workspace-window-${calculator.id}] [aria-label="6"]`);
  await t.clickOn(`[data-testid=window-minimize-${pdf.id}]`);
  await t.sleep(300);
  await t.wheel({ x: 640, y: 80 }, 40, 12);
  await t.wheel({ x: 640, y: 80 }, 0, 20, ["control"]);
  const saved = await t.settled(500);
  const fingerprint = (/** @type {any} */ value) => JSON.stringify({ camera: value.camera, focused: value.focused, windows: value.windows.map((/** @type {any} */ w) => [w.id, w.tool, w.x, w.y, w.width, w.height, w.minimized, w.state]) });
  await t.open("");
  await t.sleep(500);
  state = await t.workspace();
  checks.layoutSurvivesRestart = fingerprint(state) === fingerprint(saved);
  checks.restoredWindowsAreOnScreen = (await t.count("[data-testid^=workspace-window-]")) === 4;
  checks.restoredToolStateShows = (await t.js(`document.querySelector('[data-testid=calculator-expression-${calculator.id}]')?.textContent`)) === "6";
  await t.shot("restore-after-restart");
  // Leaving for Home and coming back.
  for (const label of ["Home", "Workspace"]) {
    await t.clickOn("[data-testid=spaces-icon]");
    await t.sleep(420);
    await t.clickOn(`[data-testid=spaces-tabs] [role=tab][aria-label=${label}]`);
    await t.sleep(700);
  }
  state = await t.workspace();
  checks.layoutSurvivesSpaceChange = fingerprint(state) === fingerprint(saved);
  // A corrupt or partly unreadable record never stops the app.
  await t.plant(JSON.stringify({ version: 1, activeSpace: "workspace", returnSpace: "home", snapshots: { workspace: { version: 1, camera: { x: "a" }, windows: [{ id: "ok", tool: "notes", x: 280, y: 280, width: 560, height: 560 }, { id: "bad", tool: "nothing" }, 7] } } }));
  await t.open("");
  await t.sleep(500);
  checks.badWindowDroppedOthersKept = (await t.count("[data-testid^=workspace-window-]")) === 1;
  await t.plant(JSON.stringify({ version: 1, activeSpace: "workspace", returnSpace: "home", snapshots: { workspace: "not a workspace" } }));
  await t.open("");
  await t.sleep(400);
  checks.corruptWorkspaceOpensEmpty = await t.has("[data-testid=workspace-surface]");
}

/** @param {any} t */
async function lifecycleGroup(t) {
  const { checks, results } = t;
  const stateOf = (/** @type {string} */ id) => t.js(`document.querySelector('[data-testid=tool-${id}]')?.getAttribute('data-lifecycle') ?? null`);
  await t.fresh("wsZoom=0.5&wsOpen=notes,calculator,timer,sylvie,audio&session=clear&sessionLength=25");
  await t.sleep(1000);
  const state = await t.workspace();
  const ids = state.windows.map((/** @type {any} */ w) => w.id);
  // Minimizing stills a tool and keeps it warm.
  const timer = state.windows.find((/** @type {any} */ w) => w.tool === "timer");
  await t.clickOn(`[data-testid=workspace-window-${timer.id}] [data-testid=timer-begin]`);
  await t.sleep(1200);
  const left = () => t.js(`document.querySelector('[data-testid=tool-${timer.id}] [data-testid=timer-clock]')?.textContent`);
  results.timerRunning = await left();
  await t.clickOn(`[data-testid=window-minimize-${timer.id}]`);
  await t.sleep(600);
  checks.minimizedToolIsBackground = (await stateOf(timer.id)) === "background";
  // Going far away suspends what is past the budget, and the frames stay.
  const fullState = await t.workspace();
  await t.open("space=workspace&wsZoom=0.3");
  await t.sleep(900);
  const mounted = await t.count("[data-testid^=tool-]");
  results.overviewMounted = mounted;
  checks.overviewReleasesContent = mounted <= 3;
  checks.framesRemainInOverview = (await t.count("[data-testid^=workspace-window-]")) === ids.length;
  await t.shot("lifecycle-overview");
  // A press on a far window goes there, and its tool comes back.
  const open = fullState.windows.find((/** @type {any} */ w) => !w.minimized && w.tool === "calculator");
  await t.clickOn(`[data-testid=workspace-window-${open.id}] [aria-label^="Go to"]`);
  await t.sleep(1000);
  const after = await t.workspace();
  checks.overviewPressFrames = after.focused === open.id && after.camera.zoom === 1;
  checks.toolReturnsAfterOverview = (await stateOf(open.id)) === "active";
  await t.shot("lifecycle-back-from-overview");
  // Suspension loses nothing: the Timer is a view of the one session, whose time comes from its snapshot.
  await t.clickOn(`[data-testid=minimized-${timer.id}]`);
  await t.sleep(1000);
  results.timerAfter = await left();
  const seconds = (/** @type {string | null} */ text) => { const m = /(\d+):(\d+)/.exec(text ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  checks.timerKeptTimeWhileAway = seconds(results.timerAfter) < seconds(results.timerRunning) - 2;
  // A hidden tool does nothing on a clock.
  await t.clickOn(`[data-testid=window-minimize-${timer.id}]`);
  await t.sleep(500);
  await t.js(`window.__writes = 0; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (...args) { window.__writes++; return set.apply(this, args); }; true`);
  const nodesBefore = await t.js(`document.querySelector('[data-testid=tool-${timer.id}]')?.textContent ?? ''`);
  await t.sleep(2200);
  checks.hiddenTimerRendersNothing = (await t.js(`document.querySelector('[data-testid=tool-${timer.id}]')?.textContent ?? ''`)) === nodesBefore;
  checks.idleWorkspaceWritesNothing = (await t.js("window.__writes")) === 0;
  await t.open("space=workspace&session=clear");
}

/** @param {any} t */
async function keysGroup(t) {
  const { checks } = t;
  await t.fresh("");
  await t.key("1", ["alt"]);
  await t.sleep(400);
  let state = await t.workspace();
  checks.altDigitOpensTool = state?.windows?.[0]?.tool === "notes";
  await t.key("8", ["alt"]);
  await t.sleep(400);
  await t.key("]", ["alt"]);
  await t.sleep(240);
  state = await t.workspace();
  checks.altBracketCycles = state.focused === state.windows[0].id;
  await t.key("m", ["alt"]);
  await t.sleep(300);
  state = await t.workspace();
  checks.altMMinimizes = state.windows[0].minimized === true;
  await t.key("w", ["alt"]);
  await t.sleep(300);
  state = await t.workspace();
  checks.altWCloses = state.windows.length === 1;
  await t.key("f", ["alt"]);
  await t.sleep(700);
  state = await t.workspace();
  checks.altFFocus = state.layout === "focus";
  await t.key("Escape");
  await t.sleep(700);
  state = await t.workspace();
  checks.escapeLeavesFocus = state.layout === "free";
  await t.key("k", ["cmd"]);
  await t.sleep(420);
  checks.commandKOpensPalette = await t.has("[data-testid=command-palette]");
  await t.shot("keys-command-palette");
  for (const letter of ["t", "i", "m"]) await t.key(letter);
  await t.sleep(160);
  await t.key("Return");
  await t.sleep(600);
  state = await t.workspace();
  checks.switcherOpensByTyping = state.windows.some((/** @type {any} */ w) => w.tool === "timer");
  // Moving a window from the keyboard.
  const id = state.focused;
  const window = state.windows.find((/** @type {any} */ w) => w.id === id);
  await t.js(`document.querySelector('[data-testid=window-bar-${id}]').focus(); true`);
  await t.key("Right");
  await t.key("Down");
  await t.sleep(200);
  state = await t.workspace();
  const nudged = state.windows.find((/** @type {any} */ w) => w.id === id);
  checks.arrowsMoveWindow = nudged.x === window.x + 28 && nudged.y === window.y + 28;
  await t.key("Right", ["shift"]);
  await t.sleep(200);
  state = await t.workspace();
  checks.shiftArrowsResizeWindow = state.windows.find((/** @type {any} */ w) => w.id === id).width === window.width + 28;
  // Holding the Space bar moves the canvas from anywhere, even over a window.
  await t.js(`document.activeElement?.blur(); true`);
  const point = await t.center(`[data-testid=workspace-window-${id}]`);
  const before = (await t.workspace()).camera;
  t.contents.sendInputEvent({ type: "keyDown", keyCode: "Space" });
  await t.sleep(300);
  checks.spaceShowsHand = await t.has("[data-testid=workspace-hand]");
  await t.drag(point, { x: point.x - 120, y: point.y - 40 });
  t.contents.sendInputEvent({ type: "keyUp", keyCode: "Space" });
  const after = await t.settled(2600);
  checks.spaceDragPansOverWindow = after.camera.x > before.x + 80;
  checks.spaceReleaseEndsHand = !(await t.has("[data-testid=workspace-hand]"));
  // Tabbing to a window out of view brings it into view, without scrolling the stage.
  await t.fresh("wsOpen=notes,calculator");
  await t.sleep(600);
  const list = (await t.workspace()).windows;
  await t.clickOn("[data-testid=canvas-fit]");
  await t.sleep(600);
  await t.key("m", ["alt"]);
  await t.sleep(240);
  await t.key("d", ["alt"]);
  await t.sleep(200);
  await t.js(`document.querySelector('[data-testid=window-bar-${list[0].id}]').scrollIntoView?.(); true`);
  checks.stageIgnoresScrollIntoView = await t.js(`document.querySelector('[data-testid=workspace-canvas]').scrollLeft === 0`);
}

/** @param {any} t */
async function compactGroup(t) {
  const { checks, results } = t;
  await t.resize(1000, 760);
  await t.fresh("wsOpen=notes,calculator");
  await t.sleep(700);
  await t.js(`window.__node = document.querySelector('[data-testid^=workspace-window-]'); true`);
  await t.resize(480, 760);
  await t.sleep(600);
  await t.shot("compact-one-tool");
  const state = await t.workspace();
  const shown = await t.js(`[...document.querySelectorAll('[data-testid^=workspace-window-]')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('aria-hidden') !== 'true').map((e) => e.getAttribute('data-testid'))`);
  results.compactShown = shown;
  checks.compactShowsOneTool = shown.length === 1 && shown[0].endsWith(state.focused);
  checks.compactFillsWidth = await t.js(`(() => { const r = document.querySelector('[data-testid=workspace-window-${state.focused}]').getBoundingClientRect(); return r.x >= -1 && Math.round(r.width) === innerWidth; })()`);
  checks.crossingWidthDoesNotRemount = await t.js(`window.__node.isConnected`);
  checks.compactNoOverflow = !(await t.overflow());
  const other = state.windows.find((/** @type {any} */ w) => w.id !== state.focused);
  await t.clickOn(t.dock(other.tool));
  await t.sleep(500);
  checks.dockSwitchesToolInCompact = (await t.workspace()).focused === other.id;
  // Restored with nothing focused, it still shows a tool.
  await t.plant(JSON.stringify({ version: 1, activeSpace: "workspace", returnSpace: "home", snapshots: { workspace: { version: 1, windows: [{ id: "a", tool: "notes", x: 280, y: 280, width: 560, height: 560 }] } } }));
  await t.open("");
  await t.sleep(600);
  checks.compactNeverBlank = (await t.workspace()).focused === "a";
  await t.fresh("wsOpen=notes,calculator");
  await t.sleep(500);
  const compactState = await t.workspace();
  await t.resize(1280, 820);
  await t.sleep(500);
  const back = await t.workspace();
  checks.compactChangesNoWorldPosition = back.windows.every((/** @type {any} */ w) => compactState.windows.some((/** @type {any} */ s) => s.id === w.id && s.x === w.x && s.width === w.width));
  await t.shot("compact-back-to-canvas");
}

/** Runs in the page: the lowest contrast of any visible text on an opaque surface in a window or the Command Center. */
const LOWEST_CONTRAST = `(visible) => {
    const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
    let lowest = 99; let sample = null;
    for (const node of document.querySelectorAll('[data-testid^=workspace-window-] div[dir=auto], [data-testid=workspace-dock] div[dir=auto]')) {
      if (!visible(node) || !node.textContent.trim()) continue;
      const fg = parse(getComputedStyle(node).color);
      let bg = null;
      for (let e = node; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a === 1) { bg = c; break; } }
      if (!fg || !bg) continue;
      const a = lum(fg.rgb); const b = lum(bg.rgb);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < lowest) { lowest = ratio; sample = { text: node.textContent.slice(0, 30), ratio: +ratio.toFixed(2) }; }
    }
    return { lowest: +lowest.toFixed(2), sample };
  }`;

/** @param {any} t */
async function contrastGroup(t) {
  const { checks, results, js } = t;
  const visible = "(e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && !e.closest('[aria-hidden=true]'); }";
  /** @type {Record<string, any>} */
  const lowest = {};
  const CUSTOM = { "custom-dark": "theme=signature&mode=dark&accent=e5ff00&day=7f8088&night=101010", "custom-light": "theme=cozy&mode=light&accent=ff2d55&day=7f8088&night=101010" };
  const pairs = [...THEMES.flatMap((theme) => ["light", "dark"].map((mode) => [`${theme}-${mode}`, `theme=${theme}&mode=${mode}`])), ...Object.entries(CUSTOM)];
  for (const [name, query] of pairs) {
    await t.fresh(`wsOpen=notes,calculator,timer,sylvie,audio,resources&wsZoom=0.5&${query}`);
    await t.sleep(1400);
    lowest[name] = await js(`(${LOWEST_CONTRAST})(${visible})`);
    checks[`contrast_${name}`] = lowest[name].lowest >= 4.5;
  }
  results.contrast = lowest;
}

/** @param {any} t */
async function accessibilityGroup(t) {
  const { checks, results, js } = t;
  await t.fresh("wsOpen=notes,calculator,timer,sylvie,audio,resources&wsZoom=0.5&theme=signature&mode=dark");
  await t.sleep(1400);
  const min = (await t.workspace()).windows[0];
  await t.clickOn(`[data-testid=window-minimize-${min.id}]`);
  await t.sleep(500);
  const audit = await js(`(() => {
    const lowestContrast = ${LOWEST_CONTRAST};
    const visible = (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && !e.closest('[aria-hidden=true]'); };
    const controls = [...document.querySelectorAll('button,[role=button],[role=tab],[role=switch],[role=checkbox],[role=slider],[role=menuitem],input')].filter(visible);
    const unnamed = controls.filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim() || e.getAttribute('placeholder')));
    const { lowest, sample } = lowestContrast(visible);
    return { controls: controls.length, unnamed: unnamed.length, names: unnamed.slice(0, 5).map((e) => e.outerHTML.slice(0, 120)), lowest, sample, hiddenTabbable: [...document.querySelectorAll('[data-testid^=workspace-window-][aria-hidden=true] [tabindex="0"]')].filter((e) => getComputedStyle(e).visibility !== 'hidden').length };
  })()`);
  results.audit = audit;
  checks.everyControlNamed = audit.unnamed === 0;
  checks.textContrastAtLeast45 = audit.lowest >= 4.5;
  checks.minimizedNotTabbable = audit.hiddenTabbable === 0;
  checks.toolbarNamed = await js(`document.querySelector('[role=toolbar]')?.getAttribute('aria-label') === 'Command Center'`);
  checks.windowsNamed = await js(`[...document.querySelectorAll('[data-testid^=workspace-window-]')].every((e) => !!e.getAttribute('aria-label'))`);
  // Reduced motion: everything still works, a drag does not coast, and a window arrives by fading.
  t.contents.debugger.attach("1.3");
  await t.contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await t.fresh("");
  await t.clickOn(t.dock("calculator"));
  await t.sleep(400);
  checks.reducedMotionOpensTool = (await t.count("[data-testid^=workspace-window-]")) === 1;
  const start = await t.center("[data-testid=workspace-surface]");
  await t.drag({ x: 60, y: 160 }, { x: 260, y: 200 }, 4, 8);
  await t.sleep(160);
  const first = (await t.workspace()).camera;
  await t.sleep(700);
  const second = (await t.workspace()).camera;
  results.reducedPan = { first, second, start };
  checks.reducedMotionDoesNotCoast = first.x === second.x && first.x < 2800;
  await t.shot("reduced-motion");
  await t.contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  t.contents.debugger.detach();
}


// Risk R15 on the Mac. The bare probe mounts and unmounts plain elements, and only the JavaScript and DOM side can be seen here.
// Android's native heap is a different allocator and a different renderer, so this can clear the app's own code and nothing more.
/** @param {any} t */
async function probeGroup(t) {
  const { checks, contents, results, sleep } = t;
  contents.debugger.attach("1.3");
  const measure = async () => {
    await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
    await sleep(300);
    await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
    const counters = await contents.debugger.sendCommand("Memory.getDOMCounters");
    const heap = await contents.debugger.sendCommand("Runtime.getHeapUsage");
    return { nodes: counters.nodes, listeners: counters.jsEventListeners, heapMb: +(heap.usedSize / 1048576).toFixed(2), status: await t.js(`document.querySelector('[data-testid=r15-status]')?.textContent ?? null`) };
  };
  for (const scenario of ["views", "text", "pressable"]) {
    await t.open(`r15=${scenario}`);
    await sleep(1500);
    const samples = [await measure()];
    for (let i = 0; i < 6; i++) { await sleep(10000); samples.push(await measure()); }
    results[`probe_${scenario}`] = samples;
    // A sample lands either with the elements mounted or between mounts. Between mounts is the floor, and the floor must hold.
    const floor = (/** @type {any[]} */ list, /** @type {"nodes" | "heapMb"} */ key) => Math.min(...list.map((sample) => sample[key]));
    checks[`probeRetainsNoHeap_${scenario}`] = floor(samples.slice(3), "heapMb") <= floor(samples.slice(0, 3), "heapMb") + 1;
    checks[`probeRetainsNoNodes_${scenario}`] = floor(samples.slice(3), "nodes") <= floor(samples.slice(0, 3), "nodes") + 50;
  }
  contents.debugger.detach();
}

// Phase 6's scrolling question, as far as a Mac can take it: the same scroll on each Home page and the Showcase, with the CPU
// throttled to about a tablet's speed, and with a count of what each scroll makes React render.
/** @param {any} t */
async function homeScrollGroup(t) {
  const { contents, js, results, sleep } = t;
  contents.debugger.attach("1.3");
  await contents.debugger.sendCommand("Emulation.setCPUThrottlingRate", { rate: 6 });
  const frames = (/** @type {number} */ n) => `window.__frames = new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < ${n}) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), over20: s.filter((v) => v > 20).length }); } }; requestAnimationFrame(tick); }); true`;
  const scroller = (/** @type {string} */ selector) => `(() => { const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})]; return candidates.find((e) => e.scrollHeight > e.clientHeight + 40) ?? null; })()`;
  /** @type {Record<string, any>} */
  const measured = {};
  for (const [name, query, selector] of [["today", "space=home&home=today", "[data-testid=home-scroll-today]"], ["focus", "space=home&home=focus", "[data-testid=home-scroll-focus]"], ["circle", "space=home&home=circle", "[data-testid=home-scroll-circle]"], ["progress", "space=home&home=progress", "[data-testid=home-scroll-progress]"], ["showcase", "chapter=controls", "div"]]) {
    await t.resize(900, 420);
    await t.open(`${query}&theme=signature&mode=dark`);
    await sleep(1200);
    const found = await js(`!!${scroller(selector)}`);
    if (!found) { measured[name] = { valid: false }; continue; }
    await js(`window.__scrollEvents = 0; ${scroller(selector)}.addEventListener('scroll', () => window.__scrollEvents++); true`);
    await js(frames(120));
    await js(`(() => { const e = ${scroller(selector)}; const span = Math.min(800, e.scrollHeight - e.clientHeight); let t = 0; const step = () => { t++; e.scrollTop = span * (0.5 - 0.5 * Math.cos(t / 24)); if (t < 110) requestAnimationFrame(step); }; step(); })(); true`);
    measured[name] = { valid: true, ...(await js("window.__frames")), events: await js("window.__scrollEvents") };
  }
  results.homeScrollThrottled = measured;
  await contents.debugger.sendCommand("Emulation.setCPUThrottlingRate", { rate: 1 });
  contents.debugger.detach();
  await t.resize(1280, 820);
}

// Phase 14: Notes, PDFs, Whiteboard, Resources and saved layouts, driven with real keys and pointers in the export build.
/** @param {any} t */
async function resetNotesLibrary(t) {
  // Spaces and Notes live in separate stores in this disposable test profile.
  await t.plant(null);
  await t.js(`new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('sylf-native-notes');
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Previous Notes test page kept the library open.'));
  })`);
}

/** @param {(code: string) => Promise<any>} js */
function dropStudyPdf(js) {
  return js(`(() => {
    const page = (lines) => { const body = 'BT /F1 22 Tf 60 770 Td (' + lines[0] + ') Tj ET ' + lines.slice(1).map((l, i) => 'BT /F1 13 Tf 60 ' + (720 - i * 26) + ' Td (' + l + ') Tj ET').join(' '); return body; };
    const objs = []; const add = (o) => (objs.push(o), objs.length); const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); const kids = [];
    const pages = [['Past paper - Question 1', 'The complex number z satisfies |z - 2i| = |z + 4|.', '(a) Sketch the locus of z.'], ['Question 2', 'Prove by induction that 2^n > n^2 for n >= 5.']];
    const pagesId = objs.length + 1 + pages.length * 2;
    for (const p of pages) { const c = page(p); const ci = add('<< /Length ' + c.length + ' >>\\nstream\\n' + c + '\\nendstream'); kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + font + ' 0 R >> >> /Contents ' + ci + ' 0 R >>')); }
    add('<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>'); const cat = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
    let out = '%PDF-1.4\\n'; const offs = []; objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\\n' + o + '\\nendobj\\n'; });
    const xref = out.length; out += 'xref\\n0 ' + (objs.length + 1) + '\\n0000000000 65535 f \\n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \\n').join('') + 'trailer\\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF';
    const dt = new DataTransfer(); dt.items.add(new File([new TextEncoder().encode(out)], 'Past paper.pdf', { type: 'application/pdf' }));
    const root = document.querySelector('[data-testid=workspace-root]'); const r = root.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 300, clientY: r.top + 200 };
    root.dispatchEvent(new DragEvent('dragover', o)); root.dispatchEvent(new DragEvent('drop', o)); return true; })()`);
}

/** @param {any} t */
async function visualGroup(t, shortPanesOnly = false) {
  // Keep animations and the compositor running while the fixture window is behind Codex.
  t.contents.setBackgroundThrottling(false);
  const id = (/** @type {string} */ value) => `[data-testid="${value}"]`;
  const root = id("workspace-root");
  const dock = id("workspace-dock");
  const toolbarClearance = id("dock-reveal");
  const bounds = {};
  t.results.visualBounds = bounds;
  const waitFor = async (/** @type {string | string[]} */ selector, /** @type {string | undefined} */ retryQuery = undefined) => {
    const selectors = Array.isArray(selector) ? selector : [selector];
    for (let attempt = 0; attempt < (retryQuery ? 2 : 1); attempt++) {
      if (attempt > 0) await t.open(retryQuery);
      for (let retry = 0; retry < 50; retry++) {
        if (await t.js(`(() => {
          return ${JSON.stringify(selectors)}.every((selector) => [...document.querySelectorAll(selector)].some((node) => {
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden=true]');
          }));
        })()`)) return;
        await t.sleep(140);
      }
    }
    await t.shot("visual-wait-failure");
    console.log("VISUAL_WAIT_STATE " + JSON.stringify(await t.workspace()));
    console.log("VISUAL_WAIT_PANES " + JSON.stringify(await t.js(`[...document.querySelectorAll('[data-testid^="workspace-window-"]')].map((pane) => ({
      id: pane.dataset.testid,
      bounds: pane.getBoundingClientRect().toJSON(),
      opacity: getComputedStyle(pane).opacity,
      hidden: pane.getAttribute("aria-hidden"),
      text: pane.innerText.slice(0, 120),
      lifecycle: pane.querySelector('[data-lifecycle]')?.dataset.lifecycle ?? null,
      loading: !!pane.querySelector('[aria-label="Loading"]'),
    }))`)));
    console.log("VISUAL_WAIT_ERRORS " + JSON.stringify(t.consoleErrors.slice(-10)));
    throw new Error(`Workspace visual audit could not find ${selector}`);
  };
  const capture = async (/** @type {string} */ name) => {
    await t.sleep(250);
    /** @type {Record<string, unknown>} */ (bounds)[name] = await t.js(`({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 })`);
    await t.shot(name);
  };
  const show = async (/** @type {string} */ name, /** @type {string} */ tools = "", layout = "free", theme = "theme=signature&mode=dark", /** @type {string | string[]} */ selector = root) => {
    const query = `space=workspace&wsClear=1&wsOpen=${tools}&wsLayout=${layout}&${theme}`;
    await t.open(query);
    await waitFor(selector, query);
    await capture(name);
  };
  const paint = /** @type {Record<string, string>} */ ({
    notes: id("library-new"), pdfs: id("library-new"), whiteboard: id("library-new"),
    sylvie: id("sylvie-input"), timer: id("timer-clock"), calculator: '[data-testid^="calculator-expression-"]',
    audio: '[aria-label="Forest Wind & Leaves"]', resources: '[aria-label="Boards"]',
  });
  const signature = "theme=signature&mode=dark";
  const day = "theme=cozy&mode=light";
  const custom = "theme=voxel&mode=dark&accent=edca64&night=1f2e28&textScale=1.25";

  const fitsInside = (/** @type {string} */ selector, /** @type {string} */ container) => t.js(`(() => {
    const child = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    const parent = document.querySelector(${JSON.stringify(container)})?.getBoundingClientRect();
    return !!child && !!parent && child.left >= parent.left - 1 && child.right <= parent.right + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
  })()`);
  const clearOfTools = (/** @type {string} */ selector) => t.js(`(() => {
    const item = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    const tools = document.querySelector(${JSON.stringify(toolbarClearance)})?.getBoundingClientRect();
    return !!item && !!tools && item.bottom <= tools.top + 1;
  })()`);

  const calculatorPane = '[data-testid^="calculator-"]:has([data-testid^="calculator-expression-"])';
  const calculatorKey = (/** @type {string} */ value) => id(`calc-key-${value}`);
  const canClickCalculator = (/** @type {string} */ selector) => t.js(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    const rect = control?.getBoundingClientRect();
    if (!rect) return false;
    return control.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })()`);
  const scrollCalculatorTo = async (/** @type {string} */ selector, /** @type {number} */ direction) => {
    const point = await t.center(calculatorPane);
    for (let step = 0; step < 6 && !(await canClickCalculator(selector)); step++) {
      await t.wheel(point, 0, direction * 160);
      await t.sleep(200);
    }
    return canClickCalculator(selector);
  };
  const reachCalculatorEquals = async (/** @type {string} */ name) => {
    const equals = calculatorKey("=");
    const before = await t.rect(equals);
    const reachable = await scrollCalculatorTo(equals, 1);
    const after = await t.rect(equals);
    t.results[name] = { equalsBefore: before, equalsAfter: after, reachable };
    if (!reachable || !before || !after || after.y >= before.y) return false;
    for (const value of ["5", "+", "3", "="]) {
      if (!(await canClickCalculator(calculatorKey(value)))) return false;
      await t.clickOn(calculatorKey(value));
    }
    const expression = await t.js(`document.querySelector(${JSON.stringify(paint.calculator)})?.textContent`);
    t.results[name].expression = expression;
    await scrollCalculatorTo(equals, 1);
    return expression === "8";
  };

  const portraitCalculator = async () => {
    await t.resize(744, 870);
    await show("12-portrait-split", "notes,calculator", "split", day, [paint.notes, paint.calculator]);
    t.checks.portraitCalculatorScrollsToEquals = await reachCalculatorEquals("portraitCalculator");
    await capture("12b-portrait-calculator-scrolled");
  };
  const shortCalculator = async () => {
    await t.resize(900, 480);
    if (shortPanesOnly) {
      await t.clickOn(id("dock-layout"));
      const assistant = '[role="menu"] [aria-label="Assistant"]';
      await waitFor(assistant);
      await t.sleep(320);
      await t.clickOn(assistant);
      await waitFor([paint.sylvie, paint.calculator]);
      // Keep the Calculator that was opened in the split and clear it for a second calculation.
      await t.sleep(320);
      const clear = `${calculatorPane} [aria-label="Clear"]`;
      if (!(await scrollCalculatorTo(clear, -1))) throw new Error("Calculator Clear did not scroll into view");
      await t.clickOn(clear);
      await capture("14-short-assistant");
    } else {
      await show("14-short-assistant", "calculator", "assistant", day, [paint.sylvie, paint.calculator]);
    }
    t.checks.shortCalculatorScrollsToEquals = await reachCalculatorEquals("shortCalculator");
    await capture("14b-short-calculator-scrolled");
  };
  const noOverflow = () => Object.values(bounds).every((/** @type {any} */ viewport) => !viewport.overflow);
  if (shortPanesOnly) {
    await portraitCalculator();
    await shortCalculator();
    t.checks.visualViewportDoesNotOverflow = noOverflow();
    return;
  }

  await t.resize(1280, 820);
  await show("01-canvas", "", "free", signature, dock);
  await show("02-free-windows", "notes,calculator", "free", signature, [paint.notes, paint.calculator]);
  await t.clickOn(id("dock-layout"));
  await waitFor('[role="menu"] [aria-label="Tile windows"]');
  await capture("03-layout-menu");
  await t.key("Escape");
  await t.sleep(360);
  await t.clickOn(id("dock-windows"));
  await waitFor('[role="dialog"][aria-label="Windows"]');
  t.checks.windowSheetDoesNotOverflowDuringEntrance = !(await t.overflow());
  await t.sleep(500);
  await capture("04-windows-sheet");
  await show("05-single", "notes", "focus", signature, paint.notes);
  await show("06-landscape-split", "notes,calculator", "split", signature, [paint.notes, paint.calculator]);
  await show("07-assistant", "notes", "assistant", signature, [paint.notes, paint.sylvie]);
  await t.open(`space=workspace&wsClear=1&wsOpen=notes,calculator,timer&wsLayout=fill&${signature}`);
  for (const tool of ["notes", "calculator", "timer"]) await waitFor(paint[tool]);
  await capture("08-tiles");
  for (const tool of TOOL_IDS) {
    await show(`wide-${tool}`, tool, "focus", signature, tool === "resources" ? '[data-testid^="tool-"]' : paint[tool]);
    if (tool === "sylvie") t.checks.toolsClearSylvieComposer = await clearOfTools(paint.sylvie);
    if (tool === "timer") t.checks.toolsClearTimerNote = await clearOfTools(id("session-note"));
    if (tool === "calculator") t.checks.toolsClearCalculatorKeys = await clearOfTools(id("calc-key-="));
  }
  await t.clickOn(id("dock-sounds-open"));
  await waitFor(id("dock-audio-panel"));
  await capture("09-sounds-dock");
  await t.clickOn(id("dock-outside"));

  await show("10-before-pdf", "", "free", signature, root);
  await dropStudyPdf(t.js);
  await waitFor(id("ink-page"));
  await t.sleep(500);
  await capture("11-pdf-open");

  await portraitCalculator();
  await t.open(`space=workspace&wsClear=1&wsOpen=notes,calculator,timer&wsLayout=fill&${day}`);
  for (const tool of ["notes", "calculator", "timer"]) await waitFor(paint[tool]);
  await capture("13-portrait-tiles");
  await shortCalculator();
  await show("15-short-timer", "timer", "focus", custom, paint.timer);

  await t.resize(320, 650);
  await show("16-compact-canvas", "", "free", day, dock);
  for (const tool of TOOL_IDS) {
    await show(`compact-${tool}`, tool, "free", day, paint[tool]);
    if (tool === "resources") {
      t.checks.compactDockShowsFocusedTool = await fitsInside(id("dock-resources"), id("dock-tool-strip"));
      t.checks.compactResourceFiltersFit = await fitsInside('[aria-label="Boards"]', '[data-testid^="tool-"]');
    }
  }
  await t.clickOn(id("dock-sounds-open"));
  await waitFor(id("dock-audio-panel"));
  await capture("17-compact-sounds-dock");
  await show("18-compact-custom", "notes", "free", custom, paint.notes);
  await t.open(`space=workspace&wsClear=1&wsOpen=${Array(12).fill("calculator").join(",")}&wsLayout=free&${day}`);
  await waitFor(id("dock-windows"));
  await t.clickOn(id("dock-windows"));
  const windowsList = id("workspace-windows-list");
  await waitFor(windowsList);
  await t.sleep(400);
  await t.js(`document.querySelector(${JSON.stringify(windowsList)}).scrollTop = 10000`);
  await capture("19-compact-windows-scrolled");
  t.checks.compactWindowsCanScrollToClear = await fitsInside('[aria-label="Clear workspace"]', windowsList);
  t.checks.visualViewportDoesNotOverflow = noOverflow();
}

// A populated library through the same controls the user operates. No test data enters an ordinary app profile.
/** @param {any} t */
async function galleryGroup(t) {
  const { checks, results, js } = t;
  const label = (/** @type {string} */ name) => `[aria-label=${JSON.stringify(name)}]`;
  const id = (/** @type {string} */ name) => `[data-testid=${JSON.stringify(name)}]`;
  const visible = (/** @type {string} */ selector) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => e.getClientRects().length && !e.closest('[aria-hidden=true]'))`);
  const until = async (/** @type {() => Promise<any>} */ read, /** @type {string} */ name) => {
    for (let i = 0; i < 60; i++) { const result = await read(); if (result) return result; await t.sleep(100); }
    await t.shot("gallery-interaction-failure");
    throw new Error(`Timed out waiting for ${name}`);
  };
  const click = async (/** @type {string} */ selector) => {
    const point = await until(() => js(`(() => {
      for (const node of document.querySelectorAll(${JSON.stringify(selector)})) {
        if (node.closest('[aria-hidden=true]')) continue;
        node.scrollIntoView({block:'nearest',inline:'nearest'});
        const r = node.getBoundingClientRect();
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
        if (r.width && r.height && node.contains(document.elementFromPoint(x, y))) return {x,y};
      }
      return null;
    })()`), selector);
    await t.click(point);
  };
  const menu = (/** @type {string} */ name) => click(`[role=menuitem][aria-label^=${JSON.stringify(name)}]`);
  const style = () => click(id("note-style-open"));
  const closeStyle = async () => {
    await click(`[role=dialog]${label("Default note style")} ${label("Close")}`);
    await t.sleep(360);
  };
  const type = (/** @type {string} */ text) => t.contents.insertText(text);
  const name = async (/** @type {string} */ text) => {
    await click(id("library-name"));
    await type(text);
    await t.key("Return");
    await t.sleep(350);
  };
  const newFolder = async (/** @type {string} */ title, nested = false) => {
    if (nested) await click(label("New subfolder"));
    else { await click(`[role=button]${label("Library options")}`); await menu("New folder"); }
    await name(title);
  };
  const folder = (/** @type {string} */ title) => click(`${id("library-folder")}[aria-label^=${JSON.stringify(`${title} folder,`)}]`);
  const add = async (/** @type {string} */ title, /** @type {string} */ text, /** @type {string} */ back) => {
    await click(id("library-new"));
    await name(title);
    await click(".bn-editor .bn-inline-content");
    await type(text);
    await t.sleep(320);
    await click(label(`Back to ${back}`));
  };
  const pdfReady = () => js(`(() => {
    const preview = document.querySelector('[data-testid=library-preview-pdf]');
    const image = preview?.matches('img') ? preview : preview?.querySelector('img');
    return !!image?.complete && image.naturalWidth > 0;
  })()`);
  const headingTop = () => js(`document.querySelector('[data-testid=library-heading]')?.getBoundingClientRect().top`);
  const titles = () => js(`[...document.querySelectorAll('[data-testid=library-entry-note]')].map((e) => e.getAttribute('aria-label'))`);
  const inBounds = () => js(`(() => {
    const shell = document.querySelector('[data-testid=notes-library]'), r = shell.getBoundingClientRect();
    return [...shell.querySelectorAll('[data-testid=library-folder], [data-testid^=library-entry-]')].every((e) => {
      const box = e.getBoundingClientRect(); return box.left >= r.left - 1 && box.right <= r.right + 1;
    });
  })()`);

  await resetNotesLibrary(t);
  await t.resize(1280, 820);
  const viewport = () => js(`({ width: innerWidth, height: innerHeight, pane: Math.round(document.querySelector('[data-testid=notes-library]').getBoundingClientRect().width) })`);
  await t.open("space=workspace&wsClear=1&wsOpen=notes&wsLayout=focus&theme=signature&mode=dark");
  results.gallery = { wide: await viewport() };
  checks.galleryShowsWideRail = await visible(id("library-rail"));
  await style();
  await click(label("Type"));
  await click(label("Graphite paper"));
  await t.shot("gallery-default-page-desktop");
  await click(`[role=tab]${label("Template")}`);
  await until(() => visible(id("paper-template-ruled-narrow")), "paper gallery");
  checks.galleryShowsTenBasicPapers = (await t.count('[data-testid^=paper-template-]')) === 10;
  checks.galleryShowsRealSpacing = await js(`(() => {
    const path = (name) => document.querySelector('[data-testid=paper-template-ruled-' + name + '] svg path')?.getAttribute('d');
    return path('narrow')?.length > path('wide')?.length;
  })()`);
  await t.shot("gallery-basic-papers-desktop");
  await click(label("Academic"));
  checks.galleryAcademicPapers = (await visible(label("Cornell"))) && (await visible(label("Music")));
  await click(label("Planners"));
  checks.galleryPlannerPapers = (await visible(label("Daily planner"))) && (await visible(label("Weekly planner")));
  await click(label("Journals"));
  checks.galleryJournalPaper = await visible(label("Journal"));
  await click(label("Basic"));
  await click(id("paper-template-grid-narrow"));
  await closeStyle();

  await newFolder("Mathematics");
  await newFolder("Physics");
  await newFolder("Revision");
  await newFolder("Lab journals");
  await folder("Mathematics");
  await newFolder("Mechanics", true);
  await newFolder("Past papers", true);
  await click(label("Collapse Mathematics"));
  checks.galleryCanCollapseTree = !(await visible(label("Browse Mechanics")));
  await click(label("Expand Mathematics"));
  checks.galleryCanExpandTree = await visible(label("Browse Mechanics"));
  await click(label("Browse Mechanics"));
  checks.galleryTreeOpensChild = await js(`document.querySelector('[data-testid=library-heading]').textContent === 'Mechanics'`);
  await click(label("Back to Mathematics"));

  await click(id("library-new"));
  await name("Vector spaces");
  await click(".bn-editor .bn-inline-content");
  await type("A basis spans the space and its vectors are linearly independent.");
  await t.sleep(440);
  checks.galleryDarkPaperReadable = await js(`(() => {
    const p = document.querySelector('[data-testid=ink-page]'), text = p.querySelector('.bn-inline-content');
    return getComputedStyle(p).backgroundColor === 'rgb(35, 37, 42)' && getComputedStyle(text).color === 'rgb(246, 244, 239)';
  })()`);
  await click(label("Page settings"));
  await click(`[role=tab]${label("Template")}`);
  await click(id("paper-template-grid-wide"));
  await click(`[role=dialog]${label("Page settings")} ${label("Close")}`);
  await t.sleep(380);
  await click(label("Back to Mathematics"));
  await style();
  await click(label("Cream paper"));
  await click(`[role=tab]${label("Template")}`);
  await click(id("paper-template-ruled-medium"));
  await closeStyle();
  await add("Linear maps", "A linear map preserves addition and scalar multiplication. Check the kernel before using rank-nullity.", "Mathematics");
  await click(`[role=button]${label("Library options")}`);
  await menu("Arrange items");
  await click(label("Move Vector spaces up"));
  checks.galleryManualOrderApplies = (await titles())[0] === "Vector spaces, Note";
  await click(label("Done arranging"));
  await click(`[role=button]${label("Sort library")}`);
  await menu("Name");
  checks.galleryNameSortWorks = (await titles())[0] === "Linear maps, Note";
  await click(`[role=button]${label("Sort library")}`);
  await menu("Folder order");
  await click(label("List view"));
  checks.galleryListViewWorks = await visible(id("library-list"));
  await click(label("Grid view"));
  checks.galleryGridViewReturns = await visible(id("library-gallery"));

  await click(label("Browse Physics"));
  await add("Optics", "Ray diagrams show how lenses form images. Measure the focal length from the optical centre.", "Physics");
  await add("Wave motion", "Period and frequency are reciprocals. Use the distance between two crests for the wavelength.", "Physics");
  await click(label("Wave motion, Note"));
  await click(id("note-mode-write"));
  const writing = 'canvas[aria-label="Writing surface"]';
  await until(() => visible(writing), "writing canvas");
  const canvas = await t.rect(writing);
  const x = Math.round(canvas.x + 120), y = Math.round(canvas.y + 250);
  await t.drag({ x, y }, { x: x + 80, y: y - 48 });
  await t.drag({ x: x + 80, y: y - 48 }, { x: x + 160, y: y + 48 });
  await t.drag({ x: x + 160, y: y + 48 }, { x: x + 240, y });
  await click(label("Back to Physics"));
  checks.galleryRendersRealInk = await until(() => t.has(id("library-preview-ink")), "saved ink thumbnail");

  await click(label("Browse Revision"));
  await add("Revision plan", "Warm up with two questions. Spend 25 minutes on practice, then record the mistakes to revisit.", "Revision");
  await click(label("Browse Lab journals"));
  await add("Refraction lab", "Record the incident and refracted angles. Repeat each reading and compare the means.", "Lab journals");
  await t.open("space=workspace&wsClear=1");
  await dropStudyPdf(js);
  await until(async () => (await t.workspace())?.windows?.some((/** @type {any} */ win) => win.tool === "pdfs" && win.state.document), "imported PDF");
  await t.open("space=workspace&wsClear=1&wsOpen=notes&wsLayout=focus");
  checks.galleryRendersImportedPdf = await until(pdfReady, "rendered PDF thumbnail");
  checks.galleryAggregatesDocuments = (await t.count('[data-testid^=library-entry-]')) === 7;
  checks.galleryKeepsExcerptOnQuickReturn = await js(`document.querySelector('[aria-label="Refraction lab, Note"]').textContent.includes('refracted angles')`);
  await t.shot("gallery-all-notes-desktop");
  await click(label("Imported PDFs"));
  checks.galleryFiltersImportedPdfs = (await t.count(id("library-entry-pdf"))) === 1 && (await t.count(id("library-entry-note"))) === 0;
  await click(label("Browse Mathematics"));
  checks.galleryManualOrderSurvivesIndexedDb = (await titles())[0] === "Vector spaces, Note";
  await click(label("Folders"));
  checks.galleryExpandedFolderKeepsItsTitle = await js(`(() => {
    const row = document.querySelector('[aria-label="Browse Mathematics"]');
    if (!row?.textContent.includes('Mathematics')) return false;
    const r = row.getBoundingClientRect();
    return r.width > 100 && row.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })()`);
  await until(pdfReady, "unfiled PDF thumbnail");
  await t.shot("gallery-folders-desktop");
  checks.galleryDesktopCardsFit = await inBounds();

  await t.resize(820, 860);
  await t.open("space=workspace&wsClear=1&wsOpen=notes&wsLayout=focus&theme=cozy&mode=light");
  checks.galleryTabletUsesDrawer = (await visible(id("library-browse"))) && !(await visible(id("library-rail")));
  await t.shot("gallery-tablet-light");
  results.gallery.tablet = await viewport();
  await t.resize(390, 720);
  results.gallery.phone = await viewport();
  const headingBeforeBrowse = await headingTop();
  await click(id("library-browse"));
  await t.sleep(300);
  checks.galleryDrawerPreservesPosition = Math.abs((await headingTop()) - headingBeforeBrowse) < 1;
  await t.shot("gallery-phone-navigation");
  await click(label("Folders"));
  await t.shot("gallery-phone-folders");
  checks.galleryPhoneCardsFit = await inBounds();
  const headingBeforeStyle = await headingTop();
  await style();
  await t.sleep(300);
  checks.galleryStylePreservesPosition = Math.abs((await headingTop()) - headingBeforeStyle) < 1;
  await t.shot("gallery-phone-page");
  await click(`[role=tab]${label("Template")}`);
  await t.shot("gallery-phone-templates");
  await closeStyle();

  await t.resize(320, 640);
  results.gallery.small = await viewport();
  checks.gallery320CardsFit = await inBounds();
  await t.resize(1280, 760);
  await t.open("space=workspace&wsClear=1&wsOpen=notes,calculator&wsLayout=split&theme=voxel&mode=dark&accent=edca64&night=1f2e28&textScale=1.25");
  await until(() => visible(id("library-browse")), "loaded Notes split pane");
  checks.gallerySplitUsesPaneWidth = !(await visible(id("library-rail"))) && (await visible(id("library-browse"))) && await inBounds();
  await until(pdfReady, "split-pane PDF thumbnail");
  await t.shot("gallery-split-custom");
  results.gallery.split = await viewport();
}

/** @param {any} t */
async function notesGroup(t) {
  const { checks, results, js } = t;
  const says = (/** @type {string} */ text) => js(`document.body.innerText.includes(${JSON.stringify(text)})`);
  const label = (/** @type {string} */ text) => `[aria-label=${JSON.stringify(text)}]`;
  const typeText = async (/** @type {string} */ text) => { for (const ch of text) await t.key(ch === " " ? "Space" : ch); };
  const clickReady = async (/** @type {string} */ selector) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const point = await js(`(() => {
        for (const element of document.querySelectorAll(${JSON.stringify(selector)})) {
          const rect = element.getBoundingClientRect();
          const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
          if (rect.width && rect.height && element.contains(document.elementFromPoint(x, y))) return { x, y };
        }
        return null;
      })()`);
      if (point) { await t.click(point); return; }
      await t.sleep(100);
    }
    throw new Error(`no pointer target at ${selector}`);
  };
  const menuItem = (/** @type {string} */ text) => clickReady(`[role=menuitem][aria-label^=${JSON.stringify(text)}]`);
  // Ink pixels on a page's finished-stroke canvas: anything darker than the paper.
  const inked = (/** @type {number} */ index = 0) => js(`(() => { const c = document.querySelectorAll('[data-testid=ink-view] canvas')[${index} * 2]; if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 420) n++; return n; })()`);
  const pen = (/** @type {string} */ selector, /** @type {[number, number][]} */ points, type = "pen") => js(`(async () => {
    const c = document.querySelector(${JSON.stringify(selector)}); const r = c.getBoundingClientRect(); const pts = ${JSON.stringify(points)};
    const fire = (kind, [x, y], p) => c.dispatchEvent(new PointerEvent(kind, { pointerId: 1, pointerType: ${JSON.stringify(type)}, clientX: r.left + x, clientY: r.top + y, pressure: p, bubbles: true, cancelable: true, isPrimary: true, button: 0, buttons: kind === 'pointerup' ? 0 : 1 }));
    const frames = []; let last = performance.now(); let running = true; const tick = (now) => { frames.push(now - last); last = now; if (running) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const handler = []; fire('pointerdown', pts[0], 0.3);
    for (let i = 1; i < pts.length; i++) { const t0 = performance.now(); fire('pointermove', pts[i], 0.3 + 0.5 * Math.sin(i / pts.length * Math.PI)); handler.push(performance.now() - t0); await new Promise((res) => setTimeout(res, 8)); }
    fire('pointerup', pts.at(-1), 0); running = false;
    handler.sort((a, b) => a - b); frames.sort((a, b) => a - b);
    return { handlerP50: handler[handler.length >> 1], handlerP95: handler[Math.floor(handler.length * 0.95)], frameP50: frames[frames.length >> 1], frameP95: frames[Math.floor(frames.length * 0.95)], frames: frames.length };
  })()`);
  const wave = (/** @type {number} */ ox, /** @type {number} */ oy, n = 120) => Array.from({ length: n }, (_, i) => /** @type {[number, number]} */ ([ox + i * 2.5, oy + 18 * Math.sin(i / 7)]));

  await resetNotesLibrary(t);
  await t.open("space=workspace&wsOpen=notes&wsLayout=focus");
  await t.sleep(900);
  checks.notesStartsWithNewAndStyle = (await says("New note")) && (await t.has("[data-testid=note-style-open]"));
  await t.shot("notes-01-empty-library");

  // One note kind: typing on the page with real keys, markdown shortcuts, autosave, an automatic title, and it survives a reload.
  // New asks for a name first; none keeps the automatic title from the first line.
  await clickReady(label("New note"));
  await t.sleep(400);
  checks.newAsksForAName = await t.has("[data-testid=library-name]");
  await t.key("Return");
  for (let wait = 0; wait < 40 && !(await t.has(".sylf-note .bn-editor")); wait++) await t.sleep(250);
  await clickReady(".sylf-note .bn-editor .bn-inline-content");
  await typeText("# Complex numbers");
  await t.key("Return");
  await typeText("The modulus of z is its distance from the origin.");
  await t.key("Return");
  await typeText("- Argand diagram");
  await t.sleep(900);
  checks.typedHeadingFromMarkdown = await js(`!!document.querySelector('.sylf-note [data-content-type=heading]')`);
  checks.typedListFromMarkdown = await js(`!!document.querySelector('.sylf-note [data-content-type=bulletListItem]')`);
  await t.key("Return"); await t.key("Return");
  await t.key("/");
  await t.sleep(400);
  checks.slashMenuOpens = await t.has('[role=listbox][aria-label=Blocks]');
  await t.key("Escape");
  await t.sleep(700);
  await clickReady(label("Formatting"));
  await menuItem("Heading 2");
  // The menu closes, hands focus to its trigger and the trigger hands it to the editor: read the result once that has settled.
  for (let attempt = 0; attempt < 10; attempt++) {
    await t.sleep(150);
    checks.formattingMenuAppliesAndResumesTyping = await js(`document.activeElement?.matches('.bn-editor') && !!document.querySelector('.bn-editor [data-level="2"]')`);
    if (checks.formattingMenuAppliesAndResumesTyping) break;
  }
  if (!checks.formattingMenuAppliesAndResumesTyping) console.log("SYLF_NOTE formatting " + await js(`JSON.stringify({ active: document.activeElement?.tagName + "." + String(document.activeElement?.className).slice(0, 40) + "[" + document.activeElement?.getAttribute("aria-label") + "]", blocks: [...document.querySelectorAll(".bn-editor [data-content-type]")].map((n) => n.getAttribute("data-content-type") + ":" + n.getAttribute("data-level") + ":" + n.textContent.slice(0, 20)), menu: !!document.querySelector("[role=menu]"), windowHasFocus: document.hasFocus() })`));
  if (await says("Saved")) {
    checks.typedNoteSaves = true;
  } else {
    await clickReady(label("Document options"));
    await t.sleep(250);
    checks.typedNoteSaves = await t.has('[role=menuitem][aria-label="Saved"]');
    await t.key("Escape");
    await t.sleep(250);
  }
  checks.typedNoteTitledFromFirstLine = (await t.workspace())?.windows?.some((/** @type {any} */ w) => w.state.title === "Complex numbers");
  await t.shot("notes-02-typed-note");
  // A control-wheel on the gutter zooms the document even in Type mode and is capped at both ends.
  const paperWidth = () => t.js(`document.querySelector('[data-testid=ink-page]').getBoundingClientRect().width`);
  const fitted = await paperWidth();
  const beforeNoteZoom = (await t.workspace())?.camera?.zoom;
  const gutter = await t.js(`(() => { const r = document.querySelector('[data-owns-wheel=all]').getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + 70) }; })()`);
  await t.wheel(gutter, 0, -600, ["control"]);
  await t.sleep(350);
  checks.noteZoomStopsAt300 = Math.abs((await paperWidth()) / fitted - 3) < 0.03;
  await t.wheel(gutter, 0, 600, ["control"]);
  await t.sleep(350);
  checks.noteZoomStopsAt50 = Math.abs((await paperWidth()) / fitted - 0.5) < 0.03;
  checks.noteZoomLeavesCanvasAlone = (await t.workspace())?.camera?.zoom === beforeNoteZoom;
  await t.open("space=workspace");
  await t.sleep(1500);
  checks.typedNoteSurvivesReload = await js(`[...document.querySelectorAll('.sylf-note .bn-inline-content')].some((n) => n.textContent.includes('distance from the origin'))`);

  // A search across folders returns to the same query and folder after opening a result.
  await clickReady(label("Back to Notes")).catch(async (error) => {
    await t.shot("notes-reload-failure");
    const restored = await t.workspace();
    const labels = await js(`[...document.querySelectorAll('[data-testid=document-back]')].map((element) => element.getAttribute('aria-label'))`);
    throw new Error(`${error.message}; restored ${JSON.stringify(restored?.windows?.map((/** @type {any} */ w) => [w.id, w.state.title, Boolean(w.state.document), w.minimized]))}; back buttons ${JSON.stringify(labels)}`);
  });
  await clickReady(label("Library options"));
  await menuItem("New folder");
  await clickReady("[data-testid=library-name]");
  await typeText("Practice");
  await t.key("Return");
  await t.sleep(270);
  await clickReady(label("Practice folder, 0 items"));
  checks.libraryOpensFolder = await says("This folder is empty");
  await clickReady('input[aria-label="Search"]');
  await typeText("origin");
  const queryBeforeOpen = await js(`document.querySelector('input[aria-label="Search"]')?.value`);
  await clickReady(label("Complex numbers, Note"));
  await clickReady(label("Back to search results")).catch(async (error) => {
    await t.shot("notes-library-query-failure");
    const labels = await js(`[...document.querySelectorAll('[aria-label^="Back to "]')].map((control) => control.getAttribute('aria-label'))`);
    throw new Error(`${error.message}; query was ${JSON.stringify(queryBeforeOpen)}; visible return labels ${JSON.stringify(labels)}`);
  });
  checks.libraryRestoresQuery = await js(`document.querySelector('input[aria-label="Search"]')?.value === 'origin'`);
  await clickReady('input[aria-label="Search"]');
  for (let index = 0; index < "origin".length; index++) await t.key("Backspace");
  const queryAfterClear = await js(`document.querySelector('input[aria-label="Search"]')?.value`);
  checks.libraryRestoresFolder = queryAfterClear === "" && await says("This folder is empty");
  await clickReady(label("Back to Folders"));

  // Handwriting: a mouse stroke through the real input path, then pen strokes with pressure, eraser and history.
  await clickReady("[data-testid=library-new]");
  await t.sleep(400);
  await typeText("Handwriting");
  await t.key("Return");
  await t.sleep(1000);
  checks.newOpensTheNamedNote = (await t.workspace())?.windows?.some((/** @type {any} */ w) => w.state.title === "Handwriting");
  await clickReady("[data-testid=note-mode-write]");
  await t.sleep(400);
  checks.noteSwitchesToWriting = await t.has(label("Eraser"));
  const page = await t.rect('[data-testid=ink-view]');
  await t.drag({ x: page.x + 80, y: page.y + 120 }, { x: page.x + 320, y: page.y + 150 }, 20, 12);
  checks.mouseStrokeInks = (await inked()) > 30;
  results.penStroke = await pen('[data-testid=ink-view] canvas[aria-label="Writing surface"]', wave(80, 240));
  results.penStroke2 = await pen('[data-testid=ink-view] canvas[aria-label="Writing surface"]', wave(80, 330, 200));
  await t.sleep(300);
  results.inkPixels = await inked();
  checks.penStrokesInk = results.inkPixels > 200;
  checks.penHandlerFast = results.penStroke2.handlerP95 < 4;
  checks.penFramesSmooth = results.penStroke2.frameP95 < 25;
  checks.penTurnsFingersToScrolling = await t.has(label("Fingers scroll; the pen writes"));
  await t.shot("notes-03-handwriting");
  await clickReady(label("Eraser"));
  await t.drag({ x: page.x + 150, y: page.y + 100 }, { x: page.x + 160, y: page.y + 170 }, 10, 12);
  const afterErase = await inked();
  checks.eraserRemovesStroke = afterErase < results.inkPixels;
  await clickReady(label("Undo"));
  await t.sleep(200);
  checks.undoRestoresStroke = (await inked()) > afterErase;
  // One sweep over everything leaves nothing, the last stroke included, and one undo brings it all back.
  await clickReady(label("Eraser"));
  // Inside the page, whatever the window's size: a drag that leaves the window would move the canvas instead.
  const right = Math.min(page.width - 30, 560), bottom = Math.min(page.height - 30, 380);
  await t.drag({ x: page.x + 60, y: page.y + 90 }, { x: page.x + 60, y: page.y + bottom }, 6, 16);
  await t.drag({ x: page.x + 60, y: page.y + bottom }, { x: page.x + right, y: page.y + 90 }, 6, 16);
  await t.drag({ x: page.x + right, y: page.y + 90 }, { x: page.x + right, y: page.y + bottom }, 6, 16);
  for (let x = 90; x <= right; x += 40) await t.drag({ x: page.x + x, y: page.y + 90 }, { x: page.x + x, y: page.y + bottom }, 4, 12);
  results.inkAfterSweep = await inked();
  checks.eraserRemovesEveryStroke = results.inkAfterSweep < 20;
  await clickReady(label("Undo"));
  await t.sleep(200);
  checks.oneUndoPerSweep = (await inked()) > 0;
  await t.shot("notes-03b-erased-and-undone");

  // The toolbar: the eraser has its own settings, a tool keeps its place whatever is in hand, a gesture whose lift was lost cannot
  // go on erasing under a hovering pointer, and the pen writes straight after an erasing sweep.
  await t.key("Escape");
  await t.sleep(250);
  const toolSpots = () => js(`['pen','highlighter','eraser','lasso','shape'].map((name) => Math.round(document.querySelector('[data-testid=ink-tool-' + name + ']')?.getBoundingClientRect().x ?? -1))`);
  if ((await toolSpots()).every((/** @type {number} */ x) => x >= 0)) {
    await clickReady("[data-testid=ink-tool-eraser]");
    await t.sleep(250);
    if (!(await t.has("[data-testid=eraser-mode-precise]"))) { await clickReady("[data-testid=ink-tool-eraser]"); await t.sleep(300); }
    checks.eraserSettingsOpen = (await t.has("[data-testid=eraser-mode-precise]")) && (await t.has("[data-testid=eraser-clear-page]"));
    if (await t.has("[data-testid=eraser-mode-precise]")) await clickReady(`[role=dialog] ${label("Close")}`);
    await t.sleep(400);
    checks.eraserSettingsClose = !(await t.has("[data-testid=eraser-mode-precise]"));
    const withEraser = await toolSpots();
    const inkBeforeStale = await inked();
    // A press that never hears its lift, then a hovering move across the ink with no button held.
    await js(`(() => { const c = document.querySelector('[data-testid=ink-view] canvas[aria-label="Writing surface"]'); const r = c.getBoundingClientRect(); const fire = (kind, x, y, buttons) => c.dispatchEvent(new PointerEvent(kind, { pointerId: 1, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, isPrimary: true, button: 0, buttons })); fire('pointerdown', 20, 20, 1); for (let y = 30; y < 380; y += 12) fire('pointermove', 150, y, 0); return true; })()`);
    await t.sleep(200);
    checks.lostLiftStopsErasing = (await inked()) === inkBeforeStale;
    await clickReady("[data-testid=ink-tool-pen]");
    await t.sleep(250);
    const withPen = await toolSpots();
    checks.toolsKeepTheirPlace = withEraser.every((/** @type {number} */ x, /** @type {number} */ i) => x === withPen[i]);
    await t.drag({ x: page.x + 80, y: page.y + 60 }, { x: page.x + 260, y: page.y + 70 }, 8, 12);
    await t.sleep(250);
    checks.penWritesAfterErasing = (await inked()) > inkBeforeStale;
    await t.shot("notes-03f-toolbar");
  }
  // The zoom shows at the top right while it changes, step by step, not only when it settles.
  const zoomSeen = await js(`(async () => { const c = document.querySelector('[data-testid=ink-view] canvas[aria-label="Writing surface"]'); const r = c.getBoundingClientRect(); const area = c.closest('[data-owns-wheel]')?.parentElement; const seen = []; let side = null;
    for (let i = 0; i < 8; i++) { c.dispatchEvent(new WheelEvent('wheel', { deltaY: -6, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.left + 120, clientY: r.top + 120 })); await new Promise((done) => setTimeout(done, 45)); const badge = document.querySelector('[data-testid=zoom-badge]'); if (badge) { seen.push(badge.textContent); const b = badge.getBoundingClientRect(), host = badge.parentElement.getBoundingClientRect(); side = { right: Math.round(host.right - b.right), top: Math.round(b.top - host.top) }; } }
    for (let i = 0; i < 8; i++) { c.dispatchEvent(new WheelEvent('wheel', { deltaY: 6, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.left + 120, clientY: r.top + 120 })); await new Promise((done) => setTimeout(done, 45)); }
    return { seen, side }; })()`);
  results.zoomBadge = zoomSeen;
  checks.zoomShowsWhileChanging = new Set(zoomSeen.seen).size >= 4;
  checks.zoomShowsAtTopRight = !!zoomSeen.side && zoomSeen.side.right >= 0 && zoomSeen.side.right <= 32 && zoomSeen.side.top >= 0 && zoomSeen.side.top <= 32;
  await t.sleep(1300);
  checks.zoomBadgeLeaves = await js(`(() => { const badge = document.querySelector('[data-testid=zoom-badge]'); return !badge || Number(getComputedStyle(badge).opacity) < 0.05; })()`);

  // Pull to add a page: at the end of a paged note, a pause and more scrolling adds one.
  const pagesNow = async () => js(`Number(document.querySelector('[data-testid=note-pages]')?.getAttribute('aria-label')?.split(' of ').at(-1) ?? 0)`);
  const before = await pagesNow();
  checks.noPermanentPullZone = !(await t.has("[data-testid=note-pull-zone]"));
  const centre = { x: page.x + 200, y: page.y + 200 };
  for (let i = 0; i < 40; i++) await t.wheel(centre, 0, 120);
  await t.sleep(600);
  checks.scrollingStopsAtPaper = await js(`(() => {
    const page = [...document.querySelectorAll('[data-testid=ink-page]')].at(-1);
    for (let scroll = page?.parentElement; scroll; scroll = scroll.parentElement) {
      if (getComputedStyle(scroll).overflowY !== 'auto' || scroll.scrollHeight <= scroll.clientHeight) continue;
      return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2
        && scroll.getBoundingClientRect().bottom - page.getBoundingClientRect().bottom <= 22;
    }
    return false;
  })()`);
  await t.wheel(centre, 0, 120);
  checks.pullShowsProgress = await t.has("[data-testid=note-pull-zone]");
  for (let i = 0; i < 7; i++) await t.wheel(centre, 0, 120);
  await t.sleep(900);
  results.pagesAfterPull = { before, after: await pagesNow() };
  checks.pullAddsPage = results.pagesAfterPull.after === before + 1;
  await t.shot("notes-03c-pull-added-page");

  await clickReady("[data-testid=note-pages]");
  await t.sleep(250);
  await clickReady(label("Page 1"));
  checks.pagePickerJumpsToFirstPage = await t.has(label(`Pages, page 1 of ${results.pagesAfterPull.after}`));
  await clickReady("[data-testid=note-pages]");
  await t.sleep(250);
  await clickReady(label("Add page"));
  checks.pagePickerAddsAndOpensPage = await t.has(label(`Pages, page 2 of ${results.pagesAfterPull.after + 1}`));
  await t.sleep(450);

  // Page only fills the screen with the document and then restores both windows on the Canvas.
  await t.open("space=workspace&wsOpen=calculator&wsLayout=split");
  await t.sleep(450);
  const noteId = (await t.workspace()).windows.find((/** @type {any} */ w) => w.state.title === "Handwriting")?.id;
  const noteWindow = t.windowSel(noteId);
  checks.pagePickerRestoresPage = await t.has(`${noteWindow} ${label(`Pages, page 2 of ${results.pagesAfterPull.after + 1}`)}`);
  await clickReady(`${noteWindow} [data-testid=document-page-only]`);
  await t.sleep(600);
  const state0 = await t.workspace();
  checks.pageOnlyFillsAndHidesBars = state0.layout === "fill" && state0.windows.filter((/** @type {any} */ w) => !w.minimized).length === 1
    && !(await t.has(`${noteWindow} [data-testid^=window-bar-]`)) && !(await t.has(label("Back to Notes"))) && (await t.has(label("Eraser")));
  await t.shot("notes-03d-page-only");
  await clickReady(`${noteWindow} [data-testid=document-page-only]`);
  await t.sleep(500);
  const afterPageOnly = await t.workspace();
  checks.pageOnlyRestoresWindows = (await t.has(`${noteWindow} [data-testid^=window-bar-]`)) && (await t.has(label("Back to Notes")))
    && afterPageOnly.layout === "free" && afterPageOnly.windows.some((/** @type {any} */ w) => w.tool === "calculator" && !w.minimized);
  await t.open("space=workspace&wsLayout=focus");

  // An endless note grows as it is written near its end.
  // Renamed where the title is read: the window's title bar.
  await clickReady("[data-testid=window-title]");
  await t.sleep(300);
  results.renameField = await js(`({ open: !!document.querySelector('[data-testid=window-title-input]'), focused: document.activeElement?.getAttribute('data-testid') })`);
  await t.key("a", [process.platform === "darwin" ? "meta" : "control"]);
  await typeText("Renamed");
  await t.key("Return");
  await t.sleep(600);
  results.titlesAfterRename = (await t.workspace())?.windows?.map((/** @type {any} */ w) => w.state.title);
  checks.renameFromTitleBar = results.titlesAfterRename?.includes("Renamed");
  // The note style behind the gear: endless pages for the next note, then back to separate pages.
  await clickReady(label("Back to Notes"));
  await t.sleep(400);
  await clickReady("[data-testid=note-style-open]");
  await t.sleep(500);
  await clickReady(label("Endless"));
  await t.key("Escape");
  await t.sleep(400);
  await clickReady("[data-testid=library-new]");
  await t.sleep(400);
  await t.key("Return");
  await t.sleep(1000);
  await clickReady("[data-testid=note-mode-write]");
  await t.sleep(300);
  const endlessBefore = (await t.rect('[data-testid=ink-page]')).height;
  // Scroll to the end of the page and write just above it.
  await js(`(() => { let el = document.querySelector('[data-testid=ink-page]').parentElement; while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight; return !!el; })()`);
  await t.sleep(600);
  const nearEnd = await js(`(() => { const c = document.querySelector('[data-testid=ink-view] canvas[aria-label="Writing surface"]').getBoundingClientRect(); const p = document.querySelector('[data-testid=ink-page]').getBoundingClientRect(); return Math.min(p.bottom, c.bottom) - c.top - 70; })()`);
  await clickReady(label("Pen"));
  await t.sleep(250);
  const penPanel = '[role=dialog][aria-label="Pen settings"]';
  if (!(await t.has(penPanel))) await clickReady(label("Pen"));
  await t.sleep(250);
  checks.penSettingsReachable = (await t.has(`${penPanel} [role=switch][aria-label="Pen pressure"]`))
    && (await t.has(`${penPanel} [aria-label="Mix a colour"]`));
  await clickReady(`${penPanel} ${label("Close")}`);
  await t.sleep(220);
  await pen('[data-testid=ink-view] canvas[aria-label="Writing surface"]', wave(60, nearEnd, 80));
  await t.shot("notes-03e-endless");
  await t.sleep(600);
  results.endlessPage = { before: endlessBefore, after: (await t.rect('[data-testid=ink-page]')).height };
  checks.endlessNoteGrows = results.endlessPage.after > results.endlessPage.before;
  await clickReady(label("Back to Notes"));
  await t.sleep(400);
  await clickReady("[data-testid=note-style-open]");
  await t.sleep(500);
  await clickReady(label("Separate pages"));
  await t.key("Escape");
  await t.sleep(300);

  // PDFs: a file dropped on Workspace is imported, rendered by pdf.js, and annotated.
  await t.open("space=workspace&wsClear=1");
  await t.sleep(600);
  await dropStudyPdf(js);
  await t.sleep(2500);
  let state = await t.workspace();
  checks.pdfDropOpensWindow = state?.windows?.some((/** @type {any} */ w) => w.tool === "pdfs" && typeof w.state.document === "string");
  results.pdfPagePixels = await js(`(() => { const c = [...document.querySelectorAll('[data-testid=ink-page] canvas')].find((x) => !x.getAttribute('aria-label') && !x.closest('[data-testid=ink-view]')); if (!c || !c.width) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128) n++; return n; })()`);
  checks.pdfPageRenders = results.pdfPagePixels > 50;
  checks.pdfShowsPageCount = await says("1 / 2");
  results.pdfHighlight = await pen('[data-testid=ink-view] canvas[aria-label="Writing surface"]', Array.from({ length: 40 }, (_, i) => [60 + i * 6, 120]), "mouse");
  await t.sleep(300);
  await t.shot("notes-04-pdf-annotated");
  // Notes beside the paper, linked both ways. The link can leave page-only without losing the Canvas.
  await clickReady("[data-testid=document-page-only]");
  await t.sleep(500);
  await clickReady(label("Document options"));
  await menuItem("Take notes beside this");
  await t.sleep(1500);
  state = await t.workspace();
  checks.notesBesideOpensSecondWindow = state.windows.filter((/** @type {any} */ w) => w.tool === "notes" || w.tool === "pdfs").length === 2;
  checks.notesBesideRestoresCanvas = state.layout === "free" && state.windows.every((/** @type {any} */ w) => w.state.bare !== true);
  checks.notesBesideUsesTemplate = await js(`[...document.querySelectorAll('.sylf-note [data-content-type=heading]')].some((n) => n.textContent.includes('Key ideas'))`);
  const linkedNote = state.windows.find((/** @type {any} */ w) => w.tool === "notes");
  await clickReady(`${t.windowSel(linkedNote?.id)} ${label("Document options")}`);
  await t.sleep(250);
  checks.linkedDocumentInOptions = await t.has('[role=menuitem][aria-label^="Open Past paper"]');
  await t.key("Escape");
  await t.sleep(250);
  await t.shot("notes-05-notes-beside-pdf");

  // Saved layout: keep this pair, clear the canvas, bring it back on the same documents.
  await clickReady(t.dock("layout"));
  await menuItem("Save this layout");
  await clickReady('[role=alertdialog][aria-label="Save this layout"] input[aria-label="Name"]');
  await typeText("Paper and notes");
  await t.key("Return");
  await t.sleep(400);
  const kept = (await t.workspace()).windows.map((/** @type {any} */ w) => w.state.document).sort();
  await js(`(() => { const raw = JSON.parse(localStorage.getItem('sylf.native.spaces.v1')); raw.snapshots.workspace.windows = []; raw.snapshots.workspace.recent = []; raw.snapshots.workspace.focused = null; localStorage.setItem('sylf.native.spaces.v1', JSON.stringify(raw)); return true; })()`);
  await t.open("space=workspace");
  await clickReady(t.dock("layout"));
  await menuItem("Paper and notes");
  await t.sleep(1200);
  state = await t.workspace();
  checks.savedLayoutReopensSameDocuments = JSON.stringify(state.windows.map((/** @type {any} */ w) => w.state.document).sort()) === JSON.stringify(kept);

  // Whiteboard: draw, zoom with Control and the wheel, and the camera is kept in the window.
  await t.open("space=workspace&wsClear=1&wsOpen=whiteboard&wsLayout=focus");
  await t.sleep(800);
  await clickReady("[data-testid=library-new]");
  await t.sleep(400);
  await t.key("Return");
  for (let wait = 0; wait < 30 && !(await t.has('[data-testid=board-canvas] canvas')); wait++) await t.sleep(200);
  const board = await t.rect('[data-testid=board-canvas]');
  results.boardStroke = await pen('[data-testid=board-canvas] canvas[aria-label="Writing surface"]', wave(board.width / 2 - 150, board.height / 2, 120));
  const mid = { x: Math.round(board.x + board.width / 2), y: Math.round(board.y + board.height / 2) };
  for (let i = 0; i < 6; i++) await t.wheel(mid, 0, 8, ["control"]);
  await t.sleep(700);
  state = await t.workspace();
  checks.boardZoomKeptInWindow = typeof state.windows[0]?.state?.bz === "number" && state.windows[0].state.bz !== 1;
  checks.boardInks = (await inked()) > 30;
  await t.shot("notes-06-whiteboard");

  // The Resource Shelf lists everything made above and opens each in its own tool.
  await t.open("space=workspace&wsClear=1&wsOpen=resources");
  await t.sleep(900);
  results.shelfRows = await t.count("[data-testid^=shelf-]");
  checks.shelfListsLibrary = results.shelfRows >= 4;
  await clickReady("[data-testid=shelf-pdf]");
  await t.sleep(900);
  checks.shelfOpensDocument = (await t.workspace()).windows.some((/** @type {any} */ w) => w.tool === "pdfs" && typeof w.state.document === "string");
  await t.shot("notes-07-shelf");

  // The command palette finds a note by its text and opens it.
  await t.open("space=home");
  await t.sleep(900);
  await clickReady("[data-testid=palette-open]");
  for (let wait = 0; wait < 30 && !(await t.has("[data-testid=command-palette]")); wait++) await t.sleep(200);
  // The field takes focus a moment after the palette appears; keys sent before that are lost.
  for (let wait = 0; wait < 30 && !(await js(`document.activeElement?.getAttribute('aria-label') === 'Search Sylf'`)); wait++) await t.sleep(100);
  await typeText("origin");
  await t.sleep(300);
  checks.paletteTypedQuery = await js(`document.activeElement?.value === 'origin'`);
  await t.sleep(300);
  await t.shot("notes-08-command-palette");
  await t.key("Return");
  await t.sleep(1500);
  state = await t.workspace();
  checks.paletteOpensNoteByText = state.windows.some((/** @type {any} */ w) => w.state.title === "Complex numbers");
  await t.resize(420, 800);
  await t.open("space=workspace&theme=cozy&mode=dark&accent=ffae80&night=192923");
  const compactNote = t.windowSel((await t.workspace()).focused);
  await clickReady(`${compactNote} [data-testid=note-mode-write]`);
  await clickReady(`${compactNote} ${label("Writing tools")}`);
  await t.sleep(350);
  checks.compactWritingToolsStayReachable = await t.has('[role=dialog][aria-label="Writing tools"] [aria-label="Eraser"]')
    && await t.has('[role=dialog][aria-label="Writing tools"] [aria-label^="Colour #"]');
  await t.shot("notes-09-compact-writing");
  await t.key("Escape");
  await t.sleep(250);
  await clickReady(`${compactNote} ${label("Document options")}`);
  await menuItem("Full screen");
  await t.sleep(450);
  checks.compactPageOnlyCanExit = (await t.has(`${compactNote} ${label("Exit full screen")}`))
    && !(await t.has(`${compactNote} [data-testid^=window-bar-]`));
  await clickReady(`${compactNote} [data-testid=document-page-only]`);
}
