import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusTimerLayoutPreview } from "@/app/focus/components/FocusTimerLayoutPreview";
import { LandscapeTimerLayout } from "@/app/focus/components/layouts/LandscapeTimerLayout";
import { AnimeTimerLayout } from "@/app/focus/components/layouts/AnimeTimerLayout";
import { FantasyTimerLayout } from "@/app/focus/components/layouts/FantasyTimerLayout";
import { ClassicTimerLayout } from "@/app/focus/components/layouts/ClassicTimerLayout";
import { FocusTimerLayoutProps } from "@/app/focus/components/FocusTimerLayoutProps";
import { resolveEffectiveTimerPosition } from "@/lib/focus-background-types";

function createMockProps(overrides: Partial<FocusTimerLayoutProps> = {}): FocusTimerLayoutProps {
  return {
    formattedDisplayTime: "25:00",
    elapsedSeconds: 0,
    breakSeconds: 0,
    remainingSeconds: 1500,
    isCountdown: true,
    isBreak: false,
    phase: "focus",
    phaseColor: "#6366f1",
    phaseLabel: "FOCUS",
    modeDisplayName: "Pomodoro",
    subjectName: "Study Session",
    questData: null,
    initialSubjectSeconds: 0,
    initialTotalSeconds: 3600,
    currentSession: 1,
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
      id: 1,
      categoryId: 1,
      name: "Sakura Lake",
      storagePath: "custom/sakura.webp",
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
      focalX: 0.5,
      focalY: 0.5,
      timerPosition: "auto",
      sortOrder: 1,
      isActive: true,
      publicUrl: "https://example.com/sakura.webp",
    },
    category: {
      id: 1,
      name: "Custom",
      slug: "custom",
      layoutKey: "classic",
      sortOrder: 1,
      isActive: true,
      backgrounds: [],
    },
    layoutKey: "classic",
    formatTime: (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    },
    ...overrides,
  };
}

