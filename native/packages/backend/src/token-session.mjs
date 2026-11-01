// @ts-check
// The one owner of a native client's tokens (ADR 0009). Plain JavaScript on purpose: Electron's main process loads it as it is, and the
// React Native client imports the same file, so refresh has one implementation.
//
// The access token lives in memory. The refresh token lives behind a vault: Keychain or Keystore on a device, safeStorage on Electron.
// Refresh is a single flight, because a second concurrent refresh with the same token looks like theft to the server.
//
// A refresh can fail two ways, and they mean opposite things. "ended" means the server refused: this session is over, so the vault is
// cleared. "unavailable" means nobody answered: the session may be fine, so everything is kept and it is tried again later.

/** @typedef {{ accessToken: string, accessExpiresAt: number, refreshToken: string, sessionId: string, userId: number }} NativeCredentials */
/** @typedef {{ read(): Promise<string | null>, write(value: string): Promise<void>, clear(): Promise<void> }} SessionVault */
/** @typedef {"ok" | "ended" | "unavailable" | "signed-out"} RefreshResult */

/** Treats a token this close to expiry as expired, so a request does not leave with a token that dies on the way. */
const EXPIRY_MARGIN_MS = 30_000;

/** @param {unknown} value @returns {value is NativeCredentials} */
export function isNativeCredentials(value) {
  const session = /** @type {Partial<NativeCredentials> | null} */ (value);
  return !!session && typeof session.accessToken === "string" && typeof session.refreshToken === "string" && typeof session.sessionId === "string" && typeof session.accessExpiresAt === "number" && typeof session.userId === "number";
}

/**
 * @param {{ origin: string, fetch: typeof globalThis.fetch, vault: SessionVault, now?: () => number, onEnded?: () => void, requestOptions?: RequestInit }} options
 */
export function createTokenSession({ origin, fetch, vault, now = Date.now, onEnded = () => undefined, requestOptions = {} }) {
  /** @type {NativeCredentials | null} */ let current = null;
  /** @type {{ refreshToken: string, sessionId: string, userId: number } | null} */ let stored = null;
  /** @type {Promise<RefreshResult> | null} */ let refreshing = null;
  /** Raised by adopt and end, so a refresh that was already running cannot bring back a session that has since changed. */
  let generation = 0;

  const persist = async () => {
    try { if (stored) await vault.write(JSON.stringify(stored)); }
    catch { /* The session still works for as long as this process does. */ }
  };

  /** @param {NativeCredentials} credentials */
  const remember = async (credentials) => {
    current = credentials;
    stored = { refreshToken: credentials.refreshToken, sessionId: credentials.sessionId, userId: credentials.userId };
    await persist();
  };

  const forget = async () => {
    generation++;
    current = null; stored = null;
    try { await vault.clear(); } catch { /* Nothing readable is left in memory, and a stale token is refused by the server. */ }
  };

  /** @returns {Promise<RefreshResult>} */
  const exchange = async () => {
    if (!stored) return "signed-out";
    const started = generation;
    /** @type {Response} */ let response;
    try {
      response = await fetch(`${origin}/api/auth/native/token`, { ...requestOptions, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant: "refresh", refreshToken: stored.refreshToken }) });
    } catch {
      return "unavailable";
    }
    if (started !== generation) return stored ? "ok" : "signed-out";
    if (response.status === 401) { await forget(); onEnded(); return "ended"; }
    if (!response.ok) return "unavailable";
    /** @type {any} */ let body;
    try { body = await response.json(); } catch { return "unavailable"; }
    if (started !== generation) return stored ? "ok" : "signed-out";
    if (!isNativeCredentials(body?.session)) return "unavailable";
    await remember(body.session);
    return "ok";
  };

  const refresh = () => {
    if (refreshing) return refreshing;
    refreshing = exchange().finally(() => { refreshing = null; });
    return refreshing;
  };

  return {
    /** Reads the vault. No network. A vault that cannot be read, which is what a restored backup looks like, reads as signed out. */
    async restore() {
      /** @type {string | null} */ let raw = null;
      try { raw = await vault.read(); } catch { return null; }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.refreshToken !== "string" || typeof parsed?.sessionId !== "string" || typeof parsed?.userId !== "number") return null;
        stored = { refreshToken: parsed.refreshToken, sessionId: parsed.sessionId, userId: parsed.userId };
        return { userId: stored.userId, sessionId: stored.sessionId };
      } catch {
        return null;
      }
    },
    /** @param {NativeCredentials} credentials */
    async adopt(credentials) { generation++; await remember(credentials); },
    identity: () => (stored ? { userId: stored.userId, sessionId: stored.sessionId } : null),
    /** A live access token, refreshed first when it is close to expiry. Null means there is none to give, and the reason is in `reason`. */
    async accessToken() {
      if (current && current.accessExpiresAt - now() > EXPIRY_MARGIN_MS) return { token: current.accessToken, reason: /** @type {RefreshResult} */ ("ok") };
      const reason = await refresh();
      return { token: reason === "ok" ? current?.accessToken ?? null : null, reason };
    },
    /** Refreshes because the server refused `rejected`. Skips the call when another request has already replaced it. @param {string} rejected */
    async replace(rejected) {
      if (current && current.accessToken !== rejected) return /** @type {RefreshResult} */ ("ok");
      return refresh();
    },
    /** Refreshes now, whatever the access token's age. */
    refresh,
    /** Empties this device and returns the refresh token, so the caller can end the row on the server, in that order. */
    async end() {
      const refreshToken = stored?.refreshToken ?? null;
      await forget();
      return refreshToken;
    },
  };
}

/** A route that checks a password marks its refusal, so it cannot be mistaken for a token the server would not take. @param {Response} response */
async function isPasswordRefusal(response) {
  try { return (await response.clone().json())?.code === "password_incorrect"; }
  catch { return false; }
}

/**
 * A fetch that carries the bearer token, for one origin. On a 401 it refreshes once and replays, because a 401 means the server did not
 * act on the request. The exception is a route refusing a password: the session is fine, a refresh would change nothing, and sending the
 * same wrong password again would only spend the person's rate limit. `init.body` must be replayable: a string or a buffer. Never sends a cookie and never follows a redirect off the origin.
 * With nobody signed in the request goes anonymously, because some routes are public, and a protected one answers for itself.
 * @param {{ origin: string, fetch: typeof globalThis.fetch, tokens: ReturnType<typeof createTokenSession>, requestOptions?: RequestInit, unauthorized: (reason: RefreshResult) => Response }} options
 */
export function createAuthorizedFetch({ origin, fetch, tokens, requestOptions = {}, unauthorized }) {
  /** @param {string} path @param {RequestInit} init @param {string} token */
  const send = (path, init, token) => {
    const headers = new globalThis.Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${origin}${path}`, { ...requestOptions, ...init, headers, credentials: "omit" });
  };
  /** @param {string} path @param {RequestInit} [init] */
  return async (path, init = {}) => {
    const first = await tokens.accessToken();
    if (first.reason === "signed-out") return fetch(`${origin}${path}`, { ...requestOptions, ...init, credentials: "omit" });
    if (!first.token) return unauthorized(first.reason);
    const response = await send(path, init, first.token);
    if (response.status !== 401 || await isPasswordRefusal(response)) return response;
    const reason = await tokens.replace(first.token);
    if (reason !== "ok") return reason === "unavailable" ? response : unauthorized(reason);
    const next = await tokens.accessToken();
    return next.token ? send(path, init, next.token) : unauthorized(next.reason);
  };
}
