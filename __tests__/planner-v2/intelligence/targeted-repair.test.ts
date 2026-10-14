// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { planningFixture } from './planning-fixtures';
import { validateLearningProposal, validateTargetedRepair, repairAuthority, expandDeclaredSplits, type RepairInput } from '@/lib/planner/v2/intelligence/blueprint';
import { TargetedRepairSchema, type TargetedRepair } from '@/lib/planner/v2/intelligence/schemas/repair-response';
import { allocateLearning } from '@/lib/planner/v2/intelligence/allocator';
import { hash } from '@/lib/planner/v2/server/database';
import { buildReviewInput, validateQualityReview, validateQualityVerification, verificationHoldback, qualityRequest } from '@/lib/planner/v2/intelligence/quality';
import { incompleteQuality } from '@/lib/planner/v2/intelligence/quality';
import { checkpointFixture } from './fixtures';
import { boundedProviderInput } from '@/lib/planner/v2/intelligence/provider';
import type { GroundedFinding } from '@/lib/planner/v2/intelligence/schemas/quality';

function fixture(minutes=[10,10,10]) {
 const f=planningFixture(minutes), proposal=validateLearningProposal(f.response,f.input);
 if(proposal.decision!=='REVISE')throw new Error();
 const finding:GroundedFinding={issueId:'criterion_gap',category:'WEAK_CRITERION',severity:'BLOCKING',affectedRefs:['work_0'],basis:'CONCRETE_VIOLATION',grounds:[],evidence:'Recall cannot demonstrate application',consequence:'The requested capability is not checked',requestedResolution:'Check actual independent application',requiresAcknowledgement:false};
 const repair:RepairInput={input:{...f.input,previous:proposal.snapshot},planning:{detail:proposal.detail,tradeOffExplanation:proposal.tradeOffExplanation,splits:[],forecasts:[],adaptation:'NOT_REQUESTED',unreviewedPhaseRefs:proposal.unreviewedPhaseRefs},findings:[{planRef:'physics',finding}]};
 const activity=proposal.snapshot.plans[0].blueprint.activities[0];
 const correction={kind:'ACTIVITY_REPLACE' as const,planRef:'physics',issueIds:['criterion_gap'],reason:'Require unaided method choice and a correctness check',activity:{...activity,effort:[10,10,10] as [number,number,number],completionCriterion:'Choose and apply the correct law unaided; check the solution against the supplied givens.'}};
 return {...f,repair,correction};
}
const apply=(f:ReturnType<typeof fixture>,corrections:TargetedRepair['corrections']=[f.correction])=>validateTargetedRepair({corrections},f.repair);

