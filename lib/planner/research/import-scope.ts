import "server-only";
import type { PlanBriefV1 } from "../intake/brief";
import { candidateFromImport } from "../import/service";
import type { ExtractionResult } from "./contracts";
import { RESEARCH_LIMITS, type ImportErrorCode, type ResearchMetrics, type ScopeCandidate } from "./contracts";
import { researchBriefDigest, respectStudentRemovals } from "./service";

/**
 * Import → candidate, for the two ways text arrives.
 *
 * Pasted text and extracted document text are the same thing to the student ("here is
 * my syllabus") but not to provenance: a paste has no file behind it, an upload does.
 * Both end as a candidate awaiting confirmation; neither touches the confirmed scope.
 *
 * The metrics are deliberately shaped like research metrics so one telemetry path can
 * report both, with `cacheHit` and `calls` at zero — nothing was searched for.
 */

export interface ImportOutcome {
  candidate: ScopeCandidate;
  metrics: ResearchMetrics;
  /** Set when nothing usable came out, so the caller can name the failure precisely. */
  failure: ImportErrorCode | null;
}

const metricsFor = (candidate: ScopeCandidate, latencyMs: number): ResearchMetrics => ({
  // An import costs nothing external: no search, no fetch, no model call — only the
  // local parse. Reporting zeros here is what keeps cost accounting honest.
  calls: 0,
  retries: 0,
  latencyMs,
  cacheHit: false,
  sourceCount: candidate.sources.length,
  officialSourceCount: 0,
  institutionalSourceCount: 0,
  secondarySourceCount: candidate.sources.length,
  candidateNodeCount: candidate.nodes.length,
  status: candidate.status,
  searchCalls: 0,
  searchResults: 0,
  // Nothing was retrieved, so the retrieval shape is zero rather than unknown.
  objectives: 0,
  queriesGenerated: 0,
  queriesWithResults: 0,
  queriesDeduplicated: 0,
  resultsReturned: 0,
  uniqueDomains: 0,
  crossConfirmed: 0,
  duplicatesRemoved: 0,
  fetchFailures: 0,
  depth: "STANDARD" as const,
  selectedSources: 0,
  evidenceAccepted: 0,
  evidenceRejected: 0,
  coverage: {
    totalObjectives: 0,
    covered: 0,
    partial: 0,
    unanswered: 0,
    conflicted: 0,
    highPriorityUnanswered: 0,
  },
  followUpUsed: false,
  followupQueries: 0,
  modelFailure: null,
  coverageBefore: {
    totalObjectives: 0,
    covered: 0,
    partial: 0,
    unanswered: 0,
    conflicted: 0,
    highPriorityUnanswered: 0,
  },
  sourceCandidates: 0,
  sourcesFetched: 0,
  httpRequests: 0,
  fetchBytes: 0,
  modelCalls: 0,
  modelPasses: 0,
  inputTokens: null,
  outputTokens: null,
});

/** Text the student pasted or typed. */
export function importPastedScope(input: {
  brief: PlanBriefV1;
  text: string;
  origin: "PASTE" | "DOCUMENT";
  sourceTitle: string | null;
}): ImportOutcome {
  const started = Date.now();
  const extraction: ExtractionResult = {
    text: input.text.slice(0, RESEARCH_LIMITS.pastedChars),
    pages: [{ from: 1, to: 1 }],
    // Pasted text is complete by definition — there is no document to have missed.
    partial: false,
    partialReason: null,
    method: "PASTE",
  };
  return finish(input.brief, extraction, input.origin === "DOCUMENT" ? input.sourceTitle : null, started);
}

/**
 * Text extracted from an uploaded document by the import route.
 *
 * Provenance is the file itself, which is why the source arrives as a title and is
 * typed `USER_UPLOAD`: it is the student's own material, never a public claim.
 */
export function importExtractedScope(input: {
  brief: PlanBriefV1;
  extraction: ExtractionResult;
  source: { url: string; title: string | null } | null;
}): ImportOutcome {
  const started = Date.now();
  return finish(input.brief, input.extraction, input.source?.title ?? null, started);
}

function finish(
  brief: PlanBriefV1,
  extraction: ExtractionResult,
  sourceTitle: string | null,
  started: number
): ImportOutcome {
  const candidate = respectStudentRemovals(candidateFromImport({
    extraction,
    origin: extraction.method === "PASTE" ? "PASTE" : "IMPORT",
    briefDigest: researchBriefDigest(brief),
    retrievedAt: new Date().toISOString(),
    // Pasted text has no retrievable source; a document has a file the student owns.
    source: extraction.method === "PASTE" ? null : { url: uploadUrn(), title: sourceTitle },
  }), brief.scope.removedLabels);
  return {
    candidate,
    metrics: metricsFor(candidate, Date.now() - started),
    failure: candidate.failureCode && candidate.status === "UNAVAILABLE" ? (candidate.failureCode as ImportErrorCode) : null,
  };
}

/**
 * A stable pseudo-URL for an uploaded file.
 *
 * `ResearchSource.url` is required and must be a real URL, so a private upload is given
 * one under a reserved scheme that can never be confused with a public page — and that
 * the UI renders as "your upload" with no link. Nothing fetches it, and it deliberately
 * cannot be resolved.
 */
const uploadUrn = (): string => `https://upload.sylf.local/syllabus`;
