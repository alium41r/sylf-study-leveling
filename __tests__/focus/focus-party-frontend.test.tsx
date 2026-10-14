/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  formatFocusTime,
  getRankBadgeStyles,
  getTimerStateBadgeStyles,
} from "@/app/social/components/focus-party/focus-party-utils";
import { FocusPartyEmptyState } from "@/app/social/components/focus-party/FocusPartyEmptyState";
import { FocusPartyLobby } from "@/app/social/components/focus-party/FocusPartyLobby";
import { FocusPartyRoom } from "@/app/social/components/focus-party/FocusPartyRoom";
import { FocusPartyInviteModal } from "@/app/social/components/focus-party/FocusPartyInviteModal";
import { FocusPartySection } from "@/app/social/components/focus-party/FocusPartySection";
import * as FocusPartyContextModule from "@/app/social/components/focus-party/FocusPartyContext";

// Mock the explicit target-owner Pixel presenter to keep unit tests fast and DOM-focused
vi.mock("@/app/components/companion/TargetPixelCompanion", () => ({
  TargetPixelCompanion: ({ companion, size }: any) => (
    <div data-testid={`pixel-companion-${companion?.ownerId ?? "unavailable"}`} data-owner={companion?.ownerId}>
      Pixel companion ({companion?.ownerId ?? "unavailable"})
    </div>
  ),
}));

// Mock AuthProvider
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, username: "ali", name: "Ali", hunterRank: "S", level: 25 },
    isLoading: false,
  }),
}));

describe("Focus Party: Pure Frontend Utilities", () => {
  it("formats seconds correctly into MM:SS and HH:MM:SS", () => {
    expect(formatFocusTime(0)).toBe("00:00");
    expect(formatFocusTime(45)).toBe("00:45");
    expect(formatFocusTime(125)).toBe("02:05");
    expect(formatFocusTime(3599)).toBe("59:59");
    expect(formatFocusTime(3600)).toBe("01:00:00");
    expect(formatFocusTime(3665)).toBe("01:01:05");
  });

  it("returns appropriate rank styling classes", () => {
    expect(getRankBadgeStyles("S")).toContain("text-rose-400");
    expect(getRankBadgeStyles("A")).toContain("text-amber-400");
    expect(getRankBadgeStyles("B")).toContain("text-purple-300");
    expect(getRankBadgeStyles("C")).toContain("text-sky-300");
    expect(getRankBadgeStyles("D")).toContain("text-emerald-300");
    expect(getRankBadgeStyles("E")).toContain("text-slate-300");
  });

  it("returns proper timer state badge classes and labels", () => {
    const focusing = getTimerStateBadgeStyles("FOCUSING");
    expect(focusing.label).toBe("FOCUSING");
    expect(focusing.badgeClass).toContain("emerald");

    const paused = getTimerStateBadgeStyles("PAUSED");
    expect(paused.label).toBe("PAUSED");
    expect(paused.badgeClass).toContain("amber");

    const left = getTimerStateBadgeStyles("LEFT");
    expect(left.label).toBe("LEFT");

    const notStarted = getTimerStateBadgeStyles("NOT_STARTED");
    expect(notStarted.label).toBe("NOT STARTED");
  });
});

