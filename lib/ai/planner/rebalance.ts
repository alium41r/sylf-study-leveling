import "server-only";
import { z } from "zod";
import { DEEPSEEK_MODELS, GEMINI_MODELS } from "../config";
import { LLMFactory } from "../providers/factory";
import {
  boundedParse,
  ModelProposalV1Schema,
  type ModelProposalV1,
  type UserInputV1,
} from "@/lib/planner/contracts";
import type { AvailabilitySnapshot } from "@/lib/planner/capacity";
import { validateCapacity } from "@/lib/planner/capacity";
import {
  constraintCapacityInput,
  EXAM_STAGE_INTENTS,
  softPreferenceIssues,
} from "@/lib/planner/exam-policy";
import { MASTERY_STAGE_INTENTS } from "@/lib/planner/mastery-policy";
import {
  deterministicSemanticIssues,
  fatalSemanticIssues,
  proposalSemanticDraft,
  type PlannerSemanticIssue,
  type PlannerSemanticReview,
} from "@/lib/planner/semantic";
import { softConstraintViolations } from "@/lib/planner/constraints";
import { PlannerValidationError } from "@/lib/planner/errors";
import type { FrozenItemView } from "@/lib/planner/rebalance-policy";
import {
  REBALANCE_INPUT_CHANGES,
  REBALANCE_REASON_LABEL,
  type RebalanceReason,
} from "@/lib/planner/rebalance-fields";
import type { ExpansionScope } from "@/lib/planner/expansion-policy";
import {
  examRebalanceValidation,
  masteryRebalanceValidation,
  periodRebalanceValidation,
  roadmapRebalanceValidation,
} from "@/lib/planner/rebalance-mode-rules";
import { retainedIdenticalRefs } from "@/lib/planner/rebalance-scope";
import {
  GENERATION_CALL_BUDGET,
  PROVIDER_CALL_BUDGET,
  SEMANTIC_BUDGET_MS,
  SEMANTIC_CALL_BUDGET,
  runBoundedGeneration,
  runSemanticStage,
  type AdapterFactory,
  type PipelineUsageHook,
  type PlannerPipelineStage,
  type SemanticStageConfig,
} from "./pipeline";
import { criticReportSchema, runCriticCall } from "./critic";
import { assertExactTargets, runPatchCall } from "./repair";
import type { PlanningContext } from "./context";

/**
 * Provider strategy for one user-approved replan.
 *
 * The model receives only what it needs to adjust: the reason, what the user
 * changed, what is already done, and the specific items that may change — each with
 * a plan-local token so a retained item keeps the identity (and the Quest) it has.
 * It never receives a database identifier, never emits a mutation instruction, and
 * never decides what is protected.
 */

export const REBALANCE_TIMEOUT_MS = 90_000;
export const REBALANCE_GENERATION_CALL_BUDGET = GENERATION_CALL_BUDGET;
export const REBALANCE_SEMANTIC_CALL_BUDGET = SEMANTIC_CALL_BUDGET;
export const REBALANCE_PROVIDER_CALL_BUDGET = PROVIDER_CALL_BUDGET;
export const REBALANCE_SEMANTIC_BUDGET_MS = SEMANTIC_BUDGET_MS;

/**
 * The stage→intent table, rendered from the validator's own map.
 *
 * The convergence failures Phase 5 recorded (`INVALID_EXAM_INTENT_STAGE`,
 * `MISSING_MASTERY_STAGE`) were a prompt that paraphrased the contract instead of
 * stating it. Rendering the table the validator actually enforces makes drift
 * impossible: change the rule, and the prompt changes with it.
 */
function stageIntentTable(pairs: Record<string, readonly string[]>): string {
  return Object.entries(pairs)
    .map(([stage, intents]) => `${stage}: ${intents.join(", ")}`)
    .join("; ");
}

const EXAM_STAGE_TABLE = stageIntentTable(EXAM_STAGE_INTENTS);
const MASTERY_STAGE_TABLE = stageIntentTable(MASTERY_STAGE_INTENTS);

