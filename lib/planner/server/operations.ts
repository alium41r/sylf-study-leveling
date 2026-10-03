import "server-only";
import { z } from "zod";
import { reserveRevisionQuota, settleRevisionQuota, type QuotaReservationReceipt } from "@/lib/ai/usage-limiter";
import { boundedParse, KeySchema, LIMITS, OperationKeySchema, UserInputV1Schema, ValidatedDraftV1Schema } from "../contracts";
import { PlannerError } from "../errors";
import { assertVersion, digest, json, loadAvailability, normalizeExpansion, normalizeProposal, ownedPlan, transaction, type Tx } from "./core";
import { validateCapacity } from "../capacity";
import { constraintCapacityInput, examFeasibility, examInput, validateExamProposal } from "../exam-policy";
import { ModelProposalV1Schema } from "../contracts";
import type { AvailabilitySnapshot } from "../capacity";
import { localToday } from "../dates";
import type { PlannerSemanticReview } from "../semantic";
import {
  expansionScope,
  validateExpansionItems,
} from "../expansion-policy";
import {
  roadmapInput,
  roadmapStructureForComparison,
  type RoadmapDraft,
  type RoadmapInput,
} from "../roadmap-policy";
import type { ExpansionItem } from "../expansion-fields";

/** The transient acquired flag belongs only to the transaction that reserved this operation. */
export async function beginOperation(userId: number, planId: string, raw: unknown, now = new Date()) {
  KeySchema.parse(planId);
  const body = boundedParse(z.strictObject({ operationKey: OperationKeySchema, expectedVersion: z.number().int().nonnegative(), input: UserInputV1Schema }), raw);
  boundedParse(UserInputV1Schema, body.input, LIMITS.inputBytes);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const prior = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey: body.operationKey } } });
    if (prior) { if (prior.operationHash !== digest(body)) throw new PlannerError(409, "IDEMPOTENCY_MISMATCH"); return { ...prior, acquired: false }; }
    assertVersion(plan, body.expectedVersion);
    if (plan.activeRevisionId) throw new PlannerError(409, "REPLANNING_NOT_ENABLED");
    if (body.input.mode !== plan.mode) throw new PlannerError(422, "MODE_MISMATCH");
    const availability = await loadAvailability(tx, plan, body.input);
    if (body.input.mode === "EXAM" && body.input.exam) {
      examInput(body.input);
      if (body.input.startDate < localToday(availability.timezone, now)) throw new PlannerError(422, "PAST_DATE");
      const feasibility = examFeasibility(body.input, availability);
      if (feasibility.status !== "POTENTIAL_FIT") throw new PlannerError(422, "EXAM_INFEASIBLE");
    }
    const last = await tx.plannerRevision.aggregate({ where: { planId }, _max: { sequence: true } });
    const operation = await tx.plannerRevision.create({ data: { planId, sequence: (last._max.sequence ?? 0) + 1, source: "GENERATE", baseVersion: plan.version, baseRevisionId: plan.latestDraftRevisionId ?? plan.activeRevisionId,
      inputSnapshot: json(body.input), availabilitySnapshot: json(availability), operationKey: body.operationKey, operationHash: digest(body), leaseExpiresAt: new Date(now.getTime() + 120000) } });
    const quota = await reserveRevisionQuota(tx, userId, operation.id, "planner", now);
    if (!quota) throw new PlannerError(429, "QUOTA_EXHAUSTED");
    return { ...await tx.plannerRevision.findUniqueOrThrow({ where: { id: operation.id } }), acquired: true };
  });
}
/** Atomically deliver a sealed result and settle its product charge. */
export async function finishOperation(userId: number, planId: string, key: string, proposal: unknown, now = new Date(), signal?: AbortSignal, review?: PlannerSemanticReview) {
  KeySchema.parse(planId); OperationKeySchema.parse(key);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const op = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey: key } } });
    if (!op) throw new PlannerError(404, "NOT_FOUND");
    if (op.operationState === "SEALED") return op;
    if (op.operationState !== "PREPARING" || !op.leaseExpiresAt || op.leaseExpiresAt <= now) throw new PlannerError(409, "OPERATION_EXPIRED");
    assertVersion(plan, op.baseVersion);
    const input = boundedParse(UserInputV1Schema, op.inputSnapshot, LIMITS.inputBytes);
    signal?.throwIfAborted();
    if (input.mode === "EXAM" && input.exam) {
      examInput(input);
      validateExamProposal(input, boundedParse(ModelProposalV1Schema, proposal), op.availabilitySnapshot as unknown as AvailabilitySnapshot);
    }
    const draft = normalizeProposal(input, proposal, review);
    const availability = await loadAvailability(tx, plan, input);
    if (digest(availability) !== digest(op.availabilitySnapshot)) throw new PlannerError(409, "SCHEDULE_CHANGED");
    if (draft.items.some(i => i.date < localToday(availability.timezone, now))) throw new PlannerError(422, "PAST_DATE");
    if (!validateCapacity(constraintCapacityInput(input), availability, draft.items).feasible) throw new PlannerError(422, "INFEASIBLE_CAPACITY");
    signal?.throwIfAborted();
    const quota = await settleRevisionQuota(tx, userId, op.id, "SETTLED", now);
    const sealed = await tx.plannerRevision.update({ where: { id: op.id }, data: { operationState: "SEALED", outputSnapshot: json(draft), digest: digest({ schemaVersion: 1, input, availability, draft }), sealedAt: now, quotaReceipt: json(quota) } });
    await tx.plannerPlan.update({ where: { id: planId }, data: { latestDraftRevisionId: op.id, version: { increment: 1 } } });
    signal?.throwIfAborted();
    return sealed;
  });
}
export async function recoverOperation(userId: number, planId: string, key: string, expire = false, kind: "operation" | "confirmation" = "operation", now = new Date()) {
  KeySchema.parse(planId); OperationKeySchema.parse(key);
  return transaction(userId, async tx => {
    await ownedPlan(tx, userId, planId, true);
    let op = await tx.plannerRevision.findFirst({ where: { planId, ...(kind === "operation" ? { operationKey: key } : { confirmationKey: key }) } });
    if (!op) throw new PlannerError(404, "NOT_FOUND");
    if (expire && op.operationState === "PREPARING" && op.leaseExpiresAt && op.leaseExpiresAt <= now) {
      const receipt = op.quotaReceipt as unknown as QuotaReservationReceipt | null;
      const quota = receipt ? await settleRevisionQuota(tx, userId, op.id, "RELEASED", now) : null;
      op = await tx.plannerRevision.update({ where: { id: op.id }, data: { operationState: "FAILED", ...(quota ? { quotaReceipt: json(quota) } : {}) } });
    }
    return { id: op.id, state: op.operationState, digest: op.digest, leaseExpiresAt: op.leaseExpiresAt, quotaState: (op.quotaReceipt as unknown as QuotaReservationReceipt | null)?.state ?? null, confirmationReceipt: op.confirmationReceipt };
  });
}

