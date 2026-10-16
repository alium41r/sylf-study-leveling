import "server-only";
import { z } from "zod";
import type { LLMAdapter, LLMResponse } from "../providers/types";
import type { LLMProviderName } from "../providers/factory";
import { LIMITS } from "@/lib/planner/contracts";
import { validationRepairHint } from "./validation-hints";
import { PlannerError, PlannerValidationError } from "@/lib/planner/errors";
import type {
  CriticState,
  PlannerSemanticIssue,
  PlannerSemanticReview,
} from "@/lib/planner/semantic";
import { resolveCompletionCriteria } from "@/lib/planner/done";

/**
 * The shared bounded pipeline for every Planner Mode.
 *
 * Exam Planner, Course Roadmap generation and selected-period expansion all use
 * exactly this implementation: one bounded generation loop (initial attempt, at
 * most one validation repair, at most one provider fallback), then one bounded
 * semantic stage (one critic, at most one targeted repair, with the repaired plan
 * re-validated before it is accepted). Only the payload, the system prompt, the
 * mode validators and the finding builders differ.
 *
 * There is no nested retry: the total provider-call budget per operation is
 * `GENERATION_CALL_BUDGET + SEMANTIC_CALL_BUDGET`, checked by tests.
 */
export const GENERATION_CALL_BUDGET = 3;
export const SEMANTIC_CALL_BUDGET = 2;
export const PROVIDER_CALL_BUDGET = GENERATION_CALL_BUDGET + SEMANTIC_CALL_BUDGET;
/** Default slice of the operation deadline the semantic stage may use. */
export const SEMANTIC_BUDGET_MS = 30_000;
/** Keep enough of the deadline to seal and deliver an already-valid draft. */
const SEMANTIC_DEADLINE_RESERVE_MS = 5_000;
export const GENERATION_MAX_TOKENS = 14_000;

export type PlannerPipelineStage =
  | "generating"
  | "validating_proposal"
  | "reviewing_plan"
  | "repairing_plan";

export type AdapterFactory = (
  provider: LLMProviderName,
  model: string
) => LLMAdapter;

export type UsageWorkload =
  | "exam"
  | "exam_critic"
  | "exam_repair"
  | "roadmap"
  | "roadmap_critic"
  | "roadmap_repair"
  | "expansion"
  | "expansion_critic"
  | "expansion_repair"
  | "mastery"
  | "mastery_critic"
  | "mastery_repair"
  | "rebalance"
  | "rebalance_critic"
  | "rebalance_repair";

export type PipelineUsageHook = (
  provider: string,
  model: string,
  usage: NonNullable<LLMResponse["usage"]>,
  workload: UsageWorkload
) => void;

/** Reject on abort even when an SDK does not honor cancellation; late values are discarded. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new PlannerError(409, "GENERATION_ABORTED"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new PlannerError(409, "GENERATION_ABORTED"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export interface GenerationCandidate {
  provider: LLMProviderName;
  model: string;
}

export interface GenerationOutcome<P> {
  proposal: P;
  provider: LLMProviderName;
  model: string;
  /** Provider calls actually attempted. */
  calls: number;
}

/**
 * The bounded generation loop. Attempt 0 uses the primary candidate, attempt 1 is
 * the single validation repair on the same provider, and attempt 2 is the sole
 * fallback. A transport failure skips the repair and goes straight to the
 * fallback, so no provider is ever called more than three times.
 */
