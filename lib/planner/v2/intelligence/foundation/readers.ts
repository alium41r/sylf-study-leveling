import type { PlannerAttemptV2 } from "../../contracts";
import { hash } from "../../server/database";
import { readHistoricalCompilerCheckpoint } from "../checkpoints";
import { RevisionIntelligenceBundleSchema, type FoundationArchive, type FoundationArtifact } from "./contracts";
import { archiveDigest, candidateDigest, validateArchive, reviewedCandidateBinding, retainedLearningInput, educationDigest, type LearningCheckpoint } from "./validation";
import { readFoundationCheckpoint, recoveryAction } from "./workflow";

export function readRetainedArchive(raw: unknown, attempt: PlannerAttemptV2) {
  const archive = validateArchive(raw ?? { schemaVersion: 1, compilerVersion: 2, entries: {} });
  for (const artifact of Object.values(archive.entries)) {
    if (artifact.ownerId !== attempt.ownerId || artifact.attemptId !== attempt.attemptId ||
      hash("selected-plans", artifact.planIds) !== hash("selected-plans", attempt.targets.map(t => t.planId))) throw new Error("ARTIFACT_OWNER_MISMATCH");
    if (artifact.kind === "DOSSIER" && (artifact.value.acceptedInstructionDigest !== hash("accepted-instruction-v1", attempt.acceptedRequest) ||
      artifact.value.targets.length !== attempt.targets.length || artifact.value.targets.some(t => !attempt.targets.some(owned => owned.planId === t.planId &&
        owned.requestedIntentVersionId === t.requestedIntentId && owned.resolvedIntentVersionId === t.resolvedIntentId && owned.contextDigest === t.contextDigest)))) throw new Error("DOSSIER_ATTEMPT_MISMATCH");
  }
  return archive;
}

/** Missing old compiler metadata is legacy core data, never a v2 checkpoint. */
export function readVersionedArtifacts(input: { compilerVersion: 1 | 2; attempt: PlannerAttemptV2; archive: unknown; checkpoint: unknown }) {
  if (input.compilerVersion === 1) {
    if (input.archive != null) throw new Error("COMPILER_ARTIFACT_VERSION_MISMATCH");
    const version = input.checkpoint && typeof input.checkpoint === "object" ? Reflect.get(input.checkpoint, "compilerVersion") : undefined;
    if (version === undefined) {
      if ((input.checkpoint != null) !== (input.attempt.checkpoint !== null) || input.attempt.checkpoint && input.attempt.checkpoint.digest !== hash("checkpoint", input.checkpoint)) throw new Error("CHECKPOINT_DIGEST_MISMATCH");
      return { schemaVersion: 1 as const, compilerVersion: 1 as const, kind: "LEGACY_CORE" as const, checkpoint: input.attempt.checkpoint };
    }
    const read = readHistoricalCompilerCheckpoint(input.checkpoint, input.attempt);
    if (!read.ok) throw new Error(read.reason);
    return { schemaVersion: 1 as const, compilerVersion: 1 as const, kind: "LEGACY_COMPILER" as const, checkpoint: read.checkpoint };
  }
  if (input.compilerVersion !== 2) throw new Error("UNSUPPORTED_COMPILER_VERSION");
  if (input.checkpoint != null) throw new Error("COMPILER_ARTIFACT_VERSION_MISMATCH");
  const archive = readRetainedArchive(input.archive, input.attempt);
  const checkpoints = Object.values(archive.entries).filter(a => a.kind === "CHECKPOINT");
  const heads = checkpoints.filter(a => !checkpoints.some(next => next.value.previous?.id === a.id));
  if (checkpoints.length && heads.length !== 1) throw new Error("CHECKPOINT_HISTORY_INVALID");
  const seen = new Set<string>();
  let cursor = heads[0];
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error("CHECKPOINT_HISTORY_INVALID");
    seen.add(cursor.id);
    cursor = checkpoints.find(a => a.id === cursor.value.previous?.id)!;
  }
  if (seen.size !== checkpoints.length) throw new Error("CHECKPOINT_HISTORY_INVALID");
  const checkpoint = heads.length ? readFoundationCheckpoint(heads[0].value, input.attempt) : null;
  return { schemaVersion: 1 as const, compilerVersion: 2 as const, kind: "AI_FIRST" as const, archive, digest: archiveDigest(archive),
    checkpoint, recovery: checkpoint ? recoveryAction(checkpoint) : "RESUME_STAGE" as const };
}

