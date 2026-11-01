import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { intentFixture } from "./intent-fixture";
import { GenerationService } from "@/lib/planner/v2/server/generation";
import { AttemptService } from "@/lib/planner/v2/server/attempts";
import { PlannerDatabase, hash, DurablePlannerError } from "@/lib/planner/v2/server/database";
import { ResearchService } from "@/lib/planner/v2/server/research";
import { PlannerCompilerService } from "@/lib/planner/v2/server/compiler";
import { PlannerFoundationService } from "@/lib/planner/v2/server/foundation";
import { DocumentRepository } from "@/lib/planner/v2/server/documents";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { offlineResourcePolicy } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import type { SearchProvider } from "@/lib/planner/research/search/contracts";
import { SearchProviderError } from "@/lib/planner/research/search/provider-runtime";
import type { UnderstandingAction } from "@/lib/planner/v2/intelligence/schemas/understanding";
import { readOcrBatch } from "@/lib/planner/v2/intelligence/ocr";
import { naturalText, naturalProposal } from "../intelligence/natural-learning-fixture";
import { workerProviderMeter } from "@/lib/planner/v2/intelligence/provider";
import { pdfFixture } from "../intelligence/research-fixtures";
import { documentContentHash } from "@/lib/planner/v2/server/documents";

