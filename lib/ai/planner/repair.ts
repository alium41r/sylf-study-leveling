import "server-only";
import { z } from "zod";
import type { LLMAdapter, LLMResponse } from "../providers/types";
import { ExamIntentSchema, ExamStageSchema } from "@/lib/planner/exam-fields";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import {
  scopeTopics,
  topicMinutes,
  type ExamInput,
} from "@/lib/planner/exam-policy";
import type { PlannerSemanticIssue } from "@/lib/planner/semantic";

/**
 * Targeted semantic repair (Addendum §5.2).
 *
 * The repair never regenerates the plan: it receives the flagged items plus the
 * surrounding plan as context and must return exactly those items, by reference.
 * The merged plan is then re-run through structural validation, the HARD-constraint
 * check and the deterministic semantic gate; if anything fails, the whole patch is
 * rejected and the previously validated plan is kept.
 */
export const REPAIR_MAX_ITEMS = 20;
export const REPAIR_MAX_TOKENS = 8192;

const ref = z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/);
export const RepairItemSchema = z.strictObject({
  ref,
  topicRef: ref,
  type: z.enum([...ExamIntentSchema.options, "ASSESS"]),
  stage: ExamStageSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  rationale: z.string().min(1).max(500),
  completionCriteria: z.string().trim().min(12).max(240),
  date: z.string(),
  minutes: z.number().int().min(15).max(240),
  relatedTopicRefs: z.array(ref).max(50),
  dependsOn: z.array(ref).max(60),
  relearnReason: z.string().min(20).max(300).optional(),
});
export const RepairPatchV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(RepairItemSchema).min(1).max(REPAIR_MAX_ITEMS),
});
export type RepairPatchV1 = z.infer<typeof RepairPatchV1Schema>;

export const REPAIR_SYSTEM = `Repair only the flagged items of an Exam study plan. Return JSON only.
Strict shape: {"schemaVersion":1,"items":[{"ref":"i3","topicRef":"t1","type":"PRACTICE","stage":"PRACTICE","title":"...","description":"...","rationale":"...","completionCriteria":"...","date":"YYYY-MM-DD","minutes":30,"relatedTopicRefs":[],"dependsOn":[],"relearnReason":"optional, only when a covered topic is relearned"}]}.
Return exactly one entry for every requested ref, with the same ref and the same topicRef. Do not return any other item, and do not restate the plan.
Change as little as possible: fix the reported problem in the flagged items and keep everything else identical.
completionCriteria must be a concise, observable completion condition (12-240 characters): say what to do and what output finishes it. Never say "fully understand" or any mastery claim. Never invent official question counts, mark schemes, grades, exam-board requirements or paper names.
Keep dates inside the plan horizon and never on an excluded date. Keep every topic's practice, recall and mistake-review requirements intact. Never exceed a required maximum session length. Never add or remove topics. Explain the change in rationale in one sentence. No markdown, no reasoning transcript.`;

export interface RepairOutcome {
  state: "APPLIED" | "REJECTED";
  proposal?: ModelProposalV1;
  reason?: string;
}

/** Items that would actually change, so an empty patch is not a provider call. */
export function repairTargets(
  proposal: ModelProposalV1,
  issues: PlannerSemanticIssue[]
): string[] {
  const refs = new Set(proposal.items.map((item) => item.ref));
  return [
    ...new Set(
      issues
        .flatMap((issue) => issue.affectedItemRefs)
        .filter((itemRef) => refs.has(itemRef))
    ),
  ].slice(0, REPAIR_MAX_ITEMS);
}

function repairPayload(
  input: ExamInput,
  proposal: ModelProposalV1,
  issues: PlannerSemanticIssue[],
  targets: string[]
): string {
  const topics = scopeTopics(input);
  const label = (topicRef: string) =>
    topics.find((topic) => topic.ref === topicRef)?.label ?? "unknown";
  return JSON.stringify({
    examDate: input.examDate,
    horizon: { start: input.startDate, end: input.endDate },
    excludedDates: [
      ...new Set([
        ...input.availability.blockedDates,
        ...(input.exam.allowExamDayStudy ? [] : [input.examDate]),
      ]),
    ],
    maxSessionMinutes: (input.constraints ?? [])
      .filter((constraint) => constraint.kind === "MAX_SESSION_MINUTES")
      .map((constraint) => constraint.value)
      .sort((a, b) => a - b)[0] ?? 240,
    topics: topics.map((topic) => ({
      ref: topic.ref,
      label: topic.label,
      priority: topic.priority ?? "NEUTRAL",
      minimumMinutes: topicMinutes(topic, input.exam.approach === "TRIAGE"),
    })),
    requestedRefs: targets,
    reportedIssues: issues.map((issue) => ({
      issueCode: issue.issueCode,
      severity: issue.severity,
      affectedItemRefs: issue.affectedItemRefs,
      patchInstruction: issue.patchInstruction,
    })),
    context: proposal.items.map((item) => ({
      ref: item.ref,
      topic: label(item.topicRef),
      type: item.type,
      stage: item.stage,
      title: item.title,
      date: item.date,
      minutes: item.minutes,
      dependsOn: item.dependsOn,
      relatedTopicRefs: item.relatedTopicRefs ?? [],
    })),
    itemsToRepair: proposal.items
      .filter((item) => targets.includes(item.ref))
      .map((item) => ({
        ref: item.ref,
        topic: label(item.topicRef),
        type: item.type,
        stage: item.stage,
        title: item.title,
        description: item.description,
        rationale: item.rationale,
        completionCriteria: item.completionCriteria,
        date: item.date,
        minutes: item.minutes,
        dependsOn: item.dependsOn,
        relatedTopicRefs: item.relatedTopicRefs ?? [],
      })),
  });
}

