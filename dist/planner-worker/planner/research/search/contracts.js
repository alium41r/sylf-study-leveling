"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComparisonExtractionSchema = exports.ResearchExtractionSchema = exports.ResearchFollowupPlanSchema = exports.EvidenceClaimSchema = exports.EVIDENCE_LIMITS = exports.EVIDENCE_SUPPORT = exports.EVIDENCE_KINDS = exports.ResearchPlanSchema = exports.ResearchObjectiveSchema = exports.RESEARCH_OBJECTIVE_PRIORITIES = exports.ResearchQueryPlanSchema = exports.QUERY_PURPOSES = exports.RESEARCH_BOUNDS = exports.FETCH_ERROR_CODES = exports.SEARCH_ERROR_CODES = exports.RESEARCH_DEPTH_BUDGETS = exports.RESEARCH_DEPTH_ORDER = exports.RESEARCH_DEPTHS = exports.SEARCH_PROVIDERS = exports.RESEARCH_BACKENDS = void 0;
const zod_1 = require("zod");
/**
 * Search, fetch and authority contracts for Planner research.
 *
 * The rule this whole file exists to enforce: **a URL may enter Planner provenance from
 * exactly two places** — a search provider's response, or a validated redirect the safe
 * fetcher actually followed. DeepSeek plans queries and reads pages; it never supplies a
 * URL, and the schemas below are shaped so it cannot.
 */
exports.RESEARCH_BACKENDS = ["DEEPSEEK_SEARCH"];
exports.SEARCH_PROVIDERS = ["brave", "serper", "searxng"];
/**
 * How much research a request deserves.
 *
 * Phase 1 shipped two tiers because retrieval alone could not make a third behave differently.
 * Phase 2 adds `DEEP`, and it is a real tier rather than a label: it reads roughly twice as
 * many pages, it checks objective coverage against verified evidence, and it may spend exactly
 * one follow-up round searching again for the objectives that came back unanswered. A tier that
 * behaved like `STANDARD` would be a lie in the telemetry, which is why Phase 1 refused to
 * create it before the machinery existed.
 */
exports.RESEARCH_DEPTHS = ["LOOKUP", "STANDARD", "DEEP"];
/** Ordered least to most thorough. Used for cache-quality comparison, never for policy. */
exports.RESEARCH_DEPTH_ORDER = {
    LOOKUP: 0,
    STANDARD: 1,
    DEEP: 2,
};
/**
 * What each depth costs, and what it is allowed to do.
 *
 * The model chooses the tier; the server decides the budget, and intersects the tier with the
 * global ceiling, so a tier can only ever narrow a run.
 *
 * `maxTotalSourceChars` is per-depth because it is the number that actually bounds the
 * extraction call's input. Phase 1 had a single 36 000 ceiling that happened to fit four pages;
 * nine pages of 12 000 characters would be 108 000, so a deeper read budget without a matching
 * text budget would either truncate silently or blow the pass. DEEP therefore gets 9 × 8 000 =
 * 72 000, measured against the extraction prompt and reported in the phase report.
 *
 * `maxModelPasses` is stated per tier rather than globally. Phase 1's single `maxModelPasses = 2`
 * was honest while every run was plan-then-extract; a DEEP run that quietly made four calls
 * while the contract said two would have made the cost accounting wrong in exactly the place
 * the feature document asks for it to be right.
 */
