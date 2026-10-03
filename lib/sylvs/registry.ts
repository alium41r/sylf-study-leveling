import { getDefaultColors } from "./colors";
import { SylvAppearance, SylvColors, SylvGender } from "./types";

/**
 * Creates a valid, pristine SylvAppearance model for either gender.
 */
export function createDefaultSylvAppearance(
  gender: SylvGender = "male",
  customColors?: Partial<SylvColors>
): SylvAppearance {
  const baseColors = getDefaultColors(gender);
  return {
    gender,
    colors: {
      ...baseColors,
      ...customColors,
    },
  };
}
