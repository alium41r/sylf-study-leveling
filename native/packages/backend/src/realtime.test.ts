// Realtime is a nudge: it can be off, late, duplicated or wrong without costing anything but a refresh. These tests use a fake socket and pin that it
// starts only when asked, reports "live" only after the server confirms the join, turns events into tag invalidations, and shuts down with the app.
import { describe, expect, it, vi } from "vitest";
import type { BackendClient } from "./client";
import { createRealtime, type RealtimeChannelLike, type RealtimeSocketLike } from "./realtime";
import type { ResourceStore } from "./resources";

const nap = (ms = 2) => new Promise((done) => setTimeout(done, ms));
const until = async (done: () => boolean) => { for (let wait = 0; wait < 200 && !done(); wait++) await nap(); expect(done()).toBe(true); };

function fakeSocket() {
  const handlers: { table: string; callback: () => void }[] = [];
  let status: ((value: string) => void) | undefined;
  const channel: RealtimeChannelLike = {
    on(_type, filter, callback) { handlers.push({ table: filter.table, callback }); return channel; },
    subscribe(callback) { status = callback; return channel; },
  };
  const socket: RealtimeSocketLike & { disconnected: number; connected: number } = { disconnected: 0, connected: 0, channel: () => channel, connect() { socket.connected++; }, disconnect() { socket.disconnected++; return Promise.resolve("ok"); } };
  return { socket, emit: (table: string) => handlers.filter((item) => item.table === table).forEach((item) => item.callback()), join: (value = "SUBSCRIBED") => status?.(value) };
}
const clientWith = (answer: unknown) => ({ get: vi.fn(async () => answer) }) as unknown as BackendClient;
const store = () => { const invalidate = vi.fn(); return { invalidate, resources: { invalidate } as unknown as ResourceStore }; };
const config = { url: "https://example.supabase.co", key: "anon" };

describe("realtime", () => {
  it("stays off, and asks for nothing, when the build has no address", async () => {
    const client = clientWith({ enabled: true, token: "t" });
    const rt = createRealtime({ client, resources: store().resources, config: null, socket: () => fakeSocket().socket });
    rt.setActive(true);
    await nap(10);
    expect(rt.state()).toBe("off");
    expect(client.get).not.toHaveBeenCalled();
  });
  it("stays off when the server has no Realtime to offer", async () => {
    const rt = createRealtime({ client: clientWith({ enabled: false }), resources: store().resources, config, socket: () => fakeSocket().socket });
    rt.setActive(true);
    await until(() => rt.state() === "off");
    await nap(10);
    expect(rt.state()).toBe("off");
  });
  it("is live only after the join is confirmed, and turns a change into one tag refresh", async () => {
    const { socket, emit, join } = fakeSocket();
    const { invalidate, resources } = store();
    const rt = createRealtime({ client: clientWith({ enabled: true, token: "t" }), resources, config, socket: () => socket });
    const heard: string[][] = [];
    rt.onNudge((tags) => heard.push([...tags]));
    rt.setActive(true);
    await until(() => socket.connected === 1);
    expect(rt.state()).toBe("connecting");
    join();
    expect(rt.state()).toBe("live");
    emit("Message"); emit("Message"); emit("Message");
    await until(() => invalidate.mock.calls.length > 0);
    expect(invalidate.mock.calls).toEqual([["messages"]]);
    expect(heard).toEqual([["messages"]]);
  });
  it("says it is retrying when the channel errors, and live again when it rejoins", async () => {
    const { socket, join } = fakeSocket();
    const rt = createRealtime({ client: clientWith({ enabled: true, token: "t" }), resources: store().resources, config, socket: () => socket });
    rt.setActive(true);
    await until(() => socket.connected === 1);
    join(); join("CHANNEL_ERROR");
    expect(rt.state()).toBe("retrying");
    join();
    expect(rt.state()).toBe("live");
  });
  it("closes the socket when the app leaves the front, and opens a fresh one on return", async () => {
    const first = fakeSocket();
    const second = fakeSocket();
    const sockets = [first.socket, second.socket];
    const rt = createRealtime({ client: clientWith({ enabled: true, token: "t" }), resources: store().resources, config, socket: () => sockets.shift()! });
    rt.setActive(true);
    await until(() => first.socket.connected === 1);
    rt.setActive(false);
    expect(first.socket.disconnected).toBe(1);
    expect(rt.state()).toBe("off");
    rt.setActive(true);
    await until(() => second.socket.connected === 1);
  });
  it("retries with a delay when the token cannot be minted", async () => {
    const client = { get: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ enabled: true, token: "t" }) } as unknown as BackendClient;
    const { socket } = fakeSocket();
    const timers: (() => void)[] = [];
    const rt = createRealtime({ client, resources: store().resources, config, socket: () => socket, timers: { set: (work) => { timers.push(work); return timers.length; }, clear: () => undefined } });
    rt.setActive(true);
    await until(() => rt.state() === "retrying");
    timers[0]();
    await until(() => socket.connected === 1);
  });
});
