import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlannerTab from "@/app/system/components/PlannerTab";
import { emptyComparisonView } from "@/lib/planner/intake/actions";
import { emptyBrief } from "@/lib/planner/intake/brief";

/**
 * The acceptance test for permanent coexistence.
 *
 * In one application session, with no environment change, no reload, no server restart
 * and no flag mutation, a student must be able to use the Classic Planner *and* enter
 * Exam, Roadmap or Mastery, and come back. This renders the real Planner tab, the real
 * workspace and the real Quick Plan surface; only the Classic panel and the account
 * facts are stubbed, because both are self-contained elsewhere.
 */

vi.mock("@/app/components/planner/useExamCapabilities", () => ({
  useExamCapabilities: () => ({
    today: "2030-01-07",
    timezone: "UTC",
    restDays: [0],
    subjects: [{ id: 1, name: "Physics" }],
  }),
}));

// The Classic Planner is a separate system; this patch must not need it to work.
vi.mock("@/app/components/AiPlannerPanel", () => ({
  default: () => <div>Legacy planner panel</div>,
}));

// The intake service is a server conversation. The Quick Plan surfaces are what this
// test is about, so the client answers with a plausible empty brief per mode.
vi.mock("@/lib/planner/intake/client", async () => {
  const { emptyBrief: blank } = await import("@/lib/planner/intake/brief");
  const viewFor = (mode: "EXAM" | "ROADMAP" | "MASTERY") => {
    const brief = blank(mode);
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
      restWeekdays: [0],
      scheduleWeeklyMinutes: null,
      limits: { sessionLimitMinutes: null, weeklyLimitMinutes: null, unavailableWeekdays: [] },
      comparison: emptyComparisonView(),
      ok: true,
      findings: [],
      warnings: [],
      blockers: [],
      accepted: [],
    };
  };
  return {
    createOrResumeIntake: vi.fn(async (mode: "EXAM" | "ROADMAP" | "MASTERY") => viewFor(mode)),
    readIntake: vi.fn(async () => viewFor("EXAM")),
    sendIntakeAction: vi.fn(async () => viewFor("EXAM")),
    readMirror: vi.fn(() => null),
    writeMirror: vi.fn(),
    clearMirror: vi.fn(),
    clientKeyFor: vi.fn(() => "coexistence-client-key"),
    intakeErrorCode: vi.fn(() => "PLANNER_UNAVAILABLE"),
    emptyBrief: blank,
  };
});

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

const tab = () =>
  render(
    <PlannerTab
      plannerQuota={null}
      sessionId={null}
      onQuotaRefresh={vi.fn()}
      onComplete={vi.fn()}
      onViewConversation={vi.fn()}
    />
  );

const MODE_HEADINGS = {
  EXAM: "What are you preparing for?",
  ROADMAP: "What are you planning?",
  MASTERY: "What do you want to master?",
} as const;

