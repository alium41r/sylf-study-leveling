import { randomUUID } from "node:crypto";
import { hash } from "../../server/database";
import type { LearningBlueprintV2 } from "../../contracts/blueprint";
import { AllocationReportSchema } from "../schemas/scheduling";
import { ExecutionTaskSpecV2Schema } from "../../contracts/execution";
import { validateCalendarAllocation } from "./calendar";
import { allocateLearning } from "../allocator";
import { compileExecution } from "../../server/compilation";
import { learningEnvelope } from "../../server/learning";
import { naturalRoleInputV1, learningRoleCall } from "../natural-learning";
import { reviewedRoleCall, reviewedRoleInputV1 } from "../reviewed-learning";
import { FoundationArchiveSchema, FoundationArtifactSchema, StrategyDocumentSchema, RevisionIntelligenceBundleSchema, ReviewedCandidateBindingSchema, type FoundationArtifact, type FoundationArchive, type StrategyDocument, type TranslationReceipt, type CandidateBinding, type IssueEvent } from "./contracts";
import { readReviewedBundle } from "./readers";

export const artifactRef = (artifact: FoundationArtifact) => ({ id: artifact.id, digest: artifact.digest });
export const archiveDigest = (archive: FoundationArchive) => hash("ai-first-archive-v1", archive);
export const candidateDigest = (binding: CandidateBinding) => hash("ai-first-candidate-v1", binding);
/** Issue verification covers education without a circular dependency on the
 * issue-event digest. Final review additionally binds the complete issue heads. */
