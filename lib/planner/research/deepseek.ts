import "server-only";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { DEEPSEEK_MODELS } from "@/lib/ai/config";
import {
  QUERY_PURPOSES,
  RESEARCH_BOUNDS,
  RESEARCH_DEPTH_BUDGETS,
  ComparisonExtractionSchema,
  ResearchExtractionSchema,
  ResearchFollowupPlanSchema,
  ResearchPlanSchema,
  ResearchQueryPlanSchema,
  type ComparisonExtraction,
  type ResearchExtraction,
  type ResearchFollowupPlan,
  type ResearchPlan,
  type ResearchQueryPlan,
} from "./search/contracts";
import type { AuthorityTarget } from "./authority";
import type { ModelUsage, ResearchModel } from "./agent";
import type { ComparisonModel } from "./comparison";

/**
 * DeepSeek as the research brain.
 *
 * Two calls, both strict: plan the searches, then read the bounded page excerpts and
 * return a hierarchy. The model never sees a URL it can cite — the excerpts are labelled
 * with server-assigned `sourceId`s, and the output schema has no URL field — and it is
 * never told it can browse, because it cannot: searching is the application's job and
 * the model's only role is to decide *what to ask* and then *what the pages say*.
 *
 * Both prompts are deliberately explicit about what the model may not decide: whether a
 * source is real, whether it was fetched, whether a source is official, what the student
 * is ready for. Those are server concerns, and a model that volunteers an opinion on
 * them is ignored rather than obeyed.
 */

export class DeepSeekResearchError extends Error {
  constructor(
    public code:
      | "RESEARCH_MODEL_UNAVAILABLE"
      | "RESEARCH_MODEL_TIMEOUT"
      | "RESEARCH_MODEL_CANCELLED"
      | "RESEARCH_MODEL_BAD_OUTPUT",
    /**
     * Which fields failed validation, as schema paths and codes.
     *
     * A `RESEARCH_MODEL_BAD_OUTPUT` with no detail is nearly undiagnosable: it is the same code
     * whether the model returned prose instead of JSON or one nested array held a single element
     * where two were required, and the two need completely different responses. Names of our own
     * fields are structural rather than content, so this is safe to keep server-side and never
     * reaches a student.
     */
    public detail?: string
  ) {
    super(code);
    this.name = "DeepSeekResearchError";
  }
}

