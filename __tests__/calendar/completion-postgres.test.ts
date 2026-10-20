/** Opt-in, disposable PostgreSQL only: source preservation, derived search and event-only sharing. */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  writePersonalCalendar,
  readPersonalCalendar,
  readPersonalEvent,
  readPersonalEvents,
  deletePersonalCalendar,
} from "@/lib/calendar/personal-service";
import {
  saveNoteRecognition,
  readNoteRecognitions,
  searchNotebooks,
} from "@/lib/calendar/notebook-service";
import {
  changeSharedCalendar,
  sharedCatalog,
} from "@/lib/calendar/shared-service";
import { inkSource } from "@/lib/calendar/recognition-geometry";
import { noteDocumentSchema, eventInputSchema } from "@/lib/calendar/contracts";
import { RECOGNITION_ENGINE } from "@/lib/calendar/recognition-contracts";
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client"),
    { PrismaPg } = await import("@prisma/adapter-pg"),
    { Pool } = await import("pg");
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
const owner = 61,
  editor = 62,
  viewer = 63,
  outsider = 64;
const stroke = {
  id: randomUUID(),
  tool: "pen" as const,
  color: "INK" as const,
  width: 3,
  points: [
    [10, 20, 0.5],
    [40, 25, 0.8],
  ] as [number, number, number][],
};
const noteId = randomUUID(),
  calId = randomUUID(),
  eventId = randomUUID();
const data = {
  title: "Electromagnetism revision",
  dateKey: "2026-10-18",
  document: noteDocumentSchema.parse({
    version: 2,
    mode: "note",
    text: "Faraday induction",
    ink: { width: 1000, height: 1400, strokes: [stroke] },
  }),
};
const eventData = eventInputSchema.parse({
  title: "Shared meeting",
  description: "Permitted members only",
  allDay: false,
  color: "BLUE",
  timezone: "Asia/Karachi",
  startDate: "2026-10-18",
  endDate: "2026-10-18",
  startsAt: "2026-10-18T12:00:00Z",
  endsAt: "2026-10-18T13:00:00Z",
  reminders: [],
});
const rev = async () =>
  (await prisma.sharedCalendar.findUniqueOrThrow({ where: { id: calId } }))
    .revision;
