import "server-only";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import { logAiUsage } from "@/lib/ai/usage-logger";
import {
  REBALANCE_TIMEOUT_MS,
  generateRebalance,
  type RebalanceGenerationArgs,
} from "@/lib/ai/planner/rebalance";
import {
  boundedParse,
  KeySchema,
  LIMITS,
  UserInputV1Schema,
  ValidatedDraftV1Schema,
  type UserInputV1,
  type ValidatedDraftV1,
} from "../contracts";
import { localToday } from "../dates";
import {
  expansionDays,
  expansionScope,
  type ExpansionScope,
} from "../expansion-policy";
import { periodSpecsFor, roadmapInput } from "../roadmap-policy";
import { masteryTopicMinutes } from "../mastery-policy";
import { scopeTopicPracticeFloor } from "../scope-topic";
import {
  topicMinutes as examTopicMinutes,
  topicPracticeFloor as examTopicPracticeFloor,
} from "../exam-policy";
import type { AvailabilitySnapshot } from "../capacity";
import type { ExecutionSnapshot } from "../rebalance-policy";
import { PlannerError } from "../errors";
import {
  isSecure,
  isStatedCovered,
  isStatedNotCovered,
  needsLearning,
  preparednessForModel,
} from "../preparedness";
import { ExamIntentSchema } from "../exam-fields";
import { MasteryStageSchema } from "../mastery-fields";
import { plannerTelemetry } from "../telemetry";
import { activePreferencesForPlan } from "./preferences";
import { FRICTION_REASONS, frictionSummary } from "./friction";
import type { RebalanceReason } from "../rebalance-fields";
import {
  ownedPlan,
  transaction,
} from "./core";
import { recoverOperation, stopOperation } from "./operations";
import {
  RebalanceRequestSchema,
  beginRebalance,
  finishRebalance,
  readExecution,
  rebalanceFrozenMilestoneViews,
} from "./rebalance";
import { rebalanceScopeFor } from "../rebalance-scope";
import { registerRunning } from "./running";

export { RebalanceRequestSchema };

/** Minutes of completed work already logged against one unit. */
function completedMinutesFor(
  frozen: { topicRef: string; minutes: number }[],
  ref: string
): number {
  return frozen
    .filter((item) => item.topicRef === ref)
    .reduce((total, item) => total + item.minutes, 0);
}

/** The scope ref (`tN`) a durable topic key belongs to. */
function scopeRefForTopic(
  draft: ValidatedDraftV1,
  topicKey: string
): string {
  const topic = draft.topics.find((entry) => entry.key === topicKey);
  return topic?.scopeRef ?? `t${draft.topics.findIndex((entry) => entry.key === topicKey) + 1}`;
}

/** The confirmed unit label behind a durable topic key. */
function topicLabelFor(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  topicKey: string
): string {
  const index = draft.topics.findIndex((topic) => topic.key === topicKey);
  const labels =
    input.mode === "EXAM"
      ? input.exam?.topics.map((topic) => topic.label)
      : input.mode === "MASTERY"
        ? input.mastery?.topics.map((topic) => topic.label)
        : input.roadmap?.topics.map((topic) => topic.label);
  return labels?.[index] ?? draft.topics[index]?.title ?? "";
}

/** Everything one replan generation needs, read from the confirmed revision. */
/**
 * Frozen history in the currency the replan generator and validators speak.
 *
 * Exported because it is the ONLY definition of that currency: the live smoke builds
 * its scenarios with this function instead of hand-rolling objects, which is how a
 * fixture defect ("the stage sat in the wrong field") was previously recorded as a
 * model-convergence failure.
 */
