// ============================================================================
// Focus Backgrounds Client Catalog Layer
// ============================================================================
// Consumes GET /api/focus-backgrounds and normalizes categories, backgrounds,
// and layout keys. Guarantees Classic Sylf availability on network failure.
// ============================================================================
import { normalizeLayoutKey, normalizeTimerPosition, FocusTimerPosition } from "./focus-background-types";

export interface FocusBackgroundClient {
  id: number;
  categoryId: number;
  name: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number;
  focalY: number;
  timerPosition: FocusTimerPosition;
  sortOrder: number;
  isActive: boolean;
  publicUrl: string;
}

export interface FocusBackgroundCategoryClient {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  layoutKey: string;
  sortOrder: number;
  isActive: boolean;
  backgrounds: FocusBackgroundClient[];
}

export interface FocusBackgroundCatalog {
  categories: FocusBackgroundCategoryClient[];
}

export const CANONICAL_CLASSIC_SLUG = "classic-sylf";

/** Synthetic fallback used strictly when network or backend catalog is unreachable. */
export const SYNTHETIC_CLASSIC_CATEGORY: FocusBackgroundCategoryClient = {
  id: 0,
  slug: CANONICAL_CLASSIC_SLUG,
  name: "Classic Sylf",
  description: "Sylf's original ambient focus environment.",
  layoutKey: "classic",
  sortOrder: 0,
  isActive: true,
  backgrounds: [],
};

export async function fetchFocusBackgroundCatalog(): Promise<FocusBackgroundCatalog> {
  try {
    const res = await fetch("/api/focus-backgrounds");
    if (!res.ok) {
      throw new Error(`Catalog API responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawCategories: any[] = Array.isArray(data?.categories) ? data.categories : [];

    const categories: FocusBackgroundCategoryClient[] = rawCategories
      .filter((cat) => cat && cat.isActive !== false)
      .map((cat) => ({
        id: Number(cat.id) || 0,
        slug: String(cat.slug || ""),
        name: String(cat.name || ""),
        description: cat.description ? String(cat.description) : null,
        layoutKey: normalizeLayoutKey(cat.layoutKey),
        sortOrder: Number(cat.sortOrder) || 0,
        isActive: true,
        backgrounds: Array.isArray(cat.backgrounds)
          ? cat.backgrounds
              .filter((bg: any) => bg && bg.isActive !== false)
              .map((bg: any) => ({
                id: Number(bg.id),
                categoryId: Number(bg.categoryId),
                name: String(bg.name || "Untitled"),
                storagePath: String(bg.storagePath || ""),
                width: Number(bg.width) || 1920,
                height: Number(bg.height) || 1080,
                aspectRatio: Number(bg.aspectRatio) || 1.7778,
                focalX: typeof bg.focalX === "number" ? bg.focalX : 0.5,
                focalY: typeof bg.focalY === "number" ? bg.focalY : 0.5,
                timerPosition: normalizeTimerPosition(bg.timerPosition),
                sortOrder: Number(bg.sortOrder) || 0,
                isActive: true,
                publicUrl: String(bg.publicUrl || ""),
              }))
              .sort((a: FocusBackgroundClient, b: FocusBackgroundClient) => a.sortOrder - b.sortOrder)
          : [],
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // If backend did not include a classic-sylf category, add the fallback
    const hasClassic = categories.some((c) => c.slug === CANONICAL_CLASSIC_SLUG);
    if (!hasClassic) {
      categories.unshift(SYNTHETIC_CLASSIC_CATEGORY);
    }

    return { categories };
  } catch (err) {
    console.warn("[focus-background-client] Failed to load catalog, using Classic fallback:", err);
    return { categories: [SYNTHETIC_CLASSIC_CATEGORY] };
  }
}

/**
 * Preloads and asynchronously decodes an image URL into browser cache before replacing active wallpaper.
 *
 * Explicit contract:
 * - true  -> image loaded successfully; decode was attempted (safe to apply)
 * - false -> network/image load failed; do NOT apply new selection, do NOT persist preference
 *
 * Note: A decode() rejection alone does not fail preload if the image itself loaded successfully.
 */
export function preloadFocusImage(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!url || typeof window === "undefined") {
      resolve(false);
      return;
    }

    const img = new Image();
    let isSettled = false;

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    const finish = (success: boolean) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve(success);
    };

    img.onload = async () => {
      try {
        if (typeof img.decode === "function") {
          try {
            await img.decode();
          } catch (decodeErr) {
            // Decode rejection alone does not fail preload if the image loaded successfully
            console.debug("[preloadFocusImage] Image decode hint rejected, proceeding with loaded image:", decodeErr);
          }
        }
      } finally {
        finish(true);
      }
    };

    img.onerror = () => {
      finish(false);
    };

    img.src = url;

    // Handle already-cached or synchronously evaluated images cleanly
    if (img.complete) {
      if (img.naturalWidth > 0) {
        if (typeof img.decode === "function") {
          img.decode()
            .catch(() => {})
            .finally(() => finish(true));
        } else {
          finish(true);
        }
      } else {
        finish(false);
      }
    }
  });
}
