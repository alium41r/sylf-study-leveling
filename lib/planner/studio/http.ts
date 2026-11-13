import "server-only";
// HTTP plumbing for the Planning Studio routes: authentication on every request (getSession checks the cookie or bearer session and its revocation),
// the feature switch, a bounded JSON body, and errors written for people. The body never reaches a log.
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
import { studioEnabled } from "./config";
import { StudioError } from "./store";
import { GatewayError } from "./gateway";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY = 64 * 1024;

export async function readStudioBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new StudioError(413, "PAYLOAD_TOO_LARGE", "That request is too large.");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch { throw new StudioError(400, "INVALID_BODY", "That request wasn't valid JSON."); }
}

export function studioError(error: unknown): Response {
  if (error instanceof StudioError) return Response.json({ error: error.message, code: error.code, ...(error.detail ? { detail: error.detail } : {}) }, { status: error.status, headers: NO_STORE });
  if (error instanceof z.ZodError) return Response.json({ error: "That request didn't look right.", code: "INVALID_REQUEST" }, { status: 400, headers: NO_STORE });
  if (error instanceof GatewayError) return Response.json({ error: "The AI planner is unavailable right now. Try again shortly.", code: `AI_${error.code.toUpperCase()}` }, { status: error.code === "rate_limited" ? 429 : 503, headers: NO_STORE });
  const code = (error as { code?: string })?.code;
  if (code === "23514" || code === "P2034" || code === "40001") return Response.json({ error: "Your plan changed at the same moment. Try again.", code: "CONFLICT" }, { status: 409, headers: NO_STORE });
  console.error("[planning-studio] request failed", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "The planner had a problem. Try again shortly.", code: "STUDIO_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
}

export async function studioRoute(request: Request, action: (userId: number) => Promise<unknown>): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    if (!studioEnabled()) throw new StudioError(404, "STUDIO_DISABLED", "The Planning Studio isn't switched on here yet.");
    const result = await action(session.userId);
    if (result instanceof Response) return result;
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return studioError(error);
  }
}

/** Newline-delimited JSON events, one per line, flushed as they happen. */
export function eventStream(request: Request, run: (userId: number, emit: (event: unknown) => void, signal: AbortSignal) => Promise<unknown>): Promise<Response> {
  return (async () => {
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    if (!studioEnabled()) return studioError(new StudioError(404, "STUDIO_DISABLED", "The Planning Studio isn't switched on here yet."));
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (event: unknown) => { if (open) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; } } };
        try {
          const result = await run(session.userId, emit, request.signal);
          emit({ type: "done", result: result ?? null });
        } catch (error) {
          const response = studioError(error);
          const body = await response.json().catch(() => ({}));
          emit({ type: "error", status: response.status, code: (body as { code?: string }).code ?? "STUDIO_UNAVAILABLE", message: (body as { error?: string }).error ?? "The planner had a problem." });
        } finally {
          open = false;
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
  })();
}
