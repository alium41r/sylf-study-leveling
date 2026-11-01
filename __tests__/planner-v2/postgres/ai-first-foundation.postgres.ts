import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { AttemptService, newBudget, persistAttempt } from "@/lib/planner/v2/server/attempts";
import { reserveAttemptQuota } from "@/lib/planner/v2/server/accounting";
import { ProviderCallReservationV2Schema } from "@/lib/planner/v2/contracts";
import { PlannerDatabase, hash } from "@/lib/planner/v2/server/database";
import { PlannerFoundationService, assertLegacyCompiler } from "@/lib/planner/v2/server/foundation";
import { RevisionService } from "@/lib/planner/v2/server/revisions";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { intentFixture } from "../contracts/fixtures";
import { foundationFixture, producerFixture } from "../intelligence/foundation-fixtures";
import { artifactRef, strategyDocument } from "@/lib/planner/v2/intelligence/foundation/validation";

let client: pg.Client, pool: pg.Pool, db: PlannerDatabase, attempts: AttemptService, foundation: PlannerFoundationService;
beforeAll(async () => { client = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); foundation = new PlannerFoundationService(attempts); });
afterAll(async () => { await pool?.end(); await client?.end(); });
async function fixture(kind: "PLAN" | "RESEARCH_ADVICE" = "PLAN", retainCapacity = true, compilerVersion: 1 | 2 = kind === "PLAN" ? 2 : 1) {
  const ownerId = await user(client), intent = intentFixture();
  const created = await new IntentService(db).create(ownerId, randomUUID(), intent);
  const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: "Prepare the accepted bounded proposal", kind, compilerVersion, budget: newBudget(kind === "PLAN" ? "EDUCATIONAL" : "RESEARCH"), targets: kind === "PLAN" ? [{ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null }] : [] });
  const token = await attempts.claim(`foundation_${randomUUID()}`); expect(token?.attemptId).toBe(attempt.attemptId);
  if (kind === "PLAN") await new RevisionService(attempts).resolveUnchanged(token!);
  const current = await attempts.read(ownerId, attempt.attemptId);
  const canonical = foundationFixture().canonical;
  const capacity = kind === "PLAN" && retainCapacity ? await foundation.append(token!, (await foundation.read(ownerId, attempt.attemptId)).digest, "CAPACITY", { schemaVersion: 1, calendar: canonical.calendar, constraints: canonical.constraints }) : null;
  const dossier = { schemaVersion: 1, capacity: capacity ? artifactRef(capacity.artifact) : { id: randomUUID(), digest: hash("unused", []) }, acceptedInstructionDigest: hash("accepted-instruction-v1", current.acceptedRequest), targets: current.targets.map(t => ({ planId: t.planId, requestedIntentId: t.requestedIntentVersionId, resolvedIntentId: t.resolvedIntentVersionId!, intentDigest: hash("canonical-intent", intent), contextDigest: t.contextDigest! })), rawEvidenceDigest: hash("raw", []), adoptedEvidenceDigest: hash("adopted", []), constraintsDigest: hash("ai-first-constraints-v1", canonical.constraints), calendarDigest: hash("ai-first-calendar-v1", canonical.calendar), sourcePins: [], unresolved: [] };
  return { ownerId, created, attempt: current, token: token!, dossier };
}
async function retained() {
  const f = await fixture(); const before = await foundation.read(f.ownerId, f.attempt.attemptId);
  const saved = await foundation.append(f.token, before.digest, "DOSSIER", f.dossier);
  const document = strategyDocument({ schemaVersion: 1, dossier: artifactRef(saved.artifact), parent: null, version: 1, producer: producerFixture(), text: '  Detailed original strategy 🧠\n\nUse the actual worksheet. Stop after a correct explanation.\n'.repeat(100) });
  const strategy = await foundation.append(f.token, saved.digest, "STRATEGY", document);
  return { ...f, before, saved, document, strategy };
}
// Synthetic historical setup only. Runtime v2 role admission remains closed.
async function seedHistoricalReceipt(token: Parameters<AttemptService["reserveCall"]>[0]) {
    const callId = randomUUID();
    await attempts.mutate(token, async (sql, attempt, payload, now) => {
      const call = ProviderCallReservationV2Schema.parse({ schemaVersion: 2, callId, rootRequestId: attempt.budget.rootRequestId, attemptId: attempt.attemptId,
        fence: attempt.fence, stage: attempt.stage, provider: "scripted", model: "offline", reservedInputTokens: 100, reservedOutputTokens: 100,
        state: "RESERVED", actualInputTokens: null, actualOutputTokens: null, costUsd: null, pricing: "UNKNOWN", settlementKey: callId });
      const budget = structuredClone(attempt.budget); budget.reserved.modelCalls++; budget.reserved.inputTokens += 100; budget.reserved.outputTokens += 100;
      await persistAttempt(sql, attempt, { ...attempt, budget }, { ...payload, calls: [call], callCategories: { [callId]: "PLANNING" },
        providerCalls: { [callId]: { purpose: "BLUEPRINT", reservedAt: now.toISOString() } }, quotaReceipt: await reserveAttemptQuota(sql, attempt.ownerId, "planner", now) });
    });
  return callId;
}
describe("AI-first retained artifacts on the actual durable core", () => {
  it("retains exact strategy bytes and versions, with replay and CAS", async () => {
    const f = await retained();
    const replay = await foundation.append(f.token, f.saved.digest, "STRATEGY", f.document);
    expect(replay.artifact.id).toBe(f.strategy.artifact.id);
    const loaded = await foundation.read(f.ownerId, f.attempt.attemptId);
    expect(loaded.archive.entries[f.strategy.artifact.id].value).toEqual(f.document);
    await expect(foundation.append(f.token, f.saved.digest, "STRATEGY", { ...f.document, text: "Changed" })).rejects.toMatchObject({ detail: { code: "STALE_CONTEXT" } });
    const next = strategyDocument({ ...f.document, parent: artifactRef(f.strategy.artifact), version: 2, text: "Use less work after success." });
    await foundation.append(f.token, replay.digest, "STRATEGY", next);
    expect(Object.keys((await foundation.read(f.ownerId, f.attempt.attemptId)).archive.entries)).toHaveLength(4);
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    expect((await foundation.read(f.ownerId, f.attempt.attemptId)).archive.entries[f.strategy.artifact.id].value).toEqual(f.document);
  });
  it("rejects foreign owners and forged accepted-intent correspondence", async () => {
    const f = await fixture(), stranger = await user(client), initial = await foundation.read(f.ownerId, f.attempt.attemptId);
    await expect(foundation.read(stranger, f.attempt.attemptId)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(foundation.append(f.token, initial.digest, "DOSSIER", { ...f.dossier, acceptedInstructionDigest: "b".repeat(64) })).rejects.toMatchObject({ detail: { code: "STALE_CONTEXT" } });
    await expect(foundation.append(f.token, initial.digest, "DOSSIER", { ...f.dossier, targets: f.dossier.targets.map(t => ({ ...t, intentDigest: "b".repeat(64) })) })).rejects.toMatchObject({ detail: { code: "STALE_CONTEXT" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("database backstops reject rewriting retained entries or appending without a fence", async () => {
    const f = await retained();
    await expect(client.query('UPDATE "PlannerAttempt" SET "intelligenceArtifacts"=NULL WHERE id=$1', [f.attempt.attemptId])).rejects.toThrow();
    await expect(db.coordinated(f.ownerId, async sql => {
      await sql.query("SELECT set_config('sylf.planner_foundation_fence',$1,true)", [String(f.token.fence)]);
      await sql.query('UPDATE "PlannerAttempt" SET "intelligenceArtifacts"=jsonb_set("intelligenceArtifacts",ARRAY[\'entries\',$2,\'value\',\'text\'],to_jsonb(\'rewritten\'::text)) WHERE id=$1', [f.attempt.attemptId, f.strategy.artifact.id]);
    })).rejects.toThrow(/IMMUTABLE/);
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET "intelligenceArtifacts"=jsonb_set("intelligenceArtifacts",\'{compilerVersion}\',\'3\') WHERE id=$1', [f.attempt.attemptId]))).rejects.toThrow();
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("retains archives and accounting through lease takeover, rejecting stale and cancelled writers", async () => {
    const f = await retained(); const call = await seedHistoricalReceipt(f.token);
    await attempts.dispatchCall(f.token, call, "PLANNING");
    const before = await attempts.read(f.ownerId, f.attempt.attemptId), archive = await foundation.read(f.ownerId, f.attempt.attemptId);
    await db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET "leaseExpiresAt"=$2::text::timestamp,artifact=jsonb_set(artifact,\'{lease,expiresAt}\',to_jsonb($2::text)) WHERE id=$1', [f.attempt.attemptId, new Date(Date.now() - 1000).toISOString()]));
    await attempts.sweep(); const token = await attempts.claim("foundation_takeover"); expect(token?.attemptId).toBe(f.attempt.attemptId);
    expect((await attempts.read(f.ownerId, f.attempt.attemptId)).budget).toEqual(before.budget);
    expect(await foundation.read(f.ownerId, f.attempt.attemptId)).toEqual(archive);
    await expect(foundation.append(f.token, archive.digest, "DOSSIER", f.dossier)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await expect(foundation.append(token!, archive.digest, "DOSSIER", f.dossier)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
  });
  it("cannot enter the legacy compiler/publication path or mutate execution", async () => {
    const f = await retained();
    await expect(db.coordinated(f.ownerId, sql => assertLegacyCompiler(sql, f.attempt.attemptId))).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    expect((await client.query('SELECT count(*)::int AS count FROM "Quest" WHERE "userId"=$1', [f.ownerId])).rows[0].count).toBe(0);
    expect((await client.query('SELECT count(*)::int AS count FROM "PlannerRevision" WHERE "attemptId"=$1', [f.attempt.attemptId])).rows[0].count).toBe(0);
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("rejects unknown checkpoint interpretations even without a new archive", async () => {
    const f = await fixture("PLAN", false, 1);
    await db.coordinated(f.ownerId, sql => assertLegacyCompiler(sql, f.attempt.attemptId));
    await attempts.checkpoint(f.token, "PREFLIGHT", { compilerVersion: 2, schemaVersion: 1 });
    await expect(db.coordinated(f.ownerId, sql => assertLegacyCompiler(sql, f.attempt.attemptId))).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("persists pending call identity and the complete accepted response before takeover assembly", async () => {
    const f = await retained(); let digest = f.strategy.digest;
    const base = { schemaVersion: 1, compilerVersion: 2, previous: null, requestHash: f.attempt.requestHash, rootRequestId: f.attempt.budget.rootRequestId, authorizationDigest: f.attempt.acceptedRequest.targetAuthorizationDigest, targetsDigest: hash("ai-first-targets-v1", f.attempt.targets), stage: "RESEARCH", artifacts: [artifactRef(f.saved.artifact)], resourceSnapshotDigest: hash("resource", f.attempt.budget), pendingCall: null, route: null, reason: "Retain understanding before strategy" };
    const first = await foundation.append(f.token, digest, "CHECKPOINT", base); digest = first.digest;
    const callId = await seedHistoricalReceipt(f.token);
    const pending = { ...base, previous: artifactRef(first.artifact), stage: "STRATEGY", pendingCall: { callId, role: "STRATEGIST", inputDigest: hash("input", "understanding"), state: "RESERVED", response: null, responseDigest: null } };
    const reserved = await foundation.append(f.token, digest, "CHECKPOINT", pending);
    await attempts.dispatchCall(f.token, callId, "PLANNING");
    const dispatched = { ...pending, previous: artifactRef(reserved.artifact), pendingCall: { ...pending.pendingCall, state: "DISPATCHED" } };
    const savedDispatch = await foundation.append(f.token, reserved.digest, "CHECKPOINT", dispatched);
    await expect(foundation.append(f.token, savedDispatch.digest, "CHECKPOINT", { ...dispatched, previous: artifactRef(savedDispatch.artifact), pendingCall: null })).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await attempts.settleCall(f.token, callId, { inputTokens: 10, outputTokens: 5, costUsd: 0 });
    await attempts.closeProviderCall(f.token, callId, { finishReason: "STOP", accepted: true });
    const response = "  Complete natural strategy.\nPreserve this exact output. 🧠";
    const accepted = await foundation.append(f.token, savedDispatch.digest, "CHECKPOINT", { ...dispatched, previous: artifactRef(savedDispatch.artifact), pendingCall: { ...dispatched.pendingCall, state: "RESPONSE_SAVED", response, responseDigest: hash("saved-role-response-v1", response) } });
    await attempts.release(f.token); const next = await attempts.claim("foundation_saved_response"); expect(next?.attemptId).toBe(f.attempt.attemptId);
    const restored = (await foundation.read(f.ownerId, f.attempt.attemptId)).archive.entries[accepted.artifact.id];
    expect(restored.kind === "CHECKPOINT" && restored.value.pendingCall?.response).toBe(response);
    expect(await foundation.inspect(f.ownerId, f.attempt.attemptId)).toMatchObject({ compilerVersion: 2, recovery: "ASSEMBLE_SAVED_RESPONSE", checkpoint: { pendingCall: { response } } });
    expect((await attempts.read(f.ownerId, f.attempt.attemptId)).budget.consumed.modelCalls).toBe(1);
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("keeps research-only work read-only", async () => {
    const f = await fixture("RESEARCH_ADVICE"), archive = await foundation.read(f.ownerId, f.attempt.attemptId);
    await expect(foundation.append(f.token, archive.digest, "DOSSIER", f.dossier)).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
  });
  it("checks new storage guards at worker startup and preserves account erasure", async () => {
    const worker = new PlannerWorker(attempts, {}); expect((await worker.readiness()).compatible).toBe(true);
    try { await client.query('ALTER TABLE "PlannerAttempt" DISABLE TRIGGER planner_intelligence_attempt'); expect((await worker.readiness()).compatible).toBe(false); }
    finally { await client.query('ALTER TABLE "PlannerAttempt" ENABLE TRIGGER planner_intelligence_attempt'); }
    const f = await retained(); await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await db.coordinated(f.ownerId, sql => sql.query('DELETE FROM "User" WHERE id=$1', [f.ownerId]));
    expect((await client.query('SELECT id FROM "PlannerAttempt" WHERE id=$1', [f.attempt.attemptId])).rows).toEqual([]);
  });
});
