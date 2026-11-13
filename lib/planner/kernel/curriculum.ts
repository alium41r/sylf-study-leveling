// The study-path compiler: a syllabus in, a complete exam plan out. The language model (or Sylf's syllabus catalog, or the student's own topic list)
// says WHAT the exam covers, topic by topic with key points; this file decides HOW to prepare it, from learning science, and roughly WHEN, as date
// windows; the solver then fits every session into real free time and proves it. The shape follows what a good tutor would write:
//
//   1. Topic by topic, in syllabus order: a revision session for the key points, then past paper practice on that topic.
//   2. Mixed reviews of every three topics, at least two days later, so earlier topics are recalled before they fade.
//   3. Full timed past papers at the real exam length, each followed by corrections; then the weak topics those papers expose.
//   4. A light formula-sheet review the day before. Nothing new in the final 24 hours, and nothing on exam day.
//
// Sessions have deterministic keys (`<goal>.rev.u3`), so re-compiling after the student rates a topic or unticks one updates the same sessions,
// keeps their quests and blocks where they are, and never touches work already studied. Pure, no I/O, no Intl: identical on the server and the device.
import { addDays, diffDays, formatMinutes, round5, weekdayOf } from "./dates";
import { normalizeSizes } from "./operations";
import {
  type Confidence, type ItemDetails, type ItemKind, type KGoal, type Load, type Method, type PlanningSnapshot, type Source, type StudyRole, type Syllabus,
  type SyllabusPaper, type SyllabusUnit, type WorkItem, type WorkModel,
} from "./contracts";

export interface PathSummary {
  topics: number;
  revise: number;
  practise: number;
  mixed: number;
  papers: number;
  sessions: number;
  minutes: number;
  /** Study days the path is spread over, from today to the day before the exam. */
  days: number;
  /** Learning was compressed to fit the time left. */
  compressed: boolean;
}

interface Planned {
  key: string;
  role: StudyRole;
  units: SyllabusUnit[];
  title: string;
  minutes: number;
  /** Indexes into the study days. */
  from: number;
  to: number;
  after: string[];
  /** For papers: which paper. */
  paper?: SyllabusPaper;
  /** A repeat of a role for the same unit or paper (second paper, extra practice). */
  repeat?: number;
}

const ROLE_SHAPE: Record<StudyRole, { kind: ItemKind; method: Method; load: Load }> = {
  revise: { kind: "learn", method: "worked_examples", load: 3 },
  practise: { kind: "practice", method: "problem_solving", load: 3 },
  mixed: { kind: "review", method: "retrieval", load: 2 },
  paper: { kind: "practice", method: "timed_paper", load: 3 },
  corrections: { kind: "review", method: "error_log", load: 2 },
  weak: { kind: "review", method: "retrieval", load: 3 },
  final: { kind: "review", method: "spaced_review", load: 1 },
};

/** The paper assumed when the syllabus does not say: an hour of timed questions. */
export const PRACTICE_PAPER: SyllabusPaper = { label: "Practice paper", minutes: 60, marks: null };

const KEY_ROLE: Record<StudyRole, string> = { revise: "rev", practise: "prac", mixed: "mix", paper: "paper", corrections: "fix", weak: "weak", final: "final" };

/** Prefix shared by every session compiled for a goal. */
export const pathPrefix = (goalKey: string) => `${goalKey}.`;
export const isPathItem = (item: Pick<WorkItem, "key" | "details">, goalKey: string) => Boolean(item.details) && item.key.startsWith(pathPrefix(goalKey));

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const cleanTitle = (text: string) => text.replace(/\s+/g, " ").trim();

/** "Quadratics, Functions and Coordinate geometry", shortened to "Quadratics to Coordinate geometry" when long. */
export function unitList(units: Pick<SyllabusUnit, "title">[], max = 46): string {
  const names = units.map((u) => u.title);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  const joined = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  if (joined.length <= max) return joined;
  const span = `${names[0]} to ${names[names.length - 1]}`;
  return span.length <= max ? span : `${names.length} topics`;
}

function revisionMinutes(unit: SyllabusUnit, confidence: Confidence | null): number {
  const base = 30 + unit.weight * 10 + unit.difficulty * 5;
  if (confidence === "strong") return 30;
  return round5(confidence === "weak" ? base * 1.4 : base);
}
function practiceMinutes(unit: SyllabusUnit, confidence: Confidence | null): number {
  const base = 25 + unit.weight * 10 + (unit.difficulty - 1) * 5;
  return round5(confidence === "weak" ? base * 1.3 : confidence === "strong" ? Math.max(30, base * 0.8) : base);
}

