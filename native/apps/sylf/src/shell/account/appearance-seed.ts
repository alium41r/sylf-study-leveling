// Native's appearance is its own, kept on the device. It is seeded once from the colours someone chose on the web, so a first sign-in does not look like a
// stranger's app. Only a real custom colour counts, only an untouched appearance is changed, and nothing is ever written back: Native's six themes are not
// web's, so a write would corrupt web's own preference.
import type { AppearancePreference, ThemeAxes } from "@sylf/design-system";

const HEX = /^#[0-9a-f]{6}$/i;
/** Web's default accent, which is not a choice anyone made. */
const DEFAULT_ACCENT = "#7c3aed";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const untouched = (preference: Pick<AppearancePreference, "themeId" | "overrides" | "saved">) => preference.themeId === "signature" && Object.keys(preference.overrides).length === 0 && preference.saved.length === 0;

export function seedPatch(account: { activeTheme?: string | null; activeBackground?: string | null }, preference: Pick<AppearancePreference, "themeId" | "overrides" | "saved">): Partial<ThemeAxes> | null {
  if (!untouched(preference)) return null;
  const patch: Partial<ThemeAxes> = {};
  const accent = account.activeTheme;
  if (accent && HEX.test(accent) && accent.toLowerCase() !== DEFAULT_ACCENT) patch.accentHex = accent.toLowerCase();
  const ground = account.activeBackground;
  if (ground && HEX.test(ground)) patch[luminance(ground) < 0.5 ? "groundNight" : "groundDay"] = ground.toLowerCase();
  return Object.keys(patch).length ? patch : null;
}

export const seedMarker = (userId: number) => `sylf.native.appearance-seeded.${userId}`;
