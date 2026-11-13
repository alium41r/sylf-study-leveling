import "server-only";
// The plan store. Every change is an operation set with a source, a base version and an idempotency key; applying it creates a new plan version with
// a stored diff. A proposal is an unapplied version. Undo applies the inverse as a new version. Commits run inside the existing execution transaction
// (the per-student advisory lock every quest and reward write takes), re-check the base version and the calendar, and project the plan into Quests
// (the unit of work and reward), Goals and timed blocks. The planner never grants rewards: completion flows through the existing claims.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { executionTransaction } from "@/lib/execution-coordination";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "@/lib/difficulty-engine";
import { calculateSemanticScopeWeight } from "@/lib/ai/scope-evaluator";
import { GOAL_COLOR_TOKENS } from "@/lib/goal-theme";
import {
  addDays, calibratedEstimate, checkPlacement, diffDays, diffPlans, expandPractices, isFixed, propose, questDescription,
  type Block, type KGoal, type PlanCandidate, type PlanDiff, type SolveResult, type StudioSettings, type Verification, type WorkModel,
} from "../kernel";
import { compileContext, normalizeModel, type CompiledContext } from "./snapshot";
import { localInstant } from "./time";
import { studioVersions } from "./config";

/** A Sylf goal's description: what it covers when it was planned from a syllabus. */
export function goalDescription(goal: Pick<KGoal, "draft" | "syllabus">): string {
  const syllabus = goal.syllabus;
  if (!syllabus) return goal.draft ? "Planned with Sylf's Planning Studio from assumptions you can change." : "Planned with Sylf's Planning Studio.";
  const topics = syllabus.units.filter((u) => u.included).map((u) => u.title);
  return [syllabus.name, topics.length ? `Topics: ${topics.join(", ")}.` : null, "Planned with Sylf's Planning Studio."].filter(Boolean).join("\n").slice(0, 1000);
}

export class StudioError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail?: unknown) { super(message); }
}

export type VersionSource = "STUDENT" | "MODEL" | "REPAIR" | "SYSTEM" | "UNDO";
export interface ProposalMeta {
  key: string;
  source: VersionSource;
  workflow: string;
  request?: Record<string, unknown> | null;
  operations?: unknown[];
  interpretation?: string | null;
  strategy?: string | null;
  notes?: string[];
  trace?: Record<string, unknown>;
  servedModel?: string | null;
  undoOf?: string | null;
}

export interface ProposalView {
  id: string;
  state: string;
  workflow: string;
  source: VersionSource;
  summary: string;
  baseVersion: number;
  sequence: number | null;
  createdAt: string;
  diff: PlanDiff;
  verification: Pick<Verification, "pass" | "quality" | "checks" | "critics"> & { failures: number };
  interpretation: string | null;
  strategy: string | null;
  notes: string[];
  model: WorkModel;
  result: Omit<SolveResult, "demand" | "stats" | "kept">;
  trace: Record<string, unknown>;
}

const MAX_KEY = 120;
export function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 8 && key.length <= MAX_KEY && /^[A-Za-z0-9_:.-]+$/.test(key);
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const slimResult = (result: SolveResult): ProposalView["result"] => ({ blocks: result.blocks, weekBudgets: result.weekBudgets, unplaced: result.unplaced, shortages: result.shortages, days: result.days, reasons: result.reasons, risks: result.risks, health: result.health });

export function viewOf(row: { id: string; state: string; workflow: string; source: string; summary: string; baseVersion: number; sequence: number | null; createdAt: Date; diff: unknown; verification: unknown; request: unknown; workModel: unknown; result: unknown; trace: unknown }): ProposalView {
  const request = (row.request ?? {}) as { interpretation?: string; strategy?: string; notes?: string[] };
  const verification = row.verification as Verification;
  return {
    id: row.id, state: row.state, workflow: row.workflow, source: row.source as VersionSource, summary: row.summary, baseVersion: row.baseVersion, sequence: row.sequence,
    createdAt: row.createdAt.toISOString(), diff: row.diff as PlanDiff,
    verification: { pass: verification.pass, quality: verification.quality, checks: verification.checks, critics: verification.critics, failures: verification.failures?.length ?? 0 },
    interpretation: request.interpretation ?? null, strategy: request.strategy ?? null, notes: request.notes ?? [],
    model: normalizeModel(row.workModel), result: row.result as ProposalView["result"], trace: (row.trace ?? {}) as Record<string, unknown>,
  };
}