/** The study days from today to the day before the exam: not rest days, not days off, and not today when the day is nearly over. */
export function studyDays(snapshot: PlanningSnapshot, model: WorkModel, until: string): { dates: string[]; capacity: number[] } {
  const restWeekdays = new Set(snapshot.days.filter((d) => d.rest === "fixed").map((d) => d.weekday));
  const off = new Set(model.constraints.flatMap((c) => (c.kind === "day_off" ? c.dates : [])));
  const settings = snapshot.settings;
  const dates: string[] = [];
  const capacity: number[] = [];
  for (let date = snapshot.today; date <= until; date = addDays(date, 1)) {
    if (off.has(date)) continue;
    const day = snapshot.days.find((d) => d.date === date);
    let free: number;
    if (day) {
      if (day.rest) continue;
      const windows = day.windows.length ? day.windows : [[settings.dayStart, settings.dayEnd] as [number, number]];
      const open = windows.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
      const busy = day.busy.reduce((s, b) => s + Math.max(0, b.end - b.start), 0);
      free = open - busy - (day.otherWork ?? 0);
      if (date === snapshot.today) free = Math.min(free, Math.max(0, settings.dayEnd - Math.max(settings.dayStart, snapshot.nowMinute)) - snapshot.studiedToday);
    } else {
      if (restWeekdays.has(weekdayOf(date))) continue;
      free = settings.dayEnd - settings.dayStart;
    }
    const cap = Math.min(settings.dailyCap, Math.round(free * 0.7));
    if (cap < 30) continue;
    dates.push(date);
    capacity.push(cap);
  }
  return { dates, capacity };
}

function minutesPerMark(paper: SyllabusPaper): string | null {
  if (!paper.marks) return null;
  const per = Math.round((paper.minutes / paper.marks) * 2) / 2;
  return per > 0 ? `${per} minute${per === 1 ? "" : "s"} a mark` : null;
}

/** The aim, key points and method of a planned session. */
function detailsFor(p: Planned, syllabus: Syllabus, weakUnits: SyllabusUnit[]): ItemDetails {
  const paper = p.paper ?? syllabus.papers[0] ?? PRACTICE_PAPER;
  const paperName = paper === PRACTICE_PAPER || paper.label === PRACTICE_PAPER.label ? "the exam" : paper.label;
  const units = p.units.map((u) => u.key);
  const unit = p.units[0];
  switch (p.role) {
    case "revise": {
      const strong = unit.confidence === "strong";
      return {
        role: p.role, units,
        aim: strong ? `Confirm you still know ${unit.title} and fix anything that has slipped.` : `Be able to answer any ${unit.title} question on ${paperName} without notes.`,
        points: unit.points.slice(0, 7),
        how: strong
          ? "Do one question for each key point without notes. Only go back to the method for the ones you get wrong."
          : "For each key point, rework one example from your notes or textbook, then cover the answer and do it again from memory. Write down any formula you had to look up.",
      };
    }
    case "practise": {
      const pace = paper ? minutesPerMark(paper) : null;
      const extra = (p.repeat ?? 0) > 0;
      return {
        role: p.role, units,
        aim: extra ? `Make ${unit.title} reliable: fresh questions after a gap.` : `Pick up every method mark on ${unit.title} questions.`,
        points: unit.points.slice(0, 7),
        how: `${extra ? "Without revising first, do" : "Do"} ${extra ? "three or four" : "four to six"} past paper questions on ${unit.title}${pace ? `, timed at about ${pace}` : ""}. Mark them with the mark scheme and write every mistake in your error log.`,
      };
    }
    case "mixed":
      return {
        role: p.role, units,
        aim: `Recall ${unitList(p.units, 80)} after a gap, mixed together the way the exam mixes them.`,
        points: p.units.flatMap((u) => u.points.slice(0, 2).map((point) => `${u.title}: ${point}`)).slice(0, 9),
        how: "Without notes, do two or three questions from each topic in a shuffled order. Check them with the mark scheme, then go back only to what you got wrong.",
      };
    case "paper":
      return {
        role: p.role, units,
        aim: paper.label === PRACTICE_PAPER.label ? `Sit an hour of exam-style questions in exam conditions.` : `Sit a full ${paperName} in exam conditions: ${formatMinutes(paper.minutes)}${paper.marks ? `, ${paper.marks} marks` : ""}.`,
        points: [paper?.label === PRACTICE_PAPER.label ? "Use a past paper or your teacher's practice questions, unseen" : "Use a past paper you haven't seen before", "Time it strictly and put your notes away", "Show full working so you keep method marks", "Move on from a question that stalls and come back to it"],
        how: "Set a timer for the real exam length and stop when it ends. Don't mark it yet: corrections are the next session.",
      };
    case "corrections":
      return {
        role: p.role, units,
        aim: "Turn every lost mark into a method you now know.",
        points: ["Mark the paper with the official mark scheme", "Redo every wrong question without looking at the answer", "Write each mistake and its fix in your error log", "Note which topics lost the most marks"],
        how: "Work through the paper question by question. A mistake only counts as fixed when you can redo the question cold.",
      };
    case "weak": {
      const named = weakUnits.length ? weakUnits : [];
      return {
        role: p.role, units: named.map((u) => u.key),
        aim: named.length ? `Close the gaps in ${unitList(named, 80)}.` : "Close the gaps in the topics that lost you the most marks.",
        points: named.length ? named.flatMap((u) => u.points.slice(0, 2).map((point) => `${u.title}: ${point}`)).slice(0, 8) : ["The two topics that lost the most marks in your past paper", "Your error log entries that came up more than once"],
        how: "Go back to the method, do one worked example, then two fresh questions on each topic without notes.",
      };
    }
    case "final":
      return {
        role: p.role, units,
        aim: "Go into the exam calm, with every formula and method fresh.",
        points: [quantitative(syllabus) ? "Write a one-page sheet of key formulas and common mistakes" : "Write a one-page sheet of key facts, definitions and common mistakes", "Read through your error log", "Do a few quick questions you know you can do", "No new topics today, and get a good night's sleep"],
        how: "Keep it light. This is a review, not a cram.",
      };
  }
}

