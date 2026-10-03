import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  generateExam,
  EXAM_TIMEOUT_MS,
  type ExamStrategyHooks,
} from "@/lib/ai/planner/exam";
import {
  ROADMAP_TIMEOUT_MS,
  generateRoadmap,
} from "@/lib/ai/planner/roadmap";
import {
  MASTERY_TIMEOUT_MS,
  generateMastery,
} from "@/lib/ai/planner/mastery";
import type { PlannerSemanticReview } from "@/lib/planner/semantic";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import { logAiUsage } from "@/lib/ai/usage-logger";
import {
  boundedParse,
  LIMITS,
  OperationKeySchema,
  UserInputV1Schema,
  type UserInputV1,
} from "../contracts";
import { examInput, examFeasibility } from "../exam-policy";
import { roadmapFeasibility, roadmapInput } from "../roadmap-policy";
import { masteryFeasibility, masteryInput } from "../mastery-policy";
import { softConstraintStatus } from "../constraints";
import { setupScopeTopics } from "../smart-setup";
import { ROADMAP_LIMITS } from "../roadmap-fields";
import { MASTERY_LIMITS } from "../mastery-fields";
import type { AvailabilitySnapshot } from "../capacity";
import { PlannerError } from "../errors";
import { plannerTelemetry } from "../telemetry";
import { digest, loadAvailability, transaction } from "./core";
import { activePreferencesForUser } from "./preferences";
import type { PlanningContext } from "@/lib/ai/planner/context";
import { abortRunning, registerRunning } from "./running";
import { createPlanShell } from "./revisions";
import {
  beginOperation,
  finishOperation,
  recoverOperation,
  stopOperation,
} from "./operations";

export const GenerateRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requestKey: OperationKeySchema,
  input: UserInputV1Schema,
});
// Optimization for same-process cancellation only; durable operation state is
// authoritative and lives in `server/running.ts` (shared with expansions).

/**
 * Content-free summary of the A1 planning inputs a user actually supplied.
 * Counts only: no labels, answers, criteria or plan content.
 */
export function smartSetupUsage(input: UserInputV1) {
  const constraints = input.constraints ?? [];
  const topics = setupScopeTopics(input) as unknown as {
    priority?: string;
    sizeSignal?: string;
  }[];
  const priorityTopics = topics.filter(
    (topic) => (topic.priority ?? "NEUTRAL") !== "NEUTRAL"
  ).length;
  const sizedTopics = topics.filter((topic) => Boolean(topic.sizeSignal)).length;
  return {
    answered:
      constraints.some((constraint) => Boolean(constraint.reasonCode)) ||
      priorityTopics > 0 ||
      sizedTopics > 0,
    priorityTopics,
    sizedTopics,
    constraints: constraints.length,
  };
}
/**
 * The mode-specific parts of the ONE generation implementation. Exam and Roadmap
 * differ in their input assertion, shell binding, preflight, strategy and telemetry
 * names; the SSE stream, single-worker map, adapter cache, operation lifecycle, quota
 * reservation, cancellation and draft sealing are shared verbatim.
 */
interface GenerationModePipeline {
  mode: "EXAM" | "ROADMAP" | "MASTERY";
  timeoutMs: number;
  subjectId: (input: UserInputV1) => number | null;
  /** Content-free counters for the first progress event. */
  counts: (input: UserInputV1) => { topics?: number; periods?: number };
  preflight: (
    input: UserInputV1,
    availability: AvailabilitySnapshot
  ) => { status: string; reasons?: string[] } | null;
  infeasibleCode: string;
  strategy: (
    input: UserInputV1,
    availability: AvailabilitySnapshot,
    signal: AbortSignal,
    hooks: ExamStrategyHooks
  ) => Promise<{ proposal: ModelProposalV1; review: PlannerSemanticReview; calls: number }>;
  telemetry: {
    started: Parameters<typeof plannerTelemetry>[0];
    completed: Parameters<typeof plannerTelemetry>[0];
    failed: Parameters<typeof plannerTelemetry>[0];
  };
  draftCounts: (proposal: ModelProposalV1) => {
    items?: number;
    milestones?: number;
  };
}

