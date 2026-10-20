import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CalendarReminderAgent from "@/app/calendar/components/CalendarReminderAgent";
import { apiFetch } from "@/lib/api-transport";

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));
vi.mock("@/lib/api-transport", () => ({
  apiFetch: vi.fn(),
  fetchWithTimeout: (
    fetcher: typeof fetch,
    path: string,
    options: RequestInit
  ) => fetcher(path, options),
}));
const reminder = {
  id: "one",
  title: "Class",
  date: "2026-10-20",
  time: "10:00 AM – 11:00 AM",
  minutes: 15,
};
const originalWorker = Object.getOwnPropertyDescriptor(
  navigator,
  "serviceWorker"
);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalWorker)
    Object.defineProperty(navigator, "serviceWorker", originalWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});
describe("calendar reminder capability fallbacks", () => {
  it("shows an in-app reminder without requesting browser permission and supports dismissal", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reminders: [reminder] }))
    );
    const request = vi.fn();
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: request,
    });
    render(<CalendarReminderAgent />);
    expect(
      await screen.findByRole("status", { name: "Calendar reminders" })
    ).toHaveTextContent("Class");
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("uses the existing service worker after device opt-in and does not repeat a claimed reminder on the next poll", async () => {
    localStorage.setItem("sylf_calendar_browser:1", "true");
    vi.stubGlobal("Notification", { permission: "granted" });
    const showNotification = vi.fn(async () => {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          active: true,
          showNotification,
        })),
      },
    });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reminders: [reminder] }))
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ reminders: [] })));
    render(<CalendarReminderAgent />);
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith("Class", {
        body: reminder.time,
        tag: "sylf-calendar-reminders",
        data: { calendarDate: reminder.date },
      })
    );
    const later = Date.now() + 61000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(showNotification).toHaveBeenCalledOnce();
  });
});
