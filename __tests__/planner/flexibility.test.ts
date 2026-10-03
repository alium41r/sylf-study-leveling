// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { LIMITS } from "@/lib/planner/contracts";
import { validateHardConstraints } from "@/lib/planner/constraints";
import { draftRule } from "@/lib/planner/draft-rules";
import { normalizeProposal } from "@/lib/planner/server/core";
import { examAvailability, examFixture, examProposal } from "./exam-fixtures";
import type { ExamInput } from "@/lib/planner/exam-policy";

/**
 * Flexibility: the Planner's own acceptance criterion.
 *
 * Sylf writes custom plans, so the governing rule is "warn about the tradeoff, then let the
 * student choose". A recommendation is not a prohibition; a target is not a maximum; a
 * preferred session length is not a limit. What may still block is a technical bound, an
 * explicit HARD constraint the student set, or a structural fact — never Sylf's opinion that
 * a plan is ambitious.
 *
 * This file is the stop gate for that claim, in both directions:
 *
 * - the large plan must be **creatable** — three months, five thousand minutes, many Quests,
 *   a weekly target it deliberately exceeds — with warnings and no refusal;
 * - the same plan against an explicit HARD weekly maximum the student set must still be
 *   **refused**, because flexibility is not the same as ignoring the student's own rules.
 *
 * It runs without a database wherever it can: `validateDraft` is the gate every stored
 * revision passes through, so proving the behaviour there proves it for generation, editing,
 * confirmation and replanning at once. The database half — that such a plan actually seals and
 * materialises — lives in `database-phase5.test.ts`.
 */

const database = process.env.PLANNER_TEST_DATABASE_URL;

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
  /**
   * The client counts its own model operations, so a test can assert that a write path's cost
   * is constant rather than proportional to the size of the plan.
   *
   * This is the measurement the "planner isn't creating the quests" defect needed. The engine
   * was correct and a local database is fast, so nothing here failed; the failure existed only
   * at real network latency. A bound on the *number of round-trips* catches it regardless of
   * how fast the machine running the test happens to be.
   */
  const plannerQueryCounts = { model: 0 };
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }),
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

/**
 * Twenty-one units across a ninety-day horizon.
 *
 * Sized deliberately against the measured bound rather than picked to look impressive. One
 * generation is one model answer, bounded by `GENERATION_MAX_TOKENS`; `LIMITS.proposedItems`
 * is where that lands with headroom for topics and notes. So the honest question is not "can a
 * plan be enormous" but "can a genuine three-month plan fit one generation", and this is that
 * plan: twenty-one units, four sessions each, at the session lengths the student said they
 * prefer (90 minutes), which is fifty-five hundred minutes of real work.
 *
 * A plan larger than one answer can carry is not refused for being ambitious — it is
 * segmented, with the choice stated. `LIMITS.items` is separate and larger for exactly that
 * reason: a stored plan may grow past what a single generation can produce.
 */
const LARGE_TOPICS = 21;