export async function runBoundedGeneration<P>(args: {
  adapterFor: AdapterFactory;
  candidates: [GenerationCandidate, GenerationCandidate];
  system: string;
  payload: string;
  signal: AbortSignal;
  validate: (parsed: unknown) => P;
  failureCode: string;
  workload: UsageWorkload;
  stage?: (stage: PlannerPipelineStage) => void;
  validationFailure?: (code: string) => void;
  usage?: PipelineUsageHook;
  budget?: number;
}): Promise<GenerationOutcome<P>> {
  const budget = args.budget ?? GENERATION_CALL_BUDGET;
  let calls = 0;
  let repairHint: string | undefined;
  for (let attempt = 0; attempt < budget; attempt++) {
    args.signal.throwIfAborted();
    const candidate = args.candidates[attempt === 2 ? 1 : 0];
    args.stage?.("generating");
    try {
      const adapter = args.adapterFor(candidate.provider, candidate.model);
      calls++;
      const result = await abortable(
        adapter.generateResponse(
          [
            {
              role: "user",
              content:
                args.payload +
                (repairHint
                  ? `\nPrevious proposal was rejected: ${validationRepairHint(repairHint)} Return a corrected complete proposal following ALL constraints.`
                  : ""),
            },
          ],
          args.system,
          [],
          {
            responseFormat: "json_object",
            temperature: 0.2,
            maxTokens: GENERATION_MAX_TOKENS,
            thinking: "disabled",
            signal: args.signal,
            singleAttempt: true, telemetryStage: "planner_generate",
          }
        ),
        args.signal
      );
      if (result.usage)
        args.usage?.(candidate.provider, candidate.model, result.usage, args.workload);
      args.stage?.("validating_proposal");
      if (result.finishReason === "MAX_TOKENS")
        throw new PlannerValidationError("INCOMPLETE_OUTPUT");
      if (
        !result.text ||
        new TextEncoder().encode(result.text).length > LIMITS.payloadBytes ||
        result.toolCalls?.length
      )
        throw new PlannerValidationError("INVALID_JSON_ENVELOPE");
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        throw new PlannerValidationError("INVALID_JSON");
      }
      const proposal = args.validate(parsed);
      args.signal.throwIfAborted();
      return { proposal, provider: candidate.provider, model: candidate.model, calls };
    } catch (error) {
      if (args.signal.aborted) throw new PlannerError(409, "GENERATION_ABORTED");
      const validation =
        error instanceof z.ZodError || error instanceof PlannerValidationError;
      // Codes originate in our validators; never include provider text or schema values.
      repairHint =
        error instanceof PlannerValidationError && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : validation
            ? "SCHEMA_INVALID"
            : undefined;
      if (validation) args.validationFailure?.(repairHint!);
      // Provider failures go straight to the sole fallback.
      if (attempt === 0 && !validation) attempt = 1;
    }
  }
  throw new PlannerError(503, args.failureCode);
}

/**
 * The semantic stage never runs past the operation deadline and never aborts the
 * operation itself: an exhausted semantic budget is recorded, never turned into a
 * failed generation for a plan that already passed the structural gate.
 */
export function semanticSignalFor(
  parent: AbortSignal,
  options: { deadlineAt?: number; budgetMs?: number }
): { signal: AbortSignal; dispose: () => void } | null {
  const now = Date.now();
  const budget = options.budgetMs ?? SEMANTIC_BUDGET_MS;
  const deadline = Math.min(options.deadlineAt ?? now + budget, now + budget);
  const remaining = deadline - now - SEMANTIC_DEADLINE_RESERVE_MS;
  if (parent.aborted || remaining < 1000) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
}

/** Adapter construction can fail (missing credentials); that is unavailable, not fatal. */
export async function runSemanticCall<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

function severityRank(issue: PlannerSemanticIssue): number {
  return issue.severity === "HIGH" ? 0 : issue.severity === "MEDIUM" ? 1 : 2;
}

/** Deterministic and critic findings merged, most severe first, deduplicated. */
export function mergeIssues(
  deterministic: PlannerSemanticIssue[],
  critic: PlannerSemanticIssue[]
): PlannerSemanticIssue[] {
  const unique = new Map<string, PlannerSemanticIssue>();
  for (const issue of [...deterministic, ...critic]) {
    const key = `${issue.issueCode}|${[...issue.affectedItemRefs].sort().join(",")}`;
    if (!unique.has(key)) unique.set(key, issue);
  }
  return [...unique.values()].sort((a, b) => severityRank(a) - severityRank(b));
}

/**
 * Resolves the shared A1 Definition of Done for every actionable item of any mode,
 * so one call site serves Exam, Roadmap expansion and Mastery rather than three.
 */
export function withItemCriteria<
  T extends {
    items: { type: string; minutes: number; completionCriteria?: string }[];
  },
>(value: T): T {
  return {
    ...value,
    items: value.items.map((item) => ({
      ...item,
      completionCriteria: resolveCompletionCriteria(item).text,
    })),
  };
}

export const EMPTY_REVIEW: PlannerSemanticReview = {
  schemaVersion: 1,
  critic: "DISABLED",
  issues: 0,
  repaired: 0,
  deterministicIssues: 0,
  softViolations: 0,
};

/**
 * Resolves the recorded critic state. A repair that was attempted but rejected is
 * `UNREPAIRED`; an unavailable critic is never recorded as a pass.
 */
export function resolveCriticState(args: {
  enabled: boolean;
  requested: CriticState;
  unavailable: boolean;
  repairAttempted: boolean;
  repaired: number;
  reported: number;
  outstanding: number;
}): CriticState {
  if (!args.enabled || args.requested === "DISABLED") return "DISABLED";
  if (args.repairAttempted)
    return args.repaired > 0 ? "ISSUES_REPAIRED" : "UNREPAIRED";
  if (args.outstanding > 0) return "UNREPAIRED";
  if (args.unavailable && args.reported === 0) return "UNAVAILABLE";
  return "PASSED";
}

