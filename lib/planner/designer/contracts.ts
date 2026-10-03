import { z } from "zod";
import { ModeSchema } from "../contracts";
import {
  CopilotClarificationSchema,
  CopilotCommandSchema,
  CopilotConfidenceSchema,
  COPILOT_LIMITS,
  type CopilotCommand,
  type CopilotCommandPreview,
  type CopilotClarification,
  type CopilotErrorCode,
  type CopilotExplanationFact,
  type CopilotPrerequisite,
} from "../copilot/contracts";
import type { CopilotConfirmationCode } from "../copilot/outcomes";

/**
 * The Plan Designer: the pre-generation half of the same assistant.
 *
 * The Copilot was built for a brief that already exists — say what to change, and it changes
 * it. The Designer exists for the turn *before* that, when the student has not yet said
 * enough for a brief to exist at all, and speaks in the way people actually open a
 * conversation:
 *
 *   "I have my NUST NET in February. I did A-Level Maths and Physics, I'm rusty at
 *    mechanics, and I can study around 10 hours a week."
 *
 * That is five facts in one sentence about four different parts of a Plan Brief, and the
 * Copilot's contract cannot express it: its shape is *commands*, and five commands from one
 * message is `MULTI_COMMAND` — a confirmation, which is right, but with nothing to say about
 * what was understood or what is still missing.
 *
 * Three rules shape everything below, and they are the reason this is a separate module
 * rather than a flag on the Copilot:
 *
 * 1. **The vocabulary is the Copilot's.** `CopilotCommandSchema` is imported, not copied.
 *    There is no `SET_WEEKLY_HOURS_DESIGNER`, no second way to set a date, and no command in
 *    the union that does not already have an intake action behind it. A Designer turn that
 *    wants to change something says so in the currency the rest of the planner already uses.
 * 2. **The server decides what to ask.** The model may propose a question and its wording,
 *    but *which* essential is missing — and therefore whether a question is material at all —
 *    is read off the Plan Brief by the server. A model that asks for the board while the goal
 *    is still empty is corrected rather than obeyed, and a model that stays silent while the
 *    date is missing is overruled.
 * 3. **Nothing here is stored.** Like the Copilot, a turn is interpretation, validation and
 *    at most one signed proposal. The conversation lives in the tab; the Plan Brief remains
 *    the only planner state that matters.
 */

/**
 * What the student seems to be doing, in a closed vocabulary.
 *
 * Distinguished from the Copilot's intents because the *pre-generation* case has genuinely
 * different shapes: `SETUP` is not a change to a plan (there is no plan yet), `MODE` is a
 * question about which planner fits, and `IMPORT` is a request the backend cannot serve at
 * all and must therefore be routed rather than promised (see `DESIGNER_REFUSAL_CODES`).
 */
export const DESIGNER_INTENTS = [
  /** Describing what they want to study, and when. The main pre-generation case. */
  "SETUP",
  /** Changing something in a brief that already exists. */
  "EDIT",
  /** Specifically about what the plan should cover. */
  "SCOPE",
  /** Asking Sylf to go and look something up. */
  "RESEARCH",
  /** Asking for the curriculum comparison. */
  "COMPARISON",
  /** A question about the planner itself, not a change. */
  "EXPLAIN",
  /** Asking which Planner mode fits, or describing something only one mode fits. */
  "MODE",
  /** Wants to use a document they have. There is no import command — see §20. */
  "IMPORT",
  /** Not about this study plan at all. */
  "UNKNOWN",
] as const;
export const DesignerIntentSchema = z.enum(DESIGNER_INTENTS);
export type DesignerIntent = z.infer<typeof DesignerIntentSchema>;

/**
 * The four essentials, as question codes.
 *
 * Deliberately the *same four* `readiness.ts` requires and in the same priority order, so
 * the Designer cannot invent a fifth thing to ask for. Each one maps onto a
 * `CoreRequirementCode` the server can prove from the brief.
 */
export const DESIGNER_QUESTION_CODES = ["GOAL", "SCOPE", "DATE", "WEEKLY_TIME"] as const;
export const DesignerQuestionCodeSchema = z.enum(DESIGNER_QUESTION_CODES);
export type DesignerQuestionCode = z.infer<typeof DesignerQuestionCodeSchema>;

/**
 * The Designer's own refusals.
 *
 * Every one is a *closed code with a known next action*, for the same reason the Copilot's
 * are: the surface has to offer the right control, and a free-text reason cannot be mapped
 * onto one. The import code carries the whole of §20 — the backend has no import command, so
 * the honest answer is a route into the scope step, never a promise.
 */
export const DESIGNER_REFUSAL_CODES = [
  /** Uploading and pasting happen in the scope step; chat cannot receive a file. */
  "IMPORT_IN_SCOPE_STEP",
  /** The message is not about this study plan. */
  "OFF_TOPIC",
  /** More changes than one turn may carry. */
  "TOO_MANY_CHANGES",
] as const;
export const DesignerRefusalCodeSchema = z.enum(DESIGNER_REFUSAL_CODES);
export type DesignerRefusalCode = z.infer<typeof DesignerRefusalCodeSchema>;

