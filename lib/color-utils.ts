/**
 * Color and contrast utilities for the unified Sylf Appearance system.
 * Handles RGB/HSV/HSL conversions, WCAG relative luminance, contrast calculation,
 * and adaptive CSS token generation for custom accent and background colors.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HsvColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
}

export interface HslColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
}

export const DEFAULT_ACCENT_HEX = "#7c3aed";
export const DEFAULT_DARK_BG_HEX = "#000000";
export const DEFAULT_LIGHT_BG_HEX = "#f8fafc";

/* ─── Legacy Migration Fallback Maps ────────────────────────────── */

export const LEGACY_THEME_FALLBACKS: Record<string, string> = {
  cyberpunk: "#7c3aed",
  sakura: "#ec4899",
  emerald: "#10b981",
  crimson: "#ef4444",
  amber: "#f59e0b",
  abyss: "#6366f1",
  volt: "#84cc16",
  plasma: "#d946ef",
  glacier: "#06b6d4",
  solar: "#f97316",
};

export const LEGACY_BG_FALLBACKS: Record<string, { dark: string; light: string }> = {
  simple: { dark: "#000000", light: "#ffffff" },
  "simple-black": { dark: "#000000", light: "#ffffff" },
  "simple-white": { dark: "#000000", light: "#ffffff" },
  black: { dark: "#000000", light: "#ffffff" },
  white: { dark: "#000000", light: "#ffffff" },
  "pure-black": { dark: "#000000", light: "#ffffff" },
  "pure-white": { dark: "#000000", light: "#ffffff" },
  none: { dark: "#000000", light: "#ffffff" },
  default: { dark: "#000000", light: "#ffffff" },
  void: { dark: "#000000", light: "#ffffff" },
  "cyber-grid": { dark: "#060a16", light: "#e2ecfa" },
  "sakura-fall": { dark: "#0e0510", light: "#fbdfec" },
  "abyssal-glow": { dark: "#080613", light: "#e7e3fb" },
  "neon-sunrise": { dark: "#070508", light: "#fde4d0" },
  "matrix-rain": { dark: "#02100a", light: "#b7f2d2" },
  "aurora-borealis": { dark: "#05050f", light: "#dfe9ff" },
  "deep-ocean": { dark: "#020710", light: "#c8e4fb" },
};

/* ─── Validation & Parsing ───────────────────────────────────────── */

export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

export function normalizeHex(input: string, fallback = DEFAULT_ACCENT_HEX): string {
  if (!input) return fallback;
  let clean = input.trim();
  if (!clean.startsWith("#")) {
    clean = "#" + clean;
  }
  if (!isValidHex(clean)) {
    return fallback;
  }
  // Expand 3-digit hex to 6-digit hex
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.toLowerCase();
}

