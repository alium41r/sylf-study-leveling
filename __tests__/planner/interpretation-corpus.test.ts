// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";
import { createIntake, patchIntake, readIntake } from "@/lib/planner/server/intake";
import {
  PlannerCopilotInterpretationV1Schema,
  type CopilotCommand,
  type PlannerCopilotContextV1,
  type PlannerCopilotInterpretationV1,
} from "@/lib/planner/copilot/contracts";
import type { CopilotModel } from "@/lib/planner/copilot/model";

/**
 * The real-DeepSeek interpretation corpus (Phase 5, workstream E).
 *
 * The deterministic suites stub the model and test what the *server* does with an
 * interpretation. This file is the opposite and deliberately so: it asks the production model
 * to read synthetic student messages and reports what it actually produced — including its
 * failures, which are the only reason the file exists.
 *
 * What it measures, per §24, and always separately:
 *
 * - **contract-valid rate**: did the answer parse at all?
 * - **first-pass vs eventual**: a retry is never counted as a first-pass success.
 * - **intent correctness**, **hard-versus-soft accuracy**, **clarification appropriateness**,
 *   **false mutation proposals** and **unsupported inference** — the four ways a planner model
 *   can be confidently wrong.
 *
 * Opt-in, because it spends real quota: `PLANNER_INTERPRETATION_CORPUS=true`, run through the
 * disposable database harness. It writes its measurements to
 * `planner-phase5-corpus-results.json` so the report cites numbers rather than impressions, and
 * it never prints a secret. The phrases are synthetic; no student text is involved.
 */

const database = process.env.PLANNER_TEST_DATABASE_URL;
const LIVE = process.env.PLANNER_INTERPRETATION_CORPUS === "true";

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
      adapter: new PrismaPg({ connectionString: url ?? "postgresql://unused/unused" }),
    }),
  };
});

import { prisma } from "@/lib/prisma";

// ─── The corpus ──────────────────────────────────────────────────────────────

/**
 * One case: what the student typed, and what a correct answer has to be.
 *
 * `expect` is written as a predicate over the decoded commands rather than as an exact shape,
 * because there is usually more than one right way to say a thing and pinning the wording would
 * be overfitting to the model rather than testing the contract.
 */
interface CorpusCase {
  id: string;
  /** §21's categories, so the report can say what was covered and what was not. */
  category: string;
  message: string;
  /** The intents any of which is a correct reading. Empty means "any intent is acceptable". */
  intents?: string[];
  check?: (commands: CopilotCommand[]) => string;
}

const id = (command: CopilotCommand): string => command.command;
const constraints = (commands: CopilotCommand[]) =>
  commands.filter((command): command is Extract<CopilotCommand, { command: "SET_CONSTRAINT" }> =>
    command.command === "SET_CONSTRAINT"
  );
/**
 * "No more than eight hours a week", in either of the contract's two spellings.
 *
 * The command union deliberately offers a weekly figure as a *target* with a `hard` flag rather
 * than a separate command, so a checker that only looked for a `SET_CONSTRAINT` would report a
 * correct answer as a failure — which is exactly what the first run of this corpus did.
 */
const spellsHardWeekly = (commands: CopilotCommand[]): boolean =>
  commands.some(
    (command) =>
      (command.command === "SET_WEEKLY_HOURS" && command.hard === true) ||
      (command.command === "SET_CONSTRAINT" &&
        command.kind === "MAX_WEEKLY_MINUTES" &&
        command.strength === "HARD")
  );

const prepared = (commands: CopilotCommand[]) =>
  commands.filter((command): command is Extract<CopilotCommand, { command: "SET_PREPAREDNESS" }> =>
    command.command === "SET_PREPAREDNESS"
  );

