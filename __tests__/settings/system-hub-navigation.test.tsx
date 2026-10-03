import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SettingsProvider, useSettings } from "@/app/components/SettingsContext";
import BackToSettings from "@/app/components/BackToSettings";
import SettingsPanel from "@/app/components/SettingsPanel";

// Mock AuthProvider
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Test Scholar" },
    logout: vi.fn(),
  }),
}));

// Mock next/navigation
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings/stats",
}));

function TestConsumer() {
  const { isOpen, originRoute, openSettings, closeSettings, clearOriginRoute } = useSettings();
  return (
    <div>
      <span data-testid="is-open">{isOpen ? "open" : "closed"}</span>
      <span data-testid="origin-route">{originRoute || "none"}</span>
      <button onClick={openSettings} data-testid="open-btn">Open</button>
      <button onClick={closeSettings} data-testid="close-btn">Close</button>
      <button onClick={clearOriginRoute} data-testid="clear-btn">Clear</button>
    </div>
  );
}

describe("System Hub Navigation & SettingsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures non-settings originRoute when opening from dashboard", () => {
    // Simulate window.location.pathname = "/dashboard"
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboard" },
      writable: true,
    });

    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );

    expect(screen.getByTestId("is-open").textContent).toBe("closed");
    expect(screen.getByTestId("origin-route").textContent).toBe("none");

    act(() => {
      screen.getByTestId("open-btn").click();
    });

    expect(screen.getByTestId("is-open").textContent).toBe("open");
    expect(screen.getByTestId("origin-route").textContent).toBe("/dashboard");
  });

  it("does NOT wipe originRoute when closeSettings is called", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/tasks" },
      writable: true,
    });

    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );

    act(() => {
      screen.getByTestId("open-btn").click();
    });
    expect(screen.getByTestId("origin-route").textContent).toBe("/tasks");

    // Close settings (as when navigating to a tile)
    act(() => {
      screen.getByTestId("close-btn").click();
    });
    expect(screen.getByTestId("is-open").textContent).toBe("closed");
    // Origin route should still be preserved
    expect(screen.getByTestId("origin-route").textContent).toBe("/tasks");
  });

  it("does NOT overwrite originRoute with /settings/* when reopened on a subpage", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/settings/stats" },
      writable: true,
    });

    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );

    // Opening on /settings/stats without a prior origin should not capture /settings/stats
    act(() => {
      screen.getByTestId("open-btn").click();
    });
    expect(screen.getByTestId("is-open").textContent).toBe("open");
    expect(screen.getByTestId("origin-route").textContent).toBe("none");
  });

  it("clears originRoute only when clearOriginRoute is explicitly called", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboard" },
      writable: true,
    });

    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );

    act(() => {
      screen.getByTestId("open-btn").click();
    });
    expect(screen.getByTestId("origin-route").textContent).toBe("/dashboard");

    act(() => {
      screen.getByTestId("clear-btn").click();
    });
    expect(screen.getByTestId("origin-route").textContent).toBe("none");
  });

  it("BackToSettings immediately opens System Hub and replaces route in background without setTimeout lag", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboard" },
      writable: true,
    });

    render(
      <SettingsProvider>
        <TestConsumer />
        <BackToSettings />
      </SettingsProvider>
    );

    // First open from dashboard to establish origin
    act(() => {
      screen.getByTestId("open-btn").click();
    });
    // Close as if navigated to /settings/stats
    act(() => {
      screen.getByTestId("close-btn").click();
    });

    expect(screen.getByTestId("is-open").textContent).toBe("closed");
    expect(screen.getByTestId("origin-route").textContent).toBe("/dashboard");

    // Click Back to System Hub button
    const backBtn = screen.getByRole("button", { name: /back to system hub/i });
    fireEvent.click(backBtn);

    // Immediately open with 0ms lag
    expect(screen.getByTestId("is-open").textContent).toBe("open");
    // Replaced route in background to originRoute
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("renders balanced Appearance category with Focus Environments wide tile", () => {
    render(
      <SettingsProvider>
        <TestConsumer />
        <SettingsPanel />
      </SettingsProvider>
    );

    // Open System Hub
    act(() => {
      screen.getByTestId("open-btn").click();
    });

    // Verify all 4 categories exist
    expect(screen.getByText("MAIN")).toBeDefined();
    expect(screen.getByText("APPEARANCE")).toBeDefined();
    expect(screen.getAllByText("SYSTEM").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("CONFIG")).toBeDefined();

    // Verify Appearance tiles
    expect(screen.getByText("Appearance")).toBeDefined();
    expect(screen.getByText("Calendar")).toBeDefined();
    const focusEnvBtn = screen.getByText("Focus Environments");
    expect(focusEnvBtn).toBeDefined();

    // Click Focus Environments
    fireEvent.click(focusEnvBtn);
    expect(mockPush).toHaveBeenCalledWith("/settings/focus-backgrounds");
  });
});
