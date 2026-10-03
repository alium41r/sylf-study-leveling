import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidatedDraftV1Schema, boundedParse } from "../contracts";
import type { PlanBriefV1 } from "../intake/brief";
import { flattenScope } from "../intake/brief";
import { localToday } from "../dates";
import { matrixStateOf } from "../preparedness-matrix";
import { priorityLevel } from "../priority";
import { applyOverlapCorrections } from "../comparison/contracts";
import type { Tx } from "../server/core";
import { readExecution } from "../server/rebalance";
import { classifyExecution } from "../rebalance-policy";
import {
  PlannerCopilotContextV1Schema,
  type PlannerCopilotContextV1,
} from "./contracts";

/**
 * The Copilot's view of the planner: a bounded projection, never the brief itself.
 *
 * Why a projection rather than the Plan Brief JSON:
 *
 * - **Size and shape.** A brief can hold 200 scope nodes and a comparison; a prompt needs
 *   a snapshot whose worst case is known. `COPILOT_LIMITS.contextBytes` is enforced on the
 *   result rather than hoped for.
 * - **Meaning over data.** The model needs "Matrices — not studied, high priority, likely
 *   covered by your curriculum", not the nullable triples that encode it. Closed enums
 *   also stop a label from being read as a claim about the student.
 * - **Nothing private.** No session id, no user id, no quota, no storage keys, no source
 *   urls — only what an interpretation or an explanation could honestly need.
 *
 * The same projection serves two purposes: it is the model's planner context, and it is
 * the *fact base* for explanations, where each fact carries an id the model must quote
 * back so the server can check what an answer was built from.
 */

export interface CopilotContextInput {
  brief: PlanBriefV1;
  readiness: { state: string; missing: readonly string[] };
  /** The account's today, resolved by the caller in the account's own timezone. */
  today: string;
  /** True when a search provider is configured, so research can be described honestly. */
  researchConfigured: boolean;
  /**
   * The hard limits the engine will enforce, or null while the brief is too incomplete to
   * translate. Read by the caller from the same helpers the engine uses.
   */
  hardLimits: { weekly: number | null; session: number | null; unavailableWeekdays: number[] } | null;
  /** The comparison's resolved state, so a stale result is never described as current. */
  comparisonState?: "NOT_RUN" | "READY" | "STALE" | "UNAVAILABLE";
  /** The plan this intake generated, when it has one. */
  plan?: {
    id: string;
    version: number;
    latestDraftRevisionId: string | null;
    activeRevisionId: string | null;
  } | null;
  draftSummary?: { items: number; kinds: string[]; warnings: number } | null;
  confirmedSummary?: PlannerCopilotContextV1["confirmedPlan"];
}

/** The lifecycle the Copilot is operating in, which decides what it may offer. */
export function copilotLifecycle(input: {
  activeRevisionId: string | null;
  latestDraftRevisionId: string | null;
}): "PRE_GENERATION" | "DRAFT_REVIEW" | "CONFIRMED" {
  if (input.activeRevisionId) return "CONFIRMED";
  if (input.latestDraftRevisionId) return "DRAFT_REVIEW";
  return "PRE_GENERATION";
}

/**
 * One unit row, in the vocabulary the comparison and the matrix already use.
 *
 * A unit whose stored answer is a confidence with no coverage statement reads as
 * `UNKNOWN`: the matrix cannot express that combination either, and `UNKNOWN` is the
 * truthful statement about coverage. Nothing here invents a state.
 */
function unitRows(brief: PlanBriefV1): PlannerCopilotContextV1["scopeUnits"] {
  const flat = flattenScope(brief.scope.nodes);
  const entryFor = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
  const compared = brief.comparison
    ? applyOverlapCorrections(brief.comparison, brief.overlapCorrections ?? [])
    : null;
  const overlapFor = new Map((compared?.units ?? []).map((unit) => [unit.unitRef, unit.overlap]));
  return flat.units.slice(0, 60).map((unit) => {
    const entry = entryFor.get(unit.nodeId);
    return {
      label: unit.displayLabel.slice(0, 200),
      preparedness: matrixStateOf(entry) ?? ("UNKNOWN" as const),
      priority: priorityLevel(entry ?? {}) as "NEUTRAL" | "LOW" | "HIGH",
      difficult: entry?.difficult === true,
      overlap: overlapFor.get(unit.nodeId) ?? null,
    };
  });
}

/** The soft preferences the brief states, as bounded pairs. */
function softPreferences(
  brief: PlanBriefV1
): PlannerCopilotContextV1["softPreferences"] {
  return brief.constraints
    .filter((constraint) => constraint.strength === "SOFT")
    .slice(0, 8)
    .map((constraint) => ({ kind: String(constraint.kind).slice(0, 40), value: constraint.value }));
}

