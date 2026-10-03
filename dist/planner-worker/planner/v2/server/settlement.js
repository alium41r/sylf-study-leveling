"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleWeeklyMission = settleWeeklyMission;
const game_engine_1 = require("../../../game-engine");
const cognitive_stats_1 = require("../../../cognitive-stats");
const database_1 = require("./database");
/** One settlement owner for both protocols. Caller holds the user coordination
 * lock and has settled Session/Quest before taking these economic row locks. */
async function settleWeeklyMission(sql, ownerId, now) {
    const user = (await (0, database_1.rows)(sql, 'SELECT timezone,"lastActiveDate","streakDays",level FROM "User" WHERE id=$1 FOR UPDATE', [ownerId]))[0];
    const bounds = (0, game_engine_1.getWeeklyBounds)(now, user.timezone);
    if (user.lastActiveDate === bounds.weekKey)
        return false;
    const stats = (await (0, database_1.rows)(sql, 'SELECT tenacity FROM "UserStats" WHERE "userId"=$1 FOR UPDATE', [ownerId]))[0];
    const target = (0, cognitive_stats_1.getCognitiveEffects)({ tenacity: stats?.tenacity }).weeklyTargetMinutes;
    // Keep the existing per-session rounded-minute reward rule. V2 actuals retain
    // their accepted civil date even if the student's timezone later changes.
    const localStart = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(bounds.weekStart);
    const localEnd = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(bounds.weekEnd);
    const minutes = Number((await (0, database_1.rows)(sql, `SELECT COALESCE(sum("durationMinutes"),0) AS minutes FROM "StudySession"
    WHERE "userId"=$1 AND CASE WHEN "executionContext"->>'actualCivilDate' IS NOT NULL
      THEN "executionContext"->>'actualCivilDate' BETWEEN $2 AND $3 ELSE "startedAt" BETWEEN $4 AND $5 END`, [ownerId, localStart, localEnd, bounds.weekStart.toISOString(), bounds.weekEnd.toISOString()]))[0].minutes);
    if (minutes < target)
        return false;
    const freeze = (await (0, database_1.rows)(sql, 'SELECT id FROM "InventoryItem" WHERE "userId"=$1 AND "itemKey"=\'STREAK_FREEZE\' AND quantity>0 ORDER BY id LIMIT 1 FOR UPDATE', [ownerId]))[0];
    const streak = (0, game_engine_1.calculateWeeklyStreak)(user.lastActiveDate, bounds.weekKey, user.streakDays, !!freeze);
    const reward = (0, game_engine_1.calculateWeeklyQuestReward)(user.level);
    // Preserve the existing weekly economic policy (Sylph payout); this phase
    // does not change reward math or introduce an additional XP payout.
    await sql.query('UPDATE "User" SET "streakDays"=$2,"lastActiveDate"=$3,sylph=sylph+$4 WHERE id=$1', [ownerId, streak.newStreak, bounds.weekKey, reward.sylphReward]);
    if (streak.freezeUsed && freeze) {
        await sql.query('UPDATE "InventoryItem" SET quantity=quantity-1,"updatedAt"=$2 WHERE id=$1', [freeze.id, now.toISOString()]);
        await sql.query('INSERT INTO "SystemMessage" ("userId",content,type) VALUES ($1,$2,\'STREAK\')', [ownerId,
            `**Weekly Streak Freeze Consumed**\n\nYour Streak Freeze protected your weekly streak after a missed cycle. Streak continues at **${streak.newStreak} weeks**!`]);
    }
    await sql.query('INSERT INTO "SystemMessage" ("userId",content,type) VALUES ($1,$2,\'STREAK\')', [ownerId,
        `**Weekly Mission Complete: ${Math.round(target / 60 * 10) / 10} Hours of Focus!**\n\nYou completed the weekly ${target}-minute study target (Tenacity reduces it below the standard 3h). Weekly streak is now **${streak.newStreak} week${streak.newStreak === 1 ? "" : "s"}**!\n\nRewards Claimed: +${reward.xpReward} XP, +${reward.sylphReward} Sylph.`]);
    return true;
}
