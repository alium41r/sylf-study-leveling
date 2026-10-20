import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import sharp from "sharp";
const { loadEnvConfig } = nextEnv;

// Reuse the repository's installed-Chrome/CDP helper without running its older QA.
const helper = readFileSync(
  new URL("./verify-landing-companion.mjs", import.meta.url),
  "utf8"
).split("// Uses the installed Chrome")[0];
const { browser, sleep } = await import(
  `data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`
);
const base = process.env.SYLF_QA_BASE ?? "http://127.0.0.1:3100";
const out = "documentation/pixel-companion/phase1";
const runtime = "public/companions/sylf-pixel-companion.png";
const svgOnly = process.env.SYLF_QA_SVG_ONLY === "1";
const provisionalOpaque = svgOnly && process.env.SYLF_QA_PROVISIONAL === "1";
if (!existsSync(runtime) && !svgOnly)
  throw new Error(`Runtime asset is not ready: ${runtime}`);
mkdirSync(out, { recursive: true });
const asset = existsSync(runtime) ? await sharp(runtime).metadata() : null;
let transparent = 0,
  opaque = 0,
  partial = 0;
if (asset) {
  const { data, info } = await sharp(runtime)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 3; p < data.length; p += info.channels) {
    if (data[p] === 0) transparent++;
    else if (data[p] === 255) opaque++;
    else partial++;
  }
}
const results = [];
const b = await browser();
const check = (name, passed) => {
  results.push({ name, passed: !!passed });
  if (!passed) throw new Error(name);
};
const viewport = (width, height, dpr = 1) =>
  b.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: width <= 700,
  });
