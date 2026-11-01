// The persisted appearance preference, and its lossless bridge to the two values the Sylf account stores today
// (User.activeTheme and User.activeBackground). Mode stays per device, exactly as it does on the web.
import { appearance } from "@sylf/shared";
import { groundPolarity, type Polarity } from "../color/palette";
import { hexToOklch, oklchToHex } from "../color/oklch";
import { DENSITIES, ICON_STYLES, INTENSITIES, MARKERS, MATERIALS, MOTION_CHARACTERS, RAMPS, SHAPES, type ThemeAxes } from "./axes";
import { FONT_FAMILIES, type FontId, type FontRole } from "./fonts";
import { THEME_PRESETS, type PresetId } from "./presets";

export type ModePreference = "system" | "light" | "dark";

export interface AccessPreference {
  /** "system" follows the OS (prefers-contrast / Android high text contrast). */
  contrast: "system" | "more";
  /** "system" follows the OS. A theme can never raise motion above this. */
  motion: "system" | "reduced";
  /** Multiplies type on top of the OS font scale. */
  textScale: number;
}

export interface SavedTheme { id: string; name: string; baseId: PresetId; axes: ThemeAxes }

export interface AppearancePreference {
  version: 1;
  mode: ModePreference;
  /** A preset id or a saved theme id. */
  themeId: string;
  /** Unsaved tweaks layered on the active theme. */
  overrides: Partial<ThemeAxes>;
  saved: SavedTheme[];
  recents: { accents: string[]; grounds: string[] };
  access: AccessPreference;
}

export const MAX_SAVED_THEMES = 24;
export const MAX_RECENTS = 6;
export const TEXT_SCALE_RANGE = { min: 0.85, max: 1.4 } as const;

export const DEFAULT_PREFERENCE: AppearancePreference = {
  version: 1, mode: "system", themeId: "signature", overrides: {}, saved: [], recents: { accents: [], grounds: [] },
  access: { contrast: "system", motion: "system", textScale: 1 },
};

const hexOr = (value: unknown, fallback: string) => (typeof value === "string" && appearance.isValidHex(value) ? appearance.normalizeHex(value).toLowerCase() : fallback);
const pick = <T extends string>(value: unknown, table: Record<T, unknown>, fallback: T): T => (typeof value === "string" && value in table ? (value as T) : fallback);
const pickFont = (value: unknown, role: FontRole, fallback: FontId): FontId => {
  const family = typeof value === "string" ? FONT_FAMILIES[value as FontId] : undefined;
  return family?.roles.includes(role) ? family.id : fallback;
};

/** Anything read from storage or sync passes through here. Invalid values fall back; they are never trusted. */
export function normalizeAxes(input: Partial<ThemeAxes> | undefined, base: ThemeAxes): ThemeAxes {
  const v = (input ?? {}) as Partial<Record<keyof ThemeAxes, unknown>>;
  return {
    accentHex: hexOr(v.accentHex, base.accentHex),
    groundDay: hexOr(v.groundDay, base.groundDay),
    groundNight: hexOr(v.groundNight, base.groundNight),
    presence: pick(v.presence, { quiet: 1, balanced: 1, vivid: 1 }, base.presence),
    fontVoice: pickFont(v.fontVoice, "voice", base.fontVoice),
    fontInterface: pickFont(v.fontInterface, "interface", base.fontInterface),
    fontInstrument: pickFont(v.fontInstrument, "instrument", base.fontInstrument),
    ramp: pick(v.ramp, RAMPS, base.ramp),
    shape: pick(v.shape, SHAPES, base.shape),
    material: pick(v.material, MATERIALS, base.material),
    marker: pick(v.marker, MARKERS, base.marker),
    density: pick(v.density, DENSITIES, base.density),
    motion: pick(v.motion, MOTION_CHARACTERS, base.motion),
    intensity: pick(v.intensity, INTENSITIES, base.intensity),
    icons: pick(v.icons, ICON_STYLES, base.icons),
  };
}

const presetOf = (id: unknown) => (typeof id === "string" && id in THEME_PRESETS ? THEME_PRESETS[id as PresetId] : undefined);