function largeExamInput(over: Partial<ExamInput> = {}): ExamInput {
  const topics = Array.from({ length: LARGE_TOPICS }, (_, index) => ({
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
    startDate: "2030-01-07",
    endDate: "2030-04-06",
    examDate: "2030-04-06",
    availability: {
      // Five hours a day: the student said they have the time, and nothing else decides.
      dailyMinutes: [300, 300, 300, 300, 300, 300, 300],
      recoveryPercent: 10,
      blockedDates: [],
    },
    exam: {
      subjectName: "Large plan",
      subjectId: null,
      topics,
      format: "MIXED",
      preferredMinutes: 90,
      mockMinutes: 120,
      allowExamDayStudy: false,
      approach: "STANDARD",
      acceptReducedReserve: true,
    },
    ...over,
  };
}

/** The start date plus `offset` days, as a date key. */
const dayKey = (startDate: string, offset: number): string =>
  new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * A complete plan for that scope, in the same shape the generator produces.
 *
 * Each unit gets the four sessions the Exam validator asks for — a first pass, practice,
 * recall and a mistake review — plus one timed paper, one mock and one final review for the
 * plan as a whole. That is what makes the size of the plan the *student's* choice rather than
 * an incomplete draft being waved through: the plan is large and it is also complete.
 */
function largeProposal(input: ExamInput = largeExamInput()) {
  const start = input.startDate;
  const span = 84;
  type Entry = [string, string, string, string, number, string[]?];
  const entries: Entry[] = [];
  input.exam!.topics.forEach((_topic, index) => {
    const ref = `t${index + 1}`;
    // Two units every day or so, so no day carries more than its own availability allows.
    const base = Math.floor((index * span) / LARGE_TOPICS);
    entries.push([ref, "LEARN", "COVERAGE", dayKey(start, base), 90]);
    entries.push([ref, "PRACTICE", "PRACTICE", dayKey(start, base + 1), 90]);
    entries.push([ref, "RECALL", "CONSOLIDATION", dayKey(start, base + 2), 45]);
    entries.push([ref, "MISTAKE_REVIEW", "PRACTICE", dayKey(start, base + 3), 30]);
  });
  const all = input.exam!.topics.map((_topic, index) => `t${index + 1}`);
  // The last three land before the exam day: the student said not to study on the day itself.
  entries.push(["t1", "TIMED_PRACTICE", "PRACTICE", dayKey(start, 84), 60, all]);
  entries.push(["t1", "MOCK_EXAM", "EXAM_READINESS", dayKey(start, 86), 120, all]);
  entries.push(["t1", "FINAL_REVIEW", "EXAM_READINESS", dayKey(start, 87), 45, all]);

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

const totalMinutes = (proposal: { items: { minutes: number }[] }) =>
  proposal.items.reduce((sum, item) => sum + item.minutes, 0);

/**
 * A model proposal becomes a stored draft through `normalizeProposal`, and the draft is what
 * every validator sees. The same two steps the real generation path takes, without a database.
 */
const asDraft = (input: ExamInput, proposal: unknown) =>
  normalizeProposal(input as never, proposal as never);

describe("the planner is flexible by default", () => {
  it("measures what an item actually costs, so the item bound is a measured fact", () => {
    /**
     * §9/§63: no bound without a measurement.
     *
     * The number that matters is bytes per serialised item against `LIMITS.payloadBytes`, the
     * ceiling every stored revision is parsed under. This test exists to fail if a future
     * change makes items much more expensive, or if the storage bound is ever cut back to
     * something a three-month plan cannot fit inside.
     */
    const proposal = largeProposal();
    const bytes = JSON.stringify(proposal).length;
    const perItem = bytes / proposal.items.length;
    expect(perItem).toBeLessThan(700);
    expect(perItem * LIMITS.items).toBeLessThan(LIMITS.payloadBytes);
    // A three-month plan at ordinary session lengths must sit well below the bound.
    expect(LIMITS.items).toBeGreaterThanOrEqual(120);
    // The model's own budget is separate, and smaller: one answer, not one plan.
    expect(LIMITS.proposedItems).toBeLessThan(LIMITS.items);
  });

  it("accepts a ninety-day plan of over five thousand minutes with many Quests", async () => {
    const input = largeExamInput();
    const proposal = largeProposal(input);
    // Many Quests, over a three-month horizon, inside one generation's budget.
    expect(proposal.items.length).toBeGreaterThanOrEqual(80);
    expect(proposal.items.length).toBeLessThanOrEqual(LIMITS.proposedItems);
    expect(totalMinutes(proposal)).toBeGreaterThanOrEqual(5000);

    const { validateDraft } = await import("@/lib/planner/contracts");
    const draft = validateDraft(input as never, asDraft(input, proposal));
    // Nothing was dropped to make it fit: the plan the student asked for is the plan stored.
    expect(draft.items).toHaveLength(proposal.items.length);
    expect(totalMinutes(draft)).toBeGreaterThanOrEqual(5000);
  });

  it("does not refuse a plan merely because it is far above the weekly target", async () => {
    /**
     * The target is a target. A student who says "about 5 hours a week" and then has five
     * hours a *day* available has told Sylf two different things, and the plan follows the
     * availability while the target produces a warning the student may accept.
     */
    const input = largeExamInput();
    const proposal = largeProposal(input);
    const { validateDraft } = await import("@/lib/planner/contracts");

    // No weekly maximum was stated, so nothing about the size of the plan is a hard limit.
    expect(input.constraints ?? []).toEqual([]);
    expect(() => validateDraft(input as never, asDraft(input, proposal))).not.toThrow();

    /**
     * …and the same plan under a HARD weekly maximum below it is refused. That contrast is the
     * whole point: a target warns, an explicit maximum blocks.
     *
     * The gate is `validateHardConstraints`, so the refusal reaches generation, editing,
     * confirmation and replanning alike. The 600-minute ceiling sits *below* the plan's busiest
     * week while every day still fits the grid — which is precisely the case that used to slip
     * through, because the weekly finding was derived from the daily capacity verdict.
     */
    const constrained = largeExamInput({
      constraints: [
        { kind: "MAX_WEEKLY_MINUTES", strength: "HARD", value: 300, source: "USER_STATED" },
      ],
    } as never);
    // The same plan, built without the ceiling — it validates cleanly, which is what makes the
    // contrast meaningful: the only thing that changes is the student's own stated maximum.
    const plain = asDraft(input, proposal);
    const perDay = plain.items.reduce<Record<string, number>>((days, item) => {
      days[item.date] = (days[item.date] ?? 0) + item.minutes;
      return days;
    }, {});
    // The grid is not what is being violated: every day is well inside the student's own day.
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(300);
    expect(() => validateHardConstraints(constrained as never, plain.items)).toThrow(
      "HARD_WEEKLY_LIMIT_EXCEEDED"
    );
    // …and the whole draft is refused, not merely warned about.
    expect(() => validateDraft(constrained as never, plain)).toThrow("HARD_WEEKLY_LIMIT_EXCEEDED");
    // The code is audited as a blocker, so no acknowledgement can accept it away.
    expect(draftRule("HARD_WEEKLY_LIMIT_EXCEEDED")?.class).toBe("BLOCKER");
  });

  it("lets the student exceed a preferred session length but not a hard maximum", async () => {
    const { validateDraft } = await import("@/lib/planner/contracts");
    const input = largeExamInput();
    const proposal = largeProposal(input);
    // The mock is 120 minutes against a stated preference of 90, and it is allowed.
    expect(input.exam!.preferredMinutes).toBe(90);
    expect(proposal.items.some((item) => (item.minutes as number) > 90)).toBe(true);
    expect(() => validateDraft(input as never, asDraft(input, proposal))).not.toThrow();

    // …but an explicit HARD session ceiling below the mock is refused, not warned.
    const hardSession = largeExamInput({
      constraints: [{ kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 90 }],
    } as never);
    expect(() => validateDraft(hardSession as never, asDraft(hardSession, proposal))).toThrow(
      "HARD_SESSION_LIMIT_EXCEEDED"
    );
  });

  it("still refuses a session outside the engine's absolute duration bounds", async () => {
    const { validateDraft } = await import("@/lib/planner/contracts");
    const input = largeExamInput();
    const proposal = largeProposal(input);
    // 15–240 minutes is a technical bound, not advice: nothing can be scheduled outside it.
    const tooLong = {
      ...proposal,
      items: proposal.items.map((item, index) => (index === 0 ? { ...item, minutes: 241 } : item)),
    };
    expect(() => validateDraft(input as never, asDraft(input, tooLong))).toThrow();
    const tooShort = {
      ...proposal,
      items: proposal.items.map((item, index) => (index === 0 ? { ...item, minutes: 14 } : item)),
    };
    expect(() => validateDraft(input as never, asDraft(input, tooShort))).toThrow();
  });

  it("has no total-minutes ceiling anywhere in the engine", async () => {
    /**
     * §6: the old behaviour being guarded against is a global "requested 5000, allowed 3000".
     *
     * There is none. The only total-shaped check in the Planner compares the *scope's own
     * provision estimate* to the student's *stated availability* — a structural fact about
     * whether the work fits the time, expressed with four concrete choices — and it is a
     * property of one mode's preflight rather than a ceiling on what a plan may contain.
     */
    const { examFeasibility } = await import("@/lib/planner/exam-policy");
    const input = largeExamInput();
    const feasibility = examFeasibility(input, examAvailability());
    expect(feasibility.status).toBe("POTENTIAL_FIT");
    // The comparison is the scope's own provision estimate against the student's stated
    // availability — a fact about whether the work fits the time, not a ceiling on the plan.
    expect(feasibility.availableMinutes).toBeGreaterThan(feasibility.estimatedMinutes);
    expect(feasibility.estimatedMinutes).toBeGreaterThan(0);
    expect(feasibility.reserveMinutes).toBeGreaterThan(0);
    // A plan of the size this scope supports is far above five thousand minutes.
    expect(feasibility.availableMinutes).toBeGreaterThan(20000);

    // The same scope against an availability that genuinely cannot hold it is refused — with
    // choices, and for a structural reason rather than an opinion about ambition.
    const cramped = largeExamInput();
    cramped.availability = { dailyMinutes: [30, 30, 30, 30, 30, 30, 30], recoveryPercent: 0, blockedDates: [] };
    // A scope far larger than half an hour a day can hold, so the refusal is about capacity.
    cramped.exam!.topics = Array.from({ length: 48 }, (_, index) => ({
      label: `Unit ${index + 1}`,
      covered: false,
      confidence: 2,
      difficult: false,
    }));
    cramped.scope = cramped.exam!.topics.map((topic) => topic.label).join("\n");
    const tight = examFeasibility(cramped, examAvailability());
    expect(tight.status).toBe("INFEASIBLE");
    // Half an hour a day cannot hold a scope of this size, whatever Sylf thinks of the plan.
    expect(tight.reasons).toContain("INSUFFICIENT_CAPACITY");
    // …and the refusal comes with the four concrete moves that would change it.
    expect(tight.choices.length).toBeGreaterThan(0);
    expect(tight.choices.join(" ")).toMatch(/increase confirmed availability/i);
  });

  it("keeps the existing small fixture exactly as flexible as it was", async () => {
    const { validateDraft } = await import("@/lib/planner/contracts");
    const fixture = examFixture();
    const draft = validateDraft(fixture as never, asDraft(fixture, examProposal()));
    expect(draft.items.length).toBe(examProposal().items.length);
  });
});

/**
 * The same claim, held to a real database.
 *
 * `validateDraft` proves the *gate*; this proves the plan reaches storage — sealed, confirmed
 * and materialised as ordinary Quests — because a flexibility claim that stops at validation
 * would not be worth much.
 */
describe.skipIf(!database)("a large plan reaches the database intact", () => {
  let userId: number;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/prisma");
    userId = (
      await prisma.user.create({
        // No rest days: this student said they can study any day, and the fixture places work
        // by the plan's own dates rather than by a weekday grid.
        data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] },
      })
    ).id;
  });

  afterAll(async () => {
    vi.resetModules();
  });

  it("seals, confirms and materialises a ninety-day plan of over five thousand minutes", async () => {
    const { prisma } = await import("@/lib/prisma");
    // The counting extension is part of this file's own mock, so it is read back through the
    // same import — typed locally rather than widening the module's declared shape.
    const { plannerQueryCounts: counts } = (await import("@/lib/prisma")) as unknown as {
      plannerQueryCounts: { model: number };
    };
    const { createPlanShell, saveValidatedDraft } = await import("@/lib/planner/server/revisions");
    const { confirmDraft } = await import("@/lib/planner/server/materialize");

    const input = largeExamInput();
    const proposal = largeProposal(input);
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: "Large plan",
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const sealed = await saveValidatedDraft(userId, plan.id, {
      input,
      proposal,
      expectedVersion: 0,
      operationKey: randomUUID(),
    });
    const draft = sealed.outputSnapshot as unknown as { items: { key: string }[] };
    expect(draft.items.length).toBeGreaterThanOrEqual(40);
    // Serialised size, measured rather than assumed: this is the number the bound is set from.
    const revisionBytes = JSON.stringify(sealed.outputSnapshot).length;
    expect(revisionBytes).toBeLessThan(LIMITS.payloadBytes);

    /**
     * The measurement that matters, taken around the confirmation only.
     *
     * A confirmation must cost a **constant** number of database round-trips, not one per
     * Quest. The defect this guards against is invisible on a local database and fatal on a
     * real one: 84 items wrote 168 statements, and at this deployment's measured ~119 ms per
     * round-trip that is about twenty seconds inside a fifteen-second transaction — so the
     * transaction rolled back and no Quest was ever created.
     */
    counts.model = 0;
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    // Every selected item became a Quest, and the plan holds the minutes the student asked for.
    expect(receipt.items.length).toBe(draft.items.length);
    const quests = await prisma.quest.findMany({
      where: { id: { in: receipt.items.map((entry) => entry.questId) } },
      select: { requiredMinutes: true, status: true },
    });
    expect(quests.length).toBeGreaterThanOrEqual(40);
    expect(quests.reduce((sum, quest) => sum + (quest.requiredMinutes ?? 0), 0)).toBeGreaterThanOrEqual(5000);
    expect(quests.every((quest) => quest.status === "PENDING")).toBe(true);

    /**
     * Generous in absolute terms, strict in *shape*: measured 13 operations for 87 items after
     * the fix, against 185 before it — one per item, plus a link each. Any bound in the forties
     * therefore passes comfortably while a return to per-item writes fails on the spot.
     */
    expect(draft.items.length).toBeGreaterThan(80);
    expect(counts.model).toBeLessThan(40);
    // eslint-disable-next-line no-console
    console.log(`MEASURED confirm: items=${draft.items.length} modelOperations=${counts.model} revisionBytes=${revisionBytes}`);
    return { revisionBytes, itemCount: draft.items.length, confirmQueries: counts.model };
  }, 120_000);
});
