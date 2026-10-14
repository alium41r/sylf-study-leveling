// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { reviewLearning, verifyLearning, validateQualityReview, modelReviewInput } from '@/lib/planner/v2/intelligence/quality';
import type { ProviderMeter } from '@/lib/planner/v2/intelligence/provider';
import type { LLMAdapter, NormalizedMessage } from '@/lib/ai/providers/types';
import { WORKLOAD_ROUTING_TABLE } from '@/lib/ai/agent-router';
import { QualitySupportSchema } from '@/lib/planner/v2/intelligence/schemas/quality';
import { hash } from '@/lib/planner/v2/server/database';
import { reviewFixture, labelledReviewCases } from './review-fixtures';

function harness(replies: unknown[], inspect?: (messages: NormalizedMessage[], n: number) => void) {
  const reservations:number[] = [], closed:unknown[] = [], settled:string[] = []; let calls = 0;
  const meter:ProviderMeter = {window:async()=>({now:Date.now(),deadline:Date.now()+10000}),
    reserve:async(_route,input)=>{reservations.push(input);return `call_${reservations.length}`;},
    settle:async id=>{settled.push(id);},close:async(_id,result)=>{closed.push(result);},lateUsage:async()=>{}};
  const adapter = {adapter:()=>({generateResponse:async messages=>{
    inspect?.(messages,calls);const value = replies[Math.min(calls++,replies.length-1)];
    return {text:typeof value==='string'?value:JSON.stringify(value),finishReason:'STOP',usage:{promptTokens:100,completionTokens:100,totalTokens:200}};
  }}) as LLMAdapter};
  return {meter,adapter,reservations,closed,settled,calls:()=>calls};
}
const response = (issues:unknown[] = [], recovery?:unknown[]) => ({plans:[{planRef:'physics',issues}],...(recovery?{recovery}:{})});
const withdrawal = (f:ReturnType<typeof reviewFixture>) => ({concernRef:'review_concern_1',outcome:'WITHDRAWN',
  explanation:'The alleged external-resource requirement is unsupported; the actual task supplies feasible inputs and a valid independent check.',grounds:f.finding.grounds});
