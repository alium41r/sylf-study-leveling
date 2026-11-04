// The bridge between the one study session and the one journal, with the real model, the real TimerSync, the real SessionProtocolV2 and the real client.
// Only the network is fake, and it keeps the promises the server keeps: a clientKey makes one session, a replayed transition makes no second change, and
// what it credits can be less than what was claimed. ADR 0010's five tests are here, by number.
import { describe, expect, it, vi } from "vitest";
import type { NativeUser } from "@sylf/shared/backend";
import { createStudySessionModel, ownerlessOffer, endedSessionsFor, parseSessionState, STUDY_SESSION_STORAGE_KEY, type StudySessionModel } from "@sylf/spaces";
import { createBackend, type Backend } from "./compose";
import type { AuthGateway } from "./gateway";
import { createSessionBridge, type SessionBridge } from "./session-bridge";

let keySerial = 0;
const ALICE = 7;
const BOB = 8;
const keys = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const memory = (shared = new Map<string, string>()) => ({ map: shared, getItem: (key: string) => shared.get(key) ?? null, setItem: (key: string, value: string) => { shared.set(key, value); } });
const nap = (ms = 5) => new Promise((done) => setTimeout(done, ms));
const until = async (done: () => boolean) => { for (let wait = 0; wait < 300 && !done(); wait++) await nap(); expect(done()).toBe(true); };

interface Row { id: number; ownerId: number; key: string; state: "RUNNING" | "PAUSED" | "ENDED"; version: number; focus: number; breaks: number; startedAt: string; endedAt: string | null; subjectId: number | null }

/** The parts of /api/sessions a journal touches. `cap` stands for the 12-hour clamp and everything else that can credit less than a claim. */
function fakeServer({ cap = Number.MAX_SAFE_INTEGER } = {}) {
  const rows: Row[] = [];
  const seen: { method: string; path: string; ownerId: number; body?: unknown }[] = [];
  let down = false;
  const execution = (row: Row) => ({ schemaVersion: 2, sessionId: row.id, ownerId: row.ownerId, questId: null, state: row.state, executionVersion: row.version, acceptedFocusSeconds: row.focus, acceptedBreakSeconds: row.breaks, startedAt: row.startedAt, endedAt: row.endedAt, actualCivilDate: "2026-11-01", timezone: "UTC" });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const transport = (who: () => number) => async (path: string, init: RequestInit = {}) => {
    if (down) throw new TypeError("Network request failed");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    seen.push({ method, path, ownerId: who(), body });
    if (path.startsWith("/api/sessions?id=")) {
      const row = rows.find((item) => item.id === Number(/id=(\d+)/.exec(path)?.[1]) && item.ownerId === who());
      return row ? json({ id: row.id, durationSeconds: row.focus, breakSeconds: row.breaks, endedAt: row.endedAt, execution: execution(row) }) : json({ error: "REFERENCE_NOT_OWNED" }, 404);
    }
    if (path === "/api/sessions" && method === "POST") {
      if (body.expectedOwnerId !== who()) return json({ error: "ACCOUNT_CHANGED", message: "Sign in to the original account to sync this saved session." }, 409);
      const existing = rows.find((item) => item.key === body.clientSessionKey && item.ownerId === who());
      if (existing) return json({ id: existing.id, execution: execution(existing) }, 201);
      const row: Row = { id: rows.length + 100, ownerId: who(), key: body.clientSessionKey, state: "RUNNING", version: 1, focus: 0, breaks: 0, startedAt: body.startedAt, endedAt: null, subjectId: body.subjectId ?? null };
      rows.push(row);
      return json({ id: row.id, execution: execution(row) }, 201);
    }
    if (path === "/api/sessions" && method === "PATCH") {
      const transition = body.executionTransition;
      const row = rows.find((item) => item.id === transition.sessionId && item.ownerId === who());
      if (!row) return json({ error: "REFERENCE_NOT_OWNED" }, 404);
      if (transition.expectedExecutionVersion !== row.version) return json({ error: "STALE_VERSION", detail: { message: "The timer changed." } }, 409);
      row.focus = Math.max(row.focus, Math.min(transition.cumulativeFocusSeconds, cap));
      row.state = transition.action === "END" ? "ENDED" : transition.action === "PAUSE" ? "PAUSED" : "RUNNING";
      if (row.state === "ENDED") row.endedAt = transition.occurredAt ?? new Date().toISOString();
      row.version++;
      return json({ execution: execution(row) });
    }
    return json({ error: "Not found" }, 404);
  };
  return { rows, seen, transport, setDown(value: boolean) { down = value; }, isDown: () => down, posts: () => seen.filter((entry) => entry.method === "POST").length };
}

