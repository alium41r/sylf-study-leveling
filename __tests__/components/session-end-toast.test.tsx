/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SessionEndToast, {
  SESSION_ENDED_EVENT,
  SESSION_SUMMARY_KEY,
} from "@/app/components/SessionEndToast";

vi.mock("framer-motion", async () => {
  const actual = (await vi.importActual("framer-motion")) as any;
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe("SessionEndToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when there is no ended session", () => {
    const { container } = render(<SessionEndToast />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when SESSION_ENDED_EVENT is dispatched and is properly centered", () => {
    const { container } = render(<SessionEndToast />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SESSION_ENDED_EVENT, {
          detail: {
            durationSeconds: 125,
            subjectName: "maths",
            questTitle: null,
          },
        })
      );
    });

    expect(screen.getByText("Focus Session Complete")).toBeDefined();
    expect(screen.getByText(/2m 05s/)).toBeDefined();
    expect(screen.getByText(/maths/)).toBeDefined();

    // The toast container must use left-1/2 and NOT -translate-x-1/2,
    // as topToastVariants handles the horizontal centering via x: '-50%'.
    const toastWrapper = container.querySelector(".fixed");
    expect(toastWrapper).not.toBeNull();
    expect(toastWrapper?.classList.contains("left-1/2")).toBe(true);
    expect(toastWrapper?.classList.contains("-translate-x-1/2")).toBe(false);
  });

  it("loads summary from localStorage on mount and clears the key", () => {
    localStorage.setItem(
      SESSION_SUMMARY_KEY,
      JSON.stringify({
        durationSeconds: 3600,
        subjectName: "Physics",
        questTitle: "Chapter 1",
      })
    );

    render(<SessionEndToast />);

    expect(screen.getByText(/1h 00m 00s/)).toBeDefined();
    expect(screen.getByText(/Physics/)).toBeDefined();
    expect(screen.getByText(/Chapter 1/)).toBeDefined();
    expect(localStorage.getItem(SESSION_SUMMARY_KEY)).toBeNull();
  });

  it("auto dismisses after timeout", () => {
    render(<SessionEndToast />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SESSION_ENDED_EVENT, {
          detail: {
            durationSeconds: 60,
            subjectName: "Chemistry",
            questTitle: null,
          },
        })
      );
    });

    expect(screen.getByText("Focus Session Complete")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(3500);
      vi.runAllTimers();
    });

    expect(screen.queryByText("Focus Session Complete")).toBeNull();
  });
});
