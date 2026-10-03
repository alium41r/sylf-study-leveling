// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import { createPlanShell } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import { masteryInput } from "@/lib/planner/mastery-policy";
import { masteryProposal, secureMasteryFixture } from "./mastery-fixtures";
import {
  checkResultsForPlan,
  resetCheckResult,
  setCheckResult,
} from "@/lib/planner/server/check-result";

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
 * User-reported Mastery Check reflection against a real PostgreSQL instance.
 *
 * A reflection is the one planner write that is editable rather than append-only,
 * so this suite verifies the persistence contract: a confirmed mastery plan can
 * record, change and reset a check result, foreign users are shut out, the result
 * is the fixed closed vocabulary, and the write is side-effect free.
 */
describe.skipIf(!database)("planner PostgreSQL check-result persistence", () => {
  let userId: number;
  let strangerId: number;

  beforeEach(async () => {
    const createUser = () =>
      prisma.user.create({
        data: {
          email: `${randomUUID()}@planner.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [],
        },
      });
    userId = (await createUser()).id;
    strangerId = (await createUser()).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A compact all-secure chapter, as in the mastery suite. */
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

  /** A confirmed mastery plan plus its check item and one non-check item. */
  async function confirmed() {
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
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items
        .filter((item) => !item.removed)
        .map((item) => item.key),
      createGoal: false,
    });
    const checkItem = draft.items.find(
      (item) => item.masteryStage === "MASTERY_CHECK"
    )!;
    const nonCheckItem = draft.items.find(
      (item) => item.masteryStage !== "MASTERY_CHECK"
    )!;
    return { plan, revision, draft, receipt, checkItem, nonCheckItem };
  }

  it("lets the owner record a check result and reads it back with its label", async () => {
    const p = await confirmed();
    const row = await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "FELT_OK",
    });
    expect(row).toMatchObject({
      planId: p.plan.id,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "FELT_OK",
    });
    expect(row.label).toBe("Felt okay");
    const stored = await prisma.plannerCheckResult.findUniqueOrThrow({
      where: { planId_itemKey: { planId: p.plan.id, itemKey: p.checkItem.key } },
    });
    expect(stored).toMatchObject({ result: "FELT_OK", userId, revisionId: p.revision.id });
  });

  it("replaces the value on a second report instead of appending", async () => {
    const p = await confirmed();
    await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "FELT_OK",
    });
    const changed = await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "READY_TO_MOVE_ON",
    });
    expect(changed.result).toBe("READY_TO_MOVE_ON");
    expect(changed.label).toBe("Ready to move on");
    expect(
      await prisma.plannerCheckResult.count({
        where: { planId: p.plan.id, itemKey: p.checkItem.key },
      })
    ).toBe(1);
  });

  it("resets a recorded result and stays a no-op once absent", async () => {
    const p = await confirmed();
    await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "NEEDS_MORE_WORK",
    });
    await expect(
      resetCheckResult(userId, p.plan.id, { schemaVersion: 1, itemKey: p.checkItem.key })
    ).resolves.toEqual({ reset: true, itemKey: p.checkItem.key });
    expect(await prisma.plannerCheckResult.count({ where: { planId: p.plan.id } })).toBe(0);
    // Idempotent: resetting an already-absent row succeeds rather than erroring.
    await expect(
      resetCheckResult(userId, p.plan.id, { schemaVersion: 1, itemKey: p.checkItem.key })
    ).resolves.toEqual({ reset: true, itemKey: p.checkItem.key });
  });

  it("rejects a foreign user on set, reset and read without revealing the plan", async () => {
    const p = await confirmed();
    await expect(
      setCheckResult(strangerId, p.plan.id, {
        schemaVersion: 1,
        itemKey: p.checkItem.key,
        revisionId: p.revision.id,
        result: "FELT_OK",
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      resetCheckResult(strangerId, p.plan.id, { schemaVersion: 1, itemKey: p.checkItem.key })
    ).rejects.toMatchObject({ status: 404 });
    await expect(checkResultsForPlan(strangerId, p.plan.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await prisma.plannerCheckResult.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("rejects an invalid enum value before writing anything", async () => {
    const p = await confirmed();
    await expect(
      setCheckResult(userId, p.plan.id, {
        schemaVersion: 1,
        itemKey: p.checkItem.key,
        revisionId: p.revision.id,
        result: "NOT_A_RESULT",
      })
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(await prisma.plannerCheckResult.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("rejects an itemKey that is not the plan's Mastery Check", async () => {
    const p = await confirmed();
    await expect(
      setCheckResult(userId, p.plan.id, {
        schemaVersion: 1,
        itemKey: p.nonCheckItem.key,
        revisionId: p.revision.id,
        result: "FELT_OK",
      })
    ).rejects.toMatchObject({ status: 422, code: "UNKNOWN_CHECK_ITEM" });
    expect(await prisma.plannerCheckResult.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("writes nothing but the check-result row: no Quest, revision, node, goal, reward or quota change", async () => {
    const p = await confirmed();
    const questsBefore = await prisma.quest.count({ where: { userId } });
    const revisionsBefore = await prisma.plannerRevision.count({ where: { planId: p.plan.id } });
    const revisionReceiptBefore = (
      await prisma.plannerRevision.findUniqueOrThrow({ where: { id: p.revision.id } })
    ).confirmationReceipt;
    const subjectNodesBefore = await prisma.subjectNode.count({
      where: { subject: { userId } },
    });
    const goalsBefore = await prisma.goal.findMany({ where: { userId }, orderBy: { id: "asc" } });
    const quotasBefore = await prisma.userQuota.count({ where: { userId } });
    const userBefore = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "READY_TO_MOVE_ON",
    });

    expect(await prisma.quest.count({ where: { userId } })).toBe(questsBefore);
    expect(await prisma.plannerRevision.count({ where: { planId: p.plan.id } })).toBe(revisionsBefore);
    expect(
      (await prisma.plannerRevision.findUniqueOrThrow({ where: { id: p.revision.id } }))
        .confirmationReceipt
    ).toEqual(revisionReceiptBefore);
    expect(
      await prisma.subjectNode.count({ where: { subject: { userId } } })
    ).toBe(subjectNodesBefore);
    expect(await prisma.goal.findMany({ where: { userId }, orderBy: { id: "asc" } })).toEqual(
      goalsBefore
    );
    // Zero quota: the reflection reserves, settles and spends nothing.
    expect(await prisma.userQuota.count({ where: { userId } })).toBe(quotasBefore);
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([userAfter.currentXP, userAfter.sylph, userAfter.totalStudySeconds]).toEqual([
      userBefore.currentXP,
      userBefore.sylph,
      userBefore.totalStudySeconds,
    ]);
  });

  it("returns an owner-scoped, projected list of recorded results", async () => {
    const p = await confirmed();
    expect(await checkResultsForPlan(userId, p.plan.id)).toEqual([]);
    await setCheckResult(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "NEEDS_MORE_WORK",
    });
    const rows = await checkResultsForPlan(userId, p.plan.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemKey: p.checkItem.key,
      revisionId: p.revision.id,
      result: "NEEDS_MORE_WORK",
    });
    expect(Object.keys(rows[0]).sort()).toEqual(["itemKey", "result", "revisionId", "updatedAt"]);
  });
});
