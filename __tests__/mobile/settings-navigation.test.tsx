/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NavigationProvider } from "@/mobile/src/adapters/navigation/NavigationContext";
import { MobileRouteOutlet } from "@/mobile/src/components/MobileRouteOutlet";
import { SettingsProvider, useSettings } from "@/app/components/SettingsContext";
import {
  MOCK_STUDENT_USER,
  setupMockApiInterception,
  resetMockApiInterception,
} from "@/mobile/src/adapters/api/mock-api";
import {
  getAccountCapability,
  setAccountCapability,
} from "@/app/settings/account/services/account-capability";
import {
  MockAccountCapability,
  PreAuthMobileAccountCapability,
} from "@/mobile/src/adapters/account/mobile-account-capability";

// Use mobile navigation adapter for next/navigation
vi.mock("next/navigation", async () => import("@/mobile/src/adapters/navigation/next-navigation"));

// Mock AuthProvider so screens render without full Next.js auth backend
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      name: "Sung Jin-Woo",
      username: "hunter_jinwoo",
      email: "scholar@sylf.app",
      hunterRank: "S",
      level: 42,
      currentXP: 4500,
      xpToNextLevel: 6000,
      hp: 95,
      maxHp: 100,
      streakDays: 14,
      totalStudyMinutes: 2840,
      totalStudySeconds: 170400,
      sylph: 1250,
      characterConfig: {
        skinColor: "fair",
        hairStyle: "messy",
        hairColor: "black",
        eyeColor: "blue",
        expression: "calm",
        outfit: "uniform",
        outfitColor: "dark",
        aura: "aura_monarch",
        pedestal: "pedestal_obsidian",
        gender: "male",
      },
    },
    isLoading: false,
    mutateUser: vi.fn(),
  }),
}));

