import "server-only";
import type { ResearchPlan, ResearchObjective } from "./search/contracts";

/**
 * Deterministic checks on a research plan's quality.
 *
 * Phase 2 built the planner and Phase 3 has to judge it. Judging it needs *something* measurable,
 * and the honest split is between what a rule can decide and what only the model can:
 *
 * - A rule can tell that "Learn more" is not a research objective, that two queries are the same
 *   words rearranged, and that a query contains a domain the authority registry never vouched for.
 *   Those are properties of the text.
 * - A rule cannot tell whether "What are the entry requirements for 2027?" is the *right* question
 *   for a given student. That is educational judgement, and this module deliberately does not attempt
 *   it — the phase specification says as much, and a ruleset that tried would be wrong in ways nobody
 *   could see.
 *
 * So everything here is narrow, explainable and reported rather than enforced by default. Where a
 * finding is acted on, the agent says so in its metrics; where it is merely observed, the corpus
 * counts it.
 */

/**
 * Words that carry no research intent on their own.
 *
 * Deliberately small and grammatical — articles, prepositions, and the verbs a model uses when it
 * has nothing to ask ("find", "research", "learn", "know"). Domain vocabulary such as "official",
 * "syllabus" or "requirements" is *not* here: those are exactly the words that make an objective
 * useful.
 */
const CONTENT_FREE_WORDS = new Set([
  "a", "about", "an", "and", "any", "are", "as", "at", "be", "by", "can", "do", "does", "find",
  "for", "from", "get", "how", "i", "in", "info", "information", "into", "is", "it", "its", "know",
  "learn", "like", "look", "looking", "me", "more", "my", "need", "of", "on", "or", "our", "out",
  "please", "research", "say", "see", "some", "tell", "that", "the", "their", "them", "then",
  "there", "these", "this", "to", "up", "us", "want", "was", "we", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Phrases that are content-free however long they are.
 *
 * A objective like "Research the exam and find information about it" has plenty of words and asks
 * nothing. These patterns catch that shape without pretending to understand the subject.
 */
const CONTENT_FREE_PATTERNS: RegExp[] = [
  /^\s*(learn|research|study|find|get|know|understand|look)\b[^?]*\b(more|about it|everything|anything|stuff|things)\b/i,
  /\b(find|get|gather|collect|search for)\s+(information|info|details|data|stuff)\b/i,
  /\b(more|further)\s+(information|details|research)\b/i,
  /\bgeneral\s+(information|overview|idea)\b/i,
];

/** The content words of a question, lowercased. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !CONTENT_FREE_WORDS.has(word));
}

/**
 * Is this objective decision-useful?
 *
 * The rule is "it names something a document could answer". Two content words is the floor — one is
 * usually a subject with no question attached — plus the content-free phrase check above. It is
 * deliberately permissive: a false negative (calling a good objective vague) would throw away real
 * research, while a false positive (passing a vague one) costs a wasted query and is visible in the
 * coverage result.
 */
export function objectiveIsDecisionUseful(question: string): boolean {
  if (CONTENT_FREE_PATTERNS.some((pattern) => pattern.test(question))) return false;
  return contentWords(question).length >= 2;
}

export interface ObjectiveQuality {
  id: string;
  question: string;
  useful: boolean;
  /** Set when the objective is judged not useful, saying which rule fired. */
  reason: "CONTENT_FREE_PHRASE" | "TOO_FEW_CONTENT_WORDS" | null;
  contentWords: number;
}

export function assessObjective(objective: ResearchObjective): ObjectiveQuality {
  const words = contentWords(objective.question);
  if (CONTENT_FREE_PATTERNS.some((pattern) => pattern.test(objective.question)))
    return { id: objective.id, question: objective.question, useful: false, reason: "CONTENT_FREE_PHRASE", contentWords: words.length };
  if (words.length < 2)
    return { id: objective.id, question: objective.question, useful: false, reason: "TOO_FEW_CONTENT_WORDS", contentWords: words.length };
  return { id: objective.id, question: objective.question, useful: true, reason: null, contentWords: words.length };
}

/**
 * A comparison key under which two queries are the same search.
 *
 * Word order is discarded and case, punctuation and whitespace are normalised, because
 * "NUST NET syllabus" and "syllabus, NUST NET" ask the same question of a search engine and would
 * return the same pages. Word order matters far less to a web search than to a sentence, which is
 * why the key sorts the tokens — and why "net nust syllabus engineering" is *not* collapsed against
 * "nust net syllabus", since the fourth word changes what is being asked for.
 */
export function queryKey(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
    .sort();
  return tokens.join(" ");
}

export interface QueryRedundancy {
  /** The queries to run: the first of each equivalent group, in plan order. */
  kept: { query: string; objectiveId: string; droppedObjectives: string[] }[];
  /** Queries removed because an equivalent one already appeared. */
  dropped: number;
  /** The objective of each dropped query, so its coverage attribution can be folded into the kept one. */
  mergedObjectiveIds: string[];
}

/**
 * Collapse queries that are the same search.
 *
 * Adaptive planning can produce eight queries where several are the same words in a different order,
 * and a duplicate costs a provider call, a share of the candidate pool and a slot in the pool's
 * confirmation counts — while looking like breadth. Deduplication happens **before** any provider
 * call, so a redundant query costs nothing at all.
 *
 * The objective bindings of dropped queries are returned rather than discarded: the retained query
 * answers those objectives too, since it is the same search, and a candidate it finds should still
 * be attributed to them. Losing that attribution would silently lower coverage for a question the
 * run did in fact look for.
 */
export function dedupeQueries(
  queries: readonly { query: string; objectiveId: string }[]
): QueryRedundancy {
  const seen = new Map<string, number>();
  const kept: QueryRedundancy["kept"] = [];
  const mergedObjectiveIds: string[] = [];
  let dropped = 0;

  for (const entry of queries) {
    const key = queryKey(entry.query);
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, kept.length);
      kept.push({ query: entry.query, objectiveId: entry.objectiveId, droppedObjectives: [] });
      continue;
    }
    dropped += 1;
    mergedObjectiveIds.push(entry.objectiveId);
    // The kept query now stands for this objective too, so the pool can attribute its results to it.
    if (!kept[existing].droppedObjectives.includes(entry.objectiveId))
      kept[existing].droppedObjectives.push(entry.objectiveId);
  }

  return { kept, dropped, mergedObjectiveIds };
}

