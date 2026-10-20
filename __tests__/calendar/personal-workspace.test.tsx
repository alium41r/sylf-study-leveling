import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CalendarWorkspace from "@/app/calendar/components/CalendarWorkspace";
import CalendarEditor from "@/app/calendar/components/CalendarEditor";
import {
  calendarRequest,
  useCalendarWorkspace,
} from "@/app/calendar/components/useCalendarWorkspace";
import { TimezoneService } from "@/lib/timezone-service";
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, timezone: "Asia/Karachi" },
    refreshStats: vi.fn(),
  }),
}));
vi.mock("@/app/calendar/components/useCalendarWorkspace", () => ({
  calendarRequest: vi.fn(),
  useCalendarWorkspace: vi.fn(),
}));
const day = {
  date: "2026-10-18",
  dayOfWeek: 0,
  isRestDay: false,
  dailyGoalMinutes: 120,
  totalMinutes: 45,
  totalSeconds: 2700,
  sessionsCount: 1,
  completionPercentage: 38,
  goalMet: false,
  questsCount: 1,
  questsCompleted: 0,
  xpGained: 20,
  subjectBreakdown: [],
  quests: [
    {
      id: 1,
      title: "Study physics",
      description: "Review chapter three",
      status: "PENDING",
      difficulty: "NORMAL",
      requiredMinutes: 30,
      elapsedSeconds: 0,
      xpReward: 10,
      sylphReward: 2,
      goal: { id: 1, title: "Final exam", color: "BLUE" },
    },
  ],
};
const fixture: ReturnType<typeof useCalendarWorkspace> = {
  days: new Map([[day.date, day]]),
  milestones: [
    {
      id: 1,
      title: "Final exam",
      color: "BLUE",
      date: day.date,
      targetDate: "2026-10-18T00:00:00Z",
    },
  ],
  floating: new Set<string>(),
  loading: false,
  errors: [],
  study: [],
  reload: vi.fn(),
  personal: {
    events: [
      {
        id: "event",
        title: "Meet Anna",
        description: "Bring notes",
        color: "BLUE",
        allDay: false,
        startDate: day.date,
        endDate: day.date,
        startsAt: "2026-10-18T09:00:00.000Z",
        endsAt: "2026-10-18T10:00:00.000Z",
        timezone: "Asia/Karachi",
        revision: 1,
        createdAt: "",
        updatedAt: "",
      },
    ],
    notes: ["First thought", "Second thought"].map((title, index) => ({
      id: String(index),
      dateKey: day.date,
      title,
      document: { version: 1, text: "Remember this" },
      revision: 1,
      createdAt: "",
      updatedAt: "",
    })),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(TimezoneService, "getUserLocalDate").mockReturnValue(day.date);
  vi.mocked(useCalendarWorkspace).mockReturnValue(fixture);
  vi.mocked(calendarRequest).mockResolvedValue(
    new Response("{}", { status: 200 })
  );
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
});
afterEach(() => vi.restoreAllMocks());
describe("personal calendar workspace", () => {
  it("keeps quests, deadlines, events and multiple notes visible across all views", () => {
    render(<CalendarWorkspace />);
    expect(
      screen.getByRole("region", { name: "Month calendar" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Study physics/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Final exam.*Goal deadline/ })
    ).toBeInTheDocument();
    for (const view of ["Week", "Day", "Month"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.getAllByText("Meet Anna").length).toBeGreaterThan(0);
      expect(screen.getAllByText("First thought").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Second thought").length).toBeGreaterThan(0);
    }
    // Shared month range stays identical across view switches.
    const calls = vi.mocked(useCalendarWorkspace).mock.calls;
    expect(new Set(calls.map((call) => call[1].join(","))).size).toBe(1);
  });
  it("selects a date with arrow keys and supports date jumps and Today", () => {
    render(<CalendarWorkspace />);
    const today = document.querySelector<HTMLButtonElement>(
      '[data-calendar-date="2026-10-18"]'
    )!;
    fireEvent.keyDown(today, { key: "ArrowRight" });
    expect(
      document.querySelector('[data-calendar-date="2026-10-19"]')
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Go to date"), {
      target: { value: "2027-01-01" },
    });
    expect(
      screen.getByRole("heading", { name: "January 2027" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(
      screen.getByRole("heading", { name: "October 2026" })
    ).toBeInTheDocument();
  });
});
describe("calendar notebook", () => {
  it("opens an accessible autosaving notebook for existing typed content", () => {
    render(
      <CalendarEditor
        selection={{
          kind: "note",
          date: day.date,
          item: fixture.personal.notes[0],
        }}
        timezone="Asia/Karachi"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", { name: "Daily notebook" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Typed note" })).toHaveValue(
      "Remember this"
    );
    expect(screen.getByRole("button", { name: "Pen" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Finger drawing" })
    ).toHaveAttribute("aria-pressed", "false");
  });
  it("refreshes the personal projection after deleting a notebook", async () => {
    const refresh = vi.fn();
    window.addEventListener("calendar-content-updated", refresh);
    const onClose = vi.fn();
    render(
      <CalendarEditor
        selection={{
          kind: "note",
          date: day.date,
          item: fixture.personal.notes[1],
        }}
        timezone="Asia/Karachi"
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete" })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalledOnce();
    expect(calendarRequest).toHaveBeenCalledWith(
      "/api/calendar/personal",
      expect.objectContaining({ method: "DELETE" })
    );
    window.removeEventListener("calendar-content-updated", refresh);
  });
});
