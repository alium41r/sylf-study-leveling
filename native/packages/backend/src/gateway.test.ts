import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createBearerGateway, createHostGateway, createPkcePair, parseBackendOrigin } from "./gateway";

const ORIGIN = "http://127.0.0.1:3111";
const crypto = { getRandomValues: (array: Uint8Array<ArrayBuffer>) => { array.set(randomBytes(array.length)); return array; }, sha256Hex: async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex") };
const user = { id: 7, email: "a@local.test", username: "a", name: null, scholarId: null, verificationStatus: "VERIFIED", hunterRank: "E", level: 1, hasCompletedOnboarding: true, avatarUrl: null };
const session = { accessToken: "access", accessExpiresAt: Date.now() + 900_000, refreshToken: "sid.refresh", sessionId: "sid", userId: 7 };
const vault = () => { let value: string | null = null; return { read: async () => value, write: async (next: string) => { value = next; }, clear: async () => { value = null; }, peek: () => value }; };

function bearer(respond: (input: string, init: RequestInit) => Promise<Response> = async () => Response.json({ session, user })) {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init ?? {})) as unknown as typeof globalThis.fetch;
  const store = vault();
  const opened: string[] = [];
  return { fetch, store, opened, gateway: createBearerGateway({ origin: ORIGIN, clientName: "Sylf for Android", vault: store, crypto, fetch, openUrl: async (url) => { opened.push(url); } }) };
}

describe("origins", () => {
  it("accepts https and loopback, and refuses cleartext to anywhere else", () => {
    expect(parseBackendOrigin("https://sylf.example/app")).toBe("https://sylf.example");
    expect(parseBackendOrigin("http://127.0.0.1:3111")).toBe(ORIGIN);
    expect(parseBackendOrigin("http://sylf.example")).toBeNull();
    expect(parseBackendOrigin("ftp://sylf.example")).toBeNull();
    expect(parseBackendOrigin("not a url")).toBeNull();
    expect(parseBackendOrigin(undefined)).toBeNull();
  });
});

