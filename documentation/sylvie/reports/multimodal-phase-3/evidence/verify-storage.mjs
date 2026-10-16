// Real Storage qualification, synthetic data only. No AI/provider request.
// Run from the repository root; all canaries are removed in finally.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const bucket = "ai-chat-attachments";
const reportFolder = new URL("./", import.meta.url);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_JWT_SECRET;
assert(url && anonKey && secret, "Storage verification credentials are unavailable");
const token = async role => new SignJWT({ role, iss: "supabase", sub: randomUUID(), aud: "authenticated" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2m").sign(new TextEncoder().encode(secret));
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || await token("service_role");
const client = (key, authorization) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, ...(authorization ? { global: { headers: { Authorization: `Bearer ${authorization}` } } } : {}) });
const service = client(serviceKey), anon = client(anonKey), authenticated = client(anonKey, await token("authenticated"));
const folder = `qa-phase3/${randomUUID()}`, path = `${folder}/canary.png`, deniedPath = `${folder}/denied.png`;
const image = await fs.readFile(new URL("fixture-equation.png", reportFolder));
const evidence = { syntheticOnly: true, providerCalls: 0, signaturesOrCredentialsLogged: false, checks: {}, cleanupComplete: false };
let database;
try {
  database = new pg.Client({ connectionString: process.env.DIRECT_URL }); await database.connect();
  const { rows: policies } = await database.query("SELECT permissive, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = $1", ["Restrictive isolation for AI chat attachments"]);
  assert.equal(policies.length, 1); assert.equal(policies[0].permissive, "RESTRICTIVE"); assert.equal(policies[0].cmd, "ALL");
  assert(policies[0].roles.includes("public")); assert(policies[0].qual.includes(bucket) && policies[0].with_check.includes(bucket));
  evidence.checks.restrictivePolicyInstalled = true;
  const bucketResult = await service.storage.getBucket(bucket); assert.ifError(bucketResult.error); assert.equal(bucketResult.data.public, false);
  evidence.checks.privateBucket = true;
  const upload = await service.storage.from(bucket).upload(path, image, { contentType: "image/png", upsert: false }); assert.ifError(upload.error);
  evidence.checks.backendUpload = true;
  const own = await service.storage.from(bucket).download(path); assert.ifError(own.error); assert.equal((await own.data.arrayBuffer()).byteLength, image.length);
  evidence.checks.backendDownload = true;
  for (const [role, actor] of [["anonymous", anon], ["authenticated", authenticated]]) {
    const listed = await actor.storage.from(bucket).list(folder);
    assert(!listed.data?.length, `${role} listed a private object`);
    const downloaded = await actor.storage.from(bucket).download(path);
    assert(downloaded.error && !downloaded.data, `${role} downloaded a private object`);
    const signed = await actor.storage.from(bucket).createSignedUrl(path, 60);
    assert(signed.error && !signed.data?.signedUrl, `${role} minted an image signature`);
    const inserted = await actor.storage.from(bucket).upload(deniedPath, image, { contentType: "image/png", upsert: false });
    assert(inserted.error, `${role} uploaded a private object`);
    evidence.checks[role] = { listDenied: true, downloadDenied: true, signingDenied: true, uploadDenied: true };
  }
  const signed = await service.storage.from(bucket).createSignedUrl(path, 60); assert.ifError(signed.error);
  const delivered = await fetch(signed.data.signedUrl); assert.equal(delivered.status, 200); assert.equal((await delivered.arrayBuffer()).byteLength, image.length);
  evidence.checks.shortLivedProviderAccess = true;
} finally {
  const cleanup = await service.storage.from(bucket).remove([path, deniedPath]);
  const remaining = await service.storage.from(bucket).list(folder);
  evidence.cleanupComplete = !cleanup.error && !remaining.error && remaining.data.length === 0;
  await database?.end().catch(() => {});
  await fs.writeFile(new URL("hosted-storage.json", reportFolder), JSON.stringify(evidence, null, 2) + "\n");
  assert(evidence.cleanupComplete, "Synthetic Storage cleanup failed");
}
console.log(JSON.stringify(evidence));
