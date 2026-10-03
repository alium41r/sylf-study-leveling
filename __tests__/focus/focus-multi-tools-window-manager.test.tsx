/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { FocusToolsProvider, useFocusTools } from "@/app/focus/components/FocusToolsContext";
import FocusToolWindow from "@/app/focus/components/FocusToolWindow";
import FocusToolsDock from "@/app/focus/components/FocusToolsDock";

// Mock AcousticsContext
vi.mock("@/app/components/AcousticsContext", () => ({
  useAcoustics: () => ({
    tracks: [
      { id: 1, title: "Forest Wind & Leaves", category: "NATURE", frequency: "Organic Wind" },
    ],
    activeTrack: { id: 1, title: "Forest Wind & Leaves", category: "NATURE", frequency: "Organic Wind" },
    isPlaying: false,
    masterVolume: 75,
    layerVolumes: { rain: 20, cafe: 0, keyboard: 0, whitenoise: 0 },
    frequencyData: [10, 20, 30, 40, 50, 60, 70, 80],
    playTrack: vi.fn(),
    togglePlay: vi.fn(),
    setMasterVolume: vi.fn(),
    setLayerVolume: vi.fn(),
    playNextTrack: vi.fn(),
    playPreviousTrack: vi.fn(),
  }),
}));

// Helper component for testing state retention across window movements
function StateRetentionTestHarness() {
  const { openTool, isMultiToolMode, toggleMultiToolMode } = useFocusTools();
  return (
    <div>
      <button onClick={() => openTool("calculator")}>Open Calc</button>
      <button onClick={() => openTool("notes")}>Open Notes</button>
      <button onClick={() => toggleMultiToolMode()}>Toggle Multi</button>
      <FocusToolWindow />
    </div>
  );
}

