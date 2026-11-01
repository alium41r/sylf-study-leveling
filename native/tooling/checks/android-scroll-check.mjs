// A fair comparison of scrolling on a connected tablet, which Phase 6 could not make: every page is measured full screen, in the
// same orientation, with the same swipes, beside the Showcase as a control. Only a page taller than the screen can be measured,
// so a run that records too few frames is reported as invalid, never as a good number.
// Held in portrait, a full-screen Home page does not scroll at all, so --window=left,top,right,bottom measures every page in the
// same pop-up window instead. It changes no setting, and the comparison stays fair because the Showcase is in that window too.
// Usage: node tooling/checks/android-scroll-check.mjs --swipes=16 --window=40,150,1400,1000 --out=<file>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const swipes = Number(arg("swipes", "16"));
const out = arg("out");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN_FRAMES = 200;
const PAGES = [
  { name: "showcase-control", link: "sylf-native://showcase?chapter=controls&theme=signature&mode=dark" },
  { name: "home-today", link: "sylf-native://spaces?space=home&home=today&theme=signature&mode=dark" },
  { name: "home-focus", link: "sylf-native://spaces?space=home&home=focus&theme=signature&mode=dark" },
  { name: "home-circle", link: "sylf-native://spaces?space=home&home=circle&theme=signature&mode=dark" },
  { name: "home-progress", link: "sylf-native://spaces?space=home&home=progress&theme=signature&mode=dark" },
];

const size = /cur=(\d+)x(\d+)/.exec(adb("shell", "dumpsys", "window", "displays"));
const [width, height] = size ? [Number(size[1]), Number(size[2])] : [1600, 2560];
const rect = arg("window")?.split(",").map(Number) ?? null;
const [left, top, right, bottom] = rect ?? [0, 0, width, height];
const results = [];
if (rect) adb("shell", "am", "force-stop", PACKAGE);
adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, ...(rect ? ["--windowingMode", "5"] : []));
await sleep(3000);
if (rect) {
  const task = /#(\d+) type=standard A=\d+:app\.sylf\.client/.exec(adb("shell", "dumpsys", "activity", "activities"))?.[1];
  adb("shell", "cmd", "activity", "task", "resize", task, ...rect.map(String));
  await sleep(1200);
}
for (const page of PAGES) {
  adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"${page.link}"`, PACKAGE);
  await sleep(1800);
  adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
  const x = Math.round(left + (right - left) * 0.6);
  for (let i = 0; i < swipes; i++) {
    const [from, to] = i % 2 === 0 ? [0.78, 0.28] : [0.28, 0.78];
    adb("shell", "input", "swipe", String(x), String(Math.round(top + (bottom - top) * from)), String(x), String(Math.round(top + (bottom - top) * to)), "260");
    await sleep(240);
  }
  const text = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
  const read = (pattern) => Number(pattern.exec(text)?.[1] ?? 0);
  const frames = read(/Total frames rendered: (\d+)/);
  const janky = read(/Janky frames: (\d+)/);
  const entry = { page: page.name, valid: frames >= MIN_FRAMES, frames, janky, jankyPercent: frames ? +((janky / frames) * 100).toFixed(2) : null, p50: read(/50th percentile: (\d+)ms/), p90: read(/90th percentile: (\d+)ms/), p99: read(/99th percentile: (\d+)ms/) };
  console.log(JSON.stringify(entry));
  results.push(entry);
}
if (rect) { adb("shell", "am", "force-stop", PACKAGE); adb("shell", "am", "start", "-n", `${PACKAGE}/.MainActivity`, "--windowingMode", "1"); }
const report = { device: adb("shell", "getprop", "ro.product.model").trim(), width, height, window: rect, swipes, results };
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); }
console.log("SYLF_SCROLL_CHECK " + JSON.stringify({ size: `${width}x${height}`, results: results.map(({ page, valid, jankyPercent }) => ({ page, valid, jankyPercent })) }));
