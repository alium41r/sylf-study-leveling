import { PlannerValidationError } from "./errors";
import { z } from "zod";
import { dateOrdinal, isDateKey } from "./dates";
import { ExamDetailsSchema, ExamIntentSchema, examMetadata } from "./exam-fields";
import {
  ROADMAP_LIMITS,
  RoadmapDetailsSchema,
  RoadmapExpansionSchema,
  RoadmapPeriodSchema,
  roadmapMilestoneDraftMetadata,
  roadmapMilestoneMetadata,
} from "./roadmap-fields";
import { MasteryDetailsSchema, masteryMetadata } from "./mastery-fields";
import { retrievalMetadata } from "./retrieval";
import { assertCoreSufficient, isStretch, plannerRoleMetadata } from "./planner-role";
import {
  RebalanceInputChangeSchema,
  RebalanceMetadataSchema,
  RebalanceReasonSchema,
  RebalanceScopeSchema,
  rebalanceMetadata,
} from "./rebalance-fields";
import { validateExamDraft } from "./exam-policy";
import { validateRoadmapDraft } from "./roadmap-policy";
import { validateMasteryDraft } from "./mastery-policy";
import type { FrozenItemView } from "./rebalance-policy";
import { PlannerConstraintsSchema, validateHardConstraints } from "./constraints";
import { completionCriteriaIssue } from "./done";
import {
  deterministicSemanticIssues,
  fatalSemanticIssues,
  roadmapSemanticDraft,
  PlannerSemanticReviewSchema,
} from "./semantic";

export const LIMITS = {
  payloadBytes: 262144,
  inputBytes: 32768,
  /**
   * Items one stored revision may hold. Raised from 60 in the final phase, on measurement.
   *
   * 60 was not derived from anything: it was the number the payload could obviously afford,
   * and a three-month plan read as "many Quests" long before it reached it. The measure that
   * settled it — recorded in the Phase 5 report — is a serialised item at ~340 bytes against a
   * 256 KiB payload ceiling, so 60 items occupied about 20 KiB, roughly a thirteenth of the
   * budget, and the old number could have refused a legitimate long plan for no technical
   * reason at all. 200 items is about 68 KiB, a quarter of the ceiling, and leaves the whole
   * confirmation, edit and rebalance path comfortably inside it while a three-month plan at
   * ordinary session lengths stays well below the bound.
   *
   * The model's own per-response budget is a *different* number (`proposedItems` below): a
   * stored plan may be large, but one generation is still one model answer, and asking for 200
   * items in a single JSON response is how a plan gets truncated mid-object instead of written.
   */
  items: 200,
  /** Items one model proposal may contain. Bounded by what one answer can carry, not by storage. */
  proposedItems: 90,
  topics: 50,
  milestones: 52,
  horizonDays: 365,
  /** Course Roadmap carries a whole syllabus, so it gets its own bounded envelope. */
  roadmapInputBytes: ROADMAP_LIMITS.inputBytes,
  roadmapTopics: ROADMAP_LIMITS.topics,
  roadmapMilestones: ROADMAP_LIMITS.milestones,
  roadmapPeriods: ROADMAP_LIMITS.periods,
} as const;
export const ModeSchema = z.enum(["EXAM", "ROADMAP", "MASTERY"]);
export const DateKeySchema = z.string().refine(isDateKey, "Invalid calendar date");
export const KeySchema = z.string().uuid();
export const OperationKeySchema = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1).max(200);
const description = z.string().max(2000);
const completionCriteria = z.string().trim().min(12).max(240);
const availability = z.strictObject({
  dailyMinutes: z.array(z.number().int().min(0).max(720)).length(7),
  recoveryPercent: z.number().int().min(0).max(50),
  blockedDates: z.array(DateKeySchema).max(366),
});
const inputBase = {
  schemaVersion: z.literal(1), title, scope: z.string().trim().min(1).max(20000),
  startDate: DateKeySchema, endDate: DateKeySchema, availability,
  /** Optional so every sealed Phase 1/2 snapshot keeps its original digest. */
  constraints: PlannerConstraintsSchema.optional(),
  /**
   * Present only on a REBALANCE revision: why the replan ran and what it was based
   * on. Optional, so every Phase 1–4 snapshot keeps its original digest.
   */
  rebalance: RebalanceMetadataSchema.optional(),
};
export const UserInputV1Schema = z.discriminatedUnion("mode", [
  z.strictObject({ ...inputBase, mode: z.literal("EXAM"), examDate: DateKeySchema, exam: ExamDetailsSchema.optional() }),
  /** `outcome` is the roadmap objective; `roadmap` is optional so Phase 1/2 payloads stay readable. */
  z.strictObject({ ...inputBase, mode: z.literal("ROADMAP"), outcome: title, roadmap: RoadmapDetailsSchema.optional() }),
  /** `focus` is the unit title; `mastery` is optional so Phase 1 payloads stay readable. */
  z.strictObject({ ...inputBase, mode: z.literal("MASTERY"), focus: title, mastery: MasteryDetailsSchema.optional() }),
]).superRefine((v, ctx) => {
  if (!isDateKey(v.startDate) || !isDateKey(v.endDate)) return;
  const horizon = dateOrdinal(v.endDate) - dateOrdinal(v.startDate);
  if (horizon < 0 || horizon > LIMITS.horizonDays) ctx.addIssue({ code: "custom", message: "Invalid horizon" });
  if (v.mode === "EXAM" && v.examDate !== v.endDate) ctx.addIssue({ code: "custom", message: "Exam date must end the horizon" });
  if (new Set(v.availability.blockedDates).size !== v.availability.blockedDates.length) ctx.addIssue({ code: "custom", message: "Duplicate blocked dates" });
  if (v.availability.blockedDates.some(d => d < v.startDate || d > v.endDate)) ctx.addIssue({ code: "custom", message: "Blocked date outside horizon" });
});
export type UserInputV1 = z.infer<typeof UserInputV1Schema>;

