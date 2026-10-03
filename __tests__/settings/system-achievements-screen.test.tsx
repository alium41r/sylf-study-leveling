import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AchievementsSettingsScreen } from "@/app/settings/achievements/components/AchievementsSettingsScreen";
import {
  ACHIEVEMENTS_CATALOG,
  type EnrichedAchievement,
} from "@/lib/achievements-catalog";

const auth = vi.hoisted(() => ({
  mutateUser: vi.fn(),
  user: { id: 1, level: 9, characterConfig: { outfit: "form_deadpool" } },
}));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/app/components/BackToSettings", () => ({
  default: () => <button>Back to System Hub</button>,
}));
vi.mock("@/lib/client-data-cache", () => ({ invalidateClientCaches: vi.fn() }));

const milestone = (
  id: string,
  currentProgress: number,
  isClaimed = false
): EnrichedAchievement => ({
  ...ACHIEVEMENTS_CATALOG.find((entry) => entry.id === id)!,
  currentProgress,
  isClaimed,
});
const response = (achievements: EnrichedAchievement[]) =>
  new Response(JSON.stringify({ achievements, retiredClaimedCount: 0 }));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Milestone register interactions", () => {
  it("refreshes eligibility after an XP claim and preserves the user's character configuration", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response([milestone("study_first_session", 1), milestone("rank_d", 9)])
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            user: { id: 1, level: 10, hunterRank: "D" },
          })
        )
      )
      .mockResolvedValueOnce(
        response([
          milestone("study_first_session", 1, true),
          milestone("rank_d", 10),
        ])
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AchievementsSettingsScreen />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Claim First Session" })
    );
    await screen.findByRole("button", { name: "Claim Reach D-Rank" });
    expect(
      screen.queryByRole("button", { name: "Claim First Session" })
    ).not.toBeInTheDocument();
    expect(auth.mutateUser).toHaveBeenCalledWith({
      ...auth.user,
      level: 10,
      hunterRank: "D",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/achievements", {
      cache: "no-store",
    });
    expect(
      screen.getByRole("region", { name: "Milestone register" })
    ).toHaveAttribute("tabindex", "0");
    expect(
      screen.queryByRole("navigation", { name: "System library" })
    ).not.toBeInTheDocument();
  });

  it("filters milestones and resets the right pane when changing category", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            milestone("study_first_session", 1),
            milestone("rank_d", 9),
          ])
        )
    );
    render(<AchievementsSettingsScreen />);
    await screen.findByRole("heading", { name: "First Session" });
    const pane = screen.getByRole("region", { name: "Milestone register" });
    pane.scrollTop = 250;
    const index = screen.getByRole("complementary", {
      name: "Achievement index",
    });
    fireEvent.click(within(index).getByRole("button", { name: /Rank/ }));
    expect(pane.scrollTop).toBe(0);
    expect(
      screen.queryByRole("heading", { name: "First Session" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reach D-Rank" })).toBeVisible();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search achievements" }),
      { target: { value: "missing" } }
    );
    expect(
      screen.getByRole("heading", { name: "No matching milestones" })
    ).toBeVisible();
  });

  it("allows a failed register to be retried without treating it as zero progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("unavailable", { status: 500 }))
        .mockResolvedValueOnce(response([milestone("study_first_session", 1)]))
    );
    render(<AchievementsSettingsScreen />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded")
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload register" }));
    await screen.findByRole("button", { name: "Claim First Session" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
