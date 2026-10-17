import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StatsSettingsScreen } from "@/app/settings/stats/components/StatsSettingsScreen";
import { RankingsSettingsScreen } from "@/app/settings/rankings/components/RankingsSettingsScreen";
import { ModesSettingsScreen } from "@/app/settings/modes/components/ModesSettingsScreen";
import { CognitiveAttributes } from "@/app/settings/stats/components/CognitiveAttributes";
import { COGNITIVE_STAT_KEYS, getAbilitySummary } from "@/lib/cognitive-stats";

const mocks = vi.hoisted(() => ({
  cached: vi.fn(),
  refreshStats: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, timezone: "Asia/Karachi" },
    isLoading: false,
    refreshStats: mocks.refreshStats,
  }),
}));
vi.mock("@/app/components/BackToSettings", () => ({
  default: () => <button>Back to System Hub</button>,
}));
vi.mock("@/lib/client-data-cache", () => ({
  fetchCachedJSON: mocks.cached,
  invalidateClientCaches: mocks.invalidate,
}));

function stats() {
  return {
    user: {
      name: "Scholar",
      username: "scholar",
      hunterRank: "D",
      level: 12,
      currentXP: 50,
      xpToNextLevel: 200,
      hp: 100,
      maxHp: 100,
      streakDays: 3,
      totalStudyMinutes: 0,
      totalStudySeconds: 15,
      createdAt: "2026-01-01",
    },
    todayDate: "2026-10-16",
    dailyStudy: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 17 + i)).toISOString().slice(0, 10),
      minutes: i === 29 ? 0.3 : 0,
    })),
    subjectBreakdown: [
      { name: "Physics", color: "#00aabb", minutes: 0.3, sessions: 1 },
    ],
    sessionLog: Array.from({ length: 18 }, (_, i) => ({
      id: i,
      startedAt: "2026-10-16T00:15:00Z",
      endedAt: "2026-10-16T00:15:15Z",
      durationMinutes: 0,
      durationSeconds: 15,
      breakSeconds: 3,
      focusRate: 83,
      subjectName: "Physics",
      subjectColor: "#00aabb",
      questTitle: `Review ${i + 1}`,
    })),
    questStats: {
      total: 4,
      completed: 2,
      failed: 1,
      pending: 1,
      inProgress: 0,
      totalXPEarned: 80,
    },
    goalStats: { total: 3, active: 2, completed: 1 },
    summary: {
      totalSessions: 18,
      avgSessionMinutes: 0,
      avgSessionSeconds: 15,
      activeDaysLast30: 1,
      longestSession: 0,
      longestSessionSeconds: 15,
      accountAgeDays: 200,
      completionRate: 50,
    },
  };
}
function ranked(id: number, rank: number, self = false, friendRank?: number) {
  return {
    id,
    username: `scholar${id}`,
    name: `Scholar ${id}`,
    hunterRank: "D",
    level: 12,
    totalStudyMinutes: 90,
    studyHours: 1.5,
    streakDays: 3,
    questsCompleted: 10,
    isCurrentUser: self,
    rank,
    friendRank,
  };
}
function rankings() {
  return {
    global: [ranked(2, 1), ranked(3, 2), ranked(1, 3, true)],
    friends: [ranked(3, 2, false, 1), ranked(1, 3, true, 2)],
    currentUserRank: 3,
    totalPlayers: 10,
  };
}
function saved() {
  return JSON.parse(localStorage.getItem("study_mode_config")!);
}
function choose(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("region", { name: "Choose a study mode" })
    ).getByRole("button", { name: new RegExp(name) })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stats study insights", () => {
  it("preserves sub-minute accuracy, chart periods, session history, break time, and progression", async () => {
    mocks.cached.mockResolvedValue(stats());
    render(<StatsSettingsScreen />);
    await screen.findByRole("heading", { name: "Study rhythm" });
    expect(screen.getAllByText("15s").length).toBeGreaterThan(1);
    expect(screen.getByText("3 weeks")).toBeVisible();
    expect(
      screen.getByRole("meter", { name: "Level experience" })
    ).toHaveAttribute("aria-valuenow", "25");
    const chart = screen.getByLabelText("Daily study time");
    expect(within(chart).getAllByRole("button")).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(within(chart).getAllByRole("button")).toHaveLength(7);
    expect(screen.getByText("Focus time · last 7 days")).toBeVisible();
    fireEvent.focus(within(chart).getAllByRole("button")[0]);
    expect(within(chart).getAllByRole("button")[0]).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.keyDown(within(chart).getAllByRole("button")[0], {
      key: "ArrowRight",
    });
    expect(within(chart).getAllByRole("button")[1]).toHaveFocus();
    fireEvent.keyDown(within(chart).getAllByRole("button")[1], { key: "End" });
    expect(within(chart).getAllByRole("button")[6]).toHaveFocus();
    const history = within(
      screen.getByRole("region", { name: "Session history" })
    );
    expect(history.getAllByText(/Review \d/)).toHaveLength(6);
    expect(history.getAllByText("3s break")).toHaveLength(6);
    expect(history.getAllByText("83% focus rate")).toHaveLength(6);
    expect(history.getAllByText("05:15 AM")).toHaveLength(6);
    fireEvent.click(history.getByRole("button", { name: "Show more" }));
    expect(history.getAllByText(/Review \d/)).toHaveLength(16);
    fireEvent.click(
      history.getByRole("button", { name: "View all 18 sessions" })
    );
    expect(history.getAllByText(/Review \d/)).toHaveLength(18);
    expect(
      screen.getByRole("meter", { name: "Quest completion" })
    ).toHaveAttribute("aria-valuenow", "50");
  });
  it("shows honest empty insights and recovers from a failed request", async () => {
    const empty = stats();
    empty.dailyStudy.forEach((day) => {
      day.minutes = 0;
    });
    empty.subjectBreakdown = [];
    empty.sessionLog = [];
    mocks.cached.mockResolvedValueOnce(null).mockResolvedValue(empty);
    render(<StatsSettingsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("No subject focus yet.");
    expect(
      screen.getByText("Your first focus session starts your story.")
    ).toBeVisible();
    expect(screen.queryByText(/% more focus/)).not.toBeInTheDocument();
    expect(mocks.cached.mock.calls.at(-1)?.[2]).toMatchObject({
      forceFresh: true,
    });
  });
});

