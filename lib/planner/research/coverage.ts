import "server-only";
import type { ResearchObjective } from "./search/contracts";
import type { EvidenceLedger, VerifiedEvidenceClaim } from "./evidence";
import { sourceTypeIsOfficial } from "./sources";
import type { ResearchSource } from "./contracts";

/**
 * Objective coverage: which of the questions the planner asked itself were actually answered.
 *
 * Phase 1 could report how much was *found*. It could not report whether what was found was an
 * answer, which is why a search could return thirty-nine candidates, read three pages, and still
 * leave "what are the entry requirements?" untouched without anyone noticing. Coverage is the
 * missing half: it compares each objective against verified evidence and states, per objective,
 * whether the run settled it.
 *
 * **The model does not get a vote.** The extraction contract has no coverage field at all, which
 * is a stronger guarantee than "advisory": a model that cannot express "o3 is covered" cannot
 * have its claim believed, and there is no field for later code to start trusting. Coverage is
 * computed here, from claims whose excerpts the server has already found in pages it fetched.
 *
 * The states are ordered by how much the student can rely on them, which is what the cache, the
 * follow-up decision and the UI copy all read.
 */

export const COVERAGE_STATES = ["UNANSWERED", "PARTIAL", "COVERED", "CONFLICTED"] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export interface ObjectiveCoverage {
  objectiveId: string;
  /** The question, so a coverage summary can be read without the plan beside it. */
  question: string;
  priority: "PRIMARY" | "SUPPORTING";
  state: CoverageState;
  /** Verified claims about this objective. */
  claimCount: number;
  /** How many distinct sources support it, which is real corroboration rather than re-discovery. */
  corroboratingSources: number;
  /**
   * Set when the objective is disputed, naming how it was resolved.
   *
   * `OUTWEIGHED` means credible evidence contradicted the answer but strictly weaker authority
   * supported it, so the answer stands and the disagreement is recorded; `UNRESOLVED` means the
   * disagreement is between comparable authorities and the state is CONFLICTED.
   */
  conflict: "NONE" | "OUTWEIGHED" | "UNRESOLVED";
}

export interface CoverageSummary {
  totalObjectives: number;
  covered: number;
  partial: number;
  unanswered: number;
  conflicted: number;
  /** Primary objectives with no answer. The follow-up round exists for these. */
  highPriorityUnanswered: number;
}

/**
 * How much a source is worth when deciding whether an objective is settled.
 *
 * This is authority, and only authority — it says nothing about relevance, which is a separate
 * axis used by selection. A page can be perfectly on-topic and still not be the body that decides
 * what a syllabus contains.
 */
function authorityRank(sourceId: string, byId: ReadonlyMap<string, ResearchSource>): number {
  const source = byId.get(sourceId);
  if (!source) return 0;
  if (sourceTypeIsOfficial(source.sourceType)) return 3;
  if (source.sourceType === "INSTITUTIONAL") return 2;
  if (source.sourceType === "SECONDARY") return 1;
  return 0;
}

/**
 * Derive one objective's state from the evidence behind it.
 *
 * The thresholds are deliberately conservative and stated here rather than tuned silently:
 *
 * - nothing verified → `UNANSWERED`. Not "we found pages", not "the model was confident": no
 *   verified evidence is no answer.
 * - only indirect evidence, or support from a single non-authoritative source → `PARTIAL`. It is
 *   worth showing and not worth relying on.
 * - direct support, and either the target's own authority or two independent sources agree →
 *   `COVERED`. One secondary blog saying a syllabus covers calculus is not a settled scope.
 * - credible disagreement → `CONFLICTED`, unless the disagreement is decisively outweighed.
 *
 * The conflict rule is the one worth spelling out, because "sources disagree" is not by itself
 * fatal. Where the contradicting evidence comes from strictly weaker authority than the
 * supporting evidence — an old secondary guide against the current official specification — the
 * answer stands as `COVERED` and the disagreement is retained and labelled `OUTWEIGHED`. Where
 * two comparable authorities disagree, no answer is asserted: the state is `CONFLICTED`, and the
 * student is told which objectives are disputed rather than shown one side.
 */
