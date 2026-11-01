import React from "react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import StudentPlannerScreen from "@/app/components/planner/student/StudentPlannerScreen";
import { workspaceRequest } from "@/lib/planner/v2/client/transport";
const nav=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>nav,usePathname:()=>"/planner"}));
vi.mock("next/link",()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=><a href={href} {...props}>{children}</a>}));
vi.mock("@/app/components/AuthProvider",()=>({useAuth:()=>({user:{id:12}})}));
vi.mock("@/lib/planner/v2/client/transport",()=>({workspaceRequest:vi.fn()}));
vi.mock("@/app/components/planner/student/StudentPlannerEntry",()=>({default:({initialPlanId,onPlanSelected,onExit}:{initialPlanId?:string;onPlanSelected:(id:string)=>void;onExit:()=>void})=><><p>Owned selection {initialPlanId}</p><button onClick={()=>onPlanSelected("00000002-0000-4000-8000-000000000000")}>Select another goal</button><button onClick={onExit}>Classic</button></>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("canonical student Planner route",()=>{
 it("opens the exact opaque route selection and navigates to canonical saved-plan URLs",async()=>{vi.mocked(workspaceRequest).mockResolvedValue({today:"2026-10-29",timezone:"UTC",restDays:[],subjects:[],studentWorkspace:{enabled:true}});render(<StudentPlannerScreen initialPlanId="00000001-0000-4000-8000-000000000000"/>);expect(await screen.findByText(/Owned selection 00000001/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Select another goal"}));expect(nav.replace).toHaveBeenCalledWith("/planner/00000002-0000-4000-8000-000000000000");fireEvent.click(screen.getByRole("button",{name:"Classic"}));expect(nav.push).toHaveBeenCalledWith("/system?tab=planner");});
 it("does not mount or activate unfinished planning when the explicit feature capability is absent",async()=>{vi.mocked(workspaceRequest).mockResolvedValue({today:"2026-10-29",timezone:"UTC",restDays:[],subjects:[]});render(<StudentPlannerScreen/>);expect(await screen.findByRole("heading",{name:"Planner preview is unavailable"})).toBeInTheDocument();expect(screen.queryByText(/Owned selection/)).not.toBeInTheDocument();expect(screen.getByRole("link",{name:"Back to Classic Planner"})).toHaveAttribute("href","/system?tab=planner");});
 it("shows a recoverable capability error without a fabricated ready workspace",async()=>{vi.mocked(workspaceRequest).mockRejectedValueOnce(new Error("Your session expired. Sign in again.")).mockResolvedValueOnce({today:"2026-10-29",timezone:"UTC",restDays:[],subjects:[],studentWorkspace:{enabled:true}});render(<StudentPlannerScreen/>);expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired");fireEvent.click(screen.getByRole("button",{name:"Check again"}));expect(await screen.findByText(/Owned selection/)).toBeInTheDocument();});
});