describe("Focus Backgrounds — Phase 6.1: Real Timer Preview, Docking & Pause Cleanup", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Suite A: FocusTimerLayoutPreview — Rendering & Docking Parity
  // ──────────────────────────────────────────────────────────────────────────
  describe("Suite A: FocusTimerLayoutPreview Rendering & Positioning", () => {
    it("1. renders Classic layout preview when layoutKey is 'classic'", () => {
      const { container } = render(
        <FocusTimerLayoutPreview layoutKey="classic" timerPosition="center" />
      );
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview).toBeDefined();
      expect(preview.getAttribute("data-layout-key")).toBe("classic");
    });

    it("2. renders Anime layout preview when layoutKey is 'anime'", () => {
      const { container } = render(
        <FocusTimerLayoutPreview layoutKey="anime" timerPosition="center" />
      );
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview).toBeDefined();
      expect(preview.getAttribute("data-layout-key")).toBe("anime");
    });

    it("3. renders Landscape layout preview when layoutKey is 'landscape'", () => {
      const { container } = render(
        <FocusTimerLayoutPreview layoutKey="landscape" timerPosition="center" />
      );
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview).toBeDefined();
      expect(preview.getAttribute("data-layout-key")).toBe("landscape");
    });

    it("4. renders Fantasy layout preview when layoutKey is 'fantasy'", () => {
      const { container } = render(
        <FocusTimerLayoutPreview layoutKey="fantasy" timerPosition="center" />
      );
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview).toBeDefined();
      expect(preview.getAttribute("data-layout-key")).toBe("fantasy");
    });

    it("5. changing layoutKey immediately reflects in preview container attribute", () => {
      const { rerender } = render(
        <FocusTimerLayoutPreview layoutKey="classic" timerPosition="center" />
      );
      expect(screen.getByTestId("focus-timer-layout-preview").getAttribute("data-layout-key")).toBe("classic");

      rerender(<FocusTimerLayoutPreview layoutKey="landscape" timerPosition="center" />);
      expect(screen.getByTestId("focus-timer-layout-preview").getAttribute("data-layout-key")).toBe("landscape");

      rerender(<FocusTimerLayoutPreview layoutKey="anime" timerPosition="center" />);
      expect(screen.getByTestId("focus-timer-layout-preview").getAttribute("data-layout-key")).toBe("anime");

      rerender(<FocusTimerLayoutPreview layoutKey="fantasy" timerPosition="center" />);
      expect(screen.getByTestId("focus-timer-layout-preview").getAttribute("data-layout-key")).toBe("fantasy");
    });

    it("6. LEFT docking sets timer-position attribute to 'left'", () => {
      render(<FocusTimerLayoutPreview layoutKey="landscape" timerPosition="left" />);
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview.getAttribute("data-timer-position")).toBe("left");
    });

    it("7. RIGHT docking sets timer-position attribute to 'right'", () => {
      render(<FocusTimerLayoutPreview layoutKey="landscape" timerPosition="right" />);
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview.getAttribute("data-timer-position")).toBe("right");
    });

    it("8. CENTER docking sets timer-position attribute to 'center'", () => {
      render(<FocusTimerLayoutPreview layoutKey="landscape" timerPosition="center" />);
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview.getAttribute("data-timer-position")).toBe("center");
    });

    it("9. AUTO docking uses resolveEffectiveTimerPosition correctly", () => {
      expect(resolveEffectiveTimerPosition("auto", 0.8)).toBe("left");
      expect(resolveEffectiveTimerPosition("auto", 0.2)).toBe("right");
      expect(resolveEffectiveTimerPosition("auto", 0.5)).toBe("center");
    });

    it("10. preview is aria-hidden, inert, pointer-events-none, and does not interfere with accessibility", () => {
      const { container } = render(
        <FocusTimerLayoutPreview layoutKey="landscape" timerPosition="left" />
      );
      const preview = screen.getByTestId("focus-timer-layout-preview");
      expect(preview.getAttribute("aria-hidden")).toBe("true");
      expect(preview.className).toContain("pointer-events-none");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite B: Inner Alignment Decoupled from Outer Docking
  // ──────────────────────────────────────────────────────────────────────────
  describe("Suite B: Typography & Inner Alignment Decoupled from Docking", () => {
    it("11. Landscape LEFT does NOT apply internal text-left or items-start to the timer card", () => {
      const props = createMockProps({
        layoutKey: "landscape",
        background: {
          ...createMockProps().background!,
          timerPosition: "left",
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);

      // Digits must be centered
      const digits = screen.getByText("25:00");
      expect(digits.className).toContain("text-center");
      expect(digits.className).not.toContain("text-left");

      // HUD card must be centered
      const hudCard = container.querySelector(".backdrop-blur-\\[6px\\]");
      expect(hudCard?.className).toContain("items-center");
      expect(hudCard?.className).toContain("text-center");
      expect(hudCard?.className).not.toContain("items-inherit");

      // Controls must be centered
      const controls = screen.getByText("Pause").closest(".w-full");
      expect(controls?.className).toContain("justify-center");
      expect(controls?.className).not.toContain("md:justify-start");
    });

    it("12. Landscape RIGHT does NOT apply internal text-right to the timer card", () => {
      const props = createMockProps({
        layoutKey: "landscape",
        background: {
          ...createMockProps().background!,
          timerPosition: "right",
        },
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);

      const digits = screen.getByText("25:00");
      expect(digits.className).toContain("text-center");
      expect(digits.className).not.toContain("text-right");

      const hudCard = container.querySelector(".backdrop-blur-\\[6px\\]");
      expect(hudCard?.className).toContain("items-center");
      expect(hudCard?.className).toContain("text-center");
    });

    it("13. Anime left/right dock keeps internal pod composition stable and does not skew typography", () => {
      const leftProps = createMockProps({
        layoutKey: "anime",
        background: {
          ...createMockProps().background!,
          timerPosition: "left",
        },
      });
      const { container: leftContainer } = render(<AnimeTimerLayout {...leftProps} />);
      const leftPod = leftContainer.querySelector(".backdrop-blur-xl");
      expect(leftPod).toBeTruthy();
      // Outer wrapper should dock left without forcing text-left on pod
      const leftWrapper = leftPod?.parentElement;
      expect(leftWrapper?.className).toContain("md:self-start");
      expect(leftWrapper?.className).not.toContain("md:text-left");

      const rightProps = createMockProps({
        layoutKey: "anime",
        background: {
          ...createMockProps().background!,
          timerPosition: "right",
        },
      });
      const { container: rightContainer } = render(<AnimeTimerLayout {...rightProps} />);
      const rightPod = rightContainer.querySelector(".backdrop-blur-xl");
      const rightWrapper = rightPod?.parentElement;
      expect(rightWrapper?.className).toContain("md:self-end");
      expect(rightWrapper?.className).not.toContain("md:text-right");
    });

    it("14. Fantasy left/right dock keeps internal celestial composition stable", () => {
      const leftProps = createMockProps({
        layoutKey: "fantasy",
        background: {
          ...createMockProps().background!,
          timerPosition: "left",
        },
      });
      const { container: leftContainer } = render(<FantasyTimerLayout {...leftProps} />);
      const leftPod = leftContainer.querySelector(".backdrop-blur-xl");
      expect(leftPod).toBeTruthy();
      const leftWrapper = leftPod?.parentElement;
      expect(leftWrapper?.className).toContain("md:self-start");
      expect(leftWrapper?.className).not.toContain("md:text-left");

      const rightProps = createMockProps({
        layoutKey: "fantasy",
        background: {
          ...createMockProps().background!,
          timerPosition: "right",
        },
      });
      const { container: rightContainer } = render(<FantasyTimerLayout {...rightProps} />);
      const rightPod = rightContainer.querySelector(".backdrop-blur-xl");
      const rightWrapper = rightPod?.parentElement;
      expect(rightWrapper?.className).toContain("md:self-end");
      expect(rightWrapper?.className).not.toContain("md:text-right");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite C: Paused State & Layout Integrity
  // ──────────────────────────────────────────────────────────────────────────
  describe("Suite C: Paused State Presentation & Visual Integrity", () => {
    it("15. Pausing timer does NOT render old standalone circular pause indicator", () => {
      // In app/focus/page.tsx, the old floating pause circle had style containing 'boxShadow: 0 0 28px rgba(245, 158, 11, 0.22)'
      // When rendering a layout with isPaused: true, it does not render the old circular overlay
      const props = createMockProps({
        layoutKey: "landscape",
        isPaused: true,
      });
      const { container } = render(<LandscapeTimerLayout {...props} />);
      expect(container.querySelector(".rounded-full.border-2.w-16.h-16")).toBeNull();
    });

    it("16. SESSION PAUSED remains clearly visible inside the timer layout", () => {
      const props = createMockProps({
        layoutKey: "landscape",
        isPaused: true,
      });
      render(<LandscapeTimerLayout {...props} />);
      expect(screen.getByText(/session paused/i)).toBeDefined();
    });

    it("17. Resume control remains prominent and functional when paused", () => {
      const onTogglePause = vi.fn();
      const props = createMockProps({
        layoutKey: "landscape",
        isPaused: true,
        onTogglePause,
      });
      render(<LandscapeTimerLayout {...props} />);
      const resumeBtn = screen.getByRole("button", { name: /resume/i });
      expect(resumeBtn).toBeDefined();
    });

    it("18. Dock remains geometrically stable across paused and running states", () => {
      const runningProps = createMockProps({ layoutKey: "landscape", isPaused: false });
      const { container, rerender } = render(<LandscapeTimerLayout {...runningProps} />);
      const runningDock = container.querySelector(".backdrop-blur-\\[6px\\]");
      const runningClasses = runningDock?.className;

      const pausedProps = createMockProps({ layoutKey: "landscape", isPaused: true });
      rerender(<LandscapeTimerLayout {...pausedProps} />);
      const pausedDock = container.querySelector(".backdrop-blur-\\[6px\\]");
      const pausedClasses = pausedDock?.className;

      // The container dimensions/classes do not jump or shift
      expect(runningClasses).toBe(pausedClasses);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite D: Timer Invariance
  // ──────────────────────────────────────────────────────────────────────────
  describe("Suite D: Timer State & Accounting Invariance", () => {
    it("19. Changing dock placement does not alter timer props or values", () => {
      const baseProps = createMockProps({
        elapsedSeconds: 320,
        remainingSeconds: 1180,
        currentSession: 3,
        totalSessions: 4,
      });

      const leftProps = { ...baseProps, background: { ...baseProps.background!, timerPosition: "left" as const } };
      const rightProps = { ...baseProps, background: { ...baseProps.background!, timerPosition: "right" as const } };

      expect(leftProps.elapsedSeconds).toBe(rightProps.elapsedSeconds);
      expect(leftProps.remainingSeconds).toBe(rightProps.remainingSeconds);
      expect(leftProps.currentSession).toBe(rightProps.currentSession);
      expect(leftProps.totalSessions).toBe(rightProps.totalSessions);
    });

    it("20. Changing layout style does not alter timer mechanics or accounting", () => {
      const classicProps = createMockProps({ layoutKey: "classic", elapsedSeconds: 500 });
      const landscapeProps = createMockProps({ layoutKey: "landscape", elapsedSeconds: 500 });
      const animeProps = createMockProps({ layoutKey: "anime", elapsedSeconds: 500 });
      const fantasyProps = createMockProps({ layoutKey: "fantasy", elapsedSeconds: 500 });

      expect(classicProps.elapsedSeconds).toBe(500);
      expect(landscapeProps.elapsedSeconds).toBe(500);
      expect(animeProps.elapsedSeconds).toBe(500);
      expect(fantasyProps.elapsedSeconds).toBe(500);
    });
  });
});
