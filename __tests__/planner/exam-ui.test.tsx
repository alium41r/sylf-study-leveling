import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.fetch.mockResolvedValue([]);
});
afterEach(cleanup);
async function fillWizard() {
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
describe("Exam wizard and review", () => {
  it("has labelled progressive inputs, focus transitions and explicit availability", async () => {
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    expect(
      screen.getByRole("heading", { name: "What are you preparing for?" })
    ).toHaveFocus();
    expect(screen.queryByLabelText("Exam date")).toBeNull();
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Science" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
      target: { value: "Cells" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2030-01-25" },
    });
    click("Continue");
    click("Continue");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Confirm your actual study availability"
    );
    expect(screen.getByLabelText("Sunday · Rest day")).toBeDisabled();
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });
  it("preserves inputs after cancellation and announces progress without percentages", async () => {
    await fillWizard();
    let reject!: (reason: Error) => void;
    api.request.mockImplementation((_input, _key, signal, event) => {
      event({ stage: "generating" });
      return new Promise((_resolve, r) => {
        reject = r;
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    api.fetch.mockImplementation(async (path) =>
      path.startsWith("/recover/") ? { operation: { state: "CANCELLED" } } : []
    );
    click("Generate draft");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Generating an Exam proposal"
      )
    );
    click("Cancel generation");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Generation cancelled"
      )
    );
    click("Back");
    expect(screen.getByRole("heading", { name: "Cells" })).toBeInTheDocument();
    expect(api.commit).not.toHaveBeenCalled();
  });
  it("recovers a saved draft, requires saved edits, and shows authoritative Quest IDs", async () => {
    const planId = crypto.randomUUID(),
      revisionId = crypto.randomUUID();
    const draft = normalizeProposal(examFixture(), examProposal());
    const detail = {
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
    };
    api.fetch.mockImplementation(async (path) =>
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
        : detail
    );
    api.commit.mockResolvedValue({
      schemaVersion: 1,
      planId,
      items: [{ questId: 81, itemKey: draft.items[0].key }],
    });
    render(<ExamPlanner capabilities={cap} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Science exam · DRAFT" })
      ).toBeInTheDocument()
    );
    click("Science exam · DRAFT");
    await screen.findByText("Staged timeline");
    fireEvent.change(screen.getAllByLabelText("Quest title")[0], {
      target: { value: "My reviewed task" },
    });
    expect(
      screen.getByRole("button", { name: "Create plan · 12 Quests" })
    ).toBeDisabled();
    click("Save revised draft");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create plan · 12 Quests" })
      ).not.toBeDisabled()
    );
    click("Create plan · 12 Quests");
    expect(
      await screen.findByRole("link", { name: "Start next Quest" })
    ).toHaveAttribute("href", "/focus?questId=81");
    expect(api.commit).toHaveBeenCalledTimes(1);
  });
});