const commonHeader = (kind: RebalanceGenerationArgs["kind"]) => `Return JSON only. You are revising ONLY the remaining work of an already-confirmed study plan. This is reconciliation, not a fresh plan.
Hard rules:
- Work listed as already done or in progress is HISTORY. Never repeat it, never re-plan it, and never propose it again. It already satisfies whatever it satisfied.
- Every item you return needs its own ref ("i1","i2",... in your own order). That ref is yours; it is NOT the token you were given.
- To keep an item exactly as it is, copy it unchanged and set its retainRef to the SAME r-token you were given for it. Omitting retainRef means "this is new work". Never use an r-token as an item ref.
- Only the listed replannable items may be replaced or dropped; you may also add new work for what is left.
- An item you keep with retainRef copies the supplied entry's own fields, including its ${kind === "MASTERY" ? 'masteryStage (and it must NOT contain a stage key)' : "stage (and it must not contain a masteryStage key)"}.
- Every entry in alreadyDone is finished history for its unit: it already counts for coverage, recall and practice. Never propose learning (LEARN) or coverage work for a unit whose learning appears there, and never restate a done item as new work — plan only what is genuinely still missing.
- When the payload carries planningContext, use it as SOFT guidance only. A preference (a usual session length, a density, where demanding work goes, how much detail, buffer style) never overrules the confirmed input, a constraint or a floor, and it must never make this revision infeasible. A friction reason tells you why the student rejected an earlier item: TOO_LONG means smaller sessions, TOO_HARD means a prerequisite or a smaller step, UNCLEAR means a clearer completion criterion, NO_MATERIAL means do not simply reschedule it, ALREADY_KNEW means stop redundant learning while keeping useful recall, LOW_VALUE means reduce that work within the allowed floors. Fix the cause instead of moving the same item to another date.
- Keep as much valid remaining work as possible. Prefer keeping and lightly rescheduling over replacing, and replacing over inventing something unrelated.
- Never invent official pass marks, grades, question counts, mark schemes or exam-board requirements.
- No database identifiers, no reward or XP values, no delete instructions, no reasoning transcript, no markdown.`;

const EXAM_REQUIREMENTS = `The whole remaining plan, together with what is already done, must still be a complete exam plan, and every rule the exam planner enforces still applies to the combined result:
- The confirmed scope and the exam date stay as confirmed unless the user changed them.
- Anything not yet finished still needs recall, practice and mistake review, and the plan still ends with its final readiness work.
- A topic with no completed learning yet still needs its coverage step before its consolidation and practice steps, and consolidation must not begin before that coverage exists.
- When there are several topics and at least seven usable dates, keep mixed practice with relatedTopicRefs covering more than one topic.
- Keep any mock exam and final review the confirmed plan had, unless the user changed the plan's shape.
- A unit the user marked high priority keeps its practice floor and its place in the readiness work.
- For every unit, the payload states minimumMinutes: the total the unit must reach across the work that is already done AND the work you propose. completedMinutes is what is already counted, and practiceFloorMinutes is the practice-family total a high-priority unit is owed. Plan enough remaining work to reach them, and never re-plan completed work to get there.
If a topic's learning is already done, plan its remaining recall or practice now - do not re-plan the learning.
The stage and intent of every item must be one of these exact pairs, and nothing else: ${EXAM_STAGE_TABLE}.
Each unit in the payload lists requiredIntents, allowedIntents and forbiddenIntents. Obey them literally: a unit whose forbiddenIntents contains LEARN must have NO LEARN item — give it consolidation, practice or readiness work from its allowedIntents instead. A unit with requiredIntents [LEARN] still needs its coverage step. If you genuinely believe a covered unit needs re-teaching, say why in that item's relearnReason (at least 20 characters) — otherwise the plan is rejected. And never reuse an item's title for new work on the same unit with the same intent as something already in alreadyDone: that is duplicate history, not progress. New work for a unit must be the next thing that unit needs. A unit whose learning is listed in alreadyDone already has its COVERAGE step: give it CONSOLIDATION, PRACTICE or readiness work instead.`;

