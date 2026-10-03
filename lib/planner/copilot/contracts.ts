import { z } from "zod";
import { DateKeySchema, LIMITS, OperationKeySchema } from "../contracts";
import { PlannerConstraintKindSchema } from "../constraints";
import { BRIEF_LIMITS, ScopeNodeSchema } from "../intake/brief";
import type { CopilotConfirmationCode } from "./outcomes";

/**
 * The Planner Copilot contract: what a student may say, and the only shapes Sylf will
 * ever turn it into.
 *
 * Three rules shape every type here, and they are the whole reason this file is separate
 * from the service that uses it:
 *
 * 1. **The model proposes; the server decides.** The model's entire output surface is
 *    `PlannerCopilotInterpretationV1` below — a closed intent, a bounded sentence, and a
 *    list of strict commands. There is no shape here for SQL, a Prisma operation, an
 *    arbitrary JSON patch, a database path, a route name or a raw Quest update, so a
 *    hostile or merely creative answer has nowhere to put one.
 * 2. **Every command maps onto an action the planner already has.** The command names are
 *    grouped by the intake action each one becomes; the Copilot adds interpretation, not
 *    a second way to change a plan.
 * 3. **The conversation is not state.** Nothing here is stored as planner truth: an
 *    interpretation is answered immediately or becomes a short-lived, signed proposal,
 *    and the Plan Brief stays authoritative throughout.
 */

/** What the student is asking for, in a closed vocabulary. */
export const COPILOT_INTENTS = [
  "INTAKE_UPDATE",
  "SCOPE_UPDATE",
  "PREPAREDNESS_UPDATE",
  "BACKGROUND_UPDATE",
  "AVAILABILITY_UPDATE",
  "PREFERENCE_UPDATE",
  "CONSTRAINT_UPDATE",
  "RESEARCH_REQUEST",
  "COMPARISON_REQUEST",
  "EXPLAIN",
  "DRAFT_EDIT",
  "CONFIRMED_PLAN_CHANGE",
  "RELEASE_GENERATED_ITEM",
  "REPLAN_REQUEST",
  "UNKNOWN",
] as const;
export const CopilotIntentSchema = z.enum(COPILOT_INTENTS);
export type CopilotIntent = (typeof COPILOT_INTENTS)[number];

export const COPILOT_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export const CopilotConfidenceSchema = z.enum(COPILOT_CONFIDENCES);
export type CopilotConfidence = (typeof COPILOT_CONFIDENCES)[number];

/**
 * Why Sylf cannot act yet, as a closed code rather than a sentence.
 *
 * Each one has a different next action for the student, which is the test for whether it
 * belongs here: restate the request, split it, confirm something, turn research on, or
 * use the structured control instead.
 */
export const COPILOT_CLARIFICATION_CODES = [
  "HARD_OR_SOFT",
  "WHICH_UNIT",
  "WHICH_DATE",
  "CURRICULUM_OR_PREPAREDNESS",
  "SCOPE_OF_CHANGE",
] as const;
export const CopilotClarificationCodeSchema = z.enum(COPILOT_CLARIFICATION_CODES);
export type CopilotClarificationCode = (typeof COPILOT_CLARIFICATION_CODES)[number];

export const COPILOT_ERROR_CODES = [
  "MODEL_UNAVAILABLE",
  "COPILOT_BAD_OUTPUT",
  "COPILOT_PROPOSAL_STALE",
  "COPILOT_PROPOSAL_EXPIRED",
  "COPILOT_PROPOSAL_UNKNOWN",
  "COMMAND_NOT_ALLOWED_IN_STATE",
  "AMBIGUOUS_REQUEST",
  "TOO_MANY_COMMANDS",
  "UNKNOWN_REFERENCE",
  "RESEARCH_UNAVAILABLE",
  "RESEARCH_DISABLED",
  "REPLAN_UNAVAILABLE",
  "RELEASE_NOT_ALLOWED",
  "NOTHING_TO_DO",
  /**
   * The request is understood and legal — something it depends on simply is not there yet.
   *
   * Added in the final phase because two very different situations were sharing one code.
   * "Set my weekly hours to 8 and research the syllabus" is genuinely two confirmation
   * boundaries and asking the student to split it is right. "Compare this with my A-Level
   * background" on a plan with no background recorded is *one* request with a missing
   * prerequisite, and answering it with "that is several separate changes at once" told the
   * student nothing they could act on. A prerequisite is only ever reported when the server
   * can prove it from the brief, and it always names the one thing that is missing.
   */
  "COPILOT_PREREQUISITE_MISSING",
] as const;
export const CopilotErrorCodeSchema = z.enum(COPILOT_ERROR_CODES);
export type CopilotErrorCode = (typeof COPILOT_ERROR_CODES)[number];

