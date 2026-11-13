// The strategy library: how each kind of goal is best studied, as versioned data. The prompts teach the model these structures, the solver enforces
// their timing rules, and when the model is unavailable the same structures become a deterministic scaffold so planning keeps working. Grounded in
// Dunlosky et al. (2013): retrieval and distributed practice first, interleaving where it fits, rereading and highlighting never as the plan.
import { addDays, diffDays } from "./dates";
import { STRATEGY_VERSION, type GoalType, type KGoal, type Method, type SnapshotTopic } from "./contracts";
import type { Op } from "./operations";

export interface StrategyEntry {
  type: GoalType;
  label: string;
  structure: string[];
  /** Timing rules the solver enforces, stated for the model. */
  rules: string[];
}

export const STRATEGY_LIBRARY: Record<GoalType, StrategyEntry> = {
  exam: {
    type: "exam", label: "Exam",
    structure: [
      "Start with a short diagnostic on likely weak areas.",
      "Map topics from the syllabus nodes and their mastery; weak, prerequisite topics first.",
      "Each learning session ends with a checkable mastery criterion (e.g. 'solve 3 of 4 without notes').",
      "Every topic gets at least two retrieval sessions on widening gaps.",
      "At least one timed past paper, followed by an error-log session.",
      "Light review the day before. No new topics in the final 24 hours.",
    ],
    rules: ["retrieval on the same topic at least 2 days apart", "no learn items on the exam day or the day before", "light review on the day before"],
  },
  essay: {
    type: "essay", label: "Essay or report",
    structure: ["Research", "Outline with a thesis", "Draft in chunks of 45–90 minutes", "Revise", "Final check"],
    rules: ["drafting complete with at least 20% of the window left"],
  },
  project: {
    type: "project", label: "Project",
    structure: ["Scope and plan", "Build or make in chunks", "Review with fresh eyes", "Finish and submit"],
    rules: ["core work complete with at least 20% of the window left"],
  },
  problem_set: {
    type: "problem_set", label: "Problem set",
    structure: ["An early first attempt to find what is hard", "A second pass after a gap"],
    rules: ["first attempt starts at least 2 days before the due date"],
  },
  reading: {
    type: "reading", label: "Reading",
    structure: ["Split by chapter or section", "A one-paragraph retrieval summary after each part"],
    rules: ["lower-energy hours are acceptable"],
  },
  skill: {
    type: "skill", label: "Long-term skill",
    structure: ["A weekly practice cadence with a protected minimum", "A milestone check every two weeks"],
    rules: ["recurring practice keeps its minimum"],
  },
  general: {
    type: "general", label: "General goal",
    structure: ["Break the outcome into 3–8 concrete sessions", "Order them so each builds on the last"],
    rules: [],
  },
};

/** Methods that should be spaced from an earlier session on the same topic. */
export const SPACED_METHODS: readonly Method[] = ["retrieval", "spaced_review"];
export const SPACING_DAYS = 2;

const EXAM_WORDS = /\b(exam|exams|midterm|mid-term|final|finals|test|quiz|mock|paper\s*\d|gcse|a-?level|sat|act|ap\b|ib\b|boards?)\b/i;
const ESSAY_WORDS = /\b(essay|report|dissertation|thesis|paper|coursework|write[- ]?up|article)\b/i;
const PROJECT_WORDS = /\b(project|presentation|portfolio|lab report|prototype|app|website)\b/i;
const PSET_WORDS = /\b(problem set|pset|homework|worksheet|assignment|exercises?)\b/i;
const READING_WORDS = /\b(read|reading|chapters?|book|novel)\b/i;
const SKILL_WORDS = /\b(learn|practi[cs]e|get better|improve|fluency|fluent|language|guitar|piano|coding|programming|daily|habit)\b/i;

export function inferGoalType(text: string): GoalType {
  if (EXAM_WORDS.test(text)) return "exam";
  if (PSET_WORDS.test(text)) return "problem_set";
  if (ESSAY_WORDS.test(text)) return "essay";
  if (PROJECT_WORDS.test(text)) return "project";
  if (READING_WORDS.test(text)) return "reading";
  if (SKILL_WORDS.test(text)) return "skill";
  return "general";
}

/** The library as the model reads it in the stable prompt tier. Byte-stable between releases. */
export function strategyPrompt(): string {
  const lines = [`Strategy library ${STRATEGY_VERSION}:`];
  for (const entry of Object.values(STRATEGY_LIBRARY)) {
    lines.push(`- ${entry.type} (${entry.label}): ${entry.structure.join(" ")}${entry.rules.length ? ` Rules: ${entry.rules.join("; ")}.` : ""}`);
  }
  return lines.join("\n");
}

