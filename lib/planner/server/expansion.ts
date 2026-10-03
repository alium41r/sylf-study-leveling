import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateExpansion } from "@/lib/ai/planner/expansion";
import {
  EXPANSION_TIMEOUT_MS,
  EXPANSION_PROVIDER_CALL_BUDGET,
} from "@/lib/ai/planner/expansion";
import { EXPANSION_MAX_ITEMS } from "@/lib/ai/planner/expansion";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import { logAiUsage } from "@/lib/ai/usage-logger";
import {
  boundedParse,
  KeySchema,
  LIMITS,
  OperationKeySchema,
  UserInputV1Schema,
  ValidatedDraftV1Schema,
} from "../contracts";
import {
  expansionDays,
  expansionScope,
  validateExpansionItems,
  type ExpansionScope,
} from "../expansion-policy";
import { validateExpansionStructure } from "@/lib/ai/planner/expansion";
import { roadmapInput, type RoadmapDraft } from "../roadmap-policy";
import { deterministicSemanticIssues, fatalSemanticIssues } from "../semantic";

import { expansionSemanticDraft } from "@/lib/ai/planner/expansion";
import type { ExpansionItem } from "../expansion-fields";
import { PlannerError } from "../errors";
import { plannerTelemetry } from "../telemetry";
import { loadAvailability, ownedPlan, transaction } from "./core";
import { beginExpansion, finishExpansion, recoverOperation, stopOperation } from "./operations";
import { registerRunning } from "./running";
import { activePreferencesForPlan } from "./preferences";
import type { PlanningContext } from "@/lib/ai/planner/context";

export const ExpansionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requestKey: OperationKeySchema,
  expectedVersion: z.number().int().nonnegative(),
});

export interface ExpansionFeasibility {
  status: "POTENTIAL_FIT" | "INFEASIBLE";
  availableMinutes: number;
  estimatedMinutes: number;
  period: { title: string; startDate: string; endDate: string };
  usableDays: number;
  reasons: string[];
  choices: string[];
}

/**
 * Owned context for one expansion: the confirmed active roadmap revision, the
 * selected milestone and its deterministic period. Everything the preflight, the
 * generator payload and the seal path need is derived from this one read.
 */
async function expansionContext(userId: number, planId: string, milestoneKey: string) {
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId);
    if (plan.mode !== "ROADMAP" || !plan.activeRevisionId)
      throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const active = await tx.plannerRevision.findUnique({
      where: { id: plan.activeRevisionId },
    });
    if (!active?.outputSnapshot || !active.confirmationReceipt)
      throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const input = roadmapInput(
      boundedParse(UserInputV1Schema, active.inputSnapshot, LIMITS.inputBytes)
    );
    const parsed = boundedParse(ValidatedDraftV1Schema, active.outputSnapshot);
    if (parsed.mode !== "ROADMAP")
      throw new PlannerError(409, "ROADMAP_NOT_CONFIRMED");
    const parent: RoadmapDraft = parsed;
    const scope = expansionScope(parent, milestoneKey, input);
    const milestone = parent.milestones.find((entry) => entry.key === milestoneKey)!;
    const availability = await loadAvailability(tx, plan, input, {
      start: scope.period.startDate,
      end: scope.period.endDate,
    });
    // A3 learned preferences for this confirmed roadmap, read inside the same
    // transaction as the rest of the context. Plan-scoped here because the plan
    // exists and is the thing being expanded.
    const preferences = await activePreferencesForPlan(userId, planId);
    return { plan, input, parent, scope, milestone, availability, preferences };
  });
}

/** Explicit, structured infeasibility before any quota is reserved. */
export function expansionFeasibility(
  plan: Awaited<ReturnType<typeof expansionContext>>
): ExpansionFeasibility {
  const days = expansionDays(plan.input, plan.availability, plan.scope);
  const availableMinutes = days.reduce(
    (total, day) => total + day.remainingMinutes,
    0
  );
  const estimatedMinutes = plan.milestone.effortMinutes ?? 0;
  const reasons: string[] = [];
  if (!days.length) reasons.push("NO_STUDY_DATES");
  if (estimatedMinutes > availableMinutes) reasons.push("INSUFFICIENT_PERIOD_CAPACITY");
  return {
    status: reasons.length ? "INFEASIBLE" : "POTENTIAL_FIT",
    availableMinutes,
    estimatedMinutes,
    period: {
      title: plan.scope.period.title,
      startDate: plan.scope.period.startDate,
      endDate: plan.scope.period.endDate,
    },
    usableDays: days.length,
    reasons,
    choices: [
      "Increase your availability for this period",
      "Reduce the confirmed scope of this milestone",
      "Postpone this period's work to a later date",
      "Adjust the roadmap itself before expanding it",
    ],
  };
}

/**
 * One explicit, user-visible expansion operation. It reserves its own bounded
 * expansion allowance, streams its own truthful progress, and is recoverable by
 * operation key. It never rewrites a neighbouring period: the sealed draft copies
 * the parent structure verbatim and is rejected if the restatement differs.
 */
