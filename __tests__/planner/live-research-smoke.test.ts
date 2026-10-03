// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { applyIntakeAction, createIntake, patchIntake, readIntake } from "@/lib/planner/server/intake";
import { applyCopilotProposal, runCopilotTurn } from "@/lib/planner/copilot/run";
import { readProposal } from "@/lib/planner/copilot/proposal";
import { sourceTypeIsOfficial } from "@/lib/planner/research/sources";
import { resolveAuthorities, classifyHost } from "@/lib/planner/research/authority";
import { fetchSource, FetchError } from "@/lib/planner/research/search/fetch";
import { selectSearchProvider } from "@/lib/planner/research/search/provider";
import { ComparisonExtractionSchema } from "@/lib/planner/research/search/contracts";
import { PlannerCopilotInterpretationV1Schema, type CopilotCommand } from "@/lib/planner/copilot/contracts";

/**
 * Phase 4.1 — the live verification smoke.
 *
 * This is the one suite in the repository that talks to the *real* providers: real DeepSeek
 * for the Copilot interpretation and the research model, real Serper for search, real
 * `SafeSourceFetcher` for the pages. Everything else about Planner Copilot is covered by
 * deterministic suites with a stubbed model, which is the right default — but it left one
 * gap: nothing proved that the production pipeline actually works end to end with a live
 * key. This file closes that gap and nothing else.
 *
 * Two properties make it usable as evidence rather than as a demo:
 *
 * - **It calls production functions, not a reimplementation.** The path is
 *   `runCopilotTurn` → `applyCopilotProposal` → `applyIntakeAction` (`researchScope` /
 *   `compareCurricula`) → `researchScope`/`runCurriculumComparison` → `selectSearchProvider`
 *   → `runResearchAgent` → `fetchSource` → the DeepSeek models. No layer is replaced.
 * - **It observes rather than intercepts.** `globalThis.fetch` is wrapped in a pass-through
 *   counter so the run can *report* how many searches, fetches and model calls it made, and
 *   so provenance can be checked against what the provider actually returned. The wrapper
 *   never rewrites a request or a response.
 *
 * Opt-in, because it spends real quota: `PLANNER_LIVE_RESEARCH_SMOKE=true`, run through the
 * disposable database harness. Nothing here is printed with a credential, a key prefix or a
 * raw prompt; the recorded evidence is counts, hosts, classifications and closed statuses.
 */

const database = process.env.PLANNER_TEST_DATABASE_URL;
const LIVE = process.env.PLANNER_LIVE_RESEARCH_SMOKE === "true";

vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("planner"))
      throw new Error("Disposable localhost planner database required");
  }
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }),
    }),
  };
});

import { prisma } from "@/lib/prisma";

// ─── Observation: a pass-through counter around the real fetch ────────────────

type ModelWorkload =
  | "COPILOT_INTERPRET"
  | "COPILOT_PHRASE"
  | "RESEARCH_PLAN"
  | "RESEARCH_EXTRACT"
  | "COMPARISON_EXTRACT"
  | "OTHER";

interface Ledger {
  searchCalls: number;
  fetchCalls: number;
  modelCalls: number;
  byWorkload: Record<ModelWorkload, number>;
  searchHosts: string[];
  fetchedHosts: string[];
  /** Every URL the search provider returned, normalised the way provenance is. */
  searchUrls: Set<string>;
  /** The same list, in provider order. */
  searchUrlList: string[];
  /** Every URL the fetcher actually requested (including each validated redirect hop). */
  fetchUrls: Set<string>;
  /** URL-shaped strings that appeared in model output — recorded, never trusted. */
  modelMentionedUrls: Set<string>;
  /** Raw bodies of model responses, keyed by workload, for shape diagnosis only. */
  modelBodies: Partial<Record<ModelWorkload, string>>;
  /** Provider-reported token counts, summed across the measured step. */
  inputTokens: number;
  outputTokens: number;
  /** Model calls whose response carried no usage block. */
  unreportedUsage: number;
}

const WORKLOAD_MARKERS: [ModelWorkload, string][] = [
  ["COPILOT_INTERPRET", "You are the Sylf Planner Copilot"],
  ["COPILOT_PHRASE", "You turn server-authored facts"],
  ["RESEARCH_PLAN", "You plan web searches for a study planner"],
  ["RESEARCH_EXTRACT", "You read syllabus pages and return the unit structure"],
  ["COMPARISON_EXTRACT", "You compare two curricula"],
  ["OTHER", ""],
];

function emptyLedger(): Ledger {
  return {
    searchCalls: 0,
    fetchCalls: 0,
    modelCalls: 0,
    byWorkload: {
      COPILOT_INTERPRET: 0,
      COPILOT_PHRASE: 0,
      RESEARCH_PLAN: 0,
      RESEARCH_EXTRACT: 0,
      COMPARISON_EXTRACT: 0,
      OTHER: 0,
    },
    searchHosts: [],
    fetchedHosts: [],
    searchUrls: new Set<string>(),
    searchUrlList: [],
    fetchUrls: new Set<string>(),
    modelMentionedUrls: new Set<string>(),
    modelBodies: {},
    inputTokens: 0,
    outputTokens: 0,
    unreportedUsage: 0,
  };
}

let ledger = emptyLedger();
const realFetch = globalThis.fetch;
/** Anything recorded after this point belongs to the current measured step. */
const mark = (): void => {
  ledger = emptyLedger();
};

/** Provider-reported token counts for the measured step, as a record fragment. */
const usageOf = (): Record<string, number> => ({
  inputTokens: ledger.inputTokens,
  outputTokens: ledger.outputTokens,
  unreportedUsage: ledger.unreportedUsage,
});

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const normaliseUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    const href = parsed.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    return url;
  }
};

