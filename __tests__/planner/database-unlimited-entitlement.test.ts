// @vitest-environment node
//
// The unlimited-AI entitlement against a REAL PostgreSQL database.
//
// The unit suites prove the policy and the branches with mocked transactions.
// This suite proves the parts that only a real database can: that the durable
// planner receipt is genuinely persisted across its whole lifecycle WITHOUT a
// UserQuota row ever being touched, that the guarded upsert still charges (and
// still refuses) ordinary accounts, and that the two cannot be confused.
//
// Opt-in only, exactly like the other planner database suites. Never use
// DATABASE_URL, DIRECT_URL, or a hosted database here.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fixtureInput, fixtureProposal } from "./fixtures";
import { prisma } from "@/lib/prisma";
import { createPlanShell } from "@/lib/planner/server/revisions";
import { beginOperation, finishOperation, recoverOperation, stopOperation } from "@/lib/planner/server/operations";
import { checkQuota, quotaReceiptBucket, releaseQuota, reserveQuota, type QuotaFeature } from "@/lib/ai/usage-limiter";
import { UNLIMITED_AI_USER_IDS_ENV } from "@/lib/ai/entitlements";

const database = process.env.PLANNER_TEST_DATABASE_URL;

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
      adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }),
    }),
  };
});

const FEATURES: QuotaFeature[] = ["chat", "planner", "plannerExpansion", "plannerRebalance", "compile", "scope"];

function configureOwner(value: string | undefined) {
  if (value === undefined) delete process.env[UNLIMITED_AI_USER_IDS_ENV];
  else process.env[UNLIMITED_AI_USER_IDS_ENV] = value;
}

