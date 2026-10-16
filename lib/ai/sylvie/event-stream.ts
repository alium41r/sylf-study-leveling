/** Small shared SSE reader. Handles split UTF-8/codepoints and network frames. */
export async function readEventStream(response: Response, onEvent: (event: string, data: string) => void, signal?: AbortSignal): Promise<void> {
  if (!response.body) throw new Error("Response stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        if (boundary > 2 * 1024 * 1024) throw new Error("Response frame too large");
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const lines = frame.split("\n");
        const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
        const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
        if (data) onEvent(event, data);
      }
      // Bound each frame, not a network chunk containing many valid frames.
      // The final chat result can contain long text in legacy-compatible fields.
      if (buffer.length > 2 * 1024 * 1024) throw new Error("Response frame too large");
      if (done) {
        if (buffer.trim() && !buffer.startsWith(":")) throw new Error("Response stream interrupted");
        break;
      }
    }
  } finally { signal?.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
