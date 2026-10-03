// ============================================================================
// Confirmation Suite:
// 1. Invite Creation Authorization (Members can create, non-members cannot)
// 2. Rejoin Cleanup & State Reset (leftAt wiped, state reset, 0 duplicate rows)
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

async function runConfirmation() {
  console.log("==================================================");
  console.log("🔬 STARTING CONFIRMATION AUDIT SUITE");
  console.log("==================================================");

  const client = await pool.connect();
  const testUserIds = [];
  let partyId = null;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ CONFIRMED: ${message}`);
    }
  }

  try {
    // 0. Setup test users: u1 (leader), u2 (regular member), u3 (target friend), u4 (non-member)
    console.log("\n--- Creating 4 test users ---");
    for (let i = 1; i <= 4; i++) {
      const email = `test_confirm_${Date.now()}_${i}@test.sylf.dev`;
      const username = `confirm_user_${Date.now()}_${i}`;
      const res = await client.query(
        `INSERT INTO public."User" (email, username, password, name)
         VALUES ($1, $2, 'hash123', $3)
         RETURNING id`,
        [email, username, `Confirm Tester ${i}`]
      );
      testUserIds.push(res.rows[0].id);
    }
    const [u1, u2, u3, u4] = testUserIds;
    console.log(`Users: u1(leader)=${u1}, u2(member)=${u2}, u3(friend)=${u3}, u4(non-member)=${u4}`);

    // Create friendships: u1-u2, u2-u3
    await client.query(
      `INSERT INTO public."Friendship" ("userId", "friendId") VALUES ($1, $2), ($2, $3)`,
      [u1, u2, u3]
    );

    // Create party with u1 as leader
    const createPartyRes = await client.query(
      `SELECT public.create_focus_party($1, 'Confirmation Party') AS res`,
      [u1]
    );
    partyId = createPartyRes.rows[0].res.partyId;
    console.log(`Party created: ID=${partyId}, leader=${u1}`);

    // u1 invites u2, and u2 joins as regular member
    await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $3, 'PENDING')`,
      [u1, u2, partyId]
    );
    await client.query(`SELECT public.join_focus_party($1, $2)`, [partyId, u2]);
    console.log(`u2 joined party ${partyId} as regular (non-leader) member.`);

    // ========================================================================
    // 1. CONFIRMATION 1: INVITE CREATION AUTHORIZATION
    // ========================================================================
    console.log("\n==================================================");
    console.log("1. TESTING INVITE CREATION AUTHORIZATION");
    console.log("==================================================");

    // Test 1A: Non-member (u4) attempts to create an invite to the party
    let nonMemberInviteBlocked = false;
    try {
      await client.query(
        `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
         VALUES ($1, $2, $3, 'PENDING')`,
        [u4, u3, partyId]
      );
    } catch (err) {
      nonMemberInviteBlocked = err.message.includes("Sender must be a member of the party to create an invite");
    }
    assert(nonMemberInviteBlocked, "Non-member u4 CANNOT create a Focus Party invite (blocked by database trigger trg_check_focus_party_invite_sender)");

    // Test 1B: Regular member u2 (NOT leader) creates an invite for u3
    const memberInviteRes = await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id, "senderId", "receiverId", "partyId", "status"`,
      [u2, u3, partyId]
    );
    assert(memberInviteRes.rowCount === 1, "Regular party member u2 CAN create a Focus Party invite");
    const u2Invite = memberInviteRes.rows[0];
    assert(u2Invite.senderId === u2 && u2Invite.partyId === partyId, "Invite row accurately records regular member u2 as sender");

    // Test 1C: Leader u1 creates an invite for u4
    const leaderInviteRes = await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id`,
      [u1, u4, partyId]
    );
    assert(leaderInviteRes.rowCount === 1, "Party leader u1 CAN create a Focus Party invite");

    // Clean up pending invites for subsequent tests
    await client.query(`DELETE FROM public."SessionInvite" WHERE "partyId" = $1`, [partyId]);

    // ========================================================================
    // 2. CONFIRMATION 2: REJOIN CLEANUP & PARTICIPATION STATE RESET
    // ========================================================================
    console.log("\n==================================================");
    console.log("2. TESTING REJOIN CLEANUP & ZERO DUPLICATE ROWS");
    console.log("==================================================");

    // Step 2A: Both u1 and u2 enter focus session
    const enter1 = await client.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyId, u1]
    );
    const sessionId = enter1.rows[0].res.sessionId;

    const enter2 = await client.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyId, u2]
    );
    assert(enter2.rows[0].res.sessionId === sessionId, "Both members in the same active session");

    const rowInitial = await client.query(
      `SELECT id, "timerState", "accumulatedSeconds", "currentStartedAt", "joinedAt", "leftAt"
       FROM public."FocusSessionMember"
       WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u2]
    );
    assert(rowInitial.rowCount === 1, "Exactly 1 FocusSessionMember row on initial entry");
    assert(rowInitial.rows[0].timerState === "NOT_STARTED", "Initial timerState is NOT_STARTED");
    assert(rowInitial.rows[0].accumulatedSeconds === 0, "Initial accumulatedSeconds is 0");
    assert(rowInitial.rows[0].leftAt === null, "Initial leftAt is NULL");
    const memberRowId = rowInitial.rows[0].id;

    // Step 2B: User 2 starts timer and studies for ~1.2s
    console.log("User 2 starting focus timer...");
    await client.query(`SELECT public.start_focus_timer($1, $2)`, [sessionId, u2]);
    await new Promise((r) => setTimeout(r, 1200));

    // Step 2C: User 2 leaves the focus session
    console.log("User 2 leaving focus session...");
    const leaveRes = await client.query(
      `SELECT public.leave_focus_session($1, $2) AS res`,
      [sessionId, u2]
    );
    const bankedAfterLeave = leaveRes.rows[0].res.accumulatedSeconds;
    assert(bankedAfterLeave >= 1, `Duration successfully banked on leave (accumulatedSeconds = ${bankedAfterLeave}s)`);
    assert(leaveRes.rows[0].res.sessionEnded === false, "Session remains ACTIVE because u1 is still a participant");

    // Inspect database row while in LEFT state
    const rowAfterLeave = await client.query(
      `SELECT id, "timerState", "accumulatedSeconds", "currentStartedAt", "leftAt"
       FROM public."FocusSessionMember"
       WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u2]
    );
    assert(rowAfterLeave.rowCount === 1, "Still exactly 1 row while in LEFT state");
    assert(rowAfterLeave.rows[0].timerState === "LEFT", "Database row timerState is 'LEFT'");
    assert(rowAfterLeave.rows[0].currentStartedAt === null, "currentStartedAt is NULL while left");
    assert(rowAfterLeave.rows[0].leftAt !== null, `leftAt is populated with exit timestamp: ${rowAfterLeave.rows[0].leftAt.toISOString()}`);
    assert(rowAfterLeave.rows[0].id === memberRowId, "Row primary key id has not changed");

    // Step 2D: User 2 REJOINS the session!
    console.log("User 2 REJOINING focus session...");
    const rejoinRes = await client.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyId, u2]
    );
    assert(rejoinRes.rows[0].res.sessionId === sessionId, "Rejoined the SAME active session ID");

    // Inspect database row immediately after REJOIN
    const rowAfterRejoin = await client.query(
      `SELECT id, "timerState", "accumulatedSeconds", "currentStartedAt", "joinedAt", "leftAt"
       FROM public."FocusSessionMember"
       WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u2]
    );

    // Assertions for Rejoin Cleanup
    assert(rowAfterRejoin.rowCount === 1, "CONFIRMED: Exactly ONE row in FocusSessionMember (ZERO duplicate rows created)");
    assert(rowAfterRejoin.rows[0].id === memberRowId, "CONFIRMED: Same primary key row was updated in-place");
    assert(rowAfterRejoin.rows[0].leftAt === null, "CONFIRMED: old leftAt was wiped and reset to NULL");
    assert(rowAfterRejoin.rows[0].timerState === "PAUSED", "CONFIRMED: timerState transitioned cleanly from LEFT to PAUSED");
    assert(rowAfterRejoin.rows[0].accumulatedSeconds === bankedAfterLeave, `CONFIRMED: Cumulative time preserved exactly (${bankedAfterLeave}s)`);
    assert(rowAfterRejoin.rows[0].currentStartedAt === null, "CONFIRMED: currentStartedAt is NULL waiting for user resume");

    // Step 2E: User 2 resumes and studies another stretch
    console.log("User 2 resuming timer...");
    await client.query(`SELECT public.resume_focus_timer($1, $2)`, [sessionId, u2]);
    await new Promise((r) => setTimeout(r, 1200));

    // Step 2F: User 2 leaves and rejoins a SECOND time
    console.log("User 2 leaving and rejoining a second time...");
    await client.query(`SELECT public.leave_focus_session($1, $2)`, [sessionId, u2]);

    const rowSecondLeave = await client.query(
      `SELECT "leftAt", "timerState" FROM public."FocusSessionMember" WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u2]
    );
    assert(rowSecondLeave.rows[0].leftAt !== null, "Second leave: leftAt re-populated with new timestamp");
    assert(rowSecondLeave.rows[0].timerState === "LEFT", "Second leave: timerState is LEFT");

    await client.query(`SELECT public.enter_focus_session($1, $2)`, [partyId, u2]);
    const rowSecondRejoin = await client.query(
      `SELECT id, "leftAt", "timerState", "accumulatedSeconds"
       FROM public."FocusSessionMember"
       WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u2]
    );
    assert(rowSecondRejoin.rowCount === 1, "Second rejoin: still exactly 1 row (no duplicate)");
    assert(rowSecondRejoin.rows[0].leftAt === null, "Second rejoin: leftAt is again cleanly wiped to NULL");
    assert(rowSecondRejoin.rows[0].timerState === "PAUSED", "Second rejoin: timerState reset to PAUSED");
    assert(rowSecondRejoin.rows[0].accumulatedSeconds > bankedAfterLeave, "Second rejoin: cumulative duration accumulated both sessions");

    console.log("\n==================================================");
    console.log("🎉 ALL AUDIT CONFIRMATIONS PASSED 100%");
    console.log("==================================================");

  } finally {
    console.log("\n--- Cleaning up test artifacts ---");
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = 'replica'");
      if (partyId) {
        await client.query(`DELETE FROM public."FocusParty" WHERE id = $1`, [partyId]);
      }
      if (testUserIds.length > 0) {
        await client.query(`DELETE FROM public."User" WHERE id = ANY($1)`, [testUserIds]);
      }
      await client.query("COMMIT");
      console.log("Cleanup complete.");
    } catch (e) {
      await client.query("ROLLBACK");
      console.warn("Cleanup warning:", e.message);
    }
    client.release();
  }
}

runConfirmation().catch((err) => {
  console.error("FATAL ERROR IN CONFIRMATION:", err);
  process.exit(1);
}).finally(() => pool.end());
