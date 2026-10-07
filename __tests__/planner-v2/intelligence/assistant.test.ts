// @vitest-environment node
import { describe,it,expect } from "vitest";
import { validateAssistantPass } from "@/lib/planner/v2/intelligence/assistant";
import { intentFixture } from "../contracts/fixtures";
const plans=()=>[{planRef:"plan_1",intent:intentFixture()}];
const question=(field:string,basis="MISSING",evidenceRefs:string[]=[])=>({pass:"RESPONSE",response:{kind:"QUESTION",message:"A consequential uncertainty",questions:["Which facts apply?"]},questions:[{question:"Which facts apply?",field,consequence:"This changes the assessed work",basis,evidenceRefs}]});
describe("bounded assistant reasoning",()=>{
  it("accepts advice without an action or clarification ritual",()=>expect(validateAssistantPass({pass:"RESPONSE",response:{kind:"ANSWER",message:"Compare the two methods"},questions:[]},plans(),false).pass).toBe("RESPONSE"));
  it("rejects questions about accepted outcome, scope and deadline",()=>{for(const field of ["outcome","scope","deadline"])expect(()=>validateAssistantPass(question(field),plans(),false)).toThrow("already accepted");});
  it("allows only consequential missing or anchored contradictory questions",()=>{expect(validateAssistantPass(question("component"),plans(),false).pass).toBe("RESPONSE");expect(()=>validateAssistantPass(question("deadline","CONTRADICTORY"),plans(),false)).toThrow();expect(validateAssistantPass(question("deadline","CONTRADICTORY",["current_message"]),plans(),false).pass).toBe("RESPONSE");expect(()=>validateAssistantPass(question("grades"),plans(),false)).toThrow();});
  it("does not treat known availability as missing",()=>expect(()=>validateAssistantPass(question("availability"),plans(),false,true)).toThrow());
  it("fences supplemental lookup to one round and selected local Plans",()=>{expect(validateAssistantPass({pass:"LOOKUP",requests:[{planRef:"plan_1",kind:"SUBJECT_DETAILS"}]},plans(),false).pass).toBe("LOOKUP");expect(()=>validateAssistantPass({pass:"LOOKUP",requests:[{planRef:"plan_1",kind:"SUBJECT_DETAILS"}]},plans(),true)).toThrow();expect(()=>validateAssistantPass({pass:"LOOKUP",requests:[{planRef:"foreign",kind:"PRIOR_DECISIONS"}]},plans(),false)).toThrow();});
  it("rejects invented target authorization and verified evidence",()=>{expect(()=>validateAssistantPass({pass:"RESPONSE",response:{kind:"PROPOSAL",message:"Prepare",change:"Review",planRefs:["foreign"],researchRequested:true},questions:[]},plans(),false)).toThrow();expect(()=>validateAssistantPass({pass:"RESPONSE",response:{kind:"ANSWER",message:"Done"},questions:[],intentPatch:{research:{verified:true}}},plans(),false)).toThrow();});
  it("requires every server-selected target in a joint proposal",()=>expect(()=>validateAssistantPass({pass:"RESPONSE",response:{kind:"PROPOSAL",message:"Prepare",change:"Review",planRefs:["plan_1"],researchRequested:false},questions:[]},[...plans(),{planRef:"plan_2",intent:intentFixture()}],false)).toThrow());
});
