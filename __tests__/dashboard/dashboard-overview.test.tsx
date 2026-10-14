import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { dashboardData } = vi.hoisted(() => ({
  dashboardData: {
    user: { name: "Scholar", level: 4, hunterRank: "E", totalStudyMinutes: 342 },
    isLoading: false,
    quests: [], friends: [], onlineFriends: [], offlineFriends: [],
    briefings: [], insights: [], dismissBriefing: vi.fn(),
    completedToday: 0, totalToday: 1,
    currentXP: 223, xpToNextLevel: 318, expPercent: 70,
    hp: 0, maxHp: 105, hpPercent: 0,
    activeWeeklyQuest: null,
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/hooks/useDashboardData", () => ({ useDashboardData: () => dashboardData }));
vi.mock("@/app/dashboard/components/PixelCompanionCard", () => ({
  PixelCompanionCard: () => <div role="img" aria-label="Your dashboard companion" />,
}));

import { DashboardScreen } from "@/app/dashboard/components/DashboardScreen";

afterEach(() => {
  cleanup();
  dashboardData.hp = 0;
  dashboardData.hpPercent = 0;
  dashboardData.completedToday = 0;
  dashboardData.totalToday = 1;
});

describe("dashboard progression overview", () => {
  it("presents progression and the existing daily metrics together with the companion", () => {
    render(<DashboardScreen />);
    const overview = within(screen.getByRole("region", { name: "Scholar Identity and Progression" }));
    expect(overview.getByRole("img", { name: "Your dashboard companion" })).toBeInTheDocument();
    expect(overview.getByRole("link", { name: "Locker" })).toHaveAttribute("href", "/locker?tab=identity");
    const metrics = within(overview.getByRole("region", { name: "Metrics" }));
    expect(metrics.getByText("4")).toBeInTheDocument();
    expect(metrics.getByText("5h 42m")).toBeInTheDocument();
    expect(metrics.getByText("1 remaining")).toBeInTheDocument();
    expect(overview.getByRole("progressbar", { name: "Experience" })).toHaveAttribute("aria-valuetext", "223 of 318 XP, 70%");
  });

  it.each([0, 100])("exposes %s%% health as a readable meter, including an empty or full rail", (percent) => {
    dashboardData.hpPercent = percent;
    dashboardData.hp = percent === 0 ? 0 : 105;
    render(<DashboardScreen />);
    const health = screen.getByRole("progressbar", { name: "Health" });
    expect(health).toHaveAttribute("aria-valuemin", "0");
    expect(health).toHaveAttribute("aria-valuemax", "100");
    expect(health).toHaveAttribute("aria-valuenow", String(percent));
    expect(health).toHaveAttribute("aria-valuetext", `${dashboardData.hp} of 105 HP, ${percent}%`);
  });

  it.each([
    [0, 0, "No active quotas"],
    [3, 3, "All completed"],
  ])("keeps quota feedback when %s of %s are completed", (completed, total, message) => {
    dashboardData.completedToday = completed;
    dashboardData.totalToday = total;
    render(<DashboardScreen />);
    expect(within(screen.getByRole("region", { name: "Metrics" })).getByText(message)).toBeInTheDocument();
  });
});
