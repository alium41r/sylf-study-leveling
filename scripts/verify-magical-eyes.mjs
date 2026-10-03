// Eye-only browser checks and reference/real-scale captures. No user data mutations.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const helper = readFileSync(
  "scripts/verify-landing-companion.mjs",
  "utf8"
).split("// Uses the installed Chrome")[0];
const { browser, sleep } = await import(
  "data:text/javascript;base64," + Buffer.from(helper).toString("base64")
);
const base = process.env.SYLF_QA_BASE ?? "http://localhost:3000";
const out = "documentation/landing-companion/magical-eyes";
mkdirSync(out, { recursive: true });
const b = await browser();
const result = { checks: [], transitions: [], errors: [] };
const check = (name, passed) => result.checks.push({ name, passed: !!passed });
const shot = (name, full = false) => b.screenshot(`${out}/${name}.png`, full);
const open = async () => {
  await b.navigate(`${base}/companion-prototype`);
  await sleep(600);
};
const choose = async (value) => {
  await b.evaluate(
    `(()=>{const s=document.querySelector('#companion-eye');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`
  );
};
try {
  await b.send("Log.enable");
  await b.viewport(1500, 1150);
  await open();
  await b.evaluate(
    `window.eyeQaSvg=document.querySelector('[data-sylf-companion] svg');window.eyeQaHood=document.querySelector('[data-sylf-companion] [data-part="hood"]');window.eyeQaFixed=['body','ribbons','halo','star'].map(p=>document.querySelector('[data-sylf-companion] [data-part="'+p+'"]').outerHTML);true;`
  );
  for (const expression of [
    "NEUTRAL",
    "HAPPY",
    "CHEERFUL",
    "EXCITED",
    "FOCUSED",
    "CURIOUS",
    "SLEEPY",
    "SAD",
    "SURPRISED",
  ]) {
    await choose(expression);
    await sleep(70);
    const early = await b.evaluate(
      `(()=>{const c=document.querySelector('[data-sylf-companion]');const eyes=c.querySelector('[data-part="eyes"]');return {eye:eyes.dataset.eyeExpression,outgoing:eyes.querySelectorAll('[data-eye-transition="outgoing"]').length,currentOpacity:getComputedStyle(eyes.querySelector('[data-eye-transition="current"]')).opacity};})()`
    );
    await sleep(240);
    const final = await b.evaluate(
      `(()=>{const c=document.querySelector('[data-sylf-companion]');return {sameSvg:c.querySelector('svg')===window.eyeQaSvg,sameHood:c.querySelector('[data-part="hood"]')===window.eyeQaHood,fixed:JSON.stringify(['body','ribbons','halo','star'].map(p=>c.querySelector('[data-part="'+p+'"]').outerHTML))===JSON.stringify(window.eyeQaFixed),outgoing:c.querySelectorAll('[data-eye-transition="outgoing"]').length};})()`
    );
    result.transitions.push({ expression, early, final });
    check(
      `${expression}: eye change preserves body/hood and settles`,
      early.eye === expression &&
        early.outgoing <= 1 &&
        final.sameSvg &&
        final.sameHood &&
        final.fixed &&
        final.outgoing === 0
    );
  }
  await choose("NEUTRAL");
  await sleep(300);
  result.blink = await b.evaluate(
    `(()=>{const c=document.querySelector('[data-sylf-companion]');const eyes=c.querySelector('[data-part="eyes"]');const animations=eyes.getAnimations({subtree:true}).filter(a=>a.animationName?.includes('eye-open-phase')||a.animationName?.includes('eye-closed-phase'));const values=[];for(const time of [0,2400]){animations.forEach(a=>{a.pause();a.currentTime=time});values.push(animations.map(a=>({name:a.animationName,opacity:getComputedStyle(a.effect.target).opacity,transform:getComputedStyle(a.effect.target).transform})));}return {count:animations.length,values};})()`
  );
  check(
    "Blink replaces intact detailed eyes with a drawn lid",
    result.blink.count === 2 &&
      result.blink.values[0].some(
        (v) => v.name.includes("open") && v.opacity === "1"
      ) &&
      result.blink.values[1].some(
        (v) => v.name.includes("closed") && v.opacity === "1"
      ) &&
      result.blink.values[1].every((v) => v.transform === "none")
  );
  await shot("blink-closed");
  await b.evaluate(
    `document.querySelector('[data-part="eyes"]').getAnimations({subtree:true}).forEach(a=>{a.currentTime=0;a.play()});true;`
  );
  await shot("live-neutral");
  // Every size uses the actual renderer, not a substitute eye image.
  for (const [name, w, h, cols] of [
    ["character-sheet", 280, 280, 5],
    ["normal-96", 96, 96, 5],
    ["landing-desktop", 144, 180, 5],
    ["landing-mobile", 56, 70, 3],
  ]) {
    await b.viewport(name === "landing-mobile" ? 390 : 1500, 1150);
    await open();
    await b.evaluate(
      `document.querySelector('header').style.display='none';document.querySelector('section').style.display='none';document.querySelectorAll('section')[2].style.display='none';document.querySelector('footer').style.display='none';const grid=document.querySelector('figure').parentElement;grid.style.gridTemplateColumns='repeat(${cols},1fr)';grid.querySelectorAll('[data-sylf-companion]').forEach(c=>{c.style.width='${w}px';c.style.height='${h}px';c.dataset.compact='${w <= 64}'});window.scrollTo(0,0);`
    );
    await shot(name, true);
    check(
      `${name}: no page overflow`,
      await b.evaluate("document.documentElement.scrollWidth<=innerWidth")
    );
  }
  await b.viewport(1500, 1150);
  await open();
  const reference = readFileSync(`${out}/reference.png`).toString("base64");
  // Move real SVG eye groups into isolated viewports. Do not duplicate SVG IDs.
  await b.evaluate(
    `(()=>{document.querySelector('header').style.display='none';document.querySelector('section').style.display='none';document.querySelectorAll('section')[2].style.display='none';document.querySelector('footer').style.display='none';const section=document.querySelectorAll('section')[1];section.style.margin='0';section.querySelectorAll('p,h2').forEach(e=>e.remove());const grid=section.querySelector('figure').parentElement;grid.style.display='flex';grid.style.gap='0';grid.style.width='1350px';document.body.style.background='#101426';document.querySelector('header').parentElement.style.cssText='padding:30px 0;background:#101426;min-height:100vh';grid.querySelectorAll('figure').forEach(f=>{f.style.cssText='width:150px;flex:none;padding:0;background:#101426;color:white;border:0;border-radius:0';const c=f.querySelector('[data-sylf-companion]');c.style.width='150px';c.style.height='125px';const svg=c.querySelector('svg');const eyes=svg.querySelector('[data-part="eyes"]');svg.replaceChildren(eyes);svg.setAttribute('viewBox','320 325 342 245');f.querySelector('figcaption').style.marginTop='0'});const img=document.createElement('img');img.src='data:image/png;base64,${reference}';img.style.cssText='width:1350px;display:block;margin:0 0 20px';section.prepend(img);window.scrollTo(0,0)})()`
  );
  await b.viewport(1350, 450);
  await shot("reference-comparison");
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await b.viewport(1440, 1000);
  await open();
  await choose("FOCUSED");
  await sleep(350);
  check(
    "Reduced motion disables eye and companion animations",
    await b.evaluate(
      `document.getAnimations().filter(a=>a.effect?.target.closest?.('[data-sylf-companion]')).length===0`
    )
  );
  check(
    "Reduced motion retains a single visible new expression",
    await b.evaluate(
      `(()=>{const c=document.querySelector('[data-sylf-companion]');const outgoing=c.querySelector('[data-eye-transition="outgoing"]');return c.querySelector('[data-part="eyes"]').dataset.eyeExpression==='FOCUSED'&&(!outgoing||getComputedStyle(outgoing).display==='none')&&getComputedStyle(c.querySelector('[data-eye-transition="current"]')).opacity==='1';})()`
    )
  );
  await shot("reduced-motion");
  result.errors = b.events.filter(
    (e) =>
      e.method === "Runtime.exceptionThrown" ||
      (e.method === "Log.entryAdded" && e.params.entry.level === "error")
  );
  result.signedOutStats = result.errors.filter(
    (e) =>
      e.params?.entry?.url === `${base}/api/user/stats` &&
      e.params.entry.text.includes("401")
  );
  result.errors = result.errors.filter(
    (e) => !result.signedOutStats.includes(e)
  );
  check("No companion resource or runtime errors", result.errors.length === 0);
} catch (error) {
  result.errors.push({ message: error.message });
  check("Browser run completed", false);
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2));
  await b.close();
}
console.log(
  JSON.stringify(
    {
      checks: result.checks.length,
      failed: result.checks.filter((c) => !c.passed),
      errors: result.errors,
    },
    null,
    2
  )
);
if (result.checks.some((c) => !c.passed)) process.exitCode = 1;
