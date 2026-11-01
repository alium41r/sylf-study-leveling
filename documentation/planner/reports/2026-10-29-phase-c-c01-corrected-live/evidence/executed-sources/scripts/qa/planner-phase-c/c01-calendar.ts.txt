/** Independent qualification assertions over existing Calendar/Planner outputs;
 * this does not search, schedule, or grant availability. */
import assert from 'node:assert/strict';
import { addDays, localTimeToISO } from '../../../lib/calendar/dates';
import { readPlanningCalendar } from '../../../lib/calendar/planning';
import { mondayIndex, type ExecutionContext } from '../../../lib/planner/v2/server/context';
import type { Sql } from '../../../lib/planner/v2/server/database';
import type { CanonicalIntentV2 } from '../../../lib/planner/v2/contracts';
import type { CapacityResult } from '../../../lib/planner/v2/intelligence/foundation/contracts';
import { usableStudyWindows, validateIntervalWitness, validateCalendarAllocation, type CalendarAllocation } from '../../../lib/planner/v2/intelligence/foundation/calendar';
import { civilWeek, validateC01Input } from './c01-profile.mjs';

type Input={anchor:string;timezone:string;availability:{studyWindows:{weekday:number;startMinute:number;endMinute:number}[];dailyCeilingMinutes:number[];restWeekdays:number[]};calendarEvents:{date:string;title:string;startsAt:string;endsAt:string;timezone:string}[];existingTasks:{date:string;minutes:number}[];goals:{deadline:{kind:string;date:string;examDayStudyAllowed:boolean}}[]};
const instant=(date:string,minute:number,zone:string)=>localTimeToISO(date,`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`,zone);
export async function auditC01Calendar(sql:Sql,owner:number,c:Input,intents:CanonicalIntentV2[],context:ExecutionContext){
  validateC01Input(c);
  assert.equal(context.timezone,c.timezone);assert.equal(context.globalAvailability?.weeklyCeilingMinutes,660);
  for(const intent of intents){assert.equal(intent.policy,'GENERAL');assert.equal(intent.assessment,undefined);assert.deepEqual(intent.availability?.dailyCeilingMinutes,c.availability.dailyCeilingMinutes);assert.deepEqual(intent.availability?.restWeekdays,[4]);assert.deepEqual(intent.availability?.studyWindows?.weekly,c.availability.studyWindows);}
  assert.deepEqual(context.globalAvailability?.dailyCeilingMinutes,c.availability.dailyCeilingMinutes);
  const calendar=await readPlanningCalendar(sql,owner,c.anchor,addDays(c.anchor,28),c.timezone,new Date());
  assert.ok(calendar.sources.every(s=>s.complete));assert.equal(calendar.events.length,16);
  const expected=[];
  for(let i=0;i<28;i++){
    const date=addDays(c.anchor,i),weekday=mondayIndex(date);
    const intervals=weekday===5?[[600,660],[630,690]]:weekday===1?[[1050,1110]]:weekday===2?[[1080,1140]]:[];
    for(const [start,end]of intervals)expected.push({date,start:instant(date,start,c.timezone),end:instant(date,end,c.timezone)});
  }
  const byTime=(a:{start:string},b:{start:string})=>a.start.localeCompare(b.start);
  const actual=calendar.events.map(e=>({date:e.startDate,start:new Date(e.startsAt!).toISOString(),end:new Date(e.endsAt!).toISOString()})).sort(byTime);
  assert.deepEqual(actual,expected.sort(byTime));
  assert.deepEqual(c.calendarEvents.map(e=>({date:e.date,start:e.startsAt,end:e.endsAt})).sort(byTime),expected);
  assert.deepEqual(intents.map(i=>i.deadline),c.goals.map(g=>g.deadline));
  assert.deepEqual(c.goals.map(g=>g.deadline.date),[addDays(c.anchor,21),addDays(c.anchor,24)]);
  const english=context.quests.filter(q=>q.title==='English reading submission');assert.equal(english.length,1);assert.equal(english[0].scheduledFor,c.existingTasks[0].date);assert.equal(english[0].requiredMinutes,35);assert.equal(mondayIndex(english[0].scheduledFor),6);assert.equal(english[0].scheduledFor,Array.from({length:7},(_,i)=>addDays(c.anchor,i)).find(d=>mondayIndex(d)===6));
  return {status:'PASSED',timezone:c.timezone,weekdayConvention:'MONDAY_ZERO',namedWeek:civilWeek,actualCalendarEvents:actual,deadlines:intents.map(i=>i.deadline),english:{date:english[0].scheduledFor,minutes:35},calendarSources:calendar.sources};
}
export function auditC01Capacity(c:Input,capacity:CapacityResult){
  assert.equal(capacity.status,'READY');assert.ok(capacity.calendar);assert.ok(capacity.constraints);
  const snapshot=capacity.calendar,now=Date.parse(snapshot.capturedAt),geometry=usableStudyWindows(snapshot,now);assert.equal(geometry.status,'KNOWN');
  assert.ok(snapshot.days.some(d=>d.date>=c.goals[1].deadline.date),'capacity must cover both full deadlines');
  const observed=[];
  for(const day of snapshot.days.filter(d=>d.date>=c.anchor)){
    const weekday=mondayIndex(day.date),named=civilWeek[weekday];
    const expected=named.windows.map(([start,end]:number[])=>({start:instant(day.date,start,c.timezone),end:instant(day.date,end,c.timezone)}));
    assert.deepEqual(day.approved,expected,`approved civil windows ${day.date} ${named.name}`);assert.equal(day.excluded,weekday===4);
    const envelopeDay:NonNullable<CapacityResult["constraints"]>["days"][number]=capacity.constraints.days.find(d=>d.date===day.date)!;assert.equal(envelopeDay.ceilingMinutes,named.ceiling);
    assert.equal(envelopeDay.recoveryMinutes,weekday===4?0:Math.ceil(named.ceiling*.1));
    const windows=geometry.days.find(d=>d.date===day.date)!.windows;
    if(weekday===5){assert.equal(windows.reduce((n,w)=>n+(w.end-w.start)/60000,0),90,'overlapping Saturday commitments remove 90 minutes, once');assert.deepEqual(windows.map(w=>({start:new Date(w.start).toISOString(),end:new Date(w.end).toISOString()})),[{start:instant(day.date,540,c.timezone),end:instant(day.date,600,c.timezone)},{start:instant(day.date,690,c.timezone),end:instant(day.date,720,c.timezone)}]);}
    observed.push({date:day.date,weekday:named.name,ceiling:envelopeDay.ceilingMinutes,recovery:envelopeDay.recoveryMinutes,available:envelopeDay.availableMinutes,freeIntervals:windows});
  }
  const englishDay=capacity.constraints.days.find(d=>d.date===c.existingTasks[0].date)!;
  assert.equal(englishDay.otherCommittedMinutes,35);assert.equal(englishDay.availableMinutes,73,'English and recovery are debited once');
  assert.equal(capacity.allocation?.tasks.filter(t=>t.date===c.existingTasks[0].date&&t.minutes===35).length,1);
  if(capacity.allocation?.status==='FEASIBLE')validateIntervalWitness(snapshot,capacity.allocation.tasks,capacity.allocation.witness,now);
  return {status:'PASSED',days:observed,englishAvailableMinutes:englishDay.availableMinutes,overlapUnionMinutes:90,examDayStudyAllowed:false};
}