type Server = ReturnType<typeof fakeServer>;
interface Device { backend: Backend; bridge: SessionBridge; session: StudySessionModel }
const clock = { at: Date.parse("2026-11-01T10:00:00Z") };
const person = (id: number): NativeUser => ({ id, email: `${id}@local.test`, username: `u${id}`, name: null, scholarId: null, verificationStatus: "VERIFIED", hunterRank: "E", level: 1, hasCompletedOnboarding: true, avatarUrl: null });

/** One install. `shared` is its preferences, so a second call with the same map is the app restarting. */
function device(server: Server, shared = new Map<string, string>(), vault: { id: number | null } = { id: null }): Device {
  let next = 0;
  const gateway: AuthGateway = {
    transport: (path, init) => server.transport(() => vault.id ?? 0)(path, init),
    restore: async () => (vault.id ? { userId: vault.id } : null),
    signIn: async ({ identifier }) => { vault.id = Number(identifier); return person(vault.id); },
    register: async () => person(0),
    signInWithProvider: async () => person(0),
    requestPasswordReset: async () => undefined,
    signOut: async () => { vault.id = null; },
    ping: async () => !server.isDown(),
  };
  const preferences = memory(shared);
  const backend = createBackend({ gateway, preferences });
  const session = createStudySessionModel(preferences, { now: () => clock.at, createKey: () => `${keys[next++ % keys.length].slice(0, -4)}${String(++keySerial).padStart(4, "0")}`, ownerId: () => backend.auth.getSnapshot().userId });
  const bridge = createSessionBridge({ session, delivery: backend.timer, auth: backend.auth, resources: backend.resources, connectivity: backend.connectivity, now: () => clock.at });
  return { backend, bridge, session };
}
const signIn = (phone: Device, id: number) => phone.backend.auth.signIn({ identifier: String(id), password: "x" });
const studied = (seconds: number) => { clock.at += seconds * 1000; };
const flush = (phone: Device) => phone.bridge.flush(2_000);
const saved = (phone: Device) => phone.session.state().ended.filter((item) => item.saved);

