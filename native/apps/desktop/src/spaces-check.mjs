// @ts-check
// Automated verification of the Spaces shell in the real Electron window (run with --sylf-spaces-check). Drives the switcher
// with real mouse and keyboard events, walks World's exit flow, resizes the window, and captures every theme in both modes.
// Prints one SYLF_SPACES_CHECK line and exits non-zero on any failure. Evidence goes to SYLF_SPACES_CHECK_OUT.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const WINDOWS = [{ name: "expanded", width: 1280, height: 820 }, { name: "medium", width: 820, height: 900 }, { name: "compact", width: 480, height: 800 }, { name: "narrow", width: 340, height: 640 }, { name: "short", width: 900, height: 420 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Electron.BrowserWindow} window */
export async function runSpacesCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_SPACES_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
    app.exit(1);
  }
}

/** @param {Electron.BrowserWindow} window */
async function runChecks(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_SPACES_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-spaces-check");
  fs.mkdirSync(out, { recursive: true });
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const logs = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const message = String(event?.message);
    if (event?.level === "error" || event?.level === 3) consoleErrors.push(message.slice(0, 300));
    if (message.startsWith("SYLF_SPACE")) logs.push(message);
  });

  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
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
    const char = keyCode.length === 1 ? keyCode : keyCode === "Return" ? "\r" : keyCode === "Space" ? " " : null;
    if (char) contents.sendInputEvent({ type: "char", keyCode: char, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(90);
  };
  const open = async (/** @type {string} */ query) => {
    const ready = new Promise((resolve) => {
      const listener = (/** @type {any} */ event) => { if (String(event?.message).startsWith("SYLF_FOUNDATION ")) { contents.off("console-message", listener); resolve(true); } };
      contents.on("console-message", listener);
    });
    await contents.loadURL(`${APP_ORIGIN}/${query ? `?${query}` : ""}`);
    await Promise.race([ready, sleep(8000)]);
    await sleep(700);
    await js("document.fonts.ready.then(() => true)");
  };
  const click = async (/** @type {{ x: number, y: number }} */ point) => {
    contents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    contents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await sleep(120);
  };
  const center = (/** @type {string} */ selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const clickOn = async (/** @type {string} */ selector) => {
    let point = await center(selector);
    for (let wait = 0; wait < 40 && !point; wait++) { await sleep(100); point = await center(selector); }
    if (!point) throw new Error(`nothing at ${selector}`);
    await click(point);
  };
  const tabs = "[data-testid=spaces-tabs] [role=tab]";
  const tab = (/** @type {string} */ label) => `[role=tab][aria-label=${label}]`;
  const iconSelector = "[data-testid=spaces-icon]";
  const has = (/** @type {string} */ selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);
  const expanded = () => js(`document.querySelector('${iconSelector}')?.getAttribute('aria-expanded')`);
  const focusedLabel = () => js(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
  const barVisible = () => js(`document.querySelector('[data-testid=spaces-tabs]')?.getAttribute('aria-hidden') !== 'true' && !!document.querySelector('[data-testid=spaces-tabs]')`);
  const openBar = async () => { await clickOn(iconSelector); await sleep(520); };
  const stored = () => js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1'))`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);

  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, boolean>} */
  const checks = {};

  // Switching Spaces must not leave anything behind. Chromium can force a full collection and count what survives, which a
  // release Hermes build cannot, so this is where a retained Space would show up as nodes that never go away.
  async function retentionCheck() {
    contents.debugger.attach("1.3");
    const measure = async () => {
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      await sleep(300);
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      const counters = await contents.debugger.sendCommand("Memory.getDOMCounters");
      const heap = await contents.debugger.sendCommand("Runtime.getHeapUsage");
      return { nodes: counters.nodes, listeners: counters.jsEventListeners, heapMb: +(heap.usedSize / 1048576).toFixed(2) };
    };
    await open("space=home&theme=signature&mode=dark");
    const round = async () => {
      for (const label of ["Workspace", "World", "Home", "World", "Workspace", "Home"]) {
        await js(`document.querySelector('${iconSelector}').click(); true`);
        await sleep(160);
        await js(`document.querySelector('${tab(label)}').click(); true`);
        await sleep(420);
      }
      return measure();
    };
    const samples = [await measure()];
    for (let i = 0; i < 8; i++) samples.push(await round());
    contents.debugger.detach();
    results.retention = samples;
    const settled = samples[2];
    const last = samples.at(-1);
    // Since Phase 7 the last Space left can stay referenced until the next change, so samples move between two levels. What
    // must never happen is a higher level later on.
    checks.switchingRetainsNoNodes = Math.max(...samples.slice(-3).map((sample) => sample.nodes)) <= Math.max(...samples.slice(2, 6).map((sample) => sample.nodes)) + 50;
    checks.switchingRetainsNoHeap = last.heapMb <= settled.heapMb + 1;
  }
  if (process.env.SYLF_SPACES_CHECK_ONLY === "retention") {
    await retentionCheck();
    console.log("SYLF_SPACES_CHECK " + JSON.stringify({ checks, retention: results.retention }));
    app.exit(0);
    return;
  }

  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);

  // 1. First launch: Home, collapsed, and no Space other than Home mounted.
  await open("");
  checks.opensInHome = await has("[data-testid=space-home]");
  checks.onlyActiveSpaceMounted = !(await has("[data-testid=space-workspace]")) && !(await has("[data-testid=space-world]"));
  checks.startsCollapsed = (await expanded()) === "false" && !(await barVisible());
  await shot("first-launch");

  // 2. Pointer: opens, shows all three with Home selected, and an outside click closes without switching.
  await openBar();
  checks.opensOnClick = (await expanded()) === "true" && (await js(`document.querySelectorAll('${tabs}').length`)) === 3;
  checks.activeSpaceIsSelected = await js(`document.querySelector('${tab("Home")}').getAttribute('aria-selected') === 'true'`);
  await click({ x: 700, y: 500 });
  await sleep(520);
  checks.outsideClickCloses = (await expanded()) === "false" && !(await barVisible());
  checks.outsideClickDoesNotSwitch = await has("[data-testid=space-home]");

  // 3. Escape closes and hands focus back to the icon.
  await openBar();
  await key("Escape");
  await sleep(520);
  checks.escapeCloses = (await expanded()) === "false";
  checks.escapeRestoresFocus = String(await focusedLabel()).startsWith("Spaces.");

  // 4. Keyboard alone: Enter opens, focus lands on the current Space, arrows move and wrap, Enter selects.
  await open("");
  for (let i = 0; i < 6 && !String(await focusedLabel()).startsWith("Spaces."); i++) await key("Tab");
  checks.iconIsFirstInTabOrder = String(await focusedLabel()).startsWith("Spaces.");
  await shot("keyboard-focus-icon");
  await key("Return");
  await sleep(520);
  checks.enterOpens = (await expanded()) === "true";
  checks.focusMovesToCurrentSpace = (await focusedLabel()) === "Home";
  await key("Right");
  checks.arrowMoves = (await focusedLabel()) === "Workspace";
  await shot("keyboard-focus-tab");
  await key("Right");
  await key("Right");
  checks.arrowWraps = (await focusedLabel()) === "Home";
  await key("End");
  checks.endJumps = (await focusedLabel()) === "World";
  await key("Home");
  await key("Right");
  await key("Return");
  await sleep(650);
  checks.enterSelects = await has("[data-testid=space-workspace]");
  checks.selectionCloses = (await expanded()) === "false";
  checks.selectionReturnsFocus = String(await focusedLabel()).startsWith("Spaces. Current Space: Workspace");
  await key("Return");
  await sleep(520);
  results.beforeTab = { expanded: await expanded(), focused: await focusedLabel() };
  await key("Tab");
  await sleep(520);
  results.afterTab = { expanded: await expanded(), focused: await focusedLabel() };
  checks.tabLeavesAndCloses = results.afterTab.expanded === "false" && String(results.afterTab.focused).startsWith("Spaces.");

  // 5. Unloading: a Space that was left is gone from the tree, not hidden.
  checks.leftSpaceUnmounted = !(await has("[data-testid=space-home]"));
  checks.unmountLogged = logs.includes("SYLF_SPACE_UNMOUNT home");

  // 6. World: the switcher belongs to the entry environment, and the game's flow owns everything after it.
  await openBar();
  await clickOn(tab("World"));
  await sleep(700);
  checks.switcherAvailableAtWorldEntry = await has(iconSelector);
  await shot("world-entry");
  await clickOn("[data-testid=world-enter]");
  await sleep(250);
  checks.switcherGoneWhileEntering = !(await has(iconSelector));
  await key("Escape");
  await sleep(100);
  checks.escapeIgnoredWhileEntering = await has("[data-testid=space-world]");
  await shot("world-entering");
  await sleep(1100);
  checks.gameMenuTakesTheCorner = await has("[data-testid=world-menu]");
  checks.switcherGoneWhilePlaying = !(await has(iconSelector));
  await shot("world-playing");
  await key("Escape");
  await sleep(500);
  checks.escapeOpensGameMenu = await js(`!!document.querySelector('[role=alertdialog][aria-label=Paused]')`);
  await shot("world-paused");
  await key("Escape");
  await sleep(500);
  checks.escapeResumes = await js(`!document.querySelector('[role=alertdialog]') && !!document.querySelector('[data-testid=world-menu]')`);
  await clickOn("[data-testid=world-menu]");
  await sleep(450);
  await clickOn("[aria-label='Save and leave']");
  await sleep(350);
  await shot("world-saving");
  checks.savingShown = await js(`document.body.innerText.includes('Saving')`);
  await sleep(900);
  await shot("world-saved");
  checks.savedShown = await js(`document.body.innerText.includes('Saved on this device')`);
  await sleep(1300);
  checks.leavingReturnsToPreviousSpace = (await has("[data-testid=space-workspace]")) && !(await has("[data-testid=space-world]"));
  checks.switcherBackAfterLeaving = await has(iconSelector);
  await openBar();
  await clickOn(tab("World"));
  await sleep(700);
  results.lastVisitText = await js(`document.body.innerText.match(/Last here at [^\\n]+/)?.[0] ?? null`);
  checks.worldSnapshotRestored = Boolean(results.lastVisitText);
  await shot("world-entry-after-visit");

  // 7. Persistence across reloads, including a reload in the middle of play.
  await open("");
  checks.activeSpaceSurvivesReload = await has("[data-testid=space-world]");
  await clickOn("[data-testid=world-enter]");
  await sleep(1300);
  await open("");
  checks.reloadMidGameReturnsToEntry = (await has("[data-testid=world-enter]")) && (await has(iconSelector));
  results.stored = await stored();
  checks.storedRecordIsSmall = JSON.stringify(results.stored).length < 400;

  // 8. Home's scroll position is restored from its snapshot, across a Space change and a reload.
  window.setContentSize(820, 600);
  await sleep(400);
  await open("space=home&home=today");
  await js(`document.querySelector('[data-testid=home-scroll-today]').scrollTop = 310`);
  await sleep(600);
  await openBar();
  await clickOn(tab("Workspace"));
  await sleep(600);
  await openBar();
  await clickOn(tab("Home"));
  await sleep(700);
  results.scrollAfterSwitch = await js(`document.querySelector('[data-testid=home-scroll-today]').scrollTop`);
  await open("");
  results.scrollAfterReload = await js(`document.querySelector('[data-testid=home-scroll-today]').scrollTop`);
  checks.homeScrollRestored = Math.abs(results.scrollAfterSwitch - 310) < 2 && Math.abs(results.scrollAfterReload - 310) < 2;

  // 9. Every window size: the bar stays inside the window, drops its labels when it must, and survives a live resize.
  results.windows = {};
  for (const size of WINDOWS) {
    window.setContentSize(size.width, size.height);
    await sleep(400);
    await open("space=home&theme=signature&mode=dark");
    await openBar();
    const bar = await js(`(() => { const all = [...document.querySelectorAll('${tabs}')]; const r = all.at(-1).getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, labelled: all.every((t) => t.innerText.length > 0) }; })()`);
    results.windows[size.name] = { ...bar, overflow: await overflow() };
    await shot(`window-${size.name}-open`);
    await key("Escape");
    await sleep(420);
  }
  checks.barStaysInsideWindow = Object.values(results.windows).every((w) => w.right <= w.width);
  checks.noOverflowAtAnyWindowSize = Object.values(results.windows).every((w) => !w.overflow);
  checks.labelsDropOnlyWhenNarrow = results.windows.expanded.labelled && !results.windows.narrow.labelled;
  window.setContentSize(1280, 820);
  await sleep(400);
  await open("space=home");
  await openBar();
  window.setContentSize(500, 700);
  await sleep(500);
  const resized = await js(`(() => { const r = [...document.querySelectorAll('${tabs}')].at(-1)?.getBoundingClientRect(); return { open: !!r, right: r?.right, width: innerWidth }; })()`);
  checks.liveResizeKeepsBarValid = resized.open && resized.right <= resized.width;
  window.setContentSize(1280, 820);
  await sleep(400);

  // 10. Every theme in both modes: each Space, and the bar open, with Home scrolled back to its top.
  await open("space=home");
  await js(`document.querySelector('[data-testid=home-scroll-today]').scrollTop = 0`);
  await sleep(600);
  /** @type {Record<string, any>} */
  const looks = {};
  for (const theme of THEMES) {
    for (const mode of ["light", "dark"]) {
      await open(`space=home&theme=${theme}&mode=${mode}`);
      await shot(`theme-${theme}-${mode}-home-collapsed`);
      await openBar();
      await shot(`theme-${theme}-${mode}-home-expanded`);
      looks[`${theme}-${mode}`] = await js(`(() => { const t = document.querySelector('${tab("Workspace")}'); const s = t.querySelector('div[dir=auto]') ?? t; const c = getComputedStyle(s); return { font: c.fontFamily, color: c.color, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
      await clickOn(tab("Workspace"));
      await sleep(600);
      await shot(`theme-${theme}-${mode}-workspace`);
      await openBar();
      await clickOn(tab("World"));
      await sleep(700);
      await shot(`theme-${theme}-${mode}-world`);
    }
  }
  results.looks = looks;
  checks.barFollowsEveryTheme = new Set(Object.values(looks).map((l) => l.font)).size === THEMES.length;
  checks.noThemeOverflows = Object.values(looks).every((l) => !l.overflow);

  // A custom accent on a mid-tone ground is the hardest case for the plate and the Marker.
  await open("space=home&theme=signature&mode=light&accent=e5ff00&day=7f8088");
  await openBar();
  await shot("custom-colors-home-expanded");
  await clickOn(tab("World"));
  await sleep(700);
  await shot("custom-colors-world");
  await open("space=home&theme=signature&mode=dark");

  // 11. Reduced motion: the bar and the Spaces still change, by short fades.
  contents.debugger.attach("1.3");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await open("space=home&theme=cozy&mode=light");
  await clickOn(iconSelector);
  await sleep(60);
  results.reducedPlateWidth = await js(`document.querySelector('[data-testid=spaces-tabs]').getBoundingClientRect().width`);
  await sleep(300);
  await shot("reduced-motion-open");
  checks.reducedMotionOpens = (await expanded()) === "true";
  await clickOn(tab("Workspace"));
  await sleep(400);
  checks.reducedMotionSwitches = await has("[data-testid=space-workspace]");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  contents.debugger.detach();

  // 12. Motion cost: frames while Spaces change, and the time from choosing a Space to its first frame.
  await open("space=home&theme=signature&mode=dark");
  results.switchFrames = await js(`new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < 150) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); })`);
  /** @type {number[]} */
  const switchMs = [];
  for (const [label, id] of [["Workspace", "workspace"], ["World", "world"], ["Home", "home"], ["Workspace", "workspace"], ["Home", "home"], ["World", "world"]]) {
    await openBar();
    const point = await center(tab(label));
    await js(`window.__t0 = 0; window.__arrived = new Promise((resolve) => { const started = performance.now(); window.__t0 = started; const look = () => { if (document.querySelector('[data-testid=space-${id}] [role=heading]')) resolve(performance.now() - started); else requestAnimationFrame(look); }; look(); }); true`);
    await click(point);
    switchMs.push(+Number(await js(`window.__arrived`)).toFixed(1));
    await sleep(500);
  }
  results.switchMs = switchMs;
  checks.spaceSwitchUnder300ms = [...switchMs].sort((a, b) => a - b)[switchMs.length >> 1] < 300;

  // 13. The Showcase is a development entry that replaces the Spaces and hands them back intact.
  await open("space=workspace");
  await clickOn("[data-testid=dev-showcase]");
  await sleep(1200);
  checks.showcaseOpensFromDevEntry = await js(`document.body.innerText.includes('Sylf Design System')`);
  checks.showcaseUnloadsSpaces = !(await has("[data-testid=space-workspace]"));
  await key("Escape");
  await sleep(700);
  checks.showcaseReturnsToSpace = await has("[data-testid=space-workspace]");

  await retentionCheck();
  const metrics = app.getAppMetrics();
  results.memory = { processes: metrics.length, workingSetMb: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024) };
  results.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  checks.noConsoleErrors = consoleErrors.length === 0;
  const passed = Object.values(checks).every(Boolean);
  const report = { passed, checks, ...results, versions: { electron: process.versions.electron, chrome: process.versions.chrome } };
  fs.writeFileSync(path.join(out, "electron-spaces-check.json"), JSON.stringify(report, null, 2));
  console.log("SYLF_SPACES_CHECK " + JSON.stringify({ passed, failed: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name), total: Object.keys(checks).length, switchMs, switchFrames: results.switchFrames, consoleErrors: results.consoleErrors, memory: results.memory }));
  app.exit(passed ? 0 : 1);
}
