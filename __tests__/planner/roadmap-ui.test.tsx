import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import RoadmapPlanner from "@/app/components/planner/RoadmapPlanner";
import { normalizeProposal } from "@/lib/planner/server/core";
import { roadmapAvailability, roadmapFixture, roadmapProposal } from "./roadmap-fixtures";

const capabilities = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Physics" }],
};
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  roadmap: vi.fn(),
  expansion: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/lib/planner/transport", async (original) => ({
  ...(await original<typeof import("@/lib/planner/transport")>()),
  plannerFetch: api.fetch,
}));
vi.mock("@/lib/planner/roadmap-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/roadmap-client")>()),
  requestRoadmap: api.roadmap,
  requestExpansion: api.expansion,
  cancelExpansion: vi.fn(),
}));
vi.mock("@/lib/planner/client", () => ({
  commitPlanner: api.commit,
  recoverPlannerCommit: vi.fn().mockResolvedValue(null),
}));

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const input = roadmapFixture();
const draft = normalizeProposal(input, roadmapProposal(input));
const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

function detailWith(output: unknown) {
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
    links: [],
    expansions: [],
    milestoneStates: (output as { milestones: { key: string }[] }).milestones.map(
      (milestone) => ({
        milestoneKey: milestone.key,
        periodKey: null,
        state: "NOT_EXPANDED" as const,
        itemCount: 0,
        liveCount: 0,
      })
    ),
  };
}

const savedPlan = {
  id: planId,
  title: input.title,
  mode: "ROADMAP",
  state: "DRAFT",
  latestDraftRevisionId: revisionId,
  activeRevisionId: null,
};
/** Path-aware transport double: list, recovery and owned detail. */
function serve(detail: unknown) {
  api.fetch.mockImplementation(async (path: string) => {
    if (path === "") return [savedPlan];
    if (path.startsWith("/recover/")) return { planId, operation: { state: "SEALED" } };
    return detail;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  serve([]);
});
afterEach(cleanup);

async function reachReview() {
  render(<RoadmapPlanner capabilities={capabilities} />);
  click("Plan a course");
  fireEvent.change(screen.getByLabelText("Course or subject name"), {
    target: { value: "Physics" },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Syllabus units or topics — one per line"), {
    target: { value: input.roadmap.topics.map((topic) => topic.label).join("\n") },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Target completion date"), {
    target: { value: "2030-06-30" },
  });
  click("Continue");
  fireEvent.click(
    screen.getByLabelText("These weekly minutes reflect my actual availability.")
  );
  click("Continue");
  click("Continue");
}

describe("Course Roadmap UI", () => {
  it("walks the progressive wizard and generates a roadmap draft", async () => {
    await reachReview();
    expect(
      screen.getByRole("heading", { name: "Review your roadmap" })
    ).toBeInTheDocument();
    // Progressive disclosure: later fields are not rendered before their step.
    expect(screen.queryByLabelText("Target completion date")).toBeNull();
    api.roadmap.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serve(detailWith(draft));
    click("Generate roadmap");
    await waitFor(() => expect(api.roadmap).toHaveBeenCalledTimes(1));
    await screen.findByText("Periods");
    // Period rows, not a wall of daily tasks.
    expect(screen.getByText("January 2030")).toBeInTheDocument();
    expect(screen.getByText("February 2030")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm roadmap · 0 Quests" })).toBeInTheDocument();
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it("confirms a strategic roadmap with no Quests selected", async () => {
    serve(detailWith(draft));
    api.commit.mockResolvedValue({ schemaVersion: 1, planId, items: [], goalId: null });
    render(<RoadmapPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · DRAFT` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · DRAFT`);
    await screen.findByText("Periods");
    click("Confirm roadmap · 0 Quests");
    await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(1));
    expect(api.commit.mock.calls[0][1]).toMatchObject({ selectedItemKeys: [] });
    expect(
      await screen.findByText(/No Quests were created/)
    ).toBeInTheDocument();
  });

  it("shows an expanded period's actionable items with secondary completion conditions", async () => {
    const milestoneKey = (draft as { milestones: { key: string }[] }).milestones[0].key;
    const expansion = {
      ...(draft as Extract<typeof draft, { mode: "ROADMAP" }>),
      expansion: { milestoneKey },
      items: [
        {
          key: "33333333-3333-4333-8333-333333333333",
          topicKey: (draft as Extract<typeof draft, { mode: "ROADMAP" }>).topics[0].key,
          milestoneKey,
          dependsOn: [],
          type: "LEARN" as const,
          title: "Measurements and kinematics session",
          description: "Work through the planned material for this unit.",
          rationale: "First pass before practice.",
          completionCriteria: "Complete the planned reading and note open questions.",
          date: "2030-01-08",
          minutes: 30,
        },
      ],
    };
    const detail = detailWith(expansion);
    detail.milestoneStates = [
      {
        milestoneKey,
        periodKey: null,
        state: "EXPANSION_DRAFT" as never,
        itemCount: 1,
        liveCount: 0,
      },
    ];
    serve(detail);
    render(<RoadmapPlanner capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${input.title} · DRAFT` })
      ).toBeInTheDocument()
    );
    click(`${input.title} · DRAFT`);
    await screen.findByText(/only this period is planned/);
    expect(screen.getAllByText(/Done when:/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Create 1 Quests" })
    ).toBeInTheDocument();
    // Neighbouring periods keep their own state and are not rewritten here.
    expect(document.body.textContent).not.toMatch(/critic|SEQ_WEAK|DENSITY_SPIKE/i);
  });
});