exports.RESEARCH_DEPTH_BUDGETS = {
    LOOKUP: {
        maxQueries: 1,
        maxResultsPerQuery: 8,
        maxFetchedSources: 3,
        initialFetchedSources: 3,
        maxTotalSourceChars: 24_000,
        maxFollowUpQueries: 0,
        followUpRounds: 0,
        maxModelPasses: 2,
        modelTimeoutMs: 45_000,
    },
    STANDARD: {
        maxQueries: 8,
        maxResultsPerQuery: 10,
        maxFetchedSources: 4,
        initialFetchedSources: 4,
        maxTotalSourceChars: 36_000,
        maxFollowUpQueries: 0,
        followUpRounds: 0,
        maxModelPasses: 2,
        modelTimeoutMs: 45_000,
    },
    /**
     * Nine pages, not twelve. The design target for the deeper tier was "8–12 pages read", and
     * nine is where the two hard constraints meet: the extraction pass has to carry every page it
     * is asked to read, and the whole run has to stay inside the research timeout with one extra
     * search round and one extra model pass on top. Nine is the largest number that keeps the
     * prompt inside its measured char budget without per-page truncation.
     */
    DEEP: {
        maxQueries: 8,
        maxResultsPerQuery: 10,
        maxFetchedSources: 9,
        initialFetchedSources: 6,
        maxTotalSourceChars: 72_000,
        maxFollowUpQueries: 4,
        followUpRounds: 1,
        maxModelPasses: 4,
        modelTimeoutMs: 120_000,
    },
};
exports.SEARCH_ERROR_CODES = [
    "SEARCH_UNAVAILABLE",
    "SEARCH_UNAUTHORIZED",
    "SEARCH_RATE_LIMITED",
    "SEARCH_TIMEOUT",
    "SEARCH_BAD_RESPONSE",
    "SEARCH_ZERO_RESULTS",
];
exports.FETCH_ERROR_CODES = [
    "FETCH_BLOCKED_SCHEME",
    "FETCH_BLOCKED_HOST",
    "FETCH_BLOCKED_PRIVATE",
    "FETCH_BLOCKED_CREDENTIALS",
    "FETCH_BLOCKED_REDIRECT",
    "FETCH_TOO_MANY_REDIRECTS",
    "FETCH_TOO_LARGE",
    "FETCH_UNSUPPORTED_TYPE",
    "FETCH_TIMEOUT",
    "FETCH_CANCELLED",
    "FETCH_FAILED",
];
/**
 * Hard bounds for one research operation.
 *
 * Phase 1 widened exactly one thing: the *retrieval* budget. The feature document asks the
 * engine to "search broadly but only deeply read the sources that are most useful", which is
 * a statement about where the money goes — search is cheap, page reading is not — so the
 * candidate pool grew (`maxSearchQueries` 2 → 8, `maxResultsPerQuery` 8 → 10, up to 80
 * candidates) while the read budget below is untouched. Nothing here is advisory: the agent
 * enforces every ceiling and a test drives a hostile plan into each one.
 *
 * The old fixed two queries were replaced rather than merely raised. Two was a guess about
 * how many queries a task needs, made before anything had looked at the task; the plan now
 * states its objectives first and derives the query count from them, bounded by
 * `RESEARCH_DEPTH_BUDGETS` and then by the ceilings here.
 */
