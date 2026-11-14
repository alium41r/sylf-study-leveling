// The solver turns the work model into a timed plan. It is pure, deterministic and has no I/O, so the server commits exactly what a tablet previews.
//
// Phase A · allocation: how many minutes of each item happen on which day, as a min-cost flow. Items supply their remaining minutes in 5-minute units,
//   days absorb up to their capacity in two price tiers (comfortable, then up to sustainable), weeks beyond the detailed horizon hold budgets, and an
//   overflow arc prices what does not fit, so infeasibility comes out as an exact shortage.
// Phase B · placement: each day's minutes become timed blocks. Greedy construction puts demanding work in the student's best hours, keeps breaks and
//   transition buffers, respects windows and order, and keeps blocks near where they were; a seeded local search then improves the day.
// Phase C · diagnostics: why each block landed where it did, load against capacity, shortages and risks. "Why is this here?" is answered from this.
import { addDays, dayLabel, diffDays, formatMinutes, round5, ceil5, floor5, weekStart, weekdayOf } from "./dates";
import { calibratedEstimate, energyAt } from "./calibration";
import { MinCostFlow } from "./flow";
import { SPACED_METHODS, SPACING_DAYS } from "./strategy";
import {
  blockMinutes,
  type Block, type Constraint, type DayLoad, type Health, type KGoal, type PlanningSnapshot, type Reason, type Risk, type Shortage, type SnapshotDay,
  type WeekBudget, type WorkItem, type WorkModel,
} from "./contracts";

const UNIT = 5;
/** Weeks beyond the detailed horizon that hold budgets: a year, so a whole course can be planned to its end. */
const MAX_WEEKS = 52;
/** The gap kept between any two sessions; sessions of 45 minutes or more get the student's full break. */
const MIN_GAP = 5;

/** Transient changes previewed before anything is saved. */
export interface WhatIf {
  /** Override the most minutes a day. */
  dailyCap?: number | null;
  /** Override the most minutes on weekdays only. */
  weekdayCap?: number | null;
  /** Extra study time, e.g. Saturday morning. */
  extraWindows?: { date: string; start: number; end: number }[];
  /** Days to keep free. */
  daysOff?: string[];
  /** Bring every item's earliest start this many days earlier and prefer starting sooner. */
  startEarlier?: number;
  /** Compress review and practice for these goals by a fraction (0.1–0.5). */
  compress?: { goal: string; fraction: number }[];
  /** Push a soft deadline later by days. */
  extendDue?: { goal: string; days: number }[];
  /** Drop items from consideration, e.g. a low-priority item moved out. */
  release?: string[];
}

export interface SolveInput {
  snapshot: PlanningSnapshot;
  model: WorkModel;
  /** Every block the plan currently has: committed, done, missed, skipped and pinned. */
  blocks: readonly Block[];
  whatIf?: WhatIf | null;
  seed?: number;
  /**
   * `full` (the default) re-solves everything with a stability term, for changes in meaning: new goals, new rules, what-ifs. `repair` keeps every
   * committed block that is still valid exactly where it is and places only the residual (missed, skipped, invalidated or new work), so an
   * unchanged world re-solves to itself and a repair moves as little as possible.
   */
  mode?: "full" | "repair";
}

export interface SolveResult {
  /** Fixed blocks plus everything placed in the detailed horizon. */
  blocks: Block[];
  weekBudgets: WeekBudget[];
  unplaced: { item: string; minutes: number }[];
  shortages: Shortage[];
  days: DayLoad[];
  reasons: Record<string, Reason[]>;
  risks: Risk[];
  health: Omit<Health, "quality">;
  /** Items the solver scheduled, including practice occurrences, with their calibrated remaining minutes. */
  demand: { item: string; minutes: number; target: number; title: string; virtual: boolean }[];
  /** Repair mode: committed blocks kept exactly where they were. */
  kept: string[];
  stats: { items: number; placed: number; ms: number; iterations: number };
}

interface Ctx {
  snapshot: PlanningSnapshot;
  model: WorkModel;
  constraints: Constraint[];
  goals: Map<string, KGoal>;
  dayIndex: Map<string, number>;
  horizon: SnapshotDay[];
}

interface Demand {
  item: WorkItem;
  virtual: boolean;
  remaining: number;
  target: number;
  earliest: number;
  latest: number;
  /** Absolute due date, which may lie beyond the horizon. */
  due: string | null;
  priority: number;
  slope: number;
  goal: KGoal | null;
  forbidden: Set<number>;
  /** Bounded by a successor that stays in place, so it may not spill into later weeks. */
  capped?: boolean;
}

/** Mulberry32: tiny, fast and identical on every engine. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}

/**
 * Daily cap groups: a goal's own limit ("an hour and a half a day for this plan") for its sessions, and a subject's limit for every other session of
 * that subject. Each item counts against at most one group, so the flow stays a single path per item.
 */
export function capGroups(constraints: readonly Constraint[]): { caps: Map<string, number>; groupOf: (item: Pick<WorkItem, "goal" | "subject">) => string | null; soloOf: (item: Pick<WorkItem, "goal" | "subject" | "chunk">) => boolean } {
  const caps = new Map<string, number>();
  for (const c of constraints) {
    const key = c.kind === "goal_cap" ? `g:${c.goal}` : c.kind === "subject_cap" ? `s:${c.subject}` : null;
    if (key) caps.set(key, Math.min(caps.get(key) ?? Infinity, (c as { minutes: number }).minutes));
  }
  const groupOf = (item: Pick<WorkItem, "goal" | "subject">) => (item.goal && caps.has(`g:${item.goal}`) ? `g:${item.goal}` : item.subject != null && caps.has(`s:${item.subject}`) ? `s:${item.subject}` : null);
  // A single sitting longer than its group's daily limit (a full timed paper under "an hour a day") is allowed, and takes that day to itself:
  // nothing else of the group is placed on the day it is sat.
  const soloOf = (item: Pick<WorkItem, "goal" | "subject" | "chunk">) => { const group = groupOf(item); return group != null && item.chunk[0] > caps.get(group)!; };
  return { caps, groupOf, soloOf };
}

/**
 * After allocation: on a day a solo sitting is allocated, the rest of its cap group moves to the nearest other day of its window with room in the
 * group and the day, or waits (overflow). Two solo sittings of one group never share a day either.
 */
function separateSolo(alloc: Allocation, demands: Demand[], capacity: { cap: number }[], constraints: readonly Constraint[], fixedSubject: Map<string, number>) {
  const { caps, groupOf, soloOf } = capGroups(constraints);
  if (!caps.size) return;
  const byKey = new Map(demands.map((d) => [d.item.key, d]));
  const used = new Array<number>(capacity.length).fill(0);
  const groupUse = new Map<string, number>(fixedSubject);
  for (const [key, days] of alloc.days) {
    const d = byKey.get(key); const group = d ? groupOf(d.item) : null;
    for (const [day, m] of days) { used[day] += m; if (group) groupUse.set(`${group}|${day}`, (groupUse.get(`${group}|${day}`) ?? 0) + m); }
  }
  const soloDay = new Map<string, string>();
  // A day already holding fixed work of the group (a session the student placed) cannot be cleared, so a sitting allocated there moves instead.
  const onFixed: [string, Demand, string, number][] = [];
  for (const [key, days] of alloc.days) {
    const d = byKey.get(key);
    if (!d || !soloOf(d.item)) continue;
    const group = groupOf(d.item)!;
    for (const day of [...days.keys()].sort((a, b) => a - b)) {
      if ((fixedSubject.get(`${group}|${day}`) ?? 0) > 0) { onFixed.push([key, d, group, day]); continue; }
      if (!soloDay.has(`${group}|${day}`)) soloDay.set(`${group}|${day}`, key);
    }
  }
  if (!soloDay.size && !onFixed.length) return;
  const move = (key: string, d: Demand, group: string, day: number, minutes: number, solo: boolean) => {
    const days = alloc.days.get(key)!;
    const limit = caps.get(group)!;
    const target = [...Array(Math.max(0, Math.min(capacity.length - 1, d.latest) - d.earliest + 1)).keys()].map((k) => d.earliest + k)
      .filter((t) => t !== day && !d.forbidden.has(t) && capacity[t].cap - used[t] >= minutes && !soloDay.has(`${group}|${t}`) && (solo ? (groupUse.get(`${group}|${t}`) ?? 0) === 0 : (groupUse.get(`${group}|${t}`) ?? 0) + minutes <= limit))
      .sort((a, b) => Math.abs(a - day) - Math.abs(b - day) || a - b)[0];
    days.delete(day); used[day] -= minutes; groupUse.set(`${group}|${day}`, (groupUse.get(`${group}|${day}`) ?? 0) - minutes);
    if (target == null) { alloc.overflow.set(key, (alloc.overflow.get(key) ?? 0) + minutes); if (!days.size) alloc.days.delete(key); return; }
    days.set(target, (days.get(target) ?? 0) + minutes); used[target] += minutes; groupUse.set(`${group}|${target}`, (groupUse.get(`${group}|${target}`) ?? 0) + minutes);
    if (solo) soloDay.set(`${group}|${target}`, key);
  };
  for (const [key, d, group, day] of onFixed) { const days = alloc.days.get(key); if (days?.has(day)) move(key, d, group, day, days.get(day)!, true); }
  for (const [slot, owner] of [...soloDay]) {
    const [group, dayText] = [slot.slice(0, slot.lastIndexOf("|")), slot.slice(slot.lastIndexOf("|") + 1)];
    const day = Number(dayText);
    for (const [key, days] of [...alloc.days]) {
      if (key === owner || !days.has(day)) continue;
      const d = byKey.get(key);
      if (!d || groupOf(d.item) !== group) continue;
      move(key, d, group, day, days.get(day)!, soloOf(d.item));
    }
  }
}