/**
 * One piece of guidance the Designer may offer.
 *
 * Guidance is **advice, never a gate** (§16, §17). Every code here is something the student
 * may ignore and still generate a plan: the product principle is warn about the tradeoff and
 * let the student decide. None of these can become a prerequisite.
 */
export const DESIGNER_GUIDANCE_CODES = [
  /** A different Planner mode fits what they described. */
  "MODE_SUGGESTED",
  /** The goal is too broad for the mode they are in — "study maths" under Exam Planner. */
  "GOAL_TOO_BROAD",
  /** A Mastery plan needs one unit, and the goal reads like a whole subject. */
  "MASTERY_IS_ONE_UNIT",
  /** The horizon is short enough that the schedule will be dense. */
  "DENSE_SCHEDULE",
  /** Board and level are absent, and they are what makes a source verifiable. */
  "BOARD_HELPS",
  /** Nothing covers the plan yet, and Sylf could look for the official syllabus. */
  "RESEARCH_AVAILABLE",
  /** A single chapter is usually faster to type than to search for. */
  "MANUAL_SCOPE_FASTER",
  /** Research is switched off, so nothing will be looked up. */
  "RESEARCH_OFF",
  /** Everything needed is present. */
  "READY",
] as const;
export const DesignerGuidanceCodeSchema = z.enum(DESIGNER_GUIDANCE_CODES);
export type DesignerGuidanceCode = z.infer<typeof DesignerGuidanceCodeSchema>;

export interface DesignerGuidance {
  code: DesignerGuidanceCode;
  /** One sentence, assembled server-side. Never model prose. */
  text: string;
}

/**
 * The model's entire answer.
 *
 * `summary` is the one sentence the student reads back. `question` and `recommendedMode` are
 * *proposals*: the server checks the question against the brief's own missing essentials
 * before asking it, and never switches mode on the model's word (see `run.ts`). There is no
 * field for a URL, an id, a database path, a route name or an arbitrary patch, so a hostile
 * or merely creative answer has nowhere to put one.
 *
 * `commands` is the Copilot's own union. Nothing new can be expressed here that could not be
 * expressed before — which is the point.
 */
export const PlannerDesignerInterpretationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  intent: DesignerIntentSchema,
  confidence: CopilotConfidenceSchema,
  summary: z.string().trim().max(COPILOT_LIMITS.summaryChars),
  /**
   * Which essential the model believes is still missing.
   *
   * A hint, not an instruction: the server compares it against the brief's own missing list
   * and substitutes the real one when they disagree.
   */
  questionCode: DesignerQuestionCodeSchema.nullable(),
  /** How to phrase that question. Used only when its code survived the server's check. */
  question: z.string().trim().max(COPILOT_LIMITS.questionChars).nullable(),
  questionOptions: z
    .array(z.string().trim().min(1).max(120))
    .max(COPILOT_LIMITS.clarificationOptions)
    .nullable(),
  /** The mode that fits what was described, when the model has an opinion. */
  recommendedMode: ModeSchema.nullable(),
  modeReason: z.string().trim().max(200).nullable(),
  commands: z.array(CopilotCommandSchema).max(COPILOT_LIMITS.maxCommandsPerTurn),
  clarification: CopilotClarificationSchema,
  /** Fact ids the server supplied in the same turn, echoed back for grounding. */
  explanationRefs: z.array(z.string().trim().min(1).max(60)).max(COPILOT_LIMITS.explanationFacts),
});
export type PlannerDesignerInterpretationV1 = z.infer<typeof PlannerDesignerInterpretationV1Schema>;

/**
 * The Designer's read of the brief, assembled entirely server-side.
 *
 * This is §26's "PLAN SO FAR" and it is never model-authored: every field is read off the
 * Plan Brief the server holds, so the panel cannot flatter the setup, and a test can assert
 * it without a model in the loop. `missing` is ordered by the priority the student actually
 * needs — goal, scope, date, weekly time — so the frontend never has to decide what to ask
 * next.
 */
export interface DesignerSummary {
  mode: "EXAM" | "ROADMAP" | "MASTERY";
  /** Student-facing mode name, so the frontend does not map enums to copy. */
  modeLabel: string;
  goal: string | null;
  subject: string | null;
  targetDate: string | null;
  scopeState: "NONE" | "CANDIDATE" | "CONFIRMED";
  scopeUnitCount: number;
  weeklyMinutes: number | null;
  backgroundLabel: string | null;
  board: string | null;
  level: string | null;
  preparednessStated: number;
  researchPolicy: "ALLOW" | "OFF";
  /** The essentials still missing, in priority order. Empty means ready. */
  missing: DesignerQuestionCode[];
  readyToGenerate: boolean;
}