/** The failing paths of a Zod error, bounded. `issues` is Zod's own shape. */
function issueDetail(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; code: string }[] })?.issues;
  if (!Array.isArray(issues)) return "unknown";
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}:${issue.code}`)
    .join(",")
    .slice(0, 300);
}

const MODEL = DEEPSEEK_MODELS.planner;

/**
 * The reasoning budget, decided per pass and measured rather than assumed.
 *
 * A live DEEP run in Phase 2 billed **38 982 output tokens** for answers that are a few thousand
 * characters of JSON, and the research passes were the only bounded JSON calls in this repository
 * not passing `thinking: "disabled"`. The obvious fix — turn it off everywhere — was then measured
 * properly, by running the *same extraction over the same four pages* with reasoning on and off:
 *
 *                  off        on
 *   output tokens  3 199      14 836     (4.6x)
 *   latency        9.5 s      54.7 s     (5.8x)
 *   scope nodes    44         44         (identical)
 *   evidence       6 verified 8 verified (+33%)
 *
 * So reasoning buys no extra scope at all and *does* find meaningfully more verified evidence, while
 * costing 4.6x the tokens. That produces two different answers for two different passes:
 *
 * - **Planning is disabled.** `planResearch` and `planFollowUp` choose queries. The measurement above
 *   is about extraction, but the same shape applies: there is no evidence at stake in a query list,
 *   so deliberation buys nothing and costs latency on the critical path.
 * - **Extraction is enabled.** It is the pass that turns pages into verified claims, which is the
 *   product's whole promise, and §14 of the phase specification is explicit that evidence is not to
 *   be traded for seconds. A third fewer accepted claims is a worse plan, not a faster one.
 *
 * The net effect is still a large saving, because planning passes are small and extraction dominates.
 */
const PLANNING_THINKING = "disabled" as const;
const EXTRACTION_THINKING = "enabled" as const;

/** Strip fences and any prose around a JSON object, then parse strictly. */
function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT");
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT");
  }
}

async function ask(input: {
  system: string;
  user: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Whether the provider may spend tokens on hidden reasoning.
   *
   * Phase 2 left this unset, so every research model call ran at the provider's default and the
   * DEEP live run billed **38 982 output tokens** for answers that are a few thousand characters of
   * JSON. Reasoning tokens are billed as output and are not part of the answer, which makes them the
   * single largest avoidable cost in the pipeline.
   *
   * Every other bounded JSON call in this repository already passes `"disabled"` — the syllabus
   * compiler, the planner pipeline, the critic, the repair pass and the whole agent router — because
   * a call whose output shape is fixed by a schema has little to gain from deliberating and a great
   * deal to pay for it. The research passes are the same kind of call and now match them.
   *
   * The comparison pass deliberately does *not* set it: it classifies units against a curriculum
   * rather than filling a schema, this phase is not permitted to change comparison behaviour, and
   * its cost was not what was measured.
   */
  thinking?: "enabled" | "disabled";
}): Promise<{ parsed: unknown; usage: ModelUsage }> {
  // The caller's ceiling when it has one: the extraction pass at `DEEP` reads roughly twice the
  // text `STANDARD` does, and a single global ceiling sized for the shallower tier aborts it.
  const timeout = AbortSignal.timeout(input.timeoutMs ?? RESEARCH_BOUNDS.modelTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const adapter = LLMFactory.getAdapter("deepseek", MODEL);
  let response: { text?: string; content?: string; usage?: { promptTokens?: number; completionTokens?: number } };
  try {
    response = (await adapter.generateResponse(
      [{ role: "user", content: input.user }] as never,
      input.system,
      [],
      {
        signal,
        responseFormat: "json_object",
        temperature: 0.1,
        maxTokens: input.thinking === "disabled" ? 2048 : 32768,
        singleAttempt: true, telemetryStage: input.thinking === "disabled" ? "research_queries" : "research_extract",
        ...(input.thinking ? { thinking: input.thinking } : {}),
      } as never
    )) as never;
  } catch (error) {
    if (input.signal?.aborted) throw new DeepSeekResearchError("RESEARCH_MODEL_CANCELLED");
    if (error instanceof Error && /timeout|aborted/i.test(error.message))
      throw new DeepSeekResearchError("RESEARCH_MODEL_TIMEOUT");
    throw new DeepSeekResearchError("RESEARCH_MODEL_UNAVAILABLE");
  }
  const text = String(response.text ?? response.content ?? "");
  return {
    parsed: parseJson(text),
    usage: {
      inputTokens: response.usage?.promptTokens ?? null,
      outputTokens: response.usage?.completionTokens ?? null,
      calls: 1,
    },
  };
}

const PLAN_SYSTEM = `You plan web searches for a study planner. You do NOT search the web yourself and you must not pretend to.

Rules:
- Return 1 to 2 search queries, most specific first.
- Prefer the primary source: the examination authority's own specification or syllabus page.
- Aim at the document that lists what is studied: use wording such as "syllabus", "specification",
  "subject content", "curriculum" or "course content". Avoid wording that finds administrative
  pages — grade thresholds, notices, timetables, results or handbooks — because those are
  published by the same authority and say nothing about what a student has to cover.
- Never invent a domain. Only add a "site:" filter when a verified authority host is given to you below.
- Never include a URL anywhere in your answer.
- Aim the query at the official syllabus document: the unit, chapter and topic list a student must cover.
- If a follow-up query would only restate the first, return just one.