/** A terminal transition and its refund are serialized with sealing and recovery. */
export async function stopOperation(userId: number, planId: string, key: string, state: "FAILED" | "CANCELLED", now = new Date()) {
  // Refund an already reserved operation even if the gate switches off mid-flight.
  KeySchema.parse(planId); OperationKeySchema.parse(key);
  return transaction(userId, async tx => {
    await ownedPlan(tx, userId, planId, true);
    const op = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey: key } } });
    if (!op) throw new PlannerError(404, "NOT_FOUND");
    if (op.operationState !== "PREPARING") return op;
    const quota = await settleRevisionQuota(tx, userId, op.id, "RELEASED", now);
    return tx.plannerRevision.update({ where: { id: op.id }, data: { operationState: state, quotaReceipt: json(quota) } });
  });
}

/** Bounded projection of a plan's expansion lineage: key + confirmation only. */
interface ExpansionLineageRow {
  id: string;
  sequence: number;
  confirmed: boolean;
  milestone: string | null;
  state: string;
  leaseExpiresAt: Date | null;
}

/**
 * The authoritative "has this milestone already been expanded?" check.
 *
 * It reads confirmed EXPAND revisions, NOT Quest links. A period whose Quests were
 * later edited (DETACHED) or deleted (tombstoned) has still been expanded: the
 * write-once confirmation receipt makes that permanent, so the planner can never
 * quietly regenerate work the user already has or deliberately removed.
 *
 * Only the milestone key and a boolean are projected, so this stays cheap even
 * though the keys live inside bounded JSON snapshots.
 */
