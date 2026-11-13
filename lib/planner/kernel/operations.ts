// Typed operations on the work model. The language model, the command fast path and the Studio's direct edits all speak this one vocabulary, and
// nothing else may change a work model. References arrive as the short local IDs the context compiler handed out (`G2`, `w4`, `S1`, `N3_2`); any ID
// the snapshot did not contain is rejected, so a model cannot invent an exam, a subject or a deadline. Errors are precise enough to send back to the
// model for one repair turn.
import { addDays, isDateKey, round5 } from "./dates";
import {
  CONSTRAINT_KINDS, GOAL_TYPES, ITEM_KINDS, METHODS,
  type Constraint, type ConstraintSpec, type GoalType, type ItemKind, type KGoal, type Load, type Method, type Practice, type Priority, type Source, type WorkItem, type WorkModel,
} from "./contracts";

export interface RefMap {
  subjects: Record<string, number>;
  topics: Record<string, number>;
  goals: Record<string, string>;
  items: Record<string, string>;
  practices?: Record<string, string>;
  constraints?: Record<string, string>;
}

type Nullable<T> = T | null | undefined;
export type Op =
  | { op: "add_goal"; id: string; title: string; type?: Nullable<string>; due?: Nullable<string>; priority?: Nullable<number>; subject?: Nullable<string> }
  | { op: "update_goal"; id: string; title?: Nullable<string>; due?: Nullable<string>; priority?: Nullable<number>; status?: Nullable<string> }
  | { op: "drop_goal"; id: string }
  | {
      op: "add_item"; id: string; goal?: Nullable<string>; title: string; kind?: Nullable<string>; subject?: Nullable<string>; topics?: Nullable<string[]>;
      est?: Nullable<number[]>; chunk?: Nullable<number[]>; earliest?: Nullable<string>; due?: Nullable<string>; after?: Nullable<string[]>; load?: Nullable<number>;
      method?: Nullable<string>; note?: Nullable<string>; first_step?: Nullable<string>; confidence?: Nullable<number>;
    }
  | {
      op: "update_item"; id: string; title?: Nullable<string>; est?: Nullable<number[]>; chunk?: Nullable<number[]>; earliest?: Nullable<string>; due?: Nullable<string>;
      after?: Nullable<string[]>; load?: Nullable<number>; method?: Nullable<string>; note?: Nullable<string>; first_step?: Nullable<string>; kind?: Nullable<string>;
    }
  | { op: "remove_item"; id: string }
  | { op: "add_practice"; id: string; goal?: Nullable<string>; title: string; subject?: Nullable<string>; minutes: number; days: number[]; from?: Nullable<string>; until?: Nullable<string>; method?: Nullable<string> }
  | { op: "remove_practice"; id: string }
  | ({ op: "set_constraint"; id: string; hard?: Nullable<boolean>; weight?: Nullable<number>; label?: Nullable<string>; subject?: unknown } & Record<string, unknown>)
  | { op: "drop_constraint"; id: string }
  | { op: "note_assumption"; id: string; text: string; affects?: Nullable<string[]>; confidence?: Nullable<number>; ask?: Nullable<boolean> }
  | { op: "ask"; id: string; text: string; options?: Nullable<string[]>; affects?: Nullable<string[]> };

export type OpErrorCode = "UNKNOWN_OP" | "UNKNOWN_REF" | "INVALID_VALUE" | "DUPLICATE_ID" | "CYCLE" | "PAST_DATE" | "PROTECTED";
export interface OpError { index: number; op: string; id: string; code: OpErrorCode; message: string }
export interface AppliedOp { index: number; op: string; key: string; kind: "goal" | "item" | "practice" | "constraint" | "assumption" | "question" }

export interface ApplyContext {
  refs: RefMap;
  today: string;
  source: Source;
  /** Deterministic key for a new entity, so streamed batches of one workflow agree. */
  newKey: (kind: "goal" | "item" | "practice" | "constraint" | "assumption" | "question", id: string) => string;
  /** Subject of each topic, so an item that names only a topic still gets its subject. */
  topicSubjects?: Record<number, number>;
}
export interface ApplyResult { model: WorkModel; applied: AppliedOp[]; errors: OpError[]; refs: RefMap }

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
};
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const title60 = (value: unknown) => {
  const text = clean(value, 200);
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
};

