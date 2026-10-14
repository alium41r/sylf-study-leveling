/* eslint-disable @typescript-eslint/no-require-imports -- Qualifies the production CommonJS build in ordinary Node. */
const pg=require('pg');
const {PlannerDatabase}=require('../../../dist/planner-worker/planner/v2/server/database.js');
const {AttemptService}=require('../../../dist/planner-worker/planner/v2/server/attempts.js');
const {createCompilerHandlers}=require('../../../dist/planner-worker/planner/v2/server/compiler.js');
const {PlannerWorker}=require('../../../dist/planner-worker/planner/v2/server/worker.js');
async function main(){
 const url=new URL(process.env.PLANNER_TEST_DATABASE_URL);if(url.hostname!=='127.0.0.1'||!/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(url.pathname)||process.env.PLANNER_PHASE0_REQUIRED!=='true')throw new Error('DISPOSABLE_DATABASE_REQUIRED');
 const pool=new pg.Pool({connectionString:url.toString(),max:4});try{
 const marker=await pool.query('SELECT token FROM __planner_phase0_identity');if(marker.rows[0].token!==process.env.PLANNER_PHASE0_DATABASE_MARKER)throw new Error('IDENTITY_MISMATCH');
 const attempts=new AttemptService(new PlannerDatabase(pool));let calls=0;
 const worker=new PlannerWorker(attempts,createCompilerHandlers(attempts,{provider:{adapter:()=>({generateResponse:async messages=>{calls++;const input=JSON.parse(messages[0].content);if(input.stage==='REVIEW')return {text:JSON.stringify({plans:input.goals.map(g=>({planRef:g.planRef,issues:[]}))}),finishReason:'STOP',usage:{promptTokens:150,completionTokens:100,totalTokens:250}};const p=JSON.parse(messages[0].content).plans[0];return {text:JSON.stringify({detail:{days:14,checkpoint:'Apply the accepted method'},tradeOffExplanation:'A small specific strategy',plans:[{planRef:p.planRef,strategy:{outcome:'Explain circuit laws',explanation:'Use one targeted method check',recommendedEffort:[10,15,20],phases:[]},scope:p.allowlist.scopeRefs.map(ref=>({scopeRef:ref,disposition:'INCLUDED',contribution:'Supports method choice'})),activities:[{localId:'native_method',outcomeRefs:[],scopeRefs:p.allowlist.scopeRefs.slice(0,1),title:'Explain the circuit method',activityType:'DELIBERATE_PRACTICE',purpose:'Check the accepted method',instructions:'Solve a circuit and explain the choice of method.',completionCriterion:'Correct each identified error and explain the chosen law.',effort:[10,15,20],timeboxMinutes:15,commitment:{category:'COMMITTED'},hardDependencies:[]}],decisions:{assumptions:[],tradeOffs:[],unresolvedUncertainty:[],stoppingConditions:[]}}],sharedDependencies:[]}),finishReason:'STOP',usage:{promptTokens:150,completionTokens:100,totalTokens:250}};}})}}),()=>{});
 await worker.tick();let attempt;
 for(let n=0;n<500;n++){attempt=(await pool.query('SELECT artifact FROM "PlannerAttempt" WHERE id=$1 AND "userId"=$2',[process.env.PLANNER_FIXTURE_ATTEMPT,Number(process.env.PLANNER_FIXTURE_OWNER)])).rows[0].artifact;if(!['QUEUED','RUNNING'].includes(attempt.state))break;await new Promise(resolve=>setTimeout(resolve,10));}
 const health=await worker.readiness();await worker.shutdown();
 const candidates=(await pool.query('SELECT count(*) FROM "PlannerRevision" WHERE "planId"=$1',[attempt.targets[0].planId])).rows[0].count,quests=(await pool.query('SELECT count(*) FROM "Quest" WHERE "userId"=$1',[attempt.ownerId])).rows[0].count;
 process.stdout.write(JSON.stringify({compiled:true,state:attempt.state,modelCalls:attempt.budget.consumed.modelCalls,calls,candidates:Number(candidates),quests:Number(quests),compatible:health.compatible,ready:health.ready})+'\n');
 }finally{await pool.end();}
}
main().catch(error=>{process.stderr.write('COMPILED_COMPILER_FIXTURE_FAILED: '+error.message+'\n');process.exitCode=1;});
