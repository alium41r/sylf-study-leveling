import { SylvColors, SylvGender } from "./types";

/**
 * CSS custom property names for the Sylv SVG architecture.
 * SVGs refer directly to these variables via var(--sylv-*).
 */
export const SYLV_CSS_VARS = {
  primary: "--sylv-primary",
  secondary: "--sylv-secondary",
  accent: "--sylv-accent",
  eye: "--sylv-eye",
  marking: "--sylv-marking",
  glow: "--sylv-glow",
} as const;

/** Canonical default baseline for Male Sylv (cool porcelain / slate spirit) */
export const DEFAULT_MALE_COLORS: SylvColors = {
  primary: "#F6F5F2",
  secondary: "#CAD5E2",
  eye: "#2D3342",
  accent: "#B8C7D8",
  marking: "#8495A8",
  glow: "rgba(165, 195, 235, 0.45)",
};

/** Canonical default baseline for Female Sylv (warm porcelain / rose spirit) */
export const DEFAULT_FEMALE_COLORS: SylvColors = {
  primary: "#FAF5F3",
  secondary: "#EAD3D3",
  eye: "#3E292B",
  accent: "#DBBEBE",
  marking: "#A8888B",
  glow: "rgba(240, 185, 195, 0.45)",
};

export function getDefaultColors(gender: SylvGender): SylvColors {
  return gender === "female" ? DEFAULT_FEMALE_COLORS : DEFAULT_MALE_COLORS;
}

export interface SylvColorPreset {
  id: string;
  name: string;
  colors: SylvColors;
}

export const SYLV_COLOR_PRESETS: SylvColorPreset[] = [
  {
    id: "porcelain-male",
    name: "Cool Slate (Male Default)",
    colors: DEFAULT_MALE_COLORS,
  },
  {
    id: "porcelain-female",
    name: "Warm Rose (Female Default)",
    colors: DEFAULT_FEMALE_COLORS,
  },
  {
    id: "celestial-aurora",
    name: "Celestial Aurora",
    colors: {
      primary: "#EEF8FF",
      secondary: "#A6D5F5",
      eye: "#1A3254",
      accent: "#76BEEB",
      marking: "#4A94C7",
      glow: "rgba(120, 210, 255, 0.55)",
    },
  },
  {
    id: "amethyst-haze",
    name: "Amethyst Haze",
    colors: {
      primary: "#F7F2FA",
      secondary: "#D4BFE8",
      eye: "#321D48",
      accent: "#BA9DD4",
      marking: "#8863A6",
      glow: "rgba(195, 155, 245, 0.5)",
    },
  },
  {
    id: "verdant-sprout",
    name: "Verdant Sprout",
    colors: {
      primary: "#F3FAF4",
      secondary: "#C0E4CA",
      eye: "#1C3C24",
      accent: "#9ED4AC",
      marking: "#5E9E6F",
      glow: "rgba(145, 225, 165, 0.45)",
    },
  },
  {
    id: "solar-ember",
    name: "Solar Ember",
    colors: {
      primary: "#FFF8F0",
      secondary: "#FED7AA",
      eye: "#431E12",
      accent: "#FDBA74",
      marking: "#EA580C",
      glow: "rgba(251, 146, 60, 0.5)",
    },
  },
  {
    id: "abyssal-midnight",
    name: "Abyssal Midnight",
    colors: {
      primary: "#232635",
      secondary: "#12141F",
      eye: "#7DD3FC",
      accent: "#38415C",
      marking: "#60A5FA",
      glow: "rgba(96, 165, 250, 0.6)",
    },
  },
];

/**
 * Converts a SylvColors object into standard CSS custom properties
 * that can be applied to an SVG container style attribute.
 */
export function resolveSylvCssVariables(
  colors: SylvColors
): Record<string, string> {
  return {
    [SYLV_CSS_VARS.primary]: colors.primary,
    [SYLV_CSS_VARS.secondary]: colors.secondary,
    [SYLV_CSS_VARS.eye]: colors.eye,
    [SYLV_CSS_VARS.accent]: colors.accent ?? colors.secondary,
    [SYLV_CSS_VARS.marking]: colors.marking ?? colors.secondary,
    [SYLV_CSS_VARS.glow]: colors.glow ?? "rgba(180, 210, 255, 0.35)",
  };
}
