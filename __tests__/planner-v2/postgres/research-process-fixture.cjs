/* eslint-disable @typescript-eslint/no-require-imports -- Tests the production CommonJS build in ordinary Node. */
// Production CommonJS modules, genuine disposable PostgreSQL, deterministic providers.
const pg=require("pg");
const {PlannerDatabase}=require("../../../dist/planner-worker/planner/v2/server/database.js");
const {AttemptService}=require("../../../dist/planner-worker/planner/v2/server/attempts.js");
const {ResearchService}=require("../../../dist/planner-worker/planner/v2/server/research.js");
const {PlannerWorker}=require("../../../dist/planner-worker/planner/v2/server/worker.js");
async function main(){
  const url=new URL(process.env.PLANNER_TEST_DATABASE_URL);
  if(url.hostname!=="127.0.0.1"||!/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(url.pathname)||process.env.PLANNER_PHASE0_REQUIRED!=="true")throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const pool=new pg.Pool({connectionString:url.toString(),max:4});
  try{
    const marker=await pool.query("SELECT token FROM __planner_phase0_identity");if(marker.rows[0].token!==process.env.PLANNER_PHASE0_DATABASE_MARKER)throw new Error("IDENTITY_MISMATCH");
    const attempts=new AttemptService(new PlannerDatabase(pool));const bytes=Buffer.from("CAIE A-Level Physics 9702 Paper 2 examination cycle 2026. Electricity. Explain circuit laws and calculate potential difference.");
    const source="https://cambridgeinternational.org/native-fixture";
    const research=new ResearchService(attempts,{search:{id:"brave",search:async input=>{await input.beforeRequest();return[{url:source,title:"Native source",provider:"brave",rank:1,snippet:null}];}},fetch:async(url,options)=>{await options.beforeRequest();return {finalUrl:url,contentType:"text/plain",text:"",partial:false,partialReason:null,bytes:bytes.length,requests:1,rawBytes:bytes};},provider:{adapter:()=>({generateResponse:async(messages,system)=>{
      const input=JSON.parse(messages[0].content);const p=input.plans[0];let value;
      if(system.startsWith("You are an assessment-aware"))value={plans:[{planRef:p.planRef,extraction:{identities:[{sourceId:"source_1",fields:Object.entries(p.assessment).map(([field,value])=>({field,value,excerpt:bytes.toString(),anchor:{section:"Document"}}))}],claims:[{sourceId:"source_1",statement:"Explain circuit laws",excerpt:"Explain circuit laws and calculate potential difference.",anchor:{section:"Document"},kind:"ASSESSED_SCOPE"}],completeSourceIds:["source_1"],gaps:[],answer:"Check circuit laws"}}]};
      else value={plans:[{planRef:p.planRef,review:{claims:p.candidates.map(c=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"This actual source supports the accepted scope"})),scopeBindings:p.candidates.map(c=>({claimId:c.claimId,scopeRefs:["scope_electricity"],disposition:"ANNOTATE_SCOPE"})),identities:p.extraction.identities.map(i=>({sourceId:i.sourceId,fields:i.fields.map(f=>({field:f.field,supported:true}))})),completeSourceIds:["source_1"],conflicts:[],answer:"Verified circuit laws; cite the issuer"}}]};
      return {text:JSON.stringify(value),finishReason:"STOP",usage:{promptTokens:120,completionTokens:60,totalTokens:180}};
    }})}});
    const worker=new PlannerWorker(attempts,{RESEARCH_ADVICE:research.adviceHandler()},()=>{});await worker.tick();
    const id=process.env.PLANNER_FIXTURE_ATTEMPT;let artifact;
    for(let i=0;i<150;i++){artifact=(await pool.query('SELECT artifact FROM "PlannerAttempt" WHERE id=$1',[id])).rows[0].artifact;if(artifact.state!=="RUNNING"&&artifact.state!=="QUEUED")break;await new Promise(r=>setTimeout(r,20));}
    await worker.shutdown();if(artifact.state!=="SUCCEEDED")throw new Error("NATIVE_RESEARCH_FAILED");
    process.stdout.write(JSON.stringify({compiled:true,succeeded:true,modelCalls:artifact.budget.consumed.modelCalls,queries:artifact.budget.consumed.researchQueries,fetches:artifact.budget.consumed.fetchAttempts})+"\n");
  }finally{await pool.end();}
}
main().catch(()=>{process.stderr.write("COMPILED_RESEARCH_FIXTURE_FAILED\n");process.exitCode=1;});
