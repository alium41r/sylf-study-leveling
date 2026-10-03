import "server-only";
import {
  boundedParse,
  KeySchema,
  UserInputV1Schema,
  ValidatedDraftV1Schema,
  LIMITS,
  type PlannerItem,
  type ValidatedDraftV1,
} from "../contracts";
import { validateCapacity } from "../capacity";
import { constraintCapacityInput } from "../exam-policy";
import { localToday } from "../dates";
import { PlannerError } from "../errors";
import { plannerTelemetry } from "../telemetry";
import { assertVersion, json, loadAvailability, ownedPlan, transaction, type Tx } from "./core";
import { mapQuest } from "./materialize";
import { prisma } from "@/lib/prisma";
import {
  baselineItem,
  ReofferAcceptSchema,
  ReofferDeclineSchema,
  reoffersFor,
  type ReofferAcceptance,
  type ReofferOffer,
  type ReofferState,
} from "../reoffer";

/**
 * The released-work re-offer, server side.
 *
 * Three operations, and the shape of each is the whole argument for the feature:
 *
 * - `reofferOffers` is a **read**. It derives what is still missing from the current draft and
 *   returns at most a few offers; it writes nothing, including no "we offered this" marker,
 *   because showing a student a question must not change their plan.
 * - `acceptReoffer` **materialises one Quest**, through the same door stretch promotion uses:
 *   an ordinary Quest with an ordinary link, created from a described item, with the plan's
 *   version bumped so any sealed proposal built on the older reality is correctly refused.
 *   The revision is untouched — the reviewed plan did not change; the student added execution
 *   they explicitly asked for.
 * - `declineReoffer` records one closed state on the tombstone and nothing else. After it,
 *   `reoffersFor` skips that item for good.
 *
 * Nothing here can write `disposition`. The tombstone stays `USER_RELEASED` forever, and the
 * only durable trace of a re-offer is the bookkeeping columns the guard lets move.
 */

interface TombstoneRow {
  itemKey: string;
  baseline: unknown;
  removedAt: Date | null;
  reofferState: string | null;
}

const asState = (value: string | null): ReofferState | null =>
  value === "OFFERED" || value === "ACCEPTED" || value === "DECLINED" ? value : null;

/** The plan's confirmed draft and the tombstones it holds, read once and shared. */
async function readTombstones(
  tx: Tx,
  userId: number,
  planId: string
): Promise<{ draft: ValidatedDraftV1; revisionId: string; tombstones: TombstoneRow[] } | null> {
  const plan = await ownedPlan(tx, userId, planId);
  if (!plan.activeRevisionId) return null;
  const revision = await tx.plannerRevision.findUnique({
    where: { id: plan.activeRevisionId },
    select: { outputSnapshot: true },
  });
  if (!revision?.outputSnapshot) return null;
  const draft = boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot);
  const tombstones = await tx.plannerQuestLink.findMany({
    where: { planId, disposition: "USER_RELEASED" },
    select: { itemKey: true, baseline: true, removedAt: true, reofferState: true },
    take: LIMITS.items,
  });
  return { draft, revisionId: plan.activeRevisionId, tombstones };
}

/**
 * The offers a plan currently justifies, in a stable order.
 *
 * Read-only by construction: no counter is incremented, no timestamp written. A student who
 * reloads the page ten times sees the same three offers, which is exactly what a question
 * should do — it is the *answer* that is recorded, not the asking.
 */
export async function reofferOffers(
  userId: number,
  planId: string
): Promise<ReofferOffer[]> {
  KeySchema.parse(planId);
  const read = await readTombstones(prisma, userId, planId);
  if (!read) return [];
  const offers = reoffersFor(
    read.draft,
    read.tombstones.map((row) => ({
      itemKey: row.itemKey,
      removedAt: row.removedAt?.toISOString() ?? null,
      item: baselineItem(row.baseline),
      reofferState: asState(row.reofferState),
    }))
  );
  if (offers.length) {
    // Counted, never described: how many offers a plan justified is a number, and the items
    // they concern stay out of telemetry entirely.
    const plan = await prisma.plannerPlan.findFirst({
      where: { id: planId, userId },
      select: { mode: true },
    });
    plannerTelemetry("released_item_reoffer_offered", {
      mode: (plan?.mode ?? "EXAM") as "EXAM" | "ROADMAP" | "MASTERY",
      offers: offers.length,
    });
  }
  return offers;
}

