import type { NormalizedMessagePart } from "@/lib/ai/providers/types";
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PlannerError } from "../errors";
import { plannerTelemetry } from "../telemetry";
import { selectSearchProvider } from "../research/search/provider";
import { readSession, isExpired } from "../server/intake-session";
import { applyBriefCommandBatch, readIntake } from "../server/intake";
import { appendEdit } from "../server/revisions";
import { releaseCandidates, releaseGeneratedItem } from "./release";
import {
  COPILOT_LIMITS,
  CopilotApplyRequestSchema,
  CopilotTurnRequestSchema,
  isBriefCommand,
  isCapabilityCommand,
  type CopilotCommand,
  type CopilotIntent,
  type CopilotPrerequisite,
  type CopilotTurnResult,
} from "./contracts";
import type { PlanBriefV1 } from "../intake/brief";
import { buildCopilotContext, confirmedPlanSummary, copilotToday } from "./context";
import { flattenScope, type ScopeNode } from "../intake/brief";
import { CopilotModelError, deepseekCopilotModel, type CopilotModel } from "./model";
import { mapCommands, type MappedPlan } from "./map";
import { deterministicExplanation, explanationFacts } from "./explain";
import { mintProposal, readProposal } from "./proposal";
import { COPILOT_INTENT_LIFECYCLE, type CopilotConfirmationCode } from "./outcomes";
import { DIRECT_EXECUTION_COMMANDS } from "./map";

/**
 * The Copilot turn: interpret, validate against the current state, and then answer, propose
 * or route — never act on the model's word alone.
 *
 * The pipeline is bounded and one-directional:
 *
 * ```
 * read state → project context → one interpretation pass → resolve against state
 *            → decide outcome → (answer | proposal | routing) → optional one wording pass
 * ```
 *
 * There is no loop, no tool call and no second attempt at the same question. Everything the
 * model produces is treated as a *proposal about language*: labels are resolved against the
 * confirmed scope, dates against the current intake, values against the same bounds the
 * structured UI uses, and the resulting actions are the planner's own actions. When a
 * command cannot be resolved the answer is a refusal or a single clarification — never a
 * guess, and never a message to the database.
 */

export interface CopilotTurnOutcome {
  result: CopilotTurnResult;
  /** The intake view after anything that changed it (an explanation changes nothing). */
  view: Awaited<ReturnType<typeof readIntake>>;
  metrics: {
    modelPasses: number;
    inputChars: number;
    outputChars: number;
    latencyMs: number;
    commandCount: number;
  };
}

/**
 * The latency bucket telemetry records, so no exact timing leaves the server.
 *
 * Exported because the Plan Designer reports the same buckets for the same events: two
 * definitions would be two thresholds, and a metric whose boundaries depend on which assistant
 * produced it is not a metric.
 */
export const latencyBucket = (ms: number): "FAST" | "NORMAL" | "SLOW" =>
  ms < 1_500 ? "FAST" : ms < 6_000 ? "NORMAL" : "SLOW";

export interface CopilotDeps {
  model?: CopilotModel;
  /** Injected by tests: the whole orchestration runs without a provider. */
  now?: () => Date;
}

/**
 * What a request needs to already exist, proved from the brief rather than guessed.
 *
 * The rule this encodes: report a prerequisite only when the *server* can see it is absent.
 * Every check below reads one field the student's own brief owns, so a refusal can never be
 * a guess about what they meant — and a request that has everything it needs is never
 * blocked here.
 *
 * The order follows the plan's own lifecycle, so the answer is always the *next* thing to
 * do rather than the last: a name for what is being planned, then the curriculum being
 * compared against, then a confirmed scope to compare it with. `DRAFT_REQUIRED` and
 * `CONFIRMED_PLAN_REQUIRED` are the same idea one stage further on, and they are read from
 * the lifecycle the projection already computed rather than from a second lookup.
 */
