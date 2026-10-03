import "server-only";
import type { CandidatePoolEntry } from "./search/pool";
import type { ResearchObjective } from "./search/contracts";
import { documentRelevance, classifySource, sourceTypeIsOfficial } from "./sources";
import type { AuthorityTarget } from "./authority";

/**
 * Choosing which pages to read.
 *
 * Phase 1 ranked candidates by authority tier and, within a tier, by whatever the URL and title
 * suggested — and then read the top four. That was the correct minimum when the only question
 * was "which of these looks like a syllabus", and it is the wrong question now. The feature
 * document asks the research system to stop asking "which URLs rank highest?" and start asking
 * "what evidence do I need, which sources best answer each objective, and what is still missing?"
 *
 * So selection is a bounded greedy assignment rather than a sort. Each slot goes to the candidate
 * with the best *marginal* value: worth something for its authority, worth more if it answers an
 * objective nothing has answered yet, worth a little for being independently discoverable. The
 * greedy step is what makes coverage possible at all — a plain sort would happily spend all four
 * slots on four pages that answer the same question, which is exactly the failure §7 of the phase
 * specification describes.
 *
 * Everything here is deterministic. Scores are integers, contributions are summed in a fixed
 * order, and ties break on the canonical URL, so the same plan and the same pool always read the
 * same pages — on a slow afternoon as on a fast one.
 */

/**
 * The weights, and the arithmetic that fixes them.
 *
 * Authority is weighted rather than lexicographic. Lexicographic ordering — tier first, then
 * everything else — is what made an official page about parking regulations outrank an
 * institutional mirror of the actual syllabus: the tiers never met, so relevance never got a say.
 * But simply letting relevance compete would be the opposite failure, letting a search-optimised
 * page outrank the exam board's own site because its URL says "syllabus".
 *
 * So the two bounds are chosen deliberately, and the tiers are 10 apart:
 *
 * - every non-authority signal together is worth **at most 17** (6 coverage + 4 relevance +
 *   2 document type + 2 confirmations + 1 provider diversity + 2 version);
 * - **17 > 10**, so a strongly on-topic document climbs exactly one tier — an institutional mirror
 *   of the syllabus beats an official page that does not answer the question;
 * - **17 < 20**, so nothing climbs two — a secondary page can never overtake an official one,
 *   however syllabus-shaped its address, and a preparation blog never becomes an authority.
 *
 * That is the whole calibration, and the reranking test matrix pins both directions of it.
 * Changing any weight below without redoing this sum breaks one of the two guarantees.
 */
const AUTHORITY_STEP = 10;

/** What a candidate is worth for closing an objective nothing has closed yet. */
const COVERAGE_VALUE = { PRIMARY: 6, SUPPORTING: 3, NONE: 0 } as const;

/** Bounded bonus for independent discoverability. Never large enough to monopolise slots. */
const MAX_CONFIRMATION_BONUS = 2;
/** Two providers returning the same document is weak evidence it exists independently. */
const PROVIDER_DIVERSITY_BONUS = 1;
/** Cost of returning to a domain already read. Soft: diversity is a preference, not a rule. */
const SAME_DOMAIN_PENALTY = 3;
/** Bonus when the request named a year and the document states it. */
const VERSION_MATCH_BONUS = 2;

export interface SelectionContext {
  /** The target, for local authority classification. */
  target: AuthorityTarget;
  objectives: readonly ResearchObjective[];
  /** Objectives with no supporting answer yet — where a slot does the most good. */
  openObjectiveIds: ReadonlySet<string>;
  /** Domains already chosen in this run, with how many times. */
  chosenDomains: ReadonlyMap<string, number>;
  /** URLs that already failed to fetch in this run. */
  failedUrls: ReadonlySet<string>;
  /** URLs already read. Never re-read, in any round. */
  readUrls: ReadonlySet<string>;
  /** The year/version the request named, when it named one. */
  targetYear?: number | null;
}

export interface ScoredCandidate {
  entry: CandidatePoolEntry;
  score: number;
  /** Why it scored what it did, for tests and for the report. */
  parts: {
    authority: number;
    relevance: number;
    coverage: number;
    confirmations: number;
    providerDiversity: number;
    version: number;
    sameDomain: number;
  };
}

