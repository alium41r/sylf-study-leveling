import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user, linked } from "./database";
import { intentFixture } from "./intent-fixture";
import { prepareProposal } from "./proposal-fixture";
import { changeSetFixture, revisionFixture } from "../contracts/fixtures";
import { foundationFixture, producerFixture } from "../intelligence/foundation-fixtures";
import { PlannerDatabase, hash } from "@/lib/planner/v2/server/database";
import { AttemptService, persistAttempt } from "@/lib/planner/v2/server/attempts";
import { GenerationService } from "@/lib/planner/v2/server/generation";
import { loadCompilerVersion } from "@/lib/planner/v2/server/compiler-version";
import { PlannerFoundationService } from "@/lib/planner/v2/server/foundation";
import { createCompilerHandlers } from "@/lib/planner/v2/server/compiler";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { RevisionService, loadRevision, revisionDigest } from "@/lib/planner/v2/server/revisions";
import { WorkspaceService } from "@/lib/planner/v2/server/workspace";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { artifactRef, candidateDigest, sealIntelligenceBundle, strategyDocument } from "@/lib/planner/v2/intelligence/foundation/validation";

let client: pg.Client, pool: pg.Pool, db: PlannerDatabase, attempts: AttemptService, foundation: PlannerFoundationService;
const owners = new Set<number>();
beforeAll(async () => { client = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 5 }); db = new PlannerDatabase(pool); attempts = new AttemptService(db); foundation = new PlannerFoundationService(attempts); });
afterEach(async () => {
  for (const ownerId of owners) for (const row of (await client.query('SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN (\'QUEUED\',\'RUNNING\',\'NEEDS_DECISION\')', [ownerId])).rows) await attempts.cancel(ownerId, row.id);
  owners.clear();
});
afterAll(async () => { await pool?.end(); await client?.end(); });
async function admission(version: 1 | 2 = 2) {
  const ownerId = await user(client); owners.add(ownerId);
  await client.query('UPDATE "User" SET "restDays"=\'{}\' WHERE id=$1', [ownerId]);
  const intent = { ...intentFixture(), availability: { timezone: "UTC", dailyCeilingMinutes: Array(7).fill(120), restWeekdays: [], blockedDates: [], recoveryPercent: 0, basis: "CONFIRMED_AVAILABILITY" as const } };
  const request = { schemaVersion: 2, requestKey: randomUUID(), text: "Prepare my accepted physics goal", targets: [{ kind: "NEW", intent }] };
  const generation = new GenerationService(db, { compilerVersion: version });
  const admitted = await generation.accept(ownerId, request);
  return { ownerId, request, intent, generation, attempt: admitted.attempt, planId: admitted.attempt.targets[0].planId };
}
async function claim(f: Awaited<ReturnType<typeof admission>>) {
  const token = await attempts.claim(`versions_${randomUUID()}`); expect(token?.attemptId).toBe(f.attempt.attemptId); return token!;
}
async function retainedCandidate() {
  const f = await admission(), token = await claim(f); await new RevisionService(attempts).resolveUnchanged(token);
  const current = await attempts.read(f.ownerId, f.attempt.attemptId), source = foundationFixture();
  const revision = revisionFixture();
  Object.assign(revision, { revisionId: randomUUID(), planId: f.planId, ownerId: f.ownerId, attemptId: current.attemptId,
    requestedIntentVersionId: current.targets[0].requestedIntentVersionId, resolvedIntentVersionId: current.targets[0].resolvedIntentVersionId, sealedAt: new Date().toISOString() });
  Object.assign(revision.executable[0], { activityKey: randomUUID(), planId: f.planId });
  revision.digest = revisionDigest(revision);
  let digest = (await foundation.read(f.ownerId, current.attemptId)).digest;
  const append = async (kind: Parameters<PlannerFoundationService["append"]>[2], value: unknown) => {
    const saved = await foundation.append(token, digest, kind, value); digest = saved.digest; return saved.artifact;
  };
  const capacity = await append("CAPACITY", source.capacity.value);
  if (source.dossier.kind !== "DOSSIER" || source.translation.kind !== "TRANSLATION" || source.review.kind !== "REVIEW") throw new Error();
  const dossier = await append("DOSSIER", { ...source.dossier.value, capacity: artifactRef(capacity), acceptedInstructionDigest: hash("accepted-instruction-v1", current.acceptedRequest),
    targets: [{ planId: f.planId, requestedIntentId: revision.requestedIntentVersionId, resolvedIntentId: revision.resolvedIntentVersionId, intentDigest: hash("canonical-intent", f.intent), contextDigest: current.targets[0].contextDigest }] });
  const strategy = await append("STRATEGY", strategyDocument({ schemaVersion: 1, dossier: artifactRef(dossier), parent: null, version: 1, producer: producerFixture(), text: "Complete exact historical strategy. 🧠\n\nStop after success." }));
  const blueprints = [{ planId: f.planId, blueprint: revision.blueprint }];
  const translation = await append("TRANSLATION", { ...source.translation.value, strategies: [artifactRef(strategy)], blueprintDigest: hash("ai-first-blueprints-v1", blueprints),
    elements: source.translation.value.elements.map(e => ({ ...e, strategyId: strategy.id, targets: e.targets.map(t => ({ ...t, planId: f.planId })) })) });
  const binding = { ...source.binding, dossier: artifactRef(dossier), strategies: [artifactRef(strategy)], translation: artifactRef(translation), blueprintDigest: hash("ai-first-blueprints-v1", blueprints), executionDigest: hash("ai-first-execution-v1", revision.executable) };
  const review = await append("REVIEW", { ...source.review.value, candidateDigest: candidateDigest(binding) });
  const archive = (await foundation.read(f.ownerId, current.attemptId)).archive;
  const bundle = sealIntelligenceBundle(archive, binding, artifactRef(review), { ...source.canonical, blueprints, execution: revision.executable });
  // Seed a future sealed historical row to qualify readers while production
  // publication remains closed. This is not an ApplyService success witness.
  await db.coordinated(f.ownerId, sql => sql.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseVersion","schemaVersion","attemptId","requestedIntentVersionId","resolvedIntentVersionId","v2Artifact","intelligenceBundle","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,1,\'GENERATE\',0,2,$3,$4,$4,$5,$6,\'{}\',\'{}\',\'{}\',$7,$8,$9,\'SEALED\',now(),now())',
    [revision.revisionId, f.planId, current.attemptId, revision.resolvedIntentVersionId, revision, bundle, revision.digest, current.idempotencyKey, current.requestHash]));
  return { ...f, token, current, revision, strategy, dossier, bundle };
}

