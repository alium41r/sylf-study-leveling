// ============================================================================
// Focus Party Verification Suite — Tests all 18 specification requirements
// + Security Hardening & Penetration Vectors (Vibe Security Audit)
// ============================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}

const url = env.DIRECT_URL || env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, max: 10 });

let testUserIds = [];
let testPartyIds = [];

async function main() {
  console.log("==================================================");
  console.log("🚀 STARTING FOCUS PARTY VERIFICATION (SECURITY AUDITED)");
  console.log("==================================================");

  const client = await pool.connect();
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

  try {
    // 0. Setup test users
    console.log("\n--- Setting up 5 test users ---");
    for (let i = 1; i <= 5; i++) {
      const email = `test_fp_user_${Date.now()}_${i}@test.sylf.dev`;
      const username = `fp_user_${Date.now()}_${i}`;
      const res = await client.query(
        `INSERT INTO public."User" (email, username, password, name)
         VALUES ($1, $2, 'hash123', $3)
         RETURNING id`,
        [email, username, `FP Tester ${i}`]
      );
      testUserIds.push(res.rows[0].id);
    }
    const [u1, u2, u3, u4, u5] = testUserIds;
    console.log(`Test users created: u1=${u1}, u2=${u2}, u3=${u3}, u4=${u4}, u5=${u5}`);

    // Setup friend relationships between u1 and u2, u3, u4
    await client.query(`INSERT INTO public."Friendship" ("userId", "friendId") VALUES ($1, $2), ($1, $3), ($1, $4)`, [u1, u2, u3, u4]);

    // 1. Test 1: Create party
    console.log("\n--- Test 1: Create party ---");
    const createRes = await client.query(
      `SELECT public.create_focus_party($1, 'Alpha Squad') AS res`,
      [u1]
    );
    const partyData = createRes.rows[0].res;
    assert(partyData.success === true, "create_focus_party returns success: true");
    assert(partyData.leaderId === u1, "Leader is u1");
    const partyId = partyData.partyId;
    testPartyIds.push(partyId);

    const m1Check = await client.query(
      `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1 AND "userId" = $2`,
      [partyId, u1]
    );
    assert(m1Check.rowCount === 1, "u1 is in FocusPartyMember");

    // 2. Test 2: Add members up to 4 & Invitation Enforcement
    console.log("\n--- Test 2: Add members up to 4 & Invitation Enforcement ---");
    // Verify uninvited user cannot join
    let uninvitedBlocked = false;
    try {
      await client.query(`SELECT public.join_focus_party($1, $2) AS res`, [partyId, u2]);
    } catch (err) {
      uninvitedBlocked = err.message.includes("Unauthorized: user has no pending invitation");
    }
    assert(uninvitedBlocked, "Uninvited user u2 blocked from joining party with 42501");

    // Create invitations for u2, u3, u4
    await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $4, 'PENDING'), ($1, $3, $4, 'PENDING'), ($1, $5, $4, 'PENDING')`,
      [u1, u2, u3, partyId, u4]
    );

    const j2 = await client.query(`SELECT public.join_focus_party($1, $2) AS res`, [partyId, u2]);
    const j3 = await client.query(`SELECT public.join_focus_party($1, $2) AS res`, [partyId, u3]);
    const j4 = await client.query(`SELECT public.join_focus_party($1, $2) AS res`, [partyId, u4]);
    assert(j2.rows[0].res.success && j3.rows[0].res.success && j4.rows[0].res.success, "Users 2, 3, 4 successfully joined with active invites");

    const countRes = await client.query(
      `SELECT count(*) FROM public."FocusPartyMember" WHERE "partyId" = $1`,
      [partyId]
    );
    assert(parseInt(countRes.rows[0].count) === 4, "Party has exactly 4 members");

    // 3. Test 3: Prevent 5th member & PostgREST write revocation
    console.log("\n--- Test 3: Prevent 5th member & PostgREST write revocation ---");
    let fifthRejected = false;
    try {
      await client.query(`SELECT public.join_focus_party($1, $2) AS res`, [partyId, u5]);
    } catch (err) {
      fifthRejected = err.message.includes("Party is full (maximum 4 members)") || err.message.includes("Unauthorized");
    }
    assert(fifthRejected, "5th member rejected by party capacity / authorization check");

    // Also verify direct SQL INSERT is blocked by trigger
    let directSqlBlocked = false;
    try {
      await client.query(
        `INSERT INTO public."FocusPartyMember" ("partyId", "userId") VALUES ($1, $2)`,
        [partyId, u5]
      );
    } catch (err) {
      directSqlBlocked = err.message.includes("Party is full (maximum 4 members)");
    }
    assert(directSqlBlocked, "Direct SQL insert of 5th member blocked by database trigger");

    // Verify PostgREST role 'authenticated' write revocation
    let authWriteBlocked = false;
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(`INSERT INTO public."FocusPartyMember" ("partyId", "userId") VALUES ($1, $2)`, [partyId, u5]);
    } catch (err) {
      authWriteBlocked = err.code === "42501" || err.message.includes("permission denied");
    } finally {
      await client.query("ROLLBACK");
    }
    assert(authWriteBlocked, "Direct PostgREST INSERT by 'authenticated' role is blocked with 42501 permission denied");

    // 4. Test 4: Create active session
    console.log("\n--- Test 4: Create active session ---");
    const enterRes1 = await client.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyId, u1]
    );
    const sessionData = enterRes1.rows[0].res;
    assert(sessionData.success === true, "enter_focus_session returns success");
    const sessionId = sessionData.sessionId;
    assert(sessionId > 0, "Active session ID created");
    assert(sessionData.timerState === "NOT_STARTED", "Initial timer state is NOT_STARTED");
    assert(sessionData.accumulatedSeconds === 0, "Initial accumulated seconds is 0");

    // 5. Test 5: Prevent duplicate active sessions
    console.log("\n--- Test 5: Prevent duplicate active sessions ---");
    let duplicateSessionBlocked = false;
    try {
      await client.query(
        `INSERT INTO public."FocusSession" ("partyId", "startedAt") VALUES ($1, now())`,
        [partyId]
      );
    } catch (err) {
      duplicateSessionBlocked = err.code === "23505" || err.message.includes("focus_session_single_active_per_party");
    }
    assert(duplicateSessionBlocked, "Duplicate active session for same party rejected by partial unique index");

    // 6. Test 6: Add multiple session members
    console.log("\n--- Test 6: Add multiple session members ---");
    const enterRes2 = await client.query(`SELECT public.enter_focus_session($1, $2) AS res`, [partyId, u2]);
    const enterRes3 = await client.query(`SELECT public.enter_focus_session($1, $2) AS res`, [partyId, u3]);
    assert(enterRes2.rows[0].res.sessionId === sessionId, "u2 joins session #1");
    assert(enterRes3.rows[0].res.sessionId === sessionId, "u3 joins session #1");

    const sessionMembersCount = await client.query(
      `SELECT count(*) FROM public."FocusSessionMember" WHERE "sessionId" = $1`,
      [sessionId]
    );
    assert(parseInt(sessionMembersCount.rows[0].count) === 3, "3 members in active focus session");

    // Verify u4 is in party but NOT in session (Membership Separation)
    const u4InSession = await client.query(
      `SELECT * FROM public."FocusSessionMember" WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u4]
    );
    assert(u4InSession.rowCount === 0, "u4 is in Party but NOT in Focus Session (concept separation verified)");

    // 7. Test 7: User starts own timer & DFA state machine
    console.log("\n--- Test 7: User starts own timer & DFA transitions ---");
    // Invalid transition: pause before starting
    let pauseNotStartedBlocked = false;
    try {
      await client.query(`SELECT public.pause_focus_timer($1, $2)`, [sessionId, u1]);
    } catch (err) {
      pauseNotStartedBlocked = err.message.includes("Cannot pause a timer that has not been started");
    }
    assert(pauseNotStartedBlocked, "DFA: pause_focus_timer on NOT_STARTED is rejected");

    // Invalid transition: resume before starting
    let resumeNotStartedBlocked = false;
    try {
      await client.query(`SELECT public.resume_focus_timer($1, $2)`, [sessionId, u1]);
    } catch (err) {
      resumeNotStartedBlocked = err.message.includes("Cannot resume a timer that has not been started");
    }
    assert(resumeNotStartedBlocked, "DFA: resume_focus_timer on NOT_STARTED is rejected");

    const startRes = await client.query(
      `SELECT public.start_focus_timer($1, $2) AS res`,
      [sessionId, u1]
    );
    assert(startRes.rows[0].res.timerState === "FOCUSING", "u1 timerState is FOCUSING");
    assert(startRes.rows[0].res.currentStartedAt !== null, "u1 currentStartedAt is set");

    // Idempotent start
    const startAgain = await client.query(`SELECT public.start_focus_timer($1, $2) AS res`, [sessionId, u1]);
    assert(startAgain.rows[0].res.timerState === "FOCUSING", "Idempotent start_focus_timer returns current state");

    // 8. Test 8: User pauses own timer
    console.log("\n--- Test 8: User pauses own timer ---");
    await new Promise((r) => setTimeout(r, 1100));
    const pauseRes = await client.query(
      `SELECT public.pause_focus_timer($1, $2) AS res`,
      [sessionId, u1]
    );
    assert(pauseRes.rows[0].res.timerState === "PAUSED", "u1 timerState is PAUSED");
    assert(pauseRes.rows[0].res.currentStartedAt === null, "u1 currentStartedAt is NULL after pause");
    assert(pauseRes.rows[0].res.accumulatedSeconds >= 1, `u1 accumulatedSeconds banked >= 1s (got ${pauseRes.rows[0].res.accumulatedSeconds}s)`);
    const bankedSeconds = pauseRes.rows[0].res.accumulatedSeconds;

    // Invalid transition: start while PAUSED
    let startPausedBlocked = false;
    try {
      await client.query(`SELECT public.start_focus_timer($1, $2)`, [sessionId, u1]);
    } catch (err) {
      startPausedBlocked = err.message.includes("Timer is currently paused. Use resume_focus_timer instead");
    }
    assert(startPausedBlocked, "DFA: start_focus_timer on PAUSED is rejected (must use resume)");

    // 9. Test 9: User resumes own timer
    console.log("\n--- Test 9: User resumes own timer ---");
    const resumeRes = await client.query(
      `SELECT public.resume_focus_timer($1, $2) AS res`,
      [sessionId, u1]
    );
    assert(resumeRes.rows[0].res.timerState === "FOCUSING", "u1 timerState resumed to FOCUSING");
    assert(resumeRes.rows[0].res.currentStartedAt !== null, "u1 currentStartedAt re-anchored");
    assert(resumeRes.rows[0].res.accumulatedSeconds === bankedSeconds, "Banked seconds preserved on resume");

    // 10. Test 10: User leaves Focus
    console.log("\n--- Test 10: User leaves Focus ---");
    await new Promise((r) => setTimeout(r, 1000));
    const leaveFocusRes = await client.query(
      `SELECT public.leave_focus_session($1, $2) AS res`,
      [sessionId, u1]
    );
    assert(leaveFocusRes.rows[0].res.success === true, "u1 successfully left focus session");
    assert(leaveFocusRes.rows[0].res.sessionEnded === false, "Session remains active because u2 and u3 are still participants");
    assert(leaveFocusRes.rows[0].res.accumulatedSeconds > bankedSeconds, "Additional interval banked on leaving");
    const totalAccumulatedBeforeRejoin = leaveFocusRes.rows[0].res.accumulatedSeconds;

    // Verify u1 is still in party!
    const u1PartyStill = await client.query(
      `SELECT * FROM public."FocusPartyMember" WHERE "partyId" = $1 AND "userId" = $2`,
      [partyId, u1]
    );
    assert(u1PartyStill.rowCount === 1, "u1 left Focus room but is STILL in Party");

    // 11. Test 11: User rejoins Focus with cumulative time preserved
    console.log("\n--- Test 11: User rejoins Focus with cumulative time preserved ---");
    const rejoinRes = await client.query(
      `SELECT public.enter_focus_session($1, $2) AS res`,
      [partyId, u1]
    );
    assert(rejoinRes.rows[0].res.sessionId === sessionId, "u1 rejoins the SAME active session");
    assert(rejoinRes.rows[0].res.timerState === "PAUSED", "u1 timerState resumed as PAUSED");
    assert(rejoinRes.rows[0].res.accumulatedSeconds === totalAccumulatedBeforeRejoin, `Cumulative seconds preserved! Expected ${totalAccumulatedBeforeRejoin}, got ${rejoinRes.rows[0].res.accumulatedSeconds}`);

    // Verify no duplicate row was created
    const u1RowsInSession = await client.query(
      `SELECT count(*) FROM public."FocusSessionMember" WHERE "sessionId" = $1 AND "userId" = $2`,
      [sessionId, u1]
    );
    assert(parseInt(u1RowsInSession.rows[0].count) === 1, "Exactly ONE logical session membership row for u1 (no duplicate rows)");

    // 12. Test 12: Another member cannot modify user timer & PostgREST direct write prevention
    console.log("\n--- Test 12: Another member cannot modify user timer & PostgREST write tampering ---");
    let unauthorizedTimerBlocked = false;
    await client.query("BEGIN");
    try {
      await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${u2}"}'`);
      await client.query(`SELECT public.start_focus_timer($1, $2)`, [sessionId, u1]);
    } catch (err) {
      unauthorizedTimerBlocked = err.message.includes("S2 identity guard") || err.code === "42501";
    } finally {
      await client.query("ROLLBACK");
    }
    assert(unauthorizedTimerBlocked, "Calling start_focus_timer on behalf of another user is rejected with 42501 S2 identity guard");

    // Test direct PostgREST table write tampering (accumulatedSeconds = 999999)
    let postgrestTamperBlocked = false;
    await client.query("BEGIN");
    try {
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(`SET LOCAL request.jwt.claim.sub = '${u1}'`);
      await client.query(
        `UPDATE public."FocusSessionMember" SET "accumulatedSeconds" = 999999 WHERE "sessionId" = $1 AND "userId" = $2`,
        [sessionId, u1]
      );
    } catch (err) {
      postgrestTamperBlocked = err.code === "42501" || err.message.includes("permission denied");
    } finally {
      await client.query("ROLLBACK");
    }
    assert(postgrestTamperBlocked, "Direct PostgREST UPDATE of accumulatedSeconds = 999999 is blocked with 42501 permission denied");

    // 13. Test 13: Non-members cannot access party/session
    console.log("\n--- Test 13: Non-members cannot access party/session ---");
    let nonMemberBlocked = false;
    try {
      await client.query(`SELECT public.enter_focus_session($1, $2)`, [partyId, u5]);
    } catch (err) {
      nonMemberBlocked = err.message.includes("is not a member of party");
    }
    assert(nonMemberBlocked, "Non-member u5 rejected from entering focus session");

    // Also test direct SQL insert of non-member into FocusSessionMember
    let directSessionBypassBlocked = false;
    try {
      await client.query(
        `INSERT INTO public."FocusSessionMember" ("sessionId", "userId") VALUES ($1, $2)`,
        [sessionId, u5]
      );
    } catch (err) {
      directSessionBypassBlocked = err.message.includes("User must be a member of the party to join its focus session");
    }
    assert(directSessionBypassBlocked, "Direct insert into FocusSessionMember for non-party user blocked by database trigger");

    // 14. Test 14: Leader-only actions are protected
    console.log("\n--- Test 14: Leader-only actions protected ---");
    let nonLeaderRemoveBlocked = false;
    try {
      // u2 tries to remove u3
      await client.query(
        `SELECT public.remove_focus_party_member($1, $2, $3)`,
        [partyId, u2, u3]
      );
    } catch (err) {
      nonLeaderRemoveBlocked = err.message.includes("Only the party leader can remove members");
    }
    assert(nonLeaderRemoveBlocked, "Non-leader u2 prevented from removing member u3");

    // 15. Test 15: Leader leaves and leadership transfers correctly
    console.log("\n--- Test 15: Leader leaves and leadership transfers correctly ---");
    // Current leader is u1. Members: u1, u2, u3, u4 (joined in order u1, u2, u3, u4).
    const leavePartyRes = await client.query(
      `SELECT public.leave_focus_party($1, $2) AS res`,
      [partyId, u1]
    );
    assert(leavePartyRes.rows[0].res.transferred === true, "Leadership transferred flag is true");
    assert(leavePartyRes.rows[0].res.leaderId === u2, "Leadership transferred to u2 (oldest joined remaining member)");

    const partyAfterLeave = await client.query(`SELECT "leaderId" FROM public."FocusParty" WHERE id = $1`, [partyId]);
    assert(partyAfterLeave.rows[0].leaderId === u2, "Database record reflects u2 as new leader");

    // 16. Test 16: Final participant leaves, session closes, and ended delete guard protects history
    console.log("\n--- Test 16: Final participant leaves & ended session protection ---");
    // Currently in session: u2, u3. (u1 already left session when leaving party).
    const leaveU2 = await client.query(`SELECT public.leave_focus_session($1, $2) AS res`, [sessionId, u2]);
    assert(leaveU2.rows[0].res.sessionEnded === false, "Session still active after u2 leaves (u3 still in room)");

    const leaveU3 = await client.query(`SELECT public.leave_focus_session($1, $2) AS res`, [sessionId, u3]);
    assert(leaveU3.rows[0].res.sessionEnded === true, "Session ends when u3 (the last participant) leaves");

    const sessionEndedCheck = await client.query(`SELECT "endedAt" FROM public."FocusSession" WHERE id = $1`, [sessionId]);
    assert(sessionEndedCheck.rows[0].endedAt !== null, "FocusSession.endedAt is populated with timestamp");

    // Verify modifying ended session is blocked by trigger
    let modifyEndedBlocked = false;
    try {
      await client.query(
        `UPDATE public."FocusSessionMember" SET "timerState" = 'FOCUSING' WHERE "sessionId" = $1 AND "userId" = $2`,
        [sessionId, u2]
      );
    } catch (err) {
      modifyEndedBlocked = err.message.includes("Cannot modify timer state for an ended focus session");
    }
    assert(modifyEndedBlocked, "Modifying timer state on an ended session is blocked by database trigger");

    // Verify deleting member record from ended session is blocked by delete guard trigger
    let deleteEndedMemberBlocked = false;
    try {
      await client.query(
        `DELETE FROM public."FocusSessionMember" WHERE "sessionId" = $1 AND "userId" = $2`,
        [sessionId, u2]
      );
    } catch (err) {
      deleteEndedMemberBlocked = err.message.includes("Cannot delete participant records from an ended focus session");
    }
    assert(deleteEndedMemberBlocked, "Deleting participant records from ended session blocked by delete guard trigger");

    // 17. Test 17: New Focus after previous session ends creates a new session
    console.log("\n--- Test 17: New Focus after previous session ends creates a new session ---");
    const newSessionRes = await client.query(`SELECT public.enter_focus_session($1, $2) AS res`, [partyId, u2]);
    const newSessionId = newSessionRes.rows[0].res.sessionId;
    assert(newSessionId !== sessionId, `New session created with ID ${newSessionId} (different from ended session ${sessionId})`);

    const activeSessions = await client.query(
      `SELECT count(*) FROM public."FocusSession" WHERE "partyId" = $1 AND "endedAt" IS NULL`,
      [partyId]
    );
    assert(parseInt(activeSessions.rows[0].count) === 1, "Exactly 1 active session for party");

    const totalSessions = await client.query(
      `SELECT count(*) FROM public."FocusSession" WHERE "partyId" = $1`,
      [partyId]
    );
    assert(parseInt(totalSessions.rows[0].count) === 2, "Historical session preserved (total 2 sessions for party)");

    // Cleanly close the new session
    await client.query(`SELECT public.leave_focus_session($1, $2)`, [newSessionId, u2]);

    // 18. Test 18: Disbanding party preserves historical records
    console.log("\n--- Test 18: Disbanding party preserves historical records ---");
    // Members remaining in party: u2, u3, u4. Remove u3 and u4, then u2 leaves.
    await client.query(`SELECT public.leave_focus_party($1, $2)`, [partyId, u3]);
    await client.query(`SELECT public.leave_focus_party($1, $2)`, [partyId, u4]);
    const lastLeave = await client.query(`SELECT public.leave_focus_party($1, $2) AS res`, [partyId, u2]);
    assert(lastLeave.rows[0].res.partyDisbanded === true, "Last member leaving marks party disbanded");

    const disbandedParty = await client.query(`SELECT "disbandedAt" FROM public."FocusParty" WHERE id = $1`, [partyId]);
    assert(disbandedParty.rows[0].disbandedAt !== null, "Party is marked disbanded (disbandedAt populated), NOT hard-deleted");

    const historicalSessionsCount = await client.query(`SELECT count(*) FROM public."FocusSession" WHERE "partyId" = $1`, [partyId]);
    assert(parseInt(historicalSessionsCount.rows[0].count) === 2, "All historical FocusSession records remain permanently intact in database");

    // Cannot enter session on disbanded party
    let enterDisbandedBlocked = false;
    try {
      await client.query(`SELECT public.enter_focus_session($1, $2)`, [partyId, u2]);
    } catch (err) {
      enterDisbandedBlocked = err.message.includes("Cannot enter session of a disbanded party") || err.message.includes("is not a member");
    }
    assert(enterDisbandedBlocked, "Entering session on a disbanded party is rejected");

    // 19. Test 19: Concurrency safety (simultaneous session entrants)
    console.log("\n--- Test 19: Concurrency safety (simultaneous session entrants) ---");
    // Create a new fresh party for concurrent test
    const partyResConcurrent = await client.query(
      `SELECT public.create_focus_party($1, 'Concurrent Party') AS res`,
      [u2]
    );
    const concurrentPartyId = partyResConcurrent.rows[0].res.partyId;
    testPartyIds.push(concurrentPartyId);

    // Invite u3 and join
    await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $3, 'PENDING')`,
      [u2, u3, concurrentPartyId]
    );
    await client.query(`SELECT public.join_focus_party($1, $2)`, [concurrentPartyId, u3]);

    // Now u2 and u3 enter Focus SIMULTANEOUSLY on separate client connections
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      const [resA, resB] = await Promise.all([
        clientA.query(`SELECT public.enter_focus_session($1, $2) AS res`, [concurrentPartyId, u2]),
        clientB.query(`SELECT public.enter_focus_session($1, $2) AS res`, [concurrentPartyId, u3]),
      ]);

      const sidA = resA.rows[0].res.sessionId;
      const sidB = resB.rows[0].res.sessionId;

      assert(sidA === sidB, `Simultaneous entrants resolved to identical session ID ${sidA} (no duplicate session created)`);

      const concActiveCount = await client.query(
        `SELECT count(*) FROM public."FocusSession" WHERE "partyId" = $1 AND "endedAt" IS NULL`,
        [concurrentPartyId]
      );
      assert(parseInt(concActiveCount.rows[0].count) === 1, "Exactly 1 active session in concurrent test");
    } finally {
      clientA.release();
      clientB.release();
    }

    // 20. Test 20: Party Invites via SessionInvite
    console.log("\n--- Test 20: Party Invites via SessionInvite ---");
    const inviteRes = await client.query(
      `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id`,
      [u2, u5, concurrentPartyId]
    );
    const inviteId = inviteRes.rows[0].id;
    assert(inviteId > 0, "SessionInvite created with partyId");

    // Duplicate pending invite should be blocked by partial unique index
    let dupInviteBlocked = false;
    try {
      await client.query(
        `INSERT INTO public."SessionInvite" ("senderId", "receiverId", "partyId", "status")
         VALUES ($1, $2, $3, 'PENDING')`,
        [u2, u5, concurrentPartyId]
      );
    } catch (err) {
      dupInviteBlocked = err.code === "23505";
    }
    assert(dupInviteBlocked, "Duplicate pending party invite blocked by unique index");

    // u5 accepts invite by joining party
    await client.query(`SELECT public.join_focus_party($1, $2)`, [concurrentPartyId, u5]);
    const updatedInvite = await client.query(`SELECT "status" FROM public."SessionInvite" WHERE id = $1`, [inviteId]);
    assert(updatedInvite.rows[0].status === "ACCEPTED", "Invite automatically set to ACCEPTED upon joining");

    // 21. Test 21: get_focus_party_state & Non-Member Privacy Protection
    console.log("\n--- Test 21: get_focus_party_state & Non-Member Privacy Protection ---");
    // u1 is not in concurrentPartyId
    let nonMemberStateBlocked = false;
    try {
      await client.query(`SELECT public.get_focus_party_state($1, $2)`, [concurrentPartyId, u1]);
    } catch (err) {
      nonMemberStateBlocked = err.message.includes("User does not belong to party") || err.code === "42501";
    }
    assert(nonMemberStateBlocked, "Non-member u1 blocked from querying get_focus_party_state with 42501");

    const stateRes = await client.query(`SELECT public.get_focus_party_state($1, $2) AS res`, [concurrentPartyId, u2]);
    const fullState = stateRes.rows[0].res;
    assert(fullState.party.id === concurrentPartyId, "State contains party metadata");
    assert(fullState.members.length === 3, "State lists 3 members (u2, u3, u5)");
    assert(fullState.activeSession !== null, "State includes active session with collective time");

  } finally {
    // Cleanup test data
    console.log("\n--- Cleaning up test artifacts ---");
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = 'replica'");
      if (testPartyIds.length > 0) {
        await client.query(`DELETE FROM public."FocusParty" WHERE id = ANY($1)`, [testPartyIds]);
      }
      if (testUserIds.length > 0) {
        await client.query(`DELETE FROM public."User" WHERE id = ANY($1)`, [testUserIds]);
      }
      await client.query("COMMIT");
      console.log("Cleanup complete.");
    } catch (cleanupErr) {
      await client.query("ROLLBACK");
      console.warn("Cleanup warning:", cleanupErr.message);
    }
    client.release();
  }

  console.log("\n==================================================");
  console.log(`🎉 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN VERIFICATION:", err);
  process.exit(1);
}).finally(() => pool.end());
