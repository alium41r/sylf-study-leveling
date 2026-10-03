import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  boundedParse,
  DateKeySchema,
  KeySchema,
  ModeSchema,
  OperationKeySchema,
  UserInputV1Schema,
  type UserInputV1,
} from "../contracts";
import {
  PlannerConstraintKindSchema,
  PlannerQuestionReasonSchema,
  hardSessionLimit,
  hardWeeklyLimit,
  unavailableWeekdays,
  type PlannerConstraint,
} from "../constraints";
import { PlannerError } from "../errors";
import { localToday } from "../dates";
import {
  applySmartAnswers,
  assertSupportedAnswers,
  smartQuestions,
  type SmartAnswer,
} from "../smart-setup";
import type { Tx } from "./core";
import {
  bindPlan as bindSessionPlan,
  createOrResumeSession,
  readSession,
  patchSession,
  isExpired,
} from "./intake-session";
import { confirmedScopeSources, researchScope } from "../research/service";
import { importExtractedScope, importPastedScope } from "../research/import-scope";
import {
  comparisonAvailability,
  comparisonIsStale,
  retiredCorrections,
  runCurriculumComparison,
} from "../research/comparison";
import { deepseekComparisonModel } from "../research/deepseek";
import {
  applyOverlapCorrections,
  coverageSuggestionRefs,
  overlapCounts,
  unitsInReviewOrder,
  type OverlapCorrection,
} from "../comparison/contracts";
import type { ExtractionResult } from "../research/contracts";
import { fetchBytesBucket, plannerTelemetry } from "../telemetry";
import { selectSearchProvider } from "../research/search/provider";
import {
  ADVISORY_CONSEQUENCE,
  finding,
  findingEnvelope,
  type PlannerFinding,
} from "../intake/findings";
import {
  emptyComparisonView,
  IntakeActionSchema,
  IntakePatchSchema,
  type IntakeAction,
  type IntakeGeneration,
  type IntakeView,
} from "../intake/actions";
import {
  BRIEF_LIMITS,
  type ScopeNode,
  PlanBriefV1Schema,
  ScopeNodeSchema,
  briefSummary,
  emptyBrief,
  flattenScope,
  mayApplyAuthority,
  scopeStructureIssue,
  serializedBriefBytes,
  type BriefAuthority,
  type PlanBriefV1,
} from "../intake/brief";
import { briefReadiness, type ReadinessResult } from "../intake/readiness";
import { distributeWeeklyBudget, weeklyFromSchedule } from "../intake/distribution";
import { inputFromBrief, type AdapterContext } from "../intake/to-input";
import { matrixPatch } from "../preparedness-matrix";
import { isPreparednessStated } from "../preparedness";
import { targetScopeDigest } from "../research/comparison";

/**
 * The intake service: one brief, one session, one validated write path.
 *
 * Two write shapes, deliberately kept apart:
 *
 * - `PATCH` replaces the whole brief. The brief is small and strict, so replacing
 *   it is unambiguous — there is no deep-merge that could half-apply an edit — and
 *   idempotency is inherent: the same version with the same brief is the same state.
 * - `POST …/action` carries a *typed* operation for the things the client must not
 *   compute for itself: the server-side weekly distribution, Smart Setup answers,
 *   scope confirmation, the readiness gate and generation hand-off. Each action
 *   takes an `actionKey`, so a retry after a lost response replays the prior result
 *   rather than applying twice.
 *
 * Nothing here touches the planner engine: the only way a brief becomes a plan is
 * `requestGeneration` translating it into the existing `UserInputV1` and handing it
 * to the existing generate route, which owns quota, operations, streaming and
 * recovery exactly as before.
 */

// The wire contract lives beside the brief so the Quick Plan UI and this service
// share one definition; see lib/planner/intake/actions.ts.
export {
  IntakeActionSchema,
  IntakePatchSchema,
  type IntakeAction,
  type IntakeGeneration,
  type IntakeView,
};
export type { IntakeMirror } from "../intake/actions";

export const INTAKE_TTL_DAYS = 30;

/**
 * The schedule facts the distribution needs, read in three bounded queries.
 *
 * Floating rest dates and existing Quest workload live only on the server, which is
 * exactly why the client shows this function's distribution rather than estimating
 * one of its own.
 */
export async function intakeScheduleFacts(
  tx: Tx | typeof prisma,
  userId: number,
  firstDate: string,
  lastDate: string
): Promise<{
  timezone: string;
  restWeekdays: number[];
  dailyGoalMinutes: number | null;
  floatingRestDates: string[];
  existingLoadByDate: Record<string, number>;
}> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, restDays: true, dailyGoalMinutes: true },
  });
  const floating = await tx.floatingRestDay.findMany({
    where: { userId, dateKey: { gte: firstDate, lte: lastDate } },
    select: { dateKey: true },
  });
  const quests = await tx.quest.findMany({
    where: {
      userId,
      scheduledFor: { gte: firstDate, lte: lastDate },
      status: { in: ["ACTIVE", "PENDING", "IN_PROGRESS"] },
    },
    select: { scheduledFor: true, targetMinutes: true, requiredMinutes: true },
  });
  const existingLoadByDate: Record<string, number> = {};
  for (const quest of quests) {
    if (!quest.scheduledFor) continue;
    const minutes = Math.max(quest.targetMinutes ?? 0, quest.requiredMinutes ?? 0);
    existingLoadByDate[quest.scheduledFor] =
      (existingLoadByDate[quest.scheduledFor] ?? 0) + Math.max(0, minutes);
  }
  return {
    timezone: user.timezone,
    restWeekdays: [...user.restDays].sort((a, b) => a - b),
    dailyGoalMinutes: user.dailyGoalMinutes ?? null,
    floatingRestDates: floating.map((row) => row.dateKey).sort(),
    existingLoadByDate,
  };
}

/** Recompute the stored distribution and readiness for a brief. */
export async function enrich(
  tx: Tx | typeof prisma,
  userId: number,
  brief: PlanBriefV1
): Promise<{
  brief: PlanBriefV1;
  readiness: ReadinessResult;
  questions: IntakeView["questions"];
  /** The server-only facts the view reports, so the UI never has to estimate them. */
  facts: IntakeFacts;
  today: string;
  findings: PlannerFinding[];
}> {
  const today = await todayFor(tx, userId);
  const endDate = brief.target.endDate ?? addDays(today, 30);
  const facts = await intakeScheduleFacts(tx, userId, today, endDate);
  const scheduleWeeklyMinutes = weeklyFromSchedule({
    dailyGoalMinutes: facts.dailyGoalMinutes,
    restWeekdays: facts.restWeekdays,
  });

  const weekly = brief.budget.weeklyMinutes ?? scheduleWeeklyMinutes ?? 0;
  // An unfinished brief cannot be translated yet, and that is a normal state, not
  // an error: the distribution is still computed from what the student has said so
  // far, and hard unavailable weekdays simply contribute nothing until the brief
  // is complete enough to express them.
  const analysisInput = analysisInputFor(brief, facts, today);
  const distribution = distributeWeeklyBudget({
    weeklyMinutes: weekly,
    firstDate: today,
    lastDate: endDate,
    restWeekdays: facts.restWeekdays,
    floatingRestDates: facts.floatingRestDates,
    hardUnavailableWeekdays: analysisInput ? unavailableWeekdays(analysisInput) : [],
    existingLoadByDate: facts.existingLoadByDate,
    dailyOverrides: brief.budget.dailyOverrides,
  });

  const withDistribution: PlanBriefV1 = {
    ...brief,
    budget: {
      ...brief.budget,
      distribution: {
        dailyMinutes: distribution.dailyMinutes,
        note: distribution.note,
        computedAt: new Date().toISOString(),
      },
    },
  };
  const readiness = briefReadiness(withDistribution, {
    scheduleWeeklyMinutes,
    /**
     * Research is offered only when it could actually help and the student has not
     * declined it: a named goal, no candidate already in hand, and a policy that still
     * allows external lookup. The server decides this, so the surface never offers a
     * search the student has switched off.
     */
    researchAvailable:
      withDistribution.researchPolicy === "ALLOW" &&
      withDistribution.goal.title.trim().length > 0 &&
      withDistribution.scopeCandidate === null,
  });
  return {
    brief: { ...withDistribution, readiness: readiness.state },
    readiness,
    questions: intakeQuestions(brief, facts, today),
    facts: { ...facts, scheduleWeeklyMinutes },
    today,
    findings: advisoriesFor(brief, distribution, today),
  };
}

