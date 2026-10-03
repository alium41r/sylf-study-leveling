// ============================================================================
// Focus Background React Hook (Phase 4 & Phase 5B)
// ============================================================================
// Manages catalog fetching, active background resolution, custom library loading,
// image preloading, authenticated server preference persistence with
// latest-write-wins serialization, signed URL refresh lifecycle (with tab-sleep
// and selection-race safety), auth-loss fallback to Classic, and picker dialog visibility.
// ============================================================================
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import {
  FocusBackgroundCatalog,
  FocusBackgroundCategoryClient,
  FocusBackgroundClient,
  fetchFocusBackgroundCatalog,
  preloadFocusImage,
  CANONICAL_CLASSIC_SLUG,
  SYNTHETIC_CLASSIC_CATEGORY,
} from "@/lib/focus-background-client";
import {
  loadStoredPreference,
  saveStoredPreference,
  clearStoredPreference,
  resolveActiveBackground,
  fetchServerPreference,
  fetchSignedUrlRefresh,
  focusPreferenceQueue,
} from "@/lib/focus-background-preference";
import {
  FocusBackgroundSource,
  UserFocusBackgroundClient,
} from "@/lib/focus-background-types";

export interface UseFocusBackgroundReturn {
  catalog: FocusBackgroundCatalog;
  isLoadingCatalog: boolean;
  isPreloadingImage: boolean;
  loadError: string | null;
  clearLoadError: () => void;
  onImageDeliveryError: (msg: string) => void;
  syncError: string | null;
  clearSyncError: () => void;

  // Active Environment State
  activeSource: FocusBackgroundSource;
  activeCategory: FocusBackgroundCategoryClient;
  activeBackground: FocusBackgroundClient | null;
  activeCustomBackground: UserFocusBackgroundClient | null;
  customBackgrounds: UserFocusBackgroundClient[];
  isLoadingCustomBackgrounds: boolean;
  isClassic: boolean;
  layoutKey: string;

  // Picker Controls
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  togglePicker: () => void;
  selectBackground: (
    categorySlug: string,
    bg: FocusBackgroundClient | null
  ) => Promise<boolean>;
  selectCustomBackground: (
    bg: UserFocusBackgroundClient
  ) => Promise<boolean>;
  refreshCustomBackgrounds: () => Promise<void>;
}

