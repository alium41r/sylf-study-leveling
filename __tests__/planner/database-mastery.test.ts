// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CommitReceipt, ValidatedDraftV1 } from "@/lib/planner/contracts";
import {
  appendEdit,
  createPlanShell,
  getPlanDetail,
  saveValidatedDraft,
} from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import {
  beginOperation,
  finishOperation,
  recoverOperation,
  stopOperation,
} from "@/lib/planner/server/operations";
import { excludedMasteryTopics, masteryInput } from "@/lib/planner/mastery-policy";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import {
  masteryFixture,
  masteryProposal,
  secureMasteryFixture,
} from "./mastery-fixtures";

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
 * Chapter / Unit Mastery against a real PostgreSQL instance.
 *
 * A mastery plan is an ordinary planner revision, so this suite verifies only what
 * the database can answer: the mode is accepted by the schema, a mastery plan
 * materializes ordinary Quests under the whole-plan confirmation rule, an excluded
 * unit needs acknowledgement, and a sealed revision really is immutable — which is
 * exactly why a Mastery Check result is not persisted in this phase.
 */
describe.skipIf(!database)("planner PostgreSQL mastery materialization", () => {
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

  /**
   * A compact two-unit chapter: both units are already secure, so the plan carries
   * no learning items and its check depends on nothing that a removal could break.
   * That keeps each confirmation a small transaction, which the serializable
   * planner transactions need when the rest of the suite runs in parallel.
   */
  function dbInput() {
    const base = secureMasteryFixture();
    return masteryInput(
      UserInputV1Schema.parse({
        ...base,
        availability: {
          ...base.availability,
          dailyMinutes: [0, 120, 120, 120, 120, 120, 120],
        },
      })
    );
  }

  /** A sealed mastery revision, exactly as generation leaves it. */
  async function sealed() {
    const input = dbInput();
    const plan = await createPlanShell(userId, {
      mode: "MASTERY",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: input.mastery.subjectId,
      goalId: null,
    });
    const operationKey = randomUUID();
    const op = await beginOperation(userId, plan.id, {
      operationKey,
      expectedVersion: 0,
      input,
    });
    expect(op.acquired).toBe(true);
    const revision = await finishOperation(
      userId,
      plan.id,
      operationKey,
      masteryProposal(input),
      new Date()
    );
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    return {
      plan,
      revision,
      draft,
      body: (overrides: Record<string, unknown> = {}) => ({
        schemaVersion: 1 as const,
        revisionId: revision.id,
        digest: revision.digest!,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
        selectedItemKeys: draft.items
          .filter((item) => !item.removed)
          .map((item) => item.key),
        createGoal: true,
        ...overrides,
      }),
    };
  }

  it("accepts a mastery plan as a real plan and seals it through the shared operation", async () => {
    const p = await sealed();
    const stored = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    expect(stored.mode).toBe("MASTERY");
    expect(p.revision.operationState).toBe("SEALED");
    expect(p.draft.mode).toBe("MASTERY");
    expect(p.draft.milestones).toEqual([]);
    expect(p.draft.items.every((item) => Boolean(item.masteryStage))).toBe(true);
    expect(p.draft.items.at(-1)?.masteryStage).toBe("MASTERY_CHECK");
    // Mastery reuses the existing weekly `planner` bucket: it spends the same
    // allowance as any other plan and introduces no new feature bucket.
    const quotas = await prisma.userQuota.findMany({ where: { userId } });
    expect(quotas.map((quota) => quota.feature)).toEqual(["planner"]);
  });

  it("refuses to confirm a subset, because a subset would drop a required stage", async () => {
    const p = await sealed();
    const body = p.body();
    await expect(
      confirmDraft(userId, p.plan.id, {
        ...body,
        selectedItemKeys: body.selectedItemKeys.slice(0, -1),
      })
    ).rejects.toMatchObject({ code: "MASTERY_SELECTION_REQUIRES_EDIT" });
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    expect(
      await prisma.plannerRevision.findUniqueOrThrow({ where: { id: p.revision.id } })
    ).toMatchObject({ confirmationReceipt: null });
  });

  it("materializes ordinary Quests with no planner metadata on the Quest row", async () => {
    const p = await sealed();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const receipt: CommitReceipt = await confirmDraft(userId, p.plan.id, p.body());
    const quests = await prisma.quest.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });
    expect(quests).toHaveLength(
      p.draft.items.filter((item) => !item.removed).length
    );
    expect(receipt.items.map((item) => item.questId)).toEqual(
      quests.map((quest) => quest.id)
    );
    for (const quest of quests) {
      expect(quest).toMatchObject({
        status: "PENDING",
        subjectNodeId: null,
        completedAt: null,
        elapsedSeconds: 0,
        createdByAi: true,
      });
      // The stage lives in the sealed revision: the Quest row has no mastery field.
      expect(Object.keys(quest)).not.toContain("masteryStage");
      expect(quest.description).toContain("Done when: ");
      expect(quest.description ?? "").not.toMatch(/mastered|fully understand/i);
    }
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([after.currentXP, after.sylph, after.totalStudySeconds]).toEqual([
      before.currentXP,
      before.sylph,
      before.totalStudySeconds,
    ]);
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(0);
    // Confirmation never writes SubjectNode progress.
    expect(
      await prisma.subjectNode.count({ where: { subject: { userId } } })
    ).toBe(0);
    // The link baseline is immutable too, so a Quest cannot carry a mastery signal
    // even through the planner's own link table.
    const link = await prisma.plannerQuestLink.findFirstOrThrow({
      where: { planId: p.plan.id },
    });
    await expect(
      prisma.plannerQuestLink.update({
        where: { id: link.id },
        data: { baseline: { ...(link.baseline as object), mastery: true } as never },
      })
    ).rejects.toThrow(/PLANNER_(LINEAGE_)?IMMUTABLE/);
  });

  it("requires acknowledgement when a whole unit is left out, and creates no Quest for it", async () => {
    const p = await sealed();
    if (p.draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    const unitKey = p.draft.topics[1].key;
    const unitItemKeys = p.draft.items
      .filter((item) => item.topicKey === unitKey)
      .map((item) => item.key);
    expect(unitItemKeys.length).toBeGreaterThan(0);
    // The removal is a normal draft edit, so the exclusion is stored exactly as the
    // user made it rather than being inferred later.
    const edited = await appendEdit(userId, p.plan.id, {
      schemaVersion: 1,
      baseRevisionId: p.revision.id,
      expectedVersion: 1,
      operationKey: randomUUID(),
      edits: unitItemKeys.map((key) => ({ key, removed: true })),
      itemOrder: p.draft.items.map((item) => item.key),
    });
    const draft = edited.outputSnapshot as unknown as ValidatedDraftV1;
    if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    expect(excludedMasteryTopics(draft)).toHaveLength(1);
    const body = {
      schemaVersion: 1 as const,
      revisionId: edited.id,
      digest: edited.digest!,
      expectedVersion: 2,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items
        .filter((item) => !item.removed)
        .map((item) => item.key),
      createGoal: false,
    };
    await expect(confirmDraft(userId, p.plan.id, body)).rejects.toMatchObject({
      code: "EXCLUSIONS_REQUIRE_ACCEPTANCE",
    });
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    const receipt = await confirmDraft(userId, p.plan.id, {
      ...body,
      acknowledgeExclusions: true,
    });
    expect(receipt.items).toHaveLength(body.selectedItemKeys.length);
    const quests = await prisma.quest.findMany({ where: { userId } });
    expect(quests).toHaveLength(body.selectedItemKeys.length);
    // No Quest exists for any item belonging to the unit that was left out.
    const excludedQuestIds = await prisma.plannerQuestLink.findMany({
      where: { planId: p.plan.id, itemKey: { in: unitItemKeys } },
    });
    expect(excludedQuestIds).toHaveLength(0);
  });

  it("refuses an edit that drops a required stage, and a confirmation whose check lost its prerequisite", async () => {
    const input = masteryFixture();
    const plan = await createPlanShell(userId, {
      mode: "MASTERY",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    // A plan whose check depends on one of the unit's retrieval items: a legitimate
    // model-authored dependency, not something the application invents.
    const proposal = masteryProposal(input) as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    const earlyRecall = proposal.items.find(
      (item) => item.topicRef === "t1" && item.masteryStage === "ACTIVE_RECALL"
    )!;
    const authored = {
      ...proposal,
      items: proposal.items.map((item) =>
        item.masteryStage === "MASTERY_CHECK"
          ? { ...item, dependsOn: [earlyRecall.ref] }
          : item
      ),
    };
    const revision = await saveValidatedDraft(userId, plan.id, {
      input,
      proposal: authored,
      expectedVersion: 0,
      operationKey: randomUUID(),
    });
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    const edit = (key: string) =>
      appendEdit(userId, plan.id, {
        schemaVersion: 1,
        baseRevisionId: revision.id,
        expectedVersion: 1,
        operationKey: randomUUID(),
        edits: [{ key, removed: true }],
        itemOrder: draft.items.map((item) => item.key),
      });
    // Removing a stage the plan requires is refused by the same deterministic rules
    // that validate a generated plan, so an edit cannot leave a unit untaught.
    const orientation = draft.items.find(
      (item) => item.masteryStage === "UNDERSTAND"
    )!;
    await expect(edit(orientation.key)).rejects.toThrow(/MISSING_UNDERSTAND/);
    // Removing the retrieval item is a legal edit, but the check still depends on it,
    // so confirmation refuses rather than silently rewriting the dependency.
    const recallKey = draft.items.find(
      (item) => item.masteryStage === "ACTIVE_RECALL" && item.topicKey === draft.topics[0].key
    )!.key;
    const edited = await edit(recallKey);
    const after = edited.outputSnapshot as unknown as ValidatedDraftV1;
    await expect(
      confirmDraft(userId, plan.id, {
        schemaVersion: 1,
        revisionId: edited.id,
        digest: edited.digest!,
        expectedVersion: 2,
        idempotencyKey: randomUUID(),
        selectedItemKeys: after.items
          .filter((item) => !item.removed)
          .map((item) => item.key),
        createGoal: false,
      })
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });

  it("keeps a sealed mastery revision immutable, so no check result can be written into it", async () => {
    const p = await sealed();
    const snapshot = p.revision.outputSnapshot as { items: unknown[] };
    await expect(
      prisma.plannerRevision.update({
        where: { id: p.revision.id },
        data: {
          outputSnapshot: {
            ...snapshot,
            checkResult: { state: "COMPLETED" },
          } as never,
        },
      })
    ).rejects.toThrow(/PLANNER_IMMUTABLE/);
  });

  it("projects linked-Quest execution for a mastery plan without inferring anything", async () => {
    const p = await sealed();
    await confirmDraft(userId, p.plan.id, p.body());
    const detail = await getPlanDetail(userId, p.plan.id);
    expect(detail.plan.mode).toBe("MASTERY");
    expect(detail.execution).toHaveLength(detail.links.length);
    expect(detail.execution.every((row) => row.status === "PENDING")).toBe(true);
    expect(detail.milestoneStates).toEqual([]);
    // Status only: no score, no judgement, no check result crosses this boundary.
    expect(Object.keys(detail.execution[0]).sort()).toEqual([
      "completedAt",
      "itemKey",
      "status",
    ]);
    // A completed check Quest is ordinary Quest execution and nothing more.
    await prisma.quest.update({
      where: { id: detail.links[0].questId! },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const after = await getPlanDetail(userId, p.plan.id);
    expect(
      after.execution.find((row) => row.itemKey === detail.links[0].itemKey)
        ?.status
    ).toBe("COMPLETED");
    expect(await prisma.plannerQuestLink.count({ where: { planId: p.plan.id } })).toBe(
      detail.links.length
    );
  });

  /** Start a real Focus session on one Quest through the canonical RPC. */
  async function startSession(questId: number) {
    const rows = await prisma.$queryRaw<Array<{ result: { id: number } }>>`
      SELECT public.start_study_session(${userId}::int, ${questId}::int, NULL::int, 0::int) AS result`;
    const sessionId = rows[0].result.id;
    // A session is only settleable once it has real elapsed time.
    await prisma.studySession.update({
      where: { id: sessionId },
      data: { startedAt: new Date(Date.now() - 3_600_000) },
    });
    return sessionId;
  }
  const settleSession = (sessionId: number, questId: number) =>
    prisma.$queryRaw`SELECT public.settle_study_session_atomic(${userId}::int, ${sessionId}::int, 2700::int, 0::int, ${questId}::int, NULL::int, true, true, '2030-01-07'::text)`;

  it("runs a mastery Quest through canonical Focus settlement, exactly once", async () => {
    const p = await sealed();
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    const receipt = await confirmDraft(userId, p.plan.id, p.body());
    const questId = receipt.items[0].questId;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sessionId = await startSession(questId);
    await settleSession(sessionId, questId);
    const rewarded = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ledger = await prisma.xpLedger.count({ where: { userId } });
    expect(rewarded.currentXP).toBeGreaterThan(before.currentXP);
    // Replaying the settlement changes nothing: Focus remains authoritative.
    await settleSession(sessionId, questId);
    const replayed = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([replayed.currentXP, replayed.sylph, replayed.totalStudySeconds]).toEqual([
      rewarded.currentXP,
      rewarded.sylph,
      rewarded.totalStudySeconds,
    ]);
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(ledger);
    const quest = await prisma.quest.findUniqueOrThrow({ where: { id: questId } });
    expect(quest).toMatchObject({
      status: "COMPLETED",
      subjectNodeId: null,
      elapsedSeconds: 2700,
    });
    expect(quest.requiredMinutes).toBe(quest.targetMinutes);
    // Execution changed; the plan and its sealed revision did not.
    expect(await prisma.plannerRevision.count({ where: { planId: p.plan.id } })).toBe(1);
    expect(await prisma.plannerPlan.count({ where: { userId } })).toBe(1);
    expect(await prisma.quest.count({ where: { userId } })).toBe(
      receipt.items.length
    );
  });

  it("completes the Mastery Check without inventing mastery or new work", async () => {
    const p = await sealed();
    if (p.draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    const receipt = await confirmDraft(userId, p.plan.id, p.body());
    const checkItem = p.draft.items.find(
      (item) => item.masteryStage === "MASTERY_CHECK"
    )!;
    const checkQuestId = receipt.items.find(
      (item) => item.itemKey === checkItem.key
    )!.questId;
    const planBefore = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    const revisionsBefore = await prisma.plannerRevision.count({
      where: { planId: p.plan.id },
    });
    const questsBefore = await prisma.quest.count({ where: { userId } });
    // The Goal was created because confirmation asked for one; completing the check
    // must not create or adjust it.
    const goalsBefore = await prisma.goal.findMany({
      where: { userId },
      orderBy: { id: "asc" },
    });
    const checkQuest = await prisma.quest.findUniqueOrThrow({
      where: { id: checkQuestId },
    });
    // The check is an ordinary Quest with an observable criterion and no verdict.
    expect(checkQuest.description).toContain("Done when: ");
    expect(checkQuest.description ?? "").not.toMatch(
      /mastered|pass mark|score \d|% to pass/i
    );
    await settleSession(await startSession(checkQuestId), checkQuestId);
    expect(
      await prisma.quest.findUniqueOrThrow({ where: { id: checkQuestId } })
    ).toMatchObject({ status: "COMPLETED" });
    // Nothing is created, rescheduled or re-derived by completing the check.
    expect(await prisma.quest.count({ where: { userId } })).toBe(questsBefore);
    expect(
      await prisma.plannerRevision.count({ where: { planId: p.plan.id } })
    ).toBe(revisionsBefore);
    expect(await prisma.plannerPlan.count({ where: { userId } })).toBe(1);
    expect(
      await prisma.goal.findMany({ where: { userId }, orderBy: { id: "asc" } })
    ).toEqual(goalsBefore);
    expect(
      await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } })
    ).toMatchObject({
      state: planBefore.state,
      activeRevisionId: planBefore.activeRevisionId,
      version: planBefore.version,
    });
    // No academic state anywhere: no SubjectNode, and no subject-level progress.
    expect(await prisma.subjectNode.count({ where: { subject: { userId } } })).toBe(0);
    const detail = await getPlanDetail(userId, p.plan.id);
    expect(
      detail.execution.find((row) => row.itemKey === checkItem.key)?.status
    ).toBe("COMPLETED");
  });

  it("recovers a mastery generation by key and refuses a second worker", async () => {
    const input = dbInput();
    const creationKey = randomUUID();
    const plan = await createPlanShell(
      userId,
      {
        mode: "MASTERY",
        title: input.title,
        creationKey,
        subjectId: null,
        goalId: null,
      },
      "identity-a"
    );
    // Same key and same identity: the same plan, never a second one.
    expect(
      (
        await createPlanShell(
          userId,
          {
            mode: "MASTERY",
            title: input.title,
            creationKey,
            subjectId: null,
            goalId: null,
          },
          "identity-a"
        )
      ).id
    ).toBe(plan.id);
    // Same key, different body: a conflict, not a silent second plan.
    await expect(
      createPlanShell(
        userId,
        {
          mode: "MASTERY",
          title: "A different unit",
          creationKey,
          subjectId: null,
          goalId: null,
        },
        "identity-b"
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });

    const operationKey = randomUUID();
    const first = await beginOperation(userId, plan.id, {
      operationKey,
      expectedVersion: 0,
      input,
    });
    expect(first.acquired).toBe(true);
    // A duplicate worker for the same operation key is refused.
    const second = await beginOperation(userId, plan.id, {
      operationKey,
      expectedVersion: 0,
      input,
    });
    expect(second.acquired).toBe(false);
    const sealedRevision = await finishOperation(
      userId,
      plan.id,
      operationKey,
      masteryProposal(input),
      new Date()
    );
    const recovered = await recoverOperation(userId, plan.id, operationKey);
    expect(recovered.state).toBe("SEALED");
    expect(recovered.digest).toBe(sealedRevision.digest);
    // A terminal transition cannot refund or rewrite an already sealed operation.
    const stopped = await stopOperation(userId, plan.id, operationKey, "FAILED");
    expect(stopped.operationState).toBe("SEALED");
  });

  it("returns an empty execution projection before the plan is confirmed", async () => {
    const plan = await createPlanShell(userId, {
      mode: "MASTERY",
      title: "Circular motion",
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const detail = await getPlanDetail(userId, plan.id);
    expect(detail.execution).toEqual([]);
    expect(detail.milestoneStates).toEqual([]);
  });
});
