import "server-only";
import { preparednessForModel } from "@/lib/planner/preparedness";
import { z } from "zod";
import type { LLMAdapter, LLMResponse } from "../providers/types";
import {
  SemanticIssueCodeSchema,
  SemanticSeveritySchema,
  type PlannerSemanticIssue,
} from "@/lib/planner/semantic";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import {
  scopeTopics,
  topicMinutes,
  type ExamInput,
} from "@/lib/planner/exam-policy";
import { CONSTRAINT_KIND_LABEL } from "@/lib/planner/constraints";
import { resolveCompletionCriteria } from "@/lib/planner/done";

/**
 * The semantic plan critic (Addendum §5).
 *
 * Deliberately separate from the generator: its own prompt, its own structured
 * schema and its own token budget. Even when the same provider and model are used
 * the two contracts never mix, so the review cannot simply reproduce the
 * generator's mistakes.
 *
 * The critic may only reference items that exist in the plan it was given. It
 * cannot change hard constraints, invent persisted identifiers, rewrite the
 * confirmed scope, or write database state — and a malformed or unavailable
 * response is reported as `UNAVAILABLE` rather than partially trusted.
 */
export const CRITIC_MAX_ISSUES = 12;
export const CRITIC_MAX_REFS = 20;
export const CRITIC_MAX_TOKENS = 4096;

const itemRef = z.string().regex(/^i[1-9][0-9]*$/);
export const CriticIssueSchema = z.strictObject({
  issueCode: SemanticIssueCodeSchema,
  affectedItemRefs: z.array(itemRef).min(1).max(CRITIC_MAX_REFS),
  severity: SemanticSeveritySchema,
  patchInstruction: z.string().trim().min(10).max(300),
});
export const CriticReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  issues: z.array(CriticIssueSchema).max(CRITIC_MAX_ISSUES),
});
export type CriticReportV1 = z.infer<typeof CriticReportV1Schema>;

/**
 * The same report shape with a mode-specific reference pattern, so a Roadmap critic
 * speaks in `mN` milestone tokens while Exam keeps `iN` item tokens. One schema
 * factory, no second contract.
 */
export function criticReportSchema(refPattern: RegExp) {
  return z.strictObject({
    schemaVersion: z.literal(1),
    issues: z
      .array(
        z.strictObject({
          issueCode: SemanticIssueCodeSchema,
          affectedItemRefs: z
            .array(z.string().regex(refPattern))
            .min(1)
            .max(CRITIC_MAX_REFS),
          severity: SemanticSeveritySchema,
          patchInstruction: z.string().trim().min(10).max(300),
        })
      )
      .max(CRITIC_MAX_ISSUES),
  });
}

export const CRITIC_SYSTEM = `Review one generated Exam study plan and report only concrete quality problems. Return JSON only.
Strict shape: {"schemaVersion":1,"issues":[{"issueCode":"SEQ_WEAK","affectedItemRefs":["i1"],"severity":"MEDIUM","patchInstruction":"..."}]}.
Return {"schemaVersion":1,"issues":[]} when the plan is acceptable. At most ${CRITIC_MAX_ISSUES} issues, at most ${CRITIC_MAX_REFS} item refs per issue, patchInstruction 10-300 characters, imperative and specific to the referenced items.
issueCode meanings: SEQ_WEAK prerequisite or conceptual progression is awkward; TASK_VAGUE the student cannot tell what concrete work to perform; DENSITY_SPIKE a date is within its minute limit but carries an unrealistic share of the work; REDUNDANT_TOUCH two items repeat the same learning purpose without justification; PRIORITY_MISS the plan does not reflect a topic the user marked as higher priority; ROBOTIC_PATTERN wording or task pattern is unnaturally repetitive.
Rules: reference only the i-tokens present in the supplied plan, exactly as given. Never invent items, dates, topics, identifiers or counts. Never propose changing a required (hard) constraint, the exam date, the confirmed topics or the plan horizon. Never ask questions. Do not restate the plan. No markdown and no reasoning transcript.`;

export interface CriticOutcome {
  state: "PASSED" | "ISSUES" | "UNAVAILABLE";
  issues: PlannerSemanticIssue[];
  /** True when the provider responded but its payload could not be trusted. */
  malformed?: boolean;
}