/** Normalizes estimate and chunk ranges so the solver never sees an impossible item. */
export function normalizeSizes(est: Nullable<number[]>, chunk: Nullable<number[]>): { est: [number, number]; chunk: [number, number, number] } {
  const p50 = Math.max(5, Math.min(600, round5(est?.[0] ?? 45) || 5));
  const p80 = Math.max(p50, Math.min(p50 * 3, round5(est?.[1] ?? p50 * 1.3) || p50));
  let min = Math.max(10, Math.min(120, round5(chunk?.[0] ?? 25)));
  let max = Math.max(min, Math.min(180, round5(chunk?.[2] ?? Math.max(min, 60))));
  let ideal = Math.max(min, Math.min(max, round5(chunk?.[1] ?? Math.round((min + max) / 2))));
  if (p50 < min) { min = p50; ideal = Math.max(ideal, min); }
  if (ideal > max) ideal = max;
  if (min > ideal) min = ideal;
  if (max < min) max = min;
  return { est: [p50, p80], chunk: [min, ideal, max] };
}

function hasCycle(items: WorkItem[]): boolean {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const state = new Map<string, 1 | 2>();
  const visit = (key: string): boolean => {
    const mark = state.get(key);
    if (mark === 1) return true;
    if (mark === 2) return false;
    state.set(key, 1);
    for (const next of byKey.get(key)?.after ?? []) if (byKey.has(next) && visit(next)) return true;
    state.set(key, 2);
    return false;
  };
  return items.some((item) => visit(item.key));
}

function constraintSpec(raw: Record<string, unknown>, refs: RefMap): ConstraintSpec | string {
  const kind = raw.kind;
  if (typeof kind !== "string" || !(CONSTRAINT_KINDS as readonly string[]).includes(kind)) return `kind must be one of ${CONSTRAINT_KINDS.join(", ")}`;
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : undefined;
  const minute = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1440, round5(value))) : NaN);
  const subject = (value: unknown) => (typeof value === "string" ? refs.subjects[value] : typeof value === "number" ? value : undefined);
  switch (kind) {
    case "daily_cap": {
      const minutes = clampInt(raw.minutes, 0, 960, -1);
      return minutes < 0 ? "daily_cap needs minutes" : { kind, minutes, ...(days?.length ? { days } : {}) };
    }
    case "no_study_window":
    case "preferred_window":
    case "study_window": {
      const start = minute(raw.start); const end = minute(raw.end);
      if (!(start < end)) return `${kind} needs start < end in minutes after midnight`;
      if (kind === "no_study_window") {
        const dates = Array.isArray(raw.dates) ? raw.dates.filter(isDateKey) : undefined;
        return { kind, start, end, ...(days?.length ? { days } : {}), ...(dates?.length ? { dates } : {}) };
      }
      if (kind === "preferred_window") {
        const s = raw.subject == null ? null : subject(raw.subject);
        if (s === undefined) return "preferred_window subject is unknown";
        return { kind, start, end, subject: s, ...(days?.length ? { days } : {}), ...(isDateKey(raw.until) ? { until: raw.until } : {}) };
      }
      return { kind, start, end, ...(days?.length ? { days } : {}) };
    }
    case "subject_cap": {
      const s = subject(raw.subject);
      if (s === undefined) return "subject_cap subject is unknown";
      return { kind, subject: s, minutes: clampInt(raw.minutes, 0, 600, 120) };
    }
    case "day_off": {
      const dates = Array.isArray(raw.dates) ? raw.dates.filter(isDateKey) : [];
      return dates.length ? { kind, dates } : "day_off needs dates";
    }
    case "subject_weight": {
      const s = subject(raw.subject);
      if (s === undefined) return "subject_weight subject is unknown";
      return { kind, subject: s, weight: clampInt(raw.weight, 1, 3, 2) };
    }
    case "exam_buffer":
      return { kind, days: clampInt(raw.days, 0, 7, 1) };
    case "extra_time": {
      const start = minute(raw.start); const end = minute(raw.end);
      const date = Array.isArray(raw.dates) && isDateKey(raw.dates[0]) ? raw.dates[0] : raw.date;
      if (!isDateKey(date)) return "extra_time needs a date";
      if (!(start < end)) return "extra_time needs start < end";
      return { kind, date, start, end };
    }
  }
  return "unsupported constraint";
}

