import "server-only";
// The context compiler: the only way planning reads the world. It turns Sylf's data (calendar, rest days, subjects and syllabus, goals, quests, focus
// history and the living plan) into one compact, deterministic planning snapshot that both the model and the solver read, plus the short local IDs
// the model uses. It reads; it never writes. Reconciliation (a quest finished, studied or deleted elsewhere) happens here so every workflow starts
// from the truth.
import { prisma } from "@/lib/prisma";
import { getApplicationPool } from "@/lib/prisma";
import { readPlanningCalendar } from "@/lib/calendar/planning";
import { TimezoneService } from "@/lib/timezone-service";
import {
  DEFAULT_SETTINGS, addDays, calibrate, dateRange, diffDays, emptyWorkModel, inferGoalType, markMissed, weekdayOf,
  type Block, type BlockState, type Busy, type BusyKind, type KGoal, type PlanningSnapshot, type RefMap, type SessionSample, type SnapshotDay,
  type SnapshotSubject, type SnapshotTopic, type StudioSettings, type WorkModel,
} from "../kernel";
import { localParts } from "./time";

export interface SpaceRow { id: string; userId: number; version: number; autonomy: string; workModel: WorkModel; settings: StudioSettings; calibration: unknown }

export interface ShortRefs extends RefMap {
  /** Reverse maps, from Sylf ids and kernel keys back to short refs. */
  subjectOf: Map<number, string>;
  topicOf: Map<number, string>;
  goalOf: Map<string, string>;
  itemOf: Map<string, string>;
  topicSubjects: Record<number, number>;
}

export interface CompiledContext {
  userId: number;
  space: SpaceRow;
  snapshot: PlanningSnapshot;
  model: WorkModel;
  blocks: Block[];
  refs: ShortRefs;
  /** Blocks whose state the compiler changed (done or missed), to persist on the next write. */
  transitions: { key: string; state: BlockState }[];
  lastStudied: Record<string, string | null>;
  /** Goals owned by the existing planner. The Studio shows them but never edits them. */
  lockedGoals: { id: number; title: string; targetDate: string | null }[];
  facts: { commitments: number; quests: number; sessions: number; calendarComplete: boolean };
  /** Map from item key to its linked quest's state, for projection. */
  quests: Map<string, QuestState>;
}
export interface QuestState { id: number; status: string; elapsedSeconds: number; scheduledFor: string; requiredMinutes: number; sessions: number }

const BUSY_WORDS: [RegExp, BusyKind][] = [[/\b(exam|test|midterm|quiz|final|mock)\b/i, "exam"], [/\b(lecture|class|seminar|lab|tutorial|lesson|school)\b/i, "class"], [/\b(shift|work|job)\b/i, "work"]];
const busyKind = (title: string, external: boolean): BusyKind => BUSY_WORDS.find(([re]) => re.test(title))?.[1] ?? (external ? "external" : "event");

export function defaultSettings(dailyGoalMinutes: number): StudioSettings {
  return { ...DEFAULT_SETTINGS, dailyCap: Math.max(120, Math.min(360, Math.round((dailyGoalMinutes * 2) / 5) * 5)) };
}

export async function loadSpace(userId: number, dailyGoalMinutes: number): Promise<SpaceRow> {
  const existing = await prisma.planningSpace.findUnique({ where: { userId } });
  const row = existing ?? await prisma.planningSpace.upsert({
    where: { userId }, update: {},
    create: { userId, workModel: emptyWorkModel() as object, settings: defaultSettings(dailyGoalMinutes) as object },
  });
  return { id: row.id, userId: row.userId, version: row.version, autonomy: row.autonomy, workModel: normalizeModel(row.workModel), settings: { ...DEFAULT_SETTINGS, ...(row.settings as object), autonomy: row.autonomy as StudioSettings["autonomy"] }, calibration: row.calibration };
}

export function normalizeModel(raw: unknown): WorkModel {
  const base = emptyWorkModel();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<WorkModel>;
  return { goals: value.goals ?? [], items: value.items ?? [], practices: value.practices ?? [], constraints: value.constraints ?? [], assumptions: value.assumptions ?? [], questions: value.questions ?? [] };
}

