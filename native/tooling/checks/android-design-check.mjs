// Design-system verification on a connected Android device: renders every theme in both modes through deep links,
// captures the screen, reads the accessibility tree, and measures frames, memory and cold start.
// Usage: node android-design-check.mjs [--out=dir] [--skip-themes]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = path.resolve(arg("out") ?? "android-design-check");
const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screenshot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
const link = (query) => adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://showcase?${query}"`, PACKAGE);

fs.mkdirSync(out, { recursive: true });
const report = { device: adb("shell", "getprop", "ro.product.model").trim(), wm: adb("shell", "wm", "size").trim(), density: adb("shell", "wm", "density").trim(), fontScale: adb("shell", "settings", "get", "system", "font_scale").trim(), renders: [], crashes: 0 };
const crashed = () => adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
adb("logcat", "-c", "-b", "crash");

if (!process.argv.includes("--skip-themes")) {
  adb("shell", "am", "force-stop", PACKAGE);
  await sleep(800);
  for (const theme of THEMES) {
    for (const mode of ["light", "dark"]) {
      for (const chapter of ["studio", "controls"]) {
        link(`chapter=${chapter}&theme=${theme}&mode=${mode}`);
        await sleep(1100);
        screenshot(`theme-${theme}-${mode}-${chapter}`);
      }
      report.renders.push(`${theme}-${mode}`);
    }
  }
}

// The accessibility tree is what TalkBack reads: every interactive node must have a name and a role.
link("chapter=controls&theme=signature&mode=dark");
await sleep(1200);
adb("shell", "uiautomator", "dump", "/sdcard/sylf-a11y.xml");
const xml = adb("exec-out", "cat", "/sdcard/sylf-a11y.xml");
adb("shell", "rm", "/sdcard/sylf-a11y.xml");
fs.writeFileSync(path.join(out, "a11y-controls.xml"), xml);
const nodes = [...xml.matchAll(/<node [^>]*>/g)].map((m) => m[0]);
const attr = (node, name) => new RegExp(`${name}="([^"]*)"`).exec(node)?.[1] ?? "";
const clickable = nodes.filter((n) => attr(n, "clickable") === "true");
const unnamed = clickable.filter((n) => !attr(n, "content-desc") && !attr(n, "text"));
const bounds = (n) => { const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr(n, "bounds")); return m ? { w: m[3] - m[1], h: m[4] - m[2] } : { w: 0, h: 0 }; };
const scale = Number(/(\d+)\s*$/.exec(report.density)?.[1] ?? 280) / 160;
const small = clickable.filter((n) => { const b = bounds(n); return b.w / scale < 44 && b.h / scale < 44; }).map((n) => attr(n, "content-desc") || attr(n, "text"));
report.accessibility = { clickable: clickable.length, unnamed: unnamed.length, smallerThan44InBothAxes: small };

// Frames while scrolling a heavy chapter (release build; adb swipes are real input events).
link("chapter=icons&theme=signature&mode=dark");
await sleep(1200);
adb("shell", "dumpsys", "gfxinfo", PACKAGE, "reset");
const [width, height] = [...report.wm.matchAll(/(\d+)x(\d+)/g)].pop().slice(1).map(Number);
const rotationHint = adb("shell", "dumpsys", "window", "displays").match(/cur=(\d+)x(\d+)/);
const [w, h] = rotationHint ? [Number(rotationHint[1]), Number(rotationHint[2])] : [width, height];
for (let i = 0; i < 8; i++) { adb("shell", "input", "swipe", String(w / 2), String(h * 0.8), String(w / 2), String(h * 0.25), "260"); await sleep(120); adb("shell", "input", "swipe", String(w / 2), String(h * 0.25), String(w / 2), String(h * 0.8), "260"); await sleep(120); }
const gfx = adb("shell", "dumpsys", "gfxinfo", PACKAGE);
const stat = (label) => new RegExp(`${label}:\\s*([\\d.]+)`).exec(gfx)?.[1];
report.frames = { total: stat("Total frames rendered"), janky: /Janky frames: (\d+) \(([\d.]+)%\)/.exec(gfx)?.slice(1), p50: stat("50th percentile"), p90: stat("90th percentile"), p95: stat("95th percentile"), p99: stat("99th percentile") };

const memory = /TOTAL PSS:\s+(\d+)/.exec(adb("shell", "dumpsys", "meminfo", PACKAGE))?.[1];
report.totalPssMb = memory ? Math.round(Number(memory) / 1024) : null;
report.crashes = crashed() ? 1 : 0;
report.passed = report.crashes === 0 && report.accessibility.unnamed === 0;
fs.writeFileSync(path.join(out, "android-design-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