export async function expansionLineage(tx: Tx, planId: string, milestoneKey: string) {
  const rows = await tx.$queryRaw<ExpansionLineageRow[]>`
    SELECT id, sequence,
           ("confirmationReceipt" IS NOT NULL) AS confirmed,
           ("outputSnapshot"->'expansion'->>'milestoneKey') AS milestone,
           "operationState" AS state,
           "leaseExpiresAt" AS "leaseExpiresAt"
    FROM "PlannerRevision"
    WHERE "planId" = ${planId}::uuid AND source = 'EXPAND'
    ORDER BY sequence DESC
    LIMIT 24`;
  const mine = rows.filter((row) => row.milestone === milestoneKey);
  return {
    confirmed: mine.some((row) => row.confirmed),
    /** A sealed draft that was never confirmed: reopen it instead of regenerating. */
    sealedDraft: mine.find((row) => !row.confirmed && row.state === "SEALED") ?? null,
    expansions: mine,
  };
}

/**
 * Starts one selected-period expansion.
 *
 * Expansion is allowed only from the CONFIRMED, active roadmap revision. An
 * unconfirmed roadmap edit must be confirmed first, and another milestone's
 * pending expansion draft must be reviewed or discarded first: the roadmap's
 * strategic layer is the base, never a draft of it.
 */
export async function beginExpansion(userId: number, planId: string, raw: unknown, now = new Date()) {
  KeySchema.parse(planId);
  const body = boundedParse(z.strictObject({
    operationKey: OperationKeySchema,
    expectedVersion: z.number().int().nonnegative(),
    milestoneKey: KeySchema,
  }), raw);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const prior = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey: body.operationKey } } });
    if (prior) { if (prior.operationHash !== digest(body)) throw new PlannerError(409, "IDEMPOTENCY_MISMATCH"); return { ...prior, acquired: false as const }; }
    if (plan.mode !== "ROADMAP") throw new PlannerError(422, "MODE_MISMATCH");
    assertVersion(plan, body.expectedVersion);
    if (!plan.activeRevisionId) throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const active = await tx.plannerRevision.findUnique({ where: { id: plan.activeRevisionId } });
    if (!active || active.planId !== planId || active.operationState !== "SEALED" || !active.confirmationReceipt || !active.outputSnapshot)
      throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const input = roadmapInput(boundedParse(UserInputV1Schema, active.inputSnapshot, LIMITS.inputBytes));
    const parsedActive = boundedParse(ValidatedDraftV1Schema, active.outputSnapshot);
    if (parsedActive.mode !== "ROADMAP") throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const parent: RoadmapDraft = parsedActive;
    // Authoritative guard order: an unconfirmed draft for THIS milestone is
    // reopened (no second provider call, no charge); a confirmed expansion is
    // refused for good; anything else pending must be resolved by the user first.
    const lineage = await expansionLineage(tx, planId, body.milestoneKey);
    if (lineage.confirmed) throw new PlannerError(409, "MILESTONE_ALREADY_EXPANDED");
    if (lineage.sealedDraft)
      return {
        planId,
        version: plan.version,
        operation: { id: lineage.sealedDraft.id, state: lineage.sealedDraft.state, leaseExpiresAt: lineage.sealedDraft.leaseExpiresAt },
        acquired: false as const,
        reason: "EXISTING_EXPANSION_DRAFT" as const,
      };
    if (plan.latestDraftRevisionId) {
      const pending = await tx.plannerRevision.findUnique({ where: { id: plan.latestDraftRevisionId } });
      throw new PlannerError(409, pending?.source === "EXPAND" ? "PENDING_EXPANSION_DRAFT" : "CONFIRM_ROADMAP_EDIT_FIRST");
    }
    const scope = expansionScope(parent, body.milestoneKey, input);
    const availability = await loadAvailability(tx, plan, input, { start: scope.period.startDate, end: scope.period.endDate });
    const last = await tx.plannerRevision.aggregate({ where: { planId }, _max: { sequence: true } });
    const operation = await tx.plannerRevision.create({ data: {
      planId, sequence: (last._max.sequence ?? 0) + 1, source: "EXPAND", baseVersion: plan.version, baseRevisionId: plan.activeRevisionId,
      inputSnapshot: json(input), availabilitySnapshot: json(availability), operationKey: body.operationKey, operationHash: digest(body),
      leaseExpiresAt: new Date(now.getTime() + 120000),
    } });
    const quota = await reserveRevisionQuota(tx, userId, operation.id, "plannerExpansion", now);
    if (!quota) throw new PlannerError(429, "QUOTA_EXHAUSTED");
    return { ...await tx.plannerRevision.findUniqueOrThrow({ where: { id: operation.id } }), acquired: true as const };
  });
}

