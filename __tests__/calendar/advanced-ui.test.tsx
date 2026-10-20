import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import EventEditor from "@/app/calendar/components/EventEditor";
import CalendarSettings from "@/app/calendar/components/CalendarSettings";
import CalendarTimeline from "@/app/calendar/components/CalendarTimeline";
import { defaultCalendarPreferences } from "@/lib/calendar/preferences";
import { runEventOperation } from "@/lib/calendar/event-operations";
import { calendarRequest } from "@/app/calendar/components/useCalendarWorkspace";
import type { CalendarEvent } from "@/lib/calendar/contracts";
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));
vi.mock("@/lib/calendar/event-operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/event-operations")>()),
  runEventOperation: vi.fn(),
}));
vi.mock("@/app/calendar/components/useCalendarWorkspace", () => ({
  calendarRequest: vi.fn(),
}));
const event: CalendarEvent = {
  id: "548335cf-214b-41d5-a234-58b629929423",
  title: "Class",
  description: "",
  color: "BLUE",
  allDay: false,
  startDate: "2026-10-19",
  endDate: "2026-10-19",
  startsAt: "2026-10-19T09:00:00.000Z",
  endsAt: "2026-10-19T10:00:00.000Z",
  timezone: "UTC",
  revision: 1,
  createdAt: "",
  updatedAt: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(calendarRequest).mockResolvedValue(
    new Response(JSON.stringify({ connections: [] }))
  );
  localStorage.clear();
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.mocked(runEventOperation).mockResolvedValue({ event });
});
describe("progressive calendar controls", () => {
  it("keeps subscribed events read only while allowing an independent Sylf copy", async () => {
    const external = {
      calendarId: event.id,
      calendarName: "Classes",
      provider: "ics" as const,
      writable: false,
      recurring: false,
      busy: true,
      meeting: false,
    };
    render(
      <EventEditor
        selection={{
          kind: "event",
          date: event.startDate,
          item: { ...event, external },
        }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Save event" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete event" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("Title")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(runEventOperation).toHaveBeenCalled());
    expect(
      vi.mocked(runEventOperation).mock.calls[0][0].body
    ).not.toHaveProperty("external");
  });
  it("sends the exact connected destination and occurrence identity through existing recovery", async () => {
    const external = {
      calendarId: event.id,
      calendarName: "Appointments",
      provider: "google" as const,
      writable: true,
      recurring: true,
      seriesId: "master",
      busy: true,
      meeting: true,
      etag: '"v3"',
    };
    render(
      <EventEditor
        selection={{
          kind: "event",
          date: event.startDate,
          item: { ...event, external },
        }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Edit recurring event")).toHaveValue(
      "occurrence"
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Moved class" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(runEventOperation).toHaveBeenCalled());
    const operation = vi.mocked(runEventOperation).mock.calls[0][0];
    expect(operation.body).toMatchObject({
      id: event.id,
      external: { calendarId: event.id, scope: "occurrence", etag: '"v3"' },
    });
    expect(operation.body).not.toHaveProperty("occurrenceDate");
  });
  it("lets users choose a writable destination while keeping Sylf as the default", async () => {
    vi.mocked(calendarRequest).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            connections: [
              {
                status: "ACTIVE",
                provider: "microsoft",
                calendars: [
                  { id: event.id, name: "Work", writable: true },
                  { id: "readonly", name: "Read only", writable: false },
                ],
              },
            ],
          })
        )
    );
    render(
      <EventEditor
        selection={{ kind: "event", date: event.startDate }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const calendar = await screen.findByLabelText("Destination calendar");
    expect(calendar).toHaveValue("");
    expect(
      screen.queryByRole("option", { name: "Read only" })
    ).not.toBeInTheDocument();
    fireEvent.change(calendar, { target: { value: event.id } });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Meeting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(runEventOperation).toHaveBeenCalled());
    expect(vi.mocked(runEventOperation).mock.calls[0][0].body).toMatchObject({
      external: { calendarId: event.id, scope: "event" },
    });
  });
  it("duplicates an event into an independent new identity", async () => {
    const onSaved = vi.fn();
    render(
      <EventEditor
        selection={{ kind: "event", date: event.startDate, item: event }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Copy of Class");
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const operation = vi.mocked(runEventOperation).mock.calls[0][0];
    expect(operation.method).toBe("POST");
    expect(operation.body.id).not.toBe(event.id);
  });
  it("deletes only the selected recurring occurrence by default", async () => {
    const recurring = {
      ...event,
      occurrenceDate: event.startDate,
      recurrence: {
        frequency: "weekly" as const,
        interval: 1,
        weekdays: [1],
        until: null,
        count: null,
      },
    };
    const onSaved = vi.fn();
    render(
      <EventEditor
        selection={{ kind: "event", date: event.startDate, item: recurring }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(vi.mocked(runEventOperation).mock.calls[0][0]).toMatchObject({
      method: "DELETE",
      body: { id: event.id, revision: 1, occurrenceDate: event.startDate },
    });
  });
  it("keeps new events simple, exposes a basic reminder, and reveals repeat settings on demand", async () => {
    const onSaved = vi.fn();
    render(
      <EventEditor
        selection={{ kind: "event", date: event.startDate }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    expect(screen.getByLabelText("Basic reminder")).toBeVisible();
    expect(screen.queryByLabelText("Repeat frequency")).toBeNull();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Weekly revision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.change(screen.getByLabelText("Repeat frequency"), {
      target: { value: "weekly" },
    });
    fireEvent.change(screen.getByLabelText("Basic reminder"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(vi.mocked(runEventOperation).mock.calls[0][0]).toMatchObject({
      method: "POST",
      owner: 1,
      body: {
        revision: 1,
        data: {
          title: "Weekly revision",
          reminders: [15],
          recurrence: { frequency: "weekly", weekdays: [1] },
        },
      },
    });
  });
  it("edits an occurrence by default and explicitly loads the series before changing repeat rules", async () => {
    const series = {
      ...event,
      recurrence: {
        frequency: "weekly" as const,
        interval: 1,
        weekdays: [1],
        until: null,
        count: null,
      },
    };
    vi.mocked(calendarRequest).mockResolvedValue(
      new Response(JSON.stringify({ event: series }))
    );
    render(
      <EventEditor
        selection={{
          kind: "event",
          date: event.startDate,
          item: { ...series, occurrenceDate: event.startDate },
        }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Edit recurring event")).toHaveValue(
      "occurrence"
    );
    expect(screen.queryByLabelText("Repeat frequency")).toBeNull();
    fireEvent.change(screen.getByLabelText("Edit recurring event"), {
      target: { value: "series" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Repeat frequency")).toBeVisible()
    );
    expect(calendarRequest).toHaveBeenCalledWith(
      `/api/calendar/personal?kind=event&id=${event.id}`
    );
  });
  it("groups independently enabled capabilities under Advanced Options without changing event data", () => {
    const onChange = vi.fn();
    render(
      <CalendarSettings
        owner={1}
        settings={defaultCalendarPreferences}
        loaded
        onChange={onChange}
        onClose={vi.fn()}
        onStudySettings={vi.fn()}
      />
    );
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Advanced Options/ }));
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    fireEvent.click(screen.getByRole("switch", { name: /Time planning/ }));
    expect(onChange).toHaveBeenCalledWith({ timePlanning: true });
    expect(runEventOperation).not.toHaveBeenCalled();
  });
  it("retains a failed event operation for exact retry before allowing further edits", async () => {
    vi.mocked(runEventOperation).mockRejectedValueOnce(new Error("Offline"));
    const onSaved = vi.fn();
    render(
      <EventEditor
        selection={{ kind: "event", date: event.startDate, item: event }}
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Moved class" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Offline")
    );
    expect(screen.getByLabelText("Title")).toBeDisabled();
    const first = vi.mocked(runEventOperation).mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(vi.mocked(runEventOperation).mock.calls[1][0]).toEqual(first);
  });
});
describe("accessible timeline interaction", () => {
  it("keeps pointer capture stable while a touch preview crosses date columns, and cancels safely", async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const rect = (left: number, width: number, height: number) => ({
      x: left,
      y: 0,
      left,
      right: left + width,
      top: 0,
      bottom: height,
      width,
      height,
      toJSON() {},
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.timeColumn
          ? rect(
              this.dataset.timeColumn === event.startDate ? 48 : 248,
              200,
              1440
            )
          : rect(0, 448, 660);
      }
    );
    const pointer = (type: string, x: number, y: number) => {
      const value = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(value, {
        pointerId: 17,
        pointerType: "touch",
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      });
      return value;
    };
    const onMove = vi.fn();
    const { container } = render(
      <CalendarTimeline
        dates={[event.startDate, "2026-10-20"]}
        events={[event]}
        sessions={[]}
        timezone="UTC"
        selected={event.startDate}
        busy={false}
        workload={false}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onCreate={vi.fn()}
        onMove={onMove}
        onError={vi.fn()}
      />
    );
    const root =
      container.querySelector("[data-time-column]")!.parentElement!
        .parentElement!;
    fireEvent(
      screen.getByRole("button", { name: "Move Class" }),
      pointer("pointerdown", 110, 540)
    );
    fireEvent(root, pointer("pointermove", 350, 600));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    fireEvent(root, pointer("pointerup", 350, 600));
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0][1].startsAt).toBe("2026-10-20T10:00:00.000Z");
    fireEvent(
      screen.getByRole("button", { name: "Move Class" }),
      pointer("pointerdown", 110, 540)
    );
    fireEvent(root, pointer("pointermove", 350, 650));
    fireEvent(root, pointer("pointercancel", 350, 650));
    expect(onMove).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
  it("provides precise keyboard move and resize alternatives and creation slots", () => {
    const onMove = vi.fn(),
      onCreate = vi.fn();
    render(
      <CalendarTimeline
        dates={[event.startDate]}
        events={[event]}
        sessions={[]}
        timezone="UTC"
        selected={event.startDate}
        busy={false}
        workload
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onCreate={onCreate}
        onMove={onMove}
        onError={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Class" }), {
      key: "ArrowDown",
    });
    expect(onMove.mock.calls[0][1]).toMatchObject({
      startsAt: "2026-10-19T09:15:00.000Z",
      endsAt: "2026-10-19T10:15:00.000Z",
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Class" }), {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(onMove.mock.calls[1][1].endsAt).toBe("2026-10-19T11:00:00.000Z");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create time block 2026-10-19 at 10:30",
      })
    );
    expect(onCreate).toHaveBeenCalledWith(event.startDate, 630);
  });
});
