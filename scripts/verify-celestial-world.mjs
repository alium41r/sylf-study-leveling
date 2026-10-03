import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
// Share the isolated installed-Chrome CDP transport without running its review suite.
const helper = readFileSync(
  "scripts/verify-landing-companion.mjs",
  "utf8"
).split("// Uses the installed Chrome")[0];
const { browser, sleep } = await import(
  "data:text/javascript;base64," + Buffer.from(helper).toString("base64")
);
const base = process.env.SYLF_QA_BASE ?? "http://localhost:3000";
const out = "documentation/landing-companion/celestial-world";
mkdirSync(out, { recursive: true });
const b = await browser();
const checks = [];
const metrics = [];
function check(name, value) {
  checks.push({ name, passed: !!value });
  if (!value) throw new Error(name);
}
const scroll = async (y) => {
  await b.evaluate(`window.scrollTo({top:${y},behavior:'instant'});true;`);
  await sleep(1450);
};
const readTraveler = () =>
  b.evaluate(
    `(()=>{const e=document.querySelector('[data-journey-traveler]');const r=e.querySelector('[data-character-surface]').getBoundingClientRect();const t=new DOMMatrix(getComputedStyle(e).transform);return {x:t.m41,y:t.m42,rect:{x:r.x,y:r.y,width:r.width,height:r.height},visibility:getComputedStyle(e).visibility,display:getComputedStyle(e).display,motion:e.dataset.motionState,hero:e.dataset.hero};})()`
  );
const noOverflow = () =>
  b.evaluate(
    "document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth"
  );
