// G-10, G-11. What Hermes lacks, taken away for real, with the real TimerSync and SessionProtocolV2 and a server that accepts everything.
// Vitest runs on V8, so this proves the code no longer reaches for these. It does not prove the code runs on Hermes: that is for the tablet.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionProtocolV2, TimerSync, backend } from "@sylf/shared/backend";
import { createJournalStorage } from "./journal-storage";

const CLIENT_KEY = "3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b";
const STARTED = "2026-11-01T10:00:00.000Z";
const execution = (version: number, state: "RUNNING" | "PAUSED" | "ENDED", focus: number) => ({ schemaVersion: 2, sessionId: 41, ownerId: 7, questId: null, state, executionVersion: version, acceptedFocusSeconds: focus, acceptedBreakSeconds: 0, startedAt: STARTED, endedAt: state === "ENDED" ? "2026-11-01T10:10:00.000Z" : null, actualCivilDate: "2026-11-01", timezone: "UTC" });

const originals = { structuredClone: globalThis.structuredClone, customEvent: globalThis.CustomEvent, window: (globalThis as { window?: unknown }).window, throwIfAborted: AbortSignal.prototype.throwIfAborted };

beforeAll(() => {
  Reflect.deleteProperty(globalThis, "structuredClone");
  Reflect.deleteProperty(globalThis, "CustomEvent");
  Reflect.deleteProperty(AbortSignal.prototype, "throwIfAborted");
  // React Native defines `window` as an object with no event methods.
  (globalThis as { window?: unknown }).window = {};
});
afterAll(() => {
  globalThis.structuredClone = originals.structuredClone;
  globalThis.CustomEvent = originals.customEvent;
  AbortSignal.prototype.throwIfAborted = originals.throwIfAborted;
  if (originals.window === undefined) Reflect.deleteProperty(globalThis, "window"); else (globalThis as { window?: unknown }).window = originals.window;
});

describe("on a runtime without browser globals", () => {
  it("really has them removed", () => {
    expect(typeof globalThis.structuredClone).toBe("undefined");
    expect(typeof globalThis.CustomEvent).toBe("undefined");
    expect("throwIfAborted" in AbortSignal.prototype).toBe(false);
  });

  it("copies an accepted execution without structuredClone", () => {
    const protocol = new SessionProtocolV2(async () => new Response("{}"));
    const value = execution(1, "RUNNING", 0);
    protocol.attach(value as never);
    const copy = protocol.accepted();
    expect(copy).toEqual(value);
    expect(copy).not.toBe(value);
  });

  it("finishes a request without AbortSignal.throwIfAborted", async () => {
    const response = await backend.fetchWithTimeout(async () => new Response('{"ok":true}'), "/api/x");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("still fails when aborted", async () => {
    const controller = new AbortController();
    const work = backend.fetchWithTimeout((_input, init) => new Promise((resolve) => { init?.signal?.addEventListener("abort", () => resolve(new Response("{}"))); }), "/api/x", { signal: controller.signal });
    controller.abort();
    await expect(work).rejects.toBeDefined();
  });

  it("delivers a whole session through the real TimerSync, and does not throw after the server accepted", async () => {
    const preferences = (() => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } }; })();
    const calls: string[] = [];
    let version = 1;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (init?.method === "POST") return Response.json({ id: 41, execution: execution(1, "RUNNING", 0) }, { status: 201 });
      if (init?.method === "PATCH") { version++; return Response.json({ execution: execution(version, body.executionTransition.action === "END" ? "ENDED" : "PAUSED", body.executionTransition.cumulativeFocusSeconds) }); }
      return Response.json({ execution: execution(version, "RUNNING", 0) });
    }) as unknown as typeof fetch;
    const sync = new TimerSync(7, createJournalStorage(preferences), request);
    const accepted: number[] = [];
    sync.onAccepted((value) => accepted.push(value.focus));
    sync.create({ ownerId: 7, clientKey: CLIENT_KEY, startedAt: STARTED });
    sync.enqueue(CLIENT_KEY, "PAUSE", 300, 0);
    sync.finish(CLIENT_KEY, 600, 0);
    sync.start();
    await sync.drain(true);
    expect(sync.status()).toEqual({ pending: 0, error: null });
    expect(sync.journal(CLIENT_KEY)).toMatchObject({ sessionId: 41, settled: true });
    expect(accepted.at(-1)).toBe(600);
    expect(calls.filter((call) => call.startsWith("POST"))).toHaveLength(1);
    sync.stop();
  });
});
