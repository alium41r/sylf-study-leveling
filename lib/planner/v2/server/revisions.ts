import {
  PlannerRevisionV2Schema, PlanChangeSetV2Schema, validateChangeSetCorrespondenceV2,
  type PlannerRevisionV2, type PlanChangeSetV2, type CanonicalIntentV2,
  validateBlueprintReferences,
  CanonicalIntentV2Schema, ResearchEvidenceV2Schema,
} from "../contracts";
import { verifyOwnedResearchDocuments } from "./documents";
import { rows, hash, reject, type Sql } from "./database";
import { AttemptService, persistAttempt, type LeaseToken } from "./attempts";
import { appendIntent, loadIntent, ownedPlan } from "./intents";
import { loadExecutionContext, verifyContextCorrespondence, verifyPlacement, contextInputDigest, externalActivityAlias, savedCheckReferences } from "./context";
import { verifyExecutionGraph } from "./execution-validation";
import { CompilerCheckpointSchema } from "../intelligence/schemas/checkpoint";

export const revisionDigest = (revision: PlannerRevisionV2): string => {
  return hash("revision", Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "digest")));
};
export const educationalDigest = (revision: PlannerRevisionV2): string => hash("educational-content", { blueprint: revision.blueprint, externalDependencies: revision.context.externalActivityDependencies });
export const qualityEvidenceDigest = (intent: CanonicalIntentV2): string => hash("quality-evidence", { evidence: intent.evidence, research: intent.research ?? null });
export async function loadRevision(sql: Sql, ownerId: number, revisionId: string): Promise<PlannerRevisionV2> {
  const row = (await rows<{ v2Artifact: unknown }>(sql, 'SELECT r."v2Artifact" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE r.id=$1::uuid AND p."userId"=$2', [revisionId, ownerId]))[0];
  if (!row?.v2Artifact) reject("REFERENCE_NOT_OWNED", "A sealed V2 revision is unavailable.");
  const artifact = PlannerRevisionV2Schema.parse(row.v2Artifact);
  if (artifact.digest !== revisionDigest(artifact)) reject("INVALID_OUTPUT", "The sealed revision failed its integrity check.");
  return artifact;
}
/** Only trusted worker orchestration calls this. No public client may attest quality. */
export class RevisionService {
  constructor(readonly attempts: AttemptService) {}
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
  async publish(token: LeaseToken, rawRevisions: unknown[], rawChangeSet: unknown): Promise<PlanChangeSetV2> {
    const revisions = rawRevisions.map(raw => PlannerRevisionV2Schema.parse(raw));
    const changeSet = PlanChangeSetV2Schema.parse(rawChangeSet);
    return this.attempts.mutate(token, async (sql, attempt, payload) => {
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
        const referenceErrors = validateBlueprintReferences(revision.blueprint, {
          scopeRefs: intent.scope.map(scope => scope.modelRef), excludedScopeRefs: intent.scope.filter(scope => scope.inclusion === "EXCLUDED").map(scope => scope.modelRef),
          evidenceRefs: [...intent.evidence.map(evidence => evidence.evidenceId),...intent.research?.claims.map(claim=>claim.claimId)??[],...savedCheckReferences(context,revision.planId).map(check=>check.ref)],
          resourceRefs: intent.research?.sources.map(source => source.sourceId) ?? [],
          externalActivityRefs: revision.context.externalActivityDependencies.map(dependency => externalActivityAlias(dependency.activityKey)),
        });
        if (referenceErrors.length) reject("REFERENCE_NOT_OWNED", referenceErrors.join("; "));
        for (const spec of revision.executable) for (const resource of spec.content.resources) {
          const source = intent.research?.sources.find(source => source.sourceId === resource.ref);
          if (!source || resource.versionDigest !== source.contentHash) reject("REFERENCE_NOT_OWNED", "An educational resource does not match its accepted owned source.");
        }
        if (revision.digest !== revisionDigest(revision) || revision.quality.educationalContentDigest !== educationalDigest(revision) || revision.quality.evidenceDigest !== qualityEvidenceDigest(intent)) reject("QUALITY_INCOMPLETE", "The quality review does not attest to this educational content and evidence.");
        const sequence = (await rows<{ sequence: number }>(sql, 'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM "PlannerRevision" WHERE "planId"=$1', [revision.planId]))[0].sequence;
        await sql.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseRevisionId","baseVersion","schemaVersion","attemptId","requestedIntentVersionId","resolvedIntentVersionId","v2Artifact","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,$3,\'GENERATE\',$4,$5,2,$6,$7,$8,$9,\'{}\',\'{}\',\'{}\',$10,$11,$12,\'SEALED\',$13,clock_timestamp())',
          [revision.revisionId, revision.planId, sequence, revision.baseActiveRevisionId, target.resolvedPlanningVersion, attempt.attemptId, revision.requestedIntentVersionId, revision.resolvedIntentVersionId, revision, revision.digest, attempt.idempotencyKey, attempt.requestHash, revision.sealedAt]);
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
