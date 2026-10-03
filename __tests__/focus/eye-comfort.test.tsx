/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, renderHook, waitFor } from "@testing-library/react";
import { FocusToolsProvider } from "@/app/focus/components/FocusToolsContext";
import FocusToolsDock from "@/app/focus/components/FocusToolsDock";
import {
  useFocusEyeComfort,
  getStoredDim,
  isLightModeActive,
  FOCUS_DIM_STORAGE_KEY,
} from "@/app/focus/hooks/useFocusEyeComfort";

// Mock AcousticsContext (dock depends on it)
vi.mock("@/app/components/AcousticsContext", () => ({
  useAcoustics: () => ({
    tracks: [],
    activeTrack: null,
    isPlaying: false,
    masterVolume: 75,
    layerVolumes: { rain: 20, cafe: 0, keyboard: 0, whitenoise: 0 },
    frequencyData: [],
    playTrack: vi.fn(),
    togglePlay: vi.fn(),
    setMasterVolume: vi.fn(),
    setLayerVolume: vi.fn(),
    playNextTrack: vi.fn(),
    playPreviousTrack: vi.fn(),
  }),
}));

// jsdom does not expose localStorage on the global by default — mirror the
// pattern used by the existing focus tests so storage persistence is testable.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
}
Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

describe("Focus Eye-Comfort Dimming Engine", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.setAttribute("data-mode", "light");
  });

  describe("storage & theme helpers (zero DB IOPS)", () => {
    it("defaults to off when nothing is stored", () => {
      expect(getStoredDim()).toBe(false);
    });

    it("reads the persisted flag", () => {
      localStorage.setItem(FOCUS_DIM_STORAGE_KEY, "1");
      expect(getStoredDim()).toBe(true);
      localStorage.setItem(FOCUS_DIM_STORAGE_KEY, "0");
      expect(getStoredDim()).toBe(false);
    });

    it("resolves light mode from the html data-mode attribute", () => {
      document.documentElement.setAttribute("data-mode", "light");
      expect(isLightModeActive()).toBe(true);
      document.documentElement.setAttribute("data-mode", "dark");
      expect(isLightModeActive()).toBe(false);
    });

    it("falls back to the app_mode preference when data-mode is absent", () => {
      document.documentElement.removeAttribute("data-mode");
      localStorage.setItem("app_mode", "light");
      expect(isLightModeActive()).toBe(true);
      localStorage.setItem("app_mode", "dark");
      expect(isLightModeActive()).toBe(false);
    });
  });

  describe("useFocusEyeComfort", () => {
    it("hydrates dim preference and light-mode gating from storage", () => {
      localStorage.setItem(FOCUS_DIM_STORAGE_KEY, "1");
      const { result } = renderHook(() => useFocusEyeComfort());
      expect(result.current.isDimmed).toBe(true);
      expect(result.current.isLightMode).toBe(true);
      expect(result.current.isDimActive).toBe(true);
    });

    it("persists the toggle to localStorage on click-triggered flip", () => {
      const { result } = renderHook(() => useFocusEyeComfort());
      expect(result.current.isDimActive).toBe(false);

      act(() => result.current.toggleDim());

      expect(result.current.isDimActive).toBe(true);
      expect(localStorage.getItem(FOCUS_DIM_STORAGE_KEY)).toBe("1");

      act(() => result.current.toggleDim());
      expect(result.current.isDimActive).toBe(false);
      expect(localStorage.getItem(FOCUS_DIM_STORAGE_KEY)).toBe("0");
    });

    it("toggles instantly via Shift+D", () => {
      const { result } = renderHook(() => useFocusEyeComfort());
      expect(result.current.isDimActive).toBe(false);

      act(() => {
        fireEvent.keyDown(window, { key: "D", shiftKey: true });
      });

      expect(result.current.isDimActive).toBe(true);
      expect(localStorage.getItem(FOCUS_DIM_STORAGE_KEY)).toBe("1");
    });

    it("toggles instantly via Meta(⌘)+D", () => {
      const { result } = renderHook(() => useFocusEyeComfort());
      act(() => {
        fireEvent.keyDown(window, { key: "d", metaKey: true });
      });
      expect(result.current.isDimActive).toBe(true);
    });

    it("does not hijack typing in inputs", () => {
      render(
        <div>
          <input data-testid="typing-input" />
        </div>
      );
      const { result } = renderHook(() => useFocusEyeComfort());

      const input = screen.getByTestId("typing-input");
      act(() => {
        fireEvent.keyDown(input, { key: "D", shiftKey: true });
      });

      expect(result.current.isDimActive).toBe(false);
    });

    it("auto-deactivates the dim effect when the theme switches to Dark Mode", async () => {
      document.documentElement.setAttribute("data-mode", "light");
      const { result } = renderHook(() => useFocusEyeComfort());

      act(() => result.current.toggleDim());
      expect(result.current.isDimActive).toBe(true);

      // Simulate the theme system flipping html[data-mode] -> dark
      await act(async () => {
        document.documentElement.setAttribute("data-mode", "dark");
        await new Promise((r) => setTimeout(r, 10));
      });

      await waitFor(() => {
        expect(result.current.isLightMode).toBe(false);
      });
      // Preference survives, but the dim effect is gated OFF
      expect(result.current.isDimmed).toBe(true);
      expect(result.current.isDimActive).toBe(false);
    });
  });

  describe("Dock Dim Toggle Button", () => {
    function renderDock(
      dimControl?: {
        isDimActive: boolean;
        isLightMode: boolean;
        onToggleDim: () => void;
      },
      defaultExpanded = true
    ) {
      return render(
        <FocusToolsProvider>
          <FocusToolsDock dimControl={dimControl} defaultExpanded={defaultExpanded} />
        </FocusToolsProvider>
      );
    }

    it("renders DIM: OFF and toggles on click", () => {
      const onToggleDim = vi.fn();
      renderDock({ isDimActive: false, isLightMode: true, onToggleDim });

      const button = screen.getByRole("button", { name: /dim screen off/i });
      expect(button).toHaveTextContent("DIM: OFF");

      fireEvent.click(button);
      expect(onToggleDim).toHaveBeenCalledTimes(1);
    });

    it("renders the active cyan state as DIM: ON", () => {
      const onToggleDim = vi.fn();
      renderDock({ isDimActive: true, isLightMode: true, onToggleDim });

      const button = screen.getByRole("button", { name: /dim screen on/i });
      expect(button).toHaveTextContent("DIM: ON");
      expect(button.getAttribute("aria-pressed")).toBe("true");
    });

    it("is disabled in Dark Mode with an explanatory tooltip", () => {
      const onToggleDim = vi.fn();
      renderDock({ isDimActive: false, isLightMode: false, onToggleDim });

      const button = screen.getByRole("button", { name: /dim screen off/i });
      expect(button).toBeDisabled();
      expect(button.getAttribute("title")).toBe("Only active in Light Mode");

      fireEvent.click(button);
      expect(onToggleDim).not.toHaveBeenCalled();
    });

    it("hides the dim control entirely when no control props are passed", () => {
      renderDock();
      expect(screen.queryByRole("button", { name: /dim screen (on|off)/i })).toBeNull();
    });
  });
});
