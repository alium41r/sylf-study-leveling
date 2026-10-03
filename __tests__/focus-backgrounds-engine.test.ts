import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchFocusBackgroundCatalog,
  CANONICAL_CLASSIC_SLUG,
  SYNTHETIC_CLASSIC_CATEGORY,
  FocusBackgroundCatalog,
} from "@/lib/focus-background-client";
import {
  loadStoredPreference,
  saveStoredPreference,
  clearStoredPreference,
  resolveActiveBackground,
  DEFAULT_FOCUS_BG_PREFERENCE,
  FOCUS_BG_PREFERENCE_STORAGE_KEY,
} from "@/lib/focus-background-preference";

describe("Focus Backgrounds Engine — Client Data Layer", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches, sorts, and normalizes catalog with layoutKey safety", async () => {
    const mockPayload = {
      categories: [
        {
          id: 2,
          slug: "anime",
          name: "Anime Atmosphere",
          layoutKey: "anime",
          sortOrder: 1,
          isActive: true,
          backgrounds: [
            {
              id: 201,
              categoryId: 2,
              name: "Sky Temple",
              storagePath: "anime/temple.png",
              width: 3840,
              height: 2160,
              aspectRatio: 1.7778,
              focalX: 0.7,
              focalY: 0.3,
              sortOrder: 0,
              isActive: true,
              publicUrl: "https://mock.supabase.co/anime/temple.png",
            },
            {
              id: 202,
              categoryId: 2,
              name: "Hidden Unreleased Asset",
              storagePath: "anime/hidden.png",
              width: 1920,
              height: 1080,
              aspectRatio: 1.7778,
              isActive: false, // inactive: must be filtered out
              publicUrl: "https://mock.supabase.co/anime/hidden.png",
            },
          ],
        },
        {
          id: 1,
          slug: "classic-sylf",
          name: "Classic Sylf",
          layoutKey: "unknown-corrupted-key",
          sortOrder: 0,
          isActive: true,
          backgrounds: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as any);

    const catalog = await fetchFocusBackgroundCatalog();
    expect(catalog.categories.length).toBe(2);

    // Sorted by sortOrder
    expect(catalog.categories[0].slug).toBe("classic-sylf");
    expect(catalog.categories[0].layoutKey).toBe("classic"); // normalized from unknown key

    expect(catalog.categories[1].slug).toBe("anime");
    expect(catalog.categories[1].backgrounds.length).toBe(1); // filtered out inactive
    expect(catalog.categories[1].backgrounds[0].name).toBe("Sky Temple");
    expect(catalog.categories[1].backgrounds[0].focalX).toBe(0.7);
  });

  it("safely falls back to synthetic Classic Sylf on network or API failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

    const catalog = await fetchFocusBackgroundCatalog();
    expect(catalog.categories.length).toBe(1);
    expect(catalog.categories[0].slug).toBe(CANONICAL_CLASSIC_SLUG);
    expect(catalog.categories[0].name).toBe("Classic Sylf");
    expect(catalog.categories[0].layoutKey).toBe("classic");
  });

  it("safely falls back to synthetic Classic Sylf on HTTP 500 error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const catalog = await fetchFocusBackgroundCatalog();
    expect(catalog.categories.length).toBe(1);
    expect(catalog.categories[0].slug).toBe(CANONICAL_CLASSIC_SLUG);
  });
});

