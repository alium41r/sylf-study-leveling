// Android device smoke check: installs the release APK on the connected device, cold-starts it, and
// asserts the SYLF_FOUNDATION report (native runtime, shared-code parity). Usage: node android-smoke.mjs [--runs=3]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const PACKAGE = "app.sylf.client";
const APK = path.resolve(import.meta.dirname, "../../apps/sylf/android/app/build/outputs/apk/release/app-release.apk");
const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 3);
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(APK)) { console.error(`Missing ${APK}. Run "npm run android:build" first.`); process.exit(1); }
const device = adb("devices").split("\n").slice(1).find((l) => /\tdevice$/.test(l));
if (!device) { console.error("No authorized Android device connected (adb devices)."); process.exit(1); }

adb("install", "-r", "-d", APK);
const cold = [];
let foundation = null;
for (let i = 0; i < runs; i++) {
  adb("shell", "am", "force-stop", PACKAGE);
  await sleep(1200);
  adb("logcat", "-c");
  const out = adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`);
  cold.push(Number(/TotalTime: (\d+)/.exec(out)?.[1]));
  for (let wait = 0; wait < 20 && !foundation; wait++) {
    await sleep(500);
    const line = adb("logcat", "-d", "-v", "raw", "-s", "ReactNativeJS:V").split("\n").find((l) => l.startsWith("SYLF_FOUNDATION "));
    if (line) foundation = JSON.parse(line.slice("SYLF_FOUNDATION ".length));
  }
}
const memory = /TOTAL PSS:\s+(\d+)/.exec(adb("shell", "dumpsys", "meminfo", PACKAGE))?.[1];
const checks = {
  foundationReported: foundation !== null,
  nativeRuntime: foundation?.capabilities?.runtime === "native",
  sharedCodeParity: foundation?.parity?.passed === true,
  cryptoAdapter: foundation?.crypto?.sha256 === "a37f0c24a67f8fdbde80175e2ecad8adc386569d9c490209023d0d2443edec23",
};
const sorted = cold.filter(Number.isFinite).sort((a, b) => a - b);
const result = {
  passed: Object.values(checks).every(Boolean),
  checks,
  device: { model: adb("shell", "getprop", "ro.product.model").trim(), android: adb("shell", "getprop", "ro.build.version.release").trim() },
  coldStartMs: { runs: cold, median: sorted[Math.floor(sorted.length / 2)] },
  totalPssMb: memory ? Math.round(Number(memory) / 1024) : null,
  apkMb: +(fs.statSync(APK).size / 1048576).toFixed(1),
  foundation,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
