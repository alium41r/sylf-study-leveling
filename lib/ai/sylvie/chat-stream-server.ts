import "server-only";
import type { NextRequest } from "next/server";

export interface ChatStreamSink { signal: AbortSignal; delta: (text: string) => void; reset: () => void; session: (value: unknown) => void; status: (phase: "uploading" | "thinking") => void }

/** Final result follows persistence AND telemetry settlement. JSON remains the default API contract. */
export function streamChat(request: NextRequest, run: (sink: ChatStreamSink) => Promise<Response>): Response {
  const cancelled = new AbortController();
  const signal = AbortSignal.any([request.signal, cancelled.signal]);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        if (signal.aborted) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cancelled.abort(); }
      };
      emit("status", { message: "Thinking" });
      heartbeat = setInterval(() => emit("ping", {}), 15000);
      try {
        const response = await run({ signal, delta: text => emit("delta", { text }), reset: () => emit("reset", {}), session: value => emit("session", value), status: phase => emit("status", { phase }) });
        const data = await response.json();
        emit(response.ok ? "result" : "error", response.ok ? data : { status: response.status, ...data });
      } catch {
        emit("error", { status: 503, error: "Sylvie is temporarily unavailable. Please try again." });
      } finally { clearInterval(heartbeat); try { controller.close(); } catch {} }
    },
    cancel() { clearInterval(heartbeat); cancelled.abort(); },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