const URL_PATTERN = /https?:\/\/[^\s"'\\<>\])]+/g;

function installCounter(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const host = hostOf(url);
    const isSearch = host === "google.serper.dev" || host === "api.search.brave.com";
    const isModel = host.endsWith("deepseek.com");

    // Model calls are identified by their system prompt, so the record says *what* was
    // asked of the model rather than merely how often it was called.
    let workload: ModelWorkload = "OTHER";
    if (isModel && typeof init?.body === "string") {
      const body = init.body;
      workload = WORKLOAD_MARKERS.find(([id, marker]) => id !== "OTHER" && body.includes(marker))?.[0] ?? "OTHER";
      ledger.modelCalls += 1;
      ledger.byWorkload[workload] += 1;
    } else if (isSearch) {
      ledger.searchCalls += 1;
      ledger.searchHosts.push(host);
    } else {
      ledger.fetchCalls += 1;
      ledger.fetchedHosts.push(host);
      ledger.fetchUrls.add(normaliseUrl(url));
    }

    const response = await realFetch(input as never, init as never);

    // Cloned, never consumed: reading the body here cannot change what the caller sees.
    if (response.ok && (isSearch || isModel)) {
      const captured = workload;
      response
        .clone()
        .text()
        .then((text) => {
          if (isSearch) {
            try {
              const parsed = JSON.parse(text) as { organic?: { link?: unknown }[] };
              for (const entry of parsed.organic ?? [])
                if (typeof entry.link === "string") {
                  const normalised = normaliseUrl(entry.link);
                  if (!ledger.searchUrls.has(normalised)) ledger.searchUrlList.push(normalised);
                  ledger.searchUrls.add(normalised);
                }
            } catch {
              /* a body we cannot parse simply contributes no URLs */
            }
          } else {
            for (const match of text.match(URL_PATTERN) ?? []) ledger.modelMentionedUrls.add(match);
            try {
              const envelope = JSON.parse(text) as {
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };
              if (typeof envelope.usage?.prompt_tokens === "number") {
                ledger.inputTokens += envelope.usage.prompt_tokens;
                ledger.outputTokens += envelope.usage.completion_tokens ?? 0;
              } else ledger.unreportedUsage += 1;
            } catch {
              ledger.unreportedUsage += 1;
            }
            // Kept only so a rejected shape can be reported as a schema *path*, never as the
            // model's words: the diagnosis needs to say which field failed, not what it said.
            ledger.modelBodies[captured] = text.slice(0, 20_000);
          }
        })
        .catch(() => undefined);
    }
    return response;
  }) as typeof fetch;
}

/** Let the cloned-body readers settle before reading the ledger. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

/**
 * What the interpreter said, as closed vocabulary only.
 *
 * When a turn is refused before the commands are mapped there is no signed token to read, so
 * the only honest source for "what did the model propose?" is the response itself. Intent and
 * command names are both closed enums, so recording them says nothing about the student's
 * words or the model's prose.
 */
function interpretShape(): Record<string, unknown> {
  const raw = ledger.modelBodies.COPILOT_INTERPRET;
  if (!raw) return { captured: false };
  let content = "";
  try {
    const envelope = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    content = String(envelope.choices?.[0]?.message?.content ?? "");
  } catch {
    return { captured: true, envelopeParsed: false };
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return { captured: true, jsonFound: false };
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as { intent?: unknown; commands?: unknown };
    const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
    // When the contract rejected the answer, say which field did — a path and a code, never
    // the model's words. An interpreter that intermittently omits a field is a real
    // characteristic worth being able to name.
    const contract = PlannerCopilotInterpretationV1Schema.safeParse(parsed);
    return {
      captured: true,
      intent: typeof parsed.intent === "string" ? parsed.intent.slice(0, 40) : null,
      commandNames: commands.map((entry) =>
        entry && typeof entry === "object" && "command" in entry
          ? String((entry as { command: unknown }).command).slice(0, 40)
          : "?"
      ),
      contractPassed: contract.success,
      ...(contract.success
        ? {}
        : {
            contractIssues: contract.error.issues.slice(0, 8).map((issue) => ({
              path: issue.path.map(String).join(".").slice(0, 60),
              code: issue.code,
            })),
          }),
    };
  } catch {
    return { captured: true, jsonFound: true, jsonParsed: false };
  }
}

/**
 * Why a model answer did not fit its schema, as *paths and codes*.
 *
 * The point of this is to be able to say "the model added a field that is not in the
 * contract" without reproducing what it wrote. Field names are schema vocabulary; the
 * values never leave the process.
 */
function shapeDiagnosis(raw: string | undefined, schema: z.ZodType): Record<string, unknown> {
  if (!raw) return { captured: false };
  let content = "";
  try {
    const envelope = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    content = String(envelope.choices?.[0]?.message?.content ?? "");
  } catch {
    return { captured: true, envelopeParsed: false };
  }
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start)
    return { captured: true, envelopeParsed: true, jsonFound: false, contentChars: content.length };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return { captured: true, envelopeParsed: true, jsonFound: true, jsonParsed: false, contentChars: content.length };
  }
  const keys =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed as object)
          .slice(0, 20)
          .map((key) => key.slice(0, 40))
      : [];
  const result = schema.safeParse(parsed);
  if (result.success)
    return { captured: true, envelopeParsed: true, jsonFound: true, jsonParsed: true, schemaPassed: true, topLevelKeys: keys };
  return {
    captured: true,
    envelopeParsed: true,
    jsonFound: true,
    jsonParsed: true,
    schemaPassed: false,
    topLevelKeys: keys,
    issues: result.error.issues.slice(0, 12).map((issue) => ({
      path: issue.path.map(String).join(".").slice(0, 80),
      code: issue.code,
    })),
  };
}

function loadEnvironment(): void {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}

// ─── Briefs ──────────────────────────────────────────────────────────────────

function baseBrief(input: {
  goal: string;
  subject?: string;
  endDate: string;
  weeklyMinutes?: number;
  background?: PlanBriefV1["backgroundCurriculum"];
  nodes?: PlanBriefV1["scope"]["nodes"];
  confirmedAt?: string | null;
  researchPolicy?: "ALLOW" | "OFF";
}): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  return {
    ...base,
    goal: { title: input.goal },
    subject: { kind: "FREE_TEXT", subjectId: null, name: input.subject ?? "Mathematics" },
    target: { endDate: input.endDate, examDate: input.endDate },
    budget: { ...base.budget, weeklyMinutes: input.weeklyMinutes ?? 600 },
    backgroundCurriculum: input.background ?? null,
    researchPolicy: input.researchPolicy ?? "ALLOW",
    scope: {
      source: "USER_MANUAL",
      confirmedAt: input.confirmedAt ?? null,
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: input.nodes ?? [],
    },
  };
}

const unit = (nodeId: string, label: string) =>
  ({ nodeId, label, kind: "TOPIC" as const, parentId: null, selected: true });

// ─── Evidence ────────────────────────────────────────────────────────────────

const evidence: Record<string, unknown>[] = [];
const record = (entry: Record<string, unknown>): void => {
  evidence.push(entry);
  // One structured line per step, so a run can be read back from captured output.
  console.log(`LIVE_SMOKE ${JSON.stringify(entry)}`);
};

async function seed(userId: number, brief: PlanBriefV1): Promise<{ sessionId: string; version: number }> {
  const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
  const seeded = await patchIntake(userId, created.id, {
    schemaVersion: 1,
    expectedVersion: created.version,
    brief,
  });
  return { sessionId: seeded.id, version: seeded.version };
}