export function retainedArtifact<K extends FoundationArtifact["kind"]>(archive: FoundationArchive, ref: { id: string; digest: string }, kind: K): Extract<FoundationArtifact, { kind: K }> {
  const artifact = archive.entries[ref.id];
  if (!artifact || artifact.kind !== kind || artifact.digest !== ref.digest) throw new Error("ARTIFACT_CORRESPONDENCE");
  return artifact as Extract<FoundationArtifact, { kind: K }>;
}

/** Read the exact sealed versions, never the latest draft. This is historical
 * correspondence verification, not live permission to publish or apply. */
export function readRetainedBundle(raw: unknown, archive: FoundationArchive) {
  validateArchive(archive);
  const bundle = RevisionIntelligenceBundleSchema.parse(raw), { digest, ...body } = bundle;
  if (digest !== hash("revision-intelligence-v1", body) || bundle.candidateDigest !== candidateDigest(bundle.binding)) throw new Error("INTELLIGENCE_BUNDLE_DIGEST_MISMATCH");
  if(bundle.schemaVersion===2)return readReviewedBundle(bundle,archive);
  const dossier = retainedArtifact(archive, bundle.binding.dossier, "DOSSIER");
  if(!dossier.value.capacity) throw new Error("DOSSIER_CAPACITY_PENDING");
  const capacity = retainedArtifact(archive, dossier.value.capacity, "CAPACITY");
  const strategies = bundle.binding.strategies.map(ref => retainedArtifact(archive, ref, "STRATEGY"));
  const translation = retainedArtifact(archive, bundle.binding.translation, "TRANSLATION");
  const review = retainedArtifact(archive, bundle.review, "REVIEW");
  const issues = bundle.binding.issueHeads.map(ref => retainedArtifact(archive, ref, "ISSUE"));
  if ([dossier, capacity, ...strategies, translation, review, ...issues].some(a => a.attemptId !== bundle.archiveAttemptId) ||
    strategies.some(s => s.value.dossier.id !== dossier.id || s.value.dossier.digest !== dossier.digest) ||
    hash("strategy-refs", translation.value.strategies) !== hash("strategy-refs", bundle.binding.strategies) ||
    translation.value.blueprintDigest !== bundle.binding.blueprintDigest || dossier.value.constraintsDigest !== bundle.binding.constraintsDigest ||
    dossier.value.calendarDigest !== bundle.binding.calendarDigest || review.value.candidateDigest !== bundle.candidateDigest ||
    review.value.verdict !== "APPROVED" || !review.value.completeResultInspected ||
    [...strategies, translation].some(a => a.value.producer.callId === review.value.producer.callId) ||
    hash("issue-heads", review.value.issueHeads) !== hash("issue-heads", bundle.binding.issueHeads)) throw new Error("INTELLIGENCE_BUNDLE_CORRESPONDENCE");
  return { bundle, dossier, capacity, strategies, translation, review, issues };
}

/** Executable bundle-v2 meaning is explicit. Bundle v1 keeps its historical
 * one-dossier interpretation and never acquires this execution authority. */
