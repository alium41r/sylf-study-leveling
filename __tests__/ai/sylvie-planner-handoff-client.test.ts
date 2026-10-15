import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { claimPlannerHandoff, consumePlannerHandoff, openPlannerHandoff, PLANNER_HANDOFF_EVENT } from "@/lib/ai/sylvie/planner-handoff-client";

afterEach(() => { vi.useRealTimers(); window.history.replaceState({}, "", "/"); });

describe("Review in Planner navigation", () => {
  it("keeps private request context in memory, scoped to the authenticated user and consumed once", () => {
    const handoff = preparePlannerHandoff({ id: "client-handoff-1", message: "Plan my study week" });
    const navigate = vi.fn();
    openPlannerHandoff(handoff, navigate, 42);
    expect(navigate).toHaveBeenCalledWith("/system?tab=planner");
    expect(consumePlannerHandoff(43)).toBeNull();
    openPlannerHandoff(handoff, navigate, 42);
    expect(consumePlannerHandoff(42)).toEqual(handoff);
    expect(consumePlannerHandoff(42)).toBeNull();
  });

  it("opens the Planner tab in the current workspace without a full navigation", () => {
    window.history.replaceState({}, "", "/system");
    const navigate = vi.fn();
    const receive = vi.fn();
    window.addEventListener(PLANNER_HANDOFF_EVENT, receive);
    const handoff = preparePlannerHandoff({ id: "client-handoff-2", message: "Plan my study week" });
    openPlannerHandoff(handoff, navigate, 42);
    window.removeEventListener(PLANNER_HANDOFF_EVENT, receive);
    expect(receive).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(consumePlannerHandoff(42)).toEqual(handoff);
  });

  it("expires unconsumed context and prevents duplicate responsive submissions", () => {
    vi.useFakeTimers();
    const handoff = preparePlannerHandoff({ id: "client-handoff-3", message: "Plan my study week" });
    openPlannerHandoff(handoff, vi.fn(), 42);
    vi.advanceTimersByTime(5 * 60_000);
    expect(consumePlannerHandoff(42)).toBeNull();
    expect(claimPlannerHandoff(handoff.id)).toBe(true);
    expect(claimPlannerHandoff(handoff.id)).toBe(false);
  });
});
