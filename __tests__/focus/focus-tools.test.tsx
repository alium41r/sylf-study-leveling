/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FocusToolsProvider, useFocusTools } from "@/app/focus/components/FocusToolsContext";
import FocusToolsDock from "@/app/focus/components/FocusToolsDock";
import FocusToolWindow from "@/app/focus/components/FocusToolWindow";
import CalculatorTool, { evaluateMathExpression } from "@/app/focus/components/tools/CalculatorTool";
import FormulasTool from "@/app/focus/components/tools/FormulasTool";
import ScratchpadTool from "@/app/focus/components/tools/ScratchpadTool";
import AiAssistantTool from "@/app/focus/components/tools/AiAssistantTool";
import AudioMixerTool from "@/app/focus/components/tools/AudioMixerTool";

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
  const { activeTool, openTool, closeTool, windowMode, setWindowMode, dockAnchor, setDockAnchor } = useFocusTools();
  return (
    <div>
      <span data-testid="active-tool">{activeTool || "none"}</span>
      <span data-testid="window-mode">{windowMode}</span>
      <span data-testid="dock-anchor">{dockAnchor}</span>
      <button onClick={() => openTool("calculator")}>Open Calc</button>
      <button onClick={() => openTool("ai")}>Open AI</button>
      <button onClick={closeTool}>Close Tool</button>
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
  });

  describe("FocusToolsDock Component", () => {
    it("renders the trigger pill and expands on click", () => {
      render(
        <FocusToolsProvider>
          <FocusToolsDock />
        </FocusToolsProvider>
      );

      const dockButton = screen.getByTitle(/Toggle Study Utilities Dock/i);
      expect(dockButton).toBeDefined();

      // Click to expand dock
      fireEvent.click(dockButton);

      // Verify all tool launcher icons appear
      expect(screen.getByLabelText("Calculator")).toBeDefined();
      expect(screen.getByLabelText("AI Assistant")).toBeDefined();
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

      // Expand dock
      fireEvent.click(screen.getByTitle(/Toggle Study Utilities Dock/i));

      // Click Calculator icon
      fireEvent.click(screen.getByLabelText("Calculator"));

      // Verify Calculator window appears
      expect(screen.getByText("SYSTEM CALCULATOR")).toBeDefined();
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

      const nCrRes = evaluateMathExpression("5 nCr 2");
      expect(nCrRes.result).toBe("10");
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

      const input = screen.getByPlaceholderText(/Ask AI/i) as HTMLTextAreaElement;
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
  });
});
