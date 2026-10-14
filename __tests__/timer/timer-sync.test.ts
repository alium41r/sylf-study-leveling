import { afterEach, describe, expect, it, vi } from "vitest";
import { TimerSync } from "@/lib/timer-sync";
import type { SessionExecutionV2 } from "@/lib/planner/v2/session-client";

function storage() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const t0 = "2026-10-14T09:00:00.000Z";
const t1 = "2026-10-14T09:05:00.000Z";
const t2 = "2026-10-14T09:10:00.000Z";
const meta = { ownerId: 7, clientKey: "71c48d7a-882d-4a80-a841-9df01457c091", startedAt: t0 };
const result = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const noLock = async <T,>(work: () => Promise<T>) => work();
const execution: SessionExecutionV2 = { schemaVersion: 2, sessionId: 12, ownerId: 7, questId: 22,
  state: "RUNNING", executionVersion: 1, acceptedFocusSeconds: 0, acceptedBreakSeconds: 0,
  startedAt: t0, endedAt: null, actualCivilDate: "2026-10-14", timezone: "Asia/Karachi" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("durable timer journal", () => {
  it("records END synchronously without waiting for creation, network or a tab lock", () => {
    const request = vi.fn(() => new Promise<Response>(() => {})); const store = storage();
    const sync = new TimerSync(7, store, request, noLock);
    sync.create(meta); sync.finish(meta.clientKey, 301, 15, false, t1);
    expect(sync.journal(meta.clientKey)?.endedAt).toBe(t1);
    expect(sync.status().pending).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
  it("recovers creation, END and completion after restart and retries the same start identity", async () => {
    const store = storage(); let lost = true; const starts: unknown[] = []; const patches: unknown[] = [];
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { starts.push(JSON.parse(String(init.body))); if (lost) { lost = false; throw new Error("lost POST response"); } return result({ id: 12 }); }
      if (init?.method === "PATCH") { patches.push(JSON.parse(String(init.body))); return result({ durationSeconds: 300, breakSeconds: 0 }); }
      return result({ id: 12, durationSeconds: 0, breakSeconds: 0 });
    });
    const first = new TimerSync(7, store, request, noLock); first.create(meta); first.finish(meta.clientKey, 300, 0, false, t1);
    first.start(); await first.drain(); first.stop();
    expect(first.status().pending).toBe(1);
    const restarted = new TimerSync(7, store, request, noLock); restarted.start(); await restarted.drain();
    expect(starts[1]).toEqual(starts[0]); expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: 12, durationSeconds: 300, final: true, endedAt: t1 });
    expect(restarted.journal(meta.clientKey)?.settled).toBe(true); expect(restarted.status().pending).toBe(0);
    restarted.stop();
  });
  it("replays a committed V2 transition's exact receipt after losing its response", async () => {
    const store = storage(); const patches: unknown[] = []; let accepted = execution; let lost = true;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PATCH") return result({ id: 12, execution: accepted });
      const body = JSON.parse(String(init.body)); patches.push(body);
      accepted = { ...execution, state: "ENDED", executionVersion: 4, acceptedFocusSeconds: 300, endedAt: t1 };
      if (lost) { lost = false; throw new Error("lost END response"); }
      return result({ execution: accepted });
    });
    const first = new TimerSync(7, store, request, noLock); first.create({ ...meta, sessionId: 12, questId: 22 }); first.finish(meta.clientKey, 300, 0, false, t1);
    first.start(); await first.drain(); first.stop();
    const restarted = new TimerSync(7, store, request, noLock); restarted.start(); await restarted.drain();
    expect(patches).toHaveLength(2); expect(patches[1]).toEqual(patches[0]);
    expect(restarted.status().pending).toBe(0); restarted.stop();
  });
  it("preserves offline pause/resume boundaries in order, including their original times", async () => {
    const store = storage(); const calls: Array<{ action: string; occurredAt: string }> = []; let accepted = execution;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PATCH") return result({ execution: accepted });
      const op = JSON.parse(String(init.body)).executionTransition; calls.push(op);
      accepted = { ...accepted, executionVersion: accepted.executionVersion + 3,
        state: op.action === "PAUSE" ? "PAUSED" : op.action === "END" ? "ENDED" : "RUNNING",
        acceptedFocusSeconds: op.cumulativeFocusSeconds, endedAt: op.action === "END" ? op.occurredAt : null };
      return result({ execution: accepted });
    });
    const sync = new TimerSync(7, store, request, noLock); sync.create({ ...meta, sessionId: 12 });
    sync.enqueue(meta.clientKey, "PAUSE", 300, 0, t1); sync.enqueue(meta.clientKey, "RESUME", 300, 0, t2);
    sync.finish(meta.clientKey, 301, 0, false, "2026-10-14T09:10:01.000Z");
    sync.start(); await sync.drain();
    expect(calls.map(x => [x.action, x.occurredAt])).toEqual([["PAUSE", t1], ["RESUME", t2], ["END", "2026-10-14T09:10:01.000Z"]]); sync.stop();
  });
  it("preserves interaction order for pause/resume actions occurring in the same millisecond", async () => {
    const store = storage(); let accepted = execution; const calls: string[] = [];
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return result({ execution: accepted });
      const action = JSON.parse(String(init.body)).executionTransition.action; calls.push(action);
      accepted = { ...accepted, state: action === "PAUSE" ? "PAUSED" : "RUNNING", executionVersion: accepted.executionVersion + 3 };
      return result({ execution: accepted });
    });
    const sync = new TimerSync(7, store, request, noLock); sync.create({ ...meta, sessionId: 12 });
    sync.enqueue(meta.clientKey, "PAUSE", 0, 0, t1); sync.enqueue(meta.clientKey, "RESUME", 0, 0, t1);
    sync.start(); await sync.drain(); expect(calls).toEqual(["PAUSE", "RESUME"]); sync.stop();
  });
  it("recovers an END whose metadata write was interrupted", async () => {
    const store = storage(); const sync = new TimerSync(7, store, async (_url, init) => result(init?.method === "POST" ? { id: 12 } : { durationSeconds: 300 }), noLock);
    sync.create(meta); const save = store.setItem;
    store.setItem = (key, value) => { if (key.endsWith(":meta")) throw new Error("metadata interrupted"); save(key, value); };
    expect(() => sync.finish(meta.clientKey, 300, 0, false, t1)).toThrow();
    expect(sync.journal(meta.clientKey)?.endedAt).toBe(t1);
    store.setItem = save; sync.start(); await sync.drain(); expect(sync.journal(meta.clientKey)?.settled).toBe(true); sync.stop();
  });
  it("retains a later END while an earlier checkpoint is in flight", async () => {
    const store = storage(); let release!: (response: Response) => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const finals: boolean[] = [];
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PATCH") return result({ id: 12 });
      const body = JSON.parse(String(init.body)); finals.push(body.final);
      if (!body.final) { entered(); return new Promise<Response>(resolve => { release = resolve; }); }
      return result({ durationSeconds: 300 });
    });
    const sync = new TimerSync(7, store, request, noLock); sync.create({ ...meta, sessionId: 12 }); sync.enqueue(meta.clientKey, "PROGRESS", 180, 0, t1);
    sync.start(); await started; sync.finish(meta.clientKey, 300, 0, false, t2); release(result({ durationSeconds: 180 }));
    await sync.drain(); expect(sync.status().pending).toBe(1);
    await sync.drain(true); expect(finals).toEqual([false, true]); expect(sync.status().pending).toBe(0); sync.stop();
  });
  it("retries failed quest completion after END without losing the completion intent", async () => {
    const store = storage(); let accepted = execution; let completionAttempts = 0;
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/api/quests")) {
        if (!init?.method) return result({ status: "IN_PROGRESS", executionVersion: 5 });
        if (++completionAttempts === 1) return result({}, 503);
        return result({ status: "COMPLETED" });
      }
      if (!init?.method) return result({ execution: accepted });
      accepted = { ...execution, state: "ENDED", endedAt: t1, executionVersion: 4, acceptedFocusSeconds: 300 };
      return result({ execution: accepted });
    });
    const sync = new TimerSync(7, store, request, noLock); sync.create({ ...meta, sessionId: 12, questId: 22 }); sync.finish(meta.clientKey, 300, 0, true, t1);
    sync.start(); await sync.drain(); expect(sync.status().pending).toBe(1);
    await sync.drain(true); expect(completionAttempts).toBe(2); expect(sync.status().pending).toBe(0); sync.stop();
  });
  it("deduplicates rapid endings, keeps END terminal, and isolates accounts", async () => {
    const store = storage(); const request = vi.fn(async () => result({ id: 12 }));
    const sync = new TimerSync(7, store, request, noLock); sync.create(meta);
    sync.finish(meta.clientKey, 300, 0, false, t1); sync.finish(meta.clientKey, 600, 0, false, t2); sync.enqueue(meta.clientKey, "PROGRESS", 900, 0, t2);
    expect(sync.status().pending).toBe(1); expect(sync.journal(meta.clientKey)?.endedAt).toBe(t1);
    const other = new TimerSync(8, store, request, noLock); other.start(); await other.drain();
    expect(request).not.toHaveBeenCalled(); expect(sync.status().pending).toBe(1); other.stop();
  });
  it("does not discard data on quota/authorization/invalid response errors", async () => {
    for (const status of [401, 429, 503]) {
      const store = storage(); const sync = new TimerSync(7, store, async () => result({}, status), noLock);
      sync.create(meta); sync.finish(meta.clientKey, 300, 0, false, t1); sync.start(); await sync.drain();
      expect(sync.status().pending).toBe(1); expect(sync.status().error).toBeTruthy(); sync.stop();
    }
  });
  it("fails the durability boundary if storage is full, preserving the running journal", () => {
    const store = storage(); const sync = new TimerSync(7, store, vi.fn(), noLock); sync.create(meta);
    store.setItem = () => { throw new Error("full"); };
    expect(() => sync.finish(meta.clientKey, 300, 0, false, t1)).toThrow("full");
    expect(sync.journal(meta.clientKey)?.endedAt).toBeUndefined();
  });
  it("aborts hung requests and remains retryable without changing the identity", async () => {
    vi.useFakeTimers(); const store = storage();
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const sync = new TimerSync(7, store, request, noLock); sync.create(meta); sync.finish(meta.clientKey, 300, 0, false, t1);
    sync.start(); await vi.advanceTimersByTimeAsync(15_001); await sync.drain();
    expect(sync.status().pending).toBe(1); expect(sync.status().error).toContain("retry automatically"); sync.stop();
  });
  it("bounds a response body that stalls after successful headers", async () => {
    vi.useFakeTimers(); const store = storage();
    const sync = new TimerSync(7, store, async () => new Response(new ReadableStream({ start() {} })), noLock);
    sync.create(meta); sync.finish(meta.clientKey, 300, 0, false, t1); sync.start();
    await vi.advanceTimersByTimeAsync(15_001); await sync.drain();
    expect(sync.status().pending).toBe(1); expect(sync.status().error).toContain("retry automatically"); sync.stop();
  });
  it("delivers Focus Party departures from the same journal after restart", async () => {
    const store = storage(); const first = new TimerSync(7, store, vi.fn(), noLock);
    first.create({ ...meta, kind: "party", partyId: 4, sessionId: 12, participationJoinedAt: t0 }); first.finish(meta.clientKey, 300, 0, false, t1);
    const request = vi.fn<typeof fetch>(async () => result({ success: true, accumulatedSeconds: 301 }));
    const restarted = new TimerSync(7, store, request, noLock); restarted.start(); await restarted.drain();
    expect(request.mock.calls[0][0]).toBe("/api/focus-party/4/session/timer");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ action: "leave", joinedAt: t0, endedAt: t1, expectedOwnerId: 7 });
    expect(restarted.status().pending).toBe(0); expect(restarted.journal(meta.clientKey)).toMatchObject({ settled: true, endedFocusSeconds: 301 }); restarted.stop();
  });
});

it("uses server receipt protection when an exposed Web Locks API denies acquisition", async () => {
  vi.stubGlobal("navigator", { locks: { request: vi.fn(async () => { throw new DOMException("denied", "SecurityError"); }) } });
  const store = storage(); const sync = new TimerSync(7, store, async (_url, init) => result(init?.method === "POST" ? { id: 12 } : { durationSeconds: 300 }));
  sync.create(meta); sync.finish(meta.clientKey, 300, 0, false, t1); sync.start(); await sync.drain();
  expect(sync.status().pending).toBe(0); expect(sync.journal(meta.clientKey)?.settled).toBe(true); sync.stop();
});
