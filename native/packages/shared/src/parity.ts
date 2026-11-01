// Cross-engine parity suite: hashes of shared Sylf computations that must be identical on V8 (Node and
// Electron/Chromium) and Hermes (Android/iOS). Values were first measured on all three engines in Phase 2;
// Phase 3 corrected the progression case (Phase 2 omitted getLevelProgress's level argument) and re-verified it.
import * as Y from "yjs";
import { appearance, calculator, inkGeometry, progression, timer, TimezoneService } from "./index";

export const PARITY_EXPECTED = {
  "progression.rewards": "c8ce4fb5",
  "appearance.tokens": "8b870931",
  calculator: "7384805d",
  timezone: "true|2026-10-31|Friday",
  "timer.snapshot": "4379c662",
  "ink.geometry": "a127da69",
  "yjs.roundTrip": "ok",
} as const;

export type ParityName = keyof typeof PARITY_EXPECTED;
export interface ParityResult { name: ParityName; value: string; ok: boolean }

/** FNV-1a over a string: deterministic and dependency-free on every engine. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

const canonical = (value: unknown) => JSON.stringify(value, (_k, x) => (typeof x === "number" ? Number(x.toPrecision(12)) : x));

/** A fixed synthetic stylus stroke in sylf-ink/1 sample tuples. */
export function fixedStroke(n = 240): [number, number, number, number, number, number, number, number][] {
  const out: [number, number, number, number, number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push([100 + 400 * t, 300 + 80 * Math.sin(t * 9), 0.2 + 0.7 * Math.sin(t * Math.PI), Math.round(t * 1800), 20 * Math.cos(t * 4), -15 * Math.sin(t * 3), 0, 0]);
  }
  return out;
}

export function runParitySuite(): ParityResult[] {
  const now = new Date("2026-10-30T12:00:00Z");
  const values: Record<ParityName, () => string> = {
    "progression.rewards": () => fnv1a(canonical([progression.calculateSessionRewards({ durationMinutes: 50, unlockedSkills: [] } as Parameters<typeof progression.calculateSessionRewards>[0]), progression.calculateLevelFromXp(123456), progression.getLevelProgress(98765, progression.calculateLevelFromXp(98765))])),
    "appearance.tokens": () => fnv1a(canonical([appearance.getAccentTokens("#7c5cff", "#101114"), appearance.getBackgroundTokens("#f5f1e8", "light"), appearance.getContrastRatio("#000000", "#ffffff")])),
    calculator: () => fnv1a(canonical([calculator.evaluateMath("sin(pi/6)+2^10-sqrt(16)"), calculator.evaluateMath("5!/3")])),
    timezone: () => [TimezoneService.validateTimezone("Asia/Karachi"), TimezoneService.getUserLocalDate("Pacific/Auckland", now), TimezoneService.getUserDayOfWeek("America/Los_Angeles", undefined, now)].join("|"),
    "timer.snapshot": () => fnv1a(canonical(timer.deriveTimer(timer.createInitialSnapshot(1_700_000_000_000), 1_700_000_900_000))),
    "ink.geometry": () => fnv1a(canonical(inkGeometry.inkGeometry(fixedStroke(), { tool: "pen", color: "#222222", width: 3, input: "pen", brush: "perfect-freehand/1.2.3:sylf-1", nib: "ballpoint" }))),
    "yjs.roundTrip": () => {
      const a = new Y.Doc(); a.getText("t").insert(0, "Sylf");
      const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      return b.getText("t").toString() === "Sylf" ? "ok" : "mismatch";
    },
  };
  return (Object.keys(values) as ParityName[]).map((name) => {
    let value: string;
    try { value = values[name](); } catch (error) { value = `error: ${String((error as Error)?.message ?? error)}`; }
    return { name, value, ok: value === PARITY_EXPECTED[name] };
  });
}
