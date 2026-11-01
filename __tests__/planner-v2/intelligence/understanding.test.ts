import { afterEach, describe, expect, it, vi } from "vitest";
import { deepseekSearch, selectSearchProvider, observeSearchProvider } from "@/lib/planner/research/search/provider-runtime";
import { UnderstandingActionSchema, parseUnderstandingAction, understandingInstructions, understandingActionContract, UnderstandingRunSchema } from "@/lib/planner/v2/intelligence/schemas/understanding";
import { ResearchToolLimitsSchema, ResourcePolicySchema } from "@/lib/planner/v2/intelligence/foundation/resources";
import { offlineResourcePolicy } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import { sourceAuthority } from "@/lib/planner/v2/intelligence/research-verification";
import { readResearchSource } from "@/lib/planner/v2/intelligence/research-reader";
import { pdfFixture } from "./research-fixtures";
import { id, intentFixture } from "../contracts/fixtures";
import { createHash } from "node:crypto";

afterEach(()=>{vi.unstubAllGlobals();});
describe("AI-first research contracts and official DeepSeek Search",()=>{
  it("pins explicit Calendar interpretation only for new research inputs, retaining historical prompt bytes",()=>{
    const input=UnderstandingRunSchema.shape.input.parse({verificationVersion:3,acceptedRequest:{},plans:[{planRef:"plan_1",intent:intentFixture()}],context:{},contextDigests:[],documents:[]});
    const historical=understandingInstructions({input}),current=understandingInstructions({input:{...input,calendarSemanticsVersion:1}});
    for(const role of ["research","verification","synthesis"] as const){expect(historical[role]).not.toContain("Calendar semantics:");expect(current[role]).toContain("Monday=0 through Sunday=6");expect(current[role]).toContain("availableMinutes is NET");}
    expect(understandingInstructions({input})).toEqual(historical);
  });
  it("pins the focused task and supplies the actual identity-anchor contract without changing historical prompts",()=>{
    const input=UnderstandingRunSchema.shape.input.parse({verificationVersion:3,acceptedRequest:{},plans:[{planRef:"plan_1",intent:intentFixture()}],context:{},contextDigests:[],documents:[]});
    const old=understandingInstructions({input});const current=understandingInstructions({input:{...input,researchProtocolVersion:1}});
    expect(old.research).toContain("Educational quality takes priority over economy");
    expect(current.research).toContain("Do not design lessons");expect(current.research).toContain("COMPLETE promptly");
    expect(current.research).not.toContain("Investigate as deeply as the task needs");
    const contract=understandingActionContract();const branches=contract.oneOf as {properties:{action:{const:string};batches?:{items:{properties:{extraction:{properties:{identities:{items:{properties:{fields:{items:{required:string[]}}}}};answer:{maxLength:number}}}}}}}}[];
    const complete=branches.find(b=>b.properties.action.const==="COMPLETE")!;
    expect(complete.properties.batches!.items.properties.extraction.properties.identities.items.properties.fields.items.required).toContain("anchor");
    expect(complete.properties.batches!.items.properties.extraction.properties.answer.maxLength).toBe(4000);
    expect(understandingInstructions({input})).toEqual(old);
  });
  it("retains original source bytes while explicitly marking unrepresentable extracted glyphs",async()=>{
    const bytes=Buffer.from("Integral\u0000 x² 🧠"),base={sourceId:"source_1",location:{kind:"PUBLIC_URL" as const,finalUrl:"https://example.edu/math.txt"},title:"Mathematics",bytes,mime:"text/plain",assessment:{},remainingPages:40,remainingCharacters:72000,retrievedAt:new Date().toISOString()};
    const read=await readResearchSource(base);
    expect(read.sections[0].text).toBe("Integral� x² 🧠");expect(read.source.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(read.source.extraction.status).toBe("PARTIAL");expect(read.source.extraction.gaps.join(" ")).toContain("U+FFFD");
    const clipped=await readResearchSource({...base,bytes:Buffer.from("A🧠B"),remainingCharacters:2});
    expect(clipped.sections[0].text).toBe("A�");expect(clipped.sections[0].text.isWellFormed()).toBe(true);expect(clipped.source.extraction.status).toBe("PARTIAL");
    const intact=await readResearchSource({...base,bytes:Buffer.from("A🧠B")});expect(intact.sections[0].text).toBe("A🧠B");expect(intact.source.extraction.status).toBe("COMPLETE_RELEVANT_SECTIONS");
  });
  it("requires one actual action and exact supplied reference identities without unwrapping or rebinding",()=>{
    const run:Parameters<typeof parseUnderstandingAction>[1]={input:{actionRecoveryVersion:1,acceptedRequest:{},plans:[{planRef:"plan_1",intent:intentFixture()}],context:{},contextDigests:[],documents:[]},candidates:[{ref:"candidate_1",url:"https://example.edu",title:"Accepted candidate",provider:"deepseek",query:"math"}],sources:[],answers:[]};
    const read={action:"READ",candidateRef:"candidate_1",reason:"Read the actual supplied candidate"};
    expect(parseUnderstandingAction(read,run)).toEqual(read);
    expect(()=>parseUnderstandingAction({actions:[read]},run)).toThrow();
    expect(()=>parseUnderstandingAction({...read,candidateRef:"plan_2:candidate_1"},run)).toThrow();
    expect(()=>parseUnderstandingAction({action:"READ_UPLOAD",uploadRef:"upload_1",reason:"Invented selection"},run)).toThrow();
    const summary={goals:"Goal",background:"Unknown",strengths:"Unknown",weaknesses:"Unknown",resources:"Unknown",constraints:"Accepted",preferences:"Accepted",uncertainty:"Disclosed"};
    expect(()=>parseUnderstandingAction({action:"COMPLETE",summary,batches:[{planRef:"foreign_plan",sourceRefs:[],extraction:{identities:[],claims:[],completeSourceIds:[],gaps:[],answer:"No source"}}],unresolved:[]},run)).toThrow();
    const {actionRecoveryVersion:unused,...historical}=run.input;void unused;
    expect(parseUnderstandingAction({...read,candidateRef:"unavailable"},{...run,input:historical})).toMatchObject({candidateRef:"unavailable"});
  });
  it("shares chat credential sanitation so invisible characters cannot fail HTTP construction after accounting dispatch",async()=>{
    const fetch=vi.fn(async(url:string,init:RequestInit)=>{
      expect(()=>new Request(url,init)).not.toThrow();
      return new Response(JSON.stringify({results:[{url:"https://example.edu/math",title:"Math",snippet:"Practice"}]}));
    });vi.stubGlobal("fetch",fetch);
    const provider=selectSearchProvider({DEEPSEEK_API_KEY:"  scripted\u200b-key  "},{preferDeepSeek:true})!;
    await provider.search({query:"integration practice",limit:4});
    expect(fetch.mock.calls[0][1].headers).toMatchObject({Authorization:"Bearer scripted-key"});
    const before=vi.fn(async()=>{});
    await expect(deepseekSearch("\u200b").search({query:"integration",limit:4,beforeRequest:before})).rejects.toMatchObject({code:"SEARCH_UNAUTHORIZED"});
    expect(before).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses the official raw endpoint with bearer authentication and no trusted provider content",async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({results:[{url:"https://example.edu/syllabus",title:"Syllabus",snippet:"Discovery hint",summary:"Not verified evidence",content:"Not authoritative source bytes",authority:4,rerank_score:3}]})));vi.stubGlobal("fetch",fetch);
    const result=await deepseekSearch("scripted-key").search({query:"physics site:example.edu",limit:10});
    expect(fetch.mock.calls[0]).toMatchObject(["https://api.deepseek.com/v1/tools/search",{method:"POST",headers:{Authorization:"Bearer scripted-key"},body:JSON.stringify({query:"physics site:example.edu",count:10,need_content:false})}]);
    expect(result).toEqual([{url:"https://example.edu/syllabus",title:"Syllabus",snippet:"Discovery hint",provider:"deepseek",rank:1}]);
    expect(sourceAuthority(result[0].url,{institution:"Cambridge"}).authority).toBe("SECONDARY");
  });
  it("prefers DeepSeek for explicit v2 composition while retaining v1 defaults and the previous backend as fallback",()=>{
    const env={DEEPSEEK_API_KEY:"scripted",SERPER_API_KEY:"old"};
    expect(selectSearchProvider(env)?.id).toBe("serper");expect(selectSearchProvider(env,{preferDeepSeek:true})?.id).toBe("deepseek");
    expect(selectSearchProvider({...env,SEARCH_PROVIDER:"serper"},{preferDeepSeek:true})?.id).toBe("deepseek");
    expect(selectSearchProvider({...env,SEARCH_PROVIDER:"serper"})?.id).toBe("serper");
    expect(selectSearchProvider({SERPER_API_KEY:"old"},{preferDeepSeek:true})?.id).toBe("serper");
  });
  it("accounts each actual fallback request and retains the provider that answered",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response("",{status:429})).mockResolvedValueOnce(new Response(JSON.stringify({organic:[{link:"https://example.edu/course",title:"Actual fallback",snippet:"Hint"}]})));vi.stubGlobal("fetch",fetch);
    const before=vi.fn(async()=>{}),after=vi.fn(async()=>{});
    const provider=selectSearchProvider({DEEPSEEK_API_KEY:"scripted",SERPER_API_KEY:"old"},{preferDeepSeek:true})!;
    const result=await provider.search({query:"physics",limit:8,beforeRequest:before,afterRequest:after});expect(result[0].provider).toBe("serper");
    expect(before.mock.calls).toEqual([["deepseek"],["serper"]]);expect(after.mock.calls).toEqual([[{provider:"deepseek",outcome:"REJECTED"}],[{provider:"serper",outcome:"RESULT"}]]);
  });
  it("does not turn empty search results into paid fallback or verified evidence",async()=>{
    const fetch=vi.fn(async()=>new Response('{"results":[]}'));vi.stubGlobal("fetch",fetch);const after=vi.fn(async()=>{});
    await expect(selectSearchProvider({DEEPSEEK_API_KEY:"scripted",SERPER_API_KEY:"old"},{preferDeepSeek:true})!.search({query:"physics",limit:8,afterRequest:after})).rejects.toMatchObject({code:"SEARCH_ZERO_RESULTS"});
    expect(fetch).toHaveBeenCalledTimes(1);expect(after.mock.calls).toEqual([[{provider:"deepseek",outcome:"EMPTY"}]]);
  });
  it("respects Unicode query limits without silent truncation or spending a rejected query",async()=>{
    const before=vi.fn(async()=>{}),fetch=vi.fn(async()=>new Response('{"results":[]}'));vi.stubGlobal("fetch",fetch);
    await expect(observeSearchProvider(deepseekSearch("scripted")).search({query:"🧠".repeat(129),limit:8,beforeRequest:before})).rejects.toMatchObject({code:"SEARCH_BAD_RESPONSE"});expect(before).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    await expect(deepseekSearch("scripted").search({query:"🧠".repeat(128),limit:8})).rejects.toMatchObject({code:"SEARCH_ZERO_RESULTS"});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("allows a meaningful coherent question group beyond old interview/follow-up ceilings",()=>{
    const summary={goals:"goal",background:"background",strengths:"unknown",weaknesses:"unknown",resources:"known",constraints:"known",preferences:"known",uncertainty:"disclosed"};
    expect(UnderstandingActionSchema.parse({action:"CLARIFY",summary,questions:Array.from({length:8},(_,i)=>({ref:`question_${i}`,topic:`topic_${i}`,question:"Which material applies?",consequence:"Changes the accepted assessment subset"}))}).action).toBe("CLARIFY");
    expect(UnderstandingActionSchema.safeParse({action:"READ",url:"https://invented.edu",reason:"Read invented URL"}).success).toBe(false);
  });
  it("requires explicit finite tool authorization without changing old resource policies",()=>{
    const policy=offlineResourcePolicy("a".repeat(64),id(44));expect(ResourcePolicySchema.parse(policy).researchTools).toBeUndefined();
    const tools={researchQueries:200,fetchAttempts:400,selectedSourceCharacters:2000000,extractedPages:2000,ocrPages:100,followUps:1000};
    expect(ResourcePolicySchema.parse({...policy,researchTools:tools}).researchTools).toEqual(tools);
    expect(ResearchToolLimitsSchema.safeParse({...tools,researchQueries:Infinity}).success).toBe(false);
  });
  it("can revisit original PDF pages and later plain-text material while retaining coverage gaps",async()=>{
    const base={sourceId:"source_1",location:{kind:"PUBLIC_URL" as const,finalUrl:"https://example.edu/actual.pdf"},title:"Course",assessment:{},remainingPages:100,remainingCharacters:72000,retrievedAt:"2026-10-26T10:00:00Z"};
    const read=await readResearchSource({...base,bytes:pdfFixture(),mime:"application/pdf",pages:[70]});expect(read.source.extraction.selectedPages).toEqual([70]);expect(read.sections[0].text).toContain("Mathematics 40 percent");expect(read.source.extraction.status).toBe("PARTIAL");
    const text=await readResearchSource({...base,bytes:Buffer.from("x".repeat(80000)+"Late assignment requirements"),mime:"text/plain",characterWindow:{start:80000,end:80028}});
    expect(text.sections[0].text).toBe("Late assignment requirements");expect(text.source.extraction.gaps.length).toBeGreaterThan(0);
  });
});
