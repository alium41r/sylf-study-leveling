// @ts-check
// The Planning Studio in the real Electron window, against the real Next.js server on a disposable database (scripts/test/run-backend-local.mjs
// --studio). It signs a new student up, plans an exam, reviews and accepts the proposal, reads why a session is where it is, edits by command,
// undoes, opens the settings, and captures every state at desktop and phone widths in light and dark. It clicks and types like a person and asks
// the server what really happened. With SYLF_STUDIO_AI=1 the server holds a DeepSeek key, and one goal is broken down by the real model.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PASSWORD = "a-long-enough-password";

/** @param {Electron.BrowserWindow} window */
export async function runStudioCheck(window) {
  const out = process.env.SYLF_STUDIO_OUT ?? path.join(app.getPath("temp"), "sylf-studio");
  const finish = (/** @type {Record<string, any>} */ result) => {
    console.log("SYLF_STUDIO_CHECK " + JSON.stringify(result).slice(0, 6000));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "studio-check.json"), JSON.stringify(result, null, 1) + "\n");
    app.exit(result.passed ? 0 : 1);
  };
  const guard = setTimeout(() => finish({ passed: false, error: "timed out after 9 minutes" }), 540_000);
  try { const result = await run(window, out); clearTimeout(guard); finish(result); }
  catch (error) { clearTimeout(guard); finish({ passed: false, error: String(/** @type {Error} */ (error)?.stack ?? error).slice(0, 1500) }); }
}

