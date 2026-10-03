import { describe, it, expect } from "vitest";
import {
  VALID_TIMER_POSITIONS,
  DEFAULT_TIMER_POSITION,
  isValidTimerPosition,
  normalizeTimerPosition,
  resolveEffectiveTimerPosition,
  TIMER_POSITION_REGISTRY,
  normalizeLayoutKey,
  isValidLayoutKey,
  DEFAULT_LAYOUT_KEY,
} from "@/lib/focus-background-types";

describe("Phase 3A: Focus Background Timer Position & Layout System", () => {
  describe("1. Timer Position Validation & Safety Registry", () => {
    it("contains exactly the allowed registry: auto, left, right, center", () => {
      expect(VALID_TIMER_POSITIONS).toEqual(["auto", "left", "right", "center"]);
      expect(DEFAULT_TIMER_POSITION).toBe("auto");
    });

    it("correctly identifies valid and invalid timer positions", () => {
      expect(isValidTimerPosition("auto")).toBe(true);
      expect(isValidTimerPosition("left")).toBe(true);
      expect(isValidTimerPosition("right")).toBe(true);
      expect(isValidTimerPosition("center")).toBe(true);

      expect(isValidTimerPosition("top")).toBe(false);
      expect(isValidTimerPosition("bottom")).toBe(false);
      expect(isValidTimerPosition("")).toBe(false);
      expect(isValidTimerPosition(null)).toBe(false);
      expect(isValidTimerPosition(undefined)).toBe(false);
      expect(isValidTimerPosition(123)).toBe(false);
      expect(isValidTimerPosition("LEFT")).toBe(false);
    });

    it("safely normalizes unknown or corrupted positions to auto", () => {
      expect(normalizeTimerPosition("auto")).toBe("auto");
      expect(normalizeTimerPosition("left")).toBe("left");
      expect(normalizeTimerPosition("right")).toBe("right");
      expect(normalizeTimerPosition("center")).toBe("center");

      // Corrupted / unexpected values fallback to 'auto'
      expect(normalizeTimerPosition("corrupted-dock")).toBe("auto");
      expect(normalizeTimerPosition(null)).toBe("auto");
      expect(normalizeTimerPosition(undefined)).toBe("auto");
      expect(normalizeTimerPosition("")).toBe("auto");
    });

    it("has descriptive metadata in TIMER_POSITION_REGISTRY", () => {
      for (const pos of VALID_TIMER_POSITIONS) {
        expect(TIMER_POSITION_REGISTRY[pos]).toBeDefined();
        expect(typeof TIMER_POSITION_REGISTRY[pos].label).toBe("string");
        expect(typeof TIMER_POSITION_REGISTRY[pos].description).toBe("string");
      }
    });
  });

  describe("2. resolveEffectiveTimerPosition: Precedence & Focal-X Heuristic", () => {
    it("explicit admin timerPosition always wins over focal-X", () => {
      // Even if subject is on far right (focalX = 0.9), an explicit 'right' or 'center' setting wins
      expect(resolveEffectiveTimerPosition("right", 0.9)).toBe("right");
      expect(resolveEffectiveTimerPosition("center", 0.9)).toBe("center");
      expect(resolveEffectiveTimerPosition("left", 0.1)).toBe("left");
      expect(resolveEffectiveTimerPosition("left", null)).toBe("left");
      expect(resolveEffectiveTimerPosition("center", undefined)).toBe("center");
    });

    it("when timerPosition is auto, uses focalX to dock in negative space", () => {
      // Subject on right (focalX >= 0.55) -> dock timer on left
      expect(resolveEffectiveTimerPosition("auto", 0.8)).toBe("left");
      expect(resolveEffectiveTimerPosition("auto", 0.55)).toBe("left");
      expect(resolveEffectiveTimerPosition("auto", 1.0)).toBe("left");

      // Subject on left (focalX <= 0.45) -> dock timer on right
      expect(resolveEffectiveTimerPosition("auto", 0.2)).toBe("right");
      expect(resolveEffectiveTimerPosition("auto", 0.45)).toBe("right");
      expect(resolveEffectiveTimerPosition("auto", 0.0)).toBe("right");

      // Balanced/centered subject (0.45 < focalX < 0.55) -> dock center
      expect(resolveEffectiveTimerPosition("auto", 0.5)).toBe("center");
      expect(resolveEffectiveTimerPosition("auto", 0.48)).toBe("center");
      expect(resolveEffectiveTimerPosition("auto", 0.52)).toBe("center");
    });

    it("handles missing or NaN focalX gracefully in auto mode", () => {
      expect(resolveEffectiveTimerPosition("auto", null)).toBe("center");
      expect(resolveEffectiveTimerPosition("auto", undefined)).toBe("center");
      expect(resolveEffectiveTimerPosition("auto", NaN)).toBe("center");
      expect(resolveEffectiveTimerPosition(undefined, null)).toBe("center");
    });

    it("handles corrupted timerPosition by falling back to auto heuristic", () => {
      expect(resolveEffectiveTimerPosition("malformed-val", 0.85)).toBe("left");
      expect(resolveEffectiveTimerPosition("malformed-val", 0.15)).toBe("right");
      expect(resolveEffectiveTimerPosition("malformed-val", 0.5)).toBe("center");
    });
  });

  describe("3. Layout Key Router & Safety Fallbacks", () => {
    it("recognizes valid layout keys and defaults to classic", () => {
      expect(isValidLayoutKey("classic")).toBe(true);
      expect(isValidLayoutKey("anime")).toBe(true);
      expect(isValidLayoutKey("landscape")).toBe(true);
      expect(isValidLayoutKey("fantasy")).toBe(true);
      expect(isValidLayoutKey("invalid-layout")).toBe(false);

      expect(normalizeLayoutKey("classic")).toBe("classic");
      expect(normalizeLayoutKey("anime")).toBe("anime");
      expect(normalizeLayoutKey("landscape")).toBe("landscape");
      expect(normalizeLayoutKey("fantasy")).toBe("fantasy");

      // Corrupted key falls back to DEFAULT_LAYOUT_KEY ('classic')
      expect(normalizeLayoutKey("unknown-future-key")).toBe(DEFAULT_LAYOUT_KEY);
      expect(normalizeLayoutKey(null)).toBe(DEFAULT_LAYOUT_KEY);
      expect(normalizeLayoutKey(undefined)).toBe(DEFAULT_LAYOUT_KEY);
    });
  });
});
