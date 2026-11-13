import { PlannerFoundationService, loadAttemptArtifacts } from "./foundation";
import { artifactRef, archiveDigest, strategyDocument, retainedLearningInput, retainedLearningCall, type LearningCheckpoint, type ReviewedCheckpoint } from "../intelligence/foundation/validation";
import { retainedArtifact } from "../intelligence/foundation/readers";
import { FoundationCheckpointSchema, type FoundationArchive } from "../intelligence/foundation/contracts";
import { assembleNaturalTranslation, naturalTranslationReceipt, naturalRoleInput, learningRoleCall, naturalStrategyInstruction, faithfulTranslationInstruction, validateNaturalReceipt, translationContract } from "../intelligence/natural-learning";
import { dispatchMeteredProvider, workerProviderMeter } from "../intelligence/provider";
import { NaturalTranslationResponseSchema } from "../intelligence/schemas/natural-learning";
import { allocateLearning } from "../intelligence/allocator";
import { assignCompilerIdentities, compileExecution } from "./compilation";
import { readLearningResponse, projectRoleResources } from "./role-accounting";
import { PlannerCalendarCapacity } from "./calendar-capacity";
import { hash, reject, rows, DurablePlannerError } from "./database";
import type { LeaseToken, AttemptPayload } from "./attempts";
import type { Sql } from "./database";
import type { PlannerAttemptV2 } from "../contracts";
import { learningEnvelope, type LearningCompilerService } from "./learning";
import { randomUUID } from "node:crypto";
import { DocumentRepository } from "./documents";
import { reviewedRoleCall, reviewedRoleInputV1 } from "../intelligence/reviewed-learning";

type Learning = LearningCheckpoint["value"]["learning"];
type Stage = LearningCheckpoint["value"]["stage"];
type LearningArtifactWrite={kind:"STRATEGY"|"TRANSLATION";value:unknown;field:"strategy"|"translation"};
type WorkflowPatch=Partial<ReviewedCheckpoint["value"]["workflow"]>;
export const headOf = (archive: FoundationArchive) => { const entries = Object.values(archive.entries).filter(a => a.kind === "CHECKPOINT"); return entries.find(a => !entries.some(next => next.value.previous?.id === a.id)); };

/** Natural authoring/translation are stages of the existing compiler. This
 * service retains unreviewed candidates and never publishes or applies them. */
