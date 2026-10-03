import "server-only";
import { z } from "zod";
import {
  reserveRevisionQuota,
  settleRevisionQuota,
} from "@/lib/ai/usage-limiter";
import {
  boundedParse,
  KeySchema,
  LIMITS,
  ModelProposalV1Schema,
  OperationKeySchema,
  UserInputV1Schema,
  ValidatedDraftV1Schema,
  validateDraft,
  type CommitReceipt,
  type UserInputV1,
  type ValidatedDraftV1,
} from "../contracts";
import { validateCapacity } from "../capacity";
import type { AvailabilitySnapshot } from "../capacity";
import { localToday } from "../dates";
import { PlannerError } from "../errors";
import {
  assertPlannerModeScope,
  rebalanceEligible,
  rebalanceLockedItems,
  rebalanceFrozenMilestoneViews,
  rebalanceFrozenViews,
  rebalanceItems,
  rebalanceScopeFor,
  retainedIdenticalRefs,
} from "../rebalance-scope";

export { rebalanceFrozenMilestoneViews, rebalanceScopeFor };
import {
  REBALANCE_LIMITS,
  RebalanceInputChangeSchema,
  RebalanceReasonSchema,
  RebalanceScopeSchema,
  type RebalanceDiff,
} from "../rebalance-fields";
import {
  assertRebalanceEnvelope,
  detectRebalanceReasons,
  executionSnapshot,
  isPlannerQuestReplannable,
  rebalanceDiff,
  rebalanceMilestoneDiff,
  replanFitsOneResponse,
  type ExecutionRow,
  type ExecutionSnapshot,
} from "../rebalance-policy";
import {
  assertVersion,
  digest,
  json,
  loadAvailability,
  normalizeProposal,
  ownedPlan,
  transaction,
  type Tx,
} from "./core";
import { expansionLineage } from "./operations";
import { createQuestsAndLinks, mapQuest, type WriteBoundary } from "./materialize";
import { normalizeExpansion } from "./core";
import type { ExpansionItem } from "../expansion-fields";
import { expansionScope } from "../expansion-policy";

import { roadmapInput } from "../roadmap-policy";
import { constraintCapacityInput } from "../exam-policy";

import {
  examRebalanceValidation,
  masteryRebalanceValidation,
  periodRebalanceValidation,
  roadmapRebalanceValidation,
} from "../rebalance-mode-rules";

/**
 * User-approved adaptive replanning (Phase 5).
 *
 * The lifecycle is fixed: detect or request → snapshot reality → generate a
 * proposal → validate → show the diff → the user reviews → the user confirms →
 * one atomic reconciliation. Nothing here mutates a Quest before that final
 * confirmation, and the model never decides what is protected: this module reads
 * live state, classifies it, and reconciles only what the user approved.
 */

export const RebalanceRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requestKey: OperationKeySchema,
  expectedVersion: z.number().int().nonnegative(),
  baseRevisionId: KeySchema,
  reasonCode: RebalanceReasonSchema,
  inputChanges: z.array(RebalanceInputChangeSchema).max(5),
  scope: RebalanceScopeSchema,
  /** Explicit input changes only. Nothing is inferred from missed work. */
  proposedInput: UserInputV1Schema.optional(),
});

export const RebalanceConfirmSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revisionId: KeySchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: OperationKeySchema,
  acknowledgeExclusions: z.boolean().optional(),
});

/**
 * Every linked Quest of one plan, classified. Two bounded queries, never one per
 * Quest: the link projection carries the Quest fields, and one grouped session read
 * answers "has this Quest any recorded time or an open session?".
 */
export async function readExecution(
  tx: Tx,
  planId: string,
  today: string
): Promise<ExecutionSnapshot> {
  const links = await tx.plannerQuestLink.findMany({
    where: { planId },
    select: {
      itemKey: true,
      questId: true,
      disposition: true,
      quest: {
        select: {
          status: true,
          scheduledFor: true,
          requiredMinutes: true,
          elapsedSeconds: true,
          completedAt: true,
        },
      },
    },
    take: REBALANCE_LIMITS.executionRows,
  });
  const questIds = links
    .map((link) => link.questId)
    .filter((id): id is number => typeof id === "number");
  const sessions = questIds.length
    ? await tx.studySession.findMany({
        where: { questId: { in: questIds } },
        select: { questId: true, endedAt: true },
        take: REBALANCE_LIMITS.executionRows,
      })
    : [];
  const sessionCount = new Map<number, number>();
  const active = new Set<number>();
  for (const session of sessions) {
    if (session.questId === null) continue;
    sessionCount.set(session.questId, (sessionCount.get(session.questId) ?? 0) + 1);
    if (session.endedAt === null) active.add(session.questId);
  }
  const rows: ExecutionRow[] = links.map((link) => ({
    itemKey: link.itemKey,
    questId: link.questId,
    disposition: link.disposition,
    status: link.quest?.status ?? null,
    scheduledFor: link.quest?.scheduledFor ?? null,
    requiredMinutes: link.quest?.requiredMinutes ?? null,
    elapsedSeconds: link.quest?.elapsedSeconds ?? 0,
    completedAt: link.quest?.completedAt?.toISOString() ?? null,
    sessions: link.questId ? sessionCount.get(link.questId) ?? 0 : 0,
    activeSession: link.questId ? active.has(link.questId) : false,
  }));
  return executionSnapshot(rows, today);
}

/** The confirmed revision a replan is allowed to build on, or a refusal. */
async function confirmedPlan(tx: Tx, userId: number, planId: string) {
  const plan = await ownedPlan(tx, userId, planId, true);
  if (!plan.activeRevisionId)
    throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
  const active = await tx.plannerRevision.findUnique({
    where: { id: plan.activeRevisionId },
  });
  if (
    !active ||
    active.planId !== planId ||
    active.operationState !== "SEALED" ||
    !active.confirmationReceipt ||
    !active.outputSnapshot
  )
    throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
  const input = boundedParse(UserInputV1Schema, active.inputSnapshot, LIMITS.inputBytes);
  const draft = boundedParse(ValidatedDraftV1Schema, active.outputSnapshot);
  return { plan, active, input, draft };
}

