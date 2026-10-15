import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import QuickPlan from "@/app/components/planner/quick-plan/QuickPlan";
import { emptyComparisonView } from "@/lib/planner/intake/actions";
import { emptyBrief, type PlanBriefV1, type ScopeNode } from "@/lib/planner/intake/brief";
import { createOrResumeIntake, readMirror, writeMirror } from "@/lib/planner/intake/client";
import * as designerClient from "@/lib/planner/designer/client";
import { preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

/**
 * Quick Plan, against a scripted server.
 *
 * These tests are about the *contract* the surface keeps, not about pixels: that it
 * asks for the essentials and not a questionnaire, that it never decides readiness or
 * assembles engine input itself, that generation goes through the existing endpoint
 * with the input the server built, and that a refresh or a second tab is handled
 * honestly rather than silently.
 */

const state = vi.hoisted(() => ({
  view: null as unknown,
  viewAfterStale: null as unknown,
  actions: [] as unknown[],
  readCalls: 0,
  createCalls: 0,
  mirror: null as unknown,
  failWith: null as string | null,
  generationBody: null as unknown,
  generationCalls: 0,
  commitBody: null as unknown,
  recoveries: [] as { url: string; body: unknown }[],
  mode: "EXAM" as "EXAM" | "ROADMAP" | "MASTERY",
}));

vi.mock("@/lib/planner/intake/client", async () => {
  const { emptyBrief: blank } = await import("@/lib/planner/intake/brief");
  const { PlannerClientError } = await import("@/lib/planner/transport");
  return {
    createOrResumeIntake: vi.fn(async (mode: "EXAM" | "ROADMAP" | "MASTERY") => {
      state.createCalls += 1;
      state.mode = mode;
      return state.view;
    }),
    readIntake: vi.fn(async () => {
      state.readCalls += 1;
      return state.viewAfterStale ?? state.view;
    }),
    sendIntakeAction: vi.fn(async (_id: string, action: unknown) => {
      if (state.failWith) throw new PlannerClientError(state.failWith);
      state.actions.push(action);
      const kind = (action as { action: string }).action;
      if (kind === "requestGeneration")
        return { ...(state.view as object), generation: { requestKey: "intake-session", input: EXAM_INPUT } };
      return state.view;
    }),
    readMirror: vi.fn(() => state.mirror),
    writeMirror: vi.fn(),
    clearMirror: vi.fn(),
    clientKeyFor: vi.fn(() => "test-client-key"),
    intakeErrorCode: vi.fn((error: unknown) =>
      error instanceof PlannerClientError ? error.code : "PLANNER_UNAVAILABLE"
    ),
    emptyBrief: blank,
  };
});

vi.mock("@/lib/planner/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/planner/transport")>();
  return {
    ...actual,
    requestGeneration: vi.fn(async (path: string, body: unknown) => {
      state.generationCalls += 1;
      state.generationBody = { path, body };
    }),
    plannerFetch: vi.fn(async (path: string, init?: RequestInit) => {
      state.recoveries.push({ url: path, body: init?.body ?? null });
      if (path.startsWith("/recover/"))
        return { planId: "plan-1", operation: { state: "SEALED" } };
      if (path === "/plan-1")
        return {
          plan: { id: "plan-1", version: 4, status: "PREPARING" },
          activeRevision: null,
          latestDraft: {
            id: "revision-1",
            digest: "a".repeat(64),
            inputSnapshot: { mode: "EXAM" },
            confirmationReceipt: null,
            outputSnapshot: draft(),
          },
        };
      if (path === "/plan-1/commit") {
        state.commitBody = init?.body ? JSON.parse(String(init.body)) : null;
        return {
          schemaVersion: 1,
          planId: "plan-1",
          revisionId: "revision-1",
          digest: "a".repeat(64),
          version: 5,
          goalId: null,
          items: [{ itemKey: "i1", questId: 11 }],
          committedAt: "2030-01-07T00:00:00.000Z",
        };
      }
      throw new Error(`unexpected path ${path}`);
    }),
  };
});

