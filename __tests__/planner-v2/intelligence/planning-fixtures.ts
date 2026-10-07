import { blueprintFixture,intentFixture,digest } from '../contracts/fixtures';
import { hash } from '@/lib/planner/v2/server/database';
import { weekKey } from '@/lib/planner/v2/server/context';
import type { BlueprintSnapshot } from '@/lib/planner/v2/intelligence/allocator';
import type { SchedulingEnvelope } from '@/lib/planner/v2/intelligence/schemas/scheduling';
import type { AllocationFacts } from '@/lib/planner/v2/intelligence/schemas/planning';
import type { BlueprintInput } from '@/lib/planner/v2/intelligence/blueprint';
export const dateAt=(i:number)=>new Date(Date.parse('2026-10-05')+i*86400000).toISOString().slice(0,10);
export function planningFixture(minutes:number[]=[30],capacities:number[]=[60,60]){
 const blueprint=blueprintFixture();blueprint.activities=minutes.map((m,i)=>({...blueprint.activities[0],localId:`work_${i}`,timeboxMinutes:m,effort:{lowMinutes:m,likelyMinutes:m,highMinutes:m}}));
 const snapshot:BlueprintSnapshot={plans:[{planRef:'physics',blueprint,digest:hash('blueprint',blueprint)}],sharedDependencies:[]};
 const envelope:SchedulingEnvelope={schemaVersion:2,timezone:'Asia/Karachi',today:dateAt(0),window:{start:dateAt(0),end:dateAt(capacities.length-1)},capacityDigest:digest('c'),basis:'CONFIRMED_AVAILABILITY',weeklyCeilingMinutes:600,recoveryPercent:0,
 targets:[{planRef:'physics',deadline:{kind:'NONE'},perGoalWeeklyCeilingMinutes:null}],days:capacities.map((capacity,i)=>({date:dateAt(i),ceilingMinutes:capacity,otherCommittedMinutes:0,protectedTargetMinutes:0,recoveryMinutes:0,availableMinutes:capacity,excluded:false})),protectedExecution:[],timeboxRange:{minMinutes:5,maxMinutes:240}};
 const facts:AllocationFacts={weeks:[...new Set(envelope.days.map(d=>weekKey(d.date)))].map(week=>({week,otherCommittedMinutes:0,protectedTargetMinutes:0,perGoalCommittedMinutes:[{planRef:'physics',minutes:0}]})),pins:[],externalActivities:[],preferences:[{planRef:'physics',pacing:'COMFORTABLE_EARLY'}]};
 const intent=intentFixture();intent.deadline={kind:'NONE'};
 const input:BlueprintInput={plans:[{planRef:'physics',intent,allowed:{scopeRefs:['scope_electricity'],excludedScopeRefs:[],evidenceRefs:[],resourceRefs:[],externalActivityRefs:[]},readiness:new Map(),kept:[],keptPhases:[]}],context:{facts:'authoritative'},envelope};
 const response={decision:'REVISE' as const,detail:{days:14 as const,checkpoint:'Choose the right method independently'},tradeOffExplanation:'Prioritize circuit-method uncertainty',plans:snapshot.plans.map(({planRef,blueprint})=>({planRef,blueprint})),sharedDependencies:snapshot.sharedDependencies};
 return {snapshot,envelope,facts,input,response};
}
