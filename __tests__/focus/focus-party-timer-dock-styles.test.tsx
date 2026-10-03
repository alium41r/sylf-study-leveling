import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FocusPartyRoom } from "@/app/social/components/focus-party/FocusPartyRoom";
import { FocusPartyTimerLayoutRouter, resolvePartySafeTimerPosition } from "@/app/social/components/focus-party/FocusPartyTimerLayoutRouter";
import { ClassicTimerDock, ClassicTimerLayout } from "@/app/focus/components/layouts/ClassicTimerLayout";
import { AnimeTimerDock, AnimeTimerLayout } from "@/app/focus/components/layouts/AnimeTimerLayout";
import { LandscapeTimerDock, LandscapeTimerLayout } from "@/app/focus/components/layouts/LandscapeTimerLayout";
import { FantasyTimerDock, FantasyTimerLayout } from "@/app/focus/components/layouts/FantasyTimerLayout";
import * as FocusPartyContextModule from "@/app/social/components/focus-party/FocusPartyContext";
import * as FocusBackgroundPreferenceModule from "@/lib/focus-background-preference";
import * as FocusBackgroundClientModule from "@/lib/focus-background-client";
import { FocusTimerLayoutProps } from "@/app/focus/components/FocusTimerLayoutProps";

// Mock AuthProvider
const mockUser = { id: "user-1", username: "SoloLeveler", name: "Ali", hunterRank: "S", level: 25 };
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/focus-party",
}));

// Mock Audio
class MockAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  currentTime = 0;
  volume = 1;
}
(global as any).Audio = MockAudio;

const mockCatalog: FocusBackgroundClientModule.FocusBackgroundCatalog = {
  categories: [
    {
      id: 1,
      slug: "classic",
      name: "Classic Sylf",
      description: "Default minimalist focus",
      layoutKey: "classic",
      sortOrder: 0,
      isActive: true,
      backgrounds: [],
    },
    {
      id: 2,
      slug: "anime",
      name: "Anime Focus",
      description: "Stylized anime worlds",
      layoutKey: "anime",
      sortOrder: 1,
      isActive: true,
      backgrounds: [
        {
          id: 101,
          categoryId: 2,
          name: "Neon Alley",
          storagePath: "anime/neon.webp",
          publicUrl: "https://mock.supabase.co/anime/neon.webp",
          width: 3840,
          height: 2160,
          aspectRatio: 1.778,
          focalX: 0.8,
          focalY: 0.5,
          timerPosition: "auto",
          sortOrder: 1,
          isActive: true,
        },
      ],
    },
    {
      id: 3,
      slug: "landscapes",
      name: "Landscapes",
      description: "Natural vistas",
      layoutKey: "landscape",
      sortOrder: 2,
      isActive: true,
      backgrounds: [
        {
          id: 102,
          categoryId: 3,
          name: "Alpine Vista",
          storagePath: "landscapes/alpine.webp",
          publicUrl: "https://mock.supabase.co/landscapes/alpine.webp",
          width: 3840,
          height: 2160,
          aspectRatio: 1.778,
          focalX: 0.5,
          focalY: 0.5,
          timerPosition: "center",
          sortOrder: 1,
          isActive: true,
        },
      ],
    },
    {
      id: 4,
      slug: "fantasy",
      name: "Fantasy",
      description: "Astronomical sanctums",
      layoutKey: "fantasy",
      sortOrder: 3,
      isActive: true,
      backgrounds: [
        {
          id: 103,
          categoryId: 4,
          name: "Grand Observatory",
          storagePath: "fantasy/observatory.webp",
          publicUrl: "https://mock.supabase.co/fantasy/observatory.webp",
          width: 3840,
          height: 2160,
          aspectRatio: 1.778,
          focalX: 0.2,
          focalY: 0.5,
          timerPosition: "auto",
          sortOrder: 1,
          isActive: true,
        },
      ],
    },
  ],
};

