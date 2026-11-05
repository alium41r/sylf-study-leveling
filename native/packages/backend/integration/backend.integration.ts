// The device client against the real server on a disposable database. Run it through scripts/test/run-backend-local.mjs --native-checks, which
// starts Next.js and passes SYLF_BACKEND_TEST_ORIGIN. Real HTTP, real getSession, real SQL, real settlement. This runs on Node, so it proves the
// client's logic and contracts, and not Hermes or a device's network stack.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { TimerSync } from "@sylf/shared/backend";
import { createStudySessionModel, type StudySessionModel } from "@sylf/spaces";
import { BackendError, createBackend, createBearerGateway, createJournalStorage, createSessionBridge, questPageSchema, recentSessionsSchema, studySummarySchema, userStatsSchema, type Backend, type SessionBridge } from "../src/index";

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

describe("a signed-in device", () => {
  let student: Device; let userId: number;
  beforeAll(async () => { ({ student } = await account()); userId = student.backend.auth.getSnapshot().userId!; });
  afterAll(() => student.backend.timer.dispose());

  it("reads typed data as itself", async () => {
    const stats = await student.backend.client.get("/api/user/stats", userStatsSchema);
    expect(stats).toMatchObject({ hunterRank: "E", level: 1, streakDays: 0 });
  });

  it("gets contracts that match the real routes, empty account included", async () => {
    const { client } = student.backend;
    expect((await client.get("/api/sessions?limit=20", recentSessionsSchema)).sessions).toEqual([]);
    expect((await client.get("/api/user/detailed-stats?summary=true", studySummarySchema)).dailyStudy).toHaveLength(30);
    expect((await client.get("/api/quests?all=true&limit=20", questPageSchema)).nextCursor).toBeNull();
  });

  it("makes one request for concurrent reads, by counting what really left", async () => {
    const before = student.requests.length;
    await Promise.all([1, 2, 3, 4].map(() => student.backend.client.get("/api/user/stats", userStatsSchema)));
    expect(student.requests.length - before).toBe(1);
  });

  it("refreshes and replays when the server refuses an access token, and the caller never notices", async () => {
    const first = (await student.backend.client.get("/api/user/stats", userStatsSchema)).level;
    student.network.corruptNext = true;
    expect((await student.backend.client.get("/api/user/stats", userStatsSchema)).level).toBe(first);
    expect(student.requests.some((entry) => entry.url.endsWith("/api/auth/native/token"))).toBe(true);
  });

  it("sends no cookie, and the server sets none", async () => {
    const response = await student.backend.client.fetch("/api/user/stats");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("cancels a real request", async () => {
    const controller = new AbortController();
    const work = student.backend.client.get("/api/user/detailed-stats", z.unknown(), { signal: controller.signal });
    controller.abort();
    expect(await refusedAs(work)).toBe("cancelled");
  });

  it("delivers a study session through the real TimerSync, once, into real ledgers", async () => {
    const preferences = memoryPreferences();
    const sync = new TimerSync(userId, createJournalStorage(preferences), student.backend.client.fetch);
    const clientKey = randomUUID();
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    sync.create({ ownerId: userId, clientKey, startedAt });
    sync.enqueue(clientKey, "PAUSE", 120, 0, new Date(Date.now() - 8 * 60_000).toISOString());
    sync.enqueue(clientKey, "RESUME", 120, 30, new Date(Date.now() - 7 * 60_000).toISOString());
    sync.finish(clientKey, 300, 30);
    sync.start();
    await sync.drain(true);
    expect(sync.status()).toEqual({ pending: 0, error: null });
    const journal = sync.journal(clientKey);
    expect(journal).toMatchObject({ settled: true });
    const { sessions } = await student.backend.client.get("/api/sessions?limit=10", recentSessionsSchema);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(journal!.sessionId);
    // The account is seconds old, so the server moves the start to its creation and credits only what fits (ADR 0010). It decides, not the client.
    expect(sessions[0].durationSeconds).toBeGreaterThan(0);
    expect(sessions[0].durationSeconds).toBeLessThan(300);
    const stats = await student.backend.client.get("/api/user/stats", z.object({ totalStudySeconds: z.number().optional(), totalStudyMinutes: z.number().optional() }));
    expect((stats.totalStudySeconds ?? (stats.totalStudyMinutes ?? 0) * 60)).toBeGreaterThan(0);

    // A device restart replaying the same journal changes nothing.
    const replay = new TimerSync(userId, createJournalStorage(preferences), student.backend.client.fetch);
    replay.start();
    await replay.drain(true);
    expect((await student.backend.client.get("/api/sessions?limit=10", recentSessionsSchema)).sessions).toHaveLength(1);
    sync.stop(); replay.stop();
  });

  it("makes no second session from a replayed start", async () => {
    const clientKey = randomUUID(); const startedAt = new Date(Date.now() - 60_000).toISOString();
    const body = { executionProtocol: 2, clientSessionKey: clientKey, startedAt, expectedOwnerId: userId };
    const first = await student.backend.client.send<{ id: number }>("POST", "/api/sessions", { body });
    const second = await student.backend.client.send<{ id: number }>("POST", "/api/sessions", { body });
    expect(second.id).toBe(first.id);
    await student.backend.client.send("PATCH", "/api/sessions", { body: { executionTransition: { schemaVersion: 2, sessionId: first.id, action: "END", expectedExecutionVersion: 1, idempotencyKey: randomUUID(), cumulativeFocusSeconds: 30, cumulativeBreakSeconds: 0 } } }).catch(() => undefined);
  });

  it("resolves a catalog's relative audio URL to something loadable", async () => {
    const catalog = await student.backend.client.get("/api/acoustics", z.unknown());
    const relative = JSON.stringify(catalog).match(/"(\/audio\/[^"]+)"/)?.[1];
    if (!relative) return;
    const url = student.backend.client.assetUrl(relative);
    expect(url.startsWith(origin as string)).toBe(true);
    expect((await fetch(encodeURI(url), { headers: { Range: "bytes=0-9" } })).status).toBe(206);
  });
});

describe("distinct people", () => {
  it("keeps a second person out of the first one's session and journal", async () => {
    const first = await account(); const second = await account();
    const firstId = first.student.backend.auth.getSnapshot().userId!;
    const started = await first.student.backend.client.send<{ id: number }>("POST", "/api/sessions", { body: { executionProtocol: 2, clientSessionKey: randomUUID(), startedAt: new Date().toISOString() } });
    expect(await refusedAs(second.student.backend.client.get(`/api/sessions?id=${started.id}`, z.unknown()))).toBe("not-found");
    expect(await refusedAs(second.student.backend.client.get(`/api/sessions?id=${started.id}&expectedOwnerId=${firstId}`, z.unknown()))).toBe("conflict");
    expect(await refusedAs(second.student.backend.client.send("POST", "/api/sessions", { body: { executionProtocol: 2, clientSessionKey: randomUUID(), startedAt: new Date().toISOString(), expectedOwnerId: firstId } }))).toBe("conflict");
  });

  it("reports TimerSync's ACCOUNT_CHANGED rather than crediting the wrong person", async () => {
    const first = await account(); const second = await account();
    const firstId = first.student.backend.auth.getSnapshot().userId!;
    // A journal owned by the first person, sent over the second person's session.
    const sync = new TimerSync(firstId, createJournalStorage(memoryPreferences()), second.student.backend.client.fetch);
    const clientKey = randomUUID();
    sync.create({ ownerId: firstId, clientKey, startedAt: new Date(Date.now() - 120_000).toISOString() });
    sync.finish(clientKey, 60, 0);
    sync.start();
    await sync.drain(true);
    expect(sync.status().pending).toBeGreaterThan(0);
    expect(sync.status().error).toContain("original account");
    expect((await second.student.backend.client.get("/api/sessions?limit=5", recentSessionsSchema)).sessions).toEqual([]);
    sync.stop();
  });
});

describe("session lifecycle", () => {
  it("restores after a restart from the vault alone, then refreshes", async () => {
    const { student } = await account();
    const userId = student.backend.auth.getSnapshot().userId;
    const reborn = device(student.vault);
    await reborn.backend.start();
    expect(reborn.backend.auth.getSnapshot()).toMatchObject({ status: "signed-in", userId, user: null });
    // Restoring reads the vault and asks for no token. The presence heartbeat is not a data request, so it is left out of the count.
    const asked = () => reborn.requests.filter((entry) => !entry.url.endsWith("/api/user/heartbeat"));
    expect(asked()).toHaveLength(0);
    expect((await reborn.backend.client.get("/api/user/stats", userStatsSchema)).level).toBe(1);
    expect(asked()[0].url).toContain("/api/auth/native/token");
  });

  it("signs out on this device, and the copied token dies at the server", async () => {
    const { student } = await account();
    await student.backend.client.get("/api/user/stats", userStatsSchema);
    const copied = student.requests.at(-1)!.authorization!;
    await student.backend.auth.signOut();
    expect(student.vault.peek()).toBeNull();
    expect((await fetch(`${origin}/api/user/stats`, { headers: { authorization: copied } })).status).toBe(401);
  });

  it("ends a device when another device signs out everywhere, and tells the app why", async () => {
    const { student, input } = await account();
    const other = device();
    await other.backend.auth.signIn({ identifier: input.email, password: input.password });
    await student.backend.client.get("/api/user/stats", userStatsSchema);
    const stats = student.backend.resources.resource({ key: "stats", load: (signal) => student.backend.client.get("/api/user/stats", userStatsSchema, { signal }) });
    stats.subscribe(() => undefined);
    await settle(150);
    expect(stats.getSnapshot().status).toBe("ready");
    await other.backend.client.send("POST", "/api/auth/logout-all", { body: { password: input.password } });
    await refusedAs(student.backend.client.get("/api/user/stats", userStatsSchema));
    await settle();
    expect(student.backend.auth.getSnapshot()).toMatchObject({ status: "signed-out", ended: true });
    expect(student.vault.peek()).toBeNull();
    expect(student.backend.resources.size()).toBe(0);
  });

  it("keeps undelivered work through a sign-out, and delivers it when the same person returns", async () => {
    const { student, input } = await account();
    const userId = student.backend.auth.getSnapshot().userId!;
    const preferences = memoryPreferences();
    const storage = createJournalStorage(preferences);
    const clientKey = randomUUID();
    new TimerSync(userId, storage, student.backend.client.fetch).create({ ownerId: userId, clientKey, startedAt: new Date(Date.now() - 300_000).toISOString() });
    new TimerSync(userId, storage, student.backend.client.fetch).finish(clientKey, 120, 0);
    await student.backend.auth.signOut();
    expect(createJournalStorage(preferences).length).toBeGreaterThan(0);

    const returning = device(memoryVault(), preferences);
    await returning.backend.auth.signIn({ identifier: input.email, password: input.password });
    const active = returning.backend.timer.current();
    expect(active?.ownerId).toBe(userId);
    await active?.drain(true);
    expect(active?.status()).toEqual({ pending: 0, error: null });
    expect((await returning.backend.client.get("/api/sessions?limit=5", recentSessionsSchema)).sessions).toHaveLength(1);
    returning.backend.timer.dispose();
  });

  it("keeps a session across a network failure, and recovers by itself", async () => {
    const { student } = await account();
    await student.backend.client.get("/api/user/stats", userStatsSchema);
    const stats = student.backend.resources.resource({ key: "stats", load: (signal) => student.backend.client.get("/api/user/stats", userStatsSchema, { signal, retries: 0 }), ttlMs: 0 });
    stats.subscribe(() => undefined);
    await settle(100);
    expect(stats.getSnapshot().status).toBe("ready");
    student.network.down = true;
    stats.refresh();
    await settle(50);
    expect(stats.getSnapshot()).toMatchObject({ status: "offline", stale: true });
    expect(stats.getSnapshot().data).not.toBeNull();
    expect(student.backend.connectivity.state()).toBe("offline");
    expect(student.backend.auth.getSnapshot().status).toBe("signed-in");
    student.network.down = false;
    student.backend.wake();
    await until(() => stats.getSnapshot().status === "ready");
    expect(student.backend.connectivity.state()).toBe("online");
    expect(stats.getSnapshot()).toMatchObject({ status: "ready", stale: false });
  });

  it("sends a refused password once: the session is fine, and a replay would only spend the rate limit", async () => {
    const { student, input } = await account();
    const before = student.requests.filter((entry) => entry.url.endsWith("/api/user/security")).length;
    await expect(student.backend.client.send("PATCH", "/api/user/security", { body: { action: "password", currentPassword: "not the password", newPassword: "another-long-password", confirmPassword: "another-long-password" } })).rejects.toMatchObject({ kind: "invalid", message: "Incorrect current password." });
    expect(student.requests.filter((entry) => entry.url.endsWith("/api/user/security")).length).toBe(before + 1);
    expect(student.requests.some((entry) => entry.url.endsWith("/api/auth/native/token"))).toBe(false);
    expect(student.backend.auth.getSnapshot().status).toBe("signed-in");
    expect(input.password).toBe(PASSWORD);
  });

  it("refuses a sign-in with the server's reason", async () => {
    const { input } = await account();
    const other = device();
    const failure = await other.backend.auth.signIn({ identifier: input.email, password: "wrong password" }).catch((error) => error as BackendError);
    expect(failure).toMatchObject({ kind: "invalid", message: "Invalid credentials", detail: { code: "invalid_credentials" } });
    expect(other.vault.peek()).toBeNull();
  });
});

/** The real model, the real bridge, the real journal, and a real server's settlement. The clock is real too, because the server's is. */
function studying(student: Device, preferences = memoryPreferences()) {
  const session: StudySessionModel = createStudySessionModel(preferences, { createKey: () => randomUUID(), ownerId: () => student.backend.auth.getSnapshot().userId });
  const bridge: SessionBridge = createSessionBridge({ session, delivery: student.backend.timer, auth: student.backend.auth, resources: student.backend.resources, connectivity: student.backend.connectivity });
  return { session, bridge };
}

describe("the session bridge on the real server", () => {
  it("delivers one session, with its subject, and flips saved only on the server's answer", async () => {
    const { student } = await account();
    const { reads, client } = student.backend;
    const subject = await client.send<{ id: number }>("POST", "/api/subjects", { body: { name: "Physics", code: "PHY", color: "blue" } });
    expect((await reads.subjects(new AbortController().signal)).map((item) => item.name)).toEqual(["Physics"]);
    const { session, bridge } = studying(student);
    session.setLength(null);
    session.setPlan({ title: null, subject: "Physics", subjectId: subject.id, questId: null });
    session.start();
    await settle(2_100);
    session.pause();
    await settle(300);
    session.resume();
    await settle(1_100);
    const ended = session.end();
    expect(session.state().ended[0].saved).toBe(false);
    await until(() => session.state().ended[0]?.saved === true);
    const record = session.state().ended[0];
    expect(record.serverId).toBeGreaterThan(0);
    expect(record.acceptedFocusSeconds).toBeGreaterThanOrEqual(2);
    expect(record.acceptedFocusSeconds).toBeLessThanOrEqual((ended?.focusSeconds ?? 0) + 5);
    const { sessions } = await reads.recentSessions(5, new AbortController().signal);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: record.serverId, subjectName: "Physics" });
    const stats = await reads.stats(new AbortController().signal);
    expect(stats.activeSessionId).toBeNull();
    expect(stats.totalStudySeconds).toBeGreaterThanOrEqual(2);
    bridge.dispose();
  });

  it("completes a quest once, and pays an achievement once, on the server's word", async () => {
    const { student } = await account();
    const { reads, client } = student.backend;
    const signal = new AbortController().signal;
    await client.send("PATCH", "/api/user/study-schedule", { body: { restDays: [] } });
    const subject = await client.send<{ id: number }>("POST", "/api/subjects", { body: { name: "Physics", code: "PHY", color: "blue" } });
    await client.send("POST", "/api/quests", { body: { title: "Optics past paper", subjectId: subject.id, targetMinutes: 30, scheduledFor: new Date().toISOString().slice(0, 10) } });
    const [quest] = await reads.questsToday(signal);
    await reads.completeQuest(quest);
    expect((await reads.questsToday(signal)).find((item) => item.id === quest.id)?.status).toBe("COMPLETED");
    const afterQuest = await reads.earnedThisWeek(signal);
    await reads.completeQuest(quest).catch(() => undefined);
    expect(await reads.earnedThisWeek(signal)).toEqual(afterQuest);

    expect(await refusedAs(reads.claimAchievement("study_first_session"))).not.toBe("no failure");
    const { session, bridge } = studying(student);
    session.setLength(null);
    session.start();
    await settle(66_000);
    session.end();
    await until(() => session.state().ended[0]?.saved === true);
    const record = async () => (await reads.achievements(signal)).achievements.find((item) => item.id === "study_first_session");
    expect(await record()).toMatchObject({ isClaimed: false, currentProgress: 1 });
    const beforeClaim = await reads.earnedThisWeek(signal);
    await reads.claimAchievement("study_first_session");
    expect(await record()).toMatchObject({ isClaimed: true });
    const afterClaim = await reads.earnedThisWeek(signal);
    expect(afterClaim.xp).toBeGreaterThan(beforeClaim.xp);
    expect(await refusedAs(reads.claimAchievement("study_first_session"))).not.toBe("no failure");
    expect(await reads.earnedThisWeek(signal)).toEqual(afterClaim);
    bridge.dispose();
  }, 120_000);

  it("keeps a session through a lost connection, and saves it on the way back", async () => {
    const { student } = await account();
    const { session, bridge } = studying(student);
    session.setLength(null);
    student.network.down = true;
    session.start();
    await settle(1_200);
    session.end();
    await until(() => bridge.state().offline);
    expect(session.state().ended[0].saved).toBe(false);
    expect(bridge.state().pending).toBeGreaterThan(0);
    student.network.down = false;
    student.backend.connectivity.report(true);
    await until(() => session.state().ended[0].saved);
    expect(bridge.state().pending).toBe(0);
    expect((await student.backend.reads.recentSessions(5, new AbortController().signal)).sessions).toHaveLength(1);
    bridge.dispose();
  });

  it("never gives one person's session to another, on the same device", async () => {
    const first = await account();
    const second = await account();
    const preferences = memoryPreferences();
    const shared = device(memoryVault(), preferences);
    await shared.backend.auth.signIn({ identifier: first.input.email, password: PASSWORD });
    const firstId = shared.backend.auth.getSnapshot().userId;
    const { session, bridge } = studying(shared, preferences);
    session.setLength(null);
    shared.network.down = true;
    session.start();
    await settle(1_100);
    session.end();
    await until(() => bridge.state().offline);
    shared.network.down = false;
    await shared.backend.auth.signOut();
    await shared.backend.auth.signIn({ identifier: second.input.email, password: PASSWORD });
    await bridge.flush(2_000);
    expect((await shared.backend.reads.recentSessions(5, new AbortController().signal)).sessions).toEqual([]);
    await shared.backend.auth.signOut();
    await shared.backend.auth.signIn({ identifier: first.input.email, password: PASSWORD });
    expect(shared.backend.auth.getSnapshot().userId).toBe(firstId);
    await until(() => session.state().ended[0]?.saved === true);
    expect((await shared.backend.reads.recentSessions(5, new AbortController().signal)).sessions).toHaveLength(1);
    bridge.dispose();
  });
});