exports.RESEARCH_BOUNDS = {
    /** Ceiling for one run, whatever depth the plan claims. A tier may only narrow it. */
    maxSearchQueries: 8,
    maxResultsPerQuery: 10,
    /**
     * Objectives one plan may state. Three or four is a curriculum survey; a dozen is a
     * model padding a list, and each objective is expected to justify its own queries, so
     * this bounds the reasoning as much as the retrieval.
     */
    maxResearchObjectives: 6,
    /** Follow-up queries one DEEP round may add. Bounded by the depth budget as well. */
    maxFollowUpQueries: 4,
    /**
     * Distinct candidate URLs carried forward, across every query and provider.
     *
     * `maxSearchQueries × maxResultsPerQuery` is the worst case (80), so this is headroom for
     * cross-provider overlap rather than a second limit that bites first. It exists because a
     * fallback provider can answer the same queries a second time.
     */
    maxCandidatePool: 120,
    /**
     * Queries in flight at once. Independent searches run concurrently because the wait is
     * dominated by the slowest provider call, not by the number of them — and the pool is
     * assembled in plan order afterwards, so concurrency changes the latency and never the
     * result.
     */
    maxConcurrentSearches: 4,
    /**
     * Page fetches in flight at once.
     *
     * Phase 2 read pages strictly one at a time and measured a DEEP run at ~192 seconds, of which
     * the page reads were a large share: each is a separate host, a separate TLS handshake and a
     * separate timeout budget, and they were queued behind one another for no reason. Three is the
     * chosen bound, and it is deliberately low: the request rate is per-host politeness as much as
     * our own resource use, the SSRF/MIME/byte protections all run per request regardless, and the
     * gain from 1→3 is most of the available win (4→8 adds little and multiplies the chance of a
     * host treating us as abusive).
     *
     * Concurrency here changes *when* a page arrives, never *which* pages are kept: results are
     * accepted in selection order after the wave resolves, so a slow page and a fast page produce
     * the same run.
     */
    maxConcurrentFetches: 3,
    /**
     * Sources kept and read for the model. The *selected* set, and the ceiling no tier may exceed.
     *
     * Raised from 4 to 9 in Phase 2 — but not, as the phase specification warns, by simply giving
     * every run twelve pages. The tiers keep their own budgets (3 / 4 / 9) and this is only the
     * outermost bound they are intersected with, so an ordinary `STANDARD` run reads exactly what it
     * read before and the deeper tier is the only one that pays for more.
     */
    maxFetchedSources: 9,
    /**
     * Ranked candidates the agent may *try*, as distinct from sources it keeps.
     *
     * Added in the final phase, after a live run showed why a single number could not serve
     * both jobs. The agent ranks verified official sources first — correctly — and then reads
     * the top four. When a target's own host refuses to serve us (NUST answers 403 to a
     * non-browser client) those four candidates can all fail, and the run returned nothing at
     * all even though readable lower-ranked pages were sitting in the result list.
     *
     * So attempting and keeping are now separate budgets: four usable sources is still the
     * ceiling on what the model reads, and this is the ceiling on how many candidates the
     * agent may try before it gives up. It is bounded by the results already in hand, so it
     * cannot widen the search, and the loop stops the moment enough sources are read.
     *
     * Widened in Phase 1 with the pool it walks: a broader pool that could still only be tried
     * eight deep would waste the retrieval it just paid for, and the failure mode it guards —
     * an official host refusing us — is exactly the one a wider pool makes survivable.
     */
    maxSourceCandidateAttempts: 16,
    maxModelPasses: 2,
    maxToolRounds: 3,
    maxQueryChars: 300,
    /** Per-source excerpt sent to the model. */
    maxSourceChars: 12_000,
    /** Total excerpt text across all fetched sources in one pass. */
    maxTotalSourceChars: 36_000,
    searchTimeoutMs: 12_000,
    fetchTimeoutMs: 12_000,
    modelTimeoutMs: 45_000,
    /** Response cap for a fetched page, before extraction. */
    maxFetchBytes: 3 * 1024 * 1024,
    maxRedirects: 3,
};
exports.QUERY_PURPOSES = [
    "OFFICIAL_SYLLABUS",
    "OFFICIAL_EXAM_SCOPE",
    "OFFICIAL_SPECIFICATION",
    "ENTRY_REQUIREMENTS",
    "SUBJECT_CONTENT",
    "FOLLOW_UP",
];
/**
 * What DeepSeek may decide about searching: which queries, and why.
 *
 * Deliberately not free-form tool calls. A model that can emit "browse more" can loop;
 * one that emits a bounded list of queries with a stated purpose cannot.
 *
 * Phase 1 replaced this as the *scope research* plan with `ResearchPlanSchema` below, which
 * states objectives before queries. It survives as the comparison path's contract, where a
 * background curriculum is one document to find and a stated objective would add a step
 * without adding a decision. Its ceiling is now the shared one, and the comparison path
 * still slices to `COMPARISON_LIMITS.searchQueries`, so that behaviour is unchanged.
 */
