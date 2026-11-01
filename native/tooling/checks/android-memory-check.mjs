// Tells retained memory from cache growth on a connected Android device. Repeats a deep-link sweep and records the
// meminfo categories after each cycle, then idles and asks the app to trim. Growth that levels off is a cache; growth that
// repeats every cycle is a leak. Usage: node android-memory-check.mjs [--cycles=4] [--sweep=full|themes|chapters|studio|spaces|workspace|world|spaceThemes|homeThemes|everySpace|destinations|homeEntry|workspaceEntry|workspaceZoom|workspaceTools|workspaceCamera|workspaceLayouts|homeThemeDestinations] [--rest-every=6] [--wait=1100] [--trim=RUNNING_LOW,COMPLETE] [--finish=space=home] [--budget-native=mb] [--out=file]
// --budget-native fails the run when native heap at the last rest is that many MB above the first rest, which is how Home's
// memory stays a regression check and not a one-time measurement.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const cycles = Number(arg("cycles", "4"));
const sweep = arg("sweep", "full");
const out = arg("out");
const restEvery = Number(arg("rest-every", "0"));
const wait = Number(arg("wait", "1100"));
const budgetNative = arg("budget-native");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = (query) => adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://${query.includes("space=") ? "spaces" : "showcase"}?${query}"`, PACKAGE);

const THEMES = ["signature", "studio", "arcane", "voxel", "cozy", "student"];
const LINKS = {
  full: THEMES.flatMap((theme) => ["light", "dark"].flatMap((mode) => ["studio", "controls"].map((chapter) => `chapter=${chapter}&theme=${theme}&mode=${mode}`))),
  // One heavy chapter's worth of theme changes, against chapter changes in one theme.
  themes: THEMES.flatMap((theme) => ["light", "dark"].map((mode) => `chapter=identity&theme=${theme}&mode=${mode}`)),
  chapters: ["studio", "controls", "icons", "color", "type", "fields", "layout", "personalities", "motion", "overlays", "feedback", "identity"].map((chapter) => `chapter=${chapter}&theme=signature&mode=dark`),
  studio: THEMES.map((theme) => `chapter=studio&theme=${theme}&mode=dark`),
  // The shell alone: each Space in one theme, then one Space across every theme and mode.
  spaces: ["home", "workspace", "world", "workspace", "home", "world"].map((space) => `space=${space}&theme=signature&mode=dark`),
  workspace: ["home", "workspace", "home", "workspace", "home", "workspace"].map((space) => `space=${space}&theme=signature&mode=dark`),
  world: ["home", "world", "home", "world", "home", "world"].map((space) => `space=${space}&theme=signature&mode=dark`),
  spaceThemes: THEMES.flatMap((theme) => ["light", "dark"].map((mode) => `space=workspace&theme=${theme}&mode=${mode}`)),
  homeThemes: THEMES.flatMap((theme) => ["light", "dark"].map((mode) => `space=home&theme=${theme}&mode=${mode}`)),
  // Home alone: moving between destinations, then Home mounting and unmounting with every destination visited.
  destinations: ["focus", "circle", "progress", "today"].map((home) => `space=home&home=${home}&theme=signature&mode=dark`),
  homeEntry: ["workspace", "home"].flatMap((space) => (space === "home" ? ["today", "focus", "circle", "progress"].map((home) => `space=home&home=${home}&theme=signature&mode=dark`) : [`space=workspace&theme=signature&mode=dark`])),
  homeThemeDestinations: THEMES.flatMap((theme) => ["light", "dark"].flatMap((mode) => ["today", "focus", "circle", "progress"].map((home) => `space=home&home=${home}&theme=${theme}&mode=${mode}`))),
  // Workspace: entering with tools open, opening and closing tools, moving the camera through overview, and changing presets.
  workspaceEntry: ["home", "workspace"].map((space) => `space=${space}&theme=signature&mode=dark`),
  workspaceTools: ["notes,pdfs,calculator,planner", "calendar,sylvie,timer,audio"].flatMap((tools) => [`space=workspace&wsClear=1&wsOpen=${tools}&theme=signature&mode=dark`, "space=workspace&wsClear=1"]),
  workspaceCamera: [1, 0.3, 1, 0.6, 1.5, 0.3].map((zoom) => `space=workspace&wsZoom=${zoom}&theme=signature&mode=dark`),
  workspaceZoom: ["space=workspace&wsClear=1&wsOpen=notes,calculator,timer&theme=signature&mode=dark", ...[0.3, 1, 0.6, 1.5, 0.45, 1].map((zoom) => `space=workspace&wsZoom=${zoom}&theme=signature&mode=dark`)],
  workspaceLayouts: ["focus", "split", "assistant", "free"].map((layout) => `space=workspace&wsLayout=${layout}&theme=signature&mode=dark`),
  everySpace: THEMES.flatMap((theme) => ["light", "dark"].flatMap((mode) => ["home", "workspace", "world"].map((space) => `space=${space}&theme=${theme}&mode=${mode}`))),
}[sweep];

