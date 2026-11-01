// Runs unmodified Sylf lib/ modules plus runtime capability probes. Same code on V8 (Node) and Hermes (device).
import * as Y from "yjs";
import { calculateSessionRewards, calculateLevelFromXp, getLevelProgress } from "../../../../lib/game-engine";
import { getAccentTokens, getBackgroundTokens, getContrastRatio } from "../../../../lib/color-utils";
import { evaluateMath } from "../../../../lib/calculator/math-engine";
import { TimezoneService } from "../../../../lib/timezone-service";
import { createInitialSnapshot, deriveTimer } from "../../../../lib/timer-engine";
import { inkSampleSchema, DEFAULT_PAPER } from "../../../../lib/notes/ink";
import { inkGeometry } from "../../../../lib/notes/ink-geometry";
import { orderedRevisions } from "../../../../lib/notes/graph";
import { getStroke } from "perfect-freehand";

type Result = { name: string; ok: boolean; value?: unknown; error?: string; ms?: number };

// FNV-1a over a canonical string; deterministic and dependency-free across engines.
export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const num = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" ? Number(x.toPrecision(12)) : x));

function run(name: string, fn: () => unknown): Result {
  const t0 = Date.now();
  try { return { name, ok: true, value: fn(), ms: Date.now() - t0 }; }
  catch (e) { return { name, ok: false, error: String((e as Error)?.message || e).slice(0, 200), ms: Date.now() - t0 }; }
}

// A fixed synthetic stylus stroke in sylf-ink/1 sample tuples.
export function fixedStroke(n = 240) {
  const out: [number, number, number, number, number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push([100 + 400 * t, 300 + 80 * Math.sin(t * 9), 0.2 + 0.7 * Math.sin(t * Math.PI), Math.round(t * 1800), 20 * Math.cos(t * 4), -15 * Math.sin(t * 3), 0, 0]);
  }
  return out;
}

export function runEngineTests(): { engine: string; results: Result[] } {
  const g = globalThis as Record<string, any>;
  const engine = g.HermesInternal ? `hermes ${JSON.stringify(g.HermesInternal?.getRuntimeProperties?.() ?? {}).slice(0, 160)}` : `v8/${typeof process !== "undefined" ? process.version : "?"}`;
  const fixedNow = new Date("2026-10-30T12:00:00Z");
  const results: Result[] = [
    run("api.nativeRuntimeBeforePolyfill", () => g.__nativeRuntime ?? "n/a"),
    // Runtime capability probes relevant to shared Sylf code (after the minimal crypto polyfill).
    run("api.crypto.subtle", () => typeof g.crypto?.subtle?.encrypt),
    run("api.crypto.randomUUID", () => typeof g.crypto?.randomUUID),
    run("api.crypto.getRandomValues", () => typeof g.crypto?.getRandomValues),
    run("api.TextEncoder", () => new TextEncoder().encode("π✓").length),
    run("api.TextDecoder", () => new TextDecoder().decode(new Uint8Array([0xcf, 0x80]))),
    run("api.structuredClone", () => typeof g.structuredClone),
    run("api.ReadableStream", () => typeof g.ReadableStream),
    run("api.BroadcastChannel", () => typeof g.BroadcastChannel),
    run("api.navigator.locks", () => typeof g.navigator?.locks),
    run("api.indexedDB", () => typeof g.indexedDB),
    run("api.Intl.timeZone", () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "short", timeStyle: "short" }).format(fixedNow)),
    run("api.Intl.resolvedTZ", () => Intl.DateTimeFormat().resolvedOptions().timeZone),
    run("api.Intl.formatToParts.weekday", () => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(fixedNow)),
    // Unmodified Sylf modules.
    run("sylf.game-engine.rewards", () => fnv(num([calculateSessionRewards({ durationMinutes: 50, unlockedSkills: [] } as any), calculateLevelFromXp(123456), getLevelProgress(98765)]))),
    run("sylf.color-utils.tokens", () => fnv(num([getAccentTokens("#7c5cff", "#101114"), getBackgroundTokens("#f5f1e8", "light"), getContrastRatio("#000000", "#ffffff")]))),
    run("sylf.calculator", () => fnv(num([evaluateMath("sin(pi/6)+2^10-sqrt(16)"), evaluateMath("5!/3")]))),
    run("sylf.timezone-service", () => [TimezoneService.validateTimezone("Asia/Karachi"), TimezoneService.getUserLocalDate("Pacific/Auckland", fixedNow), TimezoneService.getUserDayOfWeek("America/Los_Angeles", undefined, fixedNow)].join("|")),
    run("sylf.timer-engine", () => fnv(num(deriveTimer(createInitialSnapshot(1_700_000_000_000), 1_700_000_900_000)))),
    run("sylf.notes.ink.schema", () => fixedStroke(64).every((s) => inkSampleSchema.safeParse(s).success) && DEFAULT_PAPER.spacing),
    run("sylf.notes.ink-geometry", () => fnv(num(inkGeometry(fixedStroke() as any, { tool: "pen", color: "#222222", width: 3, input: "pen", brush: "perfect-freehand/1.2.3:sylf-1", nib: "ballpoint" } as any)))),
    run("sylf.notes.graph", () => typeof orderedRevisions),
    // Geometry determinism for the web brush (same options as inkOutline for a ballpoint pen).
    run("perfect-freehand.outline", () => {
      const pts = fixedStroke().map((p) => [p[0], p[1], p[2]]);
      const o = getStroke(pts, { size: 3, thinning: 0.45, smoothing: 0.65, streamline: 0.221, simulatePressure: false, last: true, start: { cap: true }, end: { cap: true } });
      return `${o.length}:${fnv(num(o))}`;
    }),
    // Yjs throughput on this engine: 400 blocks x 250 chars, then apply into a fresh doc.
    run("yjs.build+encode", () => {
      const d = new Y.Doc(); const grp = new Y.XmlElement("blockGroup"); d.getXmlFragment("body").insert(0, [grp]);
      d.transact(() => { for (let i = 0; i < 400; i++) { const bc = new Y.XmlElement("blockContainer"); bc.setAttribute("id", "b" + i); const p = new Y.XmlElement("paragraph"); const t = new Y.XmlText(); t.insert(0, "x".repeat(250)); p.insert(0, [t]); bc.insert(0, [p]); grp.insert(i, [bc]); } });
      const u = Y.encodeStateAsUpdate(d); const t0 = Date.now(); const c = new Y.Doc(); Y.applyUpdate(c, u);
      return { bytes: u.length, applyMs: Date.now() - t0 };
    }),
    run("yjs.typing.1000", () => {
      const d = new Y.Doc(); const t = d.getText("t"); let bytes = 0; d.on("update", (u: Uint8Array) => (bytes += u.length));
      const t0 = Date.now(); for (let i = 0; i < 1000; i++) t.insert(i, "a"); return { ms: Date.now() - t0, bytes };
    }),
  ];
  return { engine, results };
}