const matchesDay = (days: number[] | undefined, weekday: number) => !days || !days.length || days.includes(weekday);

function mergeIntervals(list: [number, number][]): [number, number][] {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
}

function subtract(intervals: [number, number][], cut: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of intervals) {
    if (cut[1] <= a || cut[0] >= b) { out.push([a, b]); continue; }
    if (cut[0] > a) out.push([a, cut[0]]);
    if (cut[1] < b) out.push([cut[1], b]);
  }
  return out;
}

/** Applies a what-if to copies of the snapshot and model. */
export function applyWhatIf(snapshot: PlanningSnapshot, model: WorkModel, whatIf: WhatIf | null | undefined): { snapshot: PlanningSnapshot; model: WorkModel } {
  if (!whatIf) return { snapshot, model };
  const s: PlanningSnapshot = JSON.parse(JSON.stringify(snapshot));
  const m: WorkModel = JSON.parse(JSON.stringify(model));
  if (whatIf.dailyCap != null) s.settings.dailyCap = Math.max(0, round5(whatIf.dailyCap));
  if (whatIf.weekdayCap != null) m.constraints.push({ key: "whatif-weekday", kind: "daily_cap", minutes: Math.max(0, round5(whatIf.weekdayCap)), days: [1, 2, 3, 4, 5], hard: true, weight: 5, provenance: "student", label: "What-if weekday limit" });
  for (const [i, extra] of (whatIf.extraWindows ?? []).entries()) m.constraints.push({ key: `whatif-extra-${i}`, kind: "extra_time", date: extra.date, start: extra.start, end: extra.end, hard: true, weight: 5, provenance: "student", label: "What-if extra time" });
  if (whatIf.daysOff?.length) m.constraints.push({ key: "whatif-off", kind: "day_off", dates: whatIf.daysOff, hard: true, weight: 5, provenance: "student", label: "What-if days off" });
  if (whatIf.startEarlier) for (const item of m.items) if (item.earliest) item.earliest = addDays(item.earliest, -whatIf.startEarlier) < s.today ? null : addDays(item.earliest, -whatIf.startEarlier);
  for (const { goal, fraction } of whatIf.compress ?? []) {
    const f = Math.max(0.1, Math.min(0.5, fraction));
    for (const item of m.items) if (item.goal === goal && (item.kind === "review" || item.kind === "practice")) item.est = [Math.max(item.chunk[0], round5(item.est[0] * (1 - f))), Math.max(item.chunk[0], round5(item.est[1] * (1 - f)))];
  }
  for (const { goal, days } of whatIf.extendDue ?? []) {
    const g = m.goals.find((x) => x.key === goal);
    if (g?.due) { const old = g.due; g.due = addDays(g.due, days); for (const item of m.items) if (item.goal === goal && item.due === old) item.due = g.due; }
  }
  if (whatIf.release?.length) for (const item of m.items) if (whatIf.release.includes(item.key) && item.status === "open") item.status = "dropped";
  return { snapshot: s, model: m };
}

/** Practice cadences become one item per matching study day in the horizon. */
export function expandPractices(model: WorkModel, snapshot: PlanningSnapshot): WorkItem[] {
  const out: WorkItem[] = [];
  for (const practice of model.practices) {
    if (practice.status !== "active") continue;
    for (const day of snapshot.days) {
      if (day.rest || !practice.days.includes(day.weekday)) continue;
      if (practice.from && day.date < practice.from) continue;
      if (practice.until && day.date > practice.until) continue;
      out.push({
        key: `${practice.key}@${day.date}`, goal: practice.goal, title: practice.title, kind: "practice", subject: practice.subject, topics: [],
        est: [practice.minutes, practice.minutes], chunk: [practice.minutes, practice.minutes, practice.minutes], earliest: day.date, due: day.date, after: [],
        load: 2, method: practice.method, source: "system", confidence: 1, done: 0, status: "open", questId: null, firstStep: null, note: null,
      });
    }
  }
  return out;
}

/** A committed session starting this soon is about to happen: replanning leaves it where it is. */
export const IMMINENT_MINUTES = 30;
export function isFixed(block: Block, snapshot: Pick<PlanningSnapshot, "today" | "nowMinute">): boolean {
  if (block.state === "done" || block.state === "skipped" || block.state === "missed") return true;
  if (block.pinned) return true;
  if (block.date < snapshot.today) return true;
  if (block.date === snapshot.today && block.start < snapshot.nowMinute + (block.state === "committed" ? IMMINENT_MINUTES : 0)) return true;
  return false;
}

function dayCaps(ctx: Ctx, day: SnapshotDay) {
  const { settings } = ctx.snapshot;
  let cap = settings.dailyCap;
  for (const c of ctx.constraints) if (c.kind === "daily_cap" && matchesDay(c.days, day.weekday)) cap = Math.min(cap, c.minutes);
  const sustainable = ctx.snapshot.calibration.capacity;
  return { hardCap: cap, sustainable };
}

const extraOn = (constraints: readonly Constraint[], date: string) => constraints.filter((c): c is Constraint & { kind: "extra_time" } => c.kind === "extra_time" && c.date === date);
export function isDayOff(ctx: Pick<Ctx, "constraints">, day: SnapshotDay) {
  if (ctx.constraints.some((c) => c.kind === "day_off" && c.dates.includes(day.date))) return true;
  return Boolean(day.rest) && !extraOn(ctx.constraints, day.date).length;
}

/** Free study intervals of a day, before any block is placed. Fixed blocks are already taken out. */
export function freeIntervals(ctx: Pick<Ctx, "snapshot" | "constraints">, day: SnapshotDay, fixed: readonly Block[]): [number, number][] {
  const { settings, today, nowMinute } = ctx.snapshot;
  const windows = ctx.constraints.filter((c): c is Constraint & { kind: "study_window" } => c.kind === "study_window" && matchesDay(c.days, day.weekday));
  const extra = extraOn(ctx.constraints, day.date).map((c) => [c.start, c.end] as [number, number]);
  const base: [number, number][] = day.rest ? [] : windows.length ? windows.map((w) => [w.start, w.end] as [number, number]) : day.windows.length ? day.windows : [[settings.dayStart, settings.dayEnd]];
  let free: [number, number][] = mergeIntervals([...base, ...extra]).map(([a, b]) => [Math.max(0, a), Math.min(1440, b)] as [number, number]).filter(([a, b]) => b > a);
  for (const busy of day.busy) free = subtract(free, [busy.start - settings.transitionBuffer, busy.end + settings.transitionBuffer]);
  for (const c of ctx.constraints) {
    if (c.kind !== "no_study_window") continue;
    if (c.dates?.length ? c.dates.includes(day.date) : matchesDay(c.days, day.weekday)) free = subtract(free, [c.start, c.end]);
  }
  if (day.date === today) free = subtract(free, [0, ceil5(nowMinute) + 10]);
  // Fixed sessions keep a short gap here; placement adds the full break where either side is long (the same rule as between placed sessions).
  for (const block of fixed) if (block.date === day.date && block.state !== "skipped" && block.state !== "missed") free = subtract(free, [block.start - MIN_GAP, block.end + MIN_GAP]);
  return free.map(([a, b]) => [ceil5(a), Math.floor(b / UNIT) * UNIT] as [number, number]).filter(([a, b]) => b - a >= 10).sort((x, y) => x[0] - y[0]);
}