const MASTERY_REQUIREMENTS = `Every unit must still reach its minimumMinutes across completed stages and this revision, and every unit needs at least one ACTIVE_RECALL and one practice-family item. The progression is fixed: UNDERSTAND → LEARN → ACTIVE_RECALL → PRACTICE → REVIEW_MISTAKES → MASTERY_CHECK. A completed stage is done history and must not be regenerated. The revised plan must still reach practice for every unit and must still end with exactly one MASTERY_CHECK item, last, with masteryStage on EVERY item, retained items included.
A mastery item carries masteryStage and must not contain a stage key at all. The stage and intent of every item must be one of these exact pairs, and nothing else: ${MASTERY_STAGE_TABLE}.
A stage listed in alreadyDone for a unit is done history for that unit: never generate it again, and do not re-teach a unit the payload marks as complete.
Each unit in the payload lists requiredStages, allowedStages and forbiddenStages. Obey them literally: a unit whose forbiddenStages contains UNDERSTAND or LEARN must have NO item with that stage in this revision — it needs recall, practice and the final check, nothing else, and one item is enough to reject the plan. A unit with requiredStages [UNDERSTAND, LEARN] still needs that work.`;
const ROADMAP_STRATEGIC_REQUIREMENTS = `This is the strategic layer: milestones only, never daily items. Periods are fixed by the planner; use the supplied pN tokens and their exact boundaries. Milestones in periods that were already planned are anchors: they are supplied as context and must NOT be proposed again. Propose the remaining milestones so that every supplied period is planned and every unit is covered, using the eligible milestone tokens you were given for milestones you keep.`;
const ROADMAP_PERIOD_REQUIREMENTS = `You are revising the daily work inside ONE already-planned period. Use only that period's topic tokens (t1..tN) and its exact date window. Milestones and other periods are fixed and are not yours to change. Work already done in this period is history: do not repeat it, and plan only what still needs doing.`;

const CRITIC_SYSTEM = `Review one proposed revision of the REMAINING work of an already-confirmed plan, and report only concrete quality problems. Return JSON only.
Strict shape: {"schemaVersion":1,"issues":[{"issueCode":"SEQ_WEAK","affectedItemRefs":["i3"],"severity":"MEDIUM","patchInstruction":"..."}]}.
Return {"schemaVersion":1,"issues":[]} when the revision is acceptable. At most 12 issues, at most 20 refs per issue, patchInstruction 10-300 characters.
issueCode meanings for a revision: SEQ_WEAK the remaining progression is out of order or the plan no longer reaches its final check; TASK_VAGUE an item does not say what being finished looks like; DENSITY_SPIKE a date carries far more remaining work than the rest; REDUNDANT_TOUCH an item repeats work that is already listed as done, or two items serve the same purpose on the same date; PRIORITY_MISS a high-priority unit lost its remaining practice or its place in the final check; ROBOTIC_PATTERN the replacement items read as one repeated template.
Rules: reference only the i-tokens of the proposed revision. Never invent items, units, dates or counts. Never propose changing the confirmed scope, the horizon, or work that is already done. Never ask questions, never restate the plan, no markdown, no reasoning transcript.`;

/** The repair patch is the same strict item shape the modes already use. */
const RepairItemSchema = z.strictObject({
  ref: z.string().min(1).max(60),
  topicRef: z.string().min(1).max(60),
  relatedTopicRefs: z.array(z.string().min(1).max(60)).max(50).optional(),
  type: z.string().min(1).max(40),
  stage: z.string().min(1).max(40).optional(),
  masteryStage: z.string().min(1).max(40).optional(),
  retainRef: z.string().regex(/^r[1-9][0-9]*$/).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  rationale: z.string().min(1).max(500),
  completionCriteria: z.string().trim().min(12).max(240),
  date: z.string(),
  minutes: z.number().int().min(15).max(240),
  dependsOn: z.array(z.string().min(1).max(60)).max(60),
});
const RepairPatchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(RepairItemSchema).min(1).max(20),
});

const REPAIR_SYSTEM = `Repair only the flagged items of a proposed revision of remaining work. Return JSON only.
Strict shape: {"schemaVersion":1,"items":[{"ref":"i3","topicRef":"t1","type":"PRACTICE","title":"...","description":"...","rationale":"...","completionCriteria":"...","date":"YYYY-MM-DD","minutes":30,"dependsOn":[]}]}.
Return exactly one entry for every requested ref, with the same ref and topicRef, and carry back the item's retainRef, stage and masteryStage when it had them. Do not return other items and do not restate the plan.
Change as little as possible. Never re-plan work that is already done, never exceed the supplied per-date capacity, and keep the plan's final check last.`;