export interface RebalanceContext {
  execution: ExecutionSnapshot;
  frozenViews: ReturnType<typeof rebalanceFrozenViews>;
  eligibleKeys: string[];
  frozenKeys: string[];
  /** Items the student locked: never offered as replannable. */
  lockedKeys: string[];
  tokens: { ref: string; itemKey: string; questId: number | null }[];
}

/**
 * The server-owned view a replan is built from: which items may change, which are
 * frozen history, and the plan-local tokens the model may retain.
 */
export function rebalanceContext(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  execution: ExecutionSnapshot,
  expandedMilestoneKeys: string[] = [],
  /** The scope of this replan, stated by the caller rather than inferred. */
  scope: { milestoneKey: string | null } | null = input.rebalance?.scope ?? null
): RebalanceContext {
  const isPeriod = Boolean(scope?.milestoneKey);
  const frozenItems = rebalanceFrozenViews(input, draft, execution);
  // A strategic Roadmap creates no Quests, so its replannable set is milestone-based:
  // every unexpanded milestone may change, and an expanded period is an anchor.
  const strategic = input.mode === "ROADMAP" && !isPeriod;
  const eligible = strategic
    ? (draft.mode === "ROADMAP" ? draft.milestones : [])
        .filter(
          (milestone) =>
            !milestone.removed && !expandedMilestoneKeys.includes(milestone.key)
        )
        .map((milestone) => ({ key: milestone.key, questId: null }))
    : isPeriod
      ? rebalanceEligible(draft, execution).filter((entry) => {
          const item = draft.items.find((candidate) => candidate.key === entry.key);
          return item?.milestoneKey === scope!.milestoneKey;
        })
      : rebalanceEligible(draft, execution);
  const frozenKeys = strategic
    ? expandedMilestoneKeys
    : execution.frozen.map((row) => row.itemKey);
  return {
    execution,
    frozenViews: frozenItems,
    eligibleKeys: eligible.map((entry) => entry.key),
    frozenKeys,
    lockedKeys: strategic ? [] : rebalanceLockedItems(draft, execution),
    tokens: eligible.map((entry, index) => ({
      ref: `r${index + 1}`,
      itemKey: entry.key,
      questId: entry.questId,
    })),
  };
}

/**
 * Starts one user-approved replan. It reserves the dedicated rebalance bucket,
 * pins the confirmed base revision and stores the execution snapshot the proposal
 * will be generated against — but changes nothing about live execution.
 */
export async function beginRebalance(
  userId: number,
  planId: string,
  raw: unknown,
  now = new Date()
) {
  KeySchema.parse(planId);
  const body = boundedParse(RebalanceRequestSchema, raw);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const prior = await tx.plannerRevision.findUnique({
      where: { planId_operationKey: { planId, operationKey: body.requestKey } },
    });
    if (prior) {
      if (prior.operationHash !== digest(body))
        throw new PlannerError(409, "IDEMPOTENCY_MISMATCH");
      return { ...prior, acquired: false as const };
    }
    assertVersion(plan, body.expectedVersion);
    const { active, input, draft: confirmedDraft } = await confirmedPlan(
      tx,
      userId,
      planId
    );
    let draft = confirmedDraft;
    if (input.mode !== plan.mode) throw new PlannerError(422, "MODE_MISMATCH");
    assertPlannerModeScope(input, draft, body.scope);
    /**
     * A Roadmap period revision replaces the execution of a period that was already
     * expanded, so its base is that period's confirmed EXPAND revision — the only
     * place its items live. The permanent EXPAND lineage stays untouched: this is a
     * REBALANCE operation, never a second expansion, and the strategic pointer is
     * left alone.
     */
    let base = active;
    if (body.scope.milestoneKey) {
      const lineage = await expansionLineage(tx, planId, body.scope.milestoneKey);
      const confirmed = lineage.expansions.find((row) => row.confirmed);
      if (!lineage.confirmed || !confirmed)
        throw new PlannerError(409, "MILESTONE_NOT_EXPANDED");
      const expansion = await tx.plannerRevision.findUnique({
        where: { id: confirmed.id },
      });
      if (!expansion?.outputSnapshot || !expansion.confirmationReceipt)
        throw new PlannerError(409, "MILESTONE_NOT_EXPANDED");
      const expansionDraft = boundedParse(
        ValidatedDraftV1Schema,
        expansion.outputSnapshot
      );
      if (expansionDraft.mode !== "ROADMAP" || !expansionDraft.expansion)
        throw new PlannerError(409, "MILESTONE_NOT_EXPANDED");
      base = expansion;
      draft = expansionDraft;
    }
    if (base.id !== body.baseRevisionId)
      throw new PlannerError(409, "REPLAN_STALE_BASE");
    const nextInput = boundedParse(
      UserInputV1Schema,
      body.proposedInput ?? input,
      input.mode === "ROADMAP" ? LIMITS.roadmapInputBytes : LIMITS.inputBytes
    );
    if (nextInput.mode !== input.mode) throw new PlannerError(422, "MODE_MISMATCH");
    const availability = await loadAvailability(
      tx,
      plan,
      nextInput,
      body.scope.milestoneKey
        ? rebalanceScopeFor(input, draft, body.scope.milestoneKey)
        : undefined
    );
    const execution = await readExecution(
      tx,
      planId,
      localToday(availability.timezone, now)
    );
    const expanded = await expandedMilestoneKeys(tx, planId, draft);
    const context = rebalanceContext(nextInput, draft, execution, expanded, body.scope);
    if (!context.eligibleKeys.length && !body.inputChanges.length)
      throw new PlannerError(422, "NOTHING_TO_REBALANCE");
    /**
     * A plan may hold more items than one replan response can carry, so the scope is checked
     * before anything is attempted — spending a model call and then failing on a contract error
     * would leave the student with no way to act on it. The rule and the reasoning behind the two
     * different bounds live in `replanFitsOneResponse`. A Roadmap can still be replanned period by
     * period, where each period fits; that is what the scope field is for.
     */
    if (!replanFitsOneResponse(context.eligibleKeys.length))
      throw new PlannerError(422, "REBALANCE_SCOPE_TOO_LARGE");
    if (execution.conflicted) throw new PlannerError(409, "REPLAN_CONFLICTED_EXECUTION");
    const rebalance = {
      reasonCode: body.reasonCode,
      inputChanges: body.inputChanges,
      baseRevisionId: base.id,
      scope: body.scope,
      snapshotDigest: digest(execution.fingerprint),
      frozenItemKeys: context.frozenKeys,
      eligible: context.tokens,
    };
    assertRebalanceEnvelope(rebalance);
    const storedInput = { ...nextInput, rebalance };
    const last = await tx.plannerRevision.aggregate({
      where: { planId },
      _max: { sequence: true },
    });
    const operation = await tx.plannerRevision.create({
      data: {
        planId,
        sequence: (last._max.sequence ?? 0) + 1,
        source: "REBALANCE",
        baseVersion: plan.version,
        baseRevisionId: active.id,
        inputSnapshot: json(storedInput),
        availabilitySnapshot: json(availability),
        operationKey: body.requestKey,
        operationHash: digest(body),
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      },
    });
    const quota = await reserveRevisionQuota(
      tx,
      userId,
      operation.id,
      "plannerRebalance",
      now
    );
    if (!quota) throw new PlannerError(429, "QUOTA_EXHAUSTED");
    return {
      ...(await tx.plannerRevision.findUniqueOrThrow({ where: { id: operation.id } })),
      acquired: true as const,
      eligible: context.tokens.length,
      frozen: context.frozenKeys.length,
    };
  });
}

