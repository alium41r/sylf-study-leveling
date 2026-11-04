import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBackendProxy, parseBackendOrigin } from "./backend-proxy.mjs";
import { createSessionVault } from "./session-vault.mjs";

const ORIGIN = "http://127.0.0.1:3999";
const session = (n = 1) => ({ accessToken: `access-${n}`, accessExpiresAt: Date.now() + 900_000, refreshToken: `sid.refresh-${n}`, sessionId: "sid", userId: 7 });
const memoryVault = () => { let value = null; return { read: async () => value, write: async (next) => { value = next; }, clear: async () => { value = null; }, peek: () => value }; };
const app = (pathname, init) => new Request(`sylf://app${pathname}`, init);
const post = (pathname, body, headers = {}) => app(pathname, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });

function server(routes = {}) {
  const calls = [];
  const fetch = vi.fn(async (url, init = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? "GET", headers, credentials: init.credentials, body: init.body, cache: init.cache, redirect: init.redirect });
    const route = routes[new URL(url).pathname];
    return route ? route({ url, init, headers, calls }) : new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  return { fetch, calls };
}
const signedIn = async (routes = {}) => {
  const { fetch, calls } = server({ "/api/auth/native/login": () => Response.json({ session: session(), user: { id: 7, username: "me" } }), ...routes });
  const vault = memoryVault();
  const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault, clientName: "Sylf for Mac" });
  const response = await proxy.handle(post("/api/auth/native/login", { identifier: "me", password: "pw" }));
  return { proxy, fetch, calls, vault, response };
};

