import React from "react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import { MobileRouteOutlet } from "@/mobile/src/components/MobileRouteOutlet";
import { NavigationProvider } from "@/mobile/src/adapters/navigation/NavigationContext";
vi.mock("next/navigation",async()=>await import("@/mobile/src/adapters/navigation/next-navigation"));
vi.mock("@/app/components/planner/student/StudentPlannerScreen",()=>({default:({initialPlanId}:{initialPlanId?:string})=><h1>Planner {initialPlanId??"new"}</h1>}));
afterEach(()=>{cleanup();window.location.hash="";});
describe("canonical mobile Planner navigation",()=>{
 it.each(["/planner","/planner/00000001-0000-4000-8000-000000000000"])("renders the shared screen for %s",async path=>{window.location.hash=`#${path}`;render(<NavigationProvider initialPath={path}><MobileRouteOutlet/></NavigationProvider>);expect(await screen.findByRole("heading",{name:path==="/planner"?"Planner new":"Planner 00000001-0000-4000-8000-000000000000"})).toBeInTheDocument();});
});
