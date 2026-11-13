// The command fast path. Common phrasings ("move chemistry to evenings this week", "I'm sick today", "max 2 hours a day") become operations with no
// model call, and the interpretation chip ("Move · Chemistry · evenings this week") shows what will run before anything does. Anything this parser is
// not sure about returns null and goes to the model's intent parser instead. Runs on the device as the student types.
import { addDays, dayLabel, isDateKey, weekdayOf, weekStart } from "./dates";
import { inferGoalType } from "./strategy";
import type { GoalType, KGoal, PlanningSnapshot, SnapshotSubject, WorkModel } from "./contracts";
import type { Op } from "./operations";

export interface ParsedCommand {
  ops: Op[];
  /** Short chip text: "Move · Chemistry · evenings this week". */
  interpretation: string;
  /** Goal ids among `ops` that need breaking down into work. */
  decompose: string[];
  /** The model may still improve the interpretation; the fast path is confident enough to run. */
  confident: boolean;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const PARTS: Record<string, [number, number, string]> = { morning: [8 * 60, 12 * 60, "mornings"], afternoon: [12 * 60, 17 * 60, "afternoons"], evening: [17 * 60, 22 * 60, "evenings"], night: [19 * 60, 23 * 60, "nights"] };
const ALIASES: Record<string, string[]> = {
  chemistry: ["chem", "chemistry", "orgo", "organic"], biology: ["bio", "biology"], physics: ["phys", "physics"], mathematics: ["math", "maths", "mathematics", "calc", "calculus", "algebra", "stats", "statistics"],
  "computer science": ["cs", "comp sci", "computing", "programming"], economics: ["econ", "economics"], literature: ["lit", "literature", "english"], history: ["hist", "history"],
  geography: ["geo", "geography"], psychology: ["psych", "psychology"], spanish: ["spanish", "espanol"], french: ["french"], german: ["german"],
};

const norm = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9:'/\-. ]+/g, " ").replace(/\s+/g, " ").trim();

/** Minutes after midnight for "7pm", "19:30", "7:30 pm", "noon". */
export function parseClock(text: string): number | null {
  const t = norm(text);
  if (/^noon|midday$/.test(t)) return 12 * 60;
  if (/^midnight$/.test(t)) return 24 * 60;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]); const minute = Number(m[2] ?? 0);
  if (minute > 59 || hour > 24) return null;
  if (m[3] === "pm" && hour < 12) hour += 12;
  if (m[3] === "am" && hour === 12) hour = 0;
  if (!m[3] && hour >= 1 && hour <= 6) hour += 12; // "after 9" means evening; "before 7" usually means 7pm when said of study.
  return Math.min(1440, hour * 60 + minute);
}

/** A date named in plain words, relative to today. Returns null when unsure. */
export function parseDate(text: string, today: string): string | null {
  const t = norm(text);
  if (/\btoday\b|\btonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && isDateKey(iso[1])) return iso[1];
  const inWeeks = t.match(/\bin (\d+|a|one|two|three|four) (day|days|week|weeks)\b/);
  if (inWeeks) {
    const n = { a: 1, one: 1, two: 2, three: 3, four: 4 }[inWeeks[1] as "a"] ?? Number(inWeeks[1]);
    return addDays(today, inWeeks[2].startsWith("week") ? n * 7 : n);
  }
  const year = Number(today.slice(0, 4));
  const build = (day: number, month: number) => {
    const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isDateKey(candidate)) return null;
    if (candidate >= today) return candidate;
    const next = `${year + 1}${candidate.slice(4)}`;
    return isDateKey(next) ? next : null;
  };
  const dayMonth = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/);
  if (dayMonth && MONTHS.includes(dayMonth[2])) return build(Number(dayMonth[1]), MONTHS.indexOf(dayMonth[2]));
  const monthDay = t.match(/\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDay && MONTHS.includes(monthDay[1])) return build(Number(monthDay[2]), MONTHS.indexOf(monthDay[1]));
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) return build(Number(slash[1]), Number(slash[2]) - 1);
  const named = t.match(/\b(next|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
  if (named) {
    const key = named[2].slice(0, 3);
    const target = SHORT_DAYS.indexOf(key);
    let delta = (target - weekdayOf(today) + 7) % 7;
    if (named[1] === "next" && delta < 7) delta += delta === 0 ? 7 : 0;
    if (named[1] === "next" && weekStart(addDays(today, delta)) === weekStart(today)) delta += 7;
    return addDays(today, delta);
  }
  const ordinal = t.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinal) {
    const day = Number(ordinal[1]); const month = Number(today.slice(5, 7)) - 1;
    const candidate = build(day, month);
    if (candidate && candidate >= today) return candidate;
    return build(day, (month + 1) % 12);
  }
  return null;
}

