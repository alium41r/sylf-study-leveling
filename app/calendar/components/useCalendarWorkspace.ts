"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, fetchWithTimeout } from "@/lib/api-transport";
import { getClientSessionEpoch } from "@/lib/client-data-cache";
import type {
  MonthCalendarData,
  DayStudySummary,
  GoalMilestone,
} from "@/lib/study-schedule-types";
import type { PersonalCalendarData } from "@/lib/calendar/contracts";
import { addDays } from "@/lib/calendar/dates";

export async function calendarRequest(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetchWithTimeout(
    (input, options) => apiFetch(String(input), options),
    path,
    { credentials: "include", ...init }
  );
}
export interface CalendarWorkspaceData {
  study: MonthCalendarData[];
  personal: PersonalCalendarData;
  loading: boolean;
  errors: string[];
  days: Map<string, DayStudySummary>;
  milestones: GoalMilestone[];
  floating: Set<string>;
  reload: () => void;
}
export function useCalendarWorkspace(
  userId: number,
  dates: string[]
): CalendarWorkspaceData {
  const start = dates[0],
    end = addDays(dates[dates.length - 1], 1);
  const [revision, setRevision] = useState(0);
  const [personalRevision, setPersonalRevision] = useState(0);
  const reload = useCallback(() => {
    setRevision((value) => value + 1);
    setPersonalRevision((value) => value + 1);
  }, []);
  const reloadPersonal = useCallback(
    () => setPersonalRevision((value) => value + 1),
    []
  );
  const key = `${userId}:${start}:${end}`;
  const [studyState, setStudyState] = useState<{
    key: string;
    revision: number;
    data: MonthCalendarData[];
    error: string;
  }>({ key: "", revision: -1, data: [], error: "" });
  const [personalState, setPersonalState] = useState<{
    key: string;
    revision: number;
    data: PersonalCalendarData;
    error: string;
  }>({ key: "", revision: -1, data: { events: [], notes: [] }, error: "" });
  useEffect(() => {
    const controller = new AbortController(),
      epoch = getClientSessionEpoch();
    const months = new Set<string>();
    for (let day = start; day < end; day = addDays(day, 1))
      months.add(day.slice(0, 7));
    void Promise.all(
      [...months].map(async (month) => {
        const response = await calendarRequest(
          `/api/calendar/month?year=${Number(month.slice(0, 4))}&month=${Number(month.slice(5)) - 1}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!response.ok)
          throw new Error("Study schedule could not be refreshed.");
        return response.json() as Promise<MonthCalendarData>;
      })
    )
      .then((data) => {
        if (!controller.signal.aborted && epoch === getClientSessionEpoch())
          setStudyState({ key, revision, data, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted && epoch === getClientSessionEpoch())
          setStudyState((previous) => ({
            key,
            revision,
            data: previous.key === key ? previous.data : [],
            error: "Study schedule could not be refreshed.",
          }));
      });
    return () => controller.abort();
  }, [key, start, end, revision]);
  useEffect(() => {
    const controller = new AbortController(),
      epoch = getClientSessionEpoch();
    void calendarRequest(`/api/calendar/personal?start=${start}&end=${end}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Events and notes could not be refreshed.");
        const data = (await response.json()) as PersonalCalendarData;
        if (!controller.signal.aborted && epoch === getClientSessionEpoch())
          setPersonalState({
            key,
            revision: personalRevision,
            data,
            error: "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted && epoch === getClientSessionEpoch())
          setPersonalState((previous) => ({
            key,
            revision: personalRevision,
            data:
              previous.key === key ? previous.data : { events: [], notes: [] },
            error: "Events and notes could not be refreshed.",
          }));
      });
    return () => controller.abort();
  }, [key, start, end, personalRevision]);
  useEffect(() => {
    let lastFocus = Date.now();
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFocus > 30000
      ) {
        lastFocus = Date.now();
        reload();
      }
    };
    window.addEventListener("focus", onVisible);
    window.addEventListener("calendar-content-updated", reloadPersonal);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("calendar-content-updated", reloadPersonal);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, reloadPersonal]);
  const hasConnections =
    !!personalState.data.externalCoverage?.connected ||
    !!personalState.data.sharedCount;
  useEffect(() => {
    if (!hasConnections) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reloadPersonal();
    }, 30000);
    return () => clearInterval(timer);
  }, [hasConnections, reloadPersonal]);
  const current = {
    study: studyState.key === key ? studyState.data : [],
    personal:
      personalState.key === key
        ? personalState.data
        : { events: [], notes: [] },
    errors: [
      studyState.key === key ? studyState.error : "",
      personalState.key === key ? personalState.error : "",
    ].filter(Boolean),
  };
  const days = useMemo(
    () =>
      new Map(
        current.study.flatMap((month) =>
          month.days.map((day) => [day.date, day] as const)
        )
      ),
    [current.study]
  );
  const milestones = useMemo(
    () => current.study.flatMap((month) => month.milestones || []),
    [current.study]
  );
  const floating = useMemo(
    () =>
      new Set(current.study.flatMap((month) => month.floatingRestDays || [])),
    [current.study]
  );
  return {
    ...current,
    loading:
      studyState.key !== key ||
      studyState.revision !== revision ||
      personalState.key !== key ||
      personalState.revision !== personalRevision,
    days,
    milestones,
    floating,
    reload,
  };
}
