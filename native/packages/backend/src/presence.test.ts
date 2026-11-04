import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresence } from "./presence";

describe("presence", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("beats on sign-in and once a minute after, and stops at sign-out", () => {
    const beat = vi.fn(async () => undefined); const presence = createPresence(beat);
    presence.update(true);
    expect(beat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(180_000);
    expect(beat).toHaveBeenCalledTimes(4);
    presence.update(false);
    vi.advanceTimersByTime(180_000);
    expect(beat).toHaveBeenCalledTimes(4);
  });
  it("sends nothing in the background, and says so again on return", () => {
    const beat = vi.fn(async () => undefined); const presence = createPresence(beat);
    presence.update(true); presence.setForeground(false);
    vi.advanceTimersByTime(600_000);
    expect(beat).toHaveBeenCalledTimes(1);
    presence.setForeground(true);
    expect(beat).toHaveBeenCalledTimes(2);
  });
  it("sends nothing with nobody signed in", () => {
    const beat = vi.fn(async () => undefined); const presence = createPresence(beat);
    presence.setForeground(true);
    vi.advanceTimersByTime(600_000);
    expect(beat).not.toHaveBeenCalled();
  });
  it("carries on after a failed beat", async () => {
    const beat = vi.fn(async () => { throw new Error("offline"); }); const presence = createPresence(beat);
    presence.update(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(beat).toHaveBeenCalledTimes(2);
  });
});
