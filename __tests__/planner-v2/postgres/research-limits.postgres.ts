import { beforeAll,afterAll,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect,user } from "./database";
import { intentFixture } from "../contracts/fixtures";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { AttemptService,newBudget,loadAttempt } from "@/lib/planner/v2/server/attempts";
import { ResearchService } from "@/lib/planner/v2/server/research";
import type { LLMAdapter } from "@/lib/ai/providers/types";

let connection:pg.Client,pool:pg.Pool,db:PlannerDatabase,attempts:AttemptService;
beforeAll(async()=>{connection=await connect();pool=new pg.Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL});db=new PlannerDatabase(pool);attempts=new AttemptService(db);});
afterAll(async()=>{await pool.end();await connection.end();});
for(const mode of ["fetch","redirect","query"] as const)it(`retains read evidence and discloses the ${mode} ceiling before synthesis`,async()=>{
 const owner=await user(connection),created=await new IntentService(db).create(owner,randomUUID(),intentFixture());
 const queued=await attempts.enqueue(owner,{key:randomUUID(),text:"Read applicable sources",kind:"PLAN",targets:[{planId:created.plan.id,intentId:created.intent.intentVersionId,planningVersion:0,baseRevisionId:null}],budget:newBudget("RESEARCH")});
 const token=await attempts.claim(`research_limit_${randomUUID()}`,["PLAN"]);if(!token||token.attemptId!==queued.attemptId)throw new Error("Isolated admission required");
 await attempts.startResearchWindow(token);await attempts.consumeResearch(token,mode==="query"?{researchQueries:8}:{fetchAttempts:15});
 let queries=0,hops=0,modelCalls=0;const inputs:{sources:unknown[];gaps:string[]}[]=[];
 const service=new ResearchService(attempts,{
  search:{id:"brave",search:async request=>{queries++;await request.beforeRequest?.();return Array.from({length:9},(_,i)=>({url:`https://cambridgeinternational.org/limit-${randomUUID()}/${i}`,title:"Candidate source",snippet:"Not evidence",rank:i+1,provider:"brave" as const}));}},
  fetch:async(url,options)=>{hops++;await options?.beforeRequest?.();if(mode==="redirect"){hops++;await options?.beforeRequest?.();}const bytes=Buffer.from("A fetched source whose exact content remains available to research verification.");return {finalUrl:url,contentType:"text/plain",text:"",partial:false,partialReason:null,bytes:bytes.length,requests:1,rawBytes:bytes};},
  provider:{adapter:()=>({generateResponse:async(messages)=>{modelCalls++;const input=JSON.parse(messages[0].content!);inputs.push(input);const result=modelCalls===1?{plans:[{planRef:"plan_1",extraction:{identities:[],claims:[],completeSourceIds:[],gaps:["Assessment identity is not established"],answer:"Need assessment identity"}}]}:{plans:[{planRef:"plan_1",review:{scopeBindings:[],claims:[],identities:[],completeSourceIds:[],conflicts:[],answer:"Need assessment identity"}}]};return {text:JSON.stringify(result),finishReason:"STOP",usage:{promptTokens:100,completionTokens:100,totalTokens:200}};}}) as LLMAdapter},
 });
 try{await service.process(token,new AbortController().signal);const stored=await db.coordinated(owner,sql=>loadAttempt(sql,owner,queued.attemptId));
  expect(modelCalls).toBe(2);expect(inputs[0].gaps.join(" ")).toContain("ceiling");expect(stored.payload.researchCheckpoint).toMatchObject({phase:"VERIFIED",pendingCandidates:[]});
  expect(stored.attempt.budget.consumed).toMatchObject({researchQueries:mode==="query"?8:1,fetchAttempts:mode==="query"?0:16,researchSynthesisCalls:2});
  expect(queries).toBe(mode==="query"?0:1);expect(hops).toBe(mode==="query"?0:mode==="fetch"?1:2);expect(inputs[0].sources).toHaveLength(mode==="fetch"?1:0);
 }finally{await attempts.cancel(owner,queued.attemptId);}
});
