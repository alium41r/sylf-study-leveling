/** Canonical, credential-free Calendar projections shared by web and worker. */
import { eventInputSchema, type CalendarEvent, type EventInput } from "./contracts";
import { addDays } from "./dates";

export interface ProviderEvent {
  remoteId: string;
  etag: string;
  deleted?: boolean;
  data?: EventInput;
  seriesId?: string;
  originalStart?: string;
  recurring?: boolean;
  busy?: boolean;
  meeting?: boolean;
}

export function eventDTO(row: {
  id: string;
  title: string;
  description: string;
  color: string;
  category: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  recurrence: unknown;
  reminders: number[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  lastMutationId: string | null;
}): CalendarEvent {
  return {
    ...eventInputSchema.parse({
      title: row.title,
      description: row.description,
      color: row.color,
      category: row.category,
      allDay: row.allDay,
      startDate: row.startDate,
      endDate: row.endDate,
      startsAt: row.startsAt?.toISOString() || null,
      endsAt: row.endsAt?.toISOString() || null,
      timezone: row.timezone,
      recurrence: row.recurrence,
      reminders: row.reminders,
    }),
    id: row.id,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMutationId: row.lastMutationId,
  };
}

export function externalEventDTO(
  row: { id: string; revision: number; data: unknown; updatedAt: Date },
  calendar: {
    id: string;
    name: string;
    writable: boolean;
    visible?: boolean;
    planning?: boolean;
    connection: { provider: string };
  }
): CalendarEvent {
  const raw = row.data as unknown as ProviderEvent;
  const data = eventInputSchema.parse(raw.data);
  return {
    ...data,
    id: row.id,
    revision: row.revision,
    createdAt: row.updatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    external: {
      calendarId: calendar.id,
      calendarName: calendar.name,
      provider: calendar.connection.provider as NonNullable<CalendarEvent["external"]>["provider"],
      writable: calendar.writable,
      seriesId: raw.seriesId,
      recurring: raw.recurring || false,
      originalStart: raw.originalStart,
      busy: raw.busy !== false,
      meeting: raw.meeting || false,
      etag: raw.etag,
      visible: calendar.visible,
      planning: calendar.planning,
    },
  };
}

export function rangeMonths(start: string, end: string) {
  const result: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1))
    if (!result.includes(date.slice(0, 7))) result.push(date.slice(0, 7));
  return result;
}
/** Same coverage rule for Calendar display and Planner's cache-only reads. */
export function externalCoverage(status: string, windows: readonly { month: string; lastSuccessAt: Date | null }[], months: readonly string[], now: number) {
  const times = months.map(month => windows.find(w => w.month === month)?.lastSuccessAt?.getTime() ?? 0);
  const freshUntil = Math.min(...times) + 30 * 60000;
  return { complete: status === "ACTIVE" && times.every(t => t > 0) && freshUntil > now, freshUntil };
}