/** The year a document states, if the URL or title states one. */
function statedYear(entry: CandidatePoolEntry): number | null {
  const text = `${entry.url} ${entry.title ?? ""}`;
  const matches = text.match(/\b(20\d{2})\b/g);
  if (!matches) return null;
  // The most recent stated year is the one a "2026–2027 specification" means.
  return Math.max(...matches.map((match) => Number(match)));
}

/**
 * How much a candidate's own text overlaps the objective it would answer.
 *
 * Token overlap over the objective's question and the candidate's title/URL. Crude, and
 * deliberately so: it is deterministic, it needs no model call, and the phase specification is
 * explicit that a semantic reranker be added only if measurement shows this is insufficient. It
 * is scored 0–10 so it can climb exactly one authority step.
 */
function objectiveRelevance(entry: CandidatePoolEntry, objective: ResearchObjective | null): number {
  if (!objective) return 0;
  const haystack = `${entry.url.replace(/[_/.-]+/g, " ")} ${entry.title ?? ""} ${entry.snippet ?? ""}`.toLowerCase();
  const words = objective.question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  if (!words.length) return 0;
  const hits = words.filter((word) => haystack.includes(word)).length;
  // Capped at 4 so the whole relevance signal stays inside the calibration sum above.
  return Math.min(4, Math.round((hits / words.length) * 4));
}

/**
 * The best objective this candidate could answer, weighted by whether it is still open.
 *
 * The coverage credit is **gated on relevance**, and that gate is the difference between a working
 * selection and a broken one. A pool entry's `objectiveIds` record which query *found* it, which is
 * a fact about the query rather than about the page: an official page about parking regulations is
 * returned by a query for the syllabus objective and is attributed to it. Paying the full
 * "answers an open question" bonus to every attributed candidate gives that page the same credit as
 * the syllabus itself, and the read slot goes to whichever the provider happened to rank first.
 *
 * So the bonus is earned by showing some textual connection to the question. Relevance is still
 * counted separately, and still counted for a question that is already answered — a second good
 * document on a settled question is still worth reading.
 */
function objectiveValue(entry: CandidatePoolEntry, context: SelectionContext): { value: number; relevance: number } {
  const byId = new Map(context.objectives.map((objective) => [objective.id, objective]));
  let best = { value: COVERAGE_VALUE.NONE as number, relevance: 0 };
  // An empty `objectiveIds` means the candidate was found by a query the plan did not bind to an
  // objective — it can still be selected, but it earns no coverage credit for a question it did
  // not answer.
  for (const objectiveId of entry.objectiveIds.length ? entry.objectiveIds : [null]) {
    const objective = objectiveId ? (byId.get(objectiveId) ?? null) : null;
    const relevance = objectiveRelevance(entry, objective);
    const open = objectiveId ? context.openObjectiveIds.has(objectiveId) : false;
    const credit = objective && open && relevance > 0 ? COVERAGE_VALUE[objective.priority] : COVERAGE_VALUE.NONE;
    const value = credit + relevance;
    if (value > best.value || (value === best.value && relevance > best.relevance)) best = { value, relevance };
  }
  return best;
}

