import { z } from "zod";
// From the node module, never from the brief: the brief imports *this* file to carry a
// candidate, so importing the brief here would be a cycle — and a cycle in schema
// definitions fails at import time, not at parse time.
import { ScopeNodeSchema, type ScopeNode } from "../intake/scope-node";
// Type-only, and one-directional: `search/contracts.ts` imports nothing from here, so naming
// the depth tier in the metrics cannot close a cycle in the schema graph.
import type { ResearchDepth } from "./search/contracts";

/**
 * The research and import wire contract.
 *
 * Four rules shape every type here, and they are the whole reason this file exists
 * separately from the providers that implement it:
 *
 * 1. **A source is never invented.** Every `ResearchSource` originates in provider
 *    grounding metadata. If grounding returned no URL, there is no source — a model's
 *    prose about "the official syllabus" is not evidence, and nothing in this module
 *    can turn text into a URL.
 * 2. **A result is a candidate, never authority.** Nothing here writes to
 *    `brief.scope.nodes`; only `confirmScope` does that, after a person says so.
 * 3. **A result is bounded.** Sources, nodes, depths and bytes all have ceilings, so a
 *    hostile or merely enormous page cannot inflate an intake session.
 * 4. **A result knows when it is stale.** It carries the brief digest it was computed
 *    against, so a goal edited mid-research cannot have old findings applied to it.
 */

export const RESEARCH_STATUSES = ["OK", "WEAK", "UNAVAILABLE"] as const;
export const ResearchStatusSchema = z.enum(RESEARCH_STATUSES);
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const RESEARCH_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export const ResearchConfidenceSchema = z.enum(RESEARCH_CONFIDENCES);
export type ResearchConfidence = (typeof RESEARCH_CONFIDENCES)[number];

/**
 * How much a source can be trusted.
 *
 * `SECONDARY` is the default for anything unrecognised, on purpose: a preparation blog
 * with a plausible-looking topic list is still a preparation blog. Promotion to
 * `OFFICIAL*` requires the host to be recognised as authoritative (see `sources.ts`),
 * never the content to look right.
 */
/**
 * `INSTITUTIONAL` sits between official and secondary: a credible academic or
 * government publisher that is *not* the verified authority for this target. It exists
 * so a university page about someone else's exam can be described accurately instead of
 * being either promoted to official or dismissed as a blog.
 */
export const SOURCE_TYPES = ["OFFICIAL", "OFFICIAL_PDF", "INSTITUTIONAL", "SECONDARY", "USER_UPLOAD"] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = (typeof SOURCE_TYPES)[number];

export const IMPORT_ERROR_CODES = [
  "IMPORT_UNSUPPORTED",
  "IMPORT_TOO_LARGE",
  "IMPORT_FAILED",
  "IMPORT_PARTIAL",
  "IMPORT_EMPTY",
  "IMPORT_LIMIT_REACHED",
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/**
 * Research failures, each with a different next action for the student.
 *
 * The last three exist so the UI can tell "the search found nothing" apart from "the
 * pages would not open" and from "I read them but could not make a scope of them" —
 * three situations where a collapse into one message would leave the student without a
 * useful move.
 */
export const RESEARCH_ERROR_CODES = [
  "RESEARCH_UNAVAILABLE",
  "RESEARCH_WEAK",
  "RESEARCH_TIMEOUT",
  "RESEARCH_CANCELLED",
  "RESEARCH_STALE_BRIEF",
  "RESEARCH_NOT_APPLICABLE",
  "SEARCH_ZERO_RESULTS",
  "FETCH_FAILED",
  "RESEARCH_MODEL_BAD_OUTPUT",
] as const;
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];

export const RESEARCH_LIMITS = {
  /** Sources kept per result. Beyond this, the weakest are dropped, never truncated mid-record. */
  sources: 8,
  /** Candidate nodes kept. Matches the brief's own scope ceiling. */
  nodes: 200,
  /** Hierarchy depth a candidate may have, matching the brief. */
  depth: 3,
  /** Characters of provider findings retained. Context for the model, not a document store. */
  findingsChars: 12000,
  /** Sources one node may cite. */
  sourcesPerNode: 4,
  /** One provider attempt plus at most one justified retry. */
  providerAttempts: 2,
  /** Bound on a single grounded search. */
  timeoutMs: 20_000,
  /** Imported documents accepted per intake. */
  importsPerSession: 3,
  /** Characters of extracted text kept per import (the route carries this, not an action). */
  extractedChars: 60_000,
  /**
   * Characters of pasted text accepted through a typed action.
   *
   * Lower than `extractedChars` on purpose: an action body is bounded by the engine's
   * 32 KiB input envelope, and a student pasting 60,000 characters would otherwise hit
   * a payload error instead of a useful answer.
   */
  pastedChars: 24_000,
  /** Open questions shown to the student. */
  openQuestions: 5,
} as const;

