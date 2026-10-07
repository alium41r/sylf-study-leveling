import { z } from "zod";
import { CanonicalIntentV2Schema, DurableIdV2Schema, ProseV2Schema, withPlannerEnvelope } from "../contracts";
import { AttemptService, loadAttempt, newBudget, persistAttempt } from "./attempts";
import { IntentService, ownedPlan, loadIntent } from "./intents";
import { ownedDocumentMetadata } from "./documents";
import { PlannerDatabase, hash, rows, reject } from "./database";

const target = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NEW"), intent: CanonicalIntentV2Schema }),
  z.strictObject({ kind: z.literal("EXISTING"), planId: DurableIdV2Schema,
    expectedIntentVersionId: DurableIdV2Schema, expectedPlanningVersion: z.number().int().nonnegative(),
    baseActiveRevisionId: DurableIdV2Schema.nullable(), intent: CanonicalIntentV2Schema.optional() }),
]);
/** Ready canonical input only. Budgets, permissions and execution are server-owned. */
export const GenerateRequestV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: z.literal(2), requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  text: ProseV2Schema, targets: z.array(target).min(1).max(2),
  researchRequested: z.boolean().default(false), documentIds: z.array(DurableIdV2Schema).max(9).default([]), parentAttemptId: DurableIdV2Schema.optional(),
}).superRefine((request,ctx)=>{
  if(new Set(request.documentIds).size!==request.documentIds.length||request.documentIds.length&&!request.researchRequested)ctx.addIssue({code:"custom",message:"Unique owned documents require an explicit research request"});
  const ids=request.targets.flatMap(t=>t.kind==="EXISTING"?[t.planId]:[]);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Duplicate generation target"});
  if(request.parentAttemptId&&request.targets.some(t=>t.kind==="NEW"))ctx.addIssue({code:"custom",message:"Retry requires the original owned target"});
}));

/** Admission only: no provider, claim, process-local job or execution write. */
export class GenerationService {
  readonly attempts:AttemptService;
  readonly intents:IntentService;
  constructor(readonly db:PlannerDatabase){this.attempts=new AttemptService(db);this.intents=new IntentService(db);}
  async accept(ownerId:number,raw:unknown,signal?:AbortSignal){
    const request=GenerateRequestV2Schema.parse(raw),requestDigest=hash("generation-admission",request);
    signal?.throwIfAborted();
    return this.db.coordinated(ownerId,async sql=>{
      signal?.throwIfAborted();
      const existing=(await rows<{id:string}>(sql,'SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND "requestKey"=$2',[ownerId,request.requestKey]))[0];
      if(existing){const stored=await loadAttempt(sql,ownerId,existing.id);
        if(stored.payload.generationRequestDigest!==requestDigest)reject("IDEMPOTENCY_MISMATCH","This generation key belongs to different accepted input.","INTAKE");
        return {attempt:stored.attempt,replayed:true};}
      // All membership/base/CAS checks precede edits; a later failure rolls back
      // the complete save, supersession and enqueue across both selected Plans.
      for(const t of request.targets.filter(t=>t.kind==="EXISTING").sort((a,b)=>a.planId.localeCompare(b.planId))){
        const plan=await ownedPlan(sql,ownerId,t.planId);
        if(plan.contractVersion!==2||["ARCHIVED","COMPLETED"].includes(plan.state)||plan.workingIntentVersionId!==t.expectedIntentVersionId||plan.version!==t.expectedPlanningVersion||plan.activeRevisionId!==t.baseActiveRevisionId)
          reject("INTENT_CONFLICT","Reload the current owned intent, version and active baseline before generation.","INTAKE");
      }
      for(const id of request.documentIds)await ownedDocumentMetadata(sql,ownerId,id);
      const targets=[];
      for(const [i,t]of request.targets.entries()){
        let planId:string;
        if(t.kind==="NEW"){const key=hash("generation-plan",{ownerId,key:request.requestKey,index:i});
          planId=(await this.intents.createAccepted(sql,ownerId,key,t.intent)).plan.id;}
        else {planId=t.planId;if(t.intent)await this.intents.editAccepted(sql,ownerId,planId,t.expectedPlanningVersion,t.expectedIntentVersionId,t.intent);}
        const plan=await ownedPlan(sql,ownerId,planId);
        targets.push({planId,intentId:plan.workingIntentVersionId!,planningVersion:plan.version,baseRevisionId:plan.activeRevisionId});
      }
      const h=hash("generation-root",{ownerId,key:request.requestKey}),rootId=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
      const attempt=await this.attempts.enqueueAccepted(sql,ownerId,{key:request.requestKey,text:request.text,
        kind:targets.length===2?"JOINT":targets[0].baseRevisionId?"REPLAN":"PLAN",targets,
        budget:newBudget(request.researchRequested?"RESEARCH":"EDUCATIONAL",rootId),...(request.parentAttemptId?{parentAttemptId:request.parentAttemptId}:{})});
      const stored=await loadAttempt(sql,ownerId,attempt.attemptId);
      const readTargets=[];
      if(request.researchRequested)for(const t of targets){const intent=await loadIntent(sql,ownerId,t.intentId);readTargets.push({planId:t.planId,intentId:t.intentId,intentDigest:hash("research-intent",intent.intent)});}
      await persistAttempt(sql,attempt,attempt,{...stored.payload,generationRequestDigest:requestDigest,
        ...(request.researchRequested?{researchRequest:{readTargets,documentIds:request.documentIds}}:{})});
      signal?.throwIfAborted();return {attempt,replayed:false};
    });
  }
}
