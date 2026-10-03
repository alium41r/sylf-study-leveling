import "server-only";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "@/lib/difficulty-engine";
import { boundedParse, CommitSchema, KeySchema, LIMITS, UserInputV1Schema, validateDraft, type CommitReceipt, type PlannerItem, type ValidatedDraftV1 } from "../contracts";
import { validateCapacity } from "../capacity";
import { activeExamItems, constraintCapacityInput, excludedExamTopics } from "../exam-policy";
import { excludedRoadmapTopics } from "../roadmap-policy";
import { excludedMasteryTopics } from "../mastery-policy";
import { isStretch } from "../planner-role";
import { localToday } from "../dates";
import { PlannerError } from "../errors";
import { assertVersion, digest, json, loadAvailability, ownedPlan, transaction, type Tx } from "./core";
import { resolveCompletionCriteria } from "../done";

/**
 * Definition of Done is exposed through the existing Quest description field, the
 * only compatible user-facing path. No Quest column is added and legacy Quests are
 * untouched: only planner-materialized Quests carry the criterion.
 */
export function mapQuest(item: PlannerItem, userId: number, subjectId: number | null, goalId: number | null) {
  const difficulty = calculateRecommendedDifficulty(item.minutes);
  const rewards = calculateQuestRewards(item.minutes, difficulty);
  const criteria = resolveCompletionCriteria(item);
  const description = [item.description.trim(), `Done when: ${criteria.text}`].filter(Boolean).join("\n\n");
  return { userId, subjectId, goalId, subjectNodeId: null, title: item.title, description,
    requiredMinutes: item.minutes, targetMinutes: item.minutes, scheduledFor: item.date, status: "PENDING",
    difficulty, xpReward: rewards.xp, sylphReward: rewards.sylph, createdByAi: true };
}
/** Period window of the milestone an expansion belongs to, when it is known. */
export function expansionWindow(
  draft: ValidatedDraftV1,
  milestoneKey: string
): { start: string; end: string } | undefined {
  if (draft.mode !== "ROADMAP") return undefined;
  const milestone = draft.milestones.find(entry => entry.key === milestoneKey);
  const period = draft.periods?.find(entry => entry.key === milestone?.periodKey);
  return period ? { start: period.startDate, end: period.endDate } : undefined;
}

export type WriteBoundary = "goal" | "quest" | "link" | "pointer" | "receipt";

type QuestFields = ReturnType<typeof mapQuest>;

/**
 * Create the Quests for a batch of items, and their links, in **two** statements.
 *
 * This exists because the obvious loop — create a Quest, create its link, for each item — is
 * not merely inelegant, it does not work. Reported by a student with an 84-item plan, and the
 * arithmetic explains it exactly: two round-trips per item is 168 statements, and a round-trip
 * to this deployment's database measures a median of ~119 ms, so confirmation needed about
 * twenty seconds inside a transaction whose budget is fifteen. The transaction was rolled back
 * every time and no Quest was ever created, which is precisely what "the planner isn't creating
 * the quests at all" looks like from the outside.
 *
 * `createManyAndReturn` and `createMany` make the cost independent of the plan's size: two
 * statements for four items and two for two hundred. The per-item loop that made this a
 * proportional cost is what the batched bound (`LIMITS.items`) was always going to need.
 *
 * The pairing of item to Quest is **positional**, because `INSERT … RETURNING` answers in the
 * order it was given, and it is *verified* rather than assumed: each returned row is checked
 * against the fields it should have been built from, and a mismatch refuses the whole write.
 * Two items whose signatures match are interchangeable — every column this signature covers is
 * what distinguishes one Quest from another in a batch, since the rest are the same for all of
 * them — so a reordering the check cannot see is a reordering that does not matter.
 */
