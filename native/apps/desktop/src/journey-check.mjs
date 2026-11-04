// @ts-check
// The whole student journey, in the real Electron window, against the real Next.js server on a disposable database (run through
// scripts/test/run-backend-local.mjs --journey, which starts this process twice with one profile). What crosses between the two runs is what a real
// restart keeps: the vault, the journal and the session, on disk. Nothing here reaches around the app to help it: it clicks, types and reads the
// screen, and asks the server what really happened. Sylvie is asked something the server answers by itself, so no AI provider is called.
//
// A recording stub sits between the app and the server, so the check can take the network away, fail one route, and count what really left.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PASSWORD = "a-long-enough-password";
const SAMPLE_WORDS = ["Sample data", "Sample Student", "Amara Osei", "Complex numbers", "Organic chemistry", "Everyone shown here is invented"];

/** @param {Electron.BrowserWindow} window @param {{ stub: any, backend: any }} context */
export async function runJourneyCheck(window, context) {
  const out = process.env.SYLF_JOURNEY_OUT ?? path.join(app.getPath("temp"), "sylf-journey");
  const stage = process.env.SYLF_JOURNEY_STAGE ?? "first";
  const finish = (/** @type {Record<string, any>} */ result) => {
    context.stub.close();
    console.log("SYLF_JOURNEY_CHECK " + JSON.stringify(result).slice(0, 6000));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `journey-${stage}.json`), JSON.stringify(result, null, 1) + "\n");
    app.exit(result.passed ? 0 : 1);
  };
  const guard = setTimeout(() => finish({ passed: false, stage, error: "timed out after 8 minutes" }), 480_000);
  try { const result = await runStage(window, context, stage, out); clearTimeout(guard); finish(result); }
  catch (error) { clearTimeout(guard); finish({ passed: false, stage, error: String(/** @type {Error} */ (error)?.stack ?? error).slice(0, 1200) }); }
}