function buildDemand(ctx: Ctx, items: WorkItem[], fixed: readonly Block[]): Demand[] {
  const { snapshot } = ctx;
  const H = ctx.horizon.length;
  const reserved = new Map<string, number>();
  for (const block of fixed) {
    if (block.state === "done" || block.state === "missed" || block.state === "skipped") continue;
    if (block.date < snapshot.today) continue;
    reserved.set(block.item, (reserved.get(block.item) ?? 0) + blockMinutes(block));
  }
  const weights = new Map<number, number>();
  for (const c of ctx.constraints) if (c.kind === "subject_weight") weights.set(c.subject, c.weight);
  const examBuffer = ctx.constraints.find((c): c is Constraint & { kind: "exam_buffer" } => c.kind === "exam_buffer")?.days ?? 1;
  const out: Demand[] = [];
  for (const item of items) {
    if (item.status !== "open") continue;
    const goal = item.goal ? ctx.goals.get(item.goal) ?? null : null;
    if (goal && goal.status !== "active") continue;
    const [p50] = calibratedEstimate(item, snapshot.calibration);
    let remaining = p50 - item.done - (reserved.get(item.key) ?? 0);
    if (item.done >= p50 && item.questId) remaining = Math.max(item.chunk[0], round5(p50 * 0.25)) - (reserved.get(item.key) ?? 0);
    remaining = round5(Math.max(0, remaining));
    if (remaining <= 0) continue;
    let due = item.due ?? goal?.due ?? null;
    if (due && due < snapshot.today) due = snapshot.today;
    const earliestDate = item.earliest && item.earliest > snapshot.today ? item.earliest : snapshot.today;
    const earliest = Math.max(0, diffDays(earliestDate, snapshot.today));
    const latest = due ? Math.min(H - 1, diffDays(due, snapshot.today)) : H - 1;
    const priority = Math.max(goal?.priority ?? 2, 1);
    const window = due ? Math.max(1, diffDays(due, earliestDate) + 1) : 0;
    const slope = 1 + priority + (item.subject != null ? (weights.get(item.subject) ?? 2) - 2 : 0) * 2 + (due ? Math.min(12, Math.floor(40 / Math.max(2, window))) : 0);
    const forbidden = new Set<number>();
    // No new topics in the final 24 hours before an exam, and an optional wider light buffer.
    // Measured from the exam itself: an item's own earlier deadline is a pacing window, not an exam.
    const examDay = goal?.type === "exam" ? goal.due ?? due : null;
    if (examDay && (item.kind === "learn" || item.method === "learn" || item.method === "worked_examples")) {
      // Today always stays open: an exam tomorrow still gets this evening's revision.
      for (let k = 0; k <= Math.max(1, examBuffer); k++) { const idx = diffDays(addDays(examDay, -k), snapshot.today); if (idx > 0 || (idx === 0 && k === 0)) forbidden.add(idx); }
    }
    out.push({ item, virtual: item.key.includes("@"), remaining, target: p50, earliest, latest, due, priority, slope: Math.max(1, slope), goal, forbidden });
  }
  // Stable order: deadlines first, then priority, then key.
  return out.sort((a, b) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : b.priority - a.priority || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0));
}

interface Allocation { days: Map<string, Map<number, number>>; weeks: Map<string, Map<string, number>>; overflow: Map<string, number> }

function allocate(ctx: Ctx, demands: Demand[], capacity: { cap: number; comfortable: number }[], previous: Map<string, Map<number, number>>, weekCaps: { week: string; cap: number; offset: number; days?: number }[], keptMinutes: Map<string, number> = new Map(), fixedSubject: Map<string, number> = new Map()): Allocation {
  const H = ctx.horizon.length;
  const nItems = demands.length;
  // Node layout: 0 source, 1 sink, items, pace nodes, days, weeks, subject-day nodes, subject-week nodes.
  const { caps: groupCaps, groupOf, soloOf } = capGroups(ctx.constraints);
  const capped = [...groupCaps.keys()].sort();
  const itemBase = 2;
  const paceBase = itemBase + nItems;
  const dayBase = paceBase + nItems;
  const weekBase = dayBase + H;
  const sdBase = weekBase + weekCaps.length;
  // A cap group's daily limit holds in the weeks beyond the detailed horizon too: at most its limit on each of the week's study days.
  const swBase = sdBase + capped.length * H;
  const nodes = swBase + capped.length * weekCaps.length;
  const graph = new MinCostFlow(nodes);
  const S = 0; const T = 1;
  const edges: { demand: number; day: number; edge: number }[] = [];
  const weekEdges: { demand: number; week: number; edge: number }[] = [];
  const overflowEdges: number[] = [];

  demands.forEach((d, i) => {
    const units = d.remaining / UNIT;
    graph.addEdge(S, itemBase + i, units, 0);
    overflowEdges[i] = graph.addEdge(itemBase + i, T, units, 20_000 + d.priority * 3_000 + (d.due && d.latest < H ? 2_000 : 0));
    const dueIdx = d.due ? diffDays(d.due, ctx.snapshot.today) : null;
    // Pace: an item whose deadline lies beyond the horizon takes only its fair share of the detailed days, with room to start ahead.
    const windowDays = dueIdx != null ? Math.max(1, dueIdx - d.earliest + 1) : 0;
    const inHorizon = dueIdx != null ? Math.max(0, Math.min(H, dueIdx + 1) - d.earliest) : H;
    // In a repair, minutes kept in place already count against the item's share of the horizon.
    const keptUnits = Math.floor((keptMinutes.get(d.item.key) ?? 0) / UNIT);
    const pace = dueIdx != null && dueIdx >= H ? Math.max(keptUnits ? 0 : Math.ceil(d.item.chunk[2] / UNIT), Math.ceil(((units + keptUnits) * inHorizon * 1.5) / windowDays) - keptUnits) : units;
    if (pace > 0) graph.addEdge(itemBase + i, paceBase + i, Math.min(units, pace), 0);
    const sittings = d.item.kind === "produce" || d.remaining > 4 * d.item.chunk[2] ? 2 : 1;
    const perDay = Math.max(1, Math.min(units, Math.ceil((d.item.chunk[2] * sittings) / UNIT)));
    const prev = previous.get(d.item.key);
    for (let day = d.earliest; day <= d.latest && day < H; day++) {
      if (capacity[day].cap <= 0 || d.forbidden.has(day)) continue;
      let cost = d.slope * day;
      if (d.due && dueIdx != null && dueIdx < H) {
        const tail = Math.ceil(Math.max(1, dueIdx - d.earliest + 1) * 0.15);
        if (day > dueIdx - tail) cost += 3;
      }
      // Stability: leaving a day the item already had costs more than any urgency gain from moving it, and most within the next 48 hours.
      const group = soloOf(d.item) ? null : groupOf(d.item);
      const groupIdx = group ? capped.indexOf(group) : -1;
      const target = groupIdx >= 0 ? sdBase + groupIdx * H + day : dayBase + day;
      if (prev && prev.size) {
        // Stability: the minutes the item already had on this day are the cheapest to keep; anything else costs more than any urgency gain from
        // moving, and most within the next 48 hours.
        const kept = Math.min(perDay, Math.floor((prev.get(day) ?? 0) / UNIT));
        const surcharge = d.slope + (day < 2 ? 12 : 6);
        if (kept > 0) edges.push({ demand: i, day, edge: graph.addEdge(paceBase + i, target, kept, cost) });
        if (perDay - kept > 0) edges.push({ demand: i, day, edge: graph.addEdge(paceBase + i, target, perDay - kept, cost + surcharge) });
      } else edges.push({ demand: i, day, edge: graph.addEdge(paceBase + i, target, perDay, cost) });
    }
    if ((dueIdx == null || dueIdx >= H) && !d.capped) {
      const weekGroup = soloOf(d.item) ? null : groupOf(d.item);
      const gi = weekGroup ? capped.indexOf(weekGroup) : -1;
      weekCaps.forEach((w, wi) => {
        if (d.due && w.week > d.due) return;
        if (diffDays(addDays(w.week, 6), ctx.snapshot.today) < d.earliest) return;
        weekEdges.push({ demand: i, week: wi, edge: graph.addEdge(itemBase + i, gi >= 0 ? swBase + gi * weekCaps.length + wi : weekBase + wi, units, d.slope * (H + 3 + w.offset)) });
      });
    }
  });
  capped.forEach((group, gi) => {
    for (let day = 0; day < H; day++) graph.addEdge(sdBase + gi * H + day, dayBase + day, Math.max(0, Math.floor(((groupCaps.get(group) ?? 0) - (fixedSubject.get(`${group}|${day}`) ?? 0)) / UNIT)), 0);
    weekCaps.forEach((w, wi) => graph.addEdge(swBase + gi * weekCaps.length + wi, weekBase + wi, Math.floor(((groupCaps.get(group) ?? 0) * (w.days ?? 7)) / UNIT), 0));
  });
  for (let day = 0; day < H; day++) {
    const comfortable = Math.floor(capacity[day].comfortable / UNIT);
    const cap = Math.floor(capacity[day].cap / UNIT);
    graph.addEdge(dayBase + day, T, Math.min(comfortable, cap), 0);
    if (cap > comfortable) graph.addEdge(dayBase + day, T, cap - comfortable, 4);
  }
  weekCaps.forEach((w, wi) => graph.addEdge(weekBase + wi, T, Math.floor(w.cap / UNIT), 0));
  graph.run(S, T);

  const result: Allocation = { days: new Map(), weeks: new Map(), overflow: new Map() };
  for (const { demand, day, edge } of edges) {
    const units = graph.flowOn(edge);
    if (!units) continue;
    const key = demands[demand].item.key;
    const map = result.days.get(key) ?? new Map<number, number>();
    map.set(day, (map.get(day) ?? 0) + units * UNIT);
    result.days.set(key, map);
  }
  for (const { demand, week, edge } of weekEdges) {
    const units = graph.flowOn(edge);
    if (!units) continue;
    const key = demands[demand].item.key;
    const map = result.weeks.get(key) ?? new Map<string, number>();
    map.set(weekCaps[week].week, (map.get(weekCaps[week].week) ?? 0) + units * UNIT);
    result.weeks.set(key, map);
  }
  demands.forEach((d, i) => { const units = graph.flowOn(overflowEdges[i]); if (units) result.overflow.set(d.item.key, units * UNIT); });
  return result;
}

