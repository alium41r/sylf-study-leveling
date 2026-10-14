// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { validateLearningProposal,generateLearningBlueprint,planningPolicies,expandDeclaredSplits,blueprintResponseContract } from '@/lib/planner/v2/intelligence/blueprint';
import type { ProviderMeter } from '@/lib/planner/v2/intelligence/provider';
import { boundedProviderInput } from '@/lib/planner/v2/intelligence/provider';
import { compactProposal } from './compact-blueprint-fixture';
import { planningFixture } from './planning-fixtures';
import { intentFixture,id } from '../contracts/fixtures';

describe('one policy-aware blueprint generator',()=>{
 it('requires every scope contribution and refuses input receipts or scalar reference arrays in model output',()=>{
  const f=planningFixture();const plan=f.response.plans[0],scope=plan.blueprint.scope[0],activity=plan.blueprint.activities[0];
  expect(()=>validateLearningProposal({...f.response,plans:[{...plan,digest:'a'.repeat(64)}]},f.input)).toThrow();
  expect(()=>validateLearningProposal({...f.response,plans:[{...plan,blueprint:{...plan.blueprint,scope:[{scopeRef:scope.scopeRef,disposition:'DEFERRED',reason:'Postponed with full strategic scope retained'}]}}]},f.input)).toThrow();
  expect(()=>validateLearningProposal({...f.response,plans:[{...plan,blueprint:{...plan.blueprint,activities:[{...activity,advisoryOrderAfter:activity.localId}]}}]},f.input)).toThrow();
 expect(validateLearningProposal(f.response,f.input).decision).toBe('REVISE');
 });
 it('projects exact structural fields without choosing education or accepting fabricated version fields',()=>{
  const f=planningFixture(),contract=blueprintResponseContract(f.input);
  expect(contract.selectedPlans).toEqual(['physics']);
  expect(contract.objects.plan).toEqual({required:['planRef','blueprint'],optional:[]});
  expect(contract.objects.scope.required).toContain('contribution');
  expect(contract.objects.scope.optional).toContain('reason');
  expect(contract.objects.blueprint.required).toEqual(['schemaVersion','strategy','scope','activities','decisions']);
  expect(contract.objects.activity.optional).toContain('advisoryOrderAfter');
  expect(()=>validateLearningProposal({...f.response,plans:[...f.response.plans,...f.response.plans]},f.input)).toThrow();
  const fabricated=structuredClone(f.response) as unknown as {plans:{blueprint:Record<string,unknown>}[]};
  fabricated.plans[0].blueprint.activitiesExtra=null;expect(()=>validateLearningProposal(fabricated,f.input)).toThrow();
  expect(JSON.stringify(contract)).not.toContain('timeboxMinutes":10');
 });
 for(const policy of ['EXAM','ROADMAP','MASTERY','GENERAL'] as const)it(`uses ${policy} educational policy through the shared dispatch`,async()=>{
 const f=planningFixture([5]);f.input.plans[0].intent.policy=policy;f.response.plans[0].blueprint.strategy.policy=policy;const events:string[]=[];
 const meter:ProviderMeter={window:async()=>({now:Date.now(),deadline:Date.now()+10000}),reserve:async(_r,_input,_output,policy)=>{expect(policy).toMatchObject({purpose:'BLUEPRINT',reviewReserve:{inputTokens:8192,outputTokens:4096}});events.push('reserved');return id(5);},settle:async()=>{events.push('settled');},close:async()=>{},lateUsage:async()=>{}};
 const generate=vi.fn(async(messages,system)=>{expect(events).toEqual(['reserved']);expect(system).toContain('More capacity never');expect(messages[0].content).toContain(planningPolicies[policy]);return {text:JSON.stringify(compactProposal(f.response)),finishReason:'STOP' as const,usage:{promptTokens:100,completionTokens:100,totalTokens:200}};});
 const result=await generateLearningBlueprint(meter,f.input,new AbortController().signal,{adapter:()=>({generateResponse:generate})});expect(result.decision).toBe('REVISE');expect(generate).toHaveBeenCalledTimes(1);expect(events).toEqual(['reserved','settled']);
 });
 for(const adaptation of [false,true])it(`losslessly meters distinct calendars and protected provenance during ${adaptation?'adaptation':'generation'}`,async()=>{
  const f=planningFixture([30],Array(28).fill(60));
  f.envelope.days[1]={...f.envelope.days[1],availableMinutes:0,protectedTargetMinutes:20,otherCommittedMinutes:40};
  f.envelope.days[2]={...f.envelope.days[2],excluded:true,availableMinutes:0};
  const full=structuredClone(f.envelope),detail={...full,window:{...full.window,end:full.days[13].date},days:full.days.slice(0,14)};
  f.input.envelope=detail;f.input.context={envelope:full,protectedExecution:[{ref:'running',state:'RUNNING',seconds:1200}],rawEvidence:{source:'owned',quotation:'Keep the original "quotation".',contentHash:'verified-source'}};
  if(adaptation)f.input.previous=f.snapshot;
  const before=structuredClone(f.input);let reserved=0;
  const expand=(envelope:{days:{constantFields:Record<string,unknown>;columns:string[];rows:unknown[][]}})=>({...envelope,days:envelope.days.rows.map(row=>({...envelope.days.constantFields,...Object.fromEntries(envelope.days.columns.map((key,i)=>[key,row[i]]))}))});
  const signal=new AbortController().signal;
  const meter:ProviderMeter={window:async()=>({now:Date.now(),deadline:Date.now()+10000}),reserve:async(_r,units,output,policy)=>{reserved=units;expect(output).toBe(8192);expect(policy).toEqual({purpose:adaptation?'ADAPTATION':'BLUEPRINT',reviewReserve:{inputTokens:8192,outputTokens:4096}});return id(5);},settle:async()=>{},close:async()=>{},lateUsage:async()=>{}};
  await generateLearningBlueprint(meter,f.input,signal,{adapter:()=>({generateResponse:async(messages,system)=>{
   if(typeof messages[0].content!=='string'||typeof system!=='string')throw new Error('Expected exact text request');
   const policy={purpose:adaptation?'ADAPTATION' as const:'BLUEPRINT' as const,reviewReserve:{inputTokens:8192,outputTokens:4096}};
   const wire=JSON.parse(messages[0].content);expect(expand(wire.context.envelope)).toEqual(full);expect(expand(wire.envelope)).toEqual(detail);
   expect({...wire.context,envelope:full}).toEqual(f.input.context);expect(wire.previous).toEqual(f.input.previous);
   expect(wire.context.envelope.days.rows).toHaveLength(28);expect(wire.envelope.days.rows).toHaveLength(14);
   expect(reserved).toBe(boundedProviderInput({policy,systemInstruction:system,messages}));
   const verbose={...wire,context:f.input.context,envelope:detail};
   expect(reserved).toBeLessThan(boundedProviderInput({policy,systemInstruction:system,messages:[{role:'user',content:JSON.stringify(verbose)}]})-4000);
   return {text:JSON.stringify(compactProposal(f.response)),finishReason:'STOP' as const,usage:{promptTokens:100,completionTokens:100,totalTokens:200}};
  }})},adaptation);expect(f.input).toEqual(before);
 });
 it('accepts zero work with verified scope credit and a five minute specific activity without imposed stages',()=>{const f=planningFixture([5]);f.response.plans[0].blueprint.activities[0].completionCriterion='صحیح قانون کی وجہ بیان کرو';expect(validateLearningProposal(f.response,f.input).decision).toBe('REVISE');f.response.plans[0].blueprint.activities=[];f.response.plans[0].blueprint.strategy.phases=[];f.response.plans[0].blueprint.scope=[{scopeRef:'scope_electricity',disposition:'CREDITED',contribution:'Already demonstrated',reason:'Independent assessed result',evidenceRefs:['check_1']}];f.input.plans[0].allowed.evidenceRefs=['check_1'];f.input.plans[0].readiness=new Map([['scope_electricity',['check_1']]]);expect(validateLearningProposal(f.response,f.input).decision).toBe('REVISE');f.input.plans[0].readiness=new Map();expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/demonstrated-readiness/);});
 it('requires every scope disposition and rejects unknown/excluded/provenance references',()=>{const f=planningFixture();f.input.plans[0].allowed.scopeRefs=['scope_electricity','missing'];expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/MISSING_SCOPE/);f.input.plans[0].allowed.scopeRefs=['scope_electricity'];f.input.plans[0].allowed.excludedScopeRefs=['scope_electricity'];expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/EXPLICIT_EXCLUSION/);f.input.plans[0].allowed.excludedScopeRefs=[];f.response.plans[0].blueprint.activities[0].resourceRefs=['invented'];expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/UNKNOWN_RESOURCE/);f.response.plans[0].blueprint.activities[0].resourceRefs=undefined;f.response.plans[0].blueprint.activities[0].localId='abcdef12-1234-4234-8234-123456789012';expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/identities/);f.response.plans[0].blueprint.activities[0].localId='work_0';f.response.plans[0].blueprint.activities[0].hardDependencies=[id(99)];expect(()=>validateLearningProposal(f.response,f.input)).toThrow();});
 it('validates retained phase and committed checkpoint references after owned assembly without changing frozen contracts',()=>{const f=planningFixture([10,15]);const kept=f.response.plans[0].blueprint.activities.shift()!;f.input.plans[0].kept=[kept];f.input.plans[0].keptPhases=f.response.plans[0].blueprint.strategy.phases;f.response.plans[0].blueprint.strategy.phases=[];f.response.plans[0].blueprint.activities[0].commitment={category:'CONTINGENT',trigger:{checkpointActivityId:kept.localId,condition:'An error in the retained checkpoint'}};const result=validateLearningProposal(f.response,f.input);expect(result.decision).toBe('REVISE');if(result.decision==='REVISE'){expect(result.snapshot.plans[0].blueprint.activities[0]).toEqual(kept);expect(result.snapshot.plans[0].blueprint.strategy.phases).toEqual(f.input.plans[0].keptPhases);}});
 it('rejects model overwrite, changed policy, non-concrete contingency and unauthorized recovery reduction',()=>{const f=planningFixture();f.input.plans[0].kept=f.response.plans[0].blueprint.activities;expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/overwrite/);f.input.plans[0].kept=[];f.response.plans[0].blueprint.strategy.policy='GENERAL';expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/policy/);f.response.plans[0].blueprint.strategy.policy='EXAM';f.response.plans[0].blueprint.activities[0].commitment={category:'CONTINGENT',trigger:{checkpointActivityId:'unknown',condition:'If needed'}};expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/committed checkpoint/);const g=planningFixture();expect(()=>validateLearningProposal({...g.response,recoveryAdjustment:{percent:0,reason:'triage'}},g.input)).toThrow(/Only adaptation/);});
 it('allows one KEEP or explicit soft recovery tradeoff at adaptation only',()=>{const f=planningFixture();expect(()=>validateLearningProposal({decision:'KEEP',reason:'Spacing is acceptable'},f.input)).toThrow();expect(validateLearningProposal({decision:'KEEP',reason:'Spacing is acceptable'},f.input,true).decision).toBe('KEEP');f.envelope.recoveryPercent=15;expect(validateLearningProposal({...f.response,recoveryAdjustment:{percent:5,reason:'Triage reduces discretionary slack'}},f.input,true).decision).toBe('REVISE');expect(()=>validateLearningProposal({...f.response,recoveryAdjustment:{percent:20,reason:'Increase margin'}},f.input,true)).toThrow();});
 it('preserves a complete 500-node strategy while detailing only one activity and no invented deadline',()=>{const f=planningFixture([5]);const scopes=Array.from({length:500},(_,i)=>({scopeKey:id(100+i),modelRef:`scope_${i}`,title:`Topic ${i}`,parentKey:null,inclusion:'REQUESTED' as const,sourceClaimIds:[]}));f.input.plans[0].intent.scope=scopes;f.input.plans[0].allowed.scopeRefs=scopes.map(s=>s.modelRef);f.response.plans[0].blueprint.scope=scopes.map(s=>({scopeRef:s.modelRef,disposition:'INCLUDED',contribution:'Supports the requested outcome'}));f.response.plans[0].blueprint.activities[0].scopeRefs=['scope_0'];f.response.plans[0].blueprint.strategy.phases=Array.from({length:100},(_,i)=>({localId:`phase_${i}`,title:`Phase ${i}`,outcome:'Meaningful later outcome'}));f.response.plans[0].blueprint.activities[0].outcomeRefs=['phase_0'];const r=validateLearningProposal(f.response,f.input);if(r.decision==='REVISE'){expect(r.snapshot.plans[0].blueprint.scope.length).toBe(500);expect(r.snapshot.plans[0].blueprint.strategy.phases.length).toBe(100);expect(r.detail.days).toBe(14);}expect(f.input.plans[0].intent.deadline).toEqual({kind:'NONE'});});
 it('does not treat previous proposed work as retained execution during adaptation',()=>{
  const f=planningFixture([30,55,65]);const activities=f.response.plans[0].blueprint.activities;
  activities[1].hardDependencies=['work_0'];activities[2].hardDependencies=['work_1'];
  f.input.previous=structuredClone(f.snapshot);
  const incomplete=structuredClone(f.response);incomplete.plans[0].blueprint.activities=activities.slice(2);
  expect(()=>validateLearningProposal(incomplete,f.input,true)).toThrow('UNKNOWN_ACTIVITY:work_1');
  activities[2].splitPoints=[{afterMinutes:35,completionCriterion:'The report works on the original data; continue with changed-data verification'}];
  const proposal=validateLearningProposal(f.response,f.input,true);expect(proposal.decision).toBe('REVISE');
  if(proposal.decision!=='REVISE')throw new Error('Expected full adaptation');
  const expanded=expandDeclaredSplits(proposal.snapshot,f.envelope,proposal.kept);
  const result=expanded.snapshot.plans[0].blueprint.activities;
  expect(result.map(a=>a.timeboxMinutes)).toEqual([30,55,35,30]);
  expect(result.reduce((n,a)=>n+a.timeboxMinutes,0)).toBe(150);
  expect(result.reduce((n,a)=>n+a.effort.likelyMinutes,0)).toBe(150);
  expect(result.at(-1)?.completionCriterion).toBe(activities[2].completionCriterion);
  expect(result[2].hardDependencies).toEqual(['work_1']);expect(result[3].hardDependencies).toEqual(['work_2_part_1']);
 });
 it('joint targets are exact, root new detail is bounded, and duplicate shared work is rejected',()=>{const f=planningFixture([20]);const second=structuredClone(f.response.plans[0]);second.planRef='maths';second.blueprint.activities[0].localId='dependent';f.response.plans.push(second);f.input.plans=[...f.input.plans,{...f.input.plans[0],planRef:'maths',intent:intentFixture()}];f.response.sharedDependencies=[{prerequisite:{planRef:'physics',activityId:'work_0'},dependent:{planRef:'maths',activityId:'dependent'},strength:'HARD',reason:'Shared prerequisite'}];expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/duplicated/);second.blueprint.activities[0].instructions='Use the prerequisite in a different target task';expect(validateLearningProposal(f.response,f.input).decision).toBe('REVISE');second.blueprint.activities[0].hardDependencies=['work_0'];expect(()=>validateLearningProposal(f.response,f.input)).toThrow('UNKNOWN_ACTIVITY:work_0');second.blueprint.activities[0].hardDependencies=[];f.response.plans.pop();expect(()=>validateLearningProposal(f.response,f.input)).toThrow(/every explicitly/);});
});