function titleFor(p: Planned, syllabus: Syllabus): string {
  const unit = p.units[0];
  const paper = p.paper ?? syllabus.papers[0] ?? PRACTICE_PAPER;
  const repeat = p.repeat ?? 0;
  switch (p.role) {
    case "revise": return clip(`${unit.title} ${unit.confidence === "strong" ? "quick check" : "revision"}`, 60);
    case "practise": return clip(`${unit.title} ${repeat ? "extra practice" : "past paper practice"}`, 60);
    case "mixed": return clip(`Mixed review: ${unitList(p.units)}`, 60);
    case "paper": return paper?.label === PRACTICE_PAPER.label ? `Timed practice paper${repeat ? ` ${repeat + 1}` : ""}` : clip(`${paper ? `${paper.label} ` : ""}timed past paper${repeat ? ` ${repeat + 1}` : ""}`.replace(/^t/, "T"), 60);
    case "corrections": return repeat ? `Past paper ${repeat + 1} corrections` : "Past paper corrections";
    case "weak": return "Weak topics revision";
    case "final": return quantitative(syllabus) ? "Formula sheet and final review" : "Key facts and final review";
  }
}

/** Subjects where a formula sheet is the right last-day tool. */
const quantitative = (syllabus: Syllabus) => /math|physic|chemi|statist|mechanic|econom|account|further|calculus|algebra|probab/i.test(`${syllabus.name} ${syllabus.units.map((u) => u.title).join(" ")}`);

const NOTE: Partial<Record<StudyRole, string>> = {
  revise: "Done when you can do each key point without notes.",
  practise: "Done when every question is marked and logged.",
  paper: "Real exam length, no notes.",
};

/**
 * Lays the path out over the study days. Returns planned sessions with day-index windows; `compileStudyPath` turns them into work items.
 * Exported for tests and for the device's preview of a rating change.
 */