exports.ResearchQueryPlanSchema = zod_1.z.strictObject({
    queries: zod_1.z
        .array(zod_1.z.strictObject({
        query: zod_1.z.string().trim().min(3).max(exports.RESEARCH_BOUNDS.maxQueryChars),
        purpose: zod_1.z.enum(exports.QUERY_PURPOSES),
    }))
        .min(1)
        .max(exports.RESEARCH_BOUNDS.maxSearchQueries),
});
/**
 * One thing the run has to establish before the answer is usable.
 *
 * Objectives come *first* and queries are derived from them, which is the whole difference
 * between this and the fixed two-query plan it replaces. "I am an A-level student preparing
 * for NET Engineering" is not one question: it is the exam's own scope, whether the board's
 * specification is the authority, what the entry requirements are, and which subjects the
 * paper actually contains. A model asked for two queries answers one of those and guesses at
 * the rest; a model asked to state its objectives first has to notice there are four.
 *
 * `priority` is the model's own view of what matters most, and it is recorded rather than
 * obeyed: it orders nothing in Phase 1, and a plan that marks everything `PRIMARY` is
 * accepted and simply tells the truth about itself in telemetry.
 */
exports.RESEARCH_OBJECTIVE_PRIORITIES = ["PRIMARY", "SUPPORTING"];
/**
 * One objective, as the plan states it and as everything downstream reads it.
 *
 * Exported as its own schema because Phase 2 needs the objective *alone* in several places —
 * coverage is computed per objective, selection scores candidates against one, and the follow-up
 * planner is handed the unresolved ones — and a plan-shaped type would have forced each of those
 * to carry the queries too.
 */
exports.ResearchObjectiveSchema = zod_1.z.strictObject({
    id: zod_1.z.string().trim().min(1).max(40).regex(/^o[1-9][0-9]*$/),
    question: zod_1.z.string().trim().min(3).max(240),
    priority: zod_1.z.enum(exports.RESEARCH_OBJECTIVE_PRIORITIES),
});
/**
 * What DeepSeek may decide about a research run: what needs establishing, how hard to look,
 * and which queries serve which objective.
 *
 * The provenance rule is unchanged and absolute — there is still no URL field, and `id` is a
 * plan-local token the server resolves, never an address. The new field is a *question*, not
 * an answer: the model states what it is trying to find out, and the pages decide what is
 * true. Nothing here can assert a fact about the target.
 */
exports.ResearchPlanSchema = zod_1.z.strictObject({
    depth: zod_1.z.enum(exports.RESEARCH_DEPTHS),
    objectives: zod_1.z
        .array(exports.ResearchObjectiveSchema)
        .min(1)
        .max(exports.RESEARCH_BOUNDS.maxResearchObjectives),
    queries: zod_1.z
        .array(zod_1.z.strictObject({
        query: zod_1.z.string().trim().min(3).max(exports.RESEARCH_BOUNDS.maxQueryChars),
        purpose: zod_1.z.enum(exports.QUERY_PURPOSES),
        /** The objective this query is meant to establish. */
        objectiveId: zod_1.z.string().trim().min(1).max(40),
    }))
        .min(1)
        .max(exports.RESEARCH_BOUNDS.maxSearchQueries),
});
/**
 * Evidence, as the model may report it — and the shape of what the server keeps.
 *
 * The invariant this contract exists to make checkable is:
 *
 *     OBJECTIVE → CLAIM → VERIFIED SOURCE → VERIFIED EXCERPT
 *
 * The model may paraphrase (`statement`), but every claim must carry an `excerpt` that the
 * server then proves exists in the text it actually fetched from the cited source. A claim
 * whose excerpt cannot be found is dropped, not downgraded: an unverifiable quotation is the
 * one failure mode that would let a confident sentence become a citation.
 *
 * Note what is absent. There is no `url` field, so the model cannot introduce an address; this
 * is the same structural guarantee the extraction schema has always had. There is also no
 * `claimId`: ids are assigned by the server, so a claim cannot be given an identity the server
 * did not issue, and two runs over the same sources produce the same ids.
 */
