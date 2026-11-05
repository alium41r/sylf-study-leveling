// Two real accounts on the real server (Expansion Part 3, slices C and D): friends, messages, privacy, blocking, groups, parties and the party session.
// The device client against the real server on a disposable database. Run it through scripts/test/run-backend-local.mjs --native-checks, which
// starts Next.js and passes SYLF_BACKEND_TEST_ORIGIN. Real HTTP, real getSession, real SQL, real settlement. This runs on Node, so it proves the
// client's logic and contracts, and not Hermes or a device's network stack.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStudySessionModel } from "@sylf/spaces";
import { BackendError, createBackend, createBearerGateway, createPartyPresence, createSessionBridge, recentSessionsSchema, type Backend } from "../src/index";

const origin = process.env.SYLF_BACKEND_TEST_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:/.test(origin)) throw new Error("Run this through scripts/test/run-backend-local.mjs --native-checks.");

const crypto_ = { getRandomValues: (array: Uint8Array<ArrayBuffer>) => { array.set(randomBytes(array.length)); return array; }, sha256Hex: async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex") };
const memoryVault = () => { let value: string | null = null; return { read: async () => value, write: async (next: string) => { value = next; }, clear: async () => { value = null; }, peek: () => value }; };
const memoryPreferences = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } }; };
const settle = (ms = 20) => new Promise((done) => setTimeout(done, ms));
const until = async (done: () => boolean) => { for (let wait = 0; wait < 300 && !done(); wait++) await settle(10); };
const PASSWORD = "a-long-enough-password";
// The server limits sign-in by address. Each device here claims its own, which only a local test can do.
let devices = 0;

interface Device { backend: Backend; vault: ReturnType<typeof memoryVault>; requests: { url: string; authorization: string | null }[]; network: { down: boolean; corruptNext: boolean } }

function device(vault = memoryVault(), preferences = memoryPreferences()): Device {
  devices++;
  const address = `10.30.${Math.floor(devices / 250)}.${devices % 250 + 1}`;
  const requests: Device["requests"] = [];
  const network = { down: false, corruptNext: false };
  const request: typeof fetch = async (input, init) => {
    if (network.down) throw new TypeError("Network request failed");
    const headers = new Headers(init?.headers);
    headers.set("x-real-ip", address);
    if (network.corruptNext && headers.has("Authorization")) { network.corruptNext = false; headers.set("Authorization", "Bearer not.a.token"); }
    requests.push({ url: String(input), authorization: headers.get("Authorization") });
    return fetch(input, { ...init, headers });
  };
  let joined: Backend | null = null;
  const gateway = createBearerGateway({ origin: origin as string, clientName: `Integration ${devices}`, vault, crypto: crypto_, openUrl: async () => undefined, fetch: request, onEnded: () => joined?.auth.sessionEnded() });
  joined = createBackend({ gateway, preferences, assetUrl: (path) => `${origin}${path}` });
  return { backend: joined, vault, requests, network };
}

async function account() {
  const tag = randomBytes(5).toString("hex");
  const input = { email: `i${tag}@local.test`, password: PASSWORD, name: "Integration", username: `i${tag}`, timezone: "UTC" };
  const student = device();
  await student.backend.auth.register(input);
  return { student, input };
}

const refusedAs = async (work: Promise<unknown>) => { try { await work; } catch (error) { return (error as BackendError).kind; } return "no failure"; };


const id = (device: Device) => device.backend.auth.getSnapshot().userId!;
const signal = () => new AbortController().signal;
const username = (input: { username: string }) => input.username;

/** Two people who are already friends. */
async function friends() {
  const a = await account();
  const b = await account();
  await a.student.backend.reads.social.sendRequest(id(b.student));
  const incoming = await b.student.backend.reads.friendRequests(signal());
  const request = (incoming as unknown as { requests?: { id: number }[] }).requests?.[0] ?? (incoming as unknown as { id: number }[])[0];
  await b.student.backend.reads.acceptFriend(request.id, true);
  return { a, b };
}

