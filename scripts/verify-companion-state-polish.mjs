// Focused visual QA using the existing isolated Chrome/CDP harness.
// Only review-page presentation is changed; no application data is written.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const helper = readFileSync(
  "scripts/verify-landing-companion.mjs",
  "utf8"
).split("// Uses the installed Chrome")[0];
const { browser, sleep } = await import(
  "data:text/javascript;base64," + Buffer.from(helper).toString("base64")
);
const base = process.env.SYLF_QA_BASE ?? "http://localhost:3000";
const out = "documentation/landing-companion/state-polish";
mkdirSync(out, { recursive: true });
const b = await browser();
const results = { checks: [], transitions: [], wave: [], errors: [] };
const check = (name, passed) => results.checks.push({ name, passed: !!passed });
const shot = (name, full = false) => b.screenshot(`${out}/${name}.png`, full);
const open = async () => {
  await b.navigate(`${base}/companion-prototype`);
  await sleep(700);
};
const select = async (state) => {
  await b.evaluate(`(()=>{const s=document.querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(state)});
    s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
};
const click = (label) =>
  b.evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`
  );
const snapshot = () =>
  b.evaluate(`(()=>{
  const c=document.querySelector('[data-sylf-companion]');
  const t=p=>getComputedStyle(c.querySelector('[data-part="'+p+'"]')).transform;
  const rect=c.getBoundingClientRect();
  return {state:c.dataset.state,expression:c.dataset.expression,action:c.dataset.action,
    hood:t('hood'),pose:t('expression-pose'),actionPose:t('action-pose'),
    stable:window.qaSvg===c.querySelector('svg')&&window.qaHood===c.querySelector('[data-part="hood"]'),
    box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
})()`);

try {
  await b.send("Log.enable");
  await b.viewport(1440, 1100);
  await open();
  await shot("final-state-sheet", true);
  await b.evaluate(`window.qaSvg=document.querySelector('[data-sylf-companion] svg');
    window.qaHood=document.querySelector('[data-sylf-companion] [data-part="hood"]');true;`);

  // Exercise real React controls; sample transition matrices without remounting SVG.
  for (const [name, state, reaction] of [
    ["Neutral to Happy", "IDLE", "Happy reaction"],
    ["Happy to Excited", null, "Celebrate"],
    ["Neutral to Curious", "DISCOVERING"],
    ["Neutral to Thinking", "AI_THINKING"],
    ["Neutral to Sleepy", "REST"],
    ["Floating to Hello", "IDLE", "Hello"],
    ["Floating to Reading", "READING"],
    ["Floating to Tablet", "PLANNING"],
    ["Floating to Timer", "FOCUSING"],
    ["Floating to Celebrating", "IDLE", "Celebrate"],
  ]) {
    if (name !== "Happy to Excited") {
      await select("IDLE");
      await sleep(750);
    }
    const before = await snapshot();
    if (state) await select(state);
    if (reaction) await click(reaction);
    await sleep(40);
    const early = await snapshot();
    await sleep(180);
    const middle = await snapshot();
    await sleep(550);
    const settled = await snapshot();
    results.transitions.push({ name, before, early, middle, settled });
    check(
      `${name}: same SVG, hood and host box`,
      [early, middle, settled].every(
        (s) => s.stable && JSON.stringify(s.box) === JSON.stringify(before.box)
      )
    );
    if (
      [
        "Neutral to Curious",
        "Neutral to Thinking",
        "Neutral to Sleepy",
      ].includes(name)
    ) {
      check(
        `${name}: head transform eases`,
        early.hood !== middle.hood && middle.hood !== settled.hood
      );
    }
  }
  // A fresh review isolates this finite gesture from previous reaction expiry.
  await open();
  await click("Hello");
  for (const delay of [100, 450, 450, 450]) {
    await sleep(delay);
    results.wave.push(
      await b.evaluate(`(()=>{const c=document.querySelector('[data-sylf-companion]');
      return ['sleeve','cuff','hand'].map(p=>getComputedStyle(c.querySelector('[data-part="'+p+'-right"]').parentElement).transform);})()`)
    );
    if (results.wave.length === 2) await shot("final-hello-wave");
  }
  check(
    "Wave keeps sleeve, cuff and mitten synchronized",
    results.wave.every((s) => new Set(s).size === 1)
  );
  check(
    "Wave moves across sampled frames",
    new Set(results.wave.map((s) => s[0])).size > 1
  );

  await b.viewport(1900, 1100);
  await open();
  await b.evaluate(`document.querySelectorAll('figure').forEach(f=>{
    f.style.padding='20px 0';f.parentElement.style.gridTemplateColumns='repeat(6,1fr)';
    const c=f.querySelector('[data-sylf-companion]');c.style.width='280px';c.style.height='280px';
    f.querySelector('figcaption').style.visibility='hidden';});window.scrollTo(0,760);`);
  await shot("final-label-free");
  const grips = await b.evaluate(`(()=>{
    const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
    return ['READING','USING_TABLET'].map(action=>{
      const c=document.querySelector('figure [data-action="'+action+'"]');
      const prop=c.querySelector('[data-part="'+(action==='READING'?'book':'tablet')+'"]').getBoundingClientRect();
      return {action,hands:['left','right'].map(side=>overlap(prop,c.querySelector('[data-part="hand-'+side+'"]').getBoundingClientRect()))};
    });})()`);
  results.grips = grips;
  check(
    "Both mittens overlap each held prop's bounds",
    grips.every((g) => g.hands.every(Boolean))
  );

  await b.viewport(1440, 1000);
  await open();
  await b.evaluate(`document.querySelectorAll('figure').forEach(f=>{
    const c=f.querySelector('[data-sylf-companion]');c.style.width='144px';c.style.height='180px';
    f.querySelector('figcaption').style.visibility='hidden';});window.scrollTo(0,760);`);
  await shot("final-desktop-actual-size");

  await b.viewport(390, 844);
  await open();
  await b.evaluate(`document.querySelector('header').style.display='none';
    document.querySelector('section').style.display='none';
    document.querySelectorAll('h2').forEach(h=>h.style.fontSize='24px');
    document.querySelectorAll('figure').forEach(f=>{f.style.padding='10px 0';
      f.parentElement.style.gridTemplateColumns='repeat(3,1fr)';
      const c=f.querySelector('[data-sylf-companion]');c.style.width='56px';c.style.height='70px';c.dataset.compact='true';
      f.querySelector('figcaption').style.display='none';});window.scrollTo(0,0);`);
  await shot("final-mobile-actual-size", true);
  results.mobile = await b.evaluate(`({
    count:document.querySelectorAll('figure [data-sylf-companion]').length,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    timer:getComputedStyle(document.querySelector('figure [data-part="timer"]')).display
  })`);
  check(
    "Mobile: fifteen review cards, no page overflow, timer visible",
    results.mobile.count === 15 &&
      results.mobile.overflow === 0 &&
      results.mobile.timer !== "none"
  );
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await shot("final-mobile-reduced", true);
  check(
    "Reduced-motion gallery has no running animations",
    await b.evaluate(
      `document.getAnimations().filter(a=>a.effect?.target.closest?.('[data-sylf-companion]')&&a.playState==='running').length===0`
    )
  );
  // A fresh live review verifies media rules, not merely motion="none" gallery cards.
  await b.viewport(1440, 1000);
  await open();
  await select("FOCUSING");
  await sleep(400);
  check(
    "Reduced-motion live timer has no animation or transition",
    await b.evaluate(
      `document.getAnimations().filter(a=>a.effect?.target.closest?.('[data-sylf-companion]')).length===0`
    )
  );
  check(
    "Reduced-motion still keeps timer progress and hands",
    await b.evaluate(
      `!!document.querySelector('section [data-part="timer-progress"]') && !!document.querySelector('section [data-part="hand-right"]')`
    )
  );
  results.errors = b.events.filter(
    (e) =>
      e.method === "Runtime.exceptionThrown" ||
      (e.method === "Log.entryAdded" && e.params.entry.level === "error")
  );
  // The shared signed-out application shell probes stats. Preserve that evidence
  // separately; it is unrelated to companion rendering and does not require login.
  results.unauthenticatedStats = results.errors.filter(
    (e) =>
      e.method === "Log.entryAdded" &&
      e.params.entry.url === `${base}/api/user/stats` &&
      e.params.entry.text.includes("401")
  );
  results.errors = results.errors.filter(
    (e) => !results.unauthenticatedStats.includes(e)
  );
  check(
    "No companion resource or browser runtime errors",
    results.errors.length === 0
  );
} catch (error) {
  results.errors.push({ message: error.message });
  check("Focused browser run completed", false);
} finally {
  writeFileSync(`${out}/visual-checks.json`, JSON.stringify(results, null, 2));
  await b.close();
}
console.log(
  JSON.stringify(
    {
      checks: results.checks.length,
      failed: results.checks.filter((c) => !c.passed),
      errors: results.errors,
    },
    null,
    2
  )
);
if (results.checks.some((c) => !c.passed)) process.exitCode = 1;