Answer with JSON only: {"queries":[{"query":"...","purpose":"OFFICIAL_SYLLABUS|OFFICIAL_EXAM_SCOPE|OFFICIAL_SPECIFICATION|ENTRY_REQUIREMENTS|SUBJECT_CONTENT|FOLLOW_UP"}]}`;

/**
 * The adaptive research plan: objectives first, then the queries that serve them.
 *
 * The order is the whole intervention. Asked for two queries, a model writes the two most
 * obvious ones and stops — and for a request like "A-level student preparing for NET
 * Engineering" the two most obvious queries both chase the syllabus, while the entry
 * requirements and the paper's actual subject list go unasked. Asked what it needs to
 * *establish*, the same model separates those into distinct questions, and the query count
 * then follows from the objectives rather than from a number in a prompt.
 *
 * The depth tiers are stated with their real ceilings, interpolated from
 * `RESEARCH_DEPTH_BUDGETS` so the prompt cannot drift from what the server enforces. The
 * model picks a tier; it never picks a budget.
 *
 * The opening sentence deliberately keeps the wording the comparison path's planner prompt
 * already used. Both prompts answer the same question — what should be searched for — and the
 * live verification harness tells them apart by reading the system prompt, so a fresh opening
 * line would have quietly reclassified every research plan as an unrecognised model call
 * without failing anything that touches the prompt directly.
 */
function planSystem(): string {
  const lookup = RESEARCH_DEPTH_BUDGETS.LOOKUP;
  const standard = RESEARCH_DEPTH_BUDGETS.STANDARD;
  const deep = RESEARCH_DEPTH_BUDGETS.DEEP;
  const purposes = QUERY_PURPOSES.join("|");
  return `You plan web searches for a study planner, and you direct them. You do NOT search the web yourself and you must not pretend to.

Step 1 — state what has to be established. Write the research objectives: the separate questions that
must be answered before the student's scope can be trusted. A request such as "I am an A-level student
preparing for NET Engineering" is not one question. It is at least: the examination's own published
scope, whether the board or the university is the authority, the entry requirements, and the subjects
the paper actually contains. Find the real questions; do not split one question into synonyms.
Give each objective an id "o1", "o2", ... in priority order.

Step 2 — choose one of three depths:
- LOOKUP: a single fact the student named precisely, answerable from one page. At most ${lookup.maxQueries} query. Use it for "which year is the 9709 syllabus for" and nothing larger.
- STANDARD: a curriculum, a specification or an exam scope that must be established from several angles. Up to ${standard.maxQueries} queries. This is the right depth for most requests: a syllabus, a specification, a set of entry requirements.
- DEEP: research the student will rely on for months, or a request whose answer genuinely needs several *different* kinds of document to be complete — the content, the assessment structure and the entry requirements together, or two qualifications being held side by side. Up to ${deep.maxQueries} queries, and it is the only depth that may search a second time for a question the first round could not answer, so it costs several times what STANDARD costs. Choose it when the request is explicitly broad or high-stakes, not merely because it sounds thorough. Never choose it for a single fact.

Never return more objectives than you have distinct questions for.

Step 3 — write the queries. One to three queries per objective is normal; do not pad. Each query must
name the objective it serves, by its id. Most specific first.

Rules for every query:
- Prefer the primary source: the examination authority's own specification, syllabus or prospectus page.
- Aim at the document that lists what is studied: use wording such as "syllabus", "specification",
  "subject content", "curriculum", "course content" or "entry requirements". Avoid wording that finds
  administrative pages — grade thresholds, notices, timetables, results or handbooks — because those
  are published by the same authority and say nothing about what a student has to cover.
- Vary the wording between queries instead of repeating one with small edits; a near-duplicate spends
  a search and returns the same pages.
- Never invent a domain. Only add a "site:" filter when a verified authority host is given to you below.
- Never include a URL anywhere in your answer.
- If one query genuinely settles everything, return one. Fewer well-aimed queries beat more.

