import "server-only";
import { createHash } from "node:crypto";
import { ScopeNodeSchema, type ScopeNode } from "../intake/scope-node";
import { scopeStructureIssue } from "../intake/brief";
import type { PlanBriefV1 } from "../intake/brief";
import {
  CONFIRMED_SOURCE_LIMIT,
  RESEARCH_LIMITS,
  type ConfirmedScopeSource,
  type ResearchConfidence,
  type ResearchErrorCode,
  type ResearchMetrics,
  type ResearchRequest,
  type ResearchStatus,
  type ScopeCandidate,
  type ResearchSource,
} from "./contracts";
import { RESEARCH_DEPTH_ORDER, type ResearchDepth } from "./search/contracts";
import { runResearchAgent } from "./agent";
import { deepseekModel } from "./deepseek";
import { resolveAuthorities } from "./authority";
import { selectSearchProvider } from "./search/provider";
import { buildSource, dedupeSources, rankSources, sourceTypeIsOfficial } from "./sources";

/**
 * Research orchestration: the one place that decides what a research operation means.
 *
 * Three responsibilities, and nothing else:
 *
 * 1. **Ask once, bounded.** One provider call plus at most one justified retry, a
 *    timeout, and cancellation that actually stops. No recursive browsing.
 * 2. **Refuse to over-claim.** A result is `OK` only when a real *official* source came
 *    back with grounded findings. Prose with no sources is `WEAK`; a provider that
 *    answered from memory is `WEAK` at best; a failure is `UNAVAILABLE` with the reason
 *    preserved. There is no path here that turns model text into a source.
 * 3. **Know when it is stale.** Every candidate carries the brief digest it was
 *    computed against, so a goal edited while research was in flight cannot have the
 *    old answer applied to it.
 *
 * It does not touch the brief. Producing a candidate and applying one are different
 * acts, and only `confirmScope` may do the second.
 */

export interface ResearchOutcome {
  candidate: ScopeCandidate;
  metrics: ResearchMetrics;
}

/** A digest of the brief fields research actually depends on. */
export function researchBriefDigest(brief: PlanBriefV1): string {
  const material = {
    mode: brief.mode,
    goal: brief.goal.title.trim().toLowerCase(),
    subject: brief.subject.name?.trim().toLowerCase() ?? null,
    board: brief.backgroundCurriculum?.board ?? null,
    level: brief.backgroundCurriculum?.level ?? null,
    endDate: brief.target.endDate,
    topicCount: brief.scope.nodes.length,
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 32);
}

/**
 * Apply the student's own removals to a freshly produced candidate.
 *
 * Research proposes; a person decides. If they have already removed a unit — from a
 * confirmed scope, or from an earlier candidate — a new candidate containing it arrives
 * with that unit *unticked* and a sentence saying so. That is the difference between a
 * suggestion and an undo, and it is enforced here, on the server, rather than trusted to
 * whichever client happens to be rendering.
 */
export function respectStudentRemovals(
  candidate: ScopeCandidate,
  removedLabels: readonly string[]
): ScopeCandidate {
  if (!removedLabels.length) return candidate;
  const removed = new Set(removedLabels.map((label) => label.trim().toLowerCase()));
  let restored = 0;
  const nodes = candidate.nodes.map((node) => {
    if (!removed.has(node.label.trim().toLowerCase())) return node;
    restored += 1;
    return { ...node, selected: false };
  });
  if (!restored) return candidate;
  return {
    ...candidate,
    nodes,
    // The count, not the labels: the surface has the tree and can name them, and this
    // sentence is shown to the student rather than logged.
    openQuestions: [
      ...candidate.openQuestions,
      `${restored} of these ${restored === 1 ? "was a unit" : "were units"} you removed earlier, so ${restored === 1 ? "it is" : "they are"} left unticked. Tick anything you want back.`,
    ].slice(0, RESEARCH_LIMITS.openQuestions),
  };
}