/** Days named in a phrase, for "this weekend", "on Friday", "today and tomorrow". */
function parseDays(text: string, today: string): string[] {
  const t = norm(text);
  if (/\bthis weekend\b|\bthe weekend\b/.test(t)) {
    const sat = addDays(today, (6 - weekdayOf(today) + 7) % 7);
    return [sat, addDays(sat, 1)].filter((d) => d >= today);
  }
  const out = new Set<string>();
  for (const piece of t.split(/\band\b|,|&/)) { const d = parseDate(piece, today); if (d) out.add(d); }
  return [...out].sort();
}

export function matchSubject(text: string, subjects: readonly SnapshotSubject[]): SnapshotSubject | null {
  const t = ` ${norm(text)} `;
  let best: { subject: SnapshotSubject; score: number } | null = null;
  for (const subject of subjects) {
    const name = norm(subject.name);
    let score = 0;
    if (name.length >= 3 && t.includes(` ${name} `)) score = 100 + name.length;
    else if (subject.code && subject.code.length >= 2 && subject.code !== "GENERAL" && t.includes(` ${norm(subject.code)} `)) score = 90;
    else {
      for (const word of name.split(" ").filter((w) => w.length >= 4 && !["level", "higher", "standard", "advanced", "introduction", "intro"].includes(w))) if (t.includes(` ${word} `)) score = Math.max(score, 60 + word.length);
      for (const [canonical, aliases] of Object.entries(ALIASES)) if (name.includes(canonical) || aliases.some((a) => name.includes(a))) for (const alias of aliases) if (t.includes(` ${alias} `)) score = Math.max(score, 50 + alias.length);
    }
    if (score && (!best || score > best.score)) best = { subject, score };
  }
  return best?.subject ?? null;
}

export function matchGoal(text: string, goals: readonly KGoal[]): KGoal | null {
  const t = norm(text);
  let best: { goal: KGoal; score: number } | null = null;
  for (const goal of goals) {
    if (goal.status !== "active") continue;
    const words = norm(goal.title).split(" ").filter((w) => w.length >= 4);
    const score = words.filter((w) => t.includes(w)).length;
    if (score && (!best || score > best.score)) best = { goal, score };
  }
  return best?.goal ?? null;
}

const minutesOf = (amount: number, unit: string) => Math.round(/^h/.test(unit) ? amount * 60 : amount);

