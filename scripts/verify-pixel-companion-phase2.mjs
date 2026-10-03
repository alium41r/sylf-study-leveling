import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import sharp from "sharp";

// The installed-Chrome helper uses a fresh disposable profile and no downloads.
const helper = readFileSync(
  new URL("./verify-landing-companion.mjs", import.meta.url),
  "utf8"
)
  .split("// Uses the installed Chrome")[0]
  .replace('{ stdio: "ignore" }', '{ stdio: ["ignore", "ignore", "pipe"] }')
  .replace(
    "  for (\n    let n = 0;",
    '  let diagnostics = ""; chrome.stderr.on("data", data => diagnostics += data.toString());\n  for (\n    let n = 0;'
  )
  .replace(
    "  const port = readFileSync(",
    '  if (!existsSync(join(profile, "DevToolsActivePort"))) { chrome.kill(); rmSync(profile, {recursive:true, force:true}); throw new Error("Chrome startup failed: " + diagnostics.slice(-1500)); }\n  const port = readFileSync('
  );
const { browser, sleep } = await import(
  `data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`
);
const base = process.env.SYLF_QA_BASE ?? "http://127.0.0.1:3100";
const out = "documentation/pixel-companion/phase2";
const states = ["neutral", "happy", "thinking", "focused", "sleepy", "blink"];
const registration = { x: 0, y: 0, width: 1254, height: 1254 };
mkdirSync(out, { recursive: true });
const b = await browser().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
const results = [],
  assets = new Map(),
  sheets = new Map();
const hero = 'document.querySelector("[data-sylf-companion]")';
const canvas = `${hero}?.querySelector('[data-pixel-canvas]')`;
const layer = (name) =>
  `${hero}?.querySelector('[data-pixel-layer="${name}"]')`;
const expression = `${hero}?.querySelector('[data-pixel-expression]')?.dataset.pixelExpression`;
const check = (name, passed) => {
  results.push({ name, passed: !!passed });
  if (!passed) throw new Error(name);
};
const waitFor = async (condition, label) => {
  for (let n = 0; n < 150; n++) {
    if (await b.evaluate(condition)) return;
    await sleep(25);
  }
  throw new Error(`Timed out: ${label}`);
};
const viewport = (width, height, dpr) =>
  b.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: width <= 700,
  });
