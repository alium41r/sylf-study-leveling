// E2E: placeholders, curriculum step (no quick-add, expanded boards/levels,
// syllabus note), merged appearance step with LIVE preview, persistence.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9265;
const OUT = "/tmp/sylf-shots";
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/sylf-e2e4-" + Date.now(),
  "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); const t = await r.json(); const p = t.find(x => x.type === "page"); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(500);
  }
  throw new Error("no cdp");
}
let msgId = 0; const pending = new Map(); let ws;
function send(m, p = {}) { const i = ++msgId; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => { pending.set(i, { res, rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + m)); } }, 30000); }); }
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result?.value; }
async function shot(name) { const res = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, "base64")); }

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); } else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); } }

async function main() {
  const u = await getWsUrl(); ws = new WebSocket(u);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // ── 1. Register + login placeholders ──
  await send("Page.navigate", { url: "http://localhost:3000/register" });
  await sleep(3000);
  const regPlaceholders = await ev(`[...document.querySelectorAll('input')].map(i => i.placeholder).filter(Boolean)`);
  console.log("register placeholders:", JSON.stringify(regPlaceholders));
  check("register name placeholder simple", regPlaceholders.includes("Your full name"));
  check("register username placeholder simple", regPlaceholders.includes("your_username"));
  check("register email placeholder simple", regPlaceholders.includes("you@example.com"));
  check("register password placeholder simple", regPlaceholders.includes("At least 6 characters"));

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);
  const loginPlaceholders = await ev(`[...document.querySelectorAll('input')].map(i => i.placeholder).filter(Boolean)`);
  console.log("login placeholders:", JSON.stringify(loginPlaceholders));
  check("login identifier placeholder simple", loginPlaceholders.includes("Email or username"));
  check("login password placeholder simple", loginPlaceholders.includes("Your password"));

  // ── 2. Register a fresh user (needs onboarding) ──
  const tokenData = await ev(`(async () => {
    const uname = 'ob' + Date.now();
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: uname + '@x.com', username: uname, password: 'password123', name: 'Onboard Test' }) });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user_data', JSON.stringify(d.user));
    localStorage.setItem('app_mode', 'dark');
    return { token: d.token, username: uname };
  })()`);
  console.log("user:", tokenData.username);

  // ── 3. Onboarding SUBJECTS step ──
  await send("Page.navigate", { url: "http://localhost:3000/onboarding" });
  await sleep(5500); // BOOT sequence (3.5s) → SUBJECTS
  const subjectsState = await ev(`(async () => {
    const openBtn = [...document.querySelectorAll('button')].find(b => /ADD CUSTOM SUBJECT/i.test(b.textContent || ''));
    openBtn?.click();
    await new Promise(r => setTimeout(r, 500));
    const bodyText = document.body.innerText;
    const selects = [...document.querySelectorAll('select')];
    const boardOptions = selects[0] ? [...selects[0].options].map(o => o.textContent.trim()) : [];
    const levelOptions = selects[1] ? [...selects[1].options].map(o => o.textContent.trim()) : [];
    return {
      onSubjects: bodyText.includes('CONFIGURE CURRICULUM'),
      quickAddGone: !bodyText.includes('QUICK-ADD STANDARD SYLLABI'),
      hasNoteTextarea: bodyText.includes('BOOK / SYLLABUS DETAILS'),
      boards: boardOptions,
      levels: levelOptions,
    };
  })()`);
  console.log("subjects step:", JSON.stringify({ ...subjectsState, boards: subjectsState.boards.slice(0, 8), levels: subjectsState.levels.slice(0, 8) }, null, 1));
  check("SUBJECTS step shown", subjectsState.onSubjects);
  check("QUICK-ADD section removed", subjectsState.quickAddGone);
  check("syllabus details input present", subjectsState.hasNoteTextarea);
  check("Pakistani boards present", subjectsState.boards.some(b => /FBISE/i.test(b)) && subjectsState.boards.some(b => /BISE Punjab/i.test(b)) && subjectsState.boards.some(b => /AKU-EB/i.test(b)));
  check("Indian boards present", subjectsState.boards.some(b => /CBSE/i.test(b)) && subjectsState.boards.some(b => /CISCE/i.test(b)) && subjectsState.boards.some(b => /NIOS/i.test(b)));
  check("international boards present", subjectsState.boards.some(b => /Cambridge/i.test(b)) && subjectsState.boards.some(b => /IB/i.test(b)) && subjectsState.boards.some(b => /AP/i.test(b)));
  check("Middle School + Matric + Intermediate levels present", subjectsState.levels.some(l => /Middle School/i.test(l)) && subjectsState.levels.some(l => /Matric/i.test(l)) && subjectsState.levels.some(l => /Intermediate/i.test(l)));

  // Add a subject: Mathematics / FBISE / Matric / with syllabus note
  const added = await ev(`(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => /ADD CUSTOM SUBJECT/i.test(b.textContent || ''));
    btn?.click();
    await new Promise(r => setTimeout(r, 400));
    const inputs = [...document.querySelectorAll('input[type="text"]')];
    const nameIn = inputs[0], codeIn = inputs[1];
    nameIn.focus(); 
    const setVal = (el, v) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    setVal(nameIn, 'Mathematics');
    setVal(codeIn, 'MAT-100');
    const selects = [...document.querySelectorAll('select')];
    const setSel = (el, v) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
    setSel(selects[0], 'FBISE');
    setSel(selects[1], 'Matric / SSC');
    const ta = [...document.querySelectorAll('textarea')][0];
    const setTa = (el, v) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    setTa(ta, 'Mathematics 1-2 — Federal Board, CLASS 9-10, Khalid Book Depot');
    await new Promise(r => setTimeout(r, 300));
    const addBtn = [...document.querySelectorAll('button')].find(b => /ADD TO CURRICULUM/i.test(b.textContent || ''));
    addBtn?.click();
    await new Promise(r => setTimeout(r, 600));
    const bodyText = document.body.innerText;
    return {
      cardVisible: bodyText.includes('Mathematics') && bodyText.includes('FBISE') && bodyText.includes('Matric / SSC'),
      noteVisible: bodyText.includes('CLASS 9-10'),
    };
  })()`);
  console.log("added subject:", JSON.stringify(added));
  check("subject card shows board + level", added.cardVisible);
  check("syllabus note visible on card", added.noteVisible);
  await shot("onboarding-subjects");

  // ── 4. THEME step (merged) with LIVE preview ──
  await ev(`(() => {
    const next = [...document.querySelectorAll('button')].find(b => /CONFIRM CURRICULUM/i.test(b.textContent || ''));
    next?.click();
    return 1;
  })()`);
  await sleep(1500);

  const themeState = await ev(`(() => {
    const bodyText = document.body.innerText;
    return {
      merged: bodyText.includes('CALIBRATE RESONANCE') && bodyText.includes('INTERFACE MODE') && bodyText.includes('ENVIRONMENT DOMAIN') && bodyText.includes('SYSTEM RESONANCE AURAS'),
      sepDomainGone: !bodyText.includes('SELECT DOMAIN'),
    };
  })()`);
  console.log("theme step:", JSON.stringify(themeState));
  check("mode + domain + themes merged on one page", themeState.merged);
  check("separate SELECT DOMAIN step removed", themeState.sepDomainGone);

  // Select background "aurora-borealis" → live wallpaper change
  const liveBg = await ev(`(async () => {
    const card = [...document.querySelectorAll('button')].find(b => /Aurora Borealis/.test(b.textContent || ''));
    const before = getComputedStyle(document.getElementById('app-bg-layer')).backgroundImage;
    card?.click();
    await new Promise(r => setTimeout(r, 800));
    const after = getComputedStyle(document.getElementById('app-bg-layer')).backgroundImage;
    return { changed: before !== after, after: after.slice(0, 60) };
  })()`);
  console.log("live background preview:", JSON.stringify(liveBg));
  check("background changes LIVE in onboarding", liveBg.changed, liveBg.after);

  // Select theme "solar" → live accent change
  const liveTheme = await ev(`(async () => {
    const card = [...document.querySelectorAll('button')].find(b => /Vivid orange — a burning drive/.test(b.textContent || ''));
    const before = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    card?.click();
    await new Promise(r => setTimeout(r, 800));
    const after = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    return { before, after, changed: before !== after };
  })()`);
  console.log("live theme preview:", JSON.stringify(liveTheme));
  check("theme changes LIVE in onboarding", liveTheme.changed, `${liveTheme.before} → ${liveTheme.after}`);
  await shot("onboarding-theme-merged");

  // ── 5. Complete setup → verify persistence ──
  await ev(`(() => {
    const next = [...document.querySelectorAll('button')].find(b => /COMPLETE SETUP/i.test(b.textContent || ''));
    next?.click();
    return 1;
  })()`);
  await sleep(12000); // INITIALIZING → submit → redirect

  const persisted = await ev(`(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/subjects', { headers: { Authorization: 'Bearer ' + t } });
    const subs = await res.json();
    const math = (Array.isArray(subs) ? subs : []).find(s => s.code === 'MAT-100');
    return { url: location.href, math };
  })()`);
  console.log("persisted:", JSON.stringify(persisted));
  check("onboarding completed → dashboard", /dashboard/.test(persisted.url), persisted.url);
  check("subject persisted with syllabus note", !!persisted.math?.syllabusNote, persisted.math?.syllabusNote);
  check("subject board/level persisted", persisted.math?.examBoard === "FBISE" && /Matric/i.test(persisted.math?.level || ""));

  ws.close(); chrome.kill();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); chrome.kill(); process.exit(1); });