describe("Focus Backgrounds Engine — Preference Persistence Abstraction", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default Classic Sylf preference when localStorage is empty", () => {
    const pref = loadStoredPreference();
    expect(pref.categorySlug).toBe(CANONICAL_CLASSIC_SLUG);
    expect(pref.backgroundId).toBeNull();
  });

  it("persists strictly categorySlug and backgroundId without storing stale URLs or metadata", () => {
    saveStoredPreference({
      categorySlug: "landscapes",
      backgroundId: 42,
    });

    const raw = mockStorage[FOCUS_BG_PREFERENCE_STORAGE_KEY];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);

    expect(parsed).toEqual({
      source: "official",
      categorySlug: "landscapes",
      backgroundId: 42,
    });
    // Verifies no stale metadata persisted
    expect(parsed.publicUrl).toBeUndefined();
    expect(parsed.focalX).toBeUndefined();
    expect(parsed.storagePath).toBeUndefined();

    const loaded = loadStoredPreference();
    expect(loaded.categorySlug).toBe("landscapes");
    expect(loaded.backgroundId).toBe(42);
  });

  it("handles corrupted localStorage data by returning defaults safely", () => {
    mockStorage[FOCUS_BG_PREFERENCE_STORAGE_KEY] = "{ not valid json";
    expect(loadStoredPreference()).toEqual(DEFAULT_FOCUS_BG_PREFERENCE);

    mockStorage[FOCUS_BG_PREFERENCE_STORAGE_KEY] = JSON.stringify({ categorySlug: 12345 });
    expect(loadStoredPreference()).toEqual(DEFAULT_FOCUS_BG_PREFERENCE);
  });

  it("clears stored preference cleanly", () => {
    saveStoredPreference({ categorySlug: "anime", backgroundId: 10 });
    clearStoredPreference();
    expect(loadStoredPreference()).toEqual(DEFAULT_FOCUS_BG_PREFERENCE);
  });
});

describe("Focus Backgrounds Engine — Active Background Dynamic Resolution & Fallbacks", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleCatalog: FocusBackgroundCatalog = {
    categories: [
      {
        id: 1,
        slug: "classic-sylf",
        name: "Classic Sylf",
        layoutKey: "classic",
        sortOrder: 0,
        isActive: true,
        backgrounds: [],
      },
      {
        id: 2,
        slug: "fantasy",
        name: "Fantasy Realms",
        layoutKey: "fantasy",
        sortOrder: 1,
        isActive: true,
        backgrounds: [
          {
            id: 55,
            categoryId: 2,
            name: "Crystal Citadel",
            storagePath: "fantasy/citadel.png",
            width: 3840,
            height: 2160,
            aspectRatio: 1.7778,
            focalX: 0.5,
            focalY: 0.4,
            timerPosition: "auto",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.supabase.co/fantasy/citadel.png",
          },
        ],
      },
    ],
  };

  it("resolves active background dynamically using fresh metadata from catalog", () => {
    const resolved = resolveActiveBackground(
      { categorySlug: "fantasy", backgroundId: 55 },
      sampleCatalog
    );

    expect(resolved.isClassic).toBe(false);
    expect(resolved.isFallback).toBe(false);
    expect(resolved.background?.name).toBe("Crystal Citadel");
    expect(resolved.background?.publicUrl).toBe("https://mock.supabase.co/fantasy/citadel.png");
    expect(resolved.category.slug).toBe("fantasy");
  });

  it("safely falls back to Classic Sylf if saved backgroundId no longer exists in catalog", () => {
    saveStoredPreference({ categorySlug: "fantasy", backgroundId: 999 }); // deleted background

    const resolved = resolveActiveBackground(
      { categorySlug: "fantasy", backgroundId: 999 },
      sampleCatalog
    );

    expect(resolved.isClassic).toBe(true);
    expect(resolved.isFallback).toBe(true);
    expect(resolved.background).toBeNull();
    expect(resolved.category.slug).toBe(CANONICAL_CLASSIC_SLUG);

    // Stale preference must be cleaned from localStorage
    expect(mockStorage[FOCUS_BG_PREFERENCE_STORAGE_KEY]).toBeUndefined();
  });

  it("safely falls back to Classic Sylf if saved category no longer exists in catalog", () => {
    saveStoredPreference({ categorySlug: "deleted-category", backgroundId: 10 });

    const resolved = resolveActiveBackground(
      { categorySlug: "deleted-category", backgroundId: 10 },
      sampleCatalog
    );

    expect(resolved.isClassic).toBe(true);
    expect(resolved.isFallback).toBe(true);
    expect(resolved.background).toBeNull();
    expect(mockStorage[FOCUS_BG_PREFERENCE_STORAGE_KEY]).toBeUndefined();
  });

  it("resolves Classic Sylf as canonical entry when backgroundId is null", () => {
    const resolved = resolveActiveBackground(
      { categorySlug: CANONICAL_CLASSIC_SLUG, backgroundId: null },
      sampleCatalog
    );

    expect(resolved.isClassic).toBe(true);
    expect(resolved.isFallback).toBe(false);
    expect(resolved.background).toBeNull();
    expect(resolved.category.slug).toBe(CANONICAL_CLASSIC_SLUG);
  });
});
