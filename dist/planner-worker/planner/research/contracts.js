"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTION_METHODS = exports.ScopeCandidateSchema = exports.CandidateEvidenceSchema = exports.CandidateCoverageSchema = exports.CONFIRMED_SOURCE_LIMIT = exports.ConfirmedScopeSourceSchema = exports.ResearchSourceSchema = exports.RESEARCH_LIMITS = exports.RESEARCH_ERROR_CODES = exports.IMPORT_ERROR_CODES = exports.SourceTypeSchema = exports.SOURCE_TYPES = exports.ResearchConfidenceSchema = exports.RESEARCH_CONFIDENCES = exports.ResearchStatusSchema = exports.RESEARCH_STATUSES = void 0;
const zod_1 = require("zod");
// From the node module, never from the brief: the brief imports *this* file to carry a
// candidate, so importing the brief here would be a cycle — and a cycle in schema
// definitions fails at import time, not at parse time.
const scope_node_1 = require("../intake/scope-node");
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
exports.RESEARCH_STATUSES = ["OK", "WEAK", "UNAVAILABLE"];
exports.ResearchStatusSchema = zod_1.z.enum(exports.RESEARCH_STATUSES);
exports.RESEARCH_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"];
exports.ResearchConfidenceSchema = zod_1.z.enum(exports.RESEARCH_CONFIDENCES);
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
exports.SOURCE_TYPES = ["OFFICIAL", "OFFICIAL_PDF", "INSTITUTIONAL", "SECONDARY", "USER_UPLOAD"];
exports.SourceTypeSchema = zod_1.z.enum(exports.SOURCE_TYPES);
exports.IMPORT_ERROR_CODES = [
    "IMPORT_UNSUPPORTED",
    "IMPORT_TOO_LARGE",
    "IMPORT_FAILED",
    "IMPORT_PARTIAL",
    "IMPORT_EMPTY",
    "IMPORT_LIMIT_REACHED",
];
/**
 * Research failures, each with a different next action for the student.
 *
 * The last three exist so the UI can tell "the search found nothing" apart from "the
 * pages would not open" and from "I read them but could not make a scope of them" —
 * three situations where a collapse into one message would leave the student without a
 * useful move.
 */
exports.RESEARCH_ERROR_CODES = [
    "RESEARCH_UNAVAILABLE",
    "RESEARCH_WEAK",
    "RESEARCH_TIMEOUT",
    "RESEARCH_CANCELLED",
    "RESEARCH_STALE_BRIEF",
    "RESEARCH_NOT_APPLICABLE",
    "SEARCH_ZERO_RESULTS",
    "FETCH_FAILED",
    "RESEARCH_MODEL_BAD_OUTPUT",
];
exports.RESEARCH_LIMITS = {
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
};
/**
 * One public source, as it will be shown to the student.
 *
 * `publisherOrDomain` is derived from the URL host, never from model prose, so it can
 * be displayed as "who published this" without being a claim the model made up.
 */
exports.ResearchSourceSchema = zod_1.z.strictObject({
    sourceId: zod_1.z.string().min(1).max(60),
    url: zod_1.z.string().url().max(2048),
    /** Provider-supplied page title when there is one. */
    title: zod_1.z.string().trim().max(300).nullable(),
    /** Host-derived publisher, e.g. "nust.edu.pk". */
    publisherOrDomain: zod_1.z.string().trim().max(200).nullable(),
    sourceType: exports.SourceTypeSchema,
    /** When Sylf retrieved it — never the document's own date, which is usually unknown. */
    retrievedAt: zod_1.z.string().max(40),
    /** Only when the source states it explicitly (e.g. "Specification 2026"). */
    documentDate: zod_1.z.string().trim().max(60).nullable(),
    /** Which candidate nodes this source supports, by node id. */
    nodeIds: zod_1.z.array(zod_1.z.string().max(60)).max(exports.RESEARCH_LIMITS.nodes),
    /** How sure Sylf is that this source actually covers those nodes. */
    mappingConfidence: exports.ResearchConfidenceSchema,
});
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
exports.ConfirmedScopeSourceSchema = zod_1.z.strictObject({
    sourceId: zod_1.z.string().min(1).max(60),
    /** Public page, or the student's own delivery reference for a USER_UPLOAD. */
    url: zod_1.z.string().url().max(2048),
    title: zod_1.z.string().trim().max(300).nullable(),
    publisherOrDomain: zod_1.z.string().trim().max(200).nullable(),
    sourceType: exports.SourceTypeSchema,
    retrievedAt: zod_1.z.string().max(40),
    documentDate: zod_1.z.string().trim().max(60).nullable(),
});
/** How many confirmed sources one scope may retain. The same bound as the refs. */
exports.CONFIRMED_SOURCE_LIMIT = exports.RESEARCH_LIMITS.sources;
/** A candidate hierarchy plus the provenance that justifies it. */
/**
 * Objective coverage, as it travels with a candidate.
 *
 * The `objectives` rows are what make "what is still uncertain?" answerable later without
 * recomputing anything: the question text is carried so a coverage summary can be rendered
 * without the research plan beside it.
 */
