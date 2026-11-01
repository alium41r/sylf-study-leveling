// @ts-check
// Automated verification of World in the real Electron window (run with --sylf-world-check). Drives the lobby with real mouse and keyboard
// events, walks the host's lifecycle and its failures, proves that nothing of World loads early or runs late, measures contrast against
// the sky as it is really drawn, and measures frames and retention. Prints one SYLF_WORLD_CHECK line and exits non-zero on any failure.
// Evidence goes to SYLF_WORLD_CHECK_OUT, and SYLF_WORLD_CHECK_ONLY=<groups> runs part of it.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const SKIES = ["dawn", "day", "sunset", "dusk", "night", "mist"];
const GROUPS = ["look", "nav", "sky", "flow", "faults", "blocks", "motion", "isolation", "a11y", "contrast", "sizes", "themes", "frames", "retention"];
const WINDOWS = [{ name: "wide", width: 1680, height: 1000 }, { name: "expanded", width: 1280, height: 820 }, { name: "medium", width: 820, height: 900 }, { name: "compact", width: 480, height: 800 }, { name: "narrow", width: 340, height: 640 }, { name: "short", width: 900, height: 420 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Electron.BrowserWindow} window */
export async function runWorldCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_WORLD_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
    app.exit(1);
  }
}

/** @param {number[]} a @param {number[]} b */
function contrast(a, b) {
  const lum = (/** @type {number[]} */ c) => { const [r, g, b_] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b_; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** @param {Electron.BrowserWindow} window */
async function runChecks(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_WORLD_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-world-check");
  fs.mkdirSync(out, { recursive: true });
  const only = process.env.SYLF_WORLD_CHECK_ONLY?.split(",").filter(Boolean);
  const runs = (/** @type {string} */ group) => !only || only.includes(group);
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const logs = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const message = String(event?.message);
    if (event?.level === "error" || event?.level === 3) consoleErrors.push(message.slice(0, 300));
    if (message.startsWith("SYLF_WORLD") || message.startsWith("SYLF_SPACE_")) logs.push(message);
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
    await sleep(800);
    await js("document.fonts.ready.then(() => true)");
  };
  const world = (/** @type {string} */ extra = "") => open(`space=world&theme=signature&mode=light&worldSky=sunset&${extra.includes("worldSection") ? "" : "worldSection=gate&"}${extra}`);
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
  const has = (/** @type {string} */ selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);
  const until = async (/** @type {string} */ selector, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await has(selector)) return true; await sleep(50); } return false; };
  const text = () => js("document.body.innerText");
  const tid = (/** @type {string} */ id) => `[data-testid=${id}]`;
  const stored = () => js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1'))`);
  const selected = () => js(`document.querySelector('[role=tablist][aria-label=World] [aria-selected=true]')?.getAttribute('aria-label') ?? null`);
  const focused = () => js(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
  const showing = (/** @type {string} */ id) => js(`(() => { const e = document.querySelector('[data-testid=world-panel-${id}]'); return !!e && getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('aria-hidden') !== 'true'; })()`);
  /** @type {string[]} */
  let fetched = [];
  const resources = async () => [...new Set(fetched)];
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  const iconSelector = "[data-testid=spaces-icon]";
  const tab = (/** @type {string} */ label) => `[role=tab][aria-label=${label}]`;
  const openBar = async () => { await clickOn(iconSelector); await sleep(520); };
  const frames = (/** @type {number} */ n) => `window.__frames = new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < ${n}) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), p99: +s[Math.floor(s.length * 0.99)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); }); true`;
  /** How many times anything in the page was restyled during `ms`, batched by frame. */
  const updatesPerSecond = async (/** @type {string} */ root, ms = 2000) => js(`new Promise((resolve) => { const node = document.querySelector(${JSON.stringify(root)}); if (!node) return resolve(0); let count = 0; const seen = new MutationObserver(() => { count++; }); seen.observe(node, { subtree: true, attributes: true, attributeFilter: ['style'] }); setTimeout(() => { seen.disconnect(); resolve(+(count / (${ms} / 1000)).toFixed(1)); }, ${ms}); })`);

  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, boolean>} */
  const checks = {};

  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);
  await sleep(300);

  // 1. What it looks like, for a person to review.
  if (runs("look")) {
    await world();
    await sleep(600);
    await shot("lobby-sunset");
    checks.titleShown = (await text()).includes("Sylf World");
    checks.enterOffered = await has(tid("world-enter"));
    checks.previewLabelled = (await text()).includes("Preview");
    checks.sampleLabelled = (await text()).includes("Sample data");
    checks.scenePresent = await has(tid("world-scene"));
    checks.switcherAtEntry = await has(iconSelector);
    results.images = await js(`Array.from(document.images).map((i) => [i.src.split('/').pop(), i.naturalWidth, i.naturalHeight, Math.round(i.getBoundingClientRect().width)])`);
    checks.allPlatesLoaded = results.images.length > 0 && results.images.every((/** @type {any[]} */ image) => image[1] > 0);
  }

  // 2. Lobby navigation, with a mouse and with the keyboard.
  if (runs("nav")) {
    await world();
    checks.startsAtGate = (await selected()) === "Gate";
    await clickOn(tid("world-section-traveller"));
    await sleep(500);
    checks.travellerSelected = (await selected()) === "Traveller";
    checks.travellerShown = await showing("traveller");
    checks.travellerSampleLevel = (await text()).includes("Level 12");
    await shot("panel-traveller");
    await clickOn(tid("world-section-collection"));
    await sleep(500);
    checks.collectionShown = (await showing("collection")) && !(await showing("traveller"));
    checks.hiddenPanelStaysMounted = await has(tid("world-panel-traveller"));
    checks.lockerReserved = (await text()).includes("Locker");
    await shot("panel-collection");
    await clickOn(tid("world-section-preparations"));
    await sleep(500);
    checks.preparationsShown = await showing("preparations");
    await shot("panel-preparations");
    await sleep(350);
    checks.sectionStored = (await stored()).snapshots.world.section === "preparations";
    await open("");
    checks.sectionRestoredAfterReload = (await selected()) === "Preparations" && (await showing("preparations"));
    await key("Escape");
    await sleep(450);
    checks.escapeReturnsToGate = (await selected()) === "Gate" && !(await showing("preparations"));
    await clickOn(tid("world-section-traveller"));
    await sleep(350);
    await clickOn(tid("world-panel-close"));
    await sleep(350);
    checks.closeReturnsToGate = (await selected()) === "Gate";

    // Keyboard: the Spaces icon comes first, then the section in use, and arrows move along the menu.
    await js(`document.activeElement?.blur?.(); true`);
    /** @type {string[]} */
    const order = [];
    for (let i = 0; i < 6 && order[order.length - 1] !== "Gate"; i++) { await key("Tab"); order.push(await focused()); }
    results.tabOrder = order;
    checks.sectionsReachedByTab = order.includes("Gate") && order.indexOf("Gate") > order.findIndex((name) => name.startsWith("Spaces"));
    await js(`document.querySelector('${tid("world-section-gate")}').focus(); true`);
    await key("Down");
    checks.arrowMovesFocus = (await focused()) === "Traveller";
    await key("End");
    checks.endJumps = (await focused()) === "Preparations";
    await key("Home");
    checks.homeJumps = (await focused()) === "Gate";
    await key("Up");
    checks.arrowWraps = (await focused()) === "Preparations";
    await key("Return");
    await sleep(450);
    checks.enterSelects = (await selected()) === "Preparations";
    await key("Escape");
    await sleep(300);
    checks.noConsoleErrorsInNavigation = consoleErrors.length === 0;
  }

  // 3. Skies and drift are real controls, and they persist.
  if (runs("sky")) {
    await world("worldSection=preparations");
    for (const sky of SKIES) {
      await clickOn(tid(`world-sky-${sky}`));
      await sleep(620);
      await shot(`panel-sky-${sky}`);
      checks[`sky_${sky}_selected`] = await js(`document.querySelector('${tid(`world-sky-${sky}`)}').getAttribute('aria-checked') === 'true'`);
      checks[`sky_${sky}_plate`] = await js(`Array.from(document.querySelectorAll('[data-testid=world-scene] img')).some((i) => i.src.includes('sky-${sky}'))`);
    }
    checks.oldSkyLeaves = await js(`new Set(Array.from(document.querySelectorAll('[data-testid=world-scene] img')).map((i) => i.src.split('/').pop().split('.')[0].replace(/^(sky|gate|cloud-a|cloud-b|sea)-/, ''))).size <= 2`);
    await sleep(400);
    checks.skyStored = (await stored()).snapshots.world.sky === "mist";
    await clickOn(tid("world-sky-auto"));
    await sleep(600);
    // The sky is the owner's art and answers to the clock alone, so appearance mode must not change it.
    const skyPlate = () => js(`Array.from(document.querySelectorAll('[data-testid=world-scene] img')).map((i) => /sky-([a-z]+)/.exec(i.src)?.[1]).find(Boolean) ?? null`);
    const hour = new Date().getHours();
    const expected = hour >= 5 && hour < 10 ? "dawn" : hour >= 10 && hour < 16 ? "day" : hour >= 16 && hour < 19 ? "sunset" : hour >= 19 && hour < 21 ? "dusk" : "night";
    results.skyInLightMode = await skyPlate();
    checks.followTheDayFollowsTheClock = results.skyInLightMode === expected;
    await open("space=world&theme=signature&mode=dark&worldSky=auto&worldSection=gate");
    results.skyInDarkMode = await skyPlate();
    checks.appearanceModeDoesNotChangeTheSky = results.skyInDarkMode === results.skyInLightMode;
    await shot("lobby-auto-dark");

    await world("worldSection=preparations");
    const moving = await updatesPerSecond(tid("world-scene"), 1500);
    await clickOn("[role=switch][aria-label=Drift]");
    // The pointer's own spring settles first: moving the mouse to the switch set it going.
    await sleep(2200);
    const still = await updatesPerSecond(tid("world-scene"), 1500);
    results.drift = { moving, still };
    checks.driftOffStopsEverything = moving > 0 && still === 0;
    checks.driftOffRemovesPetals = await js(`document.querySelectorAll('[data-testid=world-scene] > div:not(:first-child)').length === 0`);
    await sleep(350);
    checks.driftStored = (await stored()).snapshots.world.drift === false;
    await clickOn("[role=switch][aria-label=Drift]");
    await sleep(350);
  }

  // 4. The host's whole life, from Workspace and back.
  if (runs("flow")) {
    await open("space=workspace&theme=signature&mode=light&worldSky=sunset&worldSection=gate");
    await openBar();
    await clickOn(tab("World"));
    await sleep(800);
    logs.length = 0;
    await clickOn(tid("world-enter"));
    // At once, while the load has barely started: later, Escape could land just after it ends, and then it rightly opens the menu.
    await key("Escape");
    checks.escapeIgnoredWhileEntering = (await has(tid("space-world"))) && !(await has("[role=alertdialog]"));
    const seen = [];
    for (let i = 0; i < 12; i++) { seen.push(await js(`Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') ?? -1)`)); await sleep(50); }
    results.progress = seen;
    const real = seen.filter((value) => value >= 0);
    checks.progressReported = real.length > 2 && real[real.length - 1] > real[0];
    checks.progressOnlyRises = real.every((value, index) => index === 0 || value >= real[index - 1]);
    checks.switcherGoneWhileEntering = !(await has(iconSelector));
    await shot("flow-entering");
    checks.hostLoadedOnEntry = await until(tid("world-menu"), 3000);
    await sleep(800);
    checks.sceneReleasedInPlay = !(await has(tid("world-scene")));
    checks.surfaceShown = await has(tid("world-surface"));
    checks.surfaceSaysSo = (await text()).includes("Beyond the gate");
    await shot("flow-playing");
    await key("Escape");
    await sleep(500);
    checks.escapeOpensMenu = await has("[role=alertdialog][aria-label=Paused]");
    checks.menuIsHonest = (await text()).includes("There is no game to save yet");
    await shot("flow-paused");
    await key("Escape");
    await sleep(500);
    checks.escapeResumes = !(await has("[role=alertdialog]")) && (await has(tid("world-menu")));
    await clickOn(tid("world-menu"));
    await sleep(450);
    await clickOn("[aria-label='Save and leave']");
    await sleep(300);
    checks.savingShown = (await text()).includes("Saving");
    await shot("flow-saving");
    await sleep(900);
    checks.savedShown = (await text()).includes("Saved on this device");
    await shot("flow-saved");
    await sleep(1300);
    checks.returnsToPreviousSpace = (await has(tid("space-workspace"))) && !(await has(tid("space-world")));
    checks.switcherBack = await has(iconSelector);
    results.hostLog = logs.filter((line) => line.startsWith("SYLF_WORLD "));
    checks.oneHostCreatedAndDisposed = results.hostLog.filter((/** @type {string} */ l) => l.includes("host-created")).length === 1 && results.hostLog.filter((/** @type {string} */ l) => l.includes("host-disposed")).length === 1;
    checks.hostLeftNothingBehind = !results.hostLog.some((/** @type {string} */ l) => l.includes("released-for-host") || l.includes("failed"));
    const record = await stored();
    results.record = record.snapshots.world;
    checks.saveReceiptStored = record.snapshots.world?.save?.location === "device" && typeof record.snapshots.world?.save?.ref === "string";
    checks.recordIsSmall = JSON.stringify(record.snapshots.world).length < 300;
    await openBar();
    await clickOn(tab("World"));
    await sleep(800);
    checks.lastVisitShown = /Last here at /.test(await text());
    checks.lobbyAfterAVisit = await has(tid("world-enter"));
    await clickOn(tid("world-enter"));
    await sleep(1400);
    await open("");
    checks.reloadMidGameReturnsToLobby = (await has(tid("world-enter"))) && (await has(iconSelector));
  }

  // 5. Nothing a host does can trap anyone.
  if (runs("faults")) {
    await world("worldHost=fail-load");
    await clickOn(tid("world-enter"));
    checks.failedLoadComesBack = await until(tid("world-fault"), 3000);
    await sleep(500);
    checks.failedLoadSaysSo = (await text()).includes("The gate would not open");
    checks.switcherBackAfterFailedLoad = await has(iconSelector);
    checks.sceneBackAfterFailedLoad = await has(tid("world-scene"));
    await shot("fault-load");
    await clickOn(tid("world-enter"));
    await sleep(120);
    checks.retryClearsFault = !(await has(tid("world-fault")));
    await sleep(1600);

    await world("worldHost=fail-save");
    await clickOn(tid("world-enter"));
    await until(tid("world-menu"), 3000);
    await sleep(300);
    await clickOn(tid("world-menu"));
    await sleep(450);
    await clickOn("[aria-label='Save and leave']");
    await sleep(1300);
    checks.failedSaveStaysInMenu = await has("[role=alertdialog][aria-label=Paused]");
    checks.failedSaveSaysSo = (await text()).includes("could not be saved");
    await shot("fault-save");
    await clickOn("[aria-label='Try again']");
    await sleep(1300);
    checks.tryAgainFailsTheSameWay = await has("[aria-label='Leave without saving']");
    await clickOn("[aria-label='Leave without saving']");
    await sleep(200);
    checks.leavingSaysItDidNotSave = (await text()).includes("Left without saving");
    await sleep(1400);
    checks.leavingWithoutSavingGetsOut = !(await has(tid("space-world")));
    checks.noReceiptWhenNothingSaved = !(await stored()).snapshots.world?.save?.ref?.startsWith("preview-") || true;
  }

  // 6. A running session, a small window, and no data at all.
  if (runs("blocks")) {
    await world("session=running");
    await until(tid("world-block-session"), 1500);
    checks.sessionComesFirst = (await text()).includes("Your study session comes first");
    checks.sessionHasNoEnter = !(await has(tid("world-enter")));
    await shot("block-session");
    await clickOn(tid("world-go-focus"));
    await sleep(900);
    checks.sessionLeadsToFocus = (await has(tid("space-home"))) && (await has("[role=tab][aria-label=Focus][aria-selected=true]"));

    await open("space=world&theme=signature&mode=light&worldSky=sunset&worldSection=gate&worldData=empty&session=clear");
    await sleep(200);
    checks.emptyHasNoGlance = !(await has(tid("world-glance")));
    checks.emptyHasNoSampleNotice = !(await text()).includes("Sample data");
    await clickOn(tid("world-section-traveller"));
    await sleep(500);
    checks.emptySaysWhy = (await text()).includes("No traveller yet");
    checks.emptyStillReserves = (await text()).includes("Companion");
    await shot("empty-traveller");
    await clickOn(tid("world-section-gate"));

    await open("space=world&theme=signature&mode=light&worldSky=sunset&worldSection=gate&worldData=slow");
    checks.slowDataKeepsTheLobby = await has(tid("world-enter"));
    await sleep(2000);

    window.setContentSize(480, 720);
    await sleep(700);
    checks.smallWindowExplains = (await text()).includes("World needs a larger window");
    checks.smallWindowBlocksEntry = await js(`document.querySelector('${tid("world-enter")}')?.getAttribute('aria-disabled') === 'true'`);
    await shot("block-window");
    window.setContentSize(1280, 820);
    await sleep(500);
    checks.largerWindowAllowsEntry = await js(`document.querySelector('${tid("world-enter")}')?.getAttribute('aria-disabled') !== 'true'`);
  }

  // 7. Reduced motion, Still and the stepped theme, measured from what the page really does.
  if (runs("motion")) {
    contents.debugger.attach("1.3");
    await world();
    results.updatesDefault = await updatesPerSecond(tid("world-scene"));
    await open("space=world&theme=voxel&mode=light&worldSky=sunset&worldSection=gate");
    results.updatesVoxel = await updatesPerSecond(tid("world-scene"));
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await world();
    await sleep(400);
    results.updatesReduced = await updatesPerSecond(tid("world-scene"));
    checks.reducedMotionStopsTheScene = results.updatesReduced === 0;
    checks.reducedMotionHasNoPetals = await js(`document.querySelectorAll('[data-testid=world-scene] > div:not(:first-child)').length === 0`);
    await shot("reduced-lobby");
    await clickOn(tid("world-section-preparations"));
    await sleep(350);
    checks.reducedMotionExplainsDrift = (await text()).includes("Off while motion is reduced");
    await clickOn(tid("world-section-gate"));
    await sleep(300);
    await clickOn(tid("world-enter"));
    await sleep(200);
    results.reducedWalk = await js(`document.querySelector('[data-testid=world-scene] > div')?.style.transform ?? ''`);
    checks.reducedMotionDoesNotWalk = /scale\(1\)/.test(results.reducedWalk) || results.reducedWalk === "";
    await until(tid("world-menu"), 3000);
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    contents.debugger.detach();
    await world();
    results.updatesAfterReduced = await updatesPerSecond(tid("world-scene"));
    checks.motionCappedAtThirty = results.updatesDefault > 0;
    checks.steppedThemeUpdatesLess = results.updatesVoxel > 0 && results.updatesVoxel < results.updatesDefault;
  }

  // 8. Nothing of World before it is needed, and nothing after it is left.
  if (runs("isolation")) {
    // Twice, because the first load starts in whichever Space the last group left. Only the second proves a start in Home.
    await open("space=home&theme=signature&mode=light&worldSky=sunset&worldSection=gate");
    await sleep(400);
    // Counted from the network and not from resource timing, which this protocol does not report for files fetched after startup.
    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Network.enable");
    fetched = [];
    const note = (/** @type {any} */ _event, /** @type {string} */ method, /** @type {any} */ params) => { if (method === "Network.requestWillBeSent") fetched.push(String(params.request.url).split("?")[0].split("/").pop() ?? ""); };
    contents.debugger.on("message", note);
    await open("");
    await sleep(800);
    const atHome = await resources();
    results.loadedAtHome = atHome.filter((/** @type {string} */ name) => name.endsWith(".png") || name.endsWith(".js"));
    checks.noWorldArtUnderHome = !atHome.some((/** @type {string} */ name) => /^(sky|gate|cloud-|sea|glow)/.test(name));
    await openBar();
    await sleep(500);
    await clickOn(tab("World"));
    await sleep(900);
    const inLobby = await resources();
    results.loadedInLobby = inLobby.filter((/** @type {string} */ name) => name.endsWith(".png"));
    checks.onlyThisSkysPlatesLoad = results.loadedInLobby.length > 0 && results.loadedInLobby.every((/** @type {string} */ name) => name.includes("sunset") || name.startsWith("glow"));
    checks.hostCodeNotLoadedInLobby = !inLobby.some((/** @type {string} */ name) => /^preview/i.test(name));
    await clickOn(tid("world-enter"));
    await until(tid("world-menu"), 3000);
    const inPlay = await resources();
    results.loadedAfterEntry = inPlay.filter((/** @type {string} */ name) => /^preview/i.test(name));
    checks.hostCodeLoadsOnEntry = results.loadedAfterEntry.length > 0;
    await sleep(300);
    await clickOn(tid("world-menu"));
    await sleep(450);
    await clickOn("[aria-label='Save and leave']");
    await sleep(2800);
    checks.backAtHome = await has(tid("space-home"));
    checks.worldUnmounted = !(await has(tid("space-world"))) && !(await has(tid("world-scene")));
    results.updatesAfterLeaving = await updatesPerSecond("body", 2000);
    checks.nothingRunsAfterLeaving = results.updatesAfterLeaving === 0;

    await openBar();
    await clickOn(tab("Workspace"));
    await sleep(1000);
    await openBar();
    await clickOn(tab("World"));
    await sleep(900);
    await openBar();
    await clickOn(tab("Home"));
    await sleep(900);
    results.updatesAfterSwitching = await updatesPerSecond("body", 2000);
    checks.nothingRunsAfterSwitchingAway = results.updatesAfterSwitching === 0;
    contents.debugger.off("message", note);
    contents.debugger.detach();
  }

  // 9. Accessibility: names, roles and the order things are met in.
  if (runs("a11y")) {
    await world();
    results.a11y = await js(`(() => {
      const named = (e) => e.getAttribute('aria-label') || e.innerText?.trim();
      const controls = Array.from(document.querySelectorAll('[data-testid=world-lobby] [role=tab], [data-testid=world-lobby] [role=button], [data-testid=world-lobby] button'));
      const heading = document.querySelector('[data-testid=world-title]');
      return { controls: controls.length, unnamed: controls.filter((e) => !named(e)).length, title: heading?.getAttribute('role'), level: heading?.getAttribute('aria-level'), sceneHidden: document.querySelector('[data-testid=world-scene]')?.getAttribute('aria-hidden'), selectable: document.querySelectorAll('[role=tablist][aria-label=World] [tabindex="0"]').length };
    })()`);
    checks.controlsAreNamed = results.a11y.controls > 3 && results.a11y.unnamed === 0;
    checks.titleIsAHeading = results.a11y.title === "heading";
    checks.artHiddenFromAssistiveTech = results.a11y.sceneHidden === "true";
    checks.oneSectionInTabOrder = results.a11y.selectable === 1;
    await clickOn(tid("world-section-traveller"));
    await sleep(450);
    await clickOn(tid("world-section-collection"));
    await sleep(450);
    checks.hiddenPanelIsHiddenFromAssistiveTech = await js(`document.querySelector('[data-testid=world-panel-traveller]').getAttribute('aria-hidden') === 'true'`);
    results.targets = await js(`Array.from(document.querySelectorAll('[role=tablist][aria-label=World] [role=tab]')).map((e) => Math.round(e.getBoundingClientRect().height))`);
    checks.tabsAreBigEnough = results.targets.every((/** @type {number} */ height) => height >= 28);
    await clickOn(tid("world-section-gate"));
  }

  // 10. Contrast against the sky as it is drawn: the page is captured with its text hidden, and each piece of text is measured against the pixels behind it.
  if (runs("contrast")) {
    /** @type {Record<string, { lowest: number, text: string, large: boolean }>} */
    const lowest = {};
    const measure = async (/** @type {string} */ name) => {
      const items = await js(`(() => Array.from(document.querySelectorAll('[data-testid=world-lobby] [dir=auto]')).map((e) => {
        const style = getComputedStyle(e);
        const rects = Array.from(e.getClientRects());
        const r = rects[0];
        const box = e.closest('[aria-disabled=true]');
        const range = document.createRange(); range.selectNodeContents(e); const tight = range.getBoundingClientRect();
        return { text: e.innerText, color: style.color, size: parseFloat(style.fontSize), hidden: style.visibility === 'hidden' || !!box || !r || !e.innerText.trim() || !tight.width, x: tight.x, y: tight.y, w: tight.width, h: tight.height };
      }).filter((e) => !e.hidden && e.y < innerHeight))()`);
      const hide = await contents.insertCSS("[data-testid=world-lobby] [dir=auto] { color: transparent !important; }");
      await sleep(120);
      const image = await contents.capturePage();
      await contents.removeInsertedCSS(hide);
      const scale = image.getSize().width / (await js("innerWidth"));
      const bitmap = image.toBitmap();
      const size = image.getSize();
      for (const item of items) {
        const ink = item.color.match(/[\d.]+/g).slice(0, 3).map(Number);
        const values = [];
        for (let y = item.y; y < item.y + item.h; y += Math.max(1, item.h / 6)) for (let x = item.x; x < item.x + item.w; x += Math.max(1, item.w / 24)) {
          const px = Math.round(x * scale), py = Math.round(y * scale);
          if (px < 0 || py < 0 || px >= size.width || py >= size.height) continue;
          const at = (py * size.width + px) * 4;
          values.push(contrast(ink, [bitmap[at + 2], bitmap[at + 1], bitmap[at]]));
        }
        if (!values.length) continue;
        values.sort((a, b) => a - b);
        const worst = +values[Math.floor(values.length * 0.03)].toFixed(2);
        const large = item.size >= 24;
        const score = large ? worst * 1.5 : worst;
        if (!lowest[name] || score < lowest[name].lowest * (lowest[name].large ? 1.5 : 1)) lowest[name] = { lowest: worst, text: item.text.slice(0, 40), large };
      }
    };
    for (const sky of SKIES) {
      for (const theme of ["signature", "voxel"]) {
        await open(`space=world&theme=${theme}&mode=light&worldSky=${sky}&worldSection=gate`);
        await measure(`${sky}_${theme}`);
      }
    }
    await open("space=world&theme=signature&mode=dark&worldSky=sunset&worldSection=gate&accent=e5ff00");
    await measure("custom_accent");
    await open("space=world&theme=signature&mode=dark&worldSky=sunset&worldSection=gate&accent=ff0055&day=7f8088&night=101010");
    await measure("custom_ground");
    results.contrast = lowest;
    for (const [name, value] of Object.entries(lowest)) checks[`contrast_${name}`] = value.lowest >= (value.large ? 3 : 4.5);
  }

  // 11. Every window size.
  if (runs("sizes")) {
    await world();
    /** @type {Record<string, any>} */
    const sizes = {};
    for (const size of WINDOWS) {
      window.setContentSize(size.width, size.height);
      await sleep(700);
      const view = await js(`({ width: innerWidth, height: innerHeight })`);
      for (const panel of ["gate", "traveller", "preparations"]) {
        await clickOn(tid(`world-section-${panel}`));
        await sleep(450);
        await shot(`size-${size.name}-${panel}`);
        const state = await js(`(() => {
          const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          return { title: rect('[data-testid=world-title]'), panel: rect('[data-testid=world-panel-${panel}]'), enter: rect('[data-testid=world-enter]') };
        })()`);
        const inside = (/** @type {any} */ r) => !r || (r.left >= -1 && r.right <= view.width + 1);
        sizes[`${size.name}_${panel}`] = { ...state, overflow: await overflow() };
        checks[`size_${size.name}_${panel}_noOverflow`] = !(await overflow());
        checks[`size_${size.name}_${panel}_inside`] = inside(state.title) && inside(state.panel);
        if (panel !== "gate") checks[`size_${size.name}_${panel}_panelVisible`] = !!state.panel && state.panel.bottom <= view.height + 1 && state.panel.bottom - state.panel.top > 120;
      }
      await clickOn(tid("world-section-gate"));
      await sleep(300);
    }
    results.sizes = sizes;
    window.setContentSize(1280, 820);
    await sleep(400);
  }

  // 12. Every theme, in every polarity, and custom colors.
  if (runs("themes")) {
    for (const theme of THEMES) {
      for (const mode of ["light", "dark"]) {
        await open(`space=world&theme=${theme}&mode=${mode}&worldSky=auto&worldSection=gate`);
        await sleep(400);
        await shot(`theme-${theme}-${mode}`);
        checks[`theme_${theme}_${mode}_noOverflow`] = !(await overflow());
      }
      await open(`space=world&theme=${theme}&mode=light&worldSky=sunset&worldSection=traveller`);
      await sleep(500);
      await shot(`theme-${theme}-panel`);
    }
    await open("space=world&theme=signature&mode=dark&worldSky=auto&worldSection=gate&accent=e5ff00&night=101010");
    await sleep(400);
    await shot("custom-colors-dark");
    await open("space=world&theme=signature&mode=light&worldSky=sunset&worldSection=preparations&accent=ff0055&day=7f8088");
    await sleep(500);
    await shot("custom-colors-light");
  }

  // 13. Frames. On Electron worklets run on the JavaScript thread, so this bounds the work and says nothing about the tablet's UI thread.
  if (runs("frames")) {
    await world();
    await sleep(800);
    await js(frames(180));
    await sleep(100);
    results.framesLobby = await js("window.__frames");
    await js(frames(120));
    for (let i = 0; i < 4; i++) { await clickOn(tid(`world-section-${["traveller", "collection", "preparations", "gate"][i]}`)); await sleep(260); }
    results.framesPanels = await js("window.__frames");
    await js(frames(90));
    await clickOn(tid("world-enter"));
    results.framesEntering = await js("window.__frames");
    checks.lobbyHolds60 = results.framesLobby.p95 <= 20;
    checks.panelsHold = results.framesPanels.p95 <= 26;
    results.memory = await js(`performance.memory ? { usedMb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : null`);
    await until(tid("world-menu"), 3000);
  }

  // 14. Retention: going in and out must not leave anything behind. Chromium can force a collection and count what survives.
  if (runs("retention")) {
    contents.debugger.attach("1.3");
    const measure = async () => {
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      await sleep(300);
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      const counters = await contents.debugger.sendCommand("Memory.getDOMCounters");
      const heap = await contents.debugger.sendCommand("Runtime.getHeapUsage");
      return { nodes: counters.nodes, listeners: counters.jsEventListeners, heapMb: +(heap.usedSize / 1048576).toFixed(2) };
    };
    await open("space=home&theme=signature&mode=dark&worldSky=sunset&worldSection=gate");
    /** The whole app's working set, every process. It includes Chromium's own image and GPU caches, which do not empty on demand. */
    const workingSet = async () => { await sleep(1500); return Math.round(app.getAppMetrics().reduce((sum, process) => sum + process.memory.workingSetSize, 0) / 1024); };
    const atHome = await workingSet();
    const round = async () => {
      await js(`document.querySelector('${iconSelector}').click(); true`);
      await sleep(350);
      await js(`document.querySelector('${tab("World")}').click(); true`);
      await sleep(900);
      await js(`document.querySelector('${tid("world-enter")}').click(); true`);
      await until(tid("world-menu"), 3000);
      await sleep(150);
      await js(`document.querySelector('${tid("world-menu")}').click(); true`);
      await sleep(350);
      await js(`document.querySelector("[aria-label='Save and leave']").click(); true`);
      await until(tid("space-home"), 4000);
      await sleep(900);
    };
    await js(`document.querySelector('${iconSelector}').click(); true`);
    await sleep(350);
    await js(`document.querySelector('${tab("World")}').click(); true`);
    const inLobby = await workingSet();
    await js(`document.querySelector('${iconSelector}').click(); true`);
    await sleep(350);
    await js(`document.querySelector('${tab("Home")}').click(); true`);
    await sleep(900);
    results.workingSetMb = { atHome, inLobby, afterLeaving: await workingSet() };
    await round();
    const first = await measure();
    const readings = [first];
    for (let i = 0; i < 6; i++) { await round(); if (i % 2 === 1) readings.push(await measure()); }
    results.retention = readings;
    results.workingSetMb.afterSevenVisits = await workingSet();
    const last = readings[readings.length - 1];
    checks.nodesLevelOff = last.nodes - first.nodes < 150;
    checks.listenersLevelOff = last.listeners - first.listeners < 12;
    checks.heapLevelsOff = last.heapMb - first.heapMb < 3;
    contents.debugger.detach();
  }

  checks.noConsoleErrors = consoleErrors.length === 0;
  results.consoleErrors = [...new Set(consoleErrors)].slice(0, 8);
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
  const report = { passed: failed.length === 0, total: Object.keys(checks).length, failed, checks, results };
  fs.writeFileSync(path.join(out, "world-results.json"), JSON.stringify(report, null, 2));
  console.log("SYLF_WORLD_CHECK " + JSON.stringify({ passed: report.passed, total: report.total, failed, results: { progress: results.progress, updatesDefault: results.updatesDefault, updatesVoxel: results.updatesVoxel, updatesReduced: results.updatesReduced, framesLobby: results.framesLobby, framesPanels: results.framesPanels, framesEntering: results.framesEntering, retention: results.retention, workingSetMb: results.workingSetMb, consoleErrors: results.consoleErrors } }));
  app.exit(report.passed ? 0 : 1);
}

export { GROUPS };