/** Frozen history is derived from the confirmed revision, never from the model. */
async function expandedMilestoneKeys(
  tx: Tx,
  planId: string,
  draft: ValidatedDraftV1
): Promise<string[]> {
  if (draft.mode !== "ROADMAP") return [];
  const rows = await tx.$queryRaw<Array<{ milestone: string | null }>>`
    SELECT ("outputSnapshot"->'expansion'->>'milestoneKey') AS milestone
    FROM "PlannerRevision"
    WHERE "planId" = ${planId}::uuid AND source = 'EXPAND'
      AND "confirmationReceipt" IS NOT NULL
    LIMIT 60`;
  const confirmed = new Set(
    rows.map((row) => row.milestone).filter((key): key is string => Boolean(key))
  );
  return draft.milestones
    .filter((milestone) => confirmed.has(milestone.key))
    .map((milestone) => milestone.key);
}

/** The mode-specific deterministic rules a replan proposal must satisfy. */
function validateRebalanceProposal(args: {
  input: UserInputV1;
  baseInput: UserInputV1;
  baseDraft: ValidatedDraftV1;
  availability: AvailabilitySnapshot;
  proposal: unknown;
  context: RebalanceContext;
  expandedMilestoneKeys: string[];
}): void {
  const { input, baseDraft, availability, context } = args;
  const meta = input.rebalance!;
  const parsed = boundedParse(ModelProposalV1Schema, args.proposal);
  // A retained item's stage is a fact of the plan it came from, not a model decision:
  // the item IS that same work, so when the model omits the stage of an item it
  // explicitly keeps, the server restores it instead of rejecting an otherwise
  // correct proposal for failing to restate history. This restores only a MISSING
  // stage of an item whose retained content already matches; a stage the model states
  // is never overwritten, and the mode's own stage/intent pairing still decides.
  const baseByKey = new Map(
    baseDraft.items.filter((item) => !item.removed).map((item) => [item.key, item])
  );
  const tokenByRef = new Map(context.tokens.map((token) => [token.ref, token.itemKey]));
  const restored = {
    ...parsed,
    items: parsed.items.map((item) => {
      if (item.retainRef === null || item.retainRef === undefined) return item;
      const original = baseByKey.get(tokenByRef.get(item.retainRef) ?? "");
      if (!original) return item;
      if (item.type !== original.type) return item;
      if (item.masteryStage || item.stage) return item;
      return original.masteryStage
        ? { ...item, masteryStage: original.masteryStage }
        : original.stage
          ? { ...item, stage: original.stage }
          : item;
    }),
  };
  const proposal = restored;

  const retainedRefs = retainedIdenticalRefs(
    proposal.items.map((item) => ({
      ref: item.ref,
      retainRef: item.retainRef ?? undefined,
      title: item.title,
      date: item.date,
      minutes: item.minutes,
      type: item.type,
    })),
    context.tokens,
    baseDraft
  );
  if (meta.scope.milestoneKey) {
    if (baseDraft.mode !== "ROADMAP")
      throw new PlannerError(422, "MODE_MISMATCH");
    const scope = expansionScope(
      baseDraft,
      meta.scope.milestoneKey,
      roadmapInput(args.baseInput)
    );
    periodRebalanceValidation(
      input,
      availability,
      scope,
      proposal.items.map((item) => ({
        ref: item.ref,
        topicRef: item.topicRef,
        type: item.type,
        title: item.title,
        date: item.date,
        minutes: item.minutes,
      })),
      context.frozenViews,
      // A retained item already exists as a Quest on its own date: it is never
      // charged against the period's remaining capacity a second time.
      retainedRefs
    );
    return;
  }
  // An item that keeps an existing, unchanged item already exists as a Quest, so it
  // is not charged against capacity again — only the work this replan writes is.
  if (input.mode === "EXAM") {
    examRebalanceValidation(
      input,
      proposal,
      availability,
      context.frozenViews,
      retainedRefs
    );
    return;
  }
  if (input.mode === "MASTERY") {
    masteryRebalanceValidation(
      input,
      proposal,
      availability,
      context.frozenViews,
      retainedRefs
    );
    return;
  }
  roadmapRebalanceValidation(
    input,
    proposal,
    availability,
    rebalanceFrozenMilestoneViews(
      baseDraft,
      args.expandedMilestoneKeys,
      "PROPOSAL"
    )
  );
}