const EXAM_INPUT = {
  schemaVersion: 1,
  mode: "EXAM",
  title: "Biology mock",
  scope: "Cells\nEnzymes",
  startDate: "2030-01-07",
  endDate: "2030-02-04",
  examDate: "2030-02-04",
  availability: { dailyMinutes: [0, 45, 45, 45, 45, 45, 0], recoveryPercent: 15, blockedDates: [] },
  exam: {
    subjectName: "Biology",
    subjectId: null,
    topics: [
      { label: "Cells", covered: null, confidence: null, difficult: null },
      { label: "Enzymes", covered: null, confidence: null, difficult: null },
    ],
    format: "UNSPECIFIED",
    preferredMinutes: 45,
    mockMinutes: null,
    allowExamDayStudy: false,
    approach: "STANDARD",
  },
};

const draft = () => ({
  schemaVersion: 1,
  mode: "EXAM",
  examDate: "2030-02-04",
  topics: [
    { key: "t1", title: "Cells", parentKey: null },
    { key: "t2", title: "Enzymes", parentKey: null },
  ],
  milestones: [],
  items: [
    {
      key: "i1",
      topicKey: "t1",
      milestoneKey: null,
      dependsOn: [],
      title: "Cells — learn",
      description: "Read and summarise.",
      completionCriteria: "You can explain it without notes.",
      date: "2030-01-08",
      minutes: 45,
      type: "LEARN",
      stage: "LEARN",
      core: true,
    },
  ],
});

const nodes: ScopeNode[] = [
  { nodeId: "u-cells", label: "Cells", kind: "TOPIC", parentId: null, selected: true },
  { nodeId: "u-enzymes", label: "Enzymes", kind: "TOPIC", parentId: null, selected: true },
];

function view(over: Partial<Record<string, unknown>> = {}) {
  const brief: PlanBriefV1 = {
    ...emptyBrief(state.mode),
    goal: { title: "Biology mock" },
    subject: { kind: "FREE_TEXT", subjectId: null, name: "Biology" },
    target: { endDate: "2030-02-04", examDate: "2030-02-04" },
    budget: {
      weeklyMinutes: 300,
      dailyOverrides: null,
      blockedDates: [],
      recoveryPercent: null,
      acceptReducedReserve: false,
      distribution: { dailyMinutes: [0, 50, 50, 50, 50, 50, 0], note: "5h across 5 study days.", computedAt: "2030-01-07T00:00:00.000Z" },
    },
    scope: {
      source: "USER_MANUAL",
      confirmedAt: null,
      provenanceRefs: [],
      provenanceSources: [],
      nodes,
      removedLabels: [],
    },
    readiness: "ADVANCED_REFINEMENT_AVAILABLE",
  };
  return {
    id: "session-1",
    mode: state.mode,
    version: 7,
    expiresAt: "2030-02-01T00:00:00.000Z",
    planId: null,
    brief,
    readiness: {
      state: "ADVANCED_REFINEMENT_AVAILABLE",
      missing: [],
      canGenerate: true,
      refinements: ["PREPAREDNESS"],
      summary: "Enough for a first draft. Optional detail is still available.",
    },
    summary: {
      units: 2,
      leaves: 2,
      strategy: "TOPIC_UNITS",
      segments: 1,
      preparednessStated: 0,
      coverageStated: 0,
      confidenceStated: 0,
      constraints: 0,
      unresolved: 0,
    },
    questions: [],
    restWeekdays: [0],
    scheduleWeeklyMinutes: 250,
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
  state.readCalls = 0;
  state.createCalls = 0;
  state.mirror = null;
  state.viewAfterStale = null;
  state.failWith = null;
  state.generationBody = null;
  state.generationCalls = 0;
  state.commitBody = null;
  state.recoveries = [];
  state.mode = "EXAM";
  vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("a request carried from Sylvie", () => {
  it("uses an isolated draft, sends stated context once and requests review before edits", async () => {
    const handoff = preparePlannerHandoff({
      id: "quick-handoff-once-1", message: "Plan my physics exam preparation",
      history: [{ role: "user", content: "I have four hours a week" }],
    });
    const send = vi.spyOn(designerClient, "sendDesignerMessage").mockResolvedValue({
      outcome: "DESIGNER_QUESTION", intent: "SETUP", summary: "What should the plan cover?",
      question: { code: "SCOPE", question: "What should the plan cover?", options: [] },
      designer: { summary: null, mode: null, guidance: [], unresolved: [], question: null },
      view: state.view,
    } as unknown as designerClient.DesignerTurnPayload);
    render(<React.StrictMode><QuickPlan mode="EXAM" onAdvanced={() => {}} handoff={handoff} /></React.StrictMode>);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(createOrResumeIntake).toHaveBeenCalledWith("EXAM", { clientKey: "sylvie_quick-handoff-once-1" });
    expect(readMirror).not.toHaveBeenCalled();
    expect(writeMirror).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("session-1", expect.objectContaining({
      message: handoff.request, recent: handoff.recent, proposalOnly: true,
    }));
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "What should the plan cover?" })).toBeInTheDocument());
    expect(send).toHaveBeenCalledOnce();
  });

  it("asks the user to choose an existing plan before forwarding a replan request", async () => {
    const handoff = preparePlannerHandoff({ id: "quick-handoff-replan-1", message: "Rebalance my physics exam plan" });
    const onAdvanced = vi.fn();
    const send = vi.spyOn(designerClient, "sendDesignerMessage");
    render(<QuickPlan mode="EXAM" onAdvanced={onAdvanced} handoff={handoff} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open saved plans" }));
    expect(onAdvanced).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText(/Your request: Rebalance my physics exam plan/)).toBeInTheDocument();
  });

  it("offers an explicit retry after a failed transfer without looping automatically", async () => {
    const handoff = preparePlannerHandoff({ id: "quick-handoff-retry-1", message: "Plan my physics exam preparation" });
    const send = vi.spyOn(designerClient, "sendDesignerMessage").mockRejectedValue(new Error("Offline"));
    render(<QuickPlan mode="EXAM" onAdvanced={() => {}} handoff={handoff} />);
    const retry = await screen.findByRole("button", { name: "Retry prepared request" });
    expect(send).toHaveBeenCalledOnce();
    fireEvent.click(retry);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Retry prepared request" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps the assistant open while a transferred request is pending and releases cancelled work on navigation", async () => {
    const handoff = preparePlannerHandoff({ id: "quick-handoff-pending-1", message: "Plan my physics exam preparation" });
    const send = vi.spyOn(designerClient, "sendDesignerMessage").mockImplementation(() => new Promise(() => {}));
    const rendered = render(<QuickPlan mode="EXAM" onAdvanced={() => {}} handoff={handoff} />);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Close Sylf Assistant" })).toBeDisabled());
    const signal = send.mock.calls[0][1].signal;
    expect(signal?.aborted).toBe(false);
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    render(<QuickPlan mode="EXAM" onAdvanced={() => {}} handoff={handoff} />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });
});

