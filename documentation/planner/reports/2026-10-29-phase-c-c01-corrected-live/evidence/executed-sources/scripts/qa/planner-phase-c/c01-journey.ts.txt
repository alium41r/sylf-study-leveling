/** One isolated qualification caller of the existing durable compiler; no production route changes. */
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import { CanonicalIntentV2Schema, PlanChangeSetV2Schema, type PlannerAttemptV2 } from "../../../lib/planner/v2/contracts";
import { PlannerDatabase } from "../../../lib/planner/v2/server/database";
import { GenerationService } from "../../../lib/planner/v2/server/generation";
import { IntentService } from "../../../lib/planner/v2/server/intents";
import { AttemptService, loadAttempt, type AttemptPayload } from "../../../lib/planner/v2/server/attempts";
import { DocumentRepository } from "../../../lib/planner/v2/server/documents";
import { ResearchService } from "../../../lib/planner/v2/server/research";
import { PlannerWorker } from "../../../lib/planner/v2/server/worker";
import { createCompilerHandlers } from "../../../lib/planner/v2/server/compiler";
import { ApplyService } from "../../../lib/planner/v2/server/apply";
import { offlineResourcePolicy } from "../../../lib/planner/v2/intelligence/foundation/role-calls";
import { reviewedCandidateBinding, reviewProgressDigest } from "../../../lib/planner/v2/intelligence/foundation/validation";
import { DeepSeekAdapter } from "../../../lib/ai/providers/deepseek";
import { TimezoneService } from "../../../lib/timezone-service";
import { addDays } from "../../../lib/calendar/dates";
import type { LLMAdapter } from "../../../lib/ai/providers/types";
import type { LearningInput } from "../../../lib/planner/v2/intelligence/schemas/natural-learning";
import type { FoundationArchive } from "../../../lib/planner/v2/intelligence/foundation/contracts";
import type { StrategyDocument } from "../../../lib/planner/v2/intelligence/foundation/contracts";
import { naturalProposal } from "../../../__tests__/planner-v2/intelligence/natural-learning-fixture";
import { funding, reportPath } from "./c01-profile.mjs";
import { readC01, profileId } from "./c01-profile.mjs";
import { auditC01Calendar, auditC01Capacity, auditC01Schedule } from "./c01-calendar";
import { requestCancellation, readCancellation } from "./operator-control.mjs";
import { loadExecutionContext } from "../../../lib/planner/v2/server/context";
import { ownedPlan, loadIntent } from "../../../lib/planner/v2/server/intents";
import { guardedAdapter, roleOf } from "./execution-guard.mjs";