const CORPUS: CorpusCase[] = [
  // A — weekly capacity (a target, never a limit)
  {
    id: "weekly_target_about",
    category: "A_WEEKLY_CAPACITY",
    message: "I can do about 8 hours a week.",
    check: (commands) => {
      const hard = constraints(commands).filter((c) => c.strength === "HARD");
      const weekly = commands.find(
        (c) =>
          c.command === "SET_WEEKLY_HOURS" ||
          (c.command === "SET_CONSTRAINT" && c.kind === "MAX_WEEKLY_MINUTES")
      );
      if (!weekly) return `NO_WEEKLY_COMMAND:${commands.map(id).join(",")}`;
      // The contract has two ways to say "8 hours a week": a target, and the same figure with
      // `hard: true`. Either spelling is correct here — what must not happen is the *target*
      // wording arriving as a hard maximum.
      const spelledHard =
        (weekly.command === "SET_WEEKLY_HOURS" && weekly.hard === true) ||
        (weekly.command === "SET_CONSTRAINT" && weekly.strength === "HARD");
      return spelledHard ? "TREATED_TARGET_AS_HARD" : "PASS";
    },
  },
  {
    id: "weekly_target_should_be_enough",
    category: "A_WEEKLY_CAPACITY",
    message: "8 hours should be enough.",
    check: (commands) => {
      const weekly = commands.find(
        (c) =>
          c.command === "SET_WEEKLY_HOURS" ||
          (c.command === "SET_CONSTRAINT" && c.kind === "MAX_WEEKLY_MINUTES")
      );
      const spelledHard =
        weekly?.command === "SET_WEEKLY_HOURS" && weekly.hard === true
          ? true
          : constraints(commands).some((c) => c.kind === "MAX_WEEKLY_MINUTES" && c.strength === "HARD");
      return spelledHard ? "TREATED_TARGET_AS_HARD" : "PASS";
    },
  },
  {
    id: "weekly_target_give_me",
    category: "A_WEEKLY_CAPACITY",
    message: "give me like 8 hours a week",
    check: (commands) =>
      commands.some((c) => c.command === "SET_WEEKLY_HOURS") ||
      constraints(commands).some((c) => c.kind === "MAX_WEEKLY_MINUTES")
        ? "PASS"
        : `NO_WEEKLY_COMMAND:${commands.map(id).join(",")}`,
  },
  {
    id: "weekly_target_make_it",
    category: "A_WEEKLY_CAPACITY",
    message: "make it 8 hours a week",
    check: (commands) =>
      commands.some((c) => c.command === "SET_WEEKLY_HOURS") ||
      constraints(commands).some((c) => c.kind === "MAX_WEEKLY_MINUTES")
        ? "PASS"
        : `NO_WEEKLY_COMMAND:${commands.map(id).join(",")}`,
  },
  // B — a hard weekly maximum
  {
    id: "weekly_hard_absolutely",
    category: "B_HARD_WEEKLY_MAXIMUM",
    message: "I absolutely cannot exceed 8 hours a week.",
    check: (commands) => (spellsHardWeekly(commands) ? "PASS" : `NOT_HARD:${JSON.stringify(commands)}`),
  },
  {
    id: "weekly_hard_max",
    category: "B_HARD_WEEKLY_MAXIMUM",
    message: "max 8 hrs a week, that's a hard limit",
    check: (commands) => (spellsHardWeekly(commands) ? "PASS" : `NOT_HARD:${JSON.stringify(commands)}`),
  },
  // C/D — session preference and hard session maximum
  {
    id: "session_prefer_45",
    category: "C_SESSION_PREFERENCE",
    message: "I prefer 45 minute sessions.",
    check: (commands) => {
      const hard = constraints(commands).some((c) => c.strength === "HARD" && c.kind === "MAX_SESSION_MINUTES");
      return hard ? "PREFERENCE_MADE_HARD" : "PASS";
    },
  },
  {
    id: "session_hard_90",
    category: "D_HARD_SESSION_MAXIMUM",
    message: "I can never study longer than 90 minutes at once.",
    check: (commands) =>
      constraints(commands).some((c) => c.kind === "MAX_SESSION_MINUTES" && c.strength === "HARD" && c.value === 90)
        ? "PASS"
        : `NOT_HARD_90:${JSON.stringify(commands)}`,
  },
  // E/F — weekdays
  {
    id: "friday_hard_variants",
    category: "E_UNAVAILABLE_WEEKDAY",
    message: "pls no fri",
    check: (commands) => {
      const friday = constraints(commands).filter(
        (c) => c.kind === "UNAVAILABLE_WEEKDAY" && c.value === 5 && c.strength === "HARD"
      );
      return friday.length ? "PASS" : `NOT_HARD_FRIDAY:${JSON.stringify(commands)}`;
    },
  },
  {
    id: "friday_hard_impossible",
    category: "E_UNAVAILABLE_WEEKDAY",
    message: "Friday's impossible for me.",
    check: (commands) =>
      constraints(commands).some((c) => c.kind === "UNAVAILABLE_WEEKDAY" && c.value === 5 && c.strength === "HARD")
        ? "PASS"
        : `NOT_HARD_FRIDAY:${JSON.stringify(commands)}`,
  },
  {
    id: "friday_soft_try_not",
    category: "F_SOFT_WEEKDAY_AVOIDANCE",
    message: "Try not to put stuff on Friday.",
    check: (commands) =>
      constraints(commands).some((c) => c.strength === "HARD")
        ? `SOFT_MADE_HARD:${JSON.stringify(commands)}`
        : "PASS",
  },
  {
    id: "friday_soft_suck",
    category: "F_SOFT_WEEKDAY_AVOIDANCE",
    message: "Fridays kinda suck.",
    check: (commands) =>
      constraints(commands).some((c) => c.strength === "HARD")
        ? `SOFT_MADE_HARD:${JSON.stringify(commands)}`
        : "PASS",
  },
  {
    id: "friday_soft_keep_light",
    category: "F_SOFT_WEEKDAY_AVOIDANCE",
    message: "I'd rather keep Fridays light.",
    check: (commands) =>
      constraints(commands).some((c) => c.strength === "HARD")
        ? `SOFT_MADE_HARD:${JSON.stringify(commands)}`
        : "PASS",
  },
  // G — preparedness
  {
    id: "prep_never_studied",
    category: "G_PREPAREDNESS",
    message: "I never studied matrices.",
    check: (commands) =>
      prepared(commands).some((c) => c.state === "NOT_STUDIED") ? "PASS" : `NOT_NOT_STUDIED:${JSON.stringify(commands)}`,
  },
  {
    id: "prep_seen_before",
    category: "G_PREPAREDNESS",
    message: "I've seen matrices before.",
    check: (commands) =>
      prepared(commands).length ? "PASS" : `NO_PREPAREDNESS:${commands.map(id).join(",")}`,
  },
  {
    id: "prep_rusty",
    category: "G_PREPAREDNESS",
    message: "I'm rusty at matrices.",
    check: (commands) =>
      prepared(commands).some((c) => c.state === "WEAK" || c.state === "OKAY")
        ? "PASS"
        : `UNEXPECTED_STATE:${JSON.stringify(commands)}`,
  },
  {
    id: "prep_weak",
    category: "G_PREPAREDNESS",
    message: "I'm weak at matrices.",
    check: (commands) =>
      prepared(commands).some((c) => c.state === "WEAK") ? "PASS" : `NOT_WEAK:${JSON.stringify(commands)}`,
  },
  {
    id: "prep_good",
    category: "G_PREPAREDNESS",
    message: "I'm pretty good at matrices.",
    check: (commands) =>
      prepared(commands).some((c) => c.state === "STRONG" || c.state === "OKAY")
        ? "PASS"
        : `NOT_STRONG:${JSON.stringify(commands)}`,
  },
  // H — curriculum overlap is not preparedness
  {
    id: "overlap_not_in_course",
    category: "H_OVERLAP_CORRECTION",
    message: "That wasn't in my A-Level course.",
    check: (commands) => {
      const overlap = commands.filter(
        (c): c is Extract<CopilotCommand, { command: "SET_OVERLAP_CORRECTION" }> =>
          c.command === "SET_OVERLAP_CORRECTION"
      );
      const touchedPreparedness = prepared(commands).length > 0;
      if (touchedPreparedness) return "OVERLAP_BECAME_PREPAREDNESS";
      return overlap.length ? "PASS" : "NO_OVERLAP_COMMAND";
    },
  },
  // I/J — difficulty and priority come from the student, never from the model
  {
    id: "difficulty_explicit",
    category: "I_DIFFICULTY",
    message: "Matrices is really difficult for me.",
    check: (commands) =>
      commands.some((c) => c.command === "SET_DIFFICULTY" && c.difficult === true)
        ? "PASS"
        : `NO_DIFFICULTY:${commands.map(id).join(",")}`,
  },
  {
    id: "priority_explicit",
    category: "J_PRIORITY",
    message: "Physics matters more to me than the rest.",
    check: (commands) =>
      commands.some((c) => c.command === "SET_PRIORITY" && c.priority === "HIGH")
        ? "PASS"
        : `NO_PRIORITY:${commands.map(id).join(",")}`,
  },
  // K — scope
  {
    id: "scope_add",
    category: "K_SCOPE_UPDATE",
    message: "Add thermodynamics to the scope.",
    check: (commands) =>
      commands.some((c) => c.command === "UPDATE_SCOPE" && c.add.length > 0)
        ? "PASS"
        : `NO_ADD:${commands.map(id).join(",")}`,
  },
  // L — dates
  {
    id: "date_shift",
    category: "L_DATE_CHANGE",
    message: "Push my exam back one week.",
    check: (commands) =>
      commands.some((c) => c.command === "SET_TARGET_DATE") ? "PASS" : `NO_DATE:${commands.map(id).join(",")}`,
  },
  // M — background curriculum
  {
    id: "background_statement",
    category: "M_BACKGROUND_CURRICULUM",
    message: "I'm doing A-Level Maths and Physics.",
    check: (commands) =>
      commands.some((c) => c.command === "SET_BACKGROUND_CURRICULUM")
        ? "PASS"
        : `NO_BACKGROUND:${commands.map(id).join(",")}`,
  },
  // N/O — explicit research and comparison
  {
    id: "research_explicit",
    category: "N_RESEARCH_REQUEST",
    message: "Find the official syllabus for this.",
    intents: ["RESEARCH_REQUEST"],
    check: (commands) =>
      commands.some((c) => c.command === "REQUEST_SCOPE_RESEARCH") ? "PASS" : `NO_RESEARCH:${commands.map(id).join(",")}`,
  },
  {
    id: "comparison_explicit",
    category: "O_COMPARISON_REQUEST",
    message: "Compare this against my A-Level background.",
    intents: ["COMPARISON_REQUEST"],
    check: (commands) =>
      commands.some((c) => c.command === "REQUEST_CURRICULUM_COMPARISON")
        ? "PASS"
        : `NO_COMPARISON:${commands.map(id).join(",")}`,
  },
  // P — a draft edit
  {
    id: "draft_edit_remove",
    category: "P_DRAFT_EDIT",
    message: "Remove the final mock exam.",
    check: (commands) =>
      commands.some((c) => c.command === "REQUEST_DRAFT_EDIT") ? "PASS" : `NO_DRAFT_EDIT:${commands.map(id).join(",")}`,
  },
  // Q — a confirmed-plan change
  {
    id: "confirmed_replan",
    category: "Q_CONFIRMED_PLAN_REPLAN",
    message: "I'm behind. Adjust the plan.",
    check: (commands) =>
      commands.some((c) => c.command === "REQUEST_REPLAN" || c.command === "RELEASE_GENERATED_ITEM")
        ? "PASS"
        : `NO_REPLAN:${commands.map(id).join(",")}`,
  },
  // R — an explanation
  {
    id: "explain_topic",
    category: "R_EXPLANATION",
    message: "Why is matrices in my plan?",
    intents: ["EXPLAIN"],
    check: (commands) => (commands.length ? `MUTATED_ON_A_QUESTION:${commands.map(id).join(",")}` : "PASS"),
  },
  // S — release
  {
    id: "release_request",
    category: "S_RELEASE_REQUEST",
    message: "Remove this revision session, I don't want it.",
    check: (commands) =>
      commands.some((c) => c.command === "RELEASE_GENERATED_ITEM")
        ? "PASS"
        : `NO_RELEASE:${commands.map(id).join(",")}`,
  },
  // T — unrelated chat must not be answered inside the planner
  {
    id: "general_chat",
    category: "T_UNRELATED",
    message: "What is the capital of France?",
    intents: ["UNKNOWN"],
    check: (commands) => (commands.length ? `UNRELATED_BECAME_A_CHANGE:${commands.map(id).join(",")}` : "PASS"),
  },
  {
    id: "general_chat_poem",
    category: "T_UNRELATED",
    message: "Write me a poem about the sea.",
    intents: ["UNKNOWN"],
    check: (commands) => (commands.length ? `UNRELATED_BECAME_A_CHANGE:${commands.map(id).join(",")}` : "PASS"),
  },
  // U — ambiguous referents must not be guessed
  {
    id: "ambiguous_move_later",
    category: "U_AMBIGUOUS",
    message: "Move it later.",
    check: (commands) =>
      commands.some((c) => c.command === "REQUEST_DRAFT_EDIT") ? "GUESSED_A_REFERENT" : "PASS",
  },
  // V — multi-command
  {
    id: "multi_command",
    category: "V_MULTI_COMMAND",
    message: "Give me 8 hours a week, keep Sundays light, and mark vectors weak.",
    check: (commands) => (commands.length <= 5 && commands.length >= 1 ? "PASS" : `OUT_OF_BOUNDS:${commands.length}`),
  },
  // W — feelings are not academic state
  {
    id: "feelings_hate",
    category: "W_EMOTIONAL_LANGUAGE",
    message: "I hate matrices.",
    check: (commands) => {
      const inferred = commands.some(
        (c) =>
          (c.command === "SET_PREPAREDNESS" && c.state === "WEAK") ||
          (c.command === "SET_DIFFICULTY" && c.difficult === true) ||
          c.command === "SET_PRIORITY"
      );
      return inferred ? `FEELING_BECAME_STATE:${JSON.stringify(commands)}` : "PASS";
    },
  },
  {
    id: "feelings_boring",
    category: "W_EMOTIONAL_LANGUAGE",
    message: "Matrices are boring.",
    check: (commands) => {
      const inferred = commands.some(
        (c) => c.command === "SET_DIFFICULTY" || c.command === "SET_PREPAREDNESS" || c.command === "SET_PRIORITY"
      );
      return inferred ? `FEELING_BECAME_STATE:${JSON.stringify(commands)}` : "PASS";
    },
  },
  {
    id: "importance_not_priority_by_model",
    category: "W_EMOTIONAL_LANGUAGE",
    message: "Matrices are important.",
    check: (commands) => {
      // "Important" is the student's word, so a HIGH priority is defensible; what is not is the
      // model deciding importance for them. Either answer is accepted; the case is recorded.
      const priority = commands.some((c) => c.command === "SET_PRIORITY");
      return priority ? "STUDENT_WORD_USED" : "PASS";
    },
  },
  // X — casual and typo-laden
  {
    id: "casual_hours",
    category: "X_CASUAL",
    message: "cant do fri, also like 6h a week pls",
    check: (commands) =>
      commands.length ? (commands.length <= 5 ? "PASS" : "TOO_MANY") : "NO_COMMANDS",
  },
  // Y — negation
  {
    id: "negation_not_friday",
    category: "Y_NEGATION",
    message: "Don't put anything on Friday.",
    check: (commands) =>
      constraints(commands).some((c) => c.kind === "UNAVAILABLE_WEEKDAY" && c.value === 5)
        ? "PASS"
        : `MISSED_NEGATION:${commands.map(id).join(",")}`,
  },
  {
    id: "negation_not_heavy",
    category: "Y_NEGATION",
    message: "I don't want a heavy plan.",
    check: () => "PASS",
  },
  // Z — contradictions
  {
    id: "contradiction",
    category: "Z_CONTRADICTION",
    message: "I have 10 hours a week. Actually no, make that 5.",
    check: (commands) => (commands.length ? (commands.length <= 5 ? "PASS" : "TOO_MANY") : "NO_COMMANDS"),
  },
];