Answer with JSON only:
{"depth":"LOOKUP|STANDARD|DEEP","objectives":[{"id":"o1","question":"...","priority":"PRIMARY|SUPPORTING"}],"queries":[{"query":"...","purpose":"${purposes}","objectiveId":"o1"}]}`;
}

export function deepseekModel(options: { thinking?: "enabled" | "disabled" } = {}): ResearchModel {
  /**
   * The thinking setting this instance uses.
   *
   * Exposed as a parameter purely so the cost of reasoning can be *measured* on identical input:
   * comparing two live runs that happened to make different numbers of model calls proves nothing
   * about reasoning tokens, and the phase specification is explicit that a claim of improvement must
   * not rest on intuition. Production callers pass nothing and get `RESEARCH_THINKING`.
   */
  const thinking = options.thinking;
  return {
    async planResearch({ target, removedLabels, authorityHosts, signal }) {
      const facts = [
        `Target: ${target.goal}`,
        target.subject ? `Subject: ${target.subject}` : null,
        target.board ? `Exam board or system: ${target.board}` : null,
        target.level ? `Level: ${target.level}` : null,
        target.country ? `Country: ${target.country}` : null,
        authorityHosts.length ? `Verified authority hosts you may use as site: filters: ${authorityHosts.join(", ")}` : null,
        removedLabels.length ? `The student already removed these units, do not search for them again: ${removedLabels.join(", ")}` : null,
      ].filter(Boolean);
      const { parsed, usage } = await ask({
        system: planSystem(),
        user: facts.join("\n"),
        signal,
        thinking: thinking ?? PLANNING_THINKING,
      });
      const plan = ResearchPlanSchema.safeParse(parsed);
      if (!plan.success) throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT", issueDetail(plan.error));
      return { plan: plan.data as ResearchPlan, usage };
    },

    async planQueries({ target, removedLabels, authorityHosts, signal }) {
      const facts = [
        `Target: ${target.goal}`,
        target.subject ? `Subject: ${target.subject}` : null,
        target.board ? `Exam board or system: ${target.board}` : null,
        target.level ? `Level: ${target.level}` : null,
        target.country ? `Country: ${target.country}` : null,
        authorityHosts.length ? `Verified authority hosts you may use as site: filters: ${authorityHosts.join(", ")}` : null,
        removedLabels.length ? `The student already removed these units, do not search for them again: ${removedLabels.join(", ")}` : null,
      ].filter(Boolean);
      const { parsed, usage } = await ask({ system: PLAN_SYSTEM, user: facts.join("\n"), signal, thinking: "disabled" });
      const plan = ResearchQueryPlanSchema.safeParse(parsed);
      if (!plan.success) throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT");
      return { plan: plan.data as ResearchQueryPlan, usage };
    },

    async extract({ target, sources, removedLabels, objectives, signal, timeoutMs }) {
      const listed = sources
        .map((source, index) => `[source ${index + 1}] id=${source.sourceId}\ntitle: ${source.title}\n${source.text}`)
        .join("\n\n---\n\n");
      const questions = objectives
        .map((objective) => `${objective.id} (${objective.priority}): ${objective.question}`)
        .join("\n");
      const user = [
        `Target: ${target.goal}`,
        target.board ? `Exam board or system: ${target.board}` : null,
        target.level ? `Level: ${target.level}` : null,
        removedLabels.length ? `Units the student already removed (leave them out): ${removedLabels.join(", ")}` : null,
        "",
        "The research objectives, by id:",
        questions,
        "",
        "The pages below are the only evidence you have. Cite a page only by its id.",
        "",
        listed,
      ]
        .filter((line) => line !== null)
        .join("\n");
      const { parsed, usage } = await ask({
        system: EXTRACT_SYSTEM,
        user,
        signal,
        timeoutMs,
        thinking: thinking ?? EXTRACTION_THINKING,
      });
      const extraction = ResearchExtractionSchema.safeParse(normaliseAdvisory(parsed));
      if (!extraction.success)
        throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT", issueDetail(extraction.error));
      // Claims are read leniently on purpose. They are *proposed* evidence, and the server
      // verifies each one against the fetched page before believing any of it; a malformed claim
      // is dropped there and counted, which is a better outcome than discarding a whole
      // extraction — including its usable scope — because one of thirty claims had a bad field.
      const resolved = extraction.data as ResearchExtraction & { evidence?: unknown };
      const claims = Array.isArray(resolved.evidence) ? resolved.evidence : [];
      return { extraction: extraction.data as ResearchExtraction, claims, usage };
    },

    async planFollowUp({ target, objectives, unresolved, askedQueries, removedLabels, signal, timeoutMs }) {
      const open = unresolved
        .map((entry) => `${entry.id} (${entry.priority}, currently ${entry.state}): ${entry.question}`)
        .join("\n");
      const all = objectives.map((entry) => `${entry.id}: ${entry.question}`).join("\n");
      const user = [
        `Target: ${target.goal}`,
        target.board ? `Exam board or system: ${target.board}` : null,
        target.level ? `Level: ${target.level}` : null,
        removedLabels.length ? `Units the student already removed: ${removedLabels.join(", ")}` : null,
        "",
        "The research questions, by id:",
        all,
        "",
        "These questions are still unanswered after the first round of searching:",
        open,
        "",
        "Queries already run, which must not be repeated:",
        askedQueries.length ? askedQueries.map((query) => `- ${query}`).join("\n") : "(none)",
      ]
        .filter((line) => line !== null)
        .join("\n");
      const { parsed, usage } = await ask({
        system: FOLLOWUP_SYSTEM,
        user,
        signal,
        timeoutMs,
        thinking: thinking ?? PLANNING_THINKING,
      });
      const plan = ResearchFollowupPlanSchema.safeParse(parsed);
      if (!plan.success)
        throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT", issueDetail(plan.error));
      return { plan: plan.data as ResearchFollowupPlan, usage };
    },
  };
}

/**
 * Repair the two advisory fields, and only those, before validation.
 *
 * Measured on a real run: a `DEEP` extraction came back with one malformed entry in `conflicts`,
 * and the strict schema threw the *entire* answer away — a perfectly good scope and its evidence
 * included, because the model had phrased one optional sentence list badly. That is the same
 * failure the earlier phases fixed in the Copilot envelope, and the same distinction applies here:
 *
 * - `scope` and `sourceMappings` carry the authority of the result — which units exist and which
 *   page supports them — and stay strict. A malformed one of those must fail the extraction.
 * - `unresolved` and `conflicts` are advisory prose for the student. A malformed entry in either is
 *   dropped and the rest is kept, because discarding a good scope to punish a bad sentence is a
 *   worse outcome than losing the sentence.
 *
 * Claims need no help: `evidence` is already deliberately untyped, and `buildLedger` is what
 * verifies it.
 */
function normaliseAdvisory(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const record = { ...(parsed as Record<string, unknown>) };

  const unresolved = Array.isArray(record.unresolved) ? record.unresolved : [];
  record.unresolved = unresolved
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 300))
    .slice(0, 5);

  const conflicts = Array.isArray(record.conflicts) ? record.conflicts : [];
  record.conflicts = conflicts
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const candidate = entry as { description?: unknown; sourceIds?: unknown };
      if (typeof candidate.description !== "string" || !candidate.description.trim()) return [];
      const ids = (Array.isArray(candidate.sourceIds) ? candidate.sourceIds : [])
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .slice(0, 4);
      // A conflict between fewer than two sources is not a conflict; a single-source "disagreement"
      // is the model being unsure, which is what `unresolved` is for.
      if (ids.length < 2) return [];
      return [{ description: candidate.description.trim().slice(0, 300), sourceIds: ids }];
    })
    .slice(0, 3);

  return record;
}

/**
 * The follow-up prompt: a few queries aimed at the questions that are still open.
 *
 * It is a separate prompt from the initial planner for a reason that is structural rather than
 * stylistic. The initial planner decides *what the research is about*; this one may only decide
 * how to look again at a question that already exists. Restating the objectives, changing the
 * depth, or asking for another round are things this prompt does not offer and the schema cannot
 * express — which is what keeps "at most one follow-up round" a property of the contract rather
 * than a promise in a comment.
 */
const FOLLOWUP_SYSTEM = `You direct a second, final round of web searching for a study planner. You do NOT search the web yourself.

