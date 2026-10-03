import { RESEARCH_BOUNDS, type SearchProviderId, type SearchResult } from "./contracts";
import { canonicalUrl, hostOf } from "./url";

/**
 * The candidate pool: every result the retrieval stage produced, deduplicated, with the
 * retrieval facts that later phases need to rank and trace it.
 *
 * This is the Phase 1 deliverable. The feature document asks the engine to "search broadly
 * but only deeply read the sources that are most useful", and those two halves need
 * different things from the same list: breadth wants as many candidates as the bounded
 * queries can produce, while selection wants to know *why* each one is there. A flat
 * `SearchResult[]` can carry the first and cannot carry the second, so the pool keeps the
 * per-candidate retrieval trace — which queries surfaced it, under which objective, from
 * which providers, and how many independent queries agree it exists.
 *
 * Nothing here decides relevance. It records what happened, deduplicates it, and counts it.
 * Ranking stays where it already lives (`rankSources`, on URL and title alone) and the
 * semantic reranking the document describes is Phase 2's job; this module's only opinion is
 * that one URL seen five times is one candidate, and that how many times it was seen is a
 * fact worth keeping rather than throwing away.
 */

/** One candidate, with the retrieval history behind it. */
export interface CandidatePoolEntry {
  url: string;
  title: string;
  snippet: string | null;
  /**
   * The provider whose ordering this candidate was first returned in.
   *
   * Present so a pool entry is structurally a `SearchResult` and the existing downstream —
   * `buildSource`, `rankSources`, the fetch loop — consumes it unchanged. `providers` is the
   * full set when more than one answered.
   */
  provider: SearchProviderId;
  /** Every provider that returned this URL, in first-seen order. */
  providers: SearchProviderId[];
  /** Best (lowest) position any provider gave it: the strongest ordering evidence held. */
  rank: number;
  /** Every query that surfaced it, in plan order. */
  queries: string[];
  /** Every objective those queries serve, in plan order. */
  objectiveIds: string[];
  /**
   * How many distinct queries returned this URL.
   *
   * Two independent wordings of the same question agreeing on a document is weak evidence
   * that matters, and it is exactly the signal a naive dedupe destroys: collapsing duplicates
   * keeps the document and forgets that it was found twice. Recorded here so Phase 2 can use
   * it and so telemetry can report it.
   */
  confirmations: number;
}

export interface CandidatePool {
  /** Deduplicated candidates, in first-seen order. */
  entries: CandidatePoolEntry[];
  /** Results returned by every query, before deduplication. */
  rawResults: number;
  uniqueUrls: number;
  uniqueDomains: number;
  /** Candidates reached by more than one query. */
  crossConfirmed: number;
  /** How much deduplication removed. Reported rather than silent. */
  duplicatesRemoved: number;
  /** Candidates dropped because the pool was already at its ceiling. */
  droppedOverCap: number;
  /** Results whose URL had no usable host, so it could neither be ranked nor fetched. */
  droppedInvalid: number;
  /** Queries that returned at least one usable result. */
  queriesWithResults: number;
}

/** The registrable-ish host of a URL, lowercased and without `www.`. */
export { hostOf };

/** One query's contribution to the pool. */
export interface PoolContribution {
  query: string;
  /** The objective the query was planned for. `null` when a plan stated none. */
  objectiveId: string | null;
  /**
   * Further objectives this same query serves.
   *
   * Set when duplicate queries were collapsed before dispatch: the retained query is the same
   * search, so it answers the objectives of every query it replaced, and a candidate it finds must
   * still be attributed to them. Dropping that attribution would quietly lower a run's measured
   * coverage for questions it did in fact search for.
   */
  objectiveIds?: readonly string[];
  results: readonly SearchResult[];
}

/**
 * Merge every query's results into one deduplicated pool.
 *
 * Deterministic by construction: candidates appear in the order they were first seen, and
 * contributions are consumed in plan order rather than completion order. That matters beyond
 * tidiness — the fetch loop walks the ranking in order and stops as soon as it holds enough
 * readable sources, so a pool that depended on which provider answered first would spend a
 * different budget on the same question twice, and the same brief would research differently
 * on a slow afternoon.
 *
 * A rejected result is counted, not silently dropped: a URL with no host cannot be ranked or
 * fetched, and quietly shrinking the pool would make a provider's malformed rows look like a
 * thin search.
 */
export function buildCandidatePool(input: {
  contributions: readonly PoolContribution[];
  maxEntries?: number;
}): CandidatePool {
  const maxEntries = input.maxEntries ?? RESEARCH_BOUNDS.maxCandidatePool;
  const byUrl = new Map<string, CandidatePoolEntry>();
  const domains = new Set<string>();
  let rawResults = 0;
  let duplicatesRemoved = 0;
  let droppedOverCap = 0;
  let droppedInvalid = 0;
  let queriesWithResults = 0;

  for (const contribution of input.contributions) {
    if (contribution.results.length) queriesWithResults += 1;
    for (const result of contribution.results) {
      rawResults += 1;
      /**
       * Canonicalised here as well as in the provider.
       *
       * Idempotent on what a provider already normalised — so this pass is free today — and
       * it means the pool's promise ("one candidate per document") does not depend on every
       * future provider remembering to normalise. A URL that cannot be canonicalised has no
       * host to rank on and nothing to fetch, so it is dropped and counted.
       */
      const url = canonicalUrl(result.url);
      if (!url) {
        droppedInvalid += 1;
        continue;
      }
      const contributionObjectives = [
        ...(contribution.objectiveId ? [contribution.objectiveId] : []),
        ...(contribution.objectiveIds ?? []),
      ];
      const existing = byUrl.get(url);
      if (existing) {
        duplicatesRemoved += 1;
        if (!existing.providers.includes(result.provider)) existing.providers.push(result.provider);
        // A repeat from the *same* query is a duplicate; the same URL from a different
        // query is a confirmation, which is the distinction the counter below records.
        if (!existing.queries.includes(contribution.query)) existing.queries.push(contribution.query);
        for (const objectiveId of contributionObjectives)
          if (!existing.objectiveIds.includes(objectiveId)) existing.objectiveIds.push(objectiveId);
        // Best position wins: a document a provider put first is stronger evidence than the
        // same document another provider buried, and keeping the weaker number would let a
        // noisy provider's ordering drag a good candidate down.
        existing.rank = Math.min(existing.rank, result.rank);
        if (!existing.snippet && result.snippet) existing.snippet = result.snippet;
        continue;
      }
      if (byUrl.size >= maxEntries) {
        droppedOverCap += 1;
        continue;
      }
      byUrl.set(url, {
        url,
        title: result.title,
        snippet: result.snippet,
        provider: result.provider,
        providers: [result.provider],
        rank: result.rank,
        queries: [contribution.query],
        objectiveIds: contributionObjectives,
        confirmations: 1,
      });
      domains.add(hostOf(url));
    }
  }

  /**
   * `confirmations` is derived, never incremented.
   *
   * It has exactly one meaning — how many distinct queries returned this URL — and the
   * `queries` list already holds that fact. Maintaining a second counter alongside it is how
   * the two drift, so it is computed once here instead.
   */
  const entries = [...byUrl.values()].map((entry) => ({ ...entry, confirmations: entry.queries.length }));
  return {
    entries,
    rawResults,
    uniqueUrls: entries.length,
    uniqueDomains: domains.size,
    crossConfirmed: entries.filter((entry) => entry.confirmations > 1).length,
    duplicatesRemoved,
    droppedOverCap,
    droppedInvalid,
    queriesWithResults,
  };
}