describe("compiler admission, dispatch and historical compatibility", () => {
  it("admits v2 only from trusted service configuration and binds exact replay", async () => {
    const f = await admission();
    expect(await db.coordinated(f.ownerId, sql => loadCompilerVersion(sql, f.attempt.attemptId))).toBe(2);
    expect((await f.generation.accept(f.ownerId, f.request)).replayed).toBe(true);
    await expect(new GenerationService(db).accept(f.ownerId, f.request)).rejects.toMatchObject({ detail: { code: "IDEMPOTENCY_MISMATCH" } });
    await expect(f.generation.accept(f.ownerId, { ...f.request, requestKey: randomUUID(), compilerVersion: 2 })).rejects.toThrow();
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET "compilerVersion"=1 WHERE id=$1', [f.attempt.attemptId]))).rejects.toThrow(/IMMUTABLE/);
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET "compilerVersion"=3 WHERE id=$1', [f.attempt.attemptId]))).rejects.toThrow();
  });
  it("defaults old admission to v1, retains it through recovery and forbids conversion", async () => {
    const f = await admission(1), token = await claim(f);
    await attempts.checkpoint(token, "PREFLIGHT", { oldCore: true });
    await attempts.release(token); const next = await claim(f);
    expect(next.fence).toBeGreaterThan(token.fence);
    expect((await foundation.inspect(f.ownerId, f.attempt.attemptId)).compilerVersion).toBe(1);
    await expect(foundation.append(next, (await foundation.read(f.ownerId, f.attempt.attemptId)).digest, "CAPACITY", foundationFixture().capacity.value)).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await expect(new GenerationService(db, { compilerVersion: 2 }).accept(f.ownerId, { schemaVersion: 2, requestKey: randomUUID(), text: "Retry", parentAttemptId: f.attempt.attemptId,
      targets: [{ kind: "EXISTING", planId: f.planId, expectedIntentVersionId: f.attempt.targets[0].requestedIntentVersionId, expectedPlanningVersion: 0, baseActiveRevisionId: null }] })).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
  });
  it("prevents a pre-versioning worker from claiming v2 during a mixed deployment", async () => {
    const f = await admission(); const now = new Date(), fence = 1;
    const budget = { ...f.attempt.budget, processingStartedAt: now.toISOString(), executionDeadlineAt: new Date(now.getTime() + 180000).toISOString() };
    // This is the old worker's otherwise-valid queued -> running write, under
    // real coordination and without the new transaction-local claim marker.
    await expect(db.coordinated(f.ownerId, sql => persistAttempt(sql, f.attempt, { ...f.attempt, state: "RUNNING", stage: "PREFLIGHT", fence, budget,
      lease: { owner: "pre_versioning_worker", fence, expiresAt: new Date(now.getTime() + 45000).toISOString() } }))).rejects.toThrow(/CLAIM_CAPABILITY_REQUIRED/);
    expect((await attempts.read(f.ownerId, f.attempt.attemptId)).state).toBe("QUEUED");
    expect((await claim(f)).fence).toBe(1);
  });
  it("dispatches v2 in the existing worker without legacy calls or publication", async () => {
    const f = await admission(); let upstream = 0;
    const worker = new PlannerWorker(attempts, createCompilerHandlers(attempts, { provider: { adapter: () => { upstream++; throw new Error("No provider authorized"); } } }), () => {});
    await worker.tick();
    for (let i = 0; i < 100; i++) { if ((await attempts.read(f.ownerId, f.attempt.attemptId)).state === "FAILED") break; await new Promise(resolve => setTimeout(resolve, 10)); }
    await worker.shutdown();
    expect(await attempts.read(f.ownerId, f.attempt.attemptId)).toMatchObject({ state: "FAILED", error: { code: "QUALITY_INCOMPLETE" }, budget: { consumed: { modelCalls: 0 } } });
    expect(upstream).toBe(0);
    expect((await client.query('SELECT id FROM "PlannerRevision" WHERE "attemptId"=$1', [f.attempt.attemptId])).rows).toEqual([]);
    expect((await client.query('SELECT id FROM "Quest" WHERE "userId"=$1', [f.ownerId])).rows).toEqual([]);
  });
  it("keeps legacy checkpoint and resource writers closed for v2", async () => {
    const f = await admission(), token = await claim(f);
    await expect(attempts.checkpoint(token, "PREFLIGHT", { compilerVersion: 1 })).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await expect(attempts.reserveCall(token, { provider: "scripted", model: "offline", inputTokens: 1, outputTokens: 1, category: "PLANNING" })).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    await expect(new RevisionService(attempts).publish(token, [revisionFixture()], changeSetFixture())).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT", message: expect.stringContaining("pinned to compiler v2") } });
    expect((await client.query('SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1', [f.attempt.attemptId])).rows).toEqual([]);
  });
  it("recovers a fenced v2 checkpoint without resetting its version, deadline or archive", async () => {
    const f = await admission(), token = await claim(f), before = await attempts.read(f.ownerId, f.attempt.attemptId);
    const saved = await foundation.append(token, (await foundation.read(f.ownerId, before.attemptId)).digest, "CHECKPOINT", {
      schemaVersion: 1, compilerVersion: 2, previous: null, requestHash: before.requestHash, rootRequestId: before.budget.rootRequestId,
      authorizationDigest: before.acceptedRequest.targetAuthorizationDigest, targetsDigest: hash("ai-first-targets-v1", before.targets), stage: "RESEARCH", artifacts: [],
      resourceSnapshotDigest: hash("resource", before.budget), pendingCall: null, route: null, reason: "Retain research stage through worker loss" });
    await db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerAttempt" SET "leaseExpiresAt"=$2::text::timestamp,artifact=jsonb_set(artifact,\'{lease,expiresAt}\',to_jsonb($2::text)) WHERE id=$1', [before.attemptId, new Date(Date.now() - 1000).toISOString()]));
    expect(await attempts.sweep()).toBe(1); const next = await claim(f);
    expect(next.fence).toBe(token.fence + 1);
    expect((await attempts.read(f.ownerId, before.attemptId)).budget).toEqual(before.budget);
    expect(await foundation.inspect(f.ownerId, before.attemptId)).toMatchObject({ compilerVersion: 2, digest: saved.digest, checkpoint: { stage: "RESEARCH" }, recovery: "RESUME_STAGE" });
    await expect(foundation.append(token, saved.digest, "CHECKPOINT", saved.artifact.value)).rejects.toMatchObject({ detail: { code: "LEASE_EXPIRED" } });
    await attempts.cancel(f.ownerId, before.attemptId);
    await expect(f.generation.accept(f.ownerId, { schemaVersion: 2, requestKey: randomUUID(), text: "Continue", parentAttemptId: before.attemptId,
      targets: [{ kind: "EXISTING", planId: f.planId, expectedIntentVersionId: before.targets[0].requestedIntentVersionId, expectedPlanningVersion: 0, baseActiveRevisionId: null }] })).rejects.toMatchObject({ detail: { code: "QUALITY_INCOMPLETE" } });
    expect((await foundation.inspect(f.ownerId, before.attemptId)).compilerVersion).toBe(2);
  });
  it("retains exact historical strategy and correspondence after newer drafts, cancellation and ownership checks", async () => {
    const f = await retainedCandidate();
    if (f.strategy.kind !== "STRATEGY") throw new Error();
    await foundation.append(f.token, (await foundation.read(f.ownerId, f.attempt.attemptId)).digest, "STRATEGY", strategyDocument({ ...f.strategy.value, parent: artifactRef(f.strategy), version: 2, text: "A later unreviewed draft." }));
    await attempts.cancel(f.ownerId, f.attempt.attemptId);
    const read = await new RevisionService(attempts).read(f.ownerId, f.revision.revisionId);
    expect(read.compilerVersion).toBe(2); expect(read.intelligence?.strategies[0].id).toBe(f.strategy.id);
    expect(read.intelligence?.translation.digest).toBe(f.bundle.binding.translation.digest); expect(read.intelligence?.review.digest).toBe(f.bundle.review.digest);
    expect((await new WorkspaceService(db).readIntelligence(f.ownerId, f.planId, f.revision.revisionId)).kind).toBe("REVISION");
    const foreign = await user(client);
    await expect(new RevisionService(attempts).read(foreign, f.revision.revisionId)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(foundation.inspect(foreign, f.attempt.attemptId)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
    await expect(db.coordinated(f.ownerId, sql => loadRevision(sql, f.ownerId, f.revision.revisionId))).rejects.toMatchObject({ detail: { code: "INVALID_OUTPUT" } });
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "PlannerRevision" SET "intelligenceBundle"=NULL WHERE id=$1', [f.revision.revisionId]))).rejects.toThrow(/IMMUTABLE/);
  });
  it("preserves canonical v1 publication, historical read, apply replay and protected execution", async () => {
    const f = await admission(1); await attempts.cancel(f.ownerId, f.attempt.attemptId);
    const proposal = await prepareProposal(db, f.ownerId, [f.planId]);
    const read = await new RevisionService(attempts).read(f.ownerId, proposal.revisions[0].revisionId);
    expect(read).toEqual({ schemaVersion: 1, compilerVersion: 1, revision: proposal.revisions[0], intelligence: null });
    const apply = new ApplyService(db), receipt = await apply.apply(f.ownerId, proposal.request);
    expect(await apply.apply(f.ownerId, proposal.request)).toEqual(receipt);
    expect((await new WorkspaceService(db).read(f.ownerId, f.planId)).active?.revisionId).toBe(proposal.revisions[0].revisionId);
    await expect(db.coordinated(f.ownerId, sql => sql.query('UPDATE "Quest" SET title=\'Bypass\' WHERE "userId"=$1', [f.ownerId]))).rejects.toThrow();
  });
  it("retains hard exam deadlines when fixtures intentionally exceed them", async () => {
    const f = await admission(1); await attempts.cancel(f.ownerId, f.attempt.attemptId);
    await expect(prepareProposal(db, f.ownerId, [f.planId], specs => { specs[0].placement.date = new Date(Date.now() + 91 * 86400000).toISOString().slice(0, 10); })).rejects.toMatchObject({ detail: { code: "SCHEDULE_CONFLICT" } });
    expect((await client.query('SELECT id FROM "PlannerRevision" WHERE "planId"=$1', [f.planId])).rows).toEqual([]);
  });
  it("reads pre-V2 historical snapshots without fabricating a blueprint or reviewer approval", async () => {
    const old = await linked(client);
    expect(await new RevisionService(attempts).read(old.userId, old.revisionId)).toMatchObject({ compilerVersion: null, kind: "LEGACY_REVISION",
      revision: { revisionId: old.revisionId, planId: old.planId, outputSnapshot: { fixture: "current SQL" } }, intelligence: null });
    expect((await new WorkspaceService(db).readIntelligence(old.userId, old.planId, old.revisionId)).kind).toBe("REVISION");
    await expect(new RevisionService(attempts).read(await user(client), old.revisionId)).rejects.toMatchObject({ detail: { code: "REFERENCE_NOT_OWNED" } });
  });
});