/**
 * What a confirmation keeps from the candidate it consumed.
 *
 * Confirming a scope clears the candidate, so this is the one moment at which the source
 * records behind the confirmed scope can be made durable. Two rules govern what travels:
 *
 * 1. **Only what the confirmed scope actually references.** A source earns its place by
 *    being cited by a kept node, or by mapping to one — an import records the mapping the
 *    other way round, from the source's `nodeIds` to the nodes it produced. Search results
 *    the student did not keep, and sources nothing points at, are dropped rather than
 *    copied: provenance is a claim about where *this* scope came from.
 * 2. **A bounded, content-free copy.** Records keep identity, address, title, publisher,
 *    type and reading date (`ConfirmedScopeSourceSchema`); no page text, no snippet, no
 *    model prose. The bound is the existing source ceiling.
 *
 * The one fallback is deliberate and narrow: when a candidate references nothing at all —
 * no kept node cites a source, and no source maps to a kept node — every source it holds
 * *is* the material this scope was read from, so all of them (bounded) become the
 * confirmation's provenance. Without it, such a confirmation would keep `provenanceRefs`
 * that resolve to nothing, which is the defect this function exists to close.
 *
 * Ids are returned in candidate order, deduplicated, so the same candidate always yields
 * the same snapshot.
 */
export function confirmedScopeSources(
  candidate: ScopeCandidate,
  keptNodes: readonly ScopeNode[]
): { provenanceRefs: string[]; provenanceSources: ConfirmedScopeSource[] } {
  const byId = new Map(candidate.sources.map((source) => [source.sourceId, source]));
  const keptNodeIds = new Set(keptNodes.map((node) => node.nodeId));
  const referenced: string[] = [];
  const seen = new Set<string>();
  const cite = (sourceId: string) => {
    if (!byId.has(sourceId) || seen.has(sourceId)) return;
    seen.add(sourceId);
    referenced.push(sourceId);
  };

  for (const node of keptNodes) for (const sourceId of node.sourceIds ?? []) cite(sourceId);
  for (const source of candidate.sources)
    if (source.nodeIds.some((nodeId) => keptNodeIds.has(nodeId))) cite(source.sourceId);
  if (!referenced.length) for (const source of candidate.sources) cite(source.sourceId);

  const kept = referenced.slice(0, CONFIRMED_SOURCE_LIMIT);
  return {
    provenanceRefs: kept,
    provenanceSources: kept.map((sourceId) => {
      const source = byId.get(sourceId)!;
      return {
        sourceId: source.sourceId,
        // Verbatim: the URL is the one the fetcher reached or the provider returned, and
        // for a user upload it is the student's own delivery reference — never invented.
        url: source.url,
        title: source.title,
        publisherOrDomain: source.publisherOrDomain,
        sourceType: source.sourceType,
        retrievedAt: source.retrievedAt,
        documentDate: source.documentDate,
      };
    }),
  };
}

/** A digest of the *question*, so identical questions reuse one answer. */export function researchCacheKey(input: {
  goal: string;
  subject: string | null;
  board: string | null;
  level: string | null;
  mode: string;
}): string {
  const normalised = {
    kind: "RESEARCH" as const,
    goal: input.goal.trim().toLowerCase().replace(/\s+/g, " "),
    subject: input.subject?.trim().toLowerCase() ?? null,
    board: input.board?.trim().toLowerCase() ?? null,
    level: input.level?.trim().toLowerCase() ?? null,
    mode: input.mode,
  };
  return createHash("sha256").update(JSON.stringify(normalised)).digest("hex").slice(0, 32);
}

/**
 * The cache key for the question a brief is asking.
 *
 * Defined once, on the brief, because it has to be computed by two different modules —
 * the service that looks a candidate up, and the agent that stamps one — and two
 * computations of "the same" key are two chances for them to disagree.
 */
export function researchCacheKeyFor(brief: PlanBriefV1): string {
  return researchCacheKey({
    goal: brief.goal.title,
    subject: brief.subject.name,
    board: brief.backgroundCurriculum?.board ?? null,
    level: brief.backgroundCurriculum?.level ?? null,
    mode: brief.mode,
  });
}

/**
 * Is this candidate still about the brief in front of the student?
 *
 * Compared by digest, not by wording, so "NUST NET Engineering" edited to "NUST NET
 * Business" fails the check even though the strings look similar.
 */
