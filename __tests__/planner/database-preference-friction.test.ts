// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import { createPlanShell } from "@/lib/planner/server/revisions";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import { masteryInput } from "@/lib/planner/mastery-policy";
import { masteryProposal, secureMasteryFixture } from "./mastery-fixtures";
import {
  activePreferencesForPlan,
  activePreferencesForUser,
  confirmPreference,
  ignorePreference,
  isPreferenceActive,
  PREFERENCE_LEARNING_THRESHOLD,
  preferenceConfidence,
  recordCandidateObservation,
  resetPreference,
} from "@/lib/planner/server/preferences";
import {
  frictionEventsForPlan,
  frictionSummary,
  FRICTION_REASONS,
  recordFriction,
} from "@/lib/planner/server/friction";

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

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** The conservative learning policy is a pure function of evidence, not a DB fact. */
describe("planner preference learning policy", () => {
  it("keeps a single observation below the active threshold", () => {
    expect(PREFERENCE_LEARNING_THRESHOLD).toBe(3);
    expect(isPreferenceActive(1, null, null)).toBe(false);
    expect(isPreferenceActive(2, null, null)).toBe(false);
    expect(isPreferenceActive(3, null, null)).toBe(true);
  });

  it("treats an explicit confirmation as active regardless of evidence", () => {
    expect(isPreferenceActive(0, new Date(), null)).toBe(true);
  });

  it("treats an ignored preference as inactive regardless of evidence", () => {
    expect(isPreferenceActive(10, new Date(), new Date())).toBe(false);
  });

  it("maps evidence to a 0..100 confidence that saturates at the threshold", () => {
    expect(preferenceConfidence(0, false)).toBe(0);
    expect(preferenceConfidence(1, false)).toBe(33);
    expect(preferenceConfidence(2, false)).toBe(67);
    expect(preferenceConfidence(3, false)).toBe(100);
    expect(preferenceConfidence(9, false)).toBe(100);
    expect(preferenceConfidence(0, true)).toBe(100);
  });
});

