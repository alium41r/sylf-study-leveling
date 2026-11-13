// Calibration learns from what actually happened: how long this student really takes on a kind of work, which hours they finish what they start, and
// how much they sustain in a day. Estimates move only on repeated evidence (a log-normal ratio shrunk toward no change), which follows the conservative
// rule of the existing planner preferences. Nothing academic is stored: only minutes, subjects, kinds and hours.
import { round5 } from "./dates";
import type { Calibration, ItemKind, WorkItem } from "./contracts";

export interface SessionSample {
  subject: number | null;
  kind: ItemKind | null;
  /** Minutes the plan expected for the finished work, when the work came from a plan. */
  planned: number | null;
  /** Minutes actually studied for that work. */
  actual: number;
  weekday: number;
  hour: number;
  /** Whether the planned work was finished. */
  completed: boolean;
}

const SHRINK = 5;
const RATIO_MIN = Math.log(0.5);
const RATIO_MAX = Math.log(2.5);

/** A smooth default energy curve for students with little history: strong late morning, a post-lunch dip, a good late afternoon. */
export function defaultEnergy(): number[][] {
  const hour = (h: number) => (h < 7 ? 20 : h < 9 ? 55 : h < 12 ? 82 : h < 13 ? 70 : h < 15 ? 58 : h < 18 ? 74 : h < 21 ? 64 : h < 23 ? 42 : 25);
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, h) => hour(h)));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at); const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export function calibrate(samples: readonly SessionSample[], dailyMinutes: readonly number[], options: { dailyCap: number; fallbackCapacity: number }): Calibration {
  const groups = new Map<string, number[]>();
  const add = (key: string, value: number) => { const list = groups.get(key) ?? []; list.push(value); groups.set(key, list); };
  for (const sample of samples) {
    if (!sample.completed || !sample.planned || sample.planned <= 0 || sample.actual <= 0) continue;
    const ratio = Math.max(RATIO_MIN, Math.min(RATIO_MAX, Math.log(sample.actual / sample.planned)));
    const subject = sample.subject == null ? "*" : String(sample.subject);
    const kind = sample.kind ?? "*";
    add(`${subject}:${kind}`, ratio);
    if (kind !== "*") add(`${subject}:*`, ratio);
    if (subject !== "*") add(`*:${kind}`, ratio);
    add("*:*", ratio);
  }
  const factors: Calibration["factors"] = {};
  for (const [key, ratios] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    const shrunk = (mean * ratios.length) / (ratios.length + SHRINK);
    factors[key] = { factor: Math.round(Math.exp(shrunk) * 100) / 100, samples: ratios.length };
  }

  // Energy: minutes started per weekday and hour, blended with the default by how much evidence there is.
  const base = defaultEnergy();
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let total = 0;
  for (const sample of samples) {
    if (sample.weekday < 0 || sample.weekday > 6 || sample.hour < 0 || sample.hour > 23) continue;
    const weight = sample.completed ? 1 : 0.4;
    counts[sample.weekday][sample.hour] += weight;
    // Neighbouring hours share a little, so one session does not make a spike.
    if (sample.hour > 0) counts[sample.weekday][sample.hour - 1] += weight * 0.35;
    if (sample.hour < 23) counts[sample.weekday][sample.hour + 1] += weight * 0.35;
    total += weight;
  }
  const blend = Math.min(0.7, total / 60);
  const peak = Math.max(1e-9, ...counts.flat());
  const energy = base.map((row, day) => row.map((value, hour) => Math.round(value * (1 - blend) + (counts[day][hour] / peak) * 100 * blend)));

  const active = dailyMinutes.filter((m) => m > 0);
  const evidence = Math.min(1, active.length / 10);
  const observed = active.length ? percentile(active, 0.75) * 1.1 + 15 : options.fallbackCapacity;
  const capacity = Math.max(45, Math.min(options.dailyCap, round5(observed * evidence + options.fallbackCapacity * (1 - evidence))));
  return { factors, energy, capacity, samples: samples.length };
}

export function factorFor(calibration: Calibration | undefined, subject: number | null, kind: ItemKind): { factor: number; samples: number; basis: string } {
  const factors = calibration?.factors ?? {};
  const s = subject == null ? "*" : String(subject);
  for (const [key, basis] of [[`${s}:${kind}`, "subject and kind"], [`${s}:*`, "subject"], [`*:${kind}`, "kind"], ["*:*", "all work"]] as const) {
    const entry = factors[key];
    if (entry && entry.samples >= 3) return { factor: Math.max(0.6, Math.min(2, entry.factor)), samples: entry.samples, basis };
  }
  return { factor: 1, samples: 0, basis: "none" };
}

/** Calibrated p50 and p80 minutes for an item. */
export function calibratedEstimate(item: Pick<WorkItem, "est" | "subject" | "kind" | "chunk">, calibration?: Calibration): [number, number] {
  const { factor } = factorFor(calibration, item.subject, item.kind);
  const p50 = Math.max(item.chunk[0], Math.min(600, round5(item.est[0] * factor)));
  const p80 = Math.max(p50, Math.min(900, round5(item.est[1] * factor)));
  return [p50, p80];
}

const KIND_WORDS: Record<ItemKind, string> = { learn: "learning sessions", practice: "practice", review: "reviews", produce: "writing and making", admin: "admin" };
/** "You usually take 1.3× your estimate on Chemistry practice, so this one is planned at 65 minutes." Null when nothing was learned. */
export function calibrationNote(item: Pick<WorkItem, "est" | "subject" | "kind" | "chunk">, calibration: Calibration | undefined, subjectName: string | null): string | null {
  const { factor, samples } = factorFor(calibration, item.subject, item.kind);
  if (!samples || Math.abs(factor - 1) < 0.08) return null;
  const [p50] = calibratedEstimate(item, calibration);
  const what = `${subjectName ? `${subjectName} ` : ""}${KIND_WORDS[item.kind]}`;
  return factor > 1
    ? `You usually take ${factor.toFixed(1)}× your estimate on ${what}, so this one is planned at ${p50} minutes.`
    : `You usually finish ${what} faster than estimated (${factor.toFixed(1)}×), so this one is planned at ${p50} minutes.`;
}

export function energyAt(calibration: Calibration | undefined, weekday: number, minute: number): number {
  const curve = calibration?.energy?.[weekday] ?? defaultEnergy()[weekday];
  const hour = Math.max(0, Math.min(23, Math.floor(minute / 60)));
  return curve[hour] ?? 50;
}
