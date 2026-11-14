// Pure helpers for the Planning Studio's views: what a block is called, its colour, what a day holds, and how a week reads aloud. No React here, so
// every rule is tested without rendering.
import { planning } from "@sylf/shared";

type Block = planning.Block;
type Model = planning.WorkModel;
type Snapshot = planning.PlanningSnapshot;

export const { dayLabel, clockLabel, formatMinutes, addDays, weekdayOf, diffDays } = planning;

export const FALLBACK_SUBJECT = "#8B8B99";
export const live = (block: Block) => block.state === "committed" || block.state === "proposed";

export function itemOf(model: Model, key: string): planning.WorkItem | null {
  const item = model.items.find((i) => i.key === key);
  if (item) return item;
  const at = key.indexOf("@");
  if (at < 0) return null;
  const practice = model.practices.find((p) => p.key === key.slice(0, at));
  return practice ? { key, goal: practice.goal, title: practice.title, kind: "practice", subject: practice.subject, topics: [], est: [practice.minutes, practice.minutes], chunk: [practice.minutes, practice.minutes, practice.minutes], earliest: key.slice(at + 1), due: key.slice(at + 1), after: [], load: 2, method: practice.method, source: "system", confidence: 1, done: 0, status: "open", questId: null, firstStep: null, note: null } : null;
}
export const titleOf = (model: Model, key: string) => itemOf(model, key)?.title ?? "Study session";

export function subjectColour(snapshot: Snapshot, subject: number | null | undefined): string {
  const found = subject == null ? null : snapshot.subjects.find((s) => s.id === subject);
  return found?.color && /^#[0-9a-f]{6}$/i.test(found.color) ? found.color : FALLBACK_SUBJECT;
}

export const blockMinutes = (block: Pick<Block, "start" | "end">) => Math.max(0, block.end - block.start);

/** The days a Week view shows: seven days from `start`, inside the snapshot's horizon. */
export function weekDays(snapshot: Snapshot, page: number): planning.SnapshotDay[] {
  return snapshot.days.slice(page * 7, page * 7 + 7);
}

/** The visible hour range: the study day, widened to hold every commitment and block shown. */
export function hourRange(snapshot: Snapshot, blocks: readonly Block[], days: readonly planning.SnapshotDay[]): [number, number] {
  let from = snapshot.settings.dayStart; let to = snapshot.settings.dayEnd;
  const dates = new Set(days.map((d) => d.date));
  for (const day of days) for (const busy of day.busy) { from = Math.min(from, busy.start); to = Math.max(to, busy.end); }
  for (const block of blocks) if (dates.has(block.date)) { from = Math.min(from, block.start); to = Math.max(to, block.end); }
  return [Math.max(0, Math.floor(from / 60)), Math.min(24, Math.ceil(to / 60))];
}

/** A day's summary for a screen reader: "Tue 25 Nov: 3 sessions, 2 h 15 m, 1 commitment." */
export function daySummary(day: planning.SnapshotDay, blocks: readonly Block[], model: Model): string {
  const own = blocks.filter((b) => b.date === day.date && b.state !== "skipped");
  const minutes = own.filter(live).reduce((s, b) => s + blockMinutes(b), 0);
  const parts = [dayLabel(day.date)];
  if (day.rest) parts.push("rest day");
  if (own.length) parts.push(`${own.length} session${own.length === 1 ? "" : "s"}, ${formatMinutes(minutes)}`);
  if (day.busy.length) parts.push(`${day.busy.length} commitment${day.busy.length === 1 ? "" : "s"}`);
  const first = own.filter(live).sort((a, b) => a.start - b.start)[0];
  if (first) parts.push(`first: ${titleOf(model, first.item)} at ${clockLabel(first.start)}`);
  return `${parts.join(", ")}.`;
}

/** Goal progress as minutes done against the calibrated total. */
export function goalProgress(model: Model, snapshot: Snapshot, goal: string): { done: number; total: number; items: number; finished: number } {
  const items = model.items.filter((i) => i.goal === goal && i.status !== "dropped");
  let done = 0; let total = 0;
  for (const item of items) {
    const [p50] = planning.calibratedEstimate(item, snapshot.calibration);
    total += Math.max(p50, item.done);
    done += item.status === "done" ? Math.max(p50, item.done) : Math.min(item.done, p50);
  }
  return { done, total, items: items.length, finished: items.filter((i) => i.status === "done").length };
}

