import "server-only";
// Planning workflows: named, typed, fixed steps. One planning mind with parallel calls: independent goals are broken down by stateless calls that run
// at the same time, and everything that shares the week's time goes through one solver. The model decides what and why; the kernel decides when,
// proves it fits and explains it. Most interactions never wait for the model: commands try the deterministic fast path first, and drags, what-ifs,
// repairs and explanations run on the solver alone. Every stage is reported truthfully to the activity line with real counts.
import { createHash } from "node:crypto";
import { withAiRequest } from "@/lib/ai/telemetry-runtime";
import { releaseQuota, reserveQuota } from "@/lib/ai/usage-limiter";
import {
  PLAN_PRESETS, agreesWith, studentLanding, papersIn, applyCorrections, applyOperations, autoApplies, boundCorrections, uncoveredUnits, calibrationNote, codeIn, outlineKeys, classifyChange, compileStudyPath, dayLabel, describePath, diffDays, diffPlans, editSyllabus, formatMinutes,
  coverFocus, dropCoursework, inferGoalType, inferPreset, isDateKey, markWeak, namedFocus, paceWork, presetOf, normalizeSizes, normalizeSyllabus, parseCommand, parseTopicCommand, parseTopicList, propose, scaffold,
  signals as computeSignals,
  type Block, type Confidence, type GoalType, type KGoal, type Op, type OutlineCorrections, type Pace, type SyllabusIdentity, type PlanCandidate, type PlanPreset, type Signal, type Syllabus, type SyllabusUnit, type WhatIf, type WorkItem, type WorkModel,
} from "../kernel";
import { catalogEntries, catalogSyllabus, linkTopics, matchSyllabi } from "../catalog/syllabi";
import { compileContext, type CompiledContext } from "./snapshot";
import { findSources, researchAvailable, sourcesForPrompt, syllabusQueries } from "./research";
import { feedbackFor, findOutline, recordFeedback, reviseOutline, saveOutline, storedOf } from "./outlines";
import { describeCandidates, syllabusCandidates, type Candidate } from "./syllabus-search";
import { CRITIQUE_TOOL, DECOMPOSE_TOOL, IDENTIFY_SYSTEM, IDENTIFY_TOOL, INTENT_TOOL, SYLLABUS_SYSTEM, SYLLABUS_TOOL, TIER0, VERIFY_SYSTEM, VERIFY_TOOL, verifyRequest, ANSWER_SYSTEM, BRIEF_SYSTEM, EXPLAIN_SYSTEM, briefFacts, syllabusRequest, userMessage, wrapData } from "./prompts";
import { GatewayError, callText, callTool, type WireMessage } from "./gateway";
import { StudioError, commitDirect, history, openProposal, persistProposal, persistTransitions, setBlockState, type CommitOutcome, type ProposalView } from "./store";
import { studioReadiness } from "./config";

export type StudioEvent =
  | { type: "stage"; stage: string; text: string }
  | { type: "interpretation"; text: string; fast: boolean }
  | { type: "strategy"; goal: string; text: string }
  | { type: "item"; goal: string | null; item: WorkItem }
  | { type: "syllabus"; goal: string; name: string; source: Syllabus["source"]; units: number }
  | { type: "unit"; goal: string; unit: SyllabusUnit }
  | { type: "units_reset"; goal: string }
  | { type: "preview"; blocks: Block[]; summary: string; unplaced: number }
  | { type: "text"; delta: string }
  | { type: "proposal"; proposal: ProposalView }
  | { type: "committed"; version: number; summary: string; proposal: ProposalView }
  | { type: "notice"; text: string }
  | { type: "error"; code: string; message: string };
export type Emit = (event: StudioEvent) => void;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const keyFor = (prefix: string, key: string) => createHash("sha256").update(`${prefix}|${key}`).digest("hex").slice(0, 12);

/** Wraps a model-using workflow in quota and telemetry. Deterministic fallbacks release the unit. */
async function withModel<T>(userId: number, workflow: string, run: (ai: boolean) => Promise<T>): Promise<T> {
  const ready = studioReadiness();
  if (!ready.ai) return run(false);
  const quota = await reserveQuota(userId, "studio");
  if (!quota.allowed && !quota.unlimited) return run(false);
  let usedModel = false;
  try {
    return await withAiRequest({ userId, feature: "planner", workload: `studio.${workflow}` }, () => run(true).then((value) => { usedModel = true; return value; }));
  } finally {
    if (!usedModel && quota.charged) await releaseQuota(userId, "studio").catch(() => undefined);
  }
}

/** Flattened model operation to a kernel operation. Empty strings mean "none". */
function toOp(raw: Record<string, unknown>): Op | null {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);
  const op = s(raw.op); const id = s(raw.id);
  if (!op || !id) return null;
  switch (op) {
    case "add_goal": return { op, id, title: s(raw.title) ?? "", type: s(raw.type), due: s(raw.due), priority: n(raw.priority), subject: s(raw.subject) };
    case "update_goal": return { op, id, title: s(raw.title), due: s(raw.due) ?? undefined, priority: n(raw.priority) };
    case "drop_goal": return { op, id };
    case "update_item": return { op, id, title: s(raw.title), due: s(raw.due) ?? undefined, kind: s(raw.kind) };
    case "remove_item": return { op, id };
    case "drop_constraint": return { op, id };
    case "note_assumption": return { op, id, text: s(raw.text) ?? "", affects: s(raw.goal) ? [s(raw.goal)!] : [] };
    case "add_practice": return { op, id, title: s(raw.title) ?? "", subject: s(raw.subject), goal: s(raw.goal), minutes: n(raw.minutes) ?? 20, days: Array.isArray(raw.days) ? (raw.days as number[]) : [1, 2, 3, 4, 5] };
    case "set_constraint": {
      const kind = s(raw.kind);
      if (!kind) return null;
      const dates = Array.isArray(raw.dates) ? (raw.dates as unknown[]).filter((d): d is string => typeof d === "string" && isDateKey(d)) : [];
      return { op, id, kind, minutes: n(raw.minutes), start: typeof raw.start === "number" ? raw.start : null, end: typeof raw.end === "number" ? raw.end : null, days: Array.isArray(raw.days) && raw.days.length ? raw.days : undefined, dates, date: dates[0], subject: s(raw.subject), weight: n(raw.weight), label: s(raw.text), hard: true } as Op;
    }
  }
  return null;
}

/** A decomposed item from the model to an add_item operation, with ids made unique per goal so parallel breakdowns cannot collide. */
function itemOp(raw: Record<string, unknown>, goalRef: string, prefix: string, known: (ref: string) => boolean, topicKnown: (ref: string) => boolean = () => true): Op | null {
  const id = typeof raw.id === "string" && raw.id.trim() ? `${prefix}${raw.id.trim()}` : null;
  if (!id) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const after = (Array.isArray(raw.after) ? raw.after : []).filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => (known(a) ? a : `${prefix}${a}`));
  const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : null);
  return {
    // A topic named in words rather than by a snapshot ref is dropped, not a reason to lose the whole item.
    op: "add_item", id, goal: goalRef, title: s(raw.title) ?? "", kind: s(raw.kind), method: s(raw.method), topics: (Array.isArray(raw.topics) ? raw.topics : []).filter((t): t is string => typeof t === "string" && t.length > 0 && topicKnown(t)),
    est: nums(raw.est), chunk: nums(raw.chunk), earliest: s(raw.earliest), due: s(raw.due), after, load: typeof raw.load === "number" ? raw.load : null, note: s(raw.note), first_step: s(raw.first_step),
  };
}

interface Working {
  ctx: CompiledContext;
  model: WorkModel;
  refs: CompiledContext["refs"];
  emit: Emit;
  seed: string;
  tokens: { input: number; output: number; cached: number; calls: number; firstTokenMs: number[]; servedModel: string | null };
  notes: string[];
  errors: string[];
  interpretation: string | null;
  strategy: string[];
  previewTimer: ReturnType<typeof setTimeout> | null;
}

function newWorking(ctx: CompiledContext, emit: Emit, seed: string): Working {
  return { ctx, model: JSON.parse(JSON.stringify(ctx.model)), refs: ctx.refs, emit, seed, tokens: { input: 0, output: 0, cached: 0, calls: 0, firstTokenMs: [], servedModel: null }, notes: [], errors: [], interpretation: null, strategy: [], previewTimer: null };
}

/** Re-reads the world with a detailed horizon that reaches these exam dates (up to four weeks), so a near exam's whole path is placed in the calendar. */
async function widen(w: Working, dues: (string | null)[]) {
  const until = dues.filter((d): d is string => Boolean(d) && isDateKey(d)).sort().at(-1);
  if (!until || until < w.ctx.snapshot.days[w.ctx.snapshot.days.length - 1]?.date) return;
  const wider = await compileContext(w.ctx.userId, undefined, { until });
  if (wider.snapshot.days.length > w.ctx.snapshot.days.length) w.ctx = { ...w.ctx, snapshot: wider.snapshot };
}

function apply(w: Working, ops: Op[], source: "model" | "student" | "template" | "system") {
  const result = applyOperations(w.model, ops, {
    refs: w.refs, today: w.ctx.snapshot.today, source, topicSubjects: w.refs.topicSubjects,
    newKey: (kind, id) => `${kind[0]}_${keyFor(w.seed, `${kind}:${id}`)}`,
  });
  w.model = result.model;
  w.refs = { ...w.refs, ...result.refs, itemOf: w.refs.itemOf, goalOf: w.refs.goalOf, subjectOf: w.refs.subjectOf, topicOf: w.refs.topicOf, topicSubjects: w.refs.topicSubjects };
  for (const [ref, key] of Object.entries(result.refs.goals)) w.refs.goalOf.set(key, ref);
  for (const [ref, key] of Object.entries(result.refs.items)) w.refs.itemOf.set(key, ref);
  return result;
}

function track(w: Working, stats: { usage?: { promptTokens: number; completionTokens: number; cacheHitTokens?: number }; firstTokenMs: number | null; model: string }) {
  w.tokens.calls++;
  w.tokens.input += stats.usage?.promptTokens ?? 0;
  w.tokens.output += stats.usage?.completionTokens ?? 0;
  w.tokens.cached += stats.usage?.cacheHitTokens ?? 0;
  if (stats.firstTokenMs != null) w.tokens.firstTokenMs.push(stats.firstTokenMs);
  w.tokens.servedModel = stats.model;
}

/** Re-solves on each batch of streamed items, debounced, so blocks appear while the model is still writing. */
function schedulePreview(w: Working) {
  if (w.previewTimer) return;
  w.previewTimer = setTimeout(() => {
    w.previewTimer = null;
    const candidate = propose(w.ctx.snapshot, { model: w.ctx.model, blocks: w.ctx.blocks }, w.model);
    w.emit({ type: "preview", blocks: candidate.result.blocks, summary: candidate.diff.summary, unplaced: candidate.result.unplaced.reduce((s, u) => s + u.minutes, 0) });
  }, 150);
}

