import {
  PlannerRevisionV2Schema, PlanChangeSetV2Schema, ExecutionTaskSpecV2Schema, validateChangeSetCorrespondenceV2,
  type PlannerRevisionV2, type PlanChangeSetV2, type CanonicalIntentV2,
  validateBlueprintReferences,
  CanonicalIntentV2Schema, ResearchEvidenceV2Schema,
} from "../contracts";
import { verifyOwnedResearchDocuments, DocumentRepository } from "./documents";
import { rows, hash, reject, clock, type Sql } from "./database";
import { AttemptService, persistAttempt, type LeaseToken } from "./attempts";
import { appendIntent, loadIntent, ownedPlan } from "./intents";
import { loadExecutionContext, verifyContextCorrespondence, verifyPlacement, contextInputDigest, externalActivityAlias, savedCheckReferences } from "./context";
import { verifyExecutionGraph } from "./execution-validation";
import { CompilerCheckpointSchema } from "../intelligence/schemas/checkpoint";
import { assertLegacyCompiler, loadAttemptArtifacts } from "./foundation";
import { readRetainedBundle, readReviewedBundle } from "../intelligence/foundation/readers";
import { validateTranslation } from "../intelligence/foundation/validation";
import { loadCompilerVersion } from "./compiler-version";
import { reviewedPublication, reviewedQuality, assertReviewedRevisions, assertReviewedChangeSet, verifyReviewedDocuments, verifyReviewedDocumentMetadata } from "./reviewed-publication";
import { sealAllocatedExecution } from "./compilation";
import { PlannerCalendarCapacity } from "./calendar-capacity";
import { lockPlanningCalendar } from "../../../calendar/planning";
import type { RevisionIntelligenceBundleSchema } from "../intelligence/foundation/contracts";
import type { z } from "zod";

export const revisionDigest = (revision: PlannerRevisionV2): string => {
  return hash("revision", Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "digest")));
};
export const educationalDigest = (revision: Pick<PlannerRevisionV2,"blueprint"|"context">): string => hash("educational-content", { blueprint: revision.blueprint, externalDependencies: revision.context.externalActivityDependencies });
export const qualityEvidenceDigest = (intent: CanonicalIntentV2): string => hash("quality-evidence", { evidence: intent.evidence, research: intent.research ?? null });
export async function loadRevision(sql: Sql, ownerId: number, revisionId: string): Promise<PlannerRevisionV2> {
  const row = (await rows<{ v2Artifact: unknown; intelligenceBundle: unknown; attemptId: string }>(sql, 'SELECT r."v2Artifact",r."intelligenceBundle",r."attemptId" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE r.id=$1::uuid AND p."userId"=$2', [revisionId, ownerId]))[0];
  if (!row?.v2Artifact) reject("REFERENCE_NOT_OWNED", "A sealed V2 revision is unavailable.");
  if (row.intelligenceBundle) {
    if (Reflect.get(row.intelligenceBundle as object,"schemaVersion") !== 2) reject("INVALID_OUTPUT", "Historical bundle v1 has no execution authority.");
    const retained=await loadRevisionDocument(sql,ownerId,revisionId);
    if(retained.compilerVersion!==2||retained.intelligence?.bundle.schemaVersion!==2)reject("INVALID_OUTPUT","A reviewed executable bundle is required.");
    return PlannerRevisionV2Schema.parse(retained.revision);
  }
  if (await loadCompilerVersion(sql, row.attemptId) !== 1) reject("INVALID_OUTPUT", "AI-first revisions require their version 2 reader; legacy execution is prohibited.");
  const artifact = PlannerRevisionV2Schema.parse(row.v2Artifact);
  if (artifact.digest !== revisionDigest(artifact)) reject("INVALID_OUTPUT", "The sealed revision failed its integrity check.");
  return artifact;
}

/** Versioned historical view. Historical correspondence grants no live
 * currentness; publication and confirmation separately verify those boundaries. */