/** Applies operations to a copy of the model. Invalid operations are skipped and reported; valid ones still apply. */
export function applyOperations(input: WorkModel, ops: readonly Op[], ctx: ApplyContext): ApplyResult {
  const model: WorkModel = JSON.parse(JSON.stringify(input));
  const refs: RefMap = { subjects: { ...ctx.refs.subjects }, topics: { ...ctx.refs.topics }, goals: { ...ctx.refs.goals }, items: { ...ctx.refs.items }, practices: { ...(ctx.refs.practices ?? {}) }, constraints: { ...(ctx.refs.constraints ?? {}) } };
  const applied: AppliedOp[] = [];
  const errors: OpError[] = [];
  const topicSubject = new Map<number, number>(Object.entries(ctx.topicSubjects ?? {}).map(([topic, subject]) => [Number(topic), subject]));
  const fail = (index: number, op: { op: string; id?: string }, code: OpErrorCode, message: string) => { errors.push({ index, op: op.op, id: String(op.id ?? ""), code, message }); };
  const resolveGoal = (id: Nullable<string>) => (id ? refs.goals[id] ?? (model.goals.some((g) => g.key === id) ? id : undefined) : null);
  const resolveItem = (id: string) => refs.items[id] ?? (model.items.some((i) => i.key === id) ? id : undefined);
  const resolveSubject = (id: Nullable<string>) => (id == null || id === "" ? null : refs.subjects[id]);
  const date = (value: Nullable<string>) => (value == null || value === "" ? null : isDateKey(value) ? value : undefined);

  ops.forEach((raw, index) => {
    const op = raw as Op & { op: string; id?: string };
    if (!op || typeof op !== "object" || typeof op.op !== "string") { fail(index, { op: "?" }, "UNKNOWN_OP", "operation must be an object with an op field"); return; }
    const id = typeof op.id === "string" ? op.id.trim() : "";
    if (!id) { fail(index, op, "INVALID_VALUE", "id is required"); return; }
    switch (op.op) {
      case "add_goal": {
        if (refs.goals[id]) { fail(index, op, "DUPLICATE_ID", `${id} already exists`); return; }
        const title = title60(op.title);
        if (!title) { fail(index, op, "INVALID_VALUE", "title is required"); return; }
        const due = date(op.due);
        if (due === undefined) { fail(index, op, "INVALID_VALUE", "due must be YYYY-MM-DD or null"); return; }
        if (due && due < ctx.today) { fail(index, op, "PAST_DATE", `due ${due} is before today ${ctx.today}`); return; }
        const subject = resolveSubject(op.subject);
        if (subject === undefined) { fail(index, op, "UNKNOWN_REF", `subject ${op.subject} is not in the snapshot`); return; }
        const type = (GOAL_TYPES as readonly string[]).includes(String(op.type)) ? (op.type as GoalType) : "general";
        const key = ctx.newKey("goal", id);
        const goal: KGoal = { key, ref: null, title, type, due, priority: clampInt(op.priority, 1, 3, 2) as Priority, subject, status: "active", draft: false, source: ctx.source };
        model.goals.push(goal);
        refs.goals[id] = key;
        applied.push({ index, op: op.op, key, kind: "goal" });
        return;
      }
      case "update_goal":
      case "drop_goal": {
        const key = resolveGoal(id);
        const goal = key ? model.goals.find((g) => g.key === key) : undefined;
        if (!goal) { fail(index, op, "UNKNOWN_REF", `goal ${id} is not in the snapshot`); return; }
        if (op.op === "drop_goal") {
          goal.status = "dropped";
          for (const item of model.items) if (item.goal === goal.key && item.status === "open") item.status = "dropped";
          for (const practice of model.practices) if (practice.goal === goal.key) practice.status = "paused";
        } else {
          if (op.title) goal.title = title60(op.title) || goal.title;
          if (op.due !== undefined) {
            const due = date(op.due);
            if (due === undefined) { fail(index, op, "INVALID_VALUE", "due must be YYYY-MM-DD or null"); return; }
            if (due && due < ctx.today) { fail(index, op, "PAST_DATE", `due ${due} is before today`); return; }
            goal.due = due;
          }
          if (op.priority != null) goal.priority = clampInt(op.priority, 1, 3, goal.priority) as Priority;
          if (op.status === "done" || op.status === "active" || op.status === "dropped") goal.status = op.status;
        }
        applied.push({ index, op: op.op, key: goal.key, kind: "goal" });
        return;
      }
      case "add_item": {
        if (refs.items[id]) { fail(index, op, "DUPLICATE_ID", `${id} already exists`); return; }
        const title = title60(op.title);
        if (!title) { fail(index, op, "INVALID_VALUE", "title is required"); return; }
        const goal = op.goal ? resolveGoal(op.goal) : null;
        if (goal === undefined) { fail(index, op, "UNKNOWN_REF", `goal ${op.goal} is not in the snapshot`); return; }
        let subject = resolveSubject(op.subject);
        if (subject === undefined) { fail(index, op, "UNKNOWN_REF", `subject ${op.subject} is not in the snapshot`); return; }
        const topics: number[] = [];
        for (const ref of op.topics ?? []) {
          const topic = refs.topics[ref];
          if (topic === undefined) { fail(index, op, "UNKNOWN_REF", `topic ${ref} is not in the snapshot`); return; }
          topics.push(topic);
        }
        if (subject === null && topics.length && topicSubject.has(topics[0])) subject = topicSubject.get(topics[0])!;
        const earliest = date(op.earliest); const due = date(op.due);
        if (earliest === undefined || due === undefined) { fail(index, op, "INVALID_VALUE", "dates must be YYYY-MM-DD or null"); return; }
        if (due && due < ctx.today) { fail(index, op, "PAST_DATE", `due ${due} is before today`); return; }
        if (earliest && due && earliest > due) { fail(index, op, "INVALID_VALUE", `earliest ${earliest} is after due ${due}`); return; }
        const after: string[] = [];
        for (const ref of op.after ?? []) {
          const key = resolveItem(ref);
          if (!key) { fail(index, op, "UNKNOWN_REF", `after ${ref} is not an item`); return; }
          after.push(key);
        }
        const goalDue = goal ? model.goals.find((g) => g.key === goal)?.due ?? null : null;
        const sizes = normalizeSizes(op.est, op.chunk);
        const key = ctx.newKey("item", id);
        const item: WorkItem = {
          key, goal, title, kind: (ITEM_KINDS as readonly string[]).includes(String(op.kind)) ? (op.kind as ItemKind) : "learn", subject, topics,
          est: sizes.est, chunk: sizes.chunk, earliest: earliest && earliest < ctx.today ? null : earliest, due: due ?? (goalDue && goalDue >= ctx.today ? goalDue : null), after,
          load: clampInt(op.load, 1, 3, 2) as Load, method: (METHODS as readonly string[]).includes(String(op.method)) ? (op.method as Method) : "learn",
          source: ctx.source, confidence: typeof op.confidence === "number" ? Math.max(0, Math.min(1, op.confidence)) : 0.7, done: 0, status: "open", questId: null,
          firstStep: clean(op.first_step, 160) || null, note: clean(op.note, 140) || null,
        };
        model.items.push(item);
        if (hasCycle(model.items)) { model.items.pop(); fail(index, op, "CYCLE", `after creates a dependency cycle through ${id}`); return; }
        refs.items[id] = key;
        applied.push({ index, op: op.op, key, kind: "item" });
        return;
      }
      case "update_item": {
        const key = resolveItem(id);
        const item = key ? model.items.find((i) => i.key === key) : undefined;
        if (!item) { fail(index, op, "UNKNOWN_REF", `item ${id} is not in the snapshot`); return; }
        const before = JSON.stringify(item);
        if (op.title) item.title = title60(op.title) || item.title;
        if (op.est || op.chunk) { const sizes = normalizeSizes(op.est ?? item.est, op.chunk ?? item.chunk); item.est = sizes.est; item.chunk = sizes.chunk; }
        for (const field of ["earliest", "due"] as const) {
          if (op[field] === undefined) continue;
          const value = date(op[field]);
          if (value === undefined) { fail(index, op, "INVALID_VALUE", `${field} must be YYYY-MM-DD or null`); return; }
          if (field === "due" && value && value < ctx.today) { fail(index, op, "PAST_DATE", `due ${value} is before today`); return; }
          item[field] = value;
        }
        if (item.earliest && item.due && item.earliest > item.due) { Object.assign(item, JSON.parse(before)); fail(index, op, "INVALID_VALUE", "earliest is after due"); return; }
        if (op.after) {
          const after: string[] = [];
          for (const ref of op.after) { const k = resolveItem(ref); if (!k) { fail(index, op, "UNKNOWN_REF", `after ${ref} is not an item`); return; } after.push(k); }
          item.after = after;
          if (hasCycle(model.items)) { Object.assign(item, JSON.parse(before)); fail(index, op, "CYCLE", "after creates a dependency cycle"); return; }
        }
        if (op.load != null) item.load = clampInt(op.load, 1, 3, item.load) as Load;
        if (op.method && (METHODS as readonly string[]).includes(op.method)) item.method = op.method as Method;
        if (op.kind && (ITEM_KINDS as readonly string[]).includes(op.kind)) item.kind = op.kind as ItemKind;
        if (op.note !== undefined) item.note = clean(op.note, 140) || null;
        if (op.first_step !== undefined) item.firstStep = clean(op.first_step, 160) || null;
        applied.push({ index, op: op.op, key: item.key, kind: "item" });
        return;
      }
      case "remove_item": {
        const key = resolveItem(id);
        const at = key ? model.items.findIndex((i) => i.key === key) : -1;
        if (at < 0) { fail(index, op, "UNKNOWN_REF", `item ${id} is not in the snapshot`); return; }
        const item = model.items[at];
        // Work already studied is history: the item is released, never erased.
        if (item.done > 0 || item.questId) item.status = "dropped";
        else model.items.splice(at, 1);
        for (const other of model.items) other.after = other.after.filter((k) => k !== item.key);
        applied.push({ index, op: op.op, key: item.key, kind: "item" });
        return;
      }
      case "add_practice": {
        const existing = refs.practices?.[id];
        const title = title60(op.title);
        if (!title) { fail(index, op, "INVALID_VALUE", "title is required"); return; }
        const subject = resolveSubject(op.subject);
        if (subject === undefined) { fail(index, op, "UNKNOWN_REF", `subject ${op.subject} is not in the snapshot`); return; }
        const goal = op.goal ? resolveGoal(op.goal) : null;
        if (goal === undefined) { fail(index, op, "UNKNOWN_REF", `goal ${op.goal} is not in the snapshot`); return; }
        const days = [...new Set((op.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
        if (!days.length) { fail(index, op, "INVALID_VALUE", "days must list weekdays 0-6"); return; }
        const from = date(op.from); const until = date(op.until);
        if (from === undefined || until === undefined) { fail(index, op, "INVALID_VALUE", "dates must be YYYY-MM-DD or null"); return; }
        const key = existing ?? ctx.newKey("practice", id);
        const practice: Practice = { key, goal, title, subject, minutes: Math.max(10, Math.min(120, round5(op.minutes) || 20)), days, from, until, method: (METHODS as readonly string[]).includes(String(op.method)) ? (op.method as Method) : "practice", status: "active" };
        model.practices = model.practices.filter((p) => p.key !== key).concat(practice);
        refs.practices![id] = key;
        applied.push({ index, op: op.op, key, kind: "practice" });
        return;
      }
      case "remove_practice": {
        const key = refs.practices?.[id] ?? (model.practices.some((p) => p.key === id) ? id : undefined);
        const practice = model.practices.find((p) => p.key === key);
        if (!practice) { fail(index, op, "UNKNOWN_REF", `practice ${id} is not in the snapshot`); return; }
        practice.status = "paused";
        applied.push({ index, op: op.op, key: practice.key, kind: "practice" });
        return;
      }
      case "set_constraint": {
        const spec = constraintSpec(op as unknown as Record<string, unknown>, refs);
        if (typeof spec === "string") { fail(index, op, "INVALID_VALUE", spec); return; }
        const key = refs.constraints?.[id] ?? ctx.newKey("constraint", id);
        const constraint: Constraint = {
          ...spec, key, hard: op.hard !== false, weight: clampInt(op.weight, 1, 5, 3),
          provenance: ctx.source === "student" ? "student" : ctx.source === "system" ? "default" : "inferred", label: clean(op.label, 80) || describeConstraint(spec),
        };
        model.constraints = model.constraints.filter((c) => c.key !== key).concat(constraint);
        refs.constraints![id] = key;
        applied.push({ index, op: op.op, key, kind: "constraint" });
        return;
      }
      case "drop_constraint": {
        const key = refs.constraints?.[id] ?? id;
        if (!model.constraints.some((c) => c.key === key)) { fail(index, op, "UNKNOWN_REF", `constraint ${id} is not in the snapshot`); return; }
        model.constraints = model.constraints.filter((c) => c.key !== key);
        applied.push({ index, op: op.op, key, kind: "constraint" });
        return;
      }
      case "note_assumption": {
        const text = clean(op.text, 160);
        if (!text) { fail(index, op, "INVALID_VALUE", "text is required"); return; }
        const key = ctx.newKey("assumption", id);
        const affects = (op.affects ?? []).map((ref) => refs.goals[ref] ?? refs.items[ref] ?? ref);
        model.assumptions = model.assumptions.filter((a) => a.key !== key).concat({ key, text, affects, confidence: typeof op.confidence === "number" ? Math.max(0, Math.min(1, op.confidence)) : 0.6, ask: op.ask === true });
        for (const goal of model.goals) if (affects.includes(goal.key)) goal.draft = true;
        applied.push({ index, op: op.op, key, kind: "assumption" });
        return;
      }
      case "ask": {
        const text = clean(op.text, 160);
        if (!text) { fail(index, op, "INVALID_VALUE", "text is required"); return; }
        if (model.questions.length >= 2) { fail(index, op, "INVALID_VALUE", "at most two questions may be open"); return; }
        const key = ctx.newKey("question", id);
        const options = (op.options ?? []).map((o) => clean(o, 60)).filter(Boolean).slice(0, 4);
        const affects = (op.affects ?? []).map((ref) => refs.goals[ref] ?? refs.items[ref] ?? ref);
        model.questions = model.questions.filter((q) => q.key !== key).concat({ key, text, options, affects });
        applied.push({ index, op: op.op, key, kind: "question" });
        return;
      }
      default: {
        const unknown = op as { op: string; id?: string };
        fail(index, unknown, "UNKNOWN_OP", `unknown op ${unknown.op}`);
      }
    }
  });
  return { model, applied, errors, refs };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayList = (days?: number[]) => (days?.length ? ` on ${days.length === 5 && !days.includes(0) && !days.includes(6) ? "weekdays" : days.map((d) => WEEKDAY[d]).join(", ")}` : "");
/** A plain label for a constraint, shown as an editable tag. Subject names are filled in by the caller when it has them. */
export function describeConstraint(spec: ConstraintSpec, subjectName?: (id: number) => string): string {
  const name = (id: number | null | undefined) => (id == null ? "study" : subjectName?.(id) ?? "this subject");
  switch (spec.kind) {
    case "daily_cap": return `At most ${spec.minutes} min a day${dayList(spec.days)}`;
    case "no_study_window": return spec.dates?.length ? `Nothing ${hhmm(spec.start)}–${hhmm(spec.end)} on ${spec.dates.join(", ")}` : `No study ${hhmm(spec.start)}–${hhmm(spec.end)}${dayList(spec.days)}`;
    case "preferred_window": return `${name(spec.subject)} ${hhmm(spec.start)}–${hhmm(spec.end)}${dayList(spec.days)}${spec.until ? ` until ${spec.until}` : ""}`;
    case "study_window": return `Study between ${hhmm(spec.start)} and ${hhmm(spec.end)}${dayList(spec.days)}`;
    case "subject_cap": return `At most ${spec.minutes} min of ${name(spec.subject)} a day`;
    case "day_off": return spec.dates.length === 1 ? `Day off ${spec.dates[0]}` : `Days off ${spec.dates.join(", ")}`;
    case "subject_weight": return `${name(spec.subject)} matters ${spec.weight === 3 ? "most" : spec.weight === 2 ? "more" : "less"}`;
    case "exam_buffer": return `Keep ${spec.days} day${spec.days === 1 ? "" : "s"} before exams light`;
    case "extra_time": return `Extra time ${spec.date} ${hhmm(spec.start)}–${hhmm(spec.end)}`;
  }
}

/** The day before a date, for "no new topics in the final 24 hours". */
export const dayBefore = (date: string) => addDays(date, -1);
