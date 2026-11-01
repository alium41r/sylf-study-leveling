/** Corrected qualification input; no model/network imports or execution. */
import { readFileSync } from 'node:fs';
import { funding } from './prepare.mjs';
export { funding };
export const reportPath = 'documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation';
export const profileId = 'C01-CORRECTED-2';
// Named civil meaning is checked independently of numeric range/schema validity.
export const civilWeek = Object.freeze([
  {name:'Monday',ceiling:120,windows:[[1020,1140]]},
  {name:'Tuesday',ceiling:120,windows:[[1020,1140]]},
  {name:'Wednesday',ceiling:120,windows:[[1020,1140]]},
  {name:'Thursday',ceiling:120,windows:[[1020,1140]]},
  {name:'Friday',ceiling:0,windows:[]},
  {name:'Saturday',ceiling:180,windows:[[540,720]]},
  {name:'Sunday',ceiling:120,windows:[[600,720]]},
]);
export function validateC01Input(c) {
  if(c.schemaVersion!==2||c.weekdayConvention!=='MONDAY_ZERO'||c.timezone!=='Asia/Karachi'||c.webPermission!==false||c.goals.length!==2||c.materials.length!==3)throw new Error('CORRECTED_C01_PROFILE_REQUIRED');
  const a=c.availability;
  if(a.timezone!==c.timezone||a.weeklyCeilingMinutes!==660||a.recoveryPercent!==10||JSON.stringify(a.restWeekdays)!=='[4]'||a.blockedDates.length)throw new Error('C01_ACCEPTED_AVAILABILITY_CONFLICT');
  for(const [weekday,day] of civilWeek.entries()){
    const windows=a.studyWindows.filter(w=>w.weekday===weekday).map(w=>[w.startMinute,w.endMinute]);
    if(a.dailyCeilingMinutes[weekday]!==day.ceiling||JSON.stringify(windows)!==JSON.stringify(day.windows))throw new Error(`C01_CIVIL_${day.name.toUpperCase()}_CONFLICT`);
  }
  if(a.studyWindows.length!==6||a.dailyCeilingMinutes.length!==7||!c.acceptedInstructions.includes('Friday rest'))throw new Error('C01_CIVIL_WEEK_CONFLICT');
  for(const [i,goal]of c.goals.entries()){
    const offset=(Date.parse(goal.deadline.date+'T12:00:00Z')-Date.parse(c.anchor+'T12:00:00Z'))/86400000;
    if(goal.policy!=='GENERAL'||goal.deadline.kind!=='FIXED'||goal.deadline.examDayStudyAllowed!==false||offset!==[21,24][i]||goal.scope.length!==4)throw new Error('C01_DEADLINE_OR_SCOPE_CONFLICT');
  }
  if(c.calendarEvents.length!==16||c.existingTasks.length!==1||c.existingTasks[0].minutes!==35||c.existingTasks[0].selected!==false)throw new Error('C01_COMMITMENTS_CONFLICT');
  return c;
}
export const readC01 = () => validateC01Input(JSON.parse(readFileSync(`${reportPath}/PILOT_INPUT.json`,'utf8')));

export function checkFreshFunding(auth, metadata, priorLiabilityUsd, now=Date.now()) {
  const age=now-Date.parse(metadata?.checkedAt??'');
  const balance=metadata?.balance?.balances?.find(b=>b.currency==='USD');
  if(auth.profileId!==profileId||auth.priorUnknownSpendAcknowledged!==true||auth.ceilingUsd!==funding.proposedAuthorizationUsd||auth.repetitions!==1||metadata?.status!=='METADATA_REACHABLE'||metadata.balance?.isAvailable!==true||!Number.isFinite(age)||age<0||age>15*60000||!/^\d+(\.\d+)?$/.test(balance?.total_balance??'')||!Number.isFinite(priorLiabilityUsd)||priorLiabilityUsd<0||!Number.isFinite(Number(balance.total_balance))||Number(balance.total_balance)-priorLiabilityUsd<auth.ceilingUsd)throw new Error('FRESH_FUNDING_AND_PRIOR_UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED');
  if(metadata.model?.id!=='deepseek-flash'||!Number.isSafeInteger(metadata.model.contextWindow)||metadata.model.contextWindow<565536||!Number.isSafeInteger(metadata.model.maxOutputTokens)||metadata.model.maxOutputTokens<65536||!metadata.model.effort?.supported_levels?.includes('high'))throw new Error('APPROVED_MODEL_CAPABILITIES_REQUIRED');
  return {balanceCoversNewCeilingAndPriorLiability:true,priorLiabilityUsd,checkedAt:metadata.checkedAt};
}
