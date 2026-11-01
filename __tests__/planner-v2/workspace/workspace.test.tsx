import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import StudentPlannerWorkspace from "@/app/components/planner/student/StudentPlannerWorkspace";
import {
  workspaceRequest,
  WorkspaceRequestError,
} from "@/lib/planner/v2/client/transport";
import { studentFixture } from "./fixtures";
vi.mock("@/lib/planner/v2/client/transport", () => ({
  workspaceRequest: vi.fn(),
  WorkspaceRequestError: class extends Error {
    constructor(
      message: string,
      readonly uncertain = false
    ) {
      super(message);
    }
  },
}));
const request = vi.mocked(workspaceRequest);
const capabilities = {
  timezone: "Asia/Karachi",
  today: "2026-10-29",
  restDays: [5],
  subjects: [],
};
const readiness = {
  enabled: true,
  ready: true,
  reason: null,
  profile: "student-preview-v1",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup(mode: Parameters<typeof studentFixture>[0]) {
  const view = studentFixture(mode);
  request.mockImplementation(async (path, body) =>
    body
      ? {}
      : path.includes("planId")
        ? view
        : { plans: [view.plan], next: null, readiness }
  );
  render(
    <StudentPlannerWorkspace
      capabilities={capabilities}
      onExit={() => {}}
      onApplied={() => {}}
    />
  );
  return view;
}
async function open() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Physics preparation/ })
  );
}
describe("Student Planner interaction", () => {
  it.each(["DRAFT","CLARIFY"] as const)("gives an expired %s request a usable new-request path without retrying it",async mode=>{
    const view=setup(mode);view.attempt!.budget.executionDeadlineAt=new Date(Date.now()-1000).toISOString();
    const original=request.getMockImplementation()!;request.mockImplementation(async(path,body)=>{if(body&&JSON.stringify(body).includes('"CANCEL"')){view.attempt!.state="CANCELLED";return {};}return original(path,body);});
    await open();expect(await screen.findByText(/This planning request has expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Continue saved journey"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Send answers & continue"})).not.toBeInTheDocument();
    if(mode==="CLARIFY"){
      expect(screen.getByRole("button",{name:"New planning request"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"Close expired request"}));
      await waitFor(()=>expect(screen.getByRole("button",{name:"New planning request"})).toBeEnabled());
    }else expect(screen.getByRole("button",{name:"New planning request"})).toBeEnabled();
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"CONTINUE"'))).toBe(false);
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"GENERATE"'))).toBe(false);
  });
  it("keeps the open draft visible when its selected plan is clicked again", async () => {
    setup("DRAFT");
    await open();
    expect(await screen.findByText("Your draft stays separate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Physics preparation/ }));
    expect(screen.getByText("Your draft stays separate")).toBeInTheDocument();
    expect(screen.queryByText("Opening your saved plan…")).not.toBeInTheDocument();
  });
  it("saves an explicitly accepted goal for free with the correct Friday rest mapping", async () => {
    request.mockImplementation(async (path, body) =>
      body
        ? { planId: "test-plan" }
        : path.includes("planId")
          ? studentFixture("DRAFT")
          : { plans: [], next: null, readiness }
    );
    render(
      <StudentPlannerWorkspace
        capabilities={capabilities}
        onExit={() => {}}
        onApplied={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "School chemistry" },
    });
    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "Prepare for my school mock." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save goal/ }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/workspace",
        expect.objectContaining({
          action: "CREATE",
          intent: expect.objectContaining({
            availability: expect.objectContaining({ restWeekdays: [4] }),
          }),
        })
      )
    );
    expect(
      request.mock.calls.filter(
        ([, body]) => body && JSON.stringify(body).includes('"GENERATE"')
      )
    ).toHaveLength(0);
  });
  it("shows an unapproved natural strategy and activities without exposing confirmation", async () => {
    setup("DRAFT");
    await open();
    expect(
      await screen.findByText("Your draft stays separate")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review & add plan" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Strategy" }));
    expect(
      screen.getByText(/Your goal is to explain and predict current/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Review" }));
    expect(
      screen.getByText(/Independent transfer has not been established/)
    ).toBeInTheDocument();
  });
  it("retains the exact displayed candidate and requires a second explicit action for atomic apply", async () => {
    const view = setup("READY");
    await open();
    fireEvent.click(
      await screen.findByRole("button", { name: /Review & add plan/ })
    );
    expect(
      request.mock.calls.some(([p, b]) => p.endsWith("/commit") && b)
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Confirm & add plan/ }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(`/${view.plan.planId}/commit`, {
        schemaVersion: 2,
        attemptId: view.attempt!.attemptId,
        changeSetId: view.changeSet!.changeSetId,
        acknowledgements: [],
      })
    );
  });
  it("answers the actual retained clarification with intent CAS instead of starting a fresh budget", async () => {
    const view = setup("CLARIFY");
    await open();
    fireEvent.change(await screen.findByLabelText(/Can you access/), {
      target: { value: "Yes, I have the packet." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send answers/ }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/workspace",
        expect.objectContaining({
          action: "CONTINUE",
          request: expect.objectContaining({
            parentAttemptId: view.attempt!.attemptId,
            expectedResearchDigest: view.research!.digest,
            answers: [
              { ref: "resource_access", text: "Yes, I have the packet." },
            ],
          }),
        })
      )
    );
  });
  it("shows durable progress and sends explicit cancellation rather than aborting only a browser request", async () => {
    const view = setup("RESEARCH");
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        `/${view.plan.planId}/operations/${view.attempt!.attemptId}`,
        { schemaVersion: 2, action: "CANCEL" }
      )
    );
  });
  it("retains the identical mutation after an uncertain acknowledgement and exposes recovery", async () => {
    setup("RESEARCH");
    await open();
    let rejected = false;
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (path, body, signal, method) => {
      if (body && !rejected) {
        rejected = true;
        throw new WorkspaceRequestError("Acknowledgement lost", true);
      }
      return original(path, body, signal, method);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry same action" })
    );
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([p, b]) => p.includes("/operations/") && b)
      ).toHaveLength(2)
    );
    const mutations = request.mock.calls.filter(
      ([p, b]) => p.includes("/operations/") && b
    );
    expect(mutations[1]).toEqual(mutations[0]);
  });

  it("labels an earlier translation when the newest strategy has not yet been translated", async () => {
    const view = setup("DRAFT");
    view.draft!.strategies.push({
      id: "new-strategy",
      version: 2,
      text: "A revised strategy still awaiting faithful translation.",
    });
    await open();
    expect(
      await screen.findByText(/These activities retain strategy version 1/)
    ).toBeInTheDocument();
  });
});
