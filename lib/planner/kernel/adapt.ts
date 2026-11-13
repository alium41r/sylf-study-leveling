// The adaptation loop's deterministic half: repairs after something changed, how big the change is, and the signals that surface where the student
// already is. Repairs move as little as possible, never move what the student pinned, and call no model.
import { addDays, dayLabel, diffDays, formatMinutes, weekdayOf } from "./dates";
import { diffPlans, type PlanDiff } from "./diff";
import { solve, type SolveResult, type WhatIf } from "./solver";
import { verify, type Verification } from "./verify";
import type { Autonomy, Block, PlanningSnapshot, WorkModel } from "./contracts";

export type RepairEvent =
  | { kind: "session_ended"; item: string | null }
  | { kind: "block_missed"; block: string }
  | { kind: "block_skipped"; block: string }
  | { kind: "calendar_changed" }
  | { kind: "quest_finished"; item: string }
  | { kind: "day_changed" }
  | { kind: "manual" };

export interface PlanCandidate { model: WorkModel; result: SolveResult; verification: Verification; diff: PlanDiff }

/** Solves, verifies and diffs against the committed plan in one step. */
export function propose(snapshot: PlanningSnapshot, committed: { model: WorkModel; blocks: readonly Block[] }, model: WorkModel, whatIf?: WhatIf | null, seed?: number, mode: "full" | "repair" = "full"): PlanCandidate {
  const input = { snapshot, model, blocks: committed.blocks, whatIf: whatIf ?? null, seed, mode };
  const result = solve(input);
  const verification = verify(input, result);
  const diff = diffPlans(committed, { blocks: result.blocks, model }, snapshot.today);
  return { model, result, verification, diff };
}

export type ChangeSize = "none" | "small" | "large" | "infeasible";
/**
 * Small: only same-day shifts or moves into the next free day for at most three sessions, nothing removed, no new shortage.
 * The next 48 hours count most: moving more than one session inside them is large.
 */
export function classifyChange(candidate: PlanCandidate, before: SolveResult | null, today: string): ChangeSize {
  const { diff, result } = candidate;
  if (diff.empty) return "none";
  const newShort = result.shortages.reduce((s, x) => s + x.short, 0) > (before?.shortages.reduce((s, x) => s + x.short, 0) ?? 0);
  if (newShort) return "infeasible";
  if (diff.counts.removed || diff.items.added.length || diff.items.removed.length || diff.goals.added.length || diff.goals.dropped.length) return "large";
  const moved = diff.changes.filter((c) => c.kind === "moved" || c.kind === "resized" || c.kind === "added");
  const near = moved.filter((c) => diffDays((c.before ?? c.after)!.date, today) < 2).length;
  const far = moved.some((c) => c.before && c.after && Math.abs(diffDays(c.after.date, c.before.date)) > 1);
  if (moved.length <= 3 && near <= 2 && !far) return "small";
  return "large";
}

/** Whether a repair of this size applies by itself under the student's autonomy setting. Destructive changes never do. */
export function autoApplies(size: ChangeSize, autonomy: Autonomy): boolean {
  if (size === "none") return true;
  if (size === "infeasible") return false;
  if (autonomy === "AUTOPILOT") return true;
  if (autonomy === "SMART") return size === "small";
  return false;
}

/** Marks committed blocks in the past that were not done as missed, so repair re-places their minutes. */
export function markMissed(blocks: readonly Block[], snapshot: Pick<PlanningSnapshot, "today" | "nowMinute">, studied: (item: string, date: string) => boolean): Block[] {
  return blocks.map((block) => {
    if (block.state !== "committed") return block;
    const past = block.date < snapshot.today || (block.date === snapshot.today && block.end <= snapshot.nowMinute);
    if (!past) return block;
    return { ...block, state: studied(block.item, block.date) ? "done" : "missed" };
  });
}

export function repair(snapshot: PlanningSnapshot, committed: { model: WorkModel; blocks: readonly Block[] }, event: RepairEvent, previous: SolveResult | null, seed?: number): { candidate: PlanCandidate; size: ChangeSize; event: RepairEvent } {
  const model = committed.model;
  const candidate = propose(snapshot, committed, model, null, seed, "repair");
  return { candidate, size: classifyChange(candidate, previous, snapshot.today), event };
}

export type SignalKind = "deadline_risk" | "overload" | "untouched_goal" | "exam_checkpoint" | "block_soon" | "missed";
export interface SignalAction { label: string; kind: "whatif" | "command" | "open" | "start"; whatIf?: WhatIf; command?: string; block?: string }
export interface Signal { kind: SignalKind; title: string; detail: string; goal: string | null; date: string | null; severity: 1 | 2 | 3; actions: SignalAction[] }

