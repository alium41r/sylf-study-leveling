import { z } from "zod";
import { PlanChangeSetV2Schema, DurableIdV2Schema } from "../contracts";
import {
  STUDENT_RESOURCE_PROFILE,
  PRIOR_STUDENT_RESOURCE_PROFILE,
  LEGACY_STUDENT_RESOURCE_PROFILE,
  STUDENT_SPENDING_LIMIT_USD,
  type StudentWorkspace,
  type StudentReadiness,
} from "../client/workspace";
import type { ResourcePolicy } from "../intelligence/foundation/resources";
import { GenerationService, GenerateRequestV2Schema } from "./generation";
import { WorkspaceService } from "./workspace";
import { PlannerDatabase, rows, reject } from "./database";
import { ownedPlan, loadIntent } from "./intents";
import { loadAttempt, AttemptService } from "./attempts";
import { loadAttemptArtifacts } from "./foundation";
import { ResearchService } from "./research";
import {
  ConversationSchema,
  emptyConversation,
} from "../intelligence/schemas/conversation";
import { DocumentsSchema } from "../intelligence/schemas/documents";
import { currentIssueHeads } from "../intelligence/foundation/validation";
import { AI_PRICING_VERSION } from "../../../ai/config";
import { loadExecutionContext, overdueCompetingWork } from "./context";

/** Trusted, explicit preview admission. No public request supplies resources,
 * compiler identity, permissions or routing. Existing production defaults stay v1. */
export function studentResourcePolicy(maximumSpendUsd = STUDENT_SPENDING_LIMIT_USD, profile: string = STUDENT_RESOURCE_PROFILE): Omit<
  ResourcePolicy,
  "authorizationDigest"