export function candidateIsStale(candidate: ScopeCandidate, brief: PlanBriefV1): boolean {
  return candidate.briefDigest !== researchBriefDigest(brief);
}

/**
 * A candidate for the same question, computed against the same brief: reuse it.
 *
 * Three conditions, and the third was learned from a live run rather than reasoned about:
 *
 * 1. The same *question*. A different question about the same brief is a different question.
 * 2. The same *brief*. The same question against an edited brief is stale.
 * 3. It actually answered. A candidate with no units — `UNAVAILABLE`, whatever the reason —
 *    is a record that the lookup failed, not an answer to reuse. Reusing it would turn a
 *    transient outage into a permanent one for as long as the brief is unchanged, and would
 *    silently refuse the retry the failure message invites.
 */
export function reusableCandidate(
  brief: PlanBriefV1,
  cacheKey: string,
  requestedDepth?: ResearchDepth
): ScopeCandidate | null {
  const candidate = brief.scopeCandidate;
  if (!candidate) return null;
  if (candidateIsStale(candidate, brief)) return null;
  if (candidate.cacheKey !== cacheKey) return null;
  if (!candidate.nodes.length) return null;
  /**
   * The depth gate, added in Phase 2 now that candidates record the depth that produced them.
   *
   * One-directional on purpose: a `DEEP` candidate satisfies a `STANDARD` request — more evidence
   * than was asked for is still an answer — while a `STANDARD` candidate does **not** satisfy an
   * explicit `DEEP` request, because the student asked for the extra reading and the coverage
   * check that come with it, and serving the cheap answer silently is exactly the mislabelling
   * this field exists to prevent.
   *
   * `requestedDepth` is optional, and when it is absent the Phase 1/4.1 behaviour is unchanged:
   * any successful answer to the same question is reused. No surface requests a specific depth
   * yet — the planner picks the tier itself — so this is the contract for when one does, and the
   * metrics always report the depth of the answer actually returned either way.
   *
   * An unknown depth is treated as `STANDARD`: that is what every candidate written before
   * Phase 2 was, since the only other tier then was a single-query lookup.
   */
  const cachedDepth = candidate.depth ?? "STANDARD";
  if (requestedDepth && RESEARCH_DEPTH_ORDER[cachedDepth] < RESEARCH_DEPTH_ORDER[requestedDepth]) return null;
  return candidate;
}

/**
 * Turn grounded findings plus real sources into a bounded candidate hierarchy.
 *
 * The model's prose is used for *structure* — which sections and topics it read — and
 * never for provenance. Source classification comes from the URLs the provider actually
 * saw, so a confident sentence about "the official specification" cannot promote a
 * preparation blog.
 */
