import "server-only";
import { deriveRemainingWorkV2, ExecutionTaskSpecV2Schema } from "../v2/contracts";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PlannerPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PlannerError } from "../errors";
import { boundedParse, ModelProposalV1Schema, validateDraft, type UserInputV1 } from "../contracts";
import { localToday } from "../dates";
import type { AvailabilitySnapshot } from "../capacity";
import { resolveCompletionCriteria, resolveMilestoneOutcome } from "../done";
import { normalizeRetrievalStamps } from "../retrieval";
import { validateRoadmapDraft } from "../roadmap-policy";
import type { FrozenItemView } from "../rebalance-policy";
import type { PlannerSemanticReview } from "../semantic";
import {
  periodSpecsFor,
  roadmapInput,
  type RoadmapDraft,
  type RoadmapInput,
} from "../roadmap-policy";
import type { ExpansionItem } from "../expansion-fields";
import type { ExpansionScope } from "../expansion-policy";

export type Tx = Prisma.TransactionClient;
export const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(Reflect.get(v, k))}`).join(",")}}`;
  return JSON.stringify(v);
}
export const digest = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");
export async function transaction<T>(userId: number, run: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        // Shared execution coordination comes before every Plan/Session/Quest lock.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(73641, ${userId}::int)::text`;
        return run(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (err) {
      // The app's dev Prisma hot-reload can load two runtime class identities.
      // Use the documented error codes rather than instanceof across that boundary.
      const error = err as { code?: string; meta?: { target?: string[]; modelName?: string; code?: string; driverAdapterError?: { cause?: { originalCode?: string; kind?: string; constraint?: { fields?: string[] } } } } };
      const sqlState = error?.meta?.code ?? error?.meta?.driverAdapterError?.cause?.originalCode;
      // A serializable snapshot can precede the advisory-lock wait. PostgreSQL
      // may surface a concurrent planner insert as a unique violation instead of 40001.
      const uniqueFields = error.meta?.target ?? error.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
      const plannerIdentityRace = error?.code === "P2002" && uniqueFields.some(field => /creationKey|operationKey|confirmationKey|sequence/.test(field));
      const retryable = plannerIdentityRace || error?.code === "P2034" || (error?.code === "P2010" && ["40001", "40P01"].includes(String(sqlState)));
      if (retryable && attempt < 2) continue;
      if (retryable) throw new PlannerError(409, "CONCURRENT_CHANGE");
      throw err;
    }
  }
}
export async function ownedPlan(tx: Tx, userId: number, id: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM "PlannerPlan" WHERE id = ${id}::uuid AND "userId" = ${userId} FOR UPDATE`;
  const plan = await tx.plannerPlan.findFirst({ where: { id, userId } });
  if (!plan) throw new PlannerError(404, "NOT_FOUND");
  return plan;
}
export function assertVersion(plan: PlannerPlan, version: number) {
  if (plan.contractVersion === 2) throw new PlannerError(409, "PLANNER_V2_PATH_REQUIRED");
  if (plan.state === "ARCHIVED" || plan.version !== version) throw new PlannerError(409, "STALE_PLAN");
}
export async function assertReferences(tx: Tx, userId: number, subjectId: number | null, goalId: number | null) {
  if (subjectId && !await tx.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } })) throw new PlannerError(404, "NOT_FOUND");
  if (goalId && !await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } })) throw new PlannerError(404, "NOT_FOUND");
}
/**
 * Loads the authoritative schedule snapshot. `window` narrows the range an
 * operation cares about: a selected-period expansion snapshots only its own period,
 * which keeps the payload small and stops one period from consuming another's
 * capacity. Exam and roadmap generation use the full horizon.
 */
export async function loadAvailability(tx: Tx, plan: PlannerPlan, input: UserInputV1, window?: { start: string; end: string }): Promise<AvailabilitySnapshot> {
  // No catch-and-default: every required query must succeed.
  const start = window?.start ?? input.startDate;
  const end = window?.end ?? input.endDate;
  const user = await tx.user.findUniqueOrThrow({ where: { id: plan.userId }, select: { timezone: true, restDays: true, dailyGoalMinutes: true } });
  try { localToday(user.timezone); } catch { throw new PlannerError(503, "SCHEDULE_UNAVAILABLE"); }
  await assertReferences(tx, plan.userId, plan.subjectId, plan.goalId);
  const floating = await tx.floatingRestDay.findMany({ where: { userId: plan.userId, dateKey: { gte: start, lte: end } }, orderBy: { dateKey: "asc" }, select: { dateKey: true } });
  const quests = await tx.quest.findMany({ where: { userId: plan.userId, scheduledFor: { gte: start, lte: end } }, orderBy: { id: "asc" }, include: { sessions: { select: { id: true, endedAt: true, durationSeconds: true, durationMinutes: true }, orderBy: { id: "asc" } } } });
  const links = await tx.plannerQuestLink.findMany({ where: { planId: plan.id }, orderBy: { itemKey: "asc" }, include: { quest: { include: { sessions: { select: { id: true, endedAt: true, durationSeconds: true }, orderBy: { id: "asc" } } } } } });
  const goal = plan.goalId ? await tx.goal.findUnique({ where: { id: plan.goalId } }) : null;
  return {
    schemaVersion: 1, timezone: user.timezone, restDays: [...user.restDays].sort(), floatingDates: floating.map(f => f.dateKey),
    existingWork: quests.map(q => ({ id: q.id, date: q.scheduledFor, minutes: q.plannerSpec ? deriveRemainingWorkV2(ExecutionTaskSpecV2Schema.parse(q.plannerSpec).effort, q.elapsedSeconds, q.remainingDisposition as "OPEN" | "WITHDRAWN" | "COMPLETED").remainingMinutesEstimate : q.requiredMinutes, status: q.status, fingerprint: digest(json(q)) })),
    lineageFingerprint: digest({ links: json(links), subjectId: plan.subjectId, goal: json(goal), dailyGoalMinutes: user.dailyGoalMinutes }),
  };
}
/**
 * Durable-identity control for a replan. A retained item keeps the identity — and the
 * Quest — it already has, so a confirmed replan writes nothing for it. Anything else
 * receives a fresh key, which is what keeps a superseded item from being recreated.
 */
export interface NormalizeIdentity {
  /** Durable key to use for a proposal ref instead of a fresh one. */
  keyFor?: (ref: string) => string | undefined;
  /** Called for every durable key issued, so a replan can map its own proposal. */
  onKey?: (ref: string, key: string) => void;
  /** Frozen executed history a replan draft is validated against. */
  frozen?: FrozenItemView[];
  /** Frozen milestones (draft currency) a strategic rebalance is validated against. */
  frozenMilestones?: Parameters<typeof validateRoadmapDraft>[2];
}

/**
 * Roadmap normalization. Periods are computed deterministically by the server, so
 * the model's `pN` tokens resolve to application-issued period keys and no bucket
 * boundary ever comes from model prose.
 */
export function normalizeRoadmapProposal(
  input: RoadmapInput,
  raw: unknown,
  review?: PlannerSemanticReview,
  identity?: NormalizeIdentity
) {
  const proposal = boundedParse(ModelProposalV1Schema, raw);
  if (proposal.mode !== "ROADMAP") throw new PlannerError(422, "MODE_MISMATCH");
  const refs = [...proposal.topics, ...proposal.milestones, ...proposal.items].map(v => v.ref);
  if (new Set(refs).size !== refs.length) throw new PlannerError(422, "DUPLICATE_REFERENCE");
  const keys = new Map(refs.map(ref => [ref, randomUUID()]));
  const key = (ref: string) => {
    const retained = identity?.keyFor?.(ref);
    const issued = retained ?? keys.get(ref);
    if (!issued) throw new PlannerError(422, "UNKNOWN_REFERENCE");
    identity?.onKey?.(ref, issued);
    return issued;
  };
  const specs = periodSpecsFor(input);
  const periodKeys = new Map(specs.map(spec => [spec.ref, randomUUID()]));
  const periodKey = (ref: string | undefined) => {
    if (!ref) throw new PlannerError(422, "UNKNOWN_PERIOD");
    const k = periodKeys.get(ref);
    if (!k) throw new PlannerError(422, "UNKNOWN_PERIOD");
    return k;
  };
  return validateDraft(input, {
    ...proposal,
    ...(review ? { semanticReview: review } : {}),
    topics: proposal.topics.map(({ ref, parentRef, ...t }) => ({ ...t, key: key(ref), parentKey: parentRef ? key(parentRef) : null, scopeRef: ref })),
    periods: specs.map(spec => ({ key: periodKeys.get(spec.ref)!, title: spec.title, granularity: spec.granularity, startDate: spec.startDate, endDate: spec.endDate, order: spec.order })),
    milestones: proposal.milestones.map(({ ref, periodRef, topicRefs, dependsOn, retainRef: _retainRef, ...m }) => ({
      ...m,
      key: key(ref),
      outcome: resolveMilestoneOutcome(m.outcome),
      periodKey: periodKey(periodRef),
      topicKeys: (topicRefs ?? []).map(key),
      dependsOn: (dependsOn ?? []).map(key),
    })),
    items: [],
  }, identity?.frozen ?? [], identity?.frozenMilestones ?? []);
}

/**
 * Expansion normalization. The strategic structure is copied verbatim from the
 * parent revision — same topics, milestones and periods, same keys — and only the
 * new actionable items receive fresh identities. A neighbouring period therefore
 * cannot change, because it is never rebuilt.
 */
export function normalizeExpansion(
  input: RoadmapInput,
  parent: RoadmapDraft,
  scope: ExpansionScope,
  items: ExpansionItem[],
  review?: PlannerSemanticReview,
  identity?: NormalizeIdentity
): RoadmapDraft {
  const topicKeyOf = new Map(scope.topics.map(topic => [topic.ref, topic.key]));
  const itemKeys = new Map(items.map(item => [item.ref, randomUUID()]));
  const itemKey = (ref: string) => {
    const retained = identity?.keyFor?.(ref);
    const issued = retained ?? itemKeys.get(ref);
    if (!issued) throw new PlannerError(422, "UNKNOWN_REFERENCE");
    identity?.onKey?.(ref, issued);
    return issued;
  };
  const draft = validateDraft(input, {
    schemaVersion: 1 as const,
    mode: "ROADMAP" as const,
    outcome: parent.outcome,
    assumptions: [],
    warnings: [],
    ...(review ? { semanticReview: review } : {}),
    topics: parent.topics,
    milestones: parent.milestones,
    periods: parent.periods ?? [],
    expansion: { milestoneKey: scope.milestoneKey },
    items: normalizeRetrievalStamps(
      items.map(({ ref, topicRef, relatedTopicRefs, dependsOn, ...item }) => {
        const topicKey = topicKeyOf.get(topicRef);
        if (!topicKey) throw new PlannerError(422, "EXPANSION_SCOPE_VIOLATION");
        return {
          ...item,
          key: itemKey(ref),
          topicKey,
          milestoneKey: scope.milestoneKey,
          dependsOn: dependsOn.map(itemKey),
          ...(relatedTopicRefs?.length ? { relatedTopicKeys: relatedTopicRefs.map(ref2 => { const k = topicKeyOf.get(ref2); if (!k) throw new PlannerError(422, "EXPANSION_SCOPE_VIOLATION"); return k; }) } : {}),
          completionCriteria: resolveCompletionCriteria({ type: item.type, minutes: item.minutes, completionCriteria: item.completionCriteria }).text,
        };
      }),
      () => randomUUID()
    ),
  }, identity?.frozen ?? [], identity?.frozenMilestones ?? []);
  if (draft.mode !== "ROADMAP") throw new PlannerError(422, "MODE_MISMATCH");
  return draft;
}

/** Provider refs exist only within this proposal. Every durable key is issued here. */
export function normalizeProposal(input: UserInputV1, raw: unknown, review?: PlannerSemanticReview, identity?: NormalizeIdentity) {
  if (input.mode === "ROADMAP" && input.roadmap)
    return normalizeRoadmapProposal(roadmapInput(input), raw, review, identity);
  const proposal = boundedParse(ModelProposalV1Schema, raw);
  const refs = [...proposal.topics, ...proposal.milestones, ...proposal.items].map(v => v.ref);
  if (new Set(refs).size !== refs.length) throw new PlannerError(422, "DUPLICATE_REFERENCE");
  const keys = new Map(refs.map(ref => [ref, randomUUID()]));
  const key = (ref: string) => {
    const retained = identity?.keyFor?.(ref);
    const issued = retained ?? keys.get(ref);
    if (!issued) throw new PlannerError(422, "UNKNOWN_REFERENCE");
    identity?.onKey?.(ref, issued);
    return issued;
  };
  return validateDraft(input, {
    ...proposal,
    ...(review ? { semanticReview: review } : {}),
    topics: proposal.topics.map(({ ref, parentRef, ...t }) => ({ ...t, key: key(ref), parentKey: parentRef ? key(parentRef) : null, ...(input.mode === "EXAM" || input.mode === "MASTERY" ? { scopeRef: ref } : {}) })),
    milestones: proposal.milestones.map(({ ref, ...m }) => ({ ...m, key: key(ref) })),
    // `retainRef` is a rebalance proposal token; the durable identity it resolves to
    // is recorded in the revision's rebalance metadata, never in the stored item.
    items: normalizeRetrievalStamps(
      proposal.items.map(({ ref, topicRef, milestoneRef, relatedTopicRefs, dependsOn, retainRef: _retainRef, ...i }) => ({
        ...i, key: key(ref), topicKey: key(topicRef), milestoneKey: milestoneRef ? key(milestoneRef) : null, dependsOn: dependsOn.map(key),
        // Definition of Done: a valid criterion is kept, anything else (including a
        // mastery claim or an invented official requirement) is replaced by the
        // bounded default for the intent, so bad text is never stored or shown.
        completionCriteria: resolveCompletionCriteria(i).text,
        ...(relatedTopicRefs ? { relatedTopicKeys: relatedTopicRefs.map(key) } : {}),
      })),
      () => randomUUID()
    ),
  }, identity?.frozen ?? [], identity?.frozenMilestones ?? []);
}