function prerequisiteFor(
  intent: CopilotIntent,
  commands: readonly CopilotCommand[],
  brief: PlanBriefV1,
  lifecycle: "PRE_GENERATION" | "DRAFT_REVIEW" | "CONFIRMED"
): CopilotPrerequisite | null {
  const hasGoal = Boolean(brief.goal.title.trim());
  const hasBackground = Boolean(brief.backgroundCurriculum?.label.trim());
  const hasScope = brief.scope.nodes.length > 0;

  /**
   * The *commands* are consulted first, because they are what the request actually asks for.
   *
   * A live corpus is what showed the difference matters. "Compare this with my A-Level
   * background" comes back two ways from the same model on different days: sometimes as a
   * comparison request with no command, sometimes as a background edit *plus* a comparison
   * command. The first shape reached the prerequisite check and got the useful answer; the
   * second tripped the mixed-confirmation rule first and was told "that is two different things"
   * — accurate, and not the answer to the question that was asked. Reading the commands makes
   * both shapes answer the same way, which is what §33 asks for: a missing prerequisite is
   * reported as a missing prerequisite, not as a counting problem.
   */
  const asksFor = (command: string): boolean => commands.some((entry) => entry.command === command);
  const comparison = intent === "COMPARISON_REQUEST" || asksFor("REQUEST_CURRICULUM_COMPARISON");
  const research = intent === "RESEARCH_REQUEST" || asksFor("REQUEST_SCOPE_RESEARCH");
  const draftEdit = intent === "DRAFT_EDIT" || asksFor("REQUEST_DRAFT_EDIT");
  const planChange =
    intent === "REPLAN_REQUEST" ||
    intent === "RELEASE_GENERATED_ITEM" ||
    asksFor("REQUEST_REPLAN") ||
    asksFor("RELEASE_GENERATED_ITEM");

  if (comparison) {
    if (!hasGoal) return "GOAL_REQUIRED";
    if (!hasBackground) return "BACKGROUND_CURRICULUM_REQUIRED";
    return hasScope ? null : "CONFIRMED_SCOPE_REQUIRED";
  }
  if (research) return hasGoal ? null : "GOAL_REQUIRED";
  if (draftEdit) return lifecycle === "DRAFT_REVIEW" ? null : "DRAFT_REQUIRED";
  if (planChange) return lifecycle === "CONFIRMED" ? null : "CONFIRMED_PLAN_REQUIRED";
  return null;
}

/**
 * One sentence per prerequisite, each naming the control that fixes it.
 *
 * A prerequisite the student cannot act on would be no better than the "too many commands"
 * message it replaces, so every line here points at something the structured surface
 * already offers — which is also why the refusal carries the closed code beside the copy.
 */
const PREREQUISITE_COPY: Record<CopilotPrerequisite, string> = {
  GOAL_REQUIRED: "I need to know what you are preparing for first — add the goal, then ask me again.",
  BACKGROUND_CURRICULUM_REQUIRED:
    "I can compare it once I know what you studied before. Add your background curriculum — for example A-Level Mathematics — and I will compare the two.",
  CONFIRMED_SCOPE_REQUIRED:
    "I can compare them once your scope is confirmed. Find or enter the topics first, confirm them, and then ask me.",
  DRAFT_REQUIRED: "There is no draft to edit yet. Generate a draft, then tell me what to change.",
  CONFIRMED_PLAN_REQUIRED:
    "There is no confirmed plan to change yet. Once the plan is confirmed I can rebalance it or release work from it.",
};

/**
 * Run one Copilot turn.
 *
 * `recent` is the bounded conversation the *client* holds: eight turns at most, truncated
 * here, and never stored. The planner's own state is what the model reasons from, and the
 * brief remains authoritative afterwards.
 */
