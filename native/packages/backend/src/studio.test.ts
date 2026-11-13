import { describe, expect, it, vi } from "vitest";
import { createStudioReads, ndjsonReader, newStudioKey, type StudioEvent } from "./studio";
import type { BackendClient } from "./client";

const state = {
  readiness: { enabled: true, ai: true, reason: null, model: "deepseek-flash" }, version: 3, settings: {},
  snapshot: { today: "2026-11-23", nowMinute: 600, days: [], subjects: [] }, model: { goals: [], items: [] }, blocks: [],
  plan: { blocks: [], days: [], reasons: {}, health: { plannedMinutes: 0 } }, proposal: null, signals: [], history: [], lockedGoals: [],
  facts: { commitments: 2 }, calibrationNotes: {}, repaired: null,
};

function client(overrides: Partial<BackendClient> = {}): BackendClient {
  return { get: vi.fn(async () => state), send: vi.fn(async () => ({ state })), upload: vi.fn(), stream: vi.fn(), assetUrl: (p: string) => p, reset: vi.fn(), ...overrides } as unknown as BackendClient;
}

describe("Planning Studio client", () => {
  it("splits newline-delimited events across arbitrary chunk boundaries", () => {
    const events: StudioEvent[] = [];
    const reader = ndjsonReader((e) => events.push(e));
    const text = `${JSON.stringify({ type: "stage", stage: "read", text: "Reading your week · 3 commitments" })}\n${JSON.stringify({ type: "interpretation", text: "Move · Chemistry", fast: true })}\nnot json\n${JSON.stringify({ type: "done", result: null })}`;
    for (let i = 0; i < text.length; i += 7) reader.push(text.slice(i, i + 7));
    reader.flush();
    expect(events.map((e) => e.type)).toEqual(["stage", "interpretation", "done"]);
  });

  it("makes keys the server accepts", () => {
    expect(newStudioKey()).toMatch(/^[A-Za-z0-9_:.-]{8,120}$/);
  });

  it("opens with the sync action and parses the state", async () => {
    const c = client({ send: vi.fn(async () => state) as never });
    const reads = createStudioReads(c);
    const opened = await reads.open();
    expect(c.send).toHaveBeenCalledWith("POST", "/api/planner/studio", expect.objectContaining({ body: { action: "open" } }));
    expect(opened.version).toBe(3);
  });

  it("sends accept and direct edits with their keys", async () => {
    const c = client({ send: vi.fn(async () => ({ state, committed: { version: 4, summary: "1 moved", replayed: false }, rebased: null })) as never });
    const reads = createStudioReads(c);
    const accepted = await reads.accept("6f9b1c1e-1111-4a4a-9b9b-222222222222", "skey-000001");
    expect(accepted.committed?.summary).toBe("1 moved");
    await reads.direct("skey-000002", [{ kind: "move", block: "b_1", date: "2026-11-24", start: 600 }]);
    expect(c.send).toHaveBeenLastCalledWith("POST", "/api/planner/studio", expect.objectContaining({ body: { action: "direct", key: "skey-000002", edits: [{ kind: "move", block: "b_1", date: "2026-11-24", start: 600 }] } }));
  });

  it("streams a workflow and turns an error event into a refusal", async () => {
    const stream = vi.fn(async (_path: string, _init: unknown, onChunk: (text: string) => void) => {
      onChunk(`${JSON.stringify({ type: "stage", stage: "read", text: "Reading your week" })}\n`);
      onChunk(`${JSON.stringify({ type: "error", status: 422, code: "NOT_UNDERSTOOD", message: "Try another phrasing." })}\n`);
    });
    const reads = createStudioReads(client({ stream: stream as never }));
    const seen: string[] = [];
    await expect(reads.run({ workflow: "command", key: "skey-000003", text: "hmm" }, (e) => seen.push(e.type))).rejects.toMatchObject({ kind: "invalid", message: "Try another phrasing." });
    expect(seen).toEqual(["stage", "error"]);
    expect(stream.mock.calls[0][0]).toBe("/api/planner/studio/stream");
  });
});
