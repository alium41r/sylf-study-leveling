// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ModelProposalV1Schema, type ValidatedDraftV1 } from "@/lib/planner/contracts";
import type { ExamInput } from "@/lib/planner/exam-policy";

/**
 * The one suite that confirms and replans a large plan against the **configured** database.
 *
 * This exists because of a real defect, and it is the only verification that could have caught
 * it. Everything else in the repository runs against a disposable local PostgreSQL answering a
 * round trip in about 0.2 ms. The configured database answers in about 119 ms — some 600 times
 * slower — and that difference was the entire difference between "an 87-item plan materialises
 * perfectly in the acceptance test" and "a student pressed *Create plan · 84 Quests* and got
 * nothing at all".
 *
 * Confirmation writes inside one `Serializable` transaction with a 15-second ceiling. The
 * original code wrote two statements per item, so 84 items meant 168 statements — about 20
 * seconds at this latency. The transaction was killed on the timeout and rolled back **in full**,
 * which is why the student saw a successful-looking navigation and an empty plan rather than an
 * error. Nothing was half-written and nothing was corrupted; the work simply never happened. The
 * replan path had the same defect in two places: a per-item create for added work, and one
 * `update` per retained link — 84 individual updates is about ten seconds on its own, inside the
 * same budget.
 *
 * Why the operation-count guard in `flexibility.test.ts` is not enough on its own: it proves the
 * write paths *cannot* grow with plan size, which is a property of the code and therefore holds
 * anywhere. It does not prove that the constant cost is affordable at the deployment's real
 * latency, and it cannot — the deployment's latency is not knowable from a local socket. That is
 * what this file measures, and it is why the two checks are complementary rather than redundant.
 *
 * Opt-in, because it writes to the configured database:
 *
 *     PLANNER_LIVE_MATERIALIZE=true node --env-file=.env \
 *       ./node_modules/vitest/vitest.mjs run __tests__/planner/live-materialize-smoke.test.ts
 *
 * `--env-file` is explicit rather than `set -a && . ./.env` because vitest does not read `.env`
 * (Next.js does that at runtime, so nothing else in the repository needs it), and because
 * sourcing it through a shell mangles any value containing spaces. Without a `DATABASE_URL` the
 * Prisma adapter reports an opaque empty error, which is why the guard below checks first.
 *
 * It creates one throwaway user, does its work, and deletes that user — every Planner table
 * cascades from `User` or from `PlannerPlan`, so the cleanup is a single delete and leaves no
 * residue. It deliberately does not run under `scripts/test-planner-postgres.mjs`, which
 * overwrites `DATABASE_URL` with the disposable instance that cannot reproduce the defect.
 */

const live = process.env.PLANNER_LIVE_MATERIALIZE === "true";

if (live && !process.env.DATABASE_URL) {
  throw new Error(
    "PLANNER_LIVE_MATERIALIZE needs DATABASE_URL, and vitest does not load .env: " +
      "run `node --env-file=.env ./node_modules/vitest/vitest.mjs run <this file>` instead."
  );
}

/**
 * The same pass-through counting extension the deterministic suite uses, attached to the **real**
 * database. It counts model operations and never rewrites a request or a response, so the
 * production path is what runs; the count is an observation, not an interception.
 */
const plannerQueryCounts = { model: 0 };

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          plannerQueryCounts.model += 1;
          return query(args);
        },
      },
    },
  });
  return { prisma: client, plannerQueryCounts };
});

// ─── A deliberately large but legitimate plan ────────────────────────────────

const START = "2030-01-07";
const EXAM_DAY = "2030-04-06";
const TOPICS = 21;

/** The start date plus `offset` days, as a date key. */
const dayKey = (startDate: string, offset: number): string =>
  new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

function largeExamInput(): ExamInput {
  const topics = Array.from({ length: TOPICS }, (_, index) => ({
    label: `Unit ${index + 1}`,
    covered: false,
    confidence: 2,
    difficult: false,
  }));
  return {
    schemaVersion: 1,
    mode: "EXAM",
    title: "Ninety-day exam plan",
    scope: topics.map((topic) => topic.label).join("\n"),
    startDate: START,
    endDate: EXAM_DAY,
    examDate: EXAM_DAY,
    availability: {
      dailyMinutes: [300, 300, 300, 300, 300, 300, 300],
      recoveryPercent: 10,
      blockedDates: [],
    },
    exam: {
      subjectName: "Live materialisation check",
      subjectId: null,
      topics,
      format: "MIXED",
      preferredMinutes: 90,
      mockMinutes: 120,
      allowExamDayStudy: false,
      approach: "STANDARD",
      acceptReducedReserve: true,
    },
  };
}

