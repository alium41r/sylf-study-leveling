import { beforeAll,afterAll,it,expect } from 'vitest';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { connect,user } from './database';
import { intentFixture } from '../contracts/fixtures';
import { CanonicalIntentV2Schema,PlanChangeSetV2Schema,type CanonicalIntentV2 } from '@/lib/planner/v2/contracts';
import { PlannerDatabase,DurablePlannerError } from '@/lib/planner/v2/server/database';
import { GenerationService } from '@/lib/planner/v2/server/generation';
import { IntentService } from '@/lib/planner/v2/server/intents';
import { DocumentRepository } from '@/lib/planner/v2/server/documents';
import { AttemptService,loadAttempt } from '@/lib/planner/v2/server/attempts';
import { PlannerWorker } from '@/lib/planner/v2/server/worker';
import { createCompilerHandlers } from '@/lib/planner/v2/server/compiler';
import { ResearchService } from '@/lib/planner/v2/server/research';
import { ApplyService } from '@/lib/planner/v2/server/apply';
import { LLMFactory } from '@/lib/ai/providers/factory';
import { WORKLOAD_ROUTING_TABLE,type ModelRouteSpec } from '@/lib/ai/agent-router';
import { TimezoneService } from '@/lib/timezone-service';
import { qualityInstruction,verificationInstruction } from '@/lib/planner/v2/intelligence/quality';
const corpusPath='documentation/planner/reports/2026-10-03-phase-2/DEVELOPMENT_CORPUS.json';
const corpusBytes=readFileSync(corpusPath);
const corpus=JSON.parse(corpusBytes.toString()) as {cases:{id:string;policy:CanonicalIntentV2['policy'];outcome:string;scope:string[];expectation:string;dailyMinutes:number;deadlineDays:number;research:boolean}[]};
const selectedIds=process.env.PLANNER_PHASE2_LIVE_CASES?.split(',');
if(selectedIds?.some(id=>!corpus.cases.some(c=>c.id===id)))throw new Error('Unknown live development case');
const repetitions=Number(process.env.PLANNER_PHASE2_LIVE_REPETITIONS??'1');
if(!Number.isSafeInteger(repetitions)||repetitions<1||repetitions>3||repetitions>1&&!selectedIds)throw new Error('Repeated qualification requires selected registered cases and at most three fresh-root trials');
const originalRoute=WORKLOAD_ROUTING_TABLE.syllabus;
const nonGemini=process.env.PLANNER_PHASE2_LIVE_NON_GEMINI==='true';
const lowReasoning=process.env.PLANNER_PHASE2_LIVE_LOW_REASONING==='true';
const temperature=Number(process.env.PLANNER_PHASE2_LIVE_TEMPERATURE??'0.2');
if(![0.2,0.7].includes(temperature)||process.env.PLANNER_PHASE2_LIVE_TEMPERATURE&&(!nonGemini||lowReasoning))throw new Error('Explicit recorded non-thinking qualification temperature required');
const reviewTemperature=process.env.PLANNER_PHASE2_LIVE_REVIEW_TEMPERATURE===undefined?undefined:Number(process.env.PLANNER_PHASE2_LIVE_REVIEW_TEMPERATURE);
if(reviewTemperature!==undefined&&(!nonGemini||lowReasoning||reviewTemperature!==0.2||temperature!==0.7))throw new Error('Review sampling requires explicit non-thinking 0.7 generation and 0.2 review');
const note='Sylf development course note. This is a locally authored course note, not an official exam specification. Project: Python expenses report. Course outcomes: Read expense CSV rows. Group amounts by category and report each total. Detect and explain malformed rows rather than silently excluding them. A successful report includes a changed-data example that independently demonstrates correct grouping and error handling.';
let connection:pg.Client,pool:pg.Pool,db:PlannerDatabase,attempts:AttemptService;
const records:Record<string,unknown>[]=[];
const liveEvidence=process.env.PLANNER_PHASE2_LIVE_EVIDENCE!;
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
function safeFailure(error:unknown){
 const sqlState=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:undefined;
 return error instanceof z.ZodError?{type:'SCHEMA',issues:error.issues.slice(0,8).map(issue=>({code:issue.code,path:issue.path.slice(0,8).map(part=>typeof part==='number'?part:typeof part==='string'&&/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(part)?part:'<field>')})),omittedIssues:Math.max(0,error.issues.length-8)}:error instanceof DurablePlannerError?{type:'PLANNER',code:error.detail.code,stage:error.detail.stage}:sqlState?{type:'SQL',sqlState}:{type:error instanceof TypeError?'TYPE':error instanceof RangeError?'RANGE':'UNCLASSIFIED'};
}
function save(){writeFileSync(resolve(liveEvidence,'live-corpus.json'),JSON.stringify({schemaVersion:1,status:'OBSERVED_NOT_YET_EDUCATIONALLY_EVALUATED',corpusSha256:sha(corpusBytes),selectedCaseIds:selectedIds??corpus.cases.map(c=>c.id),repetitionCount:repetitions,routeConfiguration:{temporaryNonGemini:nonGemini,thinking:WORKLOAD_ROUTING_TABLE.syllabus.thinking,reasoningEffort:lowReasoning?'low':null,temperature:nonGemini&&!lowReasoning?temperature:null,reviewTemperature:reviewTemperature??null,primary:WORKLOAD_ROUTING_TABLE.syllabus.primary,fallback:WORKLOAD_ROUTING_TABLE.syllabus.fallback,productionConfigurationChanged:false},providerCredentialsRecorded:false,hostedDataTouched:false,cases:records},null,2)+'\n');}
beforeAll(async()=>{
 if(process.env.PLANNER_PHASE2_LIVE_REQUIRED!=='true'||!liveEvidence?.startsWith(resolve('documentation/planner/reports')+'/'))throw new Error('Explicit disposable live harness required');
 connection=await connect();pool=new pg.Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL,max:6});db=new PlannerDatabase(pool);attempts=new AttemptService(db);
 // Load ONLY model/search credential keys. Never load hosted DB/storage/JWT data.
 const allowed=new Set(['DEEPSEEK_API_KEY','GEMINI_API_KEY','GOOGLE_GENAI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','DEEPSEEK_MODEL','DEEPSEEK_COMPILER_MODEL','BRAVE_SEARCH_API_KEY','SERPER_API_KEY','SEARCH_PROVIDER']);
 for(const path of ['.env.local','.env'])if(existsSync(path))for(const line of readFileSync(path,'utf8').split('\n')){const match=line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(match&&allowed.has(match[1])&&!process.env[match[1]]){const value=match[2].replace(/^(["'])(.*)\1$/,'$2');process.env[match[1]]=value;}}
 // Explicit user-authorized qualification override in this disposable process
 // only. Groq's actual quota failures are retained in the previous run. Reuse
 // the existing DeepSeek chat route for one metered fallback, with trial
 // thinking/sampling controls; no production routing policy is changed.
 if(nonGemini){const fallback=WORKLOAD_ROUTING_TABLE.general_chat.primary;if(fallback.provider!=='deepseek')throw new Error('Expected existing DeepSeek route');WORKLOAD_ROUTING_TABLE.syllabus={...originalRoute,fallback,secondaryFallback:undefined,thinking:lowReasoning?'enabled':'disabled'};}
 save();
});
afterAll(async()=>{save();WORKLOAD_ROUTING_TABLE.syllabus=originalRoute;await pool?.end();await connection?.end();});
for(const {c,trial} of corpus.cases.filter(c=>!selectedIds||selectedIds.includes(c.id)).flatMap(c=>Array.from({length:repetitions},(_,i)=>({c,trial:i+1}))))it(`live development qualification: ${c.id}${repetitions>1?` trial ${trial}`:''}`,async()=>{
 const n=await user(connection);await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1',[n]);
 // Synthetic disposable owners may run development cases through existing entitlement authority.
 process.env.SYLF_UNLIMITED_AI_USER_IDS=String(n);
 const day=TimezoneService.getUserLocalDateOffset('Asia/Karachi',c.deadlineDays);
 const make=(outcome:string,scope:string[])=>CanonicalIntentV2Schema.parse({...intentFixture(),title:c.id,outcome,policy:c.policy,policySelection:'USER_OVERRIDE',deadline:c.deadlineDays?{kind:'FIXED',date:day,examDayStudyAllowed:false}:{kind:'NONE'},scope:scope.map((title,i)=>({scopeKey:randomUUID(),modelRef:`scope_${i+1}`,title,parentKey:null,inclusion:'REQUESTED',sourceClaimIds:[]})),availability:{timezone:'Asia/Karachi',dailyCeilingMinutes:Array(7).fill(c.dailyMinutes),weeklyCeilingMinutes:c.dailyMinutes*7,restWeekdays:[],blockedDates:[],recoveryPercent:0,basis:'CONFIRMED_AVAILABILITY'}});
 const targets:{kind:'NEW'|'EXISTING';intent?:CanonicalIntentV2;planId?:string;expectedIntentVersionId?:string;expectedPlanningVersion?:number;baseActiveRevisionId?:null}[]=[{kind:'NEW',intent:make(c.outcome,c.scope)}];
 if(c.id==='public-assessment-research')targets[0].intent=CanonicalIntentV2Schema.parse({...targets[0].intent,assessment:{institution:'Cambridge International',qualification:'Cambridge International AS & A Level',syllabusCode:'9702',component:'Paper 2',examinationCycle:'2026',selectedSubset:'Current of electricity and DC circuits'}});
 const bytes=new Map<string,Uint8Array>(),documents=new DocumentRepository(db,{write:async(path,b)=>{bytes.set(path,b);},read:async path=>{const b=bytes.get(path);if(!b)throw new Error('Missing owned bytes');return b;},remove:async path=>{bytes.delete(path);}});const documentIds:string[]=[];
 if(c.id==='owned-course-research'){const created=await new IntentService(db).create(n,randomUUID(),targets[0].intent);const doc=await documents.upload(n,created.plan.id,randomUUID(),'Sylf development course note','text/plain',Buffer.from(note));documentIds.push(doc.documentId);targets[0]={kind:'EXISTING',planId:created.plan.id,expectedIntentVersionId:created.intent.intentVersionId,expectedPlanningVersion:0,baseActiveRevisionId:null};}
 if(c.id==='joint-prerequisite')targets.push({kind:'NEW',intent:make('Build a JSON expenses report with the same loops/dictionary prerequisite as the CSV target. Do not duplicate prerequisite work; use its owning Plan.',['Loops and dictionaries','JSON totals report'])});
 const started=Date.now(),trace:unknown[]=[],record:Record<string,unknown>={id:c.id,trial,expectation:c.expectation,input:targets.map(t=>t.intent??{ownedDocument:true}),startedAt:new Date(started).toISOString(),observedOutcome:'RUNNING',providerResponses:trace};records.push(record);save();
 const provider={adapter:(route:ModelRouteSpec)=>{const actual=LLMFactory.getAdapter(route.provider,route.model);return {...(route.provider==='deepseek'&&'resolveModelName' in actual?{resolveModelName:(name:string)=>(actual as {resolveModelName:(m:string)=>string}).resolveModelName(name)}:{}),generateResponse:async(...args:Parameters<typeof actual.generateResponse>)=>{const t=Date.now(),effectiveTemperature=reviewTemperature!==undefined&&(args[1]===qualityInstruction||args[1]===verificationInstruction)?reviewTemperature:temperature;try{const response=await actual.generateResponse(args[0],args[1],args[2],lowReasoning?{...args[3],reasoningEffort:'low'}:nonGemini?{...args[3],temperature:effectiveTemperature}:args[3]);trace.push({provider:route.provider,model:route.provider==='deepseek'&&'resolveModelName' in actual?(actual as {resolveModelName:(m:string)=>string}).resolveModelName(route.model):route.model,latencyMs:Date.now()-t,options:{thinking:args[3]?.thinking,reasoningEffort:lowReasoning?'low':args[3]?.reasoningEffort,responseFormat:args[3]?.responseFormat,temperature:nonGemini&&!lowReasoning?effectiveTemperature:args[3]?.temperature,maxTokens:args[3]?.maxTokens,singleAttempt:args[3]?.singleAttempt},messages:args[0],systemInstruction:args[1],finishReason:response.finishReason,usage:response.usage,text:response.text});save();return response;}catch(error){const detail=error&&typeof error==='object'?error as {status?:unknown;code?:unknown;message?:unknown;originalError?:unknown}:{};const code=typeof detail.code==='string'&&['unauthorized','rate_limit','server_error','network_error','invalid_json'].includes(detail.code)?detail.code:'UNCLASSIFIED';const status=typeof detail.status==='number'?detail.status:undefined;const text=String(detail.message??'')+' '+String(detail.originalError??'');const category=/insufficient.*balance|balance.*insufficient/i.test(text)?'INSUFFICIENT_BALANCE':/quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(text)?'QUOTA_OR_RATE_LIMIT':code;trace.push({provider:route.provider,model:route.model,latencyMs:Date.now()-t,options:{thinking:args[3]?.thinking,reasoningEffort:lowReasoning?'low':args[3]?.reasoningEffort,responseFormat:args[3]?.responseFormat,temperature:nonGemini&&!lowReasoning?effectiveTemperature:args[3]?.temperature,maxTokens:args[3]?.maxTokens,singleAttempt:args[3]?.singleAttempt},messages:args[0],systemInstruction:args[1],outcome:'PROVIDER_FAILURE',providerStatus:status,providerCategory:category});save();throw new Error('Live provider failed; no private diagnostics retained');}}};}};
 const admitted=await new GenerationService(db).accept(n,{schemaVersion:2,requestKey:randomUUID(),text:c.outcome,targets,researchRequested:c.research,documentIds});record.attemptId=admitted.attempt.attemptId;
 // Research uses an actual owned uploaded document. Public search is disabled
 // ONLY for this owned-course case; no fake snippets or official claims.
 const research=new ResearchService(attempts,{provider,documents,search:c.id==='owned-course-research'?null:undefined});
 const handlers=createCompilerHandlers(attempts,{provider,research});
 // Observe the original handler failure without changing the worker's handling,
 // lifecycle or error. Never retain messages, stacks or rejected/private values.
 for(const kind of ['PLAN','REPLAN','JOINT','RESEARCH_ADVICE'] as const){const original=handlers[kind];handlers[kind]=async args=>{try{await original(args);}catch(error){
  record.handlerFailure=safeFailure(error);if(args.signal.aborted)record.abortReason=safeFailure(args.signal.reason);save();throw error;
 }};}
 const worker=new PlannerWorker(attempts,handlers,()=>{});await worker.tick();
 try{const until=Date.now()+300000;while(Date.now()<until){const a=(await connection.query('SELECT artifact FROM "PlannerAttempt" WHERE id=$1',[admitted.attempt.attemptId])).rows[0].artifact;if(!['QUEUED','RUNNING'].includes(a.state))break;await new Promise(r=>setTimeout(r,200));}}finally{await worker.shutdown();}
 const stored=await db.coordinated(n,sql=>loadAttempt(sql,n,admitted.attempt.attemptId));record.finishedAt=new Date().toISOString();record.latencyMs=Date.now()-started;record.observedOutcome=stored.attempt.state;record.error=stored.attempt.error;record.budget=stored.attempt.budget;record.providerCalls=stored.payload.calls;record.providerMetadata=stored.payload.providerCalls;record.checkpoint=stored.payload.checkpoint;record.research=stored.payload.researchCheckpoint;
 if(stored.attempt.state==='SUCCEEDED'&&stored.attempt.result?.kind==='REVISIONS'){const revisions=(await connection.query('SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=ANY($1::uuid[])',[stored.attempt.result.revisions.map(r=>r.revisionId)])).rows.map(r=>r.v2Artifact);record.revisions=revisions;
  try{const receipt=await new ApplyService(db).apply(n,{attemptId:stored.attempt.attemptId,changeSetId:PlanChangeSetV2Schema.parse(stored.payload.changeSet).changeSetId,acknowledgements:PlanChangeSetV2Schema.parse(stored.payload.changeSet).quality.requiredAcknowledgements});record.apply={status:'APPLIED',receipt};}catch(error){record.apply={status:'FAILED',code:error instanceof DurablePlannerError?error.detail.code:'UNCLASSIFIED'};}
 }
 record.executionCounts=(await connection.query('SELECT (SELECT count(*) FROM "Quest" WHERE "userId"=$1)::int AS quests,(SELECT count(*) FROM "Goal" WHERE "userId"=$1)::int AS goals',[n])).rows[0];save();
 // Safe operational expectations. Educational evaluation is separately recorded
 // from the REAL outputs; the model's own review is not a human quality score.
 if(c.id==='infeasible-zero-capacity'||c.id==='indivisible-checkpoint'){expect(stored.attempt.state).not.toBe('SUCCEEDED');expect(['NEEDS_DECISION','FAILED']).toContain(stored.attempt.state);expect((record.executionCounts as {quests:number}).quests).toBe(0);expect(stored.attempt.checkpoint).not.toBeNull();expect(Object.values(stored.payload.providerCalls??{}).some(call=>call.purpose==='ADAPTATION'||call.purpose==='REVIEW')).toBe(true);}
 else if(c.id==='public-assessment-research'){expect(stored.attempt.budget.consumed.researchQueries).toBeGreaterThan(0);expect(stored.attempt.budget.consumed.fetchAttempts).toBeGreaterThan(0);expect(['SUCCEEDED','NEEDS_DECISION']).toContain(stored.attempt.state);if(stored.attempt.state==='NEEDS_DECISION')expect((record.executionCounts as {quests:number}).quests).toBe(0);}
 else{expect(stored.attempt.error?.code??stored.attempt.state).toBe('SUCCEEDED');expect(record.apply).toMatchObject({status:'APPLIED'});if(c.id==='zero-new-work')expect((record.executionCounts as {quests:number}).quests).toBe(0);}
},360000);
