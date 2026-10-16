// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readEventStream } from "@/lib/ai/sylvie/event-stream";
import { streamChat } from "@/lib/ai/sylvie/chat-stream-server";
import { requestSylvieChat } from "@/lib/ai/sylvie/chat-client";
import { consumeResponseWithTimeout } from "@/lib/api-transport";

const encoder = new TextEncoder();
function streamText(text: string, bytes = 3) {
  const encoded = encoder.encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < encoded.length; i += bytes) controller.enqueue(encoded.slice(i, i + bytes)); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } });
}
describe("genuine chat delivery protocol", () => {
  it("accepts a long authoritative reply exceeding the old 256 KiB frame limit", async () => {
    const long = "Beginning " + "x".repeat(90_000) + " Complete final equation.";
    vi.stubGlobal("fetch", vi.fn(async () => streamText(`event: result\ndata: ${JSON.stringify({ aiMessage: { content: long }, reply: long, message: long })}\n\n`, 400_000)));
    try {
      const reply = await requestSylvieChat({ message: "Solve the whole problem", signal: new AbortController().signal, onDelta: vi.fn(), onReset: vi.fn(), onSession: vi.fn() });
      expect(reply.aiMessage?.content).toBe(long);
    } finally { vi.unstubAllGlobals(); }
  });
  it("still rejects an oversized individual response frame", async () => {
    await expect(readEventStream(streamText('data: ' + 'x'.repeat(2 * 1024 * 1024 + 1) + '\n\n', 3_000_000), () => {})).rejects.toThrow("frame too large");
  });
  it("decodes split Unicode, CRLF, comments and multiline SSE data", async () => {
    const events: string[] = [];
    await readEventStream(streamText(': heartbeat\r\n\r\nevent: delta\r\ndata: 你好 🌙\r\ndata: next\r\n\r\n', 1), (event, data) => events.push(`${event}:${data}`));
    expect(events).toEqual(["delta:你好 🌙\nnext"]);
  });
  it("delivers deltas before persistence and sends authoritative results only after completion", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const response = streamChat(new NextRequest("http://localhost/chat"), async sink => {
      sink.session({ sessionId: 9 }); sink.delta("A real delta"); await gate;
      return Response.json({ reply: "Saved answer", sessionId: 9 });
    });
    const events: string[] = [];
    const reading = readEventStream(response, (event, data) => events.push(`${event}:${data}`));
    await vi.waitFor(() => expect(events.some(event => event.startsWith("delta:"))).toBe(true));
    expect(events.some(event => event.startsWith("result:"))).toBe(false);
    finish(); await reading;
    expect(events.at(-1)).toContain('result:{"reply":"Saved answer"');
  });
  it("propagates consumer cancellation to upstream work", async () => {
    let signal!: AbortSignal;
    const response = streamChat(new NextRequest("http://localhost/chat"), async sink => {
      signal = sink.signal;
      await new Promise<void>(resolve => sink.signal.addEventListener("abort", () => resolve()));
      return Response.json({});
    });
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
    expect(signal.aborted).toBe(true);
  });
  it("client resets abandoned fallback text and requires a terminal result", async () => {
    const deltas: string[] = [], reset = vi.fn(), session = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => streamText('event: session\ndata: {"sessionId":9}\n\nevent: delta\ndata: {"text":"old"}\n\nevent: reset\ndata: {}\n\nevent: delta\ndata: {"text":"new"}\n\nevent: result\ndata: {"reply":"new","sessionId":9}\n\n')));
    try {
      const options = { message: "Hello", signal: new AbortController().signal, onDelta: (text: string) => deltas.push(text), onReset: reset, onSession: session };
      expect((await requestSylvieChat(options)).reply).toBe("new");
      expect(deltas).toEqual(["old", "new"]); expect(reset).toHaveBeenCalledOnce(); expect(session).toHaveBeenCalledWith({ sessionId: 9 });
      vi.stubGlobal("fetch", vi.fn(async () => streamText('event: delta\ndata: {"text":"partial"}\n\n')));
      await expect(requestSylvieChat(options)).rejects.toThrow("interrupted");
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps the timeout active while consuming a slow stream body", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const pending = consumeResponseWithTimeout((async () => response) as typeof fetch, "/chat", {}, 15,
      async (value, signal) => readEventStream(value, () => {}, signal));
    await expect(pending).rejects.toThrow("timed out"); expect(cancelled).toBe(true);
  });
});
