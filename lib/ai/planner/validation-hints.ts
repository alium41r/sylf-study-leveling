/**
 * What a rejected proposal should do differently, per validation code.
 *
 * The bounded retry already tells the model WHICH rule it broke
 * (`Previous proposal was rejected (CODE)`) and then asks for a corrected plan. For a
 * code whose name is not self-explanatory, that is a blind re-roll: the model knows it
 * failed but not what to change, which is how the same violation survives two attempts
 * and is then recorded as a "convergence problem".
 *
 * Every instruction here is a translation of a rule the validators already enforce —
 * never a relaxation of one. A code with no entry still gets the generic hint, so an
 * unmapped code is never worse off than before.
 */
export const PLANNER_REPAIR_INSTRUCTIONS: Record<string, string> = {
  // --- Replanning -----------------------------------------------------------------
  UNNECESSARY_RELEARNING:
    "Remove every LEARN item belonging to a unit the payload flags secure:true (already covered with high confidence). A secure unit gets recall, practice and the final check only.",
  REBALANCE_DUPLICATES_HISTORY:
    "You reused a title AND intent that an item in alreadyDone already has for the same unit. Replace each such item with the next thing that unit actually needs, or drop it — do not restate finished work.",
  REBALANCE_TOUCHES_HISTORY:
    "The plan touched work that is already completed or in progress. Change nothing about alreadyDone and propose only remaining work.",
  REPLAN_STALE_EXECUTION:
    "The plan's execution moved while you were answering. Return the remaining work only, leaving every alreadyDone item exactly as supplied.",
  MISSING_MASTERY_STAGE:
    "Give EVERY item a masteryStage, including each item you keep with retainRef, and do not put a stage key on a mastery item.",
  INVALID_MASTERY_INTENT_STAGE:
    "Use only the listed masteryStage/intent pairs for each item.",
  MISSING_MASTERY_CHECK:
    "End the plan with exactly one MASTERY_CHECK item (intent ASSESS) dated last.",
  MISSING_LEARN:
    "A unit that is not covered still needs a LEARN item before its recall and practice.",
  MISSING_UNDERSTAND:
    "A unit that is not secure still needs its UNDERSTAND (orientation) item.",
  // --- Exam -----------------------------------------------------------------------
  INVALID_EXAM_INTENT_STAGE:
    "Use only the listed stage/intent pairs: COVERAGE takes LEARN; CONSOLIDATION takes RECALL or REVIEW; PRACTICE takes PRACTICE, TIMED_PRACTICE or MISTAKE_REVIEW; EXAM_READINESS takes MOCK_EXAM, FINAL_REVIEW or TIMED_PRACTICE.",
  MISSING_COVERAGE:
    "Give every unit that is not covered its own LEARN item.",
  MISSING_SPACED_RECALL:
    "Add a recall item that comes after the earlier work for a unit, so recall is spaced rather than clustered.",
  MISSING_FINAL_REVIEW:
    "Keep a FINAL_REVIEW item within the last three days before the exam date.",
  MISSING_MOCK_EXAM:
    "Keep the mock exam the confirmed plan had.",
  MISSING_MIXED_PRACTICE:
    "Keep at least one practice item that references more than one unit through relatedTopicRefs.",
  INSUFFICIENT_PRIORITY_ALLOCATION:
    "A high-priority unit is below its practice floor: give it more practice-family minutes.",
  // --- Shared shape ---------------------------------------------------------------
  CONFIRMED_SCOPE_MISMATCH:
    "Return one topic object per supplied unit, in the supplied order, with the exact supplied label and ref — no renames, no omissions, no extra units.",
  MODE_PAYLOAD_MISMATCH:
    "Echo the plan's own objective field (outcome, focus or examDate) from the payload character for character.",
  INFEASIBLE_CAPACITY:
    "The requested work does not fit the remaining capacity. Reduce it to what the usable days can hold without going below any stated floor.",
  INVALID_JSON:
    "Return a single JSON object and nothing else — no prose, no markdown fences.",
  SCHEMA_INVALID:
    "Return the exact shape described, with every required key present and no extra keys anywhere.",
  EMPTY_EXPANSION:
    "The expansion must contain at least one actionable item for the selected period.",
  MISSING_PERIOD_TOPIC:
    "Account for every unit of the period: each one needs at least one item, or completed history covering it.",
  OUTSIDE_MILESTONE_PERIOD:
    "Keep every item inside the selected period's own date window.",
  OUTSIDE_HORIZON:
    "Keep every item inside the plan's start and end dates.",
  PAST_DATE:
    "Do not schedule work before today. Start the remaining plan from today.",
  DEPENDENCY_DATE:
    "An item depended on another that comes later. Order dependent work after what it depends on.",
  DEPENDENCY_CYCLE:
    "Remove the circular dependsOn chain between items.",
};

/** The hint text handed to the single bounded retry. */
export function validationRepairHint(code: string): string {
  const instruction = PLANNER_REPAIR_INSTRUCTIONS[code];
  return instruction ? `${code}. ${instruction}` : code;
}