describe("Phase 1D-G: Canonical Settings & System Hub Family Navigation", () => {
  beforeAll(async () => {
    // Pre-warm lazy imports so worker thread dynamic loading is immediate during full suite runs
    await Promise.all([
      import("@/app/settings/themes/components/ThemesSettingsScreen"),
      import("@/app/settings/backgrounds/components/BackgroundsSettingsScreen"),
      import("@/app/settings/notifications/components/NotificationsSettingsScreen"),
      import("@/app/settings/modes/components/ModesSettingsScreen"),
      import("@/app/settings/calendar/components/CalendarSettingsScreen"),
      import("@/app/settings/account/components/AccountSettingsScreen"),
    ]);
  });

  beforeEach(() => {
    window.location.hash = "";
    setupMockApiInterception(true);
  });

  afterEach(() => {
    resetMockApiInterception();
    vi.restoreAllMocks();
  });

  it("renders AppearanceSettingsScreen when navigating to /settings/appearance", async () => {
    window.location.hash = "#/settings/appearance";

    render(
      <NavigationProvider initialPath="/settings/appearance">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Appearance", level: 1 })).toBeDefined();
      expect(screen.getByText("App mode")).toBeDefined();
      expect(screen.getByText("Accent Color")).toBeDefined();
      expect(screen.getByText("Background Color")).toBeDefined();
      expect(screen.getByText(/Back to System Hub/i)).toBeDefined();
    }, { timeout: 8000 });
  });

  it("renders AppearanceSettingsScreen when navigating to legacy /settings/themes", async () => {
    window.location.hash = "#/settings/themes";

    render(
      <NavigationProvider initialPath="/settings/themes">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Appearance", level: 1 })).toBeDefined();
      expect(screen.getByText("App mode")).toBeDefined();
      expect(screen.getByText("Accent Color")).toBeDefined();
      expect(screen.getByText("Background Color")).toBeDefined();
      expect(screen.getByText(/Back to System Hub/i)).toBeDefined();
    }, { timeout: 8000 });
  });

  it("renders AppearanceSettingsScreen when navigating to legacy /settings/backgrounds", async () => {
    window.location.hash = "#/settings/backgrounds";

    render(
      <NavigationProvider initialPath="/settings/backgrounds">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Appearance", level: 1 })).toBeDefined();
      expect(screen.getByText("App mode")).toBeDefined();
      expect(screen.getByText("Accent Color")).toBeDefined();
      expect(screen.getByText("Background Color")).toBeDefined();
      expect(screen.getByText(/Back to System Hub/i)).toBeDefined();
    }, { timeout: 8000 });
  });

  it("renders NotificationsSettingsScreen when navigating to /settings/notifications", async () => {
    window.location.hash = "#/settings/notifications";

    render(
      <NavigationProvider initialPath="/settings/notifications">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Alerts & Notifications")).toBeDefined();
      expect(screen.getByText("Master System Alerts")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("renders ModesSettingsScreen when navigating to /settings/modes", async () => {
    window.location.hash = "#/settings/modes";

    render(
      <NavigationProvider initialPath="/settings/modes">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Modes", level: 1 })).toBeDefined();
      expect(screen.getByText("Free Flow")).toBeDefined();
      expect(screen.getByRole("region", { name: "Pomodoro settings" })).toBeDefined();
    }, { timeout: 3000 });
  });

  it("renders CalendarSettingsScreen when navigating to /settings/calendar", async () => {
    window.location.hash = "#/settings/calendar";

    render(
      <NavigationProvider initialPath="/settings/calendar">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Calendar Customization").length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("renders Backdrops at the existing focus-backgrounds route", async () => {
    window.location.hash = "#/settings/focus-backgrounds";
    render(
      <NavigationProvider initialPath="/settings/focus-backgrounds">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Backdrops", level: 1 })).toBeDefined();
      expect(screen.getByRole("navigation", { name: "System Hub Appearance" })).toBeDefined();
    }, { timeout: 3000 });
  });

  it("renders AccountSettingsScreen when navigating to /settings/account", async () => {
    window.location.hash = "#/settings/account";

    render(
      <NavigationProvider initialPath="/settings/account">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeDefined();
      expect(screen.getByText("Account Information")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("triggers openSettings() and replaces route when navigating to /settings root", async () => {
    window.location.hash = "#/settings";

    let settingsOpened = false;

    function TestSettingsInspector() {
      const { isOpen } = useSettings();
      settingsOpened = isOpen;
      return <span data-testid="settings-open-state">{isOpen ? "OPEN" : "CLOSED"}</span>;
    }

    render(
      <NavigationProvider initialPath="/settings">
        <SettingsProvider>
          <TestSettingsInspector />
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(settingsOpened).toBe(true);
    }, { timeout: 3000 });
  });

  it("redirects /settings/profile to /locker?tab=identity", async () => {
    window.location.hash = "#/settings/profile";

    render(
      <NavigationProvider initialPath="/settings/profile">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(window.location.hash).toBe("#/locker?tab=identity");
    }, { timeout: 3000 });
  });

  it("redirects /settings/badges to /settings", async () => {
    window.location.hash = "#/settings/badges";

    render(
      <NavigationProvider initialPath="/settings/badges">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(["#/settings", "#/dashboard"]).toContain(window.location.hash);
    }, { timeout: 3000 });
  });

  it("redirects /settings/sync to /settings/account", async () => {
    window.location.hash = "#/settings/sync";

    render(
      <NavigationProvider initialPath="/settings/sync">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(window.location.hash).toBe("#/settings/account");
    }, { timeout: 3000 });
  });

  it("intercepts deferred /settings/logout with Phase 2 Mobile Auth placeholder", async () => {
    window.location.hash = "#/settings/logout";

    render(
      <NavigationProvider initialPath="/settings/logout">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Logout Sub-Route")).toBeDefined();
      expect(
        screen.getByText(/deferred to Phase 2 Mobile Auth/i)
      ).toBeDefined();
    }, { timeout: 3000 });
  });

  it("intercepts unknown /settings/* subroute with Phase 1D Deferred Dynamic Route placeholder", async () => {
    window.location.hash = "#/settings/unrecognized-subroute";

    render(
      <NavigationProvider initialPath="/settings/unrecognized-subroute">
        <SettingsProvider>
          <MobileRouteOutlet />
        </SettingsProvider>
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Settings Sub-Route")).toBeDefined();
      expect(
        screen.getByText(/deferred to Phase 1D Deferred Dynamic Route/i)
      ).toBeDefined();
    }, { timeout: 3000 });
  });

  describe("Security Boundary & Capability Behavior", () => {
    it("executes safe deterministic mutations under MockAccountCapability", async () => {
      const mockCap = new MockAccountCapability();
      setAccountCapability(mockCap);

      const updateRes = await getAccountCapability().updateAccount({ name: "Updated Name" });
      expect(updateRes.ok).toBe(true);

      const passRes = await getAccountCapability().changePassword({
        currentPassword: "old",
        newPassword: "new",
        confirmPassword: "new",
      });
      expect(passRes.ok).toBe(true);

      const codeRes = await getAccountCapability().sendSecurityCode("DELETE_ACCOUNT");
      expect(codeRes.ok).toBe(true);

      const deleteRes = await getAccountCapability().deleteAccount({
        code: "123456",
      });
      expect(deleteRes.ok).toBe(true);
    });

    it("fails closed on normal mobile builds under PreAuthMobileAccountCapability", async () => {
      const preAuthCap = new PreAuthMobileAccountCapability();
      setAccountCapability(preAuthCap);

      const updateRes = await getAccountCapability().updateAccount({ name: "Hacker" });
      expect(updateRes.ok).toBe(false);
      expect(updateRes.error).toMatch(/Phase 2/i);

      const passRes = await getAccountCapability().changePassword({
        currentPassword: "a",
        newPassword: "b",
        confirmPassword: "b",
      });
      expect(passRes.ok).toBe(false);
      expect(passRes.error).toMatch(/Phase 2/i);

      const deleteRes = await getAccountCapability().deleteAccount({ code: "123456" });
      expect(deleteRes.ok).toBe(false);
      expect(deleteRes.error).toMatch(/Phase 2/i);

      const resetRes = await getAccountCapability().resetProgress({ code: "123456" });
      expect(resetRes.ok).toBe(false);
      expect(resetRes.error).toMatch(/Phase 2/i);

      const revokeRes = await getAccountCapability().revokeSession("session_1");
      expect(revokeRes.ok).toBe(false);
      expect(revokeRes.error).toMatch(/Phase 2/i);
    });

    it("automatically resolves PreAuthMobileAccountCapability on normal mobile runtime and performs ZERO network requests", async () => {
      // Clear manual override
      setAccountCapability(null);
      (window as unknown as { __SYLF_MOBILE_PLATFORM__?: boolean }).__SYLF_MOBILE_PLATFORM__ = true;
      (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = false;

      const fetchSpy = vi.spyOn(window, "fetch");

      const cap = getAccountCapability();
      expect(cap).toBeInstanceOf(PreAuthMobileAccountCapability);

      // Verify destructive operations fail closed locally
      const changePass = await cap.changePassword({
        currentPassword: "any",
        newPassword: "any",
        confirmPassword: "any",
      });
      expect(changePass.ok).toBe(false);
      expect(changePass.error).toMatch(/Phase 2/i);

      const del = await cap.deleteAccount({ code: "123" });
      expect(del.ok).toBe(false);
      expect(del.error).toMatch(/Phase 2/i);

      const reset = await cap.resetProgress({ code: "123" });
      expect(reset.ok).toBe(false);
      expect(reset.error).toMatch(/Phase 2/i);

      const revoke = await cap.revokeSession("s1");
      expect(revoke.ok).toBe(false);
      expect(revoke.error).toMatch(/Phase 2/i);

      const disc = await cap.disconnectProvider("google");
      expect(disc.ok).toBe(false);
      expect(disc.error).toMatch(/Phase 2/i);

      const logout = await cap.logoutAllDevices("pass");
      expect(logout.ok).toBe(false);
      expect(logout.error).toMatch(/Phase 2/i);

      // PROOF: ZERO network requests were attempted
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("automatically resolves MockAccountCapability on mobile mock runtime", async () => {
      setAccountCapability(null);
      (window as unknown as { __SYLF_MOBILE_PLATFORM__?: boolean }).__SYLF_MOBILE_PLATFORM__ = true;
      (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = true;

      const cap = getAccountCapability();
      expect(cap).toBeInstanceOf(MockAccountCapability);

      const res = await cap.changePassword({
        currentPassword: "old",
        newPassword: "new",
        confirmPassword: "new",
      });
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/Mock/i);
    });

    it("automatically resolves WebProductionAccountCapability on web runtime", async () => {
      setAccountCapability(null);
      delete (window as unknown as { __SYLF_MOBILE_PLATFORM__?: boolean }).__SYLF_MOBILE_PLATFORM__;
      delete (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__;

      const cap = getAccountCapability();
      expect(cap.constructor.name).toBe("WebProductionAccountCapability");
    });
  });
});