// ─── Harness ─────────────────────────────────────────────────────────────────

function loadEnvironment(): void {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}

function brief(): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  const end = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  return {
    ...base,
    goal: { title: "NUST NET Engineering" },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Mathematics" },
    target: { endDate: end, examDate: end },
    budget: { ...base.budget, weeklyMinutes: 600 },
    backgroundCurriculum: { label: "CAIE A-Level", level: "A-Level", board: "CAIE", subjects: ["Mathematics"] },
    scope: {
      source: "USER_MANUAL",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      provenanceRefs: [],
      provenanceSources: [],
      removedLabels: [],
      nodes: [
        { nodeId: "n1", label: "Matrices", kind: "TOPIC", parentId: null, selected: true },
        { nodeId: "n2", label: "Vectors", kind: "TOPIC", parentId: null, selected: true },
        { nodeId: "n3", label: "Calculus", kind: "TOPIC", parentId: null, selected: true },
        { nodeId: "n4", label: "Physics", kind: "TOPIC", parentId: null, selected: true },
      ],
    },
  };
}

interface Measured {
  id: string;
  category: string;
  attempt: number;
  outcome: string;
  intent: string | null;
  code: string | null;
  commands: string[];
  verdict: string;
  latencyMs: number;
  contractValid: boolean;
  /** How many edits to the plan the model proposed, for the false-mutation measure. */
  mutating: number;
  /** For a rejected answer: the contract issue paths, and the shape of its clarification. */
  diagnosis: Record<string, unknown> | null;
}