const ref = z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/);
const itemType = z.enum([...ExamIntentSchema.options, "ASSESS"]);
const itemContent = { ...plannerRoleMetadata, type: itemType, title, description, date: DateKeySchema, minutes: z.number().int().min(15).max(240), completionCriteria: completionCriteria.optional(), ...examMetadata, ...masteryMetadata, ...rebalanceMetadata, ...retrievalMetadata };
const notes = { assumptions: z.array(z.string().max(500)).max(20), warnings: z.array(z.string().max(500)).max(20) };
const proposalItem = z.strictObject({ ref, topicRef: ref, relatedTopicRefs: z.array(ref).max(50).optional(), milestoneRef: ref.nullable(), dependsOn: z.array(ref).max(60), ...itemContent });
const proposalMilestone = z.strictObject({ ref, title, date: DateKeySchema });
const proposalBase = {
  schemaVersion: z.literal(1), ...notes,
  topics: z.array(z.strictObject({ ref, title, parentRef: ref.nullable() })).min(1).max(LIMITS.topics),
  milestones: z.array(proposalMilestone).max(LIMITS.milestones),
  items: z.array(proposalItem).min(1).max(LIMITS.proposedItems),
};
export const ModelProposalV1Schema = z.discriminatedUnion("mode", [
  z.strictObject({ ...proposalBase, mode: z.literal("EXAM"), examDate: DateKeySchema }),
  /**
   * A strategic roadmap proposal carries milestones and NO items; an expansion
   * proposal carries items and restates its milestone. Both are shaped by the
   * Roadmap validator, so the shared schema stays permissive here.
   */
  z.strictObject({
    ...proposalBase,
    mode: z.literal("ROADMAP"),
    outcome: title,
    topics: z.array(z.strictObject({ ref, title, parentRef: ref.nullable() })).min(1).max(LIMITS.roadmapTopics),
    milestones: z.array(z.strictObject({ ref, title, date: DateKeySchema, ...roadmapMilestoneMetadata })).max(LIMITS.roadmapMilestones),
    items: z.array(proposalItem).max(LIMITS.proposedItems),
  }),
  z.strictObject({ ...proposalBase, mode: z.literal("MASTERY"), focus: title }),
]);
export type ModelProposalV1 = z.infer<typeof ModelProposalV1Schema>;
const draftItem = z.strictObject({
  key: KeySchema, topicKey: KeySchema, relatedTopicKeys: z.array(KeySchema).max(50).optional(), milestoneKey: KeySchema.nullable(), dependsOn: z.array(KeySchema).max(60), locked: z.boolean().optional(), removed: z.boolean().optional(), ...itemContent,
  /**
   * The released item this one replaces, when it arrived through a re-offer.
   *
   * On the *draft* item only — deliberately not on `proposalItem`, which is the model's own
   * shape. Lineage is a server fact: the model may not claim that a task of its invention
   * stands in for a decision the student made, and a field it cannot address is the only way
   * to guarantee that. Optional, so every draft sealed before this existed parses unchanged.
   */
  replacementForReleasedItemKey: KeySchema.optional(),
});
const draftMilestone = z.strictObject({ key: KeySchema, title, date: DateKeySchema });
/**
 * The sealed, user-reviewable outcome of one replan: what changes, by how much, and
 * proof that no frozen history is affected. Stored in the REBALANCE draft itself so
 * review and confirmation read one immutable object.
 */
