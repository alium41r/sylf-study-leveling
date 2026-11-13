// Every change reaches the student as a diff they can accept, adjust or undo. Blocks are matched by id (the solver keeps ids for moved blocks), so the
// summary reads "4 sessions added · 3 moved · Thursday evening freed" rather than a wall of removals and additions.
import { dayLabel, weekdayName, weekdayOf } from "./dates";
import { blockMinutes, type Block, type WorkModel } from "./contracts";

export type ChangeKind = "added" | "moved" | "removed" | "resized";
export interface Slot { date: string; start: number; end: number }
export interface BlockChange { kind: ChangeKind; id: string; item: string; title: string; before: Slot | null; after: Slot | null }
export interface PlanDiff {
  changes: BlockChange[];
  counts: Record<ChangeKind, number>;
  items: { added: string[]; removed: string[]; updated: string[] };
  goals: { added: string[]; dropped: string[] };
  constraints: { added: string[]; removed: string[] };
  freed: { date: string; part: "morning" | "afternoon" | "evening" }[];
  minutesDelta: number;
  summary: string;
  empty: boolean;
}

const live = (b: Block, today: string) => b.date >= today && (b.state === "committed" || b.state === "proposed");
const slot = (b: Block): Slot => ({ date: b.date, start: b.start, end: b.end });
const part = (minute: number): "morning" | "afternoon" | "evening" => (minute < 12 * 60 ? "morning" : minute < 17 * 60 ? "afternoon" : "evening");

export function diffPlans(before: { blocks: readonly Block[]; model: WorkModel }, after: { blocks: readonly Block[]; model: WorkModel }, today: string): PlanDiff {
  const title = (key: string) => after.model.items.find((i) => i.key === key)?.title ?? before.model.items.find((i) => i.key === key)?.title
    ?? after.model.practices.find((p) => key.startsWith(`${p.key}@`))?.title ?? before.model.practices.find((p) => key.startsWith(`${p.key}@`))?.title ?? "Study session";
  const a = new Map(before.blocks.filter((b) => live(b, today)).map((b) => [b.id, b]));
  const b = new Map(after.blocks.filter((x) => live(x, today)).map((x) => [x.id, x]));
  const changes: BlockChange[] = [];
  for (const [id, next] of b) {
    const prev = a.get(id);
    if (!prev) { changes.push({ kind: "added", id, item: next.item, title: title(next.item), before: null, after: slot(next) }); continue; }
    if (prev.date !== next.date || prev.start !== next.start) changes.push({ kind: "moved", id, item: next.item, title: title(next.item), before: slot(prev), after: slot(next) });
    else if (prev.end !== next.end) changes.push({ kind: "resized", id, item: next.item, title: title(next.item), before: slot(prev), after: slot(next) });
  }
  for (const [id, prev] of a) if (!b.has(id)) changes.push({ kind: "removed", id, item: prev.item, title: title(prev.item), before: slot(prev), after: null });
  changes.sort((x, y) => ((x.after ?? x.before)!.date).localeCompare((y.after ?? y.before)!.date) || (x.after ?? x.before)!.start - (y.after ?? y.before)!.start || (x.id < y.id ? -1 : 1));
  const counts: Record<ChangeKind, number> = { added: 0, moved: 0, removed: 0, resized: 0 };
  for (const change of changes) counts[change.kind]++;

  const beforeItems = new Map(before.model.items.map((i) => [i.key, i]));
  const afterItems = new Map(after.model.items.map((i) => [i.key, i]));
  const items = { added: [] as string[], removed: [] as string[], updated: [] as string[] };
  for (const [key, item] of afterItems) {
    const prev = beforeItems.get(key);
    if (!prev || (prev.status !== "open" && item.status === "open")) items.added.push(key);
    else if (prev.status === "open" && item.status !== "open") items.removed.push(key);
    else if (JSON.stringify({ ...prev, done: 0, questId: null }) !== JSON.stringify({ ...item, done: 0, questId: null })) items.updated.push(key);
  }
  for (const key of beforeItems.keys()) if (!afterItems.has(key) && beforeItems.get(key)!.status === "open") items.removed.push(key);
  const goals = {
    added: after.model.goals.filter((g) => g.status === "active" && !before.model.goals.some((p) => p.key === g.key && p.status === "active")).map((g) => g.key),
    dropped: after.model.goals.filter((g) => g.status === "dropped" && before.model.goals.some((p) => p.key === g.key && p.status !== "dropped")).map((g) => g.key),
  };
  const constraints = {
    added: after.model.constraints.filter((c) => !before.model.constraints.some((p) => p.key === c.key && JSON.stringify(p) === JSON.stringify(c))).map((c) => c.label),
    removed: before.model.constraints.filter((c) => !after.model.constraints.some((p) => p.key === c.key)).map((c) => c.label),
  };

  // A day part is freed when it had sessions before and has none after.
  const parts = (list: Iterable<Block>) => { const set = new Set<string>(); for (const block of list) set.add(`${block.date}|${part(block.start)}`); return set; };
  const was = parts(a.values()); const now = parts(b.values());
  const freed = [...was].filter((key) => !now.has(key)).sort().map((key) => { const [date, p] = key.split("|"); return { date, part: p as "morning" | "afternoon" | "evening" }; });
  const minutesDelta = [...b.values()].reduce((s, x) => s + blockMinutes(x), 0) - [...a.values()].reduce((s, x) => s + blockMinutes(x), 0);

  const words: string[] = [];
  if (counts.added) words.push(`${counts.added} session${counts.added === 1 ? "" : "s"} added`);
  if (counts.moved) words.push(`${counts.moved} moved`);
  if (counts.resized) words.push(`${counts.resized} resized`);
  if (counts.removed) words.push(`${counts.removed} removed`);
  if (freed.length) words.push(`${weekdayName(weekdayOf(freed[0].date), true)} ${freed[0].part} freed`);
  if (!changes.length && (items.added.length || items.removed.length || constraints.added.length || constraints.removed.length)) words.push("Plan details updated");
  const summary = words.length ? words.join(" · ") : "No changes";
  return { changes, counts, items, goals, constraints, freed, minutesDelta, summary, empty: !changes.length && !items.added.length && !items.removed.length && !items.updated.length && !goals.added.length && !goals.dropped.length && !constraints.added.length && !constraints.removed.length };
}

/** "Moved from Wed 26 Nov 15:00 to Thu 27 Nov 19:30" for a screen reader or a tooltip. */
export function describeChange(change: BlockChange, clock: (minute: number) => string): string {
  const at = (s: Slot) => `${dayLabel(s.date)} ${clock(s.start)}`;
  switch (change.kind) {
    case "added": return `${change.title}: added ${at(change.after!)}`;
    case "removed": return `${change.title}: removed from ${at(change.before!)}`;
    case "moved": return `${change.title}: moved from ${at(change.before!)} to ${at(change.after!)}`;
    case "resized": return `${change.title}: now ${change.after!.end - change.after!.start} min`;
  }
}