const renderQuickPlan = (props: Partial<{ onAdvanced: () => void }> = {}) =>
  render(<QuickPlan mode="EXAM" onAdvanced={props.onAdvanced ?? (() => {})} />);

/**
 * A search that found nothing must not take the scope editor away.
 *
 * Reported by a student, and it was a genuine dead end: pressing Find syllabus before typing
 * anything returns `RESEARCH_NOT_APPLICABLE`, the server stores a candidate carrying that
 * message — and the surface treated *any* candidate as "Sylf found something", replacing the
 * whole scope path (the research buttons, the upload control, the paste box and the topic
 * field) with a review of an empty list. There was nothing to confirm, nothing to select, and
 * no way left to say what you needed to cover.
 *
 * The empty candidate is an explanation, not a result, so it is shown *alongside* the editor.
 */
describe("an empty search result never removes the way to enter scope", () => {
  const emptyCandidate = (over: Record<string, unknown> = {}) => ({
    version: 1,
    origin: "RESEARCH",
    status: "UNAVAILABLE",
    confidence: "LOW",
    briefDigest: "d".repeat(32),
    retrievedAt: "2030-01-07T00:00:00.000Z",
    provider: "none",
    cacheKey: "k".repeat(32),
    nodes: [],
    sources: [],
    openQuestions: [],
    failureCode: "RESEARCH_NOT_APPLICABLE",
    summary: "Tell Sylf what you are preparing for first.",
    ...over,
  });

  it("keeps the topic field, the upload control and the research buttons", async () => {
    state.view = view({
      brief: { ...(view().brief as PlanBriefV1), scopeCandidate: emptyCandidate() },
    });
    render(<QuickPlan mode="EXAM" onAdvanced={() => {}} />);

    // The way in is still there…
    expect(await screen.findByRole("button", { name: /Find syllabus/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload a syllabus/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paste an outline" })).toBeInTheDocument();
    // …and so is the field the student actually types their units into.
    expect(screen.getByLabelText(/What do you need to cover/)).toBeInTheDocument();
    // The honest explanation is shown too, not instead.
    expect(screen.getByText(/Tell Sylf what you are preparing for first/)).toBeInTheDocument();
    // Nothing offers to confirm a scope that does not exist.
    expect(screen.queryByRole("button", { name: /Use these units/ })).not.toBeInTheDocument();
  });

  it("still replaces the editor with a review when there are units to review", async () => {
    state.view = view({
      brief: {
        ...(view().brief as PlanBriefV1),
        scopeCandidate: emptyCandidate({
          status: "OK",
          nodes: [{ nodeId: "r-cells", label: "Cells", kind: "TOPIC", parentId: null, selected: true }],
          summary: "I found 1 unit from 1 official source.",
        }),
      },
    });
    render(<QuickPlan mode="EXAM" onAdvanced={() => {}} />);

    expect(await screen.findByRole("button", { name: /Use these units/ })).toBeInTheDocument();
    // A real result is a decision, so the manual editor steps aside for it.
    expect(screen.queryByLabelText(/What do you need to cover/)).not.toBeInTheDocument();
  });
});

describe("Quick Plan", () => {
  it("asks for the essentials without a seven-day form or a step counter", async () => {
    renderQuickPlan();
    await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 });
    expect(screen.getByLabelText(/^Exam or goal/)).toBeInTheDocument();
    // "Subject" for the plan itself, distinct from the background curriculum's
    // "Subjects" field, which Phase 3 added below it.
    expect(screen.getByLabelText(/^Subject \(optional\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("Exam date")).toBeInTheDocument();
    expect(screen.getByLabelText(/^What do you need to cover/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Weekly study time" })).toBeInTheDocument();
    // The detailed weekday editor exists, but closed: nothing asks for seven numbers.
    expect(screen.getByText("Customize days").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/step \d+ of \d+/i)).toBeNull();
  });

  it("sends what the student typed as a typed action, once, on blur", async () => {
    renderQuickPlan();
    const goal = await screen.findByLabelText(/^Exam or goal/, {}, { timeout: 5000 });
    fireEvent.change(goal, { target: { value: "Biology mock, paper 2" } });
    fireEvent.blur(goal);
    await waitFor(() =>
      expect(state.actions).toEqual([{ action: "setGoal", title: "Biology mock, paper 2" }])
    );
    // Blurring again without changing anything sends nothing.
    fireEvent.blur(goal);
    await waitFor(() => expect(state.actions).toHaveLength(1));
  });

  it("reports readiness from the server, including what is still missing", async () => {
    state.view = view({
      readiness: {
        state: "NEEDS_CORE_INFO",
        missing: ["TARGET_DATE_MISSING"],
        canGenerate: false,
        refinements: [],
        summary: "Sylf needs a few essentials first.",
      },
    });
    renderQuickPlan();
    await screen.findByText("A little more is needed", {}, { timeout: 5000 });
    expect(screen.getByText("The date it has to be done by")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate my plan" })).toBeDisabled();
    // Optional refinement is never shown as a problem.
    expect(screen.getByRole("button", { name: "Fine-tune first" })).toBeEnabled();
  });

  it("generates through the existing pipeline using the input the server built", async () => {
    renderQuickPlan();
    fireEvent.click(await screen.findByRole("button", { name: "Generate my plan" }));
    await waitFor(() => expect(state.generationCalls).toBe(1));
    expect(state.generationBody).toEqual({
      path: "/api/planner/generate",
      body: { schemaVersion: 1, requestKey: "intake-session", input: EXAM_INPUT },
    });
    // The draft is shown before anything is created, with its own items.
    expect(await screen.findByText("Cells — learn", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/1 planned session/)).toBeInTheDocument();
    // Preparedness was never stated, and that is not treated as a deficiency.
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it("confirms the reviewed draft and reports the created sessions", async () => {
    renderQuickPlan();
    fireEvent.click(await screen.findByRole("button", { name: "Generate my plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm this plan" }));
    await waitFor(() => expect(state.commitBody).not.toBeNull());
    expect(state.commitBody).toMatchObject({
      schemaVersion: 1,
      revisionId: "revision-1",
      selectedItemKeys: ["i1"],
      createGoal: false,
    });
    expect(
      await screen.findByText(/Plan created with 1 session/, {}, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it("restores an unfinished brief from the server after a refresh", async () => {
    state.mirror = { id: "session-1", mode: "EXAM", version: 6, readiness: "NEEDS_CORE_INFO", expiresAt: "2030-02-01T00:00:00.000Z" };
    renderQuickPlan();
    await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 });
    expect(state.readCalls).toBe(1);
    expect(state.createCalls).toBe(0);
    // …and the student's own words are back in the fields.
    await waitFor(() =>
      expect((screen.getByLabelText(/^Exam or goal/) as HTMLInputElement).value).toBe("Biology mock")
    );
    expect((screen.getByLabelText("Exam date") as HTMLInputElement).value).toBe("2030-02-04");
  });

  it("creates the session once when there is nothing to restore", async () => {
    renderQuickPlan();
    await screen.findByRole("heading", { name: "What are you preparing for?" }, { timeout: 5000 });
    expect(state.createCalls).toBe(1);
    expect(state.readCalls).toBe(0);
  });

  it("surfaces a second tab instead of overwriting it silently", async () => {
    state.failWith = "INTAKE_STALE";
    // The other tab's version of the brief is what the server now holds.
    state.viewAfterStale = view({ brief: { ...view().brief, goal: { title: "Changed in tab two" } } });
    renderQuickPlan();
    const goal = await screen.findByLabelText(/^Exam or goal/, {}, { timeout: 5000 });
    fireEvent.change(goal, { target: { value: "Changed elsewhere" } });
    fireEvent.blur(goal);
    expect(
      await screen.findByText(/changed in another tab/, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    // Nothing was applied silently: the action never reached the server.
    expect(state.actions).toEqual([]);
    // The brief shows the server's truth, and the student's change is offered back.
    const panel = screen.getByText("Your plan brief").closest("details")!;
    expect(within(panel).getByText("Changed in tab two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply my last change again" })).toBeInTheDocument();
  });

  it("keeps Advanced setup one click away, and never required", async () => {
    const onAdvanced = vi.fn();
    renderQuickPlan({ onAdvanced });
    fireEvent.click(await screen.findByRole("button", { name: "Fine-tune first" }));
    expect(onAdvanced).toHaveBeenCalledTimes(1);
  });

  it("shows an advisory warning with its consequence and does not block generation", async () => {
    state.view = view({
      warnings: [
        {
          code: "FEASIBILITY_OVERLOADED_AVAILABILITY",
          severity: "WARNING",
          scope: { kind: "PLAN" },
          consequence: "The time you asked for does not fit this horizon.",
          acknowledgementCode: "ACK:FEASIBILITY_OVERLOADED_AVAILABILITY",
        },
      ],
    });
    renderQuickPlan();
    expect(
      await screen.findByText(/1 thing worth knowing/, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/does not fit this horizon/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate my plan" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /does not fit this horizon/ }));
    expect(screen.getByText(/Understood\./)).toBeInTheDocument();
  });

  it("renders a 40-unit brief without losing the surface", async () => {
    // The largest realistic manual scope: the editor is one textarea and the panel is
    // counts, so this must stay a bounded render rather than 40 cards.
    const many: ScopeNode[] = Array.from({ length: 40 }, (_, index) => ({
      nodeId: `u-${index + 1}`,
      label: `Unit ${index + 1}`,
      kind: "TOPIC" as const,
      parentId: null,
      selected: true,
    }));
    const base = view();
    state.view = view({
      brief: {
        ...base.brief,
        scope: { ...base.brief.scope, nodes: many, removedLabels: [] },
        distribution: {
          dailyMinutes: [0, 60, 60, 60, 60, 60, 0],
          note: "5h across 5 study days.",
          computedAt: "2030-01-07T00:00:00.000Z",
        },
      },
      summary: { ...base.summary, units: 40, leaves: 40, segments: 1 },
    });
    const started = performance.now();
    renderQuickPlan();
    const scope = await screen.findByLabelText(/^What do you need to cover/, {}, { timeout: 5000 });
    const elapsed = performance.now() - started;
    console.log("quick plan render with 40 units", { ms: Number(elapsed.toFixed(1)) });
    expect((scope as HTMLTextAreaElement).value.split("\n")).toHaveLength(40);
    expect(screen.getByText(/40 units will be planned/)).toBeInTheDocument();
    expect(elapsed).toBeLessThan(5000);
  });

  it("shows the server's weekly spread rather than estimating one", async () => {
    renderQuickPlan();
    const preview = await screen.findByLabelText("How the weekly time is spread", {}, { timeout: 5000 });
    expect(preview.textContent).toContain("Monday");
    expect(preview.textContent).toContain("50m");
    expect(screen.getByText("5h across 5 study days.")).toBeInTheDocument();
  });
});