export function layoutPath(syllabus: Syllabus, days: { dates: string[]; capacity: number[] }, prefix: string): { planned: Planned[]; compressed: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const N = days.dates.length;
  const planned: Planned[] = [];
  if (!units.length || !N) return { planned, compressed: false };
  // Without a known paper the path still ends in timed practice, at an hour, from past papers or the teacher's questions.
  const papers = syllabus.papers.length ? syllabus.papers : [PRACTICE_PAPER];
  const key = (role: StudyRole, id: string | number) => `${prefix}${KEY_ROLE[role]}.${id}`;
  const last = N - 1;

  // One day for the final review when there is more than one study day.
  const finalDay = N >= 2 ? last : -1;
  const before = finalDay >= 0 ? finalDay : N;
  // Past papers: each takes a day, followed by a corrections day. More time buys more papers.
  const paperCount = !papers.length ? 0 : N >= 24 ? 3 : N >= 12 ? 2 : N >= 5 ? 1 : 0;
  const paperDays = paperCount * 2;
  const learnDays = Math.max(1, before - paperDays);
  const L = Math.min(learnDays, before > 0 ? before : 1);

  // Topic sizes against the time there is. When the topics cannot each have a revision and a practice session, they are combined and shortened.
  const capacityLearn = days.capacity.slice(0, L).reduce((s, c) => s + c, 0);
  let revise = units.map((u) => revisionMinutes(u, u.confidence));
  let practise = units.map((u) => practiceMinutes(u, u.confidence));
  const mixedCount = units.length >= 3 && L >= 6 ? Math.max(1, Math.floor(units.length / 3)) : 0;
  const needed = revise.reduce((s, m) => s + m, 0) + practise.reduce((s, m) => s + m, 0) + mixedCount * 45;
  let compressed = false;
  // Leave a quarter of the learning days' capacity for the student's other subjects and for slack.
  const budget = capacityLearn * 0.75;
  if (needed > budget) {
    compressed = true;
    const factor = Math.max(0.5, budget / needed);
    revise = revise.map((m) => Math.max(25, round5(m * factor)));
    practise = practise.map((m) => Math.max(25, round5(m * factor)));
  }

  // Each topic gets a share of the learning days in proportion to its size, in syllabus order.
  const sizes = units.map((_, i) => revise[i] + practise[i]);
  const total = sizes.reduce((s, m) => s + m, 0);
  let cumulative = 0;
  const spans: [number, number][] = units.map((_, i) => {
    const from = Math.min(L - 1, Math.floor((cumulative / total) * L));
    cumulative += sizes[i];
    const to = Math.max(from, Math.min(L - 1, Math.ceil((cumulative / total) * L) - 1));
    return [from, to];
  });
  units.forEach((unit, i) => {
    const [from, to] = spans[i];
    // One day of slack so the solver can work around the calendar.
    const slack = Math.min(L - 1, to + 1);
    const rev = key("revise", unit.key);
    planned.push({ key: rev, role: "revise", units: [unit], title: "", minutes: revise[i], from, to: slack, after: [] });
    planned.push({ key: key("practise", unit.key), role: "practise", units: [unit], title: "", minutes: practise[i], from, to: slack, after: [rev] });
  });

  // Mixed reviews: each group of three topics comes back at least two days after its last topic, while learning continues.
  if (mixedCount) {
    for (let g = 0; g < mixedCount; g++) {
      const group = units.slice(g * 3, g === mixedCount - 1 ? units.length : g * 3 + 3);
      const end = Math.max(...group.map((u) => spans[units.indexOf(u)][1]));
      const from = end + 2;
      if (from > before - 1) continue;
      planned.push({ key: key("mixed", g + 1), role: "mixed", units: group, title: "", minutes: 45 + (group.length > 3 ? 15 : 0), from, to: Math.min(before - 1, from + 2), after: group.map((u) => key("practise", u.key)) });
    }
  }

  // Weak topics come back for an extra practice session after a gap.
  for (const unit of units) {
    if (unit.confidence !== "weak") continue;
    const [, to] = spans[units.indexOf(unit)];
    const from = to + 2;
    if (from > Math.max(0, before - 1)) continue;
    planned.push({ key: key("practise", `${unit.key}.2`), role: "practise", units: [unit], title: "", minutes: practiceMinutes(unit, "okay"), from, to: Math.min(before - 1, from + 3), after: [key("practise", unit.key)], repeat: 1 });
  }

  // Past papers, each followed by its corrections. After the first, the weak topics it exposed.
  const weakUnits = units.filter((u) => u.confidence === "weak");
  for (let k = 0; k < paperCount; k++) {
    const day = L + k * 2;
    const paper = papers[k % papers.length];
    const paperKey = key("paper", k + 1);
    planned.push({ key: paperKey, role: "paper", units, title: "", minutes: Math.min(180, round5(paper.minutes + 10)), from: day, to: Math.min(before - 1, day + 1), after: [], paper, repeat: k });
    const fix = key("corrections", k + 1);
    planned.push({ key: fix, role: "corrections", units, title: "", minutes: Math.max(40, Math.min(75, round5(paper.minutes * 0.5))), from: Math.min(before - 1, day + 1), to: Math.min(before - 1, day + 2), after: [paperKey], paper, repeat: k });
    if (k === 0) planned.push({ key: key("weak", 1), role: "weak", units: weakUnits, title: "", minutes: 60, from: Math.min(before - 1, day + 1), to: Math.min(before - 1, day + 3), after: [fix] });
  }

  if (finalDay >= 0) planned.push({ key: key("final", "1"), role: "final", units, title: "", minutes: 45, from: finalDay, to: finalDay, after: [] });
  for (const p of planned) p.title = titleFor(p, syllabus);
  return { planned, compressed };
}