export function buildCopilotContext(input: CopilotContextInput): PlannerCopilotContextV1 {
  const brief = input.brief;
  const lifecycle = copilotLifecycle({
    activeRevisionId: input.plan?.activeRevisionId ?? null,
    latestDraftRevisionId: input.plan?.latestDraftRevisionId ?? null,
  });
  const compared = brief.comparison
    ? applyOverlapCorrections(brief.comparison, brief.overlapCorrections ?? [])
    : null;
  const countOf = (state: string) =>
    compared?.units.filter((unit) => unit.overlap === state).length ?? 0;

  const context: PlannerCopilotContextV1 = {
    schemaVersion: 1,
    mode: brief.mode,
    lifecycle,
    readiness: String(input.readiness.state).slice(0, 40),
    missing: input.readiness.missing.slice(0, 6).map((code) => String(code).slice(0, 40)),
    goal: brief.goal.title.slice(0, 200),
    subject: brief.subject.name?.slice(0, 200) ?? null,
    targetDate: brief.target.endDate,
    today: input.today,
    weeklyMinutes: brief.budget.weeklyMinutes,
    hardWeeklyMinutes: input.hardLimits?.weekly ?? null,
    hardSessionMinutes: input.hardLimits?.session ?? null,
    unavailableWeekdays: input.hardLimits?.unavailableWeekdays ?? [],
    softPreferences: softPreferences(brief),
    scopeUnits: unitRows(brief),
    scopeConfirmed: brief.scope.confirmedAt !== null,
    backgroundCurriculum: brief.backgroundCurriculum
      ? [brief.backgroundCurriculum.label, brief.backgroundCurriculum.level]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 200)
      : null,
    comparison: brief.comparison
      ? {
          state: input.comparisonState ?? "READY",
          status: brief.comparison.status,
          counts: {
            covered: countOf("LIKELY_COVERED_BY_CURRICULUM"),
            partial: countOf("PARTIAL_OVERLAP"),
            isNew: countOf("LIKELY_NEW_TO_CURRICULUM"),
            unclear: countOf("UNCLEAR"),
          },
        }
      : null,
    confirmedSources: (brief.scope.provenanceSources ?? []).slice(0, 8).map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      publisherOrDomain: source.publisherOrDomain,
      sourceType: source.sourceType,
      documentDate: source.documentDate,
    })),
    researchPolicy: brief.researchPolicy,
    researchConfigured: input.researchConfigured,
    draft: input.draftSummary ?? null,
    confirmedPlan: input.confirmedSummary ?? null,
  };
  return PlannerCopilotContextV1Schema.parse(context);
}

/** Today for the account, in the account's own timezone. */
export async function copilotToday(tx: Tx | typeof prisma, userId: number): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  return localToday(user.timezone);
}

/**
 * The confirmed-plan summary: counts only.
 *
 * `releasable` and `protectedWork` are derived from the same execution classification the
 * replan engine and the release service use, so the Copilot cannot offer a release the
 * release service would refuse, and cannot promise freedom it does not have.
 */
export async function confirmedPlanSummary(input: {
  tx: Tx | typeof prisma;
  planId: string;
  planVersion: number;
  revisionId: string;
  today: string;
}): Promise<PlannerCopilotContextV1["confirmedPlan"]> {
  const revision = await input.tx.plannerRevision.findFirst({
    where: { id: input.revisionId, planId: input.planId },
    select: { outputSnapshot: true },
  });
  const draft = revision?.outputSnapshot
    ? boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot)
    : null;
  const execution = await readExecution(input.tx, input.planId, input.today);
  const counts = { pending: 0, started: 0, completed: 0, released: 0 };
  let releasable = 0;
  let protectedWork = 0;
  for (const row of execution.rows) {
    const className = classifyExecution(row, input.today);
    if (className === "PENDING_FUTURE" || className === "PENDING_OVERDUE") {
      counts.pending += 1;
      if (row.replannable) releasable += 1;
      continue;
    }
    if (className === "STARTED" || className === "IN_PROGRESS") counts.started += 1;
    else if (className === "COMPLETED") counts.completed += 1;
    else if (row.disposition === "USER_RELEASED" || row.disposition === "DELETED")
      counts.released += 1;
    if (className !== "DELETED" && className !== "DETACHED" && className !== "CONFLICTED")
      protectedWork += 1;
  }
  return {
    planId: input.planId,
    planVersion: input.planVersion,
    revisionId: input.revisionId,
    items: draft?.items.filter((item) => !item.removed).length ?? 0,
    releasable,
    protectedWork,
    execution: counts,
  };
}
