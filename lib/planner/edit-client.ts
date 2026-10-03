"use client";
import { PlannerClientError, plannerFetch, postJson } from "./transport";

/**
 * Saving an edit to a draft, with the flexible-editing contract.
 *
 * A generated plan is the planner's suggestion; an edited plan is the student's. The
 * server enforces that by running the ordinary validators and reporting which of their
 * *recommendations* the edit trades away — depth, spacing, a review, a mock — so the
 * student can accept one deliberately instead of being told they may not make the
 * change at all. This module is the one client that speaks that exchange, so all three
 * modes behave identically and none of them can forget to ask.
 *
 * The three rules the server holds are worth restating here, because they are what make
 * the acceptance safe:
 *
 * - an acknowledgement is bound to *this* edit: it is re-derived from the draft being
 *   saved, so a stale answer for a change that no longer exists is refused;
 * - a structural refusal (an impossible date, a duration outside the engine's bounds, a
 *   session limit the student set) cannot be acknowledged at all — the server rejects
 *   the attempt rather than ignoring it;
 * - nothing is remembered: the acceptance lives in this one operation and never becomes
 *   a preference.
 */

/** One finding, exactly as the server raises it. */
export interface DraftEditFinding {
  code: string;
  severity: "BLOCKER" | "WARNING";
  scope: { kind: string; ref?: string };
  consequence: string;
  /** The value to send back to accept this exact finding. */
  acknowledgementCode: string;
}

export interface DraftEditFindings {
  findings: DraftEditFinding[];
  warnings: DraftEditFinding[];
  blockers: DraftEditFinding[];
  accepted: string[];
  baseRevisionId?: string;
}

export type DraftEditOutcome =
  | { sealed: true; revision: unknown }
  | { sealed: false; findings: DraftEditFindings };

const isFindings = (value: unknown): value is DraftEditFindings => {
  const candidate = value as Partial<DraftEditFindings> | null;
  return Boolean(
    candidate &&
      Array.isArray(candidate.findings) &&
      Array.isArray(candidate.warnings) &&
      Array.isArray(candidate.blockers)
  );
};

/**
 * Post one edit.
 *
 * `acknowledgements` is always sent — an empty array means "assess this, and tell me
 * what I would be accepting" — because that is what switches the server from the legacy
 * "must be a complete plan" path to the assessing one. A refusal for a reason other
 * than findings (a stale base, a moved plan version, an item lock) is thrown as it
 * always was: those are the hard cases, and they are not a conversation.
 */
export async function submitDraftEdit(
  planId: string,
  body: Record<string, unknown>,
  acknowledgements: string[] = [],
  /**
   * The transport to post through.
   *
   * Injected rather than imported by this module so each mode keeps using *its* client
   * (`exam-client`, `roadmap-client`, `mastery-client`) — which is what the mode suites
   * mock, and what makes the error types mode-specific. It defaults to the shared
   * transport, so a caller that has no reason to care can ignore it.
   */
  options: { fetchImpl?: typeof plannerFetch } = {}
): Promise<DraftEditOutcome> {
  const post = options.fetchImpl ?? plannerFetch;
  try {
    const revision = await post<unknown>(`/${planId}/revisions`, {
      ...postJson({ ...body, acknowledgements }),
    });
    return { sealed: true, revision };
  } catch (error) {
    if (
      error instanceof PlannerClientError &&
      error.code === "DRAFT_WARNINGS_REQUIRE_ACCEPTANCE" &&
      isFindings(error.findings)
    )
      return { sealed: false, findings: error.findings };
    throw error;
  }
}

/** The acknowledgements that accept exactly the warnings that need accepting. */
export const acknowledgementsFor = (findings: DraftEditFindings): string[] =>
  findings.warnings
    .filter((warning) => !findings.accepted.includes(warning.acknowledgementCode))
    .map((warning) => warning.acknowledgementCode);