export function deriveCoverageState(input: {
  claims: readonly VerifiedEvidenceClaim[];
  sources: ReadonlyMap<string, ResearchSource>;
  /** Target year/version the request named, when it named one. */
  targetYear?: number | null;
}): { state: CoverageState; corroboratingSources: number; conflict: ObjectiveCoverage["conflict"] } {
  const claims = input.claims;
  if (!claims.length) return { state: "UNANSWERED", corroboratingSources: 0, conflict: "NONE" };

  const supporting = claims.filter((claim) => claim.support !== "CONTRADICTS");
  const contradicting = claims.filter((claim) => claim.support === "CONTRADICTS");
  const sourcesOf = (list: readonly VerifiedEvidenceClaim[]) => new Set(list.map((claim) => claim.sourceId));
  const supportingSources = sourcesOf(supporting);
  const contradictingSources = sourcesOf(contradicting);

  let conflict: ObjectiveCoverage["conflict"] = "NONE";
  if (contradictingSources.size && supportingSources.size) {
    /**
     * Only a *different document* can dispute an answer.
     *
     * A page that contradicts itself is a page that is unclear, not a controversy, and two
     * claims extracted from one source cannot disagree with each other in any way a student
     * needs to be warned about. So the conflict test asks whether some source that does not
     * support the answer contradicts it.
     */
    const disputed = [...contradictingSources].some((id) => !supportingSources.has(id));
    if (disputed) {
      const best = (ids: ReadonlySet<string>) => Math.max(...[...ids].map((id) => authorityRank(id, input.sources)), 0);
      const supportAuthority = best(supportingSources);
      const contradictAuthority = best(contradictingSources);
      // Equal or stronger authority means the question is genuinely open; strictly weaker means
      // the answer stands and the disagreement is recorded as outweighed.
      conflict = contradictAuthority >= supportAuthority ? "UNRESOLVED" : "OUTWEIGHED";
    }
  }

  if (conflict === "UNRESOLVED") {
    return { state: "CONFLICTED", corroboratingSources: supportingSources.size, conflict };
  }

  const directSupport = supporting.filter((claim) => claim.evidenceKind === "DIRECT");
  const officialSupport = [...supportingSources].some((id) => authorityRank(id, input.sources) >= 3);
  const settled = directSupport.length > 0 && (officialSupport || supportingSources.size >= 2);

  return {
    state: settled ? "COVERED" : "PARTIAL",
    corroboratingSources: supportingSources.size,
    conflict,
  };
}

/** Coverage for every objective the plan stated, in plan order. */
export function computeCoverage(input: {
  objectives: readonly ResearchObjective[];
  ledger: EvidenceLedger;
  sources: readonly ResearchSource[];
  targetYear?: number | null;
}): ObjectiveCoverage[] {
  const byId = new Map(input.sources.map((source) => [source.sourceId, source]));
  return input.objectives.map((objective) => {
    const claims = input.ledger.claims.filter((claim) => claim.objectiveId === objective.id);
    const derived = deriveCoverageState({ claims, sources: byId, targetYear: input.targetYear });
    return {
      objectiveId: objective.id,
      question: objective.question,
      priority: objective.priority,
      state: derived.state,
      claimCount: claims.length,
      corroboratingSources: derived.corroboratingSources,
      conflict: derived.conflict,
    };
  });
}

export function summariseCoverage(coverage: readonly ObjectiveCoverage[]): CoverageSummary {
  return {
    totalObjectives: coverage.length,
    covered: coverage.filter((entry) => entry.state === "COVERED").length,
    partial: coverage.filter((entry) => entry.state === "PARTIAL").length,
    unanswered: coverage.filter((entry) => entry.state === "UNANSWERED").length,
    conflicted: coverage.filter((entry) => entry.state === "CONFLICTED").length,
    highPriorityUnanswered: coverage.filter((entry) => entry.priority === "PRIMARY" && entry.state !== "COVERED")
      .length,
  };
}

/**
 * The objectives a follow-up round should chase.
 *
 * Priority decides, and it is the reason `priority` exists on an objective at all. A run that
 * spent its one extra round on a supporting detail while the primary syllabus question sat
 * unanswered would have spent its budget on the wrong thing — so the rule is: any unanswered
 * PRIMARY objective first, and only then supporting ones, and never an objective that is merely
 * `PARTIAL` while something is `UNANSWERED`.
 */
export function followUpTargets(coverage: readonly ObjectiveCoverage[]): ObjectiveCoverage[] {
  const open = coverage.filter((entry) => entry.state !== "COVERED");
  const primary = open.filter((entry) => entry.priority === "PRIMARY");
  if (primary.length) return primary;
  return open;
}