exports.EVIDENCE_KINDS = ["DIRECT", "INDIRECT"];
exports.EVIDENCE_SUPPORT = ["SUPPORTS", "PARTIAL", "CONTRADICTS"];
/** Bounds kept small on purpose: these records travel inside the plan brief. */
exports.EVIDENCE_LIMITS = {
    /** Claims accepted across the whole run, after verification. */
    claims: 32,
    /** Claims one source may contribute. */
    claimsPerSource: 4,
    /** Claims one objective may accumulate. */
    claimsPerObjective: 8,
    statementChars: 200,
    excerptChars: 240,
    /**
     * Shortest excerpt the server will verify.
     *
     * A three-word fragment can be found in almost any document by accident, and "the word
     * appears somewhere on the page" is not evidence for a specific claim. Twenty characters is
     * long enough to be a phrase and short enough not to exclude a terse specification table.
     */
    minExcerptChars: 20,
    /** The model's proposed paraphrases per objective, before verification. */
    proposedClaims: 60,
};
exports.EvidenceClaimSchema = zod_1.z.strictObject({
    /** The objective this evidence is about. Must be one the plan stated. */
    objectiveId: zod_1.z.string().trim().min(1).max(40),
    /** The source it came from, by the id the server issued to the excerpt it was given. */
    sourceId: zod_1.z.string().trim().min(1).max(60),
    /** The model's paraphrase of what the source says. Never shown as a quotation. */
    statement: zod_1.z.string().trim().min(3).max(exports.EVIDENCE_LIMITS.statementChars),
    /** A verbatim span that the server must find in the fetched text. */
    excerpt: zod_1.z.string().min(1).max(exports.EVIDENCE_LIMITS.excerptChars),
    evidenceKind: zod_1.z.enum(exports.EVIDENCE_KINDS),
    support: zod_1.z.enum(exports.EVIDENCE_SUPPORT),
    /**
     * A publication or version date the page states, quoted rather than inferred.
     *
     * Only accepted when the claim also carries a verified excerpt, so a date cannot arrive as
     * bare model knowledge. The server does not *replace* its own provider-derived date with
     * this: the two are kept apart, because one is metadata and the other is extracted evidence.
     */
    documentDate: zod_1.z.string().trim().max(60).nullable(),
});
/**
 * The follow-up plan: queries for the objectives that came back unanswered.
 *
 * Deliberately not a second `ResearchPlan`. A follow-up round may not restate objectives, may
 * not change the depth, and may not request another round — all three would turn one bounded
 * extra round into the unbounded agent loop the feature document forbids. What it may do is
 * exactly one thing: aim a few more queries at the specific questions that are still open.
 */
exports.ResearchFollowupPlanSchema = zod_1.z.strictObject({
    queries: zod_1.z
        .array(zod_1.z.strictObject({
        query: zod_1.z.string().trim().min(3).max(exports.RESEARCH_BOUNDS.maxQueryChars),
        purpose: zod_1.z.enum(exports.QUERY_PURPOSES),
        /**
         * The unresolved objectives this query targets. At least one — a follow-up query that
         * serves no objective is just another search, which is what the first round was for.
         */
        objectiveIds: zod_1.z
            .array(zod_1.z.string().trim().min(1).max(40))
            .min(1)
            .max(exports.RESEARCH_BOUNDS.maxResearchObjectives),
    }))
        .min(1)
        .max(exports.RESEARCH_BOUNDS.maxFollowUpQueries),
});
/**
 * What DeepSeek may decide about a syllabus: its structure, and which *source ids*
 * support which units. There is no URL field — not by convention, but because the
 * schema has nowhere to put one.
 */