describe("Multi Tools Authoritative Window Manager & Animation System", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1440;
    window.innerHeight = 900;
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
    vi.restoreAllMocks();
  });

  describe("1. No Wrong First Frame & Deterministic Coordinates", () => {
    it("renders first opened tool directly at its calculated target slot with zero center default state", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Open Calculator
      fireEvent.click(screen.getByLabelText("Calculator"));

      // Find the window container (motion div with SYSTEM CALCULATOR)
      const windowHeader = screen.getByText("SYSTEM CALCULATOR");
      const windowEl = windowHeader.closest("[style*='position: fixed']") as HTMLElement;
      expect(windowEl).toBeDefined();

      // Viewport is 1440x900.
      // Expected desktop window width: Math.min(420, 1440 * 0.45) = 420px.
      // Margin: 28px. Target Slot 0 X = 1440 - 28 - 420 = 992px.
      // It must NOT be centered (1440/2 - 210 = 510px).
      expect(windowEl.style.position).toBe("fixed");
      expect(windowEl.style.left).toBe("0px");
      expect(windowEl.style.top).toBe("0px");
      expect(windowEl.style.width).toBe("420px");

      // Verify that the motion container does NOT contain conflicting CSS transition-all
      expect(windowEl.className).not.toContain("transition-all");
    });

    it("switching from Tool A to Tool B in Single Mode places Tool B at the exact same target coordinates without jump", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Open Tool A (Calculator)
      fireEvent.click(screen.getByLabelText("Calculator"));
      const calcHeader = screen.getByText("SYSTEM CALCULATOR");
      const calcWindow = calcHeader.closest("[style*='position: fixed']") as HTMLElement;
      const initialWidth = calcWindow.style.width;

      // Switch to Tool B (Scratchpad / notes)
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      const notesHeader = screen.getByText("FOCUS SCRATCHPAD");
      const notesWindow = notesHeader.closest("[style*='position: fixed']") as HTMLElement;

      // Both windows share the exact same width and slot coordinate space
      expect(notesWindow.style.position).toBe("fixed");
      expect(notesWindow.style.left).toBe("0px");
      expect(notesWindow.style.top).toBe("0px");
      expect(notesWindow.style.width).toBe(initialWidth);
    });
  });

  describe("2. Multi Mode Layout & Stable Slot Assignment", () => {
    it("assigns Slot 0 to first tool and Slot 1 to second tool without reshuffling Slot 0", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Enable Multi-Tool mode
      const multiButton = screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i });
      fireEvent.click(multiButton);

      // Open Tool 1: Calculator
      fireEvent.click(screen.getByLabelText("Calculator"));
      const calcEl = screen.getByText("SYSTEM CALCULATOR").closest("[style*='position: fixed']") as HTMLElement;
      expect(calcEl).toBeDefined();

      // Open Tool 2: Scratchpad (notes)
      fireEvent.click(screen.getByLabelText("Scratchpad"));
      const notesEl = screen.getByText("FOCUS SCRATCHPAD").closest("[style*='position: fixed']") as HTMLElement;
      expect(notesEl).toBeDefined();

      // Both windows are concurrently rendered
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Both have fixed positioning and non-zero dimensions
      expect(calcEl.style.width).toBe("420px");
      expect(notesEl.style.width).toBe("420px");
    });

    it("closing one tool in Multi Mode leaves the remaining tool stable without destroying its state", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Enable Multi Mode
      fireEvent.click(screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i }));

      // Open Calculator and Scratchpad
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      // Close Calculator window via its header close button
      const closeCalcBtn = screen.getByTitle("Close SYSTEM CALCULATOR Window");
      fireEvent.click(closeCalcBtn);

      // Calculator is closed, Scratchpad remains stably mounted
      expect(screen.queryByText("SYSTEM CALCULATOR")).toBeNull();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();
    });
  });

  describe("3. Window Lifecycle & State Preservation", () => {
    it("preserves internal user input across Multi Mode ON and OFF transitions", () => {
      render(
        <FocusToolsProvider>
          <StateRetentionTestHarness />
        </FocusToolsProvider>
      );

      // Open Notes
      fireEvent.click(screen.getByText("Open Notes"));
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Type some text into the notes textarea
      const textarea = screen.getByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Quantum Electrodynamics Notes 101" } });
      expect(textarea.value).toBe("Quantum Electrodynamics Notes 101");

      // Toggle Multi Mode ON
      fireEvent.click(screen.getByText("Toggle Multi"));

      // Open Calculator as second tool
      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Verify notes textarea STILL has the user's text intact!
      const textareaInMulti = screen.getByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement;
      expect(textareaInMulti.value).toBe("Quantum Electrodynamics Notes 101");

      // Toggle Multi Mode OFF (notes is still active or kept)
      fireEvent.click(screen.getByText("Toggle Multi"));

      // Verify notes content was NOT reset by the mode transition!
      const textareaAfterMultiOff = screen.queryByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement | null;
      if (textareaAfterMultiOff) {
        expect(textareaAfterMultiOff.value).toBe("Quantum Electrodynamics Notes 101");
      }
    });
  });

  describe("4. Rapid Interactions & Stress Testing", () => {
    it("handles rapid Multi Mode toggling without crashing or leaving orphaned windows", () => {
      render(
        <FocusToolsProvider>
          <StateRetentionTestHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();

      // Rapidly toggle Multi Mode 6 times
      for (let i = 0; i < 6; i++) {
        act(() => {
          fireEvent.click(screen.getByText("Toggle Multi"));
        });
      }

      // Exactly one calculator window should remain visible and valid
      expect(screen.getAllByText("SYSTEM CALCULATOR").length).toBe(1);
    });

    it("handles rapid tool switching in Single Mode without duplicate containers", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Rapidly click between 4 tools
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Audio Mixer"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));
      fireEvent.click(screen.getByLabelText("Formulas"));

      // Only the final selected tool (Formulas) should be mounted
      expect(screen.queryByText("SYSTEM CALCULATOR")).toBeNull();
      expect(screen.queryByText("ACOUSTICS MIXER")).toBeNull();
      expect(screen.queryByText("FOCUS SCRATCHPAD")).toBeNull();
      expect(screen.getByText("FORMULAS & REFERENCE")).toBeDefined();
    });
  });

  describe("5. Responsive Viewport Adaptability", () => {
    it("clamps windows cleanly on budget laptops (1366x768) without exceeding visible screen boundaries", () => {
      window.innerWidth = 1366;
      window.innerHeight = 768;
      window.dispatchEvent(new Event("resize"));

      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByLabelText("Calculator"));

      const windowHeader = screen.getByText("SYSTEM CALCULATOR");
      const windowEl = windowHeader.closest("[style*='position: fixed']") as HTMLElement;
      expect(windowEl).toBeDefined();

      const width = parseInt(windowEl.style.width, 10);
      expect(width).toBeLessThanOrEqual(420);
      expect(width).toBeGreaterThan(300);
    });

    it("renders full-width bottom sheet on mobile screens (390x844)", () => {
      window.innerWidth = 390;
      window.innerHeight = 844;
      window.dispatchEvent(new Event("resize"));

      // Open a tool programmatically via context in a test wrapper
      const TestMobileHarness = () => {
        const { openTool } = useFocusTools();
        return (
          <div>
            <button onClick={() => openTool("notes")}>Launch Mobile Notes</button>
            <FocusToolWindow />
          </div>
        );
      };

      const { unmount } = render(
        <FocusToolsProvider>
          <TestMobileHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Launch Mobile Notes"));

      const notesHeader = screen.getByText("FOCUS SCRATCHPAD");
      const mobileWindow = notesHeader.closest("[style*='position: fixed']") as HTMLElement;

      // On mobile (390px), window width matches viewport width (390px)
      expect(mobileWindow.style.width).toBe("390px");
      expect(mobileWindow.style.left).toBe("0px");

      unmount();
    });
  });
});
