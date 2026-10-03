// ============================================================================
// Focus Backgrounds — Phase 6: Production Polish, Performance & Accessibility
// ============================================================================

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FocusBackgroundRenderer } from "@/app/focus/components/FocusBackgroundRenderer";
import FocusBackgroundPicker, {
  MY_BACKGROUNDS_SLUG,
} from "@/app/focus/components/FocusBackgroundPicker";
import {
  FocusBackgroundCatalog,
  FocusBackgroundCategoryClient,
  FocusBackgroundClient,
  CANONICAL_CLASSIC_SLUG,
  SYNTHETIC_CLASSIC_CATEGORY,
} from "@/lib/focus-background-client";
import { UserFocusBackgroundClient } from "@/lib/focus-background-types";

// Mock framer-motion to inspect reduced-motion and avoid timer delays
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

const stableMockUser = { id: 1, email: "tester@sylf.app" };
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: stableMockUser })),
}));

describe("Focus Backgrounds — Phase 6: Production Polish & Accessibility", () => {
  const sampleOfficialBg: FocusBackgroundClient = {
    id: 10,
    categoryId: 2,
    name: "Twilight Sanctum",
    publicUrl: "https://example.com/twilight.webp",
    storagePath: "anime/twilight.webp",
    width: 2560,
    height: 1440,
    aspectRatio: 1.7778,
    focalX: 0.75,
    focalY: 0.45,
    timerPosition: "left",
    sortOrder: 1,
    isActive: true,
  };

  const sampleCustomBg: UserFocusBackgroundClient = {
    id: 99,
    userId: 1,
    name: "My Cyber Study",
    width: 3840,
    height: 2160,
    aspectRatio: 1.7778,
    focalX: 0.3,
    focalY: 0.5,
    timerPosition: "right",
    layoutKey: "anime",
    fileSize: 2048500,
    mimeType: "image/webp",
    createdAt: "2026-09-09T10:00:00Z",
    signedUrl: "https://example.com/signed/cyber.webp",
  };

  const mockCatalog: FocusBackgroundCatalog = {
    categories: [
      SYNTHETIC_CLASSIC_CATEGORY,
      {
        id: 2,
        slug: "anime",
        name: "Anime",
        layoutKey: "anime",
        sortOrder: 1,
        isActive: true,
        backgrounds: [sampleOfficialBg],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("FocusBackgroundRenderer — Crossfade & Runtime Fallback", () => {
    it("renders ambient gradient fallback if image URL is invalid or missing", () => {
      render(
        <FocusBackgroundRenderer
          activeBackground={null}
          isClassic={true}
          phase="focus"
          layoutKey="classic"
        />
      );
      expect(screen.getByTestId("focus-bg-classic")).toBeInTheDocument();
    });

    it("gracefully falls back to ambient backdrop if image fails to render in DOM", () => {
      const onImageError = vi.fn();
      render(
        <FocusBackgroundRenderer
          activeBackground={sampleOfficialBg}
          isClassic={false}
          phase="focus"
          layoutKey="anime"
          onImageError={onImageError}
        />
      );

      const img = screen.getByRole("img", { hidden: true });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("decoding", "async");

      // Simulate runtime image decode/network load failure
      fireEvent.error(img);

      // Must fall back to ambient backdrop without throwing
      expect(screen.getByTestId("focus-bg-classic")).toBeInTheDocument();
      expect(onImageError).toHaveBeenCalledWith(
        expect.stringContaining("Unable to display \"Twilight Sanctum\"")
      );
    });
  });

  describe("FocusBackgroundPicker — Accessibility & Terminology", () => {
    it("renders accessible ARIA tablist with roving tabindex and tabpanel relationships", () => {
      render(
        <FocusBackgroundPicker
          isOpen={true}
          onClose={vi.fn()}
          catalog={mockCatalog}
          activeCategory={mockCatalog.categories[1]}
          activeBackground={sampleOfficialBg}
          isClassic={false}
          isPreloadingImage={false}
          loadError={null}
          onSelectBackground={vi.fn()}
          userCustomBackgrounds={[sampleCustomBg]}
          activeSource="official"
        />
      );

      // Tablist container
      const tablist = screen.getByRole("tablist", { name: "Focus environment categories" });
      expect(tablist).toBeInTheDocument();

      // Tabs
      const animeTab = screen.getByRole("tab", { name: /Anime/i });
      const classicTab = screen.getByRole("tab", { name: /Classic Sylf/i });
      const myBgTab = screen.getByRole("tab", { name: /My Backgrounds/i });

      expect(animeTab).toBeInTheDocument();
      expect(classicTab).toBeInTheDocument();
      expect(myBgTab).toBeInTheDocument();

      // Roving tabindex: active tab should have tabIndex=0, inactive tabIndex=-1
      expect(animeTab).toHaveAttribute("tabindex", "0");
      expect(classicTab).toHaveAttribute("tabindex", "-1");
      expect(myBgTab).toHaveAttribute("tabindex", "-1");

      // Tabpanel connection
      const tabpanel = screen.getByRole("tabpanel");
      expect(tabpanel).toHaveAttribute("id", "panel-anime");
      expect(tabpanel).toHaveAttribute("aria-labelledby", "tab-anime");
    });

    it("uses consistent user terminology: 'My Backgrounds' and 'Manage Environments' (never Studio for user vault)", () => {
      render(
        <FocusBackgroundPicker
          isOpen={true}
          onClose={vi.fn()}
          catalog={mockCatalog}
          activeCategory={mockCatalog.categories[1]}
          activeBackground={sampleOfficialBg}
          isClassic={false}
          isPreloadingImage={false}
          loadError={null}
          onSelectBackground={vi.fn()}
          userCustomBackgrounds={[]}
          activeSource="custom"
        />
      );

      // Custom empty state copy inspection
      expect(screen.getByText("No Personal Backgrounds")).toBeInTheDocument();
      expect(
        screen.getByText(/Upload and frame your personal study environments in Settings/i)
      ).toBeInTheDocument();

      // Button link must say 'Manage Environments' (NOT 'Open Background Studio')
      const manageBtn = screen.getByRole("link", { name: /Manage Environments/i });
      expect(manageBtn).toBeInTheDocument();
      expect(manageBtn).toHaveAttribute("href", "/settings/focus-backgrounds");
      expect(screen.queryByText(/Open Background Studio/i)).not.toBeInTheDocument();
    });

    it("includes decoding='async' and loading='lazy' hints on thumbnail previews", () => {
      render(
        <FocusBackgroundPicker
          isOpen={true}
          onClose={vi.fn()}
          catalog={mockCatalog}
          activeCategory={mockCatalog.categories[1]}
          activeBackground={sampleOfficialBg}
          isClassic={false}
          isPreloadingImage={false}
          loadError={null}
          onSelectBackground={vi.fn()}
          userCustomBackgrounds={[sampleCustomBg]}
          activeSource="official"
        />
      );

      const thumbnail = screen.getByAltText("Twilight Sanctum");
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("decoding", "async");
    });
  });

  describe("Preload Contract & Failed Preload Resilience", () => {
    it("returns false from preloadFocusImage if network/image load fails", async () => {
      const { preloadFocusImage } = await import("@/lib/focus-background-client");

      // Mock Image failure
      const originalImage = global.Image;
      class MockBrokenImage {
        onload: any = null;
        onerror: any = null;
        src = "";
        complete = false;
        naturalWidth = 0;
        constructor() {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event("error"));
          }, 10);
        }
      }
      global.Image = MockBrokenImage as any;

      try {
        const result = await preloadFocusImage("https://example.com/nonexistent.webp");
        expect(result).toBe(false);
      } finally {
        global.Image = originalImage;
      }
    });

    it("returns true from preloadFocusImage even if decode() rejects so long as image loaded", async () => {
      const { preloadFocusImage } = await import("@/lib/focus-background-client");

      const originalImage = global.Image;
      class MockLoadedDecodeRejectImage {
        onload: any = null;
        onerror: any = null;
        src = "";
        complete = false;
        naturalWidth = 1920;
        decode = vi.fn().mockRejectedValue(new Error("Decode hint failed"));
        constructor() {
          setTimeout(() => {
            if (this.onload) this.onload(new Event("load"));
          }, 10);
        }
      }
      global.Image = MockLoadedDecodeRejectImage as any;

      try {
        const result = await preloadFocusImage("https://example.com/good-image.webp");
        expect(result).toBe(true);
      } finally {
        global.Image = originalImage;
      }
    });

    it("retains active background A, prevents preference persistence, preserves timer state, and surfaces error when B preload fails", async () => {
      const { renderHook, act } = await import("@testing-library/react");
      const { useFocusBackground } = await import("@/app/focus/hooks/useFocusBackground");
      const prefLib = await import("@/lib/focus-background-preference");
      const clientLib = await import("@/lib/focus-background-client");

      const enqueueSpy = vi.spyOn(prefLib.focusPreferenceQueue, "enqueue").mockResolvedValue({ success: true });
      const saveLocalSpy = vi.spyOn(prefLib, "saveStoredPreference");

      const brokenBg = {
        id: 11,
        categoryId: 2,
        name: "Broken Cyberpunk",
        publicUrl: "https://example.com/broken.webp",
        storagePath: "anime/broken.webp",
        width: 2560,
        height: 1440,
        aspectRatio: 1.7778,
        focalX: 0.5,
        focalY: 0.5,
        timerPosition: "center" as const,
        sortOrder: 2,
        isActive: true,
      };

      vi.spyOn(clientLib, "fetchFocusBackgroundCatalog").mockResolvedValue({
        categories: [
          SYNTHETIC_CLASSIC_CATEGORY,
          {
            id: 2,
            slug: "anime",
            name: "Anime",
            layoutKey: "anime",
            sortOrder: 1,
            isActive: true,
            backgrounds: [sampleOfficialBg, brokenBg],
          },
        ],
      });

      const originalImage = global.Image;
      class MockControlledImage {
        onload: any = null;
        onerror: any = null;
        _src = "";
        complete = false;
        naturalWidth = 0;
        get src() {
          return this._src;
        }
        set src(val: string) {
          this._src = val;
          queueMicrotask(() => {
            if (val.includes("broken")) {
              this.naturalWidth = 0;
              if (this.onerror) this.onerror(new Event("error"));
            } else {
              this.naturalWidth = 1920;
              if (this.onload) this.onload(new Event("load"));
            }
          });
        }
      }
      global.Image = MockControlledImage as any;

      try {
        // Mock fetch for catalog, preference, and custom backgrounds
        vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
          const urlStr = String(url);
          if (urlStr === "/api/focus-backgrounds") {
            return {
              ok: true,
              json: async () => ({
                categories: [
                  SYNTHETIC_CLASSIC_CATEGORY,
                  {
                    id: 2,
                    slug: "anime",
                    name: "Anime",
                    layoutKey: "anime",
                    sortOrder: 1,
                    isActive: true,
                    backgrounds: [sampleOfficialBg, brokenBg],
                  },
                ],
              }),
            } as any;
          }
          if (urlStr === "/api/focus-backgrounds/preference") {
            return {
              ok: true,
              json: async () => ({
                version: 1,
                source: "official",
                categorySlug: "anime",
                backgroundId: 10,
                customBackground: null,
              }),
            } as any;
          }
          return {
            ok: true,
            json: async () => ({ backgrounds: [] }),
          } as any;
        });

        // Mock user authentication
        vi.spyOn(prefLib, "fetchServerPreference").mockResolvedValue({
          version: 1,
          source: "official",
          categorySlug: "anime",
          backgroundId: 10,
          customBackground: null,
          initialized: true,
          isClassic: false,
        });

        // Track active timer state to verify it remains unchanged
        let timerState = { timeLeft: 1420, isRunning: true, sessionMinutes: 25 };

        const { result } = renderHook(() => useFocusBackground());

        // Wait for catalog and preference initialization
        await act(async () => {
          await new Promise((r) => setTimeout(r, 60));
        });

        expect(result.current.activeBackground?.id).toBe(10);
        expect(result.current.activeBackground?.name).toBe("Twilight Sanctum");
        expect(result.current.activeSource).toBe("official");
        expect(timerState.timeLeft).toBe(1420);

        // Clear spy calls from initial setup
        enqueueSpy.mockClear();
        saveLocalSpy.mockClear();

        let selectSuccess = true;
        await act(async () => {
          selectSuccess = await result.current.selectBackground("anime", brokenBg);
        });

      // 3. Verify failure contract:
      // - selectBackground returned false
      expect(selectSuccess).toBe(false);

      // - Broken background B did NOT become active
      expect(result.current.activeBackground?.id).not.toBe(11);

      // - Working background A remains active!
      expect(result.current.activeBackground?.id).toBe(10);
      expect(result.current.activeBackground?.name).toBe("Twilight Sanctum");
      expect(result.current.activeSource).toBe("official");

      // - Server preference was NOT enqueued for B!
      expect(enqueueSpy).not.toHaveBeenCalledWith(expect.objectContaining({ backgroundId: 11 }));

      // - Local storage preference was NOT saved for B!
      expect(saveLocalSpy).not.toHaveBeenCalledWith(expect.objectContaining({ backgroundId: 11 }));

      // - Timer state remains completely undisturbed
      expect(timerState.timeLeft).toBe(1420);
      expect(timerState.isRunning).toBe(true);

      // - User receives clear, non-disruptive error feedback
      expect(result.current.loadError).toBe('Unable to load "Broken Cyberpunk". Retaining current environment.');
    } finally {
      global.Image = originalImage;
    }
  });

    it("ensures renderer-level failure after successful preload falls back visually without mutating stored preference", () => {
      const onImageError = vi.fn();
      const saveSpy = vi.spyOn(localStorage, "setItem");

      render(
        <FocusBackgroundRenderer
          activeBackground={sampleOfficialBg}
          isClassic={false}
          phase="focus"
          layoutKey="anime"
          onImageError={onImageError}
        />
      );

      const img = screen.getByRole("img", { hidden: true });
      expect(img).toBeInTheDocument();

      // Trigger runtime render error
      fireEvent.error(img);

      // Visually fell back to ambient classic
      expect(screen.getByTestId("focus-bg-classic")).toBeInTheDocument();
      expect(onImageError).toHaveBeenCalledWith(expect.stringContaining("Twilight Sanctum"));

      // Authoritative stored preference was NOT mutated or removed from localStorage
      expect(saveSpy).not.toHaveBeenCalledWith("sylf_focus_bg_preference", expect.anything());
    });
  });
});