export const educationDigest = (binding: CandidateBinding) => hash("ai-first-education-v1", { ...binding, issueHeads: [] });
export function sealFoundationArtifact(input: Omit<FoundationArtifact, "digest">): FoundationArtifact {
  return FoundationArtifactSchema.parse({ ...input, digest: hash("ai-first-artifact-v1", input) });
}
export function strategyDocument(input: Omit<Extract<StrategyDocument, { schemaVersion: 1 }>, "anchors"> | Omit<Extract<StrategyDocument, { schemaVersion: 2 }>, "anchors">): StrategyDocument {
  // UTF-16 offsets into the exact retained text, local to this immutable version.
  const spans = [...input.text.matchAll(/[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*/g)];
  const anchors = spans.map((match, i) => ({ ref: `p${i + 1}`, start: match.index!, end: match.index! + match[0].length, textDigest: hash("strategy-span-v1", match[0]) }));
  return StrategyDocumentSchema.parse({ ...input, anchors });
}
function requireArtifact(archive: FoundationArchive, ref: { id: string; digest: string }, kind?: FoundationArtifact["kind"]): FoundationArtifact {
  const artifact = archive.entries[ref.id];
  if (!artifact || artifact.digest !== ref.digest || kind && artifact.kind !== kind) throw new Error("ARTIFACT_CORRESPONDENCE");
  return artifact;
}
export type NaturalCheckpoint = Extract<FoundationArtifact, { kind: "CHECKPOINT" }> & { value: { schemaVersion: 2 } };
export type ReviewedCheckpoint = Extract<FoundationArtifact, { kind: "CHECKPOINT" }> & { value: { schemaVersion: 3 } };
export type LearningCheckpoint = NaturalCheckpoint | ReviewedCheckpoint;
export type AnyLearningCheckpoint = LearningCheckpoint;
export function retainedLearningInput(archive: FoundationArchive, checkpoint: AnyLearningCheckpoint) {
  if (checkpoint.value.learning.snapshot) return checkpoint.value.learning.snapshot;
  const root = requireArtifact(archive, checkpoint.value.learning.input!, "CHECKPOINT");
  if (root.kind !== "CHECKPOINT" || root.value.schemaVersion !== 2 || !root.value.learning.snapshot || root.value.learning.input) throw new Error("LEARNING_INPUT_CORRESPONDENCE");
  return root.value.learning.snapshot;
}
export function retainedLearningCall(archive: FoundationArchive, checkpoint: LearningCheckpoint) {
  if(checkpoint.value.schemaVersion===3&&checkpoint.value.learning.call?.protocolVersion===2){
    const c=checkpoint.value.learning.call;
    return reviewedRoleCall(c.role,c.key,c.purpose,c.systemInstruction,reviewedRoleInputV1(archive,checkpoint as ReviewedCheckpoint),c.outputCap,c.responseContract);
  }
  const l = checkpoint.value.learning, input = retainedLearningInput(archive, checkpoint), dossier = requireArtifact(archive, l.dossier, "DOSSIER"), capacity = requireArtifact(archive, l.capacity, "CAPACITY");
  if (dossier.kind !== "DOSSIER" || dossier.value.schemaVersion !== 3 || capacity.kind !== "CAPACITY" || capacity.value.schemaVersion !== 2 || capacity.value.status !== "READY" || dossier.value.capacity.id !== capacity.id) throw new Error("LEARNING_CAPACITY_CORRESPONDENCE");
  const research = requireArtifact(archive, dossier.value.research, "DOSSIER");
  if (research.kind !== "DOSSIER" || research.value.schemaVersion !== 2) throw new Error("LEARNING_RESEARCH_CORRESPONDENCE");
  const strategy = l.strategy ? requireArtifact(archive, l.strategy, "STRATEGY") : null;
  if (l.call?.role === "TRANSLATOR" && strategy?.kind !== "STRATEGY") throw new Error("TRANSLATION_WITHOUT_STRATEGY");
  if (!l.call || l.call.protocolVersion!==1) throw new Error("LEARNING_CALL_REQUIRED");
  if ((l.call.role === "STRATEGIST") !== (l.call.responseContract === null)) throw new Error("LEARNING_CALL_PROTOCOL_MISMATCH");
  return learningRoleCall(l.call.role, l.call.key, l.call.systemInstruction,
    naturalRoleInputV1(research.value, dossier.value, capacity.value, input, l.call.role === "TRANSLATOR" && strategy?.kind === "STRATEGY" ? strategy.value : undefined, l.call.responseContract ?? undefined), l.call.outputCap);
}
export function assertIssueTransition(previous: IssueEvent | undefined, next: IssueEvent): void {
  if (!previous) { if (next.previous !== null || next.disposition !== "OPEN"&&!(next.schemaVersion===2&&next.inherited)) throw new Error("ISSUE_MUST_OPEN"); return; }
  if(previous.schemaVersion!==next.schemaVersion)throw new Error("ISSUE_VERSION_CANNOT_CHANGE");
  if(previous.schemaVersion===2&&next.schemaVersion===2&&(previous.consequence!==next.consequence||hash("issue-original-finding",previous.finding)!==hash("issue-original-finding",next.finding)||
    hash("issue-inheritance",previous.inherited??null)!==hash("issue-inheritance",next.inherited??null)))throw new Error("ISSUE_HISTORY_PROVENANCE_CHANGED");
  if(previous.schemaVersion===2&&next.schemaVersion===2&&previous.disposition==="OPEN"&&next.disposition==="OPEN"&&previous.issueId===next.issueId&&
    previous.severity===next.severity&&previous.requirement===next.requirement&&previous.offendingContent===next.offendingContent&&next.previous&&
    previous.producerCallId!==next.producerCallId&&previous.input.digest!==next.input.digest)return;
  if (previous.schemaVersion === 2 && next.schemaVersion === 2 && previous.disposition === next.disposition && ["VERIFIED_RESOLVED", "WITHDRAWN"].includes(previous.disposition) &&
    previous.candidateDigest !== next.candidateDigest && previous.issueId === next.issueId && next.previous && previous.severity === next.severity && previous.requirement === next.requirement &&
    previous.offendingContent === next.offendingContent && previous.consequence === next.consequence && hash("stable-issue-finding",previous.finding) === hash("stable-issue-finding",next.finding)) return;
  if (!next.previous || previous.issueId !== next.issueId || previous.severity !== next.severity || previous.requirement !== next.requirement || previous.offendingContent !== next.offendingContent ||
    !({ OPEN: ["ADDRESSED", "WITHDRAWN"], ADDRESSED: ["OPEN", "VERIFIED_RESOLVED", "WITHDRAWN"], VERIFIED_RESOLVED: [], WITHDRAWN: [] }[previous.disposition] as string[]).includes(next.disposition)) throw new Error("INVALID_ISSUE_TRANSITION");
}
export function currentIssueHeads(archive: FoundationArchive) {
  const issues=Object.values(archive.entries).filter(a=>a.kind==="ISSUE");
  return issues.filter(a=>!issues.some(next=>next.value.previous?.id===a.id)).sort((a,b)=>a.value.issueId.localeCompare(b.value.issueId));
}
/** Deterministic placement progress excludes search counters, fresh clocks and
 * provider identities. An unchanged rerun cannot manufacture a repair. */
export function allocationCorrectionChanged(archive:FoundationArchive,candidate:ReviewedCheckpoint){
  const previous=candidate.value.workflow.candidate?requireArtifact(archive,candidate.value.workflow.candidate,"CHECKPOINT"):null;
  if(previous?.kind!=="CHECKPOINT"||previous.value.schemaVersion===1||!previous.value.learning.allocated||!candidate.value.learning.allocated)return false;
  if(authoredEducationDigest(archive,artifactRef(candidate))!==authoredEducationDigest(archive,artifactRef(previous)))throw new Error("ALLOCATION_CANNOT_REAUTHOR_EDUCATION");
  const allocation=(a:NonNullable<LearningCheckpoint["value"]["learning"]["allocated"]>)=>({status:a.allocation.status,placements:a.allocation.placements,unscheduled:a.allocation.unscheduled,
    witness:a.allocation.calendarAllocation?.witness??null,proof:a.allocation.capacityProof});
  return hash("allocation-correction-v1",allocation(previous.value.learning.allocated))!==hash("allocation-correction-v1",allocation(candidate.value.learning.allocated));
}
export function authoredEducationDigest(archive:FoundationArchive,allocation:{id:string;digest:string}){
  const candidate=requireArtifact(archive,allocation,"CHECKPOINT") as LearningCheckpoint,l=candidate.value.learning;
  if(!l.allocated||!l.strategy)throw new Error("COMPLETE_EDUCATION_REQUIRED");
  const strategy=requireArtifact(archive,l.strategy,"STRATEGY");if(strategy.kind!=="STRATEGY")throw new Error("STRATEGY_REQUIRED");
  return hash("authored-education-v1",{text:strategy.value.text,blueprints:l.allocated.blueprints});
}
/** New bindings name the actual allocation artifact and preserve an author's
 * original dossier when a later Calendar-only capture changes the schedule. */
export function reviewedCandidateBinding(archive: FoundationArchive, allocation: {id:string;digest:string}, issueHeads = currentIssueHeads(archive).map(artifactRef)) {
  const candidate=requireArtifact(archive,allocation,"CHECKPOINT");
  if(candidate.kind!=="CHECKPOINT"||candidate.value.schemaVersion===1||candidate.value.stage!=="ALLOCATION"||!candidate.value.learning.allocated||!candidate.value.learning.strategy||!candidate.value.learning.translation)throw new Error("ALLOCATED_REVIEW_CANDIDATE_REQUIRED");
  const l=candidate.value.learning,a=l.allocated!,input=retainedLearningInput(archive,candidate as AnyLearningCheckpoint),dossier=requireArtifact(archive,l.dossier,"DOSSIER"),capacity=requireArtifact(archive,l.capacity,"CAPACITY");
  if(dossier.kind!=="DOSSIER"||dossier.value.schemaVersion!==3||capacity.kind!=="CAPACITY"||capacity.value.schemaVersion!==2||capacity.value.status!=="READY"||dossier.value.capacity.digest!==capacity.digest)throw new Error("REVIEWED_CAPACITY_REQUIRED");
  const strategies=[l.strategy!],translation=requireArtifact(archive,l.translation!,"TRANSLATION");
  const blueprints=a.blueprints.plans.map(p=>({planId:input.compilationTargets.find(t=>t.planRef===p.planRef)!.planId,blueprint:p.blueprint}));
  const binding=ReviewedCandidateBindingSchema.parse({schemaVersion:2,allocation,dossier:l.dossier,strategies,translation:l.translation,
    blueprintDigest:hash("ai-first-blueprints-v1",blueprints),allocationDigest:hash("ai-first-allocation-v1",a.allocation),executionDigest:hash("ai-first-execution-v1",a.compiled.flatMap(p=>p.specs)),
    constraintsDigest:hash("ai-first-constraints-v1",capacity.value.constraints),calendarDigest:hash("ai-first-calendar-v1",capacity.value.calendar),issueHeads});
  if(translation.kind!=="TRANSLATION"||translation.value.schemaVersion!==2||translation.value.capacity.digest!==capacity.digest||translation.value.blueprintDigest!==binding.blueprintDigest||hash("strategy-refs",translation.value.strategies)!==hash("strategy-refs",strategies))throw new Error("REVIEWED_TRANSLATION_CHANGED");
  return binding;
}
/** Content-based progress: fresh server UUIDs/producer receipts do not make an
 * unchanged educational proposal or repeated objection into useful progress. */
export function reviewProgressDigest(archive: FoundationArchive, binding: Extract<CandidateBinding,{schemaVersion:2}>) {
  const candidate=requireArtifact(archive,binding.allocation,"CHECKPOINT") as AnyLearningCheckpoint,a=candidate.value.learning.allocated!;
  const strategies=binding.strategies.map(ref=>{const s=requireArtifact(archive,ref,"STRATEGY");return s.kind==="STRATEGY"?s.value.text:null;});
  const capacity=requireArtifact(archive,candidate.value.learning.capacity,"CAPACITY");
  const issues=binding.issueHeads.map(ref=>{const i=requireArtifact(archive,ref,"ISSUE");if(i.kind!=="ISSUE")throw new Error("ISSUE_REQUIRED");return {disposition:i.value.disposition,severity:i.value.severity,route:i.value.route,requirement:i.value.requirement,offendingContent:i.value.offendingContent,consequence:i.value.consequence};}).sort((a,b)=>hash("issue-progress",a).localeCompare(hash("issue-progress",b)));
  const placementConcern=issues.some(i=>i.route==="ALLOCATION"&&["OPEN","ADDRESSED"].includes(i.disposition));
  const real=capacity.kind==="CAPACITY"&&capacity.value.schemaVersion===2?capacity.value:null;
  // A fresh capture time or shrinking unused window is not an educational
  // correction. Keep actual geometry when placement itself is the named issue;
  // always retain changes in feasibility, owned facts and real source versions.
  const allocation={status:a.allocation.status,placements:a.allocation.placements,unscheduled:a.allocation.unscheduled,committedMinutes:a.allocation.committedMinutes,
    ...(placementConcern?{geometry:a.allocation.calendarAllocation?{status:a.allocation.calendarAllocation.status,tasks:a.allocation.calendarAllocation.tasks,witness:a.allocation.calendarAllocation.witness,proof:a.allocation.calendarAllocation.proof}:null,proof:a.allocation.capacityProof}:{})};
  const capacityEvidence=real?{window:real.window,contextDigests:real.contextDigests,timezone:real.calendar?.timezone,intent:real.calendar?.intentDigest,acceptedWindows:real.calendar?.acceptedWindowsDigest,
    sources:real.calendar?.sources.map(({ref,versionDigest,includedInPlanning,complete})=>({ref,versionDigest,includedInPlanning,complete}))}:null;
  return hash("complete-review-progress-v1",{strategies,blueprints:a.blueprints,allocation,capacity:capacityEvidence,issues});
}
export function validateArchive(raw: unknown): FoundationArchive {
  const archive = FoundationArchiveSchema.parse(raw);
  const first = Object.values(archive.entries)[0];
  const issueChildren = new Set<string>(), issueRoots = new Set<string>(), strategyChildren = new Set<string>(), capacityChildren = new Set<string>(), capacityRoots = new Set<string>(), translationChildren = new Set<string>();
  let learningRoots = 0;
  for (const [key, artifact] of Object.entries(archive.entries)) {
    const { digest, ...body } = artifact;
    if (key !== artifact.id || digest !== hash("ai-first-artifact-v1", body)) throw new Error("ARTIFACT_DIGEST_MISMATCH");
    if (first && (artifact.ownerId !== first.ownerId || artifact.attemptId !== first.attemptId || JSON.stringify(artifact.planIds) !== JSON.stringify(first.planIds))) throw new Error("ARTIFACT_OWNER_MISMATCH");
    if (artifact.kind === "DOSSIER") {
      if (artifact.value.capacity) {
        const capacity = requireArtifact(archive, artifact.value.capacity, "CAPACITY");
        if (capacity.kind !== "CAPACITY" || artifact.value.calendarDigest !== hash("ai-first-calendar-v1", capacity.value.calendar) || artifact.value.constraintsDigest !== hash("ai-first-constraints-v1", capacity.value.constraints)) throw new Error("DOSSIER_CAPACITY_CHANGED");
        if (artifact.value.schemaVersion === 3) {
          const research = requireArtifact(archive, artifact.value.research, "DOSSIER");
          if (research.kind !== "DOSSIER" || research.value.schemaVersion !== 2 || capacity.value.schemaVersion !== 2 || capacity.value.status !== "READY" ||
            capacity.value.research.id !== research.id || capacity.value.research.digest !== research.digest ||
            ["acceptedInstructionDigest", "targets", "rawEvidenceDigest", "adoptedEvidenceDigest", "sourcePins", "unresolved"].some(field => hash("dossier-lineage", Reflect.get(research.value, field)) !== hash("dossier-lineage", Reflect.get(artifact.value, field)))) throw new Error("CAPACITY_RESEARCH_CORRESPONDENCE");
        }
      } else {
        const run=artifact.value.understanding, {digest: _digest,...body}=run;void _digest;
        if(run.digest!==hash("understanding-run-v1",body)||artifact.value.rawEvidenceDigest!==hash("understanding-sources-v1",run.sources)||artifact.value.adoptedEvidenceDigest!==hash("understanding-verified-v1",run.verified))throw new Error("DOSSIER_RESEARCH_CHANGED");
      }
    }
    if (artifact.kind === "CAPACITY" && artifact.value.schemaVersion === 2) {
      const value = artifact.value, research = requireArtifact(archive, value.research, "DOSSIER");
      if (research.kind !== "DOSSIER" || research.value.schemaVersion !== 2 || hash("capacity-contexts", value.contextDigests) !== hash("capacity-contexts", research.value.understanding.input.contextDigests)) throw new Error("CAPACITY_RESEARCH_CORRESPONDENCE");
      if (value.previous) {
        const prior = requireArtifact(archive, value.previous, "CAPACITY");
        if (prior.kind !== "CAPACITY" || prior.value.schemaVersion !== 2 || prior.value.research.id !== research.id || prior.value.version + 1 !== value.version || capacityChildren.has(prior.id)) throw new Error("CAPACITY_HISTORY_FORK");
        capacityChildren.add(prior.id);
      } else {
        if (capacityRoots.has(research.id)) throw new Error("CAPACITY_HISTORY_FORK");
        capacityRoots.add(research.id);
      }
      if (value.calendar && value.allocation) validateCalendarAllocation(value.calendar, value.allocation, Date.parse(value.calendar.capturedAt));
      if (value.constraints && (!value.calendar || hash("capacity-calendar", value.constraints.calendar?.snapshot) !== hash("capacity-calendar", value.calendar) || value.constraints.calendar?.reservations.length !== value.allocation?.tasks.length ||
        hash("capacity-reservations", value.constraints.calendar?.reservations) !== hash("capacity-reservations", value.allocation?.tasks))) throw new Error("CAPACITY_RESERVATIONS_CHANGED");
    }
    if (artifact.kind === "STRATEGY") {
      const strategy = artifact.value;
      requireArtifact(archive, strategy.dossier, "DOSSIER");
      if (strategy.schemaVersion === 2) {
        const origin = requireArtifact(archive, strategy.input, "CHECKPOINT");
        if (origin.kind !== "CHECKPOINT" || origin.value.schemaVersion === 1 || origin.value.learning.call?.role !== "STRATEGIST" || origin.value.learning.dossier.id !== strategy.dossier.id || origin.value.learning.call.inputDigest !== strategy.producer.inputDigest || origin.value.learning.call.promptDigest !== strategy.producer.promptDigest) throw new Error("STRATEGY_INPUT_CORRESPONDENCE");
      }
      if (strategy.anchors.some(a => a.textDigest !== hash("strategy-span-v1", strategy.text.slice(a.start, a.end))) ||
        JSON.stringify(strategy.anchors) !== JSON.stringify(strategyDocument(strategy).anchors)) throw new Error("STRATEGY_ANCHORS_CHANGED");
      if (strategy.parent) {
        const parent = requireArtifact(archive, strategy.parent, "STRATEGY");
        if (parent.kind !== "STRATEGY" || parent.value.version + 1 !== strategy.version || JSON.stringify(parent.planIds) !== JSON.stringify(artifact.planIds) || strategyChildren.has(parent.id)) throw new Error("STRATEGY_ANCESTRY_MISMATCH");
        strategyChildren.add(parent.id);
      }
    }
    if (artifact.kind === "TRANSLATION") {
      for (const ref of artifact.value.strategies) requireArtifact(archive, ref, "STRATEGY");
      for (const element of artifact.value.elements) {
        const strategy = archive.entries[element.strategyId];
        if (!artifact.value.strategies.some(s => s.id === element.strategyId) || strategy?.kind !== "STRATEGY" || !strategy.value.anchors.some(a => a.ref === element.anchorRef)) throw new Error("TRANSLATION_STRATEGY_SPAN_MISSING");
      }
      if (artifact.value.schemaVersion === 2) {
        const origin = requireArtifact(archive, artifact.value.input, "CHECKPOINT");
        if (origin.kind !== "CHECKPOINT" || origin.value.schemaVersion === 1 || origin.value.learning.call?.role !== "TRANSLATOR" || artifact.value.strategies.length !== 1 || origin.value.learning.strategy?.id !== artifact.value.strategies[0].id || origin.value.learning.call.inputDigest !== artifact.value.producer.inputDigest || origin.value.learning.call.promptDigest !== artifact.value.producer.promptDigest) throw new Error("TRANSLATION_INPUT_CORRESPONDENCE");
        const capacity = requireArtifact(archive, artifact.value.capacity, "CAPACITY");
        if(capacity.kind!=="CAPACITY"||capacity.value.schemaVersion!==2||capacity.value.status!=="READY")throw new Error("TRANSLATION_CAPACITY_CORRESPONDENCE");
        if(artifact.value.previous){const previous=requireArtifact(archive,artifact.value.previous,"TRANSLATION");if(previous.kind!=="TRANSLATION"||previous.value.schemaVersion!==2||previous.value.version+1!==artifact.value.version||translationChildren.has(previous.id)||
          previous.value.input.digest!==artifact.value.input.digest||previous.value.producer.callId!==artifact.value.producer.callId||previous.value.responseDigest!==artifact.value.responseDigest)throw new Error("TRANSLATION_HISTORY_FORK");translationChildren.add(previous.id);}
      }
    }
    if(artifact.kind==="REVIEW"&&artifact.value.schemaVersion===2){
      const v=artifact.value,origin=requireArtifact(archive,v.input,"CHECKPOINT");
      if(origin.kind!=="CHECKPOINT"||origin.value.schemaVersion!==3||origin.value.learning.call?.protocolVersion!==2||origin.value.learning.call.role!=="REVIEWER"||
        origin.value.learning.call.inputDigest!==v.producer.inputDigest||origin.value.learning.call.promptDigest!==v.producer.promptDigest||v.candidateDigest!==candidateDigest(v.binding)||hash("issue-heads",v.issueHeads)!==hash("issue-heads",v.binding.issueHeads)||
        hash("reviewed-binding",v.binding)!==hash("reviewed-binding",reviewedCandidateBinding(archive,v.binding.allocation,v.issueHeads)))throw new Error("REVIEW_INPUT_CORRESPONDENCE");
    }
    if (artifact.kind === "ISSUE") {
      if(artifact.value.schemaVersion===2&&artifact.value.producerCallId===null&&(!artifact.value.allocationCorrection||artifact.value.disposition!=="ADDRESSED"||artifact.value.allocationCorrection.digest!==artifact.value.input.digest))throw new Error("DETERMINISTIC_CORRECTION_PROOF_REQUIRED");
      const previous = artifact.value.previous ? requireArtifact(archive, artifact.value.previous, "ISSUE") : undefined;
      if (previous?.kind === "ISSUE" && (issueChildren.has(previous.id) || previous.id === artifact.id)) throw new Error("ISSUE_HISTORY_FORK");
      if (previous) issueChildren.add(previous.id);
      else { if (issueRoots.has(artifact.value.issueId)) throw new Error("DUPLICATE_ISSUE_ID"); issueRoots.add(artifact.value.issueId); }
      assertIssueTransition(previous?.kind === "ISSUE" ? previous.value : undefined, artifact.value);
      for (const ref of artifact.value.affected) requireArtifact(archive, ref);
    }
    if (artifact.kind === "CHECKPOINT") {
      for (const ref of artifact.value.artifacts) requireArtifact(archive, ref);
      if (artifact.value.previous) requireArtifact(archive, artifact.value.previous, "CHECKPOINT");
      const call = artifact.value.pendingCall;
      if (call?.state === "RESPONSE_SAVED" && call.responseDigest !== hash("saved-role-response-v1", call.response)) throw new Error("SAVED_RESPONSE_DIGEST_MISMATCH");
      if (artifact.value.schemaVersion !== 1) {
        const l = artifact.value.learning, input = retainedLearningInput(archive, artifact as LearningCheckpoint);
        if (l.snapshot && (++learningRoots > 1 || artifact.value.stage !== "RESEARCH" || l.call || l.strategy || l.translation || l.translated || l.allocated || l.identities.length)) throw new Error("LEARNING_INPUT_RESET");
        const dossier = requireArtifact(archive, l.dossier, "DOSSIER"), capacity = requireArtifact(archive, l.capacity, "CAPACITY");
        if (dossier.kind !== "DOSSIER" || dossier.value.schemaVersion !== 3 || capacity.kind !== "CAPACITY" || capacity.value.schemaVersion !== 2 || capacity.value.status !== "READY" || dossier.value.capacity.digest !== capacity.digest) throw new Error("LEARNING_CAPACITY_CORRESPONDENCE");
        if (l.input) {
          const root = requireArtifact(archive, l.input, "CHECKPOINT");
          if (root.kind !== "CHECKPOINT" || root.value.schemaVersion !== 2) throw new Error("LEARNING_INPUT_CORRESPONDENCE");
          const original = requireArtifact(archive, root.value.learning.dossier, "DOSSIER");
          if (original.kind !== "DOSSIER" || original.value.schemaVersion !== 3 || original.value.research.digest !== dossier.value.research.digest) throw new Error("LEARNING_RESEARCH_CHANGED");
        }
        if (l.call && hash("learning-call", l.call) !== hash("learning-call", retainedLearningCall(archive, artifact as LearningCheckpoint).binding)) throw new Error("LEARNING_CALL_INPUT_CHANGED");
        if (l.strategy) {const authored=requireArtifact(archive,l.strategy,"STRATEGY");if(authored.kind!=="STRATEGY"||authored.value.schemaVersion!==2)throw new Error("NATURAL_STRATEGY_PRODUCER_REQUIRED");}
        const translation = l.translation ? requireArtifact(archive, l.translation, "TRANSLATION") : null;
        const proposal = l.translated ?? l.allocated;
        if (proposal && (translation?.kind !== "TRANSLATION" || translation.value.schemaVersion !== 2 || translation.value.capacity.digest !== capacity.digest || translation.value.blueprintDigest !== hash("ai-first-blueprints-v1", proposal.blueprints.plans.map(p => ({ planId: input.compilationTargets.find(t => t.planRef === p.planRef)!.planId, blueprint: p.blueprint }))))) throw new Error("TRANSLATED_EDUCATION_CHANGED");
        if (l.allocated) {
          const a = l.allocated, envelope = learningEnvelope(capacity.value.constraints!, a.planning.detail.days);
          if(hash("learning-identities",l.identities)!==hash("learning-identities",a.identities))throw new Error("LEARNING_IDENTITIES_CHANGED");
          if (hash("learning-envelope", envelope) !== hash("learning-envelope", a.envelope) || hash("learning-allocation", allocateLearning(a.blueprints, a.envelope, a.facts, { maximumSearchNodes: a.searchAllowance })) !== hash("learning-allocation", a.allocation)) throw new Error("LEARNING_ALLOCATION_CHANGED");
          const compiled = a.allocation.status === "FEASIBLE" ? compileExecution({ blueprints: a.blueprints, envelope: a.envelope, allocation: { report: a.allocation, digest: hash("allocation", a.allocation) } }, input.compilationTargets, input.liveSpecs, a.identities) : [];
          if (hash("learning-execution", compiled) !== hash("learning-execution", a.compiled)) throw new Error("LEARNING_EXECUTION_CHANGED");
        }
      }
    }
  }
  return archive;
}
export function validateTranslation(receipt: Pick<TranslationReceipt, "blueprintDigest" | "elements">, blueprints: readonly { planId: string; blueprint: LearningBlueprintV2 }[]): void {
  if (receipt.blueprintDigest !== hash("ai-first-blueprints-v1", blueprints)) throw new Error("TRANSLATION_BLUEPRINT_CHANGED");
  for (const element of receipt.elements) for (const target of element.targets) {
    const blueprint = blueprints.find(p => p.planId === target.planId)?.blueprint;
    if (!blueprint || target.kind === "ACTIVITY" && !blueprint.activities.some(a => a.localId === target.ref) || target.kind === "SCOPE" && !blueprint.scope.some(s => s.scopeRef === target.ref) || target.kind === "PHASE" && !blueprint.strategy.phases.some(p => p.localId === target.ref) || target.kind === "DECISIONS" && target.ref !== "decisions" || target.kind === "STRATEGY" && target.ref !== "strategy") throw new Error("TRANSLATION_TARGET_NOT_OWNED");
  }
  for (const plan of blueprints) for (const activity of plan.blueprint.activities.filter(a => a.commitment.category === "COMMITTED")) {
    if (!receipt.elements.some(e => e.disposition === "EXECUTION" && e.targets.some(t => t.planId === plan.planId && t.kind === "ACTIVITY" && t.ref === activity.localId))) throw new Error("COMMITTED_WORK_WITHOUT_STRATEGY_BASIS");
  }
}
export function sealIntelligenceBundle(archive: FoundationArchive, binding: CandidateBinding, reviewRef: { id: string; digest: string }, canonical: { blueprints: readonly { planId: string; blueprint: LearningBlueprintV2 }[]; allocation: unknown; execution: unknown[]; constraints: unknown; calendar: unknown; groundStrings: Record<string, string[]> }) {
  validateArchive(archive);
  const allocation = AllocationReportSchema.parse(canonical.allocation);
  const execution = canonical.execution.map(s => ExecutionTaskSpecV2Schema.parse(s));
  if (allocation.status !== "FEASIBLE" || binding.blueprintDigest !== hash("ai-first-blueprints-v1", canonical.blueprints) || binding.allocationDigest !== hash("ai-first-allocation-v1", allocation) || binding.executionDigest !== hash("ai-first-execution-v1", execution) || binding.constraintsDigest !== hash("ai-first-constraints-v1", canonical.constraints) || binding.calendarDigest !== hash("ai-first-calendar-v1", canonical.calendar)) throw new Error("CANONICAL_BUNDLE_CHANGED");
  if(binding.schemaVersion===2){
    const review=requireArtifact(archive,reviewRef,"REVIEW"),body={schemaVersion:2,compilerVersion:2,binding,candidateDigest:candidateDigest(binding),review:reviewRef,archiveAttemptId:review.attemptId};
    const bundle=RevisionIntelligenceBundleSchema.parse({...body,digest:hash("revision-intelligence-v1",body)}),retained=readReviewedBundle(bundle,archive);
    if(hash("issue-heads",currentIssueHeads(archive).map(artifactRef))!==hash("issue-heads",binding.issueHeads))throw new Error("ISSUE_HISTORY_OMITTED");
    for(const issue of retained.issues)if(issue.value.grounds.some(g=>!canonical.groundStrings[g.inputDigest]?.some(text=>text.includes(g.excerpt))))throw new Error("ISSUE_GROUNDS_NOT_LITERAL");
    return bundle;
  }
  requireArtifact(archive, binding.dossier, "DOSSIER");
  const dossier = archive.entries[binding.dossier.id];
  if (dossier.kind !== "DOSSIER" || !dossier.value.capacity || dossier.value.constraintsDigest !== binding.constraintsDigest || dossier.value.calendarDigest !== binding.calendarDigest || dossier.value.unresolved.some(g => g.consequential)) throw new Error("DOSSIER_NOT_READY");
  if (hash("selected-plans", dossier.value.targets.map(t => t.planId).sort()) !== hash("selected-plans", canonical.blueprints.map(p => p.planId).sort()) || new Set(binding.strategies.map(s => s.id)).size !== binding.strategies.length) throw new Error("CANDIDATE_TARGET_MISMATCH");
  const calls: string[] = [];
  for (const ref of binding.strategies) {
    const strategy = requireArtifact(archive, ref, "STRATEGY");
    if (strategy.kind !== "STRATEGY" || strategy.value.dossier.digest !== binding.dossier.digest) throw new Error("STRATEGY_DOSSIER_CHANGED");
    calls.push(strategy.value.producer.callId);
  }
  const translation = requireArtifact(archive, binding.translation, "TRANSLATION");
  if (translation.kind !== "TRANSLATION" || translation.value.blueprintDigest !== binding.blueprintDigest || hash("strategy-refs", translation.value.strategies) !== hash("strategy-refs", binding.strategies) || translation.value.elements.some(e => e.disposition === "GAP") || translation.value.ambiguities.length) throw new Error("TRANSLATION_INCOMPLETE");
  calls.push(translation.value.producer.callId);
  validateTranslation(translation.value, canonical.blueprints);
  const review = requireArtifact(archive, reviewRef, "REVIEW");
  if (review.kind !== "REVIEW" || review.value.verdict !== "APPROVED" || !review.value.completeResultInspected || review.value.candidateDigest !== candidateDigest(binding) || calls.includes(review.value.producer.callId) || hash("issue-heads", review.value.issueHeads) !== hash("issue-heads", binding.issueHeads)) throw new Error("EXACT_INDEPENDENT_REVIEW_REQUIRED");
  const issues = Object.values(archive.entries).filter(a => a.kind === "ISSUE");
  const heads = issues.filter(a => !issues.some(next => next.kind === "ISSUE" && next.value.previous?.id === a.id));
  if (hash("issue-heads", heads.map(artifactRef).sort((a, b) => a.id.localeCompare(b.id))) !== hash("issue-heads", [...binding.issueHeads].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error("ISSUE_HISTORY_OMITTED");
  for (const ref of binding.issueHeads) { const issue = requireArtifact(archive, ref, "ISSUE"); if (issue.kind !== "ISSUE" || issue.value.severity === "BLOCKING" && !["VERIFIED_RESOLVED", "WITHDRAWN"].includes(issue.value.disposition)) throw new Error("OPEN_BLOCKER");
    if (issue.value.disposition === "VERIFIED_RESOLVED" && issue.value.candidateDigest !== educationDigest(binding)) throw new Error("ISSUE_VERIFICATION_STALE");
    if (issue.value.grounds.some(g => !canonical.groundStrings[g.inputDigest]?.some(text => text.includes(g.excerpt)))) throw new Error("ISSUE_GROUNDS_NOT_LITERAL");
  }
  const body = { schemaVersion: 1 as const, compilerVersion: 2 as const, binding, candidateDigest: candidateDigest(binding), review: reviewRef, archiveAttemptId: review.attemptId };
  return RevisionIntelligenceBundleSchema.parse({ ...body, digest: hash("revision-intelligence-v1", body) });
}
export const newFoundationId = () => randomUUID();