describe('targeted educational corrections and complete deterministic assembly',()=>{
 it('changes one actual criterion, preserves all other content/ordering and does not mutate the source',()=>{
  const f=fixture(),before=structuredClone(f.repair),r=apply(f),old=f.repair.input.previous!;
  expect(f.repair).toEqual(before);expect(r.snapshot.plans[0].blueprint.activities.slice(1)).toEqual(old.plans[0].blueprint.activities.slice(1));
  expect(r.snapshot.plans[0].blueprint).toEqual({...old.plans[0].blueprint,activities:[{...old.plans[0].blueprint.activities[0],completionCriterion:f.correction.activity.completionCriterion},...old.plans[0].blueprint.activities.slice(1)]});
  expect(r.detail).toEqual(f.repair.planning.detail);expect(r.tradeOffExplanation).toBe(f.repair.planning.tradeOffExplanation);
  expect(r.snapshot.plans[0].digest).toBe(hash('blueprint',r.snapshot.plans[0].blueprint));
 });
 it('permits sufficient related dependency/criterion correction, not all same-scope siblings',()=>{
  const f=fixture();f.repair.input.previous!.plans[0].blueprint.activities[1].hardDependencies=['work_0'];
  const next={...f.correction,activity:{...f.correction.activity,localId:'work_1'}};
  expect(apply(f,[f.correction,next]).snapshot.plans[0].blueprint.activities[2]).toEqual(f.repair.input.previous!.plans[0].blueprint.activities[2]);
  expect(()=>apply(f,[{...next,activity:{...next.activity,localId:'work_2'}}])).toThrow(/unrelated/);
 });
 it('allows a necessary dependency correction chain only through explicitly corrected activities',()=>{
  const f=fixture([10,10,10,10]),b=f.repair.input.previous!.plans[0].blueprint;
  b.activities[1].hardDependencies=['work_0'];b.activities[2].hardDependencies=['work_1'];
  const make=(index:number)=>({...f.correction,activity:{...b.activities[index],effort:[10,10,10] as [number,number,number],commitment:{category:'OPTIONAL' as const,reason:'No compulsory repetition is justified'}}});
  expect(()=>apply(f,[make(0),make(2)])).toThrow(/unrelated/);
  const result=apply(f,[make(0),make(1),make(2)]);
  expect(result.snapshot.plans[0].blueprint.activities[3]).toEqual(b.activities[3]);
  expect(result.snapshot.plans[0].blueprint.activities.slice(0,3).every(a=>a.commitment.category==='OPTIONAL')).toBe(true);
 });
 it('adds necessary education only through supplied aliases and explicit related criteria',()=>{
  const f=fixture();const ref=repairAuthority(f.repair).plans[0].additionActivityRefs[0];
  const added={...f.correction,kind:'ACTIVITY_ADD' as const,activity:{...f.correction.activity,localId:ref,instructions:'Learn the applicable law with its supplied example, then explain its use.'}};
  const result=apply(f,[added,{...f.correction,activity:{...f.correction.activity,hardDependencies:[ref]}}]);
  expect(result.snapshot.plans[0].blueprint.activities[0].hardDependencies).toEqual([ref]);expect(result.snapshot.plans[0].blueprint.activities[3].localId).toBe(ref);
  expect(()=>apply(f,[{...added,activity:{...added.activity,localId:'invented'}}])).toThrow(/supplied aliases/);
 });
 it('can remove unnecessary work, but dangling references require explicit corrections',()=>{
  const f=fixture();f.repair.input.previous!.plans[0].blueprint.activities[1].hardDependencies=['work_0'];
  const removal={kind:'ACTIVITY_REMOVE' as const,planRef:'physics',activityRef:'work_0',issueIds:['criterion_gap'],reason:'Remove a redundant preliminary task'};
  expect(()=>apply(f,[removal])).toThrow(/UNKNOWN_ACTIVITY/);
  const other={...f.correction,activity:{...f.correction.activity,localId:'work_1',hardDependencies:[]}};
  expect(apply(f,[removal,other]).snapshot.plans[0].blueprint.activities.map(a=>a.localId)).toEqual(['work_1','work_2']);
 });
 it('supports phase/readiness, scope, strategy and uncertainty corrections without structural constants',()=>{
  const f=fixture();const b=f.repair.input.previous!.plans[0].blueprint;
  const {policy:_policy,phases:_phases,...core}=b.strategy;void _policy;void _phases;
  const corrections:TargetedRepair['corrections']=[f.correction,
   {kind:'PHASE_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Align the milestone with independent performance',phase:{...b.strategy.phases[0],effort:b.strategy.phases[0].effort?[b.strategy.phases[0].effort.lowMinutes,b.strategy.phases[0].effort.likelyMinutes,b.strategy.phases[0].effort.highMinutes]:undefined,readinessCriterion:'Independently solve and check a changed circuit.'}},
   {kind:'SCOPE_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Clarify the accepted contribution',scope:{...b.scope[0],contribution:'Demonstrated independent application'}},
   {kind:'STRATEGY_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Explain the sufficient correction',strategy:{...core,explanation:'A corrected independent application gate suffices.',recommendedEffort:[20,30,40]}},
   {kind:'DECISIONS_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Keep uncertainty honest',decisions:{...b.decisions,unresolvedUncertainty:['Prior method-selection readiness remains uncertain']}},
   {kind:'CHECKPOINT_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Use the observable gate',checkpoint:'Independent checked application'}];
  const result=apply(f,corrections);expect(result.snapshot.plans[0].blueprint.strategy.policy).toBe(b.strategy.policy);expect(result.detail.days).toBe(14);
 });
 it.each([
  ['arbitrary paths',{corrections:[{kind:'PATCH',path:'/activities/0/criterion',value:'Pass'}]}],
  ['full proposal',{decision:'REVISE',plans:[]}],
  ['empty correction',{corrections:[]}],
  ['null',{corrections:[null]}],
 ])('rejects %s',(_,raw)=>{expect(()=>validateTargetedRepair(raw,fixture().repair)).toThrow();});
 it.each([
  ['unselected owner',(f:ReturnType<typeof fixture>)=>({...f.correction,planRef:'foreign'})],
  ['renamed identity',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,localId:'invented'}})],
  ['unrequested issue',(f:ReturnType<typeof fixture>)=>({...f.correction,issueIds:['unknown']})],
  ['duplicate issue',(f:ReturnType<typeof fixture>)=>({...f.correction,issueIds:['criterion_gap','criterion_gap']})],
  ['unrelated work',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,localId:'work_2'}})],
  ['unknown resource',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,resourceRefs:['invented']}})],
  ['cycle',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,hardDependencies:['work_0']}})],
  ['unordered estimate',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,effort:[20,10,5]}})],
  ['echoed identity',(f:ReturnType<typeof fixture>)=>({...f.correction,activity:{...f.correction.activity,activityKey:'server-id'}})],
 ])('rejects %s through owned transport or complete canonical validation',(_,make)=>{const f=fixture();expect(()=>validateTargetedRepair({corrections:[make(f)]},f.repair)).toThrow();});
 it('rejects echoing, duplicate object changes, missing named issues and overflow',()=>{
  const f=fixture();const activity=f.repair.input.previous!.plans[0].blueprint.activities[0];
  expect(()=>apply(f,[{...f.correction,activity:{...activity,effort:[10,10,10]}}])).toThrow(/actual educational correction/);
  expect(()=>apply(f,[f.correction,f.correction])).toThrow(/each object once/);
  f.repair.findings.push({...f.repair.findings[0],finding:{...f.repair.findings[0].finding,issueId:'second_gap'}});expect(()=>apply(f)).toThrow(/every named issue/);
  expect(()=>TargetedRepairSchema.parse({corrections:Array(61).fill(f.correction)})).toThrow();
 });
 it('retains exclusions and does not falsely credit invented readiness',()=>{
  const f=fixture();f.repair.input.plans[0].allowed.excludedScopeRefs=['scope_electricity'];
  expect(()=>apply(f)).toThrow(/EXPLICIT_EXCLUSION_CHANGED|EXCLUDED_SCOPE_ACTIVITY/);
  f.repair.input.plans[0].allowed.excludedScopeRefs=[];const scope=f.repair.input.previous!.plans[0].blueprint.scope[0];
  expect(()=>apply(f,[{kind:'SCOPE_REPLACE',planRef:'physics',issueIds:['criterion_gap'],reason:'Credit readiness',scope:{...scope,disposition:'CREDITED',reason:'Planned teaching',evidenceRefs:['invented']}}])).toThrow();
 });
 it('rejects direct protected activities/phases and protects the complete split family',()=>{
  const f=fixture();f.repair.input.plans[0].kept=[f.repair.input.previous!.plans[0].blueprint.activities[0]];expect(()=>apply(f)).toThrow(/protected education/);
  f.repair.input.plans[0].kept=[];f.repair.input.plans[0].keptPhases=f.repair.input.previous!.plans[0].blueprint.strategy.phases;
  expect(()=>apply(f,[{kind:'PHASE_REMOVE',planRef:'physics',phaseRef:'phase_practice',issueIds:['criterion_gap'],reason:'Remove phase'}])).toThrow(/protected education/);
 });
 it('preserves unaffected split receipts and re-expands a changed parent with its original aliases and minutes',()=>{
  const f=fixture([30,30]);const before=f.repair.input.previous!;
  for(const a of before.plans[0].blueprint.activities)a.splitPoints=[{afterMinutes:15,completionCriterion:'Choose the law correctly'}];
  const expanded=expandDeclaredSplits(before,f.envelope,new Set(),new Map([['physics',15]]));
  f.repair.input.previous=expanded.snapshot;f.repair.planning.splits=expanded.splits;f.repair.findings[0].finding.affectedRefs=['work_0_part_2'];
  const original=expanded.splits[0].originalActivity;const correction={...f.correction,activity:{...original,effort:[30,30,30] as [number,number,number],completionCriterion:'Independently apply and check the law.'}};
  const repaired=apply(f,[correction]),final=expandDeclaredSplits(repaired.snapshot,f.envelope,repaired.kept,new Map([['physics',15]]));
  expect(final.snapshot.plans[0].blueprint.activities.slice(2)).toEqual(expanded.snapshot.plans[0].blueprint.activities.slice(2));expect(repaired.retainedSplits).toEqual([expanded.splits[1]]);
  expect(final.splits[0].pieceRefs).toEqual(['work_0_part_1','work_0_part_2']);expect(final.snapshot.plans[0].blueprint.activities.slice(0,2).reduce((n,a)=>n+a.timeboxMinutes,0)).toBe(30);
  f.repair.input.plans[0].kept=[expanded.snapshot.plans[0].blueprint.activities[0]];expect(()=>apply(f,[correction])).toThrow(/protected education/);
 });
 it('jointly corrects a shared dependency while preserving the other owner and edge',()=>{
  const f=fixture([10]),second=structuredClone(f.repair.input.previous!.plans[0]);second.planRef='maths';second.blueprint.activities[0].localId='transfer';second.blueprint.activities[0].instructions='Apply the shared method in a second course example.';second.digest=hash('blueprint',second.blueprint);
  f.repair.input.previous!.plans.push(second);f.repair.input.plans=[...f.repair.input.plans,{...f.repair.input.plans[0],planRef:'maths'}];
  const edge={prerequisite:{planRef:'physics',activityId:'work_0'},dependent:{planRef:'maths',activityId:'transfer'},strength:'HARD' as const,reason:'Use one shared method'};f.repair.input.previous!.sharedDependencies=[edge];
  const r=apply(f);expect(r.snapshot.plans[1]).toEqual(second);expect(r.snapshot.sharedDependencies).toEqual([edge]);
  const sibling={...f.correction,planRef:'maths',activity:{...f.correction.activity,localId:'transfer',instructions:second.blueprint.activities[0].instructions}};
  expect(apply(f,[f.correction,sibling]).snapshot.plans[1].blueprint.activities[0].completionCriterion).toBe(sibling.activity.completionCriterion);
  f.repair.input.sharedDependencies=[edge];expect(()=>apply(f,[{kind:'SHARED_DEPENDENCY_REMOVE',planRef:'maths',issueIds:['criterion_gap'],reason:'Remove dependency',edge}])).toThrow(/retained shared/);
 });
 it('removes an affected optional phase only when its activity references are explicitly corrected',()=>{
  const f=fixture([10]),phase=f.repair.input.previous!.plans[0].blueprint.strategy.phases[0];
  const removal={kind:'PHASE_REMOVE' as const,planRef:'physics',phaseRef:phase.localId,issueIds:['criterion_gap'],reason:'An integrated task is sufficient'};
  expect(()=>apply(f,[removal])).toThrow(/UNKNOWN_OUTCOME/);expect(apply(f,[removal,{...f.correction,activity:{...f.correction.activity,outcomeRefs:[]}}]).snapshot.plans[0].blueprint.strategy.phases).toEqual([]);
 });
});

