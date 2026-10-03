/**
 * @vitest-environment node
 *
 * The quota ENGINE under entitlement: an owner account is permitted without
 * consuming capacity, an ordinary account behaves exactly as it did before,
 * and the durable planner receipt lifecycle stays intact for both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkQuota,
  getUsageReport,
  quotaReceiptBucket,
  releaseQuota,
  reserveQuota,
  reserveRevisionQuota,
  settleRevisionQuota,
  type QuotaFeature,
  type QuotaReservationReceipt,
} from "@/lib/ai/usage-limiter";
import { UNLIMITED_AI_USER_IDS_ENV } from "@/lib/ai/entitlements";
import { prisma } from "@/lib/prisma";

const OWNER = 122;
const ORDINARY = 7;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    userQuota: { findUnique: vi.fn(), updateMany: vi.fn() },
    userStats: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/timezone-service", () => ({
  TimezoneService: {
    getUserLocalDate: vi.fn().mockReturnValue("2026-09-30"),
    getUserLocalWeekKey: vi
      .fn()
      .mockReturnValue({ weekKey: "2026-W40", resetsAt: new Date("2026-10-05T00:00:00Z") }),
    getNextMidnightUTC: vi.fn().mockReturnValue(new Date("2026-10-01T00:00:00Z")),
    validateTimezone: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
}));

function configureOwner(value: string | undefined) {
  if (value === undefined) delete process.env[UNLIMITED_AI_USER_IDS_ENV];
  else process.env[UNLIMITED_AI_USER_IDS_ENV] = value;
}

/** A week bucket that is already fully consumed for a 1/week planner quota. */
function exhaustedBucket() {
  vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 1 } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  configureOwner(undefined);
  vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.userStats.findUnique).mockResolvedValue(null);
});

afterEach(() => configureOwner(undefined));