export async function runCopilotTurn(input: {
  userId: number;
  sessionId: string;
  raw: unknown;
  images?: NormalizedMessagePart[];
  recent?: { role: "STUDENT" | "SYLF"; text: string }[];
  signal?: AbortSignal;
  deps?: CopilotDeps;
}): Promise<CopilotTurnOutcome> {
  const started = Date.now();
  const body = CopilotTurnRequestSchema.parse(input.images?.length ? { ...(input.raw as Record<string, unknown>), proposalOnly: true } : input.raw);
  const session = await readSession(input.userId, input.sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  const view = await readIntake(input.userId, input.sessionId);
  const today = await copilotToday(prisma, input.userId);
  const researchConfigured = selectSearchProvider() !== null;

  // ── The plan this intake generated, if any: this is what makes the Copilot
  //    lifecycle-aware. `session.planId` is set by bindPlan after a draft exists.
  const plan = session.planId
    ? await prisma.plannerPlan.findFirst({
        where: { id: session.planId, userId: input.userId },
        select: { id: true, version: true, mode: true, latestDraftRevisionId: true, activeRevisionId: true },
      })
    : null;
  const draftSummary = plan?.latestDraftRevisionId
    ? await draftSummaryFor(plan.id, plan.latestDraftRevisionId)
    : null;
  const confirmedSummary =
    plan?.activeRevisionId && plan.activeRevisionId !== plan.latestDraftRevisionId
      ? await confirmedPlanSummary({
          tx: prisma,
          planId: plan.id,
          planVersion: plan.version,
          revisionId: plan.activeRevisionId,
          today,
        })
      : null;

  const context = buildCopilotContext({
    brief: view.brief,
    readiness: { state: view.readiness.state, missing: view.readiness.missing },
    today,
    researchConfigured,
    hardLimits: {
      weekly: view.limits.weeklyLimitMinutes,
      session: view.limits.sessionLimitMinutes,
      unavailableWeekdays: view.limits.unavailableWeekdays,
    },
    comparisonState: view.comparison.state,
    plan,
    draftSummary,
    confirmedSummary,
  });

  plannerTelemetry("copilot_message_sent", {
    mode: view.mode,
    planLifecycleState: context.lifecycle,
    commandCount: (input.recent ?? []).length,
  });

  /** Deterministic facts, provided before the model answers so it has nothing to invent. */
  const matchedUnits = matchedUnitLabels(view.brief.scope.nodes, body.message);
  const facts = explanationFacts({
    context,
    question: body.message,
    matchedUnits,
  });

  const model = input.deps?.model ?? deepseekCopilotModel();
  let interpretation;
  let modelPasses = 0;
  let inputChars = 0;
  let outputChars = 0;
  try {
    /**
     * The transcript, from whichever source actually carried it.
     *
     * `input.recent` is the route's own forward of the client array; `body.recent` is the same
     * array as the schema now validates it. Preferring the caller's keeps every existing call
     * site working, and falling back to the parsed field means a request that reached here
     * through a path that did not forward it still gets its history — bounded by the schema
     * rather than by a slice someone remembered to write.
     */
    const history = input.recent ?? body.recent ?? [];
    const interpreted = await model.interpret({
      context,
      recent: history.slice(-COPILOT_LIMITS.maxRecentTurns).map((turn) => ({
        role: turn.role,
        text: turn.text.slice(0, 300),
      })),
      message: body.message,
      factIds: facts.map((fact) => fact.id),
      signal: input.signal,
      images: input.images,
    });
    interpretation = interpreted.interpretation;
    modelPasses += 1;
    inputChars += interpreted.inputChars;
    outputChars += interpreted.outputChars;
  } catch (error) {
    const code = error instanceof CopilotModelError ? error.code : "MODEL_UNAVAILABLE";
    plannerTelemetry("copilot_bad_output", { mode: view.mode, conflictCode: code });
    return {
      result: {
        outcome: "REFUSED",
        intent: "UNKNOWN",
        code: code === "COPILOT_BAD_OUTPUT" ? "COPILOT_BAD_OUTPUT" : "MODEL_UNAVAILABLE",
        message:
          code === "COPILOT_BAD_OUTPUT"
            ? "I could not read that request. Try rephrasing it as one clear change."
            : "Sylf's planner assistant is unavailable right now. The structured controls still work.",
      },
      view,
      metrics: { modelPasses, inputChars, outputChars, latencyMs: Date.now() - started, commandCount: 0 },
    };
  }

  const finish = (result: CopilotTurnResult, commandCount: number): CopilotTurnOutcome => {
    plannerTelemetry("copilot_interpreted", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount,
      planLifecycleState: context.lifecycle,
      proposalOutcome: result.outcome,
      latencyBucket: latencyBucket(Date.now() - started),
      modelPasses,
    });
    return {
      result,
      view,
      metrics: {
        modelPasses,
        inputChars,
        outputChars,
        latencyMs: Date.now() - started,
        commandCount,
      },
    };
  };

  // ── A question, not a change ───────────────────────────────────────────────
  if (interpretation.intent === "EXPLAIN" || interpretation.intent === "UNKNOWN") {
    plannerTelemetry("copilot_explanation_requested", {
      mode: view.mode,
      intent: interpretation.intent,
      planLifecycleState: context.lifecycle,
    });
    let phrasing: string | null = null;
    if (interpretation.intent === "EXPLAIN" && facts.length) {
      try {
        const phrased = await model.phrase({ question: body.message, facts, signal: input.signal });
        phrasing = phrased.phrasing;
        modelPasses += 1;
        inputChars += phrased.inputChars;
        outputChars += phrased.outputChars;
      } catch {
        // A wording pass that fails is not a failed answer: the facts are the answer, and
        // they are shown as they are rather than replaced by an apology.
        phrasing = null;
      }
    }
    return finish(
      {
        outcome: "ANSWERED",
        intent: interpretation.intent,
        summary:
          interpretation.intent === "UNKNOWN"
            ? "I can help change, explain, research or rebalance this study plan."
            : interpretation.summary || deterministicExplanation(facts),
        clarification: interpretation.clarification,
        facts,
        phrasing,
        factsAvailable: facts.length > 0,
      },
      0
    );
  }

  /**
   * Research policy is absolute (§27), and it is checked against the *intent* as well as
   * the commands.
   *
   * The command check below is the security boundary — no proposal may search, fetch or
   * call the research model on a plan whose owner said "use only what I give you", and none
   * can quietly turn the policy back on. This earlier check exists for a different reason,
   * and a live run is what showed it was missing: the model *obeys* its instruction not to
   * request research on an OFF plan, so it answers `RESEARCH_REQUEST` with **no command** —
   * and a message with no commands fell through to "I could not find a change to make in
   * that". Safe, and useless as an answer to "find the syllabus".
   *
   * So an explicit research request on an OFF plan is refused as `RESEARCH_DISABLED` before
   * anything else can claim the turn, including a clarification: asking which exam the
   * student means would imply Sylf is about to look.
   */
  const researchIntent =
    interpretation.intent === "RESEARCH_REQUEST" || interpretation.intent === "COMPARISON_REQUEST";
  if (researchIntent && context.researchPolicy === "OFF")
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: "RESEARCH_DISABLED",
        message:
          "Web research is off for this plan. I can work only from what you have given me — turn research back on in the scope controls and I will look.",
      },
      interpretation.commands.length
    );

  // ── One clarification, when the request cannot be mapped safely ────────────
  if (interpretation.clarification.required) {
    plannerTelemetry("copilot_clarification_requested", {
      mode: view.mode,
      intent: interpretation.intent,
      clarificationCode: interpretation.clarification.code,
      planLifecycleState: context.lifecycle,
    });
    return finish(
      {
        outcome: "ANSWERED",
        intent: interpretation.intent,
        summary: interpretation.summary || "I need one thing clarified before I change anything.",
        clarification: interpretation.clarification,
        facts: [],
        phrasing: null,
        factsAvailable: false,
      },
      0
    );
  }

  /**
   * A missing prerequisite is answered as a missing prerequisite.
   *
   * This runs before the empty-commands branch and before the clarification branch, because
   * both of those would give a worse answer: "I could not find a change to make in that"
   * ignores a question the student actually asked, and a clarifying question implies Sylf is
   * about to do the thing it cannot yet do. It runs *after* the research-policy check, so a
   * switched-off plan still gets its own message rather than a prerequisite it does not have.
   *
   * Every entry here is a fact the server reads off the brief, not a guess about the model:
   * the background curriculum is absent, the scope is unconfirmed, the goal has no title.
   */
  const prerequisite = prerequisiteFor(
    interpretation.intent,
    interpretation.commands as CopilotCommand[],
    view.brief,
    context.lifecycle
  );
  if (prerequisite)
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: "COPILOT_PREREQUISITE_MISSING",
        message: PREREQUISITE_COPY[prerequisite],
        prerequisite,
      },
      interpretation.commands.length
    );

  if (!interpretation.commands.length)
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: "NOTHING_TO_DO",
        message:
          interpretation.summary ||
          "I could not find a change to make in that. Tell me what you would like different about the plan.",
      },
      0
    );

  /**
   * §19's ceiling and §19's split rule. More than five changes, or a change that mixes
   * brief edits with a capability, is answered by asking the student to split it — the
   * alternative (apply some, route others) is exactly the partial application the goal
   * rules out.
   */
  const commands = interpretation.commands;
  const briefCount = commands.filter((command) => isBriefCommand(command.command)).length;
  const capabilityCount = commands.filter((command) => isCapabilityCommand(command.command)).length;
  if (commands.length > COPILOT_LIMITS.maxCommandsPerTurn || (briefCount && capabilityCount))
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: "TOO_MANY_COMMANDS",
        /**
         * The copy names the *distinction*, not a count.
         *
         * A message that mixes an edit to the plan with something Sylf has to go and look up
         * is refused because the two have different confirmation boundaries: the edit changes
         * the brief here and now, and the lookup produces a result the student reviews
         * separately. "That is several separate changes at once" was accurate for a list of
         * edits and confusing for this, so the sentence now says which two things it saw.
         */
        message:
          briefCount && capabilityCount
            ? "That is two different things: a change to your plan, and something I have to go and look up. Tell me one at a time — the plan change first — and I will do each of them properly."
            : "That is more changes than I will make in one message. Send up to five at a time and I will make each one exactly as you mean it.",
      },
      commands.length
    );

  // ── Lifecycle legality, from the table rather than from prose ──────────────
  if (!COPILOT_INTENT_LIFECYCLE[interpretation.intent].includes(context.lifecycle) ||
    (commands.some((command) => command.command === "SET_GOAL") && context.lifecycle !== "PRE_GENERATION"))
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: "COMMAND_NOT_ALLOWED_IN_STATE",
        message:
          context.lifecycle === "CONFIRMED"
            ? "This plan is already confirmed, so its structure changes through a replan. Ask me to rebalance the remaining work instead."
            : "That change does not apply yet. Finish the current step first, then ask me again.",
      },
      commands.length
    );

  const mapped: MappedPlan = mapCommands({
    brief: view.brief,
    today,
    commands: commands as CopilotCommand[],
  });

  /**
   * Research policy is absolute (§27).
   *
   * The model is told not to request research when the student has switched it off, but a
   * promise in a prompt is not a guarantee: the check lives here, so no proposal can search,
   * fetch or call the research model on a plan whose owner said "use only what I give you" —
   * and none can quietly turn the policy back on either.
   */
  const wantsResearch = (commands as CopilotCommand[]).some(
    (command) =>
      command.command === "REQUEST_SCOPE_RESEARCH" || command.command === "REQUEST_CURRICULUM_COMPARISON"
  );
  if (wantsResearch && context.researchPolicy === "OFF")
    return finish(
      {
        outcome: "REFUSED",
        intent: "RESEARCH_REQUEST",
        code: "RESEARCH_DISABLED",
        message:
          "Web research is off for this plan. I can work only from what you have given me — turn research back on in the scope controls and I will look.",
      },
      commands.length
    );

  const refused = mapped.commands.find((entry) => entry.kind === "REFUSED");
  if (refused && refused.kind === "REFUSED")
    return finish(
      {
        outcome: "REFUSED",
        intent: interpretation.intent,
        code: refused.code === "UNKNOWN_REFERENCE" ? "UNKNOWN_REFERENCE" : "COMMAND_NOT_ALLOWED_IN_STATE",
        message: refused.detail,
      },
      commands.length
    );

  // ── A capability: confirm first, then route ────────────────────────────────
  const capability = mapped.commands.find((entry) => entry.kind === "CAPABILITY");
  if (capability && capability.kind === "CAPABILITY") {
    const token = mintProposal({
      sessionId: input.sessionId,
      expectedVersion: view.version,
      intent: interpretation.intent,
      summary: interpretation.summary,
      commands: commands as CopilotCommand[],
      ...(input.deps?.now ? { now: input.deps.now() } : {}),
    });
    plannerTelemetry("copilot_proposal_created", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount: commands.length,
      planLifecycleState: context.lifecycle,
      researchRouted: capability.capability === "RESEARCH" || capability.capability === "COMPARISON" ? 1 : 0,
      replanRouted: capability.capability === "REPLAN" ? 1 : 0,
    });
    return finish(
      {
        outcome: "PROPOSED",
        intent: interpretation.intent,
        summary: interpretation.summary,
        proposal: {
          proposalId: token.proposalId,
          token: token.token,
          intent: interpretation.intent,
          summary: interpretation.summary,
          preview: mapped.preview,
          mutatesBrief: false,
          route: capability.capability,
          expiresAt: token.expiresAt,
          requiresAcknowledgement: mapped.requires,
        },
      },
      commands.length
    );
  }

  const briefCommands = mapped.commands
    .filter((entry): entry is Extract<MappedPlan["commands"][number], { kind: "ACTION" }> => entry.kind === "ACTION")
    .map((entry) => entry.action);

  /**
   * Direct execution, or a confirmation.
   *
   * The boundary, in the order it is applied: one command, high confidence, a command on
   * the direct list, and no hard-constraint or scope-removal consequence. Everything else —
   * two or more changes, anything that creates a hard rule, anything that removes work —
   * is shown to the student first. That is §21's policy, and it is deliberately the
   * conservative side of it: a confirmation costs one click, an unwanted plan change costs
   * the student's trust in the surface.
   */
  const directEligible =
    !body.proposalOnly &&
    briefCommands.length === 1 &&
    commands.length === 1 &&
    interpretation.confidence === "HIGH" &&
    (DIRECT_EXECUTION_COMMANDS as readonly string[]).includes(commands[0].command) &&
    !mapped.requires.includes("HARD_CONSTRAINT") &&
    !mapped.requires.includes("SCOPE_REMOVAL");

  if (directEligible) {
    const actionKey = randomUUID();
    const next = await applyBriefCommandBatch(input.userId, input.sessionId, {
      commands: briefCommands as never,
      expectedVersion: view.version,
      actionKey,
    });
    plannerTelemetry("copilot_proposal_applied", {
      mode: view.mode,
      intent: interpretation.intent,
      commandCount: 1,
      proposalOutcome: "APPLIED",
      planLifecycleState: context.lifecycle,
    });
    return {
      result: {
        outcome: "ROUTED",
        intent: interpretation.intent,
        route: "DRAFT_EDIT",
        request: null,
        summary: mapped.preview.map((entry) => entry.consequence).join(" "),
      },
      view: next,
      metrics: {
        modelPasses,
        inputChars,
        outputChars,
        latencyMs: Date.now() - started,
        commandCount: 1,
      },
    };
  }

  const token = mintProposal({
    sessionId: input.sessionId,
    expectedVersion: view.version,
    intent: interpretation.intent,
    summary: interpretation.summary,
    commands: commands as CopilotCommand[],
    ...(input.deps?.now ? { now: input.deps.now() } : {}),
  });
  const requires = new Set<CopilotConfirmationCode>(mapped.requires);
  if (commands.length > 1) requires.add("MULTI_COMMAND");
  if (interpretation.confidence !== "HIGH") requires.add("LOW_CONFIDENCE");
  plannerTelemetry("copilot_proposal_created", {
    mode: view.mode,
    intent: interpretation.intent,
    commandCount: commands.length,
    planLifecycleState: context.lifecycle,
    proposalOutcome: "PROPOSED",
  });
  return finish(
    {
      outcome: "PROPOSED",
      intent: interpretation.intent,
      summary: interpretation.summary,
      proposal: {
        proposalId: token.proposalId,
        token: token.token,
        intent: interpretation.intent,
        summary: interpretation.summary,
        preview: mapped.preview,
        mutatesBrief: true,
        route: null,
        expiresAt: token.expiresAt,
        requiresAcknowledgement: [...requires],
      },
    },
    commands.length
  );
}