/**
 * Compiles a goal's syllabus into its sessions and merges them into the model. Sessions already studied keep their history; sessions that are no
 * longer needed are released; everything else of the goal that was not compiled from the syllabus (an older template, say) is released when unstarted.
 */
export function compileStudyPath(model: WorkModel, goalKey: string, snapshot: PlanningSnapshot, source: Source = "template"): { model: WorkModel; summary: PathSummary } {
  const next: WorkModel = JSON.parse(JSON.stringify(model));
  const goal = next.goals.find((g) => g.key === goalKey);
  const empty: PathSummary = { topics: 0, revise: 0, practise: 0, mixed: 0, papers: 0, sessions: 0, minutes: 0, days: 0, compressed: false };
  if (!goal?.syllabus) return { model: next, summary: empty };
  const syllabus = goal.syllabus;
  const until = goal.due ? addDays(goal.due, -1) : addDays(snapshot.today, 27);
  const days = studyDays(snapshot, next, until);
  const prefix = pathPrefix(goal.key);
  const { planned, compressed } = layoutPath(syllabus, days, prefix);
  const weakUnits = syllabus.units.filter((u) => u.included && u.confidence === "weak");
  const existing = new Map(next.items.map((i) => [i.key, i]));
  const wanted = new Set(planned.map((p) => p.key));
  const dateAt = (index: number) => days.dates[Math.max(0, Math.min(days.dates.length - 1, index))];

  // Release the goal's work that the new path does not contain, unless it has been studied.
  next.items = next.items.filter((item) => {
    if (item.goal !== goal.key || wanted.has(item.key)) return true;
    if (item.status !== "open") return true;
    if (item.done > 0) return true;
    if (item.questId) { item.status = "dropped"; return true; }
    return false;
  });
  for (const item of next.items) item.after = item.after.filter((k) => next.items.some((i) => i.key === k && i.status !== "dropped") || wanted.has(k));

  let first = 0;
  for (const p of planned) {
    const shape = ROLE_SHAPE[p.role];
    const minutes = p.minutes;
    const sizes = normalizeSizes([minutes, round5(minutes * 1.25)], p.role === "paper" ? [minutes, minutes, minutes] : [Math.min(minutes, 30), minutes, Math.max(minutes, 60)]);
    const earliest = dateAt(p.from);
    let due = dateAt(p.to);
    if (goal.due && due >= goal.due) due = addDays(goal.due, -1) >= snapshot.today ? addDays(goal.due, -1) : goal.due;
    const details = detailsFor(p, syllabus, weakUnits);
    const topics = [...new Set(p.units.map((u) => u.topic).filter((t): t is number => t != null))].slice(0, 8);
    const before = existing.get(p.key);
    const firstStep = first < 2 && !before ? firstStepFor(p) : before?.firstStep ?? null;
    first++;
    const fresh: WorkItem = {
      key: p.key, goal: goal.key, title: p.title, kind: shape.kind, subject: goal.subject, topics,
      est: sizes.est, chunk: sizes.chunk, earliest: earliest > snapshot.today ? earliest : null, due: due >= snapshot.today ? due : null, after: p.after.filter((k) => wanted.has(k)),
      load: p.role === "revise" && p.units[0]?.confidence === "strong" ? 2 : shape.load, method: p.role === "revise" && p.units[0]?.confidence === "strong" ? "retrieval" : shape.method,
      source, confidence: syllabus.source === "catalog" ? 0.9 : 0.75, done: 0, status: "open", questId: null, firstStep, note: NOTE[p.role] ?? null, details,
    };
    if (!before) { next.items.push(fresh); continue; }
    // Studied work keeps what was studied; only its window, order and description follow the new path.
    const started = before.done > 0 || before.status !== "open";
    Object.assign(before, started
      ? { earliest: fresh.earliest, due: fresh.due, after: fresh.after, details: fresh.details, subject: fresh.subject }
      : { ...fresh, questId: before.questId, done: before.done, status: before.status === "dropped" ? "open" : before.status, firstStep: before.firstStep ?? fresh.firstStep });
  }
  // Keep the order of the goal's sessions as the path lays them out, so lists read top to bottom.
  const order = new Map(planned.map((p, i) => [p.key, i]));
  const own = next.items.filter((i) => order.has(i.key)).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  const others = next.items.filter((i) => !order.has(i.key));
  next.items = [...others, ...own];
  goal.draft = !syllabus.checked;

  const count = (role: StudyRole, repeat = false) => planned.filter((p) => p.role === role && (repeat || !p.repeat)).length;
  return {
    model: next,
    summary: {
      topics: syllabus.units.filter((u) => u.included).length, revise: count("revise"), practise: count("practise", true), mixed: count("mixed"), papers: count("paper", true),
      sessions: planned.length, minutes: planned.reduce((s, p) => s + p.minutes, 0), days: days.dates.length, compressed,
    },
  };
}

