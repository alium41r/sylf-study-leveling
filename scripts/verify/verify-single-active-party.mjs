// ============================================================================
// Single Active Party Per User — Concurrency & Invariant Verification Suite
// ============================================================================
// Verifies:
//   1. Sequential enforcement: A user with an active party cannot create or
//      join a second active party.
//   2. Concurrency safety: Simultaneous create/join operations for the SAME user
//      serialize on the user's User row lock, ensuring EXACTLY ONE succeeds.
//   3. Disbanded party allowance: Unlimited historical memberships in disbanded
//      parties are permitted once the user leaves or the party disbands.
//   4. Direct trigger enforcement: Raw INSERT into FocusPartyMember is blocked
//      by trg_check_user_single_active_party even if RPC is bypassed.
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

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("==================================================");
  console.log("🔒 VERIFYING SINGLE ACTIVE PARTY PER USER INVARIANT");
  console.log("==================================================");

  // 1. Create unique test users
  const ts = Date.now();
  const userRes = await pool.query(`
    INSERT INTO public."User" (name, email, password, username)
    VALUES 
      ('SinglePartyU1_${ts}', 'single_u1_${ts}@test.local', 'hash', 'single_u1_${ts}'),
      ('SinglePartyU2_${ts}', 'single_u2_${ts}@test.local', 'hash', 'single_u2_${ts}'),
      ('SinglePartyU3_${ts}', 'single_u3_${ts}@test.local', 'hash', 'single_u3_${ts}')
    RETURNING id, username;
  `);
  const [u1, u2, u3] = userRes.rows.map(r => r.id);
  console.log(`Created test users: u1=${u1}, u2=${u2}, u3=${u3}`);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: User 1 creates an active party
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 1: Initial Party Creation ---");
  const p1Res = await pool.query(`SELECT public.create_focus_party($1, 'Party One') AS res;`, [u1]);
  const p1 = p1Res.rows[0].res.partyId;
  assert(p1 > 0, `u1 created Party 1 (ID: ${p1})`);

  // Verify active party count for u1
  const count1 = await pool.query(`
    SELECT count(*) FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = $1 AND fp."disbandedAt" IS NULL;
  `, [u1]);
  assert(parseInt(count1.rows[0].count) === 1, `u1 has exactly 1 active party membership`);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Sequential rejection of second party creation by u1
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 2: Sequential create_focus_party Rejection ---");
  let err2 = null;
  try {
    await pool.query(`SELECT public.create_focus_party($1, 'Party Two') AS res;`, [u1]);
  } catch (err) {
    err2 = err.message;
  }
  assert(
    err2 && err2.includes("User already belongs to an active Focus Party"),
    `Second party creation blocked: ${err2}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Sequential rejection of join_focus_party by u1
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 3: Sequential join_focus_party Rejection ---");
  // u2 creates Party 2
  const p2Res = await pool.query(`SELECT public.create_focus_party($1, 'Party Two') AS res;`, [u2]);
  const p2 = p2Res.rows[0].res.partyId;
  assert(p2 > 0, `u2 created Party 2 (ID: ${p2})`);

  // u2 invites u1 to Party 2
  await pool.query(`
    INSERT INTO public."SessionInvite" ("partyId", "senderId", "receiverId", "status", "createdAt")
    VALUES ($1, $2, $3, 'PENDING', NOW());
  `, [p2, u2, u1]);

  let err3 = null;
  try {
    await pool.query(`SELECT public.join_focus_party($1, $2) AS res;`, [p2, u1]);
  } catch (err) {
    err3 = err.message;
  }
  assert(
    err3 && err3.includes("User already belongs to an active Focus Party"),
    `Joining second active party blocked: ${err3}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Direct trigger enforcement (bypassing RPC)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 4: Direct Trigger Enforcement on INSERT ---");
  let err4 = null;
  try {
    await pool.query(`
      INSERT INTO public."FocusPartyMember" ("partyId", "userId", "joinedAt")
      VALUES ($1, $2, NOW());
    `, [p2, u1]);
  } catch (err) {
    err4 = err.message;
  }
  assert(
    err4 && err4.includes("User already belongs to an active Focus Party"),
    `Direct SQL insert blocked by trg_check_user_single_active_party: ${err4}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: Concurrency Safe Race Condition Test for u3
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 5: Concurrent Race Condition Defense ---");
  // u3 currently has 0 parties.
  // We send invites to u3 for Party 1 (from u1) and Party 2 (from u2).
  await pool.query(`
    INSERT INTO public."SessionInvite" ("partyId", "senderId", "receiverId", "status", "createdAt")
    VALUES 
      ($1, $2, $3, 'PENDING', NOW()),
      ($4, $5, $3, 'PENDING', NOW());
  `, [p1, u1, u3, p2, u2]);

  // Launch 3 simultaneous operations on 3 separate pool connections for u3:
  // - Client A: join Party 1
  // - Client B: join Party 2
  // - Client C: create Party 3
  const [clientA, clientB, clientC] = await Promise.all([
    pool.connect(),
    pool.connect(),
    pool.connect(),
  ]);

  const results = await Promise.allSettled([
    clientA.query(`SELECT public.join_focus_party($1, $2) AS res;`, [p1, u3]),
    clientB.query(`SELECT public.join_focus_party($1, $2) AS res;`, [p2, u3]),
    clientC.query(`SELECT public.create_focus_party($1, 'Party Three') AS res;`, [u3]),
  ]);

  clientA.release();
  clientB.release();
  clientC.release();

  const fulfilled = results.filter(r => r.status === "fulfilled");
  const rejected = results.filter(r => r.status === "rejected");

  console.log(`Concurrent results: ${fulfilled.length} fulfilled, ${rejected.length} rejected`);
  for (const r of rejected) {
    console.log(`  Rejected reason: ${r.reason.message}`);
    assert(
      r.reason.message.includes("User already belongs to an active Focus Party"),
      `Rejection reason matches expected invariant`
    );
  }

  assert(fulfilled.length === 1, `EXACTLY 1 concurrent operation succeeded (got ${fulfilled.length})`);
  assert(rejected.length === 2, `EXACTLY 2 concurrent operations were blocked by row lock serialization`);

  // Verify in database: u3 has EXACTLY 1 active party membership
  const count3 = await pool.query(`
    SELECT count(*) FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = $1 AND fp."disbandedAt" IS NULL;
  `, [u3]);
  assert(parseInt(count3.rows[0].count) === 1, `u3 database state has EXACTLY 1 active party membership`);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: Historical / Disbanded Party Allowance
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- Test 6: Disbanded Party Historical Membership ---");
  // u3 leaves Party 1 (u3 was the second member)
  await pool.query(`SELECT public.leave_focus_party($1, $2) AS res;`, [p1, u3]);

  // Now u1 is the last member. u1 leaves Party 1, causing Party 1 to be marked disbanded.
  const leaveRes = await pool.query(`SELECT public.leave_focus_party($1, $2) AS res;`, [p1, u1]);
  assert(leaveRes.rows[0].res.partyDisbanded === true, `Party 1 was disbanded on last member departure`);

  // Verify Party 1 has disbandedAt set
  const p1Disbanded = await pool.query(`SELECT "disbandedAt" FROM public."FocusParty" WHERE id = $1;`, [p1]);
  assert(p1Disbanded.rows[0].disbandedAt !== null, `Party 1 is recorded with disbandedAt timestamp`);

  // Verify u1 currently has 0 active memberships
  const countZero = await pool.query(`
    SELECT count(*) FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = $1 AND fp."disbandedAt" IS NULL;
  `, [u1]);
  assert(parseInt(countZero.rows[0].count) === 0, `u1 has 0 active party memberships`);

  // Insert a historical membership row in disbanded Party 1 for u1
  await pool.query(`
    INSERT INTO public."FocusPartyMember" ("partyId", "userId", "joinedAt")
    VALUES ($1, $2, NOW());
  `, [p1, u1]);
  console.log(`Historical membership in disbanded Party 1 inserted for u1`);

  // Prove u1 can still create a new active party despite having a membership in a disbanded party
  const p4Res = await pool.query(`SELECT public.create_focus_party($1, 'Party Four') AS res;`, [u1]);
  const p4 = p4Res.rows[0].res.partyId;
  assert(p4 > 0, `u1 successfully created Party 4 while having historical membership in disbanded party (ID: ${p4})`);

  // Verify u1 has exactly 1 active party
  const activeCountU1 = await pool.query(`
    SELECT count(*) FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = $1 AND fp."disbandedAt" IS NULL;
  `, [u1]);
  assert(parseInt(activeCountU1.rows[0].count) === 1, `u1 has exactly 1 ACTIVE party`);

  // Verify total memberships for u1 in FocusPartyMember is 2 (1 active + 1 disbanded)
  const totalCountU1 = await pool.query(`
    SELECT count(*) FROM public."FocusPartyMember" fpm
    WHERE fpm."userId" = $1;
  `, [u1]);
  assert(parseInt(totalCountU1.rows[0].count) === 2, `u1 has 2 total memberships (1 historical disbanded + 1 active)`);

  console.log("\n==================================================");
  console.log("🎉 ALL SINGLE ACTIVE PARTY INVARIANTS VERIFIED!");
  console.log("==================================================");
}

run()
  .catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
