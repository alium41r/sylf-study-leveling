// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ModelProposalV1Schema, type ValidatedDraftV1 } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import { createPlanShell, getPlanDetail } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import {
  beginExpansion,
  beginOperation,
  finishExpansion,
  finishOperation,
} from "@/lib/planner/server/operations";
import {
  beginRebalance,
  confirmRebalance,
  finishRebalance,
} from "@/lib/planner/server/rebalance";
import { roadmapFixture, roadmapProposal } from "./roadmap-fixtures";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";

// Opt-in only. Never use DATABASE_URL, DIRECT_URL, or a hosted database here.
const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("planner"))
      throw new Error("Disposable localhost planner database required");
  }
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url ?? "postgresql://localhost/unused_planner_tests",
      }),
    }),
  };
});
import { prisma } from "@/lib/prisma";

/**
 * Replanning the two Roadmap layers and Mastery, against real PostgreSQL.
 *
 * The Exam path is covered in `database-rebalance.test.ts`; this file proves the
 * layer-specific invariants: an expanded period is an anchor for a strategic
 * rebalance, a period revision touches only its own period and never becomes the
 * plan pointer, and a Mastery replan treats completed stages as satisfied history.
 */
describe.skipIf(!database)("planner PostgreSQL replan by mode", () => {
  let userId: number;

  beforeEach(async () => {
    userId = (
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@planner.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [],
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A confirmed strategic Roadmap with its first period already expanded. */
  async function confirmedRoadmapWithExpansion() {
    const input = roadmapFixture();
    const plan = await createPlanShell(userId, {
      mode: "ROADMAP",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const operationKey = randomUUID();
    await beginOperation(userId, plan.id, {
      operationKey,
      expectedVersion: 0,
      input,
    });
    const revision = await finishOperation(
      userId,
      plan.id,
      operationKey,
      roadmapProposal(input),
      new Date()
    );
    const strategic = revision.outputSnapshot as unknown as ValidatedDraftV1;
    await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: [],
      createGoal: false,
    });
    const milestone = (strategic as Extract<ValidatedDraftV1, { mode: "ROADMAP" }>)
      .milestones[0];
    const topicKey = (
      strategic as Extract<ValidatedDraftV1, { mode: "ROADMAP" }>
    ).milestones[0].topicKeys![0];
    const period = (
      strategic as Extract<ValidatedDraftV1, { mode: "ROADMAP" }>
    ).periods!.find((entry) => entry.key === milestone.periodKey)!;
    const expandKey = randomUUID();
    await beginExpansion(userId, plan.id, {
      operationKey: expandKey,
      expectedVersion: 2,
      milestoneKey: milestone.key,
    });
    const expansionRevision = await finishExpansion(
      userId,
      plan.id,
      expandKey,
      milestone.key,
      [
        {
          ref: "i1",
          topicRef: "t1",
          relatedTopicRefs: [],
          dependsOn: [],
          type: "LEARN",
          title: "First pass on the period's unit",
          description: "Work through the planned material for this period.",
          rationale: "First pass before practice.",
          completionCriteria: "Complete the planned reading and note open questions.",
          date: period.startDate,
          minutes: 45,
        },
        {
          ref: "i2",
          topicRef: "t1",
          relatedTopicRefs: [],
          dependsOn: ["i1"],
          type: "PRACTICE",
          title: "Practice the period's unit",
          description: "Work a bounded practice set for the period's unit.",
          rationale: "Practice after the first pass.",
          completionCriteria: "Complete one bounded practice set and review every error.",
          date: period.endDate,
          minutes: 45,
        },
      ],
      new Date()
    );
    const expansionDraft = expansionRevision.outputSnapshot as unknown as ValidatedDraftV1;
    const expansionReceipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: expansionRevision.id,
      digest: expansionRevision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
      selectedItemKeys: expansionDraft.items.map((item) => item.key),
      createGoal: false,
    });
    return {
      input,
      plan,
      strategic,
      topicKey,
      milestoneKey: milestone.key,
      period,
      expansionRevision,
      expansionDraft,
      expansionReceipt,
      base: {
        // The strategic layer is the active revision; the expansion is executable.
        revisionId: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } }))
          .activeRevisionId!,
      },
    };
  }

  it("rebalances only unexpanded milestones and keeps the expanded period as an anchor", async () => {
    const p = await confirmedRoadmapWithExpansion();
    const strategic = p.strategic as Extract<ValidatedDraftV1, { mode: "ROADMAP" }>;
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 4,
      baseRevisionId: p.base.revisionId,
      reasonCode: "AVAILABILITY_CHANGED",
      inputChanges: ["AVAILABILITY"],
      scope: { milestoneKey: null },
    });
    expect(begin.acquired).toBe(true);
    const meta = (
      begin.inputSnapshot as {
        rebalance: {
          eligible: { ref: string; itemKey: string }[];
          frozenItemKeys: string[];
        };
      }
    ).rebalance;
    // The expanded period's milestone is frozen; every other milestone may change.
    expect(meta.frozenItemKeys).toEqual([p.milestoneKey]);
    expect(meta.eligible.map((token) => token.itemKey)).not.toContain(p.milestoneKey);
    expect(meta.eligible).toHaveLength(strategic.milestones.length - 1);

    // Retain every editable milestone, and move one of them later.
    const editable = strategic.milestones.filter(
      (milestone) => milestone.key !== p.milestoneKey
    );
    const proposal = ModelProposalV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      outcome: p.input.outcome,
      assumptions: [],
      warnings: [],
      topics: strategic.topics.map((topic) => ({
        ref: topic.scopeRef,
        title: topic.title,
        parentRef: null,
      })),
      milestones: editable.map((milestone, index) => ({
        ref: `m${index + 1}`,
        title: milestone.title,
        date: milestone.date,
        periodRef: `p${(strategic.periods ?? []).findIndex(
          (entry) => entry.key === milestone.periodKey
        ) + 1}`,
        outcome: milestone.outcome,
        topicRefs: (milestone.topicKeys ?? []).map(
          (key) => strategic.topics.find((topic) => topic.key === key)?.scopeRef ?? "t1"
        ),
        effortMinutes: milestone.effortMinutes ?? 0,
        checkpoint: milestone.checkpoint ?? undefined,
        dependsOn: [],
        retainRef: meta.eligible.find((token) => token.itemKey === milestone.key)!.ref,
      })),
      items: [],
    });
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      proposal
    );
    expect(sealed.result.diff.frozen).toBe(1);
    expect(sealed.result.diff.affectedHistory).toBe(0);
    expect(sealed.result.diff.counts.RETAIN).toBe(editable.length);

    const receipt = await confirmRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 5,
      idempotencyKey: randomUUID(),
    });
    expect(receipt.items).toEqual([]);
    const after = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } });
    // The strategic rebalance becomes the active strategic revision.
    expect(after.activeRevisionId).toBe(sealed.revision.id);
    const revised = await prisma.plannerRevision.findUniqueOrThrow({
      where: { id: sealed.revision.id },
    });
    const revisedDraft = revised.outputSnapshot as unknown as Extract<
      ValidatedDraftV1,
      { mode: "ROADMAP" }
    >;
    // The expanded period's milestone survived verbatim, with its own key.
    const anchor = revisedDraft.milestones.find(
      (milestone) => milestone.key === p.milestoneKey
    );
    expect(anchor).toMatchObject({
      title: strategic.milestones[0].title,
      date: strategic.milestones[0].date,
    });
    expect(revisedDraft.milestones).toHaveLength(strategic.milestones.length);
    // The original expansion history is untouched, and its Quests were not recreated.
    const expansion = await prisma.plannerRevision.findUniqueOrThrow({
      where: { id: p.expansionRevision.id },
    });
    expect(expansion.confirmationReceipt).not.toBeNull();
    expect(await prisma.quest.count({ where: { userId } })).toBe(2);
    expect(
      await prisma.plannerQuestLink.count({
        where: { planId: p.plan.id, disposition: "LIVE" },
      })
    ).toBe(2);
  });

  it("revises one expanded period without touching its neighbours or the plan pointer", async () => {
    const p = await confirmedRoadmapWithExpansion();
    const expansionDraft = p.expansionDraft as Extract<
      ValidatedDraftV1,
      { mode: "ROADMAP" }
    >;
    const structural = JSON.stringify(
      expansionDraft.milestones.map((milestone) => [
        milestone.key,
        milestone.title,
        milestone.date,
        milestone.periodKey,
      ])
    );
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 4,
      // A period revision is based on that period's confirmed expansion.
      baseRevisionId: p.expansionRevision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: p.milestoneKey },
    });
    const meta = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[] };
      }
    ).rebalance;
    // Only this period's unstarted work is offered.
    expect(meta.eligible.map((token) => token.itemKey).sort()).toEqual(
      expansionDraft.items.map((item) => item.key).sort()
    );
    const proposal = ModelProposalV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      outcome: p.input.outcome,
      assumptions: [],
      warnings: [],
      topics: [
        {
          ref: "t1",
          title:
            expansionDraft.topics.find((topic) => topic.key === p.topicKey)?.title ??
            "",
          parentRef: null,
        },
      ],
      milestones: [],
      items: expansionDraft.items.map((item) => ({
        ref: `i${expansionDraft.items.indexOf(item) + 1}`,
        topicRef: "t1",
        relatedTopicRefs: [],
        milestoneRef: null,
        dependsOn: [],
        type: item.type,
        stage: item.stage ?? undefined,
        title: item.title,
        description: item.description,
        rationale: item.rationale ?? "Keeps the period's work aligned.",
        completionCriteria: item.completionCriteria,
        date: item.date,
        minutes: item.minutes,
        retainRef: meta.eligible.find((token) => token.itemKey === item.key)!.ref,
      })),
    });
    const sealed = await finishRebalance(userId, p.plan.id, begin.operationKey, proposal);
    const receipt = await confirmRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 5,
      idempotencyKey: randomUUID(),
    });
    // Retained items keep their Quests; nothing was created or removed.
    expect(receipt.items).toHaveLength(expansionDraft.items.length);
    expect(await prisma.quest.count({ where: { userId } })).toBe(2);
    const plan = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } });
    // A period revision never takes over the pointer: the strategic layer stays.
    expect(plan.activeRevisionId).toBe(p.base.revisionId);
    expect(plan.latestDraftRevisionId).toBeNull();
    const revised = await prisma.plannerRevision.findUniqueOrThrow({
      where: { id: sealed.revision.id },
    });
    const revisedDraft = revised.outputSnapshot as unknown as Extract<
      ValidatedDraftV1,
      { mode: "ROADMAP" }
    >;
    // Neighbouring periods and every unrelated milestone are byte-identical.
    expect(
      JSON.stringify(
        revisedDraft.milestones.map((milestone) => [
          milestone.key,
          milestone.title,
          milestone.date,
          milestone.periodKey,
        ])
      )
    ).toBe(structural);
    expect(revisedDraft.expansion?.milestoneKey).toBe(p.milestoneKey);
    // It spent the rebalance bucket, not the expansion one.
    const quotas = await prisma.userQuota.findMany({ where: { userId } });
    expect(quotas.map((quota) => quota.feature)).toContain("plannerRebalance");
    expect(
      quotas
        .filter((quota) => quota.feature === "plannerExpansion")
        .reduce((total, quota) => total + quota.used, 0)
    ).toBe(1);
  });

  it("rebalances the remaining Mastery stages while completed stages stay satisfied", async () => {
    const input = masteryFixture();
    const plan = await createPlanShell(userId, {
      mode: "MASTERY",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const operationKey = randomUUID();
    await beginOperation(userId, plan.id, {
      operationKey,
      expectedVersion: 0,
      input,
    });
    const revision = await finishOperation(
      userId,
      plan.id,
      operationKey,
      masteryProposal(input),
      new Date()
    );
    const draft = revision.outputSnapshot as unknown as Extract<
      ValidatedDraftV1,
      { mode: "MASTERY" }
    >;
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    // Orientation and learning are done; the rest of the progression is not.
    const doneKeys = draft.items
      .filter(
        (item) => item.masteryStage === "UNDERSTAND" || item.masteryStage === "LEARN"
      )
      .map((item) => item.key);
    for (const key of doneKeys) {
      const questId = receipt.items.find((entry) => entry.itemKey === key)!.questId;
      await prisma.quest.update({
        where: { id: questId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    const begin = await beginRebalance(userId, plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: revision.id,
      reasonCode: "MASTERY_CHECK_NEEDS_WORK",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    const meta = (
      begin.inputSnapshot as {
        rebalance: {
          eligible: { ref: string; itemKey: string }[];
          frozenItemKeys: string[];
        };
      }
    ).rebalance;
    expect(meta.frozenItemKeys.sort()).toEqual([...doneKeys].sort());
    expect(meta.eligible.map((token) => token.itemKey)).not.toContain(doneKeys[0]);
    const eligibleItems = draft.items.filter((item) =>
      meta.eligible.some((token) => token.itemKey === item.key)
    );
    const scopeRefOf = (topicKey: string) =>
      draft.topics.find((topic) => topic.key === topicKey)?.scopeRef ?? "t1";
    const proposal = ModelProposalV1Schema.parse({
      schemaVersion: 1,
      mode: "MASTERY",
      focus: input.focus,
      assumptions: [],
      warnings: [],
      topics: draft.topics.map((topic) => ({
        ref: topic.scopeRef,
        title: topic.title,
        parentRef: null,
      })),
      milestones: [],
      items: eligibleItems.map((item, index) => ({
        ref: `i${index + 1}`,
        topicRef: scopeRefOf(item.topicKey),
        relatedTopicRefs: (item.relatedTopicKeys ?? []).map(scopeRefOf),
        milestoneRef: null,
        dependsOn: [],
        type: item.type,
        masteryStage: item.masteryStage,
        title: item.title,
        description: item.description,
        rationale: item.rationale ?? "Keeps the remaining progression.",
        completionCriteria: item.completionCriteria,
        date: item.date,
        minutes: item.minutes,
        retainRef: meta.eligible.find((token) => token.itemKey === item.key)!.ref,
      })),
    });
    const sealed = await finishRebalance(userId, plan.id, begin.operationKey, proposal);
    expect(sealed.result.diff.counts.RETAIN).toBe(eligibleItems.length);
    expect(sealed.result.diff.affectedHistory).toBe(0);
    const after = await confirmRebalance(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
    });
    expect(after.items).toHaveLength(eligibleItems.length);
    // Completed stages were never regenerated and their Quests are untouched.
    for (const key of doneKeys) {
      const questId = receipt.items.find((entry) => entry.itemKey === key)!.questId;
      expect(await prisma.quest.findUnique({ where: { id: questId } })).toMatchObject({
        status: "COMPLETED",
      });
      expect(
        await prisma.plannerQuestLink.findUnique({
          where: { planId_itemKey: { planId: plan.id, itemKey: key } },
        })
      ).toMatchObject({ disposition: "LIVE" });
    }
    const revised = await prisma.plannerRevision.findUniqueOrThrow({
      where: { id: sealed.revision.id },
    });
    const revisedDraft = revised.outputSnapshot as unknown as Extract<
      ValidatedDraftV1,
      { mode: "MASTERY" }
    >;
    // The revised plan still ends with its single check, and carries no completed stage.
    expect(revisedDraft.items.at(-1)?.masteryStage).toBe("MASTERY_CHECK");
    expect(
      revisedDraft.items.filter((item) => item.masteryStage === "MASTERY_CHECK")
    ).toHaveLength(1);
    expect(revisedDraft.items.some((item) => item.masteryStage === "LEARN")).toBe(
      false
    );
    const detail = await getPlanDetail(userId, plan.id);
    expect(detail.plan.mode).toBe("MASTERY");
    // Progress spans revisions: the previous revision's completed items are history.
    expect(detail.historyItems.length).toBeGreaterThan(0);
  });
});
