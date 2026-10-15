// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { emptyComparisonView, type IntakeView } from "@/lib/planner/intake/actions";
import type { DesignerModel } from "@/lib/planner/designer/model";
import type { CopilotModel } from "@/lib/planner/copilot/model";
import { CopilotTurnRequestSchema } from "@/lib/planner/copilot/contracts";
import { runDesignerTurn } from "@/lib/planner/designer/run";
import { runCopilotTurn } from "@/lib/planner/copilot/run";
import { readProposal } from "@/lib/planner/copilot/proposal";
import { mapCommands } from "@/lib/planner/copilot/map";

const state = vi.hoisted(() => ({ view: null as unknown, apply: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/planner/server/intake-session", () => ({
  readSession: vi.fn(async (userId: number, sessionId: string) => {
    state.read(userId, sessionId);
    return { expiresAt: new Date("2099-01-01"), planId: null };
  }),
  isExpired: () => false,
}));
vi.mock("@/lib/planner/server/intake", () => ({
  readIntake: vi.fn(async () => state.view),
  applyBriefCommandBatch: (...args: unknown[]) => state.apply(...args),
}));
vi.mock("@/lib/planner/copilot/context", async (original) => ({
  ...await original<typeof import("@/lib/planner/copilot/context")>(),
  copilotToday: vi.fn(async () => "2030-01-01"),
}));
vi.mock("@/lib/planner/telemetry", () => ({ plannerTelemetry: vi.fn() }));

beforeEach(() => {
  const brief = emptyBrief("EXAM");
  state.view = {
    id: "owned-session-123", version: 1, mode: "EXAM", planId: null,
    brief, readiness: { state: "NEEDS_CORE_INFO", canGenerate: false, missing: ["GOAL_MISSING", "SCOPE_MISSING", "TARGET_DATE_MISSING", "CAPACITY_MISSING"], refinements: [], summary: "Needs essentials" },
    limits: { weeklyLimitMinutes: null, sessionLimitMinutes: null, unavailableWeekdays: [] },
    comparison: emptyComparisonView(), scheduleWeeklyMinutes: null,
  } as unknown as IntakeView;
  state.apply.mockReset().mockImplementation(async () => state.view);
  state.read.mockClear();
});

const interpretation = {
  schemaVersion: 1 as const, intent: "SETUP" as const, confidence: "HIGH" as const,
  summary: "Use eight hours a week.", commands: [{ command: "SET_WEEKLY_HOURS" as const, hours: 8, hard: false }],
  questionCode: null, question: null, questionOptions: null, recommendedMode: null, modeReason: null,
  clarification: { required: false as const }, explanationRefs: [],
};
const designer: DesignerModel = {
  interpret: vi.fn(async () => ({ interpretation, inputChars: 10, outputChars: 10 })),
  phrase: vi.fn(async () => ({ phrasing: "Use eight hours.", inputChars: 5, outputChars: 5 })),
};

describe("Planner delegation keeps the existing review boundary", () => {
  it("returns a signed Designer proposal for even one high-confidence handed-off edit", async () => {
    const outcome = await runDesignerTurn({
      userId: 42, sessionId: "owned-session-123", deps: { model: designer },
      raw: { schemaVersion: 1, expectedVersion: 1, message: "I can study eight hours a week", proposalOnly: true },
    });
    expect(state.read).toHaveBeenCalledWith(42, "owned-session-123");
    expect(state.apply).not.toHaveBeenCalled();
    expect(outcome.result.outcome).toBe("DESIGNER_PROPOSED");
    if (outcome.result.outcome !== "DESIGNER_PROPOSED") throw new Error("Expected review proposal");
    expect(readProposal({ token: outcome.result.proposal.token, sessionId: "owned-session-123", expectedVersion: 1 }).commands).toEqual(interpretation.commands);
  });

  it("preserves normal Designer direct edits outside a handoff", async () => {
    const outcome = await runDesignerTurn({
      userId: 42, sessionId: "owned-session-123", deps: { model: designer },
      raw: { schemaVersion: 1, expectedVersion: 1, message: "I can study eight hours a week" },
    });
    expect(outcome.result.outcome).toBe("DESIGNER_APPLIED");
    expect(state.apply).toHaveBeenCalledOnce();
  });

  it("keeps the same proposal boundary when the existing Copilot owns the turn", async () => {
    const model: CopilotModel = {
      ...designer,
      interpret: async () => ({ interpretation: { ...interpretation, intent: "INTAKE_UPDATE" }, inputChars: 10, outputChars: 10 }),
    };
    const outcome = await runCopilotTurn({
      userId: 42, sessionId: "owned-session-123", deps: { model },
      raw: { schemaVersion: 1, expectedVersion: 1, message: "I can study eight hours a week", proposalOnly: true },
    });
    expect(state.apply).not.toHaveBeenCalled();
    expect(outcome.result.outcome).toBe("PROPOSED");
  });

  it("maps a stated first-message goal to the existing intake action with a concrete preview", () => {
    const mapped = mapCommands({ brief: emptyBrief("EXAM"), today: "2030-01-01", commands: [{ command: "SET_GOAL", title: "Physics final" }] });
    expect(mapped.commands).toEqual([{ kind: "ACTION", action: { action: "setGoal", title: "Physics final" } }]);
    expect(mapped.preview[0].consequence).toBe("Study goal set to Physics final.");
    expect(CopilotTurnRequestSchema.safeParse({ schemaVersion: 1, expectedVersion: 1, message: "Physics final", proposalOnly: "yes" }).success).toBe(false);
  });
});