describe("a signed-in person's session", () => {
  it("reaches the server once, and only the server's answer makes it saved", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.start();
    await until(() => server.rows.length === 1);
    expect(server.rows[0]).toMatchObject({ ownerId: ALICE, state: "RUNNING" });
    studied(120);
    phone.session.pause();
    studied(30);
    phone.session.resume();
    studied(60);
    const ended = phone.session.end();
    expect(ended?.saved).toBe(false);
    expect(phone.session.state().ended[0].saved).toBe(false);
    await until(() => saved(phone).length === 1);
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0]).toMatchObject({ state: "ENDED", focus: 180 });
    expect(phone.session.state().ended[0]).toMatchObject({ saved: true, serverId: server.rows[0].id, acceptedFocusSeconds: 180 });
    expect(phone.bridge.state()).toMatchObject({ savedCount: 1, pending: 0 });
  });

  it("carries its subject and task to the server", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setPlan({ title: "Past paper", subject: "Physics", subjectId: 31, questId: null });
    phone.session.start();
    await until(() => server.rows.length === 1);
    expect(server.rows[0].subjectId).toBe(31);
    expect(phone.session.state().active).toMatchObject({ title: "Past paper", subject: "Physics", subjectId: 31 });
  });

  it("makes no duplicate from a restart, however the crash fell", async () => {
    const server = fakeServer();
    const shared = new Map<string, string>();
    const vault = { id: null as number | null };
    const first = device(server, shared, vault);
    await signIn(first, ALICE);
    first.session.setLength(null);
    first.session.start();
    await until(() => server.rows.length === 1);
    studied(60);
    first.session.pause();
    await flush(first);
    first.backend.timer.dispose(); first.bridge.dispose();
    // The app dies, and comes back with the same preferences. It carries on as the same session.
    const second = device(server, shared, vault);
    await second.backend.start();
    await nap(20);
    expect(second.session.state().active?.clientKey).toBe(server.rows[0].key);
    second.session.resume();
    studied(30);
    second.session.end();
    await until(() => saved(second).length === 1);
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0]).toMatchObject({ state: "ENDED", focus: 90 });
  });

  it("hands over what a crash left behind, when the model got further than the journal", async () => {
    const server = fakeServer();
    const shared = new Map<string, string>();
    const vault = { id: ALICE };
    // A session ended and written, with nothing in the journal at all: the process died between the two writes.
    const stored = { version: 1, length: 25, plan: null, active: null, ended: [{ clientKey: keys[1], ownerId: ALICE, subjectId: null, questId: null, journaled: 0, declined: false, title: "Study session", subject: null, startedAt: clock.at - 90_000, endedAt: clock.at, focusSeconds: 90, breakSeconds: 0, operations: [{ id: `${keys[1]}:END`, action: "END", sequence: 1, focus: 90, breaks: 0, at: new Date(clock.at).toISOString() }], saved: false, serverId: null, acceptedFocusSeconds: null }] };
    shared.set(STUDY_SESSION_STORAGE_KEY, JSON.stringify(stored));
    const phone = device(server, shared, vault);
    await phone.backend.start();
    await until(() => saved(phone).length === 1);
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0]).toMatchObject({ focus: 90, state: "ENDED" });
  });

  it("stays unsaved offline, keeps counting, and saves itself on reconnection", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    server.setDown(true);
    phone.session.setLength(null);
    phone.session.start();
    studied(300);
    phone.session.end();
    await nap(30);
    expect(saved(phone)).toHaveLength(0);
    expect(server.rows).toHaveLength(0);
    expect(phone.backend.connectivity.state()).toBe("offline");
    expect(phone.bridge.state()).toMatchObject({ offline: true });
    expect(phone.bridge.state().pending).toBeGreaterThan(0);
    server.setDown(false);
    phone.backend.connectivity.report(true);
    await until(() => saved(phone).length === 1);
    expect(server.rows[0]).toMatchObject({ state: "ENDED", focus: 300 });
    expect(phone.bridge.state().pending).toBe(0);
  });

  it("shows what the server credited, past the 12-hour cap or for any other reason", async () => {
    const server = fakeServer({ cap: 43_200 });
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.start();
    studied(13 * 3600);
    phone.session.end();
    await until(() => saved(phone).length === 1);
    expect(phone.session.state().ended[0]).toMatchObject({ focusSeconds: 46_800, acceptedFocusSeconds: 43_200, saved: true });
    expect(phone.bridge.state().lastSaved?.acceptedFocusSeconds).toBe(43_200);
  });

  it("lets accepted state win: a pause and an end from another device arrive on the next wake", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.start();
    await until(() => server.rows.length === 1);
    await flush(phone);
    studied(100);
    // The journal re-reads a quiet session at most every 30 seconds, so nothing here polls. Time moves on past that.
    const real = Date.now.bind(Date);
    let ahead = 0;
    const later = vi.spyOn(Date, "now").mockImplementation(() => real() + ahead);
    Object.assign(server.rows[0], { state: "PAUSED", focus: 80, version: 2 });
    ahead += 31_000;
    phone.backend.timer.wake();
    await until(() => phone.session.status() === "paused");
    expect(phone.session.readout().focusSeconds).toBe(80);
    Object.assign(server.rows[0], { state: "ENDED", focus: 85, version: 3, endedAt: new Date(clock.at).toISOString() });
    ahead += 31_000;
    phone.backend.timer.wake();
    await until(() => phone.session.status() === "idle");
    later.mockRestore();
    expect(phone.session.state().ended[0]).toMatchObject({ saved: true, focusSeconds: 85, acceptedFocusSeconds: 85 });
  });

  it("invalidates what a finished session changes, and nothing is computed here", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    let reads = 0;
    const progress = phone.backend.resources.resource({ key: "probe", tags: ["progress"], load: async () => ++reads });
    const stop = progress.subscribe(() => undefined);
    await nap();
    phone.session.start();
    studied(60);
    phone.session.end();
    await until(() => saved(phone).length === 1);
    await nap();
    expect(reads).toBeGreaterThan(1);
    stop();
  });
});