/**
 * Accept one offer: create the replacement as ordinary executable work.
 *
 * The door is stretch promotion's, and for the same reasons. An already-generated item needs
 * no model, so this spends no quota and is instant. The revision, its digest and the plan's
 * pointer are untouched, because the reviewed plan already described this work — what the
 * student is adding is *execution* of a replacement they were shown and asked for. And it is
 * idempotent through the link's own item key: accepting twice returns the first Quest rather
 * than creating a second one.
 */
export async function acceptReoffer(
  userId: number,
  planId: string,
  raw: unknown,
  now = new Date()
): Promise<ReofferAcceptance> {
  KeySchema.parse(planId);
  const body = boundedParse(ReofferAcceptSchema, raw);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId);
    assertVersion(plan, body.expectedVersion);
    const read = await readTombstones(tx, userId, planId);
    if (!read) throw new PlannerError(409, "PLAN_NOT_CONFIRMED");

    const row = read.tombstones.find((entry) => entry.itemKey === body.releasedItemKey);
    if (!row) throw new PlannerError(404, "REOFFER_NOT_FOUND");
    const state = asState(row.reofferState);
    // Declining was an answer. Accepting after a decline would make the decline meaningless.
    if (state === "DECLINED") throw new PlannerError(409, "REOFFER_DECLINED");

    const revision = await tx.plannerRevision.findFirst({
      where: { id: read.revisionId, planId },
      select: { id: true, inputSnapshot: true, operationState: true, confirmationReceipt: true },
    });
    if (!revision || revision.operationState !== "SEALED" || !revision.confirmationReceipt)
      throw new PlannerError(404, "NOT_FOUND");
    const input = boundedParse(UserInputV1Schema, revision.inputSnapshot, LIMITS.inputBytes);

    const offers = reoffersFor(read.draft, [
      {
        itemKey: row.itemKey,
        removedAt: row.removedAt?.toISOString() ?? null,
        item: baselineItem(row.baseline),
        // Offered here whatever the stored state: an ACCEPTED offer is re-derived below as
        // "the replacement already exists", which is the idempotent answer, and an OFFERED
        // one is the ordinary case.
        reofferState: state === "ACCEPTED" ? null : state,
      },
    ]);
    const released = baselineItem(row.baseline);

    /**
     * Idempotency is the lineage, not a stored flag.
     *
     * A replacement this plan already created for this tombstone *is* the answer to a repeat
     * request, so it is returned rather than duplicated. It is found by following the same
     * field that keeps the two items distinguishable everywhere else — the replacement's own
     * record of what it stands in for — which is why a lost response can be retried safely.
     */
    const existing = await tx.plannerQuestLink.findFirst({
      where: {
        planId,
        questId: { not: null },
        baseline: { path: ["reoffer", "replacementForReleasedItemKey"], equals: row.itemKey },
      },
      select: { itemKey: true, questId: true },
    });
    if (existing?.questId)
      return {
        schemaVersion: 1 as const,
        planId,
        version: plan.version,
        releasedItemKey: row.itemKey,
        replacementItemKey: existing.itemKey,
        questId: existing.questId,
        created: false,
        acceptedAt: now.toISOString(),
      };

    const offer = offers[0];
    if (!offer) throw new PlannerError(409, "REOFFER_NOT_ALLOWED");
    if (!released) throw new PlannerError(404, "REOFFER_NOT_FOUND");

    const title = offer?.replacement.title ?? `${released.title} (shorter replacement)`;
    const minutes = offer?.replacement.minutes ?? Math.max(15, Math.round(released.minutes * 0.6));

    /**
     * The replacement is a *new* item with its own key, and it is written into the confirmed
     * draft so that every reader — the plan view, the release path, a later replan — sees it
     * as part of the plan rather than as an orphan Quest. The lineage field is what makes it
     * a replacement, and what stops a second one ever being created.
     */
    const replacementKey = crypto.randomUUID();
    const item: PlannerItem = {
      ...released,
      key: replacementKey,
      title,
      minutes,
      date: released.date,
      locked: false,
      removed: false,
      dependsOn: [],
      replacementForReleasedItemKey: row.itemKey,
    };

    const state$ = await loadAvailability(tx, plan, input);
    const today = localToday(state$.timezone);
    // Work in the past would be overdue the moment it existed. The replacement is placed on
    // the original date when that is still ahead, and otherwise on the earliest date the
    // plan's own availability can still take it.
    const todayKey = body.today ?? today;
    if (item.date < todayKey) {
      const days = validateCapacity(constraintCapacityInput(input), state$, itemsOf(read.draft)).days;
      const next = days.find((day) => !day.blocked && day.remaining >= item.minutes && day.date >= todayKey);
      if (!next) throw new PlannerError(422, "REOFFER_NO_CAPACITY");
      item.date = next.date;
    }
    if (!validateCapacity(constraintCapacityInput(input), state$, [item]).feasible)
      throw new PlannerError(422, "REOFFER_NO_CAPACITY");

    const fields = mapQuest(item, userId, plan.subjectId, plan.goalId);
    const quest = await tx.quest.create({ data: fields });
    await tx.plannerQuestLink.create({
      data: {
        planId,
        itemKey: replacementKey,
        questId: quest.id,
        createdRevisionId: revision.id,
        appliedRevisionId: revision.id,
        baseline: json({
          item,
          quest: fields,
          reoffer: {
            replacementForReleasedItemKey: row.itemKey,
            acceptedAt: now.toISOString(),
          },
        }),
      },
    });
    await tx.plannerQuestLink.update({
      where: { planId_itemKey: { planId, itemKey: row.itemKey } },
      data: { reofferState: "ACCEPTED", reofferedAt: now.toISOString() },
    });
    await tx.plannerPlan.update({ where: { id: planId }, data: { version: { increment: 1 } } });

    plannerTelemetry("released_item_reoffer_accepted", {
      mode: plan.mode as "EXAM" | "ROADMAP" | "MASTERY",
    });
    return {
      schemaVersion: 1 as const,
      planId,
      version: plan.version + 1,
      releasedItemKey: row.itemKey,
      replacementItemKey: replacementKey,
      questId: quest.id,
      created: true,
      acceptedAt: now.toISOString(),
    };
  });
}

