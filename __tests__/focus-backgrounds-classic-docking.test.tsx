import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassicTimerLayout } from "@/app/focus/components/layouts/ClassicTimerLayout";
import { FocusBackgroundRenderer } from "@/app/focus/components/FocusBackgroundRenderer";
import { FocusTimerLayoutProps } from "@/app/focus/components/FocusTimerLayoutProps";
import { FocusBackgroundClient } from "@/lib/focus-background-client";

function createMockProps(overrides: Partial<FocusTimerLayoutProps> = {}): FocusTimerLayoutProps {
  return {
    formattedDisplayTime: "25:00",
    elapsedSeconds: 300,
    breakSeconds: 0,
    remainingSeconds: 1200,
    isCountdown: true,
    isBreak: false,
    phase: "focus",
    phaseColor: "#ef4444",
    phaseLabel: "FOCUS",
    modeDisplayName: "Pomodoro",
    subjectName: "Linear Algebra",
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
    background: null,
    category: {
      id: 1,
      slug: "classic-sylf",
      name: "Classic Sylf",
      layoutKey: "classic",
      sortOrder: 0,
      isActive: true,
      backgrounds: [],
    },
    layoutKey: "classic",
    formatTime: (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },
    ...overrides,
  };
}

const mockCustomBackground: FocusBackgroundClient = {
  id: 5,
  categoryId: 1,
  name: "my study desk",
  storagePath: "user-5/study-desk.webp",
  width: 1920,
  height: 1080,
  aspectRatio: 1.7778,
  focalX: 0.46,
  focalY: 0.5,
  timerPosition: "right",
  sortOrder: 0,
  isActive: true,
  publicUrl: "https://mock.storage/user-5/study-desk.webp",
};