export interface RebalanceGenerationArgs {
  /** The normalized replan input, carrying `rebalance` metadata. */
  input: UserInputV1;
  baseDraft: ModelProposalV1["mode"] extends never ? never : unknown;
  availability: AvailabilitySnapshot;
  reason: RebalanceReason;
  inputChanges: string[];
  /** Eligible items with their plan-local retention tokens. */
  eligible: {
    ref: string;
    itemKey: string;
    title: string;
    /** The unit's scope ref (`tN`), for the validator and the payload alike. */
    topicRef: string;
    topicLabel: string;
    type: string;
    stage: string | null;
    /** Mastery only: the stage this item's mode reads. */
    masteryStage: string | null;
    date: string;
    minutes: number;
  }[];
  /**
   * The confirmed unit list. A replan rewrites only part of a plan, so the model
   * cannot infer the full scope from the work that is left — and the validator
   * requires the returned topics to mirror it exactly.
   */
  units: {
    ref: string;
    label: string;
    /**
     * The student's own statement about this unit, or `null` when they said
     * nothing. Null is never "not covered" and never "weak": the unit keeps the
     * standard provision and still needs its learning planned.
     */
    covered?: boolean | null;
    /** Intents this unit still requires (Exam). */
    requiredIntents?: string[];
    /** Intents this unit must not receive, because the rule refuses them (Exam). */
    forbiddenIntents?: string[];
    /** Every intent this unit may use (Exam). */
    allowedIntents?: string[];
    /** Mastery stages this unit still requires. */
    requiredStages?: string[];
    /** Mastery stages this unit must not receive. */
    forbiddenStages?: string[];
    /** Every mastery stage this unit may use. */
    allowedStages?: string[];
    /** Mastery only: covered with high confidence, so re-teaching it is refused. */
    secure?: boolean;
    /** Total this unit must reach across completed work and this revision. */
    minimumMinutes?: number;
    /** Practice-family minutes a high-priority unit is owed. */
    practiceFloorMinutes?: number;
    /** Minutes already logged against this unit by completed work. */
    completedMinutes?: number;
  }[];
  /**
   * A2/A3 context for this replan, bounded and content-free.
   *
   * `preferences` are SOFT learned planning preferences (session length, density,
   * placement, detail, buffer style) and never override the confirmed input or a HARD
   * constraint. `friction` is why the student rejected earlier items, by closed reason
   * code and count — never a note, never a title. Both are absent when there is
   * nothing to say, so a plan with no history produces exactly the payload it did
   * before A3 existed.
   */
  planningContext?: PlanningContext;
  /**
   * Frozen history, compact: what the plan already achieved.
   *
   * `stage` and `masteryStage` are separate fields because the modes read different
   * ones. A Mastery stage collapsed into `stage` reaches the Mastery validator as an
   * item with no stage at all, which refuses an honest remaining-stages replan for a
   * reason that has nothing to do with the model's output.
   */
  frozen: {
    /** The unit's scope ref (`tN`): the validator's own currency. */
    topicRef: string;
    /** Units this history also counts for, in the same currency. */
    relatedTopicRefs?: string[];
    topicLabel: string;
    /** The item's own title, so history reads as the work it was. */
    title?: string;
    stage: string | null;
    masteryStage: string | null;
    type: string;
    date: string;
    minutes: number;
    status: string;
  }[];
  /** Strategic roadmap context. */
  roadmap?: {
    periods: { ref: string; title: string; startDate: string; endDate: string }[];
    milestones: {
      ref: string;
      title: string;
      date: string;
      periodRef: string;
      topicRefs: string[];
      frozen: boolean;
    }[];
    topics: { ref: string; label: string }[];
  };
  /** Period context for a Roadmap period revision. */
  period?: {
    scope: ExpansionScope;
    days: { date: string; remainingMinutes: number }[];
  };
  /** Mode requirement text is chosen here, not supplied by a caller. */
  kind: "EXAM" | "MASTERY" | "ROADMAP_STRATEGIC" | "ROADMAP_PERIOD";
}

function requirementsFor(kind: RebalanceGenerationArgs["kind"]): string {
  if (kind === "EXAM") return EXAM_REQUIREMENTS;
  if (kind === "MASTERY") return MASTERY_REQUIREMENTS;
  if (kind === "ROADMAP_STRATEGIC") return ROADMAP_STRATEGIC_REQUIREMENTS;
  return ROADMAP_PERIOD_REQUIREMENTS;
}

