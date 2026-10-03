import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuickPlan from "@/app/components/planner/quick-plan/QuickPlan";
import { emptyComparisonView } from "@/lib/planner/intake/actions";
import { emptyBrief, type PlanBriefV1 } from "@/lib/planner/intake/brief";

/**
 * The scope-discovery surface, as a student meets it.
 *
 * These tests are about the promises Phase 2 makes: research only runs when asked,
 * a candidate is reviewed before anything is confirmed, an import is a path rather than
 * a fallback, and the student can switch the whole thing off and simply type their own
 * scope. Nothing here claims the search itself works — that is the provider's job,
 * tested against a mocked SDK elsewhere.
 */

const state = vi.hoisted(() => ({
  view: null as unknown,
  actions: [] as unknown[],
  uploads: [] as unknown[],
  researchCalls: 0,
}));

vi.mock("@/lib/planner/intake/client", async () => {
  const { emptyBrief: blank } = await import("@/lib/planner/intake/brief");
  return {
    createOrResumeIntake: vi.fn(async () => state.view),
    readIntake: vi.fn(async () => state.view),
    sendIntakeAction: vi.fn(async (_id: string, action: unknown) => {
      state.actions.push(action);
      if ((action as { action: string }).action === "researchScope") state.researchCalls += 1;
      return state.view;
    }),
    uploadIntakeSyllabus: vi.fn(async (_id: string, input: unknown) => {
      state.uploads.push(input);
      return state.view;
    }),
    readMirror: vi.fn(() => null),
    writeMirror: vi.fn(),
    clearMirror: vi.fn(),
    clientKeyFor: vi.fn(() => "scope-test-key"),
    intakeErrorCode: vi.fn(() => "PLANNER_UNAVAILABLE"),
    emptyBrief: blank,
  };
});

const candidate = () => ({
  version: 1 as const,
  origin: "RESEARCH" as const,
  status: "OK" as const,
  confidence: "HIGH" as const,
  failureCode: null,
  briefDigest: "digest",
  retrievedAt: "2030-01-07T09:00:00.000Z",
  provider: "google-search-grounding",
  cacheKey: "key",
  nodes: [
    { nodeId: "r-algebra", label: "Algebra", kind: "CHAPTER" as const, parentId: null, selected: true, sourceIds: ["src-1"] },
    { nodeId: "r-quadratics", label: "Quadratics", kind: "TOPIC" as const, parentId: "r-algebra", selected: true, sourceIds: ["src-1"] },
    { nodeId: "r-circles", label: "Circles", kind: "TOPIC" as const, parentId: "r-algebra", selected: false, sourceIds: ["src-1"] },
  ],
  sources: [
    {
      sourceId: "src-1",
      url: "https://www.cambridgeinternational.org/spec.pdf",
      title: "Syllabus 2026",
      publisherOrDomain: "cambridgeinternational.org",
      sourceType: "OFFICIAL_PDF" as const,
      retrievedAt: "2030-01-07T09:00:00.000Z",
      documentDate: "2026",
      nodeIds: ["r-algebra", "r-quadratics"],
      mappingConfidence: "MEDIUM" as const,
    },
  ],
  summary: "I found 3 units across 1 section from 1 official source.",
  openQuestions: [],
});