describe("Rankings scope and ordering", () => {
  it("uses friend positions for both the standing and ladder and retains weekly units", async () => {
    mocks.cached.mockResolvedValue(rankings());
    render(<RankingsSettingsScreen />);
    const standing = within(
      await screen.findByRole("complementary", { name: "Your standing" })
    );
    expect(standing.getByText("Top 30%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(standing.getByText("Top 100%")).toBeVisible();
    expect(standing.getByText(/of 2 scholars/)).toBeVisible();
    const row = screen.getByRole("row", { name: /Scholar 1/ });
    expect(within(row).getByRole("cell", { name: "02" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Rank by" }), {
      target: { value: "streak" },
    });
    await screen.findByRole("complementary", { name: "Your standing" });
    expect(mocks.cached.mock.calls.at(-1)?.[0]).toBe(
      "/api/user/rankings?sortBy=streak"
    );
    expect(
      within(screen.getByRole("table")).getAllByText("3 weeks")
    ).toHaveLength(2);
  });
  it("does not show a stale response after quickly changing the ranking metric", async () => {
    let finishOld!: (data: ReturnType<typeof rankings>) => void;
    mocks.cached
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        })
      )
      .mockResolvedValue(rankings());
    render(<RankingsSettingsScreen />);
    fireEvent.change(screen.getByRole("combobox", { name: "Rank by" }), {
      target: { value: "studyHours" },
    });
    await screen.findByRole("table");
    await act(async () => {
      finishOld({ ...rankings(), currentUserRank: 9 });
    });
    expect(screen.getByText("of 10 scholars · focus hours")).toBeVisible();
    expect(screen.getByText("Top 30%")).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByText("1.5h")).toHaveLength(
      3
    );
  });
  it("keeps a scholar outside the top 50 visible and offers friends when alone", async () => {
    mocks.cached.mockResolvedValue({
      ...rankings(),
      global: [ranked(2, 1)],
      friends: [ranked(1, 81, true, 1)],
      currentUserRank: 81,
      totalPlayers: 164,
    });
    render(<RankingsSettingsScreen />);
    await screen.findByText("of 164 scholars · level");
    expect(screen.getByText("Top 50%")).toBeVisible();
    expect(
      within(
        screen.getByRole("complementary", { name: "Your standing" })
      ).getByText("Lv. 12")
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByText("Better with a study circle")).toBeVisible();
    expect(screen.getByRole("link", { name: "Find friends" })).toHaveAttribute(
      "href",
      "/social"
    );
  });
  it("retries network errors and never invents a percentile for an unranked account", async () => {
    mocks.cached.mockResolvedValueOnce(null).mockResolvedValue({
      global: [],
      friends: [],
      currentUserRank: 0,
      totalPlayers: 0,
    });
    render(<RankingsSettingsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Your place is still taking shape");
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
    expect(screen.getByText("A new ladder is taking shape")).toBeVisible();
  });
});

