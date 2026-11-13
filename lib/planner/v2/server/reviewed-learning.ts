import type { NaturalLearningStage } from "./natural-learning";
import type { Sql } from "./database";
import type { AttemptPayload, LeaseToken } from "./attempts";
import type { PlannerAttemptV2 } from "../contracts";
import type { FoundationArchive, FoundationArtifact } from "../intelligence/foundation/contracts";
import { archiveDigest, artifactRef, candidateDigest, currentIssueHeads, educationDigest, authoredEducationDigest, allocationCorrectionChanged, retainedLearningCall, retainedLearningInput, reviewedCandidateBinding, reviewProgressDigest, type LearningCheckpoint, type ReviewedCheckpoint } from "../intelligence/foundation/validation";
import { retainedArtifact } from "../intelligence/foundation/readers";
import { completeReviewInstruction, reviewedRoleCall, reviewedRoleInputV1, reviewIssueValues, validateCompleteReview, understandingKnowledgeDigest, type RetainedIssue } from "../intelligence/reviewed-learning";
import { readLearningResponse, readRejectedLearningResponse, boundRolePolicy } from "./role-accounting";
import { hash, reject, rows, DurablePlannerError } from "./database";
import { loadIntent } from "./intents";
import { loadAttempt } from "./attempts";
import { CompleteReviewResponseSchema,ReviewedResearchHandoffSchema,AuthorFeedbackSchema,type AuthorFeedback } from "../intelligence/schemas/reviewed-learning";
import { NaturalTranslationResponseSchema } from "../intelligence/schemas/natural-learning";
import { dispatchMeteredProvider, workerProviderMeter, boundedRejectedOutput, validationFeedback } from "../intelligence/provider";
import { assembleNaturalTranslation } from "../intelligence/natural-learning";
import { captureRejectedReview } from "../intelligence/quality";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { loadAttemptArtifacts } from "./foundation";
import { headOf } from "./natural-learning";
import { readUnderstanding, type ResearchUnderstanding } from "./understanding";

const rubricVersion="AI_FIRST_COMPLETE_V1";
const addressedExplanation="A corrective author response was accepted, faithfully translated and fully reallocated. Independent verification remains required.";
const linkedAddressedExplanation="Verified linked research and a complete newly authored, translated and allocated candidate are retained. Independent verification remains required.";
const allocationAddressedExplanation="The existing deterministic allocator retained a changed, fully validated feasible placement. Independent verification remains required.";

export async function rejectedReviewRecovery(sql:Sql,attempt:PlannerAttemptV2,archive:FoundationArchive,origin:ReviewedCheckpoint){
  const call=origin.value.learning.call;
  if(call?.protocolVersion!==2||call.role!=="REVIEWER")throw new Error("REJECTED_REVIEW_INPUT_REQUIRED");
  const actual=await readRejectedLearningResponse(sql,attempt,call),packet=reviewedRoleInputV1(archive,origin);
  if(!("input" in packet))throw new Error("REVIEW_INPUT_REQUIRED");
  let invalid=false;
  try{validateCompleteReview(JSON.parse(actual.text),packet.input,origin.value.workflow.issueHeads.map(r=>retainedArtifact(archive,r,"ISSUE")),origin.value.workflow.recovery?{concerns:origin.value.workflow.recovery.concerns}:undefined);}catch{invalid=true;}
  if(!invalid)throw new Error("VALID_REVIEW_CANNOT_BE_REJECTED");
  const state={concerns:structuredClone(origin.value.workflow.recovery?.concerns??[])};
  captureRejectedReview(actual.text,packet.input,state);
  return {concerns:state.concerns,rejectedCallId:actual.producer.callId,responseDigest:actual.responseDigest,rejectedOutput:boundedRejectedOutput(actual.text)};
}

export async function checkedRetainedReview(sql:Sql,attempt:PlannerAttemptV2,archive:FoundationArchive,origin:ReviewedCheckpoint){
  const call=origin.value.learning.call;
  if(call?.protocolVersion!==2||call.role!=="REVIEWER")reject("INVALID_OUTPUT","A complete review needs its actual independent producing input.","RECOVERY");
  const actual=await readLearningResponse(sql,attempt,call),packet=reviewedRoleInputV1(archive,origin);
  if(!("input" in packet))throw new Error("REVIEW_INPUT_REQUIRED");
  const previous=origin.value.workflow.issueHeads.map(ref=>retainedArtifact(archive,ref,"ISSUE"));
  const checked=validateCompleteReview(JSON.parse(actual.text),packet.input,previous,origin.value.workflow.recovery?{concerns:origin.value.workflow.recovery.concerns}:undefined);
  return {actual,packet,previous,checked};
}
export async function checkedReviewedResearchHandoff(sql:Sql,attempt:PlannerAttemptV2,payload:AttemptPayload){
  const handoff=ReviewedResearchHandoffSchema.parse(payload.reviewResearch),retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);
  if(retained.compilerVersion!==2||boundRolePolicy(attempt,payload).journeyVersion!==1)throw new Error("REVIEWED_RESEARCH_VERSION_REQUIRED");
  const assessment=retainedArtifact(retained.archive,handoff.assessment,"REVIEW");if(assessment.value.schemaVersion!==2)throw new Error("ACTUAL_COMPLETE_REVIEW_REQUIRED");
  const origin=retainedArtifact(retained.archive,assessment.value.input,"CHECKPOINT") as ReviewedCheckpoint;
  const actual=await checkedRetainedReview(sql,attempt,retained.archive,origin),response=actual.checked.response;
  if(response.verdict!=="NEEDS_DECISION"&&!(response.verdict==="REVISE"&&response.next?.route==="RESEARCH"))throw new Error("REVIEW_RESEARCH_ROUTE_REQUIRED");
  const expected={schemaVersion:1,assessment:artifactRef(assessment),kind:response.verdict==="NEEDS_DECISION"?"CLARIFICATION":"REINVESTIGATION",questions:response.questions};
  if(hash("review-research-handoff",handoff)!==hash("review-research-handoff",expected))throw new Error("REVIEW_RESEARCH_HANDOFF_CHANGED");
  return {handoff,assessment,archive:retained.archive,priorReview:{parentAttemptId:attempt.attemptId,handoff,assessment,input:actual.packet.input,issues:currentIssueHeads(retained.archive)}};
}
function researchForLearning(archive:FoundationArchive,checkpoint:LearningCheckpoint){
  const dossier=retainedArtifact(archive,checkpoint.value.learning.dossier,"DOSSIER");if(dossier.value.schemaVersion!==3)throw new Error("RESEARCH_CAPACITY_REQUIRED");
  const research=retainedArtifact(archive,dossier.value.research,"DOSSIER");if(research.value.schemaVersion!==2)throw new Error("FULL_RESEARCH_REQUIRED");return {...research,value:research.value};
}
export async function checkedAuthorFeedback(sql:Sql,attempt:PlannerAttemptV2,archive:FoundationArchive,source:LearningCheckpoint):Promise<AuthorFeedback>{
  if(source.value.stage==="TRANSLATION"&&source.value.learning.call?.role==="TRANSLATOR"&&source.value.learning.strategy){
    // Only a settled complete rejected receipt may request correction. Re-run
    // admission against its frozen inputs; a failed transaction is not proof
    // that otherwise valid education needs another paid response.
    const actual=await readRejectedLearningResponse(sql,attempt,source.value.learning.call);
    const strategy=retainedArtifact(archive,source.value.learning.strategy,"STRATEGY"),capacity=retainedArtifact(archive,source.value.learning.capacity,"CAPACITY");
    if(capacity.value.schemaVersion!==2||!capacity.value.constraints||!capacity.value.facts)throw new Error("REJECTED_TRANSLATION_CAPACITY_REQUIRED");
    let validation:ReturnType<typeof validationFeedback>|undefined,interpretation:unknown=actual.text;
    try{interpretation=JSON.parse(actual.text);assembleNaturalTranslation(interpretation,retainedLearningInput(archive,source),strategy.value,capacity.value.constraints,capacity.value.facts);}
    catch(error){validation=validationFeedback(error,actual.text);}
    if(!validation)throw new Error("VALID_TRANSLATION_CANNOT_BE_REJECTED");
    return AuthorFeedbackSchema.parse({kind:"REJECTED",source:artifactRef(source),input:artifactRef(source),responseDigest:actual.responseDigest,
      progressDigest:hash("rejected-translation-progress-v1",{strategy:strategy.value.text,interpretation,validation}),
      validation,rejectedOutput:boundedRejectedOutput(actual.text)});
  }
  if(source.value.stage!=="INCOMPLETE"||!source.value.learning.strategy)throw new Error("ACTUAL_INCOMPLETE_AUTHOR_REQUIRED");
  const receipt=source.value.learning.translation?retainedArtifact(archive,source.value.learning.translation,"TRANSLATION"):null;
  const origin=receipt?.value.schemaVersion===2?retainedArtifact(archive,receipt.value.input,"CHECKPOINT"):source.value.previous?retainedArtifact(archive,source.value.previous,"CHECKPOINT"):null;
  if(origin?.value.schemaVersion===1||!origin?.value.learning.call||origin.value.learning.call.role!=="TRANSLATOR")throw new Error("ACTUAL_TRANSLATOR_INPUT_REQUIRED");
  const actual=await readLearningResponse(sql,attempt,origin.value.learning.call),response=NaturalTranslationResponseSchema.parse(JSON.parse(actual.text));
  const strategy=retainedArtifact(archive,source.value.learning.strategy,"STRATEGY"),research=researchForLearning(archive,source),capacity=retainedArtifact(archive,source.value.learning.capacity,"CAPACITY");
  const progressDigest=hash("author-feedback-progress-v1",{strategy:strategy.value.text,research:understandingKnowledgeDigest(research.value.understanding),response,
    calendar:capacity.value.schemaVersion===2?capacity.value.calendar?.sources.map(s=>({ref:s.ref,versionDigest:s.versionDigest,complete:s.complete})):null});
  const base={source:artifactRef(source),input:artifactRef(origin),responseDigest:actual.responseDigest,progressDigest};
  if(response.decision==="INCOMPLETE"){
    if(receipt||source.value.reason!==response.explanation)throw new Error("INCOMPLETE_AUTHOR_CORRESPONDENCE");
    return AuthorFeedbackSchema.parse({...base,kind:"INCOMPLETE",response});
  }
  if(receipt?.value.schemaVersion!==2||receipt.value.responseDigest!==actual.responseDigest||!receipt.value.ambiguities.length&&!receipt.value.elements.some(e=>e.disposition==="GAP"))throw new Error("ACTUAL_TRANSLATION_GAPS_REQUIRED");
  return AuthorFeedbackSchema.parse({...base,kind:"GAPS",translation:artifactRef(receipt)});
}
type ReviewContinuationContext={priorReview:unknown;foundationDigest:string;questions:z.infer<typeof CompleteReviewResponseSchema>["questions"];issues:RetainedIssue[];archive:FoundationArchive;parentCandidate:LearningCheckpoint|null;parentResearch:ReturnType<typeof researchForLearning>};
/** An explicit retry after review retains actual history even if it stopped
 * before a Research-route handoff or before inherited issues were assembled.
 * The caller must pin this stopped parent's exact archive in its decision. */
