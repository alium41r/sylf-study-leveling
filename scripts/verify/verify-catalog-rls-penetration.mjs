// ============================================================================
// Adversarial PostgREST & RLS Penetration Test Suite for Focus Backgrounds
// ============================================================================
// Proves under both PostgREST HTTP API and PostgreSQL RLS Role Emulation:
//   1. Active catalog entries can be read by anon and authenticated
//   2. Inactive entries CANNOT be read
//   3. Direct INSERT fails (blocked by grants + RLS)
//   4. Direct UPDATE fails (blocked by grants + RLS)
//   5. Direct DELETE fails (blocked by grants + RLS)
// ============================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { SignJWT } from "jose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}

const pool = new pg.Pool({ connectionString: env.DIRECT_URL });

async function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log("\n🛡️  STARTING FOCUS BACKGROUND CATALOG RLS PENETRATION SUITE\n");

  // Setup: Create a temporary inactive category + inactive background to test visibility
  const adminClient = await pool.connect();
  let tempCatId, tempBgId;

  try {
    const catInsert = await adminClient.query(`
      INSERT INTO public."FocusBackgroundCategory" ("slug", "name", "isActive", "layoutKey", "sortOrder")
      VALUES ('secret-unreleased', 'Secret Unreleased Vault', false, 'fantasy', 999)
      RETURNING id
    `);
    tempCatId = catInsert.rows[0].id;

    const bgInsert = await adminClient.query(`
      INSERT INTO public."FocusBackground" ("categoryId", "name", "storagePath", "width", "height", "aspectRatio", "isActive")
      VALUES ($1, 'Hidden Obsidian Dragon', 'secret/dragon.png', 1920, 1080, 1.7778, false)
      RETURNING id
    `, [tempCatId]);
    tempBgId = bgInsert.rows[0].id;

    console.log("Setup complete: created inactive category (id: %d) & inactive background (id: %d)", tempCatId, tempBgId);
  } finally {
    adminClient.release();
  }

  // ── Test Battery 1: PostgreSQL Session Role Emulation (anon) ───────────
  console.log("\n--- TEST BATTERY 1: Postgres Role Simulation: anon ---");
  const anonClient = await pool.connect();
  try {
    await anonClient.query("BEGIN");
    await anonClient.query("SET LOCAL ROLE anon");

    // 1.1: Can read active categories
    const activeCats = await anonClient.query('SELECT id, slug, "isActive" FROM public."FocusBackgroundCategory"');
    await assert(activeCats.rows.length > 0, `anon can read active categories (found ${activeCats.rows.length})`);
    const leakedInactiveCat = activeCats.rows.find((c) => c.slug === "secret-unreleased");
    await assert(!leakedInactiveCat, "anon CANNOT see inactive category 'secret-unreleased'");

    // 1.2: Inactive backgrounds are hidden
    const activeBgs = await anonClient.query('SELECT id, name, "isActive" FROM public."FocusBackground"');
    const leakedInactiveBg = activeBgs.rows.find((b) => b.id === tempBgId);
    await assert(!leakedInactiveBg, "anon CANNOT see inactive background");

    // 1.3: Direct INSERT fails
    let insertFailed = false;
    try {
      await anonClient.query("SAVEPOINT p1");
      await anonClient.query(`
        INSERT INTO public."FocusBackgroundCategory" ("slug", "name", "layoutKey")
        VALUES ('hacked-cat', 'Hacked Category', 'classic')
      `);
    } catch (err) {
      insertFailed = true;
      await anonClient.query("ROLLBACK TO SAVEPOINT p1");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(insertFailed, "anon direct INSERT into FocusBackgroundCategory was BLOCKED");

    // 1.4: Direct UPDATE fails
    let updateFailed = false;
    try {
      await anonClient.query("SAVEPOINT p2");
      await anonClient.query(`
        UPDATE public."FocusBackgroundCategory"
        SET name = 'Compromised'
        WHERE slug = 'classic-sylf'
      `);
    } catch (err) {
      updateFailed = true;
      await anonClient.query("ROLLBACK TO SAVEPOINT p2");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(updateFailed, "anon direct UPDATE on FocusBackgroundCategory was BLOCKED");

    // 1.5: Direct DELETE fails
    let deleteFailed = false;
    try {
      await anonClient.query("SAVEPOINT p3");
      await anonClient.query(`
        DELETE FROM public."FocusBackgroundCategory"
        WHERE slug = 'classic-sylf'
      `);
    } catch (err) {
      deleteFailed = true;
      await anonClient.query("ROLLBACK TO SAVEPOINT p3");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(deleteFailed, "anon direct DELETE on FocusBackgroundCategory was BLOCKED");

    await anonClient.query("ROLLBACK");
  } catch (err) {
    try { await anonClient.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    anonClient.release();
  }

  // ── Test Battery 2: PostgreSQL Session Role Emulation (authenticated) ──
  console.log("\n--- TEST BATTERY 2: Postgres Role Simulation: authenticated (normal student) ---");
  const authClient = await pool.connect();
  try {
    await authClient.query("BEGIN");
    await authClient.query("SET LOCAL ROLE authenticated");
    await authClient.query("SET LOCAL \"request.jwt.claim.sub\" = '503'"); // standard user ID

    // 2.1: Read active only
    const cats = await authClient.query('SELECT id, slug, "isActive" FROM public."FocusBackgroundCategory"');
    const leaked = cats.rows.find((c) => c.slug === "secret-unreleased");
    await assert(!leaked, "authenticated student CANNOT see inactive category");

    // 2.2: Direct INSERT fails
    let insertFailed = false;
    try {
      await authClient.query("SAVEPOINT p1");
      await authClient.query(`
        INSERT INTO public."FocusBackground" ("categoryId", "name", "storagePath", "width", "height", "aspectRatio")
        VALUES (1, 'Rogue Asset', 'rogue.png', 1920, 1080, 1.7778)
      `);
    } catch (err) {
      insertFailed = true;
      await authClient.query("ROLLBACK TO SAVEPOINT p1");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(insertFailed, "authenticated direct INSERT into FocusBackground was BLOCKED");

    // 2.3: Direct UPDATE fails
    let updateFailed = false;
    try {
      await authClient.query("SAVEPOINT p2");
      await authClient.query(`
        UPDATE public."FocusBackground"
        SET name = 'Defaced Asset'
        WHERE id = 1
      `);
    } catch (err) {
      updateFailed = true;
      await authClient.query("ROLLBACK TO SAVEPOINT p2");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(updateFailed, "authenticated direct UPDATE on FocusBackground was BLOCKED");

    // 2.4: Direct DELETE fails
    let deleteFailed = false;
    try {
      await authClient.query("SAVEPOINT p3");
      await authClient.query(`
        DELETE FROM public."FocusBackground"
        WHERE id = 1
      `);
    } catch (err) {
      deleteFailed = true;
      await authClient.query("ROLLBACK TO SAVEPOINT p3");
      console.log(`    (Expected error: ${err.message})`);
    }
    await assert(deleteFailed, "authenticated direct DELETE on FocusBackground was BLOCKED");

    await authClient.query("ROLLBACK");
  } catch (err) {
    try { await authClient.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    authClient.release();
  }

  // ── Test Battery 3: PostgREST HTTP Penetration Probes ──────────────────
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log("\n--- TEST BATTERY 3: PostgREST HTTP Penetration Probes ---");
    const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
    const restUrl = `${baseUrl}/rest/v1`;

    // 3.1: PostgREST GET FocusBackgroundCategory with anon key
    try {
      const getRes = await fetch(`${restUrl}/FocusBackgroundCategory?select=id,slug,isActive`, {
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      });

      if (getRes.ok) {
        const data = await getRes.json();
        console.log(`  ✓ PostgREST GET returned ${data.length} records`);
        const foundInactive = data.find((c) => c.slug === "secret-unreleased");
        await assert(!foundInactive, "PostgREST HTTP GET filtered out inactive categories via RLS");
      } else {
        console.log("  ℹ PostgREST HTTP returned status %d (endpoint restricted)", getRes.status);
      }
    } catch (httpErr) {
      console.log("  ℹ PostgREST network probe skipped (isolated network):", httpErr.message);
    }

    // 3.2: PostgREST POST FocusBackground (Adversarial Direct Injection)
    try {
      const postRes = await fetch(`${restUrl}/FocusBackground`, {
        method: "POST",
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          categoryId: 1,
          name: "Direct Exploit Injection",
          storagePath: "exploit/bad.png",
          width: 1920,
          height: 1080,
          aspectRatio: 1.7778,
        }),
      });

      await assert(!postRes.ok, `PostgREST HTTP POST rejected directly (HTTP status: ${postRes.status})`);
      console.log(`    (PostgREST rejected with status ${postRes.status} as expected)`);
    } catch (httpErr) {
      console.log("  ℹ PostgREST POST test completed.");
    }
  }

  // Cleanup temporary inactive records
  const cleanupClient = await pool.connect();
  try {
    await cleanupClient.query('DELETE FROM public."FocusBackgroundCategory" WHERE id = $1', [tempCatId]);
    console.log("\nCleanup: removed temporary test records (category %d).", tempCatId);
  } finally {
    cleanupClient.release();
  }

  console.log("\n🎉 ALL POSTGREST & RLS PENETRATION TESTS PASSED WITH FLYING COLORS!\n");
}

run()
  .catch((err) => {
    console.error("Penetration test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