describe("every read a screen uses", () => {
  it("matches its contract on an empty account, and after activity", async () => {
    const { student } = await account();
    const { reads, client } = student.backend;
    const signal = new AbortController().signal;
    const empty = { subjects: await reads.subjects(signal), quests: await reads.questsToday(signal), goals: await reads.goals(signal), friends: await reads.friends(signal), requests: await reads.friendRequests(signal), party: await reads.party(signal), cosmetics: await reads.cosmetics(signal), chats: await reads.chats(signal), earned: await reads.earnedThisWeek(signal) };
    expect(empty).toMatchObject({ subjects: [], quests: [], goals: [], friends: [], requests: [], party: { activeParty: null, pendingInvites: [] }, earned: { xp: 0, sylph: 0 } });
    expect((await reads.sounds(signal)).tracks.length).toBeGreaterThan(0);
    expect((await reads.achievements(signal)).achievements.length).toBeGreaterThan(0);
    expect(await reads.planner(signal)).toMatchObject({ restDays: expect.any(Array) });
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await reads.calendar(today, tomorrow, signal)).events).toEqual([]);
    const start = new Date(Date.now() + 3_600_000);
    await reads.createEvent({ id: randomUUID(), title: "Seminar", day: start.toISOString().slice(0, 10), endDay: new Date(start.getTime() + 3_600_000).toISOString().slice(0, 10), startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3_600_000).toISOString(), timezone: "UTC" });
    await reads.createEvent({ id: randomUUID(), title: "Field trip", day: tomorrow, endDay: tomorrow, startsAt: null, endsAt: null, timezone: "UTC" });
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect((await reads.calendar(today, later, signal)).events.map((event) => event.title).sort()).toEqual(["Field trip", "Seminar"]);
    expect(client.configured).toBe(true);
  });

  it("speaks to Sylvie through the real route, with no provider: an answer the server can give itself", async () => {
    const { student } = await account();
    const { reads } = student.backend;
    let sessionSeen: number | null = null;
    const deltas: string[] = [];
    const answer = await reads.sendToSylvie("What is my level?", null, { onDelta: (text) => deltas.push(text), onReset: () => undefined, onSession: (id) => { sessionSeen = id; } }, new AbortController().signal);
    expect(answer.reply.length).toBeGreaterThan(0);
    expect(answer.chatId).toBeGreaterThan(0);
    expect(sessionSeen ?? answer.chatId).toBe(answer.chatId);
    const signal = new AbortController().signal;
    expect((await reads.chats(signal)).sessions.map((chat) => chat.id)).toContain(answer.chatId);
    const { messages } = await reads.chatMessages(answer.chatId!, signal);
    expect(messages.map((message) => message.type).sort()).toEqual(["INFO", "USER"]);
  });
});
