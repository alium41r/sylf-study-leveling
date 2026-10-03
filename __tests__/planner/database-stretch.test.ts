// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CommitReceipt, ValidatedDraftV1 } from "@/lib/planner/contracts";
import { ModelProposalV1Schema } from "@/lib/planner/contracts";
import { createPlanShell, getPlanDetail } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import { promoteStretch } from "@/lib/planner/server/stretch";
import { examFixture, examProposal } from "./exam-fixtures";

/**
 * Core + Stretch against real PostgreSQL.
 *
 * The promise under test is narrow and absolute: optional work can never become
 * accidental required work. Confirming a plan schedules CORE and only CORE; a Stretch
 * item stays planner-owned until the student promotes it by name; promotion is
 * explicit, idempotent, capacity-checked and ordinary execution afterwards; and a
 * Stretch item that is skipped never appears as overdue, because no Quest exists to be
 * overdue.
 */
const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.includes("planner")
    )
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

describe.skipIf(!database)("planner PostgreSQL core and stretch", () => {
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

  /** The optional item every fixture appends: light by default, heavy on request. */
  const stretchItem = (over: { minutes?: number; date?: string } = {}) => ({
    ref: "i99",
    topicRef: "t1",
    relatedTopicRefs: [],
    milestoneRef: null,
    dependsOn: [],
    type: "RECALL",
    stage: "CONSOLIDATION",
    title: "Optional extra recall",
    description:
      "Skim the earlier chapter's summary and note anything you cannot recall.",
    rationale: "Extra reinforcement if the week has room.",
    completionCriteria: "A page of recalled points, checked against the summary.",
    date: over.date ?? "2030-01-10",
    minutes: over.minutes ?? 30,
    role: "STRETCH",
  });

  /** The confirmed Exam plan plus one surplus, explicitly optional item. */
  async function confirmedExamWithStretch(
    over: { minutes?: number; date?: string } = {}
  ) {
    const input = examFixture();
    const base = examProposal();
    const proposal = ModelProposalV1Schema.parse({
      ...base,
      items: [...base.items, stretchItem(over)],
    });
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
      proposal,
      new Date()
    );
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    const stretch = draft.items.find((item) => item.role === "STRETCH")!;
    const coreKeys = draft.items
      .filter((item) => item.role !== "STRETCH")
      .map((item) => item.key);
    const receipt: CommitReceipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      // Exactly the CORE set: the reviewed plan, without the optional extra.
      selectedItemKeys: coreKeys,
      createGoal: false,
    });
    return { input, plan, revision, draft, receipt, stretch };
  }

  it("confirms CORE only, leaving Stretch planner-owned with no Quest to fall overdue", async () => {
    const p = await confirmedExamWithStretch();
    expect(p.receipt.items).toHaveLength(p.draft.items.length - 1);
    expect(
      await prisma.plannerQuestLink.findFirst({
        where: { planId: p.plan.id, itemKey: p.stretch.key },
      })
    ).toBeNull();
    // Optional work that was never scheduled cannot appear as overdue work.
    const detail = await getPlanDetail(userId, p.plan.id);
    expect(JSON.stringify(detail)).not.toContain("OVERDUE_STRETCH");
    expect(await prisma.quest.count({ where: { userId } })).toBe(
      p.draft.items.length - 1
    );
  });

  it("refuses to materialize Stretch by selecting it at confirmation", async () => {
    const input = examFixture();
    const base = examProposal();
    const proposal = ModelProposalV1Schema.parse({
      ...base,
      items: [...base.items, stretchItem()],
    });
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const operationKey = randomUUID();
    await beginOperation(userId, plan.id, { operationKey, expectedVersion: 0, input });
    const revision = await finishOperation(userId, plan.id, operationKey, proposal, new Date());
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    await expect(
      confirmDraft(userId, plan.id, {
        schemaVersion: 1,
        revisionId: revision.id,
        digest: revision.digest!,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
        selectedItemKeys: draft.items.map((item) => item.key),
        createGoal: false,
      })
    ).rejects.toMatchObject({ code: "STRETCH_REQUIRES_PROMOTION" });
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });

  it("promotes Stretch explicitly into ordinary execution, exactly once", async () => {
    const p = await confirmedExamWithStretch();
    const before = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    const promotion = await promoteStretch(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKeys: [p.stretch.key],
      expectedVersion: before.version,
      idempotencyKey: randomUUID(),
    });
    expect(promotion.items).toEqual([
      { itemKey: p.stretch.key, questId: expect.any(Number), created: true },
    ]);
    expect(promotion.version).toBe(before.version + 1);
    const link = await prisma.plannerQuestLink.findFirstOrThrow({
      where: { planId: p.plan.id, itemKey: p.stretch.key },
    });
    expect(link.disposition).toBe("LIVE");
    expect(link.questId).toBe(promotion.items[0].questId);
    expect(
      (link.baseline as { promoted?: { reason?: string } }).promoted?.reason
    ).toBe("USER_PROMOTED_STRETCH");
    // Ordinary execution afterwards: a real Quest, dated as the plan said.
    const quest = await prisma.quest.findUniqueOrThrow({
      where: { id: link.questId! },
    });
    expect(quest.status).toBe("PENDING");
    expect(quest.scheduledFor).toBe("2030-01-10");

    // Idempotent: the same item promoted again returns the same Quest, creates nothing
    // and does not move the plan version.
    const replay = await promoteStretch(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKeys: [p.stretch.key],
      expectedVersion: promotion.version,
      idempotencyKey: randomUUID(),
    });
    expect(replay.items).toEqual([
      { itemKey: p.stretch.key, questId: promotion.items[0].questId, created: false },
    ]);
    expect(replay.version).toBe(promotion.version);
    expect(await prisma.quest.count({ where: { userId } })).toBe(
      p.draft.items.length
    );
  });

  it("refuses to promote required work, an unknown item, or another user's plan", async () => {
    const p = await confirmedExamWithStretch();
    const plan = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    const body = {
      schemaVersion: 1 as const,
      revisionId: p.revision.id,
      expectedVersion: plan.version,
      idempotencyKey: randomUUID(),
    };
    const core = p.draft.items.find((item) => item.role !== "STRETCH")!;
    await expect(
      promoteStretch(userId, p.plan.id, { ...body, itemKeys: [core.key] })
    ).rejects.toMatchObject({ code: "STRETCH_REQUIRED" });
    await expect(
      promoteStretch(userId, p.plan.id, { ...body, itemKeys: [randomUUID()] })
    ).rejects.toMatchObject({ code: "UNKNOWN_ITEM" });
    const stranger = (
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@planner.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [],
        },
      })
    ).id;
    await expect(
      promoteStretch(stranger, p.plan.id, {
        ...body,
        itemKeys: [p.stretch.key],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await prisma.plannerQuestLink.findFirst({
        where: { planId: p.plan.id, itemKey: p.stretch.key },
      })
    ).toBeNull();
  });

  it("refuses optional work the schedule cannot actually fit", async () => {
    // A plan is only allowed to CONTAIN optional work that fits — the generator checks
    // the whole draft, extra work included. So the interesting case is reality moving
    // afterwards: the student adds their own revision to the same day, and the optional
    // item no longer fits. Promotion must then refuse instead of quietly overloading it.
    const p = await confirmedExamWithStretch();
    const plan = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    const sample = await prisma.quest.findFirstOrThrow({ where: { userId } });
    const { id, createdAt, plannerSpec, ...fields } = sample;
    void id;
    void createdAt;
    // This fixture creates standalone legacy work, not a copy of V2 lineage.
    void plannerSpec;
    // `scheduledFor` is a planner-style date key on this model, not a timestamp.
    await prisma.quest.create({
      data: {
        ...fields,
        title: "Personal revision the student added",
        scheduledFor: "2030-01-10",
        requiredMinutes: 120,
        targetMinutes: 120,
      },
    });
    await expect(
      promoteStretch(userId, p.plan.id, {
        schemaVersion: 1,
        revisionId: p.revision.id,
        itemKeys: [p.stretch.key],
        expectedVersion: plan.version,
        idempotencyKey: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "INFEASIBLE_CAPACITY" });
    expect(
      await prisma.plannerQuestLink.findFirst({
        where: { planId: p.plan.id, itemKey: p.stretch.key },
      })
    ).toBeNull();
    // The refusal changed nothing: the confirmed plan is exactly where it was.
    expect(
      (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: p.plan.id } })).version
    ).toBe(plan.version);
  });
});