/** Breaks one goal into work: streamed from the model, or from the strategy library when the model is unavailable. */
async function decompose(w: Working, goalKey: string, ai: boolean, notes: string | null, signal?: AbortSignal, extra: PlanInput = {}): Promise<void> {
  const found = w.model.goals.find((g) => g.key === goalKey);
  if (!found) return;
  let goal: KGoal = found;
  const goalRef = w.refs.goalOf.get(goalKey)!;
  const subjectRef = goal.subject != null ? w.refs.subjectOf.get(goal.subject) ?? null : null;
  const topics = w.ctx.snapshot.topics.filter((t) => t.subject === goal.subject);
  const template = () => {
    const ops = scaffold(goal, { today: w.ctx.snapshot.today, goalRef, subjectRef, subjectName: w.ctx.snapshot.subjects.find((s) => s.id === goal.subject)?.name ?? null, topics: topics.map((t) => ({ ...t, shortRef: w.refs.topicOf.get(t.id)! })) })
      .map((op) => ("id" in op && op.op === "add_item" ? { ...op, id: `${goalRef}.${op.id}`, after: (op.after ?? []).map((a) => `${goalRef}.${a}`) } : op));
    const result = apply(w, ops, "template");
    for (const applied of result.applied) if (applied.kind === "item") w.emit({ type: "item", goal: goalKey, item: w.model.items.find((i) => i.key === applied.key)! });
    goal.draft = true;
    w.notes.push(`${goal.title} starts from a study template. Ask for changes in your own words.`);
    schedulePreview(w);
  };
  // Exams, courses, topics, skills and books are planned from an outline: its parts first, then a path compiled for the preset. Assignments, and
  // skills or books the planner could not outline, are broken down the ordinary way.
  const requested = extra.preset ?? goal.preset ?? null;
  if (goal.syllabus || (requested && requested !== "assignment") || goal.type === "exam" || ((goal.type === "skill" || goal.type === "reading") && ai) || parseTopicList(extra.topics || notes).length >= 2) {
    const outcome = await planFromOutline(w, goalKey, ai, notes, signal, extra);
    goal = w.model.goals.find((g) => g.key === goalKey)!;
    if (outcome.planned) return;
    if (outcome.preset === "exam" || outcome.preset === "course" || outcome.preset === "mastery") return;
    if (outcome.preset === "assignment") {
      const fresh = goal;
      fresh.preset = "assignment";
      if (fresh.type === "general" || fresh.type === "exam") fresh.type = ((): GoalType => { const t = inferGoalType(fresh.title); return t === "essay" || t === "project" || t === "problem_set" ? t : "project"; })();
    }
  }
  if (!ai) { template(); return; }

  const prefix = `${goalRef}.`;
  const known = (ref: string) => Boolean(w.refs.items[ref]);
  const topicKnown = (ref: string) => w.refs.topics[ref] !== undefined;
  const request = [
    `Break down goal ${goalRef} "${goal.title}" (${goal.type}${goal.due ? `, due ${goal.due}` : ", no deadline"}${subjectRef ? `, subject ${subjectRef}` : ""}).`,
    topics.length ? `Use topics from ${subjectRef} where they fit; weakest first.` : "There are no syllabus topics for this goal; name the work concretely.",
    goal.due ? `All items must be due on or before ${goal.due}.` : "",
    extra.request ? `The student's whole request:\n${wrapData(extra.request)}` : "",
    notes ? `Student's notes:\n${wrapData(notes)}` : "",
    "New item ids: n1, n2, ….",
  ].filter(Boolean).join("\n");
  const messages: WireMessage[] = [{ role: "system", content: TIER0 }, { role: "user", content: userMessage(w.ctx.snapshot, w.model, w.refs, request) }];
  let streamed = 0;
  const rejected: string[] = [];
  try {
    const result = await callTool<{ strategy?: string; items?: Record<string, unknown>[]; assumptions?: string[]; question?: string; options?: string[] }>({
      userId: w.ctx.userId, profile: "goal.decompose", messages, tool: DECOMPOSE_TOOL, signal,
      stream: { field: "items", onElement: (value) => {
        const op = itemOp(value as Record<string, unknown>, goalRef, prefix, known, topicKnown);
        if (!op) return;
        const applied = apply(w, [op], "model");
        if (applied.errors.length) { rejected.push(`${(value as { id?: string }).id}: ${applied.errors[0].message}`); return; }
        streamed++;
        const key = applied.applied[0]?.key;
        const item = key ? w.model.items.find((i) => i.key === key) : undefined;
        if (item) w.emit({ type: "item", goal: goalKey, item });
        schedulePreview(w);
      } },
    });
    track(w, result);
    const args = result.args;
    if (args.strategy) { w.strategy.push(args.strategy.slice(0, 200)); w.emit({ type: "strategy", goal: goalKey, text: args.strategy.slice(0, 200) }); }
    // Items the stream parser missed (rare: invalid JSON fragments), and items rejected only because they named one that had not streamed yet,
    // are applied from the final document, in its order.
    for (let pass = 0; pass < 2; pass++) {
      for (const raw of args.items ?? []) {
        const id = typeof raw.id === "string" ? `${prefix}${raw.id}` : null;
        if (!id || w.refs.items[id]) continue;
        const op = itemOp(raw, goalRef, prefix, known, topicKnown);
        if (!op) continue;
        const applied = apply(w, [op], "model");
        if (applied.errors.length) continue;
        streamed++;
        const index = rejected.findIndex((r) => r.startsWith(`${raw.id}:`));
        if (index >= 0) rejected.splice(index, 1);
        const item = w.model.items.find((i) => i.key === applied.applied[0]?.key);
        if (item) w.emit({ type: "item", goal: goalKey, item });
      }
    }
    const extra: Op[] = [];
    (args.assumptions ?? []).slice(0, 3).forEach((text, i) => { if (text?.trim()) extra.push({ op: "note_assumption", id: `${goalRef}.a${i + 1}`, text, affects: [goalRef] }); });
    if (args.question?.trim()) extra.push({ op: "ask", id: `${goalRef}.q1`, text: args.question, options: args.options ?? [], affects: [goalRef] });
    if (extra.length) apply(w, extra, "model");
    // One targeted repair turn for rejected items.
    if (rejected.length && streamed > 0) {
      const repairMessages: WireMessage[] = [...messages,
        { role: "assistant", content: null, tool_calls: [{ id: result.callId, type: "function", function: { name: DECOMPOSE_TOOL.name, arguments: result.raw.slice(0, 20_000) } }] },
        { role: "tool", tool_call_id: result.callId, content: `These items were rejected: ${rejected.join("; ")}. Call the tool again with only those items corrected, keeping their ids. Leave strategy, assumptions and question empty.` }];
      const retry = await callTool<{ items?: Record<string, unknown>[] }>({ userId: w.ctx.userId, profile: "goal.decompose", messages: repairMessages, tool: DECOMPOSE_TOOL, signal }).catch(() => null);
      if (retry) {
        track(w, retry);
        for (const raw of retry.args.items ?? []) {
          const op = itemOp(raw, goalRef, prefix, known, topicKnown);
          if (!op || w.refs.items[(op as { id: string }).id]) continue;
          const applied = apply(w, [op], "model");
          if (!applied.errors.length) { streamed++; const item = w.model.items.find((i) => i.key === applied.applied[0]?.key); if (item) w.emit({ type: "item", goal: goalKey, item }); }
        }
      }
    }
    if (!streamed) throw new GatewayError("invalid", `No usable items.${rejected.length ? ` ${rejected.slice(0, 3).join("; ").slice(0, 300)}` : ""}`);
    // Drop dangling dependencies to rejected items, then let the solver see the finished breakdown.
    const keys = new Set(w.model.items.map((i) => i.key));
    for (const item of w.model.items) item.after = item.after.filter((a) => keys.has(a));
  } catch (error) {
    if (signal?.aborted) throw error;
    const already = w.model.items.some((i) => i.goal === goalKey && i.source === "model");
    if (!already) {
      w.errors.push(error instanceof Error ? error.message : String(error));
      w.emit({ type: "notice", text: `The AI planner couldn't break down “${goal.title}”, so it starts from a study template.` });
      template();
    }
  }
  // An assignment's work is spread over the time to its date rather than packed into the first free days, from the model or the template.
  const paced = w.model.goals.find((g) => g.key === goalKey);
  if (paced?.due && (paced.preset === "assignment" || paced.type === "essay" || paced.type === "project" || paced.type === "problem_set")) w.model = paceWork(w.model, goalKey, w.ctx.snapshot);
}

const SOURCE_LABEL: Record<Syllabus["source"], string> = { catalog: "Sylf's syllabus list", model: "the AI", student: "your list", subject: "your Sylf syllabus" };

/** Which syllabus a request names, in one short call: what decides whether the shared library and careful research apply. */
async function identify(w: Working, goalKey: string, input: { notes: string | null; level: string | null; request?: string | null }, candidates: readonly Candidate[], signal?: AbortSignal): Promise<{ named: boolean; preset: PlanPreset; identity: SyllabusIdentity; match: Candidate[] } | null> {
  const goal = w.model.goals.find((g) => g.key === goalKey)!;
  const subject = w.ctx.snapshot.subjects.find((x) => x.id === goal.subject) ?? null;
  const said = input.request ?? goal.title;
  const user = [`Plan: ${wrapData(said)}`, input.level ? `Board, institution or level: ${wrapData(input.level)}` : "", subject ? `Subject in Sylf: ${subject.name}${subject.code && subject.code !== "GENERAL" ? ` (${subject.code})` : ""}${subject.board ? `, ${subject.board}` : ""}${subject.level ? `, ${subject.level}` : ""}` : "", input.notes ? `Notes:\n${wrapData(input.notes.slice(0, 1200))}` : "", candidates.length ? wrapData(describeCandidates(candidates)) : "Sylf holds no stored syllabus that fits this request: match must be empty."].filter(Boolean).join("\n");
  const result = await callTool<{ named?: boolean; preset?: string; board?: string; qualification?: string; subject?: string; code?: string; component?: string; edition?: string; match?: string[] }>({ userId: w.ctx.userId, profile: "syllabus.identify", tool: IDENTIFY_TOOL, signal, messages: [{ role: "system", content: IDENTIFY_SYSTEM }, { role: "user", content: user }] });
  track(w, result);
  const a = result.args;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
  // A code the model mentioned elsewhere (in the title or the edition) but left out of its field still identifies the syllabus.
  const code = text(a.code) ?? codeIn(`${said} ${a.edition ?? ""} ${input.level ?? ""}`);
  const refs = new Set((Array.isArray(a.match) ? a.match : []).filter((r): r is string => typeof r === "string").map((r) => r.trim().toLowerCase()));
  // The papers the learner typed are the papers asked for: they fill in, or correct, the component the model gave ("Papers 1 and 2" left empty).
  const typed = papersIn([said, input.level, input.notes].filter(Boolean).join(" "));
  const given = text(a.component);
  const component = typed.length && papersIn(given ?? "").join(",") !== typed.join(",") ? `Paper${typed.length > 1 ? "s" : ""} ${typed.join(" and ")}` : given;
  return { named: a.named === true, preset: (PLAN_PRESETS as readonly string[]).includes(a.preset ?? "") ? (a.preset as PlanPreset) : "exam", identity: { board: text(a.board), qualification: text(a.qualification), subject: text(a.subject), code, component, edition: text(a.edition) }, match: candidates.filter((c) => refs.has(c.ref)) };
}

