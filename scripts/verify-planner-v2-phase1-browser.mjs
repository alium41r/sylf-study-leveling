/** Render the existing shared Focus screen against Phase 1 disposable data.
 * Invoked by the PostgreSQL harness with --browser; never reads .env or a DB URL.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const base = new URL(process.env.PLANNER_PHASE1_BROWSER_BASE ?? "");
if (base.hostname !== "127.0.0.1" || process.env.PLANNER_PHASE0_REQUIRED !== "true") throw new Error("Disposable loopback browser harness required");
const fixture = JSON.parse(readFileSync(process.env.PLANNER_PHASE1_BROWSER_FIXTURE, "utf8"));
const token = process.env.PLANNER_PHASE1_BROWSER_TOKEN;
if (!token) throw new Error("Disposable authentication required");
const output = join(process.cwd(), "documentation/planner/reports/2026-10-02-phase-1/evidence/browser");
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "sylf-phase1-chrome-"));
const port = Number(process.env.PLANNER_PHASE1_CHROME_PORT);
if (!Number.isInteger(port) || port < 1) throw new Error("Private Chrome port required");
const chrome = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu-sandbox", "--disable-crashpad", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
process.once("SIGTERM",()=>{chrome.kill("SIGTERM");process.exit(1);});
const results = { schemaVersion: 1, startedAt: new Date().toISOString(), checks: [], screenshots: [], status: "RUNNING" };
const check = (name, ok, detail) => { results.checks.push({ name, ok, detail }); if (!ok) throw new Error(name); };
async function eventually(read, name, bound = 30000) { const deadline = Date.now()+bound; while (Date.now()<deadline) { if (await read()) return; await sleep(250); } throw new Error(name); }
async function api(path, method="GET", body) { const response = await fetch(new URL(path, base), { method, headers: { Cookie: `hunter_token=${token}`, "Content-Type": "application/json" }, signal:AbortSignal.timeout(10000), ...(body ? { body: JSON.stringify(body) } : {}) }); const value = await response.json(); if (!response.ok) throw new Error(`Disposable route ${path} failed: ${response.status}`); return value; }
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
      clearTimeout(entry.timeout);
    });
  }

  static async attach(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Chrome command timed out: ${method}`));},30000);
      this.pending.set(id, { resolve, reject, method, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "evaluate failed");
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

let cdp;
async function reloadAcceptedPage() {
  const previous = await cdp.evaluate('return window.__phase1DocumentId;');
  await cdp.send("Page.reload");
  await eventually(async () => {
    try { return await cdp.evaluate(`return window.__phase1DocumentId && window.__phase1DocumentId!==${JSON.stringify(previous)} && document.readyState==="complete";`); }
    catch { return false; } // The old execution context disappears during navigation.
  }, "Fresh browser document did not load");
}
try {
  let target;
  await eventually(async () => { try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === "page"); return !!target; } catch { return false; } }, "Chrome did not start");
  cdp = await Cdp.attach(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", { name: "hunter_token", value: token, url: base.origin, path: "/", httpOnly: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: 'window.__phase1DocumentId=crypto.randomUUID();if(!localStorage.getItem("app_mode"))localStorage.setItem("app_mode","dark");' });
  const focusUrl = new URL(`/focus?questId=${fixture.questId}`, base).toString();
  const questTitle=(await api(`/api/quests/${fixture.questId}`)).title;
  await cdp.send("Page.navigate", { url: focusUrl });
  await eventually(() => cdp.evaluate('return (document.body?.innerText ?? "").includes("QUEST FOCUS");'), "Shared Focus did not render", 90000);
  await eventually(() => cdp.evaluate('return [...document.querySelectorAll("button")].some(button => /^pause$/i.test(button.textContent.trim()));'), "Pause control unavailable");
  await cdp.evaluate('const button=[...document.querySelectorAll("button")].find(button=>/^pause$/i.test(button.textContent.trim())); button.click(); return true;');
  const started = await api("/api/sessions", "POST", { questId: fixture.questId, executionProtocol: 2, initialSeconds: 0 });
  const sessionId = started.execution.sessionId;
  results.sessionId = sessionId;
  await eventually(async () => (await api(`/api/sessions?id=${sessionId}`)).execution.state === "PAUSED", "Pause was not accepted by PostgreSQL");
  const paused = (await api(`/api/sessions?id=${sessionId}`)).execution;
  await reloadAcceptedPage();
  await eventually(() => cdp.evaluate('return [...document.querySelectorAll("button")].some(button=>/^resume$/i.test(button.textContent.trim()));'), "Paused reload resumed silently");
  await sleep(1200);
  const restored = (await api(`/api/sessions?id=${sessionId}`)).execution;
  check("paused reload preserves accepted actual time and PAUSED state", restored.state === "PAUSED" && restored.acceptedFocusSeconds === paused.acceptedFocusSeconds, { state: restored.state });
  for (const appearance of [{name:"dark",mode:"dark",accent:"#B779F7",background:"#070b18"},{name:"light",mode:"light",accent:"#5e3aad",background:"#f8fafc"},{name:"custom",mode:"light",accent:"#b5426e",background:"#f1eadf"}]) {
    await api("/api/cosmetics", "POST", { category: "THEME", itemKey: appearance.accent });
    await api("/api/cosmetics", "POST", { category: "BACKGROUND", itemKey: appearance.background });
    await cdp.evaluate(`localStorage.setItem("app_mode",${JSON.stringify(appearance.mode)}); localStorage.setItem("app_theme",${JSON.stringify(appearance.accent)}); localStorage.setItem("app_background",${JSON.stringify(appearance.background)}); return true;`);
    await reloadAcceptedPage();
    // Header/layout changes during async preference restoration. Wait for the
    // accepted paused control in the current layout, not a previous DOM frame.
    await eventually(() => cdp.evaluate('return [...document.querySelectorAll("button")].some(button=>/^resume$/i.test(button.textContent.trim()));'), "Appearance paused restoration unavailable");
    for (const viewport of [{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844}]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === "mobile" });
      await eventually(()=>cdp.evaluate(`return [...document.querySelectorAll("h1")].some(heading=>heading.textContent.trim()===${JSON.stringify(questTitle)}) && [...document.querySelectorAll("button")].some(button=>/^resume$/i.test(button.textContent.trim()));`),"Quest title and accepted pause did not settle in the current layout");
      await sleep(400);
      const measured = await cdp.evaluate('return {width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,mode:document.documentElement.getAttribute("data-mode"),resume:[...document.querySelectorAll("button")].some(button=>/^resume$/i.test(button.textContent.trim())),text:document.body.innerText.slice(0,1000)};');
      check(`${appearance.name} ${viewport.name}: paused controls remain usable and no horizontal overflow`, measured.resume && measured.overflow <= 1 && measured.mode === appearance.mode, measured);
      const filename = `${appearance.name}-${viewport.name}.png`;
      const shot = await cdp.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
      writeFileSync(join(output,filename), Buffer.from(shot.data,"base64")); results.screenshots.push(filename);
    }
  }
  await cdp.evaluate('const button=[...document.querySelectorAll("button")].find(button=>/^resume$/i.test(button.textContent.trim())); button.click(); return true;');
  await eventually(async () => (await api(`/api/sessions?id=${sessionId}`)).execution.state === "RUNNING", "Resume was not durably accepted");
  const running = (await api(`/api/sessions?id=${sessionId}`)).execution;
  const ended = await api("/api/sessions", "PATCH", { executionTransition: { schemaVersion:2,sessionId,expectedExecutionVersion:running.executionVersion,idempotencyKey:randomUUID(),action:"END",cumulativeFocusSeconds:running.acceptedFocusSeconds,cumulativeBreakSeconds:running.acceptedBreakSeconds } });
  await reloadAcceptedPage();
  await eventually(() => cdp.evaluate('return (document.body?.innerText ?? "").includes("SESSION COMPLETE") || (document.body?.innerText ?? "").includes("Session Complete");'), "Other-device end did not restore in Focus");
  const final = (await api(`/api/sessions?id=${sessionId}`)).execution;
  check("other-device END survives browser refresh without new accepted time", final.state === "ENDED" && final.acceptedFocusSeconds === ended.execution.acceptedFocusSeconds, {state:final.state});
  results.finalAcceptedFocusSeconds = final.acceptedFocusSeconds;
  const quest = await api(`/api/quests/${fixture.questId}`);
  check("ending a timer does not complete study work", quest.status !== "COMPLETED" && quest.remainingDisposition === "OPEN", {status:quest.status});
  results.status="PASSED";
} catch(error) {
  results.status="FAILED"; results.error=error.message; process.exitCode=1;
  if(cdp) {
    results.failurePage = await cdp.evaluate('return {url:location.href,text:(document.body?.innerText ?? "").slice(0,3000)};').catch(()=>null);
    const shot = await cdp.send("Page.captureScreenshot",{format:"png"}).catch(()=>null);
    if(shot) writeFileSync(join(output,"failure.png"),Buffer.from(shot.data,"base64"));
  }
}
finally { cdp?.close(); chrome.kill("SIGTERM"); await sleep(300); rmSync(profile,{recursive:true,force:true}); results.finishedAt=new Date().toISOString(); writeFileSync(join(output,"results.json"),JSON.stringify(results,null,2)+"\n"); console.log(`Phase 1 Focus browser checks: ${results.status}`); }
