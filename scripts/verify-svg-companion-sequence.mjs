import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const helper = readFileSync(
  new URL("./verify-landing-companion.mjs", import.meta.url),
  "utf8"
).split("// Uses the installed Chrome")[0];
const { browser, sleep } = await import(
  `data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`
);
const out = "documentation/svg-companion/capability-test";
const base = process.env.SYLF_QA_BASE ?? "http://127.0.0.1:3100";
mkdirSync(out, { recursive: true });
// Reuse the frozen Phase 2 assertions verbatim, with fresh evidence output.
if (process.argv.includes("--pixel-regression")) {
  let source = readFileSync(
    new URL("./verify-pixel-companion-phase2.mjs", import.meta.url),
    "utf8"
  );
  for (const name of ["@next/env", "jose", "sharp"])
    source = source.replace(
      `from "${name}"`,
      `from "${import.meta.resolve(name)}"`
    );
  source = source
    .replace(
      'new URL("./verify-landing-companion.mjs", import.meta.url)',
      `new URL(${JSON.stringify(new URL("./verify-landing-companion.mjs", import.meta.url).href)})`
    )
    .replace(
      'const out = "documentation/pixel-companion/phase2";',
      `const out = "${out}/pixel-regression";`
    );
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  process.exit(process.exitCode ?? 0);
}
const b = await browser();
const checks = [],
  samples = [];