/** The double-check: an independent reading of an outline against sources (and a learner's report), as corrections. */
async function verifyOutline(w: Working, syllabus: Syllabus, sources: string | null, report: string | null, signal?: AbortSignal, uncovered?: string[]): Promise<OutlineCorrections & { verdict: "ok" | "revise"; notes: string | null; official: string[] }> {
  const result = await callTool<{ official?: string[]; verdict?: string; edition?: string; missing?: { title?: string; points?: string[]; after?: string }[]; remove?: string[]; rename?: { from?: string; to?: string }[]; papers?: { label?: string; minutes?: number; marks?: number }[]; notes?: string }>({
    userId: w.ctx.userId, profile: "syllabus.verify", tool: VERIFY_TOOL, signal,
    messages: [{ role: "system", content: VERIFY_SYSTEM }, { role: "user", content: verifyRequest({ name: syllabus.name, edition: syllabus.identity?.edition ?? null, units: syllabus.units.filter((u) => u.included), papers: syllabus.papers, sources, report, uncovered }) }],
  });
  track(w, result);
  const a = result.args;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    verdict: a.verdict === "revise" ? "revise" : "ok", notes: str(a.notes) || null, edition: str(a.edition) || null,
    official: (a.official ?? []).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 120)).slice(0, 60),
    add: (a.missing ?? []).filter((m) => str(m.title)).slice(0, 12).map((m) => ({ title: str(m.title), points: (m.points ?? []).filter((p): p is string => typeof p === "string"), after: str(m.after) || null })),
    remove: (a.remove ?? []).filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 12),
    rename: (a.rename ?? []).filter((r) => str(r.from) && str(r.to)).slice(0, 12).map((r) => ({ from: str(r.from), to: str(r.to) })),
    papers: (a.papers ?? []).filter((p) => (p.minutes ?? 0) >= 20).slice(0, 4).map((p) => ({ label: str(p.label) || "Past paper", minutes: p.minutes ?? 0, marks: p.marks && p.marks > 0 ? p.marks : null })),
  };
}

/**
 * A syllabus nobody has planned before, looked at with care: several searches for its official document and current edition, a map from what was
 * read, then an independent double-check against the same sources whose corrections are applied. Slower and more thorough than everyday planning,
 * and it runs once per syllabus: everyone after reuses the result.
 */
/**
 * The double-check of a mapped outline against its sources: an independent reading as bounded corrections, then the checker's list of the
 * official units compared with the outline, and one focused second look at any official unit still uncovered (added when really missing).
 */
async function doubleCheck(w: Working, goalKey: string, mapped: Syllabus, text: string | null, signal?: AbortSignal): Promise<Syllabus> {
  w.emit({ type: "stage", stage: "check", text: "Double-checking the topics" });
  const check = await verifyOutline(w, mapped, text, null, signal).catch(() => null);
  let syllabus = mapped;
  if (!check) return syllabus;
  const before = JSON.stringify(syllabus.units.map((u) => u.title));
  const bounded = boundCorrections(syllabus, check);
  Object.assign(check, bounded);
  syllabus = applyCorrections(syllabus, bounded);
  const uncovered = check.official.length ? uncoveredUnits(syllabus, check.official) : [];
  if (uncovered.length) {
    w.emit({ type: "stage", stage: "check", text: `Checking ${uncovered.length} more official topic${uncovered.length === 1 ? "" : "s"}` });
    const second = await verifyOutline(w, syllabus, text, null, signal, uncovered).catch(() => null);
    if (second) {
      const extra = boundCorrections(syllabus, { add: second.add, remove: [], rename: [], papers: null, edition: null });
      check.add.push(...extra.add);
      syllabus = applyCorrections(syllabus, { ...extra, edition: null });
    }
  }
  if (JSON.stringify(syllabus.units.map((u) => u.title)) !== before) {
    w.emit({ type: "units_reset", goal: goalKey });
    for (const unit of syllabus.units) w.emit({ type: "unit", goal: goalKey, unit });
  }
  const fixes = check.add.length + check.remove.length + check.rename.length + (check.papers?.length ? 1 : 0);
  w.emit({ type: "stage", stage: "check", text: fixes ? `Double-check made ${fixes} correction${fixes === 1 ? "" : "s"}` : "Double-check agreed" });
  return syllabus;
}

async function carefulOutline(w: Working, goalKey: string, asked: { notes: string | null; typed: { title: string; points: string[] }[]; preset: PlanPreset | "auto"; level: string | null; target: string | null; request?: string | null }, identity: SyllabusIdentity, signal?: AbortSignal): Promise<Mapped | null> {
  const goal = w.model.goals.find((g) => g.key === goalKey)!;
  w.emit({ type: "stage", stage: "research", text: "Researching this syllabus for the first time" });
  const sources = researchAvailable() ? await findSources(syllabusQueries(identity, asked.request ?? goal.title, Number(w.ctx.snapshot.today.slice(0, 4))), signal, { pages: 5, seconds: 30 }) : [];
  w.emit({ type: "stage", stage: "research", text: sources.length ? `Read ${sources.length} source${sources.length === 1 ? "" : "s"}` : "No sources found; using what the planner knows" });
  const text = sources.length ? sourcesForPrompt(sources) : null;
  const mapped = await mapOutline(w, goalKey, { ...asked, sources: text }, signal);
  if (!mapped?.syllabus.units.length) return mapped;
  const syllabus = await doubleCheck(w, goalKey, { ...dropCoursework(mapped.syllabus), identity, researched: sources.length > 0, sources: sources.slice(0, 6).map((x) => ({ title: x.title, url: x.url })) }, text, signal);
  return { ...mapped, syllabus: dropCoursework(syllabus), preset: mapped.preset };
}