export function hexToRgb(hex: string): RgbColor | null {
  if (!hex) return null;
  const trimmed = hex.trim();
  if (trimmed.startsWith("rgb")) {
    const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      };
    }
  }
  const norm = normalizeHex(hex, "");
  if (!norm) return null;
  const num = parseInt(norm.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ─── HSV / HSL Conversions ─────────────────────────────────────── */

export function rgbToHsv(r: number, g: number, b: number, currentHue = 0): HsvColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = currentHue;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (d !== 0) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h = h * 60;
  }

  return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const hNorm = (h % 360 + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const vNorm = Math.max(0, Math.min(100, v)) / 100;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = vNorm - c;

  let r1 = 0, g1 = 0, b1 = 0;

  if (hNorm < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hNorm < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hNorm < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hNorm < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hNorm < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h = h * 60;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hNorm = (h % 360 + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;

  if (hNorm < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hNorm < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hNorm < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hNorm < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hNorm < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/* ─── WCAG Contrast & Luminance ──────────────────────────────────── */

export function getRelativeLuminance(rgb: RgbColor): number {
  const transform = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = transform(rgb.r);
  const g = transform(rgb.g);
  const b = transform(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;

  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isDarkColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  return getRelativeLuminance(rgb) < 0.45;
}

/* ─── Legacy Migration Resolvers ─────────────────────────────────── */

export function resolveLegacyTheme(themeIdOrHex?: string | null): string {
  if (!themeIdOrHex) return DEFAULT_ACCENT_HEX;
  const trimmed = themeIdOrHex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : "#" + trimmed;
  if (isValidHex(withHash)) {
    return normalizeHex(withHash);
  }
  if (LEGACY_THEME_FALLBACKS[trimmed.toLowerCase()]) {
    return LEGACY_THEME_FALLBACKS[trimmed.toLowerCase()];
  }
  return DEFAULT_ACCENT_HEX;
}

export function resolveLegacyBackground(
  bgIdOrHex?: string | null,
  mode: "dark" | "light" = "dark"
): string {
  if (!bgIdOrHex) return mode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX;
  const trimmed = bgIdOrHex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : "#" + trimmed;
  if (isValidHex(withHash)) {
    return normalizeHex(withHash);
  }
  const fallback = LEGACY_BG_FALLBACKS[trimmed.toLowerCase()];
  if (fallback) {
    return mode === "light" ? fallback.light : fallback.dark;
  }
  return mode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX;
}

/* ─── Dynamic Design Token Generation ────────────────────────────── */

export interface AccentTokens {
  "--accent": string;
  "--accent-primary": string;
  "--accent-hover": string;
  "--accent-primary-light": string;
  "--accent-muted": string;
  "--accent-primary-dim": string;
  "--accent-primary-mid": string;
  "--accent-primary-dark": string;
  "--accent-foreground": string;
  "--accent-contrast": string;
  "--accent-text": string;
  "--accent-text-light": string;
  "--focus-ring": string;
  "--accent-purple": string;
  "--accent-cyan": string;
  "--accent-blue": string;
}

export function getAccentForeground(rawHex: string): string {
  const norm = normalizeHex(rawHex, DEFAULT_ACCENT_HEX);
  const crWhite = getContrastRatio(norm, "#ffffff");
  const crBlack = getContrastRatio(norm, "#000000");

  if (crWhite >= 4.5) return "#ffffff";
  if (crBlack >= 4.5) return "#000000";
  return crWhite >= crBlack ? "#ffffff" : "#000000";
}

export function getSafeAccentText(accentHex: string, surfaceHex: string): string {
  const normAccent = normalizeHex(accentHex, DEFAULT_ACCENT_HEX);
  const normSurface = normalizeHex(surfaceHex, DEFAULT_DARK_BG_HEX);

  if (getContrastRatio(normAccent, normSurface) >= 4.5) {
    return normAccent;
  }

  const rgb = hexToRgb(normAccent) || { r: 124, g: 58, b: 237 };
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const crWhite = getContrastRatio("#ffffff", normSurface);
  const crBlack = getContrastRatio("#000000", normSurface);
  const preferLight = crWhite >= crBlack;

  let currentL = hsl.l;
  let currentS = hsl.s;
  let safeHex = normAccent;

  for (let i = 0; i < 20; i++) {
    if (preferLight) {
      currentL = Math.min(98, currentL + 4);
      currentS = Math.max(10, currentS - 4);
    } else {
      currentL = Math.max(2, currentL - 4);
      currentS = Math.min(100, currentS + 2);
    }
    const nextRgb = hslToRgb(hsl.h, currentS, currentL);
    safeHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    if (getContrastRatio(safeHex, normSurface) >= 4.5) {
      return safeHex;
    }
  }

  // Fallback to highest contrast extreme if intermediate tint doesn't meet 4.5:1
  return crWhite >= crBlack ? "#ffffff" : "#000000";
}

export function getAccentTokens(rawHex: string, targetSurfaceHex = "#000000"): AccentTokens {
  const primaryHex = normalizeHex(rawHex, DEFAULT_ACCENT_HEX);
  const rgb = hexToRgb(primaryHex) || hexToRgb(DEFAULT_ACCENT_HEX)!;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Compute lighter tint (elevate lightness, gentle desaturation if saturated)
  const lightL = Math.min(88, Math.max(hsl.l + 18, 62));
  const lightS = Math.max(30, hsl.s - 5);
  const lightRgb = hslToRgb(hsl.h, lightS, lightL);
  const lightHex = rgbToHex(lightRgb.r, lightRgb.g, lightRgb.b);

  // Compute darker shade (for high contrast text in light mode)
  const darkL = Math.max(16, Math.min(hsl.l - 22, 38));
  const darkS = Math.min(95, hsl.s + 10);
  const darkRgb = hslToRgb(hsl.h, darkS, darkL);
  const darkHex = rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);

  // Hover variant: subtle lift or deep saturation
  const hoverL = hsl.l > 75 ? hsl.l - 8 : Math.min(90, hsl.l + 8);
  const hoverRgb = hslToRgb(hsl.h, hsl.s, hoverL);
  const hoverHex = rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);

  const fgColor = getAccentForeground(primaryHex);
  const safeText = getSafeAccentText(primaryHex, targetSurfaceHex);

  return {
    "--accent": primaryHex,
    "--accent-primary": primaryHex,
    "--accent-hover": hoverHex,
    "--accent-primary-light": lightHex,
    "--accent-muted": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
    "--accent-primary-dim": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
    "--accent-primary-mid": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
    "--accent-primary-dark": darkHex,
    "--accent-foreground": fgColor,
    "--accent-contrast": fgColor,
    "--accent-text": safeText,
    "--accent-text-light": lightHex,
    "--focus-ring": `0 0 0 2px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`,
    "--accent-purple": primaryHex,
    "--accent-cyan": lightHex,
    "--accent-blue": primaryHex,
  };
}

export interface BackgroundTokens {
  "--app-canvas": string;
  "--bg-void": string;
  "--surface-1": string;
  "--bg-abyss": string;
  "--surface-2": string;
  "--bg-shadow": string;
  "--surface-raised": string;
  "--bg-panel": string;
  "--overlay-bg": string;
  "--bg-overlay": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-muted": string;
  "--border-subtle": string;
  "--border-strong": string;
  "--border-active": string;
  "--sidebar-bg": string;
  "--sidebar-fg": string;
  "--sidebar-border": string;
  "--glass-liquid-bg": string;
  "--glass-liquid-border": string;
  "--card-shadow": string;
}

export function getBackgroundTokens(rawHex: string, mode: "dark" | "light" = "dark"): BackgroundTokens {
  const userCanvasHex = isValidHex(rawHex)
    ? (rawHex.trim().startsWith("#") ? rawHex.trim() : `#${rawHex.trim()}`)
    : (mode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX);
  const normBg = userCanvasHex.toLowerCase();
  const rgb = hexToRgb(normBg) || hexToRgb(DEFAULT_DARK_BG_HEX)!;
  const lum = getRelativeLuminance(rgb);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Perceptual canvas polarity based on WCAG contrast against white vs dark text
  const crWhite = getContrastRatio(normBg, "#ffffff");
  const crDark = getContrastRatio(normBg, "#0f172a");
  const isDarkCanvas = crWhite >= crDark || lum < 0.42;

  if (isDarkCanvas) {
    // ── Dark or Saturated Deep Canvas ──────────────────────────────────────────
    // Foreground text MUST be light to satisfy WCAG AA >= 4.5:1
    const textPrimary = "#e2e8f0";
    const textSecondary = lum < 0.1 ? "#94a3b8" : "#cbd5e1";
    const textMuted = lum < 0.1 ? "#64748b" : "#94a3b8";

    let surface1Hex: string;
    let surface2Hex: string;
    let surfaceRaisedHex: string;
    let sidebarHex: string;

    if (hsl.l < 10) {
      // Near-black canvas: subtly elevated slate surfaces
      const s1Rgb = hslToRgb(hsl.h, Math.min(25, hsl.s), 7);
      const s2Rgb = hslToRgb(hsl.h, Math.min(25, hsl.s), 11);
      const sRaisedRgb = hslToRgb(hsl.h, Math.min(25, hsl.s), 15);
      const sbRgb = hslToRgb(hsl.h, Math.min(25, hsl.s), 5);
      surface1Hex = rgbToHex(s1Rgb.r, s1Rgb.g, s1Rgb.b);
      surface2Hex = rgbToHex(s2Rgb.r, s2Rgb.g, s2Rgb.b);
      surfaceRaisedHex = rgbToHex(sRaisedRgb.r, sRaisedRgb.g, sRaisedRgb.b);
      sidebarHex = rgbToHex(sbRgb.r, sbRgb.g, sbRgb.b);
    } else {
      // Mid-tone or saturated dark canvas (e.g. #1A7775 teal):
      // Derive harmonious deep surfaces with tonal separation from canvas
      const clampedS = Math.min(50, Math.max(15, hsl.s * 0.7));
      const s1L = Math.max(8, Math.min(20, hsl.l - 10));
      const s2L = Math.max(6, Math.min(15, hsl.l - 15));
      const sRaisedL = Math.max(12, Math.min(24, hsl.l - 6));
      const sbL = Math.max(6, Math.min(18, hsl.l - 12));

      const s1Rgb = hslToRgb(hsl.h, clampedS, s1L);
      const s2Rgb = hslToRgb(hsl.h, clampedS, s2L);
      const sRaisedRgb = hslToRgb(hsl.h, clampedS, sRaisedL);
      const sbRgb = hslToRgb(hsl.h, clampedS, sbL);
      surface1Hex = rgbToHex(s1Rgb.r, s1Rgb.g, s1Rgb.b);
      surface2Hex = rgbToHex(s2Rgb.r, s2Rgb.g, s2Rgb.b);
      surfaceRaisedHex = rgbToHex(sRaisedRgb.r, sRaisedRgb.g, sRaisedRgb.b);
      sidebarHex = rgbToHex(sbRgb.r, sbRgb.g, sbRgb.b);
    }

    const overlayR = Math.max(0, rgb.r - 12);
    const overlayG = Math.max(0, rgb.g - 12);
    const overlayB = Math.max(0, rgb.b - 12);

    return {
      "--app-canvas": userCanvasHex,
      "--bg-void": userCanvasHex,
      "--surface-1": surface1Hex,
      "--bg-abyss": surface1Hex,
      "--surface-2": surface2Hex,
      "--bg-shadow": surface2Hex,
      "--surface-raised": surfaceRaisedHex,
      "--bg-panel": surfaceRaisedHex,
      "--overlay-bg": `rgba(${overlayR}, ${overlayG}, ${overlayB}, 0.92)`,
      "--bg-overlay": `rgba(${overlayR}, ${overlayG}, ${overlayB}, 0.92)`,
      "--text-primary": textPrimary,
      "--text-secondary": textSecondary,
      "--text-muted": textMuted,
      "--border-subtle": "rgba(255, 255, 255, 0.12)",
      "--border-strong": "rgba(255, 255, 255, 0.22)",
      "--border-active": "rgba(255, 255, 255, 0.35)",
      "--sidebar-bg": sidebarHex,
      "--sidebar-fg": textPrimary,
      "--sidebar-border": "rgba(255, 255, 255, 0.12)",
      "--glass-liquid-bg": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.70)`,
      "--glass-liquid-border": "rgba(255, 255, 255, 0.14)",
      "--card-shadow": "0 2px 10px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2)",
    };
  } else {
    // ── Light or Saturated Pale Canvas ─────────────────────────────────────────
    // Foreground text MUST be dark slate to satisfy WCAG AA >= 4.5:1
    const textPrimary = "#0f172a";
    const textSecondary = "#334155";
    const textMuted = "#64748b";

    let surface1Hex: string;
    let surface2Hex: string;
    let surfaceRaisedHex: string;
    const sidebarHex = hsl.l > 94
      ? "#ffffff"
      : rgbToHex(
          hslToRgb(hsl.h, Math.min(15, hsl.s * 0.3), 97).r,
          hslToRgb(hsl.h, Math.min(15, hsl.s * 0.3), 97).g,
          hslToRgb(hsl.h, Math.min(15, hsl.s * 0.3), 97).b
        );

    if (hsl.l > 94) {
      // Near-white canvas (e.g. #ffffff, #f8fafc)
      surface1Hex = "#ffffff";
      surface2Hex = "#f1f5f9";
      surfaceRaisedHex = "#ffffff";
    } else {
      // Saturated light canvas (e.g. light mint #a0e8dd or soft cyan #e2ecfa)
      // Clean white surfaces create crisp, high-contrast, uncluttered cards
      surface1Hex = "#ffffff";
      const s2Rgb = hslToRgb(hsl.h, Math.min(20, hsl.s * 0.4), 93);
      surface2Hex = rgbToHex(s2Rgb.r, s2Rgb.g, s2Rgb.b);
      surfaceRaisedHex = "#ffffff";
    }

    return {
      "--app-canvas": userCanvasHex,
      "--bg-void": userCanvasHex,
      "--surface-1": surface1Hex,
      "--bg-abyss": surface1Hex,
      "--surface-2": surface2Hex,
      "--bg-shadow": surface2Hex,
      "--surface-raised": surfaceRaisedHex,
      "--bg-panel": surfaceRaisedHex,
      "--overlay-bg": "rgba(241, 245, 249, 0.88)",
      "--bg-overlay": "rgba(241, 245, 249, 0.88)",
      "--text-primary": textPrimary,
      "--text-secondary": textSecondary,
      "--text-muted": textMuted,
      "--border-subtle": "rgba(15, 23, 42, 0.12)",
      "--border-strong": "rgba(15, 23, 42, 0.22)",
      "--border-active": "rgba(15, 23, 42, 0.35)",
      "--sidebar-bg": sidebarHex,
      "--sidebar-fg": textPrimary,
      "--sidebar-border": "rgba(15, 23, 42, 0.12)",
      "--glass-liquid-bg": "rgba(255, 255, 255, 0.88)",
      "--glass-liquid-border": "rgba(15, 23, 42, 0.14)",
      "--card-shadow": "0 2px 8px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
    };
  }
}