/**
 * The units a message names, resolved from the student's own words.
 *
 * Deterministic and server-side by design: the model is never asked which unit a question
 * is about and then handed facts about it. Words of three letters or more that match a
 * confirmed unit label (or that a label contains) count as naming it; matching nothing is a
 * normal outcome, and the fact base then says it has nothing grounded to explain.
 */
function matchedUnitLabels(nodes: readonly ScopeNode[], message: string): string[] {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = normalise(message);
  if (!haystack) return [];
  const words = new Set(haystack.split(" ").filter((word) => word.length >= 3));
  return flattenScope(nodes)
    .units.filter((unit) => {
      const label = normalise(unit.displayLabel);
      if (!label) return false;
      if (haystack.includes(label)) return true;
      return label.split(" ").some((word) => word.length >= 3 && words.has(word));
    })
    .map((unit) => unit.displayLabel)
    .slice(0, 6);
}

async function draftSummaryFor(
  planId: string,
  revisionId: string
): Promise<{ items: number; kinds: string[]; warnings: number } | null> {
  const revision = await prisma.plannerRevision.findFirst({
    where: { id: revisionId, planId },
    select: { outputSnapshot: true },
  });
  const snapshot = revision?.outputSnapshot as { items?: { type?: string; removed?: boolean }[]; semanticReview?: { deterministicIssues?: number } } | null;
  if (!snapshot?.items) return null;
  const active = snapshot.items.filter((item) => !item.removed);
  return {
    items: active.length,
    kinds: [...new Set(active.map((item) => String(item.type ?? "OTHER")))].slice(0, 12),
    warnings: snapshot.semanticReview?.deterministicIssues ?? 0,
  };
}

