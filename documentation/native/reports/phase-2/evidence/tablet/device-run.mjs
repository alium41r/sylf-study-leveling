// Automated Galaxy Tab S9 FE measurements over ADB for the Phase 2 spike. Usage: node device-run.mjs <step...>
// Steps: info install startup engine pdf richtext panels memory sqlite
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "study.sylf.spike", ACT = `${PKG}/.MainActivity`;
const APK = new URL("../spike-app/android/app/build/outputs/apk/release/app-release.apk", import.meta.url).pathname;
const OUT = new URL("./device-results.json", import.meta.url).pathname;
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 64 << 20 });
const sh = (cmd) => adb("shell", cmd);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clearLog = () => adb("logcat", "-c");
const jsLines = () => adb("logcat", "-d", "-v", "raw", "-s", "ReactNativeJS:V").split("\n").map((l) => l.trim()).filter(Boolean);
const find = (prefix) => jsLines().filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim());
const open = (screen, mode) => sh(`am start -W -a android.intent.action.VIEW -d "sylfspike://screen/${screen}${mode ? `?mode=${mode}` : ""}" ${PKG}`);
const stop = () => sh(`am force-stop ${PKG}`);
const gfx = () => { const t = sh(`dumpsys gfxinfo ${PKG}`); const g = (re) => (re.exec(t) || [])[1]; return { totalFrames: +g(/Total frames rendered: (\d+)/), janky: g(/Janky frames: ([^\n]+)/), p50: g(/50th percentile: (\d+ms)/), p90: g(/90th percentile: (\d+ms)/), p95: g(/95th percentile: (\d+ms)/), p99: g(/99th percentile: (\d+ms)/), missedVsync: +g(/Number Missed Vsync: (\d+)/), slowUi: +g(/Number Slow UI thread: (\d+)/), slowDraw: +g(/Number Slow issue draw commands: (\d+)/) }; };
const pss = () => { const t = sh(`dumpsys meminfo ${PKG}`); const m = /TOTAL PSS:\s+(\d+)/.exec(t) || /TOTAL\s+(\d+)/.exec(t); const j = /Java Heap:\s+(\d+)/.exec(t), n = /Native Heap:\s+(\d+)/.exec(t), gr = /Graphics:\s+(\d+)/.exec(t); return { totalPssMB: m ? Math.round(+m[1] / 1024) : null, javaHeapMB: j ? Math.round(+j[1] / 1024) : null, nativeHeapMB: n ? Math.round(+n[1] / 1024) : null, graphicsMB: gr ? Math.round(+gr[1] / 1024) : null }; };

const steps = {
  info() {
    results.device = { model: sh("getprop ro.product.model").trim(), android: sh("getprop ro.build.version.release").trim(), sdk: sh("getprop ro.build.version.sdk").trim(), oneUi: sh("getprop ro.build.version.oneui").trim(), soc: sh("getprop ro.soc.model").trim(), display: sh("wm size").trim() + " / " + sh("wm density").trim(), refresh: (/mRefreshRate=([\d.]+)/.exec(sh("dumpsys display")) || [])[1] };
    console.log(results.device);
  },
  install() { console.log(adb("install", "-r", "-d", APK)); results.apkBytes = fs.statSync(APK).size; },
  async startup() {
    const runs = [];
    for (let i = 0; i < 5; i++) { stop(); await sleep(1500); sh("am kill-all"); clearLog(); const o = open("panels"); const total = +(/TotalTime: (\d+)/.exec(o) || [])[1]; await sleep(2500); const ready = find("SPIKE_READY")[0]; runs.push({ totalTimeMs: total, jsReady: ready }); }
    results.startup = { coldStartRuns: runs, medianTotalTimeMs: runs.map((r) => r.totalTimeMs).sort((a, b) => a - b)[2] };
    console.log(results.startup);
  },
  async engine() { stop(); clearLog(); open("engine"); await sleep(5000); results.engine = JSON.parse(find("ENGINE")[0] || "null"); results.deviceInfo = JSON.parse(find("DEVICE")[0] || "null"); results.engineMemory = pss(); console.log(JSON.stringify(results.engine?.results?.map((r) => [r.name, r.ok, r.value ?? r.error]))); },
  async pdf() { stop(); clearLog(); open("pdf"); await sleep(5000); results.pdf = JSON.parse(find("PDF")[0] || "null"); console.log(results.pdf); },
  async richtext() { stop(); clearLog(); open("richtext"); await sleep(9000); results.richtext = { dom: find("RICHTEXT_DOM"), bridge: find("RICHTEXT_BRIDGE"), memory: pss() }; console.log(results.richtext); },
  async panels() {
    stop(); open("panels-stress"); await sleep(2000); sh(`dumpsys gfxinfo ${PKG} reset`); await sleep(10000);
    results.panelsStress = { gfx: gfx(), memory: pss() };
    // Touch drags on a panel header and its resize grip (adb input generates finger events).
    stop(); open("panels"); await sleep(2500); sh(`dumpsys gfxinfo ${PKG} reset`);
    const size = /(\d+)x(\d+)/.exec(sh("wm size")); const scale = 1; // input coordinates are physical pixels
    for (let i = 0; i < 6; i++) { sh(`input swipe 300 264 1500 900 900`); sh(`input swipe 1500 900 300 264 900`); }
    results.panelsDragUi = sh("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml").split(">").filter((l) => /text="Notes"/.test(l)).map((l) => (/bounds="([^"]+)"/.exec(l) || [])[1]);
    results.panelsDrag = { gfx: gfx(), screen: size?.[0] };
    console.log(results.panelsStress, results.panelsDrag);
  },
  async sqlite(rounds = 25) {
    stop(); clearLog(); open("sqlite", "reset"); await sleep(3000);
    const log = []; let lost = 0, partial = 0, digest = 0, integrity = 0, gaps = 0, acked = 0;
    for (let r = 0; r < rounds; r++) {
      stop(); clearLog(); open("sqlite", "write"); await sleep(1500 + Math.random() * 2500);
      sh(`am force-stop ${PKG}`); // abrupt process kill
      const acks = find("SQLACK").map((l) => +l.split(" ")[0]); const maxAck = acks.length ? Math.max(...acks) : 0; acked += acks.length;
      const lat = find("SQLLAT").slice(-1)[0];
      clearLog(); open("sqlite", "verify"); let v = null; for (let w = 0; w < 60 && !v; w++) { await sleep(500); v = JSON.parse(find("SQLVERIFY")[0] || "null"); }
      if (!v) { log.push({ r, error: "no verify output" }); continue; }
      if (v.maxSeq < maxAck) lost++; if (v.partial) partial++; if (v.digestMismatch) digest++; if (v.integrity !== "ok") integrity++; if (!v.contiguous || v.head !== v.maxSeq) gaps++;
      log.push({ r, maxAck, rows: v.rows, maxSeq: v.maxSeq, verifyMs: v.verifyMs, lat });
      process.stdout.write(`round ${r} maxAck=${maxAck} maxSeq=${v.maxSeq} ${lat || ""}\n`);
    }
    results.sqlite = { rounds, ackedLines: acked, roundsWithLostAck: lost, roundsWithPartial: partial, roundsWithDigestMismatch: digest, integrityFailures: integrity, roundsWithGaps: gaps, log };
    console.log(results.sqlite);
  },
  memory() { results.memoryNow = pss(); console.log(results.memoryNow); },
};
for (const s of process.argv.slice(2)) { await steps[s](); save(); }
