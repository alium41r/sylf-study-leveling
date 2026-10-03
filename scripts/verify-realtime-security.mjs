// ============================================================================
// SYLF Focus Party: Realtime Security & Cross-Party Penetration Test Suite
// ============================================================================
// Verifies:
// 1. RLS enforcement on FocusParty for cross-party and outsider callers
// 2. RLS enforcement on FocusPartyMember for cross-party and outsider callers
// 3. RLS enforcement on FocusSession for cross-party and outsider callers
// 4. RLS enforcement on FocusSessionMember for cross-party and outsider callers
// 5. Modification isolation: User cannot alter another member's timer row
// 6. Anonymous / unauthenticated callers receive 0 records
// 7. Legitimate members can read their own party's data
// 8. Service layer / RPC identity boundary verification
// ============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}

const url = env.DIRECT_URL || env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, max: 5 });

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASSED: ${message}`);
    passed++;
  }
}

async function runPenetrationSuite() {
  console.log("==================================================");
  console.log("🛡️ STARTING REALTIME & RLS PENETRATION AUDIT");
  console.log("==================================================");

  const adminClient = await pool.connect();
  const testUserIds = [];
  let partyAId = null;
  let partyBId = null;
  let sessionAId = null;
  let sessionBId = null;

  try {
    // 0. Setup test users:
    // u1: Party A Leader, u2: Party A Member
    // u3: Party B Leader, u4: Party B Member
    // u5: Outsider (No Party)
    console.log("\n--- Creating 5 test users ---");
    for (let i = 1; i <= 5; i++) {
      const email = `pen_test_${Date.now()}_${i}@test.sylf.dev`;
      const username = `pen_user_${Date.now()}_${i}`;
      const res = await adminClient.query(
        `INSERT INTO public."User" (email, username, password, name)
         VALUES ($1, $2, 'hash123', $3)
         RETURNING id`,
        [email, username, `Pen Tester ${i}`]
      );
      testUserIds.push(res.rows[0].id);
    }
    const [u1, u2, u3, u4, u5] = testUserIds;
    console.log(`Users: u1=${u1}, u2=${u2}, u3=${u3}, u4=${u4}, u5=${u5}`);

    // Create mutual friendships for invites
    await adminClient.query(
      `INSERT INTO public."Friendship" ("userId", "friendId") VALUES
       ($1, $2), ($2, $1),
       ($3, $4), ($4, $3)`,
      [u1, u2, u3, u4]
    );

    // Setup Party A (u1 leader, u2 member)
    const pARes = await adminClient.query(
      `SELECT public.create_focus_party($1, 'Party Alpha') AS res`,
      [u1]
    );
    partyAId = pARes.rows[0].res.partyId;

    await adminClient.query(
      `INSERT INTO public."SessionInvite" ("partyId", "senderId", "receiverId", "status")
       VALUES ($1, $2, $3, 'PENDING')`,
      [partyAId, u1, u2]
    );
    await adminClient.query(
      `SELECT public.join_focus_party($1, $2) AS res`,
      [partyAId, u2]
    );

    // Start Session in Party A
    const sARes = await adminClient.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyAId, u1]
    );
    sessionAId = sARes.rows[0].res.sessionId;
    await adminClient.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyAId, u2]
    );
    await adminClient.query(
      `SELECT public.start_focus_timer($1, $2) AS res`,
      [sessionAId, u1]
    );

    // Setup Party B (u3 leader, u4 member)
    const pBRes = await adminClient.query(
      `SELECT public.create_focus_party($1, 'Party Beta') AS res`,
      [u3]
    );
    partyBId = pBRes.rows[0].res.partyId;

    await adminClient.query(
      `INSERT INTO public."SessionInvite" ("partyId", "senderId", "receiverId", "status")
       VALUES ($1, $2, $3, 'PENDING')`,
      [partyBId, u3, u4]
    );
    await adminClient.query(
      `SELECT public.join_focus_party($1, $2) AS res`,
      [partyBId, u4]
    );

    const sBRes = await adminClient.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyBId, u3]
    );
    sessionBId = sBRes.rows[0].res.sessionId;

    console.log(`Setup complete: Party A=${partyAId} (session=${sessionAId}), Party B=${partyBId} (session=${sessionBId})`);

    // Helper to run query as a specific authenticated user via RLS
    async function queryAsUser(userId, sql, params = []) {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE authenticated");
        if (userId !== null) {
          await client.query(
            `SELECT set_config('request.jwt.claims', $1, false)`,
            [JSON.stringify({ sub: String(userId), role: "authenticated" })]
          );
        } else {
          // Anonymous / unauthenticated
          await client.query(`SELECT set_config('request.jwt.claims', '', false)`);
        }
        return await client.query(sql, params);
      } finally {
        await client.query("RESET ROLE").catch(() => {});
        client.release();
      }
    }

    // ──────────────────────────────────────────────────────────
    // Vector 1: Cross-Party Data Exposure via FocusParty RLS
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 1: Cross-Party FocusParty RLS Read ---");
    // u3 (Party B) attempts to read Party A
    const u3ReadPartyA = await queryAsUser(
      u3,
      `SELECT * FROM public."FocusParty" WHERE id = $1`,
      [partyAId]
    );
    assert(
      u3ReadPartyA.rows.length === 0,
      `User 3 (Party B) CANNOT see Party A via RLS (0 rows returned)`
    );

    // u5 (Outsider) attempts to read Party A
    const u5ReadPartyA = await queryAsUser(
      u5,
      `SELECT * FROM public."FocusParty" WHERE id = $1`,
      [partyAId]
    );
    assert(
      u5ReadPartyA.rows.length === 0,
      `User 5 (Outsider) CANNOT see Party A via RLS (0 rows returned)`
    );

    // Legitimate member u2 reads Party A
    const u2ReadPartyA = await queryAsUser(
      u2,
      `SELECT * FROM public."FocusParty" WHERE id = $1`,
      [partyAId]
    );
    assert(
      u2ReadPartyA.rows.length === 1 && u2ReadPartyA.rows[0].id === partyAId,
      `User 2 (Party A Member) CAN see Party A via RLS (1 row returned)`
    );

    // ──────────────────────────────────────────────────────────
    // Vector 2: Cross-Party FocusPartyMember Membership Exposure
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 2: Cross-Party FocusPartyMember RLS Read ---");
    // u3 (Party B) attempts to read members of Party A
    const u3ReadMembersA = await queryAsUser(
      u3,
      `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1`,
      [partyAId]
    );
    assert(
      u3ReadMembersA.rows.length === 0,
      `User 3 (Party B) CANNOT see members of Party A (0 rows returned)`
    );

    // u5 (Outsider) attempts to read members of Party A
    const u5ReadMembersA = await queryAsUser(
      u5,
      `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1`,
      [partyAId]
    );
    assert(
      u5ReadMembersA.rows.length === 0,
      `User 5 (Outsider) CANNOT see members of Party A (0 rows returned)`
    );

    // Legitimate member u1 reads Party A members
    const u1ReadMembersA = await queryAsUser(
      u1,
      `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1`,
      [partyAId]
    );
    assert(
      u1ReadMembersA.rows.length === 2,
      `User 1 (Party A Member) sees all 2 active members of Party A`
    );

    // ──────────────────────────────────────────────────────────
    // Vector 3: Cross-Party FocusSession Exposure
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 3: Cross-Party FocusSession RLS Read ---");
    const u3ReadSessionA = await queryAsUser(
      u3,
      `SELECT * FROM public."FocusSession" WHERE "partyId" = $1`,
      [partyAId]
    );
    assert(
      u3ReadSessionA.rows.length === 0,
      `User 3 (Party B) CANNOT see FocusSession of Party A (0 rows returned)`
    );

    const u5ReadSessionA = await queryAsUser(
      u5,
      `SELECT * FROM public."FocusSession" WHERE "partyId" = $1`,
      [partyAId]
    );
    assert(
      u5ReadSessionA.rows.length === 0,
      `User 5 (Outsider) CANNOT see FocusSession of Party A (0 rows returned)`
    );

    // ──────────────────────────────────────────────────────────
    // Vector 4: Cross-Party FocusSessionMember (Timer States)
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 4: Cross-Party FocusSessionMember RLS Read ---");
    const u3ReadParticipantsA = await queryAsUser(
      u3,
      `SELECT * FROM public."FocusSessionMember" WHERE "sessionId" = $1`,
      [sessionAId]
    );
    assert(
      u3ReadParticipantsA.rows.length === 0,
      `User 3 (Party B) CANNOT see timer states/participants of Party A (0 rows returned)`
    );

    const u5ReadParticipantsA = await queryAsUser(
      u5,
      `SELECT * FROM public."FocusSessionMember" WHERE "sessionId" = $1`,
      [sessionAId]
    );
    assert(
      u5ReadParticipantsA.rows.length === 0,
      `User 5 (Outsider) CANNOT see timer states/participants of Party A (0 rows returned)`
    );

    // Legitimate participant u1 reads participants of Session A
    const u1ReadParticipantsA = await queryAsUser(
      u1,
      `SELECT * FROM public."FocusSessionMember" WHERE "sessionId" = $1`,
      [sessionAId]
    );
    assert(
      u1ReadParticipantsA.rows.length === 2,
      `User 1 (Participant) sees all 2 participants in Session A`
    );

    // ──────────────────────────────────────────────────────────
    // Vector 5: Malicious Timer Tampering (Cross-User Modification)
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 5: Cross-User Timer State Tampering ---");
    // u2 attempts to directly UPDATE u1's timer state in FocusSessionMember
    let directUpdateBlocked = false;
    try {
      const u2TamperU1 = await queryAsUser(
        u2,
        `UPDATE public."FocusSessionMember"
         SET "timerState" = 'PAUSED', "accumulatedSeconds" = 99999
         WHERE "sessionId" = $1 AND "userId" = $2`,
        [sessionAId, u1]
      );
      if (u2TamperU1.rowCount === 0) directUpdateBlocked = true;
    } catch (err) {
      // Direct UPDATE is blocked by PostgreSQL table privileges or RLS
      directUpdateBlocked = true;
    }
    assert(
      directUpdateBlocked,
      `User 2 CANNOT modify User 1's timer state via direct table UPDATE (strictly denied)`
    );

    // u2 attempts to call RPC pause_focus_timer targeting u1
    let rpcTamperBlocked = false;
    try {
      await queryAsUser(
        u2,
        `SELECT public.pause_focus_timer($1, $2)`,
        [sessionAId, u1]
      );
    } catch (err) {
      rpcTamperBlocked = true;
      assert(
        err.message.includes("S2 identity guard") || err.message.includes("42501"),
        `RPC pause_focus_timer targeting another user blocked by S2 guard: ${err.message}`
      );
    }
    assert(rpcTamperBlocked, `Cross-user timer tampering via RPC was strictly rejected`);

    // Verify u1's timer state was NOT modified
    const u1Check = await adminClient.query(
      `SELECT "timerState", "accumulatedSeconds" FROM public."FocusSessionMember" WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionAId, u1]
    );
    assert(
      u1Check.rows[0].timerState === "FOCUSING" && u1Check.rows[0].accumulatedSeconds === 0,
      `User 1 timer state remained pristine and untouched`
    );

    // ──────────────────────────────────────────────────────────
    // Vector 6: Anonymous / Unauthenticated Access
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 6: Unauthenticated / Anon Access ---");
    const anonParty = await queryAsUser(null, `SELECT * FROM public."FocusParty" WHERE id = $1`, [partyAId]);
    assert(anonParty.rows.length === 0, `Anonymous client receives 0 FocusParty rows`);

    const anonMembers = await queryAsUser(null, `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1`, [partyAId]);
    assert(anonMembers.rows.length === 0, `Anonymous client receives 0 FocusPartyMember rows`);

    const anonSession = await queryAsUser(null, `SELECT * FROM public."FocusSession" WHERE "partyId" = $1`, [partyAId]);
    assert(anonSession.rows.length === 0, `Anonymous client receives 0 FocusSession rows`);

    const anonSessionMembers = await queryAsUser(null, `SELECT * FROM public."FocusSessionMember" WHERE "sessionId" = $1`, [sessionAId]);
    assert(anonSessionMembers.rows.length === 0, `Anonymous client receives 0 FocusSessionMember rows`);

    // ──────────────────────────────────────────────────────────
    // Vector 7: S2 RPC Identity Guard Bypasses
    // ──────────────────────────────────────────────────────────
    console.log("\n--- Vector 7: S2 RPC Identity Guard Spoofing ---");
    // u5 executes join_focus_party claiming p_user_id = u1
    let s2GuardBlocked = false;
    try {
      await queryAsUser(
        u5,
        `SELECT public.join_focus_party($1, $2)`,
        [partyAId, u1]
      );
    } catch (err) {
      s2GuardBlocked = true;
      assert(
        err.message.includes("S2 identity guard") || err.message.includes("42501"),
        `S2 identity guard blocked spoofed caller identity: ${err.message}`
      );
    }
    assert(s2GuardBlocked, "Spoofed caller identity in RPC was strictly rejected");

    console.log("\n==================================================");
    console.log(`🎉 ALL ${passed} PENETRATION ATTACK VECTORS SAFELY DEFENDED!`);
    console.log("==================================================");
  } finally {
    // Cleanup test artifacts
    if (partyAId) {
      await adminClient.query(`DELETE FROM public."SessionInvite" WHERE "partyId" = $1`, [partyAId]).catch(() => {});
      if (sessionAId) {
        await adminClient.query(`UPDATE public."FocusSession" SET "endedAt" = NULL WHERE id = $1`, [sessionAId]).catch(() => {});
        await adminClient.query(`DELETE FROM public."FocusSessionMember" WHERE "sessionId" = $1`, [sessionAId]).catch(() => {});
        await adminClient.query(`DELETE FROM public."FocusSession" WHERE id = $1`, [sessionAId]).catch(() => {});
      }
      await adminClient.query(`DELETE FROM public."FocusPartyMember" WHERE "partyId" = $1`, [partyAId]).catch(() => {});
      await adminClient.query(`DELETE FROM public."FocusParty" WHERE id = $1`, [partyAId]).catch(() => {});
    }
    if (partyBId) {
      await adminClient.query(`DELETE FROM public."SessionInvite" WHERE "partyId" = $1`, [partyBId]).catch(() => {});
      if (sessionBId) {
        await adminClient.query(`UPDATE public."FocusSession" SET "endedAt" = NULL WHERE id = $1`, [sessionBId]).catch(() => {});
        await adminClient.query(`DELETE FROM public."FocusSessionMember" WHERE "sessionId" = $1`, [sessionBId]).catch(() => {});
        await adminClient.query(`DELETE FROM public."FocusSession" WHERE id = $1`, [sessionBId]).catch(() => {});
      }
      await adminClient.query(`DELETE FROM public."FocusPartyMember" WHERE "partyId" = $1`, [partyBId]).catch(() => {});
      await adminClient.query(`DELETE FROM public."FocusParty" WHERE id = $1`, [partyBId]).catch(() => {});
    }
    if (testUserIds.length > 0) {
      await adminClient.query(`DELETE FROM public."Friendship" WHERE "userId" = ANY($1) OR "friendId" = ANY($1)`, [testUserIds]).catch(() => {});
      await adminClient.query(`DELETE FROM public."User" WHERE id = ANY($1)`, [testUserIds]).catch(() => {});
    }
    adminClient.release();
    await pool.end();
  }
}

runPenetrationSuite().catch((err) => {
  console.error("PENETRATION TEST FAILED:", err);
  process.exit(1);
});