/**
 * Builds the sealed draft for a replan.
 *
 * Retained proposal items are re-keyed onto the identity they already have, so a
 * confirmed replan writes nothing for work that is staying put. Everything else
 * receives a fresh key, which is what stops a superseded item from being recreated
 * by a look-alike.
 */
function normalizeRebalanceDraft(args: {
  input: UserInputV1;
  baseInput: UserInputV1;
  baseDraft: ValidatedDraftV1;
  proposal: unknown;
  context: RebalanceContext;
  review?: Parameters<typeof normalizeProposal>[2];
  onKey?: (ref: string, key: string) => void;
}): ValidatedDraftV1 {
  const { input, baseInput, baseDraft, context } = args;
  const meta = input.rebalance;
  if (!meta) throw new PlannerError(422, "REBALANCE_INPUT_REQUIRED");
  const proposal = boundedParse(ModelProposalV1Schema, args.proposal);
  if (proposal.mode !== input.mode) throw new PlannerError(422, "MODE_MISMATCH");
  const tokens = new Map(context.tokens.map((token) => [token.ref, token]));
  const frozenKeys = new Set(meta.frozenItemKeys);
  const baseItems = new Map(
    baseDraft.items.filter((item) => !item.removed).map((item) => [item.key, item])
  );
  const baseMilestones = new Map(
    baseDraft.mode === "ROADMAP"
      ? baseDraft.milestones.filter((m) => !m.removed).map((m) => [m.key, m])
      : []
  );
  void baseInput;
  const retained = new Map<string, string>();
  for (const item of proposal.items) {
    if (item.retainRef === null || item.retainRef === undefined) continue;
    const token = tokens.get(item.retainRef);
    if (!token) throw new PlannerError(422, "UNKNOWN_RETAIN_REF");
    if (frozenKeys.has(token.itemKey))
      throw new PlannerError(409, "REBALANCE_TOUCHES_HISTORY");
    const original = baseItems.get(token.itemKey);
    if (!original) throw new PlannerError(422, "UNKNOWN_RETAIN_REF");
    // Only identical content may keep its identity; anything else is a move, which
    // the diff reports and the reconciliation performs as supersede + create.
    if (
      original.title === item.title &&
      original.date === item.date &&
      original.minutes === item.minutes &&
      original.type === item.type
    )
      retained.set(item.ref, token.itemKey);
  }
  const milestoneRetained = new Map<string, string>();
  if (proposal.mode === "ROADMAP")
    for (const milestone of proposal.milestones) {
      const retainRef = (milestone as { retainRef?: string | null }).retainRef;
      if (retainRef === null || retainRef === undefined) continue;
      const token = tokens.get(retainRef);
      if (!token) throw new PlannerError(422, "UNKNOWN_RETAIN_REF");
      if (frozenKeys.has(token.itemKey))
        throw new PlannerError(409, "REBALANCE_FROZEN_MILESTONE");
      if (baseMilestones.has(token.itemKey))
        milestoneRetained.set(milestone.ref, token.itemKey);
    }
  const identity = {
    keyFor: (ref: string) =>
      retained.get(ref) ?? milestoneRetained.get(ref) ?? undefined,
    onKey: args.onKey,
    frozen: context.frozenViews,
    // A strategic draft holds only the editable milestones; the anchors cover their
    // own periods and units, so the draft validator must see them.
    frozenMilestones: rebalanceFrozenMilestoneViews(
      baseDraft,
      [...frozenKeys],
      "DRAFT"
    ),
  };
  if (meta.scope.milestoneKey) {
    // A period revision: the strategic structure is copied verbatim from the parent,
    // exactly as an expansion does, so no neighbouring period can drift.
    if (proposal.mode !== "ROADMAP" || baseDraft.mode !== "ROADMAP")
      throw new PlannerError(422, "MODE_MISMATCH");
    const scope = expansionScope(
      baseDraft,
      meta.scope.milestoneKey,
      roadmapInput(baseInput)
    );
    return normalizeExpansion(
      roadmapInput(input),
      baseDraft,
      scope,
      proposal.items.map((item) => ({
        ref: item.ref,
        topicRef: item.topicRef,
        relatedTopicRefs: item.relatedTopicRefs ?? [],
        dependsOn: item.dependsOn,
        // A period revision plans daily work, so the Exam-only readiness intents are
        // not available to it — the same contract an expansion has.
        type: item.type as ExpansionItem["type"],
        title: item.title,
        description: item.description,
        rationale:
          item.rationale ?? "Keeps this period's work aligned with the plan.",
        completionCriteria: item.completionCriteria ?? "",
        date: item.date,
        minutes: item.minutes,
      })),
      args.review,
      identity
    );
  }
  const draft = normalizeProposal(input, args.proposal, args.review, identity);
  if (draft.mode !== "ROADMAP") return draft;
  // A strategic rebalance restates only eligible milestones: the milestones history
  // has fixed are carried over verbatim, with their own keys, so expansion lineage and
  // period identity survive. Their *references* are translated into this revision's
  // currency first. A draft names units and periods with keys minted for its own
  // revision, while the confirmed scope order and the deterministic period grid are
  // what every revision of a plan shares, so the carried milestone keeps its meaning
  // word for word and can still be resolved by this draft's own validators.
  const frozenMilestones =
    baseDraft.mode === "ROADMAP"
      ? baseDraft.milestones.filter((milestone) => frozenKeys.has(milestone.key))
      : [];
  const carried = frozenMilestones.map((milestone) => {
    const periodIndex =
      baseDraft.mode === "ROADMAP"
        ? (baseDraft.periods ?? []).findIndex(
            (period) => period.key === milestone.periodKey
          )
        : -1;
    const period = periodIndex >= 0 ? (draft.periods ?? [])[periodIndex] : undefined;
    return {
      ...milestone,
      periodKey: period?.key ?? milestone.periodKey,
      topicKeys: (milestone.topicKeys ?? []).map((key) => {
        const index =
          baseDraft.mode === "ROADMAP"
            ? baseDraft.topics.findIndex((topic) => topic.key === key)
            : -1;
        return (index >= 0 ? draft.topics[index]?.key : undefined) ?? key;
      }),
    };
  });
  return {
    ...draft,
    milestones: [...draft.milestones, ...carried],
  } as ValidatedDraftV1;
}

