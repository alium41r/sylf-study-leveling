// @ts-check
// Automated verification of the study session and the Universal Timer Dock in the real Electron window (run with --sylf-session-check).
// Starts, pauses and ends one session from every surface and proves the others follow, restarts the page in the middle of one, walks
// World's safeguards, presses the keys, measures how much renders, and checks that the dock is clear of everything at every window size,
// in every theme. Prints one SYLF_SESSION_CHECK line and exits non-zero on any failure. Evidence goes to SYLF_SESSION_CHECK_OUT, and
// SYLF_SESSION_CHECK_ONLY=<groups> runs part of it.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const GROUPS = ["sync", "restart", "finish", "world", "keys", "a11y", "sizes", "themes", "motion", "renders", "frames", "retention"];
const WINDOWS = [{ name: "wide", width: 1680, height: 1000 }, { name: "expanded", width: 1280, height: 820 }, { name: "tablet-landscape", width: 1200, height: 740 }, { name: "tablet-portrait", width: 800, height: 740 }, { name: "medium", width: 700, height: 740 }, { name: "split", width: 600, height: 740 }, { name: "compact", width: 480, height: 740 }, { name: "narrow", width: 340, height: 640 }, { name: "short", width: 900, height: 420 }, { name: "tiny", width: 340, height: 400 }];
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KEY = "sylf.native.study-session.v1";

