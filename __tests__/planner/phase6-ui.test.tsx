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
import StretchPromotion from "@/app/components/planner/StretchPromotion";
import FrictionFeedback from "@/app/components/planner/FrictionFeedback";
import CoverageMapPanel from "@/app/components/planner/CoverageMapPanel";
import PreferencePanel from "@/app/components/planner/PreferencePanel";
import PlanItemEditor from "@/app/components/planner/PlanItemEditor";
import { PLANNER_ROLE_COPY } from "@/lib/planner/planner-role";
import type { ValidatedDraftV1 } from "@/lib/planner/contracts";

/**
 * Phase 6 planner UI: Core/Stretch review, the Coverage Map, restrained
 * retrieval/intensity display, optional friction feedback and the planning
 * preferences surface. No real network: every endpoint is a hoisted mock.
 */
const api = vi.hoisted(() => ({
  promote: vi.fn(),
  friction: vi.fn(),
  prefs: vi.fn(),
  ignore: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/lib/planner/stretch-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/stretch-client")>()),
  promoteStretchItems: api.promote,
}));
vi.mock("@/lib/planner/friction-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/friction-client")>()),
  recordFriction: api.friction,
}));
vi.mock("@/lib/planner/preferences-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/preferences-client")>()),
  activePreferences: api.prefs,
  ignorePreferenceForPlan: api.ignore,
  resetPreferenceForPlan: api.reset,
}));

const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const itemKey = "33333333-3333-4333-8333-333333333333";
const topicKey = "44444444-4444-4444-8444-444444444444";

const axeOptions = {
  rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Core / Stretch in the review UI", () => {
  it("marks a STRETCH item with a calm marker and the promise, and never fires on render", () => {
    render(
      <PlanItemEditor
        item={
          {
            key: itemKey,
            topicKey,
            type: "RECALL",
            stage: null,
            masteryStage: null,
            title: "Optional extra recall",
            description:
              "Skim the earlier chapter's summary and write down what you remember.",
            rationale: "Extra reinforcement if the week has room.",
            completionCriteria:
              "Write a page of recalled points, checked against the summary.",
            date: "2030-01-10",
            minutes: 30,
            dependsOn: [],
            relatedTopicKeys: [],
            milestoneKey: null,
            locked: false,
            removed: false,
            role: "STRETCH",
            retrievalPurpose: "RECALL",
          } as unknown as ValidatedDraftV1["items"][number]
        }
        index={0}
        total={1}
        topicTitle="Kinematics"
        disabled={false}
        minDate="2030-01-07"
        maxDate="2030-01-25"
        onUpdate={vi.fn()}
        onMove={vi.fn()}
        stretch={{
          planId,
          revisionId,
          version: 5,
          stale: false,
          promoted: false,
          onPromoted: vi.fn(),
        }}
        friction={{ planId, revisionId }}
      />
    );

    // A calm marker, exactly once, using the role label.
    expect(screen.getByText("Stretch")).toBeInTheDocument();
    // CORE is never announced: no "Core" marker anywhere.
    expect(screen.queryByText("Core")).toBeNull();
    // The promise copy and the explicit, keyboard-reachable action.
    expect(screen.getByText(PLANNER_ROLE_COPY.STRETCH)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PLANNER_ROLE_COPY.PROMOTE })
    ).toBeInTheDocument();
    // No provider or endpoint call is triggered merely by rendering.
    expect(api.promote).not.toHaveBeenCalled();
  });

  it("offers no promotion button on a stale plan", () => {
    render(
      <StretchPromotion
        planId={planId}
        revisionId={revisionId}
        version={5}
        itemKey={itemKey}
        stale
        promoted={false}
        onPromoted={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: PLANNER_ROLE_COPY.PROMOTE });
    expect(button).toBeDisabled();
  });

  it("promotes through the stretch endpoint with the exact body, once", async () => {
    api.promote.mockResolvedValue({ items: [{ itemKey, questId: 9, created: true }] });
    render(
      <StretchPromotion
        planId={planId}
        revisionId={revisionId}
        version={5}
        itemKey={itemKey}
        stale={false}
        promoted={false}
        onPromoted={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: PLANNER_ROLE_COPY.PROMOTE }));
    await waitFor(() => expect(api.promote).toHaveBeenCalledTimes(1));
    const [id, body] = api.promote.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe(planId);
    expect(body).toMatchObject({
      schemaVersion: 1,
      revisionId,
      itemKeys: [itemKey],
      expectedVersion: 5,
    });
    expect(body.idempotencyKey).toEqual(expect.any(String));
  });

  it("translates INFEASIBLE_CAPACITY to human copy, never a raw code", async () => {
    const { StretchClientError } = await import("@/lib/planner/stretch-client");
    api.promote.mockRejectedValue(new StretchClientError("INFEASIBLE_CAPACITY"));
    render(
      <StretchPromotion
        planId={planId}
        revisionId={revisionId}
        version={5}
        itemKey={itemKey}
        stale={false}
        promoted={false}
        onPromoted={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: PLANNER_ROLE_COPY.PROMOTE }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/does not fit the capacity/i);
    expect(alert).not.toHaveTextContent("INFEASIBLE_CAPACITY");
  });
});