try {
  await b.send("Log.enable");
  for (const [width, height] of [
    [1600, 1000],
    [1440, 960],
    [1280, 800],
    [1024, 768],
    [820, 1180],
    [768, 1024],
    [390, 844],
  ]) {
    await b.viewport(width, height);
    await b.navigate(base);
    await scroll(0);
    check(
      `${width}: nine section compositions`,
      await b.evaluate(
        'document.querySelectorAll("[data-celestial-decor]").length===9'
      )
    );
    check(
      `${width}: single traveling Sylf`,
      await b.evaluate(
        'document.querySelectorAll("[data-journey-traveler]").length===1 && document.querySelectorAll("[data-companion-mode] [data-sylf-companion]").length===1'
      )
    );
    check(`${width}: no horizontal overflow`, await noOverflow());
    check(
      `${width}: aria hidden and non-interactive`,
      await b.evaluate(
        `Array.from(document.querySelectorAll('[data-celestial-decor]')).every(e=>e.getAttribute('aria-hidden')==='true'&&getComputedStyle(e).pointerEvents==='none'&&!e.querySelector('a,button,input,[tabindex]'))`
      )
    );
    check(
      `${width}: SVG world has no canvas, videos, images or filters`,
      await b.evaluate(
        `Array.from(document.querySelectorAll('[data-celestial-decor]')).every(e=>!e.querySelector('canvas,video,img,image,filter'))`
      )
    );
    check(
      `${width}: approved canonical character asset`,
      await b.evaluate(
        `new Set(Array.from(document.querySelectorAll('[data-journey-traveler] image')).map(e=>e.getAttribute('href'))).size===1 && document.querySelector('[data-journey-traveler] image').getAttribute('href')==='/landing/companion/original-rig.webp'`
      )
    );
    const atTop = await readTraveler();
    check(
      `${width}: companion visible at hero start`,
      atTop.visibility === "visible" &&
        atTop.display !== "none" &&
        atTop.rect.y >= 0 &&
        atTop.rect.y + atTop.rect.height <= height &&
        atTop.rect.x >= 0 &&
        atTop.rect.x + atTop.rect.width <= width + 1 &&
        atTop.hero === "true"
    );
    const anchor = await b.evaluate(
      `(()=>{const r=document.querySelector('[data-journey-start]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`
    );
    check(
      `${width}: starts exactly at measured hero waypoint`,
      Math.abs(atTop.x - anchor.x) < 1 && Math.abs(atTop.y - anchor.y) < 1
    );
    const density = await b.evaluate(
      `(()=>{const all=Array.from(document.querySelectorAll('[data-celestial-decor] [data-depth]'));return {total:all.length,displayed:all.filter(e=>getComputedStyle(e).display!=='none').length,active:Array.from(document.querySelectorAll('[data-celestial-decor][data-active=true]')).map(e=>e.dataset.celestialDecor),animations:document.getAnimations().length,runningDecorAnimations:document.getAnimations().filter(a=>a.effect?.target.closest('[data-celestial-decor]')&&a.playState==='running').length}})()`
    );
    check(
      `${width}: offscreen decoration is paused`,
      await b.evaluate(
        `Array.from(document.querySelectorAll('[data-celestial-decor][data-active=false]')).every(e=>Array.from(e.querySelectorAll('svg')).every(s=>getComputedStyle(s).animationName==='none'||getComputedStyle(s).animationPlayState==='paused'))`
      )
    );
    const heroGeometry = await b.evaluate(
      `(()=>{const r=e=>{const a=e.getBoundingClientRect();return {x:a.x,y:a.y,w:a.width,h:a.height}};const s=document.querySelector('section[aria-labelledby=hero-title]');return {h1:r(s.querySelector('h1')),description:r(s.querySelector('h1+p')),stage:r(s.querySelector('[data-journey-stop]').parentElement)}})()`
    );
    metrics.push({ width, height, atTop, density, heroGeometry });
    await b.screenshot(`${out}/hero-${width}.png`);
    // Smooth, incremental normal-scroll frames across the new hero segment.
    const samples = await b.evaluate(
      `new Promise(resolve=>{const samples=[];const start=performance.now();function f(t){const p=Math.min(1,(t-start)/1000);window.scrollTo({top:p*280,behavior:'instant'});const e=document.querySelector('[data-journey-traveler]');const m=new DOMMatrix(getComputedStyle(e).transform);samples.push({t,x:m.m41,y:m.m42});if(p<1)requestAnimationFrame(f);else resolve(samples);}requestAnimationFrame(f);})`
    );
    const gaps = samples
      .slice(1)
      .map((s, i) => ({
        dt: s.t - samples[i].t,
        d: Math.hypot(s.x - samples[i].x, s.y - samples[i].y),
        dy: s.y - samples[i].y,
      }));
    check(
      `${width}: no teleport during normal hero scroll`,
      gaps.every((s) => s.d <= Math.max(22, s.dt * 1.8) && s.dy >= -0.5)
    );
    metrics.at(-1).scrollFrames = {
      samples: samples.length,
      largestStep: Math.max(...gaps.map((s) => s.d)),
      meanFrameMs: gaps.reduce((a, s) => a + s.dt, 0) / gaps.length,
      maxFrameMs: Math.max(...gaps.map((s) => s.dt)),
    };
    await sleep(900);
    const moved = await readTraveler();
    check(
      `${width}: hero scroll follows continuous path`,
      moved.y > atTop.y + 10
    );
    // View all sections, including both halves of taller mobile chapters.
    const sections = await b.evaluate(
      `Array.from(document.querySelectorAll('[data-celestial-decor]')).map(e=>{const p=e.parentElement;return {name:e.dataset.celestialDecor,y:p.getBoundingClientRect().top+scrollY,h:p.offsetHeight}})`
    );
    if (width === 1440 || width === 1024 || width === 820 || width === 390) {
      for (const s of sections.slice(1)) {
        await scroll(Math.max(0, s.y + Math.min(s.h * 0.22, 130)));
        check(`${width}: ${s.name} has no overflow`, await noOverflow());
        const a = await b.evaluate(
          `document.querySelector('[data-celestial-decor="${s.name}"]').dataset.active`
        );
        check(`${width}: ${s.name} activates on entry`, a === "true");
        await b.screenshot(`${out}/${s.name}-${width}.png`);
        if (s.h > height && width === 390) {
          await scroll(s.y + s.h - height + 60);
          await b.screenshot(`${out}/${s.name}-lower-${width}.png`);
        }
      }
      await scroll(0);
      await b.screenshot(`${out}/full-${width}.png`, true);
    }
    await scroll(0);
    if (width <= 900) {
      check(
        `${width}: parallax disabled`,
        await b.evaluate(
          `Array.from(document.querySelectorAll('[data-celestial-decor] [data-depth]')).every(e=>getComputedStyle(e).translate==='none')`
        )
      );
    }
  }
  await b.viewport(1440, 960);
  await b.navigate(base);
  await scroll(0);
  // Static artwork, same traveler and static world under reduced motion.
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(700);
  const reducedBefore = await readTraveler();
  check(
    "Reduced motion: same traveler stays visible in hero",
    reducedBefore.display !== "none" && reducedBefore.visibility === "visible"
  );
  check(
    "Reduced motion: world keeps its artwork and disables motion",
    await b.evaluate(
      `document.querySelectorAll('[data-celestial-decor]').length===9 && !document.getAnimations().some(a=>a.effect?.target.closest('[data-celestial-decor]')) && Array.from(document.querySelectorAll('[data-celestial-decor]')).every(e=>e.dataset.active==='false')`
    )
  );
  await b.screenshot(`${out}/reduced-motion.png`);
  await scroll(1000);
  const reducedAfter = await readTraveler();
  check(
    "Reduced motion: companion does not follow scroll",
    Math.abs(reducedAfter.y - reducedBefore.y) < 1
  );
  // Toggling reduced motion after scrolling must not leave the static hero hidden.
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await sleep(300);
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(300);
  await scroll(0);
  check(
    "Reduced motion: hero reappears when enabled farther down the page",
    (await readTraveler()).visibility === "visible"
  );
  await b.viewport(390, 844);
  await sleep(400);
  check(
    "Reduced motion mobile: static hero remains visible without overflow",
    (await readTraveler()).visibility === "visible" && (await noOverflow())
  );
  await b.screenshot(`${out}/reduced-motion-390.png`);
  await b.viewport(1440, 960);
  await sleep(300);
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await scroll(0);
  await b.evaluate(
    `document.querySelector('button[aria-label="Switch to light theme"]').click();true;`
  );
  await sleep(500);
  check(
    "Light theme remains available",
    await b.evaluate(
      `document.querySelector('[data-surface]').dataset.surface==='light'`
    )
  );
  await b.screenshot(`${out}/light-theme.png`);
  await b.evaluate(
    `document.querySelector('button[aria-label="Switch to dark theme"]').click();document.querySelector('button[class*="motionButton"]').click();true;`
  );
  await sleep(400);
  check(
    "Pause control pauses all world decorations",
    await b.evaluate(
      `document.querySelector('[data-motion]').dataset.motion==='paused' && Array.from(document.querySelectorAll('[data-celestial-decor]')).every(e=>e.dataset.active==='false')`
    )
  );
  await b.evaluate(
    `document.querySelector('button[class*="motionButton"]').click();true;`
  );
  await sleep(400);
  check(
    "Resume reactivates visible world decorations",
    await b.evaluate(
      `document.querySelector('[data-motion]').dataset.motion==='active' && document.querySelector('[data-celestial-decor="hero"]').dataset.active==='true'`
    )
  );
  // Visibility behavior via a temporary document test property, then restored.
  await b.evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));true;`
  );
  await sleep(300);
  check(
    "Hidden page suspends world animation",
    await b.evaluate(
      `Array.from(document.querySelectorAll('[data-celestial-decor]')).every(e=>e.dataset.active==='false')`
    )
  );
  await b.evaluate(
    `delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));true;`
  );
  await sleep(300);
  check(
    "Visible page resumes the hero world",
    await b.evaluate(
      `document.querySelector('[data-celestial-decor="hero"]').dataset.active==='true'`
    )
  );
  const errors = b.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params.exceptionDetails);
  const logs = b.events
    .filter(
      (e) => e.method === "Log.entryAdded" && e.params.entry.level === "error"
    )
    .map((e) => e.params.entry);
  check("No JavaScript runtime errors", errors.length === 0);
  const resourceFailures = logs.filter(
    (e) => !e.url?.includes("/api/user/stats") && !e.url?.includes("favicon")
  );
  check("No landing resource errors", resourceFailures.length === 0);
  const sources = [
    "CelestialDecor.tsx",
    "CelestialDecor.module.css",
    "CelestialMotifs.tsx",
  ].map((f) => ({
    file: f,
    bytes: Buffer.byteLength(
      readFileSync("app/components/landing/journey/" + f)
    ),
  }));
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ checks, metrics, errors, logs, sources }, null, 2)
  );
  console.log(
    JSON.stringify({ passed: checks.length, metrics, logs, sources }, null, 2)
  );
} catch (error) {
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ checks, metrics, error: String(error) }, null, 2)
  );
  throw error;
} finally {
  b.close();
}
