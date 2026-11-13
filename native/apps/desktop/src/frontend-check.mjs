// Runs the packaged renderer against the loopback fixture with a fresh profile. No hosted endpoint is used.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { AUDIO_FILE, EMPTY_LOGIN, FIXTURE_LOGIN } from "./frontend-fixture.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (name) => `[data-testid="${name}"]`;
const byLabel = (label) => `[aria-label="${label}"]`;
const visible = `(selector) => [...document.querySelectorAll(selector)].find((node) => {
  const box = node.getBoundingClientRect();
  if (!box.width || !box.height) return false;
  for (let e = node; e; e = e.parentElement) {
    if (e.getAttribute("aria-hidden") === "true" || getComputedStyle(e).visibility === "hidden") return false;
  }
  return true;
})`;

export async function runFrontendCheck(window, fixture) {
  const out = process.env.SYLF_FRONTEND_CHECK_OUT ?? join(app.getPath("temp"), "sylf-frontend-check");
  mkdirSync(out, { recursive: true });
  const report = { passed: false, steps: [], viewports: [], island: null, media: fixture.mediaResponses, errors: [], error: null };
  const contents = window.webContents;
  // Another window can cover this one while the check runs (the machine is shared). A covered window stops drawing frames, which freezes resize
  // observers, animations and the media clock, so the check keeps it drawing.
  contents.setBackgroundThrottling(false);
  const js = (source) => contents.executeJavaScript(source);
  const dom = (selector, code) => js(`(() => { const e = (${visible})(${JSON.stringify(selector)}); return e ? (${code})(e) : null; })()`);
  const has = (selector) => dom(selector, "() => true");
  const text = (selector) => dom(selector, "(e) => e.innerText");
  const waitFor = async (read, detail) => {
    for (let i = 0; i < 120; i++) {
      const result = await read();
      if (result) return result;
      await sleep(75);
    }
    throw new Error(`Timed out waiting for ${detail}`);
  };
  const until = (selector) => waitFor(() => has(selector), selector);
  const hit = (type, x, y) => contents.sendInputEvent(type === "mouseMove" ? { type, x, y } : { type, x, y, button: "left", clickCount: 1 });
  const center = (selector) => waitFor(() => dom(selector, `(e) => {
    e.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = e.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2);
    const y = Math.round(r.y + r.height / 2);
    return e.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  }`), `${selector} to be clickable`);
  const click = async (selector) => {
    const { x, y } = await center(selector);
    hit("mouseMove", x, y); hit("mouseDown", x, y); hit("mouseUp", x, y);
    await sleep(180);
  };
  const key = async (keyCode, modifiers = []) => {
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(170);
  };
  const changeSpace = async (digit, target) => {
    await key(digit, [process.platform === "darwin" ? "meta" : "control"]);
    await until(id(target));
    await sleep(300);
  };
  const shot = async (name) => {
    const image = await contents.capturePage();
    assert(!image.isEmpty(), `Empty screenshot: ${name}`);
    writeFileSync(join(out, `${name}.png`), image.toPNG());
  };
  const enter = async (login) => {
    await click(id("signin-identifier")); contents.insertText(login.identifier);
    await click(id("signin-password")); contents.insertText(login.password);
    await click(id("signin-submit"));
  };
  const playing = () => waitFor(() => js("window.__qaMedia?.at(-1)?.currentTime > 0.2"), "decoded media clock to advance");
  const state = () => js("JSON.parse(localStorage.getItem('sylf.native.spaces.v1') ?? '{}').snapshots?.workspace");
  const soundPanel = id("dock-audio-panel");
  const status = (words) => waitFor(async () => (await text(soundPanel + " " + id("audio-status"))) === words, words);
  const tab = (label) => id("dock-panel-header") + ' [role="tab"]' + byLabel(label);
  const dismissDock = () => waitFor(async () => !await has(id("dock-panel")), "island to close");
  const touchSwipe = async (selector, delta) => {
    const { x, y } = await dom(selector, `(e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: ${delta < 0 ? "r.bottom - 5" : "r.top + r.height / 2"} };
    }`);
    await contents.debugger.sendCommand("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await contents.debugger.sendCommand("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + delta * i / 8 }] });
      await sleep(28);
    }
    await contents.debugger.sendCommand("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  // Home's dashboard: every part inside the page, the five destinations reachable, and how the four parts are arranged.
  const measure = () => js(`(() => {
    const page = document.querySelector('[data-testid="home-scroll-today"]');
    const r = page.getBoundingClientRect();
    const box = (name) => document.querySelector('[data-testid="' + name + '"]').getBoundingClientRect();
    const blocks = ['today-header', 'today-part-progress', 'today-part-world', 'today-part-objectives', 'today-part-social', 'today-target', 'today-day', 'today-momentum', 'today-world', 'today-circle'];
    const tabs = [...document.querySelectorAll('[aria-label="Home"][role="tablist"] [role="tab"]')];
    const allTabsReachable = tabs.length === 5 && tabs.every((tab) => {
      const b = tab.getBoundingClientRect();
      return b.left >= -1 && b.right <= innerWidth + 1 && b.width > 0;
    });
    const [progress, world, objectives, social] = ['progress', 'world', 'objectives', 'social'].map((name) => box('today-part-' + name));
    const sameRow = (a, b) => Math.abs(a.top - b.top) < 2;
    const sameColumn = (a, b) => Math.abs(a.left - b.left) < 2;
    // No part is a card: none has a fill, a border, a shadow or a radius of its own.
    const unboxed = ['progress', 'world', 'objectives', 'social'].every((name) => {
      const style = getComputedStyle(document.querySelector('[data-testid="today-part-' + name + '"]'));
      return style.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(style.borderTopWidth) === 0 && style.boxShadow === 'none' && parseFloat(style.borderTopLeftRadius) === 0;
    });
    // Text that is cut off by its own box, ignoring lines that are meant to end in an ellipsis.
    const clipped = [...page.querySelectorAll('[data-testid="today-dashboard"] [dir="auto"]')].filter((node) => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).textOverflow !== 'ellipsis').length;
    // The way into a session sits on the hairline between the rows: at the gutter where the four parts meet in the grid, at the page's middle otherwise,
    // over no part, and wholly on screen.
    const begin = box('today-begin');
    const hubBox = box('today-hub');
    const dashboard = box('today-dashboard');
    const layoutName = document.querySelector('[data-testid="today-dashboard"]').getAttribute('data-layout');
    const middle = layoutName === 'grid' ? (progress.right + world.left) / 2 : (dashboard.left + dashboard.right) / 2;
    const apart = (a, b) => a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1;
    const hub = {
      centred: Math.abs((begin.left + begin.right) / 2 - middle) <= 2,
      at: [Math.round((begin.left + begin.right) / 2), Math.round(middle), Math.round(hubBox.width), Math.round(dashboard.width)],
      clear: [progress, world, objectives, social].every((part) => apart(hubBox, part)),
      between: layoutName !== 'grid' || (hubBox.top >= Math.max(progress.bottom, world.bottom) - 1 && hubBox.bottom <= Math.min(objectives.top, social.top) + 1),
      onScreen: begin.top >= 0 && begin.bottom <= innerHeight && begin.left >= 0 && begin.right <= innerWidth,
      insideObjectives: document.querySelector('[data-testid="today-part-objectives"]').contains(document.querySelector('[data-testid="today-begin"]')),
    };
    return {
      width: innerWidth, height: innerHeight, allTabsReachable, unboxed, clipped, hub,
      layout: document.querySelector('[data-testid="today-dashboard"]').getAttribute('data-layout'),
      twoByTwo: sameRow(progress, world) && sameRow(objectives, social) && sameColumn(progress, objectives) && sameColumn(world, social) && world.left > progress.right && objectives.top > Math.max(progress.bottom, world.bottom),
      within: blocks.every((name) => { const b = box(name); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.width > 0; }),
      horizontalOverflow: page.scrollWidth > page.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      scroll: [page.scrollWidth, page.clientWidth, document.documentElement.scrollWidth, innerWidth],
      outside: [...document.querySelectorAll('body *')].filter((node) => { const b = node.getBoundingClientRect(); return !node.closest('[data-testid="today-window"]') && b.width > 0 && b.right > innerWidth + 1; }).slice(0, 6).map((node) => (node.getAttribute('data-testid') || node.getAttribute('aria-label') || node.textContent || node.tagName).slice(0, 30) + '@' + Math.round(node.getBoundingClientRect().right)),
      beyond: [...document.querySelectorAll('[data-testid="home-today"] *')].filter((node) => { const b = node.getBoundingClientRect(); return !node.closest('[data-testid="today-window"]') && b.width > 0 && (b.right > innerWidth + 1 || b.left < -1); }).slice(0, 4).map((node) => (node.getAttribute('data-testid') || node.textContent || node.tagName).slice(0, 40)),
    };
  })()`);
  // An exact viewport whatever the display: the window cannot be taller than the screen it is on, so the page is told its size and photographed through DevTools.
  const viewport = async (width, height) => {
    await contents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: Number(process.env.SYLF_FRONTEND_CHECK_SCALE ?? 1), mobile: false });
    await sleep(420);
  };
  const pageShot = async (name) => {
    const { data } = await contents.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
  };
  const homeFits = async (name, layout) => {
    // The page lays itself out again a moment after its size changes, so wait for the arrangement before measuring it.
    await waitFor(() => js(`document.querySelector('[data-testid="today-dashboard"]')?.getAttribute('data-layout') === ${JSON.stringify(layout)}`), `${name} to be laid out as ${layout}`);
    await sleep(200);
    await js(`(() => { document.querySelector('[data-testid="home-scroll-today"]').scrollTop = 0; return true; })()`);
    await sleep(120);
    // Fonts and the new width settle over a few frames; a page that still overflows after that is a real failure.
    let size = await measure();
    for (let tries = 0; tries < 12 && (size.horizontalOverflow || size.clipped || !size.within || !size.hub.centred || !size.hub.clear || !size.hub.between || size.beyond.length || size.twoByTwo !== (layout === "grid")); tries++) { await sleep(150); size = await measure(); }
    assert(size.within && size.allTabsReachable && !size.horizontalOverflow && size.unboxed && size.clipped === 0 && size.beyond.length === 0, `${name} layout: ${JSON.stringify(size)}`);
    assert.equal(size.layout, layout, `${name} layout: ${JSON.stringify(size)}`);
    assert(size.hub.centred && size.hub.clear && size.hub.between && !size.hub.insideObjectives, `${name} hub: ${JSON.stringify(size)}`);
    // On a desktop the hub is on screen without scrolling. On a shorter or stacked page it is reached by scrolling, and must still be clickable.
    if (layout === "grid" && size.height >= 755) assert(size.hub.onScreen, `${name} hub is off screen: ${JSON.stringify(size)}`);
    await center(id("today-begin"));
    await js(`(() => { document.querySelector('[data-testid="home-scroll-today"]').scrollTop = 0; return true; })()`);
    assert.equal(size.twoByTwo, layout === "grid", `${name} arrangement: ${JSON.stringify(size)}`);
    report.viewports.push({ name, ...size });
    await pageShot(`02-home-${name}`);
  };
  // The island: which CSS animations it holds and what they touch, and what the page does in four idle seconds.
  const island = () => js(`(() => {
    const root = document.querySelector('[data-testid="today-window"]');
    const animations = document.getAnimations().filter((animation) => root.contains(animation.effect?.target));
    return {
      state: root.getAttribute('data-island'),
      images: root.querySelectorAll('img').length,
      animations: animations.length,
      css: animations.every((animation) => animation instanceof CSSAnimation),
      running: animations.filter((animation) => animation.playState === 'running').length,
      properties: [...new Set(animations.flatMap((animation) => animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key)))))].sort(),
    };
  })()`);
  const idleWork = async (ms) => {
    const read = async () => Object.fromEntries((await contents.debugger.sendCommand("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    await js(`(() => { window.__qaFrames = 0; window.__qaMutations = 0; if (!window.__qaRaf) { window.__qaRaf = window.requestAnimationFrame; window.requestAnimationFrame = (callback) => { window.__qaFrames++; return window.__qaRaf(callback); }; new MutationObserver((records) => { window.__qaMutations += records.length; window.__qaIslandMutations += records.filter((record) => record.target.closest?.('[data-testid="today-window"]')).length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); } window.__qaIslandMutations = 0; return true; })()`);
    const before = await read();
    await sleep(ms);
    const after = await read();
    const round = (value) => Math.round(value * 1000) / 1000;
    return { ms, scriptSeconds: round(after.ScriptDuration - before.ScriptDuration), taskSeconds: round(after.TaskDuration - before.TaskDuration), layouts: after.LayoutCount - before.LayoutCount, styleRecalcs: after.RecalcStyleCount - before.RecalcStyleCount, animationFrameRequests: await js("window.__qaFrames"), domMutations: await js("window.__qaMutations"), islandMutations: await js("window.__qaIslandMutations") };
  };
  const homeOnly = process.env.SYLF_FRONTEND_CHECK_ONLY === "home";
  const emptyHome = async () => {
    await until(id("today-day"));
    await until(id("today-circle"));
    assert(!await has(id("today-next")) && !await has(id("today-ask")) && !await has(id("today-workspace")));
    assert.match(await text(id("today-day")), /No events or quests today/);
    assert(!/Solve the velocity problems/.test(await text(id("today-objectives"))));
    assert(!/1\s*min/.test(await text(id("today-target"))));
    assert.match(await text(id("today-target")), /Set a daily target/);
    assert.match(await text(id("today-circle")), /Add friends to study alongside them/);
    assert(!await has(id("today-invites")) && !await has(id("today-goals")) && !await has(id("today-ahead")));
    assert(!/Aiko|Mira|Night owls/.test(await text(id("today-dashboard"))));
    await shot("08-home-empty");
  };

  contents.on("render-process-gone", (_event, details) => report.errors.push(details.reason));
  contents.on("console-message", (event) => {
    if (event.level === "error" && !/Failed to load resource|net::ERR/.test(event.message)) report.errors.push(event.message.slice(0, 250));
  });
  try {
    window.setMinimumSize(320, 400);
    await until(id("signin-surface"));
    assert(!await has(id("spaces-icon")));
    assert(!await has(id("signin-later")));
    await shot("01-sign-in");
    await enter(FIXTURE_LOGIN);
    await until(id("today-momentum"));
    await until(id("today-person"));
    assert.match(await text(id("today-day")), /Solve the velocity problems/);
    assert.match(await text(id("today-objectives")), /45 min planned/);
    assert(!await has(id("today-next")) && !await has(id("today-ask")) && !await has(id("today-workspace")));
    const questOrderOk = await js(`(() => {
      const box = (id) => document.querySelector('[data-testid="' + id + '"]')?.getBoundingClientRect() ?? null;
      const day = box('today-day'), ahead = box('today-ahead'), weekly = box('weekly-quest'), goals = box('today-goals');
      if (day && weekly && day.bottom > weekly.top + 1) return false;
      if (ahead && weekly && ahead.bottom > weekly.top + 1) return false;
      if (weekly && goals && weekly.bottom > goals.top + 1) return false;
      return true;
    })()`);
    assert(questOrderOk, "weekly-quest should sit at the bottom of the quests section, below Coming up and above Goals");
    assert.match(await text(id("today-target")), /42\s*min/);
    assert.match(await text(id("today-level")), /7[\s\S]*Rank E[\s\S]*120 of 360 XP/);
    assert.match(await text(id("today-momentum")), /3\s*days in a row[\s\S]*2 hr 52 min\s*last 7 days[\s\S]*340\s*Sylph/);
    assert.match(await text(id("today-goals")), /Mechanics exam[\s\S]*1 of 3 quests done/);
    assert.match(await text(id("today-circle")), /1 studying now/);
    assert.match(await text(id("today-circle")), /Aiko Tanaka[\s\S]*Sam Okafor/);
    assert(!/Lena Fischer/.test(await text(id("today-circle"))), "An offline friend is not around now");
    report.steps.push("Sign-in gate, then a dashboard of the account's own progress, plan and circle");

    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Page.enable");
    await contents.debugger.sendCommand("Performance.enable");
    for (const { name, width, height, layout } of [
      { name: "desktop-1440", width: 1440, height: 900, layout: "grid" },
      { name: "desktop-1280", width: 1280, height: 755, layout: "grid" },
      { name: "tablet-landscape", width: 1024, height: 720, layout: "grid" },
      { name: "short-900x480", width: 900, height: 480, layout: "paired" },
      { name: "tablet-portrait-820", width: 820, height: 1180, layout: "paired" },
      { name: "tablet-portrait-744", width: 744, height: 1133, layout: "paired" },
      { name: "phone-390", width: 390, height: 844, layout: "stack" },
    ]) {
      await viewport(width, height);
      await homeFits(name, layout);
    }

    // The island is CSS animation of transform and opacity only, runs while the dashboard is on screen, and costs the page no script, layout or frames.
    await viewport(1440, 900);
    await waitFor(() => js(`document.querySelectorAll('[data-testid="today-window"] img').length >= 5`), "the island's plates");
    await sleep(600);
    const running = await island();
    assert.equal(running.state, "running", JSON.stringify(running));
    assert(running.animations >= 5 && running.css && running.running === running.animations, JSON.stringify(running));
    assert.deepEqual(running.properties, ["opacity", "transform"], JSON.stringify(running));
    const whileRunning = await idleWork(4000);
    await click(id("home-rail-plan"));
    await sleep(500);
    const pausedIsland = await island();
    assert.equal(pausedIsland.state, "paused", JSON.stringify(pausedIsland));
    assert.equal(pausedIsland.running, 0, JSON.stringify(pausedIsland));
    const whilePaused = await idleWork(4000);
    await click(id("home-rail-today"));
    await waitFor(async () => (await island()).state === "running", "the island to resume");
    // The rest of the page may read its data again in either window, so the island is held to its own subtree and to absolute bounds.
    assert.equal(whileRunning.islandMutations, 0, `The island touches the DOM: ${JSON.stringify({ whileRunning, whilePaused })}`);
    assert(whileRunning.layouts <= whilePaused.layouts + 2 && whileRunning.scriptSeconds <= 0.05 && whileRunning.animationFrameRequests <= 12, `The island costs work: ${JSON.stringify({ whileRunning, whilePaused })}`);
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await waitFor(async () => (await island()).state === "still", "reduced motion to still the island");
    const still = await island();
    assert.equal(still.animations, 0, JSON.stringify(still));
    await pageShot("02-home-reduced-motion");
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    await waitFor(async () => (await island()).state === "running", "the island to move again");
    report.island = { running, paused: pausedIsland, still, whileRunning, whilePaused };
    report.steps.push("The island animates on the compositor only, pauses off screen, stops for reduced motion and adds no script, layout or frames");

    // Invitations are answered on the dashboard, through the same server rules as in Circle.
    assert.match(await text(id("today-invites")), /Night owls[\s\S]*Invited by Aiko Tanaka[\s\S]*Mira Chen/);
    await click(id("today-accept-71"));
    await waitFor(async () => !await has(id("today-accept-71")) && /Mira Chen/.test(await text(id("today-around"))), "the accepted friend to be around");
    await click(id("today-party-invite-decline-91"));
    await waitFor(async () => !await has(id("today-invites")), "the declined invitation to leave");
    // A quest opens Focus with its subject and title, and the rail brings the dashboard back.
    await click(id("today-study-quest-32"));
    await until(id("home-focus"));
    await waitFor(async () => /Finish the lab write-up/.test(await text(id("home-focus"))), "Focus to carry the quest");
    await click(id("home-rail-today"));
    await until(id("today-day"));
    await click(id("today-plan"));
    await until(id("home-plan"));
    await click(id("home-rail-today"));
    await until(id("today-day"));
    report.steps.push("A friend request is accepted and a party invitation declined on the dashboard, a quest fills in Focus, and Calendar opens from Today");

    for (const { name, query, width, height, layout } of [
      { name: "cozy-light-1440", query: "theme=cozy&mode=light", width: 1440, height: 900, layout: "grid" },
      { name: "voxel-custom-1280", query: "theme=voxel&mode=dark&accent=edca64&night=1f2e28&textScale=1.25", width: 1280, height: 755, layout: "grid" },
      { name: "signature-light-custom-1440", query: "theme=signature&mode=light&accent=0f766e&day=f4efe6&textScale=1.25", width: 1440, height: 900, layout: "grid" },
      { name: "voxel-custom-744", query: "theme=voxel&mode=dark&accent=edca64&night=1f2e28&textScale=1.3", width: 744, height: 1133, layout: "paired" },
      { name: "cozy-light-390", query: "theme=cozy&mode=light&textScale=1.25", width: 390, height: 844, layout: "stack" },
    ]) {
      await viewport(width, height);
      await contents.loadURL(`sylf://app/?space=home&home=today&${query}`);
      await until(id("today-momentum"));
      await until(id("today-person"));
      await js("document.fonts.ready.then(() => true)");
      await sleep(320);
      await homeFits(name, layout);
    }
    const voxel = await (async () => { await viewport(1280, 755); await contents.loadURL("sylf://app/?space=home&home=today&theme=voxel&mode=dark&textScale=1"); await waitFor(() => js(`document.querySelectorAll('[data-testid="today-window"] img').length >= 5`), "the island's plates"); await sleep(500); return island(); })();
    assert.equal(voxel.state, "running", JSON.stringify(voxel));
    report.island.stepped = voxel;
    await contents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    await contents.debugger.sendCommand("Performance.disable");
    contents.debugger.detach();

    if (homeOnly) {
      await contents.loadURL("sylf://app/?space=home&home=today&theme=signature&mode=dark&textScale=1");
      await until(id("home-account"));
      // The hub begins the next quest: the Focus environment opens on it with its title, and the dashboard then offers the way back.
      await until(id("today-begin"));
      assert.match(await text(id("today-hub")), /Begin focus/);
      await click(id("today-begin"));
      await until(id("focus-environment"));
      await waitFor(async () => /Solve the velocity problems/.test(await text(id("focus-environment"))), "the environment to carry the quest");
      await click(id("environment-leave"));
      await waitFor(async () => /Back to focus/.test(await text(id("today-hub"))), "the hub to offer a way back to Focus");
      assert.match(await text(id("today-day")), /Solve the velocity problems/);
      assert(!await has(id("today-study-31")), "running session hides per-quest study button");
      report.steps.push("The hub at the middle begins the next quest in Focus with its title, then offers the way back");
      await click(id("home-account"));
      await until(id("account-sign-out"));
      await sleep(600);
      // The account page is still settling when it first opens, so the press is repeated until the question appears.
      await waitFor(async () => { if (await has('[role="alertdialog"]')) return true; await click(id("account-sign-out")); return has('[role="alertdialog"]'); }, "the sign-out question");
      await click('[role="alertdialog"] ' + byLabel("End and sign out"));
      await until(id("signin-surface"));
      await enter(EMPTY_LOGIN);
      await emptyHome();
      contents.debugger.attach("1.3");
      await contents.debugger.sendCommand("Page.enable");
      for (const { name, width, height, layout } of [{ name: "empty-1440", width: 1440, height: 900, layout: "grid" }, { name: "empty-390", width: 390, height: 844, layout: "stack" }]) {
        await viewport(width, height);
        await homeFits(name, layout);
      }
      await contents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
      contents.debugger.detach();
      report.steps.push("A second account gets its own empty dashboard");
      assert.deepEqual(report.errors, []);
      report.passed = true;
      return;
    }

    window.setContentSize(390, 720);
    await contents.loadURL("sylf://app/?space=home&home=today&theme=signature&mode=dark&textScale=1");
    await until(id("today-momentum"));
    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await touchSwipe(id("dock-rest"), 85);
    await until(soundPanel);
    await sleep(450);
    await shot("03-island-swipe-open");
    // Start at the bottom of the header so the gesture stays inside the viewport.
    await touchSwipe(id("dock-panel-header"), -39);
    await dismissDock();
    await contents.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
    contents.debugger.detach();
    report.steps.push("Downward touch swipe opens Sounds in the island and upward swipe closes it");

    window.setContentSize(1280, 760);
    await sleep(300);
    // Observe the real HTML media element without substituting its network, decoder, or playback.
    await js(`window.__qaMedia = []; window.Audio = new Proxy(window.Audio, { construct(RealAudio, args) { const media = new RealAudio(...args); window.__qaMedia.push(media); return media; } }); true;`);
    await click(id("dock-sounds-open"));
    await until(soundPanel);
    assert(await has(id("dock-audio-clock")));
    await click(byLabel("Forest Wind & Leaves"));
    await status("Playing");
    await playing();
    await shot("03-audio-playing");
    await dom(soundPanel + " [role=slider]", "(e) => { e.focus(); return true; }");
    await key("Left");
    assert(await js("window.__qaMedia.at(-1).volume < 0.6"));
    await click(tab("Timer"));
    await until(id("dock-panel-clock"));
    assert(!await has(soundPanel));
    await click(tab("Sounds"));
    await status("Playing");
    await key("Escape");
    await dismissDock();
    report.steps.push("One island switches between Timer and Sounds, and decoded Ogg playback keeps going as volume changes");

    await changeSpace("2", "workspace-root");
    assert(await js("window.__qaMedia.at(-1).paused === false"));
    const from = await center(id("dock-notes"));
    const to = { x: 380, y: 220 };
    hit("mouseMove", from.x, from.y);
    hit("mouseDown", from.x, from.y);
    for (let step = 1; step <= 18; step++) {
      contents.sendInputEvent({ type: "mouseMove", x: Math.round(from.x + (to.x - from.x) * step / 18), y: Math.round(from.y + (to.y - from.y) * step / 18), modifiers: ["leftbuttondown"] });
      await sleep(18);
    }
    await waitFor(() => js('Boolean(document.querySelector("[data-testid=workspace-carry]"))'), "the drag preview");
    await shot("04-workspace-drag");
    hit("mouseUp", to.x, to.y);
    const first = await waitFor(async () => (await state())?.windows?.[0], "tool drop to persist");
    assert.equal(first.tool, "notes");
    assert.equal((await state()).windows.length, 1);
    const landed = await dom(id(`window-bar-${first.id}`), "(e) => { const r = e.getBoundingClientRect(); return { x:r.left, y:r.top }; }");
    assert(Math.abs(landed.y - to.y) < 75, `Tool did not land near the drop: ${JSON.stringify(landed)}`);
    await click(id("dock-calculator"));
    await click(id("dock-layout"));
    await click(byLabel("Split screen"));
    await waitFor(async () => (await state())?.layout === "split", "split layout");
    await shot("04-workspace-split-landscape");
    window.setContentSize(744, 870);
    await sleep(450);
    const arranged = (await state()).windows.filter((item) => !item.minimized);
    assert.equal(arranged.length, 2);
    assert.equal(arranged[0].x, arranged[1].x);
    assert.notEqual(arranged[0].y, arranged[1].y);
    await shot("05-workspace-split-portrait");
    window.setContentSize(1280, 760);
    await sleep(420);
    await click(id(`window-fill-${first.id}`));
    await waitFor(async () => (await state())?.layout === "focus", "single window");
    assert.equal((await state()).windows.filter((item) => !item.minimized).length, 1);
    await click(id(`window-unfill-${first.id}`));
    await click(id("dock-layout"));
    await click(byLabel("Tile windows"));
    await waitFor(async () => (await state())?.layout === "fill", "tile layout");
    await sleep(450);
    await shot("06-workspace-tiled");
    await click(id(`window-unfill-${first.id}`));
    await waitFor(async () => (await state())?.layout === "free", "canvas layout restored");
    await until(id("spaces-icon"));
    report.steps.push("Mouse drag opens one tool, split reflows in portrait, and single and tiled layouts return to the canvas");

    await changeSpace("3", "world-lobby");
    assert(await js("window.__qaMedia.at(-1).paused === false"));
    await click(id("dock-sounds-open"));
    await click(soundPanel + " " + id("dock-sound-toggle"));
    assert(await js("window.__qaMedia.at(-1).paused === true"));
    await click(soundPanel + " " + id("dock-sound-toggle"));
    await status("Playing");
    await click(byLabel("Unavailable track"));
    await status("Couldn’t play this audio");
    await click(byLabel("Mechanical Typing Room"));
    await status("Playing");
    await playing();
    assert(await js("window.__qaMedia.filter((media) => !media.paused).length === 1"));

    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Page.enable");
    await contents.debugger.sendCommand("DOM.enable");
    await contents.debugger.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true });
    const selected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Audio file chooser did not open")), 7000);
      const listener = (_event, method, params) => {
        if (method !== "Page.fileChooserOpened") return;
        contents.debugger.off("message", listener);
        clearTimeout(timer);
        resolve(params.backendNodeId);
      };
      contents.debugger.on("message", listener);
    });
    await click(id("audio-open-file"));
    await contents.debugger.sendCommand("DOM.setFileInputFiles", { files: [AUDIO_FILE], backendNodeId: await selected });
    await status("Playing");
    await playing();
    assert(await js("window.__qaMedia.at(-1).src.startsWith('blob:')"));
    assert.equal(await text(soundPanel + " " + id("audio-track-title")), "rain.wav");
    await shot("07-local-file-in-world");
    await contents.debugger.sendCommand("Page.setInterceptFileChooserDialog", { enabled: false });
    contents.debugger.detach();
    await key("Escape");
    await dismissDock();
    report.steps.push("Playback survives Home, Workspace and World, a failed track recovers, and a picked WAV plays locally");

    await changeSpace("1", "today-day");
    await click(id("dock"));
    const before = await text(id("dock-panel-clock"));
    await click(id("dock-begin"));
    await until(id("dock-pause"));
    await waitFor(async () => (await text(id("dock-panel-clock"))) !== before, "the timer to tick during playback");
    await click(id("dock-pause"));
    await until(id("dock-resume"));
    await click(tab("Sounds"));
    const paused = await text(id("dock-audio-clock"));
    await sleep(1100);
    assert.equal(await text(id("dock-audio-clock")), paused);
    await click(tab("Timer"));
    await until(id("dock-resume"));
    await click(id("dock-enter-focus"));
    await until(id("focus-environment"));
    await click(id("environment-sound"));
    await status("Playing");
    assert.equal(await text(id("dock-audio-clock")), paused);
    assert(await js("window.__qaMedia.at(-1).src.startsWith('blob:')"));
    await click(id("dock-panel-header") + " " + byLabel("Close dock"));
    await click(id("environment-leave"));
    await until(id("home-account"));
    report.steps.push("The paused timer holds its value in Sounds and Focus plays the same local file");
    // With a session under way the hub at the middle of the dashboard is the way back into it.
    assert.match(await text(id("today-hub")), /Back to focus/);
    await click(id("today-begin"));
    await until(id("focus-environment"));
    await click(id("environment-leave"));
    await until(id("home-account"));
    await click(id("home-account"));
    await click(id("account-sign-out"));
    await click('[role="alertdialog"] ' + byLabel("End and sign out"));
    await until(id("signin-surface"));
    assert(await js("window.__qaMedia.every((media) => media.paused)"));
    await enter(EMPTY_LOGIN);
    await emptyHome();
    contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Page.enable");
    for (const { name, width, height, layout } of [{ name: "empty-1440", width: 1440, height: 900, layout: "grid" }, { name: "empty-390", width: 390, height: 844, layout: "stack" }]) {
      await viewport(width, height);
      await homeFits(name, layout);
    }
    await contents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    contents.debugger.detach();
    report.steps.push("The timer runs during audio, sign-out releases the player, and a second account gets its own empty dashboard");
    assert(report.media.some((response) => response.path.endsWith(".ogg") && response.status === 206));
    assert(report.media.some((response) => response.path.endsWith(".wav") && response.status === 206));
    assert(report.media.every((response) => !response.credentials));
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {
    report.error = error.stack ?? String(error);
    await shot("failure").catch(() => undefined);
  } finally {
    fixture.close();
    writeFileSync(join(out, "frontend-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("SYLF_FRONTEND_CHECK " + JSON.stringify(report));
    app.exit(report.passed ? 0 : 1);
  }
}