const itemsOf = (draft: ValidatedDraftV1): { date: string; minutes: number }[] =>
  draft.items.filter((item) => !item.removed).map((item) => ({ date: item.date, minutes: item.minutes }));

/**
 * Decline one offer.
 *
 * One column changes and the tombstone is otherwise exactly as it was. The student's decision
 * to remove the work, and their decision not to have it back, are both recorded; Sylf will not
 * raise this item again.
 */
export async function declineReoffer(
  userId: number,
  planId: string,
  raw: unknown,
  now = new Date()
): Promise<{ planId: string; releasedItemKey: string; declinedAt: string }> {
  KeySchema.parse(planId);
  const body = boundedParse(ReofferDeclineSchema, raw);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId);
    assertVersion(plan, body.expectedVersion);
    const row = await tx.plannerQuestLink.findFirst({
      where: { planId, itemKey: body.releasedItemKey, disposition: "USER_RELEASED" },
      select: { itemKey: true, reofferState: true },
    });
    if (!row) throw new PlannerError(404, "REOFFER_NOT_FOUND");
    if (row.reofferState === "ACCEPTED") throw new PlannerError(409, "REOFFER_ALREADY_ACCEPTED");
    if (row.reofferState !== "DECLINED")
      await tx.plannerQuestLink.update({
        where: { planId_itemKey: { planId, itemKey: row.itemKey } },
        data: { reofferState: "DECLINED", reofferedAt: now.toISOString() },
      });
    plannerTelemetry("released_item_reoffer_declined", {
      mode: plan.mode as "EXAM" | "ROADMAP" | "MASTERY",
    });
    return { planId, releasedItemKey: row.itemKey, declinedAt: now.toISOString() };
  });
}
