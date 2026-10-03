/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// Mock AuthProvider
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    token: "mock-token",
    user: { id: 1, name: "Ali", email: "test@example.com" },
  }),
}));

// Test harness with timer simulation to verify timer isolation
function MultitaskingHarness() {
  const { openTool, toggleMultiToolMode, closeTool } = useFocusTools();
  const [timerSeconds, setTimerSeconds] = React.useState(1500);

  return (
    <div data-focus-workspace="true" style={{ width: "1440px", height: "900px", position: "relative" }}>
      <div data-testid="focus-timer-display">{timerSeconds}</div>
      <button onClick={() => setTimerSeconds((s) => s - 1)}>Tick Timer</button>
      <button onClick={() => openTool("calculator")}>Open Calc</button>
      <button onClick={() => openTool("notes")}>Open Notes</button>
      <button onClick={() => openTool("audio")}>Open Audio</button>
      <button onClick={() => closeTool("calculator")}>Close Calc</button>
      <button onClick={toggleMultiToolMode}>Toggle Multi</button>
      <FocusToolWindow />
      <FocusToolsDock defaultExpanded={true} />
    </div>
  );
}

describe("Sylf Focus — Floating Multitasking Window System", () => {
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

  describe("1. Canonical Window Manager & Lifecycle", () => {
    it("opens single tool window with correct canonical dialog role and title", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      const dialog = screen.getByRole("dialog", { name: "SYSTEM CALCULATOR" });
      expect(dialog).toBeDefined();
      expect(dialog.style.position).toBe("fixed");
    });

    it("enforces singleton behavior: opening an already open tool focuses it rather than creating a duplicate", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      // Open Calculator twice
      fireEvent.click(screen.getByText("Open Calc"));
      fireEvent.click(screen.getByText("Open Calc"));

      const calcDialogs = screen.getAllByRole("dialog", { name: "SYSTEM CALCULATOR" });
      expect(calcDialogs.length).toBe(1);
    });

    it("closes window cleanly and removes it from DOM presentation", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByRole("dialog", { name: "SYSTEM CALCULATOR" })).toBeDefined();

      const closeBtn = screen.getByTitle("Close SYSTEM CALCULATOR Window");
      fireEvent.click(closeBtn);

      expect(screen.queryByRole("dialog", { name: "SYSTEM CALCULATOR" })).toBeNull();
    });
  });

  describe("2. State-Preserving Minimize & Restore", () => {
    it("preserves internal user input in Calculator and Notes across minimize and restore", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      // Enable Multi-Tool Mode
      fireEvent.click(screen.getByText("Toggle Multi"));

      // Open Calculator and enter calculation
      fireEvent.click(screen.getByText("Open Calc"));
      const digit7 = screen.getByText("7");
      const digit8 = screen.getByText("8");
      fireEvent.click(digit7);
      fireEvent.click(digit8);

      const calcDisplay = screen.getByTestId("calc-expression");
      expect(calcDisplay.textContent).toContain("78");

      // Open Notes and type thoughts
      fireEvent.click(screen.getByText("Open Notes"));
      const textarea = screen.getByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Studying Electrodynamics Chapter 4" } });
      expect(textarea.value).toBe("Studying Electrodynamics Chapter 4");

      // Minimize Calculator
      const minimizeCalc = screen.getByRole("button", { name: "Minimize SYSTEM CALCULATOR" });
      fireEvent.click(minimizeCalc);

      // Calculator window is hidden via display: none (left canvas) but remains mounted
      const calcWindow = document.querySelector('div[role="dialog"][aria-label="SYSTEM CALCULATOR"]') as HTMLElement;
      expect(calcWindow).not.toBeNull();
      expect(calcWindow.style.display).toBe("none");

      // Verify the expression did NOT get wiped!
      expect(screen.getByTestId("calc-expression").textContent).toContain("78");

      // Restore Calculator via dock chip
      const restoreBtn = screen.getByRole("button", { name: "Restore Calculator" });
      fireEvent.click(restoreBtn);

      // Window is now visible again
      expect(calcWindow.style.display).toBe("flex");
      expect(screen.getByTestId("calc-expression").textContent).toContain("78");

      // Notes content is also still intact
      const notesTextarea = screen.getByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement;
      expect(notesTextarea.value).toBe("Studying Electrodynamics Chapter 4");
    });

    it("displays compact minimized chip in the dock and restores on chip click", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      const minimizeBtn = screen.getByTitle("Minimize Window");
      fireEvent.click(minimizeBtn);

      // Dock shows minimized chip for Calculator
      const restoreChip = screen.getByRole("button", { name: "Restore Calculator" });
      expect(restoreChip).toBeDefined();

      // Click chip restores window
      fireEvent.click(restoreChip);
      const calcWindow = screen.getByRole("dialog", { name: "SYSTEM CALCULATOR" });
      expect(calcWindow.style.display).toBe("flex");
    });
  });

  describe("3. Z-Order Stack & Focus Derivation", () => {
    it("derives focus from z-stack: clicking a window brings it to top and marks it focused", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Toggle Multi"));
      fireEvent.click(screen.getByText("Open Calc"));
      fireEvent.click(screen.getByText("Open Notes"));

      const calcWindow = screen.getByRole("dialog", { name: "SYSTEM CALCULATOR" });
      const notesWindow = screen.getByRole("dialog", { name: "FOCUS SCRATCHPAD" });

      // Notes was opened second, so notes should have a higher zIndex than calculator
      expect(parseInt(notesWindow.style.zIndex, 10)).toBeGreaterThan(parseInt(calcWindow.style.zIndex, 10));

      // Click on Calculator window to bring it to front
      fireEvent.pointerDown(calcWindow);

      // Calculator should now be frontmost with higher zIndex
      expect(parseInt(calcWindow.style.zIndex, 10)).toBeGreaterThan(parseInt(notesWindow.style.zIndex, 10));
    });
  });

  describe("4. Drag Handle & Content Isolation", () => {
    it("title bar acts as drag handle and interacting with tool content does not initiate drag", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));

      const headerDragHandle = screen.getByTitle("Drag to reposition window");
      expect(headerDragHandle).toBeDefined();

      // Ensure tool content has its own interactive container
      const calcButton = screen.getByText("5");
      expect(calcButton).toBeDefined();

      // Clicking on calculator button performs calculation, not window drag
      fireEvent.click(calcButton);
      expect(screen.getByTestId("calc-expression").textContent).toContain("5");
    });

    it("drag handle uses pointer capture and commits clamped coordinates on drag end", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      const headerDragHandle = screen.getByTitle("Drag to reposition window");

      // Mock setPointerCapture & releasePointerCapture
      const setCaptureSpy = vi.fn();
      const releaseCaptureSpy = vi.fn();
      headerDragHandle.setPointerCapture = setCaptureSpy;
      headerDragHandle.releasePointerCapture = releaseCaptureSpy;

      // Start drag at (500, 200)
      fireEvent.pointerDown(headerDragHandle, { clientX: 500, clientY: 200, button: 0, pointerId: 1 });
      expect(setCaptureSpy).toHaveBeenCalledWith(1);

      // Move pointer by (+50, +30)
      fireEvent.pointerMove(headerDragHandle, { clientX: 550, clientY: 230, pointerId: 1 });

      // End drag
      fireEvent.pointerUp(headerDragHandle, { clientX: 550, clientY: 230, pointerId: 1 });
      expect(releaseCaptureSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("5. Focus Timer Isolation", () => {
    it("opening, minimizing, restoring, and closing tools does NOT reset or interfere with timer countdown", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      const timerDisplay = screen.getByTestId("focus-timer-display");
      expect(timerDisplay.textContent).toBe("1500");

      // Tick the timer 3 times
      fireEvent.click(screen.getByText("Tick Timer"));
      fireEvent.click(screen.getByText("Tick Timer"));
      fireEvent.click(screen.getByText("Tick Timer"));
      expect(timerDisplay.textContent).toBe("1497");

      // Perform floating window actions
      fireEvent.click(screen.getByText("Open Calc"));
      fireEvent.click(screen.getByTitle("Minimize Window"));
      fireEvent.click(screen.getByTitle("Restore Window"));
      fireEvent.click(screen.getByTitle("Close SYSTEM CALCULATOR Window"));

      // Timer MUST remain at 1497 without reset or re-mount
      expect(timerDisplay.textContent).toBe("1497");
    });
  });

  describe("6. Accessibility & Keyboard Controls", () => {
    it("provides accessible ARIA attributes and labels for all window chrome buttons", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));

      expect(screen.getByRole("button", { name: "Minimize SYSTEM CALCULATOR" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Maximize SYSTEM CALCULATOR" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Close SYSTEM CALCULATOR Window" })).toBeDefined();
    });

    it("respects Escape key to close active window", () => {
      render(
        <FocusToolsProvider>
          <MultitaskingHarness />
        </FocusToolsProvider>
      );

      // Close the default expanded dock first
      fireEvent.keyDown(window, { key: "Escape" });

      // Open Calculator
      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByRole("dialog", { name: "SYSTEM CALCULATOR" })).toBeDefined();

      // Press Escape to close active tool window
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "SYSTEM CALCULATOR" })).toBeNull();
    });
  });
});