const navigate = async (path) => {
  await b.navigate(`${base}${path}`);
  await waitFor(
    `${layer("body")}?.complete&&${layer("eyes")}?.complete&&${layer("eyes")}?.naturalWidth>0`,
    path
  );
  await sleep(150);
  await b.evaluate(
    "document.querySelector('nextjs-portal')?.style.setProperty('display','none')"
  );
};
const select = async (state) => {
  await b.evaluate(
    `(()=>{const e=document.querySelector('#pixel-eye-state');if(e){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(state)});e.dispatchEvent(new Event('change',{bubbles:true}));}else{const u=new URL(location.href);u.searchParams.set('eyes',${JSON.stringify(state)});history.replaceState(null,'',u);window.dispatchEvent(new PopStateEvent('popstate'));}})()`
  );
  await waitFor(
    `${expression}===${JSON.stringify(state)}&&${layer("eyes")}?.complete&&${layer("eyes")}?.naturalWidth>0`,
    state
  );
  await b.evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))"
  );
};
const measure = () =>
  b.evaluate(`(()=>{
  const host=${hero},c=${canvas},body=${layer("body")},eyes=${layer("eyes")},v=host.querySelector('[data-pixel-variant]');
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const css=e=>{const s=getComputedStyle(e);return {transform:s.transform,filter:s.filter,opacity:s.opacity,imageRendering:s.imageRendering,objectFit:s.objectFit,animationName:s.animationName};};
  const cr=rect(c),er=rect(eyes);const native={x:(er.x-cr.x)/cr.width*body.naturalWidth,y:(er.y-cr.y)/cr.height*body.naturalHeight,width:er.width/cr.width*body.naturalWidth,height:er.height/cr.height*body.naturalHeight};
  const image=e=>({rect:rect(e),...css(e),src:e.currentSrc,width:e.naturalWidth,height:e.naturalHeight,loaded:e.complete&&e.naturalWidth>0});
  const ancestors=[];for(let e=host.parentElement;e&&ancestors.length<4;e=e.parentElement)ancestors.push({class:e.className,rect:rect(e),...css(e)});
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},variant:v.dataset.pixelVariant,expression:v.dataset.pixelExpression,selectedExpression:v.dataset.pixelSelectedExpression,host:{rect:rect(host),...css(host)},canvas:{rect:cr,...css(c)},body:image(body),eyes:image(eyes),nativeEyeBounds:native,ancestors,stableBody:!window.qaBody||window.qaBody===body,stableEyeNode:!window.qaEyes||window.qaEyes===eyes,overflow:document.documentElement.scrollWidth-innerWidth};
})()`);
const noteAsset = async (src) => {
  const pathname = new URL(src).pathname;
  if (assets.has(pathname)) return;
  if (!pathname.startsWith("/companions/"))
    throw new Error(`Unexpected runtime asset path: ${pathname}`);
  const metadata = await sharp(`public${pathname}`).metadata();
  const { data, info } = await sharp(`public${pathname}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0,
    partial = 0,
    opaque = 0;
  for (let p = 3; p < data.length; p += info.channels) {
    if (data[p] === 0) transparent++;
    else if (data[p] === 255) opaque++;
    else partial++;
  }
  const record = {
    path: pathname,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    transparent,
    partial,
    opaque,
  };
  assets.set(pathname, record);
  check(
    `${pathname}: transparent runtime PNG`,
    metadata.format === "png" &&
      metadata.hasAlpha &&
      transparent > 0 &&
      opaque > 0
  );
};
const captureCrop = async (rect, margin = 2) => {
  const dpr = await b.evaluate("devicePixelRatio");
  const { data } = await b.send("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(data, "base64");
  const { width, height } = await sharp(png).metadata();
  const left = Math.max(0, Math.floor(rect.x * dpr) - margin),
    top = Math.max(0, Math.floor(rect.y * dpr) - margin);
  return sharp(png)
    .extract({
      left,
      top,
      width: Math.min(width - left, Math.ceil(rect.width * dpr) + margin * 2),
      height: Math.min(height - top, Math.ceil(rect.height * dpr) + margin * 2),
    })
    .png()
    .toBuffer();
};
const sheet = async (name, frames, columns = states.length) => {
  const dimensions = await Promise.all(
    frames.map(async (f) => ({ ...f, ...(await sharp(f.png).metadata()) }))
  );
  const cellWidth = Math.max(...dimensions.map((f) => f.width)),
    cellHeight = Math.max(...dimensions.map((f) => f.height));
  await sharp({
    create: {
      width: cellWidth * columns,
      height: cellHeight * Math.ceil(frames.length / columns),
      channels: 4,
      background: "#10141e",
    },
  })
    .composite(
      dimensions.map((f, i) => ({
        input: f.png,
        left: (i % columns) * cellWidth,
        top: Math.floor(i / columns) * cellHeight,
      }))
    )
    .png()
    .toFile(`${out}/${name}.png`);
  results.push({
    name: `${name} contact sheet`,
    cellWidth,
    cellHeight,
    columns,
    frames: frames.map((frame) => {
      const record = { ...frame };
      delete record.png;
      return record;
    }),
    note: "Crops of browser output at native screenshot pixels; no art or screenshot resampling",
  });
};
const inspectStates = async (name, collect) => {
  await b.evaluate(
    `window.qaBody=${layer("body")};window.qaEyes=${layer("eyes")};true`
  );
  const baseline = await measure();
  for (const state of states) {
    await select(state);
    const m = await measure();
    results.push({ name: `${name}-${state}`, ...m });
    check(
      `${name}-${state}: fixed body and registered eyes`,
      m.stableBody &&
        m.stableEyeNode &&
        m.body.src === baseline.body.src &&
        m.eyes.loaded &&
        Object.entries(registration).every(
          ([key, value]) => Math.abs(m.nativeEyeBounds[key] - value) < 1
        )
    );
    check(
      `${name}-${state}: no stretch, opacity change, filter or overflow`,
      Math.abs(m.body.rect.width - m.body.rect.height) < 0.02 &&
        Math.abs(m.eyes.rect.width - m.eyes.rect.height) < 0.02 &&
        m.body.width === 1254 &&
        m.body.height === 1254 &&
        m.eyes.width === m.body.width &&
        m.eyes.height === m.body.height &&
        m.body.opacity === "1" &&
        m.eyes.opacity === "1" &&
        m.body.imageRendering === "pixelated" &&
        m.eyes.imageRendering === "pixelated" &&
        m.body.transform === "none" &&
        m.eyes.transform === "none" &&
        m.body.filter === "none" &&
        m.eyes.filter === "none" &&
        m.overflow <= 0
    );
    await noteAsset(m.body.src);
    await noteAsset(m.eyes.src);
    if (collect) {
      const frames = sheets.get(collect) || [];
      frames.push({
        state,
        viewport: m.viewport,
        png: await captureCrop(m.host.rect),
      });
      sheets.set(collect, frames);
    }
  }
};
const onboardingFixture = async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  if (!process.env.JWT_SECRET)
    throw new Error(
      "Local JWT_SECRET is required for disposable onboarding fixture"
    );
  const token = await new SignJWT({ userId: 0, hasCompletedOnboarding: false })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(process.env.JWT_ISSUER || "sylf")
    .setAudience(process.env.JWT_AUDIENCE || "sylf-app")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  await b.send("Network.setCookie", {
    name: "hunter_token",
    value: token,
    url: base,
    path: "/",
    httpOnly: true,
  });
  const fixture = {
    id: 0,
    email: "companion-qa@example.invalid",
    username: "companion-qa",
    name: "Visual QA",
    hasCompletedOnboarding: false,
    hasPassword: true,
    hunterRank: "E",
    level: 1,
    currentXP: 0,
    xpToNextLevel: 100,
    hp: 100,
    maxHp: 100,
    streakDays: 0,
    totalStudyMinutes: 0,
    sylph: 0,
    timezone: "Asia/Karachi",
    createdAt: "2026-10-01T00:00:00Z",
  };
  await b.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>{const u=new URL(input instanceof Request?input.url:String(input),location.href),method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(u.origin===location.origin&&u.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(method))return Promise.reject(new Error('Visual QA blocks API writes'));if(u.origin===location.origin&&u.pathname==='/api/user/stats')return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(fixture))},{status:200,headers:{'Content-Type':'application/json'}}));return original(input,init);};})()`,
  });
  results.push({
    name: "Isolated onboarding fixture",
    method:
      "Synthetic user ID0 cookie in disposable Chrome; intercepted stats response; API writes blocked; no account data or submissions",
  });
};
const inspectSampling = async (phases) => {
  const palette = new Set();
  for (const file of [
    "public/companions/pixel/sylf/base/body.png",
    "public/companions/pixel/sylf/eyes/neutral.png",
  ]) {
    const raw = await sharp(file).raw().toBuffer();
    for (let p = 0; p < raw.length; p += 4)
      if (raw[p + 3] === 255)
        palette.add((raw[p] << 16) | (raw[p + 1] << 8) | raw[p + 2]);
  }
  const stats = [];
  for (const frame of phases) {
    const { data, info } = await sharp(frame.png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let brightPixels = 0,
      unknownBrightPixels = 0;
    const colors = new Set();
    for (let p = 0; p < data.length; p += info.channels) {
      if ((data[p] + data[p + 1] + data[p + 2]) / 3 < 75) continue;
      brightPixels++;
      const color = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      colors.add(color);
      if (!palette.has(color)) unknownBrightPixels++;
    }
    stats.push({
      dpr: frame.dpr,
      phaseDevicePixels: frame.phaseDevicePixels,
      brightPixels,
      sourcePalettePixels: brightPixels - unknownBrightPixels,
      unknownBrightPixels,
      uniqueBrightColors: colors.size,
    });
  }
  const evidence = {
    method:
      "Force unsnapped device-pixel translation phases on the actual 56x70 landing traveler. Native screenshot crops; bright mean RGB >=75 excludes dark background/edges. Compare exact RGB to opaque current body+neutral-eye runtime palette. No screenshot resampling.",
    sourceColors: palette.size,
    stats,
    observed:
      "Forced fractional positions change the sampled edge pattern, most visibly at DPR1. Bright source-palette comparison measures interpolation colors independently of the normal application's device-pixel snapping.",
    limitation:
      "Installed headless Chrome only; dark edge colors, other compositors and physical hardware are not covered.",
  };
  writeFileSync(
    `${out}/fractional-sampling.json`,
    JSON.stringify(evidence, null, 2) + "\n"
  );
  check(
    "Forced fractional phases retain every sampled bright runtime color",
    stats.every((stat) => stat.unknownBrightPixels === 0)
  );
};
let failure;
try {
  await viewport(1440, 1000, 2);
  await navigate(
    "/companion-prototype?companion=pixel-layered&eyes=neutral&phase2=qa"
  );
  check(
    "Five expressions and blink exist in dev control",
    await b.evaluate(
      `JSON.stringify([...document.querySelector('#pixel-eye-state').options].map(e=>e.value))===${JSON.stringify(JSON.stringify(states))}`
    )
  );
  await b.evaluate(
    `${hero}.closest('section').scrollIntoView({block:'start'});true`
  );
  await sleep(100);
  await b.screenshot(`${out}/review-layered.png`);
  for (const dpr of [1, 2, 3]) {
    await viewport(1440, 1000, dpr);
    await inspectStates(
      `review-320-d${dpr}`,
      dpr === 2 ? "review-large-eyes" : null
    );
  }
  await select("neutral");
  await b.evaluate(
    "[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Test blink').click()"
  );
  await waitFor(`${expression}==='blink'`, "discrete blink frame");
  const blink = await measure();
  results.push({ name: "One-shot discrete blink", ...blink });
  check(
    "Blink keeps body and eye node",
    blink.stableBody && blink.stableEyeNode
  );
  await waitFor(`${expression}==='neutral'`, "blink returns to neutral");
  check("Blink returns without body remount", (await measure()).stableBody);

  // Integer source-to-display reduction factors are diagnostic sizes only.
  for (const dpr of [1, 2]) {
    await viewport(1440, 1000, dpr);
    for (const size of [114, 209]) {
      await b.evaluate(
        `${hero}.style.width='${size}px';${hero}.style.height='${size}px';true`
      );
      await inspectStates(`integer-reduction-${size}-d${dpr}`, "scaling-eyes");
    }
  }

  for (const dpr of [1, 2, 3]) {
    await viewport(390, 1000, dpr);
    await navigate("/companion-prototype?companion=pixel-layered&eyes=neutral");
    await b.evaluate(
      `${hero}.closest('section').scrollIntoView({block:'start'});true`
    );
    await inspectStates(
      `review-260-d${dpr}`,
      dpr === 2 ? "review-mobile-eyes" : null
    );
  }
  for (const [width, height] of [
    [1440, 1000],
    [820, 1180],
    [390, 844],
    [320, 740],
  ]) {
    for (const dpr of [1, 2, 3]) {
      await viewport(width, height, dpr);
      await navigate("/?companion=pixel-layered&eyes=neutral");
      await inspectStates(
        `landing-${width}-d${dpr}`,
        width === 390 ? "landing-small-eyes" : null
      );
      if (
        ((width === 1440 || width === 820) && dpr === 2) ||
        (width === 320 && dpr === 3)
      )
        await b.screenshot(`${out}/landing-${width}.png`);
    }
  }
  // Static diagnostic offsets use the actual traveler, with no app/source edits.
  const phases = [];
  for (const dpr of [1, 2, 3]) {
    await viewport(390, 844, dpr);
    await navigate("/?companion=pixel-layered&eyes=neutral");
    await b.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sleep(100);
    await b.evaluate(
      `(()=>{const t=document.querySelector('[data-journey-traveler]'),r=${canvas}.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(t).transform);window.qaTravel={t,original:t.style.transform,x:m.m41+Math.round(r.x*devicePixelRatio)/devicePixelRatio-r.x,y:m.m42+Math.round(r.y*devicePixelRatio)/devicePixelRatio-r.y};})()`
    );
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      await b.evaluate(
        `(()=>{const a=window.qaTravel;a.t.style.transform='translate3d('+(a.x+${phase}/devicePixelRatio)+'px,'+(a.y+${phase}/devicePixelRatio)+'px,0)';})()`
      );
      const m = await measure();
      const png = await captureCrop(m.host.rect, 4);
      phases.push({ dpr, phaseDevicePixels: phase, png });
      results.push({
        name: `Fractional traveler DPR${dpr} phase${phase}`,
        ...m,
      });
    }
    await b.evaluate(
      "window.qaTravel.t.style.transform=window.qaTravel.original"
    );
    await b.send("Emulation.setEmulatedMedia", { features: [] });
  }
  await sheet("fractional-phases", phases, 4);
  await inspectSampling(phases);
  for (const dpr of [1, 2, 3]) {
    await viewport(390, 844, dpr);
    await navigate("/?companion=pixel-layered&eyes=neutral");
    const moving = await b.evaluate(
      `new Promise(resolve=>{window.scrollTo({top:scrollY+320,behavior:'instant'});const samples=[];let start;const frame=t=>{start??=t;const r=${canvas}.getBoundingClientRect();samples.push({ms:t-start,x:r.x,y:r.y,physicalXFraction:r.x*devicePixelRatio-Math.round(r.x*devicePixelRatio),physicalYFraction:r.y*devicePixelRatio-Math.round(r.y*devicePixelRatio),bodyStable:window.qaBody===${layer("body")}});if(t-start<700)requestAnimationFrame(frame);else resolve(samples);};window.qaBody=${layer("body")};requestAnimationFrame(frame);})`
    );
    results.push({
      name: `Device-pixel snapped scroll travel DPR${dpr}`,
      samples: moving,
    });
    check(
      `Travel origin stays on device pixels DPR${dpr}`,
      moving
        .slice(2)
        .every(
          (sample) =>
            Math.abs(sample.physicalXFraction) < 0.02 &&
            Math.abs(sample.physicalYFraction) < 0.02 &&
            sample.bodyStable
        )
    );
  }

  await b.evaluate(
    "(()=>{const u=new URL(location.href);u.searchParams.set('companion','pixel');history.replaceState(null,'',u);dispatchEvent(new PopStateEvent('popstate'));})()"
  );
  await waitFor(
    `${hero}?.querySelector('[data-pixel-variant="full"]')?.complete`,
    "Phase 1 restoration"
  );
  check(
    "Phase 1 full artwork still renders",
    await b.evaluate(
      `${hero}.querySelector('img').currentSrc.endsWith('/companions/sylf-pixel-companion.png')`
    )
  );
  await b.evaluate(
    "(()=>{const u=new URL(location.href);u.searchParams.delete('companion');history.replaceState(null,'',u);dispatchEvent(new PopStateEvent('popstate'));})()"
  );
  await waitFor(
    `${hero}?.dataset.sylfCompanion==='original'&&!!${hero}?.querySelector('svg')`,
    "SVG restoration"
  );
  check(
    "SVG restores without pixel layers",
    await b.evaluate(`!${hero}.querySelector('[data-pixel-layer]')`)
  );

  await onboardingFixture();
  for (const dpr of [1, 2, 3]) {
    await viewport(390, 1000, dpr);
    await navigate("/onboarding?companion=pixel-layered&eyes=neutral");
    await inspectStates(
      `onboarding-130-d${dpr}`,
      dpr === 2 ? "onboarding-eyes" : null
    );
    if (dpr === 2) await b.screenshot(`${out}/onboarding-layered.png`);
  }
  for (const [name, frames] of sheets) await sheet(name, frames);
  const exceptions = b.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params.exceptionDetails);
  results.push({ name: "Browser runtime exceptions", exceptions });
  check("No browser runtime exceptions", exceptions.length === 0);
} catch (error) {
  failure = String(error);
  results.push({ name: "Failure", error: failure });
  await b.screenshot(`${out}/qa-failure.png`).catch(() => {});
} finally {
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        base,
        createdAt: new Date().toISOString(),
        renderingContext:
          "Installed headless Chrome with emulated DPR/viewports; no physical-device hardware benchmark",
        registration,
        assets: [...assets.values()],
        results,
      },
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
      error: failure,
      out,
    },
    null,
    2
  )
);
if (failure) process.exitCode = 1;