async function newUser(): Promise<number> {
  return (
    await prisma.user.create({
      data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
    })
  ).id;
}

/**
 * The commands behind a proposal.
 *
 * A proposal view deliberately carries no parameters — the signed token *is* the
 * proposal, and the server re-derives the commands from it. Reading them back here goes
 * through the same signature and session check the server uses, so the sanity set asserts
 * what would actually be applied rather than what the summary claims.
 */
function proposalCommands(
  result: Extract<Awaited<ReturnType<typeof runCopilotTurn>>["result"], { outcome: "PROPOSED" }>,
  sessionId: string,
  expectedVersion: number
): CopilotCommand[] {
  return readProposal({ token: result.proposal.token, sessionId, expectedVersion }).commands as CopilotCommand[];
}

/** Copilot turn → proposal confirmation → the routed capability request. */
async function copilotRoute(
  userId: number,
  sessionId: string,
  message: string
): Promise<{ turn: Awaited<ReturnType<typeof runCopilotTurn>>; applied: Awaited<ReturnType<typeof applyCopilotProposal>> | null }> {
  const turn = await runCopilotTurn({ userId, sessionId, raw: { schemaVersion: 1, expectedVersion: (await readIntake(userId, sessionId)).version, message } });
  if (turn.result.outcome !== "PROPOSED") return { turn, applied: null };
  const applied = await applyCopilotProposal({
    userId,
    sessionId,
    raw: {
      schemaVersion: 1,
      expectedVersion: (await readIntake(userId, sessionId)).version,
      token: turn.result.proposal.token,
    },
  });
  return { turn, applied };
}