function firstStepFor(p: Planned): string | null {
  const unit = p.units[0];
  switch (p.role) {
    case "revise": return `Open your notes on ${unit.title} and redo one example for the first key point without looking.`;
    case "practise": return `Find the ${unit.title} questions in two recent past papers and set a timer.`;
    default: return null;
  }
}

/** A quest's description: the aim, the key points and how to study. */
export function questDescription(item: Pick<WorkItem, "details" | "note" | "firstStep">): string | null {
  const d = item.details;
  if (!d) return [item.note, item.firstStep ? `First step: ${item.firstStep}` : null].filter(Boolean).join("\n") || null;
  const heading = d.role === "revise" ? "Key points" : d.role === "practise" ? "Check you can" : d.role === "mixed" || d.role === "weak" ? "Cover" : "Checklist";
  return [d.aim, d.points.length ? `${heading}:\n${d.points.map((p) => `• ${p}`).join("\n")}` : null, d.how ? `How: ${d.how}` : null, item.firstStep ? `First step: ${item.firstStep}` : null]
    .filter(Boolean).join("\n\n").slice(0, 2000);
}

/** Applies the student's changes to a goal's topic list: ratings, ticks, new topics. The caller re-compiles. */
export function editSyllabus(model: WorkModel, goalKey: string, changes: { units?: { key: string; confidence?: Confidence | null; included?: boolean }[]; add?: { title: string; points?: string[] }[]; checked?: boolean }): WorkModel {
  const next: WorkModel = JSON.parse(JSON.stringify(model));
  const goal = next.goals.find((g) => g.key === goalKey);
  if (!goal?.syllabus) return next;
  for (const change of changes.units ?? []) {
    const unit = goal.syllabus.units.find((u) => u.key === change.key);
    if (!unit) continue;
    if (change.confidence !== undefined) unit.confidence = change.confidence;
    if (typeof change.included === "boolean") unit.included = change.included;
  }
  let n = goal.syllabus.units.reduce((max, u) => Math.max(max, Number(u.key.replace(/\D/g, "")) || 0), 0);
  for (const added of changes.add ?? []) {
    const title = clip(cleanTitle(added.title), 40);
    if (!title || goal.syllabus.units.some((u) => u.title.toLowerCase() === title.toLowerCase())) continue;
    goal.syllabus.units.push({ key: `u${++n}`, title, points: (added.points ?? []).map((p) => clip(cleanTitle(p), 90)).filter(Boolean).slice(0, 7), weight: 2, difficulty: 2, confidence: null, included: true, topic: null });
  }
  if (typeof changes.checked === "boolean") goal.syllabus.checked = changes.checked;
  return next;
}

/** Normalizes a syllabus from any source: clean titles, three to seven points, bounded weights, unique keys, at most 24 units. */
export function normalizeSyllabus(raw: { source: Syllabus["source"]; ref?: string | null; name: string; papers?: Partial<SyllabusPaper>[]; units: (Partial<SyllabusUnit> & { title: string })[]; checked?: boolean }): Syllabus {
  const level = (v: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 => (v === 1 || v === 2 || v === 3 ? v : typeof v === "number" ? (Math.max(1, Math.min(3, Math.round(v))) as 1 | 2 | 3) : fallback);
  const seen = new Set<string>();
  const units: SyllabusUnit[] = [];
  for (const unit of raw.units) {
    const title = clip(cleanTitle(String(unit.title ?? "")).replace(/^\d+(\.\d+)*\s*[:.)-]?\s*/, ""), 40);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    units.push({
      key: `u${units.length + 1}`, title,
      points: (unit.points ?? []).map((p) => clip(cleanTitle(String(p)), 90)).filter(Boolean).slice(0, 7),
      weight: level(unit.weight, 2), difficulty: level(unit.difficulty, 2),
      confidence: unit.confidence === "weak" || unit.confidence === "okay" || unit.confidence === "strong" ? unit.confidence : null,
      included: unit.included !== false, topic: typeof unit.topic === "number" ? unit.topic : null,
    });
    if (units.length >= 24) break;
  }
  const papers = (raw.papers ?? [])
    .map((p) => ({ label: clip(cleanTitle(String(p.label ?? "")) || "Past paper", 30), minutes: Math.max(20, Math.min(240, round5(Number(p.minutes) || 0))), marks: typeof p.marks === "number" && p.marks > 0 ? Math.round(p.marks) : null }))
    .filter((p) => p.minutes >= 20)
    .slice(0, 4);
  return { source: raw.source, ref: raw.ref ?? null, name: clip(cleanTitle(raw.name) || "Syllabus", 120), papers, units, checked: raw.checked === true };
}

