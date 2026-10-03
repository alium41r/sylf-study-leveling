import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import ExamPlanner from "@/app/components/planner/ExamPlanner";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";
import { normalizeProposal } from "@/lib/planner/server/core";
const cap = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Biology" }],
};
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  request: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/lib/planner/exam-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/exam-client")>()),
  plannerFetch: api.fetch,
  requestExam: api.request,
}));
vi.mock("@/lib/planner/client", () => ({
  commitPlanner: api.commit,
  recoverPlannerCommit: vi.fn().mockResolvedValue(null),
}));
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.fetch.mockResolvedValue([]);
});
afterEach(cleanup);

async function reachReview() {
  render(<ExamPlanner capabilities={cap} />);
  click("Prepare for an Exam");
  fireEvent.change(screen.getByLabelText("Subject or course name"), {
    target: { value: "Science" },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
    target: { value: "Cells\nEnzymes\nTransport" },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Exam date"), {
    target: { value: "2030-01-25" },
  });
  click("Continue");
  fireEvent.click(
    screen.getByLabelText("These minutes reflect my actual availability.")
  );
  click("Continue");
  click("Continue");
}

describe("A1 planning intelligence UI", () => {
  it("offers a lightweight priority control that is independent of confidence", async () => {
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Science" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
      target: { value: "Cells\nEnzymes" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2030-01-25" },
    });
    click("Continue");
    fireEvent.click(
      screen.getByLabelText("These minutes reflect my actual availability.")
    );
    click("Continue");
    const controls = screen.getAllByLabelText(
      "How much does this topic matter for this exam?"
    );
    expect(controls).toHaveLength(2);
    expect(
      screen.getAllByText(/Priority is separate from confidence/).length
    ).toBeGreaterThan(0);
    fireEvent.change(controls[0], { target: { value: "HIGH" } });
    click("Continue");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft" })).toBeInTheDocument());
  });

  it("asks only the smart questions that are justified, with a reason and closed choices", async () => {
    await reachReview();
    const group = screen.getByRole("group", {
      name: /Would you rather spread study evenly/i,
    });
    expect(group).toBeInTheDocument();
    expect(
      screen.getByText(/Why this matters:/)
    ).toBeInTheDocument();
    // Closed choices only: no free-text input inside the question group.
    expect(group.querySelectorAll("input[type='text'], textarea")).toHaveLength(0);
    const options = group.querySelectorAll("input[type='radio']");
    expect(options.length).toBe(2);
    fireEvent.click(options[1]);
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("merges the answer into the planning input without a free-text interview", async () => {
    await reachReview();
    const group = screen.getByRole("group", {
      name: /Would you rather spread study evenly/i,
    });
    fireEvent.click(group.querySelectorAll("input[type='radio']")[0]);
    click("Generate draft");
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    const input = api.request.mock.calls[0][0];
    expect(input.constraints).toHaveLength(1);
    expect(input.constraints[0]).toMatchObject({
      kind: "EVEN_SPREAD_PREFERENCE",
      strength: "SOFT",
      source: "USER_EXPLICIT",
      reasonCode: "AVAILABILITY_PATTERN_UNCLEAR",
    });
  });

  it("asks nothing at all when no answer would change the plan", async () => {
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Science" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
      target: { value: "Cells\nEnzymes\nTransport" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2030-01-25" },
    });
    click("Continue");
    // A non-uniform availability grid answers the pattern question by itself.
    fireEvent.change(screen.getByLabelText("Monday · Minutes"), {
      target: { value: "90" },
    });
    fireEvent.click(
      screen.getByLabelText("These minutes reflect my actual availability.")
    );
    click("Continue");
    click("Continue");
    expect(
      screen.queryByText("A few details that change this plan")
    ).toBeNull();
    expect(screen.queryByText(/Why this matters:/)).toBeNull();
    expect(screen.queryByText("Clear these answers")).toBeNull();
    click("Generate draft");
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(api.request.mock.calls[0][0].constraints).toBeUndefined();
  });

  it("shows the completion condition as secondary item information, never critic internals", async () => {
    const planId = crypto.randomUUID(),
      revisionId = crypto.randomUUID();
    const draft = normalizeProposal(examFixture(), examProposal());
    api.fetch.mockImplementation(async (path: string) =>
      path === ""
        ? [
            {
              id: planId,
              title: "Science exam",
              mode: "EXAM",
              state: "DRAFT",
              latestDraftRevisionId: revisionId,
            },
          ]
        : {
            plan: { id: planId, title: "Science exam", version: 1, state: "DRAFT" },
            latestDraft: {
              id: revisionId,
              digest: "a".repeat(64),
              inputSnapshot: examFixture(),
              outputSnapshot: draft,
              availabilitySnapshot: examAvailability(),
              confirmationReceipt: null,
            },
            activeRevision: null,
            links: [],
          }
    );
    render(<ExamPlanner capabilities={cap} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Science exam · DRAFT" })
      ).toBeInTheDocument()
    );
    click("Science exam · DRAFT");
    await screen.findByText("Staged timeline");
    // The completion condition is visible under each item title…
    expect(screen.getAllByText(/Done when:/).length).toBeGreaterThan(0);
    // …and editable as a bounded field.
    const criteria = screen.getAllByLabelText("Done when (completion condition)");
    expect(criteria).toHaveLength(draft.items.length);
    expect(
      screen.getAllByText(/Claiming mastery is not a completion condition/).length
    ).toBeGreaterThan(0);
    // Critic internals are never surfaced.
    expect(document.body.textContent).not.toMatch(/critic|DENSITY_SPIKE|SEQ_WEAK/i);
  });
});
