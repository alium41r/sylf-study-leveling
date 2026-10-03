import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import RebalancePanel from "@/app/components/planner/RebalancePanel";
import ExamPlanner from "@/app/components/planner/ExamPlanner";
import MasteryPlanner from "@/app/components/planner/MasteryPlanner";
import RoadmapPlanner from "@/app/components/planner/RoadmapPlanner";
import type { RebalanceDiff } from "@/lib/planner/rebalance-fields";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";
import { roadmapFixture, roadmapProposal } from "./roadmap-fixtures";
import { normalizeProposal } from "@/lib/planner/server/core";
import { examFixture, examProposal } from "./exam-fixtures";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  rebalance: vi.fn(),
  confirm: vi.fn(),
  discard: vi.fn(),
  setResult: vi.fn(),
  resetResult: vi.fn(),
}));

vi.mock("@/lib/planner/transport", async (original) => ({
  ...(await original<typeof import("@/lib/planner/transport")>()),
  plannerFetch: api.fetch,
}));
vi.mock("@/lib/planner/rebalance-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/rebalance-client")>()),
  requestRebalance: api.rebalance,
  confirmRebalance: api.confirm,
  discardRebalance: api.discard,
  setCheckResult: api.setResult,
  resetCheckResult: api.resetResult,
}));

const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const operationKey = "op-11111111-2222-4333-8444-555555555555";

/** A proposal with one of each change, so every diff section renders. */
function diffFixture(): RebalanceDiff {
  const base = {
    stage: "PRACTICE",
    topicTitle: "Cells",
    fromMinutes: 30,
    toMinutes: 30,
  };
  return {
    entries: [
      { ...base, change: "RETAIN", key: null, supersedesKey: null, title: "Keep me", fromDate: "2030-01-10", toDate: "2030-01-10", reason: "Stays as planned." },
      { ...base, change: "MOVE", key: null, supersedesKey: null, title: "Move me", fromDate: "2030-01-11", toDate: "2030-01-18", reason: "Moves from 2030-01-11 to 2030-01-18." },
      { ...base, change: "REPLACE", key: null, supersedesKey: null, title: "Replace me", fromDate: "2030-01-12", toDate: "2030-01-19", reason: "Replaced by work that fits." },
      { ...base, change: "REMOVE", key: null, supersedesKey: null, title: "Drop me", fromDate: "2030-01-13", toDate: null, reason: "No longer part of the remaining plan." },
      { ...base, change: "ADD", key: null, supersedesKey: null, title: "New work", fromDate: null, toDate: "2030-01-20", reason: "New work for what is left." },
    ],
    counts: { RETAIN: 1, MOVE: 1, REPLACE: 1, REMOVE: 1, ADD: 1 },
    frozen: 3,
    affectedHistory: 0,
  };
}