/** Folds allocations smaller than an item's minimum sitting into another day, or rounds them up when there is room, or releases them. */
function consolidate(alloc: Allocation, demands: Demand[], capacity: { cap: number; max?: number }[], constraints: readonly Constraint[] = [], fixedSubject: Map<string, number> = new Map()) {
  separateSolo(alloc, demands, capacity, constraints, fixedSubject);
  const used = new Array<number>(capacity.length).fill(0);
  for (const days of alloc.days.values()) for (const [day, minutes] of days) used[day] += minutes;
  // Cap groups (a goal's or a subject's daily limit) hold through consolidation too. A solo sitting's day stays its own.
  const { caps: groupCaps, groupOf, soloOf } = capGroups(constraints);
  const subjectUse = new Map<string, number>(fixedSubject);
  const subjectOf = new Map(demands.map((d) => [d.item.key, groupOf(d.item)]));
  const soloItems = new Set(demands.filter((d) => soloOf(d.item)).map((d) => d.item.key));
  const soloDays = new Set<string>();
  for (const [key, days] of alloc.days) {
    const group = subjectOf.get(key);
    if (group) for (const [day, m] of days) { subjectUse.set(`${group}|${day}`, (subjectUse.get(`${group}|${day}`) ?? 0) + m); if (soloItems.has(key)) soloDays.add(`${group}|${day}`); }
  }
  let current = "";
  const subjectRoom = (group: string | null, day: number, minutes: number) => {
    if (!group) return true;
    if (soloItems.has(current)) { const own = alloc.days.get(current)?.get(day) ?? 0; return (subjectUse.get(`${group}|${day}`) ?? 0) - own === 0; }
    return !soloDays.has(`${group}|${day}`) && (subjectUse.get(`${group}|${day}`) ?? 0) + minutes <= groupCaps.get(group)!;
  };
  const moveSubject = (group: string | null, from: number, to: number, minutes: number) => {
    if (!group) return;
    subjectUse.set(`${group}|${from}`, (subjectUse.get(`${group}|${from}`) ?? 0) - minutes);
    subjectUse.set(`${group}|${to}`, (subjectUse.get(`${group}|${to}`) ?? 0) + minutes);
  };
  for (const d of demands) {
    const days = alloc.days.get(d.item.key);
    if (!days) continue;
    current = d.item.key;
    const min = d.item.chunk[0];
    for (const [day] of [...days.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
      const minutes = days.get(day);
      if (minutes === undefined || minutes >= min) continue;
      const subject = groupOf(d.item);
      const other = [...days.entries()].filter(([o, m]) => o !== day && m >= min && capacity[o].cap - used[o] >= minutes && subjectRoom(subject, o, minutes)).sort((a, b) => Math.abs(a[0] - day) - Math.abs(b[0] - day) || a[0] - b[0])[0];
      if (other) { days.delete(day); used[day] -= minutes; days.set(other[0], other[1] + minutes); used[other[0]] += minutes; moveSubject(subject, day, other[0], minutes); continue; }
      // A leftover may stretch an existing sitting of the same item a little past the comfortable load, never past the student's hard cap.
      const stretch = [...days.entries()].filter(([o, m]) => o !== day && m >= min && (capacity[o].max ?? capacity[o].cap) - used[o] >= minutes && subjectRoom(subject, o, minutes)).sort((a, b) => Math.abs(a[0] - day) - Math.abs(b[0] - day) || a[0] - b[0])[0];
      if (stretch) { days.delete(day); used[day] -= minutes; days.set(stretch[0], stretch[1] + minutes); used[stretch[0]] += minutes; moveSubject(subject, day, stretch[0], minutes); continue; }
      // Two short pieces of one item that together make a full sitting are joined on the day that has room.
      const completing = [...days.entries()].filter(([o, m]) => o !== day && m < min && m + minutes >= min && capacity[o].cap - used[o] >= minutes && subjectRoom(subject, o, minutes)).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (completing) { days.delete(day); used[day] -= minutes; days.set(completing[0], completing[1] + minutes); used[completing[0]] += minutes; moveSubject(subject, day, completing[0], minutes); continue; }
      // A crumb of a larger item is not a session: it waits for room rather than appearing as a ten-minute block.
      if (minutes < 15 && d.remaining >= min) { days.delete(day); used[day] -= minutes; moveSubject(subject, day, day, 0); alloc.overflow.set(d.item.key, (alloc.overflow.get(d.item.key) ?? 0) + minutes); continue; }
      // Nowhere to fold it: a short finishing sitting is better than losing the minutes, unless another short piece can absorb it.
      const sibling = [...days.entries()].filter(([o]) => o !== day && capacity[o].cap - used[o] >= minutes && subjectRoom(subject, o, minutes)).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (sibling) { days.delete(day); used[day] -= minutes; days.set(sibling[0], sibling[1] + minutes); used[sibling[0]] += minutes; moveSubject(subject, day, sibling[0], minutes); }
    }
    if (!days.size) alloc.days.delete(d.item.key);
  }
}

interface Piece { item: WorkItem; demand: Demand; minutes: number; start: number; end: number; index: number }

function placeDay(ctx: Ctx, day: SnapshotDay, dayIdx: number, demandsByKey: Map<string, Demand>, minutesByItem: [string, number][], free: [number, number][], previousOnDay: Block[], fixedOnDay: Block[], seed: number): { pieces: Piece[]; unplaced: [string, number][] } {
  const { settings, calibration } = ctx.snapshot;
  const itemAfter = new Map(ctx.model.items.map((i) => [i.key, i.after]));
  const pieces: Piece[] = [];
  for (const [key, minutes] of minutesByItem) {
    const demand = demandsByKey.get(key)!;
    const [min, , max] = demand.item.chunk;
    let n = Math.max(1, Math.ceil(minutes / max));
    while (n > 1 && minutes / n < min) n--;
    let left = minutes;
    for (let k = 0; k < n; k++) {
      const size = k === n - 1 ? left : round5(minutes / n);
      left -= size;
      pieces.push({ item: demand.item, demand, minutes: size, start: -1, end: -1, index: k });
    }
  }
  // Predecessors are placed before what depends on them on the same day: placed later, a predecessor would have to fit before a session that
  // already took the day's first free time, and could be left out of a day with room to spare.
  const onDay = new Set(pieces.map((p) => p.item.key));
  const depthOf = new Map<string, number>();
  const depth = (key: string, seen: Set<string> = new Set()): number => {
    if (depthOf.has(key)) return depthOf.get(key)!;
    if (seen.has(key)) return 0;
    seen.add(key);
    const item = demandsByKey.get(key)?.item;
    const d = item ? Math.max(0, ...item.after.filter((k) => onDay.has(k)).map((k) => depth(k, seen) + 1)) : 0;
    depthOf.set(key, d);
    return d;
  };
  pieces.sort((a, b) => depth(a.item.key) - depth(b.item.key) || b.item.load - a.item.load || (a.demand.due ?? "9999").localeCompare(b.demand.due ?? "9999") || b.minutes - a.minutes || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : a.index - b.index));
  const preferred = ctx.constraints.filter((c): c is Constraint & { kind: "preferred_window" } => c.kind === "preferred_window" && matchesDay(c.days, day.weekday) && (!c.until || day.date <= c.until));
  const previousStart = new Map<string, number[]>();
  for (const block of previousOnDay) previousStart.set(block.item, [...(previousStart.get(block.item) ?? []), block.start]);
  const placed: Piece[] = [];
  const unplaced: [string, number][] = [];
  const breakFor = (a: number, b: number) => (a >= 45 || b >= 45 ? settings.breakMinutes : MIN_GAP);
  const fixedLive = fixedOnDay.filter((b) => b.state !== "missed" && b.state !== "skipped");

  const fits = (start: number, minutes: number, self: Piece | null, others: readonly Piece[]) => {
    const end = start + minutes;
    if (!free.some(([a, b]) => start >= a && end <= b)) return false;
    for (const block of fixedLive) {
      const gap = breakFor(minutes, block.end - block.start);
      if (start < block.end + gap && end + gap > block.start) return false;
    }
    for (const other of others) {
      if (other === self || other.start < 0) continue;
      const gap = breakFor(minutes, other.minutes);
      if (start < other.end + gap && end + gap > other.start) return false;
    }
    return true;
  };
  const orderOk = (piece: Piece, start: number, others: readonly Piece[]) => {
    for (const block of fixedOnDay) {
      if (block.state === "missed" || block.state === "skipped") continue;
      if (piece.item.after.includes(block.item) && start < block.end) return false;
      if (itemAfter.get(block.item)?.includes(piece.item.key) && start + piece.minutes > block.start) return false;
      if (block.item === piece.item.key && block.start > start) return false;
    }
    for (const other of others) {
      if (other === piece || other.start < 0) continue;
      if (piece.item.after.includes(other.item.key) && start < other.end) return false;
      if (other.item.after.includes(piece.item.key) && other.start < start + piece.minutes) return false;
      if (other.item.key === piece.item.key && other.index < piece.index && start < other.end) return false;
      if (other.item.key === piece.item.key && other.index > piece.index && other.start < start + piece.minutes) return false;
    }
    return true;
  };
  const score = (piece: Piece, start: number, others: readonly Piece[]) => {
    const mid = start + piece.minutes / 2;
    const energy = energyAt(calibration, day.weekday, mid);
    const load = piece.item.load === 3 ? 1 : piece.item.load === 2 ? 0.7 : 0.3;
    let s = energy * load;
    const prefs = preferred.filter((p) => p.subject == null || p.subject === piece.item.subject);
    if (prefs.length) s += prefs.some((p) => start >= p.start && start + piece.minutes <= p.end) ? 45 : prefs.some((p) => p.subject === piece.item.subject) ? -20 : 0;
    const prev = previousStart.get(piece.item.key);
    if (prev?.length) { const distance = Math.min(...prev.map((p) => Math.abs(p - start))); s += distance === 0 ? 60 : -Math.min(60, distance / 5) * 2; }
    for (const other of others) {
      if (other === piece || other.start < 0) continue;
      const adjacent = Math.abs(other.end - start) <= settings.breakMinutes + 5 || Math.abs(start + piece.minutes - other.start) <= settings.breakMinutes + 5;
      if (!adjacent) continue;
      s += 4;
      if (other.item.subject === piece.item.subject && other.item.kind === "practice" && piece.item.kind === "practice") s -= 12;
    }
    for (const block of fixedOnDay) if (Math.abs(block.end - start) <= settings.breakMinutes + 5 || Math.abs(start + piece.minutes - block.start) <= settings.breakMinutes + 5) s += 4;
    return s - (start - settings.dayStart) / 120;
  };
  const best = (piece: Piece, minutes: number, others: readonly Piece[]) => {
    let found = -1; let bestScore = -Infinity;
    for (const [a, b] of free) {
      for (let start = a; start + minutes <= b; start += UNIT) {
        if (!fits(start, minutes, piece, others) || !orderOk({ ...piece, minutes }, start, others)) continue;
        const value = score({ ...piece, minutes }, start, others);
        if (value > bestScore + 1e-9) { bestScore = value; found = start; }
      }
    }
    return found;
  };

  // Warm start: a piece whose item had a block of the same length here keeps that start if it still fits and keeps order.
  const warm = new Map<string, number[]>();
  for (const block of previousOnDay) warm.set(`${block.item}|${block.end - block.start}`, [...(warm.get(`${block.item}|${block.end - block.start}`) ?? []), block.start]);
  for (const piece of pieces) {
    const starts = warm.get(`${piece.item.key}|${piece.minutes}`);
    const at = starts?.find((candidate) => fits(candidate, piece.minutes, piece, placed) && orderOk(piece, candidate, placed));
    if (at === undefined) continue;
    starts!.splice(starts!.indexOf(at), 1);
    piece.start = at; piece.end = at + piece.minutes; placed.push(piece);
  }
  for (const piece of pieces) {
    if (piece.start >= 0) continue;
    const start = best(piece, piece.minutes, placed);
    if (start >= 0) { piece.start = start; piece.end = start + piece.minutes; placed.push(piece); continue; }
    // Fragmented day: try two shorter sittings.
    const half = round5(piece.minutes / 2);
    if (half >= piece.item.chunk[0]) {
      const first: Piece = { ...piece, minutes: half, index: piece.index * 2 };
      const second: Piece = { ...piece, minutes: piece.minutes - half, index: piece.index * 2 + 1 };
      const s1 = best(first, first.minutes, placed);
      if (s1 >= 0) {
        first.start = s1; first.end = s1 + first.minutes; placed.push(first);
        const s2 = best(second, second.minutes, placed);
        if (s2 >= 0) { second.start = s2; second.end = s2 + second.minutes; placed.push(second); continue; }
        unplaced.push([piece.item.key, second.minutes]);
        continue;
      }
    }
    unplaced.push([piece.item.key, piece.minutes]);
  }

  // Seeded local search: try moving each piece to a better start, then swapping pairs.
  const random = seededRandom(seed ^ hashString(day.date));
  const total = () => placed.reduce((sum, p) => sum + score(p, p.start, placed), 0);
  let current = total();
  const rounds = Math.min(120, placed.length * placed.length * 4);
  for (let r = 0; r < rounds && placed.length > 1; r++) {
    const i = Math.floor(random() * placed.length);
    const j = Math.floor(random() * placed.length);
    if (i === j) continue;
    const a = placed[i]; const b = placed[j];
    const [sa, sb] = [a.start, b.start];
    if (a.minutes !== b.minutes) continue;
    a.start = sb; a.end = sb + a.minutes; b.start = sa; b.end = sa + b.minutes;
    const others = placed;
    const valid = fits(a.start, a.minutes, a, others) && fits(b.start, b.minutes, b, others) && orderOk(a, a.start, others) && orderOk(b, b.start, others);
    const next = valid ? total() : -Infinity;
    if (next > current + 1e-9) current = next;
    else { a.start = sa; a.end = sa + a.minutes; b.start = sb; b.end = sb + b.minutes; }
  }
  return { pieces: placed.sort((x, y) => x.start - y.start), unplaced };
}