const rebalanceDraft = {
  rebalance: z
    .strictObject({
      reasonCode: RebalanceReasonSchema,
      inputChanges: z.array(RebalanceInputChangeSchema).max(5),
      baseRevisionId: KeySchema,
      scope: RebalanceScopeSchema,
      snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
      counts: z.strictObject({
        RETAIN: z.number().int().min(0),
        MOVE: z.number().int().min(0),
        REPLACE: z.number().int().min(0),
        REMOVE: z.number().int().min(0),
        ADD: z.number().int().min(0),
      }),
      frozen: z.number().int().min(0),
      /** Completed or active work this proposal would affect. Must be zero. */
      affectedHistory: z.number().int().min(0),
      entries: z
        .array(
          z.strictObject({
            change: z.enum(["RETAIN", "MOVE", "REPLACE", "REMOVE", "ADD"]),
            key: KeySchema.nullable(),
            supersedesKey: KeySchema.nullable(),
            title,
            stage: z.string().max(40).nullable(),
            topicTitle: z.string().max(200).nullable(),
            fromDate: DateKeySchema.nullable(),
            toDate: DateKeySchema.nullable(),
            fromMinutes: z.number().int().min(0).max(240).nullable(),
            toMinutes: z.number().int().min(0).max(240).nullable(),
            reason: z.string().trim().min(1).max(200),
          })
        )
        .max(LIMITS.items),
    })
    .optional(),
};
const draftBase = {
  schemaVersion: z.literal(1), ...notes, ...rebalanceDraft,
  semanticReview: PlannerSemanticReviewSchema.optional(),
  topics: z.array(z.strictObject({ key: KeySchema, title, parentKey: KeySchema.nullable(), scopeRef: ref.optional() })).min(1).max(LIMITS.topics),
  milestones: z.array(draftMilestone).max(LIMITS.milestones),
  items: z.array(draftItem).min(1).max(LIMITS.items),
};
export const ValidatedDraftV1Schema = z.discriminatedUnion("mode", [
  z.strictObject({ ...draftBase, mode: z.literal("EXAM"), examDate: DateKeySchema }),
  z.strictObject({
    ...draftBase,
    mode: z.literal("ROADMAP"),
    outcome: title,
    topics: z.array(z.strictObject({ key: KeySchema, title, parentKey: KeySchema.nullable(), scopeRef: ref.optional() })).min(1).max(LIMITS.roadmapTopics),
    milestones: z.array(z.strictObject({ key: KeySchema, title, date: DateKeySchema, ...roadmapMilestoneDraftMetadata })).max(LIMITS.roadmapMilestones),
    items: z.array(draftItem).max(LIMITS.items),
    periods: z.array(RoadmapPeriodSchema).max(LIMITS.roadmapPeriods.WEEK).optional(),
    expansion: RoadmapExpansionSchema.optional(),
  }),
  z.strictObject({ ...draftBase, mode: z.literal("MASTERY"), focus: title }),
]);
export type ValidatedDraftV1 = z.infer<typeof ValidatedDraftV1Schema>;
export type PlannerItem = ValidatedDraftV1["items"][number];

