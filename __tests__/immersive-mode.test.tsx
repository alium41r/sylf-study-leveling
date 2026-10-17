import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import manifest from "@/app/manifest";
import {
  computeImmersiveCapabilities,
  detectDisplayMode,
  detectMobileBrowserPlatform,
  canUseDocumentFullscreen,
  resolveImmersiveAction,
  requestDocumentFullscreen,
  exitDocumentFullscreen,
} from "@/lib/immersive-mode";
import { ImmersiveModeProvider } from "@/app/components/ImmersiveModeContext";
import { ImmersiveModeButton } from "@/app/components/ImmersiveModeButton";
import TopRightBar from "@/app/components/TopRightBar";
import { ChatHeader } from "@/app/social/components/ChatHeader";
import { FocusSessionBar } from "@/app/focus/components/FocusSessionBar";
import { isStaticViewportRoute } from "@/app/components/SylfAppShell";

let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: "scholar_one",
      name: "Scholar One",
      sylph: 250,
      streakDays: 4,
      hp: 95,
      maxHp: 100,
      hunterRank: "B",
      level: 12,
    },
    isLoading: false,
  }),
}));

vi.mock("@/app/components/SettingsContext", () => ({
  useSettings: () => ({
    isOpen: false,
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
  }),
}));

describe("Web App Manifest (app/manifest.ts)", () => {
  it("returns valid standalone/fullscreen PWA manifest configuration", () => {
    const data = manifest();
    expect(data.name).toBe("Sylf — Study Leveling");
    expect(data.short_name).toBe("Sylf");
    expect(data.start_url).toBe("/dashboard");
    expect(data.display).toBe("standalone");
    expect(data.display_override).toContain("fullscreen");
    expect(data.display_override).toContain("standalone");
    expect(data.icons?.length).toBeGreaterThanOrEqual(2);
    expect(data.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x192".replace("192", "512") }),
      ])
    );
  });
});