/**
 * What is missing, as a closed list.
 *
 * Closed for the same reason every other Copilot vocabulary is: the surface has to offer the
 * *right* control, and a free-text reason cannot be mapped onto one.
 */
export const COPILOT_PREREQUISITES = [
  "GOAL_REQUIRED",
  "BACKGROUND_CURRICULUM_REQUIRED",
  "CONFIRMED_SCOPE_REQUIRED",
  "DRAFT_REQUIRED",
  "CONFIRMED_PLAN_REQUIRED",
] as const;
export const CopilotPrerequisiteSchema = z.enum(COPILOT_PREREQUISITES);
export type CopilotPrerequisite = (typeof COPILOT_PREREQUISITES)[number];

/**
 * Explicit ceilings for one Copilot turn.
 *
 * A turn is interpretation, validation and at most one routing decision. It is not an
 * agent loop, and these numbers are what make that checkable rather than aspirational.
 */
export const COPILOT_LIMITS = {
  /** Commands one message may produce. Beyond this the student is asked to split it. */
  maxCommandsPerTurn: 5,
  /** Model passes per turn: one interpretation, plus one optional wording pass. */
  maxModelPassesPerTurn: 2,
  /** Characters of one student message. Longer is truncated, not rejected. */
  maxMessageChars: 600,
  /** Recent turns carried as context. The projection matters more than the transcript. */
  maxRecentTurns: 8,
  /** Characters across all recent turns. */
  maxRecentChars: 2_400,
  /** Today plus the last few exchanges are enough; nothing longer is retained. */
  maxTurnsPerSession: 12,
  /** One bounded sentence summarising what Sylf understood. */
  summaryChars: 300,
  /** One clarification question. */
  questionChars: 200,
  /** A clarification may offer at most this many concrete options. */
  clarificationOptions: 4,
  /** A proposal is valid for this long, and never across a version change. */
  proposalTtlMinutes: 30,
  /** Characters of the signed proposal token. */
  proposalTokenChars: 4_096,
  /** Context snapshot ceiling, enforced on the projection itself. */
  contextBytes: 8_192,
  /** Explanation facts carried by one response. */
  explanationFacts: 6,
  /** Characters of one explanation fact. */
  explanationFactChars: 240,
  /** Releases one turn may propose. Deliberately one: it is an authority act. */
  releasesPerProposal: 1,
} as const;

/**
 * What Sylf may propose, in the currency of the actions that already exist.
 *
 * Every variant carries only facts the *student* stated. There is no field for a model
 * judgement about importance, difficulty, mastery or confidence, so "this looks
 * important" cannot become a priority and "you probably know this" cannot become
 * preparedness.
 */
