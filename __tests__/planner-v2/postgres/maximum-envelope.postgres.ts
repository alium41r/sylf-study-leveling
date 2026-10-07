import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { connect,user } from './database';
import { intentFixture } from '../contracts/fixtures';
import { prepareProposal } from './proposal-fixture';
import { PlannerDatabase,DurablePlannerError } from '@/lib/planner/v2/server/database';
import { IntentService,ownedPlan } from '@/lib/planner/v2/server/intents';
import { GenerationService } from '@/lib/planner/v2/server/generation';
import { AttemptService } from '@/lib/planner/v2/server/attempts';
import { ApplyService } from '@/lib/planner/v2/server/apply';
import { RevisionService,loadRevision } from '@/lib/planner/v2/server/revisions';
import { PlannerCompilerService } from '@/lib/planner/v2/server/compiler';
import { PLANNER_V2_ENVELOPE as E,plannerSerializedBytes } from '@/lib/planner/v2/contracts/envelope';
let connection:pg.Client,pool:pg.Pool,db:PlannerDatabase;
beforeAll(async()=>{connection=await connect();pool=new pg.Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL,max:6});db=new PlannerDatabase(pool);});
afterAll(async()=>{await pool.end();await connection.end();});
it('real maximum stored-count publication, owned read and atomic apply preserve every retained and new activity',async()=>{
 const n=await user(connection);await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1',[n]);const intents=new IntentService(db),plans=[];
 for(let i=0;i<2;i++){const base=intentFixture();plans.push(await intents.create(n,randomUUID(),{...base,deadline:{kind:'NONE'},scope:Array.from({length:E.scopeNodes},(_,j)=>({...base.scope[0],scopeKey:randomUUID(),modelRef:j===0?'scope_electricity':`scope_${j}`,title:`Owned strategic circuit scope ${j}`})),availability:{timezone:'Asia/Karachi',dailyCeilingMinutes:Array(7).fill(1440),weeklyCeilingMinutes:10080,restWeekdays:[],blockedDates:[],recoveryPercent:0,basis:'CONFIRMED_AVAILABILITY'}}));}
 let final:Awaited<ReturnType<typeof prepareProposal>>|undefined;
 // Seed historical committed work exclusively through existing publication and
 // ApplyService in valid <=60-new-activity batches. This is a transport/SQL
 // witness, explicitly NOT live educational-quality evidence.
 for(const total of [30,60,90,120,150,170,200]){
  final=await prepareProposal(db,n,plans.map(p=>p.plan.id),(specs,planIndex)=>{const template=structuredClone(specs[0]);if(total===30)specs.splice(0);
   for(let j=specs.length;j<total;j++)specs.push({...structuredClone(template),activityKey:randomUUID(),blueprintActivityId:`activity_${j}`,content:{...template.content,title:`Circuit task ${planIndex}_${j}`,instructions:`Solve and explain the circuit ${j}. ${'x'.repeat(2800)}`,completionCriterion:`Independently solve and explain the changed circuit ${j}. ${'c'.repeat(600)}`,outcomeRefs:[`phase_${j%100}`],hardDependencies:[]},effort:{plannedMinutes:5,remainingMinutesEstimate:5,remainingEstimateBasisActualSeconds:0},placement:{...template.placement,date:new Date(Date.now()+(1+Math.floor(j/120))*86400000).toISOString().slice(0,10)}});
  },revision=>{revision.blueprint.scope=Array.from({length:500},(_,j)=>({scopeRef:j===0?'scope_electricity':`scope_${j}`,disposition:'INCLUDED',contribution:`Supports circuit outcome ${j}`}));revision.blueprint.strategy.phases=Array.from({length:100},(_,j)=>({localId:`phase_${j}`,title:`Phase ${j}`,outcome:`Circuit outcome ${j}`}));},changeSet=>{changeSet.aggregate.maximumCapacityMinutes=20160;changeSet.aggregate.availableForTargetsMinutes=20160;});
  if(total===200){expect(final.changeSet.entries).toHaveLength(400);expect(final.changeSet.entries.filter(e=>e.changes.includes('ADDED'))).toHaveLength(60);expect(final.changeSet.entries.filter(e=>e.changes.includes('KEPT'))).toHaveLength(340);}
  await new ApplyService(db).apply(n,final.request);
 }
 if(!final)throw new Error();const sizes=[];
 for(const revision of final.revisions){const actual=await db.coordinated(n,sql=>loadRevision(sql,n,revision.revisionId));expect(actual).toEqual(revision);expect(actual.executable).toHaveLength(200);expect(actual.blueprint.scope).toHaveLength(500);expect(actual.blueprint.strategy.phases).toHaveLength(100);expect(plannerSerializedBytes(actual)).toBeLessThan(E.serializedBytes);sizes.push(plannerSerializedBytes(actual));}
 expect((await connection.query('SELECT count(*) FROM "Quest" WHERE "userId"=$1',[n])).rows[0].count).toBe('400');expect((await connection.query('SELECT count(*) FROM "PlannerQuestLink" WHERE "planId"=ANY($1::uuid[])',[plans.map(p=>p.plan.id)])).rows[0].count).toBe('400');
 expect(await new ApplyService(db).apply(n,final.request)).toEqual((await new AttemptService(db).read(n,final.attempt.attemptId)).applyReceipt);
 const targets=[];for(const p of plans){const plan=await db.coordinated(n,sql=>ownedPlan(sql,n,p.plan.id));targets.push({kind:'EXISTING',planId:plan.id,expectedIntentVersionId:plan.workingIntentVersionId,expectedPlanningVersion:plan.version,baseActiveRevisionId:plan.activeRevisionId});}
 const admitted=await new GenerationService(db).accept(n,{schemaVersion:2,requestKey:randomUUID(),text:'Reassess the full maximum retained context without trimming.',targets}),attempts=new AttemptService(db),token=await attempts.claim(`max_${randomUUID()}`,['JOINT']);if(!token||token.attemptId!==admitted.attempt.attemptId)throw new Error();let upstream=0;const compiler=new PlannerCompilerService(attempts,{provider:{adapter:()=>{upstream++;throw new Error('No provider dispatch is permitted before complete bounded context');}}});
 let code:string|undefined;try{await compiler.run(token,new AbortController().signal);}catch(error){if(error instanceof DurablePlannerError)code=error.detail.code;else throw error;}expect(['PAYLOAD_TOO_LARGE','BUDGET_EXHAUSTED']).toContain(code);expect(upstream).toBe(0);await attempts.fail(token,new DurablePlannerError(code as 'PAYLOAD_TOO_LARGE','Complete maximum retained context exceeds the model boundary','PREFLIGHT'));
 expect((await connection.query('SELECT count(*) FROM "Quest" WHERE "userId"=$1',[n])).rows[0].count).toBe('400');
 writeFileSync('documentation/planner/reports/2026-10-03-phase-2/evidence/step6-maximum-postgres.json',JSON.stringify({status:'PASSED',boundary:'Actual RevisionService publication, owned loadRevision and canonical ApplyService. Trusted fixtures; no educational-quality claim.',targets:2,activitiesPerTarget:200,scopeNodesPerTarget:500,phasesPerTarget:100,newActivitiesAtFinalPublish:60,retainedActivitiesAtFinalPublish:340,quests:400,links:400,revisionBytes:sizes,changeSetBytes:plannerSerializedBytes(final.changeSet),maximumCompilerContext:{outcome:code,upstreamAttempts:upstream,consequentialFactsTrimmed:false},envelopeBytes:E.serializedBytes},null,2)+'\n');
},120000);
it('over-count generation and over-byte publication fail explicitly without dropping requested work',async()=>{
 const n=await user(connection),base=intentFixture();await expect(new GenerationService(db).accept(n,{schemaVersion:2,requestKey:randomUUID(),text:'Do not trim extra scope',targets:[{kind:'NEW',intent:{...base,scope:Array.from({length:501},(_,i)=>({...base.scope[0],scopeKey:randomUUID(),modelRef:`scope_${i}`}))}}]})).rejects.toThrow();expect((await connection.query('SELECT count(*) FROM "PlannerPlan" WHERE "userId"=$1',[n])).rows[0].count).toBe('0');
 await connection.query('UPDATE "User" SET timezone=\'Asia/Karachi\',"restDays"=\'{}\' WHERE id=$1',[n]);const created=await new IntentService(db).create(n,randomUUID(),{...base,availability:{timezone:"Asia/Karachi",dailyCeilingMinutes:Array(7).fill(120),restWeekdays:[],blockedDates:[],recoveryPercent:0,basis:"CONFIRMED_AVAILABILITY"}});const p=await prepareProposal(db,n,[created.plan.id]);const large={...p.revisions[0],blueprint:{...p.revisions[0].blueprint,activities:Array.from({length:201},()=>p.revisions[0].blueprint.activities[0])}};
 await expect(new RevisionService(new AttemptService(db)).publish(p.token,[large],p.changeSet)).rejects.toThrow();expect((await connection.query('SELECT count(*) FROM "PlannerRevision" WHERE "planId"=$1',[created.plan.id])).rows[0].count).toBe('1');
 // HTTP response caps are tested by actual generation/read integration; schema
 // caps reject before durable publication, leaving the sealed candidate intact.
});