function sample(label) {
  const text = adb("shell", "dumpsys", "meminfo", PACKAGE);
  const kb = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const row = (name) => Number(new RegExp(`^\\s*${name}\\s+(\\d+)`, "m").exec(text)?.[1] ?? 0);
  const mb = (value) => +(value / 1024).toFixed(1);
  const entry = {
    label,
    totalPss: mb(kb("TOTAL PSS")), javaHeap: mb(kb("Java Heap")), nativeHeap: mb(kb("Native Heap")), code: mb(kb("Code")), stack: mb(kb("Stack")), graphics: mb(kb("Graphics")), privateOther: mb(kb("Private Other")), system: mb(kb("System")),
    egl: mb(row("EGL mtrack")), gl: mb(row("GL mtrack")), unknown: mb(row("Unknown")), otherMmap: mb(row("Other mmap")), views: Number(/Views:\s+(\d+)/.exec(text)?.[1] ?? 0),
  };
  console.log(JSON.stringify(entry));
  return entry;
}

const samples = [];
adb("logcat", "-c", "-b", "crash");
adb("shell", "am", "force-stop", PACKAGE);
await sleep(1000);
adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`);
await sleep(4000);
samples.push(sample("launch"));
for (let cycle = 1; cycle <= cycles; cycle++) {
  for (const query of LINKS) { link(query); await sleep(wait); }
  samples.push(sample(`cycle-${cycle}`));
  // With --rest-every, memory after each idle shows what stays once the collector has caught up.
  if (restEvery && cycle % restEvery === 0 && cycle < cycles) { await sleep(30000); samples.push(sample(`rest-after-${cycle}`)); }
}
// --finish opens a last link, such as leaving the Showcase for the Spaces, before the final samples.
if (arg("finish")) link(arg("finish"));
await sleep(30000);
samples.push(sample("idle-30s"));
for (const level of arg("trim", "RUNNING_LOW").split(",")) {
  adb("shell", "am", "send-trim-memory", PACKAGE, level);
  await sleep(5000);
  samples.push(sample(`trim-${level}`));
}
const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
const rests = samples.filter((entry) => entry.label.startsWith("rest-after-"));
const nativeGrowth = rests.length > 1 ? +(rests.at(-1).nativeHeap - rests[0].nativeHeap).toFixed(1) : null;
const report = { sweep, cycles, device: adb("shell", "getprop", "ro.product.model").trim(), crashed, nativeGrowth, budgetNative: budgetNative ? Number(budgetNative) : null, samples };
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); }
console.log("SYLF_MEMORY_CHECK " + JSON.stringify({ sweep, crashed, nativeGrowth, first: samples[0].totalPss, last: samples.at(-1).totalPss }));
if (crashed || (budgetNative && nativeGrowth !== null && nativeGrowth > Number(budgetNative))) process.exit(1);
