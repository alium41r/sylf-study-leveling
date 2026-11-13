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
import { addDays, diffDays, floor5, formatMinutes, round5, weekdayOf, weekStart } from "./dates";
import { normalizeSizes } from "./operations";
import {
  type Confidence, type ItemDetails, type ItemKind, type KGoal, type Load, type Method, type PlanPreset, type PlanningSnapshot, type Source, type StudyRole,
  type Syllabus, type SyllabusIdentity, type SyllabusPaper, type SyllabusUnit, type WorkItem, type WorkModel,
} from "./contracts";

export interface PathSummary {
  preset?: PlanPreset;
  topics: number;
  /** Timed checkpoints and milestone checks. */
  checkpoints?: number;
  /** The first and last day the path uses. */
  from?: string | null;
  /** The plan has a date of its own. */
  dated?: boolean;
  to?: string | null;
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
  /** Very little time: quick revision of everything, then mixed practice. */
  quick?: boolean;
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
  /** For a topic studied over several sessions: this is part `[k, n]`, covering its share of the key points. */
  part?: [number, number];
  /** Too little time for a study and a practice session per topic: one session does both. */
  combined?: boolean;
  /** Part of a quick plan for a test a day or two away: no gaps, no spacing. */
  quick?: boolean;
}

/**
 * How a plan spends its time. `limit` is its daily limit (the student's minutes a day, or a default for the kind of plan); `session` the usual
 * session length under it; `fill` how much of the time offered to aim for when the content alone would leave most of it empty.
 */
export interface Pacing { limit: number | null; session: number; fill: number | null }
const NO_PACING: Pacing = { limit: null, session: 60, fill: null };
/** A plan's daily limit when the student does not give one: enough for steady progress, never a whole day on one plan by accident. */
const DEFAULT_DAILY: Partial<Record<PlanPreset, number>> = { exam: 150, course: 60, mastery: 60, reading: 45 };
/** Session sizes that pack a day under its limit: the whole limit, a half, a third or a quarter, never below 20 minutes. */
const fitsFor = (limit: number) => [...new Set([limit, limit / 2, limit / 3, limit / 4].map((x) => Math.floor(x / 5) * 5))].filter((x) => x >= 20);
/** The usual session under a daily limit: the largest fitting size up to an hour and a half. */
const sessionFor = (limit: number | null) => (limit ? fitsFor(limit).find((x) => x <= 90) ?? fitsFor(limit).at(-1) ?? Math.min(60, limit) : 60);
/** A paper's practice sitting: its real length (with ten minutes to set up for a short paper); an exam longer than five hours is practised as a four-hour block. */
export const sittingFor = (paper: SyllabusPaper) => (paper.minutes > 300 ? 240 : paper.minutes <= 150 ? round5(paper.minutes + 10) : paper.minutes);
/** "X past paper practice 2": a unit's name shortened at a natural break so the whole title stays within 60 characters. */
const titled = (unit: string, suffix: string, prefix = "") => {
  const room = 60 - suffix.length - prefix.length - (suffix ? 1 : 0);
  return `${prefix}${unit.length <= room ? unit : shortTitle(unit, room)}${suffix ? ` ${suffix}` : ""}`;
};
/** "Checkpoint test: Quadratics to Vectors", with the topic list shortened to fit 60 characters. */
const listed = (prefix: string, units: Pick<SyllabusUnit, "title">[]) => `${prefix}${unitList(units, 60 - prefix.length)}`;

const ROLE_SHAPE: Record<StudyRole, { kind: ItemKind; method: Method; load: Load }> = {
  revise: { kind: "learn", method: "worked_examples", load: 3 },
  learn: { kind: "learn", method: "learn", load: 3 },
  recall: { kind: "review", method: "retrieval", load: 2 },
  checkpoint: { kind: "practice", method: "timed_paper", load: 3 },
  lesson: { kind: "learn", method: "learn", load: 2 },
  milestone: { kind: "review", method: "retrieval", load: 2 },
  read: { kind: "learn", method: "reading", load: 1 },
  practise: { kind: "practice", method: "problem_solving", load: 3 },
  mixed: { kind: "review", method: "retrieval", load: 2 },
  paper: { kind: "practice", method: "timed_paper", load: 3 },
  corrections: { kind: "review", method: "error_log", load: 2 },
  weak: { kind: "review", method: "retrieval", load: 3 },
  final: { kind: "review", method: "spaced_review", load: 1 },
};

/** The paper assumed when the syllabus does not say: an hour of timed questions. */
export const PRACTICE_PAPER: SyllabusPaper = { label: "Practice paper", minutes: 60, marks: null };

const KEY_ROLE: Record<StudyRole, string> = {
  revise: "rev", practise: "prac", mixed: "mix", paper: "paper", corrections: "fix", weak: "weak", final: "final",
  learn: "learn", recall: "recall", checkpoint: "check", lesson: "lesson", milestone: "mile", read: "read",
};

/** Prefix shared by every session compiled for a goal. */
export const pathPrefix = (goalKey: string) => `${goalKey}.`;
export const isPathItem = (item: Pick<WorkItem, "key" | "details">, goalKey: string) => Boolean(item.details) && item.key.startsWith(pathPrefix(goalKey));

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
/** Collapses whitespace and decodes the HTML entities that web pages leave in text the model read. */
const cleanTitle = (text: string) => text.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