describe("Unlimited owner: exhausted product quotas no longer block", () => {
  beforeEach(() => configureOwner(String(OWNER)));

  it("permits an AI chat request whose daily bucket is exhausted", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 10 } as any);
    const quota = await reserveQuota(OWNER, "chat");

    expect(quota.allowed).toBe(true);
    expect(quota.unlimited).toBe(true);
    // Nothing was charged, so a gate written as `!charged` must pair with `unlimited`.
    expect(quota.charged).toBe(false);
  });

  it("permits the Classic Planner when the weekly bucket is exhausted", async () => {
    exhaustedBucket();
    const quota = await reserveQuota(OWNER, "planner");

    expect(quota.allowed).toBe(true);
    expect(quota.unlimited).toBe(true);
    expect(quota.charged).toBe(false);
  });

  it("permits Planner Modes expansions and rebalances when their buckets are exhausted", async () => {
    exhaustedBucket();
    const expansion = await reserveQuota(OWNER, "plannerExpansion");
    const rebalance = await reserveQuota(OWNER, "plannerRebalance");

    expect(expansion.allowed).toBe(true);
    expect(expansion.unlimited).toBe(true);
    expect(rebalance.allowed).toBe(true);
    expect(rebalance.unlimited).toBe(true);
  });

  it("permits syllabus compile and scope evaluation when their buckets are exhausted", async () => {
    exhaustedBucket();
    expect((await reserveQuota(OWNER, "compile")).allowed).toBe(true);
    expect((await reserveQuota(OWNER, "scope")).allowed).toBe(true);
  });

  it("never touches the quota counter — no unit is consumed and no row is written", async () => {
    exhaustedBucket();
    await reserveQuota(OWNER, "chat");
    await reserveQuota(OWNER, "planner");
    await reserveQuota(OWNER, "compile");
    await reserveQuota(OWNER, "scope");

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.userQuota.updateMany).not.toHaveBeenCalled();
  });

  it("does not decrement the real counter when an error path releases", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 4 } as any);
    await releaseQuota(OWNER, "chat");
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("reports capacity as explicitly unlimited, never as a large fake number", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 3 } as any);
    const quota = await checkQuota(OWNER, "chat");

    expect(quota.unlimited).toBe(true);
    expect(quota.allowed).toBe(true);
    expect(quota.limit).toBeNull();
    expect(quota.remaining).toBeNull();
    // Telemetry is preserved: the REAL used count is still reported.
    expect(quota.used).toBe(3);
  });

  it("reports unlimited for every feature the UI reads, so no badge shows a cap", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 1 } as any);
    const report = await getUsageReport(OWNER);

    const features: QuotaFeature[] = [
      "chat",
      "planner",
      "plannerExpansion",
      "plannerRebalance",
      "compile",
      "scope",
    ];
    for (const feature of features) {
      expect(report[feature].unlimited).toBe(true);
      expect(report[feature].allowed).toBe(true);
      expect(report[feature].limit).toBeNull();
      expect(report[feature].remaining).toBeNull();
    }
  });

  it("stays permitted across repeated generations — usage never accumulates into a block", async () => {
    // Simulate a bucket that kept growing past every configured limit.
    for (const used of [1, 2, 3, 25, 5000]) {
      vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used } as any);
      const quota = await reserveQuota(OWNER, "planner");
      expect(quota.allowed).toBe(true);
      expect(quota.unlimited).toBe(true);
    }
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("Ordinary user: enforcement is byte-for-byte unchanged", () => {
  it("reserves normally when capacity remains", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([{ used: 1 }] as any);
    const quota = await reserveQuota(ORDINARY, "chat");

    expect(quota.allowed).toBe(true);
    expect(quota.charged).toBe(true);
    expect(quota.unlimited).toBe(false);
    expect(quota.limit).toBe(10);
    expect(quota.remaining).toBe(9);
  });

  it("still rejects with charged=false and remaining=0 at the limit", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 10 } as any);
    const quota = await reserveQuota(ORDINARY, "chat");

    expect(quota.allowed).toBe(false);
    expect(quota.charged).toBe(false);
    expect(quota.unlimited).toBe(false);
    expect(quota.remaining).toBe(0);
    expect(quota.limit).toBe(10);
  });

  it("still rejects the exhausted weekly planner bucket", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 1 } as any);
    const quota = await reserveQuota(ORDINARY, "planner");

    expect(quota.allowed).toBe(false);
    expect(quota.charged).toBe(false);
    expect(quota.unlimited).toBe(false);
    expect(quota.limit).toBe(1);
  });

  it("still refunds through the guarded decrement", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([] as any);
    await releaseQuota(ORDINARY, "chat");

    const sql = String(vi.mocked(prisma.$queryRawUnsafe).mock.calls[0][0]);
    expect(sql).toContain('"used" = "UserQuota"."used" - 1');
    expect(sql).toContain('AND "used" > 0');
  });

  it("still reports real numeric capacity for the UI", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue({ used: 3 } as any);
    const quota = await checkQuota(ORDINARY, "chat");

    expect(quota.unlimited).toBe(false);
    expect(quota.limit).toBe(10);
    expect(quota.remaining).toBe(7);
    expect(quota.used).toBe(3);
  });
});

/**
 * The durable planner receipt is structural: operation recovery, revision
 * lifecycle and idempotent retry all read it. The entitlement must therefore
 * still ISSUE one — marked bypassed — rather than skip it.
 */
