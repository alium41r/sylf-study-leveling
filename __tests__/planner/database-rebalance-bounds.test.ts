// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CommitReceipt, ValidatedDraftV1 } from "@/lib/planner/contracts";
import { LIMITS, ModelProposalV1Schema } from "@/lib/planner/contracts";
import type { ExecutionRow } from "@/lib/planner/rebalance-policy";
import {
  executionSnapshot,
  rebalanceDiff,
} from "@/lib/planner/rebalance-policy";
import { REBALANCE_LIMITS } from "@/lib/planner/rebalance-fields";
import { coverageMap } from "@/lib/planner/coverage";
import { recordCandidateObservation } from "@/lib/planner/server/preferences";
import { recordFriction } from "@/lib/planner/server/friction";
import { rebalancePayload } from "@/lib/ai/planner/rebalance";
import { createPlanShell } from "@/lib/planner/server/revisions";
import { digest } from "@/lib/planner/server/core";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { beginOperation, finishOperation } from "@/lib/planner/server/operations";
import {
  beginRebalance,
  confirmRebalance,
  finishRebalance,
} from "@/lib/planner/server/rebalance";
import { rebalanceGenerationArgs } from "@/lib/planner/server/rebalance-run";
import { examFixture, examProposal } from "./exam-fixtures";

/**
 * The measured envelopes of one replan.
 *
 * Phase 5 claims every replan artefact is bounded. This file measures each one on the
 * real path and pins it, so a prompt, a payload or a snapshot that quietly grows past
 * the envelope fails here instead of in production. The numbers are printed on every
 * run — the point is not that a limit exists in the source, it is what the artefact
 * actually costs.
 *
 * Query counting uses a client with query events enabled, because the honest figure
 * for a confirmation is what the database was asked to do, not what the code reads
 * like.
 */
const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.includes("planner")
    )
      throw new Error("Disposable localhost planner database required");
  }
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url ?? "postgresql://localhost/unused_planner_tests",
      }),
      log: [{ emit: "event", level: "query" }],
    }),
  };
});
import { prisma } from "@/lib/prisma";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const report = (label: string, value: number | string) =>
  console.info(`[rebalance-bounds] ${label}: ${value}`);

