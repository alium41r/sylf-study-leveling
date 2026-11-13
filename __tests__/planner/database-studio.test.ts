// @vitest-environment node
// Planning Studio on a disposable PostgreSQL (scripts/test/test-planning-studio-postgres.mjs): the migration's guards, the commit transaction, idempotent
// replay, stale rejection, undo, direct edits, projection into Goals and Quests, execution protection and the overnight repair.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const database = process.env.PLANNER_TEST_DATABASE_URL;
vi.unmock("@/lib/auth-server");
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const url = process.env.PLANNER_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.includes("planner")) throw new Error("Disposable localhost planner database required");
  }
  const pool = new Pool({ connectionString: url ?? "postgresql://localhost/unused_planner_tests", max: 4 });
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? "postgresql://localhost/unused_planner_tests" }) }), getApplicationPool: () => pool };
});
import { prisma } from "@/lib/prisma";
import { compileContext } from "@/lib/planner/studio/snapshot";
import { acceptProposal, commitDirect, undoLatest } from "@/lib/planner/studio/store";
import { loadState, runAddGoal, runAnswer, runCommand, runDirect } from "@/lib/planner/studio/workflows";
import { repairBeforeDeadline } from "@/lib/planner/studio/events";
import { localParts } from "@/lib/planner/studio/time";
import { addDays, propose } from "@/lib/planner/kernel";

const key = () => `t${randomUUID().replace(/-/g, "").slice(0, 20)}`;
const noop = () => undefined;