export function readReviewedBundle(raw:unknown,archive:FoundationArchive){
  validateArchive(archive);const bundle=RevisionIntelligenceBundleSchema.parse(raw);
  if(bundle.schemaVersion!==2)throw new Error("REVIEWED_BUNDLE_VERSION_REQUIRED");
  const {digest,...body}=bundle,binding=bundle.binding;
  if(digest!==hash("revision-intelligence-v1",body)||bundle.candidateDigest!==candidateDigest(binding)||
    hash("reviewed-bundle-binding",binding)!==hash("reviewed-bundle-binding",reviewedCandidateBinding(archive,binding.allocation,binding.issueHeads)))throw new Error("REVIEWED_BUNDLE_BINDING_CHANGED");
  const allocation=retainedArtifact(archive,binding.allocation,"CHECKPOINT") as LearningCheckpoint;
  const dossier=retainedArtifact(archive,binding.dossier,"DOSSIER");if(dossier.value.schemaVersion!==3||dossier.value.unresolved.some(g=>g.consequential))throw new Error("REVIEWED_RESEARCH_NOT_READY");
  const research=retainedArtifact(archive,dossier.value.research,"DOSSIER"),capacity=retainedArtifact(archive,dossier.value.capacity,"CAPACITY");
  if(research.value.schemaVersion!==2||capacity.value.schemaVersion!==2||capacity.value.status!=="READY"||allocation.value.learning.capacity.digest!==capacity.digest||allocation.value.learning.dossier.digest!==dossier.digest||allocation.value.learning.allocated?.allocation.status!=="FEASIBLE")throw new Error("REVIEWED_ALLOCATION_REQUIRED");
  const strategies=binding.strategies.map(ref=>retainedArtifact(archive,ref,"STRATEGY")),translation=retainedArtifact(archive,binding.translation,"TRANSLATION"),review=retainedArtifact(archive,bundle.review,"REVIEW"),issues=binding.issueHeads.map(ref=>retainedArtifact(archive,ref,"ISSUE"));
  if([dossier,research,capacity,allocation,...strategies,translation,review,...issues].some(a=>a.attemptId!==bundle.archiveAttemptId)||
    review.value.schemaVersion!==2||review.value.verdict!=="APPROVED"||!review.value.completeResultInspected||review.value.candidateDigest!==bundle.candidateDigest||
    hash("reviewed-bundle-binding",review.value.binding)!==hash("reviewed-bundle-binding",binding)||
    translation.value.schemaVersion!==2||translation.value.capacity.digest!==capacity.digest||translation.value.ambiguities.length||translation.value.elements.some(e=>e.disposition==="GAP")||
    strategies.some(s=>s.value.schemaVersion!==2)||hash("strategy-refs",translation.value.strategies)!==hash("strategy-refs",binding.strategies)||[...strategies,translation].some(a=>a.value.producer.callId===review.value.producer.callId))throw new Error("EXACT_REVIEWED_BUNDLE_REQUIRED");
  for(const strategy of strategies){
    const origin=retainedArtifact(archive,strategy.value.dossier,"DOSSIER");if(origin.value.schemaVersion!==3||origin.value.research.digest!==research.digest)throw new Error("STRATEGY_RESEARCH_LINEAGE_CHANGED");
    let cursor:FoundationArtifact|undefined=capacity;let found=false;const seen=new Set<string>();
    while(cursor?.kind==="CAPACITY"&&cursor.value.schemaVersion===2&&!seen.has(cursor.id)){seen.add(cursor.id);if(cursor.digest===origin.value.capacity.digest){found=true;break;}cursor=cursor.value.previous?archive.entries[cursor.value.previous.id]:undefined;}
    if(!found)throw new Error("STRATEGY_CAPACITY_LINEAGE_CHANGED");
  }
  if(issues.some(i=>i.value.schemaVersion!==2||i.value.candidateDigest!==educationDigest(binding)||i.value.severity==="BLOCKING"&&!["VERIFIED_RESOLVED","WITHDRAWN"].includes(i.value.disposition)))throw new Error("REVIEWED_ISSUE_VERIFICATION_STALE");
  return {bundle,dossier:{...dossier,value:dossier.value},research:{...research,value:research.value},capacity:{...capacity,value:capacity.value},allocation,allocated:allocation.value.learning.allocated!,strategies,
    translation:{...translation,value:translation.value},review:{...review,value:review.value},issues,ownedLearning:retainedLearningInput(archive,allocation)};
}
