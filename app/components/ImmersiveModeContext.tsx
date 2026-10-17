"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Maximize2, Share, PlusSquare, MoreVertical, Smartphone, X, Check } from "lucide-react";
import {
  type ImmersiveCapabilities,
  computeImmersiveCapabilities,
  exitDocumentFullscreen,
  getFullscreenElement,
  isNativeCapacitorPlatform,
  requestDocumentFullscreen,
} from "@/lib/immersive-mode";

const subscribeNoop = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface ImmersiveModeContextValue {
  capabilities: ImmersiveCapabilities;
  isHydrated: boolean;
  userInitiatedFullscreen: boolean;
  isInstallGuideOpen: boolean;
  triggerImmersiveAction: () => Promise<void>;
  openInstallGuide: () => void;
  closeInstallGuide: () => void;
}

const DEFAULT_CAPABILITIES: ImmersiveCapabilities = {
  displayMode: "browser",
  isNativePlatform: false,
  isStandalone: false,
  isFullscreen: false,
  canFullscreen: false,
  canInstallPwa: false,
  hasDeferredPrompt: false,
  mobilePlatform: "desktop",
  action: "none",
};

const ImmersiveModeContext = createContext<ImmersiveModeContextValue>({
  capabilities: DEFAULT_CAPABILITIES,
  isHydrated: false,
  userInitiatedFullscreen: false,
  isInstallGuideOpen: false,
  triggerImmersiveAction: async () => {},
  openInstallGuide: () => {},
  closeInstallGuide: () => {},
});

function syncThemeColorMeta() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const computed = window.getComputedStyle(root);
  const canvasColor =
    computed.getPropertyValue("--app-canvas").trim() ||
    root.style.backgroundColor ||
    (root.getAttribute("data-mode") === "light" ? "#f6f5f2" : "#000000");

  if (!canvasColor) return;

  const existingMetas = document.querySelectorAll('meta[name="theme-color"]');
  if (existingMetas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = canvasColor;
    document.head.appendChild(meta);
  } else {
    existingMetas.forEach((meta) => {
      meta.setAttribute("content", canvasColor);
    });
  }
}

function syncDynamicViewportHeight() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const height = window.visualViewport?.height || window.innerHeight;
  if (height > 0) {
    document.documentElement.style.setProperty("--app-dvh", `${Math.round(height)}px`);
  }
}

export function ImmersiveModeProvider({ children }: { children: React.ReactNode }) {
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const [capabilities, setCapabilities] = useState<ImmersiveCapabilities>(DEFAULT_CAPABILITIES);
  const [userInitiatedFullscreen, setUserInitiatedFullscreen] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const refreshCapabilities = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const next = computeImmersiveCapabilities({
      win: window,
      nav: window.navigator,
      doc: document,
      hasDeferredPrompt: Boolean(deferredPromptRef.current),
    });
    setCapabilities((prev) => {
      if (
        prev.displayMode === next.displayMode &&
        prev.isNativePlatform === next.isNativePlatform &&
        prev.isStandalone === next.isStandalone &&
        prev.isFullscreen === next.isFullscreen &&
        prev.canFullscreen === next.canFullscreen &&
        prev.canInstallPwa === next.canInstallPwa &&
        prev.hasDeferredPrompt === next.hasDeferredPrompt &&
        prev.mobilePlatform === next.mobilePlatform &&
        prev.action === next.action
      ) {
        return prev;
      }
      return next;
    });

    if (!next.isFullscreen) {
      setUserInitiatedFullscreen(false);
    }

    document.documentElement.setAttribute("data-display-mode", next.displayMode);
    document.documentElement.setAttribute(
      "data-fullscreen",
      next.isFullscreen ? "true" : "false"
    );
    syncDynamicViewportHeight();
  }, []);

  useEffect(() => {
    refreshCapabilities();
    syncThemeColorMeta();

    // Register lightweight PWA service worker on web (skip in Capacitor native shell)
    if (
      typeof window !== "undefined" &&
      !isNativeCapacitorPlatform(window) &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Non-blocking: SW registration is optional in dev/unsupported contexts
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      // Prevent intrusive automatic mini-infobar; let the user trigger install cleanly
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      refreshCapabilities();
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstallGuideOpen(false);
      refreshCapabilities();
    };

    const handleViewportOrFullscreenChange = () => {
      refreshCapabilities();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("resize", handleViewportOrFullscreenChange, { passive: true });
    window.addEventListener("orientationchange", handleViewportOrFullscreenChange, {
      passive: true,
    });
    document.addEventListener("fullscreenchange", handleViewportOrFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleViewportOrFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleViewportOrFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleViewportOrFullscreenChange);
    document.addEventListener("visibilitychange", handleViewportOrFullscreenChange);

    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener("resize", handleViewportOrFullscreenChange, {
        passive: true,
      });
    }

    let standaloneMql: MediaQueryList | null = null;
    let fullscreenMql: MediaQueryList | null = null;
    if (typeof window.matchMedia === "function") {
      try {
        standaloneMql = window.matchMedia("(display-mode: standalone)");
        fullscreenMql = window.matchMedia("(display-mode: fullscreen)");
        standaloneMql.addEventListener?.("change", handleViewportOrFullscreenChange);
        fullscreenMql.addEventListener?.("change", handleViewportOrFullscreenChange);
      } catch {
        // Ignore matchMedia listener errors on older browsers
      }
    }

    const themeObserver = new MutationObserver(() => {
      syncThemeColorMeta();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "data-app-background", "style", "class"],
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("resize", handleViewportOrFullscreenChange);
      window.removeEventListener("orientationchange", handleViewportOrFullscreenChange);
      document.removeEventListener("fullscreenchange", handleViewportOrFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleViewportOrFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleViewportOrFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleViewportOrFullscreenChange);
      document.removeEventListener("visibilitychange", handleViewportOrFullscreenChange);
      if (visualViewport) {
        visualViewport.removeEventListener("resize", handleViewportOrFullscreenChange);
      }
      standaloneMql?.removeEventListener?.("change", handleViewportOrFullscreenChange);
      fullscreenMql?.removeEventListener?.("change", handleViewportOrFullscreenChange);
      themeObserver.disconnect();
    };
  }, [refreshCapabilities]);

  const promptPwaInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          deferredPromptRef.current = null;
        }
        refreshCapabilities();
        return;
      } catch {
        deferredPromptRef.current = null;
      }
    }
    setIsInstallGuideOpen(true);
  }, [refreshCapabilities]);

  const triggerImmersiveAction = useCallback(async () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const current = computeImmersiveCapabilities({
      win: window,
      nav: window.navigator,
      doc: document,
      hasDeferredPrompt: Boolean(deferredPromptRef.current),
    });

    if (current.action === "exit-fullscreen" || getFullscreenElement(document)) {
      setUserInitiatedFullscreen(false);
      await exitDocumentFullscreen(document);
      refreshCapabilities();
      return;
    }

    if (current.action === "enter-fullscreen") {
      const entered = await requestDocumentFullscreen(document);
      if (entered) {
        setUserInitiatedFullscreen(true);
        refreshCapabilities();
        return;
      }
      // If fullscreen request was blocked/unsupported at runtime on a mobile browser,
      // gracefully fall back to the standalone PWA installation experience.
      if (current.canInstallPwa) {
        await promptPwaInstall();
      }
      refreshCapabilities();
      return;
    }

    if (current.action === "install-pwa") {
      await promptPwaInstall();
      refreshCapabilities();
    }
  }, [promptPwaInstall, refreshCapabilities]);

  const openInstallGuide = useCallback(() => setIsInstallGuideOpen(true), []);
  const closeInstallGuide = useCallback(() => setIsInstallGuideOpen(false), []);

  useEffect(() => {
    if (!isInstallGuideOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsInstallGuideOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isInstallGuideOpen]);

  const value = useMemo<ImmersiveModeContextValue>(
    () => ({
      capabilities,
      isHydrated,
      userInitiatedFullscreen,
      isInstallGuideOpen,
      triggerImmersiveAction,
      openInstallGuide,
      closeInstallGuide,
    }),
    [
      capabilities,
      isHydrated,
      userInitiatedFullscreen,
      isInstallGuideOpen,
      triggerImmersiveAction,
      openInstallGuide,
      closeInstallGuide,
    ]
  );

  return (
    <ImmersiveModeContext.Provider value={value}>
      {children}
      {isHydrated && isInstallGuideOpen && typeof document !== "undefined"
        ? createPortal(
            <ImmersiveInstallGuideModal
              mobilePlatform={capabilities.mobilePlatform}
              onClose={closeInstallGuide}
            />,
            document.body
          )
        : null}
    </ImmersiveModeContext.Provider>
  );
}

