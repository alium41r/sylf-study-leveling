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

  // The Studio opens empty on the composer, as the web planner does.
  check("the Planner is Plan's first view", await toPlanner());
  check("the composer is the empty page", await until(tid("studio-composer")));
  await clickOn(tid("studio-preset"));
  check("the preset picker lists every preset", await until(tid("studio-preset-reading"), 4000) && await has(tid("studio-preset-course")));
  await shot("01b-preset-picker");
  await clickOn(tid("studio-preset-auto"));
  check("the picker closes on choosing", await gone(tid("studio-preset-reading"), 4000));
  check("presets are offered, Auto first", (await textOf(tid("studio-preset")))?.startsWith("Auto") === true);
  check("settings are one tap away", await has(tid("studio-settings-open")));
  check("the old seven-day box is gone", !(await has(tid("studio-health"))));
  await shot("01-empty");

  // A new exam, in the student's own words: the syllabus is found, topics stream in, the study path is built and fitted, then the proposal.
  await type(tid("studio-goal-title"), "Maths mid term Complete Paper 1 CAIE A levels");
  const due = new Date(Date.now() + 18 * 86_400_000).toISOString().slice(0, 10);
  await type(tid("studio-goal-due"), due);
  // Two of the composer's prompts: hours a day, and a weak spot.
  await clickOn(`${tid("studio-composer-prompts")} [aria-label="Hours a day"]`);
  await clickOn('[role=radiogroup][aria-label="Hours a day"] [aria-label="2 h"]');
  await clickOn(`${tid("studio-composer-prompts")} [aria-label="Weak spots"]`);
  await type(tid("studio-field-weak"), "integration");
  await sleep(200);
  await shot("02-new-goal");
  const asked = Date.now();
  await clickOn(tid("studio-goal-submit"));
  const sawActivity = await until(tid("studio-activity"), 15000);
  check("the activity card reports progress", sawActivity);
  check("the stage rail shows the planning stages", await until(tid("studio-stage-rail"), 15000));
  check("the topics stream in", await until(tid("studio-activity-units"), 20000));
  if (sawActivity) await shot("03-planning");
  check("a proposal arrives for review", await until(tid("studio-review"), 90000));
  facts.goalSeconds = Math.round((Date.now() - asked) / 100) / 10;
  facts.proposalSummary = await textOf(tid("studio-review-summary"));
  await sleep(500);
  await shot("04-proposal");
  const before = await studio();
  const proposed = before?.proposal?.model;
  const exam = proposed?.goals?.[0];
  facts.proposal = { trace: before?.proposal?.trace, critics: before?.proposal?.verification?.critics?.map((/** @type {any} */ c) => `${c.code} ${c.score}: ${c.note}`), workflow: before?.proposal?.workflow, source: before?.proposal?.source, pass: before?.proposal?.verification?.pass, quality: before?.proposal?.verification?.quality, blocks: before?.proposal?.result?.blocks?.length, unplaced: before?.proposal?.result?.unplaced, items: proposed?.items?.length, interpretation: before?.proposal?.interpretation, strategy: before?.proposal?.strategy, syllabus: exam?.syllabus ? { source: exam.syllabus.source, ref: exam.syllabus.ref, units: exam.syllabus.units.map((/** @type {any} */ u) => u.title) } : null, titles: proposed?.items?.map((/** @type {any} */ i) => i.title) };
  check("the proposal passed every check", before?.proposal?.verification?.pass === true);
  check("the syllabus came from Sylf's checked list", exam?.syllabus?.ref === "caie-9709-p1");
  check("every topic has revision and practice", ["Quadratics revision", "Integration past paper practice", "Paper 1 timed past paper", "Formula sheet and final review"].every((title) => proposed?.items?.some((/** @type {any} */ i) => i.title === title)));
  facts.perDay = Object.entries((before?.proposal?.result?.blocks ?? []).reduce((/** @type {Record<string, number>} */ m, /** @type {any} */ b) => { m[b.date] = (m[b.date] ?? 0) + b.end - b.start; return m; }, {})).sort();
  check("every session is placed in the calendar", (before?.proposal?.result?.unplaced ?? []).length === 0 && (before?.proposal?.result?.weekBudgets ?? []).length === 0);
  check("hours a day became the plan's own daily cap", proposed?.constraints?.some((/** @type {any} */ c) => c.kind === "goal_cap" && c.minutes === 120));
  check("the weak spot was marked and practised again", exam?.syllabus?.units?.find((/** @type {any} */ u) => u.title === "Integration")?.confidence === "weak" && proposed?.items?.some((/** @type {any} */ i) => i.title === "Integration extra practice"));
  check("Auto chose the exam preset", exam?.preset === "exam");
  check("nothing is added before acceptance", ((await api("/api/quests?all=true&limit=100")).json?.quests ?? []).length === 0);

  // Accept: quests appear with their aims and key points, and the study guide sits beside the calendar.
  await clickOn(tid("studio-accept"));
  check("the review closes on accept", await gone(tid("studio-review"), 20000));
  await sleep(800);
  const after = await studio();
  const quests = (await api("/api/quests?all=true&limit=100")).json?.quests ?? [];
  const quadratics = quests.find((/** @type {any} */ q) => q.title === "Quadratics revision");
  facts.committed = { version: after?.version, blocks: after?.blocks?.length, quests: quests.length, titles: quests.map((/** @type {any} */ q) => `${q.scheduledFor} ${q.title}`), quadratics: quadratics ? { scheduledFor: quadratics.scheduledFor, requiredMinutes: quadratics.requiredMinutes, description: quadratics.description } : null };
  check("the plan is version 1", after?.version === 1);
  check("a quest for every session", quests.length === proposed?.items?.length);
  check("quest descriptions carry the aim and key points", typeof quadratics?.description === "string" && quadratics.description.includes("Key points:") && quadratics.description.includes("discriminant"));
  const goalKey = after?.model?.goals?.[0]?.key;
  check("the study guide is beside the calendar", await until(tid(`studio-guide-${goalKey}`), 6000));
  check("the plan asks whether it is right", await until(`${tid(`studio-guide-${goalKey}`)} ${tid("studio-plan-check")}`, 4000));
  await shot("05a-plan-check");
  const versionBeforeCheck = (await studio())?.version;
  await clickOn(`${tid(`studio-guide-${goalKey}`)} ${tid("studio-plan-check-good")}`);
  check("Looks good closes the card", await gone(`${tid(`studio-guide-${goalKey}`)} ${tid("studio-plan-check")}`, 4000));
  await sleep(800);
  const afterGood = await studio();
  check("Looks good is recorded and the plan does not change", afterGood?.feedback?.[goalKey]?.verdict === "ACCURATE" && afterGood?.version === versionBeforeCheck);
  await shot("05-plan-week");
  await clickOn(`${tid(`studio-guide-${goalKey}`)} [role=radio][aria-label^="Topics"], ${tid(`studio-guide-${goalKey}`)} [aria-label^="Topics"]`).catch(() => undefined);
  check("the topics tab lists the syllabus", await until(tid("studio-guide-topics"), 4000));
  await clickOn(`${tid("studio-guide-topics")} [aria-label^="Trigonometry"]`).catch(() => undefined);
  await sleep(400);
  await shot("05b-topics");
  await clickOn(`${tid(`studio-guide-${goalKey}`)} [role=radio][aria-label="Days"], ${tid(`studio-guide-${goalKey}`)} [aria-label="Days"]`).catch(() => undefined);
  check("the day-by-day tab lists the sessions", await until(tid("studio-guide-days"), 4000));
  await shot("05c-days");

  // The session: its aim, key points and method, and why it is where it is.
  const first = after?.blocks?.filter((/** @type {any} */ b) => b.state === "committed").sort((/** @type {any} */ a, /** @type {any} */ b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  if (first) {
    if (!(await has(tid(`studio-block-${first.id}`)))) await clickOn('[aria-label="Next week"]').catch(() => undefined);
    await clickOn(tid(`studio-block-${first.id}`)).catch(() => undefined);
    check("the inspector shows the session's aim and key points", await until(tid("studio-details"), 6000));
    check("the inspector explains the session", await has(tid("studio-why")));
    await shot("06-inspector");
    await clickOn('[aria-label="Close details"]').catch(() => undefined);
  }

  // A topic rated weak rebuilds the plan without the model, as a proposal; accepting keeps every existing session's quest.
  const rated = await api("/api/planner/studio", { json: { action: "syllabus", key: `syllabus-${tag}`, goal: goalKey, units: [{ key: "u5", confidence: "weak" }, { key: "u1", confidence: "strong" }] } });
  const ratedModel = rated.json?.proposal?.model;
  facts.rated = { status: rated.status, summary: rated.json?.proposal?.summary, extra: ratedModel?.items?.find((/** @type {any} */ i) => i.key.endsWith(".prac.u5.2"))?.title, quick: ratedModel?.items?.find((/** @type {any} */ i) => i.key.endsWith(".rev.u1"))?.title };
  check("rating a topic proposes a rebuilt plan", rated.status === 200 && rated.json?.proposal?.verification?.pass === true && facts.rated.extra === "Trigonometry extra practice" && facts.rated.quick === "Quadratics quick check");
  await toPlanner();
  check("the rebuilt plan is up for review", await until(tid("studio-review"), 8000));
  await shot("06b-rated-proposal");
  await clickOn(tid("studio-accept"));
  await gone(tid("studio-review"), 20000);
  const questsAfter = (await api("/api/quests?all=true&limit=100")).json?.quests ?? [];
  check("existing quests kept their identity", quests.every((/** @type {any} */ q) => questsAfter.some((/** @type {any} */ r) => r.id === q.id)));
  facts.afterRating = { quests: questsAfter.length, version: (await studio())?.version };

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
  const versionBeforeUndo = facts.afterCommand;

  // Undo restores the version before: from the notice that follows every change, or from the history.
  if (await until('[aria-label="Undo"]', 5000)) { await shot("08b-undo-notice"); await clickOn('[aria-label="Undo"]'); }
  else {
    await clickOn('[aria-label="How this plan changed"]').catch(() => undefined);
    if (await until(tid("studio-undo"), 4000)) { await shot("08b-history"); await clickOn(tid("studio-undo")); }
  }
  await sleep(2000);
  const undone = await studio();
  facts.afterUndo = { version: undone?.version, constraints: undone?.model?.constraints?.length };
  check("undo is a new version without the rule", undone?.version === versionBeforeUndo + 1 && !undone?.model?.constraints?.some((/** @type {any} */ c) => c.kind === "daily_cap"));

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
  await sleep(500);
  facts.settingsBox = await js(`(() => { const e = document.querySelector('[data-testid="studio-settings"]'); const r = e?.getBoundingClientRect(); return r ? { right: Math.round(r.right), width: Math.round(r.width), window: window.innerWidth, overflow: [...e.querySelectorAll('*')].some((n) => n.getBoundingClientRect().right > r.right + 1) } : null; })()`);
  check("the settings sheet fits its width", facts.settingsBox && facts.settingsBox.right <= facts.settingsBox.window && !facts.settingsBox.overflow);
  await shot("11-settings");

  // With AI available, an exam Sylf's catalog does not hold is mapped by the model: its topics stream in, then the compiled path is proposed.
  if (process.env.SYLF_STUDIO_AI === "1" && readiness?.ai) {
    await toPlanner();
    await clickOn(tid("studio-add-goal"));
    check("the new-plan sheet opens", await until(tid("studio-goal-sheet")));
    await type(tid("studio-goal-title"), "CAIE A level Chemistry Paper 2 mock");
    await type(tid("studio-goal-due"), new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10));
    const m0 = Date.now();
    await clickOn(tid("studio-goal-submit"));
    const units = await until(tid("studio-activity-units"), 40000);
    facts.mapFirstTopicSeconds = units ? Math.round((Date.now() - m0) / 100) / 10 : null;
    if (units) await shot("12a-ai-syllabus-streaming");
    check("the model's syllabus arrives as a proposal", await until(tid("studio-review"), 90000));
    facts.mapSeconds = Math.round((Date.now() - m0) / 100) / 10;
    const mapped = await studio();
    const physics = mapped?.proposal?.model?.goals?.find((/** @type {any} */ g) => /chemistry/i.test(g.title));
    facts.mapped = { trace: mapped?.proposal?.trace, pass: mapped?.proposal?.verification?.pass, source: physics?.syllabus?.source, researched: physics?.syllabus?.researched ?? false, sources: physics?.syllabus?.sources ?? [], preset: physics?.preset, name: physics?.syllabus?.name, papers: physics?.syllabus?.papers, units: physics?.syllabus?.units?.map((/** @type {any} */ u) => `${u.title}: ${u.points.slice(0, 2).join("; ")}`), titles: mapped?.proposal?.model?.items?.filter((/** @type {any} */ i) => i.goal === physics?.key).map((/** @type {any} */ i) => i.title) };
    check("the model mapped the chemistry syllabus", physics?.syllabus?.source === "model" && (physics?.syllabus?.units?.length ?? 0) >= 4);
    facts.mapped.library = physics?.syllabus?.library ?? null;
    facts.mapped.identity = physics?.syllabus?.identity ?? null;
    check("a new syllabus is researched, double-checked and saved to the library", physics?.syllabus?.library?.reused === false && physics?.syllabus?.researched === true);
    await shot("12b-ai-syllabus-proposal");

    // "Something's off": the syllabus is researched and double-checked again with the note, and an improved plan is proposed.
    const chemGuide = tid(`studio-guide-${physics?.key}`);
    await clickOn(`${chemGuide} ${tid("studio-plan-check-off")}`).catch(() => undefined);
    await type(`${chemGuide} ${tid("studio-plan-check-note")}`, "It's missing nitrogen compounds, polymerisation and organic synthesis.");
    await shot("12c-plan-check-note");
    const r0 = Date.now();
    await clickOn(`${chemGuide} ${tid("studio-plan-check-recheck")}`);
    await until(tid("studio-activity"), 10000);
    await sleep(1500);
    await until(tid("studio-review"), 120000);
    await gone('[data-testid="studio-activity"] [aria-label="Planning"]', 120000).catch(() => undefined);
    await sleep(1500);
    const rechecked = await studio();
    const chem2 = rechecked?.proposal?.model?.goals?.find((/** @type {any} */ g) => g.key === physics?.key);
    facts.recheck = { seconds: Math.round((Date.now() - r0) / 100) / 10, workflow: rechecked?.proposal?.workflow, trace: rechecked?.proposal?.trace, notes: rechecked?.proposal?.notes, round: chem2?.review?.round, library: chem2?.syllabus?.library, units: chem2?.syllabus?.units?.map((/** @type {any} */ u) => u.title) };
    check("a re-check proposes an improved plan in a new round", rechecked?.proposal?.workflow === "recheck" && chem2?.review?.round === 1 && rechecked?.proposal?.verification?.pass === true);
    check("the re-check answered the student's note", (chem2?.syllabus?.units ?? []).some((/** @type {any} */ u) => /nitrogen|amine/i.test(u.title)) && (chem2?.syllabus?.units ?? []).some((/** @type {any} */ u) => /polymer/i.test(u.title)));
    await shot("12d-rechecked-proposal");
    await clickOn(tid("studio-discard")).catch(() => undefined);
    await gone(tid("studio-review"), 10000);

    // The same syllabus asked for in other words comes from the library: no research, one short identification call.
    const reused = await js(`(async () => { const r = await fetch("/api/planner/studio/stream", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ workflow: "add_goal", key: "reuse-${tag}", title: "Cambridge International AS Level Chemistry 9701 paper 2", preset: "exam", due: "${new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)}" }) }); return (await r.text()).split("\\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); })()`);
    const stages = (reused ?? []).filter((/** @type {any} */ e) => e.type === "stage").map((/** @type {any} */ e) => e.text);
    const library = await studio();
    const chem3 = library?.proposal?.model?.goals?.find((/** @type {any} */ g) => /9701/.test(g.title));
    facts.reuse = { stages, trace: library?.proposal?.trace, library: chem3?.syllabus?.library, units: chem3?.syllabus?.units?.length };
    check("a syllabus planned before comes from the library without research", chem3?.syllabus?.library?.reused === true && !stages.some((/** @type {string} */ t) => /Researching|Looking up/.test(t)) && (library?.proposal?.trace?.tokens?.calls ?? 9) <= 1);
    if (library?.proposal?.id) await api("/api/planner/studio", { json: { action: "discard", proposalId: library.proposal.id } });

    // A command the fast path cannot parse goes to the model.
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