/**
 * Items a revision still expects to be executed. Removal is the only exclusion, so
 * this is shared by every actionable mode rather than re-derived per mode.
 */
export function activeItems(items: PlannerItem[]): PlannerItem[] {
  return items.filter((item) => !item.removed);
}

export function boundedParse<T>(schema: z.ZodType<T>, value: unknown, bytes: number = LIMITS.payloadBytes): T {
  const json = JSON.stringify(value);
  if (!json || new TextEncoder().encode(json).byteLength > bytes) throw new PlannerValidationError("PAYLOAD_TOO_LARGE");
  return schema.parse(value);
}
function assertGraph(nodes: { key: string; refs: string[] }[], maxDepth = 60) {
  const map = new Map(nodes.map(n => [n.key, n.refs]));
  if (map.size !== nodes.length) throw new PlannerValidationError("DUPLICATE_KEY");
  const visit = (key: string, path: Set<string>) => {
    if (!map.has(key)) throw new PlannerValidationError("UNKNOWN_REFERENCE");
    if (path.has(key)) throw new PlannerValidationError("DEPENDENCY_CYCLE");
    if (path.size >= maxDepth) throw new PlannerValidationError("DEPTH_LIMIT");
    const next = new Set(path).add(key);
    const refs = map.get(key)!;
    if (new Set(refs).size !== refs.length) throw new PlannerValidationError("DUPLICATE_REFERENCE");
    for (const r of refs) visit(r, next);
  };
  // Memoize depth, avoiding exponential walks through a dense DAG.
  const done = new Map<string, number>();
  const depth = (key: string, path: Set<string>): number => {
    if (done.has(key)) return done.get(key)!;
    if (!map.has(key) || path.has(key)) { visit(key, path); throw new PlannerValidationError("INVALID_GRAPH"); }
    const refs = map.get(key)!;
    if (new Set(refs).size !== refs.length) throw new PlannerValidationError("DUPLICATE_REFERENCE");
    const result = 1 + Math.max(0, ...refs.map(r => depth(r, new Set(path).add(key))));
    if (result > maxDepth) throw new PlannerValidationError("DEPTH_LIMIT");
    done.set(key, result); return result;
  };
  for (const n of nodes) depth(n.key, new Set());
}
export function validateDraft(
  input: UserInputV1,
  raw: unknown,
  /**
   * Frozen executed history (a replan only). It satisfies the mode's educational
   * requirements without being part of the stored revision, so a remaining-work
   * draft is held to the same standard as a whole plan.
   */
  frozen: FrozenItemView[] = [],
  frozenMilestones: Parameters<typeof validateRoadmapDraft>[2] = [],
  /**
   * Codes whose *recommendation*-class rules are waived for this call.
   *
   * This is not a way to skip validation. It exists for one caller — the flexible
   * draft-edit assessment in `lib/planner/server/flexibility.ts` — which discovers
   * exactly which recommendations a student's edit trades away and, only once the
   * student has acknowledged them, re-runs this same untouched validator with those
   * codes suppressed so the draft can be sealed. Every `BLOCKER` in
   * `DRAFT_RULE_AUDIT` is refused there before it could reach this parameter, and the
   * HARD constraint check below never consults it: `validateHardConstraints` is called
   * with no awareness of this set, so no acknowledgement can reach it.
   */
  options: { suppress?: ReadonlySet<string> } = {}
): ValidatedDraftV1 {
  const suppress = options.suppress;
  const draft = boundedParse(ValidatedDraftV1Schema, raw);
  if (draft.mode !== input.mode) throw new PlannerValidationError("MODE_MISMATCH");
  const modeField = input.mode === "EXAM" ? "examDate" : input.mode === "ROADMAP" ? "outcome" : "focus";
  if (Reflect.get(draft, modeField) !== Reflect.get(input, modeField)) throw new PlannerValidationError("MODE_PAYLOAD_MISMATCH");
  assertGraph(draft.topics.map(t => ({ key: t.key, refs: t.parentKey ? [t.parentKey] : [] })), 4);
  assertGraph(draft.items.map(i => ({ key: i.key, refs: i.dependsOn })));
  const topics = new Set(draft.topics.map(t => t.key));
  const milestones = new Set(draft.milestones.map(m => m.key));
  const allKeys = [...topics, ...milestones, ...draft.items.map(i => i.key)];
  if (new Set(allKeys).size !== draft.topics.length + draft.milestones.length + draft.items.length) throw new PlannerValidationError("DUPLICATE_KEY");
  const items = new Map(draft.items.map(i => [i.key, i]));
  for (const i of draft.items) {
    if (!topics.has(i.topicKey) || (i.milestoneKey && !milestones.has(i.milestoneKey))) throw new PlannerValidationError("UNKNOWN_REFERENCE");
    if (i.relatedTopicKeys?.some(k => !topics.has(k)) || new Set(i.relatedTopicKeys).size !== (i.relatedTopicKeys?.length ?? 0)) throw new PlannerValidationError("UNKNOWN_REFERENCE");
    if (i.dependsOn.some(k => items.get(k)!.date > i.date)) throw new PlannerValidationError("DEPENDENCY_DATE");
  }
  for (const i of [...draft.items, ...draft.milestones]) {
    if (i.date < input.startDate || i.date > input.endDate) throw new PlannerValidationError("OUTSIDE_HORIZON");
  }
  // HARD constraints are enforced here, before any draft can be displayed, and
  // again after a semantic repair and at confirmation. Nothing the generator or
  // the critic produces can skip this check.
  validateHardConstraints(input, draft.items.filter(i => !i.removed));
  // Every stored completion condition must be bounded and observable. The
  // generator's text is resolved through the default before it is stored, so an
  // invalid value here means a later writer tried to introduce one.
  for (const item of draft.items)
    if (item.completionCriteria !== undefined && completionCriteriaIssue(item.completionCriteria, item) !== null)
      throw new PlannerValidationError("INVALID_COMPLETION_CRITERIA");
  // The deterministic half of the semantic gate always runs: a plan whose items
  // do not tell the user what to do cannot be displayed or confirmed.
  // Roadmap milestones take the place of plan items in the semantic gate, so one
  // deterministic rule set serves both modes. A metadata-free ROADMAP payload (the
  // shared contract fixture) keeps the generic item view.
  const roadmapMilestones =
    draft.mode === "ROADMAP" &&
    !draft.expansion &&
    input.mode === "ROADMAP" &&
    Boolean(input.roadmap);
  const semanticView = roadmapMilestones
    ? roadmapSemanticDraft(draft)
    : draft;
  const fatal = fatalSemanticIssues(deterministicSemanticIssues(semanticView));
  if (fatal.length) throw new PlannerValidationError(`SEMANTIC_${fatal[0].issueCode}`);
  validateExamDraft(input, draft, frozen, suppress);
  validateRoadmapDraft(input, draft, frozenMilestones, suppress);
  validateMasteryDraft(input, draft, frozen, suppress);
  // Stretch is optional by construction, so the plan a student may skip has to be a
  // complete plan on its own: the same mode rules are run again with every STRETCH
  // item removed, and a draft whose CORE subset fails them cannot be stored.
  assertCoreSufficient(draft.items, () => {
    const coreOnly = {
      ...draft,
      items: draft.items.filter((item) => !isStretch(item)),
    } as ValidatedDraftV1;
    validateExamDraft(input, coreOnly, frozen, suppress);
    validateRoadmapDraft(input, coreOnly, frozenMilestones, suppress);
    validateMasteryDraft(input, coreOnly, frozen, suppress);
  });
  return draft;
}