describe("Coverage Map", () => {
  const topic = (key: string, title: string) => ({ key, title, parentKey: null });

  function coverageDraft(
    topics: { key: string; title: string }[],
    items: Record<string, unknown>[]
  ): ValidatedDraftV1 {
    return {
      mode: "EXAM",
      schemaVersion: 1,
      examDate: "2030-01-25",
      assumptions: [],
      warnings: [],
      topics: topics.map((t) => topic(t.key, t.title)),
      milestones: [],
      items: items.map((over) => ({
        key: "k",
        topicKey: "t",
        type: "LEARN",
        stage: null,
        masteryStage: null,
        date: "2030-01-07",
        minutes: 30,
        removed: false,
        ...over,
      })),
    } as unknown as ValidatedDraftV1;
  }

  const fourStateDraft = coverageDraft(
    [
      { key: "u1", title: "Kinematics" },
      { key: "u2", title: "Forces" },
      { key: "u3", title: "Waves" },
      { key: "u4", title: "Optics" },
    ],
    [
      { key: "i1", topicKey: "u1", type: "LEARN", date: "2030-01-07" },
      { key: "i2", topicKey: "u2", type: "LEARN", date: "2030-01-07" },
      { key: "i3", topicKey: "u2", type: "RECALL", date: "2030-01-09" },
      { key: "i4", topicKey: "u3", type: "LEARN", date: "2030-01-07" },
      { key: "i5", topicKey: "u3", type: "PRACTICE", date: "2030-01-09" },
    ]
  );

  it("renders the four coverage states and never the word mastered", () => {
    render(<CoverageMapPanel draft={fourStateDraft} />);
    fireEvent.click(screen.getByText("Coverage map"));
    for (const label of ["Not planned yet", "Planned", "Revisited", "Practised"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/mastered/i);
  });

  it("calls out unscheduled units plainly", () => {
    render(<CoverageMapPanel draft={fourStateDraft} />);
    fireEvent.click(screen.getByText("Coverage map"));
    expect(screen.getByText(/Not planned yet: Optics/)).toBeInTheDocument();
  });

  it("collapses a large scope by unit and expands on demand", () => {
    const units = Array.from({ length: 15 }, (_, index) => ({
      key: `u${index}`,
      title: `Unit ${index + 1}`,
    }));
    const draft = coverageDraft(
      units,
      units.map((unit) => ({
        key: `i-${unit.key}`,
        topicKey: unit.key,
        type: "LEARN",
        date: "2030-01-07",
      }))
    );
    render(<CoverageMapPanel draft={draft} />);
    fireEvent.click(screen.getByText("Coverage map"));
    const first = screen.getByText("Unit 1").closest("details") as HTMLDetailsElement;
    expect(first.open).toBe(false);
    fireEvent.click(screen.getByText("Unit 1"));
    expect(first.open).toBe(true);
  });

  it("passes axe on the full map surface", async () => {
    render(<CoverageMapPanel draft={fourStateDraft} />);
    const result = await axe.run(document.body, axeOptions);
    expect(result.violations).toEqual([]);
  });
});

describe("Friction feedback", () => {
  it("is optional, dismissible, records once and triggers no generation", async () => {
    api.friction.mockResolvedValue({});
    render(
      <FrictionFeedback planId={planId} revisionId={revisionId} itemKey={itemKey} />
    );
    const toggle = screen.getByRole("button", { name: "Why does this need changing?" });
    // Collapsed by default: no reason controls are exposed.
    expect(screen.queryByText("Too long")).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Too hard" }));
    await waitFor(() => expect(api.friction).toHaveBeenCalledTimes(1));
    expect(api.friction).toHaveBeenCalledWith(planId, {
      schemaVersion: 1,
      revisionId,
      itemKey,
      reasonCode: "TOO_HARD",
    });
    // Recording is a side-effect-free write: nothing else runs.
    expect(api.promote).not.toHaveBeenCalled();
    expect(api.prefs).not.toHaveBeenCalled();
    // The note is calm and dismissible.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /will not change this plan/i
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide feedback" }));
    expect(screen.queryByText("Too long")).toBeNull();
  });
});

describe("Planning preferences", () => {
  it("lists active preferences with a source and calls the right endpoints", async () => {
    api.prefs.mockResolvedValue([
      { preferenceType: "SESSION_LENGTH", value: "45", confidence: 100, source: "OBSERVED" },
      { preferenceType: "TASK_DETAIL", value: "HIGH", confidence: 100, source: "CONFIRMED" },
    ]);
    api.ignore.mockResolvedValue({ ignored: true });
    api.reset.mockResolvedValue({ reset: true });
    render(<PreferencePanel planId={planId} />);
    fireEvent.click(screen.getByText("Planning preferences"));

    expect(await screen.findByText("Session length")).toBeInTheDocument();
    expect(screen.getByText(/about 45 minutes per session/)).toBeInTheDocument();
    expect(screen.getByText("From your earlier planning choices.")).toBeInTheDocument();
    expect(screen.getByText("You set this.")).toBeInTheDocument();
    // The language is "planning preference", never a claim about tracked behaviour.
    expect(screen.getByText(/Planning preferences from your earlier choices/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/learned your behaviour/i);

    const ignoreButtons = screen.getAllByRole("button", { name: "Ignore for this plan" });
    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    expect(ignoreButtons).toHaveLength(2);
    expect(resetButtons).toHaveLength(2);

    fireEvent.click(ignoreButtons[0]);
    await waitFor(() => expect(api.ignore).toHaveBeenCalledTimes(1));
    expect(api.ignore).toHaveBeenCalledWith(planId, "SESSION_LENGTH");

    fireEvent.click(resetButtons[0]);
    await waitFor(() => expect(api.reset).toHaveBeenCalledTimes(1));
    expect(api.reset).toHaveBeenCalledWith(planId, "SESSION_LENGTH");
  });

  it("passes axe with preferences loaded", async () => {
    api.prefs.mockResolvedValue([
      { preferenceType: "BUFFER_STYLE", value: "END_OF_WEEK", confidence: 100, source: "CONFIRMED" },
    ]);
    render(<PreferencePanel planId={planId} />);
    fireEvent.click(screen.getByText("Planning preferences"));
    await screen.findByText("Buffer style");
    const result = await axe.run(document.body, axeOptions);
    expect(result.violations).toEqual([]);
  });
});

describe("Restrained intelligence display", () => {
  it("shows a short retrieval hint and no per-item intensity badge", () => {
    render(
      <PlanItemEditor
        item={
          {
            key: itemKey,
            topicKey,
            type: "REVIEW",
            stage: null,
            masteryStage: null,
            title: "Reinforce the earlier chapter",
            description: "Re-read the summary and note what you can recall.",
            completionCriteria: "List the points you could recall, then check the gaps.",
            date: "2030-01-12",
            minutes: 15,
            dependsOn: [],
            relatedTopicKeys: [],
            milestoneKey: null,
            locked: false,
            removed: false,
            retrievalPurpose: "REINFORCEMENT",
          } as unknown as ValidatedDraftV1["items"][number]
        }
        index={0}
        total={1}
        topicTitle="Kinematics"
        disabled={false}
        minDate="2030-01-07"
        maxDate="2030-01-25"
        onUpdate={vi.fn()}
        onMove={vi.fn()}
      />
    );
    // The retrieval purpose is a short hint, not a badge pile.
    expect(screen.getByText(/Reinforcement/)).toBeInTheDocument();
    // No per-item intensity badge is ever shown.
    for (const label of ["Light", "Standard", "Demanding"])
      expect(screen.queryByText(label)).toBeNull();
  });
});