describe("Focus Party: Empty State & Invitations", () => {
  const mockCreateParty = vi.fn();
  const mockRespondToInvite = vi.fn();
  const mockClearError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupEmptyContext = (pendingInvites: any[] = [], error: string | null = null) => {
    vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
      partySummary: null,
      party: null,
      session: null,
      timerViews: {},
      collectiveSeconds: 0,
      connectionState: "disconnected",
      pendingInvites,
      viewMode: "lobby",
      setViewMode: vi.fn(),
      isLoading: false,
      isActionLoading: false,
      error,
      hasActiveParty: false,
      isLeader: false,
      isInFocus: false,
      myParticipant: null,
      myTimerView: null,
      myTimerState: "NOT_STARTED",
      myLiveSeconds: 0,
      refresh: vi.fn(),
      createParty: mockCreateParty,
      joinParty: vi.fn(),
      leaveParty: vi.fn(),
      kickMember: vi.fn(),
      inviteFriend: vi.fn(),
      respondToInvite: mockRespondToInvite,
      enterFocus: vi.fn(),
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      resumeTimer: vi.fn(),
      leaveFocus: vi.fn(),
      clearError: mockClearError,
    });
  };

  it("1. renders no-party empty state with Create Party button", () => {
    setupEmptyContext();
    render(<FocusPartyEmptyState />);

    expect(screen.getByText("Focus Party")).toBeInTheDocument();
    expect(screen.getByText("MULTIPLAYER STUDY SESSIONS")).toBeInTheDocument();
    expect(screen.getByTestId("create-party-btn")).toBeInTheDocument();
  });

  it("renders inline name input and dispatches createParty", async () => {
    setupEmptyContext();
    render(<FocusPartyEmptyState />);

    fireEvent.click(screen.getByTestId("create-party-btn"));

    const input = screen.getByPlaceholderText(/Party name/i);
    fireEvent.change(input, { target: { value: "Midnight Scholar" } });

    fireEvent.click(screen.getByTestId("submit-create-party"));
    expect(mockCreateParty).toHaveBeenCalledWith("Midnight Scholar");
  });

  it("renders pending invitations and allows accepting / declining", async () => {
    const invites = [
      {
        id: 101,
        partyId: 5,
        partyName: "Midnight Grind",
        senderId: 2,
        senderName: "Dark",
        senderUsername: "dark",
        senderAvatarUrl: null,
        createdAt: new Date().toISOString(),
        status: "PENDING" as const,
      },
    ];
    setupEmptyContext(invites);
    render(<FocusPartyEmptyState />);

    expect(screen.getByText(/Party Invitations \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("Midnight Grind")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();

    // Accept
    await act(async () => {
      fireEvent.click(screen.getByTestId("accept-invite-101"));
    });
    expect(mockRespondToInvite).toHaveBeenCalledWith(101, "ACCEPTED");

    // Decline
    await act(async () => {
      fireEvent.click(screen.getByTestId("decline-invite-101"));
    });
    expect(mockRespondToInvite).toHaveBeenCalledWith(101, "DECLINED");
  });
});

describe("Focus Party: Lobby Component", () => {
  const mockEnterFocus = vi.fn();
  const mockLeaveParty = vi.fn();
  const mockKickMember = vi.fn();
  const mockSetViewMode = vi.fn();
  const mockOpenInvite = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPartyData = {
    party: {
      id: 10,
      name: "Solitary Grind",
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
    activeSession: null,
  };

  const setupLobbyContext = (overrides: Partial<FocusPartyContextModule.FocusPartyContextValue> = {}) => {
    vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
      partySummary: mockPartyData.party,
      party: mockPartyData,
      session: null,
      timerViews: {},
      collectiveSeconds: 0,
      connectionState: "connected",
      pendingInvites: [],
      viewMode: "lobby",
      setViewMode: mockSetViewMode,
      isLoading: false,
      isActionLoading: false,
      error: null,
      hasActiveParty: true,
      isLeader: true,
      isInFocus: false,
      myParticipant: null,
      myTimerView: null,
      myTimerState: "NOT_STARTED",
      myLiveSeconds: 0,
      refresh: vi.fn(),
      createParty: vi.fn(),
      joinParty: vi.fn(),
      leaveParty: mockLeaveParty,
      kickMember: mockKickMember,
      inviteFriend: vi.fn(),
      respondToInvite: vi.fn(),
      enterFocus: mockEnterFocus,
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      resumeTimer: vi.fn(),
      leaveFocus: vi.fn(),
      clearError: vi.fn(),
      ...overrides,
    });
  };

  it("2 & 3. renders party lobby with active members and details", () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    expect(screen.getByText("Solitary Grind")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    expect(screen.getByTestId("lobby-member-1")).toBeInTheDocument();
    expect(screen.getByTestId("lobby-member-2")).toBeInTheDocument();
    expect(screen.getByText("Live Sync")).toBeInTheDocument();
  });

  it("4. represents leader correctly with Leader crown badge", () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    const leaderBadge = screen.getByText("Leader");
    expect(leaderBadge).toBeInTheDocument();
  });

  it("renders empty slots up to 4 and opens invite modal", () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    expect(screen.getByTestId("empty-lobby-slot-0")).toBeInTheDocument();
    expect(screen.getByTestId("empty-lobby-slot-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lobby-invite-btn"));
    expect(mockOpenInvite).toHaveBeenCalled();
  });

  it("6. enters focus when Enter Focus button is clicked", async () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    fireEvent.click(screen.getByTestId("enter-focus-btn"));
    expect(mockEnterFocus).toHaveBeenCalled();
  });

  it("switches to room view if user is already in focus", async () => {
    setupLobbyContext({ isInFocus: true });
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    fireEvent.click(screen.getByTestId("enter-focus-btn"));
    expect(mockSetViewMode).toHaveBeenCalledWith("room");
  });

  it("15. allows leaving the party with confirmation", async () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    fireEvent.click(screen.getByTestId("leave-party-btn"));
    expect(screen.getByText("Leave party?")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-leave-party-btn"));
    expect(mockLeaveParty).toHaveBeenCalled();
  });

  it("allows leader to kick non-leader member", async () => {
    setupLobbyContext();
    render(<FocusPartyLobby onOpenInvite={mockOpenInvite} />);

    fireEvent.click(screen.getByTestId("kick-member-2"));
    expect(screen.getByText("Confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm"));
    expect(mockKickMember).toHaveBeenCalledWith(2);
  });
});