export const CommitSchema = z.strictObject({
  schemaVersion: z.literal(1), revisionId: KeySchema, digest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().nonnegative(), idempotencyKey: OperationKeySchema,
  /**
   * A strategic roadmap confirms with zero selected items (it creates no Quests),
   * an expansion confirms its segment, and Exam still selects every active item.
   * The mode-specific rule lives in the confirmation service.
   */
  selectedItemKeys: z.array(KeySchema).max(LIMITS.items).refine(v => new Set(v).size === v.length),
  createGoal: z.boolean(),
  acknowledgeExclusions: z.boolean().optional(),
});
export type CommitRequest = z.infer<typeof CommitSchema>;
export const EditSchema = z.strictObject({
  schemaVersion: z.literal(1), baseRevisionId: KeySchema, expectedVersion: z.number().int().nonnegative(), operationKey: OperationKeySchema,
  edits: z.array(z.strictObject({ key: KeySchema, title: title.optional(), description: description.optional(), completionCriteria: completionCriteria.optional(), date: DateKeySchema.optional(), minutes: z.number().int().min(15).max(240).optional(), locked: z.boolean().optional(), removed: z.boolean().optional() })).max(LIMITS.items).refine(v => new Set(v.map(e => e.key)).size === v.length),
  itemOrder: z.array(KeySchema).min(1).max(LIMITS.items).optional(),
  /** Roadmap structure edits; an EDIT revision is always appended, never mutated. */
  milestoneEdits: z.array(z.strictObject({ key: KeySchema, title: title.optional(), outcome: z.string().trim().min(12).max(240).optional(), periodKey: KeySchema.optional(), topicKeys: z.array(KeySchema).min(1).max(LIMITS.roadmapTopics).optional(), effortMinutes: z.number().int().min(0).max(ROADMAP_LIMITS.maxEffortMinutes).optional(), checkpoint: z.string().trim().min(3).max(200).optional(), locked: z.boolean().optional(), removed: z.boolean().optional() })).max(LIMITS.roadmapMilestones).refine(v => new Set(v.map(e => e.key)).size === v.length).optional(),
  milestoneOrder: z.array(KeySchema).min(1).max(LIMITS.roadmapMilestones).optional(),
  /**
   * Flexible editing: the tradeoffs the student has accepted for *this* edit.
   *
   * The field's *presence* is what switches the request into assessment mode — the
   * server runs the ordinary validators, reports what the edit gives up, and refuses
   * until every finding has been answered (see `lib/planner/server/flexibility.ts`).
   * An empty array therefore means "tell me what I would be accepting", which is how
   * the surface learns what to show. Values are `ACK:<CODE>` for a code audited as a
   * recommendation; anything else is refused. They are never persisted as a
   * preference: they are part of this operation's hash and expire with it.
   */
  acknowledgements: z.array(z.string().trim().min(4).max(80)).max(24).optional(),
});
export const ArchiveSchema = z.strictObject({ schemaVersion: z.literal(1), expectedVersion: z.number().int().nonnegative() });
export interface CommitReceipt { schemaVersion: 1; planId: string; revisionId: string; digest: string; version: number; goalId: number | null; items: { itemKey: string; questId: number }[]; committedAt: string }