export function useImmersiveMode() {
  return useContext(ImmersiveModeContext);
}

function ImmersiveInstallGuideModal({
  mobilePlatform,
  onClose,
}: {
  mobilePlatform: ImmersiveCapabilities["mobilePlatform"];
  onClose: () => void;
}) {
  const isIOS =
    mobilePlatform === "ios-safari" ||
    mobilePlatform === "ios-chrome" ||
    mobilePlatform === "ios-other";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sylf-immersive-guide-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface-raised/95 backdrop-blur-xl p-5 shadow-2xl text-text-primary"
        style={{
          marginBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-primary/30 bg-accent-primary/10 text-accent-text">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="sylf-immersive-guide-title"
                className="text-sm font-semibold tracking-tight text-text-primary"
              >
                Immersive App Mode
              </h2>
              <p className="text-[11px] text-text-muted">
                Launch Sylf full-screen without browser bars
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close immersive mode guide"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-text-secondary mb-4">
          {isIOS
            ? "iOS browsers hide the address and tab bars when Sylf is added to your Home Screen as a standalone web app:"
            : "Install Sylf to your Home Screen to enjoy an uninterrupted, full-screen experience without browser controls:"}
        </p>

        <div className="space-y-2.5 mb-4">
          {mobilePlatform === "ios-safari" && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <Share className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">1. Tap Share</span> in the
                  Safari toolbar
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <PlusSquare className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    2. Tap &ldquo;Add to Home Screen&rdquo;
                  </span>{" "}
                  and open Sylf from your Home Screen
                </div>
              </div>
            </>
          )}

          {(mobilePlatform === "ios-chrome" || mobilePlatform === "ios-other") && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <Share className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">1. Tap Share</span> in the
                  address bar (or open in Safari)
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <PlusSquare className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    2. Select &ldquo;Add to Home Screen&rdquo;
                  </span>{" "}
                  to launch without browser chrome
                </div>
              </div>
            </>
          )}

          {!isIOS && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <MoreVertical className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">1. Open Browser Menu</span>{" "}
                   in the toolbar
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel/70 px-3.5 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-text">
                  <Maximize2 className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    2. Tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-hover/80 hover:bg-surface-hover px-4 py-2 text-xs font-semibold text-text-primary transition-colors"
        >
          <Check className="h-3.5 w-3.5 text-accent-text" />
          Got it
        </button>
      </div>
    </div>
  );
}
