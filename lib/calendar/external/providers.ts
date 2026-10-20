import "server-only";
import { z } from "zod";
import { eventInputSchema, type EventInput } from "../contracts";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays, localTimeToISO } from "../dates";
import type { CalendarProvider } from "./security";
import { providerRequest } from "./http";
import { CalendarError } from "../personal-service";
const object = z.record(z.string(), z.unknown());
const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback;
const obj = (v: unknown) => object.parse(v ?? {});
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
export interface ProviderCalendar {
  remoteId: string;
  name: string;
  writable: boolean;
  primary: boolean;
}
export async function listProviderCalendars(
  provider: CalendarProvider,
  token: string
): Promise<ProviderCalendar[]> {
  const calendars: ProviderCalendar[] = [];
  let next =
    provider === "google"
      ? "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100"
      : "https://graph.microsoft.com/v1.0/me/calendars?$top=100";
  for (let page = 0; next && page < 5; page++) {
    const data = await providerRequest(next, token);
    for (const raw of z.array(object).parse(data.items ?? data.value ?? []))
      calendars.push(
        provider === "google"
          ? {
              remoteId: str(raw.id),
              name: str(raw.summary, "Calendar"),
              writable: ["owner", "writer"].includes(str(raw.accessRole)),
              primary: raw.primary === true,
            }
          : {
              remoteId: str(raw.id),
              name: str(raw.name, "Calendar"),
              writable: raw.canEdit === true,
              primary: raw.isDefaultCalendar === true,
            }
      );
    next =
      provider === "google"
        ? data.nextPageToken
          ? `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100&pageToken=${encodeURIComponent(str(data.nextPageToken))}`
          : ""
        : str(data["@odata.nextLink"]);
  }
  if (next)
    throw new CalendarError(
      "This account has more than 500 calendars. Reduce its calendar list before connecting.",
      422
    );
  if (calendars.length > 50)
    throw new CalendarError(
      "This account exceeds the supported limit of 50 calendars.",
      422
    );
  return calendars.filter((c) => c.remoteId);
}
export function normalizeProviderEvent(
  provider: CalendarProvider,
  raw: Record<string, unknown>,
  fallbackZone: string,
  color: EventInput["color"] = "CYAN"
): ProviderEvent {
  const remoteId = str(raw.id);
  if (!remoteId)
    throw new CalendarError("Provider omitted an event identity.", 422);
  const etag = str(raw.etag ?? raw["@odata.etag"]);
  if (raw.status === "cancelled" || raw["@removed"] || raw.isCancelled === true)
    return { remoteId, etag, deleted: true };
  const start = obj(raw.start),
    end = obj(raw.end),
    google = provider === "google";
  const allDay = google ? !!start.date : raw.isAllDay === true;
  const zone = TimezoneService.validateTimezone(
    str(
      google
        ? start.timeZone
        : obj(obj(raw.recurrence).range).recurrenceTimeZone
    )
  )
    ? str(
        google
          ? start.timeZone
          : obj(obj(raw.recurrence).range).recurrenceTimeZone
      )
    : fallbackZone;
  const instant = (v: unknown) => {
    const s = str(v);
    return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z").toISOString();
  };
  const startsAt = allDay ? null : instant(start.dateTime),
    endsAt = allDay ? null : instant(end.dateTime);
  const startDate = allDay
    ? str(start.date ?? start.dateTime).slice(0, 10)
    : TimezoneService.getUserLocalDate(zone, new Date(startsAt!));
  const endDate = allDay
    ? str(end.date ?? end.dateTime).slice(0, 10)
    : TimezoneService.getUserLocalDate(zone, new Date(endsAt!));
  const description = google
    ? str(raw.description)
    : str(raw.bodyPreview) ||
      str(obj(raw.body).content).replace(/<[^>]*>/g, " ");
  const seriesId = str(raw.recurringEventId ?? raw.seriesMasterId) || undefined;
  return {
    remoteId,
    etag,
    data: eventInputSchema.parse({
      title:
        str(raw.summary ?? raw.subject, "Untitled event").slice(0, 180) ||
        "Untitled event",
      description: description.slice(0, 10000),
      color,
      category: "personal",
      allDay,
      startDate,
      endDate,
      startsAt,
      endsAt,
      timezone: zone,
      recurrence: null,
      reminders: google
        ? obj(raw.reminders).overrides &&
          Array.isArray(obj(raw.reminders).overrides)
          ? (
              obj(raw.reminders).overrides as {
                method?: string;
                minutes?: number;
              }[]
            )
              .filter(
                (r) =>
                  r.method === "popup" &&
                  typeof r.minutes === "number" &&
                  r.minutes >= 0 &&
                  r.minutes <= 40320
              )
              .slice(0, 5)
              .map((r) => r.minutes!)
          : []
        : raw.isReminderOn === true
          ? [
              Math.max(
                0,
                Math.min(40320, Number(raw.reminderMinutesBeforeStart) || 0)
              ),
            ]
          : [],
    }),
    seriesId,
    recurring: !!seriesId || !!raw.recurrence,
    originalStart: google
      ? str(
          obj(raw.originalStartTime).dateTime ?? obj(raw.originalStartTime).date
        ) || undefined
      : str(raw.originalStart) || undefined,
    busy: google ? raw.transparency !== "transparent" : raw.showAs !== "free",
    meeting: Array.isArray(raw.attendees) && raw.attendees.length > 0,
  };
}
export function calendarEventURL(
  provider: CalendarProvider,
  calendarId: string,
  eventId?: string
) {
  const calendar = encodeURIComponent(calendarId);
  return provider === "google"
    ? `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`
    : `https://graph.microsoft.com/v1.0/me/calendars/${calendar}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}
export async function readProviderPage(
  provider: CalendarProvider,
  calendarId: string,
  token: string,
  start: string,
  end: string,
  cursor?: string | null,
  nextPage?: string | null,
  incremental = true
) {
  let url: string;
  if (provider === "google") {
    const params = new URLSearchParams({
      singleEvents: "true",
      maxResults: "100",
      showDeleted: "true",
    });
    if (cursor) params.set("syncToken", cursor);
    else {
      params.set("timeMin", start + "T00:00:00Z");
      params.set("timeMax", end + "T00:00:00Z");
    }
    if (nextPage) params.set("pageToken", nextPage);
    url = calendarEventURL(provider, calendarId) + "?" + params;
  } else {
    const prefix = incremental
      ? "https://graph.microsoft.com/v1.0/me/calendarView/delta"
      : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
    url =
      nextPage ||
      (incremental ? cursor : null) ||
      `${prefix}?startDateTime=${start}T00:00:00Z&endDateTime=${end}T00:00:00Z`;
    if (!url.startsWith(prefix + "?"))
      throw new CalendarError("Invalid saved provider cursor.", 422);
  }
  const data = await providerRequest(url, token);
  return {
    events: z.array(object).parse(data.items ?? data.value ?? []),
    nextPage:
      str(
        provider === "google" ? data.nextPageToken : data["@odata.nextLink"]
      ) || null,
    cursor:
      str(
        provider === "google" ? data.nextSyncToken : data["@odata.deltaLink"]
      ) || null,
  };
}
const weekNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ],
  dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function providerEventBody(
  provider: CalendarProvider,
  data: EventInput,
  creating: boolean,
  mutationId: string
) {
  const rule = data.recurrence,
    clock = (iso: string) =>
      `${TimezoneService.getUserLocalDate(data.timezone, new Date(iso))}T${TimezoneService.getUserLocalTime(data.timezone, new Date(iso))}:${new Date(iso).toISOString().slice(17, 23)}`;
  if (provider === "google") {
    let rrule: string[] = [];
    if (rule) {
      let r = `FREQ=${rule.frequency.toUpperCase()};INTERVAL=${rule.interval}`;
      if (rule.frequency === "weekly")
        r += `;BYDAY=${rule.weekdays!.map((d) => dayCodes[d]).join(",")};WKST=SU`;
      if (rule.frequency === "monthly" && rule.monthly === "weekday") {
        const d = new Date(data.startDate + "T12:00:00Z"),
          n = Number(data.startDate.slice(8));
        const ordinal =
          Number(addDays(data.startDate, 7).slice(8)) < n
            ? -1
            : Math.ceil(n / 7);
        r += `;BYDAY=${ordinal}${dayCodes[d.getUTCDay()]}`;
      }
      if (rule.count) r += `;COUNT=${rule.count}`;
      else if (rule.until)
        r += `;UNTIL=${data.allDay ? rule.until.replaceAll("-", "") : new Date(Date.parse(localTimeToISO(addDays(rule.until, 1), "00:00", data.timezone)) - 1000).toISOString().replace(/[-:]/g, "").replace(".000", "")}`;
      rrule = [r];
    }
    return {
      summary: data.title,
      description: data.description,
      start: data.allDay
        ? { date: data.startDate }
        : { dateTime: data.startsAt, timeZone: data.timezone },
      end: data.allDay
        ? { date: data.endDate }
        : { dateTime: data.endsAt, timeZone: data.timezone },
      recurrence: rrule,
      reminders: {
        useDefault: false,
        overrides: (data.reminders || []).map((minutes) => ({
          method: "popup",
          minutes,
        })),
      },
      ...(creating ? { id: mutationId.replace(/-/g, "") } : {}),
    };
  }
  if ((data.reminders?.length || 0) > 1)
    throw new CalendarError(
      "Outlook supports one event reminder. Choose one reminder time.",
      400
    );
  let recurrence: Record<string, unknown> | null = null;
  if (rule) {
    const seed = new Date(data.startDate + "T12:00:00Z"),
      day = Number(data.startDate.slice(8)),
      weekday = weekNames[seed.getUTCDay()];
    const monthly = rule.frequency === "monthly",
      yearly = rule.frequency === "yearly",
      relative = monthly && rule.monthly === "weekday";
    const pattern = {
      type:
        rule.frequency === "daily"
          ? "daily"
          : rule.frequency === "weekly"
            ? "weekly"
            : relative
              ? "relativeMonthly"
              : monthly
                ? "absoluteMonthly"
                : "absoluteYearly",
      interval: rule.interval,
      ...(rule.frequency === "weekly"
        ? {
            daysOfWeek: rule.weekdays!.map((d) => weekNames[d]),
            firstDayOfWeek: "sunday",
          }
        : {}),
      ...(relative
        ? {
            daysOfWeek: [weekday],
            index:
              Number(addDays(data.startDate, 7).slice(8)) < day
                ? "last"
                : ["first", "second", "third", "fourth", "last"][
                    Math.ceil(day / 7) - 1
                  ],
          }
        : monthly || yearly
          ? { dayOfMonth: day }
          : {}),
      ...(yearly ? { month: seed.getUTCMonth() + 1 } : {}),
    };
    recurrence = {
      pattern,
      range: {
        type: rule.count ? "numbered" : rule.until ? "endDate" : "noEnd",
        startDate: data.startDate,
        recurrenceTimeZone: data.timezone,
        ...(rule.count
          ? { numberOfOccurrences: rule.count }
          : rule.until
            ? { endDate: rule.until }
            : {}),
      },
    };
  }
  return {
    subject: data.title,
    body: { contentType: "text", content: data.description },
    isAllDay: data.allDay,
    start: {
      dateTime: data.allDay
        ? data.startDate + "T00:00:00"
        : clock(data.startsAt!),
      timeZone: data.timezone,
    },
    end: {
      dateTime: data.allDay ? data.endDate + "T00:00:00" : clock(data.endsAt!),
      timeZone: data.timezone,
    },
    recurrence,
    isReminderOn: !!data.reminders?.length,
    reminderMinutesBeforeStart: data.reminders?.[0] ?? 0,
    ...(creating ? { transactionId: mutationId } : {}),
  };
}
/** Canonical subset for editing a series. Unrecognized provider rules stay
 * provider-owned and are never silently replaced by a guessed repeat rule. */
export function providerRecurrence(
  provider: CalendarProvider,
  raw: Record<string, unknown>,
  seed: EventInput
) {
  if (!raw.recurrence) return null;
  if (provider === "google") {
    if (
      !Array.isArray(raw.recurrence) ||
      raw.recurrence.length !== 1 ||
      typeof raw.recurrence[0] !== "string" ||
      !raw.recurrence[0].startsWith("RRULE:")
    )
      return undefined;
    const parts: Record<string, string> = Object.fromEntries(
      str(raw.recurrence[0])
        .slice(6)
        .split(";")
        .map((s) => s.split("="))
    );
    if (
      Object.keys(parts).some(
        (k) =>
          !["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"].includes(k)
      )
    )
      return undefined;
    const frequency = parts.FREQ?.toLowerCase();
    if (!["daily", "weekly", "monthly", "yearly"].includes(frequency))
      return undefined;
    if (parts.WKST && parts.WKST !== "SU" && Number(parts.INTERVAL || 1) > 1)
      return undefined;
    const weekdays = parts.BYDAY?.split(",").map((code) =>
      dayCodes.indexOf(code)
    );
    if (
      frequency === "weekly" &&
      (!weekdays?.length || weekdays.some((n) => n < 0))
    )
      return undefined;
    let monthly: "date" | "weekday" = "date";
    if (frequency !== "weekly" && parts.BYDAY) {
      const day = Number(seed.startDate.slice(8)),
        ordinal =
          Number(addDays(seed.startDate, 7).slice(8)) < day
            ? -1
            : Math.ceil(day / 7);
      if (
        frequency !== "monthly" ||
        parts.BYDAY !==
          `${ordinal}${dayCodes[new Date(seed.startDate + "T12:00Z").getUTCDay()]}`
      )
        return undefined;
      monthly = "weekday";
    }
    const until = parts.UNTIL
      ? parts.UNTIL.length === 8
        ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`
        : /^\d{8}T\d{6}Z$/.test(parts.UNTIL)
          ? TimezoneService.getUserLocalDate(
              seed.timezone,
              new Date(
                parts.UNTIL.replace(
                  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                  "$1-$2-$3T$4:$5:$6Z"
                )
              )
            )
          : null
      : null;
    if (parts.UNTIL && !until) return undefined;
    const result = {
      frequency,
      interval: Number(parts.INTERVAL || 1),
      ...(frequency === "weekly" && weekdays ? { weekdays } : {}),
      ...(frequency === "monthly" ? { monthly } : {}),
      until,
      count: parts.COUNT ? Number(parts.COUNT) : null,
    };
    const parsed = eventInputSchema.safeParse({ ...seed, recurrence: result });
    return parsed.success ? parsed.data.recurrence : undefined;
  }
  const recurrence = obj(raw.recurrence),
    pattern = obj(recurrence.pattern),
    range = obj(recurrence.range),
    type = str(pattern.type);
  if (
    range.recurrenceTimeZone &&
    !TimezoneService.validateTimezone(str(range.recurrenceTimeZone))
  )
    return undefined;
  const frequency =
    type === "daily"
      ? "daily"
      : type === "weekly"
        ? "weekly"
        : ["absoluteMonthly", "relativeMonthly"].includes(type)
          ? "monthly"
          : type === "absoluteYearly"
            ? "yearly"
            : undefined;
  if (!frequency) return undefined;
  const seedDay = Number(seed.startDate.slice(8)),
    seedDate = new Date(seed.startDate + "T12:00Z");
  if (
    frequency === "weekly" &&
    Number(pattern.interval || 1) > 1 &&
    pattern.firstDayOfWeek !== "sunday"
  )
    return undefined;
  if (
    ["absoluteMonthly", "absoluteYearly"].includes(type) &&
    Number(pattern.dayOfMonth) !== seedDay
  )
    return undefined;
  if (
    type === "absoluteYearly" &&
    Number(pattern.month) !== seedDate.getUTCMonth() + 1
  )
    return undefined;
  if (type === "relativeMonthly") {
    const index =
      Number(addDays(seed.startDate, 7).slice(8)) < seedDay
        ? "last"
        : ["first", "second", "third", "fourth", "last"][
            Math.ceil(seedDay / 7) - 1
          ];
    if (
      pattern.index !== index ||
      JSON.stringify(pattern.daysOfWeek) !==
        JSON.stringify([weekNames[seedDate.getUTCDay()]])
    )
      return undefined;
  }
  const result = {
    frequency,
    interval: Number(pattern.interval || 1),
    ...(frequency === "weekly"
      ? {
          weekdays: z
            .array(z.string())
            .parse(pattern.daysOfWeek)
            .map((d) => weekNames.indexOf(d.toLowerCase())),
        }
      : {}),
    ...(frequency === "monthly"
      ? { monthly: type === "relativeMonthly" ? "weekday" : "date" }
      : {}),
    until: range.type === "endDate" ? str(range.endDate) : null,
    count: range.type === "numbered" ? Number(range.numberOfOccurrences) : null,
  };
  const parsed = eventInputSchema.safeParse({ ...seed, recurrence: result });
  return parsed.success ? parsed.data.recurrence : undefined;
}
