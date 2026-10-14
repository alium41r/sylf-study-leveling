/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { FocusToolsProvider, useFocusTools } from "@/app/focus/components/FocusToolsContext";
import FocusToolsDock from "@/app/focus/components/FocusToolsDock";
import FocusToolWindow from "@/app/focus/components/FocusToolWindow";
import CalculatorTool, { evaluateMathExpression } from "@/app/focus/components/tools/CalculatorTool";
import FormulasTool from "@/app/focus/components/tools/FormulasTool";
import ScratchpadTool from "@/app/focus/components/tools/ScratchpadTool";
import AiAssistantTool from "@/app/focus/components/tools/AiAssistantTool";
import AudioMixerTool from "@/app/focus/components/tools/AudioMixerTool";
import { CustomAudioContext, CustomAudioContextType } from "@/app/components/CustomAudioContext";

// Mock AcousticsContext
vi.mock("@/app/components/AcousticsContext", () => ({
  useAcoustics: () => ({
    tracks: [
      { id: 1, title: "Forest Wind & Leaves", category: "NATURE", frequency: "Organic Wind" },
      { id: 2, title: "Ocean Waves & Surf", category: "NATURE", frequency: "0.1Hz Swell" },
      { id: 3, title: "Running Mountain Stream", category: "NATURE", frequency: "Flowing Water" },
      { id: 11, title: "City Rain & Ambience", category: "AMBIENT", frequency: "Urban Rain Field" },
      { id: 12, title: "Studio White Noise", category: "NOISE", frequency: "Broadband Spectrum" },
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

// Helper test component to inspect context
function TestConsumer() {
  const {
    activeTool,
    openTools,
    isMultiToolMode,
    toggleMultiToolMode,
    openTool,
    closeTool,
    windowMode,
    setWindowMode,
    dockAnchor,
    setDockAnchor,
  } = useFocusTools();
  return (
    <div>
      <span data-testid="active-tool">{activeTool || "none"}</span>
      <span data-testid="open-tools">{openTools.join(",") || "empty"}</span>
      <span data-testid="multi-mode">{String(isMultiToolMode)}</span>
      <span data-testid="window-mode">{windowMode}</span>
      <span data-testid="dock-anchor">{dockAnchor}</span>
      <button onClick={() => openTool("calculator")}>Open Calc</button>
      <button onClick={() => openTool("ai")}>Open AI</button>
      <button onClick={() => openTool("notes")}>Open Notes</button>
      <button onClick={() => closeTool("calculator")}>Close Calc</button>
      <button onClick={() => closeTool()}>Close Tool</button>
      <button onClick={toggleMultiToolMode}>Toggle Multi</button>
      <button onClick={() => setWindowMode("minimized")}>Minimize</button>
      <button onClick={() => setDockAnchor("bottom-left")}>Snap Left</button>
    </div>
  );
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
}
Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

describe("Focus Tools Dock & Expandable Window System", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const strUrl = String(url);
      if (strUrl.includes("/api/chats")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sessions: [
              {
                id: 1,
                title: "Kinematics Questions",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 2,
                title: "Optics Formulas",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      if (strUrl.includes("/api/system-messages")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [
              {
                id: 101,
                type: "USER",
                content: "What is Snell's Law?",
                createdAt: new Date().toISOString(),
              },
              {
                id: 102,
                type: "INFO",
                content: "Snell's law states $n_1\\sin\\theta_1 = n_2\\sin\\theta_2$.",
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    }) as any;
  });

  describe("FocusToolsContext & State Management", () => {
    it("manages tool opening, closing, and mode changes correctly", () => {
      render(
        <FocusToolsProvider subjectName="Physics 101" questTitle="Quantum Mechanics">
          <TestConsumer />
        </FocusToolsProvider>
      );

      expect(screen.getByTestId("active-tool").textContent).toBe("none");

      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByTestId("active-tool").textContent).toBe("calculator");

      fireEvent.click(screen.getByText("Open AI"));
      expect(screen.getByTestId("active-tool").textContent).toBe("ai");

      fireEvent.click(screen.getByText("Minimize"));
      expect(screen.getByTestId("window-mode").textContent).toBe("minimized");

      fireEvent.click(screen.getByText("Snap Left"));
      expect(screen.getByTestId("dock-anchor").textContent).toBe("bottom-left");

      fireEvent.click(screen.getByText("Close Tool"));
      expect(screen.getByTestId("active-tool").textContent).toBe("none");
    });

    it("handles keyboard shortcut Escape to close active tool", () => {
      render(
        <FocusToolsProvider>
          <TestConsumer />
        </FocusToolsProvider>
      );

      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByTestId("active-tool").textContent).toBe("calculator");

      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      expect(screen.getByTestId("active-tool").textContent).toBe("none");
    });

    it("handles multi-tool mode, multiple open tools, and closing individual tools", () => {
      render(
        <FocusToolsProvider>
          <TestConsumer />
        </FocusToolsProvider>
      );

      expect(screen.getByTestId("multi-mode").textContent).toBe("false");
      expect(screen.getByTestId("open-tools").textContent).toBe("empty");

      // Enable multi mode
      fireEvent.click(screen.getByText("Toggle Multi"));
      expect(screen.getByTestId("multi-mode").textContent).toBe("true");

      // Open Calc and Notes
      fireEvent.click(screen.getByText("Open Calc"));
      fireEvent.click(screen.getByText("Open Notes"));
      expect(screen.getByTestId("open-tools").textContent).toBe("calculator,notes");
      expect(screen.getByTestId("active-tool").textContent).toBe("notes");

      // Close Calc
      fireEvent.click(screen.getByText("Close Calc"));
      expect(screen.getByTestId("open-tools").textContent).toBe("notes");
      expect(screen.getByTestId("active-tool").textContent).toBe("notes");

      // Open Calc again
      fireEvent.click(screen.getByText("Open Calc"));
      expect(screen.getByTestId("open-tools").textContent).toBe("notes,calculator");
      expect(screen.getByTestId("active-tool").textContent).toBe("calculator");

      // Turn off multi mode -> only active tool (calculator) remains
      fireEvent.click(screen.getByText("Toggle Multi"));
      expect(screen.getByTestId("multi-mode").textContent).toBe("false");
      expect(screen.getByTestId("open-tools").textContent).toBe("calculator");
    });
  });

  describe("FocusToolsDock Component", () => {
    it("renders the compact collapsed trigger pill and expands directly into the tools grid on first click", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock />
        </FocusToolsProvider>
      );

      // Collapsed state: trigger pill is rendered
      const dockButton = screen.getByTitle(/Toggle Study Utilities Dock/i);
      expect(dockButton).toBeDefined();
      expect(dockButton.getAttribute("aria-expanded")).toBe("false");

      // In collapsed state, tools grid is not in the DOM
      expect(screen.queryByLabelText("Calculator")).toBeNull();

      // First click immediately reveals the tools grid
      fireEvent.click(dockButton);
      expect(dockButton.getAttribute("aria-expanded")).toBe("true");

      // Verify all tool launcher tiles appear immediately on first click
      expect(screen.getByLabelText("Calculator")).toBeDefined();
      expect(screen.getByLabelText("Sylvie")).toBeDefined();
      expect(screen.getByLabelText("Audio Mixer")).toBeDefined();
      expect(screen.getByLabelText("Scratchpad")).toBeDefined();
      expect(screen.getByLabelText("Formulas")).toBeDefined();
    });

    it("launches the calculator tool when its icon is clicked in dock", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Expand dock on first click
      fireEvent.click(screen.getByTitle(/Toggle Study Utilities Dock/i));

      // Click Calculator icon
      fireEvent.click(screen.getByLabelText("Calculator"));

      // Verify Calculator window appears
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
    });

    it("allows hiding session controls via the hide button and restores it via unhide trigger", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
        </FocusToolsProvider>
      );

      // Initially session controls are visible with Hide Toolbar button
      const hideButton = screen.getByTitle(/Hide Toolbar \(Alt\+H\)/i);
      expect(hideButton).toBeDefined();
      expect(screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i })).toBeDefined();

      // Click hide
      fireEvent.click(hideButton);

      // Multi-Tool button in session controls is now hidden
      expect(screen.queryByRole("button", { name: /Toggle Multi-Tool Mode/i })).toBeNull();

      // Tools grid is STILL visible!
      expect(screen.getByLabelText("Calculator")).toBeDefined();

      // Reveal button appears
      const showButton = screen.getByTitle(/Show Study Tools Toolbar/i);
      expect(showButton).toBeDefined();

      // Click reveal button to restore session controls
      fireEvent.click(showButton);

      // Session controls row is back
      expect(screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i })).toBeDefined();
      expect(screen.getByTitle(/Hide Toolbar \(Alt\+H\)/i)).toBeDefined();
    });

    it("toggles session controls visibility via Alt+H shortcut", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
        </FocusToolsProvider>
      );

      // Full session controls row is visible
      expect(screen.getByTitle(/Hide Toolbar \(Alt\+H\)/i)).toBeDefined();

      // Press Alt+H
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", altKey: true }));
      });

      // Now session controls are hidden and show trigger is visible
      expect(screen.getByTitle(/Show Study Tools Toolbar/i)).toBeDefined();
      expect(screen.queryByTitle(/Hide Toolbar \(Alt\+H\)/i)).toBeNull();

      // Press Alt+H again to restore
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", altKey: true }));
      });

      // Full session controls row is back
      expect(screen.getByTitle(/Hide Toolbar \(Alt\+H\)/i)).toBeDefined();
    });

    it("restores saved hidden preference from localStorage on mount", () => {
      localStorage.setItem("focus_toolbar_hidden", "true");

      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
        </FocusToolsProvider>
      );

      // Minimal mode: show trigger is immediately shown because session controls were saved as hidden
      expect(screen.getByTitle(/Show Study Tools Toolbar/i)).toBeDefined();
      expect(screen.queryByTitle(/Hide Toolbar \(Alt\+H\)/i)).toBeNull();
      // Tools grid remains available
      expect(screen.getByLabelText("Calculator")).toBeDefined();
    });

    it("closes the Tool Island panel when Escape key is pressed", async () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock />
        </FocusToolsProvider>
      );

      const dockButton = screen.getByTitle(/Toggle Study Utilities Dock/i);
      fireEvent.click(dockButton);
      expect(screen.getByLabelText("Calculator")).toBeDefined();
      expect(dockButton.getAttribute("aria-expanded")).toBe("true");

      // Press Escape
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      expect(dockButton.getAttribute("aria-expanded")).toBe("false");
      await waitFor(() => {
        expect(screen.queryByLabelText("Calculator")).toBeNull();
      });
    });

    it("closes the Tool Island when clicking outside the panel", async () => {
      render(
        <div>
          <div data-testid="outside-area">Outside Area</div>
          <FocusToolsProvider>
            <FocusToolsDock />
          </FocusToolsProvider>
        </div>
      );

      const dockButton = screen.getByTitle(/Toggle Study Utilities Dock/i);
      fireEvent.click(dockButton);
      expect(screen.getByLabelText("Calculator")).toBeDefined();
      expect(dockButton.getAttribute("aria-expanded")).toBe("true");

      // Click outside
      act(() => {
        fireEvent.mouseDown(screen.getByTestId("outside-area"));
      });

      expect(dockButton.getAttribute("aria-expanded")).toBe("false");
      await waitFor(() => {
        expect(screen.queryByLabelText("Calculator")).toBeNull();
      });
    });
  });

  describe("Multi-Tool Mode & Concurrent Containers", () => {
    it("toggles multi-tool mode via dock button and hotkey Alt+U", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
        </FocusToolsProvider>
      );

      // Desktop Multi-Tool button initially shows MULTI: OFF
      const multiButton = screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i });
      expect(multiButton.textContent).toContain("MULTI: OFF");

      // Click to toggle
      fireEvent.click(multiButton);
      expect(multiButton.textContent).toContain("MULTI: ON");

      // Press Alt+U to toggle back to OFF
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "u", altKey: true }));
      });
      expect(multiButton.textContent).toContain("MULTI: OFF");

      // Press Alt+U again to toggle ON
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "u", altKey: true }));
      });
      expect(multiButton.textContent).toContain("MULTI: ON");
    });

    it("opens multiple tool windows simultaneously when multi-tool mode is enabled", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Turn on multi-tool mode
      const multiButton = screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i });
      fireEvent.click(multiButton);

      // Open Calculator
      fireEvent.click(screen.getByLabelText("Calculator"));
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();

      // Open Scratchpad (notes)
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      // Both windows should be mounted simultaneously!
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();
    });

    it("closes individual tool window leaving the other open", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Enable multi-tool mode
      fireEvent.click(screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i }));

      // Open Calculator + Scratchpad
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Click close button on Calculator window
      const closeCalcButton = screen.getByTitle("Close SYSTEM CALCULATOR Window");
      act(() => {
        fireEvent.click(closeCalcButton);
      });

      // Calculator should be closed, Scratchpad remains open
      expect(screen.queryByText("SYSTEM CALCULATOR")).toBeNull();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();
    });

    it("minimizes and restores individual tool window independently", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Enable multi-tool mode
      fireEvent.click(screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i }));

      // Open Calculator and Scratchpad
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      // Find minimize buttons
      const minimizeButtons = screen.getAllByTitle("Minimize Window");
      expect(minimizeButtons.length).toBe(2);

      // Minimize the first window
      fireEvent.click(minimizeButtons[0]);

      // Should now have 1 restore button and 1 minimize button
      expect(screen.getByTitle("Restore Window")).toBeDefined();
      expect(screen.getAllByTitle("Minimize Window").length).toBe(1);

      // Restore it back
      fireEvent.click(screen.getByTitle("Restore Window"));
      expect(screen.getAllByTitle("Minimize Window").length).toBe(2);
    });

    it("retains only the active tool when multi-tool mode is turned off", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Turn on multi mode
      const multiButton = screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i });
      fireEvent.click(multiButton);

      // Open Calculator then Scratchpad (Scratchpad is active)
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Turn off multi-tool mode
      act(() => {
        fireEvent.click(multiButton);
      });

      // Only the active tool (Scratchpad) should remain
      expect(screen.queryByText("SYSTEM CALCULATOR")).toBeNull();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();
    });

    it("limits concurrent open tool containers to 2 and replaces oldest inactive tool when a third is opened", () => {
      // Simulate standard laptop viewport (1024px)
      window.innerWidth = 1024;
      window.dispatchEvent(new Event("resize"));

      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Turn on multi mode
      const multiButton = screen.getByRole("button", { name: /Toggle Multi-Tool Mode/i });
      fireEvent.click(multiButton);

      // Open Tool 1: Calculator
      fireEvent.click(screen.getByLabelText("Calculator"));
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();

      // Open Tool 2: Scratchpad (now 2 tools open)
      fireEvent.click(screen.getByLabelText("Scratchpad"));
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();

      // Open Tool 3: Sylvie (exceeds limit 2 -> oldest inactive tool Calculator should be replaced)
      act(() => {
        fireEvent.click(screen.getByLabelText("Sylvie"));
      });

      // Max 2 containers: Calculator closed, Scratchpad and Sylvie open!
      expect(screen.queryByText("SYSTEM CALCULATOR")).toBeNull();
      expect(screen.getByText("FOCUS SCRATCHPAD")).toBeDefined();
      expect(screen.getByText("SYLVIE")).toBeDefined();
    });

    it("ensures there is only 1 multi-tool mode button rendered without duplicates in window headers", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock defaultExpanded={true} />
          <FocusToolWindow />
        </FocusToolsProvider>
      );

      // Enable multi mode and open two tools
      const multiButtonsBefore = screen.getAllByRole("button", { name: /Toggle Multi-Tool Mode/i });
      expect(multiButtonsBefore.length).toBe(1);

      fireEvent.click(multiButtonsBefore[0]);
      fireEvent.click(screen.getByLabelText("Calculator"));
      fireEvent.click(screen.getByLabelText("Scratchpad"));

      // With 2 windows open, there should STILL be only 1 multi-tool toggle button on the screen!
      const multiButtonsAfter = screen.getAllByRole("button", { name: /Toggle Multi-Tool Mode/i });
      expect(multiButtonsAfter.length).toBe(1);
    });

    it("renders and toggles multi-tool mode in mobile drawer sheet", () => {
      // Simulate mobile viewport
      window.innerWidth = 400;
      window.dispatchEvent(new Event("resize"));

      render(
        <FocusToolsProvider>
          <FocusToolsDock />
        </FocusToolsProvider>
      );

      // Open mobile sheet
      fireEvent.click(screen.getByTitle(/Toggle Study Utilities Dock/i));

      // Verify Multi-Tool Windows label and button exist
      expect(screen.getByText("Multi-Tool Windows")).toBeDefined();
      const mobileMultiBtn = screen.getByRole("button", { name: /MULTI: OFF/i });
      expect(mobileMultiBtn).toBeDefined();

      // Toggle multi-tool mode in mobile drawer
      fireEvent.click(mobileMultiBtn);
      expect(screen.getByRole("button", { name: /MULTI: ON/i })).toBeDefined();
    });
  });

  describe("CalculatorTool Component & Math Engine", () => {
    it("evaluates mathematical expressions with correct operator precedence and advanced math", () => {
      const basic = evaluateMathExpression("12 + 4 * 2");
      expect(basic.result).toBe("20");

      const trig = evaluateMathExpression("sin(30)", "DEG");
      expect(parseFloat(trig.result)).toBeCloseTo(0.5, 4);

      const factorialRes = evaluateMathExpression("5!");
      expect(factorialRes.result).toBe("120");

      const power = evaluateMathExpression("2 ^ 8");
      expect(power.result).toBe("256");

      const sqrtRes = evaluateMathExpression("sqrt(144)");
      expect(sqrtRes.result).toBe("12");

      const implicitMult = evaluateMathExpression("2(3+4)");
      expect(implicitMult.result).toBe("14");

      const nPrRes = evaluateMathExpression("5 nPr 2");
      expect(nPrRes.result).toBe("20");

      const divRes = evaluateMathExpression("4 ÷ 6");
      expect(divRes.result).toBe("0.666666666667");

      const parenthesizedFact = evaluateMathExpression("(3+2)!");
      expect(parenthesizedFact.result).toBe("120");

      const modRes = evaluateMathExpression("17 mod 5");
      expect(modRes.result).toBe("2");
    });

    it("performs basic addition and handles operations in keypad", () => {
      render(<CalculatorTool />);

      // Click 7 + 8 =
      fireEvent.click(screen.getByRole("button", { name: "7" }));
      fireEvent.click(screen.getByRole("button", { name: "+" }));
      fireEvent.click(screen.getByRole("button", { name: "8" }));
      fireEvent.click(screen.getByRole("button", { name: "=" }));

      // Display should show 15
      expect(screen.getByTestId("calc-display").textContent).toBe("15");
    });

    it("renders upper deck STEM functions and toggles 2nd inverse functions", () => {
      render(<CalculatorTool />);

      // Verify upper deck scientific functions appear
      expect(screen.getByRole("button", { name: "sin" })).toBeDefined();
      expect(screen.getByRole("button", { name: "cos" })).toBeDefined();
      expect(screen.getByRole("button", { name: "n!" })).toBeDefined();
      expect(screen.getByRole("button", { name: "DEG" })).toBeDefined();

      // Click 2nd toggle
      const secondBtn = screen.getByRole("button", { name: "2nd" });
      fireEvent.click(secondBtn);

      // Verify inverse functions appear
      expect(screen.getByRole("button", { name: "sin⁻¹" })).toBeDefined();
      expect(screen.getByRole("button", { name: "cos⁻¹" })).toBeDefined();
      expect(screen.getByRole("button", { name: "nPr" })).toBeDefined();
    });

    it("prevents multiple decimals in a single number", () => {
      render(<CalculatorTool />);

      const dotButton = screen.getByRole("button", { name: "." });
      fireEvent.click(dotButton);
      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(dotButton);

      // Expression should have 0.5 not 0.5.
      expect(screen.getByTestId("calc-display").textContent).toBe("0.5");
    });

    it("clears display on AC button click", () => {
      render(<CalculatorTool />);

      fireEvent.click(screen.getByRole("button", { name: "9" }));
      expect(screen.getByTestId("calc-display").textContent).toBe("9");

      fireEvent.click(screen.getByRole("button", { name: "AC" }));
      expect(screen.getByTestId("calc-display").textContent).toBe("0");
    });
  });

  describe("FormulasTool Component", () => {
    it("renders formula cards and filters by search query", () => {
      render(<FormulasTool />);

      // Check default database items
      expect(screen.getByText("Newton's Second Law of Motion")).toBeDefined();
      expect(screen.getByText("Speed of Light in Vacuum (c)")).toBeDefined();

      // Search for "Ohm"
      const searchInput = screen.getByPlaceholderText(/Search 60\+ formulas/i);
      fireEvent.change(searchInput, { target: { value: "Ohm" } });

      expect(screen.getByText("Ohm's Law & Electrical Power")).toBeDefined();
      expect(screen.queryByText("Speed of Light in Vacuum (c)")).toBeNull();

      // Search for "mc delta t"
      fireEvent.change(searchInput, { target: { value: "mc delta t" } });
      expect(screen.getByText("Specific Heat Capacity")).toBeDefined();
    }, 15000);

    it("filters formulas by subject and grade level", () => {
      render(<FormulasTool />);

      // Filter by Physics
      const physicsPill = screen.getByRole("button", { name: /Physics/i });
      fireEvent.click(physicsPill);

      expect(screen.getByText("Newton's Second Law of Motion")).toBeDefined();
      expect(screen.queryByText("Quadratic Formula")).toBeNull();

      // Select Grade Level: Middle School
      const gradeSelect = screen.getByRole("combobox");
      fireEvent.change(gradeSelect, { target: { value: "Middle School" } });

      expect(screen.getByText("Ohm's Law & Electrical Power")).toBeDefined();
      expect(screen.queryByText("Maxwell's Equations of Electrodynamics")).toBeNull();
    }, 15000);

    it("displays AI dynamic fallback card on empty search and allows generation", async () => {
      render(<FormulasTool />);

      const searchInput = screen.getByPlaceholderText(/Search 60\+ formulas/i);
      fireEvent.change(searchInput, { target: { value: "Navier Stokes Turbulence" } });

      expect(screen.getByText(/No local formulas found for/i)).toBeDefined();
      const generateBtn = screen.getByRole("button", { name: /Generate with AI/i });
      expect(generateBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(generateBtn);
      });

      // Fallback synthesis generates formula
      expect(screen.getAllByText(/Navier Stokes Turbulence/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("ScratchpadTool Component", () => {
    it("updates character/word metrics and switches between edit and preview", () => {
      render(
        <FocusToolsProvider subjectName="Mathematics">
          <ScratchpadTool />
        </FocusToolsProvider>
      );

      const textarea = screen.getByPlaceholderText(/Jot down quick thoughts/i);
      fireEvent.change(textarea, { target: { value: "Linear Algebra Vectors and Matrices" } });

      expect(screen.getByText(/5 words/i)).toBeDefined();

      // Switch to preview mode
      const previewButton = screen.getByTitle(/Preview Rendered Markdown/i);
      fireEvent.click(previewButton);

      expect(screen.getByText(/Linear Algebra Vectors and Matrices/i)).toBeDefined();
    });

    it("supports creating new drafts and switching between drafts", () => {
      render(
        <FocusToolsProvider subjectName="Mathematics">
          <ScratchpadTool />
        </FocusToolsProvider>
      );

      // Create new draft
      const newDraftBtn = screen.getByTitle(/Create Blank Scratchpad Draft/i);
      fireEvent.click(newDraftBtn);

      expect(screen.getByRole("combobox")).toBeDefined();
      expect(screen.getByText(/Draft 2/i)).toBeDefined();
    });

    it("provides Google Docs-style formatting ribbon buttons and inserts markdown snippets", () => {
      render(
        <FocusToolsProvider subjectName="Physics">
          <ScratchpadTool />
        </FocusToolsProvider>
      );

      const textarea = screen.getByPlaceholderText(/Jot down quick thoughts/i) as HTMLTextAreaElement;

      // Formatting ribbon buttons
      const boldBtn = screen.getByTitle(/Bold \(Ctrl\+B\)/i);
      const h1Btn = screen.getByTitle(/Heading 1 \(#\)/i);
      const bulletListBtn = screen.getByTitle(/Bullet List \(-\)/i);
      const latexBtn = screen.getByTitle(/LaTeX Math Equation/i);
      const undoBtn = screen.getByTitle(/Undo \(Ctrl\+Z\)/i);

      expect(boldBtn).toBeDefined();
      expect(h1Btn).toBeDefined();
      expect(bulletListBtn).toBeDefined();
      expect(latexBtn).toBeDefined();
      expect(undoBtn).toBeDefined();

      // Click bold
      fireEvent.click(boldBtn);
      expect(textarea.value).toContain("**bold**");

      // Test Undo
      fireEvent.click(undoBtn);
      expect(textarea.value).toBe("");
    });
  });

  describe("AiAssistantTool Component", () => {
    it("renders academic context and streamlined greeting", async () => {
      await act(async () => {
        render(
          <FocusToolsProvider subjectName="Organic Chemistry" questTitle="Reaction Mechanisms">
            <AiAssistantTool />
          </FocusToolsProvider>
        );
      });

      // Verify subject context in header ribbon
      expect(screen.getAllByText(/Organic Chemistry/i).length).toBeGreaterThanOrEqual(1);

      // Verify streamlined greeting
      expect(screen.getByText(/Greetings, Scholar. I'm ready to assist with your active subject/i)).toBeDefined();
    });

    it("allows typing queries and provides reset functionality", async () => {
      await act(async () => {
        render(
          <FocusToolsProvider subjectName="Physics">
            <AiAssistantTool />
          </FocusToolsProvider>
        );
      });

      const input = screen.getByPlaceholderText(/Ask Sylvie/i) as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: "Explain Snell's law" } });
      expect(input.value).toBe("Explain Snell's law");

      const resetButton = screen.getByTitle(/Reset Active Chat/i);
      fireEvent.click(resetButton);

      expect(screen.getByText(/Greetings, Scholar. I'm ready to assist with your active subject/i)).toBeDefined();
    });

    it("renders conversation history switcher, toggles drawer, and loads session", async () => {
      await act(async () => {
        render(
          <FocusToolsProvider subjectName="Physics">
            <AiAssistantTool />
          </FocusToolsProvider>
        );
      });

      expect(screen.getByTitle(/Start New Chat Session/i)).toBeDefined();

      const historyBtn = screen.getByTitle(/View All Past Conversations/i);
      expect(historyBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(historyBtn);
      });

      expect(screen.getByText(/Conversation History/i)).toBeDefined();
      expect(screen.getByText(/Start Blank Chat Session/i)).toBeDefined();

      // Verify sessions rendered in drawer
      expect(screen.getByText("Kinematics Questions")).toBeDefined();

      // Click session to load history
      await act(async () => {
        fireEvent.click(screen.getByText("Kinematics Questions"));
      });

      // Verify loaded message from session
      expect(screen.getByText("What is Snell's Law?")).toBeDefined();
    });
  });

  describe("AudioMixerTool Component", () => {
    it("renders Now Playing card and locker soundscapes library", () => {
      render(
        <FocusToolsProvider>
          <AudioMixerTool />
        </FocusToolsProvider>
      );

      // Now Playing controls
      expect(screen.getByTitle(/Play Audio/i)).toBeDefined();
      expect(screen.getByTitle(/Previous Track/i)).toBeDefined();
      expect(screen.getByTitle(/Next Track/i)).toBeDefined();

      // Locker Soundscape tracks
      expect(screen.getAllByText(/Forest Wind & Leaves/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Ocean Waves & Surf/i)).toBeDefined();
      expect(screen.getByText(/Running Mountain Stream/i)).toBeDefined();
    });

    it("renders category filter buttons and filters soundscape tracks", () => {
      render(
        <FocusToolsProvider>
          <AudioMixerTool />
        </FocusToolsProvider>
      );

      // Verify category buttons
      expect(screen.getByRole("button", { name: /Category filter: ALL/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Category filter: NATURE/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Category filter: AMBIENT/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Category filter: NOISE/i })).toBeDefined();

      // Click NOISE filter
      const noiseBtn = screen.getByRole("button", { name: /Category filter: NOISE/i });
      fireEvent.click(noiseBtn);

      // Verify noise tracks are displayed and nature tracks are filtered
      expect(screen.getByText(/Studio White Noise/i)).toBeDefined();
      expect(screen.queryByText(/Ocean Waves & Surf/i)).toBeNull();
    });

    it("switches to Ambient Mixer mode and displays independent channels", () => {
      render(
        <FocusToolsProvider>
          <AudioMixerTool />
        </FocusToolsProvider>
      );

      // Switch to Ambient Mixer
      const layersTab = screen.getByRole("button", { name: /Ambient Mixer/i });
      fireEvent.click(layersTab);

      // Ambient channel labels
      expect(screen.getByText(/Rain & Thunder/i)).toBeDefined();
      expect(screen.getByText(/Cafe Atmosphere/i)).toBeDefined();
      expect(screen.getByText(/Mechanical Keystrokes/i)).toBeDefined();
      expect(screen.getByText(/Deep Brown Noise/i)).toBeDefined();
      expect(screen.getByText(/White Noise/i)).toBeDefined();
    });

    it("renders Custom Audio tab, switches view, and shows empty state with import button", () => {
      render(
        <FocusToolsProvider>
          <AudioMixerTool />
        </FocusToolsProvider>
      );

      // Verify Custom Audio tab exists
      const customTab = screen.getByRole("button", { name: /^Custom Audio/i });
      expect(customTab).toBeDefined();

      // Switch to Custom Audio tab
      fireEvent.click(customTab);

      // Verify empty state and import button
      expect(screen.getByText(/No Local Audio Added Yet/i)).toBeDefined();
      expect(screen.getByText(/Local Audio Files \(0\)/i)).toBeDefined();
      expect(screen.getAllByRole("button", { name: /Import Audio/i }).length).toBeGreaterThanOrEqual(1);
    });

    it("switches to Custom Audio view when clicking CUSTOM category filter under soundscapes", () => {
      render(
        <FocusToolsProvider>
          <AudioMixerTool />
        </FocusToolsProvider>
      );

      // Find and click CUSTOM filter button
      const customPill = screen.getByRole("button", { name: /Category filter: CUSTOM/i });
      expect(customPill).toBeDefined();
      fireEvent.click(customPill);

      // View should have switched to Custom Audio view
      expect(screen.getByText(/No Local Audio Added Yet/i)).toBeDefined();
      expect(screen.getByText(/Local Audio Files \(0\)/i)).toBeDefined();
    });

    it("renders imported custom audio tracks, format badge, and active state when library is populated", () => {
      const mockCustomContext: CustomAudioContextType = {
        library: [
          {
            id: "study-lofi-1",
            title: "Lofi Rain Beats",
            originalFilename: "lofi-rain.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 3145728, // ~3 MB
            duration: 180, // 3 mins
            dateAdded: "2026-09-24T00:00:00.000Z",
          },
        ],
        activeTrackId: "study-lofi-1",
        activeEntry: {
          id: "study-lofi-1",
          title: "Lofi Rain Beats",
          originalFilename: "lofi-rain.mp3",
          mimeType: "audio/mpeg",
          sizeBytes: 3145728,
          duration: 180,
          dateAdded: "2026-09-24T00:00:00.000Z",
        },
        isPlaying: true,
        duration: 180,
        volume: 75,
        loop: false,
        isLoading: false,
        error: null,
        importFile: vi.fn(),
        playTrack: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        togglePlay: vi.fn(),
        setActiveTrackId: vi.fn(),
        playNextTrack: vi.fn(),
        playPreviousTrack: vi.fn(),
        seek: vi.fn(),
        restart: vi.fn(),
        setVolume: vi.fn(),
        toggleMute: vi.fn(),
        toggleLoop: vi.fn(),
        renameTrack: vi.fn(),
        removeTrack: vi.fn(),
        refreshLibrary: vi.fn(),
        subscribeToTime: () => () => {},
        getCurrentTime: () => 45,
      };

      render(
        <CustomAudioContext.Provider value={mockCustomContext}>
          <FocusToolsProvider>
            <AudioMixerTool />
          </FocusToolsProvider>
        </CustomAudioContext.Provider>
      );

      // Active custom track should be displayed in the top Now Playing deck
      expect(screen.getByText("Lofi Rain Beats")).toBeDefined();
      expect(screen.getByText(/MP3/i)).toBeDefined();
      expect(screen.getByTitle("Pause Custom Audio")).toBeDefined();

      // Switch to Custom Audio view
      const customTab = screen.getByRole("button", { name: /^Custom Audio/i });
      fireEvent.click(customTab);

      // Track item should be listed in the library
      expect(screen.getByText("Local Audio Files (1)")).toBeDefined();
      expect(screen.getAllByText("Lofi Rain Beats").length).toBeGreaterThanOrEqual(1);
    });
  });
});

