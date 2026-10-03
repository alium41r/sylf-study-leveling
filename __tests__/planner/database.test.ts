// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { CommitRequest, ValidatedDraftV1 } from "@/lib/planner/contracts";
import { fixtureInput, fixtureProposal } from "./fixtures";
import { examFixture, examProposal } from "./exam-fixtures";
import {
  roadmapAvailability,
  roadmapFixture,
  roadmapProposal,
} from "./roadmap-fixtures";
import type { ExpansionItem } from "@/lib/planner/expansion-fields";
import { beginExpansion, finishExpansion, expansionLineage } from "@/lib/planner/server/operations";
import { expansionScope } from "@/lib/planner/expansion-policy";
import { roadmapStructureForComparison, type RoadmapDraft } from "@/lib/planner/roadmap-policy";
import { generationResponse, recoverGeneration } from "@/lib/planner/server/generation";
import { POST as generationRoute } from "@/app/api/planner/generate/route";
import * as examStrategy from "@/lib/ai/planner/exam";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { DEEPSEEK_MODELS, GEMINI_MODELS } from "@/lib/ai/config";
import { loadAvailability } from "@/lib/planner/server/core";
import { completionCriteriaIssue } from "@/lib/planner/done";

// Opt-in only. Never use DATABASE_URL, DIRECT_URL, or a hosted database here.
const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("planner")) throw new Error("Disposable localhost planner database required");
  }
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }) }) };
});
import { prisma } from "@/lib/prisma";
import { createPlanShell, saveValidatedDraft, appendEdit, getRevision, getPlanDetail, archivePlan } from "@/lib/planner/server/revisions";
import { confirmDraft, type WriteBoundary } from "@/lib/planner/server/materialize";
import { manualLinkedQuest, manualPlannerGoal, assertNoPlannerGoals, assertNoLinkedQuests, deleteUnlinkedGoals } from "@/lib/planner/server/mutation-guards";
import { beginOperation, finishOperation, recoverOperation } from "@/lib/planner/server/operations";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "@/lib/difficulty-engine";
import { quotaReceiptBucket, reserveRevisionQuota, settleRevisionQuota } from "@/lib/ai/usage-limiter";
import { StudyScheduleService } from "@/lib/study-schedule-service";
import { GET as detailRoute } from "@/app/api/planner/[id]/route";
import { POST as commitRoute } from "@/app/api/planner/[id]/commit/route";
import { POST as editRoute } from "@/app/api/planner/[id]/revisions/route";
import { signToken } from "@/lib/auth";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";

