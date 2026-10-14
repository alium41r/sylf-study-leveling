import { checkpointFixture } from './fixtures';
import { planningFixture } from './planning-fixtures';
import { allocateLearning } from '@/lib/planner/v2/intelligence/allocator';
import { LearningBlueprintV2Schema } from '@/lib/planner/v2/contracts';
import { hash } from '@/lib/planner/v2/server/database';
import { buildReviewInput, incompleteQuality } from '@/lib/planner/v2/intelligence/quality';
import type { GroundedFinding } from '@/lib/planner/v2/intelligence/schemas/quality';

export function reviewFixture(goal = 'Independently add two fractions and check the result.',
  instructions = 'Choose two fractions. Add them unaided; check with a common denominator and explain equivalence.') {
  const checkpoint = checkpointFixture(), p = checkpoint.payload;
  if (!('allocation' in p)) throw new Error('Missing fixture allocation');
  const blueprint = LearningBlueprintV2Schema.parse({schemaVersion:2,
    strategy:{policy:'MASTERY',outcome:goal,explanation:'Use one bounded target performance check, with an honest gap path.',
      recommendedEffort:{lowMinutes:2,likelyMinutes:3,highMinutes:5},phases:[]},
    scope:[{scopeRef:'scope_task',disposition:'INCLUDED',contribution:goal}],
    activities:[{localId:'practice01',outcomeRefs:[],scopeRefs:['scope_task'],title:'Target performance check',activityType:'DIAGNOSTIC',
      purpose:goal,instructions,completionCriterion:'Complete the instructed learner action and its stated correctness check, or record the specific unmet requirement.',
      effort:{lowMinutes:2,likelyMinutes:3,highMinutes:5},timeboxMinutes:5,commitment:{category:'COMMITTED'},hardDependencies:[]}],
    decisions:{assumptions:[],tradeOffs:[],unresolvedUncertainty:[],stoppingConditions:['Stop after checked success or recording the actual gap.']}});
  p.blueprints={plans:[{planRef:'physics',blueprint,digest:hash('blueprint',blueprint)}],sharedDependencies:[]};
  const scheduling=planningFixture([5],[60,60]);p.envelope=scheduling.envelope;
  const allocation=allocateLearning(p.blueprints,p.envelope,scheduling.facts);p.allocation={report:allocation,digest:hash('allocation',allocation)};
  const requested = {title:'Target performance',policy:'MASTERY',outcome:goal,deadline:{kind:'NONE'},
    scope:[{ref:'scope_task',title:'Accepted target task',inclusion:'REQUESTED',sourceClaimIds:[]}]};
  const input = buildReviewInput([{planRef:'physics',requested,resolved:requested}], {plans:[]}, {...p,stage:'ALLOCATION'});
  const finding: GroundedFinding = {issueId:'educational_concern', category:'PEDAGOGICAL', severity:'BLOCKING',
    affectedRefs:['practice01'], basis:'CONCRETE_VIOLATION',
    grounds:[{ref:'physics/goal',excerpt:goal},{ref:'physics/activity/practice01',excerpt:instructions}],
    evidence:'The instructions conflict with the required performance.', consequence:'The learner cannot meet the accepted outcome.',
    requestedResolution:'Correct the specific conflicting instructions.', requiresAcknowledgement:false};
  return {input,blank:incompleteQuality(checkpoint),finding};
}

/** Expected labels are assigned separately from the request and scripted provider responses.
 * These are diagnostic boundary fixtures, not a paid-model accuracy benchmark. */
export const labelledReviewCases = [
  {id:'authentic_items_missing',label:'DEFECTIVE',goal:'Complete the actual assigned worksheet. Its items are unavailable.',instructions:'Invent five exercises and mark the assigned worksheet complete.',reason:'Synthetic practice cannot complete the unavailable authentic deliverable.'},
  {id:'unrequested_scope',label:'DEFECTIVE',goal:'Add two fractions using elementary arithmetic; exclude calculus.',instructions:'Learn derivatives as a compulsory prerequisite before adding fractions.',reason:'Mandatory excluded scope is unnecessary for the accepted task.'},
  {id:'recall_gate',label:'DEFECTIVE',goal:'Independently add unfamiliar fractions and check correctness.',instructions:'Read the addition rule and stop when you can repeat it.',reason:'Recall does not demonstrate the required independent application.'},
  {id:'unnecessary_repetition',label:'DEFECTIVE',goal:'Demonstrate correct fraction addition once; stop after checked success.',instructions:'After correct explained and checked success, repeat forty identical additions compulsorily.',reason:'The compulsory repetition contradicts the accepted stopping gate.'},
  {id:'self_created_givens',label:'SOUND',goal:'Independently add two fractions and check the result.',instructions:'Choose two fractions with nonzero denominators no larger than 12. Add unaided; check that the proposed sum times the product of denominators equals the sum of the two cross-products.',reason:'Learner-chosen inputs and a meaningful check satisfy the outcome.'},
  {id:'alternative_check',label:'SOUND',goal:'Independently verify a percentage increase using a valid alternative method.',instructions:'Choose a starting integer from 1 to 100 and an increase percentage from 1 to 20. Calculate the new value unaided; recover the percentage from (new minus start)/start and compare it with the chosen percentage.',reason:'A valid alternative method supplies the correctness check.'},
  {id:'honest_unavailable_deliverable',label:'SOUND',goal:'Prepare for a unit-conversion assessment; its future question sheet is unavailable.',instructions:'Given 1 km = 1000 m, convert 3 km to metres unaided. Check by dividing the result by 1000 to recover 3 km. Do not claim the future assessment completed.',reason:'Preparation is self-contained and honest about the unavailable authentic resource.'},
  {id:'valid_intermediate_teaching',label:'SOUND',goal:'Learn fraction addition and demonstrate independent changed-input performance.',instructions:'Study the worked example 1/2 + 1/3 = (3 + 2)/6 = 5/6. Choose different fractions with nonzero denominators up to 12 and add unaided; verify that the proposed sum times the product denominator equals the sum of the cross-products.',reason:'Supported learning followed by an independent changed demonstration is appropriate.'},
  {id:'format_preference',label:'PREFERENCE',goal:'Independently add two fractions and check the result.',instructions:'Choose fractions with nonzero denominators up to 12, solve unaided, and check the proposed sum using the cross-product identity.',reason:'Prefer a colored diagram, although the task already has a valid check.'},
  {id:'extra_practice_preference',label:'PREFERENCE',goal:'Demonstrate one correct checked addition.',instructions:'Choose fractions with nonzero denominators up to 12, add unaided, verify the cross-product identity, and stop after success.',reason:'Prefer several more problems without evidence of necessity.'},
  {id:'unknown_prior_readiness',label:'UNCERTAINTY',goal:'Prepare a short independent fraction diagnostic; prior readiness is unknown.',instructions:'Choose two fractions with nonzero denominators up to 12 and add without help. Verify the cross-product identity; record clean success or the specific gap honestly.',reason:'Unknown readiness remains uncertainty; it does not justify obligatory remediation.'},
  {id:'unknown_assessment_weight',label:'UNCERTAINTY',goal:'Review fraction addition; assessment weighting is unknown.',instructions:'Choose two fractions with nonzero denominators up to 12 and add unaided. Verify the cross-product identity; retain unknown assessment importance without high-yield claims.',reason:'Unknown weighting is disclosed and cannot establish a blocking workload objection.'},
] as const;