describe.skipIf(!database)("Unlimited AI entitlement on PostgreSQL", () => {
  let ownerId: number;
  let ordinaryId: number;

  /** The live bucket key for a feature, in the user's own timezone. */
  const bucketFor = (feature: QuotaFeature, tz: string) =>
    quotaReceiptBucket(feature, tz, new Date()).dateKey;

  /** Put a user's bucket exactly at its cap, the state a spent account is in. */
  async function exhaust(userId: number, feature: QuotaFeature, tz = "UTC", used = 1) {
    const dateKey = bucketFor(feature, tz);
    await prisma.userQuota.upsert({
      where: { userId_feature_dateKey: { userId, feature, dateKey } },
      create: { userId, feature, dateKey, used },
      update: { used },
    });
    return dateKey;
  }

  const usedFor = async (userId: number, feature: QuotaFeature, dateKey: string) =>
    (await prisma.userQuota.findUnique({ where: { userId_feature_dateKey: { userId, feature, dateKey } } }))
      ?.used ?? 0;

  beforeEach(async () => {
    const createUser = () =>
      prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
      });
    ownerId = (await createUser()).id;
    ordinaryId = (await createUser()).id;
    configureOwner(String(ownerId));
  });

  afterAll(async () => {
    configureOwner(undefined);
    await prisma.$disconnect();
  });

  describe("reserveQuota against the real guarded upsert", () => {
    it("permits the owner on every feature without writing a single quota row", async () => {
      for (const feature of FEATURES) {
        await exhaust(ownerId, feature);
      }

      for (const feature of FEATURES) {
        const quota = await reserveQuota(ownerId, feature);
        expect(quota.allowed).toBe(true);
        expect(quota.unlimited).toBe(true);
        expect(quota.charged).toBe(false);
        expect(quota.limit).toBeNull();
        expect(quota.remaining).toBeNull();
      }

      // The counters are byte-for-byte what they were: nothing was consumed.
      for (const feature of FEATURES) {
        expect(await usedFor(ownerId, feature, bucketFor(feature, "UTC"))).toBe(1);
      }
    });

    it("reports the owner's REAL usage while refusing to cap it", async () => {
      await exhaust(ownerId, "planner", "UTC", 7);
      const quota = await checkQuota(ownerId, "planner");

      expect(quota.used).toBe(7);
      expect(quota.unlimited).toBe(true);
      expect(quota.allowed).toBe(true);
      expect(quota.limit).toBeNull();
    });

    it("never refunds a unit the owner never spent", async () => {
      const dateKey = await exhaust(ownerId, "chat", "UTC", 4);
      await releaseQuota(ownerId, "chat");
      expect(await usedFor(ownerId, "chat", dateKey)).toBe(4);
    });

    it("still charges an ordinary account, up to its limit and no further", async () => {
      // chat is 10/day. Ten reservations succeed and increment; the eleventh is refused.
      for (let i = 1; i <= 10; i += 1) {
        const quota = await reserveQuota(ordinaryId, "chat");
        expect(quota.charged).toBe(true);
        expect(quota.unlimited).toBe(false);
        expect(quota.used).toBe(i);
        expect(quota.remaining).toBe(10 - i);
      }

      const refused = await reserveQuota(ordinaryId, "chat");
      expect(refused.charged).toBe(false);
      expect(refused.allowed).toBe(false);
      expect(refused.unlimited).toBe(false);
      expect(refused.remaining).toBe(0);
      expect(await usedFor(ordinaryId, "chat", bucketFor("chat", "UTC"))).toBe(10);
    });

    it("still refunds an ordinary account's failed generation", async () => {
      await reserveQuota(ordinaryId, "planner");
      const dateKey = bucketFor("planner", "UTC");
      expect(await usedFor(ordinaryId, "planner", dateKey)).toBe(1);

      await releaseQuota(ordinaryId, "planner");
      expect(await usedFor(ordinaryId, "planner", dateKey)).toBe(0);
    });

    it("gives a neighbouring account no share of the owner's entitlement", async () => {
      // A DIFFERENT account is configured. `ordinaryId` is deliberately not it:
      // the ids are created in sequence, so "ownerId + 1" would have been the
      // ordinary user and would have proved the opposite of the intent.
      const thirdId = (
        await prisma.user.create({
          data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
        })
      ).id;
      expect(thirdId).not.toBe(ordinaryId);
      configureOwner(String(thirdId));

      await exhaust(ordinaryId, "planner");
      const refused = await reserveQuota(ordinaryId, "planner");
      expect(refused.unlimited).toBe(false);
      expect(refused.charged).toBe(false);
      expect(refused.allowed).toBe(false);

      // The configured account is the only one that is unlimited.
      await exhaust(thirdId, "planner");
      const permitted = await reserveQuota(thirdId, "planner");
      expect(permitted.unlimited).toBe(true);
      expect(permitted.allowed).toBe(true);
    });

    it("grants nobody when the entitlement is unconfigured", async () => {
      configureOwner(undefined);
      await exhaust(ownerId, "planner");

      const refused = await reserveQuota(ownerId, "planner");
      expect(refused.unlimited).toBe(false);
      expect(refused.allowed).toBe(false);
      expect(refused.charged).toBe(false);
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });
  });

  describe("planner operation lifecycle for the owner", () => {
    const newPlan = () =>
      createPlanShell(ownerId, { mode: "EXAM", title: "Quota", creationKey: randomUUID(), subjectId: null, goalId: null });

    it("generates from an exhausted week, persists a BYPASSED receipt, and never charges", async () => {
      await exhaust(ownerId, "planner");
      const plan = await newPlan();
      const key = randomUUID();

      const op = await beginOperation(ownerId, plan.id, {
        operationKey: key,
        expectedVersion: 0,
        input: fixtureInput(),
      });
      expect(op.acquired).toBe(true);

      const reserved = op.quotaReceipt as { state: string; unlimited: boolean };
      expect(reserved.state).toBe("RESERVED");
      expect(reserved.unlimited).toBe(true);
      // The reservation was durable (it is ON the revision row) ...
      expect((await prisma.plannerRevision.findUniqueOrThrow({ where: { id: op.id } })).quotaReceipt).not.toBeNull();
      // ... and yet the counter never moved.
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);

      const sealed = await finishOperation(ownerId, plan.id, key, fixtureProposal());
      expect(sealed.operationState).toBe("SEALED");
      expect((sealed.quotaReceipt as { state: string }).state).toBe("SETTLED");
      expect((sealed.quotaReceipt as { unlimited: boolean }).unlimited).toBe(true);
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("replays an idempotent retry without a second reservation or a second revision", async () => {
      await exhaust(ownerId, "planner");
      const plan = await newPlan();
      const key = randomUUID();
      const body = { operationKey: key, expectedVersion: 0, input: fixtureInput() };

      const first = await beginOperation(ownerId, plan.id, body);
      const retry = await beginOperation(ownerId, plan.id, body);

      expect(retry.id).toBe(first.id);
      expect(retry.acquired).toBe(false);
      expect(await prisma.plannerRevision.count({ where: { planId: plan.id } })).toBe(1);
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("recovers a settled operation and reports its bypassed receipt state", async () => {
      await exhaust(ownerId, "planner");
      const plan = await newPlan();
      const key = randomUUID();
      await beginOperation(ownerId, plan.id, { operationKey: key, expectedVersion: 0, input: fixtureInput() });
      await finishOperation(ownerId, plan.id, key, fixtureProposal());

      const recovered = await recoverOperation(ownerId, plan.id, key, true, "operation", new Date("2031-01-01"));
      expect(recovered.state).toBe("SEALED");
      expect(recovered.quotaState).toBe("SETTLED");
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("releases a failed generation without inventing a refund", async () => {
      await exhaust(ownerId, "planner");
      const plan = await newPlan();
      const key = randomUUID();
      await beginOperation(ownerId, plan.id, { operationKey: key, expectedVersion: 0, input: fixtureInput() });

      const cancelled = await stopOperation(ownerId, plan.id, key, "CANCELLED");
      expect(cancelled.operationState).toBe("CANCELLED");
      expect((cancelled.quotaReceipt as { state: string }).state).toBe("RELEASED");
      expect((cancelled.quotaReceipt as { unlimited: boolean }).unlimited).toBe(true);
      // Nothing was reserved, so nothing may be given back.
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("expires an abandoned operation and still leaves the counter untouched", async () => {
      await exhaust(ownerId, "planner");
      const plan = await newPlan();
      const key = randomUUID();
      await beginOperation(ownerId, plan.id, { operationKey: key, expectedVersion: 0, input: fixtureInput() });

      const recovered = await recoverOperation(ownerId, plan.id, key, true, "operation", new Date("2031-01-01"));
      expect(recovered.state).toBe("FAILED");
      expect(recovered.quotaState).toBe("RELEASED");
      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("permits repeated generations indefinitely", async () => {
      await exhaust(ownerId, "planner");

      for (let i = 0; i < 4; i += 1) {
        const plan = await newPlan();
        const key = randomUUID();
        const op = await beginOperation(ownerId, plan.id, {
          operationKey: key,
          expectedVersion: 0,
          input: fixtureInput(),
        });
        expect(op.acquired).toBe(true);
        const sealed = await finishOperation(ownerId, plan.id, key, fixtureProposal());
        expect(sealed.operationState).toBe("SEALED");
      }

      expect(await usedFor(ownerId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });
  });

  describe("ordinary accounts are untouched by the same code path", () => {
    it("is refused with QUOTA_EXHAUSTED when the week is spent", async () => {
      configureOwner(undefined);
      await exhaust(ordinaryId, "planner");
      const plan = await createPlanShell(ordinaryId, {
        mode: "EXAM",
        title: "Quota",
        creationKey: randomUUID(),
        subjectId: null,
        goalId: null,
      });

      await expect(
        beginOperation(ordinaryId, plan.id, { operationKey: randomUUID(), expectedVersion: 0, input: fixtureInput() })
      ).rejects.toMatchObject({ status: 429, code: "QUOTA_EXHAUSTED" });

      expect(await usedFor(ordinaryId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("charges and settles normally while capacity remains", async () => {
      configureOwner(undefined);
      const plan = await createPlanShell(ordinaryId, {
        mode: "EXAM",
        title: "Quota",
        creationKey: randomUUID(),
        subjectId: null,
        goalId: null,
      });
      const key = randomUUID();

      const op = await beginOperation(ordinaryId, plan.id, {
        operationKey: key,
        expectedVersion: 0,
        input: fixtureInput(),
      });
      expect((op.quotaReceipt as { unlimited: boolean }).unlimited).toBe(false);
      expect(await usedFor(ordinaryId, "planner", bucketFor("planner", "UTC"))).toBe(1);

      const sealed = await finishOperation(ordinaryId, plan.id, key, fixtureProposal());
      expect((sealed.quotaReceipt as { state: string }).state).toBe("SETTLED");
      // A settled generation keeps its charge.
      expect(await usedFor(ordinaryId, "planner", bucketFor("planner", "UTC"))).toBe(1);
    });

    it("gets its unit back when its reservation is released", async () => {
      configureOwner(undefined);
      const plan = await createPlanShell(ordinaryId, {
        mode: "EXAM",
        title: "Quota",
        creationKey: randomUUID(),
        subjectId: null,
        goalId: null,
      });
      const key = randomUUID();
      await beginOperation(ordinaryId, plan.id, { operationKey: key, expectedVersion: 0, input: fixtureInput() });

      await stopOperation(ordinaryId, plan.id, key, "FAILED");
      expect(await usedFor(ordinaryId, "planner", bucketFor("planner", "UTC"))).toBe(0);
    });

    it("is not rescued by the owner's entitlement, and the owner is not harmed by its limits", async () => {
      configureOwner(String(ownerId));
      await exhaust(ordinaryId, "planner");

      const ordinaryPlan = await createPlanShell(ordinaryId, {
        mode: "EXAM",
        title: "Quota",
        creationKey: randomUUID(),
        subjectId: null,
        goalId: null,
      });
      await expect(
        beginOperation(ordinaryId, ordinaryPlan.id, {
          operationKey: randomUUID(),
          expectedVersion: 0,
          input: fixtureInput(),
        })
      ).rejects.toMatchObject({ status: 429, code: "QUOTA_EXHAUSTED" });

      // The owner remains unlimited in the very same run.
      const ownerQuota = await reserveQuota(ownerId, "planner");
      expect(ownerQuota.unlimited).toBe(true);
      expect(ownerQuota.allowed).toBe(true);
    });
  });
});
