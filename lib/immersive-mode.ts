export type ImmersiveDisplayMode = "browser" | "standalone" | "fullscreen" | "native";

export type ImmersiveAction =
  | "enter-fullscreen"
  | "exit-fullscreen"
  | "install-pwa"
  | "none";

export type MobileBrowserPlatform =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "android-chromium"
  | "android-firefox"
  | "desktop";

export interface ImmersiveCapabilities {
  displayMode: ImmersiveDisplayMode;
  isNativePlatform: boolean;
  isStandalone: boolean;
  isFullscreen: boolean;
  canFullscreen: boolean;
  canInstallPwa: boolean;
  hasDeferredPrompt: boolean;
  mobilePlatform: MobileBrowserPlatform;
  action: ImmersiveAction;
}

interface VendorDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

interface VendorElement extends HTMLElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
  mozRequestFullScreen?: (options?: FullscreenOptions) => Promise<void> | void;
  msRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
}

export function isNativeCapacitorPlatform(win?: Window | null): boolean {
  if (!win) return false;
  const anyWin = win as Window & {
    __SYLF_MOBILE_PLATFORM__?: boolean;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (anyWin.__SYLF_MOBILE_PLATFORM__ === true) {
    return true;
  }
  if (typeof anyWin.Capacitor?.isNativePlatform === "function") {
    try {
      return Boolean(anyWin.Capacitor.isNativePlatform());
    } catch {
      return false;
    }
  }
  return false;
}

export function getFullscreenElement(doc?: Document | null): Element | null {
  if (!doc) return null;
  const vDoc = doc as VendorDocument;
  return (
    vDoc.fullscreenElement ??
    vDoc.webkitFullscreenElement ??
    vDoc.mozFullScreenElement ??
    vDoc.msFullscreenElement ??
    null
  );
}

export function detectMobileBrowserPlatform(
  win?: Window | null,
  nav?: Navigator | null
): MobileBrowserPlatform {
  if (!win || !nav) return "desktop";
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  const maxTouchPoints = nav.maxTouchPoints || 0;

  const isIPhoneOrIPod = /iPhone|iPod/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isIOS = isIPhoneOrIPod || isIPad;

  if (isIOS) {
    if (/CriOS/i.test(ua)) return "ios-chrome";
    if (/Safari/i.test(ua) && !/FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) {
      return "ios-safari";
    }
    return "ios-other";
  }

  if (/Android/i.test(ua)) {
    if (/Firefox/i.test(ua)) return "android-firefox";
    return "android-chromium";
  }

  return "desktop";
}

export function canUseDocumentFullscreen(
  doc?: Document | null,
  nav?: Navigator | null
): boolean {
  if (!doc || !doc.documentElement) return false;
  const ua = nav?.userAgent || "";
  // iPhone and iPod WebKit do not support Fullscreen API on documentElement (only on <video>).
  if (/iPhone|iPod/i.test(ua)) {
    return false;
  }

  const vDoc = doc as VendorDocument;
  const vEl = doc.documentElement as VendorElement;

  const hasRequestMethod =
    typeof vEl.requestFullscreen === "function" ||
    typeof vEl.webkitRequestFullscreen === "function" ||
    typeof vEl.mozRequestFullScreen === "function" ||
    typeof vEl.msRequestFullscreen === "function";

  if (!hasRequestMethod) return false;

  const enabledFlag =
    vDoc.fullscreenEnabled ??
    vDoc.webkitFullscreenEnabled ??
    vDoc.mozFullScreenEnabled ??
    vDoc.msFullscreenEnabled;

  if (enabledFlag === false) return false;

  return true;
}

export function isStandaloneDisplayMode(
  win?: Window | null,
  nav?: Navigator | null
): boolean {
  if (!win) return false;
  const anyNav = nav as (Navigator & { standalone?: boolean }) | null | undefined;
  if (anyNav?.standalone === true) return true;

  if (typeof win.matchMedia === "function") {
    try {
      if (
        win.matchMedia("(display-mode: standalone)").matches ||
        win.matchMedia("(display-mode: minimal-ui)").matches ||
        win.matchMedia("(display-mode: window-controls-overlay)").matches
      ) {
        return true;
      }
    } catch {
      // Ignore matchMedia errors in non-standard environments
    }
  }
  return false;
}

export function detectDisplayMode(
  win?: Window | null,
  nav?: Navigator | null,
  doc?: Document | null
): ImmersiveDisplayMode {
  if (isNativeCapacitorPlatform(win)) {
    return "native";
  }
  if (getFullscreenElement(doc)) {
    return "fullscreen";
  }
  if (typeof win?.matchMedia === "function") {
    try {
      if (win.matchMedia("(display-mode: fullscreen)").matches) {
        return "fullscreen";
      }
    } catch {
      // Ignore
    }
  }
  if (isStandaloneDisplayMode(win, nav)) {
    return "standalone";
  }
  return "browser";
}

export function resolveImmersiveAction(params: {
  displayMode: ImmersiveDisplayMode;
  isFullscreen: boolean;
  canFullscreen: boolean;
  canInstallPwa: boolean;
}): ImmersiveAction {
  const { displayMode, isFullscreen, canFullscreen, canInstallPwa } = params;

  if (displayMode === "native") {
    return "none";
  }

  if (isFullscreen) {
    return "exit-fullscreen";
  }

  if (canFullscreen) {
    return "enter-fullscreen";
  }

  if (displayMode === "browser" && canInstallPwa) {
    return "install-pwa";
  }

  return "none";
}

export function computeImmersiveCapabilities(params: {
  win?: Window | null;
  nav?: Navigator | null;
  doc?: Document | null;
  hasDeferredPrompt?: boolean;
}): ImmersiveCapabilities {
  const { win = null, nav = null, doc = null, hasDeferredPrompt = false } = params;

  const isNativePlatform = isNativeCapacitorPlatform(win);
  const isFullscreen = Boolean(getFullscreenElement(doc));
  const isStandalone = isStandaloneDisplayMode(win, nav);
  const displayMode = detectDisplayMode(win, nav, doc);
  const mobilePlatform = detectMobileBrowserPlatform(win, nav);
  const canFullscreen = !isNativePlatform && canUseDocumentFullscreen(doc, nav);

  // Can install PWA if we're in a standard browser tab (not already standalone/native)
  // and either the browser fired beforeinstallprompt OR we are on a mobile browser
  // that supports "Add to Home Screen" / "Install App" standalone launch.
  const isMobileBrowser = mobilePlatform !== "desktop";
  const canInstallPwa =
    !isNativePlatform &&
    !isStandalone &&
    displayMode === "browser" &&
    (hasDeferredPrompt || isMobileBrowser);

  const action = resolveImmersiveAction({
    displayMode,
    isFullscreen,
    canFullscreen,
    canInstallPwa,
  });

  return {
    displayMode,
    isNativePlatform,
    isStandalone,
    isFullscreen,
    canFullscreen,
    canInstallPwa,
    hasDeferredPrompt,
    mobilePlatform,
    action,
  };
}

export async function requestDocumentFullscreen(doc?: Document | null): Promise<boolean> {
  if (!doc || !doc.documentElement) return false;
  const el = doc.documentElement as VendorElement;

  try {
    if (typeof el.requestFullscreen === "function") {
      await el.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
      return true;
    }
    if (typeof el.mozRequestFullScreen === "function") {
      await el.mozRequestFullScreen();
      return true;
    }
    if (typeof el.msRequestFullscreen === "function") {
      await el.msRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitDocumentFullscreen(doc?: Document | null): Promise<boolean> {
  if (!doc) return false;
  const vDoc = doc as VendorDocument;

  try {
    if (typeof vDoc.exitFullscreen === "function") {
      await vDoc.exitFullscreen();
      return true;
    }
    if (typeof vDoc.webkitExitFullscreen === "function") {
      await vDoc.webkitExitFullscreen();
      return true;
    }
    if (typeof vDoc.mozCancelFullScreen === "function") {
      await vDoc.mozCancelFullScreen();
      return true;
    }
    if (typeof vDoc.msExitFullscreen === "function") {
      await vDoc.msExitFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
