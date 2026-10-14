import { calculateWeeklyStreak, calculateWeeklyQuestReward, getWeeklyBounds } from "../../../game-engine";
import { getCognitiveEffects } from "../../../cognitive-stats";
import { rows, type Sql } from "./database";

/** One settlement owner for both protocols. Caller holds the user coordination
 * lock and has settled Session/Quest before taking these economic row locks. */
export async function settleWeeklyMission(sql: Sql, ownerId: number, now: Date): Promise<boolean> {
  const user = (await rows<{ timezone: string; lastActiveDate: string | null; streakDays: number; level: number }>(sql,
    'SELECT timezone,"lastActiveDate","streakDays",level FROM "User" WHERE id=$1 FOR UPDATE', [ownerId]))[0];
  const bounds = getWeeklyBounds(now, user.timezone);
  if (user.lastActiveDate === bounds.weekKey) return false;
  // The legacy scalar remembers only the latest award. Preserve it as a ledger
  // receipt before recovering an older/newer week, so delayed sessions cannot
  // repay an old mission or rewind the current streak.
  if (user.lastActiveDate?.match(/^\d{4}-W\d{2}$/)) await sql.query(`INSERT INTO "SylphLedger" ("userId",amount,delta,reason,source,metadata)
    VALUES ($1,0,0,'WEEKLY_MISSION','SYSTEM',$2) ON CONFLICT DO NOTHING`,
    [ownerId, { weekKey: user.lastActiveDate, streakDays: user.streakDays, freezeUsed: false }]);
  const receipts = await rows<{ metadata: { weekKey: string; streakDays: number; freezeUsed: boolean } }>(sql,
    'SELECT metadata FROM "SylphLedger" WHERE "userId"=$1 AND reason=\'WEEKLY_MISSION\' ORDER BY metadata->>\'weekKey\'', [ownerId]);
  if (receipts.some(receipt => receipt.metadata.weekKey === bounds.weekKey)) return false;
  const stats = (await rows<{ tenacity: number }>(sql, 'SELECT tenacity FROM "UserStats" WHERE "userId"=$1 FOR UPDATE', [ownerId]))[0];
  const target = getCognitiveEffects({ tenacity: stats?.tenacity }).weeklyTargetMinutes;
  // Keep the existing per-session rounded-minute reward rule. V2 actuals retain
  // their accepted civil date even if the student's timezone later changes.
  const localStart = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(bounds.weekStart);
  const localEnd = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(bounds.weekEnd);
  // Legacy deployments have no executionContext column yet. Inspect the row
  // representation so their existing timer can settle without a V2 migration;
  // when present, the accepted V2 civil date remains authoritative.
  const minutes = Number((await rows<{ minutes: string }>(sql, `SELECT COALESCE(sum("durationMinutes"),0) AS minutes FROM "StudySession" AS s
    WHERE "userId"=$1 AND CASE WHEN to_jsonb(s)->'executionContext'->>'actualCivilDate' IS NOT NULL
      THEN to_jsonb(s)->'executionContext'->>'actualCivilDate' BETWEEN $2 AND $3 ELSE "startedAt" BETWEEN $4 AND $5 END`,
    [ownerId, localStart, localEnd, bounds.weekStart.toISOString(), bounds.weekEnd.toISOString()]))[0].minutes);
  if (minutes < target) return false;
  const freeze = (await rows<{ id: number }>(sql, 'SELECT id FROM "InventoryItem" WHERE "userId"=$1 AND "itemKey"=\'STREAK_FREEZE\' AND quantity>0 ORDER BY id LIMIT 1 FOR UPDATE', [ownerId]))[0];
  const historical = !!user.lastActiveDate && user.lastActiveDate > bounds.weekKey;
  const streak = historical ? { newStreak: user.streakDays, freezeUsed: false }
    : calculateWeeklyStreak(user.lastActiveDate, bounds.weekKey, user.streakDays, !!freeze);
  const reward = calculateWeeklyQuestReward(user.level);
  // Preserve the existing weekly economic policy (Sylph payout); this phase
  // does not change reward math or introduce an additional XP payout.
  await sql.query('INSERT INTO "SylphLedger" ("userId",amount,delta,reason,source,metadata) VALUES ($1,$2,$2,\'WEEKLY_MISSION\',\'SYSTEM\',$3)',
    [ownerId, reward.sylphReward, { weekKey: bounds.weekKey, streakDays: streak.newStreak, freezeUsed: streak.freezeUsed }]);
  if (historical) {
    const known = [...receipts.map(receipt => receipt.metadata), { weekKey: bounds.weekKey, streakDays: 1, freezeUsed: false }]
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    let consecutive = known[0].streakDays;
    for (let i = 1; i < known.length; i++) consecutive = calculateWeeklyStreak(known[i - 1].weekKey, known[i].weekKey, consecutive, known[i].freezeUsed).newStreak;
    streak.newStreak = Math.max(user.streakDays, consecutive);
  }
  await sql.query('UPDATE "User" SET "streakDays"=$2,"lastActiveDate"=$3,sylph=sylph+$4 WHERE id=$1',
    [ownerId, streak.newStreak, historical ? user.lastActiveDate : bounds.weekKey, reward.sylphReward]);
  if (streak.freezeUsed && freeze) {
    await sql.query('UPDATE "InventoryItem" SET quantity=quantity-1,"updatedAt"=$2 WHERE id=$1', [freeze.id, now.toISOString()]);
    await sql.query('INSERT INTO "SystemMessage" ("userId",content,type) VALUES ($1,$2,\'STREAK\')', [ownerId,
      `**Weekly Streak Freeze Consumed**\n\nYour Streak Freeze protected your weekly streak after a missed cycle. Streak continues at **${streak.newStreak} weeks**!`]);
  }
  await sql.query('INSERT INTO "SystemMessage" ("userId",content,type) VALUES ($1,$2,\'STREAK\')', [ownerId,
    `**Weekly Mission Complete: ${Math.round(target / 60 * 10) / 10} Hours of Focus!**\n\nYou completed the weekly ${target}-minute study target (Tenacity reduces it below the standard 3h). Weekly streak is now **${streak.newStreak} week${streak.newStreak === 1 ? "" : "s"}**!\n\nRewards Claimed: +${reward.sylphReward} Sylph.`]);
  return true;
}