function systemFor(kind: RebalanceGenerationArgs["kind"]): string {
  const mode =
    kind === "EXAM" ? "EXAM" : kind === "MASTERY" ? "MASTERY" : "ROADMAP";
  const shape =
    kind === "ROADMAP_STRATEGIC"
      ? `Strict shape: {schemaVersion:1,mode:"ROADMAP",outcome:"exact confirmed objective",assumptions:string[],warnings:string[],topics:[{ref:"t1",title:"exact confirmed unit label",parentRef:null}],milestones:[{ref:"m1",title:"...",date:"YYYY-MM-DD",periodRef:"p1",outcome:"concise completion target",topicRefs:["t1"],effortMinutes:600,checkpoint:"short check",dependsOn:[],retainRef:"r2"}],items:[]}.
items MUST be empty. assumptions and warnings are required string arrays (empty is fine). Every milestone needs a unique ref (m1,m2,...); retainRef is required on a milestone you are keeping and omitted on a new one. A period with capacity is never left unplanned, and one milestone per period is the norm.`
      : kind === "ROADMAP_PERIOD"
        ? `Strict shape: {schemaVersion:1,mode:"ROADMAP",outcome:"exact confirmed objective",assumptions:string[],warnings:string[],topics:[{ref:"t1",title:"exact period unit label",parentRef:null}],milestones:[],items:[{ref:"i1",topicRef:"t1",relatedTopicRefs:[],milestoneRef:null,dependsOn:[],type:"PRACTICE",stage:"PRACTICE",title:"...",description:"...",rationale:"...",completionCriteria:"...",date:"YYYY-MM-DD",minutes:30,retainRef:"r1"}]}.
Every listed key is required on every item. assumptions and warnings are required string arrays (empty is fine). milestones MUST be empty. Use only the period's supplied topic tokens and dates inside its window, and the allowed stage/intent pairs (COVERAGE:LEARN; CONSOLIDATION:RECALL,REVIEW; PRACTICE:PRACTICE,TIMED_PRACTICE,MISTAKE_REVIEW).`
        : `Strict shape: {schemaVersion:1,mode:"${mode}",${kind === "MASTERY" ? 'focus:"the payload focus value, copied character for character"' : 'examDate:"the payload examDate value, copied exactly"'},assumptions:string[],warnings:string[],topics:[{ref:"t1",title:"exact confirmed label",parentRef:null}],milestones:[],items:[{ref:"i1",topicRef:"t1",relatedTopicRefs:[],milestoneRef:null,dependsOn:[],type:"PRACTICE",${kind === "MASTERY" ? 'masteryStage:"PRACTICE",' : 'stage:"PRACTICE",'}title:"...",description:"...",rationale:"...",completionCriteria:"...",date:"YYYY-MM-DD",minutes:30,retainRef:"r1"}]}.
Every listed key is required on every item, including milestoneRef (null) and dependsOn. assumptions and warnings are required arrays of strings and may be empty; do not omit them and do not add keys that are not shown.${kind === "MASTERY" ? " A Mastery item uses masteryStage and must NOT contain a stage key at all." : ""} Set retainRef to the r-token on an item you keep and to null on new work.${kind === "MASTERY" ? ' Every item needs masteryStage, and the revision must still end with exactly one MASTERY_CHECK item, last.' : ""}`;
  return `${commonHeader(kind)}
The mode of your JSON MUST be exactly "${mode}". The payload lists the confirmed units: return one topic object for EVERY supplied unit, in the supplied order, with the exact supplied label and ref — including units you are not planning in this revision. Never invent, rename or omit a unit, and never renumber the refs.
A returned topic object contains ONLY ref, title and parentRef. The extra unit fields in the payload (minimumMinutes, practiceFloorMinutes, completedMinutes) are inputs for you to plan against — never copy them into your JSON, and never add any other key anywhere.
${requirementsFor(kind)}
${shape}`;
}