export function candidateFromResearch(input: {
  request: ResearchRequest;
  findings: string;
  sources: { url: string; title: string | null }[];
  retrievedAt: string;
  provider: string;
  ungrounded: boolean;
  cacheKey: string;
}): ScopeCandidate {
  const context = {
    goal: input.request.goal,
    subject: input.request.subject,
    board: input.request.board,
    level: input.request.level,
  };
  const built = dedupeSources(
    input.sources
      .map((claim) =>
        buildSource({
          url: claim.url,
          title: claim.title,
          context,
          retrievedAt: input.retrievedAt,
        })
      )
      .filter((source): source is ResearchSource => source !== null)
  );
  const ranked = rankSources(built).slice(0, RESEARCH_LIMITS.sources);
  const official = ranked.filter((source) => sourceTypeIsOfficial(source.sourceType));

  const nodes = parseFindingsIntoNodes(input.findings, ranked);
  const structureIssue = nodes.length ? scopeStructureIssue(nodes) : "EMPTY";

  /**
   * The distinction the student actually feels:
   *
   * - `UNAVAILABLE` — there is no candidate to review. Either nothing parsed, or the
   *   structure came back malformed and reviewing it would be a trap.
   * - `WEAK` — there *is* a candidate, but nothing official backs it: the sources are
   *   secondary, or the provider answered without searching at all. The list is still
   *   worth showing, with its caveat attached.
   * - `OK` — at least one official source supports it.
   *
   * "Found text but no citable source" is therefore WEAK, not UNAVAILABLE: a list the
   * student can check is more useful than a refusal, as long as it never claims a
   * source it does not have.
   */
  const status: ResearchStatus =
    !nodes.length || structureIssue !== null
      ? "UNAVAILABLE"
      : official.length === 0 || input.ungrounded
        ? "WEAK"
        : "OK";

  const confidence: ResearchConfidence =
    status === "OK" && official.length >= 2
      ? "HIGH"
      : status === "OK" || (status === "WEAK" && official.length > 0)
        ? "MEDIUM"
        : "LOW";

  const openQuestions: string[] = [];
  if (input.ungrounded)
    openQuestions.push(
      "I answered from what I already know rather than a live search, so nothing here is sourced yet."
    );
  if (status !== "UNAVAILABLE" && official.length === 0)
    openQuestions.push(
      "I found material about this, but nothing from an official source. Treat the list below as a starting point and check it."
    );
  if (nodes.length && structureIssue)
    openQuestions.push("The structure I read was not complete; check the list below for gaps.");

  return {
    version: 1,
    origin: "RESEARCH",
    status,
    failureCode: status === "UNAVAILABLE" ? "RESEARCH_WEAK" : null,
    confidence,
    briefDigest: input.request.briefDigest,
    retrievedAt: input.retrievedAt,
    provider: input.provider,
    cacheKey: input.cacheKey,
    nodes,
    sources: ranked,
    openQuestions: openQuestions.slice(0, RESEARCH_LIMITS.openQuestions),
    summary: summarise(status, nodes, ranked.length, official.length),
  };
}

function summarise(
  status: ResearchStatus,
  nodes: readonly ScopeNode[],
  sourceCount: number,
  officialCount: number
): string {
  if (status === "UNAVAILABLE")
    return "I could not find a syllabus for this. You can upload one, paste an outline, or enter the scope yourself.";
  const sections = nodes.filter((node) => node.kind !== "TOPIC").length;
  const where = sections
    ? `${nodes.length} unit${nodes.length === 1 ? "" : "s"} across ${sections} section${sections === 1 ? "" : "s"}`
    : `${nodes.length} unit${nodes.length === 1 ? "" : "s"}`;
  if (status === "WEAK")
    return sourceCount === 0
      ? `I found ${where}, but I could not find a source to check it against. Treat it as a starting point.`
      : `I found ${where}, but only from ${sourceCount === 1 ? "a source that is not official" : `${sourceCount} sources that are not official`}. Check it before using it.`;
  return `I found ${where} from ${officialCount} official source${officialCount === 1 ? "" : "s"}.`;
}

/**
 * Read a provider's findings as a hierarchy.
 *
 * Deliberately conservative: it recognises the two shapes a grounded answer reliably
 * produces (markdown headings, and indented/numbered lists) and otherwise falls back to
 * one TOPIC per usable line. It never invents a section that was not signalled, and a
 * line that carries no wording is dropped rather than labelled.
 */
