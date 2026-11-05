// The room mirror (owner decision E-13): the study session stays the only clock and record, the room only hears about it. These tests pin that the mirror
// never blocks or changes the session, retries when the room cannot be reached, and recovers a seat so a lost exit can still be replayed.
import { describe, expect, it, vi } from "vitest";
import { createStudySessionModel } from "@sylf/spaces";
import type { AuthModel } from "./auth-model";
import type { Connectivity } from "./connectivity";
import { BackendError } from "./errors";
import { createPartyPresence } from "./party-presence";
import type { PartyReads, PartyState } from "./party";

const START = 1_780_000_000_000;
const nap = (ms = 2) => new Promise((done) => setTimeout(done, ms));
const until = async (done: () => boolean) => { for (let wait = 0; wait < 200 && !done(); wait++) await nap(); expect(done()).toBe(true); };

const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };
const auth = (userId: number | null) => ({ getSnapshot: () => ({ status: userId ? "signed-in" : "signed-out", userId, user: null, ended: false }), subscribe: () => () => undefined }) as unknown as AuthModel;
const online = (): Connectivity => ({ state: () => "online", subscribe: () => () => undefined, report: () => undefined, wait: () => () => undefined, wake: () => undefined });
const room = (me: number): PartyState => ({ party: { id: 5, name: "Night owls", leaderId: me }, members: [{ userId: me, username: "me" }], activeSession: { id: 31, members: [{ userId: me, timerState: "FOCUSING", joinedAt: "2026-11-05T01:00:00.000Z" }] } });

function fakeParties(overrides: Partial<PartyReads> = {}) {
  const calls: string[] = [];
  const parties = {
    state: async () => room(7),
    timer: vi.fn(async (_party: number, action: string) => { calls.push(action); return { sessionId: 31 }; }),
    enter: vi.fn(async () => { calls.push("enter"); return { sessionId: 31 }; }),
    ...overrides,
  } as unknown as PartyReads;
  return { parties, calls };
}

describe("party presence", () => {
  it("starts, pauses and resumes the room with the session, and seats the record", async () => {
    const session = createStudySessionModel(memory(), { now: () => START, ownerId: () => 7 });
    const { parties, calls } = fakeParties();
    const presence = createPartyPresence({ session, parties, auth: auth(7), connectivity: online(), retryMs: 5 });
    session.start({ party: { partyId: 5, name: "Night owls" } });
    await until(() => session.state().active?.party?.roomSessionId === 31);
    expect(session.state().active?.party?.joinedAt).toBe("2026-11-05T01:00:00.000Z");
    session.pause();
    await until(() => calls.includes("pause"));
    session.resume();
    await until(() => calls.filter((call) => call === "resume").length === 1);
    expect(calls.slice(0, 3)).toEqual(["start", "pause", "resume"]);
    expect(presence.state().link).toBe("in-room");
    presence.dispose();
  });
  it("keeps the session counting when the room cannot be reached, and says so", async () => {
    const session = createStudySessionModel(memory(), { now: () => START, ownerId: () => 7 });
    const { parties } = fakeParties({ timer: vi.fn(async () => { throw new BackendError("offline", "offline"); }) as never });
    const presence = createPartyPresence({ session, parties, auth: auth(7), connectivity: online(), retryMs: 1_000 });
    session.start({ party: { partyId: 5, name: "Night owls" } });
    await until(() => presence.state().link === "retrying");
    expect(session.status()).toBe("running");
    expect(presence.state().message).toMatch(/still counts/);
    presence.dispose();
  });
  it("stops asking after a definite refusal, and the session carries on", async () => {
    const session = createStudySessionModel(memory(), { now: () => START, ownerId: () => 7 });
    const timer = vi.fn(async () => { throw new BackendError("not-found", "gone"); });
    const presence = createPartyPresence({ session, parties: fakeParties({ timer: timer as never }).parties, auth: auth(7), connectivity: online(), retryMs: 2 });
    session.start({ party: { partyId: 5, name: "Night owls" } });
    await until(() => presence.state().link === "unavailable");
    await nap(20);
    expect(timer).toHaveBeenCalledTimes(1);
    expect(session.status()).toBe("running");
    presence.dispose();
  });
  it("seats a session that ended before it learned its seat, so the journal can leave", async () => {
    let fail = true;
    const session = createStudySessionModel(memory(), { now: () => START, ownerId: () => 7 });
    const { parties } = fakeParties({ timer: vi.fn(async () => { if (fail) throw new BackendError("timeout", "slow"); return { sessionId: 31 }; }) as never });
    const presence = createPartyPresence({ session, parties, auth: auth(7), connectivity: online(), retryMs: 1_000 });
    session.start({ party: { partyId: 5, name: "Night owls" } });
    await nap(10);
    fail = false;
    session.end();
    await until(() => session.state().ended[0]?.party?.roomSessionId === 31);
    expect(session.state().ended[0].party?.joinedAt).toBe("2026-11-05T01:00:00.000Z");
    presence.dispose();
  });
  it("ignores a solo session and another person's session", async () => {
    const session = createStudySessionModel(memory(), { now: () => START, ownerId: () => 7 });
    const { parties, calls } = fakeParties();
    const presence = createPartyPresence({ session, parties, auth: auth(8), connectivity: online(), retryMs: 5 });
    session.start({ party: { partyId: 5, name: "x" } });
    await nap(20);
    expect(calls).toEqual([]);
    presence.dispose();
  });
});