const diagnosticCases=[
 {id:'fraction_application',goal:'Independently add 1/2 and 1/3 and check the result.',bad:'Repeat the fraction addition rule.',good:'Add 1/2 + 1/3 unaided to obtain 5/6. Verify 6 times the answer equals 3 + 2.',defect:'Recall does not test fraction addition'},
 {id:'missing_unit_data',goal:'Convert 3 km to metres using 1 km = 1000 m, then check.',bad:'Use the nonexistent course table to convert the distance.',good:'Given 1 km = 1000 m, calculate 3 km = 3000 m independently. Divide by 1000 to recover 3 km.',defect:'Requires an unavailable input'},
 {id:'unsupported_weight',goal:'Review a percentage increase. Assessment weights are unknown.',bad:'Explain why this method is worth 40% of the exam.',good:'Increase 50 by 10% to 55 independently. Check (55 - 50)/50 = 0.1. Keep assessment weighting unknown.',defect:'Invents assessment weighting'},
 {id:'stop_after_success',goal:'Demonstrate 20% of 50 correctly once and stop.',bad:'After success solve forty identical compulsory examples.',good:'Compute 20% of 50 = 10 unaided. Check 10/50 = 0.2. Stop after correct checked success.',defect:'Adds unnecessary work after the stopping gate'},
];
describe('separately labelled offline repair and full-result verification controls',()=>{
 const observations:unknown[]=[];
 it.each(diagnosticCases)('$id corrects an actual defect and verifies the complete assembled candidate',c=>{
  const f=fixture([10,10]);const b=f.repair.input.previous!.plans[0].blueprint;b.activities[0].instructions=c.bad;b.activities[0].completionCriterion=c.bad;
  const finding=f.repair.findings[0].finding;finding.grounds=[{ref:'physics/goal',excerpt:c.goal},{ref:'physics/activity/work_0',excerpt:c.bad}];finding.evidence=c.defect;
  const checkpoint=checkpointFixture();if(!('allocation' in checkpoint.payload))throw new Error();
  const proposal={...checkpoint.payload,stage:'ALLOCATION' as const,blueprints:f.repair.input.previous!,envelope:f.envelope,allocation:{report:allocateLearning(f.repair.input.previous!,f.envelope,f.facts),digest:'a'.repeat(64)}};
  const goals=[{planRef:'physics',requested:{outcome:c.goal},resolved:{outcome:c.goal}}];
  const input=buildReviewInput(goals,{plans:[]},proposal),blank=incompleteQuality(checkpoint);
  const review=validateQualityReview({plans:[{planRef:'physics',issues:[finding]}]},input,blank);
  const corrected=apply(f,[{...f.correction,activity:{...f.correction.activity,instructions:c.good,completionCriterion:c.good}}]);
  expect(corrected.snapshot.plans[0].blueprint.activities[1]).toEqual(b.activities[1]);expect(corrected.snapshot.plans[0].blueprint.activities[0].instructions).toBe(c.good);
  const allocation=allocateLearning(corrected.snapshot,f.envelope,f.facts);expect(allocation.status).toBe('FEASIBLE');
  const verification=buildReviewInput(goals,{plans:[]},{...proposal,blueprints:corrected.snapshot,allocation:{report:allocation,digest:hash('allocation',allocation)}},review.findings,['criterion_gap']);
  const result=validateQualityVerification({plans:[{planRef:'physics',resolutions:[{issueId:'criterion_gap',result:'RESOLVED',explanation:c.defect+' is corrected by the concrete supplied action and check.',grounds:[{ref:'physics/activity/work_0',excerpt:c.good}]}],newIssues:[]}]},verification,review.reports,blank,'2026-10-09T00:00:00.000Z');
  expect(result.reports[0].report.status).toBe('PASSED');const reserve=verificationHoldback({...input,originalFindings:review.findings,repairIssueIds:['criterion_gap']},new AbortController().signal);
  expect(boundedProviderInput(qualityRequest(verification,new AbortController().signal,()=>null))).toBeLessThanOrEqual(reserve.inputTokens);
  observations.push({id:c.id,namedDefectResolved:true,untouchedActivityIdentical:true,allocation:allocation.status,verification:result.reports[0].report.status});
  if(observations.length===diagnosticCases.length&&process.env.PLANNER_REPAIR_DIAGNOSTIC_EVIDENCE){const path=process.env.PLANNER_REPAIR_DIAGNOSTIC_EVIDENCE;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({method:'Four separately labelled deterministic repair controls with concrete corrected givens, actions and checks. Scripted verification exercises the boundary; no live model judgment or human adjudication claimed.',observations},null,2)+'\n');}
 });
});

