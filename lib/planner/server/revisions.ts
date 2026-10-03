import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, EditSchema, KeySchema, LIMITS, ModeSchema, OperationKeySchema, UserInputV1Schema, ValidatedDraftV1Schema, validateDraft, type UserInputV1, type ValidatedDraftV1 } from "../contracts";
import { validateCapacity } from "../capacity";
import { activeExamItems, constraintCapacityInput } from "../exam-policy";
import { localToday } from "../dates";
import { PlannerError } from "../errors";
import { assertReferences, assertVersion, digest, json, loadAvailability, normalizeProposal, ownedPlan, transaction, type Tx } from "./core";
import { deterministicSemanticIssues, type PlannerSemanticReview } from "../semantic";
import { softConstraintViolations } from "../constraints";
import {
  excludedRoadmapTopics,
  periodSpecsFor,
  roadmapDraftView,
  roadmapInput,
  validateRoadmapEffort,
  type RoadmapDraft,
} from "../roadmap-policy";
import { roadmapProgress } from "../roadmap-progress";
import { readExecution, rebalanceContext } from "./rebalance";
import { assessDraftEdit } from "./flexibility";
import { plannerTelemetry } from "../telemetry";

const ShellSchema = z.strictObject({ mode: ModeSchema, title: z.string().trim().min(1).max(200), creationKey: OperationKeySchema, subjectId: z.number().int().positive().nullable(), goalId: z.number().int().positive().nullable() });
export async function createPlanShell(userId: number, raw: unknown, requestIdentity?: string) {
  const data = boundedParse(ShellSchema, raw); const hash = digest(requestIdentity ? { ...data, requestIdentity } : data);
  return transaction(userId, async tx => {
    const prior = await tx.plannerPlan.findUnique({ where: { userId_creationKey: { userId, creationKey: data.creationKey } } });
    if (prior) { if (prior.creationHash !== hash) throw new PlannerError(409, "IDEMPOTENCY_MISMATCH"); return prior; }
    await assertReferences(tx, userId, data.subjectId, data.goalId);
    return tx.plannerPlan.create({ data: { ...data, userId, creationHash: hash } });
  });
}
async function seal(tx: Tx, userId: number, planId: string, input: UserInputV1, draft: ValidatedDraftV1, expectedVersion: number, operationKey: string, operationHash: string, source: "GENERATE" | "EDIT", baseRevisionId: string | null, /**
   * Waivers a *flexible draft edit* has already earned.
   *
   * `capacity` is set only by `appendEdit` after `assessDraftEdit` classified every
   * capacity finding for this exact draft as an acknowledgeable recommendation. The
   * HARD limits are untouched by it: `validateHardConstraints` ran inside
   * `validateDraft` before this point, and an explicit HARD weekly maximum is reported
   * as a blocker by the same assessment, so it can never arrive here as a waiver.
   */
  waivers: { capacity?: boolean; suppress?: ReadonlySet<string> } = {}) {
  const plan = await ownedPlan(tx, userId, planId, true);
  const prior = await tx.plannerRevision.findUnique({ where: { planId_operationKey: { planId, operationKey } } });
  if (prior) { if (prior.operationHash !== operationHash) throw new PlannerError(409, "IDEMPOTENCY_MISMATCH"); return prior; }
  assertVersion(plan, expectedVersion);
  if (source === "EDIT" && baseRevisionId !== (plan.latestDraftRevisionId ?? plan.activeRevisionId)) throw new PlannerError(409, "STALE_REVISION");
  if (source === "GENERATE" && plan.activeRevisionId) throw new PlannerError(409, "REPLANNING_NOT_ENABLED");
  if (plan.mode !== input.mode) throw new PlannerError(422, "MODE_MISMATCH");
  const state = await loadAvailability(tx, plan, input);
  const today = localToday(state.timezone);
  if (activeExamItems(draft.items).some(i => i.date < today)) throw new PlannerError(422, "PAST_DATE");
  // Existing keys are immutable execution identities; only new work consumes extra capacity.
  const links = await tx.plannerQuestLink.findMany({ where: { planId }, select: { itemKey: true } });
  const existing = new Set(links.map(l => l.itemKey));
  const capacity = validateCapacity(constraintCapacityInput(input), state, activeExamItems(draft.items).filter(i => !existing.has(i.key)));
  if (!capacity.feasible && !waivers.capacity) throw new PlannerError(422, "INFEASIBLE_CAPACITY");
  // A roadmap revision is validated against live capacity too: every period's
  // planned effort must still fit what that period actually has.
  if (input.mode === "ROADMAP" && input.roadmap && draft.mode === "ROADMAP") {
    const roadmap = roadmapInput(input);
    const specs = periodSpecsFor(roadmap);
    validateRoadmapEffort(
      roadmap,
      state,
      specs,
      draft.milestones
        .filter(milestone => !milestone.removed)
        .map(milestone => ({
          periodRef: specs[
            (draft.periods ?? []).findIndex(period => period.key === milestone.periodKey)
          ]?.ref,
          effortMinutes: milestone.effortMinutes,
        })),
      [],
      waivers.suppress
    );
  }
  const last = await tx.plannerRevision.aggregate({ where: { planId }, _max: { sequence: true } });
  const content = { schemaVersion: 1, input, availability: state, draft };
  const revision = await tx.plannerRevision.create({ data: {
    planId, sequence: (last._max.sequence ?? 0) + 1, source, baseRevisionId: baseRevisionId ?? plan.latestDraftRevisionId ?? plan.activeRevisionId, baseVersion: expectedVersion,
    inputSnapshot: json(input), availabilitySnapshot: json(state), outputSnapshot: json(draft), digest: digest(content),
    operationKey, operationHash, operationState: "SEALED", sealedAt: new Date(),
  } });
  await tx.plannerPlan.update({ where: { id: planId }, data: { latestDraftRevisionId: revision.id, version: { increment: 1 } } });
  return revision;
}
/** Internal only: no HTTP proposal ingestion route. Fixtures and future generation call this. */
export async function saveValidatedDraft(userId: number, planId: string, args: { input: unknown; proposal: unknown; expectedVersion: number; operationKey: string }) {
  KeySchema.parse(planId); OperationKeySchema.parse(args.operationKey);
  z.number().int().nonnegative().parse(args.expectedVersion);
  const input = boundedParse(UserInputV1Schema, args.input, LIMITS.inputBytes);
  const draft = normalizeProposal(input, args.proposal);
  const operationHash = digest(args);
  return transaction(userId, tx => seal(tx, userId, planId, input, draft, args.expectedVersion, args.operationKey, operationHash, "GENERATE", null));
}
export async function appendEdit(userId: number, planId: string, raw: unknown) {
  KeySchema.parse(planId); const body = boundedParse(EditSchema, raw);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const base = await tx.plannerRevision.findFirst({ where: { id: body.baseRevisionId, planId, operationState: "SEALED" } });
    if (!base) throw new PlannerError(404, "NOT_FOUND");
    const input = boundedParse(UserInputV1Schema, base.inputSnapshot, LIMITS.inputBytes);
    /**
     * Two ways to read a base draft, and the difference matters.
     *
     * Without `acknowledgements` the request means "this draft must still be a complete
     * plan", so the base and the result are validated exactly as before.
     *
     * With `acknowledgements` present — even an empty array — the request means "tell me
     * what this edit trades away, and let me accept it". The base is then read
     * structurally rather than re-validated, because a revision sealed with accepted
     * warnings is a legitimate base and re-running the completeness rules on it would
     * make every later edit of that plan impossible. The *result* is fully validated
     * either way: the assessment's whole job is to run the real validators.
     */
    const assessing = body.acknowledgements !== undefined;
    const draft = assessing
      ? boundedParse(ValidatedDraftV1Schema, base.outputSnapshot)
      : validateDraft(input, base.outputSnapshot);
    if (body.edits.some(e => !draft.items.some(i => i.key === e.key))) throw new PlannerError(400, "UNKNOWN_ITEM");
    for (const edit of body.edits) {
      const original = draft.items.find(i => i.key === edit.key)!;
      if (original.locked && edit.locked !== false && Object.keys(edit).some(k => k !== "key" && k !== "locked" && Reflect.get(edit, k) !== Reflect.get(original, k))) throw new PlannerError(409, "ITEM_LOCKED");
    }
    let items = draft.items.map(i => ({ ...i, ...body.edits.find(e => e.key === i.key) }));
    if (body.itemOrder) {
      if (body.itemOrder.length !== items.length || new Set(body.itemOrder).size !== items.length || body.itemOrder.some(k => !items.some(i => i.key === k))) throw new PlannerError(400, "INVALID_ITEM_ORDER");
      if (draft.items.some((i, n) => i.locked && items.find(e => e.key === i.key)?.locked && body.itemOrder![n] !== i.key)) throw new PlannerError(409, "ITEM_LOCKED");
      items = body.itemOrder.map(k => items.find(i => i.key === k)!);
    }
    // Roadmap structure edits: title, period assignment, outcome, covered units,
    // effort, order, lock and removal all append a new immutable EDIT revision.
    let milestones = draft.mode === "ROADMAP" ? draft.milestones : null;
    if (body.milestoneEdits || body.milestoneOrder) {
      if (!milestones)
        throw new PlannerError(400, "ROADMAP_EDIT_NOT_APPLICABLE");
      if (body.milestoneEdits?.some(edit => !milestones!.some(m => m.key === edit.key)))
        throw new PlannerError(400, "UNKNOWN_MILESTONE");
      for (const edit of body.milestoneEdits ?? []) {
        const original = milestones.find(m => m.key === edit.key)!;
        if (
          original.locked &&
          edit.locked !== false &&
          Object.keys(edit).some(key => key !== "key" && key !== "locked" && Reflect.get(edit, key) !== Reflect.get(original, key))
        )
          throw new PlannerError(409, "MILESTONE_LOCKED");
      }
      milestones = milestones.map(milestone => ({
        ...milestone,
        ...(body.milestoneEdits?.find(edit => edit.key === milestone.key) ?? {}),
      }));
      if (body.milestoneOrder) {
        if (
          body.milestoneOrder.length !== milestones.length ||
          new Set(body.milestoneOrder).size !== milestones.length ||
          body.milestoneOrder.some(key => !milestones!.some(m => m.key === key))
        )
          throw new PlannerError(400, "INVALID_MILESTONE_ORDER");
        // Reordering may not move a milestone across its fixed period boundary.
        const order = new Map(body.milestoneOrder.map((key, position) => [key, position]));
        const sorted = [...milestones].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
        let previous = -1;
        const periods = draft.mode === "ROADMAP" ? draft.periods ?? [] : [];
        const periodOrder = new Map(
          periods.map((period) => [period.key, period.order] as const)
        );
        for (const milestone of sorted) {
          const current = periodOrder.get(milestone.periodKey ?? "") ?? -1;
          if (current < previous)
            throw new PlannerError(409, "MILESTONE_PERIOD_ORDER");
          previous = current;
        }
        milestones = sorted;
      }
    }
    // The AI critic runs only at generation; an edit re-runs the deterministic
    // semantic gate (inside validateDraft) and records that the critic was not
    // re-run rather than implying the edited content was critically reviewed.
    const candidate = { ...draft, items, ...(milestones ? { milestones } : {}) };
    if (assessing) {
      /**
       * Flexible editing: the same validators, plus a statement of what the edit gives
       * up. Nothing is waived until the student has answered, and a blocker ends it —
       * the acknowledgement list is not even read for one.
       */
      const state = await loadAvailability(tx, plan, input);
      const assessment = assessDraftEdit({
        input,
        draft: candidate,
        // The base draft, so a warning can name the units this edit changed.
        base: base.outputSnapshot,
        acknowledged: body.acknowledgements ?? [],
        state,
      });
      if (!assessment.ok) {
        plannerTelemetry("draft_warning_presented", {
          mode: input.mode,
          warningsAccepted: assessment.warnings.length,
          blockers: assessment.blockers.length,
        });
        throw new PlannerError(409, "DRAFT_WARNINGS_REQUIRE_ACCEPTANCE", {
          findings: assessment.findings,
          warnings: assessment.warnings,
          blockers: assessment.blockers,
          accepted: assessment.accepted,
          baseRevisionId: base.id,
        });
      }
      if (assessment.accepted.length) {
        plannerTelemetry("draft_warning_accepted", {
          mode: input.mode,
          warningsAccepted: assessment.accepted.length,
        });
      }
      const edited = validateDraft(input, assessment.draft!, [] , [], {
        suppress: new Set(assessment.accepted.map((code) => code.replace(/^ACK:/, ""))),
      });
      return seal(
        tx, userId, planId, input,
        { ...edited, semanticReview: editedReview(input, edited, draft.semanticReview) },
        body.expectedVersion, body.operationKey, digest(body), "EDIT", base.id,
        { capacity: true, suppress: new Set(assessment.accepted.map((code) => code.replace(/^ACK:/, ""))) }
      );
    }
    const edited = validateDraft(input, candidate);
    return seal(tx, userId, planId, input, { ...edited, semanticReview: editedReview(input, edited, draft.semanticReview) }, body.expectedVersion, body.operationKey, digest(body), "EDIT", base.id);
  });
}
/** Deterministic-only review record for a user edit; bounded counts, no content. */
function editedReview(input: UserInputV1, draft: ValidatedDraftV1, previous?: PlannerSemanticReview): PlannerSemanticReview {
  return {
    schemaVersion: 1,
    critic: "NOT_RERUN",
    issues: previous?.issues ?? 0,
    repaired: previous?.repaired ?? 0,
    deterministicIssues: deterministicSemanticIssues(draft).length,
    softViolations: softConstraintViolations(input, draft.items.filter(i => !i.removed)).length,
  };
}
export async function listPlans(userId: number, before?: string) {
  if (before) KeySchema.parse(before);
  return prisma.plannerPlan.findMany({ where: { userId }, take: 30, ...(before ? { cursor: { id: before }, skip: 1 } : {}), orderBy: { id: "desc" }, select: { id: true, mode: true, title: true, state: true, version: true, activeRevisionId: true, latestDraftRevisionId: true, createdAt: true, updatedAt: true } });
}
/**
 * Owned plan detail. For a roadmap it additionally reports bounded expansion
 * summaries and each milestone's expansion/execution state, so the UI can show
 * partially expanded roadmaps without a second round-trip. Everything here is a
 * projection of revisions and links; no mastery or coverage claim is derived.
 */