/** Stores a candidate as a proposal. A repeated key returns the stored proposal; only one proposal is open at a time. */
export async function persistProposal(ctx: CompiledContext, candidate: PlanCandidate, meta: ProposalMeta): Promise<ProposalView> {
  if (!validKey(meta.key)) throw new StudioError(400, "INVALID_KEY", "Each request needs a key of 8–120 letters, digits, _ : . or -.");
  const existing = await prisma.planVersion.findUnique({ where: { spaceId_key: { spaceId: ctx.space.id, key: meta.key } } });
  if (existing) return viewOf(existing);
  const row = await prisma.$transaction(async (tx) => {
    await tx.planVersion.updateMany({ where: { spaceId: ctx.space.id, state: "PROPOSED" }, data: { state: "SUPERSEDED" } });
    return tx.planVersion.create({ data: versionData(ctx, candidate, meta, "PROPOSED") });
  });
  return viewOf(row);
}

function versionData(ctx: CompiledContext, candidate: PlanCandidate, meta: ProposalMeta, state: "PROPOSED" | "COMMITTED", sequence?: number) {
  return {
    spaceId: ctx.space.id, userId: ctx.userId, state, source: meta.source, workflow: meta.workflow, baseVersion: ctx.space.version, key: meta.key,
    requestHash: hash({ workflow: meta.workflow, request: meta.request ?? null, ops: meta.operations ?? [] }),
    request: json({ ...(meta.request ?? {}), interpretation: meta.interpretation ?? null, strategy: meta.strategy ?? null, notes: meta.notes ?? [] }),
    operations: json(meta.operations ?? []), workModel: json(candidate.model), result: json(slimResult(candidate.result)), diff: json(candidate.diff),
    summary: candidate.diff.summary.slice(0, 300), verification: json(candidate.verification), trace: json({ ...(meta.trace ?? {}), solver: candidate.result.stats }),
    versions: json(studioVersions(meta.servedModel)), undoOf: meta.undoOf ?? null,
    ...(state === "COMMITTED" ? { sequence, committedAt: new Date(), commitKey: meta.key } : {}),
  };
}

const notStarted = (quest: { status: string; elapsedSeconds: number; sessions: number }) => (quest.status === "ACTIVE" || quest.status === "PENDING") && quest.elapsedSeconds === 0 && quest.sessions === 0;
const open = (quest: { status: string }) => quest.status === "ACTIVE" || quest.status === "PENDING" || quest.status === "IN_PROGRESS";

/**
 * Projects a plan into Sylf inside the caller's transaction: Goals for new goals, a Quest per scheduled work item (dated to its next block), practice
 * occurrences for the coming week, and the timed blocks. Started quests only ever move date; finished history is never touched.
 */
