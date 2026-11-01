import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-transport";
import { clearClientCache } from "@/lib/client-data-cache";
import { workspaceRequest, WorkspaceRequestError, streamWorkspaceActivity } from "@/lib/planner/v2/client/transport";

vi.mock("@/lib/api-transport", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api-transport")>(),
  apiFetch: vi.fn(),
}));
const api = vi.mocked(apiFetch);
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { clearClientCache(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("live workspace reads", () => {
  it("delivers SSE text before completion rather than buffering the response body",async()=>{
    let wire!:ReadableStreamDefaultController<Uint8Array>;const body=new ReadableStream<Uint8Array>({start(controller){wire=controller;}});
    api.mockResolvedValueOnce(new Response(body,{headers:{"content-type":"text/event-stream"}}));const received=vi.fn(),controller=new AbortController();let finished=false;
    const reading=streamWorkspaceActivity("/workspace?activity=true&stream=true",controller.signal,received).finally(()=>{finished=true;});
    await vi.waitFor(()=>expect(api).toHaveBeenCalledTimes(1));
    wire.enqueue(new TextEncoder().encode('event: preview\ndata: {"text":"Check "}\n\n'));
    await vi.waitFor(()=>expect(received).toHaveBeenCalledWith("preview",{text:"Check "}));expect(finished).toBe(false);
    wire.enqueue(new TextEncoder().encode('event: preview\ndata: {"text":"Check prerequisites."}\n\n'));
    await vi.waitFor(()=>expect(received).toHaveBeenLastCalledWith("preview",{text:"Check prerequisites."}));expect(finished).toBe(false);
    wire.close();await reading;expect(finished).toBe(true);expect(api.mock.calls[0][1]).toMatchObject({method:"GET",cache:"no-store",credentials:"include"});
  });
  it("rejects old-session stream events after logout without delivering their text",async()=>{
    let wire!:ReadableStreamDefaultController<Uint8Array>;api.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({start(c){wire=c;}}),{headers:{"content-type":"text/event-stream"}}));
    const received=vi.fn(),reading=streamWorkspaceActivity("/workspace?stream=true",new AbortController().signal,received).catch(e=>e);
    await vi.waitFor(()=>expect(api).toHaveBeenCalledTimes(1));clearClientCache();
    wire.enqueue(new TextEncoder().encode('event: preview\ndata: {"text":"previous owner"}\n\n'));
    expect(await reading).toBeInstanceOf(WorkspaceRequestError);expect(received).not.toHaveBeenCalled();
  });
  it("allows a slow retained-history read to finish after the mutation deadline, with a finite read bound", async () => {
    vi.useFakeTimers();
    let finish!: (value: Response) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let settled = false;
    const reading = workspaceRequest("/workspace?planId=selected").finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(25000);
    expect(settled).toBe(false);
    finish(response({ retained: true }));
    expect(await reading).toEqual({ retained: true });
    api.mockReturnValueOnce(new Promise(() => {}));
    const hung = workspaceRequest("/workspace?planId=selected").catch(error => error);
    await vi.advanceTimersByTimeAsync(60001);
    expect(await hung).toMatchObject({ uncertain: false });
  });
  it("retains the shorter uncertain-acknowledgement deadline for mutations", async () => {
    vi.useFakeTimers();
    api.mockReturnValueOnce(new Promise(() => {}));
    const writing = workspaceRequest("/workspace", { action: "NOTE" }).catch(error => error);
    await vi.advanceTimersByTimeAsync(20001);
    expect(await writing).toMatchObject({ uncertain: true });
  });
  it("shares simultaneous reads and fetches fresh data after completion", async () => {
    let finish!: (value: Response) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = workspaceRequest("/workspace?planId=selected"), second = workspaceRequest("/workspace?planId=selected");
    await Promise.resolve();
    expect(api).toHaveBeenCalledTimes(1);
    finish(response({ stage: "RESEARCH" }));
    expect(await Promise.all([first, second])).toEqual([{ stage: "RESEARCH" }, { stage: "RESEARCH" }]);
    api.mockResolvedValueOnce(response({ stage: "STRATEGY" }));
    expect(await workspaceRequest("/workspace?planId=selected")).toEqual({ stage: "STRATEGY" });
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("never returns an old account's in-flight response after logout", async () => {
    let finish!: (value: Response) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const old = workspaceRequest("/workspace").catch(error => error);
    await Promise.resolve(); clearClientCache();
    api.mockResolvedValueOnce(response({ owner: "next" }));
    expect(await workspaceRequest("/workspace")).toEqual({ owner: "next" });
    finish(response({ owner: "previous" }));
    expect(await old).toBeInstanceOf(WorkspaceRequestError);
  });
  it("invalidates a read crossing a mutation instead of painting the older snapshot", async () => {
    let finish!: (value: Response) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const old = workspaceRequest("/workspace?planId=selected").catch(error => error);
    await Promise.resolve(); api.mockResolvedValueOnce(response({ accepted: true }));
    await workspaceRequest("/workspace", { action: "NOTE" });
    finish(response({ version: "before mutation" }));
    expect(await old).toBeInstanceOf(WorkspaceRequestError);
    api.mockResolvedValueOnce(response({ version: "after mutation" }));
    expect(await workspaceRequest("/workspace?planId=selected")).toEqual({ version: "after mutation" });
  });
  it("preserves structured errors and does not cache a failed response", async () => {
    api.mockResolvedValueOnce(response({ error: { code: "UNAUTHORIZED" } }, 401));
    await expect(workspaceRequest("/workspace")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    api.mockResolvedValueOnce(response({ ready: true }));
    expect(await workspaceRequest("/workspace")).toEqual({ ready: true });
  });
});
