import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StudentPlannerEntry from "@/app/components/planner/student/StudentPlannerEntry";
const auth=vi.hoisted(()=>({id:1,refreshStats:vi.fn(async()=>{})}));
vi.mock("@/app/components/AuthProvider",()=>({useAuth:()=>({user:{id:auth.id},refreshStats:auth.refreshStats})}));
vi.mock("@/app/components/planner/student/StudentPlannerWorkspace",()=>({default:function Workspace({onApplied}:{onApplied:()=>void}){const [count,setCount]=useState(0);return <button onClick={()=>{setCount(n=>n+1);onApplied();}}>Confirmed {count}</button>;}}));
const capabilities={timezone:"UTC",today:"2026-10-29",restDays:[],subjects:[]};
afterEach(()=>{cleanup();auth.id=1;vi.clearAllMocks();});
describe("gated student authentication bridge",()=>{
 it("refreshes existing account and quota owners only after acknowledged Apply",()=>{const quota=vi.fn();render(<StudentPlannerEntry capabilities={capabilities} onExit={()=>{}} onQuotaRefresh={quota}/>);expect(quota).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Confirmed 0"}));expect(quota).toHaveBeenCalledOnce();expect(auth.refreshStats).toHaveBeenCalledOnce();});
 it("discards the previous student's workspace state when account identity changes",()=>{const props={capabilities,onExit:()=>{},onQuotaRefresh:()=>{}};const {rerender}=render(<StudentPlannerEntry {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Confirmed 0"}));auth.id=2;rerender(<StudentPlannerEntry {...props}/>);expect(screen.getByRole("button",{name:"Confirmed 0"})).toBeInTheDocument();});
 it("reopens the exact route-selected plan instead of retaining another plan's local state",()=>{const props={capabilities,onExit:()=>{},onQuotaRefresh:()=>{}};const {rerender}=render(<StudentPlannerEntry {...props} initialPlanId="first"/>);fireEvent.click(screen.getByRole("button",{name:"Confirmed 0"}));rerender(<StudentPlannerEntry {...props} initialPlanId="second"/>);expect(screen.getByRole("button",{name:"Confirmed 0"})).toBeInTheDocument();});

});