export const ESTIMATE = (item: planning.WorkItem, snapshot: Snapshot) => {
  const [p50, p80] = planning.calibratedEstimate(item, snapshot.calibration);
  return p50 === p80 ? formatMinutes(p50) : `${formatMinutes(p50)}–${formatMinutes(p80)}`;
};

const METHOD_WORDS: Partial<Record<planning.Method, string>> = {
  diagnostic: "Diagnostic", learn: "Learn", worked_examples: "Worked examples", retrieval: "Retrieval", spaced_review: "Spaced review", problem_solving: "Problems",
  timed_paper: "Timed paper", error_log: "Error log", reading: "Reading", research: "Research", outline: "Outline", drafting: "Drafting", revising: "Revising",
  final_check: "Final check", practice: "Practice", notes: "Notes", admin: "Admin",
};
export const methodLabel = (method: planning.Method) => METHOD_WORDS[method] ?? method;

/** Questions go to the planner's answer path rather than becoming changes. */
export const isQuestion = (text: string) => /\?\s*$/.test(text.trim()) || /^(am|is|are|how|what|when|why|which|will|should|can|do|does)\b/i.test(text.trim());

/** The next session the student can start: today's first block that has not ended. */
export function nextBlock(blocks: readonly Block[], snapshot: Snapshot): Block | null {
  return blocks.filter((b) => b.state === "committed" && (b.date > snapshot.today || (b.date === snapshot.today && b.end > snapshot.nowMinute))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0] ?? null;
}

/** Snaps a drag position to the 15-minute grid inside the visible hours. */
export function snapMinute(minute: number, length: number, range: [number, number]): number {
  const snapped = Math.round(minute / 15) * 15;
  return Math.max(range[0] * 60, Math.min(range[1] * 60 - length, snapped));
}

export const RELATIVE = (date: string, today: string) => {
  const delta = diffDays(date, today);
  return delta === 0 ? "today" : delta === 1 ? "tomorrow" : delta > 1 && delta < 7 ? `in ${delta} days` : dayLabel(date);
};

const ROLE_WORDS: Record<planning.StudyRole, string> = {
  revise: "Revision", practise: "Practice", mixed: "Mixed review", paper: "Timed paper", corrections: "Corrections", weak: "Weak topics", final: "Final review",
  learn: "Study", recall: "Recall check", checkpoint: "Checkpoint", lesson: "Lesson", milestone: "Milestone", read: "Reading",
};
/** What a session is, in the words a student uses: "Revision", "Timed paper"; the study method for work that was not compiled from a syllabus. */
export const sessionLabel = (item: Pick<planning.WorkItem, "method" | "details">) => (item.details ? ROLE_WORDS[item.details.role] : methodLabel(item.method));

export const CONFIDENCE_WORDS: Record<planning.Confidence, string> = { weak: "Weak", okay: "Okay", strong: "Strong" };
export const SOURCE_WORDS: Record<planning.Syllabus["source"], string> = {
  catalog: "From Sylf's checked syllabus",
  model: "From the AI · check against your syllabus",
  student: "From your list",
  subject: "From your Sylf syllabus",
};

export const PRESET_WORDS: Record<planning.PlanPreset | "auto", { label: string; icon: string; due: string; detail: string }> = {
  auto: { label: "Auto", icon: "auto", due: "Date", detail: "The planner picks the best shape" },
  exam: { label: "Exam", icon: "paper", due: "Exam date", detail: "Revise every topic, past papers, a light final day" },
  course: { label: "Whole course", icon: "layers", due: "Finish by", detail: "Learn a full syllabus over weeks or months" },
  mastery: { label: "Topic mastery", icon: "focus", due: "Finish by", detail: "Learn one chapter or topic deeply" },
  skill: { label: "Skill", icon: "progress", due: "Target date", detail: "Practise a skill, with or without a deadline" },
  assignment: { label: "Assignment", icon: "notes", due: "Due", detail: "Essay, report, project or problem set" },
  reading: { label: "Reading", icon: "resources", due: "Finish by", detail: "A book or reading list, part by part" },
};

/** Where a plan's topics came from, in a few words. */
export function sourceWords(syllabus: planning.Syllabus): string {
  if (syllabus.library?.reused) return syllabus.library.trust === "CHECKED" ? "From Sylf's syllabus library · checked" : "From Sylf's syllabus library";
  if (syllabus.library) return syllabus.library.trust === "CHECKED" ? "Researched and double-checked" : "From the AI · no sources found";
  return SOURCE_WORDS[syllabus.source];
}