describe("lib/immersive-mode capability engine", () => {
  it("resolves enter-fullscreen on desktop browsers supporting Fullscreen API", () => {
    const fakeDoc = {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn(),
      },
    } as unknown as Document;

    const fakeWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    const fakeNav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0,
    } as unknown as Navigator;

    const caps = computeImmersiveCapabilities({
      win: fakeWin,
      nav: fakeNav,
      doc: fakeDoc,
      hasDeferredPrompt: false,
    });

    expect(caps.displayMode).toBe("browser");
    expect(caps.canFullscreen).toBe(true);
    expect(caps.isFullscreen).toBe(false);
    expect(caps.action).toBe("enter-fullscreen");
  });

  it("resolves exit-fullscreen when document.fullscreenElement is active", () => {
    const fakeEl = {} as Element;
    const fakeDoc = {
      fullscreenEnabled: true,
      fullscreenElement: fakeEl,
      documentElement: {
        requestFullscreen: vi.fn(),
      },
    } as unknown as Document;

    const fakeWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    const fakeNav = {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
    } as unknown as Navigator;

    const caps = computeImmersiveCapabilities({
      win: fakeWin,
      nav: fakeNav,
      doc: fakeDoc,
    });

    expect(caps.displayMode).toBe("fullscreen");
    expect(caps.isFullscreen).toBe(true);
    expect(caps.action).toBe("exit-fullscreen");
  });

  it("resolves install-pwa on iPhone Safari where Fullscreen API is unavailable", () => {
    const fakeDoc = {
      fullscreenEnabled: false,
      fullscreenElement: null,
      documentElement: {},
    } as unknown as Document;

    const fakeWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    const fakeNav = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    } as unknown as Navigator;

    const caps = computeImmersiveCapabilities({
      win: fakeWin,
      nav: fakeNav,
      doc: fakeDoc,
      hasDeferredPrompt: false,
    });

    expect(caps.mobilePlatform).toBe("ios-safari");
    expect(caps.canFullscreen).toBe(false);
    expect(caps.canInstallPwa).toBe(true);
    expect(caps.action).toBe("install-pwa");
  });

  it("resolves none on iPhone when already running in standalone Home Screen mode", () => {
    const fakeDoc = {
      fullscreenEnabled: false,
      fullscreenElement: null,
      documentElement: {},
    } as unknown as Document;

    const fakeWin = {
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
      })),
    } as unknown as Window;

    const fakeNav = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
    } as unknown as Navigator;

    const caps = computeImmersiveCapabilities({
      win: fakeWin,
      nav: fakeNav,
      doc: fakeDoc,
      hasDeferredPrompt: false,
    });

    expect(caps.displayMode).toBe("standalone");
    expect(caps.isStandalone).toBe(true);
    expect(caps.canFullscreen).toBe(false);
    expect(caps.canInstallPwa).toBe(false);
    expect(caps.action).toBe("none");
  });

  it("resolves none when running inside the Capacitor native mobile platform", () => {
    const fakeDoc = {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn(),
      },
    } as unknown as Document;

    const fakeWin = {
      __SYLF_MOBILE_PLATFORM__: true,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    const fakeNav = {
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    } as unknown as Navigator;

    const caps = computeImmersiveCapabilities({
      win: fakeWin,
      nav: fakeNav,
      doc: fakeDoc,
    });

    expect(detectDisplayMode(fakeWin, fakeNav, fakeDoc)).toBe("native");
    expect(
      resolveImmersiveAction({
        displayMode: "native",
        isFullscreen: false,
        canFullscreen: true,
        canInstallPwa: true,
      })
    ).toBe("none");
    expect(caps.displayMode).toBe("native");
    expect(caps.isNativePlatform).toBe(true);
    expect(caps.action).toBe("none");
  });

  it("detects vendor-prefixed webkit fullscreen methods and exit helpers", async () => {
    const webkitReq = vi.fn().mockResolvedValue(undefined);
    const webkitExit = vi.fn().mockResolvedValue(undefined);
    const fakeDoc = {
      webkitFullscreenEnabled: true,
      webkitFullscreenElement: null,
      webkitExitFullscreen: webkitExit,
      documentElement: {
        webkitRequestFullscreen: webkitReq,
      },
    } as unknown as Document;

    const fakeNav = {
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
      platform: "iPad",
      maxTouchPoints: 5,
    } as unknown as Navigator;

    expect(canUseDocumentFullscreen(fakeDoc, fakeNav)).toBe(true);
    await expect(requestDocumentFullscreen(fakeDoc)).resolves.toBe(true);
    expect(webkitReq).toHaveBeenCalledTimes(1);

    await expect(exitDocumentFullscreen(fakeDoc)).resolves.toBe(true);
    expect(webkitExit).toHaveBeenCalledTimes(1);
  });

  it("classifies mobile browser platforms accurately", () => {
    const win = {} as Window;
    expect(
      detectMobileBrowserPlatform(win, {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1",
      } as Navigator)
    ).toBe("ios-chrome");

    expect(
      detectMobileBrowserPlatform(win, {
        userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0",
      } as Navigator)
    ).toBe("android-firefox");

    expect(
      detectMobileBrowserPlatform(win, {
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
      } as Navigator)
    ).toBe("android-chromium");
  });
});

