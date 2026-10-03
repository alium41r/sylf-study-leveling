import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function browser() {
  const profile = mkdtempSync(join(tmpdir(), "sylf-companion-chrome-"));
  const chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  for (
    let n = 0;
    n < 100 && !existsSync(join(profile, "DevToolsActivePort"));
    n++
  )
    await sleep(100);
  const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
    "\n"
  )[0];
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
    r.json()
  );
  const socket = new WebSocket(
    pages.find((p) => p.type === "page").webSocketDebuggerUrl
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (!m.id) {
      events.push(m);
      return;
    }
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error
      ? p.reject(new Error(JSON.stringify(m.error)))
      : p.resolve(m.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  const viewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  const navigate = async (url) => {
    await send("Page.navigate", { url });
    for (let n = 0; n < 150; n++) {
      await sleep(200);
      if (
        await evaluate(
          'document.readyState === "complete" && !!document.querySelector("[data-sylf-companion]")'
        )
      )
        return;
    }
    throw new Error("Page did not load: " + url);
  };
  const screenshot = async (path, full = false) => {
    const options = { format: "png", captureBeyondViewport: full };
    if (full) {
      const m = await send("Page.getLayoutMetrics");
      options.clip = {
        x: 0,
        y: 0,
        width: m.cssContentSize.width,
        height: m.cssContentSize.height,
        scale: 1,
      };
    }
    const r = await send("Page.captureScreenshot", options);
    writeFileSync(path, Buffer.from(r.data, "base64"));
  };
  const close = () => {
    socket.close();
    chrome.kill();
    setTimeout(
      () =>
        rmSync(profile, {
          recursive: true,
          force: true,
          maxRetries: 8,
          retryDelay: 200,
        }),
      1200
    );
  };
  return { send, evaluate, events, viewport, navigate, screenshot, close };
}
// Uses the installed Chrome in an isolated temporary profile. No authentication,
// application mutations, Planner fixtures, browser downloads or extra dependencies.
const base = process.env.SYLF_QA_BASE ?? "http://127.0.0.1:3001";
const out = "documentation/landing-companion/qa";
mkdirSync(out, { recursive: true });
const results = [];
const b = await browser();
const check = (name, value) => {
  results.push({ name, passed: !!value });
  if (!value) throw new Error(name);
};
const hero = 'document.querySelector("[data-sylf-companion]")';
const state = () => b.evaluate(`${hero}.dataset.state`);
const select = async (value) => {
  await b.evaluate(
    `(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`
  );
  await sleep(100);
};
const click = async (label) => {
  await b.evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`
  );
  await sleep(100);
};
const shot = (name, full = false) => b.screenshot(`${out}/${name}.png`, full);
const stable = () =>
  b.evaluate(
    `window.qaOriginalSvg===${hero}.querySelector('svg') && window.qaHood===${hero}.querySelector('[data-part="hood"]')`
  );
const noOverflow = () =>
  b.evaluate("document.documentElement.scrollWidth <= innerWidth");
let error;
try {
  await b.viewport(1440, 1000);
  await b.navigate(`${base}/companion-prototype`);
  await sleep(500);
  await b.evaluate(
    `window.qaOriginalSvg=${hero}.querySelector('svg');window.qaHood=${hero}.querySelector('[data-part="hood"]');true`
  );
  check(
    "Nine eye variants and six actions share the canonical renderer",
    await b.evaluate(
      'document.querySelectorAll("[data-sylf-companion]").length===16 && new Set([...document.querySelectorAll("figure [data-part=eyes]")].map(e=>e.dataset.eyeExpression)).size===9'
    )
  );
  check(
    "No video/canvas or whole-character frame playback",
    await b.evaluate(
      'document.querySelectorAll("[data-sylf-companion] img, video, canvas").length===0'
    )
  );
  check(
    "Every character part uses the same painted master",
    await b.evaluate(
      `new Set([...document.querySelectorAll('[data-sylf-companion] image')].map(e=>e.getAttribute('href'))).size===1 && document.querySelector('[data-sylf-companion] image').getAttribute('href')==='/landing/companion/original-rig.webp'`
    )
  );
  check("Desktop review has no horizontal overflow", await noOverflow());
  await shot("review-desktop", true);
  // Compare two points on the animation's own timeline instead of sleeping and
  // hoping. The halo's ease-in-out is flat enough near its extremes that an
  // 800ms wall-clock window could return a byte-identical matrix string.
  const halo = await b.evaluate(`(()=>{
    const halo=${hero}.querySelector('[data-part="halo"]');
    const anim=document.getAnimations().find(a=>a.animationName?.includes('halo')&&a.effect?.target===halo);
    if(!anim)return {available:false};
    const duration=Number(anim.effect.getTiming().duration)||0;
    const saved=anim.currentTime;
    anim.currentTime=0;
    const atStart=getComputedStyle(halo).transform;
    anim.currentTime=duration*0.5;
    const atMid=getComputedStyle(halo).transform;
    anim.currentTime=saved;
    return {available:true,atStart,atMid,playState:anim.playState};
  })()`);
  check(
    "Layer animation changes the halo transform",
    halo.available && halo.atStart !== halo.atMid
  );
  await b.evaluate(
    `window.qaMutations=0;window.qaObserver=new MutationObserver(m=>window.qaMutations+=m.length);window.qaObserver.observe(${hero},{attributes:true,childList:true,subtree:true});`
  );
  await sleep(1200);
  check(
    "Idle animation creates no character DOM mutations",
    await b.evaluate("window.qaObserver.disconnect();window.qaMutations===0")
  );
  for (const s of [
    "FOCUSING",
    "READING",
    "PLANNING",
    "AI_THINKING",
    "DISCOVERING",
    "REST",
    "ERROR",
    "IDLE",
  ]) {
    await select(s);
    check(
      `Persistent SVG/hood through ${s}`,
      (await state()) === s && (await stable())
    );
  }
  const mood = await b.evaluate(`(()=>{
    const character=${hero};
    const animations=document.getAnimations().filter(a=>character.contains(a.effect?.target));
    const happy=animations.find(a=>a.animationName?.includes('happy-moment'));
    const neutral=animations.find(a=>a.animationName?.includes('neutral-moment'));
    const curious=animations.find(a=>a.animationName?.includes('curious-glance'));
    if(!happy||!neutral||!curious)return {available:false};
    // Sample each animation at a point taken from its OWN keyframes rather than
    // a hard-coded millisecond, so retuning the idle cadence cannot silently
    // invalidate this check. Pick the peak offset of the visible beat.
    const peak=(a,fractional)=>{
      const frames=a.effect.getKeyframes();
      const duration=Number(a.effect.getTiming().duration)||1;
      const middles=frames.filter(f=>f.offset>0&&f.offset<1);
      // getKeyframes() serialises transforms as authored CSS ("translate(0px)
      // scaleY(1)"), not as a matrix, so compare against the first keyframe
      // rather than pattern-matching a matrix string.
      const identity=String(frames[0]?.transform??'none');
      const hit=middles.find(f=>fractional(f,identity))||frames[Math.floor(frames.length/2)];
      return {at:(hit?.offset??0.5)*duration,frames};
    };
    const happyPeak=peak(happy,f=>Number(f.opacity)>=1);
    const curiousPeak=peak(curious,(f,identity)=>String(f.transform??'none')!==identity);
    const saved=[happy,neutral,curious].map(a=>a.currentTime);
    happy.currentTime=happyPeak.at;neutral.currentTime=happyPeak.at;curious.currentTime=curiousPeak.at;
    const result={available:true,at:{happy:happyPeak.at,curious:curiousPeak.at},happyOpacity:Number(getComputedStyle(happy.effect.target).opacity),neutralOpacity:Number(getComputedStyle(neutral.effect.target).opacity),curiousTransform:getComputedStyle(curious.effect.target).transform};
    [happy,neutral,curious].forEach((a,i)=>a.currentTime=saved[i]);
    return result;
  })()`);
  check(
    "Occasional happy and curious eye motion uses the persistent character",
    mood.available &&
      mood.happyOpacity > 0.9 &&
      mood.neutralOpacity < 0.1 &&
      mood.curiousTransform !== "matrix(1, 0, 0, 1, 0, 0)" &&
      (await stable())
  );
  await select("FOCUSING");
  await click("Happy reaction");
  check(
    "Focus accepts a bounded happy reaction",
    (await state()) === "QUEST_COMPLETE"
  );
  await click("Celebrate");
  await click("Hello");
  check(
    "Celebration supersedes happy and rejects lower-priority hello",
    (await state()) === "LEVEL_UP" && (await stable())
  );
  await sleep(3250);
  check("Reaction expires back to Focus", (await state()) === "FOCUSING");
  await click("Celebrate");
  await select("PLANNING");
  check(
    "Base change cancels reaction without remounting",
    (await state()) === "PLANNING" && (await stable())
  );
  await b.evaluate("window.scrollTo(0,document.body.scrollHeight)");
  await sleep(300);
  check(
    "Offscreen character animation pauses",
    await b.evaluate(`${hero}.dataset.animation==='paused'`)
  );
  await b.evaluate("window.scrollTo(0,0)");
  await sleep(200);
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await select("FOCUSING");
  await click("Celebrate");
  check(
    "Reduced motion retains excited expression",
    await b.evaluate(`${hero}.dataset.expression==='EXCITED'`)
  );
  check(
    "Reduced motion stops all companion animation",
    await b.evaluate(
      `![...${hero}.querySelectorAll('*')].some(e=>getComputedStyle(e).animationName!=='none')`
    )
  );
  await shot("reduced-motion-review");
  await b.send("Emulation.setEmulatedMedia", { features: [] });
  await b.viewport(390, 844);
  await select("FOCUSING");
  await sleep(800);
  check("Mobile review has no horizontal overflow", await noOverflow());
  await shot("review-mobile-focus");
  await click("Celebrate");
  await shot("review-mobile-celebration");
  const cadence = await b.evaluate(
    `new Promise(resolve=>{let t=0;const a=[];function frame(n){if(t)a.push(n-t);t=n;if(a.length<90)requestAnimationFrame(frame);else{a.sort((x,y)=>x-y);resolve({medianMs:a[45],p95Ms:a[85],samples:a.length});}}requestAnimationFrame(frame);})`
  );
  results.push({
    name: "Headless Chrome mobile viewport RAF cadence (not hardware/mobile paint benchmark)",
    ...cadence,
  });
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 740],
  ]) {
    await b.viewport(width, height);
    await b.navigate(`${base}/`);
    await sleep(600);
    check(`Landing ${width}px has no overflow`, await noOverflow());
    await shot(`landing-${width}-hero`);
    await b.evaluate(
      'window.qaJourneySvg=document.querySelector("[data-journey-traveler] svg");true'
    );
    for (const section of ["focus", "study-ai", "early-access"]) {
      await b.evaluate(
        `(()=>{const a=document.querySelector('#${section} [data-journey-stop]');window.scrollTo(0,a.getBoundingClientRect().top+scrollY-innerHeight*.68);})()`
      );
      await sleep(2600);
      const measure = await b.evaluate(
        `(()=>{const t=document.querySelector('[data-journey-traveler]');const r=t.querySelector('[data-character-surface]').getBoundingClientRect();const controls=[...document.querySelectorAll('button,a,input')].filter(e=>{const c=e.getBoundingClientRect();return c.width>0 && c.height>0 && r.left<c.right && r.right>c.left && r.top<c.bottom && r.bottom>c.top;}).map(e=>e.textContent.trim().slice(0,40));return {state:t.dataset.motionState,moving:t.dataset.moving,visible:getComputedStyle(t).visibility,x:r.x,y:r.y,width:r.width,height:r.height,controls,sameSvg:window.qaJourneySvg===t.querySelector('svg'),overflow:document.documentElement.scrollWidth-innerWidth};})()`
      );
      results.push({ name: `Landing ${width}px at ${section}`, ...measure });
      check(
        `Stable visible character and clear controls at ${width}px ${section}`,
        measure.sameSvg &&
          measure.visible === "visible" &&
          measure.controls.length === 0 &&
          measure.overflow <= 0 &&
          measure.x >= -1 &&
          measure.x + measure.width <= width + 1
      );
      await shot(`landing-${width}-${section}`);
      if (width === 1440 && section === "focus") {
        const motion = await b.evaluate(`new Promise(resolve=>{
          const traveler=document.querySelector('[data-journey-traveler]');
          const surface=traveler.querySelector('[data-activity]');
          const original=traveler.querySelector('svg');
          const startScroll=scrollY,samples=[];let start=0,reversed=false;
          window.scrollTo({top:startScroll+350,behavior:'instant'});
          function sample(time){
            if(!start)start=time;
            const elapsed=time-start;
            if(elapsed>450&&!reversed){window.scrollTo({top:startScroll-150,behavior:'instant'});reversed=true;}
            const rect=traveler.getBoundingClientRect();
            const read=name=>parseFloat(surface.style.getPropertyValue(name))||0;
            samples.push({time:elapsed,y:rect.top+scrollY,cape:read('--cape-lag'),left:read('--ribbon-left-lag'),right:read('--ribbon-right-lag'),body:read('--journey-lean')});
            if(elapsed<4200)requestAnimationFrame(sample);
            else resolve({samples,sameSvg:traveler.querySelector('svg')===original,moving:traveler.dataset.moving});
          }
          requestAnimationFrame(sample);
        })`);
        const peakCape = Math.max(
          ...motion.samples.map((s) => Math.abs(s.cape))
        );
        const peakRibbon = Math.max(
          ...motion.samples.map((s) => Math.abs(s.left))
        );
        const last = motion.samples.at(-1);
        const maxStep = Math.max(
          ...motion.samples
            .slice(1)
            .map((s, i) => Math.abs(s.y - motion.samples[i].y))
        );
        results.push({
          name: "Scroll reversal motion sample",
          sampleCount: motion.samples.length,
          peakCapeDegrees: peakCape,
          peakRibbonDegrees: peakRibbon,
          maxPageStepPx: maxStep,
          last,
        });
        check(
          "Scroll drives independent cape and ribbon inertia without remounting",
          motion.sameSvg &&
            peakCape > 0.1 &&
            peakRibbon > 0.1 &&
            motion.samples.some((s) => Math.abs(s.left - s.right) > 0.1)
        );
        check(
          "Normal scroll reversal preserves continuous page movement",
          maxStep < 80
        );
        check(
          "Fabric settles completely after page travel stops",
          motion.moving === "false" &&
            last.cape === 0 &&
            last.left === 0 &&
            last.right === 0 &&
            last.body === 0
        );
      }
    }
  }
  await b.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(200);
  await b.evaluate("window.scrollTo(0,0)");
  await sleep(200);
  check(
    "Reduced motion landing keeps the same static hero character",
    await b.evaluate(
      'getComputedStyle(document.querySelector("[data-journey-traveler]")).visibility==="visible" && document.querySelectorAll("[data-journey-traveler]").length===1'
    )
  );
  await shot("landing-mobile-reduced");
  const resources = await b.evaluate(
    'performance.getEntriesByType("resource").map(r=>({name:r.name.split("/").slice(-1)[0],bytes:r.encodedBodySize,type:r.initiatorType}))'
  );
  check(
    "No retired video/Pixi/atlas assets requested",
    !resources.some((r) =>
      /chibi-|canonical.webp|companion-poses|\.webm|\.mp4|pixi/.test(r.name)
    )
  );
  results.push({
    name: "Final navigation resource sizes (cache may affect bytes)",
    resources,
  });
  const errors = b.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params.exceptionDetails.text);
  check("No browser runtime exceptions", errors.length === 0);
} catch (e) {
  error = e;
  results.push({ name: "Failure", error: String(e) });
} finally {
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      { base, createdAt: new Date().toISOString(), results },
      null,
      2
    ) + "\n"
  );
  b.close();
}
console.log(
  JSON.stringify(
    {
      checks: results.filter((r) => "passed" in r).length,
      failures: results.filter((r) => r.passed === false),
      error: error?.message,
    },
    null,
    2
  )
);
if (error) process.exitCode = 1;