The first round of searches did not answer some questions. Your only job is to write a few better-aimed
queries for those specific questions.

Rules:
- Only write queries for the unanswered questions listed. Do not write queries about anything else.
- Every query must name the unanswered question ids it targets, using their exact ids.
- Do not repeat or lightly reword a query that has already been run. If a query failed, change the
  approach: different wording, a different document type, or a more specific official document name.
- Fewer, better queries are worth more than many. At most ${RESEARCH_BOUNDS.maxFollowUpQueries}.
- Prefer the primary source: the examination authority's own specification, syllabus or prospectus.
- Aim at the document that would answer that question — "entry requirements", "subject content",
  "specification", "curriculum" — and avoid administrative pages such as notices or timetables.
- Never invent a domain. Never include a URL anywhere in your answer.
- If no query could plausibly answer an unanswered question, return only the queries that could.

Answer with JSON only:
{"queries":[{"query":"...","purpose":"${QUERY_PURPOSES.join("|")}","objectiveIds":["o2"]}]}`;

const EXTRACT_SYSTEM = `You read syllabus pages and return the unit structure a student must cover, plus the evidence that supports it.
Rules:
- Use only the pages given to you. If they do not contain a scope, return an empty scope array.
- Never output a URL, a domain or a source name in any field. Cite sources only by the id given on each page.
- Build a hierarchy: SECTION contains CHAPTER contains TOPIC. Reference a parent by its index in your own scope array, or null for a top-level unit.
- Use the document's own wording for labels; do not invent or translate units.
- Do not judge the student: never output preparedness, confidence, priority, mastery or difficulty. You do not know them.
- If two pages disagree about the scope, add an entry to "conflicts" naming both ids rather than choosing one.
- List anything you could not establish in "unresolved", as a short sentence.

