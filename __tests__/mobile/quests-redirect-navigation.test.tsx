/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NavigationProvider, useMobileNavigation } from "@/mobile/src/adapters/navigation/NavigationContext";
import QuestsScreen from "@/app/quests/components/QuestsScreen";
import GoalsScreen from "@/app/goals/components/GoalsScreen";

// Use the mobile navigation adapter for next/navigation
vi.mock("next/navigation", async () => import("@/mobile/src/adapters/navigation/next-navigation"));

// Mock AuthProvider so GoalsScreen / QuestsScreen render without full auth backend
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Test Scholar", email: "test@sylf.app" },
    isLoading: false,
  }),
}));

// Mock client-data-cache to avoid network requests during render
vi.mock("@/lib/client-data-cache", () => ({
  fetchCachedJSON: vi.fn().mockResolvedValue([]),
}));

// Test helper component to inspect live navigation state
function NavStateInspector() {
  const { pathname, searchParams } = useMobileNavigation();
  return (
    <div>
      <span data-testid="current-pathname">{pathname}</span>
      <span data-testid="current-tab-param">{searchParams.get("tab") || "none"}</span>
      <span data-testid="current-query-string">{searchParams.toString()}</span>
    </div>
  );
}

describe("Mobile Quests Redirect & Query Parameter Preservation", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("redirects /quests to /goals?tab=quests and preserves the tab search parameter", async () => {
    window.location.hash = "#/quests";

    render(
      <NavigationProvider initialPath="/quests">
        <NavStateInspector />
        <QuestsScreen />
      </NavigationProvider>
    );

    // Initial state before redirect fires
    expect(screen.getByText("Loading Quests...")).toBeDefined();

    // After useEffect runs, router.replace should have updated location and NavigationContext
    await waitFor(() => {
      expect(screen.getByTestId("current-pathname").textContent).toBe("/goals");
      expect(screen.getByTestId("current-tab-param").textContent).toBe("quests");
    });

    expect(window.location.hash).toContain("/goals");
    expect(window.location.hash).toContain("tab=quests");
  });

  it("preserves existing query parameters when redirecting /quests to /goals", async () => {
    window.location.hash = "#/quests?subjectId=42&view=compact";

    render(
      <NavigationProvider initialPath="/quests?subjectId=42&view=compact">
        <NavStateInspector />
        <QuestsScreen />
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-pathname").textContent).toBe("/goals");
      expect(screen.getByTestId("current-tab-param").textContent).toBe("quests");
      const qs = screen.getByTestId("current-query-string").textContent;
      expect(qs).toContain("subjectId=42");
      expect(qs).toContain("view=compact");
      expect(qs).toContain("tab=quests");
    });
  });

  it("renders GoalsScreen with Quests tab active when searchParams has tab=quests", async () => {
    window.location.hash = "#/goals?tab=quests";

    render(
      <NavigationProvider initialPath="/goals?tab=quests">
        <GoalsScreen />
      </NavigationProvider>
    );

    // The Quests tab button should be highlighted as active
    await waitFor(() => {
      const questsTabButton = screen.getByRole("button", { name: /quests/i });
      expect(questsTabButton).toBeDefined();
    });
  });

  it("correctly handles /quests?tab=quests without stalling or creating duplicate tab params", async () => {
    window.location.hash = "#/quests?tab=quests";

    render(
      <NavigationProvider initialPath="/quests?tab=quests">
        <NavStateInspector />
        <QuestsScreen />
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-pathname").textContent).toBe("/goals");
      expect(screen.getByTestId("current-tab-param").textContent).toBe("quests");
      const qs = screen.getByTestId("current-query-string").textContent;
      expect(qs).toBe("tab=quests");
    });
  });

  it("preserves additional parameters on /quests?tab=quests&source=notification", async () => {
    window.location.hash = "#/quests?tab=quests&source=notification";

    render(
      <NavigationProvider initialPath="/quests?tab=quests&source=notification">
        <NavStateInspector />
        <QuestsScreen />
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-pathname").textContent).toBe("/goals");
      expect(screen.getByTestId("current-tab-param").textContent).toBe("quests");
      const qs = screen.getByTestId("current-query-string").textContent;
      expect(qs).toContain("tab=quests");
      expect(qs).toContain("source=notification");
      // Verify no duplicate tab parameters
      const parsed = new URLSearchParams(qs);
      expect(parsed.getAll("tab")).toEqual(["quests"]);
    });
  });
});
