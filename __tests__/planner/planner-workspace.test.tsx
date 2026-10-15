import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlannerWorkspace from "@/app/components/planner/PlannerWorkspace";
import { emptyComparisonView } from "@/lib/planner/intake/actions";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

/**
 * The workspace owns two things the rest of the planner relies on: the outcome-based
 * mode choice, and which surface a mode opens on. Quick Plan is the default now, so
 * these tests pin that — and pin that the detailed wizard is still reachable, since
 * "default" must never come to mean "only".
 */

vi.mock("@/app/components/planner/ExamPlanner", () => ({
  default: () => <div>Exam review flow</div>,
}));
vi.mock("@/app/components/planner/RoadmapPlanner", () => ({
  default: () => <div>Roadmap review flow</div>,
}));
vi.mock("@/app/components/planner/MasteryPlanner", () => ({
  default: () => <div>Mastery review flow</div>,
}));

// The intake session is a server conversation; these tests are about which surface
// renders, so the client module answers with a plausible empty brief per mode.
vi.mock("@/lib/planner/intake/client", async () => {
  const { emptyBrief: blank } = await import("@/lib/planner/intake/brief");
  return {
    createOrResumeIntake: vi.fn(async (mode: "EXAM" | "ROADMAP" | "MASTERY") =>
      viewFor(mode)
    ),
    readIntake: vi.fn(async (id: string) => viewFor(modeFromId(id))),
    sendIntakeAction: vi.fn(async (id: string) => viewFor(modeFromId(id))),
    readMirror: vi.fn(() => null),
    writeMirror: vi.fn(),
    clearMirror: vi.fn(),
    clientKeyFor: vi.fn(() => "test-client-key"),
    intakeErrorCode: vi.fn(() => "PLANNER_UNAVAILABLE"),
    emptyBrief: blank,
  };
});

const modeFromId = (id: string): "EXAM" | "ROADMAP" | "MASTERY" =>
  id.startsWith("ROADMAP") ? "ROADMAP" : id.startsWith("MASTERY") ? "MASTERY" : "EXAM";

function viewFor(mode: "EXAM" | "ROADMAP" | "MASTERY") {
  const brief = emptyBrief(mode);
  return {
    id: `${mode}-session`,
    mode,
    version: 1,
    expiresAt: "2030-02-01T00:00:00.000Z",
    planId: null,
    brief,
    readiness: {
      state: "NEEDS_CORE_INFO" as const,
      missing: ["GOAL_MISSING" as const],
      canGenerate: false,
      refinements: [],
      summary: "Sylf needs a few essentials first.",
    },
    summary: {
      units: 0,
      leaves: 0,
      strategy: "TOPIC_UNITS" as const,
      segments: 0,
      preparednessStated: 0,
      coverageStated: 0,
      confidenceStated: 0,
      constraints: 0,
      unresolved: 0,
    },
    questions: [],
    restWeekdays: [],
    scheduleWeeklyMinutes: null,
    limits: { sessionLimitMinutes: null, weeklyLimitMinutes: null, unavailableWeekdays: [] },
    comparison: emptyComparisonView(),
    // The finding envelope the server always sends: empty lists mean "nothing to
    // report", and a test double that omitted it would be lying about the contract.
    ok: true,
    findings: [],
    warnings: [],
    blockers: [],
    accepted: [],
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: { code: "PLANNER_UNAVAILABLE" } }), { status: 500 }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const capabilities = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [],
  subjects: [],
};

describe("Planner Modes workspace", () => {
  it("keeps the prepared replan request visible when opening the existing saved-plan controls", async () => {
    const handoff = preparePlannerHandoff({ id: "workspace-replan-1", message: "Rebalance my physics exam plan" });
    render(<PlannerWorkspace capabilities={capabilities} initialMode="EXAM" handoff={handoff} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open saved plans" }));
    expect(screen.getByText("Exam review flow")).toBeInTheDocument();
    expect(screen.getByText(handoff.request)).toBeInTheDocument();
    expect(screen.getByText(/This setup cannot read the prepared request automatically/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy prepared request" })).toBeInTheDocument();
  });

  it("offers an outcome-based mode choice before any planner", () => {
    render(<PlannerWorkspace capabilities={capabilities} />);
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare for an Exam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan a Course" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Master a Unit" })).toBeInTheDocument();
    expect(screen.queryByText("Exam review flow")).toBeNull();
    expect(screen.queryByText("Roadmap review flow")).toBeNull();
    expect(screen.queryByText("Mastery review flow")).toBeNull();
    expect(screen.queryByText(/coming later/i)).toBeNull();
  });

  it("opens Quick Plan, not the wizard, for the chosen mode", async () => {
    render(<PlannerWorkspace capabilities={capabilities} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare for an Exam" }));
    expect(
      await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 })
    ).toBeInTheDocument();
    // The six-step wizard is not the default entry any more...
    expect(screen.queryByText("Exam review flow")).toBeNull();
    // ...and no other mode's surface leaks in.
    expect(screen.queryByText("Roadmap review flow")).toBeNull();
    expect(screen.queryByText("Mastery review flow")).toBeNull();
    // There is no step counter to complete: the surface is one brief.
    expect(screen.queryByText(/step \d+ of \d+/i)).toBeNull();
  });

  it("keeps the detailed wizard reachable as Advanced setup", async () => {
    render(<PlannerWorkspace capabilities={capabilities} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare for an Exam" }));
    await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "Fine-tune first" }));
    expect(screen.getByText("Exam review flow")).toBeInTheDocument();
    // …and the student can come back to the brief they were writing.
    fireEvent.click(screen.getByRole("button", { name: "Back to Quick Plan" }));
    expect(
      await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.queryByText("Exam review flow")).toBeNull();
  });

  it("routes each mode to its own surface only", async () => {
    const view = render(<PlannerWorkspace capabilities={capabilities} />);
    fireEvent.click(screen.getByRole("button", { name: "Plan a Course" }));
    expect(
      await screen.findByRole("heading", { name: "What are you planning?" }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.queryByText("Exam review flow")).toBeNull();
    view.unmount();

    render(<PlannerWorkspace capabilities={capabilities} />);
    fireEvent.click(screen.getByRole("button", { name: "Master a Unit" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "What do you want to master?" })
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("Mastery review flow")).toBeNull();
  });
});