export const CopilotCommandSchema = z.discriminatedUnion("command", [
  /** A weekly *target*: what the student is aiming for, not a ceiling. */
  z.strictObject({
    command: z.literal("SET_WEEKLY_HOURS"),
    hours: z.number().min(0).max(168),
    /** True only when the student said it is a limit they cannot exceed. */
    hard: z.boolean(),
  }),
  z.strictObject({
    command: z.literal("SET_TARGET_DATE"),
    /** Resolved server-side against the current intake date; never a model-made date. */
    date: DateKeySchema.nullable(),
    /** Set when the student said "two weeks later" rather than naming a date. */
    shiftDays: z.number().int().min(-365).max(365).nullable(),
  }),
  z.strictObject({
    command: z.literal("SET_BACKGROUND_CURRICULUM"),
    label: z.string().trim().min(1).max(200),
    level: z.string().trim().max(60).nullable(),
    board: z.string().trim().max(60).nullable(),
    subjects: z.array(z.string().trim().min(1).max(120)).max(20),
  }),
  z.strictObject({
    command: z.literal("SET_PREPAREDNESS"),
    /** Unit labels exactly as the student referred to them; resolved server-side. */
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    state: z.enum(["UNKNOWN", "NOT_STUDIED", "STUDIED_UNRATED", "WEAK", "OKAY", "STRONG"]),
  }),
  /** An overlap correction: a curriculum fact, never a preparedness one. */
  z.strictObject({
    command: z.literal("SET_OVERLAP_CORRECTION"),
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    overlap: z.enum([
      "LIKELY_COVERED_BY_CURRICULUM",
      "PARTIAL_OVERLAP",
      "LIKELY_NEW_TO_CURRICULUM",
      "UNCLEAR",
    ]),
  }),
  z.strictObject({
    command: z.literal("SET_PRIORITY"),
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    priority: z.enum(["NEUTRAL", "LOW", "HIGH"]),
  }),
  /** Difficulty is subjective: only an explicit student statement may set it. */
  z.strictObject({
    command: z.literal("SET_DIFFICULTY"),
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    difficult: z.boolean(),
  }),
  z.strictObject({
    command: z.literal("SET_CONSTRAINT"),
    kind: PlannerConstraintKindSchema,
    strength: z.enum(["HARD", "SOFT"]),
    value: z.number().finite(),
    /**
     * Optional, exactly as the planner action it maps onto treats it.
     *
     * The real corpus is what showed this: a required field here meant a `SET_CONSTRAINT`
     * answer that simply left the weight out was refused whole, and the student was told Sylf
     * could not read a request it had understood perfectly. `setConstraint` has always taken
     * `preferenceWeight` as optional — it is meaningful only for a SOFT preference, and the
     * server derives the weight it needs — so the Copilot contract was stricter than the domain
     * for no reason. `null` and absent now mean the same thing, which is what they should
     * always have meant.
     */
    preferenceWeight: z.number().int().min(0).max(5).nullable().optional(),
  }),
  z.strictObject({
    command: z.literal("REMOVE_CONSTRAINT"),
    kind: PlannerConstraintKindSchema,
  }),
  z.strictObject({
    command: z.literal("UPDATE_SCOPE"),
    add: z.array(z.strictObject({ label: z.string().trim().min(1).max(200) })).max(BRIEF_LIMITS.scopeNodes),
    remove: z.array(z.string().trim().min(1).max(200)).max(BRIEF_LIMITS.scopeNodes),
    rename: z
      .array(z.strictObject({ from: z.string().trim().min(1).max(200), to: z.string().trim().min(1).max(200) }))
      .max(BRIEF_LIMITS.scopeNodes),
  }),
  z.strictObject({ command: z.literal("REQUEST_SCOPE_RESEARCH") }),
  z.strictObject({ command: z.literal("REQUEST_CURRICULUM_COMPARISON"), refresh: z.boolean() }),
  /** One edit to the reviewed draft, by the units and intent the student named. */
  z.strictObject({
    command: z.literal("REQUEST_DRAFT_EDIT"),
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    /** What should happen to that work, in the closed vocabulary the draft supports. */
    edit: z.enum(["REMOVE", "SHORTEN", "LENGTHEN", "MOVE_EARLIER", "MOVE_LATER"]),
    minutes: z.number().int().min(15).max(240).nullable(),
    days: z.number().int().min(-30).max(30).nullable(),
  }),
  z.strictObject({
    command: z.literal("REQUEST_REPLAN"),
    reason: z.enum(["LESS_TIME", "LIGHTER", "BEHIND", "DEADLINE", "PRIORITIES", "GENERAL"]),
  }),
  /** Releasing generated work: one item, named by the units it belongs to. */
  z.strictObject({
    command: z.literal("RELEASE_GENERATED_ITEM"),
    labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    /** Narrowing hint in the closed vocabulary of plan intents. */
    kind: z.enum(["ANY", "RECALL", "PRACTICE", "REVIEW", "MOCK", "OTHER"]),
  }),
]);
export type CopilotCommand = z.infer<typeof CopilotCommandSchema>;
export type CopilotCommandName = CopilotCommand["command"];

/** The commands that only change the working brief, and so can be batched atomically. */
export const BRIEF_COMMANDS: readonly CopilotCommandName[] = [
  "SET_WEEKLY_HOURS",
  "SET_TARGET_DATE",
  "SET_BACKGROUND_CURRICULUM",
  "SET_PREPAREDNESS",
  "SET_OVERLAP_CORRECTION",
  "SET_PRIORITY",
  "SET_DIFFICULTY",
  "SET_CONSTRAINT",
  "REMOVE_CONSTRAINT",
  "UPDATE_SCOPE",
];