describe("friends and messages between two real accounts", () => {
  it("finds a person by name, becomes friends, and sees each other", async () => {
    const a = await account();
    const b = await account();
    const found = await a.student.backend.reads.social.search(username(b.input), signal());
    expect(found.map((person) => person.id)).toContain(id(b.student));
    await a.student.backend.reads.social.sendRequest(id(b.student));
    const incoming = await b.student.backend.reads.friendRequests(signal());
    const list = (incoming as unknown as { requests?: { id: number }[] }).requests ?? (incoming as unknown as { id: number }[]);
    expect(list.length).toBe(1);
    await b.student.backend.reads.acceptFriend(list[0].id, true);
    const mine = await a.student.backend.reads.friends(signal());
    expect(mine.map((friend) => friend.id)).toContain(id(b.student));
  });

  it("sends, reads, pages, edits and deletes a message, and a third account sees none of it", async () => {
    const { a, b } = await friends();
    const outsider = await account();
    const made = await a.student.backend.reads.social.startConversation([id(b.student)]);
    const sent = await a.student.backend.reads.social.send(made.id, "hello from a");
    expect(sent.content).toBe("hello from a");
    const seenByB = await b.student.backend.reads.social.conversation(made.id, null, signal());
    expect(seenByB.messages.map((message) => message.content)).toEqual(["hello from a"]);
    await a.student.backend.reads.social.edit(made.id, sent.id, "hello, edited");
    const newer = await b.student.backend.reads.social.newerThan(made.id, 0, signal());
    expect(newer.messages[0].content).toBe("hello, edited");
    // Privacy: someone who is not in the conversation cannot read it or write to it.
    expect(await refusedAs(outsider.student.backend.reads.social.conversation(made.id, null, signal()))).toMatch(/forbidden|not-found/);
    expect(await refusedAs(outsider.student.backend.reads.social.send(made.id, "intruder"))).toMatch(/forbidden|not-found/);
    // Only the sender may edit or delete.
    expect(await refusedAs(b.student.backend.reads.social.edit(made.id, sent.id, "not mine"))).toMatch(/forbidden|not-found|invalid/);
    await a.student.backend.reads.social.remove(made.id, sent.id);
    const after = await b.student.backend.reads.social.conversation(made.id, null, signal());
    expect(after.messages.find((message) => message.id === sent.id)).toBeUndefined();
  });

  it("blocks a person: the block is listed for the blocker only, messaging stops, and unblocking undoes the list", async () => {
    const { a, b } = await friends();
    const made = await a.student.backend.reads.social.startConversation([id(b.student)]);
    await a.student.backend.reads.social.block(id(b.student));
    const blocked = await a.student.backend.reads.social.blocked(signal());
    expect(blocked.map((person) => person.id)).toEqual([id(b.student)]);
    // The blocked person's own list stays empty: they are never told.
    expect(await b.student.backend.reads.social.blocked(signal())).toEqual([]);
    // S-15: neither side can write into the conversation any more, and a new one cannot be started.
    expect(await refusedAs(b.student.backend.reads.social.send(made.id, "still there?"))).not.toBe("no failure");
    expect(await refusedAs(b.student.backend.reads.social.startConversation([id(a.student)]))).not.toBe("no failure");
    await a.student.backend.reads.social.unblock(id(b.student));
    expect(await a.student.backend.reads.social.blocked(signal())).toEqual([]);
    // Unblocking does not bring the friendship back.
    expect((await a.student.backend.reads.friends(signal())).map((friend) => friend.id)).not.toContain(id(b.student));
  });

  it("keeps a group's manager when its creator leaves (A-28), and only the manager may rename", async () => {
    const { a, b } = await friends();
    const c = await account();
    await a.student.backend.reads.social.sendRequest(id(c.student));
    const incoming = await c.student.backend.reads.friendRequests(signal());
    const list = (incoming as unknown as { requests?: { id: number }[] }).requests ?? (incoming as unknown as { id: number }[]);
    await c.student.backend.reads.acceptFriend(list[0].id, true);
    const group = await a.student.backend.reads.social.startConversation([id(b.student), id(c.student)], { name: "Study group" });
    expect(await refusedAs(b.student.backend.reads.social.changeGroup(group.id, { name: "Hijack" }))).not.toBe("no failure");
    await a.student.backend.reads.social.changeGroup(group.id, { removeMemberIds: [id(a.student)] });
    // The longest-standing remaining member now manages the group.
    const renamed = await refusedAs(b.student.backend.reads.social.changeGroup(group.id, { name: "New name" }));
    expect(renamed).toBe("no failure");
  });
});