describe("no token reaches the renderer", () => {
  it("removes the session from a sign-in answer", async () => {
    const { response, calls } = await signedIn();
    const text = await response.text();
    expect(text).not.toContain("access-1");
    expect(text).not.toContain("refresh-1");
    expect(JSON.parse(text)).toEqual({ user: { id: 7, username: "me" }, userId: 7 });
    expect(JSON.parse(calls[0].body)).toEqual({ identifier: "me", password: "pw", clientName: "Sylf for Mac" });
  });

  it("does not let a renderer choose its own client name, or send anything extra to login", async () => {
    const { fetch, calls } = server({ "/api/auth/native/login": () => Response.json({ session: session(), user: {} }) });
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Sylf for Mac" });
    await proxy.handle(post("/api/auth/native/login", { identifier: "me", password: "pw", clientName: "Evil", grant: "refresh" }));
    expect(JSON.parse(calls[0].body)).toEqual({ identifier: "me", password: "pw", clientName: "Sylf for Mac" });
  });

  it("refuses to refresh or redeem a code for the renderer", async () => {
    const { proxy, calls } = await signedIn();
    const before = calls.length;
    expect((await proxy.handle(post("/api/auth/native/token", { grant: "refresh", refreshToken: "sid.refresh-1" }))).status).toBe(404);
    expect(calls).toHaveLength(before);
  });

  it("passes a refused sign-in through with nothing added", async () => {
    const { fetch } = server({ "/api/auth/native/login": () => Response.json({ error: "Invalid credentials", code: "invalid_credentials" }, { status: 401 }) });
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac" });
    const response = await proxy.handle(post("/api/auth/native/login", {}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid credentials", code: "invalid_credentials" });
  });

  it("drops Set-Cookie and every response header it does not know", async () => {
    const { proxy } = await signedIn({ "/api/user/stats": () => new Response("{}", { headers: { "set-cookie": "hunter_token=x", "content-type": "application/json", "x-powered-by": "next", "access-control-allow-origin": "*" } }) });
    const response = await proxy.handle(app("/api/user/stats"));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("stores the refresh token, and only that, in the vault", async () => {
    const { vault } = await signedIn();
    expect(JSON.parse(vault.peek())).toEqual({ refreshToken: "sid.refresh-1", sessionId: "sid", userId: 7 });
  });
});

describe("what goes out", () => {
  it("adds the bearer token, and sends no cookie, Sec-Fetch or renderer credential", async () => {
    const { proxy, calls } = await signedIn();
    await proxy.handle(app("/api/user/stats?x=1", { headers: { authorization: "Bearer stolen", cookie: "a=b", "sec-fetch-site": "same-origin", accept: "application/json" } }));
    const call = calls.at(-1);
    expect(call.url).toBe(`${ORIGIN}/api/user/stats?x=1`);
    expect(call.headers.get("authorization")).toBe("Bearer access-1");
    expect(call.headers.get("cookie")).toBeNull();
    expect(call.headers.get("sec-fetch-site")).toBeNull();
    expect(call.headers.get("accept")).toBe("application/json");
    expect(call.credentials).toBe("omit");
    expect(call.cache).toBe("no-store");
    expect(call.redirect).toBe("manual");
  });

  it.each(["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/callback/google", "/api/auth/oauth/google"])("refuses the web's cookie route %s", async (pathname) => {
    const { proxy, calls } = await signedIn();
    const before = calls.length;
    expect((await proxy.handle(post(pathname, {}))).status).toBe(404);
    expect(calls).toHaveLength(before);
  });

  it("only owns /api/ and public asset paths", async () => {
    const { proxy } = await signedIn();
    expect(proxy.handles("/api/user/stats")).toBe(true);
    expect(proxy.handles("/audio/rain.mp3")).toBe(true);
    expect(proxy.handles("/uploads/a.png")).toBe(true);
    expect(proxy.handles("/index.html")).toBe(false);
    expect(proxy.handles("/_expo/static/js/web/entry.js")).toBe(false);
    expect(proxy.handles("/apiary")).toBe(false);
  });

  it("cannot be walked off its origin by a crafted path", async () => {
    const { proxy, calls } = await signedIn();
    await proxy.handle(app("//evil.invalid/api/user/stats"));
    expect(calls.every((call) => call.url.startsWith(ORIGIN))).toBe(true);
    await proxy.handle(app("/api/../../evil"));
    expect(calls.every((call) => call.url.startsWith(ORIGIN))).toBe(true);
  });

  it("sends public assets with no credential, and passes a range through", async () => {
    const { proxy, calls } = await signedIn({ "/audio/rain.mp3": () => new Response("ab", { status: 206, headers: { "content-range": "bytes 0-1/9", "content-type": "audio/mpeg" } }) });
    const response = await proxy.handle(app("/audio/rain.mp3", { headers: { range: "bytes=0-1" } }));
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1/9");
    expect(calls.at(-1).headers.get("authorization")).toBeNull();
    expect(calls.at(-1).headers.get("range")).toBe("bytes=0-1");
  });

  it("streams a response body rather than buffering it", async () => {
    /** @type {any} */ let push;
    const stream = new ReadableStream({ start(controller) { push = controller; } });
    const { proxy } = await signedIn({ "/api/system-messages/chat": () => new Response(stream, { headers: { "content-type": "text/event-stream" } }) });
    const response = await proxy.handle(post("/api/system-messages/chat", {}));
    const reader = response.body.getReader();
    push.enqueue(new TextEncoder().encode("first"));
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    push.close();
    await reader.cancel();
  });
});

describe("session lifecycle", () => {
  it("answers whether anyone is signed in, with no network", async () => {
    const { fetch, calls } = server();
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac" });
    expect(await (await proxy.handle(app("/api/auth/native/session"))).json()).toEqual({ configured: true, signedIn: false, userId: null });
    expect(calls).toHaveLength(0);
  });

  it("is honest with no backend configured, and sends nothing", async () => {
    const { fetch, calls } = server();
    const proxy = createBackendProxy({ origin: null, fetch, vault: memoryVault(), clientName: "Mac" });
    expect(await (await proxy.handle(app("/api/auth/native/session"))).json()).toEqual({ configured: false, signedIn: false, userId: null });
    const response = await proxy.handle(app("/api/user/stats"));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("refreshes on a 401 and replays the same request once, body included", async () => {
    const routes = {
      "/api/goals": ({ headers }) => (headers.get("authorization") === "Bearer access-2" ? Response.json({ ok: true }) : Response.json({}, { status: 401 })),
      "/api/auth/native/token": () => Response.json({ session: session(2) }),
    };
    const { proxy, calls, vault } = await signedIn(routes);
    const response = await proxy.handle(post("/api/goals", { title: "Read" }));
    expect(response.status).toBe(200);
    const sent = calls.filter((call) => call.url.endsWith("/api/goals"));
    expect(sent).toHaveLength(2);
    expect(new TextDecoder().decode(sent[1].body)).toBe('{"title":"Read"}');
    expect(JSON.parse(vault.peek()).refreshToken).toBe("sid.refresh-2");
  });

  it("refreshes once for many requests at the same moment", async () => {
    let refreshes = 0;
    const { proxy } = await signedIn({
      "/api/goals": ({ headers }) => (headers.get("authorization") === "Bearer access-2" ? Response.json({ ok: true }) : Response.json({}, { status: 401 })),
      "/api/auth/native/token": async () => { refreshes++; await new Promise((done) => setTimeout(done, 5)); return Response.json({ session: session(2) }); },
    });
    const results = await Promise.all(Array.from({ length: 6 }, () => proxy.handle(app("/api/goals"))));
    expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it("reaches public routes with nobody signed in, and sends no token", async () => {
    const { fetch, calls } = server({ "/api/acoustics": () => Response.json({ ok: true }) });
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac" });
    expect((await proxy.handle(app("/api/acoustics"))).status).toBe(200);
    expect(calls[0].headers.get("authorization")).toBeNull();
    expect(calls[0].credentials).toBe("omit");
  });

  it("forgets everything when the server ends the session", async () => {
    const { proxy, vault } = await signedIn({
      "/api/goals": () => Response.json({}, { status: 401 }),
      "/api/auth/native/token": () => Response.json({ code: "session_ended" }, { status: 401 }),
    });
    const response = await proxy.handle(app("/api/goals"));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("session_ended");
    expect(vault.peek()).toBeNull();
    expect((await (await proxy.handle(app("/api/auth/native/session"))).json()).signedIn).toBe(false);
  });

  it("keeps the session when the server cannot be reached, and says so", async () => {
    let down = false;
    const { fetch, calls } = server({ "/api/auth/native/login": () => Response.json({ session: session(), user: {} }) });
    const flaky = vi.fn((url, init) => (down ? Promise.reject(new TypeError("offline")) : fetch(url, init)));
    const vault = memoryVault();
    const proxy = createBackendProxy({ origin: ORIGIN, fetch: flaky, vault, clientName: "Mac" });
    await proxy.handle(post("/api/auth/native/login", {}));
    down = true;
    const response = await proxy.handle(app("/api/goals"));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("backend_unreachable");
    expect(vault.peek()).not.toBeNull();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("signs out offline, and ends the server's row when it can", async () => {
    const { proxy, calls, vault } = await signedIn();
    const response = await proxy.handle(post("/api/auth/native/logout", { refreshToken: "ignored" }));
    expect(await response.json()).toEqual({ success: true });
    expect(vault.peek()).toBeNull();
    const logout = calls.find((call) => call.url.endsWith("/api/auth/native/logout"));
    expect(JSON.parse(logout.body)).toEqual({ refreshToken: "sid.refresh-1" });
    expect(logout.headers.get("cookie")).toBeNull();
  });

  it("forgets its own session after signing out everywhere", async () => {
    const { proxy, vault } = await signedIn({ "/api/auth/logout-all": () => Response.json({ success: true }) });
    await proxy.handle(post("/api/auth/logout-all", { password: "pw" }));
    expect(vault.peek()).toBeNull();
  });

  it("lets a password-reset request through with no credential, and no other cookie route", async () => {
    const { fetch, calls } = server({ "/api/auth/forgot-password": () => Response.json({ message: "ok" }) });
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac" });
    expect((await proxy.handle(post("/api/auth/forgot-password", { email: "a@local.test" }))).status).toBe(200);
    expect(calls[0].headers.get("authorization")).toBeNull();
    expect((await proxy.handle(post("/api/auth/reset-password", { token: "x", password: "y" }))).status).toBe(404);
  });

  it("restores from the vault after a restart, with no network", async () => {
    const vault = memoryVault();
    await vault.write(JSON.stringify({ refreshToken: "sid.refresh-1", sessionId: "sid", userId: 7 }));
    const { fetch, calls } = server();
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault, clientName: "Mac" });
    expect(await (await proxy.handle(app("/api/auth/native/session"))).json()).toEqual({ configured: true, signedIn: true, userId: 7 });
    expect(calls).toHaveLength(0);
  });
});

describe("OAuth through the system browser", () => {
  it("opens the browser with a PKCE challenge and a loopback redirect, and never shows the renderer a token", async () => {
    /** @type {any} */ let opened;
    const { fetch, calls } = server({ "/api/auth/native/token": () => Response.json({ session: session(), user: { id: 7 } }) });
    const closed = vi.fn();
    const proxy = createBackendProxy({
      origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac",
      openExternal: async (url) => { opened = new URL(url); },
      listen: async () => ({ port: 48213, result: Promise.resolve({ code: "one-time", error: null }), close: closed }),
    });
    const response = await proxy.handle(post("/api/auth/native/oauth/begin", { provider: "google" }));
    expect(await response.json()).toEqual({ user: { id: 7 }, userId: 7 });
    expect(opened.searchParams.get("redirect")).toBe("http://127.0.0.1:48213/auth");
    expect(opened.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const exchange = JSON.parse(calls.at(-1).body);
    expect(exchange).toMatchObject({ grant: "oauth_code", code: "one-time", clientName: "Mac" });
    expect(exchange.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(closed).toHaveBeenCalled();
  });

  it("reports a cancelled sign-in and exchanges nothing", async () => {
    const { fetch, calls } = server();
    const proxy = createBackendProxy({ origin: ORIGIN, fetch, vault: memoryVault(), clientName: "Mac", listen: async () => ({ port: 48213, result: Promise.resolve({ code: null, error: "cancelled" }), close: () => undefined }) });
    expect((await proxy.handle(post("/api/auth/native/oauth/begin", { provider: "google" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("the origin", () => {
  it("accepts https and this machine, and nothing else", () => {
    expect(parseBackendOrigin(undefined)).toBeNull();
    expect(parseBackendOrigin("https://sylf.example/path")).toBe("https://sylf.example");
    expect(parseBackendOrigin("http://127.0.0.1:3111")).toBe("http://127.0.0.1:3111");
    expect(() => parseBackendOrigin("http://sylf.example")).toThrow();
    expect(() => parseBackendOrigin("http://192.168.1.4:3000")).toThrow();
  });
});

describe("the vault", () => {
  const temporary = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sylf-vault-")), "session.bin");
  const encrypted = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (value) => Buffer.from(`enc:${Buffer.from(value).toString("base64")}`), decryptStringAsync: async (bytes) => ({ shouldReEncrypt: false, result: Buffer.from(bytes.toString().slice(4), "base64").toString() }) };

  it("never writes plain text", async () => {
    const file = temporary(); const vault = createSessionVault(encrypted, file);
    await vault.write("secret-refresh");
    expect(fs.readFileSync(file).toString()).not.toContain("secret-refresh");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(await createSessionVault(encrypted, file).read()).toBe("secret-refresh");
    await vault.clear();
    expect(fs.existsSync(file)).toBe(false);
  });

  it("stays in memory, with no file at all, when encryption is unavailable", async () => {
    const file = temporary(); const vault = createSessionVault({ ...encrypted, isAsyncEncryptionAvailable: async () => false }, file);
    await vault.write("secret-refresh");
    expect(fs.existsSync(file)).toBe(false);
    expect(await vault.read()).toBe("secret-refresh");
    expect(await createSessionVault({ ...encrypted, isAsyncEncryptionAvailable: async () => false }, file).read()).toBeNull();
  });

  it.runIf(process.platform === "linux")("treats Linux's basic_text backend as unavailable", async () => {
    const file = temporary(); const vault = createSessionVault({ ...encrypted, getSelectedStorageBackend: () => "basic_text" }, file);
    await vault.write("secret-refresh");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("seals again when the key has rotated", async () => {
    const file = temporary(); const vault = createSessionVault(encrypted, file);
    await vault.write("secret-refresh");
    const rotated = vi.fn(encrypted.encryptStringAsync);
    expect(await createSessionVault({ ...encrypted, encryptStringAsync: rotated, decryptStringAsync: async () => ({ shouldReEncrypt: true, result: "secret-refresh" }) }, file).read()).toBe("secret-refresh");
    expect(rotated).toHaveBeenCalledWith("secret-refresh");
  });

  it("reads as signed out when a file cannot be decrypted", async () => {
    const file = temporary(); fs.writeFileSync(file, "garbage");
    expect(await createSessionVault({ ...encrypted, decryptStringAsync: async () => { throw new Error("bad key"); } }, file).read()).toBeNull();
  });
});