const signal=()=>new AbortController().signal;
describe('literal evidence and existing fallback recovery',()=>{
  it.each(['Use "quoted" givens.', 'First line\nSecond line', 'Café ∑ 🧠 – مثال', 'A literal \\n token'])('grounds exact decoded text: %s',text=>{
    const f=reviewFixture(text,text); expect(validateQualityReview(response([f.finding]),f.input,f.blank).reports[0].report.status).toBe('BLOCKED');
  });
  it('rejects keys, serialized fragments, cross-field joins, altered case and Unicode normalization',()=>{
    const f=reviewFixture('Café target','First. Second.');
    for(const excerpt of ['outcome','"outcome":"Café target"','Cafe\u0301 target','CAFÉ target']) {
      expect(()=>validateQualityReview(response([{...f.finding,grounds:[{ref:'physics/goal',excerpt},f.finding.grounds[1]]}]),f.input,f.blank)).toThrow();
    }
    const ground=f.input.grounding.find(g=>g.ref==='physics/goal')!;ground.text=JSON.stringify({first:'Café',second:'outcome',minutes:30});
    for(const excerpt of ['Café outcome','30']) expect(()=>validateQualityReview(response([{...f.finding,grounds:[{ref:ground.ref,excerpt},f.finding.grounds[1]]}]),f.input,f.blank)).toThrow();
    expect(()=>validateQualityReview(response([{...f.finding,grounds:[{ref:'foreign/goal',excerpt:'Café'},f.finding.grounds[1]]}]),f.input,f.blank)).toThrow();
  });
  it('cannot silently discard a parseable unsupported concern in fallback',async()=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Invented requirement'},f.finding.grounds[1]]};
    const h=harness([response([bad]),response()],(messages,n)=>{if(n) {
      const feedback=JSON.parse(messages.at(-1)!.content!);expect(feedback.rejectedOutput).toMatchObject({kind:'UNTRUSTED_MODEL_OUTPUT',complete:true});
      expect(feedback.requirements.concerns[0]).toMatchObject({concernRef:'review_concern_1',rejectedFinding:bad});
    }});
    await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter)).rejects.toMatchObject({detail:{code:'INVALID_OUTPUT'}});
    expect(h.calls()).toBe([WORKLOAD_ROUTING_TABLE.syllabus.primary,WORKLOAD_ROUTING_TABLE.syllabus.fallback,WORKLOAD_ROUTING_TABLE.syllabus.secondaryFallback].filter(Boolean).length);
    expect(h.closed.every(value=>!(value as {accepted?:boolean}).accepted)).toBe(true);
  });
  it.each(['root_array','single_plan','plans_object','extra_wrapper','issues_object','finding_wrapper','standalone_finding'])('cannot erase parseable concerns from malformed structure: %s',async shape=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Not supplied'},f.finding.grounds[1]]};
    const plan={planRef:'physics',issues:[bad]};
    const malformed=shape==='standalone_finding'?{...bad,planRef:'physics'}:shape==='finding_wrapper'?{findings:[{planRef:'physics',finding:bad}]}:shape==='root_array'?[plan]:shape==='single_plan'?plan:shape==='plans_object'?{plans:plan}:shape==='extra_wrapper'?{review:{plans:[plan]}}:{plans:[{...plan,issues:bad}]};
    const h=harness([malformed,response()],(messages,n)=>{if(n)expect(JSON.parse(messages.at(-1)!.content!).requirements.concerns).toEqual([expect.objectContaining({issueId:bad.issueId,rejectedFinding:shape==='standalone_finding'?malformed:bad})]);});
    await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter)).rejects.toMatchObject({detail:{code:'INVALID_OUTPUT'}});
    const corrected=harness([malformed,response([],[withdrawal(f)])]);
    expect((await reviewLearning(corrected.meter,f.input,f.blank,signal(),corrected.adapter)).reports[0].report.status).toBe('PASSED');
    expect(corrected.calls()).toBe(2);
  });
  it('accepts a grounded correction retaining the original owner and issue identity',async()=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Not in the input'},f.finding.grounds[1]]};
    const h=harness([response([bad]),response([f.finding],[{concernRef:'review_concern_1',outcome:'CORRECTED',planRef:'physics',issueId:f.finding.issueId}])]);
    const accepted=await reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter);
    expect(accepted.reports[0].report.status).toBe('BLOCKED');expect(accepted.recovery?.concerns).toHaveLength(1);expect(h.calls()).toBe(2);expect(h.settled).toHaveLength(2);
    expect(QualitySupportSchema.safeParse({phase:'REVIEWED',reviewInputDigest:hash('input',f.input),identityDigest:hash('id',[]),findings:accepted.findings,reviewRecovery:accepted.recovery}).success).toBe(true);
    expect(JSON.stringify(accepted.recovery)).not.toContain('Not in the input');
  });
  it('withdraws an unsupported objection with evidence rather than blocking a sound plan',async()=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Must obtain an external answer key'},f.finding.grounds[1]]};
    const h=harness([response([bad]),response([],[withdrawal(f)])]);const accepted=await reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter);
    expect(accepted.reports[0].report).toMatchObject({status:'PASSED',issues:[]});expect(accepted.recovery?.dispositions[0].outcome).toBe('WITHDRAWN');
    expect(h.reservations[1]).toBeGreaterThan(h.reservations[0]);expect(h.calls()).toBe(2);
  });
  it.each(['ungrounded','proposal_only','renamed','missing_link','duplicate','unsolicited'])('rejects invalid recovery: %s',async kind=>{
    const f=reviewFixture(),bad={...f.finding,affectedRefs:['foreign']};let receipt:unknown[]=[withdrawal(f)],issues:unknown[]=[];
    if(kind==='ungrounded')receipt=[{...withdrawal(f),grounds:[{ref:'physics/goal',excerpt:'Unsupported'},f.finding.grounds[1]]}];
    if(kind==='proposal_only')receipt=[{...withdrawal(f),grounds:[f.finding.grounds[1],f.finding.grounds[1]]}];
    if(kind==='renamed'){issues=[{...f.finding,issueId:'different'}];receipt=[{concernRef:'review_concern_1',outcome:'CORRECTED',planRef:'physics',issueId:'different'}];}
    if(kind==='missing_link')receipt=[{concernRef:'review_concern_1',outcome:'CORRECTED',planRef:'physics',issueId:f.finding.issueId}];
    if(kind==='duplicate')receipt=[withdrawal(f),withdrawal(f)];
    if(kind==='unsolicited')expect(()=>validateQualityReview(response([],[withdrawal(f)]),f.input,f.blank)).toThrow();
    else {const h=harness([response([bad]),response(issues,receipt)]);await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter)).rejects.toThrow();}
  });
  it('keeps concerns from multiple rejected responses and fails closed on oversized continuity',async()=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Not supplied'},f.finding.grounds[1]]};
    const second={...bad,issueId:'second'};const h=harness([response([bad]),response([second]),response([],[withdrawal(f)])]);
    await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter)).rejects.toThrow();
    const oversized=harness([response([{...bad,evidence:'x'.repeat(20*1024)}]),response()]);
    await expect(reviewLearning(oversized.meter,f.input,f.blank,signal(),oversized.adapter)).rejects.toMatchObject({detail:{code:'QUALITY_INCOMPLETE'}});expect(oversized.calls()).toBe(1);
  });
  it('fails closed when malformed finding data cannot be retained without changing it',async()=>{
    const f=reviewFixture(),malformed=JSON.stringify(response([{...f.finding,extra:null}])).replace('"extra":null','"extra":1e999');
    const h=harness([malformed,response()]);
    await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter)).rejects.toMatchObject({detail:{code:'QUALITY_INCOMPLETE'}});expect(h.calls()).toBe(1);
  });
  it('stops before fallback when rejected concerns cannot be durably saved',async()=>{
    const f=reviewFixture(),bad={...f.finding,grounds:[{ref:'physics/goal',excerpt:'Not supplied'},f.finding.grounds[1]]};
    const h=harness([response([bad]),response()]);
    await expect(reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter,{save:async()=>{throw new Error('Private database diagnostics');}})).rejects.toMatchObject({detail:{code:'SAVE_FAILED'}});
    expect(h.calls()).toBe(1);expect(h.settled).toHaveLength(1);expect(h.closed).toEqual([{finishReason:'STOP',errorCode:'SAVE_FAILED'}]);
  });
  it('also accounts for rejected new concerns during verification without dropping original issue resolutions',async()=>{
    const f=reviewFixture();f.input.stage='VERIFICATION';f.input.repairIssueIds=[f.finding.issueId];f.input.originalFindings=[{planRef:'physics',finding:f.finding}];
    const previous=validateQualityReview(response([f.finding]),{...f.input,stage:'REVIEW'},f.blank).reports;
    const resolutions=[{issueId:f.finding.issueId,result:'RESOLVED',explanation:'Actual independent check is present.',grounds:f.finding.grounds}];
    const bad={...f.finding,issueId:'new_concern',grounds:[{ref:'physics/goal',excerpt:'Invented'},f.finding.grounds[1]]};
    const h=harness([{plans:[{planRef:'physics',resolutions,newIssues:[bad]}]},{plans:[{planRef:'physics',resolutions,newIssues:[]}],recovery:[withdrawal(f)]}]);
    const result=await verifyLearning(h.meter,f.input,previous,f.blank,'2026-10-09T00:00:00.000Z',signal(),h.adapter);
    expect(result.reports[0].report.issues[0].verification?.result).toBe('RESOLVED');expect(result.recovery?.concerns[0].issueId).toBe('new_concern');
  });
});

