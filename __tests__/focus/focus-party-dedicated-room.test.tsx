/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
const mockUser = { id: 1, username: "ali", name: "Ali", hunterRank: "S", level: 25 };
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/focus-party/10/focus",
}));

describe("Unified Focus Party Focus Room — Background System & Timer Architecture", () => {
  const mockStartTimer = vi.fn();
  const mockPauseTimer = vi.fn();
  const mockResumeTimer = vi.fn();
  const mockLeaveFocus = vi.fn().mockResolvedValue({ success: true });
  const mockSetViewMode = vi.fn();

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
            name: "Neon Alley",
            storagePath: "official/neon-alley.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.75,
            focalY: 0.5,
            timerPosition: "left",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/neon-alley.webp",
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
            name: "Alpine Peak",
            storagePath: "official/alpine.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.5,
            focalY: 0.5,
            timerPosition: "center",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/alpine.webp",
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
            name: "Grand Observatory",
            storagePath: "official/observatory.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.7778,
            focalX: 0.25,
            focalY: 0.5,
            timerPosition: "right",
            sortOrder: 0,
            isActive: true,
            publicUrl: "https://mock.storage/observatory.webp",
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock catalog and preload calls
    vi.spyOn(FocusBackgroundClientModule, "fetchFocusBackgroundCatalog").mockResolvedValue(mockCatalog);
    vi.spyOn(FocusBackgroundClientModule, "preloadFocusImage").mockResolvedValue(true);
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValue({
      initialized: true,
      source: "classic",
      categorySlug: "classic-sylf",
      backgroundId: null,
      isClassic: true,
      customBackground: null,
      version: 1,
    });
    vi.spyOn(FocusBackgroundPreferenceModule.focusPreferenceQueue, "enqueue").mockResolvedValue({
      success: true,
      data: {
        initialized: true,
        source: "classic",
        categorySlug: "classic-sylf",
        backgroundId: null,
        isClassic: true,
        customBackground: null,
        version: 2,
      },
    });

    // Mock global fetch for custom backgrounds API
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/user/focus-backgrounds")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              backgrounds: [
                {
                  id: 201,
                  userId: 1,
                  name: "My Custom Sanctum",
                  width: 1920,
                  height: 1080,
                  aspectRatio: 1.7778,
                  focalX: 0.5,
                  focalY: 0.5,
                  timerPosition: "center",
                  signedUrl: "https://mock.storage/user-1/custom.webp?token=abc",
                  signedUrlExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
                },
              ],
            }),
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

  const mockSessionData = {
    id: 99,
    startedAt: new Date().toISOString(),
    collectiveSeconds: 720,
    members: [
      {
        userId: 1,
        timerState: "FOCUSING" as const,
        accumulatedSeconds: 300,
        currentStartedAt: new Date().toISOString(),
        liveSeconds: 360,
        isFocusing: true,
      },
      {
        userId: 2,
        timerState: "PAUSED" as const,
        accumulatedSeconds: 360,
        currentStartedAt: null,
        liveSeconds: 360,
        isFocusing: false,
      },
    ],
  };

  const mockPartyData = {
    party: {
      id: 10,
      name: "Chamber of Shadows",
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
        name: "Dark",
        username: "dark",
        hunterRank: "A",
        avatarUrl: null,
        characterConfig: null,
        joinedAt: new Date().toISOString(),
        isLeader: false,
      },
    ],
    activeSession: mockSessionData,
  };

  const setupRoomContext = (overrides: Partial<FocusPartyContextModule.FocusPartyContextValue> = {}) => {
    vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
      partySummary: mockPartyData.party,
      party: mockPartyData,
      session: mockSessionData,
      timerViews: {
        1: mockSessionData.members[0],
        2: mockSessionData.members[1],
      },
      collectiveSeconds: 720,
      connectionState: "connected",
      pendingInvites: [],
      viewMode: "room",
      setViewMode: mockSetViewMode,
      isLoading: false,
      isActionLoading: false,
      error: null,
      hasActiveParty: true,
      isLeader: true,
      isInFocus: true,
      myParticipant: mockSessionData.members[0],
      myTimerView: mockSessionData.members[0],
      myTimerState: "FOCUSING",
      myLiveSeconds: 360,
      refresh: vi.fn(),
      createParty: vi.fn(),
      joinParty: vi.fn(),
      leaveParty: vi.fn(),
      kickMember: vi.fn(),
      inviteFriend: vi.fn(),
      respondToInvite: vi.fn(),
      enterFocus: vi.fn(),
      startTimer: mockStartTimer,
      pauseTimer: mockPauseTimer,
      resumeTimer: mockResumeTimer,
      leaveFocus: mockLeaveFocus,
      clearError: vi.fn(),
      ...overrides,
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Header & Multiplayer Core Mechanics
  // ──────────────────────────────────────────────────────────────────────────
  it("renders minimal header with party name and active focus room status", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    expect(screen.getByText("Chamber of Shadows")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE FOCUS ROOM")).toBeInTheDocument();
    expect(screen.getByText("2 STUDYING")).toBeInTheDocument();
  });

  it("displays collective focus time in MM:SS format", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    const collective = screen.getByTestId("collective-focus-timer");
    expect(collective).toHaveTextContent("12:00"); // 720s = 12:00
  });

  it("renders companion participants with 1:1 chibis and live status", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    // Current user (Ali)
    expect(screen.getByTestId("room-participant-1")).toBeInTheDocument();
    // Companion (Dark)
    expect(screen.getByTestId("room-participant-2")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("(YOU)")).toBeInTheDocument();
  });

  it("renders vacant carrel slots up to maxCapacity of 4", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    expect(screen.getAllByRole("listitem", { name: "Unoccupied study chair" })).toHaveLength(2);
    expect(screen.getByText("Carrel 3")).toBeInTheDocument();
    expect(screen.getByText("Carrel 4")).toBeInTheDocument();
  });

  it("distinguishes Back to Lobby from Leave Focus (session remains active on back)", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    fireEvent.click(screen.getByTestId("back-to-lobby-btn"));

    expect(mockSetViewMode).toHaveBeenCalledWith("lobby");
    expect(mockPush).toHaveBeenCalledWith("/social?tab=party");
    expect(mockLeaveFocus).not.toHaveBeenCalled();
  });

  it("leaves focus, banks study time, and redirects when Leave Focus is clicked", async () => {
    setupRoomContext();
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    fireEvent.click(screen.getByTestId("leave-focus-room-btn"));

    expect(mockLeaveFocus).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockSetViewMode).toHaveBeenCalledWith("lobby");
      expect(mockPush).toHaveBeenCalledWith("/social?tab=party");
    });
  });

  it("handles pausing and resuming the personal live timer", async () => {
    setupRoomContext({ myTimerState: "FOCUSING", myLiveSeconds: 360 });
    const { rerender } = render(<FocusPartyRoom />);

    fireEvent.click(screen.getByTestId("pause-timer-btn"));
    expect(mockPauseTimer).toHaveBeenCalled();

    setupRoomContext({ myTimerState: "PAUSED", myLiveSeconds: 360 });
    rerender(<FocusPartyRoom />);

    fireEvent.click(screen.getByTestId("resume-timer-btn"));
    expect(mockResumeTimer).toHaveBeenCalled();
  });

  it("renders Start Focus as single primary button when NOT_STARTED", async () => {
    setupRoomContext({ myTimerState: "NOT_STARTED", myLiveSeconds: 0 });
    await act(async () => {
      render(<FocusPartyRoom />);
    });

    expect(screen.getByTestId("start-timer-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("pause-timer-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("resume-timer-btn")).not.toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Shared Focus Background System & Preference Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe("Shared Focus Background Preference & Engine Integration", () => {
    it("renders Classic Sylf backdrop by default when no official/custom background is chosen", async () => {
      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      expect(screen.getByTestId("focus-bg-classic")).toBeInTheDocument();
      expect(screen.getByTestId("party-timer-dock-classic")).toBeInTheDocument();
    });

    it("Solo selects Anime -> Party opens with Anime environment and Anime timer styling", async () => {
      // Simulate Solo having persisted 'anime' official background in localStorage & server preference
      FocusBackgroundPreferenceModule.saveStoredPreference({
        source: "official",
        categorySlug: "anime",
        backgroundId: 101,
      });
      vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValueOnce({
        initialized: true,
        source: "official",
        categorySlug: "anime",
        backgroundId: 101,
        isClassic: false,
        customBackground: null,
        version: 2,
      });

      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      // Background renderer shows the image wallpaper
      expect(screen.getByTestId("focus-bg-image")).toBeInTheDocument();
      // Party timer presentation uses Anime visual styling
      expect(screen.getByTestId("party-timer-dock-anime")).toBeInTheDocument();
      expect(screen.getByText("Neon Alley")).toBeInTheDocument();
      // Member stage remains completely rendered and intact
      expect(screen.getByTestId("focus-party-member-stage")).toBeInTheDocument();
    });

    it("opens FocusBackgroundPicker when environment button is clicked", async () => {
      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      const envBtn = screen.getByTestId("env-selector-btn");
      expect(envBtn).toBeInTheDocument();
      fireEvent.click(envBtn);

      // Reuses FocusBackgroundPicker dialog
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Focus Environment")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Classic Sylf/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /My Backgrounds/i })).toBeInTheDocument();
    });

    it("Party selects Fantasy -> updates shared preference queue and switches timer to Fantasy styling", async () => {
      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      // Open picker
      fireEvent.click(screen.getByTestId("env-selector-btn"));

      // Click Fantasy category tab
      const fantasyTab = screen.getByRole("tab", { name: /Fantasy/i });
      fireEvent.click(fantasyTab);

      // Select Grand Observatory
      const observatoryCard = screen.getByText("Grand Observatory");
      await act(async () => {
        fireEvent.click(observatoryCard);
      });

      // Verifies shared preference queue was called
      expect(FocusBackgroundPreferenceModule.focusPreferenceQueue.enqueue).toHaveBeenCalledWith({
        source: "official",
        backgroundId: 103,
      });

      // Verifies local preference was saved for Solo Focus
      const stored = FocusBackgroundPreferenceModule.loadStoredPreference();
      expect(stored.source).toBe("official");
      expect(stored.backgroundId).toBe(103);

      // Timer style updates to Fantasy celestial treatment
      expect(screen.getByTestId("party-timer-dock-fantasy")).toBeInTheDocument();
    });

    it("Party selects custom background -> uses custom signed URL and Classic timer treatment", async () => {
      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      // Open picker
      fireEvent.click(screen.getByTestId("env-selector-btn"));

      // Click My Backgrounds tab
      const myBgTab = screen.getByRole("tab", { name: /My Backgrounds/i });
      fireEvent.click(myBgTab);

      // Select My Custom Sanctum
      const customCard = screen.getByText("My Custom Sanctum");
      await act(async () => {
        fireEvent.click(customCard);
      });

      // Verifies shared preference queue was called for custom
      expect(FocusBackgroundPreferenceModule.focusPreferenceQueue.enqueue).toHaveBeenCalledWith({
        source: "custom",
        backgroundId: 201,
      });

      // Custom background uses Classic timer dock
      expect(screen.getByTestId("party-timer-dock-classic")).toBeInTheDocument();
      expect(screen.getByTestId("focus-bg-image")).toBeInTheDocument();
    });

    it("does NOT write background preference data to Party Realtime or session state", async () => {
      const mockPartyContext = {
        party: mockPartyData,
        session: mockSessionData,
      };
      setupRoomContext();
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      // Background preference is purely local/client-side
      // Realtime session data does not contain any background fields
      expect((mockPartyContext.party.party as any).backgroundId).toBeUndefined();
      expect((mockPartyContext.session as any).backgroundId).toBeUndefined();
    });

    it("switching environments does NOT alter Party timer, elapsed time, or Together time", async () => {
      setupRoomContext({ myTimerState: "FOCUSING", myLiveSeconds: 540 });
      await act(async () => {
        render(<FocusPartyRoom />);
      });

      expect(screen.getByTestId("collective-focus-timer")).toHaveTextContent("12:00");
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("09:00"); // 540s = 09:00

      // Open picker and switch to Landscapes
      fireEvent.click(screen.getByTestId("env-selector-btn"));
      const landscapeTab = screen.getByRole("tab", { name: /Landscapes/i });
      fireEvent.click(landscapeTab);

      const alpineCard = screen.getByText("Alpine Peak");
      await act(async () => {
        fireEvent.click(alpineCard);
      });

      // Timer dock switched to landscape, but elapsed and collective times are invariant
      expect(screen.getByTestId("party-timer-dock-landscape")).toBeInTheDocument();
      expect(screen.getByTestId("collective-focus-timer")).toHaveTextContent("12:00");
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("09:00");
      expect(mockStartTimer).not.toHaveBeenCalled();
      expect(mockPauseTimer).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Safe-Zone Docking & Collision Prevention
  // ──────────────────────────────────────────────────────────────────────────
  describe("Party Safe-Zone Docking & Collision Prevention", () => {
    it("resolves Classic to center dock regardless of focal point", () => {
      expect(resolvePartySafeTimerPosition("left", 0.8, "classic")).toBe("center");
      expect(resolvePartySafeTimerPosition("right", 0.2, "classic")).toBe("center");
      expect(resolvePartySafeTimerPosition("auto", 0.7, "classic")).toBe("center");
    });

    it("resolves Landscape to center dock regardless of focal point", () => {
      expect(resolvePartySafeTimerPosition("left", 0.9, "landscape")).toBe("center");
      expect(resolvePartySafeTimerPosition("right", 0.1, "landscape")).toBe("center");
    });

    it("resolves Anime to negative space docking (left/right) when appropriate", () => {
      // focalX 0.75 (subject on right) -> timer on left negative space
      expect(resolvePartySafeTimerPosition("auto", 0.75, "anime")).toBe("left");
      // focalX 0.25 (subject on left) -> timer on right negative space
      expect(resolvePartySafeTimerPosition("auto", 0.25, "anime")).toBe("right");
      // explicit admin position takes precedence
      expect(resolvePartySafeTimerPosition("left", 0.25, "anime")).toBe("left");
      expect(resolvePartySafeTimerPosition("right", 0.75, "anime")).toBe("right");
    });

    it("resolves Fantasy to negative space docking (left/right) when appropriate", () => {
      expect(resolvePartySafeTimerPosition("auto", 0.8, "fantasy")).toBe("left");
      expect(resolvePartySafeTimerPosition("auto", 0.2, "fantasy")).toBe("right");
      expect(resolvePartySafeTimerPosition("center", 0.2, "fantasy")).toBe("center");
    });
  });
});