export interface SemanticStageConfig<P> {
  /** Wired by the server route; absent only in unit tests that inject their own. */
  criticAdapter: AdapterFactory;
  repairAdapter?: AdapterFactory;
  deadlineAt?: number;
  budgetMs?: number;
}

export interface SemanticStageArgs<P> {
  /** The structurally validated plan under review. */
  value: P;
  semantic?: SemanticStageConfig<P>;
  signal: AbortSignal;
  active: { provider: LLMProviderName; model: string };
  /** All deterministic findings, including the caller's soft-preference findings. */
  findings: (value: P) => PlannerSemanticIssue[];
  /** Refs that may be patched, in proposal currency. */
  targets: (value: P, issues: PlannerSemanticIssue[]) => string[];
  critic: (
    adapter: LLMAdapter,
    value: P,
    signal: AbortSignal,
    onUsage: (response: LLMResponse) => void
  ) => Promise<{ state: "PASSED" | "ISSUES" | "UNAVAILABLE"; issues: PlannerSemanticIssue[] }>;
  repair: (
    adapter: LLMAdapter,
    value: P,
    issues: PlannerSemanticIssue[],
    signal: AbortSignal,
    onUsage: (response: LLMResponse) => void
  ) => Promise<{ state: "APPLIED" | "REJECTED"; proposal?: P }>;
  /** Re-runs every deterministic gate. Returns null to reject the repair. */
  accept: (value: P) => P | null;
  /** HIGH-severity findings that must fail the operation closed. */
  fatal: (issues: PlannerSemanticIssue[]) => PlannerSemanticIssue[];
  softViolations: (value: P) => number;
  stage?: (stage: PlannerPipelineStage) => void;
  usage?: PipelineUsageHook;
  workload: { critic: UsageWorkload; repair: UsageWorkload };
  /** Fail-closed code when a fatal finding survives the stage. */
  rejectionCode: string;
}

export interface SemanticStageOutcome<P> {
  value: P;
  review: PlannerSemanticReview;
  semanticCalls: number;
}

export async function runSemanticStage<P>(
  args: SemanticStageArgs<P>
): Promise<SemanticStageOutcome<P>> {
  let value = args.value;
  let deterministic = args.findings(value);
  let criticState: CriticState = args.semantic ? "PASSED" : "DISABLED";
  let reported = deterministic.length;
  let repaired = 0;
  let criticUnavailable = false;
  let repairAttempted = false;
  let semanticCalls = 0;

  if (args.semantic) {
    const gate = semanticSignalFor(args.signal, args.semantic);
    if (!gate) criticState = "DISABLED";
    else {
      args.stage?.("reviewing_plan");
      const criticOutcome = await runSemanticCall(() =>
        args.critic(
          args.semantic!.criticAdapter(args.active.provider, args.active.model),
          value,
          gate.signal,
          (response) =>
            response.usage &&
            args.usage?.(args.active.provider, args.active.model, response.usage, args.workload.critic)
        )
      );
      semanticCalls++;
      if (criticOutcome) {
        const merged = mergeIssues(deterministic, criticOutcome.issues);
        reported = merged.length;
        criticUnavailable = criticOutcome.state === "UNAVAILABLE";
        const targets = args.targets(value, merged);
        if (
          merged.length &&
          targets.length &&
          semanticCalls < SEMANTIC_CALL_BUDGET &&
          !gate.signal.aborted
        ) {
          args.stage?.("repairing_plan");
          repairAttempted = true;
          const patch = await runSemanticCall(() =>
            args.repair(
              (args.semantic!.repairAdapter ?? args.semantic!.criticAdapter)(
                args.active.provider,
                args.active.model
              ),
              value,
              merged,
              gate.signal,
              (response) =>
                response.usage &&
                args.usage?.(args.active.provider, args.active.model, response.usage, args.workload.repair)
            )
          );
          semanticCalls++;
          const accepted =
            patch?.state === "APPLIED" && patch.proposal
              ? args.accept(patch.proposal)
              : null;
          if (accepted) {
            value = accepted;
            repaired = targets.length;
            deterministic = args.findings(value);
            reported = deterministic.length;
          }
        }
      } else {
        criticUnavailable = true;
      }
      gate.dispose();
    }
  }

  // Fail closed: a plan that still cannot tell the student what to do is not shown.
  const outstanding = args.findings(value);
  if (args.fatal(outstanding).length)
    throw new PlannerError(422, args.rejectionCode);

  return {
    value,
    semanticCalls,
    review: {
      schemaVersion: 1,
      critic: resolveCriticState({
        enabled: Boolean(args.semantic),
        requested: criticState,
        unavailable: criticUnavailable,
        repairAttempted,
        repaired,
        reported,
        outstanding: outstanding.length,
      }),
      issues: reported,
      repaired,
      deterministicIssues: outstanding.length,
      softViolations: args.softViolations(value),
    },
  };
}