/** The bounded payload: only the affected scope, never the whole history. */
export function rebalancePayload(args: RebalanceGenerationArgs): string {
  const { input } = args;
  const constraintLabel: { label: string; strength: string; value: number }[] = [];
  for (const change of args.inputChanges)
    if (REBALANCE_INPUT_CHANGES.includes(change as never))
      constraintLabel.push({
        label: change,
        strength: "USER_CHANGED",
        value: 0,
      });
  return JSON.stringify({
    reason: args.reason,
    reasonLabel: REBALANCE_REASON_LABEL[args.reason],
    userChanged: args.inputChanges,
    mode: input.mode,
    // The plan's own objective and focus, so the model can echo them verbatim: the
    // validators compare these to the confirmed input character for character.
    outcome: input.title,
    focus: input.mode === "MASTERY" ? input.focus : null,
    examDate: input.mode === "EXAM" ? input.endDate : null,
    startDate: input.startDate,
    endDate: input.endDate,
    availability: input.availability,
    constraints: (input.constraints ?? []).map((constraint) => ({
      kind: constraint.kind,
      strength: constraint.strength,
      value: constraint.value,
    })),
    units: args.units,
    alreadyDone: args.frozen.slice(0, 60).map((frozen) => ({
      topicRef: frozen.topicRef,
      topicLabel: frozen.topicLabel,
      title: frozen.title ?? frozen.topicLabel,
      type: frozen.type,
      stage: frozen.stage,
      masteryStage: frozen.masteryStage,
      date: frozen.date,
      minutes: frozen.minutes,
      status: frozen.status,
    })),
    replannable: args.eligible.slice(0, 60),
    planningContext:
      args.planningContext &&
      (args.planningContext.preferences.length || args.planningContext.friction.length)
        ? {
            // SOFT by construction: the confirmed input above is authoritative, and a
            // preference can never make this revision infeasible.
            preferences: args.planningContext.preferences.map((preference) => ({
              type: preference.type,
              value: preference.value,
              source: preference.source,
            })),
            friction: args.planningContext.friction.map((entry) => ({
              reasonCode: entry.reasonCode,
              count: entry.count,
            })),
          }
        : null,
    roadmap: args.roadmap ?? null,
    period: args.period
      ? {
          milestoneTitle: args.period.scope.milestoneTitle,
          period: args.period.scope.period,
          topics: args.period.scope.topics.map((topic) => ({
            ref: topic.ref,
            label: topic.label,
          })),
          days: args.period.days.slice(0, 90),
        }
      : null,
    unchangedChanges: constraintLabel.length ? constraintLabel : null,
  });
}

function rebalanceCriticPayload(
  value: ModelProposalV1,
  args: RebalanceGenerationArgs
): string {
  const items =
    value.mode === "ROADMAP"
      ? value.milestones.map((milestone) => ({
          ref: milestone.ref,
          title: milestone.title,
          date: milestone.date,
          outcome: milestone.outcome,
        }))
      : value.items.map((item) => ({
          ref: item.ref,
          title: item.title,
          description: item.description,
          date: item.date,
          minutes: item.minutes,
          type: item.type,
          stage: item.stage ?? item.masteryStage ?? null,
        }));
  return JSON.stringify({
    reason: args.reason,
    alreadyDone: args.frozen.slice(0, 60).map((frozen) => ({
      topicRef: frozen.topicRef,
      topicLabel: frozen.topicLabel,
      title: frozen.title ?? frozen.topicLabel,
      type: frozen.type,
      stage: frozen.stage,
      masteryStage: frozen.masteryStage,
      date: frozen.date,
      minutes: frozen.minutes,
      status: frozen.status,
    })),
    replannable: args.eligible.map((item) => ({
      ref: item.ref,
      title: item.title,
      date: item.date,
      type: item.type,
    })),
    proposed: items.slice(0, 60),
  });
}

export interface RebalanceGenerationResult {
  proposal: ModelProposalV1;
  review: PlannerSemanticReview;
  calls: number;
}

export interface RebalanceGenerationHooks {
  adapter?: AdapterFactory;
  stage?: (stage: PlannerPipelineStage) => void;
  validationFailure?: (code: string) => void;
  usage?: PipelineUsageHook;
  semantic?: SemanticStageConfig<ModelProposalV1>;
  /** Frozen milestones the validator must respect (strategic roadmap). */
  frozenMilestones?: Parameters<typeof roadmapRebalanceValidation>[3];
}