export async function checkedReviewContinuation(sql:Sql,attempt:PlannerAttemptV2,payload:AttemptPayload):Promise<ReviewContinuationContext|null>{
  if(payload.resourcePolicy?.journeyVersion!==1)return null;
  if(payload.reviewResearch){
    const checked=await checkedReviewedResearchHandoff(sql,attempt,payload);
    const candidate=retainedArtifact(checked.archive,checked.assessment.value.schemaVersion===2?checked.assessment.value.binding.allocation:neverBinding(),"CHECKPOINT") as LearningCheckpoint;
    return {priorReview:checked.priorReview,foundationDigest:archiveDigest(checked.archive),questions:checked.handoff.questions,issues:checked.priorReview.issues,archive:checked.archive,parentCandidate:candidate,parentResearch:researchForLearning(checked.archive,candidate)};
  }
  const retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);if(retained.compilerVersion!==2)throw new Error("REVIEW_CONTINUATION_VERSION_REQUIRED");
  const head=headOf(retained.archive),local=currentIssueHeads(retained.archive),run=payload.understanding?readUnderstanding(payload.understanding):null;
  const authorFeedback=head?.value.schemaVersion===3?head.value.workflow.authorFeedback:head?.value.schemaVersion===2&&head.value.stage==="INCOMPLETE"&&head.value.learning.strategy?await checkedAuthorFeedback(sql,attempt,retained.archive,head as LearningCheckpoint):undefined;
  if(head?.value.schemaVersion!==3&&!local.length&&!run?.input.priorReview&&!authorFeedback)return null;
  let inherited:ReviewContinuationContext|null=null;
  if(run?.input.priorReview){
    if(!attempt.parentAttemptId||!payload.researchContinuation)throw new Error("REVIEW_CONTINUATION_PARENT_REQUIRED");
    const parent=await loadAttempt(sql,attempt.ownerId,attempt.parentAttemptId,false);inherited=await checkedReviewContinuation(sql,parent.attempt,parent.payload);
    if(!inherited||hash("inherited-review-context",run.input.priorReview)!==hash("inherited-review-context",inherited.priorReview))throw new Error("INHERITED_REVIEW_CONTEXT_CHANGED");
  }
  let candidate:LearningCheckpoint|undefined;
  let cursor=head;
  while(cursor){if(cursor.value.schemaVersion!==1&&cursor.value.learning.allocated){candidate=cursor as LearningCheckpoint;break;}
    cursor=cursor.value.previous?retainedArtifact(retained.archive,cursor.value.previous,"CHECKPOINT"):undefined;
  }
  const assessment=head?.value.schemaVersion===3&&head.value.workflow.assessment?retainedArtifact(retained.archive,head.value.workflow.assessment,"REVIEW"):null;
  const actual=assessment?.value.schemaVersion===2?await checkedRetainedReview(sql,attempt,retained.archive,retainedArtifact(retained.archive,assessment.value.input,"CHECKPOINT") as ReviewedCheckpoint):null;
  const issues=new Map(inherited?.issues.map(i=>[i.value.issueId,i])??[]);for(const issue of local)issues.set(issue.value.issueId,issue);
  const heads=[...issues.values()].sort((a,b)=>a.value.issueId.localeCompare(b.value.issueId));
  if(!candidate&&!inherited&&!authorFeedback)throw new Error("COMPLETE_CONTINUATION_CANDIDATE_REQUIRED");
  const archive=candidate||!inherited?retained.archive:inherited.archive,parentCandidate=candidate??inherited?.parentCandidate??null;
  if(heads.length&&!parentCandidate)throw new Error("REVIEW_ISSUE_CANDIDATE_REQUIRED");
  const latest=head?.value.schemaVersion!==1?head?.value.learning:null;
  const priorReview={schemaVersion:1,kind:"EXPLICIT_CONTINUATION",parentAttemptId:attempt.attemptId,foundationDigest:archiveDigest(retained.archive),checkpoint:head??null,
    assessment,input:actual?.packet.input??null,candidate:parentCandidate,
    strategy:latest?.strategy?retainedArtifact(retained.archive,latest.strategy,"STRATEGY"):null,translation:latest?.translation?retainedArtifact(retained.archive,latest.translation,"TRANSLATION"):null,
    issues:heads,...(authorFeedback?{authorFeedback}:{}),...(!assessment&&inherited?{inherited:inherited.priorReview}:{})};
  return {priorReview,foundationDigest:archiveDigest(retained.archive),questions:run?.pending?.action==="CLARIFY"?run.pending.questions:actual?.checked.response.questions??[],issues:heads,archive,parentCandidate,parentResearch:parentCandidate?researchForLearning(archive,parentCandidate):head&&head.value.schemaVersion!==1?researchForLearning(retained.archive,head as LearningCheckpoint):inherited!.parentResearch};
}
async function inheritedReviewState(sql:Sql,attempt:PlannerAttemptV2,payload:AttemptPayload,archive:FoundationArchive,checkpoint:LearningCheckpoint){
  const research=researchForLearning(archive,checkpoint);
  if(!research.value.understanding.input.priorReview)return null;
  if(!attempt.parentAttemptId||!payload.researchContinuation)throw new Error("INHERITED_RESEARCH_CONTINUATION_REQUIRED");
  const parent=await loadAttempt(sql,attempt.ownerId,attempt.parentAttemptId,false),checked=await checkedReviewContinuation(sql,parent.attempt,parent.payload);
  if(!checked||!parent.payload.reviewResearch&&(payload.researchContinuation.decision as {expectedFoundationDigest?:string}).expectedFoundationDigest!==checked.foundationDigest)throw new Error("EXPLICIT_REVIEW_CONTINUATION_REQUIRED");
  if(hash("linked-plan-order",parent.attempt.targets.map(t=>t.planId))!==hash("linked-plan-order",attempt.targets.map(t=>t.planId))||
    hash("inherited-review-context",research.value.understanding.input.priorReview)!==hash("inherited-review-context",checked.priorReview))throw new Error("INHERITED_REVIEW_CONTEXT_CHANGED");
  return {...checked,research};
}
function neverBinding():never{throw new Error("COMPLETE_REVIEW_BINDING_REQUIRED");}
function inheritedIssueValue(previous:RetainedIssue,candidate:LearningCheckpoint){
  if(previous.value.schemaVersion!==2)throw new Error("INHERITED_ISSUE_VERSION_REQUIRED");
  return {...previous.value,previous:null,input:artifactRef(candidate),affected:[artifactRef(candidate)],inherited:{attemptId:previous.attemptId,issue:artifactRef(previous)}};
}
function linkedCorrectionChanged(parent:NonNullable<Awaited<ReturnType<typeof inheritedReviewState>>>,archive:FoundationArchive,candidate:LearningCheckpoint){
  if(!parent.parentCandidate)return false;
  return authoredEducationDigest(parent.archive,artifactRef(parent.parentCandidate))!==authoredEducationDigest(archive,artifactRef(candidate))||
    understandingKnowledgeDigest(parent.parentResearch.value.understanding)!==understandingKnowledgeDigest(parent.research.value.understanding);
}