describe.skipIf(!database)("planner replan measured envelopes", () => {
  let userId: number;

  beforeEach(async () => {
    userId = (
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@planner.test`,
          username: randomUUID(),
          timezone: "UTC",
          restDays: [],
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A confirmed Exam plan, exactly as the replan path receives it. */
  async function confirmedExam() {
    const input = examFixture();
    const plan = await createPlanShell(userId, {
      mode: "EXAM",
      title: input.title,
      creationKey: randomUUID(),
      subjectId: null,
      goalId: null,
    });
    const operationKey = randomUUID();
    await beginOperation(userId, plan.id, { operationKey, expectedVersion: 0, input });
    const revision = await finishOperation(
      userId,
      plan.id,
      operationKey,
      examProposal(),
      new Date()
    );
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    const receipt: CommitReceipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: revision.id,
      digest: revision.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: draft.items.map((item) => item.key),
      createGoal: false,
    });
    return { input, plan, revision, draft, receipt };
  }

  it("keeps every replan artefact inside its declared envelope", async () => {
    // 1. The execution snapshot at its own bound: the link table is bounded by the
    //    plan's items, and the fingerprint is what the seal later compares.
    const rows: ExecutionRow[] = Array.from(
      { length: REBALANCE_LIMITS.executionRows },
      (_, index) => ({
        itemKey: randomUUID(),
        questId: index + 1,
        disposition: index % 17 === 0 ? "DELETED" : "LIVE",
        status: index % 5 === 0 ? "COMPLETED" : "PENDING",
        scheduledFor: `2030-01-${String((index % 28) + 1).padStart(2, "0")}`,
        requiredMinutes: 45,
        elapsedSeconds: index % 5 === 0 ? 2700 : 0,
        completedAt: index % 5 === 0 ? "2030-01-05T10:00:00.000Z" : null,
        sessions: index % 5 === 0 ? 1 : 0,
        activeSession: false,
      })
    );
    const snapshot = executionSnapshot(rows, "2030-01-10");
    const fingerprintBytes = bytes(snapshot.fingerprint);
    report("execution rows measured", snapshot.rows.length);
    report("execution fingerprint bytes", fingerprintBytes);
    report("execution fingerprint digest chars", digest(snapshot.fingerprint).length);
    report(
      "execution frozen/eligible",
      `${snapshot.frozen.length}/${snapshot.eligible.length}`
    );
    expect(snapshot.rows.length).toBe(REBALANCE_LIMITS.executionRows);
    // The fingerprint is a transient comparison artefact, never a stored one: what a
    // plan keeps is its digest. It stays inside the provider payload envelope rather
    // than the metadata envelope, which bounds what is actually written.
    expect(fingerprintBytes).toBeLessThanOrEqual(LIMITS.payloadBytes);
    expect(digest(snapshot.fingerprint)).toHaveLength(64);

    // 2. The widest diff a replan can render: every item moved.
    const baseItems = Array.from({ length: REBALANCE_LIMITS.items }, (_, index) => ({
      key: rows[index].itemKey,
      title: `Practice ${index + 1}`,
      date: "2030-01-08",
      minutes: 45,
      topicKey: `topic-${(index % 6) + 1}`,
      stage: "PRACTICE",
    }));
    const proposed = baseItems.map((item, index) => ({
      key: item.key,
      title: item.title,
      date: "2030-01-09",
      minutes: item.minutes,
      topicKey: item.topicKey,
      stage: item.stage,
      retainedKey: rows[index].itemKey,
    }));
    const diff = rebalanceDiff({
      baseItems,
      snapshot: executionSnapshot(
        rows.slice(0, REBALANCE_LIMITS.items).map((row) => ({
          ...row,
          disposition: "LIVE",
          status: "PENDING",
          completedAt: null,
          elapsedSeconds: 0,
          sessions: 0,
          activeSession: false,
        })),
        "2030-01-10"
      ),
      proposed,
      topicTitles: new Map(
        Array.from({ length: 6 }, (_, index) => [`topic-${index + 1}`, `Topic ${index + 1}`])
      ),
    });
    const diffBytes = bytes(diff.entries);
    report("diff entries measured", diff.entries.length);
    report("diff render bytes", diffBytes);
    expect(diff.entries.length).toBeLessThanOrEqual(REBALANCE_LIMITS.items);
    expect(diff.affectedHistory).toBe(0);
    expect(diffBytes).toBeLessThanOrEqual(LIMITS.payloadBytes);

    // 3. A real replan, end to end: the payload the provider receives, the metadata
    //    the plan stores, and the draft the revision carries.
    const p = await confirmedExam();
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: 2,
      baseRevisionId: p.revision.id,
      reasonCode: "AVAILABILITY_CHANGED",
      inputChanges: ["AVAILABILITY"],
      scope: { milestoneKey: null },
    });
    const args = await rebalanceGenerationArgs(userId, p.plan.id, begin.operationKey);
    const payloadBytes = Buffer.byteLength(rebalancePayload(args), "utf8");
    report("availability snapshot bytes", bytes(args.availability));
    report("provider payload bytes (EXAM)", payloadBytes);
    report("provider payload units", args.units.length);
    report("provider payload eligible", args.eligible.length);
    expect(payloadBytes).toBeLessThanOrEqual(LIMITS.payloadBytes);
    expect(args.units.length).toBeLessThanOrEqual(LIMITS.items);

    // The proposal a user actually confirms: the remaining work kept as it is, which
    // is what makes the seal measurable on the real path rather than on a fixture that
    // re-plans work which already exists.
    const eligible = (
      begin.inputSnapshot as {
        rebalance: { eligible: { ref: string; itemKey: string }[] };
      }
    ).rebalance.eligible;
    const proposal = ModelProposalV1Schema.parse({
      ...examProposal(),
      items: eligible.map((token, index) => {
        const item = p.draft.items.find((entry) => entry.key === token.itemKey)!;
        return {
          ref: `i${index + 1}`,
          topicRef: `t${
            p.draft.topics.findIndex((topic) => topic.key === item.topicKey) + 1
          }`,
          relatedTopicRefs: (item.relatedTopicKeys ?? []).map(
            (key) => `t${p.draft.topics.findIndex((topic) => topic.key === key) + 1}`
          ),
          milestoneRef: null,
          dependsOn: [],
          type: item.type,
          stage: item.stage ?? undefined,
          title: item.title,
          description: item.description,
          rationale: item.rationale ?? "Keeps the remaining work where it is.",
          completionCriteria: item.completionCriteria,
          date: item.date,
          minutes: item.minutes,
          retainRef: token.ref,
        };
      }),
    });
    const sealed = await finishRebalance(
      userId,
      p.plan.id,
      begin.operationKey,
      proposal
    );
    const stored = await prisma.plannerRevision.findUniqueOrThrow({
      where: { id: sealed.revision.id },
    });
    const inputBytes = bytes(stored.inputSnapshot);
    const outputBytes = bytes(stored.outputSnapshot);
    const metadata = (
      stored.inputSnapshot as { rebalance?: unknown }
    ).rebalance;
    const metadataSize = bytes(metadata);
    report("sealed revision input bytes", inputBytes);
    report("sealed replan metadata bytes", metadataSize);
    report("sealed revision output bytes", outputBytes);
    report("base revision output bytes", bytes(p.revision.outputSnapshot));
    expect(inputBytes).toBeLessThanOrEqual(LIMITS.inputBytes);
    expect(metadataSize).toBeLessThanOrEqual(REBALANCE_LIMITS.metadataBytes);
    expect(outputBytes).toBeLessThanOrEqual(LIMITS.payloadBytes);

    // 4. The confirmation itself: one transaction, measured the honest way — what the
    //    database was asked to do, and how long the user waits.
    const queries: { query: string; duration: number }[] = [];
    let collecting = false;
    const listener = (event: { query: string; duration: number }) => {
      if (collecting) queries.push({ query: event.query, duration: event.duration });
    };
    prisma.$on("query" as never, listener as never);
    collecting = true;
    const startedAt = performance.now();
    const receipt = await confirmRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: sealed.revision.id,
      digest: sealed.revision.digest!,
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    collecting = false;
    const writes = queries.filter((entry) =>
      /^\s*(INSERT|UPDATE|DELETE)/i.test(entry.query)
    ).length;
    report("confirmation wall ms", elapsedMs);
    report("confirmation queries", queries.length);
    report("confirmation write statements", writes);
    report("confirmation receipt items", receipt.items.length);
    expect(receipt.items.length).toBeGreaterThan(0);
    // A confirmation is a bounded amount of work on a bounded plan: it must not fan
    // out into per-Quest round trips the way an unbounded reconciler would.
    expect(queries.length).toBeLessThanOrEqual(60);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 60_000);

  it("measures the A2/A3 context cost and its effect on the payload", async () => {
    // §59/§65 of the phase goal: what the A2/A3 layer actually costs. Three numbers
    // matter — how many queries the context read adds, how big the payload grows, and
    // what the Coverage Map derivation costs at maximum scope.
    const p = await confirmedExam();
    const plan = await prisma.plannerPlan.findUniqueOrThrow({
      where: { id: p.plan.id },
    });
    const begin = await beginRebalance(userId, p.plan.id, {
      schemaVersion: 1,
      requestKey: randomUUID(),
      expectedVersion: plan.version,
      baseRevisionId: p.revision.id,
      reasonCode: "USER_REQUESTED",
      inputChanges: [],
      scope: { milestoneKey: null },
    });

    // 1. The context read, counted the honest way.
    const queries: string[] = [];
    let collecting = false;
    const listener = (event: { query: string }) => {
      if (collecting) queries.push(event.query);
    };
    prisma.$on("query" as never, listener as never);
    collecting = true;
    const plain = await rebalanceGenerationArgs(userId, p.plan.id, begin.operationKey);
    collecting = false;
    // Prisma quotes the model name it was generated from, so match both spellings
    // rather than the SQL table name alone — counting zero because the pattern was
    // wrong would be a measurement artifact, not a result.
    const contextQueries = queries.filter((query) =>
      /planner[\s"]*_?preference|planner[\s"]*_?friction/i.test(query)
    ).length;
    const payloadWithout = Buffer.byteLength(rebalancePayload(plain), "utf8");
    report("context read queries (preferences + friction)", contextQueries);
    report("provider payload bytes without context", payloadWithout);
    // One read each, never one per item and never inside a loop.
    expect(contextQueries).toBeLessThanOrEqual(4);

    // 2. With one learned preference and one friction reason: the payload grows by the
    //    bounded context block and by nothing else.
    for (const _ of [1, 2, 3])
      await recordCandidateObservation(userId, p.plan.id, {
        schemaVersion: 1,
        preferenceType: "SESSION_LENGTH",
        value: "40",
      });
    await recordFriction(userId, p.plan.id, {
      schemaVersion: 1,
      revisionId: p.revision.id,
      itemKey: p.draft.items[0].key,
      reasonCode: "TOO_LONG",
    });
    const withContext = await rebalanceGenerationArgs(
      userId,
      p.plan.id,
      begin.operationKey
    );
    const payloadWith = Buffer.byteLength(rebalancePayload(withContext), "utf8");
    report("provider payload bytes with context", payloadWith);
    report("payload growth bytes", payloadWith - payloadWithout);
    expect(withContext.planningContext?.preferences).toHaveLength(1);
    // A single preference and a single reason are a handful of tokens: the envelope
    // must not move materially, and it must stay data, never prose.
    expect(payloadWith - payloadWithout).toBeLessThanOrEqual(512);

    // 3. Coverage Map derivation at maximum scope: pure, bounded, no queries.
    const items = Array.from({ length: LIMITS.items }, (_, index) => ({
      key: `i${index}`,
      topicKey: p.draft.topics[index % p.draft.topics.length].key,
      type: index % 3 === 0 ? "PRACTICE" : index % 3 === 1 ? "RECALL" : "LEARN",
      date: `2030-01-${String((index % 28) + 1).padStart(2, "0")}`,
      role: index % 5 === 0 ? ("STRETCH" as const) : ("CORE" as const),
    }));
    const units = p.draft.topics.map((topic) => ({
      key: topic.key,
      title: topic.title,
    }));
    const startedAt = performance.now();
    const map = coverageMap({ units, items });
    const coverageMs = performance.now() - startedAt;
    report("coverage map ms at 60 items", coverageMs.toFixed(2));
    report("coverage map render bytes", bytes(map));
    expect(map.units).toHaveLength(units.length);
    expect(coverageMs).toBeLessThan(50);
    expect(bytes(map)).toBeLessThanOrEqual(LIMITS.payloadBytes);
  }, 60_000);
});