function reasonsFor(ctx: Ctx, block: Block, demand: Demand | undefined, previous: Block | undefined, all: readonly Block[]): Reason[] {
  const reasons: Reason[] = [];
  if (block.pinned) reasons.push({ code: "pinned", text: "You placed this, so it stays." });
  if (!demand) return reasons.length ? reasons : [{ code: "fixed", text: "Already part of your plan." }];
  const { item, due, goal } = demand;
  if (demand.virtual) reasons.push({ code: "practice", text: `Part of your ${item.title.replace(/^Practice:\s*/, "")} routine.` });
  if (due) {
    const slack = diffDays(due, block.date);
    const slackText = slack === 0 ? "due that day" : `${slack} day${slack === 1 ? "" : "s"} of slack`;
    if (goal?.type === "exam" && goal.due) reasons.push({ code: "due", text: `Exam ${dayLabel(goal.due)}${due !== goal.due ? ` · this part by ${dayLabel(due)}` : ""} · ${slackText}.` });
    else reasons.push({ code: "due", text: `Due ${dayLabel(due)} · ${slackText}.` });
  }
  if (goal?.type === "exam" && due && block.date === addDays(due, -1) && (item.method === "spaced_review" || item.kind === "review")) reasons.push({ code: "review", text: "Light review the day before the exam." });
  const weekday = weekdayOf(block.date);
  const energy = energyAt(ctx.snapshot.calibration, weekday, (block.start + block.end) / 2);
  if (item.load >= 2 && energy >= 70) reasons.push({ code: "energy", text: ctx.snapshot.calibration.samples >= 10 ? "One of the hours you most often finish what you start." : "A strong hour for demanding work." });
  const pref = ctx.constraints.find((c) => c.kind === "preferred_window" && (c.subject == null || c.subject === item.subject) && block.start >= c.start && block.end <= c.end && matchesDay(c.days, weekday));
  if (pref) reasons.push({ code: "preferred", text: `Inside your preferred time: ${pref.label}.` });
  if (previous && previous.date === block.date && Math.abs(previous.start - block.start) <= 15) reasons.push({ code: "stable", text: "Kept where it was." });
  if (SPACED_METHODS.includes(item.method) && item.after.length) {
    const before = all.filter((b) => item.after.includes(b.item) && b.date < block.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (before) { const gap = diffDays(block.date, before.date); reasons.push({ code: "spacing", text: `${gap} day${gap === 1 ? "" : "s"} after the previous session on this topic, so recall is effortful.` }); }
  } else if (item.after.length) {
    const pred = ctx.model.items.find((i) => i.key === item.after[0]);
    if (pred) reasons.push({ code: "dependency", text: `After “${pred.title}”.` });
  }
  if (reasons.length < 2) reasons.push({ code: "capacity", text: `${dayLabel(block.date)} had room inside your usual study time.` });
  return reasons;
}

/** Repair mode: the committed blocks that are still true to the world and the model. */
function keepValidBlocks(ctx: Ctx, blocks: readonly Block[], itemByKey: Map<string, WorkItem>): Set<string> {
  const { snapshot } = ctx;
  const fixed = blocks.filter((b) => isFixed(b, snapshot));
  const candidates = blocks.filter((b) => !isFixed(b, snapshot) && (b.state === "committed" || b.state === "proposed")).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || (a.id < b.id ? -1 : 1));
  const reserved = new Map<string, number>();
  for (const block of fixed) if (block.state !== "done" && block.state !== "missed" && block.state !== "skipped" && block.date >= snapshot.today) reserved.set(block.item, (reserved.get(block.item) ?? 0) + blockMinutes(block));
  const budget = (item: WorkItem) => {
    const [p50] = calibratedEstimate(item, snapshot.calibration);
    const base = item.done >= p50 && item.questId ? Math.max(item.chunk[0], round5(p50 * 0.25)) : p50 - item.done;
    return Math.max(0, base - (reserved.get(item.key) ?? 0));
  };
  const { caps: groupCaps, groupOf, soloOf } = capGroups(ctx.constraints);
  const soloKept = new Set<string>();
  const kept = new Set<string>();
  const used = new Map<string, number>();
  const dayUse = new Map<string, number>();
  const subjectUse = new Map<string, number>();
  const released = new Set<string>();
  const freeOf = new Map<string, [number, number][]>();
  // What is fixed on a day (a session the student placed, one under way) counts against its cap group first: it leaves less room for the plan's
  // own sessions, and a fixed full paper keeps its day to itself. The student's placement never moves; the plan's sessions make way.
  for (const block of fixed) {
    if (block.state === "missed" || block.state === "skipped" || block.state === "done" || block.date < snapshot.today) continue;
    const item = itemByKey.get(block.item);
    const group = item ? groupOf(item) : null;
    if (!item || !group) continue;
    const key = `${group}|${block.date}`;
    subjectUse.set(key, (subjectUse.get(key) ?? 0) + blockMinutes(block));
    if (soloOf(item)) soloKept.add(key);
  }
  for (const block of candidates) {
    const item = itemByKey.get(block.item);
    const goal = item?.goal ? ctx.goals.get(item.goal) ?? null : null;
    const reject = () => { released.add(block.item); };
    if (!item || item.status !== "open" || (goal && goal.status !== "active")) { reject(); continue; }
    const day = snapshot.days.find((d) => d.date === block.date);
    if (!day || isDayOff(ctx, day)) { reject(); continue; }
    if (!freeOf.has(day.date)) freeOf.set(day.date, freeIntervals(ctx, day, fixed));
    if (!freeOf.get(day.date)!.some(([a, b]) => block.start >= a && block.end <= b)) { reject(); continue; }
    const due = item.due ?? goal?.due ?? null;
    if ((due && due >= snapshot.today && block.date > due) || (item.earliest && item.earliest > snapshot.today && block.date < item.earliest)) { reject(); continue; }
    const minutes = blockMinutes(block);
    if ((used.get(item.key) ?? 0) + minutes > budget(item) + 4) { reject(); continue; }
    const { hardCap } = dayCaps(ctx, day);
    const fixedDay = fixed.filter((b) => b.date === day.date && b.state !== "missed" && b.state !== "skipped").reduce((sum, b) => sum + blockMinutes(b), 0) + (day.date === snapshot.today ? snapshot.studiedToday : 0) + (day.otherWork ?? 0);
    if ((dayUse.get(day.date) ?? 0) + minutes + fixedDay > Math.max(hardCap, fixedDay)) { reject(); continue; }
    const group = groupOf(item);
    const subjectKey = `${group}|${day.date}`;
    if (group && (soloOf(item) ? (subjectUse.get(subjectKey) ?? 0) > 0 : soloKept.has(subjectKey) || (subjectUse.get(subjectKey) ?? 0) + minutes > groupCaps.get(group)!)) { reject(); continue; }
    if (group && soloOf(item)) soloKept.add(subjectKey);
    kept.add(block.id);
    used.set(item.key, (used.get(item.key) ?? 0) + minutes);
    dayUse.set(day.date, (dayUse.get(day.date) ?? 0) + minutes);
    subjectUse.set(subjectKey, (subjectUse.get(subjectKey) ?? 0) + minutes);
  }
  // Work that must be placed again releases whatever depends on it, so order can be restored.
  const residual = new Set(released);
  for (const block of blocks) {
    if ((block.state !== "missed" && block.state !== "skipped") || block.date < addDays(snapshot.today, -7)) continue;
    const item = itemByKey.get(block.item);
    if (item && item.status === "open" && budget(item) - (used.get(item.key) ?? 0) >= item.chunk[0]) residual.add(item.key);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...kept]) {
      const block = blocks.find((b) => b.id === id)!;
      const item = itemByKey.get(block.item);
      if (item?.after.some((pred) => residual.has(pred))) { kept.delete(id); residual.add(item.key); changed = true; }
    }
  }
  return kept;
}