/**
 * Reads a topic list the student typed: one topic a line (optionally "Topic: point; point"), or "Topics: a, b, c", or a chapter range such as
 * "chapters 1 to 5". Returns nothing when the text does not look like a list, so free-form notes are never mistaken for topics.
 */
export function parseTopicList(text: string | null | undefined): { title: string; points: string[] }[] {
  if (!text) return [];
  const range = /\bchapters?\s*(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})\b/i.exec(text);
  if (range) {
    const a = Number(range[1]); const b = Number(range[2]);
    if (b >= a && b - a < 24) return Array.from({ length: b - a + 1 }, (_, i) => ({ title: `Chapter ${a + i}`, points: [] }));
  }
  const labelled = /\b(?:topics?|chapters?|units?)\s*(?:are|include|covered)?\s*[:\-–]\s*([^\n]+)/i.exec(text);
  const split = (line: string) => {
    const [head, rest] = line.split(/\s*[:–—]\s+|\s+-\s+/, 2);
    return { title: clip(cleanTitle(head.replace(/^[-*•\d.)\s]+/, "")), 40), points: rest ? rest.split(/\s*[;,]\s*/).map((p) => clip(cleanTitle(p), 90)).filter(Boolean).slice(0, 7) : [] };
  };
  if (labelled) {
    const parts = labelled[1].split(/\s*(?:,|;|\band\b)\s*/i).map((p) => p.trim()).filter((p) => p.length >= 2 && p.length <= 60);
    if (parts.length >= 2) return parts.slice(0, 24).map((p) => ({ title: clip(cleanTitle(p), 40), points: [] }));
  }
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const listy = lines.filter((l) => /^[-*•]|^\d+[.)]\s/.test(l) || (l.length <= 70 && !/[.?!]$/.test(l) && l.split(/\s+/).length <= 10));
  if (lines.length >= 2 && listy.length >= Math.max(2, Math.ceil(lines.length * 0.7))) return listy.slice(0, 24).map(split).filter((u) => u.title.length >= 2);
  return [];
}

export interface GuidePhase { key: "learn" | "papers" | "final"; title: string; from: string | null; to: string | null; sessions: number }

/** The plan in phases with real dates from the solved blocks, for "how this plan works". */
export function pathPhases(model: WorkModel, goal: KGoal, blocks: readonly { item: string; date: string; state: string }[]): GuidePhase[] {
  const items = model.items.filter((i) => i.goal === goal.key && i.details && i.status !== "dropped");
  const live = blocks.filter((b) => b.state !== "skipped");
  const range = (roles: StudyRole[]) => {
    const own = items.filter((i) => roles.includes(i.details!.role));
    const dates = live.filter((b) => own.some((i) => i.key === b.item)).map((b) => b.date).sort();
    return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, sessions: own.length };
  };
  const topics = goal.syllabus?.units.filter((u) => u.included).length ?? 0;
  const learn = range(["revise", "practise", "mixed"]);
  const papers = range(["paper", "corrections", "weak"]);
  const final = range(["final"]);
  const out: GuidePhase[] = [];
  if (learn.sessions) out.push({ key: "learn", title: `Revise and practise ${topics} topic${topics === 1 ? "" : "s"}, with mixed reviews`, ...learn });
  if (papers.sessions) out.push({ key: "papers", title: "Timed past papers, corrections and weak topics", ...papers });
  if (final.sessions) out.push({ key: "final", title: "Formula sheet and light review", ...final });
  return out;
}

/** Days from today to the exam, for copy such as "18 days to go". */
export const daysLeft = (goal: Pick<KGoal, "due">, today: string) => (goal.due ? Math.max(0, diffDays(goal.due, today)) : null);