it('measures actual compiler repair requests and output size without omitting consequential input',async()=>{
 const {PlannerCompilerService}=await import('@/lib/planner/v2/server/compiler');
 const {blueprintInstruction,blueprintResponseContract}=await import('@/lib/planner/v2/intelligence/blueprint');
 const {modelReviewInput,goalForReview,MAX_REPAIR_BYTES}=await import('@/lib/planner/v2/intelligence/quality');
 const observations=[];
 for(const count of [1,12,60]){
  const f=fixture(Array(count).fill(10)),signal=new AbortController().signal,checkpoint=checkpointFixture();
  if(!('allocation' in checkpoint.payload))throw new Error();
  f.repair.findings[0].finding.grounds=[{ref:'physics/goal',excerpt:f.input.plans[0].intent.outcome},{ref:'physics/activity/work_0',excerpt:f.repair.input.previous!.plans[0].blueprint.activities[0].instructions}];
  const proposal={...checkpoint.payload,stage:'ALLOCATION' as const,blueprints:f.repair.input.previous!,envelope:f.envelope,planning:f.repair.planning,allocation:{report:allocateLearning(f.repair.input.previous!,f.envelope,f.facts),digest:'a'.repeat(64)}};
  Reflect.deleteProperty(proposal,'quality');Reflect.deleteProperty(proposal,'reviewedAllocationDigest');
  const goals=f.input.plans.map(p=>({planRef:p.planRef,requested:goalForReview(p.intent),resolved:goalForReview(p.intent)}));
  const review=buildReviewInput(goals,{plans:[]},proposal,undefined,undefined,{text:'Correct the named educational defect',authorization:'PLAN_ACTION'});
  const evaluated=validateQualityReview({plans:[{planRef:'physics',issues:[f.repair.findings[0].finding]}]},review,incompleteQuality(checkpoint));
  checkpoint.payload={...proposal,stage:'REVIEW',reviewedAllocationDigest:proposal.allocation.digest,quality:evaluated.reports,reviewSupport:{phase:'REVIEWED',identityDigest:'a'.repeat(64),reviewInputDigest:'a'.repeat(64),findings:evaluated.findings}};
  const owned={targets:f.input.plans,view:{plans:[]},requestedIntents:f.input.plans.map(p=>p.intent),intents:f.input.plans.map(p=>p.intent),attempt:{acceptedRequest:{text:'Correct the named educational defect'}}};
  // Exercise the existing owner's pure request builder without a database or dispatch.
  const service=new PlannerCompilerService({} as import('@/lib/planner/v2/server/attempts').AttemptService);
  const reserve=verificationHoldback({...review,originalFindings:evaluated.findings,repairIssueIds:['criterion_gap']},signal);
  const request=Reflect.get(service,'repairRequest').call(service,owned,checkpoint,signal,reserve) as {policy:{purpose:'REPAIR';verificationReserve:{inputTokens:number;outputTokens:number}};messages:{role:'user';content:string}[];systemInstruction:string;outputTokens:number};
  const model=JSON.parse(request.messages[0].content),sameContext=JSON.parse(JSON.stringify(modelReviewInput(review)));
  expect(model.context).toEqual(sameContext);expect(model.groundedFindings).toEqual(evaluated.findings);expect(request.outputTokens).toBe(8192);
  const legacy={policy:{purpose:'REPAIR' as const,verificationReserve:reserve},outputTokens:8192,systemInstruction:blueprintInstruction+`\nThis is the only named quality REPAIR. Resolve the supplied concrete blocking issues, preserve owned kept education/exclusions/hard facts and useful specificity; do not add workload for advisory preference. Return REVISE with the complete new-work proposal. Recovery margin is already accepted and cannot change here. Return at most ${MAX_REPAIR_BYTES} UTF-8 bytes; overflow fails explicitly.`,messages:[{role:'user' as const,content:JSON.stringify({stage:'REPAIR',plans:f.input.plans.map(t=>({planRef:t.planRef,policy:t.intent.policy,allowlist:t.allowed,kept:t.kept,keptPhases:t.keptPhases})),context:sameContext,issues:evaluated.reports.flatMap(q=>q.report.issues.filter(i=>i.severity==='BLOCKING')),groundedFindings:evaluated.findings,responseContract:blueprintResponseContract(f.input)})}]};
  const full=structuredClone(f.response);full.plans[0].blueprint.activities[0].completionCriterion=f.correction.activity.completionCriterion;
  const output={corrections:[f.correction]};const oldBytes=Buffer.byteLength(JSON.stringify(full)),newBytes=Buffer.byteLength(JSON.stringify(output));
  expect(newBytes).toBeLessThan(oldBytes);expect(boundedProviderInput(request)).toBeLessThan(boundedProviderInput(legacy));
  observations.push({activities:count,beforeInputReservationUnits:boundedProviderInput(legacy),afterInputReservationUnits:boundedProviderInput(request),beforeOutputUtf8Bytes:oldBytes,afterOutputUtf8Bytes:newBytes,beforeSystemUtf8Bytes:Buffer.byteLength(legacy.systemInstruction),afterSystemUtf8Bytes:Buffer.byteLength(request.systemInstruction),consequentialContextIdentical:true});
 }
 if(process.env.PLANNER_TARGETED_REPAIR_COMPLEXITY_EVIDENCE){const path=process.env.PLANNER_TARGETED_REPAIR_COMPLEXITY_EVIDENCE;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({method:'Matched exact legacy and actual current compiler request, same complete review input and concrete one-object correction. Reservation units are conservative UTF-8 accounting, not provider tokens. No model calls.',observations},null,2)+'\n');}
});
