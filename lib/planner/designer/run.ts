import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PlannerError } from "../errors";
import { plannerTelemetry } from "../telemetry";
import type { IntakeView } from "../intake/actions";
import { readIntake, applyBriefCommandBatch } from "../server/intake";
import { isExpired, readSession } from "../server/intake-session";
import { briefReadiness } from "../intake/readiness";
import { resolveAuthorities } from "../research/authority";
import {
  CopilotTurnRequestSchema,
  COPILOT_LIMITS,
  type CopilotClarification,
  type CopilotCommand,
  type CopilotPrerequisite,
} from "../copilot/contracts";
import {
  CopilotModelError,
  deepseekCopilotModel,
  type CopilotModel,
} from "../copilot/model";
import { buildCopilotContext, copilotToday } from "../copilot/context";
import { explanationFacts, deterministicExplanation } from "../copilot/explain";
import { mapCommands, DIRECT_EXECUTION_COMMANDS, type MappedPlan } from "../copilot/map";
import { mintProposal } from "../copilot/proposal";
import { latencyBucket } from "../copilot/run";
import {
  designerGuidance,
  designerSummary,
  modeRecommendation,
  questionFor,
} from "./project";
import {
  type PlannerDesignerInterpretationV1,
  type DesignerGuidance,
  type DesignerIntent,
  type DesignerModeRecommendation,
  type DesignerQuestion,
  type DesignerSummary,
  type DesignerTurnOutcome,
  type DesignerTurnResult,
  PlannerDesignerInterpretationV1Schema,
} from "./contracts";
import { deepseekDesignerModel, type DesignerModel } from "./model";

/**
 * One Plan Designer turn.
 *
 * The Designer is the *pre-generation* half of the same assistant whose post-brief half is the
 * Copilot. It exists because the opening message of a real conversation is not a change request
 * — it is a description, and it usually carries several facts at once:
 *
 *   "I have my NUST NET in February. I did A-Level Maths and Physics, I'm rusty at mechanics,
 *    and I can study around 10 hours a week."
 *
 * The Copilot's contract can carry the commands that sentence implies, but nothing about what
 * was *understood*, what is still *missing*, or which Planner the student is even in — and
 * those are the three things that make the reply useful rather than merely correct.
 *
 * ## What is bounded
 *
 * Exactly the Copilot's bounds, because they are properties of talking to a model about a
 * planner rather than of this particular conversation:
 *
 * ```
 * read state → project context → one interpretation pass → resolve against the brief
 *            → decide outcome → (answer | ask | recommend | propose | apply | route)
 *            → optional one wording pass
 * ```
 *
 * No loop. No tool call. No second attempt at the same question. No database write except the
 * one the student's own command asks for, and never outside the intake service that already
 * owns it.
 *
 * ## What the server decides, not the model
 *
 * - **Which question is material.** `questionFor` compares the model's `questionCode` against
 *   the brief's own missing essentials and *substitutes the real one* when they disagree.
 * - **Whether the mode may change.** `modeRecommendation` reads `setMode`'s own guard and
 *   reports it; the Designer never switches mode, because switching replaces the brief.
 * - **What the changes will do.** `mapCommands` builds every preview sentence from the current
 *   brief, so "I understood that as…" is checkable rather than rhetorical.
 */

export interface DesignerTurnInput {
  userId: number;
  sessionId: string;
  raw: unknown;
  recent?: { role: "STUDENT" | "SYLF"; text: string }[];
  signal?: AbortSignal;
  deps?: {
    model?: DesignerModel;
    /** Injected so a test can freeze the clock a proposal's expiry is measured against. */
    now?: () => Date;
  };
}

/**
 * A request to use a document the student already has.
 *
 * Detected deterministically as well as from the model's intent, because §20 is a *capability
 * gap* rather than a comprehension problem: there is no import command in the backend, so a
 * model that happens to miss the phrasing must not turn "use the PDF I uploaded" into a
 * cheerful promise. The scan is narrow on purpose — it looks for a document being referred to,
 * not for the word "file" in any sentence.
 */
