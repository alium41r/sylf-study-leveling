// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CommitReceipt, ValidatedDraftV1 } from "@/lib/planner/contracts";
import { ModelProposalV1Schema } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import { createPlanShell, getPlanDetail } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import { manualLinkedQuest } from "@/lib/planner/server/mutation-guards";
import {
  beginRebalance,
  confirmRebalance,
  finishRebalance,
  readExecution,
} from "@/lib/planner/server/rebalance";
import { examFixture, examProposal } from "./exam-fixtures";

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
 * User-approved adaptive replanning against a real PostgreSQL instance.
 *
 * This is the phase's central guarantee under test: a replan is a proposal the user
 * confirms, it reconciles only what it may, protected execution is never rewritten,
 * confirmation is atomic and idempotent, and a reality change between proposal and
 * confirmation fails closed with zero partial mutations.
 */
describe.skipIf(!database)("planner PostgreSQL replan reconciliation", () => {
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

  /** A confirmed Exam plan whose Quests exist, with the mix of states a replan sees. */
  async function confirmedExam() {
    const input = examFixture();
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
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
      examProposal(),
      new Date()
    );
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    const receipt: CommitReceipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    return { input, plan, revision, draft, receipt };
  }

  async function startSession(questId: number) {
    const rows = await prisma.$queryRaw<Array<{ result: { id: number } }>>`
      SELECT public.start_study_session(${userId}::int, ${questId}::int, NULL::int, 0::int) AS result`;
    const sessionId = rows[0].result.id;
    await prisma.studySession.update({
      where: { id: sessionId },
      data: { startedAt: new Date(Date.now() - 3_600_000) },
    });
    return sessionId;
  }

  /**
   * A proposal over an explicit list of the confirmed plan's items.
   *
   * Items whose key is in `retainKeys` are returned unchanged with their retention
   * token; that is the lowest-churn replan there is. Anything else is proposed as new
   * work (no token), which is how a supersede or a genuine addition is expressed.
   * The item named by `moveKey` gets a new date, which makes it a move.
   */
  function buildProposal(args: {
    draft: ValidatedDraftV1;
    tokens: { ref: string; itemKey: string }[];
    includeKeys?: string[];
    retainKeys?: string[];
    moveKey?: string;
    newDate?: string;
  }) {
    const { draft, tokens } = args;
    const tokenByKey = new Map(tokens.map((token) => [token.ref, token.itemKey]));
    const keyByToken = new Map(tokens.map((token) => [token.itemKey, token.ref]));
    const include = args.includeKeys ?? draft.items.map((item) => item.key);
    const retain = new Set(args.retainKeys ?? tokens.map((token) => token.itemKey));
    const scopeOf = (topicKey: string) =>
      draft.topics.find((topic) => topic.key === topicKey)?.scopeRef ?? "t1";
    return ModelProposalV1Schema.parse({
      schemaVersion: 1,
      mode: "EXAM",
      examDate: examFixture().examDate,
      assumptions: [],
      warnings: [],
      topics: draft.topics.map((topic) => ({
        ref: topic.scopeRef,
        title: topic.title,
        parentRef: null,
      })),
      milestones: [],
      items: include.map((key, index) => {
        const item = draft.items.find((entry) => entry.key === key)!;
        const token = keyByToken.get(key);
        return {
          ref: `i${index + 1}`,
          topicRef: scopeOf(item.topicKey),
          relatedTopicRefs: (item.relatedTopicKeys ?? []).map(scopeOf),
          milestoneRef: null,
          dependsOn: [],
          type: item.type,
          stage: item.stage,
          title: item.title,
          description: item.description,
          rationale: "Keeps the remaining work aligned with the plan.",
          completionCriteria: item.completionCriteria,
          date: key === args.moveKey ? args.newDate : item.date,
          minutes: item.minutes,
          // A retained token is only valid for work that is still eligible.
          ...(token && retain.has(key) ? { retainRef: token } : {}),
        };
      }),
    });
  }

  /** The item a safe, low-churn move targets: a late item, never the coverage step. */
  function movableKey(draft: ValidatedDraftV1): string {
    const item = draft.items.find((entry) => entry.type === "MOCK_EXAM");
    return item?.key ?? draft.items.at(-1)!.key;
  }

  it("keeps protected work untouched and reconciles only the approved item", async () => {
    const p = await confirmedExam();
    const questIds = p.receipt.items.map((item) => item.questId);
    // One completed, one in progress, one overdue, the rest untouched.
    const completedQuest = questIds[0];
    const startedQuest = questIds[1];
    await prisma.quest.update({
      where: { id: completedQuest },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await startSession(startedQuest);

    const before = await prisma.quest.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });

    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    expect(begin.acquired).toBe(true);
    // Eligibility is decided by the server from live state, never by the model.
    const tokens = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[]; frozenItemKeys: string[] };
      }
    ).rebalance;
    const frozenKeys = new Set(tokens.frozenItemKeys);
    expect(frozenKeys.has(p.draft.items[0].key)).toBe(true);
    expect(frozenKeys.has(p.draft.items[1].key)).toBe(true);
    // Completed and started work is frozen; everything else is eligible. The proposal
    // below covers exactly the eligible set, which is what a low-churn replan does.
    expect(tokens.eligible.map((token) => token.itemKey)).not.toContain(
      p.draft.items[0].key
    );
    expect(tokens.eligible.map((token) => token.itemKey)).not.toContain(
      p.draft.items[1].key
    );
    expect(tokens.eligible).toHaveLength(p.draft.items.length - 2);

    const movedKey = movableKey(p.draft);
    const proposal = buildProposal({
      draft: p.draft,
      tokens: tokens.eligible,
      includeKeys: tokens.eligible.map((token) => token.itemKey),
      moveKey: movedKey,
      newDate: "2030-01-23",
    });
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      proposal
    );
    expect(sealed.result.diff.counts.MOVE).toBe(1);
    expect(sealed.result.diff.affectedHistory).toBe(0);

    // Nothing about live execution has changed yet: a proposal is only a proposal.
    const during = await prisma.quest.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });
    expect(during).toEqual(before);

    const receipt = await confirmRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
    });
    // Protected execution is byte-identical: same rows, same dates, same status.
    for (const quest of before.filter(
      (row) => row.id === completedQuest || row.id === startedQuest || row.id === questIds[3]
    )) {
      expect(await prisma.quest.findUnique({ where: { id: quest.id } })).toEqual(quest);
    }
    // Exactly one Quest moved: the old one is tombstoned, its replacement carries the
    // new date, and the retained items keep the very same Quests.
    const moveEntry = sealed.result.diff.entries.find(
      (entry) => entry.change === "MOVE"
    )!;
    expect(moveEntry.supersedesKey).toBe(movedKey);
    const movedQuest = receipt.items.find(
      (item) => item.itemKey === moveEntry.key
    )!;
    expect(movedQuest).toBeDefined();
    expect(
      (await prisma.quest.findUniqueOrThrow({ where: { id: movedQuest!.questId } }))
        .scheduledFor
    ).toBe("2030-01-23");
    expect(
      (await prisma.plannerQuestLink.findUnique({
        where: { planId_itemKey: { planId: p.plan.id, itemKey: movedKey } },
      }))?.disposition
    ).toBe("DELETED");
    // Retained work keeps its Quest and its live link.
    for (const retained of before.filter(
      (row) => row.id !== movedQuest.questId && questIds.includes(row.id)
    )) {
      const stillLinked = await prisma.plannerQuestLink.findFirst({
        where: { planId: p.plan.id, questId: retained.id },
      });
      expect(stillLinked?.disposition ?? "LIVE").toBe("LIVE");
    }
    // Replacement lineage is recorded on the new link, pointing at what it replaced.
    const replacementLink = await prisma.plannerQuestLink.findFirstOrThrow({
      where: { planId: p.plan.id, itemKey: movedQuest!.itemKey },
    });
    expect(
      (replacementLink.baseline as { replaces?: { itemKey: string } }).replaces?.itemKey
    ).toBe(movedKey);
    // No Quest was lost or gained, and no reward was minted by the reconciliation.
    expect(await prisma.quest.count({ where: { userId } })).toBe(before.length);
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(0);
    const plan = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } });
    expect(plan.activeRevisionId).toBe(sealed.revision.id);
    expect(plan.latestDraftRevisionId).toBeNull();
  });

  it("replays the same confirmation without duplicating anything", async () => {
    const p = await confirmedExam();
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    const tokens = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[] };
      }
    ).rebalance.eligible;
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      buildProposal({
        draft: p.draft,
        tokens,
        includeKeys: tokens.map((token) => token.itemKey),
        moveKey: movableKey(p.draft),
        newDate: "2030-01-23",
      })
    );
    const body = {
      schemaVersion: 1 as const,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
    };
    const [first, second] = await Promise.all([
      confirmRebalance(userId, p.plan.id, body),
      confirmRebalance(userId, p.plan.id, body),
    ]);
    expect(second).toEqual(first);
    expect(await prisma.quest.count({ where: { userId } })).toBe(p.draft.items.length);
    // Same key with a different body is a conflict, never a second reconciliation.
    await expect(
      confirmRebalance(userId, p.plan.id, {
        ...body,
        digest: "0".repeat(64),
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });

  it("fails closed when reality changes after the proposal is sealed", async () => {
    const p = await confirmedExam();
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    const tokens = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[] };
      }
    ).rebalance.eligible;
    const movedKey = movableKey(p.draft);
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      buildProposal({
        draft: p.draft,
        tokens,
        includeKeys: tokens.map((token) => token.itemKey),
        moveKey: movedKey,
        newDate: "2030-01-23",
      })
    );
    const questCount = await prisma.quest.count({ where: { userId } });
    // The student starts work on an item the proposal would have moved.
    const targetQuest = p.receipt.items.find(
      (item) => item.itemKey === movedKey
    )!.questId;
    await startSession(targetQuest);
    await expect(
      confirmRebalance(userId, p.plan.id, {
        schemaVersion: 1,
        revisionId: sealed.revision.id,
        digest: sealed.revision.digest!,
        expectedVersion: 3,
        idempotencyKey: randomUUID(),
      })
    ).rejects.toMatchObject({
      // Starting work changes both the availability snapshot (an open Quest is now in
      // progress) and the execution snapshot. Either check fails the confirmation
      // closed, which is the guarantee that matters here.
      code: expect.stringMatching(/REPLAN_STALE_EXECUTION|SCHEDULE_CHANGED/),
    });
    // Zero partial mutations: nothing was deleted, moved or created.
    expect(await prisma.quest.count({ where: { userId } })).toBe(questCount);
    expect(
      await prisma.plannerRevision.findUniqueOrThrow({
        where: { id: sealed.revision.id },
      })
    ).toMatchObject({ confirmationReceipt: null });
    expect(
      await prisma.plannerQuestLink.findUnique({
        where: { planId_itemKey: { planId: p.plan.id, itemKey: movedKey } },
      })
    ).toMatchObject({ disposition: "LIVE" });
  });

  it("never resurrects deleted or detached work, and refuses to retain it", async () => {
    const p = await confirmedExam();
    const removedKey = p.draft.items[3].key;
    const detachKey = p.draft.items[4].key;
    // A user deletes one Quest through the canonical manual path. The capability is
    // transaction-local, so the claim and the delete share one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('sylf.planner_manual_quest', ${String(p.receipt.items[3].questId)}, true)`;
      await tx.quest.delete({ where: { id: p.receipt.items[3].questId } });
    });
    await prisma.plannerQuestLink.update({
      where: { planId_itemKey: { planId: p.plan.id, itemKey: detachKey } },
      data: { disposition: "DETACHED", changedAt: new Date() },
    });
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "EXECUTION_CHANGED",
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
    // Neither tombstoned nor detached work is offered as replannable.
    expect(meta.eligible.map((token) => token.itemKey)).not.toContain(removedKey);
    expect(meta.eligible.map((token) => token.itemKey)).not.toContain(detachKey);
    // Claiming to retain that history fails closed instead of resurrecting it: the
    // token is not in the eligible set, so the server refuses the whole proposal.
    const honest = buildProposal({
      draft: p.draft,
      tokens: meta.eligible,
      moveKey: movableKey(p.draft),
      newDate: "2030-01-23",
    }) as { items: { ref: string; retainRef?: string }[] };
    const ghost = ModelProposalV1Schema.parse({
      ...honest,
      items: honest.items.map((item) =>
        item.retainRef === undefined ? { ...item, retainRef: "r99" } : item
      ),
    });
    await expect(
      finishRebalance(userId, p.plan.id, begin.operationKey, ghost)
    ).rejects.toMatchObject({ code: "UNKNOWN_RETAIN_REF" });
    // The honest proposal over the same reality is accepted, and the deleted item
    // comes back only as genuinely NEW work with a fresh identity.
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      honest as never
    );
    const addedKeys = sealed.result.diff.entries
      .filter((entry) => entry.change === "ADD")
      .map((entry) => entry.key);
    expect(addedKeys).not.toContain(removedKey);
    expect(addedKeys.length).toBeGreaterThan(0);
  });

  it("reports eligibility from live state, spends the rebalance bucket, and leaves a cancelled proposal inert", async () => {
    const p = await confirmedExam();
    const execution = await readExecution(
      prisma as never,
      p.plan.id,
      "2030-01-08"
    );
    expect(execution.eligible).toHaveLength(p.draft.items.length);
    expect(execution.frozen).toHaveLength(0);

    const plansUsedBefore = (
      await prisma.userQuota.findFirst({
        where: { userId, feature: "planner" },
      })
    )?.used ?? 0;
    const requestKey = randomUUID();
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey,
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    // Replanning spends its own allowance: the expansion bucket stays untouched and
    // the weekly plan bucket does not move, so reviewing a plan never costs the
    // student a new plan.
    const quotas = await prisma.userQuota.findMany({ where: { userId } });
    expect(quotas.map((quota) => quota.feature)).toContain("plannerRebalance");
    expect(quotas.some((quota) => quota.feature === "plannerExpansion")).toBe(false);
    expect(
      quotas.find((quota) => quota.feature === "planner")?.used ?? 0
    ).toBe(plansUsedBefore);
    // The same key with a different request is a conflict.
    await expect(
      beginRebalance(userId, p.plan.id, {
        schemaVersion: 1,
        requestKey,
        expectedVersion: 2,
        baseRevisionId: p.revision.id,
        reasonCode: "OVERDUE_WORK",
        inputChanges: [],
        scope: { milestoneKey: null },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    // Discarding is inert: live execution and the plan pointer are unchanged.
    const before = await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } });
    await prisma.plannerRevision.update({
      where: { id: begin.id },
      data: { operationState: "CANCELLED" },
    });
    expect(
      await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } })
    ).toEqual(before);
    expect(
      (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } }))
        .activeRevisionId
    ).toBe(p.revision.id);
    // A proposal whose operation was cancelled cannot be confirmed afterwards.
    await expect(
      confirmRebalance(userId, p.plan.id, {
        schemaVersion: 1,
        revisionId: begin.id,
        digest: "0".repeat(64),
        expectedVersion: 2,
        idempotencyKey: randomUUID(),
      })
    ).rejects.toBeTruthy();
  });

  it("exposes the diff and the detection state through the plan detail", async () => {
    const p = await confirmedExam();
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    const tokens = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[] };
      }
    ).rebalance.eligible;
    const movedKey = movableKey(p.draft);
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      buildProposal({
        draft: p.draft,
        tokens,
        includeKeys: tokens.map((token) => token.itemKey),
        moveKey: movedKey,
        newDate: "2030-01-23",
      })
    );
    const detail = await getPlanDetail(userId, p.plan.id);
    expect(detail.rebalanceState).toMatchObject({
      eligible: p.draft.items.length,
      frozen: 0,
    });
    expect(detail.rebalance?.isLatestDraft).toBe(true);
    const diff = (detail.rebalance?.diff ?? null) as {
      counts: Record<string, number>;
      entries: { change: string }[];
      affectedHistory: number;
    } | null;
    expect(diff?.counts.RETAIN).toBe(p.draft.items.length - 1);
    expect(diff?.counts.MOVE).toBe(1);
    expect(diff?.affectedHistory).toBe(0);
    // The sealed proposal is stored, not re-derived: the detail shows its revision.
    expect(
      (detail.latestDraft?.outputSnapshot as { rebalance?: unknown }).rebalance
    ).toBeTruthy();
    await confirmRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
    });
    const after = await getPlanDetail(userId, p.plan.id);
    // Progress spans revisions: the previous confirmed revision's still-live items are
    // available as history, and nothing superseded reappears.
    expect(after.historyItems.length).toBeGreaterThan(0);
    expect(
      after.historyItems.map((item) => (item as { key: string }).key)
    ).not.toContain(movedKey);
    expect(after.rebalance?.confirmed).toBe(true);
    expect(
      normalizeProposal(examFixture(), examProposal()).mode
    ).toBe("EXAM");
  });
});
