// Plan's reads. One resource per view, so each says loading, offline and failed once. A write invalidates by tag, so Today and Plan never disagree.
import { useMemo } from "react";
import type { Backend, CalendarMonth, GoalDetail, PlanEvent, PlansView, Quest, ResourceDefinition } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";
import { dateKey } from "./shared";

export interface MonthView { month: CalendarMonth; events: PlanEvent[]; today: string }
export interface QuestsView { quests: Quest[]; goals: GoalDetail[] }

const monthResource = (backend: Backend, year: number, month: number): ResourceDefinition<MonthView> => ({
  key: `plan-month-${year}-${month}`, tags: ["plan", "calendar", "today", "subjects"], ttlMs: 60_000,
  async load(signal) {
    // A week can run past the month's edge, so the events reach a week either side.
    const start = dateKey(new Date(year, month, -6));
    const end = dateKey(new Date(year, month + 1, 8));
    const [data, events] = await Promise.all([backend.reads.plan.month(year, month, signal), backend.reads.plan.events(start, end, signal)]);
    return { month: data, events: events.events, today: dateKey(new Date()) };
  },
});

const questsResource = (backend: Backend): ResourceDefinition<QuestsView> => ({
  key: "plan-quests", tags: ["plan", "today"], ttlMs: 60_000,
  async load(signal) {
    const [page, goals] = await Promise.all([backend.reads.plan.questPage(null, signal), backend.reads.plan.goals(signal)]);
    return { quests: page.quests, goals };
  },
});

const plansResource = (backend: Backend): ResourceDefinition<PlansView> => ({ key: "plan-plans", tags: ["plan"], ttlMs: 60_000, load: (signal) => backend.reads.plan.plans(signal) });

function useLive<T>(backend: Backend | null, definition: (backend: Backend) => ResourceDefinition<T>, key: string) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` says when the definition changed.
  const resource = useMemo(() => (backend ? backend.resources.resource(definition(backend)) : null), [backend, key]);
  return toLiveResult(useOptionalResource(resource), resource);
}

export const useMonth = (year: number, month: number) => useLive(useLiveBackend(), (backend) => monthResource(backend, year, month), `${year}-${month}`);
export const useQuestsAndGoals = () => useLive(useLiveBackend(), questsResource, "quests");
export const usePlans = () => useLive(useLiveBackend(), plansResource, "plans");

/** Everything that shows planned work reads again after a change. */
export function refreshPlan(backend: Backend) {
  for (const tag of ["plan", "today", "progress", "traveller"]) backend.resources.invalidate(tag);
}