export interface ScaffoldContext {
  today: string;
  /** Short reference of the goal in the snapshot, e.g. `G2`. */
  goalRef: string;
  subjectRef: string | null;
  subjectName: string | null;
  /** Topics for the goal's subject with their short refs, weakest first is decided here. */
  topics: (SnapshotTopic & { shortRef: string })[];
}

const nearest = (today: string, wanted: string, due: string | null) => {
  if (wanted < today) return today;
  if (due && wanted > due) return due;
  return wanted;
};

/**
 * A deterministic plan skeleton for a goal, as operations. It is the plan when the model is unavailable and is labelled as a draft built from a
 * template. Items carry short ids `t1`, `t2`… local to this scaffold.
 */
export function scaffold(goal: Pick<KGoal, "title" | "type" | "due" | "priority">, ctx: ScaffoldContext): Op[] {
  const ops: Op[] = [];
  const due = goal.due;
  const window = due ? Math.max(1, diffDays(due, ctx.today)) : 21;
  const base = { goal: ctx.goalRef, subject: ctx.subjectRef };
  let n = 0;
  const id = () => `t${++n}`;
  const name = ctx.subjectName ?? goal.title;
  const add = (item: Omit<Extract<Op, { op: "add_item" }>, "op" | "id"> & { id?: string }) => {
    const itemId = item.id ?? id();
    ops.push({ op: "add_item", ...base, ...item, id: itemId });
    return itemId;
  };

  switch (goal.type) {
    case "exam": {
      const topics = [...ctx.topics].filter((t) => !t.mastered).sort((a, b) => a.progress - b.progress || b.difficulty - a.difficulty || a.id - b.id);
      const chosen = (topics.length ? topics : [...ctx.topics].sort((a, b) => a.progress - b.progress)).slice(0, 5);
      const lastLearn = due ? addDays(due, -2) : null;
      const diagnostic = add({ title: `Diagnostic: weak spots in ${name}`.slice(0, 60), kind: "review", est: [30, 40], chunk: [20, 30, 40], earliest: null, due: lastLearn && lastLearn >= ctx.today ? lastLearn : null, load: 2, method: "diagnostic", note: "Find what to fix before learning anything new.", first_step: "Do five mixed questions without notes and mark what you could not do." });
      const firsts: string[] = [];
      if (chosen.length) {
        for (const topic of chosen) {
          const learn = topic.progress < 60 && window >= 4
            ? add({ title: `Learn: ${topic.title}`.slice(0, 60), kind: "learn", topics: [topic.shortRef], est: [50, 70], chunk: [30, 50, 75], due: lastLearn && lastLearn >= ctx.today ? lastLearn : null, after: [diagnostic], load: 3, method: "worked_examples", note: "Ends when you can solve two problems without notes." })
            : null;
          const first = add({ title: `Retrieval: ${topic.title}`.slice(0, 60), kind: "practice", topics: [topic.shortRef], est: [30, 40], chunk: [20, 30, 45], due: due ? nearest(ctx.today, addDays(due, -2), due) : null, after: learn ? [learn] : [diagnostic], load: 3, method: "retrieval" });
          firsts.push(first);
          if (window >= 4) add({ title: `Retrieval 2: ${topic.title}`.slice(0, 60), kind: "practice", topics: [topic.shortRef], est: [25, 35], chunk: [20, 25, 40], due: due ? nearest(ctx.today, addDays(due, -1), due) : null, after: [first], load: 2, method: "retrieval" });
        }
      } else {
        for (let part = 1; part <= Math.min(3, Math.max(1, Math.floor(window / 3))); part++) {
          const learn = add({ title: `Study block ${part}: ${name}`.slice(0, 60), kind: "learn", est: [50, 70], chunk: [30, 50, 75], due: lastLearn && lastLearn >= ctx.today ? lastLearn : null, after: [diagnostic], load: 3, method: "learn" });
          firsts.push(add({ title: `Retrieval ${part}: ${name}`.slice(0, 60), kind: "practice", est: [30, 40], chunk: [20, 30, 45], due: due ? nearest(ctx.today, addDays(due, -2), due) : null, after: [learn], load: 3, method: "retrieval" }));
        }
      }
      if (window >= 3) {
        const paper = add({ title: `Timed past paper: ${name}`.slice(0, 60), kind: "practice", est: [90, 110], chunk: [60, 90, 120], due: due ? nearest(ctx.today, addDays(due, -2), due) : null, after: firsts, load: 3, method: "timed_paper", first_step: "Set a timer for the real exam length and put your notes away." });
        add({ title: "Error log from the past paper", kind: "review", est: [30, 40], chunk: [20, 30, 45], due: due ? nearest(ctx.today, addDays(due, -1), due) : null, after: [paper], load: 2, method: "error_log" });
      }
      if (due && addDays(due, -1) >= ctx.today) add({ title: `Light review before the exam`, kind: "review", est: [30, 30], chunk: [20, 30, 40], earliest: addDays(due, -1), due: addDays(due, -1), load: 1, method: "spaced_review", note: "Light review only. No new topics." });
      break;
    }
    case "essay":
    case "project": {
      const draftDue = due ? addDays(ctx.today, Math.max(0, Math.floor(window * 0.8) - 1)) : null;
      const research = add({ title: goal.type === "essay" ? "Research and gather sources" : "Scope and plan the project", kind: "learn", est: [60, 90], chunk: [30, 60, 90], due: draftDue, load: 2, method: goal.type === "essay" ? "research" : "outline" });
      const outline = add({ title: goal.type === "essay" ? "Outline with a thesis" : "Break the build into parts", kind: "produce", est: [45, 60], chunk: [30, 45, 60], due: draftDue, after: [research], load: 3, method: "outline" });
      const parts = window >= 7 ? 3 : 2;
      let previous = outline;
      for (let part = 1; part <= parts; part++) previous = add({ title: `${goal.type === "essay" ? "Draft" : "Build"} part ${part} of ${parts}`, kind: "produce", est: [60, 80], chunk: [45, 60, 90], due: draftDue, after: [previous], load: 3, method: "drafting" });
      const revise = add({ title: goal.type === "essay" ? "Revise the draft" : "Review with fresh eyes", kind: "produce", est: [60, 75], chunk: [30, 60, 90], due, after: [previous], load: 2, method: "revising" });
      add({ title: "Final check and submit", kind: "admin", est: [30, 30], chunk: [20, 30, 40], due, after: [revise], load: 1, method: "final_check" });
      break;
    }
    case "problem_set": {
      const startBy = due ? nearest(ctx.today, addDays(due, -2), due) : null;
      const first = add({ title: `First attempt: ${goal.title}`.slice(0, 60), kind: "practice", est: [60, 80], chunk: [30, 60, 90], due: startBy, load: 3, method: "problem_solving", first_step: "Attempt every question once and star the ones you could not finish." });
      add({ title: `Second pass: ${goal.title}`.slice(0, 60), kind: "practice", est: [45, 60], chunk: [30, 45, 60], due, after: [first], load: 2, method: "problem_solving" });
      break;
    }
    case "reading": {
      const parts = Math.max(2, Math.min(5, Math.ceil(window / 4)));
      let previous: string | null = null;
      for (let part = 1; part <= parts; part++) previous = add({ title: `Read part ${part} of ${parts}: ${goal.title}`.slice(0, 60), kind: "learn", est: [45, 60], chunk: [25, 45, 60], due, after: previous ? [previous] : [], load: 1, method: "reading", note: "End with a one-paragraph summary from memory." });
      break;
    }
    case "skill": {
      ops.push({ op: "add_practice", id: "p1", goal: ctx.goalRef, title: `Practice: ${goal.title}`.slice(0, 60), subject: ctx.subjectRef, minutes: 25, days: [1, 3, 5], from: null, until: due, method: "practice" });
      add({ title: `Milestone check: ${goal.title}`.slice(0, 60), kind: "review", est: [30, 30], chunk: [20, 30, 40], earliest: addDays(ctx.today, 12), due: due ?? addDays(ctx.today, 16), load: 2, method: "retrieval" });
      break;
    }
    default: {
      const parts = Math.max(3, Math.min(6, Math.ceil(window / 4)));
      let previous: string | null = null;
      for (let part = 1; part <= parts; part++) previous = add({ title: `${goal.title}: session ${part} of ${parts}`.slice(0, 60), kind: part === parts ? "review" : "learn", est: [45, 60], chunk: [25, 45, 60], due, after: previous ? [previous] : [], load: 2, method: part === parts ? "retrieval" : "learn" });
    }
  }
  return ops;
}