const panelProps = {
  planId,
  baseRevisionId: revisionId,
  version: 5,
  dailyMinutes: [0, 60, 60, 60, 60, 60, 60],
  detectedReasons: ["OVERDUE_WORK"] as const,
  eligible: 4,
  frozen: 3,
  overdue: 2,
  proposal: null,
  labels: {
    review: "Review plan",
    discard: "Discard this proposal",
    description: "Rebalance what is left without touching what is done.",
  },
  onReload: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetch.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Replan review UI", () => {
  it("offers review on a confirmed plan without calling a provider", () => {
    render(<RebalancePanel {...panelProps} />);
    // Detection surfaces an affordance and nothing else: no provider call happens
    // until the student asks for one.
    expect(screen.getByRole("button", { name: "Review plan" })).toBeInTheDocument();
    expect(api.rebalance).not.toHaveBeenCalled();
    expect(screen.getByText(/4 items can still change/)).toBeInTheDocument();
    expect(screen.getByText(/3 are already completed or in progress/)).toBeInTheDocument();
    expect(screen.getByText(/Some planned work is overdue/)).toBeInTheDocument();
  });

  it("starts one bounded replan with the detected reason and the chosen scope", async () => {
    api.rebalance.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    render(<RebalancePanel {...panelProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await waitFor(() => expect(api.rebalance).toHaveBeenCalledTimes(1));
    const [id, request, ,] = api.rebalance.mock.calls[0] as [
      string,
      {
        reasonCode: string;
        scope: { milestoneKey: string | null };
        inputChanges: string[];
        expectedVersion: number;
        baseRevisionId: string;
      },
    ];
    expect(id).toBe(planId);
    expect(request).toMatchObject({
      // The mastery-specific reason is never sent as a generic one.
      reasonCode: "OVERDUE_WORK",
      scope: { milestoneKey: null },
      inputChanges: [],
      expectedVersion: 5,
      baseRevisionId: revisionId,
    });
    await screen.findByText("Proposal ready to review.");
  });

  it("sends an explicit availability change only when the student states one", async () => {
    api.rebalance.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    render(<RebalancePanel {...panelProps} />);
    fireEvent.click(screen.getByText("My availability changed"));
    const monday = screen.getByLabelText("Monday") as HTMLInputElement;
    fireEvent.change(monday, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    await waitFor(() => expect(api.rebalance).toHaveBeenCalledTimes(1));
    const [, request] = api.rebalance.mock.calls[0] as [
      string,
      { inputChanges: string[]; proposedInput?: { availability: { dailyMinutes: number[] } } },
    ];
    expect(request.inputChanges).toEqual(["AVAILABILITY"]);
    expect(request.proposedInput?.availability.dailyMinutes[1]).toBe(45);
  });

  it("shows every kind of change, the counts and the history guarantee", () => {
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: diffFixture(),
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
      />
    );
    for (const heading of ["Unchanged", "Rescheduled", "Replaced", "Removed", "New"])
      expect(screen.getByText(heading)).toBeInTheDocument();
    // Each entry says what changes, in the student's words.
    expect(screen.getByText("Move me")).toBeInTheDocument();
    expect(screen.getByText(/Moves from 2030-01-11 to 2030-01-18/)).toBeInTheDocument();
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(screen.getByText("New work")).toBeInTheDocument();
    expect(
      screen.getByText(/1 unchanged · 1 rescheduled · 1 replaced · 1 new · 1 removed/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Completed or active history affected: 0/)
    ).toBeInTheDocument();
    // Nothing is applied merely by looking at it.
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("confirms exactly the sealed revision, once, and reports what was applied", async () => {
    api.confirm.mockResolvedValue({
      schemaVersion: 1,
      planId,
      revisionId,
      digest: "b".repeat(64),
      version: 7,
      goalId: null,
      items: [{ itemKey: "a", questId: 1 }],
      committedAt: "2030-01-07T00:00:00.000Z",
    });
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: diffFixture(),
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm these changes" }));
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
    expect(api.confirm.mock.calls[0][1]).toMatchObject({
      revisionId,
      digest: "b".repeat(64),
      expectedVersion: 6,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Nothing completed was changed/
    );
  });

  it("refuses to confirm a proposal that would touch history", () => {
    const diff = diffFixture();
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: { ...diff, affectedHistory: 1 },
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
      />
    );
    expect(
      screen.getByRole("button", { name: "Confirm these changes" })
    ).toBeDisabled();
  });

  it("explains a stale or protected conflict and leaves the plan alone", async () => {
    const { RebalanceClientError } = await import("@/lib/planner/rebalance-client");
    api.confirm.mockRejectedValue(new RebalanceClientError("REPLAN_STALE_EXECUTION"));
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: diffFixture(),
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm these changes" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Review it again/);
    expect(alert).toHaveTextContent(/started, completed or edited/);
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  it("discards a proposal by its operation key without touching execution", async () => {
    api.discard.mockResolvedValue({});
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: diffFixture(),
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard this proposal" }));
    await waitFor(() => expect(api.discard).toHaveBeenCalledTimes(1));
    expect(api.discard).toHaveBeenCalledWith(planId, operationKey);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("records a user-reported check result, changes it and clears it", async () => {
    api.setResult.mockResolvedValue({});
    api.resetResult.mockResolvedValue({});
    render(
      <RebalancePanel
        {...panelProps}
        check={{
          itemKey: "33333333-3333-4333-8333-333333333333",
          revisionId,
          result: null,
          completed: true,
        }}
      />
    );
    expect(screen.getByText(/How did that check go\?/)).toBeInTheDocument();
    expect(
      screen.getByText(/This is your own assessment.*does not mark the unit as mastered/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ready to move on" }));
    await waitFor(() => expect(api.setResult).toHaveBeenCalledTimes(1));
    expect(api.setResult.mock.calls[0][1]).toMatchObject({
      result: "READY_TO_MOVE_ON",
      itemKey: "33333333-3333-4333-8333-333333333333",
    });
    // Recording a result starts nothing: no provider call, no confirmation.
    expect(api.rebalance).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear my answer" }));
    await waitFor(() => expect(api.resetResult).toHaveBeenCalledTimes(1));
    expect(api.resetResult).toHaveBeenCalledWith(
      planId,
      "33333333-3333-4333-8333-333333333333"
    );
  });

  it("turns a needs-more-work report into an offer, never into work", async () => {
    api.setResult.mockResolvedValue({});
    render(
      <RebalancePanel
        {...panelProps}
        detectedReasons={["MASTERY_CHECK_NEEDS_WORK"]}
        check={{
          itemKey: "33333333-3333-4333-8333-333333333333",
          revisionId,
          result: null,
          completed: true,
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Needs more work" }));
    await waitFor(() => expect(api.setResult).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Sylf will not create, move or delete anything/)
    ).toBeInTheDocument();
    // The only way forward is the student's own review.
    expect(
      screen.getByRole("button", { name: "Review plan" })
    ).toBeInTheDocument();
    expect(api.rebalance).not.toHaveBeenCalled();
  });

  it("passes axe with a full diff and the check control on screen", async () => {
    render(
      <RebalancePanel
        {...panelProps}
        proposal={{
          revisionId,
          requestKey: operationKey,
          revisionDigest: "b".repeat(64),
          diff: diffFixture(),
          version: 6,
          reasonCode: "USER_REQUESTED",
        }}
        check={{
          itemKey: "33333333-3333-4333-8333-333333333333",
          revisionId,
          result: "FELT_OK",
          completed: true,
        }}
      />
    );
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});

/** A confirmed plan detail per mode, so each wizard renders its own affordance. */
function detailFor(
  input: unknown,
  output: unknown,
  extra: Record<string, unknown> = {}
) {
  return {
    plan: { id: planId, title: "Synthetic plan", version: 5, state: "ACTIVE" },
    latestDraft: null,
    activeRevision: {
      id: revisionId,
      digest: "b".repeat(64),
      source: "GENERATE",
      operationKey,
      inputSnapshot: input,
      outputSnapshot: output,
      // The mode views read the confirmed availability snapshot for local dates.
      availabilitySnapshot: {
        schemaVersion: 1,
        timezone: "UTC",
        restDays: [],
        floatingDates: [],
        existingWork: [],
        lineageFingerprint: "",
      },
      confirmationReceipt: {
        schemaVersion: 1,
        planId,
        revisionId,
        digest: "b".repeat(64),
        version: 5,
        goalId: null,
        items: [],
        committedAt: "2030-01-07T00:00:00.000Z",
      },
    },
    links: [],
    execution: [],
    rebalanceState: { eligible: 4, frozen: 2, overdue: 1 },
    rebalance: null,
    checkResults: [],
    historyItems: [],
    milestoneStates: [],
    expansions: [],
    ...extra,
  };
}

/** Path-aware transport double: the plan list, then the owned confirmed plan. */
function serve(mode: string, detail: unknown) {
  api.fetch.mockImplementation(async (path: string) => {
    if (path === "")
      return [
        {
          id: planId,
          title: "Synthetic plan",
          mode,
          state: "ACTIVE",
          latestDraftRevisionId: null,
          activeRevisionId: revisionId,
        },
      ];
    return detail;
  });
}

/** Opens the confirmed plan from the plan list, whichever label the mode uses. */
async function openPlan() {
  const button = await screen.findByRole("button", { name: /Synthetic plan ·/ });
  fireEvent.click(button);
}

const capabilities = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Physics" }],
};

describe("Replan affordances across the three modes", () => {
  it("offers review on a confirmed Exam plan", async () => {
    const input = examFixture();
    const draft = normalizeProposal(input, examProposal());
    serve("EXAM", detailFor(input, draft));
    render(<ExamPlanner capabilities={capabilities} />);
    await openPlan();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review plan" })).toBeInTheDocument()
    );
    expect(api.rebalance).not.toHaveBeenCalled();
  });

  it("offers a strategic rebalance and a period revision on a confirmed Roadmap", async () => {
    const input = roadmapFixture();
    const draft = normalizeProposal(input, roadmapProposal(input));
    const milestoneKey = (draft as { milestones: { key: string }[] }).milestones[0].key;
    serve(
      "ROADMAP",
      detailFor(input, draft, {
        milestoneStates: [
          { milestoneKey, periodKey: null, state: "EXPANDED", itemCount: 3, liveCount: 3 },
        ],
      })
    );
    render(<RoadmapPlanner capabilities={capabilities} />);
    await openPlan();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Rebalance roadmap" })
      ).toBeInTheDocument()
    );
    // An already-planned period can be revised explicitly, without pretending the
    // original expansion never happened.
    expect(
      screen.getByRole("button", { name: "Revise this period" })
    ).toBeInTheDocument();
    expect(api.rebalance).not.toHaveBeenCalled();
  });

  it("offers remaining-plan review and the check report on a confirmed mastery plan", async () => {
    const input = masteryFixture();
    const draft = normalizeProposal(input, masteryProposal(input));
    serve("MASTERY", detailFor(input, draft));
    render(<MasteryPlanner capabilities={capabilities} />);
    await openPlan();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review remaining plan" })
      ).toBeInTheDocument()
    );
    expect(api.rebalance).not.toHaveBeenCalled();
  });
});