const IMPORT_PHRASES =
  /\b(upload(ed)?|attach(ed|ment)?|the (pdf|doc|docx|image|scan|file)|my (pdf|doc|docx|image|scan|file|syllabus (pdf|file|document))|paste[d]? (it|this|my)|use (the|my) (pdf|file|document|scan|upload))\b/i;

/** Was this turn asking Sylf to read a document? */
export function looksLikeImportRequest(message: string): boolean {
  return IMPORT_PHRASES.test(message);
}

const IMPORT_MESSAGE =
  "I can't take a file in this conversation. Uploading and pasting happen on the scope step — take me there and I'll read it and show you the units before anything is used.";

/**
 * Ask the Designer for a refinement of one turn.
 *
 * The client cannot send Designer commands directly — there is no field for them in
 * `CopilotTurnRequestSchema`, and `commands` live inside the signed proposal token precisely so
 * that a client cannot rewrite them. This function exists only so a caller can plug in a
 * deterministic double in tests.
 */
export async function runDesignerTurn(input: DesignerTurnInput): Promise<{
  result: DesignerTurnResult;
  view: IntakeView;
  summary: DesignerSummary;
  mode: DesignerModeRecommendation | null;
  guidance: DesignerGuidance[];
  /** Statements Sylf understood but could not place — a unit that is not in the scope yet. */
  unresolved: string[];
  /** The one material question, when an essential is still missing after this turn. */
  question: DesignerQuestion | null;
  metrics: DesignerTurnOutcome["metrics"];
}> {
  const started = Date.now();
  const body = CopilotTurnRequestSchema.parse(input.raw);
  const session = await readSession(input.userId, input.sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  const view = await readIntake(input.userId, input.sessionId);
  const today = await copilotToday(prisma, input.userId);

  const readiness = briefReadiness(view.brief, {
    scheduleWeeklyMinutes: view.scheduleWeeklyMinutes,
    researchAvailable: view.readiness.state === "RESEARCH_AVAILABLE",
  });
  const summary = designerSummary({ brief: view.brief, readiness });

  const researchConfigured = view.comparison.available || Boolean(process.env.SERPER_API_KEY);
  const guidance: DesignerGuidance[] = designerGuidance({
    brief: view.brief,
    summary,
    researchConfigured,
    today,
  });

  /**
   * Read the plan this intake generated, exactly as the Copilot does.
   *
   * This is not optional bookkeeping. Assuming `PRE_GENERATION` would be the safe *direction*
   * only if nothing downstream depended on it — but the intake brief of a session whose plan is
   * confirmed is still writable, so a Designer that never looked would cheerfully redesign a
   * setup underneath a live plan. The lifecycle has to be read from the session, and then the
   * checks below have something true to refuse on.
   */
  const plan = session.planId
    ? await prisma.plannerPlan.findFirst({
        where: { id: session.planId, userId: input.userId },
        select: { id: true, version: true, latestDraftRevisionId: true, activeRevisionId: true },
      })
    : null;

  const context = buildCopilotContext({
    brief: view.brief,
    readiness: { state: readiness.state, missing: readiness.missing },
    today,
    researchConfigured,
    hardLimits: {
      weekly: view.limits.weeklyLimitMinutes,
      session: view.limits.sessionLimitMinutes,
      unavailableWeekdays: view.limits.unavailableWeekdays,
    },
    comparisonState: view.comparison.state,
    plan,
    // The Designer does not summarise drafts or confirmed plans: it refuses in those
    // lifecycles rather than describing them, and a summary it will never use is a summary
    // that can only go stale.
    draftSummary: null,
    confirmedSummary: null,
  });

  plannerTelemetry("designer_message_sent", {
    mode: view.mode,
    planLifecycleState: context.lifecycle,
    commandCount: (input.recent ?? []).length,
  });

  const matchedUnits = matchedUnitLabelsFor(view, body.message);
  const facts = explanationFacts({ context, question: body.message, matchedUnits });

  const model = input.deps?.model ?? deepseekDesignerModel();
  let interpretation: PlannerDesignerInterpretationV1;
  let modelPasses = 0;
  let inputChars = 0;
  let outputChars = 0;
  try {
    const interpreted = await model.interpret({
      context,
      recent: (input.recent ?? []).slice(-COPILOT_LIMITS.maxRecentTurns).map((turn) => ({
        role: turn.role,
        text: turn.text.slice(0, 300),
      })),
      message: body.message,
      factIds: facts.map((fact) => fact.id),
      signal: input.signal,
    });
    interpretation = interpreted.interpretation;
    modelPasses += 1;
    inputChars += interpreted.inputChars;
    outputChars += interpreted.outputChars;
  } catch (error) {
    const code = error instanceof CopilotModelError ? error.code : "MODEL_UNAVAILABLE";
    plannerTelemetry("designer_bad_output", { mode: view.mode, conflictCode: code });
    return envelope(
      {
        result: {
          outcome: "DESIGNER_REFUSED",
          intent: "UNKNOWN",
          code: code === "COPILOT_BAD_OUTPUT" ? "COPILOT_BAD_OUTPUT" : "MODEL_UNAVAILABLE",
          message:
            code === "COPILOT_BAD_OUTPUT"
              ? "I could not read that. Tell me what you are preparing for, and when it is."
              : "Sylf's assistant is unavailable right now. The setup controls still work.",
        },
        view,
        summary,
        mode: null,
        guidance,
        unresolved: [],
        question: null,
        metrics: { modelPasses, inputChars, outputChars, latencyMs: Date.now() - started, commandCount: 0 },
      },
      started
    );
  }

  /**
   * The material question, decided once for the whole turn.
   *
   * Computed from the brief's own missing essentials and the model's *hint*, so every outcome
   * that follows can carry it without any of them deciding it for themselves.
   */
  const materialQuestion: DesignerQuestion | null = questionFor({
    missing: summary.missing,
    modelCode: interpretation.questionCode,
    modelQuestion: interpretation.question,
    modelOptions: interpretation.questionOptions,
  });

  const mode = modeRecommendation({
    brief: view.brief,
    mode: interpretation.recommendedMode,
    reason: interpretation.modeReason,
  });

  const finish = (
    result: DesignerTurnResult,
    commandCount: number,
    /**
     * The parts of the message Sylf could not place.
     *
     * Explicit rather than defaulted to `unresolved`: that binding is declared further down,
     * after the mapping stage, and a default parameter referencing it would be evaluated at call
     * time — inside its temporal dead zone for every turn that ends before mapping. Passing it
     * keeps the ordering hazard out of the signature.
     */
    notes: string[] = [],
    currentView: IntakeView = view
  ): ReturnType<typeof envelope> => {
    plannerTelemetry("designer_interpreted", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount,
      planLifecycleState: context.lifecycle,
      proposalOutcome: result.outcome,
      latencyBucket: latencyBucket(Date.now() - started),
      modelPasses,
    });
    return envelope(
      {
        result,
        view: currentView,
        summary,
        mode,
        guidance,
        unresolved: notes,
        question: materialQuestion,
        metrics: { modelPasses, inputChars, outputChars, latencyMs: Date.now() - started, commandCount },
      },
      started
    );
  };

  // ── An import request: a capability gap, answered as one ───────────────────
  /**
   * Before anything else, including a clarification: asking which document the student means
   * would imply Sylf can read one, and it cannot. Checked against the model's intent *and* the
   * message, because this is the one refusal that must not depend on comprehension.
   */
  if (interpretation.intent === "IMPORT" || looksLikeImportRequest(body.message)) {
    plannerTelemetry("designer_import_refused", { mode: view.mode });
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: "IMPORT",
        code: "IMPORT_IN_SCOPE_STEP",
        message: IMPORT_MESSAGE,
        routeTo: "SCOPE",
      },
      0
    );
  }

  // ── A question, not a change ───────────────────────────────────────────────
  if (interpretation.intent === "EXPLAIN") {
    plannerTelemetry("designer_explanation_requested", {
      mode: view.mode,
      intent: interpretation.intent,
      planLifecycleState: context.lifecycle,
    });
    let phrasing: string | null = null;
    if (facts.length) {
      try {
        const phrased = await model.phrase({ question: body.message, facts, signal: input.signal });
        phrasing = phrased.phrasing;
        modelPasses += 1;
        inputChars += phrased.inputChars;
        outputChars += phrased.outputChars;
      } catch {
        // A wording pass that fails is not a failed answer: the facts are the answer.
        phrasing = null;
      }
    }
    return finish(
      {
        outcome: "DESIGNER_ANSWERED",
        intent: "EXPLAIN",
        summary: interpretation.summary || deterministicExplanation(facts) || DESIGNER_CAPABILITY_LINE,
        facts,
        phrasing,
        clarification: { required: false },
      },
      0
    );
  }

  /**
   * Anything that is not about this study plan.
   *
   * §31: the assistant is planner-scoped. The useful answer names what it *can* do rather than
   * apologising, so the student's next message is a better one.
   */
  if (interpretation.intent === "UNKNOWN")
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: "UNKNOWN",
        code: "OFF_TOPIC",
        message: DESIGNER_CAPABILITY_LINE,
      },
      0
    );

  // ── Lifecycle: the Designer is pre-generation only ─────────────────────────
  /**
   * §6's boundary, enforced rather than described. Once a draft or a confirmed plan exists the
   * Copilot owns the conversation, with its own vocabulary (draft edits, replan, release) and
   * its own lifecycle table. Letting the Designer keep designing at that point would offer
   * changes the intake will refuse and hide the capabilities that actually apply.
   */
  if (context.lifecycle === "DRAFT_REVIEW")
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: interpretation.intent,
        code: "COMMAND_NOT_ALLOWED_IN_STATE",
        message:
          "There is a draft to review, so I can change the draft itself now — try removing, shortening or moving a session.",
      },
      interpretation.commands.length
    );
  if (context.lifecycle === "CONFIRMED")
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: interpretation.intent,
        code: "COMMAND_NOT_ALLOWED_IN_STATE",
        message:
          "This plan is already confirmed, so its structure changes through a replan. Ask me to rebalance the remaining work instead.",
      },
      interpretation.commands.length
    );

  /**
   * Research policy is absolute.
   *
   * Checked against the intent as well as the commands, for the reason the Copilot records: a
   * model obeying its instruction not to request research answers with *no command*, and a
   * message with no commands must not be answered with a clarification that implies Sylf is
   * about to look.
   */
  const researchIntent =
    interpretation.intent === "RESEARCH" || interpretation.intent === "COMPARISON";
  if (researchIntent && context.researchPolicy === "OFF")
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: interpretation.intent,
        code: "RESEARCH_DISABLED",
        message:
          "Web research is off for this plan. I can work only from what you have given me — turn research back on in the scope controls and I will look.",
      },
      interpretation.commands.length
    );

  // ── One clarification, when a request cannot be mapped safely ──────────────
  if (interpretation.clarification.required) {
    plannerTelemetry("designer_clarification_requested", {
      mode: view.mode,
      intent: interpretation.intent,
      clarificationCode: interpretation.clarification.code,
      planLifecycleState: context.lifecycle,
    });
    return finish(
      {
        outcome: "DESIGNER_ANSWERED",
        intent: interpretation.intent,
        summary: interpretation.summary || "I need one thing clarified before I change anything.",
        facts: [],
        phrasing: null,
        clarification: interpretation.clarification as CopilotClarification,
      },
      0
    );
  }

  const commands = interpretation.commands as CopilotCommand[];

  // ── Nothing to apply ───────────────────────────────────────────────────────
  if (!commands.length) {
    /**
     * §15's whole policy in one branch: ask only about a missing *essential*, in priority
     * order, one at a time — and when nothing essential is missing, offer advice instead of
     * another question.
     *
     * This is the Designer's answer to "do not create another wizard in chat form": the
     * question comes from the brief, not from the conversation, so a student who has already
     * said everything is never asked anything.
     */
    if (materialQuestion)
      return finish(
        {
          outcome: "DESIGNER_QUESTION",
          intent: interpretation.intent,
          summary: interpretation.summary || materialQuestion.question,
          question: materialQuestion,
        },
        0
      );

    plannerTelemetry("designer_recommendation_given", {
      mode: view.mode,
      intent: interpretation.intent,
      planLifecycleState: context.lifecycle,
    });
    return finish(
      {
        outcome: "DESIGNER_RECOMMENDATION",
        intent: interpretation.intent,
        summary:
          interpretation.summary ||
          (summary.readyToGenerate
            ? "You have everything I need to make a first draft. You can generate now, or tell me anything you'd like to change."
            : "Tell me what you are preparing for and when, and I will set it up."),
      },
      0
    );
  }

  // ── The five-change ceiling, and the split rule ────────────────────────────
  const briefCount = commands.filter((command) => isBriefCommandName(command.command)).length;
  const capabilityCount = commands.length - briefCount;
  if (commands.length > COPILOT_LIMITS.maxCommandsPerTurn || (briefCount && capabilityCount))
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: interpretation.intent,
        code: "TOO_MANY_CHANGES",
        message:
          briefCount && capabilityCount
            ? "That is two different things: a change to your setup, and something I have to go and look up. Tell me one at a time — the setup first — and I will do each of them properly."
            : "That is more changes than I will make in one message. Send up to five at a time and I will make each one exactly as you mean it.",
      },
      commands.length
    );

  const mapped: MappedPlan = mapCommands({ brief: view.brief, today, commands });

  /**
   * A research request while the policy is off is refused here too, because this is the check
   * the *commands* pass through: a promise in a prompt is not a guarantee.
   */
  const wantsResearch = commands.some(
    (command) =>
      command.command === "REQUEST_SCOPE_RESEARCH" || command.command === "REQUEST_CURRICULUM_COMPARISON"
  );
  if (wantsResearch && context.researchPolicy === "OFF")
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: "RESEARCH",
        code: "RESEARCH_DISABLED",
        message:
          "Web research is off for this plan. I can work only from what you have given me — turn research back on in the scope controls and I will look.",
      },
      commands.length
    );

  /**
   * A command that cannot be resolved does not have to discard the whole message.
   *
   * This is the Designer's one real departure from the Copilot, and the live corpus is what
   * showed it was needed. A Copilot message is one request, so a label it cannot place means the
   * request failed and saying so is exactly right. An opening setup message is *several facts* —
   * "I did A-Level Maths, I'm rusty at mechanics, and I can study 10 hours a week" — and refusing
   * all three because "mechanics" is not yet a confirmed unit throws away two facts the student
   * stated clearly and can be applied with no invention at all.
   *
   * So the resolved commands are kept and the unresolved ones are **reported**: nothing is
   * guessed, the student is told which part Sylf could not place, and the rest of their setup is
   * still theirs. The safety rule is untouched — a label still resolves against the confirmed
   * scope or not at all, and no unit is ever invented.
   *
   * When *nothing* resolved, the turn is refused exactly as before: there is no partial success
   * to report and the refusal is the whole answer.
   */
  const unresolved = mapped.commands
    .filter((entry): entry is Extract<MappedPlan["commands"][number], { kind: "REFUSED" }> => entry.kind === "REFUSED")
    .map((entry) => entry.detail);
  const actionable = mapped.commands.filter((entry) => entry.kind !== "REFUSED");
  const firstRefusal = mapped.commands.find(
    (entry): entry is Extract<MappedPlan["commands"][number], { kind: "REFUSED" }> => entry.kind === "REFUSED"
  );
  if (!actionable.length && firstRefusal)
    return finish(
      {
        outcome: "DESIGNER_REFUSED",
        intent: interpretation.intent,
        code: firstRefusal.code === "UNKNOWN_REFERENCE" ? "UNKNOWN_REFERENCE" : "COMMAND_NOT_ALLOWED_IN_STATE",
        message: firstRefusal.detail,
      },
      commands.length
    );

  // ── A capability: confirm first, then route ────────────────────────────────
  /**
   * Research and comparison are *routed*, never executed here. They own their bounded
   * pipelines, their own telemetry and their own review step, and the Phase 3 research engine
   * is untouched by this module — the Designer can ask for it and nothing more.
   */
  const capability = actionable.find((entry) => entry.kind === "CAPABILITY");
  if (capability && capability.kind === "CAPABILITY") {
    const token = mintProposal({
      sessionId: input.sessionId,
      expectedVersion: view.version,
      intent: interpretation.intent,
      summary: interpretation.summary,
      commands,
      ...(input.deps?.now ? { now: input.deps.now() } : {}),
    });
    plannerTelemetry("designer_proposal_created", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount: commands.length,
      planLifecycleState: context.lifecycle,
      researchRouted: capability.capability === "RESEARCH" || capability.capability === "COMPARISON" ? 1 : 0,
    });
    return finish(
      {
        outcome: "DESIGNER_ROUTED",
        intent: interpretation.intent,
        summary: interpretation.summary,
        route: capability.capability === "RESEARCH" ? "RESEARCH" : "COMPARISON",
        request:
          capability.capability === "RESEARCH"
            ? { action: "researchScope" }
            : {
                action: "compareCurricula",
                ...(capability.payload.kind === "COMPARISON" && capability.payload.refresh
                  ? { force: true }
                  : {}),
              },
        proposal: {
          proposalId: token.proposalId,
          token: token.token,
          summary: interpretation.summary,
          changes: mapped.preview,
          requiresAcknowledgement: mapped.requires,
          expiresAt: token.expiresAt,
        },
      },
      commands.length,
      unresolved
    );
  }

  const briefCommands = actionable
    .filter((entry): entry is Extract<MappedPlan["commands"][number], { kind: "ACTION" }> => entry.kind === "ACTION")
    .map((entry) => entry.action);

  /**
   * Direct apply, or a setup proposal.
   *
   * The rule is the Copilot's, unchanged: one command, high confidence, on the direct list, and
   * no hard constraint or scope removal. A single reversible edit a student could have made by
   * hand still applies straight away — "I only have 6 hours a week" should not need a
   * confirmation click.
   *
   * What is different here is the *default* for a multi-fact opening message. Five facts about
   * four parts of a brief arrive as four or five commands, and the Copilot's ceiling would have
   * refused them as too many. The Designer instead mints **one setup proposal**: a single
   * signed token carrying every validated command, previewed as the concrete consequences they
   * will have, applied atomically on one confirmation (§12, §13).
   */
  const directEligible =
    unresolved.length === 0 &&
    briefCommands.length === 1 &&
    commands.length === 1 &&
    interpretation.confidence === "HIGH" &&
    (DIRECT_EXECUTION_COMMANDS as readonly string[]).includes(commands[0].command) &&
    !mapped.requires.includes("HARD_CONSTRAINT") &&
    !mapped.requires.includes("SCOPE_REMOVAL");

  if (directEligible) {
    const next = await applyBriefCommandBatch(input.userId, input.sessionId, {
      commands: briefCommands as never,
      expectedVersion: view.version,
      actionKey: randomUUID(),
    });
    plannerTelemetry("designer_proposal_applied", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount: 1,
      proposalOutcome: "APPLIED",
      planLifecycleState: context.lifecycle,
    });
    const afterReadiness = briefReadiness(next.brief, {
      scheduleWeeklyMinutes: next.scheduleWeeklyMinutes,
      researchAvailable: next.readiness.state === "RESEARCH_AVAILABLE",
    });
    return envelope(
      {
        result: {
          outcome: "DESIGNER_APPLIED",
          intent: interpretation.intent,
          summary: interpretation.summary || mapped.preview.map((entry) => entry.consequence).join(" "),
          changes: mapped.preview,
        },
        view: next,
        // Re-derived from the brief the write actually produced, so the panel cannot show a
        // setup that the server does not hold.
        summary: designerSummary({ brief: next.brief, readiness: afterReadiness }),
        mode,
        guidance,
        unresolved,
        question: materialQuestion,
        metrics: { modelPasses, inputChars, outputChars, latencyMs: Date.now() - started, commandCount: 1 },
      },
      started
    );
  }

  const token = mintProposal({
    sessionId: input.sessionId,
    expectedVersion: view.version,
    intent: interpretation.intent,
    summary: interpretation.summary,
    commands,
    ...(input.deps?.now ? { now: input.deps.now() } : {}),
  });
  const requires = new Set(mapped.requires);
  if (commands.length > 1) requires.add("MULTI_COMMAND");
  if (interpretation.confidence !== "HIGH") requires.add("LOW_CONFIDENCE");
  plannerTelemetry("designer_proposal_created", {
    mode: view.mode,
    intent: interpretation.intent,
    commandCount: commands.length,
    planLifecycleState: context.lifecycle,
    proposalOutcome: "PROPOSED",
  });
  return finish(
    {
      outcome: "DESIGNER_PROPOSED",
      intent: interpretation.intent,
      summary: interpretation.summary || "Here is the setup I would use.",
      proposal: {
        proposalId: token.proposalId,
        token: token.token,
        summary: interpretation.summary,
        changes: mapped.preview,
        requiresAcknowledgement: [...requires],
        expiresAt: token.expiresAt,
      },
    },
    commands.length,
    unresolved
  );
}