describe("Classic Planner and Planner Modes coexist", () => {
  it("uses both surfaces in one session with no configuration change", async () => {
    // Nothing in this test may depend on configuration: the flag is gone, and the
    // session starts without it.
    expect(process.env.PLANNER_MODES_ENABLED).toBeUndefined();
    const envBefore = { ...process.env };

    tab();
    // 1. The Classic Planner is what opens.
    expect(screen.getByText("Legacy planner panel")).toBeInTheDocument();

    // 2. Exam, reached deliberately.
    fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exam Planner/ }));
    expect(await screen.findByRole("heading", { name: MODE_HEADINGS.EXAM }, { timeout: 5000 })).toBeInTheDocument();
    // Quick Plan is still the default creation flow inside a mode.
    expect(screen.getByRole("button", { name: "Generate my plan" })).toBeInTheDocument();
    expect(screen.queryByText("Legacy planner panel")).toBeNull();

    // 3. Back to Classic, without a reload or a browser back button.
    fireEvent.click(screen.getByRole("button", { name: /Classic Planner/ }));
    expect(screen.getByText("Legacy planner panel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: MODE_HEADINGS.EXAM })).toBeNull();

    // 4. And again, in the same session, for the other two modes.
    for (const [label, heading] of [
      [/Course \/ Syllabus Roadmap/, MODE_HEADINGS.ROADMAP],
      [/Chapter \/ Unit Mastery/, MODE_HEADINGS.MASTERY],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(await screen.findByRole("heading", { name: heading }, { timeout: 5000 })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Classic Planner/ }));
      expect(screen.getByText("Legacy planner panel")).toBeInTheDocument();
    }

    // The environment is exactly as it started: coexistence needs no switch.
    expect(process.env).toEqual(envBefore);
  });

  it("keeps every Planner Modes capability the phase before this one established", async () => {
    tab();
    fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exam Planner/ }));
    await screen.findByRole("heading", { name: MODE_HEADINGS.EXAM }, { timeout: 5000 });

    // Weekly hours remain the default capacity input, not seven daily fields.
    expect(screen.getByRole("group", { name: "Weekly study time" })).toBeInTheDocument();
    expect(screen.getByText("Customize days").closest("details")).not.toHaveAttribute("open");
    // Advanced setup is still one deliberate step away.
    expect(screen.getByRole("button", { name: "Fine-tune first" })).toBeInTheDocument();
    // The Plan Brief is present, and unstated preparedness is still reported as unstated.
    expect(screen.getByText("Your plan brief")).toBeInTheDocument();
    expect(screen.getByText(/Sylf will plan as work that may need learning/)).toBeInTheDocument();
  });

  it("reports each surface it opens, and the return to Classic", async () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    const events = () =>
      logged.mock.calls
        .map((call) => call[1] as { event?: string; surface?: string; mode?: string })
        .filter((entry) => typeof entry?.event === "string");
    try {
      tab();
      // Opening the Planner reports the surface it opened on, once.
      expect(events().filter((e) => e.event === "planner_surface_opened")).toEqual([
        expect.objectContaining({ event: "planner_surface_opened", surface: "CLASSIC" }),
      ]);

      fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
      fireEvent.click(screen.getByRole("button", { name: /Exam Planner/ }));
      await screen.findByRole("heading", { name: MODE_HEADINGS.EXAM }, { timeout: 5000 });
      // The choice is reported as a mode, and the surface as Planner Modes.
      expect(events()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: "planner_mode_selected", mode: "EXAM" }),
          expect.objectContaining({ event: "planner_surface_opened", surface: "MODES" }),
        ])
      );

      fireEvent.click(screen.getByRole("button", { name: /Classic Planner/ }));
      expect(events()).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "planner_returned_to_classic" })])
      );
      // Every field is bounded and content-free: the only strings are closed enums,
      // so nothing here can carry a title, a subject, a route or a label.
      const allowed = new Set(["event", "surface", "mode", "schemaVersion"]);
      const closedValues = new Set(["CLASSIC", "MODES", "EXAM", "ROADMAP", "MASTERY"]);
      for (const entry of events()) {
        const record = entry as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(record)) {
          expect(allowed.has(key), key).toBe(true);
          if (typeof value === "string" && key !== "event") expect(closedValues.has(value), value).toBe(true);
        }
      }
      // And no academic content, by construction: the subject name in the fixtures
      // never reaches telemetry.
      expect(JSON.stringify(events())).not.toMatch(/Physics/);
    } finally {
      logged.mockRestore();
    }
  });

  it("returns to Classic from Advanced setup as well as from Quick Plan", async () => {
    tab();
    fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mastery/ }));
    await screen.findByRole("heading", { name: MODE_HEADINGS.MASTERY }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "Fine-tune first" }));
    // Inside the detailed wizard the way back to Classic is still visible.
    expect(screen.getByText(/Advanced setup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Classic Planner/ }));
    await waitFor(() => expect(screen.getByText("Legacy planner panel")).toBeInTheDocument());
  });
});