describe.skipIf(!database)("planner PostgreSQL transactions and routes", () => {
  let userId: number; let strangerId: number;
  beforeEach(async () => {
    const createUser = () => prisma.user.create({ data: { email: `${randomUUID()}@planner.test`, username: randomUUID(), timezone: "UTC", restDays: [] } });
    userId = (await createUser()).id; strangerId = (await createUser()).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });
  async function prepared(options: { subjectId?: number; goalId?: number; minutes?: number } = {}) {
    const plan = await createPlanShell(userId, { mode: "EXAM", title: "Algebra", creationKey: randomUUID(), subjectId: options.subjectId ?? null, goalId: options.goalId ?? null });
    const proposal = fixtureProposal();
    if (options.minutes) { proposal.items = [{ ...proposal.items[0], minutes: options.minutes }]; }
    const revision = await saveValidatedDraft(userId, plan.id, { input: fixtureInput(), proposal, expectedVersion: 0, operationKey: randomUUID() });
    const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
    const body: CommitRequest = { schemaVersion: 1, revisionId: revision.id, digest: revision.digest!, expectedVersion: 1, idempotencyKey: randomUUID(), selectedItemKeys: draft.items.map(i => i.key), createGoal: true };
    return { plan, revision, draft, body };
  }
  async function request(uid: number, body?: unknown, version = 1) {
    const token = await signToken({ userId: uid, tokenVersion: version });
    return new Request("http://localhost/api/planner", { method: body ? "POST" : "GET", headers: { cookie: `hunter_token=${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  it("maps owned Subjects to ordinary PENDING Quests with canonical rewards and no progress", async () => {
    const subject = await prisma.subject.create({ data: { userId, name: "Algebra", code: randomUUID() } });
    const p = await prepared({ subjectId: subject.id });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const receipt = await confirmDraft(userId, p.plan.id, p.body);
    const quests = await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } });
    expect(quests).toHaveLength(2); expect(receipt.items.map(i => i.questId)).toEqual(quests.map(q => q.id));
    for (const q of quests) {
      const difficulty = calculateRecommendedDifficulty(q.requiredMinutes); const rewards = calculateQuestRewards(q.requiredMinutes, difficulty);
      expect(q).toMatchObject({ targetMinutes: q.requiredMinutes, status: "PENDING", difficulty, xpReward: rewards.xp, sylphReward: rewards.sylph, subjectId: subject.id, subjectNodeId: null, elapsedSeconds: 0, completedAt: null });
    }
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([after.currentXP,after.sylph,after.totalStudySeconds]).toEqual([before.currentXP,before.sylph,before.totalStudySeconds]);
    expect(await prisma.userQuota.count({ where: { userId } })).toBe(0);
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(0);
    expect(await prisma.goal.count({ where: { userId } })).toBe(1);
  });
  it("does not create a Goal unless explicitly requested", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, { ...p.body, createGoal: false });
    expect(receipt.goalId).toBeNull(); expect(await prisma.goal.count({ where: { userId } })).toBe(0);
  });
  it("fails closed on scheduling data errors and infeasible previews", async () => {
    const plan = await createPlanShell(userId, { mode: "EXAM", title: "Unavailable schedule", creationKey: randomUUID(), subjectId: null, goalId: null });
    const load = vi.spyOn(prisma.floatingRestDay, "findMany").mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
    await expect(loadAvailability(prisma, plan, fixtureInput())).rejects.toThrow("DATABASE_UNAVAILABLE");
    load.mockRestore();
    await prisma.user.update({ where: { id: userId }, data: { restDays: [1] } });
    await expect(saveValidatedDraft(userId, plan.id, { input: fixtureInput(), proposal: fixtureProposal(), expectedVersion: 0, operationKey: randomUUID() })).rejects.toMatchObject({ status: 422 });
    expect(await prisma.plannerRevision.count({ where: { planId: plan.id } })).toBe(0);
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });
  it("rejects foreign Subjects, plans, revisions and commits without revealing them", async () => {
    const foreign = await prisma.subject.create({ data: { userId: strangerId, name: "Private", code: randomUUID() } });
    await expect(prepared({ subjectId: foreign.id })).rejects.toMatchObject({ status: 404 });
    const p = await prepared();
    await expect(getPlanDetail(strangerId, p.plan.id)).rejects.toMatchObject({ status: 404 });
    await expect(getRevision(strangerId, p.plan.id, p.revision.id)).rejects.toMatchObject({ status: 404 });
    await expect(confirmDraft(strangerId, p.plan.id, p.body)).rejects.toMatchObject({ status: 404 });
    const other = await prepared();
    await expect(confirmDraft(userId, other.plan.id, { ...other.body, revisionId: p.revision.id })).rejects.toMatchObject({ status: 404 });
  });
  it("uses real cookie auth and tokenVersion revocation on the actual routes", async () => {
    const p = await prepared(); const ctx = { params: Promise.resolve({ id: p.plan.id }) };
    expect((await detailRoute(await request(userId), ctx)).status).toBe(200);
    expect((await detailRoute(await request(strangerId), ctx)).status).toBe(404);
    expect((await commitRoute(await request(strangerId, p.body), ctx)).status).toBe(404);
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: 2 } });
    expect((await detailRoute(await request(userId), ctx)).status).toBe(401);
    expect((await commitRoute(await request(userId, p.body), ctx)).status).toBe(401);
    const token = await signToken({ userId, tokenVersion: 2 });
    expect((await detailRoute(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }), ctx)).status).toBe(401);
    expect((await editRoute(await request(userId, { schemaVersion: 1, proposal: fixtureProposal() }, 2), ctx)).status).toBe(400);
    // This line used to turn the feature gate off and assert the resulting 404. The
    // gate is gone, so the property worth asserting is the one it must never have been
    // load-bearing for: the same route refuses an unauthenticated caller, and accepts
    // the owner.
    expect((await detailRoute(new Request("http://localhost"), ctx)).status).toBe(401);
    expect((await detailRoute(await request(userId, undefined, 2), ctx)).status).toBe(200);
  });
  /**
   * Every write boundary rolls back cleanly.
   *
   * The list is asserted explicitly rather than merely counted, because the count is a
   * property of the confirmation that genuinely changes: it was seven while each item wrote
   * its own Quest and link, and it is five once those became two batched statements. A test
   * that only counted would still pass with the wrong boundaries in the wrong order; this one
   * says what the sequence is, so a change to it has to be made deliberately.
   *
   * The `quest` and `link` boundaries are reported once each, for the whole batch — which is
   * the point of the batching, not an accident of it.
   */
  const CONFIRM_BOUNDARIES: WriteBoundary[] = ["goal", "quest", "link", "pointer", "receipt"];

  it("writes exactly the boundaries it says it does, once each", async () => {
    const p = await prepared();
    const observed: WriteBoundary[] = [];
    await confirmDraft(userId, p.plan.id, p.body, (boundary) => observed.push(boundary));
    expect(observed).toEqual(CONFIRM_BOUNDARIES);
  });

  for (let failAt = 1; failAt <= CONFIRM_BOUNDARIES.length; failAt++)
    it(`rolls back every write when boundary ${failAt}/${CONFIRM_BOUNDARIES.length} fails`, async () => {
      const p = await prepared(); let calls = 0; const observed: WriteBoundary[] = [];
      await expect(confirmDraft(userId, p.plan.id, p.body, boundary => { observed.push(boundary); if (++calls === failAt) throw new Error("INJECTED_FAILURE"); })).rejects.toThrow("INJECTED_FAILURE");
      expect(await prisma.quest.count({ where: { userId } })).toBe(0);
      expect(await prisma.goal.count({ where: { userId } })).toBe(0);
      expect(await prisma.plannerQuestLink.count({ where: { planId: p.plan.id } })).toBe(0);
      expect(await prisma.plannerPlan.findUnique({ where: { id: p.plan.id } })).toMatchObject({ version: 1, activeRevisionId: null, latestDraftRevisionId: p.revision.id });
      expect(await prisma.plannerRevision.findUnique({ where: { id: p.revision.id } })).toMatchObject({ confirmationReceipt: null, confirmationKey: null });
      expect(observed).toHaveLength(failAt);
    });
  it("replays concurrent double clicks, rejects changed bodies and recovers a lost response", async () => {
    const p = await prepared();
    const [a,b] = await Promise.all([confirmDraft(userId, p.plan.id, p.body), confirmDraft(userId, p.plan.id, p.body)]);
    expect(a).toEqual(b); expect(await prisma.quest.count({ where: { userId } })).toBe(2);
    expect(await confirmDraft(userId, p.plan.id, p.body)).toEqual(a);
    await expect(confirmDraft(userId, p.plan.id, { ...p.body, createGoal: false })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_MISMATCH" });
    await expect(confirmDraft(userId, p.plan.id, { ...p.body, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect((await recoverOperation(userId, p.plan.id, p.body.idempotencyKey, false, "confirmation")).confirmationReceipt).toEqual(a);
    await archivePlan(userId, p.plan.id, a.version);
    expect(await confirmDraft(userId, p.plan.id, p.body)).toEqual(a);
  });
  it("serializes two-plan capacity races", async () => {
    const a = await prepared({ minutes: 90 }); const b = await prepared({ minutes: 90 });
    const results = await Promise.allSettled([confirmDraft(userId, a.plan.id, a.body), confirmDraft(userId, b.plan.id, b.body)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.quest.count({ where: { userId } })).toBe(1);
  });
  it.each(["edit", "delete", "complete", "session", "rest", "floating", "timezone"])("rejects a stale preview after %s", async kind => {
    const first = await prepared(); const receipt = await confirmDraft(userId, first.plan.id, first.body);
    const questId = receipt.items[0].questId;
    const edited = await appendEdit(userId, first.plan.id, { schemaVersion: 1, baseRevisionId: first.revision.id, expectedVersion: 2, operationKey: randomUUID(), edits: [{ key: first.draft.items[0].key, description: first.draft.items[0].description }] });
    const body = { ...first.body, revisionId: edited.id, digest: edited.digest!, expectedVersion: 3, idempotencyKey: randomUUID(), createGoal: false };
    if (kind === "edit") await manualLinkedQuest(userId, questId, { title: "My explicit edit" });
    if (kind === "delete") await manualLinkedQuest(userId, questId, {}, true);
    if (kind === "complete") await prisma.quest.update({ where: { id: questId }, data: { status: "COMPLETED", completedAt: new Date(), elapsedSeconds: 2700 } });
    if (kind === "session") await prisma.studySession.create({ data: { userId, questId, durationMinutes: 0 } });
    if (kind === "rest") await prisma.user.update({ where: { id: userId }, data: { restDays: [1] } });
    if (kind === "floating") await prisma.floatingRestDay.create({ data: { userId, dateKey: "2030-01-07", weekKey: "2030-W02" } });
    if (kind === "timezone") await prisma.user.update({ where: { id: userId }, data: { timezone: "Asia/Karachi" } });
    await expect(confirmDraft(userId, first.plan.id, body)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.quest.count({ where: { userId } })).toBe(kind === "delete" ? 1 : 2);
  });
  it("retains stable keys in EDIT revisions and seals content at database level", async () => {
    const p = await prepared();
    const body = { schemaVersion: 1, baseRevisionId: p.revision.id, expectedVersion: 1, operationKey: randomUUID(), edits: [{ key: p.draft.items[0].key, title: "Edited before confirm" }] };
    const edit = await appendEdit(userId, p.plan.id, body);
    expect((edit.outputSnapshot as unknown as ValidatedDraftV1).items.map(i => i.key)).toEqual(p.draft.items.map(i => i.key));
    expect((await appendEdit(userId, p.plan.id, body)).id).toBe(edit.id);
    await expect(confirmDraft(userId, p.plan.id, p.body)).rejects.toMatchObject({ status: 409 });
    await expect(prisma.plannerRevision.update({ where: { id: p.revision.id }, data: { inputSnapshot: { overwritten: true } } })).rejects.toThrow();
    const accepted = await confirmDraft(userId, p.plan.id, { ...p.body, revisionId: edit.id, digest: edit.digest!, expectedVersion: 2 });
    await expect(prisma.plannerRevision.update({ where: { id: edit.id }, data: { confirmationReceipt: { overwritten: true } } })).rejects.toThrow();
    await archivePlan(userId, p.plan.id, accepted.version);
    expect(await prisma.quest.count({ where: { userId } })).toBe(2);
  });
  it("preserves real Focus settlement and rejects the earlier preview after completion", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body); const questId = receipt.items[0].questId;
    const edit = await appendEdit(userId, p.plan.id, { schemaVersion: 1, baseRevisionId: p.revision.id, expectedVersion: 2, operationKey: randomUUID(), edits: [{ key: p.draft.items[0].key, description: p.draft.items[0].description }] });
    const sessions = await prisma.$queryRaw<Array<{ result: { id: number } }>>`SELECT public.start_study_session(${userId}::int, ${questId}::int, NULL::int, 0::int) AS result`;
    await prisma.studySession.update({ where: { id: sessions[0].result.id }, data: { startedAt: new Date(Date.now() - 3600000) } });
    await prisma.$queryRaw`SELECT public.settle_study_session_atomic(${userId}::int, ${sessions[0].result.id}::int, 2700::int, 0::int, ${questId}::int, NULL::int, true, true, '2030-01-07'::text)`;
    expect(await prisma.quest.findUnique({ where: { id: questId } })).toMatchObject({ status: "COMPLETED" });
    await expect(confirmDraft(userId, p.plan.id, { ...p.body, revisionId: edit.id, digest: edit.digest!, expectedVersion: 3, createGoal: false, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.quest.findUnique({ where: { id: questId } })).toMatchObject({ status: "COMPLETED", requiredMinutes: 45, targetMinutes: 45 });
  });
  it("allows intentional Goal metadata edits but blocks automatic adjustment before it changes anything", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body);
    const goalId = receipt.goalId!;
    await expect(prisma.goal.update({ where: { id: goalId }, data: { targetWeeks: 8 } })).rejects.toThrow();
    await manualPlannerGoal(userId, goalId, { title: "My explicit objective title" });
    expect(await prisma.goal.findUnique({ where: { id: goalId } })).toMatchObject({ title: "My explicit objective title", targetWeeks: 1 });
  });
  it("preserves explicit whole-account deletion including completed planner history", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body);
    await prisma.quest.update({ where: { id: receipt.items[0].questId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.plannerPlan.findUnique({ where: { id: p.plan.id } })).toBeNull();
    expect(await prisma.plannerRevision.count({ where: { planId: p.plan.id } })).toBe(0);
    expect(await prisma.plannerQuestLink.count({ where: { planId: p.plan.id } })).toBe(0);
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });
  it("preserves the planner Goal deadline date in a timezone west of UTC", async () => {
    await prisma.user.update({ where: { id: userId }, data: { timezone: "America/Los_Angeles" } });
    const p = await prepared(); await confirmDraft(userId, p.plan.id, p.body);
    const calendar = await StudyScheduleService.getMonthCalendarData(userId, 2030, 0);
    expect(calendar.milestones[0].date).toBe("2030-01-11");
  });
  it("preserves deletion tombstones and never recreates them from an edited revision", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body);
    await manualLinkedQuest(userId, receipt.items[0].questId, {}, true);
    const link = await prisma.plannerQuestLink.findUniqueOrThrow({ where: { planId_itemKey: { planId: p.plan.id, itemKey: p.draft.items[0].key } } });
    expect(link).toMatchObject({ questId: null, disposition: "DELETED", createdRevisionId: p.revision.id }); expect(link.removedAt).not.toBeNull();
    const edit = await appendEdit(userId, p.plan.id, { schemaVersion: 1, baseRevisionId: p.revision.id, expectedVersion: 2, operationKey: randomUUID(), edits: [{ key: p.draft.items[0].key, title: "Try to recreate" }] });
    await expect(confirmDraft(userId, p.plan.id, { ...p.body, revisionId: edit.id, digest: edit.digest!, expectedVersion: 3, idempotencyKey: randomUUID(), createGoal: false })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.quest.count({ where: { userId } })).toBe(1);
  });
  it("allows safe explicit edits, marks the baseline detached and protects active/finished execution", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body); const questId = receipt.items[0].questId;
    await manualLinkedQuest(userId, questId, { requiredMinutes: 60, title: "Mine" });
    expect(await prisma.quest.findUnique({ where: { id: questId } })).toMatchObject({ requiredMinutes: 60, targetMinutes: 60, title: "Mine" });
    const link = await prisma.plannerQuestLink.findUniqueOrThrow({ where: { questId } });
    expect(link.disposition).toBe("DETACHED"); expect((link.baseline as { quest: { requiredMinutes: number } }).quest.requiredMinutes).toBe(45);
    await prisma.studySession.create({ data: { userId, questId, durationMinutes: 0 } });
    await expect(manualLinkedQuest(userId, questId, { scheduledFor: "2030-01-09" })).rejects.toMatchObject({ status: 409 });
    await expect(manualLinkedQuest(userId, questId, {}, true)).rejects.toMatchObject({ status: 409 });
    await manualLinkedQuest(userId, questId, { description: "Safe annotation" });
    await prisma.quest.update({ where: { id: questId }, data: { status: "COMPLETED" } });
    await expect(manualLinkedQuest(userId, questId, { title: "Overwrite completed" })).rejects.toMatchObject({ status: 409 });
  });
  it("blocks automatic/chat/Goal/cascade mutations while preserving non-planner behavior", async () => {
    const p = await prepared(); const receipt = await confirmDraft(userId, p.plan.id, p.body); const questId = receipt.items[0].questId;
    await expect(assertNoPlannerGoals(userId, [receipt.goalId!])).rejects.toMatchObject({ status: 409 });
    await expect(assertNoLinkedQuests(userId, { id: questId })).rejects.toMatchObject({ status: 409 });
    await expect(prisma.quest.update({ where: { id: questId }, data: { scheduledFor: "2030-01-09" } })).rejects.toThrow();
    await expect(prisma.quest.delete({ where: { id: questId } })).rejects.toThrow();
    await expect(prisma.goal.delete({ where: { id: receipt.goalId! } })).rejects.toThrow();
    const legacyGoal = await prisma.goal.create({ data: { userId, title: "Manual objective", targetWeeks: 2 } });
    await prisma.quest.create({ data: { userId, goalId: legacyGoal.id, title: "Manual objective task" } });
    await expect(deleteUnlinkedGoals(userId, [receipt.goalId!, legacyGoal.id])).rejects.toMatchObject({ status: 409 });
    expect(await prisma.quest.count({ where: { goalId: legacyGoal.id } })).toBe(1);
    expect(await deleteUnlinkedGoals(userId, [legacyGoal.id])).toEqual({ quests: 1, goals: 1 });
    expect(await executeChatTool("updateQuest", { questId, title: "Chat mutation" }, userId)).toMatchObject({ error: "PLANNER_REVIEW_REQUIRED" });
    await expect(prisma.$transaction(async tx => {
      await tx.floatingRestDay.create({ data: { userId, dateKey: "2030-01-07", weekKey: "2030-W02" } });
      await StudyScheduleService.cascadeQuestShifts(userId, "2030-01-07", { tx });
    })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.floatingRestDay.count({ where: { userId } })).toBe(0);
    const legacy = await prisma.quest.create({ data: { userId, title: "Legacy", status: "ACTIVE", scheduledFor: "2030-01-09" } });
    await assertNoLinkedQuests(userId, { id: legacy.id });
    await prisma.quest.update({ where: { id: legacy.id }, data: { title: "Edited" } });
    await prisma.quest.delete({ where: { id: legacy.id } });
  });
  it("reserves the final unit once and recovers a crashed operation into its original week", async () => {
    const p = await createPlanShell(userId, { mode: "EXAM", title: "Quota", creationKey: randomUUID(), subjectId: null, goalId: null });
    const raw = { operationKey: randomUUID(), expectedVersion: 0, input: fixtureInput() }; const beforeBoundary = new Date("2026-09-27T23:59:00Z");
    const op = await beginOperation(userId, p.id, raw, beforeBoundary);
    expect(op.operationState).toBe("PREPARING"); expect((await beginOperation(userId, p.id, raw, beforeBoundary)).id).toBe(op.id);
    await expect(beginOperation(userId, p.id, { ...raw, operationKey: randomUUID() }, beforeBoundary)).rejects.toMatchObject({ status: 429 });
    const originalBucket = (op.quotaReceipt as { dateKey: string }).dateKey;
    const later = new Date("2026-09-28T00:05:00Z");
    const next = await beginOperation(userId, p.id, { ...raw, operationKey: randomUUID() }, later);
    await recoverOperation(userId, p.id, raw.operationKey, true, "operation", later);
    await recoverOperation(userId, p.id, raw.operationKey, true, "operation", later);
    expect(await prisma.userQuota.findUnique({ where: { userId_feature_dateKey: { userId, feature: "planner", dateKey: originalBucket } } })).toMatchObject({ used: 0 });
    expect(await prisma.userQuota.findUnique({ where: { userId_feature_dateKey: { userId, feature: "planner", dateKey: (next.quotaReceipt as { dateKey: string }).dateKey } } })).toMatchObject({ used: 1 });
    await expect(finishOperation(userId, p.id, raw.operationKey, fixtureProposal(), later)).rejects.toMatchObject({ status: 409 });
  });
  it("settles once with the sealed result and cannot refund successful delivery", async () => {
    const p = await createPlanShell(userId, { mode: "EXAM", title: "Quota", creationKey: randomUUID(), subjectId: null, goalId: null });
    const key = randomUUID(); await beginOperation(userId, p.id, { operationKey: key, expectedVersion: 0, input: fixtureInput() });
    const result = await finishOperation(userId, p.id, key, fixtureProposal());
    expect((result.quotaReceipt as { state: string }).state).toBe("SETTLED");
    expect((await finishOperation(userId, p.id, key, fixtureProposal())).id).toBe(result.id);
    const recovered = await recoverOperation(userId, p.id, key, true, "operation", new Date("2031-01-01"));
    expect(recovered.quotaState).toBe("SETTLED"); expect(await prisma.userQuota.findFirst({ where: { userId } })).toMatchObject({ used: 1 });
  });
  it("uses the original daily bucket and rejects conflicting settlement", async () => {
    const now = new Date("2026-09-24T23:59:00Z"); const later = new Date("2026-09-25T00:05:00Z");
    expect(quotaReceiptBucket("scope", "UTC", now).dateKey).not.toBe(quotaReceiptBucket("scope", "UTC", later).dateKey);
    const p = await createPlanShell(userId, { mode: "EXAM", title: "Daily receipt", creationKey: randomUUID(), subjectId: null, goalId: null });
    const op = await prisma.plannerRevision.create({ data: { planId: p.id, sequence: 1, source: "GENERATE", baseVersion: 0, inputSnapshot: {}, availabilitySnapshot: {}, operationKey: randomUUID(), operationHash: "a".repeat(64), leaseExpiresAt: new Date(now.getTime() + 120000) } });
    const receipt = await prisma.$transaction(tx => reserveRevisionQuota(tx, userId, op.id, "scope", now)); expect(receipt).not.toBeNull();
    expect(await prisma.$transaction(tx => reserveRevisionQuota(tx, userId, op.id, "scope", later))).toEqual(receipt);
    const [released, replay] = await Promise.all([prisma.$transaction(tx => settleRevisionQuota(tx, userId, op.id, "RELEASED", later)), prisma.$transaction(tx => settleRevisionQuota(tx, userId, op.id, "RELEASED", later))]);
    expect(released).toEqual(replay);
    await expect(prisma.$transaction(tx => settleRevisionQuota(tx, userId, op.id, "SETTLED", later))).rejects.toThrow("QUOTA_ALREADY_FINALIZED");
    expect(await prisma.userQuota.findFirst({ where: { userId } })).toMatchObject({ dateKey: "2026-09-24", used: 0 });
  });
  it("has private RLS/grants, membership constraints, unique lineage, and no public function execution", async () => {
    const tables = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('PlannerPlan','PlannerRevision','PlannerQuestLink')`;
    expect(tables).toHaveLength(3); expect(tables.every(t => t.relrowsecurity)).toBe(true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>('SELECT has_table_privilege($1, $2, $3) AS allowed', role, '"PlannerRevision"', 'SELECT,INSERT,UPDATE,DELETE');
      expect(rows[0].allowed).toBe(false);
      const functions = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>('SELECT has_function_privilege($1, $2, $3) AS allowed', role, 'planner_quest_guard()', 'EXECUTE');
      expect(functions[0].allowed).toBe(false);
    }
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE conname IN ('planner_active_membership','planner_draft_membership','planner_created_membership','planner_applied_membership','planner_revision_bounds')`;
    expect(constraints).toHaveLength(5);
    const p = await prepared(); const other = await prepared();
    await expect(prisma.plannerPlan.update({ where: { id: p.plan.id }, data: { latestDraftRevisionId: other.revision.id } })).rejects.toThrow();
    const foreignQuest = await prisma.quest.create({ data: { userId: strangerId, title: "Foreign" } });
    await expect(prisma.plannerQuestLink.create({ data: { planId: p.plan.id, itemKey: p.draft.items[0].key, questId: foreignQuest.id, createdRevisionId: p.revision.id, appliedRevisionId: p.revision.id, baseline: {} } })).rejects.toThrow();
    expect(await prisma.$queryRaw`SELECT 1 FROM pg_publication_tables WHERE tablename IN ('PlannerPlan','PlannerRevision','PlannerQuestLink')`).toEqual([]);
  });
  it("claims one Exam worker and recovers one sealed draft after a lost response", async () => {
    const key = randomUUID(); const input = examFixture();
    const adapter = vi.spyOn(LLMFactory, "getAdapter").mockReturnValue({ generateResponse: vi.fn().mockResolvedValue({ text: JSON.stringify(examProposal()) }) });
    try {
      const req = { schemaVersion: 1, requestKey: key, input };
      const responses = await Promise.all([generationResponse(userId, req, new AbortController().signal), generationResponse(userId, req, new AbortController().signal)]);
      await Promise.all(responses.map(r => r.text()));
      expect(adapter).toHaveBeenCalledTimes(1);
      const recovered = await recoverGeneration(userId, key);
      expect(recovered.operation.state).toBe("SEALED");
      expect(await prisma.quest.count({ where: { userId } })).toBe(0);
      expect(await prisma.goal.count({ where: { userId } })).toBe(0);
      expect(await prisma.userQuota.findFirst({ where: { userId } })).toMatchObject({ used: 1 });
      const retry = await generationResponse(userId, req, new AbortController().signal); expect((await retry.json()).operation.id).toBe(recovered.operation.id);
      expect(adapter).toHaveBeenCalledTimes(1);
      await expect(generationResponse(userId, { ...req, input: { ...input, title: "Changed" } }, new AbortController().signal)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
      await expect(recoverGeneration(strangerId, key)).rejects.toMatchObject({ status: 404 });
    } finally { adapter.mockRestore(); }
  });
  it("cancels Exam provider work and refunds once without late sealing", async () => {
    const key = randomUUID(); let late!: (value: { text: string }) => void;
    const adapter = vi.spyOn(LLMFactory,"getAdapter").mockReturnValue({ generateResponse: vi.fn(() => new Promise<{ text: string }>(resolve => { late = resolve; })) });
    try {
      const response = await generationResponse(userId, { schemaVersion: 1, requestKey: key, input: examFixture() }, new AbortController().signal);
      const first = await recoverGeneration(userId, key, "CANCEL"); expect(first.operation.state).toBe("CANCELLED");
      late({ text: JSON.stringify(examProposal()) }); await response.text();
      await recoverGeneration(userId, key, "CANCEL");
      expect(await prisma.userQuota.findFirst({ where: { userId } })).toMatchObject({ used: 0 });
      const op = await prisma.plannerRevision.findUniqueOrThrow({ where: { id: first.operation.id } }); expect(op.outputSnapshot).toBeNull();
      expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    } finally { adapter.mockRestore(); }
  });
  it("returns structured Exam infeasibility before quota or provider work", async () => {
    const input = examFixture(); input.availability.dailyMinutes = [0,0,0,0,0,0,0];
    const response = await generationResponse(userId, { schemaVersion: 1, requestKey: randomUUID(), input }, new AbortController().signal);
    expect(response.status).toBe(422); expect((await response.json()).feasibility.status).toBe("INFEASIBLE");
    expect(await prisma.userQuota.count({ where: { userId } })).toBe(0); expect(await prisma.plannerRevision.count({ where: { plan: { userId } } })).toBe(0);
  });
  it("edits the sealed Exam draft then confirms ordinary Quests exactly once", async () => {
    const input = examFixture(); const key = randomUUID();
    const plan = await createPlanShell(userId, { mode: "EXAM", title: input.title, subjectId: null, goalId: null, creationKey: key });
    const first = await beginOperation(userId,plan.id,{ operationKey: key, expectedVersion: 0,input }); expect(first.acquired).toBe(true);
    const again = await beginOperation(userId,plan.id,{ operationKey: key, expectedVersion: 0,input }); expect(again.acquired).toBe(false);
    const sealed = await finishOperation(userId,plan.id,key,examProposal()); const draft = sealed.outputSnapshot as unknown as ValidatedDraftV1;
    const edit = { schemaVersion: 1, baseRevisionId: sealed.id, expectedVersion: 1, operationKey: randomUUID(), edits: [{ key: draft.items[0].key, title: "Reviewed title", locked: true }], itemOrder: draft.items.map(i => i.key) };
    const changed = await appendEdit(userId,plan.id,edit); expect(changed.id).not.toBe(sealed.id);
    expect((await getRevision(userId,plan.id,sealed.id)).outputSnapshot).toEqual(sealed.outputSnapshot);
    await expect(appendEdit(userId,plan.id,{ ...edit, operationKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    const body: CommitRequest = { schemaVersion: 1, revisionId: changed.id, digest: changed.digest!, expectedVersion: 2, idempotencyKey: randomUUID(), selectedItemKeys: draft.items.map(i => i.key), createGoal: false };
    await expect(confirmDraft(userId,plan.id,{ ...body, selectedItemKeys: body.selectedItemKeys.slice(1) })).rejects.toMatchObject({ code: "EXAM_SELECTION_REQUIRES_EDIT" });
    const [one,two] = await Promise.all([confirmDraft(userId,plan.id,body),confirmDraft(userId,plan.id,body)]); expect(two).toEqual(one);
    const quests = await prisma.quest.findMany({ where: { userId } }); expect(quests).toHaveLength(draft.items.length);
    for (const q of quests) { expect(q.targetMinutes).toBe(q.requiredMinutes); expect(q.status).toBe("PENDING"); expect(q.subjectNodeId).toBeNull(); }
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(0);
    expect((await getPlanDetail(userId,plan.id)).activeRevision?.id).toBe(changed.id);
    const questId = one.items[0].questId;
    const sessions = await prisma.$queryRaw<Array<{ result: { id: number } }>>`SELECT public.start_study_session(${userId}::int, ${questId}::int, NULL::int, 0::int) AS result`;
    const sessionId = sessions[0].result.id;
    await prisma.studySession.update({ where: { id: sessionId }, data: { startedAt: new Date(Date.now() - 3600000) } });
    const settle = () => prisma.$queryRaw`SELECT public.settle_study_session_atomic(${userId}::int, ${sessionId}::int, 2700::int, 0::int, ${questId}::int, NULL::int, true, true, '2030-01-07'::text)`;
    await settle();
    const rewarded = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ledgerCount = await prisma.xpLedger.count({ where: { userId } });
    await settle();
    const replayed = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([replayed.currentXP,replayed.sylph,replayed.totalStudySeconds]).toEqual([rewarded.currentXP,rewarded.sylph,rewarded.totalStudySeconds]);
    expect(await prisma.xpLedger.count({ where: { userId } })).toBe(ledgerCount);
    expect(await prisma.quest.findUnique({ where: { id: questId } })).toMatchObject({ status: "COMPLETED", requiredMinutes: 45, targetMinutes: 45, elapsedSeconds: 2700, subjectNodeId: null });

  });

  it("seals the A1 semantic review and Definition of Done, and exposes it on ordinary Quests", async () => {
    const input = examFixture(); const key = randomUUID();
    const plan = await createPlanShell(userId, { mode: "EXAM", title: input.title, subjectId: null, goalId: null, creationKey: key });
    await beginOperation(userId, plan.id, { operationKey: key, expectedVersion: 0, input });
    const review = { schemaVersion: 1 as const, critic: "ISSUES_REPAIRED" as const, issues: 3, repaired: 1, deterministicIssues: 0, softViolations: 0 };
    const sealed = await finishOperation(userId, plan.id, key, examProposal(), new Date(), undefined, review);
    const draft = sealed.outputSnapshot as unknown as ValidatedDraftV1;
    expect(draft.semanticReview).toEqual(review);
    for (const item of draft.items) {
      expect(item.completionCriteria).toBeTruthy();
      expect(completionCriteriaIssue(item.completionCriteria!, item)).toBeNull();
    }
    const receipt = await confirmDraft(userId, plan.id, { schemaVersion: 1, revisionId: sealed.id, digest: sealed.digest!, expectedVersion: 1, idempotencyKey: randomUUID(), selectedItemKeys: draft.items.map(i => i.key), createGoal: false });
    expect(receipt.items).toHaveLength(draft.items.length);
    const quests = await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } });
    for (const quest of quests) expect(quest.description).toMatch(/\n\nDone when: /);
    // Legacy, non-planner Quests keep their own description semantics.
    const manual = await prisma.quest.create({ data: { userId, title: "Manual work" } });
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: manual.id } })).description).toBeNull();
  });
  it("rejects an edit that breaks the completion-condition rules", async () => {
    const input = examFixture(); const key = randomUUID();
    const plan = await createPlanShell(userId, { mode: "EXAM", title: input.title, subjectId: null, goalId: null, creationKey: key });
    await beginOperation(userId, plan.id, { operationKey: key, expectedVersion: 0, input });
    const sealed = await finishOperation(userId, plan.id, key, examProposal());
    const draft = sealed.outputSnapshot as unknown as ValidatedDraftV1;
    await expect(appendEdit(userId, plan.id, { schemaVersion: 1, baseRevisionId: sealed.id, expectedVersion: 1, operationKey: randomUUID(), edits: [{ key: draft.items[0].key, completionCriteria: "Fully understand everything about this unit" }] })).rejects.toThrow("INVALID_COMPLETION_CRITERIA");
    // An acceptable completion condition is accepted and stored as an EDIT revision.
    const edited = await appendEdit(userId, plan.id, { schemaVersion: 1, baseRevisionId: sealed.id, expectedVersion: 1, operationKey: randomUUID(), edits: [{ key: draft.items[0].key, completionCriteria: "Complete the set, then review every incorrect step in detail." }] });
    const stored = (edited.outputSnapshot as unknown as ValidatedDraftV1).items.find(i => i.key === draft.items[0].key)!;
    expect(stored.completionCriteria).toBe("Complete the set, then review every incorrect step in detail.");
    expect((edited.outputSnapshot as unknown as ValidatedDraftV1).semanticReview).toMatchObject({ critic: "NOT_RERUN" });
  });
  it("never seals a plan that breaks a HARD constraint, even when the provider keeps returning one", async () => {
    const input = examFixture();
    input.constraints = [{ kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 45, source: "USER_EXPLICIT" }];
    const adapter = vi.spyOn(LLMFactory, "getAdapter").mockReturnValue({ generateResponse: vi.fn().mockResolvedValue({ text: JSON.stringify(examProposal()) }) });
    try {
      const response = await generationResponse(userId, { schemaVersion: 1, requestKey: randomUUID(), input }, new AbortController().signal);
      await response.text();
      const op = await prisma.plannerRevision.findFirstOrThrow({ where: { plan: { userId } } });
      expect(op.operationState).toBe("FAILED");
      expect(op.outputSnapshot).toBeNull();
      expect(await prisma.quest.count({ where: { userId } })).toBe(0);
      expect(await prisma.userQuota.findFirst({ where: { userId } })).toMatchObject({ used: 0 });
      // One client per provider target: the repair attempt reuses the primary
      // adapter instead of constructing a second SDK client.
      expect(adapter.mock.calls.map(call => [call[0], call[1]])).toEqual([
        ["deepseek", DEEPSEEK_MODELS.planner],
        ["gemini", GEMINI_MODELS.flash],
      ]);
    } finally { adapter.mockRestore(); }
  });
  /** A confirmed roadmap plan, its active draft and its first milestone. */
  async function confirmedRoadmap() {
    const input = roadmapFixture();
    const key = randomUUID();
    const plan = await createPlanShell(userId, {
      mode: "ROADMAP",
      title: input.title,
      subjectId: null,
      goalId: null,
      creationKey: key,
    });
    await beginOperation(userId, plan.id, {
      operationKey: key,
      expectedVersion: 0,
      input,
    });
    const sealed = await finishOperation(
      userId,
      plan.id,
      key,
      roadmapProposal(input),
      new Date(),
      undefined,
      {
        schemaVersion: 1,
        critic: "PASSED",
        issues: 0,
        repaired: 0,
        deterministicIssues: 0,
        softViolations: 0,
      }
    );
    const roadmap = sealed.outputSnapshot as unknown as RoadmapDraft;
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: [],
      createGoal: false,
    });
    await expect(confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      selectedItemKeys: [],
      createGoal: false,
    })).rejects.toMatchObject({ code: "REVISION_ALREADY_CONFIRMED" });
    const confirmed = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    return { input, plan: confirmed, roadmap, receipt, revisionId: sealed.id };
  }

  function expansionItemsFor(
    scope: ReturnType<typeof expansionScope>,
    dates: string[]
  ): ExpansionItem[] {
    return scope.topics.map((topic, index) => ({
      ref: `i${index + 1}`,
      topicRef: topic.ref,
      relatedTopicRefs: [],
      type: "LEARN",
      title: `Study ${topic.label}`.slice(0, 200),
      description: "Work through the planned material for this unit.",
      rationale: "First pass over the unit before practice.",
      completionCriteria: "Complete the planned reading and note the open questions.",
      date: dates[index % dates.length],
      minutes: 30,
      dependsOn: index === 0 ? [] : [`i${index}`],
    }));
  }

  it("confirms a roadmap without creating a single Quest", async () => {
    const { plan, roadmap, receipt } = await confirmedRoadmap();
    expect(receipt.items).toHaveLength(0);
    expect(receipt.goalId).toBeNull();
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    expect(await prisma.goal.count({ where: { userId } })).toBe(0);
    expect(await prisma.plannerQuestLink.count({ where: { planId: plan.id } })).toBe(0);
    expect(plan.activeRevisionId).toBe(receipt.revisionId);
    expect(plan.latestDraftRevisionId).toBeNull();
    expect(plan.state).toBe("ACTIVE");
    expect(roadmap.items).toHaveLength(0);
    expect(roadmap.periods?.length).toBe(6);
    expect(roadmap.semanticReview?.critic).toBe("PASSED");
    // The stored input stays inside the database's snapshot bound.
    const revision = await prisma.plannerRevision.findUniqueOrThrow({ where: { id: receipt.revisionId } });
    expect(new TextEncoder().encode(JSON.stringify(revision.inputSnapshot)).byteLength).toBeLessThan(65536);
  });

  it("expands one period into ordinary Quests without touching its neighbours", async () => {
    const { input, plan, roadmap } = await confirmedRoadmap();
    const milestoneKey = roadmap.milestones[0].key;
    const scope = expansionScope(roadmap, milestoneKey, input);
    const items = expansionItemsFor(scope, ["2030-01-08", "2030-01-09"]);
    const key = randomUUID();
    const begun = await beginExpansion(userId, plan.id, {
      operationKey: key,
      expectedVersion: plan.version,
      milestoneKey,
    });
    expect(begun.acquired).toBe(true);
    const sealed = await finishExpansion(userId, plan.id, key, milestoneKey, items, new Date(), undefined, {
      schemaVersion: 1,
      critic: "PASSED",
      issues: 0,
      repaired: 0,
      deterministicIssues: 0,
      softViolations: 0,
    });
    const expansionDraft = sealed.outputSnapshot as unknown as RoadmapDraft;
    // Neighbouring periods are byte-identical to the confirmed roadmap.
    expect(JSON.stringify(roadmapStructureForComparison(expansionDraft))).toBe(
      JSON.stringify(roadmapStructureForComparison(roadmap))
    );
    expect(expansionDraft.expansion).toEqual({ milestoneKey });
    const detail = await getPlanDetail(userId, plan.id);
    expect(detail.expansions).toHaveLength(1);
    expect(detail.expansions[0].milestoneKey).toBe(milestoneKey);
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: detail.plan.version,
      idempotencyKey: randomUUID(),
      selectedItemKeys: items.map(() => "").length
        ? expansionDraft.items.map((item) => item.key)
        : [],
      createGoal: false,
    });
    expect(receipt.items).toHaveLength(items.length);
    const quests = await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } });
    expect(quests).toHaveLength(items.length);
    for (const quest of quests) {
      expect(quest.status).toBe("PENDING");
      expect(quest.requiredMinutes).toBe(quest.targetMinutes);
      expect(quest.description).toMatch(/\n\nDone when: /);
    }
    // The roadmap stays the active strategic layer.
    const after = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.activeRevisionId).toBe(plan.activeRevisionId);
    expect(after.activeRevisionId).not.toBe(sealed.id);
    expect(after.latestDraftRevisionId).toBeNull();
    // Progress is derived conservatively: expanded, never "mastered".
    const refreshed = await getPlanDetail(userId, plan.id);
    const state = refreshed.milestoneStates.find((row) => row.milestoneKey === milestoneKey)!;
    expect(state.state).toBe("EXPANDED");
    expect(state.itemCount).toBe(items.length);
    expect(
      refreshed.milestoneStates.filter((row) => row.state === "NOT_EXPANDED")
    ).toHaveLength(roadmap.milestones.length - 1);

    // Ordinary Focus execution still works on the materialized work.
    const questId = receipt.items[0].questId;
    const sessions = await prisma.$queryRaw<Array<{ result: { id: number } }>>`SELECT public.start_study_session(${userId}::int, ${questId}::int, NULL::int, 0::int) AS result`;
    const sessionId = sessions[0].result.id;
    await prisma.studySession.update({ where: { id: sessionId }, data: { startedAt: new Date(Date.now() - 1800000) } });
    const settle = () => prisma.$queryRaw`SELECT public.settle_study_session_atomic(${userId}::int, ${sessionId}::int, 1800::int, 0::int, ${questId}::int, NULL::int, true, true, '2030-01-08'::text)`;
    await settle();
    const rewarded = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await settle();
    const replayed = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([replayed.currentXP, replayed.sylph, replayed.totalStudySeconds]).toEqual([
      rewarded.currentXP,
      rewarded.sylph,
      rewarded.totalStudySeconds,
    ]);
  });

  it("refuses to expand a milestone twice, even after its Quests were deleted", async () => {
    const { input, plan, roadmap } = await confirmedRoadmap();
    const milestoneKey = roadmap.milestones[0].key;
    const scope = expansionScope(roadmap, milestoneKey, input);
    const items = expansionItemsFor(scope, ["2030-01-08"]);
    const key = randomUUID();
    await beginExpansion(userId, plan.id, {
      operationKey: key,
      expectedVersion: plan.version,
      milestoneKey,
    });
    const sealed = await finishExpansion(userId, plan.id, key, milestoneKey, items, new Date());
    const expansionDraft = sealed.outputSnapshot as unknown as RoadmapDraft;
    const version = (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version;
    const receipt = await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: sealed.id,
      digest: sealed.digest!,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
      selectedItemKeys: expansionDraft.items.map((item) => item.key),
      createGoal: false,
    });
    // A second expansion of the same milestone is refused while it exists…
    await expect(
      beginExpansion(userId, plan.id, {
        operationKey: randomUUID(),
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        milestoneKey,
      })
    ).rejects.toMatchObject({ code: "MILESTONE_ALREADY_EXPANDED" });
    // …and after every Quest is deleted, because the receipt is the authority.
    for (const item of receipt.items)
      await manualLinkedQuest(userId, item.questId, {}, true);
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
    const lineage = await prisma.$transaction((tx) =>
      expansionLineage(tx, plan.id, milestoneKey)
    );
    expect(lineage.confirmed).toBe(true);
    await expect(
      beginExpansion(userId, plan.id, {
        operationKey: randomUUID(),
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        milestoneKey,
      })
    ).rejects.toMatchObject({ code: "MILESTONE_ALREADY_EXPANDED" });
    const refreshed = await getPlanDetail(userId, plan.id);
    const state = refreshed.milestoneStates.find((row) => row.milestoneKey === milestoneKey)!;
    expect(["REMOVED", "PARTIALLY_REMOVED", "EXPANDED"]).toContain(state.state);
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });

  it("refuses to expand an unconfirmed roadmap edit or an already pending expansion", async () => {
    const { input, plan, roadmap } = await confirmedRoadmap();
    const firstMilestone = roadmap.milestones[0].key;
    // An unconfirmed roadmap EDIT must be confirmed first.
    await appendEdit(userId, plan.id, {
      schemaVersion: 1,
      baseRevisionId: plan.activeRevisionId,
      expectedVersion: plan.version,
      operationKey: randomUUID(),
      edits: [],
      milestoneEdits: [{ key: firstMilestone, effortMinutes: (roadmap.milestones[0].effortMinutes ?? 0) + 15 }],
    });
    const edited = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    await expect(
      beginExpansion(userId, plan.id, {
        operationKey: randomUUID(),
        expectedVersion: edited.version,
        milestoneKey: firstMilestone,
      })
    ).rejects.toMatchObject({ code: "CONFIRM_ROADMAP_EDIT_FIRST" });
    // Confirm the edit so the roadmap is active again.
    const draftRevision = await prisma.plannerRevision.findUniqueOrThrow({ where: { id: edited.latestDraftRevisionId! } });
    await confirmDraft(userId, plan.id, {
      schemaVersion: 1,
      revisionId: draftRevision.id,
      digest: draftRevision.digest!,
      expectedVersion: edited.version,
      idempotencyKey: randomUUID(),
      selectedItemKeys: [],
      createGoal: false,
    });
    const active = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const activeDraft = await prisma.plannerRevision.findUniqueOrThrow({ where: { id: active.activeRevisionId! } });
    const refreshedRoadmap = activeDraft.outputSnapshot as unknown as RoadmapDraft;
    const milestoneKey = refreshedRoadmap.milestones[0].key;
    // A sealed but unconfirmed expansion draft is reopened, not regenerated.
    const key = randomUUID();
    const scope = expansionScope(refreshedRoadmap, milestoneKey, input);
    await beginExpansion(userId, plan.id, {
      operationKey: key,
      expectedVersion: active.version,
      milestoneKey,
    });
    await finishExpansion(
      userId,
      plan.id,
      key,
      milestoneKey,
      expansionItemsFor(scope, ["2030-01-08"]),
      new Date()
    );
    const pending = await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const reused = await beginExpansion(userId, plan.id, {
      operationKey: randomUUID(),
      expectedVersion: pending.version,
      milestoneKey,
    });
    expect(reused.acquired).toBe(false);
    // And a different milestone cannot start while that draft is pending.
    const otherMilestone = refreshedRoadmap.milestones[1].key;
    await expect(
      beginExpansion(userId, plan.id, {
        operationKey: randomUUID(),
        expectedVersion: (await prisma.plannerPlan.findUniqueOrThrow({ where: { id: plan.id } })).version,
        milestoneKey: otherMilestone,
      })
    ).rejects.toMatchObject({ code: "PENDING_EXPANSION_DRAFT" });
  });

  it("keeps roadmap planning and period expansion on separate quota buckets", async () => {
    const { plan } = await confirmedRoadmap();
    const plannerUsage = await prisma.userQuota.findFirst({ where: { userId, feature: "planner" } });
    expect(plannerUsage?.used).toBe(1);
    expect(
      await prisma.userQuota.findFirst({ where: { userId, feature: "plannerExpansion" } })
    ).toBeNull();
    const before = await prisma.plannerRevision.findUniqueOrThrow({ where: { id: plan.activeRevisionId! } });
    expect(before.quotaReceipt).not.toBeNull();
  });

  it("requires cookie authentication, owned subjects and strict generation bodies", async () => {
    // Planner Modes are permanent, so there is no availability gate left to assert:
    // what must still hold is that an unauthenticated caller, a caller naming someone
    // else's subject, and a caller sending an invalid body are all refused.
    const input = examFixture(), body = { schemaVersion: 1, requestKey: randomUUID(), input };
    expect((await generationRoute(new Request("http://localhost/api/planner/generate", { method: "POST", body: JSON.stringify(body) }))).status).toBe(401);
    const foreign = await prisma.subject.create({ data: { userId: strangerId, name: "Private", code: randomUUID() } });
    input.exam.subjectId = foreign.id;
    expect((await generationRoute(await request(userId,body))).status).toBe(404);
    input.exam.subjectId = null;
    expect((await generationRoute(await request(userId,{ ...body, proposal: examProposal() }))).status).toBe(400);
    expect(await prisma.userQuota.count({ where: { userId } })).toBe(0);
  });

  it.skipIf(process.env.PLANNER_LIVE_DATABASE_SMOKE !== "true")("live synthetic Exam generation, recovery and confirmation on disposable PostgreSQL", async () => {
    for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
    const key = randomUUID(); const started = Date.now();
    const attempts: { provider: string; state: string; status?: number }[] = [], validationCodes: string[] = [];
    const getAdapter = LLMFactory.getAdapter;
    const providerSpy = vi.spyOn(LLMFactory,"getAdapter").mockImplementation((provider,model) => {
      const adapter = getAdapter(provider,model); const attempt: typeof attempts[number] = { provider: provider ?? "deepseek", state: "REQUESTED" }; attempts.push(attempt);
      return { async generateResponse(...args) { try { const result = await adapter.generateResponse(...args); attempt.state = "RESPONSE"; return result; } catch (error) { attempt.state = "FAILED"; const e = error as { status?: number; originalError?: { status?: number; code?: number } }; const status = e.status ?? e.originalError?.status ?? e.originalError?.code; if (typeof status === "number") attempt.status = status; throw error; } } };
    });
    const originalStrategy = examStrategy.generateExam;
    const strategySpy = vi.spyOn(examStrategy,"generateExam").mockImplementation((input,availability,signal,hooks) => originalStrategy(input,availability,signal,{ ...hooks, validationFailure: code => { validationCodes.push(code); } }));
    const response = await generationResponse(userId, { schemaVersion: 1, requestKey: key, input: examFixture() }, new AbortController().signal);
    await response.text(); // Treat terminal delivery as lost; recover exclusively from durable state.
    const recovered = await recoverGeneration(userId,key);
    const before = await prisma.quest.count({ where: { userId } });
    let created = 0;
    if (recovered.operation.state === "SEALED") {
      const detail = await getPlanDetail(userId,recovered.planId); const revision = detail.latestDraft!;
      const draft = revision.outputSnapshot as unknown as ValidatedDraftV1;
      const receipt = await confirmDraft(userId,recovered.planId,{ schemaVersion: 1, revisionId: revision.id, digest: revision.digest!, expectedVersion: detail.plan.version, idempotencyKey: randomUUID(), selectedItemKeys: draft.items.map(i => i.key), createGoal: false });
      created = receipt.items.length;
      expect(await prisma.quest.count({ where: { userId } })).toBe(created);
    }
    writeFileSync("/tmp/sylf-planner-phase2/live-database-smoke.json",JSON.stringify({ state: recovered.operation.state, attempts, validationCodes, questsBeforeConfirmation: before, confirmedQuests: created, elapsedMs: Date.now()-started, syntheticOnly: true, database: "disposable localhost" },null,2));
    providerSpy.mockRestore(); strategySpy.mockRestore();
    expect(before).toBe(0); expect(recovered.operation.state).toBe("SEALED"); expect(created).toBeGreaterThan(0);
  }, 115_000);

});
