import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemScreen } from "@/app/system/components/SystemScreen";
import { preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { consumePlannerHandoff, discardPlannerHandoff, openPlannerHandoff } from "@/lib/ai/sylvie/planner-handoff-client";

const auth = vi.hoisted(() => ({ user: { id: 7 } as { id: number } | null }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/lib/client-data-cache", () => ({ fetchCachedJSON: vi.fn(async () => ({ sessions: [] })), invalidateClientCache: vi.fn() }));
vi.mock("@/app/system/components/SessionSidebar", () => ({ default: () => null }));
vi.mock("@/app/system/components/ConversationPanel", () => ({ default: () => <div>Conversation</div> }));
vi.mock("@/app/system/components/PlannerTab", async () => {
  const { useState } = await import("react");
  return {
    default: function PlannerDraft({ handoff }: { handoff?: { request: string } }) {
      // An intake may retain its initial request internally; account changes must remount it.
      const [request] = useState(handoff?.request ?? "No carried request");
      return <div>{request}</div>;
    },
  };
});

beforeEach(() => {
  auth.user = { id: 7 };
  discardPlannerHandoff();
  window.history.replaceState({}, "", "/system");
});
afterEach(() => { cleanup(); discardPlannerHandoff(); });

describe("Planner request account boundaries", () => {
  it("clears the carried request and its child intake when the signed-in account changes", () => {
    const handoff = preparePlannerHandoff({ id: "account-test-1", message: "Plan my private biology exam revision" });
    const view = render(<SystemScreen />);
    act(() => openPlannerHandoff(handoff, vi.fn(), 7));
    expect(screen.getByText(handoff.request)).toBeInTheDocument();

    auth.user = { id: 8 };
    view.rerender(<SystemScreen />);
    expect(screen.queryByText(handoff.request)).not.toBeInTheDocument();
    expect(screen.getByText("No carried request")).toBeInTheDocument();

    auth.user = null;
    view.rerender(<SystemScreen />);
    auth.user = { id: 7 };
    view.rerender(<SystemScreen />);
    expect(screen.queryByText(handoff.request)).not.toBeInTheDocument();
  });

  it("discards an unconsumed request when the workspace is signed out", () => {
    const handoff = preparePlannerHandoff({ id: "account-test-2", message: "Plan my private chemistry exam revision" });
    openPlannerHandoff(handoff, vi.fn(), 7);
    auth.user = null;
    render(<SystemScreen />);
    expect(consumePlannerHandoff(7)).toBeNull();
  });
});
