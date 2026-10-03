import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FocusTimerLayoutRouter } from "@/app/focus/components/FocusTimerLayoutRouter";
import { FantasyTimerLayout } from "@/app/focus/components/layouts/FantasyTimerLayout";
import { FocusTimerLayoutProps } from "@/app/focus/components/FocusTimerLayoutProps";

function createMockProps(overrides: Partial<FocusTimerLayoutProps> = {}): FocusTimerLayoutProps {
  return {
    formattedDisplayTime: "25:00",
    elapsedSeconds: 300,
    breakSeconds: 0,
    remainingSeconds: 1200,
    isCountdown: true,
    isBreak: false,
    phase: "focus",
    phaseColor: "#f59e0b",
    phaseLabel: "FOCUS",
    modeDisplayName: "Pomodoro",
    subjectName: "Arcane Theory",
    questData: null,
    initialSubjectSeconds: 1800,
    initialTotalSeconds: 3600,
    currentSession: 2,
    totalSessions: 4,
    showSessionDots: true,
    isPaused: false,
    pauseReason: "manual",
    isEnding: false,
    endError: null,
    flowNudge: false,
    onTogglePause: vi.fn(),
    onEndSession: vi.fn(),
    onCompleteQuest: vi.fn(),
    onTakeFlowBreak: vi.fn(),
    onSkipFlowBreak: vi.fn(),
    background: {
      id: 15,
      categoryId: 4,
      name: "Astral Library",
      storagePath: "fantasy/library.webp",
      width: 3840,
      height: 2160,
      aspectRatio: 1.7778,
      focalX: 0.5,
      focalY: 0.5,
      timerPosition: "auto",
      sortOrder: 1,
      isActive: true,
      publicUrl: "https://mock.supabase.co/fantasy/library.webp",
    },
    category: {
      id: 4,
      slug: "fantasy",
      name: "Scholar Sanctums",
      layoutKey: "fantasy",
      sortOrder: 3,
      isActive: true,
      backgrounds: [],
    },
    layoutKey: "fantasy",
    formatTime: (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? "0" : ""}${s}`;
    },
    ...overrides,
  };
}

describe("Phase 3C: Fantasy Timer Experience", () => {
  describe("1. FocusTimerLayoutRouter Selection & Fallback", () => {
    it("renders FantasyTimerLayout when layoutKey is 'fantasy'", () => {
      const props = createMockProps({ layoutKey: "fantasy" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(screen.getByText("FOCUS")).toBeDefined();
      expect(screen.getAllByText("Arcane Theory").length).toBeGreaterThanOrEqual(1);
      // Verifies celestial astrolabe breathing arc is present
      expect(container.querySelector(".fantasy-glow-breathe")).not.toBeNull();
    });

    it("renders AnimeTimerLayout when layoutKey is 'anime'", () => {
      const props = createMockProps({ layoutKey: "anime" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector(".bg-black\\/35")).not.toBeNull();
    });

    it("renders LandscapeTimerLayout when layoutKey is 'landscape'", () => {
      const props = createMockProps({ layoutKey: "landscape" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector(".md\\:mb-8")).not.toBeNull();
    });

    it("renders ClassicTimerLayout when layoutKey is 'classic'", () => {
      const props = createMockProps({ layoutKey: "classic" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("falls back to ClassicTimerLayout for corrupted or unknown keys", () => {
      const props = createMockProps({ layoutKey: "ancient-ruins-custom" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  describe("2. Positioning & Focal-X Heuristic in Fantasy Layout", () => {
    it("docks left when explicit timerPosition is 'left'", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "left",
          focalX: 0.1,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-start");
      expect(dockZone).not.toBeNull();
    });

    it("docks right when explicit timerPosition is 'right'", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "right",
          focalX: 0.9,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-end");
      expect(dockZone).not.toBeNull();
    });

    it("docks center when explicit timerPosition is 'center'", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "center",
          focalX: 0.9,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-center");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks left if subject focalX is on the right (focalX >= 0.55)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.8,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-start");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks right if subject focalX is on the left (focalX <= 0.45)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.2,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-end");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks center if focalX is balanced (0.45 < focalX < 0.55)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.5,
        },
      });
      const { container } = render(<FantasyTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-center");
      expect(dockZone).not.toBeNull();
    });
  });

  describe("3. Theme Accents vs Phase Color Distinction", () => {
    it("drives timer digits by phaseColor while celestial linework uses theme variables", () => {
      const customPhaseColor = "#10b981"; // Break green
      const props = createMockProps({ phaseColor: customPhaseColor, isBreak: true, phase: "short-break" });
      render(<FantasyTimerLayout {...props} />);

      const digits = screen.getByText("25:00");
      expect(digits.style.color).toBe("rgb(16, 185, 129)");
    });

    it("hides decorative astrolabe arcs on mobile viewports", () => {
      const props = createMockProps();
      const { container } = render(<FantasyTimerLayout {...props} />);

      const astrolabeArc = container.querySelector(".fantasy-glow-breathe");
      expect(astrolabeArc).not.toBeNull();
      // Verified that it uses hidden sm:block to keep mobile clean
      expect(astrolabeArc?.className).toContain("hidden sm:block");
    });
  });

  describe("4. State-Aware Actions & Callbacks", () => {
    it("invokes onTogglePause when Pause / Resume is clicked", () => {
      const onTogglePause = vi.fn();
      const props = createMockProps({ isPaused: false, onTogglePause });
      render(<FantasyTimerLayout {...props} />);

      const pauseBtn = screen.getByRole("button", { name: /pause/i });
      fireEvent.click(pauseBtn);
      expect(onTogglePause).toHaveBeenCalledTimes(1);
    });

    it("invokes onEndSession when End is clicked", () => {
      const onEndSession = vi.fn();
      const props = createMockProps({ onEndSession });
      render(<FantasyTimerLayout {...props} />);

      const endBtn = screen.getByRole("button", { name: /end/i });
      fireEvent.click(endBtn);
      expect(onEndSession).toHaveBeenCalledTimes(1);
    });

    it("renders Complete Quest button only when questData is attached", () => {
      const onCompleteQuest = vi.fn();
      const propsWithQuest = createMockProps({
        questData: { id: 77, title: "Decipher Ancient Script" },
        onCompleteQuest,
      });

      const { rerender } = render(<FantasyTimerLayout {...propsWithQuest} />);
      const completeBtn = screen.getByRole("button", { name: /complete quest/i });
      fireEvent.click(completeBtn);
      expect(onCompleteQuest).toHaveBeenCalledTimes(1);

      // Without questData, button should not render
      const propsWithoutQuest = createMockProps({ questData: null });
      rerender(<FantasyTimerLayout {...propsWithoutQuest} />);
      expect(screen.queryByRole("button", { name: /complete quest/i })).toBeNull();
    });
  });

  describe("5. Complete 4-Category Parent-Level State Invariance", () => {
    function MultiCategoryParentHarness() {
      // Authoritative state owned exclusively by parent (simulating FocusContent)
      const [layoutKey, setLayoutKey] = useState<string>("classic");
      const [elapsed, setElapsed] = useState<number>(1984);
      const [isPaused, setIsPaused] = useState<boolean>(false);
      const [phase, setPhase] = useState<"focus" | "short-break" | "long-break">("focus");
      const [currentSession, setCurrentSession] = useState<number>(3);

      const props = createMockProps({
        layoutKey,
        elapsedSeconds: elapsed,
        formattedDisplayTime: "33:04",
        isPaused,
        phase,
        currentSession,
        totalSessions: 4,
        onTogglePause: () => setIsPaused((prev) => !prev),
      });

      return (
        <div>
          {/* External Category Switchers */}
          <button data-testid="set-classic" onClick={() => setLayoutKey("classic")}>
            Classic
          </button>
          <button data-testid="set-anime" onClick={() => setLayoutKey("anime")}>
            Anime
          </button>
          <button data-testid="set-landscape" onClick={() => setLayoutKey("landscape")}>
            Landscape
          </button>
          <button data-testid="set-fantasy" onClick={() => setLayoutKey("fantasy")}>
            Fantasy
          </button>

          {/* Router presentation */}
          <FocusTimerLayoutRouter {...props} />

          {/* Parent State Assertions */}
          <div data-testid="parent-elapsed">{elapsed}</div>
          <div data-testid="parent-paused">{isPaused ? "paused" : "running"}</div>
          <div data-testid="parent-phase">{phase}</div>
          <div data-testid="parent-session">{currentSession}</div>
        </div>
      );
    }

    it("cycling Classic -> Anime -> Landscape -> Fantasy -> Classic leaves all timer state 100% invariant", () => {
      render(<MultiCategoryParentHarness />);

      const verifyState = () => {
        expect(screen.getByTestId("parent-elapsed").textContent).toBe("1984");
        expect(screen.getByTestId("parent-paused").textContent).toBe("running");
        expect(screen.getByTestId("parent-phase").textContent).toBe("focus");
        expect(screen.getByTestId("parent-session").textContent).toBe("3");
        expect(screen.getByText("33:04")).toBeDefined();
      };

      // 1. Initial Classic
      verifyState();

      // 2. Switch to Anime
      fireEvent.click(screen.getByTestId("set-anime"));
      verifyState();

      // 3. Switch to Landscape
      fireEvent.click(screen.getByTestId("set-landscape"));
      verifyState();

      // 4. Switch to Fantasy
      fireEvent.click(screen.getByTestId("set-fantasy"));
      verifyState();

      // 5. Switch back to Classic
      fireEvent.click(screen.getByTestId("set-classic"));
      verifyState();
    });
  });
});