/** Validate new review/issue writes and historical reads against actual saved
 * receipts. A trusted caller cannot fabricate approval by recomputing hashes. */
export async function assertReviewedArtifact(sql:Sql,attempt:PlannerAttemptV2,payload:AttemptPayload,archive:FoundationArchive,artifact:FoundationArtifact,writing=false){
  const relevant=artifact.kind==="CHECKPOINT"&&artifact.value.schemaVersion===3||["REVIEW","ISSUE"].includes(artifact.kind)&&artifact.value.schemaVersion===2;
  if(!relevant)return;
  if(boundRolePolicy(attempt,payload).journeyVersion!==1)reject("QUALITY_INCOMPLETE","This Attempt retains its earlier compiler-v2 journey interpretation.","RECOVERY");
  if(artifact.kind==="CHECKPOINT"&&artifact.value.schemaVersion===3){
    const value=artifact.value,w=value.workflow;
    if(w.authorFeedback){
      const source=retainedArtifact(archive,w.authorFeedback.source,"CHECKPOINT") as LearningCheckpoint;
      if(hash("author-feedback",w.authorFeedback)!==hash("author-feedback",await checkedAuthorFeedback(sql,attempt,archive,source)))throw new Error("AUTHOR_FEEDBACK_CHANGED");
      if(writing&&value.previous){const prior=retainedArtifact(archive,value.previous,"CHECKPOINT");const old=prior.value.schemaVersion===3?prior.value.workflow.authorFeedback:null;
        if(old?.source.digest!==w.authorFeedback.source.digest&&prior.digest!==w.authorFeedback.source.digest)throw new Error("AUTHOR_FEEDBACK_MUST_EXTEND_CURRENT_FAILURE");}
    }
    const dossier=retainedArtifact(archive,value.learning.dossier,"DOSSIER");
    if(dossier.value.schemaVersion!==3)throw new Error("COMPLETE_RESEARCH_REQUIRED");
    const research=retainedArtifact(archive,dossier.value.research,"DOSSIER");
    if(attempt.parentAttemptId){
      const required=(await rows<{required:boolean}>(sql,`SELECT EXISTS(SELECT 1 FROM "PlannerAttempt" a WHERE a.id=$1 AND a."userId"=$2 AND
        (a.payload->'understanding'->'input'->'priorReview' IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(a."intelligenceArtifacts"->'entries','{}'::jsonb)) e WHERE
          (e.value->>'kind' IN ('REVIEW','ISSUE') AND e.value->'value'->>'schemaVersion'='2') OR
          (e.value->>'kind'='CHECKPOINT' AND (e.value->'value'->>'schemaVersion'='3' OR e.value->'value'->>'stage'='INCOMPLETE')) OR
          (e.value->>'kind'='DOSSIER' AND e.value->'value'->'understanding'->'input'->'priorReview' IS NOT NULL)))) AS required`,[attempt.parentAttemptId,attempt.ownerId]))[0].required;
      if(required&&(research.value.schemaVersion!==2||!research.value.understanding.input.priorReview))reject("QUALITY_INCOMPLETE","A linked complete journey must retain its parent's exact reviewed context before advancing.","RECOVERY");
    }
    const inherited=await inheritedReviewState(sql,attempt,payload,archive,artifact as ReviewedCheckpoint);
    if(inherited)for(const old of inherited.issues){
      const local=w.issueHeads.map(ref=>retainedArtifact(archive,ref,"ISSUE")).find(i=>i.value.issueId===old.value.issueId);
      if(!local||local.value.schemaVersion!==2||local.value.inherited?.attemptId!==old.attemptId||local.value.inherited.issue.digest!==old.digest)throw new Error("INHERITED_ISSUE_HISTORY_OMITTED");
    }
    if(w.requested.length!==attempt.targets.length||new Set(w.requested.map(t=>t.planId)).size!==attempt.targets.length)throw new Error("ORIGINAL_REVIEW_TARGETS_REQUIRED");
    for(const t of attempt.targets){const original=w.requested.find(r=>r.planId===t.planId),intent=await loadIntent(sql,attempt.ownerId,t.requestedIntentVersionId);if(!original||original.intentId!==intent.intentVersionId||hash("canonical-intent",original.intent)!==hash("canonical-intent",intent.intent))throw new Error("ORIGINAL_REVIEW_INTENT_CHANGED");}
    retainedLearningInput(archive,artifact as ReviewedCheckpoint);
    if(w.candidate)reviewedCandidateBinding(archive,w.candidate,w.issueHeads);
    if(new Set(w.history.map(ref=>ref.id)).size!==w.history.length)throw new Error("REVIEW_HISTORY_DUPLICATE");
    for(const ref of w.history)if(retainedArtifact(archive,ref,"REVIEW").value.schemaVersion!==2)throw new Error("REVIEW_HISTORY_VERSION_MISMATCH");
    for(const ref of w.issueHeads)if(retainedArtifact(archive,ref,"ISSUE").value.schemaVersion!==2)throw new Error("ISSUE_HISTORY_VERSION_MISMATCH");
    if(w.assessment?.digest!==(w.history.at(-1)?.digest??undefined))throw new Error("REVIEW_HISTORY_HEAD_CHANGED");
    if(value.learning.call&&hash("learning-call",value.learning.call)!==hash("learning-call",retainedLearningCall(archive,artifact as ReviewedCheckpoint).binding))throw new Error("REVIEW_INPUT_CHANGED");
    if(w.recovery){
      const previous=value.previous?retainedArtifact(archive,value.previous,"CHECKPOINT"):null;
      if(previous?.value.schemaVersion!==3||previous.value.learning.call?.role!=="REVIEWER"||value.learning.call?.role!=="REVIEWER"||
        previous.value.workflow.candidate?.digest!==w.candidate?.digest||hash("review-recovery",w.recovery)!==hash("review-recovery",await rejectedReviewRecovery(sql,attempt,archive,previous as ReviewedCheckpoint)))throw new Error("REVIEW_RECOVERY_CORRESPONDENCE");
    }
    if(writing&&hash("issue-heads",w.issueHeads)!==hash("issue-heads",currentIssueHeads(archive).map(artifactRef)))throw new Error("ISSUE_HISTORY_OMITTED");
    if(writing&&value.previous){const prior=retainedArtifact(archive,value.previous,"CHECKPOINT");if(prior.value.schemaVersion===3){const history=prior.value.workflow.history;
      if(w.history.length<history.length||w.history.length>history.length+1||history.some((ref,i)=>ref.digest!==w.history[i].digest))throw new Error("REVIEW_HISTORY_REWRITTEN");}}
    if(value.stage==="READY"){
      const review=w.assessment?retainedArtifact(archive,w.assessment,"REVIEW"):null;
      if(!review||review.value.schemaVersion!==2||review.value.verdict!=="APPROVED"||!review.value.completeResultInspected||review.value.binding.allocation.digest!==w.candidate?.digest||
        hash("issue-heads",review.value.issueHeads)!==hash("issue-heads",w.issueHeads)||review.value.binding.dossier.digest!==value.learning.dossier.digest||
        review.value.binding.translation.digest!==value.learning.translation?.digest||review.value.binding.strategies[0]?.digest!==value.learning.strategy?.digest)throw new Error("EXACT_COMPLETE_REVIEW_REQUIRED");
    }
    return;
  }
  if(!(artifact.kind==="REVIEW"||artifact.kind==="ISSUE")||artifact.value.schemaVersion!==2)return;
  const origin=retainedArtifact(archive,artifact.value.input,"CHECKPOINT");
  if(origin.value.schemaVersion===1)throw new Error("REVIEWED_INPUT_VERSION_REQUIRED");
  if(artifact.kind==="ISSUE"&&artifact.value.inherited&&!artifact.value.previous){
    const local=origin as LearningCheckpoint;
    if(local.value.stage!=="ALLOCATION"||!local.value.learning.allocated)throw new Error("INHERITED_ALLOCATION_REQUIRED");
    const parent=await inheritedReviewState(sql,attempt,payload,archive,local),link=artifact.value.inherited;
    const previous=parent?.issues.find(i=>i.attemptId===link.attemptId&&i.id===link.issue.id&&i.digest===link.issue.digest);
    if(!previous||hash("inherited-issue",artifact.value)!==hash("inherited-issue",inheritedIssueValue(previous,local)))throw new Error("INHERITED_ISSUE_PROVENANCE_CHANGED");return;
  }
  if(artifact.kind==="ISSUE"&&artifact.value.disposition==="ADDRESSED"){
    const source=origin as LearningCheckpoint,v=artifact.value,call=source.value.learning.call;
    if(v.producerCallId===null){
      const old=v.previous?retainedArtifact(archive,v.previous,"ISSUE"):null;
      if(source.value.schemaVersion!==3||source.value.stage!=="ALLOCATION"||source.value.workflow.route!=="ALLOCATION"||!source.value.workflow.assessment||!source.value.learning.allocated||source.value.learning.allocated.allocation.status!=="FEASIBLE"||
        v.allocationCorrection?.digest!==source.digest||old?.value.schemaVersion!==2||old.value.disposition!=="OPEN"||old.value.route!=="ALLOCATION"||!source.value.workflow.issueHeads.some(r=>r.digest===old.digest)||!allocationCorrectionChanged(archive,source as ReviewedCheckpoint))throw new Error("ACTUAL_ALLOCATION_CORRECTION_REQUIRED");
      const expected={...old.value,previous:artifactRef(old),disposition:"ADDRESSED",candidateDigest:educationDigest(reviewedCandidateBinding(archive,artifactRef(source))),affected:[artifactRef(source)],input:artifactRef(source),producerCallId:null,allocationCorrection:artifactRef(source),explanation:allocationAddressedExplanation};
      if(hash("issue-value",v)!==hash("issue-value",expected))throw new Error("ALLOCATION_CORRECTION_CHANGED");return;
    }
    if(!call||call.role==="REVIEWER"||!v.previous)throw new Error("CORRECTIVE_AUTHOR_REQUIRED");
    const actual=await readLearningResponse(sql,attempt,call),old=retainedArtifact(archive,v.previous,"ISSUE");
    if(old.value.schemaVersion!==2||old.value.disposition!=="OPEN")throw new Error("EXACT_PENDING_ISSUE_REQUIRED");
    const local=source.value.schemaVersion===3&&call.protocolVersion===2&&source.value.workflow.assessment&&source.value.workflow.issueHeads.some(r=>r.digest===old.digest);
    const parent=!local&&source.value.schemaVersion===2&&call.protocolVersion===1&&old.value.inherited&&!old.value.previous?await inheritedReviewState(sql,attempt,payload,archive,source):null;
    if(!local&&!parent)throw new Error("ACTUAL_CORRECTIVE_CONTEXT_REQUIRED");
    const oldValue=old.value;
    if(parent&&!parent.issues.some(p=>p.value.issueId===oldValue.issueId&&p.digest===oldValue.inherited?.issue.digest))throw new Error("INHERITED_PENDING_ISSUE_CHANGED");
    const candidate=v.affected.map(r=>archive.entries[r.id]).find(a=>a?.kind==="CHECKPOINT"&&a.value.schemaVersion!==1&&a.value.stage==="ALLOCATION");
    if(candidate?.kind!=="CHECKPOINT"||candidate.value.schemaVersion===1)throw new Error("FULL_CORRECTIVE_ALLOCATION_REQUIRED");
    if(source.value.schemaVersion===3&&(!source.value.workflow.candidate||authoredEducationDigest(archive,artifactRef(candidate))===authoredEducationDigest(archive,source.value.workflow.candidate))||
      parent&&!linkedCorrectionChanged(parent,archive,candidate as LearningCheckpoint))throw new Error("UNCHANGED_EDUCATION_IS_NOT_A_REPAIR");
    const authorRef=call.role==="STRATEGIST"?candidate.value.learning.strategy:candidate.value.learning.translation;
    const author=authorRef?archive.entries[authorRef.id]:null;
    if(!author||!(author.kind==="STRATEGY"||author.kind==="TRANSLATION")||author.value.producer.callId!==actual.producer.callId)throw new Error("ACTUAL_CORRECTIVE_AUTHOR_REQUIRED");
    const expected={...old.value,previous:v.previous,disposition:"ADDRESSED",candidateDigest:educationDigest(reviewedCandidateBinding(archive,artifactRef(candidate))),affected:[artifactRef(candidate)],input:artifactRef(source),producerCallId:actual.producer.callId,explanation:parent?linkedAddressedExplanation:addressedExplanation};
    if(hash("issue-value",v)!==hash("issue-value",expected))throw new Error("CORRECTION_ATTEMPT_CHANGED");return;
  }
  if(origin.value.schemaVersion!==3)throw new Error("ACTUAL_REVIEWED_INPUT_REQUIRED");
  const source=origin as ReviewedCheckpoint;
  const {actual,checked,previous}=await checkedRetainedReview(sql,attempt,archive,source);
  if(!source.value.workflow.candidate)throw new Error("REVIEW_CANDIDATE_REQUIRED");
  const before=reviewedCandidateBinding(archive,source.value.workflow.candidate,source.value.workflow.issueHeads);
  const events=Object.values(archive.entries).filter(a=>a.kind==="ISSUE"&&a.value.schemaVersion===2&&a.value.input.id===origin.id&&a.value.producerCallId===actual.producer.callId);
  const opening=[...events,...(artifact.kind==="ISSUE"&&!events.some(e=>e.id===artifact.id)?[artifact]:[])].filter(a=>a.kind==="ISSUE"&&a.value.previous===null);
  const ids=new Map<string,string>();
  for(const a of opening)if(a.kind==="ISSUE"&&a.value.schemaVersion===2){const key=`${a.value.planRef}/${a.value.finding.issueId}`;if(ids.has(key)&&ids.get(key)!==a.value.issueId)throw new Error("DUPLICATE_REVIEW_FINDING");ids.set(key,a.value.issueId);}
  // While opening one issue at a time, remaining IDs are irrelevant to checking
  // that individual value; final Review retention requires every actual event.
  for(const f of checked.findings)if(!ids.has(`${f.planRef}/${f.finding.issueId}`))ids.set(`${f.planRef}/${f.finding.issueId}`,artifact.kind==="ISSUE"?artifact.value.issueId:"00000000-0000-4000-8000-000000000000");
  const values=reviewIssueValues((reviewedRoleInputV1(archive,source) as {input:Parameters<typeof validateCompleteReview>[1]}).input,checked,previous,artifactRef(source),actual.producer,educationDigest(before),ids);
  if(artifact.kind==="ISSUE"){
    if(!values.some(value=>hash("issue-value",value)===hash("issue-value",artifact.value)))throw new Error("ISSUE_DIFFERS_FROM_ACTUAL_REVIEW");return;
  }
  if(Object.values(archive.entries).some(a=>a.kind==="REVIEW"&&a.id!==artifact.id&&a.value.producer.callId===actual.producer.callId))throw new Error("REVIEW_RESPONSE_ALREADY_ASSEMBLED");
  const heads=new Map(previous.map(p=>[p.value.issueId,artifactRef(p)]));
  for(const value of values){const event=events.find(e=>hash("issue-value",e.value)===hash("issue-value",value));if(!event)throw new Error("REVIEW_ISSUE_HISTORY_MISSING");heads.set(value.issueId,artifactRef(event));}
  const binding=reviewedCandidateBinding(archive,source.value.workflow.candidate,[...heads].sort(([a],[b])=>a.localeCompare(b)).map(([,ref])=>ref));
  const expected={schemaVersion:2,input:artifactRef(source),candidateDigest:candidateDigest(binding),producer:actual.producer,verdict:checked.response.verdict,completeResultInspected:checked.response.completeResultInspected,
    issueHeads:binding.issueHeads,rubricVersion,explanation:checked.response.explanation,binding,progressDigest:reviewProgressDigest(archive,binding)};
  if(hash("complete-review",artifact.value)!==hash("complete-review",expected))throw new Error("REVIEW_DIFFERS_FROM_ACTUAL_RESPONSE");
}