/** @param {Electron.BrowserWindow} window @param {string} out */
async function run(window, out) {
  const contents = window.webContents;
  fs.mkdirSync(out, { recursive: true });
  /** @type {string[]} */ const consoleErrors = [];
  contents.on("console-message", (/** @type {any} */ event) => {
    const level = event?.level; const message = String(event?.message);
    if ((level === "error" || level === 3) && !/Failed to load resource|net::ERR/.test(message)) consoleErrors.push(message.slice(0, 300));
  });
  if (contents.isLoading()) await new Promise((resolve) => contents.once("did-finish-load", () => resolve(undefined)));
  window.setMinimumSize(320, 400);
  window.setContentSize(1366, 900);
  await sleep(600);
  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  /** @type {Record<string, boolean>} */ const checks = {};
  /** @type {Record<string, any>} */ const facts = {};
  const check = (/** @type {string} */ name, /** @type {any} */ ok) => { checks[name] = !!ok; if (!ok) console.log(`SYLF_STUDIO miss: ${name}`); };
  const shot = async (/** @type {string} */ name) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { const image = await contents.capturePage(); if (!image.isEmpty()) return fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG()); } catch { /* Retried. */ }
      contents.invalidate(); await sleep(400);
    }
  };
  const tid = (/** @type {string} */ id) => `[data-testid="${id}"]`;
  const visibleNode = `(selector) => [...document.querySelectorAll(selector)].find((node) => { const r = node.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let n = node; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.visibility === 'hidden' || s.display === 'none' || n.getAttribute('aria-hidden') === 'true') return false; } return true; })`;
  const center = (/** @type {string} */ selector) => js(`(() => { const e = (${visibleNode})(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const clickOn = async (/** @type {string} */ selector, wait = 8000) => {
    const end = Date.now() + wait;
    let point = await center(selector);
    while (!point && Date.now() < end) { await sleep(100); point = await center(selector); }
    if (!point) throw new Error(`nothing visible at ${selector}`);
    contents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    contents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await sleep(220);
  };
  const has = (/** @type {string} */ selector) => js(`!!(${visibleNode})(${JSON.stringify(selector)})`);
  const until = async (/** @type {string} */ selector, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await has(selector)) return true; await sleep(100); } return false; };
  const gone = async (/** @type {string} */ selector, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (!(await has(selector))) return true; await sleep(100); } return false; };
  const textOf = (/** @type {string} */ selector) => js(`(() => { const e = (${visibleNode})(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
  const type = async (/** @type {string} */ selector, /** @type {string} */ value) => {
    await clickOn(selector); await sleep(60);
    await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select?.(); })()`);
    contents.insertText(value); await sleep(150);
  };
  const open = async (/** @type {string} */ query) => {
    const url = `${APP_ORIGIN}/${query ? `?${query}` : ""}`;
    await contents.loadURL(url).catch(async () => { await sleep(500); await contents.loadURL(url); });
    await sleep(1200);
    await js("document.fonts.ready.then(() => true)");
  };
  const api = (/** @type {string} */ pathname, /** @type {any} */ init = {}) => js(`(async () => { const init = ${JSON.stringify(init)}; if (init.json) { init.method = init.method ?? "POST"; init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(init.json); delete init.json; } const response = await fetch(${JSON.stringify(pathname)}, { cache: "no-store", ...init }); const text = await response.text(); try { return { status: response.status, json: JSON.parse(text) }; } catch { return { status: response.status, json: null }; } })()`);
  const studio = async () => (await api("/api/planner/studio")).json;
  const toPlanner = async (/** @type {string} */ extra = "") => {
    await open(`space=home&home=plan${extra}`);
    if (!(await has(tid("studio-view")))) await clickOn(`${tid("home-subnav-plan")} [aria-label="Planner"]`).catch(() => undefined);
    return until(tid("studio-view"), 20000);
  };

  // A new student: sign up, skip onboarding, add a subject with the API the app uses.
  const tag = Date.now().toString(36);
  check("the sign-in surface is first", await until(tid("signin-surface"), 20000));
  await clickOn(`${tid("signin-plane")} [role=radio]:nth-child(2), ${tid("signin-plane")} [aria-label="Create account"]`);
  await sleep(300);
  await type(tid("signin-name"), "Studio Tester");
  await type(tid("signin-username"), `studio_${tag}`);
  await type(tid("signin-identifier"), `studio_${tag}@local.test`);
  await type(tid("signin-password"), PASSWORD);
  await clickOn(tid("signin-submit"));
  if (await until(tid("onboarding-skip"), 12000)) await clickOn(tid("onboarding-skip"));
  check("Home opens after sign-up", await until(tid("home-rail-plan"), 20000));
  const subject = await api("/api/subjects", { json: { name: "Organic Chemistry", code: "CHEM101", color: "#10B981" } });
  facts.subject = subject.status;
  const readiness = (await api("/api/planner/studio?readiness=1")).json?.readiness;
  facts.readiness = readiness;

  // The Studio opens empty and says what to do.
  check("the Planner is Plan's first view", await toPlanner());
  check("the command bar is there", await until(tid("studio-command-input")));
  check("the health strip is there", await has(tid("studio-health")));
  await shot("01-empty");

  // A new exam: the sheet, the breakdown streaming in, then the proposal.
  await clickOn(tid("studio-add-goal"));
  check("the new-goal sheet opens", await until(tid("studio-goal-sheet")));
  await type(tid("studio-goal-title"), "Organic chemistry midterm");
  const due = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  await type(tid("studio-goal-due"), due);
  await sleep(200);
  await shot("02-new-goal");
  const asked = Date.now();
  await clickOn(tid("studio-goal-submit"));
  const sawActivity = await until(tid("studio-activity"), 15000);
  check("the activity line reports progress", sawActivity);
  if (sawActivity) await shot("03-planning");
  check("a proposal arrives for review", await until(tid("studio-review"), 90000));
  facts.goalSeconds = Math.round((Date.now() - asked) / 100) / 10;
  facts.proposalSummary = await textOf(tid("studio-review-summary"));
  await sleep(500);
  await shot("04-proposal");
  const before = await studio();
  facts.proposal = { trace: before?.proposal?.trace, critics: before?.proposal?.verification?.critics?.map((/** @type {any} */ c) => `${c.code} ${c.score}: ${c.note}`), workflow: before?.proposal?.workflow, source: before?.proposal?.source, pass: before?.proposal?.verification?.pass, quality: before?.proposal?.verification?.quality, blocks: before?.proposal?.result?.blocks?.length, items: before?.proposal?.model?.items?.length, interpretation: before?.proposal?.interpretation, strategy: before?.proposal?.strategy };
  check("the proposal passed every check", before?.proposal?.verification?.pass === true);
  check("nothing is added before acceptance", ((await api("/api/quests?all=true&limit=100")).json?.quests ?? []).length === 0);

  // Accept: quests appear, the timeline shows committed sessions.
  await clickOn(tid("studio-accept"));
  check("the review closes on accept", await gone(tid("studio-review"), 20000));
  await sleep(800);
  const after = await studio();
  const quests = (await api("/api/quests?all=true&limit=100")).json?.quests ?? [];
  facts.committed = { version: after?.version, blocks: after?.blocks?.length, quests: quests.length, firstQuest: quests[0] ? { title: quests[0].title, scheduledFor: quests[0].scheduledFor, requiredMinutes: quests[0].requiredMinutes } : null };
  check("the plan is version 1", after?.version === 1);
  check("quests were created from the plan", quests.length > 0);
  await shot("05-plan-week");

  // Why is this here? Open the first committed session.
  const first = after?.blocks?.filter((/** @type {any} */ b) => b.state === "committed").sort((/** @type {any} */ a, /** @type {any} */ b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  if (first) {
    if (!(await has(tid(`studio-block-${first.id}`)))) await clickOn('[aria-label="Next week"]').catch(() => undefined);
    await clickOn(tid(`studio-block-${first.id}`)).catch(() => undefined);
    check("the inspector explains the session", await until(tid("studio-why"), 6000));
    await shot("06-inspector");
  }

  // Edit by command: the fast path answers at once, with no model.
  await type(tid("studio-command-input"), "max 2 hours a day on weekdays");
  await sleep(400);
  check("the interpretation chip shows before anything runs", await has(tid("studio-interpretation")));
  facts.chip = await textOf(tid("studio-interpretation"));
  await shot("07-command-chip");
  const commanded = Date.now();
  await clickOn(tid("studio-command-send"));
  check("the command becomes a proposal", await until(tid("studio-review"), 30000));
  facts.commandSeconds = Math.round((Date.now() - commanded) / 100) / 10;
  await shot("08-command-proposal");
  await clickOn(tid("studio-accept"));
  await gone(tid("studio-review"), 20000);
  facts.afterCommand = (await studio())?.version;

  // Undo restores the version before: from the notice that follows every change, or from the history.
  if (await until('[aria-label="Undo"]', 5000)) { await shot("08b-undo-notice"); await clickOn('[aria-label="Undo"]'); }
  else {
    await clickOn('[aria-label="How this plan changed"]').catch(() => undefined);
    if (await until(tid("studio-undo"), 4000)) { await shot("08b-history"); await clickOn(tid("studio-undo")); }
  }
  await sleep(2000);
  const undone = await studio();
  facts.afterUndo = { version: undone?.version, constraints: undone?.model?.constraints?.length };
  check("undo is a new version without the rule", undone?.version === 3 && undone?.model?.constraints?.length === 0);

  // What-if previews on the device.
  await clickOn('[aria-label="What if…"], [role=button][aria-label*="What if"]').catch(() => undefined);
  await sleep(300);
  await shot("09-whatif");

  // Term zoom and settings.
  await clickOn(`[aria-label="Timeline zoom"] [aria-label="Term"], [role=radio][aria-label="Term"]`).catch(() => undefined);
  await sleep(400);
  check("the term view shows weeks", await has(tid("studio-term")));
  await shot("10-term");
  await clickOn(tid("studio-settings-open"));
  check("planning settings open", await until(tid("studio-settings")));
  await shot("11-settings");

  // With AI available, a command the fast path cannot parse goes to the model.
  if (process.env.SYLF_STUDIO_AI === "1" && readiness?.ai) {
    await toPlanner();
    await type(tid("studio-command-input"), "I also have a physics problem set on rotational dynamics due next Friday, and I'm weak on torque");
    const t0 = Date.now();
    await clickOn(tid("studio-command-send"));
    const items = await until(tid("studio-activity-items"), 30000);
    facts.aiFirstItemSeconds = items ? Math.round((Date.now() - t0) / 100) / 10 : null;
    if (items) await shot("12-ai-streaming");
    check("the model's breakdown arrives as a proposal", await until(tid("studio-review"), 90000));
    facts.aiSeconds = Math.round((Date.now() - t0) / 100) / 10;
    const ai = await studio();
    facts.ai = { trace: ai?.proposal?.trace, critics: ai?.proposal?.verification?.critics?.map((/** @type {any} */ c) => `${c.code} ${c.score}: ${c.note}`), notes: ai?.proposal?.notes, source: ai?.proposal?.source, workflow: ai?.proposal?.workflow, items: ai?.proposal?.model?.items?.filter((/** @type {any} */ i) => i.source === "model").map((/** @type {any} */ i) => `${i.title} · ${i.method} · ${i.est?.join("–")}m`), strategy: ai?.proposal?.strategy, pass: ai?.proposal?.verification?.pass, quality: ai?.proposal?.verification?.quality, interpretation: ai?.proposal?.interpretation };
    await shot("13-ai-proposal");
  }

  // Appearance and size: dark, a custom accent and ground, and a phone.
  for (const [name, query] of [["14-dark", "&theme=signature&mode=dark"], ["15-custom", "&theme=signature&mode=light&accent=e5ff00&day=7f8088"]]) {
    await toPlanner(query);
    await sleep(600);
    await shot(name);
  }
  window.setContentSize(390, 844);
  await toPlanner("&mode=light");
  await sleep(800);
  check("the phone opens on today's agenda", await has(tid("studio-today")));
  await shot("16-phone");
  await clickOn(tid("studio-command-open")).catch(() => undefined);
  await sleep(500);
  await shot("17-phone-command");
  const passed = Object.values(checks).every(Boolean) && consoleErrors.length === 0;
  return { passed, checks, facts, consoleErrors: consoleErrors.slice(0, 10) };
}
