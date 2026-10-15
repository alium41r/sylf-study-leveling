"use client";
import { plannerFetch, postJson } from "../transport";
import type { IntakeView } from "../intake/actions";
import type { CopilotTurnResult } from "./contracts";

/**
 * The Copilot client: send a message, confirm a proposal, nothing else.
 *
 * The recent turns are held here, in the tab, and sent with each request — there is no
 * conversation store on either side. The server truncates them, uses them as labelled
 * context, and forgets them; the planner's state is what actually answers.
 */

export type CopilotTurnPayload = CopilotTurnResult & {
  view: IntakeView;
  metrics: {
    modelPasses: number;
    inputChars: number;
    outputChars: number;
    latencyMs: number;
    commandCount: number;
  };
};

export type CopilotRecentTurn = { role: "STUDENT" | "SYLF"; text: string };

export const sendCopilotMessage = async (
  sessionId: string,
  input: {
    expectedVersion: number;
    message: string;
    recent: CopilotRecentTurn[];
    clarificationAnswer?: string | null;
    proposalOnly?: boolean;
    signal?: AbortSignal;
  }
): Promise<CopilotTurnPayload> =>
  plannerFetch<CopilotTurnPayload>(`/intake/${encodeURIComponent(sessionId)}/copilot`, {
    signal: input.signal,
    ...postJson({
      schemaVersion: 1,
      expectedVersion: input.expectedVersion,
      message: input.message,
      recent: input.recent.slice(-8),
      ...(input.proposalOnly ? { proposalOnly: true } : {}),
      ...(input.clarificationAnswer ? { clarificationAnswer: input.clarificationAnswer } : {}),
    }),
  });

export interface CopilotApplyPayload {
  outcome: "APPLIED" | "ROUTED" | "REFRESHED";
  route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE" | null;
  request: unknown | null;
  view: IntakeView;
  findings: unknown[];
  summary: string;
}

export const applyCopilotProposal = async (
  sessionId: string,
  input: { expectedVersion: number; token: string; acknowledgements?: string[] }
): Promise<CopilotApplyPayload> =>
  plannerFetch<CopilotApplyPayload>(`/intake/${encodeURIComponent(sessionId)}/copilot/apply`, {
    ...postJson({
      schemaVersion: 1,
      expectedVersion: input.expectedVersion,
      token: input.token,
      ...(input.acknowledgements?.length ? { acknowledgements: input.acknowledgements } : {}),
    }),
  });

export type { CopilotTurnResult };
