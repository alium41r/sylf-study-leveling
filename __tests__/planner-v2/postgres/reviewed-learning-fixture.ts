import { randomUUID } from "node:crypto";
import type pg from "pg";
import { user } from "./database";
import { intentFixture } from "./intent-fixture";
import { naturalProposal, naturalText } from "../intelligence/natural-learning-fixture";
import { GenerationService } from "@/lib/planner/v2/server/generation";
import { AttemptService } from "@/lib/planner/v2/server/attempts";
import { PlannerDatabase, DurablePlannerError } from "@/lib/planner/v2/server/database";
import { ResearchService } from "@/lib/planner/v2/server/research";
import { LearningCompilerService } from "@/lib/planner/v2/server/learning";
import { PlannerCalendarCapacity } from "@/lib/planner/v2/server/calendar-capacity";
import { ReviewedLearningStage } from "@/lib/planner/v2/server/reviewed-learning";
import { offlineResourcePolicy } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import type { LLMAdapter,LLMResponse } from "@/lib/ai/providers/types";
import type { CanonicalIntentV2 } from "@/lib/planner/v2/contracts";
import { IntentService,ownedPlan } from "@/lib/planner/v2/server/intents";
import { DocumentRepository } from "@/lib/planner/v2/server/documents";

export const reviewSignal=()=>new AbortController().signal;
export const reviewResponse=()=>({plans:[{planRef:"plan_1",issues:[]}],routes:[],dispositions:[],verdict:"APPROVED",completeResultInspected:true,explanation:"Scripted complete-result assessment; mechanics qualification, not live educational quality",next:null,questions:[]});
// Scripted education cases use future availability; real clock expiry is covered by capacity/currentness tests.
export function journeyIntent():CanonicalIntentV2{return {...intentFixture(),policy:"GENERAL",deadline:{kind:"NONE"},availability:{timezone:"UTC",dailyCeilingMinutes:Array(7).fill(180),weeklyCeilingMinutes:1260,restWeekdays:[],blockedDates:[],recoveryPercent:10,basis:"CONFIRMED_AVAILABILITY",studyWindows:{schemaVersion:1,weekly:Array.from({length:7},(_,weekday)=>({weekday,startMinute:540,endMinute:1200})),overrides:[{date:new Date().toISOString().slice(0,10),windows:[]}]}}};}
export async function reviewedFixture(client:pg.Client,db:PlannerDatabase,options:{owner?:number;expectedInitialFailure?:string;intent?:CanonicalIntentV2;joint?:boolean;documents?:number;existingPlanId?:string;repository?:DocumentRepository;maximumSearchNodes?:number;metadata?:(role:string)=>Partial<LLMResponse>;reply?:(packet:Record<string,unknown>)=>unknown;respond?:(role:string,packet:Record<string,unknown>,index:number)=>unknown}={}){
  const owner=options.owner??await user(client);await client.query('UPDATE "User" SET "restDays"=\'{}\' WHERE id=$1',[owner]);
  const {authorizationDigest:_authorization,...base}=offlineResourcePolicy("a".repeat(64),randomUUID());void _authorization;
  const resources={...base,journeyVersion:1 as const};
  const blobs=new Map<string,Uint8Array>(),documents=options.repository??new DocumentRepository(db,{write:async(p,b)=>{blobs.set(p,b);},read:async p=>blobs.get(p)!,remove:async p=>{blobs.delete(p);}}),uploaded:Awaited<ReturnType<DocumentRepository['upload']>>[]=[];
  const targets=[];
  if(options.documents||options.existingPlanId){const planId=options.existingPlanId??(await new IntentService(db).create(owner,randomUUID(),options.intent??journeyIntent())).plan.id;
    for(let i=0;i<Math.min(9,options.documents??0);i++)uploaded.push(await documents.upload(owner,planId,randomUUID(),`Circuit source ${i+1}`,"text/plain",Buffer.from(`Original circuit source ${i+1}: a 6 V source and 3 ohm resistor produce 2 A.`)));
    const plan=await db.coordinated(owner,sql=>ownedPlan(sql,owner,planId));targets.push({kind:"EXISTING" as const,planId,expectedIntentVersionId:plan.workingIntentVersionId!,expectedPlanningVersion:plan.version,baseActiveRevisionId:plan.activeRevisionId});
  }else targets.push({kind:"NEW" as const,intent:options.intent??journeyIntent()});
  if(options.joint)targets.push({kind:"NEW" as const,intent:{...(options.intent??journeyIntent()),title:"Circuit application to an independent project"}});
  if(uploaded.length)resources.researchTools={researchQueries:200,fetchAttempts:400,selectedSourceCharacters:2000000,extractedPages:2000,ocrPages:100,followUps:1000};
  const generation=new GenerationService(db,{compilerVersion:2,resources}),admitted=await generation.accept(owner,{schemaVersion:2,requestKey:randomUUID(),text:"Teach the exact accepted outcome with sufficient explanation and checked independent performance.",researchRequested:uploaded.length>0,documentIds:uploaded.map(d=>d.documentId),targets});
  const attempts=new AttemptService(db),token=(await attempts.claim(`reviewed_${randomUUID()}`))!;if(token.attemptId!==admitted.attempt.attemptId)throw new Error("Qualification admission is not isolated");
  const calls:{role:string;packet:Record<string,unknown>}[]=[];
  const adapter:LLMAdapter={generateResponse:async(messages,instruction)=>{
    const packet=JSON.parse(messages[0].content!),role=instruction.startsWith("Independently")?"VERIFICATION":instruction.startsWith("Check the complete")?"SYNTHESIS":instruction.includes("You are Sylf's Research & Understanding role.")?"RESEARCH":instruction.startsWith("You are Sylf's DeepSeek")?"STRATEGIST":instruction.startsWith("You are Sylf's independent educational reviewer")?"REVIEWER":"TRANSLATOR";
    calls.push({role,packet});
    const refs=Array.from({length:options.documents??0},(_,i)=>`source_${i+1}`),batches=[];
    for(let i=0;i<refs.length;i+=9)batches.push({planRef:"plan_1",sourceRefs:refs.slice(i,i+9),extraction:{identities:[],claims:refs.slice(i,i+9).map((sourceId,j)=>({sourceId,statement:`Original circuit source ${i+j+1}: a 6 V source and 3 ohm resistor produce 2 A.`,excerpt:`Original circuit source ${i+j+1}: a 6 V source and 3 ohm resistor produce 2 A.`,anchor:{section:"Document"},kind:"RESOURCE"})),completeSourceIds:[],gaps:[],answer:"These actual read resources support the original circuit example"}});
    const index=calls.filter(c=>c.role===role).length;
    const tool=role==="RESEARCH"&&(options.documents??0)>9?(index===1?{action:"SEARCH",query:"original tenth circuit source",reason:"Read the tenth actual resource"}:index===2?{action:"READ",candidateRef:"candidate_1",reason:"Read its actual source bytes"}:null):null;
    const defaults=tool??(role==="RESEARCH"?{action:"COMPLETE",summary:{goals:"Predict and explain electricity",background:"Student claims prior study",strengths:"No scoped demonstrated mastery supplied",weaknesses:"Method selection uncertain",resources:"Actual source contents and self-contained original givens",constraints:"Exact accepted scope, availability and protection",preferences:"Accepted pacing",uncertainty:"Distinguish claims and demonstrated ability"},batches,unresolved:[]}:role==="VERIFICATION"?{claims:(packet.candidates as {claimId:string}[]).map(c=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"The exact read resource states the given circuit relationship"})),identities:[],completeSourceIds:[],conflicts:[],answer:"Applicable original resources",scopeBindings:(packet.candidates as {claimId:string}[]).map(c=>({claimId:c.claimId,scopeRefs:[],disposition:"RESOURCE_ONLY"}))}:role==="SYNTHESIS"?{supported:true,explanation:"Facts, student claims and uncertainty remain distinguished",issues:[]}:role==="STRATEGIST"?naturalText:role==="TRANSLATOR"?naturalProposal(packet.ownedLearning,packet.strategy):options.reply?.(packet)??{...reviewResponse(),plans:(packet.input as {goals:{planRef:string}[]}).goals.map(g=>({planRef:g.planRef,issues:[]}))});
    const result=await(options.respond?.(role,packet,index)??defaults);
    return {text:typeof result==="string"?result:JSON.stringify(result),model:"deepseek-flash",fingerprint:"offline-scripted",finishReason:"STOP",usage:{promptTokens:100,completionTokens:100,totalTokens:200,reasoningTokens:50,cacheHitTokens:0},...options.metadata?.(role)};
  }};
  const provider={adapter:()=>adapter},research=new ResearchService(attempts,{search:(options.documents??0)>9?{id:"deepseek",search:async()=>[{url:"https://example.edu/circuit",title:"Original tenth circuit source",provider:"deepseek",rank:1,snippet:"Discovery only"}]}:null,fetch:async(url,config)=>{await config?.beforeRequest?.();const rawBytes=Buffer.from("Original circuit source 10: a 6 V source and 3 ohm resistor produce 2 A.");return {finalUrl:url,contentType:"text/plain",text:"",partial:false,partialReason:null,bytes:rawBytes.length,requests:1,rawBytes};},provider,documents}),learning=new LearningCompilerService(attempts,{provider,documents,maximumSearchNodes:options.maximumSearchNodes}),natural=learning.natural(),reviewed=new ReviewedLearningStage(natural,research.understanding());
  await research.understanding().run(token,reviewSignal());await new PlannerCalendarCapacity(attempts).run(token,reviewSignal());
  const allocation=await natural.run(token,reviewSignal()).catch(async error=>{
    if(!(error instanceof DurablePlannerError)||error.detail.code!==options.expectedInitialFailure)throw error;
    const checkpoint=(await natural.state(token)).checkpoint;if(!checkpoint)throw error;return checkpoint;
  });
  return {owner,attempt:admitted.attempt,attempts,token,research,learning,natural,reviewed,allocation,calls,provider,documents,uploaded,blobs};
}
