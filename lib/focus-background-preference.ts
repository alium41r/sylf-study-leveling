// ============================================================================
// Focus Background User Preference Abstraction (Phase 4 & Phase 5B)
// ============================================================================
// Manages local caching (v3 with v2 migration), server persistence,
// latest-write-wins serialization, signed URL refresh, and referential
// fallback resolution against the live catalog.
// ============================================================================
import {
  FocusBackgroundCatalog,
  FocusBackgroundCategoryClient,
  FocusBackgroundClient,
  CANONICAL_CLASSIC_SLUG,
  SYNTHETIC_CLASSIC_CATEGORY,
} from "./focus-background-client";
import {
  FocusBackgroundSource,
  isValidFocusBackgroundSource,
  UserFocusBackgroundClient,
  RefreshSignedUrlResponse,
} from "./focus-background-types";

export { CANONICAL_CLASSIC_SLUG, SYNTHETIC_CLASSIC_CATEGORY };

export const FOCUS_BG_PREFERENCE_STORAGE_KEY_V2 = "sylf_focus_bg_pref_v2";
export const FOCUS_BG_PREFERENCE_STORAGE_KEY = "sylf_focus_bg_pref_v3";

export interface StoredFocusBackgroundPreference {
  source?: FocusBackgroundSource;
  categorySlug: string;
  backgroundId: number | null; // null represents Classic Sylf
}

export const DEFAULT_FOCUS_BG_PREFERENCE: StoredFocusBackgroundPreference = {
  source: "classic",
  categorySlug: CANONICAL_CLASSIC_SLUG,
  backgroundId: null,
};

export interface ServerFocusBackgroundPreference {
  initialized: boolean;
  version: number;
  source: FocusBackgroundSource;
  backgroundId: number | null;
  categorySlug: string;
  isClassic: boolean;
  resetFromInvalid?: boolean;
  customBackground?: UserFocusBackgroundClient | null;
}

// ─── Local Storage Operations ────────────────────────────────────────────────

export function loadStoredPreference(): StoredFocusBackgroundPreference {
  if (typeof window === "undefined") {
    return DEFAULT_FOCUS_BG_PREFERENCE;
  }

  try {
    // 1. Try reading v3 preference
    const rawV3 = localStorage.getItem(FOCUS_BG_PREFERENCE_STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3);
      if (
        parsed &&
        typeof parsed === "object" &&
        isValidFocusBackgroundSource(parsed.source)
      ) {
        if (parsed.source === "classic") {
          return {
            source: "classic",
            categorySlug: CANONICAL_CLASSIC_SLUG,
            backgroundId: null,
          };
        }

        const backgroundId =
          typeof parsed.backgroundId === "number" &&
          Number.isSafeInteger(parsed.backgroundId) &&
          parsed.backgroundId > 0
            ? parsed.backgroundId
            : null;

        if (backgroundId) {
          return {
            source: parsed.source,
            categorySlug:
              typeof parsed.categorySlug === "string"
                ? parsed.categorySlug
                : parsed.source === "custom"
                ? "custom"
                : CANONICAL_CLASSIC_SLUG,
            backgroundId,
          };
        }
      }
    }

    // 2. Gracefully migrate from v2
    const rawV2 = localStorage.getItem(FOCUS_BG_PREFERENCE_STORAGE_KEY_V2);
    if (rawV2) {
      const parsedV2 = JSON.parse(rawV2);
      if (parsedV2 && typeof parsedV2 === "object") {
        const bgId =
          typeof parsedV2.backgroundId === "number" &&
          Number.isSafeInteger(parsedV2.backgroundId) &&
          parsedV2.backgroundId > 0
            ? parsedV2.backgroundId
            : null;

        const migrated: StoredFocusBackgroundPreference = bgId
          ? {
              source: "official",
              categorySlug:
                typeof parsedV2.categorySlug === "string"
                  ? parsedV2.categorySlug
                  : CANONICAL_CLASSIC_SLUG,
              backgroundId: bgId,
            }
          : {
              source: "classic",
              categorySlug: CANONICAL_CLASSIC_SLUG,
              backgroundId: null,
            };

        localStorage.setItem(FOCUS_BG_PREFERENCE_STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(FOCUS_BG_PREFERENCE_STORAGE_KEY_V2);
        return migrated;
      }
    }

    return DEFAULT_FOCUS_BG_PREFERENCE;
  } catch {
    return DEFAULT_FOCUS_BG_PREFERENCE;
  }
}