> {
  maximumSpendUsd = z.number().positive().max(STUDENT_SPENDING_LIMIT_USD).multipleOf(0.01).parse(maximumSpendUsd);
  const call = { calls: 1, inputUnits: 500000, completionTokens: 65536 };
  const role = (format: "TEXT" | "JSON", held: number, effort: "DISABLED" | "LOW" | "HIGH" = "HIGH") => {
    const completionTokens = effort === "DISABLED" ? 8192 : call.completionTokens;
    return {
      format,
      provider: "deepseek" as const,
      model: "deepseek-flash" as const,
      effort,
      call: { ...call, completionTokens },
      holdback: {
        calls: held,
        inputUnits: held * call.inputUnits,
        completionTokens: held * completionTokens,
      },
    };
  };
  const isLegacy = profile === LEGACY_STUDENT_RESOURCE_PROFILE;
  const isV2 = profile === PRIOR_STUDENT_RESOURCE_PROFILE;
  return {
    schemaVersion: 1,
    policyId: isLegacy
      ? "59f72827-d48f-49d3-99de-4568c163313e"
      : isV2
        ? "1290c270-c194-4902-8d7c-104b700b7987"
        : "3d84e9a2-7b16-4e2f-9a51-8f204c61d3e9",
    journeyVersion: 1,
    spending: { maximumMicros: Math.round(maximumSpendUsd * 1000000), pricingVersion: AI_PRICING_VERSION },
    processingMs: 4 * 3600000,
    root: { calls: 48, inputUnits: 3000000, completionTokens: 700000 },
    roles: {
      RESEARCH: role("JSON", 1, isLegacy ? "HIGH" : isV2 ? "LOW" : "DISABLED"),
      STRATEGIST: role("TEXT", 1, isLegacy || isV2 ? "HIGH" : "LOW"),
      TRANSLATOR: role("JSON", 2, isLegacy ? "HIGH" : "LOW"),
      REVIEWER: role("JSON", 3, isLegacy || isV2 ? "HIGH" : "DISABLED"),
    },
    researchTools: {
      researchQueries: 20,
      fetchAttempts: 40,
      selectedSourceCharacters: 2000000,
      extractedPages: 2000,
      ocrPages: 100,
      followUps: 1000,
    },
  };
}
export function studentWorkspaceEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return (
    env.PLANNER_V2_DURABLE_CORE_ENABLED === "true" &&
    env.PLANNER_V2_STUDENT_WORKSPACE_ENABLED === "true"
  );
}
export async function studentReadiness(): Promise<StudentReadiness> {
  const status = {
    enabled: studentWorkspaceEnabled(),
    ready: false,
    reason: null as string | null,
    profile: STUDENT_RESOURCE_PROFILE,
  };
  if (!status.enabled)
    return {
      ...status,
      reason:
        "The student Planner preview has not been enabled in this deployment.",
    };
  if (!process.env.DEEPSEEK_API_KEY)
    return {
      ...status,
      reason:
        "The Planner provider is not configured. Your saved work is still available.",
    };
  const port = Number(process.env.PLANNER_WORKER_HEALTH_PORT ?? 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return { ...status, reason: "The Planner worker health port is invalid." };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    const health = await response.json();
    if (
      response.ok &&
      health.ready === true &&
      health.compatible === true &&
      Array.isArray(health.compilerVersions) &&
      health.compilerVersions.includes(2)
    )
      return { ...status, ready: true };
  } catch {
    /* A missing worker is an actionable unavailable state, never a fake ready. */
  }
  return {
    ...status,
    reason:
      "The AI-first Planner worker is unavailable or incompatible. Start the compatible worker, then check again.",
  };
}
export async function requireStudentAdmission() {
  const state = await studentReadiness();
  if (!state.ready) reject("WORKER_UNAVAILABLE", state.reason!, "INTAKE");
}
export const StudentGenerationSchema = z.strictObject({
  action: z.literal("GENERATE"),
  profile: z.enum([STUDENT_RESOURCE_PROFILE, PRIOR_STUDENT_RESOURCE_PROFILE, LEGACY_STUDENT_RESOURCE_PROFILE]),
  consent: z.literal(true),
  spendingLimitUsd: z.number().positive().max(STUDENT_SPENDING_LIMIT_USD).multipleOf(0.01).optional(),
  request: GenerateRequestV2Schema,
});
export class StudentWorkspaceService {
  constructor(readonly db: PlannerDatabase) {}
  async generate(ownerId: number, raw: unknown, signal?: AbortSignal) {
    const input = StudentGenerationSchema.parse(raw);
    return new GenerationService(this.db, {
      compilerVersion: 2,
      studentPreview: true,
      resources: studentResourcePolicy(input.spendingLimitUsd, input.profile),
    }).accept(ownerId, input.request, signal);
  }
  async list(ownerId: number, before?: string) {
    if (before) DurableIdV2Schema.parse(before);
    const plans = await rows<{ id: string; title: string; state: string }>(
      this.db.pool,
      `SELECT id,title,state FROM "PlannerPlan" WHERE "userId"=$1 AND "contractVersion"=2 AND ($2::uuid IS NULL OR ("createdAt",id)<(SELECT "createdAt",id FROM "PlannerPlan" WHERE id=$2::uuid AND "userId"=$1 AND "contractVersion"=2)) ORDER BY "createdAt" DESC,id DESC LIMIT 31`,
      [ownerId, before ?? null]
    );
    return {
      plans: plans
        .slice(0, 30)
        .map((p) => ({ planId: p.id, title: p.title, state: p.state })),
      next: plans.length > 30 ? plans[29].id : null,
    };
  }
  async read(ownerId: number, planId: string): Promise<StudentWorkspace> {
    const workspace = await new WorkspaceService(this.db).read(ownerId, planId);
    const result = await this.db.observed(ownerId, async (sql) => {
      const plan = await ownedPlan(sql, ownerId, planId, false),
        intent = await loadIntent(sql, ownerId, plan.workingIntentVersionId!);
      const latest = (
        await rows<{ id: string }>(
          sql,
          `SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(artifact->'targets') t WHERE t->>'planId'=$2) ORDER BY "createdAt" DESC,id DESC LIMIT 1`,
          [ownerId, planId]
        )
      )[0];
      const loaded = latest
        ? await loadAttempt(sql, ownerId, latest.id, false)
        : null;
      const retained = loaded
        ? await loadAttemptArtifacts(sql, ownerId, loaded.attempt.attemptId)
        : null;
      let capacityDecision: StudentWorkspace["capacityDecision"] = null;
      const capacities = retained?.compilerVersion === 2 ? Object.values(retained.archive.entries).filter(a => a.kind === "CAPACITY" && a.value.schemaVersion === 2) : [];
      const blockedCapacity = capacities.find(a => !capacities.some(next => next.kind === "CAPACITY" && next.value.schemaVersion === 2 && next.value.previous?.id === a.id));
      if (loaded?.attempt.state === "NEEDS_DECISION" && retained?.compilerVersion === 2 &&
        blockedCapacity?.kind === "CAPACITY" && blockedCapacity.value.schemaVersion === 2 && blockedCapacity.value.status !== "READY") {
        const context = await loadExecutionContext(sql, ownerId, [plan], intent.intent);
        const overdue = overdueCompetingWork(context, new Set(loaded.attempt.targets.map(t => t.planId)));
        capacityDecision = { today: context.today, overdue, overdueResolved: !overdue.length && blockedCapacity.value.reasons.length > 0 &&
          blockedCapacity.value.reasons.every(reason => reason.startsWith("Reschedule unfinished work before planning:") || reason.startsWith("Overdue protected or competing work")) };
      }
      let draft: StudentWorkspace["draft"] = null;
      let shownAttemptId = loaded?.attempt.attemptId ?? null;
      let shownPlanRef = `plan_${(loaded?.attempt.targets.findIndex((t) => t.planId === planId) ?? -1) + 1}`;
      let shown = retained;
      // While a linked continuation gathers new evidence, retain access to the
      // actual earlier draft. It is labelled historical, never current approval.
      let cursor = loaded?.attempt.parentAttemptId;
      while (
        cursor &&
        shown?.compilerVersion === 2 &&
        !Object.values(shown.archive.entries).some((a) => a.kind === "STRATEGY")
      ) {
        const parent = await loadAttempt(sql, ownerId, cursor, false);
        if (!parent.attempt.targets.some((t) => t.planId === planId))
          reject(
            "REFERENCE_NOT_OWNED",
            "Continuation history belongs to another plan."
          );
        shown = await loadAttemptArtifacts(sql, ownerId, cursor);
        shownAttemptId = cursor;
        shownPlanRef = `plan_${parent.attempt.targets.findIndex((t) => t.planId === planId) + 1}`;
        cursor = parent.attempt.parentAttemptId;
      }
      if (shown && shownAttemptId) {
        draft = projectStudentDraft(shown, shownAttemptId, shownPlanRef);
        if (draft)
          draft.retainedFromEarlierAttempt =
            shownAttemptId !== loaded?.attempt.attemptId;
      }
      const attemptHistory = await rows<{
        id: string;
        state: string;
        createdAt: Date;
      }>(
        sql,
        `SELECT id,state,"createdAt" FROM "PlannerAttempt" WHERE "userId"=$1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(artifact->'targets') t WHERE t->>'planId'=$2) ORDER BY "createdAt" DESC,id DESC LIMIT 100`,
        [ownerId, planId]
      );
      const logs = loaded
        ? await rows<{
            accountingState: string;
            promptTokens: number;
            completionTokens: number;
            reasoningTokens: number | null;
            estimatedCostUsd: number | null;
          }>(
            sql,
            'SELECT "accountingState","promptTokens","completionTokens","reasoningTokens","estimatedCostUsd" FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2',
            [ownerId, loaded.attempt.budget.rootRequestId]
          )
        : [];
      const known = logs.filter((l) => l.accountingState === "SETTLED"),
        usage = loaded
          ? {
              inputTokens: known.reduce((n, l) => n + l.promptTokens, 0),
              outputTokens: known.reduce((n, l) => n + l.completionTokens, 0),
              reasoningTokens: known.some((l) => l.reasoningTokens === null)
                ? null
                : known.reduce((n, l) => n + (l.reasoningTokens ?? 0), 0),
              estimatedCostUsd: known.reduce(
                (n, l) => n + (l.estimatedCostUsd ?? 0),
                0
              ),
              unknownCosts: logs.filter(
                (l) =>
                  l.accountingState !== "CANCELLED_BEFORE_DISPATCH" &&
                  l.estimatedCostUsd === null
              ).length,
              uncertain: logs.some((l) =>
                ["UNKNOWN_SPEND", "DISPATCHED"].includes(l.accountingState)
              ),
              calls: logs.length,
            }
          : null;
      return {
        plan: { planId, title: plan.title, state: plan.state },
        intent,
        conversation: ConversationSchema.parse(
          plan.conversation ?? emptyConversation()
        ),
        documents: DocumentsSchema.parse(plan.researchDocuments ?? []).map(
          (d) => ({ documentId: d.documentId, title: d.title })
        ),
        attempt: loaded?.attempt ?? null,
        capacityDecision,
        draft,
        attemptHistory: attemptHistory.map((a) => ({
          attemptId: a.id,
          state: a.state,
          at: new Date(a.createdAt).toISOString(),
        })),
        usage,
        changeSet: loaded?.payload.changeSet
          ? PlanChangeSetV2Schema.parse(loaded.payload.changeSet)
          : null,
      };
    });
    const research = result.attempt?.budget.aiFirst
      ? await new ResearchService(new AttemptService(this.db))
          .understanding()
          .read(ownerId, result.attempt.attemptId)
      : null;
    const run = research?.run,
      last = run?.pending ?? run?.actions.at(-1);
    const questions =
      research?.reviewHandoff?.questions ??
      research?.continuationQuestions ??
      (run?.pending?.action === "CLARIFY" ? run.pending.questions : []);
    return {
      ...result,
      workspace,
      research: run
        ? {
            digest: run.digest,
            ...(research?.continuationContextDigest
              ? { foundationDigest: research.continuationContextDigest }
              : {}),
            summary: last && "summary" in last ? last.summary : null,
            questions,
          }
        : null,
    };
  }
}

