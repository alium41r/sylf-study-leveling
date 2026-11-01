// Where sign-in happens, on each kind of client. A screen and the auth model see only this interface, and no token ever crosses it.
//
// On a device the app is the client: it holds tokens itself, behind the secure session adapter, and sends bearer requests. On Electron the
// main process is the client: the renderer speaks same-origin to sylf://app/api/*, and the host adds the token. So the renderer has nothing
// to steal, and CSP, CORS and the sandbox stay exactly as they are.
import { nativeAuth, type NativeSession, type NativeUser } from "@sylf/shared/backend";
import { createAuthorizedFetch, createTokenSession } from "./token-session.mjs";
import { BackendError, errorFromResponse, errorFromThrown } from "./errors";
import type { Transport } from "./client";

export interface SignInInput { identifier: string; password: string }
export interface RegisterInput { email: string; password: string; name: string; username: string; timezone?: string }
export type OAuthProvider = (typeof nativeAuth.NATIVE_OAUTH_PROVIDERS)[number];

export interface AuthGateway {
  transport: Transport;
  /** Reads what this device holds, with no network. */
  restore(): Promise<{ userId: number } | null>;
  signIn(input: SignInInput): Promise<NativeUser>;
  register(input: RegisterInput): Promise<NativeUser>;
  /** Sign in through the system browser. Resolves once the app has its session. */
  signInWithProvider(provider: OAuthProvider): Promise<NativeUser>;
  /** Forgets this device's credentials first, and then tells the server. Never fails: signing out works offline. */
  signOut(): Promise<void>;
  /** Asks whether the server can be reached. */
  ping(): Promise<boolean>;
  /** Called with a deep link. True when it belonged to a sign-in. */
  receiveLink?(url: string): boolean;
}

/** Only https, or plain http to this machine. Anything else would send credentials in the clear. */
export function parseBackendOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return url.origin;
  } catch { /* Not a URL. */ }
  return null;
}

async function refusal(response: Response): Promise<BackendError> {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* A refusal with no JSON is still a refusal. */ }
  return errorFromResponse(response.status, body, response.headers.get("Retry-After"));
}

const toBase64Url = (bytes: Uint8Array) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const [a, b = 0, c = 0] = [bytes[index], bytes[index + 1], bytes[index + 2]];
    out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)];
    if (index + 1 < bytes.length) out += alphabet[((b & 15) << 2) | (c >> 6)];
    if (index + 2 < bytes.length) out += alphabet[c & 63];
  }
  return out;
};
const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));

/** Both halves of PKCE S256. Exported because the server's own check is what a test must meet. */
export async function createPkcePair(crypto: { getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>; sha256Hex(bytes: Uint8Array): Promise<string> }) {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: toBase64Url(fromHex(await crypto.sha256Hex(new TextEncoder().encode(verifier)))) };
}

export interface BearerGatewayOptions {
  origin: string;
  clientName: string;
  vault: { read(): Promise<string | null>; write(value: string): Promise<void>; clear(): Promise<void> };
  crypto: { getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>; sha256Hex(bytes: Uint8Array): Promise<string> };
  openUrl(url: string): Promise<unknown>;
  fetch?: typeof fetch;
  /** The session ended somewhere else: Settings, sign out everywhere, a password change. */
  onEnded?: () => void;
}

const OAUTH_WINDOW_MS = 5 * 60_000;