function createMockSoloProps(overrides: Partial<FocusTimerLayoutProps> = {}): FocusTimerLayoutProps {
  return {
    formattedDisplayTime: "25:00",
    elapsedSeconds: 300,
    breakSeconds: 0,
    remainingSeconds: 1200,
    isCountdown: true,
    isBreak: false,
    phase: "focus",
    phaseColor: "#34d399",
    phaseLabel: "FOCUS",
    modeDisplayName: "Pomodoro",
    subjectName: "Advanced Arcane",
    questData: null,
    initialSubjectSeconds: 1800,
    initialTotalSeconds: 3600,
    currentSession: 2,
    totalSessions: 4,
    showSessionDots: true,
    isPaused: false,
    pauseReason: "manual",
    isEnding: false,
    endError: null,
    flowNudge: false,
    onTogglePause: vi.fn(),
    onEndSession: vi.fn(),
    onCompleteQuest: vi.fn(),
    onTakeFlowBreak: vi.fn(),
    onSkipFlowBreak: vi.fn(),
    background: null,
    category: mockCatalog.categories[0],
    layoutKey: "classic",
    formatTime: (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    },
    ...overrides,
  };
}

describe("Focus Party Timer Dock Integration & Solo Parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(FocusBackgroundClientModule, "fetchFocusBackgroundCatalog").mockResolvedValue(mockCatalog);
    vi.spyOn(FocusBackgroundPreferenceModule, "fetchServerPreference").mockResolvedValue({
      initialized: true,
      source: "official",
      categorySlug: "classic",
      backgroundId: null,
      isClassic: true,
      customBackground: null,
      version: 1,
    });
    vi.spyOn(FocusBackgroundPreferenceModule.focusPreferenceQueue, "enqueue").mockImplementation(vi.fn());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Solo Layouts 1:1 Preservation After Extraction
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Solo Layouts 1:1 Preservation", () => {
    it("Solo Classic renders centered digital clock, header, and bottom controls", () => {
      const props = createMockSoloProps();
      const { container } = render(<ClassicTimerLayout {...props} />);
      expect(screen.getByText("25:00")).toBeInTheDocument();
      expect(screen.getByText("Advanced Arcane")).toBeInTheDocument();
      expect(screen.getByText("Pause")).toBeInTheDocument();
      expect(screen.getByText("End Session")).toBeInTheDocument();
      expect(screen.getByText("25:00")).toHaveClass("font-mono");
    });

    it("Solo Anime renders pod, quest title, sub-timers, and action controls", () => {
      const props = createMockSoloProps({
        background: {
          id: 101,
          categoryId: 2,
          name: "Neon",
          storagePath: "a.webp",
          publicUrl: "a.webp",
          width: 1920,
          height: 1080,
          aspectRatio: 1.77,
          focalX: 0.8,
          focalY: 0.5,
          timerPosition: "left",
          sortOrder: 1,
          isActive: true,
        },
      });
      render(<AnimeTimerLayout {...props} />);
      expect(screen.getByTestId("solo-timer-dock-anime")).toBeInTheDocument();
      expect(screen.getByText("25:00")).toBeInTheDocument();
      expect(screen.getByText("Pause")).toBeInTheDocument();
      expect(screen.getByText("End")).toBeInTheDocument();
    });

    it("Solo Landscape renders cinematic digits and minimal controls strip", () => {
      const props = createMockSoloProps();
      render(<LandscapeTimerLayout {...props} />);
      expect(screen.getByTestId("solo-timer-dock-landscape")).toBeInTheDocument();
      expect(screen.getByText("25:00")).toBeInTheDocument();
      expect(screen.getByText("Pause")).toBeInTheDocument();
    });

    it("Solo Fantasy renders celestial liquid-glass clock with functional tick ring & astrolabe halo", () => {
      const props = createMockSoloProps();
      render(<FantasyTimerLayout {...props} />);
      expect(screen.getByTestId("solo-timer-dock-fantasy")).toBeInTheDocument();
      expect(screen.getByText("25:00")).toBeInTheDocument();
      expect(screen.getByText("Pause")).toBeInTheDocument();
      // Astrolabe svg exists
      expect(document.querySelector(".fantasy-glow-breathe")).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Party Timer Dock Layout Selection via FocusPartyTimerLayoutRouter
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. FocusPartyTimerLayoutRouter & Authentic Docks", () => {
    it("routes 'classic' to authentic ClassicTimerDock with compact density", () => {
      render(
        <FocusPartyTimerLayoutRouter
          myTimerState="FOCUSING"
          myLiveSeconds={600}
          isActionLoading={false}
          onAction={vi.fn()}
          layoutKey="classic"
        />
      );
      const dock = screen.getByTestId("party-timer-dock-classic");
      expect(dock).toBeInTheDocument();
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("10:00");
      expect(screen.getByTestId("pause-timer-btn")).toBeInTheDocument();
    });

    it("routes 'anime' to authentic AnimeTimerDock with compact density", () => {
      render(
        <FocusPartyTimerLayoutRouter
          myTimerState="FOCUSING"
          myLiveSeconds={300}
          isActionLoading={false}
          onAction={vi.fn()}
          layoutKey="anime"
        />
      );
      const dock = screen.getByTestId("party-timer-dock-anime");
      expect(dock).toBeInTheDocument();
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("05:00");
      expect(screen.getByTestId("pause-timer-btn")).toBeInTheDocument();
    });

    it("routes 'landscape' to authentic LandscapeTimerDock with compact density", () => {
      render(
        <FocusPartyTimerLayoutRouter
          myTimerState="PAUSED"
          myLiveSeconds={120}
          isActionLoading={false}
          onAction={vi.fn()}
          layoutKey="landscape"
        />
      );
      const dock = screen.getByTestId("party-timer-dock-landscape");
      expect(dock).toBeInTheDocument();
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("02:00");
      expect(screen.getByTestId("resume-timer-btn")).toBeInTheDocument();
    });

    it("routes 'fantasy' to authentic FantasyTimerDock with compact celestial dial", () => {
      render(
        <FocusPartyTimerLayoutRouter
          myTimerState="FOCUSING"
          myLiveSeconds={45}
          isActionLoading={false}
          onAction={vi.fn()}
          layoutKey="fantasy"
        />
      );
      const dock = screen.getByTestId("party-timer-dock-fantasy");
      expect(dock).toBeInTheDocument();
      expect(screen.getByTestId("my-live-timer")).toHaveTextContent("00:45");
      expect(screen.getByTestId("pause-timer-btn")).toBeInTheDocument();
      // Functional tick ring and progress ring render inside SVG
      expect(dock.querySelector("svg")).toBeTruthy();
    });

    it("custom background routes to ClassicTimerDock in lower-center", () => {
      render(
        <FocusPartyTimerLayoutRouter
          myTimerState="NOT_STARTED"
          myLiveSeconds={0}
          isActionLoading={false}
          onAction={vi.fn()}
          layoutKey="classic"
          background={{
            id: 999,
            categoryId: 0,
            name: "My Custom Image",
            storagePath: "custom.webp",
            publicUrl: "custom.webp",
            width: 1920,
            height: 1080,
            aspectRatio: 1.77,
            focalX: 0.2,
            focalY: 0.5,
            timerPosition: "left", // stored custom position must NOT force docking in Party
            sortOrder: 1,
            isActive: true,
          }}
        />
      );
      expect(screen.getByTestId("party-timer-dock-classic")).toBeInTheDocument();
      expect(screen.getByTestId("start-timer-btn")).toBeInTheDocument();
      const routerContainer = screen.getByTestId("focus-party-timer-router");
      expect(routerContainer.className).toContain("self-center");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Separate DOM Regions & Safe Zone
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. DOM Structure & Safe Zone Decoupling", () => {
    it("member stage and timer zone remain distinct siblings inside <main>", async () => {
      const mockParty = {
        party: {
          id: "party-123",
          name: "Alpha Squad",
          code: "ALPHA1",
          createdAt: new Date().toISOString(),
          isActive: true,
          leaderId: "user-1",
        },
        members: [
          {
            id: "m-1",
            partyId: "party-123",
            userId: "user-1",
            joinedAt: new Date().toISOString(),
            isActive: true,
            user: { id: "user-1", username: "SoloLeveler", hunterRank: "S" },
          },
        ],
        currentUserMembership: { id: "m-1", partyId: "party-123", userId: "user-1", isActive: true },
        isLeader: true,
      };

      const mockSession = {
        session: {
          id: "sess-123",
          partyId: "party-123",
          mode: "FREE_FLOW" as const,
          targetDurationSeconds: 1500,
          totalDurationSeconds: 0,
          currentInterval: 1,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          endedAt: null,
          status: "IN_PROGRESS" as const,
        },
        participantTimers: [],
      };

      vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
        party: mockParty as any,
        session: mockSession as any,
        members: mockParty.members as any,
        invites: [],
        isLoading: false,
        isActionLoading: false,
        error: null,
        hasActiveParty: true,
        isLeader: true,
        isInFocus: true,
        myParticipant: null,
        myTimerView: null,
        myTimerState: "FOCUSING",
        myLiveSeconds: 420,
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
      } as any);

      await act(async () => {
        render(<FocusPartyRoom />);
      });

      const memberStage = screen.getByTestId("focus-party-member-stage");
      const timerRouter = screen.getByTestId("focus-party-timer-router");

      expect(memberStage).toBeInTheDocument();
      expect(timerRouter).toBeInTheDocument();

      // They are sibling DOM elements inside main
      expect(memberStage.parentElement).toBe(timerRouter.parentElement);
      expect(memberStage.contains(timerRouter)).toBe(false);
      expect(timerRouter.contains(memberStage)).toBe(false);
    });

    it("Party safe-zone position resolver aligns correctly across focal points", () => {
      // Classic and Landscape are always center
      expect(resolvePartySafeTimerPosition("left", 0.8, "classic")).toBe("center");
      expect(resolvePartySafeTimerPosition("right", 0.2, "classic")).toBe("center");
      expect(resolvePartySafeTimerPosition("left", 0.9, "landscape")).toBe("center");

      // Anime and Fantasy safely move to negative space on desktop
      expect(resolvePartySafeTimerPosition("auto", 0.75, "anime")).toBe("left");
      expect(resolvePartySafeTimerPosition("auto", 0.25, "anime")).toBe("right");
      expect(resolvePartySafeTimerPosition("auto", 0.8, "fantasy")).toBe("left");
      expect(resolvePartySafeTimerPosition("auto", 0.2, "fantasy")).toBe("right");
      expect(resolvePartySafeTimerPosition("center", 0.2, "fantasy")).toBe("center");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Real Party Action Semantics
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Party Action Semantics", () => {
    it("maps NOT_STARTED -> Start Focus, FOCUSING -> Pause, PAUSED -> Resume", async () => {
      const mockAction = vi.fn().mockResolvedValue(undefined);

      // NOT_STARTED
      const { rerender } = render(
        <FocusPartyTimerLayoutRouter
          myTimerState="NOT_STARTED"
          myLiveSeconds={0}
          isActionLoading={false}
          onAction={mockAction}
          layoutKey="anime"
        />
      );
      const startBtn = screen.getByTestId("start-timer-btn");
      expect(startBtn).toHaveTextContent("Start Focus");
      fireEvent.click(startBtn);
      expect(mockAction).toHaveBeenCalledTimes(1);

      // FOCUSING
      rerender(
        <FocusPartyTimerLayoutRouter
          myTimerState="FOCUSING"
          myLiveSeconds={15}
          isActionLoading={false}
          onAction={mockAction}
          layoutKey="anime"
        />
      );
      const pauseBtn = screen.getByTestId("pause-timer-btn");
      expect(pauseBtn).toHaveTextContent("Pause");
      fireEvent.click(pauseBtn);
      expect(mockAction).toHaveBeenCalledTimes(2);

      // PAUSED
      rerender(
        <FocusPartyTimerLayoutRouter
          myTimerState="PAUSED"
          myLiveSeconds={15}
          isActionLoading={false}
          onAction={mockAction}
          layoutKey="anime"
        />
      );
      const resumeBtn = screen.getByTestId("resume-timer-btn");
      expect(resumeBtn).toHaveTextContent("Resume");
      fireEvent.click(resumeBtn);
      expect(mockAction).toHaveBeenCalledTimes(3);

      // Verify Solo-only actions are NOT rendered in Party dock
      expect(screen.queryByText("Take Break")).not.toBeInTheDocument();
      expect(screen.queryByText("Skip Break")).not.toBeInTheDocument();
      expect(screen.queryByText("Complete Quest")).not.toBeInTheDocument();
    });
  });
});