export interface RebalanceSealResult {
  revisionId: string;
  version: number;
  diff: RebalanceDiff;
  retained: number;
}

/**
 * Seals one replan proposal. Reality is re-read first: if any executable fact moved
 * since the operation began, the proposal is refused rather than sealed against a
 * snapshot the user would be confirming blindly.
 */
export async function finishRebalance(
  userId: number,
  planId: string,
  key: string,
  proposal: unknown,
  now = new Date(),
  signal?: AbortSignal,
  review?: Parameters<typeof normalizeProposal>[2]
): Promise<{
  revision: { id: string; digest: string | null };
  result: RebalanceSealResult;
}> {
  KeySchema.parse(planId);
  OperationKeySchema.parse(key);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const op = await tx.plannerRevision.findUnique({
      where: { planId_operationKey: { planId, operationKey: key } },
    });
    if (!op) throw new PlannerError(404, "NOT_FOUND");
    if (op.operationState === "SEALED")
      throw new PlannerError(409, "OPERATION_ALREADY_SEALED");
    if (op.source !== "REBALANCE" || !op.baseRevisionId)
      throw new PlannerError(409, "OPERATION_EXPIRED");
    if (
      op.operationState !== "PREPARING" ||
      !op.leaseExpiresAt ||
      op.leaseExpiresAt <= now
    )
      throw new PlannerError(409, "OPERATION_EXPIRED");
    assertVersion(plan, op.baseVersion);
    const input = boundedParse(UserInputV1Schema, op.inputSnapshot, LIMITS.inputBytes);
    const meta = input.rebalance;
    if (!meta) throw new PlannerError(409, "OPERATION_EXPIRED");
    const base = await tx.plannerRevision.findUnique({
      where: { id: meta.baseRevisionId },
    });
    if (!base?.outputSnapshot || !base.confirmationReceipt)
      throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
    // A whole-plan replan is based on the active revision, so the pointer must not
    // have moved. A period revision is based on that period's expansion, and the
    // strategic pointer must still be the confirmed roadmap it was read from.
    if (meta.scope.milestoneKey === null && plan.activeRevisionId !== meta.baseRevisionId)
      throw new PlannerError(409, "REPLAN_STALE_BASE");
    if (meta.scope.milestoneKey !== null && !plan.activeRevisionId)
      throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
    const baseInput = boundedParse(UserInputV1Schema, base.inputSnapshot, LIMITS.inputBytes);
    const baseDraft = boundedParse(ValidatedDraftV1Schema, base.outputSnapshot);
    const availability = await loadAvailability(
      tx,
      plan,
      input,
      meta.scope.milestoneKey
        ? rebalanceScopeFor(baseInput, baseDraft, meta.scope.milestoneKey)
        : undefined
    );
    if (digest(availability) !== digest(op.availabilitySnapshot))
      throw new PlannerError(409, "SCHEDULE_CHANGED");
    const execution = await readExecution(
      tx,
      planId,
      localToday(availability.timezone, now)
    );
    if (digest(execution.fingerprint) !== meta.snapshotDigest)
      throw new PlannerError(409, "REPLAN_STALE_EXECUTION");
    signal?.throwIfAborted();
    const expanded = await expandedMilestoneKeys(tx, planId, baseDraft);
    const context = rebalanceContext(input, baseDraft, execution, expanded, meta.scope);
    validateRebalanceProposal({
      input,
      baseInput,
      baseDraft,
      availability,
      proposal,
      context,
      expandedMilestoneKeys: expanded,
    });
    const keyByRef = new Map<string, string>();
    const draft = normalizeRebalanceDraft({
      input,
      baseInput,
      baseDraft,
      proposal,
      context,
      review,
      onKey: (ref, key) => keyByRef.set(ref, key),
    });
    const topics = new Map(draft.topics.map((topic) => [topic.key, topic.title]));
    const parsedProposal = boundedParse(ModelProposalV1Schema, proposal);
    const diff = meta.scope.milestoneKey
      ? periodDiff({
          baseDraft,
          draft,
          parsedProposal,
          keyByRef,
          context,
          topics,
        })
      : parsedProposal.mode === "ROADMAP"
        ? rebalanceMilestoneDiff({
            baseMilestones: milestoneDiffInput(baseDraft, new Set(expanded)),
            proposed: parsedProposal.milestones.map((milestone) => ({
              key: keyByRef.get(milestone.ref)!,
              title: milestone.title,
              date: milestone.date,
              topicKeys: (milestone.topicRefs ?? [])
                .map((ref, index) => `${ref}:${index}`)
                .map((ref) => scopeTopicKey(baseInput, baseDraft, ref)),
              retainedKey: (() => {
                const ref = (milestone as { retainRef?: string | null }).retainRef;
                if (ref === null || ref === undefined) return null;
                return (
                  context.tokens.find((token) => token.ref === ref)?.itemKey ??
                  null
                );
              })(),
            })),
            topicTitles: topics,
          })
        : rebalanceDiff({
            baseItems: rebalanceItems(baseDraft).map((item) => ({
              key: item.key,
              title: item.title,
              date: item.date,
              minutes: item.minutes,
              topicKey: item.topicKey,
              stage: item.stage ?? item.masteryStage ?? null,
            })),
            snapshot: execution,
            proposed: parsedProposal.items.map((item) => ({
              key: keyByRef.get(item.ref)!,
              title: item.title,
              date: item.date,
              minutes: item.minutes,
              topicKey: topicKeyForRef(baseInput, baseDraft, item.topicRef),
              stage: item.masteryStage ?? item.stage ?? null,
              retainedKey:
                item.retainRef === null || item.retainRef === undefined
                  ? null
                  : context.tokens.find((token) => token.ref === item.retainRef)
                      ?.itemKey ?? null,
            })),
            topicTitles: topics,
          });
    if (diff.affectedHistory !== 0)
      throw new PlannerError(409, "REBALANCE_TOUCHES_HISTORY");
    const stored = validateDraft(
      input,
      {
        ...draft,
        rebalance: {
          reasonCode: meta.reasonCode,
          inputChanges: meta.inputChanges,
          baseRevisionId: meta.baseRevisionId,
          scope: meta.scope,
          snapshotDigest: meta.snapshotDigest,
          counts: diff.counts,
          frozen: diff.frozen,
          affectedHistory: diff.affectedHistory,
          entries: diff.entries,
        },
      },
      context.frozenViews,
      rebalanceFrozenMilestoneViews(baseDraft, expanded, "DRAFT")
    );
    const quota = await settleRevisionQuota(tx, userId, op.id, "SETTLED", now);
    const sealed = await tx.plannerRevision.update({
      where: { id: op.id },
      data: {
        operationState: "SEALED",
        outputSnapshot: json(stored),
        digest: digest({
          schemaVersion: 1,
          input,
          availability: op.availabilitySnapshot,
          draft: stored,
        }),
        sealedAt: now,
        quotaReceipt: json(quota),
      },
    });
    await tx.plannerPlan.update({
      where: { id: planId },
      data: { latestDraftRevisionId: op.id, version: { increment: 1 } },
    });
    signal?.throwIfAborted();
    return {
      revision: { id: sealed.id, digest: sealed.digest },
      result: {
        revisionId: sealed.id,
        version: plan.version + 1,
        diff,
        retained: diff.counts.RETAIN,
      },
    };
  });
}

