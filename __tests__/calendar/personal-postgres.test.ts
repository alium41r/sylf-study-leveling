/** Opt-in: run via scripts/test/test-calendar-postgres.mjs against disposable PostgreSQL. */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deliverCalendarReminders } from "@/lib/calendar/reminder-service";
import { eventFields } from "@/lib/calendar/scheduling";
import { defaultCalendarPreferences } from "@/lib/calendar/preferences";
import { prepareCalendarOperation, executeCalendarMutation, validateCalendarProposal } from "@/lib/ai/sylvie/calendar-tools";
import { readPersonalEvent, readPersonalTypedNotes } from "@/lib/calendar/personal-service";
vi.mock("@/lib/study-schedule-service", () => ({ StudyScheduleService: { getMonthCalendarData: async () => ({ days: [], milestones: [] }) } }));
import {
  readPersonalCalendar,
  writePersonalCalendar,
  deletePersonalCalendar,
} from "@/lib/calendar/personal-service";
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg(
        new Pool({
          connectionString:
            process.env.CALENDAR_TEST_DATABASE_URL ||
            "postgresql://unused@127.0.0.1:1/unused",
          max: 1,
        })
      ),
    }),
  };
});
const note = {
  kind: "note" as const,
  id: "0f7e95c7-6d91-437b-8034-421b45ecf0c1",
  revision: 1,
  data: {
    dateKey: "2026-10-18",
    title: "One",
    document: { version: 1 as const, text: "first" },
  },
};
describe.skipIf(!process.env.CALENDAR_TEST_DATABASE_URL)(
  "personal calendar PostgreSQL isolation and revisions",
  () => {
    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id, timezone) VALUES (1, 'Asia/Karachi'), (2, 'America/New_York')`
      );
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("persists, replays creates, isolates owners, rejects stale mutations, and keeps multiple date notes", async () => {
      await writePersonalCalendar(1, note, true);
      await writePersonalCalendar(1, note, true);
      await expect(
        writePersonalCalendar(
          1,
          { ...note, data: { ...note.data, title: "Different retry" } },
          true
        )
      ).rejects.toMatchObject({ status: 409 });
      await writePersonalCalendar(
        1,
        { ...note, id: "357da2ed-20b0-4dcc-891d-6dca143e0616" },
        true
      );
      expect(
        (await readPersonalCalendar(1, "2026-10-18", "2026-10-19")).notes
      ).toHaveLength(2);
      expect(
        (await readPersonalCalendar(2, "2026-10-18", "2026-10-19")).notes
      ).toHaveLength(0);
      await expect(writePersonalCalendar(2, note, false)).rejects.toMatchObject(
        { status: 404 }
      );
      await expect(writePersonalCalendar(2, note, true)).rejects.toMatchObject({
        status: 404,
      });
      await deletePersonalCalendar(2, {
        kind: "note",
        id: note.id,
        revision: 1,
      });
      const saved = await writePersonalCalendar(
        1,
        { ...note, data: { ...note.data, title: "Updated" } },
        false
      );
      expect(saved.note?.revision).toBe(2);
      await expect(writePersonalCalendar(1, note, false)).rejects.toMatchObject(
        { status: 409 }
      );
      await expect(
        deletePersonalCalendar(1, { kind: "note", id: note.id, revision: 1 })
      ).rejects.toMatchObject({ status: 409 });
      await deletePersonalCalendar(1, {
        kind: "note",
        id: note.id,
        revision: 2,
      });
      await deletePersonalCalendar(1, {
        kind: "note",
        id: note.id,
        revision: 2,
      });
      expect(
        (await readPersonalCalendar(1, "2026-10-18", "2026-10-19")).notes
      ).toHaveLength(1);
    });
    it("queries overlaps in the viewer zone and keeps all-day ranges on civil dates", async () => {
      const event = {
        kind: "event" as const,
        id: "268e3a20-0516-4306-8355-04fedbe351e7",
        revision: 1,
        data: {
          title: "Overnight",
          description: "",
          allDay: false,
          color: "BLUE" as const,
          timezone: "UTC",
          startDate: "2026-10-18",
          endDate: "2026-10-18",
          startsAt: "2026-10-18T18:30:00Z",
          endsAt: "2026-10-18T20:00:00Z",
        },
      };
      await writePersonalCalendar(1, event, true);
      await writePersonalCalendar(1, event, true);
      await expect(
        writePersonalCalendar(2, event, false)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        writePersonalCalendar(
          1,
          { ...event, data: { ...event.data, title: "Different retry" } },
          true
        )
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await readPersonalCalendar(1, "2026-10-19", "2026-10-20")).events
      ).toHaveLength(1);
      const allDay = {
        ...event,
        id: "ab767b1a-c1f6-4a8b-a7cf-62626d00692e",
        data: {
          ...event.data,
          allDay: true,
          startsAt: null,
          endsAt: null,
          startDate: "2026-10-18",
          endDate: "2026-10-20",
        },
      };
      await writePersonalCalendar(1, allDay, true);
      expect(
        (await readPersonalCalendar(1, "2026-10-19", "2026-10-20")).events
      ).toHaveLength(2);
      expect(
        (await readPersonalCalendar(1, "2026-10-20", "2026-10-21")).events
      ).toHaveLength(0);
      expect(
        (await readPersonalCalendar(2, "2026-10-18", "2026-10-19")).events
      ).toHaveLength(0);
      const updated = await writePersonalCalendar(
        1,
        { ...event, data: { ...event.data, title: "Edited event" } },
        false
      );
      expect(updated.event?.revision).toBe(2);
      await expect(
        writePersonalCalendar(1, event, false)
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        deletePersonalCalendar(1, { kind: "event", id: event.id, revision: 1 })
      ).rejects.toMatchObject({ status: 409 });
      await deletePersonalCalendar(1, {
        kind: "event",
        id: event.id,
        revision: 2,
      });
    });
    it("rejects reversed and excessive query ranges", async () => {
      await expect(
        readPersonalCalendar(1, "2026-10-19", "2026-10-18")
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        readPersonalCalendar(1, "2026-01-01", "2026-12-31")
      ).rejects.toMatchObject({ status: 400 });
    });
    it("enables RLS and denies direct public database role access", async () => {
      const permissions = await prisma.$queryRawUnsafe(
        `SELECT has_table_privilege('anon','"CalendarNote"','SELECT') AS note, has_table_privilege('authenticated','"CalendarEvent"','SELECT') AS event`
      );
      expect(permissions).toEqual([{ note: false, event: false }]);
      const tables = await prisma.$queryRawUnsafe(
        `SELECT relrowsecurity FROM pg_class WHERE relname IN ('CalendarEvent','CalendarNote')`
      );
      expect(tables).toEqual([
        { relrowsecurity: true },
        { relrowsecurity: true },
      ]);
    });
  }
);

describe.skipIf(!process.env.CALENDAR_TEST_DATABASE_URL)(
  "editable ink PostgreSQL persistence",
  () => {
    it("round-trips editable strokes and detects a changed-ink create retry", async () => {
      const input = {
        kind: "note" as const,
        id: "c9d8f6ca-2edc-4e66-82c1-cf49faf97783",
        revision: 1,
        data: {
          dateKey: "2026-10-18",
          title: "Ink",
          document: {
            version: 2 as const,
            text: "Calculation",
            mode: "note" as const,
            ink: {
              width: 1000 as const,
              height: 1400 as const,
              strokes: [
                {
                  id: "0849326f-20d7-44b5-8f05-338c8cbd5208",
                  tool: "pen" as const,
                  color: "INK" as const,
                  width: 3,
                  points: [
                    [10, 20, 0.2],
                    [30, 40, 0.8],
                  ] as [number, number, number][],
                },
              ],
            },
          },
        },
      };
      const result = await writePersonalCalendar(1, input, true);
      expect(result.note?.document).toEqual(input.data.document);
      await writePersonalCalendar(1, input, true);
      const changed = {
        ...input,
        data: {
          ...input.data,
          document: {
            ...input.data.document,
            ink: { ...input.data.document.ink, strokes: [] },
          },
        },
      };
      await expect(
        writePersonalCalendar(1, changed, true)
      ).rejects.toMatchObject({ status: 409 });
      const updated = await writePersonalCalendar(1, changed, false);
      expect(updated.note?.revision).toBe(2);
    });

    it("projects one recurring series, persists sparse overrides/cancellations, and replays atomic occurrence retries", async () => {
      const command = {
        kind: "event" as const,
        id: "a48372de-9e35-4eab-a1c2-7da315436fee",
        revision: 1,
        data: {
          title: "Weekly class",
          description: "",
          color: "BLUE" as const,
          category: "learning" as const,
          allDay: false,
          startDate: "2026-03-01",
          endDate: "2026-03-01",
          startsAt: "2026-03-01T14:00:00.000Z",
          endsAt: "2026-03-01T15:00:00.000Z",
          timezone: "America/New_York",
          recurrence: {
            frequency: "weekly" as const,
            interval: 1,
            weekdays: [0],
            until: null,
            count: 12,
          },
          reminders: [0, 15],
        },
      };
      await writePersonalCalendar(1, command, true);
      const projection = await readPersonalCalendar(
        1,
        "2026-03-01",
        "2026-04-01"
      );
      expect(projection.events).toHaveLength(5);
      expect(
        await prisma.calendarEvent.count({ where: { id: command.id } })
      ).toBe(1);
      const occurrence = projection.events.find(
        (event) => event.occurrenceDate === "2026-03-08"
      )!;
      const move = {
        ...command,
        occurrenceDate: "2026-03-08",
        mutationId: "667b51b7-6872-4ddc-b97d-b3092d9e8086",
        data: {
          ...eventFields(occurrence),
          recurrence: null,
          startDate: "2026-04-04",
          endDate: "2026-04-04",
          startsAt: "2026-04-04T13:00:00.000Z",
          endsAt: "2026-04-04T14:00:00.000Z",
        },
      };
      await Promise.all([
        writePersonalCalendar(1, move, false),
        writePersonalCalendar(1, move, false),
      ]);
      const series = await prisma.calendarEvent.findUniqueOrThrow({
        where: { id: command.id },
      });
      expect(series.revision).toBe(2);
      expect(
        await prisma.calendarEventException.count({
          where: { eventId: command.id },
        })
      ).toBe(1);
      expect(
        (
          await readPersonalCalendar(1, "2026-03-08", "2026-03-09")
        ).events.filter((event) => event.id === command.id)
      ).toHaveLength(0);
      expect(
        (await readPersonalCalendar(1, "2026-04-04", "2026-04-05")).events.find(
          (event) => event.id === command.id
        )?.occurrenceDate
      ).toBe("2026-03-08");
      await expect(
        writePersonalCalendar(
          1,
          { ...move, data: { ...move.data, title: "Changed retry" } },
          false
        )
      ).rejects.toMatchObject({ status: 409 });
      await expect(writePersonalCalendar(2, move, false)).rejects.toMatchObject(
        { status: 404 }
      );
      const deletion = {
        kind: "event" as const,
        id: command.id,
        revision: 2,
        occurrenceDate: "2026-03-15",
        mutationId: "e2b93292-efdf-4c38-926d-93bdb72198c2",
      };
      await deletePersonalCalendar(1, deletion);
      await deletePersonalCalendar(1, deletion);
      expect(
        (
          await readPersonalCalendar(1, "2026-03-15", "2026-03-16")
        ).events.filter((event) => event.id === command.id)
      ).toHaveLength(0);
      await expect(
        writePersonalCalendar(1, { ...command, revision: 2 }, false)
      ).rejects.toMatchObject({ status: 409 });
      await writePersonalCalendar(
        1,
        {
          ...command,
          revision: 3,
          data: {
            ...command.data,
            recurrence: { ...command.data.recurrence, count: 4 },
          },
        },
        false
      );
      expect(
        await prisma.calendarEventException.count({
          where: { eventId: command.id },
        })
      ).toBe(2);
      expect(
        (await readPersonalCalendar(1, "2026-04-04", "2026-04-05")).events.find(
          (event) => event.id === command.id
        )?.occurrenceDate
      ).toBe("2026-03-08");
    });
    it("claims reminders once across concurrent polls, retains deduplication after clearing the inbox, and scopes the owner", async () => {
      const command = {
        kind: "event" as const,
        id: "9def017a-4cdb-4a6f-8b14-50c8a41c9c90",
        revision: 1,
        data: {
          title: "Reminder QA",
          description: "",
          color: "AMBER" as const,
          allDay: false,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          startsAt: "2026-10-20T10:00:00.000Z",
          endsAt: "2026-10-20T11:00:00.000Z",
          timezone: "UTC",
          reminders: [0, 1, 15],
        },
      };
      await writePersonalCalendar(1, command, true);
      const now = new Date("2026-10-20T10:00:30Z");
      await prisma.$executeRaw`UPDATE "User" SET "notificationPreferences" = '{"masterEnabled":false}'::jsonb WHERE id=1`;
      expect((await deliverCalendarReminders(1, now)).reminders).toHaveLength(
        0
      );
      await prisma.$executeRaw`UPDATE "User" SET "notificationPreferences" = NULL WHERE id=1`;
      const results = await Promise.all([
        deliverCalendarReminders(1, now),
        deliverCalendarReminders(1, now),
      ]);
      expect(
        results.reduce((sum, result) => sum + result.reminders.length, 0)
      ).toBe(1);
      expect(
        await prisma.systemMessage.count({
          where: { userId: 1, content: { contains: "Reminder QA" } },
        })
      ).toBe(1);
      await prisma.systemMessage.deleteMany({ where: { userId: 1 } });
      expect((await deliverCalendarReminders(1, now)).reminders).toHaveLength(
        0
      );
      expect((await deliverCalendarReminders(2, now)).reminders).toHaveLength(
        0
      );
      expect(
        await prisma.calendarReminderReceipt.count({
          where: { eventId: command.id },
        })
      ).toBe(2);
      await deletePersonalCalendar(1, {
        kind: "event",
        id: command.id,
        revision: 1,
      });
      expect(
        await prisma.calendarReminderReceipt.count({
          where: { eventId: command.id },
        })
      ).toBe(0);
    });
    it("does not let previously claimed reminders starve the next bounded batch", async () => {
      await prisma.calendarEvent.createMany({
        data: Array.from({ length: 21 }, (_, index) => ({
          id: crypto.randomUUID(),
          userId: 1,
          title: `Batch QA ${index}`,
          description: "",
          color: "BLUE",
          allDay: false,
          startDate: "2030-01-01",
          endDate: "2030-01-01",
          startsAt: new Date("2030-01-01T10:00:00Z"),
          endsAt: new Date("2030-01-01T11:00:00Z"),
          timezone: "UTC",
          reminders: [0],
        })),
      });
      const now = new Date("2030-01-01T10:00:30Z");
      expect((await deliverCalendarReminders(1, now)).reminders).toHaveLength(
        20
      );
      expect((await deliverCalendarReminders(1, now)).reminders).toHaveLength(
        1
      );
      expect((await deliverCalendarReminders(1, now)).reminders).toHaveLength(
        0
      );
      expect(
        await prisma.systemMessage.count({
          where: { userId: 1, content: { contains: "Batch QA" } },
        })
      ).toBe(21);
    });
    it("stores independent account display preferences with a revision and denies browser table access", async () => {
      await prisma.calendarPreference.create({
        data: {
          userId: 1,
          settings: { ...defaultCalendarPreferences, timePlanning: true },
        },
      });
      expect(
        (await prisma.calendarPreference.findUnique({ where: { userId: 1 } }))
          ?.settings
      ).toMatchObject({ timePlanning: true, workload: false });
      expect(
        await prisma.calendarPreference.findUnique({ where: { userId: 2 } })
      ).toBeNull();
      expect(
        (
          await prisma.calendarPreference.updateMany({
            where: { userId: 1, revision: 0 },
            data: { revision: { increment: 1 } },
          })
        ).count
      ).toBe(0);
      const access = await prisma.$queryRaw<
        Array<{ allowed: boolean }>
      >`SELECT has_table_privilege('authenticated', '"CalendarPreference"', 'SELECT') as allowed`;
      expect(access[0].allowed).toBe(false);
    });
    it("executes Sylvie time-block commands through real calendar persistence, replay, owner checks and stale-preview guards", async () => {
      const proposal = await prepareCalendarOperation("createCalendarEvent", { changes: { title: "Sylvie isolated block", startDate: "2027-10-18", allDay: false, startTime: "19:00", endTime: "20:00", category: "time-block", reminders: [10] } }, 1);
      await validateCalendarProposal(proposal, 1);
      await executeCalendarMutation(proposal, 1);
      await executeCalendarMutation(proposal, 1);
      const saved = await readPersonalEvent(1, proposal.command.id);
      expect(saved).toMatchObject({ category: "time-block", startsAt: "2027-10-18T14:00:00.000Z", reminders: [10], revision: 1 });
      await expect(readPersonalEvent(2, saved.id)).rejects.toMatchObject({ status: 404 });
      const change = await prepareCalendarOperation("updateCalendarEvent", { id: saved.id, revision: saved.revision, scope: "event", changes: { startTime: "18:00" } }, 1);
      const competing = await prepareCalendarOperation("updateCalendarEvent", { id: saved.id, revision: saved.revision, scope: "event", changes: { title: "Edited elsewhere" } }, 1);
      await executeCalendarMutation(competing, 1);
      await expect(validateCalendarProposal(change, 1)).rejects.toMatchObject({ status: 409 });
      const latest = await readPersonalEvent(1, saved.id);
      const remove = await prepareCalendarOperation("deleteCalendarEvent", { id: saved.id, revision: latest.revision, scope: "event" }, 1);
      await executeCalendarMutation(remove, 1);
      await expect(readPersonalEvent(1, saved.id)).rejects.toMatchObject({ status: 404 });
    });
    it("keeps recurring occurrence identity when Sylvie moves and cancels it", async () => {
      const proposal = await prepareCalendarOperation("createCalendarEvent", { changes: { title: "Sylvie recurring block", startDate: "2027-10-18", allDay: false, startTime: "17:00", endTime: "18:00", recurrence: { frequency: "weekly", interval: 1, weekdays: [1], until: null, count: 4 } } }, 1);
      await executeCalendarMutation(proposal, 1);
      const occurrence = await readPersonalEvent(1, proposal.command.id, "2027-10-25");
      const move = await prepareCalendarOperation("updateCalendarEvent", { id: occurrence.id, revision: occurrence.revision, scope: "occurrence", occurrenceDate: "2027-10-25", changes: { startDate: "2027-10-26", startTime: "19:00" } }, 1);
      await executeCalendarMutation(move, 1);
      const moved = await readPersonalEvent(1, occurrence.id, "2027-10-25");
      expect(moved).toMatchObject({ occurrenceDate: "2027-10-25", startDate: "2027-10-26", startsAt: "2027-10-26T14:00:00.000Z", revision: 2 });
      const cancel = await prepareCalendarOperation("deleteCalendarEvent", { id: moved.id, revision: moved.revision, scope: "occurrence", occurrenceDate: "2027-10-25" }, 1);
      await executeCalendarMutation(cancel, 1);
      await expect(readPersonalEvent(1, moved.id, "2027-10-25")).rejects.toMatchObject({ status: 409 });
      expect((await prisma.calendarEventException.count({ where: { eventId: moved.id } }))).toBe(1);
      expect((await readPersonalEvent(1, moved.id)).revision).toBe(3);
    });
    it("searches full typed notes while returning bounded owner-scoped excerpts", async () => {
      await writePersonalCalendar(1, { kind: "note", id: "21527f97-27a0-4304-9d6b-b5ec18d2aaf2", revision: 1, data: { dateKey: "2027-10-19", title: "Typed excerpt", document: { version: 1, text: "x".repeat(5000) + "uniqueneedle" + "y".repeat(2000) } } }, true);
      const result = await readPersonalTypedNotes(1, "2027-10-19", "uniqueneedle");
      expect(result).toMatchObject({ truncated: true, notes: [{ hasHandwriting: false, textTruncated: true, excerptStart: 4921, mode: "note" }] });
      expect(result.notes[0].text).toContain("uniqueneedle");
      expect(result.notes[0].text).toHaveLength(1600);
      expect(await readPersonalTypedNotes(2, "2027-10-19", "uniqueneedle")).toEqual({ notes: [], truncated: false });
    });
  }
);

afterAll(async () => {
  await prisma.$disconnect();
});