function modePipeline(input: UserInputV1): GenerationModePipeline {
  if (input.mode === "MASTERY" && input.mastery) {
    const mastery = masteryInput(input);
    return {
      mode: "MASTERY",
      timeoutMs: MASTERY_TIMEOUT_MS,
      subjectId: () => mastery.mastery.subjectId,
      counts: () => ({ topics: mastery.mastery.topics.length }),
      preflight: (_input, availability) =>
        masteryFeasibility(mastery, availability),
      infeasibleCode: "MASTERY_INFEASIBLE",
      strategy: (raw, availability, signal, hooks) =>
        generateMastery(mastery, availability, signal, {
          adapter: hooks.adapter,
          stage: hooks.stage,
          validationFailure: hooks.validationFailure,
          usage: hooks.usage,
          semantic: hooks.semantic,
          planningContext: hooks.planningContext,
        }),
      telemetry: {
        started: "mastery_generation_started",
        completed: "mastery_generation_completed",
        failed: "mastery_generation_failed",
      },
      draftCounts: (proposal) => ({ items: proposal.items.length }),
    };
  }
  if (input.mode === "ROADMAP" && input.roadmap) {
    const roadmap = roadmapInput(input);
    return {
      mode: "ROADMAP",
      timeoutMs: ROADMAP_TIMEOUT_MS,
      subjectId: () => roadmap.roadmap.subjectId,
      counts: () => ({
        topics: roadmap.roadmap.topics.length,
        periods: roadmapFeasibility(roadmap, EMPTY_AVAILABILITY).periods,
      }),
      preflight: (_input, availability) => roadmapFeasibility(roadmap, availability),
      infeasibleCode: "ROADMAP_INFEASIBLE",
      strategy: (raw, availability, signal, hooks) =>
        generateRoadmap(roadmap, availability, signal, {
          adapter: hooks.adapter,
          stage: hooks.stage,
          validationFailure: hooks.validationFailure,
          usage: hooks.usage,
          semantic: hooks.semantic,
          planningContext: hooks.planningContext,
        }),
      telemetry: {
        started: "roadmap_generation_started",
        completed: "roadmap_generation_completed",
        failed: "roadmap_generation_failed",
      },
      draftCounts: (proposal) => ({ milestones: proposal.milestones.length }),
    };
  }
  const exam = examInput(input) as unknown as void;
  void exam;
  const examInputValue = input as Extract<UserInputV1, { mode: "EXAM" }> & {
    exam: NonNullable<Extract<UserInputV1, { mode: "EXAM" }>["exam"]>;
  };
  return {
    mode: "EXAM",
    timeoutMs: EXAM_TIMEOUT_MS,
    subjectId: () => examInputValue.exam.subjectId,
    counts: () => ({ topics: examInputValue.exam.topics.length }),
    preflight: (raw, availability) => examFeasibility(raw as never, availability),
    infeasibleCode: "EXAM_INFEASIBLE",
    strategy: (raw, availability, signal, hooks) =>
      generateExam(raw as never, availability, signal, {
        adapter: hooks.adapter,
        stage: hooks.stage,
        validationFailure: hooks.validationFailure,
        usage: hooks.usage,
        semantic: hooks.semantic,
        planningContext: hooks.planningContext,
      }),
    telemetry: {
      started: "exam_generation_started",
      completed: "exam_generation_completed",
      failed: "exam_generation_failed",
    },
    draftCounts: (proposal) => ({ items: proposal.items.length }),
  };
}

/** Placeholder snapshot used only for a pure period count, never for validation. */
const EMPTY_AVAILABILITY: AvailabilitySnapshot = {
  schemaVersion: 1,
  timezone: "UTC",
  restDays: [],
  floatingDates: [],
  existingWork: [],
  lineageFingerprint: "",
};