export async function loadRevisionDocument(sql: Sql, ownerId: number, revisionId: string) {
  const row = (await rows<{ planId: string; attemptId: string; v2Artifact: unknown; intelligenceBundle: unknown; schemaVersion: number; source: string; digest: string;
    inputSnapshot: unknown; availabilitySnapshot: unknown; outputSnapshot: unknown }>(sql,
    'SELECT r."planId",r."attemptId",r."v2Artifact",r."intelligenceBundle",r."schemaVersion",r.source,r.digest,r."inputSnapshot",r."availabilitySnapshot",r."outputSnapshot" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE r.id=$1::uuid AND p."userId"=$2', [revisionId, ownerId]))[0];
  if (!row) reject("REFERENCE_NOT_OWNED", "This historical revision is unavailable.");
  if (!row.v2Artifact) {
    if (row.intelligenceBundle != null || row.schemaVersion !== 1) reject("INVALID_OUTPUT", "A canonical revision is missing its executable artifact.");
    // Pre-V2/imported history has no canonical blueprint or compiler review.
    return { schemaVersion: 1 as const, compilerVersion: null, kind: "LEGACY_REVISION" as const, revision: {
      revisionId, planId: row.planId, digest: row.digest, source: row.source, inputSnapshot: row.inputSnapshot,
      availabilitySnapshot: row.availabilitySnapshot, outputSnapshot: row.outputSnapshot }, intelligence: null };
  }
  if (row.intelligenceBundle == null) return { schemaVersion: 1 as const, compilerVersion: 1 as const, revision: await loadRevision(sql, ownerId, revisionId), intelligence: null };
  const archive = await loadAttemptArtifacts(sql, ownerId, row.attemptId);
  if (archive.compilerVersion !== 2) reject("INVALID_OUTPUT", "This revision requires its compiler v2 archive.");
  try {
    const retained = readRetainedBundle(row.intelligenceBundle, archive.archive);
    if (retained.bundle.archiveAttemptId !== row.attemptId) throw new Error("ARCHIVE_ATTEMPT_MISMATCH");
    const stored = await rows<{ planId: string; v2Artifact: unknown; intelligenceBundle: unknown }>(sql,
      'SELECT r."planId",r."v2Artifact",r."intelligenceBundle" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE r."attemptId"=$1 AND p."userId"=$2', [row.attemptId, ownerId]);
    const revisions = retained.dossier.value.targets.map(target => {
      const matching = stored.filter(r => r.planId === target.planId);
      if (matching.length !== 1 || hash("revision-bundle", matching[0].intelligenceBundle) !== hash("revision-bundle", row.intelligenceBundle)) throw new Error("JOINT_REVISION_BUNDLE_MISMATCH");
      const revision = PlannerRevisionV2Schema.parse(matching[0].v2Artifact);
      if (revision.ownerId !== ownerId || revision.planId !== target.planId || revision.attemptId !== row.attemptId || revision.digest !== revisionDigest(revision) ||
        revision.requestedIntentVersionId !== target.requestedIntentId || revision.resolvedIntentVersionId !== target.resolvedIntentId) throw new Error("REVISION_IDENTITY_MISMATCH");
      return revision;
    });
    const blueprints = revisions.map(r => ({ planId: r.planId, blueprint: r.blueprint }));
    if (stored.length !== revisions.length || hash("ai-first-blueprints-v1", blueprints) !== retained.bundle.binding.blueprintDigest ||
      hash("ai-first-execution-v1", revisions.flatMap(r => r.executable)) !== retained.bundle.binding.executionDigest) throw new Error("REVISION_CANONICAL_MISMATCH");
    validateTranslation(retained.translation.value, blueprints);
    if(retained.bundle.schemaVersion===2)assertReviewedRevisions(readReviewedBundle(retained.bundle,archive.archive),revisions);
    const revision = revisions.find(r => r.revisionId === revisionId && r.planId === row.planId);
    if (!revision) throw new Error("REVISION_IDENTITY_MISMATCH");
    return { schemaVersion: 1 as const, compilerVersion: 2 as const, revision, intelligence: retained };
  } catch { reject("INVALID_OUTPUT", "The historical intelligence bundle failed correspondence validation.", "RECOVERY"); }
}
/** Only trusted worker orchestration calls this. No public client may attest quality. */
export class RevisionService {
  constructor(readonly attempts: AttemptService, readonly documents=new DocumentRepository(attempts.db)) {}
  async read(ownerId: number, revisionId: string) {
    return this.attempts.db.coordinated(ownerId, sql => loadRevisionDocument(sql, ownerId, revisionId));
  }
  /** Trusted retrieval/orchestration supplies verified evidence. This method
   * provides only durable adoption/currentness; it does not perform research. */
  async resolveResearch(token: LeaseToken, proposed: readonly { planId: string; intent: unknown }[]): Promise<void> {
    const derived = proposed.map(value => ({ planId: value.planId, intent: CanonicalIntentV2Schema.parse(value.intent) }));
    const adoptionDigest = hash("research-adoption", [...derived].sort((a, b) => a.planId.localeCompare(b.planId)));
    await this.attempts.mutate(token, async (sql, attempt, payload) => {
      if (attempt.kind === "RESEARCH_ADVICE" || !attempt.acceptedRequest.researchRequested || attempt.budget.profile !== "RESEARCH") reject("INTENT_CONFLICT", "Research adoption was not authorized by this planning request.", "RESEARCH");
      if (payload.researchAdoptionDigest) {
        if (payload.researchAdoptionDigest !== adoptionDigest) reject("IDEMPOTENCY_MISMATCH", "Research was already adopted from different findings.", "RESEARCH");
        return;
      }
      if (derived.length !== attempt.targets.length || new Set(derived.map(value => value.planId)).size !== derived.length || attempt.targets.some(target => !derived.some(value => value.planId === target.planId) || target.resolvedIntentVersionId)) reject("INTENT_CONFLICT", "Research resolution must bind every selected target once.", "RESEARCH");
      const plans = [];
      for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId))) plans.push(await ownedPlan(sql, attempt.ownerId, target.planId));
      const bindings = [];
      for (const target of attempt.targets) {
        const plan = plans.find(plan => plan.id === target.planId)!;
        const previous = await loadIntent(sql, attempt.ownerId, target.requestedIntentVersionId);
        const next = derived.find(value => value.planId === target.planId)!.intent;
        const unchangedFacts = (intent: CanonicalIntentV2) => Object.fromEntries(Object.entries(intent).filter(([key]) => !["scope", "research", "assessment"].includes(key)));
        if (hash("research-protected-facts", unchangedFacts(previous.intent)) !== hash("research-protected-facts", unchangedFacts(next))) reject("INTENT_CONFLICT", "Research cannot change deadlines, availability, goals, preferences or learning history.", "RESEARCH");
        for (const [key, value] of Object.entries(previous.intent.assessment ?? {})) if (Reflect.get(next.assessment ?? {}, key) !== value) reject("INTENT_CONFLICT", "Research conflicts with the accepted assessment identity; ask the student first.", "RESEARCH");
        for (const excluded of previous.intent.scope.filter(scope => scope.inclusion === "EXCLUDED")) if (!next.scope.some(scope => scope.scopeKey === excluded.scopeKey && scope.inclusion === "EXCLUDED")) reject("INTENT_CONFLICT", "Research cannot undo an explicit scope exclusion.", "RESEARCH");
        if (!next.research) reject("INVALID_OUTPUT", "Research adoption requires its provenance bundle.", "RESEARCH");
        const artifact = await appendIntent(sql, plan, next, "RESEARCH_ADOPTION");
        await sql.query('UPDATE "PlannerPlan" SET version=version+1 WHERE id=$1', [plan.id]);
        bindings.push({ ...target, resolvedIntentVersionId: artifact.intentVersionId, resolution: "RESEARCH_ADOPTION" as const, resolvedPlanningVersion: target.planningVersion + 1 });
      }
      const refreshedPlans = [];
      for (const plan of plans) refreshedPlans.push(await ownedPlan(sql, attempt.ownerId, plan.id));
      const targets = [];
      for (const target of bindings) {
        const next = derived.find(value => value.planId === target.planId)!.intent;
        const context = await loadExecutionContext(sql, attempt.ownerId, refreshedPlans, next);
        targets.push({ ...target, contextDigest: contextInputDigest(context.dependencies) });
      }
      await persistAttempt(sql, attempt, { ...attempt, targets }, { ...payload, researchAdoptionDigest: adoptionDigest });
    });
  }
  async publishResearchAnswer(token: LeaseToken, answer: string, evidence: unknown): Promise<void> {
    const bundle = ResearchEvidenceV2Schema.parse(evidence);
    await this.attempts.mutate(token, async (sql, attempt, payload) => {
      await verifyOwnedResearchDocuments(sql,attempt.ownerId,bundle);
      if (attempt.kind !== "RESEARCH_ADVICE") reject("INTENT_CONFLICT", "This operation was authorized to prepare a plan, not publish a research answer.", "RESEARCH");
      await persistAttempt(sql, attempt, { ...attempt, state: "SUCCEEDED", stage: "RESEARCH", lease: null,
        result: { kind: "RESEARCH_ANSWER", answer, evidenceDigest: hash("research-evidence", bundle) } }, { ...payload, researchEvidence: bundle });
    });
  }
  async resolveUnchanged(token: LeaseToken): Promise<void> {
    await this.attempts.mutate(token, async (sql, attempt, payload) => {
      if (attempt.kind === "RESEARCH_ADVICE") reject("INTENT_CONFLICT", "Read-only research cannot bind educational targets.", "RESEARCH");
      const plans = [];
      for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId))) plans.push(await ownedPlan(sql, attempt.ownerId, target.planId));
      const targets = [];
      for (const target of attempt.targets) {
        const intent = await loadIntent(sql, attempt.ownerId, target.requestedIntentVersionId);
        const context = await loadExecutionContext(sql, attempt.ownerId, plans, intent.intent);
        const resolved = { ...target, resolvedIntentVersionId: target.requestedIntentVersionId, resolution: "UNCHANGED" as const, resolvedPlanningVersion: target.planningVersion,
          contextDigest: contextInputDigest(context.dependencies) };
        if (target.resolvedIntentVersionId && JSON.stringify(target) !== JSON.stringify(resolved)) reject("STALE_CONTEXT", "This operation is already bound to a different context.");
        targets.push(resolved);
      }
      await persistAttempt(sql, attempt, { ...attempt, targets }, payload);
    });
  }
  async publishReviewed(token:LeaseToken):Promise<PlanChangeSetV2>{
    const prepared=await this.attempts.mutate(token,async(sql,attempt)=>{
      const retained=await reviewedPublication(sql,attempt),baseline=[];
      for(const target of attempt.targets){const plan=await ownedPlan(sql,attempt.ownerId,target.planId);if(plan.activeRevisionId){
        const row=(await rows<{v2Artifact:unknown}>(sql,'SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=$1',[plan.activeRevisionId]))[0];
        if(row?.v2Artifact)baseline.push(...(await loadRevision(sql,attempt.ownerId,plan.activeRevisionId)).executable);
        else baseline.push(...((plan.migrationEvidence as {baselineSpecs?:unknown[]}|null)?.baselineSpecs??[]).map(s=>ExecutionTaskSpecV2Schema.parse(s)));
      }}
      const a=retained.allocated,owned=retained.ownedLearning;
      const targets=owned.compilationTargets.map(t=>{const bound=attempt.targets.find(b=>b.planId===t.planId)!;return {...t,...bound,resolvedIntentVersionId:bound.resolvedIntentVersionId!,resolvedPlanningVersion:bound.resolvedPlanningVersion!};});
      const sealed=sealAllocatedExecution({blueprints:a.blueprints,allocation:{report:a.allocation,digest:hash("allocation",a.allocation)},envelope:a.envelope,planning:a.planning,quality:reviewedQuality(retained)},
        {ownerId:attempt.ownerId,attemptId:attempt.attemptId,requestHash:attempt.requestHash},targets,owned.liveSpecs,baseline,a.identities,new Map(owned.compilationTargets.map(t=>[t.planRef,t.sources])),(await clock(sql)).toISOString());
      assertReviewedRevisions(retained,sealed.revisions);return {...sealed,retained};
    });
    return this.publish(token,prepared.revisions,prepared.changeSet,prepared.retained.bundle);
  }
  async publish(token: LeaseToken, rawRevisions: unknown[], rawChangeSet: unknown, bundle?:z.infer<typeof RevisionIntelligenceBundleSchema>): Promise<PlanChangeSetV2> {
    const revisions = rawRevisions.map(raw => PlannerRevisionV2Schema.parse(raw));
    const changeSet = PlanChangeSetV2Schema.parse(rawChangeSet);
    if(bundle){const checked=await this.attempts.mutate(token,(sql,attempt)=>reviewedPublication(sql,attempt));
      if(hash("published-bundle",bundle)!==hash("published-bundle",checked.bundle))reject("QUALITY_INCOMPLETE","The reviewed candidate changed before source verification.");
      await verifyReviewedDocuments(checked,token.ownerId,this.documents);
    }
    return this.attempts.mutate(token, async (sql, attempt, payload) => {
      const version=await loadCompilerVersion(sql,attempt.attemptId);
      if(version===2&&payload.resourcePolicy?.journeyVersion!==1)await assertLegacyCompiler(sql,attempt.attemptId);
      const reviewed=version===2?await reviewedPublication(sql,attempt):null;
      if(reviewed){
        if(!bundle||hash("published-bundle",bundle)!==hash("published-bundle",reviewed.bundle))reject("QUALITY_INCOMPLETE","Only the exact current reviewed bundle can publish.");
        await lockPlanningCalendar(sql,attempt.ownerId);
        await new PlannerCalendarCapacity(this.attempts).assertCurrentAccepted(sql,attempt.ownerId,attempt.attemptId,{id:reviewed.capacity.id,digest:reviewed.capacity.digest});
        await verifyReviewedDocumentMetadata(sql,reviewed,attempt.ownerId);
        assertReviewedRevisions(reviewed,revisions);
        assertReviewedChangeSet(reviewed,changeSet);
        await sql.query("SELECT set_config('sylf.planner_reviewed_publication_version','1',true)");
      }else{await assertLegacyCompiler(sql, attempt.attemptId);if(bundle)reject("INVALID_OUTPUT","Legacy publication cannot acquire a new intelligence bundle.");}
      const successful = { ...attempt, state: "SUCCEEDED" as const, stage: "PERSISTENCE" as const, lease: null,
        result: { kind: "REVISIONS" as const, revisions: revisions.map(revision => ({ planId: revision.planId, revisionId: revision.revisionId, digest: revision.digest })) } };
      const errors = validateChangeSetCorrespondenceV2(changeSet, successful, revisions);
      if (errors.length || changeSet.applyReceipt) reject("INVALID_OUTPUT", errors.join("; ") || "A new proposal cannot have an apply receipt.");
      // Actual compiler output must correspond to the independently reviewed
      // checkpoint, including placement and server-assigned execution identity.
      // Older trusted Phase 1 producers keep their existing publication checks.
      if (payload.checkpoint && typeof payload.checkpoint === "object" && Reflect.get(payload.checkpoint, "compilerVersion") === 1) {
        const checkpoint = CompilerCheckpointSchema.parse(payload.checkpoint), reviewed = checkpoint.payload;
        if (!("quality" in reviewed) || !["REVIEW", "VERIFICATION"].includes(reviewed.stage) ||
          !["REVIEWED", "VERIFIED"].includes(reviewed.reviewSupport?.phase ?? "") || reviewed.quality.some(q => q.report.status !== "PASSED") ||
          reviewed.allocation.report.status !== "FEASIBLE" || attempt.checkpoint?.digest !== hash("checkpoint", checkpoint) || attempt.checkpoint.stage !== reviewed.stage ||
          checkpoint.binding.attemptId !== attempt.attemptId || checkpoint.binding.requestHash !== attempt.requestHash || checkpoint.binding.rootRequestId !== attempt.budget.rootRequestId ||
          checkpoint.binding.ownerId !== attempt.ownerId || checkpoint.binding.targetAuthorizationDigest !== attempt.acceptedRequest.targetAuthorizationDigest || !payload.providerGuard?.reviewCompleted || reviewed.reviewSupport?.identityDigest!==hash("compiler-identities",payload.compilerIdentities??[]) ||
          hash("allocation",reviewed.allocation.report)!==reviewed.allocation.digest || hash("scheduling-envelope",reviewed.envelope)!==checkpoint.binding.envelopeDigest)
          reject("QUALITY_INCOMPLETE", "Finish independently checking the exact allocated proposal before sealing.", "PERSISTENCE");
        for (const revision of revisions) {
          const target = checkpoint.binding.targets.find(t => t.planId === revision.planId);
          const approved = reviewed.blueprints.plans.find(p => p.planRef === target?.planRef);
          const quality = reviewed.quality.find(q => q.planRef === target?.planRef)?.report;
          if (!target || !approved || !quality || hash("blueprint", revision.blueprint) !== approved.digest || hash("quality-report", quality) !== hash("quality-report", revision.quality) ||
            hash("reviewed-context", target.context) !== hash("reviewed-context", revision.context) ||
            revision.executable.some(spec => { const placement = reviewed.allocation.report.placements.find(p => p.planRef === target.planRef && p.activityRef === spec.blueprintActivityId);
              const identity = payload.compilerIdentities?.find(i => i.planRef === target.planRef && i.activityRef === spec.blueprintActivityId);
              return !placement || spec.placement.date !== placement.date || spec.placement.timezone !== reviewed.envelope.timezone || spec.effort.plannedMinutes !== placement.minutes || identity?.activityKey !== spec.activityKey; }))
            reject("QUALITY_INCOMPLETE", "The sealed proposal differs from the reviewed content, identity or schedule.", "PERSISTENCE");
        }
        if (hash("aggregate-quality-issues", changeSet.quality.issues) !== hash("aggregate-quality-issues", reviewed.quality.flatMap(q => q.report.issues)) ||
          hash("aggregate-quality-acknowledgments", changeSet.quality.requiredAcknowledgements) !== hash("aggregate-quality-acknowledgments", reviewed.quality.flatMap(q => q.report.requiredAcknowledgements)))
          reject("QUALITY_INCOMPLETE", "Joint quality must retain every target's issues and acknowledgments.", "PERSISTENCE");
      }
      const plans = [];
      for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId))) plans.push(await ownedPlan(sql, attempt.ownerId, target.planId));
      for (const revision of revisions) {
        const target = attempt.targets.find(target => target.planId === revision.planId)!;
        const intent = (await loadIntent(sql, attempt.ownerId, revision.resolvedIntentVersionId)).intent;
        const context = await loadExecutionContext(sql, attempt.ownerId, plans, intent);
        if (target.contextDigest !== contextInputDigest(revision.context)) reject("STALE_CONTEXT", "The proposal belongs to a different operation context.");
        verifyContextCorrespondence(revision.context, context.dependencies, context.quests);
        const allowed=reviewed?.ownedLearning.targets.find(t=>t.planRef===reviewed.allocated.compiled.find(p=>p.planId===revision.planId)?.planRef)?.allowed;
        const referenceErrors = validateBlueprintReferences(revision.blueprint, {
          scopeRefs: intent.scope.map(scope => scope.modelRef), excludedScopeRefs: intent.scope.filter(scope => scope.inclusion === "EXCLUDED").map(scope => scope.modelRef),
          evidenceRefs: allowed?.evidenceRefs??[...intent.evidence.map(evidence => evidence.evidenceId),...intent.research?.claims.map(claim=>claim.claimId)??[],...savedCheckReferences(context,revision.planId).map(check=>check.ref)],
          resourceRefs: allowed?.resourceRefs??intent.research?.sources.map(source => source.sourceId) ?? [],
          externalActivityRefs: revision.context.externalActivityDependencies.map(dependency => externalActivityAlias(dependency.activityKey)),
        });
        if (referenceErrors.length) reject("REFERENCE_NOT_OWNED", referenceErrors.join("; "));
        for (const spec of revision.executable) for (const resource of spec.content.resources) {
          const source = reviewed?.ownedLearning.compilationTargets.find(t=>t.planId===revision.planId)?.sources.find(s=>s.sourceId===resource.ref)??intent.research?.sources.find(source => source.sourceId === resource.ref);
          if (!source || resource.versionDigest !== source.contentHash) reject("REFERENCE_NOT_OWNED", "An educational resource does not match its accepted owned source.");
        }
        if (revision.digest !== revisionDigest(revision) || revision.quality.educationalContentDigest !== educationalDigest(revision) || revision.quality.evidenceDigest !== qualityEvidenceDigest(intent)) reject("QUALITY_INCOMPLETE", "The quality review does not attest to this educational content and evidence.");
        const sequence = (await rows<{ sequence: number }>(sql, 'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM "PlannerRevision" WHERE "planId"=$1', [revision.planId]))[0].sequence;
        await sql.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseRevisionId","baseVersion","schemaVersion","attemptId","requestedIntentVersionId","resolvedIntentVersionId","v2Artifact","intelligenceBundle","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,$3,\'GENERATE\',$4,$5,2,$6,$7,$8,$9,$14,\'{}\',\'{}\',\'{}\',$10,$11,$12,\'SEALED\',$13,clock_timestamp())',
          [revision.revisionId, revision.planId, sequence, revision.baseActiveRevisionId, target.resolvedPlanningVersion, attempt.attemptId, revision.requestedIntentVersionId, revision.resolvedIntentVersionId, revision, revision.digest, attempt.idempotencyKey, attempt.requestHash, revision.sealedAt, bundle??null]);
        await sql.query('UPDATE "PlannerPlan" SET "latestDraftRevisionId"=$2,"updatedAt"=clock_timestamp() WHERE id=$1', [revision.planId, revision.revisionId]);
      }
      // All selected targets share one capacity check, including joint proposals.
      const targets = [];
      for (const revision of revisions) targets.push({ plan: plans.find(plan => plan.id === revision.planId)!, intent: (await loadIntent(sql, attempt.ownerId, revision.resolvedIntentVersionId)).intent, specs: revision.executable });
      const context = await loadExecutionContext(sql, attempt.ownerId, plans, targets[0].intent);
      verifyPlacement(context, targets);
      verifyExecutionGraph(context, revisions);
      await persistAttempt(sql, attempt, successful, { ...payload, changeSet });
      return changeSet;
    });
  }
}