/**
 * The whole solve: allocation, placement and diagnostics. A full solve ends with a repair-mode fill pass over its own result, so leftover crumbs
 * of capacity are used now rather than by the next repair, and an unchanged plan repairs to itself.
 */
export function solve(input: SolveInput): SolveResult {
  const first = solveOnce(input);
  if (input.mode === "repair" || (!first.unplaced.length && !first.weekBudgets.length)) return first;
  // Fill until nothing more fits (bounded): each pass may free a crumb the previous one could not use.
  let fill = solveOnce({ ...input, blocks: first.blocks, mode: "repair" });
  for (let pass = 0; pass < 3 && (fill.unplaced.length || fill.weekBudgets.length); pass++) {
    const next = solveOnce({ ...input, blocks: fill.blocks, mode: "repair" });
    if (next.blocks.length === fill.blocks.length && next.blocks.every((b, i) => b.id === fill.blocks[i].id && b.start === fill.blocks[i].start && b.date === fill.blocks[i].date)) break;
    fill = { ...next, kept: fill.kept };
  }
  if (fill.blocks.length === first.blocks.length && fill.blocks.every((b, i) => b.id === first.blocks[i].id && b.start === first.blocks[i].start && b.date === first.blocks[i].date)) return { ...first, stats: { ...first.stats, ms: first.stats.ms + fill.stats.ms } };
  // Blocks the first pass placed keep their identity and state; the fill adds what it could, against the plan the student was looking at.
  const placedIds = new Set(first.blocks.map((b) => b.id));
  const originals = new Map(input.blocks.map((b) => [b.id, b]));
  // A first-pass block the fill had to move keeps its id at its new place; one it kept is identical to the first pass anyway.
  void placedIds;
  const blocks = fill.blocks.map((b) => {
    const was = originals.get(b.id);
    return was && was.date === b.date && was.start === b.start && was.end === b.end && was.state === "committed" ? { ...b, state: "committed" as const } : b;
  });
  // Shortages are measured against everything the deadline needs, not just what the fill pass was asked to place.
  const shortages = fill.shortages.map((x) => { const was = first.shortages.find((f) => f.due === x.due); return was ? { ...x, needed: was.needed, available: Math.max(0, was.needed - x.short) } : x; });
  const risks = [...shortages.map((x) => ({ kind: "shortage" as const, text: `Before ${dayLabel(x.due)} you need ${formatMinutes(x.needed)} and have ${formatMinutes(x.needed - x.short)} free.`, goal: fill.risks.find((r) => r.kind === "shortage" && r.date === x.due)?.goal ?? null, item: null, date: x.due, severity: 3 as const })), ...fill.risks.filter((r) => r.kind !== "shortage")];
  return { ...fill, blocks, shortages, risks, demand: first.demand, kept: first.kept, stats: { ...fill.stats, ms: first.stats.ms + fill.stats.ms, placed: first.stats.placed + fill.stats.placed } };
}