export function scoreCandidate(entry: CandidatePoolEntry, context: SelectionContext): ScoredCandidate {
  const source = classifySource(entry.url, context.target);
  const authorityRank = sourceTypeIsOfficial(source) ? 0 : source === "INSTITUTIONAL" ? 1 : source === "SECONDARY" ? 2 : 3;
  const authority = authorityRank * AUTHORITY_STEP;

  const { value: coverage, relevance } = objectiveValue(entry, context);

  // `confirmations` counts distinct queries, not distinct sources — see the corroboration note
  // in `pool.ts`. It is a discovery signal, so it is capped and small.
  const confirmations = Math.min(Math.max(entry.confirmations - 1, 0), MAX_CONFIRMATION_BONUS);
  const providerDiversity = entry.providers.length > 1 ? PROVIDER_DIVERSITY_BONUS : 0;

  const year = context.targetYear ? statedYear(entry) : null;
  const version = year !== null && context.targetYear !== null && year === context.targetYear ? VERSION_MATCH_BONUS : 0;

  const sameDomain = (context.chosenDomains.get(hostOfEntry(entry)) ?? 0) * SAME_DOMAIN_PENALTY;
  /**
   * Document-type relevance: a separate, weaker signal from objective overlap.
   *
   * It is what makes a specification PDF look more like the answer than a news item before the
   * question is even read. Clamped to 0..2 — a *penalty* from an administrative-looking path is
   * already expressed by poor objective relevance, and letting it go negative here would let a
   * bad-looking URL be punished twice and drift outside the calibration sum.
   */
  const documentType = Math.max(0, Math.min(2, Math.round(documentRelevance({ url: entry.url, title: entry.title }))));

  const score =
    authority - coverage - relevance - documentType - confirmations - providerDiversity + sameDomain - version;

  return {
    entry,
    score,
    parts: { authority, relevance, coverage, confirmations, providerDiversity, version, sameDomain },
  };
}

function hostOfEntry(entry: CandidatePoolEntry): string {
  try {
    return new URL(entry.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Choose the next pages to read, best marginal value first.
 *
 * Returns at most `slots` candidates. As each is chosen its objective is marked answered, so the
 * coverage bonus decays naturally across slots and the selection spreads across the plan's
 * questions rather than repeating one. A candidate that serves an objective already answered can
 * still win on authority and relevance — three official syllabus documents from one authority
 * really can be better than one official document plus a secondary page chosen for variety — so
 * diversity stays a bonus and a soft penalty rather than a constraint.
 */
export function selectSources(input: {
  pool: readonly CandidatePoolEntry[];
  context: SelectionContext;
  slots: number;
  /** Candidates to consider. The pool is bounded already; this bounds the scoring work. */
  consider?: number;
}): ScoredCandidate[] {
  const context = {
    ...input.context,
    // Mutable copies: selecting a slot consumes the objective it answered and records the domain
    // it came from, which is what makes the greedy step marginal rather than independent.
    chosenDomains: new Map(input.context.chosenDomains),
    openObjectiveIds: new Set(input.context.openObjectiveIds),
  } satisfies SelectionContext & {
    chosenDomains: Map<string, number>;
    openObjectiveIds: Set<string>;
  };
  const chosen: ScoredCandidate[] = [];
  /**
   * Read and failed candidates are both excluded, not merely penalised.
   *
   * Retrying is not offered inside a run, and the reason is empirical rather than dogmatic: the
   * failures this guards against are an authority's host refusing a non-browser client and a
   * request timing out, neither of which heals in ten seconds. Spending the remaining attempt
   * budget on the same URLs would rediscover the same refusal, so the budget goes to pages that
   * have not been tried. A genuinely transient failure is retried by *asking again*, which is a
   * new research operation with a fresh budget.
   */
  const remaining = input.pool
    .filter((entry) => !context.readUrls.has(entry.url) && !context.failedUrls.has(entry.url))
    .slice(0, input.consider ?? input.pool.length);
  const used = new Set<string>();

  for (let slot = 0; slot < input.slots; slot += 1) {
    let best: ScoredCandidate | null = null;
    for (const entry of remaining) {
      if (used.has(entry.url)) continue;
      const scored = scoreCandidate(entry, context);
      // Deterministic tie-break: total order on the canonical URL. Without it the winner would
      // depend on the pool's iteration order, which depends on query completion order — the
      // exact non-determinism Phase 1 built the plan-order merge to remove.
      if (best === null || scored.score < best.score || (scored.score === best.score && scored.entry.url < best.entry.url)) {
        best = scored;
      }
    }
    if (!best) break;
    used.add(best.entry.url);
    chosen.push(best);
    // The slot is spent: this objective is no longer open, and the domain is now represented.
    for (const objectiveId of best.entry.objectiveIds) context.openObjectiveIds.delete(objectiveId);
    const host = hostOfEntry(best.entry);
    context.chosenDomains.set(host, (context.chosenDomains.get(host) ?? 0) + 1);
  }

  return chosen;
}