/**
 * Apply a proposal the student confirmed.
 *
 * The token is verified first — signature, session, expiry and the intake version it was
 * built against — so a stale proposal cannot land on a brief that has moved. What happens
 * next depends on what the proposal contains: brief commands are folded and written once,
 * while a capability is *routed* rather than executed here, because research, comparison,
 * replanning and draft editing each own their bounded pipeline and their own confirmation.
 *
 * Release is the exception, and the reason is worth stating: it is a plan-level authority
 * act with its own tombstone semantics, its own eligibility rules and no model in the loop,
 * so the Copilot confirm *is* its confirmation step.
 */
export async function applyCopilotProposal(input: {
  userId: number;
  sessionId: string;
  raw: unknown;
  signal?: AbortSignal;
}): Promise<{
  outcome: "APPLIED" | "ROUTED" | "REFRESHED";
  route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE" | null;
  request: unknown | null;
  view: Awaited<ReturnType<typeof readIntake>>;
  findings: unknown[];
  summary: string;
}> {
  const body = CopilotApplyRequestSchema.parse(input.raw);
  const session = await readSession(input.userId, input.sessionId);
  if (isExpired(session)) throw new PlannerError(409, "INTAKE_EXPIRED");
  /**
   * The version the student is confirming against, checked against the version the session
   * is actually on. A proposal that was built before a change — in this tab or another — is
   * refused as stale rather than replayed onto a brief that has moved (§23, §64).
   */
  if (session.version !== body.expectedVersion) throw new PlannerError(409, "COPILOT_PROPOSAL_STALE");
  const view = await readIntake(input.userId, input.sessionId);
  const proposal = readProposal({
    token: body.token,
    sessionId: input.sessionId,
    expectedVersion: body.expectedVersion,
  });

  const briefCommands = proposal.commands.filter((command) => isBriefCommand(command.command));
  const mapped: MappedPlan = mapCommands({
    brief: view.brief,
    today: await copilotToday(prisma, input.userId),
    commands: proposal.commands,
  });
  const capability = mapped.commands.find((entry) => entry.kind === "CAPABILITY");

  if (briefCommands.length) {

  const refused = mapped.commands.find((entry) => entry.kind === "REFUSED");
    if (refused) throw new PlannerError(422, "UNKNOWN_REFERENCE");
    const actions = mapped.commands
      .filter((entry): entry is Extract<MappedPlan["commands"][number], { kind: "ACTION" }> => entry.kind === "ACTION")
      .map((entry) => entry.action);
    const next = await applyBriefCommandBatch(input.userId, input.sessionId, {
      commands: actions as never,
      expectedVersion: body.expectedVersion,
      actionKey: randomUUID(),
    });
    plannerTelemetry("copilot_proposal_applied", {
      mode: view.mode,
      intent: proposal.intent,
      commandCount: actions.length,
      proposalOutcome: "APPLIED",
      planLifecycleState: "PRE_GENERATION",
    });
    return {
      outcome: "APPLIED",
      route: null,
      request: null,
      view: next,
      findings: [],
      summary: proposal.summary,
    };
  }

  if (!capability || capability.kind !== "CAPABILITY")
    throw new PlannerError(422, "NOTHING_TO_DO");

  plannerTelemetry("copilot_proposal_applied", {
    mode: view.mode,
    intent: proposal.intent,
    commandCount: 1,
    proposalOutcome: "APPLIED",
    researchRouted: capability.capability === "RESEARCH" || capability.capability === "COMPARISON" ? 1 : 0,
    replanRouted: capability.capability === "REPLAN" ? 1 : 0,
  });

  if (capability.capability === "RELEASE") {
    const plan = session.planId
      ? await prisma.plannerPlan.findFirst({
          where: { id: session.planId, userId: input.userId },
          select: { id: true, version: true },
        })
      : null;
    if (!plan) throw new PlannerError(409, "RELEASE_NOT_ALLOWED");
    const today = await copilotToday(prisma, input.userId);
    const candidates = await releaseCandidates(input.userId, plan.id, today);
    const keys = capability.payload.kind === "RELEASE" ? capability.payload.itemKeys : [];
    const chosen = candidates.filter((candidate) => keys.includes(candidate.itemKey));
    if (!chosen.length) throw new PlannerError(422, "RELEASE_NOT_ALLOWED");
    const released = await releaseGeneratedItem(
      input.userId,
      plan.id,
      {
        schemaVersion: 1,
        expectedVersion: plan.version,
        requestKey: randomUUID(),
        itemKeys: chosen.map((candidate) => candidate.itemKey),
        reason: "OTHER",
      },
      today
    );
    plannerTelemetry("generated_item_release_requested", {
      mode: view.mode,
      released: released.released.length,
      candidacyCount: candidates.length,
      findings: released.findings.length,
    });
    return {
      outcome: "APPLIED",
      route: "RELEASE",
      request: null,
      view: await readIntake(input.userId, input.sessionId),
      findings: released.findings,
      summary: `${released.released.map((item) => `“${item.label}”`).join(", ")} is no longer your responsibility. Sylf will not put it back.`,
    };
  }

  if (capability.capability === "RESEARCH" || capability.capability === "COMPARISON") {
    // Routed, not executed: research and comparison own their bounded pipelines, their own
    // telemetry and their own review step, and the client drives them through the actions
    // that already exist.
    plannerTelemetry(
      capability.capability === "RESEARCH" ? "copilot_research_requested" : "copilot_explanation_requested",
      { mode: view.mode, intent: proposal.intent, researchRouted: 1 }
    );
    return {
      outcome: "ROUTED",
      route: capability.capability,
      request:
        capability.capability === "RESEARCH"
          ? { action: "researchScope" }
          : { action: "compareCurricula", ...(capability.payload.kind === "COMPARISON" && capability.payload.refresh ? { force: true } : {}) },
      view,
      findings: [],
      summary: proposal.summary,
    };
  }

  if (capability.capability === "REPLAN") {
    const plan = session.planId
      ? await prisma.plannerPlan.findFirst({
          where: { id: session.planId, userId: input.userId },
          select: { id: true, version: true, activeRevisionId: true },
        })
      : null;
    if (!plan?.activeRevisionId) throw new PlannerError(409, "REPLAN_UNAVAILABLE");
    const reason = capability.payload.kind === "REPLAN" ? capability.payload.reason : "GENERAL";
    plannerTelemetry("copilot_replan_requested", {
      mode: view.mode,
      intent: proposal.intent,
      replanRouted: 1,
      reasonCode:
        reason === "LESS_TIME"
          ? "AVAILABILITY_CHANGED"
          : reason === "DEADLINE"
            ? "DEADLINE_CHANGED"
            : reason === "PRIORITIES"
              ? "PRIORITY_CHANGED"
              : "USER_REQUESTED",
    });
    /**
     * The Phase 5 request, assembled here and executed there.
     *
     * Copilot does not generate the replan: Phase 5 owns that bounded pipeline, its
     * reality snapshot, its diff and its explicit confirmation. Returning the request body
     * is what keeps one replanner in the system, and it also keeps a single Copilot turn
     * from stacking the interpretation model on top of the replan model.
     */
    return {
      outcome: "ROUTED",
      route: "REPLAN",
      request: {
        schemaVersion: 1,
        requestKey: randomUUID(),
        expectedVersion: plan.version,
        baseRevisionId: plan.activeRevisionId,
        reasonCode:
          reason === "LESS_TIME"
            ? "AVAILABILITY_CHANGED"
            : reason === "DEADLINE"
              ? "DEADLINE_CHANGED"
              : reason === "PRIORITIES"
                ? "PRIORITY_CHANGED"
                : "USER_REQUESTED",
        inputChanges: [],
        scope: { milestoneKey: null },
      },
      view,
      findings: [],
      summary:
        "I can rebalance the remaining unstarted work. Completed, started and protected work will stay exactly as it is, and nothing changes until you approve the proposal.",
    };
  }

  // Draft edit: resolved here into the concrete item edits, then handed to the existing
  // edit endpoint by the client, which is where the Phase 3 acknowledgement exchange lives.
  const plan = session.planId
    ? await prisma.plannerPlan.findFirst({
        where: { id: session.planId, userId: input.userId },
        select: { id: true, latestDraftRevisionId: true, activeRevisionId: true, version: true },
      })
    : null;
  const revisionId = plan?.latestDraftRevisionId ?? plan?.activeRevisionId ?? null;
  if (!plan || !revisionId) throw new PlannerError(409, "COMMAND_NOT_ALLOWED_IN_STATE");
  const revision = await prisma.plannerRevision.findFirst({
    where: { id: revisionId, planId: plan.id },
    select: { outputSnapshot: true },
  });
  const snapshot = revision?.outputSnapshot as { topics?: { key: string; title: string }[]; items?: unknown[] } | null;
  const intents = capability.payload.kind === "DRAFT_EDIT" ? capability.payload.edits : [];
  const titleOf = new Map((snapshot?.topics ?? []).map((topic) => [topic.title.toLowerCase(), topic.key]));
  const itemEdits: { key: string; [k: string]: unknown }[] = [];
  for (const intent of intents) {
    const topicKey = titleOf.get(intent.label.toLowerCase());
    if (!topicKey) continue;
    const items = (snapshot?.items ?? []) as {
      key: string;
      topicKey: string;
      type: string;
      date: string;
      minutes: number;
      removed?: boolean;
    }[];
    const candidates = items.filter((item) => item.topicKey === topicKey && !item.removed);
    // One item per intent: the most substantial one, so "remove the revision session for
    // vectors" removes the revision session rather than the first thing that matched.
    const chosen = [...candidates].sort((a, b) => b.minutes - a.minutes)[0];
    if (!chosen) continue;
    if (intent.edit === "REMOVE") itemEdits.push({ key: chosen.key, removed: true });
    if (intent.edit === "SHORTEN" || intent.edit === "LENGTHEN")
      itemEdits.push({ key: chosen.key, minutes: intent.minutes ?? chosen.minutes });
    if (intent.edit === "MOVE_EARLIER" || intent.edit === "MOVE_LATER") {
      const shift = intent.days ?? 0;
      const moved = new Date(Date.parse(`${chosen.date}T00:00:00Z`) + shift * 86_400_000)
        .toISOString()
        .slice(0, 10);
      itemEdits.push({ key: chosen.key, date: moved });
    }
  }
  if (!itemEdits.length) throw new PlannerError(422, "UNKNOWN_REFERENCE");
  return {
    outcome: "ROUTED",
    route: "DRAFT_EDIT",
    request: {
      planId: plan.id,
      revisionId,
      expectedVersion: plan.version,
      edits: itemEdits,
      acknowledgements: body.acknowledgements ?? [],
    },
    view,
    findings: [],
    summary: "Preparing that edit for the draft. If it trades something away, you will see the warning before it saves.",
  };
}

export { appendEdit, mintProposal };
