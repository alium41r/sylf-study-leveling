import { AI_QUOTAS, type QuotaFeature } from "./config";
import { TimezoneService } from "../timezone-service";
import { getCognitiveEffects, normalizeCognitiveStats } from "../cognitive-stats";
import { isUnlimitedAiUser } from "./entitlement-policy";

/** Existing UserQuota authority, shared by web Prisma and the Node worker.
 * Callers lock the durable receipt owner and persist the returned receipt in
 * this same transaction. No process-local refund or second quota ledger. */
export interface QuotaReservationReceipt {
  schemaVersion: 1; userId: number; feature: QuotaFeature; dateKey: string;
  resetsAt: string; reservedAt: string; state: "RESERVED" | "SETTLED" | "RELEASED";
  settledAt: string | null; unlimited: boolean;
}
export interface QuotaSql {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export function quotaReceiptBucket(feature: QuotaFeature, timezone: string, now: Date) {
  if (!TimezoneService.validateTimezone(timezone)) throw new Error("QUOTA_TIMEZONE_UNAVAILABLE");
  if (AI_QUOTAS[feature].window === "week") {
    const bucket = TimezoneService.getUserLocalWeekKey(timezone, now);
    return { dateKey: bucket.weekKey, resetsAt: bucket.resetsAt.toISOString() };
  }
  return { dateKey: TimezoneService.getUserLocalDate(timezone, now), resetsAt: TimezoneService.getNextMidnightUTC(timezone, now).toISOString() };
}
export async function reserveOwnedQuota(sql: QuotaSql, userId: number, feature: QuotaFeature, now: Date): Promise<QuotaReservationReceipt | null> {
  const user = (await sql.query('SELECT timezone FROM "User" WHERE id=$1', [userId])).rows[0];
  if (!user) throw new Error("QUOTA_OWNER_NOT_FOUND");
  const bucket = quotaReceiptBucket(feature, String(user.timezone), now);
  let limit: number = AI_QUOTAS[feature].limit;
  if (feature === "chat") {
    const stats = (await sql.query('SELECT discipline FROM "UserStats" WHERE "userId"=$1', [userId])).rows[0];
    limit += getCognitiveEffects(normalizeCognitiveStats(stats ?? undefined)).bonusChatQuota;
  }
  const unlimited = isUnlimitedAiUser(userId);
  if (!unlimited && !(await sql.query(`INSERT INTO "UserQuota" ("userId",feature,"dateKey",used,"createdAt","updatedAt")
    VALUES ($1,$2,$3,1,$4,$4) ON CONFLICT ("userId",feature,"dateKey") DO UPDATE
    SET used="UserQuota".used+1,"updatedAt"=$4 WHERE "UserQuota".used<$5 RETURNING used`, [userId, feature, bucket.dateKey, now.toISOString(), limit])).rows.length) return null;
  return { schemaVersion: 1, userId, feature, ...bucket, reservedAt: now.toISOString(), state: "RESERVED", settledAt: null, unlimited };
}
export async function settleOwnedQuota(sql: QuotaSql, receipt: QuotaReservationReceipt, outcome: "SETTLED" | "RELEASED", now: Date): Promise<QuotaReservationReceipt> {
  if (receipt.state === outcome) return receipt;
  if (receipt.state !== "RESERVED") throw new Error("QUOTA_ALREADY_FINALIZED");
  if (outcome === "RELEASED" && receipt.unlimited !== true) {
    const result = await sql.query('UPDATE "UserQuota" SET used=used-1,"updatedAt"=$4 WHERE "userId"=$1 AND feature=$2 AND "dateKey"=$3 AND used>0 RETURNING id',
      [receipt.userId, receipt.feature, receipt.dateKey, now.toISOString()]);
    if (result.rows.length !== 1) throw new Error("QUOTA_RECEIPT_INCONSISTENT");
  }
  return { ...receipt, state: outcome, settledAt: now.toISOString() };
}