exports.CandidateCoverageSchema = zod_1.z.strictObject({
    summary: zod_1.z.strictObject({
        totalObjectives: zod_1.z.number().int().min(0),
        covered: zod_1.z.number().int().min(0),
        partial: zod_1.z.number().int().min(0),
        unanswered: zod_1.z.number().int().min(0),
        conflicted: zod_1.z.number().int().min(0),
        highPriorityUnanswered: zod_1.z.number().int().min(0),
    }),
    objectives: zod_1.z
        .array(zod_1.z.strictObject({
        objectiveId: zod_1.z.string().min(1).max(40),
        question: zod_1.z.string().trim().max(240),
        priority: zod_1.z.enum(["PRIMARY", "SUPPORTING"]),
        state: zod_1.z.enum(["UNANSWERED", "PARTIAL", "COVERED", "CONFLICTED"]),
        claimCount: zod_1.z.number().int().min(0),
        corroboratingSources: zod_1.z.number().int().min(0),
        /** Whether a disagreement was recorded, and how it was resolved. */
        conflict: zod_1.z.enum(["NONE", "OUTWEIGHED", "UNRESOLVED"]),
    }))
        .max(12),
    /** True when the one permitted follow-up round actually ran. */
    followUpUsed: zod_1.z.boolean(),
});
/**
 * The evidence behind a candidate: verified claims only, and a count of what was refused.
 *
 * Every claim here has passed server-side excerpt verification, which is why the excerpt is the
 * page's own text rather than the model's retyping of it.
 */
exports.CandidateEvidenceSchema = zod_1.z.strictObject({
    claims: zod_1.z
        .array(zod_1.z.strictObject({
        claimId: zod_1.z.string().min(1).max(40),
        objectiveId: zod_1.z.string().min(1).max(40),
        sourceId: zod_1.z.string().min(1).max(60),
        statement: zod_1.z.string().trim().max(200),
        excerpt: zod_1.z.string().max(240),
        evidenceKind: zod_1.z.enum(["DIRECT", "INDIRECT"]),
        support: zod_1.z.enum(["SUPPORTS", "PARTIAL", "CONTRADICTS"]),
        documentDate: zod_1.z.string().trim().max(60).nullable(),
    }))
        .max(32),
    /** How many proposed claims were dropped. A count, never the rejected text. */
    rejected: zod_1.z.number().int().min(0),
});
exports.ScopeCandidateSchema = zod_1.z.strictObject({
    /** Bumped only if the candidate's shape changes; old sessions keep parsing. */
    version: zod_1.z.literal(1),
    /** What produced it: a search, an upload, or the student's own paste. */
    origin: zod_1.z.enum(["RESEARCH", "IMPORT", "PASTE"]),
    status: exports.ResearchStatusSchema,
    confidence: exports.ResearchConfidenceSchema,
    /**
     * The intake brief digest this candidate was computed against. Applying it to a
     * materially different brief is refused as `RESEARCH_STALE_BRIEF`.
     */
    briefDigest: zod_1.z.string().min(8).max(64),
    retrievedAt: zod_1.z.string().max(40),
    /** The provider that answered, for the record — e.g. "google-search-grounding". */
    provider: zod_1.z.string().max(60),
    /**
     * The question this candidate answers, as a digest of the material inputs.
     *
     * Stored explicitly rather than inferred: it is what makes "same question, same
     * brief ⇒ reuse" checkable, and what stops a candidate being reused for a question
     * it was not asked.
     */
    cacheKey: zod_1.z.string().max(64),
    /** Candidate nodes. Deliberately separate from `brief.scope.nodes`. */
    nodes: zod_1.z.array(scope_node_1.ScopeNodeSchema).max(exports.RESEARCH_LIMITS.nodes),
    sources: zod_1.z.array(exports.ResearchSourceSchema).max(exports.RESEARCH_LIMITS.sources),
    openQuestions: zod_1.z.array(zod_1.z.string().trim().max(300)).max(exports.RESEARCH_LIMITS.openQuestions),
    /**
     * Why a candidate is unavailable, as a closed code.
     *
     * A stored failure is more useful than a thrown one: the student sees the reason and
     * the next actions in place, and the session keeps a record of what was attempted.
     */
    failureCode: zod_1.z.enum([...exports.RESEARCH_ERROR_CODES, ...exports.IMPORT_ERROR_CODES]).nullable(),
    /** One sentence the UI can show as the honest summary of what happened. */
    summary: zod_1.z.string().trim().max(400),
    /**
     * The depth that actually produced this candidate.
     *
     * Optional so candidates stored before Phase 2 keep parsing. It exists because reusing a
     * candidate is a claim about *how thorough* the answer is: a `STANDARD` result must not be
     * handed back to a request that explicitly asked for `DEEP` research, and without this field
     * the cache had no way to tell the two apart.
     */
    depth: zod_1.z.enum(["LOOKUP", "STANDARD", "DEEP"]).optional(),
    /**
     * Which research questions were answered, and how completely.
     *
     * A bounded summary plus one row per objective — never the whole working ledger. This is what
     * lets a surface say "4 of 5 questions answered" and "entry requirements are still unclear"
     * without shipping the evidence itself into the plan brief.
     */
    coverage: exports.CandidateCoverageSchema.optional(),
    /**
     * Verified evidence, bounded hard.
     *
     * Only claims whose excerpts the server found in pages it fetched, and only up to
     * `EVIDENCE_LIMITS.claims` of them. Raw page text is never stored: the excerpt is a verbatim
     * span, a sentence or two, not a document. The whole structure is sized so a worst-case
     * candidate still fits inside `BRIEF_LIMITS.briefBytes` beside its nodes.
     */
    evidence: exports.CandidateEvidenceSchema.optional(),
});
exports.EXTRACTION_METHODS = ["TEXT", "VISION", "PASTE"];