/** "Quadratics, Functions and Coordinate geometry", shortened to "Quadratics to Coordinate geometry" when long. */
export function unitList(units: Pick<SyllabusUnit, "title">[], max = 46): string {
  const names = units.map((u) => u.title);
  if (!names.length) return "";
  if (names.length === 1) return names[0].length <= max ? names[0] : shortTitle(names[0], max);
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
export function studyDays(snapshot: PlanningSnapshot, model: WorkModel, until: string, options: { from?: string | null; minutesPerDay?: number | null } = {}): { dates: string[]; capacity: number[] } {
  const restWeekdays = new Set(snapshot.days.filter((d) => d.rest === "fixed").map((d) => d.weekday));
  const off = new Set(model.constraints.flatMap((c) => (c.kind === "day_off" ? c.dates : [])));
  const settings = snapshot.settings;
  const dates: string[] = [];
  const capacity: number[] = [];
  const start = options.from && options.from > snapshot.today ? options.from : snapshot.today;
  for (let date = start; date <= until && dates.length < 400; date = addDays(date, 1)) {
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
    const cap = Math.min(settings.dailyCap, Math.round(free * 0.7), options.minutesPerDay && options.minutesPerDay >= 15 ? options.minutesPerDay : Infinity);
    if (cap < Math.min(30, options.minutesPerDay ?? 30)) continue;
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
function detailsFor(p: Planned, syllabus: Syllabus, weakUnits: SyllabusUnit[], preset: PlanPreset): ItemDetails {
  const paper = p.paper ?? syllabus.papers[0] ?? PRACTICE_PAPER;
  const paperName = paper === PRACTICE_PAPER || paper.label === PRACTICE_PAPER.label ? "the exam" : paper.label;
  const units = p.units.map((u) => u.key);
  const unit = p.units[0];
  const essay = essayLike(syllabus);
  // A topic studied over several sessions: each part covers its share of the key points, in order.
  const pointsOf = (u: SyllabusUnit) => {
    if (!p.part || p.part[1] <= 1) return u.points.slice(0, 7);
    const [k, n] = p.part; const size = Math.ceil(u.points.length / n);
    return u.points.slice((k - 1) * size, k * size);
  };
  const partNote = p.part && p.part[1] > 1 ? ` (part ${p.part[0]} of ${p.part[1]})` : "";
  switch (p.role) {
    case "revise": {
      if (p.units.length > 1) return {
        role: p.role, units,
        aim: `Go over ${unitList(p.units, 80)}: the key points that come up most.`,
        points: p.units.flatMap((u) => u.points.slice(0, 2).map((point) => `${u.title}: ${point}`)).slice(0, 9),
        how: "For each point, say or write it from memory first, then check your notes and do one quick question on it.",
      };
      const strong = unit.confidence === "strong";
      if (p.combined) return {
        role: p.role, units,
        aim: `Revise ${unit.title} and test yourself on it in one session.`,
        points: pointsOf(unit),
        how: "Go through each key point from memory and check it, then do two or three past paper questions on the topic and mark them.",
      };
      return {
        role: p.role, units,
        aim: strong ? `Confirm you still know ${unit.title} and fix anything that has slipped.` : partNote ? `Be able to answer ${unit.title} questions on these points without notes${partNote}.` : `Be able to answer any ${unit.title} question on ${paperName} without notes.`,
        points: pointsOf(unit),
        how: strong
          ? "Do one question for each key point without notes. Only go back to the method for the ones you get wrong."
          : "For each key point, rework one example from your notes or textbook, then cover the answer and do it again from memory. Write down any formula you had to look up.",
      };
    }
    case "learn":
      if (p.combined) return {
        role: p.role, units,
        aim: `Learn ${unit.title} and practise it in one session.`,
        points: pointsOf(unit),
        how: "Work through each key point with one example, then do three questions without notes and check them.",
      };
      return {
        role: p.role, units,
        aim: partNote ? `Understand these parts of ${unit.title} well enough to explain them and do the standard questions${partNote}.` : `Understand ${unit.title} well enough to explain it and do the standard questions.`,
        points: pointsOf(unit),
        how: "Work through the lesson or chapter, write each key point in your own words, then do two examples yourself without looking.",
      };
    case "lesson":
      return {
        role: p.role, units,
        aim: `Get started on ${unit.title}: learn each point slowly and correctly.`,
        points: unit.points.slice(0, 7),
        how: "Watch or read one good explanation, try each point slowly, and note what felt hard for the next session.",
      };
    case "milestone":
      return {
        role: p.role, units,
        aim: `Show you can do ${unit.title} without help.`,
        points: unit.points.slice(0, 5),
        how: "Try each point cold. If one isn't solid yet, the next session repeats it before moving on.",
      };
    case "read":
      if (p.units.length > 1) return {
        role: p.role, units,
        aim: `Read ${unitList(p.units, 80)} and come away with their main ideas.`,
        points: p.units.flatMap((u) => u.points.slice(0, 2).map((point) => `${u.title}: ${point}`)).slice(0, 8),
        how: "Read actively, then close the book and write three sentences from memory for each chapter.",
      };
      return {
        role: p.role, units,
        aim: `Read ${unit.title} and come away with its main ideas.`,
        points: unit.points.length ? unit.points.slice(0, 6) : ["Note the key ideas as you go", "Mark anything you want to come back to"],
        how: "Read actively, then close the book and write three sentences from memory.",
      };
    case "recall":
      return {
        role: p.role, units,
        aim: `Pull ${unitList(p.units, 80)} back from memory after a gap.`,
        points: p.units.flatMap((u) => u.points.slice(0, 2).map((point) => (p.units.length > 1 ? `${u.title}: ${point}` : point))).slice(0, 9),
        how: preset === "reading" ? "Without the book, write a short summary of each part, then check it and fill the gaps." : "Without notes, write what you remember and do one question on each. Check, then fix only the gaps.",
      };
    case "checkpoint": {
      const mastery = preset === "mastery";
      return {
        role: p.role, units,
        aim: mastery ? `Prove you've mastered ${unitList(p.units, 80)} on unseen questions.` : `Test yourself on ${unitList(p.units, 80)} under timed conditions.`,
        points: ["Unseen, mixed questions", "No notes, timed", "Mark it honestly", "Note the weakest topic for your next review"],
        how: `${formatMinutes(p.minutes)} without notes. Mark it straight after and write down what to fix.`,
      };
    }
    case "practise": {
      const pace = paper ? minutesPerMark(paper) : null;
      const extra = (p.repeat ?? 0) > 0;
      if (preset === "skill") return {
        role: p.role, units,
        aim: `Build ${unit.title} through deliberate practice.`,
        points: unit.points.slice(0, 6),
        how: "Warm up for five minutes, then practise one key point at a time, slowly before fast.",
      };
      if (essay) return {
        role: p.role, units,
        aim: extra ? `Keep ${unit.title} ready: a fresh question after a gap.` : `Turn what you know about ${unit.title} into strong answers.`,
        points: unit.points.slice(0, 7),
        how: `Plan ${extra ? "one past question" : "two past questions"} on ${unit.title} in ten minutes each: a clear argument, the key ideas and an example for each part. Then write one introduction or paragraph in full and check it against a model answer.`,
      };
      if (preset === "course" || preset === "mastery") return {
        role: p.role, units,
        aim: extra ? `Make ${unit.title} reliable: fresh questions after a gap.` : `Get confident with ${unit.title} questions.`,
        points: unit.points.slice(0, 7),
        how: `Do ${extra ? "three or four" : "five to eight"} questions on ${unit.title} from your textbook or past papers. Mark them and note what went wrong.`,
      };
      return {
        role: p.role, units,
        aim: extra ? `Make ${unit.title} reliable: fresh questions after a gap.` : `Pick up every method mark on ${unit.title} questions.`,
        points: unit.points.slice(0, 7),
        how: `${extra ? "Without revising first, do" : "Do"} ${extra ? "three or four" : "four to six"} past paper questions on ${unit.title}${pace ? `, timed at about ${pace}` : ""}. Mark them with the mark scheme and write every mistake in your error log.`,
      };
    }
    case "mixed":
      if (p.quick) return {
        role: p.role, units,
        aim: "Test yourself on everything, mixed together the way the test will ask it.",
        points: p.units.flatMap((u) => u.points.slice(0, 1).map((point) => `${u.title}: ${point}`)).slice(0, 9),
        how: "Without notes, do one or two questions on each topic in a shuffled order. Check them, and reread only what you got wrong.",
      };
      return {
        role: p.role, units,
        aim: `Recall ${unitList(p.units, 80)} after a gap, mixed together the way the exam mixes them.`,
        points: p.units.flatMap((u) => u.points.slice(0, 2).map((point) => `${u.title}: ${point}`)).slice(0, 9),
        how: "Without notes, do two or three questions from each topic in a shuffled order. Check them with the mark scheme, then go back only to what you got wrong.",
      };
    case "paper": {
      const sitting = Math.min(p.minutes, sittingFor(paper));
      return {
        role: p.role, units,
        aim: paper.label === PRACTICE_PAPER.label ? `Sit an hour of exam-style questions in exam conditions.` : sitting < paper.minutes ? `Sit ${formatMinutes(sitting)} of ${paperName} questions in exam conditions (the real paper is ${formatMinutes(paper.minutes)}).` : `Sit a full ${paperName} in exam conditions: ${formatMinutes(paper.minutes)}${paper.marks ? `, ${paper.marks} marks` : ""}.`,
        points: [paper?.label === PRACTICE_PAPER.label ? "Use a past paper or your teacher's practice questions, unseen" : "Use a past paper you haven't seen before", "Time it strictly and put your notes away", essay ? "Spend the first part planning before you write" : "Show full working so you keep method marks", "Move on from a question that stalls and come back to it"],
        how: "Set a timer for the real exam length and stop when it ends. Don't mark it yet: corrections are the next session.",
      };
    }
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

function titleFor(p: Planned, syllabus: Syllabus, preset: PlanPreset, paperIndex: Map<string, number> = new Map()): string {
  const unit = p.units[0];
  const paper = p.paper ?? syllabus.papers[0] ?? PRACTICE_PAPER;
  const repeat = p.repeat ?? 0;
  const part = p.part && p.part[1] > 1 ? `(${p.part[0]} of ${p.part[1]})` : "";
  const nth = repeat ? ` ${repeat + 1}` : "";
  switch (p.role) {
    case "revise":
      if (p.units.length > 1) return listed("Quick revision: ", p.units);
      if (p.combined) return titled(unit.title, "revision and practice");
      return titled(unit.title, unit.confidence === "strong" ? "quick check" : `revision${part ? ` ${part}` : ""}`);
    case "learn": return p.combined ? titled(unit.title, "study and practice") : titled(unit.title, `study${part ? ` ${part}` : ""}`);
    case "lesson": return titled(unit.title, "lesson");
    case "milestone": return titled(unit.title, "milestone check");
    case "read":
      if (p.units.length > 1) return listed("Read: ", p.units);
      return /^(chapter|part|section|book|act|unit)\b/i.test(unit.title) ? titled(unit.title, part, "Read ") : titled(unit.title, part, "Read: ");
    case "recall":
      if (p.key.endsWith(".final")) return preset === "reading" ? "Final recap of the book" : "Final recall check: everything";
      return p.units.length === 1 ? titled(unit.title, "recall check") : repeat ? `Recall check ${repeat + 1}` : listed("Recall check: ", p.units);
    case "checkpoint": return preset === "mastery" ? "Mastery test" : listed("Checkpoint test: ", p.units);
    case "practise":
      if (preset === "skill") return titled(unit.title, `practice${nth}`);
      if (essayLike(syllabus)) return titled(unit.title, `essay practice${nth}`);
      if (preset === "course" || preset === "mastery") return titled(unit.title, `practice questions${nth}`);
      return titled(unit.title, `past paper practice${nth}`);
    case "mixed": return p.units.length === syllabus.units.filter((u) => u.included).length && p.units.length > 3 ? `Mixed practice: all topics${nth}` : listed("Mixed review: ", p.units);
    case "paper": {
      // Numbered per paper: "Paper 2 timed past paper", then "Paper 2 timed past paper 2".
      const k = paperIndex.get(p.key) ?? 0;
      return paper.label === PRACTICE_PAPER.label ? `Timed practice paper${k ? ` ${k + 1}` : ""}` : titled(paper.label, `timed past paper${k ? ` ${k + 1}` : ""}`);
    }
    case "corrections": {
      const k = paperIndex.get(p.after[0] ?? "") ?? 0;
      return paper.label === PRACTICE_PAPER.label || syllabus.papers.length <= 1 ? `Past paper corrections${repeat ? ` ${repeat + 1}` : ""}` : titled(paper.label, `corrections${k ? ` ${k + 1}` : ""}`);
    }
    case "weak": return "Weak topics revision";
    case "final": return quantitative(syllabus) ? "Formula sheet and final review" : "Key facts and final review";
  }
  return p.title;
}

/** Subjects where a formula sheet is the right last-day tool. */
const quantitative = (syllabus: Syllabus) => /math|physic|chemi|statist|mechanic|econom|account|further|calculus|algebra|probab/i.test(`${syllabus.name} ${syllabus.units.map((u) => u.title).join(" ")}`);
/** Subjects examined in essays, where practice means planning and writing answers rather than picking up method marks. */
const essayLike = (syllabus: Syllabus) => !quantitative(syllabus) && /philosoph|histor|literat|essay|dissertation|politic|sociolog|religio|theolog|ethic|classics|\blaw\b|english lit/i.test(`${syllabus.name} ${syllabus.units.slice(0, 8).map((u) => u.title).join(" ")}`);

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
  return layoutExam(syllabus, days, prefix);
}

type Days = { dates: string[]; capacity: number[] };
const keyFor = (prefix: string) => (role: StudyRole, id: string | number) => `${prefix}${KEY_ROLE[role]}.${id}`;

/** Each unit's share of `L` days in proportion to its size, in order. */
function proportionalSpans(sizes: number[], L: number): [number, number][] {
  const total = Math.max(1, sizes.reduce((s, m) => s + m, 0));
  let cumulative = 0;
  return sizes.map((size) => {
    const from = Math.min(L - 1, Math.floor((cumulative / total) * L));
    cumulative += size;
    const to = Math.max(from, Math.min(L - 1, Math.ceil((cumulative / total) * L) - 1));
    return [from, to];
  });
}

/** How many past papers fit before the exam: more time buys more, up to six over a long course. */
const papersFor = (N: number) => (N >= 60 ? Math.min(8, Math.floor(N / 12)) : N >= 24 ? 3 : N >= 12 ? 2 : N >= 5 ? 1 : 0);
const correctionsFor = (paper: SyllabusPaper) => Math.max(40, Math.min(75, round5(paper.minutes * 0.5)));

/**
 * Fewer papers when the last days cannot hold them. A paper takes its day to itself, so k papers need k whole days plus room for their corrections
 * and the weak-topics session on the days between, all within the last third of the time.
 */
function fitPapers(days: Days, papers: SyllabusPaper[], count: number, before: number): number {
  let k = count;
  while (k > 1) {
    const tail = Math.max(2 * k + 1, Math.floor(before / 3));
    const window = days.capacity.slice(Math.max(0, before - tail), before);
    const room = window.reduce((sum, c) => sum + c, 0) - [...window].sort((a, b) => b - a).slice(0, k).reduce((sum, c) => sum + c, 0);
    let need = 60;
    for (let i = 0; i < k; i++) need += correctionsFor(papers[i % papers.length]);
    if (2 * k <= Math.max(2, Math.floor(before / 3)) && need <= room * 0.85) break;
    k--;
  }
  return k;
}

/**
 * Study days the end of a plan needs: two a paper (the paper's day, then its corrections), and more when a daily limit means the days between cannot
 * also hold what spills into them (the weak-topics session, the last mixed review, extra practice for weak topics). Never more than a third of the time.
 */
function tailDaysFor(days: Days, papers: SyllabusPaper[], count: number, before: number, weak: number): number {
  let need = 60 + 60 + weak * 50;
  for (let i = 0; i < count; i++) need += correctionsFor(papers[i % papers.length]);
  let tail = count * 2;
  const room = (t: number) => { const window = days.capacity.slice(Math.max(0, before - t), before); return window.reduce((sum, c) => sum + c, 0) - [...window].sort((a, b) => b - a).slice(0, count).reduce((sum, c) => sum + c, 0); };
  while (tail < Math.floor(before / 3) && room(tail) * 0.85 < need) tail++;
  return tail;
}

/** Papers, corrections, weak topics and the final review in the last `2 × papers + 1` study days. */
function examTail(planned: Planned[], units: SyllabusUnit[], papers: SyllabusPaper[], paperCount: number, L: number, before: number, finalDay: number, key: ReturnType<typeof keyFor>) {
  const weakUnits = units.filter((u) => u.confidence === "weak");
  for (let k = 0; k < paperCount; k++) {
    const day = L + k * 2;
    const paper = papers[k % papers.length];
    const paperKey = key("paper", k + 1);
    planned.push({ key: paperKey, role: "paper", units, title: "", minutes: sittingFor(paper), from: day, to: Math.min(before - 1, day + 1), after: [], paper, repeat: k });
    const fix = key("corrections", k + 1);
    planned.push({ key: fix, role: "corrections", units, title: "", minutes: correctionsFor(paper), from: Math.min(before - 1, day + 1), to: Math.min(before - 1, day + 3), after: [paperKey], paper, repeat: k });
    // Weak topics may also use the light final day: targeted practice, nothing new.
    if (k === 0) planned.push({ key: key("weak", 1), role: "weak", units: weakUnits, title: "", minutes: 60, from: Math.min(before - 1, day + 1), to: finalDay >= 0 ? finalDay : before - 1, after: [fix] });
  }
  if (finalDay >= 0) planned.push({ key: key("final", "1"), role: "final", units, title: "", minutes: 45, from: finalDay, to: finalDay, after: [] });
}

/** Spaced practice: a topic's later practice sessions come back after widening gaps, so it is recalled again before it fades. */
const PRACTICE_GAPS = [2, 6, 13, 24, 40, 60];

/**
 * How much more than the content's own size to plan, when the student offers more time than that: the share of the learning days' time to aim
 * for (`fill`), over what the topics need. 1 when there is no pacing to fill, at most 5.
 */
function depthFor(pacing: Pacing, capacity: number, needed: number, fixed: number): number {
  if (!pacing.fill || needed <= fixed) return 1;
  return Math.max(1, Math.min(5, (capacity * pacing.fill - fixed) / (needed - fixed)));
}

/**
 * One topic's sessions. Without spare time: one study session and one practice session, as sized. With `depth` above 1.25 (the student has more
 * time than the content alone needs): the study in parts of one session each, every part a slice of the key points, then practice, the first
 * straight after and the rest spaced out after widening gaps, as far as the last study day before the exam allows.
 */
function addUnit(planned: Planned[], unit: SyllabusUnit, minutes: { study: number; practise: number }, depth: number, session: number, role: "revise" | "learn", span: [number, number], L: number, before: number, key: ReturnType<typeof keyFor>) {
  const [from, to] = span;
  const slack = Math.min(L - 1, to + 1);
  const study = key(role, unit.key);
  if (depth < 1.25) {
    planned.push({ key: study, role, units: [unit], title: "", minutes: minutes.study, from, to: slack, after: [] });
    planned.push({ key: key("practise", unit.key), role: "practise", units: [unit], title: "", minutes: minutes.practise, from, to: slack, after: [study] });
    return;
  }
  const total = (minutes.study + minutes.practise) * depth;
  const share = role === "revise" ? 0.4 : 0.5;
  const parts = Math.max(1, Math.min(4, Math.max(1, unit.points.length), Math.round((total * share) / session)));
  const last = Math.max(slack, before - 1);
  const room = last - slack;
  // A late topic has little learning time left after it, and the last days belong to the papers: fewer spaced sessions, at most one of them
  // among the papers, rather than a pile-up on the last days.
  const roomLearn = Math.max(0, L - 1 - slack);
  const practices = Math.max(1, Math.min(unit.confidence === "weak" ? 7 : 6, 1 + Math.floor(roomLearn / 3) + (before - 1 > L - 1 ? 1 : 0), Math.round((total - parts * session) / session)));
  // Gaps shrink to fit what is left before the exam, keeping their widening shape.
  const widest = practices > 1 ? PRACTICE_GAPS[Math.min(PRACTICE_GAPS.length - 1, practices - 2)] : 1;
  const scale = widest > room ? room / widest : 1;
  let previous: string | null = null;
  for (let k = 1; k <= parts; k++) {
    const id = k === 1 ? study : key(role, `${unit.key}.p${k}`);
    planned.push({ key: id, role, units: [unit], title: "", minutes: session, from, to: slack, after: previous ? [previous] : [], part: [k, parts] });
    previous = id;
  }
  for (let j = 1; j <= practices; j++) {
    const id = key("practise", j === 1 ? unit.key : `${unit.key}.${j}`);
    const gap = j === 1 ? 0 : Math.max(1, Math.round(PRACTICE_GAPS[Math.min(PRACTICE_GAPS.length - 1, j - 2)] * scale));
    const start = j === 1 ? from : Math.min(Math.max(slack, last - 1), slack + gap);
    // Squeezed gaps leave the window open to the last study day, so the solver can find room around the papers.
    const end = j === 1 ? slack : scale < 1 ? last : Math.min(last, start + Math.max(2, Math.round(gap / 2)));
    planned.push({ key: id, role: "practise", units: [unit], title: "", minutes: session, from: start, to: end, after: [previous!], repeat: j - 1 });
    previous = id;
  }
}

/**
 * Very little time (an exam tomorrow, or a day or two): the topics in at most three quick revision sessions, then one mixed practice on all of
 * them, sized to what the days hold. No papers, no spacing: there is no time for either.
 */
function layoutCram(syllabus: Syllabus, days: Days, prefix: string): { planned: Planned[]; compressed: boolean; quick: true } {
  const units = syllabus.units.filter((u) => u.included);
  const planned: Planned[] = [];
  if (!units.length || !days.dates.length) return { planned, compressed: false, quick: true };
  const key = keyFor(prefix);
  const room = Math.max(60, days.capacity.reduce((sum, c) => sum + c, 0) * 0.8);
  const groups = Math.min(3, units.length);
  const size = Math.ceil(units.length / groups);
  const wanted = units.reduce((sum, u) => sum + revisionMinutes(u, u.confidence) * 0.5, 0);
  const practice = Math.min(45, Math.max(25, round5(room * 0.3)));
  const factor = Math.min(1, (room - practice) / Math.max(1, wanted));
  const last = days.dates.length - 1;
  const keys: string[] = [];
  for (let g = 0; g * size < units.length; g++) {
    const group = units.slice(g * size, g * size + size);
    const id = key("revise", group[0].key);
    planned.push({ key: id, role: "revise", units: group, title: "", minutes: Math.max(20, Math.min(60, round5(group.reduce((sum, u) => sum + revisionMinutes(u, u.confidence) * 0.5, 0) * factor))), from: 0, to: last, after: keys.length ? [keys[keys.length - 1]] : [] });
    keys.push(id);
  }
  planned.push({ key: key("mixed", "all"), role: "mixed", units, title: "", minutes: practice, from: 0, to: last, after: [keys[keys.length - 1]], quick: true });
  return { planned, compressed: factor < 1, quick: true };
}

/**
 * A whole course or subject over weeks or months, learnt for the first time: each topic studied then practised in order, every three topics
 * recalled two days later and again about ten days later, a timed checkpoint every six topics, and, when the course ends in an exam, the exam tail.
 */
function layoutCourse(syllabus: Syllabus, days: Days, prefix: string, exam: boolean, pacing: Pacing = NO_PACING): { planned: Planned[]; compressed: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const N = days.dates.length;
  const planned: Planned[] = [];
  if (!units.length || !N) return { planned, compressed: false };
  const key = keyFor(prefix);
  const papers = syllabus.papers.length ? syllabus.papers : [PRACTICE_PAPER];
  const finalDay = N >= 2 ? N - 1 : -1;
  const before = finalDay >= 0 ? finalDay : N;
  const paperCount = exam ? fitPapers(days, papers, papersFor(N), before) : 0;
  const L = Math.max(1, Math.min(before, before - (paperCount ? tailDaysFor(days, papers, paperCount, before, units.filter((u) => u.confidence === "weak").length) : 0)));
  let learn = units.map((u) => round5(revisionMinutes(u, u.confidence) + (u.confidence === "strong" ? 0 : 10)));
  let practise = units.map((u) => practiceMinutes(u, u.confidence));
  const offered = days.capacity.slice(0, L).reduce((s, c) => s + c, 0);
  const capacity = offered * 0.75;
  const groups = Math.ceil(units.length / 3);
  const needed = learn.reduce((s, m) => s + m, 0) + practise.reduce((s, m) => s + m, 0) + groups * 75;
  let compressed = false;
  if (needed > capacity) {
    compressed = true;
    const factor = Math.max(0.5, capacity / needed);
    learn = learn.map((m) => Math.max(25, round5(m * factor)));
    practise = practise.map((m) => Math.max(25, round5(m * factor)));
  }
  const depth = compressed ? 1 : depthFor(pacing, offered, needed, groups * 75);
  const spans = proportionalSpans(units.map((_, i) => learn[i] + practise[i]), L);
  units.forEach((unit, i) => addUnit(planned, unit, { study: learn[i], practise: practise[i] }, depth, pacing.session, "learn", spans[i], L, before, key));
  for (let g = 0; g < groups; g++) {
    const group = units.slice(g * 3, g * 3 + 3);
    const end = Math.max(...group.map((u) => spans[units.indexOf(u)][1]));
    const first = end + 2;
    if (first <= before - 1) planned.push({ key: key("mixed", g + 1), role: "mixed", units: group, title: "", minutes: 45, from: first, to: Math.min(before - 1, first + 2), after: group.map((u) => key("practise", u.key)) });
    // A second, wider gap for courses long enough to have one: the spacing that turns learning into memory.
    const second = end + 10;
    if (N >= 28 && second <= before - 1) planned.push({ key: key("recall", g + 1), role: "recall", units: group, title: "", minutes: 30, from: second, to: Math.min(before - 1, second + 3), after: first <= before - 1 ? [key("mixed", g + 1)] : group.map((u) => key("practise", u.key)) });
    if ((g + 1) % 2 === 0 || g === groups - 1) {
      const covered = units.slice(Math.max(0, (g - 1) * 3), g * 3 + 3);
      const day = end + 3;
      if (units.length >= 4 && day <= before - 1 && (g + 1) % 2 === 0) planned.push({ key: key("checkpoint", Math.ceil((g + 1) / 2)), role: "checkpoint", units: covered, title: "", minutes: 45, from: day, to: Math.min(before - 1, day + 2), after: covered.map((u) => key("practise", u.key)) });
    }
  }
  for (const unit of units) {
    if (unit.confidence !== "weak" || depth >= 1.25) continue;
    const from = spans[units.indexOf(unit)][1] + 2;
    if (from > before - 1) continue;
    planned.push({ key: key("practise", `${unit.key}.2`), role: "practise", units: [unit], title: "", minutes: practiceMinutes(unit, "okay"), from, to: Math.min(before - 1, from + 3), after: [key("practise", unit.key)], repeat: 1 });
  }
  if (exam) examTail(planned, units, papers, paperCount, L, before, finalDay, key);
  else if (finalDay >= 0) planned.push({ key: key("recall", "final"), role: "recall", units, title: "", minutes: 45, from: finalDay, to: finalDay, after: [] });
  return { planned, compressed };
}

/**
 * One chapter or topic, mastered: each subtopic studied and practised in the first half of the time, then recall checks on everything at
 * widening gaps (one, three, seven and fourteen days), and a mastery test on unseen questions at the end.
 */
function layoutMastery(syllabus: Syllabus, days: Days, prefix: string): { planned: Planned[]; compressed: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const N = days.dates.length;
  const planned: Planned[] = [];
  if (!units.length || !N) return { planned, compressed: false };
  const key = keyFor(prefix);
  const last = N - 1;
  // One topic's parts are smaller than a syllabus's topics: shorter sessions, so the time left over goes to recall at widening gaps.
  let learn = units.map((u) => round5(revisionMinutes(u, u.confidence) - 5));
  let practise = units.map((u) => round5(practiceMinutes(u, u.confidence) - 5));
  const needed = learn.reduce((s, m) => s + m, 0) + practise.reduce((s, m) => s + m, 0);
  const room = (n: number) => days.capacity.slice(0, n).reduce((sum, c) => sum + c, 0) * 0.75;
  // Learning takes the first 45% of the time, up to 70% when there is a lot to learn; beyond that, sessions get shorter.
  let L = Math.max(1, Math.min(last, Math.ceil(N * 0.45)));
  while (L < Math.min(last, Math.ceil(N * 0.7)) && needed > room(L)) L++;
  let compressed = false;
  // Far too little time for a study and a practice session per part, even shortened: one session a part that does both.
  const combine = needed * 0.5 > room(L);
  if (needed > room(L)) {
    compressed = true;
    const factor = Math.max(0.5, room(L) / needed);
    if (combine) learn = learn.map((m, i) => Math.max(20, round5((m + practise[i]) * Math.max(0.25, room(L) / needed))));
    else learn = learn.map((m) => Math.max(25, round5(m * factor)));
    practise = practise.map((m) => Math.max(20, round5(m * factor)));
  }
  const spans = proportionalSpans(units.map((_, i) => learn[i] + practise[i]), L);
  units.forEach((unit, i) => {
    const [from, to] = spans[i];
    const study = key("learn", unit.key);
    planned.push({ key: study, role: "learn", units: [unit], title: "", minutes: learn[i], from, to: Math.min(L - 1, to + 1), after: [], ...(combine ? { combined: true } : {}) });
    if (!combine) planned.push({ key: key("practise", unit.key), role: "practise", units: [unit], title: "", minutes: practise[i], from, to: Math.min(L - 1, to + 1), after: [study] });
  });
  const end = Math.max(...spans.map(([, to]) => to));
  let n = 0;
  let previous: string[] = units.map((u) => key(combine ? "learn" : "practise", u.key));
  for (const gap of [1, 3, 7, 14]) {
    const day = end + gap;
    if (day >= last) break;
    const recall = key("recall", ++n);
    planned.push({ key: recall, role: "recall", units, title: "", minutes: 30, from: day, to: Math.min(last - 1, day + 1), after: previous, repeat: n - 1 });
    previous = [recall];
  }
  if (N >= 2) planned.push({ key: key("checkpoint", "final"), role: "checkpoint", units, title: "", minutes: Math.min(75, 30 + units.length * 5), from: last, to: last, after: previous });
  return { planned, compressed };
}

/**
 * The study days a regular practice falls on: `perWeek` of each calendar week's study days, spread out, and a fair share of a partial first or
 * last week.
 */
function practiceDays(days: Days, perWeek: number): number[] {
  const weeks = new Map<string, number[]>();
  days.dates.forEach((date, i) => { const w = weekStart(date); weeks.set(w, [...(weeks.get(w) ?? []), i]); });
  const first = days.dates[0];
  const last = days.dates[days.dates.length - 1];
  const out: number[] = [];
  for (const [week, list] of weeks) {
    const from = week > first ? week : first;
    const to = addDays(week, 6) < last ? addDays(week, 6) : last;
    const span = Math.max(1, Math.min(7, diffDays(to, from) + 1));
    const k = Math.min(list.length, perWeek, Math.max(1, Math.round((perWeek * span) / 7)));
    for (let j = 0; j < k; j++) out.push(list[Math.floor((j * list.length) / k)]);
  }
  return out;
}

/**
 * A skill with no exam: stages in order, each a lesson, practice sessions and a milestone check, on about `daysPerWeek` days a week at
 * `sessionMinutes` a session. Without a date the plan runs as long as the stages need.
 */
function layoutSkill(syllabus: Syllabus, days: Days, prefix: string, perWeek: number, session: number): { planned: Planned[]; compressed: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const planned: Planned[] = [];
  if (!units.length || !days.dates.length) return { planned, compressed: false };
  const key = keyFor(prefix);
  const slots = practiceDays(days, perWeek);
  const usual = slots.length;
  const sequence: Omit<Planned, "from" | "to">[] = [];
  for (const unit of units) {
    const reps = unit.confidence === "strong" ? 1 : unit.weight + (unit.confidence === "weak" ? 2 : 1);
    sequence.push({ key: key("lesson", unit.key), role: "lesson", units: [unit], title: "", minutes: session, after: [] });
    for (let r = 0; r < reps; r++) sequence.push({ key: key("practise", r ? `${unit.key}.${r + 1}` : unit.key), role: "practise", units: [unit], title: "", minutes: session, after: [], repeat: r });
    sequence.push({ key: key("milestone", unit.key), role: "milestone", units: [unit], title: "", minutes: session, after: [] });
  }
  // When the date does not leave a slot for every session: drop extra practice, then milestone checks except the last, then use every study day,
  // then two sessions a day. Every stage keeps its lesson and at least one practice session.
  let compressed = false;
  while (sequence.length > slots.length && sequence.some((p) => p.role === "practise" && (p.repeat ?? 0) > 0)) {
    const at = sequence.map((p, i) => ({ p, i })).filter(({ p }) => p.role === "practise" && (p.repeat ?? 0) > 0).sort((a, b) => (b.p.repeat ?? 0) - (a.p.repeat ?? 0) || b.i - a.i)[0].i;
    sequence.splice(at, 1);
    compressed = true;
  }
  if (sequence.length > slots.length) {
    const lastMilestone = sequence.map((p) => p.role).lastIndexOf("milestone");
    for (let i = sequence.length - 1; i >= 0 && sequence.length > slots.length; i--) if (sequence[i].role === "milestone" && i !== lastMilestone) sequence.splice(i, 1);
  }
  if (sequence.length > slots.length) slots.splice(0, slots.length, ...days.dates.map((_, i) => i));
  if (sequence.length > slots.length) slots.splice(0, slots.length, ...days.dates.flatMap((_, i) => [i, i]));
  sequence.slice(0, Math.max(1, slots.length)).forEach((p, i) => {
    const from = slots[Math.min(i, slots.length - 1)];
    const following = slots.slice(i + 1).find((x) => x > from);
    const to = Math.min(days.dates.length - 1, following != null ? Math.max(from, following - 1) : from + 1);
    planned.push({ ...p, from, to, after: i > 0 ? [sequence[i - 1].key] : [] });
  });
  return { planned, compressed: compressed || sequence.length > usual };
}

/**
 * A book or reading list: each part read in order at a steady pace that uses the time offered, a written recap every three sittings, and a final
 * recap. A part longer than a day's reading is read over two or three sittings; short chapters share one, so a long book still fits.
 */
function layoutReading(syllabus: Syllabus, days: Days, prefix: string, pacing: Pacing = NO_PACING): { planned: Planned[]; compressed: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const N = days.dates.length;
  const planned: Planned[] = [];
  if (!units.length || !N) return { planned, compressed: false };
  const key = keyFor(prefix);
  const L = Math.max(1, N >= 4 ? N - 1 : N);
  const base = units.map((u) => 30 + u.weight * 10);
  const offered = days.capacity.slice(0, L).reduce((sum, c) => sum + c, 0);
  // A recap is twenty minutes, or the smallest session the daily limit packs into.
  const recapMinutes = pacing.limit ? [...fitsFor(pacing.limit)].sort((a, b) => Math.abs(a - 20) - Math.abs(b - 20))[0] ?? 20 : 20;
  const recaps = (Math.floor(units.length / 3) + 1) * recapMinutes;
  // A little below the plan's usual fill: a book's last days carry its final sittings and the recap.
  const factor = pacing.fill ? Math.max(0.25, Math.min(2, (offered * Math.min(0.7, pacing.fill) - recaps) / base.reduce((sum, m) => sum + m, 0))) : 1;
  const minutes = base.map((m) => m * factor);
  const spans = proportionalSpans(minutes, L);
  const sitting = Math.min(pacing.limit ?? 45, 60);
  // Consecutive short chapters are packed into one sitting until it is about a sitting long.
  const groups: number[][] = [];
  for (let i = 0; i < units.length; i++) {
    const last = groups[groups.length - 1];
    const size = last ? last.reduce((sum, k) => sum + minutes[k], 0) : Infinity;
    if (last && size < sitting * 0.75 && size + minutes[i] <= sitting * 1.1) last.push(i); else groups.push([i]);
  }
  let previous: string | null = null;
  groups.forEach((group, g) => {
    const first = group[0];
    const from = spans[first][0];
    const to = Math.min(L - 1, spans[group[group.length - 1]][1] + 1);
    const total = group.reduce((sum, k) => sum + minutes[k], 0);
    const sittings = group.length === 1 && pacing.limit && total > pacing.limit ? Math.min(3, Math.ceil(total / pacing.limit)) : 1;
    for (let k = 1; k <= sittings; k++) {
      const read = k === 1 ? key("read", units[first].key) : key("read", `${units[first].key}.p${k}`);
      planned.push({ key: read, role: "read", units: group.map((i) => units[i]), title: "", minutes: Math.max(15, round5(Math.min(pacing.limit ?? Infinity, total / sittings))), from, to, after: previous ? [previous] : [], ...(sittings > 1 ? { part: [k, sittings] as [number, number] } : {}) });
      previous = read;
    }
    if ((g + 1) % 3 === 0 && g < groups.length - 1) {
      const covered = groups.slice(g - 2, g + 1).flat().map((i) => units[i]);
      planned.push({ key: key("recall", (g + 1) / 3), role: "recall", units: covered, title: "", minutes: 20, from: to, to: Math.min(L - 1, to + 2), after: [previous!] });
    }
  });
  if (N >= 4) planned.push({ key: key("recall", "final"), role: "recall", units, title: "", minutes: 30, from: N - 2, to: N - 1, after: previous ? [previous] : [] });
  return { planned, compressed: factor < 0.6 };
}

/** The exam path: revise and practise each topic, mixed reviews, timed papers with corrections, the final review. */
function layoutExam(syllabus: Syllabus, days: { dates: string[]; capacity: number[] }, prefix: string, pacing: Pacing = NO_PACING): { planned: Planned[]; compressed: boolean; quick?: boolean } {
  const units = syllabus.units.filter((u) => u.included);
  const N = days.dates.length;
  const planned: Planned[] = [];
  if (!units.length || !N) return { planned, compressed: false };
  // A day or two before the exam, or days far too short for a topic-by-topic path: quick revision of everything, then mixed practice.
  const all = days.capacity.reduce((sum, c) => sum + c, 0);
  if (N <= 2 || all < units.length * 45) return layoutCram(syllabus, days, prefix);
  // Without a known paper the path still ends in timed practice, at an hour, from past papers or the teacher's questions.
  const papers = syllabus.papers.length ? syllabus.papers : [PRACTICE_PAPER];
  const key = (role: StudyRole, id: string | number) => `${prefix}${KEY_ROLE[role]}.${id}`;
  const last = N - 1;

  // One day for the final review when there is more than one study day.
  const finalDay = N >= 2 ? last : -1;
  const before = finalDay >= 0 ? finalDay : N;
  // Past papers: each takes a day, followed by a corrections day. More time buys more papers.
  const paperCount = !papers.length ? 0 : fitPapers(days, papers, papersFor(N), N >= 2 ? N - 1 : N);
  const paperDays = paperCount ? tailDaysFor(days, papers, paperCount, before, units.filter((u) => u.confidence === "weak").length) : 0;
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
  // Far too little time for a revision and a practice session per topic, even shortened: one session a topic that does both.
  const combine = needed * 0.5 > budget;
  const squeeze = Math.max(0.25, budget / needed);
  if (needed > budget) {
    compressed = true;
    const factor = Math.max(0.5, budget / needed);
    if (combine) revise = revise.map((m, i) => Math.max(20, round5((m + practise[i]) * squeeze)));
    else revise = revise.map((m) => Math.max(25, round5(m * factor)));
    practise = practise.map((m) => Math.max(25, round5(m * factor)));
  }
  // More time than the topics need: more sessions per topic rather than an empty calendar.
  const depth = compressed ? 1 : depthFor(pacing, capacityLearn, needed, mixedCount * 45);

  // Each topic gets a share of the learning days in proportion to its size, in syllabus order, with one day of slack for the calendar.
  const spans = proportionalSpans(units.map((_, i) => revise[i] + practise[i]), L);
  units.forEach((unit, i) => {
    if (!combine) { addUnit(planned, unit, { study: revise[i], practise: practise[i] }, depth, pacing.session, "revise", spans[i], L, before, keyFor(prefix)); return; }
    planned.push({ key: key("revise", unit.key), role: "revise", units: [unit], title: "", minutes: revise[i], from: spans[i][0], to: Math.min(L - 1, spans[i][1] + 1), after: [], combined: true });
  });

  // Mixed reviews: each group of three topics comes back at least two days after its last topic, while learning continues.
  if (mixedCount && !combine) {
    for (let g = 0; g < mixedCount; g++) {
      const group = units.slice(g * 3, g === mixedCount - 1 ? units.length : g * 3 + 3);
      const end = Math.max(...group.map((u) => spans[units.indexOf(u)][1]));
      const from = end + 2;
      if (from > before - 1) continue;
      planned.push({ key: key("mixed", g + 1), role: "mixed", units: group, title: "", minutes: depth >= 1.25 ? Math.max(45, pacing.session) : 45 + (group.length > 3 ? 15 : 0), from, to: from >= L ? before - 1 : Math.min(before - 1, from + 4), after: group.map((u) => key(combine ? "revise" : "practise", u.key)) });
    }
  }

  // Weak topics come back for an extra practice session after a gap (already part of the spaced practice when there is time for more).
  for (const unit of units) {
    if (unit.confidence !== "weak" || depth >= 1.25 || combine) continue;
    const [, to] = spans[units.indexOf(unit)];
    const from = to + 2;
    if (from > Math.max(0, before - 1)) continue;
    planned.push({ key: key("practise", `${unit.key}.2`), role: "practise", units: [unit], title: "", minutes: practiceMinutes(unit, "okay"), from, to: Math.min(before - 1, from + 3), after: [key("practise", unit.key)], repeat: 1 });
  }

  // Past papers, each followed by its corrections. After the first, the weak topics it exposed. Then the final review.
  examTail(planned, units, papers, paperCount, L, before, finalDay, keyFor(prefix));
  return { planned, compressed };
}

/**
 * Compiles a goal's syllabus into its sessions and merges them into the model. Sessions already studied keep their history; sessions that are no
 * longer needed are released; everything else of the goal that was not compiled from the syllabus (an older template, say) is released when unstarted.
 */
export function compileStudyPath(model: WorkModel, goalKey: string, snapshot: PlanningSnapshot, source: Source = "template"): { model: WorkModel; summary: PathSummary } {
  const next: WorkModel = JSON.parse(JSON.stringify(model));
  const goal = next.goals.find((g) => g.key === goalKey);
  const empty: PathSummary = { checkpoints: 0, from: null, to: null, topics: 0, revise: 0, practise: 0, mixed: 0, papers: 0, sessions: 0, minutes: 0, days: 0, compressed: false };
  if (!goal?.syllabus) return { model: next, summary: empty };
  const syllabus = goal.syllabus;
  const preset = presetOf(goal);
  const pace = goal.pace ?? {};
  const start = pace.start && pace.start > snapshot.today ? pace.start : snapshot.today;
  const perWeek = Math.max(1, Math.min(7, Math.round(pace.daysPerWeek ?? 4)));
  const session = Math.max(15, Math.min(120, round5(pace.sessionMinutes ?? 30)));
  const included = syllabus.units.filter((u) => u.included);
  // Without a date, each kind of plan runs as long as its content needs: a course about four days a topic, a skill as many weeks as its sessions.
  const open = (): string => {
    switch (preset) {
      case "course": return addDays(start, Math.min(364, Math.max(27, included.length * 4 + 13)));
      case "skill": {
        const sessions = included.reduce((n, u) => n + 2 + (u.confidence === "strong" ? 1 : u.weight + (u.confidence === "weak" ? 2 : 1)), 0);
        return addDays(start, Math.min(364, (Math.ceil(sessions / perWeek) + 1) * 7 + 3));
      }
      case "reading": return addDays(start, Math.min(364, Math.max(6, Math.ceil(included.length * 1.6) + 2)));
      case "mastery": return addDays(start, 20);
      default: return addDays(start, 27);
    }
  };
  const until = goal.due ? addDays(goal.due, -1) : open();
  // The plan's daily limit: the student's minutes a day (never above their account's daily cap), or, when they gave none, a default for the kind
  // of plan, so one goal never takes a whole day by accident. An exam a day or two away is the exception: then the time there is, is the plan.
  const asked = preset !== "skill" && pace.minutesPerDay && pace.minutesPerDay >= 15 ? round5(Math.min(pace.minutesPerDay, snapshot.settings.dailyCap)) : null;
  const short = studyDays(snapshot, next, until, { from: start }).dates.length <= 3;
  const limit = asked ?? (preset === "skill" || (short && (preset === "exam" || preset === "mastery")) ? null : DEFAULT_DAILY[preset] ?? null);
  // Fill: most of what the student offered; a default limit fills only part of it, and only for exams and courses (a book or a topic is not padded).
  const pacing: Pacing = { limit, session: sessionFor(limit), fill: asked ? 0.8 : limit && (preset === "exam" || preset === "course") ? 0.55 : null };
  const days = studyDays(snapshot, next, until, { from: start, minutesPerDay: limit });
  const prefix = pathPrefix(goal.key);
  const exam = Boolean(goal.due) && (goal.type === "exam" || syllabus.papers.length > 0);
  const { planned, compressed, quick }: { planned: Planned[]; compressed: boolean; quick?: boolean } = preset === "course" ? layoutCourse(syllabus, days, prefix, exam, pacing)
    : preset === "mastery" ? layoutMastery(syllabus, days, prefix)
    : preset === "skill" ? layoutSkill(syllabus, days, prefix, perWeek, session)
    : preset === "reading" ? layoutReading(syllabus, days, prefix, pacing)
    : layoutExam(syllabus, days, prefix, pacing);
  // A paper never takes more than the student's whole daily cap: past that, it is practised as a timed section of that length.
  for (const p of planned) if (p.role === "paper") p.minutes = Math.min(p.minutes, Math.max(30, floor5(snapshot.settings.dailyCap)));
  // Papers are numbered per paper: the second Paper 2 is "Paper 2 timed past paper 2".
  const paperIndex = new Map<string, number>();
  const perLabel = new Map<string, number>();
  for (const p of planned) if (p.role === "paper") { const label = p.paper?.label ?? ""; const k = perLabel.get(label) ?? 0; paperIndex.set(p.key, k); perLabel.set(label, k + 1); }
  for (const p of planned) p.title = titleFor(p, syllabus, preset, paperIndex);
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

  // Under the daily limit, no session is longer than the day allows. A full paper may be longer: it takes its day to itself (the solver's "solo"
  // sitting), and takes its real length when the limit allows it, rather than a few minutes more that would make the limit awkward to fill.
  const dayLimit = limit;
  const sitting = (p: Planned) => (dayLimit && p.role === "paper" && p.paper && dayLimit >= p.paper.minutes ? Math.min(p.minutes, dayLimit) : p.minutes);
  let first = 0;
  for (const p of planned) {
    const shape = ROLE_SHAPE[p.role];
    // Under a daily limit, sessions take a whole, half or third of the day's allowance, so days pack without leftover crumbs.
    const fits = dayLimit ? fitsFor(dayLimit) : [];
    // The nearest fitting size (the larger on a tie), so a 55-minute session becomes an hour rather than half of one. The final review stays light.
    const nearest = [...fits].sort((a, b) => Math.abs(a - p.minutes) - Math.abs(b - p.minutes) || b - a)[0];
    const minutes = !dayLimit ? p.minutes : p.role === "paper" ? sitting(p) : p.role === "final" ? fits.filter((x) => x <= p.minutes).sort((a, b) => b - a)[0] ?? fits[fits.length - 1] : nearest ?? Math.min(p.minutes, dayLimit);
    const whole = p.role === "paper" || Boolean(dayLimit);
    const sizes = normalizeSizes([minutes, round5(minutes * 1.25)], whole ? [minutes, minutes, minutes] : [Math.min(minutes, 30), minutes, Math.max(minutes, 60)]);
    const earliest = dateAt(p.from);
    let due = dateAt(p.to);
    if (goal.due && due >= goal.due) due = addDays(goal.due, -1) >= snapshot.today ? addDays(goal.due, -1) : goal.due;
    if (due < earliest) due = earliest;
    const details = detailsFor(p, syllabus, weakUnits, preset);
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
  // "Hours a day" for this plan is a hard daily limit on its sessions, never lower than its longest single sitting (a full paper).
  const capKey = `cap:${goal.key}`;
  next.constraints = next.constraints.filter((c) => c.key !== capKey);
  if (dayLimit) {
    const minutes = dayLimit;
    next.constraints.push({ key: capKey, kind: "goal_cap", goal: goal.key, minutes, hard: true, weight: 3, provenance: asked ? "student" : "default", label: `At most ${formatMinutes(minutes)} a day for ${clip(goal.title, 40)}` });
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
      preset, topics: included.length, revise: count("revise") + count("learn") + count("lesson") + count("read"), practise: count("practise", true), mixed: count("mixed") + count("recall", true),
      papers: count("paper", true), checkpoints: count("checkpoint") + count("milestone"),
      sessions: planned.length, minutes: planned.reduce((s, p) => s + p.minutes, 0), days: days.dates.length, compressed, ...(quick ? { quick: true } : {}),
      dated: Boolean(goal.due), from: planned.length ? dateAt(Math.min(...planned.map((p) => p.from))) : null, to: planned.length ? dateAt(Math.max(...planned.map((p) => p.to))) : null,
    },
  };
}

/**
 * An assignment broken down by the model, paced over the time to its date: each unstarted item gets a window in proportion to its size, in the
 * order given, so reading comes before drafting and nothing is crammed into the first days. The last tenth of the time stays free as a buffer.
 * Windows only narrow what the model set; work already started keeps its own.
 */
export function paceWork(model: WorkModel, goalKey: string, snapshot: PlanningSnapshot): WorkModel {
  const next: WorkModel = JSON.parse(JSON.stringify(model));
  const goal = next.goals.find((g) => g.key === goalKey);
  if (!goal?.due) return next;
  const items = next.items.filter((i) => i.goal === goalKey && i.status === "open" && i.done === 0 && !i.details);
  if (items.length < 2) return next;
  const days = studyDays(snapshot, next, addDays(goal.due, -1));
  const N = days.dates.length;
  if (N < 4) return next;
  const spans = proportionalSpans(items.map((i) => Math.max(15, i.est[0])), Math.max(2, Math.floor(N * 0.9)));
  items.forEach((item, i) => {
    const [from, to] = spans[i];
    const earliest = days.dates[from];
    const due = days.dates[Math.min(N - 1, to + 2)];
    if (earliest > snapshot.today && (!item.earliest || item.earliest < earliest)) item.earliest = earliest;
    if (!item.due || item.due > due) item.due = due < (item.earliest ?? snapshot.today) ? item.earliest : due;
  });
  return next;
}

function firstStepFor(p: Planned): string | null {
  const unit = p.units[0];
  switch (p.role) {
    case "revise": return `Open your notes on ${unit.title} and redo one example for the first key point without looking.`;
    case "practise": return `Find the ${unit.title} questions in two recent past papers and set a timer.`;
    case "learn": return `Open the ${unit.title} chapter and write its first key point in your own words.`;
    case "lesson": return `Find one good explanation of ${unit.title} and try the first point slowly.`;
    case "read": return `Open ${unit.title} and note the first key idea.`;
    default: return null;
  }
}

/** The preset a goal plans with: its own, or what its type implies for goals made before presets. */
export function presetOf(goal: Pick<KGoal, "preset" | "type">): PlanPreset {
  if (goal.preset) return goal.preset;
  switch (goal.type) {
    case "skill": return "skill";
    case "reading": return "reading";
    case "essay": case "project": case "problem_set": return "assignment";
    default: return "exam";
  }
}

const PRESET_WORDS: [RegExp, PlanPreset][] = [
  [/\b(essay|report|dissertation|thesis|coursework|assignment|project|presentation|portfolio|lab report|problem set|homework)\b/i, "assignment"],
  [/\b(read|reading list|book|novel|chapters? \d+ ?(?:-|to) ?\d+ of)\b/i, "reading"],
  [/\b(exam|exams|midterm|mid-term|mid term|finals?|mock|test|quiz|boards?|paper \d|sat|act|ap\b|gcse|igcse|a-?levels?|o-?levels?|certification|certificate exam|licen[cs]e exam)\b/i, "exam"],
  [/\b(whole|entire|full|complete) (course|syllabus|subject|module|curriculum|year)\b|\b(course|module|semester|term|curriculum|syllabus)\b/i, "course"],
  [/\b(chapter|topic|unit|master|mastering|understand|get good at)\b/i, "mastery"],
  [/\b(learn|learning|skill|practi[cs]e|language|instrument|guitar|piano|coding|programming|drawing|speaking|fluency|habit)\b/i, "skill"],
];

/** Auto without the model: the first preset whose words the request uses, or a course when it names a date far away. */
export function inferPreset(text: string, due: string | null, today: string): PlanPreset {
  const found = PRESET_WORDS.find(([re]) => re.test(text))?.[1];
  if (found) return found;
  if (due && diffDays(due, today) > 45) return "course";
  return due ? "exam" : "skill";
}

const PRESET_SHAPE: Record<PlanPreset, string> = {
  exam: "revise and practise each topic, mixed reviews, timed papers, light final day",
  course: "study and practise each topic, spaced reviews, checkpoint tests",
  mastery: "study each part, recall checks at widening gaps, mastery test",
  skill: "lessons, practice and a milestone for each stage",
  assignment: "research, outline, draft, revise, check",
  reading: "read in order with written recaps",
};

/** One short line on how the path works, from the compiler's counts. */
export function describePath(summary: PathSummary, syllabus: Pick<Syllabus, "papers">, preset: PlanPreset = summary.preset ?? "exam"): string {
  const n = summary.topics;
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
  if (summary.quick) return `Quick revision of all ${plural(n, "topic")} in ${summary.sessions - 1 === 1 ? "one session" : `${summary.sessions - 1} short sessions`}, then mixed practice on everything.`;
  switch (preset) {
    case "course": return `${plural(n, "topic")} in order${summary.mixed ? `, ${plural(summary.mixed, "review")}` : ""}${summary.checkpoints ? `, ${plural(summary.checkpoints, "checkpoint test")}` : ""}${summary.papers ? `, ${plural(summary.papers, "timed paper")}` : ""}.${summary.compressed ? " Time is tight, so sessions are short." : ""}`;
    case "mastery": return `${plural(n, "part")}, ${plural(summary.mixed, "recall check")} at widening gaps, then a mastery test.${summary.compressed ? " Time is tight, so sessions are short." : ""}`;
    case "skill": return `${plural(n, "stage")}, each with a lesson, practice and a milestone check.${summary.compressed && summary.dated ? " Fewer practice sessions fit before your date." : ""}`;
    case "reading": return `${plural(n, "part")} at a steady pace, with written recaps.`;
    default: {
      const paper = syllabus.papers[0]?.label ?? "past paper";
      const papers = summary.papers === 1 ? `1 timed ${paper}` : /s$/i.test(paper) || /[^a-z0-9 ]/i.test(paper) || paper.split(" ").length > 2 ? `${summary.papers} timed papers (${paper})` : `${summary.papers} timed ${paper}s`;
      return `${plural(n, "topic")} revised and practised in order${summary.mixed ? `, ${plural(summary.mixed, "mixed review")}` : ""}${summary.papers ? `, ${papers}` : ""}, light final day.${summary.compressed ? " Time is tight, so sessions are short." : ""}`;
    }
  }
}
export const presetShape = (preset: PlanPreset) => PRESET_SHAPE[preset];

/** A quest's description: the aim, the key points and how to study. */
export function questDescription(item: Pick<WorkItem, "details" | "note" | "firstStep">): string | null {
  const d = item.details;
  if (!d) return [item.note, item.firstStep ? `First step: ${item.firstStep}` : null].filter(Boolean).join("\n") || null;
  const heading = d.role === "revise" || d.role === "learn" || d.role === "lesson" || d.role === "read" ? "Key points" : d.role === "practise" || d.role === "milestone" ? "Check you can" : d.role === "mixed" || d.role === "weak" || d.role === "recall" ? "Cover" : "Checklist";
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
    const title = shortTitle(cleanTitle(added.title), TOPIC_TITLE);
    if (!title || goal.syllabus.units.some((u) => u.title.toLowerCase() === title.toLowerCase())) continue;
    goal.syllabus.units.push({ key: `u${++n}`, title, points: (added.points ?? []).map((p) => shortPoint(cleanTitle(p))).filter(Boolean).slice(0, 8), weight: 2, difficulty: 2, confidence: null, included: true, topic: null });
  }
  if (typeof changes.checked === "boolean") goal.syllabus.checked = changes.checked;
  return next;
}

/** A topic name that fits in `max` characters without breaking a word: "The balance of payments and exchange rates" → "Balance of payments and exchange rates". */
/**
 * A key point kept whole when it can be: at most 110 characters, shortened at a natural break (a bracket, a comma, a semicolon) and never with a
 * dangling word or an ellipsis.
 */
export function shortPoint(text: string, max = 110): string {
  const t = text.trim().replace(/[.;,]+$/, "");
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const bracket = head.lastIndexOf(" (");
  if (bracket >= 40) return head.slice(0, bracket).trim();
  const comma = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(" – "));
  if (comma >= 40) return head.slice(0, comma).trim();
  return head.replace(/\s+\S*$/, "").replace(/(?:[\s,;&]+(?:and|or|of|the|to|for|in|on|with|by|at|as|a|an|from|&))+$/i, "").replace(/[\s,;:&-]+$/, "");
}

/** The longest topic name: room for "System of Particles and Rotational Motion", short enough for a session title around it. */
export const TOPIC_TITLE = 48;

export function shortTitle(text: string, max = 40): string {
  let t = text.trim();
  if (t.length <= max) return t;
  t = t.replace(/^(the|an|a)\s+/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= max) return t;
  const head = t.split(/\s*[:(–—]\s*/)[0];
  if (head.length >= 4 && head.length <= max) return head;
  // "Terms of trade and international competitiveness" → "Terms of trade": the first half of an "and" when it says enough on its own.
  const first = t.split(/\s+and\s+/i)[0];
  if (first !== t && first.length >= 12 && first.length <= max && !/,/.test(first)) return first;
  // "General principles of foundational science" → "General principles": the head of an "of" phrase rather than a cut mid-phrase.
  const of = /^(.{8,}?)\s+(?:of|in|for|with|on)\s+/i.exec(t)?.[1];
  if (of && of.length <= max && t.slice(0, max + 1).replace(/\s+\S*$/, "").length < t.length - 3 && !/,/.test(of)) return of;
  let cut = t.slice(0, max + 1).replace(/\s+\S*$/, "");
  cut = cut.replace(/(?:[\s,;&]+(?:and|or|of|the|to|for|in|on|with|between|within|about|among|from|by|at|as|into|&))+$/i, "").replace(/[\s,;:&-]+$/, "");
  return cut.length >= 4 ? cut : clip(t, max);
}

/** A paper's short name for titles: "Paper 2" from "Paper 2: The national and global economy", "Section I, Part A" from its full heading. */
export function paperLabel(raw: string): string {
  const text = cleanTitle(raw);
  if (!text) return "Past paper";
  const head = text.split(/\s*[:–—(]\s*/)[0].trim();
  if (head.length >= 3 && head.length <= 24) return head;
  const named = /\b(paper|section|component|unit|part)\s*([0-9]+[a-z]?|[ivx]+)\b/i.exec(text);
  if (named) return `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()} ${named[2]}`;
  return clip(text, 24);
}

/** Normalizes a syllabus from any source: clean titles, three to seven points, bounded weights, unique keys, at most 40 units. */
export function normalizeSyllabus(raw: { source: Syllabus["source"]; ref?: string | null; name: string; papers?: Partial<SyllabusPaper>[]; units: (Partial<SyllabusUnit> & { title: string })[]; checked?: boolean; sources?: { title: string; url: string }[]; researched?: boolean }): Syllabus {
  const level = (v: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 => (v === 1 || v === 2 || v === 3 ? v : typeof v === "number" ? (Math.max(1, Math.min(3, Math.round(v))) as 1 | 2 | 3) : fallback);
  const seen = new Set<string>();
  const units: SyllabusUnit[] = [];
  for (const unit of raw.units) {
    const title = shortTitle(cleanTitle(String(unit.title ?? "")).replace(/^\d+(\.\d+)*\s*[:.)-]?\s*/, ""), TOPIC_TITLE);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    units.push({
      key: `u${units.length + 1}`, title,
      points: (unit.points ?? []).map((p) => shortPoint(cleanTitle(String(p)))).filter(Boolean).slice(0, 8),
      weight: level(unit.weight, 2), difficulty: level(unit.difficulty, 2),
      confidence: unit.confidence === "weak" || unit.confidence === "okay" || unit.confidence === "strong" ? unit.confidence : null,
      included: unit.included !== false, topic: typeof unit.topic === "number" ? unit.topic : null,
    });
    if (units.length >= 40) break;
  }
  const papers = (raw.papers ?? [])
    .map((p) => ({ label: paperLabel(String(p.label ?? "")), minutes: Math.max(20, Math.min(480, round5(Number(p.minutes) || 0))), marks: typeof p.marks === "number" && p.marks > 0 ? Math.round(p.marks) : null }))
    .filter((p) => p.minutes >= 20)
    .slice(0, 4);
  const sources = (raw.sources ?? []).filter((x) => /^https?:\/\//.test(x.url)).slice(0, 6).map((x) => ({ title: clip(cleanTitle(x.title) || x.url, 120), url: x.url.slice(0, 500) }));
  return { source: raw.source, ref: raw.ref ?? null, name: clip(cleanTitle(raw.name) || "Syllabus", 120), papers, units, checked: raw.checked === true, ...(sources.length ? { sources } : {}), ...(raw.researched ? { researched: true } : {}) };
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
    if (b >= a && b - a < 40) return Array.from({ length: b - a + 1 }, (_, i) => ({ title: `Chapter ${a + i}`, points: [] }));
  }
  const labelled = /\b(?:topics?|chapters?|units?)\s*(?:are|include|covered)?\s*[:\-–]\s*([^\n]+)/i.exec(text);
  const split = (line: string) => {
    const [head, rest] = line.split(/\s*[:–—]\s+|\s+-\s+/, 2);
    return { title: shortTitle(cleanTitle(head.replace(/^[-*•\d.)\s]+/, "")), TOPIC_TITLE), points: rest ? rest.split(/\s*[;,]\s*/).map((p) => shortPoint(cleanTitle(p))).filter(Boolean).slice(0, 8) : [] };
  };
  if (labelled) {
    const parts = labelled[1].split(/\s*(?:,|;|\band\b)\s*/i).map((p) => p.trim()).filter((p) => p.length >= 2 && p.length <= 60);
    if (parts.length >= 2) return parts.slice(0, 40).map((p) => ({ title: shortTitle(cleanTitle(p), TOPIC_TITLE), points: [] }));
  }
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const listy = lines.filter((l) => /^[-*•]|^\d+[.)]\s/.test(l) || (l.length <= 70 && !/[.?!]$/.test(l) && l.split(/\s+/).length <= 10));
  if (lines.length >= 2 && listy.length >= Math.max(2, Math.ceil(lines.length * 0.7))) return listy.slice(0, 40).map(split).filter((u) => u.title.length >= 2);
  return [];
}

export interface GuidePhase { key: string; title: string; from: string | null; to: string | null; sessions: number }

/** The plan in phases with real dates: from placed blocks, and for work beyond the detailed horizon from its windows. */
export function pathPhases(model: WorkModel, goal: KGoal, blocks: readonly { item: string; date: string; state: string }[], today?: string): GuidePhase[] {
  const items = model.items.filter((i) => i.goal === goal.key && i.details && i.status !== "dropped");
  const live = blocks.filter((b) => b.state !== "skipped");
  const range = (own: WorkItem[]) => {
    const keys = new Set(own.map((i) => i.key));
    const placed = live.filter((b) => keys.has(b.item)).map((b) => b.date);
    const unplaced = own.filter((i) => !placed.length || !live.some((b) => b.item === i.key));
    const dates = [...placed, ...unplaced.flatMap((i) => [i.earliest ?? today ?? null, i.due].filter((d): d is string => Boolean(d)))].sort();
    return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, sessions: own.length };
  };
  const by = (roles: StudyRole[]) => items.filter((i) => roles.includes(i.details!.role));
  const n = goal.syllabus?.units.filter((u) => u.included).length ?? 0;
  const out: GuidePhase[] = [];
  const push = (key: string, title: string, own: WorkItem[]) => { if (own.length) out.push({ key, title, ...range(own) }); };
  switch (presetOf(goal)) {
    case "skill":
      for (const unit of goal.syllabus?.units.filter((u) => u.included) ?? []) push(unit.key, unit.title, items.filter((i) => i.details!.units.includes(unit.key)));
      break;
    case "reading":
      push("read", `Read ${n} part${n === 1 ? "" : "s"}`, by(["read", "recall"]));
      break;
    case "mastery":
      push("learn", `Study ${n} part${n === 1 ? "" : "s"}`, by(["learn", "practise"]));
      push("recall", "Recall checks", by(["recall"]));
      push("test", "Mastery test", by(["checkpoint"]));
      break;
    case "course":
      push("learn", `Learn ${n} topic${n === 1 ? "" : "s"}`, by(["learn", "practise", "mixed", "recall", "checkpoint"]).filter((i) => !i.key.endsWith(".recall.final")));
      push("papers", "Exam practice", by(["paper", "corrections", "weak"]));
      push("final", "Final review", [...by(["final"]), ...items.filter((i) => i.key.endsWith(".recall.final"))]);
      break;
    default:
      push("learn", `Revise ${n} topic${n === 1 ? "" : "s"}`, by(["revise", "practise", "mixed"]));
      push("papers", "Timed papers", by(["paper", "corrections", "weak"]));
      push("final", "Final review", by(["final"]));
  }
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
      ?? units.find((u) => part.length >= 6 && u.title.toLowerCase().includes(part))
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

/** Marks the topics a learner named as weak ("integration, trig and vectors"), one name at a time, so one unknown name never blocks the rest. */
/**
 * What the learner singles out in their own words ("…especially conditional probability and Bayes", "focus on vectors"): the phrases after
 * especially, particularly, mainly, including, focus on, struggle with or weak at, split at commas and "and".
 */
export function namedFocus(text: string | null | undefined): string[] {
  const match = /\b(?:especially|particularly|mainly|mostly|including|focus(?:ing)? on|struggl(?:e|ing) with|weak (?:at|in|on)|problems? with)\s+(.+)$/i.exec(text ?? "");
  if (!match) return [];
  return match[1].replace(/[.!?].*$/, "").split(/\s*(?:,|;|\band\b|\bor\b|&|\/)\s*/i).map((p) => p.replace(/^(?:the|a|an|my)\s+/i, "").replace(/\s+(?:questions?|problems?|topics?)$/i, "").trim()).filter((p) => p.length >= 3 && p.split(/\s+/).length <= 5).slice(0, 4);
}

/**
 * Makes sure everything the learner singled out is in the outline: a phrase no topic's name or key points mention becomes a topic of its own,
 * placed last (it is what they most need), with plain key points. The model is asked to cover these; this is the guarantee.
 */
export function coverFocus(syllabus: Syllabus, text: string | null | undefined): Syllabus {
  const focus = namedFocus(text);
  if (!focus.length) return syllabus;
  const haystack = syllabus.units.map((u) => `${u.title} ${u.points.join(" ")}`.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f']/g, "")).join(" | ");
  const missing = focus.filter((phrase) => {
    const words = phrase.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f']/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    return words.length > 0 && !words.every((w) => haystack.includes(w.replace(/s$/, "")));
  });
  if (!missing.length) return syllabus;
  let n = syllabus.units.reduce((max, u) => Math.max(max, Number(u.key.replace(/\D/g, "")) || 0), 0);
  const added: SyllabusUnit[] = missing.map((phrase) => {
    const title = shortTitle(phrase.charAt(0).toUpperCase() + phrase.slice(1), TOPIC_TITLE);
    return { key: `u${++n}`, title, points: [`Explain ${phrase} in your own words`, `Use ${phrase} in standard questions`, `Spot when a question needs ${phrase}`, `Avoid the common mistakes with ${phrase}`], weight: 2, difficulty: 2, confidence: "weak", included: true, topic: null };
  });
  return { ...syllabus, units: [...syllabus.units, ...added].slice(0, 40) };
}

export function markWeak(syllabus: Syllabus, text: string | null | undefined): Syllabus {
  if (!text?.trim()) return syllabus;
  const names = text.toLowerCase().split(/\s*(?:,|;|\n|&|\band\b|\/)\s*/).map((n) => n.trim()).filter((n) => n.length >= 3);
  const weak = new Set(names.flatMap((name) => namedUnits(name, syllabus.units).map((u) => u.key)));
  return weak.size ? { ...syllabus, units: syllabus.units.map((u) => (weak.has(u.key) ? { ...u, confidence: "weak" as const } : u)) } : syllabus;
}


const BOARDS: [RegExp, string][] = [
  [/\b(caie|cie|cambridge(?: assessment)?(?: international)?)\b/, "caie"], [/\b(pearson\s+)?edexcel\b|\bpearson\b/, "edexcel"], [/\baqa\b/, "aqa"], [/\bocr\b/, "ocr"],
  [/\bwjec\b|\beduqas\b/, "wjec"], [/\b(ib|ibo|international baccalaureate)\b/, "ib"], [/\b(college board|ap\b)/, "collegeboard"], [/\b(knec|kcse)\b/, "knec"],
  [/\bwaec\b/, "waec"], [/\bcbse\b/, "cbse"], [/\b(cisce|icse|isc)\b/, "cisce"], [/\bfbise\b/, "fbise"], [/\bsqa\b/, "sqa"],
];
const slug = (text: string | null | undefined) => (text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9/.]+/g, " ").trim().replace(/\s+/g, " ");

/**
 * The shared library key for a named syllabus: board, then the syllabus code when there is one (else qualification and subject), then the paper.
 * Synonyms collapse ("Cambridge International" and "CAIE" are one board; "Paper 2" and "P2" are one paper), so two students asking for the same
 * syllabus in different words share one entry. Returns null when the identity is too vague to share: no board and no code.
 */
export function outlineKey(identity: SyllabusIdentity | null | undefined): string | null {
  if (!identity) return null;
  const raw = slug(identity.board);
  const board = BOARDS.find(([re]) => re.test(raw))?.[1] ?? raw.replace(/\s+/g, "-");
  const code = slug(identity.code).replace(/\s+/g, "");
  const subject = slug(identity.subject).replace(/\b(and|the|of)\b/g, "").replace(/\s+/g, " ").trim();
  let qualification = slug(identity.qualification).replace(/\b(as and a|as a|a and as)\b/g, "a").replace(/\blevels?\b/g, "level").replace(/\s+/g, " ").trim();
  // Cambridge's AS and A Level share one syllabus per subject; other boards' AS and A Level are separate qualifications and stay apart.
  if (board === "caie" && /^(as|a2|a)\s*level$/.test(qualification)) qualification = "a level";
  const paper = /\b(?:paper|component|p|unit)\s*([0-9]+[a-z]?|[ivx]+)\b/.exec(slug(identity.component))?.[1] ?? slug(identity.component).replace(/\s+/g, "-");
  if (!board && !code) return null;
  if (!code && !subject) return null;
  const parts = [board || "any", code || `${qualification || "any"}|${subject}`, paper ? `p${paper.replace(/^p/, "")}` : "all"];
  return parts.join("|").slice(0, 240);
}

/**
 * Every key a syllabus can be found under: by code when it has one, and by board, qualification, subject and paper, so a request that names the
 * code and one that does not still meet. The first is the one it is saved under.
 */
export function outlineKeys(identity: SyllabusIdentity | null | undefined): string[] {
  const primary = outlineKey(identity);
  if (!primary || !identity) return [];
  const described = identity.code && identity.subject ? outlineKey({ ...identity, code: null }) : null;
  return [...new Set([primary, described].filter((k): k is string => Boolean(k)))];
}

/** A checker's corrections to an outline: topics to add (after a named topic or at the end), to remove, to rename, and corrected papers. */
export interface OutlineCorrections {
  add: { title: string; points: string[]; after: string | null }[];
  remove: string[];
  rename: { from: string; to: string }[];
  papers: { label: string; minutes: number; marks: number | null }[] | null;
  edition: string | null;
}

/**
 * Bounds a double-check before it is applied. A checker that reads the same sources as the mapper and still wants to add more than about a third
 * of the outline is disagreeing about granularity (subtopics as topics), not finding missing content, so its additions are set aside; likewise a
 * removal of most of the outline. A paper list is taken when the outline had none, or when it corrects the same papers rather than splitting them.
 */
export function boundCorrections(syllabus: Syllabus, corrections: OutlineCorrections): OutlineCorrections {
  const n = syllabus.units.filter((u) => u.included).length;
  // A "missing topic" with fewer than three key points, or one an existing topic already covers (its name in that topic's key points, or most
  // of its words in that topic's name and points), is a subtopic, not a topic. Exam technique and question formats are not content at all.
  const named = syllabus.units.map((u) => `${u.title} ${u.points.join(" ")}`.toLowerCase());
  const words = (t: string) => t.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length >= 4 && !/^(with|from|into|their|and|the|for|of|using|about)$/.test(w));
  const covered = (title: string) => { const own = words(title); return own.length >= 2 && named.some((text) => own.filter((w) => text.includes(w)).length >= Math.ceil(own.length * 0.6)); };
  const technique = /\b(?:technique|strateg(?:y|ies)|formats?|tips|test[- ]taking|question types?)\s*$/i;
  const whole = corrections.add.filter((a) => (a.points ?? []).filter((p) => p.trim()).length >= 3 && !technique.test(a.title.trim()) && !named.some((text) => text.includes(a.title.trim().toLowerCase())) && !covered(a.title));
  return {
    ...corrections,
    // Whole missing topics are kept up to a bound, in the checker's order; removing a topic is riskier than adding one, so a long list of
    // removals is a disagreement about scope and is set aside.
    add: whole.slice(0, Math.max(3, Math.ceil(n * 0.3))),
    remove: corrections.remove.length > Math.max(2, Math.ceil(n * 0.2)) ? [] : corrections.remove,
    papers: !corrections.papers?.length ? null : !syllabus.papers.length || corrections.papers.length === syllabus.papers.length ? corrections.papers : null,
  };
}

/** Applies corrections to a syllabus, keeping the student's ratings and ticks on every topic that stays, and renumbering keys only for new ones. */
/**
 * The official units an outline does not cover: no topic's name or key points carry most of the unit's words (its words of four letters or
 * more, plurals folded). The double-check lists the official units; this comparison decides whether a second, focused look is needed.
 */
/** Coursework is planned as an assignment, never as a syllabus topic to revise: an internal assessment, NEA or extended essay. */
const COURSEWORK = /\b(?:internal assessment|coursework|non[- ]exam assessment|extended essay|individual oral)\b/i;
export function dropCoursework(syllabus: Syllabus): Syllabus {
  const units = syllabus.units.filter((u) => !COURSEWORK.test(u.title));
  return units.length && units.length !== syllabus.units.length ? { ...syllabus, units } : syllabus;
}

export function uncoveredUnits(syllabus: Syllabus, official: string[]): string[] {
  const fold = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f']/g, "");
  const included = syllabus.units.filter((u) => u.included);
  const texts = included.map((u) => fold(`${u.title} ${u.points.join(" ")}`));
  const titles = included.map((u) => fold(u.title));
  const stop = /^(with|from|into|their|and|the|for|of|using|about|other|including|introduction|basic|further|principles|topic|unit)$/;
  return official.filter((name) => {
    const folded = fold(name);
    // An outline topic named inside the official unit ("Communicable diseases" in "Infection and response: communicable diseases") covers it.
    if (titles.some((t) => t.length >= 5 && (folded.includes(t) || t.includes(folded)))) return false;
    const words = folded.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stop.test(w)).map((w) => w.replace(/(?:ies|es|s)$/, ""));
    if (!words.length) return false;
    // Short names need every word ("Respiration and metabolism" is not covered by a metabolism topic); longer ones most of them.
    const need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6);
    return !texts.some((text) => words.filter((w) => text.includes(w)).length >= need);
  }).slice(0, 8);
}