export function normalizePreference(raw: unknown): AppearancePreference {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<AppearancePreference>;
  const base = DEFAULT_PREFERENCE;
  const saved = (Array.isArray(input.saved) ? input.saved : []).flatMap((theme): SavedTheme[] => {
    if (!theme || typeof theme.id !== "string" || typeof theme.name !== "string") return [];
    const preset = presetOf(theme.baseId) ?? THEME_PRESETS.signature;
    return [{ id: theme.id, name: theme.name.slice(0, 40), baseId: preset.id, axes: normalizeAxes(theme.axes, preset.axes) }];
  }).slice(0, MAX_SAVED_THEMES);
  const themeId = presetOf(input.themeId) || saved.some((t) => t.id === input.themeId) ? input.themeId! : base.themeId;
  const hexes = (list: unknown) => (Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && appearance.isValidHex(c)).map((c) => appearance.normalizeHex(c).toLowerCase()).slice(0, MAX_RECENTS) : []);
  const scale = typeof input.access?.textScale === "number" && Number.isFinite(input.access.textScale) ? input.access.textScale : 1;
  // Overrides keep only keys that were present and valid, so an override never silently pins a value to the base.
  const baseAxes = activeBase(themeId, saved);
  const cleaned = normalizeAxes(input.overrides, baseAxes);
  const overrides = Object.fromEntries(Object.keys(input.overrides ?? {}).filter((k) => k in cleaned).map((k) => [k, cleaned[k as keyof ThemeAxes]])) as Partial<ThemeAxes>;
  return {
    version: 1,
    mode: pick(input.mode, { system: 1, light: 1, dark: 1 }, base.mode),
    themeId,
    overrides,
    saved,
    recents: { accents: hexes(input.recents?.accents), grounds: hexes(input.recents?.grounds) },
    access: {
      contrast: input.access?.contrast === "more" ? "more" : "system",
      motion: input.access?.motion === "reduced" ? "reduced" : "system",
      textScale: Math.min(TEXT_SCALE_RANGE.max, Math.max(TEXT_SCALE_RANGE.min, scale)),
    },
  };
}

function activeBase(themeId: string, saved: SavedTheme[]): ThemeAxes {
  return presetOf(themeId)?.axes ?? saved.find((t) => t.id === themeId)?.axes ?? THEME_PRESETS.signature.axes;
}

export function resolveAxes(preference: AppearancePreference): ThemeAxes {
  return normalizeAxes(preference.overrides, activeBase(preference.themeId, preference.saved));
}

export function themeName(preference: AppearancePreference): string {
  return presetOf(preference.themeId)?.name ?? preference.saved.find((t) => t.id === preference.themeId)?.name ?? THEME_PRESETS.signature.name;
}

/** The ground this mode uses. Each theme carries a day and a night ground, which is what makes "system" mode possible. */
export function activeGround(axes: ThemeAxes, mode: Polarity) {
  return mode === "light" ? axes.groundDay : axes.groundNight;
}

/** A sensible opposite-polarity partner for a ground imported from an account that only ever stored one color. */
export function companionGround(hex: string): string {
  const { c, h } = hexToOklch(hex);
  const chroma = Math.min(c, 0.02);
  return groundPolarity(hex) === "dark" ? oklchToHex({ l: 0.965, c: chroma, h }) : oklchToHex({ l: 0.17, c: chroma, h });
}

export interface WebAccountAppearance { activeTheme?: string | null; activeBackground?: string | null; appMode?: string | null }

const WEB_UNSET = new Set(["", "default", "none", "simple", "simple-black", "simple-white"]);

/**
 * Imports the web account. The schema defaults ("default", "none") and the server's normalized "simple" mean the user
 * never chose anything, so they keep Signature rather than freezing the account on the old defaults. Legacy preset ids
 * resolve through the shared web tables, and legacy backgrounds use their authored day/night pair.
 */
export function fromWebAccount({ activeTheme, activeBackground, appMode }: WebAccountAppearance): Pick<AppearancePreference, "mode" | "overrides"> {
  const overrides: Partial<ThemeAxes> = {};
  const theme = activeTheme?.trim() ?? "";
  if (!WEB_UNSET.has(theme.toLowerCase())) overrides.accentHex = appearance.resolveLegacyTheme(theme).toLowerCase();
  const background = activeBackground?.trim() ?? "";
  const hasBackground = !WEB_UNSET.has(background.toLowerCase());
  const mode: Polarity = appMode === "light" || appMode === "dark" ? appMode : appearance.getRecommendedModeForBackground(hasBackground ? background : null, "dark");
  if (hasBackground) {
    const legacy = appearance.LEGACY_BG_FALLBACKS[background.toLowerCase()];
    if (legacy) { overrides.groundDay = legacy.light; overrides.groundNight = legacy.dark; } else {
      const hex = appearance.resolveLegacyBackground(background, mode).toLowerCase();
      const slot = groundPolarity(hex) === "dark" ? "groundNight" : "groundDay";
      overrides[slot] = hex;
      overrides[slot === "groundNight" ? "groundDay" : "groundNight"] = companionGround(hex);
    }
  }
  return { mode, overrides };
}

/** What a future sync (Phase 13) writes back: the same two account fields and the same value formats the web reads. */
export function toWebAccount(preference: AppearancePreference, systemMode: Polarity): { activeTheme: string; activeBackground: string; appMode: Polarity } {
  const axes = resolveAxes(preference);
  const appMode = preference.mode === "system" ? systemMode : preference.mode;
  return { activeTheme: axes.accentHex, activeBackground: activeGround(axes, appMode), appMode };
}
