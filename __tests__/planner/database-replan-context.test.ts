// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import { rebalancePayload } from "@/lib/ai/planner/rebalance";
import { createPlanShell } from "@/lib/planner/server/revisions";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import { beginRebalance } from "@/lib/planner/server/rebalance";
import { rebalanceGenerationArgs } from "@/lib/planner/server/rebalance-run";
import { recordCandidateObservation } from "@/lib/planner/server/preferences";
import { recordFriction } from "@/lib/planner/server/friction";
import { examFixture, examProposal } from "./exam-fixtures";

/**
 * A3 context on the replan path, against real PostgreSQL.
 *
 * The claim under test is narrow: when the student explicitly asks for a replan, the
 * context they have generated — repeated planning corrections and one-tap friction
 * reasons — reaches the provider payload, bounded and content-free, as SOFT guidance.
 * A plan with no such history produces exactly the payload it did before A3 existed.
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

describe.skipIf(!database)("planner PostgreSQL A3 replan context", () => {
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

  /** A confirmed Exam plan, ready to be replanned. */
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
    await beginOperation(userId, plan.id, { operationKey, expectedVersion: 0, input });
    const revision = await finishOperation(userId, plan.id, operationKey, examProposal(), new Date());
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    const begin = await beginRebalance(userId, plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    return { input, plan, revision, draft, begin };
  }

  it("sends no A3 context for a plan with no preference or friction history", async () => {
    const p = await confirmedExam();
    const args = await rebalanceGenerationArgs(userId, p.plan.id, p.begin.operationKey);
    expect(args.planningContext).toEqual({ preferences: [], friction: [] });
    // The payload is byte-for-byte what it was before A3 existed: no context block.
    const payload = JSON.parse(rebalancePayload(args)) as { planningContext: unknown };
    expect(payload.planningContext).toBeNull();
  });

  it("carries repeated preferences and friction reasons as SOFT context only", async () => {
    const p = await confirmedExam();
    // One friction reason: the student said an item was too long.
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey: p.draft.items[0].key,
      reasonCode: "TOO_LONG",
    });
    // Three consistent explicit shortenings: enough evidence to be learned, never one.
    for (const _ of [1, 2, 3])
      await recordCandidateObservation(userId, p.plan.id, {
        schemaVersion: 1,
        preferenceType: "SESSION_LENGTH",
        value: "40",
      });

    const args = await rebalanceGenerationArgs(userId, p.plan.id, p.begin.operationKey);
    expect(args.planningContext?.preferences).toEqual([
      { type: "SESSION_LENGTH", value: "40", source: "OBSERVED" },
    ]);
    expect(args.planningContext?.friction).toEqual([
      { reasonCode: "TOO_LONG", count: 1 },
    ]);

    const payload = JSON.parse(rebalancePayload(args)) as {
      planningContext: { preferences: unknown[]; friction: unknown[] } | null;
      outcome: string;
      examDate: string;
      availability: unknown;
      alreadyDone: { title?: string }[];
    };
    expect(payload.planningContext?.preferences).toHaveLength(1);
    expect(payload.planningContext?.friction).toEqual([
      { reasonCode: "TOO_LONG", count: 1 },
    ]);
    // SOFT: every authoritative field still comes from the confirmed input, so a
    // preference has changed nothing the revision is judged against.
    expect(payload.outcome).toBe(args.input.title);
    expect(payload.examDate).toBe(args.input.endDate);
    expect(payload.availability).toEqual(args.input.availability);
    // Content-free: the context carries a closed code and a count — no note, no title.
    expect(JSON.stringify(payload.planningContext)).not.toContain(p.draft.items[0].title);
  });

  it("does not learn a preference from a single observation", async () => {
    const p = await confirmedExam();
    await recordCandidateObservation(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "SESSION_LENGTH",
      value: "40",
    });
    const args = await rebalanceGenerationArgs(userId, p.plan.id, p.begin.operationKey);
    expect(args.planningContext?.preferences).toEqual([]);
    // But the item the student flagged is still described, because one event is
    // evidence about the CURRENT replan even when it is not evidence about them.
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey: p.draft.items[1].key,
      reasonCode: "TOO_HARD",
    });
    const after = await rebalanceGenerationArgs(userId, p.plan.id, p.begin.operationKey);
    expect(after.planningContext?.preferences).toEqual([]);
    expect(after.planningContext?.friction).toEqual([
      { reasonCode: "TOO_HARD", count: 1 },
    ]);
  });
});
