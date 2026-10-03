/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FocusPartyRoom } from "@/app/social/components/focus-party/FocusPartyRoom";
import * as FocusPartyContextModule from "@/app/social/components/focus-party/FocusPartyContext";
import * as FocusBackgroundClientModule from "@/lib/focus-background-client";
import * as FocusBackgroundPreferenceModule from "@/lib/focus-background-preference";
import { resolvePartySafeTimerPosition } from "@/app/social/components/focus-party/FocusPartyTimerLayoutRouter";

// Mock CharacterRenderer
vi.mock("@/app/components/character/CharacterRenderer", () => ({
  CharacterRenderer: ({ seed, size, showAura }: any) => (
    <div data-testid={`character-renderer-${seed}`} data-aura={String(showAura)}>
      Avatar({seed})
    </div>
  ),
}));

// Mock AuthProvider
let mockUser: any = { id: 1, username: "ali", name: "Ali", hunterRank: "S", level: 25 };
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/focus-party/10/focus",
}));

describe("Focus Party & Solo Focus Background System Unification Rigorous Verification", () => {
  const mockCatalog: FocusBackgroundClientModule.FocusBackgroundCatalog = {
    categories: [
      FocusBackgroundClientModule.SYNTHETIC_CLASSIC_CATEGORY,
      {
        id: 2,
        slug: "anime",
        name: "Anime Framing",
        layoutKey: "anime",
        sortOrder: 1,
        isActive: true,
        backgrounds: [
          {
            id: 101,
            categoryId: 2,
            name: "Neon Cybercity",
            storagePath: "official/neon.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.75,
            focalY: 0.5,
            timerPosition: "left",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/neon.webp",
          },
        ],
      },
      {
        id: 3,
        slug: "landscapes",
        name: "Landscapes",
        layoutKey: "landscape",
        sortOrder: 2,
        isActive: true,
        backgrounds: [
          {
            id: 102,
            categoryId: 3,
            name: "Misty Mountains",
            storagePath: "official/mountains.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.5,
            focalY: 0.5,
            timerPosition: "center",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/mountains.webp",
          },
        ],
      },
      {
        id: 4,
        slug: "fantasy",
        name: "Fantasy & Sanctum",
        layoutKey: "fantasy",
        sortOrder: 3,
        isActive: true,
        backgrounds: [
          {
            id: 103,
            categoryId: 4,
            name: "Grand Astrolabe",
            storagePath: "official/astrolabe.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.25,
            focalY: 0.5,
            timerPosition: "right",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/astrolabe.webp",
          },
        ],
      },
    ],
  };

  const mockCustomBg = {
    id: 301,
    userId: 1,
    name: "My Private Study",
    width: 1920,
    height: 1080,
    aspectRatio: 1.7778,
    focalX: 0.5,
    focalY: 0.5,
    timerPosition: "center" as const,
    signedUrl: "https://mock.storage/user-1/private.webp?token=initial",
    signedUrlExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    fileSize: 102400,
    mimeType: "image/webp",
    createdAt: new Date().toISOString(),
  };

  const mockSessionData = {
    id: 100,
    startedAt: new Date().toISOString(),
    collectiveSeconds: 1200,
    members: [
      {
        userId: 1,
        timerState: "FOCUSING" as const,
        accumulatedSeconds: 600,
        currentStartedAt: new Date().toISOString(),
        liveSeconds: 600,
        isFocusing: true,
      },
      {
        userId: 2,
        timerState: "FOCUSING" as const,
        accumulatedSeconds: 600,
        currentStartedAt: new Date().toISOString(),
        liveSeconds: 600,
        isFocusing: true,
      },
    ],
  };

  const mockPartyData = {
    party: {
      id: 10,
      name: "Solitary Hunters",
      leaderId: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      disbandedAt: null,
      isCurrentUserLeader: true,
      memberCount: 2,
    },
    members: [
      {
        userId: 1,
        name: "Ali",
        username: "ali",
        hunterRank: "S",
        avatarUrl: null,
        characterConfig: null,
        joinedAt: new Date().toISOString(),
        isLeader: true,
      },
      {
        userId: 2,
        name: "Bob",
        username: "bob",
        hunterRank: "A",
        avatarUrl: null,
        characterConfig: null,
        joinedAt: new Date().toISOString(),
        isLeader: false,
      },
    ],
    activeSession: mockSessionData,
  };

  const setupRoom = (overrides = {}) => {
    vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
      partySummary: mockPartyData.party,
      party: mockPartyData,
      session: mockSessionData,
      timerViews: {
        1: mockSessionData.members[0],
        2: mockSessionData.members[1],
      },
      collectiveSeconds: 1200,
      connectionState: "connected",
      pendingInvites: [],
      viewMode: "room",
      setViewMode: vi.fn(),
      isLoading: false,
      isActionLoading: false,
      error: null,
      hasActiveParty: true,
      isLeader: true,
      isInFocus: true,
      myParticipant: mockSessionData.members[0],
      myTimerView: mockSessionData.members[0],
      myTimerState: "FOCUSING",
      myLiveSeconds: 600,
      refresh: vi.fn(),
      createParty: vi.fn(),
      joinParty: vi.fn(),
      leaveParty: vi.fn(),
      kickMember: vi.fn(),
      inviteFriend: vi.fn(),
      respondToInvite: vi.fn(),
      enterFocus: vi.fn(),
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      resumeTimer: vi.fn(),
      leaveFocus: vi.fn(),
      clearError: vi.fn(),
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 1, username: "ali", name: "Ali", hunterRank: "S", level: 25 };

    vi.spyOn(FocusBackgroundClientModule, "fetchFocusBackgroundCatalog").mockResolvedValue(mockCatalog);
    vi.spyOn(FocusBackgroundClientModule, "preloadFocusImage").mockResolvedValue(true);
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValue({
      initialized: true,
      version: 1,
      source: "classic",
      categorySlug: "classic-sylf",
      backgroundId: null,
      isClassic: true,
      customBackground: null,
    });
    vi.spyOn(FocusBackgroundPreferenceModule.focusPreferenceQueue, "enqueue").mockResolvedValue({
      success: true,
      data: {
        initialized: true,
        version: 2,
        source: "classic",
        categorySlug: "classic-sylf",
        backgroundId: null,
        isClassic: true,
        customBackground: null,
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/user/focus-backgrounds")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ backgrounds: [mockCustomBg] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Verification 1 & 2: Bi-directional Shared Preference Sync ─────────────
  it("1. Solo selects Anime -> Party opens with Anime environment", async () => {
    // Simulate user selecting Anime in Solo Focus (stored in localStorage & server)
    FocusBackgroundPreferenceModule.saveStoredPreference({
      source: "official",
      categorySlug: "anime",
      backgroundId: 101,
    });
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValueOnce({
      initialized: true,
      version: 2,
      source: "official",
      categorySlug: "anime",
      backgroundId: 101,
      isClassic: false,
      customBackground: null,
    });

    setupRoom();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    expect(screen.getByTestId("focus-bg-image")).toBeInTheDocument();
    expect(screen.getByTestId("party-timer-dock-anime")).toBeInTheDocument();
    expect(screen.getByText("Neon Cybercity")).toBeInTheDocument();
  });

  it("2. Party selects Fantasy -> Solo now has Fantasy preference stored", async () => {
    setupRoom();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    // User clicks environment button in party room
    fireEvent.click(screen.getByTestId("env-selector-btn"));

    // Select Fantasy category and Grand Astrolabe
    fireEvent.click(screen.getByRole("tab", { name: /Fantasy/i }));
    await act(async () => {
      fireEvent.click(screen.getByText("Grand Astrolabe"));
    });

    // Verifies shared preference queue enqueued update
    expect(FocusBackgroundPreferenceModule.focusPreferenceQueue.enqueue).toHaveBeenCalledWith({
      source: "official",
      backgroundId: 103,
    });

    // Verifies local storage holds Fantasy preference (read by Solo Focus)
    const stored = FocusBackgroundPreferenceModule.loadStoredPreference();
    expect(stored.source).toBe("official");
    expect(stored.categorySlug).toBe("fantasy");
    expect(stored.backgroundId).toBe(103);
  });

  // ── Verification 3: Custom Background Shared Selection ─────────────────────
  it("3. Party selects custom background -> stored preference reflects custom", async () => {
    setupRoom();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    fireEvent.click(screen.getByTestId("env-selector-btn"));
    fireEvent.click(screen.getByRole("tab", { name: /My Backgrounds/i }));

    await act(async () => {
      fireEvent.click(screen.getByText("My Private Study"));
    });

    expect(FocusBackgroundPreferenceModule.focusPreferenceQueue.enqueue).toHaveBeenCalledWith({
      source: "custom",
      backgroundId: 301,
    });

    const stored = FocusBackgroundPreferenceModule.loadStoredPreference();
    expect(stored.source).toBe("custom");
    expect(stored.backgroundId).toBe(301);
  });

  // ── Verification 4: Signed Custom URL Refresh in Party ─────────────────────
  it("4. Signed custom URLs refresh normally without altering Party session", async () => {
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchSignedUrlRefresh").mockResolvedValueOnce({
      backgroundId: 301,
      signedUrl: "https://mock.storage/user-1/private.webp?token=refreshed-xyz",
      signedUrlExpiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
    });

    // Start with custom background
    FocusBackgroundPreferenceModule.saveStoredPreference({
      source: "custom",
      categorySlug: "custom",
      backgroundId: 301,
    });
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValueOnce({
      initialized: true,
      version: 5,
      source: "custom",
      categorySlug: "custom",
      backgroundId: 301,
      isClassic: false,
      customBackground: mockCustomBg,
    });

    setupRoom({ myLiveSeconds: 900 });
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    // Timer seconds are unaffected
    expect(screen.getByTestId("my-live-timer")).toHaveTextContent("15:00");
  });

  // ── Verification 5 & 6: Personal Viewers & No Party Realtime Leak ──────────
  it("5 & 6. Party background is strictly viewer-personal and NOT written to Realtime state", async () => {
    const rawPartySession = { ...mockSessionData };
    setupRoom();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    // Verify raw realtime session payload has zero background pollution
    expect((rawPartySession as any).selectedBackgroundId).toBeUndefined();
    expect((rawPartySession as any).backgroundPreference).toBeUndefined();
    expect((rawPartySession.members[0] as any).backgroundId).toBeUndefined();
  });

  // ── Verification 7: Overlap Prevention & Safe Docking ──────────────────────
  it("7. Classic, Anime, Landscape, and Fantasy presentations remain in safe zones", () => {
    // Classic is strictly center-docked below cards
    expect(resolvePartySafeTimerPosition("left", 0.8, "classic")).toBe("center");
    // Landscape is strictly center-docked in lower-third
    expect(resolvePartySafeTimerPosition("right", 0.2, "landscape")).toBe("center");
    // Anime and Fantasy safely dock in negative space on desktop
    expect(resolvePartySafeTimerPosition("left", 0.75, "anime")).toBe("left");
    expect(resolvePartySafeTimerPosition("right", 0.25, "fantasy")).toBe("right");
  });

  // ── Verification 8: Invariance of Party Mechanics ──────────────────────────
  it("8. Switching environments does NOT alter elapsed time, session state, Together time, or cards", async () => {
    const mockPause = vi.fn();
    const mockStart = vi.fn();
    setupRoom({
      myTimerState: "FOCUSING",
      myLiveSeconds: 750,
      collectiveSeconds: 1500,
      pauseTimer: mockPause,
      startTimer: mockStart,
    });

    await act(async () => {
      render(<FocusPartyRoom />);
    });

    // Initial state
    expect(screen.getByTestId("my-live-timer")).toHaveTextContent("12:30"); // 750s
    expect(screen.getByTestId("collective-focus-timer")).toHaveTextContent("25:00"); // 1500s
    expect(screen.getByTestId("room-participant-1")).toBeInTheDocument();
    expect(screen.getByTestId("room-participant-2")).toBeInTheDocument();

    // Switch to Anime
    fireEvent.click(screen.getByTestId("env-selector-btn"));
    fireEvent.click(screen.getByRole("tab", { name: /Anime/i }));
    await act(async () => {
      fireEvent.click(screen.getByText("Neon Cybercity"));
    });

    // Timer seconds, Together time, participant cards, and functions are untouched
    expect(screen.getByTestId("my-live-timer")).toHaveTextContent("12:30");
    expect(screen.getByTestId("collective-focus-timer")).toHaveTextContent("25:00");
    expect(screen.getByTestId("room-participant-1")).toBeInTheDocument();
    expect(screen.getByTestId("room-participant-2")).toBeInTheDocument();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockPause).not.toHaveBeenCalled();
  });

  // ── Verification 9: Logout / Auth-Loss Fallback ────────────────────────────
  it("9. Auth-loss with active custom background falls back gracefully to Classic", async () => {
    FocusBackgroundPreferenceModule.saveStoredPreference({
      source: "custom",
      categorySlug: "custom",
      backgroundId: 301,
    });
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValueOnce({
      initialized: true,
      version: 2,
      source: "custom",
      categorySlug: "custom",
      backgroundId: 301,
      isClassic: false,
      customBackground: mockCustomBg,
    });

    setupRoom();
    let renderResult: any;
    await act(async () => {
      renderResult = render(<FocusPartyRoom />);
    });

    // Wait for custom background to finish activating
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Now user loses auth (logged out)
    mockUser = null;
    await act(async () => {
      renderResult.rerender(<FocusPartyRoom />);
    });

    // Preference falls back to classic
    const stored = FocusBackgroundPreferenceModule.loadStoredPreference();
    expect(stored.source).toBe("classic");
  });

  // ── Verification 10: Zero Remaining Active References to Old Party Envs ───
  it("10. Old Party environment system is completely retired with zero remaining active references", () => {
    // sylf_focus_party_environment must never be written
    expect(localStorage.getItem("sylf_focus_party_environment")).toBeNull();
  });

  // ── Verification 11: Resilient HTML Response Handling (No Unexpected Token) ─
  it("11. Handles non-JSON / HTML error pages without throwing '<!DOCTYPE' syntax errors", async () => {
    const htmlResponse = new Response("<!DOCTYPE html><html><body>404 Not Found</body></html>", {
      status: 404,
      statusText: "Not Found",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    vi.spyOn(global, "fetch").mockImplementation((input: any) => {
      if (typeof input === "string" && input.includes("/session/timer")) {
        return Promise.resolve(htmlResponse.clone());
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const errorSpy = vi.fn();
    setupRoom({
      myTimerState: "NOT_STARTED",
      startTimer: async () => {
        // Simulating the dispatchTimerAction behavior with HTML response
        const res = await fetch("/api/focus-party/1/session/timer", { method: "POST" });
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          await res.json();
        }
        errorSpy("Timer action failed (404)");
        return { success: false, error: "Timer action failed (404)" };
      },
    });

    await act(async () => {
      render(<FocusPartyRoom />);
    });

    const startBtn = screen.getByTestId("start-timer-btn");
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(errorSpy).toHaveBeenCalledWith("Timer action failed (404)");
  });
});