export async function expansionResponse(
  userId: number,
  planId: string,
  milestoneKey: string,
  raw: unknown,
  requestSignal: AbortSignal,
  started = Date.now()
): Promise<Response> {
  KeySchema.parse(planId);
  KeySchema.parse(milestoneKey);
  const body = boundedParse(ExpansionRequestSchema, raw);
  const context = await expansionContext(userId, planId, milestoneKey);
  // `beginExpansion` owns the pending-draft decision: it reopens this milestone's
  // own unconfirmed draft, and refuses anything else that is pending.
  const feasibility = expansionFeasibility(context);
  if (feasibility.status !== "POTENTIAL_FIT") {
    plannerTelemetry("roadmap_milestone_expansion_failed", {
      planId,
      reasonCodes: undefined,
      milestones: context.parent.milestones.length,
    });
    return Response.json(
      { error: { code: "EXPANSION_INFEASIBLE" }, feasibility },
      { status: 422, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const op = await beginExpansion(userId, planId, {
    operationKey: body.requestKey,
    expectedVersion: body.expectedVersion,
    milestoneKey,
  });
  if (!op.acquired) {
    // An existing draft for this milestone is reopened, and a competing request
    // recovers the same operation: neither starts a second provider call.
    const recovered = await recoverOperation(userId, planId, body.requestKey);
    return Response.json(
      { planId, version: context.plan.version, operation: recovered },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const controller = new AbortController();
  const unregister = registerRunning(planId, controller);
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  let timedOut = Date.now() - started >= EXPANSION_TIMEOUT_MS;
  if (timedOut) abort();
  const deadlineAt = started + EXPANSION_TIMEOUT_MS;
  const timer = setTimeout(
    () => {
      timedOut = true;
      abort();
    },
    Math.max(1, EXPANSION_TIMEOUT_MS - (Date.now() - started))
  );
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
        counts: { items?: number; milestones?: number } = {}
      ) => {
        try {
          streamController.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ operationId: op.id, planId, sequence: ++sequence, stage, status, ...counts })}\n\n`
            )
          );
        } catch {
          controller.abort();
        }
      };
      try {
        emit("calculating_capacity", "complete", {
          milestones: 1,
        });
        plannerTelemetry("roadmap_milestone_expansion_started", {
          planId,
          operationId: op.id,
          mode: "ROADMAP",
          granularity: context.parent.periods?.[0]?.granularity,
        });
        const existing = existingWorkFor(context.scope, context.availability);
        // The context read inside `expansionContext` is mapped here so it reaches
        // the payload as SOFT guidance; it never becomes a constraint or a floor.
        const planningContext: PlanningContext = {
          preferences: context.preferences.map((preference) => ({
            type: preference.preferenceType,
            value: preference.value,
            source: preference.source,
          })),
          friction: [],
        };
        const generated = await generateExpansion(
          context.input,
          context.parent,
          milestoneKey,
          context.availability,
          existing,
          controller.signal,
          {
            adapter: adapterFor,
            stage: (stage) => emit(stage, "running"),
            usage: (provider, model, usage, workload) => {
              void logAiUsage(
                { userId, feature: "planner", workload, provider, model, ...usage },
                true
              );
            },
            semantic: {
              criticAdapter: adapterFor,
              repairAdapter: adapterFor,
              deadlineAt,
            },
            validateItems: (items) =>
              validateExpansionItems(
                context.input,
                context.availability,
                context.scope,
                items
              ),
            acceptRepair: (items) => acceptExpansionRepair(context, items),
            planningContext,
          }
        );
        controller.signal.throwIfAborted();
        emit("saving_draft", "running");
        await finishExpansion(
          userId,
          planId,
          body.requestKey,
          milestoneKey,
          generated.items,
          new Date(),
          controller.signal,
          generated.review
        );
        plannerTelemetry("roadmap_milestone_expansion_completed", {
          planId,
          operationId: op.id,
          mode: "ROADMAP",
          items: generated.items.length,
          latencyMs: Date.now() - started,
          providerCalls: generated.calls,
          critic: generated.review.critic,
          issues: generated.review.issues,
          repaired: generated.review.repaired,
          softViolations: generated.review.softViolations,
        });
        emit("ready", "complete", { items: generated.items.length });
      } catch {
        const state =
          controller.signal.aborted && !timedOut ? "CANCELLED" : "FAILED";
        try {
          const terminal = await stopOperation(
            userId,
            planId,
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
        plannerTelemetry("roadmap_milestone_expansion_failed", {
          planId,
          operationId: op.id,
          mode: "ROADMAP",
        });
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

/** Bounded, content-free description of work already scheduled in the period. */
function existingWorkFor(
  scope: ExpansionScope,
  availability: { existingWork: { date: string; minutes: number }[] }
) {
  return availability.existingWork
    .filter((work) => work.date >= scope.period.startDate && work.date <= scope.period.endDate)
    .slice(0, 60)
    .map((work) => ({
      date: work.date,
      minutes: work.minutes,
      purpose: "already scheduled work in this period",
    }));
}

/** A repair is accepted only if it re-passes every deterministic gate. */
function acceptExpansionRepair(
  context: Awaited<ReturnType<typeof expansionContext>>,
  items: ExpansionItem[]
): ExpansionItem[] | null {
  try {
    if (items.length > EXPANSION_MAX_ITEMS) return null;
    validateExpansionStructure(context.scope, items);
    validateExpansionItems(
      context.input,
      context.availability,
      context.scope,
      items
    );
    return fatalSemanticIssues(deterministicSemanticIssues(expansionSemanticDraft(items)))
      .length
      ? null
      : items;
  } catch {
    return null;
  }
}