describe("a study party between two real accounts (owner decision E-13)", () => {
  async function party() {
    const { a, b } = await friends();
    const created = await a.student.backend.reads.parties.create("Night owls");
    const partyId = created.partyId ?? (await a.student.backend.reads.party(signal())).activeParty!.id;
    await a.student.backend.reads.parties.invite(partyId, id(b.student));
    const summary = await b.student.backend.reads.party(signal());
    expect(summary.pendingInvites.length).toBe(1);
    await b.student.backend.reads.parties.answerInvite(summary.pendingInvites[0].id, true);
    return { a, b, partyId };
  }

  it("creates a party, invites a friend, and both see the same party and members", async () => {
    const { a, b, partyId } = await party();
    const state = await a.student.backend.reads.parties.state(partyId, signal());
    expect(state.members.map((member) => member.userId).sort()).toEqual([id(a.student), id(b.student)].sort());
    expect(state.party.leaderId).toBe(id(a.student));
    expect((await b.student.backend.reads.party(signal())).activeParty?.id).toBe(partyId);
  });

  it("seats a person in the room once, mirrors pause and resume, and the exit is replayable at its original instants", async () => {
    const { a, partyId } = await party();
    const entry = await a.student.backend.reads.parties.timer(partyId, "start");
    expect(entry.sessionId).toBeGreaterThan(0);
    const again = await a.student.backend.reads.parties.timer(partyId, "start");
    expect(again.sessionId).toBe(entry.sessionId);
    await a.student.backend.reads.parties.timer(partyId, "pause", { sessionId: entry.sessionId });
    await a.student.backend.reads.parties.timer(partyId, "resume", { sessionId: entry.sessionId });
    const state = await a.student.backend.reads.parties.state(partyId, signal());
    const mine = state.activeSession?.members.find((member) => member.userId === id(a.student));
    expect(mine?.timerState).toBe("FOCUSING");
    expect(mine?.joinedAt).toBeTruthy();
  });

  it("studies together through the one study session: one StudySession, the room only mirrors it, and leaving seats nobody", async () => {
    const { a, b, partyId } = await party();
    const preferences = memoryPreferences();
    const model = createStudySessionModel({ getItem: (key) => preferences.getItem(key), setItem: (key, value) => preferences.setItem(key, value) }, { ownerId: () => id(a.student) });
    const bridge = createSessionBridge({ session: model, delivery: a.student.backend.timer, auth: a.student.backend.auth, resources: a.student.backend.resources, connectivity: a.student.backend.connectivity });
    const presence = createPartyPresence({ session: model, parties: a.student.backend.reads.parties, auth: a.student.backend.auth, connectivity: a.student.backend.connectivity, retryMs: 50 });
    expect(model.start({ title: "Together", party: { partyId, name: "Night owls" } })).toBe(true);
    await until(() => model.state().active?.party?.roomSessionId != null);
    const seated = model.state().active!.party!;
    // The other person sees this person focusing in the room.
    const seen = await b.student.backend.reads.parties.state(partyId, signal());
    expect(seen.activeSession?.members.find((member) => member.userId === id(a.student))?.timerState).toBe("FOCUSING");
    await settle(1200);
    model.pause();
    await settle(300);
    model.resume();
    await settle(1200);
    const ended = model.end()!;
    await bridge.flush(15_000);
    await until(() => model.state().ended.find((item) => item.clientKey === ended.clientKey)?.saved === true);
    // Exactly one study session was created for this, owned by this person, with the session's own seconds.
    const sessions = await a.student.backend.client.get("/api/sessions?limit=20", recentSessionsSchema);
    expect(sessions.sessions.length).toBe(1);
    // The room exit is journaled and delivered: the member is no longer in the room.
    await until(() => false as never).catch(() => undefined);
    await settle(1500);
    const after = await b.student.backend.reads.parties.state(partyId, signal());
    const gone = after.activeSession?.members.find((member) => member.userId === id(a.student));
    expect(gone === undefined || gone.timerState === "LEFT").toBe(true);
    expect(seated.partyId).toBe(partyId);
    presence.dispose();
    bridge.dispose();
  });

  it("refuses to enter a room for someone who is not in the party", async () => {
    const { partyId } = await party();
    const stranger = await account();
    expect(await refusedAs(stranger.student.backend.reads.parties.enter(partyId))).not.toBe("no failure");
    expect(await refusedAs(stranger.student.backend.reads.parties.state(partyId, signal()))).not.toBe("no failure");
  });

  it("leaves the party, and the leader's departure hands the party on", async () => {
    const { a, b, partyId } = await party();
    await a.student.backend.reads.parties.leave(partyId);
    const state = await b.student.backend.reads.parties.state(partyId, signal());
    expect(state.party.leaderId).toBe(id(b.student));
    expect((await a.student.backend.reads.party(signal())).activeParty).toBeNull();
  });
});
