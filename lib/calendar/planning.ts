import type { PoolClient } from "pg";
import { TimezoneService } from "../timezone-service";
import { addDays } from "./dates";
import { eventDTO, externalEventDTO, externalCoverage, rangeMonths } from "./projection";
import { expandEvent, type EventException } from "./recurrence";
import type { CalendarEvent } from "./contracts";

export class CalendarPlanningIncomplete extends Error {}
type Sql = Pick<PoolClient, "query">;
/** Final publication/confirmation only. A busy result must restart the caller's
 * serializable transaction; waiting with an old snapshot would be unsafe. */
export async function lockPlanningCalendar(sql:Sql,ownerId:number){
  const locked=(await sql.query("SELECT pg_try_advisory_xact_lock(73642,$1::int) AS locked",[ownerId])).rows[0]?.locked;
  if(locked!==true)throw Object.assign(new Error("Calendar planning is changing; retry with a fresh snapshot."),{code:"55P03"});
  // Calendar SQL backstops touch this existing account tuple. SERIALIZABLE
  // FOR UPDATE then rejects a snapshot predating a just-committed mutation,
  // including the narrow snapshot/try-lock acquisition race.
  await sql.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE NOWAIT',[ownerId]);
}
type NativeRow = Parameters<typeof eventDTO>[0] & { sharedCalendarId: string | null };
export interface PlanningCalendarSource { ref: string; version: unknown; complete: boolean; freshUntil: string }
/** Read the canonical Calendar tables in the caller's existing transaction.
 * No sync requests, cache writes, credentials, notes or provider calls. Native
 * recurrence/overrides and external event semantics use the display owners. */
export async function readPlanningCalendar(sql: Sql, ownerId: number, start: string, end: string, timezone: string, now: Date) {
  const sources: PlanningCalendarSource[] = [];
  const freshUntil = new Date(now.getTime() + 5 * 60000).toISOString();
  const shared = (await sql.query<{ id: string; revision: number; role: string }>(`SELECT c.id,c.revision,
    CASE WHEN c."ownerId"=$1 THEN 'OWNER' ELSE m.role END AS role FROM "SharedCalendar" c
    LEFT JOIN "SharedCalendarMember" m ON m."calendarId"=c.id AND m."userId"=$1 AND m.status='ACTIVE'
    WHERE c."ownerId"=$1 OR m."userId"=$1 ORDER BY c.id LIMIT 201`, [ownerId])).rows;
  if (shared.length > 200) throw new CalendarPlanningIncomplete("Too many shared calendars for a complete capacity snapshot.");
  const minimum = TimezoneService.getStartOfLocalDateUTC(timezone, start), maximum = TimezoneService.getStartOfLocalDateUTC(timezone, end);
  const native = (await sql.query<NativeRow>(`SELECT e.* FROM "CalendarEvent" e WHERE
    ((e."userId"=$1 AND e."sharedCalendarId" IS NULL) OR e."sharedCalendarId"=ANY($2::text[])) AND
    ((e.recurrence IS NULL AND ((e."allDay" AND e."startDate"<$4 AND e."endDate">$3) OR
      (NOT e."allDay" AND e."startsAt"<$6 AND e."endsAt">$5))) OR
     (e.recurrence IS NOT NULL AND e."startDate"<$4 AND (e."recurrenceThrough" IS NULL OR e."recurrenceThrough">=$7)) OR
     EXISTS(SELECT 1 FROM "CalendarEventException" x WHERE x."eventId"=e.id AND x."startDate"<$4 AND x."endDate">=$3))
    ORDER BY e.id LIMIT 2001`, [ownerId, shared.map(s => s.id), start, end, minimum, maximum, addDays(start, -2)])).rows;
  if (native.length > 2000) throw new CalendarPlanningIncomplete("Too many native events for a complete capacity snapshot.");
  const exceptions = (await sql.query<EventException & { eventId: string }>(`SELECT "eventId","originalDate",cancelled,data
    FROM "CalendarEventException" WHERE "eventId"=ANY($1::text[]) AND
    (("originalDate">=$2 AND "originalDate"<$3) OR ("startDate"<$3 AND "endDate">=$4)) ORDER BY "eventId","originalDate" LIMIT 10001`,
    [native.map(e => e.id), addDays(start, -368), addDays(end, 2), start])).rows;
  if (exceptions.length > 10000) throw new CalendarPlanningIncomplete("Too many Calendar overrides for complete capacity.");
  const events: CalendarEvent[] = native.flatMap(e => expandEvent(eventDTO(e), exceptions.filter(x => x.eventId === e.id), start, end, timezone));
  sources.push({ ref: "native", version: { shared, events: native, exceptions }, complete: true, freshUntil });
  const calendars = (await sql.query<{ id: string; name: string; planning: boolean; visible: boolean; writable: boolean; provider: string; status: string }>(`
    SELECT c.id,c.name,c.planning,c.visible,c.writable,n.provider,n.status FROM "ConnectedCalendar" c
    JOIN "CalendarConnection" n ON n.id=c."connectionId" WHERE n."userId"=$1 ORDER BY c.id LIMIT 201`, [ownerId])).rows;
  if (calendars.length > 198) throw new CalendarPlanningIncomplete("Too many connected calendars for complete capacity.");
  // Catalog membership is itself versioned: adding, excluding or disconnecting a
  // source invalidates an earlier snapshot even when it contains no events.
  sources.push({ ref: "external_catalog", version: calendars, complete: true, freshUntil });
  const months = rangeMonths(start, end);
  for (const calendar of calendars.filter(c => c.planning)) {
    // The column has no time zone and holds UTC, and node-postgres would read it in the server's own zone.
    const windows = (await sql.query<{ id: string; month: string; lastSuccessAt: Date | null }>('SELECT id,month,"lastSuccessAt" AT TIME ZONE \'UTC\' AS "lastSuccessAt" FROM "CalendarSyncWindow" WHERE "calendarId"=$1 AND month=ANY($2::text[]) ORDER BY month', [calendar.id, months])).rows;
    const rows = (await sql.query<Parameters<typeof externalEventDTO>[0]>(`SELECT e.id,e.revision,e.data,e."updatedAt" FROM "ExternalCalendarEvent" e
      WHERE e."calendarId"=$1 AND EXISTS(SELECT 1 FROM "CalendarSyncMember" m JOIN "CalendarSyncWindow" w ON w.id=m."windowId"
      WHERE m."eventId"=e.id AND w."calendarId"=$1 AND w.month=ANY($2::text[])) ORDER BY e.id LIMIT 5001`, [calendar.id, months])).rows;
    if (rows.length > 5000) throw new CalendarPlanningIncomplete("Too many cached external events for complete capacity.");
    const pending = (await sql.query<{ id: string }>('SELECT id FROM "ExternalCalendarMutation" WHERE "calendarId"=$1 AND state NOT IN (\'SUCCEEDED\',\'CANCELLED\') ORDER BY id LIMIT 1', [calendar.id])).rows;
    const coverage = externalCoverage(calendar.status, windows, months, now.getTime());
    sources.push({ ref: `external:${calendar.id}`, version: { calendar, windows, rows, pending }, complete: coverage.complete && pending.length === 0,
      freshUntil: new Date(coverage.freshUntil).toISOString() });
    events.push(...rows.map(row => externalEventDTO(row, { ...calendar, connection: { provider: calendar.provider } })));
  }
  if (events.length > 10000) throw new CalendarPlanningIncomplete("Expanded Calendar range exceeds complete capacity limits.");
  return { events, sources };
}