function projectStudentDraft(
  retained: Awaited<ReturnType<typeof loadAttemptArtifacts>>,
  attemptId: string,
  planRef: string
): StudentWorkspace["draft"] {
  if (retained.compilerVersion !== 2) return null;
  const archive = retained.archive,
    entries = Object.values(archive.entries).sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    ),
    checkpoints = entries.filter((a) => a.kind === "CHECKPOINT");
  const head = checkpoints.find(
    (a) => !checkpoints.some((n) => n.value.previous?.id === a.id)
  );
  let cursor = head,
    learning = null;
  while (cursor) {
    if (
      cursor.value.schemaVersion !== 1 &&
      (cursor.value.learning.allocated || cursor.value.learning.translated)
    ) {
      learning = cursor.value.learning;
      break;
    }
    cursor = checkpoints.find((c) => c.id === cursor?.value.previous?.id);
  }
  const data = learning?.allocated ?? learning?.translated;
  const activitiesStrategy = learning?.strategy
    ? archive.entries[learning.strategy.id]
    : null;
  return {
    attemptId,
    retainedFromEarlierAttempt: false,
    stage: head?.value.stage ?? "RESEARCH",
    reason: head?.value.reason ?? "Research is gathering the accepted context.",
    archiveDigest: retained.digest,
    activitiesStrategyId: learning?.strategy?.id ?? null,
    activitiesStrategyVersion:
      activitiesStrategy?.kind === "STRATEGY"
        ? activitiesStrategy.value.version
        : null,
    strategies: entries
      .filter((a) => a.kind === "STRATEGY")
      .sort((a, b) => a.value.version - b.value.version)
      .slice(-1)
      .map((a) => ({
        id: a.id,
        version: a.value.version,
        text: a.value.text,
      })),
    blueprints:
      data?.blueprints.plans.filter((p) => p.planRef === planRef) ?? [],
    allocation: learning?.allocated?.allocation ?? null,
    issues: currentIssueHeads(archive).map((ref) => {
      const a = archive.entries[ref.id];
      if (a.kind !== "ISSUE") throw new Error("INVALID_ISSUE_HEAD");
      return a.value;
    }),
    reviews: entries
      .filter((a) => a.kind === "REVIEW")
      .map((a) => ({
        id: a.id,
        verdict: a.value.verdict,
        explanation: a.value.explanation,
      })),
    history: entries.map((a) => ({
      id: a.id,
      kind: a.kind,
      label:
        a.kind === "CHECKPOINT"
          ? `${a.value.stage}: ${a.value.reason}`
          : a.kind === "STRATEGY"
            ? `Strategy ${a.value.version}`
            : a.kind,
    })),
  };
}
