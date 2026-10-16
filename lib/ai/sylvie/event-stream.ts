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
      if (buffer.length > 262144) throw new Error("Response frame too large");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const lines = frame.split("\n");
        const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
        const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
        if (data) onEvent(event, data);
      }
      if (done) {
        if (buffer.trim() && !buffer.startsWith(":")) throw new Error("Response stream interrupted");
        break;
      }
    }
  } finally { signal?.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