/** Twenty-one units over ninety days: four sessions each, plus a closing timed set and mock. */
function largeProposal(input: ExamInput) {
  type Entry = [string, string, string, string, number, string[]?];
  const entries: Entry[] = [];
  input.exam!.topics.forEach((_topic, index) => {
    const ref = `t${index + 1}`;
    const base = Math.floor((index * 84) / TOPICS);
    entries.push([ref, "LEARN", "COVERAGE", dayKey(START, base), 90]);
    entries.push([ref, "PRACTICE", "PRACTICE", dayKey(START, base + 1), 90]);
    entries.push([ref, "RECALL", "CONSOLIDATION", dayKey(START, base + 2), 45]);
    entries.push([ref, "MISTAKE_REVIEW", "PRACTICE", dayKey(START, base + 3), 30]);
  });
  const all = input.exam!.topics.map((_topic, index) => `t${index + 1}`);
  entries.push(["t1", "TIMED_PRACTICE", "PRACTICE", dayKey(START, 84), 60, all]);
  entries.push(["t1", "MOCK_EXAM", "EXAM_READINESS", dayKey(START, 86), 120, all]);
  entries.push(["t1", "FINAL_REVIEW", "EXAM_READINESS", dayKey(START, 87), 45, all]);

  const phrase: Record<string, string> = {
    LEARN: "First pass",
    PRACTICE: "Practice set",
    RECALL: "Recall check",
    MISTAKE_REVIEW: "Error review",
    TIMED_PRACTICE: "Timed set",
    MOCK_EXAM: "Mock paper",
    FINAL_REVIEW: "Final review",
  };
  return {
    schemaVersion: 1,
    mode: "EXAM",
    examDate: input.examDate,
    assumptions: ["Synthetic scope; estimates are approximate."],
    warnings: [],
    topics: input.exam!.topics.map((topic, index) => ({
      ref: `t${index + 1}`,
      title: topic.label,
      parentRef: null,
    })),
    milestones: [],
    items: entries.map(([topicRef, type, stage, date, minutes, related], index) => ({
      ref: `i${index + 1}`,
      topicRef,
      type,
      stage,
      date,
      minutes,
      relatedTopicRefs: related ?? [],
      milestoneRef: null,
      dependsOn: [],
      title: `${phrase[type]}: ${topicRef} on ${date}`,
      description: "Synthetic exercise",
      rationale: "Reinforce the confirmed unit with appropriate practice.",
      completionCriteria: "Finished the session and noted anything still unclear.",
    })),
  };
}

/** Nineteen of the twenty-one units stay put; one mock and one review move later. */
function replanProposal(draft: ValidatedDraftV1, tokens: { ref: string; itemKey: string }[]) {
  const tokenByKey = new Map(tokens.map((token) => [token.itemKey, token.ref]));
  const scopeOf = (topicKey: string) => draft.topics.find((topic) => topic.key === topicKey)?.scopeRef ?? "t1";
  const moveKey = draft.items.find((item) => item.type === "MOCK_EXAM")!.key;
  const newDate = dayKey(START, 88);
  return ModelProposalV1Schema.parse({
    schemaVersion: 1,
    mode: "EXAM",
    examDate: EXAM_DAY,
    assumptions: [],
    warnings: [],
    topics: draft.topics.map((topic) => ({ ref: topic.scopeRef, title: topic.title, parentRef: null })),
    milestones: [],
    items: draft.items.map((item, index) => {
      const token = tokenByKey.get(item.key);
      return {
        ref: `i${index + 1}`,
        topicRef: scopeOf(item.topicKey),
        relatedTopicRefs: (item.relatedTopicKeys ?? []).map(scopeOf),
        milestoneRef: null,
        dependsOn: [],
        type: item.type,
        stage: item.stage,
        title: item.title,
        description: item.description,
        rationale: "Keeps the remaining work aligned with the plan.",
        completionCriteria: item.completionCriteria,
        date: item.key === moveKey ? newDate : item.date,
        minutes: item.minutes,
        ...(token ? { retainRef: token } : {}),
      };
    }),
  });
}