/**
 * Seals one expansion. `milestoneKey` is re-derived from the request and verified
 * against the pinned base revision, so a mismatch cannot bind items to the wrong
 * period. The assembled draft copies the parent structure verbatim, and the
 * comparison below proves no neighbouring period moved.
 */
export async function finishExpansion(userId: number, planId: string, key: string, milestoneKey: string, items: ExpansionItem[], now = new Date(), signal?: AbortSignal, review?: PlannerSemanticReview) {
  KeySchema.parse(planId); OperationKeySchema.parse(key); KeySchema.parse(milestoneKey);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const op = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey: key } } });
    if (!op) throw new PlannerError(404, "NOT_FOUND");
    if (op.operationState === "SEALED") return op;
    if (op.source !== "EXPAND" || !op.baseRevisionId) throw new PlannerError(409, "OPERATION_EXPIRED");
    if (op.operationState !== "PREPARING" || !op.leaseExpiresAt || op.leaseExpiresAt <= now) throw new PlannerError(409, "OPERATION_EXPIRED");
    // The base must still be the confirmed active roadmap revision.
    if (plan.activeRevisionId !== op.baseRevisionId) throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    assertVersion(plan, op.baseVersion);
    signal?.throwIfAborted();
    const input = roadmapInput(boundedParse(UserInputV1Schema, op.inputSnapshot, LIMITS.inputBytes));
    const base = await tx.plannerRevision.findUnique({ where: { id: op.baseRevisionId } });
    if (!base || !base.confirmationReceipt || !base.outputSnapshot) throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const parsedBase = boundedParse(ValidatedDraftV1Schema, base.outputSnapshot);
    if (parsedBase.mode !== "ROADMAP") throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const scope = expansionScope(parsedBase, milestoneKey, input);
    const availability = await loadAvailability(tx, plan, input, { start: scope.period.startDate, end: scope.period.endDate });
    if (digest(availability) !== digest(op.availabilitySnapshot)) throw new PlannerError(409, "SCHEDULE_CHANGED");
    validateExpansionItems(input, availability, scope, items);
    const draft = normalizeExpansion(input, parsedBase, scope, items, review);
    // Defence in depth: the expansion restates the roadmap it belongs to, and that
    // restatement must be byte-identical to the parent's strategic structure.
    if (digest(roadmapStructureForComparison(draft)) !== digest(roadmapStructureForComparison(parsedBase)))
      throw new PlannerError(409, "ROADMAP_STRUCTURE_CHANGED");
    signal?.throwIfAborted();
    const quota = await settleRevisionQuota(tx, userId, op.id, "SETTLED", now);
    const sealed = await tx.plannerRevision.update({ where: { id: op.id }, data: {
      operationState: "SEALED", outputSnapshot: json(draft), digest: digest({ schemaVersion: 1, input, availability, draft }),
      sealedAt: now, quotaReceipt: json(quota),
    } });
    await tx.plannerPlan.update({ where: { id: planId }, data: { latestDraftRevisionId: op.id, version: { increment: 1 } } });
    signal?.throwIfAborted();
    return sealed;
  });
}
