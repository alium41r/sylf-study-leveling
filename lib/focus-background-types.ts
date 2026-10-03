// ============================================================================
// Focus Background & Layout Key Registry (Phase 1)
// ============================================================================
// Defines authoritative layout keys, runtime guards, and normalized types
// for official Focus Timer background categories and assets.
// ============================================================================

export const VALID_LAYOUT_KEYS = [
  "classic",
  "anime",
  "landscape",
  "fantasy",
] as const;

export type FocusTimerLayoutKey = (typeof VALID_LAYOUT_KEYS)[number];

export const DEFAULT_LAYOUT_KEY: FocusTimerLayoutKey = "classic";

export interface LayoutKeyDefinition {
  key: FocusTimerLayoutKey;
  label: string;
  description: string;
}

export const LAYOUT_KEY_REGISTRY: Record<FocusTimerLayoutKey, LayoutKeyDefinition> = {
  classic: {
    key: "classic",
    label: "Classic Sylf",
    description: "Original central focus timer ring with obsidian HUD framing",
  },
  anime: {
    key: "anime",
    label: "Anime Framing",
    description: "Composition tailored for artwork with off-center timer in negative space",
  },
  landscape: {
    key: "landscape",
    label: "Cinematic Landscape",
    description: "Restrained wide-angle HUD with minimal peripheral obstruction",
  },
  fantasy: {
    key: "fantasy",
    label: "Fantasy & Sanctum",
    description: "Rich atmospheric presentation tailored for grand scholar sanctums",
  },
};

/** Runtime guard checking whether a given string is a recognized layout key */
export function isValidLayoutKey(key: unknown): key is FocusTimerLayoutKey {
  return typeof key === "string" && (VALID_LAYOUT_KEYS as readonly string[]).includes(key);
}

/**
 * Returns the layout key if recognized, or safely falls back to 'classic'.
 * Guarantees that future or corrupted keys never break the timer or UI.
 */
export function normalizeLayoutKey(key: string | null | undefined): FocusTimerLayoutKey {
  if (key && isValidLayoutKey(key)) {
    return key;
  }
  return DEFAULT_LAYOUT_KEY;
}

// ── Timer Position Registry ───────────────────────────────────

export const VALID_TIMER_POSITIONS = ["auto", "left", "right", "center"] as const;
export type FocusTimerPosition = (typeof VALID_TIMER_POSITIONS)[number];
export const DEFAULT_TIMER_POSITION: FocusTimerPosition = "auto";

export const TIMER_POSITION_REGISTRY: Record<FocusTimerPosition, { label: string; description: string }> = {
  auto: {
    label: "Auto (Focal-X Heuristic)",
    description: "Calculates negative space opposite to focalX (subject right -> timer left, subject left -> timer right)",
  },
  left: {
    label: "Dock Left",
    description: "Pinned to left margin (ideal when artwork subject is on the right)",
  },
  right: {
    label: "Dock Right",
    description: "Pinned to right margin (ideal when artwork subject is on the left)",
  },
  center: {
    label: "Dock Center",
    description: "Horizontally centered layout pod",
  },
};

export function isValidTimerPosition(pos: unknown): pos is FocusTimerPosition {
  return typeof pos === "string" && (VALID_TIMER_POSITIONS as readonly string[]).includes(pos as any);
}

export function normalizeTimerPosition(pos: string | null | undefined): FocusTimerPosition {
  if (pos && isValidTimerPosition(pos)) {
    return pos;
  }
  return DEFAULT_TIMER_POSITION;
}

/**
 * Resolves the concrete docking alignment ("left" | "right" | "center"):
 * 1. Explicit admin timerPosition ('left', 'right', 'center') ALWAYS wins.
 * 2. When 'auto', calculates placement based on focalX:
 *    - focalX >= 0.55 (subject on right) -> dock left
 *    - focalX <= 0.45 (subject on left) -> dock right
 *    - 0.45 < focalX < 0.55 -> dock center
 */
export function resolveEffectiveTimerPosition(
  position: FocusTimerPosition | string | null | undefined,
  focalX: number | null | undefined
): "left" | "right" | "center" {
  const norm = normalizeTimerPosition(position);
  if (norm === "left" || norm === "right" || norm === "center") {
    return norm;
  }
  const fx = typeof focalX === "number" && !isNaN(focalX) ? focalX : 0.5;
  if (fx >= 0.55) return "left";
  if (fx <= 0.45) return "right";
  return "center";
}

/**
 * Resolves standard outer docking container classes for timer layouts.
 * Docking controls screen placement ONLY (left, right, center margin/alignment).
 * It NEVER dictates internal typography alignment (text-left/text-right).
 *
 * @param position - The resolved position ("left" | "right" | "center")
 * @param isPreview - If true (editor preview), omits the `md:` responsive prefix
 *                    so that the 16:9 canvas always displays the intended desktop
 *                    composition regardless of host viewport width.
 */
export function getFocusTimerDockClasses(
  position: "left" | "right" | "center",
  isPreview: boolean = false
): {
  dockAlignment: string;
  margin: string;
} {
  const prefix = isPreview ? "" : "md:";
  switch (position) {
    case "left":
      return {
        dockAlignment: `${prefix}items-start ${prefix}self-start`,
        margin: `${prefix}ml-8 lg:${prefix}ml-14`,
      };
    case "right":
      return {
        dockAlignment: `${prefix}items-end ${prefix}self-end`,
        margin: `${prefix}mr-8 lg:${prefix}mr-14`,
      };
    case "center":
    default:
      return {
        dockAlignment: `${prefix}items-center ${prefix}self-center`,
        margin: "",
      };
  }
}

// ── Data Entities ─────────────────────────────────────────────

export interface FocusBackgroundEntity {
  id: number;
  categoryId: number;
  name: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number | null;
  focalY: number | null;
  timerPosition: FocusTimerPosition;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  publicUrl: string;
}

export interface FocusBackgroundCategoryEntity {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  layoutKey: FocusTimerLayoutKey;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  backgrounds?: FocusBackgroundEntity[];
  _count?: {
    backgrounds: number;
  };
}

// ── Focus Background Source Discriminator (Phase 5B) ──────────

export const VALID_FOCUS_BACKGROUND_SOURCES = ["classic", "official", "custom"] as const;
export type FocusBackgroundSource = (typeof VALID_FOCUS_BACKGROUND_SOURCES)[number];
export const DEFAULT_FOCUS_BACKGROUND_SOURCE: FocusBackgroundSource = "classic";

export function isValidFocusBackgroundSource(src: unknown): src is FocusBackgroundSource {
  return typeof src === "string" && (VALID_FOCUS_BACKGROUND_SOURCES as readonly string[]).includes(src as any);
}

export interface UserFocusBackgroundClient {
  id: number;
  userId: number;
  name: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number | null;
  focalY: number | null;
  timerPosition: FocusTimerPosition;
  layoutKey?: FocusTimerLayoutKey | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  signedUrl: string | null;
  signedUrlExpiresAt?: string | null;
}

export type FocusBackgroundSelection =
  | { source: "classic"; backgroundId: null; background: null }
  | { source: "official"; backgroundId: number; background: FocusBackgroundEntity }
  | { source: "custom"; backgroundId: number; background: UserFocusBackgroundClient };

export interface RefreshSignedUrlResponse {
  backgroundId: number;
  signedUrl: string;
  signedUrlExpiresAt: string;
}
