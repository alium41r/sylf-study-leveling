import type { CalendarEvent, EventInput } from "./contracts";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays, localTimeToISO } from "./dates";

export function eventFields(event: EventInput): EventInput {
  return {
    title: event.title,
    description: event.description,
    color: event.color,
    category: event.category || "personal",
    recurrence: event.recurrence || null,
    reminders: event.reminders || [],
    allDay: event.allDay,
    startDate: event.startDate,
    endDate: event.endDate,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
  };
}
export const timeAt = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const minuteOf = (instant: string, zone: string) => {
  const time = TimezoneService.getUserLocalTime(zone, new Date(instant));
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
};
export interface TimelineSegment {
  event: CalendarEvent;
  start: number;
  end: number;
  lane: number;
  lanes: number;
  overlap: boolean;
}
export function timelineSegments(
  events: CalendarEvent[],
  date: string,
  zone: string
): TimelineSegment[] {
  const segments = events
    .filter((event) => !event.allDay && event.startsAt && event.endsAt)
    .map((event) => {
      const startDate = TimezoneService.getUserLocalDate(
        zone,
        new Date(event.startsAt!)
      );
      const endDate = TimezoneService.getUserLocalDate(
        zone,
        new Date(event.endsAt!)
      );
      return {
        event,
        start: startDate < date ? 0 : minuteOf(event.startsAt!, zone),
        end: endDate > date ? 1440 : minuteOf(event.endsAt!, zone),
        lane: 0,
        lanes: 1,
        overlap: false,
      };
    })
    .map((item) =>
      item.end <= item.start &&
      Date.parse(item.event.endsAt!) > Date.parse(item.event.startsAt!)
        ? {
            ...item,
            end: Math.min(
              1440,
              item.start +
                (Date.parse(item.event.endsAt!) -
                  Date.parse(item.event.startsAt!)) /
                  60000
            ),
          }
        : item
    )
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: TimelineSegment[] = [],
    clusterEnd = -1;
  const finish = () => {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));
    for (const item of cluster) {
      item.lanes = lanes;
    }
    cluster = [];
  };
  for (const item of segments) {
    if (item.start >= clusterEnd) finish();
    const used = new Set(
      cluster
        .filter((other) => other.end > item.start)
        .map((other) => other.lane)
    );
    while (used.has(item.lane)) item.lane++;
    cluster.push(item);
    clusterEnd = Math.max(item.end, ...cluster.map((other) => other.end));
  }
  finish();
  // Lanes prevent visual collisions in the civil clock grid; conflict flags use
  // actual instants, so the two repetitions of a DST hour are not conflated.
  let latest: TimelineSegment | null = null,
    latestEnd = -Infinity;
  for (const item of [...segments].sort(
    (a, b) => Date.parse(a.event.startsAt!) - Date.parse(b.event.startsAt!)
  )) {
    const start = Date.parse(item.event.startsAt!),
      end = Date.parse(item.event.endsAt!);
    if (start < latestEnd && latest) {
      item.overlap = true;
      latest.overlap = true;
    }
    if (end > latestEnd) {
      latest = item;
      latestEnd = end;
    }
  }
  return segments;
}
const windowCache = new Map<string, [number, number]>();
function workWindow(date: string, zone: string): [number, number] {
  const key = `${zone}:${date}`;
  const cached = windowCache.get(key);
  if (cached) return cached;
  const value: [number, number] = [
    Date.parse(localTimeToISO(date, "08:00", zone)),
    Date.parse(localTimeToISO(date, "20:00", zone)),
  ];
  if (windowCache.size >= 256) windowCache.clear();
  windowCache.set(key, value);
  return value;
}
/** Union of busy elapsed minutes, not a sum that double counts overlaps. Free time
 * is explicitly within 08:00–20:00, never an assumed study-capacity promise. */
export function dayWorkload(
  events: CalendarEvent[],
  date: string,
  zone: string
) {
  const items = timelineSegments(events.filter(e => !e.external || e.external.busy && e.external.planning !== false), date, zone);
  let busy = 0,
    cursor = 480,
    overlap = 0,
    largest = { start: 480, end: 1200 };
  const gaps: { start: number; end: number }[] = [];
  for (const item of items) {
    const start = Math.max(480, item.start),
      end = Math.min(1200, item.end);
    if (end <= start) continue;
    if (start > cursor) gaps.push({ start: cursor, end: start });
    busy += Math.max(0, end - Math.max(start, cursor));
    if (start < cursor) overlap += Math.max(0, Math.min(cursor, end) - start);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1200) gaps.push({ start: cursor, end: 1200 });
  largest = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0] || {
    start: 1200,
    end: 1200,
  };
  let available = 720;
  try {
    const [from, to] = workWindow(date, zone);
    const ranges = items
      .map((item) => ({
        start: Math.max(from, Date.parse(item.event.startsAt!)),
        end: Math.min(to, Date.parse(item.event.endsAt!)),
      }))
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    let occupiedUntil = from;
    busy = 0;
    overlap = 0;
    available = (to - from) / 60000;
    for (const item of ranges) {
      busy +=
        Math.max(0, item.end - Math.max(item.start, occupiedUntil)) / 60000;
      overlap +=
        Math.max(0, Math.min(item.end, occupiedUntil) - item.start) / 60000;
      occupiedUntil = Math.max(occupiedUntil, item.end);
    }
  } catch {
    /* A historical skipped civil date has no resolvable work window. */
  }
  return {
    busy,
    free: available - busy,
    overlap,
    conflicts: items.filter((item) => item.overlap).length,
    largest,
    allDay: events.filter((event) => event.allDay).length,
  };
}
/** A drop changes personal content only. Viewer-zone wall minutes are converted
 * back to the event's zone before storage; DST gaps are rejected visibly. */
export function moveEvent(
  event: CalendarEvent,
  date: string,
  minute: number | null,
  zone: string,
  resize = false
): EventInput {
  const data = eventFields(event);
  if (event.allDay || minute === null) {
    const delta = Math.round(
      (Date.parse(date) - Date.parse(event.startDate)) / 86400000
    );
    const startDate = addDays(event.startDate, delta),
      endDate = addDays(event.endDate, delta);
    if (event.allDay) return { ...data, startDate, endDate };
    const startsAt = localTimeToISO(
      startDate,
      TimezoneService.getUserLocalTime(
        event.timezone,
        new Date(event.startsAt!)
      ),
      event.timezone
    );
    const endsAt = localTimeToISO(
      endDate,
      TimezoneService.getUserLocalTime(event.timezone, new Date(event.endsAt!)),
      event.timezone
    );
    return { ...data, startDate, endDate, startsAt, endsAt };
  }
  const boundaryDate = minute === 1440 ? addDays(date, 1) : date;
  const instant = localTimeToISO(boundaryDate, timeAt(minute % 1440), zone);
  const startsAt = resize ? event.startsAt! : instant;
  const endsAt = resize
    ? instant
    : new Date(
        Date.parse(instant) +
          Date.parse(event.endsAt!) -
          Date.parse(event.startsAt!)
      ).toISOString();
  if (Date.parse(endsAt) <= Date.parse(startsAt))
    throw new Error("End time must be after start time.");
  return {
    ...data,
    startsAt,
    endsAt,
    startDate: TimezoneService.getUserLocalDate(
      event.timezone,
      new Date(startsAt)
    ),
    endDate: TimezoneService.getUserLocalDate(event.timezone, new Date(endsAt)),
  };
}