export async function getPlanDetail(userId: number, planId: string) {
  KeySchema.parse(planId);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId);
    if (plan.contractVersion === 2) throw new PlannerError(409, "PLANNER_V2_PATH_REQUIRED");
    const latestDraft = plan.latestDraftRevisionId ? await tx.plannerRevision.findUnique({ where: { id: plan.latestDraftRevisionId } }) : null;
    const links = await tx.plannerQuestLink.findMany({ where: { planId }, orderBy: { itemKey: "asc" }, take: 1000 });
    const activeRevision = plan.activeRevisionId ? await tx.plannerRevision.findUnique({ where: { id: plan.activeRevisionId } }) : null;
    // EXPAND revisions are projected to the fields the roadmap view needs; the
    // milestone key lives inside the bounded snapshot and is read as a single path.
    const expansionRows = plan.mode === "ROADMAP"
      ? await tx.$queryRaw<Array<{ id: string; sequence: number; confirmed: boolean; milestone: string | null; sealedAt: Date | null; itemKeys: string[] | null }>>`
          SELECT id, sequence,
                 ("confirmationReceipt" IS NOT NULL) AS confirmed,
                 ("outputSnapshot"->'expansion'->>'milestoneKey') AS milestone,
                 "sealedAt" AS "sealedAt",
                 COALESCE(
                   (SELECT jsonb_agg(entry->>'key')
                      FROM jsonb_array_elements(COALESCE("outputSnapshot"->'items', '[]'::jsonb)) AS entry),
                   '[]'::jsonb
                 ) AS "itemKeys"
          FROM "PlannerRevision"
          WHERE "planId" = ${planId}::uuid AND source = 'EXPAND'
          ORDER BY sequence DESC
          LIMIT 24`
      : [];
    const parsedActive =
      activeRevision && activeRevision.outputSnapshot
        ? boundedParse(ValidatedDraftV1Schema, activeRevision.outputSnapshot)
        : null;
    const roadmapDraft: RoadmapDraft | null =
      parsedActive && parsedActive.mode === "ROADMAP" ? parsedActive : null;
    const milestoneStates = roadmapDraft
      ? roadmapProgress({
          milestones: roadmapDraft.milestones.map(milestone => ({
            key: milestone.key,
            periodKey: milestone.periodKey,
            removed: milestone.removed,
          })),
          expansions: expansionRows
            .filter(row => row.milestone)
            .map(row => ({
              revisionId: row.id,
              milestoneKey: row.milestone,
              confirmed: row.confirmed,
            })),
          links: links.map(link => ({ itemKey: link.itemKey, disposition: link.disposition })),
          // Actionable items live in EXPAND revisions, not in the strategic
          // roadmap revision, so their keys are projected per expansion.
          items: expansionRows.flatMap(row =>
            (row.itemKeys ?? []).map(key => ({
              key,
              expansionRevisionId: row.id,
            }))
          ),
        })
      : [];
    /**
     * The student's own, optional report about a completed Mastery Check. It is a
     * separate planner-owned record: no Quest, revision or SubjectNode carries it.
     */
    const checkResults = await tx.plannerCheckResult.findMany({
      where: { planId },
      select: { itemKey: true, revisionId: true, result: true, updatedAt: true },
      take: 8,
    });

    /**
     * What reality currently allows a replan to touch, derived from the same bounded
     * execution read the mastery view uses. It is detection only: nothing here calls
     * a provider or changes a Quest.
     */
    const rebalanceState = plan.activeRevisionId
      ? await (async () => {
          const active = activeRevision;
          if (!active?.inputSnapshot || !active.outputSnapshot) return null;
          const activeInput = boundedParse(
            UserInputV1Schema,
            active.inputSnapshot,
            LIMITS.inputBytes
          );
          const parsedActiveDraft = boundedParse(
            ValidatedDraftV1Schema,
            active.outputSnapshot
          );
          const availability = await loadAvailability(tx, plan, activeInput);
          const live = await readExecution(
            tx,
            planId,
            localToday(availability.timezone)
          );
          // The confirmed plan's own scope: strategic for a roadmap, whole-plan otherwise.
          const context = rebalanceContext(
            activeInput,
            parsedActiveDraft,
            live,
            [],
            { milestoneKey: null }
          );
          return {
            eligible: context.eligibleKeys.length,
            frozen: live.frozen.length,
            overdue: live.counts.PENDING_OVERDUE ?? 0,
            locked: context.lockedKeys.length,
            counts: live.counts,
          };
        })()
      : null;

    /**
     * Replanning state: the most recent proposal (sealed or confirmed) and the diff
     * the user would review. Only the projection is returned — never a prompt, a
     * critic payload or a model identifier.
     */
    const rebalanceRows = await tx.plannerRevision.findMany({
      where: { planId, source: "REBALANCE" },
      orderBy: { sequence: "desc" },
      select: {
        id: true,
        sequence: true,
        operationState: true,
        confirmationReceipt: true,
        sealedAt: true,
        outputSnapshot: true,
      },
      take: 4,
    });
    const latestRebalance = rebalanceRows[0] ?? null;
    const rebalance = latestRebalance
      ? {
          revisionId: latestRebalance.id,
          sequence: latestRebalance.sequence,
          state: latestRebalance.operationState,
          confirmed: Boolean(latestRebalance.confirmationReceipt),
          sealedAt: latestRebalance.sealedAt,
          // The sealed diff is the review surface; it is bounded at 60 entries.
          diff:
            (latestRebalance.outputSnapshot as { rebalance?: unknown } | null)
              ?.rebalance ?? null,
          isLatestDraft: plan.latestDraftRevisionId === latestRebalance.id,
        }
      : null;
    /**
     * Completed history from earlier confirmed revisions, for progress that spans a
     * replan. Superseded work is excluded through the link table, so nothing counts
     * twice and a tombstoned item never reappears.
     */
    const historyRows = activeRevision
      ? await tx.$queryRaw<Array<{ id: string; items: unknown[] | null }>>`
          SELECT id,
                 COALESCE(
                   (SELECT jsonb_agg(jsonb_build_object(
                      'key', entry->>'key',
                      'title', entry->>'title',
                      'date', entry->>'date',
                      'minutes', (entry->>'minutes')::int,
                      'stage', COALESCE(entry->>'stage', entry->>'masteryStage'),
                      'type', entry->>'type',
                      'topicKey', entry->>'topicKey'
                    ))
                      FROM jsonb_array_elements(COALESCE("outputSnapshot"->'items', '[]'::jsonb)) AS entry),
                   '[]'::jsonb
                 ) AS items
          FROM "PlannerRevision"
          WHERE "planId" = ${planId}::uuid
            AND "confirmationReceipt" IS NOT NULL
            AND id <> ${activeRevision.id}::uuid
          ORDER BY sequence DESC
          LIMIT 8`
      : [];
    const previouslyLinked = new Set(
      links
        .filter((link) => link.disposition !== "DELETED")
        .map((link) => link.itemKey)
    );
    const seenHistory = new Set<string>();
    const historyItems = historyRows
      .flatMap((row) => row.items ?? [])
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => {
        const key = String(item.key);
        if (seenHistory.has(key) || !previouslyLinked.has(key)) return false;
        seenHistory.add(key);
        return true;
      });

    // A mastery plan is executable, so its own view needs the execution status of
    // the Quests its items created — status only, never mastery inference. Other
    // modes keep the exact projection they had.
    const execution =
      plan.mode === "MASTERY" && links.length
        ? await tx.quest.findMany({
            where: { id: { in: links.map(link => link.questId).filter((id): id is number => Boolean(id)) } },
            select: { id: true, status: true, completedAt: true },
            take: 1000,
          })
        : [];
    const questById = new Map(execution.map(quest => [quest.id, quest]));
    return {
      plan,
      latestDraft,
      activeRevision,
      links,
      execution:
        plan.mode === "MASTERY"
          ? links.map(link => ({
              itemKey: link.itemKey,
              status: link.questId ? questById.get(link.questId)?.status ?? "FAILED" : "FAILED",
              completedAt: link.questId ? questById.get(link.questId)?.completedAt ?? null : null,
            }))
          : [],
      expansions: expansionRows.map(row => ({
        revisionId: row.id,
        milestoneKey: row.milestone,
        confirmed: row.confirmed,
        sealedAt: row.sealedAt,
        itemCount: (row.itemKeys ?? []).length,
        isLatestDraft: plan.latestDraftRevisionId === row.id,
      })),
      milestoneStates,
      rebalance,
      rebalanceState,
      checkResults,
      historyItems,
    };
  });
}
export async function getRevision(userId: number, planId: string, revisionId: string) {
  KeySchema.parse(planId); KeySchema.parse(revisionId);
  await ownedPlan(prisma, userId, planId);
  const revision = await prisma.plannerRevision.findFirst({ where: { id: revisionId, planId } });
  if (!revision) throw new PlannerError(404, "NOT_FOUND");
  return revision;
}
export async function listRevisions(userId: number, planId: string, before = 2147483647) {
  KeySchema.parse(planId); z.number().int().positive().parse(before);
  await ownedPlan(prisma, userId, planId);
  return prisma.plannerRevision.findMany({ where: { planId, sequence: { lt: before } }, take: 30, orderBy: { sequence: "desc" }, select: { id: true, sequence: true, source: true, baseRevisionId: true, baseVersion: true, digest: true, operationState: true, createdAt: true, sealedAt: true, confirmedAt: true } });
}
export async function archivePlan(userId: number, planId: string, expectedVersion: number) {
  KeySchema.parse(planId);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    if (plan.state === "ARCHIVED" && plan.version === expectedVersion + 1) return plan;
    assertVersion(plan, expectedVersion);
    return tx.plannerPlan.update({ where: { id: planId }, data: { state: "ARCHIVED", version: { increment: 1 } } });
  });
}
