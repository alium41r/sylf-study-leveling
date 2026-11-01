// @ts-check
// The renderer's only way to the Sylf backend (ADR 0009 decision 10). `protocol.handle` passes sylf://app/api/* here, and this process is the
// client: it holds the tokens, adds the bearer header and refreshes. The renderer talks to its own origin, so its sandbox, CSP and same-origin
// rules stay exactly as they are, CORS is never involved, and a compromised renderer has no token to steal.
//
// What goes out: paths under /api/, and public assets, to one configured origin. No cookies, and no Sec-Fetch headers. Headers are allow-listed
// both ways, so Set-Cookie cannot come back and the renderer cannot set Authorization. Responses are streamed, for Sylvie. Sign-in responses
// have their tokens taken out here: `/api/auth/native/*` is answered by this file, and nothing with a token in it reaches the renderer.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createAuthorizedFetch, createTokenSession, isNativeCredentials } from "../../../packages/backend/src/token-session.mjs";

const REQUEST_HEADERS = ["accept", "accept-language", "content-type", "if-match", "if-modified-since", "if-none-match", "range"];
const RESPONSE_HEADERS = ["accept-ranges", "content-disposition", "content-range", "content-type", "etag", "last-modified", "retry-after"];
/** Outside /api/, and public: `/audio/...` from the catalog and legacy `/uploads/...` (G-8). No credential goes with these. */
const ASSET_PREFIXES = ["/audio/", "/uploads/", "/images/"];
/** The web's cookie routes make no sense here. Only these leave the /api/auth/ namespace. */
const AUTH_PASS_THROUGH = new Set(["/api/auth/check-username", "/api/auth/logout-all", "/api/auth/verify-email/send", "/api/auth/native/ping"]);
const NATIVE_PREFIX = "/api/auth/native/";
const OAUTH_WINDOW_MS = 5 * 60_000;

const NO_BODY = new Set([204, 205, 304]);
/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const unreachable = () => json({ error: "Sylf could not be reached.", code: "backend_unreachable" }, 503);

/** @param {Request} request */
function forwardHeaders(request) {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  return headers;
}

/** @param {Response} upstream @param {string} cacheControl */
function relay(upstream, cacheControl = "no-store") {
  if (upstream.status < 200 || upstream.status > 599) return json({ error: "Sylf answered in a way the app does not expect." }, 502);
  const headers = new Headers({ "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" });
  for (const name of RESPONSE_HEADERS) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  return new Response(NO_BODY.has(upstream.status) ? null : upstream.body, { status: upstream.status, headers });
}

/** @param {Pick<Request, "method">} request */
const hasBody = (request) => !["GET", "HEAD"].includes(request.method);

/** The system browser sends its one-time code here. Listens on 127.0.0.1 only, on a port the OS picks, and for one sign-in. */
function waitForBrowser() {
  return new Promise((resolve, reject) => {
    /** @type {(value: { code: string | null, error: string | null }) => void} */ let deliver;
    const result = new Promise((done) => { deliver = done; });
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/auth") { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end("<!doctype html><meta charset=utf-8><title>Sylf</title><p>You can close this tab and return to Sylf.</p>");
      deliver({ code: url.searchParams.get("code"), error: url.searchParams.get("error") });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ port: typeof address === "object" && address ? address.port : 0, result, close: () => { server.close(); server.closeAllConnections(); } });
    });
  });
}

/**
 * @param {{
 *   origin: string | null,
 *   fetch: typeof globalThis.fetch,
 *   vault: { read(): Promise<string | null>, write(value: string): Promise<void>, clear(): Promise<void> },
 *   clientName: string,
 *   openExternal?: (url: string) => Promise<unknown>,
 *   listen?: typeof waitForBrowser,
 *   log?: (event: string) => void,
 * }} options
 */
