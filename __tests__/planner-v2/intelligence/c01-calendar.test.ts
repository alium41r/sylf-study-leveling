import { it,expect } from 'vitest';
import {readFileSync} from 'node:fs';
import {auditC01Capacity,auditC01Schedule} from '@/scripts/qa/planner-phase-c/c01-calendar';
const readC01=()=>JSON.parse(readFileSync('documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation/evidence/input-drafts/PILOT_INPUT-anchor-2026-10-29.json','utf8')); // This immutable oracle accompanies the named earlier captured witness.
const path='documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation/evidence/qualification-matrix-1/SCRIPTED/calls/007-REVIEWER.json';
const packet=()=>JSON.parse(JSON.parse(readFileSync(path,'utf8')).messages[0].content).input;
it('independently matches named civil dates, UTC instants, overlap union, existing work and both fixed deadlines',()=>{
 const input=packet(),snapshot=input.context.capacity.calendar;
 expect(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Karachi',weekday:'long'}).format(new Date('2026-10-30T07:00:00Z'))).toBe('Friday');
 expect(snapshot.days.find((d:{date:string})=>d.date==='2026-10-30')).toMatchObject({approved:[],excluded:true});
 expect(snapshot.days.find((d:{date:string})=>d.date==='2026-10-31').approved).toEqual([{start:'2026-10-31T04:00:00.000Z',end:'2026-10-31T07:00:00.000Z'}]);
 expect(snapshot.days.find((d:{date:string})=>d.date==='2026-11-01').approved).toEqual([{start:'2026-11-01T05:00:00.000Z',end:'2026-11-01T07:00:00.000Z'}]);
 expect(auditC01Capacity(readC01(),input.context.capacity)).toMatchObject({status:'PASSED',englishAvailableMinutes:73,overlapUnionMinutes:90});
 expect(auditC01Schedule(readC01(),input)).toMatchObject({status:'PASSED',totalTargetMinutes:320,jointWitnessCount:9});
});
it.each(['rest','window','overlap','deadline','duplicate','english','dependency'])('rejects a corrupted capacity or schedule witness (%s)',fault=>{
 const input=packet(),calendar=input.context.capacity.calendar,allocation=input.proposal.allocation.report.calendarAllocation;
 if(fault==='rest')calendar.days.find((d:{date:string})=>d.date==='2026-10-30').excluded=false;
 if(fault==='window')calendar.days.find((d:{date:string})=>d.date==='2026-11-01').approved[0].start='2026-11-01T04:00:00.000Z';
 if(fault==='overlap')allocation.witness[0].start='2026-10-31T05:00:00.000Z';
 if(fault==='deadline')input.context.compiled[0].specs[0].placement.date='2026-11-19';
 if(fault==='duplicate')allocation.witness[1]={...allocation.witness[0],key:allocation.witness[1].key};
 if(fault==='dependency')allocation.tasks[1].after=[allocation.tasks.at(-1).key];
 if(fault==='english')allocation.tasks=allocation.tasks.filter((t:{key:string})=>!t.key.startsWith('quest_'));
 expect(()=>auditC01Schedule(readC01(),input)).toThrow();
});