/** The commands that invoke an existing bounded capability instead of editing the brief. */
export const CAPABILITY_COMMANDS: readonly CopilotCommandName[] = [
  "REQUEST_SCOPE_RESEARCH",
  "REQUEST_CURRICULUM_COMPARISON",
  "REQUEST_DRAFT_EDIT",
  "REQUEST_REPLAN",
  "RELEASE_GENERATED_ITEM",
];

export const isBriefCommand = (name: CopilotCommandName): boolean => BRIEF_COMMANDS.includes(name);
export const isCapabilityCommand = (name: CopilotCommandName): boolean =>
  CAPABILITY_COMMANDS.includes(name);

/**
 * The clarification envelope, read leniently and then decided by the server.
 *
 * This was `z.union` of two `strictObject`s, and a real corpus of forty-one messages showed it
 * was refusing roughly one answer in six for shapes that were *not wrong about anything*: a
 * `{required: true, question}` with no code, a `{required: false, question}` left over from a
 * draft the model changed its mind about, an empty `options` array. Every one of those is a
 * model that understood the request and asked its question in a slightly different envelope,
 * and every one cost the student "I could not read that request".
 *
 * The strictness that matters is not here. A clarification carries no authority: reading one
 * produces a *question*, never a change, and the commands that do carry authority live in a
 * union that is still strict to the field. So this field alone is read tolerantly and then
 * *normalised* — a usable question becomes a real clarification, and anything else becomes
 * "no clarification", which is the same answer the strict branch used to give for
 * `required: false`.
 *
 * The normalisation is deliberately conservative: a question is only accepted when it is a
 * non-empty bounded string, and the code falls back to a closed value rather than inventing
 * one. Nothing here can make the server ask a question the model did not ask.
 */
/** What the server decided: either a real question, or nothing to ask. */
export type CopilotClarification =
  | { required: true; code: CopilotClarificationCode; question: string; options: string[] }
  | { required: false };

export const CopilotClarificationSchema: z.ZodType<CopilotClarification, unknown> = z
  .object({
    required: z.boolean(),
    code: CopilotClarificationCodeSchema.nullable().optional(),
    question: z.string().trim().min(1).max(COPILOT_LIMITS.questionChars).nullable().optional(),
    options: z
      .array(z.string().trim().min(1).max(120))
      .max(COPILOT_LIMITS.clarificationOptions)
      .nullable()
      .optional(),
  })
  .transform((value): CopilotClarification => {
    if (!value.required || !value.question) return { required: false };
    return {
      required: true,
      // The model's own code when it picked a real one; otherwise the one code that says "this
      // is a clarification whose kind was not stated", which is truthful rather than a guess.
      code: value.code ?? "SCOPE_OF_CHANGE",
      question: value.question,
      options: value.options ?? [],
    };
  }) as z.ZodType<CopilotClarification, unknown>;

/**
 * The model's entire answer.
 *
 * `summary` is what the student reads back ("I understood that as…"), bounded to one
 * sentence. `explanationFacts` is *not* where the model invents reasons: it is the
 * subset of server-supplied fact ids the answer is built from, so a response can be
 * checked against the facts the server actually provided.
 */
export const PlannerCopilotInterpretationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  intent: CopilotIntentSchema,
  confidence: CopilotConfidenceSchema,
  summary: z.string().trim().max(COPILOT_LIMITS.summaryChars),
  commands: z.array(CopilotCommandSchema).max(COPILOT_LIMITS.maxCommandsPerTurn),
  clarification: CopilotClarificationSchema,
  /** Fact ids the server supplied in the same turn, echoed back for grounding. */
  explanationRefs: z.array(z.string().trim().min(1).max(60)).max(COPILOT_LIMITS.explanationFacts),
});
export type PlannerCopilotInterpretationV1 = z.infer<typeof PlannerCopilotInterpretationV1Schema>;

/**
 * The bounded planner state the model is given.
 *
 * Deliberately *not* the Plan Brief: a projection of what matters for interpretation and
 * explanation, with counts where a list would be unbounded and closed enums where a value
 * would be free text. No secrets, no source urls, no fetched text, and never a whole
 * revision.
 */