export class NaturalLearningStage {
  readonly attempts;
  readonly foundation;
  readonly capacity;
  constructor(readonly learning: LearningCompilerService) {
    this.attempts = learning.attempts; this.foundation = new PlannerFoundationService(this.attempts); this.capacity = new PlannerCalendarCapacity(this.attempts);
  }
  async read(ownerId: number, attemptId: string) {
    const read = await this.foundation.inspect(ownerId, attemptId);
    if (read.compilerVersion !== 2) return { compilerVersion: 1 as const, checkpoint: null, historicalOnly: true as const };
    const head = headOf(read.archive);
    return { compilerVersion: 2 as const, checkpoint: head && head.value.schemaVersion !== 1 ? head : null, historicalOnly: true as const };
  }
  async state(token: LeaseToken) {
    return this.attempts.observe(token, async (sql, attempt) => {
      const read = await loadAttemptArtifacts(sql, attempt.ownerId, attempt.attemptId);
      if (read.compilerVersion !== 2 || !attempt.budget.aiFirst) reject("INTENT_CONFLICT", "Natural learning requires admitted compiler v2.", "PREFLIGHT");
      const head = headOf(read.archive);
      if (head && head.value.schemaVersion === 1) reject("QUALITY_INCOMPLETE", "Older foundation work requires an explicit compatible continuation.", "RECOVERY");
      return { archive: read.archive, checkpoint: head as LearningCheckpoint | undefined };
    });
  }
  async write(token: LeaseToken, before: LearningCheckpoint | undefined, stage: Stage, reason: string, patch: Partial<Learning>, artifact?: LearningArtifactWrite, route: "RESEARCH" | "STRATEGIST" | "TRANSLATOR" | null = null, workflow?: WorkflowPatch) {
    return this.attempts.mutate(token,(sql,attempt,payload,now)=>this.writeAccepted(sql,attempt,payload,now,token,before,stage,reason,patch,artifact,route,workflow));
  }
  /** Join artifact/issue assembly to the same existing leased owner transaction. */
  async writeAccepted(sql:Sql,attempt:PlannerAttemptV2,payload:AttemptPayload,now:Date,token: LeaseToken, before: LearningCheckpoint | undefined, stage: Stage, reason: string, patch: Partial<Learning>, artifact?: LearningArtifactWrite, route: "RESEARCH" | "STRATEGIST" | "TRANSLATOR" | null = null, workflow?: WorkflowPatch) {
      const read = await loadAttemptArtifacts(sql, attempt.ownerId, attempt.attemptId);
      if (read.compilerVersion !== 2 || headOf(read.archive)?.digest !== before?.digest) reject("STALE_CONTEXT", "Learning checkpoint changed before retention.", "RECOVERY");
      let digest = archiveDigest(read.archive);
      if (artifact) {
        const saved = await this.foundation.appendAccepted(sql, attempt, payload, now, token, digest, artifact.kind, artifact.value);
        digest = saved.digest; patch = { ...patch, [artifact.field]: artifactRef(saved.artifact) };
      }
      const { snapshot: _snapshot, ...prior } = before?.value.learning ?? {}; void _snapshot;
      const inputRef = before ? before.value.learning.input ?? artifactRef(before) : null;
      const learning = { ...prior, input: inputRef, snapshot: null, ...patch };
      const resources = await projectRoleResources(sql, attempt, payload);
      const value = FoundationCheckpointSchema.parse({ schemaVersion: before?.value.schemaVersion === 3 || workflow ? 3 : 2, ...(before?.value.schemaVersion === 3 || workflow ? {workflow:{...(before?.value.schemaVersion===3?before.value.workflow:{}),...workflow}}:{}), compilerVersion: 2, previous: before ? artifactRef(before) : null,
        requestHash: attempt.requestHash, rootRequestId: attempt.budget.rootRequestId, authorizationDigest: attempt.acceptedRequest.targetAuthorizationDigest,
        targetsDigest: hash("ai-first-targets-v1", attempt.targets), stage, artifacts: [learning.dossier, learning.capacity, learning.strategy, learning.translation].filter(Boolean),
        resourceSnapshotDigest: hash("learning-resources-v1", resources.snapshot), pendingCall: null, route: stage === "INCOMPLETE" ? route ?? (before?.value.schemaVersion===3?before.value.workflow.route:null) ?? "TRANSLATOR" : null, reason, learning });
      const saved = await this.foundation.appendAccepted(sql, attempt, payload, now, token, digest, "CHECKPOINT", value);
      return saved.artifact as LearningCheckpoint;
  }
  async fresh(token: LeaseToken, current: LearningCheckpoint, signal: AbortSignal, author?: { id: string; digest: string }) {
    const state = await this.state(token), capacities = Object.values(state.archive.entries).filter(a => a.kind === "CAPACITY" && a.value.schemaVersion === 2);
    let capacity = capacities.find(a => !capacities.some(next => next.kind === "CAPACITY" && next.value.schemaVersion === 2 && next.value.previous?.id === a.id))!;
    try { await this.capacity.assertCurrent(token.ownerId, token.attemptId, artifactRef(capacity)); }
    catch (error) {
      if (!(error instanceof DurablePlannerError) || error.detail.code !== "STALE_CONTEXT") throw error;
      capacity = current.value.schemaVersion===3&&current.value.workflow.assessment
        ? await this.capacity.revalidateReviewed(token,artifactRef(capacity),current.value.workflow.assessment,signal)
        : author ? await this.capacity.revalidateLearning(token, artifactRef(capacity), author, signal) : await this.capacity.refresh(token, artifactRef(capacity), signal);
    }
    if (capacity.kind !== "CAPACITY" || capacity.value.schemaVersion !== 2 || capacity.value.status !== "READY") reject("QUALITY_INCOMPLETE", "Required Calendar capacity is incomplete; retained education is unchanged.", "PREFLIGHT");
    const latest = await this.state(token);
    const dossier = Object.values(latest.archive.entries).find(a => a.kind === "DOSSIER" && a.value.schemaVersion === 3 && a.value.capacity.id === capacity.id)!;
    if (!dossier) reject("INVALID_OUTPUT", "Capacity lacks its exact bound research dossier.", "RECOVERY");
    if(dossier.kind!=="DOSSIER"||dossier.value.schemaVersion!==3)throw new Error("DOSSIER_VERSION_REQUIRED");
    const research=retainedArtifact(latest.archive,dossier.value.research,"DOSSIER");
    if(research.value.schemaVersion!==2)throw new Error("RESEARCH_VERSION_REQUIRED");
    const documents=this.learning.dependencies.documents??new DocumentRepository(this.attempts.db);
    const owned=retainedLearningInput(latest.archive,current);
    const sources=[...research.value.understanding.sources.map(s=>s.source),...owned.targets.flatMap(t=>t.intent.research?.sources??[]),...owned.retainedResources?.map(r=>r.source)??[]];
    for(const source of sources)if(source.location.kind==="OWNED_DOCUMENT"){
      signal.throwIfAborted();const actual=await documents.read(token.ownerId,source.location.documentId);
      if(actual.metadata.contentHash!==source.contentHash)reject("STALE_CONTEXT","An original learning source changed; continue Research explicitly.","PREFLIGHT");
    }
    if (current.digest !== latest.checkpoint?.digest) reject("STALE_CONTEXT", "Learning routing changed during Calendar revalidation.", "RECOVERY");
    return { archive: latest.archive, capacity, dossier };
  }
  private async prepareCall(token: LeaseToken, current: LearningCheckpoint, role: "STRATEGIST" | "TRANSLATOR", signal: AbortSignal) {
    const fresh = await this.fresh(token, current, signal, current.value.learning.strategy ?? (current.value.schemaVersion===3?current.value.workflow.previousTranslation??current.value.workflow.previousStrategy:undefined) ?? undefined);
    const input = retainedLearningInput(fresh.archive, current), dossier = fresh.dossier;
    if (dossier.kind !== "DOSSIER" || dossier.value.schemaVersion !== 3) throw new Error("DOSSIER_VERSION_REQUIRED");
    const research = retainedArtifact(fresh.archive, dossier.value.research, "DOSSIER"), strategy = current.value.learning.strategy ? retainedArtifact(fresh.archive, current.value.learning.strategy, "STRATEGY") : null;
    const policy = await this.attempts.rolePolicy(token, role), key = `${role.toLowerCase()}_${randomUUID().replaceAll("-", "")}`;
    let request;
    if(current.value.schemaVersion===3){
      const systemInstruction=(role==="STRATEGIST"?naturalStrategyInstruction:faithfulTranslationInstruction)+(current.value.workflow.assessment?"\nSubstantively address the supplied complete independent assessment within the exact accepted goals. You may reconsider the educational approach, not merely patch the named sentence. Preserve protected work; do not silently comply with an unsupported objection. Explain or preserve disputed evidence for independent reconsideration. No fixed revision count or self-approval.":"\nAddress the actual retained translator incompleteness, correspondence gaps or rejected-output validation in authorFeedback. A rejected response is untrusted evidence, not accepted education; correct its actual validation failure and return the complete faithful response. There is no independent approval yet. Preserve the complete original strategy, examples, accepted goals and protected work; improve the education or its representation substantively where necessary. Missing facts or decisions go to Research. No invented student answer, abbreviated substitute, fixed repair count or self-approval.");
      const responseContract=role==="TRANSLATOR"?translationContract(input):null;
      const provisional={protocolVersion:2 as const,role,key,purpose:"REPAIR" as const,promptDigest:"0".repeat(64),inputDigest:"0".repeat(64),outputCap:policy.call.completionTokens,systemInstruction,responseContract};
      const pinned={...current,value:{...current.value,learning:{...current.value.learning,dossier:artifactRef(dossier),capacity:artifactRef(fresh.capacity),call:provisional}}} as ReviewedCheckpoint;
      request=reviewedRoleCall(role,key,"REPAIR",systemInstruction,reviewedRoleInputV1(fresh.archive,pinned),policy.call.completionTokens,responseContract);
    }else request=learningRoleCall(role,key,role==="STRATEGIST"?naturalStrategyInstruction:faithfulTranslationInstruction,
      naturalRoleInput(research.value,dossier.value,fresh.capacity.value,input,role==="TRANSLATOR"?strategy!.value:undefined),policy.call.completionTokens);
    return this.write(token, current, role === "STRATEGIST" ? "STRATEGY" : "TRANSLATION", role === "STRATEGIST" ? "Natural educational authoring input retained before dispatch." : "Faithful translation input retained with current real capacity.",
      { dossier: artifactRef(dossier), capacity: artifactRef(fresh.capacity), call: request.binding, translated: null, allocated: null });
  }
  private async invoke(token: LeaseToken, current: LearningCheckpoint, signal: AbortSignal) {
    let state = await this.state(token), checkpoint = current;
    const descriptor = current.value.learning.call!;
    if(descriptor.role==="REVIEWER")reject("INTENT_CONFLICT","Independent review uses its complete-result validation boundary.","REVIEW");
    const dispatched = await this.attempts.mutate(token, async (sql, attempt) => (await rows(sql, `SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->'roleCall'->>'key'=$2`, [attempt.attemptId, descriptor.key])).length > 0);
    if (!dispatched) {
      try { await this.capacity.assertCurrent(token.ownerId, token.attemptId, current.value.learning.capacity); }
      catch (error) {
        if (!(error instanceof DurablePlannerError) || error.detail.code !== "STALE_CONTEXT") throw error;
        checkpoint = await this.prepareCall(token, current, descriptor.role, signal); state = await this.state(token);
      }
    }
    const request = retainedLearningCall(state.archive, checkpoint), input = retainedLearningInput(state.archive, checkpoint);
    const l = checkpoint.value.learning, capacity = retainedArtifact(state.archive, l.capacity, "CAPACITY");
    if (capacity.value.schemaVersion !== 2 || !capacity.value.constraints || !capacity.value.facts) throw new Error("CAPACITY_VERSION_REQUIRED");
    const strategy = l.strategy ? retainedArtifact(state.archive, l.strategy, "STRATEGY") : null;
    const capacityValue = capacity.value;
    await dispatchMeteredProvider<unknown>(workerProviderMeter(this.attempts, token), { ...request, policy: { purpose: request.binding.protocolVersion===2?request.binding.purpose:"BLUEPRINT" }, signal,
      validate: r => request.role.role === "STRATEGIST" ? r.text! : assembleNaturalTranslation(JSON.parse(r.text!), input, strategy!.value, capacityValue.constraints!, capacityValue.facts!) }, this.learning.dependencies.provider);
    const production = await this.attempts.mutate(token, (sql, attempt) => readLearningResponse(sql, attempt, checkpoint.value.learning.call!));
    return { checkpoint, input, strategy, capacity, production };
  }
  async run(token: LeaseToken, signal: AbortSignal): Promise<LearningCheckpoint> {
    signal.throwIfAborted();
    const completeJourney=(await this.attempts.resources(token.ownerId,token.attemptId)).policy.journeyVersion===1;
    let state = await this.state(token), checkpoint = state.checkpoint;
    if (!checkpoint) {
      const capacities = Object.values(state.archive.entries).filter(a => a.kind === "CAPACITY" && a.value.schemaVersion === 2);
      let capacity = capacities.find(a => !capacities.some(next => next.kind === "CAPACITY" && next.value.schemaVersion === 2 && next.value.previous?.id === a.id));
      if (!capacity) reject("QUALITY_INCOMPLETE", "Complete real capacity before natural strategy.", "PREFLIGHT");
      try{await this.capacity.assertCurrent(token.ownerId, token.attemptId, artifactRef(capacity));}catch(error){
        if(!(error instanceof DurablePlannerError)||error.detail.code!=="STALE_CONTEXT")throw error;
        // No learning input or financial author reservation exists yet. Reuse
        // the explicit capacity owner before freezing the first owned input.
        capacity=await this.capacity.refresh(token,artifactRef(capacity),signal);
        if(capacity.value.schemaVersion!==2||capacity.value.status!=="READY")reject("QUALITY_INCOMPLETE","Current real capacity is unresolved before natural strategy.","PREFLIGHT");
        state=await this.state(token);
      }
      const dossier = Object.values(state.archive.entries).find(a => a.kind === "DOSSIER" && a.value.schemaVersion === 3 && a.value.capacity.id === capacity.id);
      if (!dossier) reject("QUALITY_INCOMPLETE", "Complete verified research and bound capacity first.", "PREFLIGHT");
      const input = await this.learning.captureNatural(token, artifactRef(capacity));
      checkpoint = await this.write(token, undefined, "RESEARCH", "Exact verified research and owned learning inputs retained for natural strategy.", { dossier: artifactRef(dossier), capacity: artifactRef(capacity), input: null, snapshot: input, strategy: null, translation: null, call: null, translated: null, allocated: null, identities: [] });
    }
    if(checkpoint.value.schemaVersion===3&&["REVIEW","READY"].includes(checkpoint.value.stage))return checkpoint;
    if (checkpoint.value.stage === "INCOMPLETE" || checkpoint.value.stage === "NEEDS_DECISION") return checkpoint;
    if (!checkpoint.value.learning.strategy) {
      if (!checkpoint.value.learning.call) checkpoint = await this.prepareCall(token, checkpoint, "STRATEGIST", signal);
      const result = await this.invoke(token, checkpoint, signal); checkpoint = result.checkpoint;
      const previous=checkpoint.value.schemaVersion===3&&checkpoint.value.workflow.previousStrategy?retainedArtifact((await this.state(token)).archive,checkpoint.value.workflow.previousStrategy,"STRATEGY"):null;
      const value = strategyDocument({ schemaVersion: 2, input: artifactRef(checkpoint), dossier: checkpoint.value.learning.dossier, parent: previous?artifactRef(previous):null, version: previous?previous.value.version+1:1, producer: result.production.producer, text: result.production.text });
      checkpoint = await this.write(token, checkpoint, "STRATEGY", "Complete natural strategy retained against its original exact research and capacity inputs.", { call: null }, { kind: "STRATEGY", value, field: "strategy" });
    }
    if (!checkpoint.value.learning.translation) {
      if (!checkpoint.value.learning.call) checkpoint = await this.prepareCall(token, checkpoint, "TRANSLATOR", signal);
      const result = await this.invoke(token, checkpoint, signal); checkpoint = result.checkpoint;
      const response = NaturalTranslationResponseSchema.parse(JSON.parse(result.production.text));
      if (response.decision === "INCOMPLETE") {
        checkpoint = await this.write(token, checkpoint, "INCOMPLETE", response.explanation, { call: null }, undefined, response.route);
        if (response.needsDecision&&!completeJourney) await this.attempts.needsDecision(token, response.explanation);
        return checkpoint;
      }
      const assembled = assembleNaturalTranslation(response, result.input, result.strategy!.value, result.capacity.value.schemaVersion === 2 ? result.capacity.value.constraints! : neverCapacity(), result.capacity.value.schemaVersion === 2 ? result.capacity.value.facts! : undefined);
      const receipt = naturalTranslationReceipt(assembled, result.input, result.strategy!, artifactRef(checkpoint), result.production, artifactRef(result.capacity));
      const gaps = receipt.ambiguities.length > 0 || receipt.elements.some(e => e.disposition === "GAP");
      if (!gaps) validateNaturalReceipt(receipt, result.input, assembled.translated!);
      checkpoint = await this.write(token, checkpoint, gaps ? "INCOMPLETE" : "TRANSLATION", gaps ? "Translation retains explicit semantic gaps; the complete strategy and proposal remain unapproved." : "Faithful translation and exact strategy correspondence retained; allocation follows.", { call: null, translated: assembled.translated }, { kind: "TRANSLATION", value: receipt, field: "translation" });
      if (gaps) return checkpoint;
    }
    state = await this.state(token);
    let fresh = await this.fresh(token, checkpoint, signal, checkpoint.value.learning.translation!);
    if (checkpoint.value.learning.allocated && checkpoint.value.learning.capacity.digest === fresh.capacity.digest) return checkpoint;
    const priorIdentities = checkpoint.value.learning.identities;
    let translation = retainedArtifact(state.archive, checkpoint.value.learning.translation!, "TRANSLATION");
    if (translation.value.schemaVersion !== 2) reject("INVALID_OUTPUT", "Natural translation version required.", "RECOVERY");
    if (translation.value.capacity.digest !== fresh.capacity.digest) {
      const origin = retainedArtifact(fresh.archive, translation.value.input, "CHECKPOINT") as LearningCheckpoint;
      const production = await this.attempts.mutate(token, (sql, attempt) => readLearningResponse(sql, attempt, origin.value.learning.call!));
      const input = retainedLearningInput(fresh.archive, checkpoint), strategy = retainedArtifact(fresh.archive, checkpoint.value.learning.strategy!, "STRATEGY");
      if (fresh.capacity.value.schemaVersion !== 2) throw new Error("CAPACITY_VERSION_REQUIRED");
      const assembled = assembleNaturalTranslation(JSON.parse(production.text), input, strategy.value, fresh.capacity.value.constraints!, fresh.capacity.value.facts!);
      const receipt = naturalTranslationReceipt(assembled, input, strategy, translation.value.input, production, artifactRef(fresh.capacity), translation);
      validateNaturalReceipt(receipt, input, assembled.translated!);
      // ALLOCATION may repeat deterministically; no model-authored repair/review.
      checkpoint = await this.write(token, checkpoint, checkpoint.value.stage === "ALLOCATION" ? "ALLOCATION" : "TRANSLATION", "Current Calendar reassembly preserves the original author response and reruns complete canonical validation.",
        { dossier: artifactRef(fresh.dossier), capacity: artifactRef(fresh.capacity), translated: assembled.translated, allocated: null, identities: priorIdentities }, { kind: "TRANSLATION", value: receipt, field: "translation" });
      state = await this.state(token); translation = retainedArtifact(state.archive, checkpoint.value.learning.translation!, "TRANSLATION");
      fresh = { ...fresh, archive: state.archive };
    }
    const input = retainedLearningInput(fresh.archive, checkpoint), translated = checkpoint.value.learning.translated;
    if (!translated || fresh.capacity.value.schemaVersion !== 2) reject("INVALID_OUTPUT", "Translated education is missing before allocation.", "ALLOCATION");
    const envelope = learningEnvelope(fresh.capacity.value.constraints!, translated.planning.detail.days);
    const priorAllocation=checkpoint.value.schemaVersion===3&&checkpoint.value.workflow.route==="ALLOCATION"&&checkpoint.value.workflow.candidate?retainedArtifact(fresh.archive,checkpoint.value.workflow.candidate,"CHECKPOINT"):null;
    const previous=priorAllocation?.value.schemaVersion!==1?priorAllocation?.value.learning.allocated:null;
    const searchAllowance=previous?.allocation.status==="ALLOCATION_UNRESOLVED"?100000:this.learning.dependencies.maximumSearchNodes??20000;
    const allocation = allocateLearning(translated.blueprints, envelope, translated.facts, { maximumSearchNodes: searchAllowance });
    const identities = assignCompilerIdentities(translated.blueprints, input.compilationTargets, input.liveSpecs, priorIdentities);
    const compiled = allocation.status === "FEASIBLE" ? compileExecution({ blueprints: translated.blueprints, envelope, allocation: { report: allocation, digest: hash("allocation", allocation) } }, input.compilationTargets, input.liveSpecs, identities) : [];
    checkpoint = await this.write(token, checkpoint, "ALLOCATION", allocation.status === "FEASIBLE" ? "Unreviewed complete education is allocated and compiled; independent review and confirmation remain pending." : "Full educational workload retained with its actual allocation failure and evidence.",
      { dossier: artifactRef(fresh.dossier), capacity: artifactRef(fresh.capacity), translated: null, identities, allocated: { ...translated, envelope, allocation, identities, compiled: compiled.map(p => ({ ...p, sources: [...p.sources] })), searchAllowance } });
    await this.capacity.assertCurrent(token.ownerId, token.attemptId, checkpoint.value.learning.capacity);
    if (allocation.status === "CAPACITY_SHORTFALL"&&!completeJourney) await this.attempts.needsDecision(token, "The complete required learning does not fit the accepted capacity. Review the retained mathematical bound before explicitly changing available time or educational scope.");
    return checkpoint;
  }
}
function neverCapacity(): never { throw new Error("CAPACITY_VERSION_REQUIRED"); }