exports.ResearchExtractionSchema = zod_1.z.strictObject({
    targetIdentity: zod_1.z.strictObject({
        name: zod_1.z.string().trim().min(1).max(200),
        institution: zod_1.z.string().trim().max(200).nullable(),
        board: zod_1.z.string().trim().max(60).nullable(),
        level: zod_1.z.string().trim().max(60).nullable(),
    }),
    scope: zod_1.z
        .array(zod_1.z.strictObject({
        label: zod_1.z.string().trim().min(1).max(200),
        kind: zod_1.z.enum(["SECTION", "CHAPTER", "TOPIC"]),
        /** Index into `scope`, or null for a top-level unit. */
        parentIndex: zod_1.z.number().int().nonnegative().nullable(),
    }))
        .max(200),
    sourceMappings: zod_1.z
        .array(zod_1.z.strictObject({
        nodeIndexes: zod_1.z.array(zod_1.z.number().int().nonnegative()).max(200),
        sourceIds: zod_1.z.array(zod_1.z.string().min(1).max(60)).max(4),
    }))
        .max(200),
    unresolved: zod_1.z.array(zod_1.z.string().trim().max(300)).max(5),
    /** The model's own view of its confidence. Recorded; never sufficient for OK alone. */
    extractionConfidence: zod_1.z.enum(["HIGH", "MEDIUM", "LOW"]),
    /** Named when the model saw sources disagree, so the conflict is surfaced not merged. */
    conflicts: zod_1.z
        .array(zod_1.z.strictObject({
        description: zod_1.z.string().trim().max(300),
        sourceIds: zod_1.z.array(zod_1.z.string().min(1).max(60)).min(2).max(4),
    }))
        .max(3),
    /**
     * Proposed evidence, alongside the scope in the same answer.
     *
     * Typed `unknown` on purpose, and that is not laziness: this field is *proposed* evidence, and
     * `buildLedger` is what decides whether any of it is real. Validating it here would mean one
     * malformed claim discarded the entire extraction — including the scope, which is the part this
     * schema is actually for. A claim that fails verification is dropped and counted instead.
     *
     * The field is also why this schema must *accept* an unknown key rather than reject it: it is a
     * `strictObject`, so asking the model for evidence without this line made every real extraction
     * fail to parse while every stubbed one passed.
     */
    evidence: zod_1.z.unknown().optional(),
});
/**
 * What DeepSeek may decide about a *comparison*: which background units it read, and
 * how each confirmed target unit relates to them.
 *
 * Same shape of guarantee as the extraction above, for the same reason: there is no
 * URL field and no prose field. A unit is classified from the pages it was given, may
 * cite them only by the server-assigned id, and states *why* with a closed code rather
 * than a sentence — the sentence the student reads is assembled by the server from
 * their own unit label and their own curriculum name. Preparedness, mastery, priority
 * and difficulty have no field here at all: comparing two curricula cannot say anything
 * about a person.
 */
exports.ComparisonExtractionSchema = zod_1.z.strictObject({
    /** The background curriculum's own units, as read. Display-only context. */
    backgroundUnits: zod_1.z
        .array(zod_1.z.strictObject({ label: zod_1.z.string().trim().min(1).max(200) }))
        .max(120),
    units: zod_1.z
        .array(zod_1.z.strictObject({
        /** The server-assigned unit reference this row is about. */
        unitRef: zod_1.z.string().trim().min(1).max(60),
        overlap: zod_1.z.enum([
            "LIKELY_COVERED_BY_CURRICULUM",
            "PARTIAL_OVERLAP",
            "LIKELY_NEW_TO_CURRICULUM",
            "UNCLEAR",
        ]),
        confidence: zod_1.z.enum(["HIGH", "MEDIUM", "LOW"]),
        sourceIds: zod_1.z.array(zod_1.z.string().trim().min(1).max(60)).max(4),
        explanationCode: zod_1.z.enum([
            "BACKGROUND_TOPIC_MATCH",
            "BACKGROUND_PARTIAL_MATCH",
            "NOT_IN_BACKGROUND_CURRICULUM",
            "EVIDENCE_INCONCLUSIVE",
            "NO_BACKGROUND_EVIDENCE",
        ]),
    }))
        .max(50),
    unresolved: zod_1.z.array(zod_1.z.string().trim().max(240)).max(8),
    /** The model's own view of the comparison's quality. Recorded; never sufficient. */
    comparisonConfidence: zod_1.z.enum(["HIGH", "MEDIUM", "LOW"]),
});