export function createBackendProxy({ origin, fetch, vault, clientName, openExternal = async () => undefined, listen = waitForBrowser, log = () => undefined }) {
  /** @type {RequestInit} */
  const outbound = { credentials: "omit", cache: "no-store", redirect: "manual" };
  const tokens = origin ? createTokenSession({ origin, fetch, vault, requestOptions: outbound, onEnded: () => log("session-ended") }) : null;
  const authorized = origin && tokens ? createAuthorizedFetch({
    origin, fetch, tokens, requestOptions: outbound,
    unauthorized: (reason) => (reason === "unavailable" ? unreachable() : json({ error: "Sign in to continue.", code: "session_ended" }, 401)),
  }) : null;
  const restored = tokens ? tokens.restore() : Promise.resolve(null);

  /** Sends a sign-in upstream and keeps the session. The renderer gets the person, and never the tokens. @param {string} path @param {unknown} body */
  async function signIn(path, body) {
    /** @type {Response} */ let upstream;
    try {
      upstream = await fetch(`${origin}${path}`, { ...outbound, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      return unreachable();
    }
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) return json({ error: payload?.error, code: payload?.code }, upstream.status);
    if (!isNativeCredentials(payload?.session) || !tokens) return json({ error: "Sylf answered in a way the app does not expect." }, 502);
    await tokens.adopt(payload.session);
    log("signed-in");
    return json({ user: payload.user, userId: payload.session.userId });
  }

  /** @param {string} provider */
  async function signInWithProvider(provider) {
    if (typeof provider !== "string" || !/^[a-z]+$/.test(provider)) return json({ error: "Invalid data", code: "invalid_request" }, 400);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    /** @type {any} */ let browser;
    try { browser = await listen(); } catch { return json({ error: "Sign-in could not start." }, 500); }
    /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
    try {
      const query = new URLSearchParams({ provider, challenge, redirect: `http://127.0.0.1:${browser.port}/auth` });
      await openExternal(`${origin}/api/auth/native/oauth/start?${query}`);
      const expired = new Promise((done) => { timer = setTimeout(() => done({ code: null, error: "expired" }), OAUTH_WINDOW_MS); });
      const { code, error } = await Promise.race([browser.result, expired]);
      if (!code) return json({ error: error === "cancelled" ? "Sign-in was cancelled." : "That sign-in did not finish. Try again.", code: "invalid_request" }, 400);
      return await signIn("/api/auth/native/token", { grant: "oauth_code", code, verifier, clientName });
    } finally {
      clearTimeout(timer);
      browser.close();
    }
  }

  /** Answers the namespace this file owns. @param {string} path @param {Request} request */
  async function native(path, request) {
    const body = await request.json().catch(() => ({}));
    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    if (path === `${NATIVE_PREFIX}login`) return signIn(path, { identifier: body?.identifier, password: body?.password, clientName });
    if (path === `${NATIVE_PREFIX}register`) return signIn(path, { ...body, clientName });
    if (path === `${NATIVE_PREFIX}oauth/begin`) return signInWithProvider(body?.provider);
    if (path === `${NATIVE_PREFIX}logout`) {
      const refreshToken = await tokens?.end();
      log("signed-out");
      // Forgetting comes first, so signing out works offline. The server's copy then ends by this call, or in 30 days.
      if (refreshToken) await fetch(`${origin}${path}`, { ...outbound, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
      return json({ success: true });
    }
    // Refresh and code exchange belong to this process. The renderer has nothing to present, and no reason to ask.
    return json({ error: "Not found" }, 404);
  }

  /** @param {Request} request @param {URL} url */
  async function forward(request, url) {
    const path = `${url.pathname}${url.search}`;
    const body = hasBody(request) ? await request.arrayBuffer() : undefined;
    try {
      const upstream = await /** @type {NonNullable<typeof authorized>} */ (authorized)(path, { method: request.method, headers: forwardHeaders(request), ...(body ? { body } : {}) });
      if (url.pathname === "/api/auth/logout-all" && upstream.ok) await tokens?.end();
      return relay(upstream);
    } catch {
      return unreachable();
    }
  }

  return {
    /** Whether this pathname belongs here rather than to the web build. @param {string} pathname */
    handles: (pathname) => pathname === "/api" || pathname.startsWith("/api/") || ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
    /** @param {Request} request */
    async handle(request) {
      const url = new URL(request.url);
      const { pathname } = url;
      await restored;
      if (pathname === `${NATIVE_PREFIX}session`) {
        const identity = tokens?.identity() ?? null;
        return json({ configured: origin !== null, signedIn: identity !== null, userId: identity?.userId ?? null });
      }
      if (!origin) return json({ error: "This build is not connected to Sylf.", code: "not_configured" }, 503);
      if (new URL(pathname, origin).origin !== origin) return json({ error: "Not found" }, 404);
      if (!pathname.startsWith("/api/")) {
        if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Not found" }, 404);
        try { return relay(await fetch(`${origin}${pathname}`, { method: request.method, headers: forwardHeaders(request), credentials: "omit", redirect: "follow" }), "private, max-age=3600"); }
        catch { return unreachable(); }
      }
      if (pathname.startsWith("/api/auth/") && !AUTH_PASS_THROUGH.has(pathname)) {
        return pathname.startsWith(NATIVE_PREFIX) ? native(pathname, request) : json({ error: "Not found" }, 404);
      }
      return forward(request, url);
    },
    /** For checks: a fresh refresh, without waiting for the access token to age. */
    refreshNow: () => tokens?.refresh() ?? Promise.resolve("signed-out"),
  };
}

/** Only https, or plain http to this machine. Anything else would send the session in the clear. @param {string | undefined} value */
export function parseBackendOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return url.origin;
  throw new Error(`Refusing a backend origin that is neither https nor this machine: ${value}`);
}