const waitFor = async (expression, label) => {
  for (let n = 0; n < 100; n++) {
    if (await b.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
};
const hero = 'document.querySelector("[data-sylf-companion]")';
const click = async (text) => {
  await b.evaluate(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`
  );
  await sleep(120);
};
const measure = () =>
  b.evaluate(`(()=>{
  const host=${hero}, image=host.querySelector('img'), svg=host.querySelector('svg');
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const css=e=>{const s=getComputedStyle(e);return {width:s.width,height:s.height,transform:s.transform,filter:s.filter,imageRendering:s.imageRendering,objectFit:s.objectFit};};
  const ancestors=[];for(let e=host.parentElement;e&&ancestors.length<5;e=e.parentElement)ancestors.push({tag:e.tagName,class:e.className,rect:rect(e),...css(e)});
  const r=image?.getBoundingClientRect(), scale=image?Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight):null;
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},mode:host.dataset.sylfCompanion,state:host.dataset.state,motion:host.dataset.motion,
    host:{rect:rect(host),...css(host)},image:image?{rect:rect(image),...css(image),loaded:image.complete&&image.naturalWidth>0,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,src:image.currentSrc,containedArtwork:{width:image.naturalWidth*scale,height:image.naturalHeight*scale,sourceScale:scale}}:null,
    svg:!!svg,ancestors,overflow:document.documentElement.scrollWidth-innerWidth,
    gallery:{original:document.querySelectorAll('figure [data-sylf-companion="original"]').length,pixel:document.querySelectorAll('figure [data-sylf-companion="pixel"]').length}};
})()`);
const capture = async (name, extra = {}, saveScreenshot = true) => {
  const m = await measure();
  results.push({ name, ...extra, ...m });
  check(`${name}: no horizontal overflow`, m.overflow <= 0);
  if (m.mode === "pixel") {
    check(
      `${name}: loaded crisp contained raster`,
      m.image.loaded &&
        m.image.imageRendering === "pixelated" &&
        m.image.objectFit === "contain" &&
        !m.svg
    );
    check(
      `${name}: static unfiltered companion`,
      m.host.transform === "none" &&
        m.host.filter === "none" &&
        m.motion === "none"
    );
  }
  if (saveScreenshot) await b.screenshot(`${out}/${name}.png`);
  return m;
};
const navigate = async (path, mode) => {
  await b.navigate(`${base}${path}`);
  await waitFor(
    `${hero}?.dataset.sylfCompanion===${JSON.stringify(mode)} && (${JSON.stringify(mode)}!=='pixel'||(${hero}.querySelector('img')?.complete&&${hero}.querySelector('img')?.naturalWidth>0))`,
    path
  );
  await sleep(300);
  await b.evaluate(
    "document.querySelector('nextjs-portal')?.style.setProperty('display','none')"
  );
};
const onboardingFixture = async () => {
  // Local visual QA only: synthetic ID 0, an isolated ephemeral cookie, and a
  // client-side stats response. No account is read/created and no form is submitted.
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  if (!process.env.JWT_SECRET)
    throw new Error(
      "Local JWT_SECRET required for isolated onboarding visual fixture"
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
    source: `(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const u=new URL(input instanceof Request?input.url:String(input),location.href);
      if(u.origin===location.origin&&u.pathname==='/api/user/stats')return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(fixture))},{status:200,headers:{'Content-Type':'application/json'}}));
      const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      if(u.origin===location.origin&&u.pathname.startsWith('/api/')&&method!=='GET'&&method!=='HEAD')return Promise.reject(new Error('Visual QA blocks API mutations'));
      return original(input,init);
    };
  })()`,
  });
  results.push({
    name: "Onboarding auth fixture",
    method:
      "Synthetic user ID 0 JWT in isolated temporary Chrome profile; client stats response; non-read API requests blocked; no real user data or submissions",
  });
};
let failure;
try {
  if (!svgOnly)
    check(
      "Runtime asset has transparent and opaque pixels",
      asset.hasAlpha && transparent > 0 && opaque > 0
    );
  await viewport(1440, 1000);
  await navigate("/companion-prototype?phase1=qa", "original");
  check(
    "Existing review has all SVG galleries",
    (await measure()).gallery.original === 15
  );
  await capture("review-svg");
  await b.evaluate(
    `(()=>{const e=document.querySelector('#companion-state');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'READING');e.dispatchEvent(new Event('change',{bubbles:true}));})()`
  );
  await waitFor(
    `${hero}.dataset.state==='READING'`,
    "existing SVG state control"
  );
  check(
    "Existing SVG reading action still works",
    await b.evaluate(
      `${hero}.dataset.action==='READING'&&!!${hero}.querySelector('[data-part="book"]')`
    )
  );
  if (!svgOnly) {
    await click("New pixel companion");
    await waitFor(
      `${hero}.querySelector('img')?.complete&&${hero}.querySelector('img')?.naturalWidth>0`,
      "pixel toggle asset load"
    );
    const pixel = await capture("review-pixel");
    check(
      "SVG galleries remain available in pixel preview",
      pixel.gallery.original === 15 && pixel.gallery.pixel === 0
    );
    check(
      "SVG controls disabled only during static pixel preview",
      await b.evaluate(
        "document.querySelector('#companion-state').disabled&&document.querySelector('#companion-eye').disabled"
      )
    );
    check(
      "Toggle retains unrelated URL parameters",
      await b.evaluate(
        "new URLSearchParams(location.search).get('phase1')==='qa'&&new URLSearchParams(location.search).get('companion')==='pixel'"
      )
    );
    for (const size of [192, 288]) {
      await b.evaluate(
        `${hero}.style.width='${size}px';${hero}.style.height='${size}px'`
      );
      await capture(`review-grid-${size}`, {
        diagnostic: "Temporary DOM-only size override of existing review hero",
      });
    }
    await b.evaluate(
      `${hero}.style.removeProperty('width');${hero}.style.removeProperty('height')`
    );
    await click("Current SVG companion");
    await waitFor(`${hero}.dataset.sylfCompanion==='original'`, "restore SVG");
    check(
      "Toggle back restores SVG reading state and enabled controls",
      await b.evaluate(
        `${hero}.dataset.state==='READING'&&!!${hero}.querySelector('[data-part="book"]')&&!document.querySelector('#companion-state').disabled`
      )
    );
    await capture("review-restored-svg");
  }
  await viewport(390, 844, 2);
  await navigate(
    svgOnly ? "/companion-prototype" : "/companion-prototype?companion=pixel",
    svgOnly ? "original" : "pixel"
  );
  await capture(svgOnly ? "review-mobile-svg" : "review-mobile-pixel");

  // Existing landing traveler: every responsive breakpoint and narrow-phone case.
  for (const [width, height] of [
    [1440, 1000],
    [1024, 900],
    [820, 1180],
    [390, 844],
    [320, 740],
  ]) {
    for (const dpr of [1, 2, 3]) {
      await viewport(width, height, dpr);
      for (const mode of svgOnly ? ["original"] : ["original", "pixel"]) {
        await navigate(mode === "pixel" ? "/?companion=pixel" : "/", mode);
        const m = await capture(
          `landing-${width}-d${dpr}-${mode === "original" ? "svg" : "pixel"}`,
          {},
          width === 320 ? dpr === 3 : dpr === 2
        );
        check(
          `Landing ${width} DPR ${dpr} ${mode}: one visible traveler`,
          await b.evaluate(
            "document.querySelectorAll('[data-journey-traveler]').length===1&&getComputedStyle(document.querySelector('[data-journey-traveler]')).visibility==='visible'"
          )
        );
        if (mode === "pixel")
          check(
            `Landing ${width} DPR ${dpr}: no local raster deformation`,
            m.ancestors
              .filter((a) => a.tag === "DIV")
              .slice(0, 2)
              .every((a) => a.transform === "none")
          );
      }
    }
  }
  if (!svgOnly) {
    await viewport(1440, 1000, 2);
    await navigate("/?companion=pixel", "pixel");
    await b.evaluate(
      "(()=>{const e=document.querySelector('#focus [data-journey-stop]');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-innerHeight*.68);})()"
    );
    const moving = await b.evaluate(
      `new Promise(resolve=>{const samples=[];let start;const sample=t=>{start??=t;const e=document.querySelector('[data-journey-traveler]'),r=${hero}.getBoundingClientRect();samples.push({ms:t-start,x:r.x,y:r.y,transform:getComputedStyle(e).transform,localTransform:getComputedStyle(${hero}).transform});if(t-start<600)requestAnimationFrame(sample);else resolve(samples);};requestAnimationFrame(sample);})`
    );
    results.push({ name: "Moving pixel traveler (DPR 2)", samples: moving });
    await sleep(2600);
    await capture("landing-focus-pixel");
  }

  // Real onboarding Welcome header; no sign-up submission or preference changes.
  await onboardingFixture();
  for (const [width, height, dpr] of [
    [1440, 1000, 1],
    [1440, 1000, 2],
    [390, 844, 2],
    [320, 740, 3],
  ]) {
    await viewport(width, height, dpr);
    for (const mode of svgOnly ? ["original"] : ["original", "pixel"]) {
      await navigate(
        mode === "pixel" ? "/onboarding?companion=pixel" : "/onboarding",
        mode
      );
      const m = await capture(
        `onboarding-${width}-d${dpr}-${mode === "original" ? "svg" : "pixel"}`,
        {},
        dpr !== 1
      );
      check(
        `Onboarding ${width} ${mode}: existing 130px Welcome slot`,
        m.host.rect.width === 130 && m.host.rect.height === 130
      );
    }
  }
  if (provisionalOpaque) {
    results.push({
      name: "Provisional opaque layout inspection only",
      hasAlpha: asset?.hasAlpha,
      readiness:
        "Transparency validation pending; these snapshots cannot establish final pixel quality",
    });
    await viewport(390, 844, 2);
    await navigate("/?companion=pixel", "pixel");
    await capture("provisional-opaque-landing-390");
    await navigate("/onboarding?companion=pixel", "pixel");
    await capture("provisional-opaque-onboarding-390");
  }
  const exceptions = b.events
    .filter((e) => e.method === "Runtime.exceptionThrown")
    .map((e) => e.params.exceptionDetails);
  const assetResponses = b.events
    .filter(
      (e) =>
        e.method === "Network.responseReceived" &&
        e.params.response.url.includes("sylf-pixel-companion")
    )
    .map((e) => ({
      url: e.params.response.url,
      status: e.params.response.status,
      mimeType: e.params.response.mimeType,
    }));
  results.push({
    name: "Pixel runtime asset responses",
    responses: assetResponses,
  });
  check("No browser runtime exceptions", exceptions.length === 0);
  if (!svgOnly)
    check(
      "Pixel asset never returned an HTTP error",
      assetResponses.length > 0 && assetResponses.every((r) => r.status < 400)
    );
} catch (error) {
  failure = String(error);
  results.push({ name: "Failure", error: failure });
  await b.screenshot(`${out}/qa-failure.png`).catch(() => {});
} finally {
  writeFileSync(
    `${out}/${svgOnly ? "svg-baseline-results" : "results"}.json`,
    JSON.stringify(
      {
        base,
        createdAt: new Date().toISOString(),
        svgOnly,
        provisionalOpaque,
        renderingContext:
          "Installed headless Chrome with emulated CSS viewports and DPR; not a physical-device hardware benchmark",
        asset: asset
          ? {
              width: asset.width,
              height: asset.height,
              hasAlpha: asset.hasAlpha,
              transparent,
              opaque,
              partial,
            }
          : null,
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
