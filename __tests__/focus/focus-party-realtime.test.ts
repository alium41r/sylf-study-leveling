/**
 * Focus Party Phase 2: Realtime Foundation & Client State Derivation Tests
 */
import { describe, it, expect } from "vitest";
import {
  deriveMemberTimer,
  deriveCollectiveSeconds,
  type FocusTimerState,
  type FocusPartyRealtimeEvent,
} from "@/lib/focus-party-types";
import { mapFocusPartyError } from "@/lib/focus-party-service";

describe("Phase 2: Local Timer Derivation (Zero-Polling Guarantee)", () => {
  const T0 = 1_700_000_000_000; // Reference epoch ms

  it("calculates 0 liveSeconds when timer is NOT_STARTED", () => {
    const res = deriveMemberTimer(0, null, "NOT_STARTED", T0);
    expect(res.liveSeconds).toBe(0);
    expect(res.isFocusing).toBe(false);
  });

  it("calculates live elapsed seconds purely from currentStartedAt when FOCUSING", () => {
    const startedAt = new Date(T0).toISOString();
    // 60 seconds later
    const res = deriveMemberTimer(0, startedAt, "FOCUSING", T0 + 60_000);
    expect(res.liveSeconds).toBe(60);
    expect(res.isFocusing).toBe(true);
  });

  it("adds accumulatedSeconds to live elapsed seconds when FOCUSING after a resume", () => {
    const startedAt = new Date(T0).toISOString();
    // Accumulated 300s previously + 45s since resume
    const res = deriveMemberTimer(300, startedAt, "FOCUSING", T0 + 45_000);
    expect(res.liveSeconds).toBe(345);
    expect(res.isFocusing).toBe(true);
  });

  it("freezes live elapsed seconds exactly to accumulatedSeconds when PAUSED", () => {
    const res = deriveMemberTimer(420, null, "PAUSED", T0 + 100_000);
    expect(res.liveSeconds).toBe(420);
    expect(res.isFocusing).toBe(false);
  });

  it("preserves accumulated seconds when participant has LEFT", () => {
    const res = deriveMemberTimer(1500, null, "LEFT", T0 + 500_000);
    expect(res.liveSeconds).toBe(1500);
    expect(res.isFocusing).toBe(false);
  });

  it("handles future timestamps or clock skew gracefully without negative numbers", () => {
    const startedAt = new Date(T0 + 5_000).toISOString(); // 5s in future due to skew
    const res = deriveMemberTimer(0, startedAt, "FOCUSING", T0);
    expect(res.liveSeconds).toBe(0);
  });

  it("computes accurate collective study time across 4 multiplayer participants", () => {
    const participants = [
      {
        accumulatedSeconds: 600, // Member 1: PAUSED at 10m
        currentStartedAt: null,
        timerState: "PAUSED" as FocusTimerState,
      },
      {
        accumulatedSeconds: 120, // Member 2: FOCUSING, started 30s ago -> 150s
        currentStartedAt: new Date(T0).toISOString(),
        timerState: "FOCUSING" as FocusTimerState,
      },
      {
        accumulatedSeconds: 0, // Member 3: NOT_STARTED -> 0s
        currentStartedAt: null,
        timerState: "NOT_STARTED" as FocusTimerState,
      },
      {
        accumulatedSeconds: 1800, // Member 4: LEFT after 30m -> 1800s
        currentStartedAt: null,
        timerState: "LEFT" as FocusTimerState,
      },
    ];

    const total = deriveCollectiveSeconds(participants, T0 + 30_000);
    // 600 + (120 + 30) + 0 + 1800 = 2550 seconds
    expect(total).toBe(2550);
  });
});

describe("Phase 2: Realtime Event Contracts & Payload Validation", () => {
  it("formats valid real-time event signatures", () => {
    const event: FocusPartyRealtimeEvent = {
      type: "TIMER_STARTED",
      partyId: 101,
      sessionId: 42,
      userId: 5,
      timestamp: new Date().toISOString(),
      payload: { startedAt: new Date().toISOString() },
    };

    expect(event.type).toBe("TIMER_STARTED");
    expect(event.partyId).toBe(101);
    expect(event.userId).toBe(5);
    expect(typeof event.timestamp).toBe("string");
  });

  it("supports all required event types in the state machine", () => {
    const eventTypes: FocusPartyRealtimeEvent["type"][] = [
      "MEMBER_JOINED",
      "MEMBER_LEFT",
      "MEMBER_REMOVED",
      "LEADER_CHANGED",
      "PARTY_DISBANDED",
      "SESSION_STARTED",
      "PARTICIPANT_ENTERED",
      "PARTICIPANT_LEFT",
      "SESSION_ENDED",
      "TIMER_STARTED",
      "TIMER_PAUSED",
      "TIMER_RESUMED",
    ];

    expect(eventTypes).toHaveLength(12);
  });
});

describe("Phase 2: Error Mapping & Safe Public Codes", () => {
  it("maps Postgres raise_exception PARTY_NOT_FOUND", () => {
    const err = new Error("FOCUS_PARTY_NOT_FOUND: party does not exist");
    const mapped = mapFocusPartyError(err);
    expect(mapped.code).toBe("PARTY_NOT_FOUND");
    expect(mapped.statusCode).toBe(404);
  });

  it("maps Postgres raise_exception PARTY_FULL to 409", () => {
    const err = new Error("FOCUS_PARTY_FULL: max 4 participants");
    const mapped = mapFocusPartyError(err);
    expect(mapped.code).toBe("PARTY_FULL");
    expect(mapped.statusCode).toBe(409);
  });

  it("maps Postgres raise_exception NOT_PARTY_LEADER to 403", () => {
    const err = new Error("FOCUS_PARTY_NOT_LEADER: only leader may perform this");
    const mapped = mapFocusPartyError(err);
    expect(mapped.code).toBe("NOT_PARTY_LEADER");
    expect(mapped.statusCode).toBe(403);
  });

  it("maps INVITE_REQUIRED to 403", () => {
    const err = new Error("FOCUS_PARTY_INVITE_REQUIRED: must be invited");
    const mapped = mapFocusPartyError(err);
    expect(mapped.code).toBe("INVITE_REQUIRED");
    expect(mapped.statusCode).toBe(403);
  });

  it("maps generic error to INTERNAL_ERROR with 500 status", () => {
    const err = new Error("Some unexpected socket disconnect");
    const mapped = mapFocusPartyError(err);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.statusCode).toBe(500);
  });
});