/** Parses a command. `refs` maps snapshot entities to the short ids the operations use. */
export function parseCommand(input: string, snapshot: Pick<PlanningSnapshot, "today" | "subjects">, model: WorkModel, refs: { subjectRef: (id: number) => string; goalRef: (key: string) => string }): ParsedCommand | null {
  const text = norm(input);
  if (text.length < 3) return null;
  const today = snapshot.today;
  const subject = matchSubject(text, snapshot.subjects);
  const goal = matchGoal(text, model.goals);
  const id = (prefix: string) => `${prefix}${Math.abs(hashText(text)) % 100000}`;

  // Sick, away or a day off.
  const sick = /\b(i'?m|i am|feeling|been)\s+(sick|ill|unwell|not well)\b/.test(text);
  const off = text.match(/\b(?:take|taking|have|keep|need|want)\s+(.+?)\s+off\b|\bno (?:study|studying|work|revision)\s+(?:on\s+)?(.+)$|\b(?:i'?m |i am )?(?:away|out|travell?ing|busy all day)\s+(?:on\s+|from\s+)?(.+)$|\bskip\s+(today|tomorrow|.+day)\b|\bfree up\s+(.+)$|\bday off\s+(?:on\s+)?(.+)$/);
  if (sick || off) {
    const phrase = off ? off.slice(1).find(Boolean) ?? "" : text;
    let dates = parseDays(phrase, today);
    if (!dates.length && sick) dates = /\btomorrow\b/.test(text) ? [addDays(today, 1)] : [today];
    if (dates.length && !/\b(after|before|between)\b/.test(phrase)) {
      return { ops: [{ op: "set_constraint", id: id("off"), kind: "day_off", dates, hard: true, label: `${sick ? "Unwell" : "Day off"}: ${dates.map(dayLabel).join(", ")}` }], interpretation: `${sick ? "Rest" : "Day off"} · ${dates.map(dayLabel).join(", ")}`, decompose: [], confident: true };
    }
  }

  // Daily limits.
  const cap = text.match(/\b(?:max|maximum|at most|no more than|limit(?: me| it)?(?: to)?|cap(?: it)?(?: at)?|only)\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b(.*)$/);
  if (cap) {
    const minutes = minutesOf(Number(cap[1]), cap[2]);
    const tail = cap[3] ?? "";
    const weekdays = /\bweekdays?\b|\bschool days?\b/.test(tail); const weekends = /\bweekends?\b/.test(tail);
    if (minutes >= 15 && minutes <= 720 && (/(a|per) day|daily|each day|weekday|weekend|$/.test(tail))) {
      const days = weekdays ? [1, 2, 3, 4, 5] : weekends ? [0, 6] : undefined;
      return { ops: [{ op: "set_constraint", id: id("cap"), kind: "daily_cap", minutes, ...(days ? { days } : {}), hard: true, label: `At most ${formatShort(minutes)} a day${weekdays ? " on weekdays" : weekends ? " at weekends" : ""}` }], interpretation: `Limit · ${formatShort(minutes)} a day${weekdays ? " · weekdays" : weekends ? " · weekends" : ""}`, decompose: [], confident: true };
    }
  }

  // No study after or before a time.
  const after = text.match(/\b(?:no|don'?t|do not|never)\s+(?:study|studying|work|revise|revision)\s+(after|past|before)\s+([0-9:apm\s]+?|noon|midnight)\b(.*)$/);
  if (after) {
    const minute = parseClock(after[2]);
    if (minute != null) {
      const weekdays = /\bweekdays?\b/.test(after[3] ?? "");
      const [start, end] = after[1] === "before" ? [0, minute] : [minute, 1440];
      const clock = `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      return { ops: [{ op: "set_constraint", id: id("win"), kind: "no_study_window", start, end, ...(weekdays ? { days: [1, 2, 3, 4, 5] } : {}), hard: true, label: `No study ${after[1] === "before" ? "before" : "after"} ${clock}${weekdays ? " on weekdays" : ""}` }], interpretation: `Free time · nothing ${after[1] === "before" ? "before" : "after"} ${clock}`, decompose: [], confident: true };
    }
  }
  const between = text.match(/\b(?:only )?study (?:between|from) ([0-9:apm\s]+?) (?:and|to|-|until) ([0-9:apm\s]+?)\b(.*)$/);
  if (between) {
    const start = parseClock(between[1]); const end = parseClock(between[2]);
    if (start != null && end != null && end > start) return { ops: [{ op: "set_constraint", id: id("sw"), kind: "study_window", start, end, hard: true, label: `Study between ${between[1].trim()} and ${between[2].trim()}` }], interpretation: `Study hours · ${between[1].trim()}–${between[2].trim()}`, decompose: [], confident: true };
  }

  // Move a subject to a part of the day.
  const move = text.match(/\b(?:move|put|shift|do|schedule|keep)\s+(.+?)\s+(?:to|in|into|for|during)\s+(?:the\s+)?(morning|afternoon|evening|night)s?\b(.*)$/);
  if (move && (subject || goal)) {
    const [start, end, label] = PARTS[move[2]];
    const thisWeek = /\bthis week\b/.test(move[3] ?? "") || /\bthis week\b/.test(text);
    const until = thisWeek ? addDays(weekStart(today), 6) : null;
    const target = subject ?? (goal?.subject != null ? snapshot.subjects.find((s) => s.id === goal.subject) ?? null : null);
    const name = target?.name ?? goal?.title ?? "Study";
    return {
      ops: [{ op: "set_constraint", id: id("pref"), kind: "preferred_window", start, end, subject: target ? refs.subjectRef(target.id) : null, ...(until ? { until } : {}), hard: false, weight: 4, label: `${name} in the ${label}${thisWeek ? " this week" : ""}` }],
      interpretation: `Move · ${name} · ${label}${thisWeek ? " this week" : ""}`, decompose: [], confident: true,
    };
  }

  // Weight: something matters more or less now.
  const more = text.match(/\b(?:more time (?:on|for)|prioriti[sz]e|focus (?:more )?on|(.+?) (?:matters|is) (?:more|most)(?: important)?)\b/);
  const less = text.match(/\b(?:less time (?:on|for)|(.+?) (?:matters|is) less(?: important)?|deprioriti[sz]e)\b/);
  if ((more || less) && (subject || goal)) {
    const weight = less ? 1 : 3;
    if (subject) return { ops: [{ op: "set_constraint", id: id("wt"), kind: "subject_weight", subject: refs.subjectRef(subject.id), weight, hard: false, label: `${subject.name} matters ${less ? "less" : "more"} now` }], interpretation: `Priority · ${subject.name} ${less ? "down" : "up"}`, decompose: [], confident: true };
    return { ops: [{ op: "update_goal", id: refs.goalRef(goal!.key), priority: weight }], interpretation: `Priority · ${goal!.title} ${less ? "down" : "up"}`, decompose: [], confident: true };
  }

  // Start earlier.
  if (/\bstart (?:.+ )?earlier\b|\bget ahead\b/.test(text) && goal) {
    return { ops: [{ op: "update_goal", id: refs.goalRef(goal.key), priority: 3 }], interpretation: `Start earlier · ${goal.title}`, decompose: [], confident: true };
  }

  // Drop a goal.
  const drop = text.match(/^(?:drop|cancel|remove|forget|stop)\s+(?:the\s+|my\s+)?(.+?)(?:\s+goal)?$/);
  if (drop && goal) return { ops: [{ op: "drop_goal", id: refs.goalRef(goal.key) }], interpretation: `Drop · ${goal.title}`, decompose: [], confident: true };

  // A new deadline: "chem midterm on 28 Nov", "essay due Friday", "prepare for the physics exam next friday".
  const lead = /^(?:(?:and|also|oh|so|then|plus)\s+)*(?:i(?:'ve| have| also have|'ve also got| also need to| need to)?\s+(?:got\s+)?(?:a|an|my|another|the)?\s*|there'?s (?:also )?(?:a|an)\s+|add\s+(?:a|an|my)?\s*|prepare for (?:the |my )?|study for (?:the |my )?|finish (?:the |my )?|write (?:the |my )?|plan (?:for )?(?:the |my )?)/;
  const stripped = text.replace(lead, "").trim();
  // "due" and "by" name a deadline more surely than "on", which also starts a topic ("a problem set on rotational dynamics due Friday").
  const deadline = stripped.match(/^(.+?)\s+(?:is due|due on|due|by)\s+(.+?)(?:,|\band\b|$)/) ?? stripped.match(/^(.+?)\s+(?:on|is on|is|next|this)\s+(.+?)(?:,|\band\b|$)/);
  if (deadline) {
    const due = parseDate(deadline[2], today) ?? (/(next|this)\s/.test(text) ? parseDate(text, today) : null);
    const title = cleanTitle(input, deadline[1].replace(/^(?:a|an|my|the)\s+/, ""));
    const type: GoalType = inferGoalType(text);
    if (due && title.length >= 3 && type !== "general") {
      const gid = "G_new";
      return {
        ops: [{ op: "add_goal", id: gid, title, type, due, priority: type === "exam" ? 3 : 2, subject: subject ? refs.subjectRef(subject.id) : null }],
        interpretation: `New ${type === "problem_set" ? "problem set" : type} · ${title} · ${dayLabel(due)}`, decompose: [gid], confident: false,
      };
    }
  }
  return null;
}

function cleanTitle(original: string, matched: string): string {
  const lower = original.toLowerCase();
  const at = lower.indexOf(matched.trim().slice(0, 12));
  const raw = at >= 0 ? original.slice(at, at + matched.trim().length) : matched;
  const text = raw.replace(/\s+/g, " ").trim();
  return (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, 60);
}
function formatShort(minutes: number) { return minutes % 60 === 0 ? `${minutes / 60} h` : minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`; }
function hashText(text: string) { let h = 0; for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0; return h; }
export { WEEKDAYS as COMMAND_WEEKDAYS };
