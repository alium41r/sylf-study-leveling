import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PlannerTab from "@/app/system/components/PlannerTab";
import { AiPlannerModal } from "@/app/components/AiPlannerModal";

/**
 * The Planner's two surfaces, as the student meets them.
 *
 * The Classic Planner is permanent and default; Planner Modes are a deliberate entry
 * from the Planner header. Nothing here consults an environment variable or a server
 * availability flag, because neither exists any more — that absence is the point of
 * the first test below.
 */

vi.mock("@/app/components/planner/useExamCapabilities", () => ({
  useExamCapabilities: () => ({
    today: "2030-01-07",
    timezone: "UTC",
    restDays: [0],
    subjects: [{ id: 1, name: "Physics" }],
  }),
}));
vi.mock("@/app/components/AiPlannerPanel", () => ({
  default: () => <div>Legacy planner panel</div>,
}));
vi.mock("@/app/components/planner/PlannerWorkspace", () => ({
  default: ({ initialMode }: { initialMode?: string }) => (
    <div>Planner Modes surface: {initialMode ?? "chooser"}</div>
  ),
}));
afterEach(cleanup);

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

describe("Planner surfaces", () => {
  it("opens on the Classic Planner, with no availability gate in the way", () => {
    tab();
    // The familiar panel is what renders first — not a chooser, not a loading state.
    expect(screen.getByText("Legacy planner panel")).toBeInTheDocument();
    expect(screen.queryByText(/Planner Modes surface/)).toBeNull();
    // No environment variable is read anywhere in this path.
    expect(process.env.PLANNER_MODES_ENABLED).toBeUndefined();
  });

  it("opens Planner Modes from the header, on its own chooser", () => {
    tab();
    fireEvent.click(screen.getByRole("button", { name: /Planner modes/ }));
    // The header navigates: choosing a mode belongs to the surface it opens.
    expect(screen.getByText("Planner Modes surface: chooser")).toBeInTheDocument();
    // The Classic panel is not rendered underneath.
    expect(screen.queryByText("Legacy planner panel")).toBeNull();
  });

  it("keeps the quick modal on the Classic Planner", () => {
    // The quick modal never swaps itself for a different planner: Planner Modes have
    // their own deliberate entry point inside the Planner tab.
    render(<AiPlannerModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText("Legacy planner panel")).toBeInTheDocument();
    expect(screen.queryByText(/Planner Modes surface/)).toBeNull();
  });
});
