/** @vitest-environment node */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  seal,
  unseal,
  stableExternalId,
} from "@/lib/calendar/external/security";
import {
  ensureWindows,
  syncCalendarWindow,
  readExternalProjection,
} from "@/lib/calendar/external/service";
import {
  submitExternalMutation,
  processExternalMutation,
} from "@/lib/calendar/external/mutations";
import {
  beginCalendarOAuth,
  finishCalendarOAuth,
  connectionToken,
  disconnectCalendar,
} from "@/lib/calendar/external/connections";
import { receiveCalendarNotification } from "@/lib/calendar/external/notifications";
import { readUnifiedCalendarEvents } from "@/lib/calendar/personal-service";
import { eventInputSchema } from "@/lib/calendar/contracts";
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
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: async () => "Europe/London",
}));
const remote = (id = "event", etag = '"1"', summary = "Class") => ({
  id,
  etag,
  summary,
  start: { dateTime: "2026-10-25T09:00:00Z", timeZone: "Europe/London" },
  end: { dateTime: "2026-10-25T10:00:00Z", timeZone: "Europe/London" },
  attendees: [{ email: "private@example.test" }],
  reminders: { useDefault: true },
});
const data = eventInputSchema.parse({
  title: "New class",
  description: "",
  color: "BLUE",
  allDay: false,
  startDate: "2026-10-25",
  endDate: "2026-10-25",
  startsAt: "2026-10-25T09:00:00.000Z",
  endsAt: "2026-10-25T10:00:00.000Z",
  timezone: "Europe/London",
  category: "personal",
  recurrence: null,
  reminders: [],
});
const fetchMock = vi.fn();
let connectionId: string, calendarId: string, windowId: string;
async function seed() {
  connectionId = randomUUID();
  calendarId = randomUUID();
  await prisma.calendarConnection.create({
    data: {
      id: connectionId,
      userId: 51,
      provider: "google",
      accountId: connectionId,
      label: "Test",
      credentials: seal(
        {
          accessToken: "test-access",
          refreshToken: "test-refresh",
          expiresAt: Date.now() + 3600000,
        },
        `connection:${connectionId}`
      ),
    },
  });
  await prisma.connectedCalendar.create({
    data: {
      id: calendarId,
      connectionId,
      remoteId: "remote",
      name: "Classes",
      writable: true,
      incremental: true,
    },
  });
  await ensureWindows([calendarId], "2026-10-01", "2026-11-01");
  windowId = (
    await prisma.calendarSyncWindow.findFirstOrThrow({ where: { calendarId } })
  ).id;
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
async function initial() {
  fetchMock.mockResolvedValueOnce(
    json({ items: [remote()], nextSyncToken: "cursor" })
  );
  await syncCalendarWindow(windowId);
  return prisma.externalCalendarEvent.findUniqueOrThrow({
    where: { id: stableExternalId(calendarId, "event") },
  });
}
describe.skipIf(!process.env.CALENDAR_TEST_DATABASE_URL)(
  "external calendars on real isolated PostgreSQL",
  () => {
    beforeAll(async () => {
      vi.stubEnv(
        "CALENDAR_ENCRYPTION_KEY",
        Buffer.alloc(32, 8).toString("base64")
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id,timezone) VALUES (51,'Europe/London'),(52,'Asia/Karachi')`
      );
    });
    beforeEach(async () => {
      await prisma.calendarConnection.deleteMany({ where: { userId: 51 } });
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
      await seed();
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      await prisma.$disconnect();
    });
    it("binds OAuth to the signed-in session with hashed one-use state and encrypted PKCE", async () => {
      vi.stubEnv("CALENDAR_PUBLIC_URL", "https://calendar.example");
      vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client");
      vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "secret");
      const request = new Request(
        "https://calendar.example/api/calendar/connections",
        { headers: { cookie: "hunter_token=session-a" } }
      );
      const url = new URL(await beginCalendarOAuth(51, request, "google")),
        state = url.searchParams.get("state")!;
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const rows = await prisma.calendarOAuthState.findMany({
        where: { userId: 51 },
      });
      const row = rows.at(-1)!;
      expect(row.id).not.toBe(state);
      expect(row.verifier).not.toContain(
        url.searchParams.get("code_challenge")
      );
      await expect(
        finishCalendarOAuth(
          51,
          new Request(request.url, {
            headers: { cookie: "hunter_token=session-b" },
          }),
          "google",
          state,
          "code"
        )
      ).rejects.toThrow("another session");
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock
        .mockResolvedValueOnce(
          json({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(
          json({ sub: "google-account", email: "qa@example.test" })
        )
        .mockResolvedValueOnce(
          json({
            items: [
              {
                id: "primary",
                summary: "Primary",
                accessRole: "owner",
                primary: true,
              },
            ],
          })
        );
      const id = await finishCalendarOAuth(
        51,
        request,
        "google",
        state,
        "code"
      );
      const connection = await prisma.calendarConnection.findUniqueOrThrow({
        where: { id },
      });
      expect(unseal(connection.credentials, `connection:${id}`)).toMatchObject({
        refreshToken: "refresh",
      });
      expect(connection.credentials).not.toContain("refresh");
      await expect(
        finishCalendarOAuth(51, request, "google", state, "code")
      ).rejects.toThrow("expired");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    it("refreshes an expired provider token with a revision guard and rotated secret", async () => {
      vi.stubEnv("CALENDAR_PUBLIC_URL", "https://calendar.example");
      vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client");
      vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "secret");
      const connection = await prisma.calendarConnection.update({
        where: { id: connectionId },
        data: {
          credentials: seal(
            { accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 },
            `connection:${connectionId}`
          ),
        },
      });
      fetchMock.mockResolvedValueOnce(
        json({
          access_token: "new",
          refresh_token: "rotated",
          expires_in: 3600,
        })
      );
      expect(await connectionToken(connection)).toBe("new");
      const saved = await prisma.calendarConnection.findUniqueOrThrow({
        where: { id: connectionId },
      });
      expect(saved.credentialRevision).toBe(2);
      expect(
        unseal(saved.credentials, `connection:${connectionId}`)
      ).toMatchObject({ refreshToken: "rotated" });
      await expect(connectionToken(connection)).rejects.toMatchObject({
        providerStatus: 429,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("commits a cursor only after every page and keeps one event across overlapping windows", async () => {
      fetchMock.mockResolvedValueOnce(
        json({ items: [remote()], nextPageToken: "page" })
      );
      await syncCalendarWindow(windowId);
      let window = await prisma.calendarSyncWindow.findUniqueOrThrow({
        where: { id: windowId },
      });
      expect(window.cursor).toBeNull();
      expect(window.lastSuccessAt).toBeNull();
      expect(unseal(window.nextPage!, `page:${windowId}`)).toBe("page");
      fetchMock.mockResolvedValueOnce(
        json({ items: [remote()], nextSyncToken: "cursor" })
      );
      await syncCalendarWindow(windowId);
      window = await prisma.calendarSyncWindow.findUniqueOrThrow({
        where: { id: windowId },
      });
      expect(unseal(window.cursor!, `cursor:${windowId}`)).toBe("cursor");
      expect(window.lastSuccessAt).toBeInstanceOf(Date);
      expect(
        await prisma.externalCalendarEvent.count({ where: { calendarId } })
      ).toBe(1);
      expect(
        (
          await readExternalProjection(
            51,
            "2026-10-01",
            "2026-11-01",
            "Europe/London",
            true,
            true
          )
        ).complete
      ).toBe(true);
      expect(
        (
          await readExternalProjection(
            52,
            "2026-10-01",
            "2026-11-01",
            "Europe/London"
          )
        ).events
      ).toEqual([]);
    });
    it("marks invalid cursors incomplete, keeps the last display and atomically reconciles a replacement scan", async () => {
      await initial();
      fetchMock.mockResolvedValueOnce(new Response("", { status: 410 }));
      await syncCalendarWindow(windowId);
      expect(
        (
          await prisma.calendarSyncWindow.findUniqueOrThrow({
            where: { id: windowId },
          })
        ).lastSuccessAt
      ).toBeNull();
      await expect(
        readExternalProjection(
          51,
          "2026-10-01",
          "2026-11-01",
          "Europe/London",
          true,
          true
        )
      ).rejects.toThrow("coverage");
      fetchMock.mockResolvedValueOnce(
        json({ items: [remote("replacement")], nextSyncToken: "new" })
      );
      await syncCalendarWindow(windowId);
      expect(
        (
          await prisma.externalCalendarEvent.findMany({ where: { calendarId } })
        ).map((e) => e.remoteId)
      ).toEqual(["replacement"]);
    });
    it("never declares hidden planning commitments free and preserves native reads when external display cache fails", async () => {
      await initial();
      await prisma.connectedCalendar.update({
        where: { id: calendarId },
        data: { visible: false, planning: true },
      });
      const projection = await readUnifiedCalendarEvents(
        51,
        "2026-10-01",
        "2026-11-01",
        "Europe/London"
      );
      expect(projection.events[0].external).toMatchObject({
        visible: false,
        planning: true,
      });
      await prisma.calendarSyncWindow.update({
        where: { id: windowId },
        data: { lastSuccessAt: new Date(Date.now() - 31 * 60000) },
      });
      await expect(
        readUnifiedCalendarEvents(
          51,
          "2026-10-01",
          "2026-11-01",
          "Europe/London"
        )
      ).rejects.toThrow("coverage");
      expect(
        (
          await readUnifiedCalendarEvents(
            51,
            "2026-10-01",
            "2026-11-01",
            "Europe/London",
            false,
            false
          )
        ).coverage.complete
      ).toBe(false);
    });
    it("rejects cross-owner and read-only writes, enforces versions, and preserves unrelated meeting fields", async () => {
      const event = await initial(),
        mutationId = randomUUID();
      const command = {
        kind: "event" as const,
        id: event.id,
        revision: event.revision,
        mutationId,
        external: { calendarId, scope: "event" as const, etag: '"1"' },
        data,
      };
      await expect(submitExternalMutation(52, command, false)).rejects.toThrow(
        "read-only"
      );
      await prisma.connectedCalendar.update({
        where: { id: calendarId },
        data: { writable: false },
      });
      await expect(submitExternalMutation(51, command, false)).rejects.toThrow(
        "read-only"
      );
      await prisma.connectedCalendar.update({
        where: { id: calendarId },
        data: { writable: true },
      });
      fetchMock
        .mockResolvedValueOnce(json(remote()))
        .mockResolvedValueOnce(json(remote("event", '"2"', "New class")));
      expect(await submitExternalMutation(51, command, false)).toMatchObject({
        calendarChanged: true,
      });
      const [url, init] = fetchMock.mock.calls.at(-1)!;
      expect(String(url)).toContain("/events/event");
      expect(init.headers["If-Match"]).toBe('"1"');
      expect(JSON.parse(init.body)).toEqual({ summary: "New class" });
      const calls = fetchMock.mock.calls.length;
      expect(await submitExternalMutation(51, command, false)).toMatchObject({
        calendarChanged: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(calls);
      await expect(
        submitExternalMutation(
          51,
          { ...command, data: { ...data, title: "Changed retry" } },
          false
        )
      ).rejects.toThrow("different details");
    });
    it("uses Graph conditional updates and the same durable confirmation path", async () => {
      const event = await initial();
      await prisma.calendarConnection.update({
        where: { id: connectionId },
        data: { provider: "microsoft" },
      });
      const graph = {
        id: "event",
        "@odata.etag": '"1"',
        subject: "Class",
        bodyPreview: "",
        start: { dateTime: "2026-10-25T09:00:00", timeZone: "UTC" },
        end: { dateTime: "2026-10-25T10:00:00", timeZone: "UTC" },
        isAllDay: false,
        isReminderOn: false,
        showAs: "busy",
      };
      fetchMock
        .mockResolvedValueOnce(json(graph))
        .mockResolvedValueOnce(
          json({ ...graph, subject: "New class", "@odata.etag": '"2"' })
        );
      const mutationId = randomUUID();
      expect(
        await submitExternalMutation(
          51,
          {
            kind: "event",
            id: event.id,
            revision: 1,
            mutationId,
            external: { calendarId, scope: "event", etag: '"1"' },
            data,
          },
          false
        )
      ).toMatchObject({ calendarChanged: true });
      const [url, request] = fetchMock.mock.calls.at(-1)!;
      expect(String(url)).toBe(
        "https://graph.microsoft.com/v1.0/me/calendars/remote/events/event"
      );
      expect(request.headers["If-Match"]).toBe('"1"');
      expect(JSON.parse(request.body)).toEqual({ subject: "New class" });
      expect(
        (
          await prisma.externalCalendarMutation.findUniqueOrThrow({
            where: { id: mutationId },
          })
        ).payload
      ).toEqual({});
    });
    it("rejects a provider race before PATCH and records a conflict requiring a new review", async () => {
      const event = await initial();
      fetchMock.mockResolvedValueOnce(json(remote("event", '"new"')));
      await expect(
        submitExternalMutation(
          51,
          {
            kind: "event",
            id: event.id,
            revision: 1,
            mutationId: randomUUID(),
            external: { calendarId, scope: "event", etag: '"1"' },
            data,
          },
          false
        )
      ).rejects.toThrow("changed since review");
      expect(fetchMock.mock.calls.at(-1)?.[1]?.method).not.toBe("PATCH");
    });
    it("recovers a lost update acknowledgement through a provider read without sending a second PATCH", async () => {
      const event = await initial(),
        mutationId = randomUUID();
      fetchMock
        .mockResolvedValueOnce(json(remote()))
        .mockRejectedValueOnce(
          new Error("connection reset after provider commit")
        );
      const result = await submitExternalMutation(
        51,
        {
          kind: "event",
          id: event.id,
          revision: 1,
          mutationId,
          external: { calendarId, scope: "event", etag: '"1"' },
          data,
        },
        false
      );
      expect(result).toMatchObject({ pending: true });
      await prisma.externalCalendarMutation.update({
        where: { id: mutationId },
        data: { nextRunAt: new Date() },
      });
      fetchMock.mockResolvedValueOnce(
        json(remote("event", '"2"', "New class"))
      );
      await processExternalMutation(mutationId);
      expect(
        (
          await prisma.externalCalendarMutation.findUniqueOrThrow({
            where: { id: mutationId },
          })
        ).state
      ).toBe("SUCCEEDED");
      expect(
        fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")
      ).toHaveLength(1);
    });
    it("recovers a lost deletion acknowledgement when the provider confirms absence", async () => {
      const event = await initial(),
        mutationId = randomUUID();
      fetchMock
        .mockResolvedValueOnce(json(remote()))
        .mockRejectedValueOnce(new Error("lost response"));
      expect(
        await submitExternalMutation(
          51,
          {
            kind: "event",
            id: event.id,
            revision: 1,
            mutationId,
            external: { calendarId, scope: "event", etag: '"1"' },
          },
          false
        )
      ).toMatchObject({ pending: true });
      await prisma.externalCalendarMutation.update({
        where: { id: mutationId },
        data: { nextRunAt: new Date() },
      });
      fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
      await processExternalMutation(mutationId);
      expect(
        (
          await prisma.externalCalendarMutation.findUniqueOrThrow({
            where: { id: mutationId },
          })
        ).state
      ).toBe("SUCCEEDED");
      expect(
        await prisma.externalCalendarEvent.findUnique({
          where: { id: event.id },
        })
      ).toBeNull();
    });
    it("deduplicates interrupted Google creates with the stable provider event ID", async () => {
      const mutationId = randomUUID(),
        command = {
          kind: "event" as const,
          id: randomUUID(),
          revision: 1,
          mutationId,
          external: { calendarId, scope: "event" as const },
          data,
        };
      fetchMock.mockRejectedValueOnce(new Error("lost create"));
      expect(await submitExternalMutation(51, command, true)).toMatchObject({
        pending: true,
      });
      await prisma.externalCalendarMutation.update({
        where: { id: mutationId },
        data: { nextRunAt: new Date() },
      });
      fetchMock
        .mockResolvedValueOnce(new Response("", { status: 409 }))
        .mockResolvedValueOnce(
          json(remote(mutationId.replaceAll("-", ""), '"2"', "New class"))
        );
      await processExternalMutation(mutationId);
      expect(
        (
          await prisma.externalCalendarMutation.findUniqueOrThrow({
            where: { id: mutationId },
          })
        ).state
      ).toBe("SUCCEEDED");
      expect(
        fetchMock.mock.calls
          .filter((c) => c[1]?.method === "POST")
          .map((c) => JSON.parse(c[1].body).id)
      ).toEqual([
        mutationId.replaceAll("-", ""),
        mutationId.replaceAll("-", ""),
      ]);
    });
    it("validates notification secrets and coalesces sync; disconnect cascades external cache only", async () => {
      await initial();
      await prisma.connectedCalendar.update({
        where: { id: calendarId },
        data: {
          watchId: "watch",
          watchSecret: "secret",
          watchResource: "resource",
        },
      });
      await prisma.calendarSyncWindow.update({
        where: { id: windowId },
        data: { nextRunAt: new Date(Date.now() + 3600000) },
      });
      expect(
        await receiveCalendarNotification(
          "google",
          new Headers({
            "x-goog-channel-id": "watch",
            "x-goog-channel-token": "forged",
            "x-goog-resource-id": "resource",
          }),
          {}
        )
      ).toEqual([]);
      expect(
        await receiveCalendarNotification(
          "google",
          new Headers({
            "x-goog-channel-id": "watch",
            "x-goog-channel-token": "secret",
            "x-goog-resource-id": "resource",
          }),
          {}
        )
      ).toEqual([51]);
      expect(
        (
          await prisma.calendarSyncWindow.findUniqueOrThrow({
            where: { id: windowId },
          })
        ).nextRunAt.getTime()
      ).toBeLessThanOrEqual(Date.now());
      const nativeId = randomUUID();
      await prisma.calendarEvent.create({
        data: {
          ...data,
          startsAt: new Date(data.startsAt!),
          endsAt: new Date(data.endsAt!),
          recurrence: undefined,
          reminders: [],
          id: nativeId,
          userId: 51,
        },
      });
      fetchMock.mockResolvedValueOnce(new Response());
      await disconnectCalendar(51, connectionId);
      expect(
        await prisma.externalCalendarEvent.count({ where: { calendarId } })
      ).toBe(0);
      expect(
        await prisma.calendarEvent.findUnique({ where: { id: nativeId } })
      ).not.toBeNull();
    });
    it("enables backend-only RLS and revokes ordinary browser roles on all external tables", async () => {
      const rows = await prisma.$queryRawUnsafe<
        { relname: string; relrowsecurity: boolean }[]
      >(
        `SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('CalendarConnection','CalendarOAuthState','ConnectedCalendar','CalendarSyncWindow','ExternalCalendarEvent','CalendarSyncMember','ExternalCalendarMutation')`
      );
      expect(rows).toHaveLength(7);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      const grants = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT * FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated') AND table_name='CalendarConnection'`
      );
      expect(grants).toHaveLength(0);
    });
  }
);