/** Subsequent methods compose this boundary through the existing natural stage
 * and Attempt lifecycle. Nothing here creates a separate worker or AI engine. */
export class ReviewedLearningStage {
  constructor(readonly natural:NaturalLearningStage,readonly research:ResearchUnderstanding){}
  get attempts(){return this.natural.attempts;}
  private async runNatural(token:LeaseToken,signal:AbortSignal){
    try{return await this.natural.run(token,signal);}catch(error){
      signal.throwIfAborted();
      if(!(error instanceof DurablePlannerError)||error.detail.code!=="INVALID_OUTPUT")throw error;
      const {checkpoint}=await this.natural.state(token);
      if(checkpoint?.value.stage!=="TRANSLATION"||checkpoint.value.learning.call?.role!=="TRANSLATOR")throw error;
      let advanced:boolean;
      try{advanced=await this.routeIncomplete(token,checkpoint);}catch{throw error;}
      if(!advanced)reject("QUALITY_INCOMPLETE","Translation repeated the same invalid result; the complete strategy and rejected responses are retained.","BLUEPRINT");
      return (await this.natural.state(token)).checkpoint!;
    }
  }
  async routeIncomplete(token:LeaseToken,source:LearningCheckpoint){
    const state=await this.natural.state(token),feedback=await this.attempts.mutate(token,(sql,attempt)=>checkedAuthorFeedback(sql,attempt,state.archive,source));
    if(Object.values(state.archive.entries).some(a=>a.kind==="CHECKPOINT"&&a.value.schemaVersion===3&&a.value.workflow.authorFeedback?.progressDigest===feedback.progressDigest))return false;
    const prior=source.value.schemaVersion===3?source.value.workflow:null;
    const requested=prior?.requested??await this.attempts.mutate(token,async(sql,attempt)=>Promise.all(attempt.targets.map(async t=>({planId:t.planId,intentId:t.requestedIntentVersionId,intent:(await loadIntent(sql,attempt.ownerId,t.requestedIntentVersionId)).intent}))));
    const route=feedback.kind==="INCOMPLETE"?(feedback.response.needsDecision?"RESEARCH":feedback.response.route):"TRANSLATOR";
    const workflow={schemaVersion:1 as const,candidate:prior?.candidate??null,assessment:prior?.assessment??null,requested,previousStrategy:source.value.learning.strategy,previousTranslation:source.value.learning.translation,
      issueHeads:currentIssueHeads(state.archive).map(artifactRef),history:prior?.history??[],route,benefit:feedback.kind==="INCOMPLETE"?feedback.response.explanation:"Resolve the exact retained correspondence gaps without discarding educational meaning.",recovery:null,authorFeedback:feedback};
    const patch={call:null,allocated:null,translated:null,strategy:route==="STRATEGIST"?null:source.value.learning.strategy,translation:route==="RESEARCH"?source.value.learning.translation:null};
    if(route!=="RESEARCH"){
      await this.natural.write(token,source,"REFINEMENT","Actual translator feedback routes the next substantive correction before independent review.",patch,undefined,null,workflow);return true;
    }
    const key=randomUUID();
    await this.attempts.mutate(token,async(sql,attempt,payload,now)=>{
      const retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);if(retained.compilerVersion!==2||headOf(retained.archive)?.digest!==source.digest)throw new Error("AUTHOR_HANDOFF_CHANGED");
      await this.natural.writeAccepted(sql,attempt,payload,now,token,source,"INCOMPLETE","Actual translator incompleteness requires Research; no student answer or permission is assumed.",patch,undefined,"RESEARCH",workflow);
      await this.attempts.failAccepted(sql,token,attempt,payload,new DurablePlannerError("QUALITY_INCOMPLETE","Actual translator feedback requires linked Research before education can be completed.","RESEARCH"));
      const frozen=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);if(frozen.compilerVersion!==2)throw new Error("AUTHOR_HANDOFF_VERSION_REQUIRED");
      await this.research.continueAccepted(sql,attempt.ownerId,{key,parentAttemptId:attempt.attemptId,expectedResearchDigest:readUnderstanding(payload.understanding).digest,expectedFoundationDigest:archiveDigest(frozen.archive),answers:[],
        intents:attempt.targets.map(t=>({planId:t.planId,expectedIntentId:t.resolvedIntentVersionId!,expectedPlanningVersion:t.resolvedPlanningVersion!,baseRevisionId:t.baseActiveRevisionId}))});
    });
    return false;
  }
  async inheritIssues(token:LeaseToken,candidate:LearningCheckpoint){
    if(!candidate.value.learning.allocated)throw new Error("INHERITED_ALLOCATION_REQUIRED");
    await this.attempts.mutate(token,async(sql,attempt,payload,now)=>{
      const retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);
      if(retained.compilerVersion!==2||headOf(retained.archive)?.digest!==candidate.digest)return;
      const archive=retained.archive,parent=await inheritedReviewState(sql,attempt,payload,archive,candidate);if(!parent)return;
      for(const old of parent.issues){
        const exists=Object.values(archive.entries).find(a=>a.kind==="ISSUE"&&a.value.issueId===old.value.issueId);
        if(exists)continue;
        const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"ISSUE",inheritedIssueValue(old,candidate));archive.entries[saved.artifact.id]=saved.artifact;
      }
      if(candidate.value.schemaVersion!==2||!linkedCorrectionChanged(parent,archive,candidate))return;
      const authored=retainedArtifact(archive,candidate.value.learning.strategy!,"STRATEGY");if(authored.value.schemaVersion!==2)throw new Error("LINKED_AUTHOR_REQUIRED");
      const origin=retainedArtifact(archive,authored.value.input,"CHECKPOINT"),binding=reviewedCandidateBinding(archive,artifactRef(candidate));
      for(const issue of currentIssueHeads(archive))if(issue.value.schemaVersion===2&&issue.value.disposition==="OPEN"&&!issue.value.previous&&issue.value.inherited){
        const link=issue.value.inherited;if(!parent.issues.some(i=>i.digest===link.issue.digest))continue;
        const value={...issue.value,previous:artifactRef(issue),disposition:"ADDRESSED",candidateDigest:educationDigest(binding),affected:[artifactRef(candidate)],input:artifactRef(origin),producerCallId:authored.value.producer.callId,explanation:linkedAddressedExplanation};
        const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"ISSUE",value);archive.entries[saved.artifact.id]=saved.artifact;
      }
    });
  }
  async prepare(token:LeaseToken,candidate:LearningCheckpoint){
    if(!candidate.value.learning.allocated)reject("QUALITY_INCOMPLETE","Allocate complete education before complete-result review.","REVIEW");
    await this.inheritIssues(token,candidate);
    const state=await this.natural.state(token),current=state.checkpoint!,policy=await this.attempts.rolePolicy(token,"REVIEWER");
    const prior=current.value.schemaVersion===3?current.value.workflow:null;
    const requested=prior?.requested??await this.attempts.mutate(token,async(sql,attempt)=>Promise.all(attempt.targets.map(async t=>({planId:t.planId,intentId:t.requestedIntentVersionId,intent:(await loadIntent(sql,attempt.ownerId,t.requestedIntentVersionId)).intent}))));
    const workflow={schemaVersion:1 as const,candidate:artifactRef(candidate),assessment:prior?.assessment??null,requested,
      previousStrategy:prior?.previousStrategy??null,previousTranslation:prior?.previousTranslation??null,
      issueHeads:currentIssueHeads(state.archive).map(artifactRef),history:prior?.history??[],route:prior?.route??null,benefit:prior?.benefit??null,recovery:null,...(prior?.authorFeedback?{authorFeedback:prior.authorFeedback}:{})};
    const key=`reviewer_${randomUUID().replaceAll("-","")}`,responseContract=z.toJSONSchema(CompleteReviewResponseSchema),provisional={protocolVersion:2 as const,role:"REVIEWER" as const,key,purpose:"REVIEW" as const,promptDigest:"0".repeat(64),inputDigest:"0".repeat(64),outputCap:policy.call.completionTokens,systemInstruction:completeReviewInstruction,responseContract};
    const pinned={...candidate,value:{...candidate.value,schemaVersion:3,workflow,learning:{...candidate.value.learning,input:candidate.value.learning.input??artifactRef(candidate),snapshot:null,allocated:null,call:provisional}}} as ReviewedCheckpoint;
    const request=reviewedRoleCall("REVIEWER",key,"REVIEW",completeReviewInstruction,reviewedRoleInputV1(state.archive,pinned),policy.call.completionTokens,responseContract);
    return this.natural.write(token,current,"REVIEW","Complete independent review input retained before dispatch.",{dossier:candidate.value.learning.dossier,capacity:candidate.value.learning.capacity,strategy:candidate.value.learning.strategy,translation:candidate.value.learning.translation,translated:null,allocated:null,call:request.binding},undefined,null,workflow);
  }
  async dispatch(token:LeaseToken,checkpoint:ReviewedCheckpoint,signal:AbortSignal){
    const state=await this.natural.state(token),request=retainedLearningCall(state.archive,checkpoint),packet=reviewedRoleInputV1(state.archive,checkpoint);
    if(state.checkpoint?.digest!==checkpoint.digest)reject("STALE_CONTEXT","Independent review input is no longer the retained pending head.","RECOVERY");
    const dispatched=await this.attempts.mutate(token,async(sql,attempt)=>(await rows(sql,'SELECT id FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->\'roleCall\'->>\'key\'=$2',[attempt.attemptId,checkpoint.value.learning.call!.key])).length>0);
    if(!dispatched)await this.natural.capacity.assertCurrent(token.ownerId,token.attemptId,checkpoint.value.learning.capacity);
    if(!("input" in packet))throw new Error("REVIEW_INPUT_REQUIRED");
    const previous=checkpoint.value.workflow.issueHeads.map(r=>retainedArtifact(state.archive,r,"ISSUE"));
    await dispatchMeteredProvider(workerProviderMeter(this.attempts,token),{...request,policy:{purpose:"REVIEW"},signal,
      validate:r=>validateCompleteReview(JSON.parse(r.text!),packet.input,previous,checkpoint.value.workflow.recovery?{concerns:checkpoint.value.workflow.recovery.concerns}:undefined)},this.natural.learning.dependencies.provider);
  }
  async assemble(token:LeaseToken,checkpoint:ReviewedCheckpoint){
    return this.attempts.mutate(token,async(sql,attempt,payload,now)=>{
      const retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);
      if(retained.compilerVersion!==2||headOf(retained.archive)?.digest!==checkpoint.digest)reject("STALE_CONTEXT","Independent review checkpoint changed before assembly.","RECOVERY");
      const archive=retained.archive,{actual,packet,previous,checked}=await checkedRetainedReview(sql,attempt,archive,checkpoint);
      const candidate=checkpoint.value.workflow.candidate!;
      const bindingBefore=reviewedCandidateBinding(archive,candidate,checkpoint.value.workflow.issueHeads),ids=new Map(checked.findings.map(f=>[`${f.planRef}/${f.finding.issueId}`,randomUUID()]));
      const values=reviewIssueValues(packet.input,checked,previous,artifactRef(checkpoint),actual.producer,educationDigest(bindingBefore),ids);
      for(const value of values){const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"ISSUE",value);archive.entries[saved.artifact.id]=saved.artifact;}
      const binding=reviewedCandidateBinding(archive,candidate),value={schemaVersion:2,input:artifactRef(checkpoint),candidateDigest:candidateDigest(binding),producer:actual.producer,verdict:checked.response.verdict,
        completeResultInspected:checked.response.completeResultInspected,issueHeads:binding.issueHeads,rubricVersion,explanation:checked.response.explanation,binding,progressDigest:reviewProgressDigest(archive,binding)};
      const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"REVIEW",value);
      return this.natural.writeAccepted(sql,attempt,payload,now,token,checkpoint,"REVIEW","The independent complete-result assessment and every issue disposition are retained.",{call:null},undefined,null,
        {assessment:artifactRef(saved.artifact),history:[...checkpoint.value.workflow.history,artifactRef(saved.artifact)],issueHeads:binding.issueHeads,recovery:null});
    });
  }
  async correctRejected(token:LeaseToken,checkpoint:ReviewedCheckpoint){
    const state=await this.natural.state(token),call=checkpoint.value.learning.call;
    if(state.checkpoint?.digest!==checkpoint.digest||call?.protocolVersion!==2||call.role!=="REVIEWER")throw new Error("EXACT_REJECTED_REVIEW_REQUIRED");
    const recovery=await this.attempts.mutate(token,(sql,attempt)=>rejectedReviewRecovery(sql,attempt,state.archive,checkpoint));
    if(Object.values(state.archive.entries).some(a=>a.kind==="CHECKPOINT"&&a.value.schemaVersion===3&&a.value.workflow.recovery?.responseDigest===recovery.responseDigest))
      reject("QUALITY_INCOMPLETE","Independent review repeated the same invalid result; retain the complete response and concerns for explicit continuation.","REVIEW");
    const key=`reviewer_${randomUUID().replaceAll("-","")}`,pinned={...checkpoint,value:{...checkpoint.value,workflow:{...checkpoint.value.workflow,recovery},learning:{...checkpoint.value.learning,call:{...call,key}}}} as ReviewedCheckpoint;
    const request=reviewedRoleCall("REVIEWER",key,call.purpose,call.systemInstruction,reviewedRoleInputV1(state.archive,pinned),call.outputCap,call.responseContract);
    return this.natural.write(token,checkpoint,"REVIEW","An explicitly linked complete review corrects every rejected concern using the original frozen facts.",{call:request.binding},undefined,null,{recovery}) as Promise<ReviewedCheckpoint>;
  }
  /** ADDRESSED records a real corrective attempt, never verified resolution. */
  async addressed(token:LeaseToken,candidate:LearningCheckpoint){
    if(candidate.value.schemaVersion!==3||!candidate.value.learning.allocated)return candidate;
    const workflow=candidate.value.workflow;
    return this.attempts.mutate(token,async(sql,attempt,payload,now)=>{
      const read=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);if(read.compilerVersion!==2||headOf(read.archive)?.digest!==candidate.digest)throw new Error("CORRECTIVE_HEAD_CHANGED");
      const archive=read.archive,route=workflow.route;
      if(route==="ALLOCATION"){
        if(candidate.value.learning.allocated?.allocation.status!=="FEASIBLE"||!allocationCorrectionChanged(archive,candidate as ReviewedCheckpoint))return candidate;
        const binding=reviewedCandidateBinding(archive,artifactRef(candidate));
        for(const issue of currentIssueHeads(archive))if(issue.value.schemaVersion===2&&issue.value.disposition==="OPEN"&&issue.value.route==="ALLOCATION"){
          const value={...issue.value,previous:artifactRef(issue),disposition:"ADDRESSED",candidateDigest:educationDigest(binding),affected:[artifactRef(candidate)],input:artifactRef(candidate),producerCallId:null,allocationCorrection:artifactRef(candidate),explanation:allocationAddressedExplanation};
          const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"ISSUE",value);archive.entries[saved.artifact.id]=saved.artifact;
        }
        return candidate;
      }
      if(route!=="STRATEGIST"&&route!=="TRANSLATOR")return candidate;
      const authored=retainedArtifact(archive,(route==="STRATEGIST"?candidate.value.learning.strategy:candidate.value.learning.translation)!,route==="STRATEGIST"?"STRATEGY":"TRANSLATION");
      if(authored.value.schemaVersion!==2)throw new Error("CORRECTIVE_VERSION_REQUIRED");
      const origin=retainedArtifact(archive,authored.value.input,"CHECKPOINT");if(origin.value.schemaVersion!==3)throw new Error("CORRECTIVE_INPUT_REQUIRED");
      if(!origin.value.workflow.candidate||authoredEducationDigest(archive,artifactRef(candidate))===authoredEducationDigest(archive,origin.value.workflow.candidate))return candidate;
      const binding=reviewedCandidateBinding(archive,artifactRef(candidate));
      for(const issue of currentIssueHeads(archive))if(issue.value.schemaVersion===2&&issue.value.disposition==="OPEN"){
        const value={...issue.value,previous:artifactRef(issue),disposition:"ADDRESSED",candidateDigest:educationDigest(binding),affected:[artifactRef(candidate)],input:artifactRef(origin),producerCallId:authored.value.producer.callId,explanation:addressedExplanation};
        const saved=await this.natural.foundation.appendAccepted(sql,attempt,payload,now,token,archiveDigest(archive),"ISSUE",value);archive.entries[saved.artifact.id]=saved.artifact;
      }
      // The allocation is already immutable. The next review pins the new
      // global issue heads; copying the entire graph just to update heads would
      // create another candidate without new education or placement.
      return candidate;
    });
  }
  async handoffResearch(token:LeaseToken,current:ReviewedCheckpoint){
    return this.attempts.mutate(token,async(sql,attempt,payload,now)=>{
      const retained=await loadAttemptArtifacts(sql,attempt.ownerId,attempt.attemptId);
      if(retained.compilerVersion!==2||headOf(retained.archive)?.digest!==current.digest||!current.value.workflow.assessment||current.value.learning.call)reject("STALE_CONTEXT","The actual complete assessment changed before its Research handoff.","RECOVERY");
      const assessment=retainedArtifact(retained.archive,current.value.workflow.assessment,"REVIEW");if(assessment.value.schemaVersion!==2)throw new Error("COMPLETE_REVIEW_REQUIRED");
      const origin=retainedArtifact(retained.archive,assessment.value.input,"CHECKPOINT") as ReviewedCheckpoint,{checked}=await checkedRetainedReview(sql,attempt,retained.archive,origin),response=checked.response;
      if(response.verdict!=="NEEDS_DECISION"&&!(response.verdict==="REVISE"&&response.next?.route==="RESEARCH"))throw new Error("ACTUAL_RESEARCH_ROUTE_REQUIRED");
      const reviewResearch=ReviewedResearchHandoffSchema.parse({schemaVersion:1,assessment:artifactRef(assessment),kind:response.verdict==="NEEDS_DECISION"?"CLARIFICATION":"REINVESTIGATION",questions:response.questions});
      if(payload.reviewResearch&&hash("review-research-handoff",payload.reviewResearch)!==hash("review-research-handoff",reviewResearch))throw new Error("REVIEW_HANDOFF_IMMUTABLE");
      const checkpoint=await this.natural.writeAccepted(sql,attempt,payload,now,token,current,reviewResearch.kind==="CLARIFICATION"?"NEEDS_DECISION":"INCOMPLETE",
        "The complete assessment routes verified investigation or an actual consequential student decision through the existing Research continuation.",{},undefined,"RESEARCH");
      const retainedPayload={...payload,reviewResearch};
      if(reviewResearch.kind==="CLARIFICATION"){
        const question=reviewResearch.questions.map(q=>q.question).join(" ");
        await this.attempts.needsDecisionAccepted(sql,token,attempt,retainedPayload,question.length<=1000?question:"Independent review needs your decisions on the retained consequential questions.");
      }else{
        const run=readUnderstanding(payload.understanding);
        await this.attempts.failAccepted(sql,token,attempt,retainedPayload,new DurablePlannerError("QUALITY_INCOMPLETE","The actual complete assessment requires linked Research reinvestigation; the existing continuation retains its original permissions and resource root.","RESEARCH"));
        await this.research.continueAccepted(sql,attempt.ownerId,{key:`review_${assessment.id}`,parentAttemptId:attempt.attemptId,expectedResearchDigest:run.digest,answers:[],
          intents:attempt.targets.map(t=>({planId:t.planId,expectedIntentId:t.resolvedIntentVersionId!,expectedPlanningVersion:t.resolvedPlanningVersion!,baseRevisionId:t.baseActiveRevisionId}))});
      }
      return checkpoint;
    });
  }
  async run(token:LeaseToken,signal:AbortSignal):Promise<LearningCheckpoint>{
    for(;;){
      signal.throwIfAborted();
      let {archive,checkpoint}=await this.natural.state(token);
      if(!checkpoint){checkpoint=await this.runNatural(token,signal);archive=(await this.natural.state(token)).archive;}
      if(checkpoint.value.schemaVersion===2&&!checkpoint.value.learning.allocated&&!['INCOMPLETE','NEEDS_DECISION'].includes(checkpoint.value.stage)){
        checkpoint=await this.runNatural(token,signal);archive=(await this.natural.state(token)).archive;
      }
      const before=checkpoint.value.previous?retainedArtifact(archive,checkpoint.value.previous,"CHECKPOINT"):null;
      const receipt=checkpoint.value.learning.translation?retainedArtifact(archive,checkpoint.value.learning.translation,"TRANSLATION"):null;
      const authorIncomplete=before?.value.schemaVersion!==1&&before?.value.learning.call?.role==="TRANSLATOR"||receipt?.value.schemaVersion===2&&(receipt.value.ambiguities.length>0||receipt.value.elements.some(e=>e.disposition==="GAP"));
      if(checkpoint.value.stage==="INCOMPLETE"&&checkpoint.value.learning.strategy&&authorIncomplete){
        if(await this.routeIncomplete(token,checkpoint))continue;
        return checkpoint;
      }
      if(checkpoint.value.schemaVersion!==3){
        if(!checkpoint.value.learning.allocated)return checkpoint;
        await this.prepare(token,checkpoint);continue;
      }
      const current=checkpoint as ReviewedCheckpoint;
      if(current.value.stage==="INCOMPLETE"||current.value.stage==="NEEDS_DECISION")return current;
      if(current.value.stage==="READY"){
        const fresh=await this.natural.fresh(token,current,signal,current.value.learning.translation!);
        if(fresh.capacity.digest===current.value.learning.capacity.digest)return current;
        const accepted=retainedArtifact(archive,current.value.workflow.candidate!,"CHECKPOINT") as LearningCheckpoint;
        const allocation=accepted.value.learning.allocated!;
        await this.natural.write(token,current,"REFINEMENT","Calendar changed after approval; retain the historical assessment and reallocate before a fresh complete review.",
          {dossier:artifactRef(fresh.dossier),capacity:artifactRef(fresh.capacity),allocated:null,translated:{blueprints:allocation.blueprints,facts:allocation.facts,planning:allocation.planning}},undefined,null,
          {route:"ALLOCATION",benefit:"Current Calendar capacity requires full reallocation and independent review."});
        continue;
      }
      if(current.value.learning.call?.role==="REVIEWER"){
        try{await this.dispatch(token,current,signal);}catch(error){
          signal.throwIfAborted();
          if(error instanceof DurablePlannerError&&error.detail.code==="STALE_CONTEXT"){
            const old=retainedArtifact(archive,current.value.workflow.candidate!,"CHECKPOINT") as LearningCheckpoint,a=old.value.learning.allocated!;
            await this.natural.write(token,current,"REFINEMENT","Capacity changed before this undispatched review; preserve education and rebuild the entire allocation before review.",
              {call:null,allocated:null,translated:{blueprints:a.blueprints,facts:a.facts,planning:a.planning}},undefined,null,{route:"ALLOCATION",benefit:"Revalidate actual capacity and the full allocation before independent review."});
            continue;
          }
          // Only a known complete rejected STOP can open a new logical call.
          // Missing/uncertain/truncated receipts retain their original failure.
          try{await this.correctRejected(token,current);}catch(recoveryError){
            if(recoveryError instanceof Error&&recoveryError.message.includes("repeated the same invalid"))throw recoveryError;
            throw error;
          }
          continue;
        }
        await this.assemble(token,current);continue;
      }
      if(current.value.stage!=="REVIEW"){
        const allocated=await this.runNatural(token,signal);
        if(allocated.value.stage==="REFINEMENT")continue;
        if(allocated.value.stage==="INCOMPLETE")continue;
        if(!allocated.value.learning.allocated||allocated.value.stage!=="ALLOCATION")return allocated;
        await this.prepare(token,await this.addressed(token,allocated));continue;
      }
      const assessment=current.value.workflow.assessment?retainedArtifact(archive,current.value.workflow.assessment,"REVIEW"):null;
      if(!assessment||assessment.value.schemaVersion!==2||!current.value.workflow.candidate)throw new Error("ACTUAL_COMPLETE_ASSESSMENT_REQUIRED");
      const origin=retainedArtifact(archive,assessment.value.input,"CHECKPOINT") as ReviewedCheckpoint;
      const {checked}=await this.attempts.mutate(token,(sql,attempt)=>checkedRetainedReview(sql,attempt,archive,origin));
      const candidate=retainedArtifact(archive,current.value.workflow.candidate,"CHECKPOINT") as LearningCheckpoint;
      const allocation=candidate.value.learning.allocated!;
      // Check after long review calls as well as immediately before dispatch.
      const fresh=await this.natural.fresh(token,current,signal,current.value.learning.translation!);
      const calendarChanged=fresh.capacity.digest!==current.value.learning.capacity.digest;
      if(!calendarChanged&&checked.response.verdict==="APPROVED")return this.natural.write(token,current,"READY","The exact complete strategy, faithful translation and feasible allocation passed independent review.",{call:null});
      if(!calendarChanged&&checked.response.verdict==="NEEDS_DECISION")return this.handoffResearch(token,current);
      if(!calendarChanged&&checked.response.verdict!=="REVISE")return this.natural.write(token,current,"INCOMPLETE","The complete independent assessment retains unresolved evidence without approval.",{call:null});
      let route=calendarChanged?"ALLOCATION" as const:checked.response.next!.route;
      const progressDigest=assessment.value.progressDigest;
      const repeated=current.value.workflow.history.slice(0,-1).map(ref=>retainedArtifact(archive,ref,"REVIEW")).filter(r=>r.value.schemaVersion===2&&r.value.progressDigest===progressDigest);
      if(!calendarChanged&&repeated.length){
        const reconsidered=repeated.some(r=>r.value.schemaVersion===2&&(retainedArtifact(archive,r.value.input,"CHECKPOINT").value as ReviewedCheckpoint["value"]).workflow.route==="REVIEWER")||origin.value.workflow.route==="REVIEWER";
        if(reconsidered)return this.natural.write(token,current,"INCOMPLETE","Repeated complete review found no credible educational progress after independent reconsideration; nothing is approved.",{});
        route="REVIEWER";
      }
      if(route==="RESEARCH")return this.handoffResearch(token,current);
      const benefit=calendarChanged?"Calendar capacity changed; preserve complete education, reallocate and independently review the whole result.":checked.response.next!.benefit;
      const next=await this.natural.write(token,current,"REFINEMENT","The complete assessment routes a substantive correction through its responsible owner.",{
        strategy:route==="STRATEGIST"?null:current.value.learning.strategy,
        translation:route==="STRATEGIST"||route==="TRANSLATOR"?null:current.value.learning.translation,
        translated:route==="ALLOCATION"?{blueprints:allocation.blueprints,facts:allocation.facts,planning:allocation.planning}:null,allocated:null,call:null,
      },undefined,null,{previousStrategy:current.value.learning.strategy,previousTranslation:current.value.learning.translation,route,benefit});
      if(route==="REVIEWER")await this.prepare(token,candidate);
      else {
        const allocated=await this.natural.run(token,signal);
        if(allocated.value.stage==="INCOMPLETE")continue;
        if(!allocated.value.learning.allocated||allocated.value.stage!=="ALLOCATION")return allocated;
        await this.prepare(token,await this.addressed(token,allocated));
      }
      void next;
    }
  }
}
