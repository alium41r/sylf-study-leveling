// Cross-engine parity suite: hashes of shared Sylf computations that must be identical on V8 (Node and
// Electron/Chromium) and Hermes (Android/iOS). Values were first measured on all three engines in Phase 2;
// Phase 3 corrected the progression case (Phase 2 omitted getLevelProgress's level argument) and re-verified it.
// planning.solve was measured on V8 (Node 22) on 13 November 2026; its Hermes and Chromium values are checked by the on-device parity run.
import * as Y from "yjs";
import { appearance, calculator, inkGeometry, planning, progression, timer, TimezoneService } from "./index";

export const PARITY_EXPECTED = {
  "progression.rewards": "c8ce4fb5",
  "appearance.tokens": "8b870931",
  calculator: "7384805d",
  timezone: "true|2026-10-31|Friday",
  "timer.snapshot": "4379c662",
  "ink.geometry": "a127da69",
  "yjs.roundTrip": "ok",
  "planning.solve": "3bb0f5f5",
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

/** A fixed fortnight with an exam, an essay, a class timetable, a daily cap and a pinned session. Exercises flow, placement and the local search. */
export function parityPlanningInput(): Parameters<typeof planning.solve>[0] {
  const today = "2026-11-23";
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = planning.addDays(today, i);
    const weekday = planning.weekdayOf(date);
    return { date, weekday, rest: weekday === 0 ? ("fixed" as const) : (false as const), windows: [[480, 1320]] as [number, number][], busy: weekday >= 1 && weekday <= 5 ? [{ start: 540, end: 660, title: "Lecture", kind: "class" as const, ref: null }, { start: 840, end: 900, title: "Lab", kind: "class" as const, ref: null }] : [], allDay: [] };
  });
  const item = (key: string, over: Partial<planning.WorkItem>): planning.WorkItem => ({ key, goal: null, title: key, kind: "learn", subject: 1, topics: [], est: [60, 80], chunk: [25, 45, 60], earliest: null, due: null, after: [], load: 2, method: "learn", source: "model", confidence: 0.7, done: 0, status: "open", questId: null, firstStep: null, note: null, ...over });
  const model: planning.WorkModel = {
    goals: [
      { key: "exam", ref: null, title: "Chem midterm", type: "exam", due: "2026-11-30", priority: 3, subject: 1, status: "active", draft: false, source: "model" },
      { key: "essay", ref: null, title: "History essay", type: "essay", due: "2026-12-04", priority: 2, subject: 2, status: "active", draft: false, source: "model" },
    ],
    items: [
      item("d", { goal: "exam", kind: "review", method: "diagnostic", est: [30, 40], chunk: [20, 30, 40] }),
      item("l1", { goal: "exam", method: "worked_examples", topics: [31], after: ["d"], load: 3 }),
      item("r1", { goal: "exam", kind: "practice", method: "retrieval", topics: [31], after: ["l1"], est: [30, 40], chunk: [20, 30, 45] }),
      item("r2", { goal: "exam", kind: "practice", method: "retrieval", topics: [31], after: ["r1"], est: [30, 40], chunk: [20, 30, 45] }),
      item("p", { goal: "exam", kind: "practice", method: "timed_paper", est: [90, 110], chunk: [60, 90, 120], after: ["r1"], load: 3 }),
      item("o", { goal: "essay", subject: 2, kind: "produce", method: "outline", est: [45, 60] }),
      item("w1", { goal: "essay", subject: 2, kind: "produce", method: "drafting", est: [120, 150], chunk: [45, 60, 90], after: ["o"], load: 3 }),
      item("v", { goal: "essay", subject: 2, kind: "produce", method: "revising", est: [60, 75], after: ["w1"] }),
    ],
    practices: [{ key: "sp", goal: null, title: "Practice: Spanish", subject: null, minutes: 20, days: [1, 3, 5], from: null, until: null, method: "practice", status: "active" }],
    constraints: [{ key: "cap", kind: "daily_cap", minutes: 180, hard: true, weight: 3, provenance: "student", label: "cap" }, { key: "pref", kind: "preferred_window", start: 1020, end: 1260, subject: 2, hard: false, weight: 3, provenance: "student", label: "essay evenings" }],
    assumptions: [], questions: [],
  };
  const snapshot: planning.PlanningSnapshot = { today, nowMinute: 420, timezone: "UTC", days, subjects: [], topics: [], calibration: { factors: {}, energy: planning.defaultEnergy(), capacity: 180, samples: 0 }, settings: { ...planning.DEFAULT_SETTINGS }, studiedToday: 0 };
  return { snapshot, model, blocks: [{ id: "pin", item: "o", date: "2026-11-25", start: 1140, end: 1185, state: "committed", pinned: true, questId: null }], seed: 7 };
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
    "planning.solve": () => { const result = planning.solve(parityPlanningInput()); return fnv1a(canonical([result.blocks.map((b) => [b.id, b.item, b.date, b.start, b.end]), result.unplaced, result.weekBudgets])); },
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
