import { describe, expect, it } from "vitest";
import { createBackend } from "./compose";
import { TIMER_JOURNAL_KEY } from "./journal-storage";

describe("forgetting a deleted account's timer journal", () => {
  it("removes that owner's entries and keeps everyone else's", () => {
    const data = new Map<string, string>([[TIMER_JOURNAL_KEY, JSON.stringify({ "sylf_timer_journal_v1:7:abcdefgh:intent": "a", "sylf_timer_journal_v1:7:ijklmnop:intent": "b", "sylf_timer_journal_v1:70:abcdefgh:intent": "c", "sylf_timer_journal_v1:8:abcdefgh:intent": "d" })]]);
    const preferences = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    createBackend({ gateway: null, preferences }).forgetOwner(7);
    expect(Object.keys(JSON.parse(data.get(TIMER_JOURNAL_KEY)!)).sort()).toEqual(["sylf_timer_journal_v1:70:abcdefgh:intent", "sylf_timer_journal_v1:8:abcdefgh:intent"]);
  });
});