describe("ADR 0010", () => {
  const ownerless = async (server: Server) => {
    const phone = device(server);
    await phone.backend.start();
    phone.session.setLength(null);
    phone.session.start();
    studied(600);
    phone.session.end();
    return phone;
  };

  it("test 1: an ownerless session is never sent, with or without a sign-in", async () => {
    const server = fakeServer();
    const phone = await ownerless(server);
    await signIn(phone, ALICE);
    await flush(phone);
    await nap(20);
    expect(server.posts()).toBe(0);
    expect(phone.session.state().ended[0]).toMatchObject({ ownerId: null, saved: false });
  });

  it("test 2: declining leaves it untouched, and accepting delivers it once, with a replay making no second session", async () => {
    const server = fakeServer();
    const declined = await ownerless(server);
    await signIn(declined, ALICE);
    declined.bridge.decline([declined.session.state().ended[0].clientKey]);
    await nap(20);
    expect(server.posts()).toBe(0);
    expect(declined.session.state().ended[0]).toMatchObject({ ownerId: null, declined: true, saved: false });
    expect(ownerlessOffer(declined.session.state(), 0, clock.at)).toBeNull();

    const accepted = await ownerless(server);
    await signIn(accepted, ALICE);
    const offer = ownerlessOffer(accepted.session.state(), 0, clock.at);
    expect(offer).toMatchObject({ count: 1, focusSeconds: 600 });
    accepted.bridge.claim(offer!.clientKeys);
    await until(() => saved(accepted).length === 1);
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0]).toMatchObject({ ownerId: ALICE, focus: 600, state: "ENDED" });
    expect(accepted.session.state().ended[0].ownerId).toBe(ALICE);
    accepted.backend.timer.wake();
    await nap(20);
    expect(server.rows).toHaveLength(1);
  });

  it("test 3: another account cannot see or take someone's undelivered session", async () => {
    const server = fakeServer();
    server.setDown(true);
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.start();
    studied(600);
    phone.session.end();
    await nap(20);
    server.setDown(false);
    await phone.backend.auth.signOut();
    await signIn(phone, BOB);
    phone.backend.connectivity.report(true);
    await flush(phone);
    await nap(20);
    expect(server.rows).toHaveLength(0);
    const state = phone.session.state();
    expect(endedSessionsFor(state, BOB)).toEqual([]);
    expect(ownerlessOffer(state, 0, clock.at)).toBeNull();
    // The right person comes back, and it arrives.
    await phone.backend.auth.signOut();
    await signIn(phone, ALICE);
    await until(() => saved(phone).length === 1);
    expect(server.rows[0]).toMatchObject({ ownerId: ALICE, focus: 600 });
  });

  it("test 4: a session from before the account existed is not offered", async () => {
    const server = fakeServer();
    const phone = await ownerless(server);
    const sessionStart = phone.session.state().ended[0].startedAt;
    expect(ownerlessOffer(phone.session.state(), sessionStart + 1, clock.at)).toBeNull();
    expect(ownerlessOffer(phone.session.state(), sessionStart, clock.at)).not.toBeNull();
  });

  it("test 5: Phase 10's stored state parses as ownerless and unsaved", () => {
    const parsed = parseSessionState({ version: 1, length: 25, active: null, ended: [{ clientKey: "old", title: "Old", subject: null, startedAt: 1, endedAt: 2, focusSeconds: 1, breakSeconds: 0, operations: [], saved: false }] });
    expect(parsed.ended[0]).toMatchObject({ ownerId: null, saved: false, subjectId: null, questId: null, journaled: 0, declined: false, serverId: null, acceptedFocusSeconds: null });
    expect(parsed.plan).toBeNull();
  });
});

describe("when the account changes", () => {
  it("stops a session when its owner's sign-in ends, so nobody can claim the time after it", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.start();
    studied(60);
    phone.backend.auth.sessionEnded();
    expect(phone.session.status()).toBe("paused");
    studied(3600);
    expect(phone.session.readout().focusSeconds).toBe(60);
  });

  it("closes the last person's session as the next signs in, and drops the plan, and it still reaches its owner", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.setLength(null);
    phone.session.setPlan({ title: "Alice's task", subject: "Alice's subject", subjectId: 3, questId: 4 });
    phone.session.start();
    await until(() => server.rows.length === 1);
    studied(60);
    phone.backend.auth.sessionEnded();
    await signIn(phone, BOB);
    expect(phone.session.state().active).toBeNull();
    expect(phone.session.state().plan).toBeNull();
    expect(endedSessionsFor(phone.session.state(), BOB)).toEqual([]);
    await phone.backend.auth.signOut();
    await signIn(phone, ALICE);
    await until(() => saved(phone).length === 1);
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0]).toMatchObject({ ownerId: ALICE, state: "ENDED", focus: 60 });
  });

  it("never lets one person's journal reach the other's account", async () => {
    const server = fakeServer();
    const phone = device(server);
    await signIn(phone, ALICE);
    phone.session.start();
    await until(() => server.rows.length === 1);
    studied(30);
    phone.session.end();
    await until(() => saved(phone).length === 1);
    await phone.backend.auth.signOut();
    await signIn(phone, BOB);
    phone.session.start();
    await until(() => server.rows.length === 2);
    expect(server.rows.map((row) => row.ownerId)).toEqual([ALICE, BOB]);
  });
});
