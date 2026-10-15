import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SylvieResponseActions from "@/app/components/system/SylvieResponseActions";
import { openPlannerHandoff } from "@/lib/ai/sylvie/planner-handoff-client";
import { preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

const navigate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigate }) }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("@/lib/ai/sylvie/planner-handoff-client", () => ({ openPlannerHandoff: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sylvie response actions", () => {
  const pendingAction = { token: "private-signed-confirmation", summary: "Move Biology review to Friday." };

  it("shows a human preview, confirms only once and keeps the token out of visible text", () => {
    const onConfirm = vi.fn();
    render(<SylvieResponseActions pendingAction={pendingAction} busy={false} onConfirm={onConfirm} />);
    expect(screen.getByText(pendingAction.summary)).toBeInTheDocument();
    expect(screen.queryByText(pendingAction.token)).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(pendingAction.token);
    expect(screen.queryByRole("button", { name: "Confirm change" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Confirmation sent.");
  });

  it("cancels locally without submitting a change", () => {
    const onConfirm = vi.fn();
    render(<SylvieResponseActions pendingAction={pendingAction} busy={false} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Change cancelled.");
  });

  it("holds controls while a reply is in progress", () => {
    render(<SylvieResponseActions pendingAction={pendingAction} busy onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Confirm change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("carries the formulated request into the existing Planner only on review", () => {
    const handoff = preparePlannerHandoff({ message: "Plan my physics exam revision. I can study an hour a day." });
    render(<SylvieResponseActions plannerHandoff={handoff} busy={false} onConfirm={vi.fn()} />);
    expect(openPlannerHandoff).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review in Planner" }));
    expect(openPlannerHandoff).toHaveBeenCalledWith(handoff, expect.any(Function), 7);
    const route = vi.mocked(openPlannerHandoff).mock.calls[0][1];
    route("/system?tab=planner");
    expect(navigate).toHaveBeenCalledWith("/system?tab=planner");
  });
});