describe("ImmersiveModeProvider & ImmersiveModeButton integration", () => {
  const originalUserAgent = navigator.userAgent;
  let fullscreenElementValue: Element | null = null;
  const typedWin = window as Window & { __SYLF_MOBILE_PLATFORM__?: boolean };

  beforeEach(() => {
    mockPathname = "/dashboard";
    fullscreenElementValue = null;
    delete typedWin.__SYLF_MOBILE_PLATFORM__;
    document.documentElement.removeAttribute("data-pixel-studio");

    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      writable: true,
      value: true,
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElementValue,
    });

    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(async () => {
        fullscreenElementValue = document.documentElement;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(async () => {
        fullscreenElementValue = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
    vi.restoreAllMocks();
  });

  it("toggles Fullscreen API enter and exit cleanly on supported browsers", async () => {
    render(
      <ImmersiveModeProvider>
        <ImmersiveModeButton variant="top-bar" />
      </ImmersiveModeProvider>
    );

    const button = await screen.findByTestId("immersive-mode-btn-top-bar");
    expect(button).toHaveAttribute("aria-label", "Enter fullscreen");
    expect(button).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({
      navigationUI: "hide",
    });

    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "Exit fullscreen");
      expect(button).toHaveAttribute("aria-pressed", "true");
    });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", "Enter fullscreen");
      expect(button).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("opens the non-intrusive PWA install guide on iOS Safari where Fullscreen API is unavailable", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      writable: true,
      value: false,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });

    render(
      <ImmersiveModeProvider>
        <ImmersiveModeButton variant="mobile-bar" />
      </ImmersiveModeProvider>
    );

    const button = await screen.findByTestId("immersive-mode-btn-mobile-bar");
    expect(button).toHaveAttribute("data-immersive-action", "install-pwa");
    expect(button).toHaveAttribute("aria-label", "Immersive app mode");

    await act(async () => {
      fireEvent.click(button);
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Immersive App Mode")).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();

    const gotItBtn = screen.getByRole("button", { name: /Got it/i });
    fireEvent.click(gotItBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("triggers native beforeinstallprompt when captured on a browser without Fullscreen API", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      writable: true,
      value: false,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    render(
      <ImmersiveModeProvider>
        <ImmersiveModeButton variant="top-bar" />
      </ImmersiveModeProvider>
    );

    const promptSpy = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt: promptSpy,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    });

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    const button = await screen.findByTestId("immersive-mode-btn-top-bar");
    expect(button).toHaveAttribute("data-immersive-action", "install-pwa");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never renders a button when no valid action exists (e.g., native Capacitor shell)", async () => {
    typedWin.__SYLF_MOBILE_PLATFORM__ = true;

    render(
      <ImmersiveModeProvider>
        <ImmersiveModeButton variant="top-bar" />
      </ImmersiveModeProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("immersive-mode-btn-top-bar")).not.toBeInTheDocument();
    });
  });

  it("adapts TopRightBar across dashboard, timer, settings, and inline-header routes without overlap", async () => {
    mockPathname = "/dashboard";
    const { rerender } = render(
      <ImmersiveModeProvider>
        <TopRightBar />
      </ImmersiveModeProvider>
    );

    expect(await screen.findByTestId("immersive-mode-btn-top-bar")).toBeInTheDocument();
    expect(screen.getByTitle("Sylph (System Currency)")).toBeInTheDocument();

    // On /timer, TopRightBar shows the fullscreen button without duplicating dashboard badges
    mockPathname = "/timer";
    rerender(
      <ImmersiveModeProvider>
        <TopRightBar />
      </ImmersiveModeProvider>
    );
    expect(await screen.findByTestId("immersive-mode-btn-top-bar")).toBeInTheDocument();
    expect(screen.queryByTitle("Sylph (System Currency)")).not.toBeInTheDocument();

    // On /system (Sylvie & Planner), TopRightBar yields to the inline workspace header button
    mockPathname = "/system";
    rerender(
      <ImmersiveModeProvider>
        <TopRightBar />
      </ImmersiveModeProvider>
    );
    expect(screen.queryByTestId("immersive-mode-btn-top-bar")).not.toBeInTheDocument();

    // On /locker when PixelStudio is active (data-pixel-studio="true"), TopRightBar yields to PixelStudio's header
    mockPathname = "/locker";
    await act(async () => {
      document.documentElement.setAttribute("data-pixel-studio", "true");
    });
    rerender(
      <ImmersiveModeProvider>
        <TopRightBar />
      </ImmersiveModeProvider>
    );
    expect(screen.queryByTestId("immersive-mode-btn-top-bar")).not.toBeInTheDocument();
  });

  it("renders inline immersive controls in ChatHeader and FocusSessionBar", async () => {
    render(
      <ImmersiveModeProvider>
        <ChatHeader
          conversation={{
            id: 42,
            name: "Study Squad",
            isGroup: true,
            participants: [
              {
                id: 1,
                name: "Scholar One",
                username: "scholar_one",
                hunterRank: "B",
                level: 12,
                isOnline: true,
              },
            ],
          }}
          currentUserId={1}
          onOpenDetails={vi.fn()}
          isSearchOpen={false}
          onToggleSearch={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
        />
        <FocusSessionBar
          phaseLabel="DEEP WORK"
          modeDisplayName="Pomodoro"
          subjectName="Linear Algebra"
          questData={null}
          isPaused={false}
          background={null}
          onOpenBackgroundPicker={vi.fn()}
        />
      </ImmersiveModeProvider>
    );

    expect(await screen.findByTestId("immersive-mode-btn-chat-header")).toBeInTheDocument();
    expect(await screen.findByTestId("immersive-mode-btn-focus-bar")).toBeInTheDocument();
  });

  it("classifies static viewport routes accurately in SylfAppShell", () => {
    expect(isStaticViewportRoute("/focus")).toBe(true);
    expect(isStaticViewportRoute("/system")).toBe(true);
    expect(isStaticViewportRoute("/social/chat/12")).toBe(true);
    expect(isStaticViewportRoute("/dashboard")).toBe(false);
    expect(isStaticViewportRoute("/timer")).toBe(false);
  });
});