/** Topic text the student typed, keeping line breaks so one topic a line stays a list. */
const notesText = (text: unknown, max = 2000) => (typeof text === "string" ? text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");

/** What the composer can tell the planner beyond a title and a date. */
/** `request` is the learner's whole request when the goal's title had to be shortened: planning reads all of it ("…9231 Papers 1 and 2 test"). */
export interface PlanInput { preset?: PlanPreset | "auto" | null; level?: string | null; weak?: string | null; target?: string | null; topics?: string | null; request?: string | null }

interface Mapped { syllabus: Syllabus; preset: PlanPreset; scope: string | null; question: { text: string; options: string[] } | null; confidence: "high" | "medium" | "low"; research: string | null }

/** Asks the model for a plan's outline, streaming units as they arrive. Returns null when it cannot. */
async function mapOutline(w: Working, goalKey: string, input: { notes: string | null; typed: { title: string; points: string[] }[]; preset: PlanPreset | "auto"; level: string | null; target: string | null; sources?: string | null; request?: string | null }, signal?: AbortSignal): Promise<Mapped | null> {
  const goal = w.model.goals.find((g) => g.key === goalKey)!;
  const subject = w.ctx.snapshot.subjects.find((s) => s.id === goal.subject) ?? null;
  const nodes = w.ctx.snapshot.topics.filter((t) => t.subject === goal.subject).map((t) => ({ ref: w.refs.topicOf.get(t.id)!, title: t.title }));
  const streamed: SyllabusUnit[] = [];
  const toUnit = (raw: Record<string, unknown>): SyllabusUnit | null => {
    const title = typeof raw.title === "string" ? raw.title : "";
    if (!title.trim()) return null;
    return normalizeSyllabus({ source: "model", name: "", units: [{ title, points: Array.isArray(raw.points) ? raw.points.filter((p): p is string => typeof p === "string") : [], weight: raw.weight as 1, difficulty: raw.difficulty as 1, topic: typeof raw.topic === "string" ? w.refs.topics[raw.topic] ?? null : null }] }).units[0] ?? null;
  };
  const result = await callTool<{ preset?: string; confidence?: string; research?: string; name?: string; papers?: { label?: string; minutes?: number; marks?: number }[]; units?: Record<string, unknown>[]; scope?: string; question?: string; options?: string[] }>({
    userId: w.ctx.userId, profile: "syllabus.map", tool: SYLLABUS_TOOL, signal,
    messages: [{ role: "system", content: SYLLABUS_SYSTEM }, { role: "user", content: syllabusRequest({ title: input.request ?? goal.title, due: goal.due, preset: input.preset, subject, notes: input.typed.length ? null : input.notes, topics: input.typed.map((t) => (t.points.length ? `${t.title}: ${t.points.join("; ")}` : t.title)), nodes, level: input.level, target: input.target, sources: input.sources ?? null }) }],
    stream: { field: "units", onElement: (value) => {
      const unit = toUnit(value as Record<string, unknown>);
      if (!unit || streamed.some((u) => u.title.toLowerCase() === unit.title.toLowerCase())) return;
      unit.key = `u${streamed.length + 1}`;
      streamed.push(unit);
      w.emit({ type: "unit", goal: goalKey, unit });
    } },
  });
  track(w, result);
  const args = result.args;
  const preset = (PLAN_PRESETS as readonly string[]).includes(args.preset ?? "") ? (args.preset as PlanPreset) : input.preset === "auto" ? inferPreset(input.request ?? goal.title, goal.due, w.ctx.snapshot.today) : input.preset;
  const units = (args.units ?? []).map((raw) => toUnit(raw)).filter((u): u is SyllabusUnit => Boolean(u));
  const confidence = args.confidence === "high" || args.confidence === "low" ? args.confidence : "medium";
  const research = args.research?.trim() || null;
  if (!units.length && preset !== "assignment") return research ? { syllabus: normalizeSyllabus({ source: "model", name: goal.title, units: [] }), preset, scope: null, question: null, confidence: "low", research } : null;
  const syllabus = normalizeSyllabus({
    source: input.typed.length ? "student" : "model", name: args.name?.trim() || goal.title, units,
    papers: (args.papers ?? []).filter((p) => (p.minutes ?? 0) >= 20).map((p) => ({ label: p.label ?? "Past paper", minutes: p.minutes ?? 0, marks: p.marks && p.marks > 0 ? p.marks : null })),
  });
  // A learner's own list keeps their order and names; the model only adds key points.
  if (input.typed.length) syllabus.units = syllabus.units.map((u, i) => ({ ...u, title: input.typed[i]?.title ?? u.title, points: input.typed[i]?.points.length ? input.typed[i].points : u.points }));
  return { syllabus, preset, scope: args.scope?.trim() || null, question: args.question?.trim() ? { text: args.question.trim(), options: (args.options ?? []).slice(0, 4) } : null, confidence, research };
}

const STAGE_TEXT: Record<PlanPreset | "auto", string> = { exam: "Finding the syllabus", course: "Mapping the course", mastery: "Breaking down the topic", skill: "Mapping the skill", reading: "Finding the chapters", assignment: "Reading the brief", auto: "Working out the plan" };
const TYPE_FOR: Record<PlanPreset, GoalType | null> = { exam: "exam", course: null, mastery: "general", skill: "skill", reading: "reading", assignment: null };

/**
 * Plans a goal from its outline: the topics (or stages, or chapters) first, then a compiled path shaped by the preset. The outline comes from Sylf's
 * checked catalog when the request names a paper it holds, from the learner's own list, from the model (which, when it is not sure of the course,
 * names a search: the server searches, reads a few pages and the model maps again from them), or from the learner's Sylf syllabus. Returns whether a
 * path was compiled, and the preset it settled on: an assignment, or a skill or book with no outline, goes back to the ordinary breakdown.
 */
async function planFromOutline(w: Working, goalKey: string, ai: boolean, notes: string | null, signal?: AbortSignal, extra: PlanInput = {}): Promise<{ planned: boolean; preset: PlanPreset }> {
  // `apply` replaces the work model with a fresh copy, so the goal is looked up again after every operation rather than held.
  const current = () => w.model.goals.find((g) => g.key === goalKey)!;
  const goal = current();
  const goalRef = w.refs.goalOf.get(goalKey)!;
  const subject = w.ctx.snapshot.subjects.find((s) => s.id === goal.subject) ?? null;
  const nodes = w.ctx.snapshot.topics.filter((t) => t.subject === goal.subject).map((t) => ({ id: t.id, title: t.title }));
  const today = w.ctx.snapshot.today;
  // Everything the learner said: the whole request when the title had to be shortened.
  const said = extra.request ?? goal.title;
  let preset: PlanPreset | "auto" = extra.preset ?? goal.preset ?? (goal.type === "exam" ? "exam" : goal.type === "skill" ? "skill" : goal.type === "reading" ? "reading" : "auto");
  let syllabus: Syllabus | null = goal.syllabus ?? null;
  let scope: string | null = null;
  if (!syllabus) {
    w.emit({ type: "stage", stage: "syllabus", text: STAGE_TEXT[preset] });
    const typed = parseTopicList(extra.topics || notes);
    const catalogText = `${said} ${extra.level ?? ""} ${notes ?? ""} ${subject ? `${subject.name} ${subject.code ?? ""} ${subject.board ?? ""} ${subject.level ?? ""}` : ""}`;
    const outlined = typed.length < 2 && (preset === "exam" || preset === "course" || preset === "auto");
    const strictCatalog = () => catalogSyllabus(matchSyllabi(catalogText, subject));
    // Without the model, only a strict match against Sylf's checked catalog is trusted (board, level, subject and paper all named).
    let picked: Syllabus | null = outlined && !ai ? strictCatalog() : null;
    if (!picked && ai) {
      const asked = { notes: [notes, extra.topics].filter(Boolean).join("\n") || null, typed, preset, level: extra.level ?? null, target: extra.target ?? goal.target ?? null, request: extra.request ?? null };
      const fail = (error: unknown) => { if (signal?.aborted) throw error; w.errors.push(error instanceof Error ? error.message : String(error)); return null; };
      // Every named syllabus is decided by the model. An indexed search of the checked catalog and the shared library finds the few stored syllabi
      // the request might mean; the identify call names the syllabus and says which of those, if any, is exactly it. Its choice is checked against
      // what it identified. A match is used as it is; anything else is researched, mapped and double-checked with care, then saved for everyone.
      let mapped: Mapped | null = null;
      if (outlined) {
        w.emit({ type: "stage", stage: "syllabus", text: "Checking Sylf's syllabus library" });
        const candidates = await syllabusCandidates(catalogText).catch((error) => fail(error) ?? []);
        const named = await identify(w, goalKey, asked, candidates, signal).catch(fail);
        const keys = named?.named ? outlineKeys(named.identity) : [];
        if (named && preset === "auto" && (named.preset === "exam" || named.preset === "course")) preset = named.preset;
        const match = named?.named && named.match.length && agreesWith(named.identity, named.match.map((c) => c.stored)) ? named.match : [];
        if (named?.match.length && !match.length) w.notes.push("A stored syllabus looked close but is not this one, so it was researched instead.");
        const fromCatalog = match.filter((c) => c.kind === "catalog");
        const fromLibrary = match.find((c) => c.kind === "library")?.library ?? null;
        if (!named) {
          // The model could not be reached this time: the strict catalog match, or the ordinary mapping below.
          picked = strictCatalog();
        } else if (fromCatalog.length && fromCatalog.length === match.length) {
          w.emit({ type: "stage", stage: "syllabus", text: "Matched Sylf's checked syllabus" });
          picked = catalogSyllabus(catalogEntries(fromCatalog.map((c) => c.catalog!.id)));
        } else if (fromLibrary && match.length === 1) {
          w.emit({ type: "stage", stage: "syllabus", text: "Found in Sylf's syllabus library" });
          mapped = { syllabus: fromLibrary.syllabus, preset: preset === "auto" ? fromLibrary.preset : preset, scope: null, question: null, confidence: "high", research: null };
        } else if (keys.length) {
          // The exact entry for what the model identified, when the search did not show it (so the model never turned it down).
          const shown = new Set(candidates.map((c) => c.library?.id).filter(Boolean));
          const entry = await findOutline(keys).catch(fail);
          if (entry && !shown.has(entry.id) && agreesWith(named.identity, [storedOf(entry)])) {
            w.emit({ type: "stage", stage: "syllabus", text: "Found in Sylf's syllabus library" });
            mapped = { syllabus: entry.syllabus, preset: preset === "auto" ? entry.preset : preset, scope: null, question: null, confidence: "high", research: null };
          } else {
            mapped = await carefulOutline(w, goalKey, { ...asked, preset }, named.identity, signal).catch(fail);
            if (mapped) {
              const saved = await saveOutline(keys, mapped.syllabus, mapped.preset).catch(fail);
              if (saved) mapped = { ...mapped, syllabus: { ...mapped.syllabus, library: saved.syllabus.library ?? null } };
            }
          }
        }
      }
      if (!mapped && !picked) mapped = await mapOutline(w, goalKey, asked, signal).catch(fail);
      // A book outlined in a handful of parts rather than its chapters is looked up: its table of contents is worth one search.
      if (mapped && mapped.preset === "reading" && !typed.length && mapped.syllabus.units.length < 10) mapped = { ...mapped, confidence: "low", research: mapped.research ?? `${said.replace(/^read\s+/i, "")} table of contents chapters`.slice(0, 120) };
      // Not sure of this course: look it up and map again from what was found. Optional, and only when a search provider is configured.
      if (mapped && !mapped.syllabus.library && mapped.confidence !== "high" && mapped.research && mapped.preset !== "assignment" && researchAvailable()) {
        w.emit({ type: "stage", stage: "research", text: "Looking up the syllabus" });
        const sources = await findSources(mapped.research, signal);
        w.emit({ type: "stage", stage: "research", text: sources.length ? `Read ${sources.length} source${sources.length === 1 ? "" : "s"}` : "Nothing useful found; using what the planner knows" });
        if (sources.length) {
          w.emit({ type: "units_reset", goal: goalKey });
          const text = sourcesForPrompt(sources);
          const again = await mapOutline(w, goalKey, { ...asked, preset: mapped.preset, sources: text }, signal).catch(fail);
          // A researched outline is double-checked against the same sources, as a library entry is.
          if (again?.syllabus.units.length) {
            const researched: Syllabus = { ...again.syllabus, researched: true, sources: sources.slice(0, 6).map((x) => ({ title: x.title, url: x.url })) };
            // Only a course or exam has an official syllabus to check against, and a student's own topic list is never changed.
            const checkable = (again.preset === "exam" || again.preset === "course") && researched.source === "model";
            mapped = { ...again, syllabus: checkable ? await doubleCheck(w, goalKey, researched, text, signal).catch(() => researched) : researched };
          }
        }
      }
      if (mapped) {
        preset = mapped.preset;
        if (preset === "assignment") return { planned: false, preset };
        if (mapped.syllabus.source === "model") mapped = { ...mapped, syllabus: dropCoursework(mapped.syllabus) };
        if (mapped.syllabus.units.length) { syllabus = mapped.syllabus; scope = mapped.scope; }
        if (mapped.question && !w.model.questions.length) apply(w, [{ op: "ask", id: `${goalRef}.q1`, text: mapped.question.text, options: mapped.question.options, affects: [goalRef] }], "model");
      }
    }
    if (picked) {
      syllabus = picked;
      if (preset === "auto") preset = goal.due && diffDays(goal.due, today) > 60 ? "course" : "exam";
    }
    if (!syllabus && typed.length >= 2) syllabus = normalizeSyllabus({ source: "student", name: goal.title, units: typed, papers: [] });
    if (preset === "auto") preset = inferPreset(`${said} ${notes ?? ""}`, goal.due, today);
    // The learner's own syllabus for the subject, in its order, leaving out what they have mastered.
    if (!syllabus && (preset === "exam" || preset === "course" || preset === "mastery")) {
      const own = w.ctx.snapshot.topics.filter((t) => t.subject === goal.subject && !t.mastered).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
      if (own.length >= 2) syllabus = normalizeSyllabus({ source: "subject", name: `${subject?.name ?? goal.title}: your syllabus in Sylf`, papers: [], units: own.slice(0, 40).map((t) => ({ title: t.title, points: [], difficulty: (t.difficulty >= 4 ? 3 : t.difficulty <= 2 ? 1 : 2) as 1 | 2 | 3, confidence: t.progress >= 70 ? "strong" : null, topic: t.id })) });
    }
    if (!syllabus) {
      // A skill, a book or an assignment without an outline is broken down the ordinary way. An exam or course without topics asks for them.
      if (preset === "skill" || preset === "reading" || preset === "assignment") return { planned: false, preset };
      const ask = preset === "mastery" ? `Which parts of ${goal.title} do you need? One a line.` : `Which topics does ${goal.title} cover? List them, one a line.`;
      apply(w, [{ op: "ask", id: `${goalRef}.topics`, text: ask.slice(0, 160), options: [], affects: [goalRef] }], "system");
      current().draft = true;
      w.emit({ type: "notice", text: "List the topics and the planner builds the rest." });
      return { planned: false, preset };
    }
    // Whatever the learner singled out ("especially Bayes") is covered, and counts as a weak spot.
    const focusText = `${said}${notes ? `. ${notes}` : ""}`;
    if (syllabus.source !== "catalog" && syllabus.source !== "student") syllabus = coverFocus(syllabus, focusText);
    syllabus = markWeak(linkTopics(syllabus, nodes), [extra.weak, namedFocus(focusText).join(", ")].filter(Boolean).join(", ") || null);
    current().syllabus = syllabus;
    if (syllabus.source !== "model" || syllabus.library?.reused) for (const unit of syllabus.units) w.emit({ type: "unit", goal: goalKey, unit });
    w.emit({ type: "syllabus", goal: goalKey, name: syllabus.name, source: syllabus.source, units: syllabus.units.length });
    const from = syllabus.library?.reused ? "Sylf's syllabus library" : syllabus.library ? "research, double-checked" : SOURCE_LABEL[syllabus.source];
    w.emit({ type: "stage", stage: "syllabus", text: `${syllabus.units.length} ${preset === "skill" ? "stages" : preset === "reading" ? "parts" : "topics"} from ${from}${!syllabus.library && syllabus.researched ? ", checked against sources" : ""}` });
    const paper = syllabus.papers[0];
    apply(w, [{ op: "note_assumption", id: `${goalRef}.scope`, text: (scope ?? `Covers all ${syllabus.units.length} ${preset === "skill" ? "stages" : "topics"}${paper ? ` of ${paper.label}` : ""}.`).slice(0, 160), affects: [goalRef], confidence: syllabus.source === "catalog" ? 0.8 : 0.6 }], "system");
  } else if (extra.weak) current().syllabus = markWeak(syllabus, extra.weak);
  if (preset === "auto") preset = inferPreset(`${said} ${notes ?? ""}`, goal.due, today);
  const target = current();
  target.preset = preset;
  const type = TYPE_FOR[preset] ?? (target.due && (target.syllabus?.papers.length || inferGoalType(target.title) === "exam") ? "exam" : "general");
  if (target.type !== type && preset !== "assignment") target.type = type;
  w.emit({ type: "stage", stage: "path", text: "Building your plan" });
  const compiled = compileStudyPath(w.model, goalKey, w.ctx.snapshot, target.syllabus!.source === "model" ? "model" : "template");
  w.model = compiled.model;
  for (const item of w.model.items.filter((i) => i.goal === goalKey && i.details && i.status === "open")) w.emit({ type: "item", goal: goalKey, item });
  const strategy = describePath(compiled.summary, current().syllabus!, preset);
  w.emit({ type: "stage", stage: "path", text: `${compiled.summary.sessions} sessions${compiled.summary.to ? ` to ${dayLabel(compiled.summary.to)}` : ""}` });
  w.strategy.push(strategy);
  w.emit({ type: "strategy", goal: goalKey, text: strategy });
  schedulePreview(w);
  return { planned: true, preset };
}

/** The goals of a run that were planned from a syllabus, which the semantic critic leaves alone: the compiler already guarantees their structure. */
const fromSyllabus = (w: Working, keys: string[]) => keys.filter((k) => !w.model.goals.find((g) => g.key === k)?.syllabus);

/** The semantic critic: a short non-thinking call that checks coverage, granularity, order and method fit. At most one revision. */
async function critique(w: Working, goalKeys: string[], signal?: AbortSignal): Promise<number> {
  if (!goalKeys.length) return 0;
  const goals = goalKeys.map((k) => w.model.goals.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => Boolean(g));
  const lines = goals.flatMap((g) => [`${w.refs.goalOf.get(g.key)} ${g.title} (${g.type}${g.due ? `, due ${g.due}` : ""})`, ...w.model.items.filter((i) => i.goal === g.key).map((i) => `  ${w.refs.itemOf.get(i.key)} ${i.title} · ${i.kind}/${i.method} · ${i.est[0]} min${i.topics.length ? ` · ${i.topics.map((t) => w.refs.topicOf.get(t)).join(",")}` : ""}${i.after.length ? ` · after ${i.after.map((a) => w.refs.itemOf.get(a)).join(",")}` : ""}`)]);
  const goal = goals[0];
  const request = `Review the breakdown of ${w.refs.goalOf.get(goal.key)} only. Add at most three items, only for a real gap in THIS goal (a syllabus topic of its subject with no work, no retrieval before an exam, a missing final check). Never add work for other goals. New item ids: r1, r2, r3.\n${lines.join("\n")}`;
  const result = await callTool<{ verdict?: string; add?: Record<string, unknown>[] }>({ userId: w.ctx.userId, profile: "plan.critique", messages: [{ role: "system", content: TIER0 }, { role: "user", content: userMessage(w.ctx.snapshot, w.model, w.refs, request) }], tool: CRITIQUE_TOOL, signal }).catch(() => null);
  if (!result) return 0;
  track(w, result);
  if (result.args.verdict !== "revise") return 0;
  let added = 0;
  for (const raw of (result.args.add ?? []).slice(0, 3)) {
    const goalRef = w.refs.goalOf.get(goal.key)!;
    const op = itemOp(raw, goalRef, `${goalRef}.`, (ref) => Boolean(w.refs.items[ref]));
    if (!op) continue;
    // Additions stay inside the goal's own subject: a topic from another subject is a sign the critic wandered.
    const topics = ((op as { topics?: string[] }).topics ?? []).map((ref) => w.refs.topics[ref]).filter((t): t is number => t != null);
    if (topics.some((t) => w.refs.topicSubjects[t] !== goal.subject)) continue;
    const applied = apply(w, [op], "model");
    if (!applied.errors.length) { added++; const item = w.model.items.find((i) => i.key === applied.applied[0]?.key); if (item) w.emit({ type: "item", goal: item.goal, item }); }
  }
  return added;
}

/**
 * The semantic critic, off the critical path: the student already has the proposal. If the critic finds a real gap while the proposal is still
 * open, a revised proposal replaces it, once, with a note saying what was added.
 */
async function improve(w: Working, goalKeys: string[], proposal: ProposalView, meta: { key: string; workflow: string; request: Record<string, unknown>; ops: unknown[]; started: number }, signal?: AbortSignal): Promise<ProposalView> {
  const before = new Set(w.model.items.map((i) => i.key));
  const added = await critique(w, goalKeys, signal).catch(() => 0);
  if (!added) return proposal;
  const current = await openProposal(w.ctx.space.id);
  if (!current || current.id !== proposal.id) return proposal;
  const titles = w.model.items.filter((i) => !before.has(i.key)).map((i) => `“${i.title}”`).join(", ");
  w.notes.push(`A review of the breakdown added ${titles}.`);
  w.emit({ type: "stage", stage: "review", text: `Review added ${plural(added, "session")}` });
  return finish(w, { ...meta, key: `${meta.key}.reviewed`, source: "MODEL" });
}

async function finish(w: Working, meta: { key: string; workflow: string; request: Record<string, unknown>; ops: unknown[]; source: "MODEL" | "STUDENT" | "SYSTEM"; started: number; autoCommit?: boolean }): Promise<ProposalView> {
  if (w.previewTimer) { clearTimeout(w.previewTimer); w.previewTimer = null; }
  const blocks = w.ctx.blocks;
  const sessions = w.model.items.filter((i) => i.status === "open").length;
  w.emit({ type: "stage", stage: "fit", text: `Fitting ${plural(sessions, "piece")} of work into your free time` });
  const candidate = propose(w.ctx.snapshot, { model: w.ctx.model, blocks }, w.model);
  w.emit({ type: "stage", stage: "check", text: candidate.verification.pass ? `${plural(candidate.verification.checks, "check")} passed` : `${plural(candidate.verification.failures.length, "check")} failed` });
  if (!candidate.verification.pass) throw new StudioError(422, "VERIFICATION_FAILED", "The plan didn't pass its checks, so nothing was proposed.", candidate.verification.failures.slice(0, 5));
  const trace = { ms: Date.now() - meta.started, tokens: w.tokens, errors: w.errors.slice(0, 5) };
  const proposal = await persistProposal(w.ctx, candidate, { key: meta.key, source: meta.source, workflow: meta.workflow, request: meta.request, operations: meta.ops, interpretation: w.interpretation, strategy: w.strategy.join(" ") || null, notes: w.notes, trace, servedModel: w.tokens.servedModel });
  w.emit({ type: "proposal", proposal });
  return proposal;
}

const requestText = (text: unknown, max = 600) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Edit by command: deterministic fast path for common phrasings, otherwise the model's intent parser; new goals are broken down in parallel. */
export async function runCommand(userId: number, input: { key: string; text: string }, emit: Emit, signal?: AbortSignal): Promise<ProposalView | null> {
  const started = Date.now();
  const text = requestText(input.text);
  if (text.length < 2) throw new StudioError(400, "EMPTY", "Say what you'd like to change.");
  emit({ type: "stage", stage: "read", text: "Reading your week" });
  const ctx = await compileContext(userId);
  emit({ type: "stage", stage: "read", text: `Reading your week · ${plural(ctx.facts.commitments, "commitment")}` });
  const w = newWorking(ctx, emit, input.key);
  // "I'm weak at integration": a rating on an exam's topic list re-compiles its study path, with no model.
  const topical = parseTopicCommand(text, w.model);
  if (topical) {
    w.interpretation = topical.interpretation;
    emit({ type: "interpretation", text: topical.interpretation, fast: true });
    w.model = editSyllabus(w.model, topical.goal, { units: topical.units });
    const goal = w.model.goals.find((g) => g.key === topical.goal)!;
    if (!goal.syllabus!.units.some((u) => u.included)) throw new StudioError(422, "NO_TOPICS", "Keep at least one topic in the plan.");
    emit({ type: "stage", stage: "path", text: "Rebuilding the study path" });
    w.model = compileStudyPath(w.model, topical.goal, ctx.snapshot, goal.syllabus!.source === "model" ? "model" : "template").model;
    return finish(w, { key: input.key, workflow: "syllabus", request: { text }, ops: [], source: "STUDENT", started });
  }
  const fast = parseCommand(text, ctx.snapshot, w.model, { subjectRef: (id) => w.refs.subjectOf.get(id)!, goalRef: (key) => w.refs.goalOf.get(key)! });
  if (fast?.confident && !fast.decompose.length) {
    w.interpretation = fast.interpretation;
    emit({ type: "interpretation", text: fast.interpretation, fast: true });
    const applied = apply(w, fast.ops, "student");
    if (applied.errors.length) throw new StudioError(422, "INVALID_COMMAND", applied.errors[0].message);
    return finish(w, { key: input.key, workflow: "command", request: { text }, ops: fast.ops, source: "STUDENT", started });
  }
  return withModel(userId, "command", async (ai) => {
    let ops: Op[] = fast?.ops ?? [];
    let toDecompose: string[] = fast?.decompose ?? [];
    if (fast) { w.interpretation = fast.interpretation; emit({ type: "interpretation", text: fast.interpretation, fast: true }); }
    if (ai && !fast) {
      emit({ type: "stage", stage: "understand", text: "Understanding your request" });
      const result = await callTool<{ interpretation?: string; ops?: Record<string, unknown>[]; decompose?: string[]; question?: string; options?: string[] }>({
        userId, profile: "intent.parse", tool: INTENT_TOOL, signal,
        messages: [{ role: "system", content: TIER0 }, { role: "user", content: userMessage(ctx.snapshot, w.model, w.refs, `Student: ${wrapData(text)}\nTurn this into operations. Use add_goal (id G_new1…) and list it in decompose when new work must be planned. If nothing fits, return no ops and ask one question.`) }],
      });
      track(w, result);
      ops = (result.args.ops ?? []).map((raw) => toOp(raw)).filter((op): op is Op => Boolean(op));
      toDecompose = (result.args.decompose ?? []).filter((d) => typeof d === "string");
      w.interpretation = requestText(result.args.interpretation, 60) || null;
      if (w.interpretation) emit({ type: "interpretation", text: w.interpretation, fast: false });
      if (!ops.length && result.args.question?.trim()) ops.push({ op: "ask", id: "Q_new1", text: result.args.question, options: result.args.options ?? [], affects: [] });
    }
    if (!ops.length && !toDecompose.length) throw new StudioError(422, "NOT_UNDERSTOOD", ai ? "I couldn't turn that into a change. Try “move chemistry to evenings” or “chem midterm on 28 Nov”." : "Try a phrasing like “move chemistry to evenings”, “max 2 hours a day” or “chem midterm on 28 Nov”.");
    const applied = apply(w, ops, ai && !fast ? "model" : "student");
    if (applied.errors.length && !applied.applied.length) throw new StudioError(422, "INVALID_COMMAND", applied.errors[0].message);
    const goalKeys = toDecompose.map((ref) => w.refs.goals[ref]).filter((k): k is string => Boolean(k));
    if (goalKeys.length) {
      for (const key of goalKeys) { const g = w.model.goals.find((x) => x.key === key); if (g && g.type === "general") g.type = inferGoalType(`${g.title} ${text}`); }
      await widen(w, goalKeys.map((k) => w.model.goals.find((g) => g.key === k)?.due ?? null));
      emit({ type: "stage", stage: "decompose", text: `Breaking down ${plural(goalKeys.length, "goal")}` });
      await Promise.all(goalKeys.map((key) => decompose(w, key, ai, text, signal)));
    }
    const proposal = await finish(w, { key: input.key, workflow: goalKeys.length ? "add_goal" : "command", request: { text }, ops, source: ai && goalKeys.length ? "MODEL" : ai && !fast ? "MODEL" : "STUDENT", started });
    const review = fromSyllabus(w, goalKeys);
    return ai && review.length ? improve(w, review, proposal, { key: input.key, workflow: "add_goal", request: { text }, ops, started }, signal) : proposal;
  });
}

/** Add a goal from structured input (Home, the goal map, term setup), or plan an existing goal that has no work yet. */
export interface AddGoalInput {
  key: string; title?: string; type?: string; due?: string | null; subjectId?: number | null; priority?: number; notes?: string; goalKey?: string;
  /** How to shape the plan; `auto` lets the planner choose. */
  preset?: PlanPreset | "auto";
  minutesPerDay?: number | null; daysPerWeek?: number | null; sessionMinutes?: number | null; start?: string | null;
  /** Board, institution, course code or level, in the learner's words. */
  level?: string | null;
  /** Topics the learner finds hard, which get more time. */
  weak?: string | null;
  target?: string | null;
  /** The topic list, one a line. */
  topics?: string | null;
}

const PRESET_NAME: Record<PlanPreset, string> = { exam: "Exam", course: "Course", mastery: "Mastery", skill: "Skill", assignment: "Assignment", reading: "Reading" };
const PRESET_TYPE: Record<PlanPreset, (title: string) => GoalType> = {
  exam: () => "exam", course: (t) => (inferGoalType(t) === "exam" ? "exam" : "general"), mastery: () => "general", skill: () => "skill", reading: () => "reading",
  assignment: (t) => { const type = inferGoalType(t); return type === "essay" || type === "project" || type === "problem_set" ? type : "project"; },
};

export async function runAddGoal(userId: number, input: AddGoalInput, emit: Emit, signal?: AbortSignal): Promise<ProposalView | null> {
  const started = Date.now();
  emit({ type: "stage", stage: "read", text: "Reading your week" });
  const ctx = await compileContext(userId);
  emit({ type: "stage", stage: "read", text: `Reading your week · ${plural(ctx.facts.commitments, "commitment")}` });
  const w = newWorking(ctx, emit, input.key);
  let goalKey = input.goalKey ?? null;
  const ops: Op[] = [];
  if (!goalKey) {
    // The goal's title is shortened by the kernel at a natural break; the whole request still reaches planning (`extra.request`).
    const title = requestText(input.title, 400);
    if (!title) throw new StudioError(400, "EMPTY", "Give the goal a name.");
    const due = input.due && isDateKey(input.due) ? input.due : null;
    if (due && due < ctx.snapshot.today) throw new StudioError(400, "PAST_DATE", "Choose a deadline from today on.");
    const subject = input.subjectId != null ? w.refs.subjectOf.get(input.subjectId) ?? null : null;
    const preset = input.preset && input.preset !== "auto" ? input.preset : null;
    const type: GoalType = preset ? PRESET_TYPE[preset](`${title} ${input.notes ?? ""}`) : (input.type && ["exam", "essay", "project", "problem_set", "reading", "skill", "general"].includes(input.type) ? input.type : inferGoalType(title)) as GoalType;
    ops.push({ op: "add_goal", id: "G_new1", title, type, due, priority: input.priority ?? (type === "exam" ? 3 : 2), subject });
    const applied = apply(w, ops, "student");
    if (applied.errors.length) throw new StudioError(422, "INVALID_GOAL", applied.errors[0].message);
    goalKey = w.refs.goals.G_new1;
    const created = w.model.goals.find((g) => g.key === goalKey)!;
    if (preset) created.preset = preset;
    const n = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
    const start = input.start && isDateKey(input.start) && input.start > ctx.snapshot.today ? input.start : null;
    const pace: Pace = { minutesPerDay: n(input.minutesPerDay, 15, 720), daysPerWeek: n(input.daysPerWeek, 1, 7), sessionMinutes: n(input.sessionMinutes, 10, 180), start };
    if (Object.values(pace).some((v) => v != null)) created.pace = pace;
    if (input.target?.trim()) created.target = input.target.trim().slice(0, 80);
  } else if (!w.model.goals.some((g) => g.key === goalKey && g.status === "active")) throw new StudioError(404, "NOT_FOUND", "That goal isn't in your plan.");
  const goal = w.model.goals.find((g) => g.key === goalKey)!;
  w.interpretation = `${goal.preset ? PRESET_NAME[goal.preset] : input.preset === "auto" ? "Auto" : `New ${goal.type === "problem_set" ? "problem set" : goal.type}`} · ${goal.title}${goal.due ? ` · ${dayLabel(goal.due)}` : ""}`;
  emit({ type: "interpretation", text: w.interpretation, fast: true });
  await widen(w, [goal.due]);
  const whole = !input.goalKey ? requestText(input.title, 400) : "";
  const extra: PlanInput = { preset: input.preset ?? goal.preset ?? null, level: notesText(input.level, 200) || null, weak: notesText(input.weak, 400) || null, target: goal.target ?? null, topics: notesText(input.topics, 4000) || null, request: whole.length > goal.title.length ? whole : null };
  return withModel(userId, "add_goal", async (ai) => {
    emit({ type: "stage", stage: "decompose", text: `Planning ${goal.title}` });
    await decompose(w, goalKey!, ai, notesText(input.notes) || null, signal, extra);
    const meta = { key: input.key, workflow: "add_goal", request: { title: input.title ?? goal.title, due: goal.due, type: goal.type }, ops, started };
    const proposal = await finish(w, { ...meta, source: ai ? "MODEL" : "STUDENT" });
    return ai && fromSyllabus(w, [goalKey!]).length ? improve(w, [goalKey!], proposal, meta, signal) : proposal;
  });
}

/** Answers to a planner question become operations: the chosen option is recorded and the goal re-planned around it. */
export async function runAnswer(userId: number, input: { key: string; question: string; answer: string }, emit: Emit, signal?: AbortSignal): Promise<ProposalView | null> {
  const ctx = await compileContext(userId);
  // A question asked in the proposal under review is answered there: the answer re-plans on top of that proposal.
  const pending = ctx.model.questions.some((q) => q.key === input.question) ? null : await openProposal(ctx.space.id);
  const base = pending?.model.questions.some((q) => q.key === input.question) ? pending.model : ctx.model;
  const question = base.questions.find((q) => q.key === input.question);
  if (!question) throw new StudioError(404, "NOT_FOUND", "That question was already answered.");
  const goalKey = question.affects.find((a) => base.goals.some((g) => g.key === a)) ?? null;
  const w = newWorking(ctx, emit, input.key);
  if (base !== ctx.model) w.model = JSON.parse(JSON.stringify(base));
  w.model.questions = w.model.questions.filter((q) => q.key !== question.key);
  // An answer to "which topics?" is the topic list itself, so it becomes the syllabus rather than an assumption.
  const topics = /\btopics\b/i.test(question.text) && Boolean(goalKey) && !base.goals.find((g) => g.key === goalKey)?.syllabus;
  if (!topics) w.model.assumptions.push({ key: `a_${keyFor(input.key, "answer")}`, text: `${question.text} ${requestText(input.answer, 120)}`.slice(0, 160), affects: question.affects, confidence: 1, ask: false });
  if (goalKey) {
    const goal = w.model.goals.find((g) => g.key === goalKey)!;
    // Re-plan the goal's unstarted work around the answer.
    w.model.items = w.model.items.filter((i) => !(i.goal === goalKey && i.done === 0 && !i.questId && i.status === "open"));
    goal.draft = false;
    await widen(w, [goal.due]);
    return withModel(userId, "answer", async (ai) => {
      await decompose(w, goalKey, ai, topics ? notesText(input.answer) : `${question.text} Answer: ${requestText(input.answer, 200)}`, signal);
      return finish(w, { key: input.key, workflow: "answer", request: { question: question.text, answer: input.answer }, ops: [], source: ai ? "MODEL" : "STUDENT", started: Date.now() });
    });
  }
  return finish(w, { key: input.key, workflow: "answer", request: { question: question.text, answer: input.answer }, ops: [], source: "STUDENT", started: Date.now() });
}

/**
 * The student's changes to a goal's topic list: a rating (weak, okay, strong), a topic unticked or added, or the list confirmed. The study path is
 * re-compiled from it with the same session keys, so nothing studied moves and quests keep their identity. No model call. Proposed for review, on top
 * of the open proposal when the goal is still being reviewed there.
 */
export async function runSyllabusEdit(userId: number, input: { key: string; goal: string; units?: { key: string; confidence?: Confidence | null; included?: boolean }[]; add?: { title: string; points?: string[] }[]; checked?: boolean }): Promise<ProposalView | null> {
  const started = Date.now();
  const ctx = await compileContext(userId);
  const pending = await openProposal(ctx.space.id);
  const inPending = pending?.model.goals.some((g) => g.key === input.goal && g.syllabus) ?? false;
  const base: WorkModel = inPending ? pending!.model : ctx.model;
  const goal = base.goals.find((g) => g.key === input.goal && g.status === "active");
  if (!goal?.syllabus) throw new StudioError(404, "NOT_FOUND", "That goal has no topic list to change.");
  const w = newWorking(ctx, () => undefined, input.key);
  w.model = editSyllabus(base, input.goal, { units: input.units, add: input.add, checked: input.checked });
  const after = w.model.goals.find((g) => g.key === input.goal)!;
  if (!after.syllabus!.units.some((u) => u.included)) throw new StudioError(422, "NO_TOPICS", "Keep at least one topic in the plan.");
  if (input.checked) w.model.assumptions = w.model.assumptions.filter((a) => !a.affects.includes(input.goal));
  w.model = compileStudyPath(w.model, input.goal, ctx.snapshot, after.syllabus!.source === "model" ? "model" : "template").model;
  const rated = (input.units ?? []).filter((u) => u.confidence !== undefined).length;
  const ticked = (input.units ?? []).filter((u) => u.included !== undefined).length;
  w.interpretation = [rated ? `${rated} topic${rated === 1 ? "" : "s"} rated` : null, ticked ? `${ticked} topic${ticked === 1 ? "" : "s"} changed` : null, input.add?.length ? `${input.add.length} added` : null, input.checked ? "Topics confirmed" : null].filter(Boolean).join(" · ") || "Topics";
  return finish(w, { key: input.key, workflow: "syllabus", request: { goal: input.goal, units: input.units ?? [], add: input.add ?? [], checked: input.checked ?? null }, ops: [], source: "STUDENT", started });
}

/**
 * "Is this plan right?" answered "no": the syllabus is researched again, mapped again with the student's report in hand, double-checked against
 * the sources, and the plan rebuilt from it as a proposal. Ratings and ticks on topics that stay are kept. A correction to a shared library entry,
 * confirmed by sources, becomes its next version; Sylf's hand-checked catalog is never changed here.
 */
export async function runRecheck(userId: number, input: { key: string; goal: string; note?: string | null }, emit: Emit, signal?: AbortSignal): Promise<ProposalView | null> {
  const started = Date.now();
  const ctx = await compileContext(userId);
  const pending = await openProposal(ctx.space.id);
  const base: WorkModel = pending?.model.goals.some((g) => g.key === input.goal && g.syllabus) ? pending.model : ctx.model;
  const original = base.goals.find((g) => g.key === input.goal && g.status === "active");
  if (!original?.syllabus) throw new StudioError(404, "NOT_FOUND", "That plan has no syllabus to check.");
  const note = notesText(input.note, 600) || null;
  const round = original.review?.round ?? 0;
  await recordFeedback(userId, { goalKey: original.key, round, outlineId: original.syllabus.library?.id ?? null, verdict: "INACCURATE", note });
  const w = newWorking(ctx, emit, input.key);
  w.model = JSON.parse(JSON.stringify(base));
  w.interpretation = "Re-checking the plan";
  emit({ type: "interpretation", text: w.interpretation, fast: false });
  return withModel(userId, "recheck", async (ai) => {
    if (!ai) throw new StudioError(503, "AI_UNAVAILABLE", "Re-checking needs the AI planner, which isn't available right now.");
    const goal = () => w.model.goals.find((g) => g.key === original.key)!;
    const old = goal().syllabus!;
    const preset = presetOf(goal());
    const identity: SyllabusIdentity = old.identity ?? { board: null, qualification: null, subject: null, code: null, component: null, edition: null };
    emit({ type: "stage", stage: "research", text: "Re-checking the syllabus" });
    const sources = researchAvailable() ? await findSources(syllabusQueries(identity, goal().title, Number(ctx.snapshot.today.slice(0, 4))), signal, { pages: 5, seconds: 30 }) : [];
    emit({ type: "stage", stage: "research", text: sources.length ? `Read ${sources.length} source${sources.length === 1 ? "" : "s"}` : "No sources found; checking against what the planner knows" });
    const text = sources.length ? sourcesForPrompt(sources) : null;
    // Map again, told that the last outline was reported wrong, then double-check the new one against the sources and the report.
    const report = `The previous outline for this plan was reported as inaccurate by the learner${note ? `: "${note}"` : "."} Previous topics: ${old.units.map((u) => u.title).join("; ")}.`;
    const mapped = await mapOutline(w, original.key, { notes: report, typed: [], preset, level: [identity.board, identity.qualification, identity.code].filter(Boolean).join(" ") || null, target: goal().target ?? null, sources: text }, signal).catch(() => null);
    let fresh: Syllabus = mapped?.syllabus.units.length ? { ...mapped.syllabus, identity, ref: old.ref } : { ...old };
    emit({ type: "stage", stage: "check", text: "Double-checking the topics" });
    const check = await verifyOutline(w, fresh, text, note ?? "", signal).catch(() => null);
    if (check) fresh = applyCorrections(fresh, boundCorrections(fresh, check));
    // Keep the student's own ratings and ticks on every topic that stays, by name.
    const prior = new Map(old.units.map((u) => [u.title.toLowerCase(), u]));
    fresh = { ...fresh, source: old.source === "catalog" ? "model" : fresh.source, checked: false, researched: sources.length > 0 || old.researched, sources: sources.length ? sources.slice(0, 6).map((x) => ({ title: x.title, url: x.url })) : old.sources, library: old.library ?? null,
      units: fresh.units.map((u) => { const was = prior.get(u.title.toLowerCase()); return was ? { ...u, confidence: was.confidence, included: was.included, topic: was.topic } : u; }) };
    fresh = linkTopics(fresh, ctx.snapshot.topics.filter((t) => t.subject === goal().subject).map((t) => ({ id: t.id, title: t.title })));
    emit({ type: "units_reset", goal: original.key });
    for (const unit of fresh.units) emit({ type: "unit", goal: original.key, unit });
    const changed = fresh.units.length !== old.units.length || fresh.units.some((u, i) => u.title !== old.units[i]?.title) || JSON.stringify(fresh.papers) !== JSON.stringify(old.papers);
    // Only a real correction, confirmed against sources, becomes the shared entry's next version.
    if (old.library?.id && sources.length && changed) {
      const revised = await reviseOutline(old.library.id, fresh).catch(() => null);
      if (revised) fresh = { ...fresh, library: { ...old.library, version: revised.version, trust: "CHECKED", reused: false } };
    }
    const target = goal();
    target.syllabus = fresh;
    target.review = { round: round + 1 };
    emit({ type: "stage", stage: "path", text: "Rebuilding the plan" });
    const compiled = compileStudyPath(w.model, original.key, ctx.snapshot, "model");
    w.model = compiled.model;
    w.notes.push(changed ? `Re-checked ${sources.length ? `against ${sources.length} source${sources.length === 1 ? "" : "s"}` : "by the planner"}: ${check?.notes ?? "the topics were corrected"}` : `Re-checked ${sources.length ? `against ${sources.length} source${sources.length === 1 ? "" : "s"}` : "by the planner"}: the topics look right${check?.notes ? `. ${check.notes}` : ""}`);
    w.strategy.push(describePath(compiled.summary, fresh, preset));
    return finish(w, { key: input.key, workflow: "recheck", request: { goal: original.key, note }, ops: [], source: "MODEL", started });
  });
}

/** "Is this plan right?" answered "yes", or closed: recorded for this plan round; the plan does not change. */
export async function runFeedback(userId: number, input: { goal: string; verdict: "accurate" | "dismissed" }): Promise<void> {
  const ctx = await compileContext(userId);
  const pending = await openProposal(ctx.space.id);
  const goal = (pending?.model.goals ?? []).find((g) => g.key === input.goal) ?? ctx.model.goals.find((g) => g.key === input.goal);
  if (!goal) throw new StudioError(404, "NOT_FOUND", "That plan isn't in your planner.");
  await recordFeedback(userId, { goalKey: goal.key, round: goal.review?.round ?? 0, outlineId: goal.syllabus?.library?.id ?? null, verdict: input.verdict === "accurate" ? "ACCURATE" : "DISMISSED" });
}

/** What-ifs become real changes only when the student keeps them. */
export async function runWhatIf(userId: number, input: { key: string; whatIf: WhatIf }, emit: Emit): Promise<ProposalView | null> {
  const started = Date.now();
  const ctx = await compileContext(userId);
  const w = newWorking(ctx, emit, input.key);
  const wf = input.whatIf ?? {};
  const ops: Op[] = [];
  if (typeof wf.dailyCap === "number") ops.push({ op: "set_constraint", id: "whatif-cap", kind: "daily_cap", minutes: wf.dailyCap, label: `At most ${formatMinutes(wf.dailyCap)} a day` });
  if (typeof wf.weekdayCap === "number") ops.push({ op: "set_constraint", id: "whatif-weekday", kind: "daily_cap", minutes: wf.weekdayCap, days: [1, 2, 3, 4, 5], label: `At most ${formatMinutes(wf.weekdayCap)} on weekdays` });
  for (const [i, extra] of (wf.extraWindows ?? []).slice(0, 7).entries()) ops.push({ op: "set_constraint", id: `whatif-extra-${extra.date}-${i}`, kind: "extra_time", date: extra.date, dates: [extra.date], start: extra.start, end: extra.end, label: `Extra time ${dayLabel(extra.date)}` });
  if (wf.daysOff?.length) ops.push({ op: "set_constraint", id: "whatif-off", kind: "day_off", dates: wf.daysOff.filter(isDateKey), label: `Days off ${wf.daysOff.map(dayLabel).join(", ")}` });
  const applied = apply(w, ops, "student");
  if (applied.errors.length) throw new StudioError(422, "INVALID_WHATIF", applied.errors[0].message);
  for (const item of w.model.items) {
    if (wf.startEarlier && item.earliest) item.earliest = null;
    const compress = wf.compress?.find((c) => c.goal === item.goal);
    if (compress && (item.kind === "review" || item.kind === "practice") && item.status === "open") { const f = Math.max(0.1, Math.min(0.5, compress.fraction)); item.est = normalizeSizes([item.est[0] * (1 - f), item.est[1] * (1 - f)], item.chunk).est; }
    if (wf.release?.includes(item.key) && item.status === "open") item.status = "dropped";
  }
  for (const extend of wf.extendDue ?? []) {
    const goal = w.model.goals.find((g) => g.key === extend.goal);
    if (goal?.due) { const old = goal.due; goal.due = dayAfter(goal.due, extend.days); for (const item of w.model.items) if (item.goal === goal.key && item.due === old) item.due = goal.due; }
  }
  w.interpretation = "What-if";
  return finish(w, { key: input.key, workflow: "what_if", request: { whatIf: wf }, ops, source: "STUDENT", started });
}
const dayAfter = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.max(0, Math.min(14, Math.round(days)))); return d.toISOString().slice(0, 10); };