/** The mode's own deterministic rules, applied to the proposed revision. */
function validateProposal(
  args: RebalanceGenerationArgs,
  hooks: RebalanceGenerationHooks,
  parsed: unknown
): ModelProposalV1 {
  const proposal = boundedParse(ModelProposalV1Schema, parsed);
  if (proposal.mode !== args.input.mode)
    throw new PlannerValidationError("REBALANCE_MODE_MISMATCH");
  // A retained item keeps its existing Quest, so it is not charged against capacity
  // a second time; the proposal's `retainRef` tokens say which ones those are.
  const retainedRefs = new Set(
    proposal.items
      .filter((item) => {
        // `null` and an omitted key mean the same thing: this item is new work.
        if (item.retainRef === null || item.retainRef === undefined) return false;
        const token = args.eligible.find(
          (entry) => entry.ref === item.retainRef
        );
        if (!token) return false;
        return (
          token.title === item.title &&
          token.date === item.date &&
          token.minutes === item.minutes &&
          token.type === item.type
        );
      })
      .map((item) => item.ref)
  );
  /**
   * Frozen history in the validator's currency. A replan is validated against
   * (completed work + proposed remaining work), which is the whole point of an
   * execution-aware view: history satisfies what it already proved, so the model is
   * never asked to recreate it.
   */
  const frozen: FrozenItemView[] = args.frozen.map((item, index) => ({
    key: `frozen-${index}`,
    topicRef: item.topicRef,
    relatedTopicRefs: item.relatedTopicRefs ?? [],
    type: item.type,
    // Both stage fields travel: Exam and the Roadmap read `stage`, Mastery reads
    // `masteryStage`, and a view that dropped one of them would make history fail a
    // rule it never actually broke.
    stage: item.stage ?? undefined,
    masteryStage: item.masteryStage ?? undefined,
    title: item.title ?? item.topicLabel,
    description: "Completed before this revision.",
    date: item.date,
    minutes: item.minutes,
  }));
  if (args.kind === "ROADMAP_PERIOD" && args.period)
    periodRebalanceValidation(
      args.input,
      args.availability,
      args.period.scope,
      proposal.items.map((item) => ({
        ref: item.ref,
        topicRef: item.topicRef,
        type: item.type,
        title: item.title,
        date: item.date,
        minutes: item.minutes,
      })),
      frozen
    );
  else if (args.kind === "ROADMAP_STRATEGIC")
    roadmapRebalanceValidation(
      args.input,
      proposal,
      args.availability,
      hooks.frozenMilestones ?? []
    );
  else if (args.kind === "MASTERY")
    masteryRebalanceValidation(
      args.input,
      proposal,
      args.availability,
      frozen,
      retainedRefs
    );
  else
    examRebalanceValidation(
      args.input,
      proposal,
      args.availability,
      frozen,
      retainedRefs
    );
  return proposal;
}