/** Compact, bounded review payload. Contains only the plan the user confirmed. */
export function criticPayload(
  input: ExamInput,
  proposal: ModelProposalV1
): string {
  const topics = scopeTopics(input);
  const label = (ref: string) =>
    topics.find((topic) => topic.ref === ref)?.label ?? "unknown";
  return JSON.stringify({
    examDate: input.examDate,
    startDate: input.startDate,
    approach: input.exam.approach,
    format: input.exam.format,
    preferredMinutes: input.exam.preferredMinutes,
    topics: topics.map((topic) => ({
      ref: topic.ref,
      label: topic.label,
      // Unstated preparedness reaches the critic as null plus an explicit marker,
      // never as a fabricated rating it might otherwise reason about.
      ...preparednessForModel(topic),
      priority: topic.priority ?? "NEUTRAL",
      minimumMinutes: topicMinutes(topic, input.exam.approach === "TRIAGE"),
      practiceMinutes: proposal.items
        .filter(
          (item) =>
            item.topicRef === topic.ref &&
            ["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"].includes(item.type)
        )
        .reduce((sum, item) => sum + item.minutes, 0),
    })),
    constraints: (input.constraints ?? []).map((constraint) => ({
      label: CONSTRAINT_KIND_LABEL[constraint.kind],
      strength: constraint.strength,
      value: constraint.value,
    })),
    items: proposal.items.map((item) => ({
      ref: item.ref,
      topic: label(item.topicRef),
      stage: item.stage,
      type: item.type,
      title: item.title,
      description: item.description,
      completionCriteria: resolveCompletionCriteria({
        type: item.type,
        minutes: item.minutes,
        completionCriteria: item.completionCriteria,
      }).text,
      date: item.date,
      minutes: item.minutes,
      relatedTopics: (item.relatedTopicRefs ?? []).map(label),
      dependsOn: item.dependsOn,
    })),
  });
}

export function abstainedReport(): CriticReportV1 {
  return { schemaVersion: 1, issues: [] };
}

/**
 * Runs one bounded critic call. Any transport error, abort, empty body, oversized
 * body, malformed JSON, schema violation or unknown reference is reported as
 * `UNAVAILABLE` — the plan is never partly trusted and the caller never crashes.
 *
 * Every mode uses this one implementation: only the payload, the system prompt and
 * the set of legitimate references differ.
 */
export async function runCriticCall(args: {
  adapter: LLMAdapter;
  payload: string;
  system: string;
  allowedRefs: Set<string>;
  signal: AbortSignal;
  onUsage?: (response: LLMResponse) => void;
  reportSchema?: ReturnType<typeof criticReportSchema> | typeof CriticReportV1Schema;
}): Promise<CriticOutcome> {
  try {
    const result = await args.adapter.generateResponse(
      [{ role: "user", content: args.payload }],
      args.system,
      [],
      {
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: CRITIC_MAX_TOKENS,
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
      new TextEncoder().encode(result.text).length > 32768
    )
      return { state: "UNAVAILABLE", issues: [], malformed: true };
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      return { state: "UNAVAILABLE", issues: [], malformed: true };
    }
    const schema = args.reportSchema ?? CriticReportV1Schema;
    const report = schema.safeParse(parsed);
    if (!report.success)
      return { state: "UNAVAILABLE", issues: [], malformed: true };
    // An issue that names something the plan does not contain is not trustworthy.
    for (const issue of report.data.issues)
      if (issue.affectedItemRefs.some((ref) => !args.allowedRefs.has(ref)))
        return { state: "UNAVAILABLE", issues: [], malformed: true };
    const issues: PlannerSemanticIssue[] = report.data.issues.map((issue) => ({
      issueCode: issue.issueCode,
      affectedItemRefs: [...new Set(issue.affectedItemRefs)],
      severity: issue.severity,
      patchInstruction: issue.patchInstruction,
    }));
    return { state: issues.length ? "ISSUES" : "PASSED", issues };
  } catch {
    return { state: "UNAVAILABLE", issues: [] };
  }
}

/** Exam Planner critic: review the generated day-level plan. */
export async function runCritic(
  adapter: LLMAdapter,
  input: ExamInput,
  proposal: ModelProposalV1,
  signal: AbortSignal,
  onUsage?: (response: LLMResponse) => void
): Promise<CriticOutcome> {
  return runCriticCall({
    adapter,
    payload: criticPayload(input, proposal),
    system: CRITIC_SYSTEM,
    allowedRefs: new Set(proposal.items.map((item) => item.ref)),
    signal,
    onUsage,
  });
}
