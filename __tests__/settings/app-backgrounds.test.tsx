import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { COSMETICS_CATALOG, normalizeAppBackgroundId } from "@/lib/cosmetics-catalog";
import {
  BG_MAP,
  applyGlobalBackground,
  applyAppMode,
} from "@/app/components/GlobalSystemWrapper";
import {
  saveStoredPreference,
  loadStoredPreference,
  FOCUS_BG_PREFERENCE_STORAGE_KEY,
} from "@/lib/focus-background-preference";
import { SYNTHETIC_CLASSIC_CATEGORY, CANONICAL_CLASSIC_SLUG } from "@/lib/focus-background-client";

describe("App Backgrounds: Singular Adaptive 'Simple' Canvas", () => {
  let layer: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-app-background");
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.classList.remove("dark");

    // Mock the in-flow app wallpaper layer
    layer = document.createElement("div");
    layer.id = "app-bg-layer";
    document.body.appendChild(layer);
  });

  afterEach(() => {
    if (layer && layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
    vi.restoreAllMocks();
  });

  describe("1. Catalog Registration & Metadata", () => {
    it("registers a single adaptive 'Simple' background in COSMETICS_CATALOG.BACKGROUND", () => {
      const bgs = COSMETICS_CATALOG.BACKGROUND;
      const simple = bgs.find((b) => b.id === "simple");
      const black = bgs.find((b) => b.id === "simple-black");
      const white = bgs.find((b) => b.id === "simple-white");

      expect(simple).toBeDefined();
      expect(simple?.name).toBe("Simple");
      expect(simple?.category).toBe("BACKGROUND");
      expect(simple?.bgCategory).toBe("simple");
      expect(simple?.unlockCondition).toBe("Default");
      expect(simple?.rarity).toBe("Common");
      expect(simple?.source).toBe("Base System");

      // Deprecated separate backgrounds are not present in catalog
      expect(black).toBeUndefined();
      expect(white).toBeUndefined();
    });

    it("preserves all existing themed/animated wallpapers without regression", () => {
      const bgs = COSMETICS_CATALOG.BACKGROUND;
      const expectedOriginalIds = [
        "void",
        "cyber-grid",
        "sakura-fall",
        "abyssal-glow",
        "neon-sunrise",
        "matrix-rain",
        "aurora-borealis",
        "deep-ocean",
      ];

      for (const id of expectedOriginalIds) {
        const found = bgs.find((b) => b.id === id);
        expect(found).toBeDefined();
        expect(found?.unlockCondition).toBeDefined();
      }
    });
  });

  describe("2. Global BG_MAP & Mode-Adaptive Colors", () => {
    it("maps 'simple' to #000000 in dark mode and #ffffff in light mode", () => {
      expect(BG_MAP["simple"]).toBeDefined();
      expect(BG_MAP["simple"].value).toBe("#000000");
      expect(BG_MAP["simple"].lightValue).toBe("#ffffff");
    });

    it("maps legacy aliases to the same adaptive values", () => {
      const aliases = ["simple-black", "simple-white", "black", "white", "pure-black", "pure-white"];
      for (const alias of aliases) {
        expect(BG_MAP[alias]).toBeDefined();
        expect(BG_MAP[alias].value).toBe("#000000");
        expect(BG_MAP[alias].lightValue).toBe("#ffffff");
      }
    });
  });

  describe("3. App Mode Helper Decoupling", () => {
    it("applyAppMode sets data-mode and class='dark' without altering background attributes", () => {
      document.documentElement.setAttribute("data-app-background", "simple");

      applyAppMode("dark");
      expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");

      applyAppMode("light");
      expect(document.documentElement.getAttribute("data-mode")).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");
    });
  });

  describe("4. applyGlobalBackground & DOM Application", () => {
    it("renders pure #000000 in dark mode without altering data-mode", () => {
      applyAppMode("dark");
      applyGlobalBackground("simple", "dark");

      expect(layer.style.backgroundColor).toBe("rgb(0, 0, 0)");
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");
      expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
      expect(document.body.style.background).toBe("transparent");
    });

    it("renders pure #ffffff in light mode without altering data-mode", () => {
      applyAppMode("light");
      applyGlobalBackground("simple", "light");

      expect(layer.style.backgroundColor).toBe("rgb(255, 255, 255)");
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");
      expect(document.documentElement.getAttribute("data-mode")).toBe("light");
      expect(document.body.style.background).toBe("transparent");
    });

    it("dynamically adapts when mode switches without re-selecting wallpaper", () => {
      // User has selected 'simple'
      localStorage.setItem("app_background", "simple");

      // 1. In dark mode
      applyAppMode("dark");
      applyGlobalBackground("simple", "dark");
      expect(layer.style.backgroundColor).toBe("rgb(0, 0, 0)");

      // 2. User switches to light mode in Themes
      applyAppMode("light");
      applyGlobalBackground("simple", "light");
      expect(layer.style.backgroundColor).toBe("rgb(255, 255, 255)");
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");

      // 3. User switches back to dark mode
      applyAppMode("dark");
      applyGlobalBackground("simple", "dark");
      expect(layer.style.backgroundColor).toBe("rgb(0, 0, 0)");
    });

    it("preserves dual-mode rendering for existing themed backgrounds", () => {
      applyAppMode("dark");
      applyGlobalBackground("abyssal-glow", "dark");
      expect(layer.style.background).toContain("radial-gradient");

      applyAppMode("light");
      applyGlobalBackground("abyssal-glow", "light");
      expect(layer.style.background).toContain("radial-gradient");
    });
  });

  describe("5. Legacy Alias Normalization", () => {
    it("normalizes legacy aliases to canonical 'simple'", () => {
      expect(normalizeAppBackgroundId("simple-black")).toBe("simple");
      expect(normalizeAppBackgroundId("simple-white")).toBe("simple");
      expect(normalizeAppBackgroundId("black")).toBe("simple");
      expect(normalizeAppBackgroundId("white")).toBe("simple");
      expect(normalizeAppBackgroundId("pure-black")).toBe("simple");
      expect(normalizeAppBackgroundId("pure-white")).toBe("simple");
      expect(normalizeAppBackgroundId("SIMPLE")).toBe("simple");
      expect(normalizeAppBackgroundId("void")).toBe("simple");
      expect(normalizeAppBackgroundId(null)).toBe("simple");

      // Non-alias themed IDs are preserved
      expect(normalizeAppBackgroundId("cyber-grid")).toBe("cyber-grid");
      expect(normalizeAppBackgroundId("sakura-fall")).toBe("sakura-fall");
    });

    it("normalizes legacy background ID on applyGlobalBackground call", () => {
      applyAppMode("dark");
      applyGlobalBackground("simple-black", "dark");
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");
      expect(layer.style.backgroundColor).toBe("rgb(0, 0, 0)");

      applyAppMode("light");
      applyGlobalBackground("simple-white", "light");
      expect(document.documentElement.getAttribute("data-app-background")).toBe("simple");
      expect(layer.style.backgroundColor).toBe("rgb(255, 255, 255)");
    });
  });

  describe("6. Complete Separation from Focus Timer Backgrounds", () => {
    it("Focus Background preference system strictly rejects string IDs and treats them as invalid/classic", () => {
      saveStoredPreference({ backgroundId: "simple" as any, source: "official", categorySlug: "simple" });
      const loadedPref = loadStoredPreference();
      expect(loadedPref.source).toBe("classic");
      expect(loadedPref.backgroundId).toBeNull();

      localStorage.setItem(
        FOCUS_BG_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ source: "official", categorySlug: "simple", backgroundId: "simple" })
      );
      const tamperedPref = loadStoredPreference();
      expect(tamperedPref.source).toBe("classic");
      expect(tamperedPref.backgroundId).toBeNull();

      expect(CANONICAL_CLASSIC_SLUG).toBe("classic-sylf");
      expect(SYNTHETIC_CLASSIC_CATEGORY.backgrounds).toEqual([]);
    });
  });
});
