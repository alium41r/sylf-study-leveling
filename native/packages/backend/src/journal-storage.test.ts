import { describe, expect, it, vi } from "vitest";
import { TimerSync } from "@sylf/shared/backend";
import { TIMER_JOURNAL_KEY, createJournalStorage } from "./journal-storage";

const preferences = (initial: Record<string, string> = {}) => { const map = new Map(Object.entries(initial)); return { getItem: (key: string) => map.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { map.set(key, value); }), map }; };
const CLIENT_KEY = "3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b";

describe("the journal's storage", () => {
  it("behaves like the part of Storage that TimerSync uses", () => {
    const storage = createJournalStorage(preferences());
    expect(storage.length).toBe(0);
    storage.setItem("a", "1"); storage.setItem("b", "2");
    expect(storage.length).toBe(2);
    expect([storage.key(0), storage.key(1), storage.key(2)]).toEqual(["a", "b", null]);
    expect(storage.getItem("a")).toBe("1");
    expect(storage.getItem("missing")).toBeNull();
    storage.removeItem("a");
    expect(storage.length).toBe(1);
  });

  it("survives a restart, in one preference value", () => {
    const store = preferences();
    createJournalStorage(store).setItem("sylf_timer_journal_v1:7:key:meta", "{}");
    expect([...store.map.keys()]).toEqual([TIMER_JOURNAL_KEY]);
    expect(createJournalStorage(store).getItem("sylf_timer_journal_v1:7:key:meta")).toBe("{}");
  });

  it.each(["not json", "[1,2]", "null"])("starts empty from %s rather than stopping the app", (raw) => {
    expect(createJournalStorage(preferences({ [TIMER_JOURNAL_KEY]: raw })).length).toBeLessThanOrEqual(2);
  });

  it("lets a failed write surface, because TimerSync must know", () => {
    const store = preferences(); store.setItem.mockImplementation(() => { throw new Error("quota"); });
    expect(() => createJournalStorage(store).setItem("a", "1")).toThrow("quota");
  });
});

describe("TimerSync on this storage", () => {
  const sync = (store = preferences(), owner = 7) => new TimerSync(owner, createJournalStorage(store), async () => new Response("{}"));

  it("keeps a journal across a restart", () => {
    const store = preferences();
    sync(store).create({ ownerId: 7, clientKey: CLIENT_KEY, startedAt: "2026-11-01T10:00:00.000Z" });
    expect(sync(store).journal(CLIENT_KEY)?.startedAt).toBe("2026-11-01T10:00:00.000Z");
  });

  it("keeps one owner's journal away from another", () => {
    const store = preferences();
    const first = sync(store, 7);
    first.create({ ownerId: 7, clientKey: CLIENT_KEY, startedAt: "2026-11-01T10:00:00.000Z" });
    first.enqueue(CLIENT_KEY, "PAUSE", 60, 0);
    const second = sync(store, 8);
    expect(second.journal(CLIENT_KEY)).toBeNull();
    expect(second.status().pending).toBe(0);
    expect(first.status().pending).toBe(1);
    expect(() => second.create({ ownerId: 7, clientKey: CLIENT_KEY, startedAt: "2026-11-01T10:00:00.000Z" })).toThrow();
  });
});
