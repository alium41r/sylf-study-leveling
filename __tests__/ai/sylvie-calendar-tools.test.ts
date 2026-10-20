/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCalendarChanges,
  executeCalendarRead,
  prepareCalendarOperation,
  validateCalendarProposal,
  executeCalendarMutation,
  reviewCalendarBatch,
  withCalendarReadScope,
} from "@/lib/ai/sylvie/calendar-tools";
import { expandEvent } from "@/lib/calendar/recurrence";
import { defaultCalendarPreferences } from "@/lib/calendar/preferences";
import { boundSylvieToolResult } from "@/lib/ai/sylvie/tool-context";
import type { CalendarEvent } from "@/lib/calendar/contracts";
const mocks = vi.hoisted(() => ({
  events: vi.fn(),
  search: vi.fn(),
  shared: vi.fn(),
  connections: vi.fn(),
  event: vi.fn(),
  preview: vi.fn(),
  study: vi.fn(),
  notes: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/calendar/notebook-service", () => ({
  searchNotebooks: mocks.search,
}));
vi.mock("@/lib/calendar/shared-service", () => ({
  sharedCatalog: mocks.shared,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarNote: { findMany: mocks.notes },
    connectedCalendar: { findMany: mocks.connections },
  },
}));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: async () => "Asia/Karachi",
}));
vi.mock("@/lib/study-schedule-service", () => ({
  StudyScheduleService: { getMonthCalendarData: mocks.study },
}));
vi.mock("@/lib/calendar/personal-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/personal-service")>()),
  readPersonalTypedNotes: mocks.notes,
  readUnifiedCalendarEvents: async (...args: unknown[]) => ({
    events: await mocks.events(...args.slice(0, 4)),
  }),
  readPersonalEvent: mocks.event,
  previewPersonalEvent: mocks.preview,
  writePersonalCalendar: mocks.write,
  deletePersonalCalendar: mocks.remove,
}));
const id = "5cc1666e-4949-4362-8154-c0e15c2b0021";
const base: CalendarEvent = {
  id,
  title: "Physics",
  description: "",
  color: "VIOLET",
  allDay: false,
  startDate: "2027-10-18",
  endDate: "2027-10-18",
  startsAt: "2027-10-18T12:00:00.000Z",
  endsAt: "2027-10-18T13:00:00.000Z",
  timezone: "Asia/Karachi",
  revision: 3,
  createdAt: "",
  updatedAt: "",
  category: "learning",
  recurrence: null,
  reminders: [10],
};
const day = {
  date: "2027-10-18",
  quests: [],
  isRestDay: false,
  dailyGoalMinutes: 120,
  totalMinutes: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.mockResolvedValue([base]);
  mocks.shared.mockResolvedValue([]);
  mocks.connections.mockResolvedValue([]);
  mocks.search.mockResolvedValue({ notes: [], nextCursor: null });
  mocks.event.mockResolvedValue(base);
  mocks.preview.mockImplementation(
    async (_userId, candidate, start, end, zone) =>
      expandEvent(candidate, [], start, end, zone)
  );
  mocks.study.mockResolvedValue({ days: [day], milestones: [] });
  mocks.notes.mockResolvedValue([]);
  mocks.write.mockResolvedValue({ event: base });
  mocks.remove.mockResolvedValue({ deleted: true });
});
describe("Sylvie canonical calendar adapters", () => {
  it("keeps all seven daily workload summaries in bounded model context even when event details overflow", async () => {
    mocks.events.mockResolvedValue(
      Array.from({ length: 40 }, (_, n) => ({
        ...base,
        id: String(n),
        description: "Long details ".repeat(100),
      }))
    );
    const dates = Array.from({ length: 7 }, (_, n) => `2027-10-${18 + n}`);
    mocks.study.mockResolvedValue({
      days: dates.map((date) => ({ ...day, date })),
      milestones: [],
    });
    const result = boundSylvieToolResult(
      await executeCalendarRead(
        "readCalendar",
        { start: dates[0], end: "2027-10-25" },
        7
      )
    );
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"contextTruncated":true');
    for (const date of dates) expect(serialized).toContain(date);
    expect(serialized.length).toBeLessThanOrEqual(8000);
  });
  it("resolves local clock edits, preserves elapsed duration and original instants", () => {
    expect(
      applyCalendarChanges(
        { startDate: "2027-10-19", startTime: "19:00" },
        base,
        "UTC"
      )
    ).toMatchObject({
      startsAt: "2027-10-19T14:00:00.000Z",
      endsAt: "2027-10-19T15:00:00.000Z",
      timezone: "Asia/Karachi",
      reminders: [10],
    });
    expect(
      applyCalendarChanges({ title: "Changed" }, base, "UTC").startsAt
    ).toBe(base.startsAt);
    expect(() =>
      applyCalendarChanges(
        { title: "Appointment", startDate: "2027-10-19", allDay: false },
        undefined,
        "UTC"
      )
    ).toThrow(/start and end times/);
    expect(() =>
      applyCalendarChanges(
        {
          title: "Gap",
          startDate: "2027-03-14",
          startTime: "02:30",
          endTime: "04:00",
          allDay: false,
          timezone: "America/New_York",
        },
        undefined,
        "UTC"
      )
    ).toThrow(/does not exist/);
  });
  it("reads bounded actual schedule data, strict study owners and search independently of conflicts", async () => {
    const result = await executeCalendarRead(
      "readCalendar",
      { start: "2027-10-18", end: "2027-10-19", query: "physics" },
      7
    );
    expect(result).toMatchObject({
      totalMatches: 1,
      events: [{ id, revision: 3 }],
    });
    expect(mocks.events).toHaveBeenCalledWith(
      7,
      "2027-10-18",
      "2027-10-19",
      "Asia/Karachi"
    );
    expect(mocks.study).toHaveBeenCalledWith(7, 2027, 9, { strict: true });
    await expect(
      executeCalendarRead(
        "readCalendar",
        { start: "2027-10-18", end: "2028-01-01" },
        7
      )
    ).rejects.toThrow();
    mocks.study.mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      executeCalendarRead(
        "findCalendarAvailability",
        { start: "2027-10-18", end: "2027-10-19", durationMinutes: 120 },
        7
      )
    ).rejects.toThrow("unavailable");
  });
  it("returns deterministic gaps and honors fixed/floating rest-day resolution", async () => {
    const result = await executeCalendarRead(
      "findCalendarAvailability",
      { start: "2027-10-18", end: "2027-10-19", durationMinutes: 120 },
      7
    );
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAt: "2027-10-18T03:00:00.000Z",
          endsAt: "2027-10-18T05:00:00.000Z",
        }),
      ])
    );
    mocks.study.mockResolvedValue({
      days: [{ ...day, isRestDay: true }],
      milestones: [],
    });
    expect(
      await executeCalendarRead(
        "findCalendarAvailability",
        { start: "2027-10-18", end: "2027-10-19", durationMinutes: 120 },
        7
      )
    ).toMatchObject({ slots: [] });
  });
  it("retrieves only requested date/owner typed notes and never sends ink geometry", async () => {
    mocks.notes.mockResolvedValue({
      notes: [
        {
          id,
          title: "Revision",
          revision: 2,
          text: "x".repeat(80) + "keyword",
          hasHandwriting: true,
          textTruncated: true,
          excerptStart: 1621,
        },
      ],
      truncated: true,
    });
    const result = await executeCalendarRead(
      "readCalendarNotes",
      { date: "2027-10-18", query: "keyword" },
      7
    );
    expect(result).toMatchObject({
      truncated: true,
      notes: [
        { id, hasHandwriting: true, textTruncated: true, excerptStart: 1621 },
      ],
    });
    expect(mocks.notes).toHaveBeenCalledWith(7, "2027-10-18", "keyword");
    expect(JSON.stringify(result)).not.toContain("strokes");
    expect(mocks.events).not.toHaveBeenCalled();
  });
  it("invalidates a proposal when connected-calendar planning preferences change", async () => {
    const external = {
      calendarId: id,
      calendarName: "Classes",
      provider: "google" as const,
      writable: true,
      recurring: false,
      busy: true,
      meeting: false,
      planning: true,
    };
    mocks.events.mockResolvedValue([{ ...base, external }]);
    const proposal = await prepareCalendarOperation(
      "createCalendarEvent",
      {
        changes: {
          title: "New plan",
          allDay: false,
          startDate: "2027-10-18",
          startTime: "19:00",
          endTime: "20:00",
        },
      },
      7
    );
    mocks.events.mockResolvedValue([
      { ...base, external: { ...external, planning: false } },
    ]);
    await expect(validateCalendarProposal(proposal, 7)).rejects.toThrow(
      "schedule changed"
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("prepares exact server-generated commands without writing; confirmation uses the existing service", async () => {
    const proposal = await prepareCalendarOperation(
      "updateCalendarEvent",
      {
        id,
        revision: 3,
        scope: "event",
        changes: { startTime: "19:00", reminders: [30, 10] },
      },
      7
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(proposal).toMatchObject({
      create: false,
      command: {
        id,
        kind: "event",
        revision: 3,
        data: {
          startsAt: "2027-10-18T14:00:00.000Z",
          endsAt: "2027-10-18T15:00:00.000Z",
          reminders: [30, 10],
        },
      },
    });
    expect(proposal.summary).toContain("GMT+5");
    await validateCalendarProposal(proposal, 7);
    expect(await executeCalendarMutation(proposal, 7)).toMatchObject({
      calendarChanged: true,
    });
    expect(mocks.write).toHaveBeenCalledWith(7, proposal.command, false);
    mocks.events.mockResolvedValue([{ ...base, revision: 4 }]);
    await expect(validateCalendarProposal(proposal, 7)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("rejects stale revisions, ambiguous recurrence scope and nonexistent owners", async () => {
    await expect(
      prepareCalendarOperation(
        "updateCalendarEvent",
        { id, revision: 2, scope: "event", changes: { title: "stale" } },
        7
      )
    ).rejects.toMatchObject({ status: 409 });
    mocks.event.mockResolvedValue({
      ...base,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: [1],
        count: null,
        until: null,
      },
    });
    await expect(
      prepareCalendarOperation(
        "deleteCalendarEvent",
        { id, revision: 3, scope: "event" },
        7
      )
    ).rejects.toThrow(/explicitly/);
    mocks.event.mockRejectedValueOnce(new Error("Event not found"));
    await expect(
      prepareCalendarOperation(
        "deleteCalendarEvent",
        { id, revision: 3, scope: "series" },
        8
      )
    ).rejects.toThrow("Event not found");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves original occurrence identity and removes repeat rules only from the override", async () => {
    mocks.event.mockResolvedValue({
      ...base,
      occurrenceDate: "2027-10-11",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: [1],
        count: null,
        until: null,
      },
    });
    const result = await prepareCalendarOperation(
      "updateCalendarEvent",
      {
        id,
        revision: 3,
        scope: "occurrence",
        occurrenceDate: "2027-10-11",
        changes: { startDate: "2027-10-20" },
      },
      7
    );
    expect(result.command).toMatchObject({
      occurrenceDate: "2027-10-11",
      data: { recurrence: null, startDate: "2027-10-20" },
    });
  });
  it("warns about conflicts within a proposed batch and refuses repeated edits to one series", async () => {
    const raw = {
      changes: {
        title: "Block",
        startDate: "2027-10-18",
        allDay: false,
        startTime: "09:00",
        endTime: "11:00",
        category: "time-block",
      },
    };
    const a = await prepareCalendarOperation("createCalendarEvent", raw, 7),
      b = await prepareCalendarOperation("createCalendarEvent", raw, 7);
    const operations = [
      { name: "createCalendarEvent", args: a },
      { name: "createCalendarEvent", args: b },
    ];
    await reviewCalendarBatch(operations, 7);
    expect(operations[0].args.summary).toContain(
      "Combined proposal: 1 overlap"
    );
    await expect(
      reviewCalendarBatch([operations[0], operations[0]], 7)
    ).rejects.toThrow(/Combine changes/);
  });
  it("shares reads only inside a single request and never changes presentation preferences", async () => {
    await withCalendarReadScope(async () => {
      await executeCalendarRead(
        "readCalendar",
        { start: "2027-10-18", end: "2027-10-19" },
        7
      );
      await executeCalendarRead(
        "findCalendarAvailability",
        { start: "2027-10-18", end: "2027-10-19", durationMinutes: 60 },
        7
      );
    });
    expect(mocks.events).toHaveBeenCalledTimes(1);
    await executeCalendarRead(
      "readCalendar",
      { start: "2027-10-18", end: "2027-10-19" },
      7
    );
    expect(mocks.events).toHaveBeenCalledTimes(2);
    expect(defaultCalendarPreferences.timePlanning).toBe(false);
  });
});

describe("Phase 6 bounded Sylvie integrations", () => {
  it("searches only the caller's notebooks and returns bounded excerpts without ink", async () => {
    mocks.search.mockResolvedValue({
      notes: [
        {
          id,
          title: "Maxwell",
          dateKey: "2027-10-18",
          excerpt: "Reviewed electromagnetic notes",
          recognized: true,
        },
      ],
      nextCursor: null,
    });
    const result = await executeCalendarRead(
      "searchCalendarNotes",
      {
        query: "electromag",
        start: "2027-09-01",
        end: "2027-10-31",
        recognizedOnly: true,
      },
      7
    );
    expect(mocks.search).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ query: "electromag", recognizedOnly: true })
    );
    expect(JSON.stringify(result)).toContain("electromagnetic");
    expect(JSON.stringify(result)).not.toContain("points");
  });
  it("requires accepted edit permissions and discloses the shared destination in the existing confirmation", async () => {
    const calendarId = "7d141c12-9683-49d1-ac1a-d03b50786f7a";
    const raw = {
      changes: {
        title: "Study meeting",
        startDate: "2027-10-18",
        startTime: "19:00",
        endTime: "20:00",
        allDay: false,
      },
      sharedCalendarId: calendarId,
    };
    mocks.shared.mockResolvedValue([
      {
        id: calendarId,
        name: "Our study group",
        role: "VIEWER",
        status: "ACTIVE",
      },
    ]);
    await expect(
      prepareCalendarOperation("createCalendarEvent", raw, 7)
    ).rejects.toThrow();
    mocks.shared.mockResolvedValue([
      {
        id: calendarId,
        name: "Our study group",
        role: "EDITOR",
        status: "ACTIVE",
      },
    ]);
    const proposal = await prepareCalendarOperation(
      "createCalendarEvent",
      raw,
      7
    );
    expect(JSON.stringify(proposal)).toContain(calendarId);
    expect(JSON.stringify(proposal)).toContain("Accepted members");
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

it("bounds shared discovery and applies name/provider filters without exposing membership data", async () => {
  mocks.shared.mockResolvedValue(
    Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: "Study group " + i,
      role: "VIEWER",
      status: "ACTIVE",
      members: [{ userId: 999 }],
    }))
  );
  const all = (await executeCalendarRead("getCalendarConnections", {}, 7)) as {
    sharedCalendars: unknown[];
    truncated: boolean;
  };
  expect(all.sharedCalendars).toHaveLength(20);
  expect(all.truncated).toBe(true);
  expect(JSON.stringify(all)).not.toContain("members");
  const match = (await executeCalendarRead(
    "getCalendarConnections",
    { query: "group 24" },
    7
  )) as { sharedCalendars: unknown[] };
  expect(match.sharedCalendars).toHaveLength(1);
  const external = (await executeCalendarRead(
    "getCalendarConnections",
    { provider: "google" },
    7
  )) as { sharedCalendars: unknown[] };
  expect(external.sharedCalendars).toEqual([]);
});