describe.skipIf(!process.env.CALENDAR_TEST_DATABASE_URL)(
  "Phase 6 persisted recognition and collaboration security",
  () => {
    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id,timezone,username) VALUES (61,'Asia/Karachi','completion_owner'),(62,'Asia/Karachi','completion_editor'),(63,'Asia/Karachi','completion_viewer'),(64,'UTC','completion_outsider')`
      );
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("stores reviewed derived text while preserving exact ink and indexing owner-only keywords", async () => {
      await writePersonalCalendar(
        owner,
        { kind: "note", id: noteId, revision: 1, data },
        true
      );
      const input = {
        id: randomUUID(),
        revision: 0,
        noteId,
        noteRevision: 1,
        strokeIds: [stroke.id],
        sourceHash: createHash("sha256")
          .update(inkSource([stroke], [stroke.id]))
          .digest("hex"),
        text: "Maxwell electromagnetic waves",
        engine: RECOGNITION_ENGINE,
      };
      const saved = await saveNoteRecognition(owner, input);
      expect(saved.revision).toBe(1);
      expect((await saveNoteRecognition(owner, input)).id).toBe(saved.id);
      expect(
        (
          await searchNotebooks(owner, {
            query: "electromag",
            recognizedOnly: true,
          })
        ).notes[0]
      ).toMatchObject({ id: noteId, recognized: true });
      expect(
        (
          await searchNotebooks(owner, {
            query: "Faraday",
            start: "2026-10-18",
            end: "2026-10-18",
          })
        ).notes
      ).toHaveLength(1);
      expect(
        (await searchNotebooks(editor, { query: "Maxwell" })).notes
      ).toEqual([]);
      await expect(readNoteRecognitions(editor, noteId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(saveNoteRecognition(editor, input)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        saveNoteRecognition(owner, {
          ...input,
          id: randomUUID(),
          sourceHash: "0".repeat(64),
        })
      ).rejects.toMatchObject({ status: 409 });
      const stored = await prisma.calendarNote.findUniqueOrThrow({
        where: { id: noteId },
      });
      expect(stored.document).toEqual(data.document);
      const range = await readPersonalCalendar(
        owner,
        "2026-10-18",
        "2026-10-19"
      );
      expect(range.notes[0]).toMatchObject({
        preview: true,
        hasHandwriting: true,
        document: { version: 1, text: "Faraday induction" },
      });
      expect(JSON.stringify(range.notes)).not.toContain(stroke.id);
    });
    it("rejects stale recognition, supports corrections, invalidates results when selected ink changes", async () => {
      const record = (await readNoteRecognitions(owner, noteId))[0];
      await expect(
        saveNoteRecognition(owner, { ...record, noteRevision: 2 })
      ).rejects.toMatchObject({ status: 409 });
      await saveNoteRecognition(owner, {
        ...record,
        noteRevision: 1,
        text: "Corrected Maxwell equations",
      });
      await expect(
        saveNoteRecognition(owner, {
          ...record,
          noteRevision: 1,
          text: "Stale correction",
        })
      ).rejects.toMatchObject({ status: 409 });
      await writePersonalCalendar(
        owner,
        {
          kind: "note",
          id: noteId,
          revision: 1,
          data: { ...data, title: "Renamed" },
        },
        false
      );
      expect(await readNoteRecognitions(owner, noteId)).toHaveLength(1);
      await writePersonalCalendar(
        owner,
        {
          kind: "note",
          id: noteId,
          revision: 2,
          data: {
            ...data,
            document: noteDocumentSchema.parse({
              ...data.document,
              ink: { width: 1000, height: 1400, strokes: [] },
            }),
          },
        },
        false
      );
      expect(await readNoteRecognitions(owner, noteId)).toHaveLength(0);
      expect(
        (await searchNotebooks(owner, { query: "Maxwell" })).notes
      ).toEqual([]);
    });
    it("requires accepted invitations; prevents nonowners from managing membership", async () => {
      await changeSharedCalendar(owner, {
        action: "create",
        id: calId,
        name: "Study group",
      });
      await changeSharedCalendar(owner, {
        action: "create",
        id: calId,
        name: "Study group",
      });
      await changeSharedCalendar(owner, {
        action: "invite",
        id: calId,
        revision: await rev(),
        username: "completion_editor",
        role: "EDITOR",
      });
      await changeSharedCalendar(owner, {
        action: "invite",
        id: calId,
        revision: await rev(),
        username: "completion_viewer",
        role: "VIEWER",
      });
      expect((await sharedCatalog(editor))[0].status).toBe("PENDING");
      await expect(
        writePersonalCalendar(
          editor,
          {
            kind: "event",
            id: eventId,
            revision: 1,
            sharedCalendarId: calId,
            data: eventData,
          },
          true
        )
      ).rejects.toMatchObject({ status: 403 });
      await changeSharedCalendar(editor, {
        action: "respond",
        id: calId,
        accept: true,
      });
      await changeSharedCalendar(viewer, {
        action: "respond",
        id: calId,
        accept: true,
      });
      await expect(
        changeSharedCalendar(editor, {
          action: "rename",
          id: calId,
          revision: await rev(),
          name: "Hijack",
        })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        changeSharedCalendar(owner, {
          action: "rename",
          id: calId,
          revision: 1,
          name: "Stale",
        })
      ).rejects.toMatchObject({ status: 409 });
      expect((await sharedCatalog(editor, true))[0]).not.toHaveProperty(
        "members"
      );
    });
    it("composes shared events in existing views, isolates all private data and reminders, denies viewers", async () => {
      const saved = await writePersonalCalendar(
        editor,
        {
          kind: "event",
          id: eventId,
          revision: 1,
          sharedCalendarId: calId,
          data: eventData,
        },
        true
      );
      expect(saved.event?.shared?.role).toBe("EDITOR");
      expect(
        (
          await prisma.calendarEvent.findUniqueOrThrow({
            where: { id: eventId },
          })
        ).userId
      ).toBe(owner);
      const view = await readPersonalCalendar(
        viewer,
        "2026-10-18",
        "2026-10-19"
      );
      expect(view.events.find((e) => e.id === eventId)?.shared?.role).toBe(
        "VIEWER"
      );
      expect(view.notes).toEqual([]);
      expect(
        (await readPersonalCalendar(outsider, "2026-10-18", "2026-10-19"))
          .events
      ).toEqual([]);
      expect(
        await readPersonalEvents(
          owner,
          "2026-10-18",
          "2026-10-19",
          "Asia/Karachi"
        )
      ).toEqual([]);
      await expect(readPersonalEvent(outsider, eventId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        writePersonalCalendar(
          viewer,
          {
            kind: "event",
            id: eventId,
            revision: 1,
            sharedCalendarId: calId,
            data: eventData,
          },
          false
        )
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        deletePersonalCalendar(viewer, {
          kind: "event",
          id: eventId,
          revision: 1,
          sharedCalendarId: calId,
        })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        writePersonalCalendar(
          owner,
          { kind: "event", id: eventId, revision: 1, data: eventData },
          false
        )
      ).rejects.toMatchObject({ status: 404 });
    });
    it("reuses series/occurrence revisions and revokes access without deleting events when a member leaves", async () => {
      const recurring = await writePersonalCalendar(
        editor,
        {
          kind: "event",
          id: eventId,
          revision: 1,
          sharedCalendarId: calId,
          data: {
            ...eventData,
            recurrence: {
              frequency: "weekly",
              interval: 1,
              weekdays: [0],
              until: "2026-11-01",
              count: null,
            },
          },
        },
        false
      );
      expect(recurring.event?.revision).toBe(2);
      const occurrences = (
        await readPersonalCalendar(viewer, "2026-10-18", "2026-11-08")
      ).events;
      expect(occurrences).toHaveLength(3);
      expect(occurrences.every((e) => e.shared?.calendarId === calId)).toBe(
        true
      );
      await changeSharedCalendar(editor, { action: "leave", id: calId });
      await expect(
        writePersonalCalendar(
          editor,
          {
            kind: "event",
            id: eventId,
            revision: 2,
            sharedCalendarId: calId,
            data: eventData,
          },
          false
        )
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await readPersonalCalendar(editor, "2026-10-18", "2026-11-08")).events
      ).toEqual([]);
      expect(await prisma.calendarEvent.count({ where: { id: eventId } })).toBe(
        1
      );
      await changeSharedCalendar(owner, {
        action: "delete",
        id: calId,
        revision: await rev(),
      });
      expect(await prisma.calendarEvent.count({ where: { id: eventId } })).toBe(
        0
      );
      expect(await prisma.calendarNote.count({ where: { id: noteId } })).toBe(
        1
      );
    });
    it("enforces the combined catalog limit across owned and invited calendars", async () => {
      const owned = Array.from({ length: 9 }, () => ({
        id: randomUUID(),
        ownerId: viewer,
        name: "Owned capacity fixture",
      }));
      const invited = Array.from({ length: 41 }, () => ({
        id: randomUUID(),
        ownerId: owner,
        name: "Invited capacity fixture",
      }));
      const extra = {
        id: randomUUID(),
        ownerId: owner,
        name: "Invitation source",
      };
      await prisma.sharedCalendar.createMany({
        data: [...owned, ...invited, extra],
      });
      await prisma.sharedCalendarMember.createMany({
        data: invited.map((c) => ({
          calendarId: c.id,
          userId: viewer,
          status: "PENDING",
        })),
      });
      await expect(
        changeSharedCalendar(viewer, {
          action: "create",
          id: randomUUID(),
          name: "Over capacity",
        })
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        changeSharedCalendar(owner, {
          action: "invite",
          id: extra.id,
          revision: 1,
          username: "completion_viewer",
          role: "VIEWER",
        })
      ).rejects.toMatchObject({ status: 422 });
    });
    it("keeps backend-only tables inaccessible to browser database roles", async () => {
      for (const table of [
        "SharedCalendar",
        "SharedCalendarMember",
        "CalendarNoteRecognition",
      ]) {
        const rows = await prisma.$queryRawUnsafe<{ allowed: boolean }[]>(
          `SELECT has_table_privilege('authenticated','"${table}"','SELECT') AS allowed`
        );
        expect(rows[0].allowed).toBe(false);
      }
    });
  }
);

describe.skipIf(!process.env.CALENDAR_TEST_DATABASE_URL)(
  "bounded notebook search at scale",
  () => {
    it("paginates a thousand notebooks without returning vector documents; records storage and index evidence", async () => {
      const ink = {
        version: 2,
        mode: "note",
        text: "Electromagnetism laboratory observations",
        ink: {
          width: 1000,
          height: 1400,
          strokes: [
            {
              ...stroke,
              points: Array.from({ length: 500 }, (_, i) => [
                i % 997,
                (i * 17) % 1399,
                0.5,
              ]),
            },
          ],
        },
      };
      await prisma.$executeRaw`INSERT INTO "CalendarNote" ("id","userId","dateKey","title","document","updatedAt") SELECT gen_random_uuid()::text,64,'2026-09-'||lpad((1+(i%28))::text,2,'0'),'Scale notebook '||i,${JSON.stringify(ink)}::jsonb,now() FROM generate_series(1,1000) i`;
      const started = performance.now(),
        first = await searchNotebooks(64, { query: "electromag" }),
        elapsed = performance.now() - started;
      expect(first.notes).toHaveLength(20);
      expect(first.nextCursor).toBeTruthy();
      const next = await searchNotebooks(64, {
        query: "electromag",
        cursor: first.nextCursor,
      });
      expect(next.notes).toHaveLength(20);
      expect(
        new Set([...first.notes, ...next.notes].map((n) => n.id)).size
      ).toBe(40);
      expect(JSON.stringify(first)).not.toContain("points");
      const preview = await readPersonalCalendar(
        64,
        "2026-09-01",
        "2026-10-01"
      );
      const rawBytes = JSON.stringify(
          Array.from({ length: 1000 }, () => ({ document: ink }))
        ).length,
        previewBytes = JSON.stringify(preview.notes).length;
      expect(previewBytes).toBeLessThan(rawBytes / 10);
      const sizes =
        await prisma.$queryRaw`SELECT avg(pg_column_size("document"))::int AS "averageDocumentBytes",avg(pg_column_size("searchVector"))::int AS "averageSearchBytes",pg_relation_size('"CalendarNote_searchVector_idx"')::int AS "ginBytes" FROM "CalendarNote" WHERE "userId"=64`;
      const plan =
        await prisma.$queryRaw`EXPLAIN SELECT "id" FROM "CalendarNote" WHERE "searchVector" @@ to_tsquery('simple','electromag:*')`;
      if (process.env.CALENDAR_TEST_EVIDENCE_PATH)
        writeFileSync(
          process.env.CALENDAR_TEST_EVIDENCE_PATH,
          JSON.stringify(
            {
              notes: 1000,
              pointsPerNote: 500,
              searchMs: Math.round(elapsed),
              rawBytes,
              previewBytes,
              sizes,
              plan,
            },
            null,
            2
          )
        );
    }, 30000);
  }
);
