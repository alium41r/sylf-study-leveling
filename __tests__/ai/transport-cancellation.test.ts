// @vitest-environment node
import { expect, it } from "vitest";
import { fetchWithTimeout } from "@/lib/api-transport";
import { aiSignal, withAiRequest } from "@/lib/ai/telemetry";
it("rejects a late body after cancellation instead of returning a stale response", async () => {
  const controller = new AbortController(); let finish!: (response: Response) => void;
  const request = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const pending = fetchWithTimeout(request, "/api/system-messages/chat", { signal: controller.signal }, 1000);
  controller.abort(); finish(new Response('{"reply":"late"}'));
  await expect(pending).rejects.toThrow();
});
it("preserves a caller's longer V2 deadline while forwarding parent cancellation", async () => {
  const parent = new AbortController(), caller = new AbortController();
  await withAiRequest({ userId: 7, feature: "planner", workload: "test", signal: parent.signal }, async () => {
    const merged = aiSignal(caller.signal);
    expect(merged.aborted).toBe(false); parent.abort(); expect(merged.aborted).toBe(true);
  });
});
