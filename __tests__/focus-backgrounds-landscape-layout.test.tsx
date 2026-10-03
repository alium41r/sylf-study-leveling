import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FocusTimerLayoutRouter } from "@/app/focus/components/FocusTimerLayoutRouter";
import { LandscapeTimerLayout } from "@/app/focus/components/layouts/LandscapeTimerLayout";
import { FocusTimerLayoutProps } from "@/app/focus/components/FocusTimerLayoutProps";
import { resolveEffectiveTimerPosition } from "@/lib/focus-background-types";

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
    subjectName: "Quantum Physics",
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
      id: 10,
      categoryId: 3,
      name: "Alpine Horizon",
      storagePath: "landscape/alpine.webp",
      width: 3840,
      height: 2160,
      aspectRatio: 1.7778,
      focalX: 0.5,
      focalY: 0.5,
      timerPosition: "auto",
      sortOrder: 1,
      isActive: true,
      publicUrl: "https://mock.supabase.co/landscape/alpine.webp",
    },
    category: {
      id: 3,
      slug: "landscapes",
      name: "Scenic Landscapes",
      layoutKey: "landscape",
      sortOrder: 2,
      isActive: true,
      backgrounds: [],
    },
    layoutKey: "landscape",
    formatTime: (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? "0" : ""}${s}`;
    },
    ...overrides,
  };
}

describe("Phase 3B: Landscape Timer Experience", () => {
  describe("1. FocusTimerLayoutRouter Selection & Fallback", () => {
    it("renders LandscapeTimerLayout when layoutKey is 'landscape'", () => {
      const props = createMockProps({ layoutKey: "landscape" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      // Landscape features large digits and subtle tracking
      expect(screen.getByText("25:00")).toBeDefined();
      expect(screen.getByText("FOCUS")).toBeDefined();
      expect(screen.getByText("Pomodoro")).toBeDefined();
      // Should have the subtle progress line
      expect(container.querySelector(".bg-white\\/15")).not.toBeNull();
    });

    it("renders AnimeTimerLayout when layoutKey is 'anime'", () => {
      const props = createMockProps({ layoutKey: "anime" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      // Anime layout features the glass card container
      expect(container.querySelector(".bg-black\\/35")).not.toBeNull();
    });

    it("renders ClassicTimerLayout when layoutKey is 'classic'", () => {
      const props = createMockProps({ layoutKey: "classic" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      // Classic layout features the SVG circular meter
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("falls back to ClassicTimerLayout for deferred 'fantasy' key", () => {
      const props = createMockProps({ layoutKey: "fantasy" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("falls back to ClassicTimerLayout for corrupted or unknown keys", () => {
      const props = createMockProps({ layoutKey: "non-existent-layout" });
      const { container } = render(<FocusTimerLayoutRouter {...props} />);

      expect(screen.getByText("25:00")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  describe("2. Positioning & Focal-X Heuristic in Landscape Layout", () => {
    it("docks left when explicit timerPosition is 'left'", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "left",
          focalX: 0.1, // Even if focalX is left, explicit 'left' setting wins
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-start");
      expect(dockZone).not.toBeNull();
    });

    it("docks right when explicit timerPosition is 'right'", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "right",
          focalX: 0.9, // Even if focalX is right, explicit 'right' setting wins
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
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
      const { container } = render(<LandscapeTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-center");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks left if subject focalX is on the right (focalX >= 0.55)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.75, // Mountain peak on right -> negative space on left
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-start");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks right if subject focalX is on the left (focalX <= 0.45)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.25, // Sunset on left -> negative space on right
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-end");
      expect(dockZone).not.toBeNull();
    });

    it("when timerPosition is 'auto', docks center if focalX is centered (0.45 < focalX < 0.55)", () => {
      const props = createMockProps({
        background: {
          ...createMockProps().background!,
          timerPosition: "auto",
          focalX: 0.5,
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
      const dockZone = container.querySelector(".md\\:self-center");
      expect(dockZone).not.toBeNull();
    });
  });

  describe("3. State-Aware Actions & Callback Integrity", () => {
    it("invokes onTogglePause when Pause / Resume button is clicked", () => {
      const onTogglePause = vi.fn();
      const props = createMockProps({ isPaused: false, onTogglePause });
      render(<LandscapeTimerLayout {...props} />);

      const pauseBtn = screen.getByRole("button", { name: /pause/i });
      fireEvent.click(pauseBtn);
      expect(onTogglePause).toHaveBeenCalledTimes(1);
    });

    it("renders Resume label and triggers callback when paused", () => {
      const onTogglePause = vi.fn();
      const props = createMockProps({ isPaused: true, onTogglePause });
      render(<LandscapeTimerLayout {...props} />);

      const resumeBtn = screen.getByRole("button", { name: /resume/i });
      fireEvent.click(resumeBtn);
      expect(onTogglePause).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/session paused/i)).toBeDefined();
    });

    it("invokes onEndSession when End button is clicked", () => {
      const onEndSession = vi.fn();
      const props = createMockProps({ onEndSession });
      render(<LandscapeTimerLayout {...props} />);

      const endBtn = screen.getByRole("button", { name: /end/i });
      fireEvent.click(endBtn);
      expect(onEndSession).toHaveBeenCalledTimes(1);
    });

    it("renders Complete Quest button only when questData is attached", () => {
      const onCompleteQuest = vi.fn();
      const propsWithQuest = createMockProps({
        questData: { id: 42, title: "Master Calculus Integration" },
        onCompleteQuest,
      });

      const { rerender } = render(<LandscapeTimerLayout {...propsWithQuest} />);
      const completeBtn = screen.getByRole("button", { name: /complete quest/i });
      fireEvent.click(completeBtn);
      expect(onCompleteQuest).toHaveBeenCalledTimes(1);

      // Without questData, button should not render
      const propsWithoutQuest = createMockProps({ questData: null });
      rerender(<LandscapeTimerLayout {...propsWithoutQuest} />);
      expect(screen.queryByRole("button", { name: /complete quest/i })).toBeNull();
    });

    it("renders Flowtime break nudge and triggers onTakeFlowBreak", () => {
      const onTakeFlowBreak = vi.fn();
      const props = createMockProps({
        flowNudge: true,
        onTakeFlowBreak,
        elapsedSeconds: 1800,
      });
      render(<LandscapeTimerLayout {...props} />);

      const nudgeBtn = screen.getByRole("button", { name: /stretch break/i });
      fireEvent.click(nudgeBtn);
      expect(onTakeFlowBreak).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Parent-Level State Invariance Across Layout Switches", () => {
    function ParentTimerHarness() {
      // Authoritative timer engine state owned by parent (simulating FocusContent)
      const [layoutKey, setLayoutKey] = useState<string>("classic");
      const [elapsed, setElapsed] = useState<number>(1542);
      const [isPaused, setIsPaused] = useState<boolean>(false);
      const [phase, setPhase] = useState<"focus" | "short-break" | "long-break">("focus");
      const [currentSession, setCurrentSession] = useState<number>(3);

      const props = createMockProps({
        layoutKey,
        elapsedSeconds: elapsed,
        formattedDisplayTime: "25:42",
        isPaused,
        phase,
        currentSession,
        totalSessions: 4,
        onTogglePause: () => setIsPaused((prev) => !prev),
      });

      return (
        <div>
          {/* External Category / Background switcher */}
          <button data-testid="set-classic" onClick={() => setLayoutKey("classic")}>
            Classic
          </button>
          <button data-testid="set-landscape" onClick={() => setLayoutKey("landscape")}>
            Landscape
          </button>
          <button data-testid="set-anime" onClick={() => setLayoutKey("anime")}>
            Anime
          </button>

          {/* Router presentation */}
          <FocusTimerLayoutRouter {...props} />

          {/* Test harness assertions directly on parent state */}
          <div data-testid="parent-elapsed">{elapsed}</div>
          <div data-testid="parent-paused">{isPaused ? "paused" : "running"}</div>
          <div data-testid="parent-phase">{phase}</div>
          <div data-testid="parent-session">{currentSession}</div>
        </div>
      );
    }

    it("switching Classic -> Landscape -> Anime -> Classic does not reset or alter timer state", () => {
      render(<ParentTimerHarness />);

      // Initial Classic state
      expect(screen.getByTestId("parent-elapsed").textContent).toBe("1542");
      expect(screen.getByTestId("parent-paused").textContent).toBe("running");
      expect(screen.getByTestId("parent-phase").textContent).toBe("focus");
      expect(screen.getByTestId("parent-session").textContent).toBe("3");
      expect(screen.getByText("25:42")).toBeDefined();

      // Switch to Landscape
      fireEvent.click(screen.getByTestId("set-landscape"));
      expect(screen.getByTestId("parent-elapsed").textContent).toBe("1542");
      expect(screen.getByTestId("parent-paused").textContent).toBe("running");
      expect(screen.getByTestId("parent-phase").textContent).toBe("focus");
      expect(screen.getByTestId("parent-session").textContent).toBe("3");
      expect(screen.getByText("25:42")).toBeDefined();

      // Switch to Anime
      fireEvent.click(screen.getByTestId("set-anime"));
      expect(screen.getByTestId("parent-elapsed").textContent).toBe("1542");
      expect(screen.getByTestId("parent-paused").textContent).toBe("running");
      expect(screen.getByTestId("parent-phase").textContent).toBe("focus");
      expect(screen.getByTestId("parent-session").textContent).toBe("3");
      expect(screen.getByText("25:42")).toBeDefined();

      // Switch back to Classic
      fireEvent.click(screen.getByTestId("set-classic"));
      expect(screen.getByTestId("parent-elapsed").textContent).toBe("1542");
      expect(screen.getByTestId("parent-paused").textContent).toBe("running");
      expect(screen.getByTestId("parent-phase").textContent).toBe("focus");
      expect(screen.getByTestId("parent-session").textContent).toBe("3");
      expect(screen.getByText("25:42")).toBeDefined();
    });
  });
});