/** @param {Electron.BrowserWindow} window @param {{ stub: any, backend: any }} context @param {string} stage @param {string} out */
async function runStage(window, { stub }, stage, out) {
  const contents = window.webContents;
  fs.mkdirSync(out, { recursive: true });
  const statePath = path.join(out, "journey-state.json");
  /** @type {string[]} */ const consoleErrors = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const level = event?.level;
    const message = String(event?.message);
    if ((level === "error" || level === 3) && !/Failed to load resource|net::ERR/.test(message)) consoleErrors.push(message.slice(0, 300));
  });
  if (contents.isLoading()) await new Promise((resolve) => contents.once("did-finish-load", () => resolve(undefined)));
  window.setMinimumSize(320, 400);
  window.setContentSize(1280, 740);
  await sleep(600);

  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  /** @type {Record<string, boolean>} */ const checks = {};
  /** @type {Record<string, any>} */ const facts = {};
  const check = (/** @type {string} */ name, /** @type {any} */ ok) => { checks[name] = !!ok; if (!ok) console.log(`SYLF_JOURNEY miss: ${name}`); };
  const shot = async (/** @type {string} */ name) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { const image = await contents.capturePage(); if (!image.isEmpty()) return fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG()); } catch { /* Retried. */ }
      contents.invalidate();
      await sleep(400);
    }
  };
  const tid = (/** @type {string} */ id) => `[data-testid="${id}"]`;
  const visibleNode = `(selector) => [...document.querySelectorAll(selector)].find((node) => { const r = node.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let n = node; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.visibility === 'hidden' || s.display === 'none' || n.getAttribute('aria-hidden') === 'true') return false; } return true; })`;
  const center = (/** @type {string} */ selector) => js(`(() => { const e = (${visibleNode})(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const clickOn = async (/** @type {string} */ selector, wait = 8000) => {
    const end = Date.now() + wait;
    let point = await center(selector);
    while (!point && Date.now() < end) { await sleep(100); point = await center(selector); }
    if (!point) throw new Error(`nothing visible at ${selector}`);
    contents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    contents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await sleep(180);
  };
  const has = (/** @type {string} */ selector) => js(`!!(${visibleNode})(${JSON.stringify(selector)})`);
  const until = async (/** @type {string} */ selector, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await has(selector)) return true; await sleep(80); } return false; };
  const gone = async (/** @type {string} */ selector, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (!(await has(selector))) return true; await sleep(80); } return false; };
  const textOf = (/** @type {string} */ selector) => js(`(() => { const e = (${visibleNode})(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
  const screen = () => js(`document.body.innerText`);
  const says = (/** @type {string} */ words, ms = 8000) => (async () => { const end = Date.now() + ms; while (Date.now() < end) { if (String(await screen()).includes(words)) return true; await sleep(100); } return false; })();
  /** Types through the focused field, as a keyboard does. */
  const type = async (/** @type {string} */ selector, /** @type {string} */ value) => {
    await clickOn(selector);
    await sleep(60);
    await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select?.(); })()`);
    contents.insertText(value);
    await sleep(120);
  };
  const open = async (/** @type {string} */ query) => {
    const url = `${APP_ORIGIN}/${query ? `?${query}` : ""}`;
    await contents.loadURL(url).catch(async () => { await sleep(500); await contents.loadURL(url); });
    await sleep(900);
    await js("document.fonts.ready.then(() => true)");
  };
  /** A request from the renderer: the same door the app uses. */
  const api = (/** @type {string} */ pathname, /** @type {any} */ init = {}) => js(`(async () => { const init = ${JSON.stringify(init)}; if (init.json) { init.method = init.method ?? "POST"; init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(init.json); delete init.json; } const response = await fetch(${JSON.stringify(pathname)}, { cache: "no-store", ...init }); const text = await response.text(); try { return { status: response.status, json: JSON.parse(text) }; } catch { return { status: response.status, json: null }; } })()`);
  /** Directly to the server, as another device of the same person. */
  const elsewhere = async (/** @type {string} */ pathname, /** @type {any} */ init = {}) => {
    const response = await fetch(`${stub.target}${pathname}`, { method: init.method ?? (init.json ? "POST" : "GET"), headers: { "Content-Type": "application/json", "User-Agent": "okhttp/4.12", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), "x-real-ip": "10.77.0.2" }, ...(init.json ? { body: JSON.stringify(init.json) } : {}) });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
  const rail = (/** @type {string} */ id) => clickOn(tid(`home-rail-${id}`));
  const toSpace = async (/** @type {string} */ label) => { await clickOn(tid("spaces-icon")); await sleep(520); await clickOn(`[data-testid="spaces-tabs"] [role=tab][aria-label=${label}]`); await sleep(700); };
  const clock = () => textOf(tid("dock-clock"));
  const seconds = (/** @type {string | null} */ value) => String(value).split(":").map(Number).reduce((sum, part) => sum * 60 + part, 0);
  const record = () => js(`JSON.parse(localStorage.getItem('sylf.native.study-session.v1'))`);
  const noSample = async (/** @type {string} */ where) => { const text = String(await screen()); check(`no sample content: ${where}`, !SAMPLE_WORDS.some((word) => text.includes(word))); };
  const signInUi = async (/** @type {string} */ identifier, /** @type {string} */ password = PASSWORD) => {
    await type(tid("signin-identifier"), identifier);
    await type(tid("signin-password"), password);
    await clickOn(tid("signin-submit"));
  };
  const accountSheet = async () => { await clickOn(tid("home-account")); await sleep(450); };
  const serverSessions = async () => (await api("/api/sessions?limit=50")).json?.sessions ?? [];

  if (stage === "first") {
    const tag = Date.now().toString(36);
    const alice = { email: `alice_${tag}@local.test`, name: "Alice Quill", username: `alice_${tag}` };
    const bob = { email: `bob_${tag}@local.test`, name: "Bob Marsh", username: `bob_${tag}` };

    // 1. Authenticate.
    check("the sign-in surface is the first thing shown", await until(tid("signin-surface")));
    await shot("01-sign-in");
    check("a forgotten password offers an emailed link", Boolean(await textOf(tid("signin-forgot"))));
    const loginsBefore = stub.seen.filter((/** @type {any} */ entry) => entry.path === "/api/auth/native/login").length;
    await signInUi("nobody@local.test", "wrong password");
    check("a wrong password is refused, in the server's words", await until(tid("signin-error")));
    facts.wrongPassword = await textOf(tid("signin-error"));
    check("it was sent once", stub.seen.filter((/** @type {any} */ entry) => entry.path === "/api/auth/native/login").length === loginsBefore + 1);
    await shot("02-wrong-password");
    await clickOn(`${tid("signin-plane")} [role=radio]:nth-child(2), ${tid("signin-plane")} [aria-label="Create account"]`);
    await sleep(300);
    await type(tid("signin-name"), alice.name);
    await type(tid("signin-username"), alice.username);
    await type(tid("signin-identifier"), alice.email);
    await type(tid("signin-password"), PASSWORD);
    await shot("03-create-account");
    await clickOn(tid("signin-submit"));
    check("a new account opens Home", await until(tid("home-today"), 10000));

    // 2. Empty account: everything real, and nothing invented.
    check("an empty day says so", await says("A clear day"));
    await noSample("empty Today");
    await shot("04-today-empty");
    await rail("focus");
    check("empty history says what will appear", await until(tid("focus-no-history")));
    check("a signed-in person is told where time goes", (await textOf(tid("session-note")))?.includes("study record"));
    await noSample("empty Focus");
    await rail("circle");
    check("an empty circle says so", await says("Your circle is empty"));
    await noSample("empty Circle");
    await rail("progress");
    check("Progress shows level 1 from the server", await says("Level 1"));
    await noSample("empty Progress");
    await shot("05-progress-empty");

    // Seed what a student would have made on the web. Sunday is a rest day by default, and the server refuses quests on one.
    await api("/api/user/study-schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restDays: [] }) });
    const subject = (await api("/api/subjects", { json: { name: "Physics", code: "PHY", color: "blue" } })).json;
    const day = await js(`(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })()`);
    const quest = await api("/api/quests", { json: { title: "Optics past paper", subjectId: subject.id, targetMinutes: 30, scheduledFor: day } });
    facts.quest = { status: quest.status, error: quest.json?.error };
    const zone = await js(`Intl.DateTimeFormat().resolvedOptions().timeZone`);
    const at = Date.now() + 20 * 60_000;
    await api("/api/calendar/personal", { json: { kind: "event", id: await js("crypto.randomUUID()"), revision: 1, data: { title: "Lab seminar", description: "", color: "BLUE", allDay: false, startDate: day, endDate: await js(`(() => { const d = new Date(${at + 3_600_000}); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })()`), startsAt: new Date(at).toISOString(), endsAt: new Date(at + 3_600_000).toISOString(), timezone: zone } } });

    // 2 again. Meaningful Home.
    const beforeHome = stub.seen.length;
    await open("space=home&home=today");
    await until(tid("home-today"));
    check("the event is on the line, with a time", await says("Lab seminar"));
    await sleep(500);
    facts.requestsToOpenToday = stub.seen.slice(beforeHome).map((/** @type {any} */ entry) => entry.path.split("?")[0]);
    check("the quest is listed, with no invented time", await says("Optics past paper"));
    check("the day has a summary worked out from real data", await says("One quest to finish"));
    await noSample("Today with data");
    await shot("06-today");

    // 3. Start studying from Home.
    const questId = quest.json?.id;
    await clickOn(tid(`today-study-quest-${questId}`));
    check("choosing a quest fills in Focus", await until(tid("focus-clock")) && await says("Optics past paper"));
    await shot("07-focus-ready");
    await clickOn(`${tid("focus-begin")}`);
    await sleep(700);
    const started = await record();
    check("one session, stamped with its owner and its subject", started.active?.ownerId > 0 && started.active?.subjectId === subject.id && started.active?.questId === questId);
    check("the note says where it goes", (await textOf(tid("session-note")))?.includes("when you end it"));
    await shot("08-focus-running");
    const dockFirst = seconds(await clock());
    check("the dock shows the same session", dockFirst > 0);
    let stats = (await api("/api/user/stats")).json;
    const waitFor = async (/** @type {() => Promise<boolean>} */ test, ms = 12000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await sleep(250); } return false; };
    check("the server holds it within seconds, as one active session", await waitFor(async () => { stats = (await api("/api/user/stats")).json; return !!stats.activeSessionId; }));
    facts.activeSessionId = stats.activeSessionId;

    // Nothing polls: with a session running and every screen settled, the app asks the server nothing.
    await sleep(1500);
    const quietFrom = stub.seen.length;
    await sleep(6000);
    facts.requestsWhileIdleWithASession = stub.seen.length - quietFrom;
    check("a running session makes no requests of its own", stub.seen.length === quietFrom);

    // 4. Move into Workspace while the same timer continues.
    await toSpace("Workspace");
    await open("space=workspace&wsClear=1&wsOpen=timer,planner,calendar");
    check("switching Spaces and reloading kept the session", (await record()).active?.clientKey === started.active.clientKey);
    check("Workspace's Timer shows the one session", await until(tid("timer-clock")));
    const dock = seconds(await clock());
    const timerTool = seconds(await textOf(`${tid("timer-clock")}`));
    check("the dock and the Timer agree", Math.abs(dock - timerTool) <= 1);
    await shot("09-workspace-running");

    // 5. Connected tools.
    check("Planner shows the real quest", await says("Optics past paper"));
    check("Planner says where AI plans live, and does not imitate them", await until(tid("planner-note")) && (await textOf(tid("planner-note")))?.includes("built and reviewed on Sylf for the web"));
    check("Calendar shows the real event", await says("Lab seminar"));
    await type(tid("calendar-new-title"), "Revision hour");
    await type(tid("calendar-new-time"), "23:00");
    await clickOn(tid("calendar-add"));
    await sleep(800);
    facts.calendarWrites = stub.seen.filter((/** @type {any} */ entry) => entry.method === "POST" && entry.path.startsWith("/api/calendar")).map((/** @type {any} */ entry) => entry.status);
    check("a new event is added through the server, and appears", await js(`[...document.querySelectorAll('[data-testid^="workspace-window"]')].some((node) => node.innerText.includes("Revision hour"))`) && (await textOf(tid("calendar-new-title")) ?? "") === "");
    await shot("10-planner-calendar");
    await open("space=workspace&wsClear=1&wsOpen=sylvie,audio,notes");
    check("Audio lists the real catalog", await says("Forest Wind & Leaves"));
    check("Notes is honest about where notes are", await says("Notes open on the web for now"));
    check("no tool shows a sample badge", !(await screen()).includes("Sample"));
    await until(tid("sylvie-input"));
    await type(tid("sylvie-input"), "What is my level?");
    await clickOn(tid("sylvie-send"));
    check("Sylvie answers through the real route, with no provider", await until(tid("sylvie-reply"), 15000));
    facts.sylvie = await textOf(tid("sylvie-reply"));
    await shot("11-sylvie-audio-notes");

    // 6. Back in Focus, the same session.
    await open("space=home&home=focus");
    await until(tid("focus-clock"));
    check("Focus shows the same session after Workspace", (await record()).active?.clientKey === started.active.clientKey);
    await clickOn(tid("focus-pause"));
    await sleep(400);
    check("a pause from Focus reaches the dock", (await js(`document.querySelector('${tid("dock")}').getAttribute('aria-label')`)).includes("Paused"));
    check("World sees the pause too, through the model", (await record()).active?.snapshot?.isPaused === true);
    await clickOn(tid("focus-resume"));
    await sleep(400);

    // 9. Restart: this process ends here, with the session running, and the next one must carry on.
    await sleep(1200);
    const pending = await record();
    fs.writeFileSync(statePath, JSON.stringify({ alice, bob, clientKey: started.active.clientKey, questId, subjectId: subject.id, stats: { xp: stats.currentXP, level: stats.level, sylph: stats.sylph }, serverId: facts.activeSessionId, startedAt: pending.active.startedAt }));
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    return { stage, passed: failed.length === 0, failed, checks, facts, consoleErrors };
  }

  // Second process. A real restart: new process, same profile.
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const { alice, bob } = state;
  check("a restart comes back signed in, with no password", await until(tid("home-rail-today"), 12000) && !(await has(tid("signin-surface"))));
  check("the session survived the restart, as the same session", (await record()).active?.clientKey === state.clientKey);
  check("it is still running", (await record()).active?.snapshot?.isPaused === false);
  const backIn = seconds(await clock());
  check("the clock kept true time across the restart", backIn > 3);
  await shot("12-after-restart");

  // Enough real time for the server to pay something, because settlement is judged on real minutes.
  const startedAt = (await record()).active.startedAt;
  await sleep(Math.max(0, startedAt + 66_000 - Date.now()));

  // Offline, and ending while offline.
  stub.setDown(true);
  await open("space=home&home=focus");
  await until(tid("focus-clock"));
  check("offline, the app still opens and the clock still runs", (await record()).active?.clientKey === state.clientKey);
  check("offline is said, once a read has failed", await until(tid("home-offline"), 20000) || await says("offline"));
  await clickOn(tid("focus-end"));
  await until('[role="alertdialog"]');
  await shot("13-end-dialog");
  await clickOn(`[role="alertdialog"] [aria-label="End session"]`);
  await sleep(600);
  check("the session ended on this device", (await record()).active === null);
  const offlineRecord = (await record()).ended[0];
  check("offline it is not saved, and says so", offlineRecord.saved === false && await says("Not saved yet"));
  await shot("14-offline-not-saved");
  await open("space=home&home=focus");
  await until(tid("focus-clock"));
  check("a restart offline keeps it, still not saved", (await record()).ended[0].saved === false);

  // Reconnect.
  stub.setDown(false);
  const end = Date.now() + 75_000;
  while (Date.now() < end && !(await record()).ended[0]?.saved) await sleep(400);
  const saved = (await record()).ended[0];
  check("reconnecting saves it, on the server's answer", saved.saved === true && saved.serverId === state.serverId);
  check("the server credited real time", saved.acceptedFocusSeconds >= 60 && saved.acceptedFocusSeconds <= saved.focusSeconds + 5);
  facts.credited = { tracked: saved.focusSeconds, accepted: saved.acceptedFocusSeconds };
  const history = await serverSessions();
  check("exactly one session exists on the server", history.length === 1);
  facts.serverSession = history[0];
  check("it carries the quest and subject", history[0]?.questTitle === "Optics past paper" && history[0]?.subjectName === "Physics");
  await open("space=home&home=focus");
  check("the Not saved badge has gone", await gone('[aria-label="Not saved yet"]') && !(await says("Not saved yet", 1200)));
  check("Recent sessions lists it", await until(tid("focus-recent-row")) && await says("Optics past paper"));
  await shot("15-focus-saved");

  // 7. Persisted results and progression.
  const after = (await api("/api/user/stats")).json;
  facts.progression = { before: state.stats, after: { xp: after.currentXP, level: after.level, sylph: after.sylph, totalStudySeconds: after.totalStudySeconds, streakDays: after.streakDays } };
  check("XP or level moved, on the server", after.level > state.stats.level || after.currentXP > state.stats.xp);
  check("study time moved by what was credited", after.totalStudySeconds === saved.acceptedFocusSeconds);
  check("no active session is left", after.activeSessionId === null);
  await rail("progress");
  check("Progress shows the server's numbers", await says(`${after.currentXP.toLocaleString()} of ${after.xpToNextLevel.toLocaleString()} XP`));
  check("the subject appears", await says("Physics"));
  await noSample("Progress after a session");
  await shot("16-progress");
  await js(`0`);

  // A failed request, and retry.
  stub.setFailing(/detailed-stats/);
  await open("space=home&home=progress");
  check("a failed read says so, and offers to try again", await until(tid("home-retry"), 12000));
  await shot("17-failed-read");
  stub.setFailing(null);
  // A read retries by itself, so the page can recover before a click lands. Either way the data has to come back.
  await clickOn(tid("home-retry")).catch(() => {});
  check("trying again recovers", await says(`of ${after.xpToNextLevel.toLocaleString()} XP`));

  // 8. World respects the active session, and shows who is there.
  await rail("focus");
  await clickOn(tid("focus-begin"));
  await sleep(1500);
  await toSpace("World");
  await until(tid("world-lobby"));
  check("a running session blocks the way in", await until(tid("world-block-session")) && !(await has(tid("world-enter"))));
  await shot("18-world-blocked");
  await clickOn(tid("world-pause-session"));
  check("pausing opens the way in", await until(tid("world-enter")));
  const pausedAt = (await record()).active.snapshot.focusMs;
  await clickOn(tid("world-section-traveller")).catch(() => undefined);
  await sleep(500);
  check("the lobby names the real person", await says(alice.name));
  check("the lobby shows the real level", await says(`Level ${after.level}`));
  await noSample("World");
  await shot("19-world-traveller");
  await open("space=world");
  await until(tid("world-enter"));
  await clickOn(tid("world-enter"));
  await sleep(2600);
  check("time past the gate is not study time", (await record()).active.snapshot.focusMs === pausedAt);
  await open("space=home&home=focus");
  await until(tid("focus-end"));
  await clickOn(tid("focus-end"));
  await until('[role="alertdialog"]');
  await clickOn(`[role="alertdialog"] [aria-label="End session"]`);
  await sleep(500);

  // An ended session: the server revokes this device from elsewhere.
  const sessionsBefore = (await serverSessions()).length;
  await until(tid("home-account"));
  const other = await elsewhere("/api/auth/native/login", { json: { identifier: alice.email, password: PASSWORD, clientName: "Other device" } });
  facts.otherDevice = other.status;
  await elsewhere("/api/auth/logout-all", { token: other.json?.session?.accessToken, json: { password: PASSWORD } });
  await open("");
  check("a session ended elsewhere reaches a sign-in page, and says why", await until(tid("signin-ended"), 15000));
  await shot("20-session-ended");
  check("a signed-out page carries nothing of the person", !String(await screen()).includes(alice.name) && !String(await screen()).includes("Physics"));

  // Another person. No trace of the last.
  await signInUi(`${bob.email}`).catch(() => undefined);
  if (await until(tid("signin-error"), 2500)) {
    // Bob does not exist yet: this is how a second person arrives on a shared device.
    await clickOn(`${tid("signin-plane")} [aria-label="Create account"]`);
    await sleep(300);
    await type(tid("signin-name"), bob.name);
    await type(tid("signin-username"), bob.username);
    await type(tid("signin-identifier"), bob.email);
    await type(tid("signin-password"), PASSWORD);
    await clickOn(tid("signin-submit"));
  }
  check("a second person gets in", await until(tid("home-today"), 12000));
  const scan = async (/** @type {string} */ where) => { const text = String(await screen()); check(`no trace of the last person: ${where}`, ![alice.name, alice.username, "Physics", "Optics past paper", "Lab seminar"].some((word) => text.includes(word))); };
  await scan("Today");
  await rail("focus"); await sleep(400); await scan("Focus");
  check("the second person's history is empty", await until(tid("focus-no-history")));
  await rail("progress"); await sleep(400); await scan("Progress");
  check("the second person starts at level 1", await says("Level 1"));
  await rail("circle"); await sleep(300); await scan("Circle");
  await clickOn(tid("dock")); await sleep(500); await scan("the dock"); await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await sleep(400);
  await toSpace("World"); await until(tid("world-lobby")); await sleep(500); await scan("World");
  await open("space=workspace&wsClear=1&wsOpen=planner,calendar"); await sleep(700); await scan("Workspace");
  await shot("21-second-person");
  check("the server agrees: this is someone else", (await api("/api/user/stats")).json?.email === bob.email);
  check("the second person's record is empty", (await serverSessions()).length === 0);

  // Sign out, study with no account, and be asked once.
  await open("space=home&home=today");
  await accountSheet();
  await clickOn(tid("account-sign-out"));
  check("signing out returns to the sign-in page", await until(tid("signin-surface"), 10000));
  await shot("22-signed-out");
  check("signing out by choice does not claim the server ended anything", !(await has(tid("signin-ended"))));
  await clickOn(tid("signin-later"));
  await until(tid("home-rail-focus"));
  await rail("focus");
  check("with no account, Phase 10's words stand", (await textOf(tid("session-note")))?.includes("Not saved to your study record yet"));
  await clickOn(tid("focus-begin"));
  await sleep(2300);
  await clickOn(tid("focus-end"));
  await until('[role="alertdialog"]');
  await clickOn(`[role="alertdialog"] [aria-label="End session"]`);
  await sleep(500);
  const local = (await record()).ended.find((/** @type {any} */ item) => item.ownerId === null);
  check("a session with nobody signed in stays ownerless", !!local);
  await accountSheet();
  await clickOn(tid("account-sign-in"));
  await until(tid("signin-surface"));
  await signInUi(alice.email);
  check("signing in asks once about the ownerless session", await until('[role="alertdialog"]', 10000) && await says("Add this to your study record?"));
  await shot("23-claim");
  await clickOn(`[role="alertdialog"] [aria-label="Add to my record"]`);
  const claimedEnd = Date.now() + 15000;
  while (Date.now() < claimedEnd && !(await record()).ended.find((/** @type {any} */ item) => item.clientKey === local.clientKey)?.saved) await sleep(250);
  check("accepting delivers it to that account", (await record()).ended.find((/** @type {any} */ item) => item.clientKey === local.clientKey)?.saved === true);
  check("the first person is back with their own data", (await serverSessions()).length === sessionsBefore + 1);
  await open("space=home&home=progress&mode=dark");
  check("their record is on screen again", await says(`Level ${after.level}`) && await says("Physics"));
  await noSample("the first person's return");

  // The subject picker, from the dock, where its menu has to clear the panel.
  await open("space=home&home=focus");
  await clickOn(tid("dock"));
  await sleep(500);
  await shot("26-dock-idle");
  await clickOn(`${tid("dock-panel")} [aria-label="Subject"], ${tid("dock-panel")} [aria-label^="Subject"]`);
  await sleep(400);
  await shot("27-dock-subject-menu");
  await clickOn(`[role=menu] [role=menuitem][aria-label="Physics"], [role=menu] [aria-label^="Physics"]`);
  await sleep(300);
  check("a subject chosen in the dock is the session's plan on every surface", (await record()).plan?.subject === "Physics");
  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await sleep(400);

  // Circle with a real friend who hides things: hidden reads as hidden, never as zero.
  const friend = await elsewhere("/api/auth/native/login", { json: { identifier: bob.email, password: PASSWORD, clientName: "Bob's phone" } });
  await elsewhere("/api/user/privacy", { method: "PATCH", token: friend.json?.session?.accessToken, json: { showRank: "PRIVATE", showStudyHours: "PRIVATE", showOnlineStatus: "PRIVATE" } });
  await elsewhere("/api/friends/requests", { token: friend.json?.session?.accessToken, json: { username: alice.username } });
  await open("space=home&home=circle");
  const request = (await api("/api/friends/requests")).json?.[0];
  check("a friend request can be answered here", await until(tid(`circle-accept-${request?.id}`)));
  await shot("24-friend-request");
  await clickOn(tid(`circle-accept-${request?.id}`));
  check("the friend joins the circle", await until(tid("circle-person")));
  const person = String(await textOf(tid("circle-person")));
  facts.friendRow = person;
  check("a hidden level and hidden hours say hidden, not zero", person.includes("Level hidden") && person.includes("Hours hidden") && person.includes("Status hidden"));
  await noSample("Circle with a friend");
  await shot("25-circle");

  // The shapes and appearances a person might have, for reading by eye. Not asserted: this is what the report's visual review looked at.
  const review = [
    { name: "signature-light", query: "theme=signature&mode=light", size: [1280, 740] },
    { name: "signature-dark", query: "theme=signature&mode=dark", size: [1200, 740] },
    { name: "custom-colors", query: "theme=signature&mode=light&accent=c2410c&day=f6efe4&night=1a1410", size: [800, 740] },
    { name: "cozy-dark", query: "theme=cozy&mode=dark", size: [800, 740] },
    { name: "voxel-light", query: "theme=voxel&mode=light", size: [1200, 740] },
    { name: "arcane-dark", query: "theme=arcane&mode=dark", size: [480, 740] },
    { name: "student-light", query: "theme=student&mode=light", size: [480, 740] },
    { name: "studio-dark", query: "theme=studio&mode=dark", size: [1280, 740] },
  ];
  /** @type {Record<string, boolean>} */ const overflow = {};
  for (const { name, query, size } of review) {
    window.setContentSize(size[0], size[1]);
    await sleep(250);
    for (const place of ["today", "focus", "circle", "progress"]) {
      await open(`space=home&home=${place}&${query}`);
      await sleep(350);
      await shot(`review-${name}-${place}`);
      overflow[`${name}-${place}`] = await js("document.documentElement.scrollWidth > window.innerWidth + 1");
    }
    await open(`space=workspace&wsClear=1&wsOpen=planner,calendar&${query}`);
    await sleep(450);
    await shot(`review-${name}-workspace`);
  }
  check("nothing overflows sideways at any size or theme", Object.values(overflow).every((value) => !value));
  await open("space=home&home=today&theme=student&mode=light");
  window.setContentSize(480, 740);
  await sleep(300);
  await shot("review-compact-today");
  await accountSheet();
  await shot("review-account-sheet");
  await clickOn(tid("account-sign-out"));
  await until(tid("signin-surface"));
  await sleep(300);
  await shot("review-sign-in-compact-light");
  window.setContentSize(800, 740);
  await sleep(400);
  await shot("review-sign-in-tablet-light");
  await open("theme=cozy&mode=dark");
  await until(tid("signin-surface"));
  await shot("review-sign-in-cozy-dark");

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const tokens = [...stub.secrets].filter(Boolean);
  const leaked = await js(`(() => { const hay = JSON.stringify({ ...localStorage }) + document.documentElement.outerHTML; return ${JSON.stringify(tokens)}.filter((t) => hay.includes(t)).length; })()`);
  check("no token reached the renderer", leaked === 0);
  facts.requests = stub.seen.length;
  return { stage, passed: failed.length === 0 && leaked === 0, failed, checks, facts, consoleErrors };
}