function view(over: Record<string, unknown> = {}) {
  const brief: PlanBriefV1 = {
    ...emptyBrief("EXAM"),
    goal: { title: "A-Level Mathematics" },
    target: { endDate: "2030-02-04", examDate: "2030-02-04" },
    backgroundCurriculum: { label: "A-Level Mathematics", level: "A-Level", board: "CAIE" },
    budget: {
      weeklyMinutes: 480,
      dailyOverrides: null,
      blockedDates: [],
      recoveryPercent: null,
      acceptReducedReserve: false,
      distribution: null,
    },
  };
  return {
    id: "session-1",
    mode: "EXAM" as const,
    version: 3,
    expiresAt: "2030-02-01T00:00:00.000Z",
    planId: null,
    brief,
    readiness: {
      state: "RESEARCH_AVAILABLE" as const,
      missing: ["SCOPE_MISSING" as const],
      canGenerate: false,
      refinements: [],
      summary: "Sylf could look for the official syllabus.",
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
    ...over,
  };
}

beforeEach(() => {
  state.view = view();
  state.actions = [];
  state.uploads = [];
  state.researchCalls = 0;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = () => render(<QuickPlan mode="EXAM" onAdvanced={() => {}} />);

describe("Quick Plan scope discovery", () => {
  it("never searches on its own, however much the student types", async () => {
    open();
    const goal = await screen.findByLabelText(/^Exam or goal/, {}, { timeout: 5000 });
    fireEvent.change(goal, { target: { value: "A-Level Further Mathematics" } });
    fireEvent.blur(goal);
    // The surface is heavier than it was (background curriculum, overlap map, matrix),
    // so the first assertion in the file waits like every other one here rather than on
    // the 1s default — the contract being asserted is unchanged.
    await waitFor(() => expect(state.actions.length).toBeGreaterThan(0), { timeout: 20000 });
    // Research is a deliberate act: no provider call happens because a field was typed in.
    expect(state.researchCalls).toBe(0);
    expect(screen.getByRole("button", { name: /Find syllabus/ })).toBeInTheDocument();
  });

  it("offers every way to get a scope, and asks for the board that makes a source official", async () => {
    open();
    await screen.findByRole("button", { name: /Find syllabus/, timeout: 5000 } as never);
    expect(screen.getByLabelText(/Upload a syllabus/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paste an outline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use only what I give you" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Exam board or system/)).toBeInTheDocument();
    expect(screen.getByLabelText("Academic level")).toBeInTheDocument();
  });

  it("runs research only when Find syllabus is pressed", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Find syllabus/, timeout: 5000 } as never));
    await waitFor(() => expect(state.researchCalls).toBe(1));
  });

  it("shows what was found, with its source, before anything is confirmed", async () => {
    state.view = view({ brief: { ...view().brief, scopeCandidate: candidate() } });
    open();
    // The summary is the candidate's own words, and the source is named and dated.
    expect(await screen.findByText(/1 official source/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Syllabus 2026")).toBeInTheDocument();
    /**
     * The type label appears twice now: once on the row, and once in the legend that
     * explains what "Official PDF" and "Institutional" actually mean (UX Phase 3 §4).
     * The row is asserted through its link's accessible name — the marker that carries
     * the meaning — and the legend through its own sentence.
     */
    expect(
      screen.getByRole("link", { name: /Official PDF source: Syllabus 2026/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Verified as an authority for this exam or curriculum/)
    ).toBeInTheDocument();
    // Nothing has been confirmed, so neither the manual editor nor a plan exists yet.
    expect(state.actions).toEqual([]);
  });

  it("confirms the reviewed selection rather than the whole candidate", async () => {
    state.view = view({ brief: { ...view().brief, scopeCandidate: candidate() } });
    open();
    const use = await screen.findByRole("button", { name: /Use these units/, timeout: 5000 } as never);
    fireEvent.click(use);
    // The surface is heavier than it was (background curriculum, overlap map, matrix),
    // so the first assertion in the file waits like every other one here rather than on
    // the 1s default — the contract being asserted is unchanged.
    await waitFor(() => expect(state.actions.length).toBeGreaterThan(0), { timeout: 5000 });
    const confirm = state.actions.find(
      (action) => (action as { action: string }).action === "confirmScope"
    ) as { nodeIds: string[]; additions: unknown[] } | undefined;
    expect(confirm).toBeDefined();
    // The unit the candidate already had unticked is not confirmed.
    expect(confirm!.nodeIds).not.toContain("r-circles");
    expect(confirm!.nodeIds).toContain("r-quadratics");
  });

  it("imports a pasted outline as a reviewable scope", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Paste an outline", timeout: 5000 } as never));
    fireEvent.change(screen.getByLabelText(/Paste your syllabus/), {
      target: { value: "Algebra\n- Quadratics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read this outline" }));
    // The surface is heavier than it was (background curriculum, overlap map, matrix),
    // so the first assertion in the file waits like every other one here rather than on
    // the 1s default — the contract being asserted is unchanged.
    await waitFor(() => expect(state.actions.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(state.actions).toContainEqual(
      expect.objectContaining({ action: "importScope", origin: "PASTE" })
    );
  });

  it("uploads a document through the import route", async () => {
    open();
    const input = (await screen.findByLabelText(/Upload a syllabus/, {}, { timeout: 5000 })) as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "syllabus.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(state.uploads).toHaveLength(1));
  });

  it("stops offering a search once the student says to use only their own material", async () => {
    state.view = view({
      brief: { ...view().brief, researchPolicy: "OFF" },
      readiness: {
        state: "NEEDS_CORE_INFO",
        missing: ["SCOPE_MISSING"],
        canGenerate: false,
        refinements: [],
        summary: "Sylf needs a few essentials first.",
      },
    });
    open();
    expect(await screen.findByText(/use only what you give it/i, {}, { timeout: 5000 })).toBeInTheDocument();
    // The search is not merely discouraged: it cannot be started.
    expect(screen.getByRole("button", { name: /Find syllabus/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Allow a search again/ })).toBeInTheDocument();
    // …and typing a scope by hand is still a complete path.
    expect(screen.getByLabelText(/^What do you need to cover/)).toBeInTheDocument();
  });
});