let client:pg.Client,pool:pg.Pool,db:PlannerDatabase,attempts:AttemptService;
const owners=new Set<number>();
beforeAll(async()=>{client=await connect();pool=new pg.Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL,max:6});db=new PlannerDatabase(pool);attempts=new AttemptService(db);});
afterEach(async()=>{for(const owner of owners)for(const row of (await client.query('SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN (\'RUNNING\',\'QUEUED\',\'NEEDS_DECISION\')',[owner])).rows)await attempts.cancel(owner,row.id);owners.clear();});
afterAll(async()=>{await pool?.end();await client?.end();});
const summary={goals:"Understand electricity",background:"Student reports prior study; not a mastery attestation",strengths:"No demonstrated ability supplied",weaknesses:"Method selection remains uncertain",resources:"Use the actual read contents",constraints:"Preserve the accepted deadline and protected work",preferences:"Respect comfortable early pacing",uncertainty:"Use a conditional check where readiness is uncertain"};
const complete=():UnderstandingAction=>({action:"COMPLETE",summary,batches:[],unresolved:[]});
const question=():UnderstandingAction=>({action:"CLARIFY",summary,questions:[{ref:"question_assignment",topic:"assignment_content",question:"What is the exact assignment question?",consequence:"Its required deliverable changes the scope."}]});
async function fixture(options:{document?:string;pdf?:Buffer;research?:boolean;processingMs?:number;acceptedText?:string;intent?:ReturnType<typeof intentFixture>}={}) {
  const ownerId=await user(client);owners.add(ownerId);
  const intent=options.intent??{...intentFixture(),policy:"GENERAL" as const};
  const created=await new IntentService(db).create(ownerId,randomUUID(),intent);
  const blobs=new Map<string,Uint8Array>(),documents=new DocumentRepository(db,{write:async(p,b)=>{blobs.set(p,b);},read:async p=>blobs.get(p)!,remove:async p=>{blobs.delete(p);}});
  const uploaded=options.pdf?await documents.upload(ownerId,created.plan.id,randomUUID(),"Actual project brief","application/pdf",options.pdf):options.document?await documents.upload(ownerId,created.plan.id,randomUUID(),"Actual project brief","text/plain",Buffer.from(options.document)):null;
  const {authorizationDigest:_auth,...resources}=offlineResourcePolicy("a".repeat(64),randomUUID());void _auth;
  resources.processingMs=options.processingMs??3600000;
  const policy={...resources,researchTools:{researchQueries:200,fetchAttempts:400,selectedSourceCharacters:2000000,extractedPages:2000,ocrPages:100,followUps:1000}};
  const generation=new GenerationService(db,{compilerVersion:2,resources:policy});
  const attempt=(await generation.accept(ownerId,{schemaVersion:2,requestKey:randomUUID(),text:options.acceptedText??"Understand my accepted goals deeply; do not change protected work.",researchRequested:options.research??true,documentIds:uploaded?[uploaded.documentId]:[],targets:[{kind:"EXISTING",planId:created.plan.id,expectedIntentVersionId:created.intent.intentVersionId,expectedPlanningVersion:0,baseActiveRevisionId:null}]})).attempt;
  const token=(await attempts.claim(`understanding_${randomUUID()}`))!;expect(token.attemptId).toBe(attempt.attemptId);
  return {ownerId,attempt,token,documents,blobs,uploaded,intent};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function scripted(f:Fixture,actions:UnderstandingAction[],extra:ConstructorParameters<typeof ResearchService>[1]={}) {
  let calls=0;
  const adapter:LLMAdapter={generateResponse:async(messages,instruction)=>{
    calls++;const input=JSON.parse(messages[0].content!);
    const value=instruction.startsWith("Check the complete")?{supported:true,explanation:"The synthesis distinguishes actual source evidence, student reports and uncertainty",issues:[]}:instruction.startsWith("Independently")?{claims:input.candidates.map((c:{claimId:string})=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"The literal text supports its own project outcome"})),identities:[],completeSourceIds:[],conflicts:[],answer:"Applicable project content checked",scopeBindings:input.candidates.map((c:{claimId:string})=>({claimId:c.claimId,scopeRefs:[],disposition:"RESOURCE_ONLY"}))}:actions.shift();
    if(!value)throw new Error("Unexpected extra provider call");
    return {model:"deepseek-flash",fingerprint:"scripted-research",finishReason:"STOP",text:JSON.stringify(value),usage:{promptTokens:100,completionTokens:100,reasoningTokens:70,totalTokens:200,cacheHitTokens:0}};
  }};
  const service=new ResearchService(attempts,{documents:f.documents,provider:{adapter:()=>adapter},search:null,...extra});
  return {research:service,stage:service.understanding(),calls:()=>calls};
}
function completionWithSource():UnderstandingAction {
  return {action:"COMPLETE",summary,batches:[{planRef:"plan_1",sourceRefs:["source_1"],extraction:{identities:[],claims:[{sourceId:"source_1",statement:"Explain Ohm's law using current, voltage and resistance.",excerpt:"Explain Ohm's law using current, voltage and resistance.",anchor:{section:"Document"},kind:"COURSE_OUTCOME"}],completeSourceIds:[],gaps:[],answer:"The actual project needs an explanation of Ohm's law."}}],unresolved:[]};
}
function decision(f:Fixture,digest:string,key=randomUUID()) {return {key,parentAttemptId:f.token.attemptId,expectedResearchDigest:digest,answers:[{ref:"question_assignment",text:"Explain Ohm's law using a labelled circuit."}],intents:[{planId:f.attempt.targets[0].planId,expectedIntentId:f.attempt.targets[0].requestedIntentVersionId,expectedPlanningVersion:0,baseRevisionId:null}]};}
describe("durable compiler-v2 Research & Understanding",()=>{
  it("durably retains a PDF with undecodable NUL glyphs as partial evidence with its original byte hash",async()=>{
    const pdf=Buffer.from(pdfFixture(2).toString().replace("(Contents)","(Con\u0000ents)")),f=await fixture({pdf});
    const draft=complete();if(draft.action!=="COMPLETE")throw new Error("Completion required");
    draft.unresolved=[{ref:"unreadable_math",consequential:false,explanation:"Some source symbols remain unverified; do not infer mathematical content from replacement markers."}];
    const s=scripted(f,[draft]),run=await s.stage.run(f.token,new AbortController().signal);
    expect(run.phase).toBe("COMPLETE");expect(run.sources[0].source.contentHash).toBe(documentContentHash(pdf));
    expect(run.sources[0].source.extraction.status).toBe("PARTIAL");expect(run.sources[0].source.extraction.gaps.join(" ")).toContain("U+FFFD");
    expect(run.sources[0].sections[0].text).toContain("Con�ents");expect(JSON.stringify(run.sources)).not.toContain("\\u0000");
    const retained=await s.stage.read(f.ownerId,f.token.attemptId);expect(retained.run?.sources).toEqual(run.sources);
    expect((await client.query('SELECT count(*)::int AS n FROM "PlannerRevision" WHERE "attemptId"=$1',[f.token.attemptId])).rows[0].n).toBe(0);
  });
  it("reports a source checkpoint failure without treating unsaved content as retained research",async()=>{
    const f=await fixture({document:"A source that must be saved before using it."}),s=scripted(f,[complete()]);
    const save=s.stage["save"].bind(s.stage);s.stage["save"]=async(token,run)=>{if(run.sources.length)throw Object.assign(new Error("database encoding error"),{code:"22P05"});return save(token,run);};
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"SAVE_FAILED",stage:"RESEARCH"},cause:{code:"22P05"}});
    expect(s.calls()).toBe(0);expect((await s.stage.read(f.ownerId,f.token.attemptId)).run?.sources).toEqual([]);
  });
  it("repairs the actual missing identity-anchor failure using exact validator paths, without weakening provenance",async()=>{
    const f=await fixture({document:"Explain Ohm's law using current, voltage and resistance."});let repaired=false;
    const bad=completionWithSource();if(bad.action!=="COMPLETE")throw new Error("Completion required");
    const raw=JSON.parse(JSON.stringify(bad));raw.batches[0].extraction.identities=[{sourceId:"source_1",fields:[{field:"programme",value:"Electricity",excerpt:"Explain Ohm's law"}]}];raw.batches[0].extraction.answer="x".repeat(4001);
    const s=scripted(f,[],{provider:{adapter:()=>({generateResponse:async(messages,instruction)=>{
      const packet=JSON.parse(messages[0].content!);let value:unknown;
      if(instruction.startsWith("Check the complete"))value={supported:true,explanation:"The exact accepted goal and literal source evidence are retained.",issues:[]};
      else if(instruction.startsWith("Independently verify"))value={claims:packet.candidates.map((c:{claimId:string})=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"Literal course outcome in the selected source"})),identities:[],completeSourceIds:[],conflicts:[],answer:"Verified literal support",scopeBindings:packet.candidates.map((c:{claimId:string})=>({claimId:c.claimId,scopeRefs:[],disposition:"RESOURCE_ONLY"}))};
      else if(packet.validationRecovery){
        expect(packet.validationRecovery.validation).toMatchObject({code:"SCHEMA_MISMATCH",issues:expect.arrayContaining([{code:"invalid_type",path:["batches",0,"extraction","identities",0,"fields",0,"anchor"],omittedPathSegments:0,expected:"object"},expect.objectContaining({code:"too_big",maximum:4000,path:["batches",0,"extraction","answer"]})])});
        expect(packet.responseContract).toHaveProperty("oneOf");repaired=true;value=bad;
      }else value=raw;
      return {model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify(value),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};
    }})}});
    const run=await s.stage.run(f.token,new AbortController().signal);expect(run.phase).toBe("COMPLETE");expect(repaired).toBe(true);
    const rejected=(await client.query(`SELECT reservation FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->>'accepted'='false'`,[f.token.attemptId])).rows;
    expect(rejected).toHaveLength(1);expect(JSON.parse(rejected[0].reservation.result.text)).toEqual(raw);
  });
  it("corrects one rejected action shape, retains both receipts, and recovers its settled correction without redispatch",async()=>{
    const f=await fixture({research:false});let calls=0;
    const s=scripted(f,[],{provider:{adapter:()=>({generateResponse:async(messages,instruction)=>{
      calls++;const packet=JSON.parse(messages[0].content!);
      const value=instruction.startsWith("Check the complete")?{supported:true,explanation:"Context-only understanding retains uncertainty",issues:[]}:
        packet.validationRecovery?complete():{actions:[complete()]};
      if(packet.validationRecovery){expect(packet.validationRecovery.kind).toBe("REJECTED_UNTRUSTED_ACTION");expect(JSON.parse(packet.validationRecovery.response)).toEqual({actions:[complete()]});expect(packet.referenceInventory.planRefs).toEqual(["plan_1"]);}
      return {model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify(value),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};
    }})}});
    const save=s.stage["save"].bind(s.stage);let crash=true;
    s.stage["save"]=async(token,run)=>{if(crash&&run.pending){crash=false;throw new DurablePlannerError("WORKER_UNAVAILABLE","After settled correction","RECOVERY");}return save(token,run);};
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"WORKER_UNAVAILABLE"}});
    expect(calls).toBe(2);
    await attempts.release(f.token);const token=(await attempts.claim(`corrected_${randomUUID()}`))!;
    const run=await s.stage.run(token,new AbortController().signal);
    expect(run.phase).toBe("COMPLETE");expect(run.input.actionRecoveryVersion).toBe(1);expect(calls).toBe(3);
    expect(run.calls).toHaveLength(2);expect(run.calls[0].key).toMatch(/_repair1$/);
    const logs=(await client.query('SELECT "accountingState",reservation FROM "AiUsageLog" WHERE "attemptId"=$1 ORDER BY id',[f.token.attemptId])).rows;
    expect(logs).toHaveLength(3);expect(logs.every(r=>r.accountingState==="SETTLED")).toBe(true);
    expect(logs[0].reservation).toMatchObject({accepted:false,result:{text:JSON.stringify({actions:[complete()]})}});
    expect(logs[1].reservation).toMatchObject({accepted:true,result:{text:JSON.stringify(complete())}});
    expect((await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.consumed.calls).toBe(3);
  });
  it("stops after one still-invalid correction with both charges retained",async()=>{
    const f=await fixture({research:false});let calls=0;
    const s=scripted(f,[],{provider:{adapter:()=>({generateResponse:async()=>{
      calls++;return {model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify({actions:[complete()]}),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};
    }})}});
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"INVALID_OUTPUT"}});
    expect(calls).toBe(2);
    const logs=(await client.query('SELECT "accountingState",reservation FROM "AiUsageLog" WHERE "attemptId"=$1',[f.token.attemptId])).rows;
    expect(logs).toHaveLength(2);expect(logs.every(r=>r.accountingState==="SETTLED"&&r.reservation.accepted===false)).toBe(true);
    expect((await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.uncertainDispatch).toBe(false);
  });
  it("completes a context-only dossier without unnecessary questions or web research",async()=>{
    const f=await fixture({research:false}),s=scripted(f,[complete()]);
    const run=await s.stage.run(f.token,new AbortController().signal);expect(run.phase).toBe("COMPLETE");expect(s.calls()).toBe(2);
    expect(run.input.acceptedRequest).toEqual(f.attempt.acceptedRequest);
    const retained=await new PlannerFoundationService(attempts).inspect(f.ownerId,f.token.attemptId);
    if(retained.compilerVersion!==2)throw new Error("Expected the versioned research archive");
    expect(retained.archive.entries).toBeDefined();const dossier=Object.values(retained.archive.entries).find(a=>a.kind==="DOSSIER")!;
    expect(dossier.value).toMatchObject({schemaVersion:2,capacity:null,calendarDigest:null});
    expect(JSON.stringify(run.input.context)).toContain('"demonstratesReadiness":false');
    expect((await client.query('SELECT count(*)::int AS n FROM "PlannerRevision" WHERE "attemptId"=$1',[f.token.attemptId])).rows[0].n).toBe(0);
    await s.stage.run(f.token,new AbortController().signal);expect(s.calls()).toBe(2);
  });
  it("reads owned uploaded contents and independently checks support without upgrading private issuer authority",async()=>{
    const f=await fixture({document:"Explain Ohm's law using current, voltage and resistance."}),s=scripted(f,[completionWithSource()]);
    const run=await s.stage.run(f.token,new AbortController().signal);expect(s.calls()).toBe(3);
    expect(run.sources[0]).toMatchObject({source:{authority:"UNKNOWN",location:{ownerId:f.ownerId,documentId:f.uploaded!.documentId}}});
    expect(run.verified[0].evidence).toMatchObject({claims:[{status:"ADOPTED",verification:{excerpt:"VERIFIED",support:"SUPPORTED",applicability:"MATCHED"}}]});
    expect((await attempts.read(f.ownerId,f.token.attemptId)).targets[0].requestedIntentVersionId).toBe(f.attempt.targets[0].requestedIntentVersionId);
  });
  it("retains exact accepted student attribution and local school scope through versioned verification without official authority",async()=>{
    const text="Amina is the student. This is my diagnostic work and private school mock scope, not an external board specification.",f=await fixture({acceptedText:text,document:"School mock: explain Ohm's law. Student correctly described the circuit without help."});
    const draft=completionWithSource();if(draft.action!=="COMPLETE")throw new Error("COMPLETE required");draft.batches[0].extraction.claims[0]={sourceId:"source_1",statement:"The local school mock requires explaining Ohm's law.",excerpt:"School mock: explain Ohm's law.",anchor:{section:"Document"},kind:"COURSE_OUTCOME"};
    let packet:Record<string,unknown>|null=null;
    const s=scripted(f,[draft],{provider:{adapter:()=>({generateResponse:async(messages,instruction)=>{
      const p=JSON.parse(messages[0].content!);if(instruction.startsWith("Independently")){packet=p;expect(p.verificationContext).toMatchObject({schemaVersion:2,acceptedInput:{acceptedRequest:{text}},sourceAttributions:[{documentId:f.uploaded!.documentId,ownerId:f.ownerId}]});expect(instruction).toContain("COURSE_OUTCOME");}
      const value=instruction.startsWith("Check the complete")?{supported:true,explanation:"The local source and accepted diagnostic relationship are separate; issuer authority remains unknown",issues:[]}:instruction.startsWith("Independently")?{claims:p.candidates.map((c:{claimId:string})=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"Quoted local school content, not official certification"})),identities:[],completeSourceIds:["source_1"],conflicts:[],answer:"Local school content",scopeBindings:p.candidates.map((c:{claimId:string})=>({claimId:c.claimId,scopeRefs:[],disposition:"RESOURCE_ONLY"}))}:draft;
      return {text:JSON.stringify(value),model:"deepseek-flash",finishReason:"STOP",usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};
    }})}});
    const run=await s.stage.run(f.token,new AbortController().signal);expect(packet).not.toBeNull();expect(run.input.verificationVersion).toBe(3);expect(run.phase).toBe("COMPLETE");expect(run.verified[0].evidence).toMatchObject({completeAssessedScope:false,sources:[{authority:"UNKNOWN"}],claims:[{status:"ADOPTED"}]});
    await expect(db.coordinated(f.ownerId,sql=>sql.query(`UPDATE "PlannerAttempt" SET payload=jsonb_set(payload,'{understanding,input,verificationVersion}','1') WHERE id=$1`,[f.token.attemptId]))).rejects.toThrow();
  });
  it("keeps fabricated literal evidence rejected and asks about unresolved assessment identity",async()=>{
    const f=await fixture({document:"Explain Ohm's law using current, voltage and resistance."}),draft=completionWithSource();
    if(draft.action!=="COMPLETE")throw new Error("Expected completion");
    draft.batches[0].extraction.claims[0].excerpt="A fabricated document quotation which never appeared in the uploaded material.";
    const s=scripted(f,[draft]),run=await s.stage.run(f.token,new AbortController().signal);
    expect(run.verified[0].evidence).toMatchObject({claims:[{status:"REJECTED",verification:{excerpt:"UNVERIFIED"}}]});
    const exam=await fixture({intent:intentFixture()}),e=scripted(exam,[complete(),question()]);
    const missing=await e.stage.run(exam.token,new AbortController().signal);expect(missing.phase).toBe("NEEDS_DECISION");
    expect(missing.gaps.join(" ")).toContain("Issuer-verified applicable assessed scope");
  });
  it("returns unsupported synthesis to Research for substantive correction before dossier acceptance",async()=>{
    const f=await fixture(),fullObjection="The complete accepted context contradicts this unsupported mastery inference. ".repeat(80);let checks=0,calls=0;
    const s=scripted(f,[],{provider:{adapter:()=>({generateResponse:async(_messages,instruction)=>{
      calls++;const value=instruction.startsWith("Check the complete")?{supported:++checks>1,explanation:checks===1?fullObjection:"The corrected account preserves uncertainty",issues:checks===1?[{ref:"unsupported_mastery",consequential:true,explanation:"Time spent is not demonstrated ability"}]:[]}: {...complete(),summary:{...summary,strengths:checks?"Actual ability remains unknown":"Secure mastery"}};
      return {model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify(value),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};
    }})}});
    const run=await s.stage.run(f.token,new AbortController().signal);expect(checks).toBe(2);expect(calls).toBe(4);expect(run.phase).toBe("COMPLETE");expect(run.gaps).toContain("Time spent is not demonstrated ability");expect(run.gaps).toContain(fullObjection);expect(run.input.calendarSemanticsVersion).toBe(1);
    expect(run.actions.filter(a=>a.action==="COMPLETE")).toHaveLength(2);expect(run.synthesisReview?.supported).toBe(true);
  });
  it("retains consequential clarification and continues with original root, deadline, exact instructions and accounting",async()=>{
    const f=await fixture(),s=scripted(f,[question()]);const run=await s.stage.run(f.token,new AbortController().signal);
    expect((await attempts.read(f.ownerId,f.token.attemptId)).state).toBe("NEEDS_DECISION");
    const request=decision(f,run.digest),child=await s.stage.continue(f.ownerId,request);expect((await s.stage.continue(f.ownerId,request)).replayed).toBe(true);
    const token=(await attempts.claim(`clarification_${randomUUID()}`))!,next=scripted({...f,token},[complete()]);
    const resumed=await next.stage.run(token,new AbortController().signal);expect(resumed.answers).toMatchObject([{topic:"assignment_content",text:request.answers[0].text}]);
    const actual=await attempts.read(f.ownerId,token.attemptId),parent=await attempts.read(f.ownerId,f.token.attemptId);
    expect(actual.budget).toMatchObject({rootRequestId:parent.budget.rootRequestId,processingStartedAt:parent.budget.processingStartedAt,executionDeadlineAt:parent.budget.executionDeadlineAt,consumed:{modelCalls:3}});
    expect(actual.acceptedRequest).toEqual(parent.acceptedRequest);expect(child.attempt.parentAttemptId).toBe(parent.attemptId);
    expect((await client.query('SELECT used FROM "UserQuota" WHERE "userId"=$1',[f.ownerId])).rows).toEqual([{used:1}]);
  });
  it("rejects an expired clarification before creating another attempt or changing accepted facts",async()=>{
    const f=await fixture({research:false,processingMs:2000}),s=scripted(f,[question()]),run=await s.stage.run(f.token,new AbortController().signal);
    const before=await attempts.read(f.ownerId,f.token.attemptId);await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(before.budget.executionDeadlineAt!)-Date.now()+30)));
    await expect(s.stage.continue(f.ownerId,decision(f,run.digest))).rejects.toMatchObject({detail:{code:"BUDGET_EXHAUSTED",stage:"RECOVERY"}});
    expect(await attempts.read(f.ownerId,f.token.attemptId)).toEqual(before);
    expect((await client.query('SELECT count(*)::int AS n FROM "PlannerAttempt" WHERE "userId"=$1',[f.ownerId])).rows[0].n).toBe(1);
    expect((await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.consumed.calls).toBe(1);
  });
  it("carries the complete unsupported synthesis into a linked recovery after a failed transition checkpoint",async()=>{
    const f=await fixture({research:false}),objection="Preserve the exact original objection and correct the accepted capacity arithmetic. ".repeat(40);
    const s=scripted(f,[],{provider:{adapter:()=>({generateResponse:async(_messages,instruction)=>({model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify(instruction.startsWith("Check the complete")?{supported:false,explanation:objection,issues:[]}:complete()),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}})})}});
    const save=s.stage["save"].bind(s.stage);s.stage["save"]=async(token,run)=>{if(run.gaps.includes(objection))throw new DurablePlannerError("SAVE_FAILED","Transition interrupted","RESEARCH");return save(token,run);};
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"SAVE_FAILED"}});
    await attempts.fail(f.token,new DurablePlannerError("SAVE_FAILED","Transition interrupted","RESEARCH"));
    const parent=(await s.stage.read(f.ownerId,f.token.attemptId)).run!;expect(parent.synthesisReview?.explanation).toBe(objection);expect(parent.gaps).not.toContain(objection);
    const request={...decision(f,parent.digest),answers:[]};await s.stage.continue(f.ownerId,request);
    const token=(await attempts.claim(`retained_objection_${randomUUID()}`))!,child=scripted({...f,token},[complete()]);
    const run=await child.stage.run(token,new AbortController().signal);expect(run.phase).toBe("COMPLETE");expect(run.gaps).toContain(objection);
    const actual=await attempts.read(f.ownerId,token.attemptId),original=await attempts.read(f.ownerId,f.token.attemptId);expect(actual.budget.rootRequestId).toBe(original.budget.rootRequestId);expect(actual.budget.executionDeadlineAt).toBe(original.budget.executionDeadlineAt);expect(actual.budget.executionDeadlineAt).not.toBeNull();
    expect((await attempts.resources(f.ownerId,token.attemptId)).snapshot.consumed.calls).toBe(4);
  });
  it("requires explicit student-accepted canonical changes for hard facts and retains old immutable intent history",async()=>{
    const f=await fixture(),s=scripted(f,[question()]),run=await s.stage.run(f.token,new AbortController().signal),request=decision(f,run.digest);
    const changed={...f.intent,outcome:"Explain Ohm's law using a labelled circuit."};
    const child=await s.stage.continue(f.ownerId,{...request,intents:[{...request.intents[0],intent:changed}]});
    expect(child.attempt.targets[0].requestedIntentVersionId).not.toBe(f.attempt.targets[0].requestedIntentVersionId);
    expect(child.attempt.acceptedRequest).toEqual(f.attempt.acceptedRequest);
    expect((await client.query('SELECT count(*)::int AS n FROM "PlannerIntentVersion" WHERE "planId"=$1',[f.attempt.targets[0].planId])).rows[0].n).toBe(2);
  });
  it("rejects foreign ownership, stale decision digests, incomplete answers and concurrent sibling decisions",async()=>{
    const f=await fixture(),s=scripted(f,[question()]),run=await s.stage.run(f.token,new AbortController().signal),request=decision(f,run.digest);
    const foreign=await user(client);await expect(s.stage.continue(foreign,request)).rejects.toMatchObject({detail:{code:"REFERENCE_NOT_OWNED"}});
    await expect(s.stage.continue(f.ownerId,{...request,expectedResearchDigest:"a".repeat(64)})).rejects.toMatchObject({detail:{code:"STALE_CONTEXT"}});
    await expect(s.stage.continue(f.ownerId,{...request,answers:[]})).rejects.toMatchObject({detail:{code:"INVALID_OUTPUT"}});
    const results=await Promise.allSettled([s.stage.continue(f.ownerId,request),s.stage.continue(f.ownerId,{...request,key:randomUUID()})]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  });
  it("does not ask already answered information again without explaining a new consequential conflict",async()=>{
    const f=await fixture(),s=scripted(f,[question()]),run=await s.stage.run(f.token,new AbortController().signal);
    const child=await s.stage.continue(f.ownerId,decision(f,run.digest)),token=(await attempts.claim(`known_${randomUUID()}`))!;expect(token.attemptId).toBe(child.attempt.attemptId);
    await expect(scripted({...f,token},[question()]).stage.run(token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"INVALID_OUTPUT"}});
  });
  it("recovers the exact saved model response after a crash without a duplicate call",async()=>{
    const f=await fixture(),s=scripted(f,[complete()]);const original=s.stage["save"].bind(s.stage);let crash=true;
    s.stage["save"]=async(token,run)=>{if(crash&&run.pending){crash=false;throw new DurablePlannerError("WORKER_UNAVAILABLE","Scripted crash after settlement","RECOVERY");}return original(token,run);};
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"WORKER_UNAVAILABLE"}});
    await attempts.release(f.token);const token=(await attempts.claim(`takeover_${randomUUID()}`))!;
    const resumed=await s.stage.run(token,new AbortController().signal);expect(resumed.phase).toBe("COMPLETE");expect(s.calls()).toBe(2);
  });
  it("rejects a saved response after concurrent commitments change the protected context",async()=>{
    const f=await fixture(),s=scripted(f,[complete()]),original=s.stage["save"].bind(s.stage);
    s.stage["save"]=async(token,run)=>{if(run.pending)throw new DurablePlannerError("WORKER_UNAVAILABLE","Scripted loss before assembly","RECOVERY");return original(token,run);};
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toBeDefined();
    const quest=await db.coordinated(f.ownerId,async sql=>(await sql.query('INSERT INTO "Quest" ("userId",title,description,"scheduledFor","targetMinutes","requiredMinutes") VALUES ($1,\'Concurrent protected commitment\',\'Keep existing accepted work\',$2,30,30) RETURNING id',[f.ownerId,new Date().toISOString().slice(0,10)])).rows[0]);
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"STALE_CONTEXT"}});expect(s.calls()).toBe(1);
    expect((await client.query('SELECT title FROM "Quest" WHERE id=$1',[quest.id])).rows[0].title).toBe("Concurrent protected commitment");
  });
  it("blocks silent repeats and continuations after an uncertain search dispatch",async()=>{
    const f=await fixture(),search:SearchProvider={id:"deepseek",search:async()=>{throw new SearchProviderError("SEARCH_TIMEOUT");}},s=scripted(f,[{action:"SEARCH",query:"official electricity syllabus",reason:"Resolve actual course scope"}],{search});
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"QUALITY_INCOMPLETE"}});
    expect((await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.uncertainDispatch).toBe(true);
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"QUALITY_INCOMPLETE"}});expect(s.calls()).toBe(1);
    const record=(await client.query('SELECT * FROM "AiUsageLog" WHERE "attemptId"=$1 AND workload=\'planner_v2_tool\'',[f.token.attemptId])).rows[0];expect(record.estimatedCostUsd).toBeNull();
    await expect(db.coordinated(f.ownerId,sql=>sql.query('UPDATE "AiUsageLog" SET "accountingState"=\'DISPATCHED\' WHERE "requestId"=$1',[record.requestId]))).rejects.toThrow(/PLANNER_RESEARCH_TOOL_IMMUTABLE/);
    await attempts.fail(f.token,new DurablePlannerError("QUALITY_INCOMPLETE","Research needs reconciliation","RESEARCH"));
    const run=(await s.stage.read(f.ownerId,f.token.attemptId)).run!;
    await expect(s.stage.continue(f.ownerId,{...decision(f,run.digest),answers:[]})).rejects.toMatchObject({detail:{code:"QUALITY_INCOMPLETE"}});
    await s.stage.reconcileSearch(f.ownerId,f.token.attemptId,record.requestId,"EMPTY");
    const child=await s.stage.continue(f.ownerId,{...decision(f,run.digest),answers:[]});expect(child.attempt.budget.consumed.researchQueries).toBe(1);
  });
  it("retains real search provenance, safe fetch hops and known per-request DeepSeek cost",async()=>{
    const f=await fixture(),search:SearchProvider={id:"deepseek",search:async()=>[{url:"https://example.edu/course",title:"Course requirements",provider:"deepseek",rank:1,snippet:"Untrusted discovery hint"}]};
    const s=scripted(f,[{action:"SEARCH",query:"electricity project",reason:"Find actual course requirements"},{action:"READ",candidateRef:"candidate_1",reason:"Read the governing content"},completionWithSource()],{search,fetch:async(url,options)=>{await options?.beforeRequest?.();return {finalUrl:url,contentType:"text/plain",text:"",partial:false,partialReason:null,bytes:18,requests:1,rawBytes:Buffer.from("Explain Ohm's law using current, voltage and resistance.")};}});
    const run=await s.stage.run(f.token,new AbortController().signal);expect(run.candidates[0].provider).toBe("deepseek");expect(run.sources[0].sections[0].text).toBe("Explain Ohm's law using current, voltage and resistance.");
    expect((await attempts.read(f.ownerId,f.token.attemptId)).budget.consumed).toMatchObject({researchQueries:1,fetchAttempts:1});
    expect((await client.query('SELECT "accountingState","estimatedCostUsd" FROM "AiUsageLog" WHERE workload=\'planner_v2_tool\' AND "attemptId"=$1',[f.token.attemptId])).rows).toEqual([{accountingState:"SETTLED",estimatedCostUsd:0.00075}]);
  });
  it("routes bounded OCR through the existing DeepSeek adapter and the same role receipts",async()=>{
    const f=await fixture(),jpeg=Buffer.from([255,216,255,192,0,17,8,4,0,4,0,3,1,17,0,2,17,0,3,17,0,255,217]);
    let selected="";
    const result=await readOcrBatch(workerProviderMeter(attempts,f.token),[{page:7,data:jpeg.toString("base64")}],new AbortController().signal,{purpose:"OCR"},{adapter:route=>{selected=route.provider;return {generateResponse:async()=>({model:"deepseek-flash",finishReason:"STOP",text:JSON.stringify({pages:[{page:7,text:"Actual page text with original page provenance"}]}),usage:{promptTokens:100,completionTokens:50,reasoningTokens:30,totalTokens:150,cacheHitTokens:0}})};}},{role:"RESEARCH",key:randomUUID()},32768);
    expect(selected).toBe("deepseek");expect(result[0].page).toBe(7);
    expect((await attempts.read(f.ownerId,f.token.attemptId)).budget.consumed).toMatchObject({researchSynthesisCalls:1,outputTokens:50});
  });
  it("refuses invented fetch URLs and does not dispatch research without accepted permission",async()=>{
    const f=await fixture({research:false}),s=scripted(f,[{action:"SEARCH",query:"some syllabus",reason:"Try unapproved external research"}]);
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"INTENT_CONFLICT"}});
    const other=await fixture(),invented:UnderstandingAction={action:"READ",candidateRef:"invented_url",reason:"Try an unowned provenance reference"},o=scripted(other,[invented,invented]);await expect(o.stage.run(other.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"INVALID_OUTPUT"}});expect(o.calls()).toBe(2);
  });
  it("rejects changed uploaded bytes before recovering a saved dossier",async()=>{
    const f=await fixture({document:"Explain Ohm's law using current, voltage and resistance."}),s=scripted(f,[completionWithSource()]);await s.stage.run(f.token,new AbortController().signal);
    f.blobs.set(`${f.ownerId}/${f.uploaded!.documentId}`,Buffer.from("Altered source"));
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"STALE_CONTEXT"}});expect(s.calls()).toBe(3);
  });
  it("keeps cancellation, original deadline and closed downstream compiler gates authoritative",async()=>{
    const f=await fixture({intent:{...intentFixture(),policy:"GENERAL",availability:{timezone:"UTC",dailyCeilingMinutes:Array(7).fill(120),restWeekdays:[],blockedDates:[],recoveryPercent:0,basis:"CONFIRMED_AVAILABILITY",studyWindows:{schemaVersion:1,weekly:[],overrides:[]}}}}),s=scripted(f,[complete()]);await expect(new PlannerCompilerService(attempts,{research:s.research,provider:{adapter:()=>({generateResponse:async(messages,instruction)=>{const wire=JSON.parse(messages[0].content!);return {model:"deepseek-flash",finishReason:"STOP",text:instruction.startsWith("You are Sylf's DeepSeek")?naturalText:JSON.stringify(naturalProposal(wire.ownedLearning,wire.strategy,{empty:true})),usage:{promptTokens:100,completionTokens:100,totalTokens:200,cacheHitTokens:0}};}})}}).run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"QUALITY_INCOMPLETE",stage:"REVIEW"}});
    await attempts.cancel(f.ownerId,f.token.attemptId);await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"LEASE_EXPIRED"}});
    const timed=await fixture({processingMs:20});await new Promise(r=>setTimeout(r,30));await expect(scripted(timed,[complete()]).stage.run(timed.token,new AbortController().signal)).rejects.toMatchObject({detail:{code:"BUDGET_EXHAUSTED"}});
  });
  it("admits explicit deep tool allowances and inherits them instead of the old eight-query/one-follow-up caps",async()=>{
    const f=await fixture();await attempts.consumeResearch(f.token,{researchQueries:20,followUps:5,fetchAttempts:25});
    const s=scripted(f,[question()]),run=await s.stage.run(f.token,new AbortController().signal);
    const child=await s.stage.continue(f.ownerId,decision(f,run.digest));expect(child.attempt.budget.consumed).toMatchObject({researchQueries:20,followUps:5,fetchAttempts:25});
    const token=(await attempts.claim(`tools_${randomUUID()}`))!;
    await expect(attempts.consumeResearch(token,{researchQueries:181})).rejects.toMatchObject({detail:{code:"BUDGET_EXHAUSTED"}});
  });
  it("bounds a noncooperative search by the absolute deadline and accepts only its late financial settlement",async()=>{
    const f=await fixture({processingMs:1400});let deliver:((results:Awaited<ReturnType<SearchProvider["search"]>>)=>void)|undefined;
    const search:SearchProvider={id:"deepseek",search:()=>new Promise(resolve=>{deliver=resolve;})};
    const s=scripted(f,[{action:"SEARCH",query:"physics course",reason:"Resolve scope"}],{search});
    await expect(s.stage.run(f.token,new AbortController().signal)).rejects.toBeDefined();
    await attempts.fail(f.token,new DurablePlannerError("BUDGET_EXHAUSTED","The original processing deadline expired","RESEARCH"));
    const stopped=await attempts.read(f.ownerId,f.token.attemptId);deliver!([{url:"https://example.edu",title:"Late discovery",snippet:null,provider:"deepseek",rank:1}]);
    for(let i=0;i<30;i++){if(!(await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.uncertainDispatch)break;await new Promise(r=>setTimeout(r,10));}
    expect(await attempts.read(f.ownerId,f.token.attemptId)).toEqual(stopped);
    expect((await attempts.resources(f.ownerId,f.token.attemptId)).snapshot.uncertainDispatch).toBe(false);
    expect((await s.stage.read(f.ownerId,f.token.attemptId)).run!.candidates).toEqual([]);
  });
  it("database guards reject changed research input and financial receipt identity",async()=>{
    const f=await fixture(),s=scripted(f,[question()]);await s.stage.run(f.token,new AbortController().signal);
    await expect(db.coordinated(f.ownerId,sql=>sql.query('UPDATE "PlannerAttempt" SET payload=jsonb_set(payload,\'{understanding,inputDigest}\',$2::jsonb) WHERE id=$1',[f.token.attemptId,JSON.stringify(hash("fake",{}))]))).rejects.toThrow();
    const other=await fixture(),search:SearchProvider={id:"deepseek",search:async()=>[{url:"https://example.edu/course",title:"Course",snippet:null,rank:1,provider:"deepseek"}]},o=scripted(other,[{action:"SEARCH",query:"course",reason:"Resolve requirements"},question()],{search});
    await o.stage.run(other.token,new AbortController().signal);
    await expect(db.coordinated(other.ownerId,sql=>sql.query('UPDATE "AiUsageLog" SET provider=\'forged\' WHERE "attemptId"=$1 AND workload=\'planner_v2_tool\'',[other.token.attemptId]))).rejects.toThrow();
    await expect(s.stage.continue(f.ownerId,{...decision(f,(await s.stage.read(f.ownerId,f.token.attemptId)).run!.digest),documentIds:[randomUUID()]})).rejects.toMatchObject({detail:{code:"REFERENCE_NOT_OWNED"}});
  });
  it("fences a Step 2 worker from new research interpretation during mixed deployment",async()=>{
    const f=await fixture();await attempts.release(f.token);const current=await attempts.read(f.ownerId,f.token.attemptId),expires=new Date(Date.now()+45000).toISOString();
    await expect(db.coordinated(f.ownerId,async sql=>{
      await sql.query("SELECT set_config('sylf.planner_compiler_version','2',true)");
      await sql.query('UPDATE "PlannerAttempt" SET state=\'RUNNING\',fence=$2,"leaseOwner"=\'step2_worker\',"leaseExpiresAt"=$3,artifact=$4 WHERE id=$1',[f.token.attemptId,current.fence+1,expires,{...current,state:"RUNNING",fence:current.fence+1,lease:{owner:"step2_worker",fence:current.fence+1,expiresAt:expires}}]);
    })).rejects.toThrow(/PLANNER_RESEARCH_COMPILER_REQUIRED/);
    const token=await attempts.claim(`updated_${randomUUID()}`);expect(token?.attemptId).toBe(f.token.attemptId);
  });
});