/** Short local ids, stable for a stable model: subjects S1…, topics S1.N3_2…, goals G1…, items w1…. */
export function buildRefs(subjects: SnapshotSubject[], topics: SnapshotTopic[], model: WorkModel): ShortRefs {
  const refs: ShortRefs = { subjects: {}, topics: {}, goals: {}, items: {}, practices: {}, constraints: {}, subjectOf: new Map(), topicOf: new Map(), goalOf: new Map(), itemOf: new Map(), topicSubjects: {} };
  [...subjects].sort((a, b) => a.id - b.id).forEach((s, i) => { const ref = `S${i + 1}`; refs.subjects[ref] = s.id; refs.subjectOf.set(s.id, ref); });
  for (const topic of [...topics].sort((a, b) => a.subject - b.subject || a.ref.localeCompare(b.ref) || a.id - b.id)) {
    const ref = `${refs.subjectOf.get(topic.subject) ?? "S0"}.${topic.ref}`;
    refs.topics[ref] = topic.id; refs.topicOf.set(topic.id, ref); refs.topicSubjects[topic.id] = topic.subject;
  }
  model.goals.forEach((g, i) => { const ref = `G${i + 1}`; refs.goals[ref] = g.key; refs.goalOf.set(g.key, ref); });
  model.items.forEach((item, i) => { const ref = `w${i + 1}`; refs.items[ref] = item.key; refs.itemOf.set(item.key, ref); });
  model.practices.forEach((p, i) => { refs.practices![`p${i + 1}`] = p.key; });
  model.constraints.forEach((c, i) => { refs.constraints![`c${i + 1}`] = c.key; });
  return refs;
}

async function readCalendar(userId: number, start: string, end: string, timezone: string, now: Date) {
  const client = await getApplicationPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await readPlanningCalendar(client, userId, start, end, timezone, now);
    await client.query("COMMIT");
    return { events: result.events, complete: result.sources.every((s) => s.complete) };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return { events: [], complete: false };
  } finally {
    client.release();
  }
}

/** The detailed horizon reaches an exam up to four weeks away, so its whole study path lands in the calendar rather than in weekly budgets. */
export const EXAM_HORIZON_DAYS = 28;

/** Days the detailed horizon needs to cover every active exam within reach, counting the exam day. */
export function horizonFor(base: number, today: string, models: WorkModel[], until: string | null = null): number {
  const dues = models.flatMap((m) => m.goals.filter((g) => g.status === "active" && g.type === "exam" && g.due && g.due >= today).map((g) => g.due!));
  if (until && until >= today) dues.push(until);
  const reach = dues.map((d) => diffDays(d, today) + 1).filter((n) => n <= EXAM_HORIZON_DAYS);
  return Math.max(7, Math.min(21, base), ...reach);
}