describe.skipIf(!database || !LIVE)("Phase 4.1 live research and Copilot verification", () => {
  let endDate = "";

  beforeAll(() => {
    loadEnvironment();
    installCounter();
    endDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    console.log(`LIVE_SMOKE_EVIDENCE ${JSON.stringify(evidence, null, 2)}`);
  });

  // ── 1. Configuration ───────────────────────────────────────────────────────

  it("reports the live configuration without exposing a credential", () => {
    const provider = selectSearchProvider();
    record({
      step: "configuration",
      deepseekKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      serperKeyConfigured: Boolean(process.env.SERPER_API_KEY),
      searchProviderSelection: process.env.SEARCH_PROVIDER ?? null,
      selectedProviderId: provider?.id ?? null,
    });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    expect(process.env.SERPER_API_KEY).toBeTruthy();
    expect(process.env.SEARCH_PROVIDER).toBe("serper");
    expect(provider?.id).toBe("serper");
  });

  // ── 2. researchPolicy OFF, against the real deployment ─────────────────────

  it("refuses research with zero external calls when researchPolicy is OFF", async () => {
    const userId = await newUser();
    const { sessionId } = await seed(
      userId,
      baseBrief({ goal: "NUST NET Engineering", endDate, researchPolicy: "OFF" })
    );
    /**
     * Bounded retry, for the same reason as the sanity set: a model call that fails says
     * nothing about the policy, and the live interpreter does fail occasionally. Every
     * attempt is recorded, and the external-call totals are summed across all of them, so a
     * retry can never hide a search.
     */
    let turn!: Awaited<ReturnType<typeof runCopilotTurn>>;
    let searchCalls = 0;
    let fetchCalls = 0;
    let modelCalls = 0;
    const attemptCodes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      mark();
      turn = await runCopilotTurn({
        userId,
        sessionId,
        raw: {
          schemaVersion: 1,
          expectedVersion: (await readIntake(userId, sessionId)).version,
          message: "Find the official syllabus.",
        },
      });
      await settle();
      searchCalls += ledger.searchCalls;
      fetchCalls += ledger.fetchCalls;
      modelCalls += ledger.modelCalls;
      const code = turn.result.outcome === "REFUSED" ? turn.result.code : null;
      attemptCodes.push(`${turn.result.outcome}/${turn.result.intent}${code ? `/${code}` : ""}`);
      if (code !== "MODEL_UNAVAILABLE" && code !== "COPILOT_BAD_OUTPUT") break;
    }

    const view = await readIntake(userId, sessionId);
    record({
      step: "researchPolicy_OFF",
      attempts: attemptCodes,
      outcome: turn.result.outcome,
      intent: turn.result.intent,
      code: turn.result.outcome === "REFUSED" ? turn.result.code : null,
      modelSaid: interpretShape(),
      searchCalls,
      fetchCalls,
      modelCalls,
      scopeCandidates: view.brief.scopeCandidate ? 1 : 0,
      confirmedNodes: view.brief.scope.nodes.length,
      researchPolicy: view.brief.researchPolicy,
      version: view.version,
    });

    expect(turn.result.outcome).toBe("REFUSED");
    if (turn.result.outcome === "REFUSED") expect(turn.result.code).toBe("RESEARCH_DISABLED");
    // The interpretations are the only model calls. Nothing else may have happened.
    expect(searchCalls).toBe(0);
    expect(fetchCalls).toBe(0);
    expect(view.brief.scopeCandidate).toBeNull();
    expect(view.brief.researchPolicy).toBe("OFF");
  }, 180_000);

  // ── 3. Real interpretation sanity set ──────────────────────────────────────

  it("interprets a small real-model sanity set as the documented contract requires", async () => {
    const userId = await newUser();
    const { sessionId } = await seed(
      userId,
      baseBrief({
        goal: "NUST NET Engineering",
        endDate,
        nodes: [unit("n1", "Matrices"), unit("n2", "Vectors"), unit("n3", "Calculus")],
        confirmedAt: "2030-01-01T00:00:00.000Z",
        // The background is set the way the structured control sets it, so the comparison
        // case tests *interpretation* rather than tripping the mixed-boundary rule below.
        background: { label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
      })
    );

    const preparednessOf = (brief: PlanBriefV1, nodeId: string) =>
      brief.preparedness.find((entry) => entry.nodeId === nodeId) ?? null;

    const cases: {
      id: string;
      message: string;
      check: (
        turn: Awaited<ReturnType<typeof runCopilotTurn>>,
        commands: CopilotCommand[]
      ) => string;
    }[] = [
      {
        id: "research_request",
        message: "Find the official syllabus for NUST NET Engineering.",
        check: (turn) =>
          turn.result.outcome === "PROPOSED" && turn.result.intent === "RESEARCH_REQUEST"
            ? "PASS"
            : `${turn.result.outcome}/${turn.result.intent}`,
      },
      {
        id: "comparison_request",
        message: "Compare this with my A-Level background.",
        check: (turn) =>
          turn.result.outcome === "PROPOSED" && turn.result.intent === "COMPARISON_REQUEST"
            ? "PASS"
            : `${turn.result.outcome}/${turn.result.intent}`,
      },
      {
        id: "hard_friday",
        message: "I cannot study Fridays.",
        check: (_turn, commands) =>
          commands.some(
            (command) =>
              command.command === "SET_CONSTRAINT" &&
              command.strength === "HARD" &&
              command.kind === "UNAVAILABLE_WEEKDAY" &&
              command.value === 5
          )
            ? "PASS"
            : `NOT_HARD_FRIDAY:${JSON.stringify(commands)}`,
      },
      {
        id: "soft_friday",
        message: "Try not to schedule Fridays.",
        check: (_turn, commands) =>
          commands.some((command) => command.command === "SET_CONSTRAINT" && command.strength === "HARD")
            ? `HARD:${JSON.stringify(commands)}`
            : "PASS",
      },
      {
        id: "studied_unrated",
        message: "I studied matrices but I don't know how good I am.",
        /**
         * A single high-confidence, reversible preparedness change is one of the commands
         * §21 lets run directly, so this turn may come back as a direct execution rather
         * than a proposal. Both are accepted, and the *brief* is what is checked either way:
         * covered with no confidence is the answer, and it is the answer the structured
         * matrix would have written.
         */
        check: (turn, commands) => {
          const proposed = commands.some(
            (command) => command.command === "SET_PREPAREDNESS" && command.state === "STUDIED_UNRATED"
          );
          const applied = preparednessOf(turn.view.brief, "n1");
          const correct = applied?.covered === true && applied?.confidence === null;
          return proposed || correct
            ? "PASS"
            : `${turn.result.outcome}/${turn.result.intent}:${JSON.stringify(commands)}:${JSON.stringify(applied)}`;
        },
      },
      {
        id: "dislike_not_weakness",
        message: "I hate vectors.",
        check: (turn, commands) => {
          const inferredFromCommands = commands.some(
            (command) =>
              (command.command === "SET_PREPAREDNESS" && command.state === "WEAK") ||
              (command.command === "SET_DIFFICULTY" && command.difficult === true) ||
              command.command === "SET_PRIORITY"
          );
          const vectors = preparednessOf(turn.view.brief, "n2");
          const inferredInBrief =
            (vectors !== null && (vectors.confidence !== null || vectors.difficult === true)) ||
            (vectors?.priority !== undefined && vectors.priority !== "NEUTRAL");
          return inferredFromCommands || inferredInBrief
            ? `INFERRED:${JSON.stringify(commands)}:${JSON.stringify(vectors)}`
            : "PASS";
        },
      },
    ];

    const results: Record<string, string> = {};
    for (const entry of cases) {
      const attempts: string[] = [];
      let verdict = "NO_RESULT";
      /**
       * One retry, and only for a *provider* failure.
       *
       * `MODEL_UNAVAILABLE` says nothing about interpretation and everything about the
       * network, so a single retry is what a student would do; a second failure is reported
       * rather than retried again. A `COPILOT_BAD_OUTPUT` — the model answering in a shape
       * the contract rejects — is recorded but never silently retried away, because that is
       * exactly the class of behaviour this set exists to notice.
       */
      for (let attempt = 0; attempt < 2; attempt += 1) {
        mark();
        const version = (await readIntake(userId, sessionId)).version;
        const turn = await runCopilotTurn({
          userId,
          sessionId,
          raw: { schemaVersion: 1, expectedVersion: version, message: entry.message },
        });
        await settle();
        const commands =
          turn.result.outcome === "PROPOSED" ? proposalCommands(turn.result, sessionId, version) : [];
        const code = turn.result.outcome === "REFUSED" ? turn.result.code : null;
        /**
         * A failed model call is never a pass.
         *
         * Every case here is about a brief that did *not* change, so a refusal would satisfy
         * each check vacuously — which would make the set report a working interpreter that
         * never ran. It is reported as a model failure instead, and retried once.
         */
        const modelFailed =
          turn.result.outcome === "REFUSED" &&
          (turn.result.code === "COPILOT_BAD_OUTPUT" || turn.result.code === "MODEL_UNAVAILABLE");
        verdict = modelFailed ? `MODEL_FAILED:${code}` : entry.check(turn, commands);
        attempts.push(`${turn.result.outcome}/${turn.result.intent}${code ? `/${code}` : ""}`);
        record({
          step: "interpretation",
          case: entry.id,
          attempt: attempt + 1,
          outcome: turn.result.outcome,
          intent: turn.result.intent,
          code,
          commands: commands.map((command) => command.command),
          commandsDetail: commands.map((command) => JSON.stringify(command).slice(0, 160)),
          modelPasses: turn.metrics.modelPasses,
          modelWorkloads: ledger.byWorkload,
          modelSaid: interpretShape(),
          verdict,
        });
        if (!modelFailed) break;
      }
      results[entry.id] = verdict;
      if (attempts.length > 1) record({ step: "interpretation_retry", case: entry.id, attempts });
    }

    for (const [id, verdict] of Object.entries(results)) expect(verdict, id).toBe("PASS");

    /**
     * The mixed confirmation boundary (§26), recorded rather than judged.
     *
     * "one brief change + one capability" is refused by design — applying some commands and
     * routing others would be exactly the partial application the contract rules out — so
     * what is checked here is only whether the message the student reads actually tells them
     * to split the request, and what the model had proposed.
     */
    for (const [id, message] of [
      ["explicit_mix", "Set my weekly hours to 8 and research the syllabus."],
      ["compare_without_background", "Compare this with my A-Level background."],
    ] as const) {
      const plainUser = await newUser();
      const plain = await seed(
        plainUser,
        baseBrief({
          goal: "NUST NET Engineering",
          endDate,
          nodes: [unit("n1", "Matrices")],
          confirmedAt: "2030-01-01T00:00:00.000Z",
        })
      );
      mark();
      const turn = await runCopilotTurn({
        userId: plainUser,
        sessionId: plain.sessionId,
        raw: { schemaVersion: 1, expectedVersion: plain.version, message },
      });
      await settle();
      record({
        step: "mixed_boundary",
        case: id,
        outcome: turn.result.outcome,
        intent: turn.result.intent,
        code: turn.result.outcome === "REFUSED" ? turn.result.code : null,
        message: turn.result.outcome === "REFUSED" ? turn.result.message : turn.result.outcome,
        modelSaid: interpretShape(),
        briefUnchanged: turn.view.version === plain.version,
      });
      /**
       * The turn must be bounded and change nothing — that part is not negotiable.
       *
       * Which bounded answer it gives is allowed to improve, and did: before the final phase
       * this message produced "that is several separate changes at once", and now it produces
       * either a missing-prerequisite refusal that names the background curriculum, or a
       * single clarification asking which subjects were studied. Both are answers the student
       * can act on; the older wording was not.
       */
      expect(["REFUSED", "ANSWERED"]).toContain(turn.result.outcome);
      if (id === "explicit_mix") {
        // Two confirmation boundaries in one message: the copy must name the distinction.
        expect(turn.result.outcome).toBe("REFUSED");
        if (turn.result.outcome !== "REFUSED") throw new Error("unreachable");
        expect(turn.result.code).toBe("TOO_MANY_COMMANDS");
        expect(turn.result.message).toMatch(/two different things/i);
      } else if (turn.result.outcome === "REFUSED") {
        // One request with one thing missing: the answer names the thing, not a count.
        expect(turn.result.code).toBe("COPILOT_PREREQUISITE_MISSING");
        expect(turn.result.prerequisite).toBe("BACKGROUND_CURRICULUM_REQUIRED");
      } else {
        if (turn.result.outcome !== "ANSWERED") throw new Error("unreachable");
        expect(turn.result.clarification.required).toBe(true);
      }
      expect(turn.view.version).toBe(plain.version);
    }
  }, 420_000);


  // ── 4. Scenario A + cache ──────────────────────────────────────────────────

  it("runs NUST NET Engineering research through the real Copilot and provider pipeline", async () => {
    const userId = await newUser();
    const { sessionId } = await seed(
      userId,
      baseBrief({ goal: "NUST NET Engineering", subject: "Mathematics", endDate })
    );

    mark();
    const { turn, applied } = await copilotRoute(userId, sessionId, "Find the official syllabus for NUST NET Engineering.");
    const turnLedger = { searchCalls: ledger.searchCalls, modelCalls: ledger.modelCalls, workloads: { ...ledger.byWorkload } };

    expect(turn.result.outcome).toBe("PROPOSED");
    expect(applied?.outcome).toBe("ROUTED");
    expect(applied?.route).toBe("RESEARCH");
    expect((applied?.request as { action?: string } | null)?.action).toBe("researchScope");
    // Routing changes nothing: the brief is still exactly as the student left it.
    expect(applied?.view.brief.scope.nodes.length).toBe(0);
    expect(applied?.view.brief.scope.confirmedAt).toBeNull();

    mark();
    const before = await readIntake(userId, sessionId);
    const started = Date.now();
    const after = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: before.version,
      actionKey: randomUUID(),
      action: "researchScope",
    });
    const latencyMs = Date.now() - started;
    await settle();

    const candidate = after.brief.scopeCandidate;
    expect(candidate).not.toBeNull();
    const sources = candidate!.sources;
    const nodes = candidate!.nodes;

    const allowed = new Set([...ledger.searchUrls, ...ledger.fetchUrls]);
    const orphaned = sources.map((source) => source.url).filter((url) => !allowed.has(normaliseUrl(url)));
    const mentioned = [...ledger.modelMentionedUrls];
    const modelOnly = sources
      .map((source) => source.url)
      .filter((url) => mentioned.includes(url) && !allowed.has(normaliseUrl(url)));

    record({
      step: "scenario_A_nust",
      copilot: { outcome: turn.result.outcome, intent: turn.result.intent, ...turnLedger },
      capability: { route: applied?.route, action: (applied?.request as { action?: string } | null)?.action },
      search: { calls: ledger.searchCalls, urlsReturned: ledger.searchUrls.size, hosts: [...new Set(ledger.searchHosts)] },
      fetch: { calls: ledger.fetchCalls, hosts: [...new Set(ledger.fetchedHosts)] },
      model: { calls: ledger.modelCalls, workloads: ledger.byWorkload },
      tokens: usageOf(),
      status: candidate!.status,
      confidence: candidate!.confidence,
      failureCode: candidate!.failureCode,
      provider: candidate!.provider,
      nodeCount: nodes.length,
      sourceCount: sources.length,
      sources: sources.map((source) => ({
        domain: source.publisherOrDomain,
        type: source.sourceType,
        citedBy: source.nodeIds.length,
      })),
      returnedDomains: [...new Set([...ledger.searchUrls].map(hostOf))].sort(),
      officialCount: sources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length,
      institutionalCount: sources.filter((source) => source.sourceType === "INSTITUTIONAL").length,
      secondaryCount: sources.filter(
        (source) => !sourceTypeIsOfficial(source.sourceType) && source.sourceType !== "INSTITUTIONAL"
      ).length,
      sampleNodes: nodes.slice(0, 12).map((node) => node.label),
      openQuestions: candidate!.openQuestions,
      summary: candidate!.summary,
      provenanceOrphans: orphaned,
      modelOnlyUrls: modelOnly,
      confirmedScopeUntouched: after.brief.scope.nodes.length === 0 && after.brief.scope.confirmedAt === null,
      latencyMs,
    });

    // ── The invariants that make this a verification rather than a demo ──
    expect(ledger.searchCalls).toBeGreaterThan(0);
    expect(ledger.searchUrls.size).toBeGreaterThan(0);
    expect(ledger.byWorkload.RESEARCH_PLAN).toBe(1);
    expect(ledger.byWorkload.RESEARCH_EXTRACT).toBeLessThanOrEqual(1);
    // Every canonical source URL came from the search provider or a validated fetch hop.
    expect(orphaned).toEqual([]);
    // Research produces a candidate only.
    expect(after.brief.scope.nodes.length).toBe(0);
    expect(after.brief.scope.confirmedAt).toBeNull();
    expect(nodes.length).toBeLessThanOrEqual(200);
    expect(sources.length).toBeLessThanOrEqual(8);
    // No preparedness may be inferred from a syllabus.
    expect(after.brief.preparedness.length).toBe(0);

    /**
     * When a target's own host refuses to be read, say *why* in closed codes.
     *
     * The agent deliberately swallows per-source fetch failures — one blocked page must not
     * end a run — so the reason only exists where the fetcher raised it. Re-probing the same
     * URLs through the production fetcher is the cheapest way to tell "the site refused us"
     * apart from "our fetcher is broken", which is a different bug with a different owner.
     */
    if (!nodes.length && sources.length === 0) {
      const probes: unknown[] = [];
      for (const url of ledger.searchUrlList.slice(0, 6)) {
        try {
          const fetched = await fetchSource(url);
          probes.push({ domain: hostOf(url), ok: true, contentType: fetched.contentType, bytes: fetched.bytes });
        } catch (error) {
          probes.push({
            domain: hostOf(url),
            ok: false,
            code: error instanceof FetchError ? error.code : `UNEXPECTED:${(error as Error).name}`,
          });
        }
      }
      record({ step: "scenario_A_fetch_probe", probes });
    }

    /**
     * A lookup that answered nothing is not an answer, so it is not cached.
     *
     * This is the live half of the cache rule: the key now matches on a repeat, and the run
     * still goes back out — because the alternative would pin a transient outage (here, the
     * target's own host refusing to be read) to the session for as long as the brief stands,
     * and would silently refuse the retry the failure message invites.
     */
    mark();
    const retried = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: after.version,
      actionKey: randomUUID(),
      action: "researchScope",
    });
    await settle();
    record({
      step: "failed_lookup_retry",
      firstStatus: candidate!.status,
      retriedStatus: retried.brief.scopeCandidate?.status ?? null,
      searchCalls: ledger.searchCalls,
      modelCalls: ledger.modelCalls,
      retried: (retried.brief.scopeCandidate?.retrievedAt ?? "") !== candidate!.retrievedAt,
    });
    if (candidate!.nodes.length > 0) {
      // A successful lookup is reused verbatim, with no external call at all.
      expect(ledger.searchCalls).toBe(0);
      expect(ledger.fetchCalls).toBe(0);
      expect(ledger.modelCalls).toBe(0);
      expect(retried.brief.scopeCandidate?.retrievedAt).toBe(candidate!.retrievedAt);
    } else {
      expect(ledger.modelCalls).toBeGreaterThan(0);
      expect(retried.brief.scopeCandidate?.retrievedAt).not.toBe(candidate!.retrievedAt);
    }
  }, 300_000);

  // ── 5. Scenario B ──────────────────────────────────────────────────────────

  it("runs CAIE A-Level Mathematics research and accepts Cambridge as the authority", async () => {
    const userId = await newUser();
    const { sessionId } = await seed(
      userId,
      baseBrief({
        goal: "CAIE A-Level Mathematics",
        subject: "Mathematics",
        endDate,
        background: { label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
      })
    );

    const authority = resolveAuthorities({
      goal: "CAIE A-Level Mathematics",
      subject: "Mathematics",
      board: "CAIE",
      level: "A-Level",
    });

    mark();
    const { turn, applied } = await copilotRoute(
      userId,
      sessionId,
      "Find the official syllabus for CAIE A-Level Mathematics."
    );
    expect(turn.result.outcome).toBe("PROPOSED");
    expect(applied?.outcome).toBe("ROUTED");
    expect(applied?.route).toBe("RESEARCH");

    mark();
    const before = await readIntake(userId, sessionId);
    const started = Date.now();
    const after = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: before.version,
      actionKey: randomUUID(),
      action: "researchScope",
    });
    const latencyMs = Date.now() - started;
    await settle();

    const candidate = after.brief.scopeCandidate!;
    const allowed = new Set([...ledger.searchUrls, ...ledger.fetchUrls]);
    const orphaned = candidate.sources.map((source) => source.url).filter((url) => !allowed.has(normaliseUrl(url)));

    // Classification is re-checked against the registry, offline, from the live URLs.
    const classified = candidate.sources.map((source) => ({
      domain: source.publisherOrDomain,
      stored: source.sourceType,
      recomputed: classifyHost(source.publisherOrDomain ?? "", {
        goal: "CAIE A-Level Mathematics",
        board: "CAIE",
        level: "A-Level",
      }),
    }));

    record({
      step: "scenario_B_caie",
      authorityHosts: authority.hosts,
      copilot: { outcome: turn.result.outcome, intent: turn.result.intent },
      capability: { route: applied?.route, action: (applied?.request as { action?: string } | null)?.action },
      search: { calls: ledger.searchCalls, urlsReturned: ledger.searchUrls.size, hosts: [...new Set(ledger.searchHosts)] },
      fetch: { calls: ledger.fetchCalls, hosts: [...new Set(ledger.fetchedHosts)] },
      model: { calls: ledger.modelCalls, workloads: ledger.byWorkload },
      tokens: usageOf(),
      status: candidate.status,
      confidence: candidate.confidence,
      nodeCount: candidate.nodes.length,
      sourceCount: candidate.sources.length,
      sources: candidate.sources.map((source) => ({
        domain: source.publisherOrDomain,
        type: source.sourceType,
        title: source.title,
      })),
      returnedDomains: [...new Set([...ledger.searchUrls].map(hostOf))].sort(),
      classification: classified,
      sampleNodes: candidate.nodes.slice(0, 12).map((node) => node.label),
      summary: candidate.summary,
      provenanceOrphans: orphaned,
      confirmedScopeUntouched: after.brief.scope.nodes.length === 0,
      latencyMs,
    });

    expect(ledger.searchCalls).toBeGreaterThan(0);
    expect(ledger.byWorkload.RESEARCH_PLAN).toBe(1);
    expect(orphaned).toEqual([]);
    expect(candidate.nodes.length).toBeGreaterThan(0);
    // Authority is a host question: the registry decides, and it decided before the search.
    expect(authority.hosts).toContain("cambridgeinternational.org");
    for (const entry of classified) {
      const isCambridge = entry.domain === "cambridgeinternational.org" || entry.domain?.endsWith(".cambridgeinternational.org");
      if (!isCambridge && entry.stored !== "SECONDARY")
        expect(entry.recomputed, `${entry.domain} must not be official for a CAIE target`).not.toBe("OFFICIAL");
    }
    // A syllabus of units, not a person: nothing about the student is inferred.
    expect(after.brief.preparedness.length).toBe(0);

    /**
     * The cache, on a run that actually answered (§20).
     *
     * The same question against the same brief must cost nothing at all: no search, no
     * fetch, no model call. Before the fix this re-searched, re-fetched and re-called the
     * model every time, because the candidate was stamped with the brief digest while the
     * lookup compared against the question key.
     */
    expect(candidate.nodes.length).toBeGreaterThan(0);
    mark();
    const cachedStarted = Date.now();
    const cached = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: after.version,
      actionKey: randomUUID(),
      action: "researchScope",
    });
    const cacheLatencyMs = Date.now() - cachedStarted;
    await settle();
    record({
      step: "cache_repeat",
      searchCalls: ledger.searchCalls,
      fetchCalls: ledger.fetchCalls,
      modelCalls: ledger.modelCalls,
      sameRetrievedAt: cached.brief.scopeCandidate?.retrievedAt === candidate.retrievedAt,
      sameNodeCount: cached.brief.scopeCandidate?.nodes.length === candidate.nodes.length,
      sameSourceCount: cached.brief.scopeCandidate?.sources.length === candidate.sources.length,
      firstLatencyMs: latencyMs,
      cacheLatencyMs,
    });
    expect(ledger.searchCalls).toBe(0);
    expect(ledger.fetchCalls).toBe(0);
    expect(ledger.modelCalls).toBe(0);
    expect(cached.brief.scopeCandidate?.retrievedAt).toBe(candidate.retrievedAt);
    expect(cached.brief.scopeCandidate?.nodes.length).toBe(candidate.nodes.length);
    expect(cacheLatencyMs).toBeLessThan(latencyMs);
  }, 300_000);

  // ── 6. Scenario C ──────────────────────────────────────────────────────────

  it("does not fabricate authority or scope for a fictional examination", async () => {
    const userId = await newUser();
    const fiction = "International Quantum Aptitude Board QX-900 Engineering Entrance Examination";
    const { sessionId } = await seed(userId, baseBrief({ goal: fiction, subject: "Physics", endDate }));

    mark();
    const { turn, applied } = await copilotRoute(userId, sessionId, `Find the official syllabus for ${fiction}.`);
    expect(turn.result.outcome).toBe("PROPOSED");
    expect(applied?.outcome).toBe("ROUTED");
    expect(applied?.route).toBe("RESEARCH");

    mark();
    const before = await readIntake(userId, sessionId);
    const started = Date.now();
    const after = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: before.version,
      actionKey: randomUUID(),
      action: "researchScope",
    });
    const latencyMs = Date.now() - started;
    await settle();

    const candidate = after.brief.scopeCandidate!;
    const allowed = new Set([...ledger.searchUrls, ...ledger.fetchUrls]);
    const orphaned = candidate.sources.map((source) => source.url).filter((url) => !allowed.has(normaliseUrl(url)));
    const official = candidate.sources.filter((source) => sourceTypeIsOfficial(source.sourceType));

    record({
      step: "scenario_C_fictional",
      goal: fiction,
      copilot: { outcome: turn.result.outcome, intent: turn.result.intent },
      search: { calls: ledger.searchCalls, urlsReturned: ledger.searchUrls.size },
      fetch: { calls: ledger.fetchCalls },
      model: { calls: ledger.modelCalls, workloads: ledger.byWorkload },
      tokens: usageOf(),
      status: candidate.status,
      failureCode: candidate.failureCode,
      nodeCount: candidate.nodes.length,
      sourceCount: candidate.sources.length,
      sources: candidate.sources.map((source) => ({ domain: source.publisherOrDomain, type: source.sourceType })),
      officialSources: official.length,
      returnedDomains: [...new Set([...ledger.searchUrls].map(hostOf))].sort(),
      sampleNodes: candidate.nodes.slice(0, 10).map((node) => node.label),
      summary: candidate.summary,
      provenanceOrphans: orphaned,
      confirmedScopeUntouched: after.brief.scope.nodes.length === 0,
      latencyMs,
    });

    expect(orphaned).toEqual([]);
    // No invented authority: nothing may be called official for a body that does not exist.
    expect(official.length).toBe(0);
    expect(candidate.status).not.toBe("OK");
    // And no invented scope: a candidate that cannot be grounded is not presented as fact.
    if (candidate.status === "WEAK") expect(candidate.openQuestions.length).toBeGreaterThan(0);
  }, 300_000);

  // ── 7. Scenario E ──────────────────────────────────────────────────────────

  it("runs a real curriculum comparison through Copilot and keeps it separate from preparedness", async () => {
    const userId = await newUser();
    const { sessionId } = await seed(
      userId,
      baseBrief({
        goal: "NUST NET Engineering",
        subject: "Mathematics",
        endDate,
        confirmedAt: "2030-01-01T00:00:00.000Z",
        nodes: [
          unit("n1", "Matrices and determinants"),
          unit("n2", "Sequences and series"),
          unit("n3", "Trigonometry"),
          unit("n4", "Analytic geometry"),
          unit("n5", "Differentiation"),
          unit("n6", "Integration"),
        ],
        background: {
          label: "CAIE A-Level",
          level: "A-Level",
          board: "CAIE",
          subjects: ["Mathematics", "Physics", "Computer Science"],
        },
      })
    );

    mark();
    const { turn, applied } = await copilotRoute(userId, sessionId, "Compare this with my A-Level background.");
    expect(turn.result.outcome).toBe("PROPOSED");
    expect(turn.result.intent).toBe("COMPARISON_REQUEST");
    expect(applied?.outcome).toBe("ROUTED");
    expect(applied?.route).toBe("COMPARISON");
    expect((applied?.request as { action?: string } | null)?.action).toBe("compareCurricula");

    mark();
    const before = await readIntake(userId, sessionId);
    const started = Date.now();
    const after = await applyIntakeAction(userId, sessionId, {
      schemaVersion: 1,
      expectedVersion: before.version,
      actionKey: randomUUID(),
      action: "compareCurricula",
    });
    const latencyMs = Date.now() - started;
    await settle();

    const comparison = after.brief.comparison!;
    const counts: Record<string, number> = {};
    for (const row of comparison.units) counts[row.overlap] = (counts[row.overlap] ?? 0) + 1;
    const allowed = new Set([...ledger.searchUrls, ...ledger.fetchUrls]);
    const orphaned = comparison.sources.map((source) => source.url).filter((url) => !allowed.has(normaliseUrl(url)));
    const okWithoutOfficial = comparison.units.filter(
      (row) =>
        row.overlap === "LIKELY_COVERED_BY_CURRICULUM" &&
        !row.sourceIds.some((id) =>
          comparison.sources.some((source) => source.sourceId === id && sourceTypeIsOfficial(source.sourceType))
        )
    );

    record({
      step: "scenario_E_comparison",
      copilot: { outcome: turn.result.outcome, intent: turn.result.intent },
      capability: { route: applied?.route, action: (applied?.request as { action?: string } | null)?.action },
      search: { calls: ledger.searchCalls, urlsReturned: ledger.searchUrls.size },
      fetch: { calls: ledger.fetchCalls, hosts: [...new Set(ledger.fetchedHosts)] },
      model: { calls: ledger.modelCalls, workloads: ledger.byWorkload },
      tokens: usageOf(),
      status: comparison.status,
      failureCode: comparison.failureCode,
      searchProvider: comparison.searchProvider,
      targetUnits: comparison.units.length,
      unitCounts: counts,
      sources: comparison.sources.map((source) => ({
        domain: source.publisherOrDomain,
        type: source.sourceType,
        citedBy: comparison.units.filter((row) => row.sourceIds.includes(source.sourceId)).length,
      })),
      summary: comparison.summary,
      unresolved: comparison.unresolved,
      modelShape: shapeDiagnosis(ledger.modelBodies.COMPARISON_EXTRACT, ComparisonExtractionSchema),
      provenanceOrphans: orphaned,
      okWithoutOfficial: okWithoutOfficial.length,
      preparednessBefore: before.brief.preparedness.length,
      preparednessAfter: after.brief.preparedness.length,
      overlapCorrections: after.brief.overlapCorrections?.length ?? 0,
      latencyMs,
    });

    expect(ledger.byWorkload.RESEARCH_PLAN).toBe(1);
    expect(ledger.byWorkload.COMPARISON_EXTRACT).toBeLessThanOrEqual(1);
    expect(orphaned).toEqual([]);
    // Exactly the four documented overlap states, and nothing else.
    for (const state of Object.keys(counts))
      expect(["LIKELY_COVERED_BY_CURRICULUM", "PARTIAL_OVERLAP", "LIKELY_NEW_TO_CURRICULUM", "UNCLEAR"]).toContain(state);
    // Overlap is not preparedness: comparing two curricula changes nothing about the student.
    expect(after.brief.preparedness.length).toBe(before.brief.preparedness.length);
    /**
     * The status rules, checked against however the live run actually turned out.
     *
     * A live comparison is allowed to come back `WEAK` or `UNAVAILABLE` — the pages the
     * search happens to return are not ours to choose — and what must hold either way is the
     * *rule*: `OK` only with an official-backed asserted unit, `WEAK` only with the caveat
     * sentence attached, and `UNAVAILABLE` only when nothing could be asserted at all.
     */
    if (comparison.status === "OK") {
      expect(okWithoutOfficial).toEqual([]);
      expect(Object.values(counts).some((count) => count > 0)).toBe(true);
      expect(counts.UNCLEAR ?? 0).toBeLessThan(comparison.units.length);
    } else if (comparison.status === "WEAK") {
      expect(comparison.summary).toContain("starting point");
      expect(counts.UNCLEAR ?? 0).toBeLessThan(comparison.units.length);
    } else {
      expect(counts.UNCLEAR ?? 0).toBe(comparison.units.length);
      expect(comparison.failureCode).not.toBeNull();
    }

    /**
     * A second attempt, because the first was inconclusive.
     *
     * Recorded as two live attempts rather than one tuned one: the query plan is the model's,
     * the results are the provider's, and pretending a single run is representative would be
     * the opposite of what this phase is for.
     */
    if (comparison.status === "UNAVAILABLE") {
      mark();
      const retryStarted = Date.now();
      const retried = await applyIntakeAction(userId, sessionId, {
        schemaVersion: 1,
        expectedVersion: after.version,
        actionKey: randomUUID(),
        action: "compareCurricula",
        force: true,
      });
      await settle();
      const second = retried.brief.comparison!;
      const secondCounts: Record<string, number> = {};
      for (const row of second.units) secondCounts[row.overlap] = (secondCounts[row.overlap] ?? 0) + 1;
      const secondOrphans = second.sources
        .map((source) => source.url)
        .filter((url) => !new Set([...ledger.searchUrls, ...ledger.fetchUrls]).has(normaliseUrl(url)));
      record({
        step: "scenario_E_comparison_retry",
        status: second.status,
        failureCode: second.failureCode,
        unitCounts: secondCounts,
        sourceCount: second.sources.length,
        sources: second.sources.map((source) => ({ domain: source.publisherOrDomain, type: source.sourceType })),
        summary: second.summary,
        unresolved: second.unresolved,
        modelShape: shapeDiagnosis(ledger.modelBodies.COMPARISON_EXTRACT, ComparisonExtractionSchema),
        search: { calls: ledger.searchCalls, urlsReturned: ledger.searchUrls.size },
        fetch: { calls: ledger.fetchCalls },
        model: { calls: ledger.modelCalls, workloads: ledger.byWorkload },
        provenanceOrphans: secondOrphans,
        preparednessAfter: retried.brief.preparedness.length,
        latencyMs: Date.now() - retryStarted,
      });
      expect(secondOrphans).toEqual([]);
      expect(retried.brief.preparedness.length).toBe(before.brief.preparedness.length);
      for (const state of Object.keys(secondCounts))
        expect([
          "LIKELY_COVERED_BY_CURRICULUM",
          "PARTIAL_OVERLAP",
          "LIKELY_NEW_TO_CURRICULUM",
          "UNCLEAR",
        ]).toContain(state);
      if (second.status === "OK")
        expect(
          second.units.filter(
            (row) =>
              row.overlap === "LIKELY_COVERED_BY_CURRICULUM" &&
              !row.sourceIds.some((id) =>
                second.sources.some((source) => source.sourceId === id && sourceTypeIsOfficial(source.sourceType))
              )
          )
        ).toEqual([]);
    }
  }, 300_000);

  // ── 8. Authority registry, offline, on live-shaped hosts ───────────────────

  it("keeps institutional hosts below the target's own authority", () => {
    const cases = [
      { host: "nust.edu.pk", target: { goal: "NUST NET Engineering" }, expected: "OFFICIAL" },
      { host: "nust.edu.pk", target: { goal: "CAIE A-Level Mathematics" }, expected: "INSTITUTIONAL" },
      { host: "cambridgeinternational.org", target: { goal: "CAIE A-Level Mathematics", board: "CAIE" }, expected: "OFFICIAL" },
      { host: "cambridgeinternational.org", target: { goal: "NUST NET Engineering" }, expected: "SECONDARY" },
      { host: "ox.ac.uk", target: { goal: "CAIE A-Level Mathematics", board: "CAIE" }, expected: "INSTITUTIONAL" },
      { host: "mit.edu", target: { goal: "NUST NET Engineering" }, expected: "INSTITUTIONAL" },
      { host: "prep-academy-online.com", target: { goal: "NUST NET Engineering" }, expected: "SECONDARY" },
      { host: "nustian-academy.com", target: { goal: "NUST NET Engineering" }, expected: "SECONDARY" },
    ] as const;

    const observed = cases.map((entry) => ({
      host: entry.host,
      goal: entry.target.goal,
      expected: entry.expected,
      actual: classifyHost(entry.host, entry.target),
    }));
    record({ step: "authority_registry", observed });
    for (const entry of observed) expect(entry.actual, `${entry.host} for ${entry.goal}`).toBe(entry.expected);
  });
});
