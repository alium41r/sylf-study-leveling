import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { connect, user } from "./database";
import {
  reviewedFixture,
  reviewResponse,
  reviewSignal,
} from "./reviewed-learning-fixture";
import { AttemptService } from "@/lib/planner/v2/server/attempts";
import {
  PlannerDatabase,
  DurablePlannerError,
} from "@/lib/planner/v2/server/database";
import { StudentWorkspaceService } from "@/lib/planner/v2/server/student-workspace";
import { AssistantService } from "@/lib/planner/v2/server/assistant";
import { RevisionService } from "@/lib/planner/v2/server/revisions";
import { ApplyService } from "@/lib/planner/v2/server/apply";

describe("Student Planner workspace, scripted unpaid stage smoke", () => {
  let client: pg.Client, pool: pg.Pool, db: PlannerDatabase;
  const owners: number[] = [];
  beforeAll(async () => {
    client = await connect();
    pool = new pg.Pool({
      connectionString: process.env.PLANNER_TEST_DATABASE_URL,
      max: 6,
    });
    db = new PlannerDatabase(pool);
  });
  afterEach(async () => {
    for (const id of owners.splice(0))
      for (const row of (
        await client.query(
          "SELECT id FROM \"PlannerAttempt\" WHERE \"userId\"=$1 AND state IN ('RUNNING','QUEUED','NEEDS_DECISION')",
          [id]
        )
      ).rows)
        await new AttemptService(db).cancel(id, row.id);
  });
  afterAll(async () => {
    await pool?.end();
    await client?.end();
  });
  async function fixture(options: Parameters<typeof reviewedFixture>[2] = {}) {
    const owner = await user(client);
    owners.push(owner);
    return reviewedFixture(client, db, { ...options, owner });
  }
  it("retains every stage, shows reviewed preview, confirms atomically and reopens the active plan", async () => {
    const f = await fixture();
    const service = new StudentWorkspaceService(db),
      planId = f.attempt.targets[0].planId;
    const draft = await service.read(f.owner, planId);
    expect(draft.draft?.strategies[0].text).toContain("circuit");
    expect(draft.draft?.activitiesStrategyId).toBe(
      draft.draft?.strategies[0].id
    );
    expect(
      draft.draft?.blueprints[0].blueprint.activities.length
    ).toBeGreaterThan(0);
    expect(draft.draft?.allocation?.status).toBe("FEASIBLE");
    expect(draft.workspace.allowedActions).not.toContain("CONFIRM");
    await f.reviewed.run(f.token, reviewSignal());
    const changeSet = await new RevisionService(f.attempts).publishReviewed(
      f.token
    );
    const preview = await service.read(f.owner, planId);
    expect(preview.draft?.reviews.some((r) => r.verdict === "APPROVED")).toBe(
      true
    );
    expect(preview.workspace.allowedActions).toContain("CONFIRM");
    expect(preview.changeSet?.changeSetId).toBe(changeSet.changeSetId);
    expect(f.calls.map((c) => c.role)).toEqual(
      expect.arrayContaining([
        "RESEARCH",
        "SYNTHESIS",
        "STRATEGIST",
        "TRANSLATOR",
        "REVIEWER",
      ])
    );
    const receipt = await new ApplyService(db).apply(f.owner, {
      attemptId: f.attempt.attemptId,
      changeSetId: changeSet.changeSetId,
      acknowledgements: [],
    });
    expect(
      (await service.read(f.owner, planId)).workspace.active?.revisionId
    ).toBe(receipt.targets[0].revisionId);
    expect((await service.list(f.owner)).plans).toContainEqual(
      expect.objectContaining({ planId, state: "ACTIVE" })
    );
    expect(
      (await service.read(f.owner, planId)).draft?.strategies[0].text
    ).toBe(draft.draft!.strategies[0].text);
  }, 30000);
  it("shows a complete authored draft when independent review cannot approve it", async () => {
    const f = await fixture({
      reply: () => ({
        ...reviewResponse(),
        verdict: "INCOMPLETE",
        explanation:
          "Scripted educational uncertainty remains; preserve the draft for manual inspection.",
      }),
    });
    await f.reviewed.run(f.token, reviewSignal());
    await f.attempts.fail(
      f.token,
      new DurablePlannerError(
        "QUALITY_INCOMPLETE",
        "Review could not approve this draft.",
        "REVIEW"
      )
    );
    const view = await new StudentWorkspaceService(db).read(
      f.owner,
      f.attempt.targets[0].planId
    );
    expect(view.draft?.strategies.length).toBeGreaterThan(0);
    expect(
      view.draft?.blueprints[0].blueprint.activities.length
    ).toBeGreaterThan(0);
    expect(view.draft?.reviews[0].verdict).toBe("INCOMPLETE");
    expect(view.changeSet).toBeNull();
    expect(view.workspace.allowedActions).not.toContain("CONFIRM");
    expect(
      (
        await client.query('SELECT count(*) FROM "Quest" WHERE "userId"=$1', [
          f.owner,
        ])
      ).rows[0].count
    ).toBe("0");
  }, 30000);
  it("rejects foreign reads and saves free feedback with replay and conversation CAS", async () => {
    const f = await fixture(),
      planId = f.attempt.targets[0].planId,
      outsider = await user(client);
    owners.push(outsider);
    await expect(
      new StudentWorkspaceService(db).read(outsider, planId)
    ).rejects.toMatchObject({ detail: { code: "PLAN_NOT_FOUND" } });
    const assistant = new AssistantService(db),
      input = {
        key: randomUUID(),
        text: "I need more worked examples before independent practice.",
        expectedConversationVersion: 0,
      };
    const before = (
      await client.query(
        'SELECT count(*) FROM "AiUsageLog" WHERE "userId"=$1',
        [f.owner]
      )
    ).rows[0].count;
    await assistant.note(f.owner, planId, input);
    expect((await assistant.note(f.owner, planId, input)).replayed).toBe(true);
    await expect(
      assistant.note(f.owner, planId, { ...input, key: randomUUID() })
    ).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    const view = await new StudentWorkspaceService(db).read(f.owner, planId);
    expect(view.conversation.events[0].text).toBe(input.text);
    expect(view.workspace.planningVersion).toBe(0);
    expect(
      (
        await client.query(
          'SELECT count(*) FROM "AiUsageLog" WHERE "userId"=$1',
          [f.owner]
        )
      ).rows[0].count
    ).toBe(before);
  }, 30000);
  it("corrects a settled foreign research binding under the same financial root without accepting it", async () => {
    const f = await fixture({
      documents: 1,
      respond: (role, packet, index) =>
        role === "VERIFICATION"
          ? {
              claims: (packet.candidates as { claimId: string }[]).map((c) => ({
                claimId: c.claimId,
                support: "SUPPORTED",
                applicability: "MATCHED",
                reason: "Literal circuit resource",
              })),
              identities: [],
              completeSourceIds: [],
              conflicts: [],
              answer: "Original applicable resource",
              scopeBindings: (packet.candidates as { claimId: string }[]).map(
                (c) => ({
                  claimId: c.claimId,
                  scopeRefs:
                    index === 1
                      ? ["plan_2:scope_electricity"]
                      : ["plan_1:scope_electricity"],
                  disposition: "ANNOTATE_SCOPE",
                })
              ),
            }
          : undefined,
    });
    const calls = f.calls.filter((c) => c.role === "VERIFICATION");
    expect(calls).toHaveLength(2);
    expect(calls[1].packet.validationRecovery).toBeDefined();
    const view = await new StudentWorkspaceService(db).read(
      f.owner,
      f.attempt.targets[0].planId
    );
    expect(view.draft?.strategies).toHaveLength(1);
    const logs = (
      await client.query(
        'SELECT "accountingState",reservation,"rootRequestId" FROM "AiUsageLog" WHERE "userId"=$1',
        [f.owner]
      )
    ).rows;
    expect(new Set(logs.map((r) => r.rootRequestId)).size).toBe(1);
    expect(logs.every((r) => r.accountingState === "SETTLED")).toBe(true);
    expect(
      logs.some(
        (r) =>
          r.reservation.accepted === false &&
          r.reservation.result.text.includes("plan_2:scope_electricity")
      )
    ).toBe(true);
  }, 30000);
  it("keeps the earlier draft visible while a linked continuation retains its root and original deadline", async () => {
    const f = await fixture(),
      planId = f.attempt.targets[0].planId,
      service = new StudentWorkspaceService(db);
    const before = await service.read(f.owner, planId);
    await f.attempts.fail(
      f.token,
      new DurablePlannerError(
        "QUALITY_INCOMPLETE",
        "Explicit stopped-draft continuation fixture",
        "REVIEW"
      )
    );
    const parent = await f.research
      .understanding()
      .read(f.owner, f.attempt.attemptId);
    const child = await f.research.understanding().continue(f.owner, {
      key: randomUUID(),
      parentAttemptId: f.attempt.attemptId,
      expectedResearchDigest: parent.run!.digest,
      ...(parent.continuationContextDigest
        ? { expectedFoundationDigest: parent.continuationContextDigest }
        : {}),
      answers: [],
      intents: [
        {
          planId,
          expectedIntentId: before.intent.intentVersionId,
          expectedPlanningVersion: before.workspace.planningVersion,
          baseRevisionId: null,
        },
      ],
    });
    const reopened = await service.read(f.owner, planId);
    expect(reopened.attempt?.attemptId).toBe(child.attempt.attemptId);
    expect(reopened.draft?.retainedFromEarlierAttempt).toBe(true);
    expect(reopened.draft?.attemptId).toBe(f.attempt.attemptId);
    expect(reopened.draft?.strategies[0].text).toBe(
      before.draft!.strategies[0].text
    );
    expect(child.attempt.budget.rootRequestId).toBe(
      f.attempt.budget.rootRequestId
    );
    expect(child.attempt.budget.executionDeadlineAt).toBe(
      (await f.attempts.read(f.owner, f.attempt.attemptId)).budget
        .executionDeadlineAt
    );
    expect(reopened.workspace.allowedActions).not.toContain("CONFIRM");
    expect(reopened.attemptHistory).toHaveLength(2);
  }, 30000);
  it("rejects a fresh preview request over a still-running journey before touching its budget or lifecycle", async () => {
    const f = await fixture(),
      planId = f.attempt.targets[0].planId,
      view = await new StudentWorkspaceService(db).read(f.owner, planId);
    await expect(
      new StudentWorkspaceService(db).generate(f.owner, {
        action: "GENERATE",
        profile: "student-preview-v1",
        consent: true,
        request: {
          schemaVersion: 2,
          requestKey: randomUUID(),
          text: "An explicit new request must not silently supersede running work",
          targets: [
            {
              kind: "EXISTING",
              planId,
              expectedIntentVersionId: view.intent.intentVersionId,
              expectedPlanningVersion: view.workspace.planningVersion,
              baseActiveRevisionId: null,
            },
          ],
        },
      })
    ).rejects.toMatchObject({ detail: { code: "INTENT_CONFLICT" } });
    expect((await f.attempts.read(f.owner, f.attempt.attemptId)).state).toBe(
      "RUNNING"
    );
    expect(
      (await new StudentWorkspaceService(db).read(f.owner, planId)).usage?.calls
    ).toBe(view.usage?.calls);
  }, 30000);
});