export function useFocusBackground(): UseFocusBackgroundReturn {
  // Safely read user auth state (graceful fallback in test environments without AuthProvider)
  let user: any = null;
  try {
    const auth = useAuth();
    user = auth?.user ?? null;
  } catch {
    user = null;
  }

  const [catalog, setCatalog] = useState<FocusBackgroundCatalog>({
    categories: [SYNTHETIC_CLASSIC_CATEGORY],
  });
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isPreloadingImage, setIsPreloadingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Active state
  const [activeSource, setActiveSource] = useState<FocusBackgroundSource>("classic");
  const [activeCategory, setActiveCategory] = useState<FocusBackgroundCategoryClient>(SYNTHETIC_CLASSIC_CATEGORY);
  const [activeBackground, setActiveBackground] = useState<FocusBackgroundClient | null>(null);
  const [activeCustomBackground, setActiveCustomBackground] = useState<UserFocusBackgroundClient | null>(null);
  const [customBackgrounds, setCustomBackgrounds] = useState<UserFocusBackgroundClient[]>([]);
  const [isLoadingCustomBackgrounds, setIsLoadingCustomBackgrounds] = useState(false);
  const [isClassic, setIsClassic] = useState(true);

  // Synchronous refs for race condition guards & background lifecycle
  const activeSourceRef = useRef<FocusBackgroundSource>("classic");
  activeSourceRef.current = activeSource;

  const activeCustomBackgroundRef = useRef<UserFocusBackgroundClient | null>(null);
  activeCustomBackgroundRef.current = activeCustomBackground;

  const signedUrlExpiresAtRef = useRef<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearLoadError = useCallback(() => {
    setLoadError(null);
  }, []);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  const onImageDeliveryError = useCallback((msg: string) => {
    setLoadError(msg);
  }, []);

  // Preload and asynchronously decode an image URL into browser cache before replacing active wallpaper
  const preloadImage = useCallback((url: string): Promise<boolean> => {
    return preloadFocusImage(url);
  }, []);

  // Fetch personal custom backgrounds for authenticated user
  const fetchCustomBackgroundsList = useCallback(async () => {
    if (!user) {
      setCustomBackgrounds([]);
      return;
    }

    setIsLoadingCustomBackgrounds(true);
    try {
      const res = await fetch("/api/user/focus-backgrounds", {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomBackgrounds(data.backgrounds || []);
      }
    } catch (err) {
      console.warn("[useFocusBackground] Failed to fetch custom backgrounds:", err);
    } finally {
      setIsLoadingCustomBackgrounds(false);
    }
  }, [user?.id]);

  // Refresh scheduled timer execution
  const performSignedUrlRefresh = useCallback(async () => {
    if (activeSourceRef.current !== "custom" || !activeCustomBackgroundRef.current) return;
    const currentId = activeCustomBackgroundRef.current.id;

    const res = await fetchSignedUrlRefresh();
    if (!res) return;

    // Selection-Race Safety (Correction #4):
    // Apply refresh response ONLY if still on custom source and matching same background ID
    if (
      activeSourceRef.current !== "custom" ||
      !activeCustomBackgroundRef.current ||
      activeCustomBackgroundRef.current.id !== res.backgroundId
    ) {
      return;
    }

    // Preload replacement signed URL before swapping so no flicker occurs
    const ok = await preloadImage(res.signedUrl);
    if (
      !ok ||
      activeSourceRef.current !== "custom" ||
      !activeCustomBackgroundRef.current ||
      activeCustomBackgroundRef.current.id !== res.backgroundId
    ) {
      return;
    }

    // Seamlessly swap signedUrl without altering timer or session state
    const updated: UserFocusBackgroundClient = {
      ...activeCustomBackgroundRef.current,
      signedUrl: res.signedUrl,
      signedUrlExpiresAt: res.signedUrlExpiresAt,
    };

    setActiveCustomBackground(updated);
    setActiveBackground({
      ...updated,
      publicUrl: res.signedUrl,
      source: "custom",
    } as any);

    signedUrlExpiresAtRef.current = res.signedUrlExpiresAt;

    // Schedule next refresh 5 minutes before expiration
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    const expiresMs = new Date(res.signedUrlExpiresAt).getTime();
    const delay = Math.max(10_000, expiresMs - Date.now() - 5 * 60 * 1000);
    refreshTimeoutRef.current = setTimeout(performSignedUrlRefresh, delay);
  }, [preloadImage]);

  // Schedule next signed URL refresh
  const scheduleSignedUrlRefresh = useCallback(
    (expiresAtIso: string) => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      signedUrlExpiresAtRef.current = expiresAtIso;

      const expiresMs = new Date(expiresAtIso).getTime();
      const delay = Math.max(10_000, expiresMs - Date.now() - 5 * 60 * 1000);
      refreshTimeoutRef.current = setTimeout(performSignedUrlRefresh, delay);
    },
    [performSignedUrlRefresh]
  );

  // 1. Initial Load: Fetch Catalog, Initial Paint from LocalStorage, and Reconcile with Server
  useEffect(() => {
    let isMounted = true;

    async function initCatalogAndPreference() {
      try {
        const cat = await fetchFocusBackgroundCatalog();
        if (!isMounted) return;

        setCatalog(cat);

        // Fetch user custom library if authenticated
        if (user) {
          fetchCustomBackgroundsList();
        }

        // Step A: Fast initial paint from local preference
        const localStored = loadStoredPreference();

        if (localStored.source === "custom") {
          // Custom Startup (Correction #6):
          // Cached custom preference cannot immediately render private image before server resolution.
          // Keep Classic visual temporarily (zero broken image requests).
          setActiveSource("classic");
          setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
          setActiveBackground(null);
          setActiveCustomBackground(null);
          setIsClassic(true);
        } else {
          // Official or Classic
          const resolved = resolveActiveBackground(localStored, cat);
          if (resolved.isClassic || !resolved.background) {
            setActiveSource("classic");
            setActiveCategory(resolved.category);
            setActiveBackground(null);
            setActiveCustomBackground(null);
            setIsClassic(true);
          } else {
            setIsPreloadingImage(true);
            const ok = await preloadImage(resolved.background.publicUrl);
            if (!isMounted) return;
            setIsPreloadingImage(false);

            if (ok) {
              setActiveSource("official");
              setActiveCategory(resolved.category);
              setActiveBackground(resolved.background);
              setActiveCustomBackground(null);
              setIsClassic(false);
            } else {
              clearStoredPreference();
              const classic =
                cat.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) ||
                SYNTHETIC_CLASSIC_CATEGORY;
              setActiveSource("classic");
              setActiveCategory(classic);
              setActiveBackground(null);
              setActiveCustomBackground(null);
              setIsClassic(true);
            }
          }
        }

        // Step B: Authenticated Server Preference Reconciliation
        if (user) {
          const serverPref = await fetchServerPreference();
          if (!isMounted || !serverPref) return;

          if (serverPref.version === 0) {
            // Server preference never initialized: migrate local selection once
            if (localStored.source === "official" && localStored.backgroundId !== null) {
              const matchingBg = cat.categories
                .flatMap((c) => c.backgrounds)
                .find((b) => b.id === localStored.backgroundId && b.isActive);

              if (matchingBg) {
                focusPreferenceQueue.enqueue({ source: "official", backgroundId: matchingBg.id });
              } else {
                focusPreferenceQueue.enqueue({ source: "classic", backgroundId: null });
              }
            } else {
              focusPreferenceQueue.enqueue({ source: "classic", backgroundId: null });
            }
          } else {
            // Server preference is authoritative: SERVER ALWAYS WINS
            if (serverPref.source === "custom" && serverPref.customBackground?.signedUrl) {
              // Reconcile custom background
              const customBg = serverPref.customBackground;
              const signedUrl = customBg.signedUrl;
              const ok = signedUrl ? await preloadImage(signedUrl) : false;
              if (ok && isMounted) {
                setActiveSource("custom");
                setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
                setActiveCustomBackground(customBg);
                setActiveBackground({
                  ...customBg,
                  publicUrl: customBg.signedUrl,
                  source: "custom",
                } as any);
                setIsClassic(false);

                if (customBg.signedUrlExpiresAt) {
                  scheduleSignedUrlRefresh(customBg.signedUrlExpiresAt);
                }

                saveStoredPreference({
                  source: "custom",
                  categorySlug: "custom",
                  backgroundId: customBg.id,
                });
              } else if (isMounted) {
                // Preload failure or deleted custom: fall back to Classic
                setActiveSource("classic");
                setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
                setActiveBackground(null);
                setActiveCustomBackground(null);
                setIsClassic(true);
                saveStoredPreference({
                  source: "classic",
                  categorySlug: CANONICAL_CLASSIC_SLUG,
                  backgroundId: null,
                });
              }
            } else if (serverPref.source === "official" && serverPref.backgroundId !== null) {
              // Reconcile official background
              const targetBg = cat.categories
                .flatMap((c) => c.backgrounds)
                .find((b) => b.id === serverPref.backgroundId && b.isActive);
              const targetCat = cat.categories.find((c) => c.slug === serverPref.categorySlug);

              if (targetBg && targetCat) {
                const ok = await preloadImage(targetBg.publicUrl);
                if (ok && isMounted) {
                  setActiveSource("official");
                  setActiveCategory(targetCat);
                  setActiveBackground(targetBg);
                  setActiveCustomBackground(null);
                  setIsClassic(false);
                  saveStoredPreference({
                    source: "official",
                    categorySlug: serverPref.categorySlug,
                    backgroundId: targetBg.id,
                  });
                }
              } else {
                // Stale official on server: fall back to Classic
                const classicCat =
                  cat.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) ||
                  SYNTHETIC_CLASSIC_CATEGORY;
                setActiveSource("classic");
                setActiveCategory(classicCat);
                setActiveBackground(null);
                setActiveCustomBackground(null);
                setIsClassic(true);
                saveStoredPreference({
                  source: "classic",
                  categorySlug: CANONICAL_CLASSIC_SLUG,
                  backgroundId: null,
                });
              }
            } else {
              // Server has explicitly selected Classic
              const classicCat =
                cat.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) ||
                SYNTHETIC_CLASSIC_CATEGORY;
              setActiveSource("classic");
              setActiveCategory(classicCat);
              setActiveBackground(null);
              setActiveCustomBackground(null);
              setIsClassic(true);
              saveStoredPreference({
                source: "classic",
                categorySlug: CANONICAL_CLASSIC_SLUG,
                backgroundId: null,
              });
            }
          }
        }
      } catch (err) {
        console.warn("[useFocusBackground] Catalog/preference initialization error:", err);
      } finally {
        if (isMounted) {
          setIsLoadingCatalog(false);
        }
      }
    }

    initCatalogAndPreference();

    return () => {
      isMounted = false;
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [preloadImage, user?.id, fetchCustomBackgroundsList, scheduleSignedUrlRefresh]);

  // 2. Handle Sleeping / Background Tabs, Cross-Tab Sync & Connectivity
  useEffect(() => {
    async function handleTabSyncOrOnline() {
      if (activeSourceRef.current === "custom" && activeCustomBackgroundRef.current) {
        const expiresAtIso = signedUrlExpiresAtRef.current;
        if (expiresAtIso) {
          const expiresMs = new Date(expiresAtIso).getTime();
          const now = Date.now();
          if (expiresMs - now <= 5 * 60 * 1000) {
            await performSignedUrlRefresh();
          }
        }
      }

      // Re-fetch authoritative server preference to ensure any settings updates
      // (e.g. Timer Dock Placement, focal point, layout style, display name)
      // saved in Settings or other tabs are immediately applied without requiring page reload.
      if (user) {
        try {
          const serverPref = await fetchServerPreference();
          if (!serverPref) return;

          if (serverPref.source === "custom" && serverPref.customBackground) {
            const customBg = serverPref.customBackground;
            const current = activeCustomBackgroundRef.current;
            const hasChanged =
              !current ||
              current.id !== customBg.id ||
              current.timerPosition !== customBg.timerPosition ||
              current.focalX !== customBg.focalX ||
              current.focalY !== customBg.focalY ||
              current.layoutKey !== customBg.layoutKey ||
              current.name !== customBg.name;

            if (hasChanged) {
              setActiveSource("custom");
              setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
              setActiveCustomBackground(customBg);
              setActiveBackground({
                ...customBg,
                publicUrl: customBg.signedUrl,
                source: "custom",
              } as any);
              setIsClassic(false);

              if (customBg.signedUrlExpiresAt) {
                scheduleSignedUrlRefresh(customBg.signedUrlExpiresAt);
              }
            }
          } else if (serverPref.source === "official" && serverPref.backgroundId !== null) {
            const targetBg = catalog.categories
              .flatMap((c) => c.backgrounds)
              .find((b) => b.id === serverPref.backgroundId && b.isActive);
            const targetCat = catalog.categories.find((c) => c.slug === serverPref.categorySlug);
            if (targetBg && targetCat) {
              setActiveSource("official");
              setActiveCategory(targetCat);
              setActiveBackground(targetBg);
              setActiveCustomBackground(null);
              setIsClassic(false);
            }
          } else if (serverPref.source === "classic") {
            const classicCat =
              catalog.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) ||
              SYNTHETIC_CLASSIC_CATEGORY;
            setActiveSource("classic");
            setActiveCategory(classicCat);
            setActiveBackground(null);
            setActiveCustomBackground(null);
            setIsClassic(true);
          }
        } catch (err) {
          console.warn("[useFocusBackground] Failed to sync server preference on tab focus:", err);
        }
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleTabSyncOrOnline();
      }
    }

    function onWindowFocus() {
      handleTabSyncOrOnline();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("online", handleTabSyncOrOnline);

    // Cross-tab broadcast listener (instant real-time sync across tabs)
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("sylf-focus-background-sync");
        bc.onmessage = (event) => {
          if (
            event.data?.type === "BACKGROUND_UPDATED" ||
            event.data?.type === "BACKGROUND_DELETED"
          ) {
            handleTabSyncOrOnline();
            fetchCustomBackgroundsList();
          }
        };
      } catch {
        bc = null;
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("online", handleTabSyncOrOnline);
      if (bc) {
        bc.close();
      }
    };
  }, [
    user,
    catalog,
    performSignedUrlRefresh,
    scheduleSignedUrlRefresh,
    fetchCustomBackgroundsList,
  ]);

  // 3. Logout / Auth Loss Handling (Correction #7)
  useEffect(() => {
    if (!user && activeSourceRef.current === "custom") {
      // User lost auth while custom background was active: fall back to Classic immediately
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      signedUrlExpiresAtRef.current = null;

      setActiveSource("classic");
      setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
      setActiveBackground(null);
      setActiveCustomBackground(null);
      setIsClassic(true);

      saveStoredPreference({
        source: "classic",
        categorySlug: CANONICAL_CLASSIC_SLUG,
        backgroundId: null,
      });
    }
  }, [user]);

  // 4. Select Background Handler (Official / Classic)
  const selectBackground = useCallback(
    async (categorySlug: string, bg: FocusBackgroundClient | null): Promise<boolean> => {
      setLoadError(null);
      setSyncError(null);

      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      signedUrlExpiresAtRef.current = null;

      // Case A: Selecting Classic Sylf
      if (!bg || categorySlug === CANONICAL_CLASSIC_SLUG) {
        const classicCat =
          catalog.categories.find((c) => c.slug === CANONICAL_CLASSIC_SLUG) ||
          SYNTHETIC_CLASSIC_CATEGORY;
        setActiveSource("classic");
        setActiveCategory(classicCat);
        setActiveBackground(null);
        setActiveCustomBackground(null);
        setIsClassic(true);

        saveStoredPreference({
          source: "classic",
          categorySlug: CANONICAL_CLASSIC_SLUG,
          backgroundId: null,
        });

        if (user) {
          focusPreferenceQueue.enqueue({ source: "classic", backgroundId: null }).then((res) => {
            if (!res.success) {
              setSyncError("Couldn't sync environment preference to server.");
            }
          });
        }
        return true;
      }

      // Case B: Selecting Official Background (Preload first)
      setIsPreloadingImage(true);
      const ok = await preloadImage(bg.publicUrl);
      setIsPreloadingImage(false);

      if (!ok) {
        setLoadError(`Unable to load "${bg.name}". Retaining current environment.`);
        return false;
      }

      const targetCat =
        catalog.categories.find((c) => c.slug === categorySlug) || SYNTHETIC_CLASSIC_CATEGORY;
      setActiveSource("official");
      setActiveCategory(targetCat);
      setActiveBackground(bg);
      setActiveCustomBackground(null);
      setIsClassic(false);

      saveStoredPreference({
        source: "official",
        categorySlug,
        backgroundId: bg.id,
      });

      if (user) {
        focusPreferenceQueue
          .enqueue({ source: "official", backgroundId: bg.id })
          .then((res) => {
            if (!res.success) {
              setSyncError("Couldn't sync environment preference to server.");
            }
          });
      }

      return true;
    },
    [catalog, preloadImage, user]
  );

  // 5. Select Custom Background Handler (Phase 5B)
  const selectCustomBackground = useCallback(
    async (customBg: UserFocusBackgroundClient): Promise<boolean> => {
      setLoadError(null);
      setSyncError(null);

      if (!customBg.signedUrl) {
        setLoadError("Custom background has no valid signed URL.");
        return false;
      }

      setIsPreloadingImage(true);
      const ok = await preloadImage(customBg.signedUrl);
      setIsPreloadingImage(false);

      if (!ok) {
        setLoadError(`Unable to load "${customBg.name}". Retaining current environment.`);
        return false;
      }

      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);

      setActiveSource("custom");
      setActiveCategory(SYNTHETIC_CLASSIC_CATEGORY);
      setActiveCustomBackground(customBg);
      setActiveBackground({
        ...customBg,
        publicUrl: customBg.signedUrl,
        source: "custom",
      } as any);
      setIsClassic(false);

      if (customBg.signedUrlExpiresAt) {
        scheduleSignedUrlRefresh(customBg.signedUrlExpiresAt);
      }

      saveStoredPreference({
        source: "custom",
        categorySlug: "custom",
        backgroundId: customBg.id,
      });

      if (user) {
        focusPreferenceQueue
          .enqueue({ source: "custom", backgroundId: customBg.id })
          .then((res) => {
            if (!res.success) {
              setSyncError("Couldn't sync environment preference to server.");
            }
          });
      }

      return true;
    },
    [preloadImage, scheduleSignedUrlRefresh, user]
  );

  // 6. Hotkey: Alt+B Listener (ignoring input/textarea/contenteditable)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "b" || e.key === "B")) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setIsPickerOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openPicker = useCallback(() => {
    if (user) {
      fetchCustomBackgroundsList();
    }
    setIsPickerOpen(true);
  }, [user, fetchCustomBackgroundsList]);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  const togglePicker = useCallback(() => {
    setIsPickerOpen((prev) => {
      if (!prev && user) {
        fetchCustomBackgroundsList();
      }
      return !prev;
    });
  }, [user, fetchCustomBackgroundsList]);

  return {
    catalog,
    isLoadingCatalog,
    isPreloadingImage,
    loadError,
    clearLoadError,
    onImageDeliveryError,
    syncError,
    clearSyncError,

    activeSource,
    activeCategory,
    activeBackground,
    activeCustomBackground,
    customBackgrounds,
    isLoadingCustomBackgrounds,
    isClassic,
    // Custom backgrounds map to their configured layoutKey (or "classic"); official uses category layoutKey
    layoutKey:
      activeSource === "custom"
        ? (activeCustomBackground?.layoutKey || "classic")
        : (activeCategory.layoutKey || "classic"),

    isPickerOpen,
    openPicker,
    closePicker,
    togglePicker,
    selectBackground,
    selectCustomBackground,
    refreshCustomBackgrounds: fetchCustomBackgroundsList,
  };
}