async function project(tx: Prisma.TransactionClient, ctx: CompiledContext, model: WorkModel, blocks: Block[], version: number) {
  const { snapshot, userId } = ctx;
  const today = snapshot.today;
  const stats = { goalsCreated: 0, questsCreated: 0, questsUpdated: 0, questsReleased: 0 };
  const subjects = new Set(snapshot.subjects.map((s) => s.id));
  const topics = new Map(snapshot.topics.map((t) => [t.id, t]));

  // Goals.
  for (const [index, goal] of model.goals.entries()) {
    if (goal.status !== "active" || goal.ref != null) continue;
    if (!model.items.some((i) => i.goal === goal.key) && !model.practices.some((p) => p.goal === goal.key)) continue;
    const weeks = goal.due ? Math.max(1, Math.min(52, Math.ceil((diffDays(goal.due, today) + 1) / 7))) : 4;
    const created = await tx.goal.create({ data: { userId, title: goal.title.slice(0, 200), targetWeeks: weeks, targetDate: goal.due ? new Date(`${goal.due}T00:00:00.000Z`) : null, color: GOAL_COLOR_TOKENS[index % GOAL_COLOR_TOKENS.length], description: goalDescription(goal) } });
    goal.ref = created.id;
    stats.goalsCreated++;
  }
  const goalRef = new Map(model.goals.map((g) => [g.key, g]));

  // Current links, locked for this transaction.
  const links = await tx.planItemQuest.findMany({ where: { spaceId: ctx.space.id }, select: { id: true, itemKey: true, questId: true } });
  const questIds = links.map((l) => l.questId).filter((id): id is number => id != null);
  if (questIds.length) await tx.$queryRaw`SELECT id FROM "Quest" WHERE id = ANY(${questIds}::int[]) AND "userId" = ${userId} ORDER BY id FOR UPDATE`;
  const quests = new Map((await tx.quest.findMany({ where: { id: { in: questIds }, userId }, select: { id: true, status: true, elapsedSeconds: true, scheduledFor: true, _count: { select: { sessions: true } } } })).map((q) => [q.id, { ...q, sessions: q._count.sessions }]));
  const linkByItem = new Map(links.map((l) => [l.itemKey, l]));
  const live = (b: Block) => b.date >= today && (b.state === "committed" || b.state === "proposed");
  const blocksByItem = new Map<string, Block[]>();
  for (const block of blocks.filter(live)) blocksByItem.set(block.item, [...(blocksByItem.get(block.item) ?? []), block]);
  for (const list of blocksByItem.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  const items = [...model.items, ...expandPractices(model, snapshot).filter((p) => p.due! <= addDays(today, 6))];
  const questOf = new Map<string, number>();
  for (const item of items) {
    const virtual = item.key.includes("@");
    const link = linkByItem.get(item.key);
    const quest = link?.questId != null ? quests.get(link.questId) : undefined;
    const next = blocksByItem.get(item.key)?.[0];
    const release = async () => {
      if (quest && notStarted(quest)) {
        await tx.quest.delete({ where: { id: quest.id } });
        await tx.planItemQuest.update({ where: { id: link!.id }, data: { questId: null, releasedAt: new Date() } });
        stats.questsReleased++;
      }
    };
    if (item.status !== "open" || !next) { await release(); if (quest && !notStarted(quest)) questOf.set(item.key, quest.id); continue; }
    const goal = item.goal ? goalRef.get(item.goal) : undefined;
    const [p50] = calibratedEstimate(item, snapshot.calibration);
    const minutes = Math.max(15, Math.min(240, virtual ? item.est[0] : p50));
    const difficulty = calculateRecommendedDifficulty(minutes, item.kind, undefined, item.due ? Math.max(0, diffDays(item.due, today)) : undefined);
    const rewards = calculateQuestRewards(minutes, difficulty);
    const subjectId = item.subject != null && subjects.has(item.subject) ? item.subject : null;
    const node = item.topics.map((t) => topics.get(t)).find((t) => t && t.subject === subjectId);
    const description = questDescription(item);
    if (quest && open(quest)) {
      if (notStarted(quest)) {
        await tx.quest.update({ where: { id: quest.id }, data: { title: item.title, description, requiredMinutes: minutes, targetMinutes: minutes, difficulty, xpReward: rewards.xp, sylphReward: rewards.sylph, scheduledFor: next.date, subjectId, subjectNodeId: node?.id ?? null, goalId: goal?.ref ?? null } });
      } else if (quest.scheduledFor !== next.date) {
        await tx.quest.update({ where: { id: quest.id }, data: { scheduledFor: next.date } });
      }
      questOf.set(item.key, quest.id);
      stats.questsUpdated++;
      continue;
    }
    const scopeWeight = node ? calculateSemanticScopeWeight({ nodeTitle: node.title, nodeDescription: "", nodeTier: 1, questTitle: item.title, planDescription: description ?? "", targetMinutes: minutes }).scopeWeight : 0.25;
    const created = await tx.quest.create({ data: { userId, title: item.title, description, requiredMinutes: minutes, targetMinutes: minutes, difficulty, xpReward: rewards.xp, sylphReward: rewards.sylph, scheduledFor: next.date, status: "ACTIVE", subjectId, subjectNodeId: node?.id ?? null, goalId: goal?.ref ?? null, scopeWeight, createdByAi: item.source === "model" || item.source === "template" } });
    if (link) await tx.planItemQuest.update({ where: { id: link.id }, data: { questId: created.id, releasedAt: null } });
    else await tx.planItemQuest.create({ data: { spaceId: ctx.space.id, userId, itemKey: item.key, questId: created.id, createdVersion: version } });
    questOf.set(item.key, created.id);
    stats.questsCreated++;
  }
  // Items that left the model entirely release their quests too.
  for (const link of links) {
    if (items.some((i) => i.key === link.itemKey) || link.questId == null) continue;
    const quest = quests.get(link.questId);
    if (quest && notStarted(quest) && !(link.itemKey.includes("@") && link.itemKey.split("@")[1] < today)) {
      await tx.quest.delete({ where: { id: quest.id } });
      await tx.planItemQuest.update({ where: { id: link.id }, data: { questId: null, releasedAt: new Date() } });
      stats.questsReleased++;
    }
  }
  for (const item of model.items) item.questId = questOf.get(item.key) ?? (item.status === "open" ? null : item.questId);

  // Blocks: future movable blocks are replaced; history (done, missed, skipped, past) stays.
  const current = await tx.planBlock.findMany({ where: { spaceId: ctx.space.id, removedVersion: null }, select: { id: true, blockKey: true, localDate: true, startMinute: true, state: true } });
  const keep = new Map(blocks.map((b) => [b.id, b]));
  for (const row of current) {
    const next = keep.get(row.blockKey);
    const history = row.state !== "COMMITTED" || row.localDate < today || (row.localDate === today && row.startMinute < snapshot.nowMinute);
    if (!next) { if (!history) await tx.planBlock.update({ where: { id: row.id }, data: { removedVersion: version } }); continue; }
  }
  const currentKeys = new Map(current.map((r) => [r.blockKey, r]));
  for (const block of blocks) {
    if (block.date < addDays(today, -7)) continue;
    const row = currentKeys.get(block.id);
    const data = {
      itemKey: block.item, questId: questOf.get(block.item) ?? null, localDate: block.date, startMinute: block.start, endMinute: block.end,
      startsAt: localInstant(snapshot.timezone, block.date, block.start), endsAt: localInstant(snapshot.timezone, block.date, block.end),
      state: block.state === "proposed" ? "COMMITTED" : block.state.toUpperCase(), pinned: block.pinned,
    };
    if (row) await tx.planBlock.update({ where: { id: row.id }, data });
    else await tx.planBlock.create({ data: { ...data, spaceId: ctx.space.id, userId, blockKey: block.id, createdVersion: version } });
  }
  return { stats, questOf };
}

export interface CommitOutcome { version: number; proposal: ProposalView; stats: Record<string, number>; replayed: boolean }

async function commitCandidate(ctx: CompiledContext, candidate: PlanCandidate, meta: ProposalMeta, proposalId: string | null): Promise<CommitOutcome> {
  return executionTransaction(ctx.userId, async (tx) => {
    const [space] = await tx.$queryRaw<{ id: string; version: number }[]>`SELECT id, version FROM "PlanningSpace" WHERE "userId" = ${ctx.userId} FOR UPDATE`;
    if (!space) throw new StudioError(404, "NO_PLAN", "There is no plan yet.");
    const replay = await tx.planVersion.findFirst({ where: { spaceId: space.id, OR: [{ key: meta.key, state: "COMMITTED" }, { commitKey: meta.key }] } });
    if (replay) return { version: space.version, proposal: viewOf(replay), stats: {}, replayed: true };
    if (space.version !== ctx.space.version) throw new StudioError(409, "STALE", "Your plan changed while this was being prepared.");
    // The calendar must not be mid-change while a plan is published over it.
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(73642, ${ctx.userId}::int) AS locked`;
    if (!locked) throw new StudioError(409, "CALENDAR_BUSY", "Your calendar is changing. Try again in a moment.");
    const next = space.version + 1;
    const model: WorkModel = JSON.parse(JSON.stringify(candidate.model));
    const blocks = candidate.result.blocks.map((b) => (b.state === "proposed" ? { ...b, state: "committed" as const } : b));
    const { stats } = await project(tx, ctx, model, blocks, next);
    for (const t of ctx.transitions) await tx.planBlock.updateMany({ where: { spaceId: space.id, blockKey: t.key, removedVersion: null, state: "COMMITTED" }, data: { state: t.state.toUpperCase() } });
    const committedCandidate: PlanCandidate = { ...candidate, model, result: { ...candidate.result, blocks } };
    let row;
    if (proposalId) {
      await tx.planVersion.updateMany({ where: { spaceId: space.id, state: "PROPOSED", NOT: { id: proposalId } }, data: { state: "SUPERSEDED" } });
      // A committed version keeps the reviewed content and records the quests it produced in the space's work model.
      row = await tx.planVersion.update({ where: { id: proposalId }, data: { state: "COMMITTED", sequence: next, committedAt: new Date(), commitKey: meta.key } });
    } else {
      // A direct edit or repair leaves an open proposal open: accepting it later re-solves it on top of this version.
      row = await tx.planVersion.create({ data: versionData({ ...ctx, space: { ...ctx.space, version: space.version } }, committedCandidate, meta, "COMMITTED", next) });
    }
    await tx.planningSpace.update({ where: { id: space.id }, data: { version: next, workModel: json(model), calibration: json(ctx.snapshot.calibration), ...(meta.source === "REPAIR" ? { lastRepairAt: new Date() } : {}) } });
    return { version: next, proposal: viewOf(row), stats, replayed: false };
  });
}

/** Commits a candidate without review: the student's own direct edits, and repairs their autonomy setting allows. */
export async function commitDirect(ctx: CompiledContext, candidate: PlanCandidate, meta: ProposalMeta): Promise<CommitOutcome> {
  if (!validKey(meta.key)) throw new StudioError(400, "INVALID_KEY", "Each request needs a key.");
  if (!candidate.verification.pass) throw new StudioError(422, "VERIFICATION_FAILED", "That change would break the plan's rules.", candidate.verification.failures);
  return commitCandidate(ctx, candidate, meta, null);
}

/**
 * Accepts a reviewed proposal. Before anything is written the proposal's placements are checked against the world as it is now; if the plan moved
 * on or the calendar changed, the proposal is re-solved and returned for review instead of applied blindly.
 */
export async function acceptProposal(userId: number, proposalId: string, key: string): Promise<{ committed: CommitOutcome | null; rebased: ProposalView | null }> {
  if (!validKey(key)) throw new StudioError(400, "INVALID_KEY", "Each request needs a key.");
  const ctx = await compileContext(userId);
  const row = await prisma.planVersion.findFirst({ where: { id: proposalId, spaceId: ctx.space.id } });
  if (!row) throw new StudioError(404, "NOT_FOUND", "That proposal no longer exists.");
  if (row.state === "COMMITTED") return { committed: { version: ctx.space.version, proposal: viewOf(row), stats: {}, replayed: true }, rebased: null };
  if (row.state !== "PROPOSED") throw new StudioError(409, "PROPOSAL_CLOSED", "That proposal was replaced by a newer one.");
  const proposal = viewOf(row);
  const fresh = row.baseVersion === ctx.space.version;
  const placement = fresh ? checkPlacement(ctx.snapshot, proposal.model, proposal.result.blocks, ctx.blocks) : null;
  if (fresh && placement && placement.length === 0) {
    const candidate: PlanCandidate = { model: proposal.model, result: { ...proposal.result, demand: [], kept: [], stats: { items: 0, placed: 0, ms: 0, iterations: 0 } }, verification: row.verification as unknown as Verification, diff: proposal.diff };
    return { committed: await commitCandidate(ctx, candidate, { key, source: row.source as VersionSource, workflow: row.workflow }, row.id), rebased: null };
  }
  // Rebase: the same operations on today's plan, solved against today's calendar.
  const rebasedModel = rebaseModel(ctx.model, proposal.model);
  const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, rebasedModel);
  const rebased = await persistProposal(ctx, candidate, { key: `${key}.rebase`, source: row.source as VersionSource, workflow: row.workflow, request: (row.request ?? {}) as Record<string, unknown>, operations: row.operations as unknown[], interpretation: proposal.interpretation, strategy: proposal.strategy, notes: [...proposal.notes, "Your week changed while you were reviewing, so this was re-planned."] });
  return { committed: null, rebased };
}

/** Carries a proposal's intent onto a newer committed model: its goals, items, practices and rules, with today's progress. */
export function rebaseModel(current: WorkModel, proposed: WorkModel): WorkModel {
  const model: WorkModel = JSON.parse(JSON.stringify(proposed));
  const now = new Map(current.items.map((i) => [i.key, i]));
  for (const item of model.items) {
    const live = now.get(item.key);
    if (live) { item.done = live.done; item.questId = live.questId; if (live.status !== "open") item.status = live.status; }
  }
  for (const item of current.items) if (!model.items.some((i) => i.key === item.key)) model.items.push(item);
  for (const goal of current.goals) {
    const match = model.goals.find((g) => g.key === goal.key);
    if (!match) model.goals.push(goal); else if (goal.ref != null) match.ref = goal.ref;
  }
  return model;
}

/** The model an undo restores: the target's intent with today's progress; studied work that the target did not have stays as history. */
export function undoModel(current: WorkModel, target: WorkModel): WorkModel {
  const model: WorkModel = JSON.parse(JSON.stringify(target));
  const now = new Map(current.items.map((i) => [i.key, i]));
  for (const item of model.items) {
    const live = now.get(item.key);
    if (live) { item.done = live.done; item.questId = live.questId; if (live.status === "done") item.status = "done"; }
  }
  for (const item of current.items) if (!model.items.some((i) => i.key === item.key) && (item.done > 0 || item.status === "done")) model.items.push({ ...item, status: item.status === "done" ? "done" : "dropped" });
  for (const goal of model.goals) { const live = current.goals.find((g) => g.key === goal.key); if (live?.ref != null) goal.ref = live.ref; }
  for (const goal of current.goals) if (!model.goals.some((g) => g.key === goal.key) && goal.source === "import") model.goals.push(goal);
  return model;
}

export async function discardProposal(userId: number, proposalId: string): Promise<void> {
  const space = await prisma.planningSpace.findUnique({ where: { userId }, select: { id: true } });
  if (!space) return;
  await prisma.planVersion.updateMany({ where: { id: proposalId, spaceId: space.id, state: "PROPOSED" }, data: { state: "DISCARDED" } });
}

/** Undo: the plan as it was before the latest committed version, carried onto today, as a new committed version. */
export async function undoLatest(userId: number, key: string): Promise<CommitOutcome> {
  if (!validKey(key)) throw new StudioError(400, "INVALID_KEY", "Each request needs a key.");
  const ctx = await compileContext(userId);
  const replay = await prisma.planVersion.findUnique({ where: { spaceId_key: { spaceId: ctx.space.id, key } } });
  if (replay?.state === "COMMITTED") return { version: ctx.space.version, proposal: viewOf(replay), stats: {}, replayed: true };
  if (ctx.space.version === 0) throw new StudioError(409, "NOTHING_TO_UNDO", "There is nothing to undo yet.");
  const latest = await prisma.planVersion.findFirst({ where: { spaceId: ctx.space.id, sequence: ctx.space.version } });
  const previous = ctx.space.version > 1 ? await prisma.planVersion.findFirst({ where: { spaceId: ctx.space.id, sequence: ctx.space.version - 1 } }) : null;
  const target = latest?.source === "UNDO" && latest.undoOf ? await prisma.planVersion.findFirst({ where: { id: latest.undoOf } }) : previous;
  const targetModel = target ? normalizeModel(target.workModel) : { ...normalizeModel(null), goals: ctx.model.goals.filter((g) => g.source === "import") };
  const model = undoModel(ctx.model, targetModel);
  const targetBlocks = target ? ((target.result as { blocks?: Block[] }).blocks ?? []) : [];
  // History stays as it happened; pins and placements come back from the version being restored.
  const history = ctx.blocks.filter((b) => isFixed({ ...b, pinned: false }, ctx.snapshot));
  const restored = [...history, ...targetBlocks.filter((b) => !isFixed({ ...b, state: "committed", pinned: false }, ctx.snapshot) && (b.state === "committed" || b.state === "proposed") && !history.some((f) => f.id === b.id)).map((b) => ({ ...b, state: "committed" as const }))];
  // Solve with the restored blocks as the previous plan: the stability term keeps them where they were wherever they still fit.
  const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: restored }, model);
  const diff = diffPlans({ model: ctx.model, blocks: ctx.blocks }, { model, blocks: candidate.result.blocks }, ctx.snapshot.today);
  return commitCandidate(ctx, { ...candidate, diff }, { key, source: "UNDO", workflow: "undo", undoOf: latest?.id ?? null }, null);
}

export async function updateSettings(userId: number, patch: Partial<StudioSettings>): Promise<void> {
  const space = await prisma.planningSpace.findUnique({ where: { userId } });
  if (!space) throw new StudioError(404, "NO_PLAN", "There is no plan yet.");
  const current = space.settings as unknown as StudioSettings;
  const minute = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1440, Math.round(v / 5) * 5)) : fallback);
  const next: StudioSettings = {
    ...current,
    dayStart: minute(patch.dayStart, current.dayStart), dayEnd: minute(patch.dayEnd, current.dayEnd),
    dailyCap: typeof patch.dailyCap === "number" ? Math.max(30, Math.min(720, Math.round(patch.dailyCap / 5) * 5)) : current.dailyCap,
    breakMinutes: typeof patch.breakMinutes === "number" ? Math.max(0, Math.min(30, Math.round(patch.breakMinutes / 5) * 5)) : current.breakMinutes,
    transitionBuffer: typeof patch.transitionBuffer === "number" ? Math.max(0, Math.min(45, Math.round(patch.transitionBuffer / 5) * 5)) : current.transitionBuffer,
    dayOnly: typeof patch.dayOnly === "boolean" ? patch.dayOnly : current.dayOnly,
    horizonDays: typeof patch.horizonDays === "number" ? Math.max(7, Math.min(21, Math.round(patch.horizonDays))) : current.horizonDays,
    autonomy: patch.autonomy && ["ASK", "SMART", "AUTOPILOT"].includes(patch.autonomy) ? patch.autonomy : current.autonomy,
  };
  if (next.dayEnd - next.dayStart < 60) throw new StudioError(400, "INVALID_SETTINGS", "Leave at least an hour between the start and end of your study day.");
  await prisma.planningSpace.update({ where: { id: space.id }, data: { settings: json(next), autonomy: next.autonomy } });
}

export async function history(userId: number, take = 12) {
  const space = await prisma.planningSpace.findUnique({ where: { userId }, select: { id: true } });
  if (!space) return [];
  const rows = await prisma.planVersion.findMany({ where: { spaceId: space.id, state: "COMMITTED" }, orderBy: { sequence: "desc" }, take, select: { id: true, sequence: true, source: true, workflow: true, summary: true, committedAt: true } });
  return rows.map((r) => ({ id: r.id, sequence: r.sequence, source: r.source, workflow: r.workflow, summary: r.summary, at: r.committedAt?.toISOString() ?? null }));
}

export async function openProposal(spaceId: string): Promise<ProposalView | null> {
  const row = await prisma.planVersion.findFirst({ where: { spaceId, state: "PROPOSED" }, orderBy: { createdAt: "desc" } });
  return row ? viewOf(row) : null;
}

/** Persists block transitions the compiler found (done or missed) without a new version. */
export async function persistTransitions(ctx: CompiledContext): Promise<void> {
  if (!ctx.transitions.length) return;
  await prisma.$transaction(ctx.transitions.map((t) => prisma.planBlock.updateMany({ where: { spaceId: ctx.space.id, blockKey: t.key, removedVersion: null, state: "COMMITTED" }, data: { state: t.state.toUpperCase() } })));
}

/** Marks a block skipped or done by the student: history the solver will not move. */
export async function setBlockState(userId: number, blockKey: string, state: "SKIPPED" | "DONE" | "COMMITTED"): Promise<void> {
  const space = await prisma.planningSpace.findUnique({ where: { userId }, select: { id: true } });
  if (!space) throw new StudioError(404, "NO_PLAN", "There is no plan yet.");
  const updated = await prisma.planBlock.updateMany({ where: { spaceId: space.id, blockKey, removedVersion: null }, data: { state } });
  if (!updated.count) throw new StudioError(404, "NOT_FOUND", "That session is no longer in your plan.");
}