describe("Modes timer configuration", () => {
  it("preserves all timer settings, persists edits, and activates only on request", () => {
    const view = render(<ModesSettingsScreen />);
    choose("Sprint Mode");
    expect(localStorage.getItem("study_mode_config")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "Sprint Duration" }), {
      target: { value: "13" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "Auto-trigger Next Sprint" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Extreme" }));
    let config = saved();
    expect(
      config.modes.find((mode: { isActive: boolean }) => mode.isActive).id
    ).toBe("pomodoro");
    expect(
      config.modes.find((mode: { id: string }) => mode.id === "sprint").settings
    ).toEqual(
      expect.arrayContaining([
        { key: "sprintDuration", value: 13 },
        { key: "autoStartSprints", value: true },
        { key: "intensity", value: "Extreme" },
      ])
    );
    expect(screen.getAllByText("13m focus · 2m break")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Use Sprint Mode" }));
    config = saved();
    expect(
      config.modes.filter((mode: { isActive: boolean }) => mode.isActive)
    ).toHaveLength(1);
    expect(
      config.modes.find((mode: { isActive: boolean }) => mode.isActive).id
    ).toBe("sprint");
    expect(config.modes).toHaveLength(7);
    view.unmount();
    render(<ModesSettingsScreen />);
    expect(
      screen.getByRole("region", { name: "Sprint Mode settings" })
    ).toBeVisible();
    expect(screen.getByRole("slider", { name: "Sprint Duration" })).toHaveValue(
      "13"
    );
    expect(screen.getByRole("button", { name: "Current mode" })).toBeDisabled();
  });
  it("restores legacy configurations safely and keeps Free Flow free of hidden settings", () => {
    localStorage.setItem(
      "study_mode_config",
      JSON.stringify({
        modes: [
          {
            id: "deepwork",
            isActive: true,
            settings: [
              { key: "sessionLength", value: 900 },
              { key: "autoFullscreen", value: "false" },
            ],
          },
        ],
      })
    );
    render(<ModesSettingsScreen />);
    expect(
      screen.getByRole("slider", { name: "Protected Block Length" })
    ).toHaveValue("180");
    expect(
      screen.getByRole("switch", { name: "Force Fullscreen Mode" })
    ).toBeChecked();
    choose("Free Flow");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Free Flow" }));
    expect(
      saved().modes.find((mode: { isActive: boolean }) => mode.isActive)
    ).toMatchObject({ id: "freeflow", settings: [] });
  });
  it("reports storage failure without claiming a mode was activated", () => {
    localStorage.setItem("study_mode_config", "{bad json");
    render(<ModesSettingsScreen />);
    choose("Deep Work");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    fireEvent.click(screen.getByRole("button", { name: "Use Deep Work" }));
    expect(screen.getByText(/Couldn’t save on this device/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Use Deep Work" })).toBeEnabled();
    expect(
      screen.getAllByText("Pomodoro", { selector: "strong" })[0]
    ).toBeVisible();
  });
});

describe("Cognitive investment", () => {
  it("retains real costs, submits the selected currency, and refreshes shared balances", async () => {
    const snapshot = {
      skillPoints: 10,
      sylph: 600,
      cap: 65,
      abilities: COGNITIVE_STAT_KEYS.map((key) => ({
        ...getAbilitySummary(key, 10),
        value: 10,
        investable: true,
        costSp: 1,
        costSylph: 60,
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(snapshot)));
    fetchMock.mockImplementation(
      async (_url, init) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  ability: { label: "Endurance", value: 15 },
                  amount: 5,
                  cost: 1,
                }
              : snapshot
          )
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CognitiveAttributes />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /Cognitive attributes/ })
    );
    fireEvent.click(await screen.findByRole("button", { name: "10 SP" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Invest in Endurance with SP" })
    );
    await screen.findByText(/Endurance increased to 15/);
    await waitFor(() => expect(mocks.refreshStats).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cognitive-stats/invest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ stat: "endurance", currency: "sp" }),
      })
    );
    expect(mocks.invalidate).toHaveBeenCalledWith(
      expect.arrayContaining(["/api/user/stats", "/api/user/detailed-stats"])
    );
  });
});
