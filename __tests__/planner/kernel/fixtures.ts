import {
  DEFAULT_SETTINGS, addDays, defaultEnergy, emptyWorkModel, normalizeSizes, seededRandom, weekdayOf,
  type Block, type KGoal, type PlanningSnapshot, type SnapshotDay, type WorkItem, type WorkModel,
} from "@/lib/planner/kernel";

export const TODAY = "2026-11-23"; // a Monday

export function snapshot(overrides: Partial<PlanningSnapshot> = {}, days = 14, restWeekdays: number[] = [0]): PlanningSnapshot {
  const list: SnapshotDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(overrides.today ?? TODAY, i);
    const weekday = weekdayOf(date);
    return { date, weekday, rest: restWeekdays.includes(weekday) ? "fixed" : false, windows: [[8 * 60, 22 * 60]], busy: [], allDay: [] };
  });
  return {
    today: TODAY, nowMinute: 7 * 60, timezone: "UTC", days: list,
    subjects: [{ id: 1, name: "Organic Chemistry", color: "#10B981", code: "CHEM" }, { id: 2, name: "Physics", color: "#3B82F6", code: "PHYS" }, { id: 3, name: "History", color: "#F59E0B", code: "HIST" }],
    topics: [
      { id: 31, subject: 1, ref: "N3_1", title: "Reaction mechanisms", progress: 20, mastered: false, difficulty: 4 },
      { id: 32, subject: 1, ref: "N3_2", title: "Stereochemistry", progress: 50, mastered: false, difficulty: 3 },
      { id: 33, subject: 1, ref: "N3_3", title: "Spectroscopy", progress: 80, mastered: false, difficulty: 3 },
    ],
    calibration: { factors: {}, energy: defaultEnergy(), capacity: 180, samples: 0 },
    settings: { ...DEFAULT_SETTINGS }, studiedToday: 0,
    ...overrides,
  };
}

export function goal(key: string, over: Partial<KGoal> = {}): KGoal {
  return { key, ref: null, title: `Goal ${key}`, type: "general", due: null, priority: 2, subject: null, status: "active", draft: false, source: "model", ...over };
}

export function item(key: string, over: Partial<WorkItem> = {}): WorkItem {
  const sizes = normalizeSizes(over.est ?? [60, 80], over.chunk ?? [25, 45, 60]);
  return {
    key, goal: null, title: `Item ${key}`, kind: "learn", subject: null, topics: [], est: sizes.est, chunk: sizes.chunk, earliest: null, due: null, after: [], load: 2,
    method: "learn", source: "model", confidence: 0.7, done: 0, status: "open", questId: null, firstStep: null, note: null, ...over,
  };
}

export function model(over: Partial<WorkModel> = {}): WorkModel {
  return { ...emptyWorkModel(), ...over };
}

/** A random but valid planning instance, for property tests. */
export function randomInstance(seed: number): { snapshot: PlanningSnapshot; model: WorkModel; blocks: Block[] } {
  const random = seededRandom(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const days = int(7, 14);
  const rest = random() < 0.7 ? [0] : random() < 0.5 ? [0, 6] : [];
  const snap = snapshot({ nowMinute: int(6 * 60, 20 * 60), studiedToday: random() < 0.3 ? int(0, 90) : 0 }, days, rest);
  snap.calibration.capacity = int(60, 300);
  snap.settings.dailyCap = int(90, 360);
  snap.settings.dayStart = int(6, 10) * 60; snap.settings.dayEnd = int(18, 23) * 60;
  for (const day of snap.days) {
    day.windows = [[snap.settings.dayStart, snap.settings.dayEnd]];
    const n = int(0, 3);
    for (let k = 0; k < n; k++) { const start = int(8, 19) * 60 + pick([0, 15, 30]); day.busy.push({ start, end: start + pick([60, 90, 120, 180]), title: "Class", kind: "class", ref: null }); }
    if (random() < 0.05 && !day.rest) day.rest = "floating";
  }
  const goals: KGoal[] = [];
  const items: WorkItem[] = [];
  const nGoals = int(1, 5);
  for (let g = 0; g < nGoals; g++) {
    const due = random() < 0.8 ? addDays(TODAY, int(0, 40)) : null;
    goals.push(goal(`g${g}`, { type: pick(["exam", "essay", "general", "problem_set"] as const), due, priority: pick([1, 2, 3] as const), subject: pick([1, 2, 3, null]) }));
    const nItems = int(1, 12);
    for (let i = 0; i < nItems; i++) {
      const key = `g${g}i${i}`;
      const prior = i > 0 && random() < 0.4 ? [`g${g}i${int(0, i - 1)}`] : [];
      const est = int(3, 30) * 5;
      items.push(item(key, {
        goal: `g${g}`, subject: goals[g].subject, kind: pick(["learn", "practice", "review", "produce"] as const), method: pick(["learn", "retrieval", "drafting", "problem_solving", "spaced_review"] as const),
        topics: random() < 0.5 ? [pick([31, 32, 33])] : [], est: [est, est + int(0, 6) * 5], chunk: [pick([15, 20, 25, 30]), pick([30, 45, 60]), pick([45, 60, 90])],
        earliest: random() < 0.2 ? addDays(TODAY, int(0, 10)) : null, due: random() < 0.3 && due ? addDays(TODAY, int(0, 20)) : null, after: prior, load: pick([1, 2, 3] as const),
        done: random() < 0.1 ? int(1, 4) * 5 : 0,
      }));
    }
  }
  const m = model({ goals, items });
  if (random() < 0.3) m.constraints.push({ key: "c1", kind: "daily_cap", minutes: int(60, 240), hard: true, weight: 3, provenance: "student", label: "cap" });
  if (random() < 0.3) m.constraints.push({ key: "c2", kind: "no_study_window", start: 20 * 60, end: 24 * 60, hard: true, weight: 3, provenance: "student", label: "evenings" });
  if (random() < 0.2) m.constraints.push({ key: "c3", kind: "preferred_window", start: 17 * 60, end: 22 * 60, subject: 1, hard: false, weight: 3, provenance: "student", label: "chem evenings" });
  if (random() < 0.2) m.constraints.push({ key: "c4", kind: "subject_cap", subject: 2, minutes: 60, hard: true, weight: 3, provenance: "student", label: "physics cap" });
  if (random() < 0.2) m.constraints.push({ key: "c5", kind: "day_off", dates: [addDays(TODAY, int(0, 6))], hard: true, weight: 5, provenance: "student", label: "off" });
  if (random() < 0.2) m.practices.push({ key: "p1", goal: null, title: "Practice: Spanish", subject: null, minutes: 20, days: [1, 2, 3, 4, 5], from: null, until: null, method: "practice", status: "active" });
  // Some committed and pinned blocks from an earlier solve.
  const blocks: Block[] = [];
  if (random() < 0.4) {
    const it = pick(items);
    const date = addDays(TODAY, int(1, days - 1));
    const day = snap.days.find((d) => d.date === date)!;
    if (!day.rest) {
      const start = int(snap.settings.dayStart / 5, (snap.settings.dayEnd - 60) / 5) * 5;
      if (!day.busy.some((b) => start < b.end + 10 && start + 45 > b.start - 10)) blocks.push({ id: "pin1", item: it.key, date, start, end: start + 45, state: "committed", pinned: true, questId: null });
    }
  }
  return { snapshot: snap, model: m, blocks };
}