function solveOnce(input: SolveInput): SolveResult {
  const started = Date.now();
  const applied = applyWhatIf(input.snapshot, input.model, input.whatIf);
  const snapshot = applied.snapshot;
  const model = applied.model;
  const ctx: Ctx = {
    snapshot, model, constraints: model.constraints, goals: new Map(model.goals.map((g) => [g.key, g])),
    dayIndex: new Map(snapshot.days.map((d, i) => [d.date, i])), horizon: snapshot.days,
  };
  const H = snapshot.days.length;
  const seed = input.seed ?? hashString(`${snapshot.today}|${model.items.length}`);
  const items = [...model.items, ...expandPractices(model, snapshot)];
  const itemByKey = new Map(items.map((i) => [i.key, i]));
  const originalPinned = new Map(input.blocks.map((b) => [b.id, b.pinned]));
  const kept = input.mode === "repair" ? keepValidBlocks(ctx, input.blocks, itemByKey) : new Set<string>();
  const given = kept.size ? input.blocks.map((b) => (kept.has(b.id) ? { ...b, pinned: true } : b)) : input.blocks;
  const keptMinutes = new Map<string, number>();
  for (const block of input.blocks) if (kept.has(block.id)) keptMinutes.set(block.item, (keptMinutes.get(block.item) ?? 0) + blockMinutes(block));
  const fixed = given.filter((b) => isFixed(b, snapshot));
  const movable = given.filter((b) => !isFixed(b, snapshot) && (b.state === "committed" || b.state === "proposed"));

  // Capacity per day. A plan's own "minutes a day", when the student gave it, is what they say they can sustain for that plan: it lifts the
  // calibrated comfort level (never the hard daily cap), so six hours a day for a licensing exam is planned as six hours, not as a new user's average.
  const { soloOf: soloItem } = capGroups(ctx.constraints);
  const longestSolo = Math.max(0, ...items.filter((i) => i.status === "open" && soloItem(i)).map((i) => i.chunk[0]));
  const asked = Math.max(0, ...ctx.constraints.filter((c): c is Constraint & { kind: "goal_cap" } => c.kind === "goal_cap" && c.provenance === "student").map((c) => c.minutes));
  const capacity = snapshot.days.map((day) => {
    if (isDayOff(ctx, day)) return { cap: 0, comfortable: 0, free: 0, hardCap: 0, sustainable: 0, max: 0 };
    const free = freeIntervals(ctx, day, fixed).reduce((sum, [a, b]) => sum + (b - a >= 15 ? b - a : 0), 0);
    const fixedMinutes = fixed.filter((b) => b.date === day.date && b.state !== "missed" && b.state !== "skipped").reduce((s, b) => s + blockMinutes(b), 0) + (day.date === snapshot.today ? snapshot.studiedToday : 0) + (day.otherWork ?? 0);
    const { hardCap, sustainable: calibrated } = dayCaps(ctx, day);
    const sustainable = Math.max(calibrated, Math.min(hardCap, asked));
    // A day can always hold one full paper (a solo sitting), within the hard cap.
    const ceiling = Math.min(hardCap, Math.max(round5(sustainable * 1.15 + 15), longestSolo));
    const cap = Math.max(0, Math.min(free, ceiling - fixedMinutes));
    const comfortable = Math.max(0, Math.min(cap, round5(sustainable * 0.85) - fixedMinutes));
    // `max` is the most the day could hold under the student's own hard cap: room to fold a small leftover into a session rather than strand it.
    return { cap: floor5(cap), comfortable: floor5(comfortable), free, hardCap, sustainable, max: floor5(Math.max(0, Math.min(free, hardCap - fixedMinutes))) };
  });

  // Weekly budgets beyond the detailed horizon, using the student's usual rest weekdays.
  const restWeekdays = new Set(snapshot.days.filter((d) => d.rest === "fixed").map((d) => d.weekday));
  const lastDue = [...model.goals.map((g) => g.due), ...items.map((i) => i.due)].filter((d): d is string => Boolean(d)).sort().at(-1);
  const horizonEnd = addDays(snapshot.today, H);
  const weekCaps: { week: string; cap: number; offset: number; days: number }[] = [];
  if (lastDue && lastDue >= horizonEnd) {
    const daily = Math.min(snapshot.settings.dailyCap, Math.max(snapshot.calibration.capacity, asked));
    for (let w = 0, cursor = weekStart(horizonEnd); cursor <= lastDue && w < MAX_WEEKS; w++, cursor = addDays(cursor, 7)) {
      let cap = 0; let days = 0;
      for (let k = 0; k < 7; k++) { const date = addDays(cursor, k); if (date >= horizonEnd && !restWeekdays.has(weekdayOf(date))) { cap += daily; days++; } }
      weekCaps.push({ week: cursor, cap: round5(cap * 0.85), offset: w * 7, days });
    }
  }
  const previous = new Map<string, Map<number, number>>();
  for (const block of movable) { const idx = ctx.dayIndex.get(block.date); if (idx == null) continue; const days = previous.get(block.item) ?? new Map<number, number>(); days.set(idx, (days.get(idx) ?? 0) + blockMinutes(block)); previous.set(block.item, days); }

  const demands = buildDemand(ctx, items, fixed);
  // Minutes already fixed on a day count against their cap group's daily limit.
  const fixedSubject = new Map<string, number>();
  const { groupOf: fixedGroupOf } = capGroups(ctx.constraints);
  for (const block of fixed) {
    if (block.state === "missed" || block.state === "skipped") continue;
    const idx = ctx.dayIndex.get(block.date); const item = itemByKey.get(block.item); const group = item ? fixedGroupOf(item) : null;
    if (idx != null && group) fixedSubject.set(`${group}|${idx}`, (fixedSubject.get(`${group}|${idx}`) ?? 0) + blockMinutes(block));
  }
  // Residual work must finish before any successor that stays in place.
  if (kept.size) {
    const firstKept = new Map<string, number>();
    for (const block of input.blocks) {
      if (!kept.has(block.id)) continue;
      const idx = ctx.dayIndex.get(block.date);
      if (idx != null) firstKept.set(block.item, Math.min(firstKept.get(block.item) ?? Infinity, idx));
    }
    for (const d of demands) {
      for (const successor of items) {
        if (!successor.after.includes(d.item.key) || !firstKept.has(successor.key)) continue;
        const gap = SPACED_METHODS.includes(successor.method) && d.item.topics.some((t) => successor.topics.includes(t)) ? SPACING_DAYS : 0;
        d.latest = Math.min(d.latest, firstKept.get(successor.key)! - gap);
        d.capped = true;
      }
    }
  }
  const baseEarliest = new Map(demands.map((d) => [d.item.key, d.earliest]));
  const demandsByKey = new Map(demands.map((d) => [d.item.key, d]));
  let alloc: Allocation = { days: new Map(), weeks: new Map(), overflow: new Map() };
  let iterations = 0;
  let placedBlocks: Block[] = [];
  let unplacedMap = new Map<string, number>();
  // Up to three passes: when a fragmented day cannot hold what allocation gave it, that day's capacity shrinks and the plan is re-solved.
  for (let pass = 0; pass < 3; pass++) {
    for (const d of demands) d.earliest = baseEarliest.get(d.item.key) ?? d.earliest;
    // Static bounds first: a successor cannot start before its predecessor could, and a predecessor must leave its successor room before the deadline.
    for (let k = 0; k < demands.length; k++) {
      let moved = false;
      for (const d of demands) {
        for (const pred of d.item.after) {
          const pd = demandsByKey.get(pred);
          if (!pd) continue;
          const gap = SPACED_METHODS.includes(d.item.method) && pd.item.topics.some((t) => d.item.topics.includes(t)) ? SPACING_DAYS : 0;
          if (d.earliest < pd.earliest + gap) { d.earliest = pd.earliest + gap; moved = true; }
          if (pd.latest > d.latest - gap) { pd.latest = d.latest - gap; moved = true; }
        }
      }
      if (!moved) break;
    }
    // Dependencies: tighten a successor's earliest day until every predecessor's last allocated day comes first (spaced methods need a gap).
    for (let round = 0; round < 10; round++, iterations++) {
      alloc = allocate(ctx, demands, capacity, previous, weekCaps, keptMinutes, fixedSubject);
      consolidate(alloc, demands, capacity, ctx.constraints, fixedSubject);
      let changed = false;
      const lastDay = new Map<string, number>();
      for (const [key, days] of alloc.days) lastDay.set(key, Math.max(...days.keys()));
      // Work budgeted beyond the horizon ends in its latest week: a successor may share that week but never come in an earlier one.
      for (const [key, weeks] of alloc.weeks) if (weeks.size) lastDay.set(key, Math.max(H, ...[...weeks.keys()].map((week) => diffDays(week, snapshot.today))));
      for (const fixedBlock of fixed) { const idx = ctx.dayIndex.get(fixedBlock.date); if (idx != null && fixedBlock.state !== "missed" && fixedBlock.state !== "skipped") lastDay.set(fixedBlock.item, Math.max(lastDay.get(fixedBlock.item) ?? -1, idx)); }
      for (const d of demands) {
        for (const pred of d.item.after) {
          const predItem = itemByKey.get(pred);
          if (!predItem || predItem.status !== "open") continue;
          const predLast = demandsByKey.has(pred) ? lastDay.get(pred) ?? (alloc.overflow.has(pred) ? H + 7 : -1) : lastDay.get(pred) ?? -1;
          if (predLast < 0) continue;
          const spaced = SPACED_METHODS.includes(d.item.method) && predItem.topics.some((t) => d.item.topics.includes(t));
          const need = predLast + (spaced ? SPACING_DAYS : 0);
          if (d.earliest < need) { d.earliest = need; changed = true; }
        }
      }
      if (!changed) break;
    }

    // Phase B.
    placedBlocks = [];
    unplacedMap = new Map(alloc.overflow);
    const shortfall = new Map<number, number>();
    for (let idx = 0; idx < H; idx++) {
      const day = snapshot.days[idx];
      const minutesByItem: [string, number][] = [];
      for (const [key, days] of alloc.days) { const m = days.get(idx); if (m) minutesByItem.push([key, m]); }
      if (!minutesByItem.length) continue;
      minutesByItem.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const fixedOnDay = fixed.filter((b) => b.date === day.date);
      const free = freeIntervals(ctx, day, fixed);
      const { pieces, unplaced } = placeDay(ctx, day, idx, demandsByKey, minutesByItem, free, movable.filter((b) => b.date === day.date), fixedOnDay, seed);
      for (const [key, m] of unplaced) { unplacedMap.set(key, (unplacedMap.get(key) ?? 0) + m); shortfall.set(idx, (shortfall.get(idx) ?? 0) + m); }
      for (const piece of pieces) placedBlocks.push({ id: "", item: piece.item.key, date: day.date, start: piece.start, end: piece.end, state: "proposed", pinned: false, questId: piece.item.questId });
    }
    if (!shortfall.size || pass === 2) break;
    for (const [idx, m] of shortfall) {
      capacity[idx].cap = Math.max(0, capacity[idx].cap - ceil5(m));
      capacity[idx].comfortable = Math.min(capacity[idx].comfortable, capacity[idx].cap);
    }
  }
  const usedIds = new Set(input.blocks.map((b) => b.id));

  // Identity: a placed block inherits the id of the nearest previous block of the same item, so diffs say "moved" rather than "removed and added".
  const prevByItem = new Map<string, Block[]>();
  for (const block of movable) prevByItem.set(block.item, [...(prevByItem.get(block.item) ?? []), block]);
  const matchedPrev = new Map<string, Block>();
  const byItem = new Map<string, Block[]>();
  for (const block of placedBlocks) byItem.set(block.item, [...(byItem.get(block.item) ?? []), block]);
  for (const [item, blocks] of [...byItem.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const candidates = [...(prevByItem.get(item) ?? [])];
    blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    for (const block of blocks) {
      candidates.sort((a, b) => Math.abs(diffDays(a.date, block.date) * 1440 + a.start - block.start) - Math.abs(diffDays(b.date, block.date) * 1440 + b.start - block.start) || (a.id < b.id ? -1 : 1));
      const match = candidates.shift();
      if (match) {
        block.id = match.id;
        matchedPrev.set(block.id, match);
        if (match.date === block.date && match.start === block.start && match.end === block.end && match.state === "committed") block.state = "committed";
      } else {
        let n = 1;
        const base = `b_${hashString(`${item}|${block.date}|${block.start}`).toString(36)}`;
        let id = base;
        while (usedIds.has(id)) id = `${base}_${++n}`;
        block.id = id;
      }
      usedIds.add(block.id);
    }
  }

  const blocks = [...fixed.map((b) => ({ ...b, pinned: kept.has(b.id) ? originalPinned.get(b.id) ?? false : b.pinned })), ...placedBlocks].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || (a.id < b.id ? -1 : 1));

  // Phase C.
  const reasons: Record<string, Reason[]> = {};
  // Items with nothing left to place still explain their blocks.
  const info = new Map(buildDemand(ctx, items, []).map((d) => [d.item.key, d]));
  for (const block of blocks) reasons[block.id] = reasonsFor(ctx, block, demandsByKey.get(block.item) ?? info.get(block.item), matchedPrev.get(block.id), blocks);

  const weekBudgets: WeekBudget[] = [];
  for (const [item, weeks] of [...alloc.weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) for (const [week, minutes] of [...weeks.entries()].sort()) weekBudgets.push({ week, item, minutes });
  const unplaced = [...unplacedMap.entries()].filter(([, m]) => m > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([item, minutes]) => ({ item, minutes }));

  const days: DayLoad[] = snapshot.days.map((day, idx) => {
    const planned = blocks.filter((b) => b.date === day.date && b.state !== "missed" && b.state !== "skipped").reduce((s, b) => s + blockMinutes(b), 0);
    return { date: day.date, capacity: capacity[idx].cap + fixed.filter((b) => b.date === day.date && b.state !== "missed" && b.state !== "skipped").reduce((s, b) => s + blockMinutes(b), 0), planned, sustainable: isDayOff(ctx, day) ? 0 : capacity[idx].sustainable, free: capacity[idx].free, rest: isDayOff(ctx, day) };
  });

  // Shortages, measured against each deadline that has unplaced work.
  const shortages: Shortage[] = [];
  const dues = [...new Set(unplaced.map((u) => demandsByKey.get(u.item)).filter((d) => d && !d.virtual).map((d) => d!.due).filter((d): d is string => Boolean(d)))].sort();
  for (const due of dues) {
    const dueIdx = diffDays(due, snapshot.today);
    const inScope = demands.filter((d) => !d.virtual && d.due && d.due <= due);
    const needed = inScope.reduce((s, d) => s + d.remaining, 0);
    const available = capacity.slice(0, Math.min(H, dueIdx + 1)).reduce((s, c) => s + c.cap, 0) + weekCaps.filter((w) => addDays(w.week, 6) <= due).reduce((s, w) => s + w.cap, 0);
    const short = unplaced.filter((u) => { const d = demandsByKey.get(u.item); return d && !d.virtual && d.due && d.due <= due; }).reduce((s, u) => s + u.minutes, 0);
    if (short > 0) shortages.push({ due, needed, available: Math.max(0, Math.min(available, needed - short)), short, items: unplaced.filter((u) => { const d = demandsByKey.get(u.item); return d && !d.virtual && d.due === due; }).map((u) => u.item) });
  }

  const risks: Risk[] = [];
  for (const s of shortages) risks.push({ kind: "shortage", text: `Before ${dayLabel(s.due)} you need ${formatMinutes(s.needed)} and have ${formatMinutes(s.needed - s.short)} free.`, goal: demandsByKey.get(s.items[0])?.goal?.key ?? null, item: null, date: s.due, severity: 3 });
  for (const goal of model.goals) {
    if (goal.status !== "active" || !goal.due) continue;
    const goalDemands = demands.filter((d) => d.goal?.key === goal.key);
    if (!goalDemands.length) continue;
    if (shortages.some((s) => s.items.some((i) => goalDemands.some((d) => d.item.key === i)))) continue;
    const remaining = goalDemands.reduce((s, d) => s + d.remaining, 0);
    const extra = goalDemands.reduce((s, d) => s + Math.max(0, calibratedEstimate(d.item, snapshot.calibration)[1] - d.target), 0);
    const dueIdx = Math.min(H - 1, diffDays(goal.due, snapshot.today));
    const slack = dueIdx < 0 ? 0 : days.slice(0, dueIdx + 1).reduce((s, d) => s + Math.max(0, d.capacity - d.planned), 0);
    if (diffDays(goal.due, snapshot.today) < H && slack < Math.max(extra, remaining * 0.2)) risks.push({ kind: "deadline", text: `${goal.title} has little slack: ${formatMinutes(slack)} free before ${dayLabel(goal.due)} if work runs long.`, goal: goal.key, item: null, date: goal.due, severity: 2 });
  }
  let streak = 0;
  for (const day of days) {
    streak = !day.rest && day.planned > day.sustainable * 1.15 ? streak + 1 : 0;
    if (streak === 3) risks.push({ kind: "overload", text: `Three heavy days in a row up to ${dayLabel(day.date)}: more than you usually sustain.`, goal: null, item: null, date: day.date, severity: 2 });
  }
  for (const goal of model.goals) {
    if (goal.status !== "active") continue;
    const own = demands.filter((d) => d.goal?.key === goal.key);
    if (own.length && !blocks.some((b) => own.some((d) => d.item.key === b.item)) && !weekBudgets.some((w) => own.some((d) => d.item.key === w.item))) risks.push({ kind: "neglected", text: `${goal.title} has nothing scheduled yet.`, goal: goal.key, item: null, date: null, severity: 1 });
  }

  const weekDays = days.slice(0, 7);
  const atRisk = model.goals.filter((g) => g.status === "active" && g.due && risks.some((r) => r.goal === g.key && (r.kind === "shortage" || r.kind === "deadline"))).map((g) => ({ goal: g.key, title: g.title, due: g.due!, short: shortages.filter((s) => s.items.some((i) => demandsByKey.get(i)?.goal?.key === g.key)).reduce((s, x) => s + x.short, 0) }));
  const exam = model.goals.filter((g) => g.status === "active" && g.type === "exam" && g.due && g.due >= snapshot.today).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const health = {
    plannedMinutes: weekDays.reduce((s, d) => s + d.planned, 0),
    capacityMinutes: weekDays.reduce((s, d) => s + d.capacity, 0),
    sustainableMinutes: weekDays.reduce((s, d) => s + (d.rest ? 0 : d.sustainable), 0),
    atRisk,
    nextExam: exam ? { goal: exam.key, title: exam.title, due: exam.due! } : null,
  };
  const demand = demands.map((d) => ({ item: d.item.key, minutes: d.remaining, target: d.target, title: d.item.title, virtual: d.virtual }));
  return { blocks, weekBudgets, unplaced, shortages, days, reasons, risks, health, demand, kept: [...kept].sort(), stats: { items: demands.length, placed: placedBlocks.length, ms: Date.now() - started, iterations: iterations + 1 } };
}

export { UNIT as SOLVER_UNIT };