Evidence rules — these are checked by the server, and evidence that fails is discarded:
- "evidence" is a list of what the pages actually establish, one entry per fact, about the specific
  numbered research questions you were given.
- "excerpt" MUST be copied character for character from the page text above. Do not retype it, do not
  summarise it, do not fix its spelling or punctuation, and do not join two separate sentences into
  one. The server looks for your excerpt inside the page and throws the claim away if it is not there.
  Choose a span of one or two complete sentences, at least about ten words long.
- "statement" is your one-sentence paraphrase of what that excerpt means. It may be in your own words.
- "objectiveId" is the id of the research question this evidence answers, exactly as given.
- "sourceId" is the id of the page the excerpt came from, exactly as given. An excerpt from one page
  attributed to another is discarded.
- "evidenceKind" is DIRECT when the page states the fact outright, INDIRECT when it only implies it.
- "support" is SUPPORTS when the page backs the statement, PARTIAL when it backs only part of it, and
  CONTRADICTS when the page disagrees with what other pages say about the same question. Use
  CONTRADICTS only for a real disagreement between documents, never for your own uncertainty.
- "documentDate" is the version or publication date the page states, copied from it. Use null when the
  page does not state one. Never guess a year.
- If a question has no support in any of these pages, write no evidence for it. An empty answer is
  correct and expected; invented support is not.