export function frozenGenerationViews(
  input: UserInputV1,
  baseDraft: ValidatedDraftV1,
  execution: ExecutionSnapshot
): RebalanceGenerationArgs["frozen"] {
  const itemByKey = new Map(baseDraft.items.map((item) => [item.key, item]));
  return execution.frozen
    .map((row) => {
      const item = itemByKey.get(row.itemKey);
      if (!item) return null;
      return {
        topicRef: scopeRefForTopic(baseDraft, item.topicKey),
        // Units this history also covered: an Exam mixed-practice item counts for
        // every unit it touched, and history has to say so.
        relatedTopicRefs: (item.relatedTopicKeys ?? []).map((key) =>
          scopeRefForTopic(baseDraft, key)
        ),
        topicLabel: topicLabelFor(input, baseDraft, item.topicKey),
        title: item.title,
        // Both stage fields travel; the modes read different ones.
        stage: item.stage ?? null,
        masteryStage: item.masteryStage ?? null,
        type: item.type,
        date: item.date,
        minutes: item.minutes,
        status: row.className,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

/**
 * The confirmed unit list a replan generator receives.
 *
 * Exported because it is the single definition of that currency: the live smoke builds
 * its scenarios with this function. Hand-rolling it there once dropped the `covered`
 * fact, which made a covered unit look uncovered to the model and produced a
 * `UNJUSTIFIED_RELEARNING` rejection that was recorded as a model failure.
 */
export function unitGenerationViews(
  input: UserInputV1,
  frozen: RebalanceGenerationArgs["frozen"],
  baseDraft: ValidatedDraftV1,
  scopeKey: string | null
): RebalanceGenerationArgs["units"] {
  return (
          input.mode === "EXAM"
            ? (input.exam?.topics ?? []).map((topic, index) => ({
                ref: `t${index + 1}`,
                label: topic.label,
                // The exam rules refuse new LEARN work for a unit the student already
                // covered unless the item explains why. The fact and the rule are both
                // stated, and the intents are enumerated rather than described: a closed
                // list is harder to misread than a sentence, and this is the exact rule
                // `checkSemantics` enforces.
                covered: topic.covered,
                requiredIntents: topic.covered ? [] : ["LEARN"],
                forbiddenIntents: topic.covered ? ["LEARN"] : [],
                allowedIntents: topic.covered
                  ? ExamIntentSchema.options.filter((intent) => intent !== "LEARN")
                  : [...ExamIntentSchema.options],
                minimumMinutes: examTopicMinutes(
                  topic,
                  input.exam!.approach === "TRIAGE"
                ),
                practiceFloorMinutes: examTopicPracticeFloor(
                  topic,
                  input.exam!.approach === "TRIAGE"
                ),
                completedMinutes: completedMinutesFor(
                  frozen,
                  `t${index + 1}`
                ),
              }))
            : input.mode === "MASTERY"
              ? (input.mastery?.topics ?? []).map((topic, index) => ({
                  ref: `t${index + 1}`,
                  label: topic.label,
                  // The progression rules refuse new LEARN work for a unit the student
                  // already covered with high confidence, so the model has to be told
                  // which units those are instead of guessing.
                  ...preparednessForModel(topic),
                  secure: isSecure(topic),
                  // Orientation and learning are refused for a secure unit, so the model is
                  // told which stages it may use instead of being asked to infer it.
                  // Unstated preparedness is neither secure nor a stated gap: it keeps the
                  // standard progression, so `forbiddenStages` stays empty for it.
                  forbiddenStages: isSecure(topic)
                    ? ["UNDERSTAND", "LEARN"]
                    : isStatedCovered(topic)
                      ? ["LEARN"]
                      : [],
                  requiredStages: needsLearning(topic) && !isStatedCovered(topic)
                    ? ["UNDERSTAND", "LEARN"]
                    : [],
                  allowedStages: MasteryStageSchema.options.filter(
                    (stage) =>
                      !(
                        (isSecure(topic)
                          ? ["UNDERSTAND", "LEARN"]
                          : isStatedCovered(topic)
                            ? ["LEARN"]
                            : []
                        ).includes(stage)
                      )
                  ),
                  minimumMinutes: masteryTopicMinutes(
                    topic,
                    input.mastery!.desiredDepth
                  ),
                  practiceFloorMinutes: scopeTopicPracticeFloor(topic, false),
                  completedMinutes: completedMinutesFor(
                    frozen,
                    `t${index + 1}`
                  ),
                }))
              : scopeKey
                ? (baseDraft.mode === "ROADMAP"
                    ? expansionScope(baseDraft, scopeKey, roadmapInput(input)).topics
                    : []
                  ).map((topic) => ({ ref: topic.ref, label: topic.label }))
                : (input.roadmap?.topics ?? []).map((topic, index) => ({
                    ref: `t${index + 1}`,
                    label: topic.label,
                  }))
  );
}

export async function rebalanceGenerationArgs(
  userId: number,
  planId: string,
  operationKey: string
): Promise<RebalanceGenerationArgs> {
  return transaction(userId, async (tx) => {
    // Ownership is enforced even though the plan row itself is not read here.
    await ownedPlan(tx, userId, planId);
    const op = await tx.plannerRevision.findUnique({
      where: { planId_operationKey: { planId, operationKey } },
    });
    if (!op?.baseRevisionId) throw new PlannerError(404, "NOT_FOUND");
    const input = boundedParse(UserInputV1Schema, op.inputSnapshot, LIMITS.inputBytes);
    const meta = input.rebalance;
    if (!meta) throw new PlannerError(409, "NOT_A_REBALANCE");
    const base = await tx.plannerRevision.findUnique({
      where: { id: op.baseRevisionId },
    });
    if (!base?.outputSnapshot) throw new PlannerError(409, "REPLAN_STALE_BASE");
    const baseDraft = boundedParse(ValidatedDraftV1Schema, base.outputSnapshot);
    // The operation pinned its own availability snapshot: the generator must see
    // exactly what the seal will later verify against.
    const availability = op.availabilitySnapshot as unknown as AvailabilitySnapshot;
    const execution = await readExecution(
      tx,
      planId,
      localToday(availability.timezone)
    );
    const scopeKey = meta.scope.milestoneKey;
    const kind: RebalanceGenerationArgs["kind"] =
      input.mode === "EXAM"
        ? "EXAM"
        : input.mode === "MASTERY"
          ? "MASTERY"
          : scopeKey
            ? "ROADMAP_PERIOD"
            : "ROADMAP_STRATEGIC";
    const itemByKey = new Map(baseDraft.items.map((item) => [item.key, item]));
    const frozen = frozenGenerationViews(input, baseDraft, execution);
    // A2/A3 context: bounded, content-free, and read only when a replan is explicitly
    // requested. A preference never becomes a constraint here — it is passed as SOFT
    // guidance — and friction is reduced to closed reason codes and counts.
    const [preferences, friction] = await Promise.all([
      activePreferencesForPlan(userId, planId),
      frictionSummary(userId, planId),
    ]);
    const planningContext = {
      preferences: preferences.map((preference) => ({
        type: preference.preferenceType,
        value: preference.value,
        source: preference.source,
      })),
      friction: Object.entries(friction.byReasonCode)
        .map(([reasonCode, count]) => ({ reasonCode, count }))
        .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))
        .slice(0, FRICTION_REASONS.length),
    };
    const eligible = meta.eligible
      .map((token) => {
        const item = itemByKey.get(token.itemKey);
        if (!item) return null;
        return {
          ref: token.ref,
          itemKey: token.itemKey,
          title: item.title,
          topicRef: scopeRefForTopic(baseDraft, item.topicKey),
          topicLabel: topicLabelFor(input, baseDraft, item.topicKey),
          type: item.type,
          // Both stage fields, so a Mastery replan can copy `masteryStage` from the
          // entry it keeps instead of having to guess which field its mode reads.
          stage: item.stage ?? null,
          masteryStage: item.masteryStage ?? null,
          date: item.date,
          minutes: item.minutes,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const roadmap =
      kind === "ROADMAP_STRATEGIC"
        ? (() => {
            const roadmapInputValue = roadmapInput(input);
            const specs = periodSpecsFor(roadmapInputValue);
            const expanded = new Set(meta.frozenItemKeys);
            return {
              periods: specs.map((spec) => ({
                ref: spec.ref,
                title: spec.title,
                startDate: spec.startDate,
                endDate: spec.endDate,
              })),
              milestones: (baseDraft.mode === "ROADMAP" ? baseDraft.milestones : [])
                .filter((milestone) => !milestone.removed)
                .map((milestone) => {
                  const token = meta.eligible.find(
                    (entry) => entry.itemKey === milestone.key
                  );
                  return {
                    ref: token?.ref ?? "frozen",
                    title: milestone.title,
                    date: milestone.date,
                    periodRef:
                      specs.find(
                        (spec) =>
                          spec.startDate <= milestone.date &&
                          spec.endDate >= milestone.date
                      )?.ref ?? "p1",
                    topicRefs: (milestone.topicKeys ?? []).map((key) => {
                      const index = baseDraft.topics.findIndex(
                        (topic) => topic.key === key
                      );
                      return `t${index + 1}`;
                    }),
                    frozen: expanded.has(milestone.key),
                  };
                }),
              topics: roadmapInputValue.roadmap.topics.map((topic, index) => ({
                ref: `t${index + 1}`,
                label: topic.label,
              })),
            };
          })()
        : undefined;
    const period = (() => {
      if (!scopeKey || baseDraft.mode !== "ROADMAP") return undefined;
      const scope: ExpansionScope = expansionScope(
        baseDraft,
        scopeKey,
        roadmapInput(input)
      );
      return {
        scope,
        days: expansionDays(input, availability as never, scope),
      };
    })();
    return {
      input,
      baseDraft,
      availability: availability as never,
      units: unitGenerationViews(input, frozen, baseDraft, scopeKey),
      reason: meta.reasonCode as RebalanceReason,
      inputChanges: meta.inputChanges,
      eligible,
      frozen,
      roadmap,
      period,
      planningContext,
      kind,
    } satisfies RebalanceGenerationArgs;
  });
}

/**
 * One explicit, user-approved replan.
 *
 * It mirrors the expansion operation: the same bounded pipeline, the same SSE
 * stages, the same durable operation key and recovery, and the same fail-closed
 * cancellation. Nothing about live execution changes here — the sealed proposal is
 * a diff the user must confirm.
 */
export async function rebalanceResponse(
  userId: number,
  planId: string,
  raw: unknown,
  requestSignal: AbortSignal,
  started = Date.now()
): Promise<Response> {
  KeySchema.parse(planId);
  const body = boundedParse(RebalanceRequestSchema, raw);
  const op = await beginRebalance(userId, planId, body);
  if (!op.acquired) {
    // A competing request for the same key recovers the same operation: no second
    // provider worker, no second charge.
    const recovered = await recoverOperation(userId, planId, body.requestKey);
    return Response.json(
      { planId, operation: recovered },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const controller = new AbortController();
  const unregister = registerRunning(planId, controller);
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  let timedOut = Date.now() - started >= REBALANCE_TIMEOUT_MS;
  if (timedOut) abort();
  const deadlineAt = started + REBALANCE_TIMEOUT_MS;
  const timer = setTimeout(
    () => {
      timedOut = true;
      abort();
    },
    Math.max(1, REBALANCE_TIMEOUT_MS - (Date.now() - started))
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
        emit("calculating_capacity", "complete", {});
        plannerTelemetry("replan_generation_started", {
          planId,
          operationId: op.id,
          mode: undefined,
          reasonCode: body.reasonCode,
          items: op.eligible,
          frozen: op.frozen,
        });
        const args = await rebalanceGenerationArgs(userId, planId, body.requestKey);
        const generated = await generateRebalance(
          args,
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
            frozenMilestones: rebalanceFrozenMilestoneViews(
              args.baseDraft as never,
              args.input.rebalance?.frozenItemKeys ?? [],
              "PROPOSAL"
            ),
          },
          controller.signal
        );
        controller.signal.throwIfAborted();
        emit("saving_draft", "running");
        const { result } = await finishRebalance(
          userId,
          planId,
          body.requestKey,
          generated.proposal,
          new Date(),
          controller.signal,
          generated.review
        );
        plannerTelemetry("replan_generation_completed", {
          planId,
          operationId: op.id,
          reasonCode: body.reasonCode,
          providerCalls: generated.calls,
          latencyMs: Date.now() - started,
          retained: result.diff.counts.RETAIN,
          moved: result.diff.counts.MOVE,
          replaced: result.diff.counts.REPLACE,
          removed: result.diff.counts.REMOVE,
          added: result.diff.counts.ADD,
          frozen: result.diff.frozen,
        });
        emit("ready", "complete", {
          items: generated.proposal.items.length,
          milestones: generated.proposal.milestones.length,
        });
      } catch (error) {
        const state =
          controller.signal.aborted && !timedOut ? "CANCELLED" : "FAILED";
        const code =
          error instanceof PlannerError ? error.code : "REBALANCE_GENERATION_FAILED";
        try {
          const terminal = await stopOperation(userId, planId, body.requestKey, state);
          if (terminal.operationState === "SEALED") {
            emit("ready", "complete");
            return;
          }
        } catch {
          /* Lease recovery releases the quota if the database is unavailable. */
        }
        plannerTelemetry("replan_generation_failed", {
          planId,
          operationId: op.id,
          reasonCode: body.reasonCode,
          conflictCode: code,
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

export { rebalanceScopeFor };