type Trace = Record<string, unknown>;
type RootRow = {id:string;artifact:PlannerAttemptV2;payload:AttemptPayload;intelligenceArtifacts:unknown};
const sha = (v: string|Uint8Array) => createHash("sha256").update(v).digest("hex");
const sleep = (ms:number) => new Promise(r => setTimeout(r,ms));
export async function runC01(client:pg.Client,pool:pg.Pool,config:{mode:"LIVE"|"SCRIPTED"|"LONG_REVIEW"|"CANCEL_IN_FLIGHT"|"PROVIDER_FAILURE"|"REFINEMENT";output:string;runId:string;privateKeyPath?:string;ceilingUsd:number;approved:boolean}) {
  if(config.ceilingUsd!==1.75||config.mode==="LIVE"&&!config.approved)throw new Error("EXPLICIT_C01_AUTHORIZATION_REQUIRED");
  mkdirSync(resolve(config.output,"calls"),{recursive:true});
  const save=(name:string,value:unknown)=>writeFileSync(resolve(config.output,name),JSON.stringify(value,null,2)+"\n");
  const c=readC01();
  if(c.anchor!==addDays(TimezoneService.getUserLocalDate(c.timezone),1))throw new Error("FROZEN_ANCHOR_CHANGED");
  const db=new PlannerDatabase(pool),attempts=new AttemptService(db);
  const name=randomUUID(),owner=(await client.query('INSERT INTO "User" (email,username,timezone,"restDays") VALUES ($1,$2,$3,\'{}\') RETURNING id',[`${name}@c01-disposable.invalid`,name,c.timezone])).rows[0].id;
  const today=TimezoneService.getUserLocalDate(c.timezone);
  const intents=c.goals.map((g:{title:string;outcome:string;deadline:unknown;scope:string[]})=>CanonicalIntentV2Schema.parse({schemaVersion:2,title:g.title,outcome:g.outcome,policy:"GENERAL",policySelection:"USER_OVERRIDE",deadline:g.deadline,
    scope:g.scope.map((title,i)=>({scopeKey:randomUUID(),modelRef:`scope_${i+1}`,title,parentKey:null,inclusion:"REQUESTED",sourceClaimIds:[]})),evidence:[],
    availability:{...c.availability,studyWindows:{schemaVersion:1,weekly:c.availability.studyWindows,overrides:[{date:today,windows:[]}]}},preferences:{pacing:"SPREAD",desiredIntensity:"MODERATE",preferredTimeboxMinutes:40,maximumTimeboxMinutes:60},assumptions:[],unresolvedQuestions:[]}));
  const selected:Awaited<ReturnType<IntentService["create"]>>[]=[];for(const intent of intents)selected.push(await new IntentService(db).create(owner,randomUUID(),intent));
  const blobs=new Map<string,Uint8Array>(),documents=new DocumentRepository(db,{write:async(p,b)=>{blobs.set(p,b);},read:async p=>blobs.get(p)!,remove:async p=>{blobs.delete(p);}}),uploads=[];
  for(const m of c.materials)uploads.push(await documents.upload(owner,selected[0].plan.id,randomUUID(),m.title,"text/plain",Buffer.from(m.text)));
  for(const e of c.calendarEvents)await client.query('INSERT INTO "CalendarEvent" (id,"userId",title,"allDay","startDate","endDate","startsAt","endsAt",timezone,"updatedAt") VALUES ($1,$2,$3,false,$4,$4,$5,$6,$7,now())',[randomUUID(),owner,e.title,e.date,e.startsAt,e.endsAt,e.timezone]);
  const english=await db.coordinated(owner,async sql=>(await sql.query('INSERT INTO "Quest" ("userId",title,description,status,"scheduledFor","targetMinutes","requiredMinutes") VALUES ($1,\'English reading submission\',\'Keep this unselected commitment\',\'PENDING\',$2,35,35) RETURNING *',[owner,c.existingTasks[0].date])).rows[0]);
  const calendarAudit=await db.coordinated(owner,async sql=>{
    const stored=await Promise.all(selected.map(s=>loadIntent(sql,owner,s.intent.intentVersionId)));
    const plans=await Promise.all(selected.map(s=>ownedPlan(sql,owner,s.plan.id)));
    const context=await loadExecutionContext(sql,owner,plans,stored[0].intent);
    return auditC01Calendar(sql,owner,c,stored.map(s=>s.intent),context);
  });save("calendar-preflight.json",calendarAudit);
  const {authorizationDigest:_authorization,...resources}=offlineResourcePolicy("a".repeat(64),randomUUID());void _authorization;
  resources.journeyVersion=1;resources.root={calls:48,inputUnits:3000000,completionTokens:700000};resources.processingMs=funding.processingMs;
  for(const role of Object.values(resources.roles)){role.call.inputUnits=500000;role.holdback.inputUnits=role.holdback.calls*500000;}
  resources.researchTools={researchQueries:1,fetchAttempts:1,selectedSourceCharacters:500000,extractedPages:1000,ocrPages:0,followUps:100};
  if(existsSync(resolve(config.output,"cancel-before-admission.json")))throw new Error("OPERATOR_CANCELLED_BEFORE_ADMISSION");
  const admitted=await new GenerationService(db,{compilerVersion:2,resources}).accept(owner,{schemaVersion:2,requestKey:randomUUID(),text:c.acceptedInstructions+"\nStudent context: "+JSON.stringify(c.student)+"\nAccepted study anchor: "+c.anchor+" ("+c.timezone+"). These are school-issued mock assessments under GENERAL policy, not certified external-board specifications.",researchRequested:true,documentIds:uploads.map(d=>d.documentId),targets:selected.map(s=>({kind:"EXISTING",planId:s.plan.id,expectedIntentVersionId:s.intent.intentVersionId,expectedPlanningVersion:0,baseActiveRevisionId:null}))});
  const root=admitted.attempt.budget.rootRequestId,trace:Trace[]=[],events:unknown[]=[];
  let stopReason:string|null=null,activeAttempt=admitted.attempt.attemptId,physicalRequests=0,activeNetwork:{posts:number}|null=null,fakeNow=Date.now();
  const clock=()=>config.mode==="LONG_REVIEW"?fakeNow:Date.now();
  const rootRows=()=>client.query<RootRow>('SELECT id,artifact,payload,"intelligenceArtifacts" FROM "PlannerAttempt" WHERE "userId"=$1 AND artifact->\'budget\'->>\'rootRequestId\'=$2 ORDER BY id',[owner,root]);
  const ledger=()=>client.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2 ORDER BY id',[owner,root]);
  save("control.json",{schemaVersion:1,profileId,runId:config.runId,rootRequestId:root,owner,cancelRequestFile:"cancel-request.json"});
  const stop=async(code:string)=>{stopReason??=code;for(const row of (await rootRows()).rows)if(["RUNNING","QUEUED","NEEDS_DECISION"].includes(row.artifact.state))await attempts.cancel(owner,row.id);save("progress.json",{runId:config.runId,mode:config.mode,state:"STOP_REQUESTED",stopReason,physicalRequests,roles:trace.map(t=>({sequence:t.sequence,role:t.role,finished:!!t.finishedAt,stopReason:t.stopReason??null}))});};
  const checkOperatorStop=async()=>{
    if(existsSync(resolve(config.output,"cancel-before-admission.json"))&&!stopReason){await stop("OPERATOR_CANCELLED");return;}
    if(!existsSync(resolve(config.output,"cancel-request.json")))return;
    let request;try{request=readCancellation(config.output,config.runId,root);}catch{await stop("OPERATOR_CONTROL_INVALID");return;}
    if(!stopReason){save("operator-cancellation.json",{...request,acknowledgedAt:new Date().toISOString(),service:"AttemptService.cancel"});await stop("OPERATOR_CANCELLED");}
  };
  const record=async(t:Trace)=>{const old=trace.findIndex(x=>x.sequence===t.sequence);if(old<0)trace.push(t);else trace[old]=t;save(`calls/${String(t.sequence).padStart(3,"0")}-${t.role}.json`,t);save("progress.json",{runId:config.runId,mode:config.mode,owner,rootRequestId:root,activeAttemptId:t.attemptId,state:t.finishedAt?"RESPONSE_RECEIVED":"CALL_STARTED",physicalRequests,stopReason,roles:trace.map(x=>({sequence:x.sequence,role:x.role,finished:!!x.finishedAt,stopReason:x.stopReason??null}))});};
  const readState=async(role:string)=>db.coordinated(owner,async sql=>{
    const records=(await sql.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2 ORDER BY id',[owner,root])).rows;
    if(["STRATEGIST","TRANSLATOR","REVIEWER"].includes(role)){
      const archives=(await sql.query('SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE "userId"=$1 AND artifact->\'budget\'->>\'rootRequestId\'=$2',[owner,root])).rows;
      const capacities=archives.flatMap(r=>Object.values((r.intelligenceArtifacts as FoundationArchive|null)?.entries??{}).filter(a=>a.kind==="CAPACITY"&&a.value.schemaVersion===2));
      const current=capacities.filter(a=>a.kind==="CAPACITY"&&a.value.schemaVersion===2).sort((a,b)=>a.kind==="CAPACITY"&&b.kind==="CAPACITY"&&a.value.schemaVersion===2&&b.value.schemaVersion===2?a.value.version-b.value.version:0).at(-1);if(!current||current.kind!=="CAPACITY"||current.value.schemaVersion!==2)throw new Error("C01_CAPACITY_NOT_VERIFIED");
      save("capacity-audit.json",auditC01Capacity(c,current.value));
    }
    const pending=records.filter(r=>r.accountingState==="DISPATCHED");if(pending.length!==1)throw new Error("UNCERTAIN_DISPATCH_LINEAGE");
    activeAttempt=pending[0].attemptId;const stored=await loadAttempt(sql,owner,activeAttempt);if(stored.attempt.state!=="RUNNING")throw new Error("ATTEMPT_NOT_RUNNING");
    const actual=(await sql.query('SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE id=$1',[activeAttempt])).rows[0].intelligenceArtifacts as FoundationArchive|null;
    const checkpoints=Object.values(actual?.entries??{}).flatMap(a=>a.kind==="CHECKPOINT"?[a]:[]);const head=checkpoints.find(a=>!checkpoints.some(n=>n.value.previous?.id===a.id));
    let progressDigest:string|null=null;const history:string[]=[];
    if(actual&&role==="REVIEWER"&&head?.value.schemaVersion===3&&head.value.workflow.candidate){progressDigest=reviewProgressDigest(actual,reviewedCandidateBinding(actual,head.value.workflow.candidate,head.value.workflow.issueHeads));for(const r of head.value.workflow.history){const review=actual.entries[r.id];if(review?.kind==="REVIEW"&&review.value.schemaVersion===2)history.push(review.value.progressDigest);}}
    return {records,callId:pending[0].requestId,attemptId:activeAttempt,route:head?.value.schemaVersion===3?head.value.workflow.route:null,progressDigest,priorReviewProgress:history};
  });
  const roleCalls:Record<string,number>={};
  const scripted:LLMAdapter={generateResponse:async(messages,instruction,_tools,options)=>{
    const packet=JSON.parse(messages[0].content!),role=roleOf(instruction);roleCalls[role]=(roleCalls[role]??0)+1;let value:unknown;
    if(role==="RESEARCH")value={action:"COMPLETE",summary:{goals:c.goals.map((g:{outcome:string})=>g.outcome).join("; "),background:c.student.background,strengths:"Some elementary work is correct; transfer remains uncertain",weaknesses:"Chemical methods and biological interpretation require correction",resources:"Three original uploaded packets",constraints:"Fixed deadlines and joint Calendar availability",preferences:"Useful independent application without filler",uncertainty:"Claims and video time do not establish mastery"},batches:c.goals.map((_goal:{scope:string[]},index:number)=>({planRef:`plan_${index+1}`,sourceRefs:["source_1","source_2","source_3"],extraction:{identities:[],claims:[
      {sourceId:"source_1",statement:index===0?"The local Chemistry mock covers the accepted Chemistry topics.":"The local Biology mock covers the accepted Biology topics.",excerpt:index===0?"Chemistry: amount of substance, molar mass, solution concentration, balancing equations, reacting amounts, limiting reagents.":"Biology: diffusion, osmosis, active transport, interpreting mass changes and rates, enzyme conditions, controls and conclusions.",anchor:{section:"Document"},kind:"COURSE_OUTCOME"},
      {sourceId:"source_2",statement:index===0?"The diagnostic records correct independent balancing of three simpler equations.":"The diagnostic records a correct diffusion description.",excerpt:index===0?"Correctly balanced three simpler equations without help.":"Biology: correctly described diffusion down a concentration gradient.",anchor:{section:"Document"},kind:"RESOURCE"},
      {sourceId:"source_2",statement:"The annotated diagnostic records specific Chemistry and Biology weaknesses without establishing global mastery.",excerpt:"Teacher's annotated judgments: chemical arithmetic, unit conversion, limiting reagent reasoning, osmosis direction, controlled variables and overclaiming from data need work.",anchor:{section:"Document"},kind:"PREREQUISITE_RECOMMENDATION"},
      {sourceId:"source_3",statement:"The actual packet permits self-contained examples with givens, feedback and stopping criteria.",excerpt:"The planner may author additional self-contained examples and independent checks, provided givens, answers/feedback and stopping criteria are clear.",anchor:{section:"Document"},kind:"RESOURCE"}
    ],completeSourceIds:["source_1","source_2","source_3"],gaps:[],answer:"Local school content and limited diagnostic results retained without official certification"}})),unresolved:[]};
    else if(role==="VERIFICATION"){
      if(packet.verificationContext?.schemaVersion!==2||!packet.verificationContext.acceptedInput.acceptedRequest.text.includes("Amina")||packet.verificationContext.sourceAttributions.length!==3)throw new Error("ACCEPTED_RESEARCH_CONTEXT_MISSING");
      value={claims:packet.candidates.map((x:{claimId:string})=>({claimId:x.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"Literal private content applies to the accepted GENERAL school goal; student attribution comes separately from accepted context"})),identities:[],completeSourceIds:["source_1","source_2","source_3"],conflicts:[],answer:"Applicable local course contents and anonymous diagnostic evidence, not official-board certification",scopeBindings:packet.candidates.map((x:{claimId:string;kind:string})=>({claimId:x.claimId,scopeRefs:x.kind==="COURSE_OUTCOME"?["scope_1","scope_2","scope_3","scope_4"]:[],disposition:x.kind==="COURSE_OUTCOME"?"ANNOTATE_SCOPE":"RESOURCE_ONLY"}))};
    }
    else if(role==="SYNTHESIS"&&(config.mode==="CANCEL_IN_FLIGHT"||config.mode==="PROVIDER_FAILURE")){
      if(config.mode==="PROVIDER_FAILURE")throw Object.assign(new Error("Scripted provider rejection"),{name:"LLMProviderError",code:"http_503",status:503});
      requestCancellation(config.output,"Unpaid operator cancellation during a dispatched synthesis request");
      await new Promise<never>((_resolve,reject)=>{const abort=()=>reject(options?.signal?.reason??new Error("Aborted"));if(options?.signal?.aborted)abort();else options?.signal?.addEventListener("abort",abort,{once:true});});
    }
    else if(role==="SYNTHESIS")value={supported:true,explanation:"Resources and uncertainty are retained",issues:[]};
    else if(role==="STRATEGIST")value="Scripted unpaid fixture only.\n\nUse the actual chemistry packet to correct unit and reaction-extent errors, then explain an independent changed example.\n\nUse the biology packet to interpret transport and an enzyme investigation, then justify an independent conclusion. Preserve deadlines and Friday rest.";
    else if(role==="TRANSLATOR"){const r=naturalProposal(packet.ownedLearning as LearningInput,packet.strategy as StrategyDocument,{minutes:40});r.proposal.detail.days=28;for(const [i,p]of r.proposal.plans.entries()){
      p.strategy.outcome=c.goals[i].outcome;p.strategy.recommendedEffort=[160,160,160];const original=p.activities[0];
      p.activities=c.goals[i].scope.map((title:string,j:number)=>({...original,localId:j?`${original.localId}_${j}`:original.localId,title,scopeRefs:[`scope_${j+1}`],instructions:packet.strategy.text+"\nUse the exact packet for "+title+" and explain a changed example independently.",completionCriterion:"Independently justify the method, units and changed-data answer for "+title,hardDependencies:j?[j===1?original.localId:`${original.localId}_${j-1}`]:[]}));
    }
    if(config.mode==="REFINEMENT"&&roleCalls.TRANSLATOR===1)r.proposal.plans[0].activities[0].completionCriterion="Complete the worksheet.";
    for(const element of r.elements)element.targets=r.proposal.plans.flatMap(p=>p.activities.map(a=>({planRef:p.planRef,kind:"ACTIVITY" as const,ref:a.localId})));value=r;}
    else{value={plans:packet.input.goals.map((g:{planRef:string})=>({planRef:g.planRef,issues:[]})),routes:[],dispositions:[],verdict:"APPROVED",completeResultInspected:true,explanation:"Scripted mechanical response only",next:null,questions:[]};if(config.mode==="REFINEMENT"){
        const activity=packet.input.proposal.blueprints.plans[0].blueprint.activities[0],grounds=[{ref:"plan_1/goal",excerpt:packet.input.goals[0].requested.outcome},{ref:`plan_1/activity/${activity.localId}`,excerpt:activity.completionCriterion}];
        if(roleCalls.REVIEWER===1)value={...value as object,plans:packet.input.goals.map((g:{planRef:string})=>({planRef:g.planRef,issues:g.planRef==="plan_1"?[{issueId:"missing_independent_criterion",category:"WEAK_CRITERION",severity:"BLOCKING",affectedRefs:[activity.localId],basis:"CONCRETE_VIOLATION",grounds,evidence:"Worksheet completion does not establish the strategy's independent method and changed-data outcome",consequence:"Independent performance remains unverified",requestedResolution:"Restore the original independent method, units and changed-data criterion",requiresAcknowledgement:false}]:[]})),routes:[{planRef:"plan_1",issueId:"missing_independent_criterion",route:"TRANSLATOR"}],verdict:"REVISE",next:{route:"TRANSLATOR",benefit:"Restore faithful independent performance criteria"}};
        else value={...value as object,dispositions:packet.input.context.previousIssues.map((p:{value:{issueId:string}})=>({issueId:p.value.issueId,outcome:"RESOLVED",grounds,explanation:"Reinspected the restored independent criterion, both full plans and feasible schedule"}))};
      }
      if(config.mode==="LONG_REVIEW")fakeNow=Date.parse(packet.input.context.capacity.calendar.validUntil)+1;}
    return{text:typeof value==="string"?value:JSON.stringify(value),model:"deepseek-flash",fingerprint:"scripted-unpaid-execution-binding",finishReason:"STOP",usage:{promptTokens:100,completionTokens:100,totalTokens:200,reasoningTokens:50,cacheHitTokens:0}};
  }};
  const key=config.mode==="LIVE"?JSON.parse(readFileSync(config.privateKeyPath!,"utf8")).key:null;
  const actual=config.mode==="LIVE"?new DeepSeekAdapter(key,"deepseek-flash","https://api.deepseek.com"):scripted;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
    if(config.mode!=="LIVE"||url!=="https://api.deepseek.com/chat/completions"||init?.method!=="POST"||!activeNetwork||activeNetwork.posts!==0)throw new Error("UNAUTHORIZED_OR_DUPLICATE_NETWORK_REQUEST");
    const payload=JSON.parse(String(init.body));if(payload.model!=="deepseek-flash"||payload.max_tokens!==65536||payload.thinking?.type!=="enabled"||payload.reasoning_effort!=="high"||payload.tools)throw new Error("UNAUTHORIZED_PROVIDER_PAYLOAD");
    activeNetwork.posts++;physicalRequests++;save("network-count.json",{physicalRequests,paidPotentialRequests:physicalRequests,endpoint:"https://api.deepseek.com/chat/completions"});
    return originalFetch(input,{...init,redirect:"error"});};
  const guarded=guardedAdapter(actual,{readState,onStop:stop,onTrace:record,now:clock,beforeDispatch:checkOperatorStop,getStopReason:()=>stopReason,authorize:()=>config.mode!=="LIVE"||config.approved,invoke:async(adapter:LLMAdapter,args:Parameters<LLMAdapter["generateResponse"]>)=>{if(roleOf(args[1])==="REVIEWER"){try{save("schedule-audit.json",auditC01Schedule(c,JSON.parse(args[0][0].content!).input));}catch(error){save("schedule-audit.json",{status:"FAILED",message:error instanceof Error?error.message:"Unknown deterministic audit failure"});await stop("C01_SCHEDULE_AUDIT_FAILED");throw error;}}activeNetwork={posts:0};try{return await adapter.generateResponse(...args);}finally{activeNetwork=null;}}}) as LLMAdapter;
  const provider={adapter:()=>guarded},research=new ResearchService(attempts,{provider,documents,search:null,fetch:async()=>{throw new Error("PUBLIC_FETCH_NOT_AUTHORIZED");}}),worker=new PlannerWorker(attempts,createCompilerHandlers(attempts,{provider,research}),event=>{events.push({...event,at:new Date().toISOString()});save("worker-events.json",events);});
  let last:RootRow|null=null,apply:unknown=null;
  const exportState=async(state:string)=>{
    const rows=(await rootRows()).rows,logs=(await ledger()).rows;
    const revisions=(await client.query('SELECT * FROM "PlannerRevision" WHERE "planId"=ANY($1::uuid[]) ORDER BY id',[selected.map(s=>s.plan.id)])).rows;
    const currentEnglish=(await client.query('SELECT * FROM "Quest" WHERE id=$1',[english.id])).rows[0];
    const result={schemaVersion:2,profileId,runId:config.runId,mode:config.mode,status:state,owner,rootRequestId:root,activeAttemptId:activeAttempt,stopReason,physicalRequests,paidCalls:config.mode==="LIVE"?physicalRequests:0,attempts:rows,usageLogs:logs,revisions,apply,unselectedTaskPreserved:sha(JSON.stringify(currentEnglish))===sha(JSON.stringify(english)),frozenInputSha256:sha(readFileSync(`${reportPath}/PILOT_INPUT.json`)),capturedAt:new Date().toISOString()};
    save("journey.json",result);return result;
  };
  const inspect=async(parent:RootRow)=>{if(config.mode!=="LIVE")return{action:"APPLY"};save("inspection-required.json",{runId:config.runId,attemptId:parent.id,state:parent.artifact.state,stopReason,decisionFile:"operator-decision.json",allowedActions:parent.artifact.state==="SUCCEEDED"?["APPLY","SKIP"]:["STOP"]});
    const end=Date.now()+15*60000;while(Date.now()<end){const file=resolve(config.output,"operator-decision.json");if(existsSync(file)){const d=JSON.parse(readFileSync(file,"utf8"));if(d.runId!==config.runId||d.attemptId!==parent.id)throw new Error("INSPECTION_IDENTITY_MISMATCH");renameSync(file,resolve(config.output,`operator-decision-${Date.now()}.json`));return d;}await sleep(250);}return{action:"SKIP",reason:"Inspection timeout; no materialization"};};
  try {
    const end=Date.now()+funding.processingMs+30000;
    for(;;){await checkOperatorStop();await worker.tick();await sleep(150);const rows=(await rootRows()).rows,leaves=rows.filter(r=>!rows.some(n=>n.artifact.parentAttemptId===r.id));if(leaves.length!==1)throw new Error("ROOT_LINEAGE_BRANCH");last=leaves[0];activeAttempt=last.id;
      if(!["RUNNING","QUEUED"].includes(last.artifact.state)){await sleep(100);const again=(await rootRows()).rows;if(again.some(r=>r.artifact.parentAttemptId===last!.id))continue;break;}
      if(Date.now()>end){await stop("ORIGINAL_ROOT_DEADLINE");break;}}
    await worker.shutdown();await sleep(250);await exportState("AWAITING_INDEPENDENT_INSPECTION");
    if(last?.artifact.state==="SUCCEEDED"&&!stopReason){const decision=await inspect(last);if(decision.action==="APPLY"){const stored=await db.coordinated(owner,sql=>loadAttempt(sql,owner,last!.id)),change=PlanChangeSetV2Schema.parse(stored.payload.changeSet),request={attemptId:last.id,changeSetId:change.changeSetId,acknowledgements:change.quality.requiredAcknowledgements};
      try{const service=new ApplyService(db,undefined,documents),receipt=await service.apply(owner,request),replayed=await service.apply(owner,request);apply={status:"APPLIED",receipt,replayMatched:sha(JSON.stringify(receipt))===sha(JSON.stringify(replayed)),operatorInspection:decision};}catch(error){apply={status:"REJECTED",code:(error as{detail?:{code:string}}).detail?.code??"UNCLASSIFIED",operatorInspection:decision};}}
      else apply={status:"SKIPPED",operatorInspection:decision};}
    const output=await exportState("LIVE_OR_SCRIPTED_OBSERVATION_RETAINED");
    if(!output.unselectedTaskPreserved)throw new Error("UNSELECTED_WORK_CHANGED");
    return output;
  }catch(error){await stop("EXECUTION_BOUNDARY_FAILURE");await sleep(250);await exportState("FAILED_OBSERVATION_RETAINED");throw error;}
  finally{await worker.shutdown();globalThis.fetch=originalFetch;await exportState("FINAL_OBSERVATION_RETAINED").catch(()=>{});}
}