export function saveStoredPreference(pref: StoredFocusBackgroundPreference): void {
  if (typeof window === "undefined") return;

  try {
    const source: FocusBackgroundSource = isValidFocusBackgroundSource(pref.source)
      ? pref.source
      : pref.backgroundId
      ? "official"
      : "classic";

    const backgroundId =
      source !== "classic" &&
      typeof pref.backgroundId === "number" &&
      Number.isSafeInteger(pref.backgroundId) &&
      pref.backgroundId > 0
        ? pref.backgroundId
        : null;

    const payload: StoredFocusBackgroundPreference = {
      source: backgroundId === null ? "classic" : source,
      categorySlug:
        pref.categorySlug || (source === "custom" ? "custom" : CANONICAL_CLASSIC_SLUG),
      backgroundId: backgroundId === null ? null : backgroundId,
    };
    localStorage.setItem(FOCUS_BG_PREFERENCE_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[focus-background-preference] Failed to save preference to localStorage:", err);
  }
}

export function clearStoredPreference(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FOCUS_BG_PREFERENCE_STORAGE_KEY);
    localStorage.removeItem(FOCUS_BG_PREFERENCE_STORAGE_KEY_V2);
  } catch {}
}

// ─── Server Communication ────────────────────────────────────────────────────

/**
 * Fetches current authenticated user preference from server.
 * Returns null if user is unauthenticated (401) or network fails.
 */
export async function fetchServerPreference(): Promise<ServerFocusBackgroundPreference | null> {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch("/api/focus-backgrounds/preference", {
      method: "GET",
      credentials: "include",
    });

    if (res.status === 401) {
      // Unauthenticated / guest session
      return null;
    }

    if (!res.ok) {
      console.warn(
        `[focus-background-preference] Server returned HTTP ${res.status} when fetching preference`
      );
      return null;
    }

    const data = await res.json();
    return data as ServerFocusBackgroundPreference;
  } catch (err) {
    console.warn("[focus-background-preference] Failed to fetch server preference:", err);
    return null;
  }
}

export interface ServerPreferencePayload {
  source?: FocusBackgroundSource;
  backgroundId: number | null;
}

/**
 * Sends a single PATCH request to update user preference on server.
 */
export async function sendServerPreference(
  payload: ServerPreferencePayload | number | null
): Promise<{ success: boolean; data?: ServerFocusBackgroundPreference; error?: string }> {
  try {
    const body: ServerPreferencePayload =
      typeof payload === "object" && payload !== null
        ? payload
        : {
            source: payload === null ? "classic" : "official",
            backgroundId: payload,
          };

    const res = await fetch("/api/focus-backgrounds/preference", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errBody.error || `HTTP ${res.status}`,
      };
    }

    const data: ServerFocusBackgroundPreference = await res.json();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network request failed" };
  }
}

/**
 * Refreshes the signed URL for the user's current authoritative custom background.
 */