export function auditC01Schedule(c:Input,input:{context:{capacity:CapacityResult;compiled:{planRef:string;specs:{blueprintActivityId:string;placement:{date:string};effort:{plannedMinutes:number}}[]}[]};proposal:{allocation:{report:{calendarAllocation?:CalendarAllocation}}}}){
  auditC01Capacity(c,input.context.capacity);
  const snapshot=input.context.capacity.calendar!,allocation=input.proposal.allocation.report.calendarAllocation;assert.ok(allocation);assert.equal(allocation.status,'FEASIBLE');
  validateCalendarAllocation(snapshot,allocation,Date.parse(snapshot.capturedAt));
  const observed=[];
  for(const target of input.context.compiled)for(const spec of target.specs){
    const key=`${target.planRef}/${spec.blueprintActivityId}`;
    const task:{key:string;date:string;minutes:number}|undefined=allocation.tasks.find(t=>t.key===key);
    const slot:{key:string;start:string;end:string}|undefined=allocation.witness.find(w=>w.key===key);assert.ok(task);assert.ok(slot);
    const deadline=c.goals[Number(target.planRef.slice(-1))-1].deadline.date;
    assert.equal(task.date,spec.placement.date);assert.equal(task.minutes,spec.effort.plannedMinutes);assert.ok(task.date>=c.anchor&&task.date<deadline);assert.notEqual(mondayIndex(task.date),4);
    assert.equal(Date.parse(slot.end)-Date.parse(slot.start),task.minutes*60000);
    for(const event of c.calendarEvents)assert.ok(Date.parse(slot.end)<=Date.parse(event.startsAt)||Date.parse(slot.start)>=Date.parse(event.endsAt),'no actual Calendar overlap');
    observed.push({planRef:target.planRef,key,date:task.date,minutes:task.minutes,slot,deadline});
  }
  for(let i=0;i<allocation.witness.length;i++)for(let j=i+1;j<allocation.witness.length;j++){
    const a=allocation.witness[i],b=allocation.witness[j];assert.ok(Date.parse(a.end)<=Date.parse(b.start)||Date.parse(a.start)>=Date.parse(b.end),'no joint double booking');
  }
  assert.equal(allocation.tasks.filter(t=>t.key.startsWith('quest_')&&t.date===c.existingTasks[0].date&&t.minutes===35).length,1);
  return {status:'PASSED',compiledActivities:observed,totalTargetMinutes:observed.reduce((n,a)=>n+a.minutes,0),jointWitnessCount:allocation.witness.length,englishReservedOnce:true};
}