const measured: Measured[] = [];
/** The most recent model responses, for diagnosing a rejected shape. Newest last. */
const lastModelBodies: string[] = [];

/**
 * Why a rejected answer did not fit, as paths and codes only.
 *
 * Field names are contract vocabulary; the values never leave the process and never reach the
 * report. This is the difference between "the model sometimes returns something wrong" — which
 * is not actionable — and "the model sometimes sends this field in this shape".
 */
function shapeDiagnosis(raw: string): Record<string, unknown> {
  try {
    const envelope = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    const content = String(envelope.choices?.[0]?.message?.content ?? "");
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return { envelope: true, json: false, contentChars: content.length };
    const parsed = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    const result = PlannerCopilotInterpretationV1Schema.safeParse(parsed);
    const keys = Object.keys(parsed).slice(0, 20);
    if (result.success) return { schemaPassed: true, keys };
    return {
      schemaPassed: false,
      keys,
      issues: result.error.issues.slice(0, 8).map((issue) => ({
        path: issue.path.map(String).join(".").slice(0, 60),
        code: issue.code,
      })),
      // The shape of the clarification object, since that is where the failures cluster: which
      // keys it carries and what type each one is, never what it says.
      clarification: (() => {
        const value = parsed.clarification as Record<string, unknown> | undefined;
        if (!value || typeof value !== "object") return { present: false, type: typeof value };
        return {
          present: true,
          keys: Object.keys(value).slice(0, 10),
          types: Object.fromEntries(
            Object.entries(value)
              .slice(0, 10)
              .map(([key, entry]) => [key, entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry])
          ),
        };
      })(),
    };
  } catch (error) {
    return { decodeError: String((error as Error).message).slice(0, 60) };
  }
}