/** The period-revision diff: items inside one expanded period. */
function periodDiff(args: {
  baseDraft: ValidatedDraftV1;
  draft: ValidatedDraftV1;
  parsedProposal: { items: { ref: string; retainRef?: string | null }[] };
  keyByRef: Map<string, string>;
  context: RebalanceContext;
  topics: Map<string, string>;
}): RebalanceDiff {
  const scopeKey = args.draft.mode === "ROADMAP"
    ? args.draft.expansion?.milestoneKey ?? null
    : null;
  const baseItems = rebalanceItems(args.baseDraft).filter(
    (item) => item.milestoneKey === scopeKey || scopeKey === null
  );
  const eligible = new Set(args.context.eligibleKeys);
  return rebalanceDiff({
    baseItems: baseItems.map((item) => ({
      key: item.key,
      title: item.title,
      date: item.date,
      minutes: item.minutes,
      topicKey: item.topicKey,
      stage: item.stage ?? item.masteryStage ?? null,
    })),
    snapshot: {
      ...args.context.execution,
      eligible: args.context.execution.eligible.filter((row) =>
        eligible.has(row.itemKey)
      ),
    },
    proposed: args.parsedProposal.items.map((item) => ({
      key: args.keyByRef.get(item.ref)!,
      title:
        args.draft.items.find((entry) => entry.key === args.keyByRef.get(item.ref))
          ?.title ?? "",
      date:
        args.draft.items.find((entry) => entry.key === args.keyByRef.get(item.ref))
          ?.date ?? "",
      minutes:
        args.draft.items.find((entry) => entry.key === args.keyByRef.get(item.ref))
          ?.minutes ?? 0,
      topicKey:
        args.draft.items.find((entry) => entry.key === args.keyByRef.get(item.ref))
          ?.topicKey ?? "",
      stage: null,
      retainedKey: item.retainRef
        ? args.context.tokens.find((token) => token.ref === item.retainRef)
            ?.itemKey ?? null
        : null,
    })),
    topicTitles: args.topics,
  });
}

function milestoneDiffInput(draft: ValidatedDraftV1, frozen: Set<string>) {
  if (draft.mode !== "ROADMAP") return [];
  return draft.milestones
    .filter((milestone) => !milestone.removed)
    .map((milestone) => ({
      key: milestone.key,
      title: milestone.title,
      date: milestone.date,
      topicKeys: milestone.topicKeys ?? [],
      frozen: frozen.has(milestone.key),
    }));
}

/** Durable topic key for a proposal (`tN`) ref. */
function topicKeyForRef(
  baseInput: UserInputV1,
  draft: ValidatedDraftV1,
  ref: string
): string {
  const index = Number(ref.replace(/^t/, "")) - 1;
  const token = scopeTokensFor(baseInput)[index];
  const topic = draft.topics.find((entry) => entry.scopeRef === token);
  return topic?.key ?? draft.topics[index]?.key ?? "";
}

/** Durable milestone-topic key for a `tN:index` helper token. */
function scopeTopicKey(
  baseInput: UserInputV1,
  draft: ValidatedDraftV1,
  token: string
): string {
  const [ref] = token.split(":");
  return topicKeyForRef(baseInput, draft, ref);
}

function scopeTokensFor(input: UserInputV1): string[] {
  if (input.mode === "EXAM")
    return (input.exam?.topics ?? []).map((_, index) => `t${index + 1}`);
  if (input.mode === "MASTERY")
    return (input.mastery?.topics ?? []).map((_, index) => `t${index + 1}`);
  return (input.roadmap?.topics ?? []).map((_, index) => `t${index + 1}`);
}

/**
 * One atomic reconciliation.
 *
 * Inside a single SERIALIZABLE transaction: verify the version and digest, re-read
 * availability and live execution, prove no frozen work is affected, prove every
 * superseded Quest is still unstarted, reconcile exactly the approved work, create
 * the replacement Quests once, write lineage and the receipt, and advance the plan.
 * Any change in reality returns a conflict — a replan is never partially applied.
 */