export function parseFindingsIntoNodes(
  findings: string,
  sources: readonly ResearchSource[]
): ScopeNode[] {
  const lines = findings
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0);

  const nodes: ScopeNode[] = [];
  const claimed = new Set<string>();
  /**
   * Two stacks, because real findings nest two ways: markdown headings carry the
   * section/chapter spine, and indented bullets nest inside whatever came last.
   *
   * Deriving depth from absolute indentation alone gets this wrong in the common case —
   * a syllabus written as headings followed by unindented bullets would come out as a
   * row of sections — so bullets attach to the heading above them unless they are
   * indented relative to another bullet.
   */
  let headings: { level: number; nodeId: string }[] = [];
  let bullets: { indent: number; nodeId: string }[] = [];

  for (const raw of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    const bullet = /^(\s*)(?:[-*•+]|\d+[.)]|\d+\.\d+|[a-z][.)])\s+(.*)$/i.exec(raw);
    const plain = /^(\s*)(\S.*)$/.exec(raw);

    const kind: ScopeNode["kind"] | null = heading
      ? heading[1].length === 1
        ? "SECTION"
        : heading[1].length === 2
          ? "CHAPTER"
          : "TOPIC"
      : bullet || plain
        ? "TOPIC"
        : null;
    if (!kind) continue;

    const label = cleanLabel(heading ? heading[2] : bullet ? bullet[2] : plain![2]);
    if (!label) continue;
    if (nodes.length >= RESEARCH_LIMITS.nodes) break;

    let parentId: string | null = null;
    if (heading) {
      const level = Math.min(3, heading[1].length);
      headings = headings.filter((entry) => entry.level < level);
      bullets = [];
      parentId = headings[headings.length - 1]?.nodeId ?? null;
    } else {
      const indent = (bullet ? bullet[1] : plain![1]).length;
      while (bullets.length && bullets[bullets.length - 1].indent >= indent) bullets.pop();
      // The nearest enclosing bullet, or the heading this list sits under.
      parentId = bullets[bullets.length - 1]?.nodeId ?? headings[headings.length - 1]?.nodeId ?? null;
      bullets.push({ indent, nodeId: "" });
    }

    const nodeId = uniqueNodeId(label, claimed);
    nodes.push({
      nodeId,
      label,
      kind,
      parentId,
      selected: true,
      // Every node cites the sources that support the answer as a whole; a per-node
      // mapping would be a guess, and a guess is what this phase refuses to display.
      ...(sources.length ? { sourceIds: sources.slice(0, 4).map((source) => source.sourceId) } : {}),
    });

    if (heading) headings.push({ level: Math.min(3, heading[1].length), nodeId });
    else bullets[bullets.length - 1] = { indent: bullets[bullets.length - 1].indent, nodeId };
  }
  return nodes;
}

const cleanLabel = (value: string): string => {
  const cleaned = value
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[:\-–—\s]+$/, "")
    .trim();
  // A line that was nothing but a marker ("-", "#", "1.") carries no wording, and
  // labelling it would put a heading in the student's syllabus that the source never had.
  if (!cleaned || /^[#\-*•+.\d)\s]+$/.test(cleaned)) return "";
  return cleaned.slice(0, 200);
};

/** Deterministic, unique ids: the same findings produce the same candidate. */
function uniqueNodeId(label: string, claimed: Set<string>): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = `r-${slug || "unit"}`;
  let candidate = base;
  for (let bump = 2; claimed.has(candidate); bump += 1) candidate = `${base}-${bump}`.slice(0, 60);
  claimed.add(candidate);
  return candidate;
}

/**
 * Run one bounded research operation.
 *
 * A cached answer is returned only when it answers the same question about the same
 * brief; anything else is researched again. Metrics are returned rather than logged, so
 * the caller decides what the student sees and telemetry records counts only.
 */
