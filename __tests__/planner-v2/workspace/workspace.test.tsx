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
  reschedulePlannerCommitment,
} from "@/lib/planner/v2/client/transport";
import { studentFixture } from "./fixtures";
vi.mock("@/lib/planner/v2/client/transport", () => ({
  workspaceRequest: vi.fn(),
  reschedulePlannerCommitment: vi.fn(),
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
  window.sessionStorage.clear();
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
  it("keeps the spend control visible and requires renewed consent after changing it",async()=>{
    setup("DRAFT");await open();
    fireEvent.click(await screen.findByRole("button",{name:"New planning request"}));
    const spend=screen.getByLabelText("Maximum AI spend (USD)");
    expect(spend.closest("details")).toBeNull();
    expect(screen.getByText("AI settings & limits").closest("details")).not.toHaveAttribute("open");
    const begin=screen.getByRole("button",{name:"Authorize & begin"});
    expect(begin).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I authorize DeepSeek/));await waitFor(()=>expect(begin).toBeEnabled());
    fireEvent.change(spend,{target:{value:"0.50"}});expect(begin).toBeDisabled();
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"GENERATE"'))).toBe(false);
    fireEvent.click(screen.getByLabelText(/I authorize DeepSeek/));fireEvent.click(begin);
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/workspace",expect.objectContaining({action:"GENERATE",consent:true,spendingLimitUsd:0.5,profile:"student-preview-v3"})));
  });
  it.each(["DRAFT","CLARIFY"] as const)("gives an expired %s request a usable new-request path without retrying it",async mode=>{
    const view=setup(mode);view.attempt!.budget.executionDeadlineAt=new Date(Date.now()-1000).toISOString();
    const original=request.getMockImplementation()!;request.mockImplementation(async(path,body)=>{if(body&&JSON.stringify(body).includes('"CANCEL"')){view.attempt!.state="CANCELLED";return {};}return original(path,body);});
    await open();expect(await screen.findByText(/This request expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Continue saved journey"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Send answers & continue"})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"New planning request"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:"New planning request"}));
    await screen.findByRole("button",{name:"Authorize & begin"});
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"CANCEL"'))).toBe(mode==="CLARIFY");
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"CONTINUE"'))).toBe(false);
    expect(request.mock.calls.some(([,body])=>body&&JSON.stringify(body).includes('"GENERATE"'))).toBe(false);
  });
  it("places named overdue manual work through the existing Quest owner without starting AI", async () => {
    const view=setup("CLARIFY");view.research!.questions=[];
    view.capacityDecision={today:"2026-11-02",overdue:[{questId:2605,title:"Maths practice",date:"2026-10-30",remainingMinutes:30,planId:null,canReschedule:true}]};
    vi.mocked(reschedulePlannerCommitment).mockResolvedValueOnce();
    await open();
    const date=await screen.findByLabelText("New date for Maths practice");
    expect(date).toHaveAttribute("min","2026-11-02");
    fireEvent.change(date,{target:{value:"2026-11-03"}});
    fireEvent.click(screen.getByRole("button",{name:"Save task date"}));
    await waitFor(()=>expect(reschedulePlannerCommitment).toHaveBeenCalledWith(2605,"2026-11-03"));
    expect(request.mock.calls.some(([,body])=>body&&/GENERATE|CONTINUE/.test(JSON.stringify(body)))).toBe(false);
  });
  it("keeps protected work in its existing review flow instead of offering a direct date edit", async () => {
    const view=setup("CLARIFY");view.research!.questions=[];
    view.capacityDecision={today:"2026-11-02",overdue:[{questId:7,title:"Started work",date:"2026-10-30",remainingMinutes:30,planId:view.plan.planId,canReschedule:false}]};
    await open();
    expect(await screen.findByRole("link",{name:"Review this work"})).toHaveAttribute("href",`/planner/${view.plan.planId}`);
    expect(screen.queryByRole("button",{name:"Save task date"})).not.toBeInTheDocument();
  });
  it("keeps the open draft visible when its selected plan is clicked again", async () => {
    setup("DRAFT");
    await open();
    expect(await screen.findByText("Draft saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Physics preparation/ }));
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
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
  it("opens the generation dialog immediately on Continue without dispatching AI before explicit consent", async () => {
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
      target: { value: "CAIE Physics 9702 P2" },
    });
    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "Master AS Physics Paper 2 structured questions." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/workspace",
        expect.objectContaining({
          action: "CREATE",
          intent: expect.objectContaining({
            availability: expect.objectContaining({
              recoveryPercent: 0,
              dailyCeilingMinutes: [90, 90, 90, 90, 0, 90, 90],
            }),
            preferences: expect.objectContaining({
              preferredTimeboxMinutes: 45,
              maximumTimeboxMinutes: 90,
            }),
          }),
        })
      )
    );
    expect(await screen.findByRole("button", { name: "Authorize & begin" })).toBeDisabled();
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
      await screen.findByText("Draft saved")
    ).toBeInTheDocument();
    expect(screen.getByRole("list",{name:"Planning stages"}).querySelector('[aria-current="step"]')).toHaveTextContent("Review");
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

  it("preserves the Generate plan dialog across /planner -> /planner/[planId] remount when Continue is clicked", async () => {
    const view = studentFixture("DRAFT");
    request.mockImplementation(async (path, body) => {
      if (body && JSON.stringify(body).includes('"CREATE"'))
        return { planId: view.plan.planId };
      if (body) return {};
      return path.includes("planId")
        ? view
        : { plans: [], next: null, readiness };
    });
    let routedPlanId: string | null = null;
    const { unmount } = render(
      <StudentPlannerWorkspace
        capabilities={capabilities}
        onExit={() => {}}
        onApplied={() => {}}
        onPlanSelected={(id) => {
          routedPlanId = id;
        }}
      />
    );
    fireEvent.change(await screen.findByLabelText("Plan name"), {
      target: { value: "A-Level Physics Paper 2" },
    });
    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "Prepare structured AS Physics questions." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() => expect(routedPlanId).toBe(view.plan.planId));
    unmount();

    render(
      <StudentPlannerWorkspace
        capabilities={capabilities}
        initialPlanId={routedPlanId!}
        onExit={() => {}}
        onApplied={() => {}}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Generate plan" })
    ).toBeInTheDocument();
  });
});
