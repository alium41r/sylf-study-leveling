// @vitest-environment node
import { afterEach,it,expect,vi } from "vitest";
import { braveSearch,serperSearch,fallbackSearchProvider } from "@/lib/planner/research/search/provider-runtime";
afterEach(()=>vi.unstubAllGlobals());
it("meters every search provider fallback before HTTP dispatch",async()=>{
  let charges=0;const dispatched:number[]=[];
  vi.stubGlobal("fetch",vi.fn(async()=>{dispatched.push(charges);return dispatched.length===1?new Response("unavailable",{status:503}):new Response(JSON.stringify({organic:[{link:"https://example.test/source",title:"Source"}]}));}));
  const results=await fallbackSearchProvider(braveSearch("fixture"),serperSearch("fixture")).search({query:"assessment",limit:1,beforeRequest:async()=>{charges++;}});
  expect(dispatched).toEqual([1,2]);expect(results[0].provider).toBe("serper");
});
it("rejects oversized declared and streamed search payloads",async()=>{
  for(const headers of [new Headers({"content-length":String(2*1024*1024)}),new Headers()]) {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("x".repeat(1024*1024+1),{headers})));
    await expect(braveSearch("fixture").search({query:"assessment",limit:1})).rejects.toThrow("SEARCH_BAD_RESPONSE");
  }
});
it("does not dispatch or fall back after cancellation or durable admission failure",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const signal=AbortSignal.abort();
  const provider=fallbackSearchProvider(braveSearch("fixture"),serperSearch("fixture"));
  await expect(provider.search({query:"assessment",limit:1,signal})).rejects.toThrow("SEARCH_TIMEOUT");
  await expect(provider.search({query:"assessment",limit:1,beforeRequest:async()=>{throw new Error("durable budget exhausted");}})).rejects.toThrow("durable budget exhausted");
  expect(fetch).not.toHaveBeenCalled();
});
