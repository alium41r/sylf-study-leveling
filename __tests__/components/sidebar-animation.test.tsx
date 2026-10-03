import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Sidebar from "@/app/components/Sidebar";

// Mock dependencies
const mockUser = {
  id: 1,
  email: "alium41r@gmail.com",
  username: "ali",
  name: "ali",
  hunterRank: "E",
  level: 4,
  currentXP: 100,
  xpToNextLevel: 500,
  hp: 100,
  maxHp: 100,
  streakDays: 4,
  totalStudyMinutes: 240,
  sylph: 50,
  hasCompletedOnboarding: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  avatarUrl: "https://example.com/avatar.jpg",
  isAdmin: true,
};

const mockLogout = vi.fn();
const mockOpenSettings = vi.fn();
const mockOpenProfile = vi.fn();

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
    refreshStats: vi.fn(),
  }),
}));

vi.mock("@/app/components/SettingsContext", () => ({
  useSettings: () => ({
    openSettings: mockOpenSettings,
  }),
}));

vi.mock("@/app/components/ProfileModalContext", () => ({
  useProfileModal: () => ({
    openProfile: mockOpenProfile,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Mock fetch for notifications
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  } as Response)
);

describe("Sidebar Layout and Animation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders desktop expanded sidebar with correct elements and positions", async () => {
    const setIsCollapsed = vi.fn();
    let container: HTMLElement;
    await act(async () => {
      const rendered = render(
        <Sidebar isCollapsed={false} setIsCollapsed={setIsCollapsed} />
      );
      container = rendered.container;
    });

    // Toggle button
    const collapseBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(collapseBtn).toBeDefined();

    // System Hub button
    const hubBtn = screen.getByRole("button", { name: /system hub/i });
    expect(hubBtn).toBeDefined();

    // Notifications button
    const notifBtn = screen.getByRole("button", { name: /notifications/i });
    expect(notifBtn).toBeDefined();

    // Scholar profile card with name and rank
    expect(screen.getByText("ali")).toBeDefined();
    expect(screen.getByText("E-Rank • Lv. 4")).toBeDefined();

    // Navigation links
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("Timer")).toBeDefined();
    expect(screen.getByText("Social")).toBeDefined();
    expect(screen.getByText("The System")).toBeDefined();
    expect(screen.getByText("Objectives")).toBeDefined();
    expect(screen.getByText("Calendar")).toBeDefined();
    expect(screen.getByText("Locker")).toBeDefined();
    expect(screen.getByText("Shop")).toBeDefined();
    expect(screen.getByText("Studio")).toBeDefined();

    // Logout button
    const logoutBtn = screen.getByRole("button", { name: /logout/i });
    expect(logoutBtn).toBeDefined();

    // Check top container height in expanded mode
    const topContainer = container!.querySelector(".relative.px-\\[3px\\]");
    expect(topContainer).toBeDefined();
    expect((topContainer as HTMLElement).style.height).toBe("112px");
  });

  it("renders desktop collapsed sidebar with sliding coordinate transforms", async () => {
    const setIsCollapsed = vi.fn();
    let container: HTMLElement;
    await act(async () => {
      const rendered = render(
        <Sidebar isCollapsed={true} setIsCollapsed={setIsCollapsed} />
      );
      container = rendered.container;
    });

    // Expand button
    const expandBtn = screen.getByRole("button", { name: /expand sidebar/i });
    expect(expandBtn).toBeDefined();

    // Check top container height in collapsed mode (190px for vertical stack)
    const topContainer = container!.querySelector(".relative.px-\\[3px\\]");
    expect(topContainer).toBeDefined();
    expect((topContainer as HTMLElement).style.height).toBe("190px");

    // System Hub button container should be transformed to (0px, 50px, 0)
    const hubContainer = screen.getByRole("button", { name: /system hub/i }).parentElement;
    expect(hubContainer?.style.transform).toBe("translate3d(0px, 50px, 0)");

    // Profile card button container should be transformed to (0px, 150px, 0) and contracted to 40px
    const profileBtn = screen.getByRole("button", { name: /view profile card/i });
    const profileContainer = profileBtn.parentElement;
    expect(profileContainer?.style.transform).toBe("translate3d(0px, 150px, 0)");
    expect(profileContainer?.style.width).toBe("40px");
    expect(profileContainer?.style.height).toBe("40px");

    // Tooltips should be present in collapsed mode
    expect(screen.getByText("Expand Sidebar")).toBeDefined();
    expect(screen.getByText("System Hub")).toBeDefined();
  });

  it("handles toggling collapse state via the toggle button", async () => {
    const setIsCollapsed = vi.fn();
    await act(async () => {
      render(<Sidebar isCollapsed={false} setIsCollapsed={setIsCollapsed} />);
    });

    const toggleBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    expect(setIsCollapsed).toHaveBeenCalledWith(true);
  });

  it("handles clicking System Hub to open settings", async () => {
    await act(async () => {
      render(<Sidebar isCollapsed={false} setIsCollapsed={vi.fn()} />);
    });

    const hubBtn = screen.getByRole("button", { name: /system hub/i });
    await act(async () => {
      fireEvent.click(hubBtn);
    });
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it("handles clicking Profile card to open profile modal", async () => {
    await act(async () => {
      render(<Sidebar isCollapsed={false} setIsCollapsed={vi.fn()} />);
    });

    const profileBtn = screen.getByRole("button", { name: /view profile card/i });
    await act(async () => {
      fireEvent.click(profileBtn);
    });
    expect(mockOpenProfile).toHaveBeenCalledWith("ali");
  });

  it("handles clicking Logout to trigger logout", async () => {
    await act(async () => {
      render(<Sidebar isCollapsed={false} setIsCollapsed={vi.fn()} />);
    });

    const logoutBtn = screen.getByRole("button", { name: /logout/i });
    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    expect(mockLogout).toHaveBeenCalled();
  });
});
