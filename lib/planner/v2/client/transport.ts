"use client";
import { apiFetch, fetchWithTimeout, consumeResponseWithTimeout } from "@/lib/api-transport";
import { shareClientRead, invalidateClientCache, getClientSessionEpoch } from "@/lib/client-data-cache";
export class WorkspaceRequestError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
    readonly code?: string
  ) {
    super(message);
  }
}
export async function workspaceRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method?: "POST" | "PATCH"
): Promise<T> {
  if (body === undefined && !signal) {
    try { return await shareClientRead(`planner-read:/api/planner${path}`, () => performWorkspaceRequest<T>(path)); }
    catch (error) {
      if (error instanceof WorkspaceRequestError) throw error;
      throw new WorkspaceRequestError("Could not refresh your Planner. Check your connection and try again.");
    }
  }
  if (body !== undefined) invalidateClientCache("/api/planner");
  try { return await performWorkspaceRequest<T>(path, body, signal, method); }
  finally { if (body !== undefined) invalidateClientCache("/api/planner"); }
}
async function performWorkspaceRequest<T>(path: string, body?: unknown, signal?: AbortSignal, method?: "POST" | "PATCH"): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      (input, init) => apiFetch(String(input), init),
      `/api/planner${path}`,
      {
        method: body === undefined ? "GET" : (method ?? "POST"),
        credentials: "include",
        cache: "no-store",
        signal,
        headers: {
          "x-sylf-planner-contract": "2",
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(body === undefined
          ? {}
          : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      },
      // Retained artifact verification can outlast an ordinary mutation
      // acknowledgement. This read allowance grants no execution time/budget.
      body === undefined ? 60000 : 20000
    );
  } catch {
    throw new WorkspaceRequestError(
      body === undefined
        ? "Could not refresh your Planner. Check your connection and try again."
        : "The acknowledgement was lost. Reload the saved work or retry this same action; do not start another request.",
      body !== undefined
    );
  }
  let value;
  try { value = await response.json(); }
  catch { throw new WorkspaceRequestError("The acknowledgement could not be read. Refresh saved work before continuing.", body!==undefined); }
  if (!response.ok)
    throw new WorkspaceRequestError(
      value.detail?.message ??
        {
          UNAUTHORIZED: "Sign in again to open your Planner.",
          INVALID_REQUEST: "Check the plan details before continuing.",
          PLANNER_UNAVAILABLE:
            "Planner is unavailable. Your saved work has not been removed.",
        }[value.error?.code as string] ??
        "This action could not finish. Refresh the saved work and try again.",
      false,
      value.error?.code
    );
  return value as T;
}


/** Consume response frames immediately; workspaceRequest intentionally buffers
 * ordinary JSON and must never be used for this streaming channel. */
export async function streamWorkspaceActivity(path:string,signal:AbortSignal,onEvent:(event:string,data:unknown)=>void){
  const epoch=getClientSessionEpoch();
  const {readEventStream}=await import("../../../ai/sylvie/event-stream");
  return consumeResponseWithTimeout((url,init)=>apiFetch(String(url),init),`/api/planner${path}`,{
    method:"GET",credentials:"include",cache:"no-store",signal,headers:{"x-sylf-planner-contract":"2",Accept:"text/event-stream"},
  },65000,async(response,active)=>{
    if(!response.ok||!response.headers.get("content-type")?.includes("text/event-stream"))throw new WorkspaceRequestError("Live updates are unavailable.");
    await readEventStream(response,(event,data)=>{if(getClientSessionEpoch()!==epoch)throw new WorkspaceRequestError("The account session changed.");onEvent(event,JSON.parse(data));},active);
  });
}
