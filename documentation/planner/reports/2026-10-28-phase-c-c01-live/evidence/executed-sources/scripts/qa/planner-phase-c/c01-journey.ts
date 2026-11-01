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
import { funding, reportPath } from "./prepare.mjs";
import { guardedAdapter, roleOf } from "./execution-guard.mjs";

type Trace = Record<string, unknown>;
type RootRow = {id:string;artifact:PlannerAttemptV2;payload:AttemptPayload;intelligenceArtifacts:unknown};
const sha = (v: string|Uint8Array) => createHash("sha256").update(v).digest("hex");
const sleep = (ms:number) => new Promise(r => setTimeout(r,ms));
export async function runC01(client:pg.Client,pool:pg.Pool,config:{mode:"LIVE"|"SCRIPTED"|"LONG_REVIEW";output:string;runId:string;privateKeyPath?:string;ceilingUsd:number;approved:boolean}) {
  if(config.ceilingUsd!==1.75||config.mode==="LIVE"&&!config.approved)throw new Error("EXPLICIT_C01_AUTHORIZATION_REQUIRED");
  mkdirSync(resolve(config.output,"calls"),{recursive:true});
  const save=(name:string,value:unknown)=>writeFileSync(resolve(config.output,name),JSON.stringify(value,null,2)+"\n");
  const c=JSON.parse(readFileSync(`${reportPath}/PILOT_INPUT.json`,"utf8"));
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
  const {authorizationDigest:_authorization,...resources}=offlineResourcePolicy("a".repeat(64),randomUUID());void _authorization;
  resources.journeyVersion=1;resources.root={calls:48,inputUnits:3000000,completionTokens:700000};resources.processingMs=funding.processingMs;
  for(const role of Object.values(resources.roles)){role.call.inputUnits=500000;role.holdback.inputUnits=role.holdback.calls*500000;}
  resources.researchTools={researchQueries:1,fetchAttempts:1,selectedSourceCharacters:500000,extractedPages:1000,ocrPages:0,followUps:100};
  const admitted=await new GenerationService(db,{compilerVersion:2,resources}).accept(owner,{schemaVersion:2,requestKey:randomUUID(),text:c.acceptedInstructions+"\nStudent context: "+JSON.stringify(c.student),researchRequested:true,documentIds:uploads.map(d=>d.documentId),targets:selected.map(s=>({kind:"EXISTING",planId:s.plan.id,expectedIntentVersionId:s.intent.intentVersionId,expectedPlanningVersion:0,baseActiveRevisionId:null}))});
  const root=admitted.attempt.budget.rootRequestId,trace:Trace[]=[],events:unknown[]=[];
  let stopReason:string|null=null,activeAttempt=admitted.attempt.attemptId,physicalRequests=0,activeNetwork:{posts:number}|null=null,fakeNow=Date.now();
  const clock=()=>config.mode==="LONG_REVIEW"?fakeNow:Date.now();
  const rootRows=()=>client.query<RootRow>('SELECT id,artifact,payload,"intelligenceArtifacts" FROM "PlannerAttempt" WHERE "userId"=$1 AND artifact->\'budget\'->>\'rootRequestId\'=$2 ORDER BY id',[owner,root]);
  const ledger=()=>client.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2 ORDER BY id',[owner,root]);
  const stop=async(code:string)=>{stopReason??=code;for(const row of (await rootRows()).rows)if(["RUNNING","QUEUED","NEEDS_DECISION"].includes(row.artifact.state))await attempts.cancel(owner,row.id);save("progress.json",{runId:config.runId,mode:config.mode,state:"STOP_REQUESTED",stopReason,physicalRequests,roles:trace.map(t=>({sequence:t.sequence,role:t.role,finished:!!t.finishedAt,stopReason:t.stopReason??null}))});};
  const record=async(t:Trace)=>{const old=trace.findIndex(x=>x.sequence===t.sequence);if(old<0)trace.push(t);else trace[old]=t;save(`calls/${String(t.sequence).padStart(3,"0")}-${t.role}.json`,t);save("progress.json",{runId:config.runId,mode:config.mode,owner,rootRequestId:root,activeAttemptId:t.attemptId,state:t.finishedAt?"RESPONSE_RECEIVED":"CALL_STARTED",physicalRequests,stopReason,roles:trace.map(x=>({sequence:x.sequence,role:x.role,finished:!!x.finishedAt,stopReason:x.stopReason??null}))});};
  const readState=async(role:string)=>db.coordinated(owner,async sql=>{
    const records=(await sql.query('SELECT * FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2 ORDER BY id',[owner,root])).rows;
    const pending=records.filter(r=>r.accountingState==="DISPATCHED");if(pending.length!==1)throw new Error("UNCERTAIN_DISPATCH_LINEAGE");
    activeAttempt=pending[0].attemptId;const stored=await loadAttempt(sql,owner,activeAttempt);if(stored.attempt.state!=="RUNNING")throw new Error("ATTEMPT_NOT_RUNNING");
    const actual=(await sql.query('SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE id=$1',[activeAttempt])).rows[0].intelligenceArtifacts as FoundationArchive|null;
    const checkpoints=Object.values(actual?.entries??{}).flatMap(a=>a.kind==="CHECKPOINT"?[a]:[]);const head=checkpoints.find(a=>!checkpoints.some(n=>n.value.previous?.id===a.id));
    let progressDigest:string|null=null;const history:string[]=[];
    if(actual&&role==="REVIEWER"&&head?.value.schemaVersion===3&&head.value.workflow.candidate){progressDigest=reviewProgressDigest(actual,reviewedCandidateBinding(actual,head.value.workflow.candidate,head.value.workflow.issueHeads));for(const r of head.value.workflow.history){const review=actual.entries[r.id];if(review?.kind==="REVIEW"&&review.value.schemaVersion===2)history.push(review.value.progressDigest);}}
    return {records,callId:pending[0].requestId,attemptId:activeAttempt,route:head?.value.schemaVersion===3?head.value.workflow.route:null,progressDigest,priorReviewProgress:history};
  });
  const scripted:LLMAdapter={generateResponse:async(messages,instruction)=>{
    const packet=JSON.parse(messages[0].content!),role=roleOf(instruction);let value:unknown;
    if(role==="RESEARCH")value={action:"COMPLETE",summary:{goals:c.goals.map((g:{outcome:string})=>g.outcome).join("; "),background:c.student.background,strengths:"Some elementary work is correct; transfer remains uncertain",weaknesses:"Chemical methods and biological interpretation require correction",resources:"Three original uploaded packets",constraints:"Fixed deadlines and joint Calendar availability",preferences:"Useful independent application without filler",uncertainty:"Claims and video time do not establish mastery"},batches:[{planRef:"plan_1",sourceRefs:c.materials.map((_:unknown,i:number)=>`source_${i+1}`),extraction:{identities:[],claims:c.materials.map((m:{text:string},i:number)=>({sourceId:`source_${i+1}`,statement:m.text.split(". ")[0]+".",excerpt:m.text.split(". ")[0]+".",anchor:{section:"Document"},kind:"RESOURCE"})),completeSourceIds:[],gaps:[],answer:"Original resources support the selected goals"}}],unresolved:[]};
    else if(role==="VERIFICATION")value={claims:packet.candidates.map((x:{claimId:string})=>({claimId:x.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"Exact accepted original excerpt"})),identities:[],completeSourceIds:[],conflicts:[],answer:"Applicable owned resources",scopeBindings:packet.candidates.map((x:{claimId:string})=>({claimId:x.claimId,scopeRefs:[],disposition:"RESOURCE_ONLY"}))};
    else if(role==="SYNTHESIS")value={supported:true,explanation:"Resources and uncertainty are retained",issues:[]};
    else if(role==="STRATEGIST")value="Scripted unpaid fixture only.\n\nUse the actual chemistry packet to correct unit and reaction-extent errors, then explain an independent changed example.\n\nUse the biology packet to interpret transport and an enzyme investigation, then justify an independent conclusion. Preserve deadlines and Friday rest.";
    else if(role==="TRANSLATOR"){const r=naturalProposal(packet.ownedLearning as LearningInput,packet.strategy as StrategyDocument);r.proposal.detail.days=28;for(const [i,p]of r.proposal.plans.entries()){p.strategy.outcome=c.goals[i].outcome;p.activities[0].instructions=packet.strategy.text;p.activities[0].completionCriterion="Independently justify the method and changed-data answer.";}value=r;}
    else{value={plans:packet.input.goals.map((g:{planRef:string})=>({planRef:g.planRef,issues:[]})),routes:[],dispositions:[],verdict:"APPROVED",completeResultInspected:true,explanation:"Scripted mechanical response only",next:null,questions:[]};if(config.mode==="LONG_REVIEW")fakeNow=Date.parse(packet.input.context.capacity.calendar.validUntil)+1;}
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
  const guarded=guardedAdapter(actual,{readState,onStop:stop,onTrace:record,now:clock,authorize:()=>config.mode!=="LIVE"||config.approved,invoke:async(adapter:LLMAdapter,args:Parameters<LLMAdapter["generateResponse"]>)=>{activeNetwork={posts:0};try{return await adapter.generateResponse(...args);}finally{activeNetwork=null;}}}) as LLMAdapter;
  const provider={adapter:()=>guarded},research=new ResearchService(attempts,{provider,documents,search:null,fetch:async()=>{throw new Error("PUBLIC_FETCH_NOT_AUTHORIZED");}}),worker=new PlannerWorker(attempts,createCompilerHandlers(attempts,{provider,research}),event=>{events.push({...event,at:new Date().toISOString()});save("worker-events.json",events);});
  let last:RootRow|null=null,apply:unknown=null;
  const exportState=async(state:string)=>{
    const rows=(await rootRows()).rows,logs=(await ledger()).rows;
    const revisions=(await client.query('SELECT * FROM "PlannerRevision" WHERE "planId"=ANY($1::uuid[]) ORDER BY id',[selected.map(s=>s.plan.id)])).rows;
    const currentEnglish=(await client.query('SELECT * FROM "Quest" WHERE id=$1',[english.id])).rows[0];
    const result={schemaVersion:1,runId:config.runId,mode:config.mode,status:state,owner,rootRequestId:root,activeAttemptId:activeAttempt,stopReason,physicalRequests,paidCalls:config.mode==="LIVE"?physicalRequests:0,attempts:rows,usageLogs:logs,revisions,apply,unselectedTaskPreserved:sha(JSON.stringify(currentEnglish))===sha(JSON.stringify(english)),frozenInputSha256:sha(readFileSync(`${reportPath}/PILOT_INPUT.json`)),capturedAt:new Date().toISOString()};
    save("journey.json",result);return result;
  };
  const inspect=async(parent:RootRow)=>{if(config.mode!=="LIVE")return{action:"APPLY"};save("inspection-required.json",{runId:config.runId,attemptId:parent.id,state:parent.artifact.state,stopReason,decisionFile:"operator-decision.json",allowedActions:parent.artifact.state==="SUCCEEDED"?["APPLY","SKIP"]:["STOP"]});
    const end=Date.now()+15*60000;while(Date.now()<end){const file=resolve(config.output,"operator-decision.json");if(existsSync(file)){const d=JSON.parse(readFileSync(file,"utf8"));if(d.runId!==config.runId||d.attemptId!==parent.id)throw new Error("INSPECTION_IDENTITY_MISMATCH");renameSync(file,resolve(config.output,`operator-decision-${Date.now()}.json`));return d;}await sleep(250);}return{action:"SKIP",reason:"Inspection timeout; no materialization"};};
  try {
    const end=Date.now()+funding.processingMs+30000;
    for(;;){await worker.tick();await sleep(150);const rows=(await rootRows()).rows,leaves=rows.filter(r=>!rows.some(n=>n.artifact.parentAttemptId===r.id));if(leaves.length!==1)throw new Error("ROOT_LINEAGE_BRANCH");last=leaves[0];activeAttempt=last.id;
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