describe("Planner receipt lifecycle under entitlement", () => {
  const planId = "11111111-1111-4111-8111-111111111111";
  const revisionId = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-09-30T10:00:00Z");

  function txMock(options: { receipt?: QuotaReservationReceipt | null } = {}) {
    return {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: "UTC" }) },
      userStats: { findUnique: vi.fn().mockResolvedValue(null) },
      userQuota: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      plannerRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: revisionId,
          planId,
          operationState: "PREPARING",
          leaseExpiresAt: new Date(now.getTime() + 120_000),
          quotaReceipt: options.receipt ?? null,
        }),
        update: vi.fn().mockResolvedValue({ id: revisionId }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $queryRawUnsafe: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.startsWith('SELECT timezone')) return [{ timezone: "UTC" }];
        return [];
      }),
    } as any;
  }

  /**
   * Only the guarded `INSERT INTO "UserQuota"` is a quota WRITE. `$queryRaw` is
   * also used for the operation's `FOR UPDATE` lock, which must always run.
   */
  function quotaWrites(tx: any): unknown[] {
    return tx.$queryRawUnsafe.mock.calls.filter((call: any[]) =>
      String(call[0] ?? "").includes('INSERT INTO "UserQuota"')
    );
  }

  beforeEach(() => configureOwner(String(OWNER)));
  afterEach(() => configureOwner(undefined));

  it("issues a durable BYPASSED receipt for an unlimited generation", async () => {
    const tx = txMock();
    const receipt = await reserveRevisionQuota(tx, OWNER, revisionId, "planner", now);

    expect(receipt).not.toBeNull();
    expect(receipt!.unlimited).toBe(true);
    expect(receipt!.state).toBe("RESERVED");
    expect(receipt!.userId).toBe(OWNER);
    expect(receipt!.feature).toBe("planner");
    // The bucket is still recorded so the receipt remains a faithful timeline.
    expect(receipt!.dateKey).toBe(quotaReceiptBucket("planner", "UTC", now).dateKey);
    // ...but no quota row was inserted or incremented (the FOR UPDATE lock still ran).
    expect(quotaWrites(tx)).toHaveLength(0);
  });

  it("persists the bypassed receipt onto the operation for recovery", async () => {
    const tx = txMock();
    await reserveRevisionQuota(tx, OWNER, revisionId, "planner", now);

    expect(tx.plannerRevision.update).toHaveBeenCalledTimes(1);
    const data = tx.plannerRevision.update.mock.calls[0][0].data;
    expect(data.quotaReceipt.unlimited).toBe(true);
  });

  it("remains idempotent — a retry returns the same receipt and does not re-reserve", async () => {
    const stored: QuotaReservationReceipt = {
      schemaVersion: 1,
      userId: OWNER,
      feature: "planner",
      dateKey: "2026-W40",
      resetsAt: "2026-10-05T00:00:00.000Z",
      reservedAt: now.toISOString(),
      state: "RESERVED",
      settledAt: null,
      unlimited: true,
    };
    const tx = txMock({ receipt: stored });
    const receipt = await reserveRevisionQuota(tx, OWNER, revisionId, "planner", now);

    expect(receipt).toEqual(stored);
    expect(tx.plannerRevision.update).not.toHaveBeenCalled();
  });

  it("settles to SETTLED without touching the counter", async () => {
    const receipt: QuotaReservationReceipt = {
      schemaVersion: 1,
      userId: OWNER,
      feature: "planner",
      dateKey: "2026-W40",
      resetsAt: "2026-10-05T00:00:00.000Z",
      reservedAt: now.toISOString(),
      state: "RESERVED",
      settledAt: null,
      unlimited: true,
    };
    const tx = txMock({ receipt });
    const settled = await settleRevisionQuota(tx, OWNER, revisionId, "SETTLED", now);

    expect(settled.state).toBe("SETTLED");
    expect(settled.unlimited).toBe(true);
    expect(tx.userQuota.updateMany).not.toHaveBeenCalled();
  });

  it("releases a failed generation without a refund it never earned", async () => {
    const receipt: QuotaReservationReceipt = {
      schemaVersion: 1,
      userId: OWNER,
      feature: "planner",
      dateKey: "2026-W40",
      resetsAt: "2026-10-05T00:00:00.000Z",
      reservedAt: now.toISOString(),
      state: "RESERVED",
      settledAt: null,
      unlimited: true,
    };
    const tx = txMock({ receipt });
    const released = await settleRevisionQuota(tx, OWNER, revisionId, "RELEASED", now);

    expect(released.state).toBe("RELEASED");
    // No reserved row existed, so nothing may be decremented and no
    // QUOTA_RECEIPT_INCONSISTENT may be raised.
    expect(tx.userQuota.updateMany).not.toHaveBeenCalled();
  });

  it("replays a release idempotently and still refuses to reopen a finalised receipt", async () => {
    const receipt: QuotaReservationReceipt = {
      schemaVersion: 1,
      userId: OWNER,
      feature: "planner",
      dateKey: "2026-W40",
      resetsAt: "2026-10-05T00:00:00.000Z",
      reservedAt: now.toISOString(),
      state: "RELEASED",
      settledAt: now.toISOString(),
      unlimited: true,
    };
    const tx = txMock({ receipt });
    const replay = await settleRevisionQuota(tx, OWNER, revisionId, "RELEASED", now);
    expect(replay.state).toBe("RELEASED");

    await expect(
      settleRevisionQuota(tx, OWNER, revisionId, "SETTLED", now)
    ).rejects.toThrow("QUOTA_ALREADY_FINALIZED");
  });

  it("keeps ordinary users on the charging path", async () => {
    configureOwner(undefined);
    const tx = txMock();
    tx.$queryRawUnsafe.mockImplementation(async (sql: string) => sql.startsWith("SELECT timezone") ? [{ timezone: "UTC" }] : [{ used: 1 }]);
    const receipt = await reserveRevisionQuota(tx, ORDINARY, revisionId, "planner", now);

    expect(receipt!.unlimited).toBe(false);
    expect(quotaWrites(tx)).toHaveLength(1);
  });

  it("keeps ordinary users rejected when the bucket is exhausted", async () => {
    configureOwner(undefined);
    const tx = txMock();
    // txMock retains the timezone read; the guarded upsert returns no row.
    const receipt = await reserveRevisionQuota(tx, ORDINARY, revisionId, "planner", now);

    expect(receipt).toBeNull();
  });

  it("still refuses a receipt for an expired or missing operation, for everyone", async () => {
    const tx = txMock();
    tx.plannerRevision.findFirst.mockResolvedValue(null);
    await expect(
      reserveRevisionQuota(tx, OWNER, revisionId, "planner", now)
    ).rejects.toThrow("QUOTA_OPERATION_NOT_FOUND");

    const expired = txMock();
    expired.plannerRevision.findFirst.mockResolvedValue({
      id: revisionId,
      operationState: "PREPARING",
      leaseExpiresAt: new Date(now.getTime() - 1_000),
      quotaReceipt: null,
    });
    await expect(
      reserveRevisionQuota(expired, OWNER, revisionId, "planner", now)
    ).rejects.toThrow("QUOTA_OPERATION_EXPIRED");
  });

  it("still rejects a receipt whose feature does not match the operation", async () => {
    const tx = txMock({
      receipt: {
        schemaVersion: 1,
        userId: OWNER,
        feature: "chat",
        dateKey: "2026-W40",
        resetsAt: "2026-10-05T00:00:00.000Z",
        reservedAt: now.toISOString(),
        state: "RESERVED",
        settledAt: null,
        unlimited: true,
      },
    });
    await expect(
      reserveRevisionQuota(tx, OWNER, revisionId, "planner", now)
    ).rejects.toThrow("QUOTA_RECEIPT_MISMATCH");
  });

  it("still refuses to settle an operation that never reserved", async () => {
    const tx = txMock({ receipt: null });
    await expect(
      settleRevisionQuota(tx, OWNER, revisionId, "SETTLED", now)
    ).rejects.toThrow("QUOTA_RECEIPT_MISSING");
  });

  it("still refuses an invalid timezone rather than bypassing it", async () => {
    const { TimezoneService } = await import("@/lib/timezone-service");
    vi.mocked(TimezoneService.validateTimezone).mockReturnValueOnce(false);
    expect(() => quotaReceiptBucket("planner", "Not/AZone", now)).toThrow(
      "QUOTA_TIMEZONE_UNAVAILABLE"
    );
  });
});