export async function researchScope(input: {
  brief: PlanBriefV1;
  signal?: AbortSignal;
  /** Set when the student has said "use only what I give you". */
  disabled?: boolean;
  /**
   * The depth a caller explicitly requires, when it requires one.
   *
   * Unset by every current surface: the planner chooses the tier from the task, and forcing one
   * from outside would override that judgement. It exists so that a future "research this
   * thoroughly" control can demand `DEEP` and be guaranteed a genuinely deep answer rather than a
   * reused `STANDARD` one.
   */
  requestedDepth?: ResearchDepth;
}): Promise<ResearchOutcome> {
  const brief = input.brief;
  const started = Date.now();
  const cacheKey = researchCacheKeyFor(brief);
  const digest = researchBriefDigest(brief);

  const empty = (
    status: ResearchStatus,
    summary: string,
    failureCode: ResearchErrorCode | null = null,
    calls = 0
  ): ResearchOutcome => ({
    candidate: {
      version: 1,
      origin: "RESEARCH",
      status,
      failureCode,
      confidence: "LOW",
      briefDigest: digest,
      retrievedAt: new Date().toISOString(),
      provider: "none",
      cacheKey,
      nodes: [],
      sources: [],
      openQuestions: [],
      summary,
    },
    metrics: {
      calls,
      retries: 0,
      latencyMs: Date.now() - started,
      cacheHit: false,
      sourceCount: 0,
      officialSourceCount: 0,
      institutionalSourceCount: 0,
      secondarySourceCount: 0,
      candidateNodeCount: 0,
      status,
      searchCalls: 0,
      searchResults: 0,
      // Nothing was retrieved, so every retrieval count is honestly zero — including the
      // depth, which falls back to the tier the run would have used rather than claiming a
      // plan that never happened.
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
      modelCalls: calls,
      modelPasses: 0,
      inputTokens: null,
      outputTokens: null,
    },
  });

  if (input.disabled)
    return empty(
      "UNAVAILABLE",
      "You asked Sylf to use only what you give it, so nothing was looked up.",
      "RESEARCH_NOT_APPLICABLE"
    );
  if (!brief.goal.title.trim())
    return empty(
      "UNAVAILABLE",
      "Tell Sylf what you are preparing for first.",
      "RESEARCH_NOT_APPLICABLE"
    );

  const cached = reusableCandidate(brief, cacheKey, input.requestedDepth);
  if (cached)
    return {
      candidate: cached,
      metrics: {
        calls: 0,
        retries: 0,
        latencyMs: Date.now() - started,
        cacheHit: true,
        sourceCount: cached.sources.length,
        officialSourceCount: cached.sources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length,
        institutionalSourceCount: cached.sources.filter((source) => source.sourceType === "INSTITUTIONAL").length,
        secondarySourceCount: cached.sources.filter(
          (source) => !sourceTypeIsOfficial(source.sourceType) && source.sourceType !== "INSTITUTIONAL"
        ).length,
        candidateNodeCount: cached.nodes.length,
        status: cached.status,
        // A cache hit costs nothing: no search, no fetch, no model call.
        searchCalls: 0,
        searchResults: 0,
        // The candidate's own sources are known, but the *run* that produced them is not
        // re-measured: reporting the original retrieval shape as if it had just happened
        // would make a cache hit look like a search. Zeroes are the honest answer here.
        objectives: 0,
        queriesGenerated: 0,
        queriesWithResults: 0,
        queriesDeduplicated: 0,
        resultsReturned: 0,
        uniqueDomains: 0,
        crossConfirmed: 0,
        duplicatesRemoved: 0,
        fetchFailures: 0,
        /**
         * The depth of the run that produced this answer — not the depth of this request.
         *
         * A cache hit performs no research, so it must describe the work it is *reusing*. If a
         * `DEEP` answer is served to a `STANDARD` request that is an honest upgrade and the
         * metrics say `DEEP`; if a `STANDARD` answer were served to an explicit `DEEP` request,
         * the gate in `reusableCandidate` refuses it rather than mislabelling it here.
         */
        depth: cached.depth ?? "STANDARD",
        // The coverage and evidence counts travel with the candidate, so a cache hit reports the
        // quality of the reused answer rather than pretending nothing is known about it.
        selectedSources: 0,
        evidenceAccepted: cached.evidence?.claims.length ?? 0,
        evidenceRejected: cached.evidence?.rejected ?? 0,
        coverage: cached.coverage?.summary ?? {
          totalObjectives: 0,
          covered: 0,
          partial: 0,
          unanswered: 0,
          conflicted: 0,
          highPriorityUnanswered: 0,
        },
        followUpUsed: cached.coverage?.followUpUsed ?? false,
        followupQueries: 0,
        modelFailure: null,
        coverageBefore: cached.coverage?.summary ?? {
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
      },
    };

  /**
   * The research backend: DeepSeek plans and reads, an external search provider supplies
   * real URLs, and the fetcher retrieves the few that matter.
   *
   * Gemini Google Search grounding was removed from Planner research entirely rather
   * than kept as a fallback: a fallback that runs when search is unconfigured would
   * spend Gemini quota silently, which is the thing this migration exists to stop. The
   * chat search tool is untouched and still uses Gemini — that is a different feature.
   */
  try {
    const target = {
      goal: brief.goal.title,
      subject: brief.subject.name,
      board: brief.backgroundCurriculum?.board ?? null,
      level: brief.backgroundCurriculum?.level ?? null,
    };
    const search = selectSearchProvider();
    const outcome = await runResearchAgent({
      brief,
      target,
      search,
      model: deepseekModel(),
      signal: input.signal,
      authorityHosts: resolveAuthorities(target).hosts,
      // The caller's requirement is the tier: asking for `DEEP` gets a deep run even if the model
      // judged the question easy, and asking for `LOOKUP` caps a plan that wanted more.
      ...(input.requestedDepth ? { requiredDepth: input.requestedDepth } : {}),
    });
    const candidate = outcome.candidate;
    const official = candidate.sources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length;
    const institutional = candidate.sources.filter((source) => source.sourceType === "INSTITUTIONAL").length;
    return {
      candidate,
      metrics: {
        calls: outcome.metrics.modelCalls,
        retries: 0,
        latencyMs: outcome.metrics.latencyMs,
        cacheHit: false,
        sourceCount: candidate.sources.length,
        officialSourceCount: official,
        institutionalSourceCount: institutional,
        secondarySourceCount: candidate.sources.length - official - institutional,
        candidateNodeCount: candidate.nodes.length,
        status: candidate.status,
        searchCalls: outcome.metrics.searchCalls,
        searchResults: outcome.metrics.searchResults,
        objectives: outcome.metrics.objectives,
        queriesGenerated: outcome.metrics.queriesGenerated,
        queriesWithResults: outcome.metrics.queriesWithResults,
        queriesDeduplicated: outcome.metrics.queriesDeduplicated,
        resultsReturned: outcome.metrics.resultsReturned,
        uniqueDomains: outcome.metrics.uniqueDomains,
        crossConfirmed: outcome.metrics.crossConfirmed,
        duplicatesRemoved: outcome.metrics.duplicatesRemoved,
        fetchFailures: outcome.metrics.fetchFailures,
        depth: outcome.metrics.depth,
        selectedSources: outcome.metrics.selectedSources,
        evidenceAccepted: outcome.metrics.evidenceAccepted,
        evidenceRejected: outcome.metrics.evidenceRejected,
        coverage: outcome.metrics.coverage,
        followUpUsed: outcome.metrics.followUpUsed,
        followupQueries: outcome.metrics.followupQueries,
        modelFailure: outcome.metrics.modelFailure,
        coverageBefore: outcome.metrics.coverageBefore,
        sourceCandidates: outcome.metrics.sourceCandidates,
        sourcesFetched: outcome.metrics.sourcesFetched,
        httpRequests: outcome.metrics.httpRequests,
        fetchBytes: outcome.metrics.fetchBytes,
        modelCalls: outcome.metrics.modelCalls,
        modelPasses: outcome.metrics.modelPasses,
        inputTokens: outcome.metrics.inputTokens,
        outputTokens: outcome.metrics.outputTokens,
      },
    };
  } catch (error) {
    // A provider failure is reported as UNAVAILABLE with the reason preserved in the
    // copy, never as a weak result: "I could not look" and "I looked and found little"
    // are different answers, and the student's next action differs.
    // The agent already reports its failures as typed codes on the candidate; anything
    // that reaches here is an unexpected throw, which is honestly just "unavailable".
    void error;
    const code = "RESEARCH_UNAVAILABLE";
    const copy: Record<string, string> = {
      RESEARCH_TIMEOUT: "The search took too long, so I stopped it. You can try again, or add the scope yourself.",
      RESEARCH_CANCELLED: "The search was cancelled. Nothing was changed.",
      RESEARCH_UNAVAILABLE:
        "I could not reach a search provider just now. You can upload a syllabus, paste an outline, or enter the scope yourself.",
      RESEARCH_WEAK: "I did not find anything reliable for this. Add the scope yourself, or try a more specific name.",
      RESEARCH_STALE_BRIEF: "What you were planning changed while I was searching, so that result no longer applies.",
      RESEARCH_NOT_APPLICABLE: "There is nothing to research for this yet.",
    };
    return empty(
      "UNAVAILABLE",
      copy[code] ?? "Research could not run.",
      code as ResearchErrorCode,
      0
    );
  }
}