const host = 'document.querySelector("[data-sylf-companion]")';
const check = (name, passed) => {
  checks.push({ name, passed: !!passed });
  if (!passed) throw new Error(name);
};
const wait = async (expression) => {
  for (let n = 0; n < 150; n++) {
    if (await b.evaluate(expression)) return;
    await sleep(25);
  }
  throw new Error("Timed out: " + expression);
};
const click = (text) =>
  b.evaluate(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click();true`
  );
const select = (id, value) =>
  b.evaluate(
    `(()=>{const s=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`
  );
const view = (width, height, dpr = 1) =>
  b.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: width < 700,
  });
const snapshot = `(()=>{const e=${host},s=e.querySelector('svg'),eyes=e.querySelector('[data-part="eyes"]'),rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};const poses=[...s.querySelectorAll('g')].filter(x=>/statePose|actionPose|reaction|head|ribbonPose|cloakPose|haloPose|starPose/.test(x.getAttribute('class')??'')).map(x=>({class:x.getAttribute('class'),transform:getComputedStyle(x).transform,animation:getComputedStyle(x).animationName}));return {beat:e.dataset.svgSequence,state:e.dataset.state,expression:e.dataset.expression,eye:eyes.dataset.eyeExpression,blink:eyes.dataset.blink,rect:rect(e),svg:rect(s),eyes:rect(eyes),poses,stable:window.qaSvg===s&&window.qaHood===s.querySelector('[data-part="hood"]'),outgoing:s.querySelectorAll('[data-eye-transition="outgoing"]').length,overflow:document.documentElement.scrollWidth-innerWidth,closedOpacity:getComputedStyle(eyes.querySelector('[data-eye-layer="blink-lid"]')??eyes).opacity};})()`;
const css = () => b.evaluate(snapshot);
const pendingShots = [];
const shot = async (name, measurement) => {
  const m = measurement ?? (await css());
  const dpr = await b.evaluate("devicePixelRatio");
  const png = await b.send("Page.captureScreenshot", { format: "png" });
  pendingShots.push({ name, m, dpr, data: Buffer.from(png.data, "base64") });
};
const flushShots = async () => {
  for (const { name, m, dpr, data } of pendingShots.splice(0)) {
    const meta = await sharp(data).metadata();
    const left = Math.max(0, Math.floor((m.rect.x - 20) * dpr)),
      top = Math.max(0, Math.floor((m.rect.y - 30) * dpr));
    await sharp(data)
      .extract({
        left,
        top,
        width: Math.min(
          meta.width - left,
          Math.ceil((m.rect.width + 40) * dpr)
        ),
        height: Math.min(
          meta.height - top,
          Math.ceil((m.rect.height + 60) * dpr)
        ),
      })
      .toFile(`${out}/${name}.png`);
  }
};
let error;
try {
  if (!process.argv.includes("--landing-only")) {
    for (const [width, height, dpr] of [
      [1440, 1000, 1],
      [820, 1180, 2],
      [390, 844, 3],
    ]) {
      await view(width, height, dpr);
      await b.navigate(`${base}/companion-prototype`);
      await wait(
        `!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Play SVG reaction sequence')`
      );
      await b.evaluate(
        "document.querySelector('nextjs-portal')?.style.setProperty('display','none');true"
      );
      for (const [size, px] of [
        ["small", 48],
        ["medium", 96],
        ["large", 180],
      ]) {
        await b.evaluate(
          `${host}.style.setProperty('--companion-size','${px}px');${host}.style.width='${px}px';${host}.style.height='${px}px';${host}.dataset.compact=String(${px}<=64);${host}.scrollIntoView({block:'center'});window.qaSvg=${host}.querySelector('svg');window.qaHood=${host}.querySelector('[data-part="hood"]');true`
        );
        await sleep(700);
        const idle = await css();
        // Sample inside the browser. Tool/screenshot latency cannot change which
        // beat supplies each measurement, and image cropping runs after playback.
        await b.evaluate(
          `(()=>{window.qaSequenceSnapshots={};const starts={};let endStart;const frame=()=>{const beat=${host}.dataset.svgSequence,now=performance.now();if(beat){starts[beat]??=now;const delay={blink:50,notice:250,happy:250}[beat];if(delay!==undefined&&!window.qaSequenceSnapshots[beat]&&now-starts[beat]>=delay)window.qaSequenceSnapshots[beat]=${snapshot};}else {endStart??=now;if(now-endStart>=250){window.qaSequenceSnapshots.end=${snapshot};return;}}requestAnimationFrame(frame);};[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Play SVG reaction sequence').click();requestAnimationFrame(frame);return true;})()`
        );
        await wait("!!window.qaSequenceSnapshots.blink");
        const blink = await b.evaluate("window.qaSequenceSnapshots.blink");
        check(
          `${width}/${size}: existing drawn blink closes`,
          blink.blink === "closed" && Number(blink.closedOpacity) > 0.8
        );
        await shot(`${width}-${size}-blink`, blink);
        await wait("!!window.qaSequenceSnapshots.notice");
        const notice = await b.evaluate("window.qaSequenceSnapshots.notice");
        check(
          `${width}/${size}: curious expression and smooth restrained pose`,
          notice.eye === "CURIOUS" && notice.stable
        );
        await shot(`${width}-${size}-notice`, notice);
        await wait("!!window.qaSequenceSnapshots.happy");
        const happy = await b.evaluate("window.qaSequenceSnapshots.happy");
        check(
          `${width}/${size}: happy eyes without extra reaction bounce`,
          happy.eye === "HAPPY" &&
            happy.poses
              .filter((p) => /reaction/.test(p.class))
              .every((p) => p.animation === "none")
        );
        await shot(`${width}-${size}-happy`, happy);
        await wait("!!window.qaSequenceSnapshots.end");
        const end = await b.evaluate("window.qaSequenceSnapshots.end");
        check(
          `${width}/${size}: exact neutral pose restored`,
          end.state === "IDLE" &&
            end.eye === "NEUTRAL" &&
            !end.blink &&
            JSON.stringify(end.poses) === JSON.stringify(idle.poses)
        );
        check(
          `${width}/${size}: fixed layout, stable rig, clean eye dissolve`,
          end.stable &&
            end.outgoing === 0 &&
            end.overflow <= 0 &&
            JSON.stringify(end.rect) === JSON.stringify(idle.rect)
        );
        await shot(`${width}-${size}-idle`, end);
        await flushShots();
        samples.push({
          viewport: { width, height, dpr },
          size,
          px,
          idle,
          blink,
          notice,
          happy,
          end,
        });
      }
    }
    await view(1440, 1000);
    // Interrupt/restart at each meaningful beat; all final transforms must match.
    for (const interrupted of ["blink", "notice", "happy"]) {
      await click("Play SVG reaction sequence");
      await wait(
        `${host}.dataset.svgSequence===${JSON.stringify(interrupted)}`
      );
      await click("Play SVG reaction sequence");
      check(
        `Replay during ${interrupted} starts fresh`,
        await b.evaluate(
          `${host}.dataset.svgSequence==='idle'&&${host}.dataset.state==='IDLE'`
        )
      );
      await wait(`!${host}.dataset.svgSequence`);
      check(
        `Replay during ${interrupted} releases eye override`,
        (await css()).blink === undefined
      );
    }
    await b.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await click("Play SVG reaction sequence");
    await wait(`${host}.dataset.svgSequence==='notice'`);
    const reducedNotice = await css();
    await wait(`${host}.dataset.svgSequence==='happy'`);
    const reducedHappy = await css();
    samples.push({ reducedNotice, reducedHappy });
    check(
      "Reduced motion retains expressions with static pose layers",
      reducedNotice.eye === "CURIOUS" &&
        reducedHappy.eye === "HAPPY" &&
        reducedHappy.poses.every((p) => p.animation === "none") &&
        reducedHappy.poses
          .filter((p) => !/actionPose/.test(p.class))
          .every(
            (p) =>
              p.transform === "none" ||
              p.transform === "matrix(1, 0, 0, 1, 0, 0)"
          )
    );
    await shot("reduced-motion-happy");
    await wait(`!${host}.dataset.svgSequence`);
    await b.send("Emulation.setEmulatedMedia", { features: [] });
    await select("companion-state", "READING");
    check(
      "Existing reading action still supplies its book",
      await b.evaluate(`!!${host}.querySelector('[data-part="book"]')`)
    );
    await click("Celebrate");
    check(
      "Existing celebration still uses its reaction controller",
      await b.evaluate(`${host}.dataset.state==='LEVEL_UP'`)
    );
    await sleep(3300);
    check(
      "Existing reaction returns to reading",
      await b.evaluate(`${host}.dataset.state==='READING'`)
    );
    await click("Layered pixel companion");
    check(
      "Sequence control absent for layered pixels",
      await b.evaluate(
        `![...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Play SVG reaction sequence')&&!document.querySelector('[data-svg-sequence]')`
      )
    );
    await click("New pixel companion");
    check(
      "Full Phase 1 comparison remains selectable",
      await b.evaluate(`!!${host}.querySelector('[data-pixel-variant="full"]')`)
    );
  } else {
    const previous = JSON.parse(
      readFileSync(`${out}/svg-browser-results.json`, "utf8")
    );
    checks.push(
      ...previous.checks.filter(
        (c) =>
          !c.name.includes("section state remains") &&
          !c.name.includes("happy expression remains beyond") &&
          !c.name.includes("SVG keeps fractional")
      )
    );
    samples.push(...previous.samples.filter((s) => !s.scrollSamples));
  }
  // Real scrolling: sample every frame while continually moving through section bands.
  const scrollSamples = [];
  samples.push({ scrollSamples });
  for (const [width, height, dpr] of [
    [1440, 1000, 1],
    [820, 1180, 2],
    [390, 844, 3],
  ]) {
    await view(width, height, dpr);
    await b.navigate(`${base}/`);
    await wait(
      `!!document.querySelector('[data-journey-traveler][data-motion-state]')`
    );
    for (const id of [
      "focus",
      "progression",
      "study-ai",
      "together",
      "early-access",
    ]) {
      const s = await b.evaluate(
        `(async()=>{const section=document.getElementById('${id}');const anchor=section.querySelector('[data-journey-stop]');const r=anchor.getBoundingClientRect();const start=Math.min(r.top+scrollY+r.height/2-innerHeight*.68-180,document.documentElement.scrollHeight-innerHeight-220);window.scrollTo(0,start);await new Promise(r=>setTimeout(r,1700));const samples=[];for(let n=0;n<50;n++){window.scrollBy(0,4);await new Promise(requestAnimationFrame);const w=document.querySelector('[data-journey-traveler]'),c=w.querySelector('[data-sylf-companion]');samples.push({moving:w.dataset.moving,state:w.dataset.motionState,expression:c.dataset.expression,action:c.dataset.action,transform:w.style.transform});}return samples;})()`
      );
      scrollSamples.push({ width, id, samples: s });
      const expected = {
        focus: "FOCUSING",
        progression: "QUEST_COMPLETE",
        "study-ai": "PLANNING",
        together: "GREETING",
        "early-access": "QUEST_COMPLETE",
      }[id];
      check(
        `${width}/${id}: section state remains during continuous scroll`,
        s.some((x) => x.moving === "true" && x.state === expected)
      );
    }
    await sleep(2800);
    check(
      `${width}: happy expression remains beyond reaction expiry`,
      await b.evaluate(
        `document.querySelector('[data-journey-traveler] [data-sylf-companion]').dataset.expression==='HAPPY'`
      )
    );
    const movingSamples = scrollSamples
      .filter((s) => s.width === width)
      .flatMap((s) => s.samples)
      .filter((s) => s.moving === "true");
    check(
      `${width}: SVG keeps fractional unsnapped coordinates`,
      movingSamples.some((s) => {
        const match = s.transform.match(
          /translate3d\(([-\d.]+)px, ([-\d.]+)px/
        );
        return (
          match &&
          match
            .slice(1)
            .some(
              (n) =>
                Math.abs(Number(n) * dpr - Math.round(Number(n) * dpr)) > 0.001
            )
        );
      })
    );
  }

  await flushShots();
  check(
    "No browser runtime exceptions",
    !b.events.some((e) => e.method === "Runtime.exceptionThrown")
  );
} catch (e) {
  error = String(e);
  console.error(error);
} finally {
  writeFileSync(
    `${out}/svg-browser-results.json`,
    JSON.stringify({ checks, samples, error }, null, 2)
  );
  b.close();
}
console.log(
  JSON.stringify({
    passed: checks.filter((c) => c.passed).length,
    total: checks.length,
    error,
  })
);
if (error) process.exitCode = 1;
