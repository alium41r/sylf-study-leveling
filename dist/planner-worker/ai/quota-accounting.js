"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotaReceiptBucket = quotaReceiptBucket;
exports.reserveOwnedQuota = reserveOwnedQuota;
exports.settleOwnedQuota = settleOwnedQuota;
const config_1 = require("./config");
const timezone_service_1 = require("../timezone-service");
const cognitive_stats_1 = require("../cognitive-stats");
const entitlement_policy_1 = require("./entitlement-policy");
function quotaReceiptBucket(feature, timezone, now) {
    if (!timezone_service_1.TimezoneService.validateTimezone(timezone))
        throw new Error("QUOTA_TIMEZONE_UNAVAILABLE");
    if (config_1.AI_QUOTAS[feature].window === "week") {
        const bucket = timezone_service_1.TimezoneService.getUserLocalWeekKey(timezone, now);
        return { dateKey: bucket.weekKey, resetsAt: bucket.resetsAt.toISOString() };
    }
    return { dateKey: timezone_service_1.TimezoneService.getUserLocalDate(timezone, now), resetsAt: timezone_service_1.TimezoneService.getNextMidnightUTC(timezone, now).toISOString() };
}
async function reserveOwnedQuota(sql, userId, feature, now) {
    const user = (await sql.query('SELECT timezone FROM "User" WHERE id=$1', [userId])).rows[0];
    if (!user)
        throw new Error("QUOTA_OWNER_NOT_FOUND");
    const bucket = quotaReceiptBucket(feature, String(user.timezone), now);
    let limit = config_1.AI_QUOTAS[feature].limit;
    if (feature === "chat") {
        const stats = (await sql.query('SELECT discipline FROM "UserStats" WHERE "userId"=$1', [userId])).rows[0];
        limit += (0, cognitive_stats_1.getCognitiveEffects)((0, cognitive_stats_1.normalizeCognitiveStats)(stats ?? undefined)).bonusChatQuota;
    }
    const unlimited = (0, entitlement_policy_1.isUnlimitedAiUser)(userId);
    if (!unlimited && !(await sql.query(`INSERT INTO "UserQuota" ("userId",feature,"dateKey",used,"createdAt","updatedAt")
    VALUES ($1,$2,$3,1,$4,$4) ON CONFLICT ("userId",feature,"dateKey") DO UPDATE
    SET used="UserQuota".used+1,"updatedAt"=$4 WHERE "UserQuota".used<$5 RETURNING used`, [userId, feature, bucket.dateKey, now.toISOString(), limit])).rows.length)
        return null;
    return { schemaVersion: 1, userId, feature, ...bucket, reservedAt: now.toISOString(), state: "RESERVED", settledAt: null, unlimited };
}
async function settleOwnedQuota(sql, receipt, outcome, now) {
    if (receipt.state === outcome)
        return receipt;
    if (receipt.state !== "RESERVED")
        throw new Error("QUOTA_ALREADY_FINALIZED");
    if (outcome === "RELEASED" && receipt.unlimited !== true) {
        const result = await sql.query('UPDATE "UserQuota" SET used=used-1,"updatedAt"=$4 WHERE "userId"=$1 AND feature=$2 AND "dateKey"=$3 AND used>0 RETURNING id', [receipt.userId, receipt.feature, receipt.dateKey, now.toISOString()]);
        if (result.rows.length !== 1)
            throw new Error("QUOTA_RECEIPT_INCONSISTENT");
    }
    return { ...receipt, state: outcome, settledAt: now.toISOString() };
}
