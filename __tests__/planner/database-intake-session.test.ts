// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  bindPlan,
  cleanupExpiredSessions,
  createOrResumeSession,
  deleteSession,
  INTAKE_SESSION_TTL_DAYS,
  isExpired,
  patchSession,
  readSession,
} from "@/lib/planner/server/intake-session";
import { createPlanShell } from "@/lib/planner/server/revisions";

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

const DAY = 24 * 60 * 60 * 1000;

/** The expiry rule is a pure function of `expiresAt`, independent of the database. */
describe("intake session expiry policy", () => {
  it("keeps sessions for the documented TTL and expires inclusively at the boundary", () => {
    expect(INTAKE_SESSION_TTL_DAYS).toBe(30);
    const now = new Date("2026-01-01T00:00:00.000Z");
    const session = { expiresAt: new Date(now.getTime() + DAY) };
    expect(isExpired(session, now)).toBe(false);
    expect(isExpired(session, new Date(now.getTime() + DAY - 1))).toBe(false);
    expect(isExpired(session, new Date(now.getTime() + DAY))).toBe(true);
    expect(isExpired(session, new Date(now.getTime() + DAY + 1))).toBe(true);
  });
});

describe.skipIf(!database)("planner PostgreSQL intake-session persistence", () => {
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

  function clientKey() {
    return `ck_${randomUUID().replace(/-/g, "")}`;
  }

  function createPlan(owner: number, mode = "EXAM") {
    return createPlanShell(owner, {
      mode,
      title: `Plan ${randomUUID()}`,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
  }

  it("creates once, resumes idempotently on the same key, and flags (without mutating) a mode mismatch", async () => {
    const key = clientKey();
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: key, mode: "EXAM" });
    expect(created).toMatchObject({ resumed: false, modeMismatch: false, mode: "EXAM", version: 0 });

    const retried = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: key, mode: "EXAM" });
    expect(retried.id).toBe(created.id);
    expect(retried).toMatchObject({ resumed: true, modeMismatch: false });
    expect(await prisma.plannerIntakeSession.count({ where: { userId } })).toBe(1);

    const conflicting = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: key, mode: "ROADMAP" });
    expect(conflicting.id).toBe(created.id);
    expect(conflicting).toMatchObject({ resumed: true, modeMismatch: true });
    expect(await prisma.plannerIntakeSession.count({ where: { userId } })).toBe(1);
    // The existing row is untouched by the conflicting create.
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } })).toMatchObject({
      mode: "EXAM",
      version: 0,
    });
  });

  it("scopes reads to the owner: a foreign or unknown id is NOT_FOUND", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    expect((await readSession(userId, created.id)).id).toBe(created.id);
    await expect(readSession(strangerId, created.id)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(readSession(userId, randomUUID())).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("applies a patch at the current version, increments version, and slides expiresAt forward", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    const createdExpiry = created.expiresAt.getTime();
    // Force expiry far into the past so the refresh is observable.
    await prisma.plannerIntakeSession.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - DAY) } });

    const patched = await patchSession(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: 0,
      brief: { goal: "pass the exam" },
    });
    expect(patched.version).toBe(1);
    expect(patched.brief).toEqual({ goal: "pass the exam" });
    // Expiry slid forward to roughly now + TTL, never before the original create.
    expect(patched.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(patched.expiresAt.getTime()).toBeGreaterThanOrEqual(createdExpiry);
    expect(isExpired(patched, new Date())).toBe(false);
  });

  it("throws INTAKE_STALE on a stale version and leaves the row byte-identical", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    await patchSession(userId, created.id, { schemaVersion: 1, expectedVersion: 0, brief: { n: 1 } });
    const before = await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } });
    await expect(
      patchSession(userId, created.id, { schemaVersion: 1, expectedVersion: 0, brief: { n: 2 } })
    ).rejects.toMatchObject({ status: 409, code: "INTAKE_STALE" });
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } })).toEqual(before);
  });

  it("rejects an oversized brief with a closed code and writes nothing", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    await expect(
      patchSession(userId, created.id, {
        schemaVersion: 1,
        expectedVersion: 0,
        brief: { goal: "x".repeat(64 * 1024) },
      })
    ).rejects.toMatchObject({ status: 422, code: "PAYLOAD_TOO_LARGE" });
    const row = await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } });
    expect(row?.version).toBe(0);
    expect(row?.brief).toEqual({});
  });

  it("binds the plan it generated and rejects another user's plan", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    const mine = await createPlan(userId);
    expect((await bindPlan(userId, created.id, mine.id, 0)).planId).toBe(mine.id);

    const strangerPlan = await createPlan(strangerId);
    await expect(bindPlan(userId, created.id, strangerPlan.id, 0)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(bindPlan(userId, created.id, randomUUID(), 0)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } })).toMatchObject({ planId: mine.id });
  });

  it("deletes owner-scoped and idempotently", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    // A foreign delete is a no-op and leaves the row for its owner.
    await expect(deleteSession(strangerId, created.id)).resolves.toMatchObject({ deleted: false });
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: created.id } })).not.toBeNull();
    await expect(deleteSession(userId, created.id)).resolves.toMatchObject({ deleted: true });
    await expect(deleteSession(userId, created.id)).resolves.toMatchObject({ deleted: false });
  });

  it("deleting a session never deletes the plan or its revisions it was bound to", async () => {
    const created = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    const plan = await createPlan(userId);
    const revision = await prisma.plannerRevision.create({
      data: {
        planId: plan.id,
        sequence: 1,
        source: "GENERATE",
        baseVersion: 0,
        inputSnapshot: {},
        availabilitySnapshot: {},
        operationKey: randomUUID(),
        operationHash: "a".repeat(64),
        leaseExpiresAt: new Date(Date.now() + 60000),
      },
    });
    await bindPlan(userId, created.id, plan.id, 0);
    await prisma.plannerIntakeSession.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
    await deleteSession(userId, created.id);
    expect(await prisma.plannerPlan.findUnique({ where: { id: plan.id } })).not.toBeNull();
    expect(await prisma.plannerRevision.findUnique({ where: { id: revision.id } })).toMatchObject({ planId: plan.id });
  });

  it("cleanup removes only expired rows, reports the count, and leaves a bound plan intact", async () => {
    const plan = await createPlan(userId);
    const expired1 = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    const expired2 = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    const alive = await createOrResumeSession(userId, { schemaVersion: 1, clientKey: clientKey(), mode: "EXAM" });
    await bindPlan(userId, expired1.id, plan.id, 0);
    await prisma.plannerIntakeSession.updateMany({
      where: { id: { in: [expired1.id, expired2.id] } },
      data: { expiresAt: new Date(Date.now() - DAY) },
    });
    await prisma.plannerIntakeSession.update({ where: { id: alive.id }, data: { expiresAt: new Date(Date.now() + DAY) } });

    expect(await cleanupExpiredSessions(new Date())).toBe(2);
    expect(await prisma.plannerIntakeSession.count({ where: { userId } })).toBe(1);
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: alive.id } })).not.toBeNull();
    expect(await prisma.plannerIntakeSession.findUnique({ where: { id: expired1.id } })).toBeNull();
    // Cleanup must not touch the plan bound to an expired session.
    expect(await prisma.plannerPlan.findUnique({ where: { id: plan.id } })).not.toBeNull();
  });

  it("has RLS enabled, zero client grants, and no Realtime publication", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'PlannerIntakeSession'`;
    expect(tables).toHaveLength(1);
    const rls = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'PlannerIntakeSession'`;
    expect(rls).toHaveLength(1);
    expect(rls[0].relrowsecurity).toBe(true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
        'SELECT has_table_privilege($1, $2, $3) AS allowed',
        role,
        '"PlannerIntakeSession"',
        "SELECT,INSERT,UPDATE,DELETE"
      );
      expect(rows[0].allowed).toBe(false);
    }
    expect(await prisma.$queryRaw`SELECT 1 FROM pg_publication_tables WHERE tablename = 'PlannerIntakeSession'`).toEqual([]);
  });

  it("rejects an invalid mode and out-of-bounds client keys at the database", async () => {
    await expect(
      prisma.plannerIntakeSession.create({ data: { userId, clientKey: clientKey(), mode: "BOGUS", brief: {}, expiresAt: new Date() } })
    ).rejects.toThrow();
    await expect(
      prisma.plannerIntakeSession.create({ data: { userId, clientKey: "short", mode: "EXAM", brief: {}, expiresAt: new Date() } })
    ).rejects.toThrow();
    await expect(
      prisma.plannerIntakeSession.create({ data: { userId, clientKey: "bad key!", mode: "EXAM", brief: {}, expiresAt: new Date() } })
    ).rejects.toThrow();
    expect(await prisma.plannerIntakeSession.count({ where: { userId } })).toBe(0);
  });
});