describe.skipIf(!database)("Planning Studio on PostgreSQL", () => {
  let userId: number;
  let strangerId: number;
  let subjectId: number;
  const today = () => localParts("UTC", new Date()).date;

  beforeEach(async () => {
    const user = (email: string) => prisma.user.create({ data: { email, username: email.split("@")[0], timezone: "UTC", restDays: [0], dailyGoalMinutes: 120 } as never });
    userId = (await user(`studio-${randomUUID()}@example.test`)).id;
    strangerId = (await user(`stranger-${randomUUID()}@example.test`)).id;
    const subject = await prisma.subject.create({ data: { userId, name: "Organic Chemistry", code: `CHEM${Math.floor(Math.random() * 1e6)}` } });
    subjectId = subject.id;
    for (const [i, title] of ["Reaction mechanisms", "Stereochemistry", "Spectroscopy"].entries()) {
      await prisma.subjectNode.create({ data: { subjectId, nodeId: `N${i + 1}_1`, tier: i + 1, title, description: title, difficulty: 3, spAward: 1, progress: i * 30 } });
    }
  });

  afterAll(async () => { await prisma.$disconnect(); });

  async function planExam(daysOut = 10) {
    const proposal = await runAddGoal(userId, { key: key(), title: "Chem midterm", type: "exam", due: addDays(today(), daysOut), subjectId }, noop);
    expect(proposal).not.toBeNull();
    return proposal!;
  }

  it("creates a space on first open and proposes a verified plan for a new exam from the student's own syllabus", async () => {
    const state = await loadState(userId);
    expect(state.version).toBe(0);
    expect(state.readiness.enabled).toBe(true);
    const proposal = await planExam();
    expect(proposal.state).toBe("PROPOSED");
    expect(proposal.verification.pass).toBe(true);
    expect(proposal.diff.counts.added).toBeGreaterThan(3);
    expect(proposal.model.goals[0].syllabus).toMatchObject({ source: "subject", units: [{ title: "Reaction mechanisms" }, { title: "Stereochemistry" }, { title: "Spectroscopy" }] });
    expect(proposal.model.items.map((i) => i.title)).toEqual(expect.arrayContaining(["Reaction mechanisms revision", "Spectroscopy past paper practice", "Timed practice paper"]));
    expect(proposal.model.items.some((i) => i.method === "retrieval")).toBe(true);
    expect(await prisma.quest.count({ where: { userId } })).toBe(0);
  });

  it("keeps the preset, pace and weak spots a student chose in the stored proposal", async () => {
    const email = `studio-preset-${randomUUID()}@example.test`;
    const other = (await prisma.user.create({ data: { email, username: email.split("@")[0].slice(0, 30), timezone: "UTC", restDays: [0], dailyGoalMinutes: 120 } as never })).id;
    const proposal = await runAddGoal(other, { key: key(), title: "Maths mid term Complete Paper 1 CAIE A levels", preset: "auto", due: addDays(today(), 18), minutesPerDay: 120, weak: "integration" }, noop);
    const goal = proposal!.model.goals[0];
    expect(goal).toMatchObject({ preset: "exam", type: "exam", pace: { minutesPerDay: 120 } });
    expect(goal.syllabus?.units.find((u) => u.title === "Integration")?.confidence).toBe("weak");
    expect(proposal!.model.constraints.find((c) => c.kind === "goal_cap")).toMatchObject({ goal: goal.key, minutes: 120 });
    expect(proposal!.result.unplaced).toEqual([]);
    const course = await runAddGoal(other, { key: key(), title: "Organic chemistry, whole course", preset: "course", due: addDays(today(), 120), topics: "Alkanes\nAlkenes\nHalogenoalkanes\nAlcohols\nCarbonyls\nCarboxylic acids" }, noop);
    expect(course!.model.goals.find((g) => g.title.startsWith("Organic"))).toMatchObject({ preset: "course" });
    expect(course!.result.weekBudgets.length).toBeGreaterThan(0);
  });

  it("asks for the topics, rather than inventing study blocks, when an exam has no syllabus", async () => {
    const email = `studio-topics-${randomUUID()}@example.test`;
    const other = (await prisma.user.create({ data: { email, username: email.split("@")[0].slice(0, 30), timezone: "UTC", restDays: [0], dailyGoalMinutes: 120 } as never })).id;
    const proposal = await runAddGoal(other, { key: key(), title: "History midterm", type: "exam", due: addDays(today(), 9) }, noop);
    expect(proposal!.model.items).toEqual([]);
    expect(proposal!.model.questions[0].text).toMatch(/Which topics does History midterm cover/);
    const answered = await runAnswer(other, { key: key(), question: proposal!.model.questions[0].key, answer: "The Cold War\nDecolonisation\nThe United Nations" }, noop);
    expect(answered!.model.goals[0].syllabus).toMatchObject({ source: "student", units: [{ title: "The Cold War" }, { title: "Decolonisation" }, { title: "The United Nations" }] });
    expect(answered!.model.items.map((i) => i.title)).toContain("Decolonisation revision");
    expect(answered!.verification.pass).toBe(true);
  });

  it("commits once: quests, goal, blocks and links appear, and a replayed key changes nothing", async () => {
    const proposal = await planExam();
    const commitKey = key();
    const first = await acceptProposal(userId, proposal.id, commitKey);
    expect(first.committed?.version).toBe(1);
    const quests = await prisma.quest.findMany({ where: { userId } });
    const blocks = await prisma.planBlock.findMany({ where: { userId, removedVersion: null } });
    const links = await prisma.planItemQuest.findMany({ where: { userId } });
    expect(quests.length).toBeGreaterThan(3);
    expect(links.filter((l) => l.questId != null).length).toBe(quests.length);
    expect(blocks.length).toBeGreaterThanOrEqual(quests.length);
    const goal = await prisma.goal.findFirst({ where: { userId, title: "Chem midterm" } });
    expect(goal?.targetDate?.toISOString().slice(0, 10)).toBe(addDays(today(), 10));
    for (const quest of quests) {
      expect(quest.goalId).toBe(goal!.id);
      expect(quest.subjectId).toBe(subjectId);
      expect(quest.plannedMinutes).toBeNull();
      const own = blocks.filter((b) => b.questId === quest.id).sort((a, b) => a.localDate.localeCompare(b.localDate));
      expect(own.length).toBeGreaterThan(0);
      expect(quest.scheduledFor).toBe(own[0].localDate);
      expect(quest.requiredMinutes).toBeGreaterThanOrEqual(15);
    }
    const replay = await acceptProposal(userId, proposal.id, commitKey);
    expect(replay.committed?.replayed).toBe(true);
    expect(await prisma.quest.count({ where: { userId } })).toBe(quests.length);
    expect((await prisma.planningSpace.findUniqueOrThrow({ where: { userId } })).version).toBe(1);
  });

  it("re-plans a stale proposal instead of applying it blindly", async () => {
    const first = await planExam();
    await acceptProposal(userId, first.id, key());
    const stale = await runCommand(userId, { key: key(), text: "max 1 hour a day" }, noop);
    expect(stale?.baseVersion).toBe(1);
    // The plan moves on underneath the open proposal.
    const block = (await prisma.planBlock.findFirstOrThrow({ where: { userId, removedVersion: null, state: "COMMITTED", localDate: { gt: today() } } }));
    await runDirect(userId, { key: key(), edits: [{ kind: "pin", block: block.blockKey }] });
    const outcome = await acceptProposal(userId, stale!.id, key());
    expect(outcome.committed).toBeNull();
    expect(outcome.rebased?.baseVersion).toBe(2);
    expect(outcome.rebased?.notes.join(" ")).toMatch(/re-planned/);
  });

  it("moves and pins a block directly, updating the quest's date, and undo restores the previous plan", async () => {
    await acceptProposal(userId, (await planExam(12)).id, key());
    const block = await prisma.planBlock.findFirstOrThrow({ where: { userId, removedVersion: null, state: "COMMITTED", localDate: { gt: addDays(today(), 1) } }, orderBy: { localDate: "asc" } });
    const target = addDays(today(), 1);
    const moved = await runDirect(userId, { key: key(), edits: [{ kind: "move", block: block.blockKey, date: target, start: 8 * 60 }] });
    expect(moved.version).toBe(2);
    const after = await prisma.planBlock.findFirstOrThrow({ where: { userId, blockKey: block.blockKey, removedVersion: null } });
    expect(after).toMatchObject({ localDate: target, startMinute: 480, pinned: true });
    const quest = await prisma.quest.findUniqueOrThrow({ where: { id: after.questId! } });
    expect(quest.scheduledFor <= target).toBe(true);
    const undone = await undoLatest(userId, key());
    expect(undone.version).toBe(3);
    const restored = await prisma.planBlock.findMany({ where: { userId, removedVersion: null, itemKey: block.itemKey } });
    expect(restored.some((b) => b.pinned)).toBe(false);
  });

  it("never deletes or reshapes started work when its goal is dropped", async () => {
    await acceptProposal(userId, (await planExam()).id, key());
    const quests = await prisma.quest.findMany({ where: { userId }, orderBy: { id: "asc" } });
    const started = quests[0];
    await prisma.quest.update({ where: { id: started.id }, data: { elapsedSeconds: 600, status: "IN_PROGRESS" } });
    await prisma.studySession.create({ data: { userId, questId: started.id, subjectId, durationMinutes: 10, durationSeconds: 600, startedAt: new Date(), endedAt: new Date() } });
    const drop = await runCommand(userId, { key: key(), text: "drop chem midterm" }, noop);
    expect(drop?.model.goals.find((g) => g.title === "Chem midterm")?.status).toBe("dropped");
    await acceptProposal(userId, drop!.id, key());
    const remaining = await prisma.quest.findMany({ where: { userId } });
    expect(remaining.map((q) => q.id)).toEqual([started.id]);
    expect(remaining[0]).toMatchObject({ title: started.title, requiredMinutes: started.requiredMinutes, elapsedSeconds: 600 });
  });

  it("keeps sessions clear of calendar commitments", async () => {
    const date = addDays(today(), 2);
    await prisma.calendarEvent.create({ data: { id: randomUUID(), userId, title: "Organic chem lecture", startDate: date, endDate: date, startsAt: new Date(`${date}T08:00:00Z`), endsAt: new Date(`${date}T20:00:00Z`), timezone: "UTC" } });
    const proposal = await planExam(6);
    const onDay = proposal.result.blocks.filter((b) => b.date === date);
    for (const block of onDay) expect(block.start >= 20 * 60 + 10 || block.end <= 8 * 60 - 10).toBe(true);
  });

  it("repairs missed sessions overnight before a quest could fail", async () => {
    await acceptProposal(userId, (await planExam(9)).id, key());
    const first = await prisma.planBlock.findFirstOrThrow({ where: { userId, removedVersion: null }, orderBy: [{ localDate: "asc" }, { startMinute: "asc" }] });
    const later = new Date(`${addDays(first.localDate, 1)}T03:00:00Z`);
    expect(await repairBeforeDeadline(userId, later)).toBe(true);
    const missed = await prisma.planBlock.findFirstOrThrow({ where: { id: first.id } });
    expect(missed.state).toBe("MISSED");
    const quest = await prisma.quest.findUniqueOrThrow({ where: { id: first.questId! } });
    expect(quest.scheduledFor >= addDays(first.localDate, 1)).toBe(true);
    expect(quest.status).toBe("ACTIVE");
  });

  it("enforces ownership and immutable history in the database", async () => {
    await acceptProposal(userId, (await planExam()).id, key());
    const space = await prisma.planningSpace.findUniqueOrThrow({ where: { userId } });
    const strangerQuest = await prisma.quest.create({ data: { userId: strangerId, title: "Not yours", scheduledFor: today() } });
    await expect(prisma.planBlock.create({ data: { spaceId: space.id, userId, blockKey: "evil", itemKey: "x", questId: strangerQuest.id, localDate: today(), startMinute: 600, endMinute: 660, startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000), createdVersion: 1 } })).rejects.toThrow(/PLANNING_OWNERSHIP/);
    await expect(prisma.planVersion.create({ data: { spaceId: space.id, userId: strangerId, source: "STUDENT", workflow: "x", baseVersion: 1, key: key(), requestHash: "h", operations: [], workModel: {}, result: {}, diff: {}, summary: "", verification: {}, trace: {}, versions: {} } })).rejects.toThrow(/PLANNING_OWNERSHIP/);
    const committed = await prisma.planVersion.findFirstOrThrow({ where: { spaceId: space.id, state: "COMMITTED" } });
    await expect(prisma.planVersion.update({ where: { id: committed.id }, data: { summary: "rewritten" } })).rejects.toThrow(/PLANNING_VERSION_IMMUTABLE/);
    const live = await prisma.planBlock.findFirstOrThrow({ where: { spaceId: space.id, removedVersion: null } });
    await expect(prisma.planBlock.create({ data: { spaceId: space.id, userId, blockKey: live.blockKey, itemKey: "dup", localDate: today(), startMinute: 600, endMinute: 660, startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000), createdVersion: 9 } })).rejects.toThrow();
  });

  it("serializes concurrent commits of the same proposal into one outcome", async () => {
    const proposal = await planExam();
    const results = await Promise.allSettled([acceptProposal(userId, proposal.id, key()), acceptProposal(userId, proposal.id, key())]);
    const committed = results.filter((r) => r.status === "fulfilled" && r.value.committed && !r.value.committed.replayed);
    expect(committed.length).toBe(1);
    expect((await prisma.planningSpace.findUniqueOrThrow({ where: { userId } })).version).toBe(1);
    const quests = await prisma.quest.count({ where: { userId } });
    expect(await prisma.planItemQuest.count({ where: { userId, questId: { not: null } } })).toBe(quests);
  });

  it("a direct solve with an unchanged world proposes nothing", async () => {
    await acceptProposal(userId, (await planExam()).id, key());
    const ctx = await compileContext(userId);
    const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
    expect(candidate.diff.changes.map((c) => `${c.kind} ${c.title} ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)} now=${ctx.snapshot.nowMinute}`)).toEqual([]);
    await expect(commitDirect(ctx, { ...candidate, verification: { ...candidate.verification, pass: false } }, { key: key(), source: "REPAIR", workflow: "repair" })).rejects.toThrow(/break/);
  });
});
