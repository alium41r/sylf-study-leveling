import { it,expect } from 'vitest';
import { allocateLearning } from '@/lib/planner/v2/intelligence/allocator';
import { planningFixture,dateAt } from './planning-fixtures';
// Deliberately independent exhaustive enumerator: no allocator ledgers/domains,
// capacity proofs or search helpers are imported.
function oracle(f:ReturnType<typeof planningFixture>){
 const activities=f.snapshot.plans[0].blueprint.activities,dates=f.envelope.days;const assignment:number[]=[];const daily=dates.map(()=>0);let found=false;
 const visit=(i:number)=>{if(i===activities.length){found=true;return;}const a=activities[i];for(let d=0;d<dates.length;d++){
 const day=dates[d],deadline=f.envelope.targets[0].deadline;if(day.excluded||daily[d]+a.timeboxMinutes>day.availableMinutes||deadline.kind==='FIXED'&&(day.date>deadline.date||day.date===deadline.date&&!deadline.examDayStudyAllowed))continue;
 const used=daily.reduce((n,v)=>n+v,0)+a.timeboxMinutes;
 if(used+Math.ceil(f.facts.weeks[0].otherCommittedMinutes)>f.envelope.weeklyCeilingMinutes)continue;
 const goal=f.envelope.targets[0].perGoalWeeklyCeilingMinutes;if(goal!==null&&used+Math.ceil(f.facts.weeks[0].perGoalCommittedMinutes[0].minutes)>goal)continue;
 if(a.hardDependencies.some(ref=>assignment[activities.findIndex(b=>b.localId===ref)]>d))continue;
 const w=a.learningWindow;if(w?.strength==='HARD'){const anchor=assignment[activities.findIndex(b=>b.localId===w.anchorActivityId)];if(anchor===undefined||d-anchor<(w.minimumGapDays??0)||w.maximumGapDays!==undefined&&d-anchor>w.maximumGapDays)continue;}
 assignment[i]=d;daily[d]+=a.timeboxMinutes;visit(i+1);daily[d]-=a.timeboxMinutes;if(found)return;
 }};visit(0);return found;
}
it('agrees with an independent exhaustive oracle over 500 seeded capacity/dependency/deadline fixtures',()=>{
 let seed=143127;const random=(max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
 for(let fixture=0;fixture<500;fixture++){
 const count=1+random(5),days=1+random(4);const f=planningFixture(Array.from({length:count},()=>5*(1+random(8))),Array.from({length:days},()=>5*random(13)));
 f.envelope.weeklyCeilingMinutes=5*(1+random(30));f.facts.weeks[0].otherCommittedMinutes=5*random(4);
 if(random(3)===0)f.envelope.targets[0].deadline={kind:'FIXED',date:dateAt(random(days)),examDayStudyAllowed:!!random(2)};
 if(random(2))f.envelope.targets[0].perGoalWeeklyCeilingMinutes=5*(1+random(25));
 if(random(3)===0){const d=random(days);f.envelope.days[d].excluded=true;f.envelope.days[d].availableMinutes=0;}
 for(let i=1;i<count;i++)if(random(2)){f.snapshot.plans[0].blueprint.activities[i].hardDependencies=[`work_${i-1}`];if(random(2))f.snapshot.plans[0].blueprint.activities[i].learningWindow={anchorActivityId:`work_${i-1}`,minimumGapDays:random(2),maximumGapDays:2,strength:'HARD',reason:'AI supplied dependency spacing'};}
 const exists=oracle(f);const r=allocateLearning(f.snapshot,f.envelope,f.facts);
 expect(r.status==='FEASIBLE',`fixture ${fixture}: ${JSON.stringify(f)}`).toBe(exists);
 if(r.status==='CAPACITY_SHORTFALL')expect(exists,`false proof ${fixture}`).toBe(false);
 expect(allocateLearning(f.snapshot,f.envelope,f.facts)).toEqual(r);
 }
});