export async function fetchSignedUrlRefresh(): Promise<RefreshSignedUrlResponse | null> {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch("/api/focus-backgrounds/preference/refresh-signed-url", {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data as RefreshSignedUrlResponse;
  } catch (err) {
    console.warn("[focus-background-preference] Failed to refresh signed URL:", err);
    return null;
  }
}

// ─── Latest-Write-Wins Sequential Mutex Queue ────────────────────────────────

export interface QueueItem {
  source: FocusBackgroundSource;
  backgroundId: number | null;
}

/**
 * Sequential Mutex Write Queue:
 * Guarantees that rapid successive user clicks are never executed out-of-order
 * on the server. Superseded intermediate states are collapsed so only the latest
 * intended selection is dispatched.
 */
class FocusPreferenceWriteQueue {
  private inFlight = false;
  private pendingTarget: QueueItem | undefined = undefined;
  private lastConfirmed: QueueItem | undefined = undefined;
  private subscribers: Array<{
    target: QueueItem;
    resolve: (res: { success: boolean; data?: ServerFocusBackgroundPreference }) => void;
  }> = [];

  public enqueue(
    target: QueueItem | number | null
  ): Promise<{ success: boolean; data?: ServerFocusBackgroundPreference }> {
    const normalized: QueueItem =
      typeof target === "object" && target !== null
        ? target
        : {
            source: target === null ? "classic" : "official",
            backgroundId: target,
          };

    return new Promise((resolve) => {
      this.pendingTarget = normalized;
      this.subscribers.push({ target: normalized, resolve });

      if (!this.inFlight) {
        this.processQueue();
      }
    });
  }

  public getLastConfirmed(): QueueItem | undefined {
    return this.lastConfirmed;
  }

  public setLastConfirmed(val: QueueItem | undefined) {
    this.lastConfirmed = val;
  }

  private async processQueue() {
    if (this.inFlight) return;
    this.inFlight = true;

    while (this.pendingTarget !== undefined) {
      const currentTarget = this.pendingTarget;
      this.pendingTarget = undefined;

      const result = await sendServerPreference(currentTarget);

      if (result.success && result.data) {
        this.lastConfirmed = {
          source: result.data.source || (result.data.backgroundId ? "official" : "classic"),
          backgroundId: result.data.backgroundId,
        };
      }

      const remainingSubs: typeof this.subscribers = [];
      for (const sub of this.subscribers) {
        if (
          sub.target.source === currentTarget.source &&
          sub.target.backgroundId === currentTarget.backgroundId
        ) {
          sub.resolve(result);
        } else if (this.pendingTarget === undefined) {
          sub.resolve(result);
        } else {
          remainingSubs.push(sub);
        }
      }
      this.subscribers = remainingSubs;
    }

    this.inFlight = false;
  }
}

export const focusPreferenceQueue = new FocusPreferenceWriteQueue();

// ─── Live Catalog Resolution ─────────────────────────────────────────────────

export interface ResolvedFocusBackground {
  category: FocusBackgroundCategoryClient;
  background: FocusBackgroundClient | null;
  isClassic: boolean;
  isFallback: boolean;
}

/**
 * Resolves the stored preference against the live catalog.
 * If the selected background or category no longer exists / is inactive,
 * cleans up local cache and safely falls back to Classic Sylf.
 */
export function resolveActiveBackground(
  stored: StoredFocusBackgroundPreference,
  catalog: FocusBackgroundCatalog
): ResolvedFocusBackground {
  const classicCategory =
    catalog.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) || SYNTHETIC_CLASSIC_CATEGORY;

  const source: FocusBackgroundSource =
    stored.source || (stored.backgroundId ? "official" : "classic");

  // 1. Explicit classic selection
  if (source === "classic" || !stored.backgroundId || stored.categorySlug === CANONICAL_CLASSIC_SLUG) {
    return {
      category: classicCategory,
      background: null,
      isClassic: true,
      isFallback: false,
    };
  }

  // 2. Locate category for official backgrounds
  if (source === "official") {
    const targetCategory = catalog.categories.find((c) => c.slug === stored.categorySlug);
    if (!targetCategory) {
      clearStoredPreference();
      return {
        category: classicCategory,
        background: null,
        isClassic: true,
        isFallback: true,
      };
    }

    // Locate background in category
    const targetBg = targetCategory.backgrounds.find((bg) => bg.id === stored.backgroundId);
    if (!targetBg || !targetBg.isActive || !targetBg.publicUrl) {
      clearStoredPreference();
      return {
        category: classicCategory,
        background: null,
        isClassic: true,
        isFallback: true,
      };
    }

    return {
      category: targetCategory,
      background: targetBg,
      isClassic: false,
      isFallback: false,
    };
  }

  // Custom source: cannot be fully resolved against static catalog alone
  return {
    category: classicCategory,
    background: null,
    isClassic: false,
    isFallback: false,
  };
}