export async function recoverGeneration(
  userId: number,
  key: string,
  action?: "CANCEL" | "RECOVER_EXPIRED"
) {
  OperationKeySchema.parse(key);
  const plan = await prisma.plannerPlan.findUnique({
    where: { userId_creationKey: { userId, creationKey: key } },
  });
  if (!plan) throw new PlannerError(404, "NOT_FOUND");
  if (action === "CANCEL") {
    abortRunning(plan.id);
    await stopOperation(userId, plan.id, key, "CANCELLED");
    plannerTelemetry("generation_cancelled", { planId: plan.id });
  }
  const operation = await recoverOperation(
    userId,
    plan.id,
    key,
    action === "RECOVER_EXPIRED"
  );
  plannerTelemetry("operation_recovered", {
    planId: plan.id,
    operationId: operation.id,
  });
  return { planId: plan.id, version: plan.version, operation };
}
export async function generationResponse(
  userId: number,
  raw: unknown,
  requestSignal: AbortSignal,
  started = Date.now()
): Promise<Response> {
  const body = boundedParse(GenerateRequestSchema, raw);
  // The input envelope is mode-specific: a whole syllabus needs more room than one
  // exam scope, and Exam keeps its existing 32 KiB bound unchanged.
  const requestMode = (body.input as { mode?: string } | null)?.mode;
  const inputEnvelope =
    requestMode === "ROADMAP"
      ? LIMITS.roadmapInputBytes
      : requestMode === "MASTERY"
        ? MASTERY_LIMITS.inputBytes
        : LIMITS.inputBytes;
  const input = boundedParse(UserInputV1Schema, body.input, inputEnvelope);
  const pipeline = modePipeline(input);
  requestSignal.throwIfAborted();
  const plan = await createPlanShell(
    userId,
    {
      mode: pipeline.mode,
      title: input.title,
      subjectId: pipeline.subjectId(input),
      goalId: null,
      creationKey: body.requestKey,
    },
    digest(input)
  );
  const prior = await prisma.plannerRevision.findUnique({
    where: {
      planId_operationKey: { planId: plan.id, operationKey: body.requestKey },
    },
  });
  if (!prior) {
    const availability = await transaction(userId, (tx) =>
      loadAvailability(tx, plan, input)
    );
    const feasibility = pipeline.preflight(input, availability);
    if (feasibility && feasibility.status !== "POTENTIAL_FIT") {
      plannerTelemetry("feasibility_warning", {
        planId: plan.id,
        ...pipeline.counts(input),
      });
      return Response.json(
        { error: { code: pipeline.infeasibleCode }, feasibility },
        { status: 422, headers: { "Cache-Control": "private, no-store" } }
      );
    }
  }
  const op = await beginOperation(userId, plan.id, {
    operationKey: body.requestKey,
    expectedVersion: 0,
    input,
  });
  if (!op.acquired)
    return Response.json(await recoverGeneration(userId, body.requestKey), {
      headers: { "Cache-Control": "private, no-store" },
    });
  // A3 learned preferences: one read per operation, as SOFT guidance only.
  // First-time generation creates a brand-new plan with no plan-scoped history,
  // so the user-general store (planId = null) is the signal that applies. Read
  // here, before the stream, so the provider call stays synchronous and the read
  // never joins the cancellation race. A failed read falls back to no context —
  // a preference can never add a failure mode, spend quota or change the input.
  let planningContext: PlanningContext = { preferences: [], friction: [] };
  try {
    const preferences = await activePreferencesForUser(userId);
    planningContext = {
      preferences: preferences.map((preference) => ({
        type: preference.preferenceType,
        value: preference.value,
        source: preference.source,
      })),
      friction: [],
    };
  } catch {
    /* SOFT guidance is best-effort: proceed without it. */
  }
  const controller = new AbortController();
  const unregister = registerRunning(plan.id, controller);
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  let timedOut = Date.now() - started >= pipeline.timeoutMs;
  if (timedOut) abort();
  const operationDeadlineAt = started + pipeline.timeoutMs;
  const timer = setTimeout(
    () => {
      timedOut = true;
      abort();
    },
    Math.max(1, pipeline.timeoutMs - (Date.now() - started))
  );
  // One adapter instance per provider/model for this operation. The generator,
  // the critic and the repair share it so the bounded call budget is honest and
  // no provider SDK is constructed twice for the same target.
  const adapters = new Map<string, LLMAdapter>();
  const adapterFor = (provider: LLMProviderName, model: string) => {
    const key = `${provider}:${model}`;
    const existing = adapters.get(key);
    if (existing) return existing;
    const created = LLMFactory.getAdapter(provider, model);
    adapters.set(key, created);
    return created;
  };
  let sequence = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const emit = (
        stage: string,
        status: string,
        counts: {
          items?: number;
          topics?: number;
          periods?: number;
          milestones?: number;
        } = {}
      ) => {
        try {
          streamController.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ operationId: op.id, planId: plan.id, sequence: ++sequence, stage, status, ...counts })}\n\n`
            )
          );
        } catch {
          controller.abort();
        }
      };
      try {
        emit("calculating_capacity", "complete", pipeline.counts(input));
        plannerTelemetry(pipeline.telemetry.started, {
          planId: plan.id,
          operationId: op.id,
          mode: pipeline.mode,
          granularity:
            input.mode === "ROADMAP" && input.roadmap
              ? input.roadmap.granularity
              : undefined,
          ...pipeline.counts(input),
        });
        const generated = await pipeline.strategy(
          input,
          op.availabilitySnapshot as unknown as AvailabilitySnapshot,
          controller.signal,
          {
            adapter: adapterFor,
            stage: (stage) => emit(stage, "running"),
            usage: (provider, model, usage, workload) => {
              void logAiUsage(
                {
                  userId,
                  feature: "planner",
                  workload,
                  provider,
                  model,
                  ...usage,
                },
                true
              );
            },
            // The semantic gate is always wired in production: the bounded AI
            // critic plus at most one targeted repair, inside the same operation.
            semantic: {
              criticAdapter: adapterFor,
              repairAdapter: adapterFor,
              deadlineAt: operationDeadlineAt,
            },
            planningContext,
          }
        );
        const { proposal, review } = generated;
        controller.signal.throwIfAborted();
        emit("saving_draft", "running");
        await finishOperation(
          userId,
          plan.id,
          body.requestKey,
          proposal,
          new Date(),
          controller.signal,
          review
        );
        plannerTelemetry(pipeline.telemetry.completed, {
          planId: plan.id,
          operationId: op.id,
          mode: pipeline.mode,
          latencyMs: Date.now() - started,
          providerCalls: generated.calls,
          ...(input.mode === "MASTERY" && input.mastery
            ? {
                masteryDepth: input.mastery.desiredDepth,
                checkPreference: input.mastery.checkPreference,
              }
            : {}),
          ...pipeline.draftCounts(proposal),
        });
        plannerTelemetry("semantic_review_completed", {
          planId: plan.id,
          operationId: op.id,
          critic: review.critic,
          issues: review.issues,
          repaired: review.repaired,
          softViolations: review.softViolations,
          providerCalls: generated.calls,
        });
        const smart = smartSetupUsage(input);
        plannerTelemetry(smart.answered ? "smart_setup_applied" : "smart_setup_skipped", {
          planId: plan.id,
          priorityTopics: smart.priorityTopics,
          sizedTopics: smart.sizedTopics,
          constraints: smart.constraints,
        });
        // soft_constraint_satisfied_rate numerator/denominator, content-free.
        const soft = softConstraintStatus(
          input,
          proposal.mode === "ROADMAP"
            ? proposal.milestones.map((milestone) => ({
                date: milestone.date,
                minutes: milestone.effortMinutes ?? 0,
              }))
            : proposal.items
        );
        if (soft.total > 0)
          plannerTelemetry("soft_constraint_evaluated", {
            planId: plan.id,
            mode: pipeline.mode,
            softViolations: soft.violated,
            softSatisfied: soft.satisfied,
          });
        emit("ready", "complete", pipeline.draftCounts(proposal));
      } catch {
        const state =
          controller.signal.aborted && !timedOut ? "CANCELLED" : "FAILED";
        try {
          const terminal = await stopOperation(
            userId,
            plan.id,
            body.requestKey,
            state
          );
          if (terminal.operationState === "SEALED") {
            emit("ready", "complete");
            return;
          }
        } catch {
          /* Lease recovery refunds if the database is unavailable. */
        }
        plannerTelemetry(
          state === "CANCELLED" ? "generation_cancelled" : pipeline.telemetry.failed,
          { planId: plan.id, operationId: op.id, mode: pipeline.mode }
        );
        emit(state === "CANCELLED" ? "cancelled" : "failed", "terminal");
      } finally {
        clearTimeout(timer);
        requestSignal.removeEventListener("abort", abort);
        unregister();
        try {
          streamController.close();
        } catch {
          /* Reader disconnected. */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