const labelledResults: {id:string;label:string;status:string;severities:string[];calls:number}[] = [];
afterAll(()=>{
  if(process.env.PLANNER_REVIEW_DIAGNOSTIC_EVIDENCE){
    const path=process.env.PLANNER_REVIEW_DIAGNOSTIC_EVIDENCE;mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,JSON.stringify({method:'Twelve separately labelled deterministic candidates; labels are hidden from the request. Scripted adapters exercise the review boundary, not live model reasoning accuracy. No paid calls.',results:labelledResults},null,2)+'\n');
  }
});
describe('independently labelled review diagnostics (scripted boundary evaluation)',()=>{
  it.each(labelledReviewCases)('$id: $label',async candidate=>{
    const f=reviewFixture(candidate.goal,candidate.instructions);const model=modelReviewInput(f.input);
    expect(model.proposal.blueprints.plans[0].blueprint.strategy.outcome).toBe(candidate.goal);
    expect(model.proposal.blueprints.plans[0].blueprint.strategy.phases).toEqual([]);
    expect(model.proposal.envelope).toMatchObject({protectedExecution:[]});
    expect(model.proposal.allocation.report).toMatchObject({status:'FEASIBLE',committedMinutes:5});
    expect(JSON.stringify(model)).not.toContain(candidate.id);expect(JSON.stringify(model)).not.toContain(candidate.label);
    let issues:unknown[]=[];
    if(candidate.label!=='SOUND') issues=[{...f.finding,evidence:candidate.reason,
      basis:candidate.label==='PREFERENCE'?'PREFERENCE':candidate.label==='UNCERTAINTY'?'REASONABLE_UNCERTAINTY':'CONCRETE_VIOLATION'}];
    const h=harness([response(issues)],messages=>expect(JSON.parse(messages[0].content!).goals[0].requested.outcome).toBe(candidate.goal));
    const result=await reviewLearning(h.meter,f.input,f.blank,signal(),h.adapter),report=result.reports[0].report;
    expect(report.status).toBe(candidate.label==='DEFECTIVE'?'BLOCKED':'PASSED');
    if(candidate.label==='PREFERENCE')expect(report.issues[0].severity).toBe('ADVISORY');
    if(candidate.label==='UNCERTAINTY')expect(report.issues[0].severity).toBe('WARNING');
    expect(h.calls()).toBe(1);
    labelledResults.push({id:candidate.id,label:candidate.label,status:report.status,severities:report.issues.map(i=>i.severity),calls:h.calls()});
  });
});