/** The line the assistant gives when it cannot help, which names what it can do. */
export const DESIGNER_CAPABILITY_LINE =
  "I help with this study plan — what you are preparing for, what it should cover, when it is due, and how much time you have.";

/** Is this command one the intake applies to the brief, rather than a routed capability? */
function isBriefCommandName(name: string): boolean {
  return !["REQUEST_SCOPE_RESEARCH", "REQUEST_CURRICULUM_COMPARISON", "REQUEST_DRAFT_EDIT", "REQUEST_REPLAN", "RELEASE_GENERATED_ITEM"].includes(
    name
  );
}

/**
 * Strip the envelope down to what the caller needs, and record the turn once.
 *
 * `finish` and this function are separate so the *apply* path can report a summary derived from
 * the brief the write produced rather than from the one the turn started with — the one case
 * where a single summary computed up front would be a lie.
 */
function envelope(
  outcome: {
    result: DesignerTurnResult;
    view: IntakeView;
    summary: DesignerSummary;
    mode: DesignerModeRecommendation | null;
    guidance: DesignerGuidance[];
    unresolved: string[];
    question: DesignerQuestion | null;
    metrics: DesignerTurnOutcome["metrics"];
  },
  started: number
) {
  void started;
  return outcome;
}

/** The units a message names, resolved from the student's own words. Deterministic. */
function matchedUnitLabelsFor(view: IntakeView, message: string): string[] {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = normalise(message);
  if (!haystack) return [];
  const words = new Set(haystack.split(" ").filter((word) => word.length >= 3));
  return view.brief.scope.nodes
    .filter((node) => node.selected)
    .map((node) => node.label)
    .filter((label) => {
      const normalised = normalise(label);
      if (!normalised) return false;
      if (haystack.includes(normalised)) return true;
      return normalised.split(" ").some((word) => word.length >= 3 && words.has(word));
    })
    .slice(0, 6);
}

export { DesignerIntentSchema, PlannerDesignerInterpretationV1Schema } from "./contracts";
export { deepseekCopilotModel };
export type { DesignerIntent } from "./contracts";
export type { CopilotPrerequisite } from "../copilot/contracts";