export async function confirmRebalance(
  userId: number,
  planId: string,
  raw: unknown,
  afterWrite?: (boundary: WriteBoundary) => void
): Promise<CommitReceipt> {
  KeySchema.parse(planId);
  const body = boundedParse(RebalanceConfirmSchema, raw);
  const requestHash = digest(body);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const replay = await tx.plannerRevision.findUnique({
      where: {
        planId_confirmationKey: { planId, confirmationKey: body.idempotencyKey },
      },
    });
    if (replay) {
      if (replay.confirmationHash !== requestHash)
        throw new PlannerError(409, "IDEMPOTENCY_MISMATCH");
      return replay.confirmationReceipt as unknown as CommitReceipt;
    }
    const revision = await tx.plannerRevision.findFirst({
      where: { id: body.revisionId, planId },
    });
    if (!revision) throw new PlannerError(404, "NOT_FOUND");
    if (revision.confirmationReceipt)
      throw new PlannerError(409, "REVISION_ALREADY_CONFIRMED");
    if (revision.source !== "REBALANCE")
      throw new PlannerError(422, "NOT_A_REBALANCE");
    assertVersion(plan, body.expectedVersion);
    if (
      revision.operationState !== "SEALED" ||
      revision.digest !== body.digest ||
      plan.latestDraftRevisionId !== revision.id ||
      revision.baseVersion + 1 !== plan.version
    )
      throw new PlannerError(409, "STALE_REVISION");
    const input = boundedParse(UserInputV1Schema, revision.inputSnapshot, LIMITS.inputBytes);
    const meta = input.rebalance;
    if (!meta) throw new PlannerError(409, "NOT_A_REBALANCE");
    const base = await tx.plannerRevision.findUnique({
      where: { id: meta.baseRevisionId },
    });
    if (!base?.outputSnapshot || !base.confirmationReceipt)
      throw new PlannerError(409, "REPLAN_STALE_BASE");
    if (meta.scope.milestoneKey === null && plan.activeRevisionId !== base.id)
      throw new PlannerError(409, "REPLAN_STALE_BASE");
    if (meta.scope.milestoneKey !== null && !plan.activeRevisionId)
      throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
    const baseInput = boundedParse(UserInputV1Schema, base.inputSnapshot, LIMITS.inputBytes);
    const baseDraft = boundedParse(ValidatedDraftV1Schema, base.outputSnapshot);
    const expanded = await expandedMilestoneKeys(tx, planId, baseDraft);
    const draft = validateDraft(
      input,
      revision.outputSnapshot,
      rebalanceFrozenViews(baseInput, baseDraft, await readExecution(
        tx,
        planId,
        localToday(
          (revision.availabilitySnapshot as unknown as AvailabilitySnapshot).timezone
        )
      )),
      rebalanceFrozenMilestoneViews(baseDraft, expanded, "DRAFT")
    );
    const diff = draft.rebalance;
    if (!diff) throw new PlannerError(409, "NOT_A_REBALANCE");
    const availability = await loadAvailability(
      tx,
      plan,
      input,
      meta.scope.milestoneKey
        ? rebalanceScopeFor(baseInput, baseDraft, meta.scope.milestoneKey)
        : undefined
    );
    if (digest(availability) !== digest(revision.availabilitySnapshot))
      throw new PlannerError(409, "SCHEDULE_CHANGED");
    if (
      digest({ schemaVersion: 1, input, availability, draft }) !== revision.digest
    )
      throw new PlannerError(409, "CONTENT_CHANGED");
    const execution = await readExecution(
      tx,
      planId,
      localToday(availability.timezone)
    );
    if (digest(execution.fingerprint) !== meta.snapshotDigest)
      throw new PlannerError(409, "REPLAN_STALE_EXECUTION");
    if (execution.conflicted)
      throw new PlannerError(409, "REPLAN_CONFLICTED_EXECUTION");
    const eligibleNow = new Set(execution.eligible.map((row) => row.itemKey));
    const isPeriod = Boolean(meta.scope.milestoneKey);
    // Protected execution: every supersede target must still be replannable, right
    // now, and every retained item must still be live and unstarted. A milestone entry
    // is a strategic restatement, not a Quest: the work beneath it is protected by the
    // frozen anchor that makes its period un-replannable, not by this item-level check.
    for (const entry of diff.entries) {
      if (entry.stage === "MILESTONE") continue;
      if (entry.supersedesKey && !eligibleNow.has(entry.supersedesKey))
        throw new PlannerError(409, "REPLAN_EXECUTION_CHANGED");
      if (
        entry.change === "RETAIN" &&
        entry.key &&
        !eligibleNow.has(entry.key)
      )
        throw new PlannerError(409, "REPLAN_EXECUTION_CHANGED");
    }
    if (diff.affectedHistory !== 0)
      throw new PlannerError(409, "REBALANCE_TOUCHES_HISTORY");
    const links = await tx.plannerQuestLink.findMany({ where: { planId } });
    const liveByKey = new Map(
      links.filter((link) => link.disposition === "LIVE").map((link) => [link.itemKey, link])
    );
    const now = new Date();
    const receiptItems: CommitReceipt["items"] = [];
    // 1. Supersede exactly the approved work: tombstone first, so the Quest is no
    //    longer linked when it is removed and the guard has nothing to protect.
    for (const entry of diff.entries) {
      if (!entry.supersedesKey) continue;
      const link = liveByKey.get(entry.supersedesKey);
      if (!link || !link.questId)
        throw new PlannerError(409, "REPLAN_EXECUTION_CHANGED");
      const row = execution.rows.find((item) => item.itemKey === entry.supersedesKey)!;
      if (!isPlannerQuestReplannable(row, row.className))
        throw new PlannerError(409, "PLANNER_EXECUTION_PROTECTED");
      await tx.plannerQuestLink.update({
        where: { id: link.id },
        data: {
          disposition: "DELETED",
          questId: null,
          removedAt: now,
          changedAt: now,
          removalReason:
            entry.change === "REMOVE" ? "REBALANCE_REMOVED" : "REBALANCE_SUPERSEDED",
          appliedRevisionId: revision.id,
        },
      });
      afterWrite?.("link");
      await tx.quest.delete({ where: { id: link.questId } });
      afterWrite?.("quest");
    }
    // 2. Create the replacement and new Quests once each.
    const retainedKeys = new Set(
      diff.entries
        .filter((entry) => entry.change === "RETAIN" && entry.key)
        .map((entry) => entry.key as string)
    );
    for (const entry of diff.entries)
      // A milestone entry writes no execution: it keeps its own key and every Quest
      // beneath it, so reporting it as an item would invent a Quest that does not
      // exist. The receipt lists exactly the work this confirmation touched.
      if (entry.change === "RETAIN" && entry.key && entry.stage !== "MILESTONE") {
        const quest = liveByKey.get(entry.key);
        // A retained item is a live, unstarted Quest that was just re-confirmed as
        // eligible: if its link is gone, reality moved and the confirmation fails
        // closed rather than reporting a receipt the plan cannot honour.
        if (!quest?.questId)
          throw new PlannerError(409, "REPLAN_EXECUTION_CHANGED");
        receiptItems.push({ itemKey: entry.key, questId: quest.questId });
      }
    const newItems = draft.items.filter(
      (item) => !item.removed && !retainedKeys.has(item.key)
    );
    if (
      newItems.length &&
      !validateCapacity(constraintCapacityInput(input), availability, newItems)
        .feasible
    )
      throw new PlannerError(422, "INFEASIBLE_CAPACITY");
    const supersedeOf = new Map(
      diff.entries
        .filter((entry) => entry.supersedesKey && entry.key)
        .map((entry) => [entry.key as string, entry.supersedesKey as string])
    );
    /**
     * Batched for the same reason confirmation is (see `createQuestsAndLinks`): a replan of a
     * three-month plan adds dozens of items, and one round-trip per item does not fit in the
     * transaction's budget on a real network. A replan that silently rolled back would be the
     * worst possible version of this, because the student has already approved the diff.
     */
    receiptItems.push(
      ...(await createQuestsAndLinks(
        tx,
        {
          planId,
          revisionId: revision.id,
          items: newItems,
          fields: newItems.map((item) => mapQuest(item, userId, plan.subjectId, plan.goalId)),
          // Replacement lineage lives in the immutable baseline: which item this one
          // supersedes and why, without touching the superseded row's own history.
          baseline: (item, fields) => {
            const supersedes = supersedeOf.get(item.key) ?? null;
            return {
              item,
              quest: fields,
              ...(supersedes ? { replaces: { itemKey: supersedes, reason: "REBALANCE" } } : {}),
              rebalanceReason: meta.reasonCode,
            };
          },
        },
        afterWrite
      ))
    );
    // 3. Retained links are recorded as applied by this revision and nothing else
    //    about them changes. One statement: every retained link receives the same two
    //    values, so the filter is the whole difference.
    const retainedLinkIds = [...retainedKeys]
      .map((key) => liveByKey.get(key)?.id)
      .filter((id): id is string => typeof id === "string");
    if (retainedLinkIds.length) {
      await tx.plannerQuestLink.updateMany({
        where: { id: { in: retainedLinkIds } },
        data: { appliedRevisionId: revision.id, changedAt: now },
      });
      afterWrite?.("link");
    }
    const receipt: CommitReceipt = {
      schemaVersion: 1,
      planId,
      revisionId: revision.id,
      digest: body.digest,
      goalId: plan.goalId,
      version: plan.version + 1,
      items: receiptItems,
      committedAt: now.toISOString(),
    };
    // A period revision leaves the roadmap pointer alone, exactly as an expansion
    // does, so the strategic plan stays the plan of record. Every whole-plan
    // rebalance — Exam, Mastery and the strategic Roadmap itself — becomes active.
    await tx.plannerPlan.update({
      where: { id: planId },
      data: {
        activeRevisionId: isPeriod ? plan.activeRevisionId : revision.id,
        latestDraftRevisionId: null,
        state: "ACTIVE",
        version: { increment: 1 },
      },
    });
    afterWrite?.("pointer");
    await tx.plannerRevision.update({
      where: { id: revision.id },
      data: {
        confirmationKey: body.idempotencyKey,
        confirmationHash: requestHash,
        confirmationReceipt: json(receipt),
        confirmedAt: now,
      },
    });
    afterWrite?.("receipt");
    return receipt;
  });
}

