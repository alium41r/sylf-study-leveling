// ============================================================================
// Real Supabase Storage API Penetration Test (Phase 5A Security Gate)
// ============================================================================
// Directly tests the live Supabase Storage API endpoints as:
//   1. Anonymous client (no token)
//   2. Normal authenticated user A (JWT for user 100)
//   3. Malicious authenticated user B (JWT for user 999)
//   4. Authorized Next.js server layer (service role with path checks)
// ============================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
  if (m) env[m[1]] = m[2];
}
Object.assign(process.env, env);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = env.SUPABASE_JWT_SECRET;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !JWT_SECRET) {
  console.error("Missing required environment variables for storage penetration test.");
  process.exit(1);
}

const BUCKET = "focus-backgrounds-user";
const secretBytes = new TextEncoder().encode(JWT_SECRET);

async function mintUserToken(userId, email) {
  return await new SignJWT({
    role: "authenticated",
    sub: String(userId),
    userId: userId,
    email: email,
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretBytes);
}

async function mintServiceToken() {
  if (SERVICE_ROLE_KEY) return SERVICE_ROLE_KEY;
  return await new SignJWT({
    role: "service_role",
    iss: "supabase",
    sub: "service_role",
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secretBytes);
}

async function runPenetrationSuite() {
  console.log("==================================================================");
  console.log(" SUPABASE STORAGE API PENETRATION SUITE — BUCKET: " + BUCKET);
  console.log("==================================================================\n");

  const userAToken = await mintUserToken(100, "userA@sylf.test");
  const userBToken = await mintUserToken(999, "victimB@sylf.test");
  const serviceToken = await mintServiceToken();

  // 1. Clients
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const userAClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${userAToken}` } },
  });

  const serviceClient = createClient(SUPABASE_URL, serviceToken, {
    auth: { persistSession: false },
  });

  const dummyImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  let passed = 0;
  let total = 0;

  function assertTest(condition, name, details = "") {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} — ${details}`);
    }
  }

  // Pre-test: Server provisions an object for Victim B (999) to target in penetration attacks
  const targetPath = "999/pentest-canary.png";
  console.log("1. Setup canary target in private bucket via server client...");
  const { error: setupErr } = await serviceClient.storage
    .from(BUCKET)
    .upload(targetPath, dummyImage, { contentType: "image/png", upsert: true });
  if (setupErr) {
    console.error("Failed to upload canary object with service role:", setupErr);
    process.exit(1);
  }
  console.log("   Canary object active at: " + targetPath + "\n");

  // ────────────────────────────────────────────────────────────────────────────
  // ATTACK SECTION 1: ANONYMOUS ADVERSARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log("2. Testing Anonymous Adversary Attacks:");

  // Test 1: Anon list objects
  const { data: anonList, error: anonListErr } = await anonClient.storage
    .from(BUCKET)
    .list("999");
  assertTest(
    !anonList || anonList.length === 0 || !!anonListErr,
    "Anon cannot list victim's folder",
    anonListErr?.message || `Got ${anonList?.length} items`
  );

  // Test 2: Anon direct GET/download
  const { data: anonDownload, error: anonDownErr } = await anonClient.storage
    .from(BUCKET)
    .download(targetPath);
  assertTest(
    !anonDownload || !!anonDownErr,
    "Anon direct download is blocked",
    anonDownErr?.message || "Download succeeded unexpectedly"
  );

  // Test 3: Anon direct upload
  const { error: anonUploadErr } = await anonClient.storage
    .from(BUCKET)
    .upload("anon/exploit.png", dummyImage);
  assertTest(
    !!anonUploadErr,
    "Anon direct upload is blocked",
    anonUploadErr ? anonUploadErr.message : "Upload succeeded unexpectedly"
  );

  // Test 4: Anon direct delete
  const { data: anonDel, error: anonDelErr } = await anonClient.storage
    .from(BUCKET)
    .remove([targetPath]);
  assertTest(
    !anonDel || anonDel.length === 0 || !!anonDelErr,
    "Anon direct delete of victim object is blocked",
    anonDelErr?.message || "Delete succeeded unexpectedly"
  );

  // ────────────────────────────────────────────────────────────────────────────
  // ATTACK SECTION 2: NORMAL AUTHENTICATED USER ATTACKING VICTIM
  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n3. Testing Cross-User Authenticated Adversary Attacks (User A vs Victim B):");

  // Test 5: User A attempts to list Victim B's folder
  const { data: userAList, error: userAListErr } = await userAClient.storage
    .from(BUCKET)
    .list("999");
  assertTest(
    !userAList || userAList.length === 0 || !!userAListErr,
    "User A cannot list Victim B's folder",
    userAListErr?.message || `Got ${userAList?.length} items`
  );

  // Test 6: User A attempts direct download of Victim B's canary
  const { data: userADown, error: userADownErr } = await userAClient.storage
    .from(BUCKET)
    .download(targetPath);
  assertTest(
    !userADown || !!userADownErr,
    "User A direct download of Victim B's private object is blocked",
    userADownErr?.message || "Download succeeded unexpectedly"
  );

  // Test 7: User A attempts direct upload to own folder (bypass Next.js server)
  // MUST be blocked because all mutations must go through the Next.js API server!
  const { error: userAUploadOwnErr } = await userAClient.storage
    .from(BUCKET)
    .upload("100/direct-bypass.png", dummyImage);
  assertTest(
    !!userAUploadOwnErr,
    "User A direct upload to own folder is blocked (must use API server)",
    userAUploadOwnErr ? userAUploadOwnErr.message : "Upload succeeded unexpectedly"
  );

  // Test 8: User A attempts direct upload into Victim B's folder
  const { error: userAUploadVictimErr } = await userAClient.storage
    .from(BUCKET)
    .upload("999/malicious.png", dummyImage);
  assertTest(
    !!userAUploadVictimErr,
    "User A direct upload into Victim B's folder is blocked",
    userAUploadVictimErr ? userAUploadVictimErr.message : "Upload succeeded unexpectedly"
  );

  // Test 9: User A attempts direct update / overwrite of Victim B's canary
  const { error: userAUpdateErr } = await userAClient.storage
    .from(BUCKET)
    .update(targetPath, dummyImage);
  assertTest(
    !!userAUpdateErr,
    "User A direct overwrite/update of Victim B's object is blocked",
    userAUpdateErr ? userAUpdateErr.message : "Update succeeded unexpectedly"
  );

  // Test 10: User A attempts direct delete of Victim B's canary
  const { data: userADel, error: userADelErr } = await userAClient.storage
    .from(BUCKET)
    .remove([targetPath]);
  assertTest(
    !userADel || userADel.length === 0 || !!userADelErr,
    "User A direct delete of Victim B's object is blocked",
    userADelErr?.message || "Delete succeeded unexpectedly"
  );

  // Test 11: Arbitrary path traversal attempt
  const { error: userATraversalErr } = await userAClient.storage
    .from(BUCKET)
    .download("../etc/passwd");
  assertTest(
    !!userATraversalErr,
    "User A arbitrary path traversal attempt is blocked",
    userATraversalErr ? userATraversalErr.message : "Traversal succeeded unexpectedly"
  );

  // ────────────────────────────────────────────────────────────────────────────
  // LEGITIMATE SECTION 3: SERVER-SIDE AUTHORIZED SIGNING & RETRIEVAL
  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n4. Testing Server-Side Ownership Verification & Signed URL Lifecycle:");

  // Import our actual lib/supabase-storage.ts logic
  const { getUserBackgroundSignedUrl } = await import("../lib/supabase-storage.ts");

  // Test 12: Server rejects signing request when User A requests Victim B's object
  const userARequestForVictim = await getUserBackgroundSignedUrl(100, targetPath);
  assertTest(
    userARequestForVictim.signedUrl === null &&
      userARequestForVictim.error.includes("invalid storage path ownership"),
    "Server helper refuses to sign Victim B's object for User A",
    userARequestForVictim.error
  );

  // Test 13: Server approves signing request when Victim B requests own object
  const victimRequestForOwn = await getUserBackgroundSignedUrl(999, targetPath, 60);
  assertTest(
    victimRequestForOwn.signedUrl !== null &&
      victimRequestForOwn.signedUrl.startsWith("http"),
    "Server helper successfully signs Victim B's object for Victim B",
    victimRequestForOwn.error
  );

  // Test 14: Client HTTP GET using the server-generated signed URL works
  if (victimRequestForOwn.signedUrl) {
    const fetchRes = await fetch(victimRequestForOwn.signedUrl);
    assertTest(
      fetchRes.status === 200,
      "HTTP GET of server-generated signed URL returns HTTP 200 OK",
      `Status: ${fetchRes.status}`
    );
  } else {
    assertTest(false, "HTTP GET of server-generated signed URL returns HTTP 200 OK", "No signed URL generated");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n5. Cleaning up canary target via server client...");
  await serviceClient.storage.from(BUCKET).remove([targetPath]);
  console.log("   Canary object purged.\n");

  console.log("==================================================================");
  console.log(` PENETRATION RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runPenetrationSuite().catch((err) => {
  console.error("Penetration suite uncaught error:", err);
  process.exit(1);
});