export const PlannerCopilotContextV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.enum(["EXAM", "ROADMAP", "MASTERY"]),
  lifecycle: z.enum(["PRE_GENERATION", "DRAFT_REVIEW", "CONFIRMED"]),
  readiness: z.string().max(40),
  missing: z.array(z.string().max(40)).max(6),
  goal: z.string().trim().max(200),
  subject: z.string().trim().max(200).nullable(),
  targetDate: DateKeySchema.nullable(),
  today: DateKeySchema,
  weeklyMinutes: z.number().int().min(0).max(10080).nullable(),
  hardWeeklyMinutes: z.number().int().min(0).max(10080).nullable(),
  hardSessionMinutes: z.number().int().min(0).max(1440).nullable(),
  unavailableWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  softPreferences: z
    .array(
      z.strictObject({
        kind: z.string().max(40),
        value: z.number().finite(),
      })
    )
    .max(8),
  scopeUnits: z
    .array(
      z.strictObject({
        label: z.string().trim().max(200),
        /** Closed state, so a label is never mistaken for a claim about the student. */
        preparedness: z.enum(["UNKNOWN", "NOT_STUDIED", "STUDIED_UNRATED", "WEAK", "OKAY", "STRONG"]),
        priority: z.enum(["NEUTRAL", "LOW", "HIGH"]),
        difficult: z.boolean(),
        /** How the comparison placed it, when a comparison exists. */
        overlap: z
          .enum(["LIKELY_COVERED_BY_CURRICULUM", "PARTIAL_OVERLAP", "LIKELY_NEW_TO_CURRICULUM", "UNCLEAR"])
          .nullable(),
      })
    )
    .max(60),
  scopeConfirmed: z.boolean(),
  backgroundCurriculum: z.string().trim().max(200).nullable(),
  comparison: z
    .strictObject({
      state: z.enum(["NOT_RUN", "READY", "STALE", "UNAVAILABLE"]),
      status: z.enum(["OK", "WEAK", "UNAVAILABLE"]),
      counts: z.strictObject({
        covered: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        isNew: z.number().int().nonnegative(),
        unclear: z.number().int().nonnegative(),
      }),
    })
    .nullable(),
  /** Retained for explanation: the sources the confirmed scope came from. */
  confirmedSources: z
    .array(
      z.strictObject({
        sourceId: z.string().max(60),
        title: z.string().trim().max(300).nullable(),
        publisherOrDomain: z.string().trim().max(200).nullable(),
        sourceType: z.enum(["OFFICIAL", "OFFICIAL_PDF", "INSTITUTIONAL", "SECONDARY", "USER_UPLOAD"]),
        documentDate: z.string().trim().max(60).nullable(),
      })
    )
    .max(8),
  researchPolicy: z.enum(["ALLOW", "OFF"]),
  researchConfigured: z.boolean(),
  draft: z
    .strictObject({
      items: z.number().int().nonnegative(),
      /** Which intent types the draft holds, so "remove the mock" can be resolved. */
      kinds: z.array(z.string().max(30)).max(12),
      warnings: z.number().int().nonnegative(),
    })
    .nullable(),
  confirmedPlan: z
    .strictObject({
      planId: z.string().max(60),
      planVersion: z.number().int().nonnegative(),
      revisionId: z.string().max(60),
      items: z.number().int().nonnegative(),
      releasable: z.number().int().nonnegative(),
      protectedWork: z.number().int().nonnegative(),
      execution: z.strictObject({
        pending: z.number().int().nonnegative(),
        started: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        released: z.number().int().nonnegative(),
      }),
    })
    .nullable(),
});
export type PlannerCopilotContextV1 = z.infer<typeof PlannerCopilotContextV1Schema>;

/** One deterministic fact an explanation is built from. Never model-authored. */
export interface CopilotExplanationFact {
  /** Stable id, quoted back by the model and checked by the server. */
  id: string;
  /** What the student reads. Assembled server-side from planner state. */
  text: string;
}

/** One command, as it will be shown before it is applied. */
export interface CopilotCommandPreview {
  command: CopilotCommandName;
  /** One sentence, derived from the *current* state and the proposed change. */
  consequence: string;
  /** Closed codes the command needs from the student, when it needs any. */
  requires?: CopilotConfirmationCode;
}