/** Detection for the review affordance: reasons, counts and the last proposal. */
export async function rebalanceState(userId: number, planId: string) {
  KeySchema.parse(planId);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId);
    const rows = await tx.plannerRevision.findMany({
      where: { planId, source: "REBALANCE" },
      orderBy: { sequence: "desc" },
      select: { id: true, operationState: true, confirmationReceipt: true, sequence: true },
      take: 6,
    });
    const latest = rows[0] ?? null;
    if (!plan.activeRevisionId) return { offered: false, reasons: [], latest: null };
    const active = await tx.plannerRevision.findUnique({
      where: { id: plan.activeRevisionId },
    });
    if (!active?.inputSnapshot) return { offered: false, reasons: [], latest: null };
    const input = boundedParse(UserInputV1Schema, active.inputSnapshot, LIMITS.inputBytes);
    const availability = await loadAvailability(tx, plan, input);
    const execution = await readExecution(
      tx,
      planId,
      localToday(availability.timezone)
    );
    const reasons = detectRebalanceReasons({
      snapshot: execution,
      availabilityChanged: false,
      deadlineChanged: false,
      priorityChanged: false,
      scopeChanged: false,
      checkNeedsWork: false,
      today: localToday(availability.timezone),
    });
    const overdue = execution.counts.PENDING_OVERDUE ?? 0;
    return {
      offered: execution.eligible.length > 0,
      reasons,
      eligible: execution.eligible.length,
      frozen: execution.frozen.length,
      overdue,
      counts: execution.counts,
      latest: latest
        ? {
            revisionId: latest.id,
            state: latest.operationState,
            confirmed: Boolean(latest.confirmationReceipt),
          }
        : null,
    };
  });
}

export { detectRebalanceReasons, rebalanceSummary } from "../rebalance-policy";
export type { RebalanceDiff, ExecutionSnapshot };
