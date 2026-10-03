import { describe, expect, it } from "vitest";
import { StudySessionExecutionV2Schema, StudySessionTransitionV2Schema } from "@/lib/planner/v2/contracts";
import { instant } from "./fixtures";

describe("Planner V2 StudySession execution boundary", () => {
  const session = () => ({ schemaVersion: 2, sessionId: 7, ownerId: 1133, questId: 8, state: "RUNNING", executionVersion: 1,
    acceptedFocusSeconds: 0, acceptedBreakSeconds: 0, startedAt: instant, endedAt: null, actualCivilDate: "2026-10-02", timezone: "Asia/Karachi" });
  it("represents a zero-second server start and acknowledged pause independently from end", () => {
    expect(StudySessionExecutionV2Schema.safeParse(session()).success).toBe(true);
    expect(StudySessionExecutionV2Schema.safeParse({ ...session(), state: "PAUSED" }).success).toBe(true);
    expect(StudySessionExecutionV2Schema.safeParse({ ...session(), state: "ENDED" }).success).toBe(false);
    expect(StudySessionExecutionV2Schema.safeParse({ ...session(), state: "ENDED", endedAt: instant }).success).toBe(true);
  });
  it("rejects minute aliases and task/mastery completion flags in the session record", () => {
    expect(StudySessionExecutionV2Schema.safeParse({ ...session(), durationMinutes: 1 }).success).toBe(false);
    expect(StudySessionExecutionV2Schema.safeParse({ ...session(), completed: true }).success).toBe(false);
  });
  it("requires execution-version correspondence on state/progress transitions", () => {
    const transition = { schemaVersion: 2, sessionId: 7, expectedExecutionVersion: 1, idempotencyKey: "pause-request-001", action: "PAUSE", cumulativeFocusSeconds: 90, cumulativeBreakSeconds: 30 };
    expect(StudySessionTransitionV2Schema.safeParse(transition).success).toBe(true);
    expect(StudySessionTransitionV2Schema.safeParse({ ...transition, expectedExecutionVersion: 0 }).success).toBe(false);
  });
});
