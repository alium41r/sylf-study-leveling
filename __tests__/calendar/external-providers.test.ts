/** @vitest-environment node */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  seal,
  unseal,
  stableExternalId,
  providerConfig,
  publicOrigin,
} from "@/lib/calendar/external/security";
import {
  feedURL,
  publicFeedAddress,
  expandSubscription,
} from "@/lib/calendar/external/subscriptions";
import {
  normalizeProviderEvent,
  providerEventBody,
  providerRecurrence,
  readProviderPage,
} from "@/lib/calendar/external/providers";
import { providerRequest } from "@/lib/calendar/external/http";
import { eventInputSchema } from "@/lib/calendar/contracts";
import { schedulingConflicts } from "@/lib/calendar/intelligence";
import { dayWorkload } from "@/lib/calendar/scheduling";
const input = eventInputSchema.parse({
  title: "Revision",
  description: "Private",
  allDay: false,
  startDate: "2026-10-25",
  endDate: "2026-10-25",
  startsAt: "2026-10-25T17:00:00.000Z",
  endsAt: "2026-10-25T18:00:00.000Z",
  timezone: "Europe/London",
  color: "BLUE",
  category: "personal",
  reminders: [10],
  recurrence: null,
});
beforeEach(() => {
  vi.stubEnv("CALENDAR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("CALENDAR_PUBLIC_URL", "https://calendar.example");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "test");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("provider boundaries and deterministic projections", () => {
  it("encrypts with random authenticated nonces, owner-bound AAD and no fallback key", () => {
    const a = seal({ token: "secret" }, "connection:a"),
      b = seal({ token: "secret" }, "connection:a");
    expect(a).not.toContain("secret");
    expect(a).not.toBe(b);
    expect(unseal(a, "connection:a")).toEqual({ token: "secret" });
    expect(() => unseal(a, "connection:b")).toThrow();
    expect(() => unseal(a.slice(0, -4) + "xxxx", "connection:a")).toThrow();
    vi.stubEnv("CALENDAR_ENCRYPTION_KEY", "");
    expect(() => seal("secret", "x")).toThrow("encryption key");
  });
  it("uses configured exact dedicated callback URLs and additional calendar scopes", () => {
    expect(providerConfig("google").redirectUri).toBe(
      "https://calendar.example/api/calendar/connections/callback/google"
    );
    expect(providerConfig("google").scopes).toContain("calendar.events");
    vi.stubEnv("CALENDAR_PUBLIC_URL", "https://calendar.example/nested");
    expect(() => publicOrigin()).toThrow("origin");
    expect(stableExternalId("a", "1")).toBe(stableExternalId("a", "1"));
    expect(stableExternalId("a", "1")).not.toBe(stableExternalId("b", "1"));
  });
  it("blocks private subscription destinations and accepts public HTTPS/webcal only", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.4",
      "172.31.0.1",
      "169.254.169.254",
      "100.64.1.2",
      "192.168.1.1",
      "198.18.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "2001:db8::1",
      "2002:7f00:1::",
    ])
      expect(publicFeedAddress(ip), ip).toBe(false);
    expect(publicFeedAddress("8.8.8.8")).toBe(true);
    expect(publicFeedAddress("2606:4700:4700::1111")).toBe(true);
    expect(feedURL("webcal://calendar.example/private.ics").href).toBe(
      "https://calendar.example/private.ics"
    );
    for (const url of [
      "http://calendar.example/a",
      "https://127.0.0.1/a",
      "https://user:pass@calendar.example/a",
      "https://calendar.example:8080/a",
    ])
      expect(() => feedURL(url)).toThrow();
  });
  it("preserves exclusive all-day dates and stable occurrence metadata", () => {
    const e = normalizeProviderEvent(
      "google",
      {
        id: "occ",
        etag: '"v1"',
        summary: "Class",
        start: { date: "2026-10-25" },
        end: { date: "2026-10-26" },
        recurringEventId: "series",
        originalStartTime: { date: "2026-10-25" },
        transparency: "transparent",
      },
      "Asia/Karachi"
    );
    expect(e.data).toMatchObject({
      allDay: true,
      startDate: "2026-10-25",
      endDate: "2026-10-26",
      startsAt: null,
      reminders: [],
    });
    expect(e).toMatchObject({
      seriesId: "series",
      recurring: true,
      busy: false,
      originalStart: "2026-10-25",
    });
    expect(
      normalizeProviderEvent(
        "microsoft",
        { id: "gone", "@removed": { reason: "deleted" } },
        "UTC"
      ).deleted
    ).toBe(true);
  });
  it("maps provider write identities, recurrence and reminders without duplicate Sylf alarms", () => {
    const data = {
      ...input,
      recurrence: {
        frequency: "weekly" as const,
        interval: 1,
        weekdays: [1],
        until: null,
        count: 8,
      },
    };
    const g = providerEventBody("google", data, true, "abc-def");
    expect(g).toMatchObject({
      id: "abcdef",
      recurrence: ["FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;COUNT=8"],
    });
    const m = providerEventBody("microsoft", data, true, "stable");
    expect(m).toMatchObject({
      transactionId: "stable",
      isReminderOn: true,
      reminderMinutesBeforeStart: 10,
      recurrence: {
        pattern: { type: "weekly", daysOfWeek: ["monday"] },
        range: { type: "numbered", numberOfOccurrences: 8 },
      },
    });
    expect(() =>
      providerEventBody(
        "microsoft",
        { ...input, reminders: [5, 10] },
        true,
        "id"
      )
    ).toThrow("one event reminder");
    expect(
      providerRecurrence(
        "google",
        { recurrence: ["RRULE:FREQ=MONTHLY;BYSETPOS=2;BYDAY=MO"] },
        input
      )
    ).toBeUndefined();
  });
  it("uses stable Graph delta only for default calendar and paginated snapshots for additional calendars", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({
            value: [],
            "@odata.deltaLink":
              "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=opaque",
          })
        )
      );
    vi.stubGlobal("fetch", fetch);
    await readProviderPage(
      "microsoft",
      "extra",
      "token",
      "2026-10-01",
      "2026-11-01",
      null,
      null,
      false
    );
    expect(String(fetch.mock.calls[0][0])).toContain(
      "/calendars/extra/calendarView?"
    );
    await readProviderPage(
      "microsoft",
      "default",
      "token",
      "2026-10-01",
      "2026-11-01",
      null,
      null,
      true
    );
    expect(String(fetch.mock.calls[1][0])).toContain(
      "/v1.0/me/calendarView/delta?"
    );
    await expect(
      readProviderPage(
        "microsoft",
        "extra",
        "token",
        "2026-10-01",
        "2026-11-01",
        "https://attacker.example/?token=x"
      )
    ).rejects.toThrow("Invalid saved");
    await expect(
      providerRequest("https://attacker.example/events", "secret")
    ).rejects.toThrow("Unsafe");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("omits fixed time bounds from Google incremental requests and respects retry-after", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], nextSyncToken: "new" }))
      )
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "120" } })
      );
    vi.stubGlobal("fetch", fetch);
    await readProviderPage(
      "google",
      "cal",
      "token",
      "2026-10-01",
      "2026-11-01",
      "old",
      "page"
    );
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("syncToken")).toBe("old");
    expect(url.searchParams.has("timeMin")).toBe(false);
    await expect(
      providerRequest(
        "https://www.googleapis.com/calendar/v3/calendars",
        "token"
      )
    ).rejects.toMatchObject({ providerStatus: 429, retrySeconds: 120 });
  });
  it("expands ICS with local DST, exclusions, cancellations and moved-in exceptions", () => {
    const feed = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:class\r\nDTSTART;TZID=Europe/London:20261024T090000\r\nDTEND;TZID=Europe/London:20261024T100000\r\nRRULE:FREQ=DAILY;COUNT=5\r\nEXDATE;TZID=Europe/London:20261026T090000\r\nSUMMARY:Class\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:class\r\nRECURRENCE-ID;TZID=Europe/London:20261027T090000\r\nDTSTART;TZID=Europe/London:20261025T110000\r\nDTEND;TZID=Europe/London:20261025T120000\r\nSUMMARY:Moved class\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const rows = expandSubscription(
      feed,
      "2026-10-24",
      "2026-10-26",
      "Europe/London"
    );
    expect(rows).toHaveLength(3);
    expect(
      rows.find((e) => e.data?.title === "Moved class")?.data?.startsAt
    ).toBe("2026-10-25T11:00:00.000Z");
    expect(
      rows.find((e) => e.originalStart?.startsWith("2026-10-24"))?.data
        ?.startsAt
    ).toBe("2026-10-24T08:00:00.000Z");
    expect(
      rows.find((e) => e.originalStart?.startsWith("2026-10-25"))?.data
        ?.startsAt
    ).toBe("2026-10-25T09:00:00.000Z");
  });
  it("includes hidden planning commitments, excludes free/opted-out external items from scheduling", () => {
    const base = {
      ...input,
      id: "x",
      revision: 1,
      createdAt: "",
      updatedAt: "",
    };
    const external = {
      calendarId: "cal",
      calendarName: "Classes",
      provider: "google" as const,
      writable: false,
      recurring: false,
      meeting: false,
      busy: true,
      visible: false,
      planning: true,
    };
    expect(
      schedulingConflicts(
        [base, { ...base, id: "y", external }],
        "Europe/London"
      ).total
    ).toBe(1);
    expect(
      schedulingConflicts(
        [base, { ...base, id: "y", external: { ...external, busy: false } }],
        "Europe/London"
      ).total
    ).toBe(0);
    expect(
      dayWorkload(
        [{ ...base, external: { ...external, planning: false } }],
        input.startDate,
        "Europe/London"
      ).busy
    ).toBe(0);
  });
});