/** The device client (ADR 0009 decision 11). */
export function createBearerGateway({ origin, clientName, vault, crypto, openUrl, fetch: request = (input, init) => globalThis.fetch(input, init), onEnded }: BearerGatewayOptions): AuthGateway {
  const options: RequestInit = { credentials: "omit", cache: "no-store" };
  const tokens = createTokenSession({ origin, fetch: request, vault, onEnded, requestOptions: options });
  const authorized = createAuthorizedFetch({
    origin, fetch: request, tokens, requestOptions: options,
    unauthorized: (reason) => {
      if (reason === "unavailable") throw new TypeError("The session could not be refreshed.");
      return new Response(JSON.stringify({ error: "Sign in to continue.", code: "session_ended" }), { status: 401, headers: { "Content-Type": "application/json" } });
    },
  });

  async function post(path: string, body: unknown): Promise<Response> {
    try {
      return await request(`${origin}${path}`, { ...options, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (error) {
      throw errorFromThrown(error, undefined);
    }
  }

  async function open(response: Response): Promise<NativeUser> {
    if (!response.ok) throw await refusal(response);
    const parsed = nativeAuth.nativeSignInResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new BackendError("contract", "The sign-in answer did not match its contract.");
    await tokens.adopt(parsed.data.session as NativeSession);
    return parsed.data.user;
  }

  let pending: { verifier: string; resolve(user: NativeUser): void; reject(error: BackendError): void; timer: ReturnType<typeof setTimeout> } | null = null;
  const settle = () => { const flow = pending; pending = null; if (flow) clearTimeout(flow.timer); return flow; };

  return {
    transport: authorized,
    restore: () => tokens.restore().then((identity) => identity && { userId: identity.userId }),
    signIn: async ({ identifier, password }) => open(await post("/api/auth/native/login", { identifier, password, clientName })),
    register: async (input) => open(await post("/api/auth/native/register", { ...input, clientName })),
    async signInWithProvider(provider) {
      settle()?.reject(new BackendError("cancelled", "Cancelled."));
      const { verifier, challenge } = await createPkcePair(crypto);
      const query = new URLSearchParams({ provider, challenge, redirect: nativeAuth.NATIVE_APP_REDIRECT });
      return new Promise<NativeUser>((resolve, reject) => {
        const timer = setTimeout(() => settle()?.reject(new BackendError("timeout", "Sign-in took too long. Try again.")), OAUTH_WINDOW_MS);
        pending = { verifier, resolve, reject, timer };
        openUrl(`${origin}/api/auth/native/oauth/start?${query}`).catch(() => settle()?.reject(new BackendError("offline", "The browser could not be opened.")));
      });
    },
    receiveLink(url) {
      if (!url.startsWith(`${nativeAuth.NATIVE_APP_REDIRECT}?`)) return false;
      // A link that arrives with no sign-in running is not a sign-in. It may not even be from Sylf.
      const flow = settle();
      if (!flow) return true;
      const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
      const code = query.get("code");
      if (!code) { flow.reject(new BackendError(query.get("error") === "cancelled" ? "cancelled" : "invalid", "That sign-in did not finish. Try again.")); return true; }
      post("/api/auth/native/token", { grant: "oauth_code", code, verifier: flow.verifier, clientName }).then(open).then(flow.resolve, flow.reject);
      return true;
    },
    async signOut() {
      const refreshToken = await tokens.end();
      if (!refreshToken) return;
      try { await post("/api/auth/native/logout", { refreshToken }); }
      catch { /* The device has forgotten the token. The row ends by itself in 30 days, or from Settings. */ }
    },
    async ping() {
      try { return (await request(`${origin}/api/auth/native/ping`, options)).ok; }
      catch { return false; }
    },
  };
}

/** Electron's renderer (ADR 0009 decision 10). It talks to its own origin, the main process does the rest, and this file never sees a token. */
export function createHostGateway(request: typeof fetch = (input, init) => globalThis.fetch(input, init)): AuthGateway & { configured(): Promise<boolean> } {
  const call = async (path: string, init?: RequestInit) => {
    try { return await request(path, { cache: "no-store", ...init }); }
    catch (error) { throw errorFromThrown(error, undefined); }
  };
  const post = (path: string, body?: unknown) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const open = async (response: Response) => {
    if (!response.ok) throw await refusal(response);
    const parsed = nativeAuth.nativeUserSchema.safeParse(((await response.json().catch(() => null)) as { user?: unknown } | null)?.user);
    if (!parsed.success) throw new BackendError("contract", "The sign-in answer did not match its contract.");
    return parsed.data;
  };
  const session = async () => (await call("/api/auth/native/session")).json() as Promise<{ configured: boolean; signedIn: boolean; userId: number | null }>;

  return {
    transport: (path, init) => request(path, { cache: "no-store", ...init }),
    configured: () => session().then((state) => state.configured, () => false),
    restore: () => session().then((state) => (state.signedIn && state.userId ? { userId: state.userId } : null), () => null),
    signIn: async (input) => open(await post("/api/auth/native/login", input)),
    register: async (input) => open(await post("/api/auth/native/register", input)),
    signInWithProvider: async (provider) => open(await post("/api/auth/native/oauth/begin", { provider })),
    async signOut() { try { await post("/api/auth/native/logout"); } catch { /* The host forgets its copy either way. */ } },
    ping: () => call("/api/auth/native/ping").then((response) => response.ok, () => false),
  };
}
