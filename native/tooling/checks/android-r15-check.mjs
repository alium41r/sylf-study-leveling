// Runs the bare memory probe for risk R15 on a connected tablet and samples native memory, so the question from Phase 5 can be
// answered: does native heap grow with mounts in plain React Native, with nothing of Sylf's in the tree? Prepare a build first:
//   EXPO_PUBLIC_SYLF_R15=1 npm run android:build && npm run android:install
// then: node tooling/checks/android-r15-check.mjs --scenario=views --minutes=6 --out=<file>
// Each sample is a meminfo reading with the probe at a known cycle count. Reinstall the normal build afterwards.
// With --in-app the same probe runs inside the full app through the development link, for comparison.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const scenario = arg("scenario", "views");
const minutes = Number(arg("minutes", "6"));
const every = Number(arg("every", "30"));
const out = arg("out");
const inApp = process.argv.includes("--in-app");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sample(label) {
  const text = adb("shell", "dumpsys", "meminfo", PACKAGE);
  const kb = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const mb = (value) => +(value / 1024).toFixed(1);
  const entry = { label, totalPss: mb(kb("TOTAL PSS")), nativeHeap: mb(kb("Native Heap")), javaHeap: mb(kb("Java Heap")), graphics: mb(kb("Graphics")), views: Number(/Views:\s+(\d+)/.exec(text)?.[1] ?? 0) };
  console.log(JSON.stringify(entry));
  return entry;
}

const focus = adb("shell", "dumpsys", "window").split("\n").find((line) => line.includes("mCurrentFocus")) ?? "";
if (focus.includes("Avast") || focus.toLowerCase().includes("packageinstaller") || focus.toLowerCase().includes("playprotect")) {
  console.log("SYLF_R15_CHECK " + JSON.stringify({ passed: false, error: `A dialog holds the screen, and it is the owner's to answer: ${focus.trim()}` }));
  process.exit(2);
}

adb("logcat", "-c");
adb("logcat", "-c", "-b", "crash");
adb("shell", "am", "force-stop", PACKAGE);
await sleep(1000);
adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?r15=${scenario}"`, PACKAGE);
await sleep(5000);
const samples = [sample("start")];
for (let elapsed = every; elapsed <= minutes * 60; elapsed += every) {
  await sleep(every * 1000);
  samples.push(sample(`${elapsed}s`));
}
// Stopping the probe from mounting shows what stays. A link to the idle scenario keeps the process and the sampling identical.
adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `"sylf-native://spaces?r15=idle"`, PACKAGE);
await sleep(30000);
samples.push(sample("idle-30s"));
adb("shell", "am", "send-trim-memory", PACKAGE, "RUNNING_LOW");
await sleep(5000);
samples.push(sample("trim"));

const log = adb("logcat", "-d", "-s", "ReactNativeJS:I").split("\n").filter((line) => line.includes("SYLF_R15 ")).at(-1) ?? null;
const crashed = adb("logcat", "-d", "-b", "crash").includes(PACKAGE);
const body = samples.filter((entry) => entry.label.endsWith("s") && entry.label !== "idle-30s");
const half = body[Math.floor(body.length / 2)];
const report = { scenario, inApp, minutes, device: adb("shell", "getprop", "ro.product.model").trim(), crashed, lastLog: log, nativeGrowthFirstToLast: +(body.at(-1).nativeHeap - body[0].nativeHeap).toFixed(1), nativeGrowthSecondHalf: +(body.at(-1).nativeHeap - half.nativeHeap).toFixed(1), samples };
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); }
console.log("SYLF_R15_CHECK " + JSON.stringify({ scenario, inApp, crashed, nativeGrowthFirstToLast: report.nativeGrowthFirstToLast, nativeGrowthSecondHalf: report.nativeGrowthSecondHalf, lastLog: log?.slice(-90) }));
if (crashed) process.exit(1);
