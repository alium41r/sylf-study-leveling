/**
 * The finding envelope: validation that reports instead of refusing.
 *
 * The planner's validators were written to throw on the first breach, which is the
 * right default for a machine and the wrong one for a student who may deliberately
 * want something imperfect. This module defines the two classes and the
 * acknowledgement contract. Everything hard stays hard: nothing here can turn an
 * invariant into a choice.
 *
 * The distinction is not a matter of taste. A **blocker** is a condition no consent
 * can make true (a Quest you do not own, a revision that moved, a date outside the
 * horizon, a session limit the student themselves set). A **warning** is a
 * tradeoff: a real, explainable consequence the student is entitled to accept.
 *
 * UX Phase 3 gave the *educational* warnings an audited home of their own
 * (`lib/planner/draft-rules.ts`), one class per code; this module reads that table so
 * the severity a student sees and the severity the server enforces are the same fact.
 */

import { acknowledgementFor, isRecommendation } from "../draft-rules";

export const FINDING_SEVERITIES = ["BLOCKER", "WARNING"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_SCOPES = ["PLAN", "DRAFT", "ITEM", "UNIT", "PERIOD", "INTAKE"] as const;
export type FindingScope = (typeof FINDING_SCOPES)[number];

/**
 * Codes this module itself knows are advisory.
 *
 * The severity of a finding is no longer decided by this list alone: UX Phase 3 gave
 * the planner a second, audited source of truth for the *educational* codes
 * (`lib/planner/draft-rules.ts`), where each code is classified as a structural
 * blocker or a recommendation a student may decline while editing their own draft.
 * `finding()` consults both, so a code can never be a warning in one place and a
 * blocker in another. Everything hard is absent from both lists.
 */
export const ADVISORY_FINDING_CODES = [
  // A1 soft-preference breaches already carry weight and an explanation.
  "SOFT_PREFERENCE_UNHONORED",
  // Deterministic semantic advisories and the cognitive-rhythm advisory.
  "TASK_VAGUE",
  "DENSITY_SPIKE",
  "REDUNDANT_TOUCH",
  "SEQ_WEAK",
  "PRIORITY_MISS",
  "ROBOTIC_PATTERN",
  "INTENSITY_SPIKE",
  // Feasibility families the planner already reports without refusing.
  "FEASIBILITY_REDUCED_RESERVE",
  "FEASIBILITY_OVERLOADED_AVAILABILITY",
  "FEASIBILITY_SEGMENT_REQUIRED",
  // Scheduling softness: a rest day is a fact, not a prohibition.
  "SCHEDULED_ON_REST_DAY",
] as const;
export type AdvisoryFindingCode = (typeof ADVISORY_FINDING_CODES)[number];

const ADVISORY = new Set<string>(ADVISORY_FINDING_CODES);

export interface PlannerFinding {
  code: string;
  severity: FindingSeverity;
  scope: { kind: FindingScope; ref?: string };
  /** One sentence the UI can show as the consequence of accepting. */
  consequence: string;
  /** The value the client sends back to accept this exact finding. */
  acknowledgementCode: string;
}

/** Build a warning finding, or a blocker when the code is not acknowledgeable. */
export function finding(
  code: string,
  scope: PlannerFinding["scope"],
  consequence: string
): PlannerFinding {
  const severity: FindingSeverity =
    ADVISORY.has(code) || isRecommendation(code) ? "WARNING" : "BLOCKER";
  return {
    code,
    severity,
    scope,
    consequence,
    acknowledgementCode:
      severity === "WARNING" ? acknowledgementFor(code) : `BLOCK:${code}`,
  };
}

export const isBlocker = (entry: PlannerFinding): boolean => entry.severity === "BLOCKER";
export const warningsOf = (findings: readonly PlannerFinding[]): PlannerFinding[] =>
  findings.filter((entry) => entry.severity === "WARNING");
export const blockersOf = (findings: readonly PlannerFinding[]): PlannerFinding[] =>
  findings.filter(isBlocker);

/**
 * Turn a set of raw rule results into the response shape.
 *
 * A response carries both lists so the client can show the warnings it may accept
 * *and* explain the blockers it may not — rather than receiving one opaque error.
 */
export function findingEnvelope(findings: readonly PlannerFinding[]): {
  ok: boolean;
  findings: PlannerFinding[];
  warnings: PlannerFinding[];
  blockers: PlannerFinding[];
  accepted: string[];
} {
  const warnings = warningsOf(findings);
  const blockers = blockersOf(findings);
  return { ok: blockers.length === 0, findings: [...findings], warnings, blockers, accepted: [] };
}

/**
 * Validate an acknowledgement list against the warnings actually raised.
 *
 * Verification is by code *and* by shape: an acknowledgement for a warning that was
 * not raised — or for a blocker — is rejected, so a client cannot pre-accept
 * something it has not been shown, and a stale acknowledgement from a previous
 * draft version is refused rather than replayed.
 */
export function verifyAcknowledgements(
  raised: readonly PlannerFinding[],
  acknowledged: readonly string[]
): { accepted: string[]; unknown: string[]; blocked: string[] } {
  const warningCodes = new Map(
    warningsOf(raised).map((entry) => [entry.acknowledgementCode, entry])
  );
  const blockerCodes = new Set(blockersOf(raised).map((entry) => entry.acknowledgementCode));
  const accepted: string[] = [];
  const unknown: string[] = [];
  const blocked: string[] = [];
  for (const code of acknowledged) {
    if (blockerCodes.has(code)) {
      blocked.push(code);
      continue;
    }
    if (warningCodes.has(code)) {
      accepted.push(code);
      continue;
    }
    unknown.push(code);
  }
  return { accepted, unknown, blocked };
}

/** A stable, human-readable consequence for the codes this phase can raise. */
export const ADVISORY_CONSEQUENCE: Record<AdvisoryFindingCode, string> = {
  SOFT_PREFERENCE_UNHONORED:
    "This plan departs from a scheduling preference you set. It stays feasible, but it may feel less comfortable to follow.",
  TASK_VAGUE: "Some tasks do not say precisely what to do, so they may be harder to start.",
  DENSITY_SPIKE: "One date carries far more work than the rest of the plan.",
  REDUNDANT_TOUCH: "Two items serve the same purpose on the same date.",
  SEQ_WEAK: "The order of some work is not ideal for learning, though it remains doable.",
  PRIORITY_MISS: "A topic you marked as higher priority receives less attention than usual.",
  ROBOTIC_PATTERN: "Some items read as a repeated template rather than tailored work.",
  INTENSITY_SPIKE: "One date stacks several demanding items, which may be tiring even though the minutes fit.",
  FEASIBILITY_REDUCED_RESERVE:
    "The recovery reserve is below the usual level, leaving less slack between sessions.",
  FEASIBILITY_OVERLOADED_AVAILABILITY:
    "Your stated availability is tight for this scope, so the plan uses most of the time you have.",
  FEASIBILITY_SEGMENT_REQUIRED:
    "The scope is larger than one plan can hold, so it is planned in segments.",
  SCHEDULED_ON_REST_DAY:
    "Some work falls on a rest day you normally keep free. It stays scheduled there unless you change it.",
};