describe.skipIf(!database || !LIVE)("real DeepSeek interpretation corpus", () => {
  let userId = 0;
  let sessionId = "";
  let context: PlannerCopilotContextV1;
  let interpreter: CopilotModel;

  beforeAll(async () => {
    loadEnvironment();
    /**
     * Capture the model's raw answer, so a rejected one can be diagnosed by *shape*.
     *
     * `CopilotModelError` carries a closed code and nothing else — deliberately, because the
     * model's prose must not travel — so the only way to learn which field the contract refused
     * is to look at the response as it crossed the wire. The wrapper observes; it never rewrites
     * a request or a response.
     */
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const response = await realFetch(input as never, init as never);
      if (url.includes("deepseek.com") && response.ok) {
        response
          .clone()
          .text()
          .then((text) => {
            lastModelBodies.push(text);
            if (lastModelBodies.length > 4) lastModelBodies.shift();
          })
          .catch(() => undefined);
      }
      return response;
    }) as typeof fetch;
    userId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [0] },
      })
    ).id;
    const created = await createIntake(userId, { schemaVersion: 1, clientKey: randomUUID(), mode: "EXAM" });
    const seeded = await patchIntake(userId, created.id, {
      schemaVersion: 1,
      expectedVersion: created.version,
      brief: brief(),
    });
    sessionId = seeded.id;

    /**
     * The same projection the server gives the model.
     *
     * Built from a real intake view rather than a hand-written object, because a corpus that
     * measured the interpreter against a context the server would never produce would be
     * measuring the wrong thing.
     */
    const start = await readIntake(userId, sessionId);
    const { buildCopilotContext } = await import("@/lib/planner/copilot/context");
    context = buildCopilotContext({
      brief: start.brief,
      readiness: { state: start.readiness.state, missing: start.readiness.missing },
      today: new Date().toISOString().slice(0, 10),
      researchConfigured: true,
      hardLimits: {
        weekly: start.limits.weeklyLimitMinutes,
        session: start.limits.sessionLimitMinutes,
        unavailableWeekdays: start.limits.unavailableWeekdays,
      },
      comparisonState: start.comparison.state,
      plan: null,
      draftSummary: null,
      confirmedSummary: null,
    });
    const { deepseekCopilotModel } = await import("@/lib/planner/copilot/model");
    interpreter = deepseekCopilotModel();
  }, 120_000);

  afterAll(() => {
    if (measured.length) {
      const path = "planner-phase5-corpus-results.json";
      writeFileSync(path, JSON.stringify(measured, null, 1));
      // eslint-disable-next-line no-console
      console.log(`CORPUS_RESULTS ${path} cases=${measured.length}`);
    }
  });

  it("runs the whole corpus and records every attempt", async () => {
    for (const entry of CORPUS) {
      let verdict = "NO_RESULT";
      let last: Measured | null = null;
      /**
       * Two attempts, never more.
       *
       * A retry exists because a provider call can fail for reasons that say nothing about
       * interpretation. It is recorded as a second attempt, so the report can state the
       * first-pass rate and the eventual bounded rate as two different numbers — a retry is
       * never counted as a first-pass success.
       */
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const started = Date.now();
        /**
         * The **interpreter** is what is being measured, not the router.
         *
         * The first run of this corpus asked the server, and read nothing: two thirds of the
         * "failures" were cases where a single high-confidence command had been applied
         * directly and no proposal token existed to decode, so the checker saw an empty command
         * list for a perfectly correct answer. §24 asks for interpretation metrics — contract
         * validity, intent, command type, hard-versus-soft — and all of those are properties of
         * the interpretation itself. So the model is called directly, with the same context
         * projection the server builds, and the server's own routing stays where it belongs:
         * covered deterministically, where the outcome is known rather than observed.
         */
        let interpretation: PlannerCopilotInterpretationV1 | null = null;
        let code: string | null = null;
        try {
          const interpreted = await interpreter.interpret({
            context: (await readIntake(userId, sessionId)) && context,
            recent: [],
            message: entry.message,
            factIds: [],
          });
          interpretation = interpreted.interpretation;
        } catch (error) {
          code = error instanceof Error ? error.message : "MODEL_UNAVAILABLE";
        }
        const modelFailed = interpretation === null;
        // A rejected answer is diagnosed from the response that produced it, so the report can
        // say which field the contract refused rather than "the model failed".
        const diagnosis =
          modelFailed && lastModelBodies.length
            ? shapeDiagnosis(lastModelBodies[lastModelBodies.length - 1])
            : null;
        const commands = (interpretation?.commands ?? []) as CopilotCommand[];
        const intent = interpretation?.intent ?? "UNKNOWN";
        const intentOk = !entry.intents || entry.intents.includes(intent);
        verdict = modelFailed
          ? `MODEL_FAILED:${code}`
          : intentOk
            ? (entry.check?.(commands) ?? "PASS")
            : `WRONG_INTENT:${intent}`;

        last = {
          id: entry.id,
          category: entry.category,
          attempt,
          outcome: modelFailed ? "MODEL_FAILED" : "INTERPRETED",
          intent: modelFailed ? null : intent,
          code,
          commands: commands.map((command) => command.command),
          diagnosis,
          verdict,
          latencyMs: Date.now() - started,
          contractValid: !modelFailed,
          mutating: commands.filter(
            (command) =>
              command.command !== "REQUEST_SCOPE_RESEARCH" &&
              command.command !== "REQUEST_CURRICULUM_COMPARISON"
          ).length,
        };
        measured.push(last);
        if (!modelFailed) break;
      }
      expect(last, entry.id).not.toBeNull();
    }
  }, 1_800_000);

  it("reports the measured rates, separating first-pass from eventual", () => {
    const byCase = new Map<string, Measured[]>();
    for (const entry of measured) byCase.set(entry.id, [...(byCase.get(entry.id) ?? []), entry]);
    const firstAttempts = [...byCase.values()].map((attempts) => attempts[0]);
    const eventual = [...byCase.values()].map((attempts) => attempts[attempts.length - 1]);

    const rate = (list: Measured[], predicate: (entry: Measured) => boolean) =>
      list.length ? Number(((list.filter(predicate).length / list.length) * 100).toFixed(1)) : 0;

    const summary = {
      cases: byCase.size,
      attempts: measured.length,
      firstPassContractValid: rate(firstAttempts, (entry) => entry.contractValid),
      eventualContractValid: rate(eventual, (entry) => entry.contractValid),
      firstPassVerdictPass: rate(firstAttempts, (entry) => entry.verdict === "PASS"),
      eventualVerdictPass: rate(eventual, (entry) => entry.verdict === "PASS"),
      retried: measured.filter((entry) => entry.attempt === 2).length,
      medianLatencyMs: median(measured.map((entry) => entry.latencyMs)),
      failures: eventual
        .filter((entry) => entry.verdict !== "PASS")
        .map((entry) => ({ id: entry.id, category: entry.category, verdict: entry.verdict, intent: entry.intent, commands: entry.commands })),
      /**
       * Every rejected answer, with the contract path that refused it.
       *
       * Paths and codes only: the *shape* of what the model sent, never its words.
       */
      rejectedShapes: measured
        .filter((entry) => entry.diagnosis !== null)
        .map((entry) => ({ id: entry.id, attempt: entry.attempt, code: entry.code, diagnosis: entry.diagnosis })),
    };
    // eslint-disable-next-line no-console
    console.log(`CORPUS_SUMMARY ${JSON.stringify(summary, null, 1)}`);
    expect(summary.cases).toBe(CORPUS.length);
  });
});

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export { CORPUS };
