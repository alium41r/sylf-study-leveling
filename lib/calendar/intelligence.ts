/** Deterministic schedule facts shared by Sylvie tools. No AI or persistence. */
import type { CalendarEvent } from "./contracts";
import type { DayStudySummary } from "@/lib/study-schedule-types";
import { addDays, eventsOnDate, localTimeToISO } from "./dates";
import { TimezoneService } from "@/lib/timezone-service";

export const eventIdentity = (event: CalendarEvent) =>
  `${event.id}${event.occurrenceDate ? `@${event.occurrenceDate}` : ""}`;
export function eventInterval(
  event: CalendarEvent,
  timezone: string
): [number, number] {
  return event.allDay
    ? [
        TimezoneService.getStartOfLocalDateUTC(
          timezone,
          event.startDate
        ).getTime(),
        TimezoneService.getStartOfLocalDateUTC(
          timezone,
          event.endDate
        ).getTime(),
      ]
    : [Date.parse(event.startsAt!), Date.parse(event.endsAt!)];
}
export function schedulingConflicts(
  events: CalendarEvent[],
  timezone: string,
  focus?: ReadonlySet<string>
) {
  const sorted = events.filter(e => !e.external || e.external.busy && e.external.planning !== false)
    .map((event) => ({ event, interval: eventInterval(event, timezone) }))
    .sort((a, b) => a.interval[0] - b.interval[0]);
  const conflicts: {
    first: string;
    second: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
  }[] = [];
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (
      let j = i + 1;
      j < sorted.length && sorted[j].interval[0] < a.interval[1];
      j++
    ) {
      const b = sorted[j];
      if (
        focus &&
        !focus.has(eventIdentity(a.event)) &&
        !focus.has(eventIdentity(b.event))
      )
        continue;
      total++;
      if (conflicts.length < 40)
        conflicts.push({
          first: eventIdentity(a.event),
          second: eventIdentity(b.event),
          startsAt: new Date(
            Math.max(a.interval[0], b.interval[0])
          ).toISOString(),
          endsAt: new Date(
            Math.min(a.interval[1], b.interval[1])
          ).toISOString(),
          allDay: a.event.allDay || b.event.allDay,
        });
    }
  }
  return { total, conflicts, truncated: total > conflicts.length };
}

export function analyzeCalendarDay(
  events: CalendarEvent[],
  study: DayStudySummary,
  timezone: string,
  startMinute = 480,
  endMinute = 1200,
  now = Date.now()
) {
  const date = study.date;
  // Midnight boundaries come from the established timezone owner; civil minutes
  // resolve through Intl offsets, including 23/25-hour dates.
  const window = (minute: number) => {
    try {
      if (minute === 1440)
        return TimezoneService.getStartOfLocalDateUTC(
          timezone,
          addDays(date, 1)
        ).getTime();
      return Date.parse(
        localTimeToISO(
          date,
          `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
          timezone
        )
      );
    } catch {
      return null;
    }
  };
  const from = window(startMinute),
    to = window(endMinute);
  if (from === null || to === null || to <= from)
    return {
      date,
      unavailableWindow: true as const,
      reason:
        "The requested clock boundary does not exist on this date. Choose a different window.",
    };
  const items = eventsOnDate(events, date, timezone).filter(e => !e.external || e.external.busy && e.external.planning !== false);
  const intervals = items
    .map((event) => eventInterval(event, timezone))
    .map(([s, e]) => [Math.max(from, s), Math.min(to, e)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let cursor = from,
    busyMinutes = 0;
  const gaps: { startsAt: string; endsAt: string; minutes: number }[] = [];
  const gap = (s: number, e: number) => {
    s = Math.max(s, now);
    if (e > s)
      gaps.push({
        startsAt: new Date(s).toISOString(),
        endsAt: new Date(e).toISOString(),
        minutes: Math.floor((e - s) / 60000),
      });
  };
  for (const [s, e] of intervals) {
    if (s > cursor) gap(cursor, s);
    busyMinutes += Math.max(0, e - Math.max(cursor, s)) / 60000;
    cursor = Math.max(cursor, e);
  }
  if (cursor < to) gap(cursor, to);
  const pending = study.quests.filter(
    (q) => !["COMPLETED", "FAILED", "ABANDONED"].includes(q.status)
  );
  const studyMinutesRemaining = pending.reduce(
    (sum, q) =>
      sum +
      Math.max(
        0,
        (q.plannedMinutes ?? q.requiredMinutes) - q.elapsedSeconds / 60
      ),
    0
  );
  const freeMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0);
  return {
    date,
    timezone,
    window: {
      startsAt: new Date(from).toISOString(),
      endsAt: new Date(to).toISOString(),
    },
    busyMinutes: Math.round(busyMinutes),
    freeMinutes,
    studyMinutesRemaining: Math.ceil(studyMinutesRemaining),
    studyTargetMinutes: study.dailyGoalMinutes,
    isRestDay: study.isRestDay,
    heavilyBooked: busyMinutes >= ((to - from) / 60000) * 0.85,
    heavilyBookedDefinition:
      "At least 85% of the stated clock window occupied by personal commitments; not a Planner capacity rule.",
    overloaded: studyMinutesRemaining > freeMinutes,
    studyOnRestDay: study.isRestDay && pending.length > 0,
    gaps,
    conflicts: schedulingConflicts(items, timezone),
    caveat:
      "Quests have dates and effort, not reserved clock times. Free gaps exclude all-day events and elapsed time; study effort still needs fitting into them. Study targets are not Planner capacity guarantees.",
  };
}