describe("Focus Party: Focus Room Component", () => {
  const mockStartTimer = vi.fn();
  const mockPauseTimer = vi.fn();
  const mockResumeTimer = vi.fn();
  const mockLeaveFocus = vi.fn();
  const mockSetViewMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSessionData = {
    id: 99,
    startedAt: new Date().toISOString(),
    collectiveSeconds: 310,
    members: [
      {
        userId: 1,
        timerState: "NOT_STARTED" as const,
        accumulatedSeconds: 0,
        currentStartedAt: null,
        liveSeconds: 0,
        isFocusing: false,
      },
      {
        userId: 2,
        timerState: "FOCUSING" as const,
        accumulatedSeconds: 120,
        currentStartedAt: new Date().toISOString(),
        liveSeconds: 145,
        isFocusing: true,
      },
    ],
  };

  const mockPartyWithMembers = {
    party: {
      id: 10,
      name: "Alpha Squad",
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
      partySummary: mockPartyWithMembers.party,
      party: mockPartyWithMembers,
      session: mockSessionData,
      timerViews: {
        1: mockSessionData.members[0],
        2: mockSessionData.members[1],
      },
      collectiveSeconds: 310,
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
      myTimerState: "NOT_STARTED",
      myLiveSeconds: 0,
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

  it("renders Focus Room with participants and collective time", () => {
    setupRoomContext();
    render(<FocusPartyRoom />);

    expect(screen.getByText("ACTIVE FOCUS ROOM")).toBeInTheDocument();
    expect(screen.getByText("Alpha Squad")).toBeInTheDocument();
    expect(screen.getByTestId("collective-focus-timer")).toHaveTextContent("05:10"); // 310s = 05:10
    expect(screen.getByTestId("room-participant-1")).toBeInTheDocument();
    expect(screen.getByTestId("room-participant-2")).toBeInTheDocument();
  });

  it("9. starts timer when Start Timer is clicked", async () => {
    setupRoomContext({ myTimerState: "NOT_STARTED", myLiveSeconds: 0 });
    render(<FocusPartyRoom />);

    const startBtn = screen.getByTestId("start-timer-btn");
    expect(startBtn).toBeInTheDocument();

    fireEvent.click(startBtn);
    expect(mockStartTimer).toHaveBeenCalled();
  });

  it("10. pauses timer when Pause Timer is clicked while FOCUSING", async () => {
    setupRoomContext({ myTimerState: "FOCUSING", myLiveSeconds: 150 });
    render(<FocusPartyRoom />);

    const pauseBtn = screen.getByTestId("pause-timer-btn");
    expect(pauseBtn).toBeInTheDocument();

    fireEvent.click(pauseBtn);
    expect(mockPauseTimer).toHaveBeenCalled();
  });

  it("11. resumes timer when Resume Timer is clicked while PAUSED", async () => {
    setupRoomContext({ myTimerState: "PAUSED", myLiveSeconds: 150 });
    render(<FocusPartyRoom />);

    const resumeBtn = screen.getByTestId("resume-timer-btn");
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(mockResumeTimer).toHaveBeenCalled();
  });

  it("13. leaves focus room when Leave Focus is clicked", async () => {
    setupRoomContext();
    render(<FocusPartyRoom />);

    fireEvent.click(screen.getByTestId("leave-focus-room-btn"));
    expect(mockLeaveFocus).toHaveBeenCalled();
  });

  it("navigates back to lobby without leaving session", async () => {
    setupRoomContext();
    render(<FocusPartyRoom />);

    fireEvent.click(screen.getByTestId("back-to-lobby-btn"));
    expect(mockSetViewMode).toHaveBeenCalledWith("lobby");
  });
});

describe("Focus Party: Invite Friends Modal", () => {
  const mockInviteFriend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const friendsList = [
    { id: 2, name: "Dark", username: "dark", hunterRank: "A" },
    { id: 3, name: "Sara", username: "sara", hunterRank: "B" },
    { id: 4, name: "Omar", username: "omar", hunterRank: "C" },
  ];

  const setupInviteContext = (memberIds: number[] = [1]) => {
    vi.spyOn(FocusPartyContextModule, "useFocusParty").mockReturnValue({
      partySummary: { id: 10, name: "Alpha Squad", leaderId: 1, createdAt: "", updatedAt: "", disbandedAt: null, isCurrentUserLeader: true, memberCount: memberIds.length },
      party: {
        party: { id: 10, name: "Alpha Squad", leaderId: 1, createdAt: "", updatedAt: "", disbandedAt: null, isCurrentUserLeader: true, memberCount: memberIds.length },
        members: memberIds.map(id => ({ userId: id, name: `User ${id}`, username: `user${id}`, hunterRank: "B", avatarUrl: null, characterConfig: null, joinedAt: "", isLeader: id === 1 })),
        activeSession: null,
      },
      session: null,
      timerViews: {},
      collectiveSeconds: 0,
      connectionState: "connected",
      pendingInvites: [],
      viewMode: "lobby",
      setViewMode: vi.fn(),
      isLoading: false,
      isActionLoading: false,
      error: null,
      hasActiveParty: true,
      isLeader: true,
      isInFocus: false,
      myParticipant: null,
      myTimerView: null,
      myTimerState: "NOT_STARTED",
      myLiveSeconds: 0,
      refresh: vi.fn(),
      createParty: vi.fn(),
      joinParty: vi.fn(),
      leaveParty: vi.fn(),
      kickMember: vi.fn(),
      inviteFriend: mockInviteFriend,
      respondToInvite: vi.fn(),
      enterFocus: vi.fn(),
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      resumeTimer: vi.fn(),
      leaveFocus: vi.fn(),
      clearError: vi.fn(),
    });
  };

  it("5. invites eligible friends and shows Invited status", async () => {
    setupInviteContext([1]);
    mockInviteFriend.mockResolvedValue({ success: true, inviteId: 88 });

    render(<FocusPartyInviteModal friends={friendsList} onClose={vi.fn()} />);

    expect(screen.getByText("Sara")).toBeInTheDocument();
    const inviteSaraBtn = screen.getByTestId("send-invite-btn-3");
    expect(inviteSaraBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(inviteSaraBtn);
    });

    expect(mockInviteFriend).toHaveBeenCalledWith(3);
    await waitFor(() => {
      expect(screen.getByText("Invited")).toBeInTheDocument();
    });
  });

  it("marks already-present members as In Party", () => {
    setupInviteContext([1, 2]); // Dark (id 2) is already in party
    render(<FocusPartyInviteModal friends={friendsList} onClose={vi.fn()} />);

    expect(screen.getByText("In Party")).toBeInTheDocument();
  });

  it("disables invite buttons when party capacity is full (4/4)", () => {
    setupInviteContext([1, 5, 6, 7]); // 4 members
    render(<FocusPartyInviteModal friends={friendsList} onClose={vi.fn()} />);

    expect(screen.getByText(/maximum capacity/i)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Invite/i });
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
