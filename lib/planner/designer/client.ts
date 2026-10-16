"use client";
import { plannerChatBody } from "../copilot/image-client";
import { plannerFetch } from "../transport";
import type { IntakeView } from "../intake/actions";
import type {
  DesignerTurnResult,
  DesignerSummary,
  DesignerModeRecommendation,
  DesignerGuidance,
  DesignerQuestion,
} from "./contracts";

/**
 * The Plan Designer client: send a message, read typed state back.
 *
 * Written for the frontend Gemini is about to build, so it exposes *state* rather than prose.
 * Every field below is something a panel has to render, and none of it requires parsing a
 * sentence: `result.outcome` says what happened, `designer.summary` is the setup as the server
 * holds it, `designer.mode` is a mode suggestion with a switchable flag, `designer.guidance` is
 * the advisory list, and a proposal carries its own consequence sentences.
 *
 * ## Two assistants, one call site
 *
 * The Designer is the pre-generation half of the same assistant whose post-generation half is
 * the Copilot, and the eventual UI shows one thing called Sylf. The two endpoints stay separate
 * because their *lifecycles* are separate — this one is refused once a draft or a plan exists,
 * and the Copilot is the one that applies there — but a surface can pick between them with a
 * single predicate, `isDesignerLifecycle`.
 *
 * ## Applying a proposal
 *
 * There is no `applyDesignerProposal`. A Designer proposal is an ordinary signed proposal made
 * of ordinary commands, so it is confirmed through `applyCopilotProposal` from the Copilot
 * client: one apply path, one signature check, one atomic write. A second one would be a second
 * place for the version guard to be forgotten.
 *
 * ## The conversation
 *
 * Turns live here, in the tab, and travel with each request. There is no conversation store on
 * either side and this client must never imply one.
 */

export type DesignerRecentTurn = { role: "STUDENT" | "SYLF"; text: string };

export type DesignerTurnPayload = DesignerTurnResult & {
  designer: {
    summary: DesignerSummary;
    mode: DesignerModeRecommendation | null;
    guidance: DesignerGuidance[];
    unresolved: string[];
    /** Present whenever an essential is still missing, whatever the outcome was. */
    question: DesignerQuestion | null;
  };
  view: IntakeView;
  metrics: {
    modelPasses: number;
    inputChars: number;
    outputChars: number;
    latencyMs: number;
    commandCount: number;
  };
};

/**
 * Send one message to the Designer.
 *
 * `recent` is bounded by the schema on the server as well as here; slicing in both places is
 * deliberate, because a client that forgot would otherwise be sending a transcript the server
 * has to reject rather than one it can truncate.
 */
export const sendDesignerMessage = async (
  sessionId: string,
  input: {
    expectedVersion: number;
    message: string;
    images?: File[];
    recent: DesignerRecentTurn[];
    proposalOnly?: boolean;
    signal?: AbortSignal;
  }
): Promise<DesignerTurnPayload> =>
  plannerFetch<DesignerTurnPayload>(`/intake/${encodeURIComponent(sessionId)}/designer`, {
    signal: input.signal,
    ...plannerChatBody({
      schemaVersion: 1,
      expectedVersion: input.expectedVersion,
      message: input.message,
      recent: input.recent.slice(-8).map(({ role, text }) => ({ role, text })),
      ...(input.proposalOnly ? { proposalOnly: true } : {}),
    }, input.images),
  });

/**
 * Which assistant owns the conversation right now.
 *
 * The Designer is pre-generation only: once a draft exists the Copilot's vocabulary (draft
 * edits, replan, release) is the one that applies, and once a plan is confirmed the structure
 * changes only through a replan. A surface that asked the wrong one would offer changes the
 * intake refuses, so the rule lives here as a function rather than as a sentence in a comment.
 */
export function isDesignerLifecycle(view: IntakeView): boolean {
  return view.planId === null;
}

/**
 * The chips a surface may offer, per lifecycle.
 *
 * Server capability decides what is *possible*; these are only what is *worth suggesting*, and
 * every one of them is a message the Designer has a real answer to.
 */
export const DESIGNER_SUGGESTIONS = [
  "I have my exam in May",
  "I can study about 8 hours a week",
  "I did IGCSE Maths last year",
  "I'm weak at mechanics",
  "Which planner should I use?",
  "Do I need to enter every topic?",
] as const;

export type { DesignerTurnResult, DesignerSummary, DesignerModeRecommendation, DesignerGuidance, DesignerQuestion };