Answer with JSON only:
{"targetIdentity":{"name":"...","institution":null,"board":null,"level":null},"scope":[{"label":"...","kind":"SECTION|CHAPTER|TOPIC","parentIndex":null}],"sourceMappings":[{"nodeIndexes":[0],"sourceIds":["..."]}],"unresolved":[],"extractionConfidence":"HIGH|MEDIUM|LOW","conflicts":[],"evidence":[{"objectiveId":"o1","sourceId":"...","statement":"...","excerpt":"...","evidenceKind":"DIRECT|INDIRECT","support":"SUPPORTS|PARTIAL|CONTRADICTS","documentDate":null}]}`;

/**
 * The comparison model: the same DeepSeek adapter, told a different job.
 *
 * It shares `planQueries` with the scope research — deciding what to look up is the
 * same task whether the answer is a syllabus or a background curriculum — and adds one
 * pass that reads the pages and classifies each *confirmed* target unit against them.
 *
 * The prompt states the two things this pass must not do, because both would be
 * invisible in the output: nothing about the student (preparedness, confidence,
 * mastery, difficulty, priority are not fields, and it is told not to reason about
 * them), and nothing about sources it was not given (no URL field exists, and citations
 * are ids from the page list).
 */
export function deepseekComparisonModel(): ComparisonModel {
  return {
    planQueries: deepseekModel().planQueries,

    async compare({ target, background, targetUnits, sources, signal }) {
      const listed = sources
        .map((source, index) => `[source ${index + 1}] id=${source.sourceId}\ntitle: ${source.title}\n${source.text}`)
        .join("\n\n---\n\n");
      const units = targetUnits
        .map((unit, index) => `${index + 1}. ref=${unit.unitRef} | ${unit.path.length ? `${unit.path.join(" > ")} > ` : ""}${unit.label}`)
        .join("\n");
      const user = [
        `What the student is preparing for: ${target.goal}`,
        background.subject ? `Background subjects: ${background.subject}` : null,
        background.board ? `Background board or system: ${background.board}` : null,
        background.level ? `Background level: ${background.level}` : null,
        "",
        "The pages below are the background curriculum the student studied. They are the only evidence you have. Cite a page only by its id.",
        "",
        listed,
        "",
        "---",
        "The units the student must cover for the target, each with its own reference:",
        units,
        "",
        "Classify every one of those units against the background curriculum above.",
      ]
        .filter((line) => line !== null)
        .join("\n");
      const { parsed, usage } = await ask({ system: COMPARE_SYSTEM, user, signal, thinking: "enabled" });
      const comparison = ComparisonExtractionSchema.safeParse(parsed);
      if (!comparison.success) throw new DeepSeekResearchError("RESEARCH_MODEL_BAD_OUTPUT");
      return { comparison: comparison.data as ComparisonExtraction, usage };
    },
  };
}

const COMPARE_SYSTEM = `You compare two curricula: what a student studied before, and what they must now cover.

You compare DOCUMENTED CONTENT only. You are not assessing the student.

Rules:
- Use only the pages given to you. If they do not settle a unit, that unit is UNCLEAR.
- Never judge the student. Do not reason about, mention or imply how well they know anything; never output preparedness, confidence, mastery, difficulty, priority or readiness. You do not know them and those fields do not exist here.
- Never output a URL, a domain or a source name in any field. Cite sources only by the id on each page.
- Classify EVERY unit in the list you were given, using its exact ref. Copy the ref character for character.
- overlap is one of: LIKELY_COVERED_BY_CURRICULUM (the topic, or something clearly the same thing, is in the background curriculum), PARTIAL_OVERLAP (part of it is), LIKELY_NEW_TO_CURRICULUM (it is not), UNCLEAR (the pages do not settle it).
- explanationCode is one of: BACKGROUND_TOPIC_MATCH, BACKGROUND_PARTIAL_MATCH, NOT_IN_BACKGROUND_CURRICULUM, EVIDENCE_INCONCLUSIVE, NO_BACKGROUND_EVIDENCE.
- Any answer other than UNCLEAR must cite at least one source id that actually supports it. An answer you cannot cite will be discarded.
- confidence is HIGH only when a page states the topic explicitly and unambiguously, MEDIUM when it is clear but paraphrased, LOW otherwise.
- backgroundUnits: list the background curriculum's own unit headings you read, verbatim, up to 120.
- Put anything you could not establish in "unresolved", as a short sentence.

Answer with JSON only:
{"backgroundUnits":[{"label":"..."}],"units":[{"unitRef":"...","overlap":"LIKELY_COVERED_BY_CURRICULUM|PARTIAL_OVERLAP|LIKELY_NEW_TO_CURRICULUM|UNCLEAR","confidence":"HIGH|MEDIUM|LOW","sourceIds":["..."],"explanationCode":"BACKGROUND_TOPIC_MATCH|BACKGROUND_PARTIAL_MATCH|NOT_IN_BACKGROUND_CURRICULUM|EVIDENCE_INCONCLUSIVE|NO_BACKGROUND_EVIDENCE"}],"unresolved":[],"comparisonConfidence":"HIGH|MEDIUM|LOW"}`;