export async function createQuestsAndLinks(
  tx: Tx,
  input: {
    planId: string;
    revisionId: string;
    items: readonly PlannerItem[];
    fields: readonly QuestFields[];
    /** The immutable record written beside each link; each mode adds its own lineage here. */
    baseline: (item: PlannerItem, fields: QuestFields) => Record<string, unknown>;
  },
  afterWrite?: (boundary: WriteBoundary) => void
): Promise<{ itemKey: string; questId: number }[]> {
  if (!input.items.length) return [];
  const created = await tx.quest.createManyAndReturn({
    data: input.fields as never,
    select: { id: true, title: true, description: true, scheduledFor: true, requiredMinutes: true },
  });
  afterWrite?.("quest");

  const signature = (row: { title?: string | null; description?: string | null; scheduledFor?: Date | string | null; requiredMinutes?: number | null }) =>
    [row.title, row.description, row.scheduledFor instanceof Date ? row.scheduledFor.toISOString().slice(0, 10) : String(row.scheduledFor ?? "").slice(0, 10), row.requiredMinutes].join("\u0000");
  if (created.length !== input.fields.length)
    throw new PlannerError(503, "PLANNER_WRITE_MISMATCH");
  for (let index = 0; index < created.length; index += 1) {
    const expected = input.fields[index];
    if (signature(created[index]) !== signature(expected))
      throw new PlannerError(503, "PLANNER_WRITE_MISMATCH");
  }

  const receipt = input.items.map((item, index) => ({ itemKey: item.key, questId: created[index].id }));
  await tx.plannerQuestLink.createMany({
    data: input.items.map((item, index) => ({
      planId: input.planId,
      itemKey: item.key,
      questId: created[index].id,
      createdRevisionId: input.revisionId,
      appliedRevisionId: input.revisionId,
      baseline: json(input.baseline(item, input.fields[index])),
    })) as never,
  });
  afterWrite?.("link");
  return receipt;
}
/** Failure hook is server-internal, never supplied from an HTTP request. */
export async function confirmDraft(userId: number, planId: string, raw: unknown, afterWrite?: (boundary: WriteBoundary) => void) {
  KeySchema.parse(planId); const body = boundedParse(CommitSchema, raw); const requestHash = digest(body);
  return transaction(userId, async tx => {
    const plan = await ownedPlan(tx, userId, planId, true);
    const replay = await tx.plannerRevision.findUnique({ where: { planId_confirmationKey: { planId, confirmationKey: body.idempotencyKey } } });
    if (replay) {
      if (replay.confirmationHash !== requestHash) throw new PlannerError(409, "IDEMPOTENCY_MISMATCH");
      return replay.confirmationReceipt as unknown as CommitReceipt;
    }
    const revision = await tx.plannerRevision.findFirst({ where: { id: body.revisionId, planId } });
    if (!revision) throw new PlannerError(404, "NOT_FOUND");
    if (revision.confirmationReceipt) throw new PlannerError(409, "REVISION_ALREADY_CONFIRMED");
    assertVersion(plan, body.expectedVersion);
    if (revision.operationState !== "SEALED" || revision.digest !== body.digest || plan.latestDraftRevisionId !== revision.id || revision.baseVersion + 1 !== plan.version) throw new PlannerError(409, "STALE_REVISION");
    const input = boundedParse(UserInputV1Schema, revision.inputSnapshot, LIMITS.inputBytes);
    const draft = validateDraft(input, revision.outputSnapshot);
    if (digest({ schemaVersion: 1, input, availability: revision.availabilitySnapshot, draft }) !== revision.digest) throw new PlannerError(409, "CONTENT_CHANGED");
    const selected = activeExamItems(draft.items).filter(i => body.selectedItemKeys.includes(i.key));
    // STRETCH work is optional and planner-owned: confirming a plan schedules the
    // CORE it was validated to contain, never the extra work. Optional work that
    // materialized here would become an ordinary Quest and could turn overdue, which
    // is exactly what "optional" must not mean. Promotion is a separate, explicit
    // action (`promoteStretch`).
    if (selected.some(isStretch)) throw new PlannerError(422, "STRETCH_REQUIRES_PROMOTION");
    /** The CORE subset every mode's confirmation rule is measured against. */
    const required = activeExamItems(draft.items).filter(i => !isStretch(i));
    // An expansion IS the executable segment, so its confirmation must cover the
    // whole reviewed segment rather than a subset that could bypass the checks.
    const expansion = draft.mode === "ROADMAP" ? draft.expansion : undefined;
    if (input.mode === "EXAM" && input.exam) {
      if (selected.length !== required.length) throw new PlannerError(422, "EXAM_SELECTION_REQUIRES_EDIT");
      if (excludedExamTopics(draft).length && !body.acknowledgeExclusions) throw new PlannerError(422, "EXCLUSIONS_REQUIRE_ACCEPTANCE");
    }
    // A mastery plan is one considered progression: confirming a subset would drop
    // the recall, practice or check the plan was validated to contain, so the whole
    // reviewed set is confirmed exactly like an Exam plan.
    if (input.mode === "MASTERY" && input.mastery && draft.mode === "MASTERY") {
      if (selected.length !== required.length)
        throw new PlannerError(422, "MASTERY_SELECTION_REQUIRES_EDIT");
      if (excludedMasteryTopics(draft).length && !body.acknowledgeExclusions)
        throw new PlannerError(422, "EXCLUSIONS_REQUIRE_ACCEPTANCE");
    }
    if (expansion && selected.length !== required.length)
      throw new PlannerError(422, "EXPANSION_SELECTION_REQUIRES_EDIT");
    if (input.mode === "ROADMAP" && input.roadmap && draft.mode === "ROADMAP" && !expansion) {
      // A strategic roadmap confirmation creates no Quests by design; a non-empty
      // selection would mean the caller expected execution that cannot exist.
      if (body.selectedItemKeys.length) throw new PlannerError(400, "UNKNOWN_ITEM");
      if (excludedRoadmapTopics(draft).length && !body.acknowledgeExclusions)
        throw new PlannerError(422, "EXCLUSIONS_REQUIRE_ACCEPTANCE");
    }
    if (selected.length !== body.selectedItemKeys.length) throw new PlannerError(400, "UNKNOWN_ITEM");
    const links = await tx.plannerQuestLink.findMany({ where: { planId }, include: { quest: true } });
    const availableKeys = new Set([...body.selectedItemKeys, ...links.filter(l => l.disposition === "LIVE").map(l => l.itemKey)]);
    if (selected.some(i => i.dependsOn.some(k => !availableKeys.has(k)))) throw new PlannerError(422, "MISSING_DEPENDENCY");
    // An expansion snapshots only its own period, so confirmation must re-read the
    // same window the operation sealed against.
    const state = await loadAvailability(
      tx,
      plan,
      input,
      expansion ? expansionWindow(draft, expansion.milestoneKey) : undefined
    );
    if (digest(state) !== digest(revision.availabilitySnapshot)) throw new PlannerError(409, "SCHEDULE_CHANGED");
    if (selected.some(i => i.date < localToday(state.timezone))) throw new PlannerError(409, "PAST_DATE");
    // Phase 1 can retain an existing identity or add work. Replacing execution is
    // deliberately deferred to reviewed rebalancing; tombstones never become new work.
    for (const item of selected) {
      const link = links.find(l => l.itemKey === item.key);
      if (!link) continue;
      const baseline = link.baseline as { item?: unknown };
      if (link.disposition !== "LIVE" || !link.quest || digest(baseline.item) !== digest(item)) throw new PlannerError(409, "EXECUTION_RECONCILIATION_REQUIRED");
    }
    const newItems = selected.filter(i => !links.some(l => l.itemKey === i.key));
    if (!validateCapacity(constraintCapacityInput(input), state, newItems).feasible) throw new PlannerError(422, "INFEASIBLE_CAPACITY");
    let goalId = plan.goalId;
    if (body.createGoal && goalId) throw new PlannerError(409, "GOAL_ALREADY_LINKED");
    if (body.createGoal) {
      const goal = await tx.goal.create({ data: { userId, title: plan.title, targetWeeks: Math.max(1, Math.ceil((Date.parse(input.endDate) - Date.parse(input.startDate)) / 604800000)), effortLevel: "NORMAL",
        // Existing Goal uses a representational UTC date. Planner dates stay strings.
        targetDate: new Date(`${input.endDate}T00:00:00Z`) } });
      goalId = goal.id; afterWrite?.("goal");
    }
    const alreadyLinked: CommitReceipt["items"] = [];
    const fresh: PlannerItem[] = [];
    for (const item of selected) {
      const existing = links.find(l => l.itemKey === item.key);
      if (existing) alreadyLinked.push({ itemKey: item.key, questId: existing.questId! });
      else fresh.push(item);
    }
    // Two statements for the whole plan, whatever its size — see `createQuestsAndLinks`.
    const created = await createQuestsAndLinks(
      tx,
      {
        planId,
        revisionId: revision.id,
        items: fresh,
        fields: fresh.map(item => mapQuest(item, userId, plan.subjectId, goalId)),
        baseline: (item, fields) => ({ item, quest: fields }),
      },
      afterWrite
    );
    const receiptItems: CommitReceipt["items"] = [...alreadyLinked, ...created];
    const receipt: CommitReceipt = { schemaVersion: 1, planId, revisionId: revision.id, digest: body.digest, goalId, version: plan.version + 1, items: receiptItems, committedAt: new Date().toISOString() };
    // Confirming an expansion must NOT take over the active pointer: the roadmap
    // stays the active strategic layer while the segment becomes executable. A
    // roadmap GENERATE/EDIT confirmation still becomes the active revision.
    await tx.plannerPlan.update({ where: { id: planId }, data: { activeRevisionId: expansion ? plan.activeRevisionId : revision.id, latestDraftRevisionId: null, state: "ACTIVE", goalId, version: { increment: 1 } } }); afterWrite?.("pointer");
    await tx.plannerRevision.update({ where: { id: revision.id }, data: { confirmationKey: body.idempotencyKey, confirmationHash: requestHash, confirmationReceipt: json(receipt), confirmedAt: new Date(receipt.committedAt) } }); afterWrite?.("receipt");
    return receipt;
  });
}
