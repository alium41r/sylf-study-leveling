// @ts-check
// Automated verification of Home in the real Electron window (run with --sylf-home-check). Drives the rail with real mouse and
// keyboard events, checks restoration, walks every window size, theme and data state, audits accessibility, and measures
// frames and retention. Prints one SYLF_HOME_CHECK line and exits non-zero on any failure. Evidence goes to SYLF_HOME_CHECK_OUT.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const DESTINATIONS = ["today", "plan", "focus", "circle", "progress"];
const LABELS = { today: "Today", plan: "Plan", focus: "Focus", circle: "Circle", progress: "Progress" };
const WINDOWS = [{ name: "wide", width: 1680, height: 1000 }, { name: "expanded", width: 1280, height: 820 }, { name: "medium", width: 820, height: 900 }, { name: "compact", width: 480, height: 800 }, { name: "narrow", width: 340, height: 640 }, { name: "short", width: 900, height: 420 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Electron.BrowserWindow} window */
export async function runHomeCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_HOME_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
    app.exit(1);
  }
}

/** @param {Electron.BrowserWindow} window */
async function runChecks(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_HOME_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-home-check");
  fs.mkdirSync(out, { recursive: true });
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const logs = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const message = String(event?.message);
    if (event?.level === "error" || event?.level === 3) consoleErrors.push(message.slice(0, 300));
    if (message.startsWith("SYLF_HOME") || message.startsWith("SYLF_SPACE_")) logs.push(message);
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
    const char = keyCode === "Return" ? "\r" : keyCode === "Space" ? " " : null;
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
  const rail = (/** @type {string} */ id) => `[data-testid=home-rail-${id}]`;
  const has = (/** @type {string} */ selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);
  const visible = (/** @type {string} */ id) => js(`(() => { const e = document.querySelector('[data-testid=home-${id}]'); return !!e && getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('aria-hidden') !== 'true'; })()`);
  const selected = () => js(`document.querySelector('[role=tablist][aria-label=Home] [aria-selected=true]')?.getAttribute('aria-label') ?? null`);
  const focused = () => js(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
  const scroller = (/** @type {string} */ id) => `document.querySelector('[data-testid=home-scroll-${id}]')`;
  const stored = () => js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1'))`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  // Written from a page of the same origin with no app on it, because the app saves its state as it unloads.
  const plant = async (/** @type {string | null} */ record) => {
    await contents.loadURL(`${APP_ORIGIN}/metadata.json`);
    await js(`${record === null ? "localStorage.removeItem('sylf.native.spaces.v1')" : `localStorage.setItem('sylf.native.spaces.v1', ${JSON.stringify(record)})`}; true`);
  };
  const openBar = async () => { await clickOn("[data-testid=spaces-icon]"); await sleep(520); };
  const spaceTab = (/** @type {string} */ label) => `[data-testid=spaces-tabs] [role=tab][aria-label=${label}]`;

  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, boolean>} */
  const checks = {};

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
    await open("space=home&home=today&theme=signature&mode=dark");
    const round = async () => {
      for (const id of [...DESTINATIONS, ...DESTINATIONS]) { await js(`document.querySelector('${rail(id)}').click(); true`); await sleep(160); }
      return measure();
    };
    const samples = [await measure()];
    for (let i = 0; i < 6; i++) samples.push(await round());
    results.destinationRetention = samples;
    const settled = samples[2];
    const last = samples.at(-1);
    checks.destinationsRetainNoNodes = last.nodes <= settled.nodes + 50;
    checks.destinationsRetainNoHeap = last.heapMb <= settled.heapMb + 1;

    // Leaving Home must release all four destinations, not only the visible one.
    const spaceRound = async () => {
      for (const label of ["Workspace", "Home"]) {
        await js(`document.querySelector('[data-testid=spaces-icon]').click(); true`);
        await sleep(160);
        await js(`document.querySelector('${spaceTab(label)}').click(); true`);
        await sleep(420);
      }
      for (const id of DESTINATIONS) { await js(`document.querySelector('${rail(id)}').click(); true`); await sleep(120); }
      return measure();
    };
    const spaceSamples = [await measure()];
    for (let i = 0; i < 6; i++) spaceSamples.push(await spaceRound());
    contents.debugger.detach();
    results.homeRemountRetention = spaceSamples;
    checks.leavingHomeReleasesDestinations = spaceSamples.at(-1).nodes <= spaceSamples[2].nodes + 50 && spaceSamples.at(-1).heapMb <= spaceSamples[2].heapMb + 1;
  }
  if (process.env.SYLF_HOME_CHECK_ONLY === "capture") {
    window.setMinimumSize(320, 400);
    window.setContentSize(Number(process.env.SYLF_HOME_WIDTH ?? 1280), Number(process.env.SYLF_HOME_HEIGHT ?? 820));
    await sleep(400);
    await captureDestinations();
    console.log("SYLF_HOME_CHECK " + JSON.stringify({ capture: true }));
    app.exit(0);
    return;
  }

  async function captureDestinations() {
    const themes = (process.env.SYLF_HOME_THEMES ?? THEMES.join(",")).split(",");
    const modes = (process.env.SYLF_HOME_MODES ?? "light,dark").split(",");
    for (const theme of themes) for (const mode of modes) {
      await open(`space=home&home=today&theme=${theme}&mode=${mode}`);
      for (const id of DESTINATIONS) {
        await clickOn(rail(id));
        await sleep(650);
        await js(`${scroller(id)}.scrollTop = 0`);
        await sleep(120);
        await shot(`theme-${theme}-${mode}-${id}`);
      }
    }
  }

  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);

  // 1. First launch: Today, and only Today, in Home.
  await plant(null);
  await open("");
  checks.opensOnToday = (await selected()) === "Today" && (await visible("today"));
  checks.otherDestinationsNotMounted = !(await has("[data-testid=home-focus]")) && !(await has("[data-testid=home-circle]")) && !(await has("[data-testid=home-progress]"));
  checks.fourDestinations = (await js(`document.querySelectorAll('[role=tablist][aria-label=Home] [role=tab]').length`)) === 4;
  checks.sampleDataLabelled = await js(`document.querySelector('[data-testid=home-today]').innerText.includes('Sample data')`);
  await shot("first-launch");

  // 2. Mouse: each destination opens, the last one hides, and a visited destination stays mounted.
  for (const id of DESTINATIONS) {
    await clickOn(rail(id));
    await sleep(520);
    checks[`mouseOpens-${id}`] = (await selected()) === LABELS[id] && (await visible(id));
    checks[`headingOn-${id}`] = await js(`!!document.querySelector('[data-testid=home-${id}] [role=heading][aria-level="1"]')`);
    checks[`sampleLabelOn-${id}`] = await js(`document.querySelector('[data-testid=home-${id}]').innerText.includes('Sample data')`);
  }
  checks.onlyOneVisible = (await js(`[...document.querySelectorAll('[role=tabpanel]')].filter((e) => getComputedStyle(e).visibility !== 'hidden').length`)) === 1;
  const mounts = logs.filter((line) => line.startsWith("SYLF_HOME_MOUNT")).length;
  for (const id of ["today", "progress", "focus", "circle", "today"]) { await clickOn(rail(id)); await sleep(160); }
  checks.returningMountsNothing = logs.filter((line) => line.startsWith("SYLF_HOME_MOUNT")).length === mounts;
  results.firstMountMs = logs.filter((line) => line.startsWith("SYLF_HOME_MOUNT"));

  // 3. Hover labels are only needed when labels are gone, so that case is checked in the short window below. The disabled
  // actions must be disabled and must say why.
  await clickOn(rail("focus"));
  await sleep(500);
  checks.beginIsReal = await js(`document.querySelector('[data-testid=focus-enter]').getAttribute('aria-disabled') !== 'true'`);
  checks.localTimeIsLabelled = await js(`document.querySelector('[data-testid=home-focus]').innerText.includes('Not saved to your study record yet')`);
  await clickOn(rail("circle"));
  await sleep(500);
  checks.inviteDisabled = await js(`document.querySelector('[data-testid=circle-invite]').getAttribute('aria-disabled') === 'true'`);

  // 4. Keyboard alone: the Spaces icon, then the rail, then the page. Arrows move along the rail, Enter selects.
  await open("space=home&home=today");
  for (let i = 0; i < 6 && !String(await focused()).startsWith("Spaces."); i++) await key("Tab");
  checks.spacesIconFirst = String(await focused()).startsWith("Spaces.");
  await key("Tab");
  checks.dockIsSecondStop = String(await focused()).startsWith("Timer.");
  await key("Tab");
  checks.railIsThirdStop = (await focused()) === "Today";
  await shot("keyboard-rail");
  await key("Down");
  checks.arrowMovesDown = (await focused()) === "Focus";
  await key("Up");
  await key("Up");
  checks.arrowWrapsUp = (await focused()) === "Progress";
  await key("Home");
  await key("End");
  checks.endJumpsOnRail = (await focused()) === "Progress";
  await key("Up");
  await key("Return");
  await sleep(500);
  checks.enterSelectsDestination = (await selected()) === "Circle" && (await visible("circle"));
  checks.focusStaysOnRail = (await focused()) === "Circle";
  await key("Tab");
  results.afterRail = await focused();
  checks.tabLeavesRailForPage = !["Today", "Plan", "Focus", "Circle", "Progress"].includes(results.afterRail);
  const hiddenFocus = await js(`(async () => { const hits = []; for (let i = 0; i < 40; i++) { const e = document.activeElement; if (e?.closest?.('[aria-hidden=true]')) hits.push(e.getAttribute('aria-label')); await new Promise((r) => setTimeout(r, 0)); } return hits.length; })()`);
  for (let i = 0; i < 24; i++) await key("Tab");
  checks.tabNeverEntersHiddenDestination = hiddenFocus === 0 && !(await js(`!!document.activeElement?.closest?.('[aria-hidden=true]')`));

  // 5. Escape and the Spaces bar still belong to the shell.
  await openBar();
  checks.barOpensOverHome = await js(`document.querySelector('[data-testid=spaces-icon]').getAttribute('aria-expanded') === 'true'`);
  await shot("bar-open-over-home");
  const beforeOutside = await selected();
  const railPoint = await center(rail("progress"));
  await click(railPoint);
  await sleep(520);
  checks.outsideTapDoesNotReachRail = (await selected()) === beforeOutside;
  checks.outsideTapClosesBar = await js(`document.querySelector('[data-testid=spaces-icon]').getAttribute('aria-expanded') === 'false'`);

  // 6. Restoration: destination and each scroll position, across a Space change and a reload.
  window.setContentSize(820, 600);
  await sleep(400);
  await open("space=home&home=today");
  /** @type {Record<string, number>} */
  const offsets = { today: 180, focus: 120, circle: 210, progress: 260 };
  /** @type {Record<string, number>} */
  const applied = {};
  for (const id of DESTINATIONS) {
    await clickOn(rail(id));
    await sleep(420);
    await js(`${scroller(id)}.scrollTop = ${offsets[id]}`);
    await sleep(320);
    applied[id] = await js(`${scroller(id)}.scrollTop`);
  }
  await clickOn(rail("circle"));
  await sleep(320);
  results.applied = applied;
  await openBar();
  await clickOn(spaceTab("Workspace"));
  await sleep(600);
  checks.leavingUnmountsHome = !(await has("[data-testid=space-home]"));
  await openBar();
  await clickOn(spaceTab("Home"));
  await sleep(800);
  checks.destinationSurvivesSpaceChange = (await selected()) === "Circle";
  const positions = async () => { /** @type {Record<string, number>} */ const found = {}; for (const id of DESTINATIONS) { await clickOn(rail(id)); await sleep(460); found[id] = await js(`${scroller(id)}.scrollTop`); } return found; };
  results.afterSpaceChange = await positions();
  checks.scrollSurvivesSpaceChange = DESTINATIONS.every((id) => Math.abs(results.afterSpaceChange[id] - applied[id]) < 2);
  await clickOn(rail("progress"));
  await sleep(300);
  await open("");
  checks.destinationSurvivesReload = (await selected()) === "Progress";
  results.afterReload = await positions();
  checks.scrollSurvivesReload = DESTINATIONS.every((id) => Math.abs(results.afterReload[id] - applied[id]) < 2);
  results.stored = await stored();
  checks.storedRecordIsSmall = JSON.stringify(results.stored).length < 300;

  // A Phase 5 record is carried over, and a corrupt one starts cleanly.
  await plant(JSON.stringify({ version: 1, activeSpace: "home", returnSpace: "home", snapshots: { home: { scrollY: 150 } } }));
  await open("");
  checks.scrollWasReallyApplied = DESTINATIONS.every((id) => applied[id] === offsets[id]);
  checks.phase5RecordMigrates = (await selected()) === "Today" && Math.abs((await js(`${scroller("today")}.scrollTop`)) - 150) < 2;
  await plant("{broken");
  await open("");
  checks.corruptRecordOpensToday = (await selected()) === "Today";

  // 7. Today's quick actions are real navigation.
  window.setContentSize(1280, 820);
  await sleep(400);
  await open("space=home&home=today");
  await clickOn("[data-testid=today-begin]");
  await sleep(500);
  checks.prepareGoesToFocus = (await selected()) === "Focus";
  await clickOn(rail("today"));
  await sleep(500);
  await clickOn("[data-testid=today-plan]");
  await sleep(500);
  checks.quickActionOpensPlan = (await selected()) === "Plan";
  await open("space=home&home=today");

  // 8. Every window size, with the rail or the bottom bar inside the window and no page wider than it.
  results.windows = {};
  window.setContentSize(1280, 820);
  for (const size of WINDOWS) {
    window.setContentSize(size.width, size.height);
    await sleep(400);
    await open("space=home&home=today&theme=signature&mode=dark");
    /** @type {Record<string, any>} */
    const found = {};
    for (const id of DESTINATIONS) {
      await clickOn(rail(id));
      await sleep(460);
      await js(`${scroller(id)}.scrollTop = 0`);
      await sleep(80);
      found[id] = await js(`(() => { const page = document.querySelector('[data-testid=home-scroll-${id}]'); const tabs = [...document.querySelectorAll('[role=tablist][aria-label=Home] [role=tab]')].map((t) => t.getBoundingClientRect()); const inside = tabs.every((r) => r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1); const clipped = [...page.querySelectorAll('[dir=auto]')].filter((t) => t.scrollWidth > t.clientWidth + 2 && getComputedStyle(t).whiteSpace !== 'nowrap').length; return { inside, horizontal: page.scrollWidth > page.clientWidth + 1, clipped, tabWidth: Math.round(tabs[0].width), tabHeight: Math.round(tabs[0].height), labelled: document.querySelector('${rail(id)}').innerText.length > 0 }; })()`);
      await shot(`window-${size.name}-${id}`);
    }
    results.windows[size.name] = { found, overflow: await overflow() };
  }
  const allWindows = Object.values(results.windows);
  checks.railInsideEveryWindow = allWindows.every((w) => Object.values(w.found).every((/** @type {any} */ f) => f.inside));
  checks.noPageWiderThanWindow = allWindows.every((w) => !w.overflow && Object.values(w.found).every((/** @type {any} */ f) => !f.horizontal));
  checks.noClippedText = allWindows.every((w) => Object.values(w.found).every((/** @type {any} */ f) => f.clipped === 0));
  checks.railWidthStaysCompact = results.windows.expanded.found.today.tabWidth <= 76;
  checks.bottomBarWhenCompact = results.windows.compact.found.today.tabWidth >= 100;
  // The Marker's vertical rail drops labels only when the window is too short for them.
  checks.labelsWhereThereIsRoom = results.windows.expanded.found.today.labelled && results.windows.narrow.found.today.labelled;

  // A live resize across the compact line keeps the destination and does not remount anything.
  window.setContentSize(1100, 760);
  await sleep(400);
  await open("space=home&home=circle");
  const liveMounts = logs.length;
  for (const width of [560, 900, 420, 1100]) { window.setContentSize(width, 760); await sleep(360); }
  checks.liveResizeKeepsDestination = (await selected()) === "Circle" && (await visible("circle"));
  checks.liveResizeRemountsNothing = logs.slice(liveMounts).filter((line) => line.startsWith("SYLF_HOME_MOUNT") || line.startsWith("SYLF_SPACE_MOUNT")).length === 0;

  // A very short window: labels go, hover names the icons, and every item stays reachable.
  window.setMinimumSize(300, 240);
  window.setContentSize(900, 260);
  await sleep(400);
  await open("space=home&home=today");
  results.short = await js(`(() => { const t = [...document.querySelectorAll('[role=tablist][aria-label=Home] [role=tab]')]; return { count: t.length, names: t.every((e) => e.getAttribute('aria-label')), labelled: t.some((e) => e.innerText.length > 0) }; })()`);
  await shot("window-260-tall");
  checks.shortWindowDropsLabels = results.short.count === 4 && results.short.names && !results.short.labelled;
  const lastItem = await center(rail("focus"));
  contents.sendInputEvent({ type: "mouseMove", x: lastItem.x, y: lastItem.y });
  await sleep(700);
  checks.hoverNamesIconWhenLabelsAreGone = await js(`document.querySelector('[role=tooltip]')?.innerText === 'Focus'`);
  contents.sendInputEvent({ type: "mouseMove", x: 500, y: 200 });
  await sleep(200);
  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);
  await sleep(400);
  await open("space=home&home=progress");
  const bar = await center("[aria-label^='Wed,']");
  contents.sendInputEvent({ type: "mouseMove", x: bar.x, y: bar.y });
  await sleep(700);
  results.chartTooltip = await js(`document.querySelector('[role=tooltip]')?.innerText ?? null`);
  checks.hoverShowsChartValue = results.chartTooltip === "Wed, 2 hr 10 min";
  contents.sendInputEvent({ type: "mouseMove", x: 900, y: 200 });
  await sleep(200);
  window.setContentSize(1280, 820);
  await sleep(400);

  // 9. Every theme in both modes.
  await captureDestinations();

  // Hardest colors: a neon accent on a mid-gray ground, and a pale ground in the night slot.
  for (const [name, query] of [["custom-midtone", "theme=signature&mode=light&accent=e5ff00&day=7f8088"], ["custom-pale-night", "theme=voxel&mode=dark&accent=ff3d00&night=f4efe6"]]) {
    await open(`space=home&home=today&${query}`);
    for (const id of DESTINATIONS) { await clickOn(rail(id)); await sleep(620); await shot(`${name}-${id}`); }
  }

  // 10. Data states.
  await open("space=home&home=today&theme=signature&mode=dark&homeData=empty");
  for (const id of DESTINATIONS) {
    await clickOn(rail(id));
    await sleep(520);
    checks[`emptyState-${id}`] = !(await js(`document.querySelector('[data-testid=home-${id}]').innerText.includes('Sample data')`));
    await shot(`empty-${id}`);
  }
  await open("space=home&home=today&homeData=slow");
  await shot("loading-today");
  checks.loadingShowsNoSampleLabel = await js(`document.querySelector('[aria-label=Loading]') !== null`);
  await sleep(2100);
  checks.loadingResolves = await js(`document.querySelector('[data-testid=home-today]').innerText.includes('Sample data')`);
  await open("space=home&home=today&homeData=sample");

  // 11. Reduced motion: destinations still change, with no travel.
  contents.debugger.attach("1.3");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await open("space=home&home=today&theme=cozy&mode=light");
  await clickOn(rail("progress"));
  await sleep(60);
  results.reducedTransform = await js(`getComputedStyle(document.querySelector('[data-testid=home-progress]')).transform`);
  await sleep(300);
  checks.reducedMotionSwitches = (await selected()) === "Progress" && (await visible("progress"));
  checks.reducedMotionHasNoTravel = /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(results.reducedTransform);
  await shot("reduced-motion");
  await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  contents.debugger.detach();

  // 12. Accessibility audit of each destination: names, headings, contrast of real rendered text, and target sizes.
  await open("space=home&home=today&theme=signature&mode=dark");
  /** @type {Record<string, any>} */
  const audit = {};
  for (const id of DESTINATIONS) {
    await clickOn(rail(id));
    await sleep(520);
    audit[id] = await js(`(() => {
      const root = document.querySelector('[data-testid=home-${id}]');
      const controls = [...root.querySelectorAll('[role=button],[role=tab],[role=radio],button,a')];
      const unnamed = controls.filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim())).length;
      const levels = [...root.querySelectorAll('[role=heading]')].map((e) => Number(e.getAttribute('aria-level')));
      const parse = (v) => v.match(/[\\d.]+/g).slice(0, 4).map(Number);
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ground = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] === 1) return c; } return [0, 0, 0]; };
      let lowest = 99, lowestText = '';
      for (const t of root.querySelectorAll('[dir=auto]')) {
        if (!t.innerText.trim() || t.closest('[aria-disabled=true]')) continue;
        const a = lum(parse(getComputedStyle(t).color)); const b = lum(ground(t));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < lowest) { lowest = ratio; lowestText = t.innerText.slice(0, 30); }
      }
      return { controls: controls.length, unnamed, levels, firstLevel: levels[0], lowest: +lowest.toFixed(2), lowestText };
    })()`);
  }
  results.audit = audit;
  checks.everyControlNamed = Object.values(audit).every((a) => a.unnamed === 0);
  checks.headingsStartAtOne = Object.values(audit).every((a) => a.firstLevel === 1 && a.levels.filter((/** @type {number} */ l) => l === 1).length === 1);
  checks.textContrastAtLeast45 = Object.values(audit).every((a) => a.lowest >= 4.5);
  results.tabPanels = await js(`[...document.querySelectorAll('[role=tabpanel]')].map((e) => e.getAttribute('aria-label'))`);

  // 13. Motion cost: frames across rail changes, and how long a change takes.
  await open("space=home&home=today&theme=signature&mode=dark");
  for (const id of DESTINATIONS) { await clickOn(rail(id)); await sleep(300); }
  await js(`window.__frames = new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < 170) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); }); true`);
  for (const id of ["today", "progress", "focus", "circle", "today", "focus"]) { await clickOn(rail(id)); await sleep(340); }
  results.railFrames = await js(`window.__frames`);
  /** @type {number[]} */
  const changeMs = [];
  for (const id of ["today", "progress", "focus", "circle", "today", "progress"]) {
    const point = await center(rail(id));
    await js(`window.__arrived = new Promise((resolve) => { const started = performance.now(); const look = () => { const e = document.querySelector('[data-testid=home-${id}]'); if (getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('aria-hidden') !== 'true') resolve(performance.now() - started); else requestAnimationFrame(look); }; look(); }); true`);
    await click(point);
    changeMs.push(+Number(await js(`window.__arrived`)).toFixed(1));
    await sleep(360);
  }
  results.changeMs = changeMs;
  checks.destinationChangeUnder100ms = [...changeMs].sort((a, b) => a - b)[changeMs.length >> 1] < 100;

  await retentionCheck();
  const metrics = app.getAppMetrics();
  results.memory = { processes: metrics.length, workingSetMb: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024) };
  results.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  checks.noConsoleErrors = consoleErrors.length === 0;
  const passed = Object.values(checks).every(Boolean);
  const report = { passed, checks, ...results, versions: { electron: process.versions.electron, chrome: process.versions.chrome } };
  fs.writeFileSync(path.join(out, "electron-home-check.json"), JSON.stringify(report, null, 2));
  console.log("SYLF_HOME_CHECK " + JSON.stringify({ passed, failed: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name), total: Object.keys(checks).length, changeMs, railFrames: results.railFrames, consoleErrors: results.consoleErrors, memory: results.memory }));
  app.exit(passed ? 0 : 1);
}
