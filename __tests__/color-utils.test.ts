import { describe, it, expect } from "vitest";
import {
  isValidHex,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  hsvToHex,
  getRelativeLuminance,
  getContrastRatio,
  isDarkColor,
  resolveLegacyTheme,
  resolveLegacyBackground,
  getAccentTokens,
  getBackgroundTokens,
  getAccentForeground,
  getSafeAccentText,
  DEFAULT_ACCENT_HEX,
  DEFAULT_DARK_BG_HEX,
  DEFAULT_LIGHT_BG_HEX,
} from "@/lib/color-utils";

describe("color-utils", () => {
  describe("Hex Validation & Normalization", () => {
    it("validates 3-digit and 6-digit hex values", () => {
      expect(isValidHex("#fff")).toBe(true);
      expect(isValidHex("#ffffff")).toBe(true);
      expect(isValidHex("#7c3aed")).toBe(true);
      expect(isValidHex("7c3aed")).toBe(false); // without hash
      expect(isValidHex("#xyz123")).toBe(false);
      expect(isValidHex("#12345")).toBe(false);
    });

    it("normalizes hex strings correctly", () => {
      expect(normalizeHex("7c3aed")).toBe("#7c3aed");
      expect(normalizeHex("#FFF")).toBe("#ffffff");
      expect(normalizeHex("#000")).toBe("#000000");
      expect(normalizeHex("invalid", "#123456")).toBe("#123456");
      expect(normalizeHex("", "#7c3aed")).toBe("#7c3aed");
    });

    it("converts hex to RGB and back", () => {
      const rgb = hexToRgb("#7c3aed");
      expect(rgb).toEqual({ r: 124, g: 58, b: 237 });
      expect(rgbToHex(124, 58, 237)).toBe("#7c3aed");
    });
  });

  describe("HSV Conversions", () => {
    it("converts RGB to HSV and back", () => {
      // Pure red
      const hsvRed = rgbToHsv(255, 0, 0);
      expect(hsvRed.h).toBe(0);
      expect(hsvRed.s).toBe(100);
      expect(hsvRed.v).toBe(100);
      expect(hsvToRgb(0, 100, 100)).toEqual({ r: 255, g: 0, b: 0 });

      // Electric Purple #7c3aed
      const hsvPurple = rgbToHsv(124, 58, 237);
      expect(hsvPurple.h).toBeCloseTo(262, -1);
      const roundTrip = hsvToHex(hsvPurple.h, hsvPurple.s, hsvPurple.v);
      expect(roundTrip).toBe("#7c3aed");
    });
  });

  describe("WCAG Luminance and Contrast", () => {
    it("calculates relative luminance according to WCAG", () => {
      expect(getRelativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
      expect(getRelativeLuminance({ r: 255, g: 255, b: 255 })).toBe(1);
    });

    it("calculates contrast ratios properly", () => {
      const blackWhiteContrast = getContrastRatio("#000000", "#ffffff");
      expect(blackWhiteContrast).toBeCloseTo(21, 0);

      const sameContrast = getContrastRatio("#7c3aed", "#7c3aed");
      expect(sameContrast).toBeCloseTo(1, 1);
    });

    it("identifies dark vs light colors", () => {
      expect(isDarkColor("#000000")).toBe(true);
      expect(isDarkColor("#090d16")).toBe(true);
      expect(isDarkColor("#ffffff")).toBe(false);
      expect(isDarkColor("#f8fafc")).toBe(false);
    });
  });

  describe("Legacy Migration Resolvers", () => {
    it("resolves legacy theme keys to appropriate hex accents", () => {
      expect(resolveLegacyTheme("cyberpunk")).toBe("#7c3aed");
      expect(resolveLegacyTheme("sakura")).toBe("#ec4899");
      expect(resolveLegacyTheme("emerald")).toBe("#10b981");
      expect(resolveLegacyTheme("crimson")).toBe("#ef4444");
      expect(resolveLegacyTheme("amber")).toBe("#f59e0b");
      expect(resolveLegacyTheme("abyss")).toBe("#6366f1");
      expect(resolveLegacyTheme("volt")).toBe("#84cc16");
      expect(resolveLegacyTheme("plasma")).toBe("#d946ef");
      expect(resolveLegacyTheme("glacier")).toBe("#06b6d4");
      expect(resolveLegacyTheme("solar")).toBe("#f97316");
    });

    it("passes through valid custom hex themes", () => {
      expect(resolveLegacyTheme("#123456")).toBe("#123456");
      expect(resolveLegacyTheme("ff0055")).toBe("#ff0055");
    });

    it("falls back to default accent for unknown string", () => {
      expect(resolveLegacyTheme("unknown-theme")).toBe(DEFAULT_ACCENT_HEX);
      expect(resolveLegacyTheme(null)).toBe(DEFAULT_ACCENT_HEX);
    });

    it("resolves legacy backgrounds based on mode", () => {
      expect(resolveLegacyBackground("simple", "dark")).toBe("#000000");
      expect(resolveLegacyBackground("simple", "light")).toBe("#ffffff");
      expect(resolveLegacyBackground("void", "dark")).toBe("#000000");
      expect(resolveLegacyBackground("void", "light")).toBe("#ffffff");
      expect(resolveLegacyBackground(null, "dark")).toBe(DEFAULT_DARK_BG_HEX);
      expect(resolveLegacyBackground(null, "light")).toBe(DEFAULT_LIGHT_BG_HEX);
    });

    it("passes through valid custom hex backgrounds", () => {
      expect(resolveLegacyBackground("#050510", "dark")).toBe("#050510");
      expect(resolveLegacyBackground("#ffffff", "light")).toBe("#ffffff");
    });
  });

  describe("Token Generators", () => {
    it("generates complete accent design tokens with light and dim variations", () => {
      const tokens = getAccentTokens("#7c3aed");
      expect(tokens["--accent-primary"]).toBe("#7c3aed");
      expect(tokens["--accent-primary-light"]).toBeDefined();
      expect(tokens["--accent-primary-dim"]).toContain("rgba(124, 58, 237,");
      expect(tokens["--accent-primary-mid"]).toContain("rgba(124, 58, 237,");
      expect(tokens["--accent-primary-dark"]).toBeDefined();
    });

    it("generates adaptive background tokens with deterministic contrast", () => {
      // Dark mode + dark background
      const darkTokens = getBackgroundTokens("#090d16", "dark");
      expect(darkTokens["--bg-void"]).toBe("#090d16");
      expect(darkTokens["--bg-abyss"]).toBeDefined();
      expect(darkTokens["--text-primary"]).toBe("#e2e8f0");

      // Dark mode + bright background (ensures legibility flip)
      const brightInDark = getBackgroundTokens("#ffffff", "dark");
      expect(brightInDark["--text-primary"]).toBe("#0f172a");

      // Light mode + light background
      const lightTokens = getBackgroundTokens("#f8fafc", "light");
      expect(lightTokens["--bg-void"]).toBe("#f8fafc");
      expect(lightTokens["--text-primary"]).toBe("#0f172a");

      // Light mode + dark background (ensures legibility flip)
      const darkInLight = getBackgroundTokens("#000000", "light");
      expect(darkInLight["--text-primary"]).toBe("#e2e8f0");
    });
  });

  describe("Appearance Contrast & Matrix Verification (Section 19)", () => {
    const MATRIX = [
      { name: "A. Dark + #000000 (Pure Black)", mode: "dark" as const, bg: "#000000", expectedFg: "#e2e8f0" },
      { name: "B. Dark + #f8fafc (Very Light)", mode: "dark" as const, bg: "#f8fafc", expectedFg: "#0f172a" },
      { name: "C. Dark + #1A7775 (Saturated Teal)", mode: "dark" as const, bg: "#1A7775", expectedFg: "#e2e8f0" },
      { name: "D. Light + #ffffff (Pure White)", mode: "light" as const, bg: "#ffffff", expectedFg: "#0f172a" },
      { name: "E. Light + #090d16 (Very Dark)", mode: "light" as const, bg: "#090d16", expectedFg: "#e2e8f0" },
      { name: "F. Light + #1A7775 (Saturated Teal)", mode: "light" as const, bg: "#1A7775", expectedFg: "#e2e8f0" },
    ];

    MATRIX.forEach(({ name, mode, bg, expectedFg }) => {
      it(`satisfies WCAG contrast for ${name}`, () => {
        const tokens = getBackgroundTokens(bg, mode);
        expect(tokens["--app-canvas"]).toBe(bg);
        expect(tokens["--text-primary"]).toBe(expectedFg);

        // Verify surface-1 readability: contrast ratio >= 4.5:1 (WCAG AA for normal text)
        const contrast = getContrastRatio(tokens["--text-primary"], tokens["--surface-1"]);
        expect(contrast).toBeGreaterThanOrEqual(4.5);

        // Verify muted text contrast >= 3:1 (WCAG AA for large/secondary UI text)
        const mutedContrast = getContrastRatio(tokens["--text-muted"], tokens["--surface-1"]);
        expect(mutedContrast).toBeGreaterThanOrEqual(3.0);

        // Verify sidebar foreground readability
        const sidebarContrast = getContrastRatio(tokens["--sidebar-fg"], tokens["--sidebar-bg"]);
        expect(sidebarContrast).toBeGreaterThanOrEqual(3.5);
      });
    });

    describe("Accent Safety & Foreground Derivation", () => {
      it("derives black button foreground for pale/bright accents (e.g. #FFFF80, #ffffff)", () => {
        const paleYellowFg = getAccentForeground("#FFFF80");
        expect(paleYellowFg).toBe("#000000");
        expect(getContrastRatio(paleYellowFg, "#FFFF80")).toBeGreaterThanOrEqual(4.5);

        const whiteFg = getAccentForeground("#ffffff");
        expect(whiteFg).toBe("#000000");
        expect(getContrastRatio(whiteFg, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      });

      it("derives white button foreground for dark accents (e.g. #111827, #1e1b4b)", () => {
        const darkFg = getAccentForeground("#111827");
        expect(darkFg).toBe("#ffffff");
        expect(getContrastRatio(darkFg, "#111827")).toBeGreaterThanOrEqual(4.5);
      });

      it("derives safe accent text variants that contrast against arbitrary surfaces", () => {
        // Pale yellow text on a white surface must be darkened to achieve >= 4.5:1
        const safeYellowOnWhite = getSafeAccentText("#FFFF80", "#ffffff");
        expect(getContrastRatio(safeYellowOnWhite, "#ffffff")).toBeGreaterThanOrEqual(4.5);

        // Dark navy text on a dark surface must be lightened to achieve >= 4.5:1
        const safeNavyOnBlack = getSafeAccentText("#111827", "#000000");
        expect(getContrastRatio(safeNavyOnBlack, "#000000")).toBeGreaterThanOrEqual(4.5);

        // Standard saturated accents
        const accents = ["#ef4444", "#2563eb", "#7c3aed", "#eab308"];
        const surfaces = ["#090d16", "#ffffff", "#1A7775", "#000000"];

        for (const accent of accents) {
          for (const surface of surfaces) {
            const safeText = getSafeAccentText(accent, surface);
            const ratio = getContrastRatio(safeText, surface);
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    });
  });
});
