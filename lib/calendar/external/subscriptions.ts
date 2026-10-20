import "server-only";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ICAL from "ical.js";
import { CalendarError } from "../personal-service";
import { addDays, localTimeToISO } from "../dates";
import { TimezoneService } from "@/lib/timezone-service";
import type { ProviderEvent } from "./providers";
import { digest } from "./security";
export function publicFeedAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Only global IPv6 unicast. IPv4-mapped/compatible, loopback, link-local,
  // unique-local and multicast addresses fail closed.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(?:0*:|db8:|[12][0-9a-f]{0,2}:)/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
export function feedURL(raw: string) {
  const url = new URL(raw.replace(/^webcal:/i, "https:"));
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/[\[\]]/g, ""))
  )
    throw new CalendarError(
      "Use a public HTTPS calendar subscription URL without a username/password.",
      400
    );
  url.hash = "";
  return url;
}
/** DNS-pinned TLS fetch: the public-address check and the actual connection use
 * the same resolved IP, including after each redirect. No cookies or auth sent. */
export async function fetchFeed(
  raw: string,
  etag?: string
): Promise<{ text: string; etag: string; unchanged: boolean }> {
  let url = feedURL(raw);
  for (let redirect = 0; redirect < 4; redirect++) {
    const addresses = await lookup(url.hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some((a) => !publicFeedAddress(a.address))
    )
      throw new CalendarError(
        "Calendar subscription address is not public.",
        400
      );
    const selected = addresses[0];
    const result = await new Promise<{
      status: number;
      location?: string;
      etag: string;
      text: string;
    }>((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            Accept: "text/calendar",
            ...(etag ? { "If-None-Match": etag } : {}),
          },
          lookup: (_host, _options, cb) =>
            cb(null, selected.address, selected.family),
          timeout: 15000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 3_000_000) {
              request.destroy(
                new CalendarError(
                  "This calendar subscription exceeds 3 MB.",
                  422
                )
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode || 500,
              location: response.headers.location,
              etag: String(response.headers.etag || ""),
              text: Buffer.concat(chunks).toString("utf8"),
            })
          );
          response.on("error", reject);
        }
      );
      request.on("timeout", () =>
        request.destroy(new Error("Calendar subscription timed out."))
      );
      request.on("error", reject);
    });
    if (
      result.status >= 300 &&
      result.status < 400 &&
      result.status !== 304 &&
      result.location
    ) {
      url = feedURL(new URL(result.location, url).href);
      continue;
    }
    if (result.status === 304)
      return { text: "", etag: result.etag || etag || "", unchanged: true };
    if (result.status !== 200)
      throw new CalendarError(
        "The subscription could not be downloaded. Check its private link or try again later.",
        503
      );
    return {
      text: result.text,
      etag: result.etag || digest(result.text),
      unchanged: false,
    };
  }
  throw new CalendarError("This subscription redirects too many times.", 422);
}
export function expandSubscription(
  text: string,
  start: string,
  end: string,
  defaultZone: string
): ProviderEvent[] {
  if (Buffer.byteLength(text) > 3_000_000)
    throw new CalendarError("Subscription is too large.", 422);
  const root = new ICAL.Component(ICAL.parse(text));
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 10000)
    throw new CalendarError("Subscription has too many events.", 422);
  const zones = new Map(
    root
      .getAllSubcomponents("vtimezone")
      .map((c) => [
        String(c.getFirstPropertyValue("tzid")),
        new ICAL.Timezone({ component: c }),
      ])
  );
  // Timezone lookup is scoped to this document through its parent component.
  const events = components
    .filter((c) => !c.hasProperty("recurrence-id"))
    .map((c) => new ICAL.Event(c));
  const exceptions = components
    .filter((c) => c.hasProperty("recurrence-id"))
    .map((c) => new ICAL.Event(c));
  for (const event of events)
    for (const exception of exceptions.filter((e) => e.uid === event.uid))
      event.relateException(exception);
  const output: ProviderEvent[] = [];
  const emitted = new Set<string>();
  let iterations = 0;
  function convert(
    time: InstanceType<typeof ICAL.Time>,
    component: InstanceType<typeof ICAL.Component>,
    property: string
  ) {
    const date = time.toString().slice(0, 10);
    if (time.isDate) return { date, instant: null };
    const tzid = String(
      component.getFirstProperty(property)?.getParameter("tzid") ||
        time.zone.tzid ||
        defaultZone
    );
    if (time.zone.tzid === "UTC")
      return { date, instant: time.toJSDate().toISOString() };
    const zone = tzid === "floating" ? defaultZone : tzid;
    if (TimezoneService.validateTimezone(zone))
      return {
        date,
        instant: localTimeToISO(date, time.toString().slice(11, 16), zone),
      };
    if (zones.has(tzid)) {
      const adjusted = time.clone();
      adjusted.zone = zones.get(tzid)!;
      return { date, instant: adjusted.toJSDate().toISOString() };
    }
    throw new CalendarError(
      `Unsupported subscription timezone: ${zone.slice(0, 80)}.`,
      422
    );
  }
  for (const event of events) {
    const iterator = event.isRecurring() ? event.iterator() : null;
    const occurrences: InstanceType<typeof ICAL.Time>[] = [];
    for (
      let occurrence: InstanceType<typeof ICAL.Time> | null = iterator
        ? iterator.next()
        : event.startDate;
      occurrence;
      occurrence = iterator ? iterator.next() : null
    ) {
      if (++iterations > 50000)
        throw new CalendarError(
          "Subscription recurrence expansion exceeded its safe limit.",
          422
        );
      if (occurrence.toString().slice(0, 10) >= addDays(end, 2)) break;
      occurrences.push(occurrence);
    }
    // Moved exceptions can originate beyond this window but land inside it.
    for (const exception of exceptions.filter((e) => e.uid === event.uid))
      occurrences.push(exception.recurrenceId);
    for (const occurrence of occurrences) {
      const identity = `${event.uid}@${occurrence.toString()}`;
      if (emitted.has(identity)) continue;
      emitted.add(identity);
      const detail = event.getOccurrenceDetails(occurrence),
        item = detail.item;
      if (
        String(item.component.getFirstPropertyValue("status")).toUpperCase() ===
        "CANCELLED"
      )
        continue;
      const a = convert(detail.startDate, item.component, "dtstart"),
        b = convert(detail.endDate, item.component, "dtend");
      if (b.date < start || a.date >= addDays(end, 1)) continue;
      const allDay = detail.startDate.isDate,
        remoteId = `${event.uid}@${occurrence.toString()}`;
      output.push({
        remoteId,
        etag: digest(
          JSON.stringify(item.component.toJSON()) + a.instant + b.instant
        ),
        seriesId: event.isRecurring() ? event.uid : undefined,
        recurring: event.isRecurring(),
        originalStart: occurrence.toString(),
        busy:
          String(
            item.component.getFirstPropertyValue("transp")
          ).toUpperCase() !== "TRANSPARENT",
        data: {
          title: (item.summary || "Untitled event").slice(0, 180),
          description: (item.description || "").slice(0, 10000),
          color: "CYAN",
          allDay,
          startDate: allDay
            ? a.date
            : TimezoneService.getUserLocalDate(
                defaultZone,
                new Date(a.instant!)
              ),
          endDate: allDay
            ? b.date
            : TimezoneService.getUserLocalDate(
                defaultZone,
                new Date(b.instant!)
              ),
          startsAt: a.instant,
          endsAt: b.instant,
          timezone: defaultZone,
          category: "personal",
          recurrence: null,
          reminders: [],
        },
      });
      if (output.length > 2000)
        throw new CalendarError(
          "Subscription has too many occurrences in this window.",
          422
        );
    }
  }
  return output;
}
