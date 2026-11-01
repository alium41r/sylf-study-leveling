// The typed client (ADR 0009). Every request a Sylf Native screen makes passes through here, so errors, timeouts, cancellation, retries and
// deduplication have one owner. Responses are parsed at this boundary, and a screen only sees a value that matched its contract.
//
// Rules. Reads retry on what could be momentary. Mutations never retry on their own, because a timed-out write has an unknown outcome and
// only the caller knows whether replaying it is safe: TimerSync does, through its durable identities. Timeouts come from lib/api-transport,
// which also bounds the time spent reading the body.
import type { z } from "zod";
import { backend as shared } from "@sylf/shared/backend";
import { BackendError, errorFromResponse, errorFromThrown } from "./errors";
import type { Connectivity } from "./connectivity";

/** Sends one request. Bearer on a device, same-origin through the host on Electron. A path always starts with `/`. */
export type Transport = (path: string, init?: RequestInit) => Promise<Response>;

export interface BackendClientOptions {
  transport: Transport | null;
  connectivity?: Connectivity;
  /** Called when the session is over: the refresh was refused, not merely this one request. */
  onSignedOut?: () => void;
  /** Turns `/audio/rain.mp3` into something an image or player can load (G-8). */
  assetUrl?: (path: string) => string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface ReadOptions { signal?: AbortSignal; timeoutMs?: number; retries?: number }
export interface SendOptions<T> { signal?: AbortSignal; timeoutMs?: number; body?: unknown; schema?: z.ZodType<T>; headers?: Record<string, string> }

export interface BackendClient {
  readonly configured: boolean;
  /** Typed like fetch, for owners that handle their own replay: TimerSync and SessionProtocolV2. It authenticates and never retries. */
  fetch: typeof fetch;
  get<T>(path: string, schema: z.ZodType<T>, options?: ReadOptions): Promise<T>;
  send<T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, options?: SendOptions<T>): Promise<T>;
  /** Reads a streaming response chunk by chunk, for Sylvie. The deadline covers the whole stream. */
  stream(path: string, init: RequestInit & { timeoutMs?: number }, onChunk: (text: string) => void): Promise<void>;
  /** A relative `/audio/...` or `/uploads/...` URL, made loadable. Absolute URLs pass through. */
  assetUrl(path: string): string;
  /** The account changed. Cancels every shared read, so the next person cannot join one that belongs to the last. */
  reset(): void;
}

const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 120_000;
const RETRY_BASE_MS = 300;
const RETRY_AFTER_LIMIT_MS = 5_000;

async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { unparsed: true }; }
}

/** One network read shared by everyone asking the same thing, cancelled only when the last of them walks away. */
interface Flight { promise: Promise<unknown>; controller: AbortController; waiters: number }