/**
 * What the intake can honestly warn about *before* generation.
 *
 * Only findings that are genuinely advisory are raised here, and only the ones the
 * intake can already see for itself: a stated weekly target that the horizon cannot
 * hold is a real consequence the student should read before generating, not a reason
 * to refuse. Everything is still a warning — nothing in this list blocks generation,
 * and hard limits are untouched.
 */
function advisoriesFor(
  brief: PlanBriefV1,
  distribution: { dailyMinutes: number[]; shortfallMinutes: number; reachableMinutes: number },
  today: string
): PlannerFinding[] {
  const findings: PlannerFinding[] = [];
  if (brief.budget.weeklyMinutes !== null && distribution.shortfallMinutes > 0)
    findings.push(
      finding("FEASIBILITY_OVERLOADED_AVAILABILITY", { kind: "PLAN" }, ADVISORY_CONSEQUENCE.FEASIBILITY_OVERLOADED_AVAILABILITY)
    );
  const dailyCeiling = 720;
  if (distribution.dailyMinutes.some((minutes) => minutes >= dailyCeiling))
    findings.push(
      finding("INTENSITY_SPIKE", { kind: "PLAN" }, ADVISORY_CONSEQUENCE.INTENSITY_SPIKE)
    );
  if (brief.budget.blockedDates.some((date) => date === today))
    findings.push(
      finding("SCHEDULED_ON_REST_DAY", { kind: "PLAN" }, ADVISORY_CONSEQUENCE.SCHEDULED_ON_REST_DAY)
    );
  return findings;
}

/** The account facts only the server can read; the view carries them for display. */
interface IntakeFacts {
  restWeekdays: number[];
  scheduleWeeklyMinutes: number | null;
}

/**
 * Smart Setup questions for the current brief.
 *
 * Reuse, not reinvention: the questions come from the existing `smartQuestions`
 * uncertainty engine, which already caps itself at three and only asks when an
 * answer would change the plan. A brief too incomplete to translate simply has no
 * questions yet.
 */
function intakeQuestions(
  brief: PlanBriefV1,
  facts: { restWeekdays: number[]; timezone: string; dailyGoalMinutes: number | null },
  today: string
): IntakeView["questions"] {
  const input = analysisInputFor(brief, facts, today);
  if (!input) return [];
  // `whyItMatters` and both halves of each option travel to the UI: the label is what
  // the student reads, and the value is what `answerSmartQuestion` must send back,
  // because the existing Smart Setup merge is keyed by value, not by label.
  return smartQuestions(input as never, 3).map((question) => ({
    reasonCode: question.reasonCode,
    prompt: question.prompt,
    whyItMatters: question.whyItMatters,
    options: question.options.map((option) => ({ value: option.value, label: option.label })),
  }));
}

/**
 * Best-effort translation for *analysis* only — Smart Setup questions and hard
 * constraint reads.
 *
 * It returns `null` while the brief is still incomplete, which is the normal state
 * of an intake the student has not finished. The generation path never uses this:
 * it calls `inputFromBrief` through `assertBriefGeneratable`, so a brief that
 * cannot be translated fails loudly there with a named validation code rather than
 * silently degrading into a plan that ignores what the student asked for.
 */
function analysisInputFor(
  brief: PlanBriefV1,
  facts: { restWeekdays: number[]; dailyGoalMinutes?: number | null },
  today: string
): UserInputV1 | null {
  try {
    return inputFromBrief(brief, {
      today,
      restWeekdays: facts.restWeekdays,
      dailyGoalMinutes: facts.dailyGoalMinutes ?? null,
    });
  } catch {
    return null;
  }
}

/** Strict translation for the paths that must not degrade silently. */
function briefInputFor(
  brief: PlanBriefV1,
  facts: { restWeekdays: number[]; dailyGoalMinutes?: number | null },
  today: string
): UserInputV1 {
  return inputFromBrief(brief, {
    today,
    restWeekdays: facts.restWeekdays,
    dailyGoalMinutes: facts.dailyGoalMinutes ?? null,
  });
}

async function todayFor(tx: Tx | typeof prisma, userId: number): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  try {
    return localToday(user.timezone);
  } catch {
    throw new PlannerError(503, "SCHEDULE_UNAVAILABLE");
  }
}

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** True for the storage layer's "no brief has ever been written" placeholder. */
function isUnwrittenBrief(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
  );
}

/**
 * Parse a stored brief.
 *
 * Two states are distinguished on purpose, because conflating them loses work:
 *
 * - **Never written** (`{}`, the session layer's placeholder — it stores the brief as
 *   opaque bounded JSON and knows nothing about its shape) reads as the mode's empty
 *   brief. That is the normal state of a session the student just created, and
 *   `createIntake` seeds the real empty brief immediately so this is transient.
 * - **Written but unparseable** is a defect, not an empty intake. Falling back to
 *   `emptyBrief` there would silently discard everything the student had entered and
 *   present it as a fresh start, so it fails loudly instead.
 */
function briefOf(session: { brief: unknown; mode: string }): PlanBriefV1 {
  if (isUnwrittenBrief(session.brief))
    return emptyBrief(session.mode as PlanBriefV1["mode"]);
  const parsed = PlanBriefV1Schema.safeParse(session.brief);
  if (parsed.success) return parsed.data;
  console.error("planner intake: stored brief failed to parse", {
    mode: session.mode,
    issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 8),
  });
  throw new PlannerError(422, "INVALID_DRAFT");
}

function assertInvariants(brief: PlanBriefV1): void {
  const structure = scopeStructureIssue(brief.scope.nodes);
  if (structure) throw new PlannerError(422, structure);
  if (serializedBriefBytes(brief) > BRIEF_LIMITS.briefBytes)
    throw new PlannerError(422, "PAYLOAD_TOO_LARGE");
}

export async function createIntake(
  userId: number,
  raw: unknown
): Promise<IntakeView> {
  const body = boundedParse(
    z.strictObject({ schemaVersion: z.literal(1), clientKey: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/), mode: ModeSchema }),
    raw
  );
  const session = await createOrResumeSession(userId, {
    schemaVersion: 1,
    clientKey: body.clientKey,
    mode: body.mode,
  });
  // Seed the real empty brief. Creating an intake is idempotent by `clientKey`, so
  // this only fires for a session the storage layer just created (or one that has
  // never been written to) — a resumed session keeps everything the student entered.
  if (isUnwrittenBrief(session.brief)) {
    const seeded = await patchSession(userId, session.id, {
      schemaVersion: 1,
      expectedVersion: session.version,
      brief: emptyBrief(body.mode),
    });
    return viewOf(userId, seeded);
  }
  return viewOf(userId, session);
}

/**
 * Store a candidate produced by the import route.
 *
 * The route does the file work; this does the session work, so an import is versioned,
 * idempotent and telemetried exactly like every other mutation. A repeated `actionKey`
 * returns the current state untouched rather than re-applying an extraction the student
 * already has.
 */