export async function generateRebalance(
  args: RebalanceGenerationArgs,
  hooks: RebalanceGenerationHooks = {},
  signal = new AbortController().signal
): Promise<RebalanceGenerationResult> {
  const adapterFor: AdapterFactory = (provider, model) =>
    (hooks.adapter ?? LLMFactory.getAdapter)(provider, model);
  const generation = await runBoundedGeneration<ModelProposalV1>({
    adapterFor,
    candidates: [
      { provider: "deepseek", model: DEEPSEEK_MODELS.planner },
      { provider: "gemini", model: GEMINI_MODELS.flash },
    ],
    system: systemFor(args.kind),
    payload: rebalancePayload(args),
    signal,
    workload: "rebalance",
    failureCode: "REBALANCE_GENERATION_FAILED",
    stage: hooks.stage,
    validationFailure: hooks.validationFailure,
    usage: hooks.usage,
    validate: (parsed) => validateProposal(args, hooks, parsed),
  });
  const stage = await runSemanticStage<ModelProposalV1>({
    value: generation.proposal,
    semantic: hooks.semantic,
    signal,
    active: { provider: generation.provider, model: generation.model },
    findings: (value) => [
      ...deterministicSemanticIssues(proposalSemanticDraft(value)),
      ...softPreferenceIssues(args.input, value.items),
    ],
    targets: (value, issues) =>
      [...new Set(issues.flatMap((issue) => issue.affectedItemRefs))].slice(0, 20),
    critic: (adapter, value, criticSignal, onUsage) =>
      runCriticCall({
        adapter,
        payload: rebalanceCriticPayload(value, args),
        system: CRITIC_SYSTEM,
        allowedRefs: new Set(
          value.mode === "ROADMAP"
            ? value.milestones.map((milestone) => milestone.ref)
            : value.items.map((item) => item.ref)
        ),
        reportSchema: criticReportSchema(
          value.mode === "ROADMAP" ? /^m[1-9][0-9]*$/ : /^i[1-9][0-9]*$/
        ),
        signal: criticSignal,
        onUsage,
      }),
    repair: async (adapter, value, issues, repairSignal, onUsage) => {
      const targets = [...new Set(issues.flatMap((issue) => issue.affectedItemRefs))]
        .filter((ref) =>
          value.mode === "ROADMAP"
            ? value.milestones.some((milestone) => milestone.ref === ref)
            : value.items.some((item) => item.ref === ref)
        )
        .slice(0, 20);
      if (!targets.length || value.mode === "ROADMAP")
        return { state: "REJECTED" as const };
      const outcome = await runPatchCall<ModelProposalV1>({
        adapter,
        payload: JSON.stringify({
          requestedRefs: targets,
          reportedIssues: issues.map((issue) => ({
            issueCode: issue.issueCode,
            severity: issue.severity,
            affectedItemRefs: issue.affectedItemRefs,
            patchInstruction: issue.patchInstruction,
          })),
          replannable: args.eligible,
          alreadyDone: args.frozen.map((frozen) => ({
      topicRef: frozen.topicRef,
      topicLabel: frozen.topicLabel,
      title: frozen.title ?? frozen.topicLabel,
      type: frozen.type,
      stage: frozen.stage,
      masteryStage: frozen.masteryStage,
      date: frozen.date,
      minutes: frozen.minutes,
      status: frozen.status,
    })),
          itemsToRepair: value.items
            .filter((item) => targets.includes(item.ref))
            .map((item) => ({ ...item })),
        }),
        system: REPAIR_SYSTEM,
        signal: repairSignal,
        onUsage,
        parse: (parsed) => {
          const patch = RepairPatchSchema.safeParse(parsed);
          if (!patch.success) return { error: "REPAIR_SCHEMA" };
          const problem = assertExactTargets(
            patch.data.items.map((item) => item.ref),
            targets
          );
          if (problem) return { error: problem };
          const byRef = new Map(patch.data.items.map((item) => [item.ref, item]));
          const merged = {
            ...value,
            items: value.items.map((item) => {
              const replacement = byRef.get(item.ref);
              if (!replacement) return item;
              if (replacement.topicRef !== item.topicRef)
                return item;
              return { ...item, ...replacement } as typeof item;
            }),
          };
          return merged;
        },
      });
      if (outcome.state !== "APPLIED") return { state: "REJECTED" as const };
      // A repair is accepted only if the revised remaining work still passes the
      // mode's own rules and the shared deterministic gate.
      try {
        validateProposal(args, hooks, outcome.patch);
      } catch {
        return { state: "REJECTED" as const };
      }
      return { state: "APPLIED" as const, proposal: outcome.patch };
    },
    accept: (value) => {
      try {
        validateProposal(args, hooks, value);
        // Capacity is checked on the proposed remaining work only: history already
        // consumed its own capacity.
        if (!validateCapacity(
          constraintCapacityInput(args.input),
          args.availability,
          value.items
        ).feasible)
          return null;
        return fatalSemanticIssues(
          deterministicSemanticIssues(proposalSemanticDraft(value))
        ).length
          ? null
          : value;
      } catch {
        return null;
      }
    },
    fatal: fatalSemanticIssues,
    softViolations: (value) =>
      softConstraintViolations(args.input, value.items).length,
    stage: hooks.stage,
    usage: hooks.usage,
    workload: { critic: "rebalance_critic", repair: "rebalance_repair" },
    rejectionCode: "REBALANCE_SEMANTIC_REJECTED",
  });
  return {
    proposal: stage.value,
    review: stage.review,
    calls: generation.calls + stage.semanticCalls,
  };
}

export type { PlannerSemanticIssue };