/** Deterministic monitors. Each signal carries one to three pre-solved actions. */
export function signals(snapshot: PlanningSnapshot, model: WorkModel, result: SolveResult, lastStudied: Record<string, string | null>, blocks: readonly Block[]): Signal[] {
  const out: Signal[] = [];
  const titleOf = (key: string | null) => model.goals.find((g) => g.key === key)?.title ?? "A goal";
  for (const shortage of result.shortages.slice(0, 1)) {
    const weekend = result.days.find((d) => d.date <= shortage.due && d.date >= snapshot.today && (weekdayOf(d.date) === 6 || weekdayOf(d.date) === 0));
    const early = result.days.find((d) => !d.rest && d.date <= shortage.due && d.date > snapshot.today);
    const goal = model.items.find((i) => i.key === shortage.items[0])?.goal ?? null;
    const actions: SignalAction[] = [];
    if (weekend) actions.push({ label: `Add ${dayLabel(weekend.date)} morning`, kind: "whatif", whatIf: { extraWindows: [{ date: weekend.date, start: 9 * 60, end: 12 * 60 }] } });
    else if (early) actions.push({ label: `Start earlier on ${dayLabel(early.date)}`, kind: "whatif", whatIf: { extraWindows: [{ date: early.date, start: Math.max(6 * 60, snapshot.settings.dayStart - 120), end: snapshot.settings.dayStart }] } });
    if (goal) actions.push({ label: "Compress review", kind: "whatif", whatIf: { compress: [{ goal, fraction: 0.3 }] } });
    if (goal && model.goals.find((g) => g.key === goal)?.type !== "exam") actions.push({ label: "Extend the deadline 2 days", kind: "whatif", whatIf: { extendDue: [{ goal, days: 2 }] } });
    out.push({ kind: "deadline_risk", title: `You are ${formatMinutes(shortage.short)} short before ${dayLabel(shortage.due)}`, detail: `You need ${formatMinutes(shortage.needed)} and have ${formatMinutes(shortage.needed - shortage.short)} free.`, goal, date: shortage.due, severity: 3, actions });
  }
  for (const risk of result.risks) {
    if (risk.kind === "deadline") out.push({ kind: "deadline_risk", title: `${titleOf(risk.goal)} is tight`, detail: risk.text, goal: risk.goal, date: risk.date, severity: 2, actions: [{ label: "Start earlier", kind: "whatif", whatIf: { startEarlier: 2 } }] });
    if (risk.kind === "overload") out.push({ kind: "overload", title: "Heavy days ahead", detail: risk.text, goal: null, date: risk.date, severity: 2, actions: [{ label: "Cap days at your usual amount", kind: "whatif", whatIf: { dailyCap: snapshot.calibration.capacity } }] });
  }
  for (const goal of model.goals) {
    if (goal.status !== "active") continue;
    const last = lastStudied[goal.key];
    const hasWork = model.items.some((i) => i.goal === goal.key && i.status === "open");
    if (hasWork && (!last || diffDays(snapshot.today, last) >= 7) && model.items.some((i) => i.goal === goal.key && i.done > 0)) out.push({ kind: "untouched_goal", title: `${goal.title} has waited a week`, detail: "Nothing has been studied for it in seven days.", goal: goal.key, date: null, severity: 1, actions: [{ label: "Open it", kind: "open" }] });
    if (goal.type === "exam" && goal.due) {
      const left = diffDays(goal.due, snapshot.today);
      if (left === 14 || left === 7 || left === 2) out.push({ kind: "exam_checkpoint", title: `${left} days to ${goal.title}`, detail: left === 2 ? "From here: light review and sleep. No new topics after tomorrow." : left === 7 ? "One week out: a timed paper this week shows what is left." : "Two weeks out: every topic should have had its first retrieval.", goal: goal.key, date: goal.due, severity: left === 2 ? 2 : 1, actions: [] });
    }
  }
  const next = blocks.filter((b) => b.date === snapshot.today && b.state === "committed" && b.start >= snapshot.nowMinute).sort((a, b) => a.start - b.start)[0];
  if (next && next.start - snapshot.nowMinute <= 10) out.push({ kind: "block_soon", title: "Next session starts soon", detail: model.items.find((i) => i.key === next.item)?.title ?? "Study session", goal: null, date: next.date, severity: 1, actions: [{ label: "Start", kind: "start", block: next.id }, { label: "Push later", kind: "command", command: "push later" }] });
  const missed = blocks.filter((b) => b.state === "missed" && b.date >= addDays(snapshot.today, -2));
  if (missed.length) out.push({ kind: "missed", title: `${missed.length} session${missed.length === 1 ? "" : "s"} missed`, detail: "Their time can be found elsewhere this week.", goal: null, date: missed[0].date, severity: 2, actions: [{ label: "Find new time", kind: "command", command: "repair" }] });
  return out.sort((a, b) => b.severity - a.severity).slice(0, 6);
}