/**
 * Domains a query names that the authority registry never vouched for.
 *
 * The planning prompt forbids inventing a domain and allows a `site:` filter only for a verified
 * authority host. This is the check that the instruction was followed — it reads the query text for
 * anything domain-shaped and reports the ones that are not on the allow-list, so "invented
 * authority" is a number in the corpus rather than an impression.
 */
export function inventedDomains(query: string, allowedHosts: readonly string[]): string[] {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase().replace(/^www\./, "")));
  const found = new Set<string>();
  // Domain-shaped tokens: at least one dot with plausible labels on both sides. Bare words like
  // "nust" are not domains — treating them as such would flag every abbreviation a student uses.
  for (const match of query.toLowerCase().matchAll(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)\b/g)) {
    const candidate = match[1].replace(/^www\./, "");
    if (allowed.has(candidate)) continue;
    // A file-like token ("spec.pdf", "9709.pdf") is a document, not a host.
    if (/\.(pdf|docx?|html?|aspx?|jsp)$/.test(candidate)) continue;
    found.add(candidate);
  }
  return [...found];
}

export interface PlanQuality {
  objectives: ObjectiveQuality[];
  usefulObjectives: number;
  vagueObjectives: number;
  /** Objectives whose question repeats an earlier one, under the same query-key normalisation. */
  duplicateObjectives: number;
  /** Queries removed as equivalent to an earlier one. */
  redundantQueries: number;
  queries: number;
  /** Queries naming a `site:` host the authority registry did not provide. */
  inventedAuthorityHosts: string[];
  /** True when no PRIMARY objective exists, so the run has no stated priority. */
  missingPrimaryObjective: boolean;
  /** Every query is bound to an objective the plan actually stated. */
  bindingsValid: boolean;
}

/** Assess a whole plan. Pure, deterministic, and safe to call on any parsed plan. */
export function assessPlanQuality(plan: ResearchPlan, authorityHosts: readonly string[]): PlanQuality {
  const objectives = plan.objectives.map(assessObjective);
  const objectiveIds = new Set(plan.objectives.map((objective) => objective.id));

  const questionKeys = new Set<string>();
  let duplicateObjectives = 0;
  for (const objective of plan.objectives) {
    const key = queryKey(objective.question);
    if (questionKeys.has(key)) duplicateObjectives += 1;
    else questionKeys.add(key);
  }

  const { dropped } = dedupeQueries(plan.queries);
  const invented = new Set<string>();
  for (const entry of plan.queries) for (const host of inventedDomains(entry.query, authorityHosts)) invented.add(host);

  return {
    objectives,
    usefulObjectives: objectives.filter((objective) => objective.useful).length,
    vagueObjectives: objectives.filter((objective) => !objective.useful).length,
    duplicateObjectives,
    redundantQueries: dropped,
    queries: plan.queries.length,
    inventedAuthorityHosts: [...invented],
    missingPrimaryObjective: !plan.objectives.some((objective) => objective.priority === "PRIMARY"),
    bindingsValid: plan.queries.every((entry) => objectiveIds.has(entry.objectiveId)),
  };
}
