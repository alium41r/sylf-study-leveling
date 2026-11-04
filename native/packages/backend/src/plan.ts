// Everything Home's Plan reads and writes, by name. Server rules stay on the server: a refusal comes back in its words, and nothing here decides what a
// quest may become. `month` is the only place Native reads `calendar/month`, which is 0 to 11 and, for a native session, charges nobody (ADR 0017).
import { z } from "zod";
import type { BackendClient } from "./client";
import { calendarEventSchema, calendarRangeSchema, questPageSchema } from "./contracts";

const dayQuestSchema = z.object({ id: z.number().int(), title: z.string(), status: z.string(), difficulty: z.string().optional(), requiredMinutes: z.number().nullable().optional(), plannedMinutes: z.number().nullable().optional(), plannerOwned: z.boolean().optional(), goal: z.object({ id: z.number().int(), title: z.string() }).nullable().optional() }).loose();
const monthDaySchema = z.object({ date: z.string(), isRestDay: z.boolean(), dailyGoalMinutes: z.number(), totalMinutes: z.number(), questsCount: z.number(), questsCompleted: z.number(), quests: z.array(dayQuestSchema) }).loose();
export const calendarMonthSchema = z.object({
  year: z.number(), month: z.number(), monthName: z.string(), dailyGoalMinutes: z.number(), restDays: z.array(z.number()),
  days: z.array(monthDaySchema),
  milestones: z.array(z.object({ id: z.number().int(), title: z.string(), date: z.string().optional(), targetDate: z.string().optional() }).loose()),
  floatingRestDays: z.array(z.string()),
  monthStats: z.object({ totalMinutes: z.number(), activeDays: z.number(), goalsMetDays: z.number() }).loose(),
});
export type CalendarMonth = z.infer<typeof calendarMonthSchema>;
export type MonthDay = CalendarMonth["days"][number];
export type DayQuest = MonthDay["quests"][number];

export const planEventSchema = calendarEventSchema.extend({
  revision: z.number().int(),
  description: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string().optional(),
  reminders: z.array(z.number()).optional(),
  recurrence: z.object({ frequency: z.string() }).loose().nullable().optional(),
  external: z.object({ calendarName: z.string() }).loose().optional(),
  shared: z.object({ name: z.string(), role: z.string() }).loose().optional(),
});
export type PlanEvent = z.infer<typeof planEventSchema>;
const planRangeSchema = calendarRangeSchema.extend({ events: z.array(planEventSchema) });

export const goalDetailSchema = z.object({ id: z.number().int(), title: z.string(), description: z.string().nullable().optional(), status: z.string().optional(), targetDate: z.string().nullable().optional(), targetWeeks: z.number().nullable().optional(), color: z.string().nullable().optional(), quests: z.array(z.object({ id: z.number().int(), status: z.string() })).optional() }).loose();
export type GoalDetail = z.infer<typeof goalDetailSchema>;

export const plansSchema = z.object({
  readiness: z.object({ enabled: z.boolean(), ready: z.boolean(), reason: z.string().nullable() }).loose(),
  plans: z.array(z.object({ planId: z.string(), title: z.string(), state: z.string() }).loose()).optional(),
}).loose();
export type PlansView = z.infer<typeof plansSchema>;

export interface EventData { title: string; description: string; color: string; category?: string; recurrence?: unknown; reminders?: number[]; allDay: boolean; startDate: string; endDate: string; startsAt: string | null; endsAt: string | null; timezone: string }
export interface QuestDraft { title: string; scheduledFor: string; targetMinutes: number; difficulty: string; subjectId?: number | null; goalId?: number | null }
export interface QuestChange { title?: string; requiredMinutes?: number; scheduledFor?: string; difficulty?: string; goalId?: number | null }

const PLANNER_CONTRACT = { "x-sylf-planner-contract": "2" };

export function createPlanReads(client: BackendClient) {
  return {
    /** One month's study, rest days and quests, from the server's own schedule service. */
    month: (year: number, month: number, signal: AbortSignal) => client.get(`/api/calendar/month?year=${year}&month=${month}`, calendarMonthSchema, { signal }),
    events: (start: string, end: string, signal: AbortSignal) => client.get(`/api/calendar/personal?start=${start}&end=${end}`, planRangeSchema, { signal }),
    createEvent: (id: string, data: EventData) => client.send("POST", "/api/calendar/personal", { body: { kind: "event", id, revision: 1, data } }),
    /** `revision` is what the person was looking at. A 409 means someone else moved it, and the screen keeps their draft. */
    updateEvent: (id: string, revision: number, data: EventData) => client.send("PATCH", "/api/calendar/personal", { body: { kind: "event", id, revision, data } }),
    deleteEvent: (id: string, revision: number) => client.send("DELETE", "/api/calendar/personal", { body: { kind: "event", id, revision } }),

    questPage: (cursor: number | null, signal: AbortSignal) => client.get(`/api/quests?all=true&limit=100${cursor ? `&cursor=${cursor}` : ""}`, questPageSchema, { signal }),
    createQuest: (draft: QuestDraft) => client.send("POST", "/api/quests", { body: draft }),
    updateQuest: (id: number, change: QuestChange) => client.send("PATCH", `/api/quests/${id}`, { body: change }),
    deleteQuest: (id: number) => client.send("DELETE", `/api/quests/${id}`),

    goals: (signal: AbortSignal) => client.get("/api/goals", z.array(goalDetailSchema), { signal }),
    createGoal: (goal: { title: string; targetDate?: string }) => client.send("POST", "/api/goals", { body: goal }),
    updateGoal: (id: number, change: { title?: string; status?: string; targetDate?: string }) => client.send("PATCH", `/api/goals/${id}`, { body: change }),
    deleteGoal: (id: number) => client.send("DELETE", `/api/goals/${id}`),

    /** The server wants a code, unique per person. It is derived, because a student thinks in names. */
    createSubject: (subject: { name: string; code: string; color?: string; examBoard?: string; level?: string }) => client.send("POST", "/api/subjects", { body: subject }),
    updateSubject: (id: number, change: { name?: string; color?: string }) => client.send("PATCH", `/api/subjects/${id}`, { body: change }),
    archiveSubject: (id: number) => client.send("DELETE", `/api/subjects/${id}`),

    /** The server may move quests off a day that becomes a rest day, and allows one such day a week. */
    setFloatingRestDay: (dateKey: string, enabled: boolean) => client.send("POST", "/api/user/study-schedule/floating-rest-day", { body: { dateKey, enabled } }),

    /** Saved plans and whether new ones can be built here. Reading never grants anything. */
    plans: (signal: AbortSignal) => client.get("/api/planner/workspace", plansSchema, { signal, headers: PLANNER_CONTRACT }),
  };
}
export type PlanReads = ReturnType<typeof createPlanReads>;
