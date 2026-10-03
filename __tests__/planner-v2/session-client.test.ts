import { describe, expect, it, vi } from "vitest";
import { SessionProtocolV2, SessionProtocolConflict, reconcileSessionSnapshot, type SessionExecutionV2 } from "@/lib/planner/v2/session-client";
import { createInitialSnapshot, deriveTimer, transitionSnapshot } from "@/lib/timer-engine";

const started: SessionExecutionV2 = {
  schemaVersion: 2, sessionId: 12, ownerId: 7, questId: 22, state: "RUNNING", executionVersion: 1,
  acceptedFocusSeconds: 0, acceptedBreakSeconds: 0, startedAt: "2026-10-03T10:00:00.000Z",
  endedAt: null, actualCivilDate: "2026-10-03", timezone: "Asia/Karachi",
};
const response = (execution: SessionExecutionV2) => new Response(JSON.stringify({ execution }));
const storage = () => {
  const saved = new Map<string, string>();
  return { saved, getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
};

describe("shared authoritative session transport", () => {
  it("calls native-compatible fetch without the protocol instance as its receiver", async () => {
    const request = function (this: unknown, _url: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(response(init ? { ...started, state: "PAUSED", executionVersion: 3 } : started));
    };
    const client = new SessionProtocolV2(request);
    await client.restore(12);
    expect((await client.transition(12, "PAUSE", 0, 0)).state).toBe("PAUSED");
  });
  it("replays the same durable receipt after a lost acknowledgment, without a second pause", async () => {
    const store = storage(); const bodies: Record<string, unknown>[] = [];
    const paused = { ...started, state: "PAUSED" as const, executionVersion: 3, acceptedFocusSeconds: 20 };
    let first = true;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init) return response(paused);
      bodies.push(JSON.parse(String(init.body)));
      if (first) { first = false; throw new Error("response lost after commit"); }
      return response(paused);
    });
    const client = new SessionProtocolV2(request, store); client.attach(started);
    await expect(client.transition(12, "PAUSE", 20, 0)).rejects.toThrow("response lost");
    const reloaded = new SessionProtocolV2(request, store); await reloaded.restore(12);
    expect(await reloaded.transition(12, "PAUSE", 20, 0)).toEqual(paused);
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(store.saved.size).toBe(0);
  });
  it("serializes changes against accepted versions and suppresses an already accepted resume", async () => {
    const versions: number[] = []; let version = 1;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)).executionTransition;
      versions.push(body.expectedExecutionVersion); version += 2;
      return response({ ...started, executionVersion: version, acceptedFocusSeconds: body.cumulativeFocusSeconds });
    });
    const client = new SessionProtocolV2(request); client.attach(started);
    await Promise.all([client.transition(12, "PROGRESS", 10, 0), client.transition(12, "PROGRESS", 15, 0)]);
    expect(versions).toEqual([1, 3]);
    expect((await client.transition(12, "RESUME", 15, 0)).executionVersion).toBe(5);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not roll back a newer server state when recovering a historical receipt", async () => {
    const store = storage();
    const paused = { ...started, state: "PAUSED" as const, executionVersion: 3, acceptedFocusSeconds: 20 };
    const running = { ...started, executionVersion: 5, acceptedFocusSeconds: 20 };
    let lost = true;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init) return response(running);
      if (lost) { lost = false; throw new Error("lost pause response"); }
      return response(paused);
    });
    const first = new SessionProtocolV2(request, store); first.attach(started);
    await expect(first.transition(12, "PAUSE", 20, 0)).rejects.toThrow();
    const second = new SessionProtocolV2(request, store); await second.restore(12);
    expect(await second.transition(12, "PAUSE", 20, 0)).toEqual(running);
    expect(second.accepted()?.executionVersion).toBe(5);
    expect(store.saved.size).toBe(0);
  });
  it("drops a rejected stale transition and restores the other device's accepted end", async () => {
    const ended = { ...started, state: "ENDED" as const, executionVersion: 7, acceptedFocusSeconds: 8, endedAt: "2026-10-03T10:00:08.000Z" };
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init
      ? new Response(JSON.stringify({ message: "changed on another device" }), { status: 409 }) : response(ended));
    const store = storage(); const client = new SessionProtocolV2(request, store); client.attach(started);
    const error = await client.transition(12, "PAUSE", 15, 0).catch(e => e);
    expect(error).toBeInstanceOf(SessionProtocolConflict); expect(error.execution).toEqual(ended);
    expect(client.accepted()).toEqual(ended); expect(store.saved.size).toBe(0);
    expect(await client.transition(12, "RESUME", 15, 0)).toEqual(ended);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not let restored browser storage resume a paused or ended timer", () => {
    const local = createInitialSnapshot(1000);
    const paused = reconcileSessionSnapshot(local, { ...started, state: "PAUSED", acceptedFocusSeconds: 12 }, 91_000);
    expect(paused.isPaused).toBe(true); expect(deriveTimer(paused, 200_000).focusSec).toBe(12);
    const ended = reconcileSessionSnapshot(local, { ...started, state: "ENDED", acceptedFocusSeconds: 15, endedAt: "2026-10-03T10:00:15.000Z" }, 91_000);
    expect(ended.phase).toBe("done"); expect(deriveTimer(ended, 200_000).focusSec).toBe(15);
    const onBreak = transitionSnapshot(local, 21_000, { phase: "short-break", remainingSec: 300, paused: false });
    const running = reconcileSessionSnapshot(onBreak, { ...started, acceptedFocusSeconds: 15 }, 25_000);
    expect(running.focusMs).toBe(20_000); expect(running.breakMs).toBe(4_000);
    expect(deriveTimer(running, 26_000).breakSec).toBe(5);
  });
  it("rejects malformed pending storage and continues when storage is unavailable", async () => {
    const broken = { getItem: () => '{"action":"RESUME"}', setItem: () => { throw new Error("storage disabled"); }, removeItem: vi.fn() };
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => response(init ? { ...started, executionVersion: 3 } : started));
    const client = new SessionProtocolV2(request, broken); await client.restore(12);
    expect(broken.removeItem).toHaveBeenCalled();
    expect((await client.transition(12, "PROGRESS", 0, 0)).executionVersion).toBe(3);
  });
});