export async function compileContext(userId: number, now = new Date(), options: { until?: string | null } = {}): Promise<CompiledContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, restDays: true, dailyGoalMinutes: true } });
  const timezone = TimezoneService.validateTimezone(user.timezone) ? user.timezone : "UTC";
  const space = await loadSpace(userId, user.dailyGoalMinutes);
  const local = localParts(timezone, now);
  const today = local.date;
  // An open proposal's exams count too, so a proposal is always shown and re-checked over the days it was planned on.
  const pending = await prisma.planVersion.findFirst({ where: { spaceId: space.id, state: "PROPOSED" }, select: { workModel: true } });
  const horizon = horizonFor(space.settings.horizonDays, today, [space.workModel, ...(pending ? [normalizeModel(pending.workModel)] : [])], options.until ?? null);
  const end = addDays(today, horizon);
  const historyStart = addDays(today, -28);

  const [floating, calendar, subjects, sylfGoals, plannerGoals, links, otherQuests, sessions, blockRows] = await Promise.all([
    prisma.floatingRestDay.findMany({ where: { userId, dateKey: { gte: today, lt: end } }, select: { dateKey: true } }),
    readCalendar(userId, today, end, timezone, now),
    prisma.subject.findMany({ where: { userId, archivedAt: null }, select: { id: true, name: true, color: true, code: true, examBoard: true, level: true, nodes: { select: { id: true, nodeId: true, title: true, progress: true, isMastered: true, difficulty: true }, orderBy: { nodeId: "asc" }, take: 60 } }, orderBy: { id: "asc" }, take: 30 }),
    prisma.goal.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, title: true, targetDate: true }, orderBy: { id: "asc" }, take: 50 }),
    prisma.plannerPlan.findMany({ where: { userId, goalId: { not: null } }, select: { goalId: true } }),
    prisma.planItemQuest.findMany({ where: { spaceId: space.id }, select: { itemKey: true, questId: true, quest: { select: { id: true, status: true, elapsedSeconds: true, scheduledFor: true, requiredMinutes: true, completedAt: true, _count: { select: { sessions: true } } } } } }),
    prisma.quest.findMany({ where: { userId, status: { in: ["PENDING", "ACTIVE", "IN_PROGRESS"] }, scheduledFor: { gte: today, lt: end }, planItem: null }, select: { scheduledFor: true, requiredMinutes: true, elapsedSeconds: true } }),
    prisma.studySession.findMany({ where: { userId, startedAt: { gte: new Date(now.getTime() - 29 * 86_400_000) } }, select: { questId: true, subjectId: true, durationSeconds: true, startedAt: true }, orderBy: { startedAt: "asc" }, take: 2000 }),
    prisma.planBlock.findMany({ where: { spaceId: space.id, removedVersion: null, localDate: { gte: addDays(today, -7) } }, orderBy: [{ localDate: "asc" }, { startMinute: "asc" }] }),
  ]);

  const snapshotSubjects: SnapshotSubject[] = subjects.map((s) => ({ id: s.id, name: s.name, color: s.color, code: s.code, board: s.examBoard, level: s.level }));
  const topics: SnapshotTopic[] = subjects.flatMap((s) => s.nodes.map((n) => ({ id: n.id, subject: s.id, ref: n.nodeId, title: n.title, progress: Math.round(n.progress), mastered: n.isMastered, difficulty: n.difficulty })));

  // Availability.
  const floatingSet = new Set(floating.map((f) => f.dateKey));
  const days: SnapshotDay[] = dateRange(today, horizon).map((date) => ({
    date, weekday: weekdayOf(date), rest: user.restDays.includes(weekdayOf(date)) ? "fixed" : floatingSet.has(date) ? "floating" : false,
    windows: [[space.settings.dayStart, space.settings.dayEnd]], busy: [] as Busy[], allDay: [], otherWork: 0,
  }));
  const dayOf = new Map(days.map((d) => [d.date, d]));
  let commitments = 0;
  for (const event of calendar.events) {
    if (event.external && event.external.busy === false) continue;
    if (event.allDay) {
      for (let date = event.startDate; date < event.endDate && date < end; date = addDays(date, 1)) dayOf.get(date)?.allDay.push({ title: event.title.slice(0, 60), kind: busyKind(event.title, Boolean(event.external)) });
      continue;
    }
    if (!event.startsAt || !event.endsAt) continue;
    const startsAt = new Date(event.startsAt); const endsAt = new Date(event.endsAt);
    if (endsAt <= startsAt) continue;
    const a = localParts(timezone, startsAt); const b = localParts(timezone, endsAt);
    commitments++;
    for (let date = a.date; date <= b.date && date < end; date = addDays(date, 1)) {
      const day = dayOf.get(date);
      if (!day) continue;
      const start = date === a.date ? a.minute : 0;
      const stop = date === b.date ? b.minute : 1440;
      if (stop > start) day.busy.push({ start, end: stop, title: event.title.slice(0, 60), kind: busyKind(`${event.title} ${event.category ?? ""}`, Boolean(event.external)), ref: event.id });
    }
  }
  for (const day of days) day.busy.sort((x, y) => x.start - y.start || x.end - y.end);
  for (const quest of otherQuests) { const day = dayOf.get(quest.scheduledFor); if (day) day.otherWork = (day.otherWork ?? 0) + Math.max(0, quest.requiredMinutes - Math.round(quest.elapsedSeconds / 60)); }

  // Reconcile the work model with what happened in Sylf.
  const model = normalizeModel(space.workModel);
  const locked = new Set(plannerGoals.map((p) => p.goalId!));
  const questByItem = new Map<string, QuestState>();
  const linkByItem = new Map(links.map((l) => [l.itemKey, l]));
  for (const item of model.items) {
    const link = linkByItem.get(item.key);
    if (!link) continue;
    if (!link.quest) {
      // The student deleted the quest. Their choice stands: unstudied work leaves the plan.
      if (item.status === "open" && item.questId) item.status = "dropped";
      item.questId = null;
      continue;
    }
    item.questId = link.quest.id;
    item.done = Math.max(item.done, Math.round(link.quest.elapsedSeconds / 60));
    if (link.quest.status === "COMPLETED" && item.status === "open") item.status = "done";
    questByItem.set(item.key, { id: link.quest.id, status: link.quest.status, elapsedSeconds: link.quest.elapsedSeconds, scheduledFor: link.quest.scheduledFor, requiredMinutes: link.quest.requiredMinutes, sessions: link.quest._count.sessions });
  }
  for (const [key, link] of linkByItem) if (key.includes("@") && link.quest) questByItem.set(key, { id: link.quest.id, status: link.quest.status, elapsedSeconds: link.quest.elapsedSeconds, scheduledFor: link.quest.scheduledFor, requiredMinutes: link.quest.requiredMinutes, sessions: link.quest._count.sessions });
  // Sylf goals the student created elsewhere join the work model unplanned; goals another planner owns stay locked.
  const known = new Set(model.goals.map((g) => g.ref).filter((r): r is number => r != null));
  for (const goal of sylfGoals) {
    if (locked.has(goal.id) || known.has(goal.id)) continue;
    const due = goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null;
    model.goals.push({ key: `sylf-${goal.id}`, ref: goal.id, title: goal.title.slice(0, 60), type: inferGoalType(goal.title), due: due && due >= today ? due : null, priority: 2, subject: null, status: "active", draft: false, source: "import" } satisfies KGoal);
  }
  for (const goal of model.goals) if (goal.ref != null && !sylfGoals.some((g) => g.id === goal.ref) && goal.status === "active" && goal.source === "import" && !model.items.some((i) => i.goal === goal.key)) goal.status = "dropped";

  // History: calibration, energy and sustainable capacity.
  const itemByQuest = new Map<number, string>();
  for (const [key, q] of questByItem) itemByQuest.set(q.id, key);
  const daily = new Map<string, number>();
  const studied = new Set<string>();
  const lastStudied: Record<string, string | null> = {};
  const samples: SessionSample[] = [];
  let studiedToday = 0;
  for (const session of sessions) {
    const p = localParts(timezone, session.startedAt);
    const minutes = Math.round(session.durationSeconds / 60);
    daily.set(p.date, (daily.get(p.date) ?? 0) + minutes);
    if (p.date === today) studiedToday += minutes;
    const itemKey = session.questId != null ? itemByQuest.get(session.questId) : undefined;
    const item = itemKey ? model.items.find((i) => i.key === itemKey) : undefined;
    if (itemKey && minutes > 0) studied.add(`${itemKey}|${p.date}`);
    if (item?.goal) lastStudied[item.goal] = p.date > (lastStudied[item.goal] ?? "") ? p.date : lastStudied[item.goal];
    samples.push({ subject: session.subjectId, kind: item?.kind ?? null, planned: null, actual: minutes, weekday: p.weekday, hour: p.hour, completed: minutes >= 10 });
  }
  for (const item of model.items) if (item.status === "done" && item.done > 0) samples.push({ subject: item.subject, kind: item.kind, planned: item.est[0], actual: item.done, weekday: 1, hour: -1, completed: true });
  const dailyMinutes = dateRange(historyStart, 28).map((d) => daily.get(d) ?? 0);
  const calibration = calibrate(samples, dailyMinutes, { dailyCap: space.settings.dailyCap, fallbackCapacity: Math.max(60, Math.round((user.dailyGoalMinutes * 1.25) / 5) * 5) });

  // Blocks: past committed blocks become done or missed.
  const blocks: Block[] = blockRows.map((row) => ({ id: row.blockKey, item: row.itemKey, date: row.localDate, start: row.startMinute, end: row.endMinute, state: row.state.toLowerCase() as BlockState, pinned: row.pinned, questId: row.questId }));
  const snapshot: PlanningSnapshot = { today, nowMinute: local.minute, timezone, days, subjects: snapshotSubjects, topics, calibration, settings: space.settings, studiedToday };
  const itemStatus = new Map(model.items.map((i) => [i.key, i.status]));
  const marked = markMissed(blocks, snapshot, (item, date) => studied.has(`${item}|${date}`) || itemStatus.get(item) === "done");
  const transitions = marked.flatMap((b, i) => (b.state !== blocks[i].state ? [{ key: b.id, state: b.state }] : []));
  // A student who moved a plan quest to a later day elsewhere in Sylf (Quests, Calendar) moved its work: the item may not start before that day.
  for (const item of model.items) {
    const quest = questByItem.get(item.key);
    if (!quest || item.status !== "open" || quest.elapsedSeconds > 0 || quest.sessions > 0 || !["ACTIVE", "PENDING"].includes(quest.status) || quest.scheduledFor <= today) continue;
    const next = marked.filter((b) => b.item === item.key && b.state === "committed" && b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
    if (next && quest.scheduledFor > next.date && (!item.due || quest.scheduledFor <= item.due)) item.earliest = item.earliest && item.earliest > quest.scheduledFor ? item.earliest : quest.scheduledFor;
  }

  return {
    userId, space, snapshot, model, blocks: marked, refs: buildRefs(snapshotSubjects, topics, model), transitions, lastStudied,
    lockedGoals: sylfGoals.filter((g) => locked.has(g.id)).map((g) => ({ id: g.id, title: g.title, targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null })),
    facts: { commitments, quests: otherQuests.length, sessions: sessions.length, calendarComplete: calendar.complete },
    quests: questByItem,
  };
}
