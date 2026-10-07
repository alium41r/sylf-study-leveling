import type { SchedulingEnvelope } from './schemas/scheduling';
import type { AllocationFacts } from './schemas/planning';
import { weekKey } from '../server/context';
import { reject } from '../server/database';
/** Daily and weekly ceilings are concurrent upper bounds, not two debits.
 * Reserve a single disclosed percentage at each bound. In a partial week only
 * the remaining bookable days contribute recovery; excluded days reserve none. */
export function weeklyRemainingCapacity(envelope:SchedulingEnvelope,week:AllocationFacts['weeks'][number]){
 const dailyMargin=envelope.days.filter(d=>!d.excluded&&weekKey(d.date)===week.week).reduce((n,d)=>n+d.recoveryMinutes,0);
 const recovery=Math.min(dailyMargin,Math.ceil(envelope.weeklyCeilingMinutes*envelope.recoveryPercent/100));
 return Math.max(0,envelope.weeklyCeilingMinutes-Math.ceil(week.otherCommittedMinutes)-week.protectedTargetMinutes-recovery);
}
export function goalRemainingCapacity(envelope:SchedulingEnvelope,planRef:string,week:AllocationFacts['weeks'][number]){
 const ceiling=envelope.targets.find(t=>t.planRef===planRef)?.perGoalWeeklyCeilingMinutes;
 if(ceiling===undefined)reject('REFERENCE_NOT_OWNED','Unknown allocation target.','ALLOCATION');if(ceiling===null)return Infinity;
 const base=week.perGoalCommittedMinutes.find(p=>p.planRef===planRef)?.minutes;
 if(base===undefined)reject('INVALID_OUTPUT','Owned per-goal week usage is missing.','ALLOCATION');
 const protectedRemaining=envelope.protectedExecution.filter(p=>p.planRef===planRef&&weekKey(p.date)===week.week).reduce((n,p)=>n+p.remainingMinutes,0);
 return Math.max(0,ceiling-Math.ceil(base)-protectedRemaining);
}
/** Upper bound for a new indivisible activity, after exact retained unstarted
 * reservations. This chooses only whether declared pieces need expansion. */
export function maximumNewTimebox(envelope:SchedulingEnvelope,facts:AllocationFacts,planRef:string){
 const target=envelope.targets.find(t=>t.planRef===planRef);if(!target)reject('REFERENCE_NOT_OWNED','Unknown split target.','BLUEPRINT');
 const kept=facts.pins.filter(p=>!p.alreadyReserved),maximum=facts.preferences.find(p=>p.planRef===planRef)?.maximumTimeboxMinutes??240;
 return Math.min(maximum,Math.max(0,...envelope.days.filter(d=>!d.excluded&&d.date>=envelope.today&&(target.deadline.kind!=='FIXED'||d.date<target.deadline.date||d.date===target.deadline.date&&target.deadline.examDayStudyAllowed)).map(day=>{
  const week=facts.weeks.find(w=>w.week===weekKey(day.date));if(!week)reject('INVALID_OUTPUT','Owned weekly split facts are missing.','BLUEPRINT');
  const dailyKept=kept.filter(p=>p.date===day.date).reduce((n,p)=>n+p.remainingMinutes,0),weeklyKept=kept.filter(p=>weekKey(p.date)===week.week).reduce((n,p)=>n+p.remainingMinutes,0),goalKept=kept.filter(p=>p.planRef===planRef&&weekKey(p.date)===week.week).reduce((n,p)=>n+p.remainingMinutes,0);
  return Math.max(0,Math.min(day.availableMinutes-dailyKept,weeklyRemainingCapacity(envelope,week)-weeklyKept,goalRemainingCapacity(envelope,planRef,week)-goalKept));
 })));
}