export type BlockEdit = { kind: "move"; block: string; date: string; start: number } | { kind: "pin" | "unpin" | "skip" | "restore"; block: string };

/** Direct manipulation: dropping a block pins it there and the rest reflows; skipping hands its minutes back to the solver. Applied at once, with undo. */
export async function runDirect(userId: number, input: { key: string; edits: BlockEdit[] }): Promise<CommitOutcome> {
  let ctx = await compileContext(userId);
  // A session moved past the planning horizon widens it, so the plan can be solved around it there.
  const furthest = input.edits.filter((e): e is Extract<BlockEdit, { kind: "move" }> => e.kind === "move" && isDateKey(e.date)).map((e) => e.date).sort().at(-1);
  if (furthest && furthest > (ctx.snapshot.days.at(-1)?.date ?? ctx.snapshot.today)) {
    const wider = await compileContext(userId, undefined, { until: furthest });
    if (wider.snapshot.days.length > ctx.snapshot.days.length) ctx = { ...ctx, snapshot: wider.snapshot };
  }
  const blocks = ctx.blocks.map((b) => ({ ...b }));
  for (const edit of input.edits.slice(0, 20)) {
    const block = blocks.find((b) => b.id === edit.block);
    if (!block) throw new StudioError(404, "NOT_FOUND", "That session is no longer in your plan.");
    if (edit.kind === "move") {
      if (!isDateKey(edit.date)) throw new StudioError(400, "INVALID_MOVE", "Choose a day for this session.");
      if (block.state === "done") throw new StudioError(409, "CONFLICT", "That session is already done.");
      const length = block.end - block.start;
      const placed = studentLanding(edit.date, edit.start, length, ctx.snapshot.today, ctx.snapshot.nowMinute);
      // A missed or skipped session moved to a new time is planned again.
      Object.assign(block, { date: placed.date, start: placed.start, end: placed.start + length, pinned: true, state: "committed" });
    } else if (edit.kind === "pin") block.pinned = true;
    else if (edit.kind === "unpin") block.pinned = false;
    else if (edit.kind === "skip") { if (block.state === "committed") block.state = "skipped"; }
    else if (edit.kind === "restore") { if (block.state === "skipped" || block.state === "missed") block.state = "committed"; }
  }
  // Solve from the edited blocks, then describe the change against the plan the student was looking at.
  const reflowed = propose(ctx.snapshot, { model: ctx.model, blocks }, ctx.model, null, undefined, "repair");
  const merged: PlanCandidate = { ...reflowed, diff: diffPlans({ model: ctx.model, blocks: ctx.blocks }, { model: ctx.model, blocks: reflowed.result.blocks }, ctx.snapshot.today) };
  return commitDirect(ctx, merged, { key: input.key, source: "STUDENT", workflow: "direct", request: { edits: input.edits } });
}

