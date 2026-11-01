import { describe, expect, it, vi } from "vitest";
import { createAuthorizedFetch, createTokenSession } from "./token-session.mjs";

const ORIGIN = "http://127.0.0.1:3111";
const credentials = (n: number, expiresIn = 900_000, at = Date.now()) => ({ accessToken: `access-${n}`, accessExpiresAt: at + expiresIn, refreshToken: `sid.refresh-${n}`, sessionId: "sid", userId: 7 });
const vaultWith = (initial: string | null = null) => { let value = initial; return { read: vi.fn(async () => value), write: vi.fn(async (next: string) => { value = next; }), clear: vi.fn(async () => { value = null; }), peek: () => value }; };
const refreshed = (n: number) => () => Promise.resolve(Response.json({ session: credentials(n) }));

function session(respond: () => Promise<Response>, vault = vaultWith(), now = Date.now) {
  const fetch = vi.fn(respond) as unknown as typeof globalThis.fetch;
  const onEnded = vi.fn();
  return { fetch, vault, onEnded, tokens: createTokenSession({ origin: ORIGIN, fetch, vault, onEnded, now }) };
}

describe("the vault", () => {
  it("holds the refresh token and identity, and never the access token", async () => {
    const { tokens, vault } = session(refreshed(2));
    await tokens.adopt(credentials(1));
    expect(JSON.parse(vault.peek()!)).toEqual({ refreshToken: "sid.refresh-1", sessionId: "sid", userId: 7 });
  });

  it("reads identity with no network", async () => {
    const { tokens, fetch } = session(refreshed(2), vaultWith(JSON.stringify({ refreshToken: "sid.r", sessionId: "sid", userId: 7 })));
    expect(await tokens.restore()).toEqual({ userId: 7, sessionId: "sid" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads as signed out when the vault fails, which is what a restored backup looks like", async () => {
    const vault = vaultWith(); vault.read.mockRejectedValue(new Error("decrypt failed"));
    const { tokens } = session(refreshed(2), vault);
    expect(await tokens.restore()).toBeNull();
    expect((await tokens.accessToken()).token).toBeNull();
  });

  it.each(["not json", "{}", '{"refreshToken":1}', "null"])("reads %s as signed out", async (raw) => {
    expect(await session(refreshed(2), vaultWith(raw)).tokens.restore()).toBeNull();
  });
});

describe("refresh", () => {
  it("refreshes before expiry, not after a failure", async () => {
    let clock = 1_000_000;
    const { tokens, fetch } = session(refreshed(2), vaultWith(), () => clock);
    await tokens.adopt({ ...credentials(1), accessExpiresAt: clock + 60_000 });
    expect((await tokens.accessToken()).token).toBe("access-1");
    clock += 40_000;
    expect((await tokens.accessToken()).token).toBe("access-2");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is one flight for any number of callers, because a second would look like theft", async () => {
    const { tokens, fetch } = session(() => new Promise((done) => setTimeout(() => done(Response.json({ session: credentials(2) })), 5)), vaultWith(JSON.stringify({ refreshToken: "sid.r", sessionId: "sid", userId: 7 })));
    await tokens.restore();
    const results = await Promise.all([tokens.accessToken(), tokens.accessToken(), tokens.accessToken()]);
    expect(results.map((result) => result.token)).toEqual(["access-2", "access-2", "access-2"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("persists the rotated token", async () => {
    const { tokens, vault } = session(refreshed(2));
    await tokens.adopt(credentials(1, -1));
    await tokens.accessToken();
    expect(JSON.parse(vault.peek()!).refreshToken).toBe("sid.refresh-2");
  });

  it("clears the vault and reports when the server ends the session", async () => {
    const { tokens, vault, onEnded } = session(() => Promise.resolve(Response.json({ code: "session_ended" }, { status: 401 })));
    await tokens.adopt(credentials(1, -1));
    expect(await tokens.accessToken()).toEqual({ token: null, reason: "ended" });
    expect(vault.peek()).toBeNull();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the network failing", () => Promise.reject(new TypeError("Network request failed"))],
    ["a server error", () => Promise.resolve(new Response("oops", { status: 502 }))],
    ["a garbled answer", () => Promise.resolve(new Response("{}", { status: 200 }))],
    ["a body that is not JSON", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("keeps everything through %s", async (_name, respond) => {
    const { tokens, vault, onEnded } = session(respond as () => Promise<Response>);
    await tokens.adopt(credentials(1, -1));
    expect(await tokens.accessToken()).toEqual({ token: null, reason: "unavailable" });
    expect(JSON.parse(vault.peek()!).refreshToken).toBe("sid.refresh-1");
    expect(onEnded).not.toHaveBeenCalled();
    expect(tokens.identity()).toEqual({ userId: 7, sessionId: "sid" });
  });

  it("does not bring back a session that signed out while a refresh was running", async () => {
    let finish: (response: Response) => void = () => undefined;
    const { tokens, vault } = session(() => new Promise((done) => { finish = done; }));
    await tokens.adopt(credentials(1, -1));
    const running = tokens.accessToken();
    await new Promise((done) => setTimeout(done, 0));
    await tokens.end();
    finish(Response.json({ session: credentials(2) }));
    expect((await running).token).toBeNull();
    expect(vault.peek()).toBeNull();
  });

  it("skips a refresh when another request has already replaced the refused token", async () => {
    const { tokens, fetch } = session(refreshed(3));
    await tokens.adopt(credentials(2));
    expect(await tokens.replace("access-1")).toBe("ok");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hands back the refresh token at sign-out, after forgetting it", async () => {
    const { tokens, vault } = session(refreshed(2));
    await tokens.adopt(credentials(1));
    expect(await tokens.end()).toBe("sid.refresh-1");
    expect(vault.peek()).toBeNull();
    expect(tokens.identity()).toBeNull();
  });
});

describe("authorized requests", () => {
  const setup = (respond: (input: string, init: RequestInit) => Promise<Response>) => {
    const fetch = vi.fn(respond) as unknown as typeof globalThis.fetch;
    const tokens = createTokenSession({ origin: ORIGIN, fetch, vault: vaultWith() });
    const authorized = createAuthorizedFetch({ origin: ORIGIN, fetch, tokens, unauthorized: (reason) => new Response(reason, { status: 401 }) });
    return { fetch, tokens, authorized };
  };

  it("sends the token and omits cookies", async () => {
    const { authorized, tokens, fetch } = setup(async () => new Response("{}"));
    await tokens.adopt(credentials(1));
    await authorized("/api/goals", { headers: { Accept: "application/json" } });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/goals`);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-1");
    expect(init?.credentials).toBe("omit");
  });

  it("refreshes on a 401 and replays once, with the same body", async () => {
    const bodies: unknown[] = [];
    const { authorized, tokens } = setup(async (input, init) => {
      if (input.endsWith("/token")) return Response.json({ session: credentials(2) });
      bodies.push(init.body);
      return new Headers(init.headers).get("Authorization") === "Bearer access-2" ? new Response("{}") : new Response("{}", { status: 401 });
    });
    await tokens.adopt(credentials(1));
    expect((await authorized("/api/goals", { method: "POST", body: "payload" })).status).toBe(200);
    expect(bodies).toEqual(["payload", "payload"]);
  });

  it("does not loop when the fresh token is refused too", async () => {
    const { authorized, tokens, fetch } = setup(async (input) => (input.endsWith("/token") ? Response.json({ session: credentials(2) }) : new Response("{}", { status: 401 })));
    await tokens.adopt(credentials(1));
    expect((await authorized("/api/goals")).status).toBe(401);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/goals"))).toHaveLength(2);
  });

  it("goes anonymously with no session, because some routes are public", async () => {
    const { authorized, fetch } = setup(async () => new Response("{}"));
    await authorized("/api/acoustics");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/acoustics`);
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(init?.credentials).toBe("omit");
  });

  it("answers for an ended session without asking the server again", async () => {
    let ended = false;
    const { authorized, tokens, fetch } = setup(async (input) => { if (input.endsWith("/token")) { ended = true; return Response.json({}, { status: 401 }); } return new Response("{}"); });
    await tokens.adopt(credentials(1, -1));
    expect(await (await authorized("/api/goals")).text()).toBe("ended");
    expect(ended).toBe(true);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/goals"))).toHaveLength(0);
  });

  it("does not send a refused password twice: the session is fine, and a replay would only spend the rate limit", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => { calls.push(url); return new Response(JSON.stringify({ error: "Incorrect current password.", code: "password_incorrect" }), { status: 401 }); }) as never;
    const tokens = createTokenSession({ origin: ORIGIN, fetch, vault: vaultWith() });
    await tokens.adopt(credentials(1));
    const authorized = createAuthorizedFetch({ origin: ORIGIN, fetch, tokens, unauthorized: (reason) => new Response(reason, { status: 401 }) });
    const response = await authorized("/api/user/security", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Incorrect current password.");
    expect(calls).toEqual([`${ORIGIN}/api/user/security`]);
  });
});