export function applyCorrections(syllabus: Syllabus, corrections: OutlineCorrections): Syllabus {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const removed = new Set(corrections.remove.map((t) => t.trim().toLowerCase()));
  let units = syllabus.units.filter((u) => !removed.has(u.title.toLowerCase()));
  // A rename onto a name another topic already has would make two topics of one: that rename is skipped.
  units = units.map((u) => {
    const r = corrections.rename.find((x) => same(x.from, u.title));
    if (!r) return u;
    const title = shortTitle(cleanTitle(r.to), TOPIC_TITLE);
    return units.some((other) => other !== u && same(other.title, title)) ? u : { ...u, title };
  });
  let n = syllabus.units.reduce((max, u) => Math.max(max, Number(u.key.replace(/\D/g, "")) || 0), 0);
  // An addition that restates a topic already there ("Period 7" beside "Period 7: 1890–1945", "Excretion in plants" beside "Excretion") is a
  // subtopic or a duplicate, not a missing topic.
  const head = (t: string) => t.toLowerCase().split(/\s*[:(–—]\s*/)[0].trim();
  const restates = (title: string) => units.some((u) => same(u.title, title) || head(u.title) === head(title) || title.toLowerCase().startsWith(u.title.toLowerCase()) || u.title.toLowerCase().startsWith(title.toLowerCase()));
  for (const add of corrections.add) {
    const title = shortTitle(cleanTitle(add.title), TOPIC_TITLE);
    if (!title || restates(title)) continue;
    const unit: SyllabusUnit = { key: `u${++n}`, title, points: add.points.map((p) => shortPoint(cleanTitle(p))).filter(Boolean).slice(0, 8), weight: 2, difficulty: 2, confidence: null, included: true, topic: null };
    const at = add.after ? units.findIndex((u) => same(u.title, add.after!)) : -1;
    units = at >= 0 ? [...units.slice(0, at + 1), unit, ...units.slice(at + 1)] : [...units, unit];
  }
  const papers = corrections.papers?.length ? normalizeSyllabus({ source: syllabus.source, name: syllabus.name, units: [], papers: corrections.papers }).papers : syllabus.papers;
  return { ...syllabus, units: units.slice(0, 40), papers, identity: syllabus.identity ? { ...syllabus.identity, edition: corrections.edition ?? syllabus.identity.edition } : syllabus.identity };
}

/** A syllabus code named in free text, when the model left it out: "9701", "231/1", "9EC0". Years are never codes. */
export function codeIn(text: string | null | undefined): string | null {
  for (const match of (text ?? "").matchAll(/\b(\d{3,4}\/\d|\d[A-Z]{2}\d|\d{4})\b/g)) {
    const code = match[1];
    if (/^(19|20)\d{2}$/.test(code)) continue;
    return code;
  }
  return null;
}