/**
 * One public source, as it will be shown to the student.
 *
 * `publisherOrDomain` is derived from the URL host, never from model prose, so it can
 * be displayed as "who published this" without being a claim the model made up.
 */
export const ResearchSourceSchema = z.strictObject({
  sourceId: z.string().min(1).max(60),
  url: z.string().url().max(2048),
  /** Provider-supplied page title when there is one. */
  title: z.string().trim().max(300).nullable(),
  /** Host-derived publisher, e.g. "nust.edu.pk". */
  publisherOrDomain: z.string().trim().max(200).nullable(),
  sourceType: SourceTypeSchema,
  /** When Sylf retrieved it — never the document's own date, which is usually unknown. */
  retrievedAt: z.string().max(40),
  /** Only when the source states it explicitly (e.g. "Specification 2026"). */
  documentDate: z.string().trim().max(60).nullable(),
  /** Which candidate nodes this source supports, by node id. */
  nodeIds: z.array(z.string().max(60)).max(RESEARCH_LIMITS.nodes),
  /** How sure Sylf is that this source actually covers those nodes. */
  mappingConfidence: ResearchConfidenceSchema,
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

/**
 * One source, as it survives inside a *confirmed* scope.
 *
 * Confirming a scope clears the candidate it came from, so a source id kept on the
 * confirmed scope would dangle unless the record it names travels with it. This is that
 * record, and it is deliberately smaller than `ResearchSource`:
 *
 * - **No `nodeIds`.** The node→source mapping already lives on the nodes themselves
 *   (`ScopeNode.sourceIds`, at most four each). Carrying a second copy here — up to 200
 *   ids per source, eight sources — is the one field that could actually threaten the
 *   brief's 64 KiB ceiling, and it would be redundant with data already present.
 * - **No content.** No page text, no HTML, no PDF body, no snippet, no model prose. What
 *   is kept is what is needed to *resolve* a confirmed reference and to show the student
 *   where a scope came from: identity, address, title, publisher, type and when it was
 *   read. Provenance, not an archive.
 *
 * `sourceType` is copied verbatim rather than recomputed: a confirmed scope's evidence is
 * historical, and a later change to the authority registry must not rewrite it.
 */
export const ConfirmedScopeSourceSchema = z.strictObject({
  sourceId: z.string().min(1).max(60),
  /** Public page, or the student's own delivery reference for a USER_UPLOAD. */
  url: z.string().url().max(2048),
  title: z.string().trim().max(300).nullable(),
  publisherOrDomain: z.string().trim().max(200).nullable(),
  sourceType: SourceTypeSchema,
  retrievedAt: z.string().max(40),
  documentDate: z.string().trim().max(60).nullable(),
});
export type ConfirmedScopeSource = z.infer<typeof ConfirmedScopeSourceSchema>;

/** How many confirmed sources one scope may retain. The same bound as the refs. */
export const CONFIRMED_SOURCE_LIMIT = RESEARCH_LIMITS.sources;

/** A candidate hierarchy plus the provenance that justifies it. */
/**
 * Objective coverage, as it travels with a candidate.
 *
 * The `objectives` rows are what make "what is still uncertain?" answerable later without
 * recomputing anything: the question text is carried so a coverage summary can be rendered
 * without the research plan beside it.
 */
export const CandidateCoverageSchema = z.strictObject({
  summary: z.strictObject({
    totalObjectives: z.number().int().min(0),
    covered: z.number().int().min(0),
    partial: z.number().int().min(0),
    unanswered: z.number().int().min(0),
    conflicted: z.number().int().min(0),
    highPriorityUnanswered: z.number().int().min(0),
  }),
  objectives: z
    .array(
      z.strictObject({
        objectiveId: z.string().min(1).max(40),
        question: z.string().trim().max(240),
        priority: z.enum(["PRIMARY", "SUPPORTING"]),
        state: z.enum(["UNANSWERED", "PARTIAL", "COVERED", "CONFLICTED"]),
        claimCount: z.number().int().min(0),
        corroboratingSources: z.number().int().min(0),
        /** Whether a disagreement was recorded, and how it was resolved. */
        conflict: z.enum(["NONE", "OUTWEIGHED", "UNRESOLVED"]),
      })
    )
    .max(12),
  /** True when the one permitted follow-up round actually ran. */
  followUpUsed: z.boolean(),
});
export type CandidateCoverage = z.infer<typeof CandidateCoverageSchema>;

/**
 * The evidence behind a candidate: verified claims only, and a count of what was refused.
 *
 * Every claim here has passed server-side excerpt verification, which is why the excerpt is the
 * page's own text rather than the model's retyping of it.
 */
export const CandidateEvidenceSchema = z.strictObject({
  claims: z
    .array(
      z.strictObject({
        claimId: z.string().min(1).max(40),
        objectiveId: z.string().min(1).max(40),
        sourceId: z.string().min(1).max(60),
        statement: z.string().trim().max(200),
        excerpt: z.string().max(240),
        evidenceKind: z.enum(["DIRECT", "INDIRECT"]),
        support: z.enum(["SUPPORTS", "PARTIAL", "CONTRADICTS"]),
        documentDate: z.string().trim().max(60).nullable(),
      })
    )
    .max(32),
  /** How many proposed claims were dropped. A count, never the rejected text. */
  rejected: z.number().int().min(0),
});
export type CandidateEvidence = z.infer<typeof CandidateEvidenceSchema>;

export const ScopeCandidateSchema = z.strictObject({
  /** Bumped only if the candidate's shape changes; old sessions keep parsing. */
  version: z.literal(1),
  /** What produced it: a search, an upload, or the student's own paste. */
  origin: z.enum(["RESEARCH", "IMPORT", "PASTE"]),
  status: ResearchStatusSchema,
  confidence: ResearchConfidenceSchema,
  /**
   * The intake brief digest this candidate was computed against. Applying it to a
   * materially different brief is refused as `RESEARCH_STALE_BRIEF`.
   */
  briefDigest: z.string().min(8).max(64),
  retrievedAt: z.string().max(40),
  /** The provider that answered, for the record — e.g. "google-search-grounding". */
  provider: z.string().max(60),
  /**
   * The question this candidate answers, as a digest of the material inputs.
   *
   * Stored explicitly rather than inferred: it is what makes "same question, same
   * brief ⇒ reuse" checkable, and what stops a candidate being reused for a question
   * it was not asked.
   */
  cacheKey: z.string().max(64),
  /** Candidate nodes. Deliberately separate from `brief.scope.nodes`. */
  nodes: z.array(ScopeNodeSchema).max(RESEARCH_LIMITS.nodes),
  sources: z.array(ResearchSourceSchema).max(RESEARCH_LIMITS.sources),
  openQuestions: z.array(z.string().trim().max(300)).max(RESEARCH_LIMITS.openQuestions),
  /**
   * Why a candidate is unavailable, as a closed code.
   *
   * A stored failure is more useful than a thrown one: the student sees the reason and
   * the next actions in place, and the session keeps a record of what was attempted.
   */
  failureCode: z.enum([...RESEARCH_ERROR_CODES, ...IMPORT_ERROR_CODES]).nullable(),
  /** One sentence the UI can show as the honest summary of what happened. */
  summary: z.string().trim().max(400),
  /**
   * The depth that actually produced this candidate.
   *
   * Optional so candidates stored before Phase 2 keep parsing. It exists because reusing a
   * candidate is a claim about *how thorough* the answer is: a `STANDARD` result must not be
   * handed back to a request that explicitly asked for `DEEP` research, and without this field
   * the cache had no way to tell the two apart.
   */
  depth: z.enum(["LOOKUP", "STANDARD", "DEEP"]).optional(),
  /**
   * Which research questions were answered, and how completely.
   *
   * A bounded summary plus one row per objective — never the whole working ledger. This is what
   * lets a surface say "4 of 5 questions answered" and "entry requirements are still unclear"
   * without shipping the evidence itself into the plan brief.
   */
  coverage: CandidateCoverageSchema.optional(),
  /**
   * Verified evidence, bounded hard.
   *
   * Only claims whose excerpts the server found in pages it fetched, and only up to
   * `EVIDENCE_LIMITS.claims` of them. Raw page text is never stored: the excerpt is a verbatim
   * span, a sentence or two, not a document. The whole structure is sized so a worst-case
   * candidate still fits inside `BRIEF_LIMITS.briefBytes` beside its nodes.
   */
  evidence: CandidateEvidenceSchema.optional(),
});
export type ScopeCandidate = z.infer<typeof ScopeCandidateSchema>;

/** A provider's raw answer, before classification and candidate construction. */
export interface ResearchProviderClaim {
  /** A URL the provider's grounding metadata actually contained. */
  url: string;
  title: string | null;
}

export interface ResearchProviderResult {
  /** Provider synthesis, bounded. Context for extraction — never shown as a source. */
  findings: string;
  /** Real grounded sources. Empty means "no source", never "no sources needed". */
  sources: ResearchProviderClaim[];
  retrievedAt: string;
  provider: string;
  /** True when the provider answered from its own knowledge without grounding. */
  ungrounded: boolean;
  usage?: { inputTokens: number | null; outputTokens: number | null; calls: number; retries: number };
}

/** What an import produced, before it becomes a candidate. */
export interface ExtractionResult {
  /** Plain text as extracted, bounded. Kept for the student to inspect, not for the engine. */
  text: string;
  /** 1-based page ranges actually processed, so partial work can be admitted. */
  pages: { from: number; to: number }[];
  /** True when some of the document was not read (scanned pages, unsupported objects). */
  partial: boolean;
  /** Why it is partial, in one bounded phrase. Null when complete. */
  partialReason: string | null;
  /** How the text was obtained. */
  method: "TEXT" | "VISION" | "PASTE";
}

export const EXTRACTION_METHODS = ["TEXT", "VISION", "PASTE"] as const;

/**
 * Import failures, each with a different next action for the student.
 *
 * Collapsing these into "something went wrong" would leave a student with a scanned
 * PDF and no idea that photographing it is the fix.
 */
/** What the caller asked for. Bounded and content-free outside the goal it is about. */
export interface ResearchRequest {
  /** The brief as it stands, whose digest will be stamped into the candidate. */
  briefDigest: string;
  goal: string;
  subject: string | null;
  /** e.g. "CAIE" — from `lib/study-systems.ts`, used to discover official domains. */
  board: string | null;
  /** e.g. "A-Level". */
  level: string | null;
  mode: "EXAM" | "ROADMAP" | "MASTERY";
  signal?: AbortSignal;
}

/** Measured facts about one research operation, for the report and for telemetry counts. */
export interface ResearchMetrics {
  /** DeepSeek calls (plan + extract). */
  calls: number;
  retries: number;
  latencyMs: number;
  cacheHit: boolean;
  sourceCount: number;
  officialSourceCount: number;
  institutionalSourceCount: number;
  secondarySourceCount: number;
  candidateNodeCount: number;
  status: ResearchStatus;
  /** Search cost: API calls made and results returned, measured separately. */
  searchCalls: number;
  searchResults: number;
  /**
   * Retrieval shape, added in Phase 1 with adaptive planning.
   *
   * These are the counts that answer "why was this result thin?" — whether the planner asked
   * too few questions, the queries came back empty, or the pages would not load. Without them
   * a poor run is one opaque number, and the feature document's observability section asks for
   * exactly that distinction.
   */
  objectives: number;
  queriesGenerated: number;
  queriesWithResults: number;
  /** Queries dropped as equivalent to an earlier one before any provider call. */
  queriesDeduplicated: number;
  /** Raw results returned, before deduplication. `searchResults` is what survived it. */
  resultsReturned: number;
  uniqueDomains: number;
  crossConfirmed: number;
  duplicatesRemoved: number;
  fetchFailures: number;
  /**
   * The tier that produced the answer being returned.
   *
   * On a cache hit this is the depth of the *original* run, not of the current request. That
   * distinction is the whole point of recording it: a reused `STANDARD` answer must never
   * present itself as deep research that just happened.
   */
  depth: ResearchDepth;
  /** Pages the selection chose to attempt, as distinct from pages read. */
  selectedSources: number;
  /** Claims the evidence contract accepted after proving their excerpts. */
  evidenceAccepted: number;
  evidenceRejected: number;
  coverage: {
    totalObjectives: number;
    covered: number;
    partial: number;
    unanswered: number;
    conflicted: number;
    highPriorityUnanswered: number;
  };
  followUpUsed: boolean;
  followupQueries: number;
  /**
   * Which field of our own contract the model's answer failed on, when it failed to parse.
   *
   * A schema path and a Zod code — never page content, never the model's words. It exists because
   * "the model's output was unusable" is otherwise indistinguishable between a model that replied
   * with prose and a model whose nested array held one element where two were required.
   */
  modelFailure: string | null;
  /** Coverage before the follow-up round, so what the extra round bought is measurable. */
  coverageBefore: {
    totalObjectives: number;
    covered: number;
    partial: number;
    unanswered: number;
    conflicted: number;
    highPriorityUnanswered: number;
  };
  /** Fetch cost, as three distinct counts — a redirect is not another source. */
  sourceCandidates: number;
  sourcesFetched: number;
  httpRequests: number;
  fetchBytes: number;
  /** Model cost: calls, passes and tokens when the provider reports them. */
  modelCalls: number;
  modelPasses: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** A cache key is a digest of the material inputs, so identical questions reuse work. */
export interface ResearchCacheKeyInput {
  goal: string;
  subject: string | null;
  board: string | null;
  level: string | null;
  mode: string;
  kind: "RESEARCH";
}

export type { ScopeNode };