/**
 * The mode recommendation, as the frontend needs it.
 *
 * `switchable` is the server's own answer to "would `setMode` succeed right now?", read from
 * the same three conditions the action checks (`setMode` refuses with `MODE_LOCKED` once a
 * goal, a scope or any preparedness exists). It is reported rather than acted on: switching
 * mode **replaces the brief**, so folding it into a setup proposal would wipe the very fields
 * the proposal was setting. The frontend offers the switch; the student takes it.
 */
export interface DesignerModeRecommendation {
  mode: "EXAM" | "ROADMAP" | "MASTERY";
  /** One sentence, assembled server-side from a closed table. */
  text: string;
  /** True when `setMode` would be accepted for this brief as it stands. */
  switchable: boolean;
}

/** The one material question, when the server has decided a question is worth asking. */
export interface DesignerQuestion {
  code: DesignerQuestionCode;
  question: string;
  options: string[];
}

/** One change the Designer is about to make, as the student will read it. */
export type DesignerChange = CopilotCommandPreview;

/** A signed setup proposal, in the shape the existing apply endpoint already accepts. */
export interface DesignerProposal {
  proposalId: string;
  token: string;
  summary: string;
  changes: DesignerChange[];
  requiresAcknowledgement: CopilotConfirmationCode[];
  expiresAt: string;
}

/**
 * What one Designer turn produced. Exactly one of these shapes is meaningful, and the
 * frontend switches on `outcome` rather than reading prose.
 */
export type DesignerTurnResult =
  | {
      outcome: "DESIGNER_APPLIED";
      intent: DesignerIntent;
      summary: string;
      /** What was actually written, server-authored. */
      changes: DesignerChange[];
    }
  | {
      outcome: "DESIGNER_PROPOSED";
      intent: DesignerIntent;
      summary: string;
      proposal: DesignerProposal;
    }
  | {
      outcome: "DESIGNER_QUESTION";
      intent: DesignerIntent;
      summary: string;
      /** The one thing worth asking, chosen by the server from the brief's own gaps. */
      question: DesignerQuestion;
    }
  | {
      outcome: "DESIGNER_RECOMMENDATION";
      intent: DesignerIntent;
      summary: string;
    }
  | {
      outcome: "DESIGNER_ROUTED";
      intent: DesignerIntent;
      summary: string;
      route: "RESEARCH" | "COMPARISON";
      /** The exact action the client should send, already validated. */
      request: unknown;
      proposal: DesignerProposal;
    }
  | {
      outcome: "DESIGNER_ANSWERED";
      intent: DesignerIntent;
      summary: string;
      facts: CopilotExplanationFact[];
      phrasing: string | null;
      clarification: CopilotClarification;
    }
  | {
      outcome: "DESIGNER_REFUSED";
      intent: DesignerIntent;
      code: CopilotErrorCode | DesignerRefusalCode;
      message: string;
      /** Set when one thing has to exist first, so the surface can offer that control. */
      prerequisite?: CopilotPrerequisite;
      /** Set for imports: the scope step is where upload and paste live. */
      routeTo?: "SCOPE";
    };

/**
 * What one turn returns.
 *
 * `summary`, `mode` and `guidance` sit on the envelope rather than inside each result variant,
 * because they are true of *every* turn and the frontend needs them regardless of which
 * outcome it is rendering: the panel's "PLAN SO FAR" header, the mode suggestion button, and
 * the advisory tip line. Putting them inside the variants would mean six copies of the same
 * three fields and six chances for one to be forgotten.
 */
export interface DesignerTurnOutcome {
  result: DesignerTurnResult;
  /** §26 — the setup as the *server* holds it. Never model-authored. */
  summary: DesignerSummary;
  /** §9 — the mode that fits, when it is not the current one. Never switched automatically. */
  mode: DesignerModeRecommendation | null;
  /** §16/§17 — advice, always optional, assembled server-side. */
  guidance: DesignerGuidance[];
  /**
   * What the student said that Sylf could not place, one sentence each.
   *
   * Empty on almost every turn. It exists because a setup message is several facts at once: a
   * unit the student named that is not in the confirmed scope yet must not cost them the rest of
   * the sentence, and it must not be guessed at either. The frontend shows these beside the
   * applied changes rather than inside the assistant's prose.
   */
  unresolved: string[];
  /**
   * The one material question, when an essential is still missing.
   *
   * Carried on the envelope as well as in `DESIGNER_QUESTION`, because a turn that proposes
   * changes can *also* leave the setup incomplete — "I did A-Level Maths and I'm weak at
   * mechanics" produces a proposal and still has no date. The frontend asks it once the student
   * has dealt with the proposal, which is the order §15 describes: one question at a time, and
   * never a question about something already answered.
   */
  question: DesignerQuestion | null;
  metrics: {
    modelPasses: number;
    inputChars: number;
    outputChars: number;
    latencyMs: number;
    commandCount: number;
  };
}

/** Re-exported so a caller needs one import, not three. */
export type {
  CopilotCommand,
  CopilotCommandPreview,
  CopilotClarification,
  CopilotErrorCode,
  CopilotPrerequisite,
};
