// Read-only audit reproductions of current behavior; these do not fix the application.
import { expect, test } from 'vitest';
import { examFixture, examAvailability } from '@/__tests__/planner/exam-fixtures';
import { roadmapFixture } from '@/__tests__/planner/roadmap-fixtures';
import { examFeasibility } from '@/lib/planner/exam-policy';
import { LIMITS, UserInputV1Schema, boundedParse } from '@/lib/planner/contracts';
import { validateCapacity } from '@/lib/planner/capacity';
import { emptyBrief } from '@/lib/planner/intake/brief';
import { briefReadiness } from '@/lib/planner/intake/readiness';
import { runSemanticStage } from '@/lib/ai/planner/pipeline';
import { readFileSync, writeFileSync } from 'node:fs';
import { assessDraftEdit } from '@/lib/planner/server/flexibility';

test('31 unseen exam topics pass feasibility although the 125-item floor exceeds the 90-item model contract', () => {
  const input = examFixture();
  input.exam.topics = Array.from({length:31}, (_,i)=>({label:`Chapter ${i+1}`,covered:false,confidence:null,difficult:false}));
  input.scope = input.exam.topics.map(t=>t.label).join('\n');
  input.endDate = input.examDate = '2030-04-07';
  input.exam.mockMinutes = null;
  const result = examFeasibility(input, examAvailability());
  expect(result.status).toBe('POTENTIAL_FIT');
  expect(result.minimumItems).toBe(125);
  expect(result.minimumItems).toBeGreaterThan(LIMITS.proposedItems);
});

test('zero explicit weekly budget is still marked ready when a normal schedule exists', () => {
  const brief = emptyBrief('EXAM');
  brief.goal.title = 'Biology exam';
  brief.target.endDate = brief.target.examDate = '2030-02-01';
  brief.scope.nodes = [{nodeId:'t1',label:'Cells',kind:'TOPIC',parentId:null,selected:true}];
  brief.budget.weeklyMinutes = 0;
  expect(briefReadiness(brief,{scheduleWeeklyMinutes:720}).canGenerate).toBe(true);
});

test('completed work still removes full duration from capacity', () => {
  const input = examFixture();
  const state = examAvailability();
  state.existingWork = [{id:1,date:input.startDate,minutes:90,status:'COMPLETED',fingerprint:'completed'}];
  const result = validateCapacity(input,state,[]);
  expect(result.days[0].existing).toBe(90);
  expect(result.days[0].remaining).toBe(12);
});

test('an unrepaired high-severity AI critic finding is returned as a usable proposal', async () => {
  const issue = {issueCode:'SEQ_WEAK' as const,affectedItemRefs:['i1'],severity:'HIGH' as const,patchInstruction:'Correct the prerequisite ordering.'};
  const result = await runSemanticStage({
    value:{title:'Original'}, semantic:{criticAdapter:()=>({} as never),budgetMs:10000},
    signal:new AbortController().signal, active:{provider:'deepseek',model:'audit-stub'},
    findings:()=>[], targets:()=>['i1'],
    critic:async()=>({state:'ISSUES' as const,issues:[issue]}),
    repair:async()=>({state:'REJECTED' as const}), accept:value=>value,
    fatal:issues=>issues.filter(i=>i.severity==='HIGH'), softViolations:()=>0,
    workload:{critic:'exam_critic',repair:'exam_repair'}, rejectionCode:'AUDIT_EXPECTED_REJECTION',
  });
  expect(result.value.title).toBe('Original');
  expect(result.review.critic).toBe('UNREPAIRED');
  expect(result.review.issues).toBe(1);
});

test('a valid large Roadmap input passes its generation envelope but fails the generic later-read envelope', () => {
  const input = roadmapFixture();
  input.roadmap.topics = Array.from({length:60},(_,i)=>({label:`Unit ${i+1} `+'é'.repeat(60)+'x'.repeat(128),covered:null,confidence:null,difficult:null}));
  input.scope = input.roadmap.topics.map(t=>t.label).join('\n');
  input.availability.blockedDates = Array.from({length:175},(_,i)=>new Date(Date.UTC(2030,0,7+i)).toISOString().slice(0,10));
  const parsed = boundedParse(UserInputV1Schema,input,LIMITS.roadmapInputBytes);
  expect(parsed.mode).toBe('ROADMAP');
  expect(()=>boundedParse(UserInputV1Schema,input,LIMITS.inputBytes)).toThrow('PAYLOAD_TOO_LARGE');
});

test('diagnose the live Roadmap outcome edit rejection against the saved generation', () => {
  const root = 'documentation/planner/reports/2026-10-02-end-to-end-audit/evidence/';
  const snapshot = JSON.parse(readFileSync(root+'interim-state.json','utf8'));
  const revision = snapshot.PlannerRevision.find((r: {id:string})=>r.id==='256296b6-33dd-491a-b7cd-c8f276820ff2');
  const requests = readFileSync(root+'http.jsonl','utf8').trim().split('\n').map(s=>JSON.parse(s));
  const results = requests.filter(r=>r.method==='POST' && r.path==='/api/planner/c8035ff6-036f-47db-a653-03dfef73ad91/revisions').map(request=>{
    const body = JSON.parse(request.request);
    const draft = {...revision.outputSnapshot,milestones:revision.outputSnapshot.milestones.map((m:{key:string})=>({...m,...body.milestoneEdits.find((e:{key:string})=>e.key===m.key)}))};
    const result = assessDraftEdit({input:revision.inputSnapshot,draft,base:revision.outputSnapshot,acknowledged:[],state:revision.availabilitySnapshot});
    return {httpId:request.id,result};
  });
  writeFileSync(root+'roadmap-edit-diagnosis.json',JSON.stringify(results,null,2));
  expect(results.some(r=>r.result.blockers.some(b=>b.code==='INVALID_MILESTONE_OUTCOME'))).toBe(true);
});