describe("PKCE", () => {
  it("meets the example in RFC 7636 appendix B", async () => {
    const verifierBytes = Uint8Array.from([116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]);
    const pair = await createPkcePair({ getRandomValues: (array) => { array.set(verifierBytes); return array; }, sha256Hex: crypto.sha256Hex });
    expect(pair.verifier).toBe("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(pair.challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("the device client", () => {
  it("signs in, keeps the session behind the vault, and sends the install's name", async () => {
    const { gateway, store, fetch } = bearer();
    expect((await gateway.signIn({ identifier: "a", password: "pw" })).id).toBe(7);
    expect(JSON.parse(store.peek()!).refreshToken).toBe("sid.refresh");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/auth/native/login`);
    expect(init?.credentials).toBe("omit");
    expect(JSON.parse(String(init?.body))).toEqual({ identifier: "a", password: "pw", clientName: "Sylf for Android" });
  });

  it("reports a refusal with the server's words", async () => {
    const { gateway } = bearer(async () => Response.json({ error: "Invalid credentials", code: "invalid_credentials" }, { status: 401 }));
    await expect(gateway.signIn({ identifier: "a", password: "pw" })).rejects.toMatchObject({ kind: "invalid", message: "Invalid credentials" });
  });

  it("reports no network as offline", async () => {
    const { gateway } = bearer(async () => { throw new TypeError("Network request failed"); });
    await expect(gateway.signIn({ identifier: "a", password: "pw" })).rejects.toMatchObject({ kind: "offline" });
  });

  it("treats an answer it cannot read as a contract failure, and stores nothing", async () => {
    const { gateway, store } = bearer(async () => Response.json({ session: { accessToken: "x" }, user }));
    await expect(gateway.signIn({ identifier: "a", password: "pw" })).rejects.toMatchObject({ kind: "contract" });
    expect(store.peek()).toBeNull();
  });

  it("adds a token once signed in, and none before", async () => {
    const { gateway, fetch } = bearer();
    await gateway.transport("/api/acoustics");
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
    await gateway.signIn({ identifier: "a", password: "pw" });
    await gateway.transport("/api/goals");
    expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).get("Authorization")).toBe("Bearer access");
  });

  it("forgets first and tells the server after, so signing out works offline", async () => {
    const { gateway, store } = bearer(async (input) => { if (input.endsWith("/logout")) throw new TypeError("offline"); return Response.json({ session, user }); });
    await gateway.signIn({ identifier: "a", password: "pw" });
    await gateway.signOut();
    expect(store.peek()).toBeNull();
    expect(await gateway.restore()).toBeNull();
  });

  it("ends the server's row at sign-out", async () => {
    const { gateway, fetch } = bearer();
    await gateway.signIn({ identifier: "a", password: "pw" });
    await gateway.signOut();
    const logout = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(String(logout[0])).toBe(`${ORIGIN}/api/auth/native/logout`);
    expect(JSON.parse(String(logout[1]?.body))).toEqual({ refreshToken: "sid.refresh" });
  });

  it("completes a browser sign-in from its deep link, with the verifier that matches", async () => {
    const { gateway, opened, fetch } = bearer();
    const signing = gateway.signInWithProvider("google");
    await new Promise((done) => setTimeout(done, 0));
    const started = new URL(opened[0]);
    expect(started.pathname).toBe("/api/auth/native/oauth/start");
    expect(started.searchParams.get("redirect")).toBe("sylf-native://auth");
    expect(gateway.receiveLink?.("sylf-native://auth?code=one-time-code-value")).toBe(true);
    expect((await signing).id).toBe(7);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
    expect(body).toMatchObject({ grant: "oauth_code", code: "one-time-code-value", clientName: "Sylf for Android" });
    expect(createHash("sha256").update(body.verifier).digest("base64url")).toBe(started.searchParams.get("challenge"));
  });

  it("ignores a link that arrives with no sign-in running", async () => {
    const { gateway, fetch } = bearer();
    expect(gateway.receiveLink?.("sylf-native://auth?code=planted-by-another-app")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves other links alone", () => {
    expect(bearer().gateway.receiveLink?.("sylf-native://home")).toBe(false);
    expect(bearer().gateway.receiveLink?.("sylf-native://authority?code=x")).toBe(false);
  });

  it("reports a cancelled browser sign-in", async () => {
    const { gateway } = bearer();
    const signing = gateway.signInWithProvider("google");
    await new Promise((done) => setTimeout(done, 0));
    gateway.receiveLink?.("sylf-native://auth?error=cancelled");
    await expect(signing).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("answers ping without credentials", async () => {
    const { gateway, fetch } = bearer(async () => Response.json({ ok: true }));
    expect(await gateway.ping()).toBe(true);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
  });
});

describe("the Electron renderer client", () => {
  const host = (respond: (input: string, init: RequestInit) => Response) => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init ?? {})) as unknown as typeof globalThis.fetch;
    return { fetch, gateway: createHostGateway(fetch) };
  };

  it("speaks only to its own origin", async () => {
    const { gateway, fetch } = host(() => Response.json({ user }));
    await gateway.signIn({ identifier: "a", password: "pw" });
    await gateway.transport("/api/goals");
    for (const [url] of vi.mocked(fetch).mock.calls) expect(String(url).startsWith("/api/")).toBe(true);
  });

  it("adds no credential of its own", async () => {
    const { gateway, fetch } = host(() => new Response("{}"));
    await gateway.transport("/api/goals", { headers: { Accept: "application/json" } });
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
  });

  it("restores what the host knows", async () => {
    const { gateway } = host(() => Response.json({ configured: true, signedIn: true, userId: 7 }));
    expect(await gateway.restore()).toEqual({ userId: 7 });
    expect(await gateway.configured()).toBe(true);
  });

  it("reads a host with no answer as signed out and unconfigured", async () => {
    const gateway = createHostGateway(async () => { throw new TypeError("no host"); });
    expect(await gateway.restore()).toBeNull();
    expect(await gateway.configured()).toBe(false);
  });
});