/** Where a topic stands: revised, practised, or when its next session is. */
export function unitStatus(model: Model, goal: string, unit: string, blocks: readonly Block[]): { revised: boolean; practised: boolean; next: string | null; sessions: number } {
  const items = model.items.filter((i) => i.goal === goal && i.status !== "dropped" && i.details?.units.includes(unit) && (i.details.role === "revise" || i.details.role === "practise"));
  const done = (role: planning.StudyRole) => items.some((i) => i.details!.role === role && i.status === "done");
  const keys = new Set(items.map((i) => i.key));
  const next = blocks.filter((b) => keys.has(b.item) && live(b)).map((b) => b.date).sort()[0] ?? null;
  return { revised: done("revise"), practised: done("practise"), next, sessions: items.length };
}

/** A goal's sessions day by day, from the blocks shown, in time order. */
export function agendaFor(model: Model, goal: string, blocks: readonly Block[]): { date: string; blocks: Block[] }[] {
  const own = new Set(model.items.filter((i) => i.goal === goal).map((i) => i.key));
  const byDate = new Map<string, Block[]>();
  for (const block of blocks) {
    if (!own.has(block.item) || block.state === "skipped") continue;
    byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, list]) => ({ date, blocks: list.sort((a, b) => a.start - b.start) }));
}

/** "Fri 13 Nov – Thu 26 Nov", or one day. */
/** How far away a chosen day is, under a date field: "Today", "Tomorrow", "17 days from today". */
export function daysAway(day: string, today: string) {
  const delta = diffDays(day, today);
  return delta === 0 ? "Today" : delta === 1 ? "Tomorrow" : delta > 1 ? `${delta} days from today` : delta === -1 ? "Yesterday" : `${-delta} days ago`;
}
export const dateSpan = (from: string | null, to: string | null) => (!from ? "not scheduled yet" : !to || to === from ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);

const SHORT_ROLE: Record<planning.StudyRole, string> = {
  revise: "Revision", practise: "Practice", mixed: "Mixed review", paper: "Timed paper", corrections: "Corrections", weak: "Weak topics", final: "Final review",
  learn: "Study", recall: "Recall", checkpoint: "Test", lesson: "Lesson", milestone: "Milestone", read: "Reading",
};
/**
 * A block's label for a narrow column: the topic on the first line and what kind of session on the second ("Functions" / "Past papers"), so a
 * week beside the study guide never breaks a word in half. Work that was not compiled from a syllabus keeps its title.
 */
export function compactLabel(item: planning.WorkItem | null): { title: string; sub: string | null } {
  if (!item) return { title: "Study", sub: null };
  const d = item.details;
  if (!d) return { title: item.title, sub: null };
  switch (d.role) {
    case "revise": return { title: item.title.replace(/\s+(revision|quick check)$/i, ""), sub: /quick check$/i.test(item.title) ? "Quick check" : SHORT_ROLE.revise };
    case "practise": return { title: item.title.replace(/\s+(past paper practice|practice questions|extra practice|practice(?: \d+)?)$/i, ""), sub: /extra practice$/i.test(item.title) ? "Extra practice" : /past paper/i.test(item.title) ? "Past papers" : SHORT_ROLE.practise };
    case "learn": return { title: item.title.replace(/\s+study$/i, ""), sub: SHORT_ROLE.learn };
    case "lesson": return { title: item.title.replace(/\s+lesson$/i, ""), sub: SHORT_ROLE.lesson };
    case "milestone": return { title: item.title.replace(/\s+milestone check$/i, ""), sub: SHORT_ROLE.milestone };
    case "read": return { title: item.title.replace(/^Read:?\s+/i, ""), sub: SHORT_ROLE.read };
    case "recall": return { title: SHORT_ROLE.recall, sub: d.units.length > 1 ? `${d.units.length} topics` : null };
    case "checkpoint": return { title: item.title === "Mastery test" ? "Mastery test" : "Checkpoint", sub: `${d.units.length} topics` };
    case "mixed": return { title: SHORT_ROLE.mixed, sub: `${d.units.length} topic${d.units.length === 1 ? "" : "s"}` };
    case "paper": return { title: SHORT_ROLE.paper, sub: item.title.replace(/\s*timed past paper.*$/i, "") || null };
    default: return { title: SHORT_ROLE[d.role], sub: null };
  }
}