export const COPILOT_PROPOSAL_STATUSES = ["READY", "APPLIED", "CANCELLED"] as const;

/**
 * A proposal, as the client may hold it.
 *
 * The commands themselves are *not* returned for the client to send back: the signed
 * token is the proposal, and the server re-derives the commands from it. A client that
 * rewrote the array would invalidate the signature rather than change a plan.
 */
export interface CopilotProposalView {
  proposalId: string;
  /** Bounded id, for logging and for cancelling by value. */
  token: string;
  intent: CopilotIntent;
  summary: string;
  preview: CopilotCommandPreview[];
  /** True when applying changes the working brief; false for a routed capability. */
  mutatesBrief: boolean;
  /** Set when the proposal is a single routed capability. */
  route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE" | null;
  expiresAt: string;
  /** Commands the student must acknowledge before they can apply, when any. */
  requiresAcknowledgement: string[];
}

/** What one Copilot turn returns. Exactly one of the payloads is meaningful. */
export type CopilotTurnResult =
  | {
      outcome: "ANSWERED";
      intent: CopilotIntent;
      summary: string;
      clarification: CopilotClarification;
      /** Present for EXPLAIN: deterministic facts, optionally phrased. */
      facts: CopilotExplanationFact[];
      phrasing: string | null;
      factsAvailable: boolean;
    }
  | { outcome: "PROPOSED"; intent: CopilotIntent; proposal: CopilotProposalView; summary: string }
  | {
      outcome: "ROUTED";
      intent: CopilotIntent;
      route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE";
      /** For REPLAN: the exact Phase 5 request body the client should send. */
      request: unknown | null;
      summary: string;
    }
  | {
      outcome: "REFUSED";
      intent: CopilotIntent;
      code: CopilotErrorCode;
      message: string;
      /**
       * Set only for `COPILOT_PREREQUISITE_MISSING`: which one thing has to exist first.
       *
       * Optional rather than required, so every refusal recorded before this field existed
       * still parses — and so a refusal that is *not* a prerequisite cannot carry a
       * misleading one.
       */
      prerequisite?: CopilotPrerequisite;
    };

/**
 * One line of the conversation the *client* holds.
 *
 * The transcript is not planner state and is never stored: it lives in the tab, travels with
 * each request, is truncated here, and is forgotten. Bounded at the schema rather than only at
 * the route, because it is model input and "the route remembered to slice it" is not a property
 * of the type.
 */
export const CopilotRecentTurnSchema = z.strictObject({
  role: z.enum(["STUDENT", "SYLF"]),
  text: z.string().max(300),
});
export type CopilotRecentTurn = z.infer<typeof CopilotRecentTurnSchema>;

export const CopilotTurnRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  message: z.string().trim().min(1).max(COPILOT_LIMITS.maxMessageChars),
  /**
   * The recent turns, as the client holds them. Accepted here because the client has always
   * sent them and the route has always forwarded them — the schema simply did not describe
   * that, so every request carrying a transcript was refused with `unrecognized_keys` before
   * the model was ever called. Declaring the field is what makes the wire contract true; the
   * bound is what stops the transcript becoming a way to smuggle input past it.
   */
  /**
   * Bounded generously here, and truncated to `maxRecentTurns` before the model sees it.
   *
   * The distinction matters: a client that has accumulated twelve turns should get an answer
   * built from the last eight, not a 400. Rejecting a transcript that is merely longer than the
   * model's window would make the bound a client-visible failure instead of a server-side
   * guarantee, and the guarantee is the thing that matters. The ceiling is still here so an
   * abusive array is refused rather than read.
   */
  recent: z.array(CopilotRecentTurnSchema).max(COPILOT_LIMITS.maxRecentTurns * 3).optional(),
  /** Answers to a previous clarification, so one question is asked once. */
  clarificationAnswer: z.string().trim().max(120).nullable().optional(),
});

export const CopilotApplyRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  token: z.string().min(16).max(COPILOT_LIMITS.proposalTokenChars),
  /** Closed warning codes the student accepted, in the draft-edit case. */
  acknowledgements: z.array(z.string().trim().min(4).max(80)).max(24).optional(),
});

export { DateKeySchema, OperationKeySchema, ScopeNodeSchema, LIMITS };