/** @param {Electron.BrowserWindow} window */
export async function runSessionCheck(window) {
  try { await runChecks(window); } catch (error) {
    console.log("SYLF_SESSION_CHECK " + JSON.stringify({ passed: false, error: String(error?.stack ?? error).slice(0, 800) }));
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
  const out = process.env.SYLF_SESSION_CHECK_OUT ?? path.join(app.getPath("temp"), "sylf-session-check");
  fs.mkdirSync(out, { recursive: true });
  const only = process.env.SYLF_SESSION_CHECK_ONLY?.split(",").filter(Boolean);
  const runs = (/** @type {string} */ group) => !only || only.includes(group);
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const logs = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const message = String(event?.message);
    if (event?.level === "error" || event?.level === 3) consoleErrors.push(message.slice(0, 300));
    if (message.startsWith("SYLF_SESSION")) logs.push(message);
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
    await sleep(120);
  };
  const open = async (/** @type {string} */ query) => {
    const ready = new Promise((resolve) => {
      const listener = (/** @type {any} */ event) => { if (String(event?.message).startsWith("SYLF_FOUNDATION ")) { contents.off("console-message", listener); resolve(true); } };
      contents.on("console-message", listener);
    });
    // A load that lands while the last page is still unloading is aborted by Chromium, and says nothing about the app.
    await contents.loadURL(`${APP_ORIGIN}/${query ? `?${query}` : ""}`).catch(async (/** @type {any} */ error) => {
      if (error?.errno !== -3) throw error;
      await sleep(500);
      await contents.loadURL(`${APP_ORIGIN}/${query ? `?${query}` : ""}`);
    });
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
  const tid = (/** @type {string} */ id) => `[data-testid=${id}]`;
  const has = (/** @type {string} */ selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);
  const until = async (/** @type {string} */ selector, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await has(selector)) return true; await sleep(50); } return false; };
  const textOf = (/** @type {string} */ id) => js(`document.querySelector('[data-testid=${id}]')?.textContent ?? null`);
  const labelOf = (/** @type {string} */ id) => js(`document.querySelector('[data-testid=${id}]')?.getAttribute('aria-label') ?? null`);
  const record = () => js(`JSON.parse(localStorage.getItem('${KEY}'))`);
  const focused = () => js(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  const openPanel = async () => { await clickOn(tid("dock")); await sleep(460); };
  const closePanel = async () => { await key("Escape"); await sleep(320); };
  const panelOpen = () => js(`(() => { const e = document.querySelector('[data-testid=dock-panel]'); return !!e && getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('aria-hidden') !== 'true'; })()`);
  const space = async (/** @type {string} */ label) => { await clickOn(tid("spaces-icon")); await sleep(520); await clickOn(`[data-testid=spaces-tabs] [role=tab][aria-label=${label}]`); await sleep(640); };
  const rail = (/** @type {string} */ id) => `[data-testid=home-rail-${id}]`;
  const seconds = (/** @type {string | null} */ clock) => { const parts = String(clock).split(":").map(Number); return parts.reduce((sum, part) => sum * 60 + part, 0); };
  const rectOf = (/** @type {string} */ selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`);
  const overlaps = (/** @type {any} */ a, /** @type {any} */ b) => !!a && !!b && a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
  const inside = (/** @type {any} */ r, /** @type {{ width: number, height: number }} */ size) => !!r && r.x >= 0 && r.y >= 0 && r.right <= size.width + 0.5 && r.bottom <= size.height + 0.5;
  /** Every change to the page's text and structure under a selector, over `ms`. */
  const mutations = (/** @type {string} */ root, ms = 3100) => js(`new Promise((resolve) => { const node = document.querySelector(${JSON.stringify(root)}); if (!node) return resolve(-1); let count = 0; const seen = new MutationObserver((list) => { count += list.length; }); seen.observe(node, { subtree: true, childList: true, characterData: true, attributes: true }); setTimeout(() => { seen.disconnect(); resolve(count); }, ${ms}); })`);
  const frames = (/** @type {number} */ n) => `window.__frames = new Promise((resolve) => { const stamps = []; let last = performance.now(); const tick = (t) => { stamps.push(t - last); last = t; if (stamps.length < ${n}) requestAnimationFrame(tick); else { const s = stamps.slice(5).sort((a, b) => a - b); resolve({ frames: s.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), p99: +s[Math.floor(s.length * 0.99)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(tick); }); true`;

  /** @type {Record<string, any>} */
  const results = {};
  /** @type {Record<string, boolean>} */
  const checks = {};

  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 820);
  await sleep(300);

  // 1. One session, three surfaces. Begin in Workspace's dock, follow it to Focus, and act from each surface in turn.
  if (runs("sync")) {
    await open("space=workspace&wsClear=1&session=clear&sessionLength=25&theme=signature&mode=light");
    await shot("idle-workspace");
    checks.idleShowsLength = (await textOf("dock-clock")) === "25:00";
    await openPanel();
    await shot("panel-idle");
    checks.panelOpens = await panelOpen();
    await clickOn("[data-testid=dock-panel] [role=radio][aria-label='50 min']");
    await sleep(150);
    checks.lengthChosen = (await textOf("dock-clock")) === "50:00" && (await record()).length === 50;
    await clickOn(tid("dock-begin"));
    await sleep(200);
    const started = await record();
    const clientKey = started.active.clientKey;
    results.clientKey = clientKey.slice(0, 8);
    checks.begins = !!started.active && started.active.snapshot.v === 2 && started.active.length === 50;
    await shot("panel-running");
    await clickOn(tid("dock-outside"));
    await sleep(350);
    checks.outsideCloses = !(await panelOpen());
    await sleep(1200);
    checks.counts = seconds(await textOf("dock-clock")) < 50 * 60;
    await shot("running-workspace");

    await clickOn(tid("dock-timer"));
    await sleep(100);
    await clickOn(tid("dock-timer"));
    await until(tid("timer-clock"));
    await sleep(300);
    const together = async (/** @type {string} */ id) => js(`[document.querySelector('[data-testid=dock-clock]')?.textContent, document.querySelector('[data-testid=${id}]')?.textContent]`);
    const inStep = async (/** @type {string} */ id) => { for (let i = 0; i < 6; i++) { const [a, b] = await together(id); if (!a || a !== b) return false; await sleep(370); } return true; };
    checks.toolMatchesDock = await inStep("timer-clock");
    await shot("workspace-tool-running");

    // Into Home's Focus: the same running session, with no new one and no reset.
    const before = seconds(await textOf("dock-clock"));
    await space("Home");
    await clickOn(rail("focus"));
    await until(tid("focus-clock"));
    await sleep(300);
    checks.focusMatchesDock = await inStep("focus-clock");
    checks.focusDidNotReset = seconds(await textOf("focus-clock")) <= before;
    checks.sameSessionInFocus = (await record()).active.clientKey === clientKey;
    await shot("focus-running");

    // Pause in Focus, and the dock follows at once.
    await clickOn(tid("focus-pause"));
    await sleep(120);
    checks.dockFollowsPause = String(await labelOf("dock")).includes("Paused");
    const paused = await textOf("dock-clock");
    await sleep(1500);
    checks.pauseHolds = (await textOf("dock-clock")) === paused && (await textOf("focus-clock")) === paused;
    await shot("focus-paused");

    // Resume in Workspace's Timer.
    await space("Workspace");
    await until(tid("timer-resume"));
    checks.toolShowsPause = (await textOf("timer-clock")) === paused;
    await clickOn(tid("timer-resume"));
    await sleep(150);
    checks.dockFollowsResume = !String(await labelOf("dock")).includes("Paused");
    checks.sameSessionAfterResume = (await record()).active.clientKey === clientKey;
    await sleep(1300);
    checks.resumedCounts = seconds(await textOf("dock-clock")) < seconds(paused);

    // Pause from the dock, in the World lobby.
    await space("World");
    await openPanel();
    await shot("panel-world");
    await clickOn(tid("dock-pause"));
    await sleep(150);
    checks.dockPausesInWorld = (await record()).active.snapshot.isPaused === true;
    await closePanel();
    await clickOn(tid("spaces-icon"));
    await sleep(100);
    await key("Escape");

    // A tool can be reached from the dock in any Space, and it lands in the view. From World it comes to the canvas.
    await openPanel();
    await clickOn(tid("dock-go-audio"));
    await until("[data-testid^=workspace-window-]");
    await sleep(700);
    const audio = await js(`(() => { const e = [...document.querySelectorAll('[data-testid^=workspace-window-]')].pop().getBoundingClientRect(); return { x: e.x, y: e.y, right: e.right, bottom: e.bottom }; })()`);
    checks.audioLandsInView = inside(audio, await js(`({ width: innerWidth, height: innerHeight })`));
    checks.audioIsOpen = await js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1')).snapshots.workspace.windows.some((w) => w.tool === 'audio')`);

    // End from Focus. It asks first, and the time stays on this device, marked as not saved.
    await space("Home");
    await clickOn(tid("focus-end"));
    await until("[role=alertdialog]");
    await sleep(300);
    await shot("end-dialog");
    checks.endAsks = (await js("document.body.innerText")).includes("End this session?") && !!(await record()).active;
    checks.endSaysLocal = (await js("document.querySelector('[role=alertdialog]').innerText")).includes("not saved to your study record");
    await key("Escape");
    // A tap during the dialog's exit lands on its scrim, as it should, so the next press waits until the dialog has gone.
    const gone = Date.now() + 4000;
    while (Date.now() < gone && (await has("[role=alertdialog]"))) await sleep(50);
    await sleep(150);
    checks.endCanBeRefused = !!(await record()).active;
    await clickOn(tid("focus-end"));
    await until("[role=alertdialog]");
    await sleep(300);
    await clickOn("[role=alertdialog] [aria-label='End session']");
    await sleep(400);
    const ended = await record();
    checks.ended = ended.active === null && ended.ended[0].clientKey === clientKey && ended.ended[0].saved === false;
    results.ended = { focusSeconds: ended.ended[0].focusSeconds, operations: ended.ended[0].operations.map((/** @type {any} */ op) => op.action) };
    checks.operationsReplayable = results.ended.operations.join() === "PAUSE,RESUME,PAUSE,END";
    checks.dockGoesIdle = (await textOf("dock-clock")) === "50:00";
    checks.localListShown = (await js("document.querySelector('[data-testid=home-focus]').innerText")).includes("On this device") && (await js("document.querySelector('[data-testid=home-focus]').innerText")).includes("Not saved yet");
    await shot("focus-local-record");
    // A second start from Focus, then a start from elsewhere is refused by having no control for it.
    await clickOn(tid("focus-begin"));
    await sleep(200);
    const again = (await record()).active.clientKey;
    checks.newSessionNewKey = again !== clientKey;
    await openPanel();
    checks.noSecondBegin = !(await has(tid("dock-begin")));
    await closePanel();
    await open("session=clear&space=home&home=today");
  }

  // 2. A restart in the middle of a session.
  if (runs("restart")) {
    await open("space=home&home=focus&session=running&sessionLength=open&theme=signature&mode=dark");
    const first = await record();
    await sleep(2300);
    const was = seconds(await textOf("dock-clock"));
    await open("space=workspace&wsClear=1");
    await sleep(1200);
    const next = await record();
    const now = seconds(await textOf("dock-clock"));
    checks.restartIsSameSession = next.active.clientKey === first.active.clientKey;
    checks.restartKeepsCounting = now >= was + 1;
    checks.restartDidNotRewrite = next.active.startedAt === first.active.startedAt;
    await open("space=home&home=today&session=paused&sessionLength=25");
    await sleep(1100);
    const held = await textOf("dock-clock");
    await open("space=home&home=today");
    await sleep(1100);
    checks.pausedStaysPausedAfterRestart = (await textOf("dock-clock")) === held && (await record()).active.snapshot.isPaused === true;
    results.restart = { was, now, held };
    await open("session=clear");
  }

  // 3. A countdown that ends, seen and unseen. Three seconds in minutes.
  if (runs("finish")) {
    await open("space=home&home=focus&session=running&sessionLength=0.05&theme=studio&mode=light");
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline && !(await has(tid("focus-finish")))) await sleep(100);
    checks.countdownFinishes = await has(tid("focus-finish"));
    checks.finishedShowsCheck = String(await labelOf("dock")).includes("Finished");
    checks.finishedAtZero = (await textOf("dock-clock")) === "00:00";
    await shot("focus-finished");
    await clickOn(tid("focus-keep-going"));
    await sleep(1300);
    checks.keepsGoing = seconds(await textOf("dock-clock")) >= 4 && (await record()).active.length === null;
    await clickOn(tid("focus-end"));
    await until("[role=alertdialog]");
    await sleep(250);
    await clickOn("[role=alertdialog] [aria-label='End session']");
    await sleep(300);
    // Ran out while the app was shut: it ends at its own deadline, and the time away is not credited.
    await open("space=home&home=today&session=running&sessionLength=0.03");
    await open("");
    await sleep(2200);
    await open("");
    await sleep(300);
    const late = await record();
    checks.endedAtOwnDeadline = late.active.snapshot.phase === "done" && Math.floor(late.active.snapshot.focusMs / 1000) <= 2;
    results.lateFocusMs = late.active.snapshot.focusMs;
    await open("session=clear&sessionLength=25");
  }

  // 4. World: the dock is in the lobby and never in the game, and time in the game cannot count.
  if (runs("world")) {
    await open("space=world&session=running&sessionLength=25&theme=signature&mode=light&worldSky=sunset&worldSection=gate");
    await until(tid("world-block-session"));
    await sleep(500);
    checks.dockInLobby = await has(tid("dock"));
    checks.sessionBlocksEntry = !(await has(tid("world-enter")));
    checks.blockExplainsItself = (await js("document.body.innerText")).includes("Your study session comes first");
    await shot("world-block");
    await clickOn(tid("world-pause-session"));
    await sleep(300);
    checks.pauseIsChosenHere = (await record()).active.snapshot.isPaused === true;
    checks.entryOpensOnPause = await has(tid("world-enter"));
    checks.pausedSaysSo = (await js("document.body.innerText")).includes("stays paused while you are in the world");
    await shot("world-paused");
    const held = await textOf("dock-clock");
    await clickOn(tid("world-enter"));
    await until(tid("world-menu"), 8000);
    await sleep(300);
    checks.noDockInGame = !(await has(tid("dock")));
    checks.noSwitcherInGame = !(await has(tid("spaces-icon")));
    await shot("world-game-no-dock");
    await key("1", ["meta"]);
    await sleep(120);
    checks.noSpaceKeyInGame = await has(tid("world-menu"));
    await sleep(1500);
    await clickOn(tid("world-menu"));
    await until("[aria-label='Save and leave']");
    await sleep(300);
    await clickOn("[aria-label='Save and leave']");
    await until(tid("dock"), 8000);
    await sleep(400);
    checks.dockReturns = (await textOf("dock-clock")) === held;
    checks.gameTimeNotCounted = (await record()).active.snapshot.isPaused === true;
    await open("space=world&session=clear&worldSection=gate&worldSky=sunset");
    await until(tid("world-enter"));
    checks.enterWithNoSession = await has(tid("world-enter"));
    await clickOn(tid("world-section-preparations"));
    await sleep(500);
    await shot("world-panel-with-dock");
    checks.panelClearOfDock = !overlaps(await rectOf(tid("world-panel-preparations")), await rectOf(tid("dock")));
    await open("session=clear&worldSection=gate&space=home&home=today");
  }

  // 5. Keys.
  if (runs("keys")) {
    await open("space=home&home=today&session=clear&sessionLength=25&theme=signature&mode=light");
    const active = () => js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1')).activeSpace`);
    await key("2", ["meta"]);
    await sleep(700);
    checks.commandTwoIsWorkspace = (await active()) === "workspace" && (await has(tid("workspace-root")));
    await key("3", ["meta"]);
    await sleep(700);
    checks.commandThreeIsWorld = (await active()) === "world";
    await key("1", ["meta"]);
    await sleep(700);
    checks.commandOneIsHome = (await active()) === "home";
    await key("2", ["control"]);
    await sleep(300);
    checks.controlDigitLeftToTheSystem = process.platform !== "darwin" || (await active()) === "home";
    await key("2", ["meta", "shift"]);
    await sleep(200);
    checks.shiftIsLeftAlone = process.platform !== "darwin" || (await active()) === "home";
    await key("t", ["alt"]);
    await sleep(460);
    checks.altTOpensDock = await panelOpen();
    await shot("panel-keyboard");
    checks.focusMovesIntoPanel = await js(`document.querySelector('[data-testid=dock-panel]').contains(document.activeElement)`);
    await key("Tab");
    await key("Tab");
    checks.tabStaysInPanel = await js(`document.querySelector('[data-testid=dock-panel]').contains(document.activeElement)`);
    await key("Escape");
    await sleep(320);
    checks.escapeCloses = !(await panelOpen());
    checks.focusReturnsToDock = String(await focused()).startsWith("Timer.");
    await key("t", ["alt"]);
    await sleep(460);
    await key("Escape");
    await sleep(320);
    await clickOn(tid("dock"));
    await sleep(460);
    await clickOn(tid("dock-begin"));
    await sleep(200);
    await closePanel();
    await key("p", ["alt"]);
    await sleep(150);
    checks.altPPauses = (await record()).active.snapshot.isPaused === true;
    await key("p", ["alt"]);
    await sleep(150);
    checks.altPResumes = (await record()).active.snapshot.isPaused === false;
    await openPanel();
    await clickOn(tid("dock-end"));
    await until("[role=alertdialog]");
    await sleep(300);
    await key("2", ["meta"]);
    await sleep(400);
    checks.keysWaitForModal = (await active()) === "home";
    await clickOn("[role=alertdialog] [aria-label='End session']");
    await sleep(400);
    // A Workspace with its own keys: Alt + a digit is still a tool, and Alt + T does not reach one.
    await open("space=workspace&wsClear=1&session=clear");
    await key("7", ["alt"]);
    await sleep(500);
    checks.altDigitStillOpensTool = await js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1')).snapshots.workspace.windows.some((w) => w.tool === 'timer')`);
    await open("space=home&home=today");
  }

  // 6. Screen readers and keyboard order.
  if (runs("a11y")) {
    await open("space=home&home=today&session=clear&sessionLength=25&theme=signature&mode=light");
    checks.dockHasName = String(await labelOf("dock")).startsWith("Timer. Ready");
    for (let i = 0; i < 8 && !String(await focused()).startsWith("Spaces."); i++) await key("Tab");
    results.tabOrder = [await focused()];
    for (let i = 0; i < 2; i++) { await key("Tab"); results.tabOrder.push(await focused()); }
    checks.dockIsSecondStop = String(results.tabOrder[0]).startsWith("Spaces.") && String(results.tabOrder[1]).startsWith("Timer.");
    await open("space=home&home=focus&session=running&sessionLength=25");
    checks.clockIsATimer = await has("[data-testid=focus-clock][role=timer]");
    checks.clockHasWords = String(await labelOf("focus-clock")).includes("left");
    checks.panelNotMountedUntilNeeded = !(await has(tid("dock-panel")));
    await openPanel();
    await closePanel();
    checks.closedPanelIsHidden = await js(`(() => { const e = document.querySelector('[data-testid=dock-panel]'); return e.getAttribute('aria-hidden') === 'true' && getComputedStyle(e).visibility === 'hidden'; })()`);
    checks.touchTargets = await js(`(() => { const r = document.querySelector('[data-testid=dock]').getBoundingClientRect(); return r.height >= 32 && r.width >= 44; })()`);
    await open("session=clear&space=home&home=today");
  }

  // 7. Clear of everything, at every size, in every Space, at rest and open.
  if (runs("sizes")) {
    /** @type {Record<string, any>} */
    const sizes = {};
    for (const size of WINDOWS) {
      window.setContentSize(size.width, size.height);
      await sleep(250);
      const real = await js(`({ width: innerWidth, height: innerHeight })`);
      const problems = [];
      for (const place of ["home", "workspace", "world"]) {
        await open(`space=${place}&session=running&sessionLength=25&theme=signature&mode=light&wsClear=1&wsOpen=notes,timer&worldSection=gate&worldSky=day&home=focus`);
        await sleep(300);
        if (place === "workspace" && size.width >= 600) { await key("s", ["alt"]); await sleep(700); }
        const dock = await rectOf(tid("dock"));
        if (!inside(dock, real)) problems.push(`${place}: dock leaves the window`);
        if (overlaps(dock, await rectOf(tid("spaces-icon")))) problems.push(`${place}: dock on the Spaces icon`);
        if (overlaps(dock, await rectOf(tid("dev-showcase")))) problems.push(`${place}: dock on the development entry`);
        if (await overflow()) problems.push(`${place}: page overflows`);
        if (place === "home") {
          if (overlaps(dock, await rectOf(tid("home-strip-focus")))) problems.push("home: dock on the strip");
          for (const id of ["today", "focus", "circle", "progress"]) if (overlaps(dock, await rectOf(rail(id)))) problems.push(`home: dock on rail ${id}`);
        }
        if (place === "workspace") {
          const windows = await js(`[...document.querySelectorAll('[data-testid^=workspace-window-]')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; })`);
          for (const rect of windows) if (overlaps(dock, rect)) problems.push("workspace: dock on a window");
          if (overlaps(dock, await rectOf(tid("workspace-dock")))) problems.push("workspace: dock on the Command Center");
        }
        if (place === "world") {
          for (const id of ["world-title", "world-entry", "world-sections", "world-glance"]) if (overlaps(dock, await rectOf(tid(id)))) problems.push(`world: dock on ${id}`);
          if (overlaps(await rectOf(tid("world-entry")), await rectOf(tid("world-glance")))) problems.push("world: the way in is under the glance");
        }
        await shot(`size-${size.name}-${place}`);
        await openPanel();
        const panel = await rectOf(tid("dock-panel"));
        if (!inside(panel, real)) problems.push(`${place}: panel leaves the window ${JSON.stringify(panel)}`);
        const controls = await js(`[...document.querySelectorAll('[data-testid=dock-panel] [role=button]')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y }; })`);
        if (controls.some((/** @type {any} */ r) => r.x < panel.x - 0.5 || r.right > panel.right + 0.5)) problems.push(`${place}: a control leaves the panel`);
        if (place === "workspace") await shot(`size-${size.name}-panel`);
        await closePanel();
      }
      sizes[size.name] = problems;
      checks[`clear-${size.name}`] = problems.length === 0;
    }
    results.sizes = sizes;
    // Where the Spaces bar reaches the dock, the dock steps aside until it closes.
    window.setContentSize(700, 740);
    await sleep(250);
    await open("space=home&home=today&session=clear&theme=signature&mode=light");
    await clickOn(tid("spaces-icon"));
    await sleep(600);
    const bar = await rectOf(tid("spaces-tabs"));
    const plate = await rectOf(tid("dock"));
    results.barReach = { bar: bar?.right, dock: plate?.x };
    const dockOpacity = () => js(`getComputedStyle(document.querySelector('[data-testid=dock]').parentElement.parentElement).opacity`);
    checks.dockYieldsToBar = !overlaps(bar, plate) || Number(await dockOpacity()) === 0;
    await shot("bar-over-dock");
    await key("Escape");
    await sleep(400);
    checks.dockReturnsAfterBar = Number(await dockOpacity()) === 1;
    // Large text: the dock grows with it and still clears everything, because its width comes from the type.
    window.setContentSize(800, 740);
    await sleep(250);
    await open("space=home&home=focus&session=running&sessionLength=25&theme=signature&mode=light&textScale=1.3");
    await sleep(300);
    const large = await rectOf(tid("dock"));
    const clock = await rectOf(tid("dock-clock"));
    checks.largeTextFits = !!large && !!clock && clock.right <= large.right && clock.x >= large.x && !overlaps(large, await rectOf(tid("home-strip-focus")));
    checks.largeTextRailLabelsFit = await js(`[...document.querySelectorAll('[data-testid^=home-rail-] [dir=auto]')].every((e) => e.scrollWidth <= e.clientWidth + 1)`);
    await shot("large-text-focus");
    await openPanel();
    await shot("large-text-panel");
    const big = await rectOf(tid("dock-panel"));
    checks.largeTextPanelInWindow = inside(big, await js(`({ width: innerWidth, height: innerHeight })`));
    await closePanel();
    await open("textScale=1&session=clear");
    // Resizing with a session running changes nothing about it, and the panel stays open across a resize.
    window.setContentSize(1280, 820);
    await sleep(300);
    await open("space=workspace&wsClear=1&wsOpen=timer&session=running&sessionLength=25&theme=signature&mode=light");
    const key_ = (await record()).active.clientKey;
    await openPanel();
    await js("window.__dockNode = document.querySelector('[data-testid=dock-panel]'); true");
    for (const size of [{ width: 820, height: 700 }, { width: 480, height: 700 }, { width: 1280, height: 820 }]) { window.setContentSize(size.width, size.height); await sleep(250); }
    checks.resizeKeepsPanelMounted = await js("window.__dockNode === document.querySelector('[data-testid=dock-panel]')");
    checks.resizeKeepsSession = (await record()).active.clientKey === key_;
    await closePanel();
    await open("session=clear&space=home&home=today");
  }

  // 8. Every theme, both modes, and colors chosen by a person. The words on the dock are measured against the plate they sit on.
  if (runs("themes")) {
    const rgb = (/** @type {string} */ value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    /** @type {Record<string, number>} */
    const ratios = {};
    const pairs = [...THEMES.flatMap((theme) => ["light", "dark"].map((mode) => `theme=${theme}&mode=${mode}`)), "theme=signature&mode=dark&accent=e5ff00&day=7f8088&night=101010", "theme=cozy&mode=light&accent=ff2d55&day=7f8088&night=101010"];
    for (const query of pairs) {
      await open(`space=home&home=focus&session=running&sessionLength=25&${query}`);
      const name = query.replace(/[=&]/g, "-");
      const clock = await js(`getComputedStyle(document.querySelector('[data-testid=dock-clock]')).color`);
      const plate = await js(`(() => { let e = document.querySelector('[data-testid=dock]'); while (e) { const c = getComputedStyle(e).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; e = e.parentElement; } return 'rgb(255,255,255)'; })()`);
      ratios[name] = +contrast(rgb(clock), rgb(plate)).toFixed(2);
      checks[`contrast-${name}`] = ratios[name] >= 4.5;
      await openPanel();
      await shot(`theme-${name}`);
      await closePanel();
    }
    results.contrast = ratios;
    await open("session=clear&theme=signature&mode=light");
  }

  // 9. Reduced motion: a plain fade, with nothing scaling.
  if (runs("motion")) {
    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await open("space=home&home=today&session=clear&theme=signature&mode=light");
    await clickOn(tid("dock"));
    await sleep(50);
    const during = await js(`getComputedStyle(document.querySelector('[data-testid=dock-panel]')).transform`);
    await sleep(400);
    checks.reducedMotionDoesNotScale = during === "none" || during === "matrix(1, 0, 0, 1, 0, 0)";
    checks.reducedMotionStillOpens = await panelOpen();
    await closePanel();
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    contents.debugger.detach();
  }

  // 10. What renders. Nothing but the dock's few characters changes while a session runs, and a hidden view adds nothing.
  if (runs("renders")) {
    await open("space=home&home=focus&session=running&sessionLength=25&theme=signature&mode=light");
    await clickOn(rail("today"));
    await sleep(500);
    results.hiddenFocusMutations = await mutations(tid("home-focus"));
    checks.hiddenFocusRendersNothing = results.hiddenFocusMutations === 0;
    results.shellMutations = await mutations("#root", 4100);
    await clickOn(rail("focus"));
    await sleep(800);
    results.withFocusMutations = await mutations("#root", 4100);
    checks.oneBeatASecond = results.shellMutations > 0 && results.shellMutations <= 20;
    // In Workspace: a minimized Timer stops, and comes back with the true time.
    await open("space=workspace&wsClear=1&wsOpen=timer&session=running&sessionLength=25");
    await until(tid("timer-clock"));
    const timer = await js(`JSON.parse(localStorage.getItem('sylf.native.spaces.v1')).snapshots.workspace.windows.find((w) => w.tool === 'timer').id`);
    await sleep(300);
    await clickOn(`[data-testid=window-minimize-${timer}]`);
    await sleep(500);
    results.minimizedToolMutations = await mutations(`[data-testid=tool-${timer}]`, 2100);
    checks.minimizedToolRendersNothing = results.minimizedToolMutations <= 0;
    await clickOn(`[data-testid=minimized-${timer}]`);
    await sleep(500);
    checks.restoredToolHasTrueTime = (await textOf("timer-clock")) === (await textOf("dock-clock"));
    results.timersWhileRunning = await js(`new Promise((resolve) => { const real = globalThis.setTimeout; let count = 0; globalThis.setTimeout = (...args) => { count++; return real(...args); }; real(() => { globalThis.setTimeout = real; resolve(count); }, 3000); })`);
    checks.oneTimerForTheClock = results.timersWhileRunning <= 5;
    await open("session=clear&space=home&home=today");
    await sleep(1500);
    results.idleMutations = await mutations("#root", 2100);
    checks.nothingRendersWhenIdle = results.idleMutations === 0;
  }

  // 11. Opening and closing, on a busy page.
  if (runs("frames")) {
    await open("space=workspace&wsClear=1&wsOpen=notes,calculator,timer,audio&session=running&sessionLength=25&theme=signature&mode=dark");
    await sleep(800);
    await js(frames(150));
    for (let i = 0; i < 4; i++) { await clickOn(tid("dock")); await sleep(420); await key("Escape"); await sleep(380); }
    results.panelFrames = await js("window.__frames");
    await open("session=clear&space=home&home=today");
  }

  // 12. Retention: open and close, with a running clock, and see what stays.
  if (runs("retention")) {
    await open("space=home&home=today&session=running&sessionLength=open&theme=signature&mode=light");
    contents.debugger.attach("1.3");
    const measure = async () => {
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      await sleep(300);
      await contents.debugger.sendCommand("HeapProfiler.collectGarbage");
      const counters = await contents.debugger.sendCommand("Memory.getDOMCounters");
      const heap = await contents.debugger.sendCommand("Runtime.getHeapUsage");
      return { nodes: counters.nodes, listeners: counters.jsEventListeners, heapMb: +(heap.usedSize / 1048576).toFixed(2) };
    };
    await clickOn(tid("dock"));
    await sleep(400);
    await key("Escape");
    await sleep(300);
    const first = await measure();
    for (let i = 0; i < 12; i++) { await clickOn(tid("dock")); await sleep(260); await key("Escape"); await sleep(220); }
    const last = await measure();
    results.retention = { first, last };
    checks.panelReopeningAddsNoNodes = last.nodes - first.nodes <= 40;
    checks.panelReopeningAddsNoListeners = last.listeners - first.listeners <= 8;
    contents.debugger.detach();
    await open("session=clear");
  }

  results.sessionLogs = logs.filter((line) => /start|pause|resume|end|finished/.test(line)).length;
  checks.noConsoleErrors = consoleErrors.length === 0;
  results.consoleErrors = consoleErrors.slice(0, 5);
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const report = { passed: failed.length === 0, total: Object.keys(checks).length, failed, groups: only ?? GROUPS, results };
  fs.writeFileSync(path.join(out, "session-check.json"), JSON.stringify({ ...report, checks }, null, 2));
  console.log("SYLF_SESSION_CHECK " + JSON.stringify(report));
  app.exit(failed.length ? 1 : 0);
}