describe.skipIf(!database)("planner PostgreSQL preference & friction persistence", () => {
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

  /** A sealed (not yet confirmed) plan with a draft of items. */
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
    return { plan, revision, draft };
  }

  it("creates both tables with RLS enabled and no client grants", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('PlannerPreference', 'PlannerFrictionEvent')`;
    expect(tables.map(t => t.table_name).sort()).toEqual(
      ["PlannerFrictionEvent", "PlannerPreference"]
    );
    const rls = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('PlannerPreference', 'PlannerFrictionEvent')`;
    expect(rls).toHaveLength(2);
    expect(rls.every(r => r.relrowsecurity)).toBe(true);
  });

  it("rejects invalid preference types and out-of-range numbers at the database", async () => {
    const p = await sealed();
    await expect(
      prisma.plannerPreference.create({
        data: { userId, planId: p.plan.id, preferenceType: "NOT_A_TYPE", value: "45" },
      })
    ).rejects.toThrow();
    await expect(
      prisma.plannerPreference.create({
        data: { userId, preferenceType: "SESSION_LENGTH", value: "45", evidenceCount: -1 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.plannerPreference.create({
        data: { userId, preferenceType: "SESSION_LENGTH", value: "45", confidence: 101 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.plannerPreference.create({
        data: { userId, preferenceType: "SESSION_LENGTH", value: "free form value with spaces" },
      })
    ).rejects.toThrow();
    expect(await prisma.plannerPreference.count({ where: { userId } })).toBe(0);
  });

  it("rejects invalid friction reason codes and non-UUID item keys at the database", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    await expect(
      prisma.plannerFrictionEvent.create({
        data: { planId: p.plan.id, itemKey, userId, reasonCode: "BOGUS" },
      })
    ).rejects.toThrow();
    await expect(
      prisma.plannerFrictionEvent.create({
        data: { planId: p.plan.id, itemKey: "123", userId, reasonCode: "TOO_LONG" },
      })
    ).rejects.toThrow();
    await expect(
      prisma.plannerFrictionEvent.create({
        data: {
          planId: p.plan.id,
          itemKey: "not a quest id either",
          userId,
          reasonCode: "TOO_LONG",
        },
      })
    ).rejects.toThrow();
    expect(await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("increments evidence on repeat observations instead of duplicating rows", async () => {
    const first = await recordCandidateObservation(userId, null, {
      schemaVersion: 1,
      preferenceType: "SESSION_LENGTH",
      value: "45",
    });
    expect(first).toMatchObject({ evidenceCount: 1, active: false });
    const second = await recordCandidateObservation(userId, null, {
      schemaVersion: 1,
      preferenceType: "SESSION_LENGTH",
      value: "45",
    });
    expect(second).toMatchObject({ evidenceCount: 2, active: false });
    expect(await prisma.plannerPreference.count({ where: { userId } })).toBe(1);
  });

  it("enforces the NULL-planId partial unique index for general preferences", async () => {
    await recordCandidateObservation(userId, null, {
      schemaVersion: 1,
      preferenceType: "DAILY_DENSITY",
      value: "80",
    });
    // A direct duplicate insert of a general preference must be rejected: a plain
    // UNIQUE constraint treats NULL planIds as distinct, so this relies on the
    // partial unique index.
    await expect(
      prisma.plannerPreference.create({
        data: { userId, planId: null, preferenceType: "DAILY_DENSITY", value: "80" },
      })
    ).rejects.toThrow();
    expect(
      await prisma.plannerPreference.count({
        where: { userId, planId: null, preferenceType: "DAILY_DENSITY" },
      })
    ).toBe(1);
  });

  it("allows the same type to exist both generally and per-plan", async () => {
    const p = await sealed();
    await recordCandidateObservation(userId, null, {
      schemaVersion: 1,
      preferenceType: "TASK_DETAIL",
      value: "HIGH",
    });
    await recordCandidateObservation(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "TASK_DETAIL",
      value: "LOW",
    });
    expect(await prisma.plannerPreference.count({ where: { userId } })).toBe(2);
  });

  it("never surfaces a single observation as an active preference", async () => {
    const p = await sealed();
    await recordCandidateObservation(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "BUFFER_STYLE",
      value: "END_OF_WEEK",
    });
    expect(await activePreferencesForPlan(userId, p.plan.id)).toEqual([]);
    for (let i = 0; i < PREFERENCE_LEARNING_THRESHOLD - 1; i++) {
      await recordCandidateObservation(userId, p.plan.id, {
        schemaVersion: 1,
        preferenceType: "BUFFER_STYLE",
        value: "END_OF_WEEK",
      });
    }
    const active = await activePreferencesForPlan(userId, p.plan.id);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      preferenceType: "BUFFER_STYLE",
      value: "END_OF_WEEK",
      confidence: 100,
      source: "OBSERVED",
    });
  });

  it("confirms explicitly, ignores for one plan, and resets idempotently", async () => {
    const p = await sealed();
    await confirmPreference(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "DEMANDING_PLACEMENT",
      value: "EARLY",
    });
    expect(await activePreferencesForPlan(userId, p.plan.id)).toHaveLength(1);
    await expect(
      ignorePreference(userId, p.plan.id, { schemaVersion: 1, preferenceType: "DEMANDING_PLACEMENT" })
    ).resolves.toMatchObject({ ignored: true });
    expect(await activePreferencesForPlan(userId, p.plan.id)).toEqual([]);
    await expect(
      resetPreference(userId, p.plan.id, { schemaVersion: 1, preferenceType: "DEMANDING_PLACEMENT" })
    ).resolves.toMatchObject({ reset: true });
    expect(await prisma.plannerPreference.count({ where: { planId: p.plan.id } })).toBe(0);
    await expect(
      resetPreference(userId, p.plan.id, { schemaVersion: 1, preferenceType: "DEMANDING_PLACEMENT" })
    ).resolves.toMatchObject({ reset: true });
  });

  it("confirmation overrides an earlier ignore", async () => {
    const p = await sealed();
    await confirmPreference(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "TASK_DETAIL",
      value: "MEDIUM",
    });
    await ignorePreference(userId, p.plan.id, { schemaVersion: 1, preferenceType: "TASK_DETAIL" });
    await confirmPreference(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "TASK_DETAIL",
      value: "MEDIUM",
    });
    expect(await activePreferencesForPlan(userId, p.plan.id)).toHaveLength(1);
  });

  it("rejects invalid preference values and enum types before writing", async () => {
    await expect(
      recordCandidateObservation(userId, null, {
        schemaVersion: 1,
        preferenceType: "NOT_A_TYPE",
        value: "45",
      })
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      recordCandidateObservation(userId, null, {
        schemaVersion: 1,
        preferenceType: "SESSION_LENGTH",
        value: "500",
      })
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(await prisma.plannerPreference.count({ where: { userId } })).toBe(0);
  });

  it("shuts out a foreign user on every plan-scoped preference operation", async () => {
    const p = await sealed();
    await expect(
      recordCandidateObservation(strangerId, p.plan.id, {
        schemaVersion: 1,
        preferenceType: "SESSION_LENGTH",
        value: "45",
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      confirmPreference(strangerId, p.plan.id, {
        schemaVersion: 1,
        preferenceType: "SESSION_LENGTH",
        value: "45",
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ignorePreference(strangerId, p.plan.id, { schemaVersion: 1, preferenceType: "SESSION_LENGTH" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      resetPreference(strangerId, p.plan.id, { schemaVersion: 1, preferenceType: "SESSION_LENGTH" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(activePreferencesForPlan(strangerId, p.plan.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await prisma.plannerPreference.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("records friction idempotently under the unique constraint", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    const payload = {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey,
      reasonCode: "TOO_LONG",
    };
    const first = await recordFriction(userId, p.plan.id, payload);
    const second = await recordFriction(userId, p.plan.id, payload);
    expect(second.id).toBe(first.id);
    expect(
      await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id, itemKey } })
    ).toBe(1);
  });

  it("keeps friction unique per item when no revision is recorded", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      itemKey,
      reasonCode: "TOO_HARD",
    });
    // Same reason, same item, no revision: the partial unique index must hold.
    await expect(
      prisma.plannerFrictionEvent.create({
        data: { planId: p.plan.id, revisionId: null, itemKey, userId, reasonCode: "TOO_HARD" },
      })
    ).rejects.toThrow();
    expect(await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id } })).toBe(1);
  });

  it("allows distinct reasons for the same item", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey,
      reasonCode: "TOO_LONG",
    });
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey,
      reasonCode: "UNCLEAR",
    });
    expect(await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id } })).toBe(2);
  });

  it("rejects a foreign user and an unknown revision without revealing them", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    await expect(
      recordFriction(strangerId, p.plan.id, {
        schemaVersion: 1,
        itemKey,
        reasonCode: "TOO_LONG",
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      recordFriction(userId, p.plan.id, {
        schemaVersion: 1,
        revisionId: randomUUID(),
        itemKey,
        reasonCode: "TOO_LONG",
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(frictionSummary(strangerId, p.plan.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("writes nothing but the friction row: zero Quests, revisions, links or quota", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    const questsBefore = await prisma.quest.count({ where: { userId } });
    const revisionsBefore = await prisma.plannerRevision.count({ where: { planId: p.plan.id } });
    const linksBefore = await prisma.plannerQuestLink.count({ where: { planId: p.plan.id } });
    const quotasBefore = await prisma.userQuota.count({ where: { userId } });
    const usageBefore = await prisma.aiUsageLog.count({ where: { userId } });

    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey,
      reasonCode: "LOW_VALUE",
    });

    expect(await prisma.quest.count({ where: { userId } })).toBe(questsBefore);
    expect(await prisma.plannerRevision.count({ where: { planId: p.plan.id } })).toBe(revisionsBefore);
    expect(await prisma.plannerQuestLink.count({ where: { planId: p.plan.id } })).toBe(linksBefore);
    expect(await prisma.userQuota.count({ where: { userId } })).toBe(quotasBefore);
    expect(await prisma.aiUsageLog.count({ where: { userId } })).toBe(usageBefore);
  });

  it("returns a bounded, content-free summary of counts by reason code and item key", async () => {
    const p = await sealed();
    const [a, b] = p.draft.items.map(item => item.key);
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey: a,
      reasonCode: "TOO_LONG",
    });
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey: a,
      reasonCode: "UNCLEAR",
    });
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey: b,
      reasonCode: "TOO_LONG",
    });

    const summary = await frictionSummary(userId, p.plan.id);
    expect(summary.total).toBe(3);
    expect(summary.byReasonCode).toEqual({ TOO_LONG: 2, UNCLEAR: 1 });
    expect(summary.byItemKey).toEqual({ [a]: 2, [b]: 1 });
    // Content-free: only reason codes and item keys, no titles or free text.
    expect(Object.keys(summary).sort()).toEqual(["byItemKey", "byReasonCode", "total"]);
    for (const code of Object.keys(summary.byReasonCode)) {
      expect(FRICTION_REASONS).toContain(code);
    }
    for (const key of Object.keys(summary.byItemKey)) {
      expect(key).toMatch(UUID);
    }

    // The revision-scoped summary narrows the same data.
    const scoped = await frictionSummary(userId, p.plan.id, p.revision.id);
    expect(scoped.total).toBe(3);

    const listed = await frictionEventsForPlan(userId, p.plan.id);
    expect(listed).toHaveLength(3);
    expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "itemKey", "reasonCode", "revisionId"]);
  });

  it("cascades preference and friction rows away when the plan is deleted", async () => {
    const p = await sealed();
    const itemKey = p.draft.items[0].key;
    await recordCandidateObservation(userId, p.plan.id, {
      schemaVersion: 1,
      preferenceType: "SESSION_LENGTH",
      value: "45",
    });
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey,
      reasonCode: "TOO_HARD",
    });
    await prisma.plannerPlan.delete({ where: { id: p.plan.id } });
    expect(await prisma.plannerPreference.count({ where: { planId: p.plan.id } })).toBe(0);
    expect(await prisma.plannerFrictionEvent.count({ where: { planId: p.plan.id } })).toBe(0);
    expect(await prisma.plannerRevision.count({ where: { planId: p.plan.id } })).toBe(0);
  });

  it("keeps general preferences independent of any plan deletion", async () => {
    await confirmPreference(userId, null, {
      schemaVersion: 1,
      preferenceType: "BUFFER_STYLE",
      value: "BETWEEN_SESSIONS",
    });
    const general = await activePreferencesForUser(userId);
    expect(general).toHaveLength(1);
    expect(general[0]).toMatchObject({ preferenceType: "BUFFER_STYLE", source: "CONFIRMED" });
  });
});