export function createBackendClient({ transport, connectivity, onSignedOut, assetUrl = (path) => path, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), random = Math.random }: BackendClientOptions): BackendClient {
  const flights = new Map<string, Flight>();

  const refused = (): BackendError => new BackendError("not-configured", "This build is not connected to Sylf yet.");

  /** One attempt, parsed and classified. */
  async function attempt(path: string, init: RequestInit, timeoutMs: number, signal: AbortSignal | undefined): Promise<unknown> {
    if (!transport) throw refused();
    try {
      const outcome = await shared.consumeResponseWithTimeout(transport as typeof fetch, path, { ...init, ...(signal ? { signal } : {}) }, timeoutMs, async (response) => ({ ok: response.ok, status: response.status, retryAfter: response.headers.get("Retry-After"), body: await bodyOf(response) }));
      if (outcome.ok) { connectivity?.report(true); return outcome.body; }
      const error = errorFromResponse(outcome.status, outcome.body, outcome.retryAfter);
      if (error.kind !== "offline") connectivity?.report(true);
      if (error.detail.code === "session_ended") onSignedOut?.();
      throw error;
    } catch (thrown) {
      const error = errorFromThrown(thrown, signal);
      if (error.kind === "offline") connectivity?.report(false);
      throw error;
    }
  }

  function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new BackendError("contract", `The answer from ${path} did not match its contract.`);
  }

  async function read(path: string, timeoutMs: number, retries: number, signal: AbortSignal): Promise<unknown> {
    for (let tried = 0; ; tried++) {
      try {
        return await attempt(path, { method: "GET" }, timeoutMs, signal);
      } catch (error) {
        const failure = error as BackendError;
        const wait = failure.detail.retryAfterMs ?? RETRY_BASE_MS * 2 ** tried * (0.75 + random() / 2);
        const worthIt = failure.transient && !signal.aborted && tried < retries && wait <= RETRY_AFTER_LIMIT_MS && (failure.kind !== "offline" || connectivity?.state() !== "offline");
        if (!worthIt) throw failure;
        await sleep(wait);
      }
    }
  }

  function join<T>(path: string, timeoutMs: number, retries: number, signal: AbortSignal | undefined): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new BackendError("cancelled", "Cancelled."));
    let flight = flights.get(path);
    if (!flight) {
      const controller = new AbortController();
      const created: Flight = { controller, waiters: 0, promise: read(path, timeoutMs, retries, controller.signal).finally(() => { if (flights.get(path) === created) flights.delete(path); }) };
      flight = created;
      flights.set(path, created);
      created.promise.catch(() => undefined);
    }
    const shared_ = flight;
    shared_.waiters++;
    if (!signal) return shared_.promise;
    return new Promise<T>((resolve, reject) => {
      const leave = () => {
        signal.removeEventListener("abort", leave);
        reject(new BackendError("cancelled", "Cancelled."));
        if (--shared_.waiters === 0) { shared_.controller.abort(); if (flights.get(path) === shared_) flights.delete(path); }
      };
      signal.addEventListener("abort", leave, { once: true });
      shared_.promise.then((value) => { signal.removeEventListener("abort", leave); resolve(value as T); }, (error) => { signal.removeEventListener("abort", leave); reject(error); });
    });
  }

  return {
    configured: transport !== null,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!transport) return Promise.reject(refused());
      // The journal handles its own replay, and it is also how a device learns it has lost the server while nothing else is asking.
      return transport(String(input), init).then(
        (response) => {
          if (response.status !== 503 && response.status !== 401) { connectivity?.report(true); return response; }
          // Both of these are read from the body: a journal request can be the first thing to learn that the server is gone, or that the session is over.
          void response.clone().json().then((body) => {
            const code = (body as { code?: unknown } | null)?.code;
            if (code === "backend_unreachable") connectivity?.report(false);
            else if (code === "session_ended") onSignedOut?.();
          }, () => undefined);
          return response;
        },
        (error: unknown) => { if ((error as { name?: string } | null)?.name !== "AbortError") connectivity?.report(false); throw error; },
      );
    }) as typeof fetch,
    async get(path, schema, options = {}) {
      return parse(schema, await join(path, options.timeoutMs ?? READ_TIMEOUT_MS, options.retries ?? 2, options.signal), path);
    },
    async send(method, path, options = {}) {
      const { body, schema, signal, timeoutMs = WRITE_TIMEOUT_MS, headers } = options;
      const value = await attempt(path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, timeoutMs, signal);
      return (schema ? parse(schema, value, path) : value) as never;
    },
    async stream(path, { timeoutMs = STREAM_TIMEOUT_MS, ...init }, onChunk) {
      if (!transport) throw refused();
      try {
        await shared.consumeResponseWithTimeout(transport as typeof fetch, path, init, timeoutMs, async (response, signal) => {
          if (!response.ok) throw errorFromResponse(response.status, await bodyOf(response), response.headers.get("Retry-After"));
          connectivity?.report(true);
          const reader = response.body?.getReader();
          if (!reader) { onChunk(await response.text()); return; }
          const decoder = new TextDecoder();
          for (;;) {
            if (signal.aborted) { await reader.cancel(); return; }
            const { done, value } = await reader.read();
            if (done) return;
            onChunk(decoder.decode(value, { stream: true }));
          }
        });
      } catch (thrown) {
        const error = errorFromThrown(thrown, init.signal ?? undefined);
        if (error.kind === "offline") connectivity?.report(false);
        throw error;
      }
    },
    assetUrl: (path) => (/^(https?:|data:|blob:)/.test(path) ? path : assetUrl(path.startsWith("/") ? path : `/${path}`)),
    reset() { flights.forEach((flight) => flight.controller.abort()); flights.clear(); },
  };
}