describe("Focus Backgrounds — ClassicTimerLayout Docking & Negative Space", () => {
  describe("1. Pure Classic Sylf (No Background)", () => {
    it("renders centered presentation without docked pod when background is null", () => {
      const props = createMockProps({ background: null });
      const { container } = render(<ClassicTimerLayout {...props} />);

      // Header should be centered
      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("items-center");
      expect(header?.className).toContain("text-center");
      expect(header?.className).toContain("md:self-center");

      // Center core should be centered
      const centerCore = container.querySelector(".max-w-4xl");
      expect(centerCore).toBeTruthy();
      expect(centerCore?.className).toContain("items-center");
      expect(centerCore?.className).toContain("text-center");

      // Controls should be centered
      const controls = screen.getByText("Pause").closest("div");
      expect(controls?.className).toContain("justify-center");
    });
  });

  describe("2. Right Docking Placement (User Request Fix)", () => {
    it("docks header, center card pod, and controls to the right margin on desktop", () => {
      const props = createMockProps({
        background: { ...mockCustomBackground, timerPosition: "right" },
      });
      const { container } = render(<ClassicTimerLayout {...props} />);

      // Header should align to right on md:
      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("md:self-end");
      expect(header?.className).toContain("text-center");
      expect(header?.className).not.toContain("md:text-right");
      expect(header?.className).toContain("md:mr-8");

      // Center core should dock to right and contain atmospheric frosted pod
      const centerCore = container.querySelector(".max-w-2xl");
      expect(centerCore).toBeTruthy();

      // Frosted glass pod should be present
      const pod = container.querySelector(".backdrop-blur-xl");
      expect(pod).toBeTruthy();
      expect(pod?.className).toContain("rounded-3xl");
      expect(pod?.className).toContain("border-white/12");

      // Digits inside pod should remain centered on desktop (no right-skew)
      const timerDigits = screen.getByText("25:00");
      expect(timerDigits.className).toContain("text-center");
      expect(timerDigits.className).not.toContain("md:text-right");

      // Controls row should dock to right margin and center buttons underneath pod
      const controls = screen.getByText("Pause").closest(".shrink-0");
      expect(controls?.className).toContain("md:self-end");
      expect(controls?.className).toContain("md:mr-8");
      expect(controls?.className).toContain("justify-center");
    });
  });

  describe("3. Left Docking Placement", () => {
    it("docks header, center card pod, and controls to the left margin on desktop", () => {
      const props = createMockProps({
        background: { ...mockCustomBackground, timerPosition: "left" },
        onTakeFlowBreak: vi.fn(),
        remainingSeconds: null,
      });
      const { container } = render(<ClassicTimerLayout {...props} />);

      // Header should align to left on md:
      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("md:self-start");
      expect(header?.className).toContain("text-center");
      expect(header?.className).not.toContain("md:text-left");
      expect(header?.className).toContain("md:ml-8");

      // Pod digits should remain centered on desktop (no left-skew)
      const timerDigits = screen.getByText("25:00");
      expect(timerDigits.className).toContain("text-center");
      expect(timerDigits.className).not.toContain("md:text-left");

      // Controls row should dock to left margin and center buttons underneath pod
      const controls = screen.getByText("Pause").closest(".shrink-0");
      expect(controls?.className).toContain("md:self-start");
      expect(controls?.className).toContain("md:ml-8");
      expect(controls?.className).toContain("justify-center");

      // Take a Break button must NOT contain raw coffee emoji
      const breakBtn = screen.getByText("Take a Break").closest("button");
      expect(breakBtn).toBeDefined();
      expect(breakBtn?.textContent).not.toContain("☕");
    });
  });

  describe("4. Center Placement with Background", () => {
    it("renders authentic centered floating timer without pod when timerPosition is center", () => {
      const props = createMockProps({
        background: { ...mockCustomBackground, timerPosition: "center" },
      });
      const { container } = render(<ClassicTimerLayout {...props} />);

      // Header should be centered
      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("md:self-center");

      // Pod should NOT be present (retains floating text)
      const centerCore = container.querySelector(".max-w-4xl");
      expect(centerCore).toBeTruthy();
      expect(centerCore?.className).toContain("text-center");

      // Controls should be centered
      const controls = screen.getByText("Pause").closest(".shrink-0");
      expect(controls?.className).toContain("justify-center");
    });
  });

  describe("5. Auto Docking via Focal-X Heuristic", () => {
    it("docks to the right when artwork subject is on the left (focalX <= 0.45)", () => {
      const props = createMockProps({
        background: { ...mockCustomBackground, timerPosition: "auto", focalX: 0.2 },
      });
      const { container } = render(<ClassicTimerLayout {...props} />);

      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("md:self-end");
    });

    it("docks to the left when artwork subject is on the right (focalX >= 0.55)", () => {
      const props = createMockProps({
        background: { ...mockCustomBackground, timerPosition: "auto", focalX: 0.8 },
      });
      const { container } = render(<ClassicTimerLayout {...props} />);

      const header = container.querySelector(".max-w-2xl");
      expect(header?.className).toContain("md:self-start");
    });
  });

  describe("6. FocusBackgroundRenderer Localized Contrast Glow", () => {
    it("shifts contrast glow to 80% 50% when docked right", () => {
      const bg = { ...mockCustomBackground, timerPosition: "right" } as any;
      const { container } = render(
        <FocusBackgroundRenderer
          activeBackground={bg}
          isClassic={false}
          phase="focus"
          layoutKey="classic"
        />
      );

      const glowDiv = container.querySelector(".transition-all.duration-500") as HTMLElement;
      expect(glowDiv).toBeTruthy();
      expect(glowDiv.style.background).toContain("circle at 80% 50%");
    });

    it("shifts contrast glow to 20% 50% when docked left", () => {
      const bg = { ...mockCustomBackground, timerPosition: "left" } as any;
      const { container } = render(
        <FocusBackgroundRenderer
          activeBackground={bg}
          isClassic={false}
          phase="focus"
          layoutKey="classic"
        />
      );

      const glowDiv = container.querySelector(".transition-all.duration-500") as HTMLElement;
      expect(glowDiv).toBeTruthy();
      expect(glowDiv.style.background).toContain("circle at 20% 50%");
    });

    it("keeps contrast glow at center when centered", () => {
      const bg = { ...mockCustomBackground, timerPosition: "center" } as any;
      const { container } = render(
        <FocusBackgroundRenderer
          activeBackground={bg}
          isClassic={false}
          phase="focus"
          layoutKey="classic"
        />
      );

      const glowDiv = container.querySelector(".transition-all.duration-500") as HTMLElement;
      expect(glowDiv).toBeTruthy();
      // Browser CSS engine normalizes 'circle at center' to 'circle'
      expect(glowDiv.style.background).toMatch(/radial-gradient\(circle/);
      expect(glowDiv.style.background).not.toContain("80% 50%");
      expect(glowDiv.style.background).not.toContain("20% 50%");
    });
  });
});
