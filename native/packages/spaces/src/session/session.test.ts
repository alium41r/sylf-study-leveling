import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCK_PANEL_WIDTH, INITIAL_SESSION_STATE, STUDY_SESSION_STORAGE_KEY, createStudySessionModel, createSpacesStore, createWorldController, formatSessionClock, parseSessionState, placeDock, readSession, spaceForDigit, speakSessionClock, type StudySessionModel } from "../index";

function memoryStorage(initial?: unknown) {
  const data = new Map<string, string>(initial === undefined ? [] : [[STUDY_SESSION_STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  return { data, writes: { count: 0 }, getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { this.writes.count++; data.set(key, value); } };
}
const START = 1_780_000_000_000;
const SECOND = 1000;
const MINUTE = 60_000;
const saved = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.data.get(STUDY_SESSION_STORAGE_KEY)!);
const model = (storage = memoryStorage()) => ({ storage, session: createStudySessionModel(storage) });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => { vi.useRealTimers(); });

describe("one session", () => {
  it("starts idle at the default length, and a clock shows that length", () => {
    const { session } = model();
    expect(session.status()).toBe("idle");
    expect(session.readout()).toMatchObject({ status: "idle", clock: 25 * 60, fraction: 0 });
  });
  it("refuses a second start, so there can never be two", () => {
    const { session, storage } = model();
    expect(session.start({ title: "Waves" })).toBe(true);
    const key = session.state().active!.clientKey;
    vi.advanceTimersByTime(5 * SECOND);
    expect(session.start({ title: "Another" })).toBe(false);
    expect(session.state().active).toMatchObject({ clientKey: key, title: "Waves" });
    expect(saved(storage).active.clientKey).toBe(key);
  });
  it("gives every session its own key", () => {
    const { session } = model();
    session.start();
    const first = session.state().active!.clientKey;
    vi.advanceTimersByTime(2 * SECOND);
    session.end();
    session.start();
    expect(session.state().active!.clientKey).not.toBe(first);
  });
  it("cannot change the length under a session that exists", () => {
    const { session } = model();
    session.start();
    expect(session.setLength(90)).toBe(false);
    expect(session.state().active!.length).toBe(25);
  });
  it("keeps one length choice for the next session, saved at once", () => {
    const { session, storage } = model();
    expect(session.setLength(50)).toBe(true);
    expect(saved(storage).length).toBe(50);
    expect(session.setLength(null)).toBe(true);
    expect(session.readout()).toMatchObject({ clock: 0, fraction: null });
  });
});

describe("time comes from the epoch", () => {
  it("counts down from the start, in whole seconds", () => {
    const { session } = model();
    session.start();
    vi.advanceTimersByTime(90 * SECOND);
    expect(session.readout()).toMatchObject({ status: "running", clock: 25 * 60 - 90, focusSeconds: 90 });
  });
  it("counts up with no limit", () => {
    const { session } = model();
    session.setLength(null);
    session.start();
    vi.advanceTimersByTime(3 * MINUTE);
    expect(session.readout()).toMatchObject({ clock: 180, focusSeconds: 180, fraction: null });
  });
  it("does not count paused time", () => {
    const { session } = model();
    session.start();
    vi.advanceTimersByTime(MINUTE);
    session.pause();
    vi.advanceTimersByTime(10 * MINUTE);
    expect(session.readout()).toMatchObject({ status: "paused", focusSeconds: 60 });
    session.resume();
    vi.advanceTimersByTime(MINUTE);
    expect(session.readout().focusSeconds).toBe(120);
  });
  it("treats a second pause or resume as nothing", () => {
    const { session, storage } = model();
    session.start();
    session.pause();
    const writes = storage.writes.count;
    expect(session.pause()).toBe(false);
    expect(storage.writes.count).toBe(writes);
    session.resume();
    expect(session.resume()).toBe(false);
  });
  it("survives a process kill mid-session, as the same session, with the time away counted", () => {
    const storage = memoryStorage();
    const first = createStudySessionModel(storage);
    first.start({ title: "Waves" });
    const key = first.state().active!.clientKey;
    vi.advanceTimersByTime(2 * MINUTE);
    vi.setSystemTime(START + 5 * MINUTE);
    const second = createStudySessionModel(storage);
    expect(second.state().active).toMatchObject({ clientKey: key, title: "Waves" });
    expect(second.readout().focusSeconds).toBe(300);
    expect(second.start()).toBe(false);
  });
  it("keeps a paused session paused across a restart", () => {
    const storage = memoryStorage();
    const first = createStudySessionModel(storage);
    first.start();
    vi.advanceTimersByTime(MINUTE);
    first.pause();
    vi.setSystemTime(START + 60 * MINUTE);
    expect(createStudySessionModel(storage).readout()).toMatchObject({ status: "paused", focusSeconds: 60 });
  });
  it("does not leave time stuck when the wall clock moves backwards", () => {
    const { session } = model();
    session.start();
    vi.advanceTimersByTime(MINUTE);
    session.pause();
    session.resume();
    vi.setSystemTime(START - 10 * MINUTE);
    session.setForeground(false);
    session.setForeground(true);
    vi.setSystemTime(START - 10 * MINUTE + 30 * SECOND);
    expect(session.readout().focusSeconds).toBe(90);
  });
});

describe("a countdown ends", () => {
  it("finishes on its own while the app is open, without anyone listening", () => {
    const { session } = model();
    session.setLength(15);
    session.start();
    vi.advanceTimersByTime(15 * MINUTE + SECOND);
    expect(session.readout()).toMatchObject({ status: "finished", clock: 0, focusSeconds: 900, fraction: 1 });
  });
  it("ends at its own deadline when it ran out in the background, however long ago", () => {
    const storage = memoryStorage();
    const first = createStudySessionModel(storage);
    first.setLength(15);
    first.start();
    first.setForeground(false);
    vi.setSystemTime(START + 6 * 60 * MINUTE);
    first.setForeground(true);
    expect(first.readout()).toMatchObject({ status: "finished", focusSeconds: 900 });
    expect(first.state().active!.operations.at(-1)).toMatchObject({ action: "PAUSE", at: new Date(START + 15 * MINUTE).toISOString() });
    vi.setSystemTime(START + 12 * 60 * MINUTE);
    const second = createStudySessionModel(storage);
    expect(second.readout()).toMatchObject({ status: "finished", focusSeconds: 900 });
  });
  it("keeps going as the same session, with no limit", () => {
    const { session } = model();
    session.setLength(15);
    session.start();
    const key = session.state().active!.clientKey;
    vi.advanceTimersByTime(15 * MINUTE + SECOND);
    expect(session.keepGoing()).toBe(true);
    vi.advanceTimersByTime(MINUTE);
    expect(session.state().active).toMatchObject({ clientKey: key, length: null });
    expect(session.readout()).toMatchObject({ status: "running", focusSeconds: 960 });
  });
  it("keeps a countdown's total honest after pausing it", () => {
    const { session } = model();
    session.setLength(15);
    session.start();
    vi.advanceTimersByTime(5 * MINUTE);
    session.pause();
    vi.advanceTimersByTime(30 * MINUTE);
    session.resume();
    vi.advanceTimersByTime(4 * MINUTE);
    expect(session.readout()).toMatchObject({ status: "running", clock: 6 * 60, focusSeconds: 9 * 60 });
  });
});

describe("what is kept", () => {
  it("keeps an ended session on this device, marked as not saved", () => {
    const { session, storage } = model();
    session.start({ title: "Waves", subject: "Physics" });
    vi.advanceTimersByTime(10 * MINUTE);
    const ended = session.end()!;
    expect(ended).toMatchObject({ title: "Waves", subject: "Physics", focusSeconds: 600, breakSeconds: 0, startedAt: START, endedAt: START + 10 * MINUTE, saved: false });
    expect(session.status()).toBe("idle");
    expect(saved(storage).ended[0].clientKey).toBe(ended.clientKey);
  });
  it("does not keep a session that lasted no time at all", () => {
    const { session } = model();
    session.start();
    session.end();
    expect(session.state().ended).toEqual([]);
  });
  it("writes the same operations the web journal replays, with cumulative totals", () => {
    const { session } = model();
    session.start();
    const key = session.state().active!.clientKey;
    vi.advanceTimersByTime(MINUTE);
    session.pause();
    vi.advanceTimersByTime(MINUTE);
    session.resume();
    vi.advanceTimersByTime(MINUTE);
    const { operations } = session.end()!;
    expect(operations.map((op) => [op.action, op.sequence, op.focus, op.breaks])).toEqual([["PAUSE", 1, 60, 0], ["RESUME", 2, 60, 0], ["END", 3, 120, 0]]);
    expect(operations.at(-1)!.id).toBe(`${key}:END`);
  });
  it("bounds what it keeps", () => {
    const { session } = model();
    for (let i = 0; i < 16; i++) { session.start(); vi.advanceTimersByTime(2 * SECOND); session.end(); }
    expect(session.state().ended).toHaveLength(12);
    session.start();
    for (let i = 0; i < 80; i++) { session.pause(); vi.advanceTimersByTime(10); session.resume(); vi.advanceTimersByTime(10); }
    expect(session.state().active!.operations.length).toBeLessThanOrEqual(64);
  });
  it("writes every change at once, and never for a clock", () => {
    const { session, storage } = model();
    const stop = session.subscribeClock(() => undefined);
    session.start();
    const writes = storage.writes.count;
    vi.advanceTimersByTime(30 * SECOND);
    expect(storage.writes.count).toBe(writes);
    session.pause();
    expect(storage.writes.count).toBe(writes + 1);
    stop();
  });
  it("reads a corrupt or partial record without losing what is good", () => {
    expect(createStudySessionModel(memoryStorage("{nope")).state()).toEqual(INITIAL_SESSION_STATE);
    expect(parseSessionState({ version: 9 })).toEqual(INITIAL_SESSION_STATE);
    const good = { clientKey: "k", title: "t", subject: null, startedAt: 1, endedAt: 2, focusSeconds: 3, breakSeconds: 0 };
    const parsed = parseSessionState({ version: 1, length: -4, active: { clientKey: "k", title: "t", startedAt: 1, length: 25, snapshot: { v: 1 } }, ended: [good, { title: "no key" }] });
    expect(parsed).toMatchObject({ length: 25, active: null });
    expect(parsed.ended).toHaveLength(1);
  });
});

describe("the clock", () => {
  const count = (session: StudySessionModel) => { const beats = { count: 0 }; return { beats, stop: session.subscribeClock(() => { beats.count++; }) }; };
  it("does nothing when nobody is listening", () => {
    const { session } = model();
    session.start();
    expect(vi.getTimerCount()).toBe(1); // The countdown's own deadline, and nothing else.
  });
  it("does nothing when nothing is running", () => {
    const { session } = model();
    const { stop } = count(session);
    expect(vi.getTimerCount()).toBe(0);
    session.setLength(null);
    session.start();
    session.pause();
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
  it("beats once a second for any number of listeners, on one timer", () => {
    const { session } = model();
    session.setLength(null);
    session.start();
    const a = count(session);
    const b = count(session);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10 * SECOND + 10);
    expect(a.beats.count).toBe(10);
    expect(b.beats.count).toBe(10);
    a.stop();
    b.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows every listener the same second", () => {
    const { session } = model();
    session.start();
    const seen: number[] = [];
    const stop = session.subscribeClock(() => seen.push(session.readout().clock));
    vi.advanceTimersByTime(5 * SECOND + 300);
    expect(seen).toEqual([1499, 1498, 1497, 1496, 1495]);
    vi.setSystemTime(START + 5 * SECOND + 900);
    expect(session.readout().clock).toBe(1495);
    stop();
  });
  it("stops behind the app and catches up on return", () => {
    const { session } = model();
    session.setLength(null);
    session.start();
    const { beats, stop } = count(session);
    session.setForeground(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(START + 10 * MINUTE);
    session.setForeground(true);
    expect(beats.count).toBe(1);
    expect(session.readout().focusSeconds).toBe(600);
    stop();
  });
  it("gives a view that was away the true time at once", () => {
    const { session } = model();
    session.start();
    vi.advanceTimersByTime(MINUTE);
    const before = session.revision();
    const stop = session.subscribeClock(() => undefined);
    expect(session.revision()).not.toBe(before);
    expect(session.readout().focusSeconds).toBe(60);
    stop();
  });
  it("tells views when something happens, and not for a beat", () => {
    const { session } = model();
    const heard = vi.fn();
    session.subscribe(heard);
    const stop = session.subscribeClock(() => undefined);
    session.start();
    expect(heard).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * SECOND);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("reading a session", () => {
  it("writes a clock", () => {
    expect(formatSessionClock(0)).toBe("00:00");
    expect(formatSessionClock(25 * 60)).toBe("25:00");
    expect(formatSessionClock(3599)).toBe("59:59");
    expect(formatSessionClock(3600)).toBe("1:00:00");
    expect(formatSessionClock(36_061)).toBe("10:01:01");
  });
  it("says a clock", () => {
    expect(speakSessionClock(0)).toBe("0 seconds");
    expect(speakSessionClock(61)).toBe("1 minute 1 second");
    expect(speakSessionClock(3720)).toBe("1 hour 2 minutes");
  });
  it("uses the web engine's snapshot unchanged", () => {
    const { session } = model();
    session.start();
    expect(session.state().active!.snapshot).toMatchObject({ v: 2, focusMs: 0, breakMs: 0, runningSinceMs: START, isPaused: false, phase: "focus", remainingMs: 25 * MINUTE });
  });
  it("derives the same answer for any moment, whoever asks", () => {
    const { session } = model();
    session.start();
    const state = session.state();
    expect(readSession(state, START + MINUTE)).toEqual(readSession(state, START + MINUTE));
  });
});

describe("World and the session", () => {
  const world = (session: StudySessionModel) => {
    const store = createSpacesStore(undefined, "tablet");
    store.select("world");
    const host = { descriptor: { id: "t", kind: "preview" as const, label: "Test" }, initialize: vi.fn(async () => undefined), load: vi.fn(async () => undefined), suspend: vi.fn(async () => undefined), resume: vi.fn(async () => undefined), save: vi.fn(async () => ({ ref: "r", savedAt: 1, location: "device" as const, pendingSync: false })), exit: vi.fn(async () => undefined), dispose: vi.fn(), memory: () => null };
    return { store, controller: createWorldController(store, { loadHost: async () => host, window: () => ({ width: 1280, height: 800 }), entryAllowed: () => session.status() !== "running" }) };
  };
  it("refuses to enter while a session runs, whatever asks", async () => {
    const { session } = model();
    session.start();
    const { store, controller } = world(session);
    expect(await controller.enter()).toBe(false);
    expect(store.getSnapshot().world).toBe("entry");
  });
  it("enters once the session is paused, and it stays paused", async () => {
    const { session } = model();
    session.start();
    vi.advanceTimersByTime(MINUTE);
    session.pause();
    const { store, controller } = world(session);
    const entered = controller.enter();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(await entered).toBe(true);
    expect(store.getSnapshot().world).toBe("playing");
    expect(session.readout()).toMatchObject({ status: "paused", focusSeconds: 60 });
  });
  it("enters with no session at all", async () => {
    const { session } = model();
    expect(await world(session).controller.enter()).toBe(true);
  });
});

describe("placing the dock", () => {
  const frame = { window: { width: 1280, height: 820 }, insets: { top: 0, right: 0, bottom: 0, left: 0 }, top: 12, edge: 12, control: 36, gap: 8, restWidth: 124, reservedRight: 0 };
  it("rests in the middle of a wide window", () => {
    expect(placeDock(frame).restLeft).toBe(578);
  });
  it("goes to the right of a compact window, where Home's strip needs the line", () => {
    expect(placeDock({ ...frame, window: { width: 480, height: 640 } }).restLeft).toBe(344);
  });
  it("never crosses the Spaces icon, however narrow the window", () => {
    expect(placeDock({ ...frame, window: { width: 200, height: 640 } }).restLeft).toBeGreaterThanOrEqual(56);
  });
  it("stays clear of the corner on the right", () => {
    const placed = placeDock({ ...frame, window: { width: 280, height: 640 }, reservedRight: 44 });
    expect(placed.restLeft + 124).toBeLessThanOrEqual(280 - 12 - 44);
  });
  it("keeps the panel inside the window and its safe area at every width", () => {
    for (const width of [320, 340, 480, 600, 820, 1280, 2000]) {
      const insets = { top: 24, right: 30, bottom: 20, left: 30 };
      const placed = placeDock({ ...frame, window: { width, height: 800 }, insets, top: 36 });
      expect(placed.panelLeft).toBeGreaterThanOrEqual(30 + 12);
      expect(placed.panelLeft + placed.panelWidth).toBeLessThanOrEqual(width - 30 - 12);
      expect(placed.panelWidth).toBeLessThanOrEqual(DOCK_PANEL_WIDTH);
      expect(placed.panelOrigin).toBeGreaterThanOrEqual(0);
      expect(placed.panelOrigin).toBeLessThanOrEqual(1);
    }
  });
  it("limits the panel's height in a short window", () => {
    expect(placeDock({ ...frame, window: { width: 900, height: 420 } }).panelMaxHeight).toBe(396);
  });
  it("maps digits to the Spaces that exist", () => {
    expect(spaceForDigit("1", ["home", "workspace", "world"])).toBe("home");
    expect(spaceForDigit("3", ["home", "workspace", "world"])).toBe("world");
    expect(spaceForDigit("2", ["home"])).toBeNull();
  });
});

describe("who a session belongs to (ADR 0010)", () => {
  const storage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } }; };

  it("stamps the account signed in when it starts, for good", () => {
    let owner: number | null = 7;
    const store = storage();
    const model = createStudySessionModel(store, { ownerId: () => owner, createKey: () => "key" });
    model.start();
    owner = 8;
    expect(model.state().active?.ownerId).toBe(7);
    expect(createStudySessionModel(store).state().active?.ownerId).toBe(7);
    model.pause();
    expect(model.end()?.ownerId).toBe(7);
  });

  it("leaves a session started by nobody ownerless", () => {
    const model = createStudySessionModel(storage());
    model.start();
    expect(model.state().active?.ownerId).toBeNull();
  });

  it("reads Phase 10's stored state, which has no owner, as ownerless", () => {
    const snapshot = { v: 2, focusMs: 1000, breakMs: 0, runningSinceMs: null, isPaused: true, remainingMs: null, timestamp: 1, phase: "focus" };
    const parsed = parseSessionState({ version: 1, length: 25, active: { clientKey: "a", title: "T", subject: null, startedAt: 1, length: 25, snapshot, operations: [] }, ended: [{ clientKey: "b", title: "T", subject: null, startedAt: 1, endedAt: 2, focusSeconds: 60, breakSeconds: 0, operations: [] }] });
    expect(parsed.active?.ownerId).toBeNull();
    expect(parsed.ended[0].ownerId).toBeNull();
  });

  it.each([0, -1, 1.5, "7", {}])("reads an owner of %j as nobody", (ownerId) => {
    const parsed = parseSessionState({ version: 1, length: 25, active: null, ended: [{ clientKey: "b", ownerId, title: "T", subject: null, startedAt: 1, endedAt: 2, focusSeconds: 60, breakSeconds: 0, operations: [] }] });
    expect(parsed.ended[0].ownerId).toBeNull();
  });
});

describe("on its way to the server", () => {
  const started = () => { const storage = memoryStorage(); return { storage, session: createStudySessionModel(storage, { now: () => 1_000, createKey: () => "key", ownerId: () => 7 }) }; };

  it("carries the plan into a session, keeps the subject for the next one, and drops the task", () => {
    const { session } = started();
    session.setPlan({ title: "Past paper", subject: "Physics", subjectId: 3, questId: 9 });
    session.start();
    expect(session.state().active).toMatchObject({ title: "Past paper", subject: "Physics", subjectId: 3, questId: 9, ownerId: 7 });
    expect(session.state().plan).toEqual({ title: null, subject: "Physics", subjectId: 3, questId: null });
  });

  it("marks a record saved only through settleAccepted", () => {
    const { session } = started();
    session.start();
    const ended = session.end();
    expect(ended?.saved).toBe(false);
    expect(session.settleAccepted("someone else's", { serverId: 1, focusSeconds: 1, breakSeconds: 0 })).toBe(false);
    expect(session.settleAccepted("key", { serverId: 5, focusSeconds: 0, breakSeconds: 0 })).toBe(true);
    expect(session.state().ended[0]).toMatchObject({ saved: true, serverId: 5, acceptedFocusSeconds: 0 });
  });

  it("keeps an owned session of no time until the journal has closed it", () => {
    const { session } = started();
    session.start();
    session.end();
    expect(session.state().ended).toHaveLength(1);
  });

  it("assigns an owner once: an owned record cannot be taken", () => {
    let owner: number | null = null;
    const session = createStudySessionModel(memoryStorage(), { now: () => 1_000, createKey: () => "key", ownerId: () => owner });
    session.start();
    session.assignOwner(["key"], 7);
    session.assignOwner(["key"], 8);
    expect(session.state().active?.ownerId).toBe(7);
    owner = 8;
    session.declineOwner(["key"]);
    expect(session.state().active?.declined).toBe(false);
  });

  it("survives a restart with everything delivery needs", () => {
    const { storage, session } = started();
    session.start();
    session.noteJournaled("key", 3);
    session.end();
    session.settleAccepted("key", { serverId: 5, focusSeconds: 0, breakSeconds: 0 });
    expect(createStudySessionModel(storage).state().ended[0]).toMatchObject({ ownerId: 7, journaled: 3, saved: true, serverId: 5, acceptedFocusSeconds: 0 });
  });

  it("drops what is already saved before anything still waiting, once the list is full", () => {
    let serial = 0;
    const clock = { at: 1_000 };
    const session = createStudySessionModel(memoryStorage(), { now: () => clock.at, createKey: () => `key-${++serial}`, ownerId: () => 7 });
    for (let index = 0; index < 14; index++) {
      session.start();
      clock.at += 1_000;
      session.end();
      if (index > 0 && index < 7) session.settleAccepted(`key-${index + 1}`, { serverId: index, focusSeconds: 1, breakSeconds: 0 });
    }
    const kept = session.state().ended;
    expect(kept).toHaveLength(12);
    expect(kept.some((item) => item.clientKey === "key-1")).toBe(true);
  });
});

describe("modes and breaks", () => {
  it("shapes a Pomodoro from its first focus block, and keeps the countdown as the default", () => {
    const { session } = model();
    expect(session.state().mode ?? "countdown").toBe("countdown");
    expect(session.setMode("pomodoro")).toBe(true);
    session.start({ title: "Waves" });
    expect(session.readout()).toMatchObject({ status: "running", clock: 25 * 60, phase: "focus" });
    expect(session.state().active?.phase).toMatchObject({ mode: "pomodoro", round: 1, rounds: 4 });
  });
  it("refuses to change the mode once a session exists", () => {
    const { session } = model();
    session.setMode("pomodoro");
    session.start();
    expect(session.setMode("sprint")).toBe(false);
  });
  it("moves into a break at the deadline and counts it apart from focus", () => {
    const { session } = model();
    session.setMode("pomodoro");
    session.start();
    vi.advanceTimersByTime(25 * MINUTE + 2 * SECOND);
    expect(session.readout()).toMatchObject({ phase: "short-break", focusSeconds: 25 * 60 });
    vi.advanceTimersByTime(60 * SECOND);
    expect(session.readout().breakSeconds).toBeGreaterThanOrEqual(60);
    expect(session.readout().focusSeconds).toBe(25 * 60);
  });
  it("catches up through phases that ended while the app was away", () => {
    const { session } = model();
    session.setMode("pomodoro");
    session.start();
    session.setForeground(false);
    vi.setSystemTime(START + 31 * MINUTE);
    session.setForeground(true);
    expect(session.readout()).toMatchObject({ phase: "focus", focusSeconds: 25 * 60 });
    expect(session.state().active?.phase?.round).toBe(2);
  });
  it("takes a break in Free Flow only when asked, and pauses at its end", () => {
    const { session } = model();
    session.setMode("freeflow");
    session.start();
    vi.advanceTimersByTime(30 * MINUTE);
    expect(session.takeBreak()).toBe(true);
    expect(session.readout().phase).toBe("short-break");
    expect(session.takeBreak()).toBe(false);
    vi.advanceTimersByTime(6 * MINUTE);
    expect(session.readout()).toMatchObject({ status: "paused", phase: "focus" });
  });
  it("refuses a break in a scheduled mode", () => {
    const { session } = model();
    session.setMode("pomodoro");
    session.start();
    expect(session.takeBreak()).toBe(false);
  });
  it("keeps a mode setting only within its bounds and type", () => {
    const { session } = model();
    expect(session.setModeSetting("pomodoro", "focusDuration", 50)).toBe(true);
    expect(session.setModeSetting("pomodoro", "focusDuration", 500)).toBe(false);
    expect(session.setModeSetting("pomodoro", "focusDuration", "50")).toBe(false);
    session.setMode("pomodoro");
    session.start();
    expect(session.readout().clock).toBe(50 * 60);
  });
  it("restores a running mode session from storage exactly", () => {
    const first = model();
    first.session.setMode("pomodoro");
    first.session.start({ title: "Waves" });
    vi.advanceTimersByTime(10 * MINUTE);
    const second = model(first.storage);
    expect(second.session.state().active?.phase).toMatchObject({ mode: "pomodoro", round: 1 });
    expect(second.session.readout()).toMatchObject({ status: "running", focusSeconds: 10 * 60 });
  });
});

describe("forgetting a deleted account's sessions", () => {
  it("removes what belongs to that owner, and keeps ownerless and other people's", () => {
    let who: number | null = 7;
    const storage = memoryStorage();
    const session = createStudySessionModel(storage, { ownerId: () => who });
    session.start({ title: "Mine" }); vi.advanceTimersByTime(60 * SECOND); session.end();
    who = null;
    session.start({ title: "Nobody's" }); vi.advanceTimersByTime(60 * SECOND); session.end();
    who = 8;
    session.start({ title: "Theirs" }); vi.advanceTimersByTime(60 * SECOND); session.end();
    session.forgetOwner(7);
    expect(session.state().ended.map((item) => item.title).sort()).toEqual(["Nobody's", "Theirs"]);
    expect(saved(storage).ended).toHaveLength(2);
  });
  it("ends a running session of that owner without keeping it", () => {
    const session = createStudySessionModel(memoryStorage(), { ownerId: () => 7 });
    session.start({ title: "Running" });
    session.forgetOwner(7);
    expect(session.state().active).toBeNull();
    expect(session.state().ended).toHaveLength(0);
  });
  it("does nothing, and writes nothing, when the owner has none", () => {
    const storage = memoryStorage();
    const session = createStudySessionModel(storage, { ownerId: () => 7 });
    const before = storage.writes.count;
    session.forgetOwner(99);
    expect(storage.writes.count).toBe(before);
  });
});
