// AI Planner V2, as Native reads and asks for it (Part 3 slice A). The server owns the journey: it picks the model, the budget, the compiler and
// every permission, and says in `workspace.allowedActions` what may happen next. Nothing here decides that work is approved. Reading never grants
// authority, and the only way a plan becomes quests is `commit`, which `ApplyService` rechecks on the server.
//
// Schemas are loose on purpose. They name the fields a Native screen reads and ignore the rest, so a server that adds a field does not break a
// tablet. The strict contracts live in lib/planner/v2/contracts and are enforced by the server. Every request carries a key, and the caller
// reuses it when it retries the same action after a lost acknowledgement. Nothing here retries a write.
import { z } from "zod";
import type { BackendClient } from "./client";

const CONTRACT = { "x-sylf-planner-contract": "2" };
/** Retained-artifact verification can outlast an ordinary read, as it does on the web. */
const READ_MS = 60_000;
const WRITE_MS = 20_000;
/** The web's student ceiling. The server enforces its own, and refuses anything above it. */
export const STUDENT_SPENDING_LIMIT_USD = 1.75;
export const STUDENT_RESOURCE_PROFILE = "student-preview-v2";

const text = z.string();
const attemptStateSchema = z.enum(["QUEUED", "RUNNING", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"]);
export type AttemptState = z.infer<typeof attemptStateSchema>;

const attemptSchema = z.object({
  attemptId: text,
  state: attemptStateSchema,
  question: z.unknown().nullable().optional(),
  targets: z.array(z.object({ planId: text, baseActiveRevisionId: text.nullable().optional() }).loose()).default([]),
  budget: z.object({ executionDeadlineAt: text.nullable().optional() }).loose().optional(),
  applyReceipt: z.unknown().nullable().optional(),
}).loose();
export type PlannerAttempt = z.infer<typeof attemptSchema>;

const issueSchema = z.object({ issueId: text, category: text.optional(), severity: text.optional(), evidence: z.unknown().optional(), consequence: z.unknown().optional(), resolution: text.optional() }).loose();
export type PlannerIssue = z.infer<typeof issueSchema>;

export const plannerViewSchema = z.object({
  plan: z.object({ planId: text, title: text, state: text }).loose(),
  intent: z.object({
    intentVersionId: text,
    intent: z.object({
      title: text, outcome: text,
      deadline: z.object({ kind: text, date: text.optional() }).loose(),
      scope: z.array(z.object({ title: text }).loose()).default([]),
    }).loose(),
  }).loose(),
  workspace: z.object({
    planningVersion: z.number().int(),
    conversationVersion: z.number().int(),
    phase: text,
    nextAction: text,
    allowedActions: z.array(text),
    active: z.object({ revisionId: text }).loose().nullable().optional(),
    candidate: z.object({ attemptId: text, changeSetId: text, freshness: text.optional(), staleReasons: z.array(z.unknown()).optional() }).loose().nullable().optional(),
  }).loose(),
  documents: z.array(z.object({ documentId: text, title: text }).loose()).default([]),
  attempt: attemptSchema.nullable().optional(),
  attemptHistory: z.array(z.object({ attemptId: text, state: text, at: text }).loose()).default([]),
  research: z.object({
    digest: text,
    foundationDigest: text.optional(),
    questions: z.array(z.object({ ref: text, question: text, consequence: text }).loose()).default([]),
  }).loose().nullable().optional(),
  draft: z.object({
    attemptId: text, stage: text.optional(), reason: text.optional(),
    strategies: z.array(z.object({ id: text, version: z.number(), text }).loose()).default([]),
    issues: z.array(z.object({ id: text.optional(), disposition: text.optional() }).loose()).default([]),
    reviews: z.array(z.object({ id: text, verdict: text, explanation: text }).loose()).default([]),
    history: z.array(z.object({ id: text, kind: text, label: text }).loose()).default([]),
  }).loose().nullable().optional(),
  changeSet: z.object({
    changeSetId: text,
    entries: z.array(z.record(z.string(), z.unknown())).default([]),
    aggregate: z.object({ feasible: z.boolean().optional(), requiresReestimate: z.boolean().optional(), compromises: z.array(z.unknown()).optional() }).loose().optional(),
    quality: z.object({ status: text.optional(), issues: z.array(issueSchema).default([]), requiredAcknowledgements: z.array(text).default([]) }).loose(),
  }).loose().nullable().optional(),
  usage: z.object({ estimatedCostUsd: z.number().optional(), calls: z.number().optional(), uncertain: z.boolean().optional() }).loose().nullable().optional(),
}).loose();
export type PlannerView = z.infer<typeof plannerViewSchema>;

/** What the live view shows during a run. Presentation only: it is never approval or execution input. */
export const plannerActivitySchema = z.object({
  attemptId: text,
  state: attemptStateSchema,
  calls: z.array(z.object({ id: text, label: text, state: text }).loose()).default([]),
  research: z.array(z.object({ id: text, label: text, detail: text, working: z.boolean() }).loose()).default([]),
  output: z.object({ text: text, state: text, clipped: z.boolean().optional() }).loose().nullable().optional(),
}).loose();
export type PlannerActivity = z.infer<typeof plannerActivitySchema>;

const idSchema = z.object({ planId: text }).loose();
const historySchema = z.object({ history: z.array(z.object({ id: text, kind: text, label: text }).loose()) }).loose();
const artifactSchema = z.object({ artifact: z.unknown() }).loose();

/** A run that nothing more will happen to. The poll stops here, and so does the "working" state. */
export const attemptSettled = (state: AttemptState | string | undefined) => state !== "QUEUED" && state !== "RUNNING";

const WEEKDAYS = 7;
export interface PlanDetails {
  title: string;
  goal: string;
  /** `YYYY-MM-DD`, or empty for no deadline. */
  deadline: string;
  /** One topic per entry. */
  topics: string[];
  timezone: string;
  /** Sunday = 0, as the student's schedule stores it. The planner's windows count from Monday. */
  restDays: number[];
  dailyMinutes: number;
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
}
const plannerWeekday = (day: number) => (day + 6) % WEEKDAYS;

/** The intent a student accepted, in the contract's words. Defaults match what the web's accepted-details step writes. */
export function buildIntent(details: PlanDetails, newKey: () => string) {
  const rest = details.restDays.map(plannerWeekday);
  const topics = details.topics.map((topic) => topic.trim()).filter(Boolean);
  return {
    schemaVersion: 2,
    title: details.title.trim(),
    outcome: details.goal.trim(),
    policy: "GENERAL",
    policySelection: "USER_OVERRIDE",
    deadline: details.deadline ? { kind: "FIXED", date: details.deadline, examDayStudyAllowed: false } : { kind: "NONE" },
    scope: topics.map((title, index) => ({ scopeKey: newKey(), modelRef: `scope_${index + 1}`, title, parentKey: null, inclusion: "REQUESTED", sourceClaimIds: [] })),
    evidence: [],
    availability: {
      timezone: details.timezone,
      dailyCeilingMinutes: Array.from({ length: WEEKDAYS }, (_, day) => (rest.includes(day) ? 0 : details.dailyMinutes)),
      restWeekdays: rest,
      blockedDates: [],
      recoveryPercent: 10,
      basis: "CONFIRMED_AVAILABILITY",
      studyWindows: {
        schemaVersion: 1,
        weekly: Array.from({ length: WEEKDAYS }, (_, weekday) => weekday).filter((weekday) => !rest.includes(weekday)).map((weekday) => ({ weekday, startMinute: details.startMinute, endMinute: details.endMinute })),
        overrides: [],
      },
    },
    preferences: { pacing: "SPREAD", desiredIntensity: "MODERATE", preferredTimeboxMinutes: 25, maximumTimeboxMinutes: 60 },
    assumptions: [],
    unresolvedQuestions: [],
  };
}

/** A key the server stores to recognise a repeated action. It matches `^[A-Za-z0-9_-]{8,100}$`. Not a secret, so not cryptographic. */
export function newPlannerKey(random: () => number = Math.random, now: () => number = Date.now): string {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `n${now().toString(36)}${part()}${part()}`;
}

export function createPlannerReads(client: BackendClient) {
  const read = <T,>(path: string, schema: z.ZodType<T>, signal: AbortSignal) => client.get(path, schema, { signal, headers: CONTRACT, timeoutMs: READ_MS });
  const send = <T = unknown,>(method: "POST" | "PATCH", path: string, body: unknown, schema?: z.ZodType<T>) => client.send<T>(method, path, { body, headers: CONTRACT, timeoutMs: WRITE_MS, ...(schema ? { schema } : {}) });
  const base = (planId: string) => `/api/planner/workspace?planId=${encodeURIComponent(planId)}`;
  return {
    /** Pure helpers, here because screens import no runtime from this package (they reach it behind import()). */
    newKey: newPlannerKey,
    buildIntent: (details: PlanDetails) => buildIntent(details, newPlannerKey),
    settled: attemptSettled,
    view: (planId: string, signal: AbortSignal) => read(base(planId), plannerViewSchema, signal),
    /** Seen-only poll while a run is going, as the web's fallback does. Read-only. */
    activity: (planId: string, attemptId: string, signal: AbortSignal) => read(`${base(planId)}&activity=true&attemptId=${encodeURIComponent(attemptId)}`, plannerActivitySchema, signal),
    history: (planId: string, attemptId: string, signal: AbortSignal) => read(`${base(planId)}&history=true&attemptId=${encodeURIComponent(attemptId)}`, historySchema, signal),
    artifact: (planId: string, attemptId: string, artifactId: string, signal: AbortSignal) => read(`${base(planId)}&attemptId=${encodeURIComponent(attemptId)}&artifactId=${encodeURIComponent(artifactId)}`, artifactSchema, signal),

    /** Saving the accepted details is free: nothing is asked of a model. */
    create: (key: string, intent: ReturnType<typeof buildIntent>) => send("POST", "/api/planner/workspace", { action: "CREATE", key, intent }, idSchema),
    /** A free note. Advice from the planner is a separate, explicit request. */
    note: (planId: string, key: string, noteText: string, expectedConversationVersion: number) => send("POST", "/api/planner/workspace", { action: "NOTE", planId, key, text: noteText, expectedConversationVersion }),
    /** The real ceiling and explicit consent go with the request. `requestKey` is reused when the same action is retried after a lost acknowledgement. */
    generate: (view: PlannerView, requestKey: string, options: { notes: string; research: boolean; spendingLimitUsd: number }) => send("POST", "/api/planner/workspace", {
      action: "GENERATE", profile: STUDENT_RESOURCE_PROFILE, consent: true, spendingLimitUsd: Math.min(options.spendingLimitUsd, STUDENT_SPENDING_LIMIT_USD),
      request: {
        schemaVersion: 2, requestKey,
        text: [view.intent.intent.outcome, options.notes.trim() ? `Student instructions: ${options.notes.trim()}` : ""].filter(Boolean).join("\n"),
        targets: [{ kind: "EXISTING", planId: view.plan.planId, expectedIntentVersionId: view.intent.intentVersionId, expectedPlanningVersion: view.workspace.planningVersion, baseActiveRevisionId: view.workspace.active?.revisionId ?? null }],
        researchRequested: options.research,
        documentIds: options.research ? view.documents.map((document) => document.documentId) : [],
      },
    }),
    /** Answers to the exact questions the server retained. */
    answer: (view: PlannerView, key: string, answers: Record<string, string>) => {
      const attempt = view.attempt;
      const research = view.research;
      if (!attempt || !research) throw new Error("There is nothing to answer.");
      return send("POST", "/api/planner/workspace", {
        action: "CONTINUE",
        request: {
          key, parentAttemptId: attempt.attemptId, expectedResearchDigest: research.digest,
          ...(research.foundationDigest ? { expectedFoundationDigest: research.foundationDigest } : {}),
          answers: research.questions.map((question) => ({ ref: question.ref, text: answers[question.ref] ?? "" })),
          intents: attempt.targets.map((target) => ({ planId: target.planId, expectedIntentId: view.intent.intentVersionId, expectedPlanningVersion: view.workspace.planningVersion, baseRevisionId: target.baseActiveRevisionId ?? null })),
        },
      });
    },
    /** Durable: the server records the stop and says what stopped. */
    cancel: (planId: string, attemptId: string) => send("POST", `/api/planner/${encodeURIComponent(planId)}/operations/${encodeURIComponent(attemptId)}`, { schemaVersion: 2, action: "CANCEL" }),
    /** Turns the reviewed candidate into quests. `acknowledgements` are only the warnings the student read. The server rechecks everything. */
    commit: (planId: string, attemptId: string, changeSetId: string, acknowledgements: string[]) => send("POST", `/api/planner/${encodeURIComponent(planId)}/commit`, { schemaVersion: 2, attemptId, changeSetId, acknowledgements }),
  };
}
export type PlannerReads = ReturnType<typeof createPlannerReads>;
