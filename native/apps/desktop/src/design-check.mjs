// @ts-check
// Automated design-system verification in the real Electron window (run with --sylf-design-check).
// Captures every theme in both modes, then exercises keyboard, pointer, adaptive layout, accessibility and frame pacing.
// Prints one SYLF_DESIGN_CHECK line and exits non-zero on any failure. Evidence goes to SYLF_DESIGN_CHECK_OUT.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const CHAPTERS = ["studio", "controls", "overlays"];
const WINDOWS = [{ name: "expanded", width: 1280, height: 820 }, { name: "medium", width: 820, height: 900 }, { name: "compact", width: 480, height: 800 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Electron.BrowserWindow} window */
export async function runDesignCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_DESIGN_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
    app.exit(1);
  }
}

/** @param {Electron.BrowserWindow} window */
async function runChecks(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_DESIGN_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-design-check");
  fs.mkdirSync(out, { recursive: true });
  /** @type {string[]} */
  const consoleErrors = [];
  contents.on("console-message", (/** @type {any} */ event) => { if (event?.level === "error" || event?.level === 3) consoleErrors.push(String(event.message).slice(0, 300)); });

  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  // Captures from a backgrounded window fail intermittently (UnknownVizError); retry after nudging a repaint.
  const shot = async (/** @type {string} */ name) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const image = await contents.capturePage();
        if (!image.isEmpty()) return fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG());
      } catch { /* retry */ }
      contents.invalidate();
      await sleep(400);
    }
    throw new Error(`capturePage failed for ${name}`);
  };
  const key = async (/** @type {string} */ keyCode, /** @type {any[]} */ modifiers = []) => {
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    // Native buttons activate from the character event, so Enter and Space need one too.
    const char = keyCode.length === 1 ? keyCode : keyCode === "Return" ? "\r" : keyCode === "Space" ? " " : null;
    if (char) contents.sendInputEvent({ type: "char", keyCode: char, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(70);
  };
  const open = async (/** @type {string} */ query) => {
    const ready = new Promise((resolve) => {
      const listener = (/** @type {any} */ event) => { if (String(event?.message).startsWith("SYLF_FOUNDATION ")) { contents.off("console-message", listener); resolve(true); } };
      contents.on("console-message", listener);
    });
    await contents.loadURL(`${APP_ORIGIN}/?${query}`);
    await Promise.race([ready, sleep(8000)]);
    await sleep(600);
    await js("document.fonts.ready.then(() => true)");
  };
  const clickLabel = (/** @type {string} */ label) => js(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (el) el.click(); return !!el; })()`);
  const centerOf = (/** @type {string} */ label) => js(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);

  /** @type {Record<string, any>} */
  const results = { renders: {} };
  /** @type {Record<string, boolean>} */
  const checks = {};
  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);

  // 1. Every theme in both modes.
  const documents = new Set();
  for (const theme of THEMES) {
    for (const mode of ["light", "dark"]) {
      for (const chapter of CHAPTERS) {
        await open(`chapter=${chapter}&theme=${theme}&mode=${mode}`);
        await shot(`theme-${theme}-${mode}-${chapter}`);
      }
      const facts = await js(`(() => ({ ground: document.body.style.backgroundColor, polarity: document.querySelector('[role=heading]') ? getComputedStyle(document.querySelector('[role=heading]')).fontFamily : null, overflow: document.documentElement.scrollWidth > innerWidth + 1 }))()`);
      await open(`chapter=documents&theme=${theme}&mode=${mode}`);
      const doc = await js(`(() => { const t = [...document.querySelectorAll('div')].find((e) => e.children.length === 0 && e.textContent.startsWith('Theorem')); const s = getComputedStyle(t); let p = t.parentElement; return { color: s.color, font: s.fontFamily, size: s.fontSize, paper: getComputedStyle(p).backgroundColor }; })()`);
      documents.add(JSON.stringify(doc));
      results.renders[`${theme}-${mode}`] = facts;
    }
  }
  checks.allThemesRenderDistinctGrounds = new Set(Object.values(results.renders).map((r) => r.ground)).size === THEMES.length * 2;
  checks.noThemeOverflowsHorizontally = Object.values(results.renders).every((r) => !r.overflow);
  checks.documentsUnchangedAcrossThemes = documents.size === 1;
  results.document = [...documents][0];

  // 2. Fonts load on demand and the CSP allows them.
  await open("chapter=studio&theme=arcane&mode=dark");
  results.fonts = await js(`({ cinzel: document.fonts.check('16px "Cinzel-Regular"'), alegreya: document.fonts.check('16px "AlegreyaSans-Regular"'), loaded: [...document.fonts].filter((f) => f.status === 'loaded').length })`);
  checks.fontsLoad = results.fonts.cinzel && results.fonts.alegreya;

  // 3. Keyboard: Tab reaches controls, the ring shows, Enter activates, Escape closes and restores focus.
  await open("chapter=overlays&theme=signature&mode=dark");
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    await key("Tab");
    const label = await js(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
    seen.add(label);
    if (label === "Dialog") break;
  }
  results.keyboardReached = [...seen];
  checks.tabReachesControls = seen.has("Dialog") && seen.size > 4;
  await shot("keyboard-focus-ring");
  await key("Return");
  await sleep(450);
  checks.enterActivates = await js(`!!document.querySelector('[role=alertdialog]')`);
  checks.focusMovedIntoDialog = await js(`!!document.activeElement?.closest('[role=alertdialog]')`);
  const trapped = [];
  for (let i = 0; i < 5; i++) { await key("Tab"); trapped.push(await js(`!!document.activeElement?.closest('[role=alertdialog]')`)); }
  checks.focusTrappedInDialog = trapped.every(Boolean);
  await shot("dialog");
  await key("Escape");
  await sleep(450);
  checks.escapeCloses = await js(`!document.querySelector('[role=alertdialog]')`);
  checks.focusRestored = (await js(`document.activeElement?.getAttribute('aria-label')`)) === "Dialog";

  // 4. Pointer: hover shows a tooltip, right-click opens the context menu, an outside click closes it.
  const tip = await centerOf("Pin");
  contents.sendInputEvent({ type: "mouseMove", x: tip.x, y: tip.y });
  await sleep(700);
  checks.hoverShowsTooltip = await js(`!!document.querySelector('[role=tooltip]')`);
  contents.sendInputEvent({ type: "mouseMove", x: 5, y: 400 });
  await sleep(200);
  const area = await centerOf("Example item");
  contents.sendInputEvent({ type: "mouseDown", x: area.x, y: area.y, button: "right", clickCount: 1 });
  contents.sendInputEvent({ type: "mouseUp", x: area.x, y: area.y, button: "right", clickCount: 1 });
  await sleep(500);
  checks.rightClickOpensMenu = await js(`!!document.querySelector('[role=menu]')`);
  await shot("context-menu");
  await key("Escape");
  await sleep(300);

  // 5. Slider by pointer drag and by keyboard, on the real gesture path.
  await open("chapter=controls&theme=signature&mode=dark");
  const slider = await js(`(() => { const e = document.querySelector('[role=slider][aria-label=Volume]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, width: r.width, before: e.getAttribute('aria-valuenow') }; })()`);
  await sleep(200);
  contents.sendInputEvent({ type: "mouseDown", x: Math.round(slider.x + slider.width * 0.2), y: Math.round(slider.y), button: "left", clickCount: 1 });
  for (let i = 3; i <= 8; i++) { contents.sendInputEvent({ type: "mouseMove", x: Math.round(slider.x + slider.width * i * 0.1), y: Math.round(slider.y), button: "left", modifiers: ["leftbuttondown"] }); await sleep(30); }
  contents.sendInputEvent({ type: "mouseUp", x: Math.round(slider.x + slider.width * 0.8), y: Math.round(slider.y), button: "left", clickCount: 1 });
  await sleep(300);
  results.sliderDrag = { before: slider.before, after: await js(`document.querySelector('[role=slider][aria-label=Volume]').getAttribute('aria-valuenow')`) };
  checks.sliderDrags = Math.abs(Number(results.sliderDrag.after) - 0.8) < 0.06;
  await js(`document.querySelector('[role=slider][aria-label=Volume]').focus()`);
  await key("Right");
  checks.sliderKeyboard = Number(await js(`document.querySelector('[role=slider][aria-label=Volume]').getAttribute('aria-valuenow')`)) > Number(results.sliderDrag.after);

  // 6. Adaptive: the window class and layout follow the window, with no horizontal overflow.
  results.windows = {};
  for (const size of WINDOWS) {
    window.setContentSize(size.width, size.height);
    await sleep(500);
    for (const chapter of ["studio", "layout"]) {
      await open(`chapter=${chapter}&theme=signature&mode=dark`);
      await shot(`window-${size.name}-${chapter}`);
      results.windows[`${size.name}-${chapter}`] = { overflow: await overflow(), width: await js("innerWidth") };
    }
  }
  checks.noOverflowAtAnyWindowSize = Object.values(results.windows).every((w) => !w.overflow);
  await open("chapter=overlays&theme=signature&mode=dark");
  await clickLabel("Sheet");
  await sleep(600);
  await shot("sheet-compact-bottom");
  window.setContentSize(1280, 820);
  await sleep(600);
  await shot("sheet-expanded-edge");
  await key("Escape");

  // 7. System accessibility signals override the theme.
  contents.debugger.attach("1.3");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-contrast", value: "more" }] });
  await open("chapter=motion&theme=cozy&mode=light");
  checks.systemReducedMotionHonored = await js(`document.body.innerText.includes('Reduced motion') && [...document.querySelectorAll('[aria-label]')].some((e) => e.getAttribute('aria-label') === 'Reduced motion: On')`);
  await shot("reduced-motion-more-contrast");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  contents.debugger.detach();

  // 8. Frame pacing while the marker flies and while themes switch.
  await open("chapter=motion&theme=signature&mode=dark");
  results.framesMarker = await js(`new Promise((resolve) => { const stamps = []; let last = performance.now(); const tabs = ['Solve','Read','Rest','Write','Review']; let i = 0; const timer = setInterval(() => { [...document.querySelectorAll('[role=tab]')].find((t) => t.getAttribute('aria-label') === tabs[i++ % 5])?.click(); }, 240); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < 150) requestAnimationFrame(tick); else { clearInterval(timer); const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); })`);
  await open("chapter=studio&theme=signature&mode=dark");
  results.themeSwitchMs = await js(`(async () => { const times = []; for (const name of ['Studio.','Arcane.','Voxel.','Cozy.','Student.','Sylf Signature.','Studio.','Arcane.']) { const target = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith(name)); const before = document.body.style.backgroundColor; const t0 = performance.now(); target.click(); while (document.body.style.backgroundColor === before && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r)); times.push(+(performance.now() - t0).toFixed(1)); await new Promise((r) => setTimeout(r, 350)); } return times; })()`);
  checks.themeSwitchUnder300ms = [...results.themeSwitchMs].sort((a, b) => a - b)[results.themeSwitchMs.length >> 1] < 300;

  // 9. A saved preference survives a full reload with no deep link.
  await clickLabel("Cozy. Warm, soft, in no hurry.");
  await sleep(500);
  await contents.loadURL(`${APP_ORIGIN}/`);
  await sleep(1800);
  results.persisted = await js(`JSON.parse(localStorage.getItem('sylf.native.appearance.v1')).themeId`);
  checks.preferencePersists = results.persisted === "cozy";

  const metrics = app.getAppMetrics();
  results.memory = { processes: metrics.length, workingSetMb: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024) };
  results.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  checks.noConsoleErrors = consoleErrors.length === 0;
  const passed = Object.values(checks).every(Boolean);
  const report = { passed, checks, ...results, versions: { electron: process.versions.electron, chrome: process.versions.chrome } };
  fs.writeFileSync(path.join(out, "electron-design-check.json"), JSON.stringify(report, null, 2));
  console.log("SYLF_DESIGN_CHECK " + JSON.stringify({ passed, checks, consoleErrors: results.consoleErrors, framesMarker: results.framesMarker, themeSwitchMs: results.themeSwitchMs, memory: results.memory }));
  app.exit(passed ? 0 : 1);
}
