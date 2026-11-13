import React from "react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,act,render,screen,waitFor } from "@testing-library/react";
import PlanningActivity from "@/app/components/planner/student/PlanningActivity";
import { workspaceRequest,streamWorkspaceActivity } from "@/lib/planner/v2/client/transport";
import type { PlannerActivity } from "@/lib/planner/v2/client/workspace";
vi.mock("@/lib/planner/v2/client/transport",()=>({workspaceRequest:vi.fn(),streamWorkspaceActivity:vi.fn()}));
const request=vi.mocked(workspaceRequest),stream=vi.mocked(streamWorkspaceActivity);
let emit:(event:string,data:unknown)=>void;
beforeEach(()=>{request.mockReset();stream.mockReset();stream.mockImplementation(async(_path,signal,onEvent)=>{emit=onEvent;onEvent("activity",base);return new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));});});
const base:PlannerActivity={attemptId:"attempt",state:"RUNNING",calls:[{id:"call",label:"Writing your study strategy",state:"WORKING",startedAt:"2026-10-30T01:00:00Z",reasoning:{text:"Check the prerequisites before practice.",characters:40,recorded:true,complete:false,clipped:false,redacted:false}}],research:[{id:"read",callId:"call",label:"Read",detail:"Actual mathematics source",reason:"It contains the worked examples needed for this goal.",working:false}],output:null};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("actual Planner live activity",()=>{
  it("counts source reads without labelling questions or research proposals as reads",async()=>{
    request.mockResolvedValue({...base,state:"NEEDS_DECISION",research:[{...base.research[0],label:"Ask"},{...base.research[0],id:"proposal",label:"Research proposal"}]});
    render(<PlanningActivity planId="plan" attemptId="attempt" running={false}/>);
    await screen.findByText(/Research proposal/);
    expect(screen.queryByText(/^[0-9]+ read$/)).not.toBeInTheDocument();
  });
  it("folds completed reasoning away while keeping the active block open and history inspectable",async()=>{
    const view=render(<PlanningActivity planId="plan" attemptId="attempt" running/>);
    const summary=await screen.findByText(/Writing your study strategy/);
    expect(summary.closest("details")).toHaveAttribute("open");
    const completed={...base,state:"SUCCEEDED" as const,calls:[{...base.calls[0],state:"RECEIVED" as const}]};
    request.mockResolvedValue(completed);
    act(()=>emit("activity",completed));
    await waitFor(()=>expect(summary.closest("details")).not.toHaveAttribute("open"));
    view.rerender(<PlanningActivity planId="plan" attemptId="attempt" running={false}/>);
    await waitFor(()=>expect(screen.getByText("Completed").closest("details")).not.toHaveAttribute("open"));
    fireEvent.click(screen.getByText("Completed").closest("summary")!);
    await waitFor(()=>expect(screen.getByText("Completed").closest("details")).toHaveAttribute("open"));
    expect(request.mock.calls.every(([,body])=>body===undefined)).toBe(true);
  });
  it("shows only received activity and text, using read-only requests through subsequent updates",async()=>{
    request.mockResolvedValue({...base,output:{text:"The actual streamed strategy begins here.",receivedCharacters:39,clipped:false,updatedAt:base.calls[0].startedAt,state:"WRITING"}});
    render(<PlanningActivity planId="plan" attemptId="attempt" running/>);
    expect(await screen.findByText(/Actual mathematics source/)).toBeInTheDocument();
    expect(screen.getAllByText("Check the prerequisites before practice.").length).toBeGreaterThan(0);expect(screen.queryByText("The actual streamed strategy begins here.")).not.toBeInTheDocument();
    act(()=>emit("preview",{attemptId:"attempt",reasoning:{...base.calls[0].reasoning!,callId:"call",text:"Check the prerequisites before practice. Then test."},output:{text:"The actual streamed strategy begins here.",receivedCharacters:39,clipped:false,updatedAt:base.calls[0].startedAt,state:"WRITING"}}));expect(await screen.findByText("The actual streamed strategy begins here.")).toBeInTheDocument();
    expect(screen.getAllByText("Check the prerequisites before practice. Then test.").length).toBeGreaterThan(0);
    expect(stream.mock.calls[0][0]).toContain("stream=true");
    expect(request.mock.calls.every(([path,body])=>path.includes("activity=true")&&body===undefined)).toBe(true);
    expect(screen.queryByText(/DeepSeek-provided reasoning/)).not.toBeInTheDocument();
  });
  it("expands a completed block to load the full recorded provider reasoning without dispatching",async()=>{
    const full={text:"The full provider reasoning follows its accepted constraints exactly.",characters:69,recorded:true,complete:true,clipped:false,redacted:false};
    request.mockImplementation(async path=>path.includes("reasoningCallId=")?full:{...base,state:"SUCCEEDED",calls:[{...base.calls[0],state:"RECEIVED",reasoning:{...base.calls[0].reasoning!,complete:true,clipped:true}}]});
    render(<PlanningActivity planId="plan" attemptId="attempt" running={false}/>);
    await screen.findByText(/Writing your study strategy/);fireEvent.click(screen.getByText(/Writing your study strategy/).closest("summary")!);
    expect((await screen.findAllByText(full.text)).length).toBeGreaterThan(0);expect(request.mock.calls.some(([path])=>path.includes("reasoningCallId=call"))).toBe(true);
    expect(request.mock.calls.every(([,body])=>body===undefined)).toBe(true);
  });
  it("reports lost updates and aborts the read when leaving without changing the planning job",async()=>{
    stream.mockRejectedValue(new Error("unavailable"));request.mockRejectedValue(new Error("unavailable"));const view=render(<PlanningActivity planId="plan" attemptId="attempt" running/>);
    expect(await screen.findByText(/Live updates paused/)).toBeInTheDocument();
    const signal=stream.mock.calls[0][1];view.unmount();expect(signal?.aborted).toBe(true);
    await waitFor(()=>expect(request.mock.calls.every(([,body])=>body===undefined)).toBe(true));
  });
  it("renders non-thinking 0-character steps without an empty chevron and folds completed Strategy draft away",async()=>{
    const nonThinkingStep={id:"research_call",label:"Understanding your goal",state:"RECEIVED" as const,startedAt:"2026-10-30T00:59:00Z",reasoning:{text:"",characters:0,recorded:true,complete:true,clipped:false,redacted:false}};
    render(<PlanningActivity planId="plan" attemptId="attempt" running/>);
    act(()=>emit("activity",{...base,calls:[nonThinkingStep,base.calls[0]],output:{text:"Draft strategy text.",receivedCharacters:20,clipped:false,updatedAt:base.calls[0].startedAt,state:"WRITING"}}));
    const plainStep=await screen.findByText("Understanding your goal");
    expect(plainStep.closest("summary")).toBeNull();
    const strategySummary=await screen.findByText((_,el)=>el?.tagName==="SUMMARY"&&Boolean(el.textContent?.includes("Strategy")));
    expect(strategySummary).toHaveTextContent(/writing…/);
    expect(strategySummary.closest("details")).toHaveAttribute("open");
    act(()=>emit("activity",{...base,calls:[nonThinkingStep,{...base.calls[0],state:"RECEIVED"}],output:{text:"Draft strategy text.",receivedCharacters:20,clipped:false,updatedAt:base.calls[0].startedAt,state:"RECEIVED"}}));
    await waitFor(()=>{
      expect(strategySummary).toHaveTextContent(/done/);
      expect(strategySummary.closest("details")).not.toHaveAttribute("open");
    });
  });
});