/** Sense and repair: what happened since the plan was last looked at. Small repairs apply by themselves when the autonomy setting allows. */
export async function runSync(userId: number): Promise<{ ctx: CompiledContext; candidate: PlanCandidate; applied: CommitOutcome | null; proposal: ProposalView | null }> {
  let ctx = await compileContext(userId);
  await persistTransitions(ctx).catch(() => undefined);
  let candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
  let applied: CommitOutcome | null = null;
  const pending = await openProposal(ctx.space.id);
  const modelChanged = JSON.stringify(ctx.model) !== JSON.stringify(ctx.space.workModel);
  if (!candidate.diff.empty || modelChanged) {
    const size = classifyChange(candidate, null, ctx.snapshot.today);
    const key = `repair:${ctx.space.version}:${keyFor(JSON.stringify(candidate.diff.changes.map((c) => [c.id, c.after])), JSON.stringify(ctx.model.items.map((i) => [i.key, i.status, i.done])))}`;
    if (candidate.verification.pass && (autoApplies(size, ctx.space.settings.autonomy) || (candidate.diff.empty && modelChanged))) {
      applied = await commitDirect(ctx, candidate, { key, source: "REPAIR", workflow: "repair", request: { size } }).catch(() => null);
      if (applied && !applied.replayed) { ctx = await compileContext(userId); candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair"); }
    } else if (candidate.verification.pass && !candidate.diff.empty && (!pending || pending.source === "REPAIR")) {
      await persistProposal(ctx, candidate, { key, source: "REPAIR", workflow: "repair", request: { size }, notes: [size === "infeasible" ? "Not everything fits any more. Review the options." : "Things changed since your plan was made."] }).catch(() => null);
    }
  }
  return { ctx, candidate, applied, proposal: await openProposal(ctx.space.id) };
}

export interface StudioState {
  readiness: ReturnType<typeof studioReadiness>;
  version: number;
  settings: CompiledContext["snapshot"]["settings"];
  snapshot: CompiledContext["snapshot"];
  model: WorkModel;
  blocks: Block[];
  plan: Omit<PlanCandidate["result"], "demand" | "stats"> & { quality: number; critics: PlanCandidate["verification"]["critics"] };
  proposal: ProposalView | null;
  signals: Signal[];
  history: Awaited<ReturnType<typeof history>>;
  lockedGoals: CompiledContext["lockedGoals"];
  facts: CompiledContext["facts"];
  calibrationNotes: Record<string, string>;
  repaired: { summary: string } | null;
  /** The student's latest answer to "Is this plan right?" for each goal, with its plan round. */
  feedback: Record<string, { round: number; verdict: string }>;
}

export async function loadState(userId: number, options: { sync: boolean } = { sync: true }): Promise<StudioState> {
  const { ctx, candidate, applied, proposal } = options.sync ? await runSync(userId) : await (async () => {
    const c = await compileContext(userId);
    return { ctx: c, candidate: propose(c.snapshot, { model: c.model, blocks: c.blocks }, c.model, null, undefined, "repair"), applied: null, proposal: await openProposal(c.space.id) };
  })();
  const subjectName = (id: number | null) => ctx.snapshot.subjects.find((s) => s.id === id)?.name ?? null;
  const calibrationNotes: Record<string, string> = {};
  for (const item of ctx.model.items) { const note = calibrationNote(item, ctx.snapshot.calibration, subjectName(item.subject)); if (note) calibrationNotes[item.key] = note; }
  const { demand: _demand, stats: _stats, ...plan } = candidate.result;
  void _demand; void _stats;
  return {
    readiness: studioReadiness(), version: ctx.space.version, settings: ctx.snapshot.settings, snapshot: ctx.snapshot, model: ctx.model, blocks: ctx.blocks,
    plan: { ...plan, quality: candidate.verification.quality, critics: candidate.verification.critics }, proposal,
    signals: computeSignals(ctx.snapshot, ctx.model, candidate.result, ctx.lastStudied, ctx.blocks), history: await history(userId), lockedGoals: ctx.lockedGoals,
    facts: ctx.facts, calibrationNotes, repaired: applied && !applied.replayed && applied.proposal.diff.changes.length ? { summary: applied.proposal.summary } : null,
    feedback: await feedbackFor(userId).catch(() => ({})),
  };
}

/** "Why is this here?" from the solver's trace, phrased in one sentence by the model when it is available. */
export async function runExplain(userId: number, input: { block: string; phrase?: boolean }, emit: Emit, signal?: AbortSignal): Promise<{ reasons: { code: string; text: string }[]; sentence: string | null; calibration: string | null }> {
  const ctx = await compileContext(userId);
  const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
  const reasons = candidate.result.reasons[input.block] ?? [];
  const block = ctx.blocks.find((b) => b.id === input.block) ?? candidate.result.blocks.find((b) => b.id === input.block);
  const item = block ? ctx.model.items.find((i) => i.key === block.item) : undefined;
  const calibration = item ? calibrationNote(item, ctx.snapshot.calibration, ctx.snapshot.subjects.find((s) => s.id === item.subject)?.name ?? null) : null;
  if (!input.phrase || !reasons.length) return { reasons, sentence: null, calibration };
  const sentence = await withModel(userId, "explain", async (ai) => {
    if (!ai) return null;
    const result = await callText({ userId, profile: "copy.explain", system: EXPLAIN_SYSTEM, user: `Session: ${item?.title ?? "Study session"} on ${block ? dayLabel(block.date) : ""}.\nReasons:\n${reasons.map((r) => `- ${r.text}`).join("\n")}`, signal, onDelta: (delta) => emit({ type: "text", delta }) }).catch(() => null);
    return result?.text ?? null;
  });
  return { reasons, sentence, calibration };
}

/** The daily brief: facts from the solver, phrased in one to three sentences. */
export async function runBrief(userId: number, emit: Emit, signal?: AbortSignal): Promise<string> {
  const ctx = await compileContext(userId);
  const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
  const title = (key: string) => ctx.model.items.find((i) => i.key === key)?.title ?? ctx.model.practices.find((p) => key.startsWith(`${p.key}@`))?.title ?? "Study";
  const today = candidate.result.blocks.filter((b) => b.date === ctx.snapshot.today && (b.state === "committed" || b.state === "proposed")).map((b) => ({ title: title(b.item), start: b.start, end: b.end }));
  const facts = { today, risks: candidate.result.risks.slice(0, 2).map((r) => r.text), planned: candidate.result.health.plannedMinutes, capacity: candidate.result.health.sustainableMinutes, nextExam: candidate.result.health.nextExam ? `${candidate.result.health.nextExam.title} on ${dayLabel(candidate.result.health.nextExam.due)}` : null };
  const fallback = today.length ? `${plural(today.length, "session")} today, starting with ${today[0].title}.${facts.risks[0] ? ` ${facts.risks[0]}` : ""}` : facts.risks[0] ?? "Nothing planned today. A good day to get ahead or rest.";
  return withModel(userId, "brief", async (ai) => {
    if (!ai) { emit({ type: "text", delta: fallback }); return fallback; }
    const result = await callText({ userId, profile: "copy.brief", system: BRIEF_SYSTEM, user: briefFacts(ctx.snapshot, facts), signal, onDelta: (delta) => emit({ type: "text", delta }) }).catch(() => null);
    if (!result) { emit({ type: "text", delta: fallback }); return fallback; }
    return result.text;
  });
}

/** Open questions ("am I on track for finals?") are answered from the planner's facts in one bounded call. */
export async function runQuestion(userId: number, input: { text: string }, emit: Emit, signal?: AbortSignal): Promise<string> {
  const ctx = await compileContext(userId);
  const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
  const goals = ctx.model.goals.filter((g) => g.status === "active").map((g) => {
    const items = ctx.model.items.filter((i) => i.goal === g.key);
    const done = items.filter((i) => i.status === "done").length;
    const short = candidate.result.shortages.filter((s) => s.items.some((k) => items.some((i) => i.key === k))).reduce((s, x) => s + x.short, 0);
    return `${g.title}: ${done}/${items.length} pieces done${g.due ? `, due ${dayLabel(g.due)}` : ""}${short ? `, ${formatMinutes(short)} short` : ", fits"}`;
  });
  const facts = [`Today ${dayLabel(ctx.snapshot.today)}.`, `This week: ${formatMinutes(candidate.result.health.plannedMinutes)} planned of ${formatMinutes(candidate.result.health.sustainableMinutes)} usually sustained.`, ...goals, ...candidate.result.risks.slice(0, 4).map((r) => r.text)].join("\n");
  return withModel(userId, "question", async (ai) => {
    if (!ai) { const text = `${goals.slice(0, 3).join(". ")}.`; emit({ type: "text", delta: text }); return text; }
    const result = await callText({ userId, profile: "assistant.answer", system: ANSWER_SYSTEM, user: `Facts from the planner:\n${facts}\n\nQuestion: ${wrapData(requestText(input.text, 400))}`, signal, onDelta: (delta) => emit({ type: "text", delta }) });
    return result.text;
  });
}

export { setBlockState };
