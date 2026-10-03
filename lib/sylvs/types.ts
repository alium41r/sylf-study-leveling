/**
 * Sylv Modular Character System — Core Types
 * Renamed from Sylphling per specification.
 */

export type SylvGender = "male" | "female";

export interface SylvColors {
  /** Main porcelain / spirit body tone (e.g. #f8f6f4) */
  primary: string;
  /** Shading / shadow / undertone gradient (e.g. #d4e0eb or #edd5d5) */
  secondary: string;
  /** Dark eye / pupil tone (e.g. #262a36) */
  eye: string;
  /** Inner ear / rim light / contour accent (optional) */
  accent?: string;
  /** Body markings color (optional) */
  marking?: string;
  /** Ambient aura or glow effect color (optional) */
  glow?: string;
  /** Hair color (future expansion) */
  hair?: string;
  /** Equipment / armor trim color (future expansion) */
  equipment?: string;
}

export interface SylvAppearance {
  gender: SylvGender;
  colors: SylvColors;

  // Anatomy slots
  headShape?: string;
  bodyShape?: string;
  arms?: string;
  tail?: string;

  // Facial features
  eyes?: string;
  iris?: string;
  pupils?: string;
  eyebrows?: string;
  ears?: string;

  // Appendages
  horns?: string;
  wings?: string;
  fins?: string;
  antennae?: string;

  // Markings
  foreheadMark?: string;
  faceMark?: string;
  bodyMark?: string;
  glowPattern?: string;

  // Hair & Clothing
  hair?: string;
  outfit?: string;
  cloak?: string;
  armor?: string;

  // Accessories
  headAccessory?: string;
  neckAccessory?: string;
  floatingAccessory?: string;

  // Environmental Effects
  aura?: string;
  particles?: string;
  trail?: string;
}

export type SylvAnchorKey =
  | "HEAD"
  | "FACE"
  | "LEFT_EYE"
  | "RIGHT_EYE"
  | "LEFT_EAR"
  | "RIGHT_EAR"
  | "BODY"
  | "LEFT_ARM"
  | "RIGHT_ARM"
  | "TAIL_ROOT"
  | "TAIL_MID"
  | "TAIL_TIP"
  | "HEAD_ACCESSORY"
  | "CHEST_ACCESSORY"
  | "FLOATING_ACCESSORY";

export interface SylvPoint {
  x: number;
  y: number;
}

export interface SylvAnchor {
  key: SylvAnchorKey;
  name: string;
  point: SylvPoint;
  description: string;
}

export type SylvRarity =
  | "default"
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "achievement"
  | "seasonal"
  | "event"
  | "level_reward"
  | "quest_reward";

export interface SylvAssetMetadata {
  id: string;
  category: string;
  name: string;
  gender: "unisex" | "male" | "female";
  rarity: SylvRarity;
  unlockType: "default" | "progression" | "quest" | "shop" | "achievement";
  supportsPrimaryColor: boolean;
  supportsSecondaryColor: boolean;
  supportsGlow: boolean;
  anchorAttachment?: SylvAnchorKey;
  zIndexLayer?: number;
  tags?: string[];
}