describe.skipIf(!live)("a large plan materialises against the configured database", () => {
  let userId: number | null = null;

  afterAll(async () => {
    // One delete is the whole cleanup: every planner table cascades from User or PlannerPlan.
    // Guarded so a failure above cannot leave a stray throwaway student behind.
    if (userId !== null) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });

  it("confirms eighty-seven items, then replans them, inside the transaction budget", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { createPlanShell, saveValidatedDraft } = await import("@/lib/planner/server/revisions");
    const { confirmDraft } = await import("@/lib/planner/server/materialize");
    const { beginRebalance, finishRebalance, confirmRebalance } = await import("@/lib/planner/server/rebalance");

    userId = (
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@planner-live.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [],
        },
      })
    ).id;

    const input = largeExamInput();
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: "Live materialisation check",
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const sealed = await saveValidatedDraft(userId, plan.id, {
      input,
      proposal: largeProposal(input),
      expectedVersion: 0,
      operationKey: randomUUID(),
    });
    const draft = sealed.outputSnapshot as unknown as ValidatedDraftV1;
    expect(draft.items.length).toBeGreaterThanOrEqual(80);

    /**
     * Phase one: confirmation.
     *
     * The assertion is the transaction's own ceiling rather than a benchmark. If confirmation
     * cannot finish inside `PLANNER_TRANSACTION_TIMEOUT_MS` it does not merely run slowly — it
     * is rolled back and the student gets nothing. So "under fifteen seconds" is not a
     * performance target, it is the difference between working and not working.
     */
    plannerQueryCounts.model = 0;
    const confirmStartedAt = Date.now();
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    const confirmMs = Date.now() - confirmStartedAt;
    const confirmOps = plannerQueryCounts.model;

    expect(receipt.items.length).toBe(draft.items.length);

    // Read back through a fresh query: the receipt is the engine's own account of what it did,
    // and the point of this file is that the rows are actually there.
    const quests = await prisma.quest.findMany({
      where: { id: { in: receipt.items.map((entry) => entry.questId) } },
      select: { requiredMinutes: true, status: true, title: true },
    });
    expect(quests.length).toBe(draft.items.length);
    expect(quests.every((quest) => quest.status === "PENDING")).toBe(true);
    expect(quests.reduce((sum, quest) => sum + (quest.requiredMinutes ?? 0), 0)).toBeGreaterThanOrEqual(5_000);
    expect(quests.every((quest) => quest.title.length > 0)).toBe(true);

    /**
     * Phase two: the replan, which is where the defect's second half lived.
     *
     * One item genuinely moves, so the diff is real and the remaining eighty-six are retained —
     * which is the case that used to issue one `update` per retained link, about ten seconds on
     * its own at this latency.
     */
    const planRow = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: plan.id },
      select: { version: true, activeRevisionId: true },
    });
    const baseId = planRow.activeRevisionId ?? sealed.id;
    const begin = await beginRebalance(userId, plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: planRow.version,
      baseRevisionId: baseId,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });
    expect(begin.acquired).toBe(true);

    const tokens = (
      begin.inputSnapshot as { rebalance: { eligible: { ref: string; itemKey: string }[] } }
    ).rebalance.eligible;
    expect(tokens.length).toBeGreaterThan(70);

    const replanned = await finishRebalance(userId, plan.id, begin.operationKey, replanProposal(draft, tokens));
    expect(replanned.result.diff.counts.MOVE).toBe(1);

    plannerQueryCounts.model = 0;
    const replanStartedAt = Date.now();
    const replanReceipt = await confirmRebalance(userId, plan.id, {
      schemaVersion: 1,
      revisionId: replanned.revision.id,
      digest: replanned.revision.digest!,
      expectedVersion: planRow.version + 1,
      idempotencyKey: randomUUID(),
    });
    const replanMs = Date.now() - replanStartedAt;
    const replanOps = plannerQueryCounts.model;

    // The plan is still whole after replanning: one Quest per item, none lost, none duplicated.
    expect(replanReceipt.items.length).toBe(draft.items.length);
    const afterReplan = await prisma.quest.findMany({
      where: { id: { in: replanReceipt.items.map((entry) => entry.questId) } },
      select: { requiredMinutes: true, status: true },
    });
    expect(afterReplan.length).toBe(draft.items.length);

    // eslint-disable-next-line no-console
    console.log(
      `MEASURED live against the configured database: items=${draft.items.length} ` +
        `confirmMs=${confirmMs} confirmOps=${confirmOps} ` +
        `replanMs=${replanMs} replanOps=${replanOps} budgetMs=15000`
    );
    expect(confirmMs).toBeLessThan(15_000);
    expect(replanMs).toBeLessThan(15_000);
    // The same shape bound the deterministic suite uses, checked here on the real database too.
    expect(confirmOps).toBeLessThan(40);
    expect(replanOps).toBeLessThan(40);
  }, 300_000);
});