export interface TopicCommand {
  goal: string;
  units: { key: string; confidence?: Confidence | null; included?: boolean }[];
  /** Chip text: "Weak · Integration · Maths mid term". */
  interpretation: string;
}

const TOPIC_PATTERNS: { re: RegExp; change: { confidence?: Confidence; included?: boolean }; label: string }[] = [
  { re: /^(?:i'?m|i am|im)\s+(?:really\s+|quite\s+|very\s+)?(?:weak|bad|terrible|struggling|not good|not great|behind)\s+(?:at|in|on|with)\s+(.+)$/, change: { confidence: "weak" }, label: "Weak" },
  { re: /^(?:i\s+)?(?:struggle|find it hard|find)\s+(?:with\s+)?(.+?)(?:\s+hard|\s+difficult)?$/, change: { confidence: "weak" }, label: "Weak" },
  { re: /^(.+?)\s+(?:is|are)\s+(?:my\s+)?(?:weak|weakest|hard|hardest|difficult)(?:\s+topics?)?(?:\s+for me)?$/, change: { confidence: "weak" }, label: "Weak" },
  { re: /^(?:i'?m|i am|im)\s+(?:really\s+|quite\s+|very\s+)?(?:good|strong|great|confident|fine|solid)\s+(?:at|in|on|with)\s+(.+)$/, change: { confidence: "strong" }, label: "Strong" },
  { re: /^(.+?)\s+(?:is|are)\s+(?:easy|fine|my strongest|strong)(?:\s+for me)?$/, change: { confidence: "strong" }, label: "Strong" },
  { re: /^(.+?)\s+(?:isn'?t|is not|aren'?t|are not|won'?t be|will not be)\s+(?:in|on|part of)\s+(?:the|my|this)\s+(?:exam|midterm|mid term|test|paper|syllabus|mock)$/, change: { included: false }, label: "Not in the exam" },
  { re: /^(?:skip|leave out|exclude|remove)\s+(.+?)(?:\s+from\s+(?:the|my)\s+(?:plan|exam|topics|midterm))?$/, change: { included: false }, label: "Not in the exam" },
  { re: /^(.+?)\s+(?:is|are)\s+(?:in|on|part of)\s+(?:the|my|this)\s+(?:exam|midterm|mid term|test|paper|mock)(?:\s+too| as well)?$/, change: { included: true }, label: "In the exam" },
];

/** Finds syllabus topics named in a phrase: "trig and integration" → Trigonometry, Integration. */
function namedUnits(phrase: string, units: SyllabusUnit[]): SyllabusUnit[] {
  const parts = phrase.split(/\s*(?:,|&|\band\b|\bor\b|\/)\s*/).map((p) => p.replace(/^(?:the|a|an)\s+/, "").replace(/\s+(?:topics?|chapters?|questions?|ones?)$/, "").trim()).filter((p) => p.length >= 3);
  const found: SyllabusUnit[] = [];
  for (const part of parts) {
    const match = units.find((u) => u.title.toLowerCase() === part)
      ?? units.find((u) => u.title.toLowerCase().startsWith(part) && part.length >= 4)
      ?? units.find((u) => u.title.toLowerCase().split(/[^a-z0-9']+/).some((w) => w.length >= 4 && (w.startsWith(part) || part.startsWith(w))));
    if (!match) return [];
    if (!found.includes(match)) found.push(match);
  }
  return found;
}

/**
 * "I'm weak at integration", "trig isn't in my exam", "skip series": ratings and ticks on an exam's topic list, understood without the model. Returns
 * null unless every named topic matches one goal's syllabus, so anything uncertain goes to the planner instead.
 */
export function parseTopicCommand(text: string, model: WorkModel): TopicCommand | null {
  const t = text.toLowerCase().replace(/[’]/g, "'").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  const goals = model.goals.filter((g) => g.status === "active" && g.syllabus?.units.length).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  if (!goals.length) return null;
  for (const pattern of TOPIC_PATTERNS) {
    const m = pattern.re.exec(t);
    if (!m) continue;
    for (const goal of goals) {
      const units = namedUnits(m[1], goal.syllabus!.units);
      if (!units.length) continue;
      return { goal: goal.key, units: units.map((u) => ({ key: u.key, ...pattern.change })), interpretation: clip(`${pattern.label} · ${units.map((u) => u.title).join(", ")} · ${goal.title}`, 60) };
    }
    return null;
  }
  return null;
}