/**
 * A patch may only cover exactly the requested references: no missing entry, no
 * extra one, no duplicate. This is what makes a repair a segment patch rather than
 * a whole-plan regeneration.
 */
export function assertExactTargets(
  returned: string[],
  targets: string[]
): string | null {
  if (new Set(returned).size !== returned.length)
    return "DUPLICATE_REPAIR_REF";
  if (returned.length !== targets.length) return "REPAIR_SET_MISMATCH";
  const targetSet = new Set(targets);
  if (returned.some((ref) => !targetSet.has(ref))) return "REPAIR_OUT_OF_SCOPE";
  return null;
}

/**
 * Merge item-shaped patches (Exam plan items and Roadmap expansion items share the
 * same field set). Unaffected items are copied by identity, so a repair can never
 * rewrite the rest of the plan, and the topic binding is never allowed to move.
 */
export function mergeItemPatch<
  T extends {
    ref: string;
    topicRef: string;
    milestoneRef?: string | null;
    relearnReason?: string;
  },
>(
  items: T[],
  patchItems: T[],
  targets: string[]
): T[] | { error: string } {
  const problem = assertExactTargets(
    patchItems.map((item) => item.ref),
    targets
  );
  if (problem) return { error: problem };
  const originals = new Map(items.map((item) => [item.ref, item]));
  const patched = new Map<string, T>();
  for (const item of patchItems) {
    const original = originals.get(item.ref);
    if (!original) return { error: "REPAIR_UNKNOWN_REF" };
    if (original.topicRef !== item.topicRef) return { error: "REPAIR_TOPIC_CHANGED" };
    const merged: T = { ...item };
    // A plan item's milestone binding is the application's, never the repair's.
    if (original.milestoneRef !== undefined)
      merged.milestoneRef = original.milestoneRef;
    // A repair may omit the justification, but it must not silently drop one the
    // validated plan already carried for a covered topic.
    if (!item.relearnReason && original.relearnReason)
      merged.relearnReason = original.relearnReason;
    patched.set(item.ref, merged);
  }
  return items.map((item) => patched.get(item.ref) ?? item);
}

/**
 * Merge a validated Exam patch back into the proposal.
 */
export function mergeRepair(
  proposal: ModelProposalV1,
  patch: RepairPatchV1,
  targets: string[]
): ModelProposalV1 | { error: string } {
  const items = mergeItemPatch(
    proposal.items as ModelProposalV1["items"][number][],
    patch.items as ModelProposalV1["items"][number][],
    targets
  );
  if ("error" in items) return items;
  return { ...proposal, items };
}

/**
 * One bounded patch call shared by every mode and by both repair shapes. Any
 * transport error, malformed payload or rejected merge keeps the plan that already
 * passed validation; the caller never receives a partially trusted patch.
 */
export async function runPatchCall<P>(args: {
  adapter: LLMAdapter;
  payload: string;
  system: string;
  signal: AbortSignal;
  onUsage?: (response: LLMResponse) => void;
  parse: (parsed: unknown) => P | { error: string };
}): Promise<{ state: "APPLIED"; patch: P } | { state: "REJECTED"; reason: string }> {
  try {
    const result = await args.adapter.generateResponse(
      [{ role: "user", content: args.payload }],
      args.system,
      [],
      {
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: REPAIR_MAX_TOKENS,
        thinking: "disabled",
        signal: args.signal,
        singleAttempt: true,
      }
    );
    if (result.usage) args.onUsage?.(result);
    if (
      result.finishReason === "MAX_TOKENS" ||
      !result.text ||
      result.toolCalls?.length ||
      new TextEncoder().encode(result.text).length > 131072
    )
      return { state: "REJECTED", reason: "REPAIR_UNUSABLE" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      return { state: "REJECTED", reason: "REPAIR_MALFORMED" };
    }
    const patch = args.parse(parsed);
    if (patch && typeof patch === "object" && "error" in patch)
      return { state: "REJECTED", reason: (patch as { error: string }).error };
    if (!patch) return { state: "REJECTED", reason: "REPAIR_SCHEMA" };
    return { state: "APPLIED", patch: patch as P };
  } catch {
    return { state: "REJECTED", reason: "REPAIR_UNAVAILABLE" };
  }
}

/**
 * One bounded Exam repair call.
 */
export async function runRepair(
  adapter: LLMAdapter,
  input: ExamInput,
  proposal: ModelProposalV1,
  issues: PlannerSemanticIssue[],
  signal: AbortSignal,
  onUsage?: (response: LLMResponse) => void
): Promise<RepairOutcome> {
  const targets = repairTargets(proposal, issues);
  if (!targets.length) return { state: "REJECTED", reason: "NO_TARGETS" };
  const outcome = await runPatchCall<ModelProposalV1>({
    adapter,
    payload: repairPayload(input, proposal, issues, targets),
    system: REPAIR_SYSTEM,
    signal,
    onUsage,
    parse: (parsed) => {
      const patch = RepairPatchV1Schema.safeParse(parsed);
      if (!patch.success) return { error: "REPAIR_SCHEMA" };
      const merged = mergeRepair(proposal, patch.data, targets);
      if ("error" in merged) return { error: merged.error };
      return merged;
    },
  });
  return outcome.state === "APPLIED"
    ? { state: "APPLIED", proposal: outcome.patch }
    : { state: "REJECTED", reason: outcome.reason };
}
