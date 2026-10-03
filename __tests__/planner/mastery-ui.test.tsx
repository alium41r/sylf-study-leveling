import React from "react";
import { emptyComparisonView } from "@/lib/planner/intake/actions";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import MasteryPlanner from "@/app/components/planner/MasteryPlanner";
import PlannerWorkspace from "@/app/components/planner/PlannerWorkspace";
import { normalizeProposal } from "@/lib/planner/server/core";
import { excludedMasteryTopics } from "@/lib/planner/mastery-policy";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";

const capabilities = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Physics" }],
};
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  mastery: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/lib/planner/transport", async (original) => ({
  ...(await original<typeof import("@/lib/planner/transport")>()),
  plannerFetch: api.fetch,
}));
vi.mock("@/lib/planner/mastery-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/mastery-client")>()),
  requestMastery: api.mastery,
}));
vi.mock("@/lib/planner/client", () => ({
  commitPlanner: api.commit,
  recoverPlannerCommit: vi.fn().mockResolvedValue(null),
}));
// The mode chooser now opens Quick Plan, which talks to the intake service. This
// suite is about the mastery wizard, so the intake answers with an empty mastery
// brief; `serve()` below keeps serving the generation endpoints it always did.
vi.mock("@/lib/planner/intake/client", async () => {
  const { emptyBrief } = await import("@/lib/planner/intake/brief");
  const view = {
    id: "mastery-session",
    mode: "MASTERY" as const,
    version: 1,
    expiresAt: "2030-02-01T00:00:00.000Z",
    planId: null,
    brief: emptyBrief("MASTERY"),
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
  return {
    createOrResumeIntake: vi.fn(async () => view),
    readIntake: vi.fn(async () => view),
    sendIntakeAction: vi.fn(async () => view),
    readMirror: vi.fn(() => null),
    writeMirror: vi.fn(),
    clearMirror: vi.fn(),
    clientKeyFor: vi.fn(() => "mastery-client-key"),
    intakeErrorCode: vi.fn(() => "PLANNER_UNAVAILABLE"),
  };
});

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const input = masteryFixture();
const draft = normalizeProposal(input, masteryProposal(input));
const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const labels = input.mastery.topics.map((topic) => topic.label);

function detailWith(output: unknown, links: unknown[] = [], execution: unknown[] = []) {
  return {
    plan: { id: planId, title: input.title, version: 2, state: "DRAFT" as const },
    latestDraft: {
      id: revisionId,
      digest: "b".repeat(64),
      inputSnapshot: input,
      outputSnapshot: output,
      confirmationReceipt: null,
    },
    activeRevision: null,
    links,
    execution,
  };
}

const savedPlan = {
  id: planId,
  title: input.title,
  mode: "MASTERY",
  state: "DRAFT",
  latestDraftRevisionId: revisionId,
  activeRevisionId: null,
};

/** Path-aware transport double: list, recovery and owned plan detail. */
function serve(detail: unknown, summary: Record<string, unknown> = savedPlan) {
  api.fetch.mockImplementation(async (path: string) => {
    if (path === "") return [summary];
    if (path.startsWith("/recover/")) return { planId, operation: { state: "SEALED" } };
    return detail;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  serve([]);
});
afterEach(cleanup);

/** Walk the wizard to the point where a plan can be generated. */
async function reachReview(answerQuestions = true) {
  render(<MasteryPlanner capabilities={capabilities} />);
  click("Start a mastery plan");
  fireEvent.change(screen.getByLabelText("Chapter, unit or concept"), {
    target: { value: input.mastery.unitTitle },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Units in this chapter, one per line"), {
    target: { value: labels.join("\n") },
  });
  // Coverage stays as the student's own statement; a chapter whose units are all
  // "not covered yet" is a valid starting point, so nothing else is set here.
  click("Continue");
  fireEvent.change(screen.getByLabelText("Target date (optional)"), {
    target: { value: input.endDate },
  });
  click("Continue");
  fireEvent.click(
    screen.getByLabelText("This is my real weekly availability")
  );
  click("Continue");
  if (answerQuestions)
    for (const radio of screen.queryAllByRole("radio")) {
      // First option of each question: a real answer, not a skip.
      fireEvent.click(radio);
      break;
    }
  click("Continue");
}

describe("Chapter / Unit Mastery UI", () => {
  it("is reachable from the mode chooser as its own mode", async () => {
    render(<PlannerWorkspace capabilities={capabilities} />);
    expect(
      screen.getByRole("button", { name: "Master a Unit" })
    ).toBeInTheDocument();
    // The mode is no longer described as a later phase.
    expect(screen.queryByText(/coming later/i)).toBeNull();
    click("Master a Unit");
    // Quick Plan is the default surface for a mode now; the detailed mastery wizard
    // is one deliberate step away rather than the entry itself.
    expect(
      await screen.findByRole("heading", { name: "What do you want to master?" }, { timeout: 5000 })
    ).toBeInTheDocument();
    click("Fine-tune first");
    expect(
      screen.getByRole("heading", { name: "Your mastery plans" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Saved mastery plans" })
    ).toBeInTheDocument();
  });

  it("walks the progressive wizard and generates a mastery draft", async () => {
    await reachReview();
    expect(
      screen.getByRole("heading", { name: "Review your mastery plan" })
    ).toBeInTheDocument();
    // Progressive disclosure: later fields are not rendered before their step.
    expect(screen.queryByLabelText("Target date (optional)")).toBeNull();
    api.mastery.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serve(detailWith(draft));
    click("Generate my mastery plan");
    await waitFor(() => expect(api.mastery).toHaveBeenCalledTimes(1));
    await screen.findByText("Planned work by stage");
    // Stage-oriented review: the progression is what the user checks, not a wall
    // of daily tasks.
    expect(screen.getAllByText("Understand").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Mastery check" })).toBeInTheDocument();
    expect(
      screen.getByText(/not a mastery judgement/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm this mastery plan" })
    ).toBeEnabled();
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("generates from the mastery endpoint with the mode's own input", async () => {
    await reachReview();
    api.mastery.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serve(detailWith(draft));
    click("Generate my mastery plan");
    await waitFor(() => expect(api.mastery).toHaveBeenCalledTimes(1));
    const [sent] = api.mastery.mock.calls[0] as [Record<string, unknown>];
    expect(sent).toMatchObject({
      mode: "MASTERY",
      focus: input.mastery.unitTitle,
      mastery: {
        unitTitle: input.mastery.unitTitle,
        desiredDepth: input.mastery.desiredDepth,
        checkPreference: input.mastery.checkPreference,
        targetDate: input.endDate,
      },
    });
  });

  it("confirms the whole plan and reports the created Quests", async () => {
    serve(detailWith(draft));
    api.commit.mockResolvedValue({
      schemaVersion: 1,
      planId,
      revisionId,
      digest: "b".repeat(64),
      version: 3,
      goalId: null,
      items: draft.items.map((item) => ({ itemKey: item.key, questId: 1 })),
      committedAt: "2030-01-07T00:00:00.000Z",
    });
    render(<MasteryPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · draft waiting for review` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · draft waiting for review`);
    await screen.findByText("Planned work by stage");
    click("Confirm this mastery plan");
    await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(1));
    // Every active item is confirmed: a subset would drop a required stage.
    const [, body] = api.commit.mock.calls[0] as [string, { selectedItemKeys: string[] }];
    expect(body.selectedItemKeys).toEqual(
      draft.items.filter((item) => !item.removed).map((item) => item.key)
    );
    expect(
      await screen.findByText(/Quests? created\./i)
    ).toBeInTheDocument();
  });

  it("requires an explicit acknowledgement when a unit is left out", async () => {
    if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    const unitKey = draft.topics[1].key;
    const excluded = {
      ...draft,
      items: draft.items.map((item) =>
        item.topicKey === unitKey ? { ...item, removed: true } : item
      ),
    };
    expect(excludedMasteryTopics(excluded)).toHaveLength(1);
    serve(detailWith(excluded));
    render(<MasteryPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · draft waiting for review` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · draft waiting for review`);
    await screen.findByText("Planned work by stage");
    const acknowledgement = await screen.findByRole("checkbox", {
      name: /leaving out 1 unit on purpose/i,
    });
    expect(acknowledgement).not.toBeChecked();
    fireEvent.click(acknowledgement);
    api.commit.mockResolvedValue({
      schemaVersion: 1,
      planId,
      revisionId,
      digest: "b".repeat(64),
      version: 3,
      goalId: null,
      items: [],
      committedAt: "2030-01-07T00:00:00.000Z",
    });
    click("Confirm this mastery plan");
    await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(1));
    expect(
      (api.commit.mock.calls[0][1] as { acknowledgeExclusions: boolean })
        .acknowledgeExclusions
    ).toBe(true);
  });

  it("keeps the schedule, criteria and stage visible but not editable until asked", async () => {
    serve(detailWith(draft));
    render(<MasteryPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · draft waiting for review` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · draft waiting for review`);
    await screen.findByText("Planned work by stage");
    // Stage groups are named in the user's vocabulary, and the mastery check is
    // shown as a bounded, dated item with its own state.
    expect(screen.getAllByText("MASTERY CHECK").length).toBeGreaterThan(0);
    expect(screen.getByText(/Scheduled|Scheduled for today/)).toBeInTheDocument();
    expect(screen.getByText(/covers \d+ units?/)).toBeInTheDocument();
    click("Edit this draft");
    const title = screen.getAllByLabelText("Quest title")[0] as HTMLInputElement;
    expect(title.disabled).toBe(false);
    fireEvent.change(title, { target: { value: "Reworded stage work" } });
    expect(
      screen.getByRole("button", { name: "Save edits" })
    ).toBeEnabled();
  });

  it("shows the conservative progress of a confirmed plan without claiming mastery", async () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    // The workflow event is reported once per plan+revision for the life of the module,
    // so this test claims its own revision identity: otherwise an earlier test in this
    // file that reached the same confirmed revision would legitimately suppress the
    // event here, and the assertion below would depend on test order rather than on the
    // behaviour it is checking.
    const revisionId = "99999999-9999-4999-8999-999999999999";
    const confirmed = {
      ...detailWith(draft),
      latestDraft: null,
      activeRevision: {
        id: revisionId,
        digest: "b".repeat(64),
        inputSnapshot: input,
        outputSnapshot: draft,
        confirmationReceipt: {
          schemaVersion: 1,
          planId,
          revisionId,
          digest: "b".repeat(64),
          version: 3,
          goalId: null,
          items: [],
          committedAt: "2030-01-07T00:00:00.000Z",
        },
      },
      links: draft.items.map((item) => ({
        itemKey: item.key,
        disposition: "LIVE",
        questId: 7,
      })),
      execution: draft.items.map((item) => ({
        itemKey: item.key,
        status: item.masteryStage === "MASTERY_CHECK" ? "COMPLETED" : "COMPLETED",
        completedAt: "2030-01-07T00:00:00.000Z",
      })),
    };
    serve(confirmed, {
      ...savedPlan,
      latestDraftRevisionId: null,
      activeRevisionId: revisionId,
    });
    render(<MasteryPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · confirmed` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · confirmed`);
    await screen.findByText("Planned work by stage");
    expect(screen.getByText("All planned work done")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText(/yours to judge/i)).toBeInTheDocument();
    // Completing the check reports workflow state once, and nothing about the result.
    const checkEvents = logged.mock.calls.filter(
      ([tag, payload]) =>
        tag === "[planner]" &&
        (payload as { event?: string }).event === "mastery_check_completed"
    );
    expect(checkEvents).toHaveLength(1);
    expect(checkEvents[0][1]).toMatchObject({ mode: "MASTERY" });
    expect(JSON.stringify(checkEvents[0][1])).not.toMatch(
      /circular|chapter|unit|mastered|score/i
    );
    // Quest completion is execution state, never an academic judgement: the only
    // place the word appears is the disclaimer that refuses to make one.
    const text = document.body.textContent ?? "";
    const claims = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => /\bmastered\b/i.test(sentence));
    expect(claims.length).toBeGreaterThan(0);
    // Every sentence that uses the word refuses to make the claim.
    for (const sentence of claims)
      expect(sentence).toMatch(/\bnever\b|\bdoes not\b|\bnot\b/i);
    logged.mockRestore();
  });

  it("renders a maximum-scope draft without losing a stage or an item", async () => {
    if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    // The item ceiling, with every text field at its bound: the worst review the UI
    // can be asked to draw.
    const staged = ["UNDERSTAND", "LEARN", "ACTIVE_RECALL", "PRACTICE", "REVIEW_MISTAKES"] as const;
    const items = Array.from({ length: 60 }, (_, index) => {
      const source = draft.items[index % draft.items.length];
      const stage = index === 59 ? ("MASTERY_CHECK" as const) : staged[index % staged.length];
      return {
        ...source,
        key: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        masteryStage: stage,
        type: stage === "MASTERY_CHECK" ? ("ASSESS" as const) : source.type,
        title: `${index}. ${"Wide title ".repeat(8)}`.slice(0, 200),
        description: "Detailed work description. ".repeat(10).slice(0, 300),
        completionCriteria:
          "Complete this bounded step, then record what was finished and what remains.",
      };
    });
    serve(detailWith({ ...draft, items }));
    render(<MasteryPlanner capabilities={capabilities} />);
    // This is the heaviest render in the suite — sixty items with every text field at its
    // bound — so its wait is explicit rather than the one-second default. The assertion is
    // unchanged; under a fully parallel repository run the default window was occasionally
    // consumed by render work alone.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: `${input.title} · draft waiting for review` })
        ).toBeInTheDocument(),
      { timeout: 30_000 }
    );
    click(`${input.title} · draft waiting for review`);
    await screen.findByText("Planned work by stage");
    // Every stage group is present and every item is reachable.
    for (const stage of ["Understand", "Learn", "Active recall", "Practice", "Review mistakes", "Mastery check"])
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Quest title")).toHaveLength(60);
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("keeps the planner surface on appearance tokens with touch-sized controls", () => {
    // The planner wizard and quick-plan reuse appearance tokens so the dark, light and
    // custom appearance behaviour remains unified. This guards the two things that would
    // silently break it: a literal colour and an interactive target under 44px.
    for (const file of [
      "app/components/planner/ExamPlanner.module.css",
      "app/components/planner/quick-plan/quick-plan.module.css",
    ]) {
      const css = readFileSync(join(process.cwd(), file), "utf8");
      const literals = css
        .split("\n")
        .filter((line) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(line))
        .filter((line) => !line.includes("var(--"));
      expect(literals).toEqual([]);
      expect(css).toMatch(/min-height: 44px/);
      expect(css).toMatch(/prefers-reduced-motion/);
      expect(css).toMatch(/prefers-color-scheme|\[data-theme|accent-primary/);
    }
  });

  it("surfaces the deterministic feasibility choices instead of a generic failure", async () => {
    await reachReview();
    const { MasteryClientError } = await import("@/lib/planner/mastery-client");
    api.mastery.mockRejectedValue(
      new MasteryClientError("MASTERY_INFEASIBLE", {
        status: "SEGMENT_REQUIRED",
        scopeMinutes: 2400,
        availableMinutes: 600,
        horizonDays: 84,
        derived: false,
        endDate: input.endDate,
        minimumItems: 13,
        scopeBytes: 3000,
        inputEnvelopeBytes: 16384,
        reasons: ["ITEM_LIMIT_REQUIRES_SEGMENTS"],
        choices: ["Select a smaller unit or chapter to master now."],
      })
    );
    click("Generate my mastery plan");
    expect(
      await screen.findByText(/too large for one mastery plan/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a smaller unit or chapter to master now.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing was dropped or shortened/i)
    ).toBeInTheDocument();
  });

});