export async function storeScopeCandidate(
  userId: number,
  sessionId: string,
  input: {
    schemaVersion: 1;
    expectedVersion: number;
    actionKey: string;
    extraction: ExtractionResult;
    sourceTitle: string | null;
  }
): Promise<IntakeView & { import: ImportSummary }> {
  KeySchema.parse(sessionId);
  const session = await readSession(userId, sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  const brief = briefOf(session);
  if ((brief.appliedActions ?? []).includes(input.actionKey))
    return {
      ...(await viewOf(userId, session)),
      import: summariseExtraction(input.extraction),
    };

  const produced = importExtractedScope({
    brief,
    extraction: input.extraction,
    source: { url: "https://upload.sylf.local/syllabus", title: input.sourceTitle },
  });
  const metrics = produced.metrics;
  const counts = {
    mode: brief.mode,
    latencyMs: metrics.latencyMs,
    sourceCount: metrics.sourceCount,
    candidateNodes: metrics.candidateNodeCount,
    partialImport: input.extraction.partial ? 1 : 0,
  };
  plannerTelemetry("scope_import_started", { mode: brief.mode, scopeOrigin: "IMPORT" });
  if (produced.candidate.status === "UNAVAILABLE")
    plannerTelemetry("scope_import_failed", {
      ...counts,
      conflictCode: produced.candidate.failureCode ?? undefined,
    });
  else
    plannerTelemetry("scope_import_completed", {
      ...counts,
      importedTopics: metrics.candidateNodeCount,
    });
  plannerTelemetry("scope_candidate_shown", { ...counts, scopeOrigin: "IMPORT" });

  const withCandidate: PlanBriefV1 = {
    ...brief,
    scopeCandidate: produced.candidate,
    appliedActions: [...(brief.appliedActions ?? []), input.actionKey].slice(-40),
  };
  assertInvariants(withCandidate);
  const stored = await patchSession(userId, sessionId, {
    schemaVersion: 1,
    expectedVersion: input.expectedVersion,
    brief: (await enrich(prisma, userId, withCandidate)).brief,
  });
  return { ...(await viewOf(userId, stored)), import: summariseExtraction(input.extraction) };
}

/** What the surface needs to describe an import honestly. Content-free apart from counts. */
export interface ImportSummary {
  pages: { from: number; to: number }[];
  partial: boolean;
  partialReason: string | null;
  method: ExtractionResult["method"];
}

const summariseExtraction = (extraction: ExtractionResult): ImportSummary => ({
  pages: extraction.pages,
  partial: extraction.partial,
  partialReason: extraction.partialReason,
  method: extraction.method,
});

export async function readIntake(userId: number, sessionId: string): Promise<IntakeView> {
  KeySchema.parse(sessionId);
  const session = await readSession(userId, sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  return viewOf(userId, session);
}

async function viewOf(userId: number, session: { id: string; mode: string; version: number; expiresAt: Date; planId: string | null; brief: unknown }): Promise<IntakeView> {
  const brief = briefOf(session);
  const enriched = await enrich(prisma, userId, brief);
  return {
    id: session.id,
    mode: brief.mode,
    version: session.version,
    expiresAt: session.expiresAt.toISOString(),
    planId: session.planId,
    brief: enriched.brief,
    readiness: enriched.readiness,
    summary: briefSummary(enriched.brief),
    questions: enriched.questions,
    // Facts the browser cannot read for itself: the account's rest weekdays, the
    // weekly figure its own schedule implies, and the hard limits the engine will
    // enforce. A client that estimated any of these would be inventing an answer.
    restWeekdays: [...enriched.facts.restWeekdays].sort((a, b) => a - b),
    scheduleWeeklyMinutes: enriched.facts.scheduleWeeklyMinutes,
    limits: capacityLimitsFor(enriched.brief, enriched.facts, enriched.today),
    comparison: comparisonView(enriched.brief),
    // Advisories the student may accept, in the one envelope the whole planner uses.
    ...findingEnvelope(enriched.findings),
  };
}

/**
 * The comparison, resolved for the surface.
 *
 * Everything that needs a rule lives here rather than in the browser: whether a stored
 * result still applies, which units the student corrected, which corrections were
 * retired by a scope change, and which units a coverage suggestion may be applied to.
 * A client that re-derived any of it could disagree with the server about the same
 * brief — and the disagreement would be about whether overlap still applies, which is
 * exactly the kind of thing that must not be guessed.
 */
export function comparisonView(brief: PlanBriefV1): IntakeView["comparison"] {
  const stored = brief.comparison;
  const corrections = brief.overlapCorrections ?? [];
  const availability = comparisonAvailability(brief, selectSearchProvider() !== null);
  const stale = stored ? comparisonIsStale(stored, brief) : false;
  const applied = stored ? applyOverlapCorrections(stored, corrections) : null;
  const retired = retiredCorrections(corrections, brief);
  return emptyComparisonView({
    available: availability.available,
    unavailableReason: availability.reason,
    state: !stored
      ? "NOT_RUN"
      : stale
        ? "STALE"
        : stored.status === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : "READY",
    status: stored?.status ?? "UNAVAILABLE",
    stale,
    // A stale result is never applied: the rows are withheld rather than shown as if
    // they still described this scope.
    units: stale || !applied ? [] : unitsInReviewOrder(applied.units),
    sources: stale || !stored ? [] : stored.sources,
    unresolved: stale || !stored ? [] : stored.unresolved,
    summary: stale
      ? "Your scope or your background curriculum changed, so this comparison no longer applies. Run it again to refresh it."
      : stored?.summary ?? "",
    counts: overlapCounts(stale || !applied ? [] : applied.units),
    correctedRefs: (stale || !applied ? [] : applied.units)
      .filter((unit) => unit.corrected)
      .map((unit) => unit.unitRef),
    retiredCorrections: retired.length,
    suggestionRefs: stale ? [] : coverageSuggestionRefs(applied),
    backgroundLabel: brief.backgroundCurriculum?.label ?? null,
    createdAt: stored?.createdAt ?? null,
    providerVersion: stored?.providerVersion ?? "",
  });
}

/**
 * Replace the brief.
 *
 * `expectedVersion` guards against a second tab: a stale writer receives
 * `INTAKE_STALE` with the current state rather than silently winning.
 */
export async function patchIntake(
  userId: number,
  sessionId: string,
  raw: unknown
): Promise<IntakeView> {
  KeySchema.parse(sessionId);
  const body = boundedParse(IntakePatchSchema, raw);
  const session = await readSession(userId, sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  const brief = boundedParse(PlanBriefV1Schema, body.brief);
  assertInvariants(brief);
  const enriched = await enrich(prisma, userId, brief);
  const stored = await patchSession(userId, sessionId, {
    schemaVersion: 1,
    expectedVersion: body.expectedVersion,
    brief: enriched.brief,
  });
  return viewOf(userId, stored);
}

/**
 * Apply one typed action.
 *
 * The receipt ring makes a retry safe: a key already applied returns the current
 * state untouched, so a lost response never double-applies an additive change.
 */
export async function applyIntakeAction(
  userId: number,
  sessionId: string,
  raw: unknown
): Promise<IntakeView & { generation?: { requestKey: string; input: UserInputV1 } }> {
  KeySchema.parse(sessionId);
  const action = boundedParse(IntakeActionSchema, raw);
  const session = await readSession(userId, sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");

  const brief = briefOf(session);
  const applied = new Set(brief.appliedActions ?? []);
  if (applied.has(action.actionKey)) return viewOf(userId, session);

  const today = await todayFor(prisma, userId);
  const facts = await intakeScheduleFacts(
    prisma,
    userId,
    today,
    brief.target.endDate ?? addDays(today, 30)
  );

  if (action.action === "requestGeneration") {
    const enriched = await enrich(prisma, userId, brief);
    if (!enriched.readiness.canGenerate)
      throw new PlannerError(422, "BRIEF_NOT_READY");
    const input = briefInputFor(enriched.brief, facts, today);
    /**
     * The one moment the optional work can be measured as *skipped*: the student is
     * generating, so whatever they did not do, they have now done without. Counts and
     * the comparison's state only — never a unit label, a curriculum name or a URL.
     */
    const comparisonState = comparisonView(enriched.brief);
    if (comparisonState.state !== "READY")
      plannerTelemetry("comparison_skipped", {
        mode: brief.mode,
        comparisonUnits: comparisonState.units.length,
        backgroundSourceCount: comparisonState.sources.length,
      });
    if (!enriched.brief.preparedness.some((entry) => isPreparednessStated(entry)))
      plannerTelemetry("preparedness_skipped", {
        mode: brief.mode,
        topics: briefSummary(enriched.brief).units,
        preparednessEdited: 0,
      });
    // The existing generate route owns the operation; the intake only supplies a
    // stable request key, derived from the session so a retry is idempotent there too.
    return {
      ...(await viewOf(userId, session)),
      generation: { requestKey: `intake-${session.id}`, input: UserInputV1Schema.parse(input) },
    };
  }

  if (action.action === "bindPlan") {
    const plan = await prisma.plannerPlan.findUnique({
      where: { userId_creationKey: { userId, creationKey: action.requestKey } },
      select: { id: true },
    });
    if (!plan) throw new PlannerError(404, "NOT_FOUND");
    const stored = await bindSessionPlan(userId, sessionId, plan.id, action.expectedVersion);
    return viewOf(userId, stored);
  }

  /**
   * Research and import produce a *candidate*; they never touch the confirmed scope.
   *
   * Both are handled before the pure `applyToBrief` because they need the provider and
   * the document pipeline, and both end in the same place: a stored candidate awaiting
   * the student's decision. Returning the view (rather than throwing) lets the UI show
   * the candidate, its sources and its honest status in one round trip.
   */
  if (action.action === "researchScope" || action.action === "importScope") {
    const research = action.action === "researchScope";
    if (research)
      plannerTelemetry("research_started", {
        mode: brief.mode,
        scopeOrigin: "RESEARCH",
      });
    else
      plannerTelemetry("scope_import_started", {
        mode: brief.mode,
        scopeOrigin: action.origin === "PASTE" ? "PASTE" : "IMPORT",
      });
    const produced = research
      ? await researchScope({ brief, disabled: brief.researchPolicy === "OFF" })
      : importPastedScope({
          brief,
          text: action.text,
          origin: action.origin,
          sourceTitle: action.sourceTitle ?? null,
        });
    const metrics = produced.metrics;
    // Telemetry reports counts and closed enums only: how many sources, how many nodes,
    // how long — never a URL, a title or a topic.
    // Cost accounting, split the way the goal asks: search, fetch and model measured
    // separately, and everything content-free — counts, buckets and closed enums only.
    const counts = {
      mode: brief.mode,
      latencyMs: metrics.latencyMs,
      researchLatencyMs: metrics.latencyMs,
      sourceCount: metrics.sourceCount,
      officialSourceCount: metrics.officialSourceCount,
      institutionalSourceCount: metrics.institutionalSourceCount,
      secondarySourceCount: metrics.secondarySourceCount,
      candidateNodes: metrics.candidateNodeCount,
      retries: metrics.retries,
      cacheHit: metrics.cacheHit ? 1 : 0,
      searchQueries: metrics.searchCalls,
      searchResults: metrics.searchResults,
      // Phase 1 retrieval shape: what the planner set out to establish, how broadly it
      // searched, and what failed — counts only, never a query, a URL or a domain.
      researchObjectives: metrics.objectives,
      researchQueriesWithResults: metrics.queriesWithResults,
      duplicateQueriesRemoved: metrics.queriesDeduplicated,
      resultsReturned: metrics.resultsReturned,
      // Phase 2: what selection chose, what the evidence contract kept, and what stayed open.
      selectedSources: metrics.selectedSources,
      evidenceClaimsAccepted: metrics.evidenceAccepted,
      evidenceClaimsRejected: metrics.evidenceRejected,
      objectivesCovered: metrics.coverage.covered,
      objectivesPartial: metrics.coverage.partial,
      objectivesUnanswered: metrics.coverage.unanswered,
      objectivesConflicted: metrics.coverage.conflicted,
      highPriorityUnanswered: metrics.coverage.highPriorityUnanswered,
      followupRoundUsed: metrics.followUpUsed ? 1 : 0,
      followupQueries: metrics.followupQueries,
      uniqueSourceDomains: metrics.uniqueDomains,
      crossConfirmedSources: metrics.crossConfirmed,
      duplicateResultsRemoved: metrics.duplicatesRemoved,
      fetchFailures: metrics.fetchFailures,
      sourceCandidates: metrics.sourceCandidates,
      sourcesFetched: metrics.sourcesFetched,
      httpRequests: metrics.httpRequests,
      deepseekCalls: metrics.modelCalls,
      researchPasses: metrics.modelPasses,
      providerCalls: metrics.modelCalls,
    };
    const backend = {
      researchBackend: "DEEPSEEK_SEARCH" as const,
      searchProvider: selectSearchProvider()?.id ?? ("none" as const),
      // Only research runs have a depth; an import never planned anything, and reporting the
      // fallback tier for it would claim a decision nobody made.
      ...(research ? { researchDepth: metrics.depth } : {}),
      fetchBytesBucket: fetchBytesBucket(metrics.fetchBytes),
    };
    if (produced.candidate.status === "UNAVAILABLE")
      plannerTelemetry(research ? "research_failed" : "scope_import_failed", {
        ...counts,
        ...backend,
        researchStatus: "UNAVAILABLE",
        conflictCode: produced.candidate.failureCode ?? undefined,
      });
    else if (research)
      plannerTelemetry("research_completed", {
        ...counts,
        ...backend,
        researchStatus: produced.candidate.status,
      });
    else
      plannerTelemetry("scope_import_completed", {
        ...counts,
        importedTopics: metrics.candidateNodeCount,
        partialImport: produced.candidate.openQuestions.length > 0 ? 1 : 0,
      });
    plannerTelemetry("scope_candidate_shown", {
      ...counts,
      ...backend,
      researchStatus: produced.candidate.status,
      scopeOrigin: produced.candidate.origin,
    });
    const withCandidate: PlanBriefV1 = {
      ...brief,
      scopeCandidate: produced.candidate,
      appliedActions: [...(brief.appliedActions ?? []), action.actionKey].slice(-40),
    };
    assertInvariants(withCandidate);
    const stored = await patchSession(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: action.expectedVersion,
      brief: (await enrich(prisma, userId, withCandidate)).brief,
    });
    return viewOf(userId, stored);
  }

  // Comparing curricula is research-backed and produces display-only overlap data: it
  // never writes preparedness and never touches the confirmed scope.
  if (action.action === "compareCurricula") {
    plannerTelemetry("comparison_started", { mode: brief.mode });
    const produced = await runCurriculumComparison({
      brief,
      search: selectSearchProvider(),
      model: deepseekComparisonModel(),
      force: action.force === true,
    });
    const comparison = produced.comparison;
    const metrics = produced.metrics;
    const counts = overlapCounts(comparison.units);
    if (comparison.status === "UNAVAILABLE") {
      plannerTelemetry("comparison_failed", {
        mode: brief.mode,
        latencyMs: metrics.latencyMs,
        conflictCode: comparison.failureCode ?? undefined,
        searchProvider: comparison.searchProvider,
        searchQueries: metrics.searchCalls,
        searchResults: metrics.searchResults,
        sourcesFetched: metrics.sourcesFetched,
        deepseekCalls: metrics.modelCalls,
        modelPasses: metrics.modelPasses,
      });
    } else if (metrics.cacheHit) {
      plannerTelemetry("comparison_cached", {
        mode: brief.mode,
        latencyMs: metrics.latencyMs,
        comparisonCacheHit: 1,
        comparisonUnits: comparison.units.length,
        ...overlapTelemetry(counts),
      });
    } else {
      plannerTelemetry("comparison_completed", {
        mode: brief.mode,
        latencyMs: metrics.latencyMs,
        researchLatencyMs: metrics.latencyMs,
        comparisonCacheHit: 0,
        comparisonUnits: comparison.units.length,
        comparisonBytesIn: metrics.inputChars,
        comparisonBytesOut: metrics.outputChars,
        backgroundUnitCount: metrics.backgroundUnits,
        backgroundSourceCount: metrics.sourceCount,
        sourceCount: metrics.sourceCount,
        officialSourceCount: metrics.officialSourceCount,
        institutionalSourceCount: metrics.institutionalSourceCount,
        secondarySourceCount: metrics.secondarySourceCount,
        searchQueries: metrics.searchCalls,
        searchResults: metrics.searchResults,
        sourcesFetched: metrics.sourcesFetched,
        deepseekCalls: metrics.modelCalls,
        modelPasses: metrics.modelPasses,
        fetchBytesBucket: fetchBytesBucket(metrics.fetchBytes),
        searchProvider: comparison.searchProvider,
        ...overlapTelemetry(counts),
      });
    }
    const withComparison: PlanBriefV1 = {
      ...brief,
      // A failed attempt is recorded too: the student sees the reason in place, and the
      // next run is a deliberate act rather than an automatic retry.
      comparison,
      appliedActions: [...(brief.appliedActions ?? []), action.actionKey].slice(-40),
    };
    assertInvariants(withComparison);
    const stored = await patchSession(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: action.expectedVersion,
      brief: (await enrich(prisma, userId, withComparison)).brief,
    });
    return viewOf(userId, stored);
  }

  const next = applyToBrief(brief, action, facts, today);
  /**
   * Phase 3's three "the student did something" events, emitted where the write happens
   * rather than where the surface thinks it did: a correction, an accepted coverage
   * suggestion, and a bulk matrix edit. Counts only — never a unit label or a state.
   */
  if (action.action === "setOverlapCorrection" && !action.clear)
    plannerTelemetry("overlap_corrected", { mode: brief.mode, overlapCorrectedCount: 1 });
  if (action.action === "applyCoverageSuggestion") {
    const eligible = coverageSuggestionRefs(
      brief.comparison ? applyOverlapCorrections(brief.comparison, brief.overlapCorrections ?? []) : null
    );
    const applied = action.nodeIds?.length ?? eligible.length;
    plannerTelemetry("coverage_suggestion_applied", {
      mode: brief.mode,
      preparednessSuggested: applied,
      preparednessEdited: applied,
    });
  }
  if (action.action === "bulkSetPreparedness" || action.action === "clearPreparedness")
    plannerTelemetry("preparedness_bulk_applied", {
      mode: brief.mode,
      preparednessEdited: action.nodeIds.length,
      preparednessBulkEdits: 1,
    });
  if (action.action === "confirmScope") {
    const candidate = brief.scopeCandidate;
    plannerTelemetry("scope_confirmed", {
      mode: brief.mode,
      scopeOrigin: candidate
        ? candidate.origin === "RESEARCH"
          ? "RESEARCH_CONFIRMED"
          : "IMPORT_CONFIRMED"
        : "MANUAL",
      confirmedNodes: next.scope.nodes.length,
      // What the student chose to drop, and what they had typed themselves on top of
      // the candidate — the two numbers that say whether research was actually useful.
      editedNodes: candidate ? candidate.nodes.length - next.scope.nodes.length : 0,
      sourceCount: next.scope.provenanceRefs.length,
    });
  }
  const withReceipt: PlanBriefV1 = {
    ...next,
    appliedActions: [...(brief.appliedActions ?? []), action.actionKey].slice(-40),
  };
  assertInvariants(withReceipt);
  const enriched = await enrich(prisma, userId, withReceipt);
  const stored = await patchSession(userId, sessionId, {
    schemaVersion: 1,
    expectedVersion: action.expectedVersion,
    brief: enriched.brief,
  });
  return viewOf(userId, stored);
}

/** Overlap counts, as telemetry metadata: four counts, never a unit label. */
function overlapTelemetry(counts: {
  covered: number;
  partial: number;
  isNew: number;
  unclear: number;
}) {
  return {
    overlapCoveredCount: counts.covered,
    overlapPartialCount: counts.partial,
    overlapNewCount: counts.isNew,
    overlapUnclearCount: counts.unclear,
  };
}

/**
 * Apply several brief commands as one atomic intake mutation.
 *
 * This is the Copilot's write path for everything that only changes the working brief. Two
 * properties matter, and both come from doing this work here rather than in a caller:
 *
 * - **All or nothing.** Every command is folded into an in-memory brief first; a command
 *   that refuses aborts the whole batch before anything is persisted, so a four-command
 *   request can never leave a half-updated brief.
 * - **One version increment.** The batch is a single `patchSession` write, so
 *   `expectedVersion` means what it says: either this batch applied against that version
 *   or it did not.
 *
 * The commands arrive already validated and already mapped by the Copilot service, so this
 * function never sees model output — only typed actions.
 */
export async function applyBriefCommandBatch(
  userId: number,
  sessionId: string,
  input: {
    commands: Exclude<
      IntakeAction,
      | { action: "requestGeneration" }
      | { action: "bindPlan" }
      | { action: "researchScope" }
      | { action: "importScope" }
      | { action: "compareCurricula" }
    >[];
    expectedVersion: number;
    actionKey: string;
  }
): Promise<IntakeView> {
  KeySchema.parse(sessionId);
  const session = await readSession(userId, sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  const brief = briefOf(session);
  const today = await todayFor(prisma, userId);
  const facts = await intakeScheduleFacts(
    prisma,
    userId,
    today,
    brief.target.endDate ?? addDays(today, 30)
  );
  // Fold first: any refusal happens here, before a single byte is written.
  let next = brief;
  for (const command of input.commands) next = applyToBrief(next, command, facts, today);
  const withReceipt: PlanBriefV1 = {
    ...next,
    appliedActions: [...(brief.appliedActions ?? []), input.actionKey].slice(-40),
  };
  assertInvariants(withReceipt);
  const stored = await patchSession(userId, sessionId, {
    schemaVersion: 1,
    expectedVersion: input.expectedVersion,
    brief: (await enrich(prisma, userId, withReceipt)).brief,
  });
  return viewOf(userId, stored);
}

/**
 * The pure part: what each action does to a brief. No database, no clock.
 *
 * Exported for the Copilot's batched apply, which folds several of these over one brief
 * and persists once. Reusing this function — rather than re-implementing "what does
 * setting the weekly budget mean" — is what keeps a natural-language change identical to
 * the same change made in the structured UI.
 */
export function applyToBrief(
  brief: PlanBriefV1,
  action: Exclude<IntakeAction, { action: "requestGeneration" } | { action: "bindPlan" } | { action: "researchScope" } | { action: "importScope" } | { action: "compareCurricula" }>,
  facts: { restWeekdays: number[]; dailyGoalMinutes: number | null },
  today: string
): PlanBriefV1 {
  const claim = (field: keyof NonNullable<PlanBriefV1["authority"]>) =>
    authorityClaim(brief, field, "USER_CURRENT");
  switch (action.action) {
    case "setGoal":
      return {
        ...brief,
        goal: { title: action.title, ...(action.objective ? { objective: action.objective } : {}) },
        authority: claim("goal"),
      };
    case "setMode": {
      // A mode is part of the brief's meaning, so switching is only allowed while
      // nothing mode-specific has been stated.
      const untouched =
        !brief.scope.nodes.length && !brief.goal.title.trim() && brief.preparedness.length === 0;
      if (!untouched) throw new PlannerError(409, "MODE_LOCKED");
      return { ...emptyBrief(action.mode), appliedActions: brief.appliedActions };
    }
    case "setBackground":
      /**
       * The board/level selects on the Quick Plan surface.
       *
       * They are partial edits by nature — changing the board must not discard the
       * subjects the student already named — so an absent `subjects` means "leave what
       * is there", and only an explicitly empty statement clears the whole field.
       */
      return {
        ...brief,
        backgroundCurriculum: withBackground(brief, {
          label: action.label,
          level: action.level,
          board: action.board,
          subjects: action.subjects,
        }),
        authority: claim("backgroundCurriculum"),
      };
    case "setBackgroundCurriculum":
      /**
       * The background-curriculum control: qualification, level, board and subjects in
       * one typed write. `label: null` clears the field, which is also what the student
       * sees as "remove this".
       */
      return {
        ...brief,
        backgroundCurriculum: withBackground(brief, {
          label: action.label,
          level: action.level,
          board: action.board,
          subjects: action.subjects,
        }),
        // A changed background makes a stored comparison stale; it is kept, not applied,
        // and the surface offers to run it again rather than showing old overlap.
        authority: claim("backgroundCurriculum"),
      };
    case "setSubject":
      return {
        ...brief,
        subject: {
          // Cleared for both id and name reads back as unstated, not as an empty
          // free-text subject — the brief must be able to say "nothing yet".
          kind: action.subjectId ? "SYLF_SUBJECT" : action.name ? "FREE_TEXT" : null,
          subjectId: action.subjectId,
          name: action.name,
        },
        authority: claim("subject"),
      };
    case "setTargetDate":
      return {
        ...brief,
        target: {
          endDate: action.endDate,
          examDate:
            brief.mode === "EXAM" ? action.examDate ?? action.endDate : action.examDate ?? null,
        },
        authority: claim("targetDate"),
      };
    case "setWeeklyBudget":
      return {
        ...brief,
        budget: { ...brief.budget, weeklyMinutes: action.weeklyMinutes },
        authority: claim("budget"),
      };
    case "setDailyOverrides":
      return { ...brief, budget: { ...brief.budget, dailyOverrides: action.dailyOverrides } };
    case "markUnavailableDay": {
      if (action.date !== undefined && action.unavailable)
        return {
          ...brief,
          budget: {
            ...brief.budget,
            blockedDates: [...new Set([...brief.budget.blockedDates, action.date])].sort(),
          },
        };
      if (action.date !== undefined && !action.unavailable)
        return {
          ...brief,
          budget: {
            ...brief.budget,
            blockedDates: brief.budget.blockedDates.filter((date) => date !== action.date),
          },
        };
      if (action.weekday !== undefined)
        return {
          ...brief,
          constraints: withConstraint(brief.constraints, {
            kind: "UNAVAILABLE_WEEKDAY",
            strength: "HARD",
            value: action.weekday,
            source: "USER_EXPLICIT",
            ...(action.unavailable ? {} : { value: -1 }),
          }, action.unavailable),
        };
      throw new PlannerError(422, "INVALID_REQUEST");
    }
    case "setRecoveryReserve":
      return {
        ...brief,
        budget: {
          ...brief.budget,
          recoveryPercent: action.recoveryPercent,
          acceptReducedReserve: action.acceptReducedReserve ?? brief.budget.acceptReducedReserve,
        },
        authority: claim("budget"),
      };
    case "updateScopeUnits": {
      let nodes = [...brief.scope.nodes];
      // Labels the student has taken out, so a later candidate cannot quietly restore
      // them — carried on the brief, not in this function's memory.
      const removedLabels = [...(brief.scope.removedLabels ?? [])];
      for (const node of action.add ?? []) {
        if (nodes.some((entry) => entry.nodeId === node.nodeId)) continue;
        nodes.push(node);
        // Re-adding a unit the student had removed clears the note: they changed their mind.
        const index = removedLabels.findIndex((label) => label.toLowerCase() === node.label.toLowerCase());
        if (index >= 0) removedLabels.splice(index, 1);
      }
      for (const nodeId of action.remove ?? []) {
        const gone = brief.scope.nodes.find((node) => node.nodeId === nodeId);
        if (gone && !removedLabels.some((label) => label.toLowerCase() === gone.label.toLowerCase()))
          removedLabels.push(gone.label);
        const doomed = new Set([nodeId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const node of nodes)
            if (node.parentId && doomed.has(node.parentId) && !doomed.has(node.nodeId)) {
              doomed.add(node.nodeId);
              grew = true;
            }
        }
        nodes = nodes.filter((node) => !doomed.has(node.nodeId));
      }
      for (const rename of action.rename ?? [])
        nodes = nodes.map((node) =>
          node.nodeId === rename.nodeId ? { ...node, label: rename.label } : node
        );
      for (const select of action.select ?? [])
        nodes = nodes.map((node) =>
          node.nodeId === select.nodeId ? { ...node, selected: select.selected } : node
        );
      for (const move of action.move ?? [])
        nodes = nodes.map((node) =>
          node.nodeId === move.nodeId ? { ...node, parentId: move.parentId } : node
        );
      return {
        ...brief,
        scope: {
          ...brief.scope,
          /**
           * Editing the scope invalidates a previous confirmation: the student must
           * confirm what is actually there.
           *
           * The confirmed provenance is withdrawn with it. That snapshot is evidence for
           * *a specific confirmation* — the sources read when the student confirmed these
           * units — and once the units change it no longer supports what is on screen.
           * Keeping it would present historical evidence as if it justified an edited,
           * unconfirmed scope, which is exactly the misleading state to avoid. The brief
           * keeps no history of previous confirmations (that belongs to sealed Planner
           * revisions, which this patch does not touch), so the smallest coherent rule is
           * that provenance lives and dies with the confirmation; the next confirmation
           * writes a new one.
           */
          confirmedAt: null,
          provenanceRefs: [],
          provenanceSources: [],
          nodes,
          removedLabels: removedLabels.slice(-50),
        },
        authority: claim("scope"),
      };
    }
    case "setPreparedness": {
      const targets = new Set(action.nodeIds);
      const others = brief.preparedness.filter((entry) => !targets.has(entry.nodeId));
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const merged = action.nodeIds.map((nodeId) => {
        const current = existing.get(nodeId);
        return {
          nodeId,
          covered: action.covered !== undefined ? action.covered : current?.covered ?? null,
          confidence:
            action.confidence !== undefined ? action.confidence : current?.confidence ?? null,
          difficult: action.difficult !== undefined ? action.difficult : current?.difficult ?? null,
          ...(current?.priority ? { priority: current.priority } : {}),
          ...(current?.prioritySource ? { prioritySource: current.prioritySource } : {}),
        };
      });
      return { ...brief, preparedness: [...others, ...merged] };
    }
    case "setPriority": {
      const targets = new Set(action.nodeIds);
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const others = brief.preparedness.filter((entry) => !targets.has(entry.nodeId));
      const merged = action.nodeIds.map((nodeId) => ({
        nodeId,
        covered: existing.get(nodeId)?.covered ?? null,
        confidence: existing.get(nodeId)?.confidence ?? null,
        difficult: existing.get(nodeId)?.difficult ?? null,
        priority: action.priority,
        prioritySource: action.prioritySource,
      }));
      return { ...brief, preparedness: [...others, ...merged] };
    }
    case "setConstraint":
      return {
        ...brief,
        constraints: withConstraint(brief.constraints, {
          kind: action.kind,
          strength: action.strength,
          value: action.value,
          source: "USER_EXPLICIT",
          ...(action.preferenceWeight !== undefined ? { preferenceWeight: action.preferenceWeight } : {}),
        }, !action.remove),
      };
    case "answerSmartQuestion": {
      // Reuse the existing Smart Setup merge, then read back the fields it owns:
      // constraints, and the priority/size signals it writes onto topics.
      const input = briefInputFor(brief, facts, today);
      const answers: SmartAnswer[] = [{ reasonCode: action.reasonCode, value: action.value }];
      try {
        assertSupportedAnswers(input as never, answers);
      } catch {
        throw new PlannerError(422, "UNSUPPORTED_SMART_ANSWER");
      }
      const applied = applySmartAnswers(input, answers);
      const constraints = (applied.constraints ?? []) as PlannerConstraint[];
      const flat = flattenScope(brief.scope.nodes);
      const updatedTopics = "exam" in applied && applied.exam
        ? applied.exam.topics
        : "roadmap" in applied && applied.roadmap
          ? applied.roadmap.topics
          : "mastery" in applied && applied.mastery
            ? applied.mastery.topics
            : [];
      const byLabel = new Map(flat.units.map((unit) => [unit.label, unit.nodeId]));
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const preparedness = [...brief.preparedness];
      for (const topic of updatedTopics) {
        const nodeId = byLabel.get(topic.label);
        if (!nodeId) continue;
        const current = existing.get(nodeId);
        const entry = {
          nodeId,
          covered: current?.covered ?? topic.covered ?? null,
          confidence: current?.confidence ?? topic.confidence ?? null,
          difficult: current?.difficult ?? topic.difficult ?? null,
          ...(topic.priority ? { priority: topic.priority } : {}),
          ...(topic.prioritySource ? { prioritySource: topic.prioritySource } : {}),
        };
        const index = preparedness.findIndex((row) => row.nodeId === nodeId);
        if (index >= 0) preparedness[index] = entry;
        else preparedness.push(entry);
      }
      return { ...brief, constraints, preparedness };
    }
    /**
     * The student's decision about the scope.
     *
     * Two shapes, one meaning. Without a candidate this confirms scope the student
     * entered themselves (Phase 1 behaviour, unchanged). With a candidate it copies the
     * chosen nodes into the confirmed scope and records where they came from — and it
     * is the *only* code path in the tree that may do that, which is what keeps an
     * unconfirmed research result structurally unable to reach generation.
     */
    case "confirmScope": {
      const candidate = brief.scopeCandidate;
      if (!candidate)
        /**
         * Confirming a scope the student typed themselves.
         *
         * There is no candidate and therefore no source material, so the confirmation's
         * provenance is empty rather than stale: whatever refs an earlier confirmation
         * left are not evidence for this one.
         */
        return {
          ...brief,
          scope: {
            ...brief.scope,
            confirmedAt: new Date().toISOString(),
            provenanceRefs: [],
            provenanceSources: [],
          },
        };
      const additions = action.additions ?? [];
      // No explicit selection means the units the student left ticked — which is how a
      // unit they removed stays removed instead of being restored by a fresh candidate.
      const keep = new Set(
        action.nodeIds ?? candidate.nodes.filter((node) => node.selected).map((node) => node.nodeId)
      );
      const known = new Set(candidate.nodes.map((node) => node.nodeId));
      const added = new Set(additions.map((node) => node.nodeId));
      // An id that is in neither the candidate nor the student's own additions is a
      // decision about something that does not exist: refuse rather than quietly
      // confirming a different set. Re-added units may not collide with candidate ids.
      if (keep && [...keep].some((nodeId) => !known.has(nodeId) && !added.has(nodeId)))
        throw new PlannerError(422, "UNKNOWN_SCOPE_NODE");
      if (additions.some((node) => known.has(node.nodeId)))
        throw new PlannerError(422, "DUPLICATE_SCOPE_NODE");
      const renames = new Map((action.renames ?? []).map((entry) => [entry.nodeId, entry.label]));
      const named = (node: ScopeNode): ScopeNode =>
        renames.has(node.nodeId) ? { ...node, label: renames.get(node.nodeId)! } : node;
      const nodes = [
        // The student's own additions come last and carry no sources: they are their
        // wording, not the source's, and claiming a source for them would be a lie.
        ...pruneScopeNodes(candidate.nodes, keep).map(named),
        ...additions.map((node) => ({ ...node, selected: node.selected ?? true, sourceIds: undefined })),
      ];
      /**
       * The confirmation's own provenance, made durable in the same write.
       *
       * This is the only moment the candidate still exists, so the referenced source
       * records are copied here — bounded, deduplicated, content-free (see
       * `confirmedScopeSources`) — and then the candidate is cleared. From this point the
       * confirmed scope can resolve every ref it holds, with no dependence on a research
       * run, a search result or the authority registry.
       *
       * The snapshot is frozen: `updateScopeUnits` withdraws it with the confirmation, and
       * a later confirmation writes a fresh one. Nothing else in the tree writes it.
       */
      const confirmed = confirmedScopeSources(candidate, nodes);
      return {
        ...brief,
        scope: {
          source: candidate.origin === "RESEARCH" ? "RESEARCH_CONFIRMED" : "IMPORT_CONFIRMED",
          confirmedAt: new Date().toISOString(),
          provenanceRefs: confirmed.provenanceRefs,
          provenanceSources: confirmed.provenanceSources,
          nodes,
          // Units the student re-added while reviewing stop being "removed".
          removedLabels: brief.scope.removedLabels.filter(
            (label) => !nodes.some((node) => node.label.toLowerCase() === label.toLowerCase())
          ),
        },
        // The candidate is spent: keeping it would re-offer a scope the student has
        // already decided about, and a later research run starts from a fresh one.
        scopeCandidate: null,
        authority: claim("scope"),
      };
    }
    case "discardScopeCandidate":
      return { ...brief, scopeCandidate: null };
    case "setScopeResearchPolicy":
      return {
        ...brief,
        researchPolicy: action.policy,
        // Turning external lookup off withdraws any candidate it produced: keeping it
        // would leave the student reviewing work they just said they did not want.
        ...(action.policy === "OFF" ? { scopeCandidate: null } : {}),
      };
    /**
     * The student's correction of one unit's overlap.
     *
     * Stored beside the comparison rather than inside it, so a re-run cannot rewrite a
     * person's answer and the record of what Sylf said is preserved. The correction
     * carries the scope digest it was made against, so it retires rather than
     * misapplying when the confirmed scope changes under it.
     */
    case "setOverlapCorrection": {
      const known = new Set(flattenScope(brief.scope.nodes).units.map((unit) => unit.nodeId));
      if (!known.has(action.unitRef)) throw new PlannerError(422, "UNKNOWN_SCOPE_NODE");
      const rest = (brief.overlapCorrections ?? []).filter((entry) => entry.unitRef !== action.unitRef);
      if (action.clear) return { ...brief, overlapCorrections: rest };
      const correction: OverlapCorrection = {
        unitRef: action.unitRef,
        overlap: action.overlap,
        targetScopeDigest: targetScopeDigest(brief),
        correctedAt: new Date().toISOString(),
      };
      return {
        ...brief,
        overlapCorrections: [...rest, correction].slice(-BRIEF_LIMITS.overlapCorrections),
      };
    }
    /**
     * Bulk preparedness from the matrix.
     *
     * The same merge path as `setPreparedness`: the matrix is a view of the existing
     * nullable contract, not a second vocabulary. Priority is never touched, and the
     * difficult flag is preserved because "what state is this unit in" and "is this unit
     * hard for me" are separate answers the student gives deliberately.
     */
    case "bulkSetPreparedness": {
      const patch = matrixPatch(action.state);
      const targets = new Set(action.nodeIds);
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const others = brief.preparedness.filter((entry) => !targets.has(entry.nodeId));
      const merged = action.nodeIds.map((nodeId) => {
        const current = existing.get(nodeId);
        return {
          nodeId,
          covered: patch.covered,
          confidence: patch.confidence,
          difficult: current?.difficult ?? null,
          ...(current?.priority ? { priority: current.priority } : {}),
          ...(current?.prioritySource ? { prioritySource: current.prioritySource } : {}),
        };
      });
      return { ...brief, preparedness: [...others, ...merged] };
    }
    case "setDifficulty": {
      const targets = new Set(action.nodeIds);
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const others = brief.preparedness.filter((entry) => !targets.has(entry.nodeId));
      const merged = action.nodeIds.map((nodeId) => {
        const current = existing.get(nodeId);
        return {
          nodeId,
          covered: current?.covered ?? null,
          confidence: current?.confidence ?? null,
          difficult: action.difficult,
          ...(current?.priority ? { priority: current.priority } : {}),
          ...(current?.prioritySource ? { prioritySource: current.prioritySource } : {}),
        };
      });
      return { ...brief, preparedness: [...others, ...merged] };
    }
    /**
     * Back to "not rated" for a set of units.
     *
     * Coverage, confidence and difficulty all return to unstated — the three fields the
     * matrix shows. Priority survives on purpose: it is a separate, deliberate answer,
     * and resetting preparedness has no business discarding it. An entry with nothing
     * left to say is removed rather than stored empty, because a sparse brief is what
     * "not stated" already means.
     */
    case "clearPreparedness": {
      const targets = new Set(action.nodeIds);
      if (!targets.size) return brief;
      const kept: PlanBriefV1["preparedness"] = [];
      for (const entry of brief.preparedness) {
        if (!targets.has(entry.nodeId)) {
          kept.push(entry);
          continue;
        }
        if (entry.priority || entry.prioritySource)
          kept.push({
            nodeId: entry.nodeId,
            covered: null,
            confidence: null,
            difficult: null,
            ...(entry.priority ? { priority: entry.priority } : {}),
            ...(entry.prioritySource ? { prioritySource: entry.prioritySource } : {}),
          });
      }
      return { ...brief, preparedness: kept };
    }
    /**
     * Accept "studied, confidence not rated" for units the comparison placed in the
     * background curriculum — the one click §25 allows, and only for those units.
     *
     * `covered: true, confidence: null` is the whole write. Sylf never supplies a
     * confidence here, and a unit outside the eligible set is refused rather than
     * quietly accepted, so this action cannot become a blanket rating.
     */
    case "applyCoverageSuggestion": {
      const applied = brief.comparison
        ? applyOverlapCorrections(brief.comparison, brief.overlapCorrections ?? [])
        : null;
      const eligible = new Set(coverageSuggestionRefs(applied));
      const requested = action.nodeIds ?? [...eligible];
      if (!requested.length) return brief;
      if (requested.some((nodeId) => !eligible.has(nodeId)))
        throw new PlannerError(422, "UNKNOWN_SCOPE_NODE");
      const targets = new Set(requested);
      const existing = new Map(brief.preparedness.map((entry) => [entry.nodeId, entry]));
      const others = brief.preparedness.filter((entry) => !targets.has(entry.nodeId));
      const merged = requested.map((nodeId) => {
        const current = existing.get(nodeId);
        return {
          nodeId,
          covered: true,
          // Never a number: the student said "studied", not "how confident".
          confidence: null,
          difficult: current?.difficult ?? null,
          ...(current?.priority ? { priority: current.priority } : {}),
          ...(current?.prioritySource ? { prioritySource: current.prioritySource } : {}),
        };
      });
      return { ...brief, preparedness: [...others, ...merged] };
    }
  }
}

/**
 * Keep the chosen nodes, and keep the tree well-formed.
 *
 * A child whose parent was removed is re-parented to its nearest surviving ancestor
 * rather than dropped: the student removed a heading, not the topics under it. When no
 * ancestor survives the unit becomes top-level, which the engine accepts.
 */
function pruneScopeNodes(
  nodes: readonly ScopeNode[],
  keep: ReadonlySet<string> | null
): ScopeNode[] {
  if (!keep) return nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const kept = new Set(keep);
  const reParent = (node: ScopeNode): string | null => {
    let cursor = node.parentId;
    const seen = new Set<string>([node.nodeId]);
    while (cursor) {
      if (seen.has(cursor)) return null;
      seen.add(cursor);
      if (kept.has(cursor)) return cursor;
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return null;
  };
  return nodes
    .filter((node) => kept.has(node.nodeId))
    .map((node) => ({ ...node, parentId: reParent(node) }));
}

/**
 * Merge a background-curriculum edit into the brief.
 *
 * One place decides what "absent" means per field, because the two callers mean
 * different things by it: the board/level selects send one field and must keep the
 * rest, while the background control sends the whole shape. `undefined` therefore
 * means "leave as it was" and `null` means "clear", for every field but `label` —
 * whose `null` clears the whole qualification, since a background with no name is not
 * a background.
 */
function withBackground(
  brief: PlanBriefV1,
  incoming: {
    label: string | null | undefined;
    level: string | null | undefined;
    board: string | null | undefined;
    subjects: string[] | undefined;
  }
): PlanBriefV1["backgroundCurriculum"] {
  const current = brief.backgroundCurriculum;
  if (incoming.label === null) return null;
  const label = incoming.label?.trim() || current?.label || brief.goal.title.trim() || "Study programme";
  const level = incoming.level === undefined ? current?.level ?? null : incoming.level;
  const board = incoming.board === undefined ? current?.board ?? null : incoming.board;
  const subjects = (incoming.subjects ?? current?.subjects ?? [])
    .map((subject) => subject.trim())
    .filter(Boolean)
    .slice(0, BRIEF_LIMITS.backgroundSubjects);
  const stated = Boolean(incoming.label?.trim() || level || board || subjects.length || current);
  if (!stated) return null;
  return { label, level, board, ...(subjects.length ? { subjects } : {}) };
}

/** Set, replace, or remove constraints of one kind. */function withConstraint(
  constraints: readonly PlannerConstraint[],
  incoming: PlannerConstraint,
  add: boolean
): PlannerConstraint[] {
  const without = constraints.filter((constraint) => constraint.kind !== incoming.kind);
  if (!add || incoming.value < 0) return without;
  // `UNAVAILABLE_WEEKDAY` and `PREFER_*` are repeatable by design; the rest replace.
  const repeatable = incoming.kind === "UNAVAILABLE_WEEKDAY";
  return repeatable && constraints.some((constraint) => constraint.kind === incoming.kind && constraint.value === incoming.value)
    ? [...constraints]
    : [...without, incoming];
}

/** Record a provenance claim for a field, keeping the strongest authority. */
function authorityClaim(
  brief: PlanBriefV1,
  field: string,
  incoming: BriefAuthority
): NonNullable<PlanBriefV1["authority"]> {
  const current = brief.authority?.[field];
  return mayApplyAuthority(current, incoming)
    ? { ...(brief.authority ?? {}), [field]: incoming }
    : { ...(brief.authority ?? {}) };
}

/**
 * The hard limits a brief must respect, surfaced for the UI.
 *
 * Read from the existing constraint helpers so the intake shows exactly what the
 * engine will enforce, rather than a second opinion about the same numbers.
 */
export function capacityLimitsFor(brief: PlanBriefV1, facts: { restWeekdays: number[] }, today: string) {
  const input = analysisInputFor(brief, facts, today);
  // An unfinished brief has no hard limits to show yet. Reporting `null` is honest;
  // reporting 0 would read as "you may not study at all".
  if (!input)
    return {
      sessionLimitMinutes: null as number | null,
      weeklyLimitMinutes: null as number | null,
      unavailableWeekdays: [] as number[],
    };
  return {
    sessionLimitMinutes: hardSessionLimit(input) as number | null,
    weeklyLimitMinutes: hardWeeklyLimit(input) as number | null,
    unavailableWeekdays: unavailableWeekdays(input),
  };
}

